import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MerchantInventoryComponent } from './merchant-inventory.component';

describe('MerchantInventoryComponent', () => {
  let component: MerchantInventoryComponent;
  let fixture: ComponentFixture<MerchantInventoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MerchantInventoryComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MerchantInventoryComponent);
    component = fixture.componentInstance;
  });

  describe('initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should have default inventory as empty Map', () => {
      expect(component.inventory.size).toBe(0);
    });

    it('should have default potionUpgrades as empty object', () => {
      expect(Object.keys(component.potionUpgrades).length).toBe(0);
    });

    it('should have default gold of 0', () => {
      expect(component.gold).toBe(0);
    });

    it('should have default reputation of 50', () => {
      expect(component.reputation).toBe(50);
    });

    it('should have default dailyOverhead of 25', () => {
      expect(component.dailyOverhead).toBe(25);
    });
  });

  describe('stock cards rendering', () => {
    beforeEach(() => {
      const inventory = new Map<string, number>();
      inventory.set('basic-healing', 5);
      inventory.set('strength-potion', 3);
      inventory.set('defense-potion', 2);
      fixture.componentRef.setInput('inventory', inventory);
      fixture.componentRef.setInput('potionUpgrades', { healing: 1, strength: 0, defense: 2 });
      fixture.componentRef.setInput('gold', 150);
      fixture.componentRef.setInput('reputation', 75);
      fixture.componentRef.setInput('dailyOverhead', 30);
      fixture.detectChanges();
    });

    it('should display panel title', () => {
      const title = fixture.nativeElement.querySelector('.panel-title');
      expect(title.textContent).toContain('Your Stock');
    });

    it('should render five stock cards', () => {
      const cards = fixture.nativeElement.querySelectorAll('.stock-card');
      expect(cards.length).toBe(5);
    });

    it('should render potion bottles in each card', () => {
      const bottles = fixture.nativeElement.querySelectorAll('app-potion-bottle');
      expect(bottles.length).toBe(5);
    });

    it('should display correct potion names', () => {
      const names = fixture.nativeElement.querySelectorAll('.card-name');
      expect(names[0].textContent).toContain('Healing');
      expect(names[1].textContent).toContain('Strength');
      expect(names[2].textContent).toContain('Protection');
    });

    it('should display inventory counts', () => {
      const counts = fixture.nativeElement.querySelectorAll('.card-count');
      expect(counts[0].textContent).toContain('5');
      expect(counts[1].textContent).toContain('3');
      expect(counts[2].textContent).toContain('2');
    });

    it('should display tier badges', () => {
      const tiers = fixture.nativeElement.querySelectorAll('.card-tier');
      expect(tiers[0].textContent).toContain('ENHANCED'); // healing: 1
      expect(tiers[1].textContent).toContain('BASIC'); // strength: 0
      expect(tiers[2].textContent).toContain('SUPERIOR'); // defense: 2
    });

    it('should display gold amount', () => {
      const goldValue = fixture.nativeElement.querySelector('.gold-value');
      expect(goldValue.textContent).toContain('150');
    });

    it('should display reputation', () => {
      const statusRows = fixture.nativeElement.querySelectorAll('.status-row');
      expect(statusRows[1].textContent).toContain('75');
    });

    it('should display daily overhead', () => {
      const hintRow = fixture.nativeElement.querySelector('.status-row.hint');
      expect(hintRow.textContent).toContain('30');
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

  describe('getTierName method', () => {
    it('should return BASIC when no upgrades', () => {
      expect(component.getTierName('healing')).toBe('BASIC');
    });

    it('should return BASIC when upgrade is 0', () => {
      fixture.componentRef.setInput('potionUpgrades', { healing: 0 });
      fixture.detectChanges();

      expect(component.getTierName('healing')).toBe('BASIC');
    });

    it('should return ENHANCED when upgrade is 1', () => {
      fixture.componentRef.setInput('potionUpgrades', { healing: 1 });
      fixture.detectChanges();

      expect(component.getTierName('healing')).toBe('ENHANCED');
    });

    it('should return SUPERIOR when upgrade is 2', () => {
      fixture.componentRef.setInput('potionUpgrades', { healing: 2 });
      fixture.detectChanges();

      expect(component.getTierName('healing')).toBe('SUPERIOR');
    });
  });

  describe('getReputationClass method', () => {
    it('should return reputation-bad when reputation < 30', () => {
      fixture.componentRef.setInput('reputation', 20);
      fixture.detectChanges();

      expect(component.getReputationClass()).toBe('reputation-bad');
    });

    it('should return reputation-neutral when reputation >= 30 and < 70', () => {
      fixture.componentRef.setInput('reputation', 50);
      fixture.detectChanges();

      expect(component.getReputationClass()).toBe('reputation-neutral');
    });

    it('should return reputation-good when reputation >= 70', () => {
      fixture.componentRef.setInput('reputation', 80);
      fixture.detectChanges();

      expect(component.getReputationClass()).toBe('reputation-good');
    });

    it('should return reputation-neutral at boundary (30)', () => {
      fixture.componentRef.setInput('reputation', 30);
      fixture.detectChanges();

      expect(component.getReputationClass()).toBe('reputation-neutral');
    });

    it('should return reputation-good at boundary (70)', () => {
      fixture.componentRef.setInput('reputation', 70);
      fixture.detectChanges();

      expect(component.getReputationClass()).toBe('reputation-good');
    });
  });

  describe('reputation CSS class in template', () => {
    it('should apply reputation-bad class when reputation is low', () => {
      fixture.componentRef.setInput('reputation', 15);
      fixture.detectChanges();

      const repSpan = fixture.nativeElement.querySelector('.reputation-bad');
      expect(repSpan).toBeTruthy();
    });

    it('should apply reputation-neutral class when reputation is medium', () => {
      fixture.componentRef.setInput('reputation', 50);
      fixture.detectChanges();

      const repSpan = fixture.nativeElement.querySelector('.reputation-neutral');
      expect(repSpan).toBeTruthy();
    });

    it('should apply reputation-good class when reputation is high', () => {
      fixture.componentRef.setInput('reputation', 85);
      fixture.detectChanges();

      const repSpan = fixture.nativeElement.querySelector('.reputation-good');
      expect(repSpan).toBeTruthy();
    });
  });

  describe('empty state handling', () => {
    it('should display 0 for empty inventory', () => {
      fixture.componentRef.setInput('inventory', new Map<string, number>());
      fixture.detectChanges();

      const counts = fixture.nativeElement.querySelectorAll('.card-count');
      expect(counts[0].textContent.trim()).toBe('0');
      expect(counts[1].textContent.trim()).toBe('0');
      expect(counts[2].textContent.trim()).toBe('0');
    });

    it('should apply empty class to cards with zero stock', () => {
      fixture.componentRef.setInput('inventory', new Map<string, number>());
      fixture.detectChanges();

      const cards = fixture.nativeElement.querySelectorAll('.stock-card.empty');
      expect(cards.length).toBe(5);
    });

    it('should show BASIC tier when no upgrades', () => {
      fixture.componentRef.setInput('potionUpgrades', {});
      fixture.detectChanges();

      const tiers = fixture.nativeElement.querySelectorAll('.card-tier');
      tiers.forEach((tier: HTMLElement) => {
        expect(tier.textContent).toContain('BASIC');
      });
    });
  });

  describe('output events', () => {
    it('should emit openShop when Open Shop button is clicked', () => {
      fixture.detectChanges();
      const spy = spyOn(component.openShop, 'emit');

      const button = fixture.nativeElement.querySelector('.open-shop-btn');
      button.click();

      expect(spy).toHaveBeenCalled();
    });

    it('should call onOpenShop method correctly', () => {
      const spy = spyOn(component.openShop, 'emit');

      component.onOpenShop();

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Recipe Upgrades section (canonical upgrade UI)', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('potionUpgrades', { healing: 0, strength: 0, defense: 0 });
      // 300g covers healing (200g), strength (250g) and defense (250g) first-tier costs
      // so all three upgrade buttons are enabled for click tests.
      fixture.componentRef.setInput('gold', 300);
      fixture.detectChanges();
    });

    it('should render the upgrades section heading', () => {
      const heading = fixture.nativeElement.querySelector('.upgrades-section .section-title');
      expect(heading.textContent).toContain('Recipe Upgrades');
    });

    it('should render three upgrade items', () => {
      const items = fixture.nativeElement.querySelectorAll('.upgrades-section .upgrade-item');
      expect(items.length).toBe(3);
    });

    it('should show upgrade buttons when not at max tier', () => {
      const btns = fixture.nativeElement.querySelectorAll('.upgrades-section .upgrade-btn');
      expect(btns.length).toBe(3);
    });

    it('should emit buyUpgrade with correct type when healing upgrade is clicked', () => {
      const spy = spyOn(component.buyUpgrade, 'emit');
      const btns = fixture.nativeElement.querySelectorAll('.upgrades-section .upgrade-btn');
      btns[0].click();
      expect(spy).toHaveBeenCalledWith('healing');
    });

    it('should emit buyUpgrade with correct type when strength upgrade is clicked', () => {
      const spy = spyOn(component.buyUpgrade, 'emit');
      const btns = fixture.nativeElement.querySelectorAll('.upgrades-section .upgrade-btn');
      btns[1].click();
      expect(spy).toHaveBeenCalledWith('strength');
    });

    it('should emit buyUpgrade with correct type when defense upgrade is clicked', () => {
      const spy = spyOn(component.buyUpgrade, 'emit');
      const btns = fixture.nativeElement.querySelectorAll('.upgrades-section .upgrade-btn');
      btns[2].click();
      expect(spy).toHaveBeenCalledWith('defense');
    });

    it('should disable upgrade button when player cannot afford it', () => {
      fixture.componentRef.setInput('gold', 0);
      fixture.detectChanges();
      const btns = fixture.nativeElement.querySelectorAll('.upgrades-section .upgrade-btn');
      btns.forEach((btn: HTMLButtonElement) => {
        expect(btn.disabled).toBeTrue();
      });
    });

    it('should show MAX badge and hide button at max tier', () => {
      // TIER_NAMES = ['BASIC','ENHANCED','SUPERIOR'] — max index is 2
      fixture.componentRef.setInput('potionUpgrades', { healing: 2, strength: 2, defense: 2 });
      fixture.detectChanges();
      const badges = fixture.nativeElement.querySelectorAll('.upgrades-section .maxed-badge');
      expect(badges.length).toBe(3);
      const btns = fixture.nativeElement.querySelectorAll('.upgrades-section .upgrade-btn');
      expect(btns.length).toBe(0);
    });
  });

  describe('no-stock warning copy', () => {
    it('should not contain em-dashes in warning text', () => {
      fixture.componentRef.setInput('canAffordPotions', true);
      fixture.componentRef.setInput('inventory', new Map<string, number>());
      fixture.detectChanges();
      const warning = fixture.nativeElement.querySelector('.no-stock-warning');
      expect(warning.textContent).not.toContain('—');
    });
  });
});
