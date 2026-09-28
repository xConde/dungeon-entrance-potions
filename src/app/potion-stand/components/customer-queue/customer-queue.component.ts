import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  Output,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ScrollableFadeDirective } from '@shared/directives/scrollable-fade.directive';
import { PotionEffect } from '../../models/adventurer.model';
import { Adventurer, AdventurerClass, PurchaseAnimation, TimeOfDay } from '../../potion-stand.model';
import { getClassIcon, getIcon } from '../../utils/icons';
import { CLASS_ABILITIES } from '../../config/game-config';

// Re-export for backwards compatibility
export { PurchaseAnimation } from '../../potion-stand.model';

@Component({
  selector: 'app-customer-queue',
  templateUrl: './customer-queue.component.html',
  styleUrls: ['./customer-queue.component.scss'],
  standalone: true,
  imports: [ScrollableFadeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerQueueComponent {
  private readonly sanitizer = inject(DomSanitizer);

  @ViewChildren('adventurerCard') private adventurerCards!: QueryList<ElementRef>;

  // Data
  @Input() adventurers: Adventurer[] = [];
  @Input() selectedAdventurer: Adventurer | null = null;
  @Input() purchaseAnimation: PurchaseAnimation | null = null;
  @Input() comboSignal: { name: string } | null = null;
  @Input() timeOfDay: TimeOfDay = 'Morning';

  // Events
  @Output() selectAdventurer = new EventEmitter<Adventurer>();

  /**
   * HP / maxHp guarded against division-by-zero. A corrupted save where
   * maxHp is 0 would otherwise produce NaN, and Angular evaluates NaN
   * comparisons as `false`, silently hiding the low-hp visual. Mirrors
   * the guard already in place on the parent's `hasDungeonDanger`.
   */
  hpRatio(adventurer: Adventurer): number {
    return adventurer.maxHp > 0 ? adventurer.currentHp / adventurer.maxHp : 0;
  }

  /** Get SVG for returning customer badge */
  getReturningBadgeSvg(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(getIcon('star'));
  }

  /** Get sanitized SVG for adventurer class icon */
  getClassIconSvg(adventurerClass: AdventurerClass): SafeHtml {
    const iconName = getClassIcon(adventurerClass);
    const svg = getIcon(iconName);
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  /** Get time-based hint for empty customer queue */
  getTimeBasedHint(): string {
    const hints: Record<TimeOfDay, string> = {
      Morning: 'They arrive through the day. Sell each one a potion to send them into the dungeon.',
      Afternoon: 'Peak hours. Sell each one a potion to send them into the dungeon.',
      Evening: 'Last chance before nightfall. Sell each one a potion to send them into the dungeon.',
      Night: 'Only desperate souls venture out now. Sell each one a potion to send them into the dungeon.',
    };
    return hints[this.timeOfDay];
  }

  /** Build a descriptive aria-label for an adventurer card, including HP and key traits */
  buildAdventurerAriaLabel(adventurer: Adventurer): string {
    const parts: string[] = [
      `Select ${adventurer.name}, level ${adventurer.level} ${adventurer.class}`,
      `HP ${adventurer.currentHp}/${adventurer.maxHp}`,
      `${adventurer.gold} gold`,
    ];
    if (adventurer.desperate) {
      parts.push('desperate');
    }
    if (adventurer.frugal) {
      parts.push('frugal');
    }
    if (adventurer.isReturning) {
      parts.push('returning customer');
    }
    return parts.join(', ');
  }

  /** CSS class for a consumed potion's slot, based on its primary stat */
  getPotionSlotType(potion: PotionEffect): string {
    if (potion.statModifiers.hp && potion.statModifiers.hp > 0) return 'healing';
    if (potion.statModifiers.strength && potion.statModifiers.strength > 0) return 'strength';
    if (potion.statModifiers.defense && potion.statModifiers.defense > 0) return 'defense';
    if (potion.statModifiers.speed && potion.statModifiers.speed > 0) return 'speed';
    if (potion.statModifiers.luck && potion.statModifiers.luck > 0) return 'luck';
    return 'generic';
  }

  /** CSS class for combo smoke color */
  getComboSmokeClass(comboName: string): string {
    if (comboName.includes('Berserker')) return 'smoke-berserker';
    if (comboName.includes('Ironhide')) return 'smoke-ironhide';
    if (comboName.includes('Warlord')) return 'smoke-warlord';
    return 'smoke-default';
  }

  /** Short label for a consumed potion slot */
  getPotionSlotLabel(potion: PotionEffect): string {
    if (potion.statModifiers.hp && potion.statModifiers.hp > 0) return 'HP';
    if (potion.statModifiers.strength && potion.statModifiers.strength > 0) return 'STR';
    if (potion.statModifiers.defense && potion.statModifiers.defense > 0) return 'DEF';
    if (potion.statModifiers.speed && potion.statModifiers.speed > 0) return 'SPD';
    if (potion.statModifiers.luck && potion.statModifiers.luck > 0) return 'LCK';
    return 'Pot';
  }

  /** Returns the ability name for an adventurer class, or null if no ability is defined */
  getClassAbility(adventurerClass: AdventurerClass): string | null {
    return CLASS_ABILITIES[adventurerClass]?.name ?? null;
  }

  /** Returns the ability description for an adventurer class */
  getClassAbilityDesc(adventurerClass: AdventurerClass): string {
    return CLASS_ABILITIES[adventurerClass]?.description ?? '';
  }

  onSelectAdventurer(adventurer: Adventurer): void {
    this.selectAdventurer.emit(adventurer);
    // Auto-scroll selected card into view on mobile
    setTimeout(() => {
      if (window.innerWidth < 768) {
        const cards = this.adventurerCards?.toArray();
        const idx = this.adventurers.findIndex((a) => a.id === adventurer.id);
        if (cards && idx >= 0 && cards[idx]) {
          (cards[idx].nativeElement as HTMLElement).scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          });
        }
      }
    }, 50);
  }
}
