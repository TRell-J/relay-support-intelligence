/**
 * Confidence scoring.
 *
 * The single most important property of this module: **the explanation is emitted
 * by the calculation.** Every `ConfidenceComponent` returned here is a term that
 * actually contributed to the score, carrying its own weighted value. The UI
 * renders those components directly, so the number and its rationale cannot
 * drift apart — which is the failure mode that makes AI confidence displays
 * untrustworthy in real products (ADR D-005).
 *
 * Four weighted terms, plus one hard ceiling:
 *
 *   coverage      0.45   required concepts covered by the retrieved set
 *   sourceQuality 0.25   mean authority of cited articles
 *   freshness     0.20   decay over a 180-day review horizon
 *   specificity   0.10   how much of the question the retrieval actually addressed
 *
 *   sensitive domains are capped at SENSITIVE_DOMAIN_CEILING regardless of the above
 */
import { DEMO_NOW_MS } from '../clock';
import { daysSince } from '../time';
import {
  ARTICLE_STALE_AFTER_DAYS,
  SENSITIVE_DOMAIN_CEILING,
  bandFor,
  type ConfidenceBand,
  type ConfidenceComponent,
  type KnowledgeArticle,
  type SensitiveDomain,
} from '../types';

export const WEIGHTS = {
  coverage: 0.45,
  sourceQuality: 0.25,
  freshness: 0.2,
  specificity: 0.1,
} as const;

/** Review horizon over which freshness decays to zero. */
export const FRESHNESS_HORIZON_DAYS = 180;

/** Below this, no answer is offered and the search is recorded as failed. */
export const MIN_ANSWER_CONFIDENCE = 0.5;

/**
 * Ceiling applied when free text could not be mapped to a known question.
 *
 * Coverage is measured against the concepts of the intent we *guessed*. If the
 * guess is wrong, a high coverage score is measuring the wrong thing entirely,
 * so the score must not be allowed to read as confident however good the
 * retrieved sources look.
 */
export const UNMATCHED_QUESTION_CEILING = 0.4;

export interface ScoreInput {
  requiredConcepts: string[];
  articles: KnowledgeArticle[];
  sensitiveDomain: SensitiveDomain | null;
  /**
   * 0-1: how much of what was asked the retrieved set actually speaks to.
   * Seeded intents supply this; free-text fallbacks supply a reduced value.
   */
  specificity: number;
  /** False when free text fell back to a guessed intent. Applies a hard ceiling. */
  questionUnderstood?: boolean;
  nowMs?: number;
}

export interface ScoreResult {
  confidence: number;
  band: ConfidenceBand;
  rationale: ConfidenceComponent[];
  canSelfResolve: boolean;
  /** Concepts no retrieved article covers. Feeds the knowledge-gap view. */
  uncoveredConcepts: string[];
  /** True when the sensitive-domain ceiling actually bound the score. */
  ceilingApplied: boolean;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Concepts covered by at least one retrieved article. */
function coverageOf(requiredConcepts: string[], articles: KnowledgeArticle[]): {
  covered: string[];
  uncovered: string[];
} {
  const available = new Set(articles.flatMap((a) => a.concepts));
  const covered: string[] = [];
  const uncovered: string[] = [];
  for (const concept of requiredConcepts) {
    (available.has(concept) ? covered : uncovered).push(concept);
  }
  return { covered, uncovered };
}

function meanAuthority(articles: KnowledgeArticle[]): number {
  if (articles.length === 0) return 0;
  return articles.reduce((sum, a) => sum + a.authority, 0) / articles.length;
}

function meanFreshness(articles: KnowledgeArticle[], nowMs: number): { value: number; meanAgeDays: number; staleCount: number } {
  if (articles.length === 0) return { value: 0, meanAgeDays: 0, staleCount: 0 };
  let ageTotal = 0;
  let staleCount = 0;
  for (const a of articles) {
    const age = daysSince(a.lastReviewedAt, nowMs);
    ageTotal += age;
    if (age > ARTICLE_STALE_AFTER_DAYS) staleCount += 1;
  }
  const meanAgeDays = ageTotal / articles.length;
  return {
    value: clamp01(1 - meanAgeDays / FRESHNESS_HORIZON_DAYS),
    meanAgeDays,
    staleCount,
  };
}

/**
 * Score a retrieved set against what the question required.
 *
 * Pure and total: given no articles it returns a zero-confidence result with a
 * rationale explaining the absence, rather than throwing or returning NaN.
 */
export function scoreAnswer(input: ScoreInput): ScoreResult {
  const nowMs = input.nowMs ?? DEMO_NOW_MS;
  const { requiredConcepts, articles, sensitiveDomain } = input;

  const { covered, uncovered } = coverageOf(requiredConcepts, articles);
  const coverage = requiredConcepts.length === 0 ? 0 : covered.length / requiredConcepts.length;
  const authority = meanAuthority(articles);
  const freshness = meanFreshness(articles, nowMs);
  const specificity = clamp01(input.specificity);

  const rationale: ConfidenceComponent[] = [
    {
      key: 'coverage',
      label: 'Answer coverage',
      contribution: WEIGHTS.coverage * coverage,
      detail:
        requiredConcepts.length === 0
          ? 'No required concepts defined for this question'
          : `${covered.length} of ${requiredConcepts.length} required points covered${
              uncovered.length > 0 ? ` · missing: ${uncovered.join(', ')}` : ''
            }`,
    },
    {
      key: 'sourceQuality',
      label: 'Source quality',
      contribution: WEIGHTS.sourceQuality * authority,
      detail:
        articles.length === 0
          ? 'No sources retrieved'
          : `${articles.length} source${articles.length === 1 ? '' : 's'}, mean authority ${authority.toFixed(2)}`,
    },
    {
      key: 'freshness',
      label: 'Content freshness',
      contribution: WEIGHTS.freshness * freshness.value,
      detail:
        articles.length === 0
          ? 'No sources to assess'
          : `Reviewed ${Math.round(freshness.meanAgeDays)} days ago on average${
              freshness.staleCount > 0
                ? ` · ${freshness.staleCount} past the ${ARTICLE_STALE_AFTER_DAYS}-day review window`
                : ''
            }`,
    },
    {
      key: 'specificity',
      label: 'Question match',
      contribution: WEIGHTS.specificity * specificity,
      detail: `Retrieval addressed ${Math.round(specificity * 100)}% of the question as asked`,
    },
  ];

  const raw =
    WEIGHTS.coverage * coverage +
    WEIGHTS.sourceQuality * authority +
    WEIGHTS.freshness * freshness.value +
    WEIGHTS.specificity * specificity;

  const understood = input.questionUnderstood !== false;
  const ceiling = Math.min(
    sensitiveDomain !== null ? SENSITIVE_DOMAIN_CEILING : 1,
    understood ? 1 : UNMATCHED_QUESTION_CEILING,
  );
  const ceilingApplied = raw > ceiling;
  const bounded = Math.min(raw, ceiling);
  const confidence = round2(clamp01(bounded));

  if (!understood) {
    rationale.push({
      key: 'unmatchedQuestion',
      label: 'Question not recognized',
      contribution: raw > UNMATCHED_QUESTION_CEILING ? round2(Math.min(bounded, UNMATCHED_QUESTION_CEILING) - raw) : 0,
      detail:
        'This wording did not match a known question, so the answer below is for the closest topic and may not be what was asked',
    });
  }

  if (sensitiveDomain !== null) {
    const domainPhrase = sensitiveDomain.replace(/_/g, ' ');
    const article = /^[aeiou]/.test(domainPhrase) ? 'an' : 'a';
    rationale.push({
      key: 'sensitiveCeiling',
      label: 'Escalation-sensitive topic',
      // Negative when the ceiling actually bound the score; zero when it did not.
      contribution: ceilingApplied ? round2(bounded - raw) : 0,
      detail: ceilingApplied
        ? `Capped at ${SENSITIVE_DOMAIN_CEILING} because this is ${article} ${domainPhrase} question, which a person must confirm`
        : `Flagged as ${article} ${domainPhrase} question; a person must confirm before this is acted on`,
    });
  }

  const band = bandFor(confidence);

  return {
    confidence,
    band,
    rationale,
    // Two independent reasons to withhold self-resolution.
    canSelfResolve: band !== 'low' && sensitiveDomain === null,
    uncoveredConcepts: uncovered,
    ceilingApplied,
  };
}

/**
 * Sum of the weighted contributions, for the UI assertion that the breakdown
 * accounts for the displayed score (AC-2.2).
 */
export function rationaleTotal(rationale: ConfidenceComponent[]): number {
  return round2(rationale.reduce((sum, c) => sum + c.contribution, 0));
}

/**
 * Round the rationale components so that what is displayed sums exactly to the
 * displayed confidence.
 *
 * Naive per-component rounding does not reconcile: the VPN answer's four terms
 * round to 0.955 against a headline of 0.96, and the SSO answer's five terms
 * round to 0.46 against 0.45. In a product whose whole argument is that the
 * explanation *is* the computation, a breakdown that visibly fails to add up is
 * the worst possible detail to get wrong.
 *
 * Largest-remainder apportionment fixes it: floor every component, then hand the
 * leftover units to whichever components lost the most to rounding. The result
 * always sums to the total, and no component moves by more than one unit in the
 * last displayed place.
 */
export function reconciledContributions(
  rationale: ConfidenceComponent[],
  confidence: number,
  decimals = 3,
): number[] {
  if (rationale.length === 0) return [];

  const scale = 10 ** decimals;
  const scaled = rationale.map((c) => c.contribution * scale);
  const floors = scaled.map(Math.floor);

  const target = Math.round(confidence * scale);
  const shortfall = target - floors.reduce((sum, n) => sum + n, 0);
  const step = Math.sign(shortfall);

  // Components ordered by how much each lost to flooring; biggest losers first.
  const byRemainder = scaled
    .map((value, index) => ({ index, remainder: value - floors[index]! }))
    .sort((a, b) => b.remainder - a.remainder);

  const adjusted = [...floors];
  for (let i = 0; i < Math.abs(shortfall); i++) {
    const target = byRemainder[i % byRemainder.length];
    if (target) adjusted[target.index] = adjusted[target.index]! + step;
  }

  return adjusted.map((n) => n / scale);
}
