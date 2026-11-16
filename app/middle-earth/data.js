// Content data layer for the Middle-earth pocket universe — SIX PODS.
// Pure module: no JSX, no document/window access at import time.
import { PLAYABLE, DEFAULT_HERO } from './characters.js';
// A tribute to J.R.R. Tolkien — all descriptive text here is original.
// Place-names appear as factual labels only; no poems, songs, or quotes.
//
// THE EXPANSIVE TREATMENT (2026-10-23, Merlin's order — the same
// treatment the Star Wars saga got): the old single 680x320 strip
// world is replaced by six full free-roam pods on the shared zone
// template — each ~340 m across with its own seed, biome-true
// ground, instanced scatter with colliders, horizon silhouettes,
// landmarks (real GLB constructs where the foundry delivered them),
// placed figures, and 2-3 missions. On entry the player picks
// 🎯 Missions or 🧭 Free Roam; roam writes no progress.
//
// THE CAMPAIGN SPINE (Merlin's words: "objective is hunt orcs —
// kill Saruman"): orc war-bands infest every pod (see def.orcs);
// kills persist in campaign.js. The finale — Saruman at Isengard,
// staged at the edge of the Rohan pod — unlocks at
// SARUMAN_GATE_KILLS campaign kills. Since 2026-10-24 the pods
// carry a BLANKET spawn field (camps + rovers across the whole
// disc, timed respawns, proximity streaming) instead of a few
// bands, and a per-pod hunt meter (campaign.heat) tracks how
// loudly the player has been hunting — see hunt.js.
//
// Pod defs follow the zone-template schema the Star Wars engine
// established ({ seed, tex, groundAmp, worldRadius, boundsRadius,
// scatter, horizon, landmarks, characters, missions, ambient }),
// consumed by ./zone.js.

export const PROGRESS_KEY = 'olympus:middleearth:progress';

export const DIFFICULTY_LABELS = { 1: 'Story', 2: 'Standard', 3: 'Heroic' };

/* Campaign orc-kill threshold that opens the road to Isengard's
 * finale. Tens, not hundreds — an evening's hunt (campaign.js). */
export const SARUMAN_GATE_KILLS = 30;

export const PODS = {
  shire: {
    id: 'shire',
    name: 'The Shire',
    kind: 'walk',
    biome: 'shire',
    color: 0x77b255,
    sky: 0x9fd3e8,
    fog: 0xa8c8a0,
    fogDensity: 0.0016,
    ground: 0x77b255,
    seed: 10101,
    tex: 'grass',
    groundAmp: 2.2,
    worldRadius: 340,
    boundsRadius: 340,
    ambientRadius: 150,
    horizon: { style: 'hills', radius: 430, count: 16, color: 0x6da352 },
    scatter: [
      { kind: 'oak-tree', count: 90, minR: 20, maxR: 300, size: [1.4, 2.6] },
      { kind: 'garden-tree', count: 40, minR: 16, maxR: 200, size: [1, 2] },
      { kind: 'bush', count: 120, minR: 10, maxR: 300, size: [0.7, 1.6] },
      { kind: 'rock', count: 40, minR: 30, maxR: 300, size: [0.7, 2] },
    ],
    landmarks: [
      { type: 'hobbit-hole', x: -30, z: 60, s: 1, ry: 0.5, model: 'hobbit-hole' },
      { type: 'roadside-inn', x: 55, z: -35, s: 1, ry: -0.7, model: 'roadside-inn' },
      { type: 'shire-mound', x: -90, z: -60, s: 1.2, ry: 0.2 },
      { type: 'shire-mound', x: 95, z: 80, s: 1, ry: 1.9 },
      { type: 'party-tree', x: -8, z: 18, s: 1.6, ry: 0 },
    ],
    characters: [
      { id: 'halfling', model: 'halfling', name: 'A Halfling of the Shire', at: [-24, 52], faceYaw: 2.6, height: 1.15 },
      { id: 'wizard', model: 'wizard', name: 'The Grey Pilgrim', at: [6, 74], faceYaw: -2.2, height: 1.9 },
    ],
    orcs: { camps: 3, campSize: [2, 3], rovers: 4, captainChance: 0, respawnS: 60 },
    missions: [
      {
        id: 'shire-leave',
        title: 'Leave the Shire',
        text: 'The road runs east past the last fence and into the unknown. Pack light and keep walking.',
        objective: 'Reach the East Road gate',
        difficulty: 1,
        par: 180,
        checkpoints: [
          { x: -10, z: 40, r: 8, label: 'Bag End Lane' },
          { x: 60, z: -10, r: 8, label: 'Bywater' },
        ],
        target: { x: 150, z: -60, r: 10, label: 'East Road Gate' },
      },
      {
        id: 'shire-trouble',
        title: 'Trouble at Bywater',
        text: 'Orcs in the Shire — it should be impossible, yet here they are, skulking between the hedgerows. Drive them out.',
        objective: 'Hunt 3 orcs in the Shire',
        difficulty: 2,
        par: 300,
        hunt: { count: 3 },
      },
      {
        id: 'shire-stock-road',
        title: 'The Stock Road',
        text: 'A cart track winds south through the woods to Stock. Walk it end to end before the light goes.',
        objective: 'Walk the Stock Road south',
        difficulty: 1,
        par: 240,
        checkpoints: [
          { x: 20, z: 110, r: 8, label: 'Woodhall Turn' },
          { x: -40, z: 170, r: 8, label: 'The Ferry Lane' },
        ],
        target: { x: -110, z: 210, r: 10, label: 'Stock' },
      },
    ],
  },

  rivendell: {
    id: 'rivendell',
    name: 'Rivendell',
    kind: 'walk',
    biome: 'valley',
    color: 0x5fb89a,
    sky: 0xa8d8e8,
    fog: 0x9fc8b8,
    fogDensity: 0.002,
    ground: 0x5f9e72,
    seed: 20202,
    tex: 'grass',
    groundAmp: 3,
    worldRadius: 340,
    boundsRadius: 340,
    ambientRadius: 150,
    /* The Bruinen gorge cuts the valley floor west to east. */
    canyon: {
      width: 22, depth: 5,
      path: [[-260, 40], [-150, 10], [-40, -20], [60, -35], [170, -10], [260, 30]],
    },
    horizon: { style: 'peaks', radius: 430, count: 18, color: 0x7fa8a0 },
    scatter: [
      { kind: 'pine-tree', count: 110, minR: 24, maxR: 300, size: [1.6, 3] },
      { kind: 'oak-tree', count: 40, minR: 20, maxR: 260, size: [1.4, 2.4] },
      { kind: 'rock', count: 70, minR: 16, maxR: 300, size: [0.8, 2.6] },
      { kind: 'bush', count: 60, minR: 12, maxR: 280, size: [0.7, 1.4] },
    ],
    landmarks: [
      { type: 'elven-pavilion', x: -20, z: -70, s: 1, ry: 0.3, model: 'elven-pavilion' },
      { type: 'elven-arch', x: 40, z: -52, s: 1.1, ry: 0.3 },
      { type: 'ford-stones', x: -40, z: -18, s: 1, ry: 0.1 },
      { type: 'watch-rock', x: 150, z: 90, s: 1.3, ry: 0.8 },
    ],
    characters: [
      { id: 'elf-archer', model: 'elf-archer', name: 'An Elf of the Valley', at: [-14, -62], faceYaw: 2.9, height: 1.9 },
      { id: 'ranger', model: 'ranger', name: 'A Ranger of the North', at: [30, -44], faceYaw: -1.4, height: 1.85 },
      { id: 'eagle', model: 'eagle', name: 'A Great Eagle', at: [150, 96], faceYaw: 0.7, height: 2.6, creature: true },
    ],
    orcs: { camps: 4, campSize: [2, 4], rovers: 6, captainChance: 0.25, respawnS: 55 },
    missions: [
      {
        id: 'rivendell-council',
        title: 'The Council Terrace',
        text: 'Voices gather on the terrace above the gorge to decide what must be done. Listen, then accept the task.',
        objective: 'Attend the council on the terrace',
        difficulty: 1,
        par: 200,
        checkpoints: [
          { x: -6, z: -40, r: 8, label: 'The Last Homely House' },
        ],
        target: { x: -20, z: -70, r: 10, label: 'Council Terrace' },
      },
      {
        id: 'rivendell-ford',
        title: 'The Ford of Bruinen',
        text: 'The river road runs the length of the gorge. Walk it end to end, from the west falls to the east shallows.',
        objective: 'Traverse the Bruinen gorge',
        difficulty: 2,
        par: 300,
        checkpoints: [
          { x: -150, z: 8, r: 8, label: 'West Falls' },
          { x: -40, z: -20, r: 8, label: 'The Ford' },
          { x: 60, z: -34, r: 8, label: 'Mid Gorge' },
        ],
        target: { x: 170, z: -10, r: 10, label: 'East Shallows' },
      },
      {
        id: 'rivendell-wargs',
        title: 'Wolves on the Border',
        text: 'Orc raiders probe the valley borders under cover of the pines. Find their bands and end the probing.',
        objective: 'Hunt 4 orcs in Rivendell',
        difficulty: 2,
        par: 360,
        hunt: { count: 4 },
      },
    ],
  },

  rohan: {
    id: 'rohan',
    name: 'Rohan',
    kind: 'walk',
    biome: 'plains',
    color: 0xa9c46a,
    sky: 0xaed8f0,
    fog: 0xc4cf92,
    fogDensity: 0.0014,
    ground: 0xa9c46a,
    seed: 30303,
    tex: 'grass',
    groundAmp: 3.2,
    worldRadius: 340,
    boundsRadius: 340,
    ambientRadius: 160,
    horizon: { style: 'hills', radius: 440, count: 18, color: 0x9ab45e },
    scatter: [
      { kind: 'grass-tuft', count: 200, minR: 8, maxR: 300, size: [0.8, 1.8] },
      { kind: 'rock', count: 50, minR: 24, maxR: 300, size: [0.8, 2.4] },
      { kind: 'oak-tree', count: 24, minR: 40, maxR: 280, size: [1.4, 2.4] },
    ],
    landmarks: [
      { type: 'rohan-hall', x: 30, z: -40, s: 1.2, ry: 0.4 },
      { type: 'ruined-watchtower', x: 130, z: 60, s: 1, ry: 1.2, model: 'ruined-watchtower' },
      { type: 'beacon-pyre', x: 168, z: 16, s: 1, ry: 0 },
      /* ISENGARD — the vale at the pod's south-western edge: a ring
       * wall around a black tower. The campaign finale lives here
       * (boss.js). The tower is procedural — no Orthanc construct
       * came out of the foundry — and proud of it. */
      { type: 'orthanc', x: -215, z: 175, s: 1, ry: 0.78 },
      { type: 'isengard-ring', x: -215, z: 175, s: 1, ry: 0 },
    ],
    characters: [
      { id: 'horse', model: 'horse', name: 'A Horse of the Mark', at: [52, -22], faceYaw: 1.1, height: 2.2, creature: true },
      { id: 'warg', model: 'warg', name: 'A Warg of the Wilds', at: [-120, -120], faceYaw: 2.4, height: 1.7, creature: true },
    ],
    orcs: { camps: 7, campSize: [3, 5], rovers: 10, captainChance: 0.3, respawnS: 45 },
    missions: [
      {
        id: 'rohan-golden-hall',
        title: 'The Golden Hall',
        text: 'Riders sweep across the grass to a hill crowned with a golden roof. There you will be heard.',
        objective: 'Enter the hall at Edoras',
        difficulty: 1,
        par: 200,
        checkpoints: [
          { x: 10, z: 10, r: 8, label: 'The Barrowfield' },
        ],
        target: { x: 30, z: -40, r: 11, label: 'Edoras' },
      },
      {
        id: 'rohan-beacon',
        title: 'Light the Beacon',
        text: 'The watchtower pyre stands ready on the eastern rise. Reach it, by the fastest line the grass allows.',
        objective: 'Reach the beacon pyre past the watchtower',
        difficulty: 2,
        par: 280,
        checkpoints: [
          { x: 130, z: 58, r: 9, label: 'The Watchtower' },
        ],
        target: { x: 168, z: 16, r: 9, label: 'Beacon Pyre' },
      },
      {
        id: 'rohan-westfold',
        title: 'The Westfold Burns',
        text: 'Orc war-bands pour over the plains, burning as they go. Break them — six kills, and the Mark breathes again.',
        objective: 'Hunt 6 orcs in Rohan',
        difficulty: 3,
        par: 420,
        hunt: { count: 6 },
      },
    ],
  },

  gondor: {
    id: 'gondor',
    name: 'The White City of Gondor',
    kind: 'walk',
    biome: 'stone',
    color: 0xd8d2c2,
    sky: 0xbcd4e8,
    fog: 0xcfd4c8,
    fogDensity: 0.0015,
    ground: 0xb9ac8e,
    seed: 40404,
    tex: 'stone',
    groundAmp: 3,
    worldRadius: 340,
    boundsRadius: 340,
    ambientRadius: 150,
    horizon: { style: 'peaks', radius: 440, count: 16, color: 0xa8b0a4 },
    scatter: [
      { kind: 'white-column', count: 46, minR: 30, maxR: 260, size: [1, 1.8] },
      { kind: 'garden-tree', count: 50, minR: 20, maxR: 280, size: [1, 2] },
      { kind: 'rock', count: 46, minR: 24, maxR: 300, size: [0.8, 2.4] },
      { kind: 'bush', count: 50, minR: 12, maxR: 280, size: [0.7, 1.4] },
    ],
    landmarks: [
      { type: 'citadel', x: 0, z: -120, s: 1, ry: 0, model: 'citadel' },
      { type: 'gondor-tower', x: -70, z: -60, s: 1.1, ry: 0.5 },
      { type: 'gondor-tower', x: 74, z: -62, s: 1.1, ry: -0.4 },
      { type: 'white-tree', x: 0, z: -78, s: 1.2, ry: 0 },
      { type: 'city-gate', x: 0, z: 40, s: 1.2, ry: 0 },
      { type: 'dwarf-forge', x: 30, z: -60, s: 1, ry: -0.3 },
    ],
    characters: [
      { id: 'dwarf', model: 'dwarf', name: 'A Dwarf of Erebor', at: [10, -66], faceYaw: 3.0, height: 1.35 },
    ],
    orcs: { camps: 5, campSize: [3, 4], rovers: 8, captainChance: 0.3, respawnS: 50 },
    missions: [
      {
        id: 'gondor-citadel',
        title: 'The White City',
        text: 'Seven circles of stone rise against the mountain. Climb through the gate to the citadel court and stand where the stewards stood.',
        objective: 'Reach the citadel court',
        difficulty: 1,
        par: 240,
        checkpoints: [
          { x: 0, z: 38, r: 9, label: 'The Great Gate' },
          { x: 0, z: -76, r: 9, label: 'The White Tree' },
        ],
        target: { x: 0, z: -116, r: 11, label: 'Citadel Court' },
      },
      {
        id: 'gondor-beacons',
        title: 'Beacons of Gondor',
        text: 'From tower to tower the signal fires wait. Run the line of the walls and light the way for Rohan.',
        objective: 'Run the wall line between the towers',
        difficulty: 2,
        par: 300,
        checkpoints: [
          { x: -70, z: -58, r: 9, label: 'West Tower' },
          { x: 0, z: -100, r: 9, label: 'The High Wall' },
        ],
        target: { x: 74, z: -60, r: 9, label: 'East Tower' },
      },
      {
        id: 'gondor-pelennor',
        title: 'Orcs on the Pelennor',
        text: 'The enemy tests the fields before the walls. Six orcs dead on the Pelennor sends the message back east.',
        objective: 'Hunt 6 orcs before the White City',
        difficulty: 3,
        par: 420,
        hunt: { count: 6 },
      },
    ],
  },

  mirkwood: {
    id: 'mirkwood',
    name: 'Mirkwood',
    kind: 'walk',
    biome: 'forest',
    color: 0x3e7a44,
    sky: 0x6f9a72,
    fog: 0x2e5233,
    fogDensity: 0.0042,
    ground: 0x39543c,
    seed: 50505,
    tex: 'forest',
    groundAmp: 2.6,
    worldRadius: 340,
    boundsRadius: 340,
    ambientRadius: 150,
    horizon: { style: 'trees', radius: 420, count: 22, color: 0x2c5a30 },
    scatter: [
      { kind: 'dark-pine', count: 190, minR: 14, maxR: 300, size: [1.8, 3.4] },
      { kind: 'swamp-tree', count: 60, minR: 20, maxR: 300, size: [1.6, 3] },
      { kind: 'undergrowth', count: 120, minR: 8, maxR: 300, size: [0.8, 1.8] },
      { kind: 'rock', count: 40, minR: 20, maxR: 300, size: [0.7, 2.2] },
    ],
    landmarks: [
      { type: 'elf-path-arch', x: -60, z: 30, s: 1.2, ry: 0.9 },
      { type: 'spider-hollow', x: 40, z: -50, s: 1.2, ry: 0 },
      { type: 'elf-path-arch', x: 120, z: 60, s: 1.2, ry: -0.6 },
    ],
    characters: [
      { id: 'elf-warden', model: 'elf-archer', name: 'A Warden of the Woodland Realm', at: [-52, 22], faceYaw: 1.8, height: 1.9 },
    ],
    orcs: { camps: 6, campSize: [3, 5], rovers: 9, captainChance: 0.35, respawnS: 45 },
    missions: [
      {
        id: 'mirkwood-elf-path',
        title: 'The Elf Path',
        text: 'The old path fades between the trunks, and the shadows watch. Do not leave the trail.',
        objective: 'Follow the elf path through the wood',
        difficulty: 2,
        par: 320,
        checkpoints: [
          { x: -60, z: 28, r: 8, label: 'Path Arch' },
          { x: 10, z: -6, r: 8, label: 'The Dark Crossing' },
          { x: 62, z: 30, r: 8, label: 'Spider Hollow Edge' },
        ],
        target: { x: 120, z: 60, r: 10, label: 'Far Arch' },
      },
      {
        id: 'mirkwood-spiders',
        title: 'The Spider Hollow',
        text: 'Something nests in the hollow and the orcs feed it their leavings. Clear the hollow approach, ring by ring.',
        objective: 'Reach the heart of the spider hollow',
        difficulty: 2,
        par: 260,
        checkpoints: [
          { x: 24, z: -28, r: 8, label: 'Webbed Trees' },
        ],
        target: { x: 40, z: -50, r: 10, label: 'The Hollow' },
      },
      {
        id: 'mirkwood-raiders',
        title: 'Drive Out the Raiders',
        text: 'A raiding party camps somewhere under the eaves, growing bold. Five kills scatters them back to Dol Guldur.',
        objective: 'Hunt 5 orcs in Mirkwood',
        difficulty: 3,
        par: 420,
        hunt: { count: 5 },
      },
    ],
  },

  mordor: {
    id: 'mordor',
    name: 'Mordor',
    kind: 'walk',
    biome: 'ash',
    color: 0x5c564f,
    sky: 0x8a6a58,
    fog: 0x6b5546,
    fogDensity: 0.0026,
    ground: 0x554e47,
    seed: 60606,
    tex: 'ash',
    groundAmp: 4.2,
    worldRadius: 340,
    boundsRadius: 340,
    ambientRadius: 160,
    canyon: {
      width: 20, depth: 7,
      path: [[-40, 240], [-10, 150], [30, 60], [10, -30], [50, -120], [30, -210]],
    },
    horizon: { style: 'spires', radius: 440, count: 20, color: 0x3a332e },
    scatter: [
      { kind: 'lava-rock', count: 130, minR: 14, maxR: 300, size: [0.9, 3] },
      { kind: 'obsidian', count: 70, minR: 20, maxR: 300, size: [1.4, 3] },
      { kind: 'dead-tree', count: 40, minR: 24, maxR: 300, size: [1.4, 2.6] },
      { kind: 'ash-drift', count: 80, minR: 10, maxR: 300, size: [1, 2.4] },
    ],
    landmarks: [
      { type: 'black-gate', x: 30, z: -235, s: 1, ry: 0.1, model: 'black-gate' },
      { type: 'mount-doom', x: 200, z: 140, s: 1.4, ry: 0 },
      { type: 'dark-tower', x: -170, z: -140, s: 1.2, ry: 0.6 },
    ],
    characters: [
      { id: 'dark-lord', model: 'dark-lord', name: 'The Dark Lord', at: [-158, -128], faceYaw: 0.8, height: 2.3 },
      { id: 'fell-beast', model: 'fell-beast', name: 'A Fell Beast', at: [60, -190], faceYaw: 2.2, height: 3.4, creature: true },
      { id: 'dragon', model: 'dragon', name: 'A Dragon of the Wastes', at: [-90, 150], faceYaw: -0.9, height: 4.2, creature: true },
    ],
    orcs: { camps: 8, campSize: [3, 5], rovers: 12, captainChance: 0.4, respawnS: 40 },
    missions: [
      {
        id: 'mordor-black-gate',
        title: 'The Black Gate',
        text: 'The gate is shut, and will stay shut — but stand before it, and let the watchers on the wall know you came.',
        objective: 'Stand before the Black Gate',
        difficulty: 2,
        par: 300,
        checkpoints: [
          { x: 28, z: -120, r: 9, label: 'The Ash Road' },
        ],
        target: { x: 30, z: -224, r: 11, label: 'The Black Gate' },
      },
      {
        id: 'mordor-ash-plain',
        title: 'The Ash Plain',
        text: 'Gorgoroth crawls with patrols. Six kills on the ash plain, and even the patrols start looking over their shoulders.',
        objective: 'Hunt 6 orcs on the ash plain',
        difficulty: 3,
        par: 420,
        hunt: { count: 6 },
      },
      {
        id: 'mordor-fire',
        title: 'The Fire',
        text: 'The last climb is ash and heat, and the door of the mountain stands open. Finish the road.',
        objective: 'Reach the shoulder of Mount Doom',
        difficulty: 3,
        par: 380,
        checkpoints: [
          { x: 120, z: 90, r: 9, label: 'The Lava Fields' },
        ],
        target: { x: 192, z: 128, r: 11, label: 'Mount Doom Shoulder' },
      },
    ],
  },
};

/* The journey order on the map — west to east, as it should be. */
export const POD_ORDER = ['shire', 'rivendell', 'rohan', 'gondor', 'mirkwood', 'mordor'];

export function podDef(id) {
  return PODS[id] || null;
}

/* The first mission of each pod doubles as its "beat" (the SW
 * convention): completing it marks the pod on the campaign card. */
export function firstMissionOf(podId) {
  const def = PODS[podId];
  if (!def || !Array.isArray(def.missions) || !def.missions.length) return null;
  return def.missions[0];
}

/* ---------------- progress (missions) ----------------
 * Kept in the SW shape: { beatsDone: {podId}, missionsDone: {podId:
 * {missionId: true}}, chaptersDone: {} (unused here — every pod is
 * open from the start; the road west-to-east is a suggestion, not a
 * lock). The legacy strip-world progress ({beatsDone:{questId}})
 * migrates harmlessly: unknown keys are simply never read. */

export function createProgress() {
  return { beatsDone: {}, missionsDone: {}, chaptersDone: {}, hero: DEFAULT_HERO };
}

/* The player's chosen hero (the fellowship pick, characters.js
 * PLAYABLE). Persisted in the same progress store as the pod
 * progress; an unknown stored value falls back to the default. */
export function heroOf(progress) {
  const h = progress && progress.hero;
  return h && PLAYABLE[h] ? h : DEFAULT_HERO;
}

export function setHero(progress, key) {
  const base = progress && typeof progress === 'object' ? progress : createProgress();
  return { ...base, hero: PLAYABLE[key] ? key : DEFAULT_HERO };
}

export function isMissionDone(progress, podId, mission) {
  if (!progress || !mission) return false;
  const mid = typeof mission === 'string' ? mission : mission.id;
  const byPod = progress.missionsDone && progress.missionsDone[podId];
  if (byPod && byPod[mid]) return true;
  // the pod's first mission also reads off beatsDone (SW fallback)
  const first = firstMissionOf(podId);
  if (first && first.id === mid && progress.beatsDone && progress.beatsDone[podId]) return true;
  return false;
}

export function podMissionsDone(progress, podId) {
  const def = PODS[podId];
  if (!def) return 0;
  return (def.missions || []).filter((m) => isMissionDone(progress, podId, m)).length;
}

export function completeMission(progress, podId, missionId) {
  const base = progress && typeof progress === 'object' ? progress : createProgress();
  const missionsDone = { ...(base.missionsDone || {}) };
  missionsDone[podId] = { ...(missionsDone[podId] || {}), [missionId]: true };
  const next = { ...base, missionsDone };
  const first = firstMissionOf(podId);
  if (first && first.id === missionId) {
    next.beatsDone = { ...(base.beatsDone || {}), [podId]: true };
  }
  return next;
}

export function loadProgress() {
  try {
    if (typeof localStorage === 'undefined') return createProgress();
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return createProgress();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createProgress();
    return {
      beatsDone: parsed.beatsDone && typeof parsed.beatsDone === 'object' ? parsed.beatsDone : {},
      missionsDone: parsed.missionsDone && typeof parsed.missionsDone === 'object' ? parsed.missionsDone : {},
      chaptersDone: parsed.chaptersDone && typeof parsed.chaptersDone === 'object' ? parsed.chaptersDone : {},
      hero: parsed.hero && PLAYABLE[parsed.hero] ? parsed.hero : DEFAULT_HERO,
    };
  } catch {
    return createProgress();
  }
}

export function saveProgress(p) {
  try {
    if (typeof localStorage === 'undefined') return;
    const value = p && typeof p === 'object' ? p : createProgress();
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(value));
  } catch {
    // storage unavailable — progress just won't persist this session
  }
}

export default { PODS, POD_ORDER, SARUMAN_GATE_KILLS, DIFFICULTY_LABELS };
