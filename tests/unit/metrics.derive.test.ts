/**
 * AC-5.1, AC-5.2, AC-5.6, AC-5.7, AC-5.8 — KPI derivation.
 *
 * The values here are snapshots of what the seeded event log actually produces.
 * They exist so that a change to the corpus, the scorer, or a derivation has to
 * be deliberate rather than silent.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildInitialState } from '@/data/buildInitialState';
import { RELAY_SEED } from '@/data/prng';
import { DAY_MS } from '@/domain/clock';
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
} from '@/domain/metrics/derive';
import { METRIC_DEFINITIONS, METRIC_ORDER, formatMetric } from '@/domain/metrics/registry';
import { SUPPORT_CATEGORIES } from '@/domain/types';

const state = buildInitialState(RELAY_SEED);
const input = {
  events: state.events,
  cases: state.cases,
  clusters: state.clusters,
  conversations: state.conversations,
};

const allTime = applyFilters(input, { ...DEFAULT_FILTERS, rangeDays: null });

describe('AC-5.2 metrics match the seeded event log', () => {
  const metrics = computeMetrics(allTime);

  it('counts total demand', () => {
    expect(metrics.supportDemand).toBe(160);
  });

  it('derives self-service and escalation as complementary shares of demand', () => {
    expect(metrics.selfServiceRate).toBeCloseTo(0.656, 3);
    expect(metrics.escalationRate).toBeCloseTo(0.344, 3);
    // Every conversation either self-resolved or escalated.
    expect(metrics.selfServiceRate! + metrics.escalationRate!).toBeCloseTo(1, 5);
  });

  it('derives answer acceptance from feedback only', () => {
    expect(metrics.answerAcceptance).toBeCloseTo(0.854, 3);
  });

  it('derives search failure rate', () => {
    expect(metrics.searchFailureRate).toBeCloseTo(0.231, 3);
  });

  it('derives context completeness as a mean over case creation', () => {
    expect(metrics.contextCompleteness).toBeCloseTo(0.939, 3);
    // Below 1, because some seeded cases deliberately lack context.
    expect(metrics.contextCompleteness).toBeLessThan(1);
  });

  it('derives agent rework per case', () => {
    expect(metrics.reworkRate).toBeCloseTo(0.218, 3);
  });

  it('reports null rather than zero when a cluster has not been detected yet', () => {
    // Detection happens on screen during the demo, not in the seed.
    expect(metrics.timeToDetection).toBeNull();
    expect(metrics.recurringVolume).toBe(0);
  });

  it('is deterministic', () => {
    expect(computeMetrics(applyFilters(input, { ...DEFAULT_FILTERS, rangeDays: null }))).toEqual(
      metrics,
    );
  });
});

describe('AC-5.4 filters recompute every view', () => {
  it('narrows demand when a date range is applied', () => {
    const last30 = computeMetrics(applyFilters(input, DEFAULT_FILTERS));
    expect(last30.supportDemand).toBeLessThan(160);
    expect(last30.supportDemand).toBeGreaterThan(0);
  });

  it('narrows to one category and changes the rates', () => {
    const access = computeMetrics(
      applyFilters(input, { ...DEFAULT_FILTERS, rangeDays: null, category: 'Access & Identity' }),
    );
    expect(access.supportDemand).toBe(22);
    // Every Access & Identity request escalated: none of them could self-resolve.
    expect(access.escalationRate).toBe(1);
    expect(access.selfServiceRate).toBe(0);
    expect(access.searchFailureRate).toBe(1);
  });

  it('returns null rates rather than NaN when a filter matches nothing', () => {
    const empty = computeMetrics(
      applyFilters(input, { ...DEFAULT_FILTERS, rangeDays: 1, category: 'Facilities', system: 'Expense Platform' }),
    );
    expect(empty.supportDemand).toBe(0);
    expect(empty.selfServiceRate).toBeNull();
    expect(empty.answerAcceptance).toBeNull();
  });

  it('counts active constraints, ignoring the date range', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, category: 'Facilities' })).toBe(1);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, category: 'Facilities', system: 'Directory' })).toBe(2);
  });
});

describe('demand series', () => {
  const series = demandSeries(allTime, SUPPORT_CATEGORIES);

  it('emits a dense series with no gaps in the x-axis', () => {
    expect(series.length).toBeGreaterThan(50);
    for (let i = 1; i < series.length; i++) {
      const prev = Date.parse(series[i - 1]!.day);
      const next = Date.parse(series[i]!.day);
      expect(next - prev).toBe(DAY_MS);
    }
  });

  it('includes quiet days as zero rather than omitting them', () => {
    expect(series.some((p) => p.total === 0)).toBe(true);
  });

  it('totals reconcile with the demand metric', () => {
    const sum = series.reduce((n, p) => n + p.total, 0);
    expect(sum).toBe(computeMetrics(allTime).supportDemand);
  });
});

describe('category totals', () => {
  const totals = categoryTotals(allTime, SUPPORT_CATEGORIES);

  it('ranks by demand and omits categories with none', () => {
    expect(totals[0]!.category).toBe('Network & Devices');
    expect(totals.every((t) => t.demand > 0)).toBe(true);
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i - 1]!.demand).toBeGreaterThanOrEqual(totals[i]!.demand);
    }
  });

  it('shows Access & Identity escalating everything, which is the finding', () => {
    const access = totals.find((t) => t.category === 'Access & Identity');
    expect(access?.escalationRate).toBe(1);
  });

  it('reconciles with total demand', () => {
    expect(totals.reduce((n, t) => n + t.demand, 0)).toBe(160);
  });
});

describe('AC-5.6 failed searches distinguish content gaps from policy gates', () => {
  const rows = failedSearches(allTime);

  it('ranks by occurrence', () => {
    expect(rows[0]!.topicKey).toBe('mfa_device_change');
    expect(rows[0]!.occurrences).toBe(18);
  });

  it('lists the expense-policy query with its failure reason', () => {
    const expense = rows.find((r) => r.topicKey === 'expense_policy_exception');
    expect(expense?.reason).toBe('no_results');
    expect(expense?.occurrences).toBe(15);
    expect(expense?.query).toContain('exception to the expense policy');
  });

  /**
   * The distinction that keeps this view useful. MFA fails 18 times, but KB-0127
   * covers every concept it needs — it fails only because identity and access is
   * escalation-sensitive. Calling that a knowledge gap would commission an
   * article that already exists.
   */
  it('does not call a policy gate a content gap', () => {
    expect(rows.find((r) => r.topicKey === 'mfa_device_change')?.isContentGap).toBe(false);
  });

  it('does call a genuine coverage shortfall a content gap', () => {
    expect(rows.find((r) => r.topicKey === 'expense_policy_exception')?.isContentGap).toBe(true);
    expect(rows.find((r) => r.topicKey === 'sso_login_loop')?.isContentGap).toBe(true);
  });
});

describe('AC-5.7 knowledge gaps are content gaps only', () => {
  const gaps = knowledgeGaps(allTime);

  it('flags the topics the corpus genuinely cannot answer', () => {
    expect(gaps.map((g) => g.topicKey).sort()).toEqual(['expense_policy_exception', 'sso_login_loop']);
  });

  it('excludes the policy-gated topic despite it failing most often', () => {
    expect(gaps.some((g) => g.topicKey === 'mfa_device_change')).toBe(false);
  });

  it('carries the evidence count that justifies the gap', () => {
    expect(gaps.find((g) => g.topicKey === 'expense_policy_exception')?.evidenceCount).toBe(15);
  });
});

describe('AC-5.8 cluster rows', () => {
  it('is empty before detection, because the seed contains no cluster', () => {
    expect(clusterRows(allTime, state.cases)).toEqual([]);
  });
});

describe('metric definitions are complete and rendered from data', () => {
  it('defines every metric in the display order', () => {
    for (const key of METRIC_ORDER) {
      expect(METRIC_DEFINITIONS[key]).toBeDefined();
    }
    expect(METRIC_ORDER).toHaveLength(Object.keys(METRIC_DEFINITIONS).length);
  });

  it('AC-5.3 states formula, numerator, denominator and window for each', () => {
    for (const definition of Object.values(METRIC_DEFINITIONS)) {
      expect(definition.formula.length).toBeGreaterThan(5);
      expect(definition.numerator.length).toBeGreaterThan(5);
      expect(definition.denominator.length).toBeGreaterThan(5);
      expect(definition.window.length).toBeGreaterThan(5);
      expect(definition.purpose.length).toBeGreaterThan(20);
    }
  });

  it('formats each type, and never renders NaN', () => {
    expect(formatMetric(0.6563, 'percent')).toBe('66%');
    expect(formatMetric(160, 'count')).toBe('160');
    expect(formatMetric(0.218, 'decimal')).toBe('0.22');
    expect(formatMetric(6 * DAY_MS + 3_600_000, 'duration')).toBe('6d 1h');
    expect(formatMetric(null, 'percent')).toBe('—');
    expect(formatMetric(Number.NaN, 'count')).toBe('—');
  });
});

/**
 * AC-5.1 — the "no hard-coded totals" rule is only real if nothing in the
 * intelligence components carries a number that could be a metric.
 */
describe('AC-5.1 no authored metric values in the intelligence UI', () => {
  const dir = join(process.cwd(), 'src', 'components', 'intelligence');

  const collect = (d: string, out: string[] = []): string[] => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return out;
    }
    for (const entry of entries) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) collect(full, out);
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
  };

  it('contains no percentage or large numeric literal in JSX text', () => {
    const offenders: string[] = [];
    for (const file of collect(dir)) {
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      // A literal percentage or a bare number over 20 rendered into markup.
      if (/>\s*\d+%/.test(source) || />\s*\d{2,}\s*</.test(source)) {
        offenders.push(file.replace(process.cwd(), ''));
      }
    }
    expect(offenders).toEqual([]);
  });
});
