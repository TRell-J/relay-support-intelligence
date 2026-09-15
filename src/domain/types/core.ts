/**
 * Shared vocabulary.
 *
 * Every enumerated value the product reasons about lives here, as a `const`
 * tuple plus a derived union. The tuples matter: filter controls, table columns
 * and chart groupings iterate them, so adding a category in one place makes it
 * appear everywhere without a second edit.
 */

/** How support demand is classified. Drives routing, clustering and demand charts. */
export const SUPPORT_CATEGORIES = [
  'Access & Identity',
  'Network & Devices',
  'Finance & Expense',
  'People & Benefits',
  'Software & Tools',
  'Facilities',
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

/** The internal platform a request is about. Half of a cluster signature. */
export const AFFECTED_SYSTEMS = [
  'Identity Provider',
  'VPN Gateway',
  'Expense Platform',
  'Device Management',
  'Directory',
  'Collaboration Suite',
] as const;
export type AffectedSystem = (typeof AFFECTED_SYSTEMS)[number];

export const DEPARTMENTS = [
  'Sales Ops',
  'Engineering',
  'Finance',
  'People',
  'Marketing',
  'Legal',
  'Support',
] as const;
export type Department = (typeof DEPARTMENTS)[number];

/**
 * Domains where a confident-sounding answer is worse than no answer. The scorer
 * applies a hard confidence ceiling to these, so they can never self-resolve.
 * See CLAUDE.md rule 7 and ADR D-005.
 */
export const SENSITIVE_DOMAINS = [
  'security',
  'identity_access',
  'employee_relations',
  'policy_exception',
  'compensation',
  'legal',
] as const;
export type SensitiveDomain = (typeof SENSITIVE_DOMAINS)[number];

/** Confidence at or below this cannot self-resolve, whatever the raw score says. */
export const SENSITIVE_DOMAIN_CEILING = 0.45;

/** Band thresholds applied to a 0-1 confidence score. */
export const CONFIDENCE_BANDS = ['high', 'medium', 'low'] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];
export const CONFIDENCE_HIGH_MIN = 0.75;
export const CONFIDENCE_MEDIUM_MIN = 0.5;

export function bandFor(confidence: number): ConfidenceBand {
  if (confidence >= CONFIDENCE_HIGH_MIN) return 'high';
  if (confidence >= CONFIDENCE_MEDIUM_MIN) return 'medium';
  return 'low';
}

/** An article older than this many days is flagged stale in the UI. */
export const ARTICLE_STALE_AFTER_DAYS = 90;

export const CASE_STATUSES = [
  'new',
  'triage',
  'in_progress',
  'waiting_on_employee',
  'waiting_on_engineering',
  'resolved',
  'closed',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/**
 * Ordering used to detect a regression. Moving to a lower rank counts as rework,
 * which is what the agent-rework metric is built from.
 */
export const CASE_STATUS_RANK: Record<CaseStatus, number> = {
  new: 0,
  triage: 1,
  in_progress: 2,
  waiting_on_employee: 2,
  waiting_on_engineering: 3,
  resolved: 4,
  closed: 5,
};

export const URGENCIES = ['low', 'normal', 'high', 'critical'] as const;
export type Urgency = (typeof URGENCIES)[number];

/** Hours allowed before the SLA target, by urgency. Used at case creation. */
export const SLA_HOURS_BY_URGENCY: Record<Urgency, number> = {
  critical: 4,
  high: 8,
  normal: 24,
  low: 72,
};

export const SLA_STATES = ['on_track', 'at_risk', 'breached'] as const;
export type SlaState = (typeof SLA_STATES)[number];

/** Below this fraction of the window remaining, a case reads as at risk. */
export const SLA_AT_RISK_FRACTION = 0.25;

export const CASE_SOURCES = [
  'self_service_escalation',
  'low_confidence_handoff',
  'direct_intake',
  'agent_created',
] as const;
export type CaseSource = (typeof CASE_SOURCES)[number];

export const RESOLUTION_TYPES = [
  'self_service',
  'agent_resolved',
  'engineering_fix',
  'duplicate',
] as const;
export type ResolutionType = (typeof RESOLUTION_TYPES)[number];

export const CONVERSATION_RESOLUTIONS = ['self_service', 'escalated', 'abandoned'] as const;
export type ConversationResolution = (typeof CONVERSATION_RESOLUTIONS)[number];

/** In-product intake surfaces. Deliberately not named after any external vendor. */
export const CONVERSATION_CHANNELS = ['chat_intake', 'help_portal'] as const;
export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[number];

export const MESSAGE_AUTHORS = ['employee', 'assistant', 'agent', 'system'] as const;
export type MessageAuthor = (typeof MESSAGE_AUTHORS)[number];

export const ISSUE_STATUSES = ['investigating', 'in_progress', 'monitoring', 'resolved'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const SEVERITIES = ['sev1', 'sev2', 'sev3', 'sev4'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CLUSTER_STATUSES = ['candidate', 'confirmed', 'linked_to_issue', 'dismissed'] as const;
export type ClusterStatus = (typeof CLUSTER_STATUSES)[number];

export const OPPORTUNITY_STATES = ['discover', 'validate', 'planned', 'in_progress'] as const;
export type OpportunityState = (typeof OPPORTUNITY_STATES)[number];

export const SEARCH_FAILURE_REASONS = ['no_results', 'below_threshold', 'stale_only'] as const;
export type SearchFailureReason = (typeof SEARCH_FAILURE_REASONS)[number];

export const FEEDBACK_VERDICTS = ['helpful', 'unhelpful'] as const;
export type FeedbackVerdict = (typeof FEEDBACK_VERDICTS)[number];

/** Who performed an action. Present on every event so audit history reads clearly. */
export const ACTOR_KINDS = ['employee', 'agent', 'engineer', 'system', 'assistant'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export interface Actor {
  kind: ActorKind;
  /** Entity id where one applies; `null` for system-originated actions. */
  id: string | null;
}

/** Stable key tying a conversation to seeded scenario logic. */
export type IntentKey =
  | 'vpn_after_password_reset'
  | 'expense_policy_exception'
  | 'sso_login_loop'
  | 'laptop_replacement'
  | 'payroll_question'
  | 'software_license_request'
  | 'mfa_device_change'
  | 'building_access'
  | 'benefits_enrollment'
  | 'shared_drive_permissions';

/** Human-readable labels for enum values that need one. */
export const LABELS = {
  caseStatus: {
    new: 'New',
    triage: 'Triage',
    in_progress: 'In progress',
    waiting_on_employee: 'Waiting on employee',
    waiting_on_engineering: 'Waiting on engineering',
    resolved: 'Resolved',
    closed: 'Closed',
  } satisfies Record<CaseStatus, string>,
  issueStatus: {
    investigating: 'Investigating',
    in_progress: 'In progress',
    monitoring: 'Monitoring',
    resolved: 'Resolved',
  } satisfies Record<IssueStatus, string>,
  urgency: {
    low: 'Low',
    normal: 'Normal',
    high: 'High',
    critical: 'Critical',
  } satisfies Record<Urgency, string>,
  slaState: {
    on_track: 'On track',
    at_risk: 'At risk',
    breached: 'Breached',
  } satisfies Record<SlaState, string>,
  severity: {
    sev1: 'Sev 1',
    sev2: 'Sev 2',
    sev3: 'Sev 3',
    sev4: 'Sev 4',
  } satisfies Record<Severity, string>,
  opportunityState: {
    discover: 'Discover',
    validate: 'Validate',
    planned: 'Planned',
    in_progress: 'In progress',
  } satisfies Record<OpportunityState, string>,
  caseSource: {
    self_service_escalation: 'Self-service escalation',
    low_confidence_handoff: 'Low-confidence handoff',
    direct_intake: 'Direct intake',
    agent_created: 'Agent created',
  } satisfies Record<CaseSource, string>,
  sensitiveDomain: {
    security: 'Security',
    identity_access: 'Identity & access',
    employee_relations: 'Employee relations',
    policy_exception: 'Policy exception',
    compensation: 'Compensation',
    legal: 'Legal',
  } satisfies Record<SensitiveDomain, string>,
  /* Short by design: these render in a narrow column beside a classification chip. */
  searchFailureReason: {
    no_results: 'No results',
    below_threshold: 'Low confidence',
    stale_only: 'Stale sources',
  } satisfies Record<SearchFailureReason, string>,
} as const;
