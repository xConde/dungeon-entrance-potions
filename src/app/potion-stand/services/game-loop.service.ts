import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { interval, Subject, Subscription } from 'rxjs';

/**
 * GameLoopService - Core game loop orchestration
 *
 * Manages the main game interval and emits tick events that the component
 * subscribes to. This decouples timing logic from game logic.
 *
 * Tick Types (at 1x speed, 500ms base interval):
 * - gameTick: Every 2 ticks (1 second) - main game logic
 * - spawnTick: Every 12 ticks (6 seconds) - adventurer spawning
 * - dungeonTick: Every 4 ticks (2 seconds) - dungeon simulation
 */
@Injectable()
export class GameLoopService {
  private readonly destroyRef = inject(DestroyRef);

  // Tick event streams - component subscribes to these
  readonly gameTick$ = new Subject<void>();
  readonly spawnTick$ = new Subject<void>();
  readonly dungeonTick$ = new Subject<void>();

  // State signals (read via .isPaused() / .gameSpeed())
  private readonly _isPaused = signal(false);
  private readonly _gameSpeed = signal(1);

  get isPaused(): boolean {
    return this._isPaused();
  }
  get gameSpeed(): number {
    return this._gameSpeed();
  }

  // Internal state
  private tickCounter = 0;
  private loopSubscription: Subscription | null = null;
  private isRunning = false;

  // Performance monitoring
  private lastTickTime = 0;
  private slowTickCount = 0;
  private readonly SLOW_TICK_THRESHOLD_MS = 16; // 60fps frame budget

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stop();
      this.gameTick$.complete();
      this.spawnTick$.complete();
      this.dungeonTick$.complete();
    });
  }

  /**
   * Start the game loop
   * Safe to call multiple times - will not create duplicate intervals
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.tickCounter = 0;

    // Single fast interval - 500ms base tick
    this.loopSubscription = interval(500).subscribe(() => {
      this.processTick();
    });
  }

  /**
   * Stop the game loop
   */
  stop(): void {
    this.isRunning = false;
    this.loopSubscription?.unsubscribe();
    this.loopSubscription = null;
  }

  /**
   * Toggle pause state
   */
  togglePause(): void {
    this._isPaused.update((v) => !v);
  }

  /**
   * Set pause state directly
   */
  setPaused(paused: boolean): void {
    this._isPaused.set(paused);
  }

  /**
   * Cycle through game speeds: 1 → 2 → 3 → 1
   */
  cycleSpeed(): void {
    const current = this._gameSpeed();
    const next = current === 3 ? 1 : current + 1;
    this._gameSpeed.set(next);
  }

  /**
   * Set game speed directly
   */
  setSpeed(speed: number): void {
    if (speed >= 1 && speed <= 3) {
      this._gameSpeed.set(speed);
    }
  }

  /**
   * Reset tick counter (useful for day transitions)
   */
  resetTickCounter(): void {
    this.tickCounter = 0;
  }

  /**
   * Get performance stats for debugging
   */
  getPerformanceStats(): { slowTickCount: number; lastTickTime: number } {
    return {
      slowTickCount: this.slowTickCount,
      lastTickTime: this.lastTickTime,
    };
  }

  /**
   * Process a single tick iteration
   * Respects pause state and game speed
   */
  private processTick(): void {
    // Skip if paused
    if (this._isPaused()) return;

    const startTime = globalThis.performance.now();

    // Run gameSpeed iterations per real tick
    // This ensures 2x = twice as fast, 3x = three times as fast
    for (let i = 0; i < this._gameSpeed(); i++) {
      this.tickCounter++;

      // Game tick every 2 ticks (1 second at 1x)
      if (this.tickCounter % 2 === 0) {
        this.gameTick$.next();
      }

      // Spawn tick every 12 ticks (6 seconds at 1x)
      if (this.tickCounter % 12 === 0) {
        this.spawnTick$.next();
      }

      // Dungeon tick every 4 ticks (2 seconds at 1x)
      if (this.tickCounter % 4 === 0) {
        this.dungeonTick$.next();
      }
    }

    // Performance monitoring
    this.lastTickTime = globalThis.performance.now() - startTime;
    if (this.lastTickTime > this.SLOW_TICK_THRESHOLD_MS) {
      this.slowTickCount++;
    }
  }
}
