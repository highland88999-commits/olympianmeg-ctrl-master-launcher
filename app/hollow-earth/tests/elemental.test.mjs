// Elemental light + atmosphere systems (2026-10-26 rework):
// sun/moon cycle, acid rivers, brimstone, poison veins,
// lightning storms, smoke haze — plus the GLB-only light budget.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const THREE = await import('three');
import {
  CYCLE_S, LIGHT_BUDGET, sunMoonState, stormFlashAt, hazeApproach,
  acidRiverPath, buildElemental,
} from '../elemental.js';
import { biomeAt } from '../biomes.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('sun/moon cycle: noon is day, midnight is night, and the sky follows', () => {
  const noon = sunMoonState(CYCLE_S * 0.25); // angle PI/2, sun overhead
  const midnight = sunMoonState(CYCLE_S * 0.75); // angle 3PI/2, moon overhead
  assert.equal(noon.dayFactor, 1);
  assert.equal(noon.sunUp, true);
  assert.equal(midnight.dayFactor, 0);
  assert.equal(midnight.moonUp, true);
  assert.ok(noon.dirIntensity > midnight.dirIntensity, 'day light must beat night light');
  assert.notEqual(noon.sky, midnight.sky, 'sky must change across the cycle');
  assert.notEqual(noon.fog, midnight.fog, 'fog must change across the cycle');
  assert.ok(noon.sunOpacity > 0.9 && midnight.sunOpacity === 0, 'sun shows by day only');
  assert.ok(midnight.moonOpacity > 0.9 && noon.moonOpacity === 0, 'moon shows by night only');
});

test('storm flashes: silent outside windows, decaying inside them', () => {
  assert.equal(stormFlashAt(0), 0);
  assert.equal(stormFlashAt(10), 0);
  assert.equal(stormFlashAt(25), 0); // 25 % 17 = 8, between windows
  const f0 = stormFlashAt(3.0);
  const f1 = stormFlashAt(3.1);
  assert.ok(f0 > 0 && f0 <= 1, `flash at window start ${f0}`);
  assert.ok(f1 > 0 && f1 < f0, 'flash must decay inside its window');
  assert.ok(stormFlashAt(3.5) > 0, 'second flash window');
  assert.ok(stormFlashAt(4.0) > 0, 'third flash window');
});

test('smoke haze eases in and clears out, never snaps', () => {
  let h = 0;
  for (let i = 0; i < 50; i++) h = hazeApproach(h, 1, 0.1);
  assert.ok(h > 0.9, `haze after 5 s of combat ${h}`);
  let prev = h;
  for (let i = 0; i < 50; i++) {
    h = hazeApproach(h, 0, 0.1);
    assert.ok(h <= prev + 1e-9, 'haze must fall monotonically when combat ends');
    prev = h;
  }
  assert.ok(h < 0.1, `haze after 5 s clear ${h}`);
  assert.equal(hazeApproach(0, 0, 0.1), 0);
});

test('acid river paths: fixed step, deterministic, meandering', () => {
  const rng = mulberry32(7);
  const pts = acidRiverPath(rng, { x: -160, z: 40 }, 20, 6);
  assert.equal(pts.length, 21);
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    assert.ok(Math.abs(d - 6) < 0.001, `river step ${d}`);
  }
  const again = acidRiverPath(mulberry32(7), { x: -160, z: 40 }, 20, 6);
  assert.deepEqual(pts, again, 'river path must be deterministic per seed');
  // Meander: not a straight line — heading must actually wander.
  const dx = pts[20].x - pts[0].x;
  const dz = pts[20].z - pts[0].z;
  assert.ok(Math.hypot(dx, dz) < 20 * 6, 'river must meander, not run straight');
});

test('elemental build: light budget held, all six systems present', () => {
  const el = buildElemental(THREE, {
    heightAt: () => 0,
    biomeAt: (x, z) => biomeAt(x, z).dominant,
  });
  let lights = 0;
  const byColor = new Map();
  el.group.traverse((o) => {
    if (o.isLight) lights++;
    if (o.material && o.material.color) {
      const c = o.material.color.getHex();
      byColor.set(c, (byColor.get(c) || 0) + 1);
    }
  });
  assert.equal(lights, LIGHT_BUDGET, `light budget: ${lights} lights, expected ${LIGHT_BUDGET}`);
  assert.equal(byColor.get(0x39ff66), 3, 'three acid river ribbons');
  assert.equal(byColor.get(0xd080ff), 24, 'twelve poison rocks x two veins');
  assert.ok((byColor.get(0xffd88a) || 0) >= 1, 'sun disc present');
  assert.ok((byColor.get(0xd8e0f0) || 0) >= 1, 'moon disc present');
  assert.ok((byColor.get(0xffe14d) || 0) >= 4, 'storm bolt segments present');
});

test('elemental update: storm flashes, haze rolls in on shadow combat and clears', () => {
  const el = buildElemental(THREE, {
    heightAt: () => 0,
    biomeAt: (x, z) => biomeAt(x, z).dominant,
  });
  const base = { observerX: 0, observerY: 0, observerZ: 0, shadowCombat: false };
  el.update(0.016, { ...base, t: 0 });
  let c0 = el.colors();
  assert.ok(c0.haze < 0.01, `haze at rest ${c0.haze}`);
  // Storm flash window: bolt + light must fire.
  el.update(0.016, { ...base, t: 3.05 });
  let boltVisible = false;
  let stormLit = false;
  el.group.traverse((o) => {
    if (o.isPointLight && o.color.getHex() === 0xffe14d && o.intensity > 0) stormLit = true;
  });
  // The bolt group is the only group whose children share the
  // storm-yellow basic material and toggles visibility.
  el.group.traverse((o) => {
    if (o.visible && o.children && o.children.length >= 4
      && o.children.every((ch) => ch.material && ch.material.color.getHex() === 0xffe14d)) boltVisible = true;
  });
  assert.ok(stormLit, 'storm light must fire inside a flash window');
  assert.ok(boltVisible, 'storm bolt must show inside a flash window');
  // Shadow combat rolls haze in; ending combat clears it.
  for (let i = 0; i < 50; i++) el.update(0.1, { ...base, t: 10, shadowCombat: true });
  const hazy = el.colors();
  assert.ok(hazy.haze > 0.9, `haze in combat ${hazy.haze}`);
  assert.notEqual(hazy.fog, c0.fog, 'fog must grey out under haze');
  for (let i = 0; i < 50; i++) el.update(0.1, { ...base, t: 20, shadowCombat: false });
  assert.ok(el.colors().haze < 0.1, `haze after combat ${el.colors().haze}`);
});

// ---- WS4 graphics (2026-11-16): second bolt, storm clouds, flowing rivers ----

test('WS4 G-07: two bolt shapes alternate by 17 s window; six cloud silhouettes, no new lights', () => {
  const el = buildElemental(THREE, {
    heightAt: () => 0,
    biomeAt: (x, z) => biomeAt(x, z).dominant,
  });
  // Two bolt groups: each a group of >= 4 segments sharing the
  // storm-yellow basic material.
  let boltGroups = 0;
  let clouds = 0;
  let lights = 0;
  el.group.traverse((o) => {
    if (o.isLight) lights++;
    if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === 0x1e1826) clouds++;
    if (o.children && o.children.length >= 4
      && o.children.every((ch) => ch.material && ch.material.color && ch.material.color.getHex() === 0xffe14d)) boltGroups++;
  });
  assert.equal(boltGroups, 2, `expected 2 bolt shapes, found ${boltGroups}`);
  assert.equal(clouds, 6, `expected 6 cloud silhouettes, found ${clouds}`);
  assert.equal(lights, LIGHT_BUDGET, `light budget: ${lights} lights, expected ${LIGHT_BUDGET}`);
  // Flash in window 0 shows bolt A only; window 1 (t + 17) shows bolt B only.
  const base = { observerX: 0, observerY: 0, observerZ: 0, shadowCombat: false };
  const visibleBolts = () => {
    const out = [];
    el.group.traverse((o) => {
      if (o.visible && o.children && o.children.length >= 4
        && o.children.every((ch) => ch.material && ch.material.color && ch.material.color.getHex() === 0xffe14d)) out.push(o);
    });
    return out;
  };
  el.update(0.016, { ...base, t: 3.05 });
  const first = visibleBolts();
  assert.equal(first.length, 1, 'exactly one bolt visible in window 0');
  el.update(0.016, { ...base, t: 20.05 });
  const second = visibleBolts();
  assert.equal(second.length, 1, 'exactly one bolt visible in window 1');
  assert.notEqual(second[0], first[0], 'the two windows must show different bolt shapes');
});

test('WS4 G-05: acid rivers wear the flow texture and scroll it per frame', async () => {
  // DOM stub for the canvas texture module (same shape as builders.test).
  const fakeCtx = new Proxy(
    { canvas: null, createLinearGradient: () => ({ addColorStop: () => {} }), createRadialGradient: () => ({ addColorStop: () => {} }) },
    { get(t, p) { if (p in t) return t[p]; return () => {}; }, set(t, p, v) { t[p] = v; return true; } }
  );
  const fakeCanvas = { width: 0, height: 0, getContext: () => fakeCtx, style: {} };
  globalThis.document = { createElement: (tag) => (tag === 'canvas' ? fakeCanvas : { style: {} }) };
  const T = await import('../textures.js');
  const riverTex = T.acidRiverTexture();
  assert.ok(riverTex, 'acid river texture returned nothing');
  const el = buildElemental(THREE, {
    heightAt: () => 0,
    biomeAt: (x, z) => biomeAt(x, z).dominant,
    riverTexture: riverTex,
  });
  let ribbonsWithMap = 0;
  el.group.traverse((o) => {
    if (o.isMesh && o.material && o.material.map) ribbonsWithMap++;
  });
  assert.equal(ribbonsWithMap, 3, `expected 3 textured river ribbons, found ${ribbonsWithMap}`);
  el.update(0.016, { observerX: 0, observerY: 0, observerZ: 0, shadowCombat: false, t: 0 });
  assert.equal(riverTex.offset.x, 0, 'river offset at t=0');
  el.update(0.016, { observerX: 0, observerY: 0, observerZ: 0, shadowCombat: false, t: 1 });
  assert.ok(Math.abs(riverTex.offset.x - 0.04) < 1e-9, `river offset at t=1 is ${riverTex.offset.x}, expected 0.04`);
});

// ---- WS4 graphics (2026-11-16): G-06 Poison Groves spore garden ----

test('WS4 G-06: violet ground-mist dome, on inside the poison band only, opacity 0.15; no new lights', () => {
  const el = buildElemental(THREE, {
    heightAt: () => 0,
    biomeAt: (x, z) => biomeAt(x, z).dominant,
  });
  let mistDome = null;
  let lights = 0;
  el.group.traverse((o) => {
    if (o.isLight) lights++;
    if (o.userData && o.userData.poisonMist) mistDome = o;
  });
  assert.ok(mistDome, 'no poison ground-mist dome in the elemental group');
  assert.equal(mistDome.material.side, THREE.BackSide, 'mist dome must be BackSide like the haze dome');
  assert.equal(mistDome.material.fog, false, 'mist dome must ignore fog');
  assert.equal(mistDome.material.color.getHex(), 0xc06ae0, 'mist dome must be violet');
  assert.equal(lights, LIGHT_BUDGET, `light budget: ${lights} lights, expected ${LIGHT_BUDGET}`);
  // Outside the band the mist stays off.
  const outside = { observerX: 0, observerY: 0, observerZ: 0, shadowCombat: false, t: 10 };
  el.update(0.016, outside);
  assert.equal(mistDome.material.opacity, 0, 'mist must be off outside the poison band');
  // Inside the band (the poison anchor) it eases in to 0.15.
  const inside = { observerX: 180, observerY: 0, observerZ: 110, shadowCombat: false, t: 10 };
  for (let i = 0; i < 50; i++) el.update(0.1, inside);
  assert.ok(Math.abs(mistDome.material.opacity - 0.15) < 0.01,
    `mist inside the band is ${mistDome.material.opacity}, expected ~0.15`);
  // Leaving the band clears it again — eased, never snapped.
  for (let i = 0; i < 50; i++) el.update(0.1, outside);
  assert.ok(mistDome.material.opacity < 0.02, `mist after leaving is ${mistDome.material.opacity}`);
});

// ---- WS6 graphics + typed damage (2026-11-16): generalised haze dome ----

test('WS6 haze: target/colour/max per state — dim grey, gust sand; clears when the timer lapses', () => {
  const el = buildElemental(THREE, {
    heightAt: () => 0,
    biomeAt: (x, z) => biomeAt(x, z).dominant,
  });
  let hazeDome = null;
  let mistDome = null;
  el.group.traverse((o) => {
    if (o.isMesh && o.material && o.material.side === THREE.BackSide) {
      if (o.userData && o.userData.poisonMist) mistDome = o;
      else hazeDome = o;
    }
  });
  assert.ok(hazeDome, 'no smoke haze dome in the elemental group');
  assert.ok(mistDome, 'poison ground-mist dome must still exist beside it');
  const base = { observerX: 0, observerY: 0, observerZ: 0, t: 10 };
  // Shadow hit: grey to full 0.30.
  for (let i = 0; i < 50; i++) el.update(0.1, { ...base, haze: { target: 1, color: 0x5a5a66, max: 0.30 } });
  assert.equal(hazeDome.material.color.getHex(), 0x5a5a66, 'dim must be grey');
  assert.ok(Math.abs(hazeDome.material.opacity - 0.30) < 0.02,
    `dim opacity ${hazeDome.material.opacity}, expected ~0.30`);
  // Sand hit: sand-tinted to 0.35.
  for (let i = 0; i < 50; i++) el.update(0.1, { ...base, haze: { target: 1, color: 0xc2a15e, max: 0.35 } });
  assert.equal(hazeDome.material.color.getHex(), 0xc2a15e, 'gust must be sand-tinted');
  assert.ok(Math.abs(hazeDome.material.opacity - 0.35) < 0.02,
    `gust opacity ${hazeDome.material.opacity}, expected ~0.35`);
  // Timer lapsed: target 0 clears it, eased.
  for (let i = 0; i < 50; i++) el.update(0.1, { ...base, haze: { target: 0, color: 0x5a5a66, max: 0.30 } });
  assert.ok(hazeDome.material.opacity < 0.02, `haze after lapse is ${hazeDome.material.opacity}`);
  // The poison mist dome is untouched by the haze state.
  assert.equal(mistDome.material.color.getHex(), 0xc06ae0, 'mist dome must stay violet');
  assert.equal(mistDome.material.opacity, 0, 'mist dome must stay off outside the poison band');
  // Legacy shadowCombat boolean still drives the dome (old callers).
  for (let i = 0; i < 50; i++) el.update(0.1, { ...base, shadowCombat: true });
  assert.ok(el.colors().haze > 0.9, 'legacy shadowCombat must still roll haze in');
});
