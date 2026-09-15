/**
 * Seeded pseudo-randomness for the synthetic background volume.
 *
 * The narrative records the demo walks through are hand-authored. Everything else
 * — the background demand that makes filtering, trends and clustering feel real —
 * is generated from this PRNG so the whole corpus stays reproducible from a single
 * seed. `Math.random` is banned in this layer. See ADR D-001 and D-002.
 */

/** The one seed the entire synthetic corpus derives from. */
export const RELAY_SEED = 20_260_914;

export interface Prng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** Uniform float in [min, max). */
  float(min: number, max: number): number;
  /** `true` with the given probability. */
  chance(probability: number): boolean;
  /** Uniformly pick one element. Throws on an empty list. */
  pick<T>(items: readonly T[]): T;
  /** Pick one element by relative weight. Throws on an empty or zero-weight list. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
  /** A new array, shuffled Fisher-Yates. The input is not mutated. */
  shuffle<T>(items: readonly T[]): T[];
}

/**
 * mulberry32 — small, fast, and good enough for synthetic data shaping. Chosen over
 * a heavier PRNG because the requirement is reproducibility, not statistical rigor.
 */
export function mulberry32(seed: number): Prng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };

  const prng: Prng = {
    next,

    int(min, max) {
      if (max < min) throw new Error(`int(${min}, ${max}): max must be >= min`);
      return min + Math.floor(next() * (max - min + 1));
    },

    float(min, max) {
      if (max < min) throw new Error(`float(${min}, ${max}): max must be >= min`);
      return min + next() * (max - min);
    },

    chance(probability) {
      return next() < probability;
    },

    pick(items) {
      if (items.length === 0) throw new Error('pick() requires a non-empty list');
      // Index is in range because the list is non-empty (guarded above).
      return items[Math.floor(next() * items.length)]!;
    },

    weighted(entries) {
      if (entries.length === 0) throw new Error('weighted() requires a non-empty list');
      let total = 0;
      for (const [, weight] of entries) {
        if (weight < 0) throw new Error('weighted() requires non-negative weights');
        total += weight;
      }
      if (total <= 0) throw new Error('weighted() requires at least one positive weight');

      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll < 0) return value;
      }
      // Floating-point tail: fall back to the last entry (list is non-empty).
      return entries[entries.length - 1]![0];
    },

    shuffle(items) {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        // Both indices are within bounds by construction.
        const a = out[i]!;
        out[i] = out[j]!;
        out[j] = a;
      }
      return out;
    },
  };

  return prng;
}
