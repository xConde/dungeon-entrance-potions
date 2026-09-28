import { TestBed } from '@angular/core/testing';
import { ShopService } from './shop.service';
import { Adventurer, AdventurerClass, AdventurerStatus } from '../models/adventurer.model';
import { Potion } from '../models/potion.model';
import { SHOP } from '../config/game-config';

describe('ShopService', () => {
  let service: ShopService;

  // Test fixtures
  const createMockAdventurer = (overrides: Partial<Adventurer> = {}): Adventurer => ({
    id: 'test-adventurer-1',
    name: 'Test Knight',
    class: AdventurerClass.Warrior,
    level: 5,
    currentHp: 80,
    maxHp: 100,
    strength: 15,
    defense: 12,
    magic: 5,
    luck: 8,
    gold: 100,
    status: AdventurerStatus.Shopping,
    potionsConsumed: [],
    survivalChance: 0.5,
    enterTime: Date.now(),
    desperate: false,
    frugal: false,
    trusting: false,
    experienced: false,
    ...overrides,
  });

  const createMockPotion = (overrides: Partial<Potion> = {}): Potion => ({
    id: 'basic-healing',
    name: 'Basic Healing',
    basePrice: 25,
    quality: 1,
    effects: { healing: 30 },
    isDiluted: false,
    description: 'A basic healing potion',
    color: '#dc2626',
    particleColor: '#ef4444',
    viscosity: 'normal',
    recipe: { ingredients: [], requiredLevel: 1, craftingTime: 1, difficulty: 'easy' },
    discovered: true,
    timesCrafted: 0,
    deathsCaused: 0,
    livesSaved: 0,
    customerRating: 3,
    ...overrides,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ShopService],
    });
    service = TestBed.inject(ShopService);
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  describe('initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should start with empty customer queue', () => {
      expect(service.adventurersInShop).toEqual([]);
    });

    it('should start with no selected customer', () => {
      expect(service.selectedAdventurer).toBeNull();
    });

    it('should initialize merchant inventory', () => {
      expect(service.merchantInventory.basicHealing.available).toBe(5);
      expect(service.merchantInventory.strengthPotion.available).toBe(3);
      expect(service.merchantInventory.defensePotion.available).toBe(3);
    });
  });

  describe('customer queue management', () => {
    it('should add customer to queue', () => {
      const adventurer = createMockAdventurer();
      service.addCustomer(adventurer);
      expect(service.adventurersInShop.length).toBe(1);
      expect(service.adventurersInShop[0].id).toBe(adventurer.id);
    });

    it('should auto-select first customer when queue was empty', () => {
      const adventurer = createMockAdventurer();
      service.addCustomer(adventurer);
      expect(service.selectedAdventurer?.id).toBe(adventurer.id);
    });

    it('should not change selection when adding second customer', () => {
      const first = createMockAdventurer({ id: 'first' });
      const second = createMockAdventurer({ id: 'second' });

      service.addCustomer(first);
      service.addCustomer(second);

      expect(service.selectedAdventurer?.id).toBe('first');
    });

    it('should allow manual customer selection', () => {
      const first = createMockAdventurer({ id: 'first' });
      const second = createMockAdventurer({ id: 'second' });

      service.addCustomer(first);
      service.addCustomer(second);
      service.selectCustomer(second);

      expect(service.selectedAdventurer?.id).toBe('second');
    });

    it('should remove customer from queue', () => {
      const adventurer = createMockAdventurer();
      service.addCustomer(adventurer);
      service.removeCustomer(adventurer);
      expect(service.adventurersInShop.length).toBe(0);
    });

    it('should clear selection when selected customer is removed', () => {
      const adventurer = createMockAdventurer();
      service.addCustomer(adventurer);
      expect(service.selectedAdventurer).not.toBeNull();

      service.removeCustomer(adventurer);
      expect(service.selectedAdventurer).toBeNull();
    });

    it('should auto-select next customer when current is removed', () => {
      const first = createMockAdventurer({ id: 'first' });
      const second = createMockAdventurer({ id: 'second' });

      service.addCustomer(first);
      service.addCustomer(second);
      service.removeCustomer(first);

      expect(service.selectedAdventurer?.id).toBe('second');
    });

    it('should clear all customers', () => {
      service.addCustomer(createMockAdventurer({ id: 'a' }));
      service.addCustomer(createMockAdventurer({ id: 'b' }));

      service.clearCustomers();

      expect(service.adventurersInShop.length).toBe(0);
      expect(service.selectedAdventurer).toBeNull();
    });
  });

  describe('queue timeout processing', () => {
    it('should remove customers who waited too long', () => {
      const oldCustomer = createMockAdventurer({
        id: 'old',
        enterTime: Date.now() - 31000, // 31 seconds ago
      });
      const newCustomer = createMockAdventurer({
        id: 'new',
        enterTime: Date.now(), // Just arrived
      });

      service.adventurersInShop = [oldCustomer, newCustomer];
      const left = service.processQueue();

      expect(left.length).toBe(1);
      expect(left[0].id).toBe('old');
      expect(service.adventurersInShop.length).toBe(1);
      expect(service.adventurersInShop[0].id).toBe('new');
    });

    it('should emit customerLeft event for each timed-out customer', (done) => {
      const oldCustomer = createMockAdventurer({
        id: 'old',
        enterTime: Date.now() - 31000,
      });

      service.adventurersInShop = [oldCustomer];

      service.customerLeft$.subscribe((adv) => {
        expect(adv.id).toBe('old');
        done();
      });

      service.processQueue();
    });

    it('should clear selection if selected customer times out', () => {
      const customer = createMockAdventurer({
        enterTime: Date.now() - 31000,
      });

      service.addCustomer(customer);
      expect(service.selectedAdventurer).not.toBeNull();

      service.processQueue();
      expect(service.selectedAdventurer).toBeNull();
    });

    it('should reset customer enter times', () => {
      const customer = createMockAdventurer({
        enterTime: Date.now() - 20000,
      });

      service.adventurersInShop = [customer];
      const oldTime = service.adventurersInShop[0].enterTime;

      service.resetCustomerEnterTimes();

      expect(service.adventurersInShop[0].enterTime).toBeGreaterThan(oldTime);
    });
  });

  describe('price calculation', () => {
    it('should return base price for normal customer', () => {
      const potion = createMockPotion({ basePrice: 25 });
      const customer = createMockAdventurer();

      const price = service.calculatePrice(potion, customer, 50);

      // Base price + reputation modifier (50/200 = 0.25)
      expect(price).toBe(Math.floor(25 * 1.25));
    });

    it('should apply desperate modifier (+50%)', () => {
      const potion = createMockPotion({ basePrice: 25 });
      const customer = createMockAdventurer({ desperate: true });

      const price = service.calculatePrice(potion, customer, 0);

      expect(price).toBe(Math.floor(25 * 1.5));
    });

    it('should apply frugal modifier (-20%)', () => {
      const potion = createMockPotion({ basePrice: 25 });
      const customer = createMockAdventurer({ frugal: true });

      const price = service.calculatePrice(potion, customer, 0);

      expect(price).toBe(Math.floor(25 * 0.8));
    });

    it('should scale with reputation', () => {
      const potion = createMockPotion({ basePrice: 100 });
      const customer = createMockAdventurer();

      const lowRepPrice = service.calculatePrice(potion, customer, 0);
      const highRepPrice = service.calculatePrice(potion, customer, 100);

      expect(highRepPrice).toBeGreaterThan(lowRepPrice);
    });
  });

  describe('sale validation', () => {
    it('should reject sale with no adventurer selected', () => {
      const potion = createMockPotion();
      const result = service.validateSale(potion, null, 5, 25);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Select an adventurer');
    });

    it('should reject sale to customer who already purchased max potions', () => {
      const customer = createMockAdventurer({
        potionsConsumed: [
          {
            potionId: 'potion1',
            name: 'Potion 1',
            quality: 1,
            duration: 0,
            statModifiers: {},
          },
          {
            potionId: 'potion2',
            name: 'Potion 2',
            quality: 1,
            duration: 0,
            statModifiers: {},
          },
        ],
      });
      service.addCustomer(customer);
      const potion = createMockPotion();

      const result = service.validateSale(potion, customer, 5, 25);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('already has the maximum potions');
    });

    it('should reject sale to customer not in shop', () => {
      const customer = createMockAdventurer();
      const potion = createMockPotion();

      // Customer NOT added to shop
      const result = service.validateSale(potion, customer, 5, 25);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('no longer in the shop');
    });

    it('should reject sale when out of stock', () => {
      const customer = createMockAdventurer();
      service.addCustomer(customer);
      const potion = createMockPotion();

      const result = service.validateSale(potion, customer, 0, 25);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Out of stock');
    });

    it('should reject sale when customer cannot afford', () => {
      const customer = createMockAdventurer({ gold: 10 });
      service.addCustomer(customer);
      const potion = createMockPotion();

      const result = service.validateSale(potion, customer, 5, 100);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot afford');
    });

    it('should accept valid sale', () => {
      const customer = createMockAdventurer({ gold: 100 });
      service.addCustomer(customer);
      const potion = createMockPotion();

      const result = service.validateSale(potion, customer, 5, 25);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject diluted potion sale to experienced adventurer', () => {
      const customer = createMockAdventurer({ gold: 100, experienced: true });
      service.addCustomer(customer);
      const dilutedPotion = createMockPotion({ isDiluted: true });

      const result = service.validateSale(dilutedPotion, customer, 5, 10);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('[Experienced]');
      expect(result.error).toContain('watered down');
      expect(result.error).toContain('Sale refused');
    });

    it('should allow diluted potion sale to trusting adventurer', () => {
      const customer = createMockAdventurer({ gold: 100, trusting: true, experienced: false });
      service.addCustomer(customer);
      const dilutedPotion = createMockPotion({ isDiluted: true });

      const result = service.validateSale(dilutedPotion, customer, 5, 10);

      expect(result.valid).toBe(true);
    });

    it('should allow diluted potion sale to non-experienced adventurer', () => {
      const customer = createMockAdventurer({ gold: 100, experienced: false });
      service.addCustomer(customer);
      const dilutedPotion = createMockPotion({ isDiluted: true });

      const result = service.validateSale(dilutedPotion, customer, 5, 10);

      expect(result.valid).toBe(true);
    });

    it('should allow diluted potion sale to experienced + trusting adventurer (trusting overrides experienced)', () => {
      const customer = createMockAdventurer({ gold: 100, experienced: true, trusting: true });
      service.addCustomer(customer);
      const dilutedPotion = createMockPotion({ isDiluted: true });

      const result = service.validateSale(dilutedPotion, customer, 5, 10);

      expect(result.valid).toBe(true);
      // Trusting trait overrides experienced detection, allowing the sale
    });
  });

  describe('Trait Balance (Game Loop)', () => {
    /**
     * Trait Balance Overview:
     * - Frugal (20% chance): Pays 20% less → thin margins
     * - Trusting (30% chance): Buys anything (flavor) → can sell diluted
     * - Experienced (15% chance): Refuses diluted potions → blocks scamming
     * - Desperate (25% chance): Pays 50% more → best profit
     *
     * Combined scenarios create interesting player decisions:
     * - Desperate customer: Maximize profit
     * - Frugal customer: Low margin, sell anyway to clear stock
     * - Experienced customer: Cannot sell diluted potions
     * - Desperate + Frugal: 1.5 * 0.8 = 1.2x (still profitable)
     */

    describe('Price Modifiers', () => {
      it('desperate customers pay 50% more (1.5x)', () => {
        const basePotion = createMockPotion({ basePrice: 100 });
        const desperate = createMockAdventurer({ desperate: true });
        const normal = createMockAdventurer({ desperate: false });

        const desperatePrice = service.calculatePrice(basePotion, desperate, 0);
        const normalPrice = service.calculatePrice(basePotion, normal, 0);

        expect(desperatePrice).toBe(150); // 100 * 1.5
        expect(normalPrice).toBe(100);
        expect(desperatePrice).toBe(normalPrice * 1.5);
      });

      it('frugal customers pay 20% less (0.8x)', () => {
        const basePotion = createMockPotion({ basePrice: 100 });
        const frugal = createMockAdventurer({ frugal: true });
        const normal = createMockAdventurer({ frugal: false });

        const frugalPrice = service.calculatePrice(basePotion, frugal, 0);
        const normalPrice = service.calculatePrice(basePotion, normal, 0);

        expect(frugalPrice).toBe(80); // 100 * 0.8
        expect(normalPrice).toBe(100);
        expect(frugalPrice).toBe(Math.floor(normalPrice * 0.8));
      });

      it('desperate + frugal stacks to 1.2x price', () => {
        const basePotion = createMockPotion({ basePrice: 100 });
        const both = createMockAdventurer({ desperate: true, frugal: true });

        const price = service.calculatePrice(basePotion, both, 0);

        // 100 * 1.5 * 0.8 = 120
        expect(price).toBe(120);
      });

      it('reputation provides bonus scaling', () => {
        const basePotion = createMockPotion({ basePrice: 100 });
        const customer = createMockAdventurer();

        const zeroRep = service.calculatePrice(basePotion, customer, 0);
        const goodRep = service.calculatePrice(basePotion, customer, 50);
        const greatRep = service.calculatePrice(basePotion, customer, 100);

        expect(zeroRep).toBe(100);
        expect(goodRep).toBe(125); // 100 * (1 + 50/200) = 125
        expect(greatRep).toBe(150); // 100 * (1 + 100/200) = 150
      });
    });

    describe('Experienced Trait Blocks Diluted Sales', () => {
      it('experienced adventurer detects and refuses diluted potions', () => {
        const experienced = createMockAdventurer({ gold: 100, experienced: true });
        service.addCustomer(experienced);
        const diluted = createMockPotion({ isDiluted: true, basePrice: 10 });

        const result = service.validateSale(diluted, experienced, 5, 10);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('[Experienced]');
        expect(result.error).toContain('watered down');
        expect(result.error).toContain('Sale refused');
      });

      it('experienced adventurer accepts normal potions', () => {
        const experienced = createMockAdventurer({ gold: 100, experienced: true });
        service.addCustomer(experienced);
        const normal = createMockPotion({ isDiluted: false });

        const result = service.validateSale(normal, experienced, 5, 25);

        expect(result.valid).toBe(true);
      });

      it('non-experienced accepts diluted potions (risky for them)', () => {
        const naive = createMockAdventurer({ gold: 100, experienced: false });
        service.addCustomer(naive);
        const diluted = createMockPotion({ isDiluted: true });

        const result = service.validateSale(diluted, naive, 5, 10);

        expect(result.valid).toBe(true);
        // Sale succeeds but diluted potion has severe survival penalty
      });
    });

    describe('Profit Scenarios', () => {
      it('best case: desperate customer + high reputation', () => {
        const potion = createMockPotion({ basePrice: 25 });
        const desperate = createMockAdventurer({ desperate: true });

        // At 50 reputation: 25 * 1.5 * 1.25 = 46.875 → 46
        const price = service.calculatePrice(potion, desperate, 50);
        expect(price).toBe(46);
      });

      it('worst case: frugal customer + zero reputation', () => {
        const potion = createMockPotion({ basePrice: 25 });
        const frugal = createMockAdventurer({ frugal: true });

        // 25 * 0.8 * 1.0 = 20
        const price = service.calculatePrice(potion, frugal, 0);
        expect(price).toBe(20);
      });

      it('diluted potion strategy: sell to trusting/naive at discount', () => {
        // Diluted potions cost 40% of normal but player can still profit
        const normalPotion = createMockPotion({ basePrice: 25, isDiluted: false });
        const dilutedPotion = createMockPotion({ basePrice: 10, isDiluted: true });
        const naive = createMockAdventurer({ gold: 50, experienced: false });
        service.addCustomer(naive);

        const normalPrice = service.calculatePrice(normalPotion, naive, 0);
        const dilutedPrice = service.calculatePrice(dilutedPotion, naive, 0);

        expect(normalPrice).toBe(25);
        expect(dilutedPrice).toBe(10);
        // Player bought 1 normal for 15g from merchant, diluted to get 2 at 10g each = 20g total
        // Profit: 20 - 15 = 5g, but at cost of adventurer survival
      });
    });
  });

  describe('merchant inventory', () => {
    it('should reset inventory for new day', () => {
      // Deplete some stock
      service.merchantInventory.basicHealing.available = 0;
      service.hasRestockedToday = true;

      service.resetMerchantInventory(1);

      expect(service.merchantInventory.basicHealing.available).toBe(5);
      expect(service.hasRestockedToday).toBe(false);
    });

    it('should scale inventory with day number', () => {
      service.resetMerchantInventory(10);

      // Day 10 should add +1 to base values
      expect(service.merchantInventory.basicHealing.available).toBe(6);
      expect(service.merchantInventory.strengthPotion.available).toBe(4);
    });

    it('should apply priceVariance to all merchant costs (price up)', () => {
      service.resetMerchantInventory(1, 1.1); // 10% price increase
      expect(service.merchantInventory.basicHealing.cost).toBe(Math.round(15 * 1.1));
      expect(service.merchantInventory.strengthPotion.cost).toBe(Math.round(25 * 1.1));
      expect(service.merchantInventory.defensePotion.cost).toBe(Math.round(27 * 1.1));
      expect(service.merchantInventory.speedElixir.cost).toBe(Math.round(30 * 1.1));
      expect(service.merchantInventory.luckCharm.cost).toBe(Math.round(35 * 1.1));
    });

    it('should apply priceVariance to all merchant costs (price down)', () => {
      service.resetMerchantInventory(1, 0.9); // 10% price decrease
      expect(service.merchantInventory.basicHealing.cost).toBe(Math.round(15 * 0.9));
      expect(service.merchantInventory.strengthPotion.cost).toBe(Math.round(25 * 0.9));
    });

    it('should use default priceVariance of 1.0 when not provided', () => {
      service.resetMerchantInventory(1);
      expect(service.merchantInventory.basicHealing.cost).toBe(15);
      expect(service.merchantInventory.strengthPotion.cost).toBe(25);
    });

    it('should validate merchant purchase - success', () => {
      const result = service.validateMerchantPurchase('basicHealing', 100);

      expect(result.valid).toBe(true);
      expect(result.potionId).toBe('basic-healing');
      expect(result.cost).toBe(15);
    });

    it('should validate merchant purchase - sold out', () => {
      service.merchantInventory.basicHealing.available = 0;

      const result = service.validateMerchantPurchase('basicHealing', 100);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Sold out');
    });

    it('should validate merchant purchase - not enough gold', () => {
      const result = service.validateMerchantPurchase('basicHealing', 5);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Not enough gold');
    });

    it('should complete merchant purchase', () => {
      const initialStock = service.merchantInventory.basicHealing.available;

      service.completeMerchantPurchase('basicHealing');

      expect(service.merchantInventory.basicHealing.available).toBe(initialStock - 1);
      expect(service.hasRestockedToday).toBe(true);
    });

    it('should calculate total merchant cost', () => {
      // 5 * 15 + 3 * 25 + 3 * 27 + 2 * 30 + 2 * 35 = 75 + 75 + 81 + 60 + 70 = 361
      const total = service.getMerchantTotalCost();
      expect(total).toBe(361);
    });

    it('should check if can buy all', () => {
      expect(service.canBuyAll(400)).toBe(true);
      expect(service.canBuyAll(100)).toBe(false);
    });

    it('should get available merchant types', () => {
      const types = service.getAvailableMerchantTypes();
      expect(types.length).toBe(5);

      service.merchantInventory.basicHealing.available = 0;
      const typesAfter = service.getAvailableMerchantTypes();
      expect(typesAfter.length).toBe(4);
      expect(typesAfter).not.toContain('basicHealing');
    });
  });

  describe('observable emissions', () => {
    it('should emit on adventurersInShop$ when customers change', (done) => {
      const emissions: Adventurer[][] = [];

      service.adventurersInShop$.subscribe((customers) => {
        emissions.push(customers);
        if (emissions.length === 2) {
          expect(emissions[0]).toEqual([]);
          expect(emissions[1].length).toBe(1);
          done();
        }
      });

      service.addCustomer(createMockAdventurer());
    });

    it('should emit on selectedAdventurer$ when selection changes', (done) => {
      const emissions: (Adventurer | null)[] = [];

      service.selectedAdventurer$.subscribe((selected) => {
        emissions.push(selected);
        if (emissions.length === 2) {
          expect(emissions[0]).toBeNull();
          expect(emissions[1]).not.toBeNull();
          done();
        }
      });

      service.addCustomer(createMockAdventurer());
    });
  });

  describe('Impatience scaling', () => {
    it('should not reduce timeout with only one customer in queue', () => {
      const adventurer = createMockAdventurer({ desperate: false, experienced: false, frugal: false, trusting: false });
      service.addCustomer(adventurer);

      // processQueue with very short wait should not remove customer (timeout not hit)
      const leaving = service.processQueue();
      expect(leaving.length).toBe(0);
    });

    it('should apply impatience factor when queue has multiple customers', () => {
      // Access the private method via bracket notation to test the scaling logic directly
      const getTimeout = (adv: Adventurer): number => service['getCustomerTimeout'](adv);

      const base = createMockAdventurer({ desperate: false, experienced: false, frugal: false, trusting: false });

      // With 1 customer, no scaling
      service.addCustomer(base);
      const timeoutSingle = getTimeout(base);

      // Add more customers to fill queue
      service.addCustomer(createMockAdventurer({ id: 'adv-2' }));
      service.addCustomer(createMockAdventurer({ id: 'adv-3' }));
      service.addCustomer(createMockAdventurer({ id: 'adv-4' }));
      service.addCustomer(createMockAdventurer({ id: 'adv-5' }));

      const timeoutFull = getTimeout(base);

      // With a full queue, timeout should be less than or equal to single-customer timeout
      expect(timeoutFull).toBeLessThanOrEqual(timeoutSingle);
      // And should not drop below 85% of base
      expect(timeoutFull).toBeGreaterThanOrEqual(Math.floor(SHOP.QUEUE_TIMEOUT_MS * 0.85));
    });
  });
});
