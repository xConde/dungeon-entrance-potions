import { CUSTOMER_DIALOGUE, DEATH_MESSAGES, FEAR_DIALOGUE, REVIEW_TEMPLATES } from './narrative.config';

describe('narrative.config', () => {
  describe('DEATH_MESSAGES', () => {
    const ENCOUNTER_TYPES = ['normal', 'trap', 'ambush', 'elite', 'treasure', 'boss', 'cursed'] as const;

    it('has entries for all 7 encounter types', () => {
      for (const type of ENCOUNTER_TYPES) {
        expect(DEATH_MESSAGES[type]).toBeDefined(`missing encounter type: ${type}`);
        expect(DEATH_MESSAGES[type].length).toBeGreaterThan(0, `empty array for encounter type: ${type}`);
      }
    });

    it('has at least 6 entries per encounter type', () => {
      for (const type of ENCOUNTER_TYPES) {
        expect(DEATH_MESSAGES[type].length).toBeGreaterThanOrEqual(6, `${type} has fewer than 6 death messages`);
      }
    });
  });

  describe('CUSTOMER_DIALOGUE', () => {
    const CLASSES = ['Warrior', 'Rogue', 'Mage', 'Cleric', 'Ranger', 'Barbarian', 'Paladin', 'Necromancer'] as const;

    it('has entries for all 8 classes', () => {
      for (const cls of CLASSES) {
        expect(CUSTOMER_DIALOGUE[cls]).toBeDefined(`missing class: ${cls}`);
        expect(CUSTOMER_DIALOGUE[cls].length).toBeGreaterThan(0, `empty array for class: ${cls}`);
      }
    });

    it('has at least 5 lines per class', () => {
      for (const cls of CLASSES) {
        expect(CUSTOMER_DIALOGUE[cls].length).toBeGreaterThanOrEqual(5, `${cls} has fewer than 5 dialogue lines`);
      }
    });
  });

  describe('REVIEW_TEMPLATES', () => {
    it('good reviews has 10+ entries', () => {
      expect(REVIEW_TEMPLATES.good.length).toBeGreaterThanOrEqual(10);
    });

    it('bad reviews has 10+ entries', () => {
      expect(REVIEW_TEMPLATES.bad.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('FEAR_DIALOGUE', () => {
    it('has 5+ entries', () => {
      expect(FEAR_DIALOGUE.length).toBeGreaterThanOrEqual(5);
    });
  });
});
