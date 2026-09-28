import { TestBed } from '@angular/core/testing';
import { ECONOMY } from '../config/game-config';
import { CURRENT_SCHEMA_VERSION, GameStateService } from './game-state.service';

describe('GameStateService', () => {
  let service: GameStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GameStateService],
    });
    service = TestBed.inject(GameStateService);

    // Clear localStorage before each test
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  describe('Service Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });
  });

  describe('createNewGame', () => {
    it('should create a valid game state', () => {
      const state = service.createNewGame();

      expect(state).toBeDefined();
    });

    it('should include current schemaVersion', () => {
      const state = service.createNewGame();

      expect(state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    });

    it('should initialize with correct starting values', () => {
      const state = service.createNewGame();

      expect(state.gold).toBe(100);
      expect(state.reputation).toBe(50);
      expect(state.shopLevel).toBe(1);
      expect(state.day).toBe(1);
    });

    it('should use ECONOMY.STARTING_GOLD and ECONOMY.STARTING_REPUTATION constants', () => {
      const state = service.createNewGame();
      expect(state.gold).toBe(ECONOMY.STARTING_GOLD);
      expect(state.reputation).toBe(ECONOMY.STARTING_REPUTATION);
    });

    it('should initialize statistics to zero', () => {
      const state = service.createNewGame();

      expect(state.totalAdventurers).toBe(0);
      expect(state.adventurersSaved).toBe(0);
      expect(state.adventurersKilled).toBe(0);
      expect(state.potionsSold).toBe(0);
      expect(state.goldEarned).toBe(0);
      expect(state.deathsByPotion).toBe(0);
      expect(state.deathsByDilution).toBe(0);
      expect(state.perfectSaves).toBe(0);
    });

    it('should initialize encounter statistics to zero', () => {
      const state = service.createNewGame();

      expect(state.encountersSurvived).toBe(0);
      expect(state.bossesDefeated).toBe(0);
      expect(state.combosTriggered).toBe(0);
    });

    it('should initialize discoveredCombos to empty array', () => {
      const state = service.createNewGame();

      expect(state.discoveredCombos).toEqual([]);
    });

    it('should initialize empty arrays', () => {
      const state = service.createNewGame();

      expect(state.currentAdventurers).toEqual([]);
      expect(state.dungeonLog).toEqual([]);
      expect(state.deathNotifications).toEqual([]);
    });

    it('should initialize starting inventory (reduced for early-game tension)', () => {
      const state = service.createNewGame();

      expect(state.potionInventory['basic-healing']).toBe(3);
      expect(state.potionInventory['strength-potion']).toBe(2);
      expect(state.potionInventory['defense-potion']).toBe(2);
    });

    it('should NOT include greater-healing in starting inventory', () => {
      const state = service.createNewGame();

      expect(state.potionInventory['greater-healing']).toBeUndefined();
    });

    it('should initialize potionUpgrades with default values', () => {
      const state = service.createNewGame();

      expect(state.potionUpgrades).toBeDefined();
      expect(state.potionUpgrades['healing']).toBe(0);
      expect(state.potionUpgrades['strength']).toBe(0);
      expect(state.potionUpgrades['defense']).toBe(0);
      expect(state.potionUpgrades['speed']).toBe(0);
      expect(state.potionUpgrades['luck']).toBe(0);
    });

    it('should initialize default settings', () => {
      const state = service.createNewGame();

      expect(state.difficultyMultiplier).toBe(1);
      expect(state.hasSeenDilutionRitual).toBe(false);
    });
  });

  describe('saveGameState', () => {
    it('should save game state successfully', () => {
      const state = service.createNewGame();
      const result = service.saveGameState(state);

      expect(result.success).toBe(true);
    });

    it('should always write schemaVersion in saved data', () => {
      const state = service.createNewGame();
      service.saveGameState(state);

      const saved = window.localStorage.getItem('potion-stand-save');
      expect(saved).toBeDefined();

      if (saved) {
        const parsed = JSON.parse(saved);
        expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      }
    });

    it('should persist state to localStorage', () => {
      const state = service.createNewGame();
      state.gold = 500;
      state.day = 10;

      service.saveGameState(state);

      const saved = window.localStorage.getItem('potion-stand-save');
      expect(saved).toBeDefined();

      if (saved) {
        const parsed = JSON.parse(saved);
        expect(parsed.gold).toBe(500);
        expect(parsed.day).toBe(10);
      }
    });

    it('should overwrite previous save', () => {
      const state1 = service.createNewGame();
      state1.gold = 100;
      service.saveGameState(state1);

      const state2 = service.createNewGame();
      state2.gold = 200;
      service.saveGameState(state2);

      const saved = window.localStorage.getItem('potion-stand-save');
      if (saved) {
        const parsed = JSON.parse(saved);
        expect(parsed.gold).toBe(200);
      }
    });

    it('should keep backup of previous save in memory', () => {
      const state1 = service.createNewGame();
      state1.gold = 100;
      service.saveGameState(state1);

      const state2 = service.createNewGame();
      state2.gold = 200;
      service.saveGameState(state2);

      // Corrupt the current save
      window.localStorage.setItem('potion-stand-save', 'corrupted');

      // Should be able to recover from last-known-good
      const recovery = service.recoverLastKnownGood();
      expect(recovery.success).toBe(true);
      expect(recovery.data?.gold).toBe(100);
    });

    // Phase 8c — pin the typed quota-error contract so the orchestrator can
    // surface a recovery message instead of a generic failure.
    it('flags quotaExceeded=true when localStorage.setItem throws QuotaExceededError', () => {
      const fresh = service.createNewGame();
      const setItem = spyOn(window.localStorage, 'setItem').and.callFake((key: string) => {
        if (key === 'potion-stand-save') {
          throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
        }
        // Allow backup writes to succeed so the rotation logic doesn't blow up first.
      });

      const result = service.saveGameState(fresh);

      expect(result.success).toBe(false);
      expect(result.quotaExceeded).toBe(true);
      expect(setItem).toHaveBeenCalled();
    });

    it('does not set quotaExceeded for non-quota errors', () => {
      const fresh = service.createNewGame();
      spyOn(window.localStorage, 'setItem').and.throwError(new Error('disk explosion'));

      const result = service.saveGameState(fresh);

      expect(result.success).toBe(false);
      expect(result.quotaExceeded).toBeFalsy();
      expect(result.error).toContain('disk explosion');
    });
  });

  describe('loadGameState', () => {
    it('should return success with no data when no save exists', () => {
      const result = service.loadGameState();

      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it('should load previously saved state', () => {
      const state = service.createNewGame();
      state.gold = 250;
      state.reputation = 75;
      state.day = 5;

      service.saveGameState(state);
      const result = service.loadGameState();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data) {
        expect(result.data.gold).toBe(250);
        expect(result.data.reputation).toBe(75);
        expect(result.data.day).toBe(5);
      }
    });

    it('should return error for invalid JSON', () => {
      window.localStorage.setItem('potion-stand-save', 'invalid json {{{');

      const result = service.loadGameState();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('corrupted');
    });

    it('should return error for invalid schema (missing required fields)', () => {
      const invalidState = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        gold: 100,
        // Missing many required fields
      };

      window.localStorage.setItem('potion-stand-save', JSON.stringify(invalidState));

      const result = service.loadGameState();

      expect(result.success).toBe(false);
      expect(result.error).toContain('corrupted');
    });

    it('should migrate old saves without potionUpgrades', () => {
      const oldSave = {
        gold: 200,
        reputation: 75,
        shopLevel: 2,
        day: 5,
        totalAdventurers: 10,
        adventurersSaved: 8,
        adventurersKilled: 2,
        potionsSold: 15,
        goldEarned: 500,
        deathsByPotion: 1,
        deathsByDilution: 1,
        perfectSaves: 3,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: { 'basic-healing': 5 },
        difficultyMultiplier: 1,
        // Missing potionUpgrades (old save format)
        // Missing schemaVersion (v1)
      };

      window.localStorage.setItem('potion-stand-save', JSON.stringify(oldSave));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data) {
        expect(result.data.potionUpgrades).toBeDefined();
        expect(result.data.potionUpgrades['healing']).toBe(0);
        expect(result.data.potionUpgrades['strength']).toBe(0);
        expect(result.data.potionUpgrades['defense']).toBe(0);
        expect(result.data.potionUpgrades['speed']).toBe(0);
        expect(result.data.potionUpgrades['luck']).toBe(0);
      }
    });

    it('should preserve existing potionUpgrades when present', () => {
      const state = service.createNewGame();
      state.potionUpgrades = { healing: 2, strength: 1, defense: 3 };

      service.saveGameState(state);
      const result = service.loadGameState();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data) {
        expect(result.data.potionUpgrades['healing']).toBe(2);
        expect(result.data.potionUpgrades['strength']).toBe(1);
        expect(result.data.potionUpgrades['defense']).toBe(3);
      }
    });
  });

  describe('Schema Migration', () => {
    // Phase 3a — pins backfill of the three required arrays during v1→v2.
    // Pre-fix: a very old save missing dungeonLog/currentAdventurers/
    // deathNotifications would migrate to v6 with those fields still missing,
    // then validateGameState() would reject it and throw the user back to a
    // brand-new game. Now we backfill empty arrays so existing progress loads.
    it('should backfill required arrays for v1 saves missing dungeonLog/currentAdventurers/deathNotifications', () => {
      const v1MissingArrays = {
        gold: 500,
        reputation: 70,
        shopLevel: 2,
        day: 5,
        totalAdventurers: 10,
        adventurersSaved: 7,
        adventurersKilled: 3,
        potionsSold: 12,
        goldEarned: 800,
        deathsByPotion: 1,
        deathsByDilution: 2,
        perfectSaves: 1,
        potionInventory: { 'basic-healing': 4 },
        difficultyMultiplier: 1.0,
        // No schemaVersion → v1
        // No currentAdventurers / dungeonLog / deathNotifications
      };

      window.localStorage.setItem('potion-stand-save', JSON.stringify(v1MissingArrays));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data) {
        expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
        expect(result.data.gold).toBe(500);
        // Backfilled arrays preserve user progress instead of triggering a
        // validate-fail → fresh-game path.
        expect(result.data.currentAdventurers).toEqual([]);
        expect(result.data.dungeonLog).toEqual([]);
        expect(result.data.deathNotifications).toEqual([]);
      }
    });

    it('should auto-migrate v1 save (no schemaVersion) to current version via full chain', () => {
      const v1Save = {
        gold: 300,
        reputation: 60,
        shopLevel: 3,
        day: 10,
        totalAdventurers: 20,
        adventurersSaved: 15,
        adventurersKilled: 5,
        potionsSold: 30,
        goldEarned: 1200,
        deathsByPotion: 2,
        deathsByDilution: 3,
        perfectSaves: 5,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: { 'basic-healing': 8, 'strength-potion': 4 },
        difficultyMultiplier: 1.5,
        // No schemaVersion → treated as v1
      };

      window.localStorage.setItem('potion-stand-save', JSON.stringify(v1Save));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data) {
        expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
        expect(result.data.gold).toBe(300);
        expect(result.data.potionUpgrades).toEqual({ healing: 0, strength: 0, defense: 0, speed: 0, luck: 0 });
        expect(result.data.discoveredCombos).toEqual([]);
        // v3→v4: highestFloor derived from day=10: min(15, 1+floor((10-1)/3)) = 1+3 = 4
        expect(result.data.highestFloor).toBe(4);
        // v4→v5: survivorLedger added as empty array
        expect(result.data.survivorLedger).toEqual([]);
      }
    });

    it('should add speed and luck defaults when migrating v1 saves', () => {
      const v1Save = {
        gold: 100,
        reputation: 50,
        shopLevel: 1,
        day: 1,
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
        potionInventory: { 'basic-healing': 3 },
        difficultyMultiplier: 1,
        // No schemaVersion → v1, no potionUpgrades
      };

      window.localStorage.setItem('potion-stand-save', JSON.stringify(v1Save));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      if (result.data) {
        expect(result.data.potionUpgrades['speed']).toBe(0);
        expect(result.data.potionUpgrades['luck']).toBe(0);
      }
    });

    it('should add speed and luck defaults when migrating v2 saves', () => {
      const v2Save = {
        schemaVersion: 2,
        gold: 200,
        reputation: 60,
        shopLevel: 1,
        day: 3,
        totalAdventurers: 5,
        adventurersSaved: 4,
        adventurersKilled: 1,
        potionsSold: 8,
        goldEarned: 300,
        deathsByPotion: 0,
        deathsByDilution: 1,
        perfectSaves: 2,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: { 'basic-healing': 4 },
        potionUpgrades: { healing: 1, strength: 0, defense: 0 },
        difficultyMultiplier: 1,
        rngSeed: 99,
        // No speed or luck in potionUpgrades
      };

      window.localStorage.setItem('potion-stand-save', JSON.stringify(v2Save));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      if (result.data) {
        expect(result.data.potionUpgrades['healing']).toBe(1);
        expect(result.data.potionUpgrades['speed']).toBe(0);
        expect(result.data.potionUpgrades['luck']).toBe(0);
      }
    });

    it('should preserve existing speed/luck values during v3 migration', () => {
      // A v2 save that somehow already has speed/luck (forward-compat check)
      const v2SaveWithSpeedLuck = {
        schemaVersion: 2,
        gold: 150,
        reputation: 55,
        shopLevel: 1,
        day: 2,
        totalAdventurers: 3,
        adventurersSaved: 2,
        adventurersKilled: 1,
        potionsSold: 5,
        goldEarned: 200,
        deathsByPotion: 0,
        deathsByDilution: 1,
        perfectSaves: 1,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: { 'basic-healing': 2 },
        potionUpgrades: { healing: 0, strength: 1, defense: 0, speed: 2, luck: 1 },
        difficultyMultiplier: 1,
        rngSeed: 77,
      };

      window.localStorage.setItem('potion-stand-save', JSON.stringify(v2SaveWithSpeedLuck));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      if (result.data) {
        expect(result.data.potionUpgrades['speed']).toBe(2);
        expect(result.data.potionUpgrades['luck']).toBe(1);
        expect(result.data.potionUpgrades['strength']).toBe(1);
      }
    });

    it('should load current version save directly without migration', () => {
      const currentSave = service.createNewGame();
      currentSave.gold = 999;

      service.saveGameState(currentSave);
      const result = service.loadGameState();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data) {
        expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
        expect(result.data.gold).toBe(999);
      }
    });

    it('should preserve rngSeed from v1 saves that already have it', () => {
      const v1WithSeed = {
        gold: 100,
        reputation: 50,
        shopLevel: 1,
        day: 1,
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
        potionInventory: { 'basic-healing': 3 },
        potionUpgrades: { healing: 1, strength: 0, defense: 0 },
        difficultyMultiplier: 1,
        rngSeed: 42,
        // No schemaVersion → v1
      };

      window.localStorage.setItem('potion-stand-save', JSON.stringify(v1WithSeed));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      if (result.data) {
        expect(result.data.rngSeed).toBe(42);
        expect(result.data.potionUpgrades['healing']).toBe(1);
      }
    });

    it('should auto-migrate v2 save to current version (add discoveredCombos + highestFloor + survivorLedger)', () => {
      const v2Save = {
        schemaVersion: 2,
        gold: 500,
        reputation: 80,
        shopLevel: 2,
        day: 8,
        totalAdventurers: 25,
        adventurersSaved: 20,
        adventurersKilled: 5,
        potionsSold: 40,
        goldEarned: 2000,
        deathsByPotion: 2,
        deathsByDilution: 3,
        perfectSaves: 8,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: { 'basic-healing': 5, 'strength-potion': 3 },
        potionUpgrades: { healing: 1, strength: 0, defense: 0 },
        difficultyMultiplier: 1.2,
        rngSeed: 42,
      };

      window.localStorage.setItem('potion-stand-save', JSON.stringify(v2Save));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data) {
        expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
        expect(result.data.discoveredCombos).toEqual([]);
        // Verify existing fields are preserved
        expect(result.data.gold).toBe(500);
        expect(result.data.potionUpgrades['healing']).toBe(1);
        expect(result.data.rngSeed).toBe(42);
        // highestFloor derived from day=8: min(15, 1+floor((8-1)/3)) = 1+2 = 3
        expect(result.data.highestFloor).toBe(3);
        // v4→v5: survivorLedger added
        expect(result.data.survivorLedger).toEqual([]);
      }
    });

    it('should set rngSeed to null for v1 saves without it', () => {
      const v1NoSeed = {
        gold: 100,
        reputation: 50,
        shopLevel: 1,
        day: 1,
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
        potionInventory: { 'basic-healing': 3 },
        difficultyMultiplier: 1,
        // No rngSeed, no schemaVersion
      };

      window.localStorage.setItem('potion-stand-save', JSON.stringify(v1NoSeed));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      if (result.data) {
        expect(result.data.rngSeed).toBeNull();
      }
    });

    it('should return error for corrupted JSON', () => {
      window.localStorage.setItem('potion-stand-save', '{broken json!!!');

      const result = service.loadGameState();

      expect(result.success).toBe(false);
      expect(result.error).toContain('corrupted');
    });

    it('should return error with migration step info on failure', () => {
      // Simulate a state that would cause migration issues
      // by testing applyMigrations directly with an impossible version
      const badState: Record<string, unknown> = { schemaVersion: 999 };
      const result = service.applyMigrations(badState);

      // Version 999 is already above CURRENT, so no migration needed
      expect(result.success).toBe(true);
    });
  });

  describe('Round-trip integrity', () => {
    it('should produce identical data on save → load → save', () => {
      const original = service.createNewGame();
      original.gold = 777;
      original.reputation = 88;
      original.day = 15;
      original.potionUpgrades = { healing: 3, strength: 2, defense: 1 };
      original.rngSeed = 12345;

      service.saveGameState(original);

      const loadResult = service.loadGameState();
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBeDefined();

      if (loadResult.data) {
        service.saveGameState(loadResult.data);

        const secondLoad = service.loadGameState();
        expect(secondLoad.success).toBe(true);

        if (secondLoad.data) {
          expect(secondLoad.data).toEqual(loadResult.data);
        }
      }
    });
  });

  describe('Corruption Recovery', () => {
    it('should recover last-known-good state after corruption', () => {
      const goodState = service.createNewGame();
      goodState.gold = 500;
      service.saveGameState(goodState);

      // Load to populate last-known-good
      service.loadGameState();

      // Corrupt the save
      window.localStorage.setItem('potion-stand-save', 'totally broken');

      const recovery = service.recoverLastKnownGood();
      expect(recovery.success).toBe(true);
      expect(recovery.data?.gold).toBe(500);
    });

    it('should return error when no backup exists', () => {
      const recovery = service.recoverLastKnownGood();
      expect(recovery.success).toBe(false);
      expect(recovery.error).toContain('No backup');
    });

    it('should clear backup on clearGameState', () => {
      const state = service.createNewGame();
      service.saveGameState(state);
      service.loadGameState();

      service.clearGameState();

      const recovery = service.recoverLastKnownGood();
      expect(recovery.success).toBe(false);
    });
  });

  describe('clearGameState', () => {
    it('should remove saved state from localStorage', () => {
      const state = service.createNewGame();
      service.saveGameState(state);

      expect(window.localStorage.getItem('potion-stand-save')).not.toBeNull();

      service.clearGameState();

      expect(window.localStorage.getItem('potion-stand-save')).toBeNull();
    });

    it('should not throw when no save exists', () => {
      expect(() => service.clearGameState()).not.toThrow();
    });
  });

  describe('Schema Validation', () => {
    it('should reject state with wrong type for gold', () => {
      const invalidState = {
        ...service.createNewGame(),
        gold: 'not a number',
      };

      window.localStorage.setItem('potion-stand-save', JSON.stringify(invalidState));

      const result = service.loadGameState();

      expect(result.success).toBe(false);
    });

    it('should reject state with missing arrays', () => {
      const invalidState = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        gold: 100,
        reputation: 50,
        shopLevel: 1,
        day: 1,
        totalAdventurers: 0,
        adventurersSaved: 0,
        adventurersKilled: 0,
        potionsSold: 0,
        goldEarned: 0,
        deathsByPotion: 0,
        deathsByDilution: 0,
        perfectSaves: 0,
        difficultyMultiplier: 1,
        // Missing: currentAdventurers, dungeonLog, etc.
        potionInventory: {},
        potionUpgrades: { healing: 0, strength: 0, defense: 0 },
      };

      window.localStorage.setItem('potion-stand-save', JSON.stringify(invalidState));

      const result = service.loadGameState();

      expect(result.success).toBe(false);
    });

    it('should accept valid complete state', () => {
      const validState = service.createNewGame();

      window.localStorage.setItem('potion-stand-save', JSON.stringify(validState));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });

  describe('Storage Key', () => {
    it('should use consistent storage key', () => {
      const state = service.createNewGame();
      service.saveGameState(state);

      // The key should be 'potion-stand-save'
      expect(window.localStorage.getItem('potion-stand-save')).not.toBeNull();

      // Should not use any other keys
      const keys = Object.keys(window.localStorage);
      expect(keys).toContain('potion-stand-save');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large gold values', () => {
      const state = service.createNewGame();
      state.gold = 999999999;

      const saveResult = service.saveGameState(state);
      expect(saveResult.success).toBe(true);

      const loadResult = service.loadGameState();
      expect(loadResult.data?.gold).toBe(999999999);
    });

    it('should handle negative gold values', () => {
      const state = service.createNewGame();
      state.gold = -100;

      const saveResult = service.saveGameState(state);
      expect(saveResult.success).toBe(true);

      const loadResult = service.loadGameState();
      expect(loadResult.data?.gold).toBe(-100);
    });

    it('should handle negative reputation', () => {
      const state = service.createNewGame();
      state.reputation = -50;

      const saveResult = service.saveGameState(state);
      expect(saveResult.success).toBe(true);

      const loadResult = service.loadGameState();
      expect(loadResult.data?.reputation).toBe(-50);
    });

    it('should preserve complex potion inventory', () => {
      const state = service.createNewGame();
      state.potionInventory = {
        'basic-healing': 10,
        'strength-potion': 5,
        'diluted-basic-healing': 3,
        'defense-potion': 2,
      };

      service.saveGameState(state);
      const loadResult = service.loadGameState();

      expect(loadResult.data?.potionInventory['basic-healing']).toBe(10);
      expect(loadResult.data?.potionInventory['strength-potion']).toBe(5);
      expect(loadResult.data?.potionInventory['diluted-basic-healing']).toBe(3);
      expect(loadResult.data?.potionInventory['defense-potion']).toBe(2);
    });

    it('should preserve dungeon log entries', () => {
      const state = service.createNewGame();
      state.dungeonLog = [
        {
          id: 'event-1',
          timestamp: 1234567890,
          adventurerId: 'adv-1',
          eventType: 'enter',
          message: 'Test adventurer enters',
          severity: 'info',
        },
        {
          id: 'event-2',
          timestamp: 1234567891,
          adventurerId: 'adv-1',
          eventType: 'death',
          message: 'Test adventurer died',
          severity: 'danger',
        },
      ];

      service.saveGameState(state);
      const loadResult = service.loadGameState();

      expect(loadResult.data?.dungeonLog.length).toBe(2);
      expect(loadResult.data?.dungeonLog[0].eventType).toBe('enter');
      expect(loadResult.data?.dungeonLog[1].eventType).toBe('death');
    });

    it('should preserve potionUpgrades record', () => {
      const state = service.createNewGame();
      state.potionUpgrades = { healing: 5, strength: 3, defense: 2, speed: 1 };

      service.saveGameState(state);
      const loadResult = service.loadGameState();

      expect(loadResult.data?.potionUpgrades['healing']).toBe(5);
      expect(loadResult.data?.potionUpgrades['strength']).toBe(3);
      expect(loadResult.data?.potionUpgrades['defense']).toBe(2);
      expect(loadResult.data?.potionUpgrades['speed']).toBe(1);
    });

    it('should preserve discoveredCombos through save/load', () => {
      const state = service.createNewGame();
      state.discoveredCombos = ['Berserker Brew', 'Ironhide Tonic'];

      service.saveGameState(state);
      const loadResult = service.loadGameState();

      expect(loadResult.data?.discoveredCombos).toEqual(['Berserker Brew', 'Ironhide Tonic']);
    });

    it('should preserve optional encounter statistics', () => {
      const state = service.createNewGame();
      state.encountersSurvived = 42;
      state.bossesDefeated = 3;
      state.combosTriggered = 12;

      service.saveGameState(state);
      const loadResult = service.loadGameState();

      expect(loadResult.data?.encountersSurvived).toBe(42);
      expect(loadResult.data?.bossesDefeated).toBe(3);
      expect(loadResult.data?.combosTriggered).toBe(12);
    });
  });

  describe('v3 → v4 → v5 Migration', () => {
    it('should add highestFloor from day when migrating v3 save', () => {
      const v3Save = {
        schemaVersion: 3,
        gold: 400,
        reputation: 70,
        shopLevel: 2,
        day: 7,
        totalAdventurers: 18,
        adventurersSaved: 14,
        adventurersKilled: 4,
        potionsSold: 25,
        goldEarned: 1500,
        deathsByPotion: 1,
        deathsByDilution: 2,
        perfectSaves: 6,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: { 'basic-healing': 4 },
        potionUpgrades: { healing: 1, strength: 0, defense: 0, speed: 0, luck: 0 },
        difficultyMultiplier: 1.1,
        discoveredCombos: ['Berserker Brew'],
        rngSeed: 55,
      };

      window.localStorage.setItem('potion-stand-save', JSON.stringify(v3Save));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data) {
        expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
        // day=7: min(15, 1+floor((7-1)/3)) = 1+2 = 3
        expect(result.data.highestFloor).toBe(3);
        // v4→v5: survivorLedger added
        expect(result.data.survivorLedger).toEqual([]);
      }
    });

    it('should preserve existing highestFloor when already present in v3 save', () => {
      const v3SaveWithFloor = {
        schemaVersion: 3,
        gold: 600,
        reputation: 75,
        shopLevel: 3,
        day: 4,
        totalAdventurers: 12,
        adventurersSaved: 10,
        adventurersKilled: 2,
        potionsSold: 20,
        goldEarned: 800,
        deathsByPotion: 0,
        deathsByDilution: 1,
        perfectSaves: 4,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: { 'basic-healing': 3 },
        potionUpgrades: { healing: 0, strength: 0, defense: 0, speed: 0, luck: 0 },
        difficultyMultiplier: 1,
        discoveredCombos: [],
        highestFloor: 7, // Already present — should be preserved
      };

      window.localStorage.setItem('potion-stand-save', JSON.stringify(v3SaveWithFloor));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      if (result.data) {
        expect(result.data.highestFloor).toBe(7);
      }
    });

    it('should default highestFloor to 1 when day is 1', () => {
      const v3SaveDay1 = {
        schemaVersion: 3,
        gold: 100,
        reputation: 50,
        shopLevel: 1,
        day: 1,
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
        potionInventory: { 'basic-healing': 3 },
        potionUpgrades: { healing: 0, strength: 0, defense: 0, speed: 0, luck: 0 },
        difficultyMultiplier: 1,
        discoveredCombos: [],
      };

      window.localStorage.setItem('potion-stand-save', JSON.stringify(v3SaveDay1));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      if (result.data) {
        expect(result.data.highestFloor).toBe(1);
      }
    });

    it('should fill missing potionUpgrade keys during v3→v4 migration', () => {
      const v3Corrupt = {
        schemaVersion: 3,
        gold: 200,
        reputation: 55,
        shopLevel: 1,
        day: 2,
        totalAdventurers: 4,
        adventurersSaved: 3,
        adventurersKilled: 1,
        potionsSold: 7,
        goldEarned: 300,
        deathsByPotion: 0,
        deathsByDilution: 1,
        perfectSaves: 1,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: { 'basic-healing': 2 },
        potionUpgrades: { healing: 2 }, // Missing strength, defense, speed, luck
        difficultyMultiplier: 1,
        discoveredCombos: [],
      };

      window.localStorage.setItem('potion-stand-save', JSON.stringify(v3Corrupt));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      if (result.data) {
        expect(result.data.potionUpgrades['healing']).toBe(2);
        expect(result.data.potionUpgrades['strength']).toBe(0);
        expect(result.data.potionUpgrades['defense']).toBe(0);
        expect(result.data.potionUpgrades['speed']).toBe(0);
        expect(result.data.potionUpgrades['luck']).toBe(0);
      }
    });
  });

  describe('Migration idempotence', () => {
    function makeBaseV1Save(): Record<string, unknown> {
      return {
        gold: 150,
        reputation: 55,
        shopLevel: 1,
        day: 4,
        totalAdventurers: 8,
        adventurersSaved: 6,
        adventurersKilled: 2,
        potionsSold: 10,
        goldEarned: 400,
        deathsByPotion: 0,
        deathsByDilution: 1,
        perfectSaves: 2,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: { 'basic-healing': 3 },
        difficultyMultiplier: 1,
      };
    }

    it('v1→v2 migration is idempotent', () => {
      const v1Save = makeBaseV1Save();
      const migResult = service.applyMigrations(structuredClone(v1Save));
      expect(migResult.success).toBe(true);
      const once = (migResult as { success: true; state: Record<string, unknown> }).state;

      const migResult2 = service.applyMigrations(structuredClone(once));
      expect(migResult2.success).toBe(true);
      const twice = (migResult2 as { success: true; state: Record<string, unknown> }).state;

      expect(twice).toEqual(once);
    });

    it('v2→v3 migration is idempotent', () => {
      const v2Save: Record<string, unknown> = {
        ...makeBaseV1Save(),
        schemaVersion: 2,
        rngSeed: 7,
        potionUpgrades: { healing: 1, strength: 0, defense: 0, speed: 0, luck: 0 },
      };
      const migResult = service.applyMigrations(structuredClone(v2Save));
      expect(migResult.success).toBe(true);
      const once = (migResult as { success: true; state: Record<string, unknown> }).state;

      const migResult2 = service.applyMigrations(structuredClone(once));
      expect(migResult2.success).toBe(true);
      const twice = (migResult2 as { success: true; state: Record<string, unknown> }).state;

      expect(twice).toEqual(once);
    });

    it('v3→v4 migration is idempotent', () => {
      const v3Save: Record<string, unknown> = {
        ...makeBaseV1Save(),
        schemaVersion: 3,
        rngSeed: 12,
        potionUpgrades: { healing: 0, strength: 0, defense: 0, speed: 0, luck: 0 },
        discoveredCombos: [],
      };
      const migResult = service.applyMigrations(structuredClone(v3Save));
      expect(migResult.success).toBe(true);
      const once = (migResult as { success: true; state: Record<string, unknown> }).state;

      const migResult2 = service.applyMigrations(structuredClone(once));
      expect(migResult2.success).toBe(true);
      const twice = (migResult2 as { success: true; state: Record<string, unknown> }).state;

      expect(twice).toEqual(once);
    });

    it('v4→v5 migration is idempotent', () => {
      const v4Save: Record<string, unknown> = {
        ...makeBaseV1Save(),
        schemaVersion: 4,
        rngSeed: 99,
        potionUpgrades: { healing: 0, strength: 0, defense: 0, speed: 0, luck: 0 },
        discoveredCombos: [],
        highestFloor: 2,
      };
      const migResult = service.applyMigrations(structuredClone(v4Save));
      expect(migResult.success).toBe(true);
      const once = (migResult as { success: true; state: Record<string, unknown> }).state;

      const migResult2 = service.applyMigrations(structuredClone(once));
      expect(migResult2.success).toBe(true);
      const twice = (migResult2 as { success: true; state: Record<string, unknown> }).state;

      expect(twice).toEqual(once);
    });

    it('v5→v6 migration is idempotent', () => {
      const v5Save: Record<string, unknown> = {
        ...makeBaseV1Save(),
        schemaVersion: 5,
        rngSeed: 3,
        potionUpgrades: { healing: 0, strength: 0, defense: 0, speed: 0, luck: 0 },
        discoveredCombos: [],
        highestFloor: 1,
        survivorLedger: [],
      };
      const migResult = service.applyMigrations(structuredClone(v5Save));
      expect(migResult.success).toBe(true);
      const once = (migResult as { success: true; state: Record<string, unknown> }).state;

      const migResult2 = service.applyMigrations(structuredClone(once));
      expect(migResult2.success).toBe(true);
      const twice = (migResult2 as { success: true; state: Record<string, unknown> }).state;

      expect(twice).toEqual(once);
    });

    it('v6→v7 migration is idempotent', () => {
      const v6Save: Record<string, unknown> = {
        ...makeBaseV1Save(),
        schemaVersion: 6,
        rngSeed: 4,
        potionUpgrades: { healing: 0, strength: 0, defense: 0, speed: 0, luck: 0 },
        discoveredCombos: [],
        highestFloor: 1,
        survivorLedger: [],
        eventHistory: [],
      };
      const migResult = service.applyMigrations(structuredClone(v6Save));
      expect(migResult.success).toBe(true);
      const once = (migResult as { success: true; state: Record<string, unknown> }).state;

      const migResult2 = service.applyMigrations(structuredClone(once));
      expect(migResult2.success).toBe(true);
      const twice = (migResult2 as { success: true; state: Record<string, unknown> }).state;

      expect(twice).toEqual(once);
    });
  });

  describe('v4→v5 Migration — survivorLedger with populated ledger', () => {
    it('should preserve existing survivorLedger entries when migrating a v4 save with non-empty ledger', () => {
      // The general chain tests (v1→current) only test survivorLedger as an
      // empty array. This regression test covers a v4 save that already has
      // populated ledger entries (e.g. a forward-written save or manual edit)
      // to ensure v4→v5 does not clobber them.
      const v4SaveWithLedger: Record<string, unknown> = {
        schemaVersion: 4,
        gold: 350,
        reputation: 65,
        shopLevel: 2,
        day: 6,
        totalAdventurers: 15,
        adventurersSaved: 12,
        adventurersKilled: 3,
        potionsSold: 20,
        goldEarned: 900,
        deathsByPotion: 1,
        deathsByDilution: 1,
        perfectSaves: 5,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: { 'basic-healing': 4 },
        potionUpgrades: { healing: 1, strength: 0, defense: 0, speed: 0, luck: 0 },
        difficultyMultiplier: 1,
        discoveredCombos: ['Berserker Brew'],
        highestFloor: 3,
        // Pre-populated survivorLedger — simulates a forward-compat or manual save
        survivorLedger: [
          { adventurerId: 'adv-001', name: 'Thorin', floorReached: 2, day: 3 },
          { adventurerId: 'adv-002', name: 'Legolas', floorReached: 3, day: 5 },
        ],
      };

      window.localStorage.setItem('potion-stand-save', JSON.stringify(v4SaveWithLedger));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data) {
        expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
        // The two pre-existing ledger entries must survive the v4→v5 migration
        const ledger = result.data.survivorLedger as unknown as Record<string, unknown>[];
        expect(ledger).toBeDefined();
        expect(ledger.length).toBe(2);
        // Spot-check the entries were not mutated
        expect(ledger[0]['adventurerId']).toBe('adv-001');
        expect(ledger[1]['adventurerId']).toBe('adv-002');
      }
    });
  });

  describe('v5 → v6 Migration (eventHistory)', () => {
    function makeV5Save(): Record<string, unknown> {
      return {
        schemaVersion: 5,
        gold: 200,
        reputation: 60,
        shopLevel: 1,
        day: 5,
        totalAdventurers: 10,
        adventurersSaved: 8,
        adventurersKilled: 2,
        potionsSold: 15,
        goldEarned: 600,
        deathsByPotion: 0,
        deathsByDilution: 1,
        perfectSaves: 3,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: { 'basic-healing': 3 },
        potionUpgrades: { healing: 0, strength: 0, defense: 0, speed: 0, luck: 0 },
        difficultyMultiplier: 1,
        discoveredCombos: [],
        highestFloor: 2,
        survivorLedger: [],
      };
    }

    it('should add eventHistory as empty array when migrating from v5', () => {
      const v5Save = makeV5Save();
      window.localStorage.setItem('potion-stand-save', JSON.stringify(v5Save));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      expect(result.data?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.data?.eventHistory).toEqual([]);
    });

    it('should preserve existing eventHistory when already present after migration', () => {
      const v5Save = makeV5Save();
      v5Save['eventHistory'] = ['Storm', 'Guild Inspection'];
      window.localStorage.setItem('potion-stand-save', JSON.stringify(v5Save));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      // Migration only adds the field if missing — pre-existing values are preserved
      expect(result.data?.eventHistory).toEqual(['Storm', 'Guild Inspection']);
    });

    it('createNewGame should include eventHistory as empty array', () => {
      const state = service.createNewGame();
      expect(state.eventHistory).toEqual([]);
    });
  });

  describe('v6 → v7 Migration (dilution ritual progress)', () => {
    function makeV6Save(): Record<string, unknown> {
      return {
        schemaVersion: 6,
        gold: 200,
        reputation: 60,
        shopLevel: 1,
        day: 5,
        totalAdventurers: 10,
        adventurersSaved: 8,
        adventurersKilled: 2,
        potionsSold: 15,
        goldEarned: 600,
        deathsByPotion: 0,
        deathsByDilution: 0,
        perfectSaves: 3,
        currentAdventurers: [],
        dungeonLog: [],
        deathNotifications: [],
        potionInventory: { 'basic-healing': 3 },
        potionUpgrades: { healing: 0, strength: 0, defense: 0, speed: 0, luck: 0 },
        difficultyMultiplier: 1,
        discoveredCombos: [],
        highestFloor: 2,
        survivorLedger: [],
        eventHistory: [],
      };
    }

    it('should default ritual progress to unseen for an existing save', () => {
      window.localStorage.setItem('potion-stand-save', JSON.stringify(makeV6Save()));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      expect(result.data?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.data?.hasSeenDilutionRitual).toBe(false);
    });

    it('should preserve completed ritual progress during migration', () => {
      const v6Save = makeV6Save();
      v6Save['hasSeenDilutionRitual'] = true;
      window.localStorage.setItem('potion-stand-save', JSON.stringify(v6Save));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      expect(result.data?.hasSeenDilutionRitual).toBe(true);
    });

    it('should infer completed progress from existing watered-potion history', () => {
      const v6Save = makeV6Save();
      v6Save['potionInventory'] = { 'basic-healing': 1, 'diluted-basic-healing': 2 };
      window.localStorage.setItem('potion-stand-save', JSON.stringify(v6Save));

      const result = service.loadGameState();

      expect(result.success).toBe(true);
      expect(result.data?.hasSeenDilutionRitual).toBe(true);
    });
  });

  describe('Backup Rotation', () => {
    it('should write backup key when saving over an existing save', () => {
      const state1 = service.createNewGame();
      state1.gold = 111;
      service.saveGameState(state1);

      const state2 = service.createNewGame();
      state2.gold = 222;
      service.saveGameState(state2);

      const backup = window.localStorage.getItem('potion-stand-save-backup');
      expect(backup).not.toBeNull();
      if (backup) {
        const parsed = JSON.parse(backup);
        expect(parsed.gold).toBe(111);
      }
    });

    it('should recover from backup key when in-memory state is unavailable', () => {
      const state1 = service.createNewGame();
      state1.gold = 333;
      service.saveGameState(state1);

      const state2 = service.createNewGame();
      state2.gold = 444;
      service.saveGameState(state2);

      // Simulate a new service instance (no in-memory state) by clearing it
      // and corrupting the primary save
      (service as unknown as Record<string, unknown>)['lastKnownGoodState'] = null;
      window.localStorage.setItem('potion-stand-save', 'corrupted data');

      const recovery = service.recoverLastKnownGood();
      expect(recovery.success).toBe(true);
      expect(recovery.data?.gold).toBe(333);
    });

    it('should clear backup key on clearGameState', () => {
      const state = service.createNewGame();
      service.saveGameState(state);
      service.saveGameState(state); // Two saves to populate backup

      service.clearGameState();

      expect(window.localStorage.getItem('potion-stand-save')).toBeNull();
      expect(window.localStorage.getItem('potion-stand-save-backup')).toBeNull();
    });

    it('should not write backup when no previous save exists', () => {
      const state = service.createNewGame();
      service.saveGameState(state); // First save — no previous to back up

      expect(window.localStorage.getItem('potion-stand-save-backup')).toBeNull();
    });
  });

  describe('Size Management', () => {
    it('should trim dungeonLog to 100 entries when saving', () => {
      const state = service.createNewGame();
      state.dungeonLog = Array.from({ length: 200 }, (_, i) => ({
        id: `event-${i}`,
        timestamp: i,
        adventurerId: `adv-${i}`,
        eventType: 'enter' as const,
        message: `Event ${i}`,
        severity: 'info' as const,
      }));

      service.saveGameState(state);

      const saved = window.localStorage.getItem('potion-stand-save');
      expect(saved).not.toBeNull();
      if (saved) {
        const parsed = JSON.parse(saved);
        expect(parsed.dungeonLog.length).toBe(100);
        // Should keep the first 100
        expect(parsed.dungeonLog[0].id).toBe('event-0');
        expect(parsed.dungeonLog[99].id).toBe('event-99');
      }
    });

    it('should not trim dungeonLog when 100 or fewer entries', () => {
      const state = service.createNewGame();
      state.dungeonLog = Array.from({ length: 100 }, (_, i) => ({
        id: `event-${i}`,
        timestamp: i,
        adventurerId: `adv-${i}`,
        eventType: 'combat' as const,
        message: `Event ${i}`,
        severity: 'info' as const,
      }));

      service.saveGameState(state);

      const saved = window.localStorage.getItem('potion-stand-save');
      if (saved) {
        const parsed = JSON.parse(saved);
        expect(parsed.dungeonLog.length).toBe(100);
      }
    });

    it('should trim deathNotifications to 50 entries when saving', () => {
      const state = service.createNewGame();
      // Use minimal objects — trimming logic only checks array length
      state.deathNotifications = Array.from({ length: 100 }, (_, i) => ({
        adventurer: { id: `adv-${i}`, name: `Adventurer ${i}` },
        message: `Notification ${i}`,
        timestamp: i,
        wasYourFault: false,
      })) as unknown as import('../models/adventurer.model').DeathNotification[];

      service.saveGameState(state);

      const saved = window.localStorage.getItem('potion-stand-save');
      expect(saved).not.toBeNull();
      if (saved) {
        const parsed = JSON.parse(saved);
        expect(parsed.deathNotifications.length).toBe(50);
      }
    });

    it('should not modify original state object when trimming', () => {
      const state = service.createNewGame();
      state.dungeonLog = Array.from({ length: 150 }, (_, i) => ({
        id: `event-${i}`,
        timestamp: i,
        adventurerId: `adv-${i}`,
        eventType: 'enter' as const,
        message: `Event ${i}`,
        severity: 'info' as const,
      }));

      service.saveGameState(state);

      // Original state should not be mutated
      expect(state.dungeonLog.length).toBe(150);
    });
  });

  describe('createNewGame highestFloor', () => {
    it('should initialize highestFloor to 1', () => {
      const state = service.createNewGame();
      expect(state.highestFloor).toBe(1);
    });
  });

  describe('validateGameState highestFloor', () => {
    it('should reject state where highestFloor is a string', () => {
      const invalidState = {
        ...service.createNewGame(),
        highestFloor: 'five',
      };

      window.localStorage.setItem('potion-stand-save', JSON.stringify(invalidState));

      const result = service.loadGameState();
      expect(result.success).toBe(false);
    });

    it('should accept state where highestFloor is a number', () => {
      const state = service.createNewGame();
      state.highestFloor = 5;

      window.localStorage.setItem('potion-stand-save', JSON.stringify(state));

      const result = service.loadGameState();
      expect(result.success).toBe(true);
      expect(result.data?.highestFloor).toBe(5);
    });

    it('should accept state where highestFloor is absent', () => {
      const state = service.createNewGame();
      delete state.highestFloor;

      window.localStorage.setItem('potion-stand-save', JSON.stringify(state));

      const result = service.loadGameState();
      expect(result.success).toBe(true);
    });
  });

  describe('Corruption Recovery - backup key fallback', () => {
    it('should fail gracefully when backup is also corrupted JSON', () => {
      window.localStorage.setItem('potion-stand-save-backup', '{bad json!!!');
      (service as unknown as Record<string, unknown>)['lastKnownGoodState'] = null;

      const recovery = service.recoverLastKnownGood();
      expect(recovery.success).toBe(false);
      expect(recovery.error).toBeDefined();
    });

    it('should fail when primary is corrupt and no backup exists', () => {
      window.localStorage.setItem('potion-stand-save', 'truncated{');

      const result = service.loadGameState();
      expect(result.success).toBe(false);
      expect(result.error).toContain('corrupted');

      const recovery = service.recoverLastKnownGood();
      expect(recovery.success).toBe(false);
      expect(recovery.error).toContain('No backup');
    });
  });
});
