/**
 * Time formatting and arithmetic, all relative to the demo clock.
 *
 * Deliberately hand-written rather than pulling `date-fns` or `dayjs`: it keeps
 * the fixed-clock rule explicit and auditable, and the surface needed here is
 * small. See ADR D-001 and the dependency notes in docs/IMPLEMENTATION_PLAN.md.
 */
import { DAY_MS, DEMO_NOW_MS, HOUR_MS, MINUTE_MS, toMs, type Iso } from './clock';

/** Whole days between two instants (b - a), truncated toward zero. */
export function daysBetween(a: Iso, b: Iso): number {
  return Math.trunc((toMs(b) - toMs(a)) / DAY_MS);
}

/** Whole hours between two instants (b - a), truncated toward zero. */
export function hoursBetween(a: Iso, b: Iso): number {
  return Math.trunc((toMs(b) - toMs(a)) / HOUR_MS);
}

/** Milliseconds between two instants (b - a). */
export function msBetween(a: Iso, b: Iso): number {
  return toMs(b) - toMs(a);
}

/** Days elapsed from `iso` up to the demo present. Negative for future instants. */
export function daysSince(iso: Iso, nowMs: number = DEMO_NOW_MS): number {
  return Math.trunc((nowMs - toMs(iso)) / DAY_MS);
}

/** `true` when `iso` is strictly before `nowMs`. */
export function isPast(iso: Iso, nowMs: number = DEMO_NOW_MS): boolean {
  return toMs(iso) < nowMs;
}

/** The UTC calendar day key, `YYYY-MM-DD`. Used to bucket events for trend series. */
export function dayKey(iso: Iso): string {
  return iso.slice(0, 10);
}

/** Inclusive list of `YYYY-MM-DD` keys spanning two instants, oldest first. */
export function dayKeyRange(from: Iso, to: Iso): string[] {
  const start = Math.floor(toMs(from) / DAY_MS) * DAY_MS;
  const end = Math.floor(toMs(to) / DAY_MS) * DAY_MS;
  if (end < start) return [];
  const keys: string[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    keys.push(new Date(t).toISOString().slice(0, 10));
  }
  return keys;
}

/**
 * Compact relative label against the demo present, e.g. `4d ago`, `in 3h`, `now`.
 * Rendered wherever a wall-clock reading would be misleading.
 */
export function relativeLabel(iso: Iso, nowMs: number = DEMO_NOW_MS): string {
  const delta = nowMs - toMs(iso);
  const abs = Math.abs(delta);
  const suffix = delta >= 0 ? ' ago' : '';
  const prefix = delta >= 0 ? '' : 'in ';

  if (abs < MINUTE_MS) return 'now';
  if (abs < HOUR_MS) return `${prefix}${Math.floor(abs / MINUTE_MS)}m${suffix}`;
  if (abs < DAY_MS) return `${prefix}${Math.floor(abs / HOUR_MS)}h${suffix}`;
  if (abs < 30 * DAY_MS) return `${prefix}${Math.floor(abs / DAY_MS)}d${suffix}`;
  return `${prefix}${Math.floor(abs / (30 * DAY_MS))}mo${suffix}`;
}

/** Absolute UTC label, e.g. `16 Mar 2026, 09:00`. Paired with relative labels in dense views. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function absoluteLabel(iso: Iso): string {
  const d = new Date(toMs(iso));
  const month = MONTHS[d.getUTCMonth()] ?? '???';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}, ${hh}:${mm}`;
}

/** Short date label for chart axes, e.g. `16 Mar`. */
export function shortDateLabel(dayKeyValue: string): string {
  const [, m, d] = dayKeyValue.split('-');
  const monthIndex = Number(m) - 1;
  return `${Number(d)} ${MONTHS[monthIndex] ?? '???'}`;
}

/**
 * Duration label for elapsed spans such as time-to-detection, e.g. `6d 4h`.
 * Always reads as a magnitude; direction is the caller's concern.
 */
export function durationLabel(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < MINUTE_MS) return '<1m';
  if (abs < HOUR_MS) return `${Math.floor(abs / MINUTE_MS)}m`;
  if (abs < DAY_MS) {
    const h = Math.floor(abs / HOUR_MS);
    const m = Math.floor((abs % HOUR_MS) / MINUTE_MS);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(abs / DAY_MS);
  const h = Math.floor((abs % DAY_MS) / HOUR_MS);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}
