/**
 * Background support history.
 *
 * Sixty days of synthetic demand, generated from a compact declarative spec
 * rather than hand-authored row by row. The point is maintainability: changing
 * "Access & Identity demand rises over the last three weeks" is a one-line edit
 * here, not an edit to four hundred records.
 *
 * Everything is driven by the seeded PRNG, so the corpus is identical on every
 * run and the metric snapshots stay valid.
 */
import { atHour } from '@/domain/clock';
import type { AnswerId, ConversationId, EmployeeId, MessageId } from '@/domain/ids';
import { EMPTY_CASE_CONTEXT } from '@/domain/cases/context';
import { createCase } from '@/domain/cases/create';
import { requireIntent, type IntentDefinition } from '@/domain/retrieval/intents';
import { retrieve } from '@/domain/retrieval/search';
import { contextCompleteness } from '@/domain/cases/context';
import type { CaseId, IntentKey, SupportCase } from '@/domain/types';
import type { RelayState, SeedContext } from '../buildInitialState';
import { KNOWLEDGE_ARTICLES } from './articles';
import { AGENTS, EMPLOYEES } from './people';
import { ASSISTANT_ACTOR, SYSTEM_ACTOR, agentActor, employeeActor, record } from './recorder';

/** How far back the synthetic history runs. */
export const HISTORY_DAYS = 60;

/**
 * Relative demand weight per intent, and an optional late-period multiplier.
 *
 * `trendMultiplier` applies to the most recent three weeks. It is how a narrative
 * intention ("Access & Identity demand is climbing") becomes data, rather than a
 * shape drawn by hand into a chart.
 */
interface DemandSpec {
  key: IntentKey;
  weight: number;
  trendMultiplier?: number;
}

const DEMAND: DemandSpec[] = [
  { key: 'vpn_after_password_reset', weight: 10 },
  { key: 'laptop_replacement', weight: 8 },
  { key: 'payroll_question', weight: 7 },
  { key: 'software_license_request', weight: 9 },
  { key: 'shared_drive_permissions', weight: 8 },
  { key: 'benefits_enrollment', weight: 5 },
  { key: 'building_access', weight: 4 },
  { key: 'mfa_device_change', weight: 6, trendMultiplier: 2.4 },
  { key: 'expense_policy_exception', weight: 5, trendMultiplier: 1.6 },
  /*
   * 'sso_login_loop' is deliberately absent.
   *
   * The SSO cases are hand-authored in narrative.ts, all inside the last six
   * days. If the generator also produced them across the full 60-day history,
   * the recurring-issue cluster would be indistinguishable from steady-state
   * noise — and the whole point of the scenario is that this pattern is new.
   * Access & Identity demand still rises, carried by mfa_device_change above.
   */
];

const TREND_WINDOW_DAYS = 21;

/** Conversations per day, before per-intent weighting. Weekdays only. */
const BASE_DAILY_VOLUME = 3;

/**
 * The demo present is a Monday, which is weekday index 1. Counting back N days
 * therefore lands on `(1 - N) mod 7`.
 *
 * An earlier version computed `(7 - N % 7) % 7`, which classified the Monday
 * itself as a Sunday — so the generator skipped the wrong days for the entire
 * history and produced no same-day work at all.
 */
function isWeekend(daysAgo: number): boolean {
  const dayOfWeek = (((1 - daysAgo) % 7) + 7) % 7;
  return dayOfWeek === 0 || dayOfWeek === 6;
}

function pickIntent(ctx: SeedContext, daysAgo: number): IntentDefinition {
  const inTrendWindow = daysAgo <= TREND_WINDOW_DAYS;
  const entries = DEMAND.map(
    (d) =>
      [
        requireIntent(d.key),
        d.weight * (inTrendWindow ? (d.trendMultiplier ?? 1) : 1),
      ] as const,
  );
  return ctx.prng.weighted(entries);
}

/**
 * Generate one conversation and everything it produces.
 *
 * The branch is decided by the scorer, not by the generator: whether a
 * conversation self-resolves depends on whether retrieval could actually answer
 * it. That keeps the self-service rate an emergent property of the knowledge
 * base rather than a number chosen in advance.
 */
function generateConversation(
  state: RelayState,
  ctx: SeedContext,
  intent: IntentDefinition,
  daysAgo: number,
  hourOffset: number,
): void {
  const employee = ctx.prng.pick(EMPLOYEES.filter((e) => e.isActive));
  const startedAt = atHour(daysAgo, hourOffset, ctx.prng.int(0, 55));

  const conversationId = ctx.ids.next('conversation') as ConversationId;
  const messageId = ctx.ids.next('message') as MessageId;

  state.conversations[conversationId] = {
    id: conversationId,
    employeeId: employee.id,
    channel: ctx.prng.chance(0.78) ? 'chat_intake' : 'help_portal',
    startedAt,
    intentKey: intent.key,
    category: intent.category,
    resolution: null,
    resolvedAt: null,
    messageIds: [messageId],
  };
  state.conversationOrder.push(conversationId);

  state.messages[messageId] = {
    id: messageId,
    conversationId,
    author: 'employee',
    sentAt: startedAt,
    body: intent.canonicalQuery,
    answerId: null,
    actionRefs: [],
  };

  record(state, ctx, 'conversation.started', startedAt, employeeActor(employee.id), {
    conversationId,
    employeeId: employee.id,
    category: intent.category,
    channel: state.conversations[conversationId]!.channel,
  });
  record(state, ctx, 'message.sent', startedAt, employeeActor(employee.id), {
    conversationId,
    messageId,
    author: 'employee',
  });

  const result = retrieve(intent, KNOWLEDGE_ARTICLES);

  record(state, ctx, 'search.performed', startedAt, SYSTEM_ACTOR, {
    conversationId,
    query: intent.canonicalQuery,
    retrievedArticleIds: result.citedIds,
    topScore: result.topScore,
  });

  if (result.failure !== null) {
    record(state, ctx, 'search.failed', startedAt, SYSTEM_ACTOR, {
      conversationId,
      query: intent.canonicalQuery,
      reason: result.failure,
      topicKey: result.topicKey,
    });
    escalate(state, ctx, conversationId, employee.id, intent, daysAgo, result);
    return;
  }

  // An answer was offered. Whether the employee accepted it is the open question.
  const answerId = ctx.ids.next('answer') as AnswerId;
  const answerMessageId = ctx.ids.next('message') as MessageId;

  state.answers[answerId] = {
    id: answerId,
    summary: `Guidance for: ${intent.canonicalQuery}`,
    steps: result.cited.map((article, i) => ({
      ordinal: i + 1,
      text: article.bodySummary,
      articleId: article.id,
    })),
    articleIds: result.citedIds,
    confidence: result.score.confidence,
    band: result.score.band,
    rationale: result.score.rationale,
    sensitiveDomain: intent.sensitiveDomain,
    canSelfResolve: result.score.canSelfResolve,
  };

  state.messages[answerMessageId] = {
    id: answerMessageId,
    conversationId,
    author: 'assistant',
    sentAt: startedAt,
    body: state.answers[answerId]!.summary,
    answerId,
    actionRefs: [],
  };
  state.conversations[conversationId]!.messageIds.push(answerMessageId);

  record(state, ctx, 'message.sent', startedAt, ASSISTANT_ACTOR, {
    conversationId,
    messageId: answerMessageId,
    author: 'assistant',
  });
  record(state, ctx, 'answer.presented', startedAt, ASSISTANT_ACTOR, {
    conversationId,
    answerId,
    confidence: result.score.confidence,
    band: result.score.band,
    articleIds: result.citedIds,
    sensitiveDomain: intent.sensitiveDomain,
  });

  // Acceptance tracks confidence: a better-grounded answer is accepted more often.
  const acceptanceProbability = 0.35 + result.score.confidence * 0.55;
  const helpful = ctx.prng.chance(acceptanceProbability);

  record(state, ctx, 'answer.feedback', startedAt, employeeActor(employee.id), {
    answerId,
    conversationId,
    verdict: helpful ? 'helpful' : 'unhelpful',
    reasonCode: helpful ? null : ctx.prng.pick(['incomplete', 'not_my_situation', 'out_of_date']),
  });

  if (helpful) {
    const resolvedAt = atHour(daysAgo, hourOffset, 12);
    state.conversations[conversationId]!.resolution = 'self_service';
    state.conversations[conversationId]!.resolvedAt = resolvedAt;
    record(state, ctx, 'conversation.resolved', resolvedAt, employeeActor(employee.id), {
      conversationId,
      resolution: 'self_service',
    });
    return;
  }

  escalate(state, ctx, conversationId, employee.id, intent, daysAgo, result);
}

/** Turn a failed conversation into a case, with whatever context survived. */
function escalate(
  state: RelayState,
  ctx: SeedContext,
  conversationId: ConversationId,
  employeeId: EmployeeId,
  intent: IntentDefinition,
  daysAgo: number,
  result: ReturnType<typeof retrieve>,
): void {
  const createdAt = atHour(daysAgo, 9 + ctx.prng.int(0, 6), ctx.prng.int(0, 50));
  const caseId = ctx.ids.next('case') as CaseId;

  /*
   * Not every historical case carries complete context. Roughly a fifth are
   * missing the impact or urgency rationale, which is what gives the
   * context-completeness metric something real to report and somewhere to
   * improve. A metric that always reads 100% measures nothing.
   */
  const complete = ctx.prng.chance(0.8);

  const supportCase = createCase({
    id: caseId,
    employeeId,
    conversationId,
    intent,
    retrieval: result,
    source: result.failure !== null ? 'low_confidence_handoff' : 'self_service_escalation',
    createdAt,
    context: {
      ...EMPTY_CASE_CONTEXT,
      problemStatement: intent.canonicalQuery,
      attemptedActionsSummary: 'Tried the suggested self-service steps without success.',
      businessImpact: complete ? 'Unable to complete routine work until resolved.' : null,
      urgencyRationale: complete ? `Reported as ${intent.defaultUrgency} by the employee.` : null,
      affectedSystem: intent.system,
      conversationTranscriptRef: conversationId,
    },
    attemptedActions: [
      { text: 'Followed the suggested guidance', outcome: 'failed', sourceMessageId: null },
    ],
  });

  state.conversations[conversationId]!.resolution = 'escalated';
  state.conversations[conversationId]!.resolvedAt = createdAt;
  record(state, ctx, 'conversation.resolved', createdAt, SYSTEM_ACTOR, {
    conversationId,
    resolution: 'escalated',
  });

  advanceCase(state, ctx, supportCase, daysAgo);
}

/** Walk a seeded case through a plausible agent lifecycle. */
function advanceCase(
  state: RelayState,
  ctx: SeedContext,
  supportCase: SupportCase,
  daysAgo: number,
): void {
  state.cases[supportCase.id] = supportCase;
  state.caseOrder.push(supportCase.id);

  record(state, ctx, 'case.created', supportCase.createdAt, SYSTEM_ACTOR, {
    caseId: supportCase.id,
    conversationId: supportCase.conversationId,
    employeeId: supportCase.employeeId,
    category: supportCase.category,
    system: supportCase.system,
    urgency: supportCase.urgency,
    source: supportCase.source,
    contextCompleteness: contextCompleteness(supportCase.structuredContext),
  });

  const agent = ctx.prng.pick(AGENTS);
  const assignedAt = atHour(daysAgo, 10 + ctx.prng.int(0, 4));
  supportCase.assigneeId = agent.id;
  record(state, ctx, 'case.assigned', assignedAt, agentActor(agent.id), {
    caseId: supportCase.id,
    agentId: agent.id,
    assignmentType: 'auto',
  });

  const setStatus = (to: SupportCase['status'], at: string, isRegression = false) => {
    const from = supportCase.status;
    supportCase.status = to;
    supportCase.updatedAt = at as SupportCase['updatedAt'];
    if (isRegression) supportCase.reworkCount += 1;
    record(state, ctx, 'case.status_changed', at as SupportCase['updatedAt'], agentActor(agent.id), {
      caseId: supportCase.id,
      from,
      to,
      reason: null,
      isRegression,
    });
  };

  setStatus('triage', assignedAt);
  setStatus('in_progress', atHour(daysAgo, 12));

  // A minority of cases bounce back to triage. That rework is the metric.
  if (ctx.prng.chance(0.15)) {
    setStatus('triage', atHour(daysAgo, 13), true);
    setStatus('in_progress', atHour(daysAgo, 14));
  }

  /*
   * Older cases have had time to close, and nearly all of them do. An earlier
   * pass left 15% of them open indefinitely, which meant every open case in the
   * queue was long past its service target — 12 open, 12 breached, and an SLA
   * column that carried no information. Real queues are mostly recent work.
   */
  const closeProbability = daysAgo > 5 ? 0.97 : daysAgo > 2 ? 0.6 : 0.25;
  if (ctx.prng.chance(closeProbability)) {
    const resolvedAt = atHour(daysAgo, 16);
    setStatus('resolved', resolvedAt);
    supportCase.resolutionType = 'agent_resolved';
    record(state, ctx, 'case.resolved', resolvedAt, agentActor(agent.id), {
      caseId: supportCase.id,
      resolutionType: 'agent_resolved',
      reworkCount: supportCase.reworkCount,
    });
  }
}

/** Generate the full background corpus into `state`. */
export function buildBackgroundHistory(state: RelayState, ctx: SeedContext): void {
  // Down to and including today, so the queue holds genuinely fresh work.
  for (let daysAgo = HISTORY_DAYS; daysAgo >= 0; daysAgo--) {
    if (isWeekend(daysAgo)) continue;

    const volume = BASE_DAILY_VOLUME + ctx.prng.int(-1, 2);
    for (let i = 0; i < volume; i++) {
      const intent = pickIntent(ctx, daysAgo);
      // A working day, 09:00 to 16:00.
      generateConversation(state, ctx, intent, daysAgo, 9 + ctx.prng.int(0, 7));
    }
  }

}
