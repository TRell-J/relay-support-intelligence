'use client';

/**
 * The case queue.
 *
 * Ordered operationally rather than chronologically: breached first, then at
 * risk, then by urgency. An agent opening this should see what is on fire, not
 * what happened to arrive last.
 *
 * Cluster membership is a first-class column, not a badge tucked into the title.
 * It is the column that turns a queue into an instrument for spotting systemic
 * problems, which is the entire argument of this prototype.
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Layers, Search, X } from 'lucide-react';

import { AGENTS, EMPLOYEE_BY_ID, agentName } from '@/data/seed/people';
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  filterQueue,
  sortQueue,
  summarize,
  toQueueRow,
  type QueueFilters,
} from '@/domain/cases/queue';
import { relativeLabel, durationLabel } from '@/domain/time';
import {
  CASE_STATUSES,
  CONFIDENCE_BANDS,
  LABELS,
  SLA_STATES,
  SUPPORT_CATEGORIES,
  URGENCIES,
  type CaseStatus,
  type ConfidenceBand,
  type SlaState,
  type SupportCategory,
  type Urgency,
} from '@/domain/types';
import { useRelayStore } from '@/store/store';
import { useHydrated } from '@/components/shell/AppShell';
import {
  CompletenessCell,
  ConfidenceCell,
  EmptyState,
  SlaChip,
  StatusChip,
  UrgencyLabel,
} from './primitives';

export function CaseQueue() {
  const hydrated = useHydrated();
  const cases = useRelayStore((s) => s.data.cases);
  const [filters, setFilters] = useState<QueueFilters>({ ...DEFAULT_FILTERS });

  const rows = useMemo(() => sortQueue(Object.values(cases).map((c) => toQueueRow(c))), [cases]);
  const visible = useMemo(() => filterQueue(rows, filters), [rows, filters]);
  const summary = useMemo(() => summarize(rows), [rows]);
  const activeCount = activeFilterCount(filters);

  const set = <K extends keyof QueueFilters>(key: K, value: QueueFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-baseline justify-between gap-6">
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight">Agent Workspace</h1>
            <p className="mt-0.5 text-[12px] text-fg-subtle">
              {hydrated ? `${summary.open} open of ${summary.total} cases` : 'Loading queue'}
            </p>
          </div>
          <dl className="flex items-center gap-5" data-testid="queue-summary">
            {/*
              These read from the store, which may rehydrate from sessionStorage
              the server cannot see. Rendering them before hydration produced a
              mismatch (server said 0 clustered, client said 4), so they hold a
              placeholder until the client snapshot is authoritative.
            */}
            <Stat label="Breached" value={hydrated ? summary.breached : null} tone="critical" />
            <Stat label="At risk" value={hydrated ? summary.atRisk : null} tone="caution" />
            <Stat label="Unassigned" value={hydrated ? summary.unassigned : null} />
            <Stat label="Clustered" value={hydrated ? summary.clustered : null} tone="accent" />
          </dl>
        </div>
      </header>

      <div className="border-b border-border px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex items-center">
            <Search size={13} className="pointer-events-none absolute left-2.5 text-fg-subtle" aria-hidden />
            <span className="sr-only">Search cases</span>
            <input
              value={filters.search}
              onChange={(e) => set('search', e.target.value)}
              placeholder="Search id, title, system, symptom"
              data-testid="queue-search"
              className="w-[280px] rounded-sm border border-border bg-surface-sunken py-1.5 pl-8 pr-2.5 text-[12px] text-fg placeholder:text-fg-subtle focus:border-border-accent focus:outline-none"
            />
          </label>

          <Select<CaseStatus>
            label="Status"
            testId="filter-status"
            options={CASE_STATUSES}
            render={(v) => LABELS.caseStatus[v]}
            value={filters.status}
            onChange={(v) => set('status', v)}
          />
          <Select<SupportCategory>
            label="Category"
            testId="filter-category"
            options={SUPPORT_CATEGORIES}
            render={(v) => v}
            value={filters.category}
            onChange={(v) => set('category', v)}
          />
          <Select<Urgency>
            label="Urgency"
            testId="filter-urgency"
            options={URGENCIES}
            render={(v) => LABELS.urgency[v]}
            value={filters.urgency}
            onChange={(v) => set('urgency', v)}
          />
          <Select<SlaState>
            label="SLA"
            testId="filter-sla"
            options={SLA_STATES}
            render={(v) => LABELS.slaState[v]}
            value={filters.slaState}
            onChange={(v) => set('slaState', v)}
          />
          <Select<ConfidenceBand>
            label="AI confidence"
            testId="filter-confidence"
            options={CONFIDENCE_BANDS}
            render={(v) => v}
            value={filters.confidenceBand}
            onChange={(v) => set('confidenceBand', v)}
          />

          <label className="flex items-center gap-1.5 text-[12px] text-fg-muted">
            <span className="sr-only">Assignee</span>
            <select
              value={filters.assignee ?? ''}
              onChange={(e) => set('assignee', e.target.value === '' ? null : e.target.value)}
              data-testid="filter-assignee"
              className="rounded-sm border border-border bg-surface-sunken px-2 py-1.5 text-[12px] text-fg focus:border-border-accent focus:outline-none"
            >
              <option value="">Any assignee</option>
              <option value="unassigned">Unassigned</option>
              {AGENTS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName}
                </option>
              ))}
            </select>
          </label>

          <Toggle
            label="In a cluster"
            testId="filter-clustered"
            active={filters.clustered === true}
            onClick={() => set('clustered', filters.clustered === true ? null : true)}
          />
          <Toggle
            label="Open only"
            testId="filter-open"
            active={filters.openOnly}
            onClick={() => set('openOnly', !filters.openOnly)}
          />

          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => setFilters({ ...DEFAULT_FILTERS })}
              data-testid="filter-clear"
              className="flex items-center gap-1 rounded-sm px-2 py-1.5 text-[12px] text-fg-subtle hover:text-fg"
            >
              <X size={12} aria-hidden />
              Clear {activeCount}
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!hydrated ? null : visible.length === 0 ? (
          <div className="p-6">
            <EmptyState
              testId="queue-empty"
              title="No cases match these filters"
              body="Every constraint is applied together. Clear one or more to widen the result set."
            />
          </div>
        ) : (
          <table className="w-full border-collapse" data-testid="queue-table">
            <caption className="sr-only">
              Support cases, ordered by service-level risk then urgency
            </caption>
            <thead className="sticky top-0 z-10 bg-canvas">
              <tr className="border-b border-border text-[11px] uppercase tracking-wider text-fg-subtle">
                <Th className="pl-6">Case</Th>
                <Th>Status</Th>
                <Th>Urgency</Th>
                <Th>SLA</Th>
                <Th>Assignee</Th>
                <Th align="right">AI conf.</Th>
                <Th align="right">Context</Th>
                <Th>Cluster</Th>
                <Th className="pr-6">Age</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const c = row.supportCase;
                const employee = EMPLOYEE_BY_ID.get(c.employeeId);
                return (
                  <tr
                    key={c.id}
                    data-testid={`queue-row-${c.id}`}
                    className="border-b border-border/60 align-middle transition-colors hover:bg-surface"
                    style={{ transitionDuration: 'var(--duration-fast)' }}
                  >
                    <td className="max-w-[380px] py-2.5 pl-6 pr-3">
                      <Link
                        href={`/agent/${c.id}`}
                        prefetch={false}
                        className="block truncate text-[13px] text-fg hover:text-accent-fg"
                      >
                        {c.title}
                      </Link>
                      <div className="meta mt-0.5">
                        {c.id} &middot; {employee?.displayName ?? c.employeeId} &middot; {c.system}
                      </div>
                    </td>
                    <td className="px-3"><StatusChip status={c.status} /></td>
                    <td className="px-3"><UrgencyLabel urgency={c.urgency} /></td>
                    <td className="px-3">
                      <SlaChip
                        state={row.sla.state}
                        detail={row.sla.state === 'breached' ? undefined : durationLabel(row.sla.remainingMs)}
                      />
                    </td>
                    <td className="px-3 text-[12px] text-fg-muted">
                      {c.assigneeId ? agentName(c.assigneeId) : <span className="text-fg-subtle">Unassigned</span>}
                    </td>
                    <td className="px-3 text-right">
                      <ConfidenceCell band={row.confidenceBand} value={c.aiConfidenceAtHandoff} />
                    </td>
                    <td className="px-3 text-right">
                      <CompletenessCell value={row.contextCompleteness} />
                    </td>
                    <td className="px-3">
                      {row.inCluster ? (
                        <span
                          data-testid={`cluster-badge-${c.id}`}
                          className="inline-flex items-center gap-1 rounded-xs border border-accent/30 bg-accent-muted px-1.5 py-0.5 text-[11px] leading-none text-accent-fg"
                        >
                          <Layers size={10} aria-hidden />
                          {c.clusterId}
                        </span>
                      ) : (
                        <span className="meta">—</span>
                      )}
                    </td>
                    <td className="meta py-2.5 pr-6">{relativeLabel(c.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  /** null until the client store is authoritative. */
  value: number | null;
  tone?: 'critical' | 'caution' | 'accent';
}) {
  const toneClass =
    tone === 'critical' ? 'text-critical' : tone === 'caution' ? 'text-caution' : tone === 'accent' ? 'text-accent-fg' : 'text-fg';
  return (
    <div className="text-right">
      <dd className={`num text-[15px] font-medium leading-none ${value === null || value === 0 ? 'text-fg-subtle' : toneClass}`}>
        {value ?? '—'}
      </dd>
      <dt className="mt-1 text-[11px] text-fg-subtle">{label}</dt>
    </div>
  );
}

function Th({
  children,
  align = 'left',
  className = '',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
      {children}
    </th>
  );
}

/** Multi-select as a native listbox: keyboard-operable for free, no popover to trap focus. */
function Select<T extends string>({
  label,
  testId,
  options,
  render,
  value,
  onChange,
}: {
  label: string;
  testId: string;
  options: readonly T[];
  render: (value: T) => string;
  value: T[] | null;
  onChange: (value: T[] | null) => void;
}) {
  const current = value?.[0] ?? '';
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-fg-muted">
      <span className="sr-only">{label}</span>
      <select
        value={current}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value === '' ? null : ([e.target.value as T]))}
        className="rounded-sm border border-border bg-surface-sunken px-2 py-1.5 text-[12px] text-fg focus:border-border-accent focus:outline-none"
      >
        <option value="">Any {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {render(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  label,
  testId,
  active,
  onClick,
}: {
  label: string;
  testId: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-pressed={active}
      className={[
        'rounded-sm border px-2.5 py-1.5 text-[12px] transition-colors',
        active
          ? 'border-accent/40 bg-accent-muted text-accent-fg'
          : 'border-border text-fg-muted hover:border-border-strong hover:text-fg',
      ].join(' ')}
      style={{ transitionDuration: 'var(--duration-fast)' }}
    >
      {label}
    </button>
  );
}
