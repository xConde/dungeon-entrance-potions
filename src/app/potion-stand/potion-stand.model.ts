// =============================================================================
// Potion Stand - Shared Types
// Consolidated type definitions for the potion stand game
// =============================================================================

import type { Adventurer } from './models/adventurer.model';
import type { Potion } from './models/potion.model';

// -----------------------------------------------------------------------------
// Re-exports from model files (canonical source)
// -----------------------------------------------------------------------------
export * from './models';

// -----------------------------------------------------------------------------
// Game Phase Types
// -----------------------------------------------------------------------------

// GamePhase type is now managed by GamePhaseService (services/game-phase.service.ts)
// Re-export for backward compatibility
export type { GamePhase } from './services/game-phase.service';

/** Time of day for game progression */
export type TimeOfDay = 'Morning' | 'Afternoon' | 'Evening' | 'Night';

/** Shell game mini-game phases */
export type ShellGamePhase = 'idle' | 'reveal' | 'cover' | 'shuffle' | 'pick' | 'result';

// -----------------------------------------------------------------------------
// Potion & Upgrade Types
// -----------------------------------------------------------------------------

/** Types of potions that can be upgraded */
export type PotionType = 'healing' | 'strength' | 'defense' | 'speed' | 'luck';

/** Alias for upgrade type (same as PotionType for clarity) */
export type UpgradeType = PotionType;

/** Player-selected quote applied to an individual potion sale. */
export type PriceMode = 'mercy' | 'fair' | 'gouge';

/** Merchant potion keys for inventory */
export type MerchantPotionType = 'basicHealing' | 'strengthPotion' | 'defensePotion' | 'speedElixir' | 'luckCharm';

// -----------------------------------------------------------------------------
// Potion Catalog - Single source of truth for potion display metadata
// -----------------------------------------------------------------------------

/** Potion display metadata for UI components */
export interface PotionDisplayMeta {
  /** Inventory ID (e.g., 'basic-healing') */
  id: string;
  /** Upgrade key matching PotionType */
  upgradeKey: PotionType;
  /** Display name */
  name: string;
  /** Merchant inventory key */
  merchantKey: MerchantPotionType;
  /** Bottle fill color (hex) */
  color: string;
}

/** Canonical potion catalog - use this for all UI rendering
 * Note: Internal IDs use 'defense' for backward compatibility with saved games,
 * but display name is 'Protection' for better UX */
export const POTION_CATALOG: readonly PotionDisplayMeta[] = [
  { id: 'basic-healing', upgradeKey: 'healing', name: 'Healing', merchantKey: 'basicHealing', color: '#dc2626' },
  { id: 'strength-potion', upgradeKey: 'strength', name: 'Strength', merchantKey: 'strengthPotion', color: '#ea580c' },
  { id: 'defense-potion', upgradeKey: 'defense', name: 'Protection', merchantKey: 'defensePotion', color: '#64748b' },
  { id: 'speed-elixir', upgradeKey: 'speed', name: 'Speed', merchantKey: 'speedElixir', color: '#06b6d4' },
  { id: 'luck-charm', upgradeKey: 'luck', name: 'Luck', merchantKey: 'luckCharm', color: '#a855f7' },
] as const;

/** Tier display names */
export const TIER_NAMES = ['BASIC', 'ENHANCED', 'SUPERIOR'] as const;

// -----------------------------------------------------------------------------
// Merchant Types
// -----------------------------------------------------------------------------

/** Single item in merchant inventory */
export interface MerchantItem {
  available: number;
  cost: number;
}

/** Full merchant inventory structure */
export interface MerchantInventory {
  basicHealing: MerchantItem;
  strengthPotion: MerchantItem;
  defensePotion: MerchantItem;
  speedElixir: MerchantItem;
  luckCharm: MerchantItem;
}

// -----------------------------------------------------------------------------
// Transaction Types
// -----------------------------------------------------------------------------

/** Event emitted when selling a potion to an adventurer */
export interface SellPotionEvent {
  potion: Potion;
  adventurer: Adventurer;
  priceMode: PriceMode;
}

/** Read-only consequence preview shown before the player commits a sale. */
export interface PotionForecast {
  currentSurvival: number;
  projectedSurvival: number;
  survivalDelta: number;
  risk: 'dire' | 'risky' | 'steady';
  comboName: string | null;
  comboDescription: string | null;
  comboSurvivalBonus: number;
  budgetAfterSale: number;
}

/** Exact consequences shown before and applied when the shop closes early. */
export interface CloseDayPreview {
  waitingCustomerCount: number;
  atRiskCount: number;
  reputationCost: number;
  guiltCost: number;
  dailyOverhead: number;
}

/** Inventory award emitted by the Stock Rescue shell game. */
export interface ShellGameReward {
  potionType: PotionType;
  quantity: number;
}

/** Animation state for purchase feedback */
export interface PurchaseAnimation {
  adventurerId: string;
  amount: number;
  comboName?: string;
}

// -----------------------------------------------------------------------------
// Game Over Types
// -----------------------------------------------------------------------------

/** Reason for game ending */
export type GameOverReason = 'bankruptcy' | 'reputation' | 'success';

/** Statistics shown on game over screen */
export interface GameOverStats {
  day: number;
  savedCount: number;
  deathCount: number;
  reputation: number;
  gold: number;
  goldEarned: number;
  potionsSold: number;
  perfectSaves: number;
  bossesDefeated: number;
  combosTriggered: number;
  maxDeathStreak: number;
  dilutedSold: number;
  guiltLevel: string;
}

// -----------------------------------------------------------------------------
// Day Summary Types
// -----------------------------------------------------------------------------

/** Data for end-of-day summary modal */
export interface DaySummaryData {
  day: number;
  netProfit: number;
  deaths: number;
  saves: number;
  reputationChange: number;
  potionsSold: number;
  deathsYourFault: number;
  bossesDefeated: number;
  unprepared: number;
  guiltLevel: string;
}
