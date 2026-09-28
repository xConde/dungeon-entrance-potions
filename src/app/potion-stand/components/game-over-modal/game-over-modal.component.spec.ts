import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameOverModalComponent, GameOverStats } from './game-over-modal.component';
import { VICTORY_TIERS } from '../../config/game-config';

describe('GameOverModalComponent', () => {
  let component: GameOverModalComponent;
  let fixture: ComponentFixture<GameOverModalComponent>;

  const mockStats: GameOverStats = {
    day: 15,
    savedCount: 50,
    deathCount: 10,
    reputation: 25,
    gold: 500,
    goldEarned: 2000,
    potionsSold: 100,
    perfectSaves: 5,
    bossesDefeated: 2,
    combosTriggered: 8,
    maxDeathStreak: 3,
    dilutedSold: 0,
    guiltLevel: 'low',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GameOverModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GameOverModalComponent);
    component = fixture.componentInstance;
  });

  describe('Bankruptcy', () => {
    beforeEach(() => {
      component.reason = 'bankruptcy';
      component.stats = { ...mockStats, gold: -200 };
      fixture.detectChanges();
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should display "Shop Closed" title', () => {
      const title = fixture.nativeElement.querySelector('.gameover-title');
      expect(title.textContent).toContain('Shop Closed');
    });

    it('should not have victory class on modal', () => {
      const modal = fixture.nativeElement.querySelector('.gameover-modal');
      expect(modal.classList).not.toContain('victory');
    });

    it('should display days survived', () => {
      const statRows = fixture.nativeElement.querySelectorAll('.stat-row');
      expect(statRows[0].textContent).toContain('Days Survived');
      expect(statRows[0].textContent).toContain('15');
    });

    it('should display adventurers saved with saved class', () => {
      const statRows = fixture.nativeElement.querySelectorAll('.stat-row');
      const savedValue = statRows[1].querySelector('.stat-value');
      expect(savedValue.textContent).toContain('50');
      expect(savedValue.classList).toContain('saved');
    });

    it('should display deaths with deaths class', () => {
      const statRows = fixture.nativeElement.querySelectorAll('.stat-row');
      const deathsValue = statRows[2].querySelector('.stat-value');
      expect(deathsValue.textContent).toContain('10');
      expect(deathsValue.classList).toContain('deaths');
    });

    it('should display final debt with debt class', () => {
      const statRows = fixture.nativeElement.querySelectorAll('.stat-row');
      const debtValue = statRows[4].querySelector('.stat-value');
      expect(debtValue.textContent).toContain('-200');
      expect(debtValue.classList).toContain('debt');
    });

    it('should display bankruptcy epitaph', () => {
      const epitaph = fixture.nativeElement.querySelector('.gameover-epitaph');
      expect(epitaph.textContent).toContain("Perhaps the potion business wasn't meant for you");
    });
  });

  describe('Victory', () => {
    beforeEach(() => {
      component.reason = 'success';
      component.stats = mockStats;
      fixture.detectChanges();
    });

    it('should display "Victory!" title', () => {
      const title = fixture.nativeElement.querySelector('.gameover-title');
      expect(title.textContent).toContain('Victory!');
    });

    it('should have victory class on modal', () => {
      const modal = fixture.nativeElement.querySelector('.gameover-modal');
      expect(modal.classList).toContain('victory');
    });

    it('should display days completed', () => {
      const statRows = fixture.nativeElement.querySelectorAll('.stat-row');
      expect(statRows[0].textContent).toContain('Days Completed');
      expect(statRows[0].textContent).toContain('15');
    });

    it('should display survival rate', () => {
      const statRows = fixture.nativeElement.querySelectorAll('.stat-row');
      expect(statRows[3].textContent).toContain('Survival Rate');
      expect(statRows[3].textContent).toContain('83%'); // 50/(50+10) = 83%
    });

    it('should display final gold with gold class', () => {
      const statRows = fixture.nativeElement.querySelectorAll('.stat-row');
      const goldValue = statRows[4].querySelector('.stat-value');
      expect(goldValue.textContent).toContain('500');
      expect(goldValue.classList).toContain('gold');
    });

    it('should display total gold earned with gold class', () => {
      const statRows = fixture.nativeElement.querySelectorAll('.stat-row');
      const goldEarnedValue = statRows[6].querySelector('.stat-value');
      expect(goldEarnedValue.textContent).toContain('2000');
      expect(goldEarnedValue.classList).toContain('gold');
    });

    it('should display potions sold', () => {
      const statRows = fixture.nativeElement.querySelectorAll('.stat-row');
      expect(statRows[7].textContent).toContain('Potions Sold');
      expect(statRows[7].textContent).toContain('100');
    });

    it('should display victory epitaph', () => {
      // mockStats: combosTriggered=8 (<10), bossesDefeated=2 (<3), perfectSaves=5 (<10),
      // survivalRate=83% (>=70%) → falls through to "true alchemist" epitaph
      const epitaph = fixture.nativeElement.querySelector('.gameover-epitaph');
      expect(epitaph.textContent).toContain('true alchemist and friend to adventurers');
    });

    it('should have aria-labelledby pointing to the title element', () => {
      const overlay = fixture.nativeElement.querySelector('.gameover-overlay');
      expect(overlay.getAttribute('aria-labelledby')).toBe('gameover-title');
      const titleEl = fixture.nativeElement.querySelector('#gameover-title');
      expect(titleEl).toBeTruthy();
    });
  });

  describe('Outputs', () => {
    beforeEach(() => {
      component.reason = 'bankruptcy';
      component.stats = mockStats;
      fixture.detectChanges();
    });

    it('should emit restart when restart button is clicked', () => {
      const spy = spyOn(component.restart, 'emit');
      const button = fixture.nativeElement.querySelector('.gameover-restart');
      button.click();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      component.reason = 'bankruptcy';
      component.stats = mockStats;
      fixture.detectChanges();
    });

    it('should have role="dialog" and aria-modal', () => {
      const overlay = fixture.nativeElement.querySelector('.gameover-overlay');
      expect(overlay.getAttribute('role')).toBe('dialog');
      expect(overlay.getAttribute('aria-modal')).toBe('true');
    });

    it('should have aria-labelledby pointing to the title element', () => {
      const overlay = fixture.nativeElement.querySelector('.gameover-overlay');
      expect(overlay.getAttribute('aria-labelledby')).toBe('gameover-title');
      const titleEl = fixture.nativeElement.querySelector('#gameover-title');
      expect(titleEl).toBeTruthy();
    });

    it('should focus restart button on init', () => {
      const restartButton = fixture.nativeElement.querySelector('.gameover-restart');
      expect(document.activeElement).toBe(restartButton);
    });

    it('should emit restart on Escape key', () => {
      const spy = spyOn(component.restart, 'emit');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(spy).toHaveBeenCalled();
    });

    it('should not throw on destroy and restore focus', () => {
      const mockElement = document.createElement('button');
      const focusSpy = spyOn(mockElement, 'focus');
      component['previouslyFocusedElement'] = mockElement;
      expect(() => component.ngOnDestroy()).not.toThrow();
      expect(focusSpy).toHaveBeenCalled();
    });
  });

  describe('Computed properties', () => {
    it('should return true for isVictory when reason is success', () => {
      component.reason = 'success';
      expect(component.isVictory).toBe(true);
    });

    it('should return false for isVictory when reason is bankruptcy', () => {
      component.reason = 'bankruptcy';
      expect(component.isVictory).toBe(false);
    });

    it('should calculate survival rate correctly', () => {
      component.stats = { ...mockStats, savedCount: 75, deathCount: 25 };
      expect(component.survivalRate).toBe(75); // 75/(75+25) = 75%
    });

    it('should return 100% survival rate when no adventurers', () => {
      component.stats = { ...mockStats, savedCount: 0, deathCount: 0 };
      expect(component.survivalRate).toBe(100);
    });

    it('should return the balanced fallback narrative when no notable traits', () => {
      component.reason = 'success';
      // dilutedSold 1-10 skips both diluted branches; combos <15 and bosses <3
      // skip combat branches; survivalRate 60% skips both compassion branches;
      // goldEarned <=3000 and gold >=50 skip both economy branches -> zero traits.
      component.stats = {
        ...mockStats,
        dilutedSold: 3,
        combosTriggered: 5,
        bossesDefeated: 1,
        savedCount: 60,
        deathCount: 40,
        goldEarned: 1500,
        gold: 300,
      };
      expect(component.playstyleNarrative).toBe('Thirty days. You made your choices and lived with them.');
    });

    it('playstyleNarrative: boss epitaph uses period not em-dash', () => {
      component.reason = 'success';
      component.stats = { ...mockStats, bossesDefeated: 3, combosTriggered: 0 };
      expect(component.epitaph).toContain('No boss could stand against your potions');
      expect(component.epitaph).not.toContain('—');
    });

    it('reputation epitaph uses period not em-dash', () => {
      component.reason = 'reputation';
      component.stats = { ...mockStats, dilutedSold: 0, maxDeathStreak: 2, deathCount: 60, savedCount: 40 };
      expect(component.epitaph).toContain('The guild had no choice');
      expect(component.epitaph).not.toContain('—');
    });
  });

  describe('victoryTier computation', () => {
    beforeEach(() => {
      component.reason = 'success';
    });

    it('returns null for bankruptcy', () => {
      component.reason = 'bankruptcy';
      component.stats = mockStats;
      expect(component.victoryTier).toBeNull();
    });

    it('returns null for reputation collapse', () => {
      component.reason = 'reputation';
      component.stats = mockStats;
      expect(component.victoryTier).toBeNull();
    });

    it('returns Master Alchemist when all top-tier thresholds are met', () => {
      const masterTier = VICTORY_TIERS.find((t) => t.id === 'master')!;
      component.stats = {
        ...mockStats,
        reputation: masterTier.minReputation,
        savedCount: masterTier.minSaved,
        combosTriggered: masterTier.minCombosTriggered,
      };
      const tier = component.victoryTier;
      expect(tier).not.toBeNull();
      expect(tier!.id).toBe('master');
      expect(tier!.label).toBe('Master Alchemist');
    });

    it('Master Alchemist: reputation exactly at threshold passes', () => {
      const masterTier = VICTORY_TIERS.find((t) => t.id === 'master')!;
      component.stats = {
        ...mockStats,
        reputation: masterTier.minReputation,
        savedCount: masterTier.minSaved,
        combosTriggered: masterTier.minCombosTriggered,
      };
      expect(component.victoryTier!.id).toBe('master');
    });

    it('Master Alchemist: reputation one below threshold falls to respected', () => {
      const masterTier = VICTORY_TIERS.find((t) => t.id === 'master')!;
      component.stats = {
        ...mockStats,
        reputation: masterTier.minReputation - 1,
        savedCount: masterTier.minSaved,
        combosTriggered: masterTier.minCombosTriggered,
      };
      const tier = component.victoryTier;
      expect(tier!.id).not.toBe('master');
    });

    it('Master Alchemist: savedCount one below threshold falls to respected', () => {
      const masterTier = VICTORY_TIERS.find((t) => t.id === 'master')!;
      component.stats = {
        ...mockStats,
        reputation: masterTier.minReputation,
        savedCount: masterTier.minSaved - 1,
        combosTriggered: masterTier.minCombosTriggered,
      };
      const tier = component.victoryTier;
      expect(tier!.id).not.toBe('master');
    });

    it('Master Alchemist: combosTriggered one below threshold falls to respected', () => {
      const masterTier = VICTORY_TIERS.find((t) => t.id === 'master')!;
      component.stats = {
        ...mockStats,
        reputation: masterTier.minReputation,
        savedCount: masterTier.minSaved,
        combosTriggered: masterTier.minCombosTriggered - 1,
      };
      const tier = component.victoryTier;
      expect(tier!.id).not.toBe('master');
    });

    it('returns Respected Apothecary when rep/saved met but combos below master threshold', () => {
      const masterTier = VICTORY_TIERS.find((t) => t.id === 'master')!;
      const respectedTier = VICTORY_TIERS.find((t) => t.id === 'respected')!;
      component.stats = {
        ...mockStats,
        reputation: respectedTier.minReputation,
        savedCount: respectedTier.minSaved,
        combosTriggered: masterTier.minCombosTriggered - 1,
      };
      const tier = component.victoryTier;
      expect(tier!.id).toBe('respected');
      expect(tier!.label).toBe('Respected Apothecary');
    });

    it('Respected Apothecary: reputation exactly at threshold passes', () => {
      const respectedTier = VICTORY_TIERS.find((t) => t.id === 'respected')!;
      component.stats = {
        ...mockStats,
        reputation: respectedTier.minReputation,
        savedCount: respectedTier.minSaved,
        combosTriggered: 0,
      };
      expect(component.victoryTier!.id).toBe('respected');
    });

    it('Respected Apothecary: savedCount one below threshold falls to survivor', () => {
      const respectedTier = VICTORY_TIERS.find((t) => t.id === 'respected')!;
      component.stats = {
        ...mockStats,
        reputation: respectedTier.minReputation,
        savedCount: respectedTier.minSaved - 1,
        combosTriggered: 0,
      };
      expect(component.victoryTier!.id).toBe('survivor');
    });

    it('Respected Apothecary: reputation one below threshold falls to survivor', () => {
      const respectedTier = VICTORY_TIERS.find((t) => t.id === 'respected')!;
      component.stats = {
        ...mockStats,
        reputation: respectedTier.minReputation - 1,
        savedCount: respectedTier.minSaved,
        combosTriggered: 0,
      };
      expect(component.victoryTier!.id).toBe('survivor');
    });

    it('returns Struggling Survivor for minimal victory stats', () => {
      component.stats = {
        ...mockStats,
        reputation: 0,
        savedCount: 0,
        combosTriggered: 0,
      };
      const tier = component.victoryTier;
      expect(tier!.id).toBe('survivor');
      expect(tier!.label).toBe('Struggling Survivor');
    });

    it('Struggling Survivor flavor has no em-dashes', () => {
      component.stats = { ...mockStats, reputation: 0, savedCount: 0, combosTriggered: 0 };
      expect(component.victoryTier!.flavor).not.toContain('—');
    });

    it('Master Alchemist flavor has no em-dashes', () => {
      const masterTier = VICTORY_TIERS.find((t) => t.id === 'master')!;
      component.stats = {
        ...mockStats,
        reputation: masterTier.minReputation,
        savedCount: masterTier.minSaved,
        combosTriggered: masterTier.minCombosTriggered,
      };
      expect(component.victoryTier!.flavor).not.toContain('—');
    });
  });

  describe('victoryTier DOM rendering', () => {
    it('renders the tier label and flavor on victory', () => {
      const masterTier = VICTORY_TIERS.find((t) => t.id === 'master')!;
      component.reason = 'success';
      component.stats = {
        ...mockStats,
        reputation: masterTier.minReputation,
        savedCount: masterTier.minSaved,
        combosTriggered: masterTier.minCombosTriggered,
      };
      fixture.detectChanges();
      const badge = fixture.nativeElement.querySelector('.victory-tier');
      expect(badge).toBeTruthy();
      expect(badge.querySelector('.victory-tier-label').textContent).toContain('Master Alchemist');
      expect(badge.querySelector('.victory-tier-flavor').textContent).toContain("dungeon's finest");
    });

    it('renders Struggling Survivor for low-stats victory', () => {
      component.reason = 'success';
      component.stats = { ...mockStats, reputation: 0, savedCount: 0, combosTriggered: 0 };
      fixture.detectChanges();
      const label = fixture.nativeElement.querySelector('.victory-tier-label');
      expect(label.textContent).toContain('Struggling Survivor');
    });

    it('sets data-tier attribute matching the tier id', () => {
      component.reason = 'success';
      component.stats = { ...mockStats, reputation: 0, savedCount: 0, combosTriggered: 0 };
      fixture.detectChanges();
      const badge = fixture.nativeElement.querySelector('.victory-tier');
      expect(badge.getAttribute('data-tier')).toBe('survivor');
    });

    it('does NOT render the tier badge on bankruptcy', () => {
      component.reason = 'bankruptcy';
      component.stats = { ...mockStats, gold: -200 };
      fixture.detectChanges();
      const badge = fixture.nativeElement.querySelector('.victory-tier');
      expect(badge).toBeNull();
    });

    it('does NOT render the tier badge on reputation collapse', () => {
      component.reason = 'reputation';
      component.stats = { ...mockStats, reputation: -60 };
      fixture.detectChanges();
      const badge = fixture.nativeElement.querySelector('.victory-tier');
      expect(badge).toBeNull();
    });

    it('renders Respected Apothecary for mid-tier victory', () => {
      const respectedTier = VICTORY_TIERS.find((t) => t.id === 'respected')!;
      component.reason = 'success';
      component.stats = {
        ...mockStats,
        reputation: respectedTier.minReputation,
        savedCount: respectedTier.minSaved,
        combosTriggered: 0,
      };
      fixture.detectChanges();
      const label = fixture.nativeElement.querySelector('.victory-tier-label');
      expect(label.textContent).toContain('Respected Apothecary');
    });
  });
});
