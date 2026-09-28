import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MerchantTipsComponent } from './merchant-tips.component';
import type { CustomerReview } from '../../models/game-state.model';

// The combo-tag fills are `color-mix(in srgb, ...)` results, not plain colours,
// so Chrome's computed style serialises them as `color(srgb r g b)` (0-1 floats)
// rather than `rgb(r, g, b)` — a hex-only parser (like game-header.component.spec.ts's
// contrastRatio) can't read that. This parser covers all three formats the
// combo-tag / review-item rules in this component can actually resolve to.
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

describe('MerchantTipsComponent', () => {
  let component: MerchantTipsComponent;
  let fixture: ComponentFixture<MerchantTipsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MerchantTipsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MerchantTipsComponent);
    component = fixture.componentInstance;
  });

  describe('initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should default day to 1', () => {
      expect(component.day).toBe(1);
    });

    it('should default currentFloor to 1', () => {
      expect(component.currentFloor).toBe(1);
    });

    it('should default customerReviews to empty array', () => {
      expect(component.customerReviews.length).toBe(0);
    });
  });

  describe('panel title', () => {
    it('should display "Day X, Morning" format with a comma, not a hyphen', () => {
      fixture.componentRef.setInput('day', 3);
      fixture.detectChanges();
      const title = fixture.nativeElement.querySelector('.panel-title');
      expect(title.textContent).toContain('Day 3, Morning');
      expect(title.textContent).not.toContain('Day 3 - Morning');
    });

    it('should not contain em-dashes in the panel title', () => {
      fixture.componentRef.setInput('day', 1);
      fixture.detectChanges();
      const title = fixture.nativeElement.querySelector('.panel-title');
      expect(title.textContent).not.toContain('—');
    });
  });

  describe('no upgrades section', () => {
    it('should NOT render the recipe upgrades section', () => {
      fixture.detectChanges();
      const upgradeSection = fixture.nativeElement.querySelector('.tip-section.upgrades');
      expect(upgradeSection).toBeNull();
    });

    it('should NOT render any upgrade buttons', () => {
      fixture.detectChanges();
      const upgradeBtns = fixture.nativeElement.querySelectorAll('.upgrade-btn');
      expect(upgradeBtns.length).toBe(0);
    });
  });

  describe('combo recipes section', () => {
    it('should render the combo recipes section', () => {
      fixture.detectChanges();
      const comboSection = fixture.nativeElement.querySelector('.tip-section.combos');
      expect(comboSection).toBeTruthy();
    });

    it('should render combo items from POTION_COMBOS', () => {
      fixture.detectChanges();
      const comboItems = fixture.nativeElement.querySelectorAll('.combo-item');
      expect(comboItems.length).toBeGreaterThan(0);
    });
  });

  describe("today's challenge section", () => {
    it("should display today's challenge with current floor", () => {
      fixture.componentRef.setInput('currentFloor', 5);
      fixture.detectChanges();
      const challengeSection = fixture.nativeElement.querySelector('.tip-section.challenge');
      expect(challengeSection.textContent).toContain('Floor 5');
    });

    it('frames a low floor as manageable with no extra-damage line', () => {
      fixture.componentRef.setInput('currentFloor', 1);
      fixture.detectChanges();
      expect(component.challenge.threat).toBe('Manageable');
      expect(component.challenge.threatClass).toBe('calm');
      expect(component.challenge.detail).not.toContain('%');
    });

    it('escalates threat framing as the floor deepens', () => {
      fixture.componentRef.setInput('currentFloor', 3);
      fixture.detectChanges();
      expect(component.challenge.threat).toBe('Dangerous');
      expect(component.challenge.detail).toContain('30% harder');

      fixture.componentRef.setInput('currentFloor', 6);
      fixture.detectChanges();
      expect(component.challenge.threat).toBe('Deadly');
      expect(component.challenge.threatClass).toBe('deadly');
    });

    it('holds the tier boundaries (floor 2 = Manageable, floor 4 = Dangerous)', () => {
      // Inclusive thresholds (<=2, <=4) — guards a fencepost regression that the
      // 1/3/6 cases would miss.
      fixture.componentRef.setInput('currentFloor', 2);
      fixture.detectChanges();
      expect(component.challenge.threat).toBe('Manageable');
      expect(component.challenge.floor).toBe(2);

      fixture.componentRef.setInput('currentFloor', 4);
      fixture.detectChanges();
      expect(component.challenge.threat).toBe('Dangerous');
    });
  });

  describe('combo recipe decoration', () => {
    it('renders colour swatches and effect tags per combo', () => {
      fixture.detectChanges();
      const firstCombo = fixture.nativeElement.querySelector('.combo-item');
      expect(firstCombo.querySelectorAll('.combo-drop').length).toBe(2);
      expect(firstCombo.querySelectorAll('.combo-tag').length).toBeGreaterThan(0);
    });

    it('does NOT render the old redundant stats section', () => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.tip-section.stats')).toBeNull();
    });

    // Red-team gate 2026-08-16: the survive/loot/armor fills are solid
    // `color-mix()` chips anchored to a fixed dark/light neutral specifically
    // so they hold AA in both themes (see the "Solid-anchored chips" comment
    // above .combo-tag). survive/armor mix a theme-invariant --game-success /
    // --game-info (set by combo-status-tokens, no day/night branch), so a
    // single render already proves both themes for them. loot mixes
    // --game-gold, which DOES flip with --tavern-gold — night falls through
    // to the mixin's hex fallback, so the second case pins the real day value
    // from _layout.scss's .day-mode block to exercise that branch too.
    const themeCases: Array<{ label: string; tavernGoldDay: boolean }> = [
      { label: 'night (--tavern-gold fallback)', tavernGoldDay: false },
      { label: 'day (--tavern-gold: #845417)', tavernGoldDay: true },
    ];

    for (const { label, tavernGoldDay } of themeCases) {
      it(`holds WCAG AA (>=4.5:1) for survive/loot/armor chip fills in ${label}`, () => {
        if (tavernGoldDay) {
          fixture.nativeElement.style.setProperty('--tavern-gold', '#845417');
        }
        fixture.detectChanges();

        for (const kind of ['survive', 'loot', 'armor'] as const) {
          const chip: HTMLElement | null = fixture.nativeElement.querySelector(`.combo-tag.${kind}`);
          expect(chip).withContext(`no .combo-tag.${kind} rendered — combo config coverage changed`).toBeTruthy();

          const styles = getComputedStyle(chip!);
          const ratio = contrastRatio(styles.color, styles.backgroundColor);
          expect(ratio)
            .withContext(`${kind} in ${label}: ${styles.color} on ${styles.backgroundColor} = ${ratio.toFixed(2)}:1`)
            .toBeGreaterThanOrEqual(4.5);
        }
      });
    }

    // Owner redo 2026-08-17: canonical chip order is enforced at the
    // COMBO_CARDS construction site (survive pushed before armor before
    // loot), not the template — so this pins the *rendered* .combo-tag
    // order directly, which would catch a regression in either place.
    it('renders combo-tag chips in canonical order: survive, dmg (armor), loot always last', () => {
      fixture.detectChanges();
      const comboItems: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.combo-item'));
      expect(comboItems.length).toBeGreaterThan(0);

      const rankOf: Record<string, number> = { survive: 0, armor: 1, loot: 2 };
      let sawThreeTagCombo = false;

      for (const item of comboItems) {
        const kinds = Array.from(item.querySelectorAll<HTMLElement>('.combo-tag')).map((chip) =>
          (['survive', 'loot', 'armor'] as const).find((kind) => chip.classList.contains(kind))
        );
        expect(kinds.every((kind) => kind !== undefined))
          .withContext(`every rendered .combo-tag must carry a known kind class, got: ${kinds.join(',')}`)
          .toBeTrue();

        const ranks = kinds.map((kind) => rankOf[kind as string]);
        const sorted = [...ranks].sort((a, b) => a - b);
        expect(ranks)
          .withContext(`combo tag order ${kinds.join(' -> ')} is not in canonical survive/armor/loot order`)
          .toEqual(sorted);

        if (kinds.includes('loot')) {
          expect(kinds[kinds.length - 1])
            .withContext(`loot must always be rightmost, got order: ${kinds.join(' -> ')}`)
            .toBe('loot');
        }

        if (kinds.length === 3) sawThreeTagCombo = true;
      }

      // Guard the guard: at least one real 3-tag combo (Warlord Elixir /
      // Guardian Angel) must exist in POTION_COMBOS, or the ordering
      // assertions above never actually exercise the survive-armor-loot case.
      expect(sawThreeTagCombo).withContext('no 3-tag combo found — order assertions are untested').toBeTrue();
    });
  });

  describe('customer reviews section', () => {
    const reviews: CustomerReview[] = [
      {
        id: 'r1',
        adventurerId: 'adv-1',
        adventurerName: 'Gareth the Bold',
        rating: 5,
        comment: 'Saved my life!',
        potionPurchased: 'basic-healing',
        survived: true,
        timestamp: 1000,
      },
      {
        id: 'r2',
        adventurerId: 'adv-2',
        adventurerName: 'Mira Stonefist',
        rating: 2,
        comment: 'Potions tasted like mud.',
        potionPurchased: 'strength-potion',
        survived: false,
        timestamp: 2000,
      },
    ];

    it('should hide the reviews section when there are no reviews', () => {
      fixture.componentRef.setInput('customerReviews', []);
      fixture.detectChanges();
      const reviewsSection = fixture.nativeElement.querySelector('.tip-section.reviews');
      expect(reviewsSection).toBeNull();
    });

    it('should show the reviews section when reviews exist', () => {
      fixture.componentRef.setInput('customerReviews', reviews);
      fixture.detectChanges();
      const reviewsSection = fixture.nativeElement.querySelector('.tip-section.reviews');
      expect(reviewsSection).toBeTruthy();
    });

    it('should display at most 3 reviews', () => {
      const base = { adventurerId: 'x', potionPurchased: 'basic-healing', timestamp: 0 };
      const manyReviews: CustomerReview[] = [
        { id: 'a', ...base, adventurerName: 'A', rating: 5, comment: 'Great', survived: true },
        { id: 'b', ...base, adventurerName: 'B', rating: 4, comment: 'Good', survived: true },
        { id: 'c', ...base, adventurerName: 'C', rating: 3, comment: 'Ok', survived: false },
        { id: 'd', ...base, adventurerName: 'D', rating: 1, comment: 'Bad', survived: false },
      ];
      fixture.componentRef.setInput('customerReviews', manyReviews);
      fixture.detectChanges();
      const items = fixture.nativeElement.querySelectorAll('.review-item');
      expect(items.length).toBe(3);
    });

    it('should apply survived class for living adventurers', () => {
      fixture.componentRef.setInput('customerReviews', [reviews[0]]);
      fixture.detectChanges();
      const survived = fixture.nativeElement.querySelector('.review-item.survived');
      expect(survived).toBeTruthy();
    });

    it('should apply died class for fallen adventurers', () => {
      fixture.componentRef.setInput('customerReviews', [reviews[1]]);
      fixture.detectChanges();
      const died = fixture.nativeElement.querySelector('.review-item.died');
      expect(died).toBeTruthy();
    });

    it('should display adventurer name', () => {
      fixture.componentRef.setInput('customerReviews', [reviews[0]]);
      fixture.detectChanges();
      const name = fixture.nativeElement.querySelector('.review-name');
      expect(name.textContent).toContain('Gareth the Bold');
    });

    it('should display review comment in quotes', () => {
      fixture.componentRef.setInput('customerReviews', [reviews[0]]);
      fixture.detectChanges();
      const comment = fixture.nativeElement.querySelector('.review-comment');
      expect(comment.textContent).toContain('Saved my life!');
    });
  });

  describe('clampRating method', () => {
    it('should clamp rating below 0 to 0', () => {
      expect(component.clampRating(-1)).toBe(0);
    });

    it('should clamp rating above 5 to 5', () => {
      expect(component.clampRating(6)).toBe(5);
    });

    it('should floor non-integer ratings', () => {
      expect(component.clampRating(4.9)).toBe(4);
    });

    it('should pass through valid ratings unchanged', () => {
      expect(component.clampRating(3)).toBe(3);
    });
  });
});
