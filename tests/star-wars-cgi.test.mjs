// tests/star-wars-cgi.test.mjs
// STAR WARS CGI — the Nov 15, 2026 upgrade (Merlin: "Upgrade the heck
// out of it. And not just tattooing... all world in the Star Wars
// universe"). His Tatooine phone videos showed flat brown ground, a
// flat light-blue sky with NO twin suns, and nothing moving.
//
// This suite pins the fix: every world carries a seeded textured
// ground (colour + bump DataTextures, planet-cgi standard) and a
// living sky (gradient dome, suns, clouds, motes), Tatooine carries
// exactly TWO suns, and the whole sky breathes on the real clock +
// the shared day/night law. Run: node --test tests/star-wars-cgi.test.mjs
//
// The canvas makers (glowSprite / cloudTexture) need a document;
// the stub below is the same minimal shape the other suites use —
// no-op 2d context, settable props, gradient objects where asked.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

function fakeCtx() {
  return new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient') {
        return () => ({ addColorStop() {} });
      }
      return () => {};
    },
    set() { return true; },
  });
}

globalThis.document = {
  createElement: (tag) => (tag === 'canvas'
    ? { width: 0, height: 0, getContext: () => fakeCtx(), style: {} }
    : { style: {} }),
};

const { PLANETS } = await import('../app/star-wars/data.js');
const T = await import('../app/star-wars/textures.js');
const CGI = await import('../app/star-wars/cgi.js');
const ZONE = await import('../app/star-wars/zone.js');

const zoneSrc = readFileSync(new URL('../app/star-wars/zone.js', import.meta.url), 'utf8');

/* The 16 worlds Merlin named. data.js carries 3 more (ahch-to,
 * crait, exegol, Episodes VIII–IX); they get the same treatment
 * and are pinned wherever the suite iterates all of PLANETS. */
const SIXTEEN = [
  'tatooine', 'naboo', 'coruscant', 'kamino', 'geonosis', 'mustafar',
  'yavin-4', 'alderaan', 'death-star', 'hoth', 'dagobah', 'bespin',
  'endor', 'jakku', 'takodana', 'starkiller',
];

/* Sydney, January: noon AEDT ≈ 01:00 UTC, midnight AEDT ≈ 13:00 UTC. */
const NOON_MS = Date.UTC(2026, 0, 15, 1, 0, 0);
const MIDNIGHT_MS = Date.UTC(2026, 0, 15, 13, 0, 0);
const SYDNEY = { lat: -33.8688, lon: 151.2093 };

function meanRgb(dataTex) {
  const d = dataTex.image.data;
  let r = 0, g = 0, b = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  return [r / n, g / n, b / n];
}

function findNamed(group, name) {
  let found = null;
  group.traverse((o) => { if (!found && o.name === name) found = o; });
  return found;
}

function countNamed(group, name) {
  let n = 0;
  group.traverse((o) => { if (o.name === name) n += 1; });
  return n;
}

describe('star-wars CGI spec — every world', () => {
  it('all 16 named worlds exist in PLANETS', () => {
    for (const id of SIXTEEN) assert.ok(PLANETS[id], `${id} missing from PLANETS`);
  });

  it('every world (all 19) carries ground + sky + at least one sun', () => {
    for (const [id, def] of Object.entries(PLANETS)) {
      const spec = CGI.worldCgiSpec(def);
      assert.ok(spec.sky && Number.isInteger(spec.sky.top)
        && Number.isInteger(spec.sky.horizon) && Number.isInteger(spec.sky.bottom),
        `${id}: sky gradient incomplete`);
      assert.ok(spec.night && Number.isInteger(spec.night.top), `${id}: night sky missing`);
      assert.ok(Array.isArray(spec.suns) && spec.suns.length >= 1, `${id}: no sun`);
      for (const s of spec.suns) {
        assert.ok(Number.isInteger(s.color) && s.scale > 0, `${id}: bad sun ${JSON.stringify(s)}`);
      }
      assert.ok(typeof spec.groundTex === 'string' && spec.groundTex.length > 0, `${id}: no ground tex`);
      if (def.kind === 'fly') {
        assert.equal(spec.clouds, null, `${id}: fly worlds carry no cloud billboards`);
        assert.equal(spec.motes, null, `${id}: fly worlds carry no mote field`);
      } else {
        assert.ok(spec.clouds && spec.clouds.count >= 6, `${id}: no clouds`);
      }
    }
  });

  it('Tatooine carries exactly TWO suns, a close warm pair', () => {
    const spec = CGI.worldCgiSpec(PLANETS.tatooine);
    assert.equal(spec.suns.length, 2, 'Tatooine must have twin suns, not one');
    const [a, b] = spec.suns;
    assert.ok(Math.abs(a.azimuthDeg - b.azimuthDeg) <= 20,
      `twin suns must sit close together (az ${a.azimuthDeg} vs ${b.azimuthDeg})`);
    assert.ok(Math.abs(a.elevationDeg - b.elevationDeg) <= 10, 'twin suns ride at near the same height');
    for (const s of spec.suns) {
      // warm: red channel dominates blue by a clear margin
      const r = (s.color >> 16) & 255, bl = s.color & 255;
      assert.ok(r - bl > 40, `sun 0x${s.color.toString(16)} is not warm`);
    }
    assert.ok(a.scale > b.scale, 'the primary sun is the bigger disc');
  });

  it('desert worlds get dust devils, Kamino gets rain, Hoth gets snow, Exegol gets lightning', () => {
    assert.equal(CGI.worldCgiSpec(PLANETS.tatooine).devils, 2, 'Tatooine dust devils');
    assert.equal(CGI.worldCgiSpec(PLANETS.jakku).devils, 2, 'Jakku dust devils');
    assert.equal(CGI.worldCgiSpec(PLANETS.geonosis).devils, 2, 'Geonosis dust devils');
    assert.equal(CGI.worldCgiSpec(PLANETS.kamino).motes.mode, 'fall', 'Kamino rain falls');
    assert.ok(CGI.worldCgiSpec(PLANETS.kamino).motes.count >= 400, 'Kamino rain is dense');
    assert.equal(CGI.worldCgiSpec(PLANETS.hoth).motes.mode, 'fall', 'Hoth snow falls');
    assert.equal(CGI.worldCgiSpec(PLANETS.mustafar).motes.mode, 'rise', 'Mustafar embers rise');
    assert.equal(CGI.worldCgiSpec(PLANETS.exegol).lightning, true, 'Exegol lightning');
    assert.equal(CGI.worldCgiSpec(PLANETS.bespin).cloudSea, true, 'Bespin cloud sea');
  });
});

describe('star-wars CGI ground maps', () => {
  it('every walk world gets 256x256 colour + bump DataTextures, cached per world', () => {
    for (const [id, def] of Object.entries(PLANETS)) {
      if (def.kind === 'fly') {
        assert.equal(CGI.cgiGroundMaps(THREE, def), null, `${id}: fly worlds have no ground`);
        continue;
      }
      const maps = CGI.cgiGroundMaps(THREE, def);
      assert.ok(maps.map && maps.bumpMap, `${id}: missing maps`);
      assert.equal(maps.map.image.width, 256, `${id}: colour map is not 256px`);
      assert.equal(maps.bumpMap.image.width, 256, `${id}: bump map is not 256px`);
      assert.ok(maps.map.wrapS === THREE.RepeatWrapping, `${id}: ground must tile`);
      assert.ok(maps.roughness > 0 && maps.bumpScale > 0, `${id}: no surface style`);
      const again = CGI.cgiGroundMaps(THREE, def);
      assert.equal(again, maps, `${id}: ground maps must be cached, not repainted`);
      assert.equal(again.map, maps.map, `${id}: colour map object shared`);
    }
  });

  it('ground colours are the worlds\' own — sand is sandy, ice is white, lava rock is dark', () => {
    const [tr, tg, tb] = meanRgb(CGI.cgiGroundMaps(THREE, PLANETS.tatooine).map);
    assert.ok(tr > 150 && tg > 100 && tg < 200 && tb < 140,
      `Tatooine sand mean rgb (${tr.toFixed(0)},${tg.toFixed(0)},${tb.toFixed(0)}) is not tan sand`);
    assert.ok(tr > tg && tg > tb, 'Tatooine sand must read warm (r > g > b)');
    const [hr, hg, hb] = meanRgb(CGI.cgiGroundMaps(THREE, PLANETS.hoth).map);
    assert.ok(hr > 200 && hg > 200 && hb > 200, `Hoth mean rgb (${hr.toFixed(0)},${hg.toFixed(0)},${hb.toFixed(0)}) is not ice-white`);
    const [mr, mg, mb] = meanRgb(CGI.cgiGroundMaps(THREE, PLANETS.mustafar).map);
    assert.ok(mr < 90 && mg < 70, `Mustafar mean rgb (${mr.toFixed(0)},${mg.toFixed(0)},${mb.toFixed(0)}) is not dark basalt`);
    const [kr, , kb] = meanRgb(CGI.cgiGroundMaps(THREE, PLANETS.kamino).map);
    assert.ok(kb > kr, 'Kamino ocean must read blue (b > r)');
    const [jr, jg] = meanRgb(CGI.cgiGroundMaps(THREE, PLANETS.jakku).map);
    assert.ok(Math.abs(jr - tr) > 8 || Math.abs(jg - tg) > 8,
      'Jakku sand must differ from Tatooine sand (different seed/colours)');
  });

  it('the bump channel carries real relief (not a flat 128)', () => {
    for (const id of ['tatooine', 'hoth', 'mustafar', 'geonosis']) {
      const bump = CGI.cgiGroundMaps(THREE, PLANETS[id]).bumpMap.image.data;
      let min = 255, max = 0;
      for (let i = 0; i < bump.length; i += 7) {
        if (bump[i] < min) min = bump[i];
        if (bump[i] > max) max = bump[i];
      }
      assert.ok(max - min > 60, `${id}: bump range ${min}..${max} is too flat to read at eye level`);
    }
  });
});

describe('star-wars CGI sky builders', () => {
  it('walk worlds build a dome, suns, clouds and motes; fly worlds build only a fixed sun', () => {
    for (const [id, def] of Object.entries(PLANETS)) {
      const cgi = CGI.buildCgi(THREE, def, T, {});
      assert.equal(cgi.group.name, 'cgi', `${id}: CGI group unnamed`);
      if (def.kind === 'walk') {
        assert.ok(findNamed(cgi.group, 'cgi-sky-dome'), `${id}: no sky dome`);
        assert.ok(countNamed(cgi.group, 'cgi-sun') >= 1, `${id}: no sun sprite`);
        assert.ok(findNamed(cgi.group, 'cgi-clouds'), `${id}: no cloud layer`);
      } else {
        assert.equal(findNamed(cgi.group, 'cgi-sky-dome'), null, `${id}: fly worlds must not dome over the starfield`);
        assert.equal(countNamed(cgi.group, 'cgi-sun'), 1, `${id}: fly worlds carry one fixed sun`);
      }
      assert.doesNotThrow(() => cgi.update(0, 0.016, NOON_MS, { x: 0, z: 95 }), `${id}: update must not throw`);
    }
  });

  it('Tatooine builds two sun sprites; Bespin builds a cloud sea; Exegol builds lightning', () => {
    const tat = CGI.buildCgi(THREE, PLANETS.tatooine, T, {});
    assert.equal(countNamed(tat.group, 'cgi-sun'), 2, 'Tatooine builds two sun sprites');
    assert.equal(countNamed(tat.group, 'cgi-dust-devil'), 2, 'Tatooine builds two dust devils');
    const bes = CGI.buildCgi(THREE, PLANETS.bespin, T, {});
    assert.ok(findNamed(bes.group, 'cgi-cloud-sea'), 'Bespin builds a cloud sea');
    const ex = CGI.buildCgi(THREE, PLANETS.exegol, T, {});
    assert.ok(findNamed(ex.group, 'cgi-lightning'), 'Exegol builds a lightning light');
    assert.ok(findNamed(ex.group, 'cgi-lightning-flash'), 'Exegol builds a lightning flash sprite');
  });

  it('each sun is a core-disc + glow-halo group; the flash and horizon glow stay bare sprites', () => {
    const tat = CGI.buildCgi(THREE, PLANETS.tatooine, T, {});
    const suns = [];
    tat.group.traverse((o) => { if (o.name === 'cgi-sun') suns.push(o); });
    assert.equal(suns.length, 2, 'Tatooine still builds two suns');
    for (const s of suns) {
      assert.ok(s.isGroup, 'a sun is a group, not a bare sprite');
      assert.ok(s.userData.sprite, 'the group carries its glow sprite');
      assert.ok(s.userData.disc, 'the group carries its core disc');
      assert.ok(s.userData.disc.isSprite, 'the core disc is a camera-facing sprite');
    }
    const ex = CGI.buildCgi(THREE, PLANETS.exegol, T, {});
    const flash = findNamed(ex.group, 'cgi-lightning-flash');
    assert.ok(flash && flash.isSprite, 'the lightning flash stays a bare sprite');
    for (const [id, def] of Object.entries(PLANETS)) {
      if (def.kind !== 'walk') continue;
      if (!CGI.worldCgiSpec(def).horizonGlow) continue;
      const cgi = CGI.buildCgi(THREE, def, T, {});
      const glow = findNamed(cgi.group, 'cgi-horizon-glow');
      assert.ok(glow && glow.isSprite, `${id}: the horizon glow stays a bare sprite`);
    }
  });

  it('sunPosition returns a unit direction at the requested distance', () => {
    const p = CGI.sunPosition(205, 26, 950);
    const len = Math.hypot(p.x, p.y, p.z);
    assert.ok(Math.abs(len - 950) < 1e-6, `sun distance ${len} != 950`);
    assert.ok(p.y > 0, 'a 26-degree sun sits above the horizon');
    const low = CGI.sunPosition(200, 8, 950);
    assert.ok(low.y < p.y, 'a lower sun sits lower');
  });
});

describe('star-wars CGI day/night + motion (real clock)', () => {
  it('the shared law says noon in Sydney and midnight in Sydney', () => {
    const noon = CGI.cgiDayNight(NOON_MS, SYDNEY.lat, SYDNEY.lon);
    const mid = CGI.cgiDayNight(MIDNIGHT_MS, SYDNEY.lat, SYDNEY.lon);
    assert.ok(noon.night < 0.4, `Sydney noon night factor ${noon.night} should be day`);
    assert.ok(noon.sunElevationDeg > 20, `Sydney noon sun elevation ${noon.sunElevationDeg} should be high`);
    assert.ok(mid.night > 0.6, `Sydney midnight night factor ${mid.night} should be night`);
    assert.ok(mid.sunElevationDeg < 0, 'the sun is below the horizon at midnight');
  });

  it('Tatooine suns shine at noon and set at midnight; the lights dim with them', () => {
    const hemi = new THREE.HemisphereLight(0x87b5e0, 0x8a6f4d, 0.85);
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.25);
    const cgi = CGI.buildCgi(THREE, PLANETS.tatooine, T, { sunLight: sun, hemiLight: hemi });
    const suns = [];
    cgi.group.traverse((o) => { if (o.name === 'cgi-sun') suns.push(o); });
    assert.equal(suns.length, 2);
    cgi.update(0, 0.016, NOON_MS, { x: 0, z: 95 });
    assert.ok(suns[0].visible && suns[1].visible, 'both suns visible at noon');
    const noonSunI = sun.intensity;
    const noonHemiI = hemi.intensity;
    assert.ok(noonSunI > 1.0, `noon sun light ${noonSunI} should be near full`);
    /* The twin stays glued to the primary: both sprites ride the
     * same sun vector, a few degrees apart, so they set together.
     * Measured at noon, while both are up. */
    const d = Math.hypot(
      suns[0].position.x - suns[1].position.x,
      suns[0].position.y - suns[1].position.y,
      suns[0].position.z - suns[1].position.z
    );
    assert.ok(d > 50 && d < 400, `twin separation ${d.toFixed(0)} m should be a close pair at 950 m`);
    cgi.update(60, 0.016, MIDNIGHT_MS, { x: 0, z: 95 });
    assert.ok(!suns[0].visible && !suns[1].visible, 'both suns set at midnight');
    assert.ok(sun.intensity < noonSunI, 'the sun light dims at night');
    assert.ok(hemi.intensity < noonHemiI, 'the hemisphere light dims at night');
  });

  it('clouds drift, motes move and devils live on the clock — nothing is static', () => {
    const cgi = CGI.buildCgi(THREE, PLANETS.tatooine, T, {});
    const clouds = findNamed(cgi.group, 'cgi-clouds');
    const motes = findNamed(cgi.group, 'cgi-motes');
    cgi.update(0, 0.016, NOON_MS, { x: 0, z: 95 });
    const rot0 = clouds.rotation.y;
    const pos0 = motes.geometry.getAttribute('position').array.slice(0, 3);
    cgi.update(60, 0.016, NOON_MS + 60000, { x: 10, z: 100 });
    assert.notEqual(clouds.rotation.y, rot0, 'the clouds turn with the clock');
    const pos1 = motes.geometry.getAttribute('position').array.slice(0, 3);
    assert.ok(Math.abs(pos1[0] - pos0[0]) > 1e-6 || Math.abs(pos1[1] - pos0[1]) > 1e-6,
      'the dust motes drift with the clock');
    assert.equal(motes.position.x, 10, 'the mote field follows the walker');
    assert.equal(motes.position.z, 100, 'the mote field follows the walker');
    /* Same instant, same sky: rebuilding at the same nowMs gives
     * the same cloud angle — deterministic, no stored state. */
    const cgi2 = CGI.buildCgi(THREE, PLANETS.tatooine, T, {});
    cgi2.update(0, 0.016, NOON_MS + 60000, { x: 0, z: 95 });
    const clouds2 = findNamed(cgi2.group, 'cgi-clouds');
    assert.ok(Math.abs(clouds2.rotation.y - clouds.rotation.y) < 1e-9,
      'the same instant shows the same sky on every phone');
  });
});

describe('star-wars CGI zone wiring', () => {
  it('zone.js builds through cgiGroundMaps + buildCgi — the flat canvas tile is gone', () => {
    assert.match(zoneSrc, /cgiGroundMaps\(R, def\)/, 'terrain must use cgiGroundMaps');
    assert.match(zoneSrc, /buildCgi\(R, def, T/, 'zone must build the CGI sky layer');
    assert.doesNotMatch(zoneSrc, /TEX_BY_NAME/, 'the old flat-tile lookup must be gone');
    assert.doesNotMatch(zoneSrc, /sandTexture\(\)/, 'the old flat sand tile must be gone from terrain');
    assert.match(zoneSrc, /userData\.shared/, 'cached ground maps must be guarded in dispose');
  });

  it('buildZone mounts the CGI group and a bump-mapped terrain on walk worlds', () => {
    for (const id of ['tatooine', 'hoth', 'mustafar', 'bespin']) {
      const zone = ZONE.buildZone(THREE, PLANETS[id], T, { freeRoam: true });
      const cgiGroup = findNamed(zone.group, 'cgi');
      assert.ok(cgiGroup, `${id}: no CGI group in the zone`);
      assert.ok(findNamed(cgiGroup, 'cgi-sky-dome'), `${id}: no sky dome in the zone`);
      let terrainMat = null;
      zone.group.traverse((o) => {
        if (o.isMesh && o.material && o.material.map && o.material.bumpMap && !terrainMat) {
          terrainMat = o.material;
        }
      });
      assert.ok(terrainMat, `${id}: no bump-mapped terrain material`);
      assert.equal(terrainMat.userData.shared, true, `${id}: terrain maps must be flagged shared`);
      assert.doesNotThrow(() => zone.update(1, 0.016), `${id}: zone.update must not throw`);
      assert.doesNotThrow(() => zone.dispose(), `${id}: zone.dispose must not throw`);
    }
  });

  it('buildZone mounts only a fixed sun on fly worlds', () => {
    for (const id of ['alderaan', 'death-star']) {
      const zone = ZONE.buildZone(THREE, PLANETS[id], T, { freeRoam: true });
      const cgiGroup = findNamed(zone.group, 'cgi');
      assert.ok(cgiGroup, `${id}: no CGI group in the zone`);
      assert.equal(findNamed(cgiGroup, 'cgi-sky-dome'), null, `${id}: no dome over the starfield`);
      assert.equal(countNamed(cgiGroup, 'cgi-sun'), 1, `${id}: one fixed sun`);
      assert.doesNotThrow(() => zone.update(1, 0.016), `${id}: zone.update must not throw`);
      zone.dispose();
    }
  });

  it('disposing a zone does not free the cached ground maps — the next build reuses them', () => {
    const z1 = ZONE.buildZone(THREE, PLANETS.tatooine, T, { freeRoam: true });
    let map1 = null;
    z1.group.traverse((o) => {
      if (o.isMesh && o.material && o.material.map && o.material.userData.shared && !map1) {
        map1 = o.material.map;
      }
    });
    assert.ok(map1, 'first build has a shared ground map');
    z1.dispose();
    const z2 = ZONE.buildZone(THREE, PLANETS.tatooine, T, { freeRoam: true });
    let map2 = null;
    z2.group.traverse((o) => {
      if (o.isMesh && o.material && o.material.map && o.material.userData.shared && !map2) {
        map2 = o.material.map;
      }
    });
    assert.equal(map2, map1, 'the second build must reuse the cached map, not repaint it');
    z2.dispose();
  });
});
