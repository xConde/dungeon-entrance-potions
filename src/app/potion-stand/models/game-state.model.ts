import { Adventurer, DeathNotification } from './adventurer.model';

export interface SurvivorEntry {
  /** Adventurer entity ID — used for collision-free ledger lookups.
   *  Optional for backward compatibility with saves that pre-date this field. */
  id?: string;
  name: string;
  class: string; // AdventurerClass as string for serialization
  level: number;
  lastPurchase: string; // potion name they last bought
  timesReturned: number;
}

export interface GameState {
  // Schema
  schemaVersion: number;

  // Resources
  gold: number;
  reputation: number;
  shopLevel: number;
  day: number;

  // Statistics
  totalAdventurers: number;
  adventurersSaved: number;
  adventurersKilled: number;
  potionsSold: number;
  goldEarned: number;

  // Reputation breakdown
  deathsByPotion: number;
  deathsByDilution: number;
  perfectSaves: number;

  // Current state
  currentAdventurers: Adventurer[];
  dungeonLog: DungeonEvent[];
  deathNotifications: DeathNotification[];

  // Inventory
  potionInventory: { [potionId: string]: number };

  // Upgrades (persisted tier levels per potion type)
  potionUpgrades: Record<string, number>;

  // Settings
  difficultyMultiplier: number;

  // Time tracking
  gameTime?: number;

  // New encounter tracking (optional for backward compatibility)
  encountersSurvived?: number;
  bossesDefeated?: number;
  combosTriggered?: number;

  // Combo discovery tracking (optional for backward compatibility with old saves)
  discoveredCombos?: string[];

  // Progression tracking (optional for backward compatibility with old saves)
  highestFloor?: number;

  // Moral system (optional for backward compatibility with old saves)
  guilt?: number;
  peakGuilt?: number;
  maxDeathStreak?: number;
  dilutedSold?: number;

  // Random events (optional for backward compatibility with old saves)
  stormActive?: boolean;
  dragonActive?: boolean;
  potionShortageActive?: boolean;
  lastEventDay?: number;

  // UI preferences (optional for backward compatibility with old saves)
  showFullNamesInLog?: boolean;
  hasSeenDilutionRitual?: boolean;

  // Seeded PRNG state (optional for backward compatibility with old saves)
  rngSeed?: number;

  // Survivor ledger (optional for backward compatibility with old saves)
  survivorLedger?: SurvivorEntry[];

  // Event history (optional for backward compatibility with old saves)
  eventHistory?: string[];
}

export interface DungeonEvent {
  id: string;
  timestamp: number;
  adventurerId: string;
  eventType:
    | 'enter'
    | 'combat'
    | 'loot'
    | 'death'
    | 'escape'
    | 'victory'
    | 'refuse'
    | 'trap'
    | 'boss'
    | 'combo'
    | 'encounter'
    | 'flee';
  message: string;
  severity: 'info' | 'warning' | 'success' | 'danger';
}

export interface CustomerReview {
  /** Unique review ID for @for track — populated via nextEventId('review'). */
  id: string;
  adventurerId: string;
  adventurerName: string;
  rating: number; // 1-5
  comment: string;
  potionPurchased: string;
  survived: boolean;
  timestamp: number;
}
