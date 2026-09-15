/**
 * AC-6.2, AC-6.3, AC-6.6, AC-8.5 — prioritization.
 */
import { describe, expect, it } from 'vitest';

import { buildInitialState } from '@/data/buildInitialState';
import { RELAY_SEED } from '@/data/prng';
import { ACTIVE_EMPLOYEE_COUNT } from '@/data/seed/people';
import {
  INPUT_BOUNDS,
  PRIORITY_INPUT_KEYS,
  computePriority,
  rankOpportunities,
  validateInputs,
} from '@/domain/prioritization/score';
import type { PriorityInputs } from '@/domain/types';

const base: PriorityInputs = {
  impact: 4,
  reachEmployees: 5,
  confidence: 0.8,
  effort: 3,
  risk: 0.1,
  reachOverridden: false,
};

describe('AC-6.2 the arithmetic shown produces the score shown', () => {
  const result = computePriority(base, ACTIVE_EMPLOYEE_COUNT);

  it('computes the documented formula', () => {
    const reachNorm = 5 / ACTIVE_EMPLOYEE_COUNT;
    const raw = (reachNorm * 4 * 0.8) / 3;
    expect(result.score).toBe(Math.round(raw * 0.9 * 100));
  });

  it('shows every step substituted, not symbolic', () => {
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0]!.value).toContain(`5 / ${ACTIVE_EMPLOYEE_COUNT}`);
    expect(result.steps[1]!.value).toContain('× 4 ×');
    expect(result.steps[2]!.value).toContain(`= ${result.score}`);
  });

  it('the final step evaluates to the displayed score', () => {
    const stated = Number(result.steps[2]!.value.split('=').pop()!.trim());
    expect(stated).toBe(result.score);
  });
});

describe('AC-6.3 sensitivity describes a real alternative', () => {
  it('states what lowering effort by one would do, and is correct', () => {
    const result = computePriority(base, ACTIVE_EMPLOYEE_COUNT);
    const lowered = computePriority({ ...base, effort: 2 }, ACTIVE_EMPLOYEE_COUNT);

    expect(result.sensitivity).toContain('Effort 3 → 2');
    expect(result.sensitivity).toContain(String(result.score));
    expect(result.sensitivity).toContain(String(lowered.score));
  });

  it('lowering effort raises the score', () => {
    expect(computePriority({ ...base, effort: 2 }, ACTIVE_EMPLOYEE_COUNT).score).toBeGreaterThan(
      computePriority(base, ACTIVE_EMPLOYEE_COUNT).score,
    );
  });

  it('says something useful when already at minimum effort', () => {
    const atFloor = computePriority({ ...base, effort: 1 }, ACTIVE_EMPLOYEE_COUNT);
    expect(atFloor.sensitivity).toContain('minimum effort');
  });

  it('names a dominant driver that is one of the inputs', () => {
    const result = computePriority(base, ACTIVE_EMPLOYEE_COUNT);
    expect(PRIORITY_INPUT_KEYS).toContain(result.dominantDriver);
  });
});

describe('AC-6.6 invalid input never reaches the screen as NaN', () => {
  it('rejects an out-of-range impact and scores zero', () => {
    const result = computePriority({ ...base, impact: 99 }, ACTIVE_EMPLOYEE_COUNT);
    expect(result.errors.impact).toBeDefined();
    expect(result.score).toBe(0);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  it('rejects a negative risk', () => {
    expect(computePriority({ ...base, risk: -1 }, ACTIVE_EMPLOYEE_COUNT).errors.risk).toBeDefined();
  });

  it('rejects zero effort rather than dividing by it', () => {
    const result = computePriority({ ...base, effort: 0 }, ACTIVE_EMPLOYEE_COUNT);
    expect(result.errors.effort).toBeDefined();
    expect(Number.isFinite(result.score)).toBe(true);
  });

  it('rejects NaN', () => {
    expect(computePriority({ ...base, impact: Number.NaN }, ACTIVE_EMPLOYEE_COUNT).score).toBe(0);
  });

  it('survives a zero population without dividing by zero', () => {
    expect(Number.isFinite(computePriority(base, 0).score)).toBe(true);
  });

  it('accepts every value at the declared bounds', () => {
    for (const key of PRIORITY_INPUT_KEYS) {
      const bound = INPUT_BOUNDS[key];
      expect(validateInputs({ ...base, [key]: bound.min })[key]).toBeUndefined();
      expect(validateInputs({ ...base, [key]: bound.max })[key]).toBeUndefined();
    }
  });
});

describe('ranking', () => {
  const state = buildInitialState(RELAY_SEED);
  const opportunities = Object.values(state.opportunities);

  it('seeds a backlog spanning every state', () => {
    expect(opportunities.length).toBeGreaterThanOrEqual(5);
    const states = new Set(opportunities.map((o) => o.state));
    expect(states.has('discover')).toBe(true);
    expect(states.has('validate')).toBe(true);
    expect(states.has('planned')).toBe(true);
    expect(states.has('in_progress')).toBe(true);
  });

  it('AC-6.4 gives every opportunity at least one evidence link', () => {
    for (const opportunity of opportunities) {
      expect(opportunity.evidence.length).toBeGreaterThan(0);
    }
  });

  it('orders by computed score, descending', () => {
    const ranked = rankOpportunities(opportunities, ACTIVE_EMPLOYEE_COUNT);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.result.score).toBeGreaterThanOrEqual(ranked[i]!.result.score);
    }
  });

  it('AC-6.3 re-ranks when an input changes', () => {
    const before = rankOpportunities(opportunities, ACTIVE_EMPLOYEE_COUNT);
    const last = before[before.length - 1]!.opportunity;

    // Make the lowest-ranked opportunity cheap and certain.
    const boosted = opportunities.map((o) =>
      o.id === last.id ? { ...o, inputs: { ...o.inputs, effort: 1, confidence: 1, impact: 5 } } : o,
    );
    const after = rankOpportunities(boosted, ACTIVE_EMPLOYEE_COUNT);
    expect(after[0]!.opportunity.id).toBe(last.id);
  });

  it('is deterministic', () => {
    expect(rankOpportunities(opportunities, ACTIVE_EMPLOYEE_COUNT).map((r) => r.opportunity.id)).toEqual(
      rankOpportunities(opportunities, ACTIVE_EMPLOYEE_COUNT).map((r) => r.opportunity.id),
    );
  });

  /**
   * AC-8.5 — the score is derived, so it must not appear in the persisted
   * record. A stored score and editable inputs drift apart (ADR D-009).
   */
  it('AC-8.5 never persists a score on the opportunity', () => {
    for (const opportunity of opportunities) {
      expect('priorityScore' in opportunity).toBe(false);
      expect('explanation' in opportunity).toBe(false);
    }
    expect(JSON.stringify(state.opportunities)).not.toContain('priorityScore');
  });

  it('includes a consolidation bet, not only new features', () => {
    // Enterprise support is a portfolio; a backlog with no retirement in it is
    // not describing the job honestly.
    expect(
      opportunities.some((o) => /retire|consolidat|deprecat/i.test(o.title + o.problemStatement)),
    ).toBe(true);
  });
});
