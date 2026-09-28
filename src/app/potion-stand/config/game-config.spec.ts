import {
  BOSS_ENCOUNTERS,
  DUNGEON,
  DungeonFloor,
  ECONOMY,
  ENCOUNTER_POOL,
  ENCOUNTERS,
  EncounterType,
  EVENTS,
  FLOOR_ENCOUNTER_WEIGHTS,
  GUILT,
  MERCHANT,
  POTIONS,
  REPUTATION,
  SHOP,
  SURVIVAL,
  TIMING,
  UPGRADES,
} from './game-config';

/**
 * Config validation tests — guard-rails for game balance.
 *
 * These tests don't verify gameplay behavior; they verify that the config
 * constants maintain invariants the game logic depends on. Breaking these
 * means the game will silently misbehave (e.g. impossible survival, broken
 * economy, unreachable floors).
 */
describe('game-config validation', () => {
  // ---------------------------------------------------------------------------
  // Encounter damage ordering
  // ---------------------------------------------------------------------------

  describe('encounter damage multipliers', () => {
    it('boss damage > elite damage > normal (1.0)', () => {
      const normalEncounters = ENCOUNTER_POOL.filter((e) => e.type === 'normal');
      const eliteEncounters = ENCOUNTER_POOL.filter((e) => e.type === 'elite');
      const bossEncounters = BOSS_ENCOUNTERS;

      const maxNormal = Math.max(...normalEncounters.map((e) => e.damageMultiplier));
      const minElite = Math.min(...eliteEncounters.map((e) => e.damageMultiplier));
      const minBoss = Math.min(...bossEncounters.map((e) => e.damageMultiplier));

      expect(minBoss).toBeGreaterThan(minElite);
      expect(minElite).toBeGreaterThan(maxNormal);
    });

    it('The Alchemist boss is in BOSS_ENCOUNTERS', () => {
      const alchemist = BOSS_ENCOUNTERS.find((e) => e.name === 'The Alchemist');
      expect(alchemist).toBeDefined();
      expect(alchemist?.type).toBe('boss');
      expect(alchemist?.damageMultiplier).toBe(1.6);
    });

    it('cursed encounters have damageMultiplier > 1.0', () => {
      const cursedEncounters = ENCOUNTER_POOL.filter((e) => e.type === 'cursed');
      expect(cursedEncounters.length).toBeGreaterThan(0);
      for (const enc of cursedEncounters) {
        expect(enc.damageMultiplier).withContext(`${enc.name}`).toBeGreaterThan(1.0);
      }
    });

    it('BOSS_FLOORS includes floor 15', () => {
      expect(ENCOUNTERS.BOSS_FLOORS).toContain(15);
    });

    it('treasure encounters have lowest damage multipliers', () => {
      const treasureEncounters = ENCOUNTER_POOL.filter((e) => e.type === 'treasure');
      const normalEncounters = ENCOUNTER_POOL.filter((e) => e.type === 'normal');

      const maxTreasure = Math.max(...treasureEncounters.map((e) => e.damageMultiplier));
      const minNormal = Math.min(...normalEncounters.map((e) => e.damageMultiplier));

      expect(maxTreasure).toBeLessThan(minNormal);
    });

    it('ENCOUNTERS.BOSS_DAMAGE_MULTIPLIER > ENCOUNTERS.ELITE_DAMAGE_MULTIPLIER', () => {
      expect(ENCOUNTERS.BOSS_DAMAGE_MULTIPLIER).toBeGreaterThan(ENCOUNTERS.ELITE_DAMAGE_MULTIPLIER);
    });
  });

  // ---------------------------------------------------------------------------
  // Survival chance bounds
  // ---------------------------------------------------------------------------

  describe('survival chance bounds', () => {
    it('MAX_SURVIVAL_CHANCE > MIN_SURVIVAL_CHANCE', () => {
      expect(POTIONS.MAX_SURVIVAL_CHANCE).toBeGreaterThan(POTIONS.MIN_SURVIVAL_CHANCE);
    });

    it('MAX_SURVIVAL_CHANCE is below 1.0 (always some danger)', () => {
      expect(POTIONS.MAX_SURVIVAL_CHANCE).toBeLessThan(1.0);
    });

    it('MIN_SURVIVAL_CHANCE is above 0 (never truly hopeless)', () => {
      expect(POTIONS.MIN_SURVIVAL_CHANCE).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Survival caps — ascending by tier
  // ---------------------------------------------------------------------------

  describe('survival caps are ascending by tier', () => {
    it('HEALING_CAPS are ascending [BASIC < ENHANCED < SUPERIOR]', () => {
      for (let i = 1; i < SURVIVAL.HEALING_CAPS.length; i++) {
        expect(SURVIVAL.HEALING_CAPS[i]).toBeGreaterThan(SURVIVAL.HEALING_CAPS[i - 1]);
      }
    });

    it('STRENGTH_CAPS are ascending [BASIC < ENHANCED < SUPERIOR]', () => {
      for (let i = 1; i < SURVIVAL.STRENGTH_CAPS.length; i++) {
        expect(SURVIVAL.STRENGTH_CAPS[i]).toBeGreaterThan(SURVIVAL.STRENGTH_CAPS[i - 1]);
      }
    });

    it('DEFENSE_CAPS are ascending [BASIC < ENHANCED < SUPERIOR]', () => {
      for (let i = 1; i < SURVIVAL.DEFENSE_CAPS.length; i++) {
        expect(SURVIVAL.DEFENSE_CAPS[i]).toBeGreaterThan(SURVIVAL.DEFENSE_CAPS[i - 1]);
      }
    });

    it('PERFECT_SAVE_THRESHOLD is between 0 and 1', () => {
      expect(SURVIVAL.PERFECT_SAVE_THRESHOLD).toBeGreaterThan(0);
      expect(SURVIVAL.PERFECT_SAVE_THRESHOLD).toBeLessThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Upgrade system
  // ---------------------------------------------------------------------------

  describe('upgrade system', () => {
    it('TIER_MULTIPLIERS are ascending', () => {
      for (let i = 1; i < UPGRADES.TIER_MULTIPLIERS.length; i++) {
        expect(UPGRADES.TIER_MULTIPLIERS[i]).toBeGreaterThan(UPGRADES.TIER_MULTIPLIERS[i - 1]);
      }
    });

    it('all UPGRADE_COSTS values are positive', () => {
      for (const [type, costs] of Object.entries(UPGRADES.COSTS)) {
        for (let i = 0; i < costs.length; i++) {
          expect(costs[i])
            .withContext(`${type} tier ${i + 1} cost`)
            .toBeGreaterThan(0);
        }
      }
    });

    it('upgrade costs increase per tier', () => {
      for (const [type, costs] of Object.entries(UPGRADES.COSTS)) {
        for (let i = 1; i < costs.length; i++) {
          expect(costs[i])
            .withContext(`${type} tier ${i + 1} > tier ${i}`)
            .toBeGreaterThan(costs[i - 1]);
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Floor encounter weights — must cover all 10 floors
  // ---------------------------------------------------------------------------

  describe('floor encounter weights', () => {
    const allEncounterTypes: EncounterType[] = ['normal', 'trap', 'ambush', 'elite', 'treasure', 'boss', 'cursed'];

    it('cover all 15 floors', () => {
      for (let floor = 1; floor <= DUNGEON.MAX_FLOOR; floor++) {
        expect(FLOOR_ENCOUNTER_WEIGHTS[floor as DungeonFloor])
          .withContext(`floor ${floor}`)
          .toBeDefined();
      }
    });

    it('each floor defines weights for all encounter types', () => {
      for (let floor = 1; floor <= DUNGEON.MAX_FLOOR; floor++) {
        const weights = FLOOR_ENCOUNTER_WEIGHTS[floor as DungeonFloor];
        for (const type of allEncounterTypes) {
          expect(weights[type]).withContext(`floor ${floor} type ${type}`).toBeDefined();
          expect(weights[type]).withContext(`floor ${floor} type ${type} >= 0`).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('each floor has at least some positive weights', () => {
      for (let floor = 1; floor <= DUNGEON.MAX_FLOOR; floor++) {
        const weights = FLOOR_ENCOUNTER_WEIGHTS[floor as DungeonFloor];
        const total = allEncounterTypes.reduce((sum, type) => sum + weights[type], 0);
        expect(total).withContext(`floor ${floor} total weight`).toBeGreaterThan(0);
      }
    });

    it('cursed weight is 0 for floors 1-10', () => {
      for (let floor = 1; floor <= 10; floor++) {
        expect(FLOOR_ENCOUNTER_WEIGHTS[floor as DungeonFloor]['cursed'])
          .withContext(`floor ${floor} cursed weight`)
          .toBe(0);
      }
    });

    it('cursed weight is positive for floors 12-15', () => {
      for (let floor = 12; floor <= 15; floor++) {
        expect(FLOOR_ENCOUNTER_WEIGHTS[floor as DungeonFloor]['cursed'])
          .withContext(`floor ${floor} cursed weight`)
          .toBeGreaterThan(0);
      }
    });

    it('floor 15 has highest cursed weight', () => {
      expect(FLOOR_ENCOUNTER_WEIGHTS[15]['cursed' as EncounterType]).toBeGreaterThan(
        FLOOR_ENCOUNTER_WEIGHTS[14]['cursed']
      );
    });

    it('floor 15 boss weight is highest among floors 11-15', () => {
      const weights11to14 = [11, 12, 13, 14].map((f) => FLOOR_ENCOUNTER_WEIGHTS[f as DungeonFloor]['boss']);
      const floor15Boss = FLOOR_ENCOUNTER_WEIGHTS[15]['boss'];
      for (const w of weights11to14) {
        expect(floor15Boss).withContext('floor 15 boss weight > other floors 11-14').toBeGreaterThan(w);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Reputation change values
  // ---------------------------------------------------------------------------

  describe('reputation change values', () => {
    it('SURVIVOR_BONUS is positive', () => {
      expect(REPUTATION.SURVIVOR_BONUS).toBeGreaterThan(0);
    });

    it('death penalties are positive (applied as negative by callers)', () => {
      expect(REPUTATION.DEATH_NO_POTION).toBeGreaterThan(0);
      expect(REPUTATION.DEATH_WITH_POTION).toBeGreaterThan(0);
      expect(REPUTATION.DEATH_WITH_DILUTED).toBeGreaterThan(0);
    });

    it('diluted death penalty > potion death penalty > no-potion death penalty', () => {
      expect(REPUTATION.DEATH_WITH_DILUTED).toBeGreaterThan(REPUTATION.DEATH_WITH_POTION);
      expect(REPUTATION.DEATH_WITH_POTION).toBeGreaterThan(REPUTATION.DEATH_NO_POTION);
    });

    it('guild inspection bonuses/penalties are positive', () => {
      expect(REPUTATION.GUILD_INSPECTION_CLEAN_BONUS).toBeGreaterThan(0);
      expect(REPUTATION.GUILD_INSPECTION_DIRTY_PENALTY).toBeGreaterThan(0);
      expect(REPUTATION.GUILD_FINE).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Timing constants
  // ---------------------------------------------------------------------------

  describe('timing constants', () => {
    it('DAY_LENGTH_TICKS > 0', () => {
      expect(TIMING.DAY_LENGTH_TICKS).toBeGreaterThan(0);
    });

    it('time-of-day thresholds are ascending and within day length', () => {
      expect(TIMING.MORNING_END).toBeGreaterThan(0);
      expect(TIMING.AFTERNOON_END).toBeGreaterThan(TIMING.MORNING_END);
      expect(TIMING.EVENING_END).toBeGreaterThan(TIMING.AFTERNOON_END);
      expect(TIMING.DAY_LENGTH_TICKS).toBeGreaterThanOrEqual(TIMING.EVENING_END);
    });

    it('all millisecond timing constants are positive', () => {
      expect(TIMING.SPAWN_DELAY_MS).toBeGreaterThan(0);
      expect(TIMING.PURCHASE_ANIMATION_MS).toBeGreaterThan(0);
      expect(TIMING.DEATH_MODAL_MS).toBeGreaterThan(0);
      expect(TIMING.MESSAGE_AUTO_HIDE_MS).toBeGreaterThan(0);
      expect(TIMING.EVENT_BANNER_MS).toBeGreaterThan(0);
      expect(TIMING.MIN_BROWSE_TIME_MS).toBeGreaterThan(0);
      expect(TIMING.BASE_TICK_MS).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Economy sanity
  // ---------------------------------------------------------------------------

  describe('economy', () => {
    it('STARTING_GOLD is positive', () => {
      expect(ECONOMY.STARTING_GOLD).toBeGreaterThan(0);
    });

    it('MAX_REPUTATION > MIN_REPUTATION', () => {
      expect(ECONOMY.MAX_REPUTATION).toBeGreaterThan(ECONOMY.MIN_REPUTATION);
    });

    it('VICTORY_DAYS is positive', () => {
      expect(ECONOMY.VICTORY_DAYS).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Shop
  // ---------------------------------------------------------------------------

  describe('shop', () => {
    it('QUEUE_TIMEOUT_MS is positive', () => {
      expect(SHOP.QUEUE_TIMEOUT_MS).toBeGreaterThan(0);
    });

    it('MAX_POTIONS_PER_CUSTOMER is at least 1', () => {
      expect(SHOP.MAX_POTIONS_PER_CUSTOMER).toBeGreaterThanOrEqual(1);
    });

    it('price multipliers are positive', () => {
      expect(SHOP.DESPERATE_PRICE_MULTIPLIER).toBeGreaterThan(0);
      expect(SHOP.FRUGAL_PRICE_MULTIPLIER).toBeGreaterThan(0);
    });

    it('DESPERATE_PRICE_MULTIPLIER > FRUGAL_PRICE_MULTIPLIER (desperate pays more)', () => {
      expect(SHOP.DESPERATE_PRICE_MULTIPLIER).toBeGreaterThan(SHOP.FRUGAL_PRICE_MULTIPLIER);
    });

    it('REPUTATION_PRICE_DIVISOR is positive', () => {
      expect(SHOP.REPUTATION_PRICE_DIVISOR).toBeGreaterThan(0);
    });

    it('CANT_AFFORD_LEAVE_REP_PENALTY is positive', () => {
      expect(SHOP.CANT_AFFORD_LEAVE_REP_PENALTY).toBeGreaterThan(0);
    });

    it('HP_RECOMMEND_THRESHOLD is between 0 and 1', () => {
      expect(SHOP.HP_RECOMMEND_THRESHOLD).toBeGreaterThan(0);
      expect(SHOP.HP_RECOMMEND_THRESHOLD).toBeLessThan(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Dungeon
  // ---------------------------------------------------------------------------

  describe('dungeon', () => {
    it('SURVIVAL_WARNING_THRESHOLD is between MIN and MAX survival', () => {
      expect(DUNGEON.SURVIVAL_WARNING_THRESHOLD).toBeGreaterThan(POTIONS.MIN_SURVIVAL_CHANCE);
      expect(DUNGEON.SURVIVAL_WARNING_THRESHOLD).toBeLessThan(POTIONS.MAX_SURVIVAL_CHANCE);
    });

    it('orders the dire, risky, and steady forecast bands', () => {
      expect(DUNGEON.SURVIVAL_STEADY_THRESHOLD).toBeGreaterThan(DUNGEON.SURVIVAL_WARNING_THRESHOLD);
      expect(DUNGEON.SURVIVAL_STEADY_THRESHOLD).toBeLessThanOrEqual(POTIONS.MAX_SURVIVAL_CHANCE);
    });

    it('MAX_FLOOR is 15', () => {
      expect(DUNGEON.MAX_FLOOR).toBe(15);
    });

    it('MAX_FLOOR matches FLOOR_ENCOUNTER_WEIGHTS key count', () => {
      expect(Object.keys(FLOOR_ENCOUNTER_WEIGHTS).length).toBe(DUNGEON.MAX_FLOOR);
    });

    it('EXPLORE_DURATION_MS < VICTORY_DURATION_MS', () => {
      expect(DUNGEON.EXPLORE_DURATION_MS).toBeLessThan(DUNGEON.VICTORY_DURATION_MS);
    });
  });

  // ---------------------------------------------------------------------------
  // Merchant
  // ---------------------------------------------------------------------------

  describe('merchant', () => {
    it('all stock values are positive', () => {
      expect(MERCHANT.BASE_HEALING_STOCK).toBeGreaterThan(0);
      expect(MERCHANT.BASE_STRENGTH_STOCK).toBeGreaterThan(0);
      expect(MERCHANT.BASE_DEFENSE_STOCK).toBeGreaterThan(0);
    });

    it('all costs are positive', () => {
      expect(MERCHANT.HEALING_COST).toBeGreaterThan(0);
      expect(MERCHANT.STRENGTH_COST).toBeGreaterThan(0);
      expect(MERCHANT.DEFENSE_COST).toBeGreaterThan(0);
    });

    it('DAY_BONUS_DIVISOR is positive', () => {
      expect(MERCHANT.DAY_BONUS_DIVISOR).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Guilt
  // ---------------------------------------------------------------------------

  describe('guilt thresholds', () => {
    it('thresholds are ascending (LOW < MEDIUM < HIGH)', () => {
      expect(GUILT.LOW_THRESHOLD).toBeLessThan(GUILT.MEDIUM_THRESHOLD);
      expect(GUILT.MEDIUM_THRESHOLD).toBeLessThan(GUILT.HIGH_THRESHOLD);
    });

    it('HIGH_THRESHOLD is below MAX_GUILT', () => {
      expect(GUILT.HIGH_THRESHOLD).toBeLessThan(POTIONS.MAX_GUILT);
    });
  });

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  describe('events', () => {
    it('MIN_DAYS_BETWEEN is positive', () => {
      expect(EVENTS.MIN_DAYS_BETWEEN).toBeGreaterThan(0);
    });

    it('TRIGGER_CHANCE is between 0 and 1', () => {
      expect(EVENTS.TRIGGER_CHANCE).toBeGreaterThan(0);
      expect(EVENTS.TRIGGER_CHANCE).toBeLessThanOrEqual(1);
    });

    it('review chances are between 0 and 1', () => {
      expect(EVENTS.REVIEW_CHANCE_SURVIVOR).toBeGreaterThan(0);
      expect(EVENTS.REVIEW_CHANCE_SURVIVOR).toBeLessThanOrEqual(1);
      expect(EVENTS.REVIEW_CHANCE_DEATH).toBeGreaterThan(0);
      expect(EVENTS.REVIEW_CHANCE_DEATH).toBeLessThanOrEqual(1);
    });
  });
});
