// OLYMPIAN MONSTERVERSE — content data layer (pure module).
//
// ONE ever-expansive world, not pods: a single 600 m disc whose
// eight habitat bands blend into each other (biomes.js). Modes follow
// the saga contract — on entry the player picks 🎯 Missions or
// 🧭 Free Roam; roam writes no mission progress (kills still
// count toward the realm's kill rewards — the hunt is the loop
// in both modes).
//
// THE CAMPAIGN SPINE (Merlin's words: hunt monsters, and the
// monsters hunt you): kills persist in the campaign record and
// feed the realm rules — +12 HP per kill (spawns.js
// HEAL_ON_KILL), a 50-absorb shield at 30 kills
// (SHIELD_KILLS/SHIELD_ABSORB), and the finale — Korus on his
// throne in the Shadow Smoke Wastes — unlocks at
// KORUS_GATE_KILLS campaign kills. Death respawns at The Haven
// with full HP, kills and shield kept (spawns.js judgment call).
// Logging off anywhere returns the hunter to The Haven on next
// entry: the realm's return point, persisted here.

import { DEFAULT_HERO, HEROES } from './characters.js';
import { KORUS_GATE_KILLS } from './spawns.js';
import { addItem } from '../../lib/backpack/backpack.js';

export const PROGRESS_KEY = 'olympus:hollowearth:progress';
export const CAMPAIGN_KEY = 'olympus:hollowearth:campaign';
export const DIFFICULTY_LABELS = { 1: 'Story', 2: 'Standard', 3: 'Heroic' };

export const WORLD = {
  id: 'monsterverse',
  name: 'Olympian Monsterverse',
  kind: 'walk',
  seed: 77701,
  groundAmp: 3.4,
  // Full-world sphere (2026-11-16): 600 m of ground pole to
  // equator (SPHERE_R 382), the walker never clamped — on an
  // inner sphere there is no edge, no rim, no wall to hit, so
  // there is no boundsRadius any more (the disc's 550 m clamp
  // retired with the disc; Merlin Nov 16 ~02:42: no motion
  // walls, and the honest circle clamp is NOT to be rebuilt).
  // Every old anchor and landmark is interior, nothing moved.
  worldRadius: 600,
  ambientRadius: 150,
  sky: 0x2a1e3f, // inner-world dusk under the core-sun
  fog: 0x3a2f4a,
  fogDensity: 0.0016,
  spawn: { x: 0, z: 95 },
  landmarks: [
    { type: 'haven', x: 0, z: 155, s: 1, ry: 0 }, // The Haven, the safe base
    { type: 'intro-arch', x: 30, z: 140, s: 1, ry: 0.3 },
    { type: 'ooze-pool', x: -160, z: 40, s: 1.2, ry: 0 },
    { type: 'ooze-pool', x: -120, z: 90, s: 0.9, ry: 1.1 },
    { type: 'ember-spire', x: 160, z: -60, s: 1.1, ry: 0 },
    { type: 'ember-spire', x: 120, z: -110, s: 0.9, ry: 0.7 },
    { type: 'storm-pylon', x: -70, z: -170, s: 1, ry: 0 },
    { type: 'storm-pylon', x: -20, z: -200, s: 1.1, ry: 0.4 },
    { type: 'mire-arch', x: 180, z: 110, s: 1, ry: -0.4 },
    { type: 'gloom-monolith', x: -190, z: -20, s: 1.2, ry: 0.2 },
    { type: 'gloom-monolith', x: -150, z: -80, s: 1, ry: 0.9 },
    { type: 'wreck-hulk', x: 60, z: 190, s: 1.3, ry: 0.5 },
    { type: 'wreck-hulk', x: 110, z: 210, s: 1, ry: -0.6 },
    { type: 'peak-shrine', x: 210, z: -150, s: 1.1, ry: 0 },
    { type: 'frost-spire', x: -230, z: 130, s: 1.1, ry: 0 },
    { type: 'frost-spire', x: -195, z: 175, s: 1, ry: 0.6 },
    { type: 'korus-throne', x: -215, z: 55, s: 1, ry: 0.4 },
    // G-10 (court approach ONLY — never the throne): two emissive
    // braziers flanking the court, 18 m from the throne centre —
    // outside the throne's 10 m collider, outside the 12 m
    // Throne Road target radius, and clear of every other
    // landmark (nearest is the monolith row, 60+ m away).
    { type: 'court-brazier', x: -205, z: 40, s: 1, ry: 0 },
    { type: 'court-brazier', x: -205, z: 70, s: 1, ry: 0 },
  ],
  scatter: [
    { kind: 'ooze-bubble', count: 60, minR: 20, maxR: 540, size: [0.6, 1.4], biome: 'acid' },
    { kind: 'ember-rock', count: 70, minR: 20, maxR: 540, size: [0.8, 2.4], biome: 'fire' },
    { kind: 'storm-crystal', count: 60, minR: 20, maxR: 540, size: [0.8, 2], biome: 'lightning' },
    // G-06 (2026-11-16, Merlin: Poison Groves YES, a deliberate
    // spore garden): 110 caps — denser than the other bands'
    // 50–70, but still one mesh each, so +50 draw calls on a
    // ~480-mesh scatter budget. The band stays monster-free
    // until poison GLBs land; the garden is the dressing.
    { kind: 'spore-cap', count: 110, minR: 20, maxR: 540, size: [0.7, 1.6], biome: 'poison' },
    { kind: 'gloom-pillar', count: 50, minR: 20, maxR: 540, size: [1, 2.6], biome: 'shadow' },
    { kind: 'dune-bone', count: 70, minR: 20, maxR: 540, size: [0.8, 2.2], biome: 'sand' },
    { kind: 'peak-rock', count: 60, minR: 20, maxR: 540, size: [1, 3], biome: 'mountain' },
    { kind: 'frost-shard', count: 50, minR: 20, maxR: 540, size: [0.8, 2.2], biome: 'frost' },
  ],
};

/* Three clusters, 2–3 starter missions each — missions are
 * per cluster, not per habitat, so a hunt crosses blend bands.
 * Cluster bands follow the monster-first habitats: the Wilds
 * hold the ooze and poison families, the Stormlands the ember
 * and storm families, the Dark Reaches the gloom, dune and
 * frozen families — and at the far edge, a throne. */
export const CLUSTERS = {
  wilds: {
    id: 'wilds', name: 'The Wilds', biomes: ['acid', 'poison'],
    blurb: 'Ooze pools and poison groves — the hunt starts where the ground hisses.',
    missions: [
      {
        id: 'wilds-ooze-crossing', title: 'Cross the Ooze', difficulty: 1, par: 240,
        text: 'The acid flats bubble between you and the far pools. Cross them, pool to pool, without lingering.',
        objective: 'Reach the far ooze pools',
        checkpoints: [{ x: -140, z: 60, r: 9, label: 'First Pools' }],
        target: { x: -120, z: 90, r: 10, label: 'Far Pools' },
      },
      {
        id: 'wilds-mire-hunt', title: 'Hunt the Mire', difficulty: 2, par: 360,
        text: 'Four monsters prowl the wilds. The realm pays in health for every kill — hunt well.',
        objective: 'Hunt 4 monsters in the Wilds',
        hunt: { count: 4 },
      },
    ],
  },
  stormlands: {
    id: 'stormlands', name: 'The Stormlands', biomes: ['fire', 'lightning', 'mountain'],
    blurb: 'Ember fields and storm ridges — fast monsters, faster sky.',
    missions: [
      {
        id: 'stormlands-pylon-run', title: 'The Pylon Run', difficulty: 2, par: 300,
        text: 'Two storm pylons stand on the plains, crackling. Run the line between them under the storm.',
        objective: 'Run the pylon line',
        checkpoints: [{ x: -70, z: -170, r: 9, label: 'First Pylon' }],
        target: { x: -20, z: -200, r: 10, label: 'Far Pylon' },
      },
      {
        id: 'stormlands-storm-hunt', title: 'Storm Hunt', difficulty: 3, par: 420,
        text: 'Five monsters ride the storm. Bring the count, and the shield draws closer.',
        objective: 'Hunt 5 monsters in the Stormlands',
        hunt: { count: 5 },
      },
    ],
  },
  'dark-reaches': {
    id: 'dark-reaches', name: 'The Dark Reaches', biomes: ['shadow', 'sand', 'frost'],
    blurb: 'Gloom, dunes, frozen rim — and at the far edge, a throne.',
    missions: [
      {
        id: 'dark-wreck-field', title: 'The Wreck Field', difficulty: 2, par: 300,
        text: 'Old wreckage litters the dunes. Walk the field end to end, past both hulks.',
        objective: 'Cross the wreck field',
        checkpoints: [{ x: 60, z: 190, r: 9, label: 'First Hulk' }],
        target: { x: 110, z: 210, r: 10, label: 'Far Hulk' },
      },
      {
        id: 'dark-gloom-hunt', title: 'Gloom Hunt', difficulty: 3, par: 420,
        text: 'Six monsters in the gloom and dunes. The road to Korus is paved in kills.',
        objective: 'Hunt 6 monsters in the Dark Reaches',
        hunt: { count: 6 },
      },
      {
        id: 'dark-korus-approach', title: 'The Throne Road', difficulty: 3, par: 400,
        text: 'Stand in the court before the throne. Korus himself waits behind the gate — this is the road, not the fight.',
        objective: 'Stand before Korus’s throne',
        checkpoints: [{ x: -190, z: -20, r: 9, label: 'Monolith Row' }],
        target: { x: -215, z: 55, r: 12, label: 'Korus’s Court' },
      },
    ],
  },
};

export const CLUSTER_ORDER = ['wilds', 'stormlands', 'dark-reaches'];

export function clusterDef(id) {
  return CLUSTERS[id] || null;
}

export function firstMissionOf(clusterId) {
  const def = CLUSTERS[clusterId];
  if (!def || !def.missions.length) return null;
  return def.missions[0];
}

/* The intro panel: gold lettering over a desert battlefield
 * with elemental orbs — built procedurally in page.jsx (text +
 * gradients + orb motifs). NOTE for the parent: Merlin's
 * uploaded banner file (Monster Graphics slot 4, "OLYMPIAN
 * MONSTERVERSE" over a desert battlefield) could serve as this
 * intro image instead — but user uploads are NOT copied into
 * the repo without his say-so, so that swap is flagged as an
 * option, not done here. */
export const INTRO = {
  title: 'OLYMPIAN MONSTERVERSE',
  tagline: 'The world inside the world — ever-expanding.',
  orbs: [
    { element: 'acid', color: '#8fd43a' },
    { element: 'fire', color: '#ff6a22' },
    { element: 'lightning', color: '#ffe14d' },
    { element: 'poison', color: '#c06ae0' },
    { element: 'shadow', color: '#8a8a9a' },
    { element: 'sand', color: '#e8c87a' },
    { element: 'frost', color: '#9fd8e8' },
  ],
};

/* ---------------- progress + campaign ----------------
 * progress: { beatsDone, missionsDone, hero } — the ME shape.
 * campaign: { kills, shield, korusDone, korusAt } — the realm's
 * kill record. The shield value persists so a granted shield
 * survives a session; kills never reset. */
export function createProgress() {
  return { beatsDone: {}, missionsDone: {}, hero: DEFAULT_HERO, visited: false };
}

/* The return-point rule: the first entry spawns on the arrival
 * ground; every later entry returns the hunter to The Haven
 * (the safe base), wherever they logged off. */
export function entrySpawn(progress) {
  return progress && progress.visited ? { x: 0, z: 155 } : { x: 0, z: 95 };
}

export function markVisited(progress) {
  const base = progress && typeof progress === 'object' ? progress : createProgress();
  return { ...base, visited: true };
}

export function heroOf(progress) {
  const h = progress && progress.hero;
  return h && HEROES[h] ? h : DEFAULT_HERO;
}

export function setHero(progress, key) {
  const base = progress && typeof progress === 'object' ? progress : createProgress();
  return { ...base, hero: HEROES[key] ? key : DEFAULT_HERO };
}

export function isMissionDone(progress, clusterId, mission) {
  if (!progress || !mission) return false;
  const mid = typeof mission === 'string' ? mission : mission.id;
  const byCluster = progress.missionsDone && progress.missionsDone[clusterId];
  if (byCluster && byCluster[mid]) return true;
  const first = firstMissionOf(clusterId);
  if (first && first.id === mid && progress.beatsDone && progress.beatsDone[clusterId]) return true;
  return false;
}

export function clusterMissionsDone(progress, clusterId) {
  const def = CLUSTERS[clusterId];
  if (!def) return 0;
  return (def.missions || []).filter((m) => isMissionDone(progress, clusterId, m)).length;
}

export function completeMission(progress, clusterId, missionId) {
  const base = progress && typeof progress === 'object' ? progress : createProgress();
  const missionsDone = { ...(base.missionsDone || {}) };
  missionsDone[clusterId] = { ...(missionsDone[clusterId] || {}), [missionId]: true };
  const next = { ...base, missionsDone };
  const first = firstMissionOf(clusterId);
  if (first && first.id === missionId) {
    next.beatsDone = { ...(base.beatsDone || {}), [clusterId]: true };
  }
  return next;
}

export function createCampaign() {
  return { kills: 0, shield: 0, korusDone: false, korusAt: null };
}

export function gateOpen(campaign) {
  return (campaign && campaign.kills >= KORUS_GATE_KILLS) || false;
}

export function gateProgress(campaign) {
  const kills = campaign ? campaign.kills : 0;
  return { kills, needed: KORUS_GATE_KILLS, remaining: Math.max(0, KORUS_GATE_KILLS - kills) };
}

export function recordKill(campaign) {
  const base = campaign && typeof campaign === 'object' ? campaign : createCampaign();
  return { ...base, kills: base.kills + 1 };
}

export function setShield(campaign, shield) {
  const base = campaign && typeof campaign === 'object' ? campaign : createCampaign();
  return { ...base, shield };
}

export function completeKorus(campaign, atMs) {
  const base = campaign && typeof campaign === 'object' ? campaign : createCampaign();
  return { ...base, korusDone: true, korusAt: atMs || Date.now() };
}

export const KORUS_REWARD = {
  id: 'korus-stormfang', name: "Korus's Stormfang", kind: 'weapon',
  weaponClass: 'blade', damage: 40, rarity: 'legendary',
  meta: { source: 'monsterverse', boss: 'korus' },
};

export function rewardItemInput() {
  return {
    id: KORUS_REWARD.id, kind: 'weapon', name: KORUS_REWARD.name, qty: 1,
    meta: { weaponClass: KORUS_REWARD.weaponClass, source: 'monsterverse-finale', rarity: 'legendary' },
  };
}

/* Fold the Korus reward into a backpack record (the ME pattern:
 * addItem stamps the class reticle from the law). */
export function applyRewardToRecord(record) {
  return addItem(record, rewardItemInput(), 1);
}

function loadJson(key, fallback) {
  try {
    if (typeof localStorage === 'undefined') return fallback();
    const raw = localStorage.getItem(key);
    if (!raw) return fallback();
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback();
  } catch {
    return fallback();
  }
}

export function loadProgress() {
  const p = loadJson(PROGRESS_KEY, createProgress);
  return {
    beatsDone: p.beatsDone || {},
    missionsDone: p.missionsDone || {},
    hero: p.hero && HEROES[p.hero] ? p.hero : DEFAULT_HERO,
    visited: !!p.visited,
  };
}

export function saveProgress(p) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch { /* storage unavailable — progress just won't persist */ }
}

export function loadCampaign() {
  const c = loadJson(CAMPAIGN_KEY, createCampaign);
  return {
    kills: c.kills || 0,
    shield: c.shield || 0,
    korusDone: !!c.korusDone,
    korusAt: c.korusAt || null,
  };
}

export function saveCampaign(c) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(c));
  } catch { /* see above */ }
}

export default { WORLD, CLUSTERS, CLUSTER_ORDER, INTRO, KORUS_GATE_KILLS };
