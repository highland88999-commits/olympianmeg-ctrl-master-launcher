// tests/earth2-fossils.test.mjs
// EARTH 2 — THE FOSSIL ECONOMY, Phase 1 (Merlin, 2026-10-22):
// hunt a dinosaur, it drops fossils; fossils vary in value; John
// Hammond at the Royal Tyrrell Museum (Earth 2's Drumheller)
// exchanges them for gold or aether — the hunter's choice — and
// occasionally hands over a weapon instead.
//
// Pins:
// - the fossil catalog covers the Bay roster: every dinosaur,
//   flyer and marine species drops; the only non-droppers are the
//   three documented exclusions (compy-swarm, giant-mosquito,
//   vampire-bat) and the non-creatures
// - value variance: condition grades (fragment/partial/complete/
//   museum-grade) scale one base value across a sane range
// - drops are deterministic under a seeded RNG, and exact under
//   rigged RNG stubs (all-hit / all-miss)
// - the exchange math on both currency paths, incl. the aether
//   rule (1 per 25 gold-value, Complete+ floors at 1, small
//   Fragment/Partial fossils fall back to gold — never nothing)
// - weapon substitution fires only at the published 8%, under
//   always-hit and never-hit stubs and at rate over a seeded run
// - exchange records are complete enough to audit losslessly
// - the carried inventory round-trips through storage, tolerating
//   junk, mirroring the blood-sac pattern
// - the museum site is exactly one designated site on Free
//   Commons, protected from building, and Merlin's 1,000 ownable /
//   1,500 commons split stands exact
// - import hygiene: every import in the new files resolves to a
//   real file exporting what is imported (the refinery bug class)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { EARTH2_MODELS, EARTH2_MODEL_BY_SLUG } from '../lib/earth2/models.js';
import {
  FOSSIL_CONDITIONS,
  FOSSIL_CONDITION_WEIGHT_TOTAL,
  FOSSIL_DROPS,
  FOSSIL_EXCLUSIONS,
  fossilConditionById,
  rollFossilCondition,
  fossilGoldValue,
  isHuntableSpecies,
  huntableSpecies,
  fossilDropsFor,
  rollFossilDrops,
  loadFossilInventory,
  saveFossilInventory,
  addFossils,
  findFossil,
  removeFossil,
  countFossils,
  FOSSIL_STORAGE_KEY,
} from '../lib/earth2/fossils.js';
import {
  GOLD_VALUE_PER_AETHER,
  AETHER_PER_GOLD,
  WEAPON_SUBSTITUTION_CHANCE,
  HAMMOND_WEAPON_TABLE,
  HAMMOND_WEAPON_WEIGHT_TOTAL,
  rollHammondWeapon,
  hammondWeaponById,
  aetherForFossil,
  exchangeFossil,
} from '../lib/earth2/hammond.js';
import {
  MUSEUM_NAME,
  MUSEUM_SITE,
  MUSEUM_TOWN,
  museumSiteParcel,
  museumGrounds,
  museumGroundsIds,
  isMuseumSite,
  isMuseumGrounds,
  HAMMOND_NPC,
  MUSEUM_EXCHANGE_POINT,
} from '../lib/earth2/museum.js';
import {
  PARCELS,
  PARCEL_OWNABLE_COUNT,
  PARCEL_COMMONS_COUNT,
  parcelAt,
  MUSEUM_PARCEL_ID,
} from '../lib/earth2/parcels.js';
import { isProtectedParcel, canBuildOnEarth2Parcel } from '../lib/earth2/building.js';
import { parcelWorldRect } from '../lib/earth2/world.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

// The same mulberry32 the Bay arranges itself with.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const aFossil = (over = {}) => ({
  id: 'fossil-test-1',
  species: 'tyrannosaurus-rex',
  speciesName: 'Tyrannosaurus rex',
  type: 'T. rex tooth',
  condition: 'complete',
  baseGold: 110,
  goldValue: 110,
  ...over,
});

describe('the fossil catalog covers the hunted roster', () => {
  it('every dinosaur, flyer and marine species drops; non-droppers are exactly the documented exclusions', () => {
    const CREATURE_KINDS = new Set(['dinosaur', 'flyer', 'marine']);
    assert.deepEqual(
      Object.keys(FOSSIL_EXCLUSIONS).sort(),
      ['compy-swarm', 'giant-mosquito', 'vampire-bat'],
      'the exclusion list is published and closed'
    );
    for (const m of EARTH2_MODELS) {
      if (Object.hasOwn(FOSSIL_EXCLUSIONS, m.slug)) {
        assert.ok(!Object.hasOwn(FOSSIL_DROPS, m.slug), `${m.slug} is excluded and must not drop`);
        assert.ok(typeof FOSSIL_EXCLUSIONS[m.slug] === 'string' && FOSSIL_EXCLUSIONS[m.slug].length > 10,
          `${m.slug} exclusion carries its reason`);
      } else if (CREATURE_KINDS.has(m.kind)) {
        assert.ok(isHuntableSpecies(m.slug), `${m.slug} (${m.kind}) must be huntable`);
        assert.ok(FOSSIL_DROPS[m.slug].length >= 2, `${m.slug} carries at least two fossil types`);
      } else {
        assert.ok(!Object.hasOwn(FOSSIL_DROPS, m.slug), `${m.slug} (${m.kind}) is not a creature and must not drop`);
      }
    }
    // No phantom species in the tables.
    for (const slug of Object.keys(FOSSIL_DROPS)) {
      assert.ok(EARTH2_MODEL_BY_SLUG.has(slug), `${slug} exists in the manifest`);
    }
    assert.equal(huntableSpecies().length, 35, '18 dinosaurs + 9 flyers + 8 marine');
  });

  it('every drop entry is sane: named type, positive base value, real chance, ordered counts', () => {
    for (const [slug, drops] of Object.entries(FOSSIL_DROPS)) {
      for (const d of drops) {
        assert.ok(typeof d.type === 'string' && d.type.length > 0, `${slug} type named`);
        assert.ok(Number.isInteger(d.baseGold) && d.baseGold >= 1, `${slug} ${d.type} base value`);
        assert.ok(d.chance > 0 && d.chance <= 1, `${slug} ${d.type} chance`);
        assert.ok(d.min >= 1 && d.max >= d.min && d.max <= 3, `${slug} ${d.type} count range`);
      }
    }
    // Size/apex scaling reads in the numbers: the Rex's skull is
    // worth many raptor teeth.
    const rexSkull = FOSSIL_DROPS['tyrannosaurus-rex'].find((d) => d.type.includes('skull'));
    const raptorTooth = FOSSIL_DROPS['velociraptor'].find((d) => d.type.includes('tooth'));
    assert.ok(rexSkull.baseGold >= raptorTooth.baseGold * 5);
    // The sea sheds ammonites (Merlin's marine fossil).
    for (const slug of ['mosasaurus', 'kronosaurus', 'elasmosaurus', 'ichthyosaurus', 'plesiosaurus', 'liopleurodon', 'tylosaurus', 'megalodon']) {
      assert.ok(FOSSIL_DROPS[slug].some((d) => d.type === 'Ammonite'), `${slug} drops ammonites`);
    }
    assert.equal(fossilDropsFor('giant-mosquito'), null);
    assert.equal(fossilDropsFor('not-a-species'), null);
  });
});

describe('value varies — the condition grades', () => {
  it('weights sum to 100 and multipliers climb fragment < partial < complete < museum-grade', () => {
    assert.equal(FOSSIL_CONDITION_WEIGHT_TOTAL, 100);
    assert.equal(FOSSIL_CONDITIONS.reduce((s, c) => s + c.weight, 0), 100);
    const mults = FOSSIL_CONDITIONS.map((c) => c.multiplier);
    assert.deepEqual(mults, [0.25, 0.6, 1, 2.5]);
    for (let i = 1; i < mults.length; i++) assert.ok(mults[i] > mults[i - 1]);
  });

  it('one base value grades out across the range, and never below 1 gold', () => {
    const byId = (id) => fossilConditionById(id);
    assert.equal(fossilGoldValue(100, byId('fragment')), 25);
    assert.equal(fossilGoldValue(100, byId('partial')), 60);
    assert.equal(fossilGoldValue(100, byId('complete')), 100);
    assert.equal(fossilGoldValue(100, byId('museum-grade')), 250);
    assert.equal(fossilGoldValue(1, byId('fragment')), 1, 'even a splinter is worth one gold');
    const values = new Set(FOSSIL_CONDITIONS.map((c) => fossilGoldValue(110, c)));
    assert.equal(values.size, 4, 'the same T. rex tooth takes four different values');
  });

  it('condition rolls hit every grade under a seeded source', () => {
    const rng = mulberry32(99);
    const seen = new Set();
    for (let i = 0; i < 2000; i++) seen.add(rollFossilCondition(rng).id);
    assert.deepEqual([...seen].sort(), ['complete', 'fragment', 'museum-grade', 'partial']);
  });
});

describe('the kill — drop rolls', () => {
  it('are deterministic under a seeded RNG', () => {
    for (const slug of ['tyrannosaurus-rex', 'mosasaurus', 'archaeopteryx', 'ankylosaurus']) {
      assert.deepEqual(rollFossilDrops(slug, mulberry32(1234)), rollFossilDrops(slug, mulberry32(1234)), slug);
    }
  });

  it('an all-hit stub drops every type at minimum count, all fragments', () => {
    const drops = rollFossilDrops('tyrannosaurus-rex', () => 0);
    assert.equal(drops.length, 3, 'tooth + femur + skull, one each at min');
    assert.ok(drops.every((f) => f.condition === 'fragment'));
    const byType = Object.fromEntries(drops.map((f) => [f.type, f.goldValue]));
    assert.equal(byType['T. rex tooth'], 28); // round(110 × 0.25)
    assert.equal(byType['T. rex femur'], 20);
    assert.equal(byType['T. rex skull'], 60);
  });

  it('an all-miss-leaning stub drops only the certain fossils, at max count, museum-grade', () => {
    const drops = rollFossilDrops('velociraptor', () => 0.9999);
    assert.equal(drops.length, 2, 'only the chance-1 tooth, twice at max');
    assert.ok(drops.every((f) => f.type === 'Velociraptor tooth' && f.condition === 'museum-grade'));
    assert.ok(drops.every((f) => f.goldValue === 63), 'round(25 × 2.5)');
  });

  it('drop values stay inside sane bounds over seeded runs', () => {
    const maxValue = Math.max(...Object.values(FOSSIL_DROPS).flat().map((d) => d.baseGold)) * 2.5;
    const rng = mulberry32(7);
    let total = 0;
    for (const slug of huntableSpecies()) {
      for (let i = 0; i < 40; i++) {
        for (const f of rollFossilDrops(slug, rng)) {
          total++;
          assert.ok(f.goldValue >= 1 && f.goldValue <= maxValue, `${f.type} value ${f.goldValue}`);
          assert.ok(fossilConditionById(f.condition), f.condition);
          assert.equal(f.species, slug);
          assert.ok(typeof f.id === 'string' && f.id.startsWith('fossil-'));
        }
      }
    }
    assert.ok(total > 500, `a real sample of fossils rolled (${total})`);
  });

  it('excluded and unknown species drop nothing at all (null, not an empty pack)', () => {
    assert.equal(rollFossilDrops('giant-mosquito', mulberry32(1)), null);
    assert.equal(rollFossilDrops('compy-swarm', mulberry32(1)), null);
    assert.equal(rollFossilDrops('vampire-bat', mulberry32(1)), null);
    assert.equal(rollFossilDrops('dracula', mulberry32(1)), null);
    assert.equal(rollFossilDrops('nope', mulberry32(1)), null);
  });
});

describe("Hammond's exchange — the currency paths", () => {
  const neverWeapon = () => 0.99;

  it('gold pays the graded gold value, exactly', () => {
    const rec = exchangeFossil(aFossil({ goldValue: 110 }), 'gold', neverWeapon);
    assert.equal(rec.outcome, 'gold');
    assert.equal(rec.amount, 110);
    assert.equal(rec.weapon, null);
    assert.equal(rec.refinedFallback, false);
  });

  it('aether pays floor(value / 25) — the refinery rate', () => {
    assert.equal(GOLD_VALUE_PER_AETHER, 25);
    assert.equal(AETHER_PER_GOLD, 1 / 25);
    assert.equal(aetherForFossil({ goldValue: 130, condition: 'complete' }), 5);
    assert.equal(aetherForFossil({ goldValue: 25, condition: 'partial' }), 1);
    const rec = exchangeFossil(aFossil({ goldValue: 130 }), 'aether', neverWeapon);
    assert.equal(rec.outcome, 'aether');
    assert.equal(rec.amount, 5);
  });

  it('a Complete or Museum-grade fossil always refines to at least 1 aether', () => {
    assert.equal(aetherForFossil({ goldValue: 20, condition: 'complete' }), 1);
    assert.equal(aetherForFossil({ goldValue: 4, condition: 'museum-grade' }), 1);
    const rec = exchangeFossil(aFossil({ goldValue: 20, condition: 'complete' }), 'aether', neverWeapon);
    assert.equal(rec.outcome, 'aether');
    assert.equal(rec.amount, 1);
  });

  it('a small Fragment/Partial fossil cannot refine — Hammond pays gold and the record says so', () => {
    assert.equal(aetherForFossil({ goldValue: 24, condition: 'partial' }), 0);
    assert.equal(aetherForFossil({ goldValue: 20, condition: 'fragment' }), 0);
    const rec = exchangeFossil(aFossil({ goldValue: 20, condition: 'fragment' }), 'aether', neverWeapon);
    assert.equal(rec.outcome, 'gold', 'never a zero payout');
    assert.equal(rec.amount, 20);
    assert.equal(rec.currencyChoice, 'aether', 'the record keeps what was asked');
    assert.equal(rec.refinedFallback, true);
  });

  it('malformed fossils are refused, strangers choices read as gold', () => {
    assert.equal(exchangeFossil(null, 'gold', neverWeapon), null);
    assert.equal(exchangeFossil({}, 'gold', neverWeapon), null);
    assert.equal(exchangeFossil(aFossil({ goldValue: 0 }), 'gold', neverWeapon), null);
    assert.equal(exchangeFossil(aFossil(), 'barter', neverWeapon).currencyChoice, 'gold');
  });
});

describe("Hammond's whim — the weapon substitution", () => {
  it('the published rate is 8% and the cabinet weights sum to 100', () => {
    assert.equal(WEAPON_SUBSTITUTION_CHANCE, 0.08);
    assert.equal(HAMMOND_WEAPON_WEIGHT_TOTAL, 100);
    assert.equal(HAMMOND_WEAPON_TABLE.length, 5);
    const rarities = new Set(HAMMOND_WEAPON_TABLE.map((w) => w.rarity));
    assert.ok(rarities.has('common') && rarities.has('legendary'), 'the cabinet spans the tiers');
    for (const w of HAMMOND_WEAPON_TABLE) assert.equal(hammondWeaponById(w.id).weapon, w.weapon);
  });

  it('an always-hit stub substitutes a weapon instead of either currency', () => {
    const seq = [0.0, 0.0]; // substitution roll, then the cabinet roll
    let i = 0;
    const rec = exchangeFossil(aFossil(), 'aether', () => seq[i++]);
    assert.equal(rec.outcome, 'weapon');
    assert.equal(rec.weapon, 'Terrorbone Club');
    assert.equal(rec.weaponRarity, 'common');
    assert.equal(rec.amount, 0, 'a weapon replaces the currency — not both');
    assert.equal(rec.currencyChoice, 'aether', 'rolled regardless of the currency asked');
  });

  it('a never-hit stub never substitutes', () => {
    for (let i = 0; i < 50; i++) {
      assert.notEqual(exchangeFossil(aFossil(), 'gold', () => 0.99).outcome, 'weapon');
    }
  });

  it('fires at the published rate over a seeded run, and every cabinet piece is reachable', () => {
    const rng = mulberry32(20261022);
    let weapons = 0;
    const seen = new Set();
    const N = 5000;
    for (let i = 0; i < N; i++) {
      const rec = exchangeFossil(aFossil(), i % 2 ? 'aether' : 'gold', rng);
      if (rec.outcome === 'weapon') { weapons++; seen.add(rec.weaponId); }
    }
    const rate = weapons / N;
    assert.ok(rate > 0.05 && rate < 0.11, `weapon rate ${rate} ≈ 0.08`);
    assert.equal(seen.size, HAMMOND_WEAPON_TABLE.length, 'the whole cabinet changes hands');
  });

  it('the cabinet roll alone reaches every weapon under a seeded source', () => {
    const rng = mulberry32(5);
    const seen = new Set();
    for (let i = 0; i < 2000; i++) seen.add(rollHammondWeapon(rng).id);
    assert.equal(seen.size, HAMMOND_WEAPON_TABLE.length);
  });
});

describe('the exchange record audits losslessly', () => {
  it('carries the fossil, the ask, the outcome and the deciding roll', () => {
    const f = aFossil({ id: 'fossil-abc', goldValue: 75, condition: 'partial', type: 'Mosasaurus tooth', species: 'mosasaurus', speciesName: 'Mosasaurus' });
    const rec = exchangeFossil(f, 'aether', () => 0.5);
    for (const key of ['fossilId', 'species', 'speciesName', 'type', 'condition', 'goldValue',
      'currencyChoice', 'outcome', 'amount', 'weapon', 'weaponId', 'weaponRarity',
      'substitutionRoll', 'refinedFallback']) {
      assert.ok(Object.hasOwn(rec, key), `record carries ${key}`);
    }
    assert.equal(rec.fossilId, 'fossil-abc');
    assert.equal(rec.species, 'mosasaurus');
    assert.equal(rec.goldValue, 75);
    assert.equal(rec.substitutionRoll, 0.5);
    assert.equal(rec.outcome, 'aether'); // floor(75/25) = 3
    assert.equal(rec.amount, 3);
  });
});

describe('the carried pack — fossil inventory', () => {
  it('pure list helpers add, find, remove and count', () => {
    const rng = mulberry32(3);
    const drops = rollFossilDrops('triceratops', rng);
    let pack = addFossils([], drops);
    assert.equal(countFossils(pack), drops.length);
    pack = addFossils(pack, rollFossilDrops('gallimimus', rng));
    const target = pack[0];
    assert.equal(findFossil(pack, target.id).id, target.id);
    const after = removeFossil(pack, target.id);
    assert.equal(after.length, pack.length - 1);
    assert.equal(findFossil(after, target.id), null);
    assert.equal(removeFossil(pack, 'fossil-not-held').length, pack.length);
  });

  it('round-trips through storage and tolerates junk', () => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    try {
      assert.equal(FOSSIL_STORAGE_KEY, 'earth2:fossils:v1');
      assert.deepEqual(loadFossilInventory(), []);
      const drops = rollFossilDrops('spinosaurus', mulberry32(11));
      saveFossilInventory(drops);
      assert.deepEqual(loadFossilInventory(), drops);
      // Junk in the stored pack is dropped, the good fossils kept.
      store.set(FOSSIL_STORAGE_KEY, JSON.stringify([null, { id: 42 }, { id: 'x' }, ...drops]));
      assert.deepEqual(loadFossilInventory(), drops);
      store.set(FOSSIL_STORAGE_KEY, '{not json');
      assert.deepEqual(loadFossilInventory(), []);
    } finally {
      delete globalThis.localStorage;
    }
  });
});

describe('the museum — Earth 2’s Drumheller', () => {
  it('designates exactly one site: the parcel holding the real museum’s coordinates', () => {
    const site = museumSiteParcel();
    assert.equal(site.id, 'E2-0510');
    assert.equal(site.id, MUSEUM_PARCEL_ID);
    assert.equal(site, parcelAt(51.4792, -112.7897), 'the Royal Tyrrell’s own ground');
    assert.equal(MUSEUM_SITE.name, 'Royal Tyrrell Museum');
    assert.equal(MUSEUM_NAME, 'Royal Tyrrell Museum');
    assert.equal(MUSEUM_SITE.town, 'Drumheller');
    assert.equal(MUSEUM_TOWN, 'Drumheller');
    const grounds = museumGrounds();
    assert.equal(grounds.filter((p) => isMuseumSite(p)).length, 1, 'exactly one site parcel');
    assert.equal(new Set(museumGroundsIds()).size, grounds.length, 'grounds are unique');
  });

  it('the grounds are Free Commons forever — and the 1000/1500 split stands exact', () => {
    for (const p of museumGrounds()) {
      assert.equal(p.kind, 'commons', p.id);
      assert.equal(p.ownable, false, p.id);
      assert.equal(p.priceGold, null, `${p.id} — Free Commons carry no price`);
      assert.ok(isMuseumGrounds(p), p.id);
    }
    assert.equal(PARCELS.filter((p) => p.ownable).length, PARCEL_OWNABLE_COUNT);
    assert.equal(PARCELS.filter((p) => !p.ownable).length, PARCEL_COMMONS_COUNT);
    assert.equal(PARCEL_OWNABLE_COUNT, 1000);
    assert.equal(PARCEL_COMMONS_COUNT, 1500);
  });

  it('the grounds are protected — nobody builds on the museum, not even a title holder', () => {
    for (const p of museumGrounds()) assert.equal(isProtectedParcel(p), true, p.id);
    const owner = { id: 'u-owner', email: 'owner@example.com' };
    assert.equal(canBuildOnEarth2Parcel(owner, museumSiteParcel(), null, null).reason, 'protected');
  });

  it('Hammond stands at the museum, on its ground, at terrain height', () => {
    assert.equal(HAMMOND_NPC.name, 'John Hammond');
    assert.equal(HAMMOND_NPC.parcelId, MUSEUM_PARCEL_ID);
    const rect = parcelWorldRect(museumSiteParcel());
    assert.ok(HAMMOND_NPC.stand.x >= rect.minX && HAMMOND_NPC.stand.x <= rect.maxX, 'stand inside the site parcel');
    assert.ok(HAMMOND_NPC.stand.z >= rect.minZ && HAMMOND_NPC.stand.z <= rect.maxZ, 'stand inside the site parcel');
    assert.ok(Number.isFinite(HAMMOND_NPC.stand.y));
    assert.equal(MUSEUM_EXCHANGE_POINT.parcelId, MUSEUM_PARCEL_ID);
    assert.equal(MUSEUM_EXCHANGE_POINT.x, HAMMOND_NPC.stand.x);
    assert.equal(MUSEUM_EXCHANGE_POINT.z, HAMMOND_NPC.stand.z);
  });
});

describe('import hygiene — the refinery bug class, pinned shut', () => {
  it('every import in the new and edited files resolves to a real file with real exports', () => {
    const files = [
      'lib/earth2/fossils.js',
      'lib/earth2/hammond.js',
      'lib/earth2/museum.js',
      'lib/earth2/parcels.js',
      'lib/earth2/building.js',
    ];
    const candidates = (base) => [
      base, `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`,
      join(base, 'index.js'), join(base, 'index.jsx'),
    ];
    const resolveSpecifier = (spec, fromFile) => {
      let base = null;
      if (spec.startsWith('@/')) base = join(repo, spec.slice(2));
      else if (spec.startsWith('.')) base = resolve(dirname(join(repo, fromFile)), spec);
      else return null; // bare package — not ours to pin
      return candidates(base).find((c) => existsSync(c)) || null;
    };
    const importRe = /import\s+(?:\{([^}]*)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    const exportRe = /export\s+(?:\{([^}]*)\}|(\w+))\s*(?:from\s+['"]([^'"]+)['"])?/g;
    for (const file of files) {
      const src = read(file);
      assert.ok(!src.includes('supabase-server'), `${file} must not import invented modules`);
      let m;
      while ((m = importRe.exec(src)) !== null) {
        const [, named, , spec] = m;
        const target = resolveSpecifier(spec, file);
        if (spec.startsWith('.') || spec.startsWith('@/')) {
          assert.ok(target, `${file}: import '${spec}' does not resolve to a file on disk`);
        }
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
      // Re-export statements (museum.js re-exports the site name/id)
      // resolve too, and the names they forward must exist upstream.
      while ((m = exportRe.exec(src)) !== null) {
        const [, named, , spec] = m;
        if (!spec || !named) continue;
        const target = resolveSpecifier(spec, file);
        assert.ok(target, `${file}: re-export '${spec}' does not resolve to a file on disk`);
        const targetSrc = readFileSync(target, 'utf8');
        for (let name of named.split(',').map((s) => s.trim()).filter(Boolean)) {
          name = name.split(/\s+as\s+/)[0].trim();
          const exported =
            new RegExp(`export\\s+(async\\s+)?(function|const|let|class)\\s+${name}\\b`).test(targetSrc) ||
            new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(targetSrc);
          assert.ok(exported, `${file}: re-exported '${name}' is not exported by ${spec}`);
        }
      }
    }
  });
});
