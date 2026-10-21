// tests/storm-wrap.test.mjs — "Olympus Storm" hub-bike livery.
// Run: node --test tests/storm-wrap.test.mjs
// Covers:
// - the procedural wrap drawing (lib/olympus-storm-wrap.js) against a
//   recording stub ctx: violet-black base, gold meander band, cyan
//   pinstripes, forward lightning bolt, nebula fleck
// - canvas factory behaviour (injectable document, honest null)
// - source wiring: BikeRig owns the livery, WispBike takes it per
//   instance with the +X flank flip, EarthBike never receives it
// - the 2026-10-21 hub steering fix stays wired (flight model sign +
//   matching bank sign in HomeScene)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STORM_WRAP_WIDTH,
  STORM_WRAP_HEIGHT,
  drawOlympusStormWrap,
  makeStormWrapCanvas,
} from '../lib/olympus-storm-wrap.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = STORM_WRAP_WIDTH;
const H = STORM_WRAP_HEIGHT;

function makeStubCtx() {
  const ops = [];
  let fillStyle;
  let strokeStyle;
  const grad = (kind, args) => ({
    __grad: true,
    kind,
    args,
    stops: [],
    addColorStop(o, c) {
      this.stops.push([o, c]);
    },
  });
  const ctx = {
    ops,
    lineWidth: 1,
    lineCap: 'butt',
    shadowBlur: 0,
    shadowColor: 'transparent',
    createLinearGradient: (...a) => grad('linear', a),
    createRadialGradient: (...a) => grad('radial', a),
    fillRect: (...a) => ops.push({ op: 'fillRect', args: a, fillStyle }),
    clearRect: () => {},
    beginPath: () => ops.push({ op: 'begin' }),
    moveTo: (...a) => ops.push({ op: 'moveTo', args: a }),
    lineTo: (...a) => ops.push({ op: 'lineTo', args: a }),
    closePath: () => ops.push({ op: 'closePath' }),
    arc: (...a) => ops.push({ op: 'arc', args: a }),
    fill: () => ops.push({ op: 'fill', fillStyle }),
    stroke: () => ops.push({ op: 'stroke', strokeStyle, lineWidth: ctx.lineWidth }),
    save: () => {},
    restore: () => {},
  };
  Object.defineProperties(ctx, {
    fillStyle: { get: () => fillStyle, set: (v) => { fillStyle = v; } },
    strokeStyle: { get: () => strokeStyle, set: (v) => { strokeStyle = v; } },
  });
  return ctx;
}

function stopsInclude(style, hex) {
  return !!(style && style.__grad && style.stops.some(([, c]) => c === hex));
}

describe('drawOlympusStormWrap', () => {
  const ctx = makeStubCtx();
  const ok = drawOlympusStormWrap(ctx);
  const ops = ctx.ops;

  it('draws without a real canvas and refuses a missing ctx', () => {
    assert.equal(ok, true);
    assert.equal(drawOlympusStormWrap(null), false);
    assert.equal(drawOlympusStormWrap({}), false);
  });

  it('base is a full-panel violet-to-black vertical gradient', () => {
    const first = ops.find((o) => o.op === 'fillRect');
    assert.deepEqual(first.args, [0, 0, W, H]);
    assert.ok(stopsInclude(first.fillStyle, '#3d1473'), 'deep violet at top');
    assert.ok(stopsInclude(first.fillStyle, '#040109'), 'near-black at bottom');
  });

  it('nebula fleck: hundreds of tiny specks', () => {
    const arcs = ops.filter((o) => o.op === 'arc');
    assert.ok(arcs.length >= 300, `expected >=300 flecks, got ${arcs.length}`);
    assert.ok(arcs.every((a) => a.args[2] < 2.5), 'flecks stay subtle');
  });

  it('molten-gold band runs the full length with dark framing rules', () => {
    const band = ops.find(
      (o) => o.op === 'fillRect' && o.args[2] === W && o.args[3] >= 30 && o.args[3] <= 64 && stopsInclude(o.fillStyle, '#f6c453')
    );
    assert.ok(band, 'gold band fillRect not found');
    assert.ok(stopsInclude(band.fillStyle, '#ffe9a8'), 'molten highlight in the gold');
  });

  it('Greek-key line-work is tiled across the band', () => {
    const keyStrokes = ops.filter((o) => o.op === 'stroke' && o.strokeStyle === '#2a0a2e');
    assert.ok(keyStrokes.length >= 20, `expected >=20 meander units, got ${keyStrokes.length}`);
    const lineTos = ops.filter((o) => o.op === 'lineTo');
    assert.ok(lineTos.length >= 80, 'meander path segments tiled the length');
  });

  it('electric-cyan pinstripes flank the band (two long horizontal strokes)', () => {
    const stripes = [];
    let cur = null;
    for (const o of ops) {
      if (o.op === 'begin') cur = { pts: [], stroke: null };
      else if (o.op === 'moveTo' && cur) cur.pts.push(o.args);
      else if (o.op === 'lineTo' && cur) cur.pts.push(o.args);
      else if (o.op === 'stroke' && cur) {
        cur.stroke = o.strokeStyle;
        if (stopsInclude(o.strokeStyle, '#67e8f9')) stripes.push(cur);
        cur = null;
      }
    }
    assert.ok(stripes.length >= 2, `expected >=2 cyan pinstripes, got ${stripes.length}`);
    for (const s of stripes) {
      const xs = s.pts.map((p) => p[0]);
      assert.ok(Math.max(...xs) - Math.min(...xs) > W * 0.9, 'pinstripe spans the panel');
    }
  });

  it('lightning bolt sits in the forward third, gold melting to cyan', () => {
    // find the fill carrying the bolt gradient, then walk back to its path
    let boltFillIdx = -1;
    for (let i = 0; i < ops.length; i++) {
      if (ops[i].op === 'fill' && stopsInclude(ops[i].fillStyle, '#f59e0b')) boltFillIdx = i;
    }
    assert.ok(boltFillIdx > 0, 'bolt fill not found');
    let beginIdx = boltFillIdx;
    while (beginIdx > 0 && ops[beginIdx].op !== 'begin') beginIdx--;
    const pts = ops
      .slice(beginIdx, boltFillIdx)
      .filter((o) => o.op === 'moveTo' || o.op === 'lineTo')
      .map((o) => o.args);
    assert.ok(pts.length >= 6, 'bolt is a real polygon');
    assert.ok(pts.every(([x]) => x > W * 0.55 && x < W * 0.9), 'bolt lives in the forward third');
    const ys = pts.map((p) => p[1]);
    assert.ok(Math.max(...ys) - Math.min(...ys) > H * 0.7, 'bolt has real height');
  });
});

describe('makeStormWrapCanvas', () => {
  it('builds a sized canvas from an injected document', () => {
    const stub = makeStubCtx();
    const doc = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => stub,
      }),
    };
    const c = makeStormWrapCanvas(doc);
    assert.ok(c, 'canvas expected');
    assert.equal(c.width, W);
    assert.equal(c.height, H);
    assert.ok(stub.ops.length > 100, 'the wrap was actually drawn');
  });

  it('returns null when no canvas is available', () => {
    assert.equal(makeStormWrapCanvas({}), null);
    assert.equal(makeStormWrapCanvas(), null); // node: no global document
  });
});

describe('livery wiring (per-instance, hub only)', () => {
  const rig = readFileSync(join(repo, 'components/BikeRig.jsx'), 'utf8');
  const tron = readFileSync(join(repo, 'components/nova/TronBikes.jsx'), 'utf8');
  const earth = readFileSync(join(repo, 'components/EarthBike.jsx'), 'utf8');

  it('BikeRig generates the Storm texture and passes it to the hub Wisp', () => {
    assert.match(rig, /makeStormWrapCanvas/);
    assert.match(rig, /olympus-storm-wrap/);
    assert.match(rig, /wrapTexture=\{stormTex\}/);
    assert.match(rig, /color="#00e5ff"/, 'cyan accent echoes the pinstripes');
  });

  it('WispBike takes wrapTexture per instance and flips the +X flank', () => {
    assert.match(tron, /wrapTexture = null/);
    assert.match(tron, /wrapTexture \|\| sharedWrap/);
    assert.match(tron, /RepeatWrapping/);
    assert.match(tron, /repeat\.x = -1/);
  });

  it('the Earth bike never receives the hub livery', () => {
    assert.ok(!earth.includes('wrapTexture'), 'EarthBike must not pass wrapTexture');
    assert.ok(!earth.includes('olympus-storm-wrap'), 'EarthBike must not import the storm wrap');
  });
});

describe('hub steering fix wiring', () => {
  const flight = readFileSync(join(repo, 'lib/bike-flight.js'), 'utf8');
  const scene = readFileSync(join(repo, 'components/HomeScene.jsx'), 'utf8');

  it('flight model: positive steer decreases yaw (turns right, rider POV)', () => {
    assert.match(flight, /st\.yaw -= steer \* T\.turnRate \* dt/);
    assert.ok(!flight.includes('st.yaw += steer'), 'old inverted line must be gone');
  });

  it('bank leans into the turn with the matching sign', () => {
    assert.match(scene, /input\.steer \* 0\.38/);
    assert.ok(!scene.includes('-input.steer * 0.38'), 'old bank sign must be gone');
  });
});
