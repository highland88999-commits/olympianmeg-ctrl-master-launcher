// lib/mictlan/world.js
// MICTLAN world layout — pure data + movement math, no three.js.
//
// Nine levels down, ruled by Mictlantecuhtli and Mictecacíhuatl: the river Apanohuacalhuia, crossed with a dog's help, the mountains that crash together, the obsidian winds, and the throne of the Lord of the Dead on the ninth level.
//
// Everything here is deterministic (seeded mulberry32) so node tests
// can assert the layout without a browser or WebGL.

export const WORLD_RADIUS = 380;

// Spawn: 14m south of the Descent portal, facing north (yaw 0 =
// facing -Z) — the player arrives through the portal and walks north.
// Far enough back that the portal reads as a doorway ahead, not a
// wash of colour filling the whole view.
export const SPAWN = { x: 0, z: 160, yaw: 0 };

// The Descent portal — a real, persistent portal object, not just a
// spawn point. This nether-realm is Aztec hell (Merlin, Nov 12);
// other mythologies get their own nether-realms. Next round hangs the
// mythos-chooser menu off this portal. The portal is the anchor: id
// 'descent-portal', mythos 'aztec'. Do NOT build the menu, the
// portal gun, or the higher-realms portal in this round — see the plan
// file (~/workspace/your_files/underworld-plan.md, "THE PORTAL SYSTEM").
export const DESCENT_PORTAL = {
  id: 'descent-portal',
  key: 'descent',
  name: 'The Descent',
  mythos: 'aztec',
  x: 0,
  z: 146,
  radius: 4,
};

// The river Apanohuacalhuia: the dead cross it with a dog's help. The stone bridge is the only crossing — the First Level stands at its south end.
export const RIVER = { zMin: -18, zMax: 18, bridgeHalf: 9 };

// The First Level stands at the bridge's south end — eight more levels lie below.
export const GATES = { x: 0, z: 70 };

// The Throne of the Dead: Mictlantecuhtli's seat, on the ninth level.
export const PALACE = { x: 0, z: -130 };

// The three regions.
export const REGIONS = [
    { key: 'crashing-mountains', name: 'The Crashing Mountains', x: -160, z: -70, r: 70, line: 'Two mountains slam together — slip through between the crashes.' },
    { key: 'obsidian-wind', name: 'The Obsidian Wind', x: 160, z: -70, r: 70, line: 'A desert of black glass, where the wind cuts like a blade.' },
    { key: 'ninth-level', name: 'The Ninth Level', x: 0, z: -230, r: 80, line: 'The bottom of the nine levels. The Lord of the Dead sits here.' },
  ];

// The portal arches, west to east along an arc around the palace
// plaza (radius 55 from the palace). Every world gets an arch back to
// Hades, the first realm, plus arches to hell realms that already exist.
export const PORTALS = [
    { key: 'medusa', label: 'Medusa\'s Lair', route: '/medusa/lair', x: -47.6, z: -102.5 },
    { key: 'nether-realm', label: 'Hades', route: '/nether-realm', x: -18.8, z: -78.3 },
    { key: 'erebus', label: 'Erebus', route: '/erebus', x: 18.8, z: -78.3 },
    { key: 'zeus-v-hades', label: 'Zeus v Hades', route: '/zeus-v-hades', x: 47.6, z: -102.5 },
  ];

export const PORTAL_TRIGGER_RADIUS = 4.5;

export const WALK_SPEED = 8;
export const RUN_SPEED = 14;

// FIRE (Merlin, 2026-11-12): real light, Earth 2 torch style.
// The mapping follows lib/building/piece-render.js LIGHT_SPECS exactly
// for the warm torch-post: intensity 10, distance 14, the light riding
// at the flame. red is the warm hue, turquoise the cold one — the
// two hues mark two kinds of place: turquoise for the cold, ghostly
// places (the Descent, the river banks); red for the warm ones
// (the Gates, the palace approach, the far region).
export const TORCH_LIGHT = { intensity: 10, distance: 14 };
export const TORCH_COLORS = {
  red: { light: 0xff3a1a, flame: '#ff5a2a', core: '#ffd0a8' },
  turquoise: { light: 0x2ad4c0, flame: '#4ae8d4', core: '#d2fff7' },
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

  // The Descent path, lined turquoise: stations from the spawn (0,150)
  // to the Gates (0,70), both sides of the way down.
  for (const z of [140, 125, 110, 95, 80]) {
    add(-4, z, 'turquoise', z === 140, 'descent');
    add(4, z, 'turquoise', z === 110, 'descent');
  }
  // The Gates, ringed red: flanks at the approach, the pillars,
  // and the guardian.
  for (const z of [84, 70, 56]) {
    add(-9, z, 'red', false, 'gates');
    add(9, z, 'red', z === 70, 'gates');
  }
  // The river crossing, turquoise: both banks, flanking the bridge ends.
  add(-11, 22, 'turquoise', true, 'river');
  add(11, 22, 'turquoise', false, 'river');
  add(-11, -22, 'turquoise', false, 'river');
  add(11, -22, 'turquoise', false, 'river');
  // The far-bank approach to the palace, red: bridge to plaza.
  for (const z of [-30, -45, -60]) {
    add(-4, z, 'red', z === -30, 'palace-approach');
    add(4, z, 'red', z === -60, 'palace-approach');
  }
  // Every portal arch, flanked red — just outside the 4.5m trigger
  // so the flame never trips the travel.
  for (const p of PORTALS) {
    add(p.x - 4.5, p.z + 2, 'red', false, 'arch');
    add(p.x + 4.5, p.z + 2, 'red', p.key === 'nether-realm', 'arch');
  }
  // The palace plaza, ringed red.
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    add(Math.cos(a) * 42, -130 + Math.sin(a) * 42, 'red', false, 'plaza');
  }
  // The far region, heaviest fire: a ring of red around the rim.
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    add(Math.cos(a) * 60, -230 + Math.sin(a) * 60, 'red', i === 0, 'ninth-level');
  }
  // The east region's edges, turquoise: a cold rim around it.
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    add(160 + Math.cos(a) * 55, -70 + Math.sin(a) * 55, 'turquoise', false, 'obsidian-wind');
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
 * Is a step from (x0, z0) to (x1, z1) blocked by the river?
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
  if (dist2(x, z, PALACE.x, PALACE.z) < 40) return 'The Throne of the Dead';
  if (dist2(x, z, GATES.x, GATES.z) < 25) return 'The First Level';
  if (z > RIVER.zMin && z < RIVER.zMax) return 'The River Apanohuacalhuia';
  if (dist2(x, z, SPAWN.x, SPAWN.z) < 25) return 'The Descent';
  return 'Mictlan';
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
 * Deterministic set dressing. All positions avoid the river band, the
 * palace plaza, the portal arc, and the spawn.
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

  const obsidianPools = scatter(5, 60, 320).map((p, i) => ({ ...p, r: 6 + rand() * 8, id: i }));
  const mountainStones = inDisc(-160, -70, 70, 10).map((p, i) => ({ ...p, h: 3 + rand() * 5, id: i }));
  const windSpires = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    windSpires.push({ x: 160 + Math.cos(a) * 34, z: -70 + Math.sin(a) * 34, h: 6 + rand() * 3, id: i });
  }
  const thronePits = inDisc(0, -230, 80, 5).map((p, i) => ({ ...p, r: 4 + rand() * 3, id: i }));
  const shades = [
    ...inDisc(-160, -70, 70, 12).map((p, i) => ({ ...p, id: `a${i}`, slow: 0.3 + rand() * 0.4 })),
    ...inDisc(0, -230, 80, 6).map((p, i) => ({ ...p, id: `t${i}`, slow: 0.3 + rand() * 0.4 })),
  ];

  return { obsidianPools, mountainStones, windSpires, thronePits, shades };
}
