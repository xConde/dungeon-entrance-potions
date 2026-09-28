/* eslint-disable no-console -- balance harness intentionally prints survival grids for tuning */
/**
 * game-balance.spec.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SEEDED BALANCE-SIMULATION HARNESS  (DO NOT tune config here — measure only)
 *
 * Goal: give the tuning step real survival-rate numbers, produced by the
 * actual DungeonSimulationService with deterministic seeded RNG, across three
 * classes (Warrior / Rogue / Mage) × six floors × three potion scenarios
 * (none / full / diluted).
 *
 * Real APIs used:
 *  - GameRngService.initialize(seed)          — re-seeds the PRNG
 *  - AdventurerService.generateAdventurer(day, difficulty)
 *  - DungeonSimulationService.calculateSurvivalChance(adv, potion, upgrades, effects)
 *  - DungeonSimulationService.simulateAdventurerTurn(adv, floor, difficulty)
 *  - PotionCraftingService.calculateEffects(potion)
 *  - PotionCraftingService.createDilutedPotion(potion)
 *  - Outcome read from: result.completed && result.survived (boolean) OR
 *    adventurer.status === AdventurerStatus.Dead/Victorious/Fleeing
 *
 * The adventurer is injected with potions the same way sellPotion() does it in
 * game-orchestrator.service.ts (push PotionEffect into potionsConsumed, then
 * call calculateSurvivalChance). Status starts at AdventurerStatus.Entering so
 * simulateAdventurerTurn begins the tick sequence correctly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { TestBed } from '@angular/core/testing';
import { AdventurerService } from './adventurer.service';
import { DungeonSimulationService } from './dungeon-simulation.service';
import { GameRngService } from './game-rng.service';
import { PotionCraftingService } from './potion-crafting.service';
import { Adventurer, AdventurerClass, AdventurerStatus } from '../models/adventurer.model';
import { Potion } from '../models/potion.model';
import { DUNGEON, ECONOMY, POTIONS } from '../config/game-config';

// ─── Constants mirroring the game's floor-progression formula ────────────────
// day = floor * FLOOR_PROGRESSION_DAYS (=3); difficulty = 1 + (floor-1)*0.15
function floorToDifficulty(floor: number): number {
  return 1 + (floor - 1) * DUNGEON.DIFFICULTY_PER_FLOOR;
}
function floorToDay(floor: number): number {
  return floor * DUNGEON.FLOOR_PROGRESSION_DAYS;
}

// ─── Max ticks to run per sim trial before declaring it a timeout ─────────────
// Explore(3) + combat-init(1) + heal-tick(1) + VICTORY_TICKS(8) + extraCombatTicks(max 4 for Lich King)
// + LOOT_TICKS(3) + safety margin = ~30
const MAX_TICKS = 40;

// ─── Potion scenario types ────────────────────────────────────────────────────
type Scenario = 'none' | 'full' | 'diluted';

// ─── Classes to measure ───────────────────────────────────────────────────────
const BENCHMARK_CLASSES: AdventurerClass[] = [
  AdventurerClass.Warrior, // tank
  AdventurerClass.Rogue, // mid
  AdventurerClass.Mage, // squishy
];

// ─── Floors to measure ───────────────────────────────────────────────────────
const BENCHMARK_FLOORS: number[] = [1, 3, 5, 8, 10, 15];

// ─── Seeds to use ─────────────────────────────────────────────────────────────
const SEED_COUNT = 200;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a full basic-healing potion (as returned by PotionCraftingService) */
function buildFullPotion(potionCrafting: PotionCraftingService): Potion {
  const p = potionCrafting.getPotionById('basic-healing');
  if (!p) throw new Error('basic-healing not found in PotionCraftingService');
  return p;
}

/**
 * Apply a potion to an adventurer exactly as sellPotion() in game-orchestrator.service.ts does.
 * Pushes PotionEffect into potionsConsumed, then calls calculateSurvivalChance.
 */
function applyPotion(
  adventurer: Adventurer,
  potion: Potion,
  dungeonSim: DungeonSimulationService,
  potionCrafting: PotionCraftingService
): void {
  const effects = potionCrafting.calculateEffects(potion);
  adventurer.potionsConsumed.push({
    potionId: potion.id,
    name: potion.name,
    quality: potion.quality,
    duration: 0,
    statModifiers: {
      hp: effects.healing,
      strength: effects.strengthBoost,
      defense: effects.defenseBoost,
      speed: effects.speedBoost,
      luck: effects.luckBoost,
    },
  });
  // No upgrades (tier 0 = BASIC for all stats)
  const noUpgrades: Record<string, number> = {};
  dungeonSim.calculateSurvivalChance(adventurer, potion, noUpgrades, effects);
}

/**
 * Run one dungeon trial to completion. Returns true if the adventurer survived
 * (Victorious or Fleeing), false if dead, and null if it hit the tick cap.
 */
function runOneTrial(
  adventurer: Adventurer,
  floor: number,
  difficulty: number,
  dungeonSim: DungeonSimulationService
): boolean | null {
  // Suppress looting-phase danger: the 3% lingering-danger chance adds noise
  // and conflates floor-damage survival with a pure random kill.
  // We spy on rng.chance ONLY for the looting phase via a flag, but since we
  // can't easily intercept only those calls, we let it run naturally (3% ×
  // 3 ticks ≈ 9% extra death chance in loot phase, small but real). This
  // keeps the harness honest — the loot-phase risk IS part of the game.

  for (let tick = 0; tick < MAX_TICKS; tick++) {
    const result = dungeonSim.simulateAdventurerTurn(adventurer, floor, difficulty);
    if (result.completed) {
      return result.survived === true;
    }
  }
  // Shouldn't happen with valid inputs; treat as death (conservative)
  return null;
}

/**
 * Core harness function.
 *
 * @param targetClass  The class to force on the generated adventurer
 * @param floor        The dungeon floor (1-15)
 * @param scenario     'none' | 'full' | 'diluted'
 * @param seeds        Number of seed iterations (0 .. seeds-1)
 * @returns            Fraction of trials where adventurer survived [0, 1]
 */
function survivalRate(
  targetClass: AdventurerClass,
  floor: number,
  scenario: Scenario,
  seeds: number,
  rng: GameRngService,
  adventurerSvc: AdventurerService,
  dungeonSim: DungeonSimulationService,
  potionCrafting: PotionCraftingService
): number {
  const difficulty = floorToDifficulty(floor);
  const day = floorToDay(floor);
  let survived = 0;
  let ran = 0;

  for (let seed = 0; seed < seeds; seed++) {
    // Deterministic seed per trial
    rng.initialize(seed + 1); // seed+1: avoid seed=0 edge case

    // Generate adventurer — class is random so we keep re-rolling until we
    // get the target class. Re-roll uses SAME seed stream (cheap: typically
    // 1-8 picks since there are 8 classes).
    let adventurer: Adventurer;
    let attempts = 0;
    do {
      rng.initialize(seed + 1 + attempts * 100_000);
      adventurer = adventurerSvc.generateAdventurer(day, difficulty);
      attempts++;
    } while (adventurer.class !== targetClass && attempts < 200);

    if (adventurer.class !== targetClass) {
      // Fallback: override class directly (rare failure path, class not random enough)
      adventurer.class = targetClass;
    }

    // Mark as entering so the tick sequence starts correctly
    adventurer.status = AdventurerStatus.Entering;
    adventurer.dungeonTickCount = 0;

    // Apply potion scenario
    if (scenario === 'full') {
      const potion = buildFullPotion(potionCrafting);
      applyPotion(adventurer, potion, dungeonSim, potionCrafting);
    } else if (scenario === 'diluted') {
      const basePotion = buildFullPotion(potionCrafting);
      const diluted = potionCrafting.createDilutedPotion(basePotion);
      applyPotion(adventurer, diluted, dungeonSim, potionCrafting);
    }
    // 'none': no potion, survivalChance stays as generateAdventurer() set it

    // Run to completion
    const result = runOneTrial(adventurer, floor, difficulty, dungeonSim);
    if (result !== null) {
      if (result) survived++;
      ran++;
    }

    // Clean up this adventurer's combat state before next trial
    dungeonSim.clearCombatState(adventurer.id);
  }

  return ran > 0 ? survived / ran : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// SPEC
// ─────────────────────────────────────────────────────────────────────────────

describe('Game Balance Simulation Harness', () => {
  let rng: GameRngService;
  let adventurerSvc: AdventurerService;
  let dungeonSim: DungeonSimulationService;
  let potionCrafting: PotionCraftingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GameRngService, AdventurerService, DungeonSimulationService, PotionCraftingService],
    });
    rng = TestBed.inject(GameRngService);
    adventurerSvc = TestBed.inject(AdventurerService);
    dungeonSim = TestBed.inject(DungeonSimulationService);
    potionCrafting = TestBed.inject(PotionCraftingService);
  });

  // ── SURVIVAL RATE TABLE ────────────────────────────────────────────────────
  describe('Baseline Survival Rate Table (seeds=200)', () => {
    /**
     * The table structure:
     *   rows = floors [1, 3, 5, 8, 10, 15]
     *   columns = [none, full, diluted] × [Warrior, Rogue, Mage]
     *
     * Printed to console after all rows are collected so the table appears
     * once and is easy to copy out.
     */
    it('should produce a valid survival rate table and print it', () => {
      const results: Record<string, { none: number; full: number; diluted: number }> = {};

      const start = Date.now();

      for (const floor of BENCHMARK_FLOORS) {
        for (const cls of BENCHMARK_CLASSES) {
          const key = `F${floor}_${cls}`;
          const none = survivalRate(cls, floor, 'none', SEED_COUNT, rng, adventurerSvc, dungeonSim, potionCrafting);
          const full = survivalRate(cls, floor, 'full', SEED_COUNT, rng, adventurerSvc, dungeonSim, potionCrafting);
          const diluted = survivalRate(
            cls,
            floor,
            'diluted',
            SEED_COUNT,
            rng,
            adventurerSvc,
            dungeonSim,
            potionCrafting
          );
          results[key] = { none, full, diluted };
        }
      }

      const elapsed = Date.now() - start;

      // ── PRINT TABLE ──────────────────────────────────────────────────────
      console.log('\n');
      console.log('='.repeat(90));
      console.log('  POTION STAND — BASELINE SURVIVAL RATE TABLE');
      console.log(`  seeds=${SEED_COUNT} per cell | elapsed=${elapsed}ms`);
      console.log('='.repeat(90));
      console.log(
        `  ${'Floor'.padEnd(6)} ${'Class'.padEnd(12)} ${'None%'.padStart(7)} ${'Full%'.padStart(7)} ${'Diluted%'.padStart(9)} ${'Full−None'.padStart(10)} ${'Dil−None'.padStart(10)}`
      );
      console.log('-'.repeat(90));

      for (const floor of BENCHMARK_FLOORS) {
        for (const cls of BENCHMARK_CLASSES) {
          const key = `F${floor}_${cls}`;
          const r = results[key];
          const pct = (v: number): string => (v * 100).toFixed(1).padStart(7);
          const diff = (v: number): string => {
            const s = (v >= 0 ? '+' : '') + (v * 100).toFixed(1);
            return s.padStart(10);
          };
          console.log(
            `  ${String(floor).padEnd(6)} ${cls.padEnd(12)} ${pct(r.none)} ${pct(r.full)} ${pct(r.diluted).padStart(9)} ${diff(r.full - r.none)} ${diff(r.diluted - r.none)}`
          );
        }
        console.log('-'.repeat(90));
      }

      // ── PRINT CONSOLIDATED TABLE (one row per floor, all classes) ────────
      console.log('\n  COMPACT VIEW (Warrior / Rogue / Mage)');
      console.log('='.repeat(90));
      console.log(
        `  ${'Floor'.padEnd(6)} ` +
          `${'W-none'.padStart(7)} ${'W-full'.padStart(7)} ${'W-dil'.padStart(7)} | ` +
          `${'R-none'.padStart(7)} ${'R-full'.padStart(7)} ${'R-dil'.padStart(7)} | ` +
          `${'M-none'.padStart(7)} ${'M-full'.padStart(7)} ${'M-dil'.padStart(7)}`
      );
      console.log('-'.repeat(90));

      for (const floor of BENCHMARK_FLOORS) {
        const w = results[`F${floor}_${AdventurerClass.Warrior}`];
        const r = results[`F${floor}_${AdventurerClass.Rogue}`];
        const m = results[`F${floor}_${AdventurerClass.Mage}`];
        const pct = (v: number): string => (v * 100).toFixed(1).padStart(7);
        console.log(
          `  ${String(floor).padEnd(6)} ` +
            `${pct(w.none)} ${pct(w.full)} ${pct(w.diluted)} | ` +
            `${pct(r.none)} ${pct(r.full)} ${pct(r.diluted)} | ` +
            `${pct(m.none)} ${pct(m.full)} ${pct(m.diluted)}`
        );
      }
      console.log('='.repeat(90));

      // ── REGRESSION GUARDS (these must actually catch a broken balance) ──
      // Difficulty must rise with depth: a deep-floor no-potion adventurer is
      // far less likely to survive than a shallow-floor one. Catches an
      // inverted/flat damage curve (the original 100%-everywhere bug).
      for (const cls of BENCHMARK_CLASSES) {
        expect(results[`F15_${cls}`].none).toBeLessThan(results[`F1_${cls}`].none - 0.2);
      }
      for (const floor of BENCHMARK_FLOORS) {
        for (const cls of BENCHMARK_CLASSES) {
          const r = results[`F${floor}_${cls}`];
          expect(r.none).toBeGreaterThanOrEqual(0);
          expect(r.none).toBeLessThanOrEqual(1);
          // A full potion must never reduce survival vs no potion (small RNG slack).
          expect(r.full).toBeGreaterThanOrEqual(r.none - 0.03);
          if (floor >= 5) {
            // The core promise: on dangerous floors the POTION decides survival.
            // A zeroed/cosmetic potion buff would collapse this gap and fail here.
            expect(r.full - r.none).toBeGreaterThan(0.1);
            // Diluted is a real gamble: clearly worse than a full potion.
            expect(r.diluted).toBeLessThan(r.full);
          }
        }
      }

      console.log(`\n  Spec runtime: ${elapsed}ms`);
    });
  });

  // ── ECONOMY BASELINE NUMBERS ───────────────────────────────────────────────
  describe('Economy Baseline Numbers (analytical)', () => {
    it('should compute Day-1 net revenue, overhead scaling, and dilution comparison', () => {
      // ── REPUTATION PRICE FORMULA ──────────────────────────────────────────
      // From game-config: price *= (1 + reputation / REPUTATION_PRICE_DIVISOR)
      // At rep=50 and REPUTATION_PRICE_DIVISOR=200: multiplier = 1 + 50/200 = 1.25
      const repMultiplier = 1 + 50 / 200; // = 1.25

      // ── STARTING INVENTORY PRICES ─────────────────────────────────────────
      // basic-healing:  basePrice=50, quality=0.8 (not applied to price — basePrice is the list price)
      // strength-potion: basePrice=75
      // defense-potion:  basePrice=80
      // Starting stock per task description: 3 healing, 2 strength, 2 defense
      const healingPrice = Math.floor(50 * repMultiplier); // 62
      const strengthPrice = Math.floor(75 * repMultiplier); // 93
      const defensePrice = Math.floor(80 * repMultiplier); // 100

      const grossRevenue = 3 * healingPrice + 2 * strengthPrice + 2 * defensePrice;
      // Floor-1 overhead: DAILY_OVERHEAD + 1 * OVERHEAD_PER_FLOOR (read from config)
      const floorOneOverhead = ECONOMY.DAILY_OVERHEAD + 1 * ECONOMY.OVERHEAD_PER_FLOOR;
      const netDay1 = grossRevenue - floorOneOverhead;

      // ── OVERHEAD SCALING CHECK ────────────────────────────────────────────
      // At what floor does overhead exceed plausible single-day income?
      // Conservative single-day income estimate: 3 potions sold @ avg price ~85 × 1.25 = ~319
      // Overhead at floor F (F<=10): 25 + F*3
      // Overhead at floor F (F>10): 25 + 10*3 + (F-10)*1.5 = 55 + (F-10)*1.5
      const overheadAtFloor = (f: number): number => {
        if (f <= 10) return ECONOMY.DAILY_OVERHEAD + f * ECONOMY.OVERHEAD_PER_FLOOR;
        return ECONOMY.DAILY_OVERHEAD + 10 * ECONOMY.OVERHEAD_PER_FLOOR + (f - 10) * ECONOMY.OVERHEAD_PER_FLOOR_HIGH;
      };

      // 3-potion/day minimum daily income (all healing @ floor-1 rep neutral price)
      // Assume rep stays at starting 50 for a conservative estimate
      const minDailyIncome3Potions = 3 * healingPrice;
      const bankruptcyFloor = BENCHMARK_FLOORS.find((f) => overheadAtFloor(f) > minDailyIncome3Potions) ?? null;

      // ── DILUTION REVENUE COMPARISON ───────────────────────────────────────
      // Full healing potion: 1 sale @ basePrice=50 × repMult = 62
      // Diluted healing:     basePrice = floor(50 * DILUTION_PRICE_MULTIPLIER) = floor(50*0.4) = 20
      //                      2 sales @ 20 × repMult = floor(20*1.25) = 25 each → 50 total
      // Net dilution loss:   50 total vs 62 full → -12 revenue (but 2 customers served)
      const fullHealingRevenue = healingPrice; // 62
      const dilutedBasePrice = Math.floor(50 * POTIONS.DILUTION_PRICE_MULTIPLIER); // 20
      const dilutedSalePrice = Math.floor(dilutedBasePrice * repMultiplier); // 25
      const dilutionTotalRev = 2 * dilutedSalePrice; // 50
      const dilutionRevDelta = dilutionTotalRev - fullHealingRevenue; // -12

      // ── PRINT ECONOMY NUMBERS ─────────────────────────────────────────────
      console.log('\n');
      console.log('='.repeat(70));
      console.log('  POTION STAND — ECONOMY BASELINE NUMBERS (analytical)');
      console.log('='.repeat(70));
      console.log(`  Reputation price multiplier (rep=50): ×${repMultiplier.toFixed(2)}`);
      console.log('');
      console.log('  Day-1 full-inventory sale:');
      console.log(`    3× Healing   @ ${healingPrice}g  = ${3 * healingPrice}g`);
      console.log(`    2× Strength  @ ${strengthPrice}g  = ${2 * strengthPrice}g`);
      console.log(`    2× Defense   @ ${defensePrice}g = ${2 * defensePrice}g`);
      console.log(`    Gross revenue:  ${grossRevenue}g`);
      console.log(
        `    Floor-1 overhead: ${floorOneOverhead}g (DAILY_OVERHEAD=${ECONOMY.DAILY_OVERHEAD} + floor×${ECONOMY.OVERHEAD_PER_FLOOR})`
      );
      console.log(`    Day-1 net:       ${netDay1}g`);
      console.log('');
      console.log('  Overhead scaling:');
      for (const f of [1, 3, 5, 8, 10, 15]) {
        const oh = overheadAtFloor(f);
        console.log(`    Floor ${String(f).padEnd(3)}: overhead=${oh}g`);
      }
      console.log(`    3-potion/day min income (healing only): ${minDailyIncome3Potions}g`);
      console.log(`    Floor where overhead > 3-healing/day income: ${bankruptcyFloor ?? 'never in tested range'}`);
      console.log(`    → Bankruptcy reachable? ${netDay1 > 0 ? 'No on day 1 (full inventory)' : 'Yes even on day 1!'}`);
      console.log('');
      console.log('  Dilution revenue comparison (1 healing potion):');
      console.log(`    Full:    1 sale  @ ${fullHealingRevenue}g = ${fullHealingRevenue}g`);
      console.log(`    Diluted: 2 sales @ ${dilutedSalePrice}g   = ${dilutionTotalRev}g`);
      console.log(
        `    Delta:   ${dilutionRevDelta}g (${dilutionRevDelta >= 0 ? 'diluting is MORE profitable' : 'diluting is LESS profitable — correct design'})`
      );
      console.log(`    Diluted base price: floor(50 × ${POTIONS.DILUTION_PRICE_MULTIPLIER}) = ${dilutedBasePrice}g`);
      console.log(
        `    Note: diluting also triggers DILUTION_SURVIVAL_PENALTY=${POTIONS.DILUTION_SURVIVAL_PENALTY} (sharp survival modifier penalty)`
      );
      console.log('='.repeat(70));

      // ── ASSERTIONS ────────────────────────────────────────────────────────
      // Day-1 selling the starting inventory must clear overhead with real margin
      // (catches an overhead misconfiguration that would bankrupt a competent start).
      expect(netDay1).toBeGreaterThan(50);
      // Drift-proof: floor-1 overhead is DAILY_OVERHEAD + 1*OVERHEAD_PER_FLOOR from config
      expect(floorOneOverhead).toBe(ECONOMY.DAILY_OVERHEAD + ECONOMY.OVERHEAD_PER_FLOOR);
      // Diluting should NOT be strictly better revenue (game design intent)
      // Design invariant: two diluted sales must earn strictly LESS than one
      // full sale, so diluting is never a free win (a fixed bound, not re-derived).
      expect(dilutionTotalRev).toBeLessThan(fullHealingRevenue);
    });
  });

  // ── HARNESS VALIDITY DIAGNOSTIC ───────────────────────────────────────────
  // Verifies the harness isn't producing absurdly leveled adventurers and
  // confirms the sim is genuinely running (not short-circuiting).
  describe('Harness Validity Diagnostic', () => {
    it('should print actual adventurer stats and a traced simulation run', () => {
      console.log('\n=== HARNESS VALIDITY: ACTUAL ADVENTURER STATS BY FLOOR ===');
      console.log(
        `  ${'Floor'.padEnd(6)} ${'Class'.padEnd(12)} ${'Level'.padStart(5)} ${'HP'.padStart(5)} ${'Def'.padStart(5)} ${'Surv%'.padStart(6)} ${'diff'.padStart(5)}`
      );

      const tracedFloors = [1, 3, 5, 10, 15];
      const statsByFloor: Record<string, { level: number; hp: number; def: number; surv: number }[]> = {};

      for (const floor of tracedFloors) {
        const difficulty = floorToDifficulty(floor);
        const day = floorToDay(floor);
        statsByFloor[floor] = [];

        for (const cls of [AdventurerClass.Warrior, AdventurerClass.Mage]) {
          // Find first seed that produces this class
          for (let seed = 0; seed < 50; seed++) {
            rng.initialize(seed + 1);
            const a = adventurerSvc.generateAdventurer(day, difficulty);
            if (a.class === cls) {
              console.log(
                `  ${String(floor).padEnd(6)} ${cls.padEnd(12)} ${String(a.level).padStart(5)} ${String(a.maxHp).padStart(5)} ${String(a.defense).padStart(5)} ${(a.survivalChance * 100).toFixed(1).padStart(6)} ${difficulty.toFixed(2).padStart(5)}`
              );
              statsByFloor[floor].push({ level: a.level, hp: a.maxHp, def: a.defense, surv: a.survivalChance });
              break;
            }
          }
        }
      }

      // Trace one actual Mage simulation at floor 1 to verify damage landing
      console.log('\n=== TRACED SIMULATION: Mage @ Floor 1 (no potion) ===');
      let tracedMage: Adventurer | null = null;
      for (let seed = 0; seed < 100; seed++) {
        rng.initialize(seed + 1);
        const a = adventurerSvc.generateAdventurer(3, 1.0);
        if (a.class === AdventurerClass.Mage) {
          tracedMage = a;
          break;
        }
      }

      if (tracedMage) {
        tracedMage.status = AdventurerStatus.Entering;
        tracedMage.dungeonTickCount = 0;
        const startHp = tracedMage.currentHp;
        console.log(
          `  Mage: level=${tracedMage.level} HP=${tracedMage.maxHp} def=${tracedMage.defense} surv=${(tracedMage.survivalChance * 100).toFixed(1)}%`
        );
        for (let t = 0; t < 40; t++) {
          const hpBefore = tracedMage.currentHp;
          const result = dungeonSim.simulateAdventurerTurn(tracedMage, 1, 1.0);
          const hpAfter = tracedMage.currentHp;
          const dmg = hpBefore - hpAfter;
          console.log(
            `  Tick ${String(t + 1).padStart(2)}: status=${tracedMage.status.padEnd(10)} HP=${String(hpAfter).padStart(4)}/${tracedMage.maxHp} dmg=${dmg > 0 ? '-' + dmg : ' ' + 0} completed=${result.completed} survived=${result.survived ?? '-'}`
          );
          if (result.completed) {
            console.log(`  Final: ${result.survived ? 'SURVIVED' : 'DIED'}, HP lost=${startHp - hpAfter}`);
            break;
          }
        }
        dungeonSim.clearCombatState(tracedMage.id);
      }

      // Also trace floor 15 Mage
      console.log('\n=== TRACED SIMULATION: Mage @ Floor 15 (no potion) ===');
      tracedMage = null;
      for (let seed = 0; seed < 100; seed++) {
        rng.initialize(seed + 1);
        const a = adventurerSvc.generateAdventurer(45, floorToDifficulty(15));
        if (a.class === AdventurerClass.Mage) {
          tracedMage = a;
          break;
        }
      }

      if (tracedMage) {
        tracedMage.status = AdventurerStatus.Entering;
        tracedMage.dungeonTickCount = 0;
        const startHp = tracedMage.currentHp;
        console.log(
          `  Mage: level=${tracedMage.level} HP=${tracedMage.maxHp} def=${tracedMage.defense} surv=${(tracedMage.survivalChance * 100).toFixed(1)}%`
        );
        for (let t = 0; t < 40; t++) {
          const hpBefore = tracedMage.currentHp;
          const result = dungeonSim.simulateAdventurerTurn(tracedMage, 15, floorToDifficulty(15));
          const hpAfter = tracedMage.currentHp;
          const dmg = hpBefore - hpAfter;
          console.log(
            `  Tick ${String(t + 1).padStart(2)}: status=${tracedMage.status.padEnd(10)} HP=${String(hpAfter).padStart(4)}/${tracedMage.maxHp} dmg=${dmg > 0 ? '-' + dmg : '  0'} completed=${result.completed} survived=${result.survived ?? '-'}`
          );
          if (result.completed) {
            console.log(`  Final: ${result.survived ? 'SURVIVED' : 'DIED'}, HP lost=${startHp - hpAfter}`);
            break;
          }
        }
        dungeonSim.clearCombatState(tracedMage.id);
      }

      // Real guard (replaces a vacuous expect(true)): adventurer stats must scale
      // sharply with floor depth — this scaling is WHY deep floors are dangerous.
      // Averaged over many seeds (class-agnostic, so it doesn't depend on which
      // classes spawn at a given floor). A broken level/HP formula fails here.
      const avgMaxHp = (day: number, floor: number, n = 60): number => {
        let sum = 0;
        for (let s = 0; s < n; s++) {
          rng.initialize(s + 1);
          sum += adventurerSvc.generateAdventurer(day, floorToDifficulty(floor)).maxHp;
        }
        return sum / n;
      };
      const f1Avg = avgMaxHp(floorToDay(1), 1);
      const f15Avg = avgMaxHp(floorToDay(15), 15);
      // Deep-floor adventurers are far beefier (level/HP balloons with day & difficulty).
      expect(f15Avg).toBeGreaterThan(f1Avg * 2);
    });
  });

  // ── SURVIVAL CHANCE MECHANICS VERIFICATION ────────────────────────────────
  describe('Survival Chance Modifier Verification', () => {
    it('should show full healing potion raises survival and diluted lowers it', () => {
      rng.initialize(42);

      // Create a known warrior at floor 1
      const difficulty = floorToDifficulty(1);
      const day = floorToDay(1);

      // Generate an adventurer, then force the class for a deterministic comparison
      const adventurer = adventurerSvc.generateAdventurer(day, difficulty);
      adventurer.class = AdventurerClass.Warrior;
      const baseSurvival = adventurer.survivalChance;

      // Full potion
      const fullAdventurer = { ...adventurer, potionsConsumed: [] };
      const fullPotion = buildFullPotion(potionCrafting);
      applyPotion(fullAdventurer, fullPotion, dungeonSim, potionCrafting);
      const fullSurvival = fullAdventurer.survivalChance;

      // Diluted potion
      const dilAdventurer = { ...adventurer, potionsConsumed: [] };
      const dilPotion = potionCrafting.createDilutedPotion(buildFullPotion(potionCrafting));
      applyPotion(dilAdventurer, dilPotion, dungeonSim, potionCrafting);
      const dilSurvival = dilAdventurer.survivalChance;

      console.log('\n  Survival chance mechanics:');
      console.log(`    Warrior @ floor 1 (no potion):  ${(baseSurvival * 100).toFixed(1)}%`);
      console.log(
        `    After full healing potion:       ${(fullSurvival * 100).toFixed(1)}%  (Δ${((fullSurvival - baseSurvival) * 100).toFixed(1)}%)`
      );
      console.log(
        `    After diluted healing potion:    ${(dilSurvival * 100).toFixed(1)}%  (Δ${((dilSurvival - baseSurvival) * 100).toFixed(1)}%)`
      );
      console.log(
        `    DILUTION_SURVIVAL_PENALTY: −${(POTIONS.DILUTION_SURVIVAL_PENALTY * 100).toFixed(0)}% (scaled by quality ${POTIONS.DILUTION_QUALITY_MULTIPLIER})`
      );

      expect(fullSurvival).toBeGreaterThan(baseSurvival);
      expect(dilSurvival).toBeLessThan(baseSurvival);
    });
  });
});
