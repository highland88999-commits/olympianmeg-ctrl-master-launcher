// tests/air-hockey-kaleidoscope.test.mjs — Merlin's kaleidoscope option for Air Hockey.
// Run: node tests/air-hockey-kaleidoscope.test.mjs (from the repo root).
// Covers: default is the current launcher table, the toggle switches to his
// kaleidoscope, the choice persists, and his shader is ported faithfully.
import {
  VISUAL_MODES, DEFAULT_VISUAL, VISUAL_SETTING_KEY,
  sanitizeVisual, loadVisualChoice, saveVisualChoice,
  createKaleidoscope, KALEIDOSCOPE_FRAG,
} from '../app/air-hockey/kaleidoscope.js';
import { drawScene } from '../app/air-hockey/render.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}

// --- visual-mode setting ---------------------------------------------------
t('default visual is the current launcher table', DEFAULT_VISUAL === 'classic');
t('kaleidoscope is a valid mode', VISUAL_MODES.includes('kaleidoscope'));
t('sanitize keeps classic', sanitizeVisual('classic') === 'classic');
t('sanitize keeps kaleidoscope', sanitizeVisual('kaleidoscope') === 'kaleidoscope');
for (const junk of [undefined, null, '', 'pro', 'KALEIDOSCOPE', 42, {}]) {
  t(`sanitize rejects ${JSON.stringify(junk)}`, sanitizeVisual(junk) === 'classic');
}

// No storage at all (SSR / private mode) -> default, never throws.
t('loadVisualChoice defaults with no storage', loadVisualChoice(null) === 'classic');
t('loadVisualChoice defaults with empty storage', loadVisualChoice({ getItem: () => null }) === 'classic');
t('saveVisualChoice tolerates no storage', (() => { saveVisualChoice('kaleidoscope', null); return true; })());

// Persistence round-trip: the choice survives, and junk never persists.
function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}
{
  const s = memStorage();
  saveVisualChoice('kaleidoscope', s);
  t('choice persists (kaleidoscope)', loadVisualChoice(s) === 'kaleidoscope');
  t('setting key is namespaced', s.getItem(VISUAL_SETTING_KEY) === 'kaleidoscope');
  saveVisualChoice('classic', s);
  t('choice persists (back to classic)', loadVisualChoice(s) === 'classic');
  s.setItem(VISUAL_SETTING_KEY, 'pro'); // a stale/foreign value
  t('stale value falls back to default', loadVisualChoice(s) === 'classic');
  const s2 = memStorage();
  saveVisualChoice('pro', s2); // never write junk
  t('junk is sanitized on save', loadVisualChoice(s2) === 'classic');
}

// --- WebGL fallback ---------------------------------------------------------
t('createKaleidoscope returns null without WebGL',
  createKaleidoscope({ getContext: () => null }) === null);

// --- his shader, ported faithfully ------------------------------------------
// His Set-Air-Hockey fragment shader: classic rainbow palette, 8 segments,
// time-animated fractal glow. These guards pin the port to his values.
t('shader keeps his classic palette constants',
  KALEIDOSCOPE_FRAG.includes('vec3(0.263,0.416,0.557)'));
t('shader keeps his 8-segment classic kaleidoscope',
  KALEIDOSCOPE_FRAG.includes('mix(8.0, 12.0, isPro)'));
t('shader keeps his classic glow falloff',
  KALEIDOSCOPE_FRAG.includes('d = pow(0.01 / d, 1.2)'));
t('shader keeps his time animation',
  KALEIDOSCOPE_FRAG.includes('time*.3') && KALEIDOSCOPE_FRAG.includes('abs(sin(d*8. + time))'));
t('shader keeps his radial mirror fold',
  KALEIDOSCOPE_FRAG.includes('angle = abs(angle - 3.14159 / segments)'));
t('shader carries the isPro uniform (pinned to classic, 0.0)',
  KALEIDOSCOPE_FRAG.includes('uniform float isPro'));

// --- renderer: the toggle actually switches the table -----------------------
function mockCtx() {
  const sets = [];
  const calls = [];
  const grad = { addColorStop: () => {} };
  const ctx = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return (...a) => { calls.push([prop, ...a]); return grad; };
      }
      return (...a) => { calls.push([prop, ...a]); };
    },
    set(_t, prop, v) { sets.push([prop, v]); return true; },
  });
  return { ctx, sets, calls };
}
const fakeGame = {
  state: 'playing',
  ai: { x: 200, y: 100 },
  player: { x: 200, y: 700 },
  puck: { x: 200, y: 400 },
  lastScorer: 'player',
};
const fillStyles = (sets) => sets.filter(([p]) => p === 'fillStyle').map(([, v]) => v);
const strokeStyles = (sets) => sets.filter(([p]) => p === 'strokeStyle').map(([, v]) => v);

{
  const m = mockCtx();
  drawScene(m.ctx, fakeGame); // no visual arg -> the default
  t('default drawScene is the classic table (opaque felt)',
    !fillStyles(m.sets).includes('rgba(2, 6, 12, 0.72)') && m.calls.some(([c]) => c === 'createLinearGradient'));
}
{
  const m = mockCtx();
  drawScene(m.ctx, fakeGame, 'classic');
  t('explicit classic keeps the launcher rails',
    strokeStyles(m.sets).includes('#1e3a52'));
}
{
  const m = mockCtx();
  drawScene(m.ctx, fakeGame, 'kaleidoscope');
  t('kaleidoscope mode uses his translucent table surface',
    fillStyles(m.sets).includes('rgba(2, 6, 12, 0.72)'));
  t('kaleidoscope mode wears his deep blue frame',
    strokeStyles(m.sets).includes('#1e40af'));
  t('kaleidoscope mode still draws the puck and mallets',
    m.calls.some(([c]) => c === 'arc'));
}

console.log(`air-hockey-kaleidoscope: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
