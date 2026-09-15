/**
 * Retrieval and answer assembly.
 *
 * Deterministic lexical retrieval over the synthetic corpus: concept overlap,
 * ranked, capped at three sources. No embeddings, no network, no model. The
 * requirement this satisfies is "source-grounded answer with an explainable
 * confidence", and a scorer you can read beats a similarity you cannot (ADR D-005).
 */
import { DEMO_NOW_MS } from '../clock';
import { daysSince } from '../time';
import { ARTICLE_STALE_AFTER_DAYS, type ArticleId, type KnowledgeArticle, type SearchFailureReason } from '../types';
import type { IntentDefinition } from './intents';
import { MIN_ANSWER_CONFIDENCE, scoreAnswer, type ScoreResult } from './score';

/** Never cite more than this many sources; a wall of links is not evidence. */
export const MAX_SOURCES = 3;

export interface RankedArticle {
  article: KnowledgeArticle;
  /** Count of the intent's required concepts this article covers. */
  conceptHits: number;
  /** Ranking score: concept overlap, tie-broken by authority then recency. */
  rank: number;
  isStale: boolean;
}

export function isStale(article: KnowledgeArticle, nowMs: number = DEMO_NOW_MS): boolean {
  return daysSince(article.lastReviewedAt, nowMs) > ARTICLE_STALE_AFTER_DAYS;
}

/**
 * Rank the corpus against an intent's required concepts.
 * Articles with no overlap are dropped rather than ranked last, so "nothing
 * relevant exists" stays distinguishable from "everything is slightly relevant".
 */
export function rankArticles(
  intent: IntentDefinition,
  corpus: KnowledgeArticle[],
  nowMs: number = DEMO_NOW_MS,
): RankedArticle[] {
  const required = new Set(intent.requiredConcepts);

  return corpus
    .map((article) => {
      const conceptHits = article.concepts.filter((c) => required.has(c)).length;
      const ageDays = daysSince(article.lastReviewedAt, nowMs);
      // Concept overlap dominates; authority and recency only break ties.
      const rank = conceptHits * 10 + article.authority - ageDays / 1_000;
      return { article, conceptHits, rank, isStale: isStale(article, nowMs) };
    })
    .filter((r) => r.conceptHits > 0)
    .sort((a, b) => b.rank - a.rank || a.article.id.localeCompare(b.article.id));
}

export interface RetrievalResult {
  query: string;
  topicKey: string;
  ranked: RankedArticle[];
  /** The sources actually cited, capped at MAX_SOURCES. */
  cited: KnowledgeArticle[];
  citedIds: ArticleId[];
  score: ScoreResult;
  topScore: number;
  /** Present when no acceptable answer could be produced. */
  failure: SearchFailureReason | null;
}

/**
 * Run retrieval for an intent and score the result.
 *
 * `specificity` is 1.0 for a launched scenario (the question is exactly the
 * canonical one) and reduced for free-text input that only partially matched,
 * which is how an imprecise question honestly scores lower.
 */
export function retrieve(
  intent: IntentDefinition,
  corpus: KnowledgeArticle[],
  options: { specificity?: number; questionUnderstood?: boolean; nowMs?: number } = {},
): RetrievalResult {
  const nowMs = options.nowMs ?? DEMO_NOW_MS;
  const specificity = options.specificity ?? 1;

  const ranked = rankArticles(intent, corpus, nowMs);
  const cited = ranked.slice(0, MAX_SOURCES).map((r) => r.article);

  const score = scoreAnswer({
    requiredConcepts: intent.requiredConcepts,
    articles: cited,
    sensitiveDomain: intent.sensitiveDomain,
    specificity,
    questionUnderstood: options.questionUnderstood ?? true,
    nowMs,
  });

  return {
    query: intent.canonicalQuery,
    topicKey: intent.topicKey,
    ranked,
    cited,
    citedIds: cited.map((a) => a.id),
    score,
    topScore: score.confidence,
    failure: classifyFailure(ranked, cited, score, nowMs),
  };
}

/**
 * Why an answer could not be offered, or `null` if one could.
 *
 * The three reasons are distinguished because they imply different fixes:
 * `no_results` means write the article, `stale_only` means review it, and
 * `below_threshold` means the article that exists does not answer the question.
 */
function classifyFailure(
  ranked: RankedArticle[],
  cited: KnowledgeArticle[],
  score: ScoreResult,
  nowMs: number,
): SearchFailureReason | null {
  if (ranked.length === 0) return 'no_results';
  if (cited.length > 0 && cited.every((a) => isStale(a, nowMs))) return 'stale_only';
  if (score.confidence < MIN_ANSWER_CONFIDENCE) return 'below_threshold';
  return null;
}
