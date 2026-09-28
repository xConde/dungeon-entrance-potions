export interface Potion {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  color: string;
  particleColor: string;
  viscosity: 'thin' | 'normal' | 'thick' | 'chunky';

  // Crafting
  recipe: Recipe;
  quality: number; // 0-1, based on crafting
  isDiluted: boolean;

  // Effects
  effects: PotionEffects;

  // Meta
  discovered: boolean;
  timesCrafted: number;
  deathsCaused: number;
  livesSaved: number;
  customerRating: number; // 1-5 stars
}

export interface Recipe {
  ingredients: Ingredient[];
  requiredLevel: number;
  craftingTime: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  discoveredBy?: 'player' | 'recipe' | 'accident';
}

export interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  quality?: 'poor' | 'normal' | 'high' | 'perfect';
  cost: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  effects?: string[];
  description: string;
}

export interface PotionEffects {
  healing?: number;
  strengthBoost?: number;
  defenseBoost?: number;
  speedBoost?: number; // Reduces explore/combat tick thresholds
  luckBoost?: number; // Increases loot multiplier, shifts encounter weights
}
