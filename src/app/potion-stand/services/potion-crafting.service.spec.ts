import { TestBed } from '@angular/core/testing';
import { PotionCraftingService } from './potion-crafting.service';
import { Potion } from '../models/potion.model';

describe('PotionCraftingService', () => {
  let service: PotionCraftingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PotionCraftingService],
    });
    service = TestBed.inject(PotionCraftingService);
  });

  describe('Service Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should initialize with 5 base potions', () => {
      const potions = service.getAllPotions();

      expect(potions.length).toBe(5);
    });
  });

  describe('getAllPotions', () => {
    it('should return all available potions', () => {
      const potions = service.getAllPotions();

      expect(potions).toBeDefined();
      expect(Array.isArray(potions)).toBe(true);
    });

    it('should include basic-healing potion', () => {
      const potions = service.getAllPotions();
      const healingPotion = potions.find((p) => p.id === 'basic-healing');

      expect(healingPotion).toBeDefined();
      expect(healingPotion?.name).toBe('Basic Healing Potion');
      expect(healingPotion?.basePrice).toBe(50);
      expect(healingPotion?.effects.healing).toBe(50);
    });

    it('should include strength-potion', () => {
      const potions = service.getAllPotions();
      const strengthPotion = potions.find((p) => p.id === 'strength-potion');

      expect(strengthPotion).toBeDefined();
      expect(strengthPotion?.name).toBe('Basic Strength Potion');
      expect(strengthPotion?.basePrice).toBe(75);
      expect(strengthPotion?.effects.strengthBoost).toBe(10);
    });

    it('should include defense-potion', () => {
      const potions = service.getAllPotions();
      const defensePotion = potions.find((p) => p.id === 'defense-potion');

      expect(defensePotion).toBeDefined();
      expect(defensePotion?.name).toBe('Basic Protection Potion');
      expect(defensePotion?.basePrice).toBe(80);
      expect(defensePotion?.effects.defenseBoost).toBe(8);
    });

    it('should include speed-elixir', () => {
      const potions = service.getAllPotions();
      const speedPotion = potions.find((p) => p.id === 'speed-elixir');

      expect(speedPotion).toBeDefined();
      expect(speedPotion?.name).toBe('Speed Elixir');
      expect(speedPotion?.basePrice).toBe(90);
      expect(speedPotion?.effects.speedBoost).toBe(10);
      expect(speedPotion?.color).toBe('#06b6d4');
    });

    it('should include luck-charm', () => {
      const potions = service.getAllPotions();
      const luckPotion = potions.find((p) => p.id === 'luck-charm');

      expect(luckPotion).toBeDefined();
      expect(luckPotion?.name).toBe('Luck Charm');
      expect(luckPotion?.basePrice).toBe(100);
      expect(luckPotion?.effects.luckBoost).toBe(10);
      expect(luckPotion?.color).toBe('#a855f7');
    });

    it('should have exactly 5 base potions (greater-healing replaced by upgrade system)', () => {
      const potions = service.getAllPotions();
      // 5 base potions: basic-healing, strength-potion, defense-potion, speed-elixir, luck-charm
      // Greater healing is now obtained via permanent upgrade system
      expect(potions.length).toBe(5);
      expect(potions.find((p) => p.id === 'greater-healing')).toBeUndefined();
    });
  });

  describe('getPotionById', () => {
    it('should return potion by id', () => {
      const potion = service.getPotionById('basic-healing');

      expect(potion).toBeDefined();
      expect(potion?.id).toBe('basic-healing');
    });

    it('should return undefined for non-existent id', () => {
      const potion = service.getPotionById('non-existent-potion');

      expect(potion).toBeUndefined();
    });
  });

  describe('calculateEffects', () => {
    it('should apply quality modifier to healing effect', () => {
      const potion: Potion = {
        id: 'test',
        name: 'Test Potion',
        description: 'Test',
        basePrice: 50,
        color: '#ff0000',
        particleColor: '#ff0000',
        viscosity: 'normal',
        recipe: { ingredients: [], requiredLevel: 1, craftingTime: 1000, difficulty: 'easy' },
        quality: 0.8, // 80% quality
        isDiluted: false,
        effects: { healing: 100 },
        discovered: true,
        timesCrafted: 0,
        deathsCaused: 0,
        livesSaved: 0,
        customerRating: 5,
      };

      const effects = service.calculateEffects(potion);

      // 100 * 0.8 = 80
      expect(effects.healing).toBe(80);
    });

    it('should apply quality modifier to strength boost', () => {
      const potion: Potion = {
        id: 'test',
        name: 'Test Potion',
        description: 'Test',
        basePrice: 50,
        color: '#ff0000',
        particleColor: '#ff0000',
        viscosity: 'normal',
        recipe: { ingredients: [], requiredLevel: 1, craftingTime: 1000, difficulty: 'easy' },
        quality: 0.75,
        isDiluted: false,
        effects: { strengthBoost: 10 },
        discovered: true,
        timesCrafted: 0,
        deathsCaused: 0,
        livesSaved: 0,
        customerRating: 5,
      };

      const effects = service.calculateEffects(potion);

      // 10 * 0.75 = 7.5 -> 7 (floored)
      expect(effects.strengthBoost).toBe(7);
    });

    it('should apply dilution penalty on top of quality', () => {
      const potion: Potion = {
        id: 'test',
        name: 'Diluted Test Potion',
        description: 'Test',
        basePrice: 50,
        color: '#ff0000',
        particleColor: '#ff0000',
        viscosity: 'normal',
        recipe: { ingredients: [], requiredLevel: 1, craftingTime: 1000, difficulty: 'easy' },
        quality: 1.0,
        isDiluted: true, // Diluted
        effects: { healing: 100 },
        discovered: true,
        timesCrafted: 0,
        deathsCaused: 0,
        livesSaved: 0,
        customerRating: 5,
      };

      const effects = service.calculateEffects(potion);

      // 100 * 1.0 = 100, then * 0.5 = 50
      expect(effects.healing).toBe(50);
    });

    it('should apply both quality and dilution modifiers', () => {
      const potion: Potion = {
        id: 'test',
        name: 'Diluted Test Potion',
        description: 'Test',
        basePrice: 50,
        color: '#ff0000',
        particleColor: '#ff0000',
        viscosity: 'normal',
        recipe: { ingredients: [], requiredLevel: 1, craftingTime: 1000, difficulty: 'easy' },
        quality: 0.8,
        isDiluted: true,
        effects: { healing: 100 },
        discovered: true,
        timesCrafted: 0,
        deathsCaused: 0,
        livesSaved: 0,
        customerRating: 5,
      };

      const effects = service.calculateEffects(potion);

      // 100 * 0.8 = 80, then * 0.5 = 40
      expect(effects.healing).toBe(40);
    });

    it('should apply quality modifier to speed boost', () => {
      const potion: Potion = {
        id: 'speed-elixir',
        name: 'Speed Elixir',
        description: 'Test',
        basePrice: 90,
        color: '#06b6d4',
        particleColor: '#67e8f9',
        viscosity: 'thin',
        recipe: { ingredients: [], requiredLevel: 2, craftingTime: 2000, difficulty: 'medium' },
        quality: 0.8,
        isDiluted: false,
        effects: { speedBoost: 10 },
        discovered: true,
        timesCrafted: 0,
        deathsCaused: 0,
        livesSaved: 0,
        customerRating: 4.0,
      };

      const effects = service.calculateEffects(potion);

      // 10 * 0.8 = 8
      expect(effects.speedBoost).toBe(8);
    });

    it('should apply quality modifier to luck boost', () => {
      const potion: Potion = {
        id: 'luck-charm',
        name: 'Luck Charm',
        description: 'Test',
        basePrice: 100,
        color: '#a855f7',
        particleColor: '#d8b4fe',
        viscosity: 'thin',
        recipe: { ingredients: [], requiredLevel: 3, craftingTime: 2000, difficulty: 'hard' },
        quality: 0.75,
        isDiluted: false,
        effects: { luckBoost: 10 },
        discovered: true,
        timesCrafted: 0,
        deathsCaused: 0,
        livesSaved: 0,
        customerRating: 3.8,
      };

      const effects = service.calculateEffects(potion);

      // 10 * 0.75 = 7.5 → 7 (floored)
      expect(effects.luckBoost).toBe(7);
    });

    it('should apply dilution penalty to speed and luck boosts', () => {
      const speedPotion: Potion = {
        id: 'speed-elixir',
        name: 'Speed Elixir',
        description: 'Test',
        basePrice: 90,
        color: '#06b6d4',
        particleColor: '#67e8f9',
        viscosity: 'thin',
        recipe: { ingredients: [], requiredLevel: 2, craftingTime: 2000, difficulty: 'medium' },
        quality: 1.0,
        isDiluted: true,
        effects: { speedBoost: 10 },
        discovered: true,
        timesCrafted: 0,
        deathsCaused: 0,
        livesSaved: 0,
        customerRating: 4.0,
      };

      const effects = service.calculateEffects(speedPotion);

      // 10 * 1.0 = 10, then * 0.5 = 5
      expect(effects.speedBoost).toBe(5);
    });

    it('should not modify effects for undefined values', () => {
      const potion: Potion = {
        id: 'test',
        name: 'Test Potion',
        description: 'Test',
        basePrice: 50,
        color: '#ff0000',
        particleColor: '#ff0000',
        viscosity: 'normal',
        recipe: { ingredients: [], requiredLevel: 1, craftingTime: 1000, difficulty: 'easy' },
        quality: 0.8,
        isDiluted: false,
        effects: {}, // No effects defined
        discovered: true,
        timesCrafted: 0,
        deathsCaused: 0,
        livesSaved: 0,
        customerRating: 5,
      };

      const effects = service.calculateEffects(potion);

      expect(effects.healing).toBeUndefined();
      expect(effects.strengthBoost).toBeUndefined();
      expect(effects.defenseBoost).toBeUndefined();
    });
  });

  describe('createDilutedPotion', () => {
    it('should create diluted version with correct id', () => {
      const originalPotion = service.getPotionById('basic-healing');
      expect(originalPotion).toBeDefined();
      if (!originalPotion) return;

      const dilutedPotion = service.createDilutedPotion(originalPotion);
      expect(dilutedPotion.id).toBe('diluted-basic-healing');
    });

    it('should create diluted version with correct name', () => {
      const originalPotion = service.getPotionById('basic-healing');
      expect(originalPotion).toBeDefined();
      if (!originalPotion) return;

      const dilutedPotion = service.createDilutedPotion(originalPotion);
      expect(dilutedPotion.name).toBe('Diluted Basic Healing Potion');
    });

    it('should mark potion as diluted', () => {
      const originalPotion = service.getPotionById('basic-healing');
      expect(originalPotion).toBeDefined();
      if (!originalPotion) return;

      const dilutedPotion = service.createDilutedPotion(originalPotion);
      expect(dilutedPotion.isDiluted).toBe(true);
    });

    it('should reduce quality by 50%', () => {
      const originalPotion = service.getPotionById('basic-healing');
      expect(originalPotion).toBeDefined();
      if (!originalPotion) return;

      const dilutedPotion = service.createDilutedPotion(originalPotion);
      expect(dilutedPotion.quality).toBe(originalPotion.quality * 0.5);
    });

    it('should reduce price to 40% of original (making dilution unprofitable)', () => {
      const originalPotion = service.getPotionById('basic-healing');
      expect(originalPotion).toBeDefined();
      if (!originalPotion) return;

      const dilutedPotion = service.createDilutedPotion(originalPotion);
      // 50 * 0.4 = 20
      expect(dilutedPotion.basePrice).toBe(Math.floor(originalPotion.basePrice * 0.4));
    });

    it('should make dilution economically unprofitable (2 diluted < 1 normal)', () => {
      const originalPotion = service.getPotionById('basic-healing');
      expect(originalPotion).toBeDefined();
      if (!originalPotion) return;

      const dilutedPotion = service.createDilutedPotion(originalPotion);
      // 1 potion becomes 2 diluted potions
      // 2 * diluted price should be less than 1 * original price
      const totalDilutedValue = dilutedPotion.basePrice * 2;
      expect(totalDilutedValue).toBeLessThan(originalPotion.basePrice);
    });

    it('should preserve other potion properties', () => {
      const originalPotion = service.getPotionById('basic-healing');
      expect(originalPotion).toBeDefined();
      if (!originalPotion) return;

      const dilutedPotion = service.createDilutedPotion(originalPotion);
      expect(dilutedPotion.color).toBe(originalPotion.color);
      expect(dilutedPotion.particleColor).toBe(originalPotion.particleColor);
      expect(dilutedPotion.viscosity).toBe(originalPotion.viscosity);
      expect(dilutedPotion.effects.healing).toBe(originalPotion.effects.healing);
    });
  });

  describe('Potion Quality System', () => {
    it('should have quality values between 0 and 1 for all potions', () => {
      const potions = service.getAllPotions();

      potions.forEach((potion) => {
        expect(potion.quality).toBeGreaterThanOrEqual(0);
        expect(potion.quality).toBeLessThanOrEqual(1);
      });
    });

    it('should have all potions with valid quality values', () => {
      const potions = service.getAllPotions();
      potions.forEach((potion) => {
        expect(potion.quality).toBeGreaterThan(0);
        expect(potion.quality).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Potion Recipes', () => {
    it('should have recipes for all potions', () => {
      const potions = service.getAllPotions();

      potions.forEach((potion) => {
        expect(potion.recipe).toBeDefined();
        expect(potion.recipe.ingredients).toBeDefined();
        expect(potion.recipe.difficulty).toBeDefined();
        expect(potion.recipe.requiredLevel).toBeGreaterThanOrEqual(1);
      });
    });

    it('should have basic healing with easy difficulty', () => {
      const basicHealing = service.getPotionById('basic-healing');
      expect(basicHealing).toBeDefined();
      if (!basicHealing) return;

      // Basic healing should be easy difficulty
      expect(basicHealing.recipe.difficulty).toBe('easy');
    });
  });

  describe('Combo Detection', () => {
    describe('detectCombo', () => {
      it('should return null when no potions consumed', () => {
        const result = service.detectCombo([]);

        expect(result).toBeNull();
      });

      it('should return null when only one potion consumed', () => {
        const result = service.detectCombo(['basic-healing']);

        expect(result).toBeNull();
      });

      it('should detect Berserker Brew combo', () => {
        const result = service.detectCombo(['basic-healing', 'strength-potion']);

        expect(result).toBeDefined();
        expect(result?.name).toBe('Berserker Brew');
        expect(result?.survivalBonus).toBe(0.15);
        expect(result?.lootMultiplier).toBe(1.4);
      });

      it('should detect Ironhide Tonic combo', () => {
        const result = service.detectCombo(['basic-healing', 'defense-potion']);

        expect(result).toBeDefined();
        expect(result?.name).toBe('Ironhide Tonic');
        expect(result?.survivalBonus).toBe(0.12);
        expect(result?.damageReduction).toBe(0.12);
      });

      it('should detect Warlord Elixir combo', () => {
        const result = service.detectCombo(['strength-potion', 'defense-potion']);

        expect(result).toBeDefined();
        expect(result?.name).toBe('Warlord Elixir');
        expect(result?.survivalBonus).toBe(0.1);
        expect(result?.lootMultiplier).toBe(1.3);
      });

      it('should detect combo with diluted potions', () => {
        const result = service.detectCombo(['diluted-basic-healing', 'strength-potion']);

        expect(result).toBeDefined();
        expect(result?.name).toBe('Berserker Brew');
        expect(result?.survivalBonus).toBe(0.15);
      });

      it('should detect combo when extra potions are present', () => {
        const result = service.detectCombo(['basic-healing', 'strength-potion', 'defense-potion']);

        // Should match first combo found (Berserker Brew)
        expect(result).toBeDefined();
        expect(result?.name).toBe('Berserker Brew');
      });

      it('should return null for duplicate potions (no combo)', () => {
        const result = service.detectCombo(['basic-healing', 'basic-healing']);

        expect(result).toBeNull();
      });
    });

    describe('getComboDisplay', () => {
      it('should return name and description for valid combo', () => {
        const result = service.getComboDisplay(['basic-healing', 'strength-potion']);

        expect(result).toBeDefined();
        expect(result?.name).toBe('Berserker Brew');
        expect(result?.description).toBe('Healing + Strength: heal while raging for devastating endurance');
      });

      it('should return null for no combo', () => {
        const result = service.getComboDisplay([]);

        expect(result).toBeNull();
      });
    });
  });

  describe('Combo Discovery System', () => {
    describe('discoverCombo', () => {
      it('should return true for first discovery of a combo', () => {
        const result = service.discoverCombo('Berserker Brew');
        expect(result).toBe(true);
      });

      it('should return false for second discovery of same combo', () => {
        service.discoverCombo('Berserker Brew');
        const result = service.discoverCombo('Berserker Brew');
        expect(result).toBe(false);
      });

      it('should track multiple combos independently', () => {
        expect(service.discoverCombo('Berserker Brew')).toBe(true);
        expect(service.discoverCombo('Ironhide Tonic')).toBe(true);
        expect(service.discoverCombo('Berserker Brew')).toBe(false);
        expect(service.discoverCombo('Warlord Elixir')).toBe(true);
      });
    });

    describe('isComboDiscovered', () => {
      it('should return false for undiscovered combo', () => {
        expect(service.isComboDiscovered('Berserker Brew')).toBe(false);
      });

      it('should return true after combo is discovered', () => {
        service.discoverCombo('Berserker Brew');
        expect(service.isComboDiscovered('Berserker Brew')).toBe(true);
      });
    });

    describe('getDiscoveredCombos', () => {
      it('should return empty array when no combos discovered', () => {
        expect(service.getDiscoveredCombos()).toEqual([]);
      });

      it('should return all discovered combo names', () => {
        service.discoverCombo('Berserker Brew');
        service.discoverCombo('Ironhide Tonic');

        const discovered = service.getDiscoveredCombos();
        expect(discovered.length).toBe(2);
        expect(discovered).toContain('Berserker Brew');
        expect(discovered).toContain('Ironhide Tonic');
      });
    });

    describe('loadDiscoveredCombos', () => {
      it('should restore discovered combos from saved names', () => {
        service.loadDiscoveredCombos(['Berserker Brew', 'Warlord Elixir']);

        expect(service.isComboDiscovered('Berserker Brew')).toBe(true);
        expect(service.isComboDiscovered('Warlord Elixir')).toBe(true);
        expect(service.isComboDiscovered('Ironhide Tonic')).toBe(false);
      });

      it('should replace existing discovered combos', () => {
        service.discoverCombo('Ironhide Tonic');
        service.loadDiscoveredCombos(['Berserker Brew']);

        expect(service.isComboDiscovered('Berserker Brew')).toBe(true);
        expect(service.isComboDiscovered('Ironhide Tonic')).toBe(false);
      });

      it('should handle empty array', () => {
        service.discoverCombo('Berserker Brew');
        service.loadDiscoveredCombos([]);

        expect(service.getDiscoveredCombos()).toEqual([]);
      });
    });

    describe('getAllCombos', () => {
      it('should return all combo definitions', () => {
        const combos = service.getAllCombos();

        expect(combos.length).toBe(10);
        expect(combos.map((c) => c.name)).toContain('Berserker Brew');
        expect(combos.map((c) => c.name)).toContain('Ironhide Tonic');
        expect(combos.map((c) => c.name)).toContain('Warlord Elixir');
        expect(combos.map((c) => c.name)).toContain('Adrenaline Rush');
        expect(combos.map((c) => c.name)).toContain("Fortune's Favor");
        expect(combos.map((c) => c.name)).toContain('Blitz Strike');
        expect(combos.map((c) => c.name)).toContain('Critical Edge');
        expect(combos.map((c) => c.name)).toContain('Evasion Cloak');
        expect(combos.map((c) => c.name)).toContain('Guardian Angel');
        expect(combos.map((c) => c.name)).toContain('Phantom Step');
      });

      it('should return a copy (not mutable reference)', () => {
        const combos1 = service.getAllCombos();
        const combos2 = service.getAllCombos();

        expect(combos1).not.toBe(combos2);
      });
    });
  });
});
