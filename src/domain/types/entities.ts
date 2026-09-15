/**
 * Entity shapes. See docs/DATA_DICTIONARY.md for the field-level contract.
 *
 * Two conventions run through all of these:
 *
 * 1. Anything that can be computed is *not* stored. Article staleness, SLA state,
 *    affected-user counts and priority scores are all derived at read time, so
 *    they cannot drift from the data they claim to summarize (ADR D-008, D-009).
 * 2. Optionality is explicit. A field that may be absent is `T | null`, never
 *    `T | undefined`, so "not yet known" survives serialization to sessionStorage.
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
  AffectedSystem,
  CaseSource,
  CaseStatus,
  ClusterStatus,
  ConfidenceBand,
  ConversationChannel,
  ConversationResolution,
  Department,
  IntentKey,
  IssueStatus,
  MessageAuthor,
  OpportunityState,
  ResolutionType,
  SensitiveDomain,
  Severity,
  SupportCategory,
  Urgency,
} from './core';

/* ------------------------------------------------------------------ people -- */

export interface Employee {
  id: EmployeeId;
  displayName: string;
  department: Department;
  location: string;
  role: string;
  tenureMonths: number;
  /** The active population is the denominator for opportunity reach. */
  isActive: boolean;
}

export interface SupportAgent {
  id: AgentId;
  displayName: string;
  queue: string;
  /** Cosmetic capacity signal shown in the assignment control. */
  openCaseTarget: number;
}

/* ----------------------------------------------------------- conversation -- */

export interface Conversation {
  id: ConversationId;
  employeeId: EmployeeId;
  channel: ConversationChannel;
  startedAt: Iso;
  intentKey: IntentKey;
  category: SupportCategory;
  /** `null` while the conversation is still open. */
  resolution: ConversationResolution | null;
  resolvedAt: Iso | null;
  messageIds: MessageId[];
}

export interface Message {
  id: MessageId;
  conversationId: ConversationId;
  author: MessageAuthor;
  sentAt: Iso;
  body: string;
  /** Set on assistant messages that carry a grounded answer. */
  answerId: AnswerId | null;
  /**
   * Events this message asserts happened. An empty array means the message
   * asserts nothing. `assertActionsRecorded` fails the render if any referenced
   * event is missing from the log (ADR D-006).
   */
  actionRefs: CaseEventId[];
}

/* ----------------------------------------------------------------- answer -- */

export interface AnswerStep {
  ordinal: number;
  text: string;
  /** The source backing this step, where one applies. */
  articleId: ArticleId | null;
}

/**
 * One term of the confidence calculation, surfaced verbatim in the UI. Because
 * these are emitted by the scorer, the explanation cannot disagree with the score.
 */
export interface ConfidenceComponent {
  key:
    | 'coverage'
    | 'sourceQuality'
    | 'freshness'
    | 'specificity'
    | 'sensitiveCeiling'
    | 'unmatchedQuestion';
  label: string;
  /** Weighted contribution to the final score, in points of confidence. */
  contribution: number;
  /** Short user-facing explanation, e.g. "3 of 3 required steps covered". */
  detail: string;
}

export interface Answer {
  id: AnswerId;
  summary: string;
  steps: AnswerStep[];
  articleIds: ArticleId[];
  /** 0-1, computed by the scorer. Never authored by hand. */
  confidence: number;
  band: ConfidenceBand;
  rationale: ConfidenceComponent[];
  sensitiveDomain: SensitiveDomain | null;
  /** False whenever the band is low or a sensitive domain applies. */
  canSelfResolve: boolean;
}

/* -------------------------------------------------------------- knowledge -- */

export interface KnowledgeArticle {
  id: ArticleId;
  title: string;
  space: string;
  ownerTeam: string;
  lastReviewedAt: Iso;
  /** 0-1 quality prior, authored per article. */
  authority: number;
  /** Normalized concept tags the retrieval scorer matches against. */
  concepts: string[];
  bodySummary: string;
}

/* ------------------------------------------------------------------- case -- */

/**
 * The six fields that define context completeness. Nothing outside this shape
 * counts toward the metric, which is what keeps it honest.
 */
export interface CaseContext {
  problemStatement: string | null;
  attemptedActionsSummary: string | null;
  businessImpact: string | null;
  urgencyRationale: string | null;
  affectedSystem: AffectedSystem | null;
  conversationTranscriptRef: ConversationId | null;
}

export const CASE_CONTEXT_FIELDS = [
  'problemStatement',
  'attemptedActionsSummary',
  'businessImpact',
  'urgencyRationale',
  'affectedSystem',
  'conversationTranscriptRef',
] as const satisfies readonly (keyof CaseContext)[];

export interface AttemptedAction {
  text: string;
  outcome: 'failed' | 'partial' | 'not_tried';
  /** The transcript line this was extracted from, when it came from a conversation. */
  sourceMessageId: MessageId | null;
}

export interface RoutingRationale {
  queue: string;
  reasonKey: string;
  explanation: string;
  /** The signals that actually fired, so the rationale is evidence not prose. */
  matchedSignals: string[];
}

export interface SupportCase {
  id: CaseId;
  conversationId: ConversationId | null;
  employeeId: EmployeeId;
  title: string;
  category: SupportCategory;
  system: AffectedSystem;
  status: CaseStatus;
  urgency: Urgency;
  source: CaseSource;
  assigneeId: AgentId | null;
  createdAt: Iso;
  updatedAt: Iso;
  slaTargetAt: Iso;
  /** The self-service confidence that produced this handoff, where there was one. */
  aiConfidenceAtHandoff: number | null;
  structuredContext: CaseContext;
  attemptedActions: AttemptedAction[];
  routingRationale: RoutingRationale;
  suggestedArticleIds: ArticleId[];
  /** Agent-confirmed, deliberately distinct from `suggestedArticleIds`. */
  linkedArticleIds: ArticleId[];
  relatedCaseIds: CaseId[];
  clusterId: ClusterId | null;
  issueId: IssueId | null;
  /** Reassignments plus status regressions. Feeds the rework metric. */
  reworkCount: number;
  resolutionType: ResolutionType | null;
  /** Concept tags used for clustering, derived from the intent at creation. */
  conceptTags: string[];
}

/* ---------------------------------------------------------------- cluster -- */

export interface ClusterSignature {
  category: SupportCategory;
  system: AffectedSystem;
  conceptTags: string[];
}

export interface IssueCluster {
  id: ClusterId;
  signature: ClusterSignature;
  caseIds: CaseId[];
  firstCaseAt: Iso;
  detectedAt: Iso;
  status: ClusterStatus;
  /** Generated from the similarity terms that fired, never hand-written. */
  matchRationale: string[];
}

/* ------------------------------------------------------------------ issue -- */

export interface IssueEvidence {
  kind: 'case' | 'event' | 'metric';
  ref: string;
  note: string;
}

export interface BusinessImpact {
  /** Distinct employees across linked cases. Derived, never entered (ADR D-008). */
  affectedEmployees: number;
  agentHoursConsumed: number;
  employeeMinutesLost: number;
  narrative: string;
}

export interface EngineeringIssue {
  id: IssueId;
  /** Tracker-style display key, e.g. `IDP-207`. Cosmetic only; no external system. */
  key: string;
  title: string;
  description: string;
  clusterId: ClusterId | null;
  linkedCaseIds: CaseId[];
  severity: Severity;
  /** Set when a human overrides the derived severity proposal. */
  severityOverridden: boolean;
  status: IssueStatus;
  ownerTeam: string;
  ownerName: string;
  suspectedCause: string | null;
  workaround: string | null;
  evidence: IssueEvidence[];
  createdAt: Iso;
  updatedAt: Iso;
}

/**
 * A drafted employee update. Created unsent by status propagation; only an
 * explicit human send records `case.update_sent` (ADR D-006).
 */
export interface EmployeeUpdateDraft {
  id: UpdateId;
  caseId: CaseId;
  issueId: IssueId | null;
  body: string;
  createdAt: Iso;
  sentAt: Iso | null;
}

/* ------------------------------------------------------------ opportunity -- */

export interface OpportunityEvidence {
  kind: 'cluster' | 'issue' | 'metric' | 'failed_search' | 'case';
  ref: string;
  summary: string;
}

export interface PriorityInputs {
  /** 1-5 */
  impact: number;
  /** Employee count; defaults to the linked cluster's derived reach. */
  reachEmployees: number;
  /** 0-1 */
  confidence: number;
  /** 1-5, a person-week proxy. */
  effort: number;
  /** 0-0.5 */
  risk: number;
  /** True when a human overrode the derived reach, so provenance stays visible. */
  reachOverridden: boolean;
}

export interface ProductOpportunity {
  id: OpportunityId;
  title: string;
  problemStatement: string;
  state: OpportunityState;
  evidence: OpportunityEvidence[];
  inputs: PriorityInputs;
  owner: string;
  targetHorizon: string;
  createdAt: Iso;
}

/* --------------------------------------------------------------- scenario -- */

export interface SeedMessage {
  author: MessageAuthor;
  body: string;
}

export type WorkspaceKey = 'help' | 'agent' | 'engineering' | 'intelligence';

export interface GuidedStep {
  id: string;
  workspace: WorkspaceKey;
  instruction: string;
  /** The `data-testid` the guided tour highlights and the e2e test drives. */
  targetTestId: string;
  assertion: string;
}

export type ScenarioId = 'vpn_after_password_reset' | 'expense_policy_exception' | 'sso_login_loop';

export interface DemoScenario {
  id: ScenarioId;
  label: string;
  blurb: string;
  intentKey: IntentKey;
  category: SupportCategory;
  system: AffectedSystem;
  urgency: Urgency;
  seedMessages: SeedMessage[];
  expectedOutcome: 'self_service_resolved' | 'escalated_knowledge_gap' | 'escalated_clustered';
}
