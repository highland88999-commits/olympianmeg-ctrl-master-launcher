// OLYMPIAN MONSTERVERSE — monster-first families (pure data).
//
// THE INVERSION (Merlin, 2026-10-25): the world is built AROUND
// the monsters, not the monsters around the world. Every one of
// the 38 unique monster slots from the Monster Graphics artifact
// gets a home here: a family entry keyed by SLOT carrying its
// element, attitude, size class, habitat (the terrain band it
// lives in), stats, and attack archetype. The 7 old biome bands
// are reshaped into habitat bands driven by this roster — the
// blend math in biomes.js is untouched, only the anchors and the
// roster change.
//
// SLOT KEY: `slot-NN` (two digits). Slot 4 is the intro banner,
// NOT a monster, and slots 15/31/41/42 are exact duplicates of
// slots 1/30/11/40 — so the 38 unique monsters are slots
// 1, 2, 3, 5–14, 16–30, 32–40, 43. Slot 13 is Korus, the ultimate
// boss: he is NOT a family — his seat is the throne (spawns.js
// KORUS_POS/KORUS_MAX_HP), and slotHome(13) says 'boss' so no
// coverage check can ever drop him.
//
// GROUNDING (never guessed): element and attitude were read off
// the slot reference images against Merlin's own key — green
// ooze = acid, red = fire, yellow = lightning, purple = poison,
// grey = shadow smoke, sand = sand — plus the artifact note
// (slot 13 = Korus, ultimate boss). One slot falls outside the
// old six elements: slot 10 is an ice yeti on an iceberg, so the
// roster gains a seventh element, frost, and the Frozen Reaches
// habitat band to hold it. Attitudes read from pose: stalk =
// upright, looming, advancing on foot; charge = lunging, running
// or rushing forward; ambush = lurking, rising, or waiting in a
// pool/vortex/cloud until the hunter closes in.
//
// NAMES are game-content epithets for the HUD tracking sense —
// they are NOT Tripo library names and assign no model to any
// slot. The model mapping lives separately in spawns.js
// MONSTER_MODELS (slot → public path, swappable) and stays
// procedural-stand-in until rigged GLBs land.

export const ALL_MONSTER_SLOTS = [
  1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33, 34, 35, 36, 37,
  38, 39, 40, 43,
];

export const BOSS_SLOT = 13;

export function slotKey(slot) {
  return `slot-${String(slot).padStart(2, '0')}`;
}

/* 37 regular families. Stats honour Merlin's band: every regular
 * monster sits between 100 and 200 HP — brutes near 200,
 * skirmishers near 100. form: 'beast' (the quadruped stand-in)
 * or 'vortex' (a swirling funnel stand-in — the sand, smoke and
 * ooze funnels are vortices, not quadrupeds). */
export const MONSTER_FAMILIES = {
  // ---- ACID: the Ooze Pools ----
  'slot-01': { slot: 1, name: 'Ooze Revenant', element: 'acid', attitude: 'stalk', archetype: 'ranged', habitat: 'acid', form: 'beast', sizeClass: 'hunter', hp: 120, dmg: 12, speed: 3.6, scaleM: 2.6, footprintR: 1.6, temperament: { scary: 0.9, vicious: 0.7, fast: 0.4 }, blurb: 'A skeletal figure wreathed in green ooze-light, watching from the flats.' },
  'slot-21': { slot: 21, name: 'Ooze Wight', element: 'acid', attitude: 'stalk', archetype: 'ranged', habitat: 'acid', form: 'beast', sizeClass: 'hunter', hp: 120, dmg: 12, speed: 3.6, scaleM: 2.6, footprintR: 1.6, temperament: { scary: 0.9, vicious: 0.7, fast: 0.4 }, blurb: 'A second skeletal watcher, green-lit, tall over the pools.' },
  'slot-27': { slot: 27, name: 'Verdant Core Golem', element: 'acid', attitude: 'charge', archetype: 'melee', habitat: 'acid', form: 'beast', sizeClass: 'brute', hp: 190, dmg: 16, speed: 3.0, scaleM: 3.0, footprintR: 2.0, temperament: { scary: 0.8, vicious: 0.9, fast: 0.3 }, blurb: 'Armoured rock with a green core burning through its cracks.' },
  'slot-29': { slot: 29, name: 'Vortex Maw', element: 'acid', attitude: 'ambush', archetype: 'environmental', habitat: 'acid', form: 'vortex', sizeClass: 'brute', hp: 180, dmg: 15, speed: 2.8, scaleM: 3.2, footprintR: 2.2, temperament: { scary: 0.9, vicious: 0.8, fast: 0.3 }, blurb: 'A great reptile head rising out of a green whirlpool — the pool itself is the trap.' },
  'slot-33': { slot: 33, name: 'Hydra Vortex', element: 'acid', attitude: 'ambush', archetype: 'environmental', habitat: 'acid', form: 'vortex', sizeClass: 'brute', hp: 170, dmg: 14, speed: 3.0, scaleM: 3.0, footprintR: 2.0, temperament: { scary: 0.8, vicious: 0.8, fast: 0.4 }, blurb: 'Many serpent heads over one churning green funnel.' },
  'slot-37': { slot: 37, name: 'Blight Bulk', element: 'acid', attitude: 'ambush', archetype: 'melee', habitat: 'acid', form: 'beast', sizeClass: 'brute', hp: 170, dmg: 14, speed: 2.8, scaleM: 2.8, footprintR: 1.9, temperament: { scary: 0.9, vicious: 0.7, fast: 0.2 }, blurb: 'A green pustuled bulk drooling in the dark — it waits, then bites.' },
  // ---- FIRE: the Volcanic Fields ----
  'slot-02': { slot: 2, name: 'Lava Hulk', element: 'fire', attitude: 'charge', archetype: 'melee', habitat: 'fire', form: 'beast', sizeClass: 'brute', hp: 180, dmg: 15, speed: 4.0, scaleM: 3.0, footprintR: 2.0, temperament: { scary: 0.8, vicious: 0.9, fast: 0.6 }, blurb: 'A hulking demon on cracked lava ground, pack at its back.' },
  'slot-03': { slot: 3, name: 'Ridge Tyrant', element: 'fire', attitude: 'stalk', archetype: 'short-range', habitat: 'fire', form: 'beast', sizeClass: 'brute', hp: 170, dmg: 14, speed: 3.8, scaleM: 2.8, footprintR: 1.9, temperament: { scary: 0.9, vicious: 0.8, fast: 0.5 }, blurb: 'A core-lit tyrant standing the lava ridge, pack below.' },
  'slot-06': { slot: 6, name: 'Spike Tyrant', element: 'fire', attitude: 'charge', archetype: 'melee', habitat: 'fire', form: 'beast', sizeClass: 'brute', hp: 190, dmg: 16, speed: 4.2, scaleM: 3.0, footprintR: 2.0, temperament: { scary: 0.9, vicious: 0.9, fast: 0.6 }, blurb: 'Spiked, lava-cracked, crouched forward — a battering ram with claws.' },
  'slot-07': { slot: 7, name: 'Crowned Ember King', element: 'fire', attitude: 'stalk', archetype: 'ranged', habitat: 'fire', form: 'beast', sizeClass: 'brute', hp: 190, dmg: 16, speed: 3.6, scaleM: 3.2, footprintR: 2.1, temperament: { scary: 1.0, vicious: 0.9, fast: 0.4 }, blurb: 'A crowned leader over the lava flow, throwing fire from range.' },
  'slot-08': { slot: 8, name: 'Scald Lurker', element: 'fire', attitude: 'charge', archetype: 'short-range', habitat: 'fire', form: 'beast', sizeClass: 'hunter', hp: 130, dmg: 13, speed: 4.6, scaleM: 2.2, footprintR: 1.5, temperament: { scary: 0.7, vicious: 0.9, fast: 0.8 }, blurb: 'Flame-wreathed and lunging through the shallows.' },
  'slot-09': { slot: 9, name: 'Sea-Scorch Leviathan', element: 'fire', attitude: 'ambush', archetype: 'environmental', habitat: 'fire', form: 'beast', sizeClass: 'brute', hp: 200, dmg: 17, speed: 3.0, scaleM: 3.4, footprintR: 2.3, temperament: { scary: 1.0, vicious: 0.8, fast: 0.3 }, blurb: 'A horned giant rising out of the night sea — the scalding eruption is the attack.' },
  'slot-14': { slot: 14, name: 'Volcano Brute', element: 'fire', attitude: 'charge', archetype: 'melee', habitat: 'fire', form: 'beast', sizeClass: 'brute', hp: 200, dmg: 17, speed: 3.8, scaleM: 3.2, footprintR: 2.1, temperament: { scary: 0.9, vicious: 0.9, fast: 0.5 }, blurb: 'Knuckles down before the volcano, all forward momentum.' },
  'slot-18': { slot: 18, name: 'Ember Pack Brute', element: 'fire', attitude: 'charge', archetype: 'melee', habitat: 'fire', form: 'beast', sizeClass: 'hunter', hp: 160, dmg: 14, speed: 4.2, scaleM: 2.6, footprintR: 1.8, temperament: { scary: 0.8, vicious: 0.9, fast: 0.7 }, blurb: 'One of the lava pack, core-lit, advancing shoulder to shoulder.' },
  'slot-22': { slot: 22, name: 'Molten Sentinel', element: 'fire', attitude: 'stalk', archetype: 'ranged', habitat: 'fire', form: 'beast', sizeClass: 'hunter', hp: 140, dmg: 13, speed: 3.6, scaleM: 2.6, footprintR: 1.7, temperament: { scary: 0.9, vicious: 0.7, fast: 0.4 }, blurb: 'Tall, dark, molten core dripping fire from its hands.' },
  'slot-25': { slot: 25, name: 'Flameback Runner', element: 'fire', attitude: 'charge', archetype: 'short-range', habitat: 'fire', form: 'beast', sizeClass: 'hunter', hp: 120, dmg: 12, speed: 5.2, scaleM: 2.0, footprintR: 1.4, temperament: { scary: 0.6, vicious: 0.9, fast: 0.9 }, blurb: 'A flame-backed quadruped pack, running the rocks down.' },
  'slot-30': { slot: 30, name: 'Horned Ember Pack', element: 'fire', attitude: 'stalk', archetype: 'ranged', habitat: 'fire', form: 'beast', sizeClass: 'hunter', hp: 150, dmg: 13, speed: 4.0, scaleM: 2.4, footprintR: 1.6, temperament: { scary: 0.8, vicious: 0.8, fast: 0.6 }, blurb: 'Horned, core-lit, advancing down the dark valley in number.' },
  'slot-32': { slot: 32, name: 'Cinder Swarm', element: 'fire', attitude: 'charge', archetype: 'short-range', habitat: 'fire', form: 'beast', sizeClass: 'skirmisher', hp: 110, dmg: 11, speed: 5.6, scaleM: 1.8, footprintR: 1.2, temperament: { scary: 0.6, vicious: 0.9, fast: 1.0 }, blurb: 'Small, spiky, fast — the pack that outruns you to the volcano.' },
  'slot-34': { slot: 34, name: 'Flameback Charger', element: 'fire', attitude: 'charge', archetype: 'short-range', habitat: 'fire', form: 'beast', sizeClass: 'hunter', hp: 120, dmg: 12, speed: 5.4, scaleM: 2.0, footprintR: 1.4, temperament: { scary: 0.7, vicious: 0.9, fast: 0.9 }, blurb: 'Flame-backed, slope-running, always in motion.' },
  // ---- LIGHTNING: the Storm Plains and Storm Peaks ----
  'slot-16': { slot: 16, name: 'Storm Herald', element: 'lightning', attitude: 'stalk', archetype: 'ranged', habitat: 'lightning', form: 'beast', sizeClass: 'hunter', hp: 140, dmg: 13, speed: 4.6, scaleM: 2.4, footprintR: 1.6, temperament: { scary: 0.8, vicious: 0.7, fast: 0.8 }, blurb: 'A pale herald with a lightning chest, pack behind on the cracked plains.' },
  'slot-17': { slot: 17, name: 'Storm-Cloud Fiend', element: 'lightning', attitude: 'ambush', archetype: 'environmental', habitat: 'mountain', form: 'beast', sizeClass: 'brute', hp: 170, dmg: 15, speed: 4.8, scaleM: 3.0, footprintR: 2.0, temperament: { scary: 0.9, vicious: 0.8, fast: 0.7 }, blurb: 'A winged storm-head lurking in the clouds — the strike comes from above.' },
  'slot-19': { slot: 19, name: 'Volt Pack Leader', element: 'lightning', attitude: 'stalk', archetype: 'ranged', habitat: 'lightning', form: 'beast', sizeClass: 'hunter', hp: 130, dmg: 12, speed: 4.8, scaleM: 2.2, footprintR: 1.5, temperament: { scary: 0.7, vicious: 0.8, fast: 0.9 }, blurb: 'Cyan-glowing leader of the volt pack, throwing bolts from range.' },
  'slot-20': { slot: 20, name: 'Golden Storm Beast', element: 'lightning', attitude: 'charge', archetype: 'short-range', habitat: 'lightning', form: 'beast', sizeClass: 'hunter', hp: 120, dmg: 13, speed: 5.4, scaleM: 2.0, footprintR: 1.4, temperament: { scary: 0.8, vicious: 0.9, fast: 1.0 }, blurb: 'Golden, hunched, claws out, lightning at its back.' },
  'slot-39': { slot: 39, name: 'Storm Roarer', element: 'lightning', attitude: 'charge', archetype: 'melee', habitat: 'mountain', form: 'beast', sizeClass: 'brute', hp: 180, dmg: 16, speed: 5.0, scaleM: 3.0, footprintR: 2.0, temperament: { scary: 0.9, vicious: 1.0, fast: 0.8 }, blurb: 'Roaring gold under the storm sky, pack behind, heights its own.' },
  // ---- POISON: the Poison Groves ----
  'slot-36': { slot: 36, name: 'Pustule Bloater', element: 'poison', attitude: 'ambush', archetype: 'environmental', habitat: 'poison', form: 'beast', sizeClass: 'brute', hp: 170, dmg: 14, speed: 2.8, scaleM: 2.8, footprintR: 1.9, temperament: { scary: 0.9, vicious: 0.6, fast: 0.2 }, blurb: 'A violet pustuled bulk grinning in the cave — its cloud is the weapon.' },
  'slot-38': { slot: 38, name: 'Violet Hollow Pack', element: 'poison', attitude: 'stalk', archetype: 'ranged', habitat: 'poison', form: 'beast', sizeClass: 'hunter', hp: 130, dmg: 12, speed: 3.8, scaleM: 2.2, footprintR: 1.5, temperament: { scary: 0.8, vicious: 0.7, fast: 0.5 }, blurb: 'Gaunt violet-robed figures advancing out of the dark hollow.' },
  'slot-40': { slot: 40, name: 'Violet Hulk', element: 'poison', attitude: 'charge', archetype: 'melee', habitat: 'poison', form: 'beast', sizeClass: 'brute', hp: 190, dmg: 16, speed: 3.8, scaleM: 3.2, footprintR: 2.1, temperament: { scary: 0.9, vicious: 0.9, fast: 0.5 }, blurb: 'A violet hulk with ember pustules, knuckles forward, pack at its back.' },
  // ---- SHADOW: the Smoke Wastes ----
  'slot-11': { slot: 11, name: 'Smoke Stalker', element: 'shadow', attitude: 'stalk', archetype: 'short-range', habitat: 'shadow', form: 'beast', sizeClass: 'hunter', hp: 130, dmg: 13, speed: 4.4, scaleM: 2.6, footprintR: 1.6, temperament: { scary: 1.0, vicious: 0.7, fast: 0.7 }, blurb: 'Tall gaunt smoke figures creeping out of the gloom.' },
  'slot-12': { slot: 12, name: 'Grinning Funnel', element: 'shadow', attitude: 'charge', archetype: 'short-range', habitat: 'shadow', form: 'vortex', sizeClass: 'hunter', hp: 140, dmg: 14, speed: 5.2, scaleM: 2.4, footprintR: 1.6, temperament: { scary: 0.9, vicious: 0.9, fast: 0.9 }, blurb: 'A dark tornado with a grinning face — it rushes, grinning.' },
  'slot-26': { slot: 26, name: 'Skull Smoke Walker', element: 'shadow', attitude: 'stalk', archetype: 'ranged', habitat: 'shadow', form: 'beast', sizeClass: 'hunter', hp: 130, dmg: 12, speed: 4.0, scaleM: 2.6, footprintR: 1.6, temperament: { scary: 1.0, vicious: 0.6, fast: 0.5 }, blurb: 'Skull-faced smoke walkers advancing slow out of the dark.' },
  'slot-35': { slot: 35, name: 'Funnel Row', element: 'shadow', attitude: 'ambush', archetype: 'environmental', habitat: 'shadow', form: 'vortex', sizeClass: 'brute', hp: 170, dmg: 14, speed: 3.0, scaleM: 3.0, footprintR: 2.0, temperament: { scary: 0.9, vicious: 0.7, fast: 0.3 }, blurb: 'Dark funnels standing in a row on cracked ground — they wait for the road.' },
  'slot-43': { slot: 43, name: 'Road Colossus', element: 'shadow', attitude: 'stalk', archetype: 'melee', habitat: 'shadow', form: 'beast', sizeClass: 'colossal', hp: 200, dmg: 18, speed: 3.4, scaleM: 4.2, footprintR: 2.6, temperament: { scary: 1.0, vicious: 0.8, fast: 0.3 }, blurb: 'A smoke giant looming over a lone traveller on the road — the biggest thing in the wastes bar Korus.' },
  // ---- SAND: the Desert Expanse ----
  'slot-05': { slot: 5, name: 'Sand Vortex', element: 'sand', attitude: 'charge', archetype: 'short-range', habitat: 'sand', form: 'vortex', sizeClass: 'brute', hp: 160, dmg: 14, speed: 5.0, scaleM: 3.0, footprintR: 2.0, temperament: { scary: 0.8, vicious: 0.8, fast: 1.0 }, blurb: 'A towering sand funnel with claws, sweeping the dunes.' },
  'slot-23': { slot: 23, name: 'Sand Maw Vortex', element: 'sand', attitude: 'charge', archetype: 'melee', habitat: 'sand', form: 'vortex', sizeClass: 'hunter', hp: 150, dmg: 14, speed: 5.2, scaleM: 2.6, footprintR: 1.8, temperament: { scary: 0.8, vicious: 0.9, fast: 0.9 }, blurb: 'A spiky-headed sand funnel, maw first, at sunset.' },
  'slot-24': { slot: 24, name: 'Sandstorm Hulk', element: 'sand', attitude: 'charge', archetype: 'melee', habitat: 'sand', form: 'beast', sizeClass: 'brute', hp: 190, dmg: 16, speed: 4.4, scaleM: 3.2, footprintR: 2.1, temperament: { scary: 0.9, vicious: 0.9, fast: 0.7 }, blurb: 'A hulk advancing through its own sandstorm, arms wide.' },
  'slot-28': { slot: 28, name: 'Sand Vortex Pack', element: 'sand', attitude: 'charge', archetype: 'short-range', habitat: 'sand', form: 'vortex', sizeClass: 'brute', hp: 160, dmg: 14, speed: 5.0, scaleM: 3.0, footprintR: 2.0, temperament: { scary: 0.8, vicious: 0.8, fast: 1.0 }, blurb: 'Funnel pack sweeping the dunes together.' },
  // ---- FROST: the Frozen Reaches (the roster's seventh element) ----
  'slot-10': { slot: 10, name: 'Ice Yeti', element: 'frost', attitude: 'stalk', archetype: 'short-range', habitat: 'frost', form: 'beast', sizeClass: 'brute', hp: 180, dmg: 15, speed: 3.6, scaleM: 2.8, footprintR: 1.9, temperament: { scary: 0.8, vicious: 0.7, fast: 0.4 }, blurb: 'A pale ice yeti standing its iceberg — the only frost family, and its band is its own.' },
};

export const FAMILY_KEYS = Object.keys(MONSTER_FAMILIES);

/* BATCH-4 NEW FAMILIES (2026-10-26, rigged Tripo arrivals).
 * MONSTER_FAMILIES stays slot-pure — its keys are the 38 unique
 * Monster Graphics slots, and the tests lock that contract — so
 * the batch-4 creatures that match NO existing slot live here
 * under name keys, not invented slot numbers. Squeezing them
 * into ill-fitting slots would break the world-to-monsters rule
 * (REQUIREMENTS.md: the world shapes around the monsters, never
 * the reverse). spawns.js merges these into MONSTER_TYPES and
 * guarantees two of each in-band, exactly like slot families, so
 * they spawn, hunt, and pay rewards under the same rules — only
 * their keys are names, and their model paths follow the same
 * /models/hollow-earth/<key>.glb scheme. Stats honour the same
 * 100–200 HP band. `mount: true` marks a rideable-mount
 * candidate (riding itself is NOT built yet); `flyHeight`
 * lifts a flyer the way the dragon seats already do (strike.js
 * flight ceiling applies generically). */
export const EXTRA_FAMILIES = {
  'scarab-beetle': { key: 'scarab-beetle', name: 'Khepri the Jeweled', element: 'sand', attitude: 'stalk', archetype: 'short-range', habitat: 'sand', form: 'beast', sizeClass: 'hunter', hp: 120, dmg: 12, speed: 4.4, scaleM: 2.2, footprintR: 1.5, temperament: { scary: 0.7, vicious: 0.6, fast: 0.8 }, blurb: 'A jewel-shelled beetle rolling suns across the dark, collecting shiny secrets.' },
  'embermane-horse': { key: 'embermane-horse', name: 'Embermane', element: 'fire', attitude: 'charge', archetype: 'short-range', habitat: 'mountain', form: 'beast', sizeClass: 'hunter', hp: 140, dmg: 13, speed: 5.6, scaleM: 2.4, footprintR: 1.6, mount: true, temperament: { scary: 0.5, vicious: 0.5, fast: 1.0 }, blurb: 'A horse that chose its rider, not the other way round — proud, warm, impatient with bad riders.' },
  umbrax: { key: 'umbrax', name: 'Umbrax the Nightwing', element: 'shadow', attitude: 'stalk', archetype: 'ranged', habitat: 'shadow', form: 'beast', sizeClass: 'colossal', hp: 200, dmg: 18, speed: 4.6, scaleM: 4.0, footprintR: 2.6, flyHeight: 6, temperament: { scary: 1.0, vicious: 0.9, fast: 0.8 }, blurb: 'The dark between stars, with teeth — a subsonic rumble you feel in your ribs.' },
  aureline: { key: 'aureline', name: 'Aureline the Dawnscale', element: 'lightning', attitude: 'stalk', archetype: 'ranged', habitat: 'mountain', form: 'beast', sizeClass: 'brute', hp: 180, dmg: 15, speed: 5.4, scaleM: 3.4, footprintR: 2.2, flyHeight: 6, temperament: { scary: 0.8, vicious: 0.6, fast: 1.0 }, blurb: 'Hoards sunrises, not gold — bright, brassy, laughter like breaking light.' },
  'eagle-talon': { key: 'eagle-talon', name: "Liberty 'Lib' Talon", element: 'lightning', attitude: 'charge', archetype: 'short-range', habitat: 'mountain', form: 'beast', sizeClass: 'hunter', hp: 110, dmg: 11, speed: 6.0, scaleM: 1.8, footprintR: 1.2, flyHeight: 6, temperament: { scary: 0.6, vicious: 0.7, fast: 1.0 }, blurb: 'Sees everything, judges most of it, shares the good thermals.' },
  oozealot: { key: 'oozealot', name: 'Sir Oozealot', element: 'acid', attitude: 'ambush', archetype: 'melee', habitat: 'acid', form: 'beast', sizeClass: 'brute', hp: 180, dmg: 14, speed: 2.2, scaleM: 2.8, footprintR: 1.9, temperament: { scary: 0.7, vicious: 0.5, fast: 0.2 }, blurb: 'Slow, unstoppable, mildly offended by salt — wet, glubbing, philosophical.' },
  'fenris-warg': { key: 'fenris-warg', name: 'Fenris the Road-Shadow', element: 'shadow', attitude: 'charge', archetype: 'melee', habitat: 'shadow', form: 'beast', sizeClass: 'hunter', hp: 130, dmg: 13, speed: 5.8, scaleM: 2.2, footprintR: 1.5, temperament: { scary: 0.8, vicious: 0.9, fast: 1.0 }, blurb: 'Runs ahead of storms and bad news alike — low growls, wind-fast howls.' },
  'frostbite-lizard': { key: 'frostbite-lizard', name: 'Frostbite the Patient', element: 'frost', attitude: 'stalk', archetype: 'short-range', habitat: 'frost', form: 'beast', sizeClass: 'brute', hp: 170, dmg: 14, speed: 3.4, scaleM: 3.0, footprintR: 2.0, mount: true, temperament: { scary: 0.6, vicious: 0.5, fast: 0.4 }, blurb: 'Carries riders across the white like it is no trouble at all — slow huffs, ice-cracking grumbles.' },
  'dune-maw-2': { key: 'dune-maw-2', name: 'Dune Maw the Second', element: 'sand', attitude: 'charge', archetype: 'melee', habitat: 'sand', form: 'beast', sizeClass: 'brute', hp: 170, dmg: 15, speed: 4.6, scaleM: 3.0, footprintR: 2.0, temperament: { scary: 0.8, vicious: 0.9, fast: 0.8 }, blurb: 'The desert’s second opinion, equally sandy — grinding, whispering sandstorm.' },
  vice: { key: 'vice', name: 'Vice', element: 'poison', attitude: 'stalk', archetype: 'ranged', habitat: 'poison', form: 'beast', sizeClass: 'hunter', hp: 130, dmg: 13, speed: 4.2, scaleM: 2.4, footprintR: 1.6, temperament: { scary: 0.9, vicious: 0.8, fast: 0.6 }, blurb: 'Temptation with claws — smooth, sinister, purring menace.' },
  wonder: { key: 'wonder', name: 'The Unnamed Wonder', element: 'shadow', attitude: 'stalk', archetype: 'ranged', habitat: 'mountain', form: 'beast', sizeClass: 'hunter', hp: 120, dmg: 11, speed: 3.8, scaleM: 2.2, footprintR: 1.5, temperament: { scary: 0.5, vicious: 0.3, fast: 0.6 }, blurb: 'Strange, soft, and impossible to describe twice the same way — warbling, curious, gentle.' },
};

export const EXTRA_FAMILY_KEYS = Object.keys(EXTRA_FAMILIES);

/* Where each family lives: slot → 'family' (a MONSTER_FAMILIES
 * entry) or 'boss' (slot 13, Korus, whose seat is the throne).
 * null for anything that is not a unique monster slot at all
 * (slot 4 the banner, the duplicate slots, anything else). */
export function slotHome(slot) {
  const n = Number(slot);
  if (n === BOSS_SLOT) return 'boss';
  if (Object.prototype.hasOwnProperty.call(MONSTER_FAMILIES, slotKey(n))) return 'family';
  return null;
}

export const FAMILIES_BY_HABITAT = {};
export const FAMILIES_BY_ELEMENT = {};
for (const [key, f] of Object.entries({ ...MONSTER_FAMILIES, ...EXTRA_FAMILIES })) {
  (FAMILIES_BY_HABITAT[f.habitat] = FAMILIES_BY_HABITAT[f.habitat] || []).push(key);
  (FAMILIES_BY_ELEMENT[f.element] = FAMILIES_BY_ELEMENT[f.element] || []).push(key);
}
