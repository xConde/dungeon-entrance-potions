import { TestBed } from '@angular/core/testing';
import { GamePhase, GamePhaseService } from './game-phase.service';

describe('GamePhaseService', () => {
  let service: GamePhaseService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GamePhaseService],
    });
    service = TestBed.inject(GamePhaseService);
  });

  // ============================================================
  // CREATION
  // ============================================================

  describe('Creation', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should start in playing phase', () => {
      expect(service.currentPhase()).toBe('playing');
    });
  });

  // ============================================================
  // VALID TRANSITIONS
  // ============================================================

  describe('Valid Transitions', () => {
    it('should allow playing -> day-summary', () => {
      const result = service.transition('day-summary');

      expect(result).toBe(true);
      expect(service.currentPhase()).toBe('day-summary');
    });

    it('should allow playing -> game-over', () => {
      const result = service.transition('game-over');

      expect(result).toBe(true);
      expect(service.currentPhase()).toBe('game-over');
    });

    it('should allow day-summary -> merchant', () => {
      service.transition('day-summary');
      const result = service.transition('merchant');

      expect(result).toBe(true);
      expect(service.currentPhase()).toBe('merchant');
    });

    it('should allow day-summary -> game-over', () => {
      service.transition('day-summary');
      const result = service.transition('game-over');

      expect(result).toBe(true);
      expect(service.currentPhase()).toBe('game-over');
    });

    it('should allow merchant -> playing', () => {
      service.transition('day-summary');
      service.transition('merchant');
      const result = service.transition('playing');

      expect(result).toBe(true);
      expect(service.currentPhase()).toBe('playing');
    });

    it('should allow merchant -> game-over', () => {
      service.transition('day-summary');
      service.transition('merchant');
      const result = service.transition('game-over');

      expect(result).toBe(true);
      expect(service.currentPhase()).toBe('game-over');
    });
  });

  // ============================================================
  // INVALID TRANSITIONS
  // ============================================================

  describe('Invalid Transitions', () => {
    it('should reject playing -> merchant (must go through day-summary)', () => {
      const result = service.transition('merchant');

      expect(result).toBe(false);
      expect(service.currentPhase()).toBe('playing');
    });

    it('should reject day-summary -> playing (must go through merchant)', () => {
      service.transition('day-summary');
      const result = service.transition('playing');

      expect(result).toBe(false);
      expect(service.currentPhase()).toBe('day-summary');
    });

    it('should reject merchant -> day-summary', () => {
      service.transition('day-summary');
      service.transition('merchant');
      const result = service.transition('day-summary');

      expect(result).toBe(false);
      expect(service.currentPhase()).toBe('merchant');
    });
  });

  // ============================================================
  // GAME-OVER IS TERMINAL
  // ============================================================

  describe('game-over is terminal', () => {
    it('should reject game-over -> playing', () => {
      service.transition('game-over');
      const result = service.transition('playing');

      expect(result).toBe(false);
      expect(service.currentPhase()).toBe('game-over');
    });

    it('should reject game-over -> merchant', () => {
      service.transition('game-over');
      const result = service.transition('merchant');

      expect(result).toBe(false);
      expect(service.currentPhase()).toBe('game-over');
    });

    it('should reject game-over -> day-summary', () => {
      service.transition('game-over');
      const result = service.transition('day-summary');

      expect(result).toBe(false);
      expect(service.currentPhase()).toBe('game-over');
    });

    it('should have no valid transitions from game-over', () => {
      service.transition('game-over');

      expect(service.canTransition('playing')).toBe(false);
      expect(service.canTransition('merchant')).toBe(false);
      expect(service.canTransition('day-summary')).toBe(false);
      // game-over -> game-over is a no-op, returns true
      expect(service.canTransition('game-over')).toBe(true);
    });
  });

  // ============================================================
  // canTransition()
  // ============================================================

  describe('canTransition()', () => {
    it('should return true for valid transitions', () => {
      expect(service.canTransition('day-summary')).toBe(true);
      expect(service.canTransition('game-over')).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(service.canTransition('merchant')).toBe(false);
    });

    it('should return true for same-phase (no-op)', () => {
      expect(service.canTransition('playing')).toBe(true);
    });

    it('should match transition() behavior', () => {
      // Every canTransition(x) === true means transition(x) succeeds
      const phases: GamePhase[] = ['playing', 'merchant', 'day-summary', 'game-over'];

      for (const targetPhase of phases) {
        // Fresh service for each check
        const freshService = TestBed.inject(GamePhaseService);
        const canDo = freshService.canTransition(targetPhase);
        const didDo = freshService.transition(targetPhase);
        expect(canDo).toBe(didDo);
      }
    });
  });

  // ============================================================
  // NO-OP TRANSITIONS
  // ============================================================

  describe('No-op Transitions', () => {
    it('should return true for playing -> playing', () => {
      const result = service.transition('playing');

      expect(result).toBe(true);
      expect(service.currentPhase()).toBe('playing');
    });

    it('should return true for day-summary -> day-summary', () => {
      service.transition('day-summary');
      const result = service.transition('day-summary');

      expect(result).toBe(true);
      expect(service.currentPhase()).toBe('day-summary');
    });

    it('should return true for merchant -> merchant', () => {
      service.transition('day-summary');
      service.transition('merchant');
      const result = service.transition('merchant');

      expect(result).toBe(true);
      expect(service.currentPhase()).toBe('merchant');
    });

    it('should return true for game-over -> game-over', () => {
      service.transition('game-over');
      const result = service.transition('game-over');

      expect(result).toBe(true);
      expect(service.currentPhase()).toBe('game-over');
    });
  });

  // ============================================================
  // onPhaseChange$
  // ============================================================

  describe('onPhaseChange$', () => {
    it('should emit correct from/to on valid transition', () => {
      const emissions: Array<{ from: GamePhase; to: GamePhase }> = [];
      service.onPhaseChange$.subscribe((change) => emissions.push(change));

      service.transition('day-summary');

      expect(emissions).toEqual([{ from: 'playing', to: 'day-summary' }]);
    });

    it('should emit multiple transitions', () => {
      const emissions: Array<{ from: GamePhase; to: GamePhase }> = [];
      service.onPhaseChange$.subscribe((change) => emissions.push(change));

      service.transition('day-summary');
      service.transition('merchant');
      service.transition('playing');

      expect(emissions).toEqual([
        { from: 'playing', to: 'day-summary' },
        { from: 'day-summary', to: 'merchant' },
        { from: 'merchant', to: 'playing' },
      ]);
    });

    it('should NOT emit on invalid transition', () => {
      const emissions: Array<{ from: GamePhase; to: GamePhase }> = [];
      service.onPhaseChange$.subscribe((change) => emissions.push(change));

      service.transition('merchant'); // invalid from playing

      expect(emissions).toEqual([]);
    });

    it('should NOT emit on no-op transition', () => {
      const emissions: Array<{ from: GamePhase; to: GamePhase }> = [];
      service.onPhaseChange$.subscribe((change) => emissions.push(change));

      service.transition('playing'); // no-op

      expect(emissions).toEqual([]);
    });

    it('should emit on reset() when phase changes', () => {
      service.transition('day-summary');

      const emissions: Array<{ from: GamePhase; to: GamePhase }> = [];
      service.onPhaseChange$.subscribe((change) => emissions.push(change));

      service.reset();

      expect(emissions).toEqual([{ from: 'day-summary', to: 'playing' }]);
    });
  });

  // ============================================================
  // reset()
  // ============================================================

  describe('reset()', () => {
    it('should return to playing from day-summary', () => {
      service.transition('day-summary');

      service.reset();

      expect(service.currentPhase()).toBe('playing');
    });

    it('should return to playing from merchant', () => {
      service.transition('day-summary');
      service.transition('merchant');

      service.reset();

      expect(service.currentPhase()).toBe('playing');
    });

    it('should return to playing from game-over (bypasses terminal restriction)', () => {
      service.transition('game-over');

      service.reset();

      expect(service.currentPhase()).toBe('playing');
    });

    it('should be a no-op when already in playing phase', () => {
      const emissions: Array<{ from: GamePhase; to: GamePhase }> = [];
      service.onPhaseChange$.subscribe((change) => emissions.push(change));

      service.reset();

      expect(service.currentPhase()).toBe('playing');
      expect(emissions).toEqual([]); // No emission since phase didn't change
    });
  });

  // ============================================================
  // FULL LIFECYCLE
  // ============================================================

  describe('Full lifecycle', () => {
    it('should support a complete day cycle: playing -> day-summary -> merchant -> playing', () => {
      expect(service.currentPhase()).toBe('playing');

      expect(service.transition('day-summary')).toBe(true);
      expect(service.currentPhase()).toBe('day-summary');

      expect(service.transition('merchant')).toBe(true);
      expect(service.currentPhase()).toBe('merchant');

      expect(service.transition('playing')).toBe(true);
      expect(service.currentPhase()).toBe('playing');
    });

    it('should support bankruptcy during gameplay: playing -> game-over', () => {
      expect(service.transition('game-over')).toBe(true);
      expect(service.currentPhase()).toBe('game-over');

      // Terminal - no way out except reset
      expect(service.transition('playing')).toBe(false);
    });

    it('should support game-over after day summary: playing -> day-summary -> game-over', () => {
      service.transition('day-summary');
      expect(service.transition('game-over')).toBe(true);
      expect(service.currentPhase()).toBe('game-over');
    });
  });
});
