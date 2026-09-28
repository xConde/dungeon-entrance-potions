import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ScrollableFadeDirective } from '@shared/directives/scrollable-fade.directive';
import { Adventurer, DungeonEvent } from '../../potion-stand.model';
import { getIcon } from '../../utils/icons';

/** Event types that warrant an assertive SR announcement. */
const HIGH_SIGNAL_EVENTS: ReadonlySet<DungeonEvent['eventType']> = new Set(['death', 'victory', 'boss']);

@Component({
  selector: 'app-dungeon-activity',
  templateUrl: './dungeon-activity.component.html',
  styleUrls: ['./dungeon-activity.component.scss'],
  standalone: true,
  imports: [CommonModule, ScrollableFadeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DungeonActivityComponent implements OnChanges {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly sanitizer = inject(DomSanitizer);

  /** Pre-rendered icon SVGs for log entries */
  readonly deathIconSvg: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(getIcon('skull'));
  readonly refuseIconSvg: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(getIcon('x-circle'));

  @Input() adventurers: Adventurer[] = [];
  @Input() events: DungeonEvent[] = [];
  @Input() currentFloor = 1;
  @Input() showFullNames = false;

  @Output() toggleNameDisplay = new EventEmitter<void>();

  expandedEventId: string | null = null;

  /**
   * Text piped into the sr-only assertive region.
   * Only populated for high-signal events (death / victory / boss).
   * Stays empty for low-severity per-tick combat noise.
   */
  srAnnouncement = '';

  /** Track the last event ID we've already announced to avoid repeat reads. */
  private lastAnnouncedEventId = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['events']) return;

    const events = this.events;
    if (!events.length) return;

    const latest = events[events.length - 1];
    if (latest.id !== this.lastAnnouncedEventId && HIGH_SIGNAL_EVENTS.has(latest.eventType)) {
      this.lastAnnouncedEventId = latest.id;
      this.srAnnouncement = latest.message;
      this.cdr.markForCheck();
    }
  }

  toggleEventDetail(eventId: string): void {
    this.expandedEventId = this.expandedEventId === eventId ? null : eventId;
    this.cdr.markForCheck();
  }

  /** Format relative time since timestamp */
  getTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }

  /** Get adventurer title for tooltip */
  getAdventurerTitle(adventurerId: string): string {
    const adventurer = this.adventurers.find((a) => a.id === adventurerId);
    if (adventurer) {
      return `${adventurer.name} the ${adventurer.class}`;
    }
    return '';
  }

  /**
   * SECURITY: Escape HTML entities to prevent XSS
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Format log message with clickable names
   * Pattern 1: "FirstName [LastName...] the ClassName" (e.g., "Brenna Stormborn the Barbarian")
   * Pattern 2: "FirstName LastName" without class title
   *
   * SECURITY: Message is escaped before any HTML insertion
   */
  formatLogMessage(message: string, showFull: boolean): string {
    // SECURITY: Escape the entire message first to prevent XSS
    const escapedMessage = this.escapeHtml(message);

    // Pattern 1: "FirstName [LastName...] the ClassName"
    const fullTitlePattern = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+the\s+[A-Z]\w+/;
    const titleMatch = escapedMessage.match(fullTitlePattern);

    if (titleMatch) {
      if (showFull) {
        return escapedMessage.replace(fullTitlePattern, '<strong class="clickable-name">$&</strong>');
      } else {
        const fullName = titleMatch[1];
        const firstName = fullName.split(' ')[0];
        return escapedMessage.replace(fullTitlePattern, `<strong class="clickable-name">${firstName}</strong>`);
      }
    }

    // Pattern 2: "FirstName LastName" without class title
    const twoWordNamePattern = /^([A-Z][a-z]+)\s+([A-Z][a-z]+)/;
    const nameMatch = escapedMessage.match(twoWordNamePattern);

    if (nameMatch) {
      const firstName = nameMatch[1];
      const fullName = `${nameMatch[1]} ${nameMatch[2]}`;

      if (showFull) {
        return escapedMessage.replace(twoWordNamePattern, `<strong class="clickable-name">${fullName}</strong>`);
      } else {
        return escapedMessage.replace(twoWordNamePattern, `<strong class="clickable-name">${firstName}</strong>`);
      }
    }

    // Fallback: Single-word name
    const firstNamePattern = /^([A-Z][a-z]+)/;
    return escapedMessage.replace(firstNamePattern, '<strong class="clickable-name">$1</strong>');
  }

  /** Handle click on log message to toggle name display */
  onLogMessageClick(event: MouseEvent): void {
    event.preventDefault();
    const target = event.target as HTMLElement;
    const strongElement = target.tagName === 'STRONG' ? target : target.closest('strong');

    if (strongElement && strongElement.classList.contains('clickable-name')) {
      this.toggleNameDisplay.emit();
      event.stopPropagation();
    }
  }

  /** Get CSS class for survival indicator */
  getSurvivalClass(chance: number): string {
    if (chance < 0.3) return 'danger';
    if (chance < 0.6) return 'warning';
    return 'good';
  }

  /** Get CSS class for HP bar based on current/max ratio */
  getHpClass(currentHp: number, maxHp: number): string {
    const ratio = currentHp / maxHp;
    if (ratio <= 0.25) return 'danger';
    if (ratio <= 0.5) return 'warning';
    return 'good';
  }
}
