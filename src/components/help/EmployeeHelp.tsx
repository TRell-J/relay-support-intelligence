'use client';

/**
 * Employee Help.
 *
 * Two columns. The conversation takes 46% on the left, capped at 560px; the
 * answer and its evidence always take the wider right-hand region. That ratio is
 * the argument: chat is the intake mechanism, not the product, and the evidence
 * is what the employee actually has to judge.
 *
 * Slack-inspired in interaction pattern only — threaded turns, an inline
 * composer — in an original visual language, and nowhere claiming a connection
 * to any external tool.
 */
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CornerDownLeft, Loader2, MessageSquare } from 'lucide-react';

import { DEMO_SCENARIOS } from '@/data/seed/scenarios';
import { EMPLOYEE_BY_ID } from '@/data/seed/people';
import { relativeLabel } from '@/domain/time';
import { resolveActionClaims } from '@/domain/trust/actionClaims';
import type { Answer, Message } from '@/domain/types';
import { DEMO_EMPLOYEE_ID, useRelayStore } from '@/store/store';
import { useHydrated } from '@/components/shell/AppShell';
import { AnswerPanel } from './AnswerPanel';

export function EmployeeHelp() {
  const hydrated = useHydrated();
  const router = useRouter();
  const [draft, setDraft] = useState('');

  const activeConversationId = useRelayStore((s) => s.activeConversationId);
  const isRetrieving = useRelayStore((s) => s.isRetrieving);
  const fallbackNotice = useRelayStore((s) => s.fallbackNotice);
  const startScenario = useRelayStore((s) => s.startScenario);
  const submitFreeText = useRelayStore((s) => s.submitFreeText);
  const giveFeedback = useRelayStore((s) => s.giveFeedback);
  const resolveBySelfService = useRelayStore((s) => s.resolveBySelfService);
  const escalateConversation = useRelayStore((s) => s.escalateConversation);
  const openConversation = useRelayStore((s) => s.openConversation);

  const storedConversation = useRelayStore((s) =>
    activeConversationId ? s.data.conversations[activeConversationId] : undefined,
  );

  /*
   * Gate every data-dependent branch on hydration, not just the thread.
   *
   * The open conversation is restored from sessionStorage, which the server
   * cannot see. Guarding only the transcript left the header button and the
   * answer panel rendering different trees on the server and the client, which
   * surfaced in a production build as React error #418.
   */
  const conversation = hydrated ? storedConversation : undefined;
  /*
   * Selectors must return stable references. Zustand v5 is built on
   * useSyncExternalStore, so a selector that maps or filters into a new array
   * re-renders forever. Select the stable maps, derive with useMemo.
   */
  const messageMap = useRelayStore((s) => s.data.messages);
  const answers = useRelayStore((s) => s.data.answers);
  const events = useRelayStore((s) => s.data.events);

  const messages = useMemo<Message[]>(
    () =>
      conversation
        ? conversation.messageIds
            .map((id) => messageMap[id])
            .filter((m): m is Message => m !== undefined)
        : [],
    [conversation, messageMap],
  );

  const answer: Answer | null = useMemo(() => {
    const withAnswer = [...messages].reverse().find((m) => m.answerId !== null);
    return withAnswer?.answerId ? (answers[withAnswer.answerId] ?? null) : null;
  }, [messages, answers]);

  const feedbackGiven = useMemo(() => {
    if (!answer) return null;
    const event = events.find((e) => e.type === 'answer.feedback' && e.payload.answerId === answer.id);
    return event?.type === 'answer.feedback' ? event.payload.verdict : null;
  }, [answer, events]);

  const resolved = conversation?.resolution === 'self_service';
  const escalated = conversation?.resolution === 'escalated';

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || isRetrieving) return;
    setDraft('');
    void submitFreeText(text);
  };

  const onEscalate = () => {
    if (!activeConversationId) return;
    const caseId = escalateConversation(activeConversationId);
    router.push(`/agent/${caseId}`);
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-33px)]">
      {/* ---- conversation column: capped, never dominant ---- */}
      <div
        data-testid="conversation-column"
        /*
         * Proportional, not fixed. A flat 640px looked right in isolation but,
         * once the 232px rail is subtracted, left the conversation wider than the
         * evidence at 1440 — the exact inversion the visual direction rules out.
         * 46% keeps evidence the larger region at every supported width.
         */
        className="flex w-[46%] min-w-[360px] max-w-[560px] shrink-0 flex-col border-r border-border"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight">Employee Help</h1>
            <p className="mt-0.5 text-[12px] text-fg-subtle">
              Signed in as {EMPLOYEE_BY_ID.get(DEMO_EMPLOYEE_ID)?.displayName ?? 'an employee'} &middot;{' '}
              {EMPLOYEE_BY_ID.get(DEMO_EMPLOYEE_ID)?.department}
            </p>
          </div>
          {/*
            Starting a fresh question used to depend on reloading the page. Once
            the open conversation began surviving a refresh, that accident
            stopped working — and a surface with no way to ask a second question
            was never right to begin with.
          */}
          {conversation && (
            <button
              type="button"
              onClick={() => openConversation(null)}
              data-testid="new-conversation"
              className="shrink-0 rounded-sm border border-border px-2.5 py-1.5 text-[12px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
              style={{ transitionDuration: 'var(--duration-fast)' }}
            >
              New question
            </button>
          )}
        </header>

        <div className="flex flex-1 flex-col overflow-y-auto px-6 py-5">
          {!conversation ? (
            <ScenarioLauncher onLaunch={(id) => void startScenario(id)} disabled={!hydrated} />
          ) : (
            <Thread messages={messages} events={events} isRetrieving={isRetrieving} />
          )}
        </div>

        <form onSubmit={onSubmit} className="border-t border-border p-3">
          {fallbackNotice && (
            <p
              data-testid="fallback-notice"
              className="mb-2 rounded-sm border border-info/25 bg-info-muted px-3 py-2 text-[12px] leading-relaxed text-fg-muted"
            >
              {fallbackNotice}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) onSubmit(e);
              }}
              rows={2}
              disabled={isRetrieving}
              placeholder="Describe what you need help with..."
              aria-label="Describe what you need help with"
              data-testid="composer"
              className="min-h-[54px] flex-1 resize-none rounded-sm border border-border bg-surface-sunken px-3 py-2 text-[13px] text-fg placeholder:text-fg-subtle focus:border-border-accent focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!draft.trim() || isRetrieving}
              data-testid="composer-send"
              aria-label="Send"
              className="rounded-sm border border-border-strong px-2.5 py-2.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-30"
              style={{ transitionDuration: 'var(--duration-fast)' }}
            >
              <CornerDownLeft size={14} aria-hidden />
            </button>
          </div>
        </form>
      </div>

      {/* ---- answer and evidence: the wider region ---- */}
      <div data-testid="evidence-column" className="min-w-0 flex-1 overflow-y-auto bg-canvas px-7 py-5">
        {isRetrieving ? (
          <RetrievingState />
        ) : answer ? (
          <AnswerPanel
            answer={answer}
            feedbackGiven={feedbackGiven}
            resolved={resolved}
            escalated={escalated}
            onFeedback={(verdict) => giveFeedback(answer.id, verdict)}
            onResolve={() => activeConversationId && resolveBySelfService(activeConversationId)}
            onEscalate={onEscalate}
          />
        ) : (
          <EvidenceEmptyState />
        )}
      </div>
    </div>
  );
}

function ScenarioLauncher({
  onLaunch,
  disabled,
}: {
  onLaunch: (id: (typeof DEMO_SCENARIOS)[number]['id']) => void;
  disabled: boolean;
}) {
  return (
    <div data-testid="scenario-launcher">
      <p className="text-[13px] leading-relaxed text-fg-muted">
        Start from a seeded scenario, or type your own question below. Each scenario exercises a
        different outcome of the same retrieval and scoring logic.
      </p>
      <ul className="mt-4 space-y-2">
        {DEMO_SCENARIOS.map((scenario) => (
          <li key={scenario.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onLaunch(scenario.id)}
              data-testid={`scenario-${scenario.id}`}
              className="w-full rounded-sm border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-border-strong hover:bg-surface-hover disabled:opacity-50"
              style={{ transitionDuration: 'var(--duration-fast)' }}
            >
              <div className="text-[13px] font-medium text-fg">{scenario.label}</div>
              <div className="mt-0.5 text-[12px] leading-snug text-fg-subtle">{scenario.blurb}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Thread({
  messages,
  events,
  isRetrieving,
}: {
  messages: Message[];
  events: readonly Parameters<typeof resolveActionClaims>[1][number][];
  isRetrieving: boolean;
}) {
  return (
    // Anchored to the top, not the bottom. Pinning a short thread to the bottom
    // reads correctly in a messaging app, where the newest message matters most,
    // but this column is a record of how a question was answered and it is read
    // from the beginning. Bottom-pinning also left roughly 550px of empty column
    // above a two-message exchange, which made a dense tool look unfinished.
    <ol className="space-y-4" data-testid="conversation-thread">
      {messages.map((message) => (
        <li key={message.id} data-testid={`message-${message.author}`}>
          <div className="flex items-baseline gap-2">
            <span className="text-[12px] font-medium text-fg">{authorLabel(message.author)}</span>
            <span className="meta">{relativeLabel(message.sentAt)}</span>
          </div>
          <p
            className={[
              'mt-1 text-[13px] leading-relaxed',
              message.author === 'system' ? 'text-fg-subtle italic' : 'text-fg-muted',
            ].join(' ')}
          >
            {message.body}
          </p>

          {/*
            Action claims are rendered from the recorded events, not from the
            message text, so what a reader sees is provably backed by state.
          */}
          {message.actionRefs.length > 0 && (
            <ul className="mt-1.5 space-y-0.5" data-testid="action-claims">
              {resolveActionClaims(message, events).map(({ event, claim }) => (
                <li key={event.id} className="meta flex items-center gap-1.5">
                  <span aria-hidden className="h-px w-2 bg-positive" />
                  {claim}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}

      {isRetrieving && (
        <li className="flex items-center gap-2 text-[12px] text-fg-subtle" data-testid="thread-retrieving">
          <Loader2 size={12} className="animate-spin" aria-hidden />
          Searching the knowledge base...
        </li>
      )}
    </ol>
  );
}

function authorLabel(author: Message['author']): string {
  switch (author) {
    case 'employee':
      return 'You';
    case 'assistant':
      return 'Relay';
    case 'agent':
      return 'Support agent';
    default:
      return 'System';
  }
}

function RetrievingState() {
  return (
    <div className="flex flex-col gap-3" data-testid="answer-loading" aria-busy="true">
      <div className="flex items-center gap-2 text-[12px] text-fg-subtle">
        <Loader2 size={13} className="animate-spin" aria-hidden />
        Retrieving and scoring sources
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-sm bg-surface" />
        ))}
      </div>
    </div>
  );
}

function EvidenceEmptyState() {
  return (
    <div
      data-testid="answer-empty"
      className="flex h-full flex-col items-center justify-center text-center"
    >
      <MessageSquare size={18} className="text-fg-subtle" aria-hidden />
      <p className="mt-3 max-w-[280px] text-[13px] leading-relaxed text-fg-subtle">
        Answers appear here with their sources, confidence, and the reasoning behind that
        confidence.
      </p>
    </div>
  );
}
