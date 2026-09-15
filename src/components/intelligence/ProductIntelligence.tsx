'use client';

/**
 * Product Intelligence.
 *
 * Every figure on this page is a pure function over the same event log the other
 * three workspaces write to. Nothing is stored, nothing is authored, and a
 * source scan in the test suite fails the build if a metric value ever appears
 * as a literal in this directory (CLAUDE.md rule 6, AC-5.1).
 *
 * Each tile carries its definition — formula, numerator, denominator, window —
 * because a support metric nobody can interrogate is a support metric two people
 * will compute differently and neither will notice.
 */
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Info } from 'lucide-react';

import {
  DEFAULT_FILTERS,
  activeFilterCount,
  applyFilters,
  categoryTotals,
  clusterRows,
  computeMetrics,
  demandSeries,
  failedSearches,
  knowledgeGaps,
  type MetricFilters,
} from '@/domain/metrics/derive';
import { METRIC_DEFINITIONS, METRIC_ORDER, formatMetric } from '@/domain/metrics/registry';
import { DEMO_NOW_MS } from '@/domain/clock';
import { durationLabel, shortDateLabel } from '@/domain/time';
import {
  AFFECTED_SYSTEMS,
  LABELS,
  SUPPORT_CATEGORIES,
  type AffectedSystem,
  type SupportCategory,
} from '@/domain/types';
import { useRelayStore } from '@/store/store';
import { useHydrated } from '@/components/shell/AppShell';
import { EmptyState } from '@/components/agent/primitives';
import { Opportunities } from './Opportunities';

/*
 * Chart palette.
 *
 * Both charts are single-series, so no categorical palette is needed and no
 * legend box is required — each panel title names its series.
 *
 * BAR was #4b5058, which measured 2.25:1 against the panel surface and failed
 * the 3:1 floor for a non-text mark. #6d78ad measures 4.30:1. Status hues are
 * reserved for state and never appear as a series color.
 */
const SERIES = '#6c7bff';
const BAR = '#6d78ad';
const GRID = 'rgba(255,255,255,0.06)';
const AXIS = '#8b8781';

const RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '60d', days: 60 },
  { label: 'All', days: null },
] as const;

export function ProductIntelligence() {
  const hydrated = useHydrated();
  const events = useRelayStore((s) => s.data.events);
  const cases = useRelayStore((s) => s.data.cases);
  const clusters = useRelayStore((s) => s.data.clusters);
  const conversations = useRelayStore((s) => s.data.conversations);
  const clockOffsetMs = useRelayStore((s) => s.data.clockOffsetMs);

  const [filters, setFilters] = useState<MetricFilters>(DEFAULT_FILTERS);
  // Deep-linkable, so escalation can hand off straight into the backlog.
  const params = useSearchParams();
  const [tab, setTab] = useState<'metrics' | 'opportunities'>(
    params.get('tab') === 'opportunities' ? 'opportunities' : 'metrics',
  );

  /*
   * "Now" is the demo present plus however far this session has advanced the
   * clock. Using the fixed epoch alone silently excluded every event the demo
   * itself produced — they are stamped after it, so the range filter read them
   * as future-dated and dropped them.
   */
  const nowMs = DEMO_NOW_MS + clockOffsetMs;

  const view = useMemo(
    () => applyFilters({ events, cases, clusters, conversations, nowMs }, filters),
    [events, cases, clusters, conversations, nowMs, filters],
  );

  const metrics = useMemo(() => computeMetrics(view), [view]);
  const trend = useMemo(() => demandSeries(view, SUPPORT_CATEGORIES), [view]);
  const categories = useMemo(() => categoryTotals(view, SUPPORT_CATEGORIES), [view]);
  const failures = useMemo(() => failedSearches(view), [view]);
  const gaps = useMemo(() => knowledgeGaps(view), [view]);
  const clusterTable = useMemo(() => clusterRows(view, cases), [view, cases]);

  const activeCount = activeFilterCount(filters);
  const hasData = metrics.supportDemand !== null && metrics.supportDemand > 0;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 pt-4">
        <h1 className="text-[15px] font-semibold tracking-tight">Product Intelligence</h1>
        <p className="mt-0.5 text-[12px] text-fg-subtle">
          Every figure below is derived from the same event log the other workspaces write to
        </p>

        {/*
          Opportunities is a tab rather than a drawer: it needs five editable
          inputs, the substituted arithmetic, and a ranked comparison against its
          peers, and the comparison is the part that makes the score arguable.
        */}
        <div className="-mb-px mt-3 flex gap-4" role="tablist" aria-label="Product Intelligence views">
          {(
            [
              ['metrics', 'Metrics and evidence'],
              ['opportunities', 'Product opportunities'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              data-testid={`tab-${key}`}
              className={[
                'border-b-2 pb-2 text-[13px] transition-colors',
                tab === key
                  ? 'border-accent text-fg'
                  : 'border-transparent text-fg-muted hover:text-fg',
              ].join(' ')}
              style={{ transitionDuration: 'var(--duration-fast)' }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {tab === 'opportunities' ? (
        <Opportunities initialId={params.get('opportunity')} />
      ) : (
        <>
      <div className="border-b border-border px-6 py-3" data-testid="filter-bar">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-sm border border-border" role="group" aria-label="Date range">
            {RANGES.map((range) => (
              <button
                key={range.label}
                type="button"
                onClick={() => setFilters((f) => ({ ...f, rangeDays: range.days }))}
                aria-pressed={filters.rangeDays === range.days}
                data-testid={`range-${range.label}`}
                className={[
                  'px-2.5 py-1.5 text-[12px] transition-colors first:rounded-l-sm last:rounded-r-sm',
                  filters.rangeDays === range.days
                    ? 'bg-surface-raised text-fg'
                    : 'text-fg-muted hover:text-fg',
                ].join(' ')}
                style={{ transitionDuration: 'var(--duration-fast)' }}
              >
                {range.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1.5">
            <span className="sr-only">Category</span>
            <select
              value={filters.category ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  category: e.target.value === '' ? null : (e.target.value as SupportCategory),
                }))
              }
              data-testid="filter-category"
              className="rounded-sm border border-border bg-surface-sunken px-2 py-1.5 text-[12px] text-fg focus:border-border-accent focus:outline-none"
            >
              <option value="">All categories</option>
              {SUPPORT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="sr-only">System</span>
            <select
              value={filters.system ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  system: e.target.value === '' ? null : (e.target.value as AffectedSystem),
                }))
              }
              data-testid="filter-system"
              className="rounded-sm border border-border bg-surface-sunken px-2 py-1.5 text-[12px] text-fg focus:border-border-accent focus:outline-none"
            >
              <option value="">All systems</option>
              {AFFECTED_SYSTEMS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, rangeDays: f.rangeDays }))}
              data-testid="filter-clear"
              className="rounded-sm px-2 py-1.5 text-[12px] text-fg-subtle hover:text-fg"
            >
              Clear {activeCount}
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {!hydrated ? null : !hasData ? (
          <EmptyState
            testId="intelligence-empty"
            title="No activity matches these filters"
            body="Every panel on this page derives from the same filtered event set. Widen the range or clear a constraint."
          />
        ) : (
          <div className="space-y-5">
            <MetricGrid metrics={metrics} />

            <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5">
              <Panel
                title="Demand over time"
                testId="demand-chart"
                note="Conversations opened per day across every category. Quiet days are plotted as zero rather than omitted, so the spacing reflects real time."
              >
                <div className="h-[228px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis
                        dataKey="day"
                        tickFormatter={shortDateLabel}
                        tick={{ fill: AXIS, fontSize: 10 }}
                        stroke={GRID}
                        minTickGap={28}
                      />
                      <YAxis
                        tick={{ fill: AXIS, fontSize: 10 }}
                        stroke={GRID}
                        allowDecimals={false}
                        width={40}
                      />
                      <Tooltip
                        cursor={{ stroke: AXIS, strokeWidth: 1 }}
                        contentStyle={{
                          background: '#131519',
                          border: '1px solid rgba(255,255,255,0.13)',
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                        labelFormatter={(d) => shortDateLabel(String(d))}
                      />
                      <Area
                        type="monotone"
                        dataKey="total"
                        name="Conversations"
                        stroke={SERIES}
                        fill={SERIES}
                        fillOpacity={0.1}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: '#131519' }}
                        // No entrance animation: the design direction limits motion to
                        // state change, and an animating mount also re-runs whenever the
                        // container is re-measured, which can leave the plot blank.
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel
                title="Demand by category"
                testId="category-chart"
                note="Bars show conversation volume; the figure beside each is the share that became agent work."
              >
                <div className="h-[228px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={categories}
                      layout="vertical"
                      margin={{ top: 4, right: 58, bottom: 0, left: 4 }}
                    >
                      <CartesianGrid stroke={GRID} horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fill: AXIS, fontSize: 10 }}
                        stroke={GRID}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="category"
                        tick={{ fill: AXIS, fontSize: 10 }}
                        stroke={GRID}
                        width={104}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                        contentStyle={{
                          background: '#131519',
                          border: '1px solid rgba(255,255,255,0.13)',
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                      />
                      {/*
                        One color, and the escalation rate direct-labelled at the
                        end of each bar. An earlier version colored the bars by
                        escalation rate, which encoded a status in hue alone —
                        unreadable for a colorblind viewer and invisible in print.
                      */}
                      <Bar dataKey="demand" name="Conversations" fill={BAR} radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false}>
                        <LabelList
                          dataKey="escalationRate"
                          position="right"
                          formatter={(v: unknown) =>
                            typeof v === 'number' ? `${Math.round(v * 100)}% esc` : ''
                          }
                          style={{ fill: AXIS, fontSize: 10 }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>

            <div className="grid grid-cols-2 gap-5">
              <Panel
                title="Failed searches"
                testId="failed-searches"
                note={
                  <>
                    <span className="text-info">Policy gate</span> means an answer exists but the
                    topic is escalation-sensitive and routes to a person by design. Writing an
                    article would not change it.
                  </>
                }
              >
                {failures.length === 0 ? (
                  <p className="text-[12px] text-fg-subtle">No failed searches in this range.</p>
                ) : (
                  <table className="w-full table-fixed">
                    <caption className="sr-only">Searches that produced no usable answer</caption>
                    <colgroup>
                      <col />
                      <col className="w-[108px]" />
                      <col className="w-[52px]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase tracking-[0.09em] text-fg-subtle">
                        <th scope="col" className="pb-1.5 text-left font-medium">Topic</th>
                        <th scope="col" className="pb-1.5 text-left font-medium">Classification</th>
                        <th scope="col" className="pb-1.5 text-right font-medium">Times</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failures.map((row) => (
                        <tr key={row.topicKey} className="border-b border-border/50 align-top">
                          <td className="py-2 pr-3">
                            <div className="truncate text-[12px] text-fg">
                              {row.topicKey.replace(/_/g, ' ')}
                            </div>
                            <div className="meta truncate">{row.query}</div>
                          </td>
                          <td className="py-2 pr-3">
                            {/*
                              A chip rather than free text: this column is narrow,
                              and a wrapped three-line reason made the row
                              unreadable.
                            */}
                            <span
                              className={[
                                'inline-flex whitespace-nowrap rounded-xs border px-1.5 py-0.5 text-[10px] leading-none',
                                row.isContentGap
                                  ? 'border-caution/40 bg-caution-muted text-caution'
                                  : 'border-info/40 bg-info-muted text-info',
                              ].join(' ')}
                            >
                              {row.isContentGap ? 'Content gap' : 'Policy gate'}
                            </span>
                            <div className="meta mt-1 truncate">
                              {LABELS.searchFailureReason[row.reason]}
                            </div>
                          </td>
                          <td className="num py-2 text-[13px] text-fg">{row.occurrences}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>

              <Panel
                title="Knowledge gaps"
                testId="knowledge-gaps"
                note="Topics with real demand that the knowledge base genuinely cannot answer — nothing retrieved, only stale sources, or a measurable coverage shortfall."
              >
                {gaps.length === 0 ? (
                  <p className="text-[12px] text-fg-subtle">
                    No content gaps in this range.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {gaps.map((gap) => (
                      <li
                        key={gap.topicKey}
                        className="flex items-baseline justify-between gap-3 border-b border-border/50 pb-2"
                      >
                        <div className="min-w-0">
                          <div className="text-[12px] text-fg">{gap.label}</div>
                          <div className="meta">{gap.category}</div>
                        </div>
                        <span className="num shrink-0 text-[12px] text-caution">
                          {gap.evidenceCount}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <Panel title="Recurring issues" testId="cluster-table">
              {clusterTable.length === 0 ? (
                <p className="text-[12px] leading-relaxed text-fg-subtle">
                  No recurring-issue clusters detected in this range. Detection happens in the Agent
                  Workspace when related cases are linked — it is a judgment an agent makes, not a
                  background job.
                </p>
              ) : (
                <table className="w-full">
                  <caption className="sr-only">Detected recurring-issue clusters</caption>
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-wider text-fg-subtle">
                      <th scope="col" className="pb-1.5 text-left font-medium">Cluster</th>
                      <th scope="col" className="pb-1.5 text-left font-medium">Signature</th>
                      <th scope="col" className="pb-1.5 text-right font-medium">Employees</th>
                      <th scope="col" className="pb-1.5 text-right font-medium">Open</th>
                      <th scope="col" className="pb-1.5 text-right font-medium">Time to detection</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clusterTable.map((row) => (
                      <tr key={row.cluster.id} className="border-b border-border/50">
                        <td className="py-1.5 text-[12px] text-fg">{row.cluster.id}</td>
                        <td className="py-1.5 pr-3">
                          <div className="text-[12px] text-fg-muted">
                            {row.cluster.signature.system}
                          </div>
                          <div className="meta">{row.cluster.signature.conceptTags.join(', ')}</div>
                        </td>
                        <td className="num text-[12px] text-fg">{row.affectedEmployees}</td>
                        <td className="num text-[12px] text-fg-muted">{row.openCases}</td>
                        <td className="num text-[12px] text-caution">
                          {durationLabel(row.timeToDetectionMs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}

/**
 * The nine metrics grouped into the three questions they answer.
 *
 * Nine equally weighted tiles is a wall of numbers that tells a reader nothing
 * about how to read it. Grouping states the argument the page is making: how
 * much demand there is and how much of it deflects, whether the answers are any
 * good, and whether something systemic sits underneath.
 */
const METRIC_GROUPS: { label: string; keys: readonly (typeof METRIC_ORDER)[number][] }[] = [
  { label: 'Demand and deflection', keys: ['supportDemand', 'selfServiceRate', 'escalationRate'] },
  { label: 'Answer quality', keys: ['answerAcceptance', 'searchFailureRate', 'contextCompleteness'] },
  { label: 'Systemic signal', keys: ['recurringVolume', 'timeToDetection', 'reworkRate'] },
];

function MetricGrid({ metrics }: { metrics: ReturnType<typeof computeMetrics> }) {
  return (
    <div
      data-testid="metric-grid"
      className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border"
    >
      {METRIC_GROUPS.map((group, groupIndex) => (
        <div key={group.label} className="bg-surface">
          <div className="border-b border-border bg-surface-sunken px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.09em] text-fg-subtle">
            {group.label}
          </div>
          <div className="divide-y divide-border">
            {group.keys.map((key) => (
              <MetricTile
                key={key}
                metricKey={key}
                value={metrics[key]}
                /* The rightmost column's tooltip would overflow the viewport. */
                alignEnd={groupIndex === METRIC_GROUPS.length - 1}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricTile({
  metricKey,
  value,
  alignEnd,
}: {
  metricKey: (typeof METRIC_ORDER)[number];
  value: number | null;
  alignEnd: boolean;
}) {
  const definition = METRIC_DEFINITIONS[metricKey];

  return (
    <div
      data-testid={`metric-${metricKey}`}
      tabIndex={0}
      className="group relative flex items-baseline justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface-raised focus:outline-none focus-visible:bg-surface-raised"
      style={{ transitionDuration: 'var(--duration-fast)' }}
    >
      <span className="flex items-center gap-1.5 text-[12px] leading-snug text-fg-muted">
        {definition.label}
        <Info
          size={10}
          className="shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        />
      </span>
      <span className="num shrink-0 text-[17px] font-medium leading-none tracking-tight text-fg">
        {formatMetric(value, definition.format)}
      </span>

      {/*
        The definition is data carried on the metric and rendered verbatim. A
        tooltip written separately from the computation is a tooltip that will
        eventually describe a different number.
      */}
      <div
        role="tooltip"
        data-testid={`metric-tooltip-${metricKey}`}
        className={[
          'pointer-events-none absolute top-full z-20 mt-1 w-[300px] rounded-md border border-border-strong bg-surface-raised p-3 opacity-0 shadow-[var(--shadow-raised)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
          alignEnd ? 'right-2' : 'left-2',
        ].join(' ')}
      >
        <p className="text-[12px] leading-relaxed text-fg">{definition.purpose}</p>
        <dl className="mt-2.5 space-y-1">
          <DefinitionRow label="Formula" value={definition.formula} mono />
          <DefinitionRow label="Numerator" value={definition.numerator} />
          <DefinitionRow label="Denominator" value={definition.denominator} />
          <DefinitionRow label="Window" value={definition.window} />
        </dl>
      </div>
    </div>
  );
}

function DefinitionRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-[74px] shrink-0 text-[11px] text-fg-subtle">{label}</dt>
      <dd className={`text-[11px] leading-snug text-fg-muted ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function Panel({
  title,
  testId,
  children,
  note,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      className="flex flex-col rounded-md border border-border bg-surface p-4"
    >
      <h2 className="mb-3 text-[10px] font-medium uppercase tracking-[0.09em] text-fg-subtle">
        {title}
      </h2>
      <div className="min-h-0 flex-1">{children}</div>
      {note && <p className="mt-3 text-[11px] leading-relaxed text-fg-subtle">{note}</p>}
    </section>
  );
}
