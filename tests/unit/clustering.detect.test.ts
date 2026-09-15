/**
 * AC-4.1, AC-4.2 — recurring-issue detection.
 *
 * The seeded SSO cases are the fixture, because the demo depends on this exact
 * corpus clustering the way the narrative says it does.
 */
import { describe, expect, it } from 'vitest';

import { buildInitialState } from '@/data/buildInitialState';
import { RELAY_SEED } from '@/data/prng';
import { DEMO_NOW, isoOffset } from '@/domain/clock';
import {
  CLUSTER_WINDOW_DAYS,
  MIN_CLUSTER_SIZE,
  SIMILARITY_THRESHOLD,
  buildCluster,
  findCandidate,
  isMatch,
  jaccard,
  similarCases,
  similarity,
  timeToDetectionMs,
} from '@/domain/clustering/detect';
import { DAY_MS } from '@/domain/clock';
import type { ClusterId, SupportCase } from '@/domain/types';

const state = buildInitialState(RELAY_SEED);
const allCases = Object.values(state.cases);
const ssoCases = allCases.filter((c) => c.conceptTags.includes('login_loop'));

describe('jaccard overlap', () => {
  it('scores identical sets as 1 and disjoint sets as 0', () => {
    expect(jaccard(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(jaccard(['a'], ['b'])).toBe(0);
  });

  it('treats an empty set as no overlap rather than a perfect match', () => {
    expect(jaccard([], [])).toBe(0);
    expect(jaccard(['a'], [])).toBe(0);
  });

  it('scores partial overlap proportionally', () => {
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 5);
  });
});

describe('AC-4.1 similarity is scored and explained by the same pass', () => {
  it('scores two SSO cases above the threshold', () => {
    const [a, b] = ssoCases;
    const result = similarity(a!, b!);
    expect(result.score).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
    expect(result.withinWindow).toBe(true);
    expect(isMatch(a!, b!)).toBe(true);
  });

  it('emits a reason for every term that fired', () => {
    const [a, b] = ssoCases;
    const { reasons } = similarity(a!, b!);
    expect(reasons.some((r) => r.startsWith('Same category'))).toBe(true);
    expect(reasons.some((r) => r.startsWith('Same affected system'))).toBe(true);
    expect(reasons.some((r) => r.startsWith('Shared symptoms'))).toBe(true);
    expect(reasons.some((r) => r.includes('day window'))).toBe(true);
  });

  it('does not match cases from different categories', () => {
    const sso = ssoCases[0]!;
    const other = allCases.find((c) => c.category !== sso.category);
    expect(other).toBeDefined();
    expect(isMatch(sso, other!)).toBe(false);
  });

  it('rejects an otherwise identical case outside the time window', () => {
    const base = ssoCases[0]!;
    const stale: SupportCase = { ...base, id: 'CASE-9999', createdAt: isoOffset({ days: -40 }) };
    const result = similarity(base, stale);
    expect(result.score).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
    // Similar, but not the same incident.
    expect(result.withinWindow).toBe(false);
    expect(isMatch(base, stale)).toBe(false);
  });
});

describe('AC-4.1 candidate formation', () => {
  it('gathers all four seeded SSO cases from any one of them', () => {
    for (const seed of ssoCases) {
      const candidate = findCandidate(seed, allCases);
      expect(candidate.members).toHaveLength(4);
      expect(candidate.meetsThreshold).toBe(true);
    }
  });

  it('derives the affected-employee count from distinct employees', () => {
    const candidate = findCandidate(ssoCases[0]!, allCases);
    expect(candidate.affectedEmployeeCount).toBe(4);
  });

  it('produces a shared signature across members', () => {
    const candidate = findCandidate(ssoCases[0]!, allCases);
    expect(candidate.signature.category).toBe('Access & Identity');
    expect(candidate.signature.system).toBe('Identity Provider');
    expect(candidate.signature.conceptTags).toContain('login_loop');
    expect(candidate.signature.conceptTags).toContain('post_password_reset');
  });

  it('orders members oldest first, so firstCaseAt is the earliest', () => {
    const candidate = findCandidate(ssoCases[0]!, allCases);
    const dates = candidate.members.map((m) => m.createdAt);
    expect([...dates].sort()).toEqual(dates);
    expect(candidate.firstCaseAt).toBe(dates[0]);
  });

  it('states the threshold in its own rationale, so the rule is visible', () => {
    const candidate = findCandidate(ssoCases[0]!, allCases);
    expect(candidate.matchRationale.some((r) => r.includes(String(SIMILARITY_THRESHOLD)))).toBe(true);
  });
});

describe('AC-4.2 below the threshold, nothing clusters', () => {
  it('does not meet the threshold with only two matching cases', () => {
    const [a, b] = ssoCases;
    const candidate = findCandidate(a!, [a!, b!]);
    expect(candidate.members).toHaveLength(2);
    expect(candidate.members.length).toBeLessThan(MIN_CLUSTER_SIZE);
    expect(candidate.meetsThreshold).toBe(false);
  });

  it('a case with no relatives is a candidate of one', () => {
    const lone = allCases.find((c) => !c.conceptTags.includes('login_loop'))!;
    const candidate = findCandidate(lone, [lone]);
    expect(candidate.members).toHaveLength(1);
    expect(candidate.meetsThreshold).toBe(false);
  });
});

describe('AC-5.8 time to detection', () => {
  it('measures from the earliest member case to the moment of detection', () => {
    const candidate = findCandidate(ssoCases[0]!, allCases);
    const cluster = buildCluster('CLU-0001' as ClusterId, candidate, DEMO_NOW);

    const elapsed = timeToDetectionMs(cluster);
    expect(elapsed).toBeGreaterThan(0);
    // The oldest seeded SSO case is six days before the demo present.
    expect(Math.round(elapsed / DAY_MS)).toBe(6);
  });

  it('carries the whole membership and its rationale onto the cluster', () => {
    const candidate = findCandidate(ssoCases[0]!, allCases);
    const cluster = buildCluster('CLU-0001' as ClusterId, candidate, DEMO_NOW);
    expect(cluster.caseIds).toHaveLength(4);
    expect(cluster.matchRationale.length).toBeGreaterThan(2);
    expect(cluster.status).toBe('confirmed');
  });
});

describe('similar-case suggestions', () => {
  it('suggests the other three SSO cases and nothing else', () => {
    const suggestions = similarCases(ssoCases[0]!, allCases);
    expect(suggestions).toHaveLength(3);
    expect(suggestions.every((s) => s.supportCase.conceptTags.includes('login_loop'))).toBe(true);
  });

  it('never suggests the case itself', () => {
    const suggestions = similarCases(ssoCases[0]!, allCases);
    expect(suggestions.some((s) => s.supportCase.id === ssoCases[0]!.id)).toBe(false);
  });

  it('orders by descending similarity', () => {
    const suggestions = similarCases(ssoCases[0]!, allCases);
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1]!.breakdown.score).toBeGreaterThanOrEqual(
        suggestions[i]!.breakdown.score,
      );
    }
  });

  it('is deterministic', () => {
    const a = similarCases(ssoCases[0]!, allCases).map((s) => s.supportCase.id);
    const b = similarCases(ssoCases[0]!, allCases).map((s) => s.supportCase.id);
    expect(a).toEqual(b);
  });

  it('respects the window when suggesting', () => {
    const suggestions = similarCases(ssoCases[0]!, allCases);
    for (const s of suggestions) {
      expect(s.breakdown.withinWindow).toBe(true);
    }
    expect(CLUSTER_WINDOW_DAYS).toBe(7);
  });
});
