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
  assert.equal(byColor.get(0xd080ff), 16, 'eight poison rocks x two veins');
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
