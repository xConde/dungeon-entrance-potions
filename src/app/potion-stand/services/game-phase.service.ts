import { Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable, Subject } from 'rxjs';

/**
 * Game phase states for Potion Stand. These are mutually exclusive.
 *
 * - playing:     Normal gameplay (customers, potions, dungeon)
 * - day-summary: End of day report
 * - merchant:    Morning merchant visit (buy supplies before day starts)
 * - game-over:   Victory or bankruptcy (terminal state)
 */
export type GamePhase = 'playing' | 'merchant' | 'day-summary' | 'game-over';

/** Valid transition table. Each key lists the phases it can transition TO. */
const VALID_TRANSITIONS: Readonly<Record<GamePhase, readonly GamePhase[]>> = {
  playing: ['day-summary', 'game-over'],
  'day-summary': ['merchant', 'game-over'],
  merchant: ['playing', 'game-over'],
  'game-over': [],
};

/** Initial phase for a new game */
const INITIAL_PHASE: GamePhase = 'playing';

/**
 * Manages game phase as a finite state machine with validated transitions.
 *
 * Responsibilities:
 * - Single source of truth for game phase
 * - Validates all transitions (rejects invalid ones, logs warning)
 * - Provides both signal and observable APIs for phase reads
 * - Emits structured phase change events
 *
 * NOT providedIn root -- provided in PotionStandComponent providers array.
 */
@Injectable()
export class GamePhaseService {
  /** Current phase as an Angular signal */
  readonly currentPhase = signal<GamePhase>(INITIAL_PHASE);

  /** Current phase as an RxJS observable (derived from signal) */
  readonly phase$: Observable<GamePhase> = toObservable(this.currentPhase);

  /** Emits on every successful transition with from/to pair */
  private readonly phaseChangeSubject = new Subject<{ from: GamePhase; to: GamePhase }>();
  readonly onPhaseChange$: Observable<{ from: GamePhase; to: GamePhase }> = this.phaseChangeSubject.asObservable();

  /**
   * Check whether a transition from the current phase to `to` is valid,
   * without executing it.
   */
  canTransition(to: GamePhase): boolean {
    const from = this.currentPhase();
    if (from === to) return true;
    return VALID_TRANSITIONS[from].includes(to);
  }

  /**
   * Attempt a phase transition. Returns true if successful, false if invalid.
   * Invalid transitions log a warning but do not throw.
   */
  transition(to: GamePhase): boolean {
    const from = this.currentPhase();
    if (from === to) return true; // No-op, already there

    const allowed = VALID_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      if (window.debugLogBridge) {
        window.debugLogBridge.log(`Invalid phase transition: ${from} -> ${to}`, 'error', {
          source: 'game_phase_service',
          from,
          to,
          allowed: [...allowed],
        });
      }
      return false;
    }

    this.currentPhase.set(to);
    this.phaseChangeSubject.next({ from, to });
    return true;
  }

  /**
   * Force reset to initial phase. Bypasses transition validation.
   * Use for game restart / error recovery.
   */
  reset(): void {
    const from = this.currentPhase();
    if (from !== INITIAL_PHASE) {
      this.currentPhase.set(INITIAL_PHASE);
      this.phaseChangeSubject.next({ from, to: INITIAL_PHASE });
    }
  }
}
