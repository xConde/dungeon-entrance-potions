import { Injectable, OnDestroy, signal } from '@angular/core';
import { environment } from 'environments/environment';
import { ECONOMY } from '../config/game-config';
import { GameState } from '../models/game-state.model';

export const CURRENT_SCHEMA_VERSION = 7;

export interface SaveLoadResult {
  success: boolean;
  error?: string;
  data?: GameState;
  /** Phase 8c — true when the failure was a localStorage quota error. */
  quotaExceeded?: boolean;
}

export interface Migration {
  fromVersion: number;
  toVersion: number;
  migrate: (state: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Ordered list of migrations. Each step takes a raw state object from
 * `fromVersion` and returns the state at `toVersion`.
 */
const MIGRATIONS: readonly Migration[] = [
  {
    fromVersion: 1,
    toVersion: 2,
    migrate: (state: Record<string, unknown>): Record<string, unknown> => {
      // Add schema version
      state['schemaVersion'] = 2;

      // Ensure rngSeed exists (null → fresh seed generated on load)
      if (!('rngSeed' in state) || typeof state['rngSeed'] !== 'number') {
        state['rngSeed'] = null;
      }

      // Ensure potionUpgrades exists with all 5 potion types
      if (!state['potionUpgrades'] || typeof state['potionUpgrades'] !== 'object') {
        state['potionUpgrades'] = { healing: 0, strength: 0, defense: 0, speed: 0, luck: 0 };
      }

      // Backfill the three required arrays the validator checks for. Saves
      // that predate v2 sometimes lack these (early playtests), and a missing
      // array would fail validateGameState() after migration — silently
      // throwing the user back to a fresh save instead of restoring progress.
      if (!Array.isArray(state['currentAdventurers'])) state['currentAdventurers'] = [];
      if (!Array.isArray(state['dungeonLog'])) state['dungeonLog'] = [];
      if (!Array.isArray(state['deathNotifications'])) state['deathNotifications'] = [];

      return state;
    },
  },
  {
    fromVersion: 2,
    toVersion: 3,
    migrate: (state: Record<string, unknown>): Record<string, unknown> => {
      state['schemaVersion'] = 3;

      // Add empty discoveredCombos array if not present
      if (!Array.isArray(state['discoveredCombos'])) {
        state['discoveredCombos'] = [];
      }

      // Add speed and luck defaults to potionUpgrades if missing
      if (state['potionUpgrades'] && typeof state['potionUpgrades'] === 'object') {
        const upgrades = state['potionUpgrades'] as Record<string, unknown>;
        if (!('speed' in upgrades)) upgrades['speed'] = 0;
        if (!('luck' in upgrades)) upgrades['luck'] = 0;
      }

      return state;
    },
  },
  {
    fromVersion: 3,
    toVersion: 4,
    migrate: (state: Record<string, unknown>): Record<string, unknown> => {
      state['schemaVersion'] = 4;

      // Add highestFloor (default to current floor based on day, or 1)
      if (typeof state['highestFloor'] !== 'number') {
        // Estimate from day if available
        const day = typeof state['day'] === 'number' ? state['day'] : 1;
        state['highestFloor'] = Math.min(15, 1 + Math.floor((day - 1) / 3));
      }

      // Ensure all potionUpgrade keys exist (defensive)
      if (state['potionUpgrades'] && typeof state['potionUpgrades'] === 'object') {
        const upgrades = state['potionUpgrades'] as Record<string, unknown>;
        for (const key of ['healing', 'strength', 'defense', 'speed', 'luck']) {
          if (typeof upgrades[key] !== 'number') upgrades[key] = 0;
        }
      }

      return state;
    },
  },
  {
    fromVersion: 4,
    toVersion: 5,
    migrate: (state: Record<string, unknown>): Record<string, unknown> => {
      state['schemaVersion'] = 5;

      // Add empty survivorLedger if not present
      if (!Array.isArray(state['survivorLedger'])) {
        state['survivorLedger'] = [];
      }

      return state;
    },
  },
  {
    fromVersion: 5,
    toVersion: 6,
    migrate: (state: Record<string, unknown>): Record<string, unknown> => {
      state['schemaVersion'] = 6;
      if (!Array.isArray(state['eventHistory'])) {
        state['eventHistory'] = [];
      }
      return state;
    },
  },
  {
    fromVersion: 6,
    toVersion: 7,
    migrate: (state: Record<string, unknown>): Record<string, unknown> => {
      state['schemaVersion'] = 7;
      if (typeof state['hasSeenDilutionRitual'] !== 'boolean') {
        const inventory =
          state['potionInventory'] && typeof state['potionInventory'] === 'object'
            ? (state['potionInventory'] as Record<string, unknown>)
            : {};
        const hasWateredStock = Object.entries(inventory).some(
          ([potionId, quantity]) => potionId.startsWith('diluted-') && typeof quantity === 'number' && quantity > 0
        );
        const hasWateredSales = typeof state['dilutedSold'] === 'number' && state['dilutedSold'] > 0;
        const hasDilutionDeath = typeof state['deathsByDilution'] === 'number' && state['deathsByDilution'] > 0;
        state['hasSeenDilutionRitual'] = hasWateredStock || hasWateredSales || hasDilutionDeath;
      }
      return state;
    },
  },
];

@Injectable()
export class GameStateService implements OnDestroy {
  private readonly STORAGE_KEY = 'potion-stand-save';
  private readonly BACKUP_KEY = 'potion-stand-save-backup';

  /** In-memory backup of the last successfully loaded/saved state */
  private lastKnownGoodState: string | null = null;

  /**
   * Whether another tab has written to the save key since this tab loaded.
   * Exposed as a signal so OnPush components can react. Phase 7b surfaces
   * this in the parent template as a "refresh to load latest" banner —
   * mirrors the save-warning banner shipped in pipeline-panic Phase 2.
   */
  private readonly _crossTabConflictDetected = signal(false);
  readonly crossTabConflict = this._crossTabConflictDetected.asReadonly();

  /** Backwards-compatible getter for any callers reading the plain bool. */
  get crossTabConflictDetected(): boolean {
    return this._crossTabConflictDetected();
  }

  /** Bound reference so we can remove the listener in ngOnDestroy */
  private readonly onStorageEvent = (event: StorageEvent): void => {
    if (event.key === this.STORAGE_KEY && event.newValue !== null) {
      this._crossTabConflictDetected.set(true);
    }
  };

  constructor() {
    // Cross-tab conflict detection (warning only)
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this.onStorageEvent);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.onStorageEvent);
    }
  }

  /**
   * Detect the schema version of a raw parsed object.
   * Saves without a `schemaVersion` field are treated as v1.
   */
  private detectVersion(raw: Record<string, unknown>): number {
    if (typeof raw['schemaVersion'] === 'number') {
      return raw['schemaVersion'];
    }
    return 1;
  }

  /**
   * Apply all necessary migrations in sequence to bring a raw state
   * up to `CURRENT_SCHEMA_VERSION`.
   *
   * Returns an object with the migrated state or an error string
   * indicating which migration step failed.
   */
  applyMigrations(
    raw: Record<string, unknown>
  ): { success: true; state: Record<string, unknown> } | { success: false; error: string } {
    let version = this.detectVersion(raw);
    let state = raw;

    while (version < CURRENT_SCHEMA_VERSION) {
      const migration = MIGRATIONS.find((m) => m.fromVersion === version);
      if (!migration) {
        return {
          success: false,
          error: `No migration found from v${version} to v${version + 1}`,
        };
      }
      try {
        state = migration.migrate(state);
        version = migration.toVersion;
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'an unknown mishap';
        return {
          success: false,
          error: `Migration v${migration.fromVersion}→v${migration.toVersion} failed: ${detail}`,
        };
      }
    }

    return { success: true, state };
  }

  private validateGameState(data: unknown): data is GameState {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const state = data as Record<string, unknown>;

    // schemaVersion must be present and equal to current version
    if (typeof state['schemaVersion'] !== 'number' || state['schemaVersion'] !== CURRENT_SCHEMA_VERSION) {
      return false;
    }

    // Required number fields
    const requiredNumbers = [
      'gold',
      'reputation',
      'shopLevel',
      'day',
      'totalAdventurers',
      'adventurersSaved',
      'adventurersKilled',
      'potionsSold',
      'goldEarned',
      'deathsByPotion',
      'deathsByDilution',
      'perfectSaves',
      'difficultyMultiplier',
    ];

    for (const field of requiredNumbers) {
      if (typeof state[field] !== 'number') {
        return false;
      }
    }

    // Required array fields
    if (
      !Array.isArray(state['currentAdventurers']) ||
      !Array.isArray(state['dungeonLog']) ||
      !Array.isArray(state['deathNotifications'])
    ) {
      return false;
    }

    // Required object fields
    if (typeof state['potionInventory'] !== 'object' || state['potionInventory'] === null) {
      return false;
    }

    // Validate potionUpgrades structure (don't require all keys — migration fills them in)
    if (state['potionUpgrades'] && typeof state['potionUpgrades'] === 'object') {
      const upgrades = state['potionUpgrades'] as Record<string, unknown>;
      const requiredKeys = ['healing', 'strength', 'defense', 'speed', 'luck'];
      for (const key of requiredKeys) {
        if (upgrades[key] !== undefined && typeof upgrades[key] !== 'number') {
          return false; // Invalid upgrade value type
        }
      }
    }

    // highestFloor is optional but must be a number if present
    if (state['highestFloor'] !== undefined && typeof state['highestFloor'] !== 'number') {
      return false;
    }

    if (state['hasSeenDilutionRitual'] !== undefined && typeof state['hasSeenDilutionRitual'] !== 'boolean') {
      return false;
    }

    return true;
  }

  loadGameState(): SaveLoadResult {
    try {
      const saved = window.localStorage.getItem(this.STORAGE_KEY);
      if (!saved) {
        return { success: true }; // No saved data is not an error
      }

      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(saved) as Record<string, unknown>;
      } catch {
        if (window.debugLogBridge) {
          window.debugLogBridge.log('Corrupted save data (invalid JSON)', 'error', {
            source: 'game_state_service',
            operation: 'load_game_state',
          });
        }
        return {
          success: false,
          error: 'The saved ledger is corrupted and unreadable',
        };
      }

      if (!raw || typeof raw !== 'object') {
        return {
          success: false,
          error: 'The saved ledger is corrupted and missing its pages',
        };
      }

      // Apply migrations if needed
      const migrationResult = this.applyMigrations(raw);
      if (!migrationResult.success) {
        if (window.debugLogBridge) {
          window.debugLogBridge.log('Migration failed', 'error', {
            source: 'game_state_service',
            operation: 'load_game_state',
            reason: migrationResult.error,
          });
        }
        return {
          success: false,
          error: `Its handwriting is too old to update: ${migrationResult.error}`,
        };
      }

      const migrated = migrationResult.state;

      // Validate the migrated state
      if (!this.validateGameState(migrated)) {
        if (window.debugLogBridge) {
          window.debugLogBridge.log('Invalid game state schema after migration', 'error', {
            source: 'game_state_service',
            operation: 'load_game_state',
            reason: 'Schema validation failed after migration',
          });
        }
        return {
          success: false,
          error: 'The saved ledger is corrupted or written for a version this shop no longer reads',
        };
      }

      // Store as last-known-good
      this.lastKnownGoodState = JSON.stringify(migrated);

      return { success: true, data: migrated };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'an unknown mishap';
      if (window.debugLogBridge) {
        window.debugLogBridge.log('Failed to load game state', 'error', {
          source: 'game_state_service',
          operation: 'load_game_state',
          error: error,
        });
      }
      return { success: false, error: errorMessage };
    }
  }

  saveGameState(state: GameState): SaveLoadResult {
    try {
      // Ensure schemaVersion is always current
      const stateWithVersion: GameState = {
        ...state,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      };

      // Enforce collection limits before saving
      const sanitized: GameState = { ...stateWithVersion };
      if (Array.isArray(sanitized.dungeonLog) && sanitized.dungeonLog.length > 100) {
        sanitized.dungeonLog = sanitized.dungeonLog.slice(0, 100);
      }
      if (Array.isArray(sanitized.deathNotifications) && sanitized.deathNotifications.length > 50) {
        sanitized.deathNotifications = sanitized.deathNotifications.slice(0, 50);
      }

      const serialized = JSON.stringify(sanitized);

      // Size check
      const sizeBytes = serialized.length * 2; // UTF-16 chars ≈ 2 bytes each
      if (sizeBytes > 100_000 && !environment.production) {
        console.error(`[GameState] Save state exceeds 100KB (${(sizeBytes / 1024).toFixed(1)}KB)`);
      }

      // Rotate backup: current save → backup key
      const previousSave = window.localStorage.getItem(this.STORAGE_KEY);
      if (previousSave) {
        window.localStorage.setItem(this.BACKUP_KEY, previousSave);
        this.lastKnownGoodState = previousSave;
      }

      window.localStorage.setItem(this.STORAGE_KEY, serialized);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'an unknown mishap';
      // Phase 8c — give the caller a typed error for quota-exceeded so the
      // UI can offer a recovery action (clear backups, suggest reload). The
      // DOMException name is the canonical signal across browsers.
      const isQuota =
        (error instanceof DOMException && error.name === 'QuotaExceededError') ||
        // Firefox legacy code; Safari and Chrome both use the standard name above.
        (error instanceof DOMException && error.code === 22);
      if (window.debugLogBridge) {
        window.debugLogBridge.log('Failed to save game state', 'error', {
          source: 'game_state_service',
          operation: 'save_game_state',
          error: error,
          quota: isQuota,
        });
      }
      return { success: false, error: errorMessage, quotaExceeded: isQuota };
    }
  }

  /**
   * Attempt to recover the last-known-good state if the current save
   * is unloadable. Returns null if no backup exists.
   */
  recoverLastKnownGood(): SaveLoadResult {
    // Try in-memory backup first, then fall back to localStorage backup key
    const backupJson = this.lastKnownGoodState ?? window.localStorage.getItem(this.BACKUP_KEY);
    if (!backupJson) {
      return { success: false, error: 'No backup state available for recovery' };
    }

    try {
      const raw = JSON.parse(backupJson) as Record<string, unknown>;
      const migrationResult = this.applyMigrations(raw);
      if (!migrationResult.success) {
        return { success: false, error: `Recovery migration failed: ${migrationResult.error}` };
      }

      if (!this.validateGameState(migrationResult.state)) {
        return { success: false, error: 'Recovery state failed validation' };
      }

      // Restore to localStorage
      window.localStorage.setItem(this.STORAGE_KEY, JSON.stringify(migrationResult.state));
      return { success: true, data: migrationResult.state };
    } catch {
      return { success: false, error: 'Failed to parse backup state' };
    }
  }

  clearGameState(): void {
    window.localStorage.removeItem(this.STORAGE_KEY);
    window.localStorage.removeItem(this.BACKUP_KEY);
    this.lastKnownGoodState = null;
  }

  createNewGame(): GameState {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      gold: ECONOMY.STARTING_GOLD,
      reputation: ECONOMY.STARTING_REPUTATION,
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
      potionInventory: {
        // TODO: sync with orchestrator's initializeStartingInventory if these diverge
        'basic-healing': 3,
        'strength-potion': 2,
        'defense-potion': 2,
      },
      potionUpgrades: { healing: 0, strength: 0, defense: 0, speed: 0, luck: 0 },
      difficultyMultiplier: 1,
      encountersSurvived: 0,
      bossesDefeated: 0,
      combosTriggered: 0,
      discoveredCombos: [],
      highestFloor: 1,
      eventHistory: [],
      hasSeenDilutionRitual: false,
    };
  }
}
