// lib/afterlife/operators.js
// AFTERLIFE OPERATOR AGENTS (Merlin, Nov 14 ~22:56 "Yes — all realms",
// behaviour logic Nov 14 ~22:59): the agents that operate the
// creatures of the 13 nether-realms and the 11 higher realms. Mirrors
// the Earth 4 pattern (lib/earth4/operators.js): seven agents
// (birth, growth, death, decomposition, diet, territory, water,
// habits + conductor `lifeFor`), a creature's whole life a pure
// function of (realm, place, species, device clock). NO stored state,
// NO server, NO Earth 4 code touched — Earth 4 keeps its own laws
// (no hunting, death by age only); these realms are NOT Earth 4.
//
// WHAT LIVES HERE (enumerated from code, not assumed): every one of
// the 24 realms spawns exactly ONE drifting kind — 18 copies in
// lib/<realm>/world.js makeWorld, 12 in one disc + 6 in a second,
// rendered as cones in app/<realm>/world3d.js. No realm spawns a
// second species. The three single static guardians are NOT spawned
// populations: Cerberus (Hades, at the Gates), Apep (Duat, coiled in
// the Dark Waters), the Faithful Dog (Mictlan, by the river). The
// Hounds of Annwn, the Einherjar of Valhalla and the bats of Xibalba
// are region names and set dressing only — no meshes, no spawner,
// so they get no operators and are not invented here.
//
// DEATH LAW (my call, flagged — no death law exists in realm code or
// in Merlin's orders for these realms): a drifting soul's sojourn
// ends and it passes on — that is the only death that ever fires.
// The territorial fight-to-death branch (Merlin, Nov 14 ~22:59) is
// implemented and evaluated, but it NEVER fires here: each realm
// holds at most one carnivore (Cerberus, Apep) and the two never
// share a realm, so no rival is ever in range. Guardians are
// eternal: they never die. Nothing hunts the user and nothing fights
// over a corpse in these realms — the code has no user-as-prey
// mechanic and no user-death outcome anywhere in the 24 realms
// (verified by grep: no catch / damage / health / death for the
// player; Duat's own header says "nothing fights, nothing charges"),
// so both branches are gated off with `applies: false` and a reason
// rather than invented.
//
// DIET (Merlin, Nov 14 ~22:59 — diet drives feeding): the drifting
// dead have diet 'none' — the dead do not eat, so they never hunger
// and never hunt. Cerberus and Apep are carnivores by mythic role
// (my call, flagged): when hungry they would hunt — but no prey
// species exists in any realm's roster, so the hunt never fires.
// The Faithful Dog is a helper, not a hunter (diet 'none').
//
// WATER (Merlin, Nov 14 ~22:59 — all creatures seek water): every
// realm except Annwn has a real river band (RIVER zMin/zMax ±18 in
// lib/<realm>/world.js); Annwn's barrier is mist, not water, so the
// branch does not apply there. LAVA IS NOT WATER: the lava pools of
// Hades, Diyu, Hell and Naraka (and Hell's Lake of Fire) are never a
// water target — the target is always the river bank. The dead do
// not drink; seeking water means gathering at the bank on a seeded
// thirst cycle, which is what the Water Agent returns.
//
// POPULATION RULE (Merlin, Nov 14 ~22:57): more than one copy of
// every creature, spread out across maps. Minimum live copies per
// realm: 12 (MIN_LIVE_COPIES, my call). The spawner holds 18 total
// per realm and the distribution fix spreads them 8 + 6 + 4 across
// all THREE region discs (was 12 + 6 in two discs — the third disc
// rendered no creatures at all). populationFor() audits the rule:
// live count, distinct areas, meetsRule. The cap is NOT raised.
//
// BIRTH: the dead do not breed — a new soul ARRIVES when the
// previous one passes on and fades (arrivals are continuous, no
// breeding season). Guardians never arrive: exactly one each,
// eternal.

export const FOUNDING_MS = Date.UTC(2026, 10, 12); // realms built Nov 12
export const DAY_MS = 86400000;
export const MIN_LIVE_COPIES = 12; // population rule, my call
export const TERRITORY_RANGE_M = 40;

// Seeded hash — same arithmetic family as the Earth 4 spawner, so
// the same (realm, cell, species) always draws the same life.
function hash01(str, seed) {
  let h = seed | 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dist(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

/** Device local hour as a decimal (0–24). Activity reads local time. */
export function localHour(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

// ── The roster: one drifting kind per realm, from code ──────────
// sojournDays / fadeDays are MY CALL (no lifespan data exists for
// these beings in code) — flagged in the report. diet 'none' for the
// drifting dead is from code: nothing in any realm eats, hunts or
// feeds. river: the realm's real watercourse from lib/<realm>/world.js;
// null = no water in code (Annwn: mist barrier). drinks is false
// everywhere for the drift kinds: the dead gather at the bank, they
// do not drink. areas: the three region discs (REGIONS in world.js).
const A = (key, name, x, z, r) => ({ key, name, x, z, r });
const R = (name, zMin, zMax, blood = false) => ({ name, zMin, zMax, blood });

export const SPECIES = {
  'nether-realm': { realm: 'nether-realm', name: 'Hades', route: '/nether-realm', varName: 'shades', kind: 'Shade', kindPlural: 'Shades', diet: 'none', sojournDays: 90, fadeDays: 7, river: R('River Styx', -18, 18), areas: [A('asphodel', 'Asphodel', -160, -70, 70), A('elysium', 'Elysium', 160, -70, 70), A('tartarus', 'Tartarus', 0, -230, 80)] },
  helheim: { realm: 'helheim', name: 'Helheim', route: '/helheim', varName: 'shades', kind: 'Shade', kindPlural: 'Shades', diet: 'none', sojournDays: 90, fadeDays: 7, river: R('River Gjöll', -18, 18), areas: [A('mist-fields', 'The Mist Fields', -160, -70, 70), A('nastrond', 'Náströnd', 160, -70, 70), A('frozen-shore', 'The Frozen Shore', 0, -230, 80)] },
  yomi: { realm: 'yomi', name: 'Yomi', route: '/yomi', varName: 'shades', kind: 'Shade', kindPlural: 'Shades', diet: 'none', sojournDays: 90, fadeDays: 7, river: R('River of the Dead', -18, 18), areas: [A('dark-road', 'The Dark Road', -160, -70, 70), A('ne-no-kuni', 'Ne-no-kuni', 160, -70, 70), A('deep-dark', 'The Deep Dark', 0, -230, 80)] },
  annwn: { realm: 'annwn', name: 'Annwn', route: '/annwn', varName: 'shades', kind: 'Shade', kindPlural: 'Shades', diet: 'none', sojournDays: 90, fadeDays: 7, river: null, areas: [A('mist-fields', 'The Mist Fields', -160, -70, 70), A('hounds-grounds', "The Hounds' Hunting Grounds", 160, -70, 70), A('cauldron-hall', 'The Cauldron Hall', 0, -230, 80)] },
  duat: { realm: 'duat', name: 'Duat', route: '/duat', varName: 'shades', kind: 'Shade', kindPlural: 'Shades', diet: 'none', sojournDays: 90, fadeDays: 7, river: R('River of the Dead', -18, 18), areas: [A('twelve-gates', 'The Twelve Gates', -160, -70, 70), A('dark-waters', 'The Dark Waters', 160, -70, 70), A('twelfth-gate', 'The Twelfth Gate', 0, -230, 80)] },
  mictlan: { realm: 'mictlan', name: 'Mictlan', route: '/mictlan', varName: 'shades', kind: 'Shade', kindPlural: 'Shades', diet: 'none', sojournDays: 90, fadeDays: 7, river: R('River Apanohuacalhuia', -18, 18), areas: [A('crashing-mountains', 'The Crashing Mountains', -160, -70, 70), A('obsidian-wind', 'The Obsidian Wind', 160, -70, 70), A('ninth-level', 'The Ninth Level', 0, -230, 80)] },
  xibalba: { realm: 'xibalba', name: 'Xibalba', route: '/xibalba', varName: 'shades', kind: 'Shade', kindPlural: 'Shades', diet: 'none', sojournDays: 90, fadeDays: 7, river: R('River of Blood', -18, 18, true), areas: [A('trial-houses', 'The Houses of Trial', -160, -70, 70), A('bat-house', 'The Bat House', 160, -70, 70), A('place-of-fear', 'The Place of Fear', 0, -230, 80)] },
  hell: { realm: 'hell', name: 'Hell', route: '/hell', varName: 'shades', kind: 'Shade', kindPlural: 'Shades', diet: 'none', sojournDays: 90, fadeDays: 7, river: R('Phlegethon', -18, 18, true), areas: [A('burning-plain', 'The Burning Plain', -160, -70, 70), A('lake-of-fire', 'The Lake of Fire', 160, -70, 70), A('frozen-deep', 'The Frozen Deep', 0, -230, 80)] },
  naraka: { realm: 'naraka', name: 'Naraka', route: '/naraka', varName: 'shades', kind: 'Shade', kindPlural: 'Shades', diet: 'none', sojournDays: 90, fadeDays: 7, river: R('Vaitarna', -18, 18, true), areas: [A('judgment-halls', 'The Judgment Halls', -160, -70, 70), A('torment-fields', 'The Torment Fields', 160, -70, 70), A('wheel', 'The Wheel of Rebirth', 0, -230, 80)] },
  diyu: { realm: 'diyu', name: 'Diyu', route: '/diyu', varName: 'shades', kind: 'Shade', kindPlural: 'Shades', diet: 'none', sojournDays: 90, fadeDays: 7, river: R('Wangchuan', -18, 18), areas: [A('ten-courts', 'The Ten Courts', -160, -70, 70), A('torment-halls', 'The Torment Halls', 160, -70, 70), A('wheel', 'The Wheel of Rebirth', 0, -230, 80)] },
  kur: { realm: 'kur', name: 'Kur', route: '/kur', varName: 'shades', kind: 'Shade', kindPlural: 'Shades', diet: 'none', sojournDays: 90, fadeDays: 7, river: R('River Hubur', -18, 18), areas: [A('seven-gates', 'The Seven Gates', -160, -70, 70), A('house-of-dust', 'The House of Dust', 160, -70, 70), A('throne-hall', 'The Throne Hall', 0, -230, 80)] },
  nav: { realm: 'nav', name: 'Nav', route: '/nav', varName: 'wisps', kind: 'Wisp', kindPlural: 'Wisps', diet: 'none', sojournDays: 120, fadeDays: 7, river: R('River of the Dead', -18, 18), areas: [A('roots', 'The Roots of the World Tree', -160, -70, 70), A('meadows', 'The Damp Meadows', 160, -70, 70), A('veles-hall', "Veles' Hall", 0, -230, 80)] },
  orun: { realm: 'orun', name: 'Orun', route: '/orun', varName: 'spirits', kind: 'Spirit', kindPlural: 'Spirits', diet: 'none', sojournDays: 180, fadeDays: 7, river: R('River of the Ancestors', -18, 18), areas: [A('village', "The Ancestors' Village", -160, -70, 70), A('market', 'The Spirit Market', 160, -70, 70), A('white-cloth-hall', 'The White-Cloth Hall', 0, -230, 80)] },
  elysium: { realm: 'elysium', name: 'Elysium', route: '/elysium', varName: 'shades', kind: 'Shade', kindPlural: 'Shades', diet: 'none', sojournDays: 365, fadeDays: 7, river: R('The Meander', -18, 18), areas: [A('white-gardens', 'The White Gardens', -160, -70, 70), A('golden-fields', 'The Golden Fields', 160, -70, 70), A('far-shore', 'The Far Shore', 0, -230, 80)] },
  valhalla: { realm: 'valhalla', name: 'Valhalla', route: '/valhalla', varName: 'shades', kind: 'Shade', kindPlural: 'Shades', diet: 'none', sojournDays: 365, fadeDays: 7, river: R('The Bifröst', -18, 18), areas: [A('feasting-field', 'The Feasting Field', -160, -70, 70), A('training-grounds', 'The Training Grounds', 160, -70, 70), A('einherjar-rest', "The Einherjar's Rest", 0, -230, 80)] },
  aaru: { realm: 'aaru', name: 'Aaru', route: '/aaru', varName: 'shades', kind: 'Shade', kindPlural: 'Shades', diet: 'none', sojournDays: 365, fadeDays: 7, river: R('The Celestial Nile', -18, 18), areas: [A('reed-beds', 'The Reed Beds', -160, -70, 70), A('barley-fields', 'The Barley Fields', 160, -70, 70), A('lake-of-peace', 'The Lake of Peace', 0, -230, 80)] },
  heaven: { realm: 'heaven', name: 'Heaven', route: '/heaven', varName: 'blessed', kind: 'Blessed', kindPlural: 'The Blessed', diet: 'none', sojournDays: 365, fadeDays: 7, river: R('The River of Life', -18, 18), areas: [A('clouds-of-the-blessed', 'Clouds of the Blessed', -160, -70, 70), A('golden-city', 'The Golden City', 160, -70, 70), A('sea-of-glass', 'The Sea of Glass', 0, -230, 80)] },
  svarga: { realm: 'svarga', name: 'Svarga', route: '/svarga', varName: 'apsaras', kind: 'Apsara', kindPlural: 'Apsaras', diet: 'none', sojournDays: 365, fadeDays: 7, river: R('The Mandakini', -18, 18), areas: [A('nandana-gardens', 'Nandana Gardens', -160, -70, 70), A('lotus-lakes', 'The Lotus Lakes', 160, -70, 70), A('mount-meru', 'Mount Meru', 0, -230, 80)] },
  takamagahara: { realm: 'takamagahara', name: 'Takamagahara', route: '/takamagahara', varName: 'kami', kind: 'Kami', kindPlural: 'Kami', diet: 'none', sojournDays: 365, fadeDays: 7, river: R('The Amanogawa', -18, 18), areas: [A('high-plain', 'The High Plain', -160, -70, 70), A('sakura-grove', 'The Sacred Sakura Grove', 160, -70, 70), A('sun-terrace', 'The Sun Terrace', 0, -230, 80)] },
  'tir-na-nog': { realm: 'tir-na-nog', name: 'Tír na nÓg', route: '/tir-na-nog', varName: 'fae', kind: 'Fae', kindPlural: 'The Fae', diet: 'none', sojournDays: 365, fadeDays: 7, river: R('The Silver River', -18, 18), areas: [A('green-meadows', 'The Green Meadows', -160, -70, 70), A('white-horse-fields', 'The White Horse Fields', 160, -70, 70), A('emain-ablach', 'Emain Ablach', 0, -230, 80)] },
  tlalocan: { realm: 'tlalocan', name: 'Tlalocan', route: '/tlalocan', varName: 'drifters', kind: 'Drifter', kindPlural: 'Drifters', diet: 'none', sojournDays: 180, fadeDays: 7, river: R('The Green River', -18, 18), areas: [A('flower-fields', 'The Flower Fields', -160, -70, 70), A('rain-gardens', 'The Rain Gardens', 160, -70, 70), A('green-lake', 'The Green Lake', 0, -230, 80)] },
  'maya-sky': { realm: 'maya-sky', name: 'Maya Sky', route: '/maya-sky', varName: 'drifters', kind: 'Drifter', kindPlural: 'Drifters', diet: 'none', sojournDays: 180, fadeDays: 7, river: R('The Cloud River', -18, 18), areas: [A('corn-fields', 'The Corn Fields', -160, -70, 70), A('star-gardens', 'The Star Gardens', 160, -70, 70), A('upper-sky', 'The Upper Sky', 0, -230, 80)] },
  vyraj: { realm: 'vyraj', name: 'Vyraj', route: '/vyraj', varName: 'drifters', kind: 'Drifter', kindPlural: 'Drifters', diet: 'none', sojournDays: 180, fadeDays: 7, river: R('The Bright River', -18, 18), areas: [A('bird-fields', 'The Bird Fields', -160, -70, 70), A('blossom-meadow', 'The Blossom Meadow', 160, -70, 70), A('far-shore', 'The Far Shore', 0, -230, 80)] },
  tiangong: { realm: 'tiangong', name: 'Tiangong', route: '/tiangong', varName: 'drifters', kind: 'Drifter', kindPlural: 'Drifters', diet: 'none', sojournDays: 180, fadeDays: 7, river: R('The Silver River', -18, 18), areas: [A('peach-gardens', 'The Peach Gardens', -160, -70, 70), A('jade-terraces', 'The Jade Terraces', 160, -70, 70), A('cloud-sea', 'The Cloud Sea', 0, -230, 80)] },
};

export const REALM_KEYS = Object.keys(SPECIES);

/** The species record for a realm, or null for an unknown realm. */
export function speciesFor(realmKey) {
  return SPECIES[realmKey] || null;
}

// ── Guardians: single static beings, NOT spawned populations ────
// diet 'carnivore' for Cerberus / Apep is MY CALL (mythic role —
// hound, serpent); no prey exists in their realms' rosters, so the
// hunt never fires. The Faithful Dog helps the dead cross (code
// role) and does not hunt. All three are eternal: no birth, no death.
export const GUARDIANS = {
  'nether-realm': [{ id: 'cerberus', name: 'Cerberus', kind: 'Guardian Hound', diet: 'carnivore', x: 0, z: 62, sizeM: 5, activity: 'guarding', territory: { name: 'The Gates', x: 0, z: 62, radius: 40 }, livesInWater: false, basis: 'mythic role (hound) — my call' }],
  duat: [{ id: 'apep', name: 'Apep', kind: 'Great Serpent', diet: 'carnivore', x: 160, z: -70, sizeM: 3, activity: 'lurking', territory: { name: 'The Dark Waters', x: 160, z: -70, radius: 70 }, livesInWater: true, basis: 'mythic role (serpent) — my call' }],
  mictlan: [{ id: 'faithful-dog', name: 'The Faithful Dog', kind: 'Helper Dog', diet: 'none', x: 14, z: 26, sizeM: 3.6, activity: 'waiting', territory: { name: 'The River Bank', x: 14, z: 26, radius: 25 }, livesInWater: false, basis: 'code role: helps the dead cross the river' }],
};

/** Guardians of a realm (empty array where the realm has none). */
export function guardiansFor(realmKey) {
  return GUARDIANS[realmKey] || [];
}

// ── Code facts the behaviour branches are gated on ──────────────
// Verified by grep over all 24 realm apps + libs: NO realm has a
// user-as-prey mechanic (no catch / damage / health / player death)
// and NO realm has a user-death outcome. Duat's own scene header
// says "nothing fights, nothing charges". So both branches are
// off everywhere — implemented, evaluated, never taken.
export const USER_AS_PREY = {}; // realmKey -> true if users are prey in code
export const USER_DEATH_OUTCOME = {}; // realmKey -> true if the user can die in code

export function userAsPrey(realmKey) { return USER_AS_PREY[realmKey] === true; }
export function userDeathOutcome(realmKey) { return USER_DEATH_OUTCOME[realmKey] === true; }

// ── Birth Agent ─────────────────────────────────────────────────
// The dead do not breed. A new soul ARRIVES when the previous one
// passes on and finishes fading — arrivals are continuous, there is
// no breeding season. Returns the arrival that follows a fading end.
export function arrivalsFor(rec) {
  return { breeding: false, offspring: 0, arrivalsPerCycle: 1, season: 'year-round — the dead arrive daily' };
}

// ── Growth Agent ────────────────────────────────────────────────
// Souls arrive full-formed and do not grow. The "growth" is the
// sojourn itself: Newly arrived -> Wandering -> Old, by age fraction.
export const SOJOURN_STAGES = ['Newly arrived', 'Wandering', 'Old'];
export function growthFor(rec, ageDays) {
  const frac = clamp(ageDays / Math.max(1, rec.sojournDays), 0, 1);
  const stageIndex = Math.min(SOJOURN_STAGES.length - 1, Math.floor(frac * SOJOURN_STAGES.length));
  return { fraction: frac, stageIndex, stageName: SOJOURN_STAGES[stageIndex], stages: SOJOURN_STAGES, sizeM: 2.4, adultSizeM: 2.4 };
}

// ── Diet Agent (Merlin, Nov 14 ~22:59: diet drives feeding) ─────
// carnivore -> hunts when hungry; omnivore -> hunts or grazes;
// herbivore -> grazes; none -> does not feed (the dead do not eat).
// Hunger runs on a seeded 8-hour cycle with a 2-hour hungry window
// — but only for diets that eat at all. `prey` is the realm's roster
// of edible creatures: EMPTY in every afterlife realm, so a hungry
// carnivore still has nothing to hunt and the hunt never fires.
export function dietFor(rec, key, nowMs, prey = []) {
  const diet = rec.diet || 'none';
  const hours = nowMs / 3600000;
  const hungry = diet !== 'none' && ((hours + hash01(key, 911) * 8) % 8) < 2;
  let feedingMode;
  if (diet === 'carnivore') feedingMode = prey.length > 0 ? 'hunts when hungry' : 'would hunt when hungry — no prey in this realm';
  else if (diet === 'omnivore') feedingMode = 'hunts or grazes';
  else if (diet === 'herbivore') feedingMode = 'grazes';
  else feedingMode = 'does not feed';
  return { diet, feedingMode, hungry, preyCount: prey.length };
}

// ── Territory Agent (Merlin, Nov 14 ~22:59) ─────────────────────
// Carnivores are territorial: a rival carnivore of the same realm in
// range means a fight to the death. When a user is near, a carnivore
// hunts the user and fights rivals for that meal — BUT only where the
// realm's code has users as prey (none do: userAsPrey() is false for
// all 24, so huntsUser is always false with the reason attached).
// Should the user die, carnivores fight over the corpse — again only
// where the code has a user-death outcome (none do).
export function territoryFor(realmKey, self, others = [], userNear = false, userDead = false) {
  const diet = self.diet || 'none';
  if (diet !== 'carnivore') {
    return { territorial: false, territory: self.territory || null, rivals: [], fightToDeath: false, huntsUser: false, userHuntApplies: false, userHuntReason: 'not a carnivore — never hunts', corpseFightApplies: false, corpseFightReason: 'not a carnivore — never fights over a corpse', fightsForMeal: false, fightsOverCorpse: false };
  }
  const territory = self.territory || null;
  const rivals = (others || []).filter((o) => o && o.id !== self.id && o.diet === 'carnivore'
    && typeof o.x === 'number' && typeof o.z === 'number'
    && dist(self.x, self.z, o.x, o.z) <= TERRITORY_RANGE_M);
  const preyApplies = userAsPrey(realmKey);
  const deathApplies = userDeathOutcome(realmKey);
  return {
    territorial: true,
    territory,
    rivals: rivals.map((o) => o.id),
    fightToDeath: rivals.length > 0,
    huntsUser: Boolean(userNear) && preyApplies,
    userHuntApplies: preyApplies,
    userHuntReason: preyApplies ? null : 'no user-as-prey mechanic in this realm’s code',
    corpseFightApplies: deathApplies,
    corpseFightReason: deathApplies ? null : 'no user-death outcome in this realm’s code',
    fightsForMeal: Boolean(userNear) && preyApplies && rivals.length > 0,
    fightsOverCorpse: Boolean(userDead) && deathApplies,
  };
}

// ── Water Agent (Merlin, Nov 14 ~22:59: all creatures seek water)
// Target is the nearest point on the realm's real river band —
// NEVER lava (lava pools are not water) and never a blood river's
// water (blood rivers are still the bank the dead gather at, but
// drinks stays false). Annwn has no river (mist barrier): the branch
// does not apply. Seeking runs on a seeded 6-hour cycle with a
// 2-hour seeking window. The dead do not drink; seeking means
// gathering at the bank. Apep already lives in the water.
export function waterFor(rec, key, x, z, nowMs) {
  const river = rec.river || null;
  if (!river) {
    return { applies: false, reason: 'no water in this realm — the barrier is mist, not a river', seeking: false, drinks: false, target: null, riverName: null };
  }
  const hours = nowMs / 3600000;
  const seeking = ((hours + hash01(key, 733) * 6) % 6) < 2;
  let target;
  if (z > river.zMax) target = { x, z: river.zMax };
  else if (z < river.zMin) target = { x, z: river.zMin };
  else target = { x, z };
  return {
    applies: true,
    reason: null,
    seeking,
    drinks: false,
    drinkReason: river.blood ? 'the river here is blood, not water — the dead gather at the bank' : 'the dead do not drink — they gather at the bank',
    target,
    riverName: river.name,
    blood: river.blood,
  };
}

// ── Habits Agent ────────────────────────────────────────────────
// Activity from the device clock: seeking water first (thirst
// cycle), then the night rest (22:00–06:00 local the dead hover
// still), otherwise drifting. Guardians do not follow the day:
// Cerberus guards, the Dog waits, Apep lurks.
export function activityNow(rec, key, x, z, now = new Date(), water = null) {
  if (water && water.seeking) return 'seeking water';
  const h = localHour(now);
  if (h < 6 || h >= 22) return 'resting';
  return 'drifting';
}

/** Social behaviour and group size (display — one mesh per spawner cell). */
export function socialFor(rec, key) {
  const groupSize = 2 + Math.floor(hash01(key, 607) * 4); // 2–5, display only
  return { behaviour: 'Drifts in loose groups', groupSize };
}

// ── Decomposition Agent ─────────────────────────────────────────
// After passing on, the soul fades: Fading -> Wisp -> Gone, over
// fadeDays. Remains stay visible (flattened, fading) through the
// window, then the next soul arrives and the cell turns over.
export const FADE_STAGES = ['Fading', 'Wisp', 'Gone'];
export function decompFor(rec, frac) {
  const idx = Math.min(FADE_STAGES.length - 1, Math.floor(clamp(frac, 0, 1) * FADE_STAGES.length));
  return { stageName: FADE_STAGES[idx], stages: FADE_STAGES };
}

// ── Death Agent ─────────────────────────────────────────────────
// Death has ONE cause that ever fires here: the sojourn ends and the
// soul passes on. The territorial fight-to-death is a real branch —
// a rival carnivore in range moves the death earlier — but no realm's
// roster ever puts one in range, so it never fires.
export function deathFor(rec, key, epochMs, rivalsInRange) {
  const sojournMs = Math.max(1, rec.sojournDays * DAY_MS);
  const sojournDeath = epochMs + sojournMs;
  let fightDeath = Infinity;
  if (rivalsInRange) {
    fightDeath = epochMs + hash01(`${key}|fight`, 811) * sojournMs;
  }
  if (fightDeath < sojournDeath) {
    return { deathMs: fightDeath, cause: 'slain in a territorial fight' };
  }
  return { deathMs: sojournDeath, cause: 'sojourn ended — passed on' };
}

// ── Conductor: the whole life, from the clock ───────────────────
const SEED_BIRTH = 20261112 + 401;

function buildAlive(rec, realmKey, name, cellKey, nowMs, x, z, epochMs, ageDays, generation, territory, water, diet) {
  const key = `${realmKey}|${cellKey}|${name}`;
  const g = growthFor(rec, ageDays);
  const activity = rec.guardian ? rec.activity : activityNow(rec, key, x, z, new Date(nowMs), water);
  return {
    name, realm: realmKey, cell: cellKey,
    state: rec.guardian ? 'eternal' : 'alive',
    generation,
    ageDays: Math.round(ageDays * 10) / 10,
    ageYears: Math.round((ageDays / 365.25) * 100) / 100,
    stageIndex: g.stageIndex,
    stageName: rec.guardian ? 'Guardian' : g.stageName,
    stages: g.stages,
    sizeM: rec.guardian ? rec.sizeM : g.sizeM,
    adultSizeM: rec.guardian ? rec.sizeM : g.adultSizeM,
    growthFraction: rec.guardian ? 1 : Math.round(g.fraction * 1000) / 1000,
    breeding: false,
    offspring: 0,
    arrivalsPerCycle: 1,
    activity,
    activityPattern: rec.guardian ? 'always' : 'drifts by day, rests by night',
    diet: diet.diet,
    feedingMode: diet.feedingMode,
    hungry: diet.hungry,
    territory,
    water,
    social: rec.guardian ? { behaviour: 'Solitary', groupSize: 1 } : socialFor(rec, key),
    decompFraction: 0,
    decompStageName: null,
    deathCause: null,
    deathEpochMs: null,
    lifespanYears: Math.round((rec.sojournDays / 365.25) * 100) / 100,
    sojournDays: rec.sojournDays,
    fadeDays: rec.fadeDays,
  };
}

function buildFading(rec, realmKey, name, cellKey, nowMs, x, z, epochMs, deathMs, generation, territory, water, diet) {
  const key = `${realmKey}|${cellKey}|${name}`;
  const fadeMs = Math.max(1, rec.fadeDays * DAY_MS);
  const frac = clamp((nowMs - deathMs) / fadeMs, 0, 1);
  const d = decompFor(rec, frac);
  const g = growthFor(rec, rec.sojournDays);
  return {
    name, realm: realmKey, cell: cellKey,
    state: 'fading',
    generation,
    ageDays: Math.round(((deathMs - epochMs) / DAY_MS) * 10) / 10,
    ageYears: Math.round((rec.sojournDays / 365.25) * 100) / 100,
    stageIndex: g.stageIndex,
    stageName: g.stageName,
    stages: g.stages,
    sizeM: g.sizeM,
    adultSizeM: g.adultSizeM,
    growthFraction: 1,
    breeding: false,
    offspring: 0,
    arrivalsPerCycle: 1,
    activity: 'resting',
    activityPattern: 'drifts by day, rests by night',
    diet: diet.diet,
    feedingMode: diet.feedingMode,
    hungry: false,
    territory,
    water,
    social: socialFor(rec, key),
    decompFraction: Math.round(frac * 1000) / 1000,
    decompStageName: d.stageName,
    decompStages: d.stages,
    deathCause: 'sojourn ended — passed on',
    deathEpochMs: deathMs,
    lifespanYears: Math.round((rec.sojournDays / 365.25) * 100) / 100,
    sojournDays: rec.sojournDays,
    fadeDays: rec.fadeDays,
  };
}

/**
 * The full life state of one creature at the device clock: its
 * generation, sojourn stage, what it is doing right now, what it
 * eats (or that it does not eat), whether it is seeking water,
 * whether it is fighting or hunting (it never is, in these realms —
 * see territoryFor), and — if passing on — how far along its fading
 * is. Pure: the same (realm, name, cell, clock) always returns the
 * same life. Guardians are eternal and return state 'eternal'.
 *
 * opts: { x, z, userNear, userDead, others } — others is the realm's
 * carnivore roster for the territory scan (defaults to the realm's
 * guardians).
 */
export function lifeFor(realmKey, name, cellKey, now = Date.now(), opts = {}) {
  const rec = speciesFor(realmKey);
  if (!rec) return null;
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const x = typeof opts.x === 'number' ? opts.x : 0;
  const z = typeof opts.z === 'number' ? opts.z : 0;

  // Guardians are not on the birth/death clock: eternal, one each.
  const guardian = guardiansFor(realmKey).find((gd) => gd.id === cellKey || gd.name === name);
  if (guardian) {
    const grec = { ...rec, guardian: true, activity: guardian.activity, sizeM: guardian.sizeM, diet: guardian.diet };
    const diet = dietFor(grec, `${realmKey}|${guardian.id}`, nowMs, []);
    const territory = territoryFor(realmKey, guardian, opts.others || guardiansFor(realmKey), Boolean(opts.userNear), Boolean(opts.userDead));
    const water = guardian.livesInWater
      ? { applies: true, reason: null, seeking: false, drinks: false, drinkReason: 'lives in the water', target: { x: guardian.x, z: guardian.z }, riverName: rec.river ? rec.river.name : null, blood: rec.river ? rec.river.blood : false }
      : { ...waterFor(rec, `${realmKey}|${guardian.id}`, guardian.x, guardian.z, nowMs), seeking: false };
    // Guardians stand their post — they never travel to the water.
    return buildAlive(grec, realmKey, guardian.name, guardian.id, nowMs, guardian.x, guardian.z, FOUNDING_MS, 0, 0, territory, water, diet);
  }

  const kindName = name || rec.kind;
  const key = `${realmKey}|${cellKey}|${kindName}`;
  const sojournMs = Math.max(1, rec.sojournDays * DAY_MS);
  const fadeMs = Math.max(1, rec.fadeDays * DAY_MS);
  const ageAtFounding = hash01(key, SEED_BIRTH) * sojournMs;
  let epoch = FOUNDING_MS - ageAtFounding;
  let generation = 0;

  // Territory is roster-driven and clock-free, so it is evaluated
  // once per call from the realm's carnivore roster (guardians).
  const self = { id: cellKey, diet: rec.diet, x, z, territory: null };
  const territory = territoryFor(realmKey, self, opts.others || guardiansFor(realmKey), Boolean(opts.userNear), Boolean(opts.userDead));
  const diet = dietFor(rec, key, nowMs, []);
  const water = waterFor(rec, key, x, z, nowMs);

  let guard = 0;
  while (guard++ < 10000) {
    const death = deathFor(rec, key, epoch, territory.fightToDeath);
    if (nowMs < death.deathMs) {
      return buildAlive(rec, realmKey, kindName, cellKey, nowMs, x, z, epoch, (nowMs - epoch) / DAY_MS, generation, territory, water, diet);
    }
    const free = death.deathMs + fadeMs;
    if (nowMs < free) {
      return buildFading(rec, realmKey, kindName, cellKey, nowMs, x, z, epoch, death.deathMs, generation, territory, water, diet);
    }
    epoch = free; // next soul arrives the moment the last one fades
    generation++;
  }
  return buildAlive(rec, realmKey, kindName, cellKey, nowMs, x, z, epoch, Math.max(0, (nowMs - epoch) / DAY_MS), generation, territory, water, diet);
}

/**
 * Enrich spawner output with life: adds `life` to every creature
 * (mutates and returns the same array). The spawner itself is
 * untouched — the spatial law stays pure; the operators layer time
 * and behaviour on top of it.
 */
export function enrichCreatures(creatures, realmKey, now = Date.now()) {
  if (!Array.isArray(creatures)) return creatures;
  const rec = speciesFor(realmKey);
  if (!rec) return creatures;
  const t = now instanceof Date ? now.getTime() : Number(now);
  for (const c of creatures) {
    if (!c || typeof c.id !== 'string') continue;
    c.life = lifeFor(realmKey, rec.kind, c.id, t, { x: c.x, z: c.z });
  }
  return creatures;
}

/**
 * The area (region disc) a point belongs to, or 'wilds' when it is
 * outside all three discs.
 */
export function areaAt(realmKey, x, z) {
  const rec = speciesFor(realmKey);
  if (!rec) return 'wilds';
  for (const a of rec.areas) {
    if (dist(x, z, a.x, a.z) <= a.r) return a.key;
  }
  return 'wilds';
}

/**
 * Population audit for the population rule (Merlin, Nov 14 ~22:57):
 * more than one copy of every creature, spread out across maps.
 * Returns the live count, the distinct areas holding live copies,
 * and whether the rule is met (≥ MIN_LIVE_COPIES live AND ≥ 3 areas).
 */
export function populationFor(realmKey, creatures, now = Date.now()) {
  const rec = speciesFor(realmKey);
  if (!rec) return null;
  const t = now instanceof Date ? now.getTime() : Number(now);
  const enriched = enrichCreatures(Array.isArray(creatures) ? creatures : [], realmKey, t);
  let alive = 0;
  let fading = 0;
  const areaCounts = {};
  for (const c of enriched) {
    if (!c || !c.life) continue;
    if (c.life.state === 'alive') {
      alive++;
      const area = areaAt(realmKey, c.x, c.z);
      areaCounts[area] = (areaCounts[area] || 0) + 1;
    } else if (c.life.state === 'fading') {
      fading++;
    }
  }
  const areas = Object.keys(areaCounts).sort();
  return {
    realm: realmKey,
    kind: rec.kind,
    total: enriched.length,
    alive,
    fading,
    minLive: MIN_LIVE_COPIES,
    areas,
    areaCounts,
    meetsRule: alive >= MIN_LIVE_COPIES && areas.length >= 3,
  };
}

/**
 * Tap-card life line, Earth 4 shape: "stage · activity · group size",
 * or "Remains — <stage>" while fading. Guardians read as their post:
 * "Cerberus · guarding the Gates".
 */
export function lifeLineFor(life) {
  if (!life) return '';
  if (life.state === 'fading') return `Remains — ${life.decompStageName || 'Fading'}`;
  if (life.state === 'eternal') {
    const place = life.territory && life.territory.territory ? ` — ${life.territory.territory.name}` : '';
    return `${life.name} · ${life.activity}${place}`;
  }
  let line = `${life.stageName} · ${life.activity}`;
  if (life.water && life.water.seeking && life.activity !== 'seeking water') line += ' · seeking water';
  if (life.social && life.social.groupSize > 1) line += ` · in a group of ${life.social.groupSize}`;
  return line;
}

/**
 * Mesh scale for a live creature. Souls arrive full-formed (scale 1);
 * fading remains shrink away as they fade.
 */
export function growthScale(life) {
  if (!life) return 1;
  if (life.state === 'fading') return Math.max(0.3, 1 - (life.decompFraction || 0) * 0.7);
  return 1;
}
