import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameHeaderComponent } from './game-header.component';

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string): number => {
    const channels = (hex.match(/[\da-f]{2}/gi) ?? []).map((channel) => parseInt(channel, 16) / 255);
    const linear = channels.map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };

  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('GameHeaderComponent', () => {
  let component: GameHeaderComponent;
  let fixture: ComponentFixture<GameHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GameHeaderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GameHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps every semantic ink readable on the permanently dark carved header', () => {
    const dayInfo = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.day-info');
    if (!dayInfo) throw new Error('Expected the game header day indicator to render');
    const styles = getComputedStyle(dayInfo);

    for (const token of ['--game-success', '--game-warning', '--game-danger', '--game-info']) {
      const color = styles.getPropertyValue(token).trim();
      expect(contrastRatio(color, '#221a11'))
        .withContext(`${token} ${color} on carved header #221a11`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  describe('Input rendering', () => {
    it('should display day number', () => {
      fixture.componentRef.setInput('day', 5);
      fixture.detectChanges();

      const dayInfo = fixture.nativeElement.querySelector('.day-info');
      expect(dayInfo.textContent).toContain('Day 5');
    });

    it('should display time of day', () => {
      fixture.componentRef.setInput('timeOfDay', 'Evening');
      fixture.detectChanges();

      const timeInfo = fixture.nativeElement.querySelector('.time-info');
      expect(timeInfo.textContent).toContain('Evening');
    });

    it('should display gold amount', () => {
      fixture.componentRef.setInput('gold', 250);
      fixture.detectChanges();

      const stats = fixture.nativeElement.querySelectorAll('.stat');
      const goldStat = stats[0];
      expect(goldStat.querySelector('.stat-value').textContent).toContain('250');
    });

    it('should display game speed', () => {
      fixture.componentRef.setInput('gameSpeed', 2);
      fixture.detectChanges();

      const speedBtn = fixture.nativeElement.querySelector('.speed-btn');
      expect(speedBtn.textContent).toContain('2x');
    });

    it('should show pause icon when not paused', () => {
      fixture.componentRef.setInput('isPaused', false);
      fixture.detectChanges();

      const pauseBtn = fixture.nativeElement.querySelector('.control-btn:not(.speed-btn):not(.audio-btn)');
      const icon = pauseBtn.querySelector('.btn-icon svg');
      expect(icon).toBeTruthy();
    });

    it('should show play icon when paused', () => {
      fixture.componentRef.setInput('isPaused', true);
      fixture.detectChanges();

      const pauseBtn = fixture.nativeElement.querySelector('.control-btn:not(.speed-btn):not(.audio-btn)');
      const icon = pauseBtn.querySelector('.btn-icon svg');
      expect(icon).toBeTruthy();
    });
  });

  describe('Computed properties', () => {
    it('should calculate netProfit correctly', () => {
      component.dailyProfit = 100;
      component.dailyExpenses = 25;

      expect(component.netProfit).toBe(75);
    });

    it('should calculate negative netProfit', () => {
      component.dailyProfit = 10;
      component.dailyExpenses = 50;

      expect(component.netProfit).toBe(-40);
    });

    it('should calculate survivalRate correctly', () => {
      component.savedCount = 8;
      component.deathCount = 2;

      expect(component.survivalRate).toBe(80);
    });

    it('should return 0 survivalRate when no adventurers', () => {
      component.savedCount = 0;
      component.deathCount = 0;

      expect(component.survivalRate).toBe(0);
    });

    it('should calculate progressPercent correctly', () => {
      component.gameTime = 60; // Halfway through day

      expect(component.progressPercent).toBe(50);
    });

    it('should calculate guiltPercent correctly', () => {
      component.guilt = 50;
      component.maxGuilt = 100;

      expect(component.guiltPercent).toBe(50);
    });
  });

  describe('CSS classes', () => {
    it('should return reputation-bad for low reputation', () => {
      component.reputation = 20;
      expect(component.getReputationClass()).toBe('reputation-bad');
    });

    it('should return reputation-neutral for medium reputation', () => {
      component.reputation = 50;
      expect(component.getReputationClass()).toBe('reputation-neutral');
    });

    it('should return reputation-good for high reputation', () => {
      component.reputation = 80;
      expect(component.getReputationClass()).toBe('reputation-good');
    });

    it('should apply speed-2x class when gameSpeed is 2', () => {
      fixture.componentRef.setInput('gameSpeed', 2);
      fixture.detectChanges();

      const speedBtn = fixture.nativeElement.querySelector('.speed-btn');
      expect(speedBtn.classList.contains('speed-2x')).toBeTrue();
    });

    it('should apply speed-3x class when gameSpeed is 3', () => {
      fixture.componentRef.setInput('gameSpeed', 3);
      fixture.detectChanges();

      const speedBtn = fixture.nativeElement.querySelector('.speed-btn');
      expect(speedBtn.classList.contains('speed-3x')).toBeTrue();
    });

    it('should show guilt bar when guilt > 10', () => {
      fixture.componentRef.setInput('guilt', 15);
      fixture.detectChanges();

      const guiltBar = fixture.nativeElement.querySelector('.guilt-bar-stacked');
      expect(guiltBar.classList.contains('visible')).toBeTrue();
    });

    it('should hide guilt bar when guilt <= 10', () => {
      fixture.componentRef.setInput('guilt', 5);
      fixture.detectChanges();

      const guiltBar = fixture.nativeElement.querySelector('.guilt-bar-stacked');
      expect(guiltBar.classList.contains('visible')).toBeFalse();
    });

    it('should apply high class when guilt > 50', () => {
      fixture.componentRef.setInput('guilt', 60);
      fixture.detectChanges();

      const guiltBar = fixture.nativeElement.querySelector('.guilt-bar-stacked');
      expect(guiltBar.classList.contains('high')).toBeTrue();
    });

    it('should apply critical class when guilt > 75', () => {
      fixture.componentRef.setInput('guilt', 80);
      fixture.detectChanges();

      const guiltBar = fixture.nativeElement.querySelector('.guilt-bar-stacked');
      expect(guiltBar.classList.contains('critical')).toBeTrue();
    });

    it('should highlight active time segment', () => {
      fixture.componentRef.setInput('timeOfDay', 'Afternoon');
      fixture.detectChanges();

      const segments = fixture.nativeElement.querySelectorAll('.time-segment');
      expect(segments[1].classList.contains('active')).toBeTrue();
      expect(segments[0].classList.contains('active')).toBeFalse();
    });
  });

  describe('Output events', () => {
    it('should emit togglePause when pause button clicked', () => {
      const spy = spyOn(component.togglePause, 'emit');

      const pauseBtn = fixture.nativeElement.querySelector('.control-btn:not(.speed-btn)');
      pauseBtn.click();

      expect(spy).toHaveBeenCalled();
    });

    it('should lock the pause control while a decision modal owns the pause', () => {
      const spy = spyOn(component.togglePause, 'emit');
      fixture.componentRef.setInput('pauseLocked', true);
      fixture.detectChanges();

      const pauseBtn = fixture.nativeElement.querySelector('.control-btn:not(.speed-btn)') as HTMLButtonElement;
      pauseBtn.click();

      expect(pauseBtn.disabled).toBeTrue();
      expect(pauseBtn.getAttribute('aria-label')).toBe('Game paused while a decision is open');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should expose the close-day sign during active play', () => {
      fixture.componentRef.setInput('canCloseDay', true);
      fixture.detectChanges();

      const closeDayBtn = fixture.nativeElement.querySelector('.close-day-btn') as HTMLButtonElement;
      expect(closeDayBtn).toBeTruthy();
      expect(closeDayBtn.getAttribute('aria-label')).toBe('Close shop and end the day early');
    });

    it('should emit requestCloseDay from the close-day sign', () => {
      const spy = spyOn(component.requestCloseDay, 'emit');
      fixture.componentRef.setInput('canCloseDay', true);
      fixture.detectChanges();

      (fixture.nativeElement.querySelector('.close-day-btn') as HTMLButtonElement).click();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should lock the close-day sign while another decision owns the pause', () => {
      const spy = spyOn(component.requestCloseDay, 'emit');
      fixture.componentRef.setInput('canCloseDay', true);
      fixture.componentRef.setInput('closeDayLocked', true);
      fixture.detectChanges();

      const closeDayBtn = fixture.nativeElement.querySelector('.close-day-btn') as HTMLButtonElement;
      closeDayBtn.click();

      expect(closeDayBtn.disabled).toBeTrue();
      expect(spy).not.toHaveBeenCalled();
    });

    it('should emit changeSpeed when speed button clicked', () => {
      const spy = spyOn(component.changeSpeed, 'emit');

      const speedBtn = fixture.nativeElement.querySelector('.speed-btn');
      speedBtn.click();

      expect(spy).toHaveBeenCalled();
    });

    it('should emit openHelp when help button clicked', () => {
      const spy = spyOn(component.openHelp, 'emit');

      const helpBtn = fixture.nativeElement.querySelector('.help-btn');
      helpBtn.click();

      expect(spy).toHaveBeenCalled();
    });

    it('should emit openTutorial when the how-to-play button is clicked', () => {
      const spy = spyOn(component.openTutorial, 'emit');

      const tutorialBtn = fixture.nativeElement.querySelector('.tutorial-btn');
      tutorialBtn.click();

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Help button (A11Y-5 / C7)', () => {
    it('should render a help button with aria-label "Keyboard shortcuts"', () => {
      const helpBtn = fixture.nativeElement.querySelector('.help-btn');
      expect(helpBtn).toBeTruthy();
      expect(helpBtn.getAttribute('aria-label')).toBe('Keyboard shortcuts');
    });

    it('help button should be inside .controls', () => {
      const controls = fixture.nativeElement.querySelector('.controls');
      const helpBtn = controls?.querySelector('.help-btn');
      expect(helpBtn).toBeTruthy();
    });
  });

  describe('How to Play button (WS2a)', () => {
    it('should render a how-to-play button with aria-label "How to play"', () => {
      const tutorialBtn = fixture.nativeElement.querySelector('.tutorial-btn');
      expect(tutorialBtn).toBeTruthy();
      expect(tutorialBtn.getAttribute('aria-label')).toBe('How to play');
    });

    it('how-to-play button should be inside .controls, next to the help button', () => {
      const controls = fixture.nativeElement.querySelector('.controls');
      const tutorialBtn = controls?.querySelector('.tutorial-btn');
      const helpBtn = controls?.querySelector('.help-btn');
      expect(tutorialBtn).toBeTruthy();
      expect(helpBtn).toBeTruthy();
    });
  });

  describe('Edge cases', () => {
    it('should display positive net profit with + prefix', () => {
      fixture.componentRef.setInput('dailyProfit', 100);
      fixture.componentRef.setInput('dailyExpenses', 25);
      fixture.detectChanges();

      const stats = fixture.nativeElement.querySelectorAll('.stat');
      const todayStat = stats[1];
      expect(todayStat.querySelector('.stat-value').textContent).toContain('+75');
    });

    it('should display negative net profit without + prefix', () => {
      fixture.componentRef.setInput('dailyProfit', 10);
      fixture.componentRef.setInput('dailyExpenses', 50);
      fixture.detectChanges();

      const stats = fixture.nativeElement.querySelectorAll('.stat');
      const todayStat = stats[1];
      expect(todayStat.querySelector('.stat-value').textContent).toContain('-40');
    });

    it('should display -- survival rate when no adventurers', () => {
      fixture.componentRef.setInput('savedCount', 0);
      fixture.componentRef.setInput('deathCount', 0);
      fixture.detectChanges();

      const stats = fixture.nativeElement.querySelectorAll('.stat');
      const survivalStat = stats[5];
      const statValue = survivalStat.querySelector('.stat-value');
      expect(statValue.textContent).toContain('--');
      expect(statValue.classList.contains('muted')).toBeTrue();
    });

    it('should handle max guilt correctly', () => {
      fixture.componentRef.setInput('guilt', 100);
      fixture.componentRef.setInput('maxGuilt', 100);
      fixture.detectChanges();

      expect(component.guiltPercent).toBe(100);
      const guiltBar = fixture.nativeElement.querySelector('.guilt-bar-stacked');
      expect(guiltBar.classList.contains('critical')).toBeTrue();
    });
  });
});
