/**
 * Queue derivation and filtering.
 *
 * Pure functions over cases, so the queue can be unit-tested without a browser
 * and the filter semantics are stated once rather than re-implemented per column.
 *
 * Every displayed column that *can* be derived is derived here — SLA state,
 * cluster membership, confidence band — rather than stored on the case, so a row
 * can never disagree with the record behind it.
 */
import { DEMO_NOW_MS } from '../clock';
import { bandFor } from '../types';
import type {
  AffectedSystem,
  CaseSource,
  CaseStatus,
  ConfidenceBand,
  SlaState,
  SupportCase,
  SupportCategory,
  Urgency,
} from '../types';
import { contextCompleteness } from './context';
import { readSla, type SlaReading } from './sla';

export interface QueueRow {
  supportCase: SupportCase;
  sla: SlaReading;
  /** Band of the confidence that produced the handoff, if there was one. */
  confidenceBand: ConfidenceBand | null;
  contextCompleteness: number;
  inCluster: boolean;
  isOpen: boolean;
}

const CLOSED_STATUSES: CaseStatus[] = ['resolved', 'closed'];

export function toQueueRow(supportCase: SupportCase, nowMs: number = DEMO_NOW_MS): QueueRow {
  return {
    supportCase,
    sla: readSla(supportCase.createdAt, supportCase.slaTargetAt, nowMs),
    confidenceBand:
      supportCase.aiConfidenceAtHandoff === null ? null : bandFor(supportCase.aiConfidenceAtHandoff),
    contextCompleteness: contextCompleteness(supportCase.structuredContext),
    inCluster: supportCase.clusterId !== null,
    isOpen: !CLOSED_STATUSES.includes(supportCase.status),
  };
}

/**
 * Queue filters.
 *
 * `null` means "no constraint" for every field. An empty array would be
 * ambiguous — it could read as "match nothing" — so multi-value filters use
 * null rather than [] for the unset case.
 */
export interface QueueFilters {
  search: string;
  status: CaseStatus[] | null;
  category: SupportCategory[] | null;
  system: AffectedSystem[] | null;
  source: CaseSource[] | null;
  urgency: Urgency[] | null;
  slaState: SlaState[] | null;
  confidenceBand: ConfidenceBand[] | null;
  assignee: string | null;
  /** true = only clustered, false = only unclustered, null = both. */
  clustered: boolean | null;
  /** true = hide resolved and closed. */
  openOnly: boolean;
}

/**
 * "Open only" is a view mode rather than a constraint the user chose, so the
 * queue opens with it on and it is excluded from the active-filter count.
 * Counting it made a freshly loaded page advertise "Clear 1" before anyone had
 * filtered anything, and made Clear widen the result set instead of restoring
 * the default.
 */
export const EMPTY_FILTERS: QueueFilters = {
  search: '',
  status: null,
  category: null,
  system: null,
  source: null,
  urgency: null,
  slaState: null,
  confidenceBand: null,
  assignee: null,
  clustered: null,
  openOnly: false,
};

function matchesSearch(row: QueueRow, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (query === '') return true;
  const c = row.supportCase;
  /*
   * Concept tags are snake_case identifiers. An agent searching "login loop"
   * should find a case tagged `login_loop` — the internal spelling is an
   * implementation detail and has no business shaping what people can search
   * for. Underscores are flattened on both sides of the comparison.
   */
  const haystack = [c.id, c.title, c.category, c.system, c.employeeId, ...c.conceptTags]
    .join(' ')
    .toLowerCase()
    .replace(/_/g, ' ');
  return haystack.includes(query.replace(/_/g, ' '));
}

const inSet = <T>(allowed: T[] | null, value: T): boolean =>
  allowed === null || allowed.length === 0 || allowed.includes(value);

/** Apply every filter. Constraints intersect. */
export function filterQueue(rows: QueueRow[], filters: QueueFilters): QueueRow[] {
  return rows.filter((row) => {
    const c = row.supportCase;
    if (!matchesSearch(row, filters.search)) return false;
    if (!inSet(filters.status, c.status)) return false;
    if (!inSet(filters.category, c.category)) return false;
    if (!inSet(filters.system, c.system)) return false;
    if (!inSet(filters.source, c.source)) return false;
    if (!inSet(filters.urgency, c.urgency)) return false;
    if (!inSet(filters.slaState, row.sla.state)) return false;
    if (filters.confidenceBand !== null && filters.confidenceBand.length > 0) {
      if (row.confidenceBand === null || !filters.confidenceBand.includes(row.confidenceBand)) {
        return false;
      }
    }
    if (filters.assignee !== null) {
      if (filters.assignee === 'unassigned' ? c.assigneeId !== null : c.assigneeId !== filters.assignee) {
        return false;
      }
    }
    if (filters.clustered !== null && row.inCluster !== filters.clustered) return false;
    if (filters.openOnly && !row.isOpen) return false;
    return true;
  });
}

/** How many constraints are active, for the "clear filters" affordance. */
export function activeFilterCount(filters: QueueFilters): number {
  let count = 0;
  if (filters.search.trim() !== '') count += 1;
  for (const key of ['status', 'category', 'system', 'source', 'urgency', 'slaState', 'confidenceBand'] as const) {
    const value = filters[key];
    if (value !== null && value.length > 0) count += 1;
  }
  if (filters.assignee !== null) count += 1;
  if (filters.clustered !== null) count += 1;
  return count;
}

/** The state the queue opens in, and the state Clear restores. */
export const DEFAULT_FILTERS: QueueFilters = { ...EMPTY_FILTERS, openOnly: true };

/**
 * Default ordering: breached first, then at-risk, then by urgency, then oldest.
 *
 * Operational rather than chronological — an agent opening the queue should see
 * what is on fire, not what happened to arrive last.
 */
const URGENCY_RANK: Record<Urgency, number> = { critical: 0, high: 1, normal: 2, low: 3 };
const SLA_RANK: Record<SlaState, number> = { breached: 0, at_risk: 1, on_track: 2 };

export function sortQueue(rows: QueueRow[]): QueueRow[] {
  return [...rows].sort((a, b) => {
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
    const sla = SLA_RANK[a.sla.state] - SLA_RANK[b.sla.state];
    if (sla !== 0) return sla;
    const urgency = URGENCY_RANK[a.supportCase.urgency] - URGENCY_RANK[b.supportCase.urgency];
    if (urgency !== 0) return urgency;
    return a.supportCase.createdAt.localeCompare(b.supportCase.createdAt);
  });
}

export interface QueueSummary {
  total: number;
  open: number;
  breached: number;
  atRisk: number;
  unassigned: number;
  clustered: number;
}

export function summarize(rows: QueueRow[]): QueueSummary {
  return {
    total: rows.length,
    open: rows.filter((r) => r.isOpen).length,
    breached: rows.filter((r) => r.isOpen && r.sla.state === 'breached').length,
    atRisk: rows.filter((r) => r.isOpen && r.sla.state === 'at_risk').length,
    unassigned: rows.filter((r) => r.isOpen && r.supportCase.assigneeId === null).length,
    clustered: rows.filter((r) => r.inCluster).length,
  };
}
