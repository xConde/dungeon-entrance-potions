import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import { DungeonEvent } from '../models/game-state.model';

// ---------------------------------------------------------------------------
// Payload types per event category
// ---------------------------------------------------------------------------

export type ShopEventAction = 'sale' | 'refusal' | 'timeout' | 'restock';

export interface ShopEventPayload {
  action: ShopEventAction;
  adventurerId?: string;
  potionId?: string;
  amount?: number;
  message: string;
}

export type EconomyEventAction = 'gold-change' | 'reputation-change' | 'tip' | 'overhead' | 'fine';

export interface EconomyEventPayload {
  action: EconomyEventAction;
  amount: number;
  reason: string;
}

export type CombatEventAction =
  | 'enter'
  | 'explore'
  | 'fight'
  | 'flee'
  | 'survive'
  | 'die'
  | 'loot'
  | 'boss-defeat'
  | 'combo';

export interface CombatEventPayload {
  adventurerId: string;
  action: CombatEventAction;
  message: string;
  data?: Record<string, unknown>;
}

export type SystemEventAction = 'message' | 'phase-change' | 'save' | 'error';
export type SystemSeverity = 'info' | 'success' | 'warning' | 'error';

export interface SystemEventPayload {
  action: SystemEventAction;
  message: string;
  severity?: SystemSeverity;
}

// ---------------------------------------------------------------------------
// Discriminated union mapping event type -> payload
// ---------------------------------------------------------------------------

export type GameEventType = 'dungeon' | 'shop' | 'economy' | 'combat' | 'system';

/** Maps each event type string to its concrete payload shape. */
export interface GameEventPayloadMap {
  dungeon: DungeonEvent;
  shop: ShopEventPayload;
  economy: EconomyEventPayload;
  combat: CombatEventPayload;
  system: SystemEventPayload;
}

// ---------------------------------------------------------------------------
// The event wrapper
// ---------------------------------------------------------------------------

export interface GameEvent<T extends GameEventType = GameEventType> {
  type: T;
  payload: GameEventPayloadMap[T];
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** Default cap for the recent-events ring buffer per category. */
const DEFAULT_BUFFER_SIZE = 100;

/**
 * Typed event bus for Potion Stand game events.
 *
 * Central Subject fans out to per-type filtered observables.
 * NOT providedIn root — scoped to PotionStandComponent providers array.
 */
@Injectable()
export class GameEventBusService {
  private readonly subject = new Subject<GameEvent>();

  /** Ring buffer of recent events, newest first. */
  private readonly buffer: GameEvent[] = [];
  private readonly bufferSize = DEFAULT_BUFFER_SIZE;

  // -----------------------------------------------------------------------
  // Emit
  // -----------------------------------------------------------------------

  /**
   * Emit a typed game event.
   *
   * ```ts
   * eventBus.emit('system', { action: 'message', message: 'Hello', severity: 'info' });
   * ```
   */
  emit<T extends GameEventType>(type: T, payload: GameEventPayloadMap[T]): void {
    const event: GameEvent<T> = {
      type,
      payload,
      timestamp: Date.now(),
    };

    // Buffer management (unshift + trim)
    this.buffer.unshift(event as GameEvent);
    if (this.buffer.length > this.bufferSize) {
      this.buffer.length = this.bufferSize;
    }

    this.subject.next(event as GameEvent);
  }

  // -----------------------------------------------------------------------
  // Subscribe
  // -----------------------------------------------------------------------

  /**
   * Subscribe to events of a specific type.
   *
   * ```ts
   * eventBus.on('dungeon').subscribe(e => { ... });
   * ```
   */
  on<T extends GameEventType>(type: T): Observable<GameEvent<T>> {
    return this.subject.asObservable().pipe(filter((event): event is GameEvent<T> => event.type === type));
  }

  /** Subscribe to ALL events regardless of type. */
  onAll(): Observable<GameEvent> {
    return this.subject.asObservable();
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  /**
   * Get recent buffered events, optionally filtered by type.
   * Returns newest-first, capped at `limit`.
   */
  recentEvents<T extends GameEventType>(type?: T, limit?: number): GameEvent<T>[] {
    let events: GameEvent[];

    if (type !== undefined) {
      events = this.buffer.filter((e): e is GameEvent<T> => e.type === type);
    } else {
      events = this.buffer;
    }

    if (limit !== undefined && limit > 0) {
      events = events.slice(0, limit);
    }

    return events as GameEvent<T>[];
  }
}
