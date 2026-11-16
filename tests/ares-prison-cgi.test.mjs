// tests/ares-prison-cgi.test.mjs — the ARES Prison CGI makeover (Merlin, 2026-11-15).
// Run: node --test tests/ares-prison-cgi.test.mjs (from the repo root).
// No browser, no network — asserts on lib/ares/prison-cgi.js pure logic
// (procedural textures, mood, flicker, dust, Warden's dais) and
// source-level checks that the makeover dressed the LOOK only: the
// mechanics still wired (cells hold prisoners, the Warden grows the
// hall, one-way visibility stays one-way, the exit button stays in
// all 4 states), no new real lights, no release control, and the
// cell front frames (bars + rails — the concurrent silver-wraps
// worker's surfaces) untouched.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import * as THREE from 'three';
import {
  PRISON_CGI_KINDS,
  PRISON_CGI_TEXTURE_SIZE,
  PRISON_CGI_MOOD,
  prisonMaps,
  prisonMaterial,
  prisonFlicker,
  makePrisonDust,
  wardenDaisFor,
  prisonCgiTextureStats,
} from '../lib/ares/prison-cgi.js';
import {
  PRISON_BLUE,
  PRISON_HALL,
  PRISON_CAPACITY,
  PRISON_LIGHT_BUDGET,
  PRISON_ONE_WAY,
} from '../lib/ares/prison.js';
import {
  PRISON_EXPANSION_LIGHTS_PER_LEVEL,
  prisonLightBudgetForLevels,
} from '../lib/ares/prison-expansion.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const world3d = src('../app/ares/prison/world3d.jsx');
const prisonPage = src('../app/ares/prison/page.jsx');
const cgiComponent = src('../app/ares/prison/cgi.jsx');
const cgiLib = src('../lib/ares/prison-cgi.js');

describe('prison CGI textures (house idiom: seeded DataTextures)', () => {
  it('has the four prison kinds with real material styles', () => {
    for (const kind of ['prisonConcrete', 'prisonSteel', 'prisonDeck', 'prisonCellBack']) {
      const style = PRISON_CGI_KINDS[kind];
      assert.ok(style, `${kind} has a style`);
      assert.ok(style.roughness > 0 && style.roughness <= 1, `${kind} roughness in range`);
      assert.ok(style.metalness >= 0 && style.metalness <= 1, `${kind} metalness in range`);
      assert.ok(style.bumpScale > 0, `${kind} bumpScale positive`);
    }
    // Cold and worn, not glossy plastic: concrete is rough, steel is metal.
    assert.ok(PRISON_CGI_KINDS.prisonConcrete.roughness >= 0.9);
    assert.ok(PRISON_CGI_KINDS.prisonSteel.metalness >= 0.5);
  });

  it('paints 256x256 colour + bump maps, deterministic per kind+seed', () => {
    for (const kind of Object.keys(PRISON_CGI_KINDS)) {
      const a = prisonMaps(kind, 'prison-hall');
      const b = prisonMaps(kind, 'prison-hall');
      assert.equal(a, b, `${kind} cached per kind+seed`);
      assert.equal(a.map.image.width, PRISON_CGI_TEXTURE_SIZE);
      assert.equal(a.map.image.height, PRISON_CGI_TEXTURE_SIZE);
      assert.equal(a.bumpMap.image.width, PRISON_CGI_TEXTURE_SIZE);
      assert.ok(a.map.image.data.length > 0, `${kind} colour data present`);
      assert.ok(a.bumpMap.image.data.length > 0, `${kind} bump data present`);
      // The maps carry real variation, not a flat fill.
      const bytes = new Set(a.map.image.data.slice(0, 4096));
      assert.ok(bytes.size > 20, `${kind} colour map varies`);
      const bumpBytes = new Set(a.bumpMap.image.data.slice(0, 4096));
      assert.ok(bumpBytes.size > 10, `${kind} bump map varies`);
    }
  });

  it('a different seed paints a different hall', () => {
    const a = prisonMaps('prisonConcrete', 'seed-a').map.image.data;
    const b = prisonMaps('prisonConcrete', 'seed-b').map.image.data;
    assert.notDeepEqual(Array.from(a.slice(0, 256)), Array.from(b.slice(0, 256)));
  });

  it('unknown kinds fall back to prisonConcrete, never throw', () => {
    const m = prisonMaps('not-a-kind', 'x');
    const base = prisonMaps('prisonConcrete', 'x');
    assert.equal(m.map.image.data.length, base.map.image.data.length);
    assert.deepEqual(Array.from(m.map.image.data.slice(0, 64)), Array.from(base.map.image.data.slice(0, 64)));
    const mat = prisonMaterial('not-a-kind', 'x');
    assert.ok(mat instanceof THREE.MeshStandardMaterial);
  });

  it('materials tile per surface without moving other surfaces', () => {
    const floor = prisonMaterial('prisonDeck', 'prison-hall-floor', '#ffffff', { repeatX: 12, repeatY: 4 });
    const cell = prisonMaterial('prisonDeck', 'prison-cell-floor');
    assert.ok(floor instanceof THREE.MeshStandardMaterial);
    assert.equal(floor.map.repeat.x, 12);
    assert.equal(floor.map.repeat.y, 4);
    assert.equal(cell.map.repeat.x, 1);
    assert.equal(cell.map.repeat.y, 1);
    assert.equal(floor.bumpMap.repeat.x, 12);
    assert.ok(floor.map instanceof THREE.DataTexture);
    assert.ok(floor.bumpMap instanceof THREE.DataTexture);
    // Same inputs give the same shared material.
    assert.equal(floor, prisonMaterial('prisonDeck', 'prison-hall-floor', '#ffffff', { repeatX: 12, repeatY: 4 }));
  });

  it('texture stats count what was built', () => {
    const stats = prisonCgiTextureStats();
    assert.ok(stats.textures >= 4);
    assert.ok(stats.materials >= 1);
    assert.ok(stats.bytes > 0);
  });
});

describe('prison CGI mood: emissive only, flicker on the real clock', () => {
  it('mood blue is the prison blue', () => {
    assert.equal(PRISON_CGI_MOOD.blue, PRISON_BLUE.light);
    assert.equal(PRISON_CGI_MOOD.blueCss, PRISON_BLUE.flame);
    assert.ok(PRISON_CGI_MOOD.fixtureEmissiveIntensity > 1);
    assert.ok(PRISON_CGI_MOOD.sigilEmissiveIntensity > PRISON_CGI_MOOD.fixtureEmissiveIntensity);
  });

  it('prisonFlicker is deterministic, in range, and mostly full brightness', () => {
    const now = Date.UTC(2026, 11, 15, 12, 0, 0);
    assert.equal(prisonFlicker(now, 0), prisonFlicker(now, 0));
    assert.equal(prisonFlicker(now, 0), prisonFlicker(now, 0));
    let full = 0;
    let total = 0;
    for (let i = 0; i < 2000; i += 1) {
      const v = prisonFlicker(now + i * 120, i % 8);
      assert.ok(v >= PRISON_CGI_MOOD.flickerFloor && v <= 1, `flicker ${v} in range`);
      total += 1;
      if (v === 1) full += 1;
    }
    // ~3% of slices dip: the hall stutters, never blacks out.
    assert.ok(full / total > 0.9, `${full}/${total} slices at full brightness`);
    assert.ok(full / total < 1, 'some slices do dip');
  });

  it('fixtures never flicker in lockstep', () => {
    const now = Date.UTC(2026, 11, 15, 12, 0, 0);
    const seen = new Set();
    for (let i = 0; i < 500; i += 1) {
      const row = [0, 1, 2, 3].map((f) => prisonFlicker(now + i * 120, f)).join(',');
      seen.add(row);
    }
    assert.ok(seen.size > 1, 'fixture rows differ across time');
  });
});

describe("the Warden's dais", () => {
  it('stands at the far end, outside the walker clamp', () => {
    const dais = wardenDaisFor(PRISON_HALL);
    assert.equal(dais.clearOfClampM, 0.15);
    assert.ok(dais.frontX > PRISON_HALL.walkwayEndM, 'front face past the clamp');
    assert.ok(dais.centreX + dais.depthM / 2 <= PRISON_HALL.lengthM / 2, 'inside the end wall');
    assert.ok(dais.widthM <= PRISON_HALL.widthM, 'fits the hall width');
    assert.ok(dais.platformHeightM > 0 && dais.deskHeightM > dais.platformHeightM);
  });

  it('does not move when the Warden grows the hall', () => {
    const base = wardenDaisFor(PRISON_HALL);
    const grown = wardenDaisFor({ ...PRISON_HALL, heightM: 13.7 });
    assert.equal(grown.frontX, base.frontX);
    assert.equal(grown.centreX, base.centreX);
  });
});

describe('prison cold dust', () => {
  it('is one seeded Points field over the walkway', () => {
    const dust = makePrisonDust();
    assert.ok(dust instanceof THREE.Points);
    assert.ok(dust.userData.isDustField);
    assert.equal(dust.geometry.getAttribute('position').count, 160);
    assert.equal(dust.geometry.userData.dustCount, 160);
  });
});

describe('CGI wired into the scene (source-level)', () => {
  it('world3d imports the CGI kit and renders the dressing', () => {
    assert.ok(world3d.includes("from '@/lib/ares/prison-cgi'"), 'imports prison-cgi');
    assert.ok(world3d.includes("from './cgi'"), 'imports the dressing component');
    assert.ok(world3d.includes('<PrisonCgiDressing'), 'renders the dressing');
    assert.ok(world3d.includes('hall={hall}'), 'dressing gets the grown hall');
    assert.ok(world3d.includes('lightPositions={lightPositions}'), 'dressing gets the grown lights');
  });

  it('shell and cells wear CGI materials, frames do not', () => {
    for (const key of ['shellMats.floor', 'shellMats.ceiling', 'shellMats.endWall', 'shellMats.sideWall', 'shellMats.separator']) {
      assert.ok(world3d.includes(`material={${key}}`), `${key} applied`);
    }
    assert.ok(world3d.includes('floorMat={shellMats.cellFloor}'), 'cells share the deck floor mat');
    assert.ok(world3d.includes('backMat={shellMats.cellBack}'), 'cells share the stained back mat');
    // No flat colour survives on the dressed surfaces.
    assert.ok(!world3d.includes('color="#0a0f1a"'), 'flat floor colour gone');
    assert.ok(!world3d.includes('color="#070b14"'), 'flat ceiling colour gone');
    assert.ok(!world3d.includes('color="#0d1526"'), 'flat wall colour gone');
    assert.ok(!world3d.includes('color="#0b1220"'), 'flat slab colour gone');
  });

  it('the dressing component adds fixtures, dais and dust — no real lights', () => {
    assert.ok(cgiComponent.includes('PrisonCgiDressing'));
    assert.ok(cgiComponent.includes('prisonFlicker'), 'fixtures flicker');
    assert.ok(cgiComponent.includes('wardenDaisFor'), 'dais from the pure spec');
    assert.ok(cgiComponent.includes('makePrisonDust'), 'cold dust field');
    assert.ok(cgiComponent.includes('updateDustField'), 'dust drifts per frame');
    assert.ok(!cgiComponent.includes('<pointLight'), 'no new point lights in the dressing');
    assert.ok(!cgiComponent.includes('<spotLight'), 'no spot lights');
    assert.ok(!cgiComponent.includes('<directionalLight'), 'no directional lights');
    assert.ok(!cgiLib.includes('pointLight'), 'no real lights in the CGI lib');
  });
});

describe('mechanics still wired (nothing that worked may break)', () => {
  it('hall facts unchanged: 48x16 m, 72 cells, far plane 120', () => {
    assert.equal(PRISON_HALL.lengthM, 48);
    assert.equal(PRISON_HALL.widthM, 16);
    assert.equal(PRISON_CAPACITY, 72);
    assert.ok(prisonPage.includes('far: 120'), 'camera far plane still 120');
  });

  it('light budget unchanged: 8 + 4 per grown level', () => {
    assert.equal(PRISON_LIGHT_BUDGET, 8);
    assert.equal(PRISON_EXPANSION_LIGHTS_PER_LEVEL, 4);
    assert.equal(prisonLightBudgetForLevels(3), 8);
    assert.equal(prisonLightBudgetForLevels(4), 12);
    assert.equal(prisonLightBudgetForLevels(5), 16);
    const pointLights = (world3d.match(/<pointLight/g) || []).length;
    assert.equal(pointLights, 1, 'one mapped pointLight row, no added lights');
    assert.equal((world3d.match(/<spotLight/g) || []).length, 0);
    assert.equal((world3d.match(/<directionalLight/g) || []).length, 0);
  });

  it('one-way visibility still one-way', () => {
    assert.equal(PRISON_ONE_WAY.outer.opacity, 0.08);
    assert.ok(world3d.includes('prisonerFaceYawAt'), 'figures still sway inward only');
    assert.ok(world3d.includes('oneWayPaneYaw'), 'panes still yawed per side');
    const frontSides = (world3d.match(/side=\{THREE\.FrontSide\}/g) || []).length;
    assert.ok(frontSides >= 2, 'both one-way panes still FrontSide only');
    assert.ok(!world3d.includes('DoubleSide'), 'no double-sided pane smuggled in');
    assert.ok(!world3d.includes('lookAt'), 'figures never look at the keeper');
  });

  it('cells still hold prisoners, Warden still grows', () => {
    assert.ok(world3d.includes('cell.prisoner'), 'cells still read their prisoner');
    assert.ok(world3d.includes('<FigureBody'), 'figures still render');
    assert.ok(prisonPage.includes('assignGrownCells'), 'page still grows via the Warden');
    assert.ok(prisonPage.includes("setInterval(() => { load({ silent: true })"), '15 s live refresh intact');
  });

  it('exit button still in all 4 page states, no release control', () => {
    assert.ok(prisonPage.includes('← Exit to ARES'), 'exit label present');
    assert.ok(prisonPage.includes('href="/ares"'), 'exit goes to the console');
    const uses = (prisonPage.match(/<ExitToAres \/>/g) || []).length;
    assert.equal(uses, 4, 'ExitToAres used in all 4 states');
    assert.ok(!/releasePrisoner|releaseCell|onRelease|setRelease/i.test(prisonPage), 'no release path in the page');
    assert.ok(!/releasePrisoner|releaseCell|onRelease/i.test(world3d), 'no release path in the scene');
    assert.ok(!/<button[^>]*>[^<]*[Rr]elease/.test(prisonPage), 'no release button');
  });

  it('cell front frames untouched (the silver-wraps worker owns them)', () => {
    assert.ok(world3d.includes('const barCount = 5'), 'five bars per cell, as built');
    assert.ok(world3d.includes('emissiveIntensity={1.6}'), 'bars keep their blue emissive');
    assert.ok(world3d.includes('emissiveIntensity={1.2}'), 'rails keep their blue emissive');
    // The bars + rails block itself (front bars comment to the
    // prisoner comment) carries no CGI material and no material prop.
    const barsBlock = world3d.slice(
      world3d.indexOf('front bars:'),
      world3d.indexOf('the prisoner, standing'),
    );
    assert.ok(barsBlock.length > 0, 'bars block found');
    assert.ok(!barsBlock.includes('prisonMaterial'), 'bars never dressed');
    assert.ok(!barsBlock.includes('material={'), 'bars keep their inline blue material');
    assert.ok(!cgiComponent.includes('barCount'), 'dressing never builds bars');
    assert.ok(!cgiComponent.includes('frontZ'), 'dressing never touches the cell front');
  });
});
