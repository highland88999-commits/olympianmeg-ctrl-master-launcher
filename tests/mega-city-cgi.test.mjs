// tests/mega-city-cgi.test.mjs — Headless tests for the Mega City CGI makeover.
// Run: node tests/mega-city-cgi.test.mjs (from the repo root).
// Pins the CGI layer (lib/gta/city-cgi.js): seeded facade / water maps,
// sky + wind + rain on the real clock, traffic + pedestrian operators as
// pure functions of (place, kind, clock), shared vehicle builders — and
// that every mechanic (missions, wanted, subway, driving) is still wired
// and no new real light was added. No browser, no network.
// app/mega-city/city.js is covered by source-level checks only: it uses
// the '@/...' alias, which plain node cannot resolve.
import { readFileSync } from 'fs';
import * as THREE from 'three';
import {
  facadeMaps, materialForFacade, facadeKindForDistrict, FACADE_KINDS,
  HARBOR_WATER, waterMaps, buildHarborWater,
  CITY_SKY, skyDayness, skyPalette,
  buildSkyDome, buildSunSprite, buildMoonSprite, buildSunDisc, buildMoonDisc,
  MOON_DISC_RADIUS, MOON_DISC_FALLBACK_COLOR, buildStars, buildClouds,
  cloudAngle,
  CITY_WIND_BEARING_DEG, CITY_WIND_VEER_DEG, CITY_WIND_GUST_MIN_MPS,
  CITY_WIND_GUST_MAX_MPS, cityWindAt,
  makeRainField, updateRainField, CITY_RAIN_COUNT,
  TRAFFIC_COUNT, TRAFFIC_ROAD_CENTERS, TRAFFIC_TYPES, trafficCarFor,
  PEDESTRIAN_COUNT, PEDESTRIAN_RING_HALF, pedestrianFor,
  buildVehicleMesh, buildCopMesh, copFlashAt, buildPedestrianMesh,
  neonSignPlacements, NEON_LABELS,
} from '../lib/gta/city-cgi.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}
const approx = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const T0 = Date.UTC(2026, 0, 15, 1, 0, 0); // noon Sydney
const T1 = T0 + 10_000;

// --- facades: seeded colour + bump + emissive maps ---
{
  const maps = facadeMaps('glass', 1337);
  t('facade: colour map is a 256 DataTexture', maps.map instanceof THREE.DataTexture && maps.map.image.width === 256);
  t('facade: bump map present', maps.bumpMap instanceof THREE.DataTexture);
  t('facade: emissive map present', maps.emissiveMap instanceof THREE.DataTexture);
  t('facade: 160 windows in the grid', maps.windowCount === 8 * 20);
  t('facade: some windows lit, some dark', maps.litCount > 10 && maps.litCount < maps.windowCount - 10);
  t('facade: emissive map has lit and black pixels', (() => {
    const d = maps.emissiveMap.image.data;
    let lit = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i] > 0) lit++; else dark++; }
    return lit > 1000 && dark > 10000;
  })());
  t('facade: cached per kind+seed', facadeMaps('glass', 1337) === maps);
  t('facade: unknown kind falls back to slab', facadeMaps('nope', 7) === facadeMaps('slab', 7));
  t('facade: every kind has maps', Object.keys(FACADE_KINDS).every((k) => facadeMaps(k, 1).windowCount === 160));
  const mat = materialForFacade('glass', 1337);
  t('facade: material carries emissiveMap', mat.emissiveMap === maps.emissiveMap);
  t('facade: emissive starts off (scene drives it by night)', mat.emissiveIntensity === 0);
  t('facade: material cached', materialForFacade('glass', 1337) === mat);
  t('facade: downtown is glass', facadeKindForDistrict('downtown') === 'glass');
  t('facade: harbor is brick', facadeKindForDistrict('harbor') === 'brick');
  t('facade: industrial is industrial', facadeKindForDistrict('industrial') === 'industrial');
  t('facade: residential + unknown read as slab', facadeKindForDistrict('residential') === 'slab' && facadeKindForDistrict('zzz') === 'slab');
}

// --- harbour water: the flag finally means water ---
t('harbor: water sits on the harbor district', HARBOR_WATER.x === -180 && HARBOR_WATER.z === 140 && HARBOR_WATER.r === 50);
{
  const w = buildHarborWater();
  t('harbor: water mesh is a 50 m circle at the harbor', w.geometry.parameters.radius === 50 && w.position.x === -180 && w.position.z === 140);
  t('harbor: water maps cached', waterMaps(1337) === waterMaps(1337));
}

// --- sky: the scene's own 10-minute cycle, painted ---
// The scene's law is dayness = max(0, sin(timeOfDay * 2π)): noon
// at 0.25, night from 0.5 to 1.0 (the old "0.5 = noon" comment was
// never true of the code — this pins the code, not the comment).
t('sky: noon is full day', skyDayness(0.25) === 1);
t('sky: midnight is full night', skyDayness(0) === 0 && skyDayness(0.75) === 0);
t('sky: dayness in [0,1] everywhere', [0, 0.1, 0.25, 0.4, 0.6, 0.9].every((v) => skyDayness(v) >= 0 && skyDayness(v) <= 1));
t('sky: day palette is the day sky', skyPalette(1).top === CITY_SKY.day.top && skyPalette(1).horizon === CITY_SKY.day.horizon);
t('sky: night palette is the night sky', skyPalette(0).top === CITY_SKY.night.top);
t('sky: dusk sits between day and night', skyPalette(0.5).top !== CITY_SKY.day.top && skyPalette(0.5).top !== CITY_SKY.night.top);
{
  const dome = buildSkyDome();
  t('sky: dome is a backside gradient sphere', dome.material.side === THREE.BackSide && dome.geometry.getAttribute('color') !== undefined);
  t('sky: dome ignores fog and depth write', dome.material.fog === false && dome.material.depthWrite === false);
  const sun = buildSunSprite();
  t('sky: sun is an additive sprite', sun.material.blending === THREE.AdditiveBlending);
  const sunDisc = buildSunDisc();
  t('sky: sun core is a small solid-disc additive sprite', sunDisc.isSprite && sunDisc.scale.x === 28 && sunDisc.material.blending === THREE.AdditiveBlending);
  t('sky: sun core wears the sun colour', sunDisc.material.color.getHex() === CITY_SKY.sunColor);
  const moon = buildMoonSprite();
  t('sky: moon sprite placed high', moon.position.y > 300);
  const moonDisc = buildMoonDisc();
  t('sky: moon is a photo sphere, not a flat disc', moonDisc.isMesh && moonDisc.geometry.type === 'SphereGeometry' && moonDisc.geometry.parameters.radius === MOON_DISC_RADIUS);
  t('sky: moon sphere rides the sprite perch', moonDisc.position.equals(moon.position));
  t('sky: moon sphere falls back pale without a document', moonDisc.material.color.getHex() === MOON_DISC_FALLBACK_COLOR);
  const stars = buildStars();
  t('sky: 240 stars, starting dark', stars.geometry.getAttribute('position').count === 240 && stars.material.opacity === 0);
  const clouds = buildClouds();
  t('sky: 10 cloud billboards on a ring', clouds.children.length === 10 && clouds.userData.driftRate === 0.004);
  t('sky: cloud angle is pure clock + moves', cloudAngle(T0) === cloudAngle(T0) && cloudAngle(T0) !== cloudAngle(T1));
}

// --- wind + rain ---
{
  const wA = cityWindAt(T0);
  t('wind: deterministic', cityWindAt(T0).speed === wA.speed && cityWindAt(T0).bearingDeg === wA.bearingDeg);
  t('wind: speed in the gust range', wA.speed >= CITY_WIND_GUST_MIN_MPS && wA.speed <= CITY_WIND_GUST_MAX_MPS);
  t('wind: bearing veers around west', Math.abs(wA.bearingDeg - CITY_WIND_BEARING_DEG) <= CITY_WIND_VEER_DEG + 0.01);
  t('wind: gust is 0..1', wA.gust >= 0 && wA.gust <= 1);
  t('wind: moves over time', cityWindAt(T0).speed !== cityWindAt(T0 + 23_000).speed || cityWindAt(T0).bearingDeg !== cityWindAt(T0 + 23_000).bearingDeg);
  const rain = makeRainField();
  t('rain: 320 drops', rain.geometry.getAttribute('position').count === CITY_RAIN_COUNT);
  const before = Float32Array.from(rain.geometry.getAttribute('position').array);
  updateRainField(rain, T0);
  const mid = Float32Array.from(rain.geometry.getAttribute('position').array);
  t('rain: falls with the clock', !mid.every((v, i) => v === before[i]));
  updateRainField(rain, T0);
  const again = rain.geometry.getAttribute('position').array;
  t('rain: same instant, same sky', again.every((v, i) => v === mid[i]));
  t('rain: drops stay inside the field height', (() => {
    for (let i = 1; i < again.length; i += 3) if (again[i] < 0 || again[i] > 18) return false;
    return true;
  })());
}

// --- traffic operator: pure function of (index, clock) ---
{
  const a = trafficCarFor(3, T0);
  t('traffic: deterministic', trafficCarFor(3, T0).x === a.x && trafficCarFor(3, T0).z === a.z);
  t('traffic: moves with the clock', trafficCarFor(3, T0).x !== trafficCarFor(3, T1).x || trafficCarFor(3, T0).z !== trafficCarFor(3, T1).z);
  t('traffic: speed 8..16 m/s', a.speed >= 8 && a.speed <= 16);
  t('traffic: type is a real vehicle type', TRAFFIC_TYPES.includes(a.type));
  t('traffic: heading matches travel direction', (() => {
    const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
    if (a.axis === 'x') return approx(Math.abs(fx), 1) && approx(fz, 0) && Math.sign(fx) === a.dir;
    return approx(Math.abs(fz), 1) && approx(fx, 0) && Math.sign(fz) === a.dir;
  })());
  t('traffic: all 14 cars inside the city on road lanes', (() => {
    for (let i = 0; i < TRAFFIC_COUNT; i++) {
      const c = trafficCarFor(i, T0);
      if (Math.abs(c.x) > 300 || Math.abs(c.z) > 300) return false;
      // The cross-axis coordinate is a road centre ± the 3.2 m lane offset.
      const cross = c.axis === 'x' ? c.z : c.x;
      const onLane = TRAFFIC_ROAD_CENTERS.some((r) => approx(Math.abs(cross - r), 3.2, 0.01));
      if (!onLane) return false;
    }
    return true;
  })());
}

// --- pedestrian operator: pure function of (index, clock) ---
{
  const p = pedestrianFor(5, T0);
  t('peds: deterministic', pedestrianFor(5, T0).x === p.x && pedestrianFor(5, T0).z === p.z);
  t('peds: walks with the clock', pedestrianFor(5, T0).x !== pedestrianFor(5, T1).x || pedestrianFor(5, T0).z !== pedestrianFor(5, T1).z);
  t('peds: bob is -1..1', p.bob >= -1 && p.bob <= 1);
  t('peds: heading is a compass direction', [0, Math.PI / 2, -Math.PI / 2, Math.PI].includes(p.heading));
  t('peds: all 18 walk the sidewalk ring of a block', (() => {
    for (let i = 0; i < PEDESTRIAN_COUNT; i++) {
      const q = pedestrianFor(i, T0);
      const onRing = approx(Math.abs(q.x - q.blockX), PEDESTRIAN_RING_HALF, 0.01)
        || approx(Math.abs(q.z - q.blockZ), PEDESTRIAN_RING_HALF, 0.01);
      if (!onRing || Math.abs(q.x) > 300 || Math.abs(q.z) > 300) return false;
    }
    return true;
  })());
}

// --- shared vehicle + pedestrian meshes ---
{
  const sedan = buildVehicleMesh('sedan', 0xdc2626);
  t('vehicle: 4 spinning wheels', sedan.userData.wheels.length === 4);
  t('vehicle: head + tail lamp materials', !!sedan.userData.lampMats.head && !!sedan.userData.lampMats.tail);
  t('vehicle: headlights are emissive', sedan.userData.lampMats.head.emissiveIntensity > 0);
  const truck = buildVehicleMesh('truck', 0x6b7280);
  t('vehicle: truck carries a cargo box', truck.children.length === sedan.children.length + 1);
  const taxi = buildVehicleMesh('taxi', 0xf59e0b);
  t('vehicle: taxi carries a roof sign', taxi.children.length === sedan.children.length + 1);
  const cop = buildCopMesh();
  t('cop: red + blue lightbar mats', !!cop.userData.lightbar.red && !!cop.userData.lightbar.blue);
  t('cop: flash alternates on the clock', copFlashAt(T0) !== copFlashAt(T0 + 400) || copFlashAt(T0) !== copFlashAt(T0 + 700));
  t('cop: flash is deterministic', copFlashAt(T0) === copFlashAt(T0));
  const ped = buildPedestrianMesh(0x1e3a5f);
  t('ped: legs swing on refs', !!ped.userData.legs.left && !!ped.userData.legs.right);
}

// --- neon signs sit on real towers, never in thin air ---
{
  const fake = [
    { x: 0, z: 0, w: 20, d: 20, h: 120 },
    { x: 60, z: 0, w: 18, d: 18, h: 90 },
    { x: 0, z: 60, w: 16, d: 16, h: 40 }, // too short — no sign
    { x: -60, z: -60, w: 22, d: 22, h: 160 },
  ];
  const signs = neonSignPlacements(fake, 6);
  t('neon: short towers get no sign', signs.length === 3);
  t('neon: sign sits proud of the south face at 55% height', signs.every((s) => {
    const b = fake.find((f) => f.x === s.x && Math.abs(s.z - (f.z + f.d / 2 + 0.3)) < 1e-6);
    return b && approx(s.y, b.h * 0.55) && s.y < b.h;
  }));
  t('neon: labels come from the list', signs.every((s) => NEON_LABELS.includes(s.label)));
  t('neon: deterministic', neonSignPlacements(fake, 6)[0].label === signs[0].label);
}

// --- source checks: the scene wiring + the bans ---
{
  const scene = readFileSync('app/mega-city/gta-scene.js', 'utf8');
  const stripped = scene.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  t('scene: imports the CGI layer', /lib\/gta\/city-cgi\.js/.test(scene));
  t('scene: builds the sky dome + sun + stars + clouds', /buildSkyDome\(\)/.test(stripped) && /buildSunSprite\(\)/.test(stripped) && /buildStars\(\)/.test(stripped) && /buildClouds\(\)/.test(stripped));
  t('scene: sun core disc + photo moon disc ride the sprites', /buildSunDisc\(\)/.test(stripped) && /buildMoonDisc\(\)/.test(stripped) && /sunDisc\.position\.copy\(sunSprite\.position\)/.test(stripped) && /moonDisc\.position\.copy\(moonSprite\.position\)/.test(stripped));
  t('scene: builds the harbor water', /buildHarborWater\(\)/.test(stripped));
  t('scene: drives traffic + pedestrians from the operators', /trafficCarFor\(i, now\)/.test(stripped) && /pedestrianFor\(i, now\)/.test(stripped));
  t('scene: rain follows the player', /updateRainField\(rain, now\)/.test(stripped) && /rain\.position\.set\(player\.x/.test(stripped));
  t('scene: facades glow by night, no new light', /emissiveIntensity = 0\.05 \+ night/.test(stripped));
  t('scene: cop lightbar flashes', /copFlashAt\(now\)/.test(stripped));
  t('scene: exactly one PointLight — the pre-existing train light', (scene.match(/PointLight/g) || []).length === 1);
  t('scene: no SpotLight anywhere', !/SpotLight/.test(scene));
  t('scene: mechanics still wired — missions', /createMission/.test(scene) && /MEGA_CITY_MISSIONS/.test(scene) && /updateMission/.test(scene));
  t('scene: mechanics still wired — wanted + cops', /createWanted/.test(scene) && /commitCrime/.test(scene) && /updateCop/.test(scene) && /checkBusted/.test(scene));
  t('scene: mechanics still wired — driving', /createVehicle/.test(scene) && /updateVehicle/.test(scene) && /enterVehicle/.test(scene) && /exitVehicle/.test(scene));
  t('scene: mechanics still wired — subway', /createSubway/.test(scene) && /updateSubway/.test(scene) && /subwayPos/.test(scene));
  t('scene: no SQL in the scene', !/supabase|INSERT INTO|CREATE TABLE/i.test(scene));

  const city = readFileSync('app/mega-city/city.js', 'utf8');
  t('city: buildings carry their district', /district: districtId/.test(city));
  t('city: ground has crosswalks', /Crosswalks/.test(city));
  t('city: ground has wear + oil + manholes', /Oil stains/.test(city) && /Manholes/.test(city) && /Wear patches/.test(city));
  t('city: streetlights return emissive heads', /headMat/.test(city) && /heads, headMat/.test(city));
  t('city: mesh builder uses facade materials', /materialForFacade\(kind, 1337\)/.test(city));

  const cgi = readFileSync('lib/gta/city-cgi.js', 'utf8');
  t('cgi: no SQL in the CGI layer', !/supabase|INSERT INTO|CREATE TABLE/i.test(cgi));
  t('cgi: no new real lights in the CGI layer', !/PointLight|SpotLight|DirectionalLight/.test(cgi));

  const babel = readFileSync('app/babel/gta-scene.js', 'utf8');
  t('babel: uses the shared vehicle builder', /buildVehicleMesh\(/.test(babel) && /buildCopMesh\(\)/.test(babel));
  t('babel: uses the shared facade material', /materialForFacade\('slab', 2026\)/.test(babel));
  t('babel: cop lightbar flashes', /copFlashAt\(now\)/.test(babel));
  t('babel: vault door logic untouched', /VAULT_DOOR/.test(babel) && /vault_enter/.test(babel));
  t('babel: no new lights added', !/PointLight|SpotLight/.test(babel));
  t('babel: mechanics still wired', /BABEL_MISSIONS/.test(babel) && /createWanted/.test(babel) && /enterVehicle/.test(babel));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
