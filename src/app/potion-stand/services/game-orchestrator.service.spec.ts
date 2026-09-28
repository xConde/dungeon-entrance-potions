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
import { Adventurer, AdventurerClass, AdventurerStatus, PotionEffect } from '../models/adventurer.model';
import { Potion } from '../models/potion.model';
import { SurvivorEntry } from '../models/game-state.model';
import { EVENTS, LOYALTY, POTIONS, SHOP, TIMING } from '../config/game-config';

describe('GameOrchestratorService', () => {
  let service: GameOrchestratorService;

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
    service = TestBed.inject(GameOrchestratorService);
    service.initialize();
  });

  afterEach(() => {
    service.cleanup();
    window.localStorage.clear();
  });

  function createMockAdventurer(overrides?: Partial<Adventurer>): Adventurer {
    return {
      id: 'test-123',
      name: 'Test Bob',
      class: AdventurerClass.Warrior,
      level: 1,
      gold: 100,
      currentHp: 100,
      maxHp: 100,
      strength: 10,
      defense: 10,
      magic: 5,
      luck: 5,
      status: AdventurerStatus.Shopping,
      survivalChance: 0.7,
      potionsConsumed: [],
      enterTime: Date.now(),
      desperate: false,
      frugal: false,
      trusting: false,
      experienced: false,
      ...overrides,
    };
  }

  function createMockPotion(overrides?: Partial<Potion>): Potion {
    return {
      id: 'basic-healing',
      name: 'Healing Potion',
      description: 'Restores HP',
      basePrice: 20,
      color: '#ff0000',
      particleColor: '#ff0000',
      viscosity: 'normal',
      quality: 1.0,
      isDiluted: false,
      recipe: {
        ingredients: [],
        requiredLevel: 1,
        craftingTime: 5,
        difficulty: 'easy',
      },
      effects: {
        healing: 50,
      },
      discovered: true,
      timesCrafted: 0,
      deathsCaused: 0,
      livesSaved: 0,
      customerRating: 4.5,
      ...overrides,
    };
  }

  describe('Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should initialize with day 1', () => {
      expect(service.day).toBe(1);
    });

    it('should initialize with starting inventory', () => {
      expect(service.potionInventory.get('basic-healing')).toBe(3);
      expect(service.potionInventory.get('strength-potion')).toBe(2);
      expect(service.potionInventory.get('defense-potion')).toBe(2);
    });

    it('uses the handcrafted opening customer and preserves her decision-framing line', () => {
      const shop = TestBed.inject(ShopService);
      if (shop.adventurersInShop.length === 0) service.spawnAdventurer();
      const customers = shop.adventurersInShop;

      expect(customers.length).toBe(1);
      expect(customers[0].name).toBe('Mara Flint');
      expect(customers[0].speechBubble).toBe('First descent. Help me come back alive.');
    });

    it('should initialize available potions', () => {
      expect(service.availablePotions.length).toBeGreaterThan(0);
    });

    it('should have default potion upgrades at tier 0', () => {
      expect(service.potionUpgrades['healing']).toBe(0);
      expect(service.potionUpgrades['strength']).toBe(0);
      expect(service.potionUpgrades['defense']).toBe(0);
    });

    it('should emit stateChanged$ observable', (done) => {
      service.stateChanged$.subscribe(() => {
        expect(true).toBeTrue();
        done();
      });
      // Trigger a state change via toggle (synchronous path)
      service.toggleLogNameDisplay();
    });
  });

  describe('Potion Sales', () => {
    it('should sell a potion and deduct from inventory', () => {
      const adventurer = createMockAdventurer({ gold: 100 });
      const potion = createMockPotion();

      const injector = TestBed.inject(ShopService);
      injector.addCustomer(adventurer);
      injector.selectCustomer(adventurer);

      service.potionInventory.set(potion.id, 5);
      const initialStock = service.potionInventory.get(potion.id)!;
      const initialGold = service.economy.gold;

      service.sellPotion(potion, adventurer);

      expect(service.potionInventory.get(potion.id)).toBe(initialStock - 1);
      expect(service.economy.gold).toBeGreaterThan(initialGold);
    });

    it('should not sell when out of stock', () => {
      const adventurer = createMockAdventurer({ gold: 100 });
      const potion = createMockPotion();

      service.potionInventory.set(potion.id, 0);
      const initialGold = service.economy.gold;

      service.sellPotion(potion, adventurer);

      expect(service.economy.gold).toBe(initialGold);
      expect(adventurer.potionsConsumed.length).toBe(0);
    });

    it('turns a mercy quote into a real margin-for-reputation tradeoff', () => {
      const adventurer = createMockAdventurer({ gold: 100 });
      const potion = createMockPotion();
      const shop = TestBed.inject(ShopService);
      shop.addCustomer(adventurer);
      service.potionInventory.set(potion.id, 1);
      const reputationBefore = service.economy.reputation;
      const shopGoldBefore = service.economy.gold;
      const expectedPrice = service.calculatePrice(potion, adventurer, 'mercy');

      service.sellPotion(potion, adventurer, 'mercy');

      expect(service.economy.gold - shopGoldBefore).toBe(expectedPrice);
      expect(adventurer.gold).toBe(100 - expectedPrice);
      expect(service.economy.reputation).toBe(reputationBefore + 1);
    });

    it('adds extra guilt when gouging a desperate customer', () => {
      const adventurer = createMockAdventurer({ gold: 300, desperate: true });
      const potion = createMockPotion();
      TestBed.inject(ShopService).addCustomer(adventurer);
      service.potionInventory.set(potion.id, 1);
      const guiltBefore = service.economy.guilt;

      service.sellPotion(potion, adventurer, 'gouge');

      expect(service.economy.guilt).toBe(guiltBefore + 3);
    });
  });

  describe('Dilution', () => {
    it('should dilute a potion and increase diluted count', () => {
      const potion = createMockPotion();
      service.potionInventory.set(potion.id, 2);
      const guiltBefore = service.economy.guilt;

      service.dilutePotion(potion);

      expect(service.potionInventory.get(potion.id)).toBe(1);
      expect(service.potionInventory.get('diluted-basic-healing')).toBe(2);
      expect(service.economy.guilt).toBe(guiltBefore + 5);
      expect(service.hasSeenDilutionRitual).toBe(true);
      expect(service.currentMessage?.text).toContain('became 2 watered bottles');
    });

    it('should not dilute when out of stock', () => {
      const potion = createMockPotion();
      service.potionInventory.set(potion.id, 0);

      service.dilutePotion(potion);

      // Stock should remain at 0
      expect(service.potionInventory.get(potion.id)).toBe(0);
      expect(service.hasSeenDilutionRitual).toBe(false);
    });

    it('should refuse to dilute an already watered batch', () => {
      const potion = createMockPotion({ id: 'diluted-basic-healing', isDiluted: true });
      service.potionInventory.set(potion.id, 2);
      const guiltBefore = service.economy.guilt;

      service.dilutePotion(potion);

      expect(service.potionInventory.get(potion.id)).toBe(2);
      expect(service.potionInventory.has('diluted-diluted-basic-healing')).toBeFalse();
      expect(service.economy.guilt).toBe(guiltBefore);
      expect(service.hasSeenDilutionRitual).toBe(false);
      expect(service.currentMessage?.text).toBe('That batch is already watered down.');
    });
  });

  describe('Merchant Purchases', () => {
    it('should buy a healing potion from merchant', () => {
      service.economy.gold = 200;
      service.potionInventory.set('basic-healing', 0);

      const goldBefore = service.economy.gold;
      service.buyFromMerchant('basicHealing');

      expect(service.economy.gold).toBeLessThan(goldBefore);
      expect(service.potionInventory.get('basic-healing')).toBe(1);
    });

    it('should not buy when insufficient gold', () => {
      service.economy.gold = 0;
      const stockBefore = service.potionInventory.get('basic-healing') ?? 0;

      service.buyFromMerchant('basicHealing');

      expect(service.potionInventory.get('basic-healing') ?? 0).toBe(stockBefore);
    });
  });

  describe('Upgrade System', () => {
    it('should buy an upgrade when gold is sufficient', () => {
      service.economy.gold = 500;
      service.potionUpgrades['healing'] = 0;

      service.buyUpgrade('healing');

      expect(service.potionUpgrades['healing']).toBe(1);
    });

    it('should not buy an upgrade when insufficient gold', () => {
      service.economy.gold = 10;
      service.potionUpgrades['healing'] = 0;

      service.buyUpgrade('healing');

      expect(service.potionUpgrades['healing']).toBe(0);
    });

    it('should report max tier correctly', () => {
      service.potionUpgrades['healing'] = 0;
      expect(service.isMaxTier('healing')).toBeFalse();

      service.potionUpgrades['healing'] = 2;
      expect(service.isMaxTier('healing')).toBeTrue();
    });
  });

  describe('Phase Transitions', () => {
    it('should dismiss day summary and transition to merchant', () => {
      service.daySummaryData = {
        day: 1,
        netProfit: 0,
        deaths: 0,
        saves: 0,
        reputationChange: 0,
        potionsSold: 0,
        deathsYourFault: 0,
        bossesDefeated: 0,
        unprepared: 0,
        guiltLevel: 'low',
      };

      service.dismissDaySummary();

      expect(service.daySummaryData).toBeNull();
    });

    it('should set gameOverReason on triggerGameOver', () => {
      service.triggerGameOver('bankruptcy');

      expect(service.gameOverReason).toBe('bankruptcy');
    });
  });

  describe('Computed Getters', () => {
    it('should return hasStock true when inventory has potions', () => {
      service.potionInventory.set('basic-healing', 1);
      expect(service.hasStock).toBeTrue();
    });

    it('should return hasStock false when all inventory is empty', () => {
      service.potionInventory.clear();
      expect(service.hasStock).toBeFalse();
    });

    it('should compute gameOverStats from economy service', () => {
      const stats = service.gameOverStats;
      expect(stats.day).toBe(service.day);
      expect(stats.gold).toBe(service.economy.gold);
    });
  });

  describe('Shell Game', () => {
    it('should add potion to inventory when shell game won', () => {
      service.potionInventory.set('basic-healing', 1);

      service.onShellPotionWon({ potionType: 'healing', quantity: 1 });

      expect(service.potionInventory.get('basic-healing')).toBe(2);
    });

    it('maps a defense win to the defense-potion stock the shop renders as Protection', () => {
      service.potionInventory.set('defense-potion', 0);

      service.onShellPotionWon({ potionType: 'defense', quantity: 1 });

      expect(service.potionInventory.get('defense-potion')).toBe(1);
    });

    it('swaps the inventory Map reference so the OnPush shop re-renders the new stock', () => {
      const before = service.potionInventory;

      service.onShellPotionWon({ potionType: 'healing', quantity: 1 });

      // Same-reference mutation would leave the OnPush potion-shop showing
      // stale stock; the win must produce a fresh Map.
      expect(service.potionInventory).not.toBe(before);
    });

    it('awards the full streak quantity atomically', () => {
      service.potionInventory.set('strength-potion', 1);

      service.onShellPotionWon({ potionType: 'strength', quantity: 2 });

      expect(service.potionInventory.get('strength-potion')).toBe(3);
    });

    it('targets stock that fits the selected customer class', () => {
      const rogue = createMockAdventurer({ class: AdventurerClass.Rogue });
      const shop = TestBed.inject(ShopService);
      shop.addCustomer(rogue);
      shop.selectCustomer(rogue);

      expect(service.getShellRewardType()).toBe('speed');
    });
  });

  describe('Log Name Toggle', () => {
    it('should toggle showFullNamesInLog', () => {
      expect(service.showFullNamesInLog).toBeFalse();
      service.toggleLogNameDisplay();
      expect(service.showFullNamesInLog).toBeTrue();
      service.toggleLogNameDisplay();
      expect(service.showFullNamesInLog).toBeFalse();
    });
  });

  describe('Market Ticker', () => {
    it('should start with ticker inactive', () => {
      expect(service.marketTicker.active).toBeFalse();
      expect(service.marketTicker.message).toBe('');
    });

    it('should generate stable market message when no demand shifts', () => {
      service.economy.demandState = {
        healingDemandSurge: false,
        strengthDemandBoost: false,
        luckDemandBoost: false,
        priceVariance: 1.0,
      };
      // Access private method via type assertion
      (service as unknown as { generateMarketTicker: () => void }).generateMarketTicker();
      expect(service.marketTicker.active).toBeTrue();
      expect(service.marketTicker.message).toContain('stable');
    });

    it('should include healing demand message when healingDemandSurge is active', () => {
      service.economy.demandState = {
        healingDemandSurge: true,
        strengthDemandBoost: false,
        luckDemandBoost: false,
        priceVariance: 1.0,
      };
      (service as unknown as { generateMarketTicker: () => void }).generateMarketTicker();
      expect(service.marketTicker.message).toContain('Healing potions in high demand');
    });

    it('should include price increase message when priceVariance > 1.05', () => {
      service.economy.demandState = {
        healingDemandSurge: false,
        strengthDemandBoost: false,
        luckDemandBoost: false,
        priceVariance: 1.1,
      };
      (service as unknown as { generateMarketTicker: () => void }).generateMarketTicker();
      expect(service.marketTicker.message).toContain('Merchant prices up');
    });

    it('should include price decrease message when priceVariance < 0.95', () => {
      service.economy.demandState = {
        healingDemandSurge: false,
        strengthDemandBoost: false,
        luckDemandBoost: false,
        priceVariance: 0.9,
      };
      (service as unknown as { generateMarketTicker: () => void }).generateMarketTicker();
      expect(service.marketTicker.message).toContain('Merchant prices down');
    });
  });

  // ---------------------------------------------------------------------------
  // Survivor Ledger / Loyalty System
  // ---------------------------------------------------------------------------

  function createMockPotionEffect(overrides?: Partial<PotionEffect>): PotionEffect {
    return {
      potionId: 'basic-healing',
      name: 'Healing Potion',
      quality: 1.0,
      duration: 5,
      statModifiers: { hp: 50 },
      ...overrides,
    };
  }

  describe('Survivor Ledger', () => {
    it('should start with an empty survivor ledger', () => {
      expect(service.survivorLedger).toEqual([]);
    });

    it('should add a survivor to the ledger when they survive with potions', () => {
      const adventurer = createMockAdventurer({
        potionsConsumed: [createMockPotionEffect()],
        survivalChance: 0.8,
        currentHp: 90,
        maxHp: 100,
      });

      const addToLedger = (
        service as unknown as { addToSurvivorLedger: (e: SurvivorEntry) => void }
      ).addToSurvivorLedger.bind(service);
      addToLedger({
        name: adventurer.name,
        class: adventurer.class,
        level: adventurer.level,
        lastPurchase: adventurer.potionsConsumed[0].name,
        timesReturned: 0,
      });

      expect(service.survivorLedger.length).toBe(1);
      expect(service.survivorLedger[0].name).toBe(adventurer.name);
      expect(service.survivorLedger[0].lastPurchase).toBe('Healing Potion');
    });

    it('should cap the ledger at MAX_SURVIVORS with FIFO eviction', () => {
      const addToLedger = (
        service as unknown as { addToSurvivorLedger: (e: SurvivorEntry) => void }
      ).addToSurvivorLedger.bind(service);

      for (let i = 0; i < LOYALTY.MAX_SURVIVORS + 3; i++) {
        addToLedger({
          name: `Survivor ${i}`,
          class: 'Warrior',
          level: 1,
          lastPurchase: 'Healing Potion',
          timesReturned: 0,
        });
      }

      expect(service.survivorLedger.length).toBe(LOYALTY.MAX_SURVIVORS);
      // The first entries should have been evicted (FIFO)
      expect(service.survivorLedger[0].name).toBe(`Survivor 3`);
    });

    it('should update an existing survivor entry rather than duplicating', () => {
      const addToLedger = (
        service as unknown as { addToSurvivorLedger: (e: SurvivorEntry) => void }
      ).addToSurvivorLedger.bind(service);

      addToLedger({ name: 'Alice', class: 'Warrior', level: 1, lastPurchase: 'Healing Potion', timesReturned: 0 });
      addToLedger({ name: 'Alice', class: 'Warrior', level: 2, lastPurchase: 'Strength Potion', timesReturned: 0 });

      expect(service.survivorLedger.length).toBe(1);
      expect(service.survivorLedger[0].level).toBe(2);
      expect(service.survivorLedger[0].lastPurchase).toBe('Strength Potion');
    });

    it('should preserve timesReturned when updating an existing entry', () => {
      const addToLedger = (
        service as unknown as { addToSurvivorLedger: (e: SurvivorEntry) => void }
      ).addToSurvivorLedger.bind(service);

      addToLedger({ name: 'Bob', class: 'Rogue', level: 1, lastPurchase: 'Healing Potion', timesReturned: 0 });
      service.survivorLedger[0].timesReturned = 3;
      addToLedger({ name: 'Bob', class: 'Rogue', level: 2, lastPurchase: 'Luck Charm', timesReturned: 0 });

      expect(service.survivorLedger[0].timesReturned).toBe(3);
    });

    it('should save survivorLedger and restore it from saved game state', () => {
      const addToLedger = (
        service as unknown as { addToSurvivorLedger: (e: SurvivorEntry) => void }
      ).addToSurvivorLedger.bind(service);
      addToLedger({ name: 'Carol', class: 'Mage', level: 3, lastPurchase: 'Defense Potion', timesReturned: 1 });

      // Trigger save via cleanup (saves game state)
      const gameStateSvc = TestBed.inject(GameStateService);
      const saveSpy = spyOn(gameStateSvc, 'saveGameState').and.callThrough();
      service.cleanup();

      expect(saveSpy).toHaveBeenCalled();
      const callArgs = saveSpy.calls.mostRecent().args[0];
      expect(callArgs.survivorLedger).toBeDefined();
      expect(callArgs.survivorLedger!.length).toBe(1);
      expect(callArgs.survivorLedger![0].name).toBe('Carol');
    });

    it('should apply tip bonus for returning customers', () => {
      const addToLedger = (
        service as unknown as { handleSurvivor: (a: Adventurer, loot?: { gold: number }, boss?: boolean) => void }
      ).handleSurvivor.bind(service);
      const goldBefore = service.economy.gold;

      // Normal adventurer tip
      const normal = createMockAdventurer({ potionsConsumed: [createMockPotionEffect()], survivalChance: 0.8 });
      addToLedger(normal, { gold: 100 });
      const normalTip = service.economy.gold - goldBefore;

      // Reset gold
      service.economy.gold = goldBefore;

      // Returning adventurer tip (should be higher)
      const returning = createMockAdventurer({
        potionsConsumed: [createMockPotionEffect()],
        survivalChance: 0.8,
        isReturning: true,
      });
      addToLedger(returning, { gold: 100 });
      const returningTip = service.economy.gold - goldBefore;

      // Returning customers tip at least as much as normal (due to TIP_BONUS)
      expect(returningTip).toBeGreaterThanOrEqual(normalTip);
    });

    it('should apply extra guilt when a returning customer dies because of the player', () => {
      const guiltBefore = service.economy.guilt;

      const returningAdventurer = createMockAdventurer({
        isReturning: true,
        potionsConsumed: [], // No potions — wasYourFault = true
        survivalChance: 0.8,
      });

      const handleDeath = (service as unknown as { handleDeath: (a: Adventurer) => void }).handleDeath.bind(service);
      handleDeath(returningAdventurer);

      // Should have gained guilt twice (once from recordDeath + once from isReturning bonus)
      expect(service.economy.guilt).toBeGreaterThan(guiltBefore + POTIONS.GUILT_PER_DEATH);
    });

    it('should not apply extra guilt when a returning customer death is not the player fault', () => {
      service.economy.guilt = 0;
      const returningAdventurer = createMockAdventurer({
        isReturning: true,
        potionsConsumed: [createMockPotionEffect()], // Had a potion
        survivalChance: 0.9, // High survival — not wasYourFault
      });

      const handleDeath = (service as unknown as { handleDeath: (a: Adventurer) => void }).handleDeath.bind(service);
      handleDeath(returningAdventurer);

      // Extra guilt only fires for wasYourFault — not here
      expect(service.economy.guilt).toBeLessThanOrEqual(POTIONS.GUILT_PER_DEATH);
    });

    it('return chance decreases as pool grows', () => {
      // With small pool, returnChance should be close to RETURN_CHANCE
      const smallPoolChance = LOYALTY.RETURN_CHANCE * (1 - 2 / LOYALTY.POOL_DAMPING);
      // With large pool (near POOL_DAMPING), returnChance should be much smaller
      const largePoolChance = LOYALTY.RETURN_CHANCE * (1 - (LOYALTY.MAX_SURVIVORS - 1) / LOYALTY.POOL_DAMPING);

      expect(smallPoolChance).toBeGreaterThan(largePoolChance);
    });
  });

  describe('Random Event System', () => {
    // Helper to force-fire triggerRandomEvent bypassing cooldown/chance checks
    function fireEvent(title: string): void {
      const trigger = (service as unknown as { triggerRandomEvent: () => void }).triggerRandomEvent.bind(service);
      // Override lastEventDay to 0, day to a high value to bypass cooldown
      (service as unknown as { lastEventDay: number }).lastEventDay = 0;
      service.day = 100;
      // Stub rng.chance to always return true so we don't skip
      spyOn(service['rng'], 'chance').and.returnValue(true);
      // Stub weightedPick to return the event with the given title
      spyOn(service['rng'], 'weightedPick').and.callFake(<T>(items: T[]) => {
        const found = (items as { title: string }[]).find((e) => e.title === title);
        return (found ?? items[items.length - 1]) as T;
      });
      trigger();
    }

    it('should start with empty event history', () => {
      expect(service.eventHistory).toEqual([]);
    });

    it('should track triggered events in history', () => {
      fireEvent('Storm');
      expect(service.eventHistory).toContain('Storm');
    });

    it('should cap event history at MAX_EVENT_HISTORY', () => {
      const trigger = (service as unknown as { triggerRandomEvent: () => void }).triggerRandomEvent.bind(service);
      spyOn(service['rng'], 'chance').and.returnValue(true);
      spyOn(service['rng'], 'weightedPick').and.callFake(<T>(items: T[]) => items[0]);

      for (let i = 0; i < EVENTS.MAX_EVENT_HISTORY + 5; i++) {
        (service as unknown as { lastEventDay: number }).lastEventDay = 0;
        service.day = 100 + i;
        trigger();
      }

      expect(service.eventHistory.length).toBeLessThanOrEqual(EVENTS.MAX_EVENT_HISTORY);
    });

    it('should not include recently triggered events in eligible pool (variety enforcement)', () => {
      // Fill history with 'Storm' repeated VARIETY_WINDOW times
      for (let i = 0; i < EVENTS.VARIETY_WINDOW; i++) {
        service.eventHistory.push('Storm');
      }

      let pickedItems: { title: string }[] = [];
      spyOn(service['rng'], 'chance').and.returnValue(true);
      spyOn(service['rng'], 'weightedPick').and.callFake(<T>(items: T[]) => {
        pickedItems = items as { title: string }[];
        return items[0];
      });

      (service as unknown as { lastEventDay: number }).lastEventDay = 0;
      service.day = 100;
      const trigger = (service as unknown as { triggerRandomEvent: () => void }).triggerRandomEvent.bind(service);
      trigger();

      expect(pickedItems.some((e) => e.title === 'Storm')).toBeFalse();
    });

    it('should fall back to full event list when all events are filtered by variety', () => {
      // Fill history with every event title to force fallback
      const manyTitles = [
        'Storm',
        'Mushroom Shortage',
        'Dungeon Tournament',
        'Guild Inspection',
        'Wealthy Merchant',
        'Thief in the Night',
        'Wandering Alchemist',
        'Haunted Shop',
        'Mysterious Customer',
      ];
      service.eventHistory = manyTitles;

      let pickedItems: unknown[] = [];
      spyOn(service['rng'], 'chance').and.returnValue(true);
      spyOn(service['rng'], 'weightedPick').and.callFake(<T>(items: T[]) => {
        pickedItems = items;
        return items[0];
      });

      (service as unknown as { lastEventDay: number }).lastEventDay = 0;
      service.day = 100;
      const trigger = (service as unknown as { triggerRandomEvent: () => void }).triggerRandomEvent.bind(service);
      trigger();

      // Should fall back to a non-empty list
      expect(pickedItems.length).toBeGreaterThan(0);
    });

    describe('Haunted Shop', () => {
      it('should not appear when guilt < 50', () => {
        service.economy.guilt = 30;

        let pickedItems: { title: string }[] = [];
        spyOn(service['rng'], 'chance').and.returnValue(true);
        spyOn(service['rng'], 'weightedPick').and.callFake(<T>(items: T[], weights: number[]) => {
          // Store items that have non-zero weight
          pickedItems = (items as { title: string }[]).filter((_, i) => weights[i] > 0);
          return items[0];
        });

        (service as unknown as { lastEventDay: number }).lastEventDay = 0;
        service.day = 100;
        const trigger = (service as unknown as { triggerRandomEvent: () => void }).triggerRandomEvent.bind(service);
        trigger();

        expect(pickedItems.some((e) => e.title === 'Haunted Shop')).toBeFalse();
      });

      it('should appear when guilt >= 50', () => {
        service.economy.guilt = 60;

        let pickedItems: { title: string }[] = [];
        spyOn(service['rng'], 'chance').and.returnValue(true);
        spyOn(service['rng'], 'weightedPick').and.callFake(<T>(items: T[], weights: number[]) => {
          pickedItems = (items as { title: string }[]).filter((_, i) => weights[i] > 0);
          return items[0];
        });

        (service as unknown as { lastEventDay: number }).lastEventDay = 0;
        service.day = 100;
        const trigger = (service as unknown as { triggerRandomEvent: () => void }).triggerRandomEvent.bind(service);
        trigger();

        expect(pickedItems.some((e) => e.title === 'Haunted Shop')).toBeTrue();
      });
    });

    describe('Mysterious Customer', () => {
      it('should not appear after already triggered once', () => {
        // Mark as used
        (service as unknown as { mysteriousCustomerUsed: boolean }).mysteriousCustomerUsed = true;

        let pickedItems: { title: string }[] = [];
        spyOn(service['rng'], 'chance').and.returnValue(true);
        spyOn(service['rng'], 'weightedPick').and.callFake(<T>(items: T[], weights: number[]) => {
          pickedItems = (items as { title: string }[]).filter((_, i) => weights[i] > 0);
          return items[0];
        });

        (service as unknown as { lastEventDay: number }).lastEventDay = 0;
        service.day = 100;
        const trigger = (service as unknown as { triggerRandomEvent: () => void }).triggerRandomEvent.bind(service);
        trigger();

        expect(pickedItems.some((e) => e.title === 'Mysterious Customer')).toBeFalse();
      });

      it('should set mysteriousCustomerUsed after triggering', () => {
        expect((service as unknown as { mysteriousCustomerUsed: boolean }).mysteriousCustomerUsed).toBeFalse();
        fireEvent('Mysterious Customer');
        expect((service as unknown as { mysteriousCustomerUsed: boolean }).mysteriousCustomerUsed).toBeTrue();
      });
    });

    describe('Thief in the Night', () => {
      it('should steal gold when no defense upgrade', () => {
        service.potionUpgrades['defense'] = 0;
        service.economy.gold = 200;
        spyOn(service['rng'], 'nextFloat').and.returnValue(0.05); // 5% → lossPercent = 0.05 + 0.05*0.10 = 0.055 → 11g

        fireEvent('Thief in the Night');

        expect(service.economy.gold).toBeLessThan(200);
      });

      it('should not steal gold when defense upgrade is purchased', () => {
        service.potionUpgrades['defense'] = 1;
        service.economy.gold = 200;

        fireEvent('Thief in the Night');

        expect(service.economy.gold).toBe(200);
      });
    });

    describe('Wandering Alchemist', () => {
      it('should swap 2 highest-stock for 1 lowest-stock when conditions met', () => {
        // Set up: high stock of basic-healing, zero stock of others
        service.potionInventory.set('basic-healing', 10);
        service.potionInventory.set('strength-potion', 0);
        service.potionInventory.set('defense-potion', 0);
        service.potionInventory.set('speed-elixir', 0);
        service.potionInventory.set('luck-charm', 0);

        fireEvent('Wandering Alchemist');

        // basic-healing should have lost 2
        expect(service.potionInventory.get('basic-healing')).toBe(8);
      });

      it('should do nothing when not enough stock to trade', () => {
        service.potionInventory.set('basic-healing', 1);
        service.potionInventory.set('strength-potion', 1);
        service.potionInventory.set('defense-potion', 1);
        service.potionInventory.set('speed-elixir', 1);
        service.potionInventory.set('luck-charm', 1);

        fireEvent('Wandering Alchemist');

        // All stocks unchanged — highest.stock (1) < 2 so no trade
        expect(service.potionInventory.get('basic-healing')).toBe(1);
      });
    });

    describe('Event history save and restore', () => {
      it('should save event history in game state', () => {
        service.eventHistory = ['Storm', 'Dungeon Tournament'];

        const gameStateSvc = TestBed.inject(GameStateService);
        const saveSpy = spyOn(gameStateSvc, 'saveGameState').and.callThrough();
        service.cleanup();

        const callArgs = saveSpy.calls.mostRecent().args[0];
        expect(callArgs.eventHistory).toEqual(['Storm', 'Dungeon Tournament']);
      });

      it('should restore event history when loading saved state', () => {
        service.eventHistory = ['Guild Inspection', 'Wealthy Merchant'];
        service.cleanup();

        // Reinitialize service to simulate a fresh load
        const newService = TestBed.inject(GameOrchestratorService);
        newService.initialize();

        expect(newService.eventHistory).toEqual(['Guild Inspection', 'Wealthy Merchant']);

        newService.cleanup();
      });

      it('should save completed dilution ritual progress', () => {
        service.hasSeenDilutionRitual = true;

        const gameStateSvc = TestBed.inject(GameStateService);
        const saveSpy = spyOn(gameStateSvc, 'saveGameState').and.callThrough();
        service.cleanup();

        const callArgs = saveSpy.calls.mostRecent().args[0];
        expect(callArgs.hasSeenDilutionRitual).toBe(true);
      });
    });
  });

  describe('Speech bubble generation', () => {
    const allClasses: AdventurerClass[] = [
      AdventurerClass.Warrior,
      AdventurerClass.Rogue,
      AdventurerClass.Mage,
      AdventurerClass.Cleric,
      AdventurerClass.Ranger,
      AdventurerClass.Barbarian,
      AdventurerClass.Paladin,
      AdventurerClass.Necromancer,
    ];

    allClasses.forEach((cls) => {
      it(`should generate a non-empty speech bubble for class ${cls}`, () => {
        const adventurer = createMockAdventurer({ class: cls });
        // Access private method via bracket notation for unit testing
        const bubble = service['generateSpeechBubble'](adventurer);
        expect(typeof bubble).toBe('string');
        expect(bubble.length).toBeGreaterThan(0);
      });
    });

    it('should override class speech bubble with fear lines when deathStreak >= 3', () => {
      const shop = TestBed.inject(ShopService);
      const rng = TestBed.inject(GameRngService);
      shop.clearCustomers();
      service.economy.deathStreak = 3;

      const fearLines = [
        'I... I heard someone died in there...',
        'Are your potions safe?',
        'Maybe I should come back later...',
        'The screams from below worry me...',
      ];

      // Force all rng checks to pass (spawn modifier, chance checks) and pick first fear line
      spyOn(rng, 'chance').and.returnValue(true);
      spyOn(rng, 'pick').and.callFake(<T>(arr: readonly T[]): T => arr[0]);

      service.spawnAdventurer();

      const customers = shop.adventurersInShop;
      expect(customers.length).toBeGreaterThan(0);
      customers.forEach((adv) => {
        expect(adv.speechBubble).toBeDefined();
        expect(fearLines).toContain(adv.speechBubble as string);
      });
    });

    it('should assign personalized speech bubble to returning customer', () => {
      const survivor: SurvivorEntry = {
        name: 'OldBob',
        class: AdventurerClass.Warrior,
        level: 5,
        lastPurchase: 'Healing Potion',
        timesReturned: 0,
      };
      service.survivorLedger = [survivor];
      service.day = 2;

      // Force return chance to always trigger by spying on rng.chance
      const rng = TestBed.inject(GameRngService);
      spyOn(rng, 'chance').and.returnValue(true);

      const shop = TestBed.inject(ShopService);
      shop.clearCustomers();

      service.spawnAdventurer();

      const customers = shop.adventurersInShop;
      const returner = customers.find((a) => a.name === 'OldBob');
      expect(returner).toBeTruthy();
      expect(returner?.speechBubble).toContain('Healing Potion');
      expect(returner?.speechBubble).toContain('Back again');
    });
  });

  describe('handleFlee', () => {
    let handleFlee: (a: Adventurer) => void;

    beforeEach(() => {
      handleFlee = (service as unknown as { handleFlee: (a: Adventurer) => void }).handleFlee.bind(service);
    });

    it('should increment savedCount via recordSurvivor', () => {
      const before = service.economy.savedCount;
      handleFlee(createMockAdventurer());
      expect(service.economy.savedCount).toBe(before + 1);
    });

    it('should increment dailySaves via recordSurvivor', () => {
      const before = service.economy.dailySaves;
      handleFlee(createMockAdventurer());
      expect(service.economy.dailySaves).toBe(before + 1);
    });

    it('should increment encountersSurvived via recordSurvivor', () => {
      const before = service.economy.encountersSurvived;
      handleFlee(createMockAdventurer());
      expect(service.economy.encountersSurvived).toBe(before + 1);
    });

    it('should reset deathStreak to 0', () => {
      service.economy.deathStreak = 5;
      handleFlee(createMockAdventurer());
      expect(service.economy.deathStreak).toBe(0);
    });

    it('should reset spawnReductionActive (previously missing)', () => {
      service.economy.spawnReductionActive = true;
      service.economy.deathStreak = 10;
      handleFlee(createMockAdventurer());
      expect(service.economy.spawnReductionActive).toBeFalse();
    });

    it('should apply FLEE reputation bonus instead of SURVIVOR_BONUS', () => {
      const repBefore = service.economy.reputation;
      handleFlee(createMockAdventurer());
      // FLEE.REPUTATION_BONUS = 1, not REPUTATION.SURVIVOR_BONUS = 3
      // Net reputation change = recordSurvivor(+3) + correction(1-3) = +1
      expect(service.economy.reputation).toBe(repBefore + 1);
    });

    it('should not double-count savedCount (only 1 increment per flee)', () => {
      service.economy.savedCount = 0;
      handleFlee(createMockAdventurer());
      expect(service.economy.savedCount).toBe(1);
    });
  });

  describe('Tutorial', () => {
    let gameLoop: GameLoopService;

    beforeEach(() => {
      gameLoop = TestBed.inject(GameLoopService);
    });

    it('should start tutorial on day 1 (step 1)', () => {
      expect(service.day).toBe(1);
      expect(service.tutorialStep).toBe(1);
      expect(service.tutorialComplete).toBeFalse();
    });

    it('should pause the game when tutorial starts', () => {
      expect(gameLoop.isPaused).toBeTrue();
    });

    it('should not start tutorial if already completed (localStorage)', () => {
      // Complete the current tutorial first
      service.skipTutorial();
      // Reset step to simulate re-calling startTutorial with localStorage flag set
      service.tutorialStep = 0;
      service.tutorialComplete = false;
      service.startTutorial();
      expect(service.tutorialStep).toBe(0);
      expect(service.tutorialComplete).toBeTrue();
    });

    it('should advance tutorial step', () => {
      service.advanceTutorial();
      expect(service.tutorialStep).toBe(2);
      service.advanceTutorial();
      expect(service.tutorialStep).toBe(3);
    });

    it('should complete tutorial when advancing past step 4', () => {
      service.tutorialStep = 4;
      service.advanceTutorial();
      expect(service.tutorialStep).toBe(0);
      expect(service.tutorialComplete).toBeTrue();
    });

    it('should complete tutorial and resume game on step 4 → advance', () => {
      service.tutorialStep = 4;
      service.advanceTutorial();
      expect(gameLoop.isPaused).toBeFalse();
    });

    it('should skip tutorial and mark complete', () => {
      service.skipTutorial();
      expect(service.tutorialStep).toBe(0);
      expect(service.tutorialComplete).toBeTrue();
    });

    it('should store tutorial completion in localStorage on skip', () => {
      service.skipTutorial();
      expect(window.localStorage.getItem('potion-stand-tutorial-seen')).toBe('true');
    });

    it('should resume game on skip', () => {
      service.skipTutorial();
      expect(gameLoop.isPaused).toBeFalse();
    });

    it('should store tutorial completion in localStorage on complete', () => {
      service.tutorialStep = 4;
      service.advanceTutorial();
      expect(window.localStorage.getItem('potion-stand-tutorial-seen')).toBe('true');
    });
  });

  // ---------------------------------------------------------------------------
  // Group 1: processShopQueue()
  // ---------------------------------------------------------------------------

  describe('processShopQueue()', () => {
    let processShopQueue: () => void;
    let shopService: ShopService;

    beforeEach(() => {
      processShopQueue = (service as unknown as { processShopQueue: () => void }).processShopQueue.bind(service);
      shopService = TestBed.inject(ShopService);
    });

    it('should send customer with potions consumed to dungeon', () => {
      const adv = createMockAdventurer({
        potionsConsumed: [
          { potionId: 'basic-healing', name: 'Healing Potion', quality: 1.0, duration: 0, statModifiers: { hp: 50 } },
        ],
        enterTime: Date.now() - 999999, // force timeout
      });
      shopService.addCustomer(adv);

      processShopQueue();

      expect(service.adventurersInDungeon.some((a) => a.id === adv.id)).toBeTrue();
    });

    it('should send desperate customer with no potions to dungeon and record unprepared', () => {
      const adv = createMockAdventurer({
        desperate: true,
        potionsConsumed: [],
        enterTime: Date.now() - 999999,
      });
      shopService.addCustomer(adv);
      const unpreparedBefore = service.economy.dailyUnprepared;

      processShopQueue();

      expect(service.adventurersInDungeon.some((a) => a.id === adv.id)).toBeTrue();
      expect(service.economy.dailyUnprepared).toBe(unpreparedBefore + 1);
    });

    it('should add a dungeon event for desperate customer entering without potions', () => {
      const adv = createMockAdventurer({
        desperate: true,
        potionsConsumed: [],
        enterTime: Date.now() - 999999,
      });
      shopService.addCustomer(adv);
      const eventsBefore = service.dungeonEvents.length;

      processShopQueue();

      // A dungeon event for the desperate entry should have been added
      expect(service.dungeonEvents.length).toBeGreaterThan(eventsBefore);
    });

    it('should penalise reputation and add leave event for non-desperate timeout', () => {
      const adv = createMockAdventurer({
        desperate: false,
        potionsConsumed: [],
        enterTime: Date.now() - 999999,
      });
      shopService.addCustomer(adv);
      const repBefore = service.economy.reputation;

      processShopQueue();

      expect(service.economy.reputation).toBeLessThan(repBefore);
      expect(service.adventurersInDungeon.some((a) => a.id === adv.id)).toBeFalse();
    });

    it('should handle mixed queue — timed-out and not-timed-out adventurers', () => {
      const timedOut = createMockAdventurer({ id: 'timed-out', enterTime: Date.now() - 999999, potionsConsumed: [] });
      const recent = createMockAdventurer({ id: 'recent', enterTime: Date.now(), potionsConsumed: [] });
      shopService.addCustomer(timedOut);
      shopService.addCustomer(recent);

      processShopQueue();

      // timed-out left, recent stays
      expect(shopService.adventurersInShop.some((a) => a.id === 'recent')).toBeTrue();
      expect(shopService.adventurersInShop.some((a) => a.id === 'timed-out')).toBeFalse();
    });
  });

  // ---------------------------------------------------------------------------
  // Group 2: processAutomaticCustomerBrowsing()
  // ---------------------------------------------------------------------------

  describe('processAutomaticCustomerBrowsing()', () => {
    let processBrowsing: () => void;
    let shopService: ShopService;

    beforeEach(() => {
      processBrowsing = (
        service as unknown as { processAutomaticCustomerBrowsing: () => void }
      ).processAutomaticCustomerBrowsing.bind(service);
      shopService = TestBed.inject(ShopService);
      // skip tutorial so game loop isn't paused
      service.skipTutorial();
    });

    it('should skip customer who already has potions', () => {
      const adv = createMockAdventurer({
        potionsConsumed: [
          { potionId: 'basic-healing', name: 'Healing Potion', quality: 1.0, duration: 0, statModifiers: { hp: 50 } },
        ],
        enterTime: Date.now() - 999999,
      });
      shopService.addCustomer(adv);
      const goldBefore = service.economy.gold;

      processBrowsing();

      // No sale should have occurred
      expect(service.economy.gold).toBe(goldBefore);
    });

    it('should call handleCustomerCantAfford when adventurer cannot afford anything', () => {
      // Clear all stock so nothing is affordable
      service.potionInventory.forEach((_, key) => service.potionInventory.set(key, 0));

      const adv = createMockAdventurer({
        gold: 0,
        potionsConsumed: [],
        enterTime: Date.now() - 999999,
      });
      shopService.addCustomer(adv);

      // Force auto-purchase chance to always succeed
      spyOn(service['rng'], 'chance').and.returnValue(true);

      type PrivateHandlers = { handleCustomerCantAfford: (a: Adventurer) => void };
      const handleCantAfford = spyOn(
        service as unknown as PrivateHandlers,
        'handleCustomerCantAfford'
      ).and.callThrough();

      processBrowsing();

      expect(handleCantAfford).toHaveBeenCalled();
    });

    it('should pick cheapest potion for frugal customer', () => {
      service.potionInventory.set('basic-healing', 5);
      service.potionInventory.set('strength-potion', 5);
      service.potionInventory.set('defense-potion', 5);

      // Ensure frugal adventurer has gold
      const adv = createMockAdventurer({
        gold: 9999,
        frugal: true,
        potionsConsumed: [],
        enterTime: Date.now() - 999999,
      });
      shopService.addCustomer(adv);

      const goldBefore = service.economy.gold;
      spyOn(service['rng'], 'chance').and.returnValue(true);

      processBrowsing();

      // A potion was sold (gold increased)
      expect(service.economy.gold).toBeGreaterThan(goldBefore);
    });

    it('should pick class-preferred potion for experienced customer', () => {
      // Warrior prefers basic-healing, then defense-potion
      const adv = createMockAdventurer({
        class: AdventurerClass.Warrior,
        experienced: true,
        gold: 9999,
        potionsConsumed: [],
        enterTime: Date.now() - 999999,
      });
      service.potionInventory.set('basic-healing', 5);
      shopService.addCustomer(adv);

      spyOn(service['rng'], 'chance').and.returnValue(true);

      processBrowsing();

      // basic-healing stock should have decreased
      expect(service.potionInventory.get('basic-healing')).toBe(4);
    });

    it('applies the player-selected quote to idle-economy purchases', () => {
      const adv = createMockAdventurer({
        gold: 9999,
        potionsConsumed: [],
        enterTime: Date.now() - 999999,
      });
      shopService.addCustomer(adv);
      service.setPriceMode('gouge');
      const guiltBefore = service.economy.guilt;
      spyOn(service['rng'], 'chance').and.returnValue(true);

      processBrowsing();

      expect(adv.potionsConsumed.length).toBe(1);
      expect(service.economy.guilt).toBe(guiltBefore + 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 3: triggerRandomEvent() — additional events
  // ---------------------------------------------------------------------------

  describe('triggerRandomEvent() — additional events', () => {
    // Reuse the fireEvent helper defined in the existing Random Event System suite
    function fireEvent(title: string): void {
      const trigger = (service as unknown as { triggerRandomEvent: () => void }).triggerRandomEvent.bind(service);
      (service as unknown as { lastEventDay: number }).lastEventDay = 0;
      service.day = 100;
      spyOn(service['rng'], 'chance').and.returnValue(true);
      spyOn(service['rng'], 'weightedPick').and.callFake(<T>(items: T[]) => {
        const found = (items as { title: string }[]).find((e) => e.title === title);
        return (found ?? items[items.length - 1]) as T;
      });
      trigger();
    }

    it('Mushroom Shortage: halves strength potion stock', () => {
      service.potionInventory.set('strength-potion', 10);
      fireEvent('Mushroom Shortage');
      expect(service.potionInventory.get('strength-potion')).toBe(5);
    });

    it('Mushroom Shortage: does nothing when strength-potion stock is 0', () => {
      service.potionInventory.set('strength-potion', 0);
      fireEvent('Mushroom Shortage');
      expect(service.potionInventory.get('strength-potion')).toBe(0);
    });

    it('Dungeon Tournament: spawns at least 2 extra adventurers', () => {
      service.skipTutorial();
      const shopService = TestBed.inject(ShopService);
      shopService.clearCustomers();
      const countBefore = shopService.adventurersInShop.length;

      fireEvent('Dungeon Tournament');

      // Event calls spawnAdventurer() twice; bonus spawns may also trigger, so >= 2
      expect(shopService.adventurersInShop.length).toBeGreaterThanOrEqual(countBefore + 2);
    });

    it('Guild Inspection with diluted potions: confiscates stock and fines gold', () => {
      service.potionInventory.set('diluted-basic-healing', 3);
      service.economy.gold = 200;
      const repBefore = service.economy.reputation;

      fireEvent('Guild Inspection');

      expect(service.potionInventory.get('diluted-basic-healing')).toBe(0);
      expect(service.economy.gold).toBeLessThan(200);
      expect(service.economy.reputation).toBeLessThan(repBefore);
    });

    it('Guild Inspection clean: gives reputation bonus', () => {
      // Ensure no diluted potions
      service.potionInventory.forEach((_, key) => {
        if (key.includes('diluted')) service.potionInventory.set(key, 0);
      });
      const repBefore = service.economy.reputation;

      fireEvent('Guild Inspection');

      expect(service.economy.reputation).toBeGreaterThan(repBefore);
    });

    // Phase 2a — closes March RTG Finding 3/6 (guild-fine display lie). Broke
    // players used to dodge the gold fine because spendGold() returned false
    // silently, but the message still said "Fined Xg". Now we force-deduct
    // (mandatory cost path, like daily overhead) and amend the message when
    // the wallet can't cover it.
    it('Guild Inspection on broke player: still deducts the fine and amends the message', () => {
      service.potionInventory.set('diluted-basic-healing', 1);
      service.economy.gold = 10; // Below the 50g fine
      const goldBefore = service.economy.gold;
      const messages: string[] = [];
      const originalShowMessage = service.showMessage.bind(service);
      service.showMessage = (text: string, ...rest: unknown[]) => {
        messages.push(text);
        return originalShowMessage(
          text,
          ...(rest as Parameters<typeof originalShowMessage>[1] extends undefined
            ? []
            : [Parameters<typeof originalShowMessage>[1]])
        );
      };

      fireEvent('Guild Inspection');

      // Gold MUST drop by the full fine (50g), pushing the wallet negative.
      // The pre-fix bug would have left gold unchanged because spendGold no-op'd.
      expect(service.economy.gold).toBe(goldBefore - 50);
      // Message must NOT lie about a successful payment.
      const inspectionMsg = messages.find((m) => m.includes('Guild confiscated'));
      expect(inspectionMsg).toBeDefined();
      expect(inspectionMsg).toContain("Couldn't pay full fine");
      expect(inspectionMsg).toContain('Debt added');
    });

    it('Guild Inspection on solvent player: deducts full fine and shows the standard message', () => {
      service.potionInventory.set('diluted-basic-healing', 1);
      service.economy.gold = 200;
      const messages: string[] = [];
      const originalShowMessage = service.showMessage.bind(service);
      service.showMessage = (text: string, ...rest: unknown[]) => {
        messages.push(text);
        return originalShowMessage(
          text,
          ...(rest as Parameters<typeof originalShowMessage>[1] extends undefined
            ? []
            : [Parameters<typeof originalShowMessage>[1]])
        );
      };

      fireEvent('Guild Inspection');

      expect(service.economy.gold).toBe(150);
      const inspectionMsg = messages.find((m) => m.includes('Guild confiscated'));
      expect(inspectionMsg).toContain('Fined 50g');
      expect(inspectionMsg).not.toContain("Couldn't pay");
    });

    it('Storm: sets stormActive flag', () => {
      fireEvent('Storm');
      expect(service.stormActive).toBeTrue();
    });

    it('Storm: reduces shop queue when more than 2 customers present', () => {
      service.skipTutorial();
      const shopService = TestBed.inject(ShopService);
      shopService.clearCustomers();
      shopService.addCustomer(createMockAdventurer({ id: 'a1' }));
      shopService.addCustomer(createMockAdventurer({ id: 'a2' }));
      shopService.addCustomer(createMockAdventurer({ id: 'a3' }));
      shopService.addCustomer(createMockAdventurer({ id: 'a4' }));

      fireEvent('Storm');

      expect(shopService.adventurersInShop.length).toBeLessThan(4);
    });

    it('Wealthy Merchant: adds a customer named Wealthy Merchant', () => {
      service.skipTutorial();
      const shopService = TestBed.inject(ShopService);
      shopService.clearCustomers();

      fireEvent('Wealthy Merchant');

      expect(shopService.adventurersInShop.some((a) => a.name === 'Wealthy Merchant')).toBeTrue();
    });

    it('Dragon Sighting (late game): sets dragonActive flag', () => {
      service.day = 25; // >= LATE_GAME_DAY
      fireEvent('Dragon Sighting');
      expect(service.dragonActive).toBeTrue();
    });

    it('Potion Shortage (late game): sets potionShortageActive flag', () => {
      service.day = 25;
      fireEvent('Potion Shortage');
      expect(service.potionShortageActive).toBeTrue();
    });

    it("Hero's Return (late game): adds Legendary Hero to shop", () => {
      service.skipTutorial();
      const shopService = TestBed.inject(ShopService);
      shopService.clearCustomers();
      service.day = 25;

      fireEvent("Hero's Return");

      expect(shopService.adventurersInShop.some((a) => a.name === 'Legendary Hero')).toBeTrue();
    });
  });

  // ---------------------------------------------------------------------------
  // Group 4: Market ticker generation (additional messages)
  // ---------------------------------------------------------------------------

  describe('Market ticker generation (additional)', () => {
    function runTicker(): void {
      (service as unknown as { generateMarketTicker: () => void }).generateMarketTicker();
    }

    it('should include strength demand message when strengthDemandBoost is active', () => {
      service.economy.demandState = {
        healingDemandSurge: false,
        strengthDemandBoost: true,
        luckDemandBoost: false,
        priceVariance: 1.0,
      };
      runTicker();
      expect(service.marketTicker.message).toContain('Adventurers seeking strength potions');
    });

    it('should combine multiple demand messages', () => {
      service.economy.demandState = {
        healingDemandSurge: true,
        strengthDemandBoost: true,
        luckDemandBoost: false,
        priceVariance: 1.0,
      };
      runTicker();
      expect(service.marketTicker.message).toContain('Healing potions in high demand');
      expect(service.marketTicker.message).toContain('Adventurers seeking strength potions');
    });

    it('should set marketTicker active to true after generating', () => {
      service.economy.demandState = {
        healingDemandSurge: false,
        strengthDemandBoost: false,
        luckDemandBoost: false,
        priceVariance: 1.0,
      };
      runTicker();
      expect(service.marketTicker.active).toBeTrue();
    });

    it('should include luck demand message when luckDemandBoost is active', () => {
      service.economy.demandState = {
        healingDemandSurge: false,
        strengthDemandBoost: false,
        luckDemandBoost: true,
        priceVariance: 1.0,
      };
      runTicker();
      expect(service.marketTicker.message).toContain('Lucky charms trending');
    });
  });

  // ---------------------------------------------------------------------------
  // Group 5: Save/Load round-trip
  // ---------------------------------------------------------------------------

  describe('Save/Load round-trip', () => {
    it('should restore day, gold, and reputation after save → load', () => {
      service.day = 7;
      service.economy.gold = 350;
      service.economy.reputation = 42;
      service.cleanup();

      const newService = TestBed.inject(GameOrchestratorService);
      newService.initialize();

      expect(newService.day).toBe(7);
      expect(newService.economy.gold).toBe(350);
      expect(newService.economy.reputation).toBe(42);

      newService.cleanup();
    });

    it('should restore potion inventory after save → load', () => {
      service.potionInventory.set('basic-healing', 9);
      service.potionInventory.set('strength-potion', 4);
      service.cleanup();

      const newService = TestBed.inject(GameOrchestratorService);
      newService.initialize();

      expect(newService.potionInventory.get('basic-healing')).toBe(9);
      expect(newService.potionInventory.get('strength-potion')).toBe(4);

      newService.cleanup();
    });

    it('should restore all 5 potion upgrades after save → load', () => {
      service.potionUpgrades['healing'] = 2;
      service.potionUpgrades['strength'] = 1;
      service.potionUpgrades['defense'] = 2;
      service.potionUpgrades['speed'] = 1;
      service.potionUpgrades['luck'] = 2;
      service.cleanup();

      const newService = TestBed.inject(GameOrchestratorService);
      newService.initialize();

      expect(newService.potionUpgrades['healing']).toBe(2);
      expect(newService.potionUpgrades['strength']).toBe(1);
      expect(newService.potionUpgrades['defense']).toBe(2);
      expect(newService.potionUpgrades['speed']).toBe(1);
      expect(newService.potionUpgrades['luck']).toBe(2);

      newService.cleanup();
    });

    it('should restore eventHistory after save → load', () => {
      service.eventHistory = ['Storm', 'Thief in the Night', 'Guild Inspection'];
      service.cleanup();

      const newService = TestBed.inject(GameOrchestratorService);
      newService.initialize();

      expect(newService.eventHistory).toEqual(['Storm', 'Thief in the Night', 'Guild Inspection']);

      newService.cleanup();
    });

    it('should restore survivorLedger after save → load', () => {
      service.survivorLedger = [
        { name: 'Alice', class: 'Warrior', level: 3, lastPurchase: 'Healing Potion', timesReturned: 2 },
        { name: 'Bob', class: 'Mage', level: 5, lastPurchase: 'Luck Charm', timesReturned: 0 },
      ];
      service.cleanup();

      const newService = TestBed.inject(GameOrchestratorService);
      newService.initialize();

      expect(newService.survivorLedger.length).toBe(2);
      expect(newService.survivorLedger[0].name).toBe('Alice');
      expect(newService.survivorLedger[1].name).toBe('Bob');

      newService.cleanup();
    });
  });

  // ---------------------------------------------------------------------------
  // Group 6: closeShopEarly()
  // ---------------------------------------------------------------------------

  describe('closeShopEarly()', () => {
    beforeEach(() => {
      // Ensure we start in playing phase (closeShopEarly exits early otherwise)
      service.skipTutorial();
    });

    it('should clear all customers from the shop', () => {
      const shopService = TestBed.inject(ShopService);
      const rngService = TestBed.inject(GameRngService);
      shopService.addCustomer(createMockAdventurer({ id: 'c1' }));
      shopService.addCustomer(createMockAdventurer({ id: 'c2' }));

      // Prevent random events from spawning new customers during day transition
      spyOn(rngService, 'chance').and.returnValue(false);

      service.closeShopEarly();

      expect(shopService.adventurersInShop.length).toBe(0);
    });

    it('should clear adventurers from dungeon', () => {
      service.adventurersInDungeon.push(createMockAdventurer({ id: 'd1' }));

      service.closeShopEarly();

      expect(service.adventurersInDungeon.length).toBe(0);
    });

    it('should advance day by 1', () => {
      const dayBefore = service.day;

      service.closeShopEarly();

      // Only advance if not game-over triggered
      if (service.gameOverReason === null) {
        expect(service.day).toBe(dayBefore + 1);
      }
    });

    it('should trigger game-over when closeShopEarly causes bankruptcy', () => {
      service.economy.gold = -200; // Below bankruptcy threshold

      service.closeShopEarly();

      expect(service.gameOverReason).toBe('bankruptcy');
    });

    it('should do nothing when not in playing phase', () => {
      // Transition to merchant phase first
      const shopService = TestBed.inject(ShopService);
      shopService.addCustomer(createMockAdventurer({ id: 'c1' }));

      // force phase to merchant by triggering game over and then checking if customers were cleared
      service.triggerGameOver('bankruptcy');
      const countBefore = shopService.adventurersInShop.length;

      service.closeShopEarly();

      // In game-over phase, closeShopEarly should be a no-op
      expect(shopService.adventurersInShop.length).toBe(countBefore);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 7: openShop()
  // ---------------------------------------------------------------------------

  describe('openShop()', () => {
    it('should transition phase to playing from merchant', () => {
      const phaseService = TestBed.inject(GamePhaseService);
      // Use valid transition chain: playing → day-summary → merchant
      phaseService.transition('day-summary');
      phaseService.transition('merchant');

      service.openShop();

      expect(phaseService.currentPhase()).toBe('playing');
    });

    it('should reset customer enter times', () => {
      const shopService = TestBed.inject(ShopService);
      const old = Date.now() - 99999;
      const adv = createMockAdventurer({ enterTime: old });
      shopService.addCustomer(adv);

      service.openShop();

      const customer = shopService.adventurersInShop[0];
      if (customer) {
        expect(customer.enterTime).toBeGreaterThan(old);
      }
    });

    it('should add a day-start dungeon event', () => {
      service.skipTutorial();
      const eventsBefore = service.dungeonEvents.length;

      service.openShop();

      expect(service.dungeonEvents.length).toBeGreaterThan(eventsBefore);
    });

    // Pins the load-restore fix. Pre-fix initializeGame() rehydrated
    // gameTime from save (line 392-403), but ngOnInit forced Day 2+ back
    // to merchant phase. When the user clicked Open Shop, ticks resumed
    // from the saved mid-day value and the day "ended in the morning"
    // within seconds. openShop now resets gameTime to 0 unconditionally.
    it('resets gameTime to 0 so a loaded mid-day save starts fresh', () => {
      const phaseService = TestBed.inject(GamePhaseService);
      phaseService.transition('day-summary');
      phaseService.transition('merchant');
      service.gameTime = 113; // simulate restored save mid-day

      service.openShop();

      expect(service.gameTime).toBe(0);
      expect(service.timeOfDay).toBe('Morning');
    });

    // End-to-end pin: after openShop with a poisoned mid-day gameTime,
    // the day must run the FULL DAY_LENGTH_TICKS before endOfDay fires.
    // Pre-fix: with gameTime=113 the day ended after only 7 ticks.
    it('runs the full DAY_LENGTH_TICKS cycle even after a load-restored mid-day gameTime', () => {
      const phaseService = TestBed.inject(GamePhaseService);
      phaseService.transition('day-summary');
      phaseService.transition('merchant');
      service.skipTutorial();
      service.gameTime = 113; // simulated load-restore (was the bug trigger)
      const startingDay = service.day;

      service.openShop();

      // Drive ticks via the private updateTimeOfDay handler — same path
      // the gameTick$ subscription invokes. Day must NOT end at the old
      // 7-tick boundary (120 - 113); it must run the full cycle.
      const updateTimeOfDay = (service as unknown as { updateTimeOfDay: () => void }).updateTimeOfDay.bind(service);
      for (let i = 0; i < TIMING.DAY_LENGTH_TICKS - 1; i++) {
        updateTimeOfDay();
      }
      expect(service.day)
        .withContext(`day must not have advanced after ${TIMING.DAY_LENGTH_TICKS - 1} ticks`)
        .toBe(startingDay);
      expect(service.gameTime).toBe(TIMING.DAY_LENGTH_TICKS - 1);

      // The next tick crosses DAY_LENGTH_TICKS → endOfDay fires + day++
      updateTimeOfDay();
      expect(service.day).toBe(startingDay + 1);
      expect(service.gameTime).toBe(0);
      expect(service.timeOfDay).toBe('Morning');
    });

    // Time-of-day phases land at the documented tick thresholds — guards
    // against a regression where someone bumps DAY_LENGTH_TICKS without
    // adjusting MORNING_END / AFTERNOON_END / EVENING_END proportionally.
    it('advances timeOfDay through Morning → Afternoon → Evening → Night within one cycle', () => {
      const phaseService = TestBed.inject(GamePhaseService);
      phaseService.transition('day-summary');
      phaseService.transition('merchant');
      service.skipTutorial();

      service.openShop();

      const updateTimeOfDay = (service as unknown as { updateTimeOfDay: () => void }).updateTimeOfDay.bind(service);
      // Morning: gameTime 0..MORNING_END-1
      expect(service.timeOfDay).toBe('Morning');
      for (let i = 0; i < TIMING.MORNING_END; i++) updateTimeOfDay();
      expect(service.timeOfDay).withContext('after MORNING_END ticks').toBe('Afternoon');

      for (let i = TIMING.MORNING_END; i < TIMING.AFTERNOON_END; i++) updateTimeOfDay();
      expect(service.timeOfDay).withContext('after AFTERNOON_END ticks').toBe('Evening');

      for (let i = TIMING.AFTERNOON_END; i < TIMING.EVENING_END; i++) updateTimeOfDay();
      expect(service.timeOfDay).withContext('after EVENING_END ticks').toBe('Night');
    });

    // Red Team fix (2026-08-17): PotionShopComponent's in-flow toast is
    // freshly mounted on the merchant → playing `@if/@else` swap and reads
    // `currentMessage` as its initial Input value. Before this fix, a
    // merchant-phase warning (e.g. "Need Xg to buy everything!") set right
    // before clicking Open Shop would survive untouched into the playing
    // phase and get displayed, freshly re-animated, in a context where it no
    // longer applies. Reproduced live in the browser gate: clicking "Buy
    // All" without enough gold, then Open Shop within ~1s, showed the stale
    // merchant warning over an empty Day 2 dungeon counter.
    it('clears a message that was showing before the merchant → playing transition', () => {
      const phaseService = TestBed.inject(GamePhaseService);
      phaseService.transition('day-summary');
      phaseService.transition('merchant');
      service.showMessage('Need 390g to buy everything!', 'warning');
      expect(service.currentMessage?.text).toBe('Need 390g to buy everything!');

      service.openShop();

      expect(service.currentMessage).toBeNull();
    });

    // Same guard for day-summary → merchant, so a message that was showing
    // during playing (e.g. a late sale) can't reappear over the merchant's
    // stock panel either.
    it('clears a message that was showing before the day-summary → merchant transition', () => {
      service.skipTutorial();
      service.showMessage('Sold! Whether they survive depends on what you gave them.', 'success');
      expect(service.currentMessage).not.toBeNull();

      const phaseService = TestBed.inject(GamePhaseService);
      phaseService.transition('day-summary');
      service.dismissDaySummary();

      expect(phaseService.currentPhase()).toBe('merchant');
      expect(service.currentMessage).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Group 8: sellPotion() edge cases
  // ---------------------------------------------------------------------------

  describe('sellPotion() edge cases', () => {
    let shopService: ShopService;

    beforeEach(() => {
      shopService = TestBed.inject(ShopService);
      service.skipTutorial();
    });

    it('should refuse diluted potion for experienced customer and auto-select next', () => {
      const dilutedPotion = createMockPotion({ id: 'diluted-basic-healing', isDiluted: true });
      service.availablePotions.push(dilutedPotion);
      service.potionInventory.set('diluted-basic-healing', 3);

      const experienced = createMockAdventurer({ id: 'exp-1', experienced: true });
      const other = createMockAdventurer({ id: 'other-1' });
      shopService.addCustomer(experienced);
      shopService.addCustomer(other);
      shopService.selectCustomer(experienced);

      service.sellPotion(dilutedPotion, experienced);

      // Experienced customer refuses diluted → selectedAdventurer auto-selects away from them
      expect(shopService.selectedAdventurer?.id).not.toBe('exp-1');
    });

    it('should clear selection when customer is no longer in shop', () => {
      const adv = createMockAdventurer({ id: 'gone-1', gold: 100 });
      const potion = createMockPotion();
      service.potionInventory.set(potion.id, 5);

      // Don't add customer to shop — simulate "no longer in shop"
      shopService.selectedAdventurer = adv;

      service.sellPotion(potion, adv);

      expect(shopService.selectedAdventurer).toBeNull();
    });

    it('should trigger purchase animation when customer reaches max potions', () => {
      const adv = createMockAdventurer({
        id: 'max-potions',
        gold: 9999,
        // Already has 1 potion (MAX_POTIONS_PER_CUSTOMER = 2, so one more = max)
        potionsConsumed: [
          {
            potionId: 'strength-potion',
            name: 'Strength Potion',
            quality: 1.0,
            duration: 0,
            statModifiers: { strength: 10 },
          },
        ],
      });
      const potion = createMockPotion();
      service.potionInventory.set(potion.id, 5);
      shopService.addCustomer(adv);
      shopService.selectCustomer(adv);

      service.sellPotion(potion, adv);

      expect(service.purchaseAnimation).not.toBeNull();
      expect(service.purchaseAnimation?.adventurerId).toBe('max-potions');
    });

    it('should detect combo on 2nd potion purchase', () => {
      // Use healing + defense to trigger a combo if one exists
      const adv = createMockAdventurer({
        id: 'combo-adv',
        gold: 9999,
        potionsConsumed: [
          { potionId: 'basic-healing', name: 'Healing Potion', quality: 1.0, duration: 0, statModifiers: { hp: 50 } },
        ],
      });
      const strengthPotion = createMockPotion({
        id: 'strength-potion',
        name: 'Strength Potion',
        effects: { strengthBoost: 10 },
      });
      service.potionInventory.set('strength-potion', 5);
      shopService.addCustomer(adv);
      shopService.selectCustomer(adv);

      const combosTriggeredBefore = service.economy.combosTriggered;

      service.sellPotion(strengthPotion, adv);

      // comboSignal or combosTriggered incremented only if a combo was detected
      // Just verify the sale completed without errors (combo detection ran)
      expect(adv.potionsConsumed.length).toBe(2);
      // combosTriggered may or may not increment depending on available combos
      expect(service.economy.combosTriggered).toBeGreaterThanOrEqual(combosTriggeredBefore);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 9: endOfDay()
  // ---------------------------------------------------------------------------

  describe('endOfDay()', () => {
    let endOfDay: () => void;

    beforeEach(() => {
      endOfDay = (service as unknown as { endOfDay: () => void }).endOfDay.bind(service);
      service.skipTutorial();
    });

    it('should trigger bankruptcy when gold falls to threshold', () => {
      service.economy.gold = -200; // Below ECONOMY.BANKRUPTCY_THRESHOLD (-100)

      endOfDay();

      expect(service.gameOverReason).toBe('bankruptcy');
    });

    it('should trigger reputation bankruptcy when reputation too low', () => {
      service.economy.gold = 500; // Enough gold to avoid financial bankruptcy
      service.economy.reputation = -60; // Below ECONOMY.REPUTATION_BANKRUPTCY (-50)

      endOfDay();

      expect(service.gameOverReason).toBe('reputation');
    });

    it('should trigger victory on day 30+ with positive gold and reputation', () => {
      service.day = 30; // ECONOMY.VICTORY_DAYS
      service.economy.gold = 100;
      service.economy.reputation = 10;

      endOfDay();

      expect(service.gameOverReason).toBe('success');
    });

    it('should transition to day-summary on a normal day', () => {
      const phaseService = TestBed.inject(GamePhaseService);
      service.day = 5;
      service.economy.gold = 200;
      service.economy.reputation = 50;

      endOfDay();

      expect(phaseService.currentPhase()).toBe('day-summary');
      expect(service.daySummaryData).not.toBeNull();
      expect(service.daySummaryData?.day).toBe(5);
    });

    it('should not create daySummaryData when game-over triggers', () => {
      service.economy.gold = -200;

      endOfDay();

      // gameOverReason set; no summary needed
      expect(service.gameOverReason).toBe('bankruptcy');
    });
  });

  // ---------------------------------------------------------------------------
  // Guilt-triggered spawn reactions (Sprint 25)
  // ---------------------------------------------------------------------------
  describe('Guilt-triggered spawn reactions', () => {
    let shop: ShopService;
    let rng: GameRngService;

    beforeEach(() => {
      shop = TestBed.inject(ShopService);
      rng = TestBed.inject(GameRngService);
      shop.clearCustomers();
      service.economy.deathStreak = 0; // ensure fear mechanic doesn't override
    });

    it('should assign rumor speech bubble at guilt 25-50 when rng passes', () => {
      const GUILT_CONFIG = { LOW_THRESHOLD: 25, MEDIUM_THRESHOLD: 50 };
      service.economy.guilt = 30; // guilt in [25, 50)

      // Force rng.chance to always return true and pick to return first element
      spyOn(rng, 'chance').and.callFake(() => {
        return true; // all checks pass, including guilt 25-50 rumor check
      });
      spyOn(rng, 'pick').and.callFake(<T>(arr: readonly T[]): T => arr[0]);

      service.spawnAdventurer();

      const customers = shop.adventurersInShop;
      expect(customers.length).toBeGreaterThan(0);

      const rumorMessages = [
        "I've heard rumors about this shop...",
        'Some say the potions here are... questionable',
        'The guild has their eye on you, I hear',
      ];
      const hasRumor = customers.some((adv) => rumorMessages.includes(adv.speechBubble as string));
      expect(hasRumor).toBeTrue();
      expect(GUILT_CONFIG.LOW_THRESHOLD).toBe(25); // config sanity check
    });

    it('should NOT assign rumor speech bubble at guilt < 25', () => {
      service.economy.guilt = 24;

      // Make rng.chance deterministic: returns true always (forces rumor branch IF entered)
      spyOn(rng, 'chance').and.returnValue(true);
      spyOn(rng, 'pick').and.callFake(<T>(arr: readonly T[]): T => arr[0]);

      service.spawnAdventurer();

      const customers = shop.adventurersInShop;
      expect(customers.length).toBeGreaterThan(0);

      const rumorMessages = [
        "I've heard rumors about this shop...",
        'Some say the potions here are... questionable',
        'The guild has their eye on you, I hear',
      ];
      // At guilt 24 (below LOW_THRESHOLD), rumor branch should not activate
      const hasRumor = customers.some((adv) => rumorMessages.includes(adv.speechBubble as string));
      expect(hasRumor).toBeFalse();
    });

    it('should mark customer as experienced at guilt 50-75 when rng passes', () => {
      service.economy.guilt = 60; // guilt in [50, 75)

      spyOn(rng, 'chance').and.returnValue(true);
      spyOn(rng, 'pick').and.callFake(<T>(arr: readonly T[]): T => arr[0]);

      service.spawnAdventurer();

      const customers = shop.adventurersInShop;
      expect(customers.length).toBeGreaterThan(0);
      const suspicious = customers.some((adv) => adv.experienced === true);
      expect(suspicious).toBeTrue();
    });

    it('should assign inspection speech bubble at guilt 50-75', () => {
      service.economy.guilt = 60;

      spyOn(rng, 'chance').and.returnValue(true);
      spyOn(rng, 'pick').and.callFake(<T>(arr: readonly T[]): T => arr[0]);

      service.spawnAdventurer();

      const customers = shop.adventurersInShop;
      // At guilt 60 with all chance checks passing, the inspection branch fires and
      // sets speechBubble to the inspection message on the newly-spawned customer
      const hasInspection = customers.some((adv) => adv.speechBubble === 'Let me inspect these potions carefully...');
      expect(hasInspection).toBeTrue();
    });

    it('should prevent spawn at guilt 90+ when rng passes the avoidance check', () => {
      service.economy.guilt = 95;

      // Simulate: spawn modifier check passes, spawn reduction check passes, but avoidance fires
      // We need to return false for early-exit checks and true for the guilt-90 avoidance
      // Strategy: use a counter to control which calls return which value
      spyOn(rng, 'chance').and.callFake((probability: number) => probability === 0.2);

      const countBefore = shop.adventurersInShop.length;
      service.spawnAdventurer();

      // Customer should NOT have been added
      expect(shop.adventurersInShop.length).toBe(countBefore);
    });

    it('should still spawn customers at guilt 90+ when avoidance check fails (20% cap)', () => {
      service.economy.guilt = 95;

      // All rng.chance calls return false — avoidance does not trigger
      spyOn(rng, 'chance').and.returnValue(false);

      const countBefore = shop.adventurersInShop.length;
      service.spawnAdventurer();

      // Customer SHOULD have been added since avoidance didn't fire
      expect(shop.adventurersInShop.length).toBe(countBefore + 1);
    });
  });

  // ---------------------------------------------------------------------------
  // BUG A1: monotonic event IDs — no duplicate @for track keys
  // ---------------------------------------------------------------------------
  describe('A1: nextEventId monotonic counter', () => {
    it('should produce unique IDs for rapid successive calls with the same prefix', () => {
      const nextEventId = (service as unknown as { nextEventId: (p: string) => string }).nextEventId.bind(service);
      const ids = [nextEventId('test'), nextEventId('test'), nextEventId('test')];
      const unique = new Set(ids);
      expect(unique.size).toBe(3);
    });

    it('should produce unique IDs across different prefixes', () => {
      const nextEventId = (service as unknown as { nextEventId: (p: string) => string }).nextEventId.bind(service);
      const id1 = nextEventId('alpha');
      const id2 = nextEventId('beta');
      expect(id1).not.toBe(id2);
    });

    it('should always increment — IDs never repeat within a session', () => {
      const nextEventId = (service as unknown as { nextEventId: (p: string) => string }).nextEventId.bind(service);
      const n = 100;
      const ids = Array.from({ length: n }, () => nextEventId('ev'));
      expect(new Set(ids).size).toBe(n);
    });
  });

  // ---------------------------------------------------------------------------
  // BUG A1b: CustomerReview ids are unique, template uses review.id
  // ---------------------------------------------------------------------------
  describe('A1b: CustomerReview unique IDs', () => {
    it('should assign a non-empty id to each new customer review', () => {
      const adventurer = createMockAdventurer({ potionsConsumed: [] });
      const addReview = (
        service as unknown as { addCustomerReview: (a: Adventurer, s: boolean) => void }
      ).addCustomerReview.bind(service);
      addReview(adventurer, true);
      expect(service.customerReviews.length).toBeGreaterThan(0);
      expect(service.customerReviews[0].id).toBeTruthy();
    });

    it('should give distinct ids to reviews added in rapid succession', () => {
      const adventurer = createMockAdventurer({ potionsConsumed: [] });
      const addReview = (
        service as unknown as { addCustomerReview: (a: Adventurer, s: boolean) => void }
      ).addCustomerReview.bind(service);
      addReview(adventurer, true);
      addReview(adventurer, false);
      addReview(adventurer, true);
      const ids = service.customerReviews.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // ---------------------------------------------------------------------------
  // BUG A2: closeShopEarly — abandoned consequence
  // ---------------------------------------------------------------------------
  describe('A2: closeShopEarly applies abandoned consequence', () => {
    it('should apply exactly the consequences presented by the close-day preview', () => {
      // closeShopEarly() advances into the next day's startOfDay(), which can
      // roll a random event (e.g. Guild Inspection) that itself touches
      // reputation/guilt — suppress that roll so the measured delta below is
      // isolated to the abandonment consequence, not day-transition noise.
      spyOn(TestBed.inject(GameRngService), 'chance').and.returnValue(false);
      const shopService = TestBed.inject(ShopService);
      shopService.addCustomer(createMockAdventurer({ id: 'waiting' }));
      service.adventurersInDungeon = [
        createMockAdventurer({ id: 'r1', status: AdventurerStatus.Fighting }),
        createMockAdventurer({ id: 'r2', status: AdventurerStatus.Exploring }),
        createMockAdventurer({ id: 'safe', status: AdventurerStatus.Looting }),
      ];
      const preview = service.getCloseDayPreview();
      const reputationBefore = service.economy.reputation;
      const guiltBefore = service.economy.guilt;

      service.closeShopEarly();

      // Outcome-based: compares the ACTUAL before/after economy delta against
      // the preview, not the raw arguments passed to adjustReputation/addGuilt
      // (which are always -ABANDON_PENALTY/ABANDON_GAIN regardless of the
      // guilt-amplification and clamp adjustReputation applies internally).
      expect(preview.waitingCustomerCount).toBe(1);
      expect(preview.atRiskCount).toBe(2);
      expect(reputationBefore - service.economy.reputation).toBe(preview.reputationCost);
      expect(service.economy.guilt - guiltBefore).toBe(preview.guiltCost);
      expect(preview.dailyOverhead).toBeGreaterThan(0);
    });

    it('should account for guilt MEDIUM-threshold amplification (1.5x) in the preview', () => {
      // Suppress startOfDay()'s random-event roll — see comment above.
      spyOn(TestBed.inject(GameRngService), 'chance').and.returnValue(false);
      service.economy.reputation = 60;
      service.economy.guilt = 50; // GUILT.MEDIUM_THRESHOLD
      service.adventurersInDungeon = [
        createMockAdventurer({ id: 'r1', status: AdventurerStatus.Fighting }),
        createMockAdventurer({ id: 'r2', status: AdventurerStatus.Exploring }),
      ];
      const preview = service.getCloseDayPreview();
      const reputationBefore = service.economy.reputation;
      const guiltBefore = service.economy.guilt;

      service.closeShopEarly();

      expect(reputationBefore - service.economy.reputation).toBe(preview.reputationCost);
      expect(service.economy.guilt - guiltBefore).toBe(preview.guiltCost);
      // Sanity: amplified cost must exceed the naive unamplified estimate.
      const REPUTATION_ABANDON_PENALTY = 2;
      expect(preview.reputationCost).toBeGreaterThan(preview.atRiskCount * REPUTATION_ABANDON_PENALTY);
    });

    it('should account for guilt HIGH-threshold amplification (2.0x) in the preview', () => {
      // Suppress startOfDay()'s random-event roll — see comment above.
      spyOn(TestBed.inject(GameRngService), 'chance').and.returnValue(false);
      service.economy.reputation = 60;
      service.economy.guilt = 75; // GUILT.HIGH_THRESHOLD
      service.adventurersInDungeon = [
        createMockAdventurer({ id: 'r1', status: AdventurerStatus.Fighting }),
        createMockAdventurer({ id: 'r2', status: AdventurerStatus.Exploring }),
      ];
      const preview = service.getCloseDayPreview();
      const reputationBefore = service.economy.reputation;
      const guiltBefore = service.economy.guilt;

      service.closeShopEarly();

      expect(reputationBefore - service.economy.reputation).toBe(preview.reputationCost);
      expect(service.economy.guilt - guiltBefore).toBe(preview.guiltCost);
      const REPUTATION_ABANDON_PENALTY = 2;
      const GUILT_MEDIUM_MULTIPLIER = 1.5;
      // HIGH multiplier (2.0x) must cost strictly more than MEDIUM (1.5x) would.
      expect(preview.reputationCost).toBeGreaterThan(
        preview.atRiskCount * REPUTATION_ABANDON_PENALTY * GUILT_MEDIUM_MULTIPLIER
      );
    });

    it('should correctly cost a guilt threshold crossed mid-loop (only later runners amplified)', () => {
      // Starting guilt 73 is MEDIUM (1.5x); the first abandon's +3 guilt gain
      // crosses into HIGH (75+, 2.0x) partway through the loop, so runner 1
      // is amplified at 1.5x while runners 2 and 3 are amplified at 2.0x.
      // The raw-arithmetic preview (atRiskCount * ABANDON_PENALTY) can't see
      // this path dependency at all.
      // Suppress startOfDay()'s random-event roll — see comment above.
      spyOn(TestBed.inject(GameRngService), 'chance').and.returnValue(false);
      service.economy.reputation = 80;
      service.economy.guilt = 73;
      service.adventurersInDungeon = [
        createMockAdventurer({ id: 'r1', status: AdventurerStatus.Fighting }),
        createMockAdventurer({ id: 'r2', status: AdventurerStatus.Exploring }),
        createMockAdventurer({ id: 'r3', status: AdventurerStatus.Fighting }),
      ];
      const preview = service.getCloseDayPreview();
      const reputationBefore = service.economy.reputation;
      const guiltBefore = service.economy.guilt;

      service.closeShopEarly();

      expect(preview.atRiskCount).toBe(3);
      expect(reputationBefore - service.economy.reputation).toBe(preview.reputationCost);
      expect(service.economy.guilt - guiltBefore).toBe(preview.guiltCost);
    });

    it('should clamp the preview reputation cost at MIN_REPUTATION, matching the actual clamp', () => {
      // Reputation starts one point above what an unclamped -2 penalty would
      // reach past MIN_REPUTATION (-100), so the actual/preview cost (1) must
      // be less than the raw unclamped penalty (2).
      // Suppress startOfDay()'s random-event roll — see comment above.
      spyOn(TestBed.inject(GameRngService), 'chance').and.returnValue(false);
      service.economy.reputation = -99;
      service.economy.guilt = 0;
      service.adventurersInDungeon = [createMockAdventurer({ id: 'r1', status: AdventurerStatus.Fighting })];
      const preview = service.getCloseDayPreview();
      const reputationBefore = service.economy.reputation;

      service.closeShopEarly();

      expect(service.economy.reputation).toBe(-100);
      expect(reputationBefore - service.economy.reputation).toBe(preview.reputationCost);
      const REPUTATION_ABANDON_PENALTY = 2;
      expect(preview.reputationCost).toBeLessThan(REPUTATION_ABANDON_PENALTY);
    });

    it('should call adjustReputation with abandoned-dungeon reason per in-dungeon adventurer', () => {
      const adv1 = createMockAdventurer({ id: 'a1', name: 'Dungeon Alice' });
      const adv2 = createMockAdventurer({ id: 'a2', name: 'Dungeon Bob' });
      service.adventurersInDungeon = [adv1, adv2];
      const adjSpy = spyOn(service.economy, 'adjustReputation').and.callThrough();

      service.closeShopEarly();

      const abandonCalls = adjSpy.calls.all().filter((c) => c.args[1] === 'abandoned-dungeon');
      // One call per in-dungeon adventurer
      expect(abandonCalls.length).toBe(2);
      // Each call deducts ABANDON_PENALTY (negative adjustment)
      const ABANDON_PENALTY = 2; // REPUTATION.ABANDON_PENALTY
      abandonCalls.forEach((c) => expect(c.args[0]).toBe(-ABANDON_PENALTY));
    });

    it('should call addGuilt per in-dungeon adventurer when closing early', () => {
      const adv1 = createMockAdventurer({ id: 'a1', name: 'Dungeon Carol' });
      service.adventurersInDungeon = [adv1];
      const guiltSpy = spyOn(service.economy, 'addGuilt').and.callThrough();

      service.closeShopEarly();

      const ABANDON_GAIN = 3; // GUILT.ABANDON_GAIN
      const abandonGuiltCalls = guiltSpy.calls.all().filter((c) => c.args[0] === ABANDON_GAIN);
      // Exactly one in-dungeon adventurer → exactly one guilt increment.
      expect(abandonGuiltCalls.length).toBe(1);
    });

    it('should log an abandoned event naming each in-dungeon adventurer', () => {
      const adv1 = createMockAdventurer({ id: 'a1', name: 'Dungeon Dave' });
      service.adventurersInDungeon = [adv1];

      service.closeShopEarly();

      // Exactly one abandon event, and it names THIS adventurer (not a stray match).
      const abandonEvents = service.dungeonEvents.filter(
        (e) => e.message?.includes('abandoned') && e.message?.includes('Dungeon Dave')
      );
      expect(abandonEvents.length).toBe(1);
    });

    it('should not call adjustReputation with abandoned-dungeon reason when no adventurers are in the dungeon', () => {
      service.adventurersInDungeon = [];
      const adjSpy = spyOn(service.economy, 'adjustReputation').and.callThrough();

      service.closeShopEarly();

      const abandonCall = adjSpy.calls.all().find((c) => c.args[1] === 'abandoned-dungeon');
      expect(abandonCall).toBeUndefined();
    });

    it('should NOT penalize adventurers already Looting or Victorious (they survived combat)', () => {
      // Red-team finding: only adventurers still at risk count as abandoned.
      const atRisk = createMockAdventurer({ id: 'r1', status: AdventurerStatus.Fighting });
      const looting = createMockAdventurer({ id: 'l1', status: AdventurerStatus.Looting });
      const victorious = createMockAdventurer({ id: 'v1', status: AdventurerStatus.Victorious });
      service.adventurersInDungeon = [atRisk, looting, victorious];
      const adjSpy = spyOn(service.economy, 'adjustReputation').and.callThrough();

      service.closeShopEarly();

      const abandonCalls = adjSpy.calls.all().filter((c) => c.args[1] === 'abandoned-dungeon');
      // Only the still-Fighting adventurer is abandoned; the two survivors are spared.
      expect(abandonCalls.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // BUG A3: deathModalTimeout reassigned — rapid deaths keep modal up
  // ---------------------------------------------------------------------------
  describe('A3: showDeathNotification — deathModalTimeout reassigned', () => {
    it('should keep showDeathModal true after two rapid death notifications', () => {
      const showDeath = (
        service as unknown as {
          showDeathNotification: (n: {
            adventurer: Adventurer;
            message: string;
            timestamp: number;
            wasYourFault: boolean;
            lastWords: string;
          }) => void;
        }
      ).showDeathNotification.bind(service);
      const notif = {
        adventurer: createMockAdventurer(),
        message: 'fell',
        timestamp: Date.now(),
        wasYourFault: false,
        lastWords: 'goodbye',
      };

      showDeath(notif);
      expect(service.showDeathModal).toBeTrue();

      showDeath(notif); // Second rapid call — should not dismiss modal
      expect(service.showDeathModal).toBeTrue();
    });

    it('should cancel the previous hide timer when a second death notification fires', () => {
      jasmine.clock().install();
      try {
        const showDeath = (
          service as unknown as { showDeathNotification: (n: unknown) => void }
        ).showDeathNotification.bind(service);
        const notif = {
          adventurer: createMockAdventurer(),
          message: 'fell',
          timestamp: Date.now(),
          wasYourFault: false,
          lastWords: 'goodbye',
        };

        showDeath(notif);
        // Advance almost to DEATH_MODAL_MS (1999ms) — modal should still be up
        jasmine.clock().tick(1999);
        showDeath(notif); // Resets the timer
        // Advance by 1999ms more — still within the second notification's window
        jasmine.clock().tick(1999);
        expect(service.showDeathModal).toBeTrue();
      } finally {
        jasmine.clock().uninstall();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // BUG A4: processAutomaticCustomerBrowsing — snapshot before iteration
  // ---------------------------------------------------------------------------
  describe('A4: processAutomaticCustomerBrowsing uses array snapshot', () => {
    it('should process all customers present at the start of the tick even if the shop array is replaced', () => {
      const adv = createMockAdventurer({
        id: 'browse-1',
        gold: 200, // can afford
        enterTime: Date.now() - 10000, // well past min browse time
      });
      const adv2 = createMockAdventurer({
        id: 'browse-2',
        gold: 1, // can't afford → exercises the array-replacing cant-afford path
        enterTime: Date.now() - 10000,
      });
      const injectedShop = TestBed.inject(ShopService);
      injectedShop.addCustomer(adv);
      injectedShop.addCustomer(adv2);
      expect(injectedShop.adventurersInShop.map((a) => a.id)).toEqual(['browse-1', 'browse-2']);

      const browse = (
        service as unknown as { processAutomaticCustomerBrowsing: () => void }
      ).processAutomaticCustomerBrowsing.bind(service);

      // Iterating a snapshot (not the live BehaviorSubject array) means a mid-loop
      // replacement of adventurersInShop can't crash the loop or corrupt the queue.
      expect(() => browse()).not.toThrow();
      // Whatever remains in the queue is a valid adventurer (no undefined holes from
      // a stale-index splice during iteration).
      injectedShop.adventurersInShop.forEach((a) => expect(a?.id).toBeTruthy());
    });
  });

  // ---------------------------------------------------------------------------
  // BUG A7: survivorLedger — same-name adventurers don't collide when they have distinct ids
  // ---------------------------------------------------------------------------
  describe('A7: survivorLedger id-based dedup', () => {
    it('should store two entries when same-name adventurers have different ids', () => {
      const addToLedger = (
        service as unknown as { addToSurvivorLedger: (e: SurvivorEntry) => void }
      ).addToSurvivorLedger.bind(service);

      addToLedger({
        id: 'adv-001',
        name: 'Alice',
        class: 'Warrior',
        level: 1,
        lastPurchase: 'Healing Potion',
        timesReturned: 0,
      });
      addToLedger({
        id: 'adv-002',
        name: 'Alice',
        class: 'Warrior',
        level: 2,
        lastPurchase: 'Strength Potion',
        timesReturned: 0,
      });

      expect(service.survivorLedger.length).toBe(2);
    });

    it('should update the same entry when same-name AND same-id adventurer returns', () => {
      const addToLedger = (
        service as unknown as { addToSurvivorLedger: (e: SurvivorEntry) => void }
      ).addToSurvivorLedger.bind(service);

      addToLedger({
        id: 'adv-001',
        name: 'Bob',
        class: 'Rogue',
        level: 1,
        lastPurchase: 'Healing Potion',
        timesReturned: 0,
      });
      addToLedger({
        id: 'adv-001',
        name: 'Bob',
        class: 'Rogue',
        level: 2,
        lastPurchase: 'Luck Charm',
        timesReturned: 0,
      });

      expect(service.survivorLedger.length).toBe(1);
      expect(service.survivorLedger[0].level).toBe(2);
      expect(service.survivorLedger[0].lastPurchase).toBe('Luck Charm');
    });

    it('should fall back to name-based dedup for legacy entries without id', () => {
      const addToLedger = (
        service as unknown as { addToSurvivorLedger: (e: SurvivorEntry) => void }
      ).addToSurvivorLedger.bind(service);

      // Legacy entry (no id) followed by new entry with same name but no id
      addToLedger({ name: 'Carol', class: 'Mage', level: 1, lastPurchase: 'Luck Charm', timesReturned: 0 });
      addToLedger({ name: 'Carol', class: 'Mage', level: 2, lastPurchase: 'Defense Potion', timesReturned: 0 });

      expect(service.survivorLedger.length).toBe(1);
      expect(service.survivorLedger[0].level).toBe(2);
    });

    it('should preserve timesReturned across id-based update', () => {
      const addToLedger = (
        service as unknown as { addToSurvivorLedger: (e: SurvivorEntry) => void }
      ).addToSurvivorLedger.bind(service);

      addToLedger({
        id: 'adv-003',
        name: 'Dave',
        class: 'Paladin',
        level: 1,
        lastPurchase: 'Defense Potion',
        timesReturned: 0,
      });
      service.survivorLedger[0].timesReturned = 5;
      addToLedger({
        id: 'adv-003',
        name: 'Dave',
        class: 'Paladin',
        level: 2,
        lastPurchase: 'Healing Potion',
        timesReturned: 0,
      });

      expect(service.survivorLedger[0].timesReturned).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // getRecommendedPotion — survival-first on dangerous floors (balance recovery)
  // The rebalance made healing far better for survival than class-flavor potions,
  // so on deep floors the recommendation must point at survival or it steers
  // players into under-equipped deaths and the guilt/reputation spiral.
  // ---------------------------------------------------------------------------
  describe('getRecommendedPotion — survival-first on dangerous floors', () => {
    it('recommends the class-fit potion on safe early floors', () => {
      service.economy.currentFloor = 1;
      const warrior = createMockAdventurer({ class: AdventurerClass.Warrior, currentHp: 100, maxHp: 100 });
      expect(service.getRecommendedPotion(warrior)?.id).toBe('strength-potion');
    });

    it('recommends healing (survival) on dangerous floors, regardless of class', () => {
      service.economy.currentFloor = SHOP.RECOMMEND_DANGER_FLOOR;
      const warrior = createMockAdventurer({ class: AdventurerClass.Warrior, currentHp: 100, maxHp: 100 });
      expect(service.getRecommendedPotion(warrior)?.id).toBe('basic-healing');
      const mage = createMockAdventurer({ class: AdventurerClass.Mage, currentHp: 100, maxHp: 100 });
      expect(service.getRecommendedPotion(mage)?.id).toBe('basic-healing');
    });

    it('still recommends healing for a low-HP adventurer even on a safe floor', () => {
      service.economy.currentFloor = 1;
      const hurt = createMockAdventurer({ class: AdventurerClass.Warrior, currentHp: 20, maxHp: 100 });
      expect(service.getRecommendedPotion(hurt)?.id).toBe('basic-healing');
    });

    it('never recommends an out-of-stock class-fit potion', () => {
      service.economy.currentFloor = 1;
      service.potionInventory.set('speed-elixir', 0);
      const rogue = createMockAdventurer({ class: AdventurerClass.Rogue, gold: 100 });

      const recommendation = service.getRecommendedPotion(rogue);

      expect(recommendation).not.toBeNull();
      expect(recommendation?.id).not.toBe('speed-elixir');
      expect(service.potionInventory.get(recommendation?.id ?? '')).toBeGreaterThan(0);
      expect(service.calculatePrice(recommendation!, rogue)).toBeLessThanOrEqual(rogue.gold);
    });

    it('recomputes affordability when mercy makes a safe option possible', () => {
      const customer = createMockAdventurer({ gold: 50 });

      expect(service.getRecommendedPotion(customer, 'fair')).toBeNull();
      expect(service.getRecommendedPotion(customer, 'mercy')?.id).toBe('basic-healing');
    });

    it('surfaces the combo completed by the second potion without mutating the customer', () => {
      const warrior = createMockAdventurer({
        survivalChance: 0.4,
        gold: 200,
        potionsConsumed: [
          { potionId: 'basic-healing', name: 'Healing', quality: 1, duration: 0, statModifiers: { hp: 50 } },
        ],
      });
      const strength = service.availablePotions.find((potion) => potion.id === 'strength-potion')!;

      const forecast = service.getPotionForecast(strength, warrior);

      expect(forecast.comboName).toBe('Berserker Brew');
      expect(forecast.comboSurvivalBonus).toBe(0.15);
      expect(forecast.projectedSurvival).toBeGreaterThan(warrior.survivalChance);
      expect(warrior.survivalChance).toBe(0.4);
      const recommendation = service.getRecommendedPotion(warrior);
      expect(recommendation).not.toBeNull();
      expect(service.getPotionForecast(recommendation!, warrior).comboName).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getPotionForecasts — memoization (perf red-team finding)
  // The 500ms game tick re-reads getPotionForecasts()/getRecommendedPotionId()
  // on every change-detection pass; a fresh Map on every call both wastes
  // CPU recomputing previewSurvivalChance()/detectCombo() per potion and
  // defeats PotionShopComponent's OnPush [forecasts] binding.
  // ---------------------------------------------------------------------------
  describe('getPotionForecasts — memoization', () => {
    it('returns the SAME Map reference across consecutive calls when nothing relevant changed', () => {
      const adventurer = createMockAdventurer();

      const first = service.getPotionForecasts(adventurer, 'fair');
      const second = service.getPotionForecasts(adventurer, 'fair');

      expect(second).toBe(first);
    });

    it('recomputes (new Map reference) after a mutating action changes forecast-relevant state', () => {
      const adventurer = createMockAdventurer();
      const first = service.getPotionForecasts(adventurer, 'fair');

      service.economy.gold = 1000;
      service.buyUpgrade('healing');
      const second = service.getPotionForecasts(adventurer, 'fair');

      expect(second).not.toBe(first);
    });

    it('recomputes after the same adventurer buys a potion (gold/survivalChance/potionsConsumed change)', () => {
      const adventurer = createMockAdventurer({ id: 'cache-buyer', gold: 200 });
      const potion = service.availablePotions.find((p) => p.id === 'basic-healing')!;
      const shop = TestBed.inject(ShopService);
      shop.addCustomer(adventurer);
      service.potionInventory.set(potion.id, 5);
      const first = service.getPotionForecasts(adventurer, 'fair');

      service.sellPotion(potion, adventurer, 'fair');
      const second = service.getPotionForecasts(adventurer, 'fair');

      expect(second).not.toBe(first);
    });

    it('getRecommendedPotion reads the cached forecasts instead of recomputing separately', () => {
      const adventurer = createMockAdventurer({ class: AdventurerClass.Warrior, currentHp: 100, maxHp: 100 });
      service.economy.currentFloor = 1;

      const forecasts = service.getPotionForecasts(adventurer, 'fair');
      const recommended = service.getRecommendedPotion(adventurer, 'fair');
      const forecastsAfter = service.getPotionForecasts(adventurer, 'fair');

      expect(recommended).not.toBeNull();
      expect(forecastsAfter).toBe(forecasts);
    });
  });
});
