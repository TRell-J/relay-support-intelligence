/**
 * The hand-authored SSO narrative.
 *
 * Four prior login-loop cases, filed by four different employees over six days,
 * all following a password reset, all on the identity provider. Individually
 * each one reads like user error and was handled that way — two are still open,
 * one bounced back to triage, one was closed as resolved and then reopened.
 *
 * That is the whole argument of the prototype in one dataset: nothing is wrong
 * with how any single case was handled, and yet the pattern was invisible until
 * something looked across them.
 *
 * These are authored rather than generated because the demo depends on their
 * specifics: distinct employees (so the affected-user count is real), a spread
 * inside the seven-day clustering window, and enough variation in handling that
 * the cluster is a discovery rather than an obvious duplicate.
 */
import { atHour } from '@/domain/clock';
import { EMPTY_CASE_CONTEXT } from '@/domain/cases/context';
import { createCase } from '@/domain/cases/create';
import { requireIntent } from '@/domain/retrieval/intents';
import { retrieve } from '@/domain/retrieval/search';
import { contextCompleteness } from '@/domain/cases/context';
import type { CaseId, ConversationId, EmployeeId, MessageId } from '@/domain/ids';
import type { CaseStatus, SupportCase } from '@/domain/types';
import type { RelayState, SeedContext } from '../buildInitialState';
import { KNOWLEDGE_ARTICLES } from './articles';
import { AGENTS, EMPLOYEES } from './people';
import { ASSISTANT_ACTOR, SYSTEM_ACTOR, agentActor, employeeActor, record } from './recorder';

interface NarrativeCaseSpec {
  /** Employee index into EMPLOYEES, chosen so departments differ. */
  employeeIndex: number;
  daysAgo: number;
  hour: number;
  /** What the employee actually wrote. */
  transcript: string;
  /** Where the case ended up before anyone looked across them. */
  finalStatus: CaseStatus;
  /** True when the agent closed it and the employee came back. */
  reopened: boolean;
  businessImpact: string | null;
  urgencyRationale: string | null;
  agentIndex: number;
}

/**
 * Four cases, deliberately handled inconsistently — which is what happens when
 * four agents each see one instance of a systemic problem.
 */
const SSO_CASES: NarrativeCaseSpec[] = [
  {
    employeeIndex: 4, // Ana Sofia Reyes, Engineering
    daysAgo: 6,
    hour: 10,
    transcript:
      'Reset my password yesterday and now single sign-on bounces me back to the login screen every time. Cleared cookies already.',
    finalStatus: 'resolved',
    reopened: true,
    businessImpact: 'Blocked from the deployment console for most of a working day.',
    urgencyRationale: 'Reported as high; unable to access primary tooling.',
    agentIndex: 1,
  },
  {
    employeeIndex: 9, // Claire Beaumont, Finance
    daysAgo: 4,
    hour: 14,
    transcript:
      'I cannot sign in to anything since changing my password. It loops between the login page and the app. Tried a different browser, same thing.',
    finalStatus: 'in_progress',
    reopened: false,
    businessImpact: 'Month-end close tasks delayed.',
    urgencyRationale: 'Reported as high; close deadline this week.',
    agentIndex: 2,
  },
  {
    employeeIndex: 14, // Devon Pryce, Marketing
    daysAgo: 3,
    hour: 9,
    transcript:
      'Single sign-on redirect loop. Started right after the forced password change. Incognito does not help.',
    finalStatus: 'waiting_on_employee',
    reopened: false,
    // Context deliberately incomplete: this is the one an agent had to chase.
    businessImpact: null,
    urgencyRationale: null,
    agentIndex: 0,
  },
  {
    employeeIndex: 20, // Bao Tran, Support
    // Today, and deliberately placed so its 8-hour target is nearly spent: the
    // newest instance of the pattern is the one about to breach, which is both
    // realistic and the state the SLA column most needs to demonstrate.
    daysAgo: 0,
    hour: 10,
    transcript:
      'Password reset this morning, now stuck in an SSO loop. I can authenticate but it never lands on the application.',
    finalStatus: 'in_progress',
    reopened: false,
    businessImpact: 'Cannot access the case queue to work tickets.',
    urgencyRationale: 'Reported as high; blocks the employee from their own queue.',
    agentIndex: 2,
  },
];

/**
 * Seed the four prior SSO cases.
 *
 * Deliberately does *not* create a cluster. Detection is something the agent
 * triggers during the demo by marking cases related — the moment of recognition
 * has to happen on screen, not in the seed.
 */
export function buildSsoNarrative(state: RelayState, ctx: SeedContext): void {
  const intent = requireIntent('sso_login_loop');
  const result = retrieve(intent, KNOWLEDGE_ARTICLES);

  for (const spec of SSO_CASES) {
    const employee = EMPLOYEES[spec.employeeIndex]!;
    const agent = AGENTS[spec.agentIndex]!;
    const startedAt = atHour(spec.daysAgo, spec.hour);

    const conversationId = ctx.ids.next('conversation') as ConversationId;
    const messageId = ctx.ids.next('message') as MessageId;

    state.conversations[conversationId] = {
      id: conversationId,
      employeeId: employee.id as EmployeeId,
      channel: 'chat_intake',
      startedAt,
      intentKey: 'sso_login_loop',
      category: 'Access & Identity',
      resolution: 'escalated',
      resolvedAt: startedAt,
      messageIds: [messageId],
    };
    state.conversationOrder.push(conversationId);

    state.messages[messageId] = {
      id: messageId,
      conversationId,
      author: 'employee',
      sentAt: startedAt,
      body: spec.transcript,
      answerId: null,
      actionRefs: [],
    };

    record(state, ctx, 'conversation.started', startedAt, employeeActor(employee.id), {
      conversationId,
      employeeId: employee.id,
      category: 'Access & Identity',
      channel: 'chat_intake',
    });
    record(state, ctx, 'message.sent', startedAt, employeeActor(employee.id), {
      conversationId,
      messageId,
      author: 'employee',
    });
    record(state, ctx, 'search.performed', startedAt, SYSTEM_ACTOR, {
      conversationId,
      query: intent.canonicalQuery,
      retrievedArticleIds: result.citedIds,
      topScore: result.topScore,
    });
    record(state, ctx, 'search.failed', startedAt, SYSTEM_ACTOR, {
      conversationId,
      query: intent.canonicalQuery,
      reason: 'below_threshold',
      topicKey: intent.topicKey,
    });
    record(state, ctx, 'conversation.resolved', startedAt, SYSTEM_ACTOR, {
      conversationId,
      resolution: 'escalated',
    });

    const createdAt = atHour(spec.daysAgo, spec.hour, 4);
    const caseId = ctx.ids.next('case') as CaseId;

    const supportCase = createCase({
      id: caseId,
      employeeId: employee.id,
      conversationId,
      intent,
      retrieval: result,
      source: 'low_confidence_handoff',
      createdAt,
      urgency: 'high',
      title: 'Single sign-on redirect loop after password reset',
      context: {
        ...EMPTY_CASE_CONTEXT,
        problemStatement: spec.transcript,
        attemptedActionsSummary: 'Cleared cookies and retried in a private window; loop persists.',
        businessImpact: spec.businessImpact,
        urgencyRationale: spec.urgencyRationale,
        affectedSystem: 'Identity Provider',
        conversationTranscriptRef: conversationId,
      },
      attemptedActions: [
        { text: 'Cleared session cookies', outcome: 'failed', sourceMessageId: messageId },
        { text: 'Retried in a private window', outcome: 'failed', sourceMessageId: messageId },
        { text: 'Tried an alternate browser', outcome: 'failed', sourceMessageId: null },
      ],
    });

    state.cases[caseId] = supportCase;
    state.caseOrder.push(caseId);

    record(state, ctx, 'case.created', createdAt, SYSTEM_ACTOR, {
      caseId,
      conversationId,
      employeeId: employee.id,
      category: 'Access & Identity',
      system: 'Identity Provider',
      urgency: 'high',
      source: 'low_confidence_handoff',
      contextCompleteness: contextCompleteness(supportCase.structuredContext),
    });

    supportCase.assigneeId = agent.id;
    record(state, ctx, 'case.assigned', createdAt, agentActor(agent.id), {
      caseId,
      agentId: agent.id,
      assignmentType: 'manual',
    });

    const move = (to: CaseStatus, hoursAfter: number, isRegression = false) => {
      const at = atHour(spec.daysAgo, spec.hour + hoursAfter);
      const from = supportCase.status;
      supportCase.status = to;
      supportCase.updatedAt = at;
      if (isRegression) supportCase.reworkCount += 1;
      record(state, ctx, 'case.status_changed', at, agentActor(agent.id), {
        caseId,
        from,
        to,
        reason: null,
        isRegression,
      });
    };

    move('triage', 1);
    move('in_progress', 2);

    if (spec.reopened) {
      // Closed as user error, then reopened when the loop came back. The single
      // clearest signal that the individual diagnosis was wrong.
      move('resolved', 5);
      move('in_progress', 26, true);
      move(spec.finalStatus, 30);
    } else if (spec.finalStatus !== 'in_progress') {
      move(spec.finalStatus, 6);
    }

    // Each agent linked the same adjacent article, and none of them resolved it.
    supportCase.linkedArticleIds = ['KB-0121'];
    record(state, ctx, 'case.knowledge_linked', atHour(spec.daysAgo, spec.hour + 1), agentActor(agent.id), {
      caseId,
      articleId: 'KB-0121',
    });
  }
}

/** The four prior SSO cases, in the order they were filed. Used by tests and the UI. */
export function ssoNarrativeCaseIds(state: RelayState): CaseId[] {
  return Object.values(state.cases)
    .filter(
      (c): c is SupportCase =>
        c.system === 'Identity Provider' && c.conceptTags.includes('login_loop'),
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .map((c) => c.id);
}

void ASSISTANT_ACTOR;
