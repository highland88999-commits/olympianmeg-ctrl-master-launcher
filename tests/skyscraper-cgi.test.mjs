// tests/skyscraper-cgi.test.mjs
// SKYSCRAPER CGI — the Nov 15, 2026 makeover (Merlin: a living
// vertical city, height you can feel, distinct from the
// ground-level worlds). What was flat before this pass:
//   * the city floor (#050508), the roads (flat emissive blue),
//     the plot slabs (flat #111), the tower flanks (no face at
//     all — only the front wore its video), the neighbour towers
//     (transparent glow cylinders), the Outland tree (wireframe)
//   * the sky (one flat scene.background colour, no stars, no
//     city glow from below), clouds that never moved, nothing
//     alive at height
//   * the interiors (floors 1-3) had no view out — no sense of
//     the 480 m drop
//   * StreetLights.jsx existed but was never mounted
//
// This suite pins the fix: seeded procedural textures (colour +
// bump + emissive, planet-cgi standard), a gradient sky dome with
// stars and a night city-glow horizon on the shared day/night
// law, Tower wind + drifting cloud bank + air taxis + crown
// beacon as pure functions of the clock, interior city-view
// windows — and that every mechanic that worked before still
// works, with no new real lights anywhere.
//
// Run: node --test tests/skyscraper-cgi.test.mjs (from the repo root).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import {
  SKYSCRAPER_TEXTURE_SIZE,
  SKYSCRAPER_TEXTURE_KINDS,
  SKYSCRAPER_EMISSIVE_KINDS,
  skyscraperMaps,
  materialForSkyscraper,
  facadeWindowTable,
  facadeLitFraction,
  FACADE_COLS,
  FACADE_ROWS,
  skyscraperTextureStats,
} from '../lib/skyscraper-cgi/textures.js';
import {
  SKY_DOME_RADIUS,
  SKY_STAR_COUNT,
  skyStateFor,
  skyStateKey,
  makeSkyDome,
  updateSkyDome,
  makeStarField,
  updateStars,
} from '../lib/skyscraper-cgi/sky.js';
import {
  TOWER_WIND_BEARING_DEG,
  TOWER_WIND_GUST_MIN_MPS,
  TOWER_WIND_GUST_MAX_MPS,
  TOWER_WIND_VEER_DEG,
  CLOUD_BANK_Y,
  towerWindAt,
  windVector,
  windCompass,
  cloudBankAt,
} from '../lib/skyscraper-cgi/weather.js';
import {
  AIR_TAXI_COUNT,
  AIR_TAXI_COLORS,
  AIR_TAXI_CENTRE_Z,
  airTaxiFor,
  elevatorBeaconAt,
} from '../lib/skyscraper-cgi/life.js';
import { PLANET_CGI_EPOCH_MS } from '../lib/planet-cgi/motion.js';

const APP = 'app/skyscraper';
const read = (p) => readFileSync(`${APP}/${p}`, 'utf8');
const exterior = read('components/Exterior.jsx');
const skyCycle = read('components/SkyCycle.jsx');
const roads = read('components/ProceduralRoads.jsx');
const floor1 = read('components/Floor1.jsx');
const floor2 = read('components/Floor2.jsx');
const floor3 = read('components/Floor3.jsx');
const nexus = read('components/NexusEngine.jsx');

const T0 = PLANET_CGI_EPOCH_MS + 1_000_000; // a fixed instant, off-epoch

// ── textures ────────────────────────────────────────────────────

describe('skyscraper textures', () => {
  it('every kind builds a 256x256 colour + bump pair', () => {
    for (const kind of Object.keys(SKYSCRAPER_TEXTURE_KINDS)) {
      const { map, bumpMap, roughness, bumpScale, metalness } = skyscraperMaps(kind, 'test-seed');
      assert.ok(map instanceof THREE.DataTexture, kind);
      assert.ok(bumpMap instanceof THREE.DataTexture, kind);
      assert.equal(map.image.width, SKYSCRAPER_TEXTURE_SIZE, kind);
      assert.equal(map.image.height, SKYSCRAPER_TEXTURE_SIZE, kind);
      assert.equal(bumpMap.image.width, SKYSCRAPER_TEXTURE_SIZE, kind);
      assert.ok(roughness > 0 && roughness <= 1, kind);
      assert.ok(bumpScale > 0, kind);
      assert.ok(metalness >= 0 && metalness <= 1, kind);
    }
  });

  it('kinds with light carry an emissive map; kinds without do not', () => {
    for (const kind of SKYSCRAPER_EMISSIVE_KINDS) {
      const { emissiveMap } = skyscraperMaps(kind, 'test-seed');
      assert.ok(emissiveMap instanceof THREE.DataTexture, kind);
    }
    for (const kind of ['canopy', 'bark']) {
      const { emissiveMap } = skyscraperMaps(kind, 'test-seed');
      assert.equal(emissiveMap, null, kind);
    }
  });

  it('the facade actually lights windows: emissive pixels exist and dark glass does not glow', () => {
    const { map, emissiveMap } = skyscraperMaps('towerFacade', 'test-seed');
    const color = map.image.data;
    const emis = emissiveMap.image.data;
    let litPx = 0;
    let darkGlowPx = 0;
    for (let i = 0; i < color.length; i += 4) {
      const e = emis[i] + emis[i + 1] + emis[i + 2];
      if (e > 60) litPx++;
      // Dark glass (colour sum < 90) must not carry emissive light.
      if (color[i] + color[i + 1] + color[i + 2] < 90 && e > 10) darkGlowPx++;
    }
    assert.ok(litPx > 2000, `lit windows paint ${litPx} emissive px`);
    assert.equal(darkGlowPx, 0);
  });

  it('the facade window table is 6x8, ~55% lit, and deterministic', () => {
    const table = facadeWindowTable('omega-tower');
    assert.equal(table.length, FACADE_COLS * FACADE_ROWS);
    const frac = facadeLitFraction('omega-tower');
    assert.ok(frac > 0.4 && frac < 0.7, `lit fraction ${frac}`);
    assert.deepEqual(facadeWindowTable('omega-tower'), table);
    assert.notDeepEqual(facadeWindowTable('other-seed'), table);
  });

  it('the city ground tile has glowing streets and lit rooftops', () => {
    const { emissiveMap } = skyscraperMaps('cityGround', 'omega-city', { x: 40, y: 40 });
    const emis = emissiveMap.image.data;
    let litPx = 0;
    for (let i = 0; i < emis.length; i += 4) {
      if (emis[i] + emis[i + 1] + emis[i + 2] > 60) litPx++;
    }
    assert.ok(litPx > 500, `city ground lights ${litPx} emissive px`);
  });

  it('the road paints a dashed glowing centre line', () => {
    const { emissiveMap } = skyscraperMaps('road', 'omega-city');
    const emis = emissiveMap.image.data;
    const W = SKYSCRAPER_TEXTURE_SIZE;
    // Centre row (v ~ 0.5) must carry cyan dashes; the edge rows must not.
    let centreLit = 0;
    let edgeLit = 0;
    for (let x = 0; x < W; x++) {
      const ci = (Math.floor(W / 2) * W + x) * 4;
      if (emis[ci + 1] > 100) centreLit++;
      const ei = (2 * W + x) * 4;
      if (emis[ei + 1] > 100) edgeLit++;
    }
    assert.ok(centreLit > 50, `centre dashes light ${centreLit} px`);
    assert.equal(edgeLit, 0);
  });

  it('maps are cached per kind+seed+repeat and deterministic across calls', () => {
    const a = skyscraperMaps('plaza', 'cache-seed');
    const b = skyscraperMaps('plaza', 'cache-seed');
    assert.equal(a, b);
    const c = skyscraperMaps('plaza', 'cache-seed', { x: 8, y: 8 });
    assert.notEqual(a, c);
    assert.equal(c.map.repeat.x, 8);
    assert.equal(a.map.repeat.x, 1);
    const d = skyscraperMaps('plaza', 'other-seed');
    assert.notEqual(a.map.image.data.join(','), d.map.image.data.join(','));
  });

  it('unknown kinds fall back to plaza, never throw', () => {
    const { map } = skyscraperMaps('not-a-kind', 'test-seed');
    assert.ok(map instanceof THREE.DataTexture);
    const m = materialForSkyscraper('not-a-kind', 'test-seed');
    assert.ok(m instanceof THREE.MeshStandardMaterial);
  });

  it('materials share maps, carry the tint, and wire emissive where the kind has light', () => {
    const m1 = materialForSkyscraper('towerFacade', 'omega-tower', '#ffffff', { repeat: { x: 1, y: 22 } });
    const m2 = materialForSkyscraper('towerFacade', 'omega-tower', '#ffffff', { repeat: { x: 1, y: 22 } });
    assert.equal(m1, m2);
    assert.ok(m1.emissiveMap instanceof THREE.DataTexture);
    assert.ok(m1.emissiveIntensity > 0);
    const tinted = materialForSkyscraper('towerFacade', 'node-#ff00ff', '#ff00ff', { emissive: '#ff00ff' });
    assert.equal(tinted.color.getHexString(), 'ff00ff');
    assert.equal(tinted.emissive.getHexString(), 'ff00ff');
    const plain = materialForSkyscraper('canopy', 'outland-forest');
    assert.equal(plain.emissiveMap, null);
    assert.equal(plain.emissiveIntensity, 1);
  });

  it('texture stats grow with use', () => {
    const before = skyscraperTextureStats();
    skyscraperMaps('cityView', 'stats-seed');
    const after = skyscraperTextureStats();
    assert.ok(after.textures > before.textures);
    assert.ok(after.bytes > before.bytes);
  });
});

// ── sky ─────────────────────────────────────────────────────────

describe('skyscraper sky', () => {
  it('day is day, night is night, sunset blends between them', () => {
    const day = skyStateFor(1.2); // high sun
    const night = skyStateFor(-1.2); // deep night
    const dusk = skyStateFor(0); // sun on the horizon
    assert.equal(day.dayFactor, 1);
    assert.equal(day.starsOpacity, 0);
    assert.equal(day.cityGlow, 0);
    assert.equal(night.dayFactor, 0);
    assert.equal(night.starsOpacity, 1);
    assert.equal(night.cityGlow, 1);
    assert.ok(dusk.dayFactor > 0.4 && dusk.dayFactor < 0.6);
    assert.ok(dusk.duskFactor > 0.9);
    assert.ok(dusk.starsOpacity > 0 && dusk.starsOpacity < 1);
    assert.notEqual(day.top, night.top);
    assert.notEqual(day.horizon, night.horizon);
  });

  it('the dome is a BackSide vertex-colour sphere, fog off, behind everything', () => {
    const dome = makeSkyDome();
    assert.ok(dome.geometry instanceof THREE.SphereGeometry);
    assert.equal(dome.name, 'skyscraper-sky-dome');
    assert.equal(dome.material.side, THREE.BackSide);
    assert.equal(dome.material.fog, false);
    assert.equal(dome.material.depthWrite, false);
    assert.equal(dome.renderOrder, -1);
    assert.equal(dome.frustumCulled, false);
    assert.ok(dome.geometry.getAttribute('color'));
  });

  it('repainting the dome changes its colours between day and night', () => {
    const dome = makeSkyDome();
    updateSkyDome(dome, skyStateFor(1.2));
    const dayTop = dome.geometry.getAttribute('color').array.slice(-3).join(',');
    updateSkyDome(dome, skyStateFor(-1.2));
    const nightTop = dome.geometry.getAttribute('color').array.slice(-3).join(',');
    assert.notEqual(dayTop, nightTop);
    // Night horizon carries the warm city-glow band: the horizon
    // vertices (y01 0.42..0.55 — the sphere's 16 height segments
    // put one at 0.5, inside the band) are warmer than the zenith
    // at night.
    const colors = dome.geometry.getAttribute('color');
    const pos = dome.geometry.getAttribute('position');
    let zenithR = 0;
    let horizonR = 0;
    for (let i = 0; i < pos.count; i++) {
      const y01 = (pos.getY(i) / SKY_DOME_RADIUS + 1) / 2;
      if (y01 > 0.98) zenithR = colors.getX(i);
      if (y01 >= 0.42 && y01 <= 0.55) horizonR = Math.max(horizonR, colors.getX(i));
    }
    assert.ok(horizonR > zenithR, `night horizon R ${horizonR} > zenith R ${zenithR}`);
  });

  it('the star field is seeded, upper-sky only, and fades with the sky', () => {
    const stars = makeStarField('omega-tower');
    assert.equal(stars.geometry.getAttribute('position').count, SKY_STAR_COUNT);
    const pos = stars.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      assert.ok(pos.getY(i) > 0, 'stars stay above the horizon');
    }
    const twin = makeStarField('omega-tower');
    assert.deepEqual(
      [...stars.geometry.getAttribute('position').array],
      [...twin.geometry.getAttribute('position').array],
    );
    updateStars(stars, skyStateFor(1.2));
    assert.equal(stars.material.opacity, 0);
    updateStars(stars, skyStateFor(-1.2));
    assert.equal(stars.material.opacity, 1);
  });

  it('sky state keys quantize so the dome repaints only when the sky moves', () => {
    assert.equal(skyStateKey(skyStateFor(1.2)), skyStateKey(skyStateFor(1.21)));
    assert.notEqual(skyStateKey(skyStateFor(1.2)), skyStateKey(skyStateFor(-1.2)));
  });
});

// ── weather + life ──────────────────────────────────────────────

describe('tower wind and cloud', () => {
  it('the wind blows from the west, inside its gust range, veering ±20°', () => {
    for (let k = 0; k < 200; k++) {
      const w = towerWindAt(T0 + k * 7000);
      assert.ok(w.speed >= TOWER_WIND_GUST_MIN_MPS && w.speed <= TOWER_WIND_GUST_MAX_MPS,
        `speed ${w.speed}`);
      assert.ok(Math.abs(w.bearingDeg - TOWER_WIND_BEARING_DEG) <= TOWER_WIND_VEER_DEG + 0.001,
        `bearing ${w.bearingDeg}`);
      assert.ok(w.gust >= 0 && w.gust <= 1);
      assert.ok(Math.abs(Math.hypot(w.dirX, w.dirZ) - 1) < 0.001);
    }
  });

  it('windVector sends a west wind eastward', () => {
    const v = windVector(270);
    assert.ok(Math.abs(v.x - 1) < 0.001 && Math.abs(v.z) < 0.001);
    assert.equal(windCompass(270), 'W');
    assert.equal(windCompass(315), 'NW');
  });

  it('the wind is a pure function of the clock', () => {
    assert.deepEqual(towerWindAt(T0), towerWindAt(T0));
    assert.notDeepEqual(towerWindAt(T0), towerWindAt(T0 + 30000));
  });

  it('the cloud bank orbits the tower at mid-height, radius breathing with gusts', () => {
    const a = cloudBankAt(T0);
    const b = cloudBankAt(T0);
    assert.deepEqual(a, b);
    for (let k = 0; k < 100; k++) {
      const c = cloudBankAt(T0 + k * 15000);
      const r = Math.hypot(c.x, c.z);
      assert.ok(r >= 319.9 && r <= 400.1, `orbit radius ${r}`);
      assert.ok(c.gust >= 0 && c.gust <= 1);
    }
    assert.equal(CLOUD_BANK_Y, -120);
  });
});

describe('tower life', () => {
  it('six air taxis circle the shaft on the clock, staggered and two-way', () => {
    assert.equal(AIR_TAXI_COUNT, 6);
    assert.equal(AIR_TAXI_COLORS.length, 6);
    const seen = new Set();
    for (let i = 0; i < AIR_TAXI_COUNT; i++) {
      const t = airTaxiFor(i, T0);
      const r = Math.hypot(t.x, t.z - AIR_TAXI_CENTRE_Z);
      assert.ok(r >= 130 && r <= 260, `taxi ${i} radius ${r}`);
      assert.ok(t.y >= -432 && t.y <= 92, `taxi ${i} height ${t.y}`);
      assert.equal(t.color, AIR_TAXI_COLORS[i]);
      assert.equal(typeof t.blink, 'boolean');
      seen.add(`${Math.round(r)}|${Math.round(t.y)}`);
      // Same instant, same taxi — deterministic.
      assert.deepEqual(airTaxiFor(i, T0), t);
      // The taxi moves with the clock.
      assert.notDeepEqual(airTaxiFor(i, T0 + 60000), t);
    }
    // No two taxis share an orbit.
    assert.equal(seen.size, AIR_TAXI_COUNT);
    // Directions alternate: neighbours fly opposite ways.
    const h0 = airTaxiFor(0, T0 + 10000).heading - airTaxiFor(0, T0).heading;
    const h1 = airTaxiFor(1, T0 + 10000).heading - airTaxiFor(1, T0).heading;
    assert.ok(Math.sign(h0) !== Math.sign(h1), 'adjacent taxis fly opposite ways');
  });

  it('the crown beacon pulses 0..1 on the clock', () => {
    for (let k = 0; k < 100; k++) {
      const b = elevatorBeaconAt(T0 + k * 500);
      assert.ok(b >= 0 && b <= 1, `beacon ${b}`);
    }
    assert.equal(elevatorBeaconAt(T0), elevatorBeaconAt(T0));
    assert.notEqual(elevatorBeaconAt(T0), elevatorBeaconAt(T0 + 1300));
  });
});

// ── wiring: the CGI is actually mounted ─────────────────────────

describe('skyscraper CGI wiring', () => {
  it('Exterior wears the city-ground texture on the DRIVE_CityFloor it raycasts', () => {
    assert.ok(exterior.includes("name=\"DRIVE_CityFloor\""));
    assert.ok(exterior.includes("materialForSkyscraper('cityGround'"));
    assert.ok(exterior.includes("material={cityGroundMat}"));
  });

  it('Exterior mounts the tower flanks, air traffic, crown beacon and street lights', () => {
    for (const name of ['<TowerFlanks />', '<AirTraffic />', '<TowerCrownBeacon />']) {
      assert.ok(exterior.includes(name), name);
    }
    assert.ok(exterior.includes("import StreetLights from './StreetLights'"));
    assert.ok(exterior.includes('<StreetLights gridSize={20}'));
    assert.ok(exterior.includes("materialForSkyscraper('towerFacade'"));
    assert.ok(exterior.includes("materialForSkyscraper('plaza'"));
  });

  it('Exterior gives the neighbour towers glass + lit windows and the tree real foliage', () => {
    // The glow-cylinder material (matGlow, transparent 0.3) is
    // gone from the TensegrityBuilding; the plot edge lineMaterial
    // (transparent 0.3 line) is pre-existing and untouched.
    assert.ok(!exterior.includes('const matGlow'), 'glow-cylinder material is gone');
    assert.ok(exterior.includes("materialForSkyscraper('canopy'"));
    assert.ok(exterior.includes("materialForSkyscraper('bark'"));
    // The old wireframe leaf/trunk definitions are gone (wireframe
    // itself stays elsewhere in the file — the hologram signposts
    // are meant to read as holograms).
    assert.ok(!exterior.includes('color: "#39ff14", wireframe: true'));
    assert.ok(!exterior.includes('color: "#1a100a", wireframe: true'));
  });

  it('Exterior drifts the mid-level cloud bank on the Tower wind', () => {
    assert.ok(exterior.includes('cloudBankAt(Date.now())'));
    assert.ok(exterior.includes('windCloudRef'));
  });

  it('SkyCycle mounts the gradient dome + stars and repaints on the SunCalc altitude', () => {
    assert.ok(skyCycle.includes('makeSkyDome()'));
    assert.ok(skyCycle.includes('makeStarField('));
    assert.ok(skyCycle.includes('skyStateFor(sunPos.altitude)'));
    assert.ok(skyCycle.includes('updateSkyDome(skyDome, skyState)'));
    assert.ok(skyCycle.includes('updateStars(starField, skyState)'));
    assert.ok(skyCycle.includes('<primitive object={skyDome} />'));
    assert.ok(skyCycle.includes('<primitive object={starField} />'));
  });

  it('ProceduralRoads wears the textured road strip', () => {
    assert.ok(roads.includes("materialForSkyscraper('road'"));
    assert.ok(roads.includes('material={roadMat}'));
  });

  it('floors 1-3 hang city-view windows on their side walls', () => {
    for (const [name, src] of [['Floor1', floor1], ['Floor2', floor2], ['Floor3', floor3]]) {
      assert.ok(src.includes("import CityViewWindow from './CityViewWindow'"), name);
      assert.ok(src.includes('<CityViewWindow'), name);
    }
    assert.ok(floor1.includes('position={[29.7, 30, 0]}'));
    assert.ok(floor1.includes('position={[-29.7, 30, 0]}'));
    const win = read('components/CityViewWindow.jsx');
    assert.ok(win.includes("materialForSkyscraper('cityView'"));
  });
});

// ── no new real lights ──────────────────────────────────────────

describe('no new real lights', () => {
  it('Exterior still has exactly its original four pointLights and no spot/directional lights', () => {
    const points = (exterior.match(/<pointLight/g) || []).length;
    assert.equal(points, 4, `Exterior pointLights: ${points}`);
    assert.ok(!exterior.includes('<spotLight'));
    assert.ok(!exterior.includes('<directionalLight'));
  });

  it('SkyCycle keeps exactly its original two directional lights (sun + moon)', () => {
    const dirs = (skyCycle.match(/<directionalLight/g) || []).length;
    assert.equal(dirs, 2, `SkyCycle directionalLights: ${dirs}`);
    assert.ok(!skyCycle.includes('<pointLight'));
    assert.ok(!skyCycle.includes('<spotLight'));
  });

  it('the new CityViewWindow and ProceduralRoads add no lights at all', () => {
    const win = read('components/CityViewWindow.jsx');
    assert.ok(!/<(point|spot|directional)Light/.test(win));
    assert.ok(!/<(point|spot|directional)Light/.test(roads));
  });
});

// ── mechanics still wired ───────────────────────────────────────

describe('mechanics preserved', () => {
  it('portal warps, elevator and floor navigation are untouched', () => {
    assert.ok(exterior.includes('PORTAL_Respawn'));
    assert.ok(exterior.includes('PORTAL_WarpB'));
    assert.ok(nexus.includes("portalHit.object.name === 'PORTAL_Respawn'"));
    assert.ok(nexus.includes("portalHit.object.name === 'PORTAL_WarpB'"));
    assert.ok(nexus.includes("setAnimState('PULLING_IN')") || read('components/Elevator.jsx').includes("setAnimState('PULLING_IN')"));
    assert.ok(read('components/FloorLoader.jsx').includes('import(`./Floor${currentFloor}`)'));
    assert.ok(read('components/FloorMenu.jsx').includes('Array.from({ length: 200 }'));
    assert.ok(exterior.includes("setCurrentFloor(1)"), 'ascension portal still goes to floor 1');
    assert.ok(exterior.includes('PORTAL_Ascend'));
    assert.ok(exterior.includes('PORTAL_Descend'));
  });

  it('every plot portal name the engine and map rely on is still rendered', () => {
    for (const name of ['PORTAL_Billboards', 'PORTAL_Forest', 'PORTAL_Dragon', 'PORTAL_Hamunaptra',
      'PORTAL_Colosseum', 'PORTAL_SaberRed', 'PORTAL_SaberBlue', 'PORTAL_Hoodie',
      'PORTAL_Vortex', 'PORTAL_Hermes', 'PORTAL_Excalibur', 'PORTAL_Miles',
      'PORTAL_Restricted', 'PORTAL_Arch']) {
      assert.ok(exterior.includes(name), name);
    }
  });

  it('Floor3 keeps its pillar puzzle (sequence, button, scan, vortex)', () => {
    assert.ok(floor3.includes('CORRECT_SEQUENCE = [1, 2, 0]'));
    assert.ok(floor3.includes('handlePillarClick'));
    assert.ok(floor3.includes('handleButtonClick'));
    assert.ok(floor3.includes('animateScan'));
  });

  it('Floor1 keeps its holo portal + vortex exit, Floor2 its proximity portal', () => {
    assert.ok(floor1.includes('VortexExit'));
    assert.ok(floor1.includes('HoloPortal'));
    assert.ok(floor2.includes("dist < 20 && !isActive"));
  });
});

console.log('skyscraper-cgi suite loaded');
