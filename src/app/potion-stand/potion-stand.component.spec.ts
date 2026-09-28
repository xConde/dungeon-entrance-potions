import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { PotionStandComponent } from './potion-stand.component';
import { GameLoopService } from './services/game-loop.service';
import { AdventurerService } from './services/adventurer.service';
import { ShopService } from './services/shop.service';
import { Adventurer, AdventurerClass, AdventurerStatus } from './models/adventurer.model';
import { Potion } from './models/potion.model';
import { DUNGEON, TIMING } from './config/game-config';

describe('PotionStandComponent', () => {
  let component: PotionStandComponent;
  let fixture: ComponentFixture<PotionStandComponent>;
  let gameLoopService: GameLoopService;
  let adventurerService: AdventurerService;
  let shopService: ShopService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PotionStandComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PotionStandComponent);
    component = fixture.componentInstance;

    // Get services from component's injector (component provides its own instances)
    const injector = fixture.debugElement.injector;
    gameLoopService = injector.get(GameLoopService);
    adventurerService = injector.get(AdventurerService);
    shopService = injector.get(ShopService);

    // Clear localStorage before each test
    window.localStorage.clear();

    fixture.detectChanges();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // Helper function to save game state to localStorage for restore tests
  function saveToLocalStorage(state: Record<string, unknown>): void {
    window.localStorage.setItem('potion-stand-save', JSON.stringify(state));
  }

  // Helper function to create mock adventurers
  function createMockAdventurer(overrides?: Partial<Adventurer>): Adventurer {
    return {
      id: '123',
      name: 'Bob',
      class: AdventurerClass.Warrior,
      level: 1,
      gold: 50,
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

  // Helper function to create mock potions
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

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should initialize with default values', () => {
      expect(component.gold).toBe(100);
      expect(component.reputation).toBe(50);
      expect(component.day).toBe(1);
      // Game is paused on day 1 during the tutorial
      expect(component.isPaused).toBe(true);
      expect(component.tutorialStep).toBe(1);
      expect(component.gameSpeed).toBe(1);
      expect(component.timeOfDay).toBe('Morning');
    });

    it('should have starting inventory (reduced for early-game tension)', () => {
      // Reduced starting inventory for more challenge - players must restock for premium potions
      expect(component.potionInventory.get('basic-healing')).toBe(3);
      expect(component.potionInventory.get('strength-potion')).toBe(2);
      expect(component.potionInventory.get('defense-potion')).toBe(2);
    });

    it('should NOT include greater-healing in starting inventory (replaced by upgrade system)', () => {
      // Greater healing is now obtained via the permanent upgrade system
      expect(component.potionInventory.get('greater-healing') ?? 0).toBe(0);
    });

    it('renders a visually-hidden h1 with the project title (projects-detail unmounts its own on demo launch)', () => {
      fixture.detectChanges();
      const h1 = (fixture.nativeElement as HTMLElement).querySelector('h1.sr-only');
      expect(h1?.textContent?.trim()).toBe('Dungeon Entrance Potions');
    });

    it('should allow buying healing upgrade from merchant (replaces greater-healing purchase)', () => {
      // Set up initial state - player has enough gold for first upgrade tier
      component.economy.gold = 250;
      component.potionUpgrades['healing'] = 0; // BASIC tier

      // Buy the upgrade to ENHANCED tier
      component.buyUpgrade('healing');

      // Upgrade should be at tier 1 (ENHANCED) and gold deducted
      expect(component.potionUpgrades['healing']).toBe(1);
      expect(component.gold).toBe(250 - component.UPGRADE_COSTS['healing'][0]);
    });

    it('should initialize statistics to zero', () => {
      expect(component.deathCount).toBe(0);
      expect(component.savedCount).toBe(0);
      expect(component.economy.deathStreak).toBe(0);
      expect(component.economy.maxDeathStreak).toBe(0);
      expect(component.goldEarned).toBe(0);
    });

    it('should load saved game state if available', () => {
      const savedState = {
        gold: 250,
        reputation: 75,
        day: 5,
        adventurersKilled: 10,
        adventurersSaved: 25,
        goldEarned: 500,
        totalAdventurers: 35,
        potionsSold: 30,
        deathsByPotion: 3,
        deathsByDilution: 2,
        perfectSaves: 5,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: {},
        potionUpgrades: { healing: 0, strength: 0, defense: 0 },
        difficultyMultiplier: 1,
        shopLevel: 1,
      };

      // Save state to localStorage before creating new component
      saveToLocalStorage(savedState);

      // Create new component to trigger initialization (will load from localStorage)
      const newFixture = TestBed.createComponent(PotionStandComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();

      expect(newComponent.gold).toBe(250);
      expect(newComponent.reputation).toBe(75);
      expect(newComponent.day).toBe(5);
      expect(newComponent.deathCount).toBe(10);
      expect(newComponent.savedCount).toBe(25);
      expect(newComponent.goldEarned).toBe(500);
    });
  });

  describe('Game Speed Controls', () => {
    it('should toggle speed from 1x to 2x to 3x and back to 1x', () => {
      expect(component.gameSpeed).toBe(1);

      component.changeSpeed();
      expect(component.gameSpeed).toBe(2);

      component.changeSpeed();
      expect(component.gameSpeed).toBe(3);

      component.changeSpeed();
      expect(component.gameSpeed).toBe(1);
    });

    it('should pause and unpause the game', () => {
      // Tutorial pauses game on day 1; skip tutorial to get to normal playing state
      component.skipTutorial();
      expect(component.isPaused).toBe(false);

      component.togglePause();
      expect(component.isPaused).toBe(true);

      component.togglePause();
      expect(component.isPaused).toBe(false);
    });

    it('should temporarily pause a running game while the Stillroom is open', () => {
      component.skipTutorial();
      expect(component.isPaused).toBe(false);

      component.onDilutionBenchOpenChange(true);
      expect(component.dilutionBenchOpen()).toBeTrue();
      expect(component.isPaused).toBe(true);

      component.onDilutionBenchOpenChange(false);
      expect(component.dilutionBenchOpen()).toBeFalse();
      expect(component.isPaused).toBe(false);
    });

    it('should preserve an explicit user pause when the Stillroom closes', () => {
      component.skipTutorial();
      component.togglePause();
      expect(component.isPaused).toBe(true);

      component.onDilutionBenchOpenChange(true);
      component.onDilutionBenchOpenChange(false);

      expect(component.isPaused).toBe(true);
    });

    it('should release the mobile scroll boundaries while the Stillroom is open', () => {
      component.skipTutorial();
      component.onDilutionBenchOpenChange(true);
      fixture.detectChanges();

      const fixtureElement = fixture.nativeElement as HTMLElement;
      const gameGrid = fixtureElement.querySelector<HTMLElement>('.game-grid')!;
      const potionsPanel = fixtureElement.querySelector<HTMLElement>('.potions-panel')!;
      const mobileTabs = Array.from(fixtureElement.querySelectorAll<HTMLButtonElement>('.mobile-tabs button'));
      expect(gameGrid.classList).toContain('decision-open');
      expect(potionsPanel.classList).toContain('decision-open');
      expect(mobileTabs.every((tab) => tab.disabled)).toBeTrue();

      component.onDilutionBenchOpenChange(false);
      fixture.detectChanges();
      expect(gameGrid.classList).not.toContain('decision-open');
      expect(potionsPanel.classList).not.toContain('decision-open');
      expect(mobileTabs.every((tab) => !tab.disabled)).toBeTrue();
    });

    it('should not let the global pause shortcut resume behind the Stillroom', () => {
      component.skipTutorial();
      component.onDilutionBenchOpenChange(true);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'p' }));

      expect(component.isPaused).toBe(true);
    });

    it('should temporarily pause a running game while confirming an early close', () => {
      component.skipTutorial();
      expect(component.isPaused).toBe(false);

      component.requestCloseDay();

      expect(component.closeDayConfirmationOpen()).toBeTrue();
      expect(component.isPaused).toBe(true);

      component.cancelCloseDay();

      expect(component.closeDayConfirmationOpen()).toBeFalse();
      expect(component.isPaused).toBe(false);
    });

    it('should preserve an explicit pause when early-close confirmation is cancelled', () => {
      component.skipTutorial();
      component.togglePause();
      expect(component.isPaused).toBe(true);

      component.requestCloseDay();
      component.cancelCloseDay();

      expect(component.isPaused).toBe(true);
    });

    it('should confirm an early close and restore a modal-owned running state', () => {
      component.skipTutorial();
      const closeSpy = spyOn(component.orchestrator, 'closeShopEarly');
      expect(component.shellGame).toBeDefined();
      const shellStopSpy = spyOn(component.shellGame!, 'stop');

      component.requestCloseDay();
      component.confirmCloseDay();

      expect(component.closeDayConfirmationOpen()).toBeFalse();
      expect(component.isPaused).toBe(false);
      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(shellStopSpy).toHaveBeenCalledTimes(1);
    });

    it('should preview abandonment costs only for runners still at risk', () => {
      component.adventurersInDungeon.push(
        createMockAdventurer({ id: 'fighting', status: AdventurerStatus.Fighting }),
        createMockAdventurer({ id: 'looting', status: AdventurerStatus.Looting }),
        createMockAdventurer({ id: 'victorious', status: AdventurerStatus.Victorious })
      );

      expect(component.closeDayPreview).toEqual({
        waitingCustomerCount: 0,
        atRiskCount: 1,
        reputationCost: 2,
        guiltCost: 3,
        dailyOverhead: component.orchestrator.DAILY_OVERHEAD,
      });
    });

    it('should expose Close Day during play even when stock remains', () => {
      component.skipTutorial();
      expect(component.hasStock).toBeTrue();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.close-day-btn')).toBeTruthy();
    });

    it('should delegate speed changes to GameLoopService', () => {
      // Verify changeSpeed delegates to the service
      expect(component.gameSpeed).toBe(1);

      component.changeSpeed();
      expect(component.gameSpeed).toBe(2);

      component.changeSpeed();
      expect(component.gameSpeed).toBe(3);

      component.changeSpeed();
      expect(component.gameSpeed).toBe(1);
    });

    it('should reflect gameSpeed from GameLoopService', () => {
      // Verify component's gameSpeed getter returns service value
      gameLoopService.setSpeed(2);
      expect(component.gameSpeed).toBe(2);

      gameLoopService.setSpeed(3);
      expect(component.gameSpeed).toBe(3);
    });
  });

  describe('Adventurer Management', () => {
    it('should spawn a new adventurer', () => {
      const mockAdventurer = createMockAdventurer();

      spyOn(adventurerService, 'generateAdventurer').and.returnValue(mockAdventurer);

      // Neutralize ALL RNG-based early returns in spawnAdventurer():
      // 1. Max customers gate
      component.adventurersInShop = [];
      // 2. Storm gate
      component.stormActive = false;
      component.day = 2; // Bypass the handcrafted opening customer for this generic spawn test.
      // 3. Spawn modifier gate (economy reputation)
      spyOn(component.economy, 'getSpawnRateModifier').and.returnValue(1.0);
      // 4. Death streak gate
      component.economy.spawnReductionActive = false;

      component.spawnAdventurer();

      expect(component.adventurersInShop.length).toBe(1);
      expect(component.adventurersInShop).toContain(mockAdventurer);
    });

    it('should not spawn more than 5 adventurers in shop', () => {
      // Fill shop with 5 adventurers
      for (let i = 0; i < 5; i++) {
        component.adventurersInShop.push(
          createMockAdventurer({
            id: `adv-${i}`,
            name: `Adventurer ${i}`,
          })
        );
      }

      component.spawnAdventurer();
      expect(component.adventurersInShop.length).toBe(5);
    });

    it('should log event and reduce reputation when customer times out (Bug Fix: silent timeout)', () => {
      // Create adventurer that has been waiting > 30 seconds
      const oldAdventurer = createMockAdventurer({
        id: 'timeout-test',
        name: 'Impatient Pete',
        enterTime: Date.now() - 35000, // 35 seconds ago
      });
      component.adventurersInShop.push(oldAdventurer);

      const initialRep = component.reputation;
      const initialEventsCount = component.dungeonEvents.length;

      // Process the queue
      component.orchestrator['processShopQueue']();

      // Adventurer should be removed
      expect(component.adventurersInShop.find((a) => a.id === 'timeout-test')).toBeUndefined();

      // Reputation should decrease by REPUTATION_TIMEOUT_PENALTY (2)
      expect(component.reputation).toBe(initialRep - 2);

      // Event should be logged
      expect(component.dungeonEvents.length).toBe(initialEventsCount + 1);
      expect(component.dungeonEvents[0].message).toContain('got tired of waiting');
      expect(component.dungeonEvents[0].severity).toBe('warning');
    });

    it('should not remove or penalize adventurers who have waited less than 30 seconds', () => {
      const recentAdventurer = createMockAdventurer({
        id: 'recent-test',
        name: 'Patient Paul',
        enterTime: Date.now() - 5000, // Only 5 seconds ago
      });
      component.adventurersInShop.push(recentAdventurer);

      const initialRep = component.reputation;

      component.orchestrator['processShopQueue']();

      // Adventurer should still be in shop
      expect(component.adventurersInShop.find((a) => a.id === 'recent-test')).toBeDefined();

      // No reputation change
      expect(component.reputation).toBe(initialRep);
    });

    it('should select an adventurer', () => {
      const adventurer = createMockAdventurer();

      component.selectAdventurer(adventurer);
      expect(component.selectedAdventurer).toBe(adventurer);
    });

    it('should auto-select first customer when none selected', () => {
      const adventurer1 = createMockAdventurer({ id: 'auto-1', name: 'First' });
      const adventurer2 = createMockAdventurer({ id: 'auto-2', name: 'Second' });

      component.adventurersInShop.push(adventurer1, adventurer2);
      component.selectedAdventurer = null;

      component.orchestrator['autoSelectCustomer']();

      expect((component.selectedAdventurer as Adventurer | null)?.id).toBe('auto-1');
    });

    it('should not auto-select if customer already selected', () => {
      const adventurer1 = createMockAdventurer({ id: 'auto-1', name: 'First' });
      const adventurer2 = createMockAdventurer({ id: 'auto-2', name: 'Second' });

      component.adventurersInShop.push(adventurer1, adventurer2);
      component.selectedAdventurer = adventurer2;

      component.orchestrator['autoSelectCustomer']();

      // Should keep existing selection
      expect(component.selectedAdventurer?.id).toBe('auto-2');
    });

    it('should not auto-select if no customers in shop', () => {
      component.adventurersInShop = [];
      component.selectedAdventurer = null;

      component.orchestrator['autoSelectCustomer']();

      expect(component.selectedAdventurer).toBeNull();
    });

    it('should skip customers who purchased max potions when auto-selecting', () => {
      const maxedAdventurer = createMockAdventurer({
        id: 'maxed',
        name: 'Already Maxed',
        potionsConsumed: [
          { potionId: 'basic-healing', name: 'Healing', quality: 1, duration: 0, statModifiers: {} },
          { potionId: 'strength-potion', name: 'Strength', quality: 1, duration: 0, statModifiers: {} },
        ],
      });
      const availableAdventurer = createMockAdventurer({ id: 'available', name: 'Ready to Buy' });

      component.adventurersInShop.push(maxedAdventurer, availableAdventurer);
      component.selectedAdventurer = null;

      component.orchestrator['autoSelectCustomer']();

      // Should select the one who can still buy (hasn't reached max of 2)
      expect((component.selectedAdventurer as Adventurer | null)?.id).toBe('available');
    });

    describe('Instant Auto-Selection (Bug Fix)', () => {
      it('should auto-select customer immediately when spawned', () => {
        const mockAdventurer = createMockAdventurer({ id: 'spawn-test', name: 'New Customer' });
        spyOn(adventurerService, 'generateAdventurer').and.returnValue(mockAdventurer);

        component.adventurersInShop = [];
        component.selectedAdventurer = null;
        component.day = 2; // Exercise the normal generated-customer path.

        component.spawnAdventurer();

        // Customer should be selected immediately, not waiting for next game tick
        expect((component.selectedAdventurer as Adventurer | null)?.id).toBe('spawn-test');
      });

      it('should keep customer selected after first potion sale (2-potion limit)', () => {
        const customer1 = createMockAdventurer({ id: 'buyer', name: 'Buyer', gold: 100 });
        const customer2 = createMockAdventurer({ id: 'next', name: 'Next Customer' });
        const potion = createMockPotion();

        component.adventurersInShop = [customer1, customer2];
        component.selectedAdventurer = customer1;
        component.potionInventory.set(potion.id, 5);

        component.sellPotion(potion, customer1);

        // After first sale, customer stays in shop (can buy 2 potions)
        expect(component.adventurersInShop).toContain(customer1);
        expect(customer1.potionsConsumed.length).toBe(1);
      });

      it('should auto-select next customer after selling second potion (max reached)', fakeAsync(() => {
        const customer1 = createMockAdventurer({
          id: 'buyer',
          name: 'Buyer',
          gold: 200,
          potionsConsumed: [{ potionId: 'first', name: 'First', quality: 1, duration: 0, statModifiers: {} }],
        });
        const customer2 = createMockAdventurer({ id: 'next', name: 'Next Customer' });
        const potion = createMockPotion();

        component.adventurersInShop = [customer1, customer2];
        component.selectedAdventurer = customer1;
        component.potionInventory.set(potion.id, 5);

        component.sellPotion(potion, customer1);

        // Wait for purchase animation timeout to complete removal
        tick(1000);

        // After second sale (max reached), customer removed and next selected
        expect((component.selectedAdventurer as Adventurer | null)?.id).toBe('next');
      }));
    });
  });

  describe('Potion Sales', () => {
    it('should sell a potion to an adventurer', () => {
      const adventurer = createMockAdventurer({ gold: 100 });
      const potion = createMockPotion();

      shopService.addCustomer(adventurer);
      component.selectedAdventurer = adventurer;
      component.potionInventory.set(potion.id, 5);
      component.economy.gold = 50;

      const initialGold = component.gold;
      const initialInventory = component.potionInventory.get(potion.id)!;

      component.sellPotion(potion, adventurer);

      // Gold should increase (accounting for dynamic pricing)
      expect(component.gold).toBeGreaterThan(initialGold);
      // Inventory should decrease
      expect(component.potionInventory.get(potion.id)).toBe(initialInventory - 1);
      // Adventurer should have consumed potion
      expect(adventurer.potionsConsumed.length).toBe(1);
    });

    it('should prevent selling when out of stock', () => {
      const adventurer = createMockAdventurer({ gold: 100 });
      const potion = createMockPotion();

      component.selectedAdventurer = adventurer;
      component.potionInventory.set(potion.id, 0);

      const initialGold = component.gold;

      component.sellPotion(potion, adventurer);

      // No sale should occur
      expect(component.gold).toBe(initialGold);
      expect(adventurer.potionsConsumed.length).toBe(0);
    });

    it('should prevent selling to adventurer with insufficient gold', () => {
      const adventurer = createMockAdventurer({ gold: 5 });
      const potion = createMockPotion({ basePrice: 50 });

      component.selectedAdventurer = adventurer;
      component.potionInventory.set(potion.id, 5);

      const initialGold = component.gold;

      component.sellPotion(potion, adventurer);

      // No sale should occur
      expect(component.gold).toBe(initialGold);
      expect(adventurer.potionsConsumed.length).toBe(0);
    });

    it('should prevent selling more than 2 potions to one customer', () => {
      const adventurer = createMockAdventurer({ gold: 1000 });
      const potion = createMockPotion({ basePrice: 20 });

      shopService.addCustomer(adventurer);
      component.selectedAdventurer = adventurer;
      component.potionInventory.set(potion.id, 10);

      const initialGold = component.gold;

      // First sale should succeed (max is 2)
      component.sellPotion(potion, adventurer);
      expect(adventurer.potionsConsumed.length).toBe(1);

      const goldAfterFirstSale = component.gold;
      expect(goldAfterFirstSale).toBeGreaterThan(initialGold);

      // Second sale should succeed (max is 2)
      component.sellPotion(potion, adventurer);
      expect(adventurer.potionsConsumed.length).toBe(2);

      const goldAfterSecondSale = component.gold;
      expect(goldAfterSecondSale).toBeGreaterThan(goldAfterFirstSale);

      // Third sale should fail (max is 2)
      component.sellPotion(potion, adventurer);
      expect(adventurer.potionsConsumed.length).toBe(2); // Still just 2 potions
      expect(component.gold).toBe(goldAfterSecondSale); // No additional gold from failed sale
    });

    it('should apply dilution quality multiplier correctly', () => {
      const adventurer = createMockAdventurer({ gold: 100 });
      const potion = createMockPotion({
        effects: { healing: 50 },
      });

      shopService.addCustomer(adventurer);
      component.selectedAdventurer = adventurer;
      component.potionInventory.set(potion.id, 5);

      // Dilute the potion first to create the diluted version
      component.dilutePotion(potion);

      // Get the diluted potion from available potions
      const dilutedPotion = component.availablePotions.find((p) => p.id === `diluted-${potion.id}`);
      expect(dilutedPotion).toBeDefined();

      // Sell the diluted potion
      component.sellPotion(dilutedPotion!, adventurer);

      const soldPotion = adventurer.potionsConsumed[0];
      expect(soldPotion.quality).toBe(0.5); // Dilution multiplier from POTIONS.DILUTION_QUALITY_MULTIPLIER
    });

    it('should reduce price for diluted potions', () => {
      const potion = createMockPotion({ basePrice: 50 });

      component.potionInventory.set(potion.id, 5);

      // Dilute the potion to create the diluted version
      component.dilutePotion(potion);

      // Get the diluted potion from available potions
      const dilutedPotion = component.availablePotions.find((p) => p.id === `diluted-${potion.id}`);
      expect(dilutedPotion).toBeDefined();

      // Sell diluted potion
      const adventurer = createMockAdventurer({ gold: 100 });
      shopService.addCustomer(adventurer);
      component.selectedAdventurer = adventurer;

      const goldBefore = component.gold;
      component.sellPotion(dilutedPotion!, adventurer);
      const dilutedProfit = component.gold - goldBefore;

      // Reset for normal sale
      component.economy.gold = goldBefore;
      const adventurer2 = createMockAdventurer({ gold: 100 });
      shopService.addCustomer(adventurer2);
      component.selectedAdventurer = adventurer2;

      component.sellPotion(potion, adventurer2);
      const normalProfit = component.gold - goldBefore;

      // Diluted should be cheaper (accounting for dynamic pricing)
      expect(dilutedProfit).toBeLessThan(normalProfit);
    });

    it('should send adventurer to dungeon after purchasing max potions (2)', fakeAsync(() => {
      const adventurer = createMockAdventurer({ gold: 200 });
      const potion = createMockPotion();

      shopService.addCustomer(adventurer);
      component.selectedAdventurer = adventurer;
      component.potionInventory.set(potion.id, 5);

      expect(component.adventurersInShop).toContain(adventurer);
      expect(component.adventurersInDungeon).not.toContain(adventurer);

      // Sell first potion - customer stays in shop
      component.sellPotion(potion, adventurer);
      expect(component.adventurersInShop).toContain(adventurer);
      expect(adventurer.potionsConsumed.length).toBe(1);

      // Sell second potion - customer removed from shop after animation timeout
      component.sellPotion(potion, adventurer);
      expect(adventurer.potionsConsumed.length).toBe(2);

      // Wait for purchase animation timeout to complete removal
      tick(1000);

      expect(component.adventurersInShop).not.toContain(adventurer);
    }));
  });

  describe('Dungeon Simulation', () => {
    it('should increase survival chance for healing potions', () => {
      const adventurer = createMockAdventurer({
        currentHp: 50,
        maxHp: 100,
        survivalChance: 0.3,
      });
      const originalChance = adventurer.survivalChance;

      // Create a mock healing potion
      const healingPotion = component.orchestrator['potionCrafting'].getPotionById('basic-healing')!;
      const effects = component.getUpgradedEffects(healingPotion);

      const result = component.orchestrator['dungeonSim'].calculateSurvivalChance(
        adventurer,
        healingPotion,
        component.potionUpgrades,
        effects
      );
      expect(result).toBeGreaterThan(originalChance);
    });

    it('should decrease survival chance for diluted potions', () => {
      const adventurer = createMockAdventurer({
        currentHp: 100,
        maxHp: 100,
        survivalChance: 0.3,
      });
      const normalAdventurer = createMockAdventurer({
        currentHp: 100,
        maxHp: 100,
        survivalChance: 0.3,
      });

      const healingPotion = component.orchestrator['potionCrafting'].getPotionById('basic-healing')!;
      const dilutedPotion = component.orchestrator['potionCrafting'].createDilutedPotion(healingPotion);

      const dilutedEffects = component.getUpgradedEffects(dilutedPotion);
      const normalEffects = component.getUpgradedEffects(healingPotion);

      const dilutedResult = component.orchestrator['dungeonSim'].calculateSurvivalChance(
        adventurer,
        dilutedPotion,
        component.potionUpgrades,
        dilutedEffects
      );
      const normalResult = component.orchestrator['dungeonSim'].calculateSurvivalChance(
        normalAdventurer,
        healingPotion,
        component.potionUpgrades,
        normalEffects
      );

      expect(dilutedResult).toBeLessThan(normalResult);
    });

    it('should handle adventurer survival with loot', () => {
      const adventurer = createMockAdventurer();
      const loot = { gold: 100, items: [] };

      const initialRep = component.reputation;
      const initialSaved = component.savedCount;

      component.orchestrator['handleSurvivor'](adventurer, loot);

      expect(component.savedCount).toBe(initialSaved + 1);
      expect(component.reputation).toBeGreaterThan(initialRep);
    });

    it('should calculate tip (10% of loot gold) and add to merchant gold', () => {
      const adventurer = createMockAdventurer({
        potionsConsumed: [
          {
            potionId: 'basic-healing',
            name: 'Healing Potion',
            quality: 1.0,
            duration: 0,
            statModifiers: {},
          },
        ],
      });
      const loot = { gold: 100, items: [] };

      const initialGold = component.gold;
      const initialProfit = component.dailyProfit;
      const initialEventsCount = component.dungeonEvents.length;

      component.orchestrator['handleSurvivor'](adventurer, loot);

      // Tip should be 10% of loot gold = 10g
      expect(component.gold).toBe(initialGold + 10);
      expect(component.dailyProfit).toBe(initialProfit + 10);
      expect(component.dungeonEvents.length).toBe(initialEventsCount + 1);
    });

    it('should not give tip if adventurer bought no potions (refused)', () => {
      const adventurer = createMockAdventurer({
        potionsConsumed: [],
      });
      const loot = { gold: 100, items: [] };

      const initialGold = component.gold;

      component.orchestrator['handleSurvivor'](adventurer, loot);

      // No tip should be given (adventurer bought no potions)
      expect(component.gold).toBe(initialGold);
    });

    it('should handle adventurer death', () => {
      const adventurer = createMockAdventurer({
        potionsConsumed: [],
      });

      const initialDeaths = component.deathCount;
      const initialRep = component.reputation;

      component.orchestrator['handleDeath'](adventurer);

      expect(component.deathCount).toBe(initialDeaths + 1);
      expect(component.reputation).toBeLessThan(initialRep);
    });

    it('should handle adventurer death and track guilt', () => {
      const adventurer = createMockAdventurer({
        survivalChance: 0.2, // Below 0.3 threshold triggers wasYourFault
        potionsConsumed: [
          {
            potionId: 'basic-healing',
            name: 'Healing Potion',
            quality: 1.0,
            duration: 0,
            statModifiers: {},
          },
        ],
      });

      const initialDeaths = component.deathCount;
      const initialRep = component.reputation;
      const initialGuilt = component.guilt;

      component.orchestrator['handleDeath'](adventurer);

      expect(component.deathCount).toBe(initialDeaths + 1);
      expect(component.reputation).toBeLessThan(initialRep);
      expect(component.guilt).toBeGreaterThan(initialGuilt);
    });

    it('should handle death from diluted potion (extra reputation penalty)', () => {
      const adventurer = createMockAdventurer({
        potionsConsumed: [
          {
            potionId: 'diluted-basic-healing',
            name: 'Diluted Healing Potion',
            quality: 0.5, // Diluted
            duration: 0,
            statModifiers: {},
          },
        ],
      });

      const initialDeaths = component.deathCount;
      const initialRep = component.reputation;
      const initialDeathsByDilution = component.economy.deathsByDilution;

      component.orchestrator['handleDeath'](adventurer);

      expect(component.deathCount).toBe(initialDeaths + 1);
      expect(component.reputation).toBeLessThan(initialRep);
      expect(component.economy.deathsByDilution).toBe(initialDeathsByDilution + 1);
    });
  });

  // Day Cycle tests removed - advanceDay method no longer exists
  // Day advancement now handled through endOfDay flow which is called internally

  describe('Persistent State (Save/Load)', () => {
    it('should save game state to localStorage', () => {
      component.economy.gold = 500;
      component.economy.reputation = 75;
      component.day = 10;

      component.orchestrator['saveGameState']();

      const saved = JSON.parse(window.localStorage.getItem('potion-stand-save') || '{}');
      expect(saved.gold).toBe(500);
      expect(saved.reputation).toBe(75);
      expect(saved.day).toBe(10);
    });

    it('should restore game state from localStorage', () => {
      const savedState = {
        gold: 300,
        reputation: 80,
        day: 7,
        adventurersKilled: 5,
        adventurersSaved: 20,
        goldEarned: 400,
        totalAdventurers: 25,
        potionsSold: 18,
        deathsByPotion: 2,
        deathsByDilution: 1,
        perfectSaves: 3,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: {
          'basic-healing': 5,
          'strength-potion': 3,
        },
        potionUpgrades: { healing: 1, strength: 0, defense: 0 },
        difficultyMultiplier: 1,
        shopLevel: 1,
      };

      saveToLocalStorage(savedState);

      // Create new component to trigger load
      const newFixture = TestBed.createComponent(PotionStandComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();

      expect(newComponent.gold).toBe(300);
      expect(newComponent.reputation).toBe(80);
      expect(newComponent.day).toBe(7);
      expect(newComponent.deathCount).toBe(5);
      expect(newComponent.savedCount).toBe(20);
    });

    it('should handle corrupt save data gracefully', () => {
      window.localStorage.setItem('potion-stand-save', '{invalid json');

      // Should not crash - component should use defaults
      const newFixture = TestBed.createComponent(PotionStandComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();

      expect(newComponent.gold).toBe(100);
      expect(newComponent.reputation).toBe(50);
    });

    // resetGame test removed - method no longer exists
  });

  describe('Reputation System', () => {
    it('should gain reputation for survivor', () => {
      const initialRep = component.reputation;
      const adventurer = createMockAdventurer();

      component.orchestrator['handleSurvivor'](adventurer);

      expect(component.reputation).toBeGreaterThan(initialRep);
    });

    it('should lose reputation for death (no potion)', () => {
      const initialRep = component.reputation;
      const adventurer = createMockAdventurer({
        potionsConsumed: [],
      });

      component.orchestrator['handleDeath'](adventurer);

      expect(component.reputation).toBeLessThan(initialRep);
    });

    it('should lose more reputation for death with diluted potion', () => {
      const repBefore = component.reputation;

      const adventurer1 = createMockAdventurer({
        potionsConsumed: [{ potionId: 'basic-healing', name: 'Healing', quality: 1.0, duration: 0, statModifiers: {} }],
      });
      component.orchestrator['handleDeath'](adventurer1);
      const repAfterNormalDeath = component.reputation;

      component.economy.reputation = repBefore;

      const adventurer2 = createMockAdventurer({
        potionsConsumed: [
          { potionId: 'diluted-basic-healing', name: 'Diluted Healing', quality: 0.5, duration: 0, statModifiers: {} },
        ],
      });
      component.orchestrator['handleDeath'](adventurer2);
      const repAfterDilutedDeath = component.reputation;

      expect(repAfterDilutedDeath).toBeLessThan(repAfterNormalDeath);
    });

    it('should cap reputation at 100', () => {
      component.economy.reputation = 99;

      const adventurer = createMockAdventurer();
      component.orchestrator['handleSurvivor'](adventurer);

      expect(component.reputation).toBe(100);
    });

    it('should cap reputation at -100', () => {
      component.economy.reputation = -99;

      const adventurer = createMockAdventurer({
        potionsConsumed: [
          {
            potionId: 'basic-healing',
            name: 'Healing',
            quality: 0.5,
            duration: 0,
            statModifiers: {},
          },
        ],
      });

      // Trigger multiple deaths to force below -100
      for (let i = 0; i < 10; i++) {
        component.orchestrator['handleDeath'](adventurer);
      }

      expect(component.reputation).toBe(-100);
    });
  });

  describe('Merchant Purchase System', () => {
    it('should purchase healing potions from merchant', () => {
      component.economy.gold = 200;
      component.potionInventory.set('basic-healing', 0);

      const goldBefore = component.gold;
      const stockBefore = component.potionInventory.get('basic-healing')!;

      component.buyFromMerchant('basicHealing');

      expect(component.gold).toBeLessThan(goldBefore);
      expect(component.potionInventory.get('basic-healing')).toBe(stockBefore + 1);
    });

    it('should prevent merchant purchase when insufficient gold', () => {
      component.economy.gold = 10;

      const goldBefore = component.gold;
      const stockBefore = component.potionInventory.get('basic-healing')!;

      component.buyFromMerchant('basicHealing');

      expect(component.gold).toBe(goldBefore);
      expect(component.potionInventory.get('basic-healing')).toBe(stockBefore);
    });

    it('should purchase strength potions from merchant', () => {
      component.economy.gold = 200;
      component.potionInventory.set('strength-potion', 0);

      const goldBefore = component.gold;
      const stockBefore = component.potionInventory.get('strength-potion')!;

      component.buyFromMerchant('strengthPotion');

      expect(component.gold).toBeLessThan(goldBefore);
      expect(component.potionInventory.get('strength-potion')).toBe(stockBefore + 1);
    });

    it('should purchase defense potions from merchant', () => {
      component.economy.gold = 200;
      component.potionInventory.set('defense-potion', 0);

      const goldBefore = component.gold;
      const stockBefore = component.potionInventory.get('defense-potion')!;

      component.buyFromMerchant('defensePotion');

      expect(component.gold).toBeLessThan(goldBefore);
      expect(component.potionInventory.get('defense-potion')).toBe(stockBefore + 1);
    });
  });

  // Random Events tests removed - checkForRandomEvent method no longer exists
  // Random events are triggered via a different mechanism in the current implementation

  describe('Death Streak System', () => {
    it('should increment death streak on adventurer death', () => {
      const adventurer = createMockAdventurer({
        potionsConsumed: [],
      });

      const streakBefore = component.economy.deathStreak;

      component.orchestrator['handleDeath'](adventurer);

      expect(component.economy.deathStreak).toBe(streakBefore + 1);
    });

    it('should reset death streak on survivor', () => {
      component.economy.deathStreak = 5;

      const adventurer = createMockAdventurer();
      component.orchestrator['handleSurvivor'](adventurer);

      expect(component.economy.deathStreak).toBe(0);
    });

    it('should track max death streak', () => {
      const adventurer = createMockAdventurer({
        potionsConsumed: [],
      });

      component.economy.deathStreak = 0;
      component.economy.maxDeathStreak = 0;

      component.orchestrator['handleDeath'](adventurer);
      component.orchestrator['handleDeath'](adventurer);
      component.orchestrator['handleDeath'](adventurer);

      expect(component.economy.maxDeathStreak).toBe(3);
    });
  });

  // Shell Game (Minigame) tests removed - feature no longer exists in component

  describe('Message System', () => {
    // A fresh test fixture starts day 1, which lands directly in 'playing'
    // phase (see PotionStandComponent.ngOnInit) — the same phase where the
    // owner redo (2026-08-17) moved the visible toast off the page-level
    // .message-bar (still used outside playing phase, see the "merchant
    // phase" describe below) onto PotionShopComponent's in-flow
    // .counter-toast, so it can never cover the Ready Stock cards or their
    // sell controls. These tests exercise that in-flow path; behavior
    // (visible+auto-dismiss, replacement, reflow-restart, sr-only mirror) is
    // unchanged from before the redo.
    it('should display message', () => {
      component.orchestrator['showMessage']('Test message', 'info');

      // Message is displayed via currentMessage object (internal implementation)
      expect(component.currentMessage).toBeTruthy();
      expect(component.currentMessage?.text).toBe('Test message');
      expect(component.currentMessage?.type).toBe('info');
    });

    it('should render a visible toast mirroring currentMessage (WS2a)', () => {
      component.orchestrator['showMessage']('Test message', 'warning');
      fixture.detectChanges();

      const toast = fixture.nativeElement.querySelector('.counter-toast');
      expect(toast).toBeTruthy();
      expect(toast.textContent).toContain('Test message');
      expect(toast.classList.contains('message-warning')).toBeTrue();
      expect(toast.getAttribute('aria-hidden')).toBe('true');
    });

    it('should not render the visible toast when there is no current message', () => {
      expect(component.currentMessage).toBeNull();
      expect(fixture.nativeElement.querySelector('.counter-toast')).toBeFalsy();
    });

    it('should leave the sr-only live region announcing the same text, unchanged', () => {
      component.orchestrator['showMessage']('Test message', 'info');
      fixture.detectChanges();

      const srOnly = fixture.nativeElement.querySelector('.sr-only[role="status"]');
      expect(srOnly).toBeTruthy();
      expect(srOnly.getAttribute('aria-live')).toBe('polite');
      expect(srOnly.getAttribute('aria-atomic')).toBe('true');
      expect(srOnly.textContent.trim()).toBe('Test message');
    });

    it('should auto-dismiss the visible toast after TIMING.MESSAGE_AUTO_HIDE_MS', fakeAsync(() => {
      component.orchestrator['showMessage']('Test message', 'info');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.counter-toast')).toBeTruthy();

      tick(TIMING.MESSAGE_AUTO_HIDE_MS);
      fixture.detectChanges();

      expect(component.currentMessage).toBeNull();
      expect(fixture.nativeElement.querySelector('.counter-toast')).toBeFalsy();
    }));

    it('should replace the previous toast when a new message arrives before auto-dismiss', fakeAsync(() => {
      component.orchestrator['showMessage']('First message', 'info');
      fixture.detectChanges();
      tick(1000);

      component.orchestrator['showMessage']('Second message', 'error');
      fixture.detectChanges();

      const toasts = fixture.nativeElement.querySelectorAll('.counter-toast');
      expect(toasts.length).toBe(1);
      expect(toasts[0].textContent).toContain('Second message');
      expect(toasts[0].classList.contains('message-error')).toBeTrue();

      tick(TIMING.MESSAGE_AUTO_HIDE_MS);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.counter-toast')).toBeFalsy();
    }));

    it('should still be visible 1ms before TIMING.MESSAGE_AUTO_HIDE_MS and gone 1ms after (boundary pair)', fakeAsync(() => {
      component.orchestrator['showMessage']('Test message', 'info');
      fixture.detectChanges();

      tick(TIMING.MESSAGE_AUTO_HIDE_MS - 1);
      fixture.detectChanges();
      expect(component.currentMessage).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.counter-toast')).toBeTruthy();

      tick(2); // crosses the TIMING.MESSAGE_AUTO_HIDE_MS boundary
      fixture.detectChanges();
      expect(component.currentMessage).toBeNull();
      expect(fixture.nativeElement.querySelector('.counter-toast')).toBeFalsy();
    }));

    it('should force a reflow to restart the toast animation when a message is replaced while visible (red-team fix A)', fakeAsync(() => {
      component.orchestrator['showMessage']('First message', 'info');
      fixture.detectChanges();

      const toastEl = fixture.nativeElement.querySelector('.counter-toast') as HTMLElement;
      expect(toastEl).toBeTruthy();

      // The restart mechanism forces a reflow (reading offsetWidth) between
      // clearing and re-applying the element's animation, which is what
      // actually re-arms the CSS keyframe on a fresh clock. Spying on the
      // element's own offsetWidth getter (not a window timer — the repo rule
      // is about not spying on window timers) directly observes that this
      // fired, rather than trusting that "some time later, the DOM is fine."
      const reflowSpy = spyOnProperty(toastEl, 'offsetWidth', 'get').and.callThrough();

      tick(2000); // let time pass on the first message's CSS animation clock
      component.orchestrator['showMessage']('Second message', 'warning');
      fixture.detectChanges();

      expect(reflowSpy).toHaveBeenCalled();

      // And the replacement message still gets its own full countdown from
      // this point — the bug this fix closes was the toast vanishing well
      // before this timer completes.
      tick(TIMING.MESSAGE_AUTO_HIDE_MS - 1);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.counter-toast')).toBeTruthy();

      tick(2);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.counter-toast')).toBeFalsy();
    }));

    // Owner redo (2026-08-17) regression guard: merchant phase never had the
    // overlap defect (its full-height potions-panel has no Ready Stock cards
    // to cover) and keeps the original page-level, position:fixed toast
    // completely unchanged — "nothing in merchant phase may shift."
    describe('merchant phase (.message-bar unchanged)', () => {
      beforeEach(() => {
        component['gamePhaseService'].currentPhase.set('merchant');
        fixture.detectChanges();
      });

      it('renders the page-level .message-bar, not the in-flow counter toast', () => {
        component.orchestrator['showMessage']('Merchant message', 'info');
        fixture.detectChanges();

        const toast = fixture.nativeElement.querySelector('.message-bar');
        expect(toast).toBeTruthy();
        expect(toast.textContent).toContain('Merchant message');
        expect(fixture.nativeElement.querySelector('.counter-toast')).toBeFalsy();
      });

      it('still auto-dismisses on the same TIMING.MESSAGE_AUTO_HIDE_MS clock', fakeAsync(() => {
        component.orchestrator['showMessage']('Merchant message', 'info');
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('.message-bar')).toBeTruthy();

        tick(TIMING.MESSAGE_AUTO_HIDE_MS);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('.message-bar')).toBeFalsy();
      }));
    });
  });

  describe('Replay Tutorial — "How to Play" (WS2a)', () => {
    it('replayTutorial() should delegate to the orchestrator', () => {
      component.skipTutorial();
      expect(component.tutorialStep).toBe(0);

      component.replayTutorial();

      expect(component.tutorialStep).toBe(1);
      expect(component.isPaused).toBe(true);
    });

    it('should reopen the tutorial overlay when the header "How to Play" control is clicked', () => {
      component.skipTutorial();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.tutorial-overlay')).toBeFalsy();

      const tutorialBtn = fixture.nativeElement.querySelector('.tutorial-btn') as HTMLButtonElement;
      expect(tutorialBtn).toBeTruthy();
      tutorialBtn.click();
      fixture.detectChanges();

      expect(component.tutorialStep).toBe(1);
      expect(fixture.nativeElement.querySelector('.tutorial-overlay')).toBeTruthy();
    });
  });

  // Death Notification System tests removed - feature no longer exists in component

  describe('Dungeon Log', () => {
    it('should add event to dungeon log', () => {
      const initialLength = component.dungeonEvents.length;

      component.orchestrator['addDungeonEvent']({
        id: 'test-event',
        timestamp: Date.now(),
        adventurerId: '123',
        eventType: 'enter',
        message: 'Test entered dungeon',
        severity: 'info',
      });

      expect(component.dungeonEvents.length).toBe(initialLength + 1);
      expect(component.dungeonEvents[0].message).toBe('Test entered dungeon');
    });

    it('should limit dungeon log to display limit', () => {
      // Fill log beyond limit
      for (let i = 0; i < 150; i++) {
        component.orchestrator['addDungeonEvent']({
          id: `event-${i}`,
          timestamp: Date.now(),
          adventurerId: '123',
          eventType: 'combat',
          message: `Event ${i}`,
          severity: 'info',
        });
      }

      expect(component.dungeonEvents.length).toBeLessThanOrEqual(100);
    });

    // Test removed - scroll behavior no longer exists in addDungeonEvent
    // The dungeonLogRef ViewChild is defined but never used for scrolling
  });

  // Game Over Conditions tests removed - checkGameOverConditions method no longer exists
  // Game over is now triggered during endOfDay/advanceDay flow

  describe('Difficulty Scaling', () => {
    it('should increase dungeon floor every 3 days', () => {
      component.day = 1;
      component.economy.currentFloor = 1;
      component.orchestrator['updateDungeonFloor']();
      expect(component.currentFloor).toBe(1); // Day 1: floor 1

      component.day = 4;
      component.orchestrator['updateDungeonFloor']();
      expect(component.currentFloor).toBe(2); // Day 4: floor 2

      component.day = 7;
      component.orchestrator['updateDungeonFloor']();
      expect(component.currentFloor).toBe(3); // Day 7: floor 3
    });

    it('should cap dungeon floor at MAX_FLOOR (15)', () => {
      component.day = 100;
      component.economy.currentFloor = 1; // Reset so updateDungeonFloor sees newFloor > currentFloor
      component.orchestrator['updateDungeonFloor']();
      expect(component.currentFloor).toBe(DUNGEON.MAX_FLOOR);
      expect(component.currentFloor).toBe(15);
    });

    it('should increase dungeon difficulty with floor level', () => {
      component.day = 1;
      component.economy.currentFloor = 1;
      component.orchestrator['updateDungeonFloor']();
      const difficultyFloor1 = component.dungeonDifficulty;

      component.day = 7;
      component.orchestrator['updateDungeonFloor']();
      const difficultyFloor3 = component.dungeonDifficulty;

      expect(difficultyFloor3).toBeGreaterThan(difficultyFloor1);
    });
  });

  // Guild Inspection Event tests removed - feature no longer exists in component

  describe('Customer Review System', () => {
    it('should generate positive review for survivor', () => {
      const adventurer = createMockAdventurer({
        name: 'Happy Customer',
        potionsConsumed: [
          {
            potionId: 'basic-healing',
            name: 'Healing Potion',
            quality: 1.0,
            duration: 0,
            statModifiers: {},
          },
        ],
      });

      const initialReviews = component.customerReviews.length;

      component.orchestrator['handleSurvivor'](adventurer);

      // Reviews are randomly generated (70% chance), so check if one was added
      if (component.customerReviews.length > initialReviews) {
        expect(component.customerReviews[0].survived).toBe(true);
        expect(component.customerReviews[0].rating).toBeGreaterThanOrEqual(3);
      }
    });

    // Test for trimCustomerReviews removed - method no longer exists
    // Reviews are now limited automatically within the handleSurvivor/handleDeath methods
  });

  describe('Time of Day', () => {
    it('should change from Morning to Afternoon', () => {
      component.gameTime = 29; // One tick before MORNING_END (30)
      component.timeOfDay = 'Morning';
      component.orchestrator['updateTimeOfDay'](); // gameTime becomes 30
      expect(component.timeOfDay).toBe('Afternoon');
    });

    it('should change from Afternoon to Evening', () => {
      component.gameTime = 59; // One tick before AFTERNOON_END (60)
      component.timeOfDay = 'Afternoon';
      component.orchestrator['updateTimeOfDay'](); // gameTime becomes 60
      expect(component.timeOfDay).toBe('Evening');
    });

    it('should change from Evening to Night', () => {
      component.gameTime = 89; // One tick before EVENING_END (90)
      component.timeOfDay = 'Evening';
      component.orchestrator['updateTimeOfDay'](); // gameTime becomes 90
      expect(component.timeOfDay).toBe('Night');
    });
  });

  describe('Save Game State - Full Coverage', () => {
    it('should save potionUpgrades to localStorage', () => {
      component.potionUpgrades = { healing: 2, strength: 1, defense: 0, speed: 0, luck: 0 };

      component.orchestrator['saveGameState']();

      const saved = JSON.parse(window.localStorage.getItem('potion-stand-save') || '{}');
      expect(saved.potionUpgrades).toEqual({ healing: 2, strength: 1, defense: 0, speed: 0, luck: 0 });
    });

    it('should save encounter tracking fields to localStorage', () => {
      component.economy.encountersSurvived = 15;
      component.economy.bossesDefeated = 2;
      component.economy.combosTriggered = 8;

      component.orchestrator['saveGameState']();

      const saved = JSON.parse(window.localStorage.getItem('potion-stand-save') || '{}');
      expect(saved.encountersSurvived).toBe(15);
      expect(saved.bossesDefeated).toBe(2);
      expect(saved.combosTriggered).toBe(8);
    });

    it('should NOT save zombie fields to localStorage', () => {
      component.orchestrator['saveGameState']();

      const saved = JSON.parse(window.localStorage.getItem('potion-stand-save') || '{}');
      expect(saved.ingredientInventory).toBeUndefined();
      expect(saved.unlockedRecipes).toBeUndefined();
      expect(saved.upgrades).toBeUndefined();
      expect(saved.autoBrewEnabled).toBeUndefined();
      expect(saved.warningsEnabled).toBeUndefined();
    });
  });

  describe('Load Game State - Backward Compatibility', () => {
    it('should load potionUpgrades from localStorage', () => {
      const savedState = {
        gold: 250,
        reputation: 75,
        day: 5,
        adventurersKilled: 10,
        adventurersSaved: 25,
        goldEarned: 500,
        totalAdventurers: 35,
        potionsSold: 30,
        deathsByPotion: 3,
        deathsByDilution: 2,
        perfectSaves: 5,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: {},
        potionUpgrades: { healing: 1, strength: 2, defense: 0 },
        difficultyMultiplier: 1,
        shopLevel: 1,
      };

      saveToLocalStorage(savedState);

      const newFixture = TestBed.createComponent(PotionStandComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();

      expect(newComponent.potionUpgrades).toEqual({ healing: 1, strength: 2, defense: 0, speed: 0, luck: 0 });
    });

    it('should use default potionUpgrades if missing from save', () => {
      const savedState = {
        gold: 250,
        reputation: 75,
        day: 5,
        adventurersKilled: 10,
        adventurersSaved: 25,
        goldEarned: 500,
        totalAdventurers: 35,
        potionsSold: 30,
        deathsByPotion: 3,
        deathsByDilution: 2,
        perfectSaves: 5,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: {},
        difficultyMultiplier: 1,
        shopLevel: 1,
      };

      saveToLocalStorage(savedState);

      const newFixture = TestBed.createComponent(PotionStandComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();

      expect(newComponent.potionUpgrades).toEqual({ healing: 0, strength: 0, defense: 0, speed: 0, luck: 0 });
    });

    it('should ignore zombie fields in old saves', () => {
      const savedState = {
        gold: 250,
        reputation: 75,
        day: 5,
        adventurersKilled: 10,
        adventurersSaved: 25,
        goldEarned: 500,
        totalAdventurers: 35,
        potionsSold: 30,
        deathsByPotion: 3,
        deathsByDilution: 2,
        perfectSaves: 5,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: {},
        ingredientInventory: { 'old-ingredient': 10 },
        unlockedRecipes: ['old-recipe'],
        upgrades: [{ id: 'old-upgrade' }],
        autoBrewEnabled: true,
        warningsEnabled: false,
        potionUpgrades: { healing: 1, strength: 0, defense: 0 },
        difficultyMultiplier: 1,
        shopLevel: 1,
      };

      saveToLocalStorage(savedState);

      const newFixture = TestBed.createComponent(PotionStandComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();

      // Should load successfully without errors
      expect(newComponent.gold).toBe(250);
      expect(newComponent.reputation).toBe(75);
    });

    it('should persist and restore all three event flags', () => {
      component.stormActive = true;
      component.dragonActive = true;
      component.potionShortageActive = true;

      component.orchestrator['saveGameState']();

      const saved = JSON.parse(window.localStorage.getItem('potion-stand-save') || '{}');
      expect(saved.stormActive).toBe(true);
      expect(saved.dragonActive).toBe(true);
      expect(saved.potionShortageActive).toBe(true);

      const newFixture = TestBed.createComponent(PotionStandComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();

      expect(newComponent.stormActive).toBe(true);
      expect(newComponent.dragonActive).toBe(true);
      expect(newComponent.potionShortageActive).toBe(true);
    });

    it('should default event flags to false when missing from old saves', () => {
      const savedState = {
        gold: 100,
        reputation: 50,
        day: 3,
        adventurersKilled: 5,
        adventurersSaved: 10,
        goldEarned: 200,
        totalAdventurers: 15,
        potionsSold: 10,
        deathsByPotion: 1,
        deathsByDilution: 0,
        perfectSaves: 2,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: {},
        potionUpgrades: { healing: 0, strength: 0, defense: 0 },
        difficultyMultiplier: 1,
        shopLevel: 1,
        // No event flags — simulates pre-event-flag save
      };

      saveToLocalStorage(savedState);

      const newFixture = TestBed.createComponent(PotionStandComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();

      expect(newComponent.stormActive).toBe(false);
      expect(newComponent.dragonActive).toBe(false);
      expect(newComponent.potionShortageActive).toBe(false);
    });
  });

  describe('Accessibility', () => {
    it('should have a role="status" live region for screen readers', () => {
      // The sr-only status region is the one with aria-atomic="true"
      const statusRegion = fixture.nativeElement.querySelector('[role="status"][aria-atomic="true"]');
      expect(statusRegion).toBeTruthy();
    });

    it('should have aria-live="polite" on the status region', () => {
      const statusRegion = fixture.nativeElement.querySelector('[role="status"][aria-atomic="true"]');
      expect(statusRegion).toBeTruthy();
      expect(statusRegion.getAttribute('aria-live')).toBe('polite');
    });

    it('should have aria-atomic="true" on the status region', () => {
      const statusRegion = fixture.nativeElement.querySelector('[role="status"][aria-atomic="true"]');
      expect(statusRegion).toBeTruthy();
      expect(statusRegion.getAttribute('aria-atomic')).toBe('true');
    });

    it('should have the sr-only class on the status region', () => {
      const statusRegion = fixture.nativeElement.querySelector('[role="status"][aria-atomic="true"]');
      expect(statusRegion).toBeTruthy();
      expect(statusRegion.classList.contains('sr-only')).toBeTrue();
    });

    it('event banner should have role="status" and aria-live="polite" when visible (A11Y-2)', () => {
      // The event banner conveys strategy-affecting info, so it must be announced by AT.
      // Drive a currentEvent onto the orchestrator to make the banner render.
      component.orchestrator['currentEvent'] = {
        title: 'Test Storm',
        description: 'Roads are closed.',
        icon: 'storm',
      };
      // bumpState() marks the OnPush component dirty so detectChanges() re-renders the template.
      component['bumpState']();
      fixture.detectChanges();

      const banner = fixture.nativeElement.querySelector('.event-banner');
      expect(banner).toBeTruthy();
      expect(banner.getAttribute('role')).toBe('status');
      expect(banner.getAttribute('aria-live')).toBe('polite');
      // Confirm the real template binding rendered the event (not just a static element):
      // the announced text must include the event content AT users rely on.
      expect(banner.textContent).toContain('Test Storm');
    });
  });

  describe('Mobile Tab Navigation', () => {
    it('should default mobileActiveTab to "adventure"', () => {
      expect(component.mobileActiveTab()).toBe('customers');
    });

    it('should change active tab to "potions" via setMobileTab', () => {
      component.setMobileTab('potions');
      expect(component.mobileActiveTab()).toBe('potions');
    });

    it('should change active tab back to "adventure" via setMobileTab', () => {
      component.setMobileTab('potions');
      component.setMobileTab('customers');
      expect(component.mobileActiveTab()).toBe('customers');
    });

    it('should render the mobile tab bar with role="tablist"', () => {
      fixture.detectChanges();
      const tabList = fixture.nativeElement.querySelector('[role="tablist"]');
      expect(tabList).toBeTruthy();
    });

    it('should render three tab buttons', () => {
      fixture.detectChanges();
      const tabButtons = fixture.nativeElement.querySelectorAll('.mobile-tabs [role="tab"]');
      expect(tabButtons.length).toBe(3);
    });

    it('adventure tab should have aria-selected="true" when mobileActiveTab is "adventure"', () => {
      // Use setMobileTab to ensure markForCheck is called (OnPush component)
      component.setMobileTab('potions');
      fixture.detectChanges();
      component.setMobileTab('customers');
      fixture.detectChanges();
      const tabs = fixture.nativeElement.querySelectorAll('.mobile-tabs [role="tab"]');
      expect(tabs[0].getAttribute('aria-selected')).toBe('true');
      expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    });

    it('potions tab should have aria-selected="true" when mobileActiveTab is "potions"', () => {
      // Use setMobileTab to ensure markForCheck is called (OnPush component)
      component.setMobileTab('potions');
      fixture.detectChanges();
      const tabs = fixture.nativeElement.querySelectorAll('.mobile-tabs [role="tab"]');
      expect(tabs[0].getAttribute('aria-selected')).toBe('false');
      expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    });

    describe('ARIA tablist wiring (A11Y-6)', () => {
      it('each tab button should have a static id', () => {
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('#tab-customers')).toBeTruthy();
        expect(fixture.nativeElement.querySelector('#tab-potions')).toBeTruthy();
        expect(fixture.nativeElement.querySelector('#tab-dungeon')).toBeTruthy();
      });

      it('each tab button should have aria-controls pointing to its panel', () => {
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('#tab-customers').getAttribute('aria-controls')).toBe(
          'panel-customers'
        );
        expect(fixture.nativeElement.querySelector('#tab-potions').getAttribute('aria-controls')).toBe('panel-potions');
        expect(fixture.nativeElement.querySelector('#tab-dungeon').getAttribute('aria-controls')).toBe('panel-dungeon');
      });

      it('each panel should have the matching id', () => {
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('#panel-customers')).toBeTruthy();
        expect(fixture.nativeElement.querySelector('#panel-potions')).toBeTruthy();
        expect(fixture.nativeElement.querySelector('#panel-dungeon')).toBeTruthy();
      });

      it('active tab should have tabindex=0, inactive tabs tabindex=-1', () => {
        component.setMobileTab('potions');
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('#tab-customers').getAttribute('tabindex')).toBe('-1');
        expect(fixture.nativeElement.querySelector('#tab-potions').getAttribute('tabindex')).toBe('0');
        expect(fixture.nativeElement.querySelector('#tab-dungeon').getAttribute('tabindex')).toBe('-1');
      });

      it('ArrowRight moves to the next tab when on mobile viewport', () => {
        // jsdom defaults innerWidth to 1024, so we fake a mobile width
        spyOnProperty(window, 'innerWidth', 'get').and.returnValue(375);
        component.setMobileTab('customers');
        fixture.detectChanges();

        const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
        component.onMobileTabKeydown(event);

        expect(component.mobileActiveTab()).toBe('potions');
      });

      it('ArrowLeft wraps from first tab to last tab', () => {
        spyOnProperty(window, 'innerWidth', 'get').and.returnValue(375);
        component.setMobileTab('customers');
        fixture.detectChanges();

        const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
        component.onMobileTabKeydown(event);

        expect(component.mobileActiveTab()).toBe('dungeon');
      });

      it('ArrowRight does not change tab on non-mobile viewport', () => {
        // Explicitly force a desktop-width viewport (1024px) so the test is
        // not sensitive to the Chrome Headless default or spy leak from the
        // previous mobile-viewport test.
        spyOnProperty(window, 'innerWidth', 'get').and.returnValue(1024);
        component.setMobileTab('customers');
        fixture.detectChanges();

        const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
        component.onMobileTabKeydown(event);

        // Should remain on customers — tablist nav is only active on mobile
        expect(component.mobileActiveTab()).toBe('customers');
      });

      it('tab badge renders aria-hidden when adventurers are in the dungeon', () => {
        // Force the badge to actually render (no guarded-to-pass): it shows when
        // playing AND activeAdventurersInDungeon is non-empty. Spy the orchestrator
        // getter the component forwards to, bypassing the derived/cached path.
        spyOnProperty(component.orchestrator, 'activeAdventurersInDungeon', 'get').and.returnValue([
          { id: 'a1', name: 'Test', maxHp: 100, currentHp: 100 } as unknown as Adventurer,
        ]);
        component['gamePhaseService'].currentPhase.set('playing');
        component.setMobileTab('dungeon');
        fixture.detectChanges();

        const badge = fixture.nativeElement.querySelector('.tab-badge');
        expect(badge).not.toBeNull(); // fails hard if the badge never rendered
        expect(badge.getAttribute('aria-hidden')).toBe('true');
      });
    });
  });

  describe('Help overlay wiring (A11Y-5 / C7)', () => {
    it('showHelpOverlay should be false by default', () => {
      expect(component.showHelpOverlay()).toBe(false);
    });

    it('(openHelp) binding on app-game-header sets showHelpOverlay to true', () => {
      const header = fixture.debugElement.query((el) => el.name === 'app-game-header');
      // Emit the output directly, simulating a click on the ? button
      header?.triggerEventHandler('openHelp', null);
      expect(component.showHelpOverlay()).toBe(true);
    });
  });

  // Pins the contract that the parent's [attr.data-state-tick] binding to
  // stateTickAttr() is what wires orchestrator emissions into OnPush. If
  // someone removes the binding from the template, this test regresses.
  describe('OnPush wiring — stateTick contract', () => {
    function getTickAttr(): string | null {
      const root = fixture.nativeElement.querySelector('.potion-stand-container');
      return root?.getAttribute('data-state-tick') ?? null;
    }

    it('renders [data-state-tick] on .potion-stand-container', () => {
      fixture.detectChanges();
      expect(getTickAttr()).not.toBeNull();
    });

    it('orchestrator stateChanged$ emission causes the rendered tick attribute to advance', () => {
      fixture.detectChanges();
      const before = getTickAttr();
      // Trigger a notify path the parent subscribes to. Use the public emission;
      // the subscription bumps stateTick which the template reads.
      component.orchestrator.stateChanged$.next();
      fixture.detectChanges();
      expect(getTickAttr()).not.toBe(before);
    });
  });

  describe('Keyboard Shortcuts', () => {
    function dispatchKey(key: string, options: Partial<KeyboardEventInit> = {}): void {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
      document.dispatchEvent(event);
    }

    beforeEach(() => {
      // Ensure playing phase and no modals
      component['gamePhaseService'].currentPhase.set('playing');
    });

    it('should toggle pause when P is pressed', () => {
      // Tutorial pauses game on day 1; skip tutorial first
      component.skipTutorial();
      expect(component.isPaused).toBe(false);
      dispatchKey('p');
      expect(component.isPaused).toBe(true);
    });

    it('should cycle speed when S is pressed', () => {
      expect(component.gameSpeed).toBe(1);
      dispatchKey('s');
      expect(component.gameSpeed).toBe(2);
    });

    it('should select first customer when Q is pressed', () => {
      const adv1 = createMockAdventurer({ id: 'adv-q1', name: 'Alpha' });
      const adv2 = createMockAdventurer({ id: 'adv-q2', name: 'Beta' });
      component.adventurersInShop = [adv1, adv2];
      component.selectedAdventurer = null;

      dispatchKey('q');

      expect((component.selectedAdventurer as Adventurer | null)?.id).toBe('adv-q1');
    });

    it('should sell first available potion to selected customer when 1 is pressed', () => {
      const adventurer = createMockAdventurer({ gold: 200 });
      component.adventurersInShop = [adventurer];
      component.selectedAdventurer = adventurer;
      component.potionInventory.set('basic-healing', 3);
      spyOn(component.orchestrator, 'sellPotion');

      dispatchKey('1');

      expect(component.orchestrator.sellPotion).toHaveBeenCalled();
    });

    it('should sell recommended potion when Space is pressed', () => {
      const adventurer = createMockAdventurer({ gold: 200 });
      const potion = createMockPotion({ id: 'basic-healing' });
      component.adventurersInShop = [adventurer];
      component.selectedAdventurer = adventurer;
      component.potionInventory.set('basic-healing', 3);
      spyOn(component.orchestrator, 'getRecommendedPotion').and.returnValue(potion);
      spyOn(component.orchestrator, 'sellPotion');

      dispatchKey(' ');

      expect(component.orchestrator.sellPotion).toHaveBeenCalledWith(potion, adventurer, 'fair');
    });

    it('should toggle help overlay when ? is pressed', () => {
      expect(component.showHelpOverlay()).toBe(false);
      dispatchKey('?');
      expect(component.showHelpOverlay()).toBe(true);
      dispatchKey('?');
      expect(component.showHelpOverlay()).toBe(false);
    });

    it('should ignore keyboard when day-summary modal is open', () => {
      component['gamePhaseService'].currentPhase.set('day-summary');
      const initialPaused = component.isPaused;

      dispatchKey('p');

      expect(component.isPaused).toBe(initialPaused);
    });

    it('should ignore keyboard when game-over modal is open', () => {
      component['gamePhaseService'].currentPhase.set('game-over');
      const initialSpeed = component.gameSpeed;

      dispatchKey('s');

      expect(component.gameSpeed).toBe(initialSpeed);
    });

    it('should ignore keyboard shortcuts when Ctrl is held', () => {
      const initialPaused = component.isPaused;
      dispatchKey('p', { ctrlKey: true });
      expect(component.isPaused).toBe(initialPaused);
    });

    it('should ignore keyboard shortcuts when Alt is held', () => {
      const initialPaused = component.isPaused;
      dispatchKey('p', { altKey: true });
      expect(component.isPaused).toBe(initialPaused);
    });

    it('should close help overlay on Escape', () => {
      component.showHelpOverlay.set(true);

      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      document.dispatchEvent(event);

      expect(component.showHelpOverlay()).toBe(false);
    });

    it('should not sell potion via number key when no customer selected', () => {
      component.selectedAdventurer = null;
      component.potionInventory.set('basic-healing', 3);
      spyOn(component.orchestrator, 'sellPotion');

      dispatchKey('1');

      expect(component.orchestrator.sellPotion).not.toHaveBeenCalled();
    });
  });

  describe('Guilt Vignette', () => {
    let cdr: ChangeDetectorRef;

    beforeEach(() => {
      cdr = fixture.debugElement.injector.get(ChangeDetectorRef);
    });

    it('should render the guilt-vignette element inside the container', () => {
      const vignette = fixture.nativeElement.querySelector('.guilt-vignette');
      expect(vignette).toBeTruthy();
    });

    it('should set opacity to 0 when guilt is 0', () => {
      component.economy.guilt = 0;
      cdr.markForCheck();
      fixture.detectChanges();
      const vignette = fixture.nativeElement.querySelector('.guilt-vignette') as HTMLElement;
      expect(vignette.style.opacity).toBe('0');
    });

    it('should set opacity to 0.4 when guilt equals maxGuilt', () => {
      component.economy.guilt = component.maxGuilt;
      cdr.markForCheck();
      fixture.detectChanges();
      const vignette = fixture.nativeElement.querySelector('.guilt-vignette') as HTMLElement;
      expect(Number(vignette.style.opacity)).toBeCloseTo(0.4, 5);
    });

    it('should set opacity proportional to guilt level', () => {
      component.economy.guilt = component.maxGuilt / 2;
      cdr.markForCheck();
      fixture.detectChanges();
      const vignette = fixture.nativeElement.querySelector('.guilt-vignette') as HTMLElement;
      expect(Number(vignette.style.opacity)).toBeCloseTo(0.2, 5);
    });

    it('should bind --guilt-intensity CSS custom property to guilt/maxGuilt ratio', () => {
      component.economy.guilt = component.maxGuilt / 2;
      cdr.markForCheck();
      fixture.detectChanges();
      const container = fixture.nativeElement.querySelector('.potion-stand-container') as HTMLElement;
      const rawValue = container.style.getPropertyValue('--guilt-intensity');
      expect(Number(rawValue)).toBeCloseTo(0.5, 5);
    });

    it('should set --guilt-intensity to 0 when guilt is 0', () => {
      component.economy.guilt = 0;
      cdr.markForCheck();
      fixture.detectChanges();
      const container = fixture.nativeElement.querySelector('.potion-stand-container') as HTMLElement;
      const rawValue = container.style.getPropertyValue('--guilt-intensity');
      expect(Number(rawValue)).toBe(0);
    });

    it('should set --guilt-intensity to 1 when guilt equals maxGuilt', () => {
      component.economy.guilt = component.maxGuilt;
      cdr.markForCheck();
      fixture.detectChanges();
      const container = fixture.nativeElement.querySelector('.potion-stand-container') as HTMLElement;
      const rawValue = container.style.getPropertyValue('--guilt-intensity');
      expect(Number(rawValue)).toBeCloseTo(1, 5);
    });
  });

  // Phase 3b — pins the parent → orchestrator → gameLoop teardown contract.
  // Belt-and-suspenders: ngOnDestroy must be safe to call once OR twice, must
  // not throw on a fresh fixture (no game state yet), and must mark the
  // orchestrator as destroyed so deferred safeTimeout callbacks become no-ops.
  describe('Teardown contract (Phase 3b)', () => {
    it('ngOnDestroy completes without throwing', () => {
      expect(() => component.ngOnDestroy()).not.toThrow();
    });

    it('ngOnDestroy is idempotent — calling twice does not throw', () => {
      component.ngOnDestroy();
      expect(() => component.ngOnDestroy()).not.toThrow();
    });

    it('orchestrator.cleanup flips destroyed flag so deferred callbacks no-op', () => {
      component.ngOnDestroy();
      // The destroyed flag is private; observe via behaviour: stateChanged$ is
      // closed, so any subsequent next() is a no-op (we just verify no throw).
      expect(() => component.orchestrator.stateChanged$.next()).not.toThrow();
    });

    // Phase 8b — auto-pause on document.hidden, restore on visible. Don't
    // override an explicit user pause.
    //
    // The fakes below install a *getter* (not a value descriptor) so they
    // don't break `spyOnProperty(document, 'hidden', 'get')` in downstream
    // specs (landing-sequence, etc.) — same lesson as the innerWidth fix
    // earlier in this branch.
    function fakeDocumentHidden(value: boolean): void {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => value,
      });
    }

    it('auto-pauses the game loop when the document goes hidden', () => {
      component.skipTutorial();
      expect(component.isPaused).toBe(false);

      fakeDocumentHidden(true);
      document.dispatchEvent(new Event('visibilitychange'));

      expect(component.isPaused).toBe(true);
    });

    it('restores running state when the document becomes visible again', () => {
      component.skipTutorial();
      fakeDocumentHidden(true);
      document.dispatchEvent(new Event('visibilitychange'));
      expect(component.isPaused).toBe(true);

      fakeDocumentHidden(false);
      document.dispatchEvent(new Event('visibilitychange'));
      expect(component.isPaused).toBe(false);
    });

    it('does not auto-resume if the user paused before tab went hidden', () => {
      component.skipTutorial();
      component.togglePause();
      expect(component.isPaused).toBe(true);

      fakeDocumentHidden(true);
      document.dispatchEvent(new Event('visibilitychange'));
      expect(component.isPaused).toBe(true); // still paused (user-initiated)

      fakeDocumentHidden(false);
      document.dispatchEvent(new Event('visibilitychange'));
      // Stays paused — we never owned this pause
      expect(component.isPaused).toBe(true);
    });

    it('mobileTabTimers are flushed on destroy so no stray setTimeout fires', () => {
      // Push a timer directly via the private array. We avoid reaching for
      // `window.innerWidth` (which would force a global getter→value swap
      // and break `spyOnProperty(window, 'innerWidth', 'get')` in
      // downstream specs).
      const internalArr = (component as unknown as { mobileTabTimers: ReturnType<typeof setTimeout>[] })
        .mobileTabTimers;
      const startLen = internalArr.length;
      const id = setTimeout(() => {
        // Empty body; the timer ID is what matters — destroy must clear it.
      }, 5000);
      internalArr.push(id);
      expect(internalArr.length).toBe(startLen + 1);
      component.ngOnDestroy();
      expect(internalArr.length).toBe(0);
    });
  });
});
