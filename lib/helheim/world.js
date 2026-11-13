// lib/helheim/world.js
// HELHEIM world layout — pure data + movement math, no three.js.
//
// Norse hell: Hel's hall, cold and misty, grey-blue. The user spawns
// at the Descent in the south, walks north through the gates of
// Helgrind, crosses the river Gjöll on the golden bridge Gjallarbrú,
// and reaches Hel's hall Éljúðnir. The Mist Fields lie west, Náströnd
// (the corpse-shore) east, the Frozen Shore far north. Five standing
// stone arches ring the hall plaza; walking through one rides the
// vortex to that realm.
//
// Everything here is deterministic (seeded mulberry32) so node tests
// can assert the layout without a browser or WebGL. Mirrors
// lib/nether-realm/world.js (Hades) file-for-file.

export const WORLD_RADIUS = 380;

// Spawn: 14m south of the Descent portal, facing north (yaw 0 =
// facing -Z) — the player arrives through the portal and walks north.
// Far enough back that the portal reads as a doorway ahead, not a
// wash filling the whole view.
export const SPAWN = { x: 0, z: 160, yaw: 0 };

// The Descent portal — a real, persistent portal object, not just a
// spawn point. This nether-realm is NORSE hell (Merlin, Nov 12); other
// mythologies get their own nether-realms. Next round hangs the
// mythos-chooser menu off this portal (Greek, Norse, Egyptian,
// Christian, ...). The portal is the anchor: id 'descent-portal',
// mythos 'norse'. Do NOT build the menu, the portal gun, or the
// higher-realms portal in this round — see the plan file
// (~/workspace/your_files/underworld-plan.md, "THE PORTAL SYSTEM").
export const DESCENT_PORTAL = {
  id: 'descent-portal',
  key: 'descent',
  name: 'The Descent',
  mythos: 'norse',
  x: 0,
  z: 146,
  radius: 4,
};

// The River Gjöll: a dark water band across the whole world. The
// golden bridge Gjallarbrú is the only crossing — the gates of
// Helgrind stand at its south end.
export const RIVER = { zMin: -18, zMax: 18, bridgeHalf: 9 };

// The gates of Helgrind stand guard at the bridge's south end.
export const GATES = { x: 0, z: 70 };

// Hel's hall Éljúðnir: a long low hall on the far bank.
export const HALL = { x: 0, z: -130 };

// The three regions.
export const REGIONS = [
  { key: 'mist-fields', name: 'The Mist Fields', x: -160, z: -70, r: 70,
    line: 'Cold mist that never lifts, where the dead wander unseen.' },
  { key: 'nastrond', name: 'Náströnd', x: 160, z: -70, r: 70,
    line: 'The corpse-shore, where venom drips from the serpents above.' },
  { key: 'frozen-shore', name: 'The Frozen Shore', x: 0, z: -230, r: 80,
    line: 'The coldest corner of Helheim, where the ice never melts.' },
];

// The five portal arches, west to east along an arc around the hall
// plaza (radius 55 from the hall). Each walks the user to a live realm.
export const PORTALS = [
  { key: 'persephone', label: "Persephone's Hall", route: '/persephone', x: -53.1, z: -115.8 },
  { key: 'erebus', label: 'Erebus', route: '/erebus', x: -33.5, z: -86.4 },
  { key: 'nether-realm', label: 'Hades', route: '/nether-realm', x: 0, z: -75 },
  { key: 'styx', label: 'The Styx', route: '/styx', x: 33.5, z: -86.4 },
  { key: 'cerberus', label: 'Cerberus', route: '/cerberus', x: 53.1, z: -115.8 },
];

export const PORTAL_TRIGGER_RADIUS = 4.5;

export const WALK_SPEED = 8;
export const RUN_SPEED = 14;

// FIRE (Merlin, 2026-11-12): real light, Earth 2 torch style.
// The mapping follows lib/building/piece-render.js LIGHT_SPECS exactly
// for the torch-post: intensity 10, distance 14, the light riding at
// the flame. Helheim burns two hues: ICE-BLUE for the cold, misty
// places (the Descent, the Gjöll banks, the Mist Fields) and PALE
// GREEN — corpse-light — for the dead places (Helgrind, the hall
// approach, Náströnd, the arches).
export const TORCH_LIGHT = { intensity: 10, distance: 14 };
export const TORCH_COLORS = {
  iceblue: { light: 0x7fd4ff, flame: '#8fd8ff', core: '#e6f7ff' },
  green: { light: 0x7dff9a, flame: '#8dffb0', core: '#e2ffe9' },
};

// Mobile light budget: a real point light on every flame would kill a
// phone, so only the route-marking fires carry one (8). Every torch
// still shows its flame (emissive cone, no light). With the 4 region
// lights (Helgrind, Éljúðnir, Náströnd, Frozen Shore) the scene totals
// 12 point lights. `lit` torches are the pools of light a player walks
// through from the Descent to the hall.
export const TORCH_LIGHT_BUDGET = 8;

/**
 * Every torch in the world: { id, x, z, hue, lit, place }.
 * Strategic, not scattered — the flames mark the route and guide the
 * eye to the important places: the Descent path is lined ice-blue,
 * Helgrind and the hall approach burn corpse-green, the Gjöll crossing
 * and the far bank are lit, every portal arch is flanked, Náströnd
 * burns heaviest.
 */
export function makeTorches() {
  const torches = [];
  const add = (x, z, hue, lit, place) => {
    torches.push({ id: torches.length, x, z, hue, lit, place });
  };

  // The Descent path, lined ice-blue: stations from the spawn (0,150)
  // to Helgrind (0,70), both sides of the way down.
  for (const z of [140, 125, 110, 95, 80]) {
    add(-4, z, 'iceblue', z === 140, 'descent');
    add(4, z, 'iceblue', z === 110, 'descent');
  }
  // Helgrind, ringed green: flanks at the approach, the pillars, and
  // the gates themselves.
  for (const z of [84, 70, 56]) {
    add(-9, z, 'green', false, 'gates');
    add(9, z, 'green', z === 70, 'gates');
  }
  // The Gjöll crossing, ice-blue: both banks, flanking the bridge ends.
  add(-11, 22, 'iceblue', true, 'gjoll');
  add(11, 22, 'iceblue', false, 'gjoll');
  add(-11, -22, 'iceblue', false, 'gjoll');
  add(11, -22, 'iceblue', false, 'gjoll');
  // The far-bank approach to Éljúðnir, green: bridge to plaza.
  for (const z of [-30, -45, -60]) {
    add(-4, z, 'green', z === -30, 'hall-approach');
    add(4, z, 'green', z === -60, 'hall-approach');
  }
  // Every portal arch, flanked green — just outside the 4.5m trigger
  // so the flame never trips the travel.
  for (const p of PORTALS) {
    add(p.x - 4.5, p.z + 2, 'green', false, 'arch');
    add(p.x + 4.5, p.z + 2, 'green', p.key === 'nether-realm', 'arch');
  }
  // Náströnd, heaviest fire: a ring of green around the rim, over the
  // venom pools.
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    add(160 + Math.cos(a) * 60, -70 + Math.sin(a) * 60, 'green', i === 0, 'nastrond');
  }
  // The Mist Fields' edges, ice-blue: a cold rim around the mist.
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    add(-160 + Math.cos(a) * 55, -70 + Math.sin(a) * 55, 'iceblue', false, 'mist-fields');
  }

  return torches;
}

/** Seeded RNG (mulberry32) — same generator the rest of the repo inlines. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dist2(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

/**
 * Forward vector for a camera yaw (three.js convention: camera looks
 * down -Z at yaw 0, rotation.y = yaw). yaw 0 faces north (-Z).
 */
export function forward(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** Right vector for a camera yaw. */
export function right(yaw) {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

/** Clamp a point to the walkable world disc. */
export function clampPosition(x, z) {
  const d = Math.hypot(x, z);
  if (d <= WORLD_RADIUS) return { x, z };
  const s = WORLD_RADIUS / d;
  return { x: x * s, z: z * s };
}

/**
 * Is a step from (x0, z0) to (x1, z1) blocked by the River Gjöll?
 * The river bars every crossing except the golden bridge Gjallarbrú
 * (|x| <= 9), and you cannot step into the water itself outside the
 * bridge.
 */
export function stepBlockedByRiver(x0, z0, x1, z1) {
  // Destination inside the water, off the bridge: blocked.
  if (z1 > RIVER.zMin && z1 < RIVER.zMax && Math.abs(x1) > RIVER.bridgeHalf) return true;
  // Segment straddles the band: find where it meets z = 0.
  const crosses = (z0 > RIVER.zMax && z1 < RIVER.zMin) || (z0 < RIVER.zMin && z1 > RIVER.zMax);
  if (!crosses) return false;
  const t = (0 - z0) / (z1 - z0);
  const xCross = x0 + t * (x1 - x0);
  return Math.abs(xCross) > RIVER.bridgeHalf;
}

/**
 * One movement step: apply the delta, then enforce the river and the
 * world edge. Returns { x, z, blocked } — blocked is true when the
 * river stopped the step (the player stays where they were).
 */
export function stepPosition(x0, z0, dx, dz) {
  const x1 = x0 + dx;
  const z1 = z0 + dz;
  if (stepBlockedByRiver(x0, z0, x1, z1)) return { x: x0, z: z0, blocked: true };
  const c = clampPosition(x1, z1);
  return { x: c.x, z: c.z, blocked: false };
}

/** Plain-English name of the place at (x, z). */
export function regionAt(x, z) {
  for (const r of REGIONS) {
    if (dist2(x, z, r.x, r.z) < r.r) return r.name;
  }
  if (dist2(x, z, HALL.x, HALL.z) < 40) return 'Éljúðnir';
  if (dist2(x, z, GATES.x, GATES.z) < 25) return 'Helgrind';
  if (z > RIVER.zMin && z < RIVER.zMax) return 'The River Gjöll';
  if (dist2(x, z, SPAWN.x, SPAWN.z) < 25) return 'The Descent';
  return 'Helheim';
}

/** The portal arch within trigger range of (x, z), or null. */
export function nearestPortal(x, z, maxDist = PORTAL_TRIGGER_RADIUS) {
  let best = null;
  let bestD = maxDist;
  for (const p of PORTALS) {
    const d = dist2(x, z, p.x, p.z);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

/**
 * Deterministic set dressing: frost pools, standing stones, venom
 * stones, ice pits, drifting shades. All positions avoid the river
 * band, the hall plaza, the portal arc, and the spawn.
 */
export function makeWorld(seed = 1337) {
  const rand = mulberry32(seed);
  const farFrom = (x, z) =>
    Math.abs(z) > 30 &&
    dist2(x, z, HALL.x, HALL.z) > 75 &&
    dist2(x, z, SPAWN.x, SPAWN.z) > 40 &&
    !PORTALS.some((p) => dist2(x, z, p.x, p.z) < 15);

  const scatter = (count, minR, maxR) => {
    const out = [];
    let guard = 0;
    while (out.length < count && guard < count * 60) {
      guard += 1;
      const a = rand() * Math.PI * 2;
      const r = minR + rand() * (maxR - minR);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (farFrom(x, z)) out.push({ x, z });
    }
    return out;
  };

  const inDisc = (cx, cz, r, count) => {
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * (r - 8);
      out.push({ x: cx + Math.cos(a) * rr, z: cz + Math.sin(a) * rr });
    }
    return out;
  };

  const frostPools = scatter(5, 60, 320).map((p, i) => ({ ...p, r: 6 + rand() * 8, id: i }));
  const mistStones = inDisc(-160, -70, 70, 10).map((p, i) => ({ ...p, h: 3 + rand() * 5, id: i }));
  const nastrondStones = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    nastrondStones.push({ x: 160 + Math.cos(a) * 34, z: -70 + Math.sin(a) * 34, h: 7 + rand() * 2, id: i });
  }
  const frozenPits = inDisc(0, -230, 80, 5).map((p, i) => ({ ...p, r: 4 + rand() * 3, id: i }));
  const shades = [
    ...inDisc(-160, -70, 70, 12).map((p, i) => ({ ...p, id: `m${i}`, slow: 0.3 + rand() * 0.4 })),
    ...inDisc(0, -230, 80, 6).map((p, i) => ({ ...p, id: `f${i}`, slow: 0.3 + rand() * 0.4 })),
  ];

  return { frostPools, mistStones, nastrondStones, frozenPits, shades };
}
