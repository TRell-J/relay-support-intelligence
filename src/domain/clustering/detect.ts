/**
 * Recurring-issue detection.
 *
 * Rule-based and explainable, not learned. An agent has to be able to read why
 * five cases were grouped and disagree with it; a similarity score they cannot
 * inspect is not evidence, it is an assertion (ADR D-007).
 *
 * The distinction this exists to draw: one login-loop ticket is user error, five
 * in a week on one identity provider is a platform defect. Nothing else in a
 * support stack makes that call, which is why it usually never gets made.
 */
import { DAY_MS, toMs, type Iso } from '../clock';
import type { CaseId, ClusterId } from '../ids';
import type {
  AffectedSystem,
  ClusterSignature,
  IssueCluster,
  SupportCase,
  SupportCategory,
} from '../types';

/** Weights for the three similarity terms. They sum to 1. */
export const SIMILARITY_WEIGHTS = {
  category: 0.4,
  system: 0.3,
  conceptOverlap: 0.3,
} as const;

/** Pairwise similarity at or above this counts two cases as the same problem. */
export const SIMILARITY_THRESHOLD = 0.75;

/** Cases outside this rolling window are not the same incident. */
export const CLUSTER_WINDOW_DAYS = 7;

/** Below this many members, a pattern is a coincidence. */
export const MIN_CLUSTER_SIZE = 3;

/** Jaccard overlap of two tag sets. Empty sets score 0, not 1. */
export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const tag of setA) if (setB.has(tag)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface SimilarityBreakdown {
  score: number;
  /** Terms that fired, in the words the UI shows. Generated, never authored. */
  reasons: string[];
  withinWindow: boolean;
}

/**
 * Compare two cases.
 *
 * Returns the reasons alongside the score so the explanation shown to an agent
 * is produced by the same pass that produced the number.
 */
export function similarity(a: SupportCase, b: SupportCase): SimilarityBreakdown {
  const reasons: string[] = [];
  let score = 0;

  if (a.category === b.category) {
    score += SIMILARITY_WEIGHTS.category;
    reasons.push(`Same category: ${a.category}`);
  }
  if (a.system === b.system) {
    score += SIMILARITY_WEIGHTS.system;
    reasons.push(`Same affected system: ${a.system}`);
  }

  const overlap = jaccard(a.conceptTags, b.conceptTags);
  if (overlap > 0) {
    score += SIMILARITY_WEIGHTS.conceptOverlap * overlap;
    const shared = a.conceptTags.filter((t) => b.conceptTags.includes(t));
    reasons.push(`Shared symptoms: ${shared.join(', ')}`);
  }

  const daysApart = Math.abs(toMs(a.createdAt) - toMs(b.createdAt)) / DAY_MS;
  const withinWindow = daysApart <= CLUSTER_WINDOW_DAYS;
  if (withinWindow) {
    const days = Math.round(daysApart);
    reasons.push(
      days === 0
        ? `Filed the same day, inside the ${CLUSTER_WINDOW_DAYS}-day window`
        : `Filed ${days} day${days === 1 ? '' : 's'} apart, inside the ${CLUSTER_WINDOW_DAYS}-day window`,
    );
  }

  return { score: Math.round(score * 1000) / 1000, reasons, withinWindow };
}

/** Whether two cases are the same problem. */
export function isMatch(a: SupportCase, b: SupportCase): boolean {
  const result = similarity(a, b);
  return result.score >= SIMILARITY_THRESHOLD && result.withinWindow;
}

export interface ClusterCandidate {
  members: SupportCase[];
  signature: ClusterSignature;
  matchRationale: string[];
  firstCaseAt: Iso;
  /** Distinct employees across members. The affected-user count, derived. */
  affectedEmployeeCount: number;
  /** True once the candidate has enough members to be a cluster. */
  meetsThreshold: boolean;
}

/**
 * Find the cluster candidate seeded by one case.
 *
 * Deliberately anchored on a case rather than partitioning the whole corpus: in
 * the product this runs when an agent marks something related, and the question
 * being asked is "what else is this?" not "how does everything group?".
 */
export function findCandidate(seed: SupportCase, pool: readonly SupportCase[]): ClusterCandidate {
  const members = [seed, ...pool.filter((c) => c.id !== seed.id && isMatch(seed, c))].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : 1,
  );

  // Rationale is taken from a representative comparison, deduplicated.
  const rationale = new Set<string>();
  for (const member of members) {
    if (member.id === seed.id) continue;
    for (const reason of similarity(seed, member).reasons) rationale.add(reason);
  }
  rationale.add(
    `${members.length} cases matched at or above the ${SIMILARITY_THRESHOLD} similarity threshold`,
  );

  const sharedTags = members.reduce<string[]>(
    (shared, member) => shared.filter((tag) => member.conceptTags.includes(tag)),
    [...(members[0]?.conceptTags ?? [])],
  );

  return {
    members,
    signature: {
      category: seed.category as SupportCategory,
      system: seed.system as AffectedSystem,
      conceptTags: sharedTags,
    },
    matchRationale: [...rationale],
    firstCaseAt: members[0]?.createdAt ?? seed.createdAt,
    affectedEmployeeCount: new Set(members.map((m) => m.employeeId)).size,
    meetsThreshold: members.length >= MIN_CLUSTER_SIZE,
  };
}

/** Build the cluster record from a candidate that met the threshold. */
export function buildCluster(
  id: ClusterId,
  candidate: ClusterCandidate,
  detectedAt: Iso,
): IssueCluster {
  return {
    id,
    signature: candidate.signature,
    caseIds: candidate.members.map((m) => m.id as CaseId),
    firstCaseAt: candidate.firstCaseAt,
    detectedAt,
    status: 'confirmed',
    matchRationale: candidate.matchRationale,
  };
}

/**
 * Time from the first member case to detection.
 *
 * The metric this whole module exists to make measurable: how long a systemic
 * problem sat in the queue looking like unrelated tickets.
 */
export function timeToDetectionMs(cluster: IssueCluster): number {
  return toMs(cluster.detectedAt) - toMs(cluster.firstCaseAt);
}

/** Cases similar enough to suggest, ranked, for the "Similar cases" panel. */
export function similarCases(
  target: SupportCase,
  pool: readonly SupportCase[],
  limit = 6,
): { supportCase: SupportCase; breakdown: SimilarityBreakdown }[] {
  return pool
    .filter((c) => c.id !== target.id)
    .map((supportCase) => ({ supportCase, breakdown: similarity(target, supportCase) }))
    .filter((entry) => entry.breakdown.score >= SIMILARITY_THRESHOLD && entry.breakdown.withinWindow)
    .sort(
      (a, b) =>
        b.breakdown.score - a.breakdown.score ||
        a.supportCase.createdAt.localeCompare(b.supportCase.createdAt),
    )
    .slice(0, limit);
}
