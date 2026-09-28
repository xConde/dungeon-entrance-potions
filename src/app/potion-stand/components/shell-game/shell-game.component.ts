import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, Subject, takeUntil } from 'rxjs';
import { SHELL_GAME } from '../../config/game-config';
import { PotionType, ShellGamePhase, ShellGameReward } from '../../potion-stand.model';
import { GameRngService } from '../../services/game-rng.service';

// Re-export for backwards compatibility
export { PotionType, ShellGamePhase } from '../../potion-stand.model';

@Component({
  selector: 'app-shell-game',
  templateUrl: './shell-game.component.html',
  styleUrls: ['./shell-game.component.scss'],
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellGameComponent implements OnInit, OnChanges, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly rng = inject(GameRngService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stop$ = new Subject<void>();

  /** Whether the game should be running (paused when parent game is not in 'playing' phase) */
  @Input() isActive = false;

  /** The stock type the current customer would benefit from most. */
  @Input() rewardType: PotionType | null = null;

  /** Emitted when player wins one or more potions. */
  @Output() potionWon = new EventEmitter<ShellGameReward>();

  // Shell Game State — backed by setters so direct assignment (e.g. in tests)
  // triggers markForCheck and keeps OnPush in sync.
  private _phase: ShellGamePhase = 'idle';
  get phase(): ShellGamePhase {
    return this._phase;
  }
  set phase(v: ShellGamePhase) {
    this._phase = v;
    this.cdr.markForCheck();
  }

  private _lastResult: 'win' | 'lose' | 'timeout' | null = null;
  get lastResult(): 'win' | 'lose' | 'timeout' | null {
    return this._lastResult;
  }
  set lastResult(v: 'win' | 'lose' | 'timeout' | null) {
    this._lastResult = v;
    this.cdr.markForCheck();
  }

  potionType: PotionType = 'healing';

  /**
   * Display labels keyed by potion type. The shell game must use the SAME
   * short name the shop shows, otherwise a win reads as a potion that "isn't
   * there" — e.g. `defense` is sold as "Protection", so "+1 Defense" looked
   * like a phantom reward. Keep this in sync with the shop's getShortName.
   */
  private static readonly POTION_LABELS: Record<PotionType, string> = {
    healing: 'Healing',
    strength: 'Strength',
    defense: 'Protection',
    speed: 'Speed',
    luck: 'Luck',
  };

  /** Player-facing short name for the current shell potion. */
  get potionLabel(): string {
    return ShellGameComponent.POTION_LABELS[this.potionType];
  }

  potionPosition = 1; // Which hat (0, 1, or 2) has the potion
  hatPositions = [0, 1, 2]; // Display order of hats
  selectedHat: number | null = null;
  pickTimer = Math.ceil(SHELL_GAME.PICK_TICKS / 2);
  winStreak = 0;
  lastRewardQuantity = 1;

  private running = false;
  private phaseTimer = 0; // Ticks remaining in current phase
  private shuffleCount = 0; // Shuffles performed in current round

  ngOnInit(): void {
    // Auto-start if already active on init
    if (this.isActive) {
      this.start();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Auto-start/stop when isActive changes
    if (changes['isActive']) {
      if (this.isActive && !this.running) {
        this.start();
      } else if (!this.isActive && this.running) {
        this.stop();
      }
    }
  }

  ngOnDestroy(): void {
    this.stop();
  }

  /** Start the shell game loop - runs on 500ms interval */
  start(): void {
    if (this.running || !this.isActive) return;
    this.running = true;

    // Initialize first round
    this.initRound();

    // Single interval drives all state transitions
    interval(500)
      .pipe(takeUntil(this.stop$), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.isActive) return;
        this.tick();
      });
  }

  /** Stop the shell game */
  stop(): void {
    this.stop$.next();
    this.running = false;
    this.selectedHat = null;
    this.lastResult = null;
    this.phase = 'idle';
  }

  /** Initialize a new shell game round */
  private initRound(): void {
    this.selectedHat = null;
    this.lastResult = null;
    this.hatPositions = [0, 1, 2];
    this.shuffleCount = 0;

    // The side game now rescues stock that matters to the active sale. It only
    // falls back to a random type when there is no customer in the shop.
    const potionTypes: PotionType[] = ['healing', 'strength', 'defense', 'speed', 'luck'];
    this.potionType = this.rewardType ?? this.rng.pick(potionTypes);

    // Pick random starting position (which hatIndex has the potion)
    this.potionPosition = this.rng.range(0, 2);

    // A full round is intentionally brisk: 1.5s reveal, 0.5s cover, three
    // one-second shuffles, then a four-second decision window.
    this.phase = 'reveal';
    this.phaseTimer = SHELL_GAME.REVEAL_TICKS;
    this.cdr.markForCheck();
  }

  /** Shell game tick - called every 500ms, drives state machine */
  private tick(): void {
    this.phaseTimer--;

    switch (this.phase) {
      case 'reveal':
        if (this.phaseTimer <= 0) {
          this.phase = 'cover';
          this.phaseTimer = SHELL_GAME.COVER_TICKS;
        }
        break;

      case 'cover':
        if (this.phaseTimer <= 0) {
          this.phase = 'shuffle';
          this.phaseTimer = SHELL_GAME.SHUFFLE_INTERVAL_TICKS;
          this.shuffleCount = 0;
        }
        break;

      case 'shuffle':
        if (this.phaseTimer <= 0) {
          this.performShuffle();
          this.shuffleCount++;

          if (this.shuffleCount >= SHELL_GAME.SHUFFLE_COUNT) {
            // Done shuffling, start pick phase
            this.phase = 'pick';
            this.pickTimer = Math.ceil(SHELL_GAME.PICK_TICKS / 2);
            this.phaseTimer = SHELL_GAME.PICK_TICKS;
          } else {
            this.phaseTimer = SHELL_GAME.SHUFFLE_INTERVAL_TICKS;
          }
        }
        break;

      case 'pick':
        // Update countdown display every second (2 ticks)
        if (this.phaseTimer % 2 === 0 && this.pickTimer > 0) {
          this.pickTimer = Math.floor(this.phaseTimer / 2);
        }

        if (this.phaseTimer <= 0) {
          this.resolve();
        }
        break;

      case 'result':
        // 2s result display, then restart
        if (this.phaseTimer <= 0) {
          this.initRound();
        }
        break;
    }

    this.cdr.markForCheck();
  }

  /** Perform a single shuffle swap */
  private performShuffle(): void {
    // Swap two random adjacent hat positions (visual only)
    const swap1 = this.rng.range(0, 1); // 0 or 1
    const swap2 = swap1 + 1;

    // Swap visual positions in the array
    const temp = this.hatPositions[swap1];
    this.hatPositions[swap1] = this.hatPositions[swap2];
    this.hatPositions[swap2] = temp;

    // NOTE: potionPosition stays the same - potion moves with its hat
  }

  /** Handle player selecting a hat — resolves the round immediately. */
  selectHat(hatIndex: number): void {
    if (this.phase !== 'pick') return;
    if (this.selectedHat !== null) return; // Already selected

    this.selectedHat = hatIndex;
    this.lastResult = hatIndex === this.potionPosition ? 'win' : 'lose';
    // Resolve now rather than waiting out the pick timer. Previously the potion
    // was only awarded when the 5s timer expired, so a win didn't stock the shop
    // until seconds after the player picked — it read as "the win did nothing".
    this.resolve();
  }

  /** Resolve the shell game round - called on pick, or when the pick timer expires (timeout). */
  private resolve(): void {
    // If player didn't select, it's a timeout
    if (this.selectedHat === null) {
      this.lastResult = 'timeout';
    }

    this.phase = 'result';
    this.phaseTimer = SHELL_GAME.RESULT_TICKS;

    // Award potion on win
    if (this.lastResult === 'win') {
      this.winStreak++;
      this.lastRewardQuantity = this.winStreak % SHELL_GAME.DOUBLE_REWARD_STREAK === 0 ? 2 : 1;
      this.potionWon.emit({ potionType: this.potionType, quantity: this.lastRewardQuantity });
    } else {
      this.winStreak = 0;
      this.lastRewardQuantity = 1;
    }

    this.cdr.markForCheck();
  }

  /** Get the color for the current shell game potion */
  getPotionColor(): string {
    switch (this.potionType) {
      case 'healing':
        return '#dc2626'; // Red
      case 'strength':
        return '#ea580c'; // Orange
      case 'defense':
        return '#64748b'; // Slate
      case 'speed':
        return '#06b6d4'; // Cyan
      case 'luck':
        return '#a855f7'; // Purple
      default:
        return '#64748b'; // Fallback slate
    }
  }

  /** Get result message for shell game */
  getResultMessage(): string {
    switch (this.lastResult) {
      case 'win':
        return `+${this.lastRewardQuantity} ${this.potionLabel}!`;
      case 'lose':
        return 'Wrong!';
      case 'timeout':
        return 'Too slow!';
      default:
        return '';
    }
  }

  /** Number of consecutive wins still needed to trigger the next double reward. */
  get winsUntilDouble(): number {
    const remainder = this.winStreak % SHELL_GAME.DOUBLE_REWARD_STREAK;
    return remainder === 0 ? SHELL_GAME.DOUBLE_REWARD_STREAK : SHELL_GAME.DOUBLE_REWARD_STREAK - remainder;
  }
}
