// =============================================================================
// Potion Stand - Centralized Game Configuration
// All balance-affecting constants in one place for easy tuning
// =============================================================================

import { AdventurerClass } from '../models/adventurer.model';

// -----------------------------------------------------------------------------
// Economy
// -----------------------------------------------------------------------------

export const ECONOMY = {
  STARTING_GOLD: 100,
  STARTING_REPUTATION: 50,
  /** Base daily overhead — scales with floor: base + floor × OVERHEAD_PER_FLOOR */
  DAILY_OVERHEAD: 30,
  /** Additional overhead per dungeon floor */
  OVERHEAD_PER_FLOOR: 4,
  /** Additional overhead per dungeon floor beyond floor 10 (reduced scaling) */
  OVERHEAD_PER_FLOOR_HIGH: 1.5,
  RESTOCK_COST: 100,
  BANKRUPTCY_THRESHOLD: -100,
  /** Reputation threshold for guild shutdown (reputation bankruptcy) */
  REPUTATION_BANKRUPTCY: -50,
  VICTORY_DAYS: 30,
  /** Days 25+ trigger "Final Week" mode */
  FINAL_WEEK_START: 25,
  MAX_REPUTATION: 100,
  MIN_REPUTATION: -100,
} as const;

// -----------------------------------------------------------------------------
// Timing (milliseconds and tick counts)
// -----------------------------------------------------------------------------

export const TIMING = {
  /** Ticks per full day cycle */
  DAY_LENGTH_TICKS: 120,
  /** Tick threshold for Morning → Afternoon */
  MORNING_END: 30,
  /** Tick threshold for Afternoon → Evening */
  AFTERNOON_END: 60,
  /** Tick threshold for Evening → Night */
  EVENING_END: 90,
  /** Delay before initial adventurer spawn */
  SPAWN_DELAY_MS: 500,
  /** Duration of purchase animation */
  PURCHASE_ANIMATION_MS: 800,
  /** Duration of combo smoke signal (slightly longer than normal purchase) */
  COMBO_ANIMATION_MS: 1400,
  /** Duration death modal is shown */
  DEATH_MODAL_MS: 2000,
  // COUPLING: MESSAGE_AUTO_HIDE_MS MUST match the `messageToast` keyframe's
  // animation-duration in styles/_animations.scss (currently both 5000ms).
  // SCSS can't read a TS constant without build plumbing, so this is the
  // same duration expressed twice. If they drift, the visible .message-bar
  // toast either holds fully faded-out for a stretch before Angular removes
  // it, or gets yanked away mid-animation before it finishes fading. Change
  // both together.
  /** Duration status messages are shown */
  MESSAGE_AUTO_HIDE_MS: 5000,
  /** Duration event banners are shown */
  EVENT_BANNER_MS: 10000,
  /** Minimum time customer browses before auto-purchasing */
  MIN_BROWSE_TIME_MS: 3000,
  /** Base game loop interval */
  BASE_TICK_MS: 500,
} as const;

// -----------------------------------------------------------------------------
// Dungeon
// -----------------------------------------------------------------------------

export const DUNGEON = {
  /** @deprecated Use EXPLORE_TICKS for deterministic combat. Duration of safe exploration phase (ms). */
  EXPLORE_DURATION_MS: 5000,
  /** @deprecated Use VICTORY_TICKS for deterministic combat. Total time in dungeon needed for victory (ms). */
  VICTORY_DURATION_MS: 15000,
  /** @deprecated Use DAMAGE_EVERY_N_TICKS for deterministic combat. Damage tick interval during combat (ms). */
  DAMAGE_TICK_MS: 500,
  // Tick-based timing (1 tick = 1 dungeon tick = 2 seconds at 1x speed)
  /** Safe exploration phase length in dungeon ticks (was EXPLORE_DURATION_MS: 5000 / 2000 ≈ 2.5, rounded up) */
  EXPLORE_TICKS: 3,
  /** Total ticks in dungeon needed for victory (was VICTORY_DURATION_MS: 15000 / 2000 = 7.5, rounded up) */
  VICTORY_TICKS: 8,
  /** Damage fires every N dungeon ticks (was DAMAGE_TICK_MS: 500, effectively every tick at 2000ms intervals) */
  DAMAGE_EVERY_N_TICKS: 1,
  /** Base damage per tick */
  BASE_DAMAGE: 3,
  /** Additional damage per floor level */
  DAMAGE_PER_FLOOR: 1.5,
  /** Additional damage per difficulty point */
  DAMAGE_PER_DIFFICULTY: 2,
  /**
   * Fraction of the adventurer's maxHp added to per-tick damage, scaled by
   * difficulty (so it ramps with floor depth). This keeps combat proportional
   * as HP balloons with level — the single most important lever for making the
   * potion/defense/survival choice actually decide who lives. Tuned against
   * services/game-balance.spec.ts.
   */
  DAMAGE_PER_MAXHP_FRACTION: 0.17,
  /** Defense reduction per defense point */
  DEFENSE_REDUCTION_PER_POINT: 0.013,
  /** Maximum damage reduction from defense (kept below 1 so no class is immune
   *  — the maxHp-proportional damage term still threatens even capped tanks) */
  MAX_DEFENSE_REDUCTION: 0.45,
  /** Minimum damage variance multiplier */
  DAMAGE_VARIANCE_MIN: 0.8,
  /** Maximum damage variance multiplier */
  DAMAGE_VARIANCE_MAX: 1.2,
  /** HP threshold for "wounded" event */
  HP_CRITICAL_THRESHOLD: 0.5,
  /** HP threshold for "barely standing" event */
  HP_DESPERATE_THRESHOLD: 0.25,
  /** Days per dungeon floor progression */
  FLOOR_PROGRESSION_DAYS: 3,
  /** Maximum dungeon floor */
  MAX_FLOOR: 15,
  /** Difficulty increase per floor */
  DIFFICULTY_PER_FLOOR: 0.15,
  /** Base gold from dungeon loot */
  BASE_LOOT_GOLD: 50,
  /** Additional loot gold per floor */
  LOOT_PER_FLOOR: 20,
  /** Maximum random bonus gold */
  LOOT_RANDOM_MAX: 50,
  /** Percentage of loot given as tip to shop */
  TIP_PERCENTAGE: 0.1,
  /**
   * How much survival chance mitigates damage (applied on top of defense).
   * Raised so the potion-driven survival chance is the decisive combat lever:
   * at 0.55 factor, an 0.8-survival adventurer takes 44% less damage than the
   * raw hit, while a diluted/no-potion adventurer keeps most of it.
   * Formula: finalDamage *= (1 - survivalChance * SURVIVAL_DAMAGE_FACTOR)
   */
  SURVIVAL_DAMAGE_FACTOR: 0.8,
  /**
   * Survival chance below which an adventurer is considered at high risk.
   * Used for: "looking unsteady" dungeon entry warning, wasYourFault death attribution.
   */
  SURVIVAL_WARNING_THRESHOLD: 0.3,
  /** Survival chance at or above which the counter forecast is labeled steady. */
  SURVIVAL_STEADY_THRESHOLD: 0.6,
} as const;

// -----------------------------------------------------------------------------
// Encounters — Floor-based dungeon encounter system
// -----------------------------------------------------------------------------

export const ENCOUNTERS = {
  /** Boss appears on these floors */
  BOSS_FLOORS: [5, 10, 15] as readonly number[],
  /** Trap damage as fraction of adventurer maxHp */
  TRAP_DAMAGE_FRACTION: 0.15,
  /** Bonus gold from treasure rooms */
  TREASURE_BONUS_GOLD: 30,
  /** Extra damage multiplier for ambush first strike */
  AMBUSH_FIRST_STRIKE_MULTIPLIER: 1.5,
  /** Elite enemy HP multiplier */
  ELITE_HP_MULTIPLIER: 1.5,
  /** Elite enemy damage multiplier */
  ELITE_DAMAGE_MULTIPLIER: 1.3,
  /** Boss damage multiplier */
  BOSS_DAMAGE_MULTIPLIER: 1.8,
  /** Boss bonus loot gold */
  BOSS_BONUS_GOLD: 75,
  /** Class advantage damage reduction */
  CLASS_ADVANTAGE_REDUCTION: 0.25,
} as const;

// -----------------------------------------------------------------------------
// Shop & Customers
// -----------------------------------------------------------------------------

export const SHOP = {
  /** Maximum customers in shop at once */
  MAX_CUSTOMERS: 5,
  /** Maximum customers during Final Week (days 25-30) */
  FINAL_WEEK_MAX_CUSTOMERS: 6,
  /** Time before customer leaves (ms) — patience before they walk out */
  QUEUE_TIMEOUT_MS: 20000,
  /** Storm spawn reduction factor */
  STORM_SPAWN_REDUCTION: 0.5,
  /** Chance of bonus customer spawn when reputation is high */
  BONUS_SPAWN_CHANCE: 0.15,
  /** Reputation loss per customer timeout */
  REPUTATION_TIMEOUT_PENALTY: 2,
  /** Base auto-purchase chance per tick — kept low so manual selling is primary */
  AUTO_PURCHASE_CHANCE: 0.01,
  /**
   * Floor for reputation multiplier in auto-purchase calculation.
   * Even at 0 reputation, customers still have a small chance to buy.
   */
  AUTO_PURCHASE_MIN_REP_MULTIPLIER: 0.15,
  /** Base leave chance when can't afford anything */
  LEAVE_BASE_CHANCE: 0.3,
  /** Leave chance reputation factor */
  LEAVE_REP_FACTOR: 0.4,
  /** Reputation penalty when a customer leaves because they can't afford anything */
  CANT_AFFORD_LEAVE_REP_PENALTY: 2,
  /** Price multiplier for desperate customers — willing to pay more */
  DESPERATE_PRICE_MULTIPLIER: 1.5,
  /** Price multiplier for frugal customers — haggles the price down */
  FRUGAL_PRICE_MULTIPLIER: 0.8,
  /**
   * Reputation divisor for price calculation.
   * Formula: price *= (1 + reputation / REPUTATION_PRICE_DIVISOR)
   * At 200 divisor and 50 reputation, that's a 25% price boost.
   */
  REPUTATION_PRICE_DIVISOR: 200,
  /** Maximum potions a customer can buy (2 enables combo system) */
  MAX_POTIONS_PER_CUSTOMER: 2,
  /**
   * HP ratio below which healing potions are recommended to the player.
   * Used in potion recommendation UI to guide new players.
   */
  HP_RECOMMEND_THRESHOLD: 0.5,
  /**
   * Floor at/after which the recommendation prioritizes raw survival (healing)
   * over class-flavor potions. On deep floors a class-fit pick (e.g. strength,
   * luck) can leave survival below the danger threshold, so the guide must point
   * at the strongest survival option or it steers players into the guilt spiral.
   */
  RECOMMEND_DANGER_FLOOR: 5,
} as const;

// -----------------------------------------------------------------------------
// Customer Quotes — the player chooses the moral/economic terms of each sale
// -----------------------------------------------------------------------------

export const PRICING = {
  /** Sacrifice margin so customers can afford safer two-potion loadouts. */
  MERCY_MULTIPLIER: 0.8,
  /** The existing trait + reputation price remains the neutral quote. */
  FAIR_MULTIPLIER: 1,
  /** Take a larger cut now, often leaving less budget for the second potion. */
  GOUGE_MULTIPLIER: 1.25,
  /** Reputation earned for accepting less on a sale. */
  MERCY_REPUTATION_BONUS: 1,
  /** Guilt gained whenever the player deliberately overcharges. */
  GOUGE_GUILT: 1,
  /** Extra guilt when overcharging a desperate customer. */
  DESPERATE_GOUGE_GUILT_BONUS: 2,
} as const;

// -----------------------------------------------------------------------------
// Stock Rescue — compact shell game timing and streak rules
// -----------------------------------------------------------------------------

export const SHELL_GAME = {
  /** 500ms ticks: 1.5s reveal, then a short cover. */
  REVEAL_TICKS: 3,
  COVER_TICKS: 1,
  /** One visible swap per second, three swaps total. */
  SHUFFLE_INTERVAL_TICKS: 2,
  SHUFFLE_COUNT: 3,
  /** Four-second decision window. */
  PICK_TICKS: 8,
  /** 1.5s result beat before the next stock rescue. */
  RESULT_TICKS: 3,
  /** Every third consecutive win doubles the stock reward. */
  DOUBLE_REWARD_STREAK: 3,
} as const;

// -----------------------------------------------------------------------------
// Potions
// -----------------------------------------------------------------------------

export const POTIONS = {
  /** Quality multiplier for diluted potions */
  DILUTION_QUALITY_MULTIPLIER: 0.5,
  /** Price multiplier for diluted potions */
  DILUTION_PRICE_MULTIPLIER: 0.4,
  /** Guilt gained per dilution */
  DILUTION_GUILT: 5,
  /**
   * Survival penalty subtracted from a diluted potion's modifier BEFORE the
   * `modifier *= potion.quality` step — so the effective hit to survival chance
   * is roughly 0.65 * 0.5 (diluted quality) ~= 0.325, clamped at MIN_SURVIVAL_CHANCE.
   * Raise this here, not in the survival formula, when tuning dilution risk.
   */
  DILUTION_SURVIVAL_PENALTY: 0.65,
  /** Maximum survival chance (always some danger) */
  MAX_SURVIVAL_CHANCE: 0.85,
  /** Minimum survival chance */
  MIN_SURVIVAL_CHANCE: 0.05,
  /** Guilt gained per death (wasYourFault) */
  GUILT_PER_DEATH: 10,
  /** Guilt decay per game tick */
  // Guilt ebbs over time so a player who stops under-equipping can recover from a
  // bad stretch rather than being locked in a permanent reputation-loss spiral.
  // (~0.025/tick * 120 ticks/day ≈ 3 guilt/day; sustained bad play still outpaces it.)
  GUILT_DECAY_PER_TICK: 0.025,
  /** Maximum guilt */
  MAX_GUILT: 100,
} as const;

// -----------------------------------------------------------------------------
// Guilt System — moral consequences for dilution and deaths
// -----------------------------------------------------------------------------

export const GUILT = {
  /** Guilt gained per adventurer abandoned mid-dungeon via closeShopEarly */
  ABANDON_GAIN: 3,
  // Thresholds (replace hardcoded values in getGuiltClass)
  LOW_THRESHOLD: 25,
  MEDIUM_THRESHOLD: 50,
  HIGH_THRESHOLD: 75,

  // Reputation decay acceleration at guilt thresholds
  // At MEDIUM guilt: reputation losses are 50% worse
  REP_LOSS_MULTIPLIER_MEDIUM: 1.5,
  // At HIGH guilt: reputation losses are 100% worse (doubled)
  REP_LOSS_MULTIPLIER_HIGH: 2.0,

  // Guild inspection chance increase per guilt level
  // At HIGH guilt: +30% chance of guild inspection event
  INSPECTION_CHANCE_BONUS_HIGH: 0.3,

  // Guilt stops amplifying rep losses when reputation is already this low.
  // Prevents irreversible doom spiral — the player is already suffering enough.
  AMPLIFICATION_FLOOR: 10,

  // Decay MULTIPLIERS — kept for backward-compatible test references
  // (replaced by asymptotic curve in decayGuilt, but preserved for specs)
  DECAY_MULTIPLIER_MEDIUM: 0.7, // 70% of normal decay (historical reference)
  DECAY_MULTIPLIER_HIGH: 0.4, // 40% of normal decay (historical reference)

  // Asymptotic decay: guilt approaches this value asymptotically (unreachable cap).
  // Formula: effectiveDecay = amount * max(0.1, 1 - guilt / DECAY_ASYMPTOTE)
  // At guilt 0: full decay. At guilt 120: ~20% decay. At guilt 150: minimum (0.1x floor).
  DECAY_ASYMPTOTE: 150,

  // Adventurer awareness at high guilt (chance they arrive "having heard rumors")
  RUMOR_CHANCE_HIGH: 0.2,

  // Narrative event messages
  NIGHTMARE_MESSAGES: [
    'You see their faces when you close your eyes...',
    'The screams echo in your shop at night.',
    'Another sleepless night. The guilt is consuming you.',
    'You wonder if the gold was worth their lives.',
  ] as readonly string[],
} as const;

// -----------------------------------------------------------------------------
// Loyalty System — returning survivor customers
// -----------------------------------------------------------------------------

export const LOYALTY = {
  /** Max survivors tracked in the ledger */
  MAX_SURVIVORS: 10,
  /** Base chance per survivor per day to return */
  RETURN_CHANCE: 0.1,
  /** Return chance decreases as pool grows: chance * (1 - pool/POOL_DAMPING) */
  POOL_DAMPING: 15,
  /** Level boost for returning customers */
  LEVEL_BOOST: 1,
  /** Tip bonus multiplier for returning customers */
  TIP_BONUS: 0.2,
  /** Guilt multiplier when a regular dies */
  REGULAR_DEATH_GUILT_MULTIPLIER: 2,
} as const;

// -----------------------------------------------------------------------------
// Survival Chance Modifiers
// -----------------------------------------------------------------------------

export const SURVIVAL = {
  /**
   * Per-stat survival caps by tier [BASIC, ENHANCED, SUPERIOR]. Each full potion
   * has a distinct role: healing = max survival (the safe pick); defense = strong
   * survival + combat damage reduction (the tank pick); strength/speed = moderate
   * survival plus their offense/clear-speed niche; luck = loot-focused, minimal
   * survival (the gambler's pick — see LUCK_LOOT_MULTIPLIER). Tuned so no full
   * potion is purely cosmetic but healing/defense lead for raw survival.
   */
  HEALING_CAPS: [0.52, 0.68, 0.85] as readonly number[],
  /** Strength survival caps by tier (offense/loot niche; modest survival) */
  STRENGTH_CAPS: [0.18, 0.24, 0.3] as readonly number[],
  /** Defense survival caps by tier (the tank pick; also adds combat damage reduction) */
  DEFENSE_CAPS: [0.3, 0.4, 0.5] as readonly number[],
  /** Speed survival caps by tier (also cuts combat ticks → fewer hits taken) */
  SPEED_CAPS: [0.15, 0.2, 0.26] as readonly number[],
  /** Luck survival caps by tier (intentionally low — luck is a loot gamble, not protection) */
  LUCK_CAPS: [0.06, 0.1, 0.14] as readonly number[],
  /**
   * Reference HP for healing contribution — normalises healing against a
   * fixed baseline rather than adventurer.maxHp, so deep-floor adventurers
   * with high HP receive the same healing lift as shallow-floor ones.
   * Formula: (healing / HEALING_REFERENCE_HP) * HEALING_EFFECTIVENESS
   */
  HEALING_REFERENCE_HP: 100,
  /**
   * Healing effectiveness factor. Used with HEALING_REFERENCE_HP so the lift is
   * scale-independent: a basic +50 healing potion contributes (50/100)*1.5 =
   * 0.75, clamped by HEALING_CAPS[BASIC]=0.52, then * potion.quality. Healing is
   * deliberately the strongest survival potion (the safe pick).
   */
  HEALING_EFFECTIVENESS: 1.5,
  /** Strength effectiveness factor (strengthBoost * this) */
  STRENGTH_EFFECTIVENESS: 0.02,
  /** Defense effectiveness factor (defenseBoost * this) */
  DEFENSE_EFFECTIVENESS: 0.04,
  /** Speed effectiveness factor (indirect survival: reduces exposure time) */
  SPEED_EFFECTIVENESS: 0.018,
  /** Luck effectiveness factor (minimal direct survival: pure risk/reward) */
  LUCK_EFFECTIVENESS: 0.008,
  /** Luck loot multiplier bonus at base (+40% loot at base speedBoost=10) */
  LUCK_LOOT_MULTIPLIER: 0.4,
  /** Luck encounter weight shift (+X% treasure weight, -X% elite weight) */
  LUCK_ENCOUNTER_SHIFT: 0.1,
  /**
   * HP ratio at or above which a survivor is considered a "perfect save".
   * Used for stats tracking — surviving at 90%+ HP means the potion worked great.
   */
  PERFECT_SAVE_THRESHOLD: 0.9,
} as const;

// -----------------------------------------------------------------------------
// Reputation Changes
// -----------------------------------------------------------------------------

export const REPUTATION = {
  /** Reputation lost per adventurer abandoned mid-dungeon via closeShopEarly */
  ABANDON_PENALTY: 2,
  /** Reputation gained per survivor */
  SURVIVOR_BONUS: 3,
  /** Reputation lost per death (no potion) */
  DEATH_NO_POTION: 2,
  /** Reputation lost per death (had potion — tried but failed, softer) */
  DEATH_WITH_POTION: 3,
  /** Reputation lost per death (had diluted potion — severe) */
  DEATH_WITH_DILUTED: 12,
  /** Reputation bonus for passing guild inspection */
  GUILD_INSPECTION_CLEAN_BONUS: 10,
  /** Reputation penalty for failing guild inspection */
  GUILD_INSPECTION_DIRTY_PENALTY: 20,
  /** Gold fine for failing guild inspection */
  GUILD_FINE: 50,
  /** Reputation threshold for "good" status — unlocks spawn bonus */
  GOOD_THRESHOLD: 70,
  /** Reputation threshold for "neutral" status */
  NEUTRAL_THRESHOLD: 30,
  /** Reputation threshold for "struggling" — spawn/patience penalties begin */
  STRUGGLING_THRESHOLD: 20,
  /** Spawn multiplier at high reputation (GOOD_THRESHOLD+) */
  SPAWN_BONUS_HIGH: 1.15,
  /** Spawn multiplier at neutral reputation (between thresholds) */
  SPAWN_RATE_NEUTRAL: 1.0,
  /** Spawn multiplier at struggling threshold */
  SPAWN_RATE_STRUGGLING: 0.85,
  /** Minimum spawn multiplier (floor for very low rep) */
  SPAWN_RATE_MIN: 0.5,
  /** Death streak length for bonus rep penalty */
  DEATH_STREAK_PENALTY_THRESHOLD: 5,
  /** Extra reputation lost when death streak hits threshold */
  DEATH_STREAK_REP_PENALTY: 5,
  /** Death streak length for spawn reduction next day */
  DEATH_STREAK_SPAWN_THRESHOLD: 7,
  /** Spawn reduction factor when death streak is severe */
  DEATH_STREAK_SPAWN_REDUCTION: 0.3,
} as const;

// -----------------------------------------------------------------------------
// Collection Limits
// -----------------------------------------------------------------------------

export const COLLECTIONS = {
  /** Maximum stored dungeon events */
  MAX_DUNGEON_EVENTS: 100,
  /** Maximum stored customer reviews */
  MAX_CUSTOMER_REVIEWS: 50,
  /** Dungeon event display limit (UI) */
  DUNGEON_EVENT_DISPLAY_LIMIT: 50,
  /** Customer review display limit (UI) */
  CUSTOMER_REVIEW_DISPLAY_LIMIT: 20,
} as const;

// -----------------------------------------------------------------------------
// Upgrade System
// -----------------------------------------------------------------------------

export const UPGRADES = {
  TIER_NAMES: ['BASIC', 'ENHANCED', 'SUPERIOR'] as const,
  TIER_MULTIPLIERS: [1, 2, 3] as readonly number[],
  COSTS: {
    healing: [200, 450],
    strength: [250, 500],
    defense: [250, 500],
    speed: [250, 550],
    luck: [300, 600],
  } as Readonly<Record<string, readonly number[]>>,
} as const;

// -----------------------------------------------------------------------------
// Merchant
// -----------------------------------------------------------------------------

export const MERCHANT = {
  BASE_HEALING_STOCK: 5,
  BASE_STRENGTH_STOCK: 3,
  BASE_DEFENSE_STOCK: 3,
  BASE_SPEED_STOCK: 2,
  BASE_LUCK_STOCK: 2,
  /** Day divisor for bonus stock */
  DAY_BONUS_DIVISOR: 10,
  HEALING_COST: 15,
  STRENGTH_COST: 25,
  DEFENSE_COST: 27,
  SPEED_COST: 30,
  LUCK_COST: 35,
} as const;

export const EMERGENCY_RESTOCK = {
  /** Multiplier on merchant price for mid-day emergency restocking */
  PRICE_MULTIPLIER: 2.5,
  /** Units added per emergency restock */
  UNITS_PER_RESTOCK: 2,
  /** Show restock button when stock drops to this level */
  LOW_STOCK_THRESHOLD: 1,
} as const;

// -----------------------------------------------------------------------------
// Fleeing — adventurers can flee when HP drops below class thresholds
// -----------------------------------------------------------------------------

export const FLEE = {
  /** Per-class HP threshold (fraction of maxHp) below which flee attempt is possible */
  HP_THRESHOLDS: {
    [AdventurerClass.Warrior]: 0.15,
    [AdventurerClass.Barbarian]: 0.1,
    [AdventurerClass.Paladin]: 0.2,
    [AdventurerClass.Rogue]: 0.3,
    [AdventurerClass.Ranger]: 0.25,
    [AdventurerClass.Mage]: 0.35,
    [AdventurerClass.Cleric]: 0.3,
    [AdventurerClass.Necromancer]: 0.25,
  } as Readonly<Record<AdventurerClass, number>>,
  /** Base chance to flee per damage tick when below threshold */
  BASE_CHANCE: 0.15,
  /** Modifier for desperate personality (desperate adventurers don't flee easily) */
  DESPERATE_MODIFIER: -0.1,
  /** Modifier for experienced personality (experienced adventurers know when to cut losses) */
  EXPERIENCED_MODIFIER: 0.1,
  /** Encounter types that prevent fleeing entirely */
  NO_FLEE_ENCOUNTERS: ['boss', 'ambush'] as readonly string[],
  /** Reputation change for a fled adventurer (surviving = positive) */
  REPUTATION_BONUS: 1,
} as const;

// -----------------------------------------------------------------------------
// Looting — post-victory gold accumulation with lingering danger
// -----------------------------------------------------------------------------

export const LOOT = {
  /** @deprecated Use LOOT_TICKS for deterministic looting. Duration of looting phase (ms). */
  DURATION_MS: 4000,
  /** Looting phase length in dungeon ticks (was DURATION_MS: 4000 / 2000 = 2, rounded up → 3) */
  LOOT_TICKS: 3,
  /** Gold per loot tick during looting phase */
  GOLD_PER_TICK: 8,
  /** Bonus gold per floor level per loot tick */
  GOLD_PER_FLOOR_PER_TICK: 4,
  /** Chance per loot tick of a lingering danger (trap, cave-in) */
  DANGER_CHANCE: 0.03,
  /** Damage from lingering danger (fraction of current HP) */
  DANGER_DAMAGE_FRACTION: 0.25,
} as const;

// -----------------------------------------------------------------------------
// Customer AI — personality-driven purchase behavior
// -----------------------------------------------------------------------------

export const CUSTOMER_AI = {
  /** Browse time override by personality (ms). Default is TIMING.MIN_BROWSE_TIME_MS (3000) */
  BROWSE_TIME: {
    desperate: 1500,
    experienced: 4000,
    frugal: 3500,
    trusting: 2000,
  } as Readonly<Record<string, number>>,
  /** Patience (timeout) override by personality (ms). Default is SHOP.QUEUE_TIMEOUT_MS */
  PATIENCE: {
    desperate: 12000,
    experienced: 16000,
    frugal: 24000,
    trusting: 20000,
  } as Readonly<Record<string, number>>,
  /** Auto-purchase chance multiplier by personality (applied to SHOP.AUTO_PURCHASE_CHANCE) */
  PURCHASE_CHANCE_MULTIPLIER: {
    desperate: 3.0,
    experienced: 1.5,
    frugal: 0.6,
    trusting: 2.0,
  } as Readonly<Record<string, number>>,
  /** Frugal customers leave if cheapest potion exceeds this fraction of their gold */
  FRUGAL_LEAVE_PRICE_THRESHOLD: 0.6,
  /** Experienced customers prefer potions matching their class needs */
  CLASS_POTION_PREFERENCE: {
    Warrior: ['basic-healing', 'defense-potion'],
    Barbarian: ['basic-healing', 'strength-potion'],
    Paladin: ['basic-healing', 'defense-potion'],
    Rogue: ['speed-elixir', 'strength-potion', 'basic-healing'],
    Ranger: ['speed-elixir', 'strength-potion', 'defense-potion'],
    Mage: ['luck-charm', 'defense-potion', 'basic-healing'],
    Cleric: ['basic-healing', 'defense-potion'],
    Necromancer: ['luck-charm', 'strength-potion', 'defense-potion'],
  } as Readonly<Record<string, readonly string[]>>,
} as const;

// -----------------------------------------------------------------------------
// Class Abilities — Passive stat modifiers per adventurer class
// Paladin and Necromancer are deferred (no entry here).
// -----------------------------------------------------------------------------

export interface ClassAbilityDefinition {
  name: string;
  description: string;
  /** Which potion stat this modifies (or 'special' for complex abilities) */
  affectedStat: 'healing' | 'speed' | 'luck' | 'defense' | 'strength' | 'special';
  /** Multiplier applied to the affected stat contribution (1.15 = 15% more effective) */
  multiplier: number;
  /** Extra survival bonus (flat, added after normal calculation) */
  survivalBonus?: number;
}

export const CLASS_ABILITIES: Readonly<Partial<Record<AdventurerClass, ClassAbilityDefinition>>> = {
  [AdventurerClass.Warrior]: {
    name: 'Iron Gut',
    description: 'Healing potions work 15% better on battle-hardened bodies.',
    affectedStat: 'healing',
    multiplier: 1.15,
  },
  [AdventurerClass.Rogue]: {
    name: 'Quick Hands',
    description: 'Speed potions flow 20% faster through nimble veins.',
    affectedStat: 'speed',
    multiplier: 1.2,
  },
  [AdventurerClass.Mage]: {
    name: 'Arcane Absorption',
    description: 'Luck potions resonate twice as strongly with arcane blood.',
    affectedStat: 'luck',
    multiplier: 2.0,
  },
  [AdventurerClass.Cleric]: {
    name: 'Blessed Constitution',
    description: 'Defense potions carry a divine ward, raising the survival floor by 5%.',
    affectedStat: 'defense',
    multiplier: 1.0,
    survivalBonus: 0.05,
  },
  [AdventurerClass.Ranger]: {
    name: "Nature's Bounty",
    description: 'Encounter odds shift toward treasure and away from elite foes.',
    affectedStat: 'special',
    multiplier: 1.0,
  },
  [AdventurerClass.Barbarian]: {
    name: 'Berserker Blood',
    description: 'Strength potions fuel a savage rage, siphoning life from every strike.',
    affectedStat: 'strength',
    multiplier: 1.0,
  },
} as const;

// -----------------------------------------------------------------------------
// Random Events
// -----------------------------------------------------------------------------

export const EVENTS = {
  /** Minimum days between random events */
  MIN_DAYS_BETWEEN: 2,
  /** Reduced cooldown for late-game events (days 20+) */
  LATE_GAME_MIN_DAYS_BETWEEN: 2,
  /** Same event can't trigger within this many days */
  VARIETY_WINDOW: 5,
  /** Cap on event history array length */
  MAX_EVENT_HISTORY: 10,
  /** Day threshold for late-game event pool */
  LATE_GAME_DAY: 20,
  /** Chance of event triggering */
  TRIGGER_CHANCE: 0.4,
  /** Increased event chance in late game */
  LATE_GAME_TRIGGER_CHANCE: 0.6,
  /** Gold for wealthy merchant event */
  WEALTHY_MERCHANT_GOLD: 500,
  /** Chance of survivor leaving a review */
  REVIEW_CHANCE_SURVIVOR: 0.7,
  /** Chance of death generating a review */
  REVIEW_CHANCE_DEATH: 0.5,
  /** Dragon Sighting — damage multiplier applied to dungeon */
  DRAGON_DAMAGE_MULTIPLIER: 1.2,
  /** Dragon Sighting — loot multiplier */
  DRAGON_LOOT_MULTIPLIER: 1.4,
  /** Potion Shortage — merchant price multiplier */
  SHORTAGE_PRICE_MULTIPLIER: 1.5,
  /** Hero's Return — adventurer level */
  HERO_LEVEL: 8,
  /** Hero's Return — adventurer gold */
  HERO_GOLD: 300,
} as const;

// -----------------------------------------------------------------------------
// Market — Supply/demand feedback and price fluctuation
// -----------------------------------------------------------------------------

export const MARKET = {
  /** Maximum demand shift per day (prevents oscillation) */
  MAX_DEMAND_SHIFT: 0.15,
  /** High death rate threshold (deaths/adventurers ratio) */
  HIGH_DEATH_THRESHOLD: 0.5,
  /** Price tolerance boost when healing demand surges */
  HEALING_DEMAND_PRICE_TOLERANCE: 0.3,
  /** Spawn weight shift for healing-seeking customers during demand surge */
  HEALING_DEMAND_SPAWN_BOOST: 0.5,
  /** Merchant price variance range (±15%) */
  PRICE_VARIANCE_RANGE: 0.15,
  /** Market ticker display duration in ms */
  TICKER_DURATION_MS: 8000,
} as const;

// -----------------------------------------------------------------------------
// Victory Tiers — Tiered outcome labels for successful 30-day runs
// Tiers are checked in order; the first match wins.
// -----------------------------------------------------------------------------

export interface VictoryTierDefinition {
  /** Internal key for the tier */
  id: 'master' | 'respected' | 'survivor';
  /** Display label shown as the primary victory headline */
  label: string;
  /** Short flavor line shown beneath the label */
  flavor: string;
  /** Minimum reputation required (inclusive) */
  minReputation: number;
  /** Minimum adventurers saved required (inclusive) */
  minSaved: number;
  /** Minimum combos triggered required (inclusive) */
  minCombosTriggered: number;
}

export const VICTORY_TIERS: readonly VictoryTierDefinition[] = [
  {
    id: 'master',
    label: 'Master Alchemist',
    flavor: "The dungeon's finest. Adventurers owe you their lives, and you turned a profit doing it.",
    minReputation: 80,
    minSaved: 30,
    minCombosTriggered: 5,
  },
  {
    id: 'respected',
    label: 'Respected Apothecary',
    flavor: 'A name adventurers trust. You kept most of them alive and kept the lights on.',
    minReputation: 60,
    minSaved: 20,
    minCombosTriggered: 0,
  },
  {
    id: 'survivor',
    label: 'Struggling Survivor',
    flavor: 'Thirty days, still standing. Not every shopkeeper can say that.',
    minReputation: 0,
    minSaved: 0,
    minCombosTriggered: 0,
  },
] as const;

// -----------------------------------------------------------------------------
// Potion Combos — Synergies when adventurer consumes multiple potions
// -----------------------------------------------------------------------------

export interface PotionComboDefinition {
  /** IDs of the two potions that form this combo */
  potionIds: readonly [string, string];
  /** Display name for the combo */
  name: string;
  /** What the combo does */
  description: string;
  /** Bonus survival chance from combo */
  survivalBonus: number;
  /** Bonus damage reduction in dungeon */
  damageReduction: number;
  /** Bonus loot multiplier */
  lootMultiplier: number;
  /** Optional: reduces victory tick threshold (similar to speed effect) */
  combatTickReduction?: number;
  /** Optional: reduces trap damage taken (fraction, e.g., 0.5 = halved) */
  trapDamageReduction?: number;
}

export const POTION_COMBOS: readonly PotionComboDefinition[] = [
  {
    potionIds: ['basic-healing', 'strength-potion'],
    name: 'Berserker Brew',
    description: 'Healing + Strength: heal while raging for devastating endurance',
    survivalBonus: 0.15,
    damageReduction: 0,
    lootMultiplier: 1.4,
  },
  {
    potionIds: ['basic-healing', 'defense-potion'],
    name: 'Ironhide Tonic',
    description: 'Healing + Protection: impenetrable defense with regeneration',
    survivalBonus: 0.12,
    damageReduction: 0.12,
    lootMultiplier: 1.0,
  },
  {
    potionIds: ['strength-potion', 'defense-potion'],
    name: 'Warlord Elixir',
    description: 'Strength + Protection: unstoppable force meets immovable object',
    survivalBonus: 0.1,
    damageReduction: 0.08,
    lootMultiplier: 1.3,
  },
  // 4. Healing + Speed = "Adrenaline Rush"
  {
    potionIds: ['basic-healing', 'speed-elixir'],
    name: 'Adrenaline Rush',
    description: 'Healing + Speed: rapid recovery under fire',
    survivalBonus: 0.2,
    damageReduction: 0,
    lootMultiplier: 1.0,
    combatTickReduction: 1,
  },
  // 5. Healing + Luck = "Fortune's Favor"
  {
    potionIds: ['basic-healing', 'luck-charm'],
    name: "Fortune's Favor",
    description: 'Healing + Luck: blessed with vitality and fortune',
    survivalBonus: 0.1,
    damageReduction: 0,
    lootMultiplier: 1.3,
  },
  // 6. Strength + Speed = "Blitz Strike"
  {
    potionIds: ['strength-potion', 'speed-elixir'],
    name: 'Blitz Strike',
    description: 'Strength + Speed: lightning-fast devastation',
    survivalBonus: 0,
    damageReduction: 0,
    lootMultiplier: 1.5,
    combatTickReduction: 2,
  },
  // 7. Strength + Luck = "Critical Edge"
  {
    potionIds: ['strength-potion', 'luck-charm'],
    name: 'Critical Edge',
    description: 'Strength + Luck: every hit lands with precision',
    survivalBonus: 0.05,
    damageReduction: 0,
    lootMultiplier: 1.6,
  },
  // 8. Defense + Speed = "Evasion Cloak"
  {
    potionIds: ['defense-potion', 'speed-elixir'],
    name: 'Evasion Cloak',
    description: 'Protection + Speed: too fast to hit, too tough to hurt',
    survivalBonus: 0.18,
    damageReduction: 0.1,
    lootMultiplier: 1.0,
    combatTickReduction: 1,
    trapDamageReduction: 0.5,
  },
  // 9. Defense + Luck = "Guardian Angel"
  {
    potionIds: ['defense-potion', 'luck-charm'],
    name: 'Guardian Angel',
    description: 'Protection + Luck: divine protection shields the fortunate',
    survivalBonus: 0.15,
    damageReduction: 0.08,
    lootMultiplier: 1.1,
  },
  // 10. Speed + Luck = "Phantom Step"
  {
    potionIds: ['speed-elixir', 'luck-charm'],
    name: 'Phantom Step',
    description: 'Speed + Luck: ghostly agility turns danger into gold',
    survivalBonus: 0,
    damageReduction: 0,
    lootMultiplier: 1.8,
    combatTickReduction: 2,
  },
] as const;

// -----------------------------------------------------------------------------
// Encounter Types & Floor Definitions
// -----------------------------------------------------------------------------

export type EncounterType = 'normal' | 'trap' | 'ambush' | 'elite' | 'treasure' | 'boss' | 'cursed';

export interface EncounterDefinition {
  type: EncounterType;
  name: string;
  description: string;
  /** Damage multiplier (1.0 = normal) */
  damageMultiplier: number;
  /** Bonus gold if survived */
  bonusGold: number;
  /** @deprecated Use extraCombatTicks for deterministic combat. Extra combat time in ms (added to base VICTORY_DURATION_MS). */
  extraCombatTime: number;
  /** Extra combat ticks added to VICTORY_TICKS (Math.ceil(extraCombatTime / 2000)) */
  extraCombatTicks: number;
  /** Classes that have advantage against this encounter */
  advantagedClasses: readonly AdventurerClass[];
}

/** Encounter pool — weighted by floor range */
export const ENCOUNTER_POOL: readonly EncounterDefinition[] = [
  {
    type: 'normal',
    name: 'Goblin Patrol',
    description: 'A standard patrol of dungeon denizens',
    damageMultiplier: 1.0,
    bonusGold: 0,
    extraCombatTime: 0,
    extraCombatTicks: 0,
    advantagedClasses: [AdventurerClass.Warrior, AdventurerClass.Barbarian],
  },
  {
    type: 'trap',
    name: 'Spike Corridor',
    description: 'Hidden floor spikes deal immediate damage',
    damageMultiplier: 0.7,
    bonusGold: 10,
    extraCombatTime: 0,
    extraCombatTicks: 0,
    advantagedClasses: [AdventurerClass.Rogue, AdventurerClass.Ranger],
  },
  {
    type: 'ambush',
    name: 'Shadow Ambush',
    description: 'Enemies attack from the darkness with devastating first strike',
    damageMultiplier: 1.3,
    bonusGold: 15,
    extraCombatTime: 1000,
    extraCombatTicks: 1, // Math.ceil(1000 / 2000) = 1
    advantagedClasses: [AdventurerClass.Rogue, AdventurerClass.Ranger],
  },
  {
    type: 'elite',
    name: 'Dungeon Guardian',
    description: 'A powerful elite enemy blocks the path forward',
    damageMultiplier: 1.5,
    bonusGold: 35,
    extraCombatTime: 2000,
    extraCombatTicks: 1, // Math.ceil(2000 / 2000) = 1
    advantagedClasses: [AdventurerClass.Warrior, AdventurerClass.Paladin],
  },
  {
    type: 'treasure',
    name: 'Hidden Vault',
    description: 'A chamber filled with treasure, guarded by a riddle lock',
    damageMultiplier: 0.5,
    bonusGold: 50,
    extraCombatTime: 0,
    extraCombatTicks: 0,
    advantagedClasses: [AdventurerClass.Mage, AdventurerClass.Necromancer],
  },
  {
    type: 'normal',
    name: 'Skeleton Horde',
    description: 'Undead warriors rise from the dungeon floor',
    damageMultiplier: 1.1,
    bonusGold: 5,
    extraCombatTime: 0,
    extraCombatTicks: 0,
    advantagedClasses: [AdventurerClass.Cleric, AdventurerClass.Paladin],
  },
  {
    type: 'trap',
    name: 'Poison Gas Chamber',
    description: 'A sealed room fills with noxious fumes',
    damageMultiplier: 0.8,
    bonusGold: 15,
    extraCombatTime: 500,
    extraCombatTicks: 1, // Math.ceil(500 / 2000) = 1
    advantagedClasses: [AdventurerClass.Cleric, AdventurerClass.Mage],
  },
  {
    type: 'ambush',
    name: 'Mimic Chest',
    description: 'What looked like treasure bites back!',
    damageMultiplier: 1.2,
    bonusGold: 25,
    extraCombatTime: 500,
    extraCombatTicks: 1, // Math.ceil(500 / 2000) = 1
    advantagedClasses: [AdventurerClass.Rogue, AdventurerClass.Ranger],
  },
  {
    type: 'elite',
    name: 'Dark Mage',
    description: 'A powerful sorcerer hurls devastating spells',
    damageMultiplier: 1.4,
    bonusGold: 40,
    extraCombatTime: 1500,
    extraCombatTicks: 1, // Math.ceil(1500 / 2000) = 1
    advantagedClasses: [AdventurerClass.Mage, AdventurerClass.Necromancer],
  },
  {
    type: 'treasure',
    name: 'Abandoned Camp',
    description: 'A previous adventurer left behind supplies',
    damageMultiplier: 0.3,
    bonusGold: 30,
    extraCombatTime: 0,
    extraCombatTicks: 0,
    advantagedClasses: [AdventurerClass.Ranger, AdventurerClass.Rogue],
  },
  {
    type: 'cursed',
    name: 'Cursed Shrine',
    description: 'A dark altar drains potion effectiveness',
    damageMultiplier: 1.1,
    bonusGold: 20,
    extraCombatTime: 3000,
    extraCombatTicks: 2, // Math.ceil(3000 / 2000) = 2
    advantagedClasses: [AdventurerClass.Cleric, AdventurerClass.Paladin],
  },
  {
    type: 'cursed',
    name: 'Corrupted Font',
    description: 'Tainted waters weaken magical protections',
    damageMultiplier: 1.2,
    bonusGold: 25,
    extraCombatTime: 2000,
    extraCombatTicks: 1, // Math.ceil(2000 / 2000) = 1
    advantagedClasses: [AdventurerClass.Mage, AdventurerClass.Necromancer],
  },
] as const;

/**
 * Precomputed lookup: encounters grouped by type.
 * Avoids O(n) ENCOUNTER_POOL.filter() on every combat initialization.
 */
export const ENCOUNTER_POOL_BY_TYPE: Readonly<Record<EncounterType, readonly EncounterDefinition[]>> = (() => {
  const map: Partial<Record<EncounterType, EncounterDefinition[]>> = {};
  for (const enc of ENCOUNTER_POOL) {
    if (!map[enc.type]) map[enc.type] = [];
    (map[enc.type] as EncounterDefinition[]).push(enc);
  }
  return map as Record<EncounterType, readonly EncounterDefinition[]>;
})();

/** Boss encounters — special enemies for boss floors */
export const BOSS_ENCOUNTERS: readonly EncounterDefinition[] = [
  {
    type: 'boss',
    name: 'The Warden',
    description: 'Floor 5 guardian: a hulking armored beast that shakes the earth',
    damageMultiplier: 1.8,
    bonusGold: 75,
    extraCombatTime: 3000,
    extraCombatTicks: 2, // Math.ceil(3000 / 2000) = 2
    advantagedClasses: [AdventurerClass.Barbarian, AdventurerClass.Warrior],
  },
  {
    type: 'boss',
    name: 'The Lich King',
    description: 'Floor 10 final boss: an ancient undead sorcerer of immense power',
    damageMultiplier: 2.2,
    bonusGold: 150,
    extraCombatTime: 5000,
    extraCombatTicks: 3, // Math.ceil(5000 / 2000) = 3
    advantagedClasses: [AdventurerClass.Paladin, AdventurerClass.Cleric],
  },
  {
    type: 'boss',
    name: 'The Alchemist',
    description: 'A mad alchemist who reduces potion effectiveness by half',
    damageMultiplier: 1.6,
    bonusGold: 80,
    extraCombatTime: 8000,
    extraCombatTicks: 4, // Math.ceil(8000 / 2000) = 4
    advantagedClasses: [AdventurerClass.Rogue, AdventurerClass.Ranger],
  },
] as const;

// -----------------------------------------------------------------------------
// Encounter Variants — display-only modifiers applied on top of base encounters
// -----------------------------------------------------------------------------

/** Encounter variant — a modifier applied to base encounters for variety */
export interface EncounterVariant {
  /** Display label */
  label: string;
  /** Damage multiplier (applied on top of encounter's damageMultiplier) */
  damageMult: number;
  /** Gold multiplier (applied on top of encounter's bonusGold) */
  goldMult: number;
  /** Minimum floor this variant can appear */
  minFloor: number;
  /** Spawn chance (0-1) when eligible */
  spawnChance: number;
}

export const ENCOUNTER_VARIANTS: Readonly<Record<string, EncounterVariant>> = {
  miniboss: {
    label: 'Miniboss',
    damageMult: 1.4,
    goldMult: 1.5,
    minFloor: 7,
    spawnChance: 0.15,
  },
  fortified: {
    label: 'Fortified',
    damageMult: 1.0,
    goldMult: 1.3,
    minFloor: 4,
    spawnChance: 0.12,
  },
  pack: {
    label: 'Pack',
    damageMult: 1.5,
    goldMult: 2.0,
    minFloor: 5,
    spawnChance: 0.1,
  },
} as const;

/** Which base encounter types can have which variants */
export const VARIANT_ELIGIBILITY: Readonly<Record<string, readonly EncounterType[]>> = {
  miniboss: ['normal', 'elite'],
  fortified: ['trap', 'normal'],
  pack: ['ambush'],
} as const;

/**
 * Valid dungeon floor numbers. Keep in sync with FLOOR_ENCOUNTER_WEIGHTS keys —
 * the typed key is what guards against the silent-undefined bug March RTG
 * Finding 5 flagged. Use `clampFloor()` (in dungeon-simulation.service) to map
 * any incoming floor into this range.
 */
export type DungeonFloor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

/** Floor-specific encounter weights (higher = more likely) */
export const FLOOR_ENCOUNTER_WEIGHTS: Readonly<Record<DungeonFloor, Readonly<Record<EncounterType, number>>>> = {
  1: { normal: 60, trap: 20, ambush: 10, elite: 5, treasure: 5, boss: 0, cursed: 0 },
  2: { normal: 50, trap: 20, ambush: 15, elite: 10, treasure: 5, boss: 0, cursed: 0 },
  3: { normal: 45, trap: 20, ambush: 15, elite: 12, treasure: 8, boss: 0, cursed: 0 },
  4: { normal: 40, trap: 18, ambush: 18, elite: 14, treasure: 10, boss: 0, cursed: 0 },
  5: { normal: 30, trap: 15, ambush: 15, elite: 15, treasure: 10, boss: 15, cursed: 0 },
  6: { normal: 35, trap: 18, ambush: 20, elite: 17, treasure: 10, boss: 0, cursed: 0 },
  7: { normal: 30, trap: 15, ambush: 22, elite: 20, treasure: 13, boss: 0, cursed: 0 },
  8: { normal: 25, trap: 15, ambush: 22, elite: 23, treasure: 15, boss: 0, cursed: 0 },
  9: { normal: 20, trap: 15, ambush: 20, elite: 35, treasure: 10, boss: 0, cursed: 0 },
  10: { normal: 15, trap: 10, ambush: 15, elite: 20, treasure: 10, boss: 30, cursed: 0 },
  11: { normal: 25, trap: 15, ambush: 15, elite: 25, treasure: 10, boss: 5, cursed: 5 },
  12: { normal: 20, trap: 15, ambush: 15, elite: 25, treasure: 10, boss: 5, cursed: 10 },
  13: { normal: 15, trap: 15, ambush: 15, elite: 25, treasure: 10, boss: 5, cursed: 15 },
  14: { normal: 10, trap: 15, ambush: 10, elite: 25, treasure: 10, boss: 10, cursed: 20 },
  15: { normal: 5, trap: 10, ambush: 10, elite: 20, treasure: 10, boss: 20, cursed: 25 },
} as const;
