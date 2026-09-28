/**
 * Seeded PRNG — Park-Miller / Lehmer LCG
 *
 * Deterministic pseudo-random number generator suitable for game state
 * that needs to be reproducible from a known seed.
 *
 * Period: 2^31 - 2 (~2.1 billion).
 * NOT cryptographically secure — fine for game mechanics.
 */

/** Serializable RNG state (just the current seed value) */
export interface RngState {
  seed: number;
}

/** RNG instance with convenience methods */
export interface Rng {
  /** Advance state and return float in [0, 1) */
  next(): number;

  /** Random integer in [min, max] (inclusive) */
  range(min: number, max: number): number;

  /** Return true with the given probability (0 = never, 1 = always) */
  chance(probability: number): boolean;

  /** Pick a uniformly random element from a non-empty array */
  pick<T>(array: readonly T[]): T;

  /** Weighted random selection. `weights` must be same length as `items`. */
  weightedPick<T>(items: readonly T[], weights: readonly number[]): T;

  /** Fisher-Yates in-place shuffle — returns the same (mutated) array */
  shuffle<T>(array: T[]): T[];

  /** Snapshot current seed so state can be serialized / restored */
  getState(): RngState;
}

// Park-Miller constants
const A = 16807; // 7^5
const M = 2147483647; // 2^31 - 1 (Mersenne prime)

/**
 * Create a seeded PRNG instance.
 *
 * @param seed  Initial seed. Must be in [1, M-1]. Values outside that range
 *              are clamped via modulo so the generator still works.
 */
export function createRng(seed: number): Rng {
  // Ensure seed is a positive integer in the valid range [1, M-1]
  let state = Math.abs(Math.floor(seed)) % M || 1;

  function next(): number {
    state = (state * A) % M;
    return (state - 1) / (M - 1); // maps to [0, 1)
  }

  function range(min: number, max: number): number {
    return min + Math.floor(next() * (max - min + 1));
  }

  function chance(probability: number): boolean {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return next() < probability;
  }

  function pick<T>(array: readonly T[]): T {
    return array[Math.floor(next() * array.length)];
  }

  function weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let roll = next() * totalWeight;

    for (let i = 0; i < items.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return items[i];
    }

    // Fallback (floating-point edge case)
    return items[items.length - 1];
  }

  function shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const tmp = array[i];
      array[i] = array[j];
      array[j] = tmp;
    }
    return array;
  }

  function getState(): RngState {
    return { seed: state };
  }

  return { next, range, chance, pick, weightedPick, shuffle, getState };
}
