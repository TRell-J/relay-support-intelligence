'use client';

/**
 * Shared operational primitives.
 *
 * State is never encoded by color alone — every chip carries a label, and the
 * SLA chip carries a shape cue too. That is a WCAG requirement, and it is also
 * simply how an operations console stays readable on a projector or a bad
 * monitor (AC-7.5).
 */
import { LABELS, type CaseStatus, type ConfidenceBand, type SlaState, type Urgency } from '@/domain/types';

const CHIP_BASE =
  'inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 text-[11px] leading-none whitespace-nowrap';

const STATUS_TONE: Record<CaseStatus, string> = {
  new: 'border-info/30 bg-info-muted text-info',
  triage: 'border-info/30 bg-info-muted text-info',
  in_progress: 'border-accent/30 bg-accent-muted text-accent-fg',
  waiting_on_employee: 'border-caution/30 bg-caution-muted text-caution',
  waiting_on_engineering: 'border-caution/30 bg-caution-muted text-caution',
  resolved: 'border-positive/30 bg-positive-muted text-positive',
  closed: 'border-border text-fg-subtle',
};

export function StatusChip({ status }: { status: CaseStatus }) {
  return (
    <span className={`${CHIP_BASE} ${STATUS_TONE[status]}`} data-testid={`status-${status}`}>
      {LABELS.caseStatus[status]}
    </span>
  );
}

const SLA_TONE: Record<SlaState, string> = {
  on_track: 'border-border text-fg-muted',
  at_risk: 'border-caution/40 bg-caution-muted text-caution',
  breached: 'border-critical/40 bg-critical-muted text-critical',
};

/** The glyph is the redundant cue; the label carries the meaning. */
const SLA_GLYPH: Record<SlaState, string> = { on_track: '', at_risk: '▲', breached: '■' };

export function SlaChip({ state, detail }: { state: SlaState; detail?: string }) {
  return (
    <span className={`${CHIP_BASE} ${SLA_TONE[state]}`} data-testid={`sla-${state}`}>
      {SLA_GLYPH[state] && <span aria-hidden>{SLA_GLYPH[state]}</span>}
      {LABELS.slaState[state]}
      {detail && <span className="opacity-70">{detail}</span>}
    </span>
  );
}

const URGENCY_TONE: Record<Urgency, string> = {
  low: 'text-fg-subtle',
  normal: 'text-fg-muted',
  high: 'text-caution',
  critical: 'text-critical',
};

export function UrgencyLabel({ urgency }: { urgency: Urgency }) {
  return (
    <span className={`text-[12px] ${URGENCY_TONE[urgency]}`} data-testid={`urgency-${urgency}`}>
      {LABELS.urgency[urgency]}
    </span>
  );
}

const BAND_TONE: Record<ConfidenceBand, string> = {
  high: 'text-positive',
  medium: 'text-caution',
  low: 'text-critical',
};

export function ConfidenceCell({ band, value }: { band: ConfidenceBand | null; value: number | null }) {
  if (band === null || value === null) {
    return <span className="meta">—</span>;
  }
  return (
    <span className={`num text-[12px] ${BAND_TONE[band]}`} title={`${band} confidence at handoff`}>
      {value.toFixed(2)}
    </span>
  );
}

/** Completeness as a figure plus a bar, because the number is the point. */
export function CompletenessCell({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = value === 1 ? 'bg-positive' : value >= 0.67 ? 'bg-caution' : 'bg-critical';
  return (
    <span className="flex items-center justify-end gap-1.5" title={`${pct}% of required context captured`}>
      <span className="num text-[12px] text-fg-muted">{pct}%</span>
      <span aria-hidden className="h-1 w-8 overflow-hidden rounded-full bg-surface-raised">
        <span className={`block h-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

export function EmptyState({ title, body, testId }: { title: string; body: string; testId: string }) {
  return (
    <div data-testid={testId} className="register-evidence px-5 py-8 text-center">
      <div className="text-[13px] font-medium text-fg">{title}</div>
      <p className="mx-auto mt-1.5 max-w-[380px] text-[12px] leading-relaxed text-fg-subtle">{body}</p>
    </div>
  );
}
