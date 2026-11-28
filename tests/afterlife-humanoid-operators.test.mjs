// tests/afterlife-humanoid-operators.test.mjs
// AFTERLIFE HUMANOID OPERATORS (Merlin, Nov 14 ~23:25: "Do the same
// thing we did for animals for humanoids please, garments, weapons
// handling, all of it."): the humanoid layer over the animal
// operators — seven agents in the Earth 4 pure-function shape,
// plus a garment agent and a weapons agent, for the drift kinds of
// all 25 afterlife realms. Garments are data-only (the renderer
// draws one shared CGI ShadeFigure per figure — no separate garment
// mesh exists); weapons are a verified-absent state (no drift figure
// and no guardian carries anything in any world3d.js).
//
// Run: node --test tests/afterlife-humanoid-operators.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { makeWorld as makeNetherRealm } from '../lib/nether-realm/world.js';
import { makeWorld as makeHelheim } from '../lib/helheim/world.js';
import { makeWorld as makeYomi } from '../lib/yomi/world.js';
import { makeWorld as makeHell } from '../lib/hell/world.js';
import { makeWorld as makeNaraka } from '../lib/naraka/world.js';
import { makeWorld as makeDiyu } from '../lib/diyu/world.js';
import { makeWorld as makeAnnwn } from '../lib/annwn/world.js';
import { makeWorld as makeKur } from '../lib/kur/world.js';
import { makeWorld as makeNav } from '../lib/nav/world.js';
import { makeWorld as makeOrun } from '../lib/orun/world.js';
import { makeWorld as makeDuat } from '../lib/duat/world.js';
import { makeWorld as makeMictlan } from '../lib/mictlan/world.js';
import { makeWorld as makeXibalba } from '../lib/xibalba/world.js';
import { makeWorld as makeTlalocan } from '../lib/tlalocan/world.js';
import { makeWorld as makeMayaSky } from '../lib/maya-sky/world.js';
import { makeWorld as makeVyraj } from '../lib/vyraj/world.js';
import { makeWorld as makeTiangong } from '../lib/tiangong/world.js';
import { makeWorld as makeHeaven } from '../lib/heaven/world.js';
import { makeWorld as makeSvarga } from '../lib/svarga/world.js';
import { makeWorld as makeTakamagahara } from '../lib/takamagahara/world.js';
import { makeWorld as makeTirNaNog } from '../lib/tir-na-nog/world.js';
import { makeWorld as makeElysium } from '../lib/elysium/world.js';
import { makeWorld as makeValhalla } from '../lib/valhalla/world.js';
import { makeWorld as makeAaru } from '../lib/aaru/world.js';
import { makeWorld as makeLandOfTheDead } from '../lib/land-of-the-dead/world.js';

import {
  REALM_KEYS,
  SPECIES,
  FOUNDING_MS,
  DAY_MS,
  MIN_LIVE_COPIES,
  FIGURE_MATERIALS,
  GARMENT_BY_KIND,
  figureMaterialFor,
  speciesFor,
  guardiansFor,
  humanoidBirthFor,
  humanoidGrowthFor,
  garmentWearFor,
  garmentFor,
  weaponsFor,
  humanoidDeathFor,
  humanoidFadeFor,
  humanoidDietFor,
  humanoidHabitsFor,
  humanoidTerritoryFor,
  humanoidLifeFor,
  enrichHumanoids,
  humanoidPopulationFor,
  humanoidLifeLineFor,
  areaAt,
} from '../lib/afterlife/humanoid-operators.js';
import {
  lifeFor,
  waterFor,
  growthScale,
  userAsPrey,
  userDeathOutcome,
} from '../lib/afterlife/operators.js';

const ALL = [
  ['nether-realm', 'shades', makeNetherRealm],
  ['helheim', 'shades', makeHelheim],
  ['yomi', 'shades', makeYomi],
  ['annwn', 'shades', makeAnnwn],
  ['duat', 'shades', makeDuat],
  ['mictlan', 'shades', makeMictlan],
  ['xibalba', 'shades', makeXibalba],
  ['hell', 'shades', makeHell],
  ['naraka', 'shades', makeNaraka],
  ['diyu', 'shades', makeDiyu],
  ['kur', 'shades', makeKur],
  ['nav', 'wisps', makeNav],
  ['orun', 'spirits', makeOrun],
  ['elysium', 'shades', makeElysium],
  ['valhalla', 'shades', makeValhalla],
  ['aaru', 'shades', makeAaru],
  ['heaven', 'blessed', makeHeaven],
  ['svarga', 'apsaras', makeSvarga],
  ['takamagahara', 'kami', makeTakamagahara],
  ['tir-na-nog', 'fae', makeTirNaNog],
  ['tlalocan', 'drifters', makeTlalocan],
  ['maya-sky', 'drifters', makeMayaSky],
  ['vyraj', 'drifters', makeVyraj],
  ['tiangong', 'drifters', makeTiangong],
  ['land-of-the-dead', 'shades', makeLandOfTheDead],
];

const NOW = Date.UTC(2026, 11, 14, 12); // fixed clock for determinism
const EXPECTED_KINDS = {
  'nether-realm': 'Shade', helheim: 'Shade', yomi: 'Shade', annwn: 'Shade',
  duat: 'Shade', mictlan: 'Shade', xibalba: 'Shade', hell: 'Shade',
  naraka: 'Shade', diyu: 'Shade', kur: 'Shade', nav: 'Wisp', orun: 'Spirit',
  elysium: 'Shade', valhalla: 'Shade', aaru: 'Shade', heaven: 'Blessed',
  svarga: 'Apsara', takamagahara: 'Kami', 'tir-na-nog': 'Fae',
  tlalocan: 'Drifter', 'maya-sky': 'Drifter', vyraj: 'Drifter', tiangong: 'Drifter',
  'land-of-the-dead': 'Shade',
};

// --- the roster ------------------------------------------------------------

describe('humanoid roster (enumerated from code)', () => {
  it('covers exactly the 25 afterlife realms, one drift kind each', () => {
    assert.equal(REALM_KEYS.length, 25);
    assert.deepEqual(ALL.map(([k]) => k).sort(), [...REALM_KEYS].sort());
    for (const [key, varName] of ALL) {
      const rec = speciesFor(key);
      assert.ok(rec, key);
      assert.equal(rec.kind, EXPECTED_KINDS[key], key);
      assert.equal(rec.varName, varName, key);
      assert.equal(rec.diet, 'none', `${key}: the dead do not eat`);
      assert.ok([90, 120, 180, 365].includes(rec.sojournDays), `${key}: sojourn ${rec.sojournDays}`);
      assert.equal(rec.fadeDays, 7, `${key}: 7-day fade`);
      assert.equal(rec.areas.length, 3, `${key}: three region discs`);
    }
  });

  it('excludes the guardians and the set dressing — no humanoid operators for them', () => {
    // Guardians are single eternal beings, not humanoid populations.
    assert.deepEqual(guardiansFor('nether-realm').map((g) => g.id), ['cerberus']);
    assert.deepEqual(guardiansFor('duat').map((g) => g.id), ['apep']);
    assert.deepEqual(guardiansFor('mictlan').map((g) => g.id), ['faithful-dog']);
    for (const [key] of ALL) {
      if (!['nether-realm', 'duat', 'mictlan'].includes(key)) {
        assert.deepEqual(guardiansFor(key), [], `${key}: no guardian`);
      }
    }
    // Einherjar (Valhalla) and Hounds (Annwn) are region names and
    // labels only — no meshes, no spawner, no operators. The scene
    // files must not gain a humanoid for them here.
    for (const realm of ['valhalla', 'annwn']) {
      const src = readFileSync(`app/${realm}/world3d.js`, 'utf8');
      assert.ok(!/einherjarMesh|houndMesh|Einherjar\(|Hound\(/.test(src), `${realm}: no Einherjar/Hound mesh`);
    }
    const humanoidSrc = readFileSync('lib/afterlife/humanoid-operators.js', 'utf8');
    assert.ok(!/einherjar/i.test(humanoidSrc) || /EXCLUDED[\s\S]*Einherjar/.test(humanoidSrc), 'Einherjar only in the exclusion note');
  });
});

// --- the figure, as rendered ----------------------------------------------
// CGI character swap (Nov 28, 2026): every drift figure is the shared
// CGI ShadeFigure (components/afterlife/ShadeFigure) — the old single
// translucent cone (coneGeometry [0.7, 2.4, 8]) is gone from all 25
// realms. The figure's colour/opacity still come from
// FIGURE_MATERIALS, disc by disc, in areas order — this block
// re-reads every world3d.js and fails if the renderer drifts from
// the table. Hell also carries one GuidedShade (a fourth ShadeFigure,
// size 1.07, brighter) — asserted separately; it is NOT a drift figure.

describe('figure rendering (verified against world3d.js)', () => {
  it('every drift figure is the shared CGI ShadeFigure — no drift cone, no humanoid mesh', () => {
    for (const [key] of ALL) {
      const src = readFileSync(`app/${key}/world3d.js`, 'utf8');
      assert.match(src, /import ShadeFigure from '@\/components\/afterlife\/ShadeFigure';/, `${key}: imports the shared ShadeFigure`);
      assert.ok(!src.includes('coneGeometry args={[0.7, 2.4, 8]}'), `${key}: no drift cone left`);
      // One ShadeFigure per disc (3); Hell adds the GuidedShade (4th).
      const figures = [...src.matchAll(/<ShadeFigure/g)];
      assert.equal(figures.length, key === 'hell' ? 4 : 3, `${key}: ${key === 'hell' ? '4' : '3'} ShadeFigure usages, got ${figures.length}`);
      // No limbs on any figure anywhere (capsules), and no weapon mesh.
      assert.ok(!src.includes('capsuleGeometry'), `${key}: no limbs`);
      // The weapon scan covers code, not prose comments: a comment can
      // name a boat's bow (Duat's barque: "hull + bow + stern boxes")
      // without any weapon existing in the scene.
      const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const word of ['sword', 'spear', 'bow', 'arrow', 'dagger', 'staff', 'blade', 'weapon']) {
        assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(code), `${key}: no ${word} in the scene`);
      }
    }
  });

  it('FIGURE_MATERIALS matches the renderer’s ShadeFigure props, disc by disc', () => {
    for (const [key] of ALL) {
      const src = readFileSync(`app/${key}/world3d.js`, 'utf8');
      const found = [];
      for (const m of src.matchAll(/<ShadeFigure[\s\S]*?\/>/g)) {
        const tag = m[0];
        const color = tag.match(/color="([^"]+)"/);
        const opacity = tag.match(/opacity=\{([\d.]+)\}/);
        assert.ok(color && opacity, `${key}: ShadeFigure carries a literal color + opacity`);
        found.push({ color: color[1], opacity: Number(opacity[1]) });
      }
      // The first three ShadeFigures in file order are the three
      // discs, in areas order (West / first, East / second, North /
      // third) — exactly as the old drift cones were.
      assert.deepEqual(found.slice(0, 3), FIGURE_MATERIALS[key], `${key}: garment table matches the renderer`);
      assert.equal(figureMaterialFor(key, 0).color, found[0].color);
      assert.equal(figureMaterialFor(key, 2).opacity, found[2].opacity);
      assert.equal(figureMaterialFor('no-such-realm', 0), null);
    }
  });

  it('Hell’s GuidedShade stays distinct from the drift census', () => {
    const src = readFileSync('app/hell/world3d.js', 'utf8');
    const figures = [...src.matchAll(/<ShadeFigure[\s\S]*?\/>/g)].map((m) => m[0]);
    assert.equal(figures.length, 4, 'hell: 3 drift + 1 guided');
    const guided = figures[3];
    assert.match(guided, /size=\{1\.07\}/, 'guided: larger than a drift figure');
    assert.match(guided, /color="#f2f2fa"/, 'guided: brighter colour');
    assert.match(guided, /opacity=\{0\.65\}/, 'guided: more solid');
    assert.ok(!figures.slice(0, 3).some((f) => /size=/.test(f)), 'drift figures carry no size override');
  });
});
// --- garment agent ----------------------------------------------------------

describe('garment agent (data-only — the cone is the garment)', () => {
  it('every kind has a garment name, and every realm’s garment is data-only', () => {
    for (const [key] of ALL) {
      const rec = speciesFor(key);
      assert.ok(GARMENT_BY_KIND[rec.kind], `${key}: garment for ${rec.kind}`);
      const g = garmentFor(key, -160, -70, 0);
      assert.equal(g.kind, rec.kind);
      assert.equal(g.name, GARMENT_BY_KIND[rec.kind]);
      assert.equal(g.dataOnly, true, `${key}: garment is data-only, never a rendered system`);
      assert.match(g.renderedAs, /single translucent cone/);
      assert.equal(g.wear, 'fresh');
      assert.equal(g.color, FIGURE_MATERIALS[key][0].color, `${key}: garment colour is the cone’s colour`);
      assert.equal(g.opacity, FIGURE_MATERIALS[key][0].opacity);
    }
  });

  it('garment colour follows the disc the soul stands in', () => {
    // Hades: Asphodel pale, Elysium/Tartarus dark — the three discs differ.
    const pale = garmentFor('nether-realm', -160, -70, 10);
    const dark = garmentFor('nether-realm', 160, -70, 10);
    assert.equal(pale.color, '#e8e8ee');
    assert.equal(dark.color, '#2a2a33');
    assert.equal(pale.area, 'asphodel');
    assert.equal(dark.area, 'elysium');
    assert.equal(pale.discIndex, 0);
    assert.equal(dark.discIndex, 1);
    // Duat's third disc returns to pale — the table is per-disc, not per-realm.
    assert.equal(garmentFor('duat', 0, -230, 10).color, '#e8e8ee');
    assert.equal(garmentFor('duat', 0, -230, 10).area, 'twelfth-gate');
    assert.equal(garmentFor('no-such-realm', 0, 0, 0), null);
  });

  it('garment wear follows the sojourn: fresh -> worn -> threadbare, fading while fading', () => {
    assert.equal(garmentWearFor(0), 'fresh');
    assert.equal(garmentWearFor(0.32), 'fresh');
    assert.equal(garmentWearFor(0.5), 'worn');
    assert.equal(garmentWearFor(0.9), 'threadbare');
    const rec = speciesFor('nether-realm'); // 90-day sojourn
    assert.equal(garmentFor('nether-realm', -160, -70, 10).wear, 'fresh');
    assert.equal(garmentFor('nether-realm', -160, -70, 50).wear, 'worn');
    assert.equal(garmentFor('nether-realm', -160, -70, 85).wear, 'threadbare');
    assert.equal(garmentFor('nether-realm', -160, -70, 90, 'fading').wear, 'fading');
    assert.equal(rec.sojournDays, 90);
  });

  it('guardians wear no garment — their mesh is their own body', () => {
    const cerberus = humanoidLifeFor('nether-realm', 'Cerberus', 'cerberus', NOW);
    assert.equal(cerberus.garment.name, null);
    assert.match(cerberus.garment.renderedAs, /guardian mesh/);
    assert.equal(cerberus.garment.dataOnly, true);
  });
});

// --- weapons agent ----------------------------------------------------------

describe('weapons agent (verified absent — the dead do not fight)', () => {
  it('no drift kind in any realm carries a weapon', () => {
    for (const [key] of ALL) {
      const rec = speciesFor(key);
      const w = weaponsFor(key, rec.kind);
      assert.equal(w.carries, 'none', `${key}: ${rec.kind} carries nothing`);
      assert.equal(w.weapon, null);
      assert.equal(w.stance, null);
      assert.equal(w.condition, null);
      assert.equal(w.applies, false);
      assert.match(w.reason, /do not fight/);
    }
  });

  it('no guardian carries a weapon either', () => {
    for (const [realm, id] of [['nether-realm', 'cerberus'], ['duat', 'apep'], ['mictlan', 'faithful-dog']]) {
      const w = weaponsFor(realm, id);
      assert.equal(w.carries, 'none', `${realm}/${id}`);
      assert.equal(w.guardian, true);
      assert.match(w.reason, /no weapon mesh on the guardian/);
    }
  });

  it('Valhalla’s gold shields are hall-roof dressing, not carried arms', () => {
    const w = weaponsFor('valhalla', 'Shade');
    assert.equal(w.carries, 'none');
    assert.equal(w.setDressing, 'gold shields on the hall roof — not carried');
    const src = readFileSync('app/valhalla/world3d.js', 'utf8');
    assert.match(src, /shield roof: gold shields along the ridge/);
    assert.match(src, /position=\{\[s\.x, 16\.5, 0\]\}/); // on the ridge, y=16.5 — no Shade reaches it
  });
});

// --- the seven agents -------------------------------------------------------

describe('seven agents (Earth 4 shape, pure functions of the clock)', () => {
  it('birth: the dead arrive, they do not breed — fresh garment on arrival', () => {
    for (const [key] of ALL) {
      const b = humanoidBirthFor(speciesFor(key));
      assert.equal(b.breeding, false, `${key}: no breeding`);
      assert.equal(b.offspring, 0);
      assert.equal(b.arrivalsPerCycle, 1);
      assert.equal(b.garmentAtArrival.wear, 'fresh');
      assert.equal(b.garmentAtArrival.name, GARMENT_BY_KIND[speciesFor(key).kind]);
    }
  });

  it('growth: souls arrive full-formed; the sojourn is Newly arrived -> Wandering -> Old', () => {
    const rec = speciesFor('heaven'); // 365-day sojourn
    assert.equal(humanoidGrowthFor(rec, 0).stageName, 'Newly arrived');
    assert.equal(humanoidGrowthFor(rec, 200).stageName, 'Wandering');
    assert.equal(humanoidGrowthFor(rec, 350).stageName, 'Old');
    assert.equal(humanoidGrowthFor(rec, 200).sizeM, 2.4, 'full-formed from arrival');
  });

  it('diet: none — the dead never hunger and never hunt', () => {
    for (const [key] of ALL) {
      const d = humanoidDietFor(speciesFor(key), `${key}|a0`, NOW, []);
      assert.equal(d.diet, 'none', `${key}`);
      assert.equal(d.feedingMode, 'does not feed');
      assert.equal(d.hungry, false, `${key}: never hungry`);
      assert.equal(d.preyCount, 0);
    }
  });

  it('habits: drifting by day, resting by night, seeking water on the 6-hour river cycle', () => {
    const rec = speciesFor('nether-realm');
    // Local-time instants (not UTC): the agent reads the device-local
    // hour, so noon UTC is 06:00 here and 02:00 UTC is 20:00 here —
    // neither is day/night in this timezone. Local noon is day and
    // local 02:00 is night in every timezone.
    const day = humanoidHabitsFor(rec, 'nether-realm|a0', -160, -70, new Date(2026, 11, 14, 12));
    assert.ok(['drifting', 'seeking water'].includes(day.activity), day.activity);
    const night = humanoidHabitsFor(rec, 'nether-realm|a0', -160, -70, new Date(2026, 11, 14, 2));
    // At 02:00 the dead rest — unless the seeded water cycle calls them to the bank.
    assert.ok(['resting', 'seeking water'].includes(night.activity), night.activity);
    // The water cycle repeats every 6 hours, seeded per soul.
    const w1 = waterFor(rec, 'nether-realm|a0', -160, -70, NOW);
    const w2 = waterFor(rec, 'nether-realm|a0', -160, -70, NOW + 6 * 3600000);
    assert.equal(w1.seeking, w2.seeking, '6-hour river-bank cycle');
    assert.equal(w1.drinks, false, 'the dead gather at the bank — they do not drink');
    assert.equal(w1.riverName, 'River Styx');
    // Annwn has mist, not water: the branch does not apply.
    const annwn = waterFor(speciesFor('annwn'), 'annwn|a0', -160, -70, NOW);
    assert.equal(annwn.applies, false);
    assert.match(annwn.reason, /mist/);
  });

  it('territory: user-hunt and corpse-fight are off in all 25 realms', () => {
    for (const [key] of ALL) {
      assert.equal(userAsPrey(key), false, `${key}: no user-as-prey mechanic`);
      assert.equal(userDeathOutcome(key), false, `${key}: no user-death outcome`);
      const t = humanoidTerritoryFor(key, { id: 'a0', diet: 'none', x: 0, z: 0 }, [], true, true);
      assert.equal(t.huntsUser, false);
      assert.equal(t.fightsOverCorpse, false);
      assert.equal(t.userHuntApplies, false);
      assert.equal(t.corpseFightApplies, false);
    }
    // Even a carnivore guardian, user near AND dead: still off.
    const t = humanoidTerritoryFor('nether-realm', { id: 'cerberus', diet: 'carnivore', x: 0, z: 62 }, [], true, true);
    assert.equal(t.huntsUser, false);
    assert.equal(t.fightsOverCorpse, false);
    assert.equal(t.fightToDeath, false, 'no rival carnivore ever in range');
  });

  it('death: sojourn-end only — the soul passes on, then fades Fading -> Wisp -> Gone', () => {
    const rec = speciesFor('nether-realm');
    const d = humanoidDeathFor(rec, 'nether-realm|a0', FOUNDING_MS, false);
    assert.equal(d.cause, 'sojourn ended — passed on');
    assert.equal(d.deathMs, FOUNDING_MS + 90 * DAY_MS);
    assert.equal(humanoidFadeFor(rec, 0).stageName, 'Fading');
    assert.equal(humanoidFadeFor(rec, 0.5).stageName, 'Wisp');
    assert.equal(humanoidFadeFor(rec, 0.99).stageName, 'Gone');
  });
});

// --- conductor ---------------------------------------------------------------

describe('conductor: humanoidLifeFor + life line', () => {
  it('is pure: the same (realm, cell, clock) always returns the same life', () => {
    const a = humanoidLifeFor('heaven', 'Blessed', 'a3', NOW, { x: -160, z: -70 });
    const b = humanoidLifeFor('heaven', 'Blessed', 'a3', NOW, { x: -160, z: -70 });
    assert.deepEqual(a, b);
    assert.ok(a.garment, 'garment attached');
    assert.ok(a.weapon, 'weapon attached');
    assert.equal(a.weapon.carries, 'none');
    assert.equal(a.garment.dataOnly, true);
    assert.equal(a.diet, 'none');
    assert.equal(a.realm, 'heaven');
    assert.equal(humanoidLifeFor('no-such-realm', 'Shade', 'a0', NOW), null);
  });

  it('the cell never stands empty: after sojourn + fade a new soul arrives', () => {
    for (const [key, varName, makeWorld] of ALL) {
      const rec = speciesFor(key);
      const cells = makeWorld(1337)[varName];
      const far = FOUNDING_MS + (rec.sojournDays + rec.fadeDays + 30) * DAY_MS;
      for (const c of cells) {
        const life = humanoidLifeFor(key, rec.kind, c.id, far, { x: c.x, z: c.z });
        assert.ok(['alive', 'fading'].includes(life.state), `${key}/${c.id}: ${life.state}`);
        if (life.state === 'alive') assert.ok(life.generation >= 1, `${key}/${c.id}: generation ${life.generation}`);
      }
    }
  });

  it('life line: stage · activity · garment (wear) · unarmed — Earth 4 shape', () => {
    for (const [key, varName, makeWorld] of ALL) {
      const rec = speciesFor(key);
      const cells = makeWorld(1337)[varName];
      let alive = null;
      let fading = null;
      for (const c of cells) {
        const l = humanoidLifeFor(key, rec.kind, c.id, NOW, { x: c.x, z: c.z });
        if (!alive && l.state === 'alive') alive = l;
        if (!fading && l.state === 'fading') fading = l;
      }
      assert.ok(alive, `${key}: some cell alive at the fixed clock`);
      const line = humanoidLifeLineFor(alive);
      assert.match(line, new RegExp(`^${rec.kind} · (Newly arrived|Wandering|Old) · (drifting|resting|seeking water) · ${GARMENT_BY_KIND[rec.kind]} \\((fresh|worn|threadbare)\\) · unarmed$`), `${key}: ${line}`);
      if (fading) {
        assert.match(humanoidLifeLineFor(fading), new RegExp(`^Remains — (Fading|Wisp|Gone) · ${GARMENT_BY_KIND[rec.kind]} \\(fading\\)$`));
      }
    }
    assert.equal(humanoidLifeLineFor(null), '');
    assert.equal(humanoidLifeLineFor(lifeFor('nether-realm', 'Cerberus', 'cerberus', NOW)), 'Cerberus · guarding — The Gates · unarmed');
    const apep = humanoidLifeFor('duat', 'Apep', 'apep', NOW);
    assert.equal(humanoidLifeLineFor(apep), 'Apep · lurking — The Dark Waters · unarmed');
    // A live soul renders full-formed (scale 1); a fading one shrinks away.
    const hadesCells = makeNetherRealm(1337).shades;
    const hadesAlive = hadesCells.map((c) => humanoidLifeFor('nether-realm', 'Shade', c.id, NOW, { x: c.x, z: c.z })).find((l) => l.state === 'alive');
    assert.ok(hadesAlive, 'some Hades cell alive at the fixed clock');
    assert.equal(growthScale(hadesAlive), 1);
  });

  it('enrichHumanoids adds garment + weapon life to every spawned creature', () => {
    for (const [key, varName, makeWorld] of ALL) {
      const enriched = enrichHumanoids(makeWorld(1337)[varName], key, NOW);
      assert.equal(enriched.length, 18, `${key}: 18 copies`);
      for (const c of enriched) {
        assert.ok(c.life, `${key}/${c.id}`);
        assert.ok(['alive', 'fading'].includes(c.life.state));
        assert.equal(c.life.garment.dataOnly, true);
        assert.equal(c.life.weapon.carries, 'none');
      }
    }
    assert.deepEqual(enrichHumanoids([], 'nether-realm', NOW), []);
    assert.equal(enrichHumanoids(null, 'nether-realm', NOW), null);
  });
});

// --- population ---------------------------------------------------------------

describe('population (already met by the third-disc fix — audited, not changed)', () => {
  it('every realm holds 18 copies, ≥12 live, across all 3 areas, at the fixed clock', () => {
    for (const [key, varName, makeWorld] of ALL) {
      const pop = humanoidPopulationFor(key, makeWorld(1337)[varName], NOW);
      assert.equal(pop.total, 18, `${key}: 18 total`);
      assert.ok(pop.alive >= MIN_LIVE_COPIES, `${key}: ${pop.alive} live < ${MIN_LIVE_COPIES}`);
      assert.equal(pop.alive + pop.fading, 18, `${key}: every cell holds exactly one generation`);
      assert.equal(pop.areas.length, 3, `${key}: spread across 3 areas, got ${pop.areas}`);
      assert.equal(pop.meetsRule, true, `${key}: ${JSON.stringify(pop)}`);
      assert.equal(pop.garment.name, GARMENT_BY_KIND[speciesFor(key).kind]);
      assert.equal(pop.weapon.carries, 'none');
    }
  });

  it('the rule still holds a year later — turnover never empties a realm', () => {
    const later = NOW + 365 * DAY_MS;
    for (const [key, varName, makeWorld] of ALL) {
      const pop = humanoidPopulationFor(key, makeWorld(1337)[varName], later);
      assert.equal(pop.alive + pop.fading, 18, `${key}: ${pop.alive} + ${pop.fading}`);
      assert.equal(pop.meetsRule, true, `${key}: ${JSON.stringify(pop)}`);
    }
  });

  it('areaAt puts every spawner cell inside one of the three discs', () => {
    for (const [key, varName, makeWorld] of ALL) {
      for (const c of makeWorld(1337)[varName]) {
        assert.notEqual(areaAt(key, c.x, c.z), 'wilds', `${key}/${c.id}: (${c.x}, ${c.z})`);
      }
    }
  });
});

// --- what was deliberately NOT built ------------------------------------------

describe('what was deliberately NOT built stays unbuilt', () => {
  it('no invented weapons, meals, hunts or second species in the humanoid module', () => {
    const src = readFileSync('lib/afterlife/humanoid-operators.js', 'utf8');
    for (const word of ['sword', 'spear', 'bow', 'arrow', 'dagger', 'axe', 'feast', 'meal', 'prey', 'hunt']) {
      // Allowed only inside the verified-absent reasons / comments.
      const hits = [...src.matchAll(new RegExp(`\\b${word}\\b`, 'gi'))];
      for (const h of hits) {
        const line = src.slice(Math.max(0, h.index - 200), h.index + 200);
        assert.ok(/no [\s\S]{0,60}mesh|do not fight|never|not |absent|VERIFIED|weapon mesh|OFF in all 25|false everywhere|gated/i.test(line), `${word} appears outside a negation: …${line.trim().slice(0, 120)}…`);
      }
    }
    assert.ok(!/einherjarMesh|houndMesh/.test(src), 'no invented Einherjar/Hound meshes');
  });
});
