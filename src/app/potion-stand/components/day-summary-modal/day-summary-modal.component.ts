import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { FocusTrapDirective } from '@shared/directives/focus-trap.directive';
import { DaySummaryData } from '../../potion-stand.model';

// Re-export for backwards compatibility
export { DaySummaryData } from '../../potion-stand.model';

@Component({
  selector: 'app-day-summary-modal',
  templateUrl: './day-summary-modal.component.html',
  styleUrls: ['./day-summary-modal.component.scss'],
  standalone: true,
  imports: [FocusTrapDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DaySummaryModalComponent {
  /** Day summary statistics */
  @Input({ required: true }) data!: DaySummaryData;

  /** Current gold amount */
  @Input({ required: true }) gold!: number;

  /** Current reputation */
  @Input({ required: true }) reputation!: number;

  /** The next day number (day to continue to) */
  @Input({ required: true }) nextDay!: number;

  /** Emitted when the modal is dismissed */
  @Output() dismiss = new EventEmitter<void>();

  /** Dynamic narrative line based on the day's data */
  get narrative(): string {
    const d = this.data;

    // Perfect day: no deaths, good sales
    if (d.deaths === 0 && d.saves > 0) {
      if (d.bossesDefeated > 0) {
        return 'A legendary day. Every adventurer returned alive. A boss fell.';
      }
      return 'Every adventurer came home. The dungeon entrance feels a little safer.';
    }

    // Massacre: more deaths than saves
    if (d.deaths > d.saves && d.deaths >= 3) {
      if (d.unprepared > 0) {
        return 'The bodies pile up. Some never even had a potion.';
      }
      return 'A dark day. The dungeon entrance grows quieter.';
    }

    // Deaths were your fault
    if (d.deathsYourFault > 0 && d.deathsYourFault === d.deaths) {
      if (d.deaths === 1) {
        return 'One death. It was on you.';
      }
      return `${d.deaths} dead. All preventable.`;
    }

    // Unprepared adventurers entered
    if (d.unprepared > 0 && d.deaths > 0) {
      return 'Some went in with nothing. Not all came back.';
    }

    // Mixed day: some deaths, some saves
    if (d.deaths > 0 && d.saves > 0) {
      if (d.saves > d.deaths * 2) {
        return 'Most survived. The losses sting, but the odds are in your favor.';
      }
      return "A mixed day. Some lived, some didn't.";
    }

    // No customers at all
    if (d.deaths === 0 && d.saves === 0) {
      if (d.potionsSold === 0) {
        return 'An empty day. No adventurers, no sales, no stories.';
      }
      return 'Quiet day at the dungeon entrance.';
    }

    // Only deaths, no saves
    if (d.deaths > 0 && d.saves === 0) {
      return 'Nobody came back today.';
    }

    return 'Another day at the dungeon entrance.';
  }

  /** CSS class for the narrative based on tone */
  get narrativeClass(): string {
    const d = this.data;
    if (d.deaths === 0 && d.saves > 0) return 'tone-good';
    if (d.deaths > d.saves) return 'tone-grim';
    if (d.deathsYourFault > 0) return 'tone-guilt';
    if (d.deaths > 0) return 'tone-mixed';
    return 'tone-neutral';
  }

  /**
   * Light-dismiss is disabled for the day summary. Backdrop click previously
   * advanced the day, which felt aggressive: clicking outside the modal skipped
   * the only post-day narrative the game presents. Continue button is the only
   * path forward. Escape is wired below via @HostListener.
   */
  onOverlayClick(): void {
    // Intentional no-op.
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.dismiss.emit();
  }

  onContinueClick(): void {
    this.dismiss.emit();
  }

  stopPropagation(event: Event): void {
    event.stopPropagation();
  }
}
