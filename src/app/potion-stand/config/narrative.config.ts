/**
 * Narrative text templates for variety in game messages.
 * All templates selected via GameRngService for determinism.
 */

/** Death messages per encounter type (expanded from ~3 to ~8 each) */
export const DEATH_MESSAGES: Readonly<Record<string, readonly string[]>> = {
  normal: [
    'was overwhelmed by enemies',
    'fell to the dungeon denizens',
    'could not withstand the assault',
    'was cut down by a pack of goblins',
    'bled out from countless wounds',
    'was dragged into the darkness',
    'fought bravely but fell',
    'was no match for the horde',
  ],
  trap: [
    'was impaled by hidden spikes',
    'suffocated in poison gas',
    'was crushed by a falling ceiling',
    'triggered a flame trap',
    'fell into a bottomless pit',
    'was caught in a snare of thorns',
    'stepped on a pressure plate and...',
    'never saw the dart coming',
  ],
  ambush: [
    'never saw the attack coming',
    'was caught off guard in the darkness',
    'was surrounded with no escape',
    'walked right into the ambush',
    'was blindsided by shadow stalkers',
    'heard nothing until it was too late',
    'was swarmed from all sides',
    'the darkness swallowed them whole',
  ],
  elite: [
    'was struck down by a powerful foe',
    "could not match the guardian's might",
    'was obliterated by raw power',
    'met a foe beyond their skill',
    'was outmatched in every way',
    'fell to a single devastating blow',
    'underestimated the elite guardian',
    'crumbled under relentless assault',
  ],
  treasure: [
    'got greedy and triggered a curse',
    'the treasure was a deadly trap all along',
    'reached for gold and found death',
    'disturbed the treasure guardian',
    'the chest was a mimic',
    'greed led to their downfall',
  ],
  boss: [
    'was annihilated by the dungeon boss',
    'fell before the final guardian',
    'the boss was too powerful',
    'challenged the lair master and lost',
    'was crushed by overwhelming might',
    'the boss showed no mercy',
  ],
  cursed: [
    'was consumed by dark energy',
    'the curse drained their life force',
    "fell to the corrupted shrine's power",
    'dark magic unraveled their being',
    'the corruption consumed everything',
    'withered under the cursed altar',
  ],
} as const;

/** Combat event descriptions for dungeon activity log */
export const COMBAT_DESCRIPTIONS: readonly string[] = [
  'Steel clashes against stone',
  'Sparks fly in the darkness',
  'The dungeon echoes with battle cries',
  'Shadows dance on the walls',
  'Potion effects shimmer and fade',
  'The fight rages deeper underground',
  'A desperate struggle unfolds',
  'Blades meet in the torchlight',
  'Magic crackles through the air',
  'The floor trembles from the battle',
  'Dust and debris fill the corridor',
  "A warrior's cry pierces the dark",
  'The clash of steel rings out',
  'Footsteps echo between strikes',
  'The battle takes its toll',
  'A moment of desperate defense',
  'Potion energy surges through veins',
  'The fight pushes ever deeper',
  'Combat fury fills the chamber',
  'The dungeon claims another round',
] as const;

/** Customer dialogue lines per class */
export const CUSTOMER_DIALOGUE: Readonly<Record<string, readonly string[]>> = {
  Warrior: [
    'I need something for the battle ahead',
    'Strength for the fight below',
    'My sword arm grows tired...',
    'One more run. Give me your best.',
    'The deeper floors call to me',
  ],
  Rogue: [
    'Speed is everything down there',
    'I need an edge for the shadows',
    'Quick reflexes save lives',
    'Got anything for a quick getaway?',
    'The traps are getting nastier',
  ],
  Mage: [
    'Fortune favors the prepared',
    'My spells need enhancement',
    'The arcane demands focus',
    "Knowledge alone won't save me",
    'I sense danger in the deep',
  ],
  Cleric: [
    'Protection for the faithful',
    'Healing is my first priority',
    'The dungeon tests all faith',
    'My prayers need potions too',
    'Light guide me through the dark',
  ],
  Ranger: [
    'I hunt the deeper floors now',
    'Agility is survival',
    'Nature provides, but I need more',
    'The beasts grow fiercer below',
    'My arrows need magical aid',
  ],
  Barbarian: [
    'GIVE ME STRENGTH!',
    'Pain is temporary, glory is forever',
    'I fear nothing below',
    'Just point me at the monsters',
    'No potion can match my rage!',
  ],
  Paladin: [
    'Shield me from the darkness',
    'My oath demands I survive',
    'Protection, please',
    'For honor and duty',
    'The righteous shall not fall',
  ],
  Necromancer: [
    'The dead whisper of danger...',
    'Luck bends to my will',
    'Fortune or folly awaits',
    'Even the undead need potions',
    'Death is merely a transition',
  ],
} as const;

/** Fear dialogue when death streak >= 3 */
export const FEAR_DIALOGUE: readonly string[] = [
  'I... I heard someone died in there...',
  'Are your potions safe?',
  'Maybe I should come back later...',
  'The screams from below worry me...',
  'Is it true about the deaths?',
  'My friend never came back...',
  'The guild warned me about this shop',
  'I hope your potions actually work',
] as const;

/** Floor-specific dungeon atmosphere texts */
export const DUNGEON_ATMOSPHERE: Readonly<Record<number, readonly string[]>> = {
  1: ['Cobwebs line the entrance', 'A faint draft from below'],
  2: ['Torches flicker dimly', 'Rats scatter from the light'],
  3: ['The air grows colder', 'Ancient carvings on the walls'],
  4: ['Mushrooms glow faintly', 'Water drips from the ceiling'],
  5: ['A boss lurks on this floor', 'The walls hum with power'],
  6: ['Deeper than most dare go', 'Bones crunch underfoot'],
  7: ['Shadows move on their own', 'The darkness presses closer'],
  8: ['The smell of sulfur rises', 'Screams echo from below'],
  9: ['Even torches struggle here', 'The walls weep black ichor'],
  10: ['The final guardian awaits', 'The dungeon trembles'],
  11: ['Cursed energy crackles', 'The air tastes of copper'],
  12: ['Dark shrines line the halls', 'Reality bends at the edges'],
  13: ['The ground shifts beneath feet', 'Whispers from the void'],
  14: ['Time itself feels wrong here', 'The deepest darkness beckons'],
  15: ["The Alchemist's domain", 'Potion fumes fill the air'],
} as const;

/** Good and bad review templates (expanded) */
export const REVIEW_TEMPLATES = {
  good: [
    'Potions saved my life! Will return!',
    'A bit pricey but worth it',
    'The healing potion actually worked!',
    'Survived thanks to your shop',
    'Better than the last alchemist',
    'Five stars, would quest again!',
    'My party thanks you',
    'Reliable potions, fair prices',
    'I owe you my life',
    'Excellent quality, will recommend',
  ],
  bad: [
    'SCAMMER! POTIONS DO NOT WORK!',
    'My brother died because of your healing potion',
    'Diluted garbage, avoid this shop',
    'Should be shut down',
    'Murder shop',
    'Worst potions in the kingdom',
    'The guild will hear about this',
    "I want a refund for my friend's life",
    'Watered-down trash',
    'My gear was worth more than your potions',
  ],
} as const;
