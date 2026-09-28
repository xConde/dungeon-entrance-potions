import { createRng } from './rng';

describe('createRng (Park-Miller LCG)', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);

    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());

    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(999);

    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());

    expect(seqA).not.toEqual(seqB);
  });

  it('next() returns values in [0, 1)', () => {
    const rng = createRng(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  describe('range()', () => {
    it('stays within bounds', () => {
      const rng = createRng(77);
      for (let i = 0; i < 500; i++) {
        const v = rng.range(3, 7);
        expect(v).toBeGreaterThanOrEqual(3);
        expect(v).toBeLessThanOrEqual(7);
        expect(Number.isInteger(v)).toBe(true);
      }
    });

    it('returns min when min === max', () => {
      const rng = createRng(1);
      expect(rng.range(5, 5)).toBe(5);
    });
  });

  describe('chance()', () => {
    it('always returns false for probability 0', () => {
      const rng = createRng(1);
      for (let i = 0; i < 100; i++) {
        expect(rng.chance(0)).toBe(false);
      }
    });

    it('always returns true for probability 1', () => {
      const rng = createRng(1);
      for (let i = 0; i < 100; i++) {
        expect(rng.chance(1)).toBe(true);
      }
    });

    it('returns roughly expected ratio for probability 0.5', () => {
      const rng = createRng(42);
      const iterations = 10000;
      let trueCount = 0;
      for (let i = 0; i < iterations; i++) {
        if (rng.chance(0.5)) trueCount++;
      }
      const ratio = trueCount / iterations;
      // Allow 5% tolerance
      expect(ratio).toBeGreaterThan(0.45);
      expect(ratio).toBeLessThan(0.55);
    });
  });

  describe('pick()', () => {
    it('returns elements from the array', () => {
      const rng = createRng(99);
      const items = ['a', 'b', 'c', 'd'];
      for (let i = 0; i < 100; i++) {
        expect(items).toContain(rng.pick(items));
      }
    });

    it('returns the only element from a single-item array', () => {
      const rng = createRng(1);
      expect(rng.pick([42])).toBe(42);
    });
  });

  describe('weightedPick()', () => {
    it('respects weights (statistical test)', () => {
      const rng = createRng(123);
      const items = ['rare', 'common'];
      const weights = [1, 9]; // rare = 10%, common = 90%
      const counts: Record<string, number> = { rare: 0, common: 0 };
      const iterations = 10000;

      for (let i = 0; i < iterations; i++) {
        const result = rng.weightedPick(items, weights);
        counts[result]++;
      }

      const rareRatio = counts['rare'] / iterations;
      // rare should be roughly 10% (+/- 3%)
      expect(rareRatio).toBeGreaterThan(0.07);
      expect(rareRatio).toBeLessThan(0.13);
    });

    it('always returns the only item with weight', () => {
      const rng = createRng(1);
      const items = ['a', 'b'];
      const weights = [0, 5];
      for (let i = 0; i < 50; i++) {
        expect(rng.weightedPick(items, weights)).toBe('b');
      }
    });
  });

  describe('shuffle()', () => {
    it('returns the same array reference (in-place)', () => {
      const rng = createRng(1);
      const arr = [1, 2, 3, 4, 5];
      const result = rng.shuffle(arr);
      expect(result).toBe(arr);
    });

    it('contains the same elements after shuffle', () => {
      const rng = createRng(42);
      const arr = [10, 20, 30, 40, 50];
      rng.shuffle(arr);
      expect(arr.sort()).toEqual([10, 20, 30, 40, 50]);
    });

    it('is deterministic with the same seed', () => {
      const a = createRng(7);
      const b = createRng(7);

      const arrA = [1, 2, 3, 4, 5, 6, 7, 8];
      const arrB = [1, 2, 3, 4, 5, 6, 7, 8];

      a.shuffle(arrA);
      b.shuffle(arrB);

      expect(arrA).toEqual(arrB);
    });
  });

  describe('getState()', () => {
    it('returns a seed that reproduces subsequent values', () => {
      const rng = createRng(42);
      // Advance the RNG a few steps
      rng.next();
      rng.next();
      rng.next();

      const snapshot = rng.getState();

      // Generate values from this point
      const valuesAfterSnapshot = Array.from({ length: 5 }, () => rng.next());

      // Create a new RNG from the snapshot
      const restored = createRng(snapshot.seed);
      const restoredValues = Array.from({ length: 5 }, () => restored.next());

      expect(restoredValues).toEqual(valuesAfterSnapshot);
    });
  });
});
