// tests/sports-cgi-racket.test.mjs — procedural CGI for the racket games +
// dodgeball (tennis, table-tennis, dodgeball) and the air-hockey 2D pass.
//
// Same contract as tests/sports-cgi.test.mjs: every map builder is
// deterministic (same seed → identical bytes, different seed → different
// bytes), RepeatWrapping, SRGB colour. The environment builders run
// headless against a real THREE.Scene. Render only — no game rules here.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  hardcourtMaps, surroundMaps, tableTopMaps, panelMaps,
  tennisBallMaps, tableBallMaps, dodgeballMaps, paddleFaceMaps,
  jerseyMaps, radialGlowTexture,
  skyDome, makeClouds, makeFloodlights, makeCrowd, makeContactShadow,
  rollBall, squashY,
} from '../lib/sports/cgi.js';
import { drawScene, drawTable, drawMallet, drawPuck } from '../app/air-hockey/render.js';

const builders = {
  hardcourt: hardcourtMaps, surround: surroundMaps, tableTop: tableTopMaps,
  tennisBall: tennisBallMaps, tableBall: tableBallMaps, dodgeball: dodgeballMaps,
};

function bytes(tex) {
  return Buffer.from(tex.image.data.buffer, tex.image.data.byteOffset, tex.image.data.byteLength);
}

describe('racket + dodgeball surface maps', () => {
  for (const [kind, build] of Object.entries(builders)) {
    it(`${kind}: colour+bump DataTextures, repeat-wrapped, deterministic`, () => {
      const first = build(1234);
      const second = build(1234);
      const other = build(9876);
      for (const m of [first, second, other]) {
        assert.ok(m.map instanceof THREE.DataTexture);
        assert.ok(m.bumpMap instanceof THREE.DataTexture);
        assert.equal(m.map.wrapS, THREE.RepeatWrapping);
        assert.equal(m.map.wrapT, THREE.RepeatWrapping);
        assert.equal(m.map.colorSpace, THREE.SRGBColorSpace);
        assert.ok(m.map.image.data.length > 0);
      }
      assert.ok(bytes(first.map).equals(bytes(second.map)), 'same seed, same coat');
      assert.ok(!bytes(first.map).equals(bytes(other.map)), 'different seed, different coat');
      assert.ok(bytes(first.bumpMap).equals(bytes(second.bumpMap)));
    });
  }
  it('panelMaps honours the base colour (dark pads stay dark, pale stay pale)', () => {
    const dark = panelMaps(5, '#334155');
    const pale = panelMaps(5, '#e2e8f0');
    const luma = (tex) => {
      const { data } = tex.map.image;
      let s = 0;
      for (let i = 0; i < data.length; i += 4) s += data[i] + data[i + 1] + data[i + 2];
      return s / (data.length / 4);
    };
    assert.ok(luma(pale) > luma(dark) * 2);
  });
  it('paddleFaceMaps honours the rubber colour', () => {
    const red = paddleFaceMaps(5, '#dc2626');
    const black = paddleFaceMaps(5, '#1f2937');
    const { data: dr } = red.map.image;
    const { data: db } = black.map.image;
    assert.ok(dr[0] > db[0] + 80, 'red face is redder than the black face');
  });
  it('tennis ball is optic yellow with a white seam somewhere', () => {
    const { map } = tennisBallMaps(5);
    const { data } = map.image;
    let white = 0;
    let yellow = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (r > 230 && g > 230 && b > 230) white++;
      if (g > 200 && r > 150 && b < 90) yellow++;
    }
    assert.ok(white > 50, 'seam pixels present');
    assert.ok(yellow > data.length / 4 / 2, 'mostly optic yellow felt');
  });
  it('jerseyMaps white weave stays near-white so the team colour tints it', () => {
    const { map } = jerseyMaps(5, '#ffffff');
    const { data } = map.image;
    let s = 0;
    for (let i = 0; i < data.length; i += 4) s += data[i];
    assert.ok(s / (data.length / 4) > 230);
  });
});

describe('per-frame life helpers', () => {
  it('rollBall spins from ground-plane velocity, not at rest', () => {
    const mesh = { rotation: { x: 0, y: 0, z: 0 } };
    rollBall(mesh, 0, 0, 0.016);
    assert.equal(mesh.rotation.x, 0);
    assert.equal(mesh.rotation.z, 0);
    rollBall(mesh, 10, 0, 0.016);
    assert.ok(mesh.rotation.z < 0, 'vx rolls around z');
    rollBall(mesh, 0, 10, 0.016);
    assert.ok(mesh.rotation.x > 0, 'vz rolls around x');
  });
  it('squashY is 1 in the air and ~0.65 on impact', () => {
    assert.equal(squashY(1), 1);
    assert.equal(squashY(0.35), 1);
    assert.ok(Math.abs(squashY(0) - 0.65) < 0.001);
    const mid = squashY(0.175);
    assert.ok(mid > 0.65 && mid < 1);
  });
  it('radialGlowTexture is opaque at the centre, transparent at the corner', () => {
    const tex = radialGlowTexture(64);
    const { width, data } = tex.image;
    const centre = (32 * width + 32) * 4 + 3;
    const corner = 3;
    assert.ok(data[centre] > 240, 'centre is near-opaque');
    assert.equal(data[corner], 0);
  });
});

describe('environment builders run headless', () => {
  it('skyDome adds a back-sided vertex-coloured sphere', () => {
    const scene = new THREE.Scene();
    const dome = skyDome(scene, 50);
    assert.ok(scene.children.includes(dome));
    assert.equal(dome.material.side, THREE.BackSide);
    assert.ok(dome.geometry.attributes.color);
  });
  it('makeClouds drifts sprites +x and wraps at the spread', () => {
    const scene = new THREE.Scene();
    const clouds = makeClouds(scene, 7, { count: 3, spread: 10, yMin: 5, yMax: 6 });
    const before = scene.children.map((c) => c.position.x);
    clouds.update(0, 1);
    const after = scene.children.map((c) => c.position.x);
    assert.ok(after.some((x, i) => x !== before[i]), 'at least one cloud moved');
  });
  it('makeCrowd instances one body+head per spot and bobs on update', () => {
    const scene = new THREE.Scene();
    const spots = [[0, 0.5, 0], [1.2, 0.5, 0], [2.4, 1.3, 0]];
    const crowd = makeCrowd(scene, { seed: 9, spots });
    assert.equal(scene.children.length, 1);
    const before = Float32Array.from(scene.children[0].children[0].instanceMatrix.array);
    crowd.update(1.3);
    const after = scene.children[0].children[0].instanceMatrix.array;
    assert.ok(!Buffer.from(before.buffer).equals(Buffer.from(after.buffer)), 'bob moved an instance');
    crowd.update(0); // never throws, even back at t=0
  });
  it('makeCrowd with no spots is a harmless no-op', () => {
    const scene = new THREE.Scene();
    const crowd = makeCrowd(scene, { seed: 1, spots: [] });
    crowd.update(5);
    assert.equal(scene.children.length, 1);
  });
  it('makeFloodlights and makeContactShadow add to the scene', () => {
    const scene = new THREE.Scene();
    makeFloodlights(scene, [[-5, -5], [5, 5]], 12);
    assert.ok(scene.children.length > 4);
    const shadow = makeContactShadow(0.6);
    scene.add(shadow);
    assert.equal(shadow.rotation.x, -Math.PI / 2);
  });
});

describe('pages wear the CGI kit (source-level)', () => {
  const tennis = readFileSync(new URL('../app/tennis/page.jsx', import.meta.url), 'utf8');
  const table = readFileSync(new URL('../app/table-tennis/page.jsx', import.meta.url), 'utf8');
  const dodge = readFileSync(new URL('../app/dodgeball/page.jsx', import.meta.url), 'utf8');
  const render = readFileSync(new URL('../app/air-hockey/render.js', import.meta.url), 'utf8');
  const airPage = readFileSync(new URL('../app/air-hockey/page.jsx', import.meta.url), 'utf8');

  it('tennis: seeded court + sky + crowd + spinning felt ball', () => {
    for (const s of ['hardcourtMaps', 'surroundMaps', 'tennisBallMaps', 'skyDome', 'makeClouds', 'makeFloodlights', 'makeCrowd', 'rollBall', 'squashY', 'breathScale', "from '@/lib/sports/cgi.js'"]) {
      assert.ok(tennis.includes(s), `tennis missing ${s}`);
    }
  });
  it('table-tennis: table top, hall, figures, rubber paddles, spinning ball', () => {
    for (const s of ['tableTopMaps', 'woodMaps', 'panelMaps', 'paddleFaceMaps', 'tableBallMaps', 'makeCrowd', 'rollBall', 'breathScale']) {
      assert.ok(table.includes(s), `table-tennis missing ${s}`);
    }
    assert.ok(table.includes('mkPlayer'), 'players are figures now, not bare paddles');
  });
  it('dodgeball: foam balls, padded walls, crowd, breathing + run bob', () => {
    for (const s of ['dodgeballMaps', 'panelMaps', 'woodMaps', 'makeCrowd', 'rollBall', 'breathScale', 'stepPhase']) {
      assert.ok(dodge.includes(s), `dodgeball missing ${s}`);
    }
  });
  it('air-hockey render: time-driven CGI, puck spin marker, goal ring', () => {
    for (const s of ['puckSpin', 'drawScene(ctx, game, visual = \'classic\', t = 0)', 'sweepX', 'Motion trail', 'expanding ring']) {
      assert.ok(render.includes(s), `render.js missing ${s}`);
    }
    assert.ok(airPage.includes('drawScene(ctx, game, visualRef.current, reducedMotion.current ? 0 : (now - tStart) / 1000)'), 'page threads time into drawScene');
  });
  it('no game rules were touched by the CGI pass', () => {
    for (const [file, marker] of [
      ['../lib/sports/tennis.js', 'export function stepRacket'],
      ['../lib/dodgeball/rules.js', 'export function step('],
      ['../app/air-hockey/physics.js', 'export class Game'],
    ]) {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8');
      assert.ok(src.includes(marker), `${file} still exports its rules`);
      assert.ok(!src.includes('puckSpin') && !src.includes('hardcourtMaps'), `${file} carries no render code`);
    }
  });
});

describe('air-hockey drawScene still works with a stub context', () => {
  // The old callers (and the kaleidoscope suite) call drawScene with no
  // time arg — it must draw exactly as before, just frozen at t=0.
  function stubCtx() {
    const grad = { addColorStop() {} };
    return {
      calls: [],
      clearRect() {}, fillRect() {}, strokeRect() {},
      beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {},
      ellipse() {}, save() {}, restore() {},
      createLinearGradient() { return grad; },
      createRadialGradient() { return grad; },
      fillText() {}, set fillStyle(v) {}, get fillStyle() { return ''; },
      set strokeStyle(v) {}, get strokeStyle() { return ''; },
      set lineWidth(v) {}, get lineWidth() { return 0; },
      set font(v) {}, get font() { return ''; },
      set textAlign(v) {}, get textAlign() { return ''; },
      set textBaseline(v) {}, get textBaseline() { return ''; },
      set shadowColor(v) {}, get shadowColor() { return ''; },
      set shadowBlur(v) {}, get shadowBlur() { return 0; },
      set globalAlpha(v) {}, get globalAlpha() { return 1; },
    };
  }
  const fakeGame = {
    state: 'play', puck: { x: 200, y: 350, vx: 100, vy: -50 },
    player: { x: 200, y: 570, vx: 0, vy: 0 },
    ai: { x: 200, y: 130, vx: 0, vy: 0 },
    countdown: 3, scoredTimer: 1.4, lastScorer: 'player',
  };
  it('drawScene(ctx, game) and drawScene(ctx, game, visual, t) both draw', () => {
    assert.doesNotThrow(() => drawScene(stubCtx(), fakeGame));
    assert.doesNotThrow(() => drawScene(stubCtx(), fakeGame, 'classic', 12.5));
    assert.doesNotThrow(() => drawScene(stubCtx(), { ...fakeGame, state: 'scored' }, 'classic', 3));
    assert.doesNotThrow(() => drawTable(stubCtx(), fakeGame, 'kaleidoscope', 4));
    assert.doesNotThrow(() => drawMallet(stubCtx(), fakeGame.player, '#0f9db8', '#00e5ff', 2));
    assert.doesNotThrow(() => drawPuck(stubCtx(), fakeGame.puck, 2));
  });
});
