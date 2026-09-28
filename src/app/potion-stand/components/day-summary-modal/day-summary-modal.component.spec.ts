import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DaySummaryData, DaySummaryModalComponent } from './day-summary-modal.component';

describe('DaySummaryModalComponent', () => {
  let component: DaySummaryModalComponent;
  let fixture: ComponentFixture<DaySummaryModalComponent>;

  const mockData: DaySummaryData = {
    day: 5,
    netProfit: 150,
    deaths: 2,
    saves: 8,
    reputationChange: 3,
    potionsSold: 6,
    deathsYourFault: 1,
    bossesDefeated: 0,
    unprepared: 0,
    guiltLevel: 'low',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DaySummaryModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DaySummaryModalComponent);
    component = fixture.componentInstance;
    component.data = mockData;
    component.gold = 500;
    component.reputation = 25;
    component.nextDay = 6;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Inputs', () => {
    it('should display the day number from data', () => {
      const title = fixture.nativeElement.querySelector('.summary-title');
      expect(title.textContent).toContain('Day 5 Summary');
    });

    it('should display current gold', () => {
      const goldValue = fixture.nativeElement.querySelector('.ledger-row .ledger-value');
      expect(goldValue.textContent).toContain('500');
    });

    it('should display net profit with correct class', () => {
      const profitDelta = fixture.nativeElement.querySelector('.ledger-delta');
      expect(profitDelta.textContent).toContain('+150');
      expect(profitDelta.classList).toContain('positive');
    });

    it('should display saves in outcomes grid', () => {
      const savedItem = fixture.nativeElement.querySelector('.outcome-item.saved .outcome-value');
      expect(savedItem.textContent).toContain('8');
    });

    it('should display deaths in outcomes grid', () => {
      const deathItem = fixture.nativeElement.querySelector('.outcome-item.deaths .outcome-value');
      expect(deathItem.textContent).toContain('2');
    });

    it('should display potions sold when > 0', () => {
      const items = fixture.nativeElement.querySelectorAll('.outcome-item');
      const soldItem = Array.from(items as NodeListOf<Element>).find(
        (el) => el.querySelector('.outcome-label')?.textContent?.trim() === 'Sold'
      );
      expect(soldItem).toBeTruthy();
    });

    it('should display next day in continue button', () => {
      const button = fixture.nativeElement.querySelector('.summary-continue');
      expect(button.textContent).toContain('Continue to Day 6');
    });
  });

  describe('Narrative', () => {
    it('should show good narrative when no deaths', () => {
      component.data = { ...mockData, deaths: 0, deathsYourFault: 0 };
      expect(component.narrative).toContain('Every adventurer came home');
      expect(component.narrativeClass).toBe('tone-good');
    });

    it('should show grim narrative on massacre', () => {
      component.data = { ...mockData, deaths: 4, saves: 1, deathsYourFault: 0, unprepared: 0 };
      expect(component.narrative).toContain('dark day');
      expect(component.narrativeClass).toBe('tone-grim');
    });

    it('should show guilt narrative when all deaths are your fault', () => {
      component.data = { ...mockData, deaths: 2, deathsYourFault: 2, unprepared: 0 };
      expect(component.narrative).toContain('preventable');
      expect(component.narrativeClass).toBe('tone-guilt');
    });

    it('should mention boss defeat on perfect day', () => {
      component.data = { ...mockData, deaths: 0, saves: 3, bossesDefeated: 1, deathsYourFault: 0 };
      expect(component.narrative).toContain('A boss fell');
    });

    it('should show empty narrative when no activity', () => {
      component.data = { ...mockData, deaths: 0, saves: 0, potionsSold: 0, deathsYourFault: 0 };
      expect(component.narrative).toContain('empty');
    });
  });

  describe('Death breakdown', () => {
    it('should show fault count when deathsYourFault > 0', () => {
      fixture.componentRef.setInput('data', { ...mockData, deathsYourFault: 2 });
      fixture.detectChanges();

      const faultItem = fixture.nativeElement.querySelector('.breakdown-item.fault');
      expect(faultItem).toBeTruthy();
      expect(faultItem.textContent).toContain('2 your fault');
    });

    it('should show unprepared count', () => {
      fixture.componentRef.setInput('data', { ...mockData, unprepared: 1 });
      fixture.detectChanges();

      const unpreparedItem = fixture.nativeElement.querySelector('.breakdown-item.unprepared');
      expect(unpreparedItem).toBeTruthy();
      expect(unpreparedItem.textContent).toContain('1 unprepared');
    });

    it('should show dungeon message when deaths are not your fault', () => {
      fixture.componentRef.setInput('data', { ...mockData, deathsYourFault: 0, unprepared: 0 });
      fixture.detectChanges();

      const dungeonItem = fixture.nativeElement.querySelector('.breakdown-item.dungeon');
      expect(dungeonItem).toBeTruthy();
      expect(dungeonItem.textContent).toContain('the dungeon claimed them');
    });

    it('should not show breakdown when no deaths', () => {
      fixture.componentRef.setInput('data', { ...mockData, deaths: 0, deathsYourFault: 0 });
      fixture.detectChanges();

      const breakdown = fixture.nativeElement.querySelector('.death-breakdown');
      expect(breakdown).toBeNull();
    });
  });

  describe('Outputs', () => {
    it('does NOT emit dismiss when the overlay backdrop is clicked', () => {
      // Backdrop light-dismiss is intentionally removed: clicking outside the
      // modal used to advance the day, which was unexpectedly aggressive UX.
      // Continue button and Escape are the only paths forward.
      const spy = spyOn(component.dismiss, 'emit');
      const overlay = fixture.nativeElement.querySelector('.summary-overlay');
      overlay.click();
      expect(spy).not.toHaveBeenCalled();
    });

    it('should emit dismiss when continue button is clicked', () => {
      const spy = spyOn(component.dismiss, 'emit');
      const button = fixture.nativeElement.querySelector('.summary-continue');
      button.click();
      expect(spy).toHaveBeenCalled();
    });

    it('should emit dismiss when Escape key is pressed', () => {
      const spy = spyOn(component.dismiss, 'emit');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(spy).toHaveBeenCalled();
    });

    it('should not emit dismiss when modal content is clicked', () => {
      const spy = spyOn(component.dismiss, 'emit');
      const modal = fixture.nativeElement.querySelector('.summary-modal');
      modal.click();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('Negative values', () => {
    it('should display negative net profit with negative class', () => {
      fixture.componentRef.setInput('data', { ...mockData, netProfit: -50 });
      fixture.detectChanges();

      const profitDelta = fixture.nativeElement.querySelector('.ledger-delta');
      expect(profitDelta.textContent).toContain('-50');
      expect(profitDelta.classList).toContain('negative');
    });

    it('should display negative gold with negative class', () => {
      fixture.componentRef.setInput('gold', -100);
      fixture.detectChanges();

      const goldValue = fixture.nativeElement.querySelector('.ledger-row .ledger-value');
      expect(goldValue.classList).toContain('negative');
    });

    it('should display negative reputation change with negative class', () => {
      fixture.componentRef.setInput('data', { ...mockData, reputationChange: -5 });
      fixture.detectChanges();

      const repDelta = fixture.nativeElement.querySelectorAll('.ledger-delta')[1];
      expect(repDelta.textContent).toContain('-5');
      expect(repDelta.classList).toContain('negative');
    });
  });

  describe('Accessibility', () => {
    it('should have role="dialog" on the modal container', () => {
      const modal = fixture.nativeElement.querySelector('.summary-modal');
      expect(modal.getAttribute('role')).toBe('dialog');
    });

    it('should have aria-modal="true" on the modal container', () => {
      const modal = fixture.nativeElement.querySelector('.summary-modal');
      expect(modal.getAttribute('aria-modal')).toBe('true');
    });

    it('should have aria-labelledby pointing to the title', () => {
      const modal = fixture.nativeElement.querySelector('.summary-modal');
      expect(modal.getAttribute('aria-labelledby')).toBe('day-summary-title');
      const titleEl = fixture.nativeElement.querySelector('#day-summary-title');
      expect(titleEl).toBeTruthy();
    });
  });

  describe('Conditional outcomes', () => {
    it('should not show boss chip when bossesDefeated is 0', () => {
      fixture.componentRef.setInput('data', { ...mockData, bossesDefeated: 0 });
      fixture.detectChanges();

      const bossItem = fixture.nativeElement.querySelector('.outcome-item.boss');
      expect(bossItem).toBeNull();
    });

    it('should show boss chip when bossesDefeated > 0', () => {
      fixture.componentRef.setInput('data', { ...mockData, bossesDefeated: 2 });
      fixture.detectChanges();

      const bossItem = fixture.nativeElement.querySelector('.outcome-item.boss');
      expect(bossItem).toBeTruthy();
      expect(bossItem.querySelector('.outcome-value').textContent).toContain('2');
    });

    it('should not show sold chip when potionsSold is 0', () => {
      fixture.componentRef.setInput('data', { ...mockData, potionsSold: 0 });
      fixture.detectChanges();

      const items = fixture.nativeElement.querySelectorAll('.outcome-item');
      const soldItem = Array.from(items as NodeListOf<Element>).find(
        (el) => el.querySelector('.outcome-label')?.textContent?.trim() === 'Sold'
      );
      expect(soldItem).toBeFalsy();
    });
  });
});
