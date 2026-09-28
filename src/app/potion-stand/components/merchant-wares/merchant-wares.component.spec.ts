import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MerchantInventory, MerchantWaresComponent } from './merchant-wares.component';

describe('MerchantWaresComponent', () => {
  let component: MerchantWaresComponent;
  let fixture: ComponentFixture<MerchantWaresComponent>;

  const defaultInventory: MerchantInventory = {
    basicHealing: { available: 5, cost: 15 },
    strengthPotion: { available: 3, cost: 25 },
    defensePotion: { available: 3, cost: 27 },
    speedElixir: { available: 2, cost: 30 },
    luckCharm: { available: 2, cost: 35 },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MerchantWaresComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MerchantWaresComponent);
    component = fixture.componentInstance;
  });

  describe('initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should have default inventory values', () => {
      expect(component.inventory.basicHealing.available).toBe(0);
      expect(component.inventory.strengthPotion.available).toBe(0);
      expect(component.inventory.defensePotion.available).toBe(0);
      expect(component.inventory.speedElixir.available).toBe(0);
      expect(component.inventory.luckCharm.available).toBe(0);
    });

    it('should have default gold of 0', () => {
      expect(component.gold).toBe(0);
    });
  });

  describe('input rendering', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('inventory', defaultInventory);
      fixture.componentRef.setInput('gold', 100);
      fixture.detectChanges();
    });

    it('should display panel title', () => {
      const title = fixture.nativeElement.querySelector('.panel-title');
      expect(title.textContent).toContain("Merchant's Wares");
    });

    it('should display all five ware items', () => {
      const wareItems = fixture.nativeElement.querySelectorAll('.ware-item');
      expect(wareItems.length).toBe(5);
    });

    it('should display correct potion names', () => {
      const wareNames = fixture.nativeElement.querySelectorAll('.ware-name');
      expect(wareNames[0].textContent).toContain('Healing');
      expect(wareNames[1].textContent).toContain('Strength');
      expect(wareNames[2].textContent).toContain('Protection');
      expect(wareNames[3].textContent).toContain('Speed');
      expect(wareNames[4].textContent).toContain('Luck');
    });

    it('should render potion bottles for each ware', () => {
      const bottles = fixture.nativeElement.querySelectorAll('app-potion-bottle');
      expect(bottles.length).toBe(5);
    });

    it('should display available stock for each potion', () => {
      const wareStocks = fixture.nativeElement.querySelectorAll('.ware-stock');
      expect(wareStocks[0].textContent).toContain('5 available');
      expect(wareStocks[1].textContent).toContain('3 available');
      expect(wareStocks[2].textContent).toContain('3 available');
      expect(wareStocks[3].textContent).toContain('2 available');
      expect(wareStocks[4].textContent).toContain('2 available');
    });

    it('should display prices on buy buttons', () => {
      const buyButtons = fixture.nativeElement.querySelectorAll('.buy-btn');
      expect(buyButtons[0].textContent).toContain('15');
      expect(buyButtons[1].textContent).toContain('25');
      expect(buyButtons[2].textContent).toContain('27');
      expect(buyButtons[3].textContent).toContain('30');
      expect(buyButtons[4].textContent).toContain('35');
    });
  });

  describe('totalCost getter', () => {
    it('should calculate total cost correctly', () => {
      fixture.componentRef.setInput('inventory', defaultInventory);
      fixture.detectChanges();

      // 5*15 + 3*25 + 3*27 + 2*30 + 2*35 = 75 + 75 + 81 + 60 + 70 = 361
      expect(component.totalCost).toBe(361);
    });

    it('should return 0 when all items sold out', () => {
      fixture.componentRef.setInput('inventory', {
        basicHealing: { available: 0, cost: 15 },
        strengthPotion: { available: 0, cost: 25 },
        defensePotion: { available: 0, cost: 27 },
        speedElixir: { available: 0, cost: 30 },
        luckCharm: { available: 0, cost: 35 },
      });
      fixture.detectChanges();

      expect(component.totalCost).toBe(0);
    });

    it('should handle partial inventory', () => {
      fixture.componentRef.setInput('inventory', {
        basicHealing: { available: 2, cost: 15 },
        strengthPotion: { available: 0, cost: 25 },
        defensePotion: { available: 1, cost: 27 },
        speedElixir: { available: 0, cost: 30 },
        luckCharm: { available: 0, cost: 35 },
      });
      fixture.detectChanges();

      // 2*15 + 0*25 + 1*27 = 30 + 0 + 27 = 57
      expect(component.totalCost).toBe(57);
    });
  });

  describe('canAfford method', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('inventory', defaultInventory);
    });

    it('should return true when player has enough gold', () => {
      fixture.componentRef.setInput('gold', 100);
      fixture.detectChanges();

      expect(component.canAfford('basicHealing')).toBe(true);
      expect(component.canAfford('strengthPotion')).toBe(true);
      expect(component.canAfford('defensePotion')).toBe(true);
    });

    it('should return false when player lacks gold', () => {
      fixture.componentRef.setInput('gold', 10);
      fixture.detectChanges();

      expect(component.canAfford('basicHealing')).toBe(false);
      expect(component.canAfford('strengthPotion')).toBe(false);
      expect(component.canAfford('defensePotion')).toBe(false);
    });

    it('should return true when gold equals cost exactly', () => {
      fixture.componentRef.setInput('gold', 15);
      fixture.detectChanges();

      expect(component.canAfford('basicHealing')).toBe(true);
      expect(component.canAfford('strengthPotion')).toBe(false);
    });
  });

  describe('isSoldOut method', () => {
    it('should return true when item has 0 available', () => {
      fixture.componentRef.setInput('inventory', {
        basicHealing: { available: 0, cost: 15 },
        strengthPotion: { available: 3, cost: 25 },
        defensePotion: { available: 0, cost: 27 },
        speedElixir: { available: 2, cost: 30 },
        luckCharm: { available: 2, cost: 35 },
      });
      fixture.detectChanges();

      expect(component.isSoldOut('basicHealing')).toBe(true);
      expect(component.isSoldOut('strengthPotion')).toBe(false);
      expect(component.isSoldOut('defensePotion')).toBe(true);
    });

    it('should return false when item has stock', () => {
      fixture.componentRef.setInput('inventory', defaultInventory);
      fixture.detectChanges();

      expect(component.isSoldOut('basicHealing')).toBe(false);
      expect(component.isSoldOut('strengthPotion')).toBe(false);
      expect(component.isSoldOut('defensePotion')).toBe(false);
    });
  });

  describe('sold-out styling', () => {
    it('should apply sold-out class to items with 0 stock', () => {
      fixture.componentRef.setInput('inventory', {
        basicHealing: { available: 0, cost: 15 },
        strengthPotion: { available: 3, cost: 25 },
        defensePotion: { available: 0, cost: 27 },
        speedElixir: { available: 2, cost: 30 },
        luckCharm: { available: 2, cost: 35 },
      });
      fixture.componentRef.setInput('gold', 100);
      fixture.detectChanges();

      const wareItems = fixture.nativeElement.querySelectorAll('.ware-item');
      expect(wareItems[0].classList.contains('sold-out')).toBe(true);
      expect(wareItems[1].classList.contains('sold-out')).toBe(false);
      expect(wareItems[2].classList.contains('sold-out')).toBe(true);
    });
  });

  describe('button disabled states', () => {
    it('should disable buy button when sold out', () => {
      fixture.componentRef.setInput('inventory', {
        basicHealing: { available: 0, cost: 15 },
        strengthPotion: { available: 3, cost: 25 },
        defensePotion: { available: 3, cost: 27 },
        speedElixir: { available: 2, cost: 30 },
        luckCharm: { available: 2, cost: 35 },
      });
      fixture.componentRef.setInput('gold', 100);
      fixture.detectChanges();

      const buyButtons = fixture.nativeElement.querySelectorAll('.buy-btn');
      expect(buyButtons[0].disabled).toBe(true);
      expect(buyButtons[1].disabled).toBe(false);
      expect(buyButtons[2].disabled).toBe(false);
    });

    it('should disable buy button when cannot afford', () => {
      fixture.componentRef.setInput('inventory', defaultInventory);
      fixture.componentRef.setInput('gold', 20);
      fixture.detectChanges();

      const buyButtons = fixture.nativeElement.querySelectorAll('.buy-btn');
      expect(buyButtons[0].disabled).toBe(false); // 15g - can afford
      expect(buyButtons[1].disabled).toBe(true); // 25g - cannot afford
      expect(buyButtons[2].disabled).toBe(true); // 27g - cannot afford
    });

    it('should disable bulk buy when cannot afford total', () => {
      fixture.componentRef.setInput('inventory', defaultInventory);
      fixture.componentRef.setInput('gold', 100);
      fixture.detectChanges();

      const bulkBtn = fixture.nativeElement.querySelector('.bulk-btn');
      expect(bulkBtn.disabled).toBe(true); // Total is 361g
    });

    it('should enable bulk buy when can afford total', () => {
      fixture.componentRef.setInput('inventory', defaultInventory);
      fixture.componentRef.setInput('gold', 400);
      fixture.detectChanges();

      const bulkBtn = fixture.nativeElement.querySelector('.bulk-btn');
      expect(bulkBtn.disabled).toBe(false);
    });
  });

  describe('bulk buy row visibility', () => {
    it('should show bulk buy row when totalCost > 0', () => {
      fixture.componentRef.setInput('inventory', defaultInventory);
      fixture.componentRef.setInput('gold', 100);
      fixture.detectChanges();

      const bulkRow = fixture.nativeElement.querySelector('.wares-action');
      expect(bulkRow).toBeTruthy();
    });

    it('should hide bulk buy row when totalCost is 0', () => {
      fixture.componentRef.setInput('inventory', {
        basicHealing: { available: 0, cost: 15 },
        strengthPotion: { available: 0, cost: 25 },
        defensePotion: { available: 0, cost: 27 },
        speedElixir: { available: 0, cost: 30 },
        luckCharm: { available: 0, cost: 35 },
      });
      fixture.componentRef.setInput('gold', 100);
      fixture.detectChanges();

      const bulkRow = fixture.nativeElement.querySelector('.wares-action');
      expect(bulkRow).toBeFalsy();
    });

    it('should display correct total in bulk buy button', () => {
      fixture.componentRef.setInput('inventory', defaultInventory);
      fixture.componentRef.setInput('gold', 400);
      fixture.detectChanges();

      const bulkBtn = fixture.nativeElement.querySelector('.bulk-btn');
      expect(bulkBtn.textContent).toContain('Buy All');
      expect(bulkBtn.textContent).toContain('361');
    });
  });

  describe('output events', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('inventory', defaultInventory);
      fixture.componentRef.setInput('gold', 400);
      fixture.detectChanges();
    });

    it('should emit buyPotion with basicHealing when clicking first buy button', () => {
      const spy = spyOn(component.buyPotion, 'emit');
      const buyButtons = fixture.nativeElement.querySelectorAll('.buy-btn');

      buyButtons[0].click();

      expect(spy).toHaveBeenCalledWith('basicHealing');
    });

    it('should emit buyPotion with strengthPotion when clicking second buy button', () => {
      const spy = spyOn(component.buyPotion, 'emit');
      const buyButtons = fixture.nativeElement.querySelectorAll('.buy-btn');

      buyButtons[1].click();

      expect(spy).toHaveBeenCalledWith('strengthPotion');
    });

    it('should emit buyPotion with defensePotion when clicking third buy button', () => {
      const spy = spyOn(component.buyPotion, 'emit');
      const buyButtons = fixture.nativeElement.querySelectorAll('.buy-btn');

      buyButtons[2].click();

      expect(spy).toHaveBeenCalledWith('defensePotion');
    });

    it('should emit buyAll when clicking bulk buy button', () => {
      const spy = spyOn(component.buyAll, 'emit');
      const bulkBtn = fixture.nativeElement.querySelector('.bulk-btn');

      bulkBtn.click();

      expect(spy).toHaveBeenCalled();
    });

    it('should not emit buyPotion when button is disabled', () => {
      fixture.componentRef.setInput('gold', 10);
      fixture.detectChanges();

      const spy = spyOn(component.buyPotion, 'emit');
      const buyButtons = fixture.nativeElement.querySelectorAll('.buy-btn');

      // All buttons should be disabled at 10g
      buyButtons[1].click(); // 25g - disabled

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('method calls', () => {
    it('should call onBuyPotion correctly', () => {
      const spy = spyOn(component.buyPotion, 'emit');

      component.onBuyPotion('basicHealing');
      expect(spy).toHaveBeenCalledWith('basicHealing');

      component.onBuyPotion('strengthPotion');
      expect(spy).toHaveBeenCalledWith('strengthPotion');

      component.onBuyPotion('defensePotion');
      expect(spy).toHaveBeenCalledWith('defensePotion');
    });

    it('should call onBuyAll correctly', () => {
      const spy = spyOn(component.buyAll, 'emit');

      component.onBuyAll();

      expect(spy).toHaveBeenCalled();
    });
  });
});
