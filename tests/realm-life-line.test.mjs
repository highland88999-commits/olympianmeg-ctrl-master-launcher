// tests/realm-life-line.test.mjs — REALM LIFE LINES IN THE OVERLAYS
// (Nov 14, 2026).
//
// One shared component (components/RealmLifeLine.jsx) renders one
// seeded representative soul's life line per realm —
// lifeLineFor(lifeFor(...)) — plus the soul census from
// populationFor(), inside each realm page's existing realm-info
// overlay HUD block. The line is honest about what it is: one
// drifting soul, picked by day so it changes daily ("One Shade
// today: ..."), with the census beside it as the whole population.
//
// This suite pins both halves, the same grep style as the
// realm-info-fade suite:
//   (a) the pure helper behind the component renders a non-empty
//       life line for every one of the 24 realm keys, over the
//       realm's REAL spawner output (18 creatures, 3 region discs,
//       population rule met), day-seeded;
//   (b) each of the 24 pages imports the component and renders it
//       with its own realm key, inside the overlay (after the
//       infoStyle div opens, before the Leave button) — so the line
//       fades with the overlay and returns with ⓘ Info.
//   (c) the Dutchman gull / sea-life surface is deliberately NOT
//       wired here (no tap-raycast fits the page's existing pointer
//       handling and the kraken banner is the only creature surface
//       — see the worker report); there is no test for it.
//
// Run: node --test tests/realm-life-line.test.mjs (from the repo root).
// No browser, no network — pure module + wired-source audits.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { REALM_KEYS, DAY_MS, FOUNDING_MS } from '../lib/afterlife/operators.js';
import { realmLifeLine } from '../lib/afterlife/realm-life-line.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const NOW = Date.UTC(2026, 10, 14, 12, 0, 0); // midday: souls drift, not rest

// --- (a) the helper renders a non-empty life line for all 24 realms ---

describe('realmLifeLine renders one seeded soul per realm', () => {
  it('covers exactly the 24 realm keys', () => {
    assert.equal(REALM_KEYS.length, 24, 'the afterlife counts 24 realms');
  });

  for (const key of REALM_KEYS) {
    it(`${key}: non-empty line + full census over the real spawner`, () => {
      const d = realmLifeLine(key, NOW);
      assert.ok(d, `${key}: data exists`);
      assert.equal(d.realmKey, key);
      // The life line itself: one soul, non-empty, stage + activity.
      assert.equal(typeof d.line, 'string', `${key}: line is a string`);
      assert.ok(d.line.length > 0, `${key}: line is non-empty`);
      assert.ok(d.line.includes('·'), `${key}: line reads "stage · activity ..." (${d.line})`);
      // The census: the real spawner — 18 creatures, 3 discs, rule met.
      assert.equal(d.census.total, 18, `${key}: 18 copies in the spawner`);
      assert.ok(d.census.alive >= 12, `${key}: at least the 12-live minimum`);
      assert.equal(d.census.areas.length, 3, `${key}: souls in all three region discs`);
      assert.equal(d.census.meetsRule, true, `${key}: population rule met`);
      // The displayed text says what it is: census + ONE soul today.
      assert.ok(d.text.includes(d.censusLine), `${key}: text carries the census`);
      assert.ok(d.text.includes(`One ${d.kind} today: ${d.line}`), `${key}: text names one soul, today`);
      assert.ok(d.text.includes(String(d.census.total)), `${key}: text carries the total`);
    });
  }

  it('the soul is seeded by day: tomorrow shows a different cell', () => {
    for (const key of REALM_KEYS) {
      const today = realmLifeLine(key, NOW);
      const tomorrow = realmLifeLine(key, NOW + DAY_MS);
      assert.equal(tomorrow.dayIndex, today.dayIndex + 1, `${key}: day index advances`);
      assert.notEqual(tomorrow.cellId, today.cellId, `${key}: a different soul tomorrow`);
      // Same day, same soul — stable all day on every device.
      assert.equal(realmLifeLine(key, NOW + 3600000).cellId, today.cellId, `${key}: same soul all day`);
    }
  });

  it('unknown realms return null (the component renders nothing)', () => {
    assert.equal(realmLifeLine('nope', NOW), null);
    assert.equal(realmLifeLine('', NOW), null);
  });
});

// --- (b) every one of the 24 pages wires the component, inside the overlay ---

describe('all 24 realm pages render RealmLifeLine in the overlay', () => {
  it('the shared component exists and renders the helper data', () => {
    assert.ok(existsSync(new URL('../components/RealmLifeLine.jsx', import.meta.url)), 'component file exists');
    const c = src('../components/RealmLifeLine.jsx');
    assert.ok(c.includes('export function RealmLifeLine'), 'component is exported');
    assert.ok(c.includes('realmLifeLine(realmKey)'), 'component reads the shared helper');
    assert.ok(c.includes('data.censusLine'), 'component renders the census');
    assert.ok(c.includes('One {data.kind} today: {data.line}'), 'component says one soul, today');
    assert.ok(c.includes("from '@/lib/afterlife/realm-life-line'"), 'component imports the helper');
  });

  it('the helper module exists and is pure (no React, no DOM)', () => {
    const h = src('../lib/afterlife/realm-life-line.js');
    assert.ok(h.includes('export function realmLifeLine'), 'helper is exported');
    assert.ok(!h.includes('react'), 'helper has no React dependency');
    assert.ok(!h.includes('document.'), 'helper touches no DOM');
    assert.ok(h.includes('populationFor(realmKey, creatures, t)'), 'census comes from populationFor');
    // Humanoid pass (Nov 14 ~23:25): the overlay line now comes from
    // humanoidLifeLineFor — stage · activity · garment (wear) ·
    // unarmed — which extends the animal lifeLineFor's shape.
    assert.ok(h.includes('humanoidLifeLineFor(life)'), 'line comes from humanoidLifeLineFor');
  });

  for (const key of REALM_KEYS) {
    it(`${key}: page imports and renders <RealmLifeLine> inside the overlay`, () => {
      const page = src(`../app/${key}/page.jsx`);
      assert.ok(
        page.includes("import { RealmLifeLine } from '@/components/RealmLifeLine';"),
        `${key}: page imports the shared component`,
      );
      assert.ok(
        page.includes(`<RealmLifeLine realmKey="${key}" />`),
        `${key}: page renders it with its own realm key`,
      );
      // Inside the overlay: after the infoStyle HUD div opens, before
      // the Leave button — so it fades with the overlay and returns
      // with ⓘ Info. (The fade itself is pinned by realm-info-fade.)
      const overlayAt = page.indexOf('style={infoStyle}');
      const lineAt = page.indexOf(`<RealmLifeLine realmKey="${key}" />`);
      const leaveAt = page.indexOf('absolute left-4 top-4 z-30');
      assert.ok(overlayAt >= 0, `${key}: overlay HUD block exists`);
      assert.ok(lineAt > overlayAt, `${key}: life line sits inside the overlay block`);
      assert.ok(leaveAt > lineAt, `${key}: life line sits before the Leave button`);
      // Exactly one render per page — one line, one soul.
      assert.equal(page.split(`<RealmLifeLine realmKey="${key}" />`).length - 1, 1, `${key}: exactly one life-line render`);
    });
  }
});
