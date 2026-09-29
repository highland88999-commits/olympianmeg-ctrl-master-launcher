// tests/mega-city.test.mjs — Headless tests for the Mega City pocket universe.
// Run: node tests/mega-city.test.mjs (from the repo root).
// No browser, no network — asserts on the subway math in app/mega-city/scene.js
// plus source-level checks (underground line, opening doors, no level crossings).
import { readFileSync } from 'fs';
import {
  SUBWAY,
  SUBWAY_PERIOD,
  subwayAhead,
  subwayNextStation,
  subwayBrakeDistance,
  subwayDoorOpen,
  subwayTrainLength,
  createSubwayState,
  updateSubway,
  clamp,
  skyAt,
  timeLabel,
  HOTSPOTS,
  DISTRICTS,
} from '../app/mega-city/scene.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}
const approx = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// --- pure math: subwayAhead ---
t('ahead: simple forward distance', subwayAhead(800, 350) === 450);
t('ahead: wraps past the period', approx(subwayAhead(350, 1500), SUBWAY_PERIOD - 1150));
t('ahead: zero when equal', subwayAhead(800, 800) === 0);
t('ahead: always in [0, period)', (() => {
  for (const x of [-500, 0, 350, 900, 1600, 2400]) {
    const d = subwayAhead(800, x);
    if (!(d >= 0 && d < SUBWAY_PERIOD)) return false;
  }
  return true;
})());

// --- pure math: subwayNextStation ---
t('next station ahead', subwayNextStation(0, SUBWAY.stations) === 0);
t('next station between stops', subwayNextStation(400, SUBWAY.stations) === 1);
t('next station wraps after last', subwayNextStation(1300, SUBWAY.stations) === 0);
t('next station skips a station just passed', subwayNextStation(351, SUBWAY.stations) === 1);

// --- pure math: braking ---
t('brake distance v=150', approx(subwayBrakeDistance(150, SUBWAY.brake), 150 * 150 / (2 * SUBWAY.brake)));
t('brake distance zero at rest', subwayBrakeDistance(0, SUBWAY.brake) === 0);
t('brake distance grows with speed', subwayBrakeDistance(150, 130) > subwayBrakeDistance(75, 130));

// --- pure math: doors ---
t('doors closed before dwell', subwayDoorOpen(-1, 3.4, 0.7) === 0);
t('doors opening ramp', approx(subwayDoorOpen(0.35, 3.4, 0.7), 0.5));
t('doors fully open mid-dwell', subwayDoorOpen(1.7, 3.4, 0.7) === 1);
t('doors closing ramp', approx(subwayDoorOpen(3.05, 3.4, 0.7), 0.5));
t('doors closed at dwell end', subwayDoorOpen(3.4, 3.4, 0.7) === 0);
t('doors never exceed 1', subwayDoorOpen(1.0, 3.4, 0.7) <= 1);
t('doors never below 0', subwayDoorOpen(3.39, 3.4, 0.7) >= 0);

// --- train geometry ---
t('train length = cars * carLen', subwayTrainLength() === SUBWAY.cars * SUBWAY.carLen);
t('tunnel below street level', SUBWAY.tunnelTop > 790 && SUBWAY.railY > 790);
t('three stations', SUBWAY.stations.length === 3 && SUBWAY.stationNames.length === 3);
t('stations in ascending order', SUBWAY.stations[0] < SUBWAY.stations[1] && SUBWAY.stations[1] < SUBWAY.stations[2]);

// --- state machine: full stop-dwell-depart cycle ---
{
  const sub = createSubwayState();
  t('starts cruising', sub.mode === 'cruise' && sub.v === SUBWAY.cruiseV);
  let sawBrake = false, sawDwell = false, sawDepart = false, sawDoors = false;
  let stoppedAt = null;
  for (let i = 0; i < 4000; i++) {
    updateSubway(sub, 1 / 60);
    if (sub.mode === 'brake') sawBrake = true;
    if (sub.mode === 'dwell') {
      sawDwell = true;
      if (stoppedAt === null) stoppedAt = sub.x;
      if (sub.door > 0.5) sawDoors = true;
      t('train stopped while dwelling', sub.v === 0);
      if (sawDoors) break;
    }
  }
  t('train brakes for station', sawBrake);
  t('train dwells at station', sawDwell);
  t('train stops centered on a station', SUBWAY.stations.includes(stoppedAt));
  t('doors open while dwelling', sawDwell && sawDoors);
  // finish the dwell, then depart
  for (let i = 0; i < 600 && sub.mode === 'dwell'; i++) updateSubway(sub, 1 / 60);
  t('departs after dwell', sub.mode === 'depart' || sub.mode === 'cruise');
  if (sub.mode === 'depart') sawDepart = true;
  for (let i = 0; i < 1200 && sub.mode !== 'cruise'; i++) updateSubway(sub, 1 / 60);
  t('returns to cruise', sub.mode === 'cruise' && sub.v === SUBWAY.cruiseV);
  t('doors closed after departure', sub.door === 0);
  void sawDepart;
}

// --- state machine: wrap-around keeps running forever ---
{
  const sub = createSubwayState();
  let dwells = 0, lastMode = sub.mode;
  for (let i = 0; i < 20000; i++) {
    updateSubway(sub, 1 / 60);
    if (sub.mode === 'dwell' && lastMode !== 'dwell') dwells++;
    lastMode = sub.mode;
    if (!Number.isFinite(sub.x) || !Number.isFinite(sub.v)) break;
  }
  t('many station stops over a long run', dwells >= 6);
  t('position stays finite', Number.isFinite(sub.x) && Number.isFinite(sub.v));
  t('speed never negative', sub.v >= 0);
}

// --- existing pure helpers still intact ---
t('clamp low', clamp(-5, 0, 10) === 0);
t('clamp high', clamp(99, 0, 10) === 10);
t('night label', timeLabel(0.95) === 'NIGHT');
t('day label', timeLabel(0.4) === 'DAY');
t('skyAt returns colors', typeof skyAt(0.4).top === 'string');

// --- registration: subway replaces the skyway ---
t('no skyway district', !DISTRICTS.some((d) => d.id === 'skyway'));
t('subway district registered', DISTRICTS.some((d) => d.id === 'subway'));
t('no skyway hotspot', !HOTSPOTS.some((h) => h.id === 'skyway'));
t('subway hotspot registered', HOTSPOTS.some((h) => h.id === 'subway'));

// --- source-level checks ---
{
  const code = readFileSync('app/mega-city/scene.js', 'utf8');
  const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  t('no elevated monorail drawing', !/monorail/i.test(stripped));
  t('no skyway rail at y=470', !/syOf\(470\)/.test(stripped));
  t('no TRAIN const', !/\bconst TRAIN\b/.test(stripped));
  t('cars never stop for trains: no crossing logic', !/crossing|levelCross|gate/i.test(stripped));
  t('subway update wired into draw', /updateSubway\(sub, dt\)/.test(code));
  t('train doors drawn', /sliding panels|dslide/.test(code));
  t('kiosk doors drawn', /entrance kiosk/.test(code));
  t('reduced-motion tableau', /Reduced motion: freeze a readable tableau/.test(code));
  t('no telemetry', !/telemetry|analytics|phone.?home|supabase/i.test(stripped));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
