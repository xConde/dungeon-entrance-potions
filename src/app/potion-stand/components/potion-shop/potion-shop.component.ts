import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';
import {
  Adventurer,
  AdventurerClass,
  Potion,
  PotionForecast,
  PriceMode,
  SellPotionEvent,
} from '../../potion-stand.model';
import { LongPressDirective } from '../../directives/long-press.directive';
import { FocusTrapDirective } from '@shared/directives/focus-trap.directive';
import { POTIONS, SHOP } from '../../config/game-config';
import { calculatePotionPrice } from '../../utils/potion-pricing';

// Re-export for backwards compatibility
export { SellPotionEvent } from '../../potion-stand.model';

@Component({
  selector: 'app-potion-shop',
  templateUrl: './potion-shop.component.html',
  styleUrls: ['./potion-shop.component.scss'],
  standalone: true,
  imports: [FocusTrapDirective, LongPressDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PotionShopComponent {
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() potions: Potion[] = [];
  @Input() inventory: Map<string, number> = new Map();
  @Input() selectedAdventurer: Adventurer | null = null;
  @Input() potionUpgrades: Record<string, number> = {};
  @Input() reputation = 50;
  @Input() recommendedPotionId: string | null = null;
  /** Current dungeon floor — lets the badge reason reflect danger-floor survival picks. */
  @Input() currentFloor = 1;
  @Input() priceMode: PriceMode = 'fair';
  @Input() forecasts: ReadonlyMap<string, PotionForecast> = new Map();

  @Input() emergencyPrices: Map<string, number> = new Map();
  /** Player's current gold — drives the restock-affordability disabled state. */
  @Input() gold = 0;
  /** Saved-game flag: after the first completed ritual, use the compact card confirmation. */
  @Input() hasSeenDilutionRitual = false;
  /**
   * Owner redo (2026-08-17): the sighted feedback toast (PotionStandComponent's
   * `currentMessage`), docked in-flow inside this panel — between the quote-bar
   * and the Ready Stock shelf — instead of floating page-level over the counter.
   * The page-level version (styles/_animations.scss's .message-bar, still used
   * for merchant phase) is a `position: fixed` overlay that never reflows
   * content out of its way; at compact window heights it landed on top of the
   * Ready Stock cards and the Hand-over-bottle sell controls it was telling the
   * player to use. An in-flow banner can't cover them by construction — it
   * pushes .potion-grid down instead, and that region already scrolls its own
   * overflow, so no page scroll is introduced.
   */
  @Input() toastMessage: { text: string; type: 'info' | 'success' | 'warning' | 'error' } | null = null;
  @Input() toastIconSvg: SafeHtml | null = null;

  @ViewChild('counterToast') private counterToastRef?: ElementRef<HTMLElement>;

  @Output() sell = new EventEmitter<SellPotionEvent>();
  @Output() dilute = new EventEmitter<Potion>();
  @Output() dilutionBenchOpenChange = new EventEmitter<boolean>();
  @Output() restock = new EventEmitter<Potion>();
  @Output() priceModeChange = new EventEmitter<PriceMode>();

  readonly TIER_NAMES = ['BASIC', 'ENHANCED', 'SUPERIOR'] as const;
  readonly dilutionGuilt = POTIONS.DILUTION_GUILT;
  readonly dilutedBatchValuePercent = Math.round(POTIONS.DILUTION_PRICE_MULTIPLIER * 2 * 100);

  tooltipPotion: Potion | null = null;
  dilutionPotion: Potion | null = null;
  inlineDilutionPotionId: string | null = null;

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.inlineDilutionPotionId) return;

    const target = event.target;
    if (target instanceof Element) {
      const activeConfirmation = target.closest('[data-inline-dilution-confirm]');
      if (activeConfirmation?.getAttribute('data-inline-dilution-confirm') === this.inlineDilutionPotionId) {
        return;
      }
    }

    this.cancelInlineDilutionConfirmation();
  }

  /**
   * Mirrors PotionStandComponent.restartMessageToastAnimation() for this
   * in-flow toast: called by the parent whenever `toastMessage` is REPLACED
   * (not first-mounted, not cleared) while already visible, so the CSS
   * entrance/exit keyframe restarts on a fresh clock instead of continuing
   * the prior message's animation. Force-reflow trick, no node recreation.
   */
  restartToastAnimation(): void {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
    const el = this.counterToastRef?.nativeElement;
    if (!el) return;
    el.style.animation = 'none';
    void el.offsetWidth; // force reflow so the browser re-arms the keyframe
    el.style.animation = '';
  }

  showPotionTooltip(potion: Potion): void {
    this.tooltipPotion = this.tooltipPotion?.id === potion.id ? null : potion;
    this.cdr.markForCheck();
  }

  dismissTooltip(): void {
    this.tooltipPotion = null;
    this.cdr.markForCheck();
  }

  /** Get stock count for a potion */
  getStock(potionId: string): number {
    return this.inventory.get(potionId) ?? 0;
  }

  /** Calculate price based on adventurer traits and shop reputation */
  calculatePrice(potion: Potion, adventurer: Adventurer | null): number {
    if (!adventurer) return potion.basePrice;
    return calculatePotionPrice(potion, adventurer, this.reputation, this.priceMode);
  }

  /** Calculate base price with only reputation (no trait modifiers) */
  getBasePrice(potion: Potion): number {
    return Math.floor(potion.basePrice * (1 + this.reputation / 200));
  }

  /** Check if price is modified by traits */
  isPriceModified(_potion: Potion, adventurer: Adventurer | null): boolean {
    if (!adventurer) return false;
    return adventurer.desperate || adventurer.frugal || this.priceMode !== 'fair';
  }

  /** Get price modifier class for styling */
  getPriceModifierClass(adventurer: Adventurer | null): string {
    if (!adventurer) return '';
    if (this.priceMode === 'mercy') return 'price-decreased';
    if (this.priceMode === 'gouge') return 'price-increased';
    if (adventurer.desperate && adventurer.frugal) {
      // Both traits: desperate wins (1.5 * 0.8 = 1.2x, still positive)
      return 'price-increased';
    }
    if (adventurer.desperate) return 'price-increased';
    if (adventurer.frugal) return 'price-decreased';
    return '';
  }

  /** Get tooltip explaining price modification */
  getPriceTooltip(potion: Potion, adventurer: Adventurer | null): string {
    if (!adventurer) return '';

    const basePrice = this.getBasePrice(potion);
    const finalPrice = this.calculatePrice(potion, adventurer);
    const parts: string[] = [];

    if (this.priceMode === 'mercy') {
      parts.push('Mercy quote: 20% below the normal customer price');
    } else if (this.priceMode === 'gouge') {
      parts.push('Gouge quote: 25% above the normal customer price');
    }

    if (adventurer.desperate && adventurer.frugal) {
      parts.push('Desperate (+50%) but Frugal (-20%)');
      parts.push(`Base: ${basePrice}g → ${finalPrice}g (+20%)`);
    } else if (adventurer.desperate) {
      parts.push('Desperate: pays 50% more');
      parts.push(`Base: ${basePrice}g → ${finalPrice}g`);
    } else if (adventurer.frugal) {
      parts.push('Frugal: haggles 20% off');
      parts.push(`Base: ${basePrice}g → ${finalPrice}g`);
    }

    return parts.join(' | ');
  }

  /** Check if potion is recommended for current adventurer */
  isRecommended(potion: Potion): boolean {
    return this.recommendedPotionId === potion.id;
  }

  /** Check if adventurer can afford potion */
  canAfford(potion: Potion): boolean {
    if (!this.selectedAdventurer) return true; // No adventurer = no price check
    return this.calculatePrice(potion, this.selectedAdventurer) <= this.selectedAdventurer.gold;
  }

  /**
   * Get shortened potion name - just the core type
   * Strips: "Potion", "of", tier prefixes, "Diluted"
   */
  getShortName(name: string): string {
    return name
      .replace(/\s*potion\s*of\s*/gi, '')
      .replace(/\s*potion$/gi, '')
      .replace(/^diluted\s*/gi, '')
      .replace(/^basic\s*/gi, '')
      .replace(/^strong\s*/gi, '')
      .replace(/^enhanced\s*/gi, '')
      .replace(/^greater\s*/gi, '')
      .trim();
  }

  /** Map potion ID to its upgrade key */
  private getPotionUpgradeKey(potionId: string): string | null {
    const baseId = potionId.replace(/^diluted-/, '');

    const idToUpgradeKey: Record<string, string> = {
      'basic-healing': 'healing',
      'strength-potion': 'strength',
      'defense-potion': 'defense',
      'speed-elixir': 'speed',
      'luck-charm': 'luck',
    };

    return idToUpgradeKey[baseId] ?? null;
  }

  /** Get potion tier name based on upgrades */
  getPotionTier(potion: Potion): string {
    const upgradeKey = this.getPotionUpgradeKey(potion.id);
    const tier = upgradeKey ? (this.potionUpgrades[upgradeKey] ?? 0) : 0;
    return this.TIER_NAMES[tier];
  }

  /** Check if sell button should be disabled */
  isSellDisabled(potion: Potion): boolean {
    // Order mirrors getSellDisabledReason so the tooltip names the same first
    // blocker: no customer -> max potions -> out of stock -> affordability.
    if (!this.selectedAdventurer) return true;
    if (this.selectedAdventurer.potionsConsumed.length >= 2) return true;
    if (this.getStock(potion.id) === 0) return true;
    return !this.canAfford(potion);
  }

  /**
   * Human-readable reason the sell button is disabled. Surfaced via the
   * button's `title` attribute so screen-reader and hover users know why.
   * Returns null when the button is enabled.
   */
  getSellDisabledReason(potion: Potion): string | null {
    if (!this.selectedAdventurer) return 'Select a customer first';
    if (this.selectedAdventurer.potionsConsumed.length >= 2)
      return `${this.selectedAdventurer.name} is already carrying 2 potions`;
    if (this.getStock(potion.id) === 0) return 'Out of stock';
    if (!this.canAfford(potion)) return `${this.selectedAdventurer.name} can't afford this`;
    return null;
  }

  /**
   * Panel-level status message shown below the title when every Sell button
   * would be disabled. Gives the player a clear next action instead of a
   * wall of grey buttons with no explanation.
   * Returns null when at least one potion can be sold normally.
   */
  getPanelStatusMessage(): string | null {
    if (!this.selectedAdventurer) {
      return 'Select a customer to sell a potion.';
    }
    if (this.selectedAdventurer.potionsConsumed.length >= 2) {
      return `${this.selectedAdventurer.name} is already carrying 2 potions. Wait for them to enter the dungeon.`;
    }
    // Check if any potion has stock at all
    const anyInStock = this.potions.some((p) => this.getStock(p.id) > 0);
    if (!anyInStock && this.potions.length > 0) {
      return 'All potions are out of stock. Use the Restock button or wait for your supplier.';
    }
    // Stock exists but nothing is affordable
    const anyCanSell = this.potions.some((p) => this.getStock(p.id) > 0 && this.canAfford(p));
    if (!anyCanSell && this.potions.length > 0) {
      const adv = this.selectedAdventurer;
      return `${adv.name} can't afford any potion (${adv.gold}g). Try diluting a potion to lower the price.`;
    }
    return null;
  }

  /**
   * Brief reason why a potion is recommended for the current adventurer.
   * Mirrors the recommendation logic in game-orchestrator so the label
   * is accurate without coupling the component to the service.
   */
  getRecommendedReason(potion: Potion): string {
    if (!this.selectedAdventurer) return 'Good choice';
    const adv = this.selectedAdventurer;
    const hpPercent = adv.currentHp / adv.maxHp;

    // HP-based check takes priority (matches orchestrator logic)
    if (hpPercent < 0.5 && potion.effects.healing) {
      return 'Low HP';
    }

    // On dangerous floors the orchestrator prefers healing; if a non-healing
    // potion is recommended here it's the best survival option still in stock,
    // not a class-flavor pick. Label it accordingly (matches the service intent).
    if (this.currentFloor >= SHOP.RECOMMEND_DANGER_FLOOR && !potion.effects.healing) {
      return 'Best available';
    }

    if (this.getForecast(potion)?.comboName) {
      return 'Completes combo';
    }

    // A recommended healing potion at full HP without a combo means the
    // orchestrator picked it for raw survival rather than class flavor.
    if (potion.effects.healing) {
      return 'Survival';
    }

    // Class-fit check
    if (
      (adv.class === AdventurerClass.Warrior || adv.class === AdventurerClass.Barbarian) &&
      potion.effects.strengthBoost
    ) {
      return 'Class fit';
    }
    if (
      (adv.class === AdventurerClass.Paladin || adv.class === AdventurerClass.Cleric) &&
      potion.effects.defenseBoost
    ) {
      return 'Class fit';
    }
    if ((adv.class === AdventurerClass.Rogue || adv.class === AdventurerClass.Ranger) && potion.effects.speedBoost) {
      return 'Class fit';
    }
    if ((adv.class === AdventurerClass.Mage || adv.class === AdventurerClass.Necromancer) && potion.effects.luckBoost) {
      return 'Class fit';
    }

    return 'Good choice';
  }

  /** Check if dilute button should be disabled */
  isDiluteDisabled(potion: Potion): boolean {
    return this.getStock(potion.id) === 0;
  }

  /** Human-readable reason the dilute button is disabled, or null. */
  getDiluteDisabledReason(potion: Potion): string | null {
    if (this.getStock(potion.id) === 0) return 'Out of stock: nothing to dilute';
    return null;
  }

  onSell(potion: Potion): void {
    if (this.selectedAdventurer) {
      this.cancelInlineDilutionConfirmation();
      this.sell.emit({ potion, adventurer: this.selectedAdventurer, priceMode: this.priceMode });
    }
  }

  selectPriceMode(priceMode: PriceMode): void {
    this.cancelInlineDilutionConfirmation();
    this.priceModeChange.emit(priceMode);
  }

  getForecast(potion: Potion): PotionForecast | null {
    return this.forecasts.get(potion.id) ?? null;
  }

  getForecastLabel(forecast: PotionForecast): string {
    switch (forecast.risk) {
      case 'dire':
        return 'Dire';
      case 'risky':
        return 'Risky';
      case 'steady':
        return 'Steady';
    }
  }

  formatSurvival(chance: number): string {
    return `${Math.round(chance * 100)}%`;
  }

  getDisplayEffectValue(potion: Potion, value: number | undefined): number | null {
    if (value === undefined) return null;

    const dilutionMultiplier = potion.isDiluted ? POTIONS.DILUTION_QUALITY_MULTIPLIER : 1;
    return Math.floor(value * potion.quality * dilutionMultiplier);
  }

  getDilutionEffectSummary(potion: Potion): string {
    const dilutedQuality = potion.quality * POTIONS.DILUTION_QUALITY_MULTIPLIER;
    const effectMultiplier = dilutedQuality * POTIONS.DILUTION_QUALITY_MULTIPLIER;
    const effects: string[] = [];

    if (potion.effects.healing !== undefined) {
      effects.push(`${Math.floor(potion.effects.healing * effectMultiplier)} HP`);
    }
    if (potion.effects.strengthBoost !== undefined) {
      effects.push(`${Math.floor(potion.effects.strengthBoost * effectMultiplier)} STR`);
    }
    if (potion.effects.defenseBoost !== undefined) {
      effects.push(`${Math.floor(potion.effects.defenseBoost * effectMultiplier)} DEF`);
    }
    if (potion.effects.speedBoost !== undefined) {
      effects.push(`${Math.floor(potion.effects.speedBoost * effectMultiplier)} SPD`);
    }
    if (potion.effects.luckBoost !== undefined) {
      effects.push(`${Math.floor(potion.effects.luckBoost * effectMultiplier)} LUCK`);
    }

    return effects.join(' · ');
  }

  openDilutionBench(potion: Potion): void {
    if (potion.isDiluted || this.isDiluteDisabled(potion)) return;
    this.tooltipPotion = null;
    this.inlineDilutionPotionId = null;
    this.dilutionPotion = potion;
    this.dilutionBenchOpenChange.emit(true);
    this.cdr.markForCheck();
  }

  cancelDilutionBench(): void {
    if (!this.dilutionPotion) return;
    this.dilutionPotion = null;
    this.dilutionBenchOpenChange.emit(false);
    this.cdr.markForCheck();
  }

  confirmDilution(): void {
    const potion = this.dilutionPotion;
    if (!potion || potion.isDiluted || this.isDiluteDisabled(potion)) {
      this.cancelDilutionBench();
      return;
    }

    this.dilute.emit(potion);
    this.dilutionPotion = null;
    this.dilutionBenchOpenChange.emit(false);
    this.cdr.markForCheck();
  }

  onDilute(potion: Potion): void {
    if (potion.isDiluted || this.isDiluteDisabled(potion)) return;

    if (!this.hasSeenDilutionRitual) {
      this.openDilutionBench(potion);
      return;
    }

    this.tooltipPotion = null;
    this.inlineDilutionPotionId = potion.id;
    this.cdr.markForCheck();
  }

  isInlineDilutionPending(potion: Potion): boolean {
    return this.inlineDilutionPotionId === potion.id;
  }

  confirmInlineDilution(potion: Potion): void {
    if (!this.isInlineDilutionPending(potion) || potion.isDiluted || this.isDiluteDisabled(potion)) {
      this.cancelInlineDilutionConfirmation();
      return;
    }

    this.inlineDilutionPotionId = null;
    this.dilute.emit(potion);
    this.cdr.markForCheck();
  }

  cancelInlineDilutionConfirmation(): boolean {
    if (!this.inlineDilutionPotionId) return false;

    this.inlineDilutionPotionId = null;
    this.cdr.markForCheck();
    return true;
  }

  onRestock(potion: Potion): void {
    this.cancelInlineDilutionConfirmation();
    this.restock.emit(potion);
  }

  /**
   * Restock disabled when the player can't afford the emergency price.
   * Pre-fix the button was always clickable but the orchestrator
   * silently rejected the spendGold() call when gold was insufficient,
   * so users perceived "click does nothing." Mirrors sell/dilute.
   */
  isRestockDisabled(potion: Potion): boolean {
    return this.gold < this.getEmergencyPrice(potion);
  }

  /** Human-readable reason the restock button is disabled, or null. */
  getRestockDisabledReason(potion: Potion): string | null {
    const price = this.getEmergencyPrice(potion);
    if (this.gold < price) {
      return `Not enough gold (${price}g needed)`;
    }
    return null;
  }

  getEmergencyPrice(potion: Potion): number {
    return this.emergencyPrices.get(potion.id) ?? 0;
  }

  canRestock(potion: Potion): boolean {
    return this.getStock(potion.id) <= 1 && this.getEmergencyPrice(potion) > 0;
  }
}
