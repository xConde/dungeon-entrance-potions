import { Adventurer, AdventurerClass, AdventurerStatus } from '../models/adventurer.model';
import { Potion } from '../models/potion.model';
import { calculatePotionPrice } from './potion-pricing';

const potion: Potion = {
  id: 'basic-healing',
  name: 'Basic Healing Potion',
  description: '',
  basePrice: 50,
  color: '#f00',
  particleColor: '#f88',
  viscosity: 'normal',
  recipe: { ingredients: [], requiredLevel: 1, craftingTime: 0, difficulty: 'easy' },
  quality: 0.8,
  isDiluted: false,
  effects: { healing: 50 },
  discovered: true,
  timesCrafted: 0,
  deathsCaused: 0,
  livesSaved: 0,
  customerRating: 4,
};

const adventurer: Adventurer = {
  id: 'pricing-customer',
  name: 'Mara Flint',
  class: AdventurerClass.Warrior,
  level: 1,
  maxHp: 120,
  currentHp: 120,
  gold: 200,
  strength: 15,
  defense: 14,
  magic: 5,
  luck: 8,
  potionsConsumed: [],
  survivalChance: 0.27,
  status: AdventurerStatus.Shopping,
  enterTime: 0,
  frugal: false,
  trusting: false,
  experienced: false,
  desperate: false,
};

describe('calculatePotionPrice', () => {
  it('makes the quote a real three-way economic choice', () => {
    expect(calculatePotionPrice(potion, adventurer, 50, 'mercy')).toBe(50);
    expect(calculatePotionPrice(potion, adventurer, 50, 'fair')).toBe(62);
    expect(calculatePotionPrice(potion, adventurer, 50, 'gouge')).toBe(78);
  });

  it('applies customer traits before the player quote', () => {
    const desperateAndFrugal = { ...adventurer, desperate: true, frugal: true };

    expect(calculatePotionPrice(potion, desperateAndFrugal, 50, 'fair')).toBe(75);
    expect(calculatePotionPrice(potion, desperateAndFrugal, 50, 'mercy')).toBe(60);
    expect(calculatePotionPrice(potion, desperateAndFrugal, 50, 'gouge')).toBe(93);
  });
});
