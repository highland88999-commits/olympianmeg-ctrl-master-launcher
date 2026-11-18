// lib/nav/world.js
// NAV world layout — pure data + movement math, no three.js.
//
// The damp realm of the dead, across the river, ruled by Veles: the river, the roots of the world tree, the damp meadows, Veles' hall.
//
// Everything here is deterministic (seeded mulberry32) so node tests
// can assert the layout without a browser or WebGL.

// WORLD_RADIUS is the HOME-REGION radius: spawn, the portal, the
// Gates, the palace, the regions and the arches all live inside
// it. The world itself is endless (Merlin, Nov 18, 2026) — no
// clamp, no wall, no turn-back; the ground streams past it.
export const WORLD_RADIUS = 380;

// Spawn: 14m south of the Descent portal, facing north (yaw 0 =
// facing -Z) — the player arrives through the portal and walks north.
// Far enough back that the portal reads as a doorway ahead, not a
// wash filling the whole view.
export const SPAWN = { x: 0, z: 160, yaw: 0 };

// The Descent portal — a real, persistent portal object, not just a
// spawn point. This nether-realm is Slavic hell (Merlin, Nov 12);
// other mythologies get their own nether-realms. Next round hangs the
// mythos-chooser menu off this portal (Greek, Norse, Egyptian,
// Christian, ...). The portal is the anchor: id 'descent-portal',
// mythos 'slavic'. Do NOT build the menu, the portal gun, or the
// higher-realms portal in this round — see the plan file
// (~/workspace/your_files/underworld-plan.md, "THE PORTAL SYSTEM").
export const DESCENT_PORTAL = {
  id: 'descent-portal',
  key: 'descent',
  name: 'The Descent',
  mythos: 'slavic',
  x: 0,
  z: 146,
  radius: 4,
};

// The River of the Dead: a dark water band across the whole world.
// The stone bridge is the only crossing — the river gate stands at its south end.
export const RIVER = { zMin: -18, zMax: 18, bridgeHalf: 9 };

// The River Gate stand at the bridge's south end.
export const GATES = { x: 0, z: 70 };

// Veles' Hall: a long wooden hall on the far bank
export const PALACE = { x: 0, z: -130 };

// The three regions.
export const REGIONS = [
  { key: 'roots', name: 'The Roots of the World Tree', x: -160, z: -70, r: 70,
    line: 'The great roots run down here, holding the world up.' },
  { key: 'meadows', name: 'The Damp Meadows', x: 160, z: -70, r: 70,
    line: 'Wet meadows where the dead rest in the mist.' },
  { key: 'veles-hall', name: 'Veles\' Hall', x: 0, z: -230, r: 80,
    line: 'Veles\' own hall, deep in the dark and the damp.' },
];

// The portal arches, west to east along an arc around the palace
// plaza (radius 55 from the palace). Each walks the user to a live realm.
export const PORTALS = [
  { key: 'styx', label: 'The Styx', route: '/styx', x: -51.7, z: -111.2 },
  { key: 'sanctuary', label: 'Sanctuary', route: '/sanctuary', x: -31.5, z: -84.9 },
  { key: 'nether-realm', label: 'Hades', route: '/nether-realm', x: 0.0, z: -75.0 },
  { key: 'persephone', label: 'Persephone\'s Hall', route: '/persephone', x: 31.5, z: -84.9 },
  { key: 'erebus', label: 'Erebus', route: '/erebus', x: 51.7, z: -111.2 },
];

export const PORTAL_TRIGGER_RADIUS = 4.5;

export const WALK_SPEED = 8;
export const RUN_SPEED = 14;

// FIRE (Merlin, 2026-11-12): real light, Earth 2 torch style.
// The mapping follows lib/building/piece-render.js LIGHT_SPECS exactly
// for the yellow torch-post: warm fire tone 0xff9a3c, intensity 10,
// distance 14, the light riding at the flame. The two hues are blue and green will-o'-wisp light.
export const TORCH_LIGHT = { intensity: 10, distance: 14 };
export const TORCH_COLORS = {
  green: { light: 0x66d99a, flame: '#7ce8a8', core: '#dcffe9' },
  blue: { light: 0x5aa2ff, flame: '#6fb1ff', core: '#d6e9ff' },
};

// Mobile light budget: a real point light on every flame would kill a
// phone, so only the route-marking fires carry one (8). Every torch
// still shows its flame (emissive cone, no light). With the 4 region
// lights the scene totals 12 point lights. `lit` torches are the pools
// of light a player walks through from the Descent to the palace.
export const TORCH_LIGHT_BUDGET = 8;

/**
 * Every torch in the world: { id, x, z, hue, lit, place }.
 * Strategic, not scattered — the flames mark the route and guide the
 * eye to the important places.
 */
export function makeTorches() {
  const torches = [];
  const add = (x, z, hue, lit, place) => {
    torches.push({ id: torches.length, x, z, hue, lit, place });
  };

  // The Descent path, lined blue: stations from the spawn (0,150) to
  // the Gates (0,70), both sides of the way down.
  for (const z of [140, 125, 110, 95, 80]) {
    add(-4, z, 'blue', z === 140, 'descent');
    add(4, z, 'blue', z === 110, 'descent');
  }
  // The Gates, ringed green: flanks at the approach, the
  // pillars, and the guardian.
  for (const z of [84, 70, 56]) {
    add(-9, z, 'green', false, 'gates');
    add(9, z, 'green', z === 70, 'gates');
  }
  // The river crossing, blue: both banks, flanking the bridge ends.
  add(-11, 22, 'blue', true, 'river');
  add(11, 22, 'blue', false, 'river');
  add(-11, -22, 'blue', false, 'river');
  add(11, -22, 'blue', false, 'river');
  // The far-bank approach to Veles' Hall, green: bridge to plaza.
  for (const z of [-30, -45, -60]) {
    add(-4, z, 'green', z === -30, 'palace-approach');
    add(4, z, 'green', z === -60, 'palace-approach');
  }
  // Every portal arch, flanked green — just outside the 4.5m trigger
  // so the flame never trips the travel.
  for (const p of PORTALS) {
    add(p.x - 4.5, p.z + 2, 'green', false, 'arch');
    add(p.x + 4.5, p.z + 2, 'green', p.key === 'nether-realm', 'arch');
  }
  // Veles' Hall: a ring of green around the rim, the
  // brightest light in the far north.
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    add(Math.cos(a) * 60, -230 + Math.sin(a) * 60, 'green', i === 0, 'veles');
  }
  // The Damp Meadows edges, green: a rim around the field.
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    add(160 + Math.cos(a) * 55, -70 + Math.sin(a) * 55, 'green', false, 'meadows');
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

/**
 * Is a step from (x0, z0) to (x1, z1) blocked by the River of the Dead?
 * The river bars every crossing except the stone bridge (|x| <= 9),
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
 * One movement step: apply the delta, then enforce the river. The
 * world has no edge any more (Merlin, Nov 18, 2026 — endless), so
 * there is nothing else to enforce: a step past the old 380 m rim
 * lands where it lands. Returns { x, z, blocked } — blocked is
 * true when the river stopped the step (the player stays where
 * they were).
 */
export function stepPosition(x0, z0, dx, dz) {
  const x1 = x0 + dx;
  const z1 = z0 + dz;
  if (stepBlockedByRiver(x0, z0, x1, z1)) return { x: x0, z: z0, blocked: true };
  return { x: x1, z: z1, blocked: false };
}

/** Plain-English name of the place at (x, z). */
export function regionAt(x, z) {
  for (const r of REGIONS) {
    if (dist2(x, z, r.x, r.z) < r.r) return r.name;
  }
  if (dist2(x, z, PALACE.x, PALACE.z) < 40) return 'Veles\' Throne';
  if (dist2(x, z, GATES.x, GATES.z) < 25) return 'The River Gate';
  if (z > RIVER.zMin && z < RIVER.zMax) return 'The River of the Dead';
  if (dist2(x, z, SPAWN.x, SPAWN.z) < 25) return 'The Descent';
  return 'Nav';
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
 * Deterministic set dressing: root tangles, meadow stones, root pillars, bog pools, drifting wisps. All positions avoid
 * the river band, the palace plaza, the portal arc, and the spawn.
 */
export function makeWorld(seed = 1337) {
  const rand = mulberry32(seed);
  const farFrom = (x, z) =>
    Math.abs(z) > 30 &&
    dist2(x, z, PALACE.x, PALACE.z) > 75 &&
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

  const rootTangles = scatter(5, 60, 320).map((p, i) => ({ ...p, r: 6 + rand() * 8, id: i }));
  const meadowStones = inDisc(160, -70, 70, 10).map((p, i) => ({ ...p, h: 3 + rand() * 5, id: i }));
  const rootPillars = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    rootPillars.push({ x: -160 + Math.cos(a) * 34, z: -70 + Math.sin(a) * 34, h: 7 + rand() * 2, id: i });
  }
  const dampPools = inDisc(0, -230, 80, 5).map((p, i) => ({ ...p, r: 4 + rand() * 3, id: i }));
    // POPULATION RULE (Merlin, Nov 14 ~22:57): more than one copy of
  // every creature, spread out across maps — 18 copies across all
  // three region discs (8 + 6 + 4), never a single cluster. The cap
  // stays 18; only the distribution changed.
const wisps = [
    ...inDisc(160, -70, 70, 8).map((p, i) => ({ ...p, id: `m${i}`, slow: 0.3 + rand() * 0.4 })),
    ...inDisc(0, -230, 80, 6).map((p, i) => ({ ...p, id: `v${i}`, slow: 0.3 + rand() * 0.4 })),
    ...inDisc(-160, -70, 70, 4).map((p, i) => ({ ...p, id: `w${i}`, slow: 0.3 + rand() * 0.4 })),
  ];

  return { rootTangles, meadowStones, rootPillars, dampPools, wisps };
}
