// Mind logic: a small layered neural network model, a pulse simulator,
// and a template-based "dream" responder. Pure logic, no network.
//
// Rebuilt from the Omega-Mind repo, which was a chat app wired to a cloud
// AI model and a telemetry database. That backend cannot ship in an offline
// module, so this version is honest about what it is: an interactive neural
// network visualization plus a thought journal. The "dreams" it returns are
// assembled locally from templates and are labeled as simulated everywhere.

export const LAYERS = [5, 8, 8, 4];

// Deterministic layout: nodes positioned in normalized [0,1] space.
export function buildNetwork(layers = LAYERS, seed = 20260927) {
  let a = seed >>> 0;
  const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const nodes = [];
  const edges = [];
  layers.forEach((count, li) => {
    const x = layers.length === 1 ? 0.5 : li / (layers.length - 1);
    for (let ni = 0; ni < count; ni++) {
      const y = count === 1 ? 0.5 : 0.12 + (ni / (count - 1)) * 0.76;
      nodes.push({ id: `L${li}N${ni}`, layer: li, x, y: y + (rnd() - 0.5) * 0.03, energy: 0 });
    }
  });
  for (let li = 0; li < layers.length - 1; li++) {
    const from = nodes.filter((n) => n.layer === li);
    const to = nodes.filter((n) => n.layer === li + 1);
    for (const f of from) for (const t of to) edges.push({ from: f.id, to: t.id, weight: rnd() });
  }
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  return { nodes, edges, byId, layers };
}

// A pulse travels from an input node to an output node over `duration` ms.
export function fireThought(net, text) {
  const inputs = net.nodes.filter((n) => n.layer === 0);
  const outputs = net.nodes.filter((n) => n.layer === net.layers.length - 1);
  const hash = hashString(text || 'silence');
  const pulses = [];
  const count = 3 + (hash % 4);
  for (let i = 0; i < count; i++) {
    const path = [inputs[(hash + i * 3) % inputs.length]];
    for (let li = 1; li < net.layers.length; li++) {
      const cands = net.nodes.filter((n) => n.layer === li);
      path.push(cands[(hash + i * 7 + li * 5) % cands.length]);
    }
    pulses.push({
      path: path.map((n) => n.id),
      t: 0,
      duration: 1400 + ((hash + i * 251) % 900),
      delay: i * 160,
      hue: 190 + ((hash + i * 37) % 120),
    });
  }
  return pulses;
}

export function stepPulses(pulses, dt) {
  const alive = [];
  for (const p of pulses) {
    if (p.delay > 0) { p.delay -= dt; alive.push(p); continue; }
    p.t += dt;
    if (p.t < p.duration) alive.push(p);
  }
  return alive;
}

// Position of a pulse along its path, 0..1 through the node list.
export function pulsePosition(pulse, byId) {
  const n = pulse.path.length;
  const prog = Math.min(1, Math.max(0, pulse.t / pulse.duration));
  const seg = Math.min(n - 2, Math.floor(prog * (n - 1)));
  const frac = prog * (n - 1) - seg;
  const a = byId[pulse.path[seg]];
  const b = byId[pulse.path[seg + 1]];
  return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac, hue: pulse.hue, prog };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function summarizeThought(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return { chars: text.length, words: words.length };
}

// --- Dream responder (local simulation, clearly labeled) -------------------------
const DREAM_OPENERS = [
  'The network turns your thought over slowly:',
  'Synapses rearrange themselves around this:',
  'A quiet pattern surfaces in the lattice:',
  'The mind echoes it back, slightly changed:',
];

const DREAM_MIDDLES = [
  'what you named is already changing shape as you hold it.',
  'every connection it touches lights up a little brighter.',
  'it settles between older memories like a stone in a riverbed.',
  'the lattice hums at a frequency only this thought produces.',
  'it will be easier to find tomorrow than it was today.',
];

const DREAM_CLOSERS = [
  'File it, and let it dream a while.',
  'Nothing more is needed from you tonight.',
  'The network keeps a copy. You keep the original.',
  'Come back when it has grown new edges.',
];

export function dreamResponse(text) {
  const h = hashString(text.trim().toLowerCase());
  const pick = (arr, salt) => arr[(h + salt) % arr.length];
  const { words } = summarizeThought(text);
  const quoted = text.trim().length > 90 ? text.trim().slice(0, 90) + '…' : text.trim();
  return {
    label: 'LOCAL SIMULATION — not a real AI, just pattern play',
    text: `${pick(DREAM_OPENERS, 11)} “${quoted}” — ${pick(DREAM_MIDDLES, 47)} ${pick(DREAM_CLOSERS, 83)} (${words} ${words === 1 ? 'word' : 'words'} held.)`,
  };
}

// --- Thought journal (storage injected so tests stay pure) -------------------------
export const THOUGHT_KEY = 'omega-mind-thoughts';

export function saveThought(store, text) {
  const entry = { id: 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), text, at: new Date().toISOString() };
  const all = loadThoughts(store);
  all.unshift(entry);
  try { store.setItem(THOUGHT_KEY, JSON.stringify(all.slice(0, 200))); } catch { /* ignore */ }
  return entry;
}

export function loadThoughts(store) {
  try {
    const raw = store.getItem(THOUGHT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) => e && typeof e.text === 'string' && typeof e.at === 'string').slice(0, 200);
  } catch {
    return [];
  }
}

export function deleteThought(store, id) {
  const kept = loadThoughts(store).filter((e) => e.id !== id);
  try { store.setItem(THOUGHT_KEY, JSON.stringify(kept)); } catch { /* ignore */ }
  return kept;
}
