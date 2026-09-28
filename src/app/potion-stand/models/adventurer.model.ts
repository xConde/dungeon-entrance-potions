export interface Adventurer {
  id: string;
  name: string;
  class: AdventurerClass;
  level: number;
  maxHp: number;
  currentHp: number;
  gold: number;

  // Stats
  strength: number;
  defense: number;
  magic: number;
  luck: number;

  // Potion effects
  potionsConsumed: PotionEffect[];
  survivalChance: number;

  // Status
  status: AdventurerStatus;
  enterTime: number;
  exitTime?: number;
  causeOfDeath?: string;
  /** Ticks since entering dungeon (0-based, incremented per dungeon tick). Optional for backward compat. */
  dungeonTickCount?: number;

  // Personality
  frugal: boolean; // Haggles prices
  trusting: boolean; // Buys anything
  experienced: boolean; // Knows bad potions
  desperate: boolean; // Will buy despite warnings

  // Loyalty system (optional for backward compatibility)
  /** Whether this adventurer is a returning survivor */
  isReturning?: boolean;
  /** Name of last potion purchased (set for returning customers) */
  lastPurchase?: string;

  // Flavor
  /** Flavor text shown on customer card */
  speechBubble?: string;
}

export enum AdventurerClass {
  Warrior = 'Warrior',
  Rogue = 'Rogue',
  Mage = 'Mage',
  Cleric = 'Cleric',
  Ranger = 'Ranger',
  Barbarian = 'Barbarian',
  Paladin = 'Paladin',
  Necromancer = 'Necromancer',
}

export enum AdventurerStatus {
  Shopping = 'shopping',
  Entering = 'entering',
  Exploring = 'exploring',
  Fighting = 'fighting',
  Looting = 'looting',
  Fleeing = 'fleeing',
  Victorious = 'victorious',
  Dead = 'dead',
}

export interface PotionEffect {
  potionId: string;
  name: string;
  quality: number; // 0-1, affects effectiveness
  duration: number;
  statModifiers: {
    hp?: number;
    strength?: number;
    defense?: number;
    speed?: number;
    luck?: number;
  };
}

export interface DeathNotification {
  adventurer: Adventurer;
  message: string;
  timestamp: number;
  wasYourFault: boolean;
  lastWords?: string;
}
