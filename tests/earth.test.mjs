// tests/earth.test.mjs
// Headless tests for the explorable Nexus Earth. Run: node tests/earth.test.mjs
// (from the repo root). No browser, no network — pure geo math + source wiring.
import { readFileSync } from 'fs';
import {
  latLonToVec3, latLonToTile, esriTileUrl, tileGrid,
  easeInOutCubic, formatCoords, FALLBACK_POSITION,
} from '../lib/geo.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// --- latLonToVec3 ---
let p = latLonToVec3(0, 0, 55);
t('prime meridian/equator -> +X', approx(p.x, 55) && approx(p.y, 0) && approx(p.z, 0, 1e-4));
p = latLonToVec3(90, 0, 55);
t('north pole -> +Y', approx(p.x, 0, 1e-4) && approx(p.y, 55) && approx(p.z, 0, 1e-4));
p = latLonToVec3(-90, 20, 55);
t('south pole -> -Y', approx(p.y, -55));
p = latLonToVec3(0, 180, 55);
t('antimeridian -> -X', approx(p.x, -55) && approx(p.y, 0, 1e-4));
p = latLonToVec3(53.5462, -113.4912, 55);
t('Edmonton lies on the sphere', approx(Math.hypot(p.x, p.y, p.z), 55, 1e-6));
t('Edmonton is in the northern/western hemisphere', p.y > 0);

// --- tile math ---
let tl = latLonToTile(0, 0, 0);
t('zoom 0 is a single tile', tl.x === 0 && tl.y === 0 && tl.z === 0);
tl = latLonToTile(53.5462, -113.4912, 8);
t('Edmonton tile at z8', tl.x === 47 && tl.y === 82 && tl.z === 8);
t('ESRI URL format', esriTileUrl(47, 82, 8) ===
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/8/82/47');
const grid = tileGrid(53.5462, -113.4912, 8, 6);
t('6x6 tile grid = 36 tiles', grid.length === 36);
t('grid tiles carry ESRI urls', grid.every((g) => g.url.startsWith('https://server.arcgisonline.com/')));
t('grid is centered on the focus tile', grid.some((g) => g.x === 47 && g.y === 82));

// --- easing & formatting ---
t('ease(0)=0, ease(1)=1, ease(0.5)=0.5', easeInOutCubic(0) === 0 && easeInOutCubic(1) === 1 && approx(easeInOutCubic(0.5), 0.5));
t('ease is monotonic', easeInOutCubic(0.25) < easeInOutCubic(0.75));
t('formatCoords', formatCoords(53.5462, -113.4912) === '53.55°N 113.49°W');
t('fallback position is Edmonton', FALLBACK_POSITION.lat === 53.5462);

// --- wiring: components exist and are connected ---
const page = readFileSync('app/page.jsx', 'utf8');
// Phase 2b (2026-09-30): the home 3D scene was code-split out of app/page.jsx
// into components/HomeScene.jsx. Scene-wiring assertions read the scene file.
const homeScene = readFileSync('components/HomeScene.jsx', 'utf8');
const nexus = readFileSync('components/NexusEarth.jsx', 'utf8');
const terrainGlobe = readFileSync('components/ProceduralEarthGlobe.jsx', 'utf8');
const flight = readFileSync('components/EarthFlightController.jsx', 'utf8');
const console_ = readFileSync('components/EarthConsole.jsx', 'utf8');

t('page imports NexusEarth', /import NexusEarth/.test(homeScene));
t('page imports EarthFlightController', /import EarthFlightController/.test(homeScene));
t('page imports EarthConsole', /import EarthConsole/.test(page));
t('page renders NexusEarth with onSelect', /<NexusEarth[\s\S]*?onSelect/.test(homeScene));
t('page renders flight controller', /<EarthFlightController/.test(homeScene));
t('page renders console in earth states', /diving_to_earth.*earth_surface.*earth_travel/.test(page));
t('page has tap hint', /earth\.tapHint/.test(page));
t('dive/travel/return handlers defined', /beginEarthDive/.test(page) && /travelToEarth/.test(page) && /returnToOrbit/.test(page));
t('geolocation with fallback', /getUserPosition/.test(page) && /FALLBACK_POSITION/.test(page));

// Clickability lives in the terrain globe (the always-3D fallback); NexusEarth
// passes onSelect through to it.
t('earth is clickable', /onSelect/.test(nexus) && /onClick=/.test(terrainGlobe) && /onSelect/.test(terrainGlobe));
t('earth uses shared quaternion (treadmill)', /quatRef/.test(nexus));
t('earth builds real-imagery lens', /tileGrid/.test(nexus) && /CanvasTexture/.test(nexus));
t('earth lens positioned by lat/lon', /latLonToVec3/.test(nexus));
t('old inline EarthBackground removed', !/function EarthBackground/.test(page));

t('flight handles dive', /diving_to_earth/.test(flight));
t('flight rotates world to destination (treadmill)', /setFromUnitVectors/.test(flight) && /slerpQuaternions/.test(flight));
t('flight handles surface + return', /earth_surface/.test(flight) && /returning_to_orbit/.test(flight));
t('flight lets user look around at surface', /lookDeltaX/.test(flight));

t('console has search + quick destinations + return', /searchPlaces/.test(console_) && /QUICK/.test(console_) && /onReturn/.test(console_));

// --- i18n coverage for earth keys ---
const locales = ['en', 'el', 'es', 'fr', 'de', 'pt', 'it'];
const earthKeys = ['earth.tapHint', 'earth.consoleTitle', 'earth.searchPlaceholder', 'earth.returnToOrbit', 'earth.locating', 'earth.traveling', 'earth.yourLocation'];
for (const code of locales) {
  const d = JSON.parse(readFileSync(`lib/i18n/locales/${code}.json`, 'utf8'));
  t(`${code}: all earth keys present`, earthKeys.every((k) => d[k] && String(d[k]).trim()));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
