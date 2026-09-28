import { inject, Injectable } from '@angular/core';
import { Adventurer, AdventurerClass, AdventurerStatus } from '../models/adventurer.model';
import { DungeonEvent } from '../models/game-state.model';
import { Potion, PotionEffects } from '../models/potion.model';
import {
  BOSS_ENCOUNTERS,
  CLASS_ABILITIES,
  DUNGEON,
  DungeonFloor,
  ENCOUNTER_POOL_BY_TYPE,
  ENCOUNTER_VARIANTS,
  EncounterDefinition,
  ENCOUNTERS,
  EncounterType,
  EncounterVariant,
  FLEE,
  FLOOR_ENCOUNTER_WEIGHTS,
  LOOT,
  PotionComboDefinition,
  POTIONS,
  SURVIVAL,
  VARIANT_ELIGIBILITY,
} from '../config/game-config';

/**
 * Map any incoming floor number to a valid encounter-table key. Closes
 * March RTG Finding 5: pre-fix `FLOOR_ENCOUNTER_WEIGHTS[floor]` could
 * silently return undefined for out-of-range keys (TypeScript's
 * Record<number, ...> indexing returns T, not T | undefined). The typed
 * return + clamp keeps the table always defined and the type-checker
 * honest if anyone removes the clamp later.
 *
 * Exported for direct test coverage — selectEncounter() is private so
 * this is the cheapest way to pin the contract.
 */
export function clampFloor(floor: number): DungeonFloor {
  if (Number.isNaN(floor)) return 1;
  if (floor <= 1) return 1;
  if (floor >= 15) return 15;
  return Math.floor(floor) as DungeonFloor;
}
import { GameRngService } from './game-rng.service';
import { PotionCraftingService } from './potion-crafting.service';
import { DEATH_MESSAGES } from '../config/narrative.config';

export interface DungeonLoot {
  gold: number;
}

export interface SimulationResult {
  event?: DungeonEvent;
  completed: boolean;
  survived?: boolean;
  fled?: boolean;
  loot?: DungeonLoot;
  encounterType?: EncounterType;
  comboName?: string;
  bossDefeated?: boolean;
  /** The survival chance value that was used to modify combat damage */
  survivalChanceUsed?: number;
}

/** Internal combat state tracking (not persisted) */
interface CombatState {
  healingApplied: boolean;
  /** Ticks since last damage was dealt (resets to 0 on each damage application) */
  ticksSinceLastDamage: number;
  criticalEventFired: boolean; // Fired at 50% HP
  desperateEventFired: boolean; // Fired at 25% HP
  startingHp: number; // HP when combat began
  encounter: EncounterDefinition; // Assigned encounter for this run
  trapDamageApplied: boolean; // Whether trap initial damage was dealt
  activeCombo: PotionComboDefinition | null; // Detected potion combo
  /** Luck loot multiplier for this run (from consumed luck potions) */
  luckMultiplier: number;
  /** Speed-based combat tick reduction for this run */
  speedReduction: number;
  // Looting phase
  /** Ticks spent in the looting phase (incremented each dungeon tick) */
  lootingTicks: number;
  lootAccumulated: number;
  /** Accumulated quality reduction from cursed encounters (0-0.30 max) */
  cursedQualityDrain: number;
  /** Active encounter variant (null if none rolled) */
  variant: EncounterVariant | null;
}

@Injectable()
export class DungeonSimulationService {
  private readonly rng = inject(GameRngService);
  private readonly potionCrafting = inject(PotionCraftingService);
  /** Track combat state per adventurer to avoid event spam */
  private combatStates = new Map<string, CombatState>();
  /** Monotonic counter for event IDs — avoids consuming RNG values for non-gameplay purposes */
  private eventIdCounter = 0;

  private readonly FLEE_MESSAGES = [
    'runs for the exit, barely escaping with their life!',
    'retreats from the dungeon, wounded but alive.',
    'flees the dungeon, vowing to return stronger.',
    'escapes by the skin of their teeth!',
    'makes a desperate dash for the entrance!',
  ] as const;

  private readonly LAST_WORDS = [
    'Tell my family I tried...',
    'The potion... it did not work...',
    'I trusted you...',
    'Why does it hurt so much?',
    'I should have stayed home...',
    'At least the pain will end...',
    'Worth it for the glory... right?',
  ] as const;

  simulateAdventurerTurn(adventurer: Adventurer, floor: number, difficulty: number): SimulationResult {
    // Initialize tick counter on first entry (backward compat: undefined → 0)
    if (adventurer.dungeonTickCount === undefined) {
      adventurer.dungeonTickCount = 0;
    }
    adventurer.dungeonTickCount++;
    const tickCount = adventurer.dungeonTickCount;

    // Guard: adventurer already at 0 HP but not yet marked Dead — handle death immediately
    if (adventurer.currentHp <= 0 && adventurer.status !== AdventurerStatus.Dead) {
      return this.handleDeath(adventurer);
    }

    // Phase 1: Exploring (ticks 1–EXPLORE_TICKS) - Safe traversal
    if (tickCount <= DUNGEON.EXPLORE_TICKS && adventurer.status !== AdventurerStatus.Exploring) {
      adventurer.status = AdventurerStatus.Exploring;
      return {
        event: this.createEvent(adventurer, 'combat', 'info', `${adventurer.name} explores deeper`),
        completed: false,
      };
    }

    // Phase 2: Combat begins (tick > EXPLORE_TICKS) - Initialize combat state and apply healing
    if (
      tickCount > DUNGEON.EXPLORE_TICKS &&
      adventurer.status !== AdventurerStatus.Fighting &&
      adventurer.status !== AdventurerStatus.Looting
    ) {
      adventurer.status = AdventurerStatus.Fighting;

      // Calculate luck modifier from consumed potions
      const luckModifier = adventurer.potionsConsumed.reduce(
        (sum, p) => sum + (p.statModifiers.luck ?? 0) * p.quality,
        0
      );

      // Ranger Nature's Bounty: extra -5% elite encounter weight shift
      const rangerEliteReduction = adventurer.class === AdventurerClass.Ranger ? 0.05 : 0;

      // Select encounter and detect combo (single source of truth: PotionCraftingService)
      const { encounter, variant } = this.selectEncounter(floor, luckModifier, rangerEliteReduction);
      const potionIds = adventurer.potionsConsumed.map((p) => p.potionId);
      const combo = this.potionCrafting.detectCombo(potionIds);

      // Calculate speed reduction from consumed potions (30% of speed stat as tick reduction)
      const speedBoost = adventurer.potionsConsumed.reduce(
        (sum, p) => sum + (p.statModifiers.speed ?? 0) * p.quality,
        0
      );
      const speedReduction = Math.floor(speedBoost * 0.3);

      // Calculate luck loot multiplier (+LUCK_LOOT_MULTIPLIER * normalized luck at base luckBoost=10)
      const luckMultiplier = Math.min(
        2.0,
        luckModifier > 0 ? 1.0 + (luckModifier / 10) * SURVIVAL.LUCK_LOOT_MULTIPLIER : 1.0
      );

      // Initialize combat state
      const combatState: CombatState = {
        healingApplied: false,
        ticksSinceLastDamage: 0,
        criticalEventFired: false,
        desperateEventFired: false,
        startingHp: adventurer.currentHp,
        encounter,
        trapDamageApplied: false,
        activeCombo: combo,
        luckMultiplier,
        speedReduction,
        lootingTicks: 0,
        lootAccumulated: 0,
        cursedQualityDrain: 0,
        variant,
      };
      this.combatStates.set(adventurer.id, combatState);

      // Handle trap encounter - immediate damage
      if (encounter.type === 'trap') {
        let trapDamage = Math.floor(adventurer.maxHp * ENCOUNTERS.TRAP_DAMAGE_FRACTION);

        // Class advantage reduces trap damage
        if (encounter.advantagedClasses.includes(adventurer.class)) {
          trapDamage = Math.floor(trapDamage * (1 - ENCOUNTERS.CLASS_ADVANTAGE_REDUCTION));
        }

        // Apply combo trap damage reduction
        if (combatState.activeCombo?.trapDamageReduction) {
          trapDamage = Math.floor(trapDamage * (1 - combatState.activeCombo.trapDamageReduction));
        }

        adventurer.currentHp = Math.max(0, adventurer.currentHp - trapDamage);
        combatState.trapDamageApplied = true;

        // Check for immediate death
        if (adventurer.currentHp <= 0) {
          return this.handleDeath(adventurer);
        }

        return {
          event: this.createEvent(
            adventurer,
            'combat',
            'danger',
            `${adventurer.name} triggers a ${encounter.name}! (-${trapDamage} HP)`
          ),
          completed: false,
          encounterType: encounter.type,
          comboName: combo?.name,
        };
      }

      // Non-trap encounter - show encounter description (include variant label if present)
      const variantLabel = variant ? `[${variant.label}] ` : '';
      return {
        event: this.createEvent(
          adventurer,
          'combat',
          encounter.type === 'boss' ? 'danger' : encounter.type === 'treasure' ? 'success' : 'warning',
          `${adventurer.name} encounters ${variantLabel}${encounter.name}: ${encounter.description}`
        ),
        completed: false,
        encounterType: encounter.type,
        comboName: combo?.name,
      };
    }

    // Phase 3: Active combat - Take damage, check thresholds
    if (adventurer.status === AdventurerStatus.Fighting) {
      const state = this.combatStates.get(adventurer.id);
      if (!state) return { completed: false };

      // Apply healing potion on first combat tick
      if (!state.healingApplied) {
        const healingEffect = this.applyHealingPotion(adventurer);
        if (healingEffect > 0) {
          state.healingApplied = true;
          return {
            event: this.createEvent(
              adventurer,
              'combat',
              'info',
              `${adventurer.name} drinks potion (+${healingEffect} HP)`
            ),
            completed: false,
            encounterType: state.encounter.type,
            comboName: state.activeCombo?.name,
          };
        }
        state.healingApplied = true;
      }

      // Cursed encounter: drain potion effectiveness per tick (flavor tracking)
      if (state.encounter.type === 'cursed') {
        state.cursedQualityDrain = Math.min(0.3, state.cursedQualityDrain + 0.01);
      }

      // Deal damage every DAMAGE_EVERY_N_TICKS dungeon ticks
      state.ticksSinceLastDamage++;
      if (state.ticksSinceLastDamage >= DUNGEON.DAMAGE_EVERY_N_TICKS) {
        state.ticksSinceLastDamage = 0;
        const damage = this.calculateDamage(
          adventurer,
          floor,
          difficulty,
          state.encounter,
          state.activeCombo,
          state.variant
        );
        adventurer.currentHp = Math.max(0, adventurer.currentHp - damage);

        // Barbarian Berserker Blood: 5% lifesteal from damage dealt
        if (adventurer.class === AdventurerClass.Barbarian && adventurer.currentHp > 0) {
          const lifesteal = Math.max(1, Math.floor(damage * 0.05));
          adventurer.currentHp = Math.min(adventurer.maxHp, adventurer.currentHp + lifesteal);
        }

        // Check for death
        if (adventurer.currentHp <= 0) {
          return this.handleDeath(adventurer);
        }

        // Check for flee attempt
        const fleeResult = this.checkFlee(adventurer, state);
        if (fleeResult) {
          return fleeResult;
        }

        // Check HP thresholds for dramatic events (only fire once each)
        const hpPercent = adventurer.currentHp / adventurer.maxHp;

        if (hpPercent <= DUNGEON.HP_DESPERATE_THRESHOLD && !state.desperateEventFired) {
          state.desperateEventFired = true;
          return {
            event: this.createEvent(
              adventurer,
              'combat',
              'danger',
              `${adventurer.name} is barely standing! (${adventurer.currentHp}/${adventurer.maxHp} HP)`
            ),
            completed: false,
            encounterType: state.encounter.type,
            comboName: state.activeCombo?.name,
          };
        }

        if (hpPercent <= DUNGEON.HP_CRITICAL_THRESHOLD && !state.criticalEventFired) {
          state.criticalEventFired = true;
          return {
            event: this.createEvent(
              adventurer,
              'combat',
              'warning',
              `${adventurer.name} is wounded! (${adventurer.currentHp}/${adventurer.maxHp} HP)`
            ),
            completed: false,
            encounterType: state.encounter.type,
            comboName: state.activeCombo?.name,
          };
        }
      }

      // Victory condition: survive VICTORY_TICKS + encounter extra ticks - speed reduction - combo tick reduction
      // Speed and combo tick reductions shorten combat duration (indirect survival benefit)
      const baseVictoryTicks = DUNGEON.VICTORY_TICKS + (state.encounter.extraCombatTicks ?? 0);
      const comboTickReduction = state.activeCombo?.combatTickReduction ?? 0;
      const effectiveVictoryTicks = Math.max(
        DUNGEON.EXPLORE_TICKS + 1, // At least 1 tick of actual combat
        baseVictoryTicks - state.speedReduction - comboTickReduction
      );
      if (tickCount >= effectiveVictoryTicks) {
        return this.handleVictory(adventurer, floor);
      }
    }

    // Phase 4: Looting — accumulate gold, risk lingering danger
    if (adventurer.status === AdventurerStatus.Looting) {
      const state = this.combatStates.get(adventurer.id);
      if (!state) return { completed: false };

      // Check for lingering danger
      if (this.rng.chance(LOOT.DANGER_CHANCE)) {
        const damage = Math.max(1, Math.floor(adventurer.currentHp * LOOT.DANGER_DAMAGE_FRACTION));
        adventurer.currentHp = Math.max(0, adventurer.currentHp - damage);

        if (adventurer.currentHp <= 0) {
          return this.handleLootingDeath(adventurer, state);
        }

        return {
          event: this.createEvent(
            adventurer,
            'combat',
            'danger',
            `${adventurer.name} triggers a hidden trap while looting! (-${damage} HP)`
          ),
          completed: false,
        };
      }

      // Accumulate loot each tick
      const tickGold = LOOT.GOLD_PER_TICK + floor * LOOT.GOLD_PER_FLOOR_PER_TICK;
      state.lootAccumulated += tickGold;

      // Looting complete after LOOT_TICKS ticks
      state.lootingTicks++;
      if (state.lootingTicks >= LOOT.LOOT_TICKS) {
        return this.completeLoot(adventurer, state, floor);
      }

      return { completed: false };
    }

    return { completed: false };
  }

  /** Select encounter based on floor and weights, optionally shifted by luck and Ranger elite reduction. Returns encounter and optional variant. */
  private selectEncounter(
    floor: number,
    luckModifier: number = 0,
    extraEliteReduction: number = 0
  ): { encounter: EncounterDefinition; variant: EncounterVariant | null } {
    let selectedEncounter: EncounterDefinition;

    // Check for boss floor
    if (ENCOUNTERS.BOSS_FLOORS.includes(floor)) {
      // 30% chance of boss encounter on boss floors
      if (this.rng.chance(0.3)) {
        const bossIndex = Math.min(ENCOUNTERS.BOSS_FLOORS.indexOf(floor), BOSS_ENCOUNTERS.length - 1);
        selectedEncounter = BOSS_ENCOUNTERS[bossIndex];
        return { encounter: selectedEncounter, variant: null }; // Boss encounters never get variants
      }
    }

    // Use floor weights (clamp floor to 1-15 via the typed clampFloor helper).
    // Typed lookup means the table is statically guaranteed to exist.
    const clampedFloor = clampFloor(floor);
    const baseWeights = FLOOR_ENCOUNTER_WEIGHTS[clampedFloor];

    // Apply luck encounter shift: more treasure, less elite (don't mutate shared table)
    // Also apply Ranger Nature's Bounty extra elite reduction
    let weightValues: number[];
    const types = Object.keys(baseWeights) as EncounterType[];
    if (luckModifier > 0 || extraEliteReduction > 0) {
      const shift = luckModifier > 0 ? SURVIVAL.LUCK_ENCOUNTER_SHIFT : 0;
      weightValues = types.map((t) => {
        if (t === 'treasure') return Math.max(0, baseWeights[t] + shift * 100);
        if (t === 'elite') return Math.max(0, baseWeights[t] - (shift + extraEliteReduction) * 100);
        return baseWeights[t];
      });
    } else {
      weightValues = types.map((t) => baseWeights[t]);
    }

    const selectedType = this.rng.weightedPick(types, weightValues);

    // If boss type selected but not from special boss check, use BOSS_ENCOUNTERS
    if (selectedType === 'boss') {
      selectedEncounter = this.rng.pick(BOSS_ENCOUNTERS);
      return { encounter: selectedEncounter, variant: null }; // Boss encounters never get variants
    }

    // Look up pre-grouped encounters by type (avoids O(n) filter on every combat entry)
    const matchingEncounters = ENCOUNTER_POOL_BY_TYPE[selectedType] ?? [];
    selectedEncounter = this.rng.pick(matchingEncounters);

    // Roll for variant (only one variant at a time, checked in order)
    let variant: EncounterVariant | null = null;
    for (const [key, v] of Object.entries(ENCOUNTER_VARIANTS)) {
      if (
        floor >= v.minFloor &&
        VARIANT_ELIGIBILITY[key]?.includes(selectedEncounter.type) &&
        this.rng.chance(v.spawnChance)
      ) {
        variant = v;
        break; // Only one variant at a time
      }
    }

    return { encounter: selectedEncounter, variant };
  }

  /** Apply healing potion effects, returns total HP restored */
  private applyHealingPotion(adventurer: Adventurer): number {
    let totalHealing = 0;

    for (const potion of adventurer.potionsConsumed) {
      const hpBoost = potion.statModifiers.hp ?? 0;
      if (hpBoost > 0) {
        // Quality affects effectiveness (diluted = 0.5 quality)
        const effectiveHealing = Math.floor(hpBoost * potion.quality);
        totalHealing += effectiveHealing;
      }
    }

    if (totalHealing > 0) {
      const oldHp = adventurer.currentHp;
      adventurer.currentHp = Math.min(adventurer.maxHp, adventurer.currentHp + totalHealing);
      return adventurer.currentHp - oldHp; // Return actual HP gained
    }

    return 0;
  }

  /** Calculate damage per tick based on floor, difficulty, encounter, combo, variant, and survival chance */
  private calculateDamage(
    adventurer: Adventurer,
    floor: number,
    difficulty: number,
    encounter: EncounterDefinition,
    combo: PotionComboDefinition | null,
    variant: EncounterVariant | null = null
  ): number {
    // Base damage scales with floor and difficulty. The maxHp-proportional
    // term (scaled by difficulty so it ramps with depth) keeps fights
    // proportional as adventurer HP balloons with level — without it, HP grows
    // O(day * difficulty) while flat damage grows O(floor), so deep-floor
    // adventurers are unkillable and the potion choice stops mattering.
    let baseDamage =
      DUNGEON.BASE_DAMAGE +
      floor * DUNGEON.DAMAGE_PER_FLOOR +
      difficulty * DUNGEON.DAMAGE_PER_DIFFICULTY +
      adventurer.maxHp * DUNGEON.DAMAGE_PER_MAXHP_FRACTION * difficulty;

    // Apply encounter damage multiplier
    baseDamage *= encounter.damageMultiplier;

    // Apply variant damage multiplier
    if (variant) {
      baseDamage *= variant.damageMult;
    }

    // Defense reduces damage (from stats + potions)
    let defenseBonus = adventurer.potionsConsumed.reduce(
      (sum, p) => sum + (p.statModifiers.defense ?? 0) * p.quality,
      0
    );

    // The Alchemist boss reduces potion effectiveness by half
    if (encounter.name === 'The Alchemist') {
      defenseBonus *= 0.5;
    }

    const totalDefense = adventurer.defense + defenseBonus;

    // Damage reduction: each point of defense reduces damage by ~2%
    const damageReduction = Math.min(DUNGEON.MAX_DEFENSE_REDUCTION, totalDefense * DUNGEON.DEFENSE_REDUCTION_PER_POINT);
    let finalDamage = baseDamage * (1 - damageReduction);

    // Survival chance mitigates damage — potions now mechanically matter
    // At 80% survival with the 0.8 factor: damage reduced by 64%
    const survivalModifier = Math.max(0, adventurer.survivalChance + (combo?.survivalBonus ?? 0));
    finalDamage *= 1 - survivalModifier * DUNGEON.SURVIVAL_DAMAGE_FACTOR;

    // Class advantage reduces damage
    if (encounter.advantagedClasses.includes(adventurer.class)) {
      finalDamage *= 1 - ENCOUNTERS.CLASS_ADVANTAGE_REDUCTION;
    }

    // Combo damage reduction
    if (combo) {
      finalDamage *= 1 - combo.damageReduction;
    }

    // Some randomness (+/- 20%)
    const variance =
      DUNGEON.DAMAGE_VARIANCE_MIN + this.rng.nextFloat() * (DUNGEON.DAMAGE_VARIANCE_MAX - DUNGEON.DAMAGE_VARIANCE_MIN);
    finalDamage *= variance;

    return Math.max(1, Math.floor(finalDamage));
  }

  /** Handle adventurer death */
  private handleDeath(adventurer: Adventurer): SimulationResult {
    const state = this.combatStates.get(adventurer.id);
    const encounterType = state?.encounter.type ?? 'normal';

    adventurer.status = AdventurerStatus.Dead;
    adventurer.currentHp = 0;
    adventurer.causeOfDeath = this.getRandomDeathMessage(encounterType);
    adventurer.exitTime = Date.now();
    this.combatStates.delete(adventurer.id);

    return {
      event: this.createEvent(adventurer, 'death', 'danger', `${adventurer.name} ${adventurer.causeOfDeath}`),
      completed: true,
      survived: false,
      encounterType,
      comboName: state?.activeCombo?.name,
      bossDefeated: false,
      survivalChanceUsed: adventurer.survivalChance,
    };
  }

  /** Handle adventurer victory — transition to looting phase */
  private handleVictory(adventurer: Adventurer, _floor: number): SimulationResult {
    const state = this.combatStates.get(adventurer.id);
    if (!state) {
      adventurer.status = AdventurerStatus.Victorious;
      adventurer.exitTime = Date.now();
      return { completed: true, survived: true, loot: { gold: 0 } };
    }

    adventurer.status = AdventurerStatus.Looting;
    state.lootingTicks = 0;
    state.lootAccumulated = 0;

    const encounter = state.encounter;
    const isBoss = encounter?.type === 'boss';
    const message = isBoss
      ? `${adventurer.name} defeats ${encounter?.name}! Looting the lair...`
      : `${adventurer.name} emerges victorious! Searching for treasure...`;

    return {
      event: this.createEvent(adventurer, 'victory', 'success', message),
      completed: false,
      survived: true,
      encounterType: encounter?.type ?? 'normal',
      comboName: state.activeCombo?.name,
      bossDefeated: isBoss,
      survivalChanceUsed: adventurer.survivalChance,
    };
  }

  /** Handle death during looting phase */
  private handleLootingDeath(adventurer: Adventurer, state: CombatState): SimulationResult {
    const encounterType = state.encounter.type;
    adventurer.status = AdventurerStatus.Dead;
    adventurer.currentHp = 0;
    adventurer.causeOfDeath = 'got greedy while looting and paid the price';
    adventurer.exitTime = Date.now();
    this.combatStates.delete(adventurer.id);

    return {
      event: this.createEvent(
        adventurer,
        'death',
        'danger',
        `${adventurer.name} died looting. The dungeon always collects its toll.`
      ),
      completed: true,
      survived: false,
      encounterType,
      comboName: state.activeCombo?.name,
      bossDefeated: encounterType === 'boss', // Boss was defeated before looting began
      survivalChanceUsed: adventurer.survivalChance,
    };
  }

  /** Complete looting phase — adventurer exits with accumulated gold */
  private completeLoot(adventurer: Adventurer, state: CombatState, floor: number): SimulationResult {
    const encounter = state.encounter;
    const combo = state.activeCombo ?? null;
    const isBoss = encounter?.type === 'boss';

    adventurer.status = AdventurerStatus.Victorious;
    adventurer.exitTime = Date.now();

    const baseLoot = this.generateLoot(floor, encounter, combo, state.luckMultiplier, state.variant);
    const totalGold = baseLoot.gold + state.lootAccumulated;

    this.combatStates.delete(adventurer.id);

    return {
      event: this.createEvent(
        adventurer,
        'victory',
        'success',
        `${adventurer.name} exits with ${totalGold}g in loot! (${adventurer.currentHp}/${adventurer.maxHp} HP)`
      ),
      completed: true,
      survived: true,
      loot: { gold: totalGold },
      encounterType: encounter?.type ?? 'normal',
      comboName: combo?.name,
      bossDefeated: isBoss,
      survivalChanceUsed: adventurer.survivalChance,
    };
  }

  private checkFlee(adventurer: Adventurer, state: CombatState): SimulationResult | null {
    if (FLEE.NO_FLEE_ENCOUNTERS.includes(state.encounter.type)) {
      return null;
    }

    const hpPercent = adventurer.currentHp / adventurer.maxHp;
    const fleeThreshold = FLEE.HP_THRESHOLDS[adventurer.class] ?? 0.2;

    if (hpPercent > fleeThreshold) {
      return null;
    }

    let fleeChance: number = FLEE.BASE_CHANCE;
    if (adventurer.desperate) {
      fleeChance += FLEE.DESPERATE_MODIFIER;
    }
    if (adventurer.experienced) {
      fleeChance += FLEE.EXPERIENCED_MODIFIER;
    }

    fleeChance = Math.max(0.02, Math.min(0.5, fleeChance));

    if (this.rng.chance(fleeChance)) {
      return this.handleFlee(adventurer, state);
    }

    return null;
  }

  private handleFlee(adventurer: Adventurer, state: CombatState): SimulationResult {
    adventurer.status = AdventurerStatus.Fleeing;
    adventurer.exitTime = Date.now();
    this.combatStates.delete(adventurer.id);

    const message = this.rng.pick(this.FLEE_MESSAGES);
    return {
      event: this.createEvent(adventurer, 'combat', 'warning', `${adventurer.name} ${message}`),
      completed: true,
      survived: true,
      fled: true,
      loot: { gold: 0 },
      encounterType: state.encounter.type,
      comboName: state.activeCombo?.name,
      bossDefeated: false,
      survivalChanceUsed: adventurer.survivalChance,
    };
  }

  /** Clean up combat state for an adventurer (call when removed from dungeon) */
  clearCombatState(adventurerId: string): void {
    this.combatStates.delete(adventurerId);
  }

  /**
   * Drop every cached combat state. Closes March RTG Finding 8 — the service
   * is currently component-scoped so combatStates dies with the instance,
   * but a single clearAll contract method pays for itself if scope ever
   * changes (root-scoping would otherwise leak entries forever). Called
   * from orchestrator cleanup paths.
   */
  clearAllCombatStates(): void {
    this.combatStates.clear();
  }

  /** Test-only: snapshot the current combat state count for spec assertions. */
  getCombatStateCount(): number {
    return this.combatStates.size;
  }

  /**
   * Calculate AND ASSIGN survival chance based on potion effects and upgrades.
   * The arithmetic lives in previewSurvivalChance so the shop can show the
   * exact same consequence before a sale without mutating the customer.
   */
  calculateSurvivalChance(
    adventurer: Adventurer,
    potion: Potion,
    potionUpgrades: Readonly<Record<string, number>>,
    upgradedEffects: PotionEffects
  ): number {
    const newChance = this.previewSurvivalChance(adventurer, potion, potionUpgrades, upgradedEffects);
    adventurer.survivalChance = newChance;
    return newChance;
  }

  /**
   * Pure survival projection used by the pre-sale loadout forecast.
   * It must stay side-effect free: hovering or rendering a potion card can
   * never improve an adventurer before money or stock changes hands.
   *
   * Survival Mechanics:
   * - Healing:  +min(cap, healing/HEALING_REFERENCE_HP * HEALING_EFFECTIVENESS) — most impactful effect
   *             Uses fixed reference HP so deep-floor high-HP adventurers get the same lift.
   * - Strength: +min(cap, strengthBoost * 1.5%) — offense helps survival
   * - Defense:  +min(cap, defenseBoost * 2%)   — defense slightly more efficient
   * - Diluted:  -35% flat penalty (intentionally severe)
   * - All modifiers scaled by potion.quality
   * - Final survival capped at the configured 5%-85% range
   *
   * @returns The projected survival chance without changing the adventurer
   */
  previewSurvivalChance(
    adventurer: Adventurer,
    potion: Potion,
    potionUpgrades: Readonly<Record<string, number>>,
    upgradedEffects: PotionEffects
  ): number {
    // Track each stat's contribution separately so class ability multipliers
    // apply only to the relevant stat, not the aggregate.
    let healingMod = 0;
    let strengthMod = 0;
    let defenseMod = 0;
    let speedMod = 0;
    let luckMod = 0;

    if (upgradedEffects.healing) {
      const tier = potionUpgrades['healing'] ?? 0;
      healingMod = Math.min(
        SURVIVAL.HEALING_CAPS[tier] ?? SURVIVAL.HEALING_CAPS[0],
        (upgradedEffects.healing / SURVIVAL.HEALING_REFERENCE_HP) * SURVIVAL.HEALING_EFFECTIVENESS
      );
    }

    if (upgradedEffects.strengthBoost) {
      const tier = potionUpgrades['strength'] ?? 0;
      strengthMod = Math.min(
        SURVIVAL.STRENGTH_CAPS[tier] ?? SURVIVAL.STRENGTH_CAPS[0],
        upgradedEffects.strengthBoost * SURVIVAL.STRENGTH_EFFECTIVENESS
      );
    }

    if (upgradedEffects.defenseBoost) {
      const tier = potionUpgrades['defense'] ?? 0;
      defenseMod = Math.min(
        SURVIVAL.DEFENSE_CAPS[tier] ?? SURVIVAL.DEFENSE_CAPS[0],
        upgradedEffects.defenseBoost * SURVIVAL.DEFENSE_EFFECTIVENESS
      );
    }

    if (upgradedEffects.speedBoost) {
      const tier = potionUpgrades['speed'] ?? 0;
      speedMod = Math.min(
        SURVIVAL.SPEED_CAPS[tier] ?? SURVIVAL.SPEED_CAPS[0],
        upgradedEffects.speedBoost * SURVIVAL.SPEED_EFFECTIVENESS
      );
    }

    if (upgradedEffects.luckBoost) {
      const tier = potionUpgrades['luck'] ?? 0;
      luckMod = Math.min(
        SURVIVAL.LUCK_CAPS[tier] ?? SURVIVAL.LUCK_CAPS[0],
        upgradedEffects.luckBoost * SURVIVAL.LUCK_EFFECTIVENESS
      );
    }

    // Apply class ability multiplier to the relevant stat contribution
    const ability = CLASS_ABILITIES[adventurer.class];
    if (ability && ability.affectedStat !== 'special') {
      switch (ability.affectedStat) {
        case 'healing':
          healingMod *= ability.multiplier;
          break;
        case 'strength':
          strengthMod *= ability.multiplier;
          break;
        case 'defense':
          defenseMod *= ability.multiplier;
          break;
        case 'speed':
          speedMod *= ability.multiplier;
          break;
        case 'luck':
          luckMod *= ability.multiplier;
          break;
      }
    }

    let modifier = healingMod + strengthMod + defenseMod + speedMod + luckMod;

    // Cleric Blessed Constitution: flat survival floor bonus when defense potion is active
    if (ability?.survivalBonus && defenseMod > 0) {
      modifier += ability.survivalBonus;
    }

    // Diluted potions have severe survival penalty
    if (potion.isDiluted) {
      modifier -= POTIONS.DILUTION_SURVIVAL_PENALTY;
    }

    modifier *= potion.quality;

    // Cap at the configured range — there's always danger in the dungeon
    const newChance = Math.min(
      POTIONS.MAX_SURVIVAL_CHANCE,
      Math.max(POTIONS.MIN_SURVIVAL_CHANCE, adventurer.survivalChance + modifier)
    );

    return newChance;
  }

  private createEvent(
    adventurer: Adventurer,
    eventType: DungeonEvent['eventType'],
    severity: DungeonEvent['severity'],
    message: string
  ): DungeonEvent {
    return {
      id: `event-${Date.now()}-${++this.eventIdCounter}`,
      timestamp: Date.now(),
      adventurerId: adventurer.id,
      eventType,
      message,
      severity,
    };
  }

  private getRandomDeathMessage(encounterType: EncounterType): string {
    const messages = DEATH_MESSAGES[encounterType] ?? DEATH_MESSAGES['normal'];
    return this.rng.pick(messages);
  }

  getRandomLastWords(): string {
    return this.rng.pick(this.LAST_WORDS);
  }

  private generateLoot(
    floor: number,
    encounter: EncounterDefinition | undefined,
    combo: PotionComboDefinition | null,
    luckMultiplier: number = 1.0,
    variant: EncounterVariant | null = null
  ): DungeonLoot {
    // Base gold calculation
    let gold = DUNGEON.BASE_LOOT_GOLD + floor * DUNGEON.LOOT_PER_FLOOR + this.rng.nextFloat() * DUNGEON.LOOT_RANDOM_MAX;

    // Add encounter bonus gold (capped to prevent economy explosion)
    if (encounter) {
      const safeBonusGold = Math.min(encounter.bonusGold, 200);
      gold += safeBonusGold;
    }

    // Apply variant gold multiplier before other multipliers
    if (variant) {
      gold *= variant.goldMult;
    }

    // Apply combo and luck loot multipliers, capped at 2.0x total to prevent economy explosion
    let totalLootMultiplier = combo?.lootMultiplier ?? 1.0;
    totalLootMultiplier *= luckMultiplier;
    totalLootMultiplier = Math.min(2.0, totalLootMultiplier);
    gold *= totalLootMultiplier;

    return {
      gold: Math.floor(gold),
    };
  }
}
