import { inject, Injectable } from '@angular/core';
import { Adventurer, AdventurerClass, AdventurerStatus } from '../models/adventurer.model';
import { GameRngService } from './game-rng.service';

@Injectable()
export class AdventurerService {
  private readonly rng = inject(GameRngService);
  private readonly FIRST_NAMES = [
    'Aldric',
    'Brenna',
    'Cedric',
    'Daria',
    'Elron',
    'Fiona',
    'Gareth',
    'Helena',
    'Ivor',
    'Jessa',
    'Kael',
    'Lyra',
    'Magnus',
    'Nora',
    'Orin',
    'Petra',
    'Quinn',
    'Raven',
    'Soren',
    'Thea',
    'Ulric',
    'Vera',
    'Wren',
    'Xander',
  ];

  private readonly LAST_NAMES = [
    'Ironheart',
    'Shadowblade',
    'Stormborn',
    'Lightbringer',
    'Darkwood',
    'Flamestrike',
    'Frostwind',
    'Earthshaker',
    'Moonwhisper',
    'Sunforge',
    'Ravenwood',
    'Steelhand',
  ];

  private adventurerCounter = 0;

  /**
   * A hand-authored first deal. The normal generator is intentionally noisy,
   * but a new player should first learn the two-potion decision with enough
   * budget for multiple honest loadouts—not be forced into dilution by a roll.
   */
  generateOpeningAdventurer(): Adventurer {
    const adventurerClass = AdventurerClass.Warrior;
    const level = 1;
    const maxHp = this.calculateBaseHp(adventurerClass, level);

    return {
      id: `opening-adventurer-${++this.adventurerCounter}-${Date.now()}`,
      name: 'Mara Flint',
      class: adventurerClass,
      level,
      maxHp,
      currentHp: maxHp,
      gold: 190,
      strength: this.calculateStat(adventurerClass, 'strength', level),
      defense: this.calculateStat(adventurerClass, 'defense', level),
      magic: this.calculateStat(adventurerClass, 'magic', level),
      luck: this.calculateStat(adventurerClass, 'luck', level),
      potionsConsumed: [],
      survivalChance: this.calculateBaseSurvival(level, 1),
      status: AdventurerStatus.Shopping,
      enterTime: Date.now(),
      frugal: false,
      trusting: false,
      experienced: false,
      desperate: false,
      speechBubble: 'First descent. Help me come back alive.',
    };
  }

  generateAdventurer(day: number, difficulty: number): Adventurer {
    const adventurerClass = this.randomClass();
    const level = this.calculateLevel(day, difficulty);
    const baseHp = this.calculateBaseHp(adventurerClass, level);

    return {
      id: `adventurer-${++this.adventurerCounter}-${Date.now()}`,
      name: this.generateName(),
      class: adventurerClass,
      level,
      maxHp: baseHp,
      currentHp: baseHp,
      gold: this.calculateGold(level),
      strength: this.calculateStat(adventurerClass, 'strength', level),
      defense: this.calculateStat(adventurerClass, 'defense', level),
      magic: this.calculateStat(adventurerClass, 'magic', level),
      luck: this.calculateStat(adventurerClass, 'luck', level),
      potionsConsumed: [],
      survivalChance: this.calculateBaseSurvival(level, difficulty),
      status: AdventurerStatus.Shopping,
      enterTime: Date.now(),
      frugal: this.rng.chance(0.2),
      trusting: this.rng.chance(0.3),
      experienced: this.rng.chance(0.15),
      desperate: this.rng.chance(0.25),
    };
  }

  private generateName(): string {
    const first = this.rng.pick(this.FIRST_NAMES);
    const last = this.rng.pick(this.LAST_NAMES);
    return `${first} ${last}`;
  }

  private randomClass(): AdventurerClass {
    const classes = Object.values(AdventurerClass);
    return this.rng.pick(classes);
  }

  private calculateLevel(day: number, difficulty: number): number {
    const baseLevel = 1 + Math.floor(day / 3);
    const variance = this.rng.range(0, 2);
    return Math.max(1, Math.floor((baseLevel + variance) * difficulty));
  }

  private calculateBaseHp(adventurerClass: AdventurerClass, level: number): number {
    const baseHpByClass: Record<AdventurerClass, number> = {
      [AdventurerClass.Warrior]: 120,
      [AdventurerClass.Barbarian]: 140,
      [AdventurerClass.Paladin]: 130,
      [AdventurerClass.Rogue]: 80,
      [AdventurerClass.Ranger]: 90,
      [AdventurerClass.Mage]: 60,
      [AdventurerClass.Necromancer]: 70,
      [AdventurerClass.Cleric]: 100,
    };

    return baseHpByClass[adventurerClass] + (level - 1) * 10;
  }

  private calculateStat(adventurerClass: AdventurerClass, stat: string, level: number): number {
    const baseStats: Record<string, Record<AdventurerClass, number>> = {
      strength: {
        [AdventurerClass.Warrior]: 15,
        [AdventurerClass.Barbarian]: 18,
        [AdventurerClass.Paladin]: 14,
        [AdventurerClass.Rogue]: 10,
        [AdventurerClass.Ranger]: 12,
        [AdventurerClass.Mage]: 6,
        [AdventurerClass.Necromancer]: 7,
        [AdventurerClass.Cleric]: 10,
      },
      defense: {
        [AdventurerClass.Warrior]: 14,
        [AdventurerClass.Barbarian]: 12,
        [AdventurerClass.Paladin]: 16,
        [AdventurerClass.Rogue]: 8,
        [AdventurerClass.Ranger]: 10,
        [AdventurerClass.Mage]: 6,
        [AdventurerClass.Necromancer]: 7,
        [AdventurerClass.Cleric]: 12,
      },
      magic: {
        [AdventurerClass.Warrior]: 5,
        [AdventurerClass.Barbarian]: 4,
        [AdventurerClass.Paladin]: 10,
        [AdventurerClass.Rogue]: 6,
        [AdventurerClass.Ranger]: 8,
        [AdventurerClass.Mage]: 18,
        [AdventurerClass.Necromancer]: 16,
        [AdventurerClass.Cleric]: 14,
      },
      luck: {
        [AdventurerClass.Warrior]: 8,
        [AdventurerClass.Barbarian]: 6,
        [AdventurerClass.Paladin]: 10,
        [AdventurerClass.Rogue]: 14,
        [AdventurerClass.Ranger]: 12,
        [AdventurerClass.Mage]: 8,
        [AdventurerClass.Necromancer]: 10,
        [AdventurerClass.Cleric]: 12,
      },
    };

    const base = baseStats[stat][adventurerClass] || 10;
    return base + (level - 1) * 2;
  }

  private calculateGold(level: number): number {
    const base = 50 + level * 20;
    const variance = this.rng.range(0, 49);
    return base + variance;
  }

  private calculateBaseSurvival(level: number, difficulty: number): number {
    // Base survival is lower - potions should feel necessary
    // Level 1 at difficulty 1: 0.25 + 0.02 = 0.27 base
    // Level 10 at difficulty 1.5: (0.25 + 0.2) / 1.5 = 0.30
    // Without potions, adventurers should struggle
    const baseSurvival = 0.25 + level * 0.02;
    return Math.max(0.1, Math.min(0.55, baseSurvival / difficulty));
  }
}
