// tests/earth2-operators-wiring.test.mjs
// EARTH 2 — OPERATOR WIRING (Nov 14 ~23:20): the operators build
// (lib/earth2/operators.js) wired into the live scenes — the
// population extras stream and place with the land units
// (lib/earth2/streaming.js), the Bay's second circuits
// (components/earth2/DinosaurBay.jsx, via bayCircuitsFor), and
// the two-line name + life-line labels (labelTextFor). The scene
// files themselves are JSX/three and are not imported here; the
// pure seams they consume are asserted instead.
//
// Run: node --test tests/earth2-operators-wiring.test.mjs (repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { worldCreatures, parcelAtWorld } from '../lib/earth2/world.js';
import { worldStreamUnits } from '../lib/earth2/streaming.js';
import {
  MIN_COPIES,
  SPREAD_MIN_M,
  populationExtras,
  bayCircuitsFor,
  labelTextFor,
} from '../lib/earth2/operators.js';
import { FLYERS, SWIMMERS } from '../lib/earth2/creatures.js';

const T0 = Date.UTC(2026, 10, 14, 12, 0, 0);

function maxSpread(recs) {
  let best = 0;
  for (let i = 0; i < recs.length; i++) {
    for (let j = i + 1; j < recs.length; j++) {
      best = Math.max(best, Math.hypot(recs[i].x - recs[j].x, recs[i].z - recs[j].z));
    }
  }
  return best;
}

describe('BUILD 1 — population extras ride the land stream units', () => {
  it('every land unit carries its originals plus its population extras', () => {
    const creatures = worldCreatures();
    const extras = populationExtras(creatures);
    const units = worldStreamUnits().filter((u) => u.kind === 'land');
    const bySlug = new Map();
    for (const c of creatures) {
      if (!bySlug.has(c.slug)) bySlug.set(c.slug, []);
      bySlug.get(c.slug).push(c);
    }
    const extrasBySlug = new Map();
    for (const e of extras) {
      if (!extrasBySlug.has(e.slug)) extrasBySlug.set(e.slug, []);
      extrasBySlug.get(e.slug).push(e);
    }
    for (const [slug, originals] of bySlug) {
      const unit = units.find((u) => u.slug === slug);
      assert.ok(unit, `land unit exists for ${slug}`);
      const want = (extrasBySlug.get(slug) || []).length;
      assert.equal(
        unit.recs.length, originals.length + want,
        `${slug}: ${originals.length} originals + ${want} extras`,
      );
      assert.equal(
        unit.recs.filter((r) => r.operatorExtra === true).length, want,
        `${slug}: extras flagged operatorExtra`,
      );
      // The extra streams in: its stand point is one of the unit's anchors.
      for (const e of extrasBySlug.get(slug) || []) {
        assert.ok(
          unit.anchors.some((a) => Math.hypot(a.x - e.x, a.z - e.z) < 1),
          `${slug} extra copy ${e.copy} is an anchor of its unit`,
        );
      }
    }
  });

  it('Spinosaurus and Spinosaurus Rex get their second copy', () => {
    const units = worldStreamUnits().filter((u) => u.kind === 'land');
    for (const slug of ['spinosaurus', 'spinosaurus-rex']) {
      const unit = units.find((u) => u.slug === slug);
      assert.ok(unit, `land unit exists for ${slug}`);
      assert.ok(unit.recs.length >= MIN_COPIES, `${slug} has ≥ ${MIN_COPIES} copies`);
      assert.equal(unit.recs.filter((r) => r.operatorExtra === true).length, 1);
    }
  });

  it('every species spans ≥ 2 anchors ≥ 300 m apart', () => {
    const units = worldStreamUnits().filter((u) => u.kind === 'land');
    assert.ok(units.length >= 15, `land units present (got ${units.length})`);
    for (const unit of units) {
      assert.ok(unit.recs.length >= MIN_COPIES, `${unit.slug}: ≥ ${MIN_COPIES} copies`);
      const spread = maxSpread(unit.recs);
      assert.ok(
        spread >= SPREAD_MIN_M,
        `${unit.slug}: max spread ${Math.round(spread)} m ≥ ${SPREAD_MIN_M} m`,
      );
      // The extra stands far from every original of its species.
      for (const e of unit.recs.filter((r) => r.operatorExtra === true)) {
        for (const o of unit.recs.filter((r) => !r.operatorExtra)) {
          assert.ok(
            Math.hypot(e.x - o.x, e.z - o.z) >= SPREAD_MIN_M,
            `${unit.slug} extra copy ${e.copy} is ≥ ${SPREAD_MIN_M} m from original copy ${o.copy}`,
          );
        }
      }
    }
  });

  it('no extra lands on a titled parcel (E2-0619 / E2-0719)', () => {
    // The static plan cannot see the live owners map — the scene
    // skips extras on titled parcels at placement. The geometry
    // must already clear the two parcels titled today.
    const titled = new Set(['E2-0619', 'E2-0719']);
    const extras = populationExtras(worldCreatures());
    assert.ok(extras.length > 0, 'extras exist to check');
    for (const e of extras) {
      const parcel = parcelAtWorld(e.x, e.z);
      assert.ok(parcel && !titled.has(parcel.id),
        `${e.slug} extra copy ${e.copy} stands on ${parcel ? parcel.id : '?'}, not a titled parcel`);
    }
  });
});

describe('BUILD 2 — Bay placement list carries the second circuits', () => {
  it('every flyer gets a second circuit: mirrored centre, opposite direction', () => {
    for (const [slug, first] of Object.entries(FLYERS)) {
      const circuits = bayCircuitsFor('flyer', slug);
      assert.equal(circuits.length, 2, `${slug}: first + second circuit`);
      assert.equal(circuits[0].copy, 0);
      assert.equal(circuits[1].copy, 1);
      assert.deepEqual(circuits[0].circuit, first);
      const second = circuits[1].circuit;
      assert.equal(second.cx, -first.cx, `${slug}: mirrored cx`);
      assert.equal(second.cz, -first.cz, `${slug}: mirrored cz`);
      assert.equal(second.r, first.r);
      assert.equal(second.h, first.h);
      assert.equal(second.speed, first.speed);
      assert.equal(second.dir, -first.dir, `${slug}: opposite direction`);
    }
  });

  it('every marine gets a second circuit: same ellipse, opposite direction', () => {
    for (const [slug, first] of Object.entries(SWIMMERS)) {
      const circuits = bayCircuitsFor('marine', slug);
      assert.equal(circuits.length, 2, `${slug}: first + second circuit`);
      assert.equal(circuits[0].copy, 0);
      assert.equal(circuits[1].copy, 1);
      assert.deepEqual(circuits[0].circuit, first);
      const second = circuits[1].circuit;
      assert.equal(second.rx, first.rx);
      assert.equal(second.rz, first.rz);
      assert.equal(second.speed, first.speed);
      assert.equal(second.dir, -first.dir, `${slug}: opposite direction`);
    }
  });

  it('17 second circuits in total; unknown species yield none', () => {
    const flyers = Object.keys(FLYERS).flatMap((s) => bayCircuitsFor('flyer', s));
    const marines = Object.keys(SWIMMERS).flatMap((s) => bayCircuitsFor('marine', s));
    assert.equal(flyers.filter((c) => c.copy === 1).length, 9);
    assert.equal(marines.filter((c) => c.copy === 1).length, 8);
    assert.deepEqual(bayCircuitsFor('flyer', 'no-such-dino'), []);
    assert.deepEqual(bayCircuitsFor('marine', 'no-such-dino'), []);
  });
});

describe('BUILD 3 — label text: name + life line', () => {
  it('alive: "Name\\n<life line>"', () => {
    const out = labelTextFor(
      { slug: 'triceratops', copy: 0, x: 0, z: 0, parcelIndex: 1 },
      T0,
      { behaviourMode: 'graze' },
    );
    assert.equal(out.name, 'Triceratops');
    assert.match(out.line, /^Adult · graze · Nests nearby \(\d eggs\)/);
    assert.equal(out.text, `${out.name}\n${out.line}`);
  });

  it('dead: "Remains — <stage> — killed by <cause>"', () => {
    const out = labelTextFor(
      { slug: 'tyrannosaurus-rex', copy: 0, x: 0, z: 0 },
      T0,
      { status: 'dead', cause: 'hunter', diedAt: 100, nowS: 110 },
    );
    assert.equal(out.name, 'Tyrannosaurus rex');
    assert.equal(out.line, 'Remains — Adult — killed by hunter');
    assert.equal(out.text, `Tyrannosaurus rex\nRemains — Adult — killed by hunter`);
  });

  it('same creature + time = same label text', () => {
    const c = { slug: 'gallimimus', copy: 2, x: 10, z: 20, parcelIndex: 5 };
    assert.deepEqual(labelTextFor(c, T0), labelTextFor(c, T0));
  });
});
