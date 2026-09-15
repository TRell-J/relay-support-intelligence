/**
 * Metric definitions.
 *
 * Every KPI declares its formula, numerator, denominator and window as data, and
 * the UI renders that declaration as the tooltip. A metric whose definition lives
 * only in someone's head is a metric nobody can argue with, and support metrics
 * are argued with constantly — usually because two people are computing them
 * differently and neither knows it.
 *
 * Keeping the definition next to the computation means the tooltip cannot drift
 * from what the number actually is (CLAUDE.md rule 6).
 */

export type MetricKey =
  | 'supportDemand'
  | 'selfServiceRate'
  | 'escalationRate'
  | 'answerAcceptance'
  | 'searchFailureRate'
  | 'contextCompleteness'
  | 'recurringVolume'
  | 'timeToDetection'
  | 'reworkRate';

export type MetricFormat = 'count' | 'percent' | 'duration' | 'decimal';

/** Which direction is good, for the trend indicator. */
export type MetricPolarity = 'higher_is_better' | 'lower_is_better' | 'neutral';

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  /** One line on what the metric is for, not how it is computed. */
  purpose: string;
  formula: string;
  numerator: string;
  denominator: string;
  window: string;
  format: MetricFormat;
  polarity: MetricPolarity;
}

export const METRIC_DEFINITIONS: Record<MetricKey, MetricDefinition> = {
  supportDemand: {
    key: 'supportDemand',
    label: 'Support demand',
    purpose: 'Total employee-initiated requests. The denominator most other rates share.',
    formula: 'count(conversation.started)',
    numerator: 'Conversations started by an employee',
    denominator: 'Not a rate',
    window: 'Selected date range',
    format: 'count',
    polarity: 'neutral',
  },
  selfServiceRate: {
    key: 'selfServiceRate',
    label: 'Self-service resolution',
    purpose: 'Share of requests the employee closed themselves with a grounded answer.',
    formula: 'conversation.resolved[self_service] / conversation.started',
    numerator: 'Conversations the employee marked resolved',
    denominator: 'All conversations started',
    window: 'Selected date range',
    format: 'percent',
    polarity: 'higher_is_better',
  },
  escalationRate: {
    key: 'escalationRate',
    label: 'Escalation rate',
    purpose: 'Share of requests that became agent work.',
    formula: 'case.created / conversation.started',
    numerator: 'Support cases created',
    denominator: 'All conversations started',
    window: 'Selected date range',
    format: 'percent',
    polarity: 'lower_is_better',
  },
  answerAcceptance: {
    key: 'answerAcceptance',
    label: 'Answer acceptance',
    purpose: 'Of the answers offered, how many the employee found useful.',
    formula: 'feedback[helpful] / (feedback[helpful] + feedback[unhelpful])',
    numerator: 'Answers marked helpful',
    denominator: 'All answers that received feedback',
    window: 'Selected date range',
    format: 'percent',
    polarity: 'higher_is_better',
  },
  searchFailureRate: {
    key: 'searchFailureRate',
    label: 'Search failure rate',
    purpose: 'How often retrieval found nothing it could stand behind.',
    formula: 'search.failed / search.performed',
    numerator: 'Searches with no acceptable result',
    denominator: 'All searches performed',
    window: 'Selected date range',
    format: 'percent',
    polarity: 'lower_is_better',
  },
  contextCompleteness: {
    key: 'contextCompleteness',
    label: 'Context completeness',
    purpose:
      'How much of the required context survives the handoff to an agent. The measure of whether an employee has to repeat themselves.',
    formula: 'mean(populated required fields / 6) over case.created',
    numerator: 'Populated context fields at case creation',
    denominator: 'Six required fields per case',
    window: 'Selected date range',
    format: 'percent',
    polarity: 'higher_is_better',
  },
  recurringVolume: {
    key: 'recurringVolume',
    label: 'Recurring-issue volume',
    purpose: 'Share of open cases that belong to a known recurring pattern.',
    formula: 'cases in an active cluster / open cases',
    numerator: 'Open cases with a cluster',
    denominator: 'All open cases',
    window: 'Point in time',
    format: 'percent',
    polarity: 'lower_is_better',
  },
  timeToDetection: {
    key: 'timeToDetection',
    label: 'Time to detection',
    purpose:
      'How long a systemic problem sat in the queue looking like unrelated tickets before anyone connected them.',
    formula: 'median(cluster.detectedAt - first member case createdAt)',
    numerator: 'Elapsed time from first case to detection',
    denominator: 'Per detected cluster, median',
    window: 'All detected clusters',
    format: 'duration',
    polarity: 'lower_is_better',
  },
  reworkRate: {
    key: 'reworkRate',
    label: 'Agent rework',
    purpose:
      'Reassignments and status regressions per case — work done twice because something was missed.',
    formula: 'mean(reassignments + status regressions) per case',
    numerator: 'Rework events recorded against cases',
    denominator: 'All cases in range',
    window: 'Selected date range',
    format: 'decimal',
    polarity: 'lower_is_better',
  },
};

export const METRIC_ORDER: MetricKey[] = [
  'supportDemand',
  'selfServiceRate',
  'escalationRate',
  'answerAcceptance',
  'searchFailureRate',
  'contextCompleteness',
  'recurringVolume',
  'timeToDetection',
  'reworkRate',
];

/** Format a value for display, per its declared format. */
export function formatMetric(value: number | null, format: MetricFormat): string {
  if (value === null || Number.isNaN(value)) return '—';
  switch (format) {
    case 'percent':
      return `${Math.round(value * 100)}%`;
    case 'decimal':
      return value.toFixed(2);
    case 'duration': {
      const days = Math.floor(value / 86_400_000);
      const hours = Math.round((value % 86_400_000) / 3_600_000);
      return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
    }
    default:
      return String(Math.round(value));
  }
}
