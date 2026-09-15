/**
 * Case context and its completeness metric.
 *
 * Context completeness is the metric that names the exact place value leaks
 * between self-service and agent work: the moment an employee has to re-explain
 * something they already said. It is computed from which of six required fields
 * are actually populated — never self-reported, never estimated.
 *
 * Keeping the field list closed is what keeps the metric honest. Adding a
 * seventh "nice to have" field would silently depress every historical score, so
 * the list lives in one place and is asserted by tests.
 */
import { CASE_CONTEXT_FIELDS, type CaseContext } from '../types';

export const EMPTY_CASE_CONTEXT: CaseContext = {
  problemStatement: null,
  attemptedActionsSummary: null,
  businessImpact: null,
  urgencyRationale: null,
  affectedSystem: null,
  conversationTranscriptRef: null,
};

/** A field counts only when it holds a non-empty value. */
function isPopulated(value: CaseContext[keyof CaseContext]): boolean {
  if (value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

/** 0-1: populated required fields over the six that count. */
export function contextCompleteness(context: CaseContext): number {
  const populated = CASE_CONTEXT_FIELDS.filter((field) => isPopulated(context[field])).length;
  return populated / CASE_CONTEXT_FIELDS.length;
}

/** Which fields are missing, so the UI can name them rather than show a bare score. */
export function missingContextFields(context: CaseContext): (keyof CaseContext)[] {
  return CASE_CONTEXT_FIELDS.filter((field) => !isPopulated(context[field]));
}

/** Human labels for the handoff receipt and the agent detail panel. */
export const CONTEXT_FIELD_LABELS: Record<keyof CaseContext, string> = {
  problemStatement: 'Problem statement',
  attemptedActionsSummary: 'What they already tried',
  businessImpact: 'Business impact',
  urgencyRationale: 'Why this urgency',
  affectedSystem: 'Affected system',
  conversationTranscriptRef: 'Original conversation',
};
