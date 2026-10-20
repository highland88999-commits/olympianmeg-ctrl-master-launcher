// tests/tower-panels.test.mjs
// Honesty + coverage tests for the hub god-tower ad panel assignment.
// Run: node tests/tower-panels.test.mjs (from the repo root).
// No browser, no network — asserts on the deterministic assignment.
//
// Rules under test (Merlin):
// - Panel 0 of every tower is his native stake.com slot — never removed,
//   never rotated out, affiliate URL byte-identical.
// - Panels 1–3 rotate the real billboard inventory; no tower repeats a slot.
// - Every affiliate partner appears on at least one tower across the ring
//   of 10 (spawn sits in the middle with all ten towers visible).
// - YOUR AD HERE fillers carry no tracking URL (taps open the advertise
//   inquiry, never a dead affiliate link).
import { readFileSync } from 'node:fs';
import {
  panelsForTower,
  PANELS_PER_TOWER,
  TOWER_COUNT,
  billboardNumberFor,
} from '../lib/tower-panels.js';
import { PARTNERS, STAKE_SLOT, BETTY_SLOT } from '../lib/partners.js';
import { GOD_MENUS } from '../lib/god-menus.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const STAKE_URL = 'https://stake.com/?c=1FofAXWx';

// --- per-tower shape ---
for (let i = 0; i < TOWER_COUNT; i++) {
  const panels = panelsForTower(i);
  t(`tower ${i}: ${PANELS_PER_TOWER} panels`, panels.length === PANELS_PER_TOWER);
  t(`tower ${i}: panel 0 is the stake slot`, panels[0].key === STAKE_SLOT.key);
  t(
    `tower ${i}: exactly one stake panel`,
    panels.filter((p) => p.key === STAKE_SLOT.key).length === 1
  );
  const keys = panels.map((p) => p.key);
  t(`tower ${i}: no duplicate slot on one tower`, new Set(keys).size === keys.length);
  t(
    `tower ${i}: stake affiliate URL intact`,
    panels[0].trackingUrl === STAKE_URL
  );
  t(
    `tower ${i}: stake tagline intact`,
    panels[0].tagline === STAKE_SLOT.tagline
  );
}

// --- assignment is deterministic (stable across reloads) ---
for (let i = 0; i < TOWER_COUNT; i++) {
  t(
    `tower ${i}: deterministic`,
    JSON.stringify(panelsForTower(i)) ===
      JSON.stringify(panelsForTower(i))
  );
}
// Neighboring towers show different rotations (the ring isn't 10 clones).
t(
  'tower 0 and tower 1 rotate different partners',
  JSON.stringify(panelsForTower(0).slice(1)) !==
    JSON.stringify(panelsForTower(1).slice(1))
);

// --- coverage across the ring ---
const seen = new Set();
for (let i = 0; i < TOWER_COUNT; i++) {
  for (const p of panelsForTower(i)) seen.add(p.key);
}
for (const p of PARTNERS) {
  t(`partner ${p.key} appears on at least one tower`, seen.has(p.key));
}
t('betty appears on at least one tower', seen.has(BETTY_SLOT.key));
t('all 7 partners appear', PARTNERS.every((p) => seen.has(p.key)));

// --- YOUR AD HERE fillers are linkless (mailto path, never a dead URL) ---
let yahCount = 0;
for (let i = 0; i < TOWER_COUNT; i++) {
  for (const p of panelsForTower(i)) {
    if (p.key.startsWith('your-ad-here')) {
      yahCount++;
      t(`tower ${i}: ${p.key} has no trackingUrl`, !p.trackingUrl);
    }
  }
}
t('at least one YOUR AD HERE filler is in rotation', yahCount > 0);

// --- every rotating panel is a real inventory slot ---
for (let i = 0; i < TOWER_COUNT; i++) {
  for (const p of panelsForTower(i).slice(1)) {
    t(
      `tower ${i}: rotating panel ${p.key} has a name + accent`,
      typeof p.name === 'string' && p.name.length > 0 &&
        typeof p.accent === 'string' && p.accent.length > 0
    );
  }
}

// --- billboard numbering: ONE run 1–44 across the ring (Merlin,
// 2026-10-20). The number lives on the panel, not under the satellite:
// tower t in GOD_TOWER_SPOTS (band) order carries billboards
// t*4+1 … t*4+4, panels in panelsForTower order 0–3. ---
const TOWER_TOTAL = GOD_MENUS.length; // 11 towers
const allNumbers = [];
for (let ti = 0; ti < TOWER_TOTAL; ti++) {
  for (let pi = 0; pi < PANELS_PER_TOWER; pi++) {
    allNumbers.push(billboardNumberFor(ti, pi));
  }
}
t(
  'billboard run is exactly 1..44 in tower/panel order',
  allNumbers.length === 44 && allNumbers.every((n, k) => n === k + 1)
);
t('billboard numbers are unique', new Set(allNumbers).size === 44);
t(
  'tower 0 carries billboards 1-4',
  billboardNumberFor(0, 0) === 1 && billboardNumberFor(0, 3) === 4
);
t('tower 1 starts at 5', billboardNumberFor(1, 0) === 5);
t(
  'last tower carries 41-44',
  billboardNumberFor(TOWER_TOTAL - 1, 0) === 41 &&
    billboardNumberFor(TOWER_TOTAL - 1, 3) === 44
);
t(
  'mapping is towerIndex*4 + panelIndex + 1',
  billboardNumberFor(5, 2) === 5 * 4 + 2 + 1
);

// --- static wiring guards (same grep style as the hub suites) ---
const godTowerSrc = readFileSync(
  new URL('../components/GodTower.jsx', import.meta.url),
  'utf8'
);
const ringsSrc = readFileSync(
  new URL('../components/GodOrbitRings.jsx', import.meta.url),
  'utf8'
);
const homeSceneSrc = readFileSync(
  new URL('../components/HomeScene.jsx', import.meta.url),
  'utf8'
);
t(
  'old under-satellite number removed from GodOrbitRings',
  !ringsSrc.includes('numLabelRef') && !ringsSrc.includes('String(index + 1)')
);
t('god-name label kept in GodOrbitRings', ringsSrc.includes('band.label'));
t(
  'GodTower gives every panel a badge from billboardNumberFor',
  godTowerSrc.includes('badgeNumber={billboardNumberFor(towerIndex, i)}')
);
t(
  'badge backing is a black plate',
  godTowerSrc.includes('BillboardNumberBadge') &&
    godTowerSrc.includes('meshBasicMaterial color="#000000"')
);
t(
  'badge plate width follows the digit count (plate only borders the number)',
  godTowerSrc.includes('label.length * 0.36')
);
const badgeFnSrc = godTowerSrc.slice(
  godTowerSrc.indexOf('function BillboardNumberBadge'),
  godTowerSrc.indexOf('function TowerAdPanel')
);
t(
  'badge is NOT a camera-facing billboard (it rides its panel face)',
  !badgeFnSrc.includes('<Billboard')
);
t(
  'HomeScene passes each tower its band-order index',
  homeSceneSrc.includes('towerIndex={i}')
);

console.log(`\ntower-panels: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
