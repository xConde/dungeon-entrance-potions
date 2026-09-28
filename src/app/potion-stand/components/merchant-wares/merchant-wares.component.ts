import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ScrollableFadeDirective } from '@shared/directives/scrollable-fade.directive';
import { MerchantInventory, MerchantPotionType, POTION_CATALOG } from '../../potion-stand.model';
import { PotionBottleComponent } from '../potion-bottle/potion-bottle.component';

// Re-export for backwards compatibility
export { MerchantItem, MerchantInventory, MerchantPotionType } from '../../potion-stand.model';

@Component({
  selector: 'app-merchant-wares',
  templateUrl: './merchant-wares.component.html',
  styleUrls: ['./merchant-wares.component.scss'],
  standalone: true,
  imports: [PotionBottleComponent, ScrollableFadeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MerchantWaresComponent {
  /** Potion catalog from shared types */
  readonly potions = POTION_CATALOG;
  @Input() inventory: MerchantInventory = {
    basicHealing: { available: 0, cost: 15 },
    strengthPotion: { available: 0, cost: 25 },
    defensePotion: { available: 0, cost: 27 },
    speedElixir: { available: 0, cost: 30 },
    luckCharm: { available: 0, cost: 35 },
  };
  @Input() gold = 0;

  @Output() buyPotion = new EventEmitter<MerchantPotionType>();
  @Output() buyAll = new EventEmitter<void>();

  /** Calculate total cost of all available merchant inventory */
  get totalCost(): number {
    return (
      this.inventory.basicHealing.available * this.inventory.basicHealing.cost +
      this.inventory.strengthPotion.available * this.inventory.strengthPotion.cost +
      this.inventory.defensePotion.available * this.inventory.defensePotion.cost +
      this.inventory.speedElixir.available * this.inventory.speedElixir.cost +
      this.inventory.luckCharm.available * this.inventory.luckCharm.cost
    );
  }

  /** Check if player can afford a specific potion */
  canAfford(potionType: MerchantPotionType): boolean {
    return this.gold >= this.inventory[potionType].cost;
  }

  /** Check if a specific potion is sold out */
  isSoldOut(potionType: MerchantPotionType): boolean {
    return this.inventory[potionType].available === 0;
  }

  onBuyPotion(potionType: MerchantPotionType): void {
    this.buyPotion.emit(potionType);
  }

  onBuyAll(): void {
    this.buyAll.emit();
  }
}
