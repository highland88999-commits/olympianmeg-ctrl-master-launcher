// lib/hephaestus.js
// Hephaestus — the forge of the empire. Pure logic for the /hephaestus module.
// Headless: no DOM, no network. UI lives in app/hephaestus/page.jsx.
// Persistence is localStorage-only (SQL deferred to the final consolidated prompt).

// --- The Forge: digital module pipeline stages ---
export const FORGE_STAGES = [
  { id: 'concept', label: 'Concept', blurb: 'A named idea with a mythic heart.' },
  { id: 'audit', label: 'Audit', blurb: 'Read everything. Trust nothing.' },
  { id: 'strip', label: 'Strip', blurb: 'Telemetry, trackers and junk go in the fire.' },
  { id: 'build', label: 'Build', blurb: 'Forged clean, to the quality bar.' },
  { id: 'test', label: 'Test', blurb: 'Headless tests. No excuses.' },
  { id: 'publish', label: 'Publish', blurb: 'Shipped as a pocket universe.' },
];
export const FORGE_STAGE_IDS = FORGE_STAGES.map((s) => s.id);

// --- The Foundry: idea stages ---
export const IDEA_STAGES = [
  { id: 'spark', label: 'Spark', blurb: 'A raw flash of an idea.' },
  { id: 'ember', label: 'Ember', blurb: 'Glowing, taking shape.' },
  { id: 'forged', label: 'Forged', blurb: 'Shaped into something real.' },
];
export const IDEA_STAGE_IDS = IDEA_STAGES.map((s) => s.id);

export function nextIdeaStage(stage) {
  const i = IDEA_STAGE_IDS.indexOf(stage);
  if (i === -1 || i === IDEA_STAGE_IDS.length - 1) return stage;
  return IDEA_STAGE_IDS[i + 1];
}

export function nextForgeStage(stage) {
  const i = FORGE_STAGE_IDS.indexOf(stage);
  if (i === -1 || i === FORGE_STAGE_IDS.length - 1) return stage;
  return FORGE_STAGE_IDS[i + 1];
}

// --- Foundry seeds: Merlin's (Artemis') own words ---
// origin 'artemis' = seeded by Merlin. prime = prime-directive level.
export const SEED_IDEAS = [
  {
    id: 'seed-poverty',
    text: 'Poverty needs to end.',
    detail: 'The prime directive. Everything the forge makes serves this.',
    stage: 'spark', origin: 'artemis', prime: true,
  },
  {
    id: 'seed-homelessness',
    text: 'End homelessness.',
    detail: 'A concrete front of the prime directive. The seed of the answer is tensegrity housing — shelter that rides the wind like a spider web, raised above the flood line. The Factory\u2019s physical arm exists for exactly this kind of thing.',
    stage: 'spark', origin: 'artemis', prime: true,
  },
  {
    id: 'seed-reverse-pollution',
    text: 'Reverse pollution.',
    detail: 'Pollution is not waste — it is starting material. Smelt the problem, forge the answer.',
    stage: 'ember', origin: 'artemis', prime: false,
  },
  {
    id: 'seed-digital-physical',
    text: 'The digital pays for physical.',
    detail: 'Digital products fund physical pilots. The loop is visible in the Factory chamber.',
    stage: 'ember', origin: 'artemis', prime: false,
  },
  {
    id: 'seed-alchemy',
    text: 'Problems are starting material \u2014 it\u2019s all alchemy.',
    detail: 'Every problem the forge touches becomes the raw ore of its solution.',
    stage: 'ember', origin: 'artemis', prime: false,
  },
  {
    id: 'seed-multiply',
    text: 'Take my logic and make it multiply to as many people as possible.',
    detail: 'The mission of this forge. One spark of logic, branching outward.',
    stage: 'spark', origin: 'artemis', prime: false,
  },
  {
    id: 'seed-datacentre',
    text: 'AI data centres that cool and purify water \u2014 and power the grid instead of draining it.',
    detail: 'Infrastructure that gives back more than it takes.',
    stage: 'spark', origin: 'artemis', prime: false,
  },
  {
    id: 'seed-tensegrity',
    text: 'Tensegrity housing that rides the wind like a spider web.',
    detail: 'Above the flood line. Tensigrified shelter, light and strong.',
    stage: 'spark', origin: 'artemis', prime: false,
  },
  {
    id: 'seed-aircar',
    text: 'The air-powered car.',
    detail: 'A car without a combustion engine. The forge waits on the blueprints.',
    stage: 'spark', origin: 'artemis', prime: false,
  },
];

// --- Commission intake validation ---
export function validateCommission({ name, concept, mythicName }) {
  const errors = [];
  if (!name || !String(name).trim()) errors.push('Give the universe a name.');
  else if (String(name).trim().length > 60) errors.push('Keep the name under 60 characters.');
  if (!concept || !String(concept).trim()) errors.push('Describe the concept in a sentence or two.');
  else if (String(concept).trim().length < 10) errors.push('The concept needs a little more shape (10+ characters).');
  if (mythicName && String(mythicName).trim().length > 40) errors.push('Keep the mythic name under 40 characters.');
  return { ok: errors.length === 0, errors };
}

// --- Mythic name suggestions (deterministic, no randomness in tests) ---
const MYTHIC_NAMES = [
  { name: 'Talos', hint: ['machine', 'robot', 'automaton', 'guard', 'bronze'] },
  { name: 'Daedalus', hint: ['build', 'craft', 'invent', 'maze', 'wing', 'labyrinth'] },
  { name: 'Selene', hint: ['moon', 'night', 'lunar', 'tide'] },
  { name: 'Eos', hint: ['dawn', 'morning', 'sunrise', 'begin'] },
  { name: 'Nyx', hint: ['dark', 'shadow', 'dream', 'sleep'] },
  { name: 'Proteus', hint: ['sea', 'ocean', 'water', 'change', 'shift', 'shape'] },
  { name: 'Aether', hint: ['sky', 'air', 'upper', 'light', 'space'] },
  { name: 'Theia', hint: ['sight', 'vision', 'eye', 'oracle', 'gold'] },
  { name: 'Crius', hint: ['ram', 'star', 'constellation'] },
  { name: 'Erebus', hint: ['deep', 'abyss', 'underworld', 'depth'] },
  { name: 'Hemera', hint: ['day', 'light', 'bright'] },
  { name: 'Iris', hint: ['rainbow', 'message', 'messenger', 'color'] },
];

export function suggestMythicName(concept) {
  const text = String(concept || '').toLowerCase();
  for (const entry of MYTHIC_NAMES) {
    if (entry.hint.some((h) => text.includes(h))) return entry.name;
  }
  // Deterministic fallback: hash the concept to an index.
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return MYTHIC_NAMES[hash % MYTHIC_NAMES.length].name;
}

// --- The Multiplier: share copy builders (pure; caller supplies baseUrl) ---
export function buildShareCopy(kind, title, detail, baseUrl) {
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/hephaestus`;
  const kindLabel = { commission: 'a new pocket universe', idea: 'an idea from the foundry', product: 'a physical good' }[kind] || 'something';
  const text = `Hephaestus \u2014 the forge of the empire. ${title}: ${kindLabel}. "${detail || title}" Take the logic, multiply it. ${url}`;
  return { text, url };
}

// --- Safe storage helpers (no-op outside the browser) ---
export function loadJSON(key, fallback) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// --- The Factory: real product data (read from the app's own sources) ---
// Olympus: lib/olympus/products.js — CURRENCY 'cad', PRICE_CENTS 9500.
export const OLYMPUS_FACTS = {
  count: 24,
  priceCad: 95.0,
  note: 'Graphic tees and hoodies, made to order.',
  route: '/olympus',
};
export const OLYMPUS_PRODUCTS = [
  { name: 'Glitch', tag: 'Graphic tee' },
  { name: 'Sandstone', tag: 'Graphic tee' },
  { name: 'Bookworm', tag: 'Graphic tee' },
  { name: 'Grafitti Wear', tag: 'Graphic tee' },
  { name: 'Mud Camo', tag: 'Graphic tee' },
  { name: 'Break The Chains', tag: 'Graphic tee' },
  { name: 'Hey Zeus!!', tag: 'Graphic tee' },
  { name: 'Date Night in Paris', tag: 'Graphic tee' },
  { name: 'The Butterfly Effect', tag: 'Graphic tee' },
  { name: 'Jewel of The North', tag: 'Graphic tee' },
  { name: 'Lepidopterology', tag: 'Graphic tee' },
  { name: 'Rose Gold Hoodie', tag: 'Hoodie' },
  { name: 'Hummingbirds Hoodie', tag: 'Hoodie' },
  { name: 'Midnight in Paris Hoodie', tag: 'Hoodie' },
  { name: 'Liquid Gold Hoodie', tag: 'Hoodie' },
  { name: 'Emerald Green Hoodie', tag: 'Hoodie' },
  { name: 'River Rafting Hoodie', tag: 'Hoodie' },
  { name: 'Safari Tours Hoodie', tag: 'Hoodie' },
  { name: 'The Frog Hoodie', tag: 'Hoodie' },
  { name: 'Mon Amour Hoodie', tag: 'Hoodie' },
  { name: 'Dawn Hoodie', tag: 'Hoodie' },
  { name: 'The Leaf of Life Hoodie', tag: 'Hoodie' },
  { name: 'Veins in the Mountains Hoodie', tag: 'Hoodie' },
  { name: 'Balance the Scales Hoodie', tag: 'Hoodie' },
];

// Luge: "Complete Arsenal" pack — $129 USD (Merlin-confirmed, price set on the
// server at checkout), 26 premium hulls (lib/luge_data.js), one hoodie claim
// per owner, verified server-side. Hoodie costs $72 CAD landed.
export const LUGE_ARSENAL_FACTS = {
  name: 'Complete Arsenal',
  priceUsd: 129,
  premiumHulls: 26,
  includes: 'One hoodie claim per owner \u2014 verified on the server, no screenshots.',
  hoodieLandedCad: 72,
  route: '/luge',
};

// The visible loop: digital revenue -> physical production -> real hands.
export const FACTORY_LOOP = [
  { id: 'sale', label: 'Digital sale', blurb: 'Someone buys in the digital world \u2014 a design, an arsenal, a credit.' },
  { id: 'forge-cut', label: "The forge's cut", blurb: 'Revenue flows back into the forge instead of out to middlemen.' },
  { id: 'production', label: 'Physical production', blurb: 'The factory makes the real thing: printed, stitched, claimed.' },
  { id: 'hands', label: 'Real hands', blurb: 'It lands with a real person. The loop is the point.' },
];
