'use client';

/**
 * Engineering issue detail.
 *
 * The screen has one job beyond tracking: make the difference between an
 * incident and a systemic problem legible. A single linked case reads as one
 * person's bad day; five linked cases with a shared signature and a derived
 * blast radius reads as a defect. The layout leads with that contrast.
 *
 * Every impact figure carries its provenance inline, because a number a reviewer
 * cannot trace is a number they are right to discount.
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, Layers, Send } from 'lucide-react';

import { EMPLOYEE_BY_ID } from '@/data/seed/people';
import { PROPAGATION, deriveImpact, planPropagation, proposeSeverity } from '@/domain/issues/issue';
import { absoluteLabel, relativeLabel } from '@/domain/time';
import { formatActionClaim } from '@/domain/trust/actionClaims';
import {
  ISSUE_STATUSES,
  LABELS,
  SEVERITIES,
  type IssueId,
  type IssueStatus,
  type RelayEvent,
  type Severity,
} from '@/domain/types';
import { useRouter } from 'next/navigation';
import { useRelayStore } from '@/store/store';
import { useHydrated } from '@/components/shell/AppShell';
import { EmptyState, StatusChip } from '@/components/agent/primitives';
import { SeverityChip } from './IssueList';

export function IssueDetail({ issueId }: { issueId: IssueId }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const issue = useRelayStore((s) => s.data.issues[issueId]);
  const cases = useRelayStore((s) => s.data.cases);
  const clusters = useRelayStore((s) => s.data.clusters);
  const drafts = useRelayStore((s) => s.data.updateDrafts);
  const events = useRelayStore((s) => s.data.events);

  const changeIssueStatus = useRelayStore((s) => s.changeIssueStatus);
  const overrideSeverity = useRelayStore((s) => s.overrideSeverity);
  const sendEmployeeUpdate = useRelayStore((s) => s.sendEmployeeUpdate);
  const createOpportunityFromIssue = useRelayStore((s) => s.createOpportunityFromIssue);

  const [pendingStatus, setPendingStatus] = useState<IssueStatus | null>(null);

  const linked = useMemo(
    () => (issue ? issue.linkedCaseIds.map((id) => cases[id]).filter((c) => c !== undefined) : []),
    [issue, cases],
  );

  const issueEvents = useMemo(
    () => events.filter((e) => 'issueId' in e.payload && e.payload.issueId === issueId),
    [events, issueId],
  );

  if (!hydrated) return null;

  if (!issue) {
    return (
      <div className="p-8">
        <EmptyState
          testId="issue-not-found"
          title="No such issue"
          body="This issue id is not in the current demo state. Reset demo restores the seeded set."
        />
      </div>
    );
  }

  const impact = deriveImpact(linked);
  const proposal = proposeSeverity(linked);
  const cluster = issue.clusterId ? clusters[issue.clusterId] : null;
  const unsentDrafts = Object.values(drafts).filter((d) => d.issueId === issueId && d.sentAt === null);
  const preview = pendingStatus ? planPropagation(issueId, pendingStatus, linked) : null;

  return (
    <div className="flex h-full flex-col" data-testid="issue-detail">
      <header className="border-b border-border px-6 py-4">
        <Link href="/engineering" className="mb-2 inline-flex items-center gap-1 text-[12px] text-fg-subtle hover:text-fg">
          <ArrowLeft size={12} aria-hidden />
          Issues
        </Link>
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold tracking-tight">{issue.title}</h1>
            <p className="meta mt-1">
              {issue.key} &middot; {issue.ownerTeam} &middot; {issue.ownerName} &middot; opened{' '}
              {relativeLabel(issue.createdAt)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SeverityChip severity={issue.severity} overridden={issue.severityOverridden} />
            <span className="text-[12px] text-fg-muted">{LABELS.issueStatus[issue.status]}</span>
          </div>
        </div>
      </header>

      {/* --- human decision register --- */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-6 py-2.5">
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Issue status</span>
          <select
            value={issue.status}
            onChange={(e) => setPendingStatus(e.target.value as IssueStatus)}
            data-testid="issue-status-select"
            className="rounded-sm border border-border-strong bg-surface-sunken px-2 py-1.5 text-[12px] text-fg focus:border-border-accent focus:outline-none"
          >
            {ISSUE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LABELS.issueStatus[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          <span className="sr-only">Override severity</span>
          <select
            value={issue.severity}
            onChange={(e) =>
              overrideSeverity(issueId, e.target.value as Severity, 'Adjusted by the owning engineer')
            }
            data-testid="issue-severity-select"
            className="rounded-sm border border-border-strong bg-surface-sunken px-2 py-1.5 text-[12px] text-fg focus:border-border-accent focus:outline-none"
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {LABELS.severity[s]}
              </option>
            ))}
          </select>
        </label>

        {/*
          Closes the loop: a defect with a measured blast radius becomes a
          prioritized product bet that inherits the same evidence, rather than
          being re-argued from memory in a planning meeting.
        */}
        <button
          type="button"
          data-testid="create-opportunity"
          onClick={() => {
            const created = createOpportunityFromIssue(issueId);
            // Land on the thing that was just created, not on whatever ranks first.
            router.push(`/intelligence?tab=opportunities&opportunity=${created}`);
          }}
          className="rounded-sm border border-border-strong px-2.5 py-1.5 text-[12px] text-fg hover:bg-surface-hover"
        >
          Create product opportunity
        </button>

        {issue.severityOverridden && (
          <span className="text-[11px] text-caution" data-testid="severity-override-note">
            Overridden — the derived proposal was {LABELS.severity[proposal.severity]}
          </span>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px] overflow-hidden">
        <div className="min-w-0 space-y-5 overflow-y-auto px-6 py-5">
          {preview && (
            <PropagationPreview
              plan={preview}
              onConfirm={() => {
                changeIssueStatus(issueId, preview.toStatus);
                setPendingStatus(null);
              }}
              onCancel={() => setPendingStatus(null)}
            />
          )}

          {/*
            The teaching panel: one case versus a pattern. Rendered as a direct
            comparison because the distinction is the entire point of the product.
          */}
          <section className="rounded-sm border border-border bg-surface p-4" data-testid="incident-vs-systemic">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              Incident or systemic problem
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div className="register-evidence p-3">
                <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Read alone</div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">
                  {linked[0]?.title ?? 'A single support case'} — one employee, handled by one agent,
                  closed or in progress. Nothing about it suggests a defect.
                </p>
              </div>
              <div className={`p-3 ${cluster ? 'register-ai rounded-sm bg-surface' : 'register-evidence'}`}>
                <div className="text-[11px] uppercase tracking-wider text-accent-fg">Read together</div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-fg">
                  {cluster
                    ? `${linked.length} cases from ${impact.affectedEmployees} employees sharing one signature inside seven days. That is a platform defect.`
                    : 'Only one case is linked. No pattern has been established yet.'}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-sm border border-border bg-surface p-4" data-testid="impact-panel">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              Business impact
            </h2>
            <dl className="mt-3 grid grid-cols-3 gap-4">
              <Figure
                label="Affected employees"
                value={impact.affectedEmployees}
                provenance="distinct employees across linked cases"
                testId="impact-employees"
              />
              <Figure
                label="Agent hours"
                value={impact.agentHoursConsumed}
                provenance="estimated from urgency and rework per case"
                testId="impact-agent-hours"
              />
              <Figure
                label="Employee hours lost"
                value={Math.round(impact.employeeMinutesLost / 60)}
                provenance="estimated from urgency per case"
                testId="impact-employee-hours"
              />
            </dl>
          </section>

          <section className="rounded-sm border border-border bg-surface p-4" data-testid="linked-cases">
            <h2 className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              Linked support cases
            </h2>
            <ul className="space-y-2">
              {linked.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/agent/${c.id}`} prefetch={false} className="text-[12px] text-fg hover:text-accent-fg">
                      {c.id}
                    </Link>
                    <span className="meta ml-2">
                      {EMPLOYEE_BY_ID.get(c.employeeId)?.displayName} &middot; {c.urgency}
                    </span>
                  </div>
                  <StatusChip status={c.status} />
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-sm border border-border bg-surface p-4" data-testid="issue-timeline">
            <h2 className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              Timeline
            </h2>
            <ol className="space-y-1.5">
              {issueEvents.map((event) => (
                <li key={event.id} className="flex items-baseline gap-2.5">
                  <span className="meta w-[92px] shrink-0">{absoluteLabel(event.at).split(',')[1]}</span>
                  <span className="text-[12px] text-fg-muted">{describe(event)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="min-w-0 space-y-4 overflow-y-auto border-l border-border px-5 py-5">
          <div className="register-ai rounded-sm bg-surface p-3.5" data-testid="severity-proposal">
            <div className="text-[11px] font-medium uppercase tracking-wider text-accent-fg">
              Derived severity proposal
            </div>
            <p className="mt-1.5 text-[13px] text-fg">{LABELS.severity[proposal.severity]}</p>
            <ul className="mt-2 space-y-1">
              {proposal.reasons.map((reason) => (
                <li key={reason} className="meta flex gap-1.5">
                  <span aria-hidden className="mt-[6px] h-px w-2 shrink-0 bg-accent" />
                  {reason}
                </li>
              ))}
            </ul>
          </div>

          {cluster && (
            <div className="register-evidence p-3.5" data-testid="issue-cluster">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-accent-fg">
                <Layers size={11} aria-hidden />
                {cluster.id}
              </div>
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

          <section className="rounded-sm border border-border bg-surface p-3.5" data-testid="evidence-list">
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              Evidence
            </h2>
            <ul className="space-y-1.5">
              {issue.evidence.map((item, i) => (
                <li key={`${item.ref}-${i}`} className="text-[12px] leading-snug text-fg-muted">
                  <span className="meta mr-1.5 uppercase">{item.kind}</span>
                  <span className="text-fg">{item.ref}</span>
                  <span className="block text-[11px] text-fg-subtle">{item.note}</span>
                </li>
              ))}
            </ul>
          </section>

          {unsentDrafts.length > 0 && (
            <section
              className="rounded-sm border border-caution/30 bg-caution-muted p-3.5"
              data-testid="unsent-drafts"
            >
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-fg">
                {unsentDrafts.length} employee update{unsentDrafts.length === 1 ? '' : 's'} drafted, none sent
              </h2>
              <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">
                {unsentDrafts[0]?.body}
              </p>
              <p className="mt-2 text-[11px] text-fg-subtle">
                Status changes update the support side automatically. Telling the employee is a
                separate, deliberate act.
              </p>
              <button
                type="button"
                data-testid="send-all-updates"
                onClick={() => unsentDrafts.forEach((d) => sendEmployeeUpdate(d.id))}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-sm bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover"
              >
                <Send size={11} aria-hidden />
                Send all {unsentDrafts.length}
              </button>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Preview shows exactly what will change, computed by the function that applies it. */
function PropagationPreview({
  plan,
  onConfirm,
  onCancel,
}: {
  plan: ReturnType<typeof planPropagation>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-sm border border-accent/30 bg-surface p-4" data-testid="propagation-preview">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-accent-fg">
          Moving to {LABELS.issueStatus[plan.toStatus]}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            data-testid="propagation-cancel"
            className="rounded-sm border border-border px-2.5 py-1 text-[12px] text-fg-muted hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            data-testid="propagation-confirm"
            className="rounded-sm bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover"
          >
            Apply
          </button>
        </div>
      </div>
      <ul className="mt-2.5 space-y-1 text-[12px] text-fg-muted">
        <li>
          {plan.caseStatus === null
            ? 'No support case status changes — this is engineering-side activity.'
            : `${plan.affectedCaseIds.length} linked case${plan.affectedCaseIds.length === 1 ? '' : 's'} move to ${LABELS.caseStatus[plan.caseStatus]}.`}
        </li>
        <li>An employee update is drafted for each linked case, and left unsent.</li>
      </ul>
      <p className="register-evidence mt-2.5 p-2.5 text-[12px] leading-relaxed text-fg-muted">
        {PROPAGATION[plan.toStatus].updateBody}
      </p>
    </div>
  );
}

function Figure({
  label,
  value,
  provenance,
  testId,
}: {
  label: string;
  value: number;
  provenance: string;
  testId: string;
}) {
  return (
    <div data-testid={testId}>
      <dd className="num text-[20px] font-medium leading-none text-fg">{value}</dd>
      <dt className="mt-1.5 text-[12px] text-fg-muted">{label}</dt>
      <p className="mt-0.5 text-[11px] leading-snug text-fg-subtle">{provenance}</p>
    </div>
  );
}

function describe(event: RelayEvent): string {
  const claim = formatActionClaim(event);
  return claim !== '' ? claim : event.type.replace(/[._]/g, ' ');
}
