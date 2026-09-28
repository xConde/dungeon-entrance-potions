import { Injectable } from '@angular/core';
import { createRng, Rng } from '../utils/rng';

/**
 * Game-scoped RNG service.
 *
 * Wraps the seeded PRNG so every service/component in the potion-stand
 * feature tree shares the same deterministic stream.
 *
 * Provided in PotionStandComponent's `providers` array (not root).
 */
@Injectable()
export class GameRngService {
  private rng: Rng;

  constructor() {
    // Auto-initialize with a random seed so the service is NEVER in an
    // uninitialised state. Callers can re-seed via initialize() or restoreState().
    const seed = Math.floor(Math.random() * 2147483646) + 1;
    this.rng = createRng(seed);
  }

  /**
   * Initialise (or re-initialise) the PRNG with a fresh seed.
   *
   * @param seed  If omitted a random seed is generated from `Math.random()`
   *              so first-time play is still unpredictable.
   */
  initialize(seed?: number): void {
    this.rng = createRng(seed ?? Math.floor(Math.random() * 2147483646) + 1);
  }

  /** Return the current internal state seed (for save/restore mid-game). */
  getState(): number {
    return this.rng.getState().seed;
  }

  /** Restore from a previously-saved state seed. */
  restoreState(stateSeed: number): void {
    this.rng = createRng(stateSeed);
  }

  // ---------------------------------------------------------------------------
  // Delegated convenience methods
  // ---------------------------------------------------------------------------

  /** Raw float in [0, 1) */
  nextFloat(): number {
    return this.rng.next();
  }

  /** Random integer in [min, max] (inclusive) */
  range(min: number, max: number): number {
    return this.rng.range(min, max);
  }

  /** true with the given probability */
  chance(probability: number): boolean {
    return this.rng.chance(probability);
  }

  /** Uniformly random element */
  pick<T>(array: readonly T[]): T {
    return this.rng.pick(array);
  }

  /** Weighted random selection */
  weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
    return this.rng.weightedPick(items, weights);
  }

  /** Fisher-Yates in-place shuffle */
  shuffle<T>(array: T[]): T[] {
    return this.rng.shuffle(array);
  }
}
