// Tests for the /omega-mind module.
// Run with: node --test tests/omega-mind.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  buildNetwork, fireThought, stepPulses, pulsePosition, hashString,
  summarizeThought, dreamResponse, saveThought, loadThoughts, deleteThought,
  LAYERS, THOUGHT_KEY,
} from '../app/omega-mind/mind.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app', 'omega-mind');
const read = (f) => readFileSync(join(appDir, f), 'utf8');

// In-memory storage stand-in for localStorage
function memStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    _raw: (k) => m.get(k),
  };
}

// --- Network ----------------------------------------------------------------------
test('buildNetwork creates layered nodes and full connectivity', () => {
  const net = buildNetwork();
  const total = LAYERS.reduce((a, b) => a + b, 0);
  assert.equal(net.nodes.length, total);
  const expectedEdges = LAYERS.slice(0, -1).reduce((a, c, i) => a + c * LAYERS[i + 1], 0);
  assert.equal(net.edges.length, expectedEdges);
  for (const n of net.nodes) {
    assert.ok(n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1);
    assert.equal(net.byId[n.id], n);
  }
});

test('buildNetwork is deterministic', () => {
  assert.deepEqual(buildNetwork(), buildNetwork());
});

// --- Pulses --------------------------------------------------------------------------
test('fireThought emits pulses from input to output layer', () => {
  const net = buildNetwork();
  const pulses = fireThought(net, 'hello lattice');
  assert.ok(pulses.length >= 3);
  for (const p of pulses) {
    assert.equal(p.path.length, LAYERS.length);
    assert.equal(net.byId[p.path[0]].layer, 0);
    assert.equal(net.byId[p.path[p.path.length - 1]].layer, LAYERS.length - 1);
    assert.ok(p.duration > 0 && p.hue >= 190);
  }
});

test('fireThought is deterministic per text', () => {
  const net = buildNetwork();
  assert.deepEqual(fireThought(net, 'same'), fireThought(net, 'same'));
  assert.notDeepEqual(fireThought(net, 'same'), fireThought(net, 'different'));
});

test('stepPulses retires finished pulses', () => {
  let pulses = [{ path: ['a', 'b'], t: 0, duration: 100, delay: 0, hue: 200 }];
  pulses = stepPulses(pulses, 50);
  assert.equal(pulses.length, 1);
  pulses = stepPulses(pulses, 60);
  assert.equal(pulses.length, 0);
});

test('stepPulses honors the launch delay', () => {
  let pulses = [{ path: ['a', 'b'], t: 0, duration: 100, delay: 200, hue: 200 }];
  pulses = stepPulses(pulses, 50);
  assert.equal(pulses.length, 1);
  assert.equal(pulses[0].t, 0, 'not started while delayed');
});

test('pulsePosition interpolates along the path', () => {
  const net = buildNetwork([2, 2]);
  const start = net.byId['L0N0'];
  const end = net.byId['L1N0'];
  const pos0 = pulsePosition({ path: ['L0N0', 'L1N0'], t: 0, duration: 100 }, net.byId);
  const pos1 = pulsePosition({ path: ['L0N0', 'L1N0'], t: 100, duration: 100 }, net.byId);
  assert.ok(Math.abs(pos0.x - start.x) < 1e-9 && Math.abs(pos0.y - start.y) < 1e-9);
  assert.ok(Math.abs(pos1.x - end.x) < 1e-9 && Math.abs(pos1.y - end.y) < 1e-9);
});

// --- Dream responder ----------------------------------------------------------------------
test('dreamResponse is labeled as simulation and echoes the thought', () => {
  const d = dreamResponse('the stars are loud tonight');
  assert.ok(d.label.toLowerCase().includes('simulation'));
  assert.ok(!d.label.toLowerCase().includes('real ai') || d.label.toLowerCase().includes('not a real ai'));
  assert.ok(d.text.includes('the stars are loud tonight'));
});

test('dreamResponse is deterministic per thought', () => {
  assert.deepEqual(dreamResponse('abc'), dreamResponse('abc'));
});

test('dreamResponse truncates long thoughts', () => {
  const d = dreamResponse('x'.repeat(200));
  assert.ok(d.text.includes('…'));
});

test('summarizeThought counts words and chars', () => {
  assert.deepEqual(summarizeThought('  hello   world '), { chars: 16, words: 2 });
  assert.deepEqual(summarizeThought(''), { chars: 0, words: 0 });
});

// --- Journal -------------------------------------------------------------------------------
test('save/load/delete round-trip through injected storage', () => {
  const store = memStore();
  assert.deepEqual(loadThoughts(store), []);
  const e1 = saveThought(store, 'first');
  saveThought(store, 'second');
  const all = loadThoughts(store);
  assert.equal(all.length, 2);
  assert.equal(all[0].text, 'second', 'newest first');
  assert.ok(e1.id && e1.at);
  const kept = deleteThought(store, e1.id);
  assert.equal(kept.length, 1);
  assert.equal(loadThoughts(store).length, 1);
});

test('loadThoughts sanitizes corrupt storage', () => {
  const store = memStore();
  store.setItem(THOUGHT_KEY, 'not json');
  assert.deepEqual(loadThoughts(store), []);
  store.setItem(THOUGHT_KEY, JSON.stringify([{ text: 42 }, { text: 'ok', at: 'yesterday' }, null]));
  const all = loadThoughts(store);
  assert.equal(all.length, 1);
  assert.equal(all[0].text, 'ok');
});

test('journal caps at 200 entries', () => {
  const store = memStore();
  for (let i = 0; i < 210; i++) saveThought(store, 't' + i);
  assert.equal(loadThoughts(store).length, 200);
});

// --- Static security scan -----------------------------------------------------------------------
test('no telemetry, AI backends, keys, or external requests in module source', () => {
  const files = readdirSync(appDir).filter((f) => f.endsWith('.js') || f.endsWith('.jsx'));
  assert.ok(files.length >= 2);
  const forbidden = [
    'supabase', 'ipify', 'central_telemetry', 'logBrainAction', 'prompt_history',
    'generative-ai', 'googleapis', 'eyJhbGciOi', 'api_key', 'apikey',
    'http://', 'https://', 'cdn.jsdelivr', 'catbox', 'file.garden',
    '<iframe', '<video', 'mailto:', 'useChat',
  ];
  for (const f of files) {
    const src = read(f);
    for (const pat of forbidden) {
      assert.ok(!src.toLowerCase().includes(pat.toLowerCase()),
        `${f} must not contain "${pat}"`);
    }
  }
});

test('page labels dreams as simulated and stores thoughts locally', () => {
  assert.ok(read('mind.js').includes('LOCAL SIMULATION'), 'dream label must say simulation');
  const src = read('page.jsx');
  assert.ok(src.includes('dream.label'), 'page renders the simulation label');
  assert.ok(src.includes('localStorage'));
  assert.ok(src.includes('prefers-reduced-motion'));
});
