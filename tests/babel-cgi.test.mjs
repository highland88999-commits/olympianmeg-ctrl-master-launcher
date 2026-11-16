// tests/babel-cgi.test.mjs — BABEL CGI makeover (Nov 15, 2026).
//
// What Babel was (verified in code before building): a flat 1024px
// ground canvas stretched over 600 m with no grain or wear and lane
// dashes drawn straight through the plaza; flat-colour instanced
// building boxes whose `windows` flag was computed and never rendered;
// a flat THREE.Color sky; no traffic, no pedestrians; box cars with
// no wheels or lights; a flat stone/glass tower; a blank vault sign.
// The shared layer (lib/gta/city-cgi.js, Mega City worker) has since
// fixed the facades, parked cars and cop cars — this suite pins the
// Babel-owned half: the gold sky + breeze + ring-road traffic +
// plaza pedestrians + tower stone/glass + ground wear, and that every
// mechanic (missions, wanted, driving, walking, HUD, vault door)
// is still wired exactly as before.
//
// app/babel/babel-district.js is covered by source-level checks only:
// it uses the '@/...' alias, which plain node cannot resolve (same
// convention as tests/mega-city-cgi.test.mjs for app/mega-city/city.js).
//
// Run: node --test tests/babel-cgi.test.mjs
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

const CGI = await import('../app/babel/cgi.js');
const { BABEL_MISSIONS } = await import('../lib/gta/missions.js');

const cgiSrc = readFileSync(new URL('../app/babel/cgi.js', import.meta.url), 'utf8');
const sceneSrc = readFileSync(new URL('../app/babel/gta-scene.js', import.meta.url), 'utf8');
const districtSrc = readFileSync(new URL('../app/babel/babel-district.js', import.meta.url), 'utf8');
const pageGtaSrc = readFileSync(new URL('../app/babel/page-gta.jsx', import.meta.url), 'utf8');

const T0 = 1794000000000; // a fixed wall-clock instant (Nov 2026)
const T1 = T0 + 5000;
const approx = (a, b, e = 1e-6) => Math.abs(a - b) < e;

function countMatches(src, re) {
  return (src.match(re) || []).length;
}

// ── spec ──────────────────────────────────────────────────────────

describe('babel spec', () => {
  it('is one golden sun, not two (Babel is not Tatooine)', () => {
    const spec = CGI.babelCgiSpec();
    assert.equal(spec.id, 'babel');
    assert.equal(spec.sun.color, 0xffe9b0);
    assert.equal(spec.sun.scale, 170);
  });

  it('carries a warm gold horizon by day and indigo by night', () => {
    const spec = CGI.babelCgiSpec();
    assert.equal(spec.sky.horizon, 0xf2c979);
    assert.equal(spec.night.top, 0x070a1e);
    assert.notEqual(spec.sky.horizon, spec.night.horizon);
  });

  it('carries clouds, gold-dust motes, stars, traffic and pedestrians', () => {
    const spec = CGI.babelCgiSpec();
    assert.equal(spec.clouds.count, 12);
    assert.equal(spec.motes.count, 180);
    assert.equal(spec.motes.color, 0xffd98a);
    assert.equal(spec.stars.count, 350);
    assert.equal(spec.trafficCount, 6);
    assert.equal(spec.pedestrianCount, 10);
    assert.equal(spec.pedestrianRing, 40);
    assert.equal(spec.trafficLoopHalf, 140);
  });

  it('returns a fresh object every call', () => {
    assert.notEqual(CGI.babelCgiSpec(), CGI.babelCgiSpec());
  });
});

// ── the Babel breeze ──────────────────────────────────────────────

describe('babel wind', () => {
  it('is deterministic for the same instant', () => {
    assert.deepEqual(CGI.babelWindAt(T0), CGI.babelWindAt(T0));
  });

  it('stays in its gentle range and veers around west-northwest', () => {
    for (let i = 0; i < 20; i++) {
      const w = CGI.babelWindAt(T0 + i * 7000);
      assert.ok(w.speed >= CGI.BABEL_WIND.gustMinMps && w.speed <= CGI.BABEL_WIND.gustMaxMps,
        `speed ${w.speed}`);
      assert.ok(w.gust >= 0 && w.gust <= 1);
      assert.ok(Math.abs(w.bearingDeg - CGI.BABEL_WIND.bearingDeg) <= CGI.BABEL_WIND.veerDeg + 1e-9);
      assert.ok(approx(Math.hypot(w.dirX, w.dirZ), 1));
    }
  });

  it('is Babel-scale, not a Martian gale', () => {
    assert.ok(CGI.BABEL_WIND.baseMps < 4);
    assert.ok(CGI.BABEL_WIND.gustMaxMps <= 6);
  });
});

// ── traffic operator ──────────────────────────────────────────────

describe('babel traffic', () => {
  it('is deterministic for the same index + instant', () => {
    for (let i = 0; i < 6; i++) {
      assert.deepEqual(CGI.trafficFor(i, T0), CGI.trafficFor(i, T0));
    }
  });

  it('rides the ±140 m ring road, in a lane, at city pace', () => {
    for (let i = 0; i < 6; i++) {
      for (const t of [T0, T1, T0 + 30000, T0 + 90000]) {
        const c = CGI.trafficFor(i, t);
        const onX = Math.abs(Math.abs(c.x) - 140) <= 3.5 + 1e-9;
        const onZ = Math.abs(Math.abs(c.z) - 140) <= 3.5 + 1e-9;
        assert.ok(onX || onZ, `car ${i} at ${c.x},${c.z} off the loop`);
        assert.ok(c.speed >= 8 && c.speed <= 12);
      }
    }
  });

  it('moves along the loop over time and heads along its tangent', () => {
    for (let i = 0; i < 6; i++) {
      const a = CGI.trafficFor(i, T0);
      const b = CGI.trafficFor(i, T1);
      // 5 s at 8–12 m/s: the chord is at most the 40–60 m arc, and
      // at least ~28 m even when the car rounds a corner mid-chord
      // (worst split: two 20 m legs at a right angle = 28.3 m).
      const chord = Math.hypot(b.x - a.x, b.z - a.z);
      assert.ok(chord > 25 && chord <= 60 + 1e-6, `car ${i} chord ${chord}`);
      // Heading is exactly the tangent of the segment the car is on.
      const half = 140 + a.dir * 3.5;
      let expected;
      if (Math.abs(a.x - half) < 0.01) expected = 0;
      else if (Math.abs(a.z - half) < 0.01) expected = -Math.PI / 2;
      else if (Math.abs(a.x + half) < 0.01) expected = Math.PI;
      else if (Math.abs(a.z + half) < 0.01) expected = Math.PI / 2;
      else assert.fail(`car ${i} at ${a.x},${a.z} is on no loop segment`);
      if (a.dir < 0) expected += Math.PI;
      const norm = (h) => ((h + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      assert.ok(approx(norm(a.heading), norm(expected), 1e-9),
        `car ${i} heading ${a.heading} vs segment ${expected}`);
    }
  });

  it('splits 3 clockwise / 3 counter-clockwise', () => {
    const dirs = [0, 1, 2, 3, 4, 5].map((i) => CGI.trafficFor(i, T0).dir);
    assert.deepEqual(dirs, [1, 1, 1, -1, -1, -1]);
  });
});

// ── pedestrian operator ───────────────────────────────────────────

describe('babel pedestrians', () => {
  it('is deterministic for the same index + instant', () => {
    for (let i = 0; i < 10; i++) {
      assert.deepEqual(CGI.pedestrianFor(i, T0), CGI.pedestrianFor(i, T0));
    }
  });

  it('walks the plaza ring at strolling pace', () => {
    for (let i = 0; i < 10; i++) {
      for (const t of [T0, T1, T0 + 60000]) {
        const p = CGI.pedestrianFor(i, t);
        assert.ok(approx(Math.hypot(p.x, p.z), 40, 1e-6), `ped ${i} radius ${Math.hypot(p.x, p.z)}`);
        assert.ok(p.speed >= 1.0 && p.speed <= 1.6);
        assert.ok(p.walkPhase >= 0 && p.walkPhase < 1);
      }
    }
  });

  it('moves along the ring over time', () => {
    for (let i = 0; i < 10; i++) {
      const a = CGI.pedestrianFor(i, T0);
      const b = CGI.pedestrianFor(i, T1);
      assert.ok(Math.hypot(b.x - a.x, b.z - a.z) > 0.5, `ped ${i} did not move`);
    }
  });
});

// ── textures ──────────────────────────────────────────────────────

describe('babel textures', () => {
  it('stone maps are deterministic and cached', () => {
    const a = CGI.babelStoneMaps(2026);
    const b = CGI.babelStoneMaps(2026);
    assert.equal(a, b);
    assert.deepEqual([...a.map.image.data], [...b.map.image.data]);
    assert.equal(a.map.image.width, 256);
    assert.ok(a.bumpMap);
  });

  it('stone carries gold veining (bright warm pixels exist)', () => {
    const { map } = CGI.babelStoneMaps(2026);
    const d = map.image.data;
    let gold = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 120 && d[i + 1] > 80 && d[i + 2] < 110) gold++;
    }
    assert.ok(gold > 50, `gold vein pixels: ${gold}`);
  });

  it('glass maps are deterministic and streaked, not flat', () => {
    const a = CGI.babelGlassMaps(2026);
    const b = CGI.babelGlassMaps(2026);
    assert.equal(a, b);
    const d = a.map.image.data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4) seen.add(d[i]);
    assert.ok(seen.size > 8, `glass grey levels: ${seen.size}`);
  });

  it('glow texture is a radial falloff (bright centre, clear edge)', () => {
    const tex = CGI.babelGlowTexture();
    assert.equal(CGI.babelGlowTexture(), tex);
    const d = tex.image.data;
    const centre = d[(32 * 64 + 32) * 4 + 3];
    const corner = d[3];
    assert.ok(centre > 200, `centre alpha ${centre}`);
    assert.equal(corner, 0);
  });

  it('cloud texture carries real alpha puffs', () => {
    const tex = CGI.babelCloudTexture();
    const d = tex.image.data;
    let alpha = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 30) alpha++;
    assert.ok(alpha > 1000, `cloud alpha pixels: ${alpha}`);
  });

  it('tower materials are shared + cached', () => {
    assert.equal(CGI.materialForBabelStone(), CGI.materialForBabelStone());
    assert.equal(CGI.materialForBabelGlass(), CGI.materialForBabelGlass());
    assert.equal(CGI.materialForBabelStone().userData.shared, true);
  });
});

// ── built CGI layer ───────────────────────────────────────────────

describe('buildBabelCgi', () => {
  let built;
  before(() => { built = CGI.buildBabelCgi(THREE); });

  it('builds dome + sun + stars + clouds + motes + 6 traffic + 10 pedestrians', () => {
    const names = [];
    built.group.traverse((o) => names.push(o.name));
    for (const n of ['babel-sky-dome', 'babel-sun', 'babel-stars', 'babel-clouds', 'babel-motes']) {
      assert.ok(names.includes(n), `missing ${n}`);
    }
    assert.equal(names.filter((n) => n === 'babel-traffic').length, 6);
    assert.equal(names.filter((n) => n === 'babel-pedestrian').length, 10);
  });

  it('carries no real lights — glow is emissive / basic only', () => {
    let lights = 0;
    built.group.traverse((o) => { if (o.isLight) lights++; });
    assert.equal(lights, 0);
    assert.equal(countMatches(cgiSrc, /new THREE\.(PointLight|DirectionalLight|SpotLight|HemisphereLight)/g), 0);
  });

  it('shows stars at night and hides them by day; sun rides the sun vector', () => {
    built.update(T0, { player: { x: 0, z: 0 }, dayness: 1, sunDir: { x: 0, y: 1, z: 0 }, parked: [] });
    const stars = built.group.getObjectByName('babel-stars');
    const sun = built.group.getObjectByName('babel-sun');
    assert.equal(stars.material.opacity, 0);
    assert.ok(sun.visible);
    built.update(T0, { player: { x: 0, z: 0 }, dayness: 0, sunDir: { x: 0, y: -1, z: 0 }, parked: [] });
    assert.ok(stars.material.opacity > 0.8);
    assert.equal(sun.visible, false);
  });

  it('moves traffic and pedestrians between two instants', () => {
    built.update(T0, { player: { x: 0, z: 0 }, dayness: 1, sunDir: { x: 0, y: 1, z: 0 }, parked: [] });
    const car = built.group.children.find((c) => c.name === 'babel-traffic');
    const ped = built.group.children.find((c) => c.name === 'babel-pedestrian');
    const cx0 = car.position.x;
    const cz0 = car.position.z;
    const px0 = ped.position.x;
    built.update(T1, { player: { x: 0, z: 0 }, dayness: 1, sunDir: { x: 0, y: 1, z: 0 }, parked: [] });
    assert.ok(Math.hypot(car.position.x - cx0, car.position.z - cz0) > 1, 'traffic did not move');
    assert.ok(Math.hypot(ped.position.x - px0, ped.position.z) > 0.2, 'pedestrian did not move');
  });

  it('holds traffic when the player blocks its clock position', () => {
    const st = CGI.trafficFor(0, T0);
    built.update(T0 - 1000, { player: { x: 300, z: 300 }, dayness: 1, sunDir: { x: 0, y: 1, z: 0 }, parked: [] });
    const car = built.group.children.find((c) => c.userData.trafficIndex === 0);
    const held = { x: car.position.x, z: car.position.z };
    built.update(T0, { player: { x: st.x, z: st.z }, dayness: 1, sunDir: { x: 0, y: 1, z: 0 }, parked: [] });
    assert.ok(approx(car.position.x, held.x) && approx(car.position.z, held.z),
      'traffic drove through the player instead of yielding');
  });

  it('disposes without throwing', () => {
    assert.doesNotThrow(() => built.dispose());
  });
});

// ── district: ground + tower + vault door (source-level only —
// babel-district.js uses the '@/...' alias, which plain node cannot
// resolve; same convention as the Mega City CGI suite) ────────────

describe('babel district (CGI repairs)', () => {
  it('ground painter now wears grain, cracks, crosswalks and pavers', () => {
    for (const marker of ['grain', 'crosswalk', 'paver', 'gold inlay', 'Oil stains', 'Cracks']) {
      assert.ok(districtSrc.toLowerCase().includes(marker.toLowerCase()), `missing ${marker}`);
    }
    assert.ok(districtSrc.includes('createBabelGroundTexture'));
    assert.ok(districtSrc.includes('THREE.CanvasTexture'));
    assert.ok(districtSrc.includes('THREE.RepeatWrapping'));
  });

  it('lane dashes stop at the plaza edge and resume on the far side', () => {
    assert.ok(districtSrc.includes('512 - edge') && districtSrc.includes('512 + edge'));
    assert.ok(!/Skip lines through the plaza/.test(districtSrc));
  });

  it('tower accepts textured stone/glass and exposes the bulb handle', () => {
    assert.ok(districtSrc.includes('buildTowerMeshes(scene, mats'));
    assert.ok(districtSrc.includes('mats.stone') && districtSrc.includes('mats.glass'));
    assert.ok(districtSrc.includes('group.userData.streetlightBulbMat = bulbMat'));
    assert.ok(districtSrc.includes('group.userData.goldMat = goldMat'));
  });

  it('vault door sign is lettered, not blank', () => {
    assert.ok(districtSrc.includes("MILES' VAULT"));
    assert.ok(districtSrc.includes("fillText(\"MILES' VAULT\""));
  });

  it('district layout constants are untouched', () => {
    for (const frag of ['size: 600', 'blockSize: 44', 'roadWidth: 14', 'plazaRadius: 55', 'crownY: 200', 'promptRadius: 6']) {
      assert.ok(districtSrc.includes(frag), `district lost ${frag}`);
    }
  });
});

// ── mechanics still wired ─────────────────────────────────────────

describe('mechanics still wired', () => {
  it('Babel missions are unchanged (2 missions, same ids + rewards)', () => {
    assert.equal(BABEL_MISSIONS.length, 2);
    assert.deepEqual(BABEL_MISSIONS.map((m) => m.id), ['bb-courier-1', 'bb-vault-1']);
    assert.deepEqual(BABEL_MISSIONS.map((m) => m.reward), [120, 200]);
  });

  it('gta-scene still imports every mechanic + the CGI layer', () => {
    for (const frag of [
      'createWanted', 'commitCrime', 'updateWanted', 'checkBusted', 'resetWanted',
      'createMission', 'updateMission', 'startMission', 'BABEL_MISSIONS',
      'createVehicle', 'updateVehicle', 'enterVehicle', 'exitVehicle', 'nearestVehicle',
      'createPlayer', 'updatePlayer', 'createInput', 'findClearSpot',
      'createWalkerEmbodiment', 'VAULT_DOOR', 'buildBabelCgi',
      'materialForBabelStone', 'materialForBabelGlass',
      'materialForFacade', 'buildVehicleMesh', 'buildCopMesh', 'copFlashAt',
    ]) {
      assert.ok(sceneSrc.includes(frag), `gta-scene lost ${frag}`);
    }
  });

  it('gta-scene still routes the vault door to /babel/vault and disposes the CGI', () => {
    assert.ok(sceneSrc.includes("router.push('/babel/vault')") || sceneSrc.includes("type: 'vault_enter'"));
    assert.ok(sceneSrc.includes('cgi.dispose()'));
    assert.ok(sceneSrc.includes('cgi.update(Date.now()'));
  });

  it('page-gta still wires the HUD + missions + character picker', () => {
    for (const frag of ['WantedStars', 'HealthBar', 'Minimap', 'Speedometer', 'MissionTracker', 'TouchControls', 'CharacterPicker', 'startMission']) {
      assert.ok(pageGtaSrc.includes(frag), `page-gta lost ${frag}`);
    }
  });

  it('no new real lights: pre-existing counts unchanged', () => {
    // district: tower beacon + vault wash (2, pre-existing). scene:
    // directional sun + hemisphere (2, pre-existing). cgi: 0.
    assert.equal(countMatches(districtSrc, /new THREE\.(PointLight|DirectionalLight|SpotLight|HemisphereLight)/g), 2);
    assert.equal(countMatches(sceneSrc, /new THREE\.(PointLight|DirectionalLight|SpotLight|HemisphereLight)/g), 2);
    assert.equal(countMatches(cgiSrc, /new THREE\.(PointLight|DirectionalLight|SpotLight|HemisphereLight)/g), 0);
  });

  it('no SQL in this batch', () => {
    for (const [name, src] of [['cgi', cgiSrc], ['scene', sceneSrc], ['district', districtSrc]]) {
      assert.ok(!/INSERT INTO|CREATE TABLE|supabase/i.test(src), `${name} mentions SQL`);
    }
  });
});
