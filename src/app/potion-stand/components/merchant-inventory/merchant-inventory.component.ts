import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ScrollableFadeDirective } from '@shared/directives/scrollable-fade.directive';
import { PotionBottleComponent } from '../potion-bottle/potion-bottle.component';
import { POTION_CATALOG, TIER_NAMES, UpgradeType } from '../../potion-stand.model';
import { UPGRADES } from '../../config/game-config';

@Component({
  selector: 'app-merchant-inventory',
  templateUrl: './merchant-inventory.component.html',
  styleUrls: ['./merchant-inventory.component.scss'],
  standalone: true,
  imports: [PotionBottleComponent, ScrollableFadeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MerchantInventoryComponent {
  /** Potion catalog from shared types */
  readonly potions = POTION_CATALOG;

  @Input() inventory: Map<string, number> = new Map();
  @Input() potionUpgrades: Record<string, number> = {};
  @Input() gold = 0;
  @Input() reputation = 50;
  @Input() dailyOverhead = 25;
  /** Whether the player can afford at least one potion from the merchant */
  @Input() canAffordPotions = false;

  @Output() openShop = new EventEmitter<void>();
  @Output() buyUpgrade = new EventEmitter<UpgradeType>();

  readonly UPGRADE_COSTS = UPGRADES.COSTS;
  readonly TIER_MULTIPLIERS = UPGRADES.TIER_MULTIPLIERS;

  /** Get stock count for a potion, defaulting to 0 */
  getStock(potionId: string): number {
    return this.inventory.get(potionId) ?? 0;
  }

  /** Get tier name for a potion upgrade */
  getTierName(upgradeKey: string): string {
    const tier = this.potionUpgrades[upgradeKey] ?? 0;
    return TIER_NAMES[tier];
  }

  /** CSS class for reputation display */
  getReputationClass(): string {
    if (this.reputation < 30) return 'reputation-bad';
    if (this.reputation < 70) return 'reputation-neutral';
    return 'reputation-good';
  }

  /** Whether the shop has any potions in stock */
  hasStock(): boolean {
    let total = 0;
    this.inventory.forEach((qty) => (total += qty));
    return total > 0;
  }

  isMaxTier(upgradeType: UpgradeType): boolean {
    const currentTier = this.potionUpgrades[upgradeType] ?? 0;
    return currentTier >= TIER_NAMES.length - 1;
  }

  canBuyUpgrade(upgradeType: UpgradeType): boolean {
    const currentTier = this.potionUpgrades[upgradeType] ?? 0;
    if (currentTier >= TIER_NAMES.length - 1) return false;
    return this.gold >= this.UPGRADE_COSTS[upgradeType][currentTier];
  }

  getNextUpgradeCost(upgradeType: UpgradeType): number | null {
    const currentTier = this.potionUpgrades[upgradeType] ?? 0;
    if (currentTier >= TIER_NAMES.length - 1) return null;
    return this.UPGRADE_COSTS[upgradeType][currentTier];
  }

  getNextTierName(upgradeType: UpgradeType): string | null {
    const currentTier = this.potionUpgrades[upgradeType] ?? 0;
    if (currentTier >= TIER_NAMES.length - 1) return null;
    return TIER_NAMES[currentTier + 1];
  }

  getCurrentTierName(upgradeType: UpgradeType): string {
    const currentTier = this.potionUpgrades[upgradeType] ?? 0;
    return TIER_NAMES[currentTier];
  }

  getNextTierMultiplier(upgradeType: UpgradeType): number {
    const currentTier = this.potionUpgrades[upgradeType] ?? 0;
    return this.TIER_MULTIPLIERS[currentTier + 1] ?? this.TIER_MULTIPLIERS[currentTier];
  }

  onBuyUpgrade(upgradeType: UpgradeType): void {
    this.buyUpgrade.emit(upgradeType);
  }

  onOpenShop(): void {
    this.openShop.emit();
  }
}
