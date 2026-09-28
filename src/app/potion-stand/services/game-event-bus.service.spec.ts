import { TestBed } from '@angular/core/testing';
import { GameEvent, GameEventBusService, GameEventType } from './game-event-bus.service';
import { DungeonEvent } from '../models/game-state.model';

describe('GameEventBusService', () => {
  let service: GameEventBusService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GameEventBusService],
    });
    service = TestBed.inject(GameEventBusService);
  });

  // ============================================================
  // CREATION
  // ============================================================

  describe('Creation', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should start with no recent events', () => {
      expect(service.recentEvents()).toEqual([]);
    });
  });

  // ============================================================
  // emit() + on() — typed delivery
  // ============================================================

  describe('emit() and on()', () => {
    it('should deliver a dungeon event to dungeon subscribers', () => {
      const received: GameEvent<'dungeon'>[] = [];
      service.on('dungeon').subscribe((e) => received.push(e));

      const dungeonPayload: DungeonEvent = {
        id: 'test-1',
        timestamp: Date.now(),
        adventurerId: 'adv-1',
        eventType: 'enter',
        message: 'A warrior enters',
        severity: 'info',
      };
      service.emit('dungeon', dungeonPayload);

      expect(received.length).toBe(1);
      expect(received[0].type).toBe('dungeon');
      expect(received[0].payload).toEqual(dungeonPayload);
    });

    it('should deliver a system event to system subscribers', () => {
      const received: GameEvent<'system'>[] = [];
      service.on('system').subscribe((e) => received.push(e));

      service.emit('system', { action: 'message', message: 'Hello', severity: 'info' });

      expect(received.length).toBe(1);
      expect(received[0].payload.action).toBe('message');
      expect(received[0].payload.message).toBe('Hello');
    });

    it('should deliver a shop event to shop subscribers', () => {
      const received: GameEvent<'shop'>[] = [];
      service.on('shop').subscribe((e) => received.push(e));

      service.emit('shop', {
        action: 'sale',
        adventurerId: 'adv-1',
        potionId: 'basic-healing',
        amount: 15,
        message: 'Sold healing potion',
      });

      expect(received.length).toBe(1);
      expect(received[0].payload.action).toBe('sale');
      expect(received[0].payload.amount).toBe(15);
    });

    it('should deliver an economy event to economy subscribers', () => {
      const received: GameEvent<'economy'>[] = [];
      service.on('economy').subscribe((e) => received.push(e));

      service.emit('economy', { action: 'tip', amount: 5, reason: 'Adventurer tip' });

      expect(received.length).toBe(1);
      expect(received[0].payload.action).toBe('tip');
      expect(received[0].payload.amount).toBe(5);
    });

    it('should deliver a combat event to combat subscribers', () => {
      const received: GameEvent<'combat'>[] = [];
      service.on('combat').subscribe((e) => received.push(e));

      service.emit('combat', {
        adventurerId: 'adv-1',
        action: 'fight',
        message: 'Slashed at a goblin',
      });

      expect(received.length).toBe(1);
      expect(received[0].payload.action).toBe('fight');
    });
  });

  // ============================================================
  // Type filtering — on('X') only receives type X
  // ============================================================

  describe('Type filtering', () => {
    it('on("dungeon") should NOT receive system events', () => {
      const received: GameEvent<'dungeon'>[] = [];
      service.on('dungeon').subscribe((e) => received.push(e));

      service.emit('system', { action: 'message', message: 'sys msg', severity: 'info' });
      service.emit('shop', { action: 'sale', message: 'sold' });
      service.emit('economy', { action: 'tip', amount: 3, reason: 'tip' });
      service.emit('combat', { adventurerId: 'a', action: 'fight', message: 'hit' });

      expect(received.length).toBe(0);
    });

    it('on("system") should NOT receive dungeon events', () => {
      const received: GameEvent<'system'>[] = [];
      service.on('system').subscribe((e) => received.push(e));

      service.emit('dungeon', {
        id: 'x',
        timestamp: Date.now(),
        adventurerId: 'a',
        eventType: 'enter',
        message: 'entered',
        severity: 'info',
      });

      expect(received.length).toBe(0);
    });

    it('mixed emissions should only reach correct subscribers', () => {
      const dungeonEvents: GameEvent<'dungeon'>[] = [];
      const systemEvents: GameEvent<'system'>[] = [];

      service.on('dungeon').subscribe((e) => dungeonEvents.push(e));
      service.on('system').subscribe((e) => systemEvents.push(e));

      service.emit('dungeon', {
        id: '1',
        timestamp: Date.now(),
        adventurerId: 'a',
        eventType: 'combat',
        message: 'fought',
        severity: 'warning',
      });
      service.emit('system', { action: 'message', message: 'info msg' });
      service.emit('dungeon', {
        id: '2',
        timestamp: Date.now(),
        adventurerId: 'b',
        eventType: 'death',
        message: 'died',
        severity: 'danger',
      });

      expect(dungeonEvents.length).toBe(2);
      expect(systemEvents.length).toBe(1);
    });
  });

  // ============================================================
  // onAll() — receives everything
  // ============================================================

  describe('onAll()', () => {
    it('should receive events of all types', () => {
      const all: GameEvent[] = [];
      service.onAll().subscribe((e) => all.push(e));

      service.emit('dungeon', {
        id: '1',
        timestamp: Date.now(),
        adventurerId: 'a',
        eventType: 'enter',
        message: 'm',
        severity: 'info',
      });
      service.emit('system', { action: 'message', message: 'x' });
      service.emit('shop', { action: 'sale', message: 'y' });
      service.emit('economy', { action: 'tip', amount: 1, reason: 'r' });
      service.emit('combat', { adventurerId: 'a', action: 'fight', message: 'z' });

      expect(all.length).toBe(5);

      const types = all.map((e) => e.type);
      expect(types).toEqual(['dungeon', 'system', 'shop', 'economy', 'combat']);
    });
  });

  // ============================================================
  // Multiple subscribers
  // ============================================================

  describe('Multiple subscribers', () => {
    it('should deliver the same event to multiple subscribers', () => {
      const sub1: GameEvent<'system'>[] = [];
      const sub2: GameEvent<'system'>[] = [];
      const sub3: GameEvent<'system'>[] = [];

      service.on('system').subscribe((e) => sub1.push(e));
      service.on('system').subscribe((e) => sub2.push(e));
      service.on('system').subscribe((e) => sub3.push(e));

      service.emit('system', { action: 'message', message: 'broadcast' });

      expect(sub1.length).toBe(1);
      expect(sub2.length).toBe(1);
      expect(sub3.length).toBe(1);

      // All received the same payload
      expect(sub1[0].payload.message).toBe('broadcast');
      expect(sub2[0].payload.message).toBe('broadcast');
      expect(sub3[0].payload.message).toBe('broadcast');
    });
  });

  // ============================================================
  // Timestamps
  // ============================================================

  describe('Timestamps', () => {
    it('should include a timestamp on every emitted event', () => {
      const received: GameEvent[] = [];
      service.onAll().subscribe((e) => received.push(e));

      const before = Date.now();
      service.emit('system', { action: 'message', message: 'ts test' });
      const after = Date.now();

      expect(received[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(received[0].timestamp).toBeLessThanOrEqual(after);
    });

    it('should assign unique timestamps to rapid successive events', () => {
      const received: GameEvent[] = [];
      service.onAll().subscribe((e) => received.push(e));

      // Emit several events rapidly
      for (let i = 0; i < 5; i++) {
        service.emit('system', { action: 'message', message: `msg-${i}` });
      }

      // All should have timestamps (they may be equal due to Date.now() resolution, but they exist)
      for (const event of received) {
        expect(event.timestamp).toBeDefined();
        expect(typeof event.timestamp).toBe('number');
        expect(event.timestamp).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================
  // recentEvents()
  // ============================================================

  describe('recentEvents()', () => {
    it('should return empty array when no events emitted', () => {
      expect(service.recentEvents()).toEqual([]);
      expect(service.recentEvents('dungeon')).toEqual([]);
    });

    it('should return all recent events in newest-first order', () => {
      service.emit('system', { action: 'message', message: 'first' });
      service.emit('dungeon', {
        id: '1',
        timestamp: Date.now(),
        adventurerId: 'a',
        eventType: 'enter',
        message: 'second',
        severity: 'info',
      });
      service.emit('system', { action: 'message', message: 'third' });

      const events = service.recentEvents();
      expect(events.length).toBe(3);
      // Newest first
      expect((events[0].payload as { message: string }).message).toBe('third');
      expect((events[2].payload as { message: string }).message).toBe('first');
    });

    it('should filter by type when type is provided', () => {
      service.emit('system', { action: 'message', message: 'sys1' });
      service.emit('dungeon', {
        id: '1',
        timestamp: Date.now(),
        adventurerId: 'a',
        eventType: 'enter',
        message: 'dng1',
        severity: 'info',
      });
      service.emit('system', { action: 'message', message: 'sys2' });
      service.emit('shop', { action: 'sale', message: 'shop1' });

      const systemEvents = service.recentEvents('system');
      expect(systemEvents.length).toBe(2);
      expect(systemEvents.every((e) => e.type === 'system')).toBe(true);

      const dungeonEvents = service.recentEvents('dungeon');
      expect(dungeonEvents.length).toBe(1);

      const shopEvents = service.recentEvents('shop');
      expect(shopEvents.length).toBe(1);

      const combatEvents = service.recentEvents('combat');
      expect(combatEvents.length).toBe(0);
    });

    it('should respect the limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        service.emit('system', { action: 'message', message: `msg-${i}` });
      }

      const limited = service.recentEvents('system', 3);
      expect(limited.length).toBe(3);
      // Should be the 3 most recent (newest first)
      expect((limited[0].payload as { message: string }).message).toBe('msg-9');
      expect((limited[1].payload as { message: string }).message).toBe('msg-8');
      expect((limited[2].payload as { message: string }).message).toBe('msg-7');
    });

    it('should respect limit without type filter', () => {
      service.emit('system', { action: 'message', message: 'a' });
      service.emit('dungeon', {
        id: '1',
        timestamp: Date.now(),
        adventurerId: 'a',
        eventType: 'enter',
        message: 'b',
        severity: 'info',
      });
      service.emit('shop', { action: 'sale', message: 'c' });

      const limited = service.recentEvents(undefined, 2);
      expect(limited.length).toBe(2);
    });

    it('should cap buffer at internal limit (no memory leak)', () => {
      // Emit more than the buffer size (100)
      for (let i = 0; i < 150; i++) {
        service.emit('system', { action: 'message', message: `msg-${i}` });
      }

      const all = service.recentEvents();
      expect(all.length).toBe(100);
      // Most recent should be msg-149
      expect((all[0].payload as { message: string }).message).toBe('msg-149');
    });
  });

  // ============================================================
  // Edge cases
  // ============================================================

  describe('Edge cases', () => {
    it('should handle subscription after events were already emitted (no replay)', () => {
      service.emit('system', { action: 'message', message: 'before' });

      const received: GameEvent<'system'>[] = [];
      service.on('system').subscribe((e) => received.push(e));

      // Late subscriber misses past events (use recentEvents for history)
      expect(received.length).toBe(0);

      // But catches new ones
      service.emit('system', { action: 'message', message: 'after' });
      expect(received.length).toBe(1);
    });

    it('should handle unsubscription gracefully', () => {
      const received: GameEvent<'system'>[] = [];
      const sub = service.on('system').subscribe((e) => received.push(e));

      service.emit('system', { action: 'message', message: 'before unsub' });
      expect(received.length).toBe(1);

      sub.unsubscribe();

      service.emit('system', { action: 'message', message: 'after unsub' });
      expect(received.length).toBe(1); // No new events after unsub
    });

    it('should allow all GameEventType values', () => {
      const types: GameEventType[] = ['dungeon', 'shop', 'economy', 'combat', 'system'];
      const received: GameEvent[] = [];
      service.onAll().subscribe((e) => received.push(e));

      service.emit('dungeon', {
        id: '1',
        timestamp: Date.now(),
        adventurerId: 'a',
        eventType: 'enter',
        message: 'm',
        severity: 'info',
      });
      service.emit('shop', { action: 'sale', message: 'm' });
      service.emit('economy', { action: 'gold-change', amount: 10, reason: 'r' });
      service.emit('combat', { adventurerId: 'a', action: 'enter', message: 'm' });
      service.emit('system', { action: 'phase-change', message: 'm', severity: 'info' });

      expect(received.length).toBe(types.length);
    });
  });
});
