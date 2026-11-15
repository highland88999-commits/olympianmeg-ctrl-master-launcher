// lib/elysium/world.js
// ELYSIUM world layout — pure data + movement math, no three.js.
//
// The Greek heaven — white marble, still water, and the fountain that never runs dry.
// The user spawns at the Ascent in the south, walks north through The White Gate,
// crosses The Meander on the bridge, and reaches The Meander Fountain.
// The White Gardens lies west, The Golden Fields east, The Far Shore far north.
// Three standing stone arches ring the plaza; walking through one rides
// the vortex to that realm.
//
// Everything here is deterministic (seeded mulberry32) so node tests
// can assert the layout without a browser or WebGL. Mirrors
// lib/nether-realm/world.js (Hades) file-for-file.

export const WORLD_RADIUS = 380;

// Spawn: 14m south of the Ascent portal, facing north (yaw 0 =
// facing -Z) — the player arrives through the portal and walks north.
// Far enough back that the portal reads as a doorway ahead, not a
// wash of color filling the whole view.
export const SPAWN = { x: 0, z: 160, yaw: 0 };

// The Ascent portal — a real, persistent portal object, not just a
// spawn point. This higher realm is greek heaven (Merlin, Nov 12);
// the higher-realms portal above Earth and the portal gun hang off
// this anchor next round. The portal is the anchor: id 'ascent-portal',
// mythos 'greek'. Do NOT build the menu, the portal gun, or the
// higher-realms portal in this round — see the plan file
// (~/workspace/your_files/underworld-plan.md, "THE PORTAL SYSTEM").
export const ENTRY_PORTAL = {
  id: 'ascent-portal',
  key: 'ascent',
  name: 'The Ascent',
  mythos: 'greek',
  x: 0,
  z: 146,
  radius: 4,
};

// The Meander: a bright water band across the whole world. The
// bridge is the only crossing — The White Gate stand at its south end.
export const RIVER = { zMin: -18, zMax: 18, bridgeHalf: 9 };

// The White Gate stand guard at the bridge's south end.
export const GATES = { x: 0, z: 70 };

// The Meander Fountain: the fountain of immortality (Kaos, Netflix 2024) — water made from purified souls, flowing in Zeus’s garden. The fountain + structure are built now; the Kaos look itself is flagged below (KAOS_LOOK) pending the reference footage.
export const FOUNTAIN = { x: 0, z: -130 };

// The three regions.
export const REGIONS = [
  { key: 'white-gardens', name: "The White Gardens", x: -160, z: -70, r: 70,
    line: "White blossom, still air, and room to breathe." },
  { key: 'golden-fields', name: "The Golden Fields", x: 160, z: -70, r: 70,
    line: "The blessed walk here, in light that never leaves." },
  { key: 'far-shore', name: "The Far Shore", x: 0, z: -230, r: 80,
    line: "The edge of heaven, looking down on the world below." },
];

// The three portal arches, west to east along an arc around the
// plaza (radius 55 from The Meander Fountain). Each walks the user to a
// live realm.
export const PORTALS = [
  { key: 'afterlife', label: "The Afterlife", route: '/the-afterlife', x: -42.1, z: -94.6 },
  { key: 'nether-realm', label: "Hades", route: '/nether-realm', x: 0, z: -75 },
  { key: 'persephone', label: "Persephone's Hall", route: '/persephone', x: 42.1, z: -94.6 },
];

export const PORTAL_TRIGGER_RADIUS = 4.5;

export const WALK_SPEED = 8;
export const RUN_SPEED = 14;

// KAOS LOOK FLAG (Merlin, Nov 12, 2026): the Kaos reference footage is
// NOT in yet. The fountain + structure below are built now; the pristine-white
// Kaos look (fountain detail, menu styling) is TO BE REFINED once the footage
// has been watched whole. Do not call this look final.
export const KAOS_LOOK = 'pending-reference-footage';

// LIGHT (Merlin, 2026-11-12): real light, Earth 2 torch style —
// bright realms use LIGHT, not fire. The mapping follows
// lib/building/piece-render.js LIGHT_SPECS exactly for the torch-post:
// intensity 10, distance 14, the light riding at the glow. Two hues
// mark two kinds of place: gold for the warm, golden places and
// white for the cool ones.
export const TORCH_LIGHT = { intensity: 10, distance: 14 };
export const TORCH_COLORS = {
  gold: { light: 0xffd98a, flame: '#ffe1a8', core: '#fff6d8' },
  white: { light: 0xbfd9ff, flame: '#d6e9ff', core: '#ffffff' },
};

// Mobile light budget: a real point light on every glow would kill a
// phone, so only the route-marking lights carry one (8). Every post
// still shows its glow (emissive cone, no light). With the 4 region
// lights the scene totals 12 point lights. `lit` posts are the pools
// of light a player walks through from the Ascent to the plaza.
export const TORCH_LIGHT_BUDGET = 8;

/**
 * Every light post in the world: { id, x, z, hue, lit, place }.
 * Strategic, not scattered — the lights mark the route and guide the
 * eye to the important places.
 */
export function makeTorches() {
  const torches = [];
  const add = (x, z, hue, lit, place) => {
    torches.push({ id: torches.length, x, z, hue, lit, place });
  };

  // The Ascent path, lined white: stations from the spawn (0,150) to
  // the gates (0,70), both sides of the way up.
  for (const z of [140, 125, 110, 95, 80]) {
    add(-4, z, 'white', z === 140, 'ascent');
    add(4, z, 'white', z === 110, 'ascent');
  }
  // The gates, ringed gold: flanks at the approach, the pillars,
  // and the gates themselves.
  for (const z of [84, 70, 56]) {
    add(-9, z, 'gold', false, 'gates');
    add(9, z, 'gold', z === 70, 'gates');
  }
  // The river crossing, white: both banks, flanking the bridge ends.
  add(-11, 22, 'white', true, 'meander');
  add(11, 22, 'white', false, 'meander');
  add(-11, -22, 'white', false, 'meander');
  add(11, -22, 'white', false, 'meander');
  // The far-bank approach, gold: bridge to plaza.
  for (const z of [-30, -45, -60]) {
    add(-4, z, 'gold', z === -30, 'approach');
    add(4, z, 'gold', z === -60, 'approach');
  }
  // Every portal arch, flanked gold — just outside the 4.5m trigger
  // so the glow never trips the travel.
  for (const p of PORTALS) {
    add(p.x - 4.5, p.z + 2, 'gold', false, 'arch');
    add(p.x + 4.5, p.z + 2, 'gold', p.key === 'nether-realm', 'arch');
  }
  // The Far Shore, heaviest light: a ring of gold around the rim.
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    add(Math.cos(a) * 60, -230 + Math.sin(a) * 60, 'gold', i === 0, 'far-shore');
  }
  // The White Gardens's edges, white: a cool rim around the region.
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    add(-160 + Math.cos(a) * 55, -70 + Math.sin(a) * 55, 'white', false, 'white-gardens');
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
 * Is a step from (x0, z0) to (x1, z1) blocked by The Meander?
 * The river bars every crossing except the bridge (|x| <= 9),
 * and you cannot step into the water itself outside the bridge.
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
  if (dist2(x, z, FOUNTAIN.x, FOUNTAIN.z) < 40) return 'The Meander Fountain';
  if (dist2(x, z, GATES.x, GATES.z) < 25) return 'The White Gate';
  if (z > RIVER.zMin && z < RIVER.zMax) return 'The Meander';
  if (dist2(x, z, SPAWN.x, SPAWN.z) < 25) return 'The Ascent';
  return 'Elysium';
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
 * Deterministic set dressing: light pools, standing stones, columns,
 * northern pools, drifting shades. All positions avoid the river band,
 * the plaza, the portal arc, and the spawn.
 */
export function makeWorld(seed = 1337) {
  const rand = mulberry32(seed);
  const farFrom = (x, z) =>
    Math.abs(z) > 30 &&
    dist2(x, z, FOUNTAIN.x, FOUNTAIN.z) > 75 &&
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

  const pools = scatter(5, 60, 320).map((p, i) => ({ ...p, r: 6 + rand() * 8, id: i }));
  const westStones = inDisc(-160, -70, 70, 10).map((p, i) => ({ ...p, h: 3 + rand() * 5, id: i }));
  const eastPillars = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    eastPillars.push({ x: 160 + Math.cos(a) * 34, z: -70 + Math.sin(a) * 34, h: 7 + rand() * 2, id: i });
  }
  const northPits = inDisc(0, -230, 80, 5).map((p, i) => ({ ...p, r: 4 + rand() * 3, id: i }));
    // POPULATION RULE (Merlin, Nov 14 ~22:57): more than one copy of
  // every creature, spread out across maps — 18 copies across all
  // three region discs (8 + 6 + 4), never a single cluster. The cap
  // stays 18; only the distribution changed.
const shades = [
    ...inDisc(-160, -70, 70, 8).map((p, i) => ({ ...p, id: `w${i}`, slow: 0.3 + rand() * 0.4 })),
    ...inDisc(0, -230, 80, 6).map((p, i) => ({ ...p, id: `n${i}`, slow: 0.3 + rand() * 0.4 })),
    ...inDisc(160, -70, 70, 4).map((p, i) => ({ ...p, id: `e${i}`, slow: 0.3 + rand() * 0.4 })),
  ];

  return { pools, westStones, eastPillars, northPits, shades };
}
