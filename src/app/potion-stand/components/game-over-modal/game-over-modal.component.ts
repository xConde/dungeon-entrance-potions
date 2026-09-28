import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnDestroy,
  Output,
} from '@angular/core';
import { VICTORY_TIERS, VictoryTierDefinition } from '../../config/game-config';
import { GameOverReason, GameOverStats } from '../../potion-stand.model';

// Re-export for backwards compatibility
export { GameOverReason, GameOverStats } from '../../potion-stand.model';

@Component({
  selector: 'app-game-over-modal',
  templateUrl: './game-over-modal.component.html',
  styleUrls: ['./game-over-modal.component.scss'],
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameOverModalComponent implements AfterViewInit, OnDestroy {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Reason for game over */
  @Input({ required: true }) reason!: GameOverReason;

  /** Game statistics */
  @Input({ required: true }) stats!: GameOverStats;

  /** Emitted when restart button is clicked */
  @Output() restart = new EventEmitter<void>();

  /** Emitted when the external site button is clicked. */
  @Output() exitClick = new EventEmitter<void>();

  private previouslyFocusedElement: HTMLElement | null = null;

  get isVictory(): boolean {
    return this.reason === 'success';
  }

  /**
   * The victory tier earned on a successful run.
   * Tiers are checked in order; the first one whose thresholds are all met wins.
   * Returns null for non-victory outcomes.
   */
  get victoryTier(): VictoryTierDefinition | null {
    if (!this.isVictory) return null;
    const { reputation, savedCount, combosTriggered } = this.stats;
    return (
      VICTORY_TIERS.find(
        (tier) =>
          reputation >= tier.minReputation && savedCount >= tier.minSaved && combosTriggered >= tier.minCombosTriggered
      ) ?? null
    );
  }

  get survivalRate(): number {
    const total = this.stats.deathCount + this.stats.savedCount;
    return total > 0 ? Math.round((this.stats.savedCount / total) * 100) : 100;
  }

  /** Playstyle narrative: summarizes how the player played (victory only) */
  get playstyleNarrative(): string {
    if (!this.isVictory) return '';

    const traits: string[] = [];

    // Morality axis
    if (this.stats.dilutedSold > 10) {
      traits.push('cut corners with diluted potions');
    } else if (this.stats.dilutedSold === 0) {
      traits.push('never diluted a single potion');
    }

    // Combat support axis
    if (this.stats.combosTriggered >= 15) {
      traits.push('mastered the art of potion combos');
    } else if (this.stats.bossesDefeated >= 3) {
      traits.push('equipped heroes to slay dungeon bosses');
    }

    // Compassion axis
    if (this.survivalRate >= 90) {
      traits.push('kept nearly everyone alive');
    } else if (this.survivalRate < 50) {
      traits.push('watched many adventurers fall');
    }

    // Economy axis
    if (this.stats.goldEarned > 3000) {
      traits.push('amassed a fortune');
    } else if (this.stats.gold < 50) {
      traits.push('scraped by on thin margins');
    }

    if (traits.length === 0) return 'Thirty days. You made your choices and lived with them.';
    if (traits.length === 1) return `You ${traits[0]}.`;
    const last = traits[traits.length - 1];
    const rest = traits.slice(0, -1);
    return `You ${rest.join(', ')}, and ${last}.`;
  }

  /** Dynamic epitaph based on performance */
  get epitaph(): string {
    if (this.reason === 'success') {
      if (this.stats.combosTriggered >= 10) return '"A master alchemist whose brews became legend."';
      if (this.stats.bossesDefeated >= 3)
        return '"The adventurers\' champion. No boss could stand against your potions."';
      if (this.stats.perfectSaves >= 10)
        return '"Your potions were so potent, heroes left healthier than they arrived."';
      if (this.survivalRate >= 90) return '"A guardian angel in alchemist\'s robes."';
      if (this.survivalRate >= 70) return '"A true alchemist and friend to adventurers everywhere."';
      return '"You survived. That\'s what matters."';
    } else if (this.reason === 'reputation') {
      if (this.stats.dilutedSold > 5) return '"They sold poison and called it medicine."';
      if (this.stats.maxDeathStreak >= 5) return '"A trail of corpses led the guild straight to your door."';
      if (this.stats.deathCount > this.stats.savedCount) return '"More harm than help. The guild had no choice."';
      return '"Your name became a warning whispered among adventurers."';
    } else {
      if (this.stats.maxDeathStreak >= 5) return '"The bodies piled up, and so did the debts."';
      if (this.stats.deathCount > this.stats.savedCount * 2) return '"More a mortician than an alchemist."';
      if (this.stats.day <= 5) return '"The shortest-lived potion shop in dungeon history."';
      return '"Perhaps the potion business wasn\'t meant for you..."';
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.restart.emit();
      return;
    }

    if (event.key === 'Tab') {
      const focusable = this.elementRef.nativeElement.querySelectorAll<HTMLElement>(
        'button, [href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  ngAfterViewInit(): void {
    this.previouslyFocusedElement = document.activeElement as HTMLElement;

    // Focus the restart button automatically
    const restartButton = this.elementRef.nativeElement.querySelector('.gameover-restart') as HTMLElement;
    if (restartButton) {
      restartButton.focus();
    }
  }

  onRestartClick(): void {
    this.restart.emit();
  }

  onExitClick(): void {
    this.exitClick.emit();
  }

  ngOnDestroy(): void {
    if (this.previouslyFocusedElement && typeof this.previouslyFocusedElement.focus === 'function') {
      this.previouslyFocusedElement.focus();
    }
  }
}
