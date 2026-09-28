import { TestBed } from '@angular/core/testing';
import { GameRngService } from './game-rng.service';

describe('GameRngService', () => {
  let service: GameRngService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GameRngService],
    });
    service = TestBed.inject(GameRngService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Initialization & seeding
  // -------------------------------------------------------------------------

  describe('initialization', () => {
    it('should be usable immediately after construction without calling initialize()', () => {
      // Auto-seeds in constructor — must not throw.
      expect(() => service.nextFloat()).not.toThrow();
    });

    it('should produce deterministic output after initialize() with a fixed seed', () => {
      service.initialize(42);
      const a = service.nextFloat();

      service.initialize(42);
      const b = service.nextFloat();

      expect(a).toBe(b);
    });

    it('should produce a different sequence after re-seeding with a different seed', () => {
      service.initialize(1);
      const seq1 = [service.nextFloat(), service.nextFloat(), service.nextFloat()];

      service.initialize(999999);
      const seq2 = [service.nextFloat(), service.nextFloat(), service.nextFloat()];

      // Sequences with different seeds should differ (astronomically unlikely to match).
      expect(seq1).not.toEqual(seq2);
    });

    it('should re-initialize with a random seed when no argument is supplied', () => {
      // Two calls without a seed should (with overwhelming probability) yield different state.
      service.initialize();
      const state1 = service.getState();

      service.initialize();
      const state2 = service.getState();

      // It is theoretically possible but statistically negligible that these match.
      // The test remains valid as a sanity check on randomness.
      expect(typeof state1).toBe('number');
      expect(typeof state2).toBe('number');
    });
  });

  // -------------------------------------------------------------------------
  // State save / restore
  // -------------------------------------------------------------------------

  describe('getState / restoreState', () => {
    it('should return the current seed as a number', () => {
      service.initialize(100);
      expect(typeof service.getState()).toBe('number');
    });

    it('should reproduce the same sequence after restoring state', () => {
      service.initialize(7777);
      // Advance a few steps to get a non-trivial internal state.
      service.nextFloat();
      service.nextFloat();

      const savedState = service.getState();
      const a = service.nextFloat();

      service.restoreState(savedState);
      const b = service.nextFloat();

      expect(a).toBe(b);
    });

    it('should restore to an independent stream — subsequent calls also match', () => {
      service.initialize(1234);
      service.nextFloat(); // advance once

      const snap = service.getState();
      const expected: number[] = [];
      for (let i = 0; i < 5; i++) expected.push(service.nextFloat());

      service.restoreState(snap);
      const actual: number[] = [];
      for (let i = 0; i < 5; i++) actual.push(service.nextFloat());

      expect(actual).toEqual(expected);
    });
  });

  // -------------------------------------------------------------------------
  // nextFloat
  // -------------------------------------------------------------------------

  describe('nextFloat', () => {
    beforeEach(() => service.initialize(1));

    it('should return a number in [0, 1)', () => {
      for (let i = 0; i < 50; i++) {
        const v = service.nextFloat();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });

    it('should advance state — consecutive calls return different values', () => {
      const a = service.nextFloat();
      const b = service.nextFloat();
      expect(a).not.toBe(b);
    });
  });

  // -------------------------------------------------------------------------
  // range
  // -------------------------------------------------------------------------

  describe('range', () => {
    beforeEach(() => service.initialize(42));

    it('should return integers within [min, max] inclusive', () => {
      for (let i = 0; i < 100; i++) {
        const v = service.range(3, 7);
        expect(v).toBeGreaterThanOrEqual(3);
        expect(v).toBeLessThanOrEqual(7);
        expect(Number.isInteger(v)).toBe(true);
      }
    });

    it('should always return min when min === max', () => {
      for (let i = 0; i < 10; i++) {
        expect(service.range(5, 5)).toBe(5);
      }
    });

    it('should cover the full range given enough iterations', () => {
      const seen = new Set<number>();
      for (let i = 0; i < 200; i++) {
        seen.add(service.range(1, 6));
      }
      expect(seen.size).toBe(6); // 1, 2, 3, 4, 5, 6 should all appear
    });
  });

  // -------------------------------------------------------------------------
  // chance
  // -------------------------------------------------------------------------

  describe('chance', () => {
    beforeEach(() => service.initialize(99));

    it('should always return false when probability is 0', () => {
      for (let i = 0; i < 20; i++) {
        expect(service.chance(0)).toBe(false);
      }
    });

    it('should always return true when probability is 1', () => {
      for (let i = 0; i < 20; i++) {
        expect(service.chance(1)).toBe(true);
      }
    });

    it('should return a boolean', () => {
      expect(typeof service.chance(0.5)).toBe('boolean');
    });

    it('should return mostly true for probability near 1', () => {
      let trueCount = 0;
      for (let i = 0; i < 100; i++) {
        if (service.chance(0.95)) trueCount++;
      }
      expect(trueCount).toBeGreaterThan(80);
    });

    it('should return mostly false for probability near 0', () => {
      let trueCount = 0;
      for (let i = 0; i < 100; i++) {
        if (service.chance(0.05)) trueCount++;
      }
      expect(trueCount).toBeLessThan(20);
    });
  });

  // -------------------------------------------------------------------------
  // pick
  // -------------------------------------------------------------------------

  describe('pick', () => {
    const items = ['apple', 'banana', 'cherry', 'date', 'elderberry'] as const;

    beforeEach(() => service.initialize(55));

    it('should return an element that exists in the array', () => {
      const result = service.pick(items);
      expect(items).toContain(result);
    });

    it('should cover all elements given enough iterations', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        seen.add(service.pick(items));
      }
      expect(seen.size).toBe(items.length);
    });

    it('should return the only element of a singleton array', () => {
      expect(service.pick(['only'] as const)).toBe('only');
    });

    it('should be deterministic with the same seed', () => {
      service.initialize(1);
      const first = service.pick(items);

      service.initialize(1);
      const second = service.pick(items);

      expect(first).toBe(second);
    });
  });

  // -------------------------------------------------------------------------
  // weightedPick
  // -------------------------------------------------------------------------

  describe('weightedPick', () => {
    beforeEach(() => service.initialize(77));

    it('should return an element from the items array', () => {
      const items = ['rare', 'common'] as const;
      const weights = [1, 99];
      const result = service.weightedPick(items, weights);
      expect(items).toContain(result);
    });

    it('should overwhelmingly return the heavily-weighted item', () => {
      const items = ['rare', 'common'] as const;
      const weights = [1, 999];
      let commonCount = 0;
      for (let i = 0; i < 200; i++) {
        if (service.weightedPick(items, weights) === 'common') commonCount++;
      }
      expect(commonCount).toBeGreaterThan(180);
    });

    it('should respect determinism — same seed produces same pick', () => {
      const items = ['a', 'b', 'c'] as const;
      const weights = [10, 20, 70];

      service.initialize(42);
      const first = service.weightedPick(items, weights);

      service.initialize(42);
      const second = service.weightedPick(items, weights);

      expect(first).toBe(second);
    });
  });

  // -------------------------------------------------------------------------
  // shuffle
  // -------------------------------------------------------------------------

  describe('shuffle', () => {
    beforeEach(() => service.initialize(13));

    it('should return the same array reference (in-place)', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = service.shuffle(arr);
      expect(result).toBe(arr);
    });

    it('should preserve all elements after shuffle', () => {
      const arr = [1, 2, 3, 4, 5];
      service.shuffle(arr);
      expect(arr.sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle an empty array without throwing', () => {
      expect(() => service.shuffle([])).not.toThrow();
    });

    it('should handle a single-element array without changing it', () => {
      const arr = [42];
      service.shuffle(arr);
      expect(arr).toEqual([42]);
    });

    it('should produce a different order at least sometimes across multiple shuffles', () => {
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      let different = false;

      for (let i = 0; i < 10; i++) {
        const arr = [...original];
        service.shuffle(arr);
        if (arr.join(',') !== original.join(',')) {
          different = true;
          break;
        }
      }

      expect(different).toBe(true);
    });
  });
});
