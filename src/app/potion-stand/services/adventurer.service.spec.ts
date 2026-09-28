import { TestBed } from '@angular/core/testing';
import { AdventurerService } from './adventurer.service';
import { GameRngService } from './game-rng.service';
import { AdventurerClass, AdventurerStatus } from '../models/adventurer.model';

describe('AdventurerService', () => {
  let service: AdventurerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AdventurerService, GameRngService],
    });
    // Initialize the RNG with a fixed seed for deterministic tests
    const rng = TestBed.inject(GameRngService);
    rng.initialize(42);
    service = TestBed.inject(AdventurerService);
  });

  describe('Service Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });
  });

  describe('generateAdventurer', () => {
    describe('Basic Generation', () => {
      it('should generate an adventurer with all required properties', () => {
        const adventurer = service.generateAdventurer(1, 1);

        expect(adventurer.id).toBeDefined();
        expect(adventurer.name).toBeDefined();
        expect(adventurer.class).toBeDefined();
        expect(adventurer.level).toBeDefined();
        expect(adventurer.maxHp).toBeDefined();
        expect(adventurer.currentHp).toBeDefined();
        expect(adventurer.gold).toBeDefined();
        expect(adventurer.strength).toBeDefined();
        expect(adventurer.defense).toBeDefined();
        expect(adventurer.magic).toBeDefined();
        expect(adventurer.luck).toBeDefined();
        expect(adventurer.status).toBeDefined();
        expect(adventurer.enterTime).toBeDefined();
        expect(adventurer.potionsConsumed).toBeDefined();
        expect(adventurer.survivalChance).toBeDefined();
      });

      it('should generate unique IDs for each adventurer', () => {
        const adventurer1 = service.generateAdventurer(1, 1);
        const adventurer2 = service.generateAdventurer(1, 1);

        expect(adventurer1.id).not.toBe(adventurer2.id);
      });

      it('should start adventurer with Shopping status', () => {
        const adventurer = service.generateAdventurer(1, 1);

        expect(adventurer.status).toBe(AdventurerStatus.Shopping);
      });

      it('should start adventurer with empty potionsConsumed array', () => {
        const adventurer = service.generateAdventurer(1, 1);

        expect(adventurer.potionsConsumed).toEqual([]);
      });

      it('should set enterTime to current time', () => {
        const before = Date.now();
        const adventurer = service.generateAdventurer(1, 1);
        const after = Date.now();

        expect(adventurer.enterTime).toBeGreaterThanOrEqual(before);
        expect(adventurer.enterTime).toBeLessThanOrEqual(after);
      });
    });

    describe('Name Generation', () => {
      it('should generate names with first and last name', () => {
        const adventurer = service.generateAdventurer(1, 1);

        expect(adventurer.name).toContain(' ');
        const [firstName, lastName] = adventurer.name.split(' ');
        expect(firstName.length).toBeGreaterThan(0);
        expect(lastName.length).toBeGreaterThan(0);
      });

      it('should generate variety of names', () => {
        const names = new Set<string>();

        for (let i = 0; i < 50; i++) {
          const adventurer = service.generateAdventurer(1, 1);
          names.add(adventurer.name);
        }

        // Should have more than 10 unique names (indicates randomness)
        expect(names.size).toBeGreaterThan(10);
      });
    });

    describe('Class Assignment', () => {
      it('should assign a valid AdventurerClass', () => {
        const validClasses = Object.values(AdventurerClass);
        const adventurer = service.generateAdventurer(1, 1);

        expect(validClasses).toContain(adventurer.class);
      });

      it('should generate variety of classes', () => {
        const classes = new Set<AdventurerClass>();

        for (let i = 0; i < 50; i++) {
          const adventurer = service.generateAdventurer(1, 1);
          classes.add(adventurer.class);
        }

        // Should have more than 3 unique classes (indicates randomness)
        expect(classes.size).toBeGreaterThan(3);
      });
    });

    describe('Level Scaling', () => {
      it('should generate higher level adventurers on later days', () => {
        // Generate many adventurers and check average levels
        const levelsDay1: number[] = [];
        const levelsDay30: number[] = [];

        for (let i = 0; i < 50; i++) {
          levelsDay1.push(service.generateAdventurer(1, 1).level);
          levelsDay30.push(service.generateAdventurer(30, 1).level);
        }

        const avgDay1 = levelsDay1.reduce((a, b) => a + b, 0) / levelsDay1.length;
        const avgDay30 = levelsDay30.reduce((a, b) => a + b, 0) / levelsDay30.length;

        expect(avgDay30).toBeGreaterThan(avgDay1);
      });

      it('should scale level with difficulty', () => {
        // Higher difficulty should result in higher level adventurers on average
        // Due to randomness, test with many samples
        let avgEasy = 0;
        let avgHard = 0;

        for (let i = 0; i < 50; i++) {
          avgEasy += service.generateAdventurer(10, 1).level;
          avgHard += service.generateAdventurer(10, 2).level;
        }

        avgEasy /= 50;
        avgHard /= 50;

        expect(avgHard).toBeGreaterThan(avgEasy);
      });

      it('should always generate at least level 1', () => {
        const adventurer = service.generateAdventurer(1, 0.1);

        expect(adventurer.level).toBeGreaterThanOrEqual(1);
      });
    });

    describe('HP Calculation', () => {
      it('should set currentHp equal to maxHp (full health)', () => {
        const adventurer = service.generateAdventurer(1, 1);

        expect(adventurer.currentHp).toBe(adventurer.maxHp);
      });

      it('should scale HP with level', () => {
        // Warriors have 120 base HP + 10 per level
        // Test that HP increases with level
        let hpLevel1 = 0;
        let hpLevel10 = 0;

        for (let i = 0; i < 20; i++) {
          hpLevel1 += service.generateAdventurer(1, 1).maxHp;
          hpLevel10 += service.generateAdventurer(30, 1).maxHp; // Higher day = higher level
        }

        expect(hpLevel10 / 20).toBeGreaterThan(hpLevel1 / 20);
      });

      it('should give Barbarians more HP than Mages (class-based HP)', () => {
        // Generate many of each and compare averages
        const barbarianHPs: number[] = [];
        const mageHPs: number[] = [];

        for (let i = 0; i < 100; i++) {
          const adv = service.generateAdventurer(5, 1);
          if (adv.class === AdventurerClass.Barbarian) {
            barbarianHPs.push(adv.maxHp);
          } else if (adv.class === AdventurerClass.Mage) {
            mageHPs.push(adv.maxHp);
          }
        }

        if (barbarianHPs.length > 0 && mageHPs.length > 0) {
          const avgBarbarian = barbarianHPs.reduce((a, b) => a + b, 0) / barbarianHPs.length;
          const avgMage = mageHPs.reduce((a, b) => a + b, 0) / mageHPs.length;

          expect(avgBarbarian).toBeGreaterThan(avgMage);
        }
      });
    });

    describe('Gold Calculation', () => {
      it('should give adventurers gold based on level', () => {
        const adventurer = service.generateAdventurer(1, 1);

        expect(adventurer.gold).toBeGreaterThan(0);
      });

      it('should give higher level adventurers more gold on average', () => {
        let goldDay1 = 0;
        let goldDay30 = 0;

        for (let i = 0; i < 50; i++) {
          goldDay1 += service.generateAdventurer(1, 1).gold;
          goldDay30 += service.generateAdventurer(30, 1).gold;
        }

        expect(goldDay30 / 50).toBeGreaterThan(goldDay1 / 50);
      });

      it('should include variance in gold (not exactly level-based)', () => {
        // With variance, adventurers might have different gold
        // Test across many to ensure variance exists
        const golds = new Set<number>();
        for (let i = 0; i < 20; i++) {
          golds.add(service.generateAdventurer(1, 1).gold);
        }

        expect(golds.size).toBeGreaterThan(1);
      });
    });

    describe('Survival Chance Calculation', () => {
      it('should calculate survival chance based on level and difficulty', () => {
        const adventurer = service.generateAdventurer(1, 1);

        expect(adventurer.survivalChance).toBeGreaterThan(0);
        expect(adventurer.survivalChance).toBeLessThanOrEqual(1);
      });

      it('should give higher survival chance to higher level adventurers', () => {
        let survivalDay1 = 0;
        let survivalDay30 = 0;

        for (let i = 0; i < 50; i++) {
          survivalDay1 += service.generateAdventurer(1, 1).survivalChance;
          survivalDay30 += service.generateAdventurer(30, 1).survivalChance;
        }

        expect(survivalDay30 / 50).toBeGreaterThan(survivalDay1 / 50);
      });

      it('should reduce survival chance with higher difficulty', () => {
        let survivalEasy = 0;
        let survivalHard = 0;

        for (let i = 0; i < 50; i++) {
          survivalEasy += service.generateAdventurer(10, 1).survivalChance;
          survivalHard += service.generateAdventurer(10, 2).survivalChance;
        }

        expect(survivalEasy / 50).toBeGreaterThan(survivalHard / 50);
      });

      it('should cap survival chance at 0.55 maximum (without potions)', () => {
        // Even at very high levels, base survival should not exceed 0.55
        const adventurer = service.generateAdventurer(100, 1);

        expect(adventurer.survivalChance).toBeLessThanOrEqual(0.55);
      });

      it('should floor survival chance at 0.10 minimum', () => {
        // Even at very low levels with high difficulty
        const adventurer = service.generateAdventurer(1, 10);

        expect(adventurer.survivalChance).toBeGreaterThanOrEqual(0.1);
      });
    });

    describe('Personality Traits', () => {
      it('should randomly assign frugal trait', () => {
        let frugals = 0;
        const samples = 100;

        for (let i = 0; i < samples; i++) {
          if (service.generateAdventurer(1, 1).frugal) {
            frugals++;
          }
        }

        // Should be around 20% (with variance allowed)
        expect(frugals).toBeGreaterThan(5);
        expect(frugals).toBeLessThan(40);
      });

      it('should randomly assign trusting trait', () => {
        let trusting = 0;
        const samples = 100;

        for (let i = 0; i < samples; i++) {
          if (service.generateAdventurer(1, 1).trusting) {
            trusting++;
          }
        }

        // Should be around 30% (with variance allowed)
        expect(trusting).toBeGreaterThan(10);
        expect(trusting).toBeLessThan(50);
      });

      it('should randomly assign experienced trait', () => {
        let experienced = 0;
        const samples = 100;

        for (let i = 0; i < samples; i++) {
          if (service.generateAdventurer(1, 1).experienced) {
            experienced++;
          }
        }

        // Should be around 15% (with variance allowed)
        expect(experienced).toBeGreaterThan(3);
        expect(experienced).toBeLessThan(35);
      });

      it('should randomly assign desperate trait', () => {
        let desperate = 0;
        const samples = 100;

        for (let i = 0; i < samples; i++) {
          if (service.generateAdventurer(1, 1).desperate) {
            desperate++;
          }
        }

        // Should be around 25% (with variance allowed)
        expect(desperate).toBeGreaterThan(10);
        expect(desperate).toBeLessThan(45);
      });
    });

    describe('Stat Calculation', () => {
      it('should generate stats based on class', () => {
        // Warriors should have higher strength than mages
        const warriors: number[] = [];
        const mages: number[] = [];

        for (let i = 0; i < 100; i++) {
          const adv = service.generateAdventurer(5, 1);
          if (adv.class === AdventurerClass.Warrior) {
            warriors.push(adv.strength);
          } else if (adv.class === AdventurerClass.Mage) {
            mages.push(adv.strength);
          }
        }

        if (warriors.length > 0 && mages.length > 0) {
          const avgWarrior = warriors.reduce((a, b) => a + b, 0) / warriors.length;
          const avgMage = mages.reduce((a, b) => a + b, 0) / mages.length;

          expect(avgWarrior).toBeGreaterThan(avgMage);
        }
      });

      it('should scale stats with level', () => {
        // Higher level should have higher stats
        let statsDay1 = 0;
        let statsDay30 = 0;

        for (let i = 0; i < 50; i++) {
          const adv1 = service.generateAdventurer(1, 1);
          const adv30 = service.generateAdventurer(30, 1);

          statsDay1 += adv1.strength + adv1.defense + adv1.magic + adv1.luck;
          statsDay30 += adv30.strength + adv30.defense + adv30.magic + adv30.luck;
        }

        expect(statsDay30 / 50).toBeGreaterThan(statsDay1 / 50);
      });
    });
  });

  describe('generateOpeningAdventurer', () => {
    it('creates a stable first customer with enough gold for several honest two-potion loadouts', () => {
      const adventurer = service.generateOpeningAdventurer();

      expect(adventurer.name).toBe('Mara Flint');
      expect(adventurer.class).toBe(AdventurerClass.Warrior);
      expect(adventurer.gold).toBe(190);
      expect(adventurer.survivalChance).toBeLessThan(0.3);
      expect(adventurer.potionsConsumed).toEqual([]);
      expect(adventurer.speechBubble).toContain('Help me come back alive');
    });

    it('still gives opening customers unique ids', () => {
      expect(service.generateOpeningAdventurer().id).not.toBe(service.generateOpeningAdventurer().id);
    });
  });
});
