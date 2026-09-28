import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CustomerQueueComponent, PurchaseAnimation } from './customer-queue.component';
import { Adventurer, AdventurerClass, AdventurerStatus, PotionEffect } from '../../models/adventurer.model';

// Same three-format parser as merchant-tips.component.spec.ts: `.potion-chip`
// fills resolve through CSS custom properties that may themselves be
// color-mix() results, so Chrome can serialise the computed value as
// `color(srgb r g b)` rather than plain `rgb(r, g, b)`.
function parseColorChannels(value: string): [number, number, number] {
  const colorMixMatch = value.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (colorMixMatch) {
    return [parseFloat(colorMixMatch[1]) * 255, parseFloat(colorMixMatch[2]) * 255, parseFloat(colorMixMatch[3]) * 255];
  }
  const rgbMatch = value.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const [r, g, b] = rgbMatch[1].split(',').map((channel) => parseFloat(channel.trim()));
    return [r, g, b];
  }
  const hexMatch = value.match(/^#?([\da-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  throw new Error(`Unrecognized computed colour format: "${value}"`);
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = ([r, g, b]: [number, number, number]): number => {
    const linear = [r, g, b].map((channel) => {
      const c = channel / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const first = luminance(parseColorChannels(foreground));
  const second = luminance(parseColorChannels(background));
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('CustomerQueueComponent', () => {
  let component: CustomerQueueComponent;
  let fixture: ComponentFixture<CustomerQueueComponent>;

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
    status: AdventurerStatus.Shopping,
    enterTime: Date.now(),
    frugal: false,
    trusting: false,
    experienced: false,
    desperate: false,
    ...overrides,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerQueueComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomerQueueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Input rendering', () => {
    it('should display adventurer count in queue', () => {
      const adventurers = [createMockAdventurer({ id: '1' }), createMockAdventurer({ id: '2' })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const queueCount = fixture.nativeElement.querySelector('.queue-count');
      expect(queueCount.textContent).toContain('2/5');
    });

    it('should render adventurer cards', () => {
      const adventurers = [
        createMockAdventurer({ id: '1', name: 'Alice' }),
        createMockAdventurer({ id: '2', name: 'Bob' }),
      ];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const cards = fixture.nativeElement.querySelectorAll('.adventurer-card');
      expect(cards.length).toBe(2);
    });

    it('should display adventurer name and level', () => {
      const adventurers = [createMockAdventurer({ name: 'TestHero', level: 7, class: AdventurerClass.Mage })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const nameEl = fixture.nativeElement.querySelector('.adventurer-name');
      const classEl = fixture.nativeElement.querySelector('.adventurer-class');
      expect(nameEl.textContent).toContain('TestHero');
      expect(classEl.textContent).toContain('Lv7 Mage');
    });

    it('should display adventurer gold', () => {
      const adventurers = [createMockAdventurer({ gold: 150 })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const goldEl = fixture.nativeElement.querySelector('.adventurer-gold');
      expect(goldEl.textContent).toContain('150');
    });

    it('should show HP bar with correct width', () => {
      const adventurers = [createMockAdventurer({ currentHp: 50, maxHp: 100 })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const hpFill = fixture.nativeElement.querySelector('.hp-fill');
      expect(hpFill.style.width).toBe('50%');
    });

    it('should display HP text', () => {
      const adventurers = [createMockAdventurer({ currentHp: 75, maxHp: 100 })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const hpText = fixture.nativeElement.querySelector('.hp-text');
      expect(hpText.textContent).toContain('75/100');
    });
  });

  describe('Selected state', () => {
    it('should apply selected class when adventurer is selected', () => {
      const adventurer = createMockAdventurer({ id: 'sel-1' });
      fixture.componentRef.setInput('adventurers', [adventurer]);
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.adventurer-card');
      expect(card.classList.contains('selected')).toBeTrue();
    });

    it('should not apply selected class when different adventurer is selected', () => {
      const adventurer1 = createMockAdventurer({ id: 'adv-1' });
      const adventurer2 = createMockAdventurer({ id: 'adv-2' });
      fixture.componentRef.setInput('adventurers', [adventurer1]);
      fixture.componentRef.setInput('selectedAdventurer', adventurer2);
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.adventurer-card');
      expect(card.classList.contains('selected')).toBeFalse();
    });
  });

  describe('Badges and traits', () => {
    it('should show desperate badge when adventurer is desperate', () => {
      const adventurers = [createMockAdventurer({ desperate: true })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.badge.desperate');
      expect(badge).toBeTruthy();
      expect(badge.textContent).toContain('!');
    });

    it('should show low-hp badge when HP is below 50%', () => {
      const adventurers = [createMockAdventurer({ currentHp: 40, maxHp: 100 })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.badge.low-hp');
      expect(badge).toBeTruthy();
    });

    it('should show wealthy badge when gold is above 150', () => {
      const adventurers = [createMockAdventurer({ gold: 200 })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.badge.wealthy');
      expect(badge).toBeTruthy();
    });

    it('should show frugal trait inline with tooltip', () => {
      const adventurers = [createMockAdventurer({ frugal: true })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const trait = fixture.nativeElement.querySelector('.trait-inline');
      expect(trait.textContent).toContain('Frugal');
      expect(trait.getAttribute('title')).toContain('20% less');
    });

    it('should show trusting trait inline with tooltip', () => {
      const adventurers = [createMockAdventurer({ trusting: true })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const trait = fixture.nativeElement.querySelector('.trait-inline');
      expect(trait.textContent).toContain('Trusting');
      expect(trait.getAttribute('title')).toContain('Buys anything');
    });

    it('should show experienced trait inline with tooltip', () => {
      const adventurers = [createMockAdventurer({ experienced: true })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const trait = fixture.nativeElement.querySelector('.trait-inline');
      expect(trait.textContent).toContain('Experienced');
      expect(trait.getAttribute('title')).toContain('watered-down');
    });
  });

  describe('HP bar styling', () => {
    it('should apply low class when HP below 30%', () => {
      const adventurers = [createMockAdventurer({ currentHp: 25, maxHp: 100 })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const hpFill = fixture.nativeElement.querySelector('.hp-fill');
      expect(hpFill.classList.contains('low')).toBeTrue();
    });

    it('should apply medium class when HP between 30% and 60%', () => {
      const adventurers = [createMockAdventurer({ currentHp: 45, maxHp: 100 })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const hpFill = fixture.nativeElement.querySelector('.hp-fill');
      expect(hpFill.classList.contains('medium')).toBeTrue();
    });

    it('should not apply low or medium class when HP above 60%', () => {
      const adventurers = [createMockAdventurer({ currentHp: 75, maxHp: 100 })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const hpFill = fixture.nativeElement.querySelector('.hp-fill');
      expect(hpFill.classList.contains('low')).toBeFalse();
      expect(hpFill.classList.contains('medium')).toBeFalse();
    });
  });

  describe('Card styling', () => {
    it('should apply desperate class to card when adventurer is desperate', () => {
      const adventurers = [createMockAdventurer({ desperate: true })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.adventurer-card');
      expect(card.classList.contains('desperate')).toBeTrue();
    });

    it('should apply low-hp class to card when HP below 50%', () => {
      const adventurers = [createMockAdventurer({ currentHp: 40, maxHp: 100 })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.adventurer-card');
      expect(card.classList.contains('low-hp')).toBeTrue();
    });
  });

  describe('Purchase animation', () => {
    it('should show purchase overlay when purchaseAnimation matches adventurer', () => {
      const adventurer = createMockAdventurer({ id: 'anim-1' });
      const animation: PurchaseAnimation = { adventurerId: 'anim-1', amount: 50 };

      fixture.componentRef.setInput('adventurers', [adventurer]);
      fixture.componentRef.setInput('purchaseAnimation', animation);
      fixture.detectChanges();

      const overlay = fixture.nativeElement.querySelector('.purchase-overlay');
      expect(overlay).toBeTruthy();
    });

    it('should display purchase amount in overlay', () => {
      const adventurer = createMockAdventurer({ id: 'anim-2' });
      const animation: PurchaseAnimation = { adventurerId: 'anim-2', amount: 75 };

      fixture.componentRef.setInput('adventurers', [adventurer]);
      fixture.componentRef.setInput('purchaseAnimation', animation);
      fixture.detectChanges();

      const amount = fixture.nativeElement.querySelector('.purchase-amount');
      expect(amount.textContent).toContain('+75');
    });

    it('should not show purchase overlay for other adventurers', () => {
      const adventurer1 = createMockAdventurer({ id: 'adv-1' });
      const adventurer2 = createMockAdventurer({ id: 'adv-2' });
      const animation: PurchaseAnimation = { adventurerId: 'adv-2', amount: 50 };

      fixture.componentRef.setInput('adventurers', [adventurer1, adventurer2]);
      fixture.componentRef.setInput('purchaseAnimation', animation);
      fixture.detectChanges();

      const cards = fixture.nativeElement.querySelectorAll('.adventurer-card');
      const overlay1 = cards[0].querySelector('.purchase-overlay');
      const overlay2 = cards[1].querySelector('.purchase-overlay');
      expect(overlay1).toBeFalsy();
      expect(overlay2).toBeTruthy();
    });
  });

  describe('Empty state', () => {
    it('should show empty state when no adventurers', () => {
      fixture.componentRef.setInput('adventurers', []);
      fixture.detectChanges();

      const emptyState = fixture.nativeElement.querySelector('.empty-state');
      expect(emptyState).toBeTruthy();
      expect(emptyState.textContent).toContain('No adventurers yet');
    });

    it('should show time-based hint in empty state', () => {
      fixture.componentRef.setInput('adventurers', []);
      fixture.componentRef.setInput('timeOfDay', 'Morning');
      fixture.detectChanges();

      const hint = fixture.nativeElement.querySelector('.empty-state .hint');
      expect(hint.textContent).toContain('They arrive through the day');
    });

    it('should update hint based on time of day', () => {
      fixture.componentRef.setInput('adventurers', []);
      fixture.componentRef.setInput('timeOfDay', 'Night');
      fixture.detectChanges();

      const hint = fixture.nativeElement.querySelector('.empty-state .hint');
      expect(hint.textContent).toContain('desperate souls');
    });

    it('should include actionable guidance in every time-of-day hint', () => {
      const times: Array<'Morning' | 'Afternoon' | 'Evening' | 'Night'> = ['Morning', 'Afternoon', 'Evening', 'Night'];
      for (const time of times) {
        fixture.componentRef.setInput('adventurers', []);
        fixture.componentRef.setInput('timeOfDay', time);
        fixture.detectChanges();

        const hint = fixture.nativeElement.querySelector('.empty-state .hint');
        expect(hint.textContent).withContext(`time: ${time}`).toContain('Sell each one a potion');
      }
    });
  });

  describe('Output events', () => {
    it('should emit selectAdventurer when card is clicked', () => {
      const adventurer = createMockAdventurer({ id: 'click-1' });
      const spy = spyOn(component.selectAdventurer, 'emit');

      fixture.componentRef.setInput('adventurers', [adventurer]);
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.adventurer-card');
      card.click();

      expect(spy).toHaveBeenCalledWith(adventurer);
    });

    it('should emit selectAdventurer when Enter is pressed', () => {
      const adventurer = createMockAdventurer({ id: 'enter-1' });
      const spy = spyOn(component.selectAdventurer, 'emit');

      fixture.componentRef.setInput('adventurers', [adventurer]);
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.adventurer-card');
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      card.dispatchEvent(event);

      expect(spy).toHaveBeenCalledWith(adventurer);
    });
  });

  describe('getPotionSlotType', () => {
    it('should return "speed" for speed potions', () => {
      const potion: PotionEffect = {
        potionId: 'speed-elixir',
        name: 'Speed Elixir',
        quality: 1,
        duration: 300,
        statModifiers: { speed: 5 },
      };
      expect(component.getPotionSlotType(potion)).toBe('speed');
    });

    it('should return "luck" for luck potions', () => {
      const potion: PotionEffect = {
        potionId: 'luck-charm',
        name: 'Luck Charm',
        quality: 1,
        duration: 300,
        statModifiers: { luck: 5 },
      };
      expect(component.getPotionSlotType(potion)).toBe('luck');
    });

    it('should return "healing" for hp potions', () => {
      const potion: PotionEffect = {
        potionId: 'basic-healing',
        name: 'Healing Potion',
        quality: 1,
        duration: 300,
        statModifiers: { hp: 30 },
      };
      expect(component.getPotionSlotType(potion)).toBe('healing');
    });
  });

  // Owner redo 2026-08-17: .potion-chip corners were squared to the
  // project's inked-tag vocabulary (see the component SCSS comment above
  // .potion-chip). Radius doesn't change contrast, but this is the first
  // rendered-contrast coverage for these chips, so it pins real values
  // rather than assuming the pre-existing colours were ever verified.
  describe('potion-chip contrast (rendered)', () => {
    const potionByType: Record<'healing' | 'strength' | 'defense' | 'speed' | 'luck', PotionEffect> = {
      healing: {
        potionId: 'basic-healing',
        name: 'Healing Potion',
        quality: 1,
        duration: 300,
        statModifiers: { hp: 30 },
      },
      strength: {
        potionId: 'strength-potion',
        name: 'Strength Potion',
        quality: 1,
        duration: 300,
        statModifiers: { strength: 5 },
      },
      defense: {
        potionId: 'defense-potion',
        name: 'Defense Potion',
        quality: 1,
        duration: 300,
        statModifiers: { defense: 5 },
      },
      speed: { potionId: 'speed-elixir', name: 'Speed Elixir', quality: 1, duration: 300, statModifiers: { speed: 5 } },
      luck: { potionId: 'luck-charm', name: 'Luck Charm', quality: 1, duration: 300, statModifiers: { luck: 5 } },
    };

    // .filled fills are now anchored solid colours (see the component SCSS
    // comment above .potion-chip.filled) — theme-invariant by construction,
    // so the body-class toggle mainly documents that both cases render the
    // same passing value. --cave-ink (the .empty chip's text colour after
    // the muted->full ink swap) is only ever set by the PARENT
    // potion-stand.component's :host / :host-context(.day-mode) block
    // (_layout.scss) — absent here in an isolated component fixture, it
    // silently falls back to its night default regardless of body class.
    // Pinned directly per case, same fix as merchant-tips.component.spec.ts's
    // --tavern-gold override.
    const themeCases: Array<{ label: string; className: string; caveInk: string }> = [
      { label: 'night', className: 'night-mode', caveInk: '#e2d4ba' },
      { label: 'day', className: 'day-mode', caveInk: '#2f2716' },
    ];

    for (const { label, className, caveInk } of themeCases) {
      it(`holds WCAG AA for every .potion-chip.filled variant fill in ${label}`, () => {
        document.body.classList.add(className);
        try {
          for (const kind of Object.keys(potionByType) as Array<keyof typeof potionByType>) {
            const single = createMockAdventurer({ id: kind, potionsConsumed: [potionByType[kind]] });
            fixture.componentRef.setInput('adventurers', [single]);
            fixture.detectChanges();

            const chip: HTMLElement | null = fixture.nativeElement.querySelector(`.potion-chip.filled.${kind}`);
            expect(chip).withContext(`no .potion-chip.filled.${kind} rendered`).toBeTruthy();

            const styles = getComputedStyle(chip!);
            const ratio = contrastRatio(styles.color, styles.backgroundColor);
            expect(ratio)
              .withContext(`${kind} in ${label}: ${styles.color} on ${styles.backgroundColor} = ${ratio.toFixed(2)}:1`)
              .toBeGreaterThanOrEqual(4.5);
          }
        } finally {
          document.body.classList.remove(className);
        }
      });

      // .potion-chip.empty has no fill of its own (dashed border only) — its
      // real backdrop is .adventurer-card's `color-mix(--cave-slot 60%,
      // transparent)`, a genuinely alpha-composited value getComputedStyle
      // can't resolve to a final pixel colour without knowing what's behind
      // it. --cave-slot is the majority (60%) ingredient of that mix and this
      // game never floats the card over anything outside its own warm
      // dark/warm-tan palette, so measuring the chip's real text colour
      // against the solid --cave-slot value is a conservative stand-in for
      // the true composite, not an exact figure.
      it(`holds WCAG AA text contrast for the .potion-chip.empty "+combo?" chip in ${label}`, () => {
        document.body.classList.add(className);
        // --cave-ink (the chip's own text colour) is only ever set by the
        // parent potion-stand.component's :host block, absent from this
        // isolated fixture — pin it so getComputedStyle reflects the real
        // per-theme ink rather than always the night fallback.
        fixture.nativeElement.style.setProperty('--cave-ink', caveInk);
        try {
          // potionsConsumed.length < 2 is required for the empty slot to render.
          const adventurer = createMockAdventurer({ potionsConsumed: [potionByType.healing] });
          fixture.componentRef.setInput('adventurers', [adventurer]);
          fixture.detectChanges();

          const chip: HTMLElement | null = fixture.nativeElement.querySelector('.potion-chip.empty');
          expect(chip).withContext('no .potion-chip.empty rendered').toBeTruthy();

          const chipStyles = getComputedStyle(chip!);
          const caveSlot = label === 'day' ? '#bba87c' : '#120e09';
          const ratio = contrastRatio(chipStyles.color, caveSlot);
          expect(ratio)
            .withContext(
              `empty chip text in ${label}: ${chipStyles.color} on --cave-slot ${caveSlot} = ${ratio.toFixed(2)}:1`
            )
            .toBeGreaterThanOrEqual(4.5);
        } finally {
          document.body.classList.remove(className);
        }
      });
    }
  });

  describe('Speech bubble display', () => {
    it('should display speech bubble when adventurer has one', () => {
      const adventurers = [createMockAdventurer({ speechBubble: 'I need healing!' })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const bubble = fixture.nativeElement.querySelector('.speech-bubble');
      expect(bubble).toBeTruthy();
      expect(bubble.textContent).toContain('I need healing!');
    });

    it('should not render speech bubble element when adventurer has none', () => {
      const adventurers = [createMockAdventurer()];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const bubble = fixture.nativeElement.querySelector('.speech-bubble');
      expect(bubble).toBeFalsy();
    });
  });

  describe('Accessibility', () => {
    it('should have correct aria-label on cards including HP and gold', () => {
      const adventurers = [
        createMockAdventurer({
          name: 'AriaTest',
          level: 3,
          class: AdventurerClass.Rogue,
          gold: 50,
          currentHp: 60,
          maxHp: 100,
        }),
      ];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.adventurer-card');
      const ariaLabel = card.getAttribute('aria-label');
      expect(ariaLabel).toContain('Select AriaTest');
      expect(ariaLabel).toContain('level 3');
      expect(ariaLabel).toContain('Rogue');
      expect(ariaLabel).toContain('50 gold');
      expect(ariaLabel).toContain('HP 60/100');
    });

    it('should include "desperate" in aria-label when adventurer is desperate', () => {
      const adventurers = [createMockAdventurer({ name: 'DespTest', desperate: true })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.adventurer-card');
      const ariaLabel = card.getAttribute('aria-label');
      expect(ariaLabel).toContain('desperate');
    });

    it('should include "frugal" in aria-label when adventurer is frugal', () => {
      const adventurers = [createMockAdventurer({ name: 'FrugalTest', frugal: true })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.adventurer-card');
      const ariaLabel = card.getAttribute('aria-label');
      expect(ariaLabel).toContain('frugal');
    });

    it('should have role="button" on cards', () => {
      const adventurers = [createMockAdventurer()];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.adventurer-card');
      expect(card.getAttribute('role')).toBe('button');
    });

    it('should have tabindex on cards', () => {
      const adventurers = [createMockAdventurer()];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.adventurer-card');
      expect(card.getAttribute('tabindex')).toBe('0');
    });

    it('should have correct aria-pressed when selected', () => {
      const adventurer = createMockAdventurer({ id: 'aria-1' });
      fixture.componentRef.setInput('adventurers', [adventurer]);
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.adventurer-card');
      expect(card.getAttribute('aria-pressed')).toBe('true');
    });

    it('should have correct aria-pressed when not selected', () => {
      const adventurer = createMockAdventurer({ id: 'aria-2' });
      fixture.componentRef.setInput('adventurers', [adventurer]);
      fixture.componentRef.setInput('selectedAdventurer', null);
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.adventurer-card');
      expect(card.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('Keyboard navigation', () => {
    it('should emit selectAdventurer when Space is pressed', () => {
      const adventurer = createMockAdventurer({ id: 'space-1' });
      const spy = spyOn(component.selectAdventurer, 'emit');

      fixture.componentRef.setInput('adventurers', [adventurer]);
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.adventurer-card');
      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      card.dispatchEvent(event);

      expect(spy).toHaveBeenCalledWith(adventurer);
    });
  });

  describe('Badge tooltips', () => {
    it('should show tooltip on desperate badge', () => {
      const adventurers = [createMockAdventurer({ desperate: true })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.badge.desperate');
      expect(badge.getAttribute('title')).toContain('Desperate');
    });

    it('should show tooltip on low-hp badge', () => {
      const adventurers = [createMockAdventurer({ currentHp: 40, maxHp: 100 })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.badge.low-hp');
      expect(badge.getAttribute('title')).toContain('health');
    });

    it('should render low-hp badge text as "HP"', () => {
      const adventurers = [createMockAdventurer({ currentHp: 40, maxHp: 100 })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.badge.low-hp');
      expect(badge.textContent?.trim()).toBe('HP');
    });

    it('should render +combo? chip with tooltip when adventurer has one potion', () => {
      const potion: PotionEffect = {
        potionId: 'basic-healing',
        name: 'Healing Potion',
        quality: 1,
        duration: 300,
        statModifiers: { hp: 30 },
      };
      const adventurers = [createMockAdventurer({ potionsConsumed: [potion] })];
      fixture.componentRef.setInput('adventurers', adventurers);
      fixture.detectChanges();

      const emptyChip = fixture.nativeElement.querySelector('.potion-chip.empty');
      expect(emptyChip).toBeTruthy();
      expect(emptyChip.textContent?.trim()).toBe('+combo?');
      expect(emptyChip.getAttribute('title')).toContain('combo');
    });
  });
});
