// lib/myriad-wonders.js — MYRIAD extra sites: new wonders + things to find.
//
// Everything here is ADDITIVE and deterministic. The 100 universe
// descriptors in lib/myriad-universes.js are never touched, and the
// primary anomaly of a universe (from sceneFor) never moves: these
// sites are derived from the universe seed on independent streams, and
// positions are nudged away from the primary anomaly so sites stay
// distinct. Same seed -> same sites, forever.
//
// Two groups:
//   wonders — new anomaly-class set-pieces (beyond wormhole, starforge,
//     voidbloom, crystalfield): an aurora veil, a comet swarm, an echo reef.
//   finds — small things to collect while flying: derelict stations,
//     signal sources, rare phenomena.
//
// A site id is self-describing: wonders are `wonder-<kind>`, finds are
// `<kind>-<index>`. A collected site is stored in progress as
// `<universeId>:<siteId>` (see lib/myriad-progress.js, lib/myriad-missions.js).
// Pure logic — no DOM, no THREE imports, fully headless-testable.

import { mulberry32, sceneFor } from './myriad-universes.js';

export const NEW_ANOMALIES = [
  {
    kind: 'aurora-veil',
    label: 'Aurora Veil',
    color: '#7dd3fc',
    desc: 'A shimmering curtain of light hanging in the dark.',
    landable: false,
    blurb: 'Fly through the curtain.',
  },
  {
    kind: 'comet-swarm',
    label: 'Comet Swarm',
    color: '#fdba74',
    desc: 'A family of comets streaking together, tails lit.',
    landable: false,
    blurb: 'Fly with the swarm.',
  },
  {
    kind: 'echo-reef',
    label: 'Echo Reef',
    color: '#c4b5fd',
    desc: 'Tall crystal spires that hum when you come near.',
    landable: true,
    blurb: 'Land and walk among the spires.',
  },
];

export const FIND_KINDS = [
  {
    kind: 'derelict',
    label: 'Derelict station',
    color: '#fca5a5',
    desc: 'A hollow station, dark and drifting. Board it.',
    landable: true,
  },
  {
    kind: 'signal',
    label: 'Signal source',
    color: '#86efac',
    desc: 'A small beacon singing into the dark. Tune in.',
    landable: false,
  },
  {
    kind: 'phenomenon',
    label: 'Rare phenomenon',
    color: '#f0abfc',
    desc: 'Something the sky only does once in a while. Witness it.',
    landable: false,
  },
];

export function wonderDef(kind) {
  return NEW_ANOMALIES.find((w) => w.kind === kind) || null;
}

export function findDef(kind) {
  return FIND_KINDS.find((f) => f.kind === kind) || null;
}

// A site's walkable ground disc radius (only used when landable).
export const WALK_RADIUS = 26;

function randPos(rand, spreadX = 85, spreadY = 28, zMin = 55, zMax = 95) {
  return {
    x: (rand() - 0.5) * 2 * spreadX,
    y: (rand() - 0.5) * 2 * spreadY,
    z: -(zMin + rand() * (zMax - zMin)),
  };
}

// Push a position radially away from the primary anomaly until it sits
// clear of it. Pure and guaranteed: same inputs -> same output, and the
// result is always at least 32 units from the anomaly.
function clearOfAnomaly(pos, anomalyPos) {
  if (!anomalyPos) return pos;
  const dx = pos.x - anomalyPos.x;
  const dy = pos.y - anomalyPos.y;
  const dz = pos.z - anomalyPos.z;
  const d = Math.hypot(dx, dy, dz);
  if (d >= 32) return pos;
  if (d < 1e-6) return { x: anomalyPos.x + 32, y: anomalyPos.y, z: anomalyPos.z };
  const k = 32 / d;
  return {
    x: anomalyPos.x + dx * k,
    y: anomalyPos.y + dy * k,
    z: anomalyPos.z + dz * k,
  };
}

// All extra sites for one universe: its new wonder (about half of all
// universes have one) plus 2-4 small finds. Deterministic.
export function sitesFor(universe) {
  const rand = mulberry32((universe.seed ^ 0x5eed5eed) >>> 0);
  const scene = sceneFor(universe);
  const anomalyPos = scene.anomaly ? scene.anomaly.pos : null;
  const sites = [];

  // New wonder: ~55% of universes get one, kind from the stream.
  if (rand() < 0.55) {
    const def = NEW_ANOMALIES[Math.floor(rand() * NEW_ANOMALIES.length)];
    sites.push({
      id: `wonder-${def.kind}`,
      group: 'wonder',
      kind: def.kind,
      label: def.label,
      color: def.color,
      desc: def.desc,
      blurb: def.blurb,
      landable: def.landable,
      pos: clearOfAnomaly(randPos(rand), anomalyPos),
      radius: 13,
    });
  }

  // Small finds: 2-4 per universe.
  const findCount = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < findCount; i++) {
    const def = FIND_KINDS[Math.floor(rand() * FIND_KINDS.length)];
    sites.push({
      id: `${def.kind}-${i}`,
      group: 'find',
      kind: def.kind,
      label: def.label,
      color: def.color,
      desc: def.desc,
      landable: def.landable,
      pos: clearOfAnomaly(randPos(rand), anomalyPos),
      radius: 8,
    });
  }
  return sites;
}

// Landing sites for one universe: the primary anomaly when it is a
// place you can stand (wormholes are portals, not places), plus every
// landable wonder and find. Each carries its walk radius + ground look.
export function landingSitesFor(universe) {
  const scene = sceneFor(universe);
  const sites = [];
  if (scene.anomaly && scene.anomaly.type !== 'wormhole') {
    sites.push({
      id: `anomaly-${scene.anomaly.type}`,
      group: 'anomaly',
      kind: scene.anomaly.type,
      label: scene.anomaly.label,
      color: '#e8f4ff',
      desc: 'The heart of this universe.',
      landable: true,
      pos: { ...scene.anomaly.pos },
      radius: WALK_RADIUS,
      prop: scene.anomaly.type === 'crystalfield' ? 'spires'
        : scene.anomaly.type === 'starforge' ? 'pillars' : 'petals',
    });
  }
  for (const s of sitesFor(universe)) {
    if (!s.landable) continue;
    sites.push({
      ...s,
      radius: WALK_RADIUS,
      prop: s.kind === 'echo-reef' ? 'spires' : 'deck',
    });
  }
  return sites;
}

// Key under which a collected site is stored in progress.
export function foundKey(universeId, siteId) {
  return `${universeId}:${siteId}`;
}

// Split a found key back into its parts. Returns null on bad input.
export function parseFoundKey(key) {
  if (typeof key !== 'string') return null;
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const universeId = Number(key.slice(0, idx));
  const siteId = key.slice(idx + 1);
  if (!Number.isInteger(universeId) || !siteId) return null;
  return { universeId, siteId };
}
