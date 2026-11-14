// tests/nether-lava-glow.test.mjs — LAVA GLOW (Merlin, 2026-11-14,
// ORDERED): enhance the glow from lava in the underworlds. Every lava
// site was a flat unlit disc (halo 0.22, core 0.9, no light, nothing
// above the surface) — it read as paint, not heat — and Hell's Lake
// of Fire was a dark disc with one r12 dot, which is why it ran so
// dark in his reel. The fix is one shared glow law
// (lib/nether-realm/lava-glow.js + components/LavaGlow.jsx) applied
// at every lava site. Visual only: the drop, the damage (none) and
// the day/night law are untouched.
// Run: node --test tests/nether-lava-glow.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LAVA_GLOW,
  LAVA_GLOW_CRACK_OPACITY,
  LAVA_GLOW_DOME_OPACITY,
  LAVA_GLOW_LAKE_LIGHT_DISTANCE,
  LAVA_GLOW_LAKE_LIGHT_INTENSITY,
  LAVA_GLOW_PIT_HALO_OPACITY,
  LAVA_GLOW_PIT_LIGHT_DISTANCE,
  LAVA_GLOW_PIT_LIGHT_INTENSITY,
  LAVA_GLOW_POOL_CORE_OPACITY,
  LAVA_GLOW_POOL_HALO_OPACITY,
  LAVA_GLOW_POOL_HOT_OPACITY,
  LAVA_GLOW_VEIN_SHADOW_BLUR,
  lavaFlicker,
  poolLightFor,
} from '../lib/nether-realm/lava-glow.js';

const src = (p) => readFileSync(p, 'utf8');
const POOL_SCENES = [
  'app/nether-realm/world3d.js',
  'app/hell/world3d.js',
  'app/naraka/world3d.js',
  'app/diyu/world3d.js',
];
const PIT_SCENES = [
  ...POOL_SCENES,
  'app/mictlan/world3d.js',
  'app/xibalba/world3d.js',
];
const LAVA_SCENES = PIT_SCENES;
const NON_LAVA_SCENES = [
  'app/duat/world3d.js',
  'app/annwn/world3d.js',
  'app/helheim/world3d.js',
  'app/kur/world3d.js',
  'app/nav/world3d.js',
  'app/orun/world3d.js',
  'app/yomi/world3d.js',
];

// --- the shared law: the numbers ----------------------------------------

test('the glow law pins the brighter numbers', () => {
  assert.equal(LAVA_GLOW_POOL_HALO_OPACITY, 0.4, 'pool halo was 0.22');
  assert.equal(LAVA_GLOW_POOL_CORE_OPACITY, 1, 'pool core was 0.9');
  assert.equal(LAVA_GLOW_POOL_HOT_OPACITY, 0.95, 'hot centre is new');
  assert.equal(LAVA_GLOW_PIT_HALO_OPACITY, 0.5, 'pit halo was 0.3');
  assert.equal(LAVA_GLOW_DOME_OPACITY, 0.18, 'glow dome is new');
  assert.equal(LAVA_GLOW_CRACK_OPACITY, 0.85, 'Descent crack was 0.55');
  assert.equal(LAVA_GLOW_VEIN_SHADOW_BLUR, 22, 'ground veins were 14');
  assert.equal(LAVA_GLOW_PIT_LIGHT_INTENSITY, 80, 'pit light was 55 (50 in Mictlan/Xibalba)');
  assert.equal(LAVA_GLOW_PIT_LIGHT_DISTANCE, 140, 'pit light reach was 110 (105)');
  assert.equal(LAVA_GLOW_LAKE_LIGHT_INTENSITY, 90, 'lake light was 45');
  assert.equal(LAVA_GLOW_LAKE_LIGHT_DISTANCE, 160, 'lake light reach was 95');
  assert.equal(LAVA_GLOW.poolHaloOpacity, LAVA_GLOW_POOL_HALO_OPACITY);
  assert.equal(LAVA_GLOW.pitLightIntensity, LAVA_GLOW_PIT_LIGHT_INTENSITY);
  assert.equal(LAVA_GLOW.lakeLightIntensity, LAVA_GLOW_LAKE_LIGHT_INTENSITY);
});

test('the flicker is the torch wave, breathing between 0.76 and 1.0', () => {
  assert.equal(lavaFlicker(0, 0), 0.88, 't = 0, id = 0 is the rest level');
  for (let t = 0; t < 20; t += 0.37) {
    for (let id = 0; id < 5; id += 1) {
      const w = lavaFlicker(t, id);
      assert.ok(w >= 0.76 && w <= 1.0, `flicker ${w} at t=${t} id=${id} stays in range`);
    }
  }
});

test('a pool light grows with the pool and reaches past its rim', () => {
  const small = poolLightFor({ r: 6, id: 0 });
  const big = poolLightFor({ r: 14, id: 4 });
  assert.equal(small.intensity, 25);
  assert.equal(small.distance, 30);
  assert.equal(big.intensity, 38);
  assert.equal(big.distance, 70);
  assert.ok(big.intensity > small.intensity, 'bigger pool burns brighter');
  assert.ok(small.distance > 6 && big.distance > 14, 'the wash clears the pool rim');
  assert.equal(poolLightFor({ r: 10, id: 2 }).height, 3, 'the light rides 3 m above the surface');
});

// --- the shared pieces exist and are wired the same everywhere -----------

test('the pool glow renders halo + core + hot centre + dome + one light', () => {
  const glow = src('components/LavaGlow.jsx');
  assert.ok(glow.includes('export function LavaGlowDome'), 'dome is exported');
  assert.ok(glow.includes('export function LavaPoolGlow'), 'pool glow is exported');
  assert.ok(glow.includes('AdditiveBlending'), 'the dome is additive, not solid');
  assert.ok(glow.includes('depthWrite={false}'), 'the dome never hides what is behind it');
  assert.ok(glow.includes('lavaFlicker'), 'the light breathes on the torch wave');
  assert.ok(glow.includes('poolLightFor'), 'the light scales with the pool');
  assert.equal(glow.match(/<pointLight/g).length, 1, 'one light per pool, no more');
  assert.ok(glow.includes('LAVA_GLOW_POOL_HALO_OPACITY'), 'halo reads the law');
  assert.ok(glow.includes('LAVA_GLOW_POOL_CORE_OPACITY'), 'core reads the law');
  assert.ok(glow.includes('LAVA_GLOW_POOL_HOT_OPACITY'), 'hot centre reads the law');
  assert.ok(glow.includes('if (reduced) return'), 'reduced motion stops the breathing');
});

test('every pool realm renders the shared pool glow, not the flat discs', () => {
  for (const f of POOL_SCENES) {
    const s = src(f);
    assert.ok(s.includes("from '@/components/LavaGlow'"), `${f} imports the shared glow`);
    assert.ok(s.includes('<LavaPoolGlow pool={p} color={LAVA}'), `${f} renders the pool glow`);
    assert.ok(!s.includes('opacity={0.22}'), `${f} has no flat 0.22 halo left`);
    assert.ok(s.includes('LAVA_GLOW_VEIN_SHADOW_BLUR'), `${f} veins glow harder`);
    assert.ok(!s.includes('shadowBlur = 14'), `${f} has no faint 14-blur veins left`);
  }
});

test('every pit realm carries the dome and the raised region light', () => {
  for (const f of PIT_SCENES) {
    const s = src(f);
    assert.ok(s.includes('LavaGlowDome'), `${f} domes its pits`);
    assert.ok(s.includes('LAVA_GLOW_PIT_HALO_OPACITY'), `${f} pit halo reads the law`);
    assert.ok(s.includes('LAVA_GLOW_PIT_LIGHT_INTENSITY'), `${f} pit light reads the law`);
    assert.ok(s.includes('LAVA_GLOW_PIT_LIGHT_DISTANCE'), `${f} pit light reach reads the law`);
    assert.ok(!s.includes('opacity={0.3}'), `${f} has no flat 0.3 pit disc left`);
  }
});

test('the pit light colours stay per realm — only the reach is shared', () => {
  assert.ok(src('app/nether-realm/world3d.js').includes('color={LAVA} intensity={LAVA_GLOW_PIT_LIGHT_INTENSITY}'), 'Hades pit light is lava');
  assert.ok(src('app/hell/world3d.js').includes("color='#9fd8ff'"), 'Hell frozen-deep light stays ice-blue');
  assert.ok(src('app/naraka/world3d.js').includes("color='#ffd98a'"), 'Naraka pit light stays warm gold');
  assert.ok(src('app/diyu/world3d.js').includes("color='#ffd98a'"), 'Diyu pit light stays warm gold');
});

test('the Descent crack glows harder wherever it is lava', () => {
  for (const f of [
    'app/nether-realm/world3d.js',
    'app/hell/world3d.js',
    'app/naraka/world3d.js',
    'app/diyu/world3d.js',
    'app/mictlan/world3d.js',
  ]) {
    assert.ok(src(f).includes('LAVA_GLOW_CRACK_OPACITY'), `${f} crack reads the law`);
  }
  // Xibalba's crack is green by design, not lava — untouched.
  const xib = src('app/xibalba/world3d.js');
  assert.ok(xib.includes('color="#2ecc71" transparent opacity={0.55}'), 'Xibalba green crack is unchanged');
  assert.ok(!xib.includes('LAVA_GLOW_CRACK_OPACITY'), 'Xibalba crack takes no lava law');
});

test("Hell's Lake of Fire covers the lake now, not one dot", () => {
  const hell = src('app/hell/world3d.js');
  assert.ok(hell.includes('args={[55, 32]}'), 'mid glow covers r55');
  assert.ok(hell.includes('args={[30, 32]}'), 'hot middle covers r30');
  assert.ok(hell.includes('args={[14, 24]}'), 'bright core covers r14');
  assert.ok(!hell.includes('args={[12, 24]}'), 'the old r12 dot is gone');
  assert.ok(hell.includes('LAVA_GLOW_LAKE_LIGHT_INTENSITY'), 'lake light reads the law');
  assert.ok(hell.includes('LAVA_GLOW_LAKE_LIGHT_DISTANCE'), 'lake light reach reads the law');
  assert.ok(hell.includes('LavaGlowDome radius={70}'), 'one big dome over the whole lake');
  assert.ok(hell.includes('flameRefs'), 'flames breathe over the lake surface');
});

// --- what is NOT lava stays untouched --------------------------------------

test('the other realms take no lava glow — their pools are other substances', () => {
  for (const f of NON_LAVA_SCENES) {
    const s = src(f);
    assert.ok(!s.includes('LavaGlow'), `${f} imports no lava glow`);
    assert.ok(!s.includes('LAVA_GLOW'), `${f} reads no lava law`);
  }
  assert.ok(src('app/mictlan/world3d.js').includes('color="#2ad4c0"'), 'Mictlan obsidian pools stay teal');
  assert.ok(src('app/xibalba/world3d.js').includes('BloodPools'), 'Xibalba blood pools stay blood');
  assert.ok(src('app/duat/world3d.js').includes('DarkPools'), 'Duat dark pools stay dark');
});

// --- the drop still works: glow is visual only ----------------------------

test('Hades lava drop wiring is untouched by the glow', () => {
  const hades = src('app/nether-realm/world3d.js');
  assert.ok(hades.includes('nearestLavaPool(player.x, player.z, lavaPools)'), 'drop check still runs every frame');
  assert.ok(hades.includes('onLava(pool)'), 'stepping in still fires the drop');
  assert.ok(hades.includes('LAVA_DROP_NAME'), 'pool label still names the World Engine');
});
