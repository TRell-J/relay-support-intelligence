/**
 * AC-2.1, AC-2.2, AC-3.1, AC-8.2 — retrieval and confidence.
 *
 * The scenario values asserted here are not targets that the data was tuned to
 * hit. They are what the scorer computes from the seeded corpus, captured so a
 * change to either the weights or the articles has to be deliberate.
 */
import { describe, expect, it } from 'vitest';

import { KNOWLEDGE_ARTICLES } from '@/data/seed/articles';
import { isoOffset } from '@/domain/clock';
import { INTENTS, matchIntent, requireIntent } from '@/domain/retrieval/intents';
import {
  MIN_ANSWER_CONFIDENCE,
  WEIGHTS,
  rationaleTotal,
  scoreAnswer,
} from '@/domain/retrieval/score';
import { isStale, rankArticles, retrieve, MAX_SOURCES } from '@/domain/retrieval/search';
import { SENSITIVE_DOMAINS, SENSITIVE_DOMAIN_CEILING, type KnowledgeArticle } from '@/domain/types';

const run = (key: Parameters<typeof requireIntent>[0]) =>
  retrieve(requireIntent(key), KNOWLEDGE_ARTICLES);

describe('AC-2.1 VPN after password reset resolves through self-service', () => {
  const result = run('vpn_after_password_reset');

  it('scores in the high band and permits self-resolution', () => {
    expect(result.score.confidence).toBe(0.96);
    expect(result.score.band).toBe('high');
    expect(result.score.canSelfResolve).toBe(true);
    expect(result.failure).toBeNull();
  });

  it('cites the two fresh VPN articles, neither stale', () => {
    expect(result.citedIds).toEqual(['KB-0104', 'KB-0118']);
    expect(result.cited.every((a) => !isStale(a))).toBe(true);
  });

  it('covers every required concept', () => {
    expect(result.score.uncoveredConcepts).toEqual([]);
  });
});

describe('AC-3.1 expense-policy exception is a genuine knowledge gap', () => {
  const result = run('expense_policy_exception');

  it('retrieves nothing and refuses to answer', () => {
    expect(result.cited).toHaveLength(0);
    expect(result.failure).toBe('no_results');
    expect(result.score.canSelfResolve).toBe(false);
    expect(result.score.band).toBe('low');
  });

  it('names every uncovered concept, which is what makes the gap measurable', () => {
    expect(result.score.uncoveredConcepts).toEqual([
      'expense_policy',
      'exception_request',
      'pre_approval',
      'spend_threshold',
    ]);
  });

  it('flags the sensitive domain even though the ceiling never binds', () => {
    expect(result.score.ceilingApplied).toBe(false);
    expect(result.score.rationale.some((c) => c.key === 'sensitiveCeiling')).toBe(true);
  });
});

describe('AC-3.1 SSO login loop is capped by the sensitive-domain ceiling', () => {
  const result = run('sso_login_loop');

  it('lands exactly on the ceiling rather than its raw score', () => {
    expect(result.score.confidence).toBe(SENSITIVE_DOMAIN_CEILING);
    expect(result.score.ceilingApplied).toBe(true);
    expect(result.score.canSelfResolve).toBe(false);
    expect(result.failure).toBe('below_threshold');
  });

  it('finds adjacent articles but not the post-reset case — the whole point', () => {
    expect(result.citedIds).toEqual(['KB-0121', 'KB-0132']);
    expect(result.score.uncoveredConcepts).toEqual(['post_password_reset']);
  });

  it('surfaces that one of its two sources is past the review window', () => {
    const freshness = result.score.rationale.find((c) => c.key === 'freshness');
    expect(freshness?.detail).toMatch(/1 past the 90-day review window/);
  });
});

describe('AC-2.2 the breakdown accounts for the displayed score', () => {
  it.each(INTENTS.map((i) => i.key))('sums to the confidence for %s', (key) => {
    const result = run(key);
    expect(rationaleTotal(result.score.rationale)).toBe(result.score.confidence);
  });

  it('emits one component per weighted term', () => {
    const result = run('vpn_after_password_reset');
    expect(result.score.rationale.map((c) => c.key)).toEqual([
      'coverage',
      'sourceQuality',
      'freshness',
      'specificity',
    ]);
  });

  it('weights sum to 1, so a perfect answer scores 1.0', () => {
    const total = WEIGHTS.coverage + WEIGHTS.sourceQuality + WEIGHTS.freshness + WEIGHTS.specificity;
    expect(total).toBeCloseTo(1, 10);
  });
});

/**
 * AC-8.2 — the release-blocking invariant. No combination of inputs may allow a
 * sensitive-domain question to self-resolve. Exhaustive over the domains, swept
 * across the quality space rather than spot-checked.
 */
describe('AC-8.2 sensitive domains can never self-resolve', () => {
  const perfectArticle = (id: string): KnowledgeArticle => ({
    id: id as KnowledgeArticle['id'],
    title: 'Perfect source',
    space: 'Test',
    ownerTeam: 'Test',
    lastReviewedAt: isoOffset({ days: 0 }),
    authority: 1,
    concepts: ['a', 'b', 'c'],
    bodySummary: '',
  });

  it.each(SENSITIVE_DOMAINS)('holds for %s at maximum achievable quality', (domain) => {
    const result = scoreAnswer({
      requiredConcepts: ['a', 'b', 'c'],
      articles: [perfectArticle('KB-9001'), perfectArticle('KB-9002')],
      sensitiveDomain: domain,
      specificity: 1,
    });
    expect(result.confidence).toBeLessThanOrEqual(SENSITIVE_DOMAIN_CEILING);
    expect(result.canSelfResolve).toBe(false);
  });

  it('holds across a sweep of coverage and specificity', () => {
    for (let coverage = 0; coverage <= 3; coverage++) {
      for (const specificity of [0, 0.25, 0.5, 0.75, 1]) {
        const result = scoreAnswer({
          requiredConcepts: ['a', 'b', 'c'],
          articles: [{ ...perfectArticle('KB-9003'), concepts: ['a', 'b', 'c'].slice(0, coverage) }],
          sensitiveDomain: 'security',
          specificity,
        });
        expect(result.canSelfResolve).toBe(false);
        expect(result.confidence).toBeLessThanOrEqual(SENSITIVE_DOMAIN_CEILING);
      }
    }
  });

  it('a non-sensitive question with the same inputs does self-resolve', () => {
    const result = scoreAnswer({
      requiredConcepts: ['a', 'b', 'c'],
      articles: [perfectArticle('KB-9004')],
      sensitiveDomain: null,
      specificity: 1,
    });
    expect(result.confidence).toBe(1);
    expect(result.canSelfResolve).toBe(true);
  });
});

describe('scorer is total, never NaN', () => {
  it('handles an empty corpus without throwing', () => {
    const result = scoreAnswer({
      requiredConcepts: ['a'],
      articles: [],
      sensitiveDomain: null,
      specificity: 0,
    });
    expect(result.confidence).toBe(0);
    expect(Number.isNaN(result.confidence)).toBe(false);
    expect(result.band).toBe('low');
  });

  it('handles an intent with no required concepts', () => {
    const result = scoreAnswer({
      requiredConcepts: [],
      articles: [],
      sensitiveDomain: null,
      specificity: 0,
    });
    expect(result.confidence).toBe(0);
  });

  it('clamps an out-of-range specificity', () => {
    const high = scoreAnswer({ requiredConcepts: [], articles: [], sensitiveDomain: null, specificity: 9 });
    const low = scoreAnswer({ requiredConcepts: [], articles: [], sensitiveDomain: null, specificity: -4 });
    expect(high.confidence).toBe(WEIGHTS.specificity);
    expect(low.confidence).toBe(0);
  });
});

describe('retrieval ranking', () => {
  it('drops articles with no concept overlap rather than ranking them last', () => {
    const ranked = rankArticles(requireIntent('vpn_after_password_reset'), KNOWLEDGE_ARTICLES);
    expect(ranked.every((r) => r.conceptHits > 0)).toBe(true);
    expect(ranked.length).toBeLessThan(KNOWLEDGE_ARTICLES.length);
  });

  it('never cites more than the source cap', () => {
    for (const intent of INTENTS) {
      expect(retrieve(intent, KNOWLEDGE_ARTICLES).cited.length).toBeLessThanOrEqual(MAX_SOURCES);
    }
  });

  it('orders by concept overlap before authority', () => {
    const ranked = rankArticles(requireIntent('vpn_after_password_reset'), KNOWLEDGE_ARTICLES);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.conceptHits).toBeGreaterThanOrEqual(ranked[i]!.conceptHits);
    }
  });

  it('is deterministic across repeated calls', () => {
    const a = run('sso_login_loop');
    const b = run('sso_login_loop');
    expect(a.citedIds).toEqual(b.citedIds);
    expect(a.score.confidence).toBe(b.score.confidence);
  });
});

describe('AC-2.8 free text maps to the nearest seeded intent and discloses it', () => {
  it('matches a clearly phrased question', () => {
    const match = matchIntent('My VPN will not connect after a password reset');
    expect(match.intent.key).toBe('vpn_after_password_reset');
    expect(match.isFallback).toBe(false);
    expect(match.matchedPhraseCount).toBeGreaterThan(0);
  });

  it('routes an SSO question to the SSO intent', () => {
    expect(matchIntent('stuck in a login loop on single sign-on').intent.key).toBe('sso_login_loop');
  });

  it('flags an unmatched question as a fallback rather than pretending to understand', () => {
    const match = matchIntent('what is the capital of anywhere at all');
    expect(match.isFallback).toBe(true);
    expect(match.matchedPhraseCount).toBe(0);
  });
});

describe('answer threshold', () => {
  it('only the VPN scenario clears the answer threshold', () => {
    const clearing = INTENTS.filter((i) => run(i.key).score.confidence >= MIN_ANSWER_CONFIDENCE).map(
      (i) => i.key,
    );
    expect(clearing).toContain('vpn_after_password_reset');
    expect(clearing).not.toContain('sso_login_loop');
    expect(clearing).not.toContain('expense_policy_exception');
  });
});
