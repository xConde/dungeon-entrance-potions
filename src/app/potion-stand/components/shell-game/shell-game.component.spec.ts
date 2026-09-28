import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ShellGameComponent } from './shell-game.component';
import { GameRngService } from '../../services/game-rng.service';

describe('ShellGameComponent', () => {
  let component: ShellGameComponent;
  let fixture: ComponentFixture<ShellGameComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShellGameComponent],
      providers: [GameRngService],
    }).compileComponents();

    // Initialize the RNG with a fixed seed for deterministic tests
    const rng = TestBed.inject(GameRngService);
    rng.initialize(42);

    fixture = TestBed.createComponent(ShellGameComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    // Clean up any running intervals
    component.stop();
  });

  describe('Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should initialize with idle phase', () => {
      expect(component.phase).toBe('idle');
    });

    it('should have default hat positions [0, 1, 2]', () => {
      expect(component.hatPositions).toEqual([0, 1, 2]);
    });

    it('should have no selected hat initially', () => {
      expect(component.selectedHat).toBeNull();
    });

    it('should have no result initially', () => {
      expect(component.lastResult).toBeNull();
    });

    it('should default isActive to false', () => {
      expect(component.isActive).toBe(false);
    });
  });

  describe('start', () => {
    beforeEach(() => {
      component.isActive = true;
    });

    it('should start the shell game and set phase to reveal', () => {
      component.start();
      expect(component.phase).toBe('reveal');
    });

    it('should set a random potion type', () => {
      component.start();
      expect(['healing', 'strength', 'defense', 'speed', 'luck']).toContain(component.potionType);
    });

    it('should use the customer-linked reward type when provided', () => {
      component.rewardType = 'luck';
      component.start();
      expect(component.potionType).toBe('luck');
    });

    it('should set potion position to 0, 1, or 2', () => {
      component.start();
      expect([0, 1, 2]).toContain(component.potionPosition);
    });

    it('should reset hat positions to [0, 1, 2]', () => {
      component.hatPositions = [2, 0, 1]; // Scrambled
      component.start();
      expect(component.hatPositions).toEqual([0, 1, 2]);
    });

    it('should not start twice if already running', () => {
      component.start();
      const firstPhaseTimer = component['phaseTimer'];
      component.start(); // Try to start again
      // Should still have same timer value (not reset)
      expect(component['phaseTimer']).toBe(firstPhaseTimer);
    });
  });

  describe('stop', () => {
    beforeEach(() => {
      component.isActive = true;
    });

    it('should set phase to idle', () => {
      component.start();
      component.stop();
      expect(component.phase).toBe('idle');
    });

    it('should clear the running flag', () => {
      component.start();
      expect(component['running']).toBe(true);
      component.stop();
      expect(component['running']).toBe(false);
    });
  });

  describe('State Machine', () => {
    beforeEach(() => {
      component.isActive = true;
    });

    it('should transition from reveal to cover after timer expires', () => {
      component.start();
      expect(component.phase).toBe('reveal');

      // Simulate ticks until reveal phase ends (3 ticks / 1.5s)
      for (let i = 0; i < 3; i++) {
        component['tick']();
      }

      expect(component.phase).toBe('cover');
    });

    it('should transition from cover to shuffle after timer expires', () => {
      component.start();
      // Skip reveal (3 ticks)
      for (let i = 0; i < 3; i++) {
        component['tick']();
      }
      expect(component.phase).toBe('cover');

      // Skip cover (1 tick)
      component['tick']();
      expect(component.phase).toBe('shuffle');
    });

    it('should perform 3 shuffles during shuffle phase', () => {
      component.start();
      // Skip reveal (3 ticks) + cover (1 tick)
      for (let i = 0; i < 4; i++) {
        component['tick']();
      }
      expect(component.phase).toBe('shuffle');
      expect(component['shuffleCount']).toBe(0);

      // First shuffle after 2 ticks
      for (let i = 0; i < 2; i++) {
        component['tick']();
      }
      expect(component['shuffleCount']).toBe(1);

      // Second shuffle after another 2 ticks
      for (let i = 0; i < 2; i++) {
        component['tick']();
      }
      expect(component['shuffleCount']).toBe(2);

      // Third shuffle after another 2 ticks - should transition to pick
      for (let i = 0; i < 2; i++) {
        component['tick']();
      }
      expect(component['shuffleCount']).toBe(3);
      expect(component.phase).toBe('pick');
    });

    it('should transition to pick phase with a 4 second timer', () => {
      component.start();
      // Skip to pick phase: reveal(3) + cover(1) + shuffle(3*2=6)
      for (let i = 0; i < 10; i++) {
        component['tick']();
      }
      expect(component.phase).toBe('pick');
      expect(component.pickTimer).toBe(4);
    });

    it('should transition to result phase after pick timer expires', () => {
      component.start();
      // Skip to pick phase
      for (let i = 0; i < 10; i++) {
        component['tick']();
      }
      expect(component.phase).toBe('pick');

      // Skip pick phase (8 ticks)
      for (let i = 0; i < 8; i++) {
        component['tick']();
      }
      expect(component.phase).toBe('result');
    });

    it('should set timeout result if no selection made', () => {
      component.start();
      // Skip to result phase without selecting
      for (let i = 0; i < 18; i++) {
        component['tick']();
      }
      expect(component.lastResult).toBe('timeout');
    });

    it('should restart after result phase', () => {
      component.start();
      // Skip to result phase
      for (let i = 0; i < 18; i++) {
        component['tick']();
      }
      expect(component.phase).toBe('result');

      // Skip result phase (3 ticks) - should restart
      for (let i = 0; i < 3; i++) {
        component['tick']();
      }
      expect(component.phase).toBe('reveal');
    });
  });

  describe('selectHat', () => {
    beforeEach(() => {
      component.isActive = true;
      component.start();
      // Skip to pick phase
      for (let i = 0; i < 10; i++) {
        component['tick']();
      }
    });

    it('should record selected hat during pick phase', () => {
      component.selectHat(1);
      expect(component.selectedHat).toBe(1);
    });

    it('should set win result when correct hat selected', () => {
      component.potionPosition = 1;
      component.selectHat(1);
      expect(component.lastResult).toBe('win');
      // Selecting must resolve the round NOW (award immediately), not defer to
      // the pick-timer expiry — guards the 5s-delay regression this branch fixed.
      expect(component.phase).toBe('result');
    });

    it('should set lose result when wrong hat selected', () => {
      component.potionPosition = 1;
      component.selectHat(0);
      expect(component.lastResult).toBe('lose');
    });

    it('should not allow selection outside pick phase', () => {
      component.phase = 'shuffle';
      component.selectHat(1);
      expect(component.selectedHat).toBeNull();
    });

    it('should not allow changing selection once made', () => {
      component.selectHat(1);
      component.selectHat(2);
      expect(component.selectedHat).toBe(1); // Still first selection
    });
  });

  describe('potionWon Event', () => {
    beforeEach(() => {
      component.isActive = true;
    });

    it('should emit potionWon event on win with healing type', () => {
      const spy = spyOn(component.potionWon, 'emit');
      component.start();
      // Skip to pick phase
      for (let i = 0; i < 10; i++) {
        component['tick']();
      }
      component.potionType = 'healing';
      component.potionPosition = 1;
      component.selectHat(1); // Win

      // Emitted immediately on the pick — NOT after the pick timer runs out.
      expect(spy).toHaveBeenCalledWith({ potionType: 'healing', quantity: 1 });
    });

    it('should emit potionWon event on win with strength type', () => {
      const spy = spyOn(component.potionWon, 'emit');
      component.start();
      // Skip to pick phase
      for (let i = 0; i < 10; i++) {
        component['tick']();
      }
      component.potionType = 'strength';
      component.potionPosition = 1;
      component.selectHat(1); // Win

      // Emitted immediately on the pick — NOT after the pick timer runs out.
      expect(spy).toHaveBeenCalledWith({ potionType: 'strength', quantity: 1 });
    });

    it('should emit potionWon event on win with defense type', () => {
      const spy = spyOn(component.potionWon, 'emit');
      component.start();
      // Skip to pick phase
      for (let i = 0; i < 10; i++) {
        component['tick']();
      }
      component.potionType = 'defense';
      component.potionPosition = 1;
      component.selectHat(1); // Win

      // Emitted immediately on the pick — NOT after the pick timer runs out.
      expect(spy).toHaveBeenCalledWith({ potionType: 'defense', quantity: 1 });
    });

    it('should not emit potionWon event on lose', () => {
      const spy = spyOn(component.potionWon, 'emit');
      component.start();
      // Skip to pick phase
      for (let i = 0; i < 10; i++) {
        component['tick']();
      }
      component.potionType = 'healing';
      component.potionPosition = 1;
      component.selectHat(0); // Lose

      // Trigger result phase
      for (let i = 0; i < 8; i++) {
        component['tick']();
      }

      expect(spy).not.toHaveBeenCalled();
    });

    it('should not emit potionWon event on timeout', () => {
      const spy = spyOn(component.potionWon, 'emit');
      component.start();
      // Skip to result phase without selecting
      for (let i = 0; i < 18; i++) {
        component['tick']();
      }

      expect(spy).not.toHaveBeenCalled();
    });

    it('should double every third consecutive win and reset the streak on a miss', () => {
      const spy = spyOn(component.potionWon, 'emit');
      component.start();

      for (let round = 1; round <= 3; round++) {
        for (let i = 0; i < 10; i++) component['tick']();
        component.potionPosition = 1;
        component.selectHat(1);
        expect(spy.calls.mostRecent().args[0]?.quantity).toBe(round === 3 ? 2 : 1);
        if (round < 3) for (let i = 0; i < 3; i++) component['tick']();
      }

      expect(component.winStreak).toBe(3);
      for (let i = 0; i < 3; i++) component['tick']();
      for (let i = 0; i < 10; i++) component['tick']();
      component.potionPosition = 1;
      component.selectHat(0);
      expect(component.winStreak).toBe(0);
    });
  });

  describe('Keyboard isolation', () => {
    it('prevents Space on a hat from bubbling to the global sell shortcut', () => {
      component.phase = 'pick';
      fixture.detectChanges();
      const documentSpy = jasmine.createSpy('documentKeydown');
      document.addEventListener('keydown', documentSpy);
      const hat = fixture.nativeElement.querySelector('.hat-slot') as HTMLElement;
      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });

      hat.dispatchEvent(event);

      expect(event.defaultPrevented).toBeTrue();
      expect(documentSpy).not.toHaveBeenCalled();
      document.removeEventListener('keydown', documentSpy);
    });
  });

  describe('Shuffle Mechanics', () => {
    it('should swap adjacent hat positions during shuffle', () => {
      component.hatPositions = [0, 1, 2];
      component['performShuffle']();

      // After one shuffle, positions should be different
      // Either [1, 0, 2] or [0, 2, 1] depending on which pair was swapped
      expect(component.hatPositions).not.toEqual([0, 1, 2]);
    });

    it('should not change potion position during shuffle', () => {
      component.potionPosition = 1;
      const originalPosition = component.potionPosition;

      // Perform multiple shuffles
      for (let i = 0; i < 10; i++) {
        component['performShuffle']();
      }

      // Potion stays with its hat - position shouldn't change
      expect(component.potionPosition).toBe(originalPosition);
    });
  });

  describe('getPotionColor', () => {
    it('should return red for healing', () => {
      component.potionType = 'healing';
      expect(component.getPotionColor()).toBe('#dc2626');
    });

    it('should return orange for strength', () => {
      component.potionType = 'strength';
      expect(component.getPotionColor()).toBe('#ea580c');
    });

    it('should return slate for defense', () => {
      component.potionType = 'defense';
      expect(component.getPotionColor()).toBe('#64748b');
    });
  });

  describe('getResultMessage', () => {
    it('should return win message with potion type', () => {
      component.potionType = 'healing';
      component.lastResult = 'win';
      expect(component.getResultMessage()).toBe('+1 Healing!');
    });

    it('uses the shop short-name "Protection" for a defense win, not "Defense"', () => {
      // Regression: defense potions are sold as "Protection" in the shop, so a
      // "+1 Defense" win read as a phantom reward the player could not find.
      component.potionType = 'defense';
      expect(component.potionLabel).toBe('Protection');
      component.lastResult = 'win';
      expect(component.getResultMessage()).toBe('+1 Protection!');
    });

    it('should return "Wrong!" for lose', () => {
      component.lastResult = 'lose';
      expect(component.getResultMessage()).toBe('Wrong!');
    });

    it('should return "Too slow!" for timeout', () => {
      component.lastResult = 'timeout';
      expect(component.getResultMessage()).toBe('Too slow!');
    });

    it('should return empty string for null result', () => {
      component.lastResult = null;
      expect(component.getResultMessage()).toBe('');
    });
  });

  describe('isActive behavior', () => {
    it('should not start when isActive is false', fakeAsync(() => {
      component.isActive = false;
      component.start();

      expect(component.phase).toBe('idle');
      expect(component['running']).toBeFalse();
      tick(500);
      expect(component.phase).toBe('idle');
    }));

    it('stops an active round when the parent pauses the game', () => {
      fixture.componentRef.setInput('isActive', true);
      fixture.detectChanges();
      expect(component.phase).toBe('reveal');

      fixture.componentRef.setInput('isActive', false);
      fixture.detectChanges();

      expect(component.phase).toBe('idle');
      expect(component['running']).toBeFalse();
      expect(component.lastResult).toBeNull();
    });
  });

  describe('Result element rendering', () => {
    it('should not render .shell-result element when lastResult is null', () => {
      component.lastResult = null;
      component.phase = 'idle';
      fixture.detectChanges();

      const resultEl: HTMLElement | null = fixture.nativeElement.querySelector('.shell-result');
      expect(resultEl).toBeNull();
    });

    it('should render .shell-result with lose message when lastResult is lose', () => {
      component.lastResult = 'lose';
      component.phase = 'result';
      fixture.detectChanges();

      const resultEl: HTMLElement | null = fixture.nativeElement.querySelector('.shell-result');
      expect(resultEl).not.toBeNull();
      expect(resultEl?.textContent?.trim()).toBe('Wrong!');
    });

    it('should render .shell-result with timeout message when lastResult is timeout', () => {
      component.lastResult = 'timeout';
      component.phase = 'result';
      fixture.detectChanges();

      const resultEl: HTMLElement | null = fixture.nativeElement.querySelector('.shell-result');
      expect(resultEl).not.toBeNull();
      expect(resultEl?.textContent?.trim()).toBe('Too slow!');
    });

    it('should render .shell-result with win message and .win class when lastResult is win', () => {
      component.potionType = 'luck';
      component.lastResult = 'win';
      component.phase = 'result';
      fixture.detectChanges();

      const resultEl: HTMLElement | null = fixture.nativeElement.querySelector('.shell-result');
      expect(resultEl).not.toBeNull();
      expect(resultEl?.textContent?.trim()).toBe('+1 Luck!');
      expect(resultEl?.classList.contains('win')).toBeTrue();
    });

    it('should not apply .win class to .shell-result on lose', () => {
      component.lastResult = 'lose';
      component.phase = 'result';
      fixture.detectChanges();

      const resultEl: HTMLElement | null = fixture.nativeElement.querySelector('.shell-result');
      expect(resultEl?.classList.contains('win')).toBeFalse();
    });

    it('should show .shell-result during pick phase immediately after selection', () => {
      component.isActive = true;
      component.start();
      for (let i = 0; i < 10; i++) {
        component['tick']();
      }
      component.potionPosition = 2;
      component.selectHat(0); // Wrong hat = lose
      fixture.detectChanges();

      const resultEl: HTMLElement | null = fixture.nativeElement.querySelector('.shell-result');
      expect(resultEl).not.toBeNull();
      expect(resultEl?.textContent?.trim()).toBe('Wrong!');
    });
  });

  describe('Shell title visibility', () => {
    it('should render .shell-title element in the DOM', () => {
      fixture.detectChanges();
      const titleEl: HTMLElement | null = fixture.nativeElement.querySelector('.shell-title');
      expect(titleEl).not.toBeNull();
      expect(titleEl?.textContent).toContain('Stock Rescue');
    });

    it('should render .shell-title-hint during idle phase', () => {
      component.phase = 'idle';
      fixture.detectChanges();

      const hintEl: HTMLElement | null = fixture.nativeElement.querySelector('.shell-title-hint');
      expect(hintEl).not.toBeNull();
      expect(hintEl?.textContent).toContain('Track Healing');
    });

    it('should render .shell-title-hint during pick phase', () => {
      component.phase = 'pick';
      component.lastResult = null;
      fixture.detectChanges();

      const hintEl: HTMLElement | null = fixture.nativeElement.querySelector('.shell-title-hint');
      expect(hintEl).not.toBeNull();
    });

    it('should not render .shell-title-hint during shuffle phase', () => {
      component.phase = 'shuffle';
      fixture.detectChanges();

      const hintEl: HTMLElement | null = fixture.nativeElement.querySelector('.shell-title-hint');
      expect(hintEl).toBeNull();
    });

    it('should not render .shell-title-hint during reveal phase', () => {
      component.phase = 'reveal';
      fixture.detectChanges();

      const hintEl: HTMLElement | null = fixture.nativeElement.querySelector('.shell-title-hint');
      expect(hintEl).toBeNull();
    });
  });
});
