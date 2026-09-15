/**
 * Opportunity prioritization.
 *
 * Two properties matter more than the formula itself:
 *
 * 1. **The score is never stored.** Only the inputs are. A stored score and
 *    editable inputs drift apart the first time someone changes one without
 *    recomputing the other (ADR D-009).
 * 2. **The arithmetic is shown substituted.** Not "RICE score: 21" but
 *    `(0.217 x 4 x 0.8) / 3 x 0.9 = 21`. A prioritization number that cannot be
 *    argued with is a number that gets ignored the moment someone disagrees.
 */
import type { PriorityInputs, ProductOpportunity } from '../types';

export const INPUT_BOUNDS = {
  impact: { min: 1, max: 5, step: 1, label: 'Impact', hint: '1 marginal, 5 transformative' },
  reachEmployees: { min: 0, max: 10_000, step: 1, label: 'Reach', hint: 'Employees affected' },
  confidence: { min: 0.1, max: 1, step: 0.05, label: 'Confidence', hint: 'How sure we are of impact and reach' },
  effort: { min: 1, max: 5, step: 0.5, label: 'Effort', hint: '1 days, 5 a quarter' },
  risk: { min: 0, max: 0.5, step: 0.05, label: 'Risk', hint: 'Discount for delivery or adoption risk' },
} as const;

export type PriorityInputKey = keyof typeof INPUT_BOUNDS;

export const PRIORITY_INPUT_KEYS = [
  'impact',
  'reachEmployees',
  'confidence',
  'effort',
  'risk',
] as const satisfies readonly PriorityInputKey[];

export interface PriorityTerm {
  label: string;
  value: string;
}

export interface PriorityResult {
  score: number;
  reachNorm: number;
  raw: number;
  /** The substituted arithmetic, line by line, for display. */
  steps: PriorityTerm[];
  /** Which single input contributes most to the current score. */
  dominantDriver: PriorityInputKey;
  /** Plain-language sensitivity: what one change would do. */
  sensitivity: string;
  /** Populated when an input is out of range; the score falls back to 0. */
  errors: Partial<Record<PriorityInputKey, string>>;
}

const round = (n: number, dp = 3): number => Math.round(n * 10 ** dp) / 10 ** dp;

/** Validate inputs against their declared bounds. */
export function validateInputs(inputs: PriorityInputs): Partial<Record<PriorityInputKey, string>> {
  const errors: Partial<Record<PriorityInputKey, string>> = {};
  for (const key of PRIORITY_INPUT_KEYS) {
    const bound = INPUT_BOUNDS[key];
    const value = inputs[key];
    if (!Number.isFinite(value)) {
      errors[key] = 'Must be a number';
    } else if (value < bound.min || value > bound.max) {
      errors[key] = `Must be between ${bound.min} and ${bound.max}`;
    }
  }
  return errors;
}

/**
 * Compute a priority score.
 *
 *   reachNorm = reachEmployees / activeEmployees
 *   raw       = (reachNorm x impact x confidence) / effort
 *   priority  = round(raw x (1 - risk) x 100)
 *
 * Total by construction: invalid input yields a zero score and a populated
 * `errors` map rather than NaN reaching the screen.
 */
export function computePriority(
  inputs: PriorityInputs,
  activeEmployees: number,
): PriorityResult {
  const errors = validateInputs(inputs);
  const population = Math.max(1, activeEmployees);

  if (Object.keys(errors).length > 0 || inputs.effort <= 0) {
    return {
      score: 0,
      reachNorm: 0,
      raw: 0,
      steps: [],
      dominantDriver: 'impact',
      sensitivity: 'Correct the highlighted inputs to see a score.',
      errors:
        inputs.effort <= 0 ? { ...errors, effort: 'Must be greater than zero' } : errors,
    };
  }

  const reachNorm = inputs.reachEmployees / population;
  const raw = (reachNorm * inputs.impact * inputs.confidence) / inputs.effort;
  const score = Math.round(raw * (1 - inputs.risk) * 100);

  const steps: PriorityTerm[] = [
    {
      label: 'reachNorm',
      value: `${inputs.reachEmployees} / ${population} = ${round(reachNorm)}`,
    },
    {
      label: 'raw',
      value: `(${round(reachNorm)} × ${inputs.impact} × ${inputs.confidence}) / ${inputs.effort} = ${round(raw)}`,
    },
    {
      label: 'priority',
      value: `${round(raw)} × (1 − ${inputs.risk}) × 100 = ${score}`,
    },
  ];

  return {
    score,
    reachNorm: round(reachNorm),
    raw: round(raw),
    steps,
    dominantDriver: findDominantDriver(inputs, population, score),
    sensitivity: describeSensitivity(inputs, population, score),
    errors: {},
  };
}

/**
 * Which input moves the score most.
 *
 * Measured by perturbation rather than by reading the formula: each input is
 * nudged one step in the favourable direction and the largest resulting change
 * wins. That stays correct if the formula changes.
 */
function findDominantDriver(
  inputs: PriorityInputs,
  population: number,
  baseline: number,
): PriorityInputKey {
  let best: PriorityInputKey = 'impact';
  let bestDelta = -Infinity;

  for (const key of PRIORITY_INPUT_KEYS) {
    const bound = INPUT_BOUNDS[key];
    // Lower effort and lower risk improve the score; the others improve upward.
    const direction = key === 'effort' || key === 'risk' ? -1 : 1;
    const next = { ...inputs, [key]: clamp(inputs[key] + direction * bound.step, bound.min, bound.max) };
    if (next[key] === inputs[key]) continue;

    const reachNorm = next.reachEmployees / population;
    const raw = (reachNorm * next.impact * next.confidence) / next.effort;
    const delta = Math.round(raw * (1 - next.risk) * 100) - baseline;

    if (delta > bestDelta) {
      bestDelta = delta;
      best = key;
    }
  }
  return best;
}

function describeSensitivity(
  inputs: PriorityInputs,
  population: number,
  baseline: number,
): string {
  const lowerEffort = Math.max(INPUT_BOUNDS.effort.min, inputs.effort - 1);
  if (lowerEffort === inputs.effort) {
    return `Already at minimum effort. Raising confidence to ${INPUT_BOUNDS.confidence.max} is the next largest move.`;
  }

  const reachNorm = inputs.reachEmployees / population;
  const raw = (reachNorm * inputs.impact * inputs.confidence) / lowerEffort;
  const score = Math.round(raw * (1 - inputs.risk) * 100);

  return `Effort ${inputs.effort} → ${lowerEffort} would move this from ${baseline} to ${score}.`;
}

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** Rank opportunities by computed score. Ties break on title for stability. */
export function rankOpportunities(
  opportunities: readonly ProductOpportunity[],
  activeEmployees: number,
): { opportunity: ProductOpportunity; result: PriorityResult }[] {
  return opportunities
    .map((opportunity) => ({
      opportunity,
      result: computePriority(opportunity.inputs, activeEmployees),
    }))
    .sort((a, b) => b.result.score - a.result.score || a.opportunity.title.localeCompare(b.opportunity.title));
}
