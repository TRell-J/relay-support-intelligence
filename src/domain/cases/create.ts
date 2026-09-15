/**
 * Case creation and routing.
 *
 * This is the seam the whole product argues about. When self-service fails, the
 * question is whether the employee's context survives the boundary or whether an
 * agent has to rebuild it by hand. Everything here exists to make the first
 * outcome the default and to *measure* when it does not happen.
 *
 * Routing rationale is assembled from the signals that actually fired, so the
 * explanation an agent reads is evidence rather than prose.
 */
import type { Iso } from '../clock';
import type { CaseId, ConversationId, EmployeeId } from '../ids';
import type { IntentDefinition } from '../retrieval/intents';
import type { RetrievalResult } from '../retrieval/search';
import {
  type AttemptedAction,
  type CaseContext,
  type CaseSource,
  type RoutingRationale,
  type SupportCase,
  type Urgency,
} from '../types';
import { contextCompleteness } from './context';
import { slaTargetFor } from './sla';

/** Which queue owns a given affected system. */
const QUEUE_BY_SYSTEM: Record<string, string> = {
  'Identity Provider': 'Identity & Access',
  'VPN Gateway': 'Workplace Technology',
  'Device Management': 'Workplace Technology',
  'Collaboration Suite': 'Workplace Technology',
  'Expense Platform': 'Finance Support',
  Directory: 'IT Service Desk',
};

export function queueForSystem(system: string): string {
  return QUEUE_BY_SYSTEM[system] ?? 'IT Service Desk';
}

/**
 * Build the routing explanation from signals that actually fired.
 *
 * Each branch appends a signal only when its condition holds, so an agent
 * reading `matchedSignals` is reading the decision, not a description of it.
 */
export function buildRoutingRationale(
  intent: IntentDefinition,
  retrieval: RetrievalResult | null,
  urgency: Urgency,
): RoutingRationale {
  const queue = queueForSystem(intent.system);
  const matchedSignals: string[] = [`Affected system: ${intent.system}`, `Category: ${intent.category}`];

  let reasonKey = 'system_ownership';

  if (intent.sensitiveDomain !== null) {
    matchedSignals.push(
      `Escalation-sensitive domain: ${intent.sensitiveDomain.replace(/_/g, ' ')} — requires human confirmation`,
    );
    reasonKey = 'sensitive_domain';
  }

  if (retrieval !== null && retrieval.failure !== null) {
    matchedSignals.push(`Self-service failed: ${retrieval.failure.replace(/_/g, ' ')}`);
    if (retrieval.score.uncoveredConcepts.length > 0) {
      matchedSignals.push(`No source covers: ${retrieval.score.uncoveredConcepts.join(', ')}`);
    }
    if (reasonKey === 'system_ownership') reasonKey = 'self_service_failure';
  }

  if (urgency === 'high' || urgency === 'critical') {
    matchedSignals.push(`Urgency ${urgency}: shortened response target`);
  }

  const explanation =
    reasonKey === 'sensitive_domain'
      ? `Routed to ${queue} because this is an escalation-sensitive topic that cannot be resolved without a person, and ${queue} owns ${intent.system}.`
      : reasonKey === 'self_service_failure'
        ? `Routed to ${queue} because self-service could not cover the question and ${queue} owns ${intent.system}.`
        : `Routed to ${queue} as the owning queue for ${intent.system}.`;

  return { queue, reasonKey, explanation, matchedSignals };
}

export interface CreateCaseInput {
  id: CaseId;
  employeeId: EmployeeId;
  conversationId: ConversationId | null;
  intent: IntentDefinition;
  retrieval: RetrievalResult | null;
  source: CaseSource;
  createdAt: Iso;
  /** Overrides the intent default when a scenario specifies one. */
  urgency?: Urgency;
  context: CaseContext;
  attemptedActions: AttemptedAction[];
  title?: string;
}

/**
 * Assemble a support case.
 *
 * Note what is *not* stored: SLA state, context completeness as a field, or any
 * derived count. Only `slaTargetAt` is frozen, because a deadline is a fact about
 * when the case was created (ADR D-008).
 */
export function createCase(input: CreateCaseInput): SupportCase {
  const urgency = input.urgency ?? input.intent.defaultUrgency;
  const routingRationale = buildRoutingRationale(input.intent, input.retrieval, urgency);

  return {
    id: input.id,
    conversationId: input.conversationId,
    employeeId: input.employeeId,
    title: input.title ?? defaultTitle(input.intent),
    category: input.intent.category,
    system: input.intent.system,
    status: 'new',
    urgency,
    source: input.source,
    assigneeId: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    slaTargetAt: slaTargetFor(input.createdAt, urgency),
    aiConfidenceAtHandoff: input.retrieval?.score.confidence ?? null,
    structuredContext: input.context,
    attemptedActions: input.attemptedActions,
    routingRationale,
    suggestedArticleIds: input.retrieval?.citedIds ?? [],
    linkedArticleIds: [],
    relatedCaseIds: [],
    clusterId: null,
    issueId: null,
    reworkCount: 0,
    resolutionType: null,
    conceptTags: input.intent.conceptTags,
  };
}

function defaultTitle(intent: IntentDefinition): string {
  const query = intent.canonicalQuery;
  return query.length > 72 ? `${query.slice(0, 69)}...` : query;
}

/** Completeness of a case's context, for the metric and the handoff receipt. */
export function caseContextCompleteness(supportCase: SupportCase): number {
  return contextCompleteness(supportCase.structuredContext);
}
