// OLYMPIAN MONSTERVERSE — biome weight field (pure module, no THREE).
//
// The Hollow Earth world is ONE continuous disc, not a set of pods.
// Eight habitat bands share it, and they NEVER meet at a hard
// seam: every point on the ground carries a WEIGHT for every biome
// (soft inverse-distance falloff around fixed anchors, stirred by a
// deterministic noise field), and the ground colour, scatter and
// monster element at that point all read off the same weights.
// A point is "in transition" when the runner-up biome holds at
// least TRANSITION_MIX of the leader's weight — walk the line
// between any two anchors and you cross a visible blend band,
// never a cliff edge. The world is ever-expansive by construction:
// new anchors can be added to BIOMES without touching the field
// math, and the weights always re-normalise to 1.
//
// Visual language only — no studio, franchise or brand names
// anywhere in this program. The look is described, never cited:
// a vast inner world, a curved inverted horizon, a glowing
// core-sun overhead, mist hanging in the depth.

/* Deterministic 2D value noise from a sine hash — stable across
 * sessions, no RNG state, so the field never shifts underfoot. */
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise2(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/* Eight habitat bands, driven by the monster roster (monster-
 * first, Merlin 2026-10-25). Anchors sit inside the 295 m bounds
 * disc and clear of the world spawn (0, 95) — the sand
 * battlefield south of spawn is the arrival ground, so the intro
 * arch stands there. The shadow anchor sits on Korus's court
 * (-215, 55) so the throne stands deep in its own band, and the
 * frost anchor holds the far west rim for the roster's ice yeti
 * — the seventh element the roster demanded. */
export const BIOMES = {
  acid: {
    id: 'acid', name: 'Acid Ooze Pools', element: 'acid',
    anchor: { x: -160, z: 40 },
    ground: 0x6da83c, accent: 0xb6e33c, fog: 0x5a7a44,
    blurb: 'Sickly green pools where the ground bubbles and hisses — home of the ooze families.',
  },
  fire: {
    id: 'fire', name: 'Volcanic Fire Lands', element: 'fire',
    anchor: { x: 160, z: -60 },
    ground: 0x4a3630, accent: 0xff6a22, fog: 0x5a3a2c,
    blurb: 'Black basalt under ember light; the air itself glows.',
  },
  lightning: {
    id: 'lightning', name: 'Lightning Plains', element: 'lightning',
    anchor: { x: -70, z: -170 },
    ground: 0x9aa08a, accent: 0xffe14d, fog: 0x6a6a58,
    blurb: 'Pale storm flats, charged — the sky cracks overhead.',
  },
  poison: {
    id: 'poison', name: 'Poison Groves', element: 'poison',
    anchor: { x: 180, z: 110 },
    ground: 0x4a3a5e, accent: 0xc06ae0, fog: 0x4a3a5e,
    blurb: 'Violet mists over thorn and spore — the poison families lurk here.',
  },
  shadow: {
    id: 'shadow', name: 'Shadow Smoke Wastes', element: 'shadow',
    anchor: { x: -225, z: 60 },
    ground: 0x3c3c40, accent: 0x8a8a9a, fog: 0x2e2e34,
    blurb: 'Grey gloom that looms; something vast waits in it — Korus’s throne stands here.',
  },
  sand: {
    id: 'sand', name: 'Desert Battlefield', element: 'sand',
    anchor: { x: 60, z: 190 },
    ground: 0xc2a15e, accent: 0xe8c87a, fog: 0xb09a68,
    blurb: 'Ochre dunes scattered with old wreckage — the arrival ground.',
  },
  mountain: {
    id: 'mountain', name: 'Mountain Reaches', element: 'lightning',
    anchor: { x: 210, z: -150 },
    ground: 0x7a7a82, accent: 0xd8d8e0, fog: 0x6a6a72,
    blurb: 'Jagged peaks where storms break — storm-charged heights.',
  },
  frost: {
    id: 'frost', name: 'Frozen Reaches', element: 'frost',
    anchor: { x: -230, z: 130 },
    ground: 0xa8c8d8, accent: 0xe8f4f8, fog: 0x8aa0b0,
    blurb: 'Ice-locked flats at the far rim — the yeti’s ground, and no one else’s.',
  },
};

export const BIOME_IDS = Object.keys(BIOMES);

/* A point counts as "in transition" when the runner-up holds at
 * least this fraction of the leader's weight. */
export const TRANSITION_MIX = 0.55;

/* Field constants: falloff softness and noise stir. */
const FALLOFF = 1200;
const NOISE_STIR = 0.55;

export function biomeWeights(x, z) {
  const raw = {};
  let total = 0;
  for (const id of BIOME_IDS) {
    const b = BIOMES[id];
    const dx = x - b.anchor.x;
    const dz = z - b.anchor.z;
    const d2 = dx * dx + dz * dz;
    const stir = 0.72 + NOISE_STIR * noise2(x * 0.008 + BIOME_IDS.indexOf(id) * 13.7, z * 0.008);
    const w = stir / (d2 + FALLOFF);
    raw[id] = w;
    total += w;
  }
  const out = {};
  for (const id of BIOME_IDS) out[id] = raw[id] / total;
  return out;
}

/* Full read at a point: dominant biome, runner-up, blend mix, and
 * whether the point sits in a transition band. */
export function biomeAt(x, z) {
  const weights = biomeWeights(x, z);
  let first = null;
  let second = null;
  for (const id of BIOME_IDS) {
    const w = weights[id];
    if (!first || w > weights[first]) { second = first; first = id; }
    else if (!second || w > weights[second]) { second = id; }
  }
  const mix = second ? weights[second] / weights[first] : 0;
  return {
    dominant: first,
    second,
    weights,
    mix,
    transition: mix >= TRANSITION_MIX,
  };
}

function hexToRgb(hex) {
  return { r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 };
}

/* Ground colour at a point: the biome ground colours mixed by the
 * same weights — the visible blend, never a switch. */
export function groundColor(x, z) {
  const weights = biomeWeights(x, z);
  let r = 0;
  let g = 0;
  let b = 0;
  for (const id of BIOME_IDS) {
    const c = hexToRgb(BIOMES[id].ground);
    r += c.r * weights[id];
    g += c.g * weights[id];
    b += c.b * weights[id];
  }
  return { r, g, b };
}

/* The monster element at a point follows the dominant biome. */
export function elementAt(x, z) {
  return BIOMES[biomeAt(x, z).dominant].element;
}
