/**
 * The event log.
 *
 * This is the single source of truth for everything Product Intelligence reports.
 * Nine KPIs are pure functions over `RelayEvent[]`; no metric is stored, and no
 * chart series is authored (CLAUDE.md rule 6).
 *
 * Two rules govern this file:
 *
 * 1. Events are append-only and past-tense. They record what happened, never what
 *    should happen next.
 * 2. Every payload carries enough to derive its metrics without joining back to
 *    mutable entity state. A case's status may change; `case.status_changed` still
 *    tells you what it was at the time.
 */
import type { Iso } from '../clock';
import type {
  AgentId,
  AnswerId,
  ArticleId,
  CaseEventId,
  CaseId,
  ClusterId,
  ConversationId,
  EmployeeId,
  IssueId,
  MessageId,
  OpportunityId,
  UpdateId,
} from '../ids';
import type {
  Actor,
  AffectedSystem,
  CaseSource,
  CaseStatus,
  ConfidenceBand,
  ConversationChannel,
  ConversationResolution,
  FeedbackVerdict,
  IssueStatus,
  MessageAuthor,
  OpportunityState,
  ResolutionType,
  SearchFailureReason,
  SensitiveDomain,
  Severity,
  SupportCategory,
  Urgency,
} from './core';
import type { PriorityInputs } from './entities';

/** Fields present on every event, whatever its type. */
interface EventBase {
  id: CaseEventId;
  at: Iso;
  actor: Actor;
}

interface Evt<TType extends string, TPayload> extends EventBase {
  type: TType;
  payload: TPayload;
}

/* ---------------------------------------------------------- conversation -- */

export type ConversationStarted = Evt<
  'conversation.started',
  {
    conversationId: ConversationId;
    employeeId: EmployeeId;
    category: SupportCategory;
    channel: ConversationChannel;
  }
>;

export type MessageSent = Evt<
  'message.sent',
  { conversationId: ConversationId; messageId: MessageId; author: MessageAuthor }
>;

export type SearchPerformed = Evt<
  'search.performed',
  {
    conversationId: ConversationId;
    query: string;
    retrievedArticleIds: ArticleId[];
    topScore: number;
  }
>;

/**
 * A search that produced nothing usable. Deliberately a separate event rather
 * than a flag on `search.performed`: failed self-service is the signal the
 * knowledge-gap view is built from, and it should be countable on its own.
 */
export type SearchFailed = Evt<
  'search.failed',
  {
    conversationId: ConversationId;
    query: string;
    reason: SearchFailureReason;
    /** Normalized topic key, so repeated phrasings aggregate into one gap. */
    topicKey: string;
  }
>;

export type AnswerPresented = Evt<
  'answer.presented',
  {
    conversationId: ConversationId;
    answerId: AnswerId;
    confidence: number;
    band: ConfidenceBand;
    articleIds: ArticleId[];
    sensitiveDomain: SensitiveDomain | null;
  }
>;

export type AnswerFeedback = Evt<
  'answer.feedback',
  { answerId: AnswerId; conversationId: ConversationId; verdict: FeedbackVerdict; reasonCode: string | null }
>;

export type ConversationResolved = Evt<
  'conversation.resolved',
  { conversationId: ConversationId; resolution: ConversationResolution }
>;

/* ------------------------------------------------------------------ case -- */

export type CaseCreated = Evt<
  'case.created',
  {
    caseId: CaseId;
    conversationId: ConversationId | null;
    employeeId: EmployeeId;
    category: SupportCategory;
    system: AffectedSystem;
    urgency: Urgency;
    source: CaseSource;
    /** 0-1, populated context fields over the six required. Derived at creation. */
    contextCompleteness: number;
  }
>;

export type CaseAssigned = Evt<
  'case.assigned',
  { caseId: CaseId; agentId: AgentId; assignmentType: 'auto' | 'manual' }
>;

export type CaseStatusChanged = Evt<
  'case.status_changed',
  { caseId: CaseId; from: CaseStatus; to: CaseStatus; reason: string | null; isRegression: boolean }
>;

export type CaseKnowledgeLinked = Evt<
  'case.knowledge_linked',
  { caseId: CaseId; articleId: ArticleId }
>;

export type CaseRelatedMarked = Evt<
  'case.related_marked',
  { caseId: CaseId; relatedCaseId: CaseId }
>;

/** Proof that an update actually left the system. Drafts do not emit this. */
export type CaseUpdateSent = Evt<
  'case.update_sent',
  { caseId: CaseId; updateId: UpdateId; channel: ConversationChannel }
>;

export type CaseEscalated = Evt<'case.escalated', { caseId: CaseId; issueId: IssueId }>;

export type CaseResolved = Evt<
  'case.resolved',
  { caseId: CaseId; resolutionType: ResolutionType; reworkCount: number }
>;

/* --------------------------------------------------------------- cluster -- */

export type ClusterDetected = Evt<
  'cluster.detected',
  {
    clusterId: ClusterId;
    caseIds: CaseId[];
    category: SupportCategory;
    system: AffectedSystem;
    conceptTags: string[];
    /** Earliest member case. `at - firstCaseAt` is time-to-detection. */
    firstCaseAt: Iso;
  }
>;

export type ClusterDismissed = Evt<'cluster.dismissed', { clusterId: ClusterId; reason: string }>;

/* ----------------------------------------------------------------- issue -- */

export type IssueCreated = Evt<
  'issue.created',
  {
    issueId: IssueId;
    clusterId: ClusterId | null;
    severity: Severity;
    linkedCaseIds: CaseId[];
    affectedEmployees: number;
  }
>;

export type IssueStatusChanged = Evt<
  'issue.status_changed',
  { issueId: IssueId; from: IssueStatus; to: IssueStatus }
>;

/** Records that a status change actually reached the linked cases. */
export type IssuePropagated = Evt<
  'issue.propagated',
  { issueId: IssueId; caseIds: CaseId[]; toStatus: CaseStatus }
>;

export type IssueSeverityOverridden = Evt<
  'issue.severity_overridden',
  { issueId: IssueId; from: Severity; to: Severity; rationale: string }
>;

/* ----------------------------------------------------------- opportunity -- */

export type OpportunityCreated = Evt<
  'opportunity.created',
  { opportunityId: OpportunityId; sourceEvidence: string[] }
>;

/** Audit trail for prioritization. The score itself is never stored (ADR D-009). */
export type OpportunityScored = Evt<
  'opportunity.scored',
  { opportunityId: OpportunityId; inputs: PriorityInputs; score: number }
>;

export type OpportunityStateChanged = Evt<
  'opportunity.state_changed',
  { opportunityId: OpportunityId; from: OpportunityState; to: OpportunityState }
>;

/* ------------------------------------------------------------- knowledge -- */

export type KbGapFlagged = Evt<
  'kb.gap_flagged',
  { topicKey: string; evidenceCount: number; category: SupportCategory }
>;

/* ----------------------------------------------------------------- union -- */

export type RelayEvent =
  | ConversationStarted
  | MessageSent
  | SearchPerformed
  | SearchFailed
  | AnswerPresented
  | AnswerFeedback
  | ConversationResolved
  | CaseCreated
  | CaseAssigned
  | CaseStatusChanged
  | CaseKnowledgeLinked
  | CaseRelatedMarked
  | CaseUpdateSent
  | CaseEscalated
  | CaseResolved
  | ClusterDetected
  | ClusterDismissed
  | IssueCreated
  | IssueStatusChanged
  | IssuePropagated
  | IssueSeverityOverridden
  | OpportunityCreated
  | OpportunityScored
  | OpportunityStateChanged
  | KbGapFlagged;

export type RelayEventType = RelayEvent['type'];

/** Narrow an event to one variant. Keeps metric code free of manual casts. */
export function isEvent<T extends RelayEventType>(
  event: RelayEvent,
  type: T,
): event is Extract<RelayEvent, { type: T }> {
  return event.type === type;
}

/** Filter a log to one variant, fully typed. The workhorse of every derivation. */
export function eventsOfType<T extends RelayEventType>(
  events: readonly RelayEvent[],
  type: T,
): Extract<RelayEvent, { type: T }>[] {
  return events.filter((e): e is Extract<RelayEvent, { type: T }> => e.type === type);
}

/**
 * Every event type, for the audit-history renderer and the metric registry's
 * completeness check. Kept as a runtime list because the union alone cannot be
 * iterated; the `satisfies` clause fails the build if the two drift apart.
 */
export const RELAY_EVENT_TYPES = [
  'conversation.started',
  'message.sent',
  'search.performed',
  'search.failed',
  'answer.presented',
  'answer.feedback',
  'conversation.resolved',
  'case.created',
  'case.assigned',
  'case.status_changed',
  'case.knowledge_linked',
  'case.related_marked',
  'case.update_sent',
  'case.escalated',
  'case.resolved',
  'cluster.detected',
  'cluster.dismissed',
  'issue.created',
  'issue.status_changed',
  'issue.propagated',
  'issue.severity_overridden',
  'opportunity.created',
  'opportunity.scored',
  'opportunity.state_changed',
  'kb.gap_flagged',
] as const satisfies readonly RelayEventType[];

/**
 * Compile-time proof that the runtime list above covers the union. If a new event
 * type is added without listing it, this assignment fails to typecheck.
 */
type _ExhaustiveEventTypes = Exclude<RelayEventType, (typeof RELAY_EVENT_TYPES)[number]> extends never
  ? true
  : ['missing event types in RELAY_EVENT_TYPES', Exclude<RelayEventType, (typeof RELAY_EVENT_TYPES)[number]>];
const _eventTypesAreExhaustive: _ExhaustiveEventTypes = true;
void _eventTypesAreExhaustive;
