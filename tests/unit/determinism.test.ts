/**
 * AC-1.3 / AC-1.8 — determinism primitives.
 *
 * These lock the three guarantees the whole prototype rests on: a fixed clock,
 * counter-based ids, and a seeded PRNG. If any of these regress, Reset Demo stops
 * restoring a known state and every metric snapshot becomes meaningless.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DAY_MS,
  DEMO_NOW,
  DEMO_NOW_MS,
  TICK_MS,
  asIso,
  createDemoClock,
  isoOffset,
  toMs,
} from '@/domain/clock';
import { createIdFactory, formatId } from '@/domain/ids';
import { RELAY_SEED, mulberry32 } from '@/data/prng';
import { dayKeyRange, daysSince, durationLabel, relativeLabel } from '@/domain/time';

describe('AC-1.3 demo clock', () => {
  it('anchors the demo at a fixed instant', () => {
    expect(DEMO_NOW).toBe('2026-09-14T17:00:00.000Z');
    expect(toMs(DEMO_NOW)).toBe(DEMO_NOW_MS);
  });

  it('is monotonic and advances by a fixed tick', () => {
    const clock = createDemoClock();
    expect(clock.now()).toBe(DEMO_NOW);

    clock.tick();
    expect(clock.nowMs()).toBe(DEMO_NOW_MS + TICK_MS);

    clock.tick();
    expect(clock.elapsed()).toBe(2 * TICK_MS);
  });

  it('reads stably until explicitly advanced', () => {
    const clock = createDemoClock();
    expect(clock.now()).toBe(clock.now());
  });

  it('produces identical timelines across two independent runs', () => {
    const run = () => {
      const clock = createDemoClock();
      return Array.from({ length: 25 }, () => clock.tick());
    };
    expect(run()).toEqual(run());
  });

  it('authors seed timestamps as offsets from the demo present', () => {
    expect(isoOffset({ days: -6 })).toBe('2026-09-08T17:00:00.000Z');
    expect(isoOffset({ days: -1, hours: 2, minutes: 30 })).toBe('2026-09-13T19:30:00.000Z');
    expect(toMs(isoOffset({ days: -90 }))).toBe(DEMO_NOW_MS - 90 * DAY_MS);
  });

  it('rejects malformed instants rather than silently producing NaN', () => {
    expect(() => asIso('not-a-date')).toThrow(/valid ISO-8601/);
    expect(() => createDemoClock().advance(Number.NaN)).toThrow(/finite offset/);
  });
});

describe('time helpers read against the demo present', () => {
  it('computes staleness in whole days', () => {
    expect(daysSince(isoOffset({ days: -91 }))).toBe(91);
    expect(daysSince(DEMO_NOW)).toBe(0);
  });

  it('labels relative and elapsed times without touching the wall clock', () => {
    expect(relativeLabel(isoOffset({ days: -4 }))).toBe('4d ago');
    expect(relativeLabel(isoOffset({ hours: 3 }))).toBe('in 3h');
    expect(relativeLabel(DEMO_NOW)).toBe('now');
    expect(durationLabel(6 * DAY_MS + 4 * 3_600_000)).toBe('6d 4h');
  });

  it('builds inclusive day ranges for trend buckets', () => {
    const keys = dayKeyRange(isoOffset({ days: -3 }), DEMO_NOW);
    expect(keys).toEqual(['2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14']);
  });
});

describe('AC-1.3 id factory', () => {
  it('mints zero-padded, readable, sequential ids', () => {
    const ids = createIdFactory();
    expect(ids.next('case')).toBe('CASE-0001');
    expect(ids.next('case')).toBe('CASE-0002');
    expect(ids.next('event')).toBe('EVT-00001');
    expect(ids.next('issue')).toBe('ENG-0001');
  });

  it('produces the same ids on a second run', () => {
    const run = () => {
      const ids = createIdFactory();
      return [ids.next('case'), ids.next('case'), ids.next('cluster')];
    };
    expect(run()).toEqual(run());
  });

  it('restores counters so a rehydrated session keeps minting forward', () => {
    const ids = createIdFactory();
    ids.next('case');
    ids.next('case');
    const snapshot = ids.snapshot();

    const restored = createIdFactory();
    restored.restore(snapshot);
    expect(restored.next('case')).toBe('CASE-0003');
  });

  it('resets counters back to the start', () => {
    const ids = createIdFactory();
    ids.next('case');
    ids.reset();
    expect(ids.next('case')).toBe('CASE-0001');
    expect(ids.count('case')).toBe(1);
  });

  it('formats known seed ids without advancing a counter', () => {
    expect(formatId('article', 104)).toBe('KB-0104');
    expect(formatId('case', 13)).toBe('CASE-0013');
  });
});

describe('AC-1.3 seeded prng', () => {
  it('replays an identical sequence for a given seed', () => {
    const a = mulberry32(RELAY_SEED);
    const b = mulberry32(RELAY_SEED);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('diverges for a different seed', () => {
    const a = mulberry32(RELAY_SEED);
    const b = mulberry32(RELAY_SEED + 1);
    expect(a.next()).not.toBe(b.next());
  });

  it('stays within requested bounds', () => {
    const rng = mulberry32(RELAY_SEED);
    for (let i = 0; i < 500; i++) {
      const n = rng.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
      expect(Number.isInteger(n)).toBe(true);
      expect(rng.next()).toBeLessThan(1);
    }
  });

  it('respects relative weights', () => {
    const rng = mulberry32(RELAY_SEED);
    const counts = { common: 0, rare: 0 };
    for (let i = 0; i < 2_000; i++) {
      counts[rng.weighted([['common', 9] as const, ['rare', 1] as const])] += 1;
    }
    expect(counts.common).toBeGreaterThan(counts.rare * 4);
    expect(counts.rare).toBeGreaterThan(0);
  });

  it('shuffles without mutating the input and reproducibly', () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
    const first = mulberry32(RELAY_SEED).shuffle(input);
    const second = mulberry32(RELAY_SEED).shuffle(input);
    expect(first).toEqual(second);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...first].sort((x, y) => x - y)).toEqual([...input]);
  });

  it('rejects degenerate inputs rather than returning undefined', () => {
    const rng = mulberry32(RELAY_SEED);
    expect(() => rng.pick([])).toThrow(/non-empty/);
    expect(() => rng.weighted([])).toThrow(/non-empty/);
    expect(() => rng.weighted([['a', 0] as const])).toThrow(/positive weight/);
    expect(() => rng.int(9, 2)).toThrow(/max must be/);
  });
});

/**
 * AC-1.8 — the determinism rules are only real if nothing in the pure layers can
 * reach for wall-clock time or entropy. Lint enforces this during development;
 * this test makes it a release gate too.
 */
describe('AC-1.8 pure layers contain no non-deterministic sources', () => {
  const BANNED = [
    { pattern: /\bMath\.random\s*\(/, label: 'Math.random()' },
    { pattern: /\bcrypto\.randomUUID\s*\(/, label: 'crypto.randomUUID()' },
    { pattern: /\bDate\.now\s*\(/, label: 'Date.now()' },
    { pattern: /\bfrom\s+['"](uuid|nanoid)['"]/, label: 'uuid/nanoid import' },
    // `new Date(ms)` is deterministic; only the argless form reads the wall clock.
    { pattern: /\bnew Date\s*\(\s*\)/, label: 'argless new Date()' },
  ];

  /**
   * Comments legitimately name the banned constructs when documenting the rule,
   * so they are stripped before scanning. Without this the modules that explain
   * the determinism policy would be flagged for describing it.
   */
  const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const collect = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) collect(full, out);
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
  };

  const files = [
    ...collect(join(process.cwd(), 'src', 'domain')),
    ...collect(join(process.cwd(), 'src', 'data')),
  ];

  it('scans a non-trivial number of files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(BANNED)('never calls $label', ({ pattern, label }) => {
    const offenders = files
      .filter((f) => pattern.test(stripComments(readFileSync(f, 'utf8'))))
      .map((f) => f.replace(process.cwd(), '').replace(/\\/g, '/').replace(/^\//, ''));
    expect(offenders, `${label} found in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('still detects a planted violation, so the scan is not vacuous', () => {
    const planted = stripComments('const x = Math.random(); // seeded? no');
    expect(/\bMath\.random\s*\(/.test(planted)).toBe(true);

    const documented = stripComments('// Math.random() is banned in this layer.');
    expect(/\bMath\.random\s*\(/.test(documented)).toBe(false);
  });
});
