'use client';

/**
 * The application store.
 *
 * One store, four workspaces. Escalating a case in the Agent Workspace updates
 * the queue, the issue list and every metric because all of them select from
 * here — cross-workspace consistency is a property of the architecture rather
 * than something each screen has to remember (ADR D-003).
 *
 * Rules:
 *  - Actions are the only place state changes.
 *  - Every action that represents something happening appends an event first,
 *    then updates entities. The log is the source of truth; entities are a
 *    materialized view of it.
 *  - Time comes from the store's own offset counter, never the wall clock.
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import {
  buildInitialState,
  hashState,
  type RelayState,
} from '@/data/buildInitialState';
import { RELAY_SEED } from '@/data/prng';
import { KNOWLEDGE_ARTICLES } from '@/data/seed/articles';
import { SCENARIO_BY_ID } from '@/data/seed/scenarios';
import { EMPTY_CASE_CONTEXT, contextCompleteness } from '@/domain/cases/context';
import { createCase } from '@/domain/cases/create';
import { DEMO_NOW_MS, TICK_MS, fromMs, type Iso } from '@/domain/clock';
import { createIdFactory } from '@/domain/ids';
import { matchIntent, requireIntent, type IntentDefinition } from '@/domain/retrieval/intents';
import { retrieve, type RetrievalResult } from '@/domain/retrieval/search';
import type {
  Actor,
  AgentId,
  AnswerId,
  ArticleId,
  CaseEventId,
  CaseId,
  CaseStatus,
  ClusterId,
  ConversationId,
  FeedbackVerdict,
  MessageId,
  RelayEvent,
  IssueId,
  IssueStatus,
  ScenarioId,
  OpportunityId,
  OpportunityState,
  PriorityInputs,
  Severity,
  UpdateId,
} from '@/domain/types';
import { CASE_STATUS_RANK } from '@/domain/types';
import { buildCluster, findCandidate } from '@/domain/clustering/detect';
import {
  deriveImpact,
  issueKeyFor,
  planPropagation,
  proposeSeverity,
} from '@/domain/issues/issue';
import { computePriority } from '@/domain/prioritization/score';
import { ACTIVE_EMPLOYEE_COUNT } from '@/data/seed/people';
import {
  clearPersisted,
  loadActiveConversation,
  loadPersisted,
  persist,
  persistActiveConversation,
} from './persist';

/** Transient UI state that is not part of the demo record. */
interface UiState {
  /** The conversation currently open in Employee Help. */
  activeConversationId: ConversationId | null;
  /** True while a simulated retrieval is in flight, so the UI can show progress. */
  isRetrieving: boolean;
  /** Set when free text fell back to the nearest seeded intent. */
  fallbackNotice: string | null;
}

export interface RelayStore extends UiState {
  data: RelayState;

  /* demo controls */
  resetDemo: () => void;
  stateHash: () => string;

  /* employee help */
  startScenario: (scenarioId: ScenarioId) => Promise<ConversationId>;
  submitFreeText: (text: string) => Promise<ConversationId>;
  giveFeedback: (answerId: AnswerId, verdict: FeedbackVerdict) => void;
  resolveBySelfService: (conversationId: ConversationId) => void;
  escalateConversation: (conversationId: ConversationId) => CaseId;
  openConversation: (conversationId: ConversationId | null) => void;

  /* agent workspace */
  assignCase: (caseId: CaseId, agentId: AgentId) => void;
  changeCaseStatus: (caseId: CaseId, to: CaseStatus, reason?: string) => void;
  linkKnowledge: (caseId: CaseId, articleId: ArticleId) => void;
  /** Returns the cluster id if this relation completed one. */
  markRelated: (caseId: CaseId, relatedCaseId: CaseId) => ClusterId | null;
  draftEmployeeUpdate: (caseId: CaseId, body: string) => UpdateId;
  sendEmployeeUpdate: (updateId: UpdateId) => void;

  /* engineering */
  escalateToEngineering: (caseId: CaseId) => IssueId;
  changeIssueStatus: (issueId: IssueId, to: IssueStatus) => void;
  overrideSeverity: (issueId: IssueId, to: Severity, rationale: string) => void;

  /* product opportunities */
  updatePriorityInput: (
    opportunityId: OpportunityId,
    key: keyof PriorityInputs,
    value: number,
  ) => void;
  changeOpportunityState: (opportunityId: OpportunityId, to: OpportunityState) => void;
  createOpportunityFromIssue: (issueId: IssueId) => OpportunityId;
}

/** The employee the demo speaks as. Fixed so the narrative is reproducible. */
export const DEMO_EMPLOYEE_ID = 'EMP-0001';

const employeeActor = (id: string): Actor => ({ kind: 'employee', id });
const agentActor = (id: string): Actor => ({ kind: 'agent', id });
const engineerActor = (id: string): Actor => ({ kind: 'engineer', id });
const SYSTEM_ACTOR: Actor = { kind: 'system', id: null };
const ASSISTANT_ACTOR: Actor = { kind: 'assistant', id: null };

/** Simulated retrieval latency, so the loading state is a real state. */
export const RETRIEVAL_DELAY_MS = 480;

/**
 * Runtime id minting.
 *
 * Rebuilt from the persisted counters on load so a rehydrated session keeps
 * minting forward instead of colliding with seeded ids.
 */
function idsFor(data: RelayState) {
  const factory = createIdFactory();
  factory.restore(data.idCounters as Parameters<typeof factory.restore>[0]);
  return factory;
}

function nowOf(data: RelayState): Iso {
  return fromMs(DEMO_NOW_MS + data.clockOffsetMs);
}

/** Advance the demo clock one tick and return the new instant. */
function tick(data: RelayState): Iso {
  data.clockOffsetMs += TICK_MS;
  return nowOf(data);
}

/** Append an event. Mirrors the seed-time recorder so both produce the same shape. */
function append<T extends RelayEvent['type']>(
  data: RelayState,
  type: T,
  actor: Actor,
  payload: Extract<RelayEvent, { type: T }>['payload'],
): CaseEventId {
  const ids = idsFor(data);
  const id = ids.next('event') as CaseEventId;
  data.idCounters = ids.snapshot();
  data.events.push({ id, at: tick(data), actor, type, payload } as RelayEvent);
  return id;
}

function mint(data: RelayState, kind: Parameters<ReturnType<typeof idsFor>['next']>[0]): string {
  const ids = idsFor(data);
  const id = ids.next(kind);
  data.idCounters = ids.snapshot();
  return id;
}

/** Open a conversation for an intent and record the employee's opening turn(s). */
function openConversationFor(
  data: RelayState,
  intent: IntentDefinition,
  bodies: string[],
): ConversationId {
  const conversationId = mint(data, 'conversation') as ConversationId;
  const at = nowOf(data);

  data.conversations[conversationId] = {
    id: conversationId,
    employeeId: DEMO_EMPLOYEE_ID,
    channel: 'chat_intake',
    startedAt: at,
    intentKey: intent.key,
    category: intent.category,
    resolution: null,
    resolvedAt: null,
    messageIds: [],
  };
  data.conversationOrder.push(conversationId);

  append(data, 'conversation.started', employeeActor(DEMO_EMPLOYEE_ID), {
    conversationId,
    employeeId: DEMO_EMPLOYEE_ID,
    category: intent.category,
    channel: 'chat_intake',
  });

  for (const body of bodies) {
    const messageId = mint(data, 'message') as MessageId;
    data.messages[messageId] = {
      id: messageId,
      conversationId,
      author: 'employee',
      sentAt: nowOf(data),
      body,
      answerId: null,
      actionRefs: [],
    };
    data.conversations[conversationId]!.messageIds.push(messageId);
    append(data, 'message.sent', employeeActor(DEMO_EMPLOYEE_ID), {
      conversationId,
      messageId,
      author: 'employee',
    });
  }

  return conversationId;
}

/**
 * Run retrieval and record the outcome.
 *
 * The assistant message is only written when an answer actually cleared the
 * threshold. When it did not, the conversation gets a system message saying so —
 * the product never fills the gap with a hedged paragraph.
 */
function respond(
  data: RelayState,
  conversationId: ConversationId,
  intent: IntentDefinition,
  specificity: number,
  questionUnderstood = true,
): RetrievalResult {
  const result = retrieve(intent, KNOWLEDGE_ARTICLES, { specificity, questionUnderstood });

  append(data, 'search.performed', SYSTEM_ACTOR, {
    conversationId,
    query: intent.canonicalQuery,
    retrievedArticleIds: result.citedIds,
    topScore: result.topScore,
  });

  if (result.failure !== null) {
    append(data, 'search.failed', SYSTEM_ACTOR, {
      conversationId,
      query: intent.canonicalQuery,
      reason: result.failure,
      topicKey: result.topicKey,
    });
  }

  const answerId = mint(data, 'answer') as AnswerId;
  data.answers[answerId] = {
    id: answerId,
    summary: summaryFor(intent, result),
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

  const messageId = mint(data, 'message') as MessageId;
  data.messages[messageId] = {
    id: messageId,
    conversationId,
    author: 'assistant',
    sentAt: nowOf(data),
    body: data.answers[answerId]!.summary,
    answerId,
    // This message reports an answer; it does not claim an action occurred.
    actionRefs: [],
  };
  data.conversations[conversationId]!.messageIds.push(messageId);

  append(data, 'message.sent', ASSISTANT_ACTOR, {
    conversationId,
    messageId,
    author: 'assistant',
  });
  append(data, 'answer.presented', ASSISTANT_ACTOR, {
    conversationId,
    answerId,
    confidence: result.score.confidence,
    band: result.score.band,
    articleIds: result.citedIds,
    sensitiveDomain: intent.sensitiveDomain,
  });

  return result;
}

/** What the assistant says. Shaped by the outcome, never overstating it. */
function summaryFor(intent: IntentDefinition, result: RetrievalResult): string {
  if (result.failure === 'no_results') {
    return `I could not find anything in the knowledge base that covers this. Nothing published addresses ${intent.requiredConcepts
      .slice(0, 2)
      .map((c) => c.replace(/_/g, ' '))
      .join(' or ')}, so rather than guess I would rather hand this to someone who can answer properly.`;
  }
  if (result.failure !== null) {
    return `I found related guidance but nothing that covers your exact situation, so I am not confident enough to answer. A support agent should take this.`;
  }
  return `Here is what should get you connected again. This comes from ${result.cited.length} current source${
    result.cited.length === 1 ? '' : 's'
  } owned by ${result.cited[0]?.ownerTeam ?? 'the service desk'}.`;
}

/**
 * Apply an issue status change to every linked case, and draft the employee
 * update it implies.
 *
 * The draft is created unsent, always. Propagation tells the support side what
 * changed; telling the *employee* is a separate act that a person performs and
 * the log records (ADR D-006). Nothing here writes `case.update_sent`.
 */
function applyPropagation(data: RelayState, issueId: IssueId, toStatus: IssueStatus): void {
  const issue = data.issues[issueId];
  if (!issue) return;

  const linked = issue.linkedCaseIds
    .map((id) => data.cases[id])
    .filter((c): c is NonNullable<typeof c> => c !== undefined);

  const plan = planPropagation(issueId, toStatus, linked);

  if (plan.caseStatus !== null && plan.affectedCaseIds.length > 0) {
    for (const caseId of plan.affectedCaseIds) {
      const supportCase = data.cases[caseId];
      if (!supportCase) continue;
      const from = supportCase.status;
      supportCase.status = plan.caseStatus;
      supportCase.updatedAt = nowOf(data);

      append(data, 'case.status_changed', SYSTEM_ACTOR, {
        caseId,
        from,
        to: plan.caseStatus,
        reason: `Propagated from ${issue.key}`,
        isRegression: false,
      });

      if (plan.caseStatus === 'resolved') {
        supportCase.resolutionType = 'engineering_fix';
        append(data, 'case.resolved', SYSTEM_ACTOR, {
          caseId,
          resolutionType: 'engineering_fix',
          reworkCount: supportCase.reworkCount,
        });
      }
    }

    append(data, 'issue.propagated', SYSTEM_ACTOR, {
      issueId,
      caseIds: plan.affectedCaseIds,
      toStatus: plan.caseStatus,
    });
  }

  // One unsent draft per linked case, so each employee can be told individually.
  for (const supportCase of linked) {
    const updateId = mint(data, 'update') as UpdateId;
    data.updateDrafts[updateId] = {
      id: updateId,
      caseId: supportCase.id,
      issueId,
      body: plan.updateBody,
      createdAt: nowOf(data),
      sentAt: null,
    };
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const useRelayStore = create<RelayStore>()(
  immer((set, get) => ({
    data: loadPersisted() ?? buildInitialState(RELAY_SEED),
    activeConversationId: loadActiveConversation() as ConversationId | null,
    isRetrieving: false,
    fallbackNotice: null,

    stateHash: () => hashState(get().data),

    resetDemo: () => {
      clearPersisted();
      set((s) => {
        s.data = buildInitialState(RELAY_SEED);
        s.activeConversationId = null;
        s.isRetrieving = false;
        s.fallbackNotice = null;
      });
    },

    openConversation: (conversationId) =>
      set((s) => {
        s.activeConversationId = conversationId;
        s.fallbackNotice = null;
        persistActiveConversation(conversationId);
      }),

    startScenario: async (scenarioId) => {
      const scenario = SCENARIO_BY_ID.get(scenarioId);
      if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);
      const intent = requireIntent(scenario.intentKey);

      let conversationId!: ConversationId;
      set((s) => {
        conversationId = openConversationFor(
          s.data,
          intent,
          scenario.seedMessages.map((m) => m.body),
        );
        s.activeConversationId = conversationId;
        persistActiveConversation(conversationId);
        s.isRetrieving = true;
        s.fallbackNotice = null;
      });

      await wait(RETRIEVAL_DELAY_MS);

      set((s) => {
        respond(s.data, conversationId, intent, 1);
        s.isRetrieving = false;
        persist(s.data);
      });

      return conversationId;
    },

    submitFreeText: async (text) => {
      const match = matchIntent(text);

      let conversationId!: ConversationId;
      set((s) => {
        conversationId = openConversationFor(s.data, match.intent, [text]);
        s.activeConversationId = conversationId;
        persistActiveConversation(conversationId);
        s.isRetrieving = true;
        // Disclosure, not decoration: the product says how it interpreted the input.
        s.fallbackNotice = match.isFallback
          ? `No close match for that wording. Showing the nearest seeded topic: ${match.intent.canonicalQuery}.`
          : null;
      });

      await wait(RETRIEVAL_DELAY_MS);

      set((s) => {
        // A question we could not place is capped, not merely nudged down.
        respond(s.data, conversationId, match.intent, match.isFallback ? 0.3 : 1, !match.isFallback);
        s.isRetrieving = false;
        persist(s.data);
      });

      return conversationId;
    },

    giveFeedback: (answerId, verdict) =>
      set((s) => {
        const answer = s.data.answers[answerId];
        if (!answer) return;
        const conversationId = Object.values(s.data.messages).find((m) => m.answerId === answerId)
          ?.conversationId;
        if (!conversationId) return;

        append(s.data, 'answer.feedback', employeeActor(DEMO_EMPLOYEE_ID), {
          answerId,
          conversationId,
          verdict,
          reasonCode: null,
        });
        persist(s.data);
      }),

    resolveBySelfService: (conversationId) =>
      set((s) => {
        const conversation = s.data.conversations[conversationId];
        if (!conversation || conversation.resolution !== null) return;

        const eventId = append(s.data, 'conversation.resolved', employeeActor(DEMO_EMPLOYEE_ID), {
          conversationId,
          resolution: 'self_service',
        });
        conversation.resolution = 'self_service';
        conversation.resolvedAt = nowOf(s.data);

        // The confirmation message claims an action, so it references the event.
        const messageId = mint(s.data, 'message') as MessageId;
        s.data.messages[messageId] = {
          id: messageId,
          conversationId,
          author: 'system',
          sentAt: nowOf(s.data),
          body: 'Marked resolved through self-service.',
          answerId: null,
          actionRefs: [eventId],
        };
        conversation.messageIds.push(messageId);
        persist(s.data);
      }),

    escalateConversation: (conversationId) => {
      let caseId!: CaseId;

      set((s) => {
        const conversation = s.data.conversations[conversationId];
        if (!conversation) throw new Error(`Unknown conversation: ${conversationId}`);

        const intent = requireIntent(conversation.intentKey);
        const result = retrieve(intent, KNOWLEDGE_ARTICLES);
        const transcript = conversation.messageIds
          .map((id) => s.data.messages[id])
          .filter((m) => m?.author === 'employee')
          .map((m) => m!.body);

        caseId = mint(s.data, 'case') as CaseId;

        /*
         * Every one of the six context fields is populated here. That is the
         * whole claim of the escalation path: the employee does not re-explain
         * anything, and the completeness metric can prove it.
         */
        const supportCase = createCase({
          id: caseId,
          employeeId: conversation.employeeId,
          conversationId,
          intent,
          retrieval: result,
          source: result.score.canSelfResolve ? 'self_service_escalation' : 'low_confidence_handoff',
          createdAt: nowOf(s.data),
          context: {
            ...EMPTY_CASE_CONTEXT,
            problemStatement: transcript[0] ?? intent.canonicalQuery,
            attemptedActionsSummary:
              transcript.length > 1
                ? transcript.slice(1).join(' ')
                : 'Followed the self-service guidance without success.',
            businessImpact:
              intent.defaultUrgency === 'high' || intent.defaultUrgency === 'critical'
                ? 'Employee is blocked from primary tooling and has a time-bound commitment today.'
                : 'Employee cannot complete a routine task until this is resolved.',
            urgencyRationale: `Classified ${intent.defaultUrgency} from the reported impact and the affected system.`,
            affectedSystem: intent.system,
            conversationTranscriptRef: conversationId,
          },
          attemptedActions: transcript.slice(1).map((text) => ({
            text,
            outcome: 'failed' as const,
            sourceMessageId: null,
          })),
        });

        s.data.cases[caseId] = supportCase;
        s.data.caseOrder.push(caseId);

        const createdEventId = append(s.data, 'case.created', SYSTEM_ACTOR, {
          caseId,
          conversationId,
          employeeId: conversation.employeeId,
          category: supportCase.category,
          system: supportCase.system,
          urgency: supportCase.urgency,
          source: supportCase.source,
          contextCompleteness: contextCompleteness(supportCase.structuredContext),
        });

        if (conversation.resolution === null) {
          conversation.resolution = 'escalated';
          conversation.resolvedAt = nowOf(s.data);
          append(s.data, 'conversation.resolved', SYSTEM_ACTOR, {
            conversationId,
            resolution: 'escalated',
          });
        }

        const messageId = mint(s.data, 'message') as MessageId;
        s.data.messages[messageId] = {
          id: messageId,
          conversationId,
          author: 'system',
          sentAt: nowOf(s.data),
          body: `Created support case ${caseId}.`,
          answerId: null,
          actionRefs: [createdEventId],
        };
        conversation.messageIds.push(messageId);

        persist(s.data);
      });

      return caseId;
    },

    /* ------------------------------------------------------ agent workspace -- */

    assignCase: (caseId, agentId) =>
      set((s) => {
        const supportCase = s.data.cases[caseId];
        if (!supportCase || supportCase.assigneeId === agentId) return;

        // Reassignment is rework: someone already spent time on this.
        const isReassignment = supportCase.assigneeId !== null;
        if (isReassignment) supportCase.reworkCount += 1;

        supportCase.assigneeId = agentId;
        supportCase.updatedAt = nowOf(s.data);
        append(s.data, 'case.assigned', agentActor(agentId), {
          caseId,
          agentId,
          assignmentType: 'manual',
        });
        persist(s.data);
      }),

    changeCaseStatus: (caseId, to, reason) =>
      set((s) => {
        const supportCase = s.data.cases[caseId];
        if (!supportCase || supportCase.status === to) return;

        const from = supportCase.status;
        /*
         * A move to a lower rank is a regression — the case went backwards
         * because something was missed. That is the rework signal the agent
         * productivity metric is built from, so it is derived here rather than
         * left to the caller to remember.
         */
        const isRegression = CASE_STATUS_RANK[to] < CASE_STATUS_RANK[from];
        if (isRegression) supportCase.reworkCount += 1;

        supportCase.status = to;
        supportCase.updatedAt = nowOf(s.data);

        append(s.data, 'case.status_changed', agentActor(supportCase.assigneeId ?? 'system'), {
          caseId,
          from,
          to,
          reason: reason ?? null,
          isRegression,
        });

        if (to === 'resolved') {
          supportCase.resolutionType = supportCase.issueId !== null ? 'engineering_fix' : 'agent_resolved';
          append(s.data, 'case.resolved', agentActor(supportCase.assigneeId ?? 'system'), {
            caseId,
            resolutionType: supportCase.resolutionType,
            reworkCount: supportCase.reworkCount,
          });
        }
        persist(s.data);
      }),

    linkKnowledge: (caseId, articleId) =>
      set((s) => {
        const supportCase = s.data.cases[caseId];
        if (!supportCase || supportCase.linkedArticleIds.includes(articleId)) return;

        supportCase.linkedArticleIds.push(articleId);
        supportCase.updatedAt = nowOf(s.data);
        append(s.data, 'case.knowledge_linked', agentActor(supportCase.assigneeId ?? 'system'), {
          caseId,
          articleId,
        });
        persist(s.data);
      }),

    markRelated: (caseId, relatedCaseId) => {
      let formedClusterId: ClusterId | null = null;

      set((s) => {
        const supportCase = s.data.cases[caseId];
        const related = s.data.cases[relatedCaseId];
        if (!supportCase || !related || caseId === relatedCaseId) return;
        if (supportCase.relatedCaseIds.includes(relatedCaseId)) return;

        // Relations are symmetric; recording one direction only would make the
        // queue disagree with itself depending on which case you opened.
        supportCase.relatedCaseIds.push(relatedCaseId);
        related.relatedCaseIds.push(caseId);

        const actor = agentActor(supportCase.assigneeId ?? 'system');
        append(s.data, 'case.related_marked', actor, { caseId, relatedCaseId });

        /*
         * Detection runs on every relation rather than on a schedule: the moment
         * an agent asserts two cases are the same problem is exactly when the
         * system should check whether that is true of more than two.
         */
        const alreadyClustered = supportCase.clusterId !== null;
        if (alreadyClustered) {
          related.clusterId = supportCase.clusterId;
          persist(s.data);
          return;
        }

        const candidate = findCandidate(supportCase, Object.values(s.data.cases));
        if (!candidate.meetsThreshold) {
          persist(s.data);
          return;
        }

        const clusterId = mint(s.data, 'cluster') as ClusterId;
        const cluster = buildCluster(clusterId, candidate, nowOf(s.data));
        s.data.clusters[clusterId] = cluster;

        for (const memberId of cluster.caseIds) {
          const member = s.data.cases[memberId];
          if (member) member.clusterId = clusterId;
        }

        append(s.data, 'cluster.detected', SYSTEM_ACTOR, {
          clusterId,
          caseIds: cluster.caseIds,
          category: cluster.signature.category,
          system: cluster.signature.system,
          conceptTags: cluster.signature.conceptTags,
          firstCaseAt: cluster.firstCaseAt,
        });

        formedClusterId = clusterId;
        persist(s.data);
      });

      return formedClusterId;
    },

    /**
     * Compose an update. Created unsent — nothing reaches the employee until a
     * human sends it and the send is recorded (ADR D-006).
     */
    draftEmployeeUpdate: (caseId, body) => {
      let updateId!: UpdateId;
      set((s) => {
        const supportCase = s.data.cases[caseId];
        if (!supportCase) throw new Error(`Unknown case: ${caseId}`);

        updateId = mint(s.data, 'update') as UpdateId;
        s.data.updateDrafts[updateId] = {
          id: updateId,
          caseId,
          issueId: supportCase.issueId,
          body,
          createdAt: nowOf(s.data),
          sentAt: null,
        };
        persist(s.data);
      });
      return updateId;
    },

    sendEmployeeUpdate: (updateId) =>
      set((s) => {
        const draft = s.data.updateDrafts[updateId];
        if (!draft || draft.sentAt !== null) return;

        const supportCase = s.data.cases[draft.caseId];
        if (!supportCase) return;

        draft.sentAt = nowOf(s.data);
        const eventId = append(
          s.data,
          'case.update_sent',
          agentActor(supportCase.assigneeId ?? 'system'),
          { caseId: draft.caseId, updateId, channel: 'chat_intake' },
        );

        // The conversation gets a claim that cites the send event.
        if (supportCase.conversationId) {
          const conversation = s.data.conversations[supportCase.conversationId];
          if (conversation) {
            const messageId = mint(s.data, 'message') as MessageId;
            s.data.messages[messageId] = {
              id: messageId,
              conversationId: conversation.id,
              author: 'agent',
              sentAt: nowOf(s.data),
              body: draft.body,
              answerId: null,
              actionRefs: [eventId],
            };
            conversation.messageIds.push(messageId);
          }
        }
        persist(s.data);
      }),
    /* ----------------------------------------------------------- engineering -- */

    /**
     * Escalate a case, and with it every case in its cluster.
     *
     * Escalating one member of a known pattern and leaving the rest behind would
     * recreate exactly the fragmentation the cluster exists to undo.
     */
    escalateToEngineering: (caseId) => {
      let issueId!: IssueId;

      set((s) => {
        const seed = s.data.cases[caseId];
        if (!seed) throw new Error(`Unknown case: ${caseId}`);
        if (seed.issueId !== null) {
          issueId = seed.issueId;
          return;
        }

        const cluster = seed.clusterId ? s.data.clusters[seed.clusterId] : null;
        const linkedIds = cluster ? cluster.caseIds : [caseId];
        const linked = linkedIds.map((id) => s.data.cases[id]).filter((c) => c !== undefined);

        const impact = deriveImpact(linked);
        const proposal = proposeSeverity(linked);

        issueId = mint(s.data, 'issue') as IssueId;
        const sequence = Object.keys(s.data.issues).length + 7;

        s.data.issues[issueId] = {
          id: issueId,
          key: issueKeyFor(seed.system, sequence),
          title: cluster
            ? `Recurring: ${seed.title}`
            : seed.title,
          description: cluster
            ? `${linked.length} support cases share a signature across ${seed.system}. ${impact.narrative}`
            : `Escalated from ${caseId}. ${impact.narrative}`,
          clusterId: seed.clusterId,
          linkedCaseIds: linkedIds,
          severity: proposal.severity,
          severityOverridden: false,
          status: 'investigating',
          ownerTeam: seed.system === 'Identity Provider' ? 'Identity Platform' : 'Workplace Platform',
          ownerName: seed.system === 'Identity Provider' ? 'Dana Okoro' : 'Priyanka Iyer',
          suspectedCause: null,
          workaround: null,
          evidence: [
            ...linked.map((c) => ({
              kind: 'case' as const,
              ref: c.id,
              note: `${c.urgency} urgency, filed by ${c.employeeId}`,
            })),
            ...(cluster
              ? [
                  {
                    kind: 'event' as const,
                    ref: cluster.id,
                    note: cluster.matchRationale.join('; '),
                  },
                ]
              : []),
            {
              kind: 'metric' as const,
              ref: 'affected_employees',
              note: `${impact.affectedEmployees} distinct employees, derived from linked cases`,
            },
          ],
          createdAt: nowOf(s.data),
          updatedAt: nowOf(s.data),
        };
        s.data.issueOrder.push(issueId);

        append(s.data, 'issue.created', SYSTEM_ACTOR, {
          issueId,
          clusterId: seed.clusterId,
          severity: proposal.severity,
          linkedCaseIds: linkedIds,
          affectedEmployees: impact.affectedEmployees,
        });

        if (cluster) cluster.status = 'linked_to_issue';

        for (const linkedCase of linked) {
          linkedCase.issueId = issueId;
          append(s.data, 'case.escalated', agentActor(linkedCase.assigneeId ?? 'system'), {
            caseId: linkedCase.id,
            issueId,
          });
        }

        applyPropagation(s.data, issueId, 'investigating');
        persist(s.data);
      });

      return issueId;
    },

    changeIssueStatus: (issueId, to) =>
      set((s) => {
        const issue = s.data.issues[issueId];
        if (!issue || issue.status === to) return;

        const from = issue.status;
        issue.status = to;
        issue.updatedAt = nowOf(s.data);

        append(s.data, 'issue.status_changed', engineerActor(issue.ownerName), {
          issueId,
          from,
          to,
        });

        applyPropagation(s.data, issueId, to);
        persist(s.data);
      }),

    overrideSeverity: (issueId, to, rationale) =>
      set((s) => {
        const issue = s.data.issues[issueId];
        if (!issue || issue.severity === to) return;

        const from = issue.severity;
        issue.severity = to;
        issue.severityOverridden = true;
        issue.updatedAt = nowOf(s.data);

        append(s.data, 'issue.severity_overridden', engineerActor(issue.ownerName), {
          issueId,
          from,
          to,
          rationale,
        });
        persist(s.data);
      }),

    /* --------------------------------------------------- product opportunities -- */

    /**
     * Edit one prioritization input.
     *
     * The resulting score is recorded on the event but never stored on the
     * opportunity — it stays derived, so the inputs and the number can never
     * disagree (ADR D-009).
     */
    updatePriorityInput: (opportunityId, key, value) =>
      set((s) => {
        const opportunity = s.data.opportunities[opportunityId];
        if (!opportunity) return;
        if (typeof opportunity.inputs[key] !== 'number') return;

        (opportunity.inputs[key] as number) = value;
        if (key === 'reachEmployees') opportunity.inputs.reachOverridden = true;

        const { score } = computePriority(opportunity.inputs, ACTIVE_EMPLOYEE_COUNT);
        append(s.data, 'opportunity.scored', SYSTEM_ACTOR, {
          opportunityId,
          inputs: { ...opportunity.inputs },
          score,
        });
        persist(s.data);
      }),

    changeOpportunityState: (opportunityId, to) =>
      set((s) => {
        const opportunity = s.data.opportunities[opportunityId];
        if (!opportunity || opportunity.state === to) return;

        const from = opportunity.state;
        opportunity.state = to;
        append(s.data, 'opportunity.state_changed', SYSTEM_ACTOR, { opportunityId, from, to });
        persist(s.data);
      }),

    /**
     * Turn an engineering issue into a product opportunity.
     *
     * Reach defaults to the issue's derived affected-employee count rather than
     * being typed, so the backlog inherits the evidence chain instead of
     * restating it from memory.
     */
    createOpportunityFromIssue: (issueId) => {
      let opportunityId!: OpportunityId;

      set((s) => {
        const issue = s.data.issues[issueId];
        if (!issue) throw new Error(`Unknown issue: ${issueId}`);

        const existing = Object.values(s.data.opportunities).find((o) =>
          o.evidence.some((e) => e.kind === 'issue' && e.ref === issueId),
        );
        if (existing) {
          opportunityId = existing.id;
          return;
        }

        const linked = issue.linkedCaseIds
          .map((id) => s.data.cases[id])
          .filter((c) => c !== undefined);
        const affected = new Set(linked.map((c) => c.employeeId)).size;

        opportunityId = mint(s.data, 'opportunity') as OpportunityId;
        s.data.opportunities[opportunityId] = {
          id: opportunityId,
          title: `Eliminate the ${issue.title.replace(/^Recurring: /, '').toLowerCase()}`,
          problemStatement:
            `${linked.length} support cases from ${affected} employees share one signature. ` +
            'Resolving the individual cases does not prevent the next one.',
          state: 'discover',
          evidence: [
            { kind: 'issue', ref: issueId, summary: `${issue.key}, severity ${issue.severity}` },
            ...(issue.clusterId
              ? [{ kind: 'cluster' as const, ref: issue.clusterId, summary: `${linked.length} linked cases` }]
              : []),
            ...linked.slice(0, 3).map((c) => ({
              kind: 'case' as const,
              ref: c.id,
              summary: `${c.urgency} urgency, ${c.system}`,
            })),
          ],
          inputs: {
            impact: 4,
            reachEmployees: affected,
            confidence: 0.8,
            effort: 3,
            risk: 0.1,
            reachOverridden: false,
          },
          owner: issue.ownerTeam,
          targetHorizon: 'Exploring',
          createdAt: nowOf(s.data),
        };

        append(s.data, 'opportunity.created', SYSTEM_ACTOR, {
          opportunityId,
          sourceEvidence: [issueId, ...(issue.clusterId ? [issue.clusterId] : [])],
        });
        persist(s.data);
      });

      return opportunityId;
    },
  })),
);
