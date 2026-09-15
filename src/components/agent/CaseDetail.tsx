'use client';

/**
 * Case detail.
 *
 * The claim this screen has to earn: an agent can act without asking the
 * employee a single re-qualifying question. So the layout leads with the
 * structured context and the transcript, not with the action controls — you read
 * before you decide.
 *
 * Three registers, kept visually distinct throughout:
 *   supporting evidence  transcript, context, sources
 *   AI recommendation    routing rationale, suggested knowledge, similar cases
 *   human decision       the action bar, always the highest-contrast element
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowLeft, Layers, Link2, Send, Check } from 'lucide-react';

import { ARTICLE_BY_ID } from '@/data/seed/articles';
import { AGENTS, EMPLOYEE_BY_ID } from '@/data/seed/people';
import { similarCases, MIN_CLUSTER_SIZE, SIMILARITY_THRESHOLD } from '@/domain/clustering/detect';
import { CONTEXT_FIELD_LABELS, contextCompleteness, missingContextFields } from '@/domain/cases/context';
import { readSla } from '@/domain/cases/sla';
import { absoluteLabel, durationLabel, relativeLabel } from '@/domain/time';
import { formatActionClaim } from '@/domain/trust/actionClaims';
import {
  CASE_CONTEXT_FIELDS,
  CASE_STATUSES,
  LABELS,
  type CaseId,
  type CaseStatus,
  type RelayEvent,
} from '@/domain/types';
import { useRelayStore } from '@/store/store';
import { useHydrated } from '@/components/shell/AppShell';
import { CompletenessCell, EmptyState, SlaChip, StatusChip, UrgencyLabel } from './primitives';

export function CaseDetail({ caseId }: { caseId: CaseId }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const supportCase = useRelayStore((s) => s.data.cases[caseId]);
  const cases = useRelayStore((s) => s.data.cases);
  const messages = useRelayStore((s) => s.data.messages);
  const conversations = useRelayStore((s) => s.data.conversations);
  const events = useRelayStore((s) => s.data.events);
  const clusters = useRelayStore((s) => s.data.clusters);
  const drafts = useRelayStore((s) => s.data.updateDrafts);

  const assignCase = useRelayStore((s) => s.assignCase);
  const changeCaseStatus = useRelayStore((s) => s.changeCaseStatus);
  const linkKnowledge = useRelayStore((s) => s.linkKnowledge);
  const markRelated = useRelayStore((s) => s.markRelated);
  const draftEmployeeUpdate = useRelayStore((s) => s.draftEmployeeUpdate);
  const sendEmployeeUpdate = useRelayStore((s) => s.sendEmployeeUpdate);
  const escalateToEngineering = useRelayStore((s) => s.escalateToEngineering);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState('');

  const caseEvents = useMemo(
    () => events.filter((e) => 'caseId' in e.payload && e.payload.caseId === caseId),
    [events, caseId],
  );

  const transcript = useMemo(() => {
    const conversationId = supportCase ? supportCase.conversationId : null;
    if (conversationId === null) return [];
    const conversation = conversations[conversationId];
    return conversation?.messageIds.map((id) => messages[id]).filter(Boolean) ?? [];
  }, [supportCase, conversations, messages]);

  const suggestions = useMemo(
    () => (supportCase ? similarCases(supportCase, Object.values(cases)) : []),
    [supportCase, cases],
  );

  if (!hydrated) return null;

  if (!supportCase) {
    return (
      <div className="p-8">
        <EmptyState
          testId="case-not-found"
          title="No such case"
          body="This case id is not in the current demo state. Reset demo restores the seeded set."
        />
      </div>
    );
  }

  const employee = EMPLOYEE_BY_ID.get(supportCase.employeeId);
  const sla = readSla(supportCase.createdAt, supportCase.slaTargetAt);
  const completeness = contextCompleteness(supportCase.structuredContext);
  const missing = missingContextFields(supportCase.structuredContext);
  const cluster = supportCase.clusterId ? clusters[supportCase.clusterId] : null;
  const caseDrafts = Object.values(drafts).filter((d) => d.caseId === caseId);

  return (
    <div className="flex h-full flex-col" data-testid="case-detail">
      <header className="border-b border-border px-6 py-4">
        <Link
          href="/agent"
          className="mb-2 inline-flex items-center gap-1 text-[12px] text-fg-subtle hover:text-fg"
        >
          <ArrowLeft size={12} aria-hidden />
          Queue
        </Link>
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold tracking-tight">{supportCase.title}</h1>
            <p className="meta mt-1">
              {supportCase.id} &middot; {employee?.displayName} ({employee?.department}) &middot;{' '}
              {supportCase.system} &middot; opened {relativeLabel(supportCase.createdAt)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusChip status={supportCase.status} />
            <UrgencyLabel urgency={supportCase.urgency} />
            <SlaChip
              state={sla.state}
              detail={sla.state === 'breached' ? undefined : durationLabel(sla.remainingMs)}
            />
          </div>
        </div>
      </header>

      {/* --- human decision register: always the highest-contrast row --- */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-6 py-2.5">
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Assign to</span>
          <select
            value={supportCase.assigneeId ?? ''}
            onChange={(e) => e.target.value && assignCase(caseId, e.target.value as never)}
            data-testid="action-assign"
            className="rounded-sm border border-border-strong bg-surface-sunken px-2 py-1.5 text-[12px] text-fg focus:border-border-accent focus:outline-none"
          >
            <option value="">Unassigned</option>
            {AGENTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          <span className="sr-only">Change status</span>
          <select
            value={supportCase.status}
            onChange={(e) => changeCaseStatus(caseId, e.target.value as CaseStatus)}
            data-testid="action-status"
            className="rounded-sm border border-border-strong bg-surface-sunken px-2 py-1.5 text-[12px] text-fg focus:border-border-accent focus:outline-none"
          >
            {CASE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LABELS.caseStatus[status]}
              </option>
            ))}
          </select>
        </label>

        {supportCase.issueId === null ? (
          <button
            type="button"
            data-testid="action-escalate-engineering"
            onClick={() => router.push(`/engineering/${escalateToEngineering(caseId)}`)}
            className="rounded-sm bg-accent px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover"
          >
            {supportCase.clusterId
              ? 'Escalate cluster to engineering'
              : 'Escalate to engineering'}
          </button>
        ) : (
          <Link
            href={`/engineering/${supportCase.issueId}`}
            prefetch={false}
            data-testid="linked-issue"
            className="rounded-sm border border-accent/40 bg-accent-muted px-2.5 py-1.5 text-[12px] text-accent-fg hover:bg-surface-hover"
          >
            Linked to {supportCase.issueId}
          </Link>
        )}

        <button
          type="button"
          data-testid="action-compose-update"
          onClick={() => {
            const body = `Update on ${supportCase.id}: we are actively working on this and will let you know as soon as it is resolved.`;
            setDraftBody(body);
            setDraftId(draftEmployeeUpdate(caseId, body));
          }}
          className="rounded-sm border border-border-strong px-2.5 py-1.5 text-[12px] text-fg hover:bg-surface-hover"
        >
          Compose update
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] overflow-hidden">
        <div className="min-w-0 space-y-5 overflow-y-auto px-6 py-5">
          {draftId && (
            <UpdatePreview
              body={draftBody}
              sent={caseDrafts.find((d) => d.id === draftId)?.sentAt !== null}
              onSend={() => sendEmployeeUpdate(draftId as never)}
            />
          )}

          <Panel title="Structured context" testId="structured-context"
            aside={<CompletenessCell value={completeness} />}
          >
            <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 gap-y-2">
              {CASE_CONTEXT_FIELDS.map((field) => {
                const value = supportCase.structuredContext[field];
                return (
                  <div key={field} className="contents">
                    <dt className="text-[12px] text-fg-subtle">{CONTEXT_FIELD_LABELS[field]}</dt>
                    <dd
                      className={`text-[12px] leading-relaxed ${value ? 'text-fg-muted' : 'text-critical'}`}
                      data-testid={`context-${field}`}
                    >
                      {value ?? 'Not captured — an agent has to ask'}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {missing.length === 0 && (
              <p className="mt-3 text-[12px] text-positive" data-testid="context-complete">
                All six required fields carried across. No re-qualifying questions needed.
              </p>
            )}
          </Panel>

          <Panel title="Attempted actions" testId="attempted-actions">
            {supportCase.attemptedActions.length === 0 ? (
              <p className="text-[12px] text-fg-subtle">Nothing recorded.</p>
            ) : (
              <ul className="space-y-1.5">
                {supportCase.attemptedActions.map((action, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-fg-muted">
                    <span className="meta mt-0.5 shrink-0 uppercase">{action.outcome}</span>
                    <span>{action.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Conversation" testId="case-transcript">
            {transcript.length === 0 ? (
              <p className="text-[12px] text-fg-subtle">No conversation attached.</p>
            ) : (
              <ol className="space-y-3">
                {transcript.map((m) => (
                  <li key={m!.id}>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12px] font-medium text-fg">{m!.author}</span>
                      <span className="meta">{absoluteLabel(m!.sentAt)}</span>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-fg-muted">{m!.body}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="Audit history" testId="audit-log">
            <ol className="space-y-1.5">
              {caseEvents.map((event) => (
                <li key={event.id} className="flex items-baseline gap-2.5">
                  <span className="meta w-[92px] shrink-0">{absoluteLabel(event.at).split(',')[1]}</span>
                  <span className="text-[12px] text-fg-muted">{describe(event)}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        {/* --- AI recommendation register --- */}
        <aside className="min-w-0 space-y-4 overflow-y-auto border-l border-border px-5 py-5">
          <div className="register-ai rounded-sm bg-surface p-3.5" data-testid="routing-rationale">
            <div className="text-[11px] font-medium uppercase tracking-wider text-accent-fg">
              Routing rationale
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-fg">
              {supportCase.routingRationale.explanation}
            </p>
            <ul className="mt-2 space-y-1">
              {supportCase.routingRationale.matchedSignals.map((signal) => (
                <li key={signal} className="meta flex gap-1.5">
                  <span aria-hidden className="mt-[6px] h-px w-2 shrink-0 bg-accent" />
                  {signal}
                </li>
              ))}
            </ul>
          </div>

          <Panel title="Suggested knowledge" testId="suggested-knowledge" compact>
            {supportCase.suggestedArticleIds.length === 0 ? (
              <p className="text-[12px] text-fg-subtle">
                Nothing relevant found — this is a knowledge gap.
              </p>
            ) : (
              <ul className="space-y-2">
                {supportCase.suggestedArticleIds.map((id) => {
                  const article = ARTICLE_BY_ID.get(id);
                  const linked = supportCase.linkedArticleIds.includes(id);
                  return (
                    <li key={id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[12px] text-fg">{article?.title}</div>
                        <div className="meta">{id}</div>
                      </div>
                      <button
                        type="button"
                        disabled={linked}
                        onClick={() => linkKnowledge(caseId, id)}
                        data-testid={`link-article-${id}`}
                        className="shrink-0 rounded-xs border border-border px-1.5 py-0.5 text-[11px] text-fg-muted hover:border-border-strong hover:text-fg disabled:border-positive/30 disabled:text-positive"
                      >
                        {linked ? <Check size={11} aria-hidden /> : <Link2 size={11} aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel
            title="Similar cases"
            testId="similar-cases"
            compact
            aside={
              cluster ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-accent-fg">
                  <Layers size={10} aria-hidden />
                  {cluster.id}
                </span>
              ) : undefined
            }
          >
            {suggestions.length === 0 ? (
              <p className="text-[12px] text-fg-subtle">No comparable cases in the last 7 days.</p>
            ) : (
              <>
                <ul className="space-y-2">
                  {suggestions.map(({ supportCase: other, breakdown }) => {
                    const related = supportCase.relatedCaseIds.includes(other.id);
                    return (
                      <li key={other.id} className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/agent/${other.id}`}
                            prefetch={false}
                            className="block truncate text-[12px] text-fg hover:text-accent-fg"
                          >
                            {other.id}
                          </Link>
                          <div className="meta">
                            {EMPLOYEE_BY_ID.get(other.employeeId)?.displayName} &middot; match{' '}
                            {breakdown.score.toFixed(2)}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={related}
                          onClick={() => markRelated(caseId, other.id)}
                          data-testid={`mark-related-${other.id}`}
                          className="shrink-0 rounded-xs border border-border px-1.5 py-0.5 text-[11px] text-fg-muted hover:border-border-strong hover:text-fg disabled:border-positive/30 disabled:text-positive"
                        >
                          {related ? 'Related' : 'Mark related'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2.5 text-[11px] leading-relaxed text-fg-subtle" data-testid="cluster-threshold">
                  {cluster
                    ? `Cluster formed from ${cluster.caseIds.length} cases.`
                    : `${supportCase.relatedCaseIds.length + 1} of ${MIN_CLUSTER_SIZE} cases needed to form a recurring-issue cluster.`}{' '}
                  Matching uses a {SIMILARITY_THRESHOLD} similarity threshold over category, system,
                  and symptoms.
                </p>
              </>
            )}
          </Panel>

          {cluster && (
            <div className="register-evidence p-3.5" data-testid="cluster-panel">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-accent-fg">
                <Layers size={11} aria-hidden />
                Recurring issue {cluster.id}
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-fg">
                {cluster.caseIds.length} cases from{' '}
                {new Set(cluster.caseIds.map((id) => cases[id]?.employeeId)).size} employees.
              </p>
              <ul className="mt-2 space-y-1">
                {cluster.matchRationale.map((reason) => (
                  <li key={reason} className="meta flex gap-1.5">
                    <span aria-hidden className="mt-[6px] h-px w-2 shrink-0 bg-border-strong" />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/** A drafted update is inert until a human sends it (ADR D-006). */
function UpdatePreview({ body, sent, onSend }: { body: string; sent: boolean; onSend: () => void }) {
  return (
    <div
      data-testid="update-preview"
      className={`rounded-sm border p-3.5 ${sent ? 'border-positive/30 bg-positive-muted' : 'border-caution/30 bg-caution-muted'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg">
          {sent ? 'Update sent' : 'Draft — not sent'}
        </span>
        {!sent && (
          <button
            type="button"
            onClick={onSend}
            data-testid="action-send-update"
            className="inline-flex items-center gap-1.5 rounded-sm bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover"
          >
            <Send size={11} aria-hidden />
            Send to employee
          </button>
        )}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">{body}</p>
      {!sent && (
        <p className="mt-2 text-[11px] text-fg-subtle">
          Nothing has reached the employee. The system will not record this as sent until you send it.
        </p>
      )}
    </div>
  );
}

function Panel({
  title,
  testId,
  children,
  aside,
  compact,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section data-testid={testId} className={`rounded-sm border border-border bg-surface ${compact ? 'p-3.5' : 'p-4'}`}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * Audit lines are generated from the event, never authored, so the history is a
 * projection of recorded state rather than a parallel narrative (ADR D-006).
 */
function describe(event: RelayEvent): string {
  const claim = formatActionClaim(event);
  return claim !== '' ? claim : event.type.replace(/[._]/g, ' ');
}
