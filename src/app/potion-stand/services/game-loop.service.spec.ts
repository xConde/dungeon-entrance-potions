import { discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { GameLoopService } from './game-loop.service';

describe('GameLoopService', () => {
  let service: GameLoopService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GameLoopService],
    });
    service = TestBed.inject(GameLoopService);
  });

  describe('initialization', () => {
    it('should create', () => {
      expect(service).toBeTruthy();
    });

    it('should start with isPaused = false', () => {
      expect(service.isPaused).toBe(false);
    });

    it('should start with gameSpeed = 1', () => {
      expect(service.gameSpeed).toBe(1);
    });
  });

  describe('pause control', () => {
    it('should toggle pause state', () => {
      expect(service.isPaused).toBe(false);
      service.togglePause();
      expect(service.isPaused).toBe(true);
      service.togglePause();
      expect(service.isPaused).toBe(false);
    });

    it('should set pause state directly', () => {
      service.setPaused(true);
      expect(service.isPaused).toBe(true);
      service.setPaused(false);
      expect(service.isPaused).toBe(false);
    });
  });

  describe('speed control', () => {
    it('should cycle through speeds 1 → 2 → 3 → 1', () => {
      expect(service.gameSpeed).toBe(1);
      service.cycleSpeed();
      expect(service.gameSpeed).toBe(2);
      service.cycleSpeed();
      expect(service.gameSpeed).toBe(3);
      service.cycleSpeed();
      expect(service.gameSpeed).toBe(1);
    });

    it('should set speed directly', () => {
      service.setSpeed(3);
      expect(service.gameSpeed).toBe(3);
      service.setSpeed(1);
      expect(service.gameSpeed).toBe(1);
    });

    it('should ignore invalid speeds', () => {
      service.setSpeed(0);
      expect(service.gameSpeed).toBe(1);
      service.setSpeed(4);
      expect(service.gameSpeed).toBe(1);
      service.setSpeed(-1);
      expect(service.gameSpeed).toBe(1);
    });
  });

  describe('game loop', () => {
    it('should not be running before start()', () => {
      const spy = jasmine.createSpy('gameTick');
      service.gameTick$.subscribe(spy);

      // No ticks should occur
      expect(spy).not.toHaveBeenCalled();
    });

    it('should emit gameTick$ at correct intervals', fakeAsync(() => {
      const gameTickSpy = jasmine.createSpy('gameTick');
      service.gameTick$.subscribe(gameTickSpy);

      service.start();

      // After 500ms (1 tick), no gameTick yet
      tick(500);
      expect(gameTickSpy).not.toHaveBeenCalled();

      // After 1000ms (2 ticks), first gameTick
      tick(500);
      expect(gameTickSpy).toHaveBeenCalledTimes(1);

      // After 2000ms (4 ticks), second gameTick
      tick(1000);
      expect(gameTickSpy).toHaveBeenCalledTimes(2);

      service.stop();
      discardPeriodicTasks();
    }));

    it('should emit spawnTick$ every 12 ticks (6 seconds)', fakeAsync(() => {
      const spawnSpy = jasmine.createSpy('spawnTick');
      service.spawnTick$.subscribe(spawnSpy);

      service.start();

      // After 5 seconds, no spawn tick yet
      tick(5000);
      expect(spawnSpy).not.toHaveBeenCalled();

      // After 6 seconds (12 ticks), first spawn tick
      tick(1000);
      expect(spawnSpy).toHaveBeenCalledTimes(1);

      // After 12 seconds (24 ticks), second spawn tick
      tick(6000);
      expect(spawnSpy).toHaveBeenCalledTimes(2);

      service.stop();
      discardPeriodicTasks();
    }));

    it('should emit dungeonTick$ every 4 ticks (2 seconds)', fakeAsync(() => {
      const dungeonSpy = jasmine.createSpy('dungeonTick');
      service.dungeonTick$.subscribe(dungeonSpy);

      service.start();

      // After 1.5 seconds (3 ticks), no dungeon tick yet
      tick(1500);
      expect(dungeonSpy).not.toHaveBeenCalled();

      // After 2 seconds (4 ticks), first dungeon tick
      tick(500);
      expect(dungeonSpy).toHaveBeenCalledTimes(1);

      // After 4 seconds (8 ticks), second dungeon tick
      tick(2000);
      expect(dungeonSpy).toHaveBeenCalledTimes(2);

      service.stop();
      discardPeriodicTasks();
    }));

    it('should not emit ticks when paused', fakeAsync(() => {
      const gameTickSpy = jasmine.createSpy('gameTick');
      service.gameTick$.subscribe(gameTickSpy);

      service.start();
      service.setPaused(true);

      tick(5000); // 5 seconds
      expect(gameTickSpy).not.toHaveBeenCalled();

      service.stop();
      discardPeriodicTasks();
    }));

    it('should resume ticks when unpaused', fakeAsync(() => {
      const gameTickSpy = jasmine.createSpy('gameTick');
      service.gameTick$.subscribe(gameTickSpy);

      service.start();
      service.setPaused(true);
      tick(2000);
      expect(gameTickSpy).not.toHaveBeenCalled();

      service.setPaused(false);
      tick(1000); // 2 more ticks
      expect(gameTickSpy).toHaveBeenCalledTimes(1);

      service.stop();
      discardPeriodicTasks();
    }));

    it('should emit more ticks at higher speeds', fakeAsync(() => {
      const gameTickSpy = jasmine.createSpy('gameTick');
      service.gameTick$.subscribe(gameTickSpy);

      service.start();
      service.setSpeed(2);

      // At 2x speed, 1 real second = 2 game seconds = 2 game ticks
      tick(1000);
      expect(gameTickSpy).toHaveBeenCalledTimes(2);

      service.setSpeed(3);
      gameTickSpy.calls.reset();

      // At 3x speed, 1 real second = 3 game seconds = 3 game ticks
      tick(1000);
      expect(gameTickSpy).toHaveBeenCalledTimes(3);

      service.stop();
      discardPeriodicTasks();
    }));

    it('should not create duplicate intervals on multiple start() calls', fakeAsync(() => {
      const gameTickSpy = jasmine.createSpy('gameTick');
      service.gameTick$.subscribe(gameTickSpy);

      service.start();
      service.start(); // Second call should be ignored
      service.start(); // Third call should be ignored

      tick(1000);
      expect(gameTickSpy).toHaveBeenCalledTimes(1); // Not 3

      service.stop();
      discardPeriodicTasks();
    }));
  });

  describe('lifecycle', () => {
    it('should stop interval on stop()', fakeAsync(() => {
      const gameTickSpy = jasmine.createSpy('gameTick');
      service.gameTick$.subscribe(gameTickSpy);

      service.start();
      tick(1000);
      expect(gameTickSpy).toHaveBeenCalledTimes(1);

      service.stop();
      gameTickSpy.calls.reset();

      tick(5000);
      expect(gameTickSpy).not.toHaveBeenCalled();

      discardPeriodicTasks();
    }));

    it('should complete subjects on destroy', () => {
      const gameTickComplete = jasmine.createSpy('complete');
      service.gameTick$.subscribe({ complete: gameTickComplete });

      TestBed.resetTestingModule();

      expect(gameTickComplete).toHaveBeenCalled();
    });

    it('should reset tick counter', fakeAsync(() => {
      service.start();
      tick(3000); // Some ticks

      service.resetTickCounter();

      // After reset, should take full 6 seconds for spawn tick
      const spawnSpy = jasmine.createSpy('spawnTick');
      service.spawnTick$.subscribe(spawnSpy);

      tick(5000);
      expect(spawnSpy).not.toHaveBeenCalled();

      tick(1000);
      expect(spawnSpy).toHaveBeenCalledTimes(1);

      service.stop();
      discardPeriodicTasks();
    }));
  });

  describe('performance monitoring', () => {
    it('should track performance stats', fakeAsync(() => {
      service.start();
      tick(1000);

      const stats = service.getPerformanceStats();
      expect(stats.lastTickTime).toBeGreaterThanOrEqual(0);
      expect(stats.slowTickCount).toBeGreaterThanOrEqual(0);

      service.stop();
      discardPeriodicTasks();
    }));
  });
});
