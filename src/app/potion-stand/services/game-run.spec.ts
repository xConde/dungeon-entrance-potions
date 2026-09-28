/**
 * game-run.spec.ts — Full-game winnability + tension regression guard.
 *
 * Drives a complete 30-day Potion Stand run synchronously (no real-time waits,
 * no RxJS timers) and asserts two opposite invariants:
 *
 *   1) GOOD PLAY (sell 2 real healing potions to every customer, restock as
 *      needed) MUST reach the 30-day victory: game-over reason 'success',
 *      final reputation >= 0, final gold > 0.  This is the WINNABILITY guard —
 *      if a balance change makes optimal play unwinnable, this fails.
 *
 *   2) BAD PLAY (sell only diluted potions — the cheapest, most harmful thing
 *      the game lets you do) MUST NOT reach a day-30 victory.  It must hit a
 *      game-over (reputation collapse or bankruptcy) before day 30, OR end with
 *      far worse stats (deaths >> saves and final reputation < 0).  This is the
 *      TENSION guard — it proves the moral-economic consequence is real:
 *      under-equipping adventurers gets you blacklisted.
 *
 * Both runs use the SAME deterministic seed for a fair comparison.
 *
 * APPROACH: We call the orchestrator's private tick handlers directly (via a
 * type-cast "private surface") so we bypass the 500ms interval and the
 * setTimeout-based purchase animation.  Two real-time mechanisms must be
 * bypassed for a faithful sync run:
 *   - sellPotion() arms a safeTimeout(800ms) to animate then sendToDungeon().
 *     In a sync sim that never fires, so we flush full-load customers to the
 *     dungeon directly (flushShopToDungeon).
 *   - Shop-queue timeouts use Date.now(), so customers never naturally time
 *     out.  We force-flush remaining customers at end of day.
 *
 * DO NOT commit.  DO NOT change game-config values or game logic — spec only.
 */

import { TestBed } from '@angular/core/testing';
import { GameOrchestratorService } from './game-orchestrator.service';
import { GameStateService } from './game-state.service';
import { GameLoopService } from './game-loop.service';
import { ShopService } from './shop.service';
import { AdventurerService } from './adventurer.service';
import { PotionCraftingService } from './potion-crafting.service';
import { DungeonSimulationService } from './dungeon-simulation.service';
import { GameRngService } from './game-rng.service';
import { GamePhaseService } from './game-phase.service';
import { GameEventBusService } from './game-event-bus.service';
import { EconomyService } from './economy.service';
import { AudioService } from './audio.service';
import { Adventurer, AdventurerStatus } from '../models/adventurer.model';
import { Potion } from '../models/potion.model';
import { ECONOMY, SHOP, TIMING } from '../config/game-config';

// ---------------------------------------------------------------------------
// Deterministic RNG seed — both runs use this for a fair comparison
// ---------------------------------------------------------------------------
const SEED = 42;

// ---------------------------------------------------------------------------
// Caps to prevent runaway loops
// ---------------------------------------------------------------------------
/** Max dungeon ticks per adventurer resolution pass */
const MAX_DUNGEON_TICKS_PER_PASS = 50;
/** Absolute max days before we declare the harness wedged */
const MAX_DAYS = 40;

// ---------------------------------------------------------------------------
// Strategy type
// ---------------------------------------------------------------------------
type Strategy = (orchestrator: GameOrchestratorService, shop: ShopService) => void;

// ---------------------------------------------------------------------------
// Private-method accessor helpers.
// Jasmine spec files can't directly call private methods, so we cast to a
// "private surface" type. This is intentional in a diagnostic harness.
// ---------------------------------------------------------------------------
interface OrchestratorPrivate {
  gameTick(): void;
  spawnAdventurer(): void;
  simulateDungeon(): void;
  startOfDay(): void;
  endOfDay(): void;
  processShopQueue(): void;
  processAutomaticCustomerBrowsing(): void;
  updateGuilt(): void;
  updateTimeOfDay(): void;
  sendToDungeon(adv: Adventurer): void;
}

function priv(o: GameOrchestratorService): OrchestratorPrivate {
  return o as unknown as OrchestratorPrivate;
}

// ---------------------------------------------------------------------------
// Run result
// ---------------------------------------------------------------------------
interface DaySnapshot {
  day: number;
  gold: number;
  reputation: number;
  guilt: number;
  savedCount: number; // lifetime
  deathCount: number; // lifetime
  deathStreak: number;
  phase: string;
}

interface RunResult {
  snapshots: DaySnapshot[];
  outcome: string;
  gameOverReason: string | null;
  reachedVictory: boolean;
  finalDay: number;
  finalReputation: number;
  finalGold: number;
  finalGuilt: number;
  totalSaves: number;
  totalDeaths: number;
}

// ---------------------------------------------------------------------------
// Animation-bypass flush: send customers stuck mid-animation to the dungeon.
//
// sellPotion() fires a safeTimeout(800ms) to animate, then sendToDungeon().
// In a sync sim that timeout never fires.  We push any customer who has a
// full potion load (MAX_POTIONS_PER_CUSTOMER) to the dungeon now.  Customers
// with 1 potion or 0 potions are also routed:
//   - 1 potion: send them in (they have something)
//   - 0 potions + desperate: send them in unequipped (the game does this)
//   - 0 potions + not desperate: they leave (handled by processShopQueue timeout)
// ---------------------------------------------------------------------------
function flushShopToDungeon(orchestrator: GameOrchestratorService, shop: ShopService): void {
  orchestrator.purchaseAnimation = null;
  orchestrator.comboSignal = null;

  const customers = [...shop.adventurersInShop];

  for (const customer of customers) {
    if (customer.status === AdventurerStatus.Dead) continue;
    if (orchestrator.adventurersInDungeon.some((a) => a.id === customer.id)) {
      shop.removeCustomer(customer);
      continue;
    }

    if (customer.potionsConsumed.length >= 1) {
      // Has at least one potion — send to dungeon.
      shop.removeCustomer(customer);
      priv(orchestrator).sendToDungeon(customer);
    } else if (customer.desperate) {
      // Desperate with no potion — enters unequipped (in-game behavior).
      shop.removeCustomer(customer);
      priv(orchestrator).sendToDungeon(customer);
    } else {
      // Non-desperate, no potion — leaves (rep timeout handled elsewhere).
      shop.removeCustomer(customer);
    }
  }
}

// ---------------------------------------------------------------------------
// Drain all active dungeon adventurers to terminal states.
// ---------------------------------------------------------------------------
function drainDungeon(orchestrator: GameOrchestratorService): void {
  let passes = 0;
  while (orchestrator.adventurersInDungeon.length > 0 && passes < MAX_DUNGEON_TICKS_PER_PASS) {
    priv(orchestrator).simulateDungeon();
    passes++;
  }
}

// ---------------------------------------------------------------------------
// Simulation runner
// ---------------------------------------------------------------------------
function runSimulation(
  orchestrator: GameOrchestratorService,
  shop: ShopService,
  rng: GameRngService,
  strategy: Strategy,
  label: string
): RunResult {
  const snapshots: DaySnapshot[] = [];
  let totalTicks = 0;

  rng.initialize(SEED);
  orchestrator.skipTutorial();
  priv(orchestrator).spawnAdventurer();
  strategy(orchestrator, shop);

  let done = false;
  let outcome = 'unknown';
  let reachedVictory = false;

  console.log(`=== ${label} (seed=${SEED}) ===`);

  while (!done && orchestrator.day <= MAX_DAYS && totalTicks < MAX_DAYS * TIMING.DAY_LENGTH_TICKS * 2) {
    const phase = orchestrator['gamePhaseService'].currentPhase();

    if (phase === 'game-over') {
      outcome = `game-over:${orchestrator.gameOverReason ?? 'unknown'}`;
      reachedVictory = orchestrator.gameOverReason === 'success';
      done = true;
      break;
    }
    if (phase !== 'playing') break;

    totalTicks++;

    // --- Player actions ---
    strategy(orchestrator, shop);

    // --- Process timed-out customers (desperate → dungeon path) ---
    priv(orchestrator).processShopQueue();
    strategy(orchestrator, shop);

    // --- Flush animation-stuck customers to dungeon ---
    flushShopToDungeon(orchestrator, shop);
    strategy(orchestrator, shop);

    // --- Guilt decay ---
    priv(orchestrator).updateGuilt();

    // --- Spawn tick every 12 game-ticks ---
    if (orchestrator.gameTime > 0 && orchestrator.gameTime % 12 === 0) {
      priv(orchestrator).spawnAdventurer();
      strategy(orchestrator, shop);
    }

    // --- Drain dungeon to completion ---
    drainDungeon(orchestrator);
    strategy(orchestrator, shop);

    // --- Advance time of day (fires endOfDay at tick 120) ---
    const dayBefore = orchestrator.day;
    priv(orchestrator).updateTimeOfDay();
    const dayAfter = orchestrator.day;

    if (dayAfter !== dayBefore) {
      // Day ended. Flush any leftover customers and drain once more.
      flushShopToDungeon(orchestrator, shop);
      drainDungeon(orchestrator);

      // NOTE: updateTimeOfDay() calls endOfDay() then startOfDay() (which calls
      // economy.resetDaily()). By the time we observe the rollover, the daily
      // counters are already zeroed — so we record the LIFETIME totals
      // (savedCount, deathCount) and compute per-day deltas for logging.
      const snap: DaySnapshot = {
        day: dayBefore,
        gold: orchestrator.economy.gold,
        reputation: orchestrator.economy.reputation,
        guilt: orchestrator.economy.guilt,
        savedCount: orchestrator.economy.savedCount,
        deathCount: orchestrator.economy.deathCount,
        deathStreak: orchestrator.economy.deathStreak,
        phase: orchestrator['gamePhaseService'].currentPhase(),
      };
      snapshots.push(snap);

      const prev = snapshots[snapshots.length - 2];
      const savesToday = snap.savedCount - (prev?.savedCount ?? 0);
      const deathsToday = snap.deathCount - (prev?.deathCount ?? 0);
      console.log(
        `[Day ${snap.day}] Gold=${snap.gold} Rep=${snap.reputation} Guilt=${snap.guilt.toFixed(1)} ` +
          `Saves=${savesToday} Deaths=${deathsToday} Streak=${snap.deathStreak} Phase=${snap.phase}`
      );

      const postPhase = orchestrator['gamePhaseService'].currentPhase();
      if (postPhase === 'game-over') {
        outcome = `game-over:${orchestrator.gameOverReason ?? 'unknown'}`;
        reachedVictory = orchestrator.gameOverReason === 'success';
        done = true;
        break;
      }

      // day-summary → merchant → playing
      if (postPhase === 'day-summary') {
        orchestrator.dismissDaySummary();
      }
      if (orchestrator['gamePhaseService'].currentPhase() === 'merchant') {
        buyHealingFromMerchant(orchestrator);
        orchestrator.openShop();
        priv(orchestrator).spawnAdventurer();
        strategy(orchestrator, shop);
      }
    }
  }

  if (!done) {
    outcome = `did-not-terminate (${totalTicks} ticks, day ${orchestrator.day})`;
  }

  const last = snapshots[snapshots.length - 1];
  return {
    snapshots,
    outcome,
    gameOverReason: orchestrator.gameOverReason,
    reachedVictory,
    finalDay: orchestrator.day,
    finalReputation: orchestrator.economy.reputation,
    finalGold: orchestrator.economy.gold,
    finalGuilt: orchestrator.economy.guilt,
    totalSaves: last?.savedCount ?? orchestrator.economy.savedCount,
    totalDeaths: last?.deathCount ?? orchestrator.economy.deathCount,
  };
}

function logResult(label: string, r: RunResult): void {
  console.log('');
  console.log(`=== ${label} COMPLETE ===`);
  console.log(`Outcome:          ${r.outcome}`);
  console.log(`Reached victory:  ${r.reachedVictory}`);
  console.log(`Final day:        ${r.finalDay}`);
  console.log(`Final reputation: ${r.finalReputation}`);
  console.log(`Final gold:       ${r.finalGold}`);
  console.log(`Final guilt:      ${r.finalGuilt.toFixed(1)}`);
  console.log(`Total saves:      ${r.totalSaves}`);
  console.log(`Total deaths:     ${r.totalDeaths}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

/** Find the real (non-diluted) basic-healing potion definition. */
function getHealingPotion(orchestrator: GameOrchestratorService): Potion | undefined {
  return orchestrator.availablePotions.find((p) => p.id === 'basic-healing' && !p.isDiluted);
}

/**
 * GOOD PLAY: sell up to MAX_POTIONS_PER_CUSTOMER real healing potions to every
 * customer who can afford one, restocking from merchant / emergency as needed.
 */
function goodPlayStrategy(orchestrator: GameOrchestratorService, shop: ShopService): void {
  const healing = getHealingPotion(orchestrator);
  if (!healing) return;

  for (const customer of [...shop.adventurersInShop]) {
    if (customer.status === AdventurerStatus.Dead) continue;
    // Sell until they hit the max potion load.
    while (customer.potionsConsumed.length < SHOP.MAX_POTIONS_PER_CUSTOMER) {
      ensureHealingStock(orchestrator);
      const stock = orchestrator.potionInventory.get('basic-healing') ?? 0;
      if (stock <= 0) break;
      const price = orchestrator.calculatePrice(healing, customer);
      if (customer.gold < price) break;
      const before = customer.potionsConsumed.length;
      orchestrator.sellPotion(healing, customer);
      orchestrator.purchaseAnimation = null;
      orchestrator.comboSignal = null;
      // Guard against an unexpected no-op sale (validation refusal) to avoid an
      // infinite loop.
      if (customer.potionsConsumed.length === before) break;
    }
  }
}

/**
 * BAD PLAY: dilute healing potions and sell ONLY diluted ones.  Diluted potions
 * carry a heavy survival penalty (DILUTION_SURVIVAL_PENALTY) and each dilution
 * adds guilt; diluted deaths cost the most reputation (DEATH_WITH_DILUTED).
 * This is the cheapest, most harmful real action the game allows.
 */
function dilutedOnlyStrategy(orchestrator: GameOrchestratorService, shop: ShopService): void {
  const healing = getHealingPotion(orchestrator);
  if (!healing) return;

  for (const customer of [...shop.adventurersInShop]) {
    if (customer.status === AdventurerStatus.Dead) continue;
    while (customer.potionsConsumed.length < SHOP.MAX_POTIONS_PER_CUSTOMER) {
      const diluted = ensureDilutedHealingStock(orchestrator);
      if (!diluted) break;
      const stock = orchestrator.potionInventory.get(diluted.id) ?? 0;
      if (stock <= 0) break;
      const price = orchestrator.calculatePrice(diluted, customer);
      if (customer.gold < price) break;
      const before = customer.potionsConsumed.length;
      orchestrator.sellPotion(diluted, customer);
      orchestrator.purchaseAnimation = null;
      orchestrator.comboSignal = null;
      // Experienced customers refuse diluted potions (validateSale). That is a
      // genuine in-game refusal — stop trying this customer so we don't loop.
      if (customer.potionsConsumed.length === before) break;
    }
  }
}

/** Ensure >= 1 real basic-healing in stock via merchant, then emergency restock. */
function ensureHealingStock(orchestrator: GameOrchestratorService): void {
  if ((orchestrator.potionInventory.get('basic-healing') ?? 0) > 0) return;

  const merchant = orchestrator['shop'].merchantInventory;
  if (merchant['basicHealing'].available > 0 && orchestrator.economy.gold >= merchant['basicHealing'].cost) {
    orchestrator.buyFromMerchant('basicHealing');
    return;
  }

  const emergencyCost = orchestrator.emergencyPrices.get('basic-healing') ?? 0;
  const healing = getHealingPotion(orchestrator);
  if (healing && emergencyCost > 0 && orchestrator.economy.gold >= emergencyCost) {
    orchestrator.emergencyRestock(healing);
  }
}

/**
 * Ensure >= 1 diluted-basic-healing in stock.  We must first obtain a real
 * healing potion, then dilute it (1 real → 2 diluted).  Returns the diluted
 * Potion definition (added to availablePotions by dilutePotion()).
 */
function ensureDilutedHealingStock(orchestrator: GameOrchestratorService): Potion | undefined {
  let diluted = orchestrator.availablePotions.find((p) => p.id === 'diluted-basic-healing');
  if (diluted && (orchestrator.potionInventory.get(diluted.id) ?? 0) > 0) {
    return diluted;
  }

  // Need a real healing potion to dilute.
  ensureHealingStock(orchestrator);
  const healing = getHealingPotion(orchestrator);
  if (!healing) return undefined;
  if ((orchestrator.potionInventory.get('basic-healing') ?? 0) <= 0) return undefined;

  orchestrator.dilutePotion(healing); // 1 real → 2 diluted, +DILUTION_GUILT
  diluted = orchestrator.availablePotions.find((p) => p.id === 'diluted-basic-healing');
  return diluted;
}

/** Restock real healing during the merchant phase (used by GOOD play). */
function buyHealingFromMerchant(orchestrator: GameOrchestratorService): void {
  const merchant = orchestrator['shop'].merchantInventory;
  while (merchant['basicHealing'].available > 0 && orchestrator.economy.gold >= merchant['basicHealing'].cost) {
    orchestrator.buyFromMerchant('basicHealing');
  }
}

// ---------------------------------------------------------------------------
// Spec suite
// ---------------------------------------------------------------------------

describe('Potion Stand — full-game winnability + tension regression guard', () => {
  let orchestrator: GameOrchestratorService;
  let shop: ShopService;
  let rng: GameRngService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        GameOrchestratorService,
        GameRngService,
        GameStateService,
        GameLoopService,
        GamePhaseService,
        ShopService,
        AdventurerService,
        PotionCraftingService,
        DungeonSimulationService,
        GameEventBusService,
        EconomyService,
        AudioService,
      ],
    });

    window.localStorage.clear();
    orchestrator = TestBed.inject(GameOrchestratorService);
    shop = TestBed.inject(ShopService);
    rng = TestBed.inject(GameRngService);
    orchestrator.initialize();
    orchestrator.skipTutorial();
  });

  afterEach(() => {
    orchestrator.cleanup();
    window.localStorage.clear();
  });

  // -------------------------------------------------------------------------
  // WINNABILITY GUARD — good play must win
  // -------------------------------------------------------------------------
  it('GOOD PLAY (2 healing potions per customer) reaches the 30-day victory', () => {
    const r = runSimulation(orchestrator, shop, rng, goodPlayStrategy, 'GOOD PLAY');
    logResult('GOOD PLAY', r);

    // Must end via the success game-over OR by surviving past the victory day.
    expect(r.reachedVictory).withContext(`outcome was "${r.outcome}"`).toBeTrue();
    expect(r.gameOverReason).toBe('success');
    expect(r.finalDay).toBeGreaterThan(ECONOMY.VICTORY_DAYS);

    // Victory implies solvency and standing: rep >= 0 and gold > 0.
    expect(r.finalReputation).toBeGreaterThanOrEqual(0);
    expect(r.finalGold).toBeGreaterThan(0);

    // Sanity: good play should keep most adventurers alive (saves dominate deaths).
    expect(r.totalSaves).toBeGreaterThan(r.totalDeaths);
  });

  // -------------------------------------------------------------------------
  // TENSION GUARD — bad play must not win
  // -------------------------------------------------------------------------
  it('BAD PLAY (diluted potions only) is blacklisted before the 30-day victory', () => {
    const r = runSimulation(orchestrator, shop, rng, dilutedOnlyStrategy, 'BAD PLAY');
    logResult('BAD PLAY', r);

    // The core invariant: bad play NEVER reaches victory.
    expect(r.reachedVictory).withContext(`outcome was "${r.outcome}"`).toBeFalse();
    expect(r.gameOverReason).not.toBe('success');

    // It must terminate in a losing game-over (reputation collapse or bankruptcy)
    // before the victory day — OR, if it somehow limps to day 30, it must be in
    // a clearly-losing state (negative reputation with deaths dominating saves).
    const lostBeforeVictory =
      (r.gameOverReason === 'reputation' || r.gameOverReason === 'bankruptcy') && r.finalDay <= ECONOMY.VICTORY_DAYS;
    const clearlyLosing = r.finalReputation < 0 && r.totalDeaths > r.totalSaves;
    expect(lostBeforeVictory || clearlyLosing)
      .withContext(
        `bad play should lose: reason=${r.gameOverReason} day=${r.finalDay} ` +
          `rep=${r.finalReputation} saves=${r.totalSaves} deaths=${r.totalDeaths}`
      )
      .toBeTrue();

    // Reputation must have fallen below where it started (50) — the moral cost is real.
    expect(r.finalReputation).toBeLessThan(ECONOMY.STARTING_REPUTATION);
  });

  // -------------------------------------------------------------------------
  // CONTRAST — good play strictly out-performs bad play on the same seed
  // -------------------------------------------------------------------------
  it('GOOD PLAY strictly out-performs BAD PLAY on the same seed', () => {
    const good = runSimulation(orchestrator, shop, rng, goodPlayStrategy, 'GOOD (contrast)');

    // Fresh state for the second run.
    orchestrator.cleanup();
    window.localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        GameOrchestratorService,
        GameRngService,
        GameStateService,
        GameLoopService,
        GamePhaseService,
        ShopService,
        AdventurerService,
        PotionCraftingService,
        DungeonSimulationService,
        GameEventBusService,
        EconomyService,
        AudioService,
      ],
    });
    const orch2 = TestBed.inject(GameOrchestratorService);
    const shop2 = TestBed.inject(ShopService);
    const rng2 = TestBed.inject(GameRngService);
    orch2.initialize();
    orch2.skipTutorial();
    const bad = runSimulation(orch2, shop2, rng2, dilutedOnlyStrategy, 'BAD (contrast)');
    orch2.cleanup();

    console.log(
      `Contrast: GOOD rep=${good.finalReputation} day=${good.finalDay} victory=${good.reachedVictory} | ` +
        `BAD rep=${bad.finalReputation} day=${bad.finalDay} victory=${bad.reachedVictory}`
    );

    // Good wins, bad does not.
    expect(good.reachedVictory).toBeTrue();
    expect(bad.reachedVictory).toBeFalse();
    // Good play ends with strictly higher reputation than bad play.
    expect(good.finalReputation).toBeGreaterThan(bad.finalReputation);
  });

  // -------------------------------------------------------------------------
  // FIDELITY SANITY — the dungeon actually resolves adventurers
  // (guards against a future change that silently breaks dungeon resolution,
  //  which would make BOTH the winnability and tension guards meaningless)
  // -------------------------------------------------------------------------
  it('dungeon resolves a fully-equipped adventurer to a terminal outcome', () => {
    const adventurerService = TestBed.inject(AdventurerService);
    const testAdv = adventurerService.generateAdventurer(1, 1.0);
    testAdv.gold = 9999;
    shop.addCustomer(testAdv);

    const healing = getHealingPotion(orchestrator)!;
    expect(healing).toBeTruthy();

    orchestrator.potionInventory.set('basic-healing', 10);
    orchestrator.sellPotion(healing, testAdv);
    orchestrator.purchaseAnimation = null;
    orchestrator.sellPotion(healing, testAdv);
    orchestrator.purchaseAnimation = null;
    orchestrator.comboSignal = null;

    expect(testAdv.potionsConsumed.length).toBe(SHOP.MAX_POTIONS_PER_CUSTOMER);

    shop.removeCustomer(testAdv);
    priv(orchestrator).sendToDungeon(testAdv);
    expect(orchestrator.adventurersInDungeon.length).toBe(1);

    const savedBefore = orchestrator.economy.savedCount;
    const deathBefore = orchestrator.economy.deathCount;
    drainDungeon(orchestrator);

    // The adventurer must have left the dungeon with exactly one terminal outcome.
    expect(orchestrator.adventurersInDungeon.length).toBe(0);
    const resolved = orchestrator.economy.savedCount - savedBefore + (orchestrator.economy.deathCount - deathBefore);
    expect(resolved).toBe(1);
    expect([AdventurerStatus.Victorious, AdventurerStatus.Dead]).toContain(testAdv.status);
  });
});
