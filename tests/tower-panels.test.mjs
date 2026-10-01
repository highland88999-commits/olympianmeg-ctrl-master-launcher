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
import {
  panelsForTower,
  PANELS_PER_TOWER,
  TOWER_COUNT,
} from '../lib/tower-panels.js';
import { PARTNERS, STAKE_SLOT, BETTY_SLOT } from '../lib/partners.js';

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

console.log(`\ntower-panels: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
