// tests/neon-racer-cgi.test.mjs — headless tests for the NEON RACER CGI
// upgrade (lib/neon-racer/cgi.js + the three.js render shell).
// Run: node tests/neon-racer-cgi.test.mjs (from the repo root).
// No browser, no network — builds the world in node (canvasTexture
// falls back to a blank texture without a DOM) and proves:
//   * FRAMING — the camera reproduces the 2D projection: the whole
//     flight corridor (x ±10, y ±6) fits the min screen dimension at
//     any aspect, exactly as the old renderer did
//   * BUDGETS — 2 real lights, no shadow maps, pooled meshes
//   * MAPPING — every live asteroid/shard/ring/bullet in game state
//     has exactly one visible mesh; dead objects release theirs
//   * VISUAL ONLY — world.update() never mutates game state; game.js
//     stays renderer-free (no three, no canvas, no DOM)
//   * SHIP — visible while playing/won/ready, hidden when lost;
//     invulnerability blink follows the old 110 ms rule
//   * LIGHTSPEED — streaks show while warping, never under reduced
//     motion; the ship flame turns magenta in warp
//   * DETERMINISM — the same asteroid variant builds the same geometry
import * as THREE from 'three';
import { readFileSync } from 'fs';
import {
  createGame, startGame, updateGame, fireBullet, MISSION_SECONDS,
} from '../app/neon-racer/game.js';
import {
  NEON_PALETTE, NEON_CGI, CAM_DIST, HALF_SPAN, neonCameraFov,
  buildShip, buildAsteroid, buildShard, buildRing, buildBullet,
  createNeonWorld,
} from '../lib/neon-racer/cgi.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- framing -------------------------------------------------------------
{
  // Portrait phone (390x844): fov ≈ 45°; landscape (844x390): ≈ 21.7°.
  const portrait = neonCameraFov(390 / 844);
  const landscape = neonCameraFov(844 / 390);
  t('framing: portrait fov ~45deg', Math.abs(portrait - 45.2) < 0.6);
  t('framing: landscape fov ~21.7deg', Math.abs(landscape - 21.7) < 0.6);
  // Invariant: at CAM_DIST, HALF_SPAN fills the MIN screen dimension.
  // tan(vfov/2) * CAM_DIST * min(1, aspect) === HALF_SPAN.
  for (const a of [0.46, 0.75, 1.0, 1.7, 2.0]) {
    const vfov = neonCameraFov(a) * (Math.PI / 180);
    const half = Math.tan(vfov / 2) * CAM_DIST * Math.min(1, a);
    t(`framing: aspect ${a} fits ±${HALF_SPAN}`, Math.abs(half - HALF_SPAN) < 0.05);
  }
  t('framing: CAM_DIST is 60 (the old FOCAL)', CAM_DIST === 60);
  t('framing: HALF_SPAN is 11.5 (the old fit)', HALF_SPAN === 11.5);
}

// --- budgets ---------------------------------------------------------------
t('budget: max 2 lights', NEON_CGI.maxLights === 2);
t('budget: no shadow maps', NEON_CGI.shadows === false);
t('budget: 8 asteroid variants', NEON_CGI.asteroidVariants === 8);
t('budget: particle cap 256', NEON_CGI.particleCap === 256);

// --- builders ---------------------------------------------------------------
{
  const ship = buildShip();
  t('ship: is a group with a flame + glow', !!ship.userData.ship?.flameL && !!ship.userData.ship?.glow);
  const a0 = buildAsteroid(0);
  const a0b = buildAsteroid(0);
  t('asteroid: same variant shares geometry', a0.geometry === a0b.geometry);
  const a1 = buildAsteroid(1);
  t('asteroid: different variant, different geometry', a1.geometry !== a0.geometry);
  t('asteroid: flat-shaded rock', a0.material.flatShading === true);
  const sh = buildShard();
  const rg = buildRing();
  const bu = buildBullet();
  t('shard/ring/bullet: build clean', !!sh && !!rg && !!bu);
  // Sizes stay true to the state (the picture never lies about the hitbox).
  // Measure only the SOLID parts — flames and glow sprites are fx and
  // legitimately extend past the hull.
  function solidBox(obj) {
    const box = new THREE.Box3();
    obj.traverse((o) => {
      if (o.isMesh && o.userData.kind === 'solid') {
        box.expandByObject(o);
      }
    });
    return box;
  }
  const shipBox = solidBox(ship);
  const shipSize = new THREE.Vector3();
  shipBox.getSize(shipSize);
  t('ship: ~1.9 long, ~2 wide (SHIP_RADIUS 0.9 scale)', shipSize.z > 1.6 && shipSize.z < 2.2 && shipSize.x > 1.8 && shipSize.x < 2.4);
  const ringBox = solidBox(rg);
  const ringSize = new THREE.Vector3();
  ringBox.getSize(ringSize);
  t('ring: ~4.7 across (r 2.2 + tube)', ringSize.x > 4.5 && ringSize.x < 4.9);
}

// --- world: lights, mapping, visual-only ------------------------------------
function snapshot(s) {
  return JSON.stringify({
    phase: s.phase, elapsed: s.elapsed, score: s.score, shields: s.shields,
    level: s.level, ship: s.ship,
    asteroids: s.asteroids.map((a) => [a.x, a.y, a.z, a.r, a.hit]),
    shards: s.shards.map((x) => [x.x, x.y, x.z, x.taken]),
    rings: s.rings.map((r) => [r.x, r.y, r.z, r.used]),
    bullets: s.bullets.map((b) => [b.x, b.y, b.z]),
    particles: s.particles.length,
  });
}
{
  const world = createNeonWorld();
  const c0 = world.counts();
  t('world: exactly 2 lights', c0.lights === 2);
  t('world: ship present', !!world.ship);

  const game = createGame(1234);
  startGame(game);
  // The test ship never steers, so make it invulnerable for the drive —
  // otherwise random rocks kill it before the mission ends and the
  // mission never reaches 'won'. (Graze hits still pay half credit.)
  game.invulnUntil = Infinity;
  // Drive the game 12 s so asteroids/shards/rings spawn.
  for (let i = 0; i < 720; i++) updateGame(game, 1 / 60);
  t('game: objects spawned', game.asteroids.length > 0 && game.shards.length > 0);
  const before = snapshot(game);
  world.update(game, 5000, 1 / 60, {});
  const after = snapshot(game);
  t('world: update never mutates game state', before === after);
  const c1 = world.counts();
  t('mapping: one mesh per live asteroid', c1.poolSizes.asteroid === game.asteroids.length);
  t('mapping: one mesh per live shard', c1.poolSizes.shard === game.shards.length);
  t('mapping: one mesh per live ring', c1.poolSizes.ring === game.rings.length);
  t('ship: visible while playing', world.ship.visible === true);

  // Fire a bullet and confirm it maps.
  fireBullet(game);
  world.update(game, 5100, 1 / 60, {});
  t('mapping: bullet maps after fire', world.counts().poolSizes.bullet === game.bullets.length);

  // Run the mission out (90 s). updateGame stops advancing a won game,
  // so the field freezes exactly as the 2D renderer left it — the pools
  // must still mirror the frozen state, and the mesh count must stay
  // bounded (no per-frame allocation, no leak).
  for (let i = 0; i < 6000; i++) updateGame(game, 1 / 60);
  t('game: mission ends won', game.phase === 'won');
  world.update(game, 100000, 1 / 60, {});
  const c2 = world.counts();
  t('mapping: pools mirror the frozen field', c2.poolSizes.asteroid === game.asteroids.length && c2.poolSizes.shard === game.shards.length && c2.poolSizes.ring === game.rings.length);
  t('ship: visible when won', world.ship.visible === true);
  t('meshes: bounded after a full mission', c2.meshes < 130);

  // Lost: the ship hides (the explosion particles carry the moment).
  const g2 = createGame(7);
  startGame(g2);
  g2.shields = 0;
  g2.phase = 'lost';
  world.update(g2, 2000, 1 / 60, {});
  t('ship: hidden when lost', world.ship.visible === false);

  // Ready: the ship idles behind the title (the slight redesign).
  const g3 = createGame(7);
  world.update(g3, 2000, 1 / 60, {});
  t('ship: visible in ready (idles behind the title)', world.ship.visible === true);

  world.dispose();
}

// --- invulnerability blink (the old 110 ms rule) -----------------------------
{
  const world = createNeonWorld();
  const g = createGame(11);
  startGame(g);
  g.invulnUntil = g.elapsed + 1.5;
  world.update(g, 220, 1 / 60, {}); // floor(220/110)=2, even -> hidden
  t('blink: hidden on an even 110ms slice', world.ship.visible === false);
  world.update(g, 330, 1 / 60, {}); // floor(330/110)=3, odd -> shown
  t('blink: shown on an odd 110ms slice', world.ship.visible === true);
  world.dispose();
}

// --- lightspeed ---------------------------------------------------------------
{
  const world = createNeonWorld();
  const g = createGame(21);
  startGame(g);
  g.lightspeedUntil = g.elapsed + 3; // warp engaged
  world.update(g, 3000, 1 / 60, {});
  t('warp: streaks show while warping', world.streaks.visible === true);
  const flameColor = world.ship.userData.ship.flameMat.color.getHex();
  t('warp: flame turns magenta', flameColor === NEON_PALETTE.ring);
  world.update(g, 3100, 1 / 60, { reducedMotion: true });
  t('warp: streaks never show under reduced motion', world.streaks.visible === false);
  world.dispose();
}

// --- game.js stays renderer-free ----------------------------------------------
{
  const src = readFileSync(new URL('../app/neon-racer/game.js', import.meta.url), 'utf8');
  t('game.js: no three import', !src.includes("from 'three'") && !src.includes('from "three"'));
  t('game.js: no canvas/DOM', !src.includes('getContext') && !src.includes('document.') && !src.includes('window.'));
}

console.log(`\nneon-racer-cgi: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
