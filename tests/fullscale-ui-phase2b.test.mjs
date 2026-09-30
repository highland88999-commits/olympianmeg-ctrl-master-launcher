// Full-scale UI upgrade — Phase 2b regression tests.
// Guards the mechanical sweep: canonical player clearance, dvh, text
// selection, dead-token removal, palette, placement-collision fixes, home
// scene code-split, and the public asset diet.
// Convention: source-level assertions (readFileSync), no JSX imports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const src = (p) => readFileSync(path.join(ROOT, p), 'utf8');

function walk(dir, exts, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (e === 'node_modules' || e === '.next' || e === '.git') continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => p.endsWith(x))) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p);
// Strip comments so documentation notes (e.g. "Retired: #08f7fe") don't
// false-positive as live code.
const stripComments = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\w$'":])\/\/[^\n]*/g, '$1');
const SRC_FILES = () =>
  walk(path.join(ROOT, 'app'), ['.jsx', '.tsx', '.js', '.ts', '.css'])
    .concat(walk(path.join(ROOT, 'components'), ['.jsx', '.tsx', '.js', '.ts', '.css']))
    .concat(walk(path.join(ROOT, 'lib'), ['.js', '.ts']));

test('phase2b: player clearance is canonical (5.5rem + safe-area), old spacers gone', () => {
  const css = src('app/globals.css');
  assert.match(
    css,
    /\.player-clear\s*\{[^}]*5\.5rem[^}]*env\(safe-area-inset-bottom/,
    '.player-clear = 5.5rem + safe-area-inset-bottom'
  );
  for (const f of SRC_FILES()) {
    const t = stripComments(readFileSync(f, 'utf8'));
    assert.ok(
      !t.includes('h-[calc(4.5rem+env(safe-area-inset-bottom))]'),
      `old 4.5rem spacer in ${rel(f)}`
    );
  }
});

test('phase2b: no global text-selection block; canvas stays non-selectable', () => {
  const css = src('app/globals.css');
  assert.ok(!/body\s*\{[^}]*user-select:\s*none/.test(css), 'body has no user-select:none');
  assert.match(css, /canvas[^{]*\{[^}]*user-select:\s*none/, 'canvas keeps user-select:none');
  assert.match(css, /\.no-select[^{]*\{[^}]*user-select:\s*none/, '.no-select helper exists');
});

test('phase2b: dead placement helpers removed, shared ones retained', () => {
  const css = src('app/globals.css');
  for (const dead of ['.scroll-page', '.scroll-clear', '.page-shell', '.page-col']) {
    assert.ok(!new RegExp(dead.replace('.', '\\.') + '\\s*\\{').test(stripComments(css)), `${dead} removed`);
  }
  assert.ok(css.includes('.page-header'), '.page-header retained (BackButton/PageBack)');
  assert.ok(css.includes('.page-back'), '.page-back retained (BackButton/PageBack)');
});

test('phase2b: dead Tailwind tokens removed', () => {
  const cfg = src('tailwind.config.js');
  const cfgCode = stripComments(cfg);
  assert.ok(!/['"]?jet['"]?\s*:/.test(cfgCode), 'jet token removed');
  assert.ok(!/cerberus\s*:\s*\{/.test(cfgCode), 'cerberus tokens removed');
});

test('phase2b: retired palette hexes gone from source', () => {
  const retired = ['#08f7fe', '#00f3ff', '#00f9ff', '#d4af37', '#fbbf24', '#0a0a0a', '#111111', '#ff0044'];
  const bad = [];
  for (const f of SRC_FILES()) {
    const t = stripComments(readFileSync(f, 'utf8')).toLowerCase();
    for (const hex of retired) {
      if (t.includes(hex)) bad.push(`${rel(f)}:${hex}`);
    }
  }
  assert.deepEqual(bad, [], `retired hexes present:\n${bad.join('\n')}`);
});

test('phase2b: fortress CSS variables are scoped, grief-gully class collision fixed', () => {
  const fcss = src('app/fortress-of-solitude/fortress.css');
  assert.ok(!/(^|\n):root\s*\{/.test(fcss), 'no leaked :root in fortress.css');
  assert.ok(fcss.includes('.fortress-scope'), '.fortress-scope owns the variables');
  const gg = src('app/grief-gully/page.jsx');
  assert.ok(!gg.includes('page-header') || gg.includes('gg-page-header'), 'grief-gully header renamed');
  assert.ok(!/"page-header"|'page-header'/.test(gg), 'no bare .page-header class in grief-gully');
});

test('phase2b: home 3D scene is code-split (no static three.js in the page shell)', () => {
  const page = src('app/page.jsx');
  assert.ok(!page.includes('@react-three/fiber'), 'page has no static fiber import');
  assert.ok(!page.includes('@react-three/drei'), 'page has no static drei import');
  assert.ok(!page.includes('@react-three/postprocessing'), 'page has no static postprocessing import');
  assert.ok(!page.includes("from 'three'"), 'page has no static three import');
  assert.match(page, /dynamic\(\(\) => import\('@\/components\/HomeScene'\),\s*\{\s*ssr:\s*false/, 'HomeScene loads via next/dynamic ssr:false');
  assert.ok(existsSync(path.join(ROOT, 'components/HomeScene.jsx')), 'components/HomeScene.jsx exists');
  assert.ok(existsSync(path.join(ROOT, 'lib/home-positions.js')), 'lib/home-positions.js exists');
  // The scene itself keeps every original prop and the stake.com ad path.
  const scene = src('components/HomeScene.jsx');
  assert.ok(scene.includes('onLaunchExternal'), 'ad launch path preserved in HomeScene');
  assert.ok(scene.includes('SequenceController'), 'SequenceController preserved');
  assert.ok(scene.includes('EarthFlightController'), 'EarthFlightController preserved');
});

test('phase2b: no .mov references remain; browser-compatible mp4s in use', () => {
  const bad = [];
  for (const f of SRC_FILES()) {
    const t = stripComments(readFileSync(f, 'utf8'));
    const hits = t.match(/[\w\-/]+\.mov(?=["'\)\s])/g);
    if (hits) bad.push(`${rel(f)}: ${hits.join(', ')}`);
  }
  assert.deepEqual(bad, [], `.mov references remain:\n${bad.join('\n')}`);
});

test('phase2b: banned 100vh roots gone from swept sources', () => {
  const bad = [];
  for (const f of SRC_FILES()) {
    if (/node_modules|\.next/.test(f)) continue;
    let t = stripComments(readFileSync(f, 'utf8'));
    // Allow the intentional progressive-enhancement fallback pair
    // (100vh declaration immediately overridden by 100dvh).
    t = t.replace(/[a-z-]+\s*:\s*100vh\s*;\s*[a-z-]+\s*:\s*100dvh/g, '');
    if (/min-h-screen|h-screen|100vh/.test(t)) bad.push(rel(f));
  }
  assert.deepEqual(bad, [], `100vh/h-screen roots remain:\n${bad.join('\n')}`);
});
