import { DestroyRef, inject, Injectable } from '@angular/core';
import { AudioService } from './audio.service';
import { Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { CURRENT_SCHEMA_VERSION, GameStateService } from './game-state.service';
import { GameLoopService } from './game-loop.service';
import { ShopService } from './shop.service';
import { AdventurerService } from './adventurer.service';
import { PotionCraftingService } from './potion-crafting.service';
import { DungeonLoot, DungeonSimulationService } from './dungeon-simulation.service';
import { GameRngService } from './game-rng.service';
import { GamePhaseService } from './game-phase.service';
import { GameEventBusService } from './game-event-bus.service';
import { applyReputationDelta, EconomyService } from './economy.service';
import { Adventurer, AdventurerClass, AdventurerStatus, DeathNotification } from '../models/adventurer.model';
import { Potion, PotionEffects } from '../models/potion.model';
import { CustomerReview, DungeonEvent, SurvivorEntry } from '../models/game-state.model';
import { toGameError } from '../models/game-errors';
import {
  CloseDayPreview,
  DaySummaryData,
  GameOverReason,
  GameOverStats,
  MerchantPotionType,
  PotionForecast,
  PriceMode,
  PurchaseAnimation,
  ShellGameReward,
} from '../potion-stand.model';
import { PotionType, ShellGameComponent } from '../components/shell-game/shell-game.component';
import {
  COLLECTIONS,
  CUSTOMER_AI,
  DUNGEON,
  ECONOMY,
  EMERGENCY_RESTOCK,
  EVENTS,
  FLEE,
  GUILT,
  LOYALTY,
  MARKET,
  MERCHANT,
  POTIONS,
  PRICING,
  REPUTATION,
  SHOP,
  SURVIVAL as SURVIVAL_CONFIG,
  TIMING,
  UPGRADES,
} from '../config/game-config';
import { CUSTOMER_DIALOGUE, FEAR_DIALOGUE, REVIEW_TEMPLATES } from '../config/narrative.config';
import { environment } from 'environments/environment';

/**
 * GameOrchestratorService — owns all game state and orchestrates game logic.
 *
 * Extracted from PotionStandComponent to separate state/logic from the view layer.
 * Component-scoped: added to PotionStandComponent's providers[].
 *
 * Emits stateChanged$ after every mutation so the OnPush component can markForCheck().
 */
@Injectable()
export class GameOrchestratorService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly gameState = inject(GameStateService);
  private readonly gameLoop = inject(GameLoopService);
  private readonly shop = inject(ShopService);
  private readonly adventurerService = inject(AdventurerService);
  private readonly potionCrafting = inject(PotionCraftingService);
  private readonly dungeonSim = inject(DungeonSimulationService);
  private readonly rng = inject(GameRngService);
  private readonly gamePhaseService = inject(GamePhaseService);
  private readonly eventBus = inject(GameEventBusService);
  readonly economy = inject(EconomyService);
  private readonly audio = inject(AudioService);

  // ---------------------------------------------------------------------------
  // stateChanged$ — emitted after any state mutation affecting the template
  // ---------------------------------------------------------------------------
  readonly stateChanged$ = new Subject<void>();

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  day = 1;
  timeOfDay: 'Morning' | 'Afternoon' | 'Evening' | 'Night' = 'Morning';
  gameTime = 0;

  adventurersInDungeon: Adventurer[] = [];
  dungeonEvents: DungeonEvent[] = [];
  customerReviews: CustomerReview[] = [];
  potionInventory: Map<string, number> = new Map();
  availablePotions: Potion[] = [];
  potionUpgrades: Record<string, number> = {
    healing: 0,
    strength: 0,
    defense: 0,
    speed: 0,
    luck: 0,
  };
  readonly emergencyPrices = new Map<string, number>();

  survivorLedger: SurvivorEntry[] = [];

  // Monotonic counter for event IDs — prevents duplicate track keys when two
  // events fire in the same millisecond (routine at 2x/3x speed).
  private eventSeq = 0;

  stormActive = false;
  dragonActive = false;
  potionShortageActive = false;
  private lastEventDay = 0;
  eventHistory: string[] = [];
  private mysteriousCustomerUsed = false;

  currentEvent: { title: string; description: string; icon: string } | null = null;
  showDeathModal = false;
  recentDeath: DeathNotification | null = null;
  daySummaryData: DaySummaryData | null = null;
  gameOverReason: GameOverReason | null = null;
  purchaseAnimation: PurchaseAnimation | null = null;
  comboSignal: { name: string } | null = null;
  showFullNamesInLog = false;
  hasSeenDilutionRitual = false;
  currentMessage: { text: string; type: 'info' | 'success' | 'warning' | 'error' } | null = null;
  // `priceTrend` lets the template render a Phosphor SVG (trend-up /
  // trend-down / chart-line) instead of an emoji prefix on the message.
  marketTicker: { message: string; active: boolean; priceTrend: 'up' | 'down' | 'stable' | null } = {
    message: '',
    active: false,
    priceTrend: null,
  };

  // Tutorial state
  tutorialStep: number = 0; // 0 = not active, 1-4 = active steps
  tutorialComplete: boolean = false;
  private activePriceMode: PriceMode = 'fair';
  private openingCustomerSpawned = false;

  // Onboarding hints
  private hints = {
    welcomed: false,
    firstCustomer: false,
    firstSale: false,
    firstDungeon: false,
    lowStock: false,
  };

  // Config constants exposed to template
  readonly UPGRADE_COSTS = UPGRADES.COSTS;
  readonly TIER_NAMES = UPGRADES.TIER_NAMES;
  readonly TIER_MULTIPLIERS = UPGRADES.TIER_MULTIPLIERS;

  private readonly MAX_DUNGEON_EVENTS = COLLECTIONS.MAX_DUNGEON_EVENTS;
  private readonly MAX_CUSTOMER_REVIEWS = COLLECTIONS.MAX_CUSTOMER_REVIEWS;

  // Timeout management
  private destroyed = false;
  private readonly pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();
  private messageTimeout: ReturnType<typeof setTimeout> | null = null;
  private eventBannerTimeout: ReturnType<typeof setTimeout> | null = null;
  private deathModalTimeout: ReturnType<typeof setTimeout> | null = null;

  // Audio debounce
  private lastChimeTime = 0;

  // ---------------------------------------------------------------------------
  // Computed getters
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Cached computed properties — invalidated by notifyChange()
  // ---------------------------------------------------------------------------

  private _hasStockCached: boolean | null = null;
  private _canAffordPotionsCached: boolean | null = null;
  private _activeAdventurersInDungeonCached: Adventurer[] | null = null;

  private invalidateCache(): void {
    this._hasStockCached = null;
    this._canAffordPotionsCached = null;
    this._activeAdventurersInDungeonCached = null;
  }

  // ---------------------------------------------------------------------------
  // Potion forecast cache — getPotionForecasts() is read >=2x/sec via the
  // 500ms game tick (and on every change-detection pass off that), and each
  // entry recomputes previewSurvivalChance()/detectCombo() for every potion.
  // notifyChange()/invalidateCache() above fires on unrelated ticks (HP,
  // timers, etc.) too often to key off of, so this cache instead tracks the
  // small set of primitives that actually feed a forecast — deliberately NOT
  // wired to invalidateCache(). Returns the SAME Map reference when nothing
  // relevant changed, which also keeps PotionShopComponent's OnPush [forecasts]
  // binding stable.
  // ---------------------------------------------------------------------------
  private readonly EMPTY_FORECASTS: ReadonlyMap<string, PotionForecast> = new Map();
  private forecastCacheKey: string | null = null;
  private forecastCacheMap: ReadonlyMap<string, PotionForecast> | null = null;

  private buildForecastCacheKey(adventurer: Adventurer, priceMode: PriceMode): string {
    const lastConsumed = adventurer.potionsConsumed[adventurer.potionsConsumed.length - 1]?.potionId ?? '';
    return [
      adventurer.id,
      priceMode,
      this.economy.reputation,
      adventurer.survivalChance,
      adventurer.gold,
      adventurer.class,
      adventurer.potionsConsumed.length,
      lastConsumed,
      // availablePotions only grows (dilutePotion() pushes new diluted
      // variants); length alone is enough to detect a newly-diluted potion
      // that needs its own forecast entry.
      this.availablePotions.length,
      this.potionUpgrades['healing'] ?? 0,
      this.potionUpgrades['strength'] ?? 0,
      this.potionUpgrades['defense'] ?? 0,
      this.potionUpgrades['speed'] ?? 0,
      this.potionUpgrades['luck'] ?? 0,
    ].join('|');
  }

  get hasStock(): boolean {
    if (this._hasStockCached !== null) return this._hasStockCached;
    let total = 0;
    this.potionInventory.forEach((qty) => (total += qty));
    this._hasStockCached = total > 0;
    return this._hasStockCached;
  }

  get canAffordPotions(): boolean {
    if (this._canAffordPotionsCached !== null) return this._canAffordPotionsCached;
    const inv = this.shop.merchantInventory;
    const types: MerchantPotionType[] = ['basicHealing', 'strengthPotion', 'defensePotion', 'speedElixir', 'luckCharm'];
    this._canAffordPotionsCached = types.some((t) => inv[t].available > 0 && this.economy.gold >= inv[t].cost);
    return this._canAffordPotionsCached;
  }

  get activeAdventurersInDungeon(): Adventurer[] {
    if (this._activeAdventurersInDungeonCached !== null) return this._activeAdventurersInDungeonCached;
    const seen = new Set<string>();
    this._activeAdventurersInDungeonCached = this.adventurersInDungeon.filter((adv) => {
      if (seen.has(adv.id) || adv.status === AdventurerStatus.Dead) {
        return false;
      }
      seen.add(adv.id);
      return true;
    });
    return this._activeAdventurersInDungeonCached;
  }

  get DAILY_OVERHEAD(): number {
    return this.economy.getDailyOverhead();
  }

  get RESTOCK_COST(): number {
    return ECONOMY.RESTOCK_COST;
  }

  get gameOverStats(): GameOverStats {
    return {
      day: this.day,
      savedCount: this.economy.savedCount,
      deathCount: this.economy.deathCount,
      reputation: this.economy.reputation,
      gold: this.economy.gold,
      goldEarned: this.economy.goldEarned,
      potionsSold: this.economy.potionsSold,
      perfectSaves: this.economy.perfectSaves,
      bossesDefeated: this.economy.bossesDefeated,
      combosTriggered: this.economy.combosTriggered,
      maxDeathStreak: this.economy.maxDeathStreak,
      dilutedSold: this.economy.dilutedSold,
      guiltLevel: this.economy.getGuiltLevel(),
    };
  }

  getRecommendedPotionId(priceMode: PriceMode = 'fair'): string | null {
    if (!this.shop.selectedAdventurer) return null;
    const recommended = this.getRecommendedPotion(this.shop.selectedAdventurer, priceMode);
    return recommended?.id ?? null;
  }

  getMerchantTotalCost(): number {
    return this.shop.getMerchantTotalCost();
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  /**
   * Main entry point — loads game state, starts event bus subscriptions, starts game loop.
   * Called from PotionStandComponent.ngOnInit().
   */
  initialize(): void {
    this.audio.loadPrefs();
    this.initEventBusSubscriptions();
    this.initializeGame();
    this.loadAvailablePotions();
    this.updateEmergencyPrices();
    this.resetMerchantInventory();
    this.startGameLoop();
    if (this.day === 1) {
      this.startTutorial();
    }
  }

  // ---------------------------------------------------------------------------
  // Tutorial
  // ---------------------------------------------------------------------------

  startTutorial(): void {
    let seen: string | null = null;
    try {
      seen = window.localStorage.getItem('potion-stand-tutorial-seen');
    } catch {
      /* storage unavailable — fall through */
    }
    if (seen === 'true') {
      this.tutorialComplete = true;
      return;
    }
    this.tutorialStep = 1;
    this.gameLoop.setPaused(true);
    this.notifyChange();
  }

  advanceTutorial(): void {
    if (this.tutorialStep >= 4) {
      this.completeTutorial();
      return;
    }
    this.tutorialStep++;
    this.notifyChange();
  }

  skipTutorial(): void {
    this.completeTutorial();
  }

  private completeTutorial(): void {
    this.tutorialStep = 0;
    this.tutorialComplete = true;
    try {
      window.localStorage.setItem('potion-stand-tutorial-seen', 'true');
    } catch {
      /* storage unavailable — fall through */
    }
    this.gameLoop.setPaused(false);
    this.notifyChange();
  }

  replayTutorial(): void {
    this.tutorialComplete = false;
    this.tutorialStep = 1;
    this.gameLoop.setPaused(true);
    this.notifyChange();
  }

  private initEventBusSubscriptions(): void {
    // Dungeon events → populate dungeonEvents[] array
    this.eventBus
      .on('dungeon')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        this.dungeonEvents.unshift(event.payload);

        if (this.dungeonEvents.length > COLLECTIONS.DUNGEON_EVENT_DISPLAY_LIMIT) {
          this.dungeonEvents.pop();
        }
        this.notifyChange();
      });

    // System messages → drive currentMessage display with auto-hide
    this.eventBus
      .on('system')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event.payload.action === 'message') {
          if (this.messageTimeout) {
            clearTimeout(this.messageTimeout);
          }

          this.currentMessage = {
            text: event.payload.message,
            type: event.payload.severity ?? 'info',
          };
          this.notifyChange();

          this.messageTimeout = setTimeout(() => {
            this.currentMessage = null;
            this.notifyChange();
          }, TIMING.MESSAGE_AUTO_HIDE_MS);
        }
      });

    // Red Team fix (2026-08-17): a message fired in one phase must not
    // survive into the next phase's toast. `currentMessage` used to persist
    // across phase transitions unnoticed because the single page-level
    // `.message-bar` toast was phase-agnostic and just kept rendering the
    // same DOM node with no reflow and no restart. Since the playing-phase
    // toast moved in-flow into PotionShopComponent (see that component's
    // `toastMessage` Input doc comment), the merchant to playing transition
    // recreates the component from scratch on the `@if/@else` swap, and an
    // unmodified `currentMessage` gets handed straight to it as the initial
    // Input value. That is how a merchant-phase warning like "Need 390g to
    // buy everything!" reappears, freshly re-animated, over the dungeon
    // counter where "buy everything" isn't even an available action.
    // Clearing here on every transition (not just merchant to playing) keeps
    // this correct for day-summary to merchant and playing to day-summary
    // too, without special-casing individual transition call sites.
    this.gamePhaseService.onPhaseChange$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.messageTimeout) {
        clearTimeout(this.messageTimeout);
        this.messageTimeout = null;
      }
      if (this.currentMessage) {
        this.currentMessage = null;
        this.notifyChange();
      }
    });
  }

  private initializeGame(): void {
    const loadResult = this.gameState.loadGameState();

    if (!loadResult.success) {
      this.rng.initialize();
      this.showMessage(`The old ledger wouldn't open: ${loadResult.error}. Starting a fresh day.`, 'error');
      this.initializeStartingInventory();
    } else if (loadResult.data) {
      if (typeof loadResult.data.rngSeed === 'number') {
        this.rng.restoreState(loadResult.data.rngSeed);
      } else {
        this.rng.initialize();
      }

      this.economy.loadFromState(loadResult.data);
      this.day = loadResult.data.day;
      const loadedUpgrades = loadResult.data.potionUpgrades || {};
      this.potionUpgrades = {
        healing: loadedUpgrades['healing'] ?? 0,
        strength: loadedUpgrades['strength'] ?? 0,
        defense: loadedUpgrades['defense'] ?? 0,
        speed: loadedUpgrades['speed'] ?? 0,
        luck: loadedUpgrades['luck'] ?? 0,
      };

      if (Array.isArray(loadResult.data.discoveredCombos)) {
        this.potionCrafting.loadDiscoveredCombos(loadResult.data.discoveredCombos);
      }

      this.stormActive = loadResult.data.stormActive ?? false;
      this.dragonActive = loadResult.data.dragonActive ?? false;
      this.potionShortageActive = loadResult.data.potionShortageActive ?? false;
      this.lastEventDay = loadResult.data.lastEventDay ?? 0;
      this.showFullNamesInLog = loadResult.data.showFullNamesInLog ?? false;
      this.hasSeenDilutionRitual = loadResult.data.hasSeenDilutionRitual ?? false;

      if (Array.isArray(loadResult.data.survivorLedger)) {
        this.survivorLedger = loadResult.data.survivorLedger;
      }

      if (Array.isArray(loadResult.data.eventHistory)) {
        this.eventHistory = loadResult.data.eventHistory;
      }

      if (typeof loadResult.data.gameTime === 'number') {
        this.gameTime = loadResult.data.gameTime;
        if (this.gameTime >= TIMING.EVENING_END) {
          this.timeOfDay = 'Night';
        } else if (this.gameTime >= TIMING.AFTERNOON_END) {
          this.timeOfDay = 'Evening';
        } else if (this.gameTime >= TIMING.MORNING_END) {
          this.timeOfDay = 'Afternoon';
        } else {
          this.timeOfDay = 'Morning';
        }
      }

      if (loadResult.data.potionInventory && Object.keys(loadResult.data.potionInventory).length > 0) {
        this.potionInventory.clear();
        for (const [potionId, quantity] of Object.entries(loadResult.data.potionInventory)) {
          this.potionInventory.set(potionId, quantity);
        }
      } else {
        this.initializeStartingInventory();
      }
    } else {
      this.rng.initialize();
      this.initializeStartingInventory();
    }

    this.safeTimeout(() => this.spawnAdventurer(), TIMING.SPAWN_DELAY_MS);
  }

  private initializeStartingInventory(): void {
    this.potionInventory.set('basic-healing', 3);
    this.potionInventory.set('strength-potion', 2);
    this.potionInventory.set('defense-potion', 2);
  }

  private loadAvailablePotions(): void {
    this.availablePotions = this.potionCrafting.getAllPotions();
  }

  private updateEmergencyPrices(): void {
    const multiplier = EMERGENCY_RESTOCK.PRICE_MULTIPLIER;
    const units = EMERGENCY_RESTOCK.UNITS_PER_RESTOCK;
    const shortageMul = this.potionShortageActive ? EVENTS.SHORTAGE_PRICE_MULTIPLIER : 1;
    const priceVariance = this.economy.demandState.priceVariance;
    this.emergencyPrices.set(
      'basic-healing',
      Math.ceil(MERCHANT.HEALING_COST * multiplier * units * shortageMul * priceVariance)
    );
    this.emergencyPrices.set(
      'strength-potion',
      Math.ceil(MERCHANT.STRENGTH_COST * multiplier * units * shortageMul * priceVariance)
    );
    this.emergencyPrices.set(
      'defense-potion',
      Math.ceil(MERCHANT.DEFENSE_COST * multiplier * units * shortageMul * priceVariance)
    );
    this.emergencyPrices.set(
      'speed-elixir',
      Math.ceil(MERCHANT.SPEED_COST * multiplier * units * shortageMul * priceVariance)
    );
    this.emergencyPrices.set(
      'luck-charm',
      Math.ceil(MERCHANT.LUCK_COST * multiplier * units * shortageMul * priceVariance)
    );
  }

  private resetMerchantInventory(): void {
    this.shop.resetMerchantInventory(this.day, this.economy.demandState.priceVariance);
  }

  // ---------------------------------------------------------------------------
  // Game loop
  // ---------------------------------------------------------------------------

  private startGameLoop(): void {
    this.gameLoop.gameTick$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.gamePhaseService.currentPhase() === 'playing') {
        this.gameTick();
        this.notifyChange();
      }
    });

    this.gameLoop.spawnTick$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.gamePhaseService.currentPhase() === 'playing') {
        this.spawnAdventurer();
        this.notifyChange();
      }
    });

    this.gameLoop.dungeonTick$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.gamePhaseService.currentPhase() === 'playing') {
        this.simulateDungeon();
        this.notifyChange();
      }
    });

    this.gameLoop.start();
  }

  private gameTick(): void {
    try {
      this.processShopQueue();
      this.autoSelectCustomer();
      this.processAutomaticCustomerBrowsing();
      this.updateGuilt();
      this.updateTimeOfDay();
      this.cleanupCollections();
    } catch (err) {
      const gameError = toGameError(err, 'general');
      if (!environment.production) {
        console.error(
          `[GameOrchestrator] Game tick error [${gameError.category}]:`,
          gameError.message,
          gameError.context
        );
      }
      this.showMessage('Game encountered an error. Last save preserved.', 'warning');
    }
  }

  private cleanupCollections(): void {
    if (this.dungeonEvents.length > this.MAX_DUNGEON_EVENTS) {
      this.dungeonEvents = this.dungeonEvents.slice(0, this.MAX_DUNGEON_EVENTS);
    }

    if (this.customerReviews.length > this.MAX_CUSTOMER_REVIEWS) {
      this.customerReviews = this.customerReviews.slice(0, this.MAX_CUSTOMER_REVIEWS);
    }
  }

  private updateTimeOfDay(): void {
    this.gameTime++;

    if (this.gameTime >= TIMING.DAY_LENGTH_TICKS) {
      this.endOfDay();
      this.gameTime = 0;
      this.day++;
      this.timeOfDay = 'Morning';
      this.startOfDay();
    } else if (this.gameTime >= TIMING.EVENING_END) {
      this.timeOfDay = 'Night';
    } else if (this.gameTime >= TIMING.AFTERNOON_END) {
      this.timeOfDay = 'Evening';
    } else if (this.gameTime >= TIMING.MORNING_END) {
      this.timeOfDay = 'Afternoon';
    }
  }

  private startOfDay(): void {
    // Calculate demand shifts from previous day's performance BEFORE resetting daily stats
    this.economy.calculateDemandShifts(this.rng);

    this.economy.resetDaily();

    this.stormActive = false;
    this.dragonActive = false;
    this.potionShortageActive = false;

    // Update emergency prices to reflect new day's price variance (shortage already cleared above)
    this.updateEmergencyPrices();

    this.generateMarketTicker();

    const now = Date.now();
    this.shop.adventurersInShop.forEach((adv) => {
      adv.enterTime = now;
    });

    if (this.economy.guilt >= GUILT.MEDIUM_THRESHOLD) {
      const nightmareMessage = this.rng.pick(GUILT.NIGHTMARE_MESSAGES);
      this.eventBus.emit('system', {
        action: 'message',
        message: nightmareMessage,
        severity: 'warning',
      });
      this.addDungeonEvent({
        id: this.nextEventId('nightmare'),
        timestamp: Date.now(),
        adventurerId: '',
        eventType: 'enter',
        message: nightmareMessage,
        severity: 'warning',
      });
    }

    this.updateDungeonFloor();
    this.triggerRandomEvent();
  }

  private generateMarketTicker(): void {
    const demand = this.economy.demandState;
    const messages: string[] = [];

    // Plain text — no emoji — so the ticker reads cleanly across themes
    // and doesn't depend on emoji font support / colour-emoji rendering.
    // Trend direction is carried as `priceTrend` so the template can render
    // a Phosphor SVG (trend-up / trend-down / chart-line) instead.
    if (demand.healingDemandSurge) {
      messages.push('Healing potions in high demand');
    }
    if (demand.strengthDemandBoost) {
      messages.push('Adventurers seeking strength potions');
    }
    if (demand.luckDemandBoost) {
      messages.push('Lucky charms trending among explorers');
    }

    const variance = demand.priceVariance;
    let priceTrend: 'up' | 'down' | 'stable' | null = null;
    if (variance > 1.05) {
      messages.push(`Merchant prices up ${Math.round((variance - 1) * 100)}%`);
      priceTrend = 'up';
    } else if (variance < 0.95) {
      messages.push(`Merchant prices down ${Math.round((1 - variance) * 100)}%`);
      priceTrend = 'down';
    }

    if (messages.length === 0) {
      messages.push('Markets stable today');
      priceTrend = 'stable';
    }

    this.marketTicker = {
      message: messages.join('  •  '),
      active: true,
      priceTrend,
    };

    // Auto-hide ticker after TICKER_DURATION_MS
    this.safeTimeout(() => {
      this.marketTicker = { message: '', active: false, priceTrend: null };
      this.notifyChange();
    }, MARKET.TICKER_DURATION_MS);
  }

  private updateDungeonFloor(): void {
    const floorChanged = this.economy.updateFloor(this.day);

    if (floorChanged) {
      this.addDungeonEvent({
        id: this.nextEventId('floor'),
        timestamp: Date.now(),
        adventurerId: '',
        eventType: 'enter',
        message: `The dungeon descends to Floor ${this.economy.currentFloor}. Danger increases!`,
        severity: 'warning',
      });
    }
  }

  private endOfDay(): void {
    this.economy.chargeDailyOverhead();

    const netProfit = this.economy.dailyProfit - this.economy.dailyExpenses;
    const reputationChange = this.economy.reputation - this.economy.startOfDayReputation;

    this.daySummaryData = {
      day: this.day,
      netProfit,
      deaths: this.economy.dailyDeaths,
      saves: this.economy.dailySaves,
      reputationChange,
      potionsSold: this.economy.dailyPotionsSold,
      deathsYourFault: this.economy.dailyDeathsYourFault,
      bossesDefeated: this.economy.dailyBossesDefeated,
      unprepared: this.economy.dailyUnprepared,
      guiltLevel: this.economy.getGuiltLevel(),
    };

    if (this.economy.gold <= ECONOMY.BANKRUPTCY_THRESHOLD) {
      this.triggerGameOver('bankruptcy');
      return;
    }

    if (this.economy.reputation <= ECONOMY.REPUTATION_BANKRUPTCY) {
      this.triggerGameOver('reputation');
      return;
    }

    if (this.day >= ECONOMY.VICTORY_DAYS && this.economy.gold > 0 && this.economy.reputation >= 0) {
      this.triggerGameOver('success');
      return;
    }

    this.gamePhaseService.transition('day-summary');
  }

  // ---------------------------------------------------------------------------
  // Spawn / customer
  // ---------------------------------------------------------------------------

  spawnAdventurer(): void {
    const maxCustomers = this.day >= ECONOMY.FINAL_WEEK_START ? SHOP.FINAL_WEEK_MAX_CUSTOMERS : SHOP.MAX_CUSTOMERS;
    if (this.shop.adventurersInShop.length >= maxCustomers) return;

    const spawnModifier = this.economy.getSpawnRateModifier();
    const isOpeningDeal =
      !this.openingCustomerSpawned &&
      this.day === 1 &&
      this.economy.potionsSold === 0 &&
      this.economy.savedCount === 0 &&
      this.economy.deathCount === 0 &&
      this.shop.adventurersInShop.length === 0 &&
      this.adventurersInDungeon.length === 0;

    // The opening customer frames the game's first real decision. Spawn-rate
    // modifiers and bonus-customer rolls must not replace or precede her.
    if (!isOpeningDeal) {
      if (this.stormActive && this.rng.chance(SHOP.STORM_SPAWN_REDUCTION)) {
        return;
      }

      if (spawnModifier < 1.0 && !this.rng.chance(spawnModifier)) {
        return;
      }

      if (this.economy.spawnReductionActive && this.rng.chance(REPUTATION.DEATH_STREAK_SPAWN_REDUCTION)) {
        return;
      }
    }

    // Check for returning customer from survivor ledger
    if (!isOpeningDeal && this.survivorLedger.length > 0) {
      const returnChance = LOYALTY.RETURN_CHANCE * (1 - this.survivorLedger.length / LOYALTY.POOL_DAMPING);
      for (const survivor of this.survivorLedger) {
        if (this.rng.chance(Math.max(0.01, returnChance))) {
          const returner = this.adventurerService.generateAdventurer(this.day, this.economy.dungeonDifficulty);
          returner.name = survivor.name;
          returner.class = survivor.class as AdventurerClass;
          returner.level = survivor.level + LOYALTY.LEVEL_BOOST;
          returner.gold = Math.floor(returner.gold * 1.2); // 20% more gold from experience
          returner.isReturning = true;
          returner.lastPurchase = survivor.lastPurchase;
          returner.speechBubble = `Back again! Last time I bought ${survivor.lastPurchase}`;
          survivor.timesReturned++;

          this.shop.addCustomer(returner);
          this.addDungeonEvent({
            id: this.nextEventId('return'),
            timestamp: Date.now(),
            adventurerId: returner.id,
            eventType: 'enter',
            message: `${returner.name} returns! "Your potions saved me last time!"`,
            severity: 'success',
          });
          this.notifyChange();
          return; // Returning customer replaces the normal spawn for this tick
        }
      }
    }

    if (
      !isOpeningDeal &&
      spawnModifier > 1.0 &&
      this.shop.adventurersInShop.length < maxCustomers &&
      this.rng.chance(SHOP.BONUS_SPAWN_CHANCE)
    ) {
      const bonusAdventurer = this.adventurerService.generateAdventurer(this.day, this.economy.dungeonDifficulty);
      bonusAdventurer.speechBubble =
        this.economy.deathStreak >= 3 ? this.rng.pick(FEAR_DIALOGUE) : this.generateSpeechBubble(bonusAdventurer);
      this.shop.addCustomer(bonusAdventurer);
      this.addDungeonEvent({
        id: this.nextEventId('bonus'),
        timestamp: Date.now(),
        adventurerId: bonusAdventurer.id,
        eventType: 'enter',
        message: `${bonusAdventurer.name} heard great things about your shop!`,
        severity: 'success',
      });
      if (this.shop.adventurersInShop.length >= maxCustomers) return;
    }

    if (isOpeningDeal) this.openingCustomerSpawned = true;
    const newAdventurer = isOpeningDeal
      ? this.adventurerService.generateOpeningAdventurer()
      : this.adventurerService.generateAdventurer(this.day, this.economy.dungeonDifficulty);

    // Demand surge: more desperate customers during healing demand
    if (this.economy.demandState.healingDemandSurge && this.rng.chance(0.3)) {
      newAdventurer.desperate = true;
    }

    // Fear mechanic: high death streak makes customers visibly afraid
    if (this.economy.deathStreak >= 3) {
      newAdventurer.speechBubble = this.rng.pick(FEAR_DIALOGUE);
    } else if (!isOpeningDeal) {
      newAdventurer.speechBubble = this.generateSpeechBubble(newAdventurer);
    }

    // Guilt-triggered customer reactions
    const guilt = this.economy.guilt;

    // Guilt 25-50: occasional "rumors" comment (flavor text overrides speech bubble)
    if (guilt >= GUILT.LOW_THRESHOLD && guilt < GUILT.MEDIUM_THRESHOLD && this.rng.chance(0.15)) {
      newAdventurer.speechBubble = this.rng.pick([
        "I've heard rumors about this shop...",
        'Some say the potions here are... questionable',
        'The guild has their eye on you, I hear',
      ]);
    }

    // Guilt 50-75: 10% arrive pre-suspicious (reduced patience, will check for diluted)
    if (guilt >= GUILT.MEDIUM_THRESHOLD && guilt < GUILT.HIGH_THRESHOLD && this.rng.chance(0.1)) {
      newAdventurer.experienced = true;
      newAdventurer.speechBubble = 'Let me inspect these potions carefully...';
    }

    // Guilt 90+: 20% chance customer avoids the shady shop entirely
    if (guilt >= 90 && this.rng.chance(0.2)) {
      return;
    }

    this.shop.addCustomer(newAdventurer);

    const now = Date.now();
    if (now - this.lastChimeTime > 3000) {
      this.audio.playDoorChime();
      this.lastChimeTime = now;
    }

    this.addDungeonEvent({
      id: this.nextEventId('enter'),
      timestamp: Date.now(),
      adventurerId: newAdventurer.id,
      eventType: 'enter',
      message: `${newAdventurer.name} the ${newAdventurer.class} approaches your stand`,
      severity: 'info',
    });

    if (this.economy.guilt >= GUILT.HIGH_THRESHOLD && this.rng.chance(GUILT.RUMOR_CHANCE_HIGH)) {
      this.addDungeonEvent({
        id: this.nextEventId('rumor'),
        timestamp: Date.now(),
        adventurerId: newAdventurer.id,
        eventType: 'enter',
        message: `${newAdventurer.name} eyes your shop warily... they've heard rumors.`,
        severity: 'warning',
      });
    }

    if (!this.hints.firstCustomer && this.tutorialComplete) {
      this.hints.firstCustomer = true;
      this.showMessage('A customer! Click their card to select them, then click Sell on a potion.', 'info');
    }

    this.notifyChange();
  }

  private autoSelectCustomer(): void {
    this.shop.autoSelectCustomer();
  }

  private generateSpeechBubble(adventurer: Adventurer): string {
    const lines = CUSTOMER_DIALOGUE[adventurer.class] ?? ['Looking for potions...'];
    return this.rng.pick(lines);
  }

  // ---------------------------------------------------------------------------
  // Dungeon simulation
  // ---------------------------------------------------------------------------

  private simulateDungeon(): void {
    const adventurersToRemove: Adventurer[] = [];

    for (const adventurer of this.adventurersInDungeon) {
      try {
        const effectiveDifficulty = this.dragonActive
          ? this.economy.dungeonDifficulty * EVENTS.DRAGON_DAMAGE_MULTIPLIER
          : this.economy.dungeonDifficulty;
        const result = this.dungeonSim.simulateAdventurerTurn(
          adventurer,
          this.economy.currentFloor,
          effectiveDifficulty
        );

        if (result.event) {
          this.addDungeonEvent(result.event);
        }

        if (result.completed) {
          adventurersToRemove.push(adventurer);

          if (result.survived) {
            if (result.fled) {
              this.handleFlee(adventurer);
            } else {
              this.handleSurvivor(adventurer, result.loot, result.bossDefeated);
            }
          } else {
            this.handleDeath(adventurer);
          }

          if (result.bossDefeated) {
            this.addDungeonEvent({
              id: this.nextEventId('boss'),
              timestamp: Date.now(),
              adventurerId: adventurer.id,
              eventType: 'boss',
              message: `${adventurer.name} defeated the floor ${this.economy.currentFloor} boss!`,
              severity: 'success',
            });
          }

          if (result.comboName) {
            const isNewDiscovery = this.potionCrafting.discoverCombo(result.comboName);
            if (isNewDiscovery) {
              this.addDungeonEvent({
                id: this.nextEventId('combo-discover-dungeon'),
                timestamp: Date.now(),
                adventurerId: adventurer.id,
                eventType: 'combo',
                message: `New combo discovered: ${result.comboName}!`,
                severity: 'success',
              });
            }
            this.addDungeonEvent({
              id: this.nextEventId('combo-dungeon'),
              timestamp: Date.now(),
              adventurerId: adventurer.id,
              eventType: 'combo',
              message: `${adventurer.name} activates combo: ${result.comboName}!`,
              severity: 'success',
            });
          }
        }
      } catch (err) {
        const gameError = toGameError(err, 'simulation');
        if (!environment.production) {
          console.error(
            `[GameOrchestrator] Dungeon sim error for ${adventurer.name} [${gameError.category}]:`,
            gameError.message,
            gameError.context
          );
        }
        adventurersToRemove.push(adventurer);
      }
    }

    adventurersToRemove.forEach((adv) => {
      const index = this.adventurersInDungeon.indexOf(adv);
      if (index > -1) {
        this.adventurersInDungeon.splice(index, 1);
      }
    });

    this.notifyChange();
  }

  private handleSurvivor(adventurer: Adventurer, loot?: DungeonLoot, bossDefeated?: boolean): void {
    if (bossDefeated) {
      this.audio.playVictoryHorn();
    }

    const perfectSave = adventurer.currentHp >= adventurer.maxHp * SURVIVAL_CONFIG.PERFECT_SAVE_THRESHOLD;
    this.economy.recordSurvivor(perfectSave, !!bossDefeated);

    if (loot && loot.gold > 0 && adventurer.potionsConsumed.length > 0) {
      const effectiveLoot = this.dragonActive ? Math.floor(loot.gold * EVENTS.DRAGON_LOOT_MULTIPLIER) : loot.gold;
      let tip = Math.floor(effectiveLoot * DUNGEON.TIP_PERCENTAGE);
      // Returning customers tip more generously
      if (adventurer.isReturning && tip > 0) {
        tip = Math.floor(tip * (1 + LOYALTY.TIP_BONUS));
      }
      if (tip > 0) {
        this.economy.addGold(tip, 'dungeon-tip');
        this.addDungeonEvent({
          id: this.nextEventId('tip'),
          timestamp: Date.now(),
          adventurerId: adventurer.id,
          eventType: 'loot',
          message: `${adventurer.name} tips you ${tip}g from their ${effectiveLoot}g haul!`,
          severity: 'success',
        });
      }
    }

    // Record survivor in ledger for potential return visits
    if (adventurer.potionsConsumed.length > 0) {
      const lastPotion = adventurer.potionsConsumed[adventurer.potionsConsumed.length - 1];
      this.addToSurvivorLedger({
        id: adventurer.id,
        name: adventurer.name,
        class: adventurer.class,
        level: adventurer.level,
        lastPurchase: lastPotion.name,
        timesReturned: 0,
      });
    }

    if (this.rng.chance(EVENTS.REVIEW_CHANCE_SURVIVOR)) {
      this.addCustomerReview(adventurer, true);
    }
  }

  private addToSurvivorLedger(entry: SurvivorEntry): void {
    // Prefer id-based lookup to handle same-name adventurers correctly.
    // Fall back to name matching for legacy saved entries that lack an id.
    const existingIndex =
      entry.id !== undefined
        ? this.survivorLedger.findIndex((s) => s.id === entry.id || (s.id === undefined && s.name === entry.name))
        : this.survivorLedger.findIndex((s) => s.name === entry.name);
    if (existingIndex >= 0) {
      // Preserve timesReturned from existing record, update other fields
      this.survivorLedger[existingIndex] = {
        ...entry,
        timesReturned: this.survivorLedger[existingIndex].timesReturned,
      };
      return;
    }

    this.survivorLedger.push(entry);

    // FIFO eviction at max capacity
    if (this.survivorLedger.length > LOYALTY.MAX_SURVIVORS) {
      this.survivorLedger.shift();
    }
  }

  private handleFlee(_adventurer: Adventurer): void {
    // Use recordSurvivor for consistent stat tracking (savedCount, dailySaves,
    // encountersSurvived, deathStreak reset, AND spawnReductionActive reset).
    // Pass false for both since fleeing is neither a perfect save nor a boss defeat.
    this.economy.recordSurvivor(false, false);

    // Override the standard SURVIVOR_BONUS with the lower FLEE bonus.
    // recordSurvivor already applied +SURVIVOR_BONUS, so undo it and apply FLEE bonus.
    this.economy.adjustReputation(FLEE.REPUTATION_BONUS - REPUTATION.SURVIVOR_BONUS, 'adventurer-fled-correction');
  }

  private handleDeath(adventurer: Adventurer): void {
    this.audio.playDeathKnell();

    const hadDilutedPotion = adventurer.potionsConsumed.some((p) => p.potionId.includes('diluted'));
    const hadAnyPotion = adventurer.potionsConsumed.length > 0;
    const wasYourFault =
      hadDilutedPotion || !hadAnyPotion || adventurer.survivalChance < DUNGEON.SURVIVAL_WARNING_THRESHOLD;

    this.economy.recordDeath(hadAnyPotion, hadDilutedPotion, wasYourFault);

    // Extra guilt when a regular customer dies — you knew them
    if (adventurer.isReturning && wasYourFault) {
      this.economy.addGuilt(POTIONS.GUILT_PER_DEATH * (LOYALTY.REGULAR_DEATH_GUILT_MULTIPLIER - 1));
    }

    const deathNotification: DeathNotification = {
      adventurer,
      message: adventurer.causeOfDeath || 'died in the dungeon',
      timestamp: Date.now(),
      wasYourFault,
      lastWords: this.dungeonSim.getRandomLastWords(),
    };

    this.recentDeath = deathNotification;
    this.showDeathNotification(deathNotification);

    const potionNames = adventurer.potionsConsumed.map((p) => p.name).join(' + ');
    this.addDungeonEvent({
      id: this.nextEventId('death'),
      timestamp: Date.now(),
      adventurerId: adventurer.id,
      eventType: 'death',
      message: potionNames
        ? `${adventurer.name} fell in battle (had: ${potionNames})`
        : `${adventurer.name} fell in battle (no potions)`,
      severity: 'danger',
    });

    if (this.rng.chance(EVENTS.REVIEW_CHANCE_DEATH)) {
      this.addCustomerReview(adventurer, false);
    }
  }

  private showDeathNotification(_notification: DeathNotification): void {
    this.showDeathModal = true;

    if (this.deathModalTimeout) {
      clearTimeout(this.deathModalTimeout);
      this.pendingTimeouts.delete(this.deathModalTimeout);
    }
    // Store the returned id so a second rapid death can cancel the first hide timer.
    this.deathModalTimeout = this.safeTimeout(() => {
      this.showDeathModal = false;
      this.deathModalTimeout = null;
      this.notifyChange();
    }, TIMING.DEATH_MODAL_MS);
  }

  private sendToDungeon(adventurer: Adventurer): void {
    if (this.adventurersInDungeon.some((a) => a.id === adventurer.id)) {
      return;
    }

    // Use removeCustomer to properly notify BehaviorSubject subscribers
    this.shop.removeCustomer(adventurer);

    adventurer.status = AdventurerStatus.Entering;
    adventurer.enterTime = Date.now(); // Keep for display purposes and shop queue timeouts
    adventurer.dungeonTickCount = 0;
    this.adventurersInDungeon.push(adventurer);

    this.addDungeonEvent({
      id: this.nextEventId('dungeon-enter'),
      timestamp: Date.now(),
      adventurerId: adventurer.id,
      eventType: 'enter',
      message: `${adventurer.name} enters the dungeon${adventurer.survivalChance < DUNGEON.SURVIVAL_WARNING_THRESHOLD ? ' (looking unsteady)' : ''}`,
      severity: adventurer.survivalChance < DUNGEON.SURVIVAL_WARNING_THRESHOLD ? 'warning' : 'info',
    });
  }

  // ---------------------------------------------------------------------------
  // Shop queue processing
  // ---------------------------------------------------------------------------

  private processShopQueue(): void {
    const leavingAdventurers = this.shop.processQueue();

    for (const adv of leavingAdventurers) {
      if (adv.potionsConsumed.length > 0) {
        this.sendToDungeon(adv);
      } else if (adv.desperate) {
        this.economy.dailyUnprepared++;
        this.sendToDungeon(adv);
        this.addDungeonEvent({
          id: this.nextEventId('desperate'),
          timestamp: Date.now(),
          adventurerId: adv.id,
          eventType: 'enter',
          message: `${adv.name} couldn't buy potions but enters the dungeon anyway... "I have no choice."`,
          severity: 'danger',
        });
      } else {
        this.economy.adjustReputation(-SHOP.REPUTATION_TIMEOUT_PENALTY, 'customer-timeout');

        this.addDungeonEvent({
          id: this.nextEventId('leave'),
          timestamp: Date.now(),
          adventurerId: adv.id,
          eventType: 'escape',
          message: `${adv.name} got tired of waiting and left (-${SHOP.REPUTATION_TIMEOUT_PENALTY} rep)`,
          severity: 'warning',
        });
      }
    }
  }

  private processAutomaticCustomerBrowsing(): void {
    // Snapshot the array: handleCustomerCantAfford may replace adventurersInShop
    // mid-loop via filter+setter, causing double-processing or skips.
    const snapshot = [...this.shop.adventurersInShop];
    for (const adventurer of snapshot) {
      if (adventurer.potionsConsumed.length > 0) continue;

      const browseTime = Date.now() - adventurer.enterTime;
      const minBrowse = this.getMinBrowseTime(adventurer);
      if (browseTime < minBrowse) continue;

      const reputationMultiplier = Math.max(
        SHOP.AUTO_PURCHASE_MIN_REP_MULTIPLIER,
        Math.min(1.0, this.economy.reputation / ECONOMY.MAX_REPUTATION)
      );
      let purchaseChance = SHOP.AUTO_PURCHASE_CHANCE * reputationMultiplier;
      purchaseChance *= this.getPurchaseChanceMultiplier(adventurer);

      if (!this.rng.chance(purchaseChance)) continue;

      const affordablePotions = this.availablePotions.filter((potion) => {
        const stock = this.potionInventory.get(potion.id) || 0;
        const price = this.calculatePrice(potion, adventurer, this.activePriceMode);
        return stock > 0 && adventurer.gold >= price;
      });

      if (affordablePotions.length === 0) {
        this.handleCustomerCantAfford(adventurer);
        continue;
      }

      const potionToBuy = this.selectPotionForCustomer(adventurer, affordablePotions, this.activePriceMode);
      this.sellPotion(potionToBuy, adventurer, this.activePriceMode);
    }
  }

  private getMinBrowseTime(adventurer: Adventurer): number {
    if (adventurer.desperate) return CUSTOMER_AI.BROWSE_TIME['desperate'];
    if (adventurer.experienced) return CUSTOMER_AI.BROWSE_TIME['experienced'];
    if (adventurer.frugal) return CUSTOMER_AI.BROWSE_TIME['frugal'];
    if (adventurer.trusting) return CUSTOMER_AI.BROWSE_TIME['trusting'];
    return TIMING.MIN_BROWSE_TIME_MS;
  }

  private getPurchaseChanceMultiplier(adventurer: Adventurer): number {
    if (adventurer.desperate) return CUSTOMER_AI.PURCHASE_CHANCE_MULTIPLIER['desperate'];
    if (adventurer.trusting) return CUSTOMER_AI.PURCHASE_CHANCE_MULTIPLIER['trusting'];
    if (adventurer.experienced) return CUSTOMER_AI.PURCHASE_CHANCE_MULTIPLIER['experienced'];
    if (adventurer.frugal) return CUSTOMER_AI.PURCHASE_CHANCE_MULTIPLIER['frugal'];
    return 1.0;
  }

  private selectPotionForCustomer(
    adventurer: Adventurer,
    affordablePotions: Potion[],
    priceMode: PriceMode = 'fair'
  ): Potion {
    if (adventurer.experienced) {
      const preferences = CUSTOMER_AI.CLASS_POTION_PREFERENCE[adventurer.class] ?? [];
      for (const prefId of preferences) {
        const match = affordablePotions.find((p) => !p.isDiluted && (p.id === prefId || p.id.startsWith(prefId)));
        if (match) return match;
      }
    }

    if (adventurer.frugal) {
      // Single-pass minimum: avoid recalculating the running cheapest price on each iteration
      let cheapest = affordablePotions[0];
      let cheapestPrice = this.calculatePrice(cheapest, adventurer, priceMode);
      for (let i = 1; i < affordablePotions.length; i++) {
        const p = affordablePotions[i];
        const price = this.calculatePrice(p, adventurer, priceMode);
        if (price < cheapestPrice) {
          cheapest = p;
          cheapestPrice = price;
        }
      }
      return cheapest;
    }

    if (adventurer.trusting) {
      const recommended = this.getRecommendedPotion(adventurer, priceMode);
      if (recommended && affordablePotions.includes(recommended)) {
        return recommended;
      }
    }

    if (adventurer.desperate) {
      return affordablePotions[0];
    }

    const recommended = this.getRecommendedPotion(adventurer, priceMode);
    return recommended && affordablePotions.includes(recommended) ? recommended : this.rng.pick(affordablePotions);
  }

  /** Apply the visible quote policy to both manual and idle-economy sales. */
  setPriceMode(priceMode: PriceMode): void {
    this.activePriceMode = priceMode;
  }

  private handleCustomerCantAfford(adventurer: Adventurer): void {
    let leaveChance =
      SHOP.LEAVE_BASE_CHANCE + (1 - this.economy.reputation / ECONOMY.MAX_REPUTATION) * SHOP.LEAVE_REP_FACTOR;

    if (adventurer.frugal) {
      leaveChance *= 1.5;
    } else if (adventurer.desperate) {
      leaveChance *= 0.3;
    }

    if (this.rng.chance(leaveChance)) {
      this.economy.adjustReputation(-SHOP.CANT_AFFORD_LEAVE_REP_PENALTY, 'customer-left-cant-afford');
      const wasSelected = this.shop.selectedAdventurer?.id === adventurer.id;
      this.shop.adventurersInShop = this.shop.adventurersInShop.filter((a) => a.id !== adventurer.id);
      if (wasSelected) {
        this.shop.selectedAdventurer = null;
        this.autoSelectCustomer();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Shop actions
  // ---------------------------------------------------------------------------

  sellPotion(potion: Potion, adventurer: Adventurer, priceMode: PriceMode = 'fair'): void {
    const stock = this.potionInventory.get(potion.id) || 0;
    const price = adventurer ? this.calculatePrice(potion, adventurer, priceMode) : 0;

    const validation = this.shop.validateSale(potion, adventurer, stock, price);
    if (!validation.valid) {
      if (validation.error?.includes('[Experienced]')) {
        this.addDungeonEvent({
          id: this.nextEventId('refuse'),
          timestamp: Date.now(),
          adventurerId: adventurer.id,
          eventType: 'refuse',
          message: `${adventurer.name} inspects the potion... "This is watered down!"`,
          severity: 'warning',
        });
        this.shop.selectedAdventurer = null;
        this.shop.autoSelectCustomer(adventurer.id);
      }
      if (validation.error?.includes('no longer')) {
        this.shop.selectedAdventurer = null;
      }
      return;
    }

    adventurer.gold -= price;
    this.economy.addGold(price, 'potion-sale');
    this.economy.recordSale();
    this.audio.playCoinClink();
    if (priceMode === 'mercy') {
      this.economy.adjustReputation(PRICING.MERCY_REPUTATION_BONUS, 'mercy-quote');
    } else if (priceMode === 'gouge') {
      const guilt = PRICING.GOUGE_GUILT + (adventurer.desperate ? PRICING.DESPERATE_GOUGE_GUILT_BONUS : 0);
      this.economy.addGuilt(guilt);
    }
    if (potion.isDiluted) {
      this.economy.recordDilutedSale();
    }

    if (!this.hints.firstSale) {
      this.hints.firstSale = true;
      this.showMessage(
        'Sold! Whether they survive depends on what you gave them. Better potions, better odds.',
        'success'
      );
    }

    const effects = this.getUpgradedEffects(potion);
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

    this.potionInventory.set(potion.id, stock - 1);

    if (!this.hints.lowStock && stock - 1 <= 0) {
      this.hints.lowStock = true;
      this.showMessage('Out of stock! Use the +2 button to emergency restock, or win the shell game.', 'info');
    }

    this.dungeonSim.calculateSurvivalChance(adventurer, potion, this.potionUpgrades, effects);

    let detectedComboName: string | undefined;
    if (adventurer.potionsConsumed.length >= 2) {
      const potionIds = adventurer.potionsConsumed.map((p) => p.potionId);
      const combo = this.potionCrafting.detectCombo(potionIds);
      if (combo) {
        detectedComboName = combo.name;
        this.economy.recordCombo();
        this.audio.playCombo();
        const isNewDiscovery = this.potionCrafting.discoverCombo(combo.name);
        if (isNewDiscovery) {
          this.addDungeonEvent({
            id: this.nextEventId('combo-discover'),
            timestamp: Date.now(),
            adventurerId: adventurer.id,
            eventType: 'combo',
            message: `New combo discovered: ${combo.name}!`,
            severity: 'success',
          });
        }
        this.addDungeonEvent({
          id: this.nextEventId('combo'),
          timestamp: Date.now(),
          adventurerId: adventurer.id,
          eventType: 'combo',
          message: `Combo activated: ${combo.name}!`,
          severity: 'success',
        });
      }
    }

    const saleMessage = this.getSaleFeedbackMessage(potion, adventurer, price, priceMode);
    if (saleMessage) {
      const messageType = adventurer.desperate ? 'success' : 'info';
      this.showMessage(saleMessage, messageType);
    }

    // Refresh array reference so OnPush child components detect the mutation
    this.shop.adventurersInShop = [...this.shop.adventurersInShop];

    if (adventurer.potionsConsumed.length >= SHOP.MAX_POTIONS_PER_CUSTOMER) {
      this.purchaseAnimation = { adventurerId: adventurer.id, amount: price };

      if (detectedComboName) {
        this.comboSignal = { name: detectedComboName };
        this.safeTimeout(() => {
          this.comboSignal = null;
          this.notifyChange();
        }, TIMING.COMBO_ANIMATION_MS);
      }

      this.safeTimeout(() => {
        this.purchaseAnimation = null;
        this.shop.removeCustomer(adventurer);
        this.sendToDungeon(adventurer);
        this.notifyChange();
      }, TIMING.PURCHASE_ANIMATION_MS);
    }

    this.notifyChange();
  }

  dilutePotion(potion: Potion): void {
    if (potion.isDiluted) {
      this.showMessage('That batch is already watered down.', 'warning');
      return;
    }

    const stock = this.potionInventory.get(potion.id) || 0;
    if (stock <= 0) {
      this.showMessage('No potions to dilute!', 'warning');
      return;
    }

    const diluted = this.potionCrafting.createDilutedPotion(potion);
    const dilutedStock = this.potionInventory.get(diluted.id) || 0;

    this.potionInventory.set(potion.id, stock - 1);
    this.potionInventory.set(diluted.id, dilutedStock + 2);
    this.hasSeenDilutionRitual = true;

    if (!this.availablePotions.find((p) => p.id === diluted.id)) {
      this.availablePotions.push(diluted);
    }

    this.economy.addGuilt(POTIONS.DILUTION_GUILT);

    this.showMessage(
      `Cut batch: 1 ${potion.name} became 2 watered bottles (+${POTIONS.DILUTION_GUILT} guilt).`,
      'warning'
    );

    this.notifyChange();
  }

  private updateGuilt(): void {
    this.economy.decayGuilt(POTIONS.GUILT_DECAY_PER_TICK);
  }

  emergencyRestock(potion: Potion): void {
    const cost = this.emergencyPrices.get(potion.id) ?? 0;
    if (cost <= 0) return;

    if (!this.economy.spendGold(cost, 'emergency-restock')) {
      this.showMessage(`Need ${cost}g for emergency restock!`, 'warning');
      return;
    }

    const currentStock = this.potionInventory.get(potion.id) ?? 0;
    this.potionInventory.set(potion.id, currentStock + EMERGENCY_RESTOCK.UNITS_PER_RESTOCK);
    this.showMessage(`Emergency restock: +${EMERGENCY_RESTOCK.UNITS_PER_RESTOCK} ${potion.name}`, 'info');

    this.notifyChange();
  }

  // ---------------------------------------------------------------------------
  // Merchant actions
  // ---------------------------------------------------------------------------

  buyFromMerchant(potionType: MerchantPotionType): void {
    const validation = this.shop.validateMerchantPurchase(potionType, this.economy.gold);
    if (!validation.valid || !validation.potionId || !validation.cost) {
      this.showMessage(validation.error || 'Purchase failed', 'warning');
      return;
    }

    const { potionId, cost } = validation;
    this.economy.spendGold(cost, 'merchant-purchase');
    const currentStock = this.potionInventory.get(potionId) || 0;
    this.potionInventory.set(potionId, currentStock + 1);

    this.shop.completeMerchantPurchase(potionType);

    this.notifyChange();
  }

  buyAllFromMerchant(): void {
    const types: MerchantPotionType[] = ['basicHealing', 'strengthPotion', 'defensePotion', 'speedElixir', 'luckCharm'];

    let totalCost = 0;
    for (const type of types) {
      const item = this.shop.merchantInventory[type];
      totalCost += item.available * item.cost;
    }

    if (this.economy.gold < totalCost) {
      this.showMessage(`Need ${totalCost}g to buy everything!`, 'warning');
      return;
    }

    // Purchase all items without emitting notifyChange on each iteration —
    // call notifyChange once at the end to avoid N change-detection cycles.
    for (const type of types) {
      const validation = this.shop.validateMerchantPurchase(type, this.economy.gold);
      if (!validation.valid || !validation.potionId || !validation.cost) continue;

      const item = this.shop.merchantInventory[type];
      const qty = item.available;
      const potionId = validation.potionId;
      const costPerUnit = item.cost;

      for (let i = 0; i < qty; i++) {
        if (this.economy.gold < costPerUnit) break;
        this.economy.spendGold(costPerUnit, 'merchant-purchase');
        const currentStock = this.potionInventory.get(potionId) || 0;
        this.potionInventory.set(potionId, currentStock + 1);
        this.shop.completeMerchantPurchase(type);
      }
    }

    this.notifyChange();
  }

  buyUpgrade(upgradeType: PotionType): void {
    const currentTier = this.potionUpgrades[upgradeType] || 0;
    const maxTier = this.TIER_NAMES.length - 1;

    if (currentTier >= maxTier) {
      this.showMessage('Already at maximum tier!', 'info');
      return;
    }

    const cost = this.UPGRADE_COSTS[upgradeType][currentTier];
    if (!this.economy.spendGold(cost, `upgrade-${upgradeType}`)) {
      this.showMessage(`Need ${cost}g for this upgrade!`, 'warning');
      return;
    }

    this.potionUpgrades[upgradeType] = currentTier + 1;

    const newTierName = this.TIER_NAMES[currentTier + 1];
    const potionNames: Record<string, string> = {
      healing: 'Healing',
      strength: 'Strength',
      defense: 'Protection',
      speed: 'Speed',
      luck: 'Luck',
    };
    this.showMessage(
      `${newTierName} ${potionNames[upgradeType]} unlocked! ${this.TIER_MULTIPLIERS[currentTier + 1]}x effects!`,
      'success'
    );

    this.notifyChange();
  }

  canBuyUpgrade(upgradeType: PotionType): boolean {
    const currentTier = this.potionUpgrades[upgradeType] || 0;
    const maxTier = this.TIER_NAMES.length - 1;
    if (currentTier >= maxTier) return false;
    return this.economy.gold >= this.UPGRADE_COSTS[upgradeType][currentTier];
  }

  getNextUpgradeCost(upgradeType: PotionType): number | null {
    const currentTier = this.potionUpgrades[upgradeType] || 0;
    const maxTier = this.TIER_NAMES.length - 1;
    if (currentTier >= maxTier) return null;
    return this.UPGRADE_COSTS[upgradeType][currentTier];
  }

  getNextTierName(upgradeType: PotionType): string | null {
    const currentTier = this.potionUpgrades[upgradeType] || 0;
    const maxTier = this.TIER_NAMES.length - 1;
    if (currentTier >= maxTier) return null;
    return this.TIER_NAMES[currentTier + 1];
  }

  getCurrentTierName(upgradeType: PotionType): string {
    const currentTier = this.potionUpgrades[upgradeType] || 0;
    return this.TIER_NAMES[currentTier];
  }

  isMaxTier(upgradeType: PotionType): boolean {
    const currentTier = this.potionUpgrades[upgradeType] || 0;
    return currentTier >= this.TIER_NAMES.length - 1;
  }

  // ---------------------------------------------------------------------------
  // Phase transitions
  // ---------------------------------------------------------------------------

  openShop(shellGame?: ShellGameComponent): void {
    this.audio.playPhaseChange();
    this.gamePhaseService.transition('playing');

    // Reset day timer at the boundary into PLAYING. Closes the load-restore
    // bug where `initializeGame` rehydrated `gameTime` from the save file
    // (line 392-403) but `ngOnInit` then forced Day 2+ back to merchant
    // phase. The user clicked Open Shop expecting a fresh day, but ticks
    // resumed from the saved mid-day value — the day "ended in the
    // morning" within seconds. Natural day-end / closeShopEarly already
    // reset gameTime to 0 before reaching here, so this is a no-op for
    // those paths.
    this.gameTime = 0;
    this.timeOfDay = 'Morning';

    this.shop.resetCustomerEnterTimes();

    shellGame?.start();

    this.safeTimeout(() => this.spawnAdventurer(), TIMING.SPAWN_DELAY_MS);

    this.addDungeonEvent({
      id: this.nextEventId('day-start'),
      timestamp: Date.now(),
      adventurerId: '',
      eventType: 'enter',
      message: `Day ${this.day} begins. The dungeon awaits...`,
      severity: 'info',
    });

    this.notifyChange();
  }

  closeShopEarly(): void {
    if (this.gamePhaseService.currentPhase() !== 'playing') return;

    this.shop.clearCustomers();
    this.shop.adventurersInShop = [];
    this.shop.selectedAdventurer = null;

    // Apply "abandoned" consequences for every adventurer still in the dungeon.
    // Without this, a player could watch HP bars and close shop to dodge the
    // reputation/guilt hit from a likely death — removing the game's moral weight.
    // Only adventurers still genuinely at risk count as abandoned; those already
    // Looting or Victorious have survived combat and must not be penalized.
    const abandonedRunners = this.getCloseDayAtRiskAdventurers();
    for (const abandoned of abandonedRunners) {
      this.economy.adjustReputation(-REPUTATION.ABANDON_PENALTY, 'abandoned-dungeon');
      this.economy.addGuilt(GUILT.ABANDON_GAIN);
      this.addDungeonEvent({
        id: this.nextEventId('abandon'),
        timestamp: Date.now(),
        adventurerId: abandoned.id,
        message: `${abandoned.name} was abandoned mid-run (-${REPUTATION.ABANDON_PENALTY} rep)`,
        eventType: 'escape',
        severity: 'warning',
      });
    }

    // Single contract call instead of per-adventurer loop. Cleaner semantics
    // and immune to silent leaks if the iteration source ever drifts from
    // the actual combat-state map keys.
    this.dungeonSim.clearAllCombatStates();
    this.adventurersInDungeon = [];

    this.endOfDay();

    if (this.gamePhaseService.currentPhase() === 'game-over') {
      this.notifyChange();
      return;
    }

    this.gameTime = 0;
    this.day++;
    this.timeOfDay = 'Morning';
    this.startOfDay();
    this.notifyChange();
  }

  /**
   * Returns the same close-day population and balance constants used by
   * closeShopEarly(), so the confirmation ledger cannot drift from execution.
   *
   * Reputation/guilt costs are computed by simulating the EXACT per-runner
   * sequence closeShopEarly() executes below (adjustReputation then addGuilt,
   * one runner at a time) against local variables instead of raw arithmetic.
   * Raw `atRiskCount * ABANDON_PENALTY` understates the cost during a guilt
   * spiral — adjustReputation() amplifies negative deltas 1.5x/2x at the
   * guilt MEDIUM/HIGH thresholds and clamps at MIN_REPUTATION — and is
   * path-dependent, since crossing a guilt threshold mid-loop only amplifies
   * later runners. Simulating the loop keeps preview === actual for any state.
   */
  getCloseDayPreview(): CloseDayPreview {
    const atRiskCount = this.getCloseDayAtRiskAdventurers().length;

    let simulatedReputation = this.economy.reputation;
    let simulatedGuilt = this.economy.guilt;
    for (let i = 0; i < atRiskCount; i++) {
      simulatedReputation = applyReputationDelta(simulatedReputation, simulatedGuilt, -REPUTATION.ABANDON_PENALTY);
      simulatedGuilt = Math.min(this.economy.maxGuilt, simulatedGuilt + GUILT.ABANDON_GAIN);
    }

    return {
      waitingCustomerCount: this.shop.adventurersInShop.length,
      atRiskCount,
      reputationCost: this.economy.reputation - simulatedReputation,
      guiltCost: simulatedGuilt - this.economy.guilt,
      dailyOverhead: this.DAILY_OVERHEAD,
    };
  }

  private getCloseDayAtRiskAdventurers(): Adventurer[] {
    return this.adventurersInDungeon.filter(
      (adventurer) =>
        adventurer.status !== AdventurerStatus.Looting && adventurer.status !== AdventurerStatus.Victorious
    );
  }

  dismissDaySummary(): void {
    this.audio.playPhaseChange();
    this.daySummaryData = null;
    this.resetMerchantInventory();
    this.gamePhaseService.transition('merchant');
    this.notifyChange();
  }

  triggerGameOver(reason: 'bankruptcy' | 'reputation' | 'success'): void {
    this.gameOverReason = reason;
    this.gamePhaseService.transition('game-over');
    this.notifyChange();
  }

  restartGame(): void {
    this.gameState.clearGameState();
    try {
      window.localStorage.removeItem('potion-stand-tutorial-seen');
    } catch {
      /* storage unavailable — fall through */
    }
    window.location.reload();
  }

  // ---------------------------------------------------------------------------
  // Random events
  // ---------------------------------------------------------------------------

  private triggerRandomEvent(): void {
    const isLateGame = this.day >= EVENTS.LATE_GAME_DAY;
    const minDays = isLateGame ? EVENTS.LATE_GAME_MIN_DAYS_BETWEEN : EVENTS.MIN_DAYS_BETWEEN;
    const triggerChance = isLateGame ? EVENTS.LATE_GAME_TRIGGER_CHANCE : EVENTS.TRIGGER_CHANCE;
    if (this.day - this.lastEventDay < minDays) return;
    if (!this.rng.chance(triggerChance)) return;

    const events = [
      {
        title: 'Mushroom Shortage',
        description: 'A blight has affected local mushrooms. Strength potions are harder to sell today.',
        icon: 'mushroom',
        effect: () => {
          const currentStock = this.potionInventory.get('strength-potion') || 0;
          if (currentStock > 0) {
            this.potionInventory.set('strength-potion', Math.floor(currentStock / 2));
            this.showMessage('Mushroom shortage reduced strength potion stock!', 'warning');
          }
        },
      },
      {
        title: 'Dungeon Tournament',
        description: 'A grand tournament brings more adventurers to town!',
        icon: 'trophy',
        effect: () => {
          this.spawnAdventurer();
          this.spawnAdventurer();
        },
      },
      {
        title: 'Guild Inspection',
        description: 'The Alchemist Guild is checking for diluted potions...',
        icon: 'detective',
        effect: () => {
          const dilutedCount = Array.from(this.potionInventory.keys())
            .filter((id) => id.includes('diluted'))
            .reduce((sum, id) => sum + (this.potionInventory.get(id) || 0), 0);

          if (dilutedCount > 0) {
            this.potionInventory.forEach((_, key) => {
              if (key.includes('diluted')) {
                this.potionInventory.set(key, 0);
              }
            });
            this.economy.adjustReputation(-REPUTATION.GUILD_INSPECTION_DIRTY_PENALTY, 'guild-inspection-dirty');
            // Fines are mandatory — like daily overhead, push gold negative if necessary
            // so the bankruptcy guard at ECONOMY.BANKRUPTCY_THRESHOLD can fire. Using
            // spendGold() here would silently no-op when gold < fine, leaving the
            // "Fined Xg" message as a display lie. (March RTG Finding 3/6.)
            const fineCollected = Math.min(REPUTATION.GUILD_FINE, this.economy.gold);
            this.economy.gold -= REPUTATION.GUILD_FINE;
            const message =
              fineCollected < REPUTATION.GUILD_FINE
                ? `Guild confiscated ${dilutedCount} diluted potions! Couldn't pay full fine (${REPUTATION.GUILD_FINE}g). Debt added.`
                : `Guild confiscated ${dilutedCount} diluted potions! Fined ${REPUTATION.GUILD_FINE}g`;
            this.showMessage(message, 'error');
          } else {
            this.economy.adjustReputation(REPUTATION.GUILD_INSPECTION_CLEAN_BONUS, 'guild-inspection-clean');
          }
        },
      },
      {
        title: 'Wealthy Merchant',
        description: 'A wealthy merchant wants to stock up on potions!',
        icon: 'coins',
        effect: () => {
          const merchant = this.adventurerService.generateAdventurer(this.day, this.economy.dungeonDifficulty);
          merchant.name = 'Wealthy Merchant';
          merchant.gold = EVENTS.WEALTHY_MERCHANT_GOLD;
          this.shop.addCustomer(merchant);
        },
      },
      {
        title: 'Storm',
        description: 'Heavy rain keeps adventurers away today. Fewer customers will arrive.',
        icon: 'storm',
        effect: () => {
          this.stormActive = true;
          const current = this.shop.adventurersInShop;
          if (current.length > 2) {
            const leavingCount = Math.floor(current.length / 2);
            const leavingCustomers = current.slice(0, leavingCount);
            // Reassign via setter to trigger BehaviorSubject notification
            this.shop.adventurersInShop = current.slice(leavingCount);
            if (
              this.shop.selectedAdventurer &&
              leavingCustomers.some((adv) => adv.id === this.shop.selectedAdventurer?.id)
            ) {
              this.shop.selectedAdventurer = null;
              this.autoSelectCustomer();
            }
            this.showMessage(`${leavingCount} customers left due to the storm!`, 'warning');
          }
        },
      },
      {
        title: 'Thief in the Night',
        description: 'A shadowy figure was spotted near the shop. Gold may be at risk!',
        icon: 'skull',
        effect: () => {
          const hasDefenseUpgrade = this.potionUpgrades['defense'] > 0;
          if (hasDefenseUpgrade) {
            this.showMessage('Your reinforced shop deterred the thief!', 'success');
          } else {
            const lossPercent = 0.05 + this.rng.nextFloat() * 0.1;
            const goldLost = Math.floor(this.economy.gold * lossPercent);
            if (goldLost > 0) {
              this.economy.spendGold(goldLost, 'thief-event');
              this.showMessage(`A thief stole ${goldLost}g overnight!`, 'error');
            }
          }
        },
      },
      {
        title: 'Wandering Alchemist',
        description: 'A traveling alchemist offers to trade potions!',
        icon: 'mushroom',
        effect: () => {
          const potionIds = ['basic-healing', 'strength-potion', 'defense-potion', 'speed-elixir', 'luck-charm'];
          let highest = { id: '', stock: 0 };
          let lowest = { id: '', stock: Infinity };

          for (const id of potionIds) {
            const stock = this.potionInventory.get(id) ?? 0;
            if (stock > highest.stock) highest = { id, stock };
            if (stock < lowest.stock && stock >= 0) lowest = { id, stock };
          }

          if (highest.stock >= 2 && highest.id !== lowest.id) {
            this.potionInventory.set(highest.id, highest.stock - 2);
            this.potionInventory.set(lowest.id, (lowest.stock === Infinity ? 0 : lowest.stock) + 1);
            this.showMessage(`Alchemist traded 2 potions for 1 enhanced ${lowest.id.replace(/-/g, ' ')}!`, 'info');
          } else {
            this.showMessage('The alchemist found nothing to trade and moved on.', 'info');
          }
        },
      },
      {
        title: 'Haunted Shop',
        description: 'The ghost of a fallen adventurer haunts your shop...',
        icon: 'skull',
        effect: () => {
          if (this.rng.chance(0.6)) {
            this.economy.guilt = Math.max(0, this.economy.guilt - 15);
            this.showMessage('You faced the ghost and found peace. Guilt eased.', 'success');
            this.addDungeonEvent({
              id: this.nextEventId('ghost'),
              timestamp: Date.now(),
              adventurerId: '',
              eventType: 'enter',
              message: 'A spectral adventurer forgives you... the guilt eases.',
              severity: 'success',
            });
          } else {
            this.economy.addGuilt(5);
            this.showMessage('The ghost whispers accusations... guilt deepens.', 'warning');
          }
        },
      },
      {
        title: 'Mysterious Customer',
        description: 'A cloaked figure with deep pockets enters your shop!',
        icon: 'coins',
        effect: () => {
          this.mysteriousCustomerUsed = true;
          const mysterious = this.adventurerService.generateAdventurer(this.day, this.economy.dungeonDifficulty);
          mysterious.name = 'Mysterious Stranger';
          mysterious.gold = mysterious.gold * 3;
          mysterious.survivalChance = 0.8;
          mysterious.maxHp = Math.floor(mysterious.maxHp * 2);
          mysterious.currentHp = mysterious.maxHp;
          this.shop.addCustomer(mysterious);
        },
      },
    ];

    if (isLateGame) {
      events.push(
        {
          title: 'Dragon Sighting',
          description: 'A dragon lurks in the lower floors! Danger rises but loot is plentiful.',
          icon: 'skull',
          effect: () => {
            this.dragonActive = true;
          },
        },
        {
          title: 'Potion Shortage',
          description: 'Supply lines are disrupted! Merchant prices surge.',
          icon: 'mushroom',
          effect: () => {
            this.potionShortageActive = true;
            this.updateEmergencyPrices();
          },
        },
        {
          title: "Hero's Return",
          description: 'A legendary hero visits your shop, gold overflowing!',
          icon: 'trophy',
          effect: () => {
            const hero = this.adventurerService.generateAdventurer(this.day, this.economy.dungeonDifficulty);
            hero.name = 'Legendary Hero';
            hero.level = EVENTS.HERO_LEVEL;
            hero.gold = EVENTS.HERO_GOLD;
            hero.maxHp = Math.floor(hero.maxHp * 1.5);
            hero.currentHp = hero.maxHp;
            this.shop.addCustomer(hero);
          },
        }
      );
    }

    // Variety enforcement: filter out recently triggered events
    const recentEvents = new Set(this.eventHistory.slice(-EVENTS.VARIETY_WINDOW));
    const eligibleEvents = events.filter((e) => !recentEvents.has(e.title));

    // If all events filtered, fall back to full list (shouldn't happen with enough events)
    const pickFrom = eligibleEvents.length > 0 ? eligibleEvents : events;

    const rawWeights = pickFrom.map((e) => {
      if (e.title === 'Guild Inspection' && this.economy.guilt >= GUILT.HIGH_THRESHOLD) {
        return 1 + GUILT.INSPECTION_CHANCE_BONUS_HIGH * pickFrom.length;
      }
      if (e.title === 'Haunted Shop' && this.economy.guilt < 50) {
        return 0;
      }
      if (e.title === 'Mysterious Customer' && this.mysteriousCustomerUsed) {
        return 0;
      }
      return 1;
    });

    // Remove zero-weight events to prevent them being selected by floating-point fallback
    const eligibleForPick = pickFrom.filter((_, i) => rawWeights[i] > 0);
    const finalWeights = rawWeights.filter((w) => w > 0);

    // Fall back to full pickFrom with uniform weights if everything is blocked
    const finalPool = eligibleForPick.length > 0 ? eligibleForPick : pickFrom;
    const weights = eligibleForPick.length > 0 ? finalWeights : pickFrom.map(() => 1);

    const event = this.rng.weightedPick(finalPool, weights);
    this.currentEvent = event;
    this.lastEventDay = this.day;

    // Track event in history
    this.eventHistory.push(event.title);
    if (this.eventHistory.length > EVENTS.MAX_EVENT_HISTORY) {
      this.eventHistory.shift();
    }

    event.effect();

    if (this.eventBannerTimeout) {
      clearTimeout(this.eventBannerTimeout);
      this.pendingTimeouts.delete(this.eventBannerTimeout);
    }
    // Store the new timer id so a rapid second event cancels this one (mirrors
    // the showDeathNotification pattern — a discarded safeTimeout return left
    // eventBannerTimeout unable to cancel the prior banner).
    this.eventBannerTimeout = this.safeTimeout(() => {
      this.currentEvent = null;
      this.eventBannerTimeout = null;
      this.notifyChange();
    }, TIMING.EVENT_BANNER_MS);
  }

  // ---------------------------------------------------------------------------
  // Shell game
  // ---------------------------------------------------------------------------

  onShellPotionWon(reward: ShellGameReward): void {
    const potionIdMap: Record<PotionType, string> = {
      healing: 'basic-healing',
      strength: 'strength-potion',
      defense: 'defense-potion',
      speed: 'speed-elixir',
      luck: 'luck-charm',
    };
    const potionId = potionIdMap[reward.potionType];
    const current = this.potionInventory.get(potionId) || 0;
    // Swap the Map reference rather than mutating in place. A shell-game win
    // changes no other potion-shop input, so the OnPush shop would otherwise
    // keep showing the old stock — the won potion looked like it vanished.
    // A fresh reference forces the input-changed check to re-render the count.
    this.potionInventory = new Map(this.potionInventory);
    this.potionInventory.set(potionId, current + reward.quantity);
    this.showMessage(
      `Stock rescue: +${reward.quantity} ${this.getPotionTypeLabel(reward.potionType)}${reward.quantity > 1 ? ' potions' : ' potion'}.`,
      'success'
    );
    this.notifyChange();
  }

  /**
   * Keep the counter game attached to the live shop problem. When a customer is
   * selected it stocks their class-fit potion; otherwise it rescues the lowest
   * base inventory, with catalog order providing a deterministic tie-break.
   */
  getShellRewardType(): PotionType {
    const adventurer = this.shop.selectedAdventurer;
    if (adventurer) {
      if (adventurer.currentHp / Math.max(1, adventurer.maxHp) < SHOP.HP_RECOMMEND_THRESHOLD) return 'healing';
      if (this.economy.currentFloor >= SHOP.RECOMMEND_DANGER_FLOOR) return 'healing';
      if (adventurer.class === AdventurerClass.Warrior || adventurer.class === AdventurerClass.Barbarian) {
        return 'strength';
      }
      if (adventurer.class === AdventurerClass.Paladin || adventurer.class === AdventurerClass.Cleric) {
        return 'defense';
      }
      if (adventurer.class === AdventurerClass.Rogue || adventurer.class === AdventurerClass.Ranger) {
        return 'speed';
      }
      return 'luck';
    }

    const stockByType: readonly [PotionType, string][] = [
      ['healing', 'basic-healing'],
      ['strength', 'strength-potion'],
      ['defense', 'defense-potion'],
      ['speed', 'speed-elixir'],
      ['luck', 'luck-charm'],
    ];
    let lowest = stockByType[0];
    for (const candidate of stockByType.slice(1)) {
      if ((this.potionInventory.get(candidate[1]) ?? 0) < (this.potionInventory.get(lowest[1]) ?? 0)) {
        lowest = candidate;
      }
    }
    return lowest[0];
  }

  private getPotionTypeLabel(potionType: PotionType): string {
    const labels: Record<PotionType, string> = {
      healing: 'Healing',
      strength: 'Strength',
      defense: 'Protection',
      speed: 'Speed',
      luck: 'Luck',
    };
    return labels[potionType];
  }

  // ---------------------------------------------------------------------------
  // Recommendation system
  // ---------------------------------------------------------------------------

  getRecommendedPotion(adventurer: Adventurer, priceMode: PriceMode = 'fair'): Potion | null {
    if (!adventurer) return null;

    const affordableInStock = this.availablePotions.filter((potion) => {
      const stock = this.potionInventory.get(potion.id) ?? 0;
      return stock > 0 && this.calculatePrice(potion, adventurer, priceMode) <= adventurer.gold;
    });
    if (affordableInStock.length === 0) return null;

    const fullPotions = affordableInStock.filter((potion) => !potion.isDiluted);
    const candidates = fullPotions.length > 0 ? fullPotions : affordableInStock;
    const findCandidate = (id: string): Potion | undefined => candidates.find((potion) => potion.id === id);
    const hpPercent = adventurer.currentHp / Math.max(1, adventurer.maxHp);
    // Reads the memoized forecast map (see buildForecastCacheKey) instead of
    // recomputing previewSurvivalChance()/detectCombo() per candidate below.
    const forecasts = this.getPotionForecasts(adventurer, priceMode);

    if (hpPercent < SHOP.HP_RECOMMEND_THRESHOLD) {
      const healing = findCandidate('basic-healing');
      if (healing) {
        return healing;
      }
    }

    // On dangerous floors, survival outranks class flavor: a class-fit pick can
    // leave the adventurer below the danger threshold (and feed the guilt spiral),
    // so recommend the strongest survival potion (healing) instead.
    if (this.economy.currentFloor >= SHOP.RECOMMEND_DANGER_FLOOR) {
      const healing = findCandidate('basic-healing');
      if (healing) {
        return healing;
      }
    }

    // Once the first potion is chosen, recommend the strongest available combo
    // rather than repeating the class-fit potion and hiding the loadout system.
    if (adventurer.potionsConsumed.length === 1) {
      let bestCombo: Potion | null = null;
      let bestComboScore = Number.NEGATIVE_INFINITY;
      for (const potion of candidates) {
        const forecast = forecasts.get(potion.id);
        if (!forecast || !forecast.comboName) continue;
        const score = forecast.projectedSurvival + forecast.comboSurvivalBonus;
        if (score > bestComboScore) {
          bestCombo = potion;
          bestComboScore = score;
        }
      }
      if (bestCombo) return bestCombo;
    }

    if (adventurer.class === AdventurerClass.Warrior || adventurer.class === AdventurerClass.Barbarian) {
      const strength = findCandidate('strength-potion');
      if (strength) {
        return strength;
      }
    }

    if (adventurer.class === AdventurerClass.Paladin || adventurer.class === AdventurerClass.Cleric) {
      const defense = findCandidate('defense-potion');
      if (defense) {
        return defense;
      }
    }

    if (adventurer.class === AdventurerClass.Rogue || adventurer.class === AdventurerClass.Ranger) {
      const speed = findCandidate('speed-elixir');
      if (speed) {
        return speed;
      }
    }

    if (adventurer.class === AdventurerClass.Mage || adventurer.class === AdventurerClass.Necromancer) {
      const luck = findCandidate('luck-charm');
      if (luck) {
        return luck;
      }
    }

    // A recommendation must always be actionable. Pick the available potion
    // with the strongest projected survival lift as the honest fallback.
    let best = candidates[0];
    let bestProjection = forecasts.get(best.id)?.projectedSurvival ?? Number.NEGATIVE_INFINITY;
    for (const potion of candidates.slice(1)) {
      const projection = forecasts.get(potion.id)?.projectedSurvival ?? Number.NEGATIVE_INFINITY;
      if (projection > bestProjection) {
        best = potion;
        bestProjection = projection;
      }
    }
    return best;
  }

  getPotionForecasts(adventurer: Adventurer | null, priceMode: PriceMode): ReadonlyMap<string, PotionForecast> {
    if (!adventurer) return this.EMPTY_FORECASTS;

    const key = this.buildForecastCacheKey(adventurer, priceMode);
    if (this.forecastCacheMap && this.forecastCacheKey === key) {
      return this.forecastCacheMap;
    }

    const forecasts = new Map<string, PotionForecast>();
    for (const potion of this.availablePotions) {
      forecasts.set(potion.id, this.getPotionForecast(potion, adventurer, priceMode));
    }
    this.forecastCacheKey = key;
    this.forecastCacheMap = forecasts;
    return forecasts;
  }

  getPotionForecast(potion: Potion, adventurer: Adventurer, priceMode: PriceMode = 'fair'): PotionForecast {
    const effects = this.getUpgradedEffects(potion);
    const projectedSurvival = this.dungeonSim.previewSurvivalChance(adventurer, potion, this.potionUpgrades, effects);
    const combo = this.potionCrafting.detectCombo([
      ...adventurer.potionsConsumed.map((consumed) => consumed.potionId),
      potion.id,
    ]);
    const effectiveSurvival = Math.min(1, projectedSurvival + (combo?.survivalBonus ?? 0));
    const risk: PotionForecast['risk'] =
      effectiveSurvival < DUNGEON.SURVIVAL_WARNING_THRESHOLD
        ? 'dire'
        : effectiveSurvival < DUNGEON.SURVIVAL_STEADY_THRESHOLD
          ? 'risky'
          : 'steady';

    return {
      currentSurvival: adventurer.survivalChance,
      projectedSurvival,
      survivalDelta: projectedSurvival - adventurer.survivalChance,
      risk,
      comboName: combo?.name ?? null,
      comboDescription: combo?.description ?? null,
      comboSurvivalBonus: combo?.survivalBonus ?? 0,
      budgetAfterSale: adventurer.gold - this.calculatePrice(potion, adventurer, priceMode),
    };
  }

  isRecommendationAvailable(potion: Potion): boolean {
    if (!potion) return false;

    const hasHealing = potion.effects.healing && potion.effects.healing > 0;
    const hasStrength = potion.effects.strengthBoost && potion.effects.strengthBoost > 0;
    const hasDefense = potion.effects.defenseBoost && potion.effects.defenseBoost > 0;
    const hasSpeed = potion.effects.speedBoost && potion.effects.speedBoost > 0;
    const hasLuck = potion.effects.luckBoost && potion.effects.luckBoost > 0;

    return this.availablePotions.some((p) => {
      const stock = this.potionInventory.get(p.id) ?? 0;
      if (stock <= 0) return false;

      if (hasHealing && p.effects.healing && p.effects.healing > 0) return true;
      if (hasStrength && p.effects.strengthBoost && p.effects.strengthBoost > 0) return true;
      if (hasDefense && p.effects.defenseBoost && p.effects.defenseBoost > 0) return true;
      if (hasSpeed && p.effects.speedBoost && p.effects.speedBoost > 0) return true;
      if (hasLuck && p.effects.luckBoost && p.effects.luckBoost > 0) return true;

      return false;
    });
  }

  isRecommended(potion: Potion, adventurer: Adventurer): boolean {
    const recommended = this.getRecommendedPotion(adventurer);
    return recommended?.id === potion.id;
  }

  getPriceModifier(_potion: Potion, adventurer: Adventurer): number {
    let modifier = 1;

    if (adventurer.desperate) {
      modifier *= SHOP.DESPERATE_PRICE_MULTIPLIER;
    }

    if (adventurer.frugal) {
      modifier *= SHOP.FRUGAL_PRICE_MULTIPLIER;
    }

    modifier *= 1 + this.economy.reputation / SHOP.REPUTATION_PRICE_DIVISOR;

    return modifier;
  }

  getEffectValue(baseEffect: number | undefined, quality: number): number {
    if (!baseEffect) return 0;
    return Math.floor(baseEffect * quality);
  }

  // ---------------------------------------------------------------------------
  // Pricing
  // ---------------------------------------------------------------------------

  calculatePrice(potion: Potion, adventurer: Adventurer, priceMode: PriceMode = 'fair'): number {
    return this.shop.calculatePrice(potion, adventurer, this.economy.reputation, priceMode);
  }

  private getBasePrice(potion: Potion): number {
    return Math.floor(potion.basePrice * (1 + this.economy.reputation / SHOP.REPUTATION_PRICE_DIVISOR));
  }

  private getSaleFeedbackMessage(
    potion: Potion,
    adventurer: Adventurer,
    price: number,
    priceMode: PriceMode
  ): string | null {
    const fairPrice = this.calculatePrice(potion, adventurer, 'fair');
    if (priceMode === 'mercy') {
      return `Mercy quote: ${price}g instead of ${fairPrice}g (+${PRICING.MERCY_REPUTATION_BONUS} rep)`;
    }
    if (priceMode === 'gouge') {
      const guilt = PRICING.GOUGE_GUILT + (adventurer.desperate ? PRICING.DESPERATE_GOUGE_GUILT_BONUS : 0);
      return `Gouged for ${price}g instead of ${fairPrice}g (+${guilt} guilt)`;
    }

    const basePrice = this.getBasePrice(potion);

    if (adventurer.desperate && adventurer.frugal) {
      const diff = price - basePrice;
      return `Sold for ${price}g (+${diff}g: Desperate but Frugal)`;
    } else if (adventurer.desperate) {
      const diff = price - basePrice;
      return `Sold for ${price}g (+${diff}g desperate markup)`;
    } else if (adventurer.frugal) {
      const diff = basePrice - price;
      return `Frugal haggle: ${price}g instead of ${basePrice}g (-${diff}g)`;
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Potion effects with upgrades
  // ---------------------------------------------------------------------------

  getUpgradedEffects(potion: Potion): PotionEffects {
    const baseEffects = this.potionCrafting.calculateEffects(potion);

    if (baseEffects.healing) {
      const tier = this.potionUpgrades['healing'] || 0;
      baseEffects.healing = Math.floor(baseEffects.healing * this.TIER_MULTIPLIERS[tier]);
    }
    if (baseEffects.strengthBoost) {
      const tier = this.potionUpgrades['strength'] || 0;
      baseEffects.strengthBoost = Math.floor(baseEffects.strengthBoost * this.TIER_MULTIPLIERS[tier]);
    }
    if (baseEffects.defenseBoost) {
      const tier = this.potionUpgrades['defense'] || 0;
      baseEffects.defenseBoost = Math.floor(baseEffects.defenseBoost * this.TIER_MULTIPLIERS[tier]);
    }
    if (baseEffects.speedBoost) {
      const tier = this.potionUpgrades['speed'] || 0;
      baseEffects.speedBoost = Math.floor(baseEffects.speedBoost * this.TIER_MULTIPLIERS[tier]);
    }
    if (baseEffects.luckBoost) {
      const tier = this.potionUpgrades['luck'] || 0;
      baseEffects.luckBoost = Math.floor(baseEffects.luckBoost * this.TIER_MULTIPLIERS[tier]);
    }

    return baseEffects;
  }

  // ---------------------------------------------------------------------------
  // Event helpers
  // ---------------------------------------------------------------------------

  private addDungeonEvent(event: DungeonEvent): void {
    this.eventBus.emit('dungeon', event);
  }

  private addCustomerReview(adventurer: Adventurer, survived: boolean): void {
    const review: CustomerReview = {
      id: this.nextEventId('review'),
      adventurerId: adventurer.id,
      adventurerName: adventurer.name,
      rating: survived ? this.rng.range(3, 5) : 1,
      comment: this.generateReviewComment(survived),
      potionPurchased: adventurer.potionsConsumed[0]?.name || 'nothing',
      survived,
      timestamp: Date.now(),
    };

    this.customerReviews.unshift(review);

    if (this.customerReviews.length > COLLECTIONS.CUSTOMER_REVIEW_DISPLAY_LIMIT) {
      this.customerReviews.pop();
    }
  }

  private generateReviewComment(survived: boolean): string {
    const templates = survived ? REVIEW_TEMPLATES.good : REVIEW_TEMPLATES.bad;
    return this.rng.pick(templates);
  }

  showMessage(message: string, type: 'info' | 'success' | 'warning' | 'error'): void {
    this.eventBus.emit('system', { action: 'message', message, severity: type });
  }

  toggleLogNameDisplay(): void {
    this.showFullNamesInLog = !this.showFullNamesInLog;
    this.notifyChange();
  }

  // ---------------------------------------------------------------------------
  // Save / cleanup
  // ---------------------------------------------------------------------------

  private saveGameState(): void {
    const potionInventoryObject: Record<string, number> = {};
    this.potionInventory.forEach((quantity, potionId) => {
      potionInventoryObject[potionId] = quantity;
    });

    const normalizedUpgrades = {
      healing: this.potionUpgrades['healing'] ?? 0,
      strength: this.potionUpgrades['strength'] ?? 0,
      defense: this.potionUpgrades['defense'] ?? 0,
      speed: this.potionUpgrades['speed'] ?? 0,
      luck: this.potionUpgrades['luck'] ?? 0,
    };

    // economy.toSaveState() returns Partial<GameState>; pull required fields
    // explicitly so TypeScript enforces completeness without an `as` cast.
    const econState = this.economy.toSaveState();
    const saveResult = this.gameState.saveGameState({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      gold: econState.gold ?? this.economy.gold,
      reputation: econState.reputation ?? this.economy.reputation,
      totalAdventurers: econState.totalAdventurers ?? 0,
      adventurersSaved: econState.adventurersSaved ?? 0,
      adventurersKilled: econState.adventurersKilled ?? 0,
      potionsSold: econState.potionsSold ?? 0,
      goldEarned: econState.goldEarned ?? 0,
      deathsByPotion: econState.deathsByPotion ?? 0,
      deathsByDilution: econState.deathsByDilution ?? 0,
      perfectSaves: econState.perfectSaves ?? 0,
      difficultyMultiplier: econState.difficultyMultiplier ?? 1,
      // Optional economy fields
      encountersSurvived: econState.encountersSurvived,
      bossesDefeated: econState.bossesDefeated,
      combosTriggered: econState.combosTriggered,
      guilt: econState.guilt,
      peakGuilt: econState.peakGuilt,
      maxDeathStreak: econState.maxDeathStreak,
      dilutedSold: econState.dilutedSold,
      highestFloor: econState.highestFloor,
      // Orchestrator-owned fields
      day: this.day,
      currentAdventurers: [],
      dungeonLog: this.dungeonEvents,
      deathNotifications: [],
      potionInventory: potionInventoryObject,
      potionUpgrades: normalizedUpgrades,
      shopLevel: 1,
      gameTime: this.gameTime,
      discoveredCombos: this.potionCrafting.getDiscoveredCombos(),
      rngSeed: this.rng.getState(),
      stormActive: this.stormActive,
      dragonActive: this.dragonActive,
      potionShortageActive: this.potionShortageActive,
      lastEventDay: this.lastEventDay,
      showFullNamesInLog: this.showFullNamesInLog,
      hasSeenDilutionRitual: this.hasSeenDilutionRitual,
      survivorLedger: this.survivorLedger,
      eventHistory: this.eventHistory,
    });

    if (!saveResult.success) {
      // Phase 8c — surface the recovery path for quota errors instead of a
      // generic failure message, so the user has a clear next action.
      const message = saveResult.quotaExceeded
        ? 'The ledger is full. Clear some browser storage and reload to keep saving.'
        : `The ledger wouldn't take today's entry: ${saveResult.error}`;
      this.showMessage(message, 'error');
    }
  }

  /**
   * Called from PotionStandComponent.ngOnDestroy().
   * Stops the game loop, clears all pending timeouts, and saves game state.
   */
  cleanup(): void {
    this.destroyed = true;

    this.gameLoop.stop();

    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
    }
    if (this.eventBannerTimeout) {
      clearTimeout(this.eventBannerTimeout);
    }
    if (this.deathModalTimeout) {
      clearTimeout(this.deathModalTimeout);
    }
    this.pendingTimeouts.forEach((id) => clearTimeout(id));
    this.pendingTimeouts.clear(); // Explicit cleanup

    // Drop dungeon simulation's per-adventurer combat-state cache before save.
    // Currently component-scoped (so the service dies with us) but the
    // explicit call documents intent and is robust to scope changes.
    this.dungeonSim.clearAllCombatStates();

    this.saveGameState();
    this.audio.destroy();
    this.stateChanged$.complete(); // Prevent memory leaks from stale subscriptions
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  /** Monotonically-increasing event ID — prevents duplicate @for track keys. */
  private nextEventId(prefix: string): string {
    return `${prefix}-${++this.eventSeq}`;
  }

  private safeTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const id = setTimeout(() => {
      this.pendingTimeouts.delete(id);
      if (!this.destroyed) {
        fn();
      }
    }, ms);
    this.pendingTimeouts.add(id);
    return id;
  }

  private notifyChange(): void {
    this.invalidateCache();
    this.stateChanged$.next();
  }
}
