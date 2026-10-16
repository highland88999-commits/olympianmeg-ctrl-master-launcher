// tests/scene-context-guard.test.mjs
//
// WebGL context-loss fleet rollout (2026-10-15). Proves the shared guard
// in lib/scene-context-guard.js behaves the way every scene now relies
// on, and that the rollout actually reached every 3D scene — while
// chess, per standing law, carries none of it.
//
//   1. An invalid canvas is a safe no-op (scenes never crash on it).
//   2. A transient loss (restored inside the grace window) shows
//      nothing and fires the scene hooks exactly once each.
//   3. A loss that stays gone past the grace window surfaces ONE
//      recoverable overlay: scene label, "FEED LOST", reload button.
//   4. The button runs the scene's onReload when one is fitted, and
//      falls back to a page reload otherwise.
//   5. showFallback() (the raw-WebGL path) forces the overlay even
//      after a "restored" event, because raw GL state does not heal.
//   6. dispose() unwatches, clears the grace timer and removes the
//      overlay — no leaks, no late surprises.
//   7. Structural: the guard wraps watchContextLoss, the R3F hook wraps
//      the guard, every wired scene file carries its wiring, and no
//      chess file carries any of it.

import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok ${passed + failed} - ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`not ok ${passed + failed} - ${name}`);
    console.error(String(e && e.stack ? e.stack : e));
  }
}
async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`ok ${passed + failed} - ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`not ok ${passed + failed} - ${name}`);
    console.error(String(e && e.stack ? e.stack : e));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------
// Minimal DOM fakes — just the surface the guard touches.
// ------------------------------------------------------------------
class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parent = null;
    this.style = {};
    this.textContent = '';
    this.type = '';
    this.attrs = {};
    this.listeners = {};
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  remove() {
    if (this.parent) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
      this.parent = null;
    }
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() { (this.listeners.click || []).forEach((fn) => fn({})); }
  findAll(pred, out = []) {
    if (pred(this)) out.push(this);
    for (const c of this.children) c.findAll(pred, out);
    return out;
  }
}
class FakeCanvas {
  constructor() { this.listeners = {}; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    const arr = this.listeners[type] || [];
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }
  fire(type) {
    const ev = { type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    (this.listeners[type] || []).slice().forEach((fn) => fn(ev));
    return ev;
  }
}

const body = new FakeEl('body');
let reloads = 0;
globalThis.document = { createElement: (tag) => new FakeEl(tag), body };
globalThis.window = { location: { reload() { reloads += 1; } } };

const { guardCanvasContext, CONTEXT_LOSS_GRACE_MS } = await import(
  join(repoRoot, 'lib', 'scene-context-guard.js')
);

test('grace window matches the Kombat build (3.5s)', () => {
  assert.equal(CONTEXT_LOSS_GRACE_MS, 3500);
});

test('invalid canvas is a safe no-op guard', () => {
  for (const bad of [null, undefined, {}, 'canvas', 42]) {
    const g = guardCanvasContext(bad, { label: 'X' });
    assert.equal(g.isLost(), false);
    g.showFallback();
    g.dispose(); // must not throw
  }
  assert.equal(body.children.length, 0);
});

await testAsync('transient loss heals silently; hooks fire once each', async () => {
  const canvas = new FakeCanvas();
  let lostCalls = 0;
  let restoredCalls = 0;
  const g = guardCanvasContext(canvas, {
    label: 'TEST',
    graceMs: 30,
    onLost: () => { lostCalls += 1; },
    onRestored: () => { restoredCalls += 1; },
  });
  const ev = canvas.fire('webglcontextlost');
  assert.equal(ev.defaultPrevented, true, 'loss must be preventDefaulted so restore is possible');
  assert.equal(g.isLost(), true);
  canvas.fire('webglcontextlost'); // duplicate fire — watchContextLoss dedupes
  assert.equal(lostCalls, 1);
  await sleep(10);
  canvas.fire('webglcontextrestored');
  assert.equal(g.isLost(), false);
  assert.equal(restoredCalls, 1);
  await sleep(50); // past the grace window — the cleared timer must not fire
  assert.equal(body.children.length, 0, 'no overlay for a healed loss');
  g.dispose();
});

await testAsync('a loss that stays gone surfaces ONE labelled overlay', async () => {
  const canvas = new FakeCanvas();
  const g = guardCanvasContext(canvas, { label: 'MEGA CITY', graceMs: 20 });
  canvas.fire('webglcontextlost');
  await sleep(45);
  assert.equal(body.children.length, 1);
  const overlay = body.children[0];
  const texts = overlay.findAll(() => true).map((el) => el.textContent);
  assert.ok(texts.some((t) => t.includes('MEGA CITY FEED LOST')), 'overlay names the scene');
  assert.ok(texts.some((t) => t.includes('RELOAD SCENE')), 'overlay offers the default reload');
  canvas.fire('webglcontextlost'); // still lost — no second overlay, no re-arm weirdness
  await sleep(30);
  assert.equal(body.children.length, 1);
  canvas.fire('webglcontextrestored'); // a late heal still dismisses it
  assert.equal(body.children.length, 0);
  g.dispose();
});

await testAsync('overlay button runs the fitted onReload', async () => {
  reloads = 0;
  let custom = 0;
  const canvas = new FakeCanvas();
  const g = guardCanvasContext(canvas, {
    label: 'FIGHTER PREVIEW',
    actionLabel: 'RELOAD PREVIEW',
    graceMs: 10,
    onReload: () => { custom += 1; },
  });
  canvas.fire('webglcontextlost');
  await sleep(30);
  const button = body.findAll((el) => el.tagName === 'BUTTON')[0];
  assert.ok(button, 'overlay has a button');
  assert.equal(button.textContent, 'RELOAD PREVIEW');
  button.click();
  assert.equal(custom, 1);
  assert.equal(reloads, 0, 'custom reload wins over page reload');
  g.dispose();
  assert.equal(body.children.length, 0);
});

await testAsync('overlay button defaults to a page reload', async () => {
  reloads = 0;
  const canvas = new FakeCanvas();
  const g = guardCanvasContext(canvas, { label: 'PLAIN', graceMs: 10 });
  canvas.fire('webglcontextlost');
  await sleep(30);
  body.findAll((el) => el.tagName === 'BUTTON')[0].click();
  assert.equal(reloads, 1);
  g.dispose();
});

await testAsync('showFallback forces the overlay (raw WebGL restore path)', async () => {
  const canvas = new FakeCanvas();
  const g = guardCanvasContext(canvas, {
    label: 'RAW',
    graceMs: 60000,
    onRestored: () => g.showFallback(),
  });
  canvas.fire('webglcontextlost');
  canvas.fire('webglcontextrestored'); // "healed" — but raw GL state did not
  assert.equal(body.children.length, 1, 'restored raw context still lands on the fallback');
  g.dispose();
  assert.equal(body.children.length, 0);
});

await testAsync('dispose unwatches, clears the timer, removes the overlay', async () => {
  const canvas = new FakeCanvas();
  const g = guardCanvasContext(canvas, { label: 'GONE', graceMs: 15 });
  canvas.fire('webglcontextlost');
  g.dispose();
  await sleep(40);
  assert.equal(body.children.length, 0, 'disposed guard never shows the overlay');
  canvas.fire('webglcontextlost'); // listeners are gone — no resurrection
  await sleep(30);
  assert.equal(body.children.length, 0);

  const canvas2 = new FakeCanvas();
  const g2 = guardCanvasContext(canvas2, { label: 'GONE2', graceMs: 5 });
  canvas2.fire('webglcontextlost');
  await sleep(25);
  assert.equal(body.children.length, 1);
  g2.dispose();
  assert.equal(body.children.length, 0, 'dispose removes a visible overlay');
});

// ------------------------------------------------------------------
// Structural: the fleet is actually wired, chess is not.
// ------------------------------------------------------------------
test('guard wraps watchContextLoss; the R3F hook wraps the guard', () => {
  const guard = read('lib/scene-context-guard.js');
  assert.ok(guard.includes("from './webgl-support.js'"), 'guard imports the shipped watcher');
  assert.ok(guard.includes('watchContextLoss'), 'guard uses watchContextLoss');
  assert.ok(guard.includes('export function guardCanvasContext'), 'guard exports guardCanvasContext');
  const hook = read('components/SceneContextGuard.jsx');
  assert.ok(hook.includes("from '@/lib/scene-context-guard'"), 'hook imports the guard module');
  assert.ok(hook.includes('export function useSceneContextGuard'), 'hook is exported');
  assert.ok(hook.includes('onCreated'), 'hook hands scenes an onCreated');
});

// Every scene file the rollout wired. If a future scene is added,
// wire it and add it here — this list is the census receipt.
const WIRED = [
  // shared layer
  'components/world-engine/MiniViewport.jsx',
  'lib/world-engine/PrecisionEngine.js',
  'components/glb/ModelViewer.jsx',
  'components/hermes/GalaxyCanvas.jsx',
  // raw three.js engines
  'app/abyssal-voyage/dive3d.js',
  'app/convergence/field3d.js',
  'app/hawkins/engine.js',
  'app/hercules/solarSystem.js',
  'app/hitchhikers-guide/hole3d.js',
  'app/excalibur/scene.js',
  'app/guillotine/scene.js',
  'app/ice-dragon/scene.js',
  'app/ice-monster/scene.js',
  'app/iq-test/scene.js',
  'app/labyrinth/scene.js',
  'app/mega-city/gta-scene.js',
  'app/truman/gta-scene.js',
  'app/order-67/throne-room.js',
  'app/rogers-arena/scene.js',
  'app/new-earth/scene.js',
  'app/statue-of-liberty/liberty3d.js',
  'app/the-big-bang/universe3d.js',
  'app/world-nexus/scene.js',
  // raw WebGL shader scenes (showFallback pattern)
  'app/air-hockey/kaleidoscope.js',
  'app/nexus-symbiote/symbiote-engine.js',
  'app/beehive/page.jsx',
  'app/t-1000/page.jsx',
  // React-effect renderer pages
  'app/alexandria/page.tsx',
  'app/geometry-engine/page.tsx',
  'app/fortress-of-solitude/page.tsx',
  'app/enyo/page.jsx',
  'app/middle-earth/page.jsx',
  'app/star-wars/page.jsx',
  'app/pearl/page.jsx',
  // react-three-fiber scenes
  'app/argo/page.jsx',
  'app/babel/page.jsx',
  'components/basketball/GameCanvas.jsx',
  'app/battleship/page.tsx',
  'app/cerberus/page.tsx',
  'components/colosseum/Pit.jsx',
  'app/erebus/page.jsx',
  'app/luge/page.tsx',
  'components/olympus/SolarSystem.jsx',
  'app/myriad/page.jsx',
  'app/nova/page.jsx',
  'components/persephone/HallScene.jsx',
  'app/shadow-realm/scene.jsx',
  'app/skyscraper/page.jsx',
  'app/skyscraper/components/ApparelRoomScene.jsx',
  'app/skyscraper/components/ColosseumScene.jsx',
  'app/skyscraper/components/DeathStarScene.jsx',
  'app/skyscraper/components/Floor4.jsx',
  'app/skyscraper/components/HermesTerminalScene.jsx',
  'app/skyscraper/components/ExcaliburScene.tsx',
  'app/skyscraper/components/OmegaArchScene.jsx',
  'app/skyscraper/components/VortexMirrorScene.tsx',
  // Kombat's previously unguarded fighter preview (fight engines were
  // already protected in 09391704 and stay untouched here)
  'app/kombat/page.jsx',
];

test('every wired scene file carries the guard wiring', () => {
  for (const rel of WIRED) {
    const src = read(rel);
    assert.ok(
      src.includes('guardCanvasContext') || src.includes('useSceneContextGuard'),
      `${rel} is missing its context-guard wiring`,
    );
  }
});

test('R3F scenes wire onCreated through the shared hook', () => {
  const r3f = WIRED.filter((rel) =>
    ['app/argo/page.jsx', 'app/babel/page.jsx', 'components/basketball/GameCanvas.jsx',
     'app/battleship/page.tsx', 'app/cerberus/page.tsx', 'components/colosseum/Pit.jsx',
     'app/erebus/page.jsx', 'app/luge/page.tsx', 'components/olympus/SolarSystem.jsx',
     'app/myriad/page.jsx', 'app/nova/page.jsx', 'components/persephone/HallScene.jsx',
     'app/shadow-realm/scene.jsx', 'app/skyscraper/page.jsx',
     'app/skyscraper/components/ApparelRoomScene.jsx', 'app/skyscraper/components/ColosseumScene.jsx',
     'app/skyscraper/components/DeathStarScene.jsx', 'app/skyscraper/components/Floor4.jsx',
     'app/skyscraper/components/HermesTerminalScene.jsx'].includes(rel));
  for (const rel of r3f) {
    // Strip block comments first: babel's page carries a {/* */} note
    // that mentions <Canvas> in prose — it is not a second Canvas.
    const src = read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
    const canvases = (src.match(/<Canvas[\s>]/g) || []).length;
    const wired = (src.match(/onCreated=\{sceneGuard\.onCreated\}/g) || []).length;
    assert.equal(wired, canvases, `${rel}: ${wired} of ${canvases} Canvases wired`);
  }
});

test('CHESS IS UNTOUCHED: no guard wiring anywhere under app/chess', () => {
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const files = walk(join(repoRoot, 'app', 'chess'))
    .filter((p) => /\.(jsx?|tsx?)$/.test(p));
  assert.ok(files.length > 0, 'chess sources exist to check');
  for (const p of files) {
    const src = readFileSync(p, 'utf8');
    assert.ok(!src.includes('scene-context-guard'), `${p} must not import the guard`);
    assert.ok(!src.includes('SceneContextGuard'), `${p} must not reference the hook`);
    assert.ok(!src.includes('guardCanvasContext'), `${p} must not call the guard`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
