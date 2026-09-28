import { Injectable } from '@angular/core';
import { Ingredient, Potion, PotionEffects, Recipe } from '../models/potion.model';
import { POTION_COMBOS, PotionComboDefinition, POTIONS } from '../config/game-config';

@Injectable()
export class PotionCraftingService {
  private potions: Potion[] = [];
  private discoveredCombos = new Set<string>();

  constructor() {
    this.initializePotions();
  }

  getAllPotions(): Potion[] {
    return this.potions;
  }

  getPotionById(id: string): Potion | undefined {
    return this.potions.find((p) => p.id === id);
  }

  calculateEffects(potion: Potion): PotionEffects {
    const effects = { ...potion.effects };

    // Apply quality modifier
    if (effects.healing) {
      effects.healing = Math.floor(effects.healing * potion.quality);
    }
    if (effects.strengthBoost) {
      effects.strengthBoost = Math.floor(effects.strengthBoost * potion.quality);
    }
    if (effects.defenseBoost) {
      effects.defenseBoost = Math.floor(effects.defenseBoost * potion.quality);
    }
    if (effects.speedBoost) {
      effects.speedBoost = Math.floor(effects.speedBoost * potion.quality);
    }
    if (effects.luckBoost) {
      effects.luckBoost = Math.floor(effects.luckBoost * potion.quality);
    }

    // Diluted potions have reduced effects
    if (potion.isDiluted) {
      const dilutionMultiplier = POTIONS.DILUTION_QUALITY_MULTIPLIER;
      if (effects.healing) effects.healing = Math.floor(effects.healing * dilutionMultiplier);
      if (effects.strengthBoost) effects.strengthBoost = Math.floor(effects.strengthBoost * dilutionMultiplier);
      if (effects.defenseBoost) effects.defenseBoost = Math.floor(effects.defenseBoost * dilutionMultiplier);
      if (effects.speedBoost) effects.speedBoost = Math.floor(effects.speedBoost * dilutionMultiplier);
      if (effects.luckBoost) effects.luckBoost = Math.floor(effects.luckBoost * dilutionMultiplier);
    }

    return effects;
  }

  createDilutedPotion(potion: Potion): Potion {
    return {
      ...potion,
      id: `diluted-${potion.id}`,
      name: `Diluted ${potion.name}`,
      quality: potion.quality * POTIONS.DILUTION_QUALITY_MULTIPLIER,
      isDiluted: true,
      // Diluted potions sell at 40% of base price - dilution should NOT be profitable
      // 1 potion at 100% → 2 diluted at 40% each = 80% total (20% loss)
      basePrice: Math.floor(potion.basePrice * POTIONS.DILUTION_PRICE_MULTIPLIER),
    };
  }

  /**
   * Detect if an adventurer's consumed potions form a combo.
   * Strips 'diluted-' prefix for matching (diluted potions DO count).
   * Returns the first matching combo or null.
   */
  detectCombo(consumedPotionIds: string[]): PotionComboDefinition | null {
    // Strip 'diluted-' prefix from all consumed potion IDs
    const normalizedIds = consumedPotionIds.map((id) => id.replace(/^diluted-/, ''));
    const uniqueIds = new Set(normalizedIds);

    // Check each combo definition
    for (const combo of POTION_COMBOS) {
      const [potion1, potion2] = combo.potionIds;
      if (uniqueIds.has(potion1) && uniqueIds.has(potion2)) {
        return combo;
      }
    }

    return null;
  }

  /**
   * Get a display-friendly combo result for the dungeon event log.
   * Returns null if no combo.
   */
  getComboDisplay(consumedPotionIds: string[]): { name: string; description: string } | null {
    const combo = this.detectCombo(consumedPotionIds);
    if (!combo) {
      return null;
    }

    return {
      name: combo.name,
      description: combo.description,
    };
  }

  /**
   * Mark a combo as discovered. Returns true if this is a NEW discovery.
   */
  discoverCombo(comboName: string): boolean {
    if (this.discoveredCombos.has(comboName)) {
      return false;
    }
    this.discoveredCombos.add(comboName);
    return true;
  }

  /** Check whether a combo has been discovered before. */
  isComboDiscovered(comboName: string): boolean {
    return this.discoveredCombos.has(comboName);
  }

  /** Return all discovered combo names (for save serialization). */
  getDiscoveredCombos(): string[] {
    return Array.from(this.discoveredCombos);
  }

  /** Restore discovered combos from a saved state. */
  loadDiscoveredCombos(names: string[]): void {
    this.discoveredCombos = new Set(names);
  }

  /** Return all combo definitions (e.g. for merchant tips display). */
  getAllCombos(): PotionComboDefinition[] {
    return [...POTION_COMBOS];
  }

  private initializePotions(): void {
    this.potions = [
      {
        id: 'basic-healing',
        name: 'Basic Healing Potion',
        description: 'Restores a small amount of health',
        basePrice: 50,
        color: '#dc2626',
        particleColor: '#fca5a5',
        viscosity: 'normal',
        recipe: this.createRecipe(['herbs', 'water'], 'easy', 1),
        quality: 0.8,
        isDiluted: false,
        effects: {
          healing: 50,
        },
        discovered: true,
        timesCrafted: 0,
        deathsCaused: 0,
        livesSaved: 0,
        customerRating: 3.5,
      },
      {
        id: 'strength-potion',
        name: 'Basic Strength Potion',
        description: 'Increases physical power temporarily',
        basePrice: 75,
        color: '#ea580c',
        particleColor: '#fed7aa',
        viscosity: 'thick',
        recipe: this.createRecipe(['mushroom', 'herbs', 'water'], 'medium', 2),
        quality: 0.75,
        isDiluted: false,
        effects: {
          strengthBoost: 10,
        },
        discovered: true,
        timesCrafted: 0,
        deathsCaused: 0,
        livesSaved: 0,
        customerRating: 4,
      },
      {
        id: 'defense-potion',
        name: 'Basic Protection Potion',
        description: 'Hardens skin like stone',
        basePrice: 80,
        color: '#64748b',
        particleColor: '#cbd5e1',
        viscosity: 'thick',
        recipe: this.createRecipe(['mushroom', 'herbs'], 'medium', 2),
        quality: 0.8,
        isDiluted: false,
        effects: {
          defenseBoost: 8,
        },
        discovered: true,
        timesCrafted: 0,
        deathsCaused: 0,
        livesSaved: 0,
        customerRating: 4.2,
      },
      {
        id: 'speed-elixir',
        name: 'Speed Elixir',
        description: 'Quickens reflexes and movement',
        basePrice: 90,
        color: '#06b6d4',
        particleColor: '#67e8f9',
        viscosity: 'thin',
        recipe: this.createRecipe(['herbs', 'water'], 'medium', 2),
        quality: 0.8,
        isDiluted: false,
        effects: { speedBoost: 10 },
        discovered: true,
        timesCrafted: 0,
        deathsCaused: 0,
        livesSaved: 0,
        customerRating: 4.0,
      },
      {
        id: 'luck-charm',
        name: 'Luck Charm',
        description: "Twists fate in the drinker's favor",
        basePrice: 100,
        color: '#a855f7',
        particleColor: '#d8b4fe',
        viscosity: 'thin',
        recipe: this.createRecipe(['mushroom', 'herbs', 'water'], 'hard', 3),
        quality: 0.75,
        isDiluted: false,
        effects: { luckBoost: 10 },
        discovered: true,
        timesCrafted: 0,
        deathsCaused: 0,
        livesSaved: 0,
        customerRating: 3.8,
      },
      // Greater Healing removed - replaced by permanent upgrade system
      // Players can now upgrade Basic Healing to get 2x effect instead
    ];
  }

  private createRecipe(ingredientIds: string[], difficulty: Recipe['difficulty'], level: number): Recipe {
    const ingredients: Ingredient[] = ingredientIds.map((id) => ({
      id,
      name: this.getIngredientName(id),
      quantity: 1,
      cost: this.getIngredientCost(id),
      rarity: 'common',
      description: '',
    }));

    return {
      ingredients,
      requiredLevel: level,
      craftingTime: 2000,
      difficulty,
    };
  }

  private getIngredientName(id: string): string {
    const names: Record<string, string> = {
      herbs: 'Healing Herbs',
      mushroom: 'Red Mushroom',
      water: 'Pure Water',
    };
    return names[id] || id;
  }

  private getIngredientCost(id: string): number {
    const costs: Record<string, number> = {
      herbs: 10,
      mushroom: 15,
      water: 5,
    };
    return costs[id] || 10;
  }
}
