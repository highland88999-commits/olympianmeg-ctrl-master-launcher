// tests/earth2-museum-mount.test.mjs
// Earth 2 — FOSSIL ECONOMY PHASE 2 (Merlin, 2026-10-23): the Royal
// Tyrrell Museum and John Hammond mounted into the walkable world.
// - the manifest carries both, placed and worldOnly, resolved
//   through the sealed signed-URL door like the whole cast
// - the proximity stream plan gains exactly one 'museum' unit at
//   Hammond's stand point — never in the spawn neighbourhood
// - the exchange settles end-to-end on the pure modules: fossil
//   leaves the pack, record lands in the Dracula-pattern tallies
//   (gold / aether / weapon legs + the refine fallback)
// - the scene, the Bay guard and the chamber page are wired, and
//   every import in the edited files resolves (the refinery bug
//   class, pinned shut again)
//
// Run: node --test tests/earth2-museum-mount.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import {
  EARTH2_MODEL_BY_SLUG,
  EARTH2_PUBLIC_FALLBACK,
  earth2ModelKey,
  earth2ModelKeys,
  earth2ModelUrl,
  isEarth2ModelKey,
} from '../lib/earth2/models.js';
import {
  STREAM_RADII,
  worldStreamUnits,
  streamEntryUnits,
  streamDistance,
  planStreamActions,
} from '../lib/earth2/streaming.js';
import { HAMMOND_NPC, MUSEUM_EXCHANGE_POINT } from '../lib/earth2/museum.js';
import {
  resolveSpawnParcel,
  spawnPointFor,
} from '../lib/earth2/world.js';
import {
  addFossils,
  removeFossil,
  countFossils,
} from '../lib/earth2/fossils.js';
import { exchangeFossil } from '../lib/earth2/hammond.js';
import {
  emptyBloodSacState,
  applyFossilExchange,
} from '../lib/earth2/blood-sacs.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

const seq = (vals) => {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
};

const FOSSIL = {
  id: 'fossil-velociraptor-velociraptor-tooth-test1',
  species: 'velociraptor',
  speciesName: 'Velociraptor',
  type: 'Velociraptor tooth',
  condition: 'complete',
  baseGold: 25,
  goldValue: 25,
};

describe('the manifest — the museum and the founder behind the sealed door', () => {
  it('both entries are placed, worldOnly, and addressed by their bucket keys', () => {
    const museum = EARTH2_MODEL_BY_SLUG.get('museum');
    const hammond = EARTH2_MODEL_BY_SLUG.get('hammond');
    assert.ok(museum && hammond, 'both entries exist');
    assert.equal(museum.status, 'placed');
    assert.equal(hammond.status, 'placed');
    assert.equal(museum.worldOnly, true);
    assert.equal(hammond.worldOnly, true);
    assert.equal(earth2ModelKey(museum), 'museum.glb');
    assert.equal(earth2ModelKey(hammond), 'hammond.glb');
    assert.ok(isEarth2ModelKey('museum.glb'), 'the door may sign the museum');
    assert.ok(isEarth2ModelKey('hammond.glb'), 'the door may sign the founder');
    assert.ok(earth2ModelKeys().includes('museum.glb'));
    assert.ok(earth2ModelKeys().includes('hammond.glb'));
  });

  it('delivery resolves ONLY through a signed URL — no public fallback', () => {
    const museum = EARTH2_MODEL_BY_SLUG.get('museum');
    assert.equal(EARTH2_PUBLIC_FALLBACK, false, 'the seal stands');
    assert.equal(earth2ModelUrl(museum, null), null, 'no signed map, no model');
    assert.equal(
      earth2ModelUrl(museum, { 'museum.glb': 'https://signed.example/museum.glb' }),
      'https://signed.example/museum.glb',
      'the signed URL is the load path',
    );
  });
});

describe('the stream plan — one museum unit, anchored at the counter', () => {
  it('the unit exists exactly once, with both slugs and landform-class hysteresis', () => {
    const units = worldStreamUnits();
    assert.equal(units.length, 56, 'the plan grew by exactly the museum unit');
    const museumUnits = units.filter((u) => u.kind === 'museum');
    assert.equal(museumUnits.length, 1);
    const unit = museumUnits[0];
    assert.equal(unit.key, 'museum');
    assert.deepEqual(unit.slugs, ['museum', 'hammond']);
    assert.equal(unit.anchors.length, 1);
    assert.equal(unit.anchors[0].x, HAMMOND_NPC.stand.x, 'anchored at the stand point');
    assert.equal(unit.anchors[0].z, HAMMOND_NPC.stand.z);
    assert.equal(MUSEUM_EXCHANGE_POINT.x, HAMMOND_NPC.stand.x, 'the counter is the anchor');
    assert.ok(STREAM_RADII.museum.release > STREAM_RADII.museum.load, 'hysteresis holds');
    assert.equal(streamDistance(unit, HAMMOND_NPC.stand.x, HAMMOND_NPC.stand.z), 0);
  });

  it('the museum is never resident at spawn, and streams in at the site', () => {
    const spawn = spawnPointFor(resolveSpawnParcel(null));
    const entry = streamEntryUnits(spawn.x, spawn.z);
    assert.ok(!entry.some((u) => u.key === 'museum'), 'not in the spawn neighbourhood');
    const atSite = planStreamActions(worldStreamUnits(), new Set(), HAMMOND_NPC.stand.x, HAMMOND_NPC.stand.z);
    assert.ok(atSite.load.some((u) => u.key === 'museum'), 'walking up to Drumheller loads it');
    // Beyond the release radius (the far south-east corner, well
    // past 800 m) a resident museum is freed. The landing meadow
    // itself sits INSIDE the hysteresis band (~614 m out) — a
    // resident unit correctly holds there; that is the band's job.
    const far = planStreamActions(worldStreamUnits(), new Set(['museum']), 690, 690);
    assert.ok(far.release.some((u) => u.key === 'museum'), 'leaving its country frees it');
  });
});

describe('the exchange — pack to tallies, every leg', () => {
  it('gold leg: the fossil leaves the pack and the gold tally climbs', () => {
    let pack = addFossils([], [FOSSIL]);
    assert.equal(countFossils(pack), 1);
    const record = exchangeFossil(pack[0], 'gold', () => 0.5);
    assert.equal(record.outcome, 'gold');
    assert.equal(record.amount, 25);
    pack = removeFossil(pack, record.fossilId);
    assert.equal(countFossils(pack), 0, 'Hammond keeps the fossil');
    const tallies = applyFossilExchange(emptyBloodSacState(), record, 1000);
    assert.equal(tallies.gold, 25);
    assert.equal(tallies.aether, 0);
    assert.equal(tallies.weapons.length, 0);
    assert.equal(tallies.history.length, 1);
    assert.equal(tallies.history[0].kind, 'gold');
    assert.ok(tallies.history[0].label.includes('Velociraptor tooth'), 'history names the trade');
  });

  it('aether leg: a worthy fossil refines at the standing rate', () => {
    const rich = { ...FOSSIL, id: 'fossil-t2', type: 'T. rex tooth', species: 'tyrannosaurus-rex', speciesName: 'Tyrannosaurus rex', baseGold: 110, goldValue: 110 };
    const record = exchangeFossil(rich, 'aether', () => 0.5);
    assert.equal(record.outcome, 'aether');
    assert.equal(record.amount, 4, 'floor(110 / 25)');
    const tallies = applyFossilExchange(emptyBloodSacState(), record, 1000);
    assert.equal(tallies.aether, 4);
    assert.equal(tallies.gold, 0);
  });

  it('the founder’s whim: a low roll substitutes a weapon for the currency', () => {
    const record = exchangeFossil(FOSSIL, 'gold', seq([0.01, 0]));
    assert.equal(record.outcome, 'weapon');
    assert.equal(record.weapon, 'Terrorbone Club');
    assert.equal(record.amount, 0, 'a weapon pays no currency');
    const tallies = applyFossilExchange(emptyBloodSacState(), record, 1000);
    assert.deepEqual(tallies.weapons, ['Terrorbone Club'], 'the weapon shelves with Dracula’s gifts');
    assert.equal(tallies.gold, 0);
    assert.equal(tallies.history[0].kind, 'weapon');
  });

  it('an unrefinable fossil falls back to gold, flagged on the record', () => {
    const shard = { ...FOSSIL, id: 'fossil-t3', condition: 'fragment', baseGold: 40, goldValue: 10 };
    const record = exchangeFossil(shard, 'aether', () => 0.5);
    assert.equal(record.outcome, 'gold');
    assert.equal(record.amount, 10);
    assert.equal(record.refinedFallback, true);
    const tallies = applyFossilExchange(emptyBloodSacState(), record, 1000);
    assert.equal(tallies.gold, 10, 'an exchange at his counter never pays nothing');
  });

  it('malformed records never touch the tallies', () => {
    const before = emptyBloodSacState();
    assert.deepEqual(applyFossilExchange(before, null, 1), before);
    assert.deepEqual(applyFossilExchange(before, { outcome: 'gold', amount: 0 }, 1), before);
    assert.deepEqual(applyFossilExchange(before, { outcome: 'weapon', weapon: null }, 1), before);
  });
});

describe('the wiring — scene, plan, Bay guard, chamber page', () => {
  it('the walkable world mounts the museum through the stream plan', () => {
    const world = read('components/earth2/Earth2World.jsx');
    assert.ok(world.includes("case 'museum'"), 'the stream switch seats the museum unit');
    assert.ok(world.includes('placeMuseum'), 'the mount exists');
    assert.ok(world.includes('museumSiteParcel'), 'the building seats on the site parcel');
    assert.ok(world.includes('HAMMOND_NPC'), 'Hammond stands at his Phase 1 stand point');
    assert.ok(world.includes('exchangeFossil'), 'trades settle on the Phase 1 engine');
    assert.ok(world.includes('loadFossilInventory'), 'the pack is the fossils.js store');
    assert.ok(world.includes('onFossilExchange'), 'payouts route to the chamber tallies');
    assert.ok(!world.includes('/models/earth2'), 'no hard-coded public path — the sealed door only');
  });

  it('the Bay diorama leaves the world-only pair alone', () => {
    const bay = read('components/earth2/DinosaurBay.jsx');
    assert.ok(bay.includes('!m.worldOnly'), 'Bay totals and roster skip the museum pair');
  });

  it('the chamber page receives the payouts into its tallies', () => {
    const page = read('app/earth-2/page.jsx');
    assert.ok(page.includes('applyFossilExchange'), 'page applies records to the tallies');
    assert.ok(page.includes('onFossilExchange={applyFossilPayout}'), 'the world is handed the payout seat');
  });
});

describe('import hygiene — the refinery bug class, pinned shut', () => {
  it('every import in the edited files resolves to a real file with real exports', () => {
    const files = [
      'lib/earth2/models.js',
      'lib/earth2/streaming.js',
      'lib/earth2/blood-sacs.js',
      'components/earth2/Earth2World.jsx',
      'components/earth2/DinosaurBay.jsx',
      'app/earth-2/page.jsx',
    ];
    const candidates = (base) => [
      base, `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`,
      join(base, 'index.js'), join(base, 'index.jsx'),
    ];
    const resolveSpecifier = (spec, fromFile) => {
      let base = null;
      if (spec.startsWith('@/')) base = join(repo, spec.slice(2));
      else if (spec.startsWith('.')) base = resolve(dirname(join(repo, fromFile)), spec);
      else return null;
      return candidates(base).find((c) => existsSync(c)) || null;
    };
    const importRe = /import\s+(?:\{([^}]*)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    for (const file of files) {
      const src = read(file);
      assert.ok(!src.includes('supabase-server'), `${file} must not import invented modules`);
      let m;
      while ((m = importRe.exec(src)) !== null) {
        const [, named, , spec] = m;
        if (!spec.startsWith('.') && !spec.startsWith('@/')) continue;
        const target = resolveSpecifier(spec, file);
        assert.ok(target, `${file}: import '${spec}' does not resolve to a file on disk`);
        if (target && named) {
          const targetSrc = readFileSync(target, 'utf8');
          for (let name of named.split(',').map((s) => s.trim()).filter(Boolean)) {
            name = name.split(/\s+as\s+/)[0].trim();
            const exported =
              new RegExp(`export\\s+(async\\s+)?(function|const|let|class)\\s+${name}\\b`).test(targetSrc) ||
              new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(targetSrc);
            assert.ok(exported, `${file}: '${name}' is not exported by ${spec}`);
          }
        }
      }
    }
  });
});
