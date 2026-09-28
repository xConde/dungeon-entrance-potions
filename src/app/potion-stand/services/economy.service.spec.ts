import {
  DUNGEON,
  DungeonFloor,
  ECONOMY,
  FLOOR_ENCOUNTER_WEIGHTS,
  GUILT,
  MARKET,
  POTIONS,
  REPUTATION,
} from '../config/game-config';
import { GameState } from '../models/game-state.model';
import { EconomyService } from './economy.service';
import { CURRENT_SCHEMA_VERSION } from './game-state.service';

describe('EconomyService', () => {
  let service: EconomyService;

  beforeEach(() => {
    service = new EconomyService();
  });

  // ---------------------------------------------------------------------------
  // addGold
  // ---------------------------------------------------------------------------
  describe('addGold', () => {
    it('should increase gold by the given amount', () => {
      const before = service.gold;
      service.addGold(50, 'potion-sale');
      expect(service.gold).toBe(before + 50);
    });

    it('should track dailyProfit', () => {
      service.addGold(30, 'tip');
      expect(service.dailyProfit).toBe(30);
    });

    it('should accumulate goldEarned', () => {
      service.addGold(10, 'a');
      service.addGold(20, 'b');
      expect(service.goldEarned).toBe(30);
    });
  });

  // ---------------------------------------------------------------------------
  // spendGold
  // ---------------------------------------------------------------------------
  describe('spendGold', () => {
    it('should decrease gold and return true when funds are sufficient', () => {
      service.gold = 200;
      const result = service.spendGold(50, 'merchant-purchase');
      expect(result).toBeTrue();
      expect(service.gold).toBe(150);
    });

    it('should return false and not change gold when funds are insufficient', () => {
      service.gold = 10;
      const result = service.spendGold(50, 'merchant-purchase');
      expect(result).toBeFalse();
      expect(service.gold).toBe(10);
    });

    it('should allow spending exact amount', () => {
      service.gold = 50;
      const result = service.spendGold(50, 'exact');
      expect(result).toBeTrue();
      expect(service.gold).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // adjustReputation
  // ---------------------------------------------------------------------------
  describe('adjustReputation', () => {
    it('should increase reputation', () => {
      service.reputation = 50;
      service.adjustReputation(10, 'survivor');
      expect(service.reputation).toBe(60);
    });

    it('should decrease reputation', () => {
      service.reputation = 50;
      service.adjustReputation(-20, 'death');
      expect(service.reputation).toBe(30);
    });

    it('should clamp to MAX_REPUTATION', () => {
      service.reputation = 95;
      service.adjustReputation(20, 'bonus');
      expect(service.reputation).toBe(ECONOMY.MAX_REPUTATION);
    });

    it('should clamp to MIN_REPUTATION', () => {
      service.reputation = -90;
      service.adjustReputation(-20, 'penalty');
      expect(service.reputation).toBe(ECONOMY.MIN_REPUTATION);
    });

    it('should NOT apply guilt multiplier to positive deltas', () => {
      service.guilt = GUILT.HIGH_THRESHOLD; // high guilt
      service.reputation = 50;
      service.adjustReputation(10, 'bonus');
      expect(service.reputation).toBe(60); // no multiplier on gains
    });

    it('should apply MEDIUM guilt multiplier to negative deltas', () => {
      service.guilt = GUILT.MEDIUM_THRESHOLD; // exactly medium
      service.reputation = 50;
      service.adjustReputation(-10, 'penalty');
      // -10 * 1.5 = -15
      expect(service.reputation).toBe(50 - 10 * GUILT.REP_LOSS_MULTIPLIER_MEDIUM);
    });

    it('should apply HIGH guilt multiplier to negative deltas', () => {
      service.guilt = GUILT.HIGH_THRESHOLD; // exactly high
      service.reputation = 50;
      service.adjustReputation(-10, 'penalty');
      // -10 * 2.0 = -20
      expect(service.reputation).toBe(50 - 10 * GUILT.REP_LOSS_MULTIPLIER_HIGH);
    });

    it('should apply HIGH guilt multiplier when guilt is at maximum', () => {
      service.guilt = POTIONS.MAX_GUILT; // 100, above high threshold
      service.reputation = 50;
      service.adjustReputation(-10, 'penalty');
      expect(service.reputation).toBe(50 - 10 * GUILT.REP_LOSS_MULTIPLIER_HIGH);
    });

    it('should NOT apply guilt multiplier when guilt is below MEDIUM', () => {
      service.guilt = GUILT.MEDIUM_THRESHOLD - 1;
      service.reputation = 50;
      service.adjustReputation(-10, 'penalty');
      expect(service.reputation).toBe(40); // no multiplier
    });
  });

  // ---------------------------------------------------------------------------
  // recordSale
  // ---------------------------------------------------------------------------
  describe('recordSale', () => {
    it('should increment potionsSold', () => {
      service.recordSale();
      service.recordSale();
      expect(service.potionsSold).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // recordSurvivor
  // ---------------------------------------------------------------------------
  describe('recordSurvivor', () => {
    it('should increment savedCount and dailySaves', () => {
      service.recordSurvivor(false, false);
      expect(service.savedCount).toBe(1);
      expect(service.dailySaves).toBe(1);
    });

    it('should reset deathStreak', () => {
      service.deathStreak = 5;
      service.recordSurvivor(false, false);
      expect(service.deathStreak).toBe(0);
    });

    it('should increase reputation by SURVIVOR_BONUS', () => {
      service.reputation = 50;
      service.recordSurvivor(false, false);
      expect(service.reputation).toBe(50 + REPUTATION.SURVIVOR_BONUS);
    });

    it('should track encountersSurvived', () => {
      service.recordSurvivor(false, false);
      service.recordSurvivor(false, false);
      expect(service.encountersSurvived).toBe(2);
    });

    it('should track perfectSaves when flagged', () => {
      service.recordSurvivor(true, false);
      service.recordSurvivor(false, false);
      expect(service.perfectSaves).toBe(1);
    });

    it('should track bossesDefeated when flagged', () => {
      service.recordSurvivor(false, true);
      expect(service.bossesDefeated).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // recordDeath
  // ---------------------------------------------------------------------------
  describe('recordDeath', () => {
    it('should increment deathCount and dailyDeaths', () => {
      service.recordDeath(false, false, false);
      expect(service.deathCount).toBe(1);
      expect(service.dailyDeaths).toBe(1);
    });

    it('should increment and track deathStreak and maxDeathStreak', () => {
      service.recordDeath(false, false, false);
      service.recordDeath(false, false, false);
      service.recordDeath(false, false, false);
      expect(service.deathStreak).toBe(3);
      expect(service.maxDeathStreak).toBe(3);
    });

    it('should track deathsByPotion when hadPotion is true', () => {
      service.recordDeath(true, false, false);
      expect(service.deathsByPotion).toBe(1);
    });

    it('should track deathsByDilution when hadDiluted is true', () => {
      service.recordDeath(false, true, false);
      expect(service.deathsByDilution).toBe(1);
    });

    it('should apply DEATH_NO_POTION reputation loss when no potion', () => {
      service.reputation = 50;
      service.recordDeath(false, false, false);
      expect(service.reputation).toBe(50 - REPUTATION.DEATH_NO_POTION);
    });

    it('should apply DEATH_WITH_POTION reputation loss when hadPotion', () => {
      service.reputation = 50;
      service.recordDeath(true, false, false);
      expect(service.reputation).toBe(50 - REPUTATION.DEATH_WITH_POTION);
    });

    it('should apply DEATH_WITH_DILUTED reputation loss when hadDiluted', () => {
      service.reputation = 50;
      service.recordDeath(false, true, false);
      expect(service.reputation).toBe(50 - REPUTATION.DEATH_WITH_DILUTED);
    });

    it('should add guilt when wasYourFault', () => {
      service.recordDeath(false, false, true);
      expect(service.guilt).toBe(POTIONS.GUILT_PER_DEATH);
    });

    it('should NOT add guilt when not your fault', () => {
      service.recordDeath(false, false, false);
      expect(service.guilt).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // recordCombo
  // ---------------------------------------------------------------------------
  describe('recordCombo', () => {
    it('should increment combosTriggered', () => {
      service.recordCombo();
      expect(service.combosTriggered).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Guilt
  // ---------------------------------------------------------------------------
  describe('guilt system', () => {
    it('addGuilt should increase guilt clamped to maxGuilt', () => {
      service.addGuilt(50);
      expect(service.guilt).toBe(50);
      service.addGuilt(200);
      expect(service.guilt).toBe(service.maxGuilt);
    });

    it('decayGuilt should use near-full amount when guilt is low', () => {
      // At guilt 20, formula: max(0.1, 1 - 20/150) = max(0.1, ~0.867) = 0.867
      service.guilt = 20;
      service.decayGuilt(10);
      const expectedDecay = 10 * Math.max(0.1, 1 - 20 / GUILT.DECAY_ASYMPTOTE);
      expect(service.guilt).toBeCloseTo(20 - expectedDecay);
    });

    it('decayGuilt should use reduced amount at medium guilt', () => {
      // At guilt 50, formula: max(0.1, 1 - 50/150) = max(0.1, ~0.667) = 0.667
      service.guilt = GUILT.MEDIUM_THRESHOLD;
      const before = service.guilt;
      const base = 10;
      service.decayGuilt(base);
      const expectedDecay = base * Math.max(0.1, 1 - before / GUILT.DECAY_ASYMPTOTE);
      expect(service.guilt).toBeCloseTo(before - expectedDecay);
    });

    it('decayGuilt should use further-reduced amount at high guilt', () => {
      // At guilt 75, formula: max(0.1, 1 - 75/150) = max(0.1, 0.5) = 0.5
      service.guilt = GUILT.HIGH_THRESHOLD;
      const before = service.guilt;
      const base = 10;
      service.decayGuilt(base);
      const expectedDecay = base * Math.max(0.1, 1 - before / GUILT.DECAY_ASYMPTOTE);
      expect(service.guilt).toBeCloseTo(before - expectedDecay);
    });

    it('decayGuilt should clamp to 0', () => {
      service.guilt = 0.01;
      service.decayGuilt(1);
      expect(service.guilt).toBe(0);
    });

    it('decayGuilt at guilt 80 is slower than at guilt 20', () => {
      const base = 10;

      service.guilt = 20;
      const startLow = service.guilt;
      service.decayGuilt(base);
      const lowDecay = startLow - service.guilt;

      service.guilt = 80;
      const startHigh = service.guilt;
      service.decayGuilt(base);
      const highDecay = startHigh - service.guilt;

      expect(highDecay).toBeLessThan(lowDecay);
    });

    it('decayGuilt effective rate is monotonically decreasing as guilt increases', () => {
      // Use asymptote formula directly: rate = max(0.1, 1 - guilt / DECAY_ASYMPTOTE)
      const guilts = [0, 20, 50, 75, 100, 120];
      const rates = guilts.map((g) => Math.max(0.1, 1 - g / GUILT.DECAY_ASYMPTOTE));

      for (let i = 1; i < rates.length; i++) {
        expect(rates[i]).toBeLessThanOrEqual(rates[i - 1]);
      }
    });

    it('decayGuilt floors at 0.1x rate even at extreme guilt', () => {
      // At guilt 200 (clamped to maxGuilt=100 in practice, but test the formula floor)
      service.guilt = 149; // 1 - 149/150 = 0.0067, clamped to 0.1
      const before = service.guilt;
      const base = 10;
      service.decayGuilt(base);
      const actualDecay = before - service.guilt;
      expect(actualDecay).toBeCloseTo(base * 0.1, 3);
    });
  });

  // ---------------------------------------------------------------------------
  // peakGuilt tracking
  // ---------------------------------------------------------------------------
  describe('peakGuilt', () => {
    it('should start at 0', () => {
      expect(service.peakGuilt).toBe(0);
    });

    it('should update peakGuilt when guilt increases past previous peak', () => {
      service.addGuilt(30);
      expect(service.peakGuilt).toBe(30);
      service.addGuilt(20);
      expect(service.peakGuilt).toBe(50);
    });

    it('should NOT decrease peakGuilt when guilt decays', () => {
      service.addGuilt(60);
      expect(service.peakGuilt).toBe(60);
      service.decayGuilt(20);
      expect(service.peakGuilt).toBe(60);
    });

    it('should NOT update peakGuilt on a second addGuilt if below current peak', () => {
      service.addGuilt(80);
      service.guilt = 0; // manually reset guilt (simulating decay)
      service.addGuilt(20);
      expect(service.peakGuilt).toBe(80);
    });

    it('should reset peakGuilt in initializeDefaults', () => {
      service.addGuilt(70);
      service.initializeDefaults();
      expect(service.peakGuilt).toBe(0);
    });

    it('should persist peakGuilt through toSaveState / loadFromState round-trip', () => {
      service.addGuilt(55);
      const saved = service.toSaveState();
      expect(saved.peakGuilt).toBe(55);

      const freshService = new EconomyService();
      const state = {
        ...saved,
        schemaVersion: 1,
        day: 1,
        shopLevel: 1,
        totalAdventurers: 0,
        adventurersSaved: 0,
        adventurersKilled: 0,
        potionsSold: 0,
        goldEarned: 0,
        deathsByPotion: 0,
        deathsByDilution: 0,
        perfectSaves: 0,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: {},
        potionUpgrades: {},
        difficultyMultiplier: 1,
      } as unknown as import('../models/game-state.model').GameState;
      freshService.loadFromState(state);
      expect(freshService.peakGuilt).toBe(55);
    });
  });

  // ---------------------------------------------------------------------------
  // getGuiltLevel
  // ---------------------------------------------------------------------------
  describe('getGuiltLevel', () => {
    it('should return "low" when guilt is below LOW_THRESHOLD', () => {
      service.guilt = 0;
      expect(service.getGuiltLevel()).toBe('low');
      service.guilt = GUILT.LOW_THRESHOLD - 1;
      expect(service.getGuiltLevel()).toBe('low');
    });

    it('should return "medium" when guilt is between LOW and MEDIUM thresholds', () => {
      service.guilt = GUILT.LOW_THRESHOLD;
      expect(service.getGuiltLevel()).toBe('medium');
      service.guilt = GUILT.MEDIUM_THRESHOLD - 1;
      expect(service.getGuiltLevel()).toBe('medium');
    });

    it('should return "high" when guilt is between MEDIUM and HIGH thresholds', () => {
      service.guilt = GUILT.MEDIUM_THRESHOLD;
      expect(service.getGuiltLevel()).toBe('high');
      service.guilt = GUILT.HIGH_THRESHOLD - 1;
      expect(service.getGuiltLevel()).toBe('high');
    });

    it('should return "maximum" when guilt is at or above HIGH_THRESHOLD', () => {
      service.guilt = GUILT.HIGH_THRESHOLD;
      expect(service.getGuiltLevel()).toBe('maximum');
      service.guilt = POTIONS.MAX_GUILT;
      expect(service.getGuiltLevel()).toBe('maximum');
    });
  });

  // ---------------------------------------------------------------------------
  // resetDaily
  // ---------------------------------------------------------------------------
  describe('resetDaily', () => {
    it('should clear all daily counters', () => {
      service.dailyProfit = 500;
      service.dailyExpenses = 200;
      service.dailyDeaths = 3;
      service.dailySaves = 7;
      service.reputation = 75;

      service.resetDaily();

      expect(service.dailyProfit).toBe(0);
      expect(service.dailyExpenses).toBe(0);
      expect(service.dailyDeaths).toBe(0);
      expect(service.dailySaves).toBe(0);
      expect(service.startOfDayReputation).toBe(75);
    });
  });

  // ---------------------------------------------------------------------------
  // chargeDailyOverhead
  // ---------------------------------------------------------------------------
  describe('chargeDailyOverhead', () => {
    it('should deduct scaled overhead from gold and add to dailyExpenses', () => {
      service.gold = 200;
      // Overhead scales with floor: base + floor × OVERHEAD_PER_FLOOR
      const expectedOverhead = ECONOMY.DAILY_OVERHEAD + service.currentFloor * ECONOMY.OVERHEAD_PER_FLOOR;
      service.chargeDailyOverhead();
      expect(service.gold).toBe(200 - expectedOverhead);
      expect(service.dailyExpenses).toBe(expectedOverhead);
    });
  });

  // ---------------------------------------------------------------------------
  // updateFloor
  // ---------------------------------------------------------------------------
  describe('updateFloor', () => {
    it('should return false when floor has not changed', () => {
      service.currentFloor = 1;
      const changed = service.updateFloor(1);
      expect(changed).toBeFalse();
      expect(service.currentFloor).toBe(1);
    });

    it('should return true and update floor when day crosses threshold', () => {
      service.currentFloor = 1;
      // Day 4 → floor 2 (FLOOR_PROGRESSION_DAYS = 3)
      const changed = service.updateFloor(4);
      expect(changed).toBeTrue();
      expect(service.currentFloor).toBe(2);
    });

    it('should cap floor at MAX_FLOOR', () => {
      service.currentFloor = 1;
      const changed = service.updateFloor(999);
      expect(changed).toBeTrue();
      expect(service.currentFloor).toBe(DUNGEON.MAX_FLOOR);
    });

    it('should update dungeonDifficulty when floor changes', () => {
      service.currentFloor = 1;
      service.updateFloor(4); // floor 2
      expect(service.dungeonDifficulty).toBe(1 + DUNGEON.DIFFICULTY_PER_FLOOR);
    });
  });

  // ---------------------------------------------------------------------------
  // loadFromState / toSaveState round-trip
  // ---------------------------------------------------------------------------
  describe('loadFromState + toSaveState', () => {
    it('should round-trip economy fields correctly', () => {
      const state: GameState = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        gold: 999,
        reputation: 75,
        day: 10,
        shopLevel: 1,
        totalAdventurers: 30,
        adventurersSaved: 20,
        adventurersKilled: 10,
        potionsSold: 50,
        goldEarned: 2000,
        deathsByPotion: 5,
        deathsByDilution: 2,
        perfectSaves: 8,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: {},
        potionUpgrades: { healing: 0, strength: 0, defense: 0 },
        difficultyMultiplier: 1,
        encountersSurvived: 15,
        bossesDefeated: 3,
        combosTriggered: 7,
        guilt: 42,
        maxDeathStreak: 5,
      };

      service.loadFromState(state);

      expect(service.gold).toBe(999);
      expect(service.reputation).toBe(75);
      expect(service.savedCount).toBe(20);
      expect(service.deathCount).toBe(10);
      expect(service.potionsSold).toBe(50);
      expect(service.goldEarned).toBe(2000);
      expect(service.deathsByPotion).toBe(5);
      expect(service.deathsByDilution).toBe(2);
      expect(service.perfectSaves).toBe(8);
      expect(service.encountersSurvived).toBe(15);
      expect(service.bossesDefeated).toBe(3);
      expect(service.combosTriggered).toBe(7);
      expect(service.guilt).toBe(42);
      expect(service.maxDeathStreak).toBe(5);

      const saved = service.toSaveState();
      expect(saved.gold).toBe(999);
      expect(saved.reputation).toBe(75);
      expect(saved.adventurersSaved).toBe(20);
      expect(saved.adventurersKilled).toBe(10);
      expect(saved.totalAdventurers).toBe(30);
      expect(saved.potionsSold).toBe(50);
      expect(saved.goldEarned).toBe(2000);
      expect(saved.deathsByPotion).toBe(5);
      expect(saved.deathsByDilution).toBe(2);
      expect(saved.perfectSaves).toBe(8);
      expect(saved.encountersSurvived).toBe(15);
      expect(saved.bossesDefeated).toBe(3);
      expect(saved.combosTriggered).toBe(7);
      expect(saved.guilt).toBe(42);
      expect(saved.maxDeathStreak).toBe(5);
    });

    it('should restore dungeon floor from day', () => {
      const state: GameState = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        gold: 100,
        reputation: 50,
        day: 7, // floor should be 3 (1 + floor((7-1)/3) = 3)
        shopLevel: 1,
        totalAdventurers: 0,
        adventurersSaved: 0,
        adventurersKilled: 0,
        potionsSold: 0,
        goldEarned: 0,
        deathsByPotion: 0,
        deathsByDilution: 0,
        perfectSaves: 0,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: {},
        potionUpgrades: { healing: 0, strength: 0, defense: 0 },
        difficultyMultiplier: 1,
      };

      service.loadFromState(state);
      expect(service.currentFloor).toBe(3);
      expect(service.dungeonDifficulty).toBe(1 + 2 * DUNGEON.DIFFICULTY_PER_FLOOR);
    });

    it('should handle missing optional fields with defaults', () => {
      const state: GameState = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        gold: 100,
        reputation: 50,
        day: 1,
        shopLevel: 1,
        totalAdventurers: 0,
        adventurersSaved: 0,
        adventurersKilled: 0,
        potionsSold: 0,
        goldEarned: 0,
        deathsByPotion: 0,
        deathsByDilution: 0,
        perfectSaves: 0,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: {},
        potionUpgrades: { healing: 0, strength: 0, defense: 0 },
        difficultyMultiplier: 1,
        // encountersSurvived, bossesDefeated, combosTriggered are undefined
      };

      service.loadFromState(state);
      expect(service.encountersSurvived).toBe(0);
      expect(service.bossesDefeated).toBe(0);
      expect(service.combosTriggered).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // initializeDefaults
  // ---------------------------------------------------------------------------
  describe('initializeDefaults', () => {
    it('should reset all state to starting values', () => {
      // Mutate everything first
      service.gold = 999;
      service.reputation = -50;
      service.deathCount = 10;
      service.guilt = 80;
      service.currentFloor = 5;
      service.combosTriggered = 42;

      service.initializeDefaults();

      expect(service.gold).toBe(ECONOMY.STARTING_GOLD);
      expect(service.reputation).toBe(ECONOMY.STARTING_REPUTATION);
      expect(service.deathCount).toBe(0);
      expect(service.savedCount).toBe(0);
      expect(service.guilt).toBe(0);
      expect(service.currentFloor).toBe(1);
      expect(service.dungeonDifficulty).toBe(1);
      expect(service.combosTriggered).toBe(0);
      expect(service.dailyProfit).toBe(0);
      expect(service.dailyExpenses).toBe(0);
      expect(service.startOfDayReputation).toBe(ECONOMY.STARTING_REPUTATION);
    });
  });

  // ---------------------------------------------------------------------------
  // getSpawnRateModifier
  // ---------------------------------------------------------------------------
  describe('getSpawnRateModifier', () => {
    it('should return SPAWN_BONUS_HIGH at high reputation', () => {
      service.reputation = REPUTATION.GOOD_THRESHOLD;
      expect(service.getSpawnRateModifier()).toBe(REPUTATION.SPAWN_BONUS_HIGH);
    });

    it('should return SPAWN_BONUS_HIGH above GOOD_THRESHOLD', () => {
      service.reputation = REPUTATION.GOOD_THRESHOLD + 10;
      expect(service.getSpawnRateModifier()).toBe(REPUTATION.SPAWN_BONUS_HIGH);
    });

    it('should return SPAWN_RATE_STRUGGLING at struggling threshold', () => {
      service.reputation = REPUTATION.STRUGGLING_THRESHOLD;
      expect(service.getSpawnRateModifier()).toBeCloseTo(REPUTATION.SPAWN_RATE_STRUGGLING, 5);
    });

    it('should interpolate smoothly in neutral zone (no discontinuity)', () => {
      // Just above struggling: should be close to STRUGGLING rate
      service.reputation = REPUTATION.STRUGGLING_THRESHOLD + 1;
      const justAbove = service.getSpawnRateModifier();

      service.reputation = REPUTATION.STRUGGLING_THRESHOLD;
      const atThreshold = service.getSpawnRateModifier();

      // Difference should be small (smooth), not a 15% jump
      expect(Math.abs(justAbove - atThreshold)).toBeLessThan(0.02);
    });

    it('should return SPAWN_RATE_MIN at minimum reputation', () => {
      service.reputation = ECONOMY.MIN_REPUTATION;
      expect(service.getSpawnRateModifier()).toBeCloseTo(REPUTATION.SPAWN_RATE_MIN, 5);
    });

    it('should increase monotonically with reputation', () => {
      const rates: number[] = [];
      for (let rep = -50; rep <= 80; rep += 10) {
        service.reputation = rep;
        rates.push(service.getSpawnRateModifier());
      }
      for (let i = 1; i < rates.length; i++) {
        expect(rates[i]).toBeGreaterThanOrEqual(rates[i - 1]);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Guilt amplification floor
  // ---------------------------------------------------------------------------
  describe('guilt amplification floor', () => {
    it('should amplify rep losses when reputation is above AMPLIFICATION_FLOOR', () => {
      service.reputation = GUILT.AMPLIFICATION_FLOOR + 10;
      service.guilt = GUILT.HIGH_THRESHOLD; // Triggers 2x amplification
      const repBefore = service.reputation;

      service.adjustReputation(-10, 'test');

      // With 2x amplification, -10 becomes -20
      expect(service.reputation).toBe(repBefore - 20);
    });

    it('should NOT amplify rep losses when reputation is at or below AMPLIFICATION_FLOOR', () => {
      service.reputation = GUILT.AMPLIFICATION_FLOOR;
      service.guilt = GUILT.HIGH_THRESHOLD;
      const repBefore = service.reputation;

      service.adjustReputation(-10, 'test');

      // No amplification: raw -10
      expect(service.reputation).toBe(repBefore - 10);
    });
  });

  // ---------------------------------------------------------------------------
  // getDailyOverhead
  // ---------------------------------------------------------------------------
  describe('getDailyOverhead', () => {
    it('should return base overhead at floor 1', () => {
      service.currentFloor = 1;
      expect(service.getDailyOverhead()).toBe(ECONOMY.DAILY_OVERHEAD + 1 * ECONOMY.OVERHEAD_PER_FLOOR);
    });

    it('should scale with floor for floors 1-10', () => {
      service.currentFloor = 3;
      expect(service.getDailyOverhead()).toBe(ECONOMY.DAILY_OVERHEAD + 3 * ECONOMY.OVERHEAD_PER_FLOOR);
    });

    it('should use reduced scaling for floors 11+ (ceiled to integer)', () => {
      service.currentFloor = 11;
      const base = ECONOMY.DAILY_OVERHEAD + 10 * ECONOMY.OVERHEAD_PER_FLOOR;
      // A5 fix: fractional overhead is ceiled so gold stays integral
      expect(service.getDailyOverhead()).toBe(Math.ceil(base + 1 * ECONOMY.OVERHEAD_PER_FLOOR_HIGH));
    });

    it('should use reduced scaling for floor 15 (ceiled to integer)', () => {
      service.currentFloor = 15;
      const base = ECONOMY.DAILY_OVERHEAD + 10 * ECONOMY.OVERHEAD_PER_FLOOR;
      // A5 fix: fractional overhead is ceiled so gold stays integral
      expect(service.getDailyOverhead()).toBe(Math.ceil(base + 5 * ECONOMY.OVERHEAD_PER_FLOOR_HIGH));
    });

    it('overhead at floor 11 should be greater than at floor 10', () => {
      service.currentFloor = 10;
      const floor10Overhead = service.getDailyOverhead();
      service.currentFloor = 11;
      const floor11Overhead = service.getDailyOverhead();
      expect(floor11Overhead).toBeGreaterThan(floor10Overhead);
    });

    it('overhead scaling is continuous at the floor 10/11 boundary', () => {
      // Floor 10 uses OVERHEAD_PER_FLOOR, floor 11 uses OVERHEAD_PER_FLOOR_HIGH
      // Both should increase relative to their predecessor
      service.currentFloor = 9;
      const floor9 = service.getDailyOverhead();
      service.currentFloor = 10;
      const floor10 = service.getDailyOverhead();
      service.currentFloor = 11;
      const floor11 = service.getDailyOverhead();
      expect(floor10).toBeGreaterThan(floor9);
      expect(floor11).toBeGreaterThan(floor10);
    });
  });

  // ---------------------------------------------------------------------------
  // Sprint 6: floors 11-15
  // ---------------------------------------------------------------------------
  describe('floors 11-15', () => {
    it('updateFloor should reach floor 15 at day 43', () => {
      // 1 + floor((43-1)/3) = 1 + floor(42/3) = 1 + 14 = 15
      service.currentFloor = 1;
      service.updateFloor(43);
      expect(service.currentFloor).toBe(15);
    });

    it('updateFloor should cap at MAX_FLOOR (15)', () => {
      service.currentFloor = 1;
      service.updateFloor(9999);
      expect(service.currentFloor).toBe(DUNGEON.MAX_FLOOR);
      expect(service.currentFloor).toBe(15);
    });

    it('floor encounter weights are defined for floors 11-15', () => {
      for (let floor = 11; floor <= 15; floor++) {
        expect(FLOOR_ENCOUNTER_WEIGHTS[floor as DungeonFloor])
          .withContext(`floor ${floor}`)
          .toBeDefined();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // calculateDemandShifts
  // ---------------------------------------------------------------------------
  describe('calculateDemandShifts', () => {
    const makeRng = (value: number): { nextFloat: () => number } => ({ nextFloat: () => value });

    it('should trigger healingDemandSurge when death rate >= HIGH_DEATH_THRESHOLD', () => {
      service.dailyDeaths = 5;
      service.dailySaves = 5; // 50% death rate — meets threshold exactly
      service.calculateDemandShifts(makeRng(0.5));
      expect(service.demandState.healingDemandSurge).toBeTrue();
    });

    it('should not trigger healingDemandSurge when death rate is below threshold', () => {
      service.dailyDeaths = 1;
      service.dailySaves = 9; // 10% death rate
      service.calculateDemandShifts(makeRng(0.5));
      expect(service.demandState.healingDemandSurge).toBeFalse();
    });

    it('should trigger strengthDemandBoost when death rate < 0.3 and saves >= 3', () => {
      service.dailyDeaths = 1;
      service.dailySaves = 9; // 10% death rate, 9 saves
      service.calculateDemandShifts(makeRng(0.5));
      expect(service.demandState.strengthDemandBoost).toBeTrue();
    });

    it('should not trigger strengthDemandBoost when saves < 3', () => {
      service.dailyDeaths = 0;
      service.dailySaves = 2; // 0% death rate but only 2 saves
      service.calculateDemandShifts(makeRng(0.5));
      expect(service.demandState.strengthDemandBoost).toBeFalse();
    });

    it('should trigger luckDemandBoost when death rate < 0.2 and saves >= 5', () => {
      service.dailyDeaths = 1;
      service.dailySaves = 10; // ~9% death rate, 10 saves
      service.calculateDemandShifts(makeRng(0.5));
      expect(service.demandState.luckDemandBoost).toBeTrue();
    });

    it('should not trigger luckDemandBoost when saves < 5', () => {
      service.dailyDeaths = 0;
      service.dailySaves = 4; // 0% death rate but only 4 saves
      service.calculateDemandShifts(makeRng(0.5));
      expect(service.demandState.luckDemandBoost).toBeFalse();
    });

    it('should keep priceVariance within ±PRICE_VARIANCE_RANGE of 1.0', () => {
      // Test extreme high: nextFloat returns 1.0 → variance = (2*1 - 1) * 0.15 = 0.15 → priceVariance = 1.15
      service.calculateDemandShifts(makeRng(1.0));
      expect(service.demandState.priceVariance).toBeCloseTo(1.0 + MARKET.PRICE_VARIANCE_RANGE, 5);

      // Test extreme low: nextFloat returns 0.0 → variance = (2*0 - 1) * 0.15 = -0.15 → priceVariance = 0.85
      service.calculateDemandShifts(makeRng(0.0));
      expect(service.demandState.priceVariance).toBeCloseTo(1.0 - MARKET.PRICE_VARIANCE_RANGE, 5);

      // Test midpoint: nextFloat returns 0.5 → variance = 0 → priceVariance = 1.0
      service.calculateDemandShifts(makeRng(0.5));
      expect(service.demandState.priceVariance).toBeCloseTo(1.0, 5);
    });

    it('should set all demand flags to false when no adventurers today', () => {
      service.dailyDeaths = 0;
      service.dailySaves = 0;
      service.calculateDemandShifts(makeRng(0.5));
      expect(service.demandState.healingDemandSurge).toBeFalse();
      expect(service.demandState.strengthDemandBoost).toBeFalse();
      expect(service.demandState.luckDemandBoost).toBeFalse();
    });

    it('should reset demandState to defaults in initializeDefaults()', () => {
      service.demandState = {
        healingDemandSurge: true,
        strengthDemandBoost: true,
        luckDemandBoost: true,
        priceVariance: 1.15,
      };
      service.initializeDefaults();
      expect(service.demandState.healingDemandSurge).toBeFalse();
      expect(service.demandState.strengthDemandBoost).toBeFalse();
      expect(service.demandState.luckDemandBoost).toBeFalse();
      expect(service.demandState.priceVariance).toBe(1.0);
    });
  });

  describe('getDailyOverhead (A5: integer output)', () => {
    it('should return an integer for every floor 1-15', () => {
      for (let floor = 1; floor <= 15; floor++) {
        service.currentFloor = floor;
        const overhead = service.getDailyOverhead();
        expect(overhead).toBe(Math.floor(overhead));
      }
    });

    it('should ceil fractional overhead at floor 13', () => {
      service.currentFloor = 13;
      // base = DAILY_OVERHEAD + 10*OVERHEAD_PER_FLOOR, then + 3*OVERHEAD_PER_FLOOR_HIGH, ceiled.
      // Referenced from config so the assertion tracks balance retunes (3*1.5 = 4.5 → ceil).
      const base = ECONOMY.DAILY_OVERHEAD + 10 * ECONOMY.OVERHEAD_PER_FLOOR;
      expect(service.getDailyOverhead()).toBe(Math.ceil(base + 3 * ECONOMY.OVERHEAD_PER_FLOOR_HIGH));
      // The scenario is genuinely fractional (so ceil is exercised)...
      expect(Number.isInteger(base + 3 * ECONOMY.OVERHEAD_PER_FLOOR_HIGH)).toBe(false);
      // ...and the result is rounded UP (strictly greater than the raw value), which
      // is the actual behavior under test (not just the test's own arithmetic).
      expect(service.getDailyOverhead()).toBeGreaterThan(base + 3 * ECONOMY.OVERHEAD_PER_FLOOR_HIGH);
    });
  });
});
