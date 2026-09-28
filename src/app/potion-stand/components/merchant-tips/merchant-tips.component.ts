import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ScrollableFadeDirective } from '@shared/directives/scrollable-fade.directive';
import { UpgradeType } from '../../potion-stand.model';
import type { CustomerReview } from '../../models/game-state.model';
import { POTION_COMBOS } from '../../config/game-config';

// Re-export for backwards compatibility — parent templates may reference this type via the component's module path.
export { UpgradeType } from '../../potion-stand.model';

/** A single effect bonus shown as a chip under a combo. */
interface ComboTag {
  kind: 'survive' | 'loot' | 'armor';
  text: string;
}

/** Display-ready combo recipe: the two potion colours + name + effect chips. */
interface ComboCard {
  name: string;
  description: string;
  colors: readonly [string, string];
  tags: readonly ComboTag[];
}

/** Threat framing for the floor the shop is feeding into. */
interface ChallengeInfo {
  floor: number;
  threat: string;
  threatClass: 'calm' | 'tense' | 'deadly';
  detail: string;
}

/** Potion id → swatch colour, kept in sync with the crafting catalogue. */
const POTION_COLORS: Record<string, string> = {
  'basic-healing': '#dc2626',
  'strength-potion': '#ea580c',
  'defense-potion': '#64748b',
  'speed-elixir': '#06b6d4',
  'luck-charm': '#a855f7',
};

// Canonical chip order (owner's rule): survive first, dmg (armor) second,
// loot ALWAYS rightmost. Pushed in that fixed order below so a 2-chip recipe
// naturally reads survive-then-whichever-else, and loot never lands anywhere
// but last regardless of which fields a given combo sets.
const COMBO_CARDS: readonly ComboCard[] = POTION_COMBOS.map((combo) => {
  const tags: ComboTag[] = [];
  if (combo.survivalBonus > 0) {
    tags.push({ kind: 'survive', text: `+${Math.round(combo.survivalBonus * 100)}% survive` });
  }
  if (combo.damageReduction > 0) {
    tags.push({ kind: 'armor', text: `−${Math.round(combo.damageReduction * 100)}% dmg` });
  }
  if (combo.lootMultiplier > 1) {
    tags.push({ kind: 'loot', text: `${combo.lootMultiplier}× loot` });
  }
  return {
    name: combo.name,
    description: combo.description,
    colors: [POTION_COLORS[combo.potionIds[0]] ?? '#888', POTION_COLORS[combo.potionIds[1]] ?? '#888'],
    tags,
  };
});

@Component({
  selector: 'app-merchant-tips',
  templateUrl: './merchant-tips.component.html',
  styleUrls: ['./merchant-tips.component.scss'],
  standalone: true,
  imports: [ScrollableFadeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MerchantTipsComponent {
  @Input() day = 1;
  @Input() currentFloor = 1;
  /** Retained for parent-template binding compatibility; upgrades UI lives in merchant-inventory. */
  @Input() potionUpgrades: Record<string, number> = {};
  /** Retained for parent-template binding compatibility. */
  @Input() gold = 0;
  @Input() savedCount = 0;
  @Input() deathCount = 0;
  @Input() goldEarned = 0;
  @Input() customerReviews: CustomerReview[] = [];

  /** Retained for parent-template binding compatibility; upgrades are purchased via merchant-inventory. */
  @Output() buyUpgrade = new EventEmitter<UpgradeType>();

  readonly comboCards = COMBO_CARDS;

  /**
   * Today's threat, framed in plain language. The raw "1.00x difficulty"
   * string read as noise on early floors; this turns the floor depth into a
   * threat label plus a concrete "enemies hit X% harder" line that only
   * appears once the multiplier actually bites.
   */
  get challenge(): ChallengeInfo {
    const floor = this.currentFloor;
    const harderPct = Math.round((floor - 1) * 0.15 * 100);
    let threat: string;
    let threatClass: ChallengeInfo['threatClass'];
    if (floor <= 2) {
      threat = 'Manageable';
      threatClass = 'calm';
    } else if (floor <= 4) {
      threat = 'Dangerous';
      threatClass = 'tense';
    } else {
      threat = 'Deadly';
      threatClass = 'deadly';
    }
    const detail =
      harderPct > 0 ? `Enemies hit ${harderPct}% harder than the entrance.` : 'Standard threat at the entrance.';
    return { floor, threat, threatClass, detail };
  }

  /** Clamp rating to 0-5 for safe star rendering. */
  clampRating(rating: number): number {
    return Math.max(0, Math.min(5, Math.floor(rating)));
  }
}
