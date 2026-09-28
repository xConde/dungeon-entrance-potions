import { Injectable } from '@angular/core';

import { DUNGEON, ECONOMY, GUILT, MARKET, POTIONS, REPUTATION } from '../config/game-config';
import { GameState } from '../models/game-state.model';

export type GuiltLevel = 'low' | 'medium' | 'high' | 'maximum';

/**
 * Pure reputation-delta amplification + clamp. Extracted from adjustReputation()
 * so any code that needs to predict its outcome (e.g. the close-day preview
 * ledger) can simulate the exact same sequence — including guilt thresholds
 * crossed mid-simulation and the MIN/MAX_REPUTATION clamp — without mutating
 * EconomyService state. Keep this the ONLY place the amplification math lives;
 * adjustReputation() below must stay a thin wrapper around it.
 */
export function applyReputationDelta(reputation: number, guilt: number, delta: number): number {
  let adjustedDelta = delta;

  // Guilt amplifies reputation LOSSES only (negative delta).
  // Stops amplifying below AMPLIFICATION_FLOOR to prevent irreversible doom spirals.
  if (adjustedDelta < 0 && reputation > GUILT.AMPLIFICATION_FLOOR) {
    if (guilt >= GUILT.HIGH_THRESHOLD) {
      adjustedDelta *= GUILT.REP_LOSS_MULTIPLIER_HIGH;
    } else if (guilt >= GUILT.MEDIUM_THRESHOLD) {
      adjustedDelta *= GUILT.REP_LOSS_MULTIPLIER_MEDIUM;
    }
  }

  return Math.max(ECONOMY.MIN_REPUTATION, Math.min(ECONOMY.MAX_REPUTATION, reputation + adjustedDelta));
}

/**
 * Centralized economic state service for Potion Stand.
 *
 * Owns ALL gold, reputation, guilt, dungeon-progression, and statistics state.
 * Every mutation goes through a named method with a reason string, making
 * economic changes auditable and atomic.
 *
 * NOT providedIn root — scoped to PotionStandComponent's providers array.
 */
@Injectable()
export class EconomyService {
  // ---------------------------------------------------------------------------
  // Core
  // ---------------------------------------------------------------------------
  gold: number = ECONOMY.STARTING_GOLD;
  reputation: number = ECONOMY.STARTING_REPUTATION;

  // ---------------------------------------------------------------------------
  // Daily tracking (reset each day via resetDaily())
  // ---------------------------------------------------------------------------
  dailyProfit = 0;
  dailyExpenses = 0;
  dailyDeaths = 0;
  dailySaves = 0;
  dailyPotionsSold = 0;
  dailyDeathsYourFault = 0;
  dailyBossesDefeated = 0;
  dailyUnprepared = 0;
  startOfDayReputation: number = ECONOMY.STARTING_REPUTATION;

  // ---------------------------------------------------------------------------
  // Lifetime statistics
  // ---------------------------------------------------------------------------
  deathCount = 0;
  savedCount = 0;
  deathStreak = 0;
  maxDeathStreak = 0;
  /** Next-day spawn reduction flag — set when death streak reaches severe threshold */
  spawnReductionActive = false;
  goldEarned = 0;
  potionsSold = 0;
  deathsByPotion = 0;
  deathsByDilution = 0;
  perfectSaves = 0;
  encountersSurvived = 0;
  bossesDefeated = 0;
  combosTriggered = 0;
  dilutedSold = 0;

  // ---------------------------------------------------------------------------
  // Market demand state (reset and recalculated at start of each day)
  // ---------------------------------------------------------------------------
  demandState: {
    healingDemandSurge: boolean;
    strengthDemandBoost: boolean;
    luckDemandBoost: boolean;
    priceVariance: number; // Multiplier: 0.85 to 1.15
  } = {
    healingDemandSurge: false,
    strengthDemandBoost: false,
    luckDemandBoost: false,
    priceVariance: 1.0,
  };

  // ---------------------------------------------------------------------------
  // Guilt
  // ---------------------------------------------------------------------------
  guilt = 0;
  peakGuilt = 0;
  readonly maxGuilt: number = POTIONS.MAX_GUILT;

  // ---------------------------------------------------------------------------
  // Dungeon progression
  // ---------------------------------------------------------------------------
  dungeonDifficulty = 1;
  currentFloor = 1;
  highestFloor = 1;

  // =========================================================================
  // Transactions
  // =========================================================================

  /** Add gold (from sales, tips, etc.). Updates dailyProfit and goldEarned. */
  addGold(amount: number, _reason: string): void {
    this.gold += amount;
    this.dailyProfit += amount;
    this.goldEarned += amount;
  }

  /**
   * Spend gold. Returns false if insufficient funds (transaction not applied).
   * Does NOT update dailyExpenses — call that separately when appropriate.
   */
  spendGold(amount: number, _reason: string): boolean {
    if (this.gold < amount) {
      return false;
    }
    this.gold -= amount;
    return true;
  }

  /**
   * Adjust reputation by delta, clamped to [MIN_REPUTATION, MAX_REPUTATION].
   * Negative deltas are amplified by guilt-level multipliers.
   */
  adjustReputation(delta: number, _cause: string): void {
    this.reputation = applyReputationDelta(this.reputation, this.guilt, delta);
  }

  // =========================================================================
  // Statistics
  // =========================================================================

  /** Record a potion sale (potionsSold++, dailyPotionsSold++). Gold is tracked via addGold(). */
  recordSale(): void {
    this.potionsSold++;
    this.dailyPotionsSold++;
  }

  /**
   * Record a surviving adventurer.
   * Resets death streak, bumps reputation, and tracks encounters/bosses/perfect saves.
   */
  recordSurvivor(perfectSave: boolean, bossDefeated: boolean): void {
    this.savedCount++;
    this.dailySaves++;
    this.deathStreak = 0;
    this.spawnReductionActive = false; // Survivor breaks the death streak curse
    this.encountersSurvived++;

    this.adjustReputation(REPUTATION.SURVIVOR_BONUS, 'survivor');

    if (bossDefeated) {
      this.bossesDefeated++;
      this.dailyBossesDefeated++;
    }
    if (perfectSave) {
      this.perfectSaves++;
    }
  }

  /**
   * Record an adventurer death.
   * Updates death count, streak, reputation loss, and per-cause counters.
   */
  recordDeath(hadPotion: boolean, hadDiluted: boolean, wasYourFault: boolean): void {
    this.deathCount++;
    this.dailyDeaths++;
    this.deathStreak++;
    this.maxDeathStreak = Math.max(this.maxDeathStreak, this.deathStreak);

    if (hadPotion) {
      this.deathsByPotion++;
    }
    if (hadDiluted) {
      this.deathsByDilution++;
    }

    // Reputation loss scales with culpability
    let reputationLoss: number = REPUTATION.DEATH_NO_POTION;
    if (hadDiluted) {
      reputationLoss = REPUTATION.DEATH_WITH_DILUTED;
    } else if (hadPotion) {
      reputationLoss = REPUTATION.DEATH_WITH_POTION;
    }
    this.adjustReputation(-reputationLoss, 'adventurer-death');

    // Death streak penalty: fires on EVERY death at streak 5+, not just the first.
    // Intentional cascading pressure — 5 consecutive deaths is catastrophic and
    // should feel punishing. The -5 rep is fixed (not amplified by guilt).
    if (this.deathStreak >= REPUTATION.DEATH_STREAK_PENALTY_THRESHOLD) {
      this.adjustReputation(-REPUTATION.DEATH_STREAK_REP_PENALTY, 'death-streak');
    }

    // Severe death streak: reduce customer spawns until a survivor breaks the curse
    if (this.deathStreak >= REPUTATION.DEATH_STREAK_SPAWN_THRESHOLD) {
      this.spawnReductionActive = true;
    }

    if (wasYourFault) {
      this.dailyDeathsYourFault++;
      this.addGuilt(POTIONS.GUILT_PER_DEATH);
    }
  }

  /** Record a combo activation. */
  recordCombo(): void {
    this.combosTriggered++;
  }

  /** Record a diluted potion sale. */
  recordDilutedSale(): void {
    this.dilutedSold++;
  }

  /** Record an encounter survived (called from recordSurvivor already, exposed for other uses). */
  recordEncounter(): void {
    this.encountersSurvived++;
  }

  // =========================================================================
  // Guilt
  // =========================================================================

  addGuilt(amount: number): void {
    this.guilt = Math.min(this.maxGuilt, this.guilt + amount);
    this.peakGuilt = Math.max(this.peakGuilt, this.guilt);
  }

  /**
   * Decay guilt by the given base amount using an asymptotic curve.
   * Faster at low guilt, slower at high guilt — harder to forget what you've done.
   * Formula: effectiveDecay = amount * max(0.1, 1 - guilt / DECAY_ASYMPTOTE)
   * At guilt 20: ~87% of base. At guilt 80: ~47% of base. At guilt 120: ~20% of base.
   */
  decayGuilt(amount: number): void {
    const effectiveDecay = amount * Math.max(0.1, 1 - this.guilt / GUILT.DECAY_ASYMPTOTE);
    this.guilt = Math.max(0, this.guilt - effectiveDecay);
  }

  /** Returns the current guilt level based on config thresholds. */
  getGuiltLevel(): GuiltLevel {
    if (this.guilt < GUILT.LOW_THRESHOLD) return 'low';
    if (this.guilt < GUILT.MEDIUM_THRESHOLD) return 'medium';
    if (this.guilt < GUILT.HIGH_THRESHOLD) return 'high';
    return 'maximum';
  }

  // =========================================================================
  // Day cycle
  // =========================================================================

  /**
   * Calculate demand shifts based on previous day performance.
   * Called at start of each new day BEFORE resetDaily().
   */
  calculateDemandShifts(rng: { nextFloat: () => number }): void {
    const totalAdventurersToday = this.dailyDeaths + this.dailySaves;
    const deathRate = totalAdventurersToday > 0 ? this.dailyDeaths / totalAdventurersToday : 0;

    // High deaths → healing demand surges
    this.demandState.healingDemandSurge = deathRate >= MARKET.HIGH_DEATH_THRESHOLD;

    // High survival → strength/luck demand rises (adventurers want more offense/loot)
    this.demandState.strengthDemandBoost = deathRate < 0.3 && this.dailySaves >= 3;
    this.demandState.luckDemandBoost = deathRate < 0.2 && this.dailySaves >= 5;

    // Daily price variance: seeded RNG for determinism
    const variance = (rng.nextFloat() * 2 - 1) * MARKET.PRICE_VARIANCE_RANGE;
    this.demandState.priceVariance = 1.0 + variance;
  }

  /** Reset daily counters at the start of a new day. */
  resetDaily(): void {
    this.dailyProfit = 0;
    this.dailyExpenses = 0;
    this.dailyDeaths = 0;
    this.dailySaves = 0;
    this.dailyPotionsSold = 0;
    this.dailyDeathsYourFault = 0;
    this.dailyBossesDefeated = 0;
    this.dailyUnprepared = 0;
    this.startOfDayReputation = this.reputation;
    // NOTE: spawnReductionActive is NOT reset here — it persists until
    // a survivor breaks the death streak (see recordSurvivor).
  }

  /** Current daily overhead, scaled by dungeon floor. Floors 11+ use reduced scaling. */
  getDailyOverhead(): number {
    if (this.currentFloor <= 10) {
      return Math.ceil(ECONOMY.DAILY_OVERHEAD + this.currentFloor * ECONOMY.OVERHEAD_PER_FLOOR);
    }
    // Floors 11+: full overhead for floors 1-10, then OVERHEAD_PER_FLOOR_HIGH per floor beyond 10
    const base = ECONOMY.DAILY_OVERHEAD + 10 * ECONOMY.OVERHEAD_PER_FLOOR;
    return Math.ceil(base + (this.currentFloor - 10) * ECONOMY.OVERHEAD_PER_FLOOR_HIGH);
  }

  /** Charge daily overhead. Deducts from gold and adds to dailyExpenses. */
  chargeDailyOverhead(): void {
    const overhead = this.getDailyOverhead();
    this.gold -= overhead;
    this.dailyExpenses += overhead;
  }

  /**
   * Get the spawn rate modifier based on current reputation.
   * High reputation attracts more customers; low reputation deters them.
   * Three zones with linear interpolation through the neutral zone to avoid discontinuities.
   */
  getSpawnRateModifier(): number {
    if (this.reputation >= REPUTATION.GOOD_THRESHOLD) {
      return REPUTATION.SPAWN_BONUS_HIGH;
    }
    if (this.reputation <= REPUTATION.STRUGGLING_THRESHOLD) {
      // Linear scale from STRUGGLING → MIN_REPUTATION
      const range = REPUTATION.STRUGGLING_THRESHOLD - ECONOMY.MIN_REPUTATION;
      const position = this.reputation - ECONOMY.MIN_REPUTATION;
      const t = range > 0 ? position / range : 0;
      return REPUTATION.SPAWN_RATE_MIN + t * (REPUTATION.SPAWN_RATE_STRUGGLING - REPUTATION.SPAWN_RATE_MIN);
    }
    // Neutral zone: linear ramp from STRUGGLING (0.85) to GOOD (1.15)
    const range = REPUTATION.GOOD_THRESHOLD - REPUTATION.STRUGGLING_THRESHOLD;
    const position = this.reputation - REPUTATION.STRUGGLING_THRESHOLD;
    const t = range > 0 ? position / range : 0;
    return REPUTATION.SPAWN_RATE_STRUGGLING + t * (REPUTATION.SPAWN_BONUS_HIGH - REPUTATION.SPAWN_RATE_STRUGGLING);
  }

  // =========================================================================
  // Dungeon progression
  // =========================================================================

  /**
   * Update dungeon floor based on current day.
   * Returns true if the floor changed (so caller can emit events).
   */
  updateFloor(day: number): boolean {
    const newFloor = Math.min(DUNGEON.MAX_FLOOR, 1 + Math.floor((day - 1) / DUNGEON.FLOOR_PROGRESSION_DAYS));

    if (newFloor > this.currentFloor) {
      this.currentFloor = newFloor;
      this.dungeonDifficulty = 1 + (this.currentFloor - 1) * DUNGEON.DIFFICULTY_PER_FLOOR;
      this.highestFloor = Math.max(this.highestFloor, this.currentFloor);
      return true;
    }
    return false;
  }

  // =========================================================================
  // Save / Load
  // =========================================================================

  /** Populate service state from a loaded GameState. */
  loadFromState(state: GameState): void {
    this.gold = state.gold;
    this.reputation = state.reputation;
    this.deathCount = state.adventurersKilled;
    this.savedCount = state.adventurersSaved;
    this.goldEarned = state.goldEarned;
    this.potionsSold = state.potionsSold || 0;
    this.deathsByPotion = state.deathsByPotion || 0;
    this.deathsByDilution = state.deathsByDilution || 0;
    this.perfectSaves = state.perfectSaves || 0;
    this.encountersSurvived = state.encountersSurvived || 0;
    this.bossesDefeated = state.bossesDefeated || 0;
    this.combosTriggered = state.combosTriggered || 0;
    this.guilt = state.guilt || 0;
    this.peakGuilt = state.peakGuilt || 0;
    this.maxDeathStreak = state.maxDeathStreak || 0;
    this.dilutedSold = state.dilutedSold || 0;

    // Restore dungeon floor based on day (deterministic formula)
    this.currentFloor = Math.min(DUNGEON.MAX_FLOOR, 1 + Math.floor((state.day - 1) / DUNGEON.FLOOR_PROGRESSION_DAYS));
    this.dungeonDifficulty = 1 + (this.currentFloor - 1) * DUNGEON.DIFFICULTY_PER_FLOOR;
    this.highestFloor = state.highestFloor ?? this.currentFloor;
  }

  /** Return economy-related fields for serialisation into GameState. */
  toSaveState(): Partial<GameState> {
    return {
      gold: this.gold,
      reputation: this.reputation,
      totalAdventurers: this.deathCount + this.savedCount,
      adventurersSaved: this.savedCount,
      adventurersKilled: this.deathCount,
      potionsSold: this.potionsSold,
      goldEarned: this.goldEarned,
      deathsByPotion: this.deathsByPotion,
      deathsByDilution: this.deathsByDilution,
      perfectSaves: this.perfectSaves,
      encountersSurvived: this.encountersSurvived,
      bossesDefeated: this.bossesDefeated,
      combosTriggered: this.combosTriggered,
      difficultyMultiplier: this.dungeonDifficulty,
      guilt: this.guilt,
      peakGuilt: this.peakGuilt,
      maxDeathStreak: this.maxDeathStreak,
      dilutedSold: this.dilutedSold,
      highestFloor: this.highestFloor,
    };
  }

  /** Reset all state to fresh-game defaults. */
  initializeDefaults(): void {
    this.gold = ECONOMY.STARTING_GOLD;
    this.reputation = ECONOMY.STARTING_REPUTATION;
    this.dailyProfit = 0;
    this.dailyExpenses = 0;
    this.dailyDeaths = 0;
    this.dailySaves = 0;
    this.dailyPotionsSold = 0;
    this.dailyDeathsYourFault = 0;
    this.dailyBossesDefeated = 0;
    this.dailyUnprepared = 0;
    this.startOfDayReputation = ECONOMY.STARTING_REPUTATION;
    this.deathCount = 0;
    this.savedCount = 0;
    this.deathStreak = 0;
    this.maxDeathStreak = 0;
    this.goldEarned = 0;
    this.potionsSold = 0;
    this.deathsByPotion = 0;
    this.deathsByDilution = 0;
    this.perfectSaves = 0;
    this.encountersSurvived = 0;
    this.bossesDefeated = 0;
    this.combosTriggered = 0;
    this.guilt = 0;
    this.peakGuilt = 0;
    this.dilutedSold = 0;
    this.spawnReductionActive = false;
    this.dungeonDifficulty = 1;
    this.currentFloor = 1;
    this.highestFloor = 1;
    this.demandState = {
      healingDemandSurge: false,
      strengthDemandBoost: false,
      luckDemandBoost: false,
      priceVariance: 1.0,
    };
  }
}
