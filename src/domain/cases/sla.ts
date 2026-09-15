/**
 * Service-level state.
 *
 * Targets are set once at case creation from urgency, then never recalculated —
 * a case whose urgency is raised later keeps the clock it was created under,
 * which is how real service desks avoid resetting a breach by re-triaging.
 *
 * Everything here reads the demo clock, so SLA states are stable across runs.
 */
import { DEMO_NOW_MS, HOUR_MS, fromMs, toMs, type Iso } from '../clock';
import { SLA_AT_RISK_FRACTION, SLA_HOURS_BY_URGENCY, type SlaState, type Urgency } from '../types';

/** The deadline for a case created at `createdAt` with the given urgency. */
export function slaTargetFor(createdAt: Iso, urgency: Urgency): Iso {
  return fromMs(toMs(createdAt) + SLA_HOURS_BY_URGENCY[urgency] * HOUR_MS);
}

export interface SlaReading {
  state: SlaState;
  /** Milliseconds until the target; negative once breached. */
  remainingMs: number;
  /** 0-1 of the window still available; 0 once breached. */
  remainingFraction: number;
  totalMs: number;
}

/**
 * Read SLA state at the demo present.
 *
 * Resolved and closed cases should not be passed here — a finished case has no
 * live clock, and callers render its outcome instead.
 */
export function readSla(createdAt: Iso, slaTargetAt: Iso, nowMs: number = DEMO_NOW_MS): SlaReading {
  const start = toMs(createdAt);
  const target = toMs(slaTargetAt);
  const totalMs = Math.max(1, target - start);
  const remainingMs = target - nowMs;
  const remainingFraction = Math.max(0, Math.min(1, remainingMs / totalMs));

  let state: SlaState;
  if (remainingMs <= 0) state = 'breached';
  else if (remainingFraction < SLA_AT_RISK_FRACTION) state = 'at_risk';
  else state = 'on_track';

  return { state, remainingMs, remainingFraction, totalMs };
}
