// tests/nova-flight.test.js — Headless tests for the NOVA pocket universe.
// Run: node tests/nova-flight.test.js (from the repo root).
// No browser, no network — asserts on lib/nova-flight.js logic plus
// source-level checks (menu registration, locale keys, no telemetry).
import { readFileSync } from 'fs';
import {
  TRIM_BIKE_TUNING,
  TRIM_BIKE_KEYS,
  tuningFor,
  SECTORS,
  SECTOR_KEYS,
  sectorByKey,
  WORMHOLES,
  wormholesIn,
  jumpThrough,
  sectorsReachableFrom,
  SECTOR_SPAWN,
  DOCK_POS,
  GIFT_POS,
  GIFT_BOARD_RADIUS,
  canBoard,
  GALAXIES,
  NEBULAE,
  dist3,
  clamp,
  headingOf,
  speedWord,
  stepFlight,
  steerToward,
} from '../lib/nova-flight.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
function approx(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// --- bike tuning ---
{
  t('3 trim bikes', TRIM_BIKE_KEYS.length === 3);
  const keys = ['wisp', 'comet', 'atlas'];
  t('wisp/comet/atlas present', keys.every((k) => TRIM_BIKE_KEYS.includes(k)));
  for (const k of keys) {
    const b = TRIM_BIKE_TUNING[k];
    t(`${k}: all tuning fields positive numbers`,
      ['maxSpeed', 'accel', 'turnRate', 'boostMult', 'brakeRate'].every(
        (f) => typeof b[f] === 'number' && b[f] > 0));
    t(`${k}: has name + desc`, !!b.name && !!b.desc);
  }
  const { wisp, comet, atlas } = TRIM_BIKE_TUNING;
  t('wisp fastest', wisp.maxSpeed > comet.maxSpeed && comet.maxSpeed > atlas.maxSpeed);
  t('wisp twitchiest turn', wisp.turnRate > comet.turnRate && comet.turnRate > atlas.turnRate);
  t('boost mult > 1 for all', keys.every((k) => TRIM_BIKE_TUNING[k].boostMult > 1));
  t('tuningFor unknown -> comet', tuningFor('nope').key === 'comet');
}

// --- sectors ---
{
  t('3 sectors', SECTORS.length === 3);
  t('sector keys unique', new Set(SECTOR_KEYS).size === SECTOR_KEYS.length);
  t('sectorByKey works', sectorByKey('gift-drift').name === 'The Gift Drift');
  t('sectorByKey unknown -> null', sectorByKey('nowhere') === null);
  t('all sectors have name + desc', SECTORS.every((s) => s.name && s.desc));
  t('every sector has a spawn point',
    SECTOR_KEYS.every((k) => SECTOR_SPAWN[k] && ['x', 'y', 'z'].every((ax) => typeof SECTOR_SPAWN[k][ax] === 'number')));
}

// --- wormhole graph ---
{
  t('3 wormholes', WORMHOLES.length === 3);
  t('wormhole ids unique', new Set(WORMHOLES.map((w) => w.id)).size === 3);
  t('wormhole from/to are valid sectors',
    WORMHOLES.every((w) => SECTOR_KEYS.includes(w.from) && SECTOR_KEYS.includes(w.to) && w.from !== w.to));
  t('wormhole radii positive', WORMHOLES.every((w) => w.radius > 0));
  t('jump shallows->gift-drift', jumpThrough('shallows', 'wh-shallows-gift') === 'gift-drift');
  t('jump gift-drift->spiral-reach', jumpThrough('gift-drift', 'wh-gift-spiral') === 'spiral-reach');
  t('jump spiral-reach->shallows', jumpThrough('spiral-reach', 'wh-spiral-shallows') === 'shallows');
  t('jump wrong sector -> null', jumpThrough('shallows', 'wh-gift-spiral') === null);
  t('jump unknown id -> null', jumpThrough('shallows', 'wh-nope') === null);
  t('wormholesIn filters by sector',
    wormholesIn('shallows').length === 1 && wormholesIn('shallows')[0].id === 'wh-shallows-gift');
  const reach = sectorsReachableFrom('shallows');
  t('graph connected: all 3 reachable from shallows',
    SECTOR_KEYS.every((k) => reach.includes(k)));
  const reach2 = sectorsReachableFrom('spiral-reach');
  t('graph connected: all 3 reachable from spiral-reach',
    SECTOR_KEYS.every((k) => reach2.includes(k)));
}

// --- gift proximity ---
{
  t('GIFT_BOARD_RADIUS positive', GIFT_BOARD_RADIUS > 0);
  t('GIFT_POS is 3D', ['x', 'y', 'z'].every((ax) => typeof GIFT_POS[ax] === 'number'));
  t('canBoard just inside', canBoard(GIFT_BOARD_RADIUS - 0.01) === true);
  t('canBoard at boundary (inclusive)', canBoard(GIFT_BOARD_RADIUS) === true);
  t('canBoard just outside', canBoard(GIFT_BOARD_RADIUS + 0.01) === false);
  t('canBoard at zero', canBoard(0) === true);
  t('DOCK_POS is 3D', ['x', 'y', 'z'].every((ax) => typeof DOCK_POS[ax] === 'number'));
}

// --- galaxies + nebulae ---
{
  t('3 galaxies', GALAXIES.length === 3);
  const names = GALAXIES.map((g) => g.name);
  t('galaxy names present', names.includes('The Pinwheel') && names.includes('Ember Spiral') && names.includes('Hollow Eye'));
  t('galaxies have distinct palettes',
    new Set(GALAXIES.map((g) => g.palette.join(','))).size === 3);
  t('galaxies have pos + radius + arms',
    GALAXIES.every((g) => g.pos && g.radius > 0 && g.arms >= 2 && g.palette.length >= 3));
  t('2 nebulae', NEBULAE.length === 2);
  t('nebulae named', NEBULAE.every((n) => n.name && n.pos && n.radius > 0));
}

// --- math helpers ---
{
  t('dist3 3-4-5', approx(dist3({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5));
  t('dist3 zero', dist3({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 }) === 0);
  t('clamp', clamp(5, 0, 1) === 1 && clamp(-2, 0, 1) === 0 && clamp(0.5, 0, 1) === 0.5);
  const h0 = headingOf(0, 0);
  t('heading yaw0/pitch0 -> +Z', approx(h0.x, 0) && approx(h0.y, 0) && approx(h0.z, 1));
  const h90 = headingOf(Math.PI / 2, 0);
  t('heading yaw90 -> +X', approx(h90.x, 1, 1e-9) && approx(h90.z, 0, 1e-9));
  const hp = headingOf(0, Math.PI / 2);
  t('heading pitch90 -> +Y', approx(hp.y, 1, 1e-9));
  t('heading is unit', approx(Math.hypot(...Object.values(headingOf(1.2, 0.5))), 1, 1e-9));
}

// --- speedWord (plain English) ---
{
  t('drifting at rest', speedWord(0, 60, false) === 'drifting');
  t('cruising mid', speedWord(20, 60, false) === 'cruising');
  t('flying fast near max', speedWord(55, 60, false) === 'flying fast');
  t('boosting when boosting', speedWord(55, 60, true) === 'boosting');
  t('not boosting when slow even with flag', speedWord(5, 60, true) !== 'boosting');
}

// --- stepFlight ---
{
  const mk = () => ({ pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, speed: 0 });
  const idle = { thrust: 0, turn: 0, pitch: 0, boost: false, brake: false };
  const s1 = stepFlight(mk(), idle, 1, TRIM_BIKE_TUNING.wisp);
  t('no input: stays put', s1.speed === 0 && s1.pos.x === 0 && s1.pos.z === 0);

  const fwd = { thrust: 1, turn: 0, pitch: 0, boost: false, brake: false };
  const s2 = stepFlight(mk(), fwd, 1, TRIM_BIKE_TUNING.wisp);
  t('thrust accelerates', s2.speed > 0 && s2.speed <= TRIM_BIKE_TUNING.wisp.maxSpeed);
  t('moves along +Z at yaw 0', s2.pos.z > 0 && approx(s2.pos.x, 0));

  const s3 = stepFlight({ ...mk(), speed: 60 }, { ...fwd, brake: true }, 1, TRIM_BIKE_TUNING.wisp);
  t('brake kills speed', s3.speed < 60);

  const turn = { thrust: 0.5, turn: 1, pitch: 0, boost: false, brake: false };
  const s4 = stepFlight(mk(), turn, 1, TRIM_BIKE_TUNING.wisp);
  t('turn changes yaw', s4.yaw > 0);
  t('turn rate respects tuning', approx(s4.yaw, TRIM_BIKE_TUNING.wisp.turnRate, 1e-9));

  const boost = { thrust: 1, turn: 0, pitch: 0, boost: true, brake: false };
  let sb = mk();
  for (let i = 0; i < 20; i++) sb = stepFlight(sb, boost, 0.25, TRIM_BIKE_TUNING.comet);
  t('boost exceeds normal max', sb.speed > TRIM_BIKE_TUNING.comet.maxSpeed);
  t('boost capped at boostMult × max',
    sb.speed <= TRIM_BIKE_TUNING.comet.maxSpeed * TRIM_BIKE_TUNING.comet.boostMult + 1e-9);

  const s5 = stepFlight(mk(), { thrust: 0, turn: 0, pitch: 10, boost: false, brake: false }, 5, TRIM_BIKE_TUNING.atlas);
  t('pitch clamps', Math.abs(s5.pitch) <= 1.1 + 1e-9);

  const s6 = stepFlight(mk(), { thrust: -1, turn: 0, pitch: 0, boost: false, brake: false }, 1, TRIM_BIKE_TUNING.wisp);
  t('reverse thrust', s6.pos.z < 0);

  const vals = [s2, s3, s4, sb, s5, s6].flatMap((s) => [s.pos.x, s.pos.y, s.pos.z, s.yaw, s.pitch, s.speed]);
  t('no NaN anywhere', vals.every((v) => Number.isFinite(v)));

  const st = steerToward(mk(), { x: 100, y: 0, z: 0 }, TRIM_BIKE_TUNING.wisp);
  t('steerToward gives bounded inputs',
    Math.abs(st.turn) <= 1 && Math.abs(st.pitch) <= 1 && st.dist > 0);
  const stAhead = steerToward(mk(), { x: 0, y: 0, z: 100 }, TRIM_BIKE_TUNING.wisp);
  t('steerToward aligned when target straight ahead',
    stAhead.aligned && approx(stAhead.turn, 0, 1e-9));
}

// --- source-level checks: registration, locale, honesty, no telemetry ---
{
  const registry = readFileSync('lib/i18n/satellites.ts', 'utf8');
  t('registry has nova entry (exact format)',
    registry.includes('{ key: "nova", route: "/nova", pos: "ZEUS_POS", section: "GAMES", constellation: "ZEUS" }'));

  const en = readFileSync('lib/i18n/locales/en.json', 'utf8');
  t('en locale has sat.nova.title', en.includes('"sat.nova.title": "Nova"'));
  t('en locale has sat.nova.subtitle', en.includes('"sat.nova.subtitle": "Deep Space"'));
  for (const lang of ['de', 'el', 'es', 'fr', 'it', 'pt']) {
    const loc = readFileSync(`lib/i18n/locales/${lang}.json`, 'utf8');
    if (!loc.includes('"sat.nova.title"')) {
      failed++;
      console.error(`FAIL: ${lang} locale missing sat.nova.title`);
    } else { passed++; }
  }

  const page = readFileSync('app/nova/page.jsx', 'utf8');
  const pcode = stripComments(page);
  t('page: no central_telemetry', !/central_telemetry/.test(pcode));
  t('page: no phone-home', !/phone.?home/i.test(pcode));
  t('page: no fetch', !/fetch\(/.test(pcode));
  t('page: no supabase', !/supabase/i.test(pcode));
  t('page: no external URLs', !/https?:\/\//.test(pcode));
  t('page: reduced-motion respected', /prefers-reduced-motion/.test(page));
  t('page: safari bottom clearance', /safe-area-inset-bottom/.test(page));
  t('page: touch targets >= 44px', /min-h-\[44px\]/.test(page));
  t('page: plaque bears Merlin\'s words', /Poverty needs to end\./.test(page));
  t('page: autopilot tour present', /Autopilot tour/.test(page));
  t('page: board-the-gift present', /Board the Gift/.test(page));

  const bikes = readFileSync('components/nova/TrimBikes.jsx', 'utf8');
  const bcode = stripComments(bikes);
  t('bikes: no telemetry/fetch', !/central_telemetry|phone.?home|fetch\(|supabase|https?:\/\//i.test(bcode));
  t('3 bike components', /WispBike/.test(bikes) && /CometBike/.test(bikes) && /AtlasBike/.test(bikes));
  t('bike registry + lookup', /TRIM_BIKES/.test(bikes) && /bikeByKey/.test(bikes));

  const deep = readFileSync('components/nova/DeepSpace.jsx', 'utf8');
  const dcode = stripComments(deep);
  t('deepspace: no telemetry/fetch', !/central_telemetry|phone.?home|fetch\(|supabase|https?:\/\//i.test(dcode));
  t('deepspace: galaxies + wormholes + gift',
    /SpiralGalaxy/.test(deep) && /Wormhole/.test(deep) && /TheGift/.test(deep) && /GiftInterior/.test(deep));

  const flight = readFileSync('lib/nova-flight.js', 'utf8');
  const fcode = stripComments(flight);
  t('flight lib: no fetch/telemetry', !/fetch\(|telemetry|phone|supabase|https?:\/\//i.test(fcode));
  t('flight lib: no THREE import', !/from 'three'|require\(['"]three/.test(fcode));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
