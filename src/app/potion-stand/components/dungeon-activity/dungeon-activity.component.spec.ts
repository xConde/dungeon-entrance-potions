import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DungeonActivityComponent } from './dungeon-activity.component';
import { Adventurer, AdventurerClass, AdventurerStatus } from '../../models/adventurer.model';
import { DungeonEvent } from '../../models/game-state.model';

describe('DungeonActivityComponent', () => {
  let component: DungeonActivityComponent;
  let fixture: ComponentFixture<DungeonActivityComponent>;

  const createMockAdventurer = (overrides: Partial<Adventurer> = {}): Adventurer => ({
    id: 'adv-1',
    name: 'Test Adventurer',
    class: AdventurerClass.Warrior,
    level: 5,
    maxHp: 100,
    currentHp: 80,
    gold: 100,
    strength: 10,
    defense: 8,
    magic: 3,
    luck: 5,
    potionsConsumed: [],
    survivalChance: 0.7,
    status: AdventurerStatus.Exploring,
    enterTime: Date.now(),
    frugal: false,
    trusting: false,
    experienced: false,
    desperate: false,
    ...overrides,
  });

  const createMockEvent = (overrides: Partial<DungeonEvent> = {}): DungeonEvent => ({
    id: 'event-1',
    timestamp: Date.now(),
    adventurerId: 'adv-1',
    eventType: 'enter',
    message: 'Test Adventurer enters the dungeon',
    severity: 'info',
    ...overrides,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DungeonActivityComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DungeonActivityComponent);
    component = fixture.componentInstance;
  });

  describe('initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should have default currentFloor of 1', () => {
      expect(component.currentFloor).toBe(1);
    });

    it('should have default showFullNames of false', () => {
      expect(component.showFullNames).toBe(false);
    });
  });

  describe('input rendering', () => {
    it('should display panel title with floor badge', () => {
      fixture.componentRef.setInput('currentFloor', 5);
      fixture.detectChanges();

      const title = fixture.nativeElement.querySelector('.panel-title');
      expect(title.textContent).toContain('Dungeon Activity');
      expect(title.textContent).toContain('Floor 5');
    });

    it('should display adventurers when present', () => {
      const adventurers = [
        createMockAdventurer({ id: '1', name: 'Alice' }),
        createMockAdventurer({ id: '2', name: 'Bob' }),
      ];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const adventurerElements = fixture.nativeElement.querySelectorAll('.dungeon-adventurer');
      expect(adventurerElements.length).toBe(2);
    });

    it('should display adventurer name and status', () => {
      const adventurers = [createMockAdventurer({ name: 'TestHero', status: AdventurerStatus.Fighting })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const nameEl = fixture.nativeElement.querySelector('.dungeon-adventurer .name');
      const statusEl = fixture.nativeElement.querySelector('.dungeon-adventurer .status');
      expect(nameEl.textContent).toContain('TestHero');
      expect(statusEl.textContent).toContain('FIGHTING');
    });

    it('should display survival percentage', () => {
      const adventurers = [createMockAdventurer({ survivalChance: 0.65 })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const survivalPercent = fixture.nativeElement.querySelector('.survival-percent');
      expect(survivalPercent.textContent).toContain('65%');
    });
  });

  describe('events rendering', () => {
    it('should display events', () => {
      const events = [createMockEvent({ id: '1' }), createMockEvent({ id: '2' })];
      fixture.componentRef.setInput('events', events);
      fixture.detectChanges();

      const eventEntries = fixture.nativeElement.querySelectorAll('.log-entry');
      expect(eventEntries.length).toBe(2);
    });

    it('should display death icon for death events', () => {
      const events = [createMockEvent({ eventType: 'death' })];
      fixture.componentRef.setInput('events', events);
      fixture.detectChanges();

      const deathIcon = fixture.nativeElement.querySelector('.log-icon');
      expect(deathIcon).toBeTruthy();
      expect(deathIcon.querySelector('svg')).toBeTruthy();
    });

    it('should not display death icon for non-death events', () => {
      const events = [createMockEvent({ eventType: 'enter' })];
      fixture.componentRef.setInput('events', events);
      fixture.detectChanges();

      const deathIcon = fixture.nativeElement.querySelector('.log-icon');
      expect(deathIcon).toBeFalsy();
    });

    it('should show empty state when no events', () => {
      fixture.componentRef.setInput('events', []);
      fixture.detectChanges();

      const emptyState = fixture.nativeElement.querySelector('.empty-state');
      expect(emptyState).toBeTruthy();
      expect(emptyState.textContent).toContain("No one's braving the dungeon yet");
    });

    it('should show sell-a-potion guidance in empty state', () => {
      fixture.componentRef.setInput('events', []);
      fixture.detectChanges();

      const emptyState = fixture.nativeElement.querySelector('.empty-state');
      expect(emptyState.textContent).toContain("Sell a potion to a customer and they'll head down");
    });
  });

  describe('getTimeAgo method', () => {
    it('should return seconds format for recent timestamps', () => {
      const timestamp = Date.now() - 30000; // 30 seconds ago
      expect(component.getTimeAgo(timestamp)).toBe('30s ago');
    });

    it('should return minutes format for timestamps 1-59 minutes ago', () => {
      const timestamp = Date.now() - 5 * 60 * 1000; // 5 minutes ago
      expect(component.getTimeAgo(timestamp)).toBe('5m ago');
    });

    it('should return hours format for timestamps over 60 minutes ago', () => {
      const timestamp = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
      expect(component.getTimeAgo(timestamp)).toBe('2h ago');
    });
  });

  describe('getAdventurerTitle method', () => {
    it('should return formatted title for known adventurer', () => {
      const adventurers = [createMockAdventurer({ id: 'adv-1', name: 'Hero', class: AdventurerClass.Mage })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      expect(component.getAdventurerTitle('adv-1')).toBe('Hero the Mage');
    });

    it('should return empty string for unknown adventurer', () => {
      fixture.componentRef.setInput('adventurers', []);
      fixture.detectChanges();

      expect(component.getAdventurerTitle('unknown')).toBe('');
    });
  });

  describe('formatLogMessage method', () => {
    it('should bold full name with title when showFull is true', () => {
      const message = 'Brenna the Barbarian enters the dungeon';
      const result = component.formatLogMessage(message, true);
      expect(result).toContain('<strong class="clickable-name">Brenna the Barbarian</strong>');
    });

    it('should show first name only when showFull is false', () => {
      const message = 'Brenna the Barbarian enters the dungeon';
      const result = component.formatLogMessage(message, false);
      expect(result).toContain('<strong class="clickable-name">Brenna</strong>');
      expect(result).not.toContain('Barbarian');
    });

    it('should handle two-word names without class', () => {
      const message = 'Wren Sunforce enters the dungeon';
      const resultShort = component.formatLogMessage(message, false);
      const resultFull = component.formatLogMessage(message, true);

      expect(resultShort).toContain('<strong class="clickable-name">Wren</strong>');
      expect(resultFull).toContain('<strong class="clickable-name">Wren Sunforce</strong>');
    });

    it('should handle multi-part last names with title', () => {
      const message = 'Brenna Stormborn the Barbarian enters the dungeon';
      const resultShort = component.formatLogMessage(message, false);
      const resultFull = component.formatLogMessage(message, true);

      expect(resultShort).toContain('<strong class="clickable-name">Brenna</strong>');
      expect(resultFull).toContain('<strong class="clickable-name">Brenna Stormborn the Barbarian</strong>');
    });

    it('should handle single-word names (fallback pattern)', () => {
      const message = 'entered the dungeon';
      const result = component.formatLogMessage(message, false);
      // Should not match any pattern, return as-is
      expect(result).toBe('entered the dungeon');
    });

    it('should bold single capitalized name at start', () => {
      const message = 'Alice did something';
      const result = component.formatLogMessage(message, false);
      expect(result).toContain('<strong class="clickable-name">Alice</strong>');
    });
  });

  describe('getSurvivalClass method', () => {
    it('should return danger for chance < 0.3', () => {
      expect(component.getSurvivalClass(0.2)).toBe('danger');
      expect(component.getSurvivalClass(0.1)).toBe('danger');
    });

    it('should return warning for chance >= 0.3 and < 0.6', () => {
      expect(component.getSurvivalClass(0.3)).toBe('warning');
      expect(component.getSurvivalClass(0.5)).toBe('warning');
    });

    it('should return good for chance >= 0.6', () => {
      expect(component.getSurvivalClass(0.6)).toBe('good');
      expect(component.getSurvivalClass(0.9)).toBe('good');
    });
  });

  describe('survival bar styling', () => {
    it('should apply danger class for low survival', () => {
      const adventurers = [createMockAdventurer({ survivalChance: 0.2 })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const survivalBar = fixture.nativeElement.querySelector('.survival-bar');
      expect(survivalBar.classList.contains('danger')).toBeTrue();
    });

    it('should apply warning class for medium survival', () => {
      const adventurers = [createMockAdventurer({ survivalChance: 0.45 })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const survivalBar = fixture.nativeElement.querySelector('.survival-bar');
      expect(survivalBar.classList.contains('warning')).toBeTrue();
    });

    it('should apply good class for high survival', () => {
      const adventurers = [createMockAdventurer({ survivalChance: 0.75 })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const survivalBar = fixture.nativeElement.querySelector('.survival-bar');
      expect(survivalBar.classList.contains('good')).toBeTrue();
    });
  });

  describe('output events', () => {
    it('should emit toggleNameDisplay when clickable name is clicked', () => {
      const events = [createMockEvent({ message: 'Test the Warrior enters' })];
      fixture.componentRef.setInput('events', events);
      fixture.detectChanges();

      const spy = spyOn(component.toggleNameDisplay, 'emit');

      // Find and click the clickable name
      const clickableName = fixture.nativeElement.querySelector('.clickable-name');
      if (clickableName) {
        clickableName.click();
        expect(spy).toHaveBeenCalled();
      }
    });

    it('should not emit when clicking non-clickable-name element', () => {
      const events = [createMockEvent({ message: 'Test the Warrior enters' })];
      fixture.componentRef.setInput('events', events);
      fixture.detectChanges();

      const spy = spyOn(component.toggleNameDisplay, 'emit');
      const logEntry = fixture.nativeElement.querySelector('.log-entry');
      if (logEntry) {
        logEntry.click();
      }
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have role="log" on the dungeon event list', () => {
      fixture.componentRef.setInput('events', []);
      fixture.componentRef.setInput('adventurers', []);
      fixture.detectChanges();

      const logEl = fixture.nativeElement.querySelector('.dungeon-log');
      expect(logEl).toBeTruthy();
      expect(logEl.getAttribute('role')).toBe('log');
    });

    it('should have aria-live="polite" on the dungeon log', () => {
      fixture.componentRef.setInput('events', []);
      fixture.componentRef.setInput('adventurers', []);
      fixture.detectChanges();

      const logEl = fixture.nativeElement.querySelector('.dungeon-log');
      expect(logEl).toBeTruthy();
      expect(logEl.getAttribute('aria-live')).toBe('polite');
    });

    it('should have aria-label on the dungeon log', () => {
      fixture.componentRef.setInput('events', []);
      fixture.componentRef.setInput('adventurers', []);
      fixture.detectChanges();

      const logEl = fixture.nativeElement.querySelector('.dungeon-log');
      expect(logEl).toBeTruthy();
      expect(logEl.getAttribute('aria-label')).toBe('Dungeon activity log');
    });
  });

  describe('SR throttle (A11Y-1)', () => {
    it('should mark info-severity log entries aria-hidden to suppress per-tick noise', () => {
      const events = [createMockEvent({ id: '1', severity: 'info', eventType: 'combat' })];
      fixture.componentRef.setInput('events', events);
      fixture.detectChanges();

      const entry = fixture.nativeElement.querySelector('.log-entry');
      expect(entry.getAttribute('aria-hidden')).toBe('true');
    });

    it('should NOT set aria-hidden on non-info log entries', () => {
      const events = [createMockEvent({ id: '1', severity: 'danger', eventType: 'death' })];
      fixture.componentRef.setInput('events', events);
      fixture.detectChanges();

      const entry = fixture.nativeElement.querySelector('.log-entry');
      expect(entry.getAttribute('aria-hidden')).toBeNull();
    });

    it('should have a sr-only-announcer region with assertive live', () => {
      fixture.componentRef.setInput('events', []);
      fixture.detectChanges();

      const announcer = fixture.nativeElement.querySelector('.sr-only-announcer');
      expect(announcer).toBeTruthy();
      expect(announcer.getAttribute('aria-live')).toBe('assertive');
    });

    it('should populate srAnnouncement for death events', () => {
      const events = [
        createMockEvent({ id: 'e1', eventType: 'death', severity: 'danger', message: 'Test the Warrior perished.' }),
      ];
      fixture.componentRef.setInput('events', events);
      fixture.detectChanges();

      expect(component.srAnnouncement).toBe('Test the Warrior perished.');
    });

    it('should populate srAnnouncement for victory events', () => {
      const events = [
        createMockEvent({ id: 'e2', eventType: 'victory', severity: 'success', message: 'Test claims the treasure.' }),
      ];
      fixture.componentRef.setInput('events', events);
      fixture.detectChanges();

      expect(component.srAnnouncement).toBe('Test claims the treasure.');
    });

    it('should populate srAnnouncement for boss events', () => {
      const events = [
        createMockEvent({ id: 'e3', eventType: 'boss', severity: 'warning', message: 'A boss lurks on floor 5.' }),
      ];
      fixture.componentRef.setInput('events', events);
      fixture.detectChanges();

      expect(component.srAnnouncement).toBe('A boss lurks on floor 5.');
    });

    it('should NOT populate srAnnouncement for low-signal info events', () => {
      const events = [
        createMockEvent({ id: 'e4', eventType: 'combat', severity: 'info', message: 'Test strikes for 3 damage.' }),
      ];
      fixture.componentRef.setInput('events', events);
      fixture.detectChanges();

      expect(component.srAnnouncement).toBe('');
    });

    it('should not repeat the same announcement for the same event id', () => {
      const events = [createMockEvent({ id: 'e5', eventType: 'death', severity: 'danger', message: 'First death.' })];
      fixture.componentRef.setInput('events', events);
      fixture.detectChanges();

      expect(component.srAnnouncement).toBe('First death.');

      // Simulate a re-render without new events — announcement should stay (not blank out)
      // but also should not re-trigger for the same id
      fixture.componentRef.setInput('events', [...events]);
      fixture.detectChanges();

      expect(component.srAnnouncement).toBe('First death.');
    });
  });

  describe('expandedEventId state', () => {
    it('should start with expandedEventId as null', () => {
      expect(component.expandedEventId).toBeNull();
    });

    it('should set expandedEventId when toggleEventDetail is called', () => {
      component.toggleEventDetail('event-1');
      expect(component.expandedEventId).toBe('event-1');
    });

    it('should collapse when same event id is toggled again', () => {
      component.toggleEventDetail('event-1');
      component.toggleEventDetail('event-1');
      expect(component.expandedEventId).toBeNull();
    });

    it('should switch to new event when different id is toggled', () => {
      component.toggleEventDetail('event-1');
      component.toggleEventDetail('event-2');
      expect(component.expandedEventId).toBe('event-2');
    });

    it('should show event-detail in template when event is expanded', () => {
      const events = [createMockEvent({ id: 'event-1' })];
      fixture.componentRef.setInput('events', events);
      fixture.detectChanges();

      component.toggleEventDetail('event-1');
      fixture.detectChanges();

      const detail = fixture.nativeElement.querySelector('.event-detail');
      expect(detail).toBeTruthy();
    });

    it('should not show event-detail when event is not expanded', () => {
      const events = [createMockEvent({ id: 'event-1' })];
      fixture.componentRef.setInput('events', events);
      component.expandedEventId = null;
      fixture.detectChanges();

      const detail = fixture.nativeElement.querySelector('.event-detail');
      expect(detail).toBeFalsy();
    });

    it('should toggle expandedEventId when log entry is clicked', () => {
      const events = [createMockEvent({ id: 'event-1' })];
      fixture.componentRef.setInput('events', events);
      fixture.detectChanges();

      const logEntry = fixture.nativeElement.querySelector('.log-entry');
      logEntry.click();
      expect(component.expandedEventId).toBe('event-1');

      logEntry.click();
      expect(component.expandedEventId).toBeNull();
    });
  });

  describe('onLogMessageClick method', () => {
    it('should emit when target is a STRONG element with clickable-name class', () => {
      const spy = spyOn(component.toggleNameDisplay, 'emit');
      const mockEvent = {
        preventDefault: jasmine.createSpy('preventDefault'),
        stopPropagation: jasmine.createSpy('stopPropagation'),
        target: {
          tagName: 'STRONG',
          classList: { contains: (cls: string) => cls === 'clickable-name' },
          closest: () => null,
        },
      } as unknown as MouseEvent;

      component.onLogMessageClick(mockEvent);

      expect(spy).toHaveBeenCalled();
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
    });

    it('should emit when target is child of STRONG with clickable-name class', () => {
      const spy = spyOn(component.toggleNameDisplay, 'emit');
      const strongElement = {
        classList: { contains: (cls: string) => cls === 'clickable-name' },
      };
      const mockEvent = {
        preventDefault: jasmine.createSpy('preventDefault'),
        stopPropagation: jasmine.createSpy('stopPropagation'),
        target: {
          tagName: 'SPAN',
          closest: (selector: string) => (selector === 'strong' ? strongElement : null),
        },
      } as unknown as MouseEvent;

      component.onLogMessageClick(mockEvent);

      expect(spy).toHaveBeenCalled();
    });

    it('should not emit when strongElement lacks clickable-name class', () => {
      const spy = spyOn(component.toggleNameDisplay, 'emit');
      const strongElement = {
        classList: { contains: () => false },
      };
      const mockEvent = {
        preventDefault: jasmine.createSpy('preventDefault'),
        stopPropagation: jasmine.createSpy('stopPropagation'),
        target: {
          tagName: 'SPAN',
          closest: (selector: string) => (selector === 'strong' ? strongElement : null),
        },
      } as unknown as MouseEvent;

      component.onLogMessageClick(mockEvent);

      expect(spy).not.toHaveBeenCalled();
    });

    it('should not emit when no strongElement found', () => {
      const spy = spyOn(component.toggleNameDisplay, 'emit');
      const mockEvent = {
        preventDefault: jasmine.createSpy('preventDefault'),
        stopPropagation: jasmine.createSpy('stopPropagation'),
        target: {
          tagName: 'DIV',
          closest: () => null,
        },
      } as unknown as MouseEvent;

      component.onLogMessageClick(mockEvent);

      expect(spy).not.toHaveBeenCalled();
    });
  });
});
