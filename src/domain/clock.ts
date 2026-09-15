/**
 * Deterministic time.
 *
 * The prototype shows 90-day demand trends, SLA countdowns, article staleness and
 * time-to-detection, while also guaranteeing that Reset Demo restores a
 * byte-identical state and that metric snapshots stay valid. Wall-clock time
 * defeats all of that, so the entire application reads time from here.
 *
 * See ADR D-001. No `Date.now()` or `new Date()` may appear anywhere under
 * `src/domain/**` or `src/data/**`.
 */

/** Branded ISO-8601 instant. Only this module may mint one. */
export type Iso = string & { readonly __brand: 'Iso' };

/** Milliseconds since the Unix epoch, branded so offsets are not mistaken for instants. */
export type Millis = number & { readonly __brand: 'Millis' };

/**
 * The fixed "now" the whole demo is authored against: 2026-09-14T17:00:00.000Z,
 * late on a Monday afternoon. The hour matters: it leaves a full working day
 * behind "now", so same-day cases exist and the queue shows a realistic spread
 * of service-level states rather than everything already breached. Seeded records are expressed as offsets from this instant.
 *
 * RE-ANCHORING: to make the demo read as current at a later date, change this one
 * constant and the matching assertion in tests/unit/determinism.test.ts. Nothing
 * else hard-codes a date - all seed data is authored as offsets via isoOffset().
 */
export const DEMO_NOW_MS = Date.UTC(2026, 8, 14, 17, 0, 0, 0);

export const DEMO_NOW: Iso = new Date(DEMO_NOW_MS).toISOString() as Iso;

/** Every recorded event advances the demo clock by this much. */
export const TICK_MS = 1_000;

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/**
 * A monotonic clock anchored at {@link DEMO_NOW}.
 *
 * Reads are stable: `now()` returns the same instant until something advances the
 * clock, so a batch of records written together share a timestamp unless the
 * caller explicitly ticks between them.
 */
export interface DemoClock {
  /** The current demo instant. */
  now(): Iso;
  /** The current demo instant in milliseconds. */
  nowMs(): number;
  /** Advance by one tick and return the new instant. */
  tick(): Iso;
  /** Advance by an explicit number of milliseconds and return the new instant. */
  advance(ms: number): Iso;
  /** Milliseconds elapsed since {@link DEMO_NOW}. */
  elapsed(): number;
}

export function createDemoClock(startMs: number = DEMO_NOW_MS): DemoClock {
  let cursor = startMs;
  return {
    now: () => new Date(cursor).toISOString() as Iso,
    nowMs: () => cursor,
    tick() {
      cursor += TICK_MS;
      return new Date(cursor).toISOString() as Iso;
    },
    advance(ms: number) {
      if (!Number.isFinite(ms)) throw new Error(`advance() requires a finite offset, received ${ms}`);
      cursor += ms;
      return new Date(cursor).toISOString() as Iso;
    },
    elapsed: () => cursor - startMs,
  };
}

/**
 * Build an instant at a fixed offset from {@link DEMO_NOW}. Negative values are
 * in the past, which is how virtually all seed data is authored.
 *
 * @example isoOffset({ days: -6, hours: 2 })  // six days ago, 11:00 UTC
 */
export function isoOffset(offset: {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}): Iso {
  const ms =
    DEMO_NOW_MS +
    (offset.days ?? 0) * DAY_MS +
    (offset.hours ?? 0) * HOUR_MS +
    (offset.minutes ?? 0) * MINUTE_MS +
    (offset.seconds ?? 0) * 1_000;
  return new Date(ms).toISOString() as Iso;
}

/** The hour of the demo present, used to place seed records inside a working day. */
export const DEMO_NOW_HOUR = 17;

/**
 * An instant `daysAgo` days before the demo present, at a given wall hour.
 *
 * Seed data is authored in working-day terms ("two days ago at 10am"), which is
 * not the same as an offset from the demo present. Doing that arithmetic by hand
 * is how records end up at 01:00.
 */
export function atHour(daysAgo: number, hour: number, minute = 0): Iso {
  return isoOffset({ days: -daysAgo, hours: hour - DEMO_NOW_HOUR, minutes: minute });
}

/** Parse a branded instant back to milliseconds. */
export function toMs(iso: Iso): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Not a valid instant: ${iso}`);
  return ms;
}

/** Brand a millisecond value as an instant. The only sanctioned ms -> Iso path. */
export function fromMs(ms: number): Iso {
  if (!Number.isFinite(ms)) throw new Error(`fromMs() requires a finite value, received ${ms}`);
  return new Date(ms).toISOString() as Iso;
}

/** Assert-and-brand an externally supplied ISO string (seed authoring, tests). */
export function asIso(value: string): Iso {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`Not a valid ISO-8601 instant: ${value}`);
  return new Date(ms).toISOString() as Iso;
}
