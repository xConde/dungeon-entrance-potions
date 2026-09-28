import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { Adventurer } from '../models/adventurer.model';
import { Potion } from '../models/potion.model';
import { MerchantInventory, MerchantPotionType, PriceMode, SellPotionEvent } from '../potion-stand.model';
import { CUSTOMER_AI, MERCHANT, SHOP } from '../config/game-config';
import { calculatePotionPrice } from '../utils/potion-pricing';

/**
 * ShopService - Customer queue and transaction management
 *
 * Manages:
 * - Customer queue (adventurers waiting in shop)
 * - Customer selection for transactions
 * - Sale transactions
 * - Merchant purchases
 *
 * Events are emitted for the component to handle side effects
 * (dungeon events, reputation changes, purchase animations).
 */
@Injectable()
export class ShopService implements OnDestroy {
  // -----------------------------------------------------------------------------
  // Customer Queue State
  // -----------------------------------------------------------------------------

  private readonly _adventurersInShop = new BehaviorSubject<Adventurer[]>([]);
  private readonly _selectedAdventurer = new BehaviorSubject<Adventurer | null>(null);

  readonly adventurersInShop$ = this._adventurersInShop.asObservable();
  readonly selectedAdventurer$ = this._selectedAdventurer.asObservable();

  // Direct accessors for template binding
  get adventurersInShop(): Adventurer[] {
    return this._adventurersInShop.value;
  }
  set adventurersInShop(value: Adventurer[]) {
    this._adventurersInShop.next(value);
  }

  get selectedAdventurer(): Adventurer | null {
    return this._selectedAdventurer.value;
  }
  set selectedAdventurer(value: Adventurer | null) {
    this._selectedAdventurer.next(value);
  }

  // -----------------------------------------------------------------------------
  // Merchant Inventory State
  // -----------------------------------------------------------------------------

  merchantInventory: MerchantInventory = {
    basicHealing: { available: 5, cost: 15 },
    strengthPotion: { available: 3, cost: 25 },
    defensePotion: { available: 3, cost: 27 },
    speedElixir: { available: 2, cost: 30 },
    luckCharm: { available: 2, cost: 35 },
  };
  hasRestockedToday = false;

  // Mapping from merchant types to inventory IDs
  private readonly POTION_ID_MAP: Record<MerchantPotionType, string> = {
    basicHealing: 'basic-healing',
    strengthPotion: 'strength-potion',
    defensePotion: 'defense-potion',
    speedElixir: 'speed-elixir',
    luckCharm: 'luck-charm',
  };

  // -----------------------------------------------------------------------------
  // Event Streams
  // -----------------------------------------------------------------------------

  /** Emitted when a sale is completed (for purchase animation, sending to dungeon) */
  readonly saleMade$ = new Subject<SellPotionEvent & { price: number }>();

  /** Emitted when a customer leaves due to timeout */
  readonly customerLeft$ = new Subject<Adventurer>();

  /** Emitted when a message should be shown to the user */
  readonly message$ = new Subject<{ text: string; type: 'info' | 'success' | 'warning' | 'error' }>();

  ngOnDestroy(): void {
    this.saleMade$.complete();
    this.customerLeft$.complete();
    this.message$.complete();
  }

  // -----------------------------------------------------------------------------
  // Customer Queue Methods
  // -----------------------------------------------------------------------------

  /**
   * Add a customer to the shop queue
   */
  addCustomer(adventurer: Adventurer): void {
    const current = this._adventurersInShop.value;
    this._adventurersInShop.next([...current, adventurer]);
    this.autoSelectCustomer();
  }

  /**
   * Select a customer for transaction
   */
  selectCustomer(adventurer: Adventurer | null): void {
    this._selectedAdventurer.next(adventurer);
  }

  /**
   * Auto-select first available customer if none selected
   */
  autoSelectCustomer(excludeId?: string): void {
    // Skip if already have a selection
    if (this._selectedAdventurer.value) return;

    // Skip if no customers in shop
    const customers = this._adventurersInShop.value;
    if (customers.length === 0) return;

    // Select first customer who can still buy potions
    const availableCustomer = customers.find(
      (adv) => adv.potionsConsumed.length < SHOP.MAX_POTIONS_PER_CUSTOMER && adv.id !== excludeId
    );
    if (availableCustomer) {
      this._selectedAdventurer.next(availableCustomer);
    }
  }

  /**
   * Get the queue timeout for an adventurer based on personality.
   * Some personalities are more patient than others.
   * Patience scales down as the queue fills (up to 15% reduction at max capacity).
   */
  private getCustomerTimeout(adventurer: Adventurer): number {
    let baseTimeout: number;
    if (adventurer.desperate) baseTimeout = CUSTOMER_AI.PATIENCE['desperate'];
    else if (adventurer.experienced) baseTimeout = CUSTOMER_AI.PATIENCE['experienced'];
    else if (adventurer.frugal) baseTimeout = CUSTOMER_AI.PATIENCE['frugal'];
    else if (adventurer.trusting) baseTimeout = CUSTOMER_AI.PATIENCE['trusting'];
    else baseTimeout = SHOP.QUEUE_TIMEOUT_MS;

    // Impatience scaling: patience decreases as queue fills
    const queueSize = this._adventurersInShop.value.length;
    const maxCustomers = SHOP.MAX_CUSTOMERS;
    if (queueSize > 1) {
      const impatienceFactor = 1 - (queueSize / maxCustomers) * 0.15; // Up to 15% less patience
      baseTimeout = Math.floor(baseTimeout * Math.max(0.85, impatienceFactor));
    }

    return baseTimeout;
  }

  /**
   * Process the shop queue - remove customers who have waited too long
   * Called on each game tick to check timeouts
   *
   * @returns Array of adventurers who left (for event logging)
   */
  processQueue(): Adventurer[] {
    const leavingAdventurers: Adventurer[] = [];
    const current = this._adventurersInShop.value;

    const remaining = current.filter((adv) => {
      const waitTime = Date.now() - adv.enterTime;
      if (waitTime > this.getCustomerTimeout(adv)) {
        leavingAdventurers.push(adv);
        return false;
      }
      return true;
    });

    if (leavingAdventurers.length > 0) {
      this._adventurersInShop.next(remaining);

      // Clear selection if selected customer left
      const selected = this._selectedAdventurer.value;
      if (selected && leavingAdventurers.some((adv) => adv.id === selected.id)) {
        this._selectedAdventurer.next(null);
        this.autoSelectCustomer();
      }

      // Emit events for each leaving customer
      for (const adv of leavingAdventurers) {
        this.customerLeft$.next(adv);
      }
    }

    return leavingAdventurers;
  }

  /**
   * Remove a specific customer from the shop (after purchase)
   */
  removeCustomer(adventurer: Adventurer): void {
    const current = this._adventurersInShop.value;
    const index = current.findIndex((a) => a.id === adventurer.id);
    if (index > -1) {
      const updated = [...current];
      updated.splice(index, 1);
      this._adventurersInShop.next(updated);
    }

    // Clear selection if this was the selected customer
    if (this._selectedAdventurer.value?.id === adventurer.id) {
      this._selectedAdventurer.next(null);
      this.autoSelectCustomer();
    }
  }

  /**
   * Reset enter times for all customers (used when opening shop after merchant phase)
   */
  resetCustomerEnterTimes(): void {
    const now = Date.now();
    const current = this._adventurersInShop.value;
    current.forEach((adv) => {
      adv.enterTime = now;
    });
    // Notify subscribers of the update
    this._adventurersInShop.next([...current]);
  }

  /**
   * Clear all customers from the shop
   */
  clearCustomers(): void {
    this._adventurersInShop.next([]);
    this._selectedAdventurer.next(null);
  }

  // -----------------------------------------------------------------------------
  // Transaction Methods
  // -----------------------------------------------------------------------------

  /**
   * Calculate the price of a potion for a specific adventurer
   * Takes into account adventurer traits and shop reputation
   */
  calculatePrice(potion: Potion, adventurer: Adventurer, reputation: number, priceMode: PriceMode = 'fair'): number {
    return calculatePotionPrice(potion, adventurer, reputation, priceMode);
  }

  /**
   * Attempt to sell a potion to an adventurer
   * Returns validation result - actual transaction is completed by component
   *
   * @returns Object with success status and error message if failed
   */
  validateSale(
    potion: Potion,
    adventurer: Adventurer | null,
    stock: number,
    price: number
  ): { valid: boolean; error?: string } {
    if (!adventurer) {
      return { valid: false, error: 'Select an adventurer first!' };
    }

    // Prevent exceeding max potions per customer (2 enables combo system)
    if (adventurer.potionsConsumed.length >= SHOP.MAX_POTIONS_PER_CUSTOMER) {
      return { valid: false, error: `${adventurer.name} already has the maximum potions!` };
    }

    // Prevent selling to someone no longer in shop
    if (!this._adventurersInShop.value.some((a) => a.id === adventurer.id)) {
      return { valid: false, error: 'Customer is no longer in the shop' };
    }

    if (stock <= 0) {
      return { valid: false, error: 'Out of stock!' };
    }

    if (adventurer.gold < price) {
      return { valid: false, error: `${adventurer.name} cannot afford that!` };
    }

    // Experienced adventurers refuse diluted potions (unless they're trusting)
    if (adventurer.experienced && !adventurer.trusting && potion.isDiluted) {
      return {
        valid: false,
        error: `[Experienced] ${adventurer.name} inspects the potion... "This is watered down!" Sale refused.`,
      };
    }

    return { valid: true };
  }

  // -----------------------------------------------------------------------------
  // Merchant Methods
  // -----------------------------------------------------------------------------

  /**
   * Reset merchant inventory for a new day.
   * Inventory scales slightly with day number; priceVariance applies daily market fluctuation.
   */
  resetMerchantInventory(day: number, priceVariance: number = 1.0): void {
    const dayBonus = Math.floor(day / MERCHANT.DAY_BONUS_DIVISOR);
    this.merchantInventory = {
      basicHealing: {
        available: MERCHANT.BASE_HEALING_STOCK + dayBonus,
        cost: Math.round(MERCHANT.HEALING_COST * priceVariance),
      },
      strengthPotion: {
        available: MERCHANT.BASE_STRENGTH_STOCK + dayBonus,
        cost: Math.round(MERCHANT.STRENGTH_COST * priceVariance),
      },
      defensePotion: {
        available: MERCHANT.BASE_DEFENSE_STOCK + dayBonus,
        cost: Math.round(MERCHANT.DEFENSE_COST * priceVariance),
      },
      speedElixir: {
        available: MERCHANT.BASE_SPEED_STOCK + Math.floor(day / 10),
        cost: Math.round(MERCHANT.SPEED_COST * priceVariance),
      },
      luckCharm: {
        available: MERCHANT.BASE_LUCK_STOCK + Math.floor(day / 10),
        cost: Math.round(MERCHANT.LUCK_COST * priceVariance),
      },
    };
    this.hasRestockedToday = false;
  }

  /**
   * Validate a merchant purchase
   *
   * @returns Object with success status and purchase details if valid
   */
  validateMerchantPurchase(
    potionType: MerchantPotionType,
    currentGold: number
  ): { valid: boolean; error?: string; potionId?: string; cost?: number } {
    const item = this.merchantInventory[potionType];

    if (item.available <= 0) {
      return { valid: false, error: 'Sold out!' };
    }

    if (currentGold < item.cost) {
      return { valid: false, error: 'Not enough gold!' };
    }

    return {
      valid: true,
      potionId: this.POTION_ID_MAP[potionType],
      cost: item.cost,
    };
  }

  /**
   * Complete a merchant purchase (update inventory state)
   * Call this after validating and deducting gold
   */
  completeMerchantPurchase(potionType: MerchantPotionType): void {
    this.merchantInventory[potionType].available--;
    this.hasRestockedToday = true;
  }

  /**
   * Calculate total cost of all remaining merchant inventory
   */
  getMerchantTotalCost(): number {
    return (
      this.merchantInventory.basicHealing.available * this.merchantInventory.basicHealing.cost +
      this.merchantInventory.strengthPotion.available * this.merchantInventory.strengthPotion.cost +
      this.merchantInventory.defensePotion.available * this.merchantInventory.defensePotion.cost +
      this.merchantInventory.speedElixir.available * this.merchantInventory.speedElixir.cost +
      this.merchantInventory.luckCharm.available * this.merchantInventory.luckCharm.cost
    );
  }

  /**
   * Check if player can afford all remaining merchant inventory
   */
  canBuyAll(currentGold: number): boolean {
    return currentGold >= this.getMerchantTotalCost();
  }

  /**
   * Get list of all merchant potion types with available stock
   */
  getAvailableMerchantTypes(): MerchantPotionType[] {
    const types: MerchantPotionType[] = ['basicHealing', 'strengthPotion', 'defensePotion', 'speedElixir', 'luckCharm'];
    return types.filter((type) => this.merchantInventory[type].available > 0);
  }
}
