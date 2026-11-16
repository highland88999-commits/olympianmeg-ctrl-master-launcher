// tests/earth-boost-pads.test.mjs — Earth 1 boost pads for racers
// (Merlin, 2026-11-15: "Add power ups to earth 1 for racers...
// drivers pass over them for extra speed boosts").
//
// Pins: deterministic placement on the SEEDED GRID (the landmarks
// are gone — Merlin, 2026-11-15: "Earth 1 should not have
// landmarks anymore" — so the pads re-anchored from 6-per-landmark
// to a 15 x 10 seeded grid, same count 150), drive-over trigger
// with the frame-path sweep (a boost-speed driver covers ~9 m per
// frame), 20 s per-pad cooldown, 4 s ×1.5 boost, HUD notice,
// on-foot does nothing, teleport guard, and the roster tuning
// untouched (pads multiply the boost, they never rewrite it).
//
// Run: node tests/earth-boost-pads.test.mjs (from the repo root).
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import {
  PAD_TRIGGER_RADIUS_M,
  PAD_COOLDOWN_MS,
  PAD_BOOST_MS,
  PAD_BOOST_MULT,
  PAD_RENDER_M,
  PAD_GRID_LAT_BANDS,
  PAD_GRID_LON_SLOTS,
  PAD_GRID_SEED,
  PAD_GRID_LAT_MIN,
  PAD_GRID_LAT_MAX,
  PAD_NOTICE_TEXT,
  haversineM,
  padIdForGrid,
  buildPads,
  allBoostPads,
  padsNear,
  segmentHitsPad,
  createBoostPadState,
  checkBoostPads,
  readPadBoost,
  padVisual,
  readBoostNotice,
  resetPadBoostStateForTests,
} from '../lib/earth/boost-pads.js';
import { getVehicle, boostTopSpeed } from '../lib/earth/vehicles.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}
function eq(name, a, b) {
  t(name, a === b);
}

// --- Deterministic placement: the seeded grid (no landmarks) ---
{
  const a = buildPads();
  const b = buildPads();
  eq('grid is 15 lat bands × 10 lon slots', PAD_GRID_LAT_BANDS * PAD_GRID_LON_SLOTS, 150);
  eq('seeded grid → 150 pads', a.length, 150);
  t('seeded grid → identical pads on rebuild', JSON.stringify(a) === JSON.stringify(b));
  eq('grid seed is pinned', PAD_GRID_SEED, 20261115);
  eq('pad ids are grid band + slot', a[0].id, 'grid-0-0');
  eq('padIdForGrid matches', padIdForGrid(3, 7), 'grid-3-7');
  const ids = new Set(a.map((p) => p.id));
  eq('all pad ids unique', ids.size, a.length);
  for (const p of a) {
    t(`pad ${p.id} carries no landmark anchor`, p.landmarkId === undefined);
    t(`pad ${p.id} lat sits in the grid band range`,
      p.lat >= PAD_GRID_LAT_MIN - 3 && p.lat <= PAD_GRID_LAT_MAX + 3);
    t(`pad ${p.id} lon sits in range`, p.lon >= -180 - 12 && p.lon <= 180 + 12);
    t(`pad ${p.id} id matches the grid pattern`, /^grid-\d+-\d+$/.test(p.id));
  }
}

// --- The real set: 150, memoized, spread across the planet ---
{
  const all = allBoostPads();
  eq('15 × 10 grid = 150 pads', all.length, 150);
  eq('allBoostPads is memoized', allBoostPads(), all);
  // The grid is sparse (bands 9° apart, slots 36° apart), so a
  // pad's own neighbourhood holds just itself at render range.
  const near = padsNear(all[0].lat, all[0].lon, PAD_RENDER_M);
  t('a pad renders near itself', near.length >= 1);
  // Above the top band (75° + 3° jitter) there is nothing.
  const far = padsNear(85, 0, PAD_RENDER_M);
  eq('no pads beyond the grid', far.length, 0);
}

// --- haversine sanity ---
{
  eq('haversine of a point to itself is 0', haversineM(10, 20, 10, 20), 0);
  const deg = haversineM(0, 0, 1, 0);
  t('one degree of latitude is ~111 km', deg > 110000 && deg < 112000);
}

// --- Segment sweep: the fast driver cannot jump over a pad ---
{
  const pad = { id: 'fx-test:pad-0', lat: 53.95, lon: -113.11 };
  // 9 m steps straight through the pad (boost speed, one frame).
  t('9 m frame steps through the pad still trigger',
    segmentHitsPad(53.95, -113.1102, 53.95, -113.1098, pad));
  t('a parallel pass 20 m away misses',
    !segmentHitsPad(53.9502, -113.1102, 53.9502, -113.1098, pad));
  t('standing on the pad (zero-length segment) hits',
    segmentHitsPad(53.95, -113.11, 53.95, -113.11, pad));
  t('standing 20 m away misses',
    !segmentHitsPad(53.9502, -113.11, 53.9502, -113.11, pad));
  t('a pass just inside the 6 m trigger radius hits',
    segmentHitsPad(53.95005, -113.1102, 53.95005, -113.1098, pad));
}

// --- Trigger / cooldown / boost / notice ---
{
  const state = createBoostPadState();
  const pads = buildPads();
  const pad = pads[0]; // grid-0-0, first grid pad
  const now = 100000;
  // On foot, dead-centre on the pad: nothing happens.
  const foot = checkBoostPads(state, { lat: pad.lat, lon: pad.lon, driving: false, nowMs: now, pads });
  eq('on foot over a pad → no trigger', foot.triggered, null);
  eq('on foot → no boost', foot.boostMult, 1);
  eq('on foot → no HUD notice', readBoostNotice(now), '');
  // Mounted, drive over it: trigger, ×1.5 for 4 s, notice set.
  const hit = checkBoostPads(state, { lat: pad.lat, lon: pad.lon, driving: true, nowMs: now + 100, pads });
  eq('mounted over an armed pad → triggers that pad', hit.triggered?.id, pad.id);
  eq('trigger → boost ×1.5', hit.boostMult, PAD_BOOST_MULT);
  t('trigger → boostActive', hit.boostActive);
  eq('trigger → HUD notice text', readBoostNotice(now + 100), PAD_NOTICE_TEXT);
  eq('readPadBoost agrees while active', readPadBoost(now + 100, state).active, true);
  eq('readPadBoost mult while active', readPadBoost(now + 100, state).mult, PAD_BOOST_MULT);
  // Re-pass inside the 20 s cooldown: nothing.
  const again = checkBoostPads(state, { lat: pad.lat, lon: pad.lon, driving: true, nowMs: now + 200, pads });
  eq('re-pass inside cooldown → no re-trigger', again.triggered, null);
  // Boost expires after 4 s even though the pad still recharges.
  const later = checkBoostPads(state, { lat: pad.lat, lon: pad.lon, driving: true, nowMs: now + PAD_BOOST_MS + 200, pads });
  eq('boost expires after 4 s', later.boostMult, 1);
  t('boost inactive after 4 s', !later.boostActive);
  eq('readPadBoost inactive after 4 s', readPadBoost(now + PAD_BOOST_MS + 200, state).active, false);
  // HUD notice expires after 1.5 s.
  eq('HUD notice expires after 1.5 s', readBoostNotice(now + 2000), '');
  // After the 20 s cooldown the same pad triggers again.
  const rearm = checkBoostPads(state, { lat: pad.lat, lon: pad.lon, driving: true, nowMs: now + PAD_COOLDOWN_MS + 300, pads });
  eq('pad re-arms after 20 s', rearm.triggered?.id, pad.id);
  // Visual states across the cycle.
  eq('just triggered → flare', padVisual(pad.id, now + PAD_COOLDOWN_MS + 400, state), 'flare');
  eq('mid-cooldown → recharging', padVisual(pad.id, now + PAD_COOLDOWN_MS + 5000, state), 'recharging');
  eq('after cooldown → armed', padVisual(pad.id, now + 2 * PAD_COOLDOWN_MS + 400, state), 'armed');
  eq('unknown pad → armed', padVisual('nope:pad-0', now, state), 'armed');
}

// --- Stationary summon on a pad + teleport guard ---
{
  const state = createBoostPadState();
  const pads = buildPads();
  const pad = pads[1];
  // Summoned standing on a pad: triggers (the pad is under the wheels).
  const parked = checkBoostPads(state, { lat: pad.lat, lon: pad.lon, driving: true, nowMs: 500000, pads });
  eq('mounted and parked on a pad → triggers', parked.triggered?.id, pad.id);
  // Teleport across the planet while mounted: no phantom trigger
  // from the stale position (the sweep would drag a line across
  // the world and clip a pad the driver never passed).
  const state2 = createBoostPadState();
  checkBoostPads(state2, { lat: 53.95, lon: -113.11, driving: true, nowMs: 600000, pads });
  const other = pads[pads.length - 1]; // a pad from the far end of the grid
  const jump = checkBoostPads(state2, { lat: other.lat, lon: other.lon, driving: true, nowMs: 600100, pads });
  // The jump lands exactly on the far pad, so it triggers for
  // being ON the pad — not for the sweep. Prove the sweep is dead
  // by jumping to a point 20 m off the far pad instead.
  const state3 = createBoostPadState();
  checkBoostPads(state3, { lat: 53.95, lon: -113.11, driving: true, nowMs: 700000, pads });
  const offPad = checkBoostPads(state3, { lat: other.lat + 0.0002, lon: other.lon, driving: true, nowMs: 700100, pads });
  eq('teleport landing 20 m off a pad → no trigger', offPad.triggered, null);
  void jump;
}

// --- Roster tuning untouched: pads multiply, never rewrite ---
{
  const sc = getVehicle('wedge-supercar');
  eq('Aventador boostMult still 2.0', sc.tuning.boostMult, 2.0);
  eq('Aventador boost top speed still 180', boostTopSpeed(sc), 180);
  const ghost = getVehicle('ghost-throttle');
  eq('Ghost Throttle noseReversed still pinned', ghost.noseReversed, true);
  const bike = getVehicle('cruiser-bike');
  eq('Cruiser Bike noseReversed still pinned', bike.noseReversed, true);
  eq('PAD_BOOST_MULT is 1.5', PAD_BOOST_MULT, 1.5);
  eq('cooldown is 20 s', PAD_COOLDOWN_MS, 20000);
  eq('boost lasts 4 s', PAD_BOOST_MS, 4000);
  eq('trigger radius is 6 m', PAD_TRIGGER_RADIUS_M, 6);
}

// --- Wiring pins (source-level: the drive loops read the pad) ---
{
  const car = readFileSync('components/EarthSupercar.jsx', 'utf8');
  t('supercar imports the pad boost reader', car.includes("readPadBoost } from '@/lib/earth/boost-pads'"));
  t('supercar forces boost while a pad boost is active', car.includes('|| pad.active'));
  t('supercar multiplies its own boostMult by the pad mult', car.includes('boostMult: tuning.boostMult * pad.mult'));
  t('supercar roster tuning numbers untouched', car.includes("tuning: { maxSpeed: 90, accel: 55, turnRate: 2.0, boostMult: 2.0, brakeRate: 80 }") === false
    && car.includes("(craft && craft.tuning) || { maxSpeed: 45, accel: 30, turnRate: 1.9, boostMult: 1.6, brakeRate: 55 }"));
  // The TRON bike is gone (vehicles only, 2026-11-15) — there is
  // no second vehicle component to wire pads into.
  t('EarthBike.jsx is gone', !existsSync('components/EarthBike.jsx'));
  const nexus = readFileSync('components/NexusEarth.jsx', 'utf8');
  t('NexusEarth mounts the pad component', nexus.includes('<EarthBoostPads />'));
  t('pads mount on the same street gate as the vehicles', nexus.includes("{effectiveLayer === 'terrain' && roaming && <EarthBoostPads />}"));
  const consoleSrc = readFileSync('components/EarthConsole.jsx', 'utf8');
  t('console polls the pad notice', consoleSrc.includes('readBoostNotice(performance.now())'));
  t('console renders the BOOST flash', consoleSrc.includes('boostFlash'));
  const pads = readFileSync('components/EarthBoostPads.jsx', 'utf8');
  t('pad component checks the mounted driver each frame', pads.includes('checkBoostPads(padBoostState'));
  t('pad component renders only pads near the driver', pads.includes('padsNear(lat, lon, PAD_RENDER_M'));
  t('pad visuals are unlit (no new real lights)', pads.includes('meshBasicMaterial'));
  t('pad component never adds a light', !pads.includes('<pointLight') && !pads.includes('<spotLight') && !pads.includes('<directionalLight'));
  const lib = readFileSync('lib/earth/boost-pads.js', 'utf8');
  t('pad lib is pure: no THREE import', !lib.includes("from 'three'"));
  t('pad lib is pure: no window/document', !lib.includes('window.') && !lib.includes('document.'));
  resetPadBoostStateForTests();
  eq('reset clears the notice', readBoostNotice(0), '');
}

// --- Roster / nose audit pins still hold (neighbour guard) ---
{
  const nose = ['luxury-gt-1', 'teardrop-coupe', 'pickup-hd', 'cruiser-bike', 'ghost-throttle'];
  for (const id of nose) {
    t(`${id} still noseReversed`, getVehicle(id).noseReversed === true);
  }
  eq('roster still 19 craft', (await import('../lib/earth/vehicles.js')).listVehicles().length, 19);
}

console.log(`earth-boost-pads: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
