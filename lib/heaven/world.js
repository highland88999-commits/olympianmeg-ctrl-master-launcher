// lib/heaven/world.js
// HEAVEN world layout — pure data + movement math, no three.js.
//
// White and gold — clouds, light, and the gates of pearl. The user arrives through The Heaven Gate in the south,
// walks north through The Pearly Gates, crosses The River of Life on the white
// bridge, and reaches The Throne of Light. Clouds of the Blessed lies west,
// The Golden City east, The Sea of Glass far north. Five standing stone
// arches ring the plaza; walking through one rides the vortex to that realm.
//
// A HIGHER realm (Merlin, Nov 12, 2026 — the plan file, "THE PORTAL
// SYSTEM"): bright, not dark — light, not fire. The light posts carry
// real point light in the Earth 2 torch style (intensity 10, distance
// 14, the light riding at the orb), but the posts are pillars of light,
// not flames. Everything here is deterministic (seeded mulberry32) so
// node tests can assert the layout without a browser or WebGL.

export const WORLD_RADIUS = 380;

// Spawn: 14m south of the entry portal, facing north (yaw 0 =
// facing -Z) — the player arrives through the portal and walks north.
// Far enough back that the portal reads as a doorway ahead, not a
// wash of color filling the whole view.
export const SPAWN = { x: 0, z: 160, yaw: 0 };

// The entry portal — a real, persistent portal object, not just a
// spawn point. This higher realm is CHRISTIAN (Merlin, Nov 12);
// it is the heaven paired with the christian nether-realm. Next round
// hangs the portal system off this portal. The portal is the anchor:
// id 'heaven-gate', mythos 'christian'. Do NOT build the mythos menu,
// the portal gun, or the higher-realms portal in this round — see the
// plan file (~/workspace/your_files/underworld-plan.md, "THE PORTAL SYSTEM").
export const ASCENT_PORTAL = {
  id: 'heaven-gate',
  key: 'ascent',
  name: 'The Heaven Gate',
  mythos: 'christian',
  x: 0,
  z: 146,
  radius: 4,
};

// The River of Life: a bright water band across the whole world. The white
// bridge is the only crossing — The Pearly Gates stand at its south end.
export const RIVER = { zMin: -18, zMax: 18, bridgeHalf: 9 };

// The Pearly Gates stand guard at the bridge's south end.
export const GATES = { x: 0, z: 70 };

// The Throne of Light: on the far bank.
export const CENTER = { x: 0, z: -130 };

// The three regions.
export const REGIONS = [
  { key: 'clouds-of-the-blessed', name: 'Clouds of the Blessed', x: -160, z: -70, r: 70,
    line: 'Soft white clouds where the blessed rest in the light.' },
  { key: 'golden-city', name: 'The Golden City', x: 160, z: -70, r: 70,
    line: 'Streets of gold and gates of pearl, shining in the light.' },
  { key: 'sea-of-glass', name: 'The Sea of Glass', x: 0, z: -230, r: 80,
    line: 'A sea clear as glass before the Throne, still and bright.' },
];

// The five portal arches, west to east along an arc around the plaza
// (radius 55 from the centre). Each walks the user to a live realm.
export const PORTALS = [
  { key: 'hell', label: 'Hell', route: '/hell', x: -53.1, z: -115.8 },
  { key: 'nether-realm', label: 'Hades', route: '/nether-realm', x: -33.5, z: -86.4 },
  { key: 'the-afterlife', label: 'The Afterlife', route: '/the-afterlife', x: 0, z: -75 },
  { key: 'mount-olympus', label: 'Mount Olympus', route: '/mount-olympus', x: 33.5, z: -86.4 },
  { key: 'persephone', label: 'Persephone\'s Hall', route: '/persephone', x: 53.1, z: -115.8 },
];

export const PORTAL_TRIGGER_RADIUS = 4.5;

export const WALK_SPEED = 8;
export const RUN_SPEED = 14;

// LIGHT (Merlin, 2026-11-12): real light, Earth 2 torch style — but a
// bright realm burns no fire. The mapping follows
// lib/building/piece-render.js LIGHT_SPECS exactly for the torch-post:
// intensity 10, distance 14, the light riding at the orb. The two hues
// mark two kinds of place: GOLD for the bright, open
// places (the ascent path, the river banks, Clouds of the Blessed) and
// WHITE for the golden, holy places (The Pearly Gates, the
// centre approach, the arches, The Sea of Glass).
export const LIGHT = { intensity: 10, distance: 14 };
export const LIGHT_COLORS = {
  gold: { light: 0xffd98a, orb: '#ffd98a', core: '#fff6d8' },
  white: { light: 0xfff6d8, orb: '#fff6d8', core: '#ffffff' },
};

// Mobile light budget: a real point light on every orb would kill a
// phone, so only the route-marking lights carry one (8). Every post
// still shows its glowing orb (no light). With the 4 region lights
// (The Pearly Gates, the centre, The Golden City, The Sea of Glass) the scene
// totals 12 point lights. `lit` posts are the pools of light a player
// walks through from the entry portal to the centre.
export const LIGHT_BUDGET = 8;

/**
 * Every light post in the world: { id, x, z, hue, lit, place }.
 * Strategic, not scattered — the posts mark the route and guide the
 * eye to the important places: the ascent path is lined gold,
 * The Pearly Gates and the centre approach burn white, the river
 * crossing and the far bank are lit, every portal arch is flanked,
 * The Sea of Glass shines heaviest.
 */
export function makeLights() {
  const lights = [];
  const add = (x, z, hue, lit, place) => {
    lights.push({ id: lights.length, x, z, hue, lit, place });
  };

  // The ascent path, lined gold: stations from the spawn (0,150) to
  // The Pearly Gates (0,70), both sides of the way up.
  for (const z of [140, 125, 110, 95, 80]) {
    add(-4, z, 'gold', z === 140, 'ascent');
    add(4, z, 'gold', z === 110, 'ascent');
  }
  // The Pearly Gates, ringed white: flanks at the approach, the
  // pillars, and the gates themselves.
  for (const z of [84, 70, 56]) {
    add(-9, z, 'white', false, 'gates');
    add(9, z, 'white', z === 70, 'gates');
  }
  // The river crossing, gold: both banks, flanking the bridge ends.
  add(-11, 22, 'gold', true, 'river');
  add(11, 22, 'gold', false, 'river');
  add(-11, -22, 'gold', false, 'river');
  add(11, -22, 'gold', false, 'river');
  // The far-bank approach to The Throne of Light, white: bridge to plaza.
  for (const z of [-30, -45, -60]) {
    add(-4, z, 'white', z === -30, 'center-approach');
    add(4, z, 'white', z === -60, 'center-approach');
  }
  // Every portal arch, flanked white — just outside the 4.5m trigger
  // so the post never trips the travel.
  for (const p of PORTALS) {
    add(p.x - 4.5, p.z + 2, 'white', false, 'arch');
    add(p.x + 4.5, p.z + 2, 'white', p.key === 'the-afterlife', 'arch');
  }
  // The Sea of Glass, heaviest light: a ring of white around the rim.
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    add(Math.cos(a) * 60, -230 + Math.sin(a) * 60, 'white', i === 0, 'sea-of-glass');
  }
  // Clouds of the Blessed's edges, gold: a bright rim around the region.
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    add(-160 + Math.cos(a) * 55, -70 + Math.sin(a) * 55, 'gold', false, 'clouds-of-the-blessed');
  }

  return lights;
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
 * Is a step from (x0, z0) to (x1, z1) blocked by The River of Life?
 * The river bars every crossing except the white bridge (|x| <= 9),
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
  if (dist2(x, z, CENTER.x, CENTER.z) < 40) return "The Throne";
  if (dist2(x, z, GATES.x, GATES.z) < 25) return "The Pearly Gates";
  if (z > RIVER.zMin && z < RIVER.zMax) return 'The River of Life';
  if (dist2(x, z, SPAWN.x, SPAWN.z) < 25) return 'The Ascent';
  return 'Heaven';
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
 * Deterministic set dressing: bright pools, standing stones, pillars,
 * rocks, drifting blessed ones. All positions avoid the river band,
 * the plaza, the portal arc, and the spawn.
 */
export function makeWorld(seed = 1337) {
  const rand = mulberry32(seed);
  const farFrom = (x, z) =>
    Math.abs(z) > 30 &&
    dist2(x, z, CENTER.x, CENTER.z) > 75 &&
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

  const lightPools = scatter(5, 60, 320).map((p, i) => ({ ...p, r: 6 + rand() * 8, id: i }));
  const blessedStones = inDisc(-160, -70, 70, 10).map((p, i) => ({ ...p, h: 3 + rand() * 5, id: i }));
  const goldenPillars = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    goldenPillars.push({ x: 160 + Math.cos(a) * 34, z: -70 + Math.sin(a) * 34, h: 7 + rand() * 2, id: i });
  }
  const glassPonds = inDisc(0, -230, 80, 5).map((p, i) => ({ ...p, r: 4 + rand() * 3, id: i }));
  const blessed = [
    ...inDisc(-160, -70, 70, 12).map((p, i) => ({ ...p, id: `w${i}`, slow: 0.3 + rand() * 0.4 })),
    ...inDisc(0, -230, 80, 6).map((p, i) => ({ ...p, id: `n${i}`, slow: 0.3 + rand() * 0.4 })),
  ];

  return { lightPools, blessedStones, goldenPillars, glassPonds, blessed };
}
