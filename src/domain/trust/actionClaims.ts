/**
 * Action-claim integrity.
 *
 * The rule: the product may only state that something happened if the event log
 * records it happening. This is the difference between an assistant that reports
 * state and one that narrates plausible-sounding fiction, and it is the single
 * most important trust property in the build (CLAUDE.md rule 5, ADR D-006).
 *
 * A style guideline would not survive a deadline, so the rule is a mechanism:
 *
 * 1. Sentences asserting an action are **generated from the event** by
 *    `formatActionClaim`. They are never authored as free text.
 * 2. Messages carry `actionRefs`, and `assertActionsRecorded` fails loudly in
 *    development and test if any referenced event is absent from the log.
 *
 * The practical effect is that adding a "we did X" message requires appending the
 * event first. That friction is the point.
 */
import { LABELS, type CaseEventId, type Message, type RelayEvent } from '../types';

/**
 * Render an event as a past-tense, user-facing sentence.
 *
 * Every branch describes only what the payload records. Nothing here infers
 * intent, predicts a next step, or characterizes an outcome the log does not
 * contain.
 */
export function formatActionClaim(event: RelayEvent): string {
  switch (event.type) {
    case 'case.created':
      return `Created support case ${event.payload.caseId} and routed it for triage.`;
    case 'case.assigned':
      return `Assigned ${event.payload.caseId} to an agent.`;
    case 'case.status_changed':
      return `Moved ${event.payload.caseId} from ${LABELS.caseStatus[event.payload.from]} to ${LABELS.caseStatus[event.payload.to]}.`;
    case 'case.knowledge_linked':
      return `Linked ${event.payload.articleId} to ${event.payload.caseId}.`;
    case 'case.related_marked':
      return `Marked ${event.payload.relatedCaseId} as related to ${event.payload.caseId}.`;
    case 'case.update_sent':
      return `Sent an update to the employee on ${event.payload.caseId}.`;
    case 'case.escalated':
      return `Escalated ${event.payload.caseId} to engineering issue ${event.payload.issueId}.`;
    case 'case.resolved':
      return `Resolved ${event.payload.caseId}.`;
    case 'cluster.detected':
      return `Detected a recurring issue across ${event.payload.caseIds.length} cases.`;
    case 'issue.created':
      return `Opened engineering issue ${event.payload.issueId} covering ${event.payload.linkedCaseIds.length} cases.`;
    case 'issue.status_changed':
      return `Moved ${event.payload.issueId} from ${LABELS.issueStatus[event.payload.from]} to ${LABELS.issueStatus[event.payload.to]}.`;
    case 'issue.propagated':
      return `Updated ${event.payload.caseIds.length} linked case${event.payload.caseIds.length === 1 ? '' : 's'} from ${event.payload.issueId}.`;
    case 'conversation.resolved':
      return event.payload.resolution === 'self_service'
        ? 'Marked this conversation resolved through self-service.'
        : 'Closed this conversation.';
    case 'answer.feedback':
      return `Recorded your feedback: ${event.payload.verdict}.`;
    case 'search.failed':
      return 'Searched the knowledge base and found nothing that answers this.';
    default:
      // Events that describe observations rather than actions taken on the
      // user's behalf. Nothing is claimed for them.
      return '';
  }
}

export class UnrecordedActionClaimError extends Error {
  constructor(
    readonly messageId: string,
    readonly missingRefs: CaseEventId[],
  ) {
    super(
      `Message ${messageId} claims ${missingRefs.length} action(s) with no matching event: ${missingRefs.join(', ')}. ` +
        'Append the event before rendering the claim (CLAUDE.md rule 5, ADR D-006).',
    );
    this.name = 'UnrecordedActionClaimError';
  }
}

export interface ClaimCheckResult {
  ok: boolean;
  missingRefs: CaseEventId[];
}

/** Which of a message's `actionRefs` are absent from the log. */
export function checkActionsRecorded(
  message: Pick<Message, 'id' | 'actionRefs'>,
  eventIndex: ReadonlySet<CaseEventId>,
): ClaimCheckResult {
  const missingRefs = message.actionRefs.filter((ref) => !eventIndex.has(ref));
  return { ok: missingRefs.length === 0, missingRefs };
}

/**
 * Fail the render when a message asserts an unrecorded action.
 *
 * Throws in development and test so the mistake is impossible to miss. In a
 * production build it returns the failure instead, so a viewer sees a visible
 * integrity warning rather than a blank page — a broken promise should be
 * legible, not fatal.
 */
export function assertActionsRecorded(
  message: Pick<Message, 'id' | 'actionRefs'>,
  eventIndex: ReadonlySet<CaseEventId>,
  options: { throwOnFailure?: boolean } = {},
): ClaimCheckResult {
  const result = checkActionsRecorded(message, eventIndex);
  const shouldThrow = options.throwOnFailure ?? process.env.NODE_ENV !== 'production';

  if (!result.ok && shouldThrow) {
    throw new UnrecordedActionClaimError(message.id, result.missingRefs);
  }
  return result;
}

/** Index a log for repeated claim checks during a render pass. */
export function buildEventIndex(events: readonly RelayEvent[]): ReadonlySet<CaseEventId> {
  return new Set(events.map((e) => e.id));
}

/**
 * Every action claim a message makes, resolved against the log.
 *
 * Used by the audit view: it renders the generated sentences rather than the
 * message body, so what a reviewer reads is provably backed by recorded state.
 */
export function resolveActionClaims(
  message: Pick<Message, 'actionRefs'>,
  events: readonly RelayEvent[],
): { event: RelayEvent; claim: string }[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  return message.actionRefs
    .map((ref) => byId.get(ref))
    .filter((e): e is RelayEvent => e !== undefined)
    .map((event) => ({ event, claim: formatActionClaim(event) }))
    .filter((entry) => entry.claim.length > 0);
}
