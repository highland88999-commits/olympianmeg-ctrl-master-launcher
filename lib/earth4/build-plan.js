/**
 * build-plan.js — pure normalizer for Earth 4 creature plans.
 *
 * The anatomy build map is prose (relative_size words, English build
 * steps, no coordinates). The build-time compiler
 * (~/workspace/earth4/build-creature-plans.py) turns it into compact
 * numeric plans in lib/earth4/creature-plans.json; this module turns
 * those plans — or a raw build-map entry, for the cross-check — into
 * the numeric build plan the creature builder consumes.
 *
 * A part is a tuple in the JSON:
 *   [name, count, shape, kind, dist, px, py, pz, sx, sy, sz, rx, ry, rz]
 * and an object after normalization:
 *   { name, count, shape, kind, dist, pos: [x,y,z], size: [sx,sy,sz],
 *     rot: [rx,ry,rz] }
 * dist is single | pair | ring | line | canopy (canopy rings the
 * stem at crown height instead of stacking up it).
 *
 * Vocab maps here MIRROR the compiler (build-creature-plans.py) — the
 * cross-check test pins that the two agree on sample species. Change
 * one, change both, and re-run the compiler.
 *
 * The visible-mesh budget is MAX_VISIBLE_PARTS = 6, the placeholder
 * cost envelope: each part-group is one mesh (InstancedMesh for
 * repeats), plus the hit sphere. normalizePlan enforces it by
 * priority — the silhouette (body/head/limbs) always survives, the
 * dropped names are recorded so nothing is silently lost.
 */

// ── vocab ──────────────────────────────────────────────────────────

export const SIZE_WORDS = {
  tiny: 0.07, small: 0.14, medium: 0.24,
  large: 0.38, dominant: 0.55, variable: 0.24,
};

// name (substring, first match wins) -> primitive shape.
const SHAPE_RULES = [
  [['wing'], 'plane'],
  [['fin'], 'plane'],
  [['beak', 'muzzle', 'snout', 'horn', 'claw', 'pincer', 'spine',
    'thorn', 'tail'], 'cone'],
  // Conifer canopy tiers are cones, not balls: branches make the
  // wide lower tier, needles the narrow upper tier.
  [['branches', 'needles'], 'cone'],
  [['leg', 'arm', 'tentacle', 'antenna', 'stem', 'stipe', 'trunk',
    'siphon', 'stalk'], 'cylinder'],
  [['head', 'body', 'thorax', 'abdomen', 'shell', 'cap', 'polyp',
    'eye', 'fruit', 'foot', 'crown', 'skeleton', 'tusk', 'bulb',
    'root'], 'sphere'],
];
// Leaves, petals and flowers are NOT planes: a flat 1x1 plane
// scaled to a 9 m blade reads as a broken board (measured on
// Acacia prominens, Nov 14). Foliage is a flattened sphere — a
// volumetric puff — so it reads as mass from every angle. Wings
// and fins stay planes: they are small, and the flap needs a
// flat wing.

export function shapeForPart(name) {
  const n = String(name).toLowerCase();
  for (const [keys, shape] of SHAPE_RULES) {
    if (keys.some((k) => n.includes(k))) return shape;
  }
  return 'sphere';
}

// Names that are surface or internal systems — never geometry.
const SKIP_NAMES = [
  'scale', 'feather', 'fur', 'gill', 'mouthpart', 'mouth', 'radula',
  'mycelium', 'spore', 'seed', 'lateral line', 'organ', 'gut', 'heart',
  'brain', 'nerve', 'trachea', 'malpighian', 'swim bladder', 'mantle',
  'ootheca', 'chromatophore', 'photophore', 'ocelli',
];
// Positions that mean "not a visible outside part".
const SKIP_POSITIONS = ['inside', 'under', 'throughout', 'on gills',
  'on tentacles'];

export function skipPart(part) {
  const name = String(part.name).toLowerCase();
  const pos = String(part.position).toLowerCase();
  if (SKIP_NAMES.some((s) => name.includes(s))) return true;
  if (SKIP_POSITIONS.some((s) => pos.includes(s))) return true;
  if (name === 'roots') return true; // underground — never visible
  return false;
}

/** Position words -> anchor offset in body units (x forward, y up).
 * The optional name carries the part's role: a head buried at
 * x=0.32 inside a body that spans x +/-0.385 reads as one ball,
 * forelegs and hindlegs anchored at the same x read as one pair
 * of sticks, and eyes at z=+/-0.22 float beside a head half that
 * wide. The name rules below put each volume where it belongs.
 * Callers that do not pass a name get the plain word offsets. */
export function positionOffset(position, name) {
  const p = String(position).toLowerCase();
  let x = 0, y = 0, z = 0;
  if (p.includes('anterior')) x += 0.32;
  if (p.includes('posterior')) x -= 0.32;
  if (p.includes('terminal')) x = x >= 0 ? 0.45 : -0.45;
  if (p.includes('dorsal')) y += 0.22;
  if (p.includes('ventral')) y -= 0.22;
  if (p.includes('apical')) y += 0.40;
  if (p.includes('basal')) y -= 0.35;
  if (p.includes('lateral')) z = 0.22;
  const n = name ? String(name).toLowerCase() : '';
  if (n === 'head') { x = 0.36; y = 0.05; } // proud of the body front
  else if (n === 'eyes' || n === 'compound eyes' || n === 'eye') {
    x = 0.38; y = 0.08; z = 0.09; // on the head's surface, not floating
  } else if (n === 'beak' || n === 'muzzle' || n === 'snout') {
    y = 0.05; // at the raised head's mid-height
  } else if (n === 'ears') { x = 0.36; y = 0.12; z = 0.09; } // on the head
  else if (n === 'forelegs') x += 0.2; // front quarter, not the middle
  else if (n === 'hindlegs') x -= 0.2; // rear quarter
  else if (n === 'pectoral fins') x += 0.2;
  else if (n === 'pelvic fins') x -= 0.15;
  else if (n === 'branches') { x = 0; y = 0.05; z = 0; } // lower tier, on axis
  else if (n === 'needles') { x = 0; y = 0.32; z = 0; } // upper tier, on axis
  return [round3(x), round3(y), round3(z)];
}

/** Shape + size word -> part size in body units. */
export function sizeVector(shape, name, frac) {
  const n = String(name).toLowerCase();
  if (name === 'eye' || name === 'eyes' || name === 'compound eyes') {
    const d = round3(frac * 0.5);
    return [d, d, d];
  }
  // Foliage is a flattened puff, not a board: wide, low, round.
  if (['leaves', 'leaf', 'leaflets', 'petals', 'petal', 'flowers',
    'flower', 'fronds', 'lobes', 'shoots'].includes(n)) {
    return [round3(frac * 1.2), round3(frac * 0.45), round3(frac * 1.2)];
  }
  if (shape === 'sphere') {
    if (['cap', 'shell', 'shell valves', 'crown', 'foot'].includes(n)) {
      return [round3(frac * 1.2), round3(frac * 0.6), round3(frac * 1.2)];
    }
    // Pine and cycad cones are compact, not crown-sized balls: a
    // 'medium' cone at 0.336 body units is a 10 m ball on a 30 m
    // pine, and ringed at the crown it flared the whole tree top
    // out to 0.82 body units wide.
    if (n === 'cones') {
      return [round3(frac * 0.6), round3(frac * 0.4), round3(frac * 0.6)];
    }
    return [round3(frac * 1.4), round3(frac * 0.8), round3(frac * 0.8)];
  }
  if (shape === 'cylinder') {
    if (n === 'stem' || n === 'stipe' || n === 'trunk') {
      return [round3(frac * 0.2), round3(frac * 1.6), round3(frac * 0.2)];
    }
    if (n === 'skeleton') { // flat basal disc
      return [round3(frac * 1.2), round3(frac * 0.25), round3(frac * 1.2)];
    }
    // Legs carry the body: stocky, not matchsticks (measured 0.06
    // wide on a 0.44-tall body — the green-ball animal's sticks).
    if (n.includes('leg')) {
      return [round3(frac * 0.45), round3(frac), round3(frac * 0.45)];
    }
    return [round3(frac * 0.25), round3(frac * 1.2), round3(frac * 0.25)];
  }
  if (shape === 'cone') {
    // Conifer canopy tiers: tall narrow cones in a tight ring, so
    // each tier reads as one pine layer — wide at the base,
    // pointed at the top — and the tiers step inward with height.
    // (A 0.57-wide cone in a 0.22 ring made a 1.0-wide squat disc:
    // wider than the tree is tall.)
    if (n === 'branches') {
      return [round3(frac * 0.66), round3(frac * 1.3), round3(frac * 0.66)];
    }
    if (n === 'needles') {
      return [round3(frac * 1.1), round3(frac * 2.6), round3(frac * 1.1)];
    }
    return [round3(frac * 0.25), round3(frac), round3(frac * 0.25)];
  }
  if (shape === 'plane') {
    return [round3(frac * 1.6), round3(frac * 0.7), 0.02];
  }
  const f = round3(frac);
  return [f, f, f];
}

export function rotationFor(shape, name) {
  const n = String(name).toLowerCase();
  if (shape === 'plane') {
    if (n.includes('wing')) return [-1.5708, 0, 0]; // flat, horizontal
    if (n.includes('fin')) {
      if (n.includes('dorsal') || n.includes('caudal')) return [0, 0, 0];
      return [-1.5708, 0, 0]; // pectoral / pelvic / anal: flat
    }
    return [-1.5708, 0, 0]; // any other plane: flat (leaves are
    // spheres now, so only wings and fins reach here)
  }
  if (shape === 'cone') {
    if (n === 'beak' || n === 'muzzle' || n === 'snout') return [0, 0, -1.5708];
    if (n === 'tail') return [0, 0, 1.5708]; // tip backward
  }
  return [0, 0, 0];
}

/** Parts that form a crown: they ring the stem at crown height
 * instead of stacking up it. 'canopy' is a new distribution —
 * see placeInstances in creature-builder.js. */
export const CANOPY_PARTS = new Set([
  'leaves', 'leaf', 'leaflets', 'fronds', 'flowers', 'flower',
  'petals', 'petal', 'lobes', 'shoots', 'cones',
]);

/** How repeat instances are arranged: single | pair | ring | line | canopy. */
export function distribution(part) {
  const name = String(part.name).toLowerCase();
  const pos = String(part.position).toLowerCase();
  const count = part.count;
  if (count === 1 || count === '1') return 'single';
  if (CANOPY_PARTS.has(name)) return 'canopy';
  // Fruiting bodies cluster at ground level, not in a vertical
  // totem: a ring of them reads as a colony.
  if (name === 'fruiting bodies') return 'ring';
  // Conifer canopy tiers are rings of cones at one height — a
  // tiered pine, not a vertical stack of balls.
  if (name === 'branches' || name === 'needles') return 'ring';
  // A bivalve's two valves flank the body, they do not sit in a
  // row along it.
  if (name === 'shell valves') return 'pair';
  if (pos.includes('encircling')) return 'ring';
  if (pos.includes('paired') || pos.includes('pair')) return 'pair';
  if (count === 'many') return name === 'tentacles' ? 'ring' : 'line';
  return 'line';
}

export function resolveCount(part) {
  if (part.count === 'many') return distribution(part) === 'ring' ? 8 : 6;
  return Number(part.count);
}

// ── raw-entry normalization (mirrors the compiler) ─────────────────

/** One raw build-map part -> numeric part object, or null when skipped. */
export function normalizePart(part) {
  if (skipPart(part)) return null;
  const name = String(part.name).toLowerCase();
  const shape = shapeForPart(name);
  const frac = SIZE_WORDS[part.relative_size] ?? 0.24;
  const count = resolveCount(part);
  const kind = name.includes('wing')
    ? 'flap'
    : (count > 1 ? 'repeat' : 'single');
  return {
    name,
    count,
    shape,
    kind,
    dist: distribution(part),
    pos: positionOffset(part.position, name),
    size: sizeVector(shape, name, frac),
    rot: rotationFor(shape, name),
  };
}

const MEASURED_RE = /([A-Za-z ]+?)\s+(\d+(?:\.\d+)?)\s*(mm|g)\b/g;

/** AVONET numbers out of a 'Measured: ...' distinguishing string. */
export function parseMeasurements(entry) {
  const out = {};
  for (const feat of entry.distinguishing_features || []) {
    if (typeof feat !== 'string' || !feat.includes('Measured:')) continue;
    for (const m of feat.matchAll(MEASURED_RE)) {
      let key = m[1].trim().toLowerCase().replace(/ /g, '_');
      if (key.startsWith('body_mass')) key = 'mass_g';
      else if (m[3] === 'mm') key += '_mm';
      out[key] = parseFloat(m[2]);
    }
  }
  return out;
}

/**
 * A raw build-map entry -> numeric plan.
 * Returns { template: null, level: entry.confidence, parts, dropped,
 *             measurements }.
 */
export function normalizeEntry(rawEntry) {
  const parts = [];
  const dropped = [];
  for (const part of rawEntry.parts || []) {
    const p = normalizePart(part);
    if (p) parts.push(p);
    else dropped.push(String(part.name).toLowerCase());
  }
  return {
    template: null,
    level: rawEntry.confidence || 'higher-taxon',
    parts,
    dropped,
    measurements: parseMeasurements(rawEntry),
  };
}

// ── compiled-plan normalization ────────────────────────────────────

export const MAX_VISIBLE_PARTS = 6;

/** Lower = survives the budget cut. The silhouette always wins. */
export const PART_PRIORITY = {
  body: 0, thorax: 0, abdomen: 0, trunk: 0, stem: 0, stipe: 0, cap: 0,
  shell: 0, 'shell valves': 0, polyp: 0, skeleton: 0, crown: 0, foot: 0,
  head: 1,
  legs: 2, forelegs: 2, hindlegs: 2, arms: 2, tentacles: 2,
  wings: 3, tail: 3, 'dorsal fin': 3, 'dorsal fins': 3, 'caudal fin': 3,
  eyes: 3,
  'compound eyes': 3, beak: 3,
  ears: 4, antennae: 4, muzzle: 4, 'pectoral fins': 4, 'pelvic fins': 4,
  'anal fin': 4,
};

export function partPriority(name, flying = false) {
  // A flying creature tucks its legs — they stop being silhouette.
  if (flying && (name === 'legs' || name === 'feet')) return 4;
  return PART_PRIORITY[name] ?? 5;
}

/** Meshes a part costs: a flap part is two meshes when it flies. */
export function meshCost(part, flying = false) {
  return part.kind === 'flap' && flying ? 2 : 1;
}

/** A compiled part tuple -> part object. */
export function tupleToPart(t) {
  return {
    name: t[0], count: t[1], shape: t[2], kind: t[3], dist: t[4],
    pos: [t[5], t[6], t[7]],
    size: [t[8], t[9], t[10]],
    rot: [t[11], t[12], t[13]],
  };
}

/** Enforce the ≤6 visible-mesh budget; returns { parts, dropped }. */
export function enforceBudget(parts, flying = false) {
  // Stable sort by priority: template order breaks ties, so the
  // defining part of a tied pair (beak before wings, eyes before
  // antennae) survives. Fill in priority order, skipping a part
  // that no longer fits but still considering cheaper ones after it.
  const sorted = [...parts].sort(
    (a, b) => partPriority(a.name, flying) - partPriority(b.name, flying));
  const kept = [];
  const dropped = [];
  let cost = 0;
  for (const p of sorted) {
    const c = meshCost(p, flying);
    if (cost + c <= MAX_VISIBLE_PARTS) {
      kept.push(p);
      cost += c;
    } else {
      dropped.push(p.name);
    }
  }
  return { parts: kept, dropped };
}

// Hand-written fallbacks for a species the JSON does not know, keyed
// by kingdom. The compiled JSON's own generic templates are tried
// first (see normalizePlan); these are the last resort.
export const FALLBACK_TEMPLATES = {
  Animalia: 'small_animal_generic',
  Plantae: 'plant_generic',
  Fungi: 'fungus_generic',
};

export const FALLBACK_PLANS = {
  Animalia: {
    template: 'small_animal_generic', level: 'fallback',
    parts: [
      { name: 'body', count: 1, shape: 'sphere', kind: 'single',
        dist: 'single', pos: [0, 0, 0], size: [0.77, 0.44, 0.44],
        rot: [0, 0, 0] },
      { name: 'head', count: 1, shape: 'sphere', kind: 'single',
        dist: 'single', pos: [0.32, 0, 0], size: [0.34, 0.19, 0.19],
        rot: [0, 0, 0] },
    ],
    dropped: [], measurements: {},
  },
  Plantae: {
    template: 'plant_generic', level: 'fallback',
    parts: [
      { name: 'stem', count: 1, shape: 'cylinder', kind: 'single',
        dist: 'single', pos: [0, 0, 0], size: [0.08, 0.61, 0.08],
        rot: [0, 0, 0] },
      { name: 'leaves', count: 6, shape: 'sphere', kind: 'repeat',
        dist: 'canopy', pos: [0, 0.22, 0], size: [0.288, 0.108, 0.288],
        rot: [0, 0, 0] },
    ],
    dropped: [], measurements: {},
  },
  Fungi: {
    template: 'fungus_generic', level: 'fallback',
    parts: [
      { name: 'cap', count: 1, shape: 'sphere', kind: 'single',
        dist: 'single', pos: [0, 0.4, 0], size: [0.46, 0.23, 0.46],
        rot: [0, 0, 0] },
      { name: 'stipe', count: 1, shape: 'cylinder', kind: 'single',
        dist: 'single', pos: [0, 0, 0], size: [0.08, 0.61, 0.08],
        rot: [0, 0, 0] },
    ],
    dropped: [], measurements: {},
  },
};

/** Render size in metres, clamped the way the old scene did. */
export function renderSizeFor(sizeM) {
  const s = Number(sizeM);
  if (!Number.isFinite(s)) return 1;
  return Math.min(30, Math.max(0.05, s));
}

/**
 * The compiled plans doc + a species name -> numeric build plan.
 * Returns { template, level, parts, dropped, measurements, sizeM }.
 * A species missing from the doc falls back to its kingdom's generic
 * template (from the doc when present, hand-written otherwise).
 */
export function normalizePlan(doc, speciesName, sizeM, kingdom, flying = false) {
  const rec = doc && doc.plans ? doc.plans[speciesName] : null;
  if (rec) {
    const tuples = rec.p
      || (doc.templates && doc.templates[rec.t]
        ? doc.templates[rec.t].parts : null);
    if (tuples) {
      const { parts, dropped } = enforceBudget(
        tuples.map(tupleToPart), flying);
      return {
        template: rec.t,
        level: rec.l,
        parts,
        dropped,
        measurements: rec.m || {},
        sizeM: renderSizeFor(sizeM),
      };
    }
  }
  // Unknown species (or a template id the doc does not carry):
  // the kingdom's generic template, then the hand-written fallback.
  const tplId = FALLBACK_TEMPLATES[kingdom] || FALLBACK_TEMPLATES.Animalia;
  const tpl = doc && doc.templates ? doc.templates[tplId] : null;
  if (tpl) {
    const { parts, dropped } = enforceBudget(
      tpl.parts.map(tupleToPart), flying);
    return {
      template: tplId, level: 'fallback', parts, dropped,
      measurements: {}, sizeM: renderSizeFor(sizeM),
    };
  }
  const fb = FALLBACK_PLANS[kingdom] || FALLBACK_PLANS.Animalia;
  return { ...fb, sizeM: renderSizeFor(sizeM) };
}

/** Convenience: plan for a spawner record (name/kingdom/sizeM/flying). */
export function planForSpecies(doc, creature) {
  return normalizePlan(doc, creature.name, creature.sizeM,
    creature.kingdom, !!creature.flying);
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}
