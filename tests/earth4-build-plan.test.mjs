/**
 * earth4-build-plan.test.mjs — the numeric-plan normalizer.
 *
 * The vocab maps here must agree with the build-time compiler
 * (~/workspace/earth4/build-creature-plans.py): the cross-check at
 * the bottom pins that normalizeEntry on a raw build-map entry
 * produces exactly the compiled plan for that species.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SIZE_WORDS, shapeForPart, positionOffset, sizeVector, distribution,
  normalizeEntry, normalizePart, normalizePlan, planForSpecies, renderSizeFor,
  enforceBudget, MAX_VISIBLE_PARTS, FALLBACK_PLANS, partPriority,
  surfaceFamilyFor, defaultSurfaceFor,
} from '../lib/earth4/build-plan.js';

import { SPECIES_CATALOGUE as CATALOGUE } from '../lib/earth4/species-catalogue.js';

const PLANS = JSON.parse(readFileSync(
  new URL('../lib/earth4/creature-plans.json', import.meta.url), 'utf8'));

// Raw build-map entries, copied verbatim from
// ~/workspace/your_files/species-anatomy/species-build-map.jsonl.
const INSECT_ENTRY = {
  species: 'Acheta domesticus',
  parts: [
    { name: 'head', count: 1, position: 'anterior', relative_size: 'small' },
    { name: 'thorax', count: 1, position: 'central', relative_size: 'medium' },
    { name: 'abdomen', count: 1, position: 'posterior', relative_size: 'large' },
    { name: 'legs', count: 6, position: 'paired ventral', relative_size: 'medium' },
    { name: 'antennae', count: 2, position: 'anterior, paired', relative_size: 'small' },
    { name: 'compound eyes', count: 2, position: 'anterior, paired lateral', relative_size: 'small' },
    { name: 'wings', count: 2, position: 'dorsal, paired', relative_size: 'large' },
    { name: 'mouthparts', count: 1, position: 'anterior, ventral', relative_size: 'tiny' },
  ],
  distinguishing_features: ['six jointed legs', 'three body segments'],
  confidence: 'higher-taxon',
};

const BIRD_ENTRY = {
  species: 'Cyanocorax cyanopogon',
  parts: [
    { name: 'body', count: 1, position: 'central', relative_size: 'dominant' },
    { name: 'head', count: 1, position: 'anterior', relative_size: 'small' },
    { name: 'beak', count: 1, position: 'anterior, terminal', relative_size: 'small' },
    { name: 'wings', count: 2, position: 'lateral, paired', relative_size: 'large' },
    { name: 'legs', count: 2, position: 'ventral, paired', relative_size: 'medium' },
    { name: 'feet', count: 2, position: 'ventral, paired, terminal', relative_size: 'small' },
    { name: 'tail', count: 1, position: 'posterior, terminal', relative_size: 'medium' },
    { name: 'eyes', count: 2, position: 'anterior, paired lateral', relative_size: 'small' },
  ],
  distinguishing_features: [
    'Measured: Body mass 146.0 g; beak culmen 34.5 mm; beak nares 19.4 mm; '
    + 'beak width 10.1 mm; beak depth 11.5 mm; tarsus 45.0 mm; '
    + 'wing 141.7 mm; Kipps distance 12.6 mm; tail 149.6 mm',
  ],
  confidence: 'species',
};

const FISH_ENTRY = {
  species: 'Aioliops brachypterus',
  parts: [
    { name: 'body', count: 1, position: 'central', relative_size: 'dominant' },
    { name: 'head', count: 1, position: 'anterior', relative_size: 'medium' },
    { name: 'dorsal fin', count: 1, position: 'dorsal', relative_size: 'medium' },
    { name: 'pectoral fins', count: 2, position: 'lateral, paired', relative_size: 'medium' },
    { name: 'pelvic fins', count: 2, position: 'ventral, paired', relative_size: 'small' },
    { name: 'anal fin', count: 1, position: 'ventral, posterior', relative_size: 'small' },
    { name: 'caudal fin', count: 1, position: 'posterior, terminal', relative_size: 'large' },
    { name: 'eyes', count: 2, position: 'anterior, paired lateral', relative_size: 'small' },
    { name: 'scales', count: 'many', position: 'throughout body', relative_size: 'tiny' },
    { name: 'lateral line', count: 1, position: 'lateral', relative_size: 'small' },
  ],
  distinguishing_features: ['rayed fins'],
  confidence: 'higher-taxon',
};

const PLANT_ENTRY = {
  species: 'Acacia aneura',
  parts: [
    { name: 'roots', count: 'many', position: 'basal', relative_size: 'medium' },
    { name: 'stem', count: 1, position: 'central', relative_size: 'large' },
    { name: 'leaves', count: 'many', position: 'lateral', relative_size: 'large' },
    { name: 'flowers', count: 'many', position: 'apical', relative_size: 'medium' },
    { name: 'seeds', count: 'many', position: 'inside fruit', relative_size: 'small' },
    { name: 'fruit', count: 1, position: 'apical', relative_size: 'medium' },
  ],
  distinguishing_features: ['flowers'],
  confidence: 'higher-taxon',
};

const FUNGUS_ENTRY = {
  species: 'Cortinarius carneoroseus',
  parts: [
    { name: 'cap', count: 1, position: 'apical', relative_size: 'large' },
    { name: 'gills', count: 'many', position: 'under cap', relative_size: 'small' },
    { name: 'stipe', count: 1, position: 'central', relative_size: 'medium' },
    { name: 'mycelium', count: 1, position: 'basal', relative_size: 'large' },
    { name: 'spores', count: 'many', position: 'on gills', relative_size: 'tiny' },
  ],
  distinguishing_features: ['cap with gills'],
  confidence: 'higher-taxon',
};

describe('vocab maps', () => {
  it('size words resolve to numbers', () => {
    assert.equal(SIZE_WORDS.tiny, 0.07);
    assert.equal(SIZE_WORDS.small, 0.14);
    assert.equal(SIZE_WORDS.medium, 0.24);
    assert.equal(SIZE_WORDS.large, 0.38);
    assert.equal(SIZE_WORDS.dominant, 0.55);
  });

  it('position words resolve to offsets', () => {
    assert.deepEqual(positionOffset('anterior'), [0.32, 0, 0]);
    assert.deepEqual(positionOffset('posterior, terminal'), [-0.45, 0, 0]);
    assert.deepEqual(positionOffset('dorsal'), [0, 0.22, 0]);
    assert.deepEqual(positionOffset('ventral, paired'), [0, -0.22, 0]);
    assert.deepEqual(positionOffset('apical'), [0, 0.4, 0]);
    assert.deepEqual(positionOffset('anterior, paired lateral'), [0.32, 0, 0.22]);
  });

  it('part names map to primitive shapes', () => {
    assert.equal(shapeForPart('legs'), 'cylinder');
    assert.equal(shapeForPart('wings'), 'plane');
    assert.equal(shapeForPart('dorsal fin'), 'plane');
    assert.equal(shapeForPart('beak'), 'cone');
    assert.equal(shapeForPart('tail'), 'cone');
    assert.equal(shapeForPart('head'), 'sphere');
    assert.equal(shapeForPart('stem'), 'cylinder');
    assert.equal(shapeForPart('leaves'), 'sphere');
    assert.equal(shapeForPart('leaflets'), 'sphere');
    assert.equal(shapeForPart('flowers'), 'sphere');
    assert.equal(shapeForPart('branches'), 'cone');
    assert.equal(shapeForPart('needles'), 'cone');
    assert.equal(shapeForPart('cap'), 'sphere');
    assert.equal(shapeForPart('shell valves'), 'sphere');
  });

  it('name-aware positions put volumes where they belong', () => {
    // A head buried at x=0.32 reads as one ball with the body;
    // forelegs and hindlegs at the same x read as one pair.
    assert.deepEqual(positionOffset('anterior', 'head'), [0.36, 0.05, 0]);
    assert.deepEqual(
      positionOffset('anterior, paired lateral', 'eyes'), [0.38, 0.08, 0.09]);
    assert.deepEqual(positionOffset('ventral', 'forelegs'), [0.2, -0.22, 0]);
    assert.deepEqual(positionOffset('ventral', 'hindlegs'), [-0.2, -0.22, 0]);
    assert.deepEqual(
      positionOffset('anterior, paired lateral', 'ears'), [0.36, 0.12, 0.09]);
    // Conifer tiers sit on the stem axis, not offset sideways.
    assert.deepEqual(positionOffset('lateral', 'branches'), [0, 0.05, 0]);
    assert.deepEqual(positionOffset('lateral', 'needles'), [0, 0.32, 0]);
    // Plain word offsets are unchanged when no name is passed.
    assert.deepEqual(positionOffset('anterior'), [0.32, 0, 0]);
  });

  it('foliage is a flattened puff, legs are stocky, cones are compact', () => {
    assert.deepEqual(sizeVector('sphere', 'leaves', 0.38),
      [0.456, 0.171, 0.456]);
    assert.deepEqual(sizeVector('cylinder', 'forelegs', 0.24),
      [0.108, 0.24, 0.108]);
    assert.deepEqual(sizeVector('cone', 'branches', 0.38),
      [0.251, 0.494, 0.251]);
    assert.deepEqual(sizeVector('cone', 'needles', 0.14),
      [0.154, 0.364, 0.154]);
    assert.deepEqual(sizeVector('sphere', 'cones', 0.24),
      [0.144, 0.096, 0.144]);
  });

  it('crowns ring, colonies cluster, valves flank', () => {
    const canopy = (name) => distribution(
      { name, count: 'many', position: 'lateral' });
    assert.equal(canopy('leaves'), 'canopy');
    assert.equal(canopy('flowers'), 'canopy');
    assert.equal(canopy('fronds'), 'canopy');
    assert.equal(canopy('cones'), 'canopy');
    assert.equal(distribution(
      { name: 'fruiting bodies', count: 'many', position: 'apical' }),
      'ring');
    assert.equal(distribution(
      { name: 'branches', count: 'many', position: 'lateral' }), 'ring');
    assert.equal(distribution(
      { name: 'shell valves', count: 2, position: 'lateral' }), 'pair');
  });
});

describe('normalizeEntry (raw build-map entries)', () => {
  it('insect: 7 buildable parts, mouthparts skipped, wings flap', () => {
    const plan = normalizeEntry(INSECT_ENTRY);
    assert.deepEqual(plan.dropped, ['mouthparts']);
    assert.equal(plan.parts.length, 7);
    const byName = Object.fromEntries(plan.parts.map((p) => [p.name, p]));
    assert.equal(byName.legs.shape, 'cylinder');
    assert.equal(byName.legs.count, 6);
    assert.equal(byName.legs.dist, 'pair');
    assert.equal(byName.wings.kind, 'flap');
    assert.equal(byName.wings.shape, 'plane');
    assert.equal(byName['compound eyes'].count, 2);
    assert.deepEqual(byName.head.pos, [0.36, 0.05, 0]);
    assert.deepEqual(byName.abdomen.pos, [-0.32, 0, 0]);
  });

  it('bird: AVONET measurements parsed into numbers', () => {
    const plan = normalizeEntry(BIRD_ENTRY);
    assert.equal(plan.parts.length, 8);
    assert.equal(plan.measurements.mass_g, 146);
    assert.equal(plan.measurements.wing_mm, 141.7);
    assert.equal(plan.measurements.beak_culmen_mm, 34.5);
    assert.equal(plan.measurements.tail_mm, 149.6);
    assert.equal(plan.measurements.tarsus_mm, 45);
    const beak = plan.parts.find((p) => p.name === 'beak');
    assert.equal(beak.shape, 'cone');
    assert.deepEqual(beak.rot, [0, 0, -1.5708]); // tip forward
    const tail = plan.parts.find((p) => p.name === 'tail');
    assert.deepEqual(tail.rot, [0, 0, 1.5708]); // tip backward
  });

  it('fish: scales and lateral line skipped, fins are planes', () => {
    const plan = normalizeEntry(FISH_ENTRY);
    assert.deepEqual(plan.dropped.sort(), ['lateral line', 'scales']);
    assert.equal(plan.parts.length, 8);
    const dorsal = plan.parts.find((p) => p.name === 'dorsal fin');
    assert.deepEqual(dorsal.rot, [0, 0, 0]); // vertical, in the midline
    const pectoral = plan.parts.find((p) => p.name === 'pectoral fins');
    assert.deepEqual(pectoral.rot, [-1.5708, 0, 0]); // flat
    const caudal = plan.parts.find((p) => p.name === 'caudal fin');
    assert.deepEqual(caudal.rot, [0, 0, 0]);
  });

  it('plant: roots and seeds skipped, leaves form a crown', () => {
    const plan = normalizeEntry(PLANT_ENTRY);
    assert.deepEqual(plan.dropped.sort(), ['roots', 'seeds']);
    assert.equal(plan.parts.length, 4);
    const leaves = plan.parts.find((p) => p.name === 'leaves');
    assert.equal(leaves.count, 6); // "many" -> 6 for a canopy
    assert.equal(leaves.dist, 'canopy');
    assert.equal(leaves.shape, 'sphere');
    // Foliage is a flattened puff, not a flat blade.
    assert.deepEqual(leaves.size, [0.456, 0.171, 0.456]);
    const flowers = plan.parts.find((p) => p.name === 'flowers');
    assert.equal(flowers.dist, 'canopy');
    assert.equal(flowers.shape, 'sphere');
  });

  it('fungus: gills, mycelium and spores skipped', () => {
    const plan = normalizeEntry(FUNGUS_ENTRY);
    assert.deepEqual(plan.dropped.sort(), ['gills', 'mycelium', 'spores']);
    assert.equal(plan.parts.length, 2);
    assert.deepEqual(
      plan.parts.map((p) => p.name), ['cap', 'stipe']);
  });
});

describe('budget enforcement', () => {
  it('MAX_VISIBLE_PARTS is 9 (the CGI budget: mammal 8 + haunches)', () => {
    assert.equal(MAX_VISIBLE_PARTS, 9);
  });

  it('fish fits the 9 budget whole, nothing dropped', () => {
    const fish = normalizeEntry(FISH_ENTRY);
    const { parts, dropped } = enforceBudget(fish.parts);
    assert.equal(parts.length, fish.parts.length);
    assert.deepEqual(dropped, []);
    const names = parts.map((p) => p.name);
    for (const keep of ['body', 'head', 'caudal fin', 'dorsal fin', 'eyes']) {
      assert.ok(names.includes(keep), `expected ${keep} to survive`);
    }
  });

  it('flying bird keeps everything: wings cost two, total 9 meshes', () => {
    const bird = normalizeEntry(BIRD_ENTRY);
    // A flap part costs two meshes when it flies, so the 8-part
    // bird costs 9 meshes in flight — exactly the budget.
    const flying = enforceBudget(bird.parts, true);
    assert.equal(flying.parts.length, 8);
    assert.deepEqual(flying.dropped, []);
    const meshCost = flying.parts.reduce(
      (n, p) => n + (p.kind === 'flap' ? 2 : 1), 0);
    assert.equal(meshCost, 9);
    assert.ok(flying.parts.some((p) => p.name === 'beak'), 'beak must survive');
    assert.ok(flying.parts.some((p) => p.name === 'tail'), 'tail must survive');
    assert.ok(flying.parts.some((p) => p.name === 'wings'), 'wings must survive');
  });

  it('grounded bird keeps everything, 8 meshes', () => {
    const bird = normalizeEntry(BIRD_ENTRY);
    const grounded = enforceBudget(bird.parts, false);
    assert.equal(grounded.parts.length, 8);
    assert.deepEqual(grounded.dropped, []);
    assert.ok(grounded.parts.some((p) => p.name === 'legs'), 'legs must survive');
  });

  it('over-budget lists cut by priority, dropped recorded', () => {
    // A synthetic 11-part list: the two lowest-priority extras go.
    const parts = [
      { name: 'body', kind: 'single' }, { name: 'head', kind: 'single' },
      { name: 'forelegs', kind: 'limb' }, { name: 'hindlegs', kind: 'limb' },
      { name: 'tail', kind: 'single' }, { name: 'eyes', kind: 'repeat' },
      { name: 'ears', kind: 'repeat' }, { name: 'muzzle', kind: 'single' },
      { name: 'wings', kind: 'flap' }, { name: 'antennae', kind: 'repeat' },
      { name: 'horn', kind: 'single' },
    ];
    const { parts: kept, dropped } = enforceBudget(parts, false);
    assert.equal(kept.length, 9);
    assert.deepEqual(dropped.sort(), ['antennae', 'horn']);
    assert.ok(kept.some((p) => p.name === 'body'));
    assert.ok(kept.some((p) => p.name === 'muzzle'));
  });

  it('priority: body parts first, small extras last', () => {
    assert.ok(partPriority('body') < partPriority('head'));
    assert.ok(partPriority('head') < partPriority('legs'));
    assert.ok(partPriority('legs') < partPriority('wings'));
    assert.ok(partPriority('wings') < partPriority('antennae'));
    assert.equal(partPriority('unheard-of-part'), 5);
  });
});

describe('renderSizeFor', () => {
  it('clamps the way the old scene did', () => {
    assert.equal(renderSizeFor(0.01), 0.05);
    assert.equal(renderSizeFor(0.3), 0.3);
    assert.equal(renderSizeFor(100), 30);
    assert.equal(renderSizeFor(NaN), 1);
    assert.equal(renderSizeFor(undefined), 1);
  });
});

describe('fallback plans', () => {
  it('an unknown species falls back by kingdom', () => {
    const animal = normalizePlan({}, 'No Such Species', 0.5, 'Animalia');
    assert.equal(animal.level, 'fallback');
    assert.equal(animal.template, 'small_animal_generic');
    assert.ok(animal.parts.some((p) => p.name === 'body'));
    const plant = normalizePlan({}, 'No Such Plant', 2, 'Plantae');
    assert.equal(plant.template, 'plant_generic');
    assert.ok(plant.parts.some((p) => p.name === 'stem'));
    const fungus = normalizePlan({}, 'No Such Fungus', 0.2, 'Fungi');
    assert.equal(fungus.template, 'fungus_generic');
    assert.ok(fungus.parts.some((p) => p.name === 'cap'));
    assert.equal(animal.sizeM, 0.5);
    assert.equal(plant.sizeM, 2);
  });

  it('FALLBACK_PLANS are hand-written and numeric', () => {
    for (const [kingdom, fb] of Object.entries(FALLBACK_PLANS)) {
      assert.ok(fb.parts.length >= 2, kingdom);
      for (const p of fb.parts) {
        assert.equal(p.pos.length, 3);
        assert.equal(p.size.length, 3);
        assert.equal(p.rot.length, 3);
        assert.ok(p.size.every((v) => Number.isFinite(v)));
      }
    }
  });
});

describe('compiled creature-plans.json', () => {
  it('covers all 1,262 catalogue species', () => {
    assert.equal(PLANS.version, 2);
    assert.equal(PLANS.count, 1262);
    assert.equal(Object.keys(PLANS.plans).length, 1262);
    const catalogueNames = new Set(CATALOGUE.map((s) => s.name));
    for (const name of Object.keys(PLANS.plans)) {
      assert.ok(catalogueNames.has(name), `${name} not in catalogue`);
    }
    for (const s of CATALOGUE) {
      assert.ok(PLANS.plans[s.name], `${s.name} missing from plans`);
    }
  });

  it('every template id is one of the 100, every part numeric', () => {
    const templateIds = new Set(Object.keys(PLANS.templates));
    assert.equal(templateIds.size, 100);
    for (const [name, rec] of Object.entries(PLANS.plans)) {
      assert.ok(templateIds.has(rec.t), `${name}: unknown template ${rec.t}`);
      assert.ok(['class', 'order', 'phylum', 'kingdom', 'template', 'fallback']
        .includes(rec.l), `${name}: bad level ${rec.l}`);
      const tuples = rec.p || PLANS.templates[rec.t].parts;
      for (const t of tuples) {
        assert.equal(t.length, 14, `${name}: part tuple length`);
        assert.ok(t.slice(5).every((v) => Number.isFinite(v)),
          `${name}: non-numeric part values`);
        assert.ok(['sphere', 'cylinder', 'cone', 'plane'].includes(t[2]));
        assert.ok(['single', 'repeat', 'flap', 'limb'].includes(t[3]));
        assert.ok(['single', 'pair', 'ring', 'line', 'canopy'].includes(t[4]));
      }
    }
  });

  it('whales use the cetacean template at order level, surface skin', () => {
    for (const whale of ['Balaenoptera bonaerensis', 'Mesoplodon traversii']) {
      const rec = PLANS.plans[whale];
      assert.equal(rec.t, 'cetacean', whale);
      assert.equal(rec.l, 'order', whale);
      assert.equal(rec.s, 'skin', whale);
    }
    const parts = PLANS.templates.cetacean.parts.map((t) => t[0]);
    assert.ok(parts.includes('flippers') && parts.includes('fluke'));
    assert.ok(!parts.includes('forelegs') && !parts.includes('hindlegs'));
    assert.ok(!parts.includes('ears'));
  });

  it('surface families ride on the record for the sampled species', () => {
    assert.equal(PLANS.plans['Propithecus deckenii'].s, 'fur');
    assert.equal(PLANS.plans['Pterodroma deserta'].s, 'feather');
    assert.equal(PLANS.plans['Anabarilius brevianalis'].s, 'scale_fish');
    assert.equal(PLANS.plans['Balaenoptera bonaerensis'].s, 'skin');
    const withSurface = Object.values(PLANS.plans).filter((r) => r.s).length;
    assert.ok(withSurface >= 1200, `only ${withSurface} records carry a surface`);
  });

  it('all 7 measured birds carry AVONET numbers', () => {
    const measured = Object.entries(PLANS.plans).filter(([, r]) => r.m);
    assert.equal(measured.length, 7);
    for (const [name, rec] of measured) {
      assert.ok(rec.m.mass_g > 0, `${name}: no mass`);
      assert.ok(rec.m.wing_mm > 0, `${name}: no wing`);
    }
  });

  it('no species falls back to a generic', () => {
    const fallbacks = Object.entries(PLANS.plans)
      .filter(([, r]) => r.l === 'fallback');
    assert.equal(fallbacks.length, 0);
  });
});

describe('compiler / JS cross-check', () => {
  it('normalizeEntry(insect raw) equals the compiled plan for Acheta domesticus', () => {
    const fromJs = normalizeEntry(INSECT_ENTRY);
    const compiled = normalizePlan(PLANS, 'Acheta domesticus', 0.02, 'Animalia');
    assert.equal(compiled.template, 'insect');
    assert.equal(compiled.level, 'class');
    const toTuple = (p) => [
      p.name, p.count, p.shape, p.kind, p.dist,
      ...p.pos, ...p.size, ...p.rot,
    ];
    // normalizeEntry keeps 7 parts; the 9-budget keeps them all.
    assert.deepEqual(
      fromJs.parts.map(toTuple),
      PLANS.templates.insect.parts);
    assert.deepEqual(
      compiled.parts.map((p) => p.name),
      ['thorax', 'abdomen', 'head', 'legs', 'compound eyes', 'wings', 'antennae']);
    assert.deepEqual(compiled.dropped, []);
  });

  it('normalizeEntry(bird raw) matches the compiled bird plan', () => {
    const fromJs = normalizeEntry(BIRD_ENTRY);
    const compiled = planForSpecies(PLANS, {
      name: 'Cyanocorax cyanopogon', kingdom: 'Animalia', sizeM: 0.25,
    });
    assert.equal(compiled.template, 'bird');
    assert.deepEqual(compiled.measurements, fromJs.measurements);
    const toTuple = (p) => [
      p.name, p.count, p.shape, p.kind, p.dist,
      ...p.pos, ...p.size, ...p.rot,
    ];
    assert.deepEqual(fromJs.parts.map(toTuple), PLANS.templates.bird.parts);
  });
});

describe('surface families (mirrors the compiler)', () => {
  it('maps the sampled texture strings to families', () => {
    assert.equal(surfaceFamilyFor('fur', 'Mammalia'), 'fur');
    assert.equal(surfaceFamilyFor('feathers', 'Aves'), 'feather');
    assert.equal(surfaceFamilyFor('overlapping scales', 'Teleostei'), 'scale_fish');
    assert.equal(surfaceFamilyFor('overlapping scales', 'Reptilia'), 'scale_reptile');
    assert.equal(surfaceFamilyFor('rough dermal denticles', 'Holocephali'), 'scale_fish');
    assert.equal(surfaceFamilyFor('smooth mucus skin', 'Teleostei'), 'skin');
    assert.equal(surfaceFamilyFor('smooth skin', 'Mammalia'), 'skin');
    assert.equal(surfaceFamilyFor('chitinous exoskeleton', 'Insecta'), 'chitin');
    assert.equal(surfaceFamilyFor('bark', 'Magnoliopsida'), 'bark');
    assert.equal(surfaceFamilyFor('gelatinous lobes', 'Agaricomycetes'), 'slime');
    assert.equal(surfaceFamilyFor('tiny flask-shaped fruiting bodies', 'Sordariomycetes'), 'fungal');
    assert.equal(surfaceFamilyFor('soft body wall', 'Kinorhyncha'), 'skin');
    assert.equal(surfaceFamilyFor('porous spongy body', 'Demospongiae'), 'sponge');
    assert.equal(surfaceFamilyFor('calcified ossicles', 'Crinoidea'), 'shell');
  });

  it('whales read skin whatever the mammal plan says', () => {
    assert.equal(surfaceFamilyFor('fur', 'Mammalia', 'Cetacea'), 'skin');
  });

  it('unknown surfaces return null (kingdom default applies)', () => {
    assert.equal(surfaceFamilyFor('glassy silica lattice', 'Hexactinellida'), null);
    assert.equal(surfaceFamilyFor(null, 'Mammalia'), null);
    assert.equal(defaultSurfaceFor('Animalia'), 'skin');
    assert.equal(defaultSurfaceFor('Plantae'), 'bark');
    assert.equal(defaultSurfaceFor('Fungi'), 'fungal');
  });

  it('normalizeEntry carries the surface from textures[0]', () => {
    const withFur = {
      ...INSECT_ENTRY,
      textures: [{ surface: 'chitin', colour: null, pattern: null }],
    };
    assert.equal(normalizeEntry(withFur).surface, 'chitin');
    assert.equal(normalizeEntry(INSECT_ENTRY).surface, null);
  });

  it('normalizePlan passes the record surface through', () => {
    const whale = normalizePlan(PLANS, 'Balaenoptera bonaerensis', 8.75, 'Animalia');
    assert.equal(whale.surface, 'skin');
    assert.equal(whale.template, 'cetacean');
    const lemur = normalizePlan(PLANS, 'Propithecus deckenii', 0.98, 'Animalia');
    assert.equal(lemur.surface, 'fur');
    const bird = normalizePlan(PLANS, 'Pterodroma deserta', 0.95, 'Animalia');
    assert.equal(bird.surface, 'feather');
    const fish = normalizePlan(PLANS, 'Anabarilius brevianalis', 0.162, 'Animalia');
    assert.equal(fish.surface, 'scale_fish');
  });
});

describe('limb kind (mirrors the compiler)', () => {
  it('ventral walking legs are limbs, wings are flaps, fins repeat', () => {
    const fore = normalizePart({ name: 'forelegs', count: 2, position: 'ventral, paired', relative_size: 'medium' });
    assert.equal(fore.kind, 'limb');
    assert.equal(fore.shape, 'cylinder');
    const legs = normalizePart({ name: 'legs', count: 6, position: 'paired ventral', relative_size: 'medium' });
    assert.equal(legs.kind, 'limb');
    const wings = normalizePart({ name: 'wings', count: 2, position: 'lateral, paired', relative_size: 'large' });
    assert.equal(wings.kind, 'flap');
    const fin = normalizePart({ name: 'pectoral fins', count: 2, position: 'lateral, paired', relative_size: 'medium' });
    assert.equal(fin.kind, 'repeat');
    const arms = normalizePart({ name: 'arms', count: 2, position: 'ventral, paired', relative_size: 'medium' });
    assert.equal(arms.kind, 'repeat');
  });

  it('flippers and flukes are planes', () => {
    assert.equal(shapeForPart('flippers'), 'plane');
    assert.equal(shapeForPart('fluke'), 'plane');
    assert.equal(shapeForPart('dorsal fin'), 'plane');
  });

  it('flippers, fluke and haunches have budget priorities', () => {
    assert.equal(partPriority('flippers'), 2);
    assert.equal(partPriority('fluke'), 3);
    assert.equal(partPriority('haunches'), 2);
  });
});
