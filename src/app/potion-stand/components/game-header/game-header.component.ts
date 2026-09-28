import { ChangeDetectionStrategy, Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TimeOfDay } from '../../potion-stand.model';
import { getIcon, IconName } from '../../utils/icons';

// Re-export for backwards compatibility
export { TimeOfDay } from '../../potion-stand.model';

@Component({
  selector: 'app-game-header',
  templateUrl: './game-header.component.html',
  styleUrls: ['./game-header.component.scss'],
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameHeaderComponent {
  private readonly sanitizer = inject(DomSanitizer);

  // Time & Day
  @Input() day = 1;
  @Input() timeOfDay: TimeOfDay = 'Morning';
  @Input() gameTime = 0; // 0-119 for progress bar

  // Controls
  @Input() isPaused = false;
  @Input() pauseLocked = false;
  @Input() gameSpeed = 1; // 1, 2, or 3
  @Input() canCloseDay = false;
  @Input() closeDayLocked = false;

  // Guilt
  @Input() guilt = 0;
  @Input() maxGuilt = 100;

  // Economy
  @Input() gold = 0;
  @Input() dailyProfit = 0;
  @Input() dailyExpenses = 0;

  // Stats
  @Input() reputation = 50;
  @Input() deathCount = 0;
  @Input() savedCount = 0;

  // Audio
  @Input() audioEnabled: boolean = true;
  @Output() toggleAudio = new EventEmitter<void>();

  // Events
  @Output() togglePause = new EventEmitter<void>();
  @Output() changeSpeed = new EventEmitter<void>();
  @Output() openHelp = new EventEmitter<void>();
  @Output() openTutorial = new EventEmitter<void>();
  @Output() requestCloseDay = new EventEmitter<void>();

  /** Net profit for today (profit - expenses) */
  get netProfit(): number {
    return this.dailyProfit - this.dailyExpenses;
  }

  /** Survival rate percentage (0-100) */
  get survivalRate(): number {
    const total = this.deathCount + this.savedCount;
    if (total === 0) return 0;
    return (this.savedCount / total) * 100;
  }

  /** Progress bar percentage (0-100) */
  get progressPercent(): number {
    return (this.gameTime / 120) * 100;
  }

  /** Guilt bar percentage (0-100) */
  get guiltPercent(): number {
    return (this.guilt / this.maxGuilt) * 100;
  }

  /** CSS class for reputation display */
  getReputationClass(): string {
    if (this.reputation < 30) return 'reputation-bad';
    if (this.reputation < 70) return 'reputation-neutral';
    return 'reputation-good';
  }

  onTogglePause(): void {
    if (this.pauseLocked) return;
    this.togglePause.emit();
  }

  onChangeSpeed(): void {
    this.changeSpeed.emit();
  }

  /** Get sanitized SVG icon for template use */
  getIconSvg(name: IconName): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(getIcon(name));
  }
}
