import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PotionShopComponent, SellPotionEvent } from './potion-shop.component';
import { Potion } from '../../models/potion.model';
import { Adventurer, AdventurerClass, AdventurerStatus, PotionEffect } from '../../models/adventurer.model';
import { SHOP } from '../../config/game-config';

// Handles every computed-color format this component can actually produce:
// plain hex (raw custom-property strings, e.g. `--game-info: #9bb5ae`), and
// the two formats Chrome serializes a resolved `color-mix()` USED value as —
// `color(srgb r g b)` for background/color properties, `oklab(L a b)` for
// border-color properties (observed directly via getComputedStyle; not
// documented behavior, just what this engine does). oklab is natively
// linear-light, so it skips the sRGB gamma-decode step the other two need.
function parseToLinearRgb(value: string): [number, number, number] {
  const oklabMatch = value.match(/oklab\(\s*([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/i);
  if (oklabMatch) {
    const L = parseFloat(oklabMatch[1]);
    const a = parseFloat(oklabMatch[2]);
    const b = parseFloat(oklabMatch[3]);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ ** 3;
    const m = m_ ** 3;
    const s = s_ ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  }

  const decode = (channel: number): number =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

  const colorMixMatch = value.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (colorMixMatch) {
    return [
      decode(parseFloat(colorMixMatch[1])),
      decode(parseFloat(colorMixMatch[2])),
      decode(parseFloat(colorMixMatch[3])),
    ];
  }

  const rgbMatch = value.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const [r, g, b] = rgbMatch[1].split(',').map((channel) => parseFloat(channel.trim()) / 255);
    return [decode(r), decode(g), decode(b)];
  }

  const channels = (value.match(/[\da-f]{2}/gi) ?? []).map((channel) => parseInt(channel, 16) / 255);
  return [decode(channels[0]), decode(channels[1]), decode(channels[2])];
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = ([r, g, b]: [number, number, number]): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const first = luminance(parseToLinearRgb(foreground));
  const second = luminance(parseToLinearRgb(background));
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('PotionShopComponent', () => {
  let component: PotionShopComponent;
  let fixture: ComponentFixture<PotionShopComponent>;

  const createMockPotion = (overrides: Partial<Potion> = {}): Potion => ({
    id: 'basic-healing',
    name: 'Basic Healing Potion',
    description: 'A basic healing potion',
    basePrice: 25,
    color: '#ff6b6b',
    particleColor: '#ff6b6b',
    viscosity: 'normal',
    recipe: {
      ingredients: [],
      requiredLevel: 1,
      craftingTime: 10,
      difficulty: 'easy',
    },
    quality: 1,
    isDiluted: false,
    effects: { healing: 30 },
    discovered: true,
    timesCrafted: 0,
    deathsCaused: 0,
    livesSaved: 0,
    customerRating: 5,
    ...overrides,
  });

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
      imports: [PotionShopComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PotionShopComponent);
    component = fixture.componentInstance;
  });

  describe('initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('keeps every semantic ink readable on the dark walnut counter', () => {
      fixture.detectChanges();
      const panel = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.potion-shop-panel');
      if (!panel) throw new Error('Expected the potion counter panel to render');
      const styles = getComputedStyle(panel);

      for (const token of ['--game-success', '--game-warning', '--game-danger', '--game-info']) {
        const color = styles.getPropertyValue(token).trim();
        expect(contrastRatio(color, '#2b1b0f'))
          .withContext(`${token} ${color} on counter #2b1b0f`)
          .toBeGreaterThanOrEqual(4.5);
      }
    });

    it('should have default reputation of 50', () => {
      expect(component.reputation).toBe(50);
    });
  });

  // Design follow-up (2026-08-17): a first pass on the in-flow toast used a
  // coloured border-left accent bar (the generic-notification tell the owner
  // rejected all night). Rebuilt as a parchment-ticket note — solid
  // --counter-paper fill, --counter-ink text, and the severity carried by
  // --toast-ink (a color-mix() of the sitewide --game-* hue toward
  // --counter-ink) on the border-top and icon, not the raw --game-* value —
  // those measure under 2:1 against this light fill; they were tuned for the
  // counter's dark walnut surfaces. Pins the real rendered contrast for all
  // four severities so a future "just nudge the mix ratio" tweak can't
  // regress it invisibly, mirroring the "keeps every semantic ink readable"
  // test above but for the fill and icon, not the raw token.
  describe('counter-toast ticket contrast', () => {
    const severities: Array<{ cls: string; label: string }> = [
      { cls: 'message-info', label: 'info' },
      { cls: 'message-success', label: 'success' },
      { cls: 'message-warning', label: 'warning' },
      { cls: 'message-error', label: 'error' },
    ];

    for (const { cls, label } of severities) {
      it(`holds contrast for the ${label} ticket (text >=4.5:1, icon/border >=3:1)`, () => {
        component.toastMessage = { text: 'Test toast', type: label as 'info' | 'success' | 'warning' | 'error' };
        fixture.detectChanges();

        const toast = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.counter-toast');
        expect(toast).withContext('counter-toast did not render').toBeTruthy();
        expect(toast!.classList.contains(cls)).withContext(`expected .${cls}`).toBeTrue();

        const icon = toast!.querySelector<HTMLElement>('.counter-toast__icon');
        const text = toast!.querySelector<HTMLElement>('.counter-toast__text');
        expect(icon).toBeTruthy();
        expect(text).toBeTruthy();

        const toastStyles = getComputedStyle(toast!);
        const bg = toastStyles.backgroundColor;
        const borderTop = toastStyles.borderTopColor;
        const iconColor = getComputedStyle(icon!).color;
        const textColor = getComputedStyle(text!).color;

        // WCAG 1.4.3 body-text floor for the ticket's own copy.
        expect(contrastRatio(textColor, bg))
          .withContext(`${label} text ${textColor} on ${bg}`)
          .toBeGreaterThanOrEqual(4.5);
        // WCAG 1.4.11 non-text UI component floor for the small status icon
        // and the border-top accent line (decorative, not body copy).
        expect(contrastRatio(iconColor, bg))
          .withContext(`${label} icon ${iconColor} on ${bg}`)
          .toBeGreaterThanOrEqual(3);
        expect(contrastRatio(borderTop, bg))
          .withContext(`${label} border-top ${borderTop} on ${bg}`)
          .toBeGreaterThanOrEqual(3);
      });
    }

    it('never renders a coloured border-left accent (the generic-notification tell)', () => {
      component.toastMessage = { text: 'Test toast', type: 'info' };
      fixture.detectChanges();

      const toast = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.counter-toast');
      expect(toast).toBeTruthy();
      const styles = getComputedStyle(toast!);
      // Same width and colour on every edge but the top — no side accent bar.
      expect(styles.borderLeftWidth).toBe(styles.borderRightWidth);
      expect(styles.borderLeftColor).toBe(styles.borderRightColor);
      expect(styles.borderLeftColor).toBe(styles.borderBottomColor);
    });
  });

  describe('input rendering', () => {
    beforeEach(() => {
      const potions = [
        createMockPotion({ id: 'basic-healing', name: 'Basic Healing Potion' }),
        createMockPotion({ id: 'strength-potion', name: 'Strength Potion' }),
      ];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      inventory.set('strength-potion', 3);

      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();
    });

    it('should display panel title', () => {
      const title = fixture.nativeElement.querySelector('.panel-title');
      expect(title.textContent).toContain('The Potion Counter');
    });

    it('should display potion cards', () => {
      const cards = fixture.nativeElement.querySelectorAll('.potion-card');
      expect(cards.length).toBe(2);
    });

    it('should prompt the player to choose a customer when none is selected', () => {
      const hint = fixture.nativeElement.querySelector('.no-customer-hint');
      expect(hint.textContent).toContain('choosing a customer');
    });

    it('should show serving badge when adventurer is selected', () => {
      const adventurer = createMockAdventurer({ name: 'TestHero', gold: 150 });
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.serving-badge');
      expect(badge.textContent).toContain('TestHero');
      expect(badge.textContent).toContain('150');
    });
  });

  describe('getStock method', () => {
    it('should return 0 for non-existent potion', () => {
      expect(component.getStock('non-existent')).toBe(0);
    });

    it('should return correct stock for existing potion', () => {
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 7);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();

      expect(component.getStock('basic-healing')).toBe(7);
    });
  });

  describe('calculatePrice method', () => {
    const potion = createMockPotion({ basePrice: 100 });

    it('should return base price when no adventurer', () => {
      expect(component.calculatePrice(potion, null)).toBe(100);
    });

    it('should increase price for desperate adventurers', () => {
      const adventurer = createMockAdventurer({ desperate: true });
      fixture.componentRef.setInput('reputation', 0);
      fixture.detectChanges();

      const price = component.calculatePrice(potion, adventurer);
      expect(price).toBe(150); // 100 * 1.5
    });

    it('should decrease price for frugal adventurers', () => {
      const adventurer = createMockAdventurer({ frugal: true });
      fixture.componentRef.setInput('reputation', 0);
      fixture.detectChanges();

      const price = component.calculatePrice(potion, adventurer);
      expect(price).toBe(80); // 100 * 0.8
    });

    it('should increase price based on reputation', () => {
      const adventurer = createMockAdventurer();
      fixture.componentRef.setInput('reputation', 100);
      fixture.detectChanges();

      const price = component.calculatePrice(potion, adventurer);
      expect(price).toBe(150); // 100 * (1 + 100/200) = 100 * 1.5
    });
  });

  describe('isRecommended method', () => {
    it('should return true when potion matches recommended', () => {
      fixture.componentRef.setInput('recommendedPotionId', 'basic-healing');
      fixture.detectChanges();

      const potion = createMockPotion({ id: 'basic-healing' });
      expect(component.isRecommended(potion)).toBe(true);
    });

    it('should return false when potion does not match', () => {
      fixture.componentRef.setInput('recommendedPotionId', 'strength-potion');
      fixture.detectChanges();

      const potion = createMockPotion({ id: 'basic-healing' });
      expect(component.isRecommended(potion)).toBe(false);
    });
  });

  describe('getShortName method', () => {
    it('should strip "Potion" suffix', () => {
      expect(component.getShortName('Healing Potion')).toBe('Healing');
    });

    it('should strip "Basic" prefix', () => {
      expect(component.getShortName('Basic Healing')).toBe('Healing');
    });

    it('should strip "Diluted" prefix', () => {
      expect(component.getShortName('Diluted Healing')).toBe('Healing');
    });

    it('should strip complex prefixes', () => {
      expect(component.getShortName('Diluted Basic Healing Potion')).toBe('Healing');
    });
  });

  describe('getPotionTier method', () => {
    it('should return BASIC when no upgrades', () => {
      fixture.componentRef.setInput('potionUpgrades', {});
      fixture.detectChanges();

      const potion = createMockPotion({ id: 'basic-healing' });
      expect(component.getPotionTier(potion)).toBe('BASIC');
    });

    it('should return ENHANCED for tier 1', () => {
      fixture.componentRef.setInput('potionUpgrades', { healing: 1 });
      fixture.detectChanges();

      const potion = createMockPotion({ id: 'basic-healing' });
      expect(component.getPotionTier(potion)).toBe('ENHANCED');
    });

    it('should return SUPERIOR for tier 2', () => {
      fixture.componentRef.setInput('potionUpgrades', { healing: 2 });
      fixture.detectChanges();

      const potion = createMockPotion({ id: 'basic-healing' });
      expect(component.getPotionTier(potion)).toBe('SUPERIOR');
    });
  });

  describe('card styling', () => {
    it('should apply out-of-stock class when stock is 0', () => {
      const potions = [createMockPotion()];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 0);

      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.potion-card');
      expect(card.classList.contains('out-of-stock')).toBeTrue();
    });

    it('should apply diluted class when potion is diluted', () => {
      const potions = [createMockPotion({ isDiluted: true })];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);

      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.potion-card');
      expect(card.classList.contains('diluted')).toBeTrue();
    });

    it('should apply recommended class when potion is recommended', () => {
      const potions = [createMockPotion()];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      const adventurer = createMockAdventurer();

      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput('recommendedPotionId', 'basic-healing');
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.potion-card');
      expect(card.classList.contains('recommended')).toBeTrue();
    });
  });

  // Card-system redesign (2026-08-17): owner round 3 — the cut-batch stamp,
  // the fused on-hand/price corner chip, the bordered .card-effects box,
  // and the fixed-offset .recommended-badge are all gone. Pins the
  // replacements and guards against the old alarm-UI patterns quietly
  // creeping back in.
  describe('card system redesign', () => {
    it('shows a stock badge with a plain xN count, not the old fused on-hand/price chip', () => {
      const potions = [createMockPotion()];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.stock-badge');
      expect(badge).withContext('stock badge did not render').toBeTruthy();
      expect(badge.textContent.trim()).toBe('×5');

      // The old corner-info chip (caption + count + price fused together)
      // and its price display are gone from the card entirely — price now
      // lives only on the sell button.
      expect(fixture.nativeElement.querySelector('.corner-info')).toBeFalsy();
      expect(fixture.nativeElement.querySelectorAll('.price-value').length).toBe(1);
      expect(fixture.nativeElement.querySelector('.sell-btn .price-value')).toBeTruthy();
    });

    it('applies low-stock styling under 3 units and not at or above it', () => {
      const potions = [createMockPotion()];
      const lowInventory = new Map<string, number>();
      lowInventory.set('basic-healing', 2);
      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', lowInventory);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.stock-badge').classList.contains('low-stock')).toBeTrue();

      const okInventory = new Map<string, number>();
      okInventory.set('basic-healing', 3);
      fixture.componentRef.setInput('inventory', okInventory);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.stock-badge').classList.contains('low-stock')).toBeFalse();
    });

    it('names the accessible stock count for screen readers', () => {
      const potions = [createMockPotion()];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 4);
      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.stock-badge');
      expect(badge.getAttribute('aria-label')).toBe('4 in stock');
    });

    it('holds AA contrast for the stock badge, normal and low-stock, against its own fill', () => {
      const potions = [createMockPotion()];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5); // normal
      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();

      // getComputedStyle().backgroundColor can't see a `background:
      // linear-gradient(...)` fill — checked against its literal darker
      // gradient stop (#201207), the worst-case (lowest-contrast) end.
      const badgeBg = '#201207';
      const normalColor = getComputedStyle(fixture.nativeElement.querySelector('.stock-badge')).color;
      expect(contrastRatio(normalColor, badgeBg)).toBeGreaterThanOrEqual(4.5);

      const lowInventory = new Map<string, number>();
      lowInventory.set('basic-healing', 1);
      fixture.componentRef.setInput('inventory', lowInventory);
      fixture.detectChanges();
      const lowColor = getComputedStyle(fixture.nativeElement.querySelector('.stock-badge')).color;
      expect(contrastRatio(lowColor, badgeBg)).toBeGreaterThanOrEqual(4.5);
    });

    it('marks a diluted potion with exactly one quiet stamp, no alert-red card border', () => {
      const potions = [createMockPotion({ isDiluted: true }), createMockPotion({ id: 'strength-potion' })];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 3);
      inventory.set('strength-potion', 3);
      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();

      const cards = fixture.nativeElement.querySelectorAll('.potion-card');
      const dilutedCard = cards[0] as HTMLElement;
      const plainCard = cards[1] as HTMLElement;
      expect(dilutedCard.classList.contains('diluted')).toBeTrue();

      const stamp = dilutedCard.querySelector('.watered-stamp');
      expect(stamp).withContext('watered stamp did not render on the diluted card').toBeTruthy();
      expect(stamp!.textContent.trim().toUpperCase()).toBe('WATERED');
      // Old ribbon is gone.
      expect(dilutedCard.querySelector('.cut-batch-stamp')).toBeFalsy();

      // A diluted card's own border reads the same as an ordinary card's —
      // no red border-color escalation. Compares the rendered border, not
      // just class absence, so a future re-add of border-color under
      // .diluted is caught even without an explicit selector to grep for.
      const dilutedBorder = getComputedStyle(dilutedCard).borderColor;
      const plainBorder = getComputedStyle(plainCard).borderColor;
      expect(dilutedBorder).toBe(plainBorder);
    });

    it('replaces the bordered card-effects box with plain-ink potion stats', () => {
      const potions = [createMockPotion()];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.card-effects')).toBeFalsy();
      expect(fixture.nativeElement.querySelector('.effect-tag')).toBeFalsy();
      expect(fixture.nativeElement.querySelector('.tier-tag')).toBeFalsy();

      const stats = fixture.nativeElement.querySelector('.potion-stats');
      expect(stats).toBeTruthy();
      expect(stats.querySelector('.potion-stats__value').textContent).toContain('HP');
      expect(stats.querySelector('.potion-stats__note').textContent.trim()).toBe('full strength');
      // No bordered box around the stats zone.
      expect(getComputedStyle(stats).borderTopStyle).toBe('none');
      expect(getComputedStyle(stats).borderBottomStyle).toBe('none');
    });

    it('shares one card-content grid with actions bottom-anchored via flex, not a margin-top hack', () => {
      const potions = [createMockPotion()];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();

      const content = fixture.nativeElement.querySelector('.card-content');
      expect(content).toBeTruthy();
      expect(content.contains(fixture.nativeElement.querySelector('.potion-bottle'))).toBeTrue();
      expect(content.contains(fixture.nativeElement.querySelector('.potion-info'))).toBeTrue();

      const actions = fixture.nativeElement.querySelector('.card-actions');
      expect(content.contains(actions)).toBeFalse();
      expect(getComputedStyle(content).flexGrow).toBe('1');
      expect(getComputedStyle(actions).marginTop).not.toBe('auto');
    });

    it('holds >=3:1 non-text contrast for the loadout forecast accent across steady/risky/dire', () => {
      const potions = [createMockPotion()];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      const adventurer = createMockAdventurer();
      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput(
        'forecasts',
        new Map([
          [
            'basic-healing',
            {
              currentSurvival: 0.5,
              projectedSurvival: 0.5,
              survivalDelta: 0,
              risk: 'dire',
              budgetAfterSale: 10,
              comboName: null,
              comboDescription: null,
              comboSurvivalBonus: 0,
            },
          ],
        ])
      );
      fixture.detectChanges();

      const ticket = fixture.nativeElement.querySelector('.loadout-forecast');
      expect(ticket.classList.contains('dire')).toBeTrue();
      const styles = getComputedStyle(ticket);
      const ratio = contrastRatio(styles.borderTopColor, styles.backgroundColor);
      expect(ratio)
        .withContext(`dire accent ${styles.borderTopColor} on ${styles.backgroundColor} = ${ratio.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(3);
    });

    // Owner redo 2026-08-17: the combo hint used to render a bare
    // "Berserker Brew +15%" with no stat name — the number never said what it
    // was 15% of. It's always comboSurvivalBonus. First attempt appended the
    // combo NAME too ("Berserker Brew +15% survive") but that overflowed the
    // ticket's real card-width budget onto a second, clipped line (caught by
    // rendering it live, not by this spec) — team-lead's own example was the
    // shorter "+15% survive" without the name, so that's what ships. The
    // combo name moves to the title tooltip instead of disappearing outright.
    it('names the stat on the combo hint with a short label that fits one line', () => {
      const potions = [createMockPotion()];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      const adventurer = createMockAdventurer();
      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput(
        'forecasts',
        new Map([
          [
            'basic-healing',
            {
              currentSurvival: 0.4,
              projectedSurvival: 0.8,
              survivalDelta: 0.4,
              risk: 'steady',
              budgetAfterSale: 50,
              comboName: 'Berserker Brew',
              comboDescription: 'Healing + Strength',
              comboSurvivalBonus: 0.15,
            },
          ],
        ])
      );
      fixture.detectChanges();

      const comboHint = fixture.nativeElement.querySelector('.forecast-combo');
      expect(comboHint).toBeTruthy();
      const text = comboHint.textContent.replace(/\s+/g, ' ').trim();
      expect(text).toBe('+15% survive');
      // A bare, unlabelled percentage is exactly the bug being fixed — guard
      // against a regression that keeps the label off ANY stat, not just survive.
      expect(text).not.toMatch(/^\+\d+%$/);
      // The combo name moved off the visible line but must still be reachable
      // on hover, so sighted mouse users don't lose it outright.
      expect(comboHint.title).toContain('Berserker Brew');
      expect(comboHint.title).toContain('Healing + Strength');
    });

    // Owner redo 2026-08-17: .dilute-btn's saturated red border/text drew
    // more eye than .sell-btn, the actual primary action. Desaturated to a
    // quiet warm taupe at rest — this pins that both the text and the
    // (non-text, 1.4.11) border still hold AA against .card-actions' real
    // background, not just that the colour "looks calmer".
    it('holds WCAG AA for the quieted .dilute-btn text and >=3:1 for its border', () => {
      const potions = [createMockPotion()];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      const adventurer = createMockAdventurer();
      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.detectChanges();

      const diluteBtn = fixture.nativeElement.querySelector('.dilute-btn');
      const cardActions = fixture.nativeElement.querySelector('.card-actions');
      expect(diluteBtn).toBeTruthy();

      const btnStyles = getComputedStyle(diluteBtn);
      const actionsStyles = getComputedStyle(cardActions);

      const textRatio = contrastRatio(btnStyles.color, actionsStyles.backgroundColor);
      expect(textRatio)
        .withContext(
          `dilute-btn text ${btnStyles.color} on ${actionsStyles.backgroundColor} = ${textRatio.toFixed(2)}:1`
        )
        .toBeGreaterThanOrEqual(4.5);

      const borderRatio = contrastRatio(btnStyles.borderTopColor, actionsStyles.backgroundColor);
      expect(borderRatio)
        .withContext(
          `dilute-btn border ${btnStyles.borderTopColor} on ${actionsStyles.backgroundColor} = ${borderRatio.toFixed(2)}:1`
        )
        .toBeGreaterThanOrEqual(3);
    });

    // Hierarchy: the primary sell action should read heavier than the
    // secondary dilute action. min-height (34px vs 28px in the component's
    // own desktop rule) isn't a reliable signal to assert on directly — a
    // separate @media (max-width: 767px) touch-target rule in
    // _design-system.scss clamps BOTH to 44px under Karma's default
    // (sub-767px) test viewport, which isn't the real desktop layout this
    // critique is about. Fill weight is the signal that actually holds at
    // every width: sell is a solid, opaque gradient (the filled primary);
    // dilute stays a low-alpha, near-transparent tint (the receding
    // secondary) both before and after the quieter recolour above.
    it('keeps .sell-btn solid/opaque and .dilute-btn low-alpha so the primary action reads primary', () => {
      const potions = [createMockPotion()];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      const adventurer = createMockAdventurer();
      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.detectChanges();

      const parseAlpha = (color: string): number => {
        const match = color.match(/rgba?\(([^)]+)\)/i);
        if (!match) return 1;
        const parts = match[1].split(',').map((p) => p.trim());
        return parts.length === 4 ? parseFloat(parts[3]) : 1;
      };

      const sellBtn = fixture.nativeElement.querySelector('.sell-btn');
      const diluteBtn = fixture.nativeElement.querySelector('.dilute-btn');

      // `background: linear-gradient(...)` sets background-image, not
      // background-color, which stays at its transparent default — a
      // gradient layer (not 'none') is what makes .sell-btn read as an
      // opaque, solid-filled surface.
      const sellBgImage = getComputedStyle(sellBtn).backgroundImage;
      expect(sellBgImage)
        .withContext(`sell-btn background-image was "${sellBgImage}", expected a gradient fill`)
        .toContain('gradient');

      const diluteAlpha = parseAlpha(getComputedStyle(diluteBtn).backgroundColor);
      expect(diluteAlpha)
        .withContext(`dilute-btn background alpha was ${diluteAlpha}, expected a low-alpha tint`)
        .toBeLessThanOrEqual(0.3);
    });
  });

  describe('output events', () => {
    beforeEach(() => {
      const potions = [createMockPotion()];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      const adventurer = createMockAdventurer({ gold: 200 });

      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput('reputation', 0);
      fixture.detectChanges();
    });

    it('should emit sell event when sell button is clicked', () => {
      const spy = spyOn(component.sell, 'emit');
      const sellBtn = fixture.nativeElement.querySelector('.sell-btn');

      sellBtn.click();

      expect(spy).toHaveBeenCalled();
      const emittedEvent = spy.calls.mostRecent().args[0] as SellPotionEvent;
      expect(emittedEvent.potion.id).toBe('basic-healing');
      expect(emittedEvent.adventurer.id).toBe('adv-1');
    });

    it('should open the stillroom without diluting immediately', () => {
      const spy = spyOn(component.dilute, 'emit');
      const openSpy = spyOn(component.dilutionBenchOpenChange, 'emit');
      const diluteBtn = fixture.nativeElement.querySelector('.dilute-btn');

      diluteBtn.click();
      fixture.detectChanges();

      expect(spy).not.toHaveBeenCalled();
      expect(openSpy).toHaveBeenCalledOnceWith(true);
      expect(component.dilutionPotion?.id).toBe('basic-healing');
      expect(fixture.nativeElement.querySelector('.dilution-stillroom')).toBeTruthy();
    });

    it('should emit dilution only after the stillroom confirmation', () => {
      const spy = spyOn(component.dilute, 'emit');
      const openSpy = spyOn(component.dilutionBenchOpenChange, 'emit');
      const diluteBtn = fixture.nativeElement.querySelector('.dilute-btn');

      diluteBtn.click();
      fixture.detectChanges();
      const confirmBtn = fixture.nativeElement.querySelector('.stillroom-confirm');
      confirmBtn.click();

      expect(spy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ id: 'basic-healing' }));
      const emittedPotion = spy.calls.mostRecent().args[0] as Potion;
      expect(emittedPotion.id).toBe('basic-healing');
      expect(openSpy.calls.allArgs()).toEqual([[true], [false]]);
      expect(component.dilutionPotion).toBeNull();
    });
  });

  describe('button disabled states', () => {
    it('should disable sell button when no adventurer selected', () => {
      const potions = [createMockPotion()];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);

      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('selectedAdventurer', null);
      fixture.detectChanges();

      const sellBtn = fixture.nativeElement.querySelector('.sell-btn');
      expect(sellBtn.disabled).toBe(true);
    });

    it('should disable sell button when out of stock', () => {
      const potions = [createMockPotion()];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 0);
      const adventurer = createMockAdventurer();

      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.detectChanges();

      const sellBtn = fixture.nativeElement.querySelector('.sell-btn');
      expect(sellBtn.disabled).toBe(true);
    });

    it('should disable sell button when adventurer cannot afford', () => {
      const potions = [createMockPotion({ basePrice: 500 })];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      const adventurer = createMockAdventurer({ gold: 100 });

      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput('reputation', 0);
      fixture.detectChanges();

      const sellBtn = fixture.nativeElement.querySelector('.sell-btn');
      expect(sellBtn.disabled).toBe(true);
    });

    it('should hide dilute button when there is no bottle to dilute', () => {
      const potions = [createMockPotion()];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 0);

      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();

      const diluteBtn = fixture.nativeElement.querySelector('.dilute-btn');
      expect(diluteBtn).toBeFalsy();
    });

    it('should not show dilute button for diluted potions', () => {
      const potions = [createMockPotion({ isDiluted: true })];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);

      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();

      const diluteBtn = fixture.nativeElement.querySelector('.dilute-btn');
      expect(diluteBtn).toBeFalsy();
    });
  });

  describe('canAfford method', () => {
    it('should return true when no adventurer selected', () => {
      fixture.componentRef.setInput('selectedAdventurer', null);
      fixture.detectChanges();

      const potion = createMockPotion({ basePrice: 9999 });
      expect(component.canAfford(potion)).toBe(true);
    });

    it('should return true when adventurer can afford', () => {
      const adventurer = createMockAdventurer({ gold: 500 });
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput('reputation', 0);
      fixture.detectChanges();

      const potion = createMockPotion({ basePrice: 100 });
      expect(component.canAfford(potion)).toBe(true);
    });

    it('should return false when adventurer cannot afford', () => {
      const adventurer = createMockAdventurer({ gold: 50 });
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput('reputation', 0);
      fixture.detectChanges();

      const potion = createMockPotion({ basePrice: 100 });
      expect(component.canAfford(potion)).toBe(false);
    });
  });

  describe('isSellDisabled method', () => {
    it('should return true when no adventurer', () => {
      fixture.componentRef.setInput('selectedAdventurer', null);
      fixture.detectChanges();

      const potion = createMockPotion();
      expect(component.isSellDisabled(potion)).toBe(true);
    });

    it('should return true when stock is 0', () => {
      const adventurer = createMockAdventurer();
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 0);

      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();

      const potion = createMockPotion();
      expect(component.isSellDisabled(potion)).toBe(true);
    });

    it('should return true when cannot afford', () => {
      const adventurer = createMockAdventurer({ gold: 10 });
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);

      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('reputation', 0);
      fixture.detectChanges();

      const potion = createMockPotion({ basePrice: 100 });
      expect(component.isSellDisabled(potion)).toBe(true);
    });

    it('should return false when all conditions pass', () => {
      const adventurer = createMockAdventurer({ gold: 500 });
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);

      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('reputation', 0);
      fixture.detectChanges();

      const potion = createMockPotion({ basePrice: 25 });
      expect(component.isSellDisabled(potion)).toBe(false);
    });
  });

  describe('isDiluteDisabled method', () => {
    it('should return true when stock is 0', () => {
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 0);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();

      const potion = createMockPotion();
      expect(component.isDiluteDisabled(potion)).toBe(true);
    });

    it('should return false when stock is greater than 0', () => {
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();

      const potion = createMockPotion();
      expect(component.isDiluteDisabled(potion)).toBe(false);
    });
  });

  describe('onSell method', () => {
    it('should not emit when no adventurer selected', () => {
      fixture.componentRef.setInput('selectedAdventurer', null);
      fixture.detectChanges();

      const spy = spyOn(component.sell, 'emit');
      const potion = createMockPotion();
      component.onSell(potion);

      expect(spy).not.toHaveBeenCalled();
    });

    it('should emit when adventurer is selected', () => {
      const adventurer = createMockAdventurer();
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.detectChanges();

      const spy = spyOn(component.sell, 'emit');
      const potion = createMockPotion();
      component.onSell(potion);

      expect(spy).toHaveBeenCalledWith({ potion, adventurer, priceMode: 'fair' });
    });
  });

  describe('price quote selection', () => {
    it('emits the selected quote mode for the parent game policy', () => {
      const spy = spyOn(component.priceModeChange, 'emit');

      component.selectPriceMode('gouge');

      expect(spy).toHaveBeenCalledOnceWith('gouge');
    });
  });

  describe('getPotionUpgradeKey (via getPotionTier)', () => {
    it('should handle diluted potion IDs', () => {
      fixture.componentRef.setInput('potionUpgrades', { healing: 1 });
      fixture.detectChanges();

      const potion = createMockPotion({ id: 'diluted-basic-healing' });
      expect(component.getPotionTier(potion)).toBe('ENHANCED');
    });

    it('should handle strength potion', () => {
      fixture.componentRef.setInput('potionUpgrades', { strength: 2 });
      fixture.detectChanges();

      const potion = createMockPotion({ id: 'strength-potion' });
      expect(component.getPotionTier(potion)).toBe('SUPERIOR');
    });

    it('should handle defense potion', () => {
      fixture.componentRef.setInput('potionUpgrades', { defense: 1 });
      fixture.detectChanges();

      const potion = createMockPotion({ id: 'defense-potion' });
      expect(component.getPotionTier(potion)).toBe('ENHANCED');
    });

    it('should return BASIC for unknown potion IDs', () => {
      fixture.componentRef.setInput('potionUpgrades', { healing: 2 });
      fixture.detectChanges();

      const potion = createMockPotion({ id: 'unknown-potion' });
      expect(component.getPotionTier(potion)).toBe('BASIC');
    });
  });

  describe('tooltip state', () => {
    it('should set tooltipPotion when showPotionTooltip is called', () => {
      const potion = createMockPotion();
      component.showPotionTooltip(potion);
      expect(component.tooltipPotion).toBe(potion);
    });

    it('should toggle off tooltipPotion when same potion is shown again', () => {
      const potion = createMockPotion();
      component.showPotionTooltip(potion);
      component.showPotionTooltip(potion);
      expect(component.tooltipPotion).toBeNull();
    });

    it('should switch to new potion when a different potion is shown', () => {
      const potion1 = createMockPotion({ id: 'basic-healing' });
      const potion2 = createMockPotion({ id: 'strength-potion' });
      component.showPotionTooltip(potion1);
      component.showPotionTooltip(potion2);
      expect(component.tooltipPotion).toBe(potion2);
    });

    it('should clear tooltipPotion on dismissTooltip', () => {
      const potion = createMockPotion();
      component.showPotionTooltip(potion);
      component.dismissTooltip();
      expect(component.tooltipPotion).toBeNull();
    });

    it('should show tooltip element in template when tooltipPotion is set', () => {
      const potions = [createMockPotion()];
      fixture.componentRef.setInput('potions', potions);
      fixture.detectChanges();

      component.showPotionTooltip(potions[0]);
      fixture.detectChanges();

      const tooltip = fixture.nativeElement.querySelector('.potion-tooltip');
      expect(tooltip).toBeTruthy();
    });

    it('should not show tooltip element when tooltipPotion is null', () => {
      component.tooltipPotion = null;
      fixture.detectChanges();

      const tooltip = fixture.nativeElement.querySelector('.potion-tooltip');
      expect(tooltip).toBeFalsy();
    });
  });

  describe('getShortName edge cases', () => {
    it('should handle "Strong" prefix', () => {
      expect(component.getShortName('Strong Healing Potion')).toBe('Healing');
    });

    it('should handle "Enhanced" prefix', () => {
      expect(component.getShortName('Enhanced Strength Potion')).toBe('Strength');
    });

    it('should handle "Greater" prefix', () => {
      expect(component.getShortName('Greater Defense Potion')).toBe('Defense');
    });

    it('should handle "Potion of" format', () => {
      expect(component.getShortName('Potion of Healing')).toBe('Healing');
    });
  });

  describe('Price Modifier Display', () => {
    const potion = createMockPotion({ basePrice: 100 });

    describe('getBasePrice method', () => {
      it('should return base price with reputation modifier only', () => {
        fixture.componentRef.setInput('reputation', 100);
        fixture.detectChanges();

        // 100 * (1 + 100/200) = 100 * 1.5 = 150
        expect(component.getBasePrice(potion)).toBe(150);
      });

      it('should return base price when reputation is 0', () => {
        fixture.componentRef.setInput('reputation', 0);
        fixture.detectChanges();

        expect(component.getBasePrice(potion)).toBe(100);
      });
    });

    describe('isPriceModified method', () => {
      it('should return false when no adventurer', () => {
        expect(component.isPriceModified(potion, null)).toBe(false);
      });

      it('should return false when adventurer has no price-affecting traits', () => {
        const adventurer = createMockAdventurer({ desperate: false, frugal: false });
        expect(component.isPriceModified(potion, adventurer)).toBe(false);
      });

      it('should return true when adventurer is desperate', () => {
        const adventurer = createMockAdventurer({ desperate: true });
        expect(component.isPriceModified(potion, adventurer)).toBe(true);
      });

      it('should return true when adventurer is frugal', () => {
        const adventurer = createMockAdventurer({ frugal: true });
        expect(component.isPriceModified(potion, adventurer)).toBe(true);
      });

      it('should return true when adventurer has both traits', () => {
        const adventurer = createMockAdventurer({ desperate: true, frugal: true });
        expect(component.isPriceModified(potion, adventurer)).toBe(true);
      });
    });

    describe('getPriceModifierClass method', () => {
      it('should return empty string when no adventurer', () => {
        expect(component.getPriceModifierClass(null)).toBe('');
      });

      it('should return empty string when no price-affecting traits', () => {
        const adventurer = createMockAdventurer({ desperate: false, frugal: false });
        expect(component.getPriceModifierClass(adventurer)).toBe('');
      });

      it('should return price-increased for desperate adventurer', () => {
        const adventurer = createMockAdventurer({ desperate: true });
        expect(component.getPriceModifierClass(adventurer)).toBe('price-increased');
      });

      it('should return price-decreased for frugal adventurer', () => {
        const adventurer = createMockAdventurer({ frugal: true });
        expect(component.getPriceModifierClass(adventurer)).toBe('price-decreased');
      });

      it('should return price-increased when both desperate and frugal (net positive)', () => {
        const adventurer = createMockAdventurer({ desperate: true, frugal: true });
        expect(component.getPriceModifierClass(adventurer)).toBe('price-increased');
      });
    });

    describe('getPriceTooltip method', () => {
      beforeEach(() => {
        fixture.componentRef.setInput('reputation', 0);
        fixture.detectChanges();
      });

      it('should return empty string when no adventurer', () => {
        expect(component.getPriceTooltip(potion, null)).toBe('');
      });

      it('should return empty string when no price-affecting traits', () => {
        const adventurer = createMockAdventurer({ desperate: false, frugal: false });
        expect(component.getPriceTooltip(potion, adventurer)).toBe('');
      });

      it('should explain desperate markup', () => {
        const adventurer = createMockAdventurer({ desperate: true });
        const tooltip = component.getPriceTooltip(potion, adventurer);
        expect(tooltip).toContain('Desperate');
        expect(tooltip).toContain('50% more');
        expect(tooltip).toContain('100g');
        expect(tooltip).toContain('150g');
      });

      it('should explain frugal discount', () => {
        const adventurer = createMockAdventurer({ frugal: true });
        const tooltip = component.getPriceTooltip(potion, adventurer);
        expect(tooltip).toContain('Frugal');
        expect(tooltip).toContain('20% off');
        expect(tooltip).toContain('100g');
        expect(tooltip).toContain('80g');
      });

      it('should explain both traits when combined', () => {
        const adventurer = createMockAdventurer({ desperate: true, frugal: true });
        const tooltip = component.getPriceTooltip(potion, adventurer);
        expect(tooltip).toContain('Desperate');
        expect(tooltip).toContain('Frugal');
        expect(tooltip).toContain('+20%');
      });
    });

    describe('template integration', () => {
      beforeEach(() => {
        const potions = [createMockPotion({ basePrice: 100 })];
        const inventory = new Map<string, number>();
        inventory.set('basic-healing', 5);

        fixture.componentRef.setInput('potions', potions);
        fixture.componentRef.setInput('inventory', inventory);
        fixture.componentRef.setInput('reputation', 0);
      });

      it('should apply price-increased class for desperate adventurer', () => {
        const adventurer = createMockAdventurer({ desperate: true });
        fixture.componentRef.setInput('selectedAdventurer', adventurer);
        fixture.detectChanges();

        const priceEl = fixture.nativeElement.querySelector('.price-value');
        expect(priceEl.classList.contains('price-increased')).toBeTrue();
      });

      it('should apply price-decreased class for frugal adventurer', () => {
        const adventurer = createMockAdventurer({ frugal: true });
        fixture.componentRef.setInput('selectedAdventurer', adventurer);
        fixture.detectChanges();

        const priceEl = fixture.nativeElement.querySelector('.price-value');
        expect(priceEl.classList.contains('price-decreased')).toBeTrue();
      });

      it('should have tooltip on modified price', () => {
        const adventurer = createMockAdventurer({ desperate: true });
        fixture.componentRef.setInput('selectedAdventurer', adventurer);
        fixture.detectChanges();

        const priceEl = fixture.nativeElement.querySelector('.price-value');
        expect(priceEl.getAttribute('title')).toContain('Desperate');
      });

      it('should not have modifier class when no traits', () => {
        const adventurer = createMockAdventurer({ desperate: false, frugal: false });
        fixture.componentRef.setInput('selectedAdventurer', adventurer);
        fixture.detectChanges();

        const priceEl = fixture.nativeElement.querySelector('.price-value');
        expect(priceEl.classList.contains('price-increased')).toBeFalse();
        expect(priceEl.classList.contains('price-decreased')).toBeFalse();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // A11Y: card role and sell aria-label (A11Y-8)
  // ---------------------------------------------------------------------------
  describe('a11y card attributes', () => {
    beforeEach(() => {
      const potions = [createMockPotion()];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();
    });

    it('should have role="group" on potion card', () => {
      const card = fixture.nativeElement.querySelector('.potion-card');
      expect(card.getAttribute('role')).toBe('group');
    });

    it('should NOT have tabindex on potion card', () => {
      const card = fixture.nativeElement.querySelector('.potion-card');
      expect(card.getAttribute('tabindex')).toBeNull();
    });

    it('should include HP effect in sell button aria-label', () => {
      const adventurer = createMockAdventurer({ gold: 500 });
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput('reputation', 0);
      fixture.detectChanges();

      const sellBtn = fixture.nativeElement.querySelector('.sell-btn');
      const label = sellBtn.getAttribute('aria-label') as string;
      expect(label).toContain('heals 30 HP');
      expect(label).toContain('gold');
    });
  });

  // ---------------------------------------------------------------------------
  // Dilute button label (C3/UX-6)
  // ---------------------------------------------------------------------------
  describe('dilute button label', () => {
    beforeEach(() => {
      const potions = [createMockPotion()];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();
    });

    it('should render an explicit dilution action inside the dilute button', () => {
      const label = fixture.nativeElement.querySelector('.dilute-btn .dilute-label');
      expect(label).toBeTruthy();
      expect(label.textContent.trim()).toBe('Dilute bottle');
    });

    it('should not rely on a decorative symbol to explain the dilution action', () => {
      const symbol = fixture.nativeElement.querySelector('.dilute-btn .dilute-symbol');
      expect(symbol).toBeFalsy();
    });

    it('should give an out-of-stock potion one readable restock action', () => {
      const inventory = new Map<string, number>([['basic-healing', 0]]);
      const emergencyPrices = new Map<string, number>([['basic-healing', 25]]);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('emergencyPrices', emergencyPrices);
      fixture.componentRef.setInput('gold', 100);
      fixture.detectChanges();

      const secondaryActions = fixture.nativeElement.querySelectorAll('.card-actions__secondary button');
      const label = fixture.nativeElement.querySelector('.restock-btn .restock-label');
      const cost = fixture.nativeElement.querySelector('.restock-btn .restock-cost');

      expect(secondaryActions.length).toBe(1);
      expect(label.textContent.trim()).toBe('Restock +2');
      expect(cost.textContent.trim()).toBe('25');
    });
  });

  describe('stillroom dilution ritual', () => {
    const potion = createMockPotion();

    beforeEach(() => {
      fixture.componentRef.setInput('potions', [potion]);
      fixture.componentRef.setInput('inventory', new Map([['basic-healing', 2]]));
      fixture.detectChanges();
    });

    it('shows the exact stock, potency, resale, and guilt consequences before confirmation', () => {
      component.openDilutionBench(potion);
      fixture.detectChanges();

      const stillroom = fixture.nativeElement.querySelector('.dilution-stillroom') as HTMLElement;
      expect(stillroom.getAttribute('role')).toBe('dialog');
      expect(stillroom.getAttribute('aria-modal')).toBe('true');
      expect(stillroom.getAttribute('aria-labelledby')).toBe('stillroom-title');
      expect(stillroom.getAttribute('aria-describedby')).toBe('stillroom-warning');
      expect(stillroom.textContent).toContain('2 → 1 honest bottles');
      expect(stillroom.textContent).toContain('7 HP each');
      expect(stillroom.textContent).toContain('80% total');
      expect(stillroom.textContent).toContain('+5 guilt');
      expect(stillroom.textContent).toContain('severe survival penalty');
    });

    it('moves focus to the aligned close control when opened', async () => {
      component.openDilutionBench(potion);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.stillroom-close'));
    });

    it('cancels without emitting or changing the selected bottle', () => {
      const spy = spyOn(component.dilute, 'emit');
      const openSpy = spyOn(component.dilutionBenchOpenChange, 'emit');
      component.openDilutionBench(potion);

      component.cancelDilutionBench();

      expect(spy).not.toHaveBeenCalled();
      expect(openSpy.calls.allArgs()).toEqual([[true], [false]]);
      expect(component.dilutionPotion).toBeNull();
    });

    it('refuses to open for an already diluted potion', () => {
      component.openDilutionBench(createMockPotion({ id: 'diluted-basic-healing', isDiluted: true }));

      expect(component.dilutionPotion).toBeNull();
    });

    it('closes safely if stock disappears before confirmation', () => {
      const spy = spyOn(component.dilute, 'emit');
      component.openDilutionBench(potion);
      fixture.componentRef.setInput('inventory', new Map([['basic-healing', 0]]));
      fixture.detectChanges();

      component.confirmDilution();

      expect(spy).not.toHaveBeenCalled();
      expect(component.dilutionPotion).toBeNull();
    });
  });

  describe('repeat dilution confirmation', () => {
    const potion = createMockPotion({ effects: { strengthBoost: 28 } });

    beforeEach(() => {
      fixture.componentRef.setInput('potions', [potion]);
      fixture.componentRef.setInput('inventory', new Map([['basic-healing', 2]]));
      fixture.componentRef.setInput('hasSeenDilutionRitual', true);
      fixture.detectChanges();
    });

    it('arms a card-local confirmation instead of reopening the Stillroom', () => {
      const diluteSpy = spyOn(component.dilute, 'emit');
      const benchSpy = spyOn(component.dilutionBenchOpenChange, 'emit');

      component.onDilute(potion);
      fixture.detectChanges();

      const confirmation = fixture.nativeElement.querySelector('.inline-dilution-confirm') as HTMLElement;
      const commit = confirmation.querySelector('.inline-dilution-confirm__commit') as HTMLButtonElement;
      const conversion = confirmation.querySelector('.inline-dilution-confirm__yield') as HTMLElement;
      expect(confirmation).toBeTruthy();
      expect(confirmation.textContent).toContain('Water');
      expect(conversion.textContent?.replace(/\s/g, '')).toBe('1→2');
      expect(commit.getAttribute('aria-label')).toContain('two watered bottles');
      expect(commit.getAttribute('aria-label')).toContain('7 STR each');
      expect(commit.getAttribute('aria-label')).toContain('adds 5 guilt');
      expect(component.inlineDilutionPotionId).toBe(potion.id);
      expect(component.dilutionPotion).toBeNull();
      expect(diluteSpy).not.toHaveBeenCalled();
      expect(benchSpy).not.toHaveBeenCalled();
    });

    it('dilutes only on the second, explicit confirmation click', () => {
      const diluteSpy = spyOn(component.dilute, 'emit');
      component.onDilute(potion);
      fixture.detectChanges();

      const confirmButton = fixture.nativeElement.querySelector(
        '.inline-dilution-confirm__commit'
      ) as HTMLButtonElement;
      confirmButton.click();

      expect(diluteSpy).toHaveBeenCalledOnceWith(potion);
      expect(component.inlineDilutionPotionId).toBeNull();
    });

    it('cancels the armed action when the player clicks elsewhere', () => {
      component.onDilute(potion);
      fixture.detectChanges();

      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      fixture.detectChanges();

      expect(component.inlineDilutionPotionId).toBeNull();
      expect(fixture.nativeElement.querySelector('.inline-dilution-confirm')).toBeFalsy();
    });

    it('cancels the armed action when requested by the parent Escape handler', () => {
      component.onDilute(potion);

      expect(component.cancelInlineDilutionConfirmation()).toBe(true);
      expect(component.cancelInlineDilutionConfirmation()).toBe(false);
      expect(component.inlineDilutionPotionId).toBeNull();
    });

    it('closes safely if stock disappears before the second click', () => {
      const diluteSpy = spyOn(component.dilute, 'emit');
      component.onDilute(potion);
      fixture.componentRef.setInput('inventory', new Map([['basic-healing', 0]]));
      fixture.detectChanges();

      component.confirmInlineDilution(potion);

      expect(diluteSpy).not.toHaveBeenCalled();
      expect(component.inlineDilutionPotionId).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Panel status message (C1/UX-10)
  // ---------------------------------------------------------------------------
  describe('getPanelStatusMessage', () => {
    it('should return selection prompt when no adventurer', () => {
      fixture.componentRef.setInput('selectedAdventurer', null);
      fixture.detectChanges();
      expect(component.getPanelStatusMessage()).toBe('Select a customer to sell a potion.');
    });

    it('should return max-potions message when adventurer has 2 potions consumed', () => {
      const consumed: PotionEffect[] = [
        { potionId: 'basic-healing', name: 'Healing', quality: 1, duration: 1, statModifiers: { hp: 30 } },
        { potionId: 'strength-potion', name: 'Strength', quality: 1, duration: 1, statModifiers: { strength: 5 } },
      ];
      const adventurer = createMockAdventurer({ name: 'Tara', potionsConsumed: consumed });
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.detectChanges();

      const msg = component.getPanelStatusMessage();
      expect(msg).toContain('Tara');
      expect(msg).toContain('2 potions');
    });

    it('should return cant-afford message when all in-stock potions are too expensive', () => {
      const potions = [createMockPotion({ basePrice: 9999 })];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      const adventurer = createMockAdventurer({ gold: 10 });

      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput('reputation', 0);
      fixture.detectChanges();

      const msg = component.getPanelStatusMessage();
      expect(msg).toContain("can't afford");
      expect(msg).toContain('10g');
    });

    it('should return out-of-stock message when all potions have 0 stock', () => {
      const potions = [createMockPotion({ basePrice: 25 })];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 0);
      const adventurer = createMockAdventurer({ gold: 500 });

      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput('reputation', 0);
      fixture.detectChanges();

      const msg = component.getPanelStatusMessage();
      expect(msg).toContain('out of stock');
    });

    it('should return null when adventurer can afford at least one potion', () => {
      const potions = [createMockPotion({ basePrice: 25 })];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      const adventurer = createMockAdventurer({ gold: 500 });

      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput('reputation', 0);
      fixture.detectChanges();

      expect(component.getPanelStatusMessage()).toBeNull();
    });

    it('should render the panel-status-message element when message exists', () => {
      fixture.componentRef.setInput('selectedAdventurer', null);
      fixture.detectChanges();

      const el = fixture.nativeElement.querySelector('.panel-status-message');
      expect(el).toBeTruthy();
      expect(el.textContent.trim()).toContain('Select a customer');
    });

    it('should NOT render the panel-status-message when null', () => {
      const potions = [createMockPotion({ basePrice: 25 })];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      const adventurer = createMockAdventurer({ gold: 500 });

      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput('reputation', 0);
      fixture.detectChanges();

      const el = fixture.nativeElement.querySelector('.panel-status-message');
      expect(el).toBeFalsy();
    });
  });

  // ---------------------------------------------------------------------------
  // isSellDisabled: potionsConsumed >= 2 guard
  // ---------------------------------------------------------------------------
  describe('isSellDisabled with potionsConsumed limit', () => {
    it('should disable sell when adventurer has 2 potions consumed', () => {
      const consumed: PotionEffect[] = [
        { potionId: 'basic-healing', name: 'Healing', quality: 1, duration: 1, statModifiers: {} },
        { potionId: 'strength-potion', name: 'Strength', quality: 1, duration: 1, statModifiers: {} },
      ];
      const adventurer = createMockAdventurer({ potionsConsumed: consumed });
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);

      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();

      expect(component.isSellDisabled(createMockPotion())).toBe(true);
    });

    it('should include "2 potions" in getSellDisabledReason when limit reached', () => {
      const consumed: PotionEffect[] = [
        { potionId: 'basic-healing', name: 'Healing', quality: 1, duration: 1, statModifiers: {} },
        { potionId: 'strength-potion', name: 'Strength', quality: 1, duration: 1, statModifiers: {} },
      ];
      const adventurer = createMockAdventurer({ name: 'Kira', potionsConsumed: consumed });
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.detectChanges();

      const reason = component.getSellDisabledReason(createMockPotion());
      expect(reason).toContain('2 potions');
      expect(reason).toContain('Kira');
    });
  });

  // ---------------------------------------------------------------------------
  // Recommended badge reason (UX-8)
  // ---------------------------------------------------------------------------
  describe('getRecommendedReason', () => {
    it('should return "Low HP" when adventurer HP is below 50%', () => {
      const adventurer = createMockAdventurer({ currentHp: 30, maxHp: 100 });
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.detectChanges();

      const healingPotion = createMockPotion({ effects: { healing: 30 } });
      expect(component.getRecommendedReason(healingPotion)).toBe('Low HP');
    });

    it('should return "Class fit" for Warrior + strength potion', () => {
      const adventurer = createMockAdventurer({
        class: AdventurerClass.Warrior,
        currentHp: 100,
        maxHp: 100,
      });
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.detectChanges();

      const strengthPotion = createMockPotion({ effects: { strengthBoost: 5 } });
      expect(component.getRecommendedReason(strengthPotion)).toBe('Class fit');
    });

    it('should return "Class fit" for Barbarian + strength potion', () => {
      const adventurer = createMockAdventurer({
        class: AdventurerClass.Barbarian,
        currentHp: 100,
        maxHp: 100,
      });
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.detectChanges();

      const strengthPotion = createMockPotion({ effects: { strengthBoost: 5 } });
      expect(component.getRecommendedReason(strengthPotion)).toBe('Class fit');
    });

    it('should return "Class fit" for Cleric + defense potion', () => {
      const adventurer = createMockAdventurer({
        class: AdventurerClass.Cleric,
        currentHp: 100,
        maxHp: 100,
      });
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.detectChanges();

      const defensePotion = createMockPotion({ effects: { defenseBoost: 3 } });
      expect(component.getRecommendedReason(defensePotion)).toBe('Class fit');
    });

    it('should return "Good choice" as fallback', () => {
      const adventurer = createMockAdventurer({ currentHp: 100, maxHp: 100 });
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.detectChanges();

      const potion = createMockPotion({ effects: {} });
      expect(component.getRecommendedReason(potion)).toBe('Good choice');
    });

    it('should return "Survival" for a healing potion on a dangerous floor', () => {
      const adventurer = createMockAdventurer({ class: AdventurerClass.Warrior, currentHp: 100, maxHp: 100 });
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput('currentFloor', SHOP.RECOMMEND_DANGER_FLOOR);
      fixture.detectChanges();

      const healingPotion = createMockPotion({ effects: { healing: 50 } });
      expect(component.getRecommendedReason(healingPotion)).toBe('Survival');
    });

    it('should call out a combo recommendation on an early floor', () => {
      const adventurer = createMockAdventurer({ currentHp: 100, maxHp: 100 });
      const healingPotion = createMockPotion({ id: 'basic-healing', effects: { healing: 50 } });
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput(
        'forecasts',
        new Map([
          [
            healingPotion.id,
            {
              currentSurvival: 0.4,
              projectedSurvival: 0.8,
              survivalDelta: 0.4,
              risk: 'steady' as const,
              comboName: 'Berserker Brew',
              comboDescription: 'Healing + Strength',
              comboSurvivalBonus: 0.15,
              budgetAfterSale: 50,
            },
          ],
        ])
      );
      fixture.detectChanges();

      expect(component.getRecommendedReason(healingPotion)).toBe('Completes combo');
    });

    it('should return "Best available" for a non-healing recommended potion on a dangerous floor', () => {
      // Red-team F1: on a danger floor with healing out of stock, the fallback is the
      // best survival option still in stock, not a class-flavor pick — label it honestly
      // (was wrongly showing "Class fit", contradicting the orchestrator's survival intent).
      const adventurer = createMockAdventurer({ class: AdventurerClass.Warrior, currentHp: 100, maxHp: 100 });
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput('currentFloor', SHOP.RECOMMEND_DANGER_FLOOR);
      fixture.detectChanges();

      const strengthPotion = createMockPotion({ effects: { strengthBoost: 5 } });
      expect(component.getRecommendedReason(strengthPotion)).toBe('Best available');
    });

    it('should render recommended badge with reason text in template', () => {
      const potions = [createMockPotion({ id: 'basic-healing', effects: { healing: 30 } })];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      const adventurer = createMockAdventurer({ currentHp: 30, maxHp: 100 });

      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput('recommendedPotionId', 'basic-healing');
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.recommended-badge');
      expect(badge).toBeTruthy();
      const reason = badge.querySelector('.recommended-reason') as HTMLElement;
      expect(reason.textContent.trim()).toBe('Low HP');
    });

    it('should NOT render recommended badge when potion is not recommended', () => {
      const potions = [createMockPotion({ id: 'basic-healing' })];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      const adventurer = createMockAdventurer();

      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('selectedAdventurer', adventurer);
      fixture.componentRef.setInput('recommendedPotionId', 'strength-potion'); // different
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.recommended-badge');
      expect(badge).toBeFalsy();
    });
  });

  // ---------------------------------------------------------------------------
  // COPY-8: diluted tooltip uses colon not em-dash
  // ---------------------------------------------------------------------------
  describe('diluted tooltip copy', () => {
    it('should explain the diluted penalty with a colon and no em-dash', () => {
      const potions = [createMockPotion({ isDiluted: true })];
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      fixture.componentRef.setInput('potions', potions);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();

      component.showPotionTooltip(potions[0]);
      fixture.detectChanges();

      const warning = fixture.nativeElement.querySelector('.tooltip-warning');
      expect(warning).toBeTruthy();
      expect(warning.textContent).toContain('Diluted: quarter-strength effects');
      expect(warning.textContent).not.toContain('—');
    });
  });

  // ---------------------------------------------------------------------------
  // getDiluteDisabledReason: uses colon not em-dash (COPY-8 adjacent)
  // ---------------------------------------------------------------------------
  describe('getDiluteDisabledReason', () => {
    it('should use colon separator when out of stock', () => {
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 0);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.detectChanges();

      const reason = component.getDiluteDisabledReason(createMockPotion());
      expect(reason).toContain('Out of stock:');
      expect(reason).not.toContain('—');
    });
  });
});
