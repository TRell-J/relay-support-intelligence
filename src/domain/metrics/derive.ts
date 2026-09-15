/**
 * KPI derivation.
 *
 * Every number Product Intelligence displays is computed here, as a pure
 * function over the event log and the entities it produced. There are no stored
 * totals and no authored series anywhere in the build — that is the claim the
 * whole prototype rests on, and it is asserted by a source scan in the tests
 * (CLAUDE.md rule 6, AC-5.1).
 *
 * Filtering works by resolving each event to a dimension tuple once, then
 * filtering on that. Doing it per metric would mean nine slightly different
 * interpretations of "in the Access & Identity filter", which is exactly how
 * dashboards start disagreeing with themselves.
 */
import { DAY_MS, DEMO_NOW_MS, toMs, type Iso } from '../clock';
import { dayKey, dayKeyRange } from '../time';
import { timeToDetectionMs } from '../clustering/detect';
import { CASE_CONTEXT_FIELDS } from '../types';
import type {
  AffectedSystem,
  CaseSource,
  IssueCluster,
  RelayEvent,
  SearchFailureReason,
  SupportCase,
  SupportCategory,
} from '../types';
import type { MetricKey } from './registry';

/* ----------------------------------------------------------------- inputs -- */

export interface MetricsInput {
  events: readonly RelayEvent[];
  cases: Readonly<Record<string, SupportCase>>;
  clusters: Readonly<Record<string, IssueCluster>>;
  conversations: Readonly<Record<string, { id: string; category: SupportCategory }>>;
  nowMs?: number;
}

export interface MetricFilters {
  /** Days back from the demo present. `null` means the whole history. */
  rangeDays: number | null;
  category: SupportCategory | null;
  system: AffectedSystem | null;
  source: CaseSource | null;
}

export const DEFAULT_FILTERS: MetricFilters = {
  rangeDays: 30,
  category: null,
  system: null,
  source: null,
};

export function activeFilterCount(filters: MetricFilters): number {
  let n = 0;
  if (filters.category !== null) n += 1;
  if (filters.system !== null) n += 1;
  if (filters.source !== null) n += 1;
  return n;
}

/* -------------------------------------------------------------- dimension -- */

interface Dimensions {
  category: SupportCategory | null;
  system: AffectedSystem | null;
  source: CaseSource | null;
}

/**
 * Resolve each event to the dimensions a filter can constrain on.
 *
 * Most events carry only an id, so category and system are looked up through the
 * conversation or case they belong to. Built once per computation.
 */
function buildDimensionIndex(input: MetricsInput): Map<string, Dimensions> {
  const byConversation = new Map<string, Dimensions>();
  const byCase = new Map<string, Dimensions>();

  for (const c of Object.values(input.cases)) {
    const dims: Dimensions = { category: c.category, system: c.system, source: c.source };
    byCase.set(c.id, dims);
    if (c.conversationId) byConversation.set(c.conversationId, dims);
  }
  for (const conversation of Object.values(input.conversations)) {
    if (!byConversation.has(conversation.id)) {
      byConversation.set(conversation.id, {
        category: conversation.category,
        system: null,
        source: null,
      });
    }
  }

  const index = new Map<string, Dimensions>();
  for (const event of input.events) {
    const payload = event.payload as Record<string, unknown>;
    const caseId = typeof payload.caseId === 'string' ? payload.caseId : null;
    const conversationId =
      typeof payload.conversationId === 'string' ? payload.conversationId : null;

    const dims =
      (caseId ? byCase.get(caseId) : undefined) ??
      (conversationId ? byConversation.get(conversationId) : undefined) ??
      { category: null, system: null, source: null };

    index.set(event.id, dims);
  }
  return index;
}

export interface FilteredView {
  events: RelayEvent[];
  cases: SupportCase[];
  clusters: IssueCluster[];
  /** Inclusive day keys spanned by the range, for dense trend series. */
  dayKeys: string[];
  fromMs: number;
  nowMs: number;
}

/** Apply filters once, producing the view every metric reads from. */
export function applyFilters(input: MetricsInput, filters: MetricFilters): FilteredView {
  const nowMs = input.nowMs ?? DEMO_NOW_MS;
  const fromMs = filters.rangeDays === null ? -Infinity : nowMs - filters.rangeDays * DAY_MS;
  const dims = buildDimensionIndex(input);

  const matches = (d: Dimensions | undefined): boolean => {
    if (!d) return false;
    if (filters.category !== null && d.category !== filters.category) return false;
    if (filters.system !== null && d.system !== filters.system) return false;
    if (filters.source !== null && d.source !== filters.source) return false;
    return true;
  };

  const events = input.events.filter(
    (e) => toMs(e.at) >= fromMs && toMs(e.at) <= nowMs && matches(dims.get(e.id)),
  );

  const cases = Object.values(input.cases).filter((c) => {
    if (toMs(c.createdAt) < fromMs) return false;
    if (filters.category !== null && c.category !== filters.category) return false;
    if (filters.system !== null && c.system !== filters.system) return false;
    if (filters.source !== null && c.source !== filters.source) return false;
    return true;
  });

  const caseIds = new Set(cases.map((c) => c.id));
  const clusters = Object.values(input.clusters).filter((cl) =>
    cl.caseIds.some((id) => caseIds.has(id)),
  );

  const firstMs = filters.rangeDays === null ? nowMs - 60 * DAY_MS : fromMs;
  const dayKeys = dayKeyRange(
    new Date(firstMs).toISOString() as Iso,
    new Date(nowMs).toISOString() as Iso,
  );

  return { events, cases, clusters, dayKeys, fromMs, nowMs };
}

/* --------------------------------------------------------------- counting -- */

const countOf = (view: FilteredView, type: RelayEvent['type']): number =>
  view.events.reduce((n, e) => (e.type === type ? n + 1 : n), 0);

/** A rate that returns null rather than NaN when nothing happened. */
function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

/* ---------------------------------------------------------------- metrics -- */

export type MetricValues = Record<MetricKey, number | null>;

export function computeMetrics(view: FilteredView): MetricValues {
  const started = countOf(view, 'conversation.started');
  const searches = countOf(view, 'search.performed');
  const failures = countOf(view, 'search.failed');
  const created = countOf(view, 'case.created');

  const selfServed = view.events.filter(
    (e) => e.type === 'conversation.resolved' && e.payload.resolution === 'self_service',
  ).length;

  const feedback = view.events.filter((e) => e.type === 'answer.feedback');
  const helpful = feedback.filter(
    (e) => e.type === 'answer.feedback' && e.payload.verdict === 'helpful',
  ).length;

  const completenessValues = view.events
    .filter((e) => e.type === 'case.created')
    .map((e) => (e.type === 'case.created' ? e.payload.contextCompleteness : 0));

  const openCases = view.cases.filter((c) => c.status !== 'resolved' && c.status !== 'closed');
  const openClustered = openCases.filter((c) => c.clusterId !== null).length;

  const detectionTimes = view.clusters.map((cl) => timeToDetectionMs(cl));

  const reworkTotal = view.cases.reduce((n, c) => n + c.reworkCount, 0);

  return {
    supportDemand: started,
    selfServiceRate: rate(selfServed, started),
    escalationRate: rate(created, started),
    answerAcceptance: rate(helpful, feedback.length),
    searchFailureRate: rate(failures, searches),
    contextCompleteness:
      completenessValues.length === 0
        ? null
        : completenessValues.reduce((a, b) => a + b, 0) / completenessValues.length,
    recurringVolume: rate(openClustered, openCases.length),
    timeToDetection: median(detectionTimes),
    reworkRate: rate(reworkTotal, view.cases.length),
  };
}

/* ------------------------------------------------------------------ series -- */

export interface DemandPoint {
  day: string;
  total: number;
  /** Per-category counts, keyed by category name. */
  [category: string]: string | number;
}

/**
 * Demand by day and category.
 *
 * Days with no activity are emitted as zero rather than omitted, so the x-axis
 * spacing reflects real time instead of compressing quiet periods.
 */
export function demandSeries(view: FilteredView, categories: readonly SupportCategory[]): DemandPoint[] {
  const buckets = new Map<string, Map<string, number>>();
  for (const key of view.dayKeys) buckets.set(key, new Map());

  for (const event of view.events) {
    if (event.type !== 'conversation.started') continue;
    const key = dayKey(event.at);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.set(event.payload.category, (bucket.get(event.payload.category) ?? 0) + 1);
  }

  return view.dayKeys.map((day) => {
    const bucket = buckets.get(day) ?? new Map<string, number>();
    const point: DemandPoint = { day, total: 0 };
    let total = 0;
    for (const category of categories) {
      const n = bucket.get(category) ?? 0;
      point[category] = n;
      total += n;
    }
    point.total = total;
    return point;
  });
}

export interface CategoryTotal {
  category: SupportCategory;
  demand: number;
  escalated: number;
  escalationRate: number | null;
}

/** Demand and escalation per category, for the ranked bar chart. */
export function categoryTotals(
  view: FilteredView,
  categories: readonly SupportCategory[],
): CategoryTotal[] {
  const demand = new Map<string, number>();
  const escalated = new Map<string, number>();

  for (const event of view.events) {
    if (event.type === 'conversation.started') {
      demand.set(event.payload.category, (demand.get(event.payload.category) ?? 0) + 1);
    } else if (event.type === 'case.created') {
      escalated.set(event.payload.category, (escalated.get(event.payload.category) ?? 0) + 1);
    }
  }

  return categories
    .map((category) => {
      const d = demand.get(category) ?? 0;
      const e = escalated.get(category) ?? 0;
      return { category, demand: d, escalated: e, escalationRate: rate(e, d) };
    })
    .filter((row) => row.demand > 0)
    .sort((a, b) => b.demand - a.demand);
}

/* -------------------------------------------------------------- gap views -- */

export interface FailedSearchRow {
  topicKey: string;
  query: string;
  occurrences: number;
  reason: SearchFailureReason;
  /** Cases that resulted, so a gap can be costed rather than just counted. */
  escalations: number;
  /**
   * True when a knowledge gap was flagged for this topic.
   *
   * Failed searches split into two populations that imply opposite actions:
   * write the missing article, or revisit a policy that routes answerable
   * questions to a human by design. Conflating them is how a support backlog
   * turns into a content backlog that does not fix anything.
   */
  isContentGap: boolean;
}

/** Failed searches, aggregated by normalized topic. */
export function failedSearches(view: FilteredView): FailedSearchRow[] {
  const flaggedTopics = new Set(
    view.events.filter((e) => e.type === 'kb.gap_flagged').map((e) => e.payload.topicKey),
  );
  const rows = new Map<string, FailedSearchRow>();
  const conversationsWithFailure = new Set<string>();

  for (const event of view.events) {
    if (event.type !== 'search.failed') continue;
    conversationsWithFailure.add(event.payload.conversationId);

    const existing = rows.get(event.payload.topicKey);
    if (existing) {
      existing.occurrences += 1;
    } else {
      rows.set(event.payload.topicKey, {
        topicKey: event.payload.topicKey,
        query: event.payload.query,
        occurrences: 1,
        reason: event.payload.reason,
        escalations: 0,
        isContentGap: flaggedTopics.has(event.payload.topicKey),
      });
    }
  }

  // Attribute escalations back to the topic that failed.
  for (const supportCase of view.cases) {
    if (!supportCase.conversationId) continue;
    if (!conversationsWithFailure.has(supportCase.conversationId)) continue;
    for (const row of rows.values()) {
      if (supportCase.conceptTags.some((t) => row.topicKey.includes(t) || t.includes(row.topicKey))) {
        row.escalations += 1;
        break;
      }
    }
  }

  return [...rows.values()].sort((a, b) => b.occurrences - a.occurrences);
}

export interface KnowledgeGapRow {
  topicKey: string;
  label: string;
  category: SupportCategory;
  evidenceCount: number;
}

/**
 * Topics with demand and no acceptable article.
 *
 * Read from `kb.gap_flagged` rather than recomputed, because the flag is the
 * record that the gap was observed at a point in time — recomputing it would
 * silently rewrite history every time the corpus changed.
 */
export function knowledgeGaps(view: FilteredView): KnowledgeGapRow[] {
  const rows = new Map<string, KnowledgeGapRow>();
  for (const event of view.events) {
    if (event.type !== 'kb.gap_flagged') continue;
    rows.set(event.payload.topicKey, {
      topicKey: event.payload.topicKey,
      label: event.payload.topicKey.replace(/_/g, ' '),
      category: event.payload.category,
      evidenceCount: event.payload.evidenceCount,
    });
  }
  return [...rows.values()].sort((a, b) => b.evidenceCount - a.evidenceCount);
}

export interface ClusterRow {
  cluster: IssueCluster;
  affectedEmployees: number;
  timeToDetectionMs: number;
  openCases: number;
}

export function clusterRows(view: FilteredView, allCases: Readonly<Record<string, SupportCase>>): ClusterRow[] {
  return view.clusters
    .map((cluster) => {
      const members = cluster.caseIds.map((id) => allCases[id]).filter((c) => c !== undefined);
      return {
        cluster,
        affectedEmployees: new Set(members.map((m) => m.employeeId)).size,
        timeToDetectionMs: timeToDetectionMs(cluster),
        openCases: members.filter((m) => m.status !== 'resolved' && m.status !== 'closed').length,
      };
    })
    .sort((a, b) => b.affectedEmployees - a.affectedEmployees);
}

/** Context completeness is the mean of populated required fields; six is the whole. */
export const REQUIRED_CONTEXT_FIELD_COUNT = CASE_CONTEXT_FIELDS.length;
