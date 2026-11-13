// lib/maya-sky/world.js
// MAYA SKY world layout — pure data + movement math, no three.js.
//
// The sky above the Maya world — corn, stars, and the sun at noon. The user spawns at the The Sky Gate in the south,
// walks north through The Cloud Gates, crosses The Cloud River on the stone bridge,
// and reaches The Sky Temple. Three regions fill the corners. Five standing
// stone arches ring the plaza; walking through one rides the vortex to
// that realm. A bright higher realm: light, not fire — the "torches"
// are glow-lanterns (same Earth 2 light mapping, intensity 10,
// distance 14) with a soft shimmer instead of flame.
//
// Everything here is deterministic (seeded mulberry32) so node tests
// can assert the layout without a browser or WebGL. Mirrors
// lib/nether-realm/world.js (Hades) file-for-file.

export const WORLD_RADIUS = 380;

// Spawn: 14m south of the entry portal, facing north (yaw 0 =
// facing -Z) — the player arrives through the portal and walks north.
// Far enough back that the portal reads as a doorway ahead, not a
// wash of color filling the whole view.
export const SPAWN = { x: 0, z: 160, yaw: 0 };

// The entry portal — a real, persistent portal object, not just a
// spawn point. This higher realm is maya heaven (Merlin, Nov 12);
// the portal system hangs off this anchor next round. The portal is
// the anchor: id 'sky-gate', mythos 'maya'. Do NOT build the
// mythos menu, the portal gun, or the higher-realms portal in this
// round — see the plan file (~/workspace/your_files/underworld-plan.md,
// "THE PORTAL SYSTEM").
export const ENTRY_PORTAL = {
  id: 'sky-gate',
  key: 'entry',
  name: 'The Sky Gate',
  mythos: 'maya',
  x: 0,
  z: 146,
  radius: 4,
};

// The Cloud River: a bright water band across the whole world. The stone
// bridge is the only crossing — The Cloud Gates stand at its south end.
export const RIVER = { zMin: -18, zMax: 18, bridgeHalf: 9 };

// The Cloud Gates stand guard at the bridge's south end.
export const GATES = { x: 0, z: 70 };

// The Sky Temple: the heart of the realm, on the far bank.
export const TEMPLE = { x: 0, z: -130 };

// The three regions.
export const REGIONS = [
  { key: 'corn-fields', name: 'The Corn Fields', x: -160, z: -70, r: 70,
    line: 'Maize grows tall here, gold under the sun.' },
  { key: 'star-gardens', name: 'The Star Gardens', x: 160, z: -70, r: 70,
    line: 'Stars bloom here like flowers, even at noon.' },
  { key: 'upper-sky', name: 'The Upper Sky', x: 0, z: -230, r: 80,
    line: 'The highest sky, where the sun rests at midday.' }
];

// The five portal arches, west to east along an arc around the plaza
// (radius 55 from the centre). Each walks the user to a live realm.
export const PORTALS = [
  { key: 'xibalba', label: "Xibalba", route: '/xibalba', x: -47.6, z: -102.5 },
  { key: 'mictlan', label: "Mictlan", route: '/mictlan', x: -27.5, z: -82.4 },
  { key: 'nether-realm', label: "Hades", route: '/nether-realm', x: 0.0, z: -75.0 },
  { key: 'styx', label: "The Styx", route: '/styx', x: 27.5, z: -82.4 },
  { key: 'persephone', label: "Persephone's Hall", route: '/persephone', x: 47.6, z: -102.5 }
];

export const PORTAL_TRIGGER_RADIUS = 4.5;

export const WALK_SPEED = 8;
export const RUN_SPEED = 14;

// LIGHT (Merlin, 2026-11-12): real light, Earth 2 torch style.
// The mapping follows lib/building/piece-render.js LIGHT_SPECS exactly
// for the torch-post: intensity 10, distance 14, the light riding at
// the glow. In this bright realm the "flame" is a glow-orb, not fire —
// the two hues mark two kinds of place: gold for the soft, green
// places; skyblue for the warm, golden ones.
export const TORCH_LIGHT = { intensity: 10, distance: 14 };
export const TORCH_COLORS = {
  gold: { light: 0xffc94d, flame: '#ffd166', core: '#fff3c4' },
  skyblue: { light: 0x5aa2ff, flame: '#6fb1ff', core: '#d6e9ff' },
};

// Mobile light budget: a real point light on every glow would kill a
// phone, so only the route-marking lights carry one (8). Every post
// still shows its glow-orb (no light). With the 4 region lights the
// scene totals 12 point lights. `lit` posts are the pools of light a
// player walks through from the entry to the centre.
export const TORCH_LIGHT_BUDGET = 8;

/**
 * Every glow-post in the world: { id, x, z, hue, lit, place }.
 * Strategic, not scattered — the lights mark the route and guide the
 * eye to the important places: the entry path is lined gold, the
 * gates and the centre approach glow skyblue, the river crossing and
 * the far bank are lit, every portal arch is flanked, the far region
 * glows heaviest.
 */
export function makeTorches() {
  const torches = [];
  const add = (x, z, hue, lit, place) => {
    torches.push({ id: torches.length, x, z, hue, lit, place });
  };

  // The entry path, lined gold: stations from the spawn (0,150) to
  // the gates (0,70), both sides of the way in.
  for (const z of [140, 125, 110, 95, 80]) {
    add(-4, z, 'gold', z === 140, 'entry');
    add(4, z, 'gold', z === 110, 'entry');
  }
  // The gates, ringed skyblue: flanks at the approach, the pillars,
  // and the gates themselves.
  for (const z of [84, 70, 56]) {
    add(-9, z, 'skyblue', false, 'gates');
    add(9, z, 'skyblue', z === 70, 'gates');
  }
  // The river crossing, gold: both banks, flanking the bridge ends.
  add(-11, 22, 'gold', true, 'river');
  add(11, 22, 'gold', false, 'river');
  add(-11, -22, 'gold', false, 'river');
  add(11, -22, 'gold', false, 'river');
  // The far-bank approach to the centre, skyblue: bridge to plaza.
  for (const z of [-30, -45, -60]) {
    add(-4, z, 'skyblue', z === -30, 'approach');
    add(4, z, 'skyblue', z === -60, 'approach');
  }
  // Every portal arch, flanked skyblue — just outside the 4.5m trigger
  // so the glow never trips the travel.
  for (const p of PORTALS) {
    add(p.x - 4.5, p.z + 2, 'skyblue', false, 'arch');
    add(p.x + 4.5, p.z + 2, 'skyblue', p.key === 'nether-realm', 'arch');
  }
  // The far region, heaviest light: a ring of skyblue around the rim.
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    add(Math.cos(a) * 60, -230 + Math.sin(a) * 60, 'skyblue', i === 0, 'far-region');
  }
  // The west region's edges, gold: a soft rim around the field.
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    add(-160 + Math.cos(a) * 55, -70 + Math.sin(a) * 55, 'gold', false, 'west-region');
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
 * Is a step from (x0, z0) to (x1, z1) blocked by The Cloud River?
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
  if (dist2(x, z, TEMPLE.x, TEMPLE.z) < 40) return 'The Sky Temple';
  if (dist2(x, z, GATES.x, GATES.z) < 25) return 'The Cloud Gates';
  if (z > RIVER.zMin && z < RIVER.zMax) return 'The Cloud River';
  if (dist2(x, z, SPAWN.x, SPAWN.z) < 25) return 'The Sky Gate';
  return 'Maya Sky';
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
 * and drifting light. All positions avoid the river band, the plaza,
 * the portal arc, and the spawn.
 */
export function makeWorld(seed = 1337) {
  const rand = mulberry32(seed);
  const farFrom = (x, z) =>
    Math.abs(z) > 30 &&
    dist2(x, z, TEMPLE.x, TEMPLE.z) > 75 &&
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
  const drifters = [
    ...inDisc(-160, -70, 70, 12).map((p, i) => ({ ...p, id: `w${i}`, slow: 0.3 + rand() * 0.4 })),
    ...inDisc(0, -230, 80, 6).map((p, i) => ({ ...p, id: `n${i}`, slow: 0.3 + rand() * 0.4 })),
  ];

  return { pools, westStones, eastPillars, northPits, drifters };
}
