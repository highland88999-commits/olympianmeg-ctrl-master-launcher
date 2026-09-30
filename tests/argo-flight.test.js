// tests/argo-flight.test.js — Headless tests for the ARGO pocket universe.
// Run: node tests/argo-flight.test.js (from the repo root).
// No browser, no network — asserts on lib/argo-flight.js math plus
// source-level checks (menu registration, honesty labels, no telemetry).
import { readFileSync } from 'fs';
import {
  ECEF_EARTH_RADIUS_M,
  HUB_EARTH_RADIUS,
  CRUISE_ALTITUDE_M,
  DESTINATIONS,
  HOME_KEY,
  destinationByKey,
  latLonToHub,
  hubUnit,
  angleBetween,
  slerpUnit,
  easeInOut,
  flightDuration,
  flightPosition,
  parkedPosition,
} from '../lib/argo-flight.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
function approx(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}
const D2R = Math.PI / 180;

// --- latLonToHub: poles, meridian, known city ---
{
  const np = latLonToHub(90, 0, 0);
  t('north pole -> +Y axis', approx(np.x, 0) && approx(np.y, 55) && approx(np.z, 0));

  const sp = latLonToHub(-90, 123, 0);
  t('south pole -> -Y axis', approx(sp.x, 0, 1e-4) && approx(sp.y, -55) && approx(sp.z, 0, 1e-4));

  const pm = latLonToHub(0, 0, 0);
  t('prime meridian equator -> +X', approx(pm.x, 55) && approx(pm.y, 0) && approx(pm.z, 0));

  const e90 = latLonToHub(0, 90, 0);
  t('90E equator -> -Z', approx(e90.x, 0) && approx(e90.y, 0) && approx(e90.z, -55));

  const w90 = latLonToHub(0, -90, 0);
  t('90W equator -> +Z', approx(w90.x, 0) && approx(w90.y, 0) && approx(w90.z, 55));

  // Edmonton: |pos| == 55 at h=0, y == 55*sin(lat)
  const ed = latLonToHub(53.5461, -113.4938, 0);
  t('Edmonton radius == 55', approx(Math.hypot(ed.x, ed.y, ed.z), 55, 1e-6));
  t('Edmonton y == 55*sin(lat)', approx(ed.y, 55 * Math.sin(53.5461 * D2R), 1e-6));
  t('Edmonton x negative (western hemisphere)', ed.x < 0);
  t('Edmonton z positive', ed.z > 0);

  // Altitude scaling: k = 55*(R+h)/R
  const hi = latLonToHub(0, 0, CRUISE_ALTITUDE_M);
  const k = (55 * (ECEF_EARTH_RADIUS_M + CRUISE_ALTITUDE_M)) / ECEF_EARTH_RADIUS_M;
  t('cruise altitude scales radius', approx(hi.x, k, 1e-6));
  t('cruise k ≈ 57.59', k > 57.5 && k < 57.7);
}

// --- hubUnit / angleBetween ---
{
  const a = hubUnit(0, 0);
  t('hubUnit is unit length', approx(Math.hypot(a.x, a.y, a.z), 1, 1e-9));
  t('angleBetween identical == 0', approx(angleBetween(a, a), 0, 1e-9));
  const anti = { x: -a.x, y: -a.y, z: -a.z };
  t('angleBetween antipodal == PI', approx(angleBetween(a, anti), Math.PI, 1e-9));
  const ed = hubUnit(53.5461, -113.4938);
  const paris = hubUnit(48.8566, 2.3522);
  const edParis = angleBetween(ed, paris);
  t('Edmonton-Paris angle sane (0.9..1.3 rad)', edParis > 0.9 && edParis < 1.3);
}

// --- slerpUnit ---
{
  const a = { x: 1, y: 0, z: 0 };
  const b = { x: 0, y: 1, z: 0 };
  const s0 = slerpUnit(a, b, 0);
  t('slerp t=0 == a', approx(s0.x, 1) && approx(s0.y, 0) && approx(s0.z, 0));
  const s1 = slerpUnit(a, b, 1);
  t('slerp t=1 == b', approx(s1.x, 0) && approx(s1.y, 1) && approx(s1.z, 0));
  const mid = slerpUnit(a, b, 0.5);
  const h = Math.SQRT1_2;
  t('slerp midpoint 45°', approx(mid.x, h, 1e-9) && approx(mid.y, h, 1e-9) && approx(mid.z, 0, 1e-9));
  t('slerp keeps unit length', approx(Math.hypot(mid.x, mid.y, mid.z), 1, 1e-9));
  const q = slerpUnit(a, b, 0.25);
  t('slerp t=0.25 before midpoint', q.x > mid.x && q.y < mid.y);
  const anti = slerpUnit(a, { x: -1, y: 0, z: 0 }, 0.5);
  t('slerp antipodal no NaN, unit length',
    Number.isFinite(anti.x + anti.y + anti.z) && approx(Math.hypot(anti.x, anti.y, anti.z), 1, 1e-9));
}

// --- easeInOut / flightDuration ---
{
  t('ease(0)=0', easeInOut(0) === 0);
  t('ease(1)=1', easeInOut(1) === 1);
  t('ease(0.5)=0.5', approx(easeInOut(0.5), 0.5));
  t('ease monotonic', easeInOut(0.25) < easeInOut(0.5) && easeInOut(0.5) < easeInOut(0.75));
  t('duration floor 4s at angle 0', flightDuration(0) === 4);
  t('duration cap 24s at angle PI', flightDuration(Math.PI) === 24);
  t('duration proportional', flightDuration(Math.PI / 2) === 14);
  t('duration clamps huge angles', flightDuration(10) === 24);
}

// --- flightPosition / parkedPosition ---
{
  const p0 = flightPosition('edmonton', 'paris', 0);
  const park = parkedPosition('edmonton');
  t('flight t=0 == parked origin',
    approx(p0.x, park.x, 1e-9) && approx(p0.y, park.y, 1e-9) && approx(p0.z, park.z, 1e-9));
  const p1 = flightPosition('edmonton', 'paris', 1);
  const parkParis = parkedPosition('paris');
  t('flight t=1 == parked destination',
    approx(p1.x, parkParis.x, 1e-9) && approx(p1.y, parkParis.y, 1e-9) && approx(p1.z, parkParis.z, 1e-9));
  const mid = flightPosition('edmonton', 'paris', 0.5);
  const k = (55 * (ECEF_EARTH_RADIUS_M + CRUISE_ALTITUDE_M)) / ECEF_EARTH_RADIUS_M;
  t('flight holds cruise altitude', approx(Math.hypot(mid.x, mid.y, mid.z), k, 1e-6));
  t('flightPosition bad keys -> null', flightPosition('nope', 'paris', 0.5) === null);
}

// --- destination list validity ---
{
  t('8 destinations', DESTINATIONS.length === 8);
  t('Edmonton first, marked home', DESTINATIONS[0].key === HOME_KEY && /home/i.test(DESTINATIONS[0].note));
  const keys = DESTINATIONS.map((d) => d.key);
  t('keys unique', new Set(keys).size === keys.length);
  t('all lat/lon in range',
    DESTINATIONS.every((d) => d.lat >= -90 && d.lat <= 90 && d.lon >= -180 && d.lon <= 180));
  t('all have name + note', DESTINATIONS.every((d) => d.name && d.note));
  const wanted = ['paris', 'tokyo', 'new-york', 'sydney', 'giza', 'rio', 'london'];
  t('required cities present', wanted.every((k) => keys.includes(k)));
  t('destinationByKey unknown -> null', destinationByKey('atlantis') === null);
}

// --- source-level checks: registration, honesty, no telemetry ---
{
  const registry = readFileSync('lib/i18n/satellites.ts', 'utf8');
  t('registry has argo entry (exact format)',
    registry.includes('{ key: "argo", route: "/argo", pos: "HERMES", section: "OBSERVATORY", constellation: "ARGUS" }'));
  const en = readFileSync('lib/i18n/locales/en.json', 'utf8');
  t('en locale has sat.argo.title', en.includes('"sat.argo.title": "Argo"'));
  t('en locale has sat.argo.subtitle', en.includes('"sat.argo.subtitle"'));
  for (const lang of ['de', 'el', 'es', 'fr', 'it', 'pt']) {
    const loc = readFileSync(`lib/i18n/locales/${lang}.json`, 'utf8');
    if (!loc.includes('"sat.argo.title"')) {
      failed++;
      console.error(`FAIL: ${lang} locale missing sat.argo.title`);
    } else { passed++; }
  }

  const page = readFileSync('app/argo/page.jsx', 'utf8');
  const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  t('no central_telemetry', !/central_telemetry/.test(code));
  t('no phone-home code', !/phone.?home/i.test(code));
  t('no third-party fetch', !/fetch\(/.test(code));
  t('no supabase', !/supabase/i.test(code));
  t('honest photorealistic label', /Photorealistic · Google/.test(page));
  t('honest stylized fallback label', /Stylized Earth — photorealistic tiles unavailable/.test(page));
  t('reduced-motion jump cut', /prefers-reduced-motion/.test(page));
  t('safari bottom clearance', /safe-area-inset-bottom/.test(page));
  t('touch targets >= 44px', /min-h-\[44px\]/.test(page));

  const flight = readFileSync('lib/argo-flight.js', 'utf8');
  const fcode = flight.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  t('flight lib: no fetch', !/fetch\(/.test(fcode));
  t('flight lib: no telemetry', !/telemetry|analytics|phone/i.test(fcode));

  const veh = readFileSync('components/argo/VehicleArchetypes.jsx', 'utf8');
  const vcode = veh.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  t('5 archetypes ported',
    /SkiffArchetype/.test(veh) && /CruiserArchetype/.test(veh) && /HaulerArchetype/.test(veh) &&
    /TitanArchetype/.test(veh) && /DartArchetype/.test(veh));
  t('vehicles: no telemetry', !/telemetry|phone.?home|fetch\(/i.test(vcode));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
