// tests/earth1-kart.test.mjs — Earth 1 Mario Kart systems
// (Merlin, 2026-11-15): torpedo orbs, heat-seeker torpedoes,
// flip-3x-explode, respawn-in-vehicle, bumper-car collisions
// (hidden integrity meter), AI rivals, click-to-spawn math.
//
// Pins: 10,368 orbs (one per 2.5° cell, virtual + deterministic);
// one orb = exactly one missile; the missile wears its orb's colour
// (its colour's VIDEO wrap — 6 colours, a rocket in the centre of
// each video); the orb body is 1.4 m across, clearly smaller than
// the smallest roster vehicle (a 2.2 m bike); the HEAT-SEEKER lock
// rule — the missile ALWAYS tracks the CLOSEST vehicle TO THE
// MISSILE ITSELF, re-evaluated continuously, retargeting on a
// closer pass; the seeker never arms inside 100 display m
// (TORPEDO_MIN_SEEK_DISTANCE_M) — inside that distance the
// torpedo flies straight dumb-fire, with no lock and no target
// switching; torpedo hit = 3 flips then explosion; respawn is at
// the blast spot, in-vehicle, speed 0, integrity restored; the
// integrity meter is hidden (kartHud carries no integrity field);
// collision damage numbers + pair cooldown; 5 deterministic rivals;
// globe-click round-trip.
//
// ALL distances are DISPLAY metres — the unit the car drives in
// (1° of lat/lon ≈ 60 display m on the 55-unit globe); see the
// display-scale block at the top of lib/earth/kart.js. Fixtures
// that used to read degrees as real metres (0.001° ≈ 111 m) now
// read them as display metres (x° = x × 60 display m).
//
// Run: node tests/earth1-kart.test.mjs (from the repo root).
import assert from 'node:assert';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ORB_COUNT,
  ORB_CELL_DEG,
  ORB_LAT_BANDS,
  ORB_LON_SLOTS,
  ORB_RADIUS_M,
  ORB_FLOAT_M,
  ORB_BOB_M,
  ORB_TRIGGER_RADIUS_M,
  ORB_REARM_MS,
  ORB_BEAM_RENDER_M,
  ORB_RENDER_M,
  ORB_RENDER_MAX,
  DISPLAY_M_PER_DEGREE,
  haversineDisplayM,
  nearestOrbs,
  ORB_COLORS,
  orbForCell,
  orbCellFor,
  orbsNear,
  orbReady,
  collectOrbs,
  collectPlayerMissile,
  TORPEDO_RANGE_M,
  TORPEDO_MIN_SPEED_MPS,
  TORPEDO_SPEED_FACTOR,
  TORPEDO_HIT_RADIUS_M,
  TORPEDO_MIN_SEEK_DISTANCE_M,
  FLIP_TURNS,
  FLIP_MS,
  EXPLODE_MS,
  INVULN_MS,
  INTEGRITY_MAX,
  COLLISION_MIN_REL_MPS,
  COLLISION_BASE_DMG,
  COLLISION_DMG_CAP,
  COLLISION_PAIR_COOLDOWN_MS,
  RIVAL_COUNT,
  RIVAL_SPEED_FACTOR,
  createKartState,
  resetKartStateForTests,
  kartHud,
  setKartClientId,
  nearestTarget,
  fireTorpedo,
  fireRivalTorpedo,
  stepTorpedoes,
  createHit,
  startHit,
  advanceHit,
  flipRollAngle,
  respawnFor,
  collisionDamageFor,
  applyCollisionDamage,
  buildRivals,
  stepRivals,
  SPAWN_MIN_SEPARATION_M,
  spawnPointClearOf,
  clearSpawnPoint,
  vehicleGapM,
  separateFrom,
  separateVehicles,
  SPEEDO_SMOOTH_TAU_MS,
  SPEEDO_MAX_SLEW_KMH_PER_S,
  SPEEDO_SNAP_KMH,
  SPEEDO_TELEPORT_TOLERANCE,
  displacementSpeedKmh,
  smoothSpeedKmh,
  stepDisplaySpeed,
} from '../lib/earth/kart.js';
import { getVehicle, VEHICLES } from '../lib/earth/vehicles.js';
import { ORB_VIDEO_URLS } from '../lib/earth/ground-video.js';
import { latLonToVec3 } from '../lib/geo.js';
import {
  GLOBE_CENTER,
  GLOBE_RADIUS,
  rotateByQuat,
  globeWorldPointToLatLon,
} from '../lib/earth/globe-click.js';
import { SCRATCHED_TEXTURES } from '../lib/portal/scratched-textures.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}
function eq(name, a, b) {
  t(name, a === b);
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const IDENTITY_QUAT = { x: 0, y: 0, z: 0, w: 1 };

// --- Orbs: count, virtual + deterministic, one per cell ---
{
  eq('orb count is 10,368 (72 × 144 cells)', ORB_COUNT, 10368);
  eq('orb grid is 72 lat bands × 144 lon slots', ORB_LAT_BANDS * ORB_LON_SLOTS, ORB_COUNT);
  eq('orb cells are 2.5° (~150 display m at the equator)', ORB_CELL_DEG, 2.5);
  t('one degree is ~60 display m on the 55-unit globe', Math.abs(DISPLAY_M_PER_DEGREE - 60) < 0.01);
  t('haversineDisplayM: 1° of latitude is ~60 display m', Math.abs(haversineDisplayM(0, 0, 1, 0) - 60) < 0.5);
  eq('beam renders within 200 display m', ORB_BEAM_RENDER_M, 200);
  eq('sphere horizon is 150 display m', ORB_RENDER_M, 150);
  eq('render set caps at 48 nearest orbs', ORB_RENDER_MAX, 48);
  const a = orbForCell(40, 60);
  const b = orbForCell(40, 60);
  t('same cell → identical orb', JSON.stringify(a) === JSON.stringify(b));
  const c = orbForCell(40, 61);
  t('neighbour cell → a different orb', c.lat !== a.lat || c.lon !== a.lon || c.color !== a.color);
  t('orb lat sits inside its cell', a.lat >= -90 + 40 * 2.5 && a.lat < -90 + 41 * 2.5);
  t('orb lon sits inside its cell', a.lon >= -180 + 60 * 2.5 && a.lon < -180 + 61 * 2.5);
  t('orb colour is one of the 6 video colours', ORB_COLORS.includes(a.color));
  eq('6 orb colours (the six most distinct scratched metals)',
    ORB_COLORS.length, 6);
  t('orb colours are exactly magenta/cyan/blue/red/green/purple',
    JSON.stringify(ORB_COLORS) === JSON.stringify(['magenta', 'cyan', 'blue', 'red', 'green', 'purple']));
  t('bright-gold, silver and deep-gold stay in the floor loop only',
    !ORB_COLORS.includes('bright-gold') && !ORB_COLORS.includes('silver') && !ORB_COLORS.includes('deep-gold'));
  eq('orb cell lookup round-trips', orbCellFor(a.lat, a.lon).key, a.cellKey);
  // SPARSITY (Merlin, 2026-11-16 — the 60 s video: x6 at a
  // standstill, x12 within seconds): the old 0.5° grid put an
  // orb every ~30 m, so the driver sat inside a fence of beams.
  // At 150 m spacing the fence is gone — a handful of beams at
  // most, each marking one real, distant orb.
  const near60 = orbsNear(53.5462, -113.4912, 60);
  t('no orb fence: at most 3 orbs within 60 display m', near60.length <= 3);
  for (const o of near60) {
    t('every returned orb is within range', haversineDisplayM(53.5462, -113.4912, o.lat, o.lon) <= 60);
  }
  const near200 = orbsNear(53.5462, -113.4912, 200);
  t('a handful of orbs within beam range (1–25)', near200.length >= 1 && near200.length <= 25);
  const near2000 = orbsNear(53.5462, -113.4912, 2000);
  t('the planet stays stocked: ~1,050 orbs within 2 km at Redwater',
    near2000.length >= 800 && near2000.length <= 1300);
  // The render set: nearest first, capped, every orb a prespawned
  // grid orb (cell round-trips) — nothing anchored to a car.
  const renderSet = nearestOrbs(53.5462, -113.4912, ORB_BEAM_RENDER_M, ORB_RENDER_MAX);
  t('render set caps at ORB_RENDER_MAX', renderSet.length <= ORB_RENDER_MAX);
  t('render set is nearest first', renderSet.every((o, i) => i === 0
    || haversineDisplayM(53.5462, -113.4912, renderSet[i - 1].lat, renderSet[i - 1].lon)
    <= haversineDisplayM(53.5462, -113.4912, o.lat, o.lon) + 1e-9));
  t('every rendered orb is a prespawned grid orb (cell round-trips)',
    renderSet.every((o) => orbCellFor(o.lat, o.lon).key === o.cellKey));
  t('every rendered orb is within beam range',
    renderSet.every((o) => haversineDisplayM(53.5462, -113.4912, o.lat, o.lon) <= ORB_BEAM_RENDER_M));
  // The trigger and the beam are unchanged by the resize.
  eq('orb trigger radius stays 6 m', ORB_TRIGGER_RADIUS_M, 6);
  // RARITY: a 1500 m straight drive (the old grid collected ~20
  // on the same run) now collects a handful at most — finding
  // one is a hunt, not a certainty.
  {
    const st = createKartState();
    let pLat = 53.5;
    let pLon = -113.5;
    let found = 0;
    for (let i = 0; i < 150; i++) {
      const nLon = pLon + 10 / 60; // 10 display m east per step
      const r = collectOrbs(st, {
        lat: pLat, lon: nLon, prevLat: pLat, prevLon: pLon, driving: true, nowMs: 1000 + i * 100,
      }, (o) => collectPlayerMissile(st, o));
      found += r.collected.length;
      pLon = nLon;
    }
    t(`a 1500 m straight drive collects at most 6 orbs (found ${found})`, found <= 6);
    resetKartStateForTests();
  }
}

// --- Orb size: clearly smaller than the smallest vehicle ---
{
  const smallest = Math.min(...VEHICLES.map((v) => v.lengthM));
  eq('smallest roster vehicle is a 2.2 m bike', smallest, 2.2);
  eq('orb radius is 0.7 m', ORB_RADIUS_M, 0.7);
  t('orb diameter (1.4 m) is clearly smaller than the smallest vehicle (2.2 m)',
    ORB_RADIUS_M * 2 < smallest);
  eq('orb floats 1.2 m up, in the car\'s path', ORB_FLOAT_M, 1.2);
  eq('orb bobs ±0.4 m around the float height', ORB_BOB_M, 0.4);
}

// --- One orb = exactly one missile; re-arm after 60 s ---
{
  const state = createKartState();
  const orb = orbForCell(40, 60);
  // Drive a short segment straight through the orb.
  const dLat = 3 / 60; // 3 display m each side of the orb
  const drive = (nowMs) => collectOrbs(state, {
    lat: orb.lat + dLat, lon: orb.lon,
    prevLat: orb.lat - dLat, prevLon: orb.lon,
    driving: true, nowMs,
  }, (o) => collectPlayerMissile(state, o));
  const first = drive(1000);
  eq('driving through an orb collects it', first.collected.length, 1);
  eq('one orb = exactly one missile', state.missiles, 1);
  t('the missile wears the orb colour (FIFO queue)',
    state.missileColors.length === 1 && state.missileColors[0] === orb.color);
  const second = drive(2000);
  eq('same orb inside 60 s → nothing (re-arm)', second.collected.length, 0);
  eq('no double missile', state.missiles, 1);
  t('orb is not ready inside the re-arm window', !orbReady(state, orb, 2000));
  const third = drive(1000 + ORB_REARM_MS + 1);
  eq('same orb after 60 s → collects again', third.collected.length, 1);
  eq('second collection is a second missile', state.missiles, 2);
  // On foot (not driving) nothing collects.
  const state2 = createKartState();
  const onFoot = collectOrbs(state2, {
    lat: orb.lat + dLat, lon: orb.lon,
    prevLat: orb.lat - dLat, prevLon: orb.lon,
    driving: false, nowMs: 1000,
  }, (o) => collectPlayerMissile(state2, o));
  eq('not driving → no collection', onFoot.collected.length, 0);
  // A parallel pass 20 m away misses.
  const state3 = createKartState();
  const miss = collectOrbs(state3, {
    lat: orb.lat + 20 / 60, lon: orb.lon + 20 / 60,
    prevLat: orb.lat - 20 / 60, prevLon: orb.lon + 20 / 60,
    driving: true, nowMs: 1000,
  }, (o) => collectPlayerMissile(state3, o));
  eq('a pass 20 m off the orb misses', miss.collected.length, 0);
  // A pass 10 display m off the orb misses too (trigger is 6 m):
  // the drive runs east-west, offset 10 display m north of the orb.
  const state4 = createKartState();
  const nearMiss = collectOrbs(state4, {
    lat: orb.lat + 10 / 60, lon: orb.lon + 10 / 60,
    prevLat: orb.lat + 10 / 60, prevLon: orb.lon - 10 / 60,
    driving: true, nowMs: 1000,
  }, (o) => collectPlayerMissile(state4, o));
  eq('a pass 10 m off the orb misses (trigger is 6 m)', nearMiss.collected.length, 0);
}

// --- Missile wears its orb's colour — the orb's VIDEO wrap ---
{
  // Find a purple cell (one of the 6 video colours).
  let purpleOrb = null;
  for (let i = 0; i < 70 && !purpleOrb; i++) {
    const o = orbForCell(i, 20 + i);
    if (o.color === 'purple') purpleOrb = o;
  }
  t('a purple orb exists in the virtual set', !!purpleOrb);
  const state = createKartState();
  setKartClientId('test-driver');
  collectPlayerMissile(state, purpleOrb);
  const torp = fireTorpedo(state, {
    lat: purpleOrb.lat, lon: purpleOrb.lon, yawDeg: 0, nowMs: 1000, vehicles: [],
  });
  eq('the fired missile wears the purple orb colour', torp.color, 'purple');
  // Every orb colour has a VIDEO wrap on disk (6 videos, a
  // rocket in the centre of each) — not a flat image.
  for (const color of ORB_COLORS) {
    const url = ORB_VIDEO_URLS[color];
    t(`orb colour ${color} has a video wrap (${url})`,
      typeof url === 'string' && url === `/videos/earth1/orb-${color}.mp4`
      && existsSync(join(ROOT, 'public', ...url.replace(/^\//, '').split('/'))));
  }
  t('scratched textures cover 8 colours (the stills behind the videos)',
    Object.keys(SCRATCHED_TEXTURES).length, 8);
  resetKartStateForTests();
  setKartClientId(null);
}

// --- Heat-seeker lock: closest vehicle TO THE MISSILE, any direction ---
{
  setKartClientId('test-driver');
  const state = createKartState();
  state.missiles = 1;
  state.missileColors = ['red'];
  const player = { kind: 'player', id: 'test-driver', lat: 0, lon: 0, yawDeg: 0, speedMps: 0 };
  // A rival BEHIND the driver (100 m south) and one AHEAD (300 m north).
  // The old forward-cone rule would have locked the one ahead; the
  // heat-seeker locks whoever is closest to the missile — behind wins.
  const behind = { kind: 'rival', id: 'rival-behind', lat: -100 / 60, lon: 0, speedMps: 50 };
  const ahead = { kind: 'rival', id: 'rival-ahead', lat: 300 / 60, lon: 0, speedMps: 50 };
  const lock = nearestTarget({ lat: 0, lon: 0, vehicles: [player, behind, ahead], excludeKind: 'player', excludeId: 'test-driver' });
  eq('lock is the closest vehicle, even behind the driver', lock.id, 'rival-behind');
  const torp = fireTorpedo(state, { lat: 0, lon: 0, yawDeg: 0, nowMs: 1000, vehicles: [player, behind, ahead] });
  eq('Fire locks the closest vehicle', torp.targetId, 'rival-behind');
  eq('Fire locks the target kind too', torp.targetKind, 'rival');
  // The owner's own vehicle is never a target.
  const solo = nearestTarget({ lat: 0, lon: 0, vehicles: [player], excludeKind: 'player', excludeId: 'test-driver' });
  eq('owner alone → no target', solo, null);
  const sameSpot = nearestTarget({
    lat: 0, lon: 0,
    vehicles: [player, { kind: 'peer', id: 'peer-near', lat: 0, lon: 0, speedMps: 0 }],
    excludeKind: 'player', excludeId: 'test-driver',
  });
  eq('a peer at the launch point locks (owner never does)', sameSpot.id, 'peer-near');
  // Nothing in range → no lock, straight flight, fizzle at 600 m.
  const far = { kind: 'rival', id: 'rival-far', lat: 1200 / 60, lon: 0, speedMps: 50 }; // 1200 display m
  const noLock = nearestTarget({ lat: 0, lon: 0, vehicles: [player, far], excludeKind: 'player', excludeId: 'test-driver' });
  eq('nothing within 600 m → no lock', noLock, null);
  const state2 = createKartState();
  state2.missiles = 1;
  const straight = fireTorpedo(state2, { lat: 0, lon: 0, yawDeg: 90, nowMs: 1000, vehicles: [player, far] });
  eq('no lock → torpedo has no target', straight.targetId, null);
  let fizzled = false;
  for (let i = 0; i < 30 && !fizzled; i++) {
    const evs = stepTorpedoes(state2, { dt: 0.1, nowMs: 1000 + i * 100, vehicles: [player, far] });
    fizzled = evs.some((e) => e.type === 'fizzle');
    t('an untargeted torpedo never hits a far vehicle', !evs.some((e) => e.type === 'hit'));
  }
  t('an untargeted torpedo fizzles at 600 m', fizzled);
  t('fizzle travelled ~600 m', straight.travelledM >= TORPEDO_RANGE_M);
  resetKartStateForTests();
  setKartClientId(null);
}

// --- Continuous re-evaluation: a closer passer-by steals the lock ---
{
  setKartClientId('test-driver');
  const state = createKartState();
  state.missiles = 1;
  const player = { kind: 'player', id: 'test-driver', lat: 0, lon: 0, yawDeg: 0, speedMps: 0 };
  const a = { kind: 'rival', id: 'rival-a', lat: 300 / 60, lon: 0, speedMps: 0 }; // 300 display m north
  const b = { kind: 'rival', id: 'rival-b', lat: 0, lon: 400 / 60, speedMps: 0 }; // 400 display m east
  const torp = fireTorpedo(state, { lat: 0, lon: 0, yawDeg: 0, nowMs: 1000, vehicles: [player, a, b] });
  eq('initial lock is the closer rival', torp.targetId, 'rival-a');
  // Fly a few frames toward A (300 m/s → ~5 m/frame).
  for (let i = 0; i < 10; i++) {
    stepTorpedoes(state, { dt: 0.016, nowMs: 1000 + i * 16, vehicles: [player, a, b] });
  }
  t('torpedo has moved north toward A', torp.lat > 4 / 60);
  eq('lock is still A before anyone crosses closer', torp.targetId, 'rival-a');
  // B crosses in close — 150 m east of the missile's current spot,
  // while A is still ~250 m away. 150 m is inside the 600 m range
  // and outside the 100 m seek floor, so the steal still happens;
  // at 40 m (the old geometry) the floor would forbid it.
  b.lat = torp.lat;
  b.lon = torp.lon + 150 / 60; // 150 display m east at the equator
  stepTorpedoes(state, { dt: 0.016, nowMs: 2000, vehicles: [player, a, b] });
  eq('a closer passer-by STEALS the lock mid-flight', torp.targetId, 'rival-b');
  eq('the stolen lock carries the new kind too', torp.targetKind, 'rival');
  resetKartStateForTests();
  setKartClientId(null);
}

// --- Minimum seek distance (Merlin, 2026-11-17): the seeker only
// arms at or beyond 100 display m — the turn radius at the
// missile's minimum speed (300 m/s ÷ 3 rad/s). Inside the floor
// the torpedo flies straight dumb-fire: no lock, no switching.
// ---
{
  eq('the seek floor is 100 display m', TORPEDO_MIN_SEEK_DISTANCE_M, 100);
  setKartClientId('test-driver');
  const player = { kind: 'player', id: 'test-driver', lat: 0, lon: 0, yawDeg: 0, speedMps: 0 };

  // nearestTarget honours the floor only when asked: the default
  // (no minDistM) still returns the closest vehicle at any range.
  const near50 = { kind: 'rival', id: 'rival-near', lat: 50 / 60, lon: 0, speedMps: 0 };
  const far300 = { kind: 'rival', id: 'rival-far', lat: 300 / 60, lon: 0, speedMps: 0 };
  const ungated = nearestTarget({ lat: 0, lon: 0, vehicles: [player, near50, far300], excludeKind: 'player', excludeId: 'test-driver' });
  eq('without minDistM the closest vehicle still wins', ungated.id, 'rival-near');
  const gated = nearestTarget({ lat: 0, lon: 0, vehicles: [player, near50, far300], excludeKind: 'player', excludeId: 'test-driver', minDistM: TORPEDO_MIN_SEEK_DISTANCE_M });
  eq('with the floor the 50 m vehicle is skipped', gated.id, 'rival-far');

  // Fire: a target at 99 m gets no lock; at 101 m it locks.
  const state = createKartState();
  state.missiles = 2;
  const close99 = { kind: 'rival', id: 'rival-99', lat: 99 / 60, lon: 0, speedMps: 0 };
  const dumb = fireTorpedo(state, { lat: 0, lon: 0, yawDeg: 0, nowMs: 1000, vehicles: [player, close99] });
  eq('a target at 99 m gets no lock', dumb.targetId, null);
  eq('a lockless torpedo flies at the 300 floor speed', dumb.speedMps, TORPEDO_MIN_SPEED_MPS);
  const open101 = { kind: 'rival', id: 'rival-101', lat: 101 / 60, lon: 0, speedMps: 0 };
  const locked = fireTorpedo(state, { lat: 0, lon: 0, yawDeg: 0, nowMs: 1000, vehicles: [player, open101] });
  eq('a target at 101 m locks', locked.targetId, 'rival-101');

  // A lockless torpedo flying at a target inside the floor NEVER
  // arms the lock as it closes in — it flies straight, and still
  // hits a target dead ahead (the 8 m hit check is independent
  // of the lock).
  const state2 = createKartState();
  state2.missiles = 1;
  const deadAhead = { kind: 'rival', id: 'rival-ahead', lat: 50 / 60, lon: 0, speedMps: 0 };
  const straight = fireTorpedo(state2, { lat: 0, lon: 0, yawDeg: 0, nowMs: 1000, vehicles: [player, deadAhead] });
  eq('a 50 m target dead ahead gets no lock', straight.targetId, null);
  let hit = null;
  let armedInFlight = false;
  let yawHeld = true;
  for (let i = 0; i < 10 && !hit; i++) {
    const evs = stepTorpedoes(state2, { dt: 0.05, nowMs: 1000 + i * 50, vehicles: [player, deadAhead] });
    if (straight.targetId !== null) armedInFlight = true;
    if (straight.yawDeg !== 0) yawHeld = false;
    hit = evs.find((e) => e.type === 'hit');
  }
  t('no lock arms as the missile closes in', !armedInFlight);
  t('the lockless missile flies straight (yaw never changes)', yawHeld);
  t('the dumb-fire missile still hits a dead-ahead target', !!hit);
  eq('the dumb-fire hit names the target', hit && hit.targetId, 'rival-ahead');

  // A lock already held is KEPT as the missile closes inside the
  // floor — the gate is on arming, not holding — and it still
  // lands the hit.
  const state3 = createKartState();
  state3.missiles = 1;
  const hold = { kind: 'rival', id: 'rival-hold', lat: 300 / 60, lon: 0, speedMps: 0 };
  const chaser = fireTorpedo(state3, { lat: 0, lon: 0, yawDeg: 0, nowMs: 1000, vehicles: [player, hold] });
  eq('a 300 m target locks', chaser.targetId, 'rival-hold');
  for (let i = 0; i < 14; i++) {
    stepTorpedoes(state3, { dt: 0.05, nowMs: 1000 + i * 50, vehicles: [player, hold] });
  }
  t('the missile has closed inside the floor (~90 m out)', haversineDisplayM(chaser.lat, chaser.lon, hold.lat, hold.lon) < 100);
  eq('the lock is held inside the floor', chaser.targetId, 'rival-hold');
  let heldHit = null;
  for (let i = 0; i < 10 && !heldHit; i++) {
    const evs = stepTorpedoes(state3, { dt: 0.05, nowMs: 2000 + i * 50, vehicles: [player, hold] });
    heldHit = evs.find((e) => e.type === 'hit');
  }
  t('the held lock still lands the hit', !!heldHit);

  // The rival path honours the same floor — both the direct
  // player fallback (stepRivals) and the vehicles list.
  const state4 = createKartState();
  const rivalClose = { id: 'rival-c', lat: 50 / 60, lon: 0, yawDeg: 180, missiles: 1, missileColors: ['red'], lastOrbColor: 'red' };
  const rtClose = fireRivalTorpedo(state4, rivalClose, { nowMs: 1000, player: { lat: 0, lon: 0, speedMps: 0 } });
  eq('a rival 50 m from the player fires dumb (no lock)', rtClose.targetKind, null);
  const rivalFar = { id: 'rival-f', lat: 300 / 60, lon: 0, yawDeg: 180, missiles: 1, missileColors: ['red'], lastOrbColor: 'red' };
  const rtFar = fireRivalTorpedo(state4, rivalFar, { nowMs: 1000, player: { lat: 0, lon: 0, speedMps: 0 } });
  eq('a rival 300 m from the player locks the player', rtFar.targetKind, 'player');
  const rivalList = { id: 'rival-l', lat: 0, lon: 0, yawDeg: 0, missiles: 1, missileColors: ['red'], lastOrbColor: 'red' };
  const nearPlayer = { kind: 'player', id: 'player', lat: 50 / 60, lon: 0, speedMps: 0 };
  const farRival = { kind: 'rival', id: 'rival-other', lat: 300 / 60, lon: 0, speedMps: 0 };
  const rtList = fireRivalTorpedo(state4, rivalList, { nowMs: 1000, vehicles: [nearPlayer, farRival] });
  eq('with a list, the 50 m player is skipped for the 300 m rival', rtList.targetId, 'rival-other');
  resetKartStateForTests();
  setKartClientId(null);
}

// --- Fire rules: one tap = one missile; 0 = no fire; speed law ---
{
  setKartClientId('test-driver');
  const state = createKartState();
  const player = { kind: 'player', id: 'test-driver', lat: 0, lon: 0, yawDeg: 0, speedMps: 0 };
  eq('Fire at 0 missiles returns null', fireTorpedo(state, { lat: 0, lon: 0, yawDeg: 0, nowMs: 1000, vehicles: [player] }), null);
  state.missiles = 2;
  const slow = { kind: 'rival', id: 'rival-slow', lat: 100 / 60, lon: 0, speedMps: 100 };
  const t1 = fireTorpedo(state, { lat: 0, lon: 0, yawDeg: 0, nowMs: 1000, vehicles: [player, slow] });
  eq('one tap spends exactly one missile', state.missiles, 1);
  eq('slow target → floor speed 300 m/s', t1.speedMps, TORPEDO_MIN_SPEED_MPS);
  const fast = { kind: 'rival', id: 'rival-fast', lat: 100 / 60, lon: 0, speedMps: 400 };
  const t2 = fireTorpedo(state, { lat: 0, lon: 0, yawDeg: 0, nowMs: 1000, vehicles: [player, fast] });
  eq('fast target → 1.3× target speed', t2.speedMps, 400 * TORPEDO_SPEED_FACTOR);
  // A rival's torpedo locks the player when only the player is known.
  const rival = { id: 'rival-x', lat: 100 / 60, lon: 0, yawDeg: 180, missiles: 1, missileColors: ['cyan'], lastOrbColor: 'cyan' };
  const rt = fireRivalTorpedo(state, rival, { nowMs: 1000, player: { lat: 0, lon: 0, speedMps: 0 } });
  eq('rival torpedo targets the player', rt.targetKind, 'player');
  eq('rival torpedo wears its orb colour', rt.color, 'cyan');
  resetKartStateForTests();
  setKartClientId(null);
}

// --- Torpedo hit: the FIRST vehicle touched, then flip 3x → explode ---
{
  setKartClientId('test-driver');
  const state = createKartState();
  state.missiles = 1;
  const player = { kind: 'player', id: 'test-driver', lat: 0, lon: 0, yawDeg: 0, speedMps: 0 };
  const target = { kind: 'rival', id: 'rival-hit', lat: 100 / 60, lon: 0, speedMps: 0 }; // 100 display m north
  fireTorpedo(state, { lat: 0, lon: 0, yawDeg: 0, nowMs: 1000, vehicles: [player, target] });
  let hit = null;
  for (let i = 0; i < 50 && !hit; i++) {
    const evs = stepTorpedoes(state, { dt: 0.05, nowMs: 1000 + i * 50, vehicles: [player, target] });
    hit = evs.find((e) => e.type === 'hit');
  }
  t('the torpedo reaches and hits its target', !!hit);
  eq('hit names the target kind', hit.targetKind, 'rival');
  eq('hit names the target id', hit.targetId, 'rival-hit');
  t('hit lands at the target (within the 8 m hit radius)', near(hit.lat, target.lat, 8 / 60 + 0.01) && near(hit.lon, target.lon, 8 / 60 + 0.01));
  eq('the torpedo is gone after the hit', state.torpedoes.length, 0);
  resetKartStateForTests();
  setKartClientId(null);
}

// --- Hit sequence: flip 3 times, explode, respawn at the blast spot ---
{
  const hit = createHit();
  eq('a fresh hit is phase none', hit.phase, 'none');
  startHit(hit, { lat: 10, lon: 20, nowMs: 5000 });
  eq('startHit → flipping', hit.phase, 'flipping');
  eq('flip is 3 turns', FLIP_TURNS, 3);
  let adv = advanceHit(hit, 5000 + 750);
  eq('mid-flip → still flipping', adv.phase, 'flipping');
  t('half the flip is 1.5 turns', near(flipRollAngle(hit, 5000 + 750), 1.5 * Math.PI * 2, 1e-9));
  adv = advanceHit(hit, 5000 + FLIP_MS);
  eq('after 1500 ms → exploding', adv.phase, 'exploding');
  eq('no respawn while exploding', adv.respawn, null);
  adv = advanceHit(hit, 5000 + FLIP_MS + EXPLODE_MS);
  eq('after flip + explode → done', adv.phase, 'done');
  t('respawn is exactly the blast spot', adv.respawn && adv.respawn.lat === 10 && adv.respawn.lon === 20);
  const r = respawnFor(10, 20, 8000);
  eq('respawn keeps the blast lat', r.lat, 10);
  eq('respawn keeps the blast lon', r.lon, 20);
  eq('respawn speed is 0', r.speed, 0);
  eq('respawn restores integrity to 100', r.integrity, INTEGRITY_MAX);
  eq('respawn is invulnerable for 15 s', r.invulnUntilMs, 8000 + INVULN_MS);
  // An invulnerable vehicle is passed through, never hit.
  setKartClientId('test-driver');
  const state = createKartState();
  state.missiles = 1;
  const player = { kind: 'player', id: 'test-driver', lat: 0, lon: 0, yawDeg: 0, speedMps: 0 };
  const ghost = { kind: 'rival', id: 'rival-ghost', lat: 100 / 60, lon: 0, speedMps: 0, invulnUntilMs: 999999 };
  fireTorpedo(state, { lat: 0, lon: 0, yawDeg: 0, nowMs: 1000, vehicles: [player, ghost] });
  let anyHit = false;
  for (let i = 0; i < 20; i++) {
    const evs = stepTorpedoes(state, { dt: 0.05, nowMs: 1000 + i * 50, vehicles: [player, ghost] });
    if (evs.some((e) => e.type === 'hit')) anyHit = true;
  }
  t('an invulnerable vehicle is never hit', !anyHit);
  resetKartStateForTests();
  setKartClientId(null);
}

// --- 15 s spawn immunity (Merlin, 2026-11-16 — the 60 s video:
// torpedoed at 0 km/h within seconds of spawning, twice) ---
{
  eq('the immunity window is 15 s', INVULN_MS, 15000);
  // respawnFor grants the full window (pinned by name above too).
  const r = respawnFor(10, 20, 8000);
  eq('respawn grants exactly 15 s of immunity', r.invulnUntilMs - 8000, 15000);

  // A shielded vehicle is never a lock: nearestTarget skips it
  // when nowMs is passed, and falls back to the next vehicle.
  setKartClientId('test-driver');
  const player = { kind: 'player', id: 'test-driver', lat: 0, lon: 0, yawDeg: 0, speedMps: 0 };
  const shielded = { kind: 'rival', id: 'rival-shield', lat: 100 / 60, lon: 0, speedMps: 0, invulnUntilMs: 999999 };
  const open = { kind: 'rival', id: 'rival-open', lat: 300 / 60, lon: 0, speedMps: 0 };
  const lock = nearestTarget({ lat: 0, lon: 0, vehicles: [player, shielded, open], excludeKind: 'player', excludeId: 'test-driver', nowMs: 1000 });
  eq('a shielded vehicle is never the lock', lock.id, 'rival-open');
  // Without nowMs (old callers) the shield is invisible — the
  // lock still lands on the closer vehicle.
  const legacy = nearestTarget({ lat: 0, lon: 0, vehicles: [player, shielded, open], excludeKind: 'player', excludeId: 'test-driver' });
  eq('without nowMs the old lock rule stands', legacy.id, 'rival-shield');

  // A torpedo already flying at a target that gains a shield
  // drops the lock and flies straight — it never shadows the
  // driver waiting for the shield to drop, and never hits them.
  const state = createKartState();
  state.missiles = 1;
  const target = { kind: 'rival', id: 'rival-mark', lat: 100 / 60, lon: 0, speedMps: 0 };
  const torp = fireTorpedo(state, { lat: 0, lon: 0, yawDeg: 0, nowMs: 1000, vehicles: [player, target] });
  eq('lock starts on the target', torp.targetId, 'rival-mark');
  target.invulnUntilMs = 999999; // shield goes up mid-flight
  stepTorpedoes(state, { dt: 0.05, nowMs: 1100, vehicles: [player, target] });
  eq('the lock drops the moment the shield goes up', torp.targetId, null);
  let shieldHit = false;
  for (let i = 0; i < 20; i++) {
    const evs = stepTorpedoes(state, { dt: 0.05, nowMs: 1100 + i * 50, vehicles: [player, target] });
    if (evs.some((e) => e.type === 'hit')) shieldHit = true;
  }
  t('a shielded vehicle is never hit mid-flight', !shieldHit);
  resetKartStateForTests();

  // Rivals hold their fire while the player is shielded.
  const state2 = createKartState();
  state2.rivals = buildRivals({ playerLat: 0, playerLon: 0, playerCraftId: 'wedge-supercar' });
  const near = state2.rivals[0];
  near.lat = 200 / 60; // 200 display m north — inside the 500 m fire range
  near.lon = 0;
  near.missiles = 3; // at cap, so a collected orb cannot change the count
  near.lastFireMs = 0; // cooldown long past at nowMs 10000
  const shieldedPlayer = { lat: 0, lon: 0, speedMps: 0, invulnUntilMs: 999999 };
  const held = stepRivals(state2, { dt: 0.1, nowMs: 10000, player: shieldedPlayer });
  eq('a rival holds fire on a shielded player', held.fired.length, 0);
  eq('the held missiles stay banked', near.missiles, 3);
  const openPlayer = { lat: 0, lon: 0, speedMps: 0, invulnUntilMs: 0 };
  const loosed = stepRivals(state2, { dt: 0.1, nowMs: 10000, player: openPlayer });
  eq('the same rival fires once the shield is down', loosed.fired.length, 1);
  resetKartStateForTests();

  // Bumper damage is gated by the shield too.
  const state3 = createKartState();
  state3.rivals = [{ id: 'rival-c', integrity: INTEGRITY_MAX }];
  state3.invulnUntilMs = 999999;
  const a = { kind: 'player', id: 'driver' };
  const b = { kind: 'rival', id: 'rival-c' };
  const blocked = applyCollisionDamage(state3, { a, b, relSpeedMps: 50, nowMs: 1000 });
  eq('a shielded player takes no bumper damage', blocked.length, 0);
  eq('shielded integrity stays 100', state3.integrity, 100);
  state3.invulnUntilMs = 0;
  const landed = applyCollisionDamage(state3, { a, b, relSpeedMps: 50, nowMs: 1000 });
  eq('the same contact lands once the shield is down', landed.length, 2);
  eq('unshielded integrity drops to 85', state3.integrity, 85);
  resetKartStateForTests();
  setKartClientId(null);
}

// --- Bumper-car collisions: damage numbers, hidden meter, pair cooldown ---
{
  eq('below 5 m/s relative → no damage (a nudge)', collisionDamageFor(4.9), 0);
  eq('at the 5 m/s floor → 10 + 1', collisionDamageFor(5), COLLISION_BASE_DMG + 1);
  eq('10 m/s → 11', collisionDamageFor(10), 11);
  eq('50 m/s → 15', collisionDamageFor(50), 15);
  eq('300 m/s → capped at 40', collisionDamageFor(300), COLLISION_DMG_CAP);
  eq('400 m/s → still capped at 40', collisionDamageFor(400), COLLISION_DMG_CAP);
  // Both vehicles take the SAME damage.
  const state = createKartState();
  state.rivals = [{ id: 'rival-c', integrity: INTEGRITY_MAX }];
  const a = { kind: 'player', id: 'driver' };
  const b = { kind: 'rival', id: 'rival-c' };
  const out = applyCollisionDamage(state, { a, b, relSpeedMps: 50, nowMs: 1000 });
  eq('a contact reports both vehicles', out.length, 2);
  t('both take the same 15 damage', out.every((o) => o.dmg === 15));
  eq('player integrity drops to 85', state.integrity, 85);
  eq('rival integrity drops to 85', state.rivals[0].integrity, 85);
  t('no boom at 85', out.every((o) => !o.boom));
  // One hit per pair per second.
  const again = applyCollisionDamage(state, { a, b, relSpeedMps: 50, nowMs: 1500 });
  eq('a second hit inside 1 s is swallowed', again.length, 0);
  const later = applyCollisionDamage(state, { a, b, relSpeedMps: 50, nowMs: 1000 + COLLISION_PAIR_COOLDOWN_MS + 1 });
  eq('after 1 s the pair can hit again', later.length, 2);
  // Depletion = BOOM.
  state.integrity = 5;
  state.rivals[0].integrity = 5;
  const boom = applyCollisionDamage(state, { a, b, relSpeedMps: 50, nowMs: 5000 });
  t('integrity 0 → boom for both', boom.every((o) => o.boom));
  eq('integrity floors at 0, never negative', state.integrity, 0);
  // THE METER IS HIDDEN: the HUD snapshot carries no integrity field.
  t('kartHud has no integrity field', !('integrity' in kartHud));
  t('kartHud shows only speed, boost, missiles, hit phase, notice',
    Object.keys(kartHud).sort().join(',') === 'boostActive,hitPhase,missiles,notice,noticeUntilMs,speedKmh,speedMps');
  resetKartStateForTests();
}

// --- Rivals: 5, deterministic, spawn ring, speed ramp ---
{
  const mk = () => buildRivals({ playerLat: 53.5, playerLon: -113.5, playerCraftId: 'wedge-supercar' });
  const r1 = mk();
  const r2 = mk();
  eq('exactly 5 rivals', r1.length, RIVAL_COUNT);
  t('rival build is deterministic', JSON.stringify(r1) === JSON.stringify(r2));
  t('no rival drives the player craft', r1.every((r) => r.craftId !== 'wedge-supercar'));
  const ids = new Set(r1.map((r) => r.id));
  eq('rival ids are unique', ids.size, 5);
  for (const r of r1) {
    const d = haversineDisplayM(53.5, -113.5, r.lat, r.lon);
    t(`rival ${r.id} spawns 800–1500 m out (${Math.round(d)} m)`, d >= 800 && d <= 1500);
    t(`rival ${r.id} holds 0 missiles at spawn`, r.missiles === 0);
    eq(`rival ${r.id} starts at full integrity`, r.integrity, INTEGRITY_MAX);
  }
  // Speed ramps up toward 60% of the craft's top speed, never past it.
  const state = createKartState();
  state.rivals = mk();
  const player = { lat: 53.5, lon: -113.5, speedMps: 0 };
  for (let i = 0; i < 120; i++) stepRivals(state, { dt: 0.1, nowMs: 1000 + i * 100, player });
  for (const r of state.rivals) {
    const top = getVehicle(r.craftId).tuning.maxSpeed * RIVAL_SPEED_FACTOR;
    t(`rival ${r.id} ramps up (speed ${r.speed.toFixed(1)} > 0)`, r.speed > 0);
    t(`rival ${r.id} never exceeds 60% top speed`, r.speed <= top + 0.01);
  }
  resetKartStateForTests();
}

// --- Spawn separation (Merlin, 2026-11-15): no vehicles ever
// spawn on top of each other — 25 m minimum between the player
// spawn, every rival, and every peer render position. ---
{
  t('minimum separation is 25 m (clears the 7 m hauler several times over)',
    SPAWN_MIN_SEPARATION_M === 25);
  const mk = () => buildRivals({ playerLat: 53.5, playerLon: -113.5, playerCraftId: 'wedge-supercar' });
  const rivals = mk();
  for (const r of rivals) {
    const d = haversineDisplayM(53.5, -113.5, r.lat, r.lon);
    t(`rival ${r.id} spawns >= 25 m from the player (${Math.round(d)} m)`, d >= SPAWN_MIN_SEPARATION_M);
  }
  for (let i = 0; i < rivals.length; i++) {
    for (let j = i + 1; j < rivals.length; j++) {
      const d = haversineDisplayM(rivals[i].lat, rivals[i].lon, rivals[j].lat, rivals[j].lon);
      t(`rivals ${rivals[i].id} / ${rivals[j].id} spawn >= 25 m apart (${Math.round(d)} m)`,
        d >= SPAWN_MIN_SEPARATION_M);
    }
  }
  // Separation holds across seeds, not just the default one.
  for (const seed of [1, 7, 42, 20261115, 999999]) {
    const rs = buildRivals({ playerLat: 0, playerLon: 0, playerCraftId: 'wedge-supercar', seed });
    let ok = true;
    for (let i = 0; i < rs.length; i++) {
      if (haversineDisplayM(0, 0, rs[i].lat, rs[i].lon) < SPAWN_MIN_SEPARATION_M) ok = false;
      for (let j = i + 1; j < rs.length; j++) {
        if (haversineDisplayM(rs[i].lat, rs[i].lon, rs[j].lat, rs[j].lon) < SPAWN_MIN_SEPARATION_M) ok = false;
      }
    }
    t(`seed ${seed}: all rivals >= 25 m apart and >= 25 m from the player`, ok);
  }
  // spawnPointClearOf unit checks (the pure helper buildRivals uses).
  t('clear point passes', spawnPointClearOf(0, 0, [{ lat: 1, lon: 1 }]) === true);
  t('point 10 m from another fails',
    spawnPointClearOf(0, 0, [{ lat: 10 / 60, lon: 0 }]) === false);
  t('point 30 m from another passes (minimum is 25)',
    spawnPointClearOf(0, 0, [{ lat: 30 / 60, lon: 0 }]) === true);
  t('empty others list passes', spawnPointClearOf(0, 0, []) === true);
  t('custom minimum respected',
    spawnPointClearOf(0, 0, [{ lat: 45 / 60, lon: 0 }], 50) === false
    && spawnPointClearOf(0, 0, [{ lat: 45 / 60, lon: 0 }], 40) === true);
}

// --- Globe click: world point → lat/lon round-trip ---
{
  const lat = 53.5462, lon = -113.4912;
  const local = latLonToVec3(lat, lon, GLOBE_RADIUS);
  const world = { x: local.x + GLOBE_CENTER.x, y: local.y + GLOBE_CENTER.y, z: local.z + GLOBE_CENTER.z };
  const back = globeWorldPointToLatLon(world, GLOBE_CENTER, IDENTITY_QUAT);
  t('identity spin round-trips the click', back && near(back.lat, lat, 1e-6) && near(back.lon, lon, 1e-6));
  // Spun globe: rotate the point by the spin quaternion first —
  // the helper must un-rotate it back to the same lat/lon.
  const angle = 0.5;
  const spin = { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) };
  const spun = rotateByQuat(local, spin);
  const spunWorld = { x: spun.x + GLOBE_CENTER.x, y: spun.y + GLOBE_CENTER.y, z: spun.z + GLOBE_CENTER.z };
  const backSpun = globeWorldPointToLatLon(spunWorld, GLOBE_CENTER, spin);
  t('spun globe round-trips the click', backSpun && near(backSpun.lat, lat, 1e-6) && near(backSpun.lon, lon, 1e-6));
  eq('a click at the centre returns null', globeWorldPointToLatLon(GLOBE_CENTER, GLOBE_CENTER, IDENTITY_QUAT), null);
  eq('a null point returns null', globeWorldPointToLatLon(null), null);
}

// --- Round 3 (Merlin, 2026-11-15): NO vehicle ever spawns —
// or stays — on top of another. The build-time 25 m rule was
// already pinned above; what was missing was everything AFTER
// spawn: the bumper code only deals damage, it never moves a
// vehicle, so a rival that drives into the player (or a respawn
// that lands on one) would interpenetrate and stay there. ---
{
  // The gap two vehicles must keep: half-lengths + 1 m — the
  // same threshold the bumper collision uses to detect a hit.
  eq('gap for two Aventadors (4.6 m each)', vehicleGapM(4.6, 4.6), 5.6);
  eq('gap for hauler (7 m) vs bike (2.2 m)', vehicleGapM(7, 2.2), 5.6);
  eq('gap for two haulers', vehicleGapM(7, 7), 8);

  // separateFrom: overlapping pair → b lands exactly at the gap.
  const a = { lat: 53.5, lon: -113.5 };
  const close = { lat: 53.5 + 3 / 60, lon: -113.5 }; // 3 display m north
  const pushed = separateFrom(a, close, 4.6, 4.6);
  const pushedD = haversineDisplayM(a.lat, a.lon, pushed.lat, pushed.lon);
  t('separateFrom pushes b to exactly the gap', Math.abs(pushedD - 5.6) < 0.01);
  const far = { lat: 53.5 + 30 / 60, lon: -113.5 }; // 30 display m north, past the gap
  const kept = separateFrom(a, far, 4.6, 4.6);
  t('separateFrom leaves a clear pair untouched', kept.lat === far.lat && kept.lon === far.lon);
  const same = separateFrom(a, { lat: 53.5, lon: -113.5 }, 4.6, 4.6);
  const sameD = haversineDisplayM(a.lat, a.lon, same.lat, same.lon);
  t('separateFrom pushes a coincident pair apart to the gap', Math.abs(sameD - 5.6) < 0.01);

  // separateVehicles: the player (fixed) never moves; a rival
  // inside the gap is pushed out; rival pairs separate too.
  const player = { lat: 53.5, lon: -113.5, fixed: true };
  const rival = { lat: 53.5 + 2 / 60, lon: -113.5, craftId: 'sports-car' }; // 2 display m north
  const rival2 = { lat: 53.5 + 2.5 / 60, lon: -113.5 + 2 / 60, craftId: 'sports-car' };
  const lenOf = (v) => (v.fixed ? 4.6 : (getVehicle(v.craftId) || {}).lengthM || 4.6);
  const moved = separateVehicles([player, rival, rival2], lenOf);
  t('separateVehicles moves the overlapping rivals', moved > 0);
  t('player never moves (fixed — the camera anchor)',
    player.lat === 53.5 && player.lon === -113.5);
  for (const [x, y, name] of [[player, rival, 'player/rival'], [player, rival2, 'player/rival2'], [rival, rival2, 'rival/rival2']]) {
    const d = haversineDisplayM(x.lat, x.lon, y.lat, y.lon);
    t(`${name} end >= gap apart (${d.toFixed(2)} m)`, d >= vehicleGapM(lenOf(x), lenOf(y)) - 0.01);
  }
  // A pair of fixed vehicles is left alone (the caller must not
  // pass two fixed vehicles that overlap).
  const f1 = { lat: 0, lon: 0, fixed: true };
  const f2 = { lat: 0.00001, lon: 0, fixed: true };
  eq('two fixed vehicles are not moved', separateVehicles([f1, f2], () => 4.6), 0);
  // A clear set moves nothing.
  const clearSet = [
    { lat: 53.5, lon: -113.5, fixed: true },
    { lat: 53.5 + 30 / 60, lon: -113.5, craftId: 'sports-car' }, // 30 display m out
  ];
  eq('a clear set moves nothing', separateVehicles(clearSet, lenOf), 0);

  // Driving simulation: rivals wander for 15 s around a
  // stationary player, the separation pass running every frame
  // (the EarthKart frame loop) — no rival is ever inside the
  // gap of the player afterwards, however the wander turns.
  for (const seed of [20261115, 7, 42]) {
    const state = createKartState();
    state.rivals = buildRivals({ playerLat: 53.5, playerLon: -113.5, playerCraftId: 'wedge-supercar', seed });
    const p = { lat: 53.5, lon: -113.5, speedMps: 0 };
    let worstClearance = Infinity; // d - gap, per rival, after separation
    let playerMoved = false;
    for (let i = 0; i < 150; i++) {
      stepRivals(state, { dt: 0.1, nowMs: 1000 + i * 100, player: p });
      separateVehicles(
        [{ lat: p.lat, lon: p.lon, fixed: true, lengthM: 4.6 }, ...state.rivals],
        (v) => (v.lengthM ? v.lengthM : (getVehicle(v.craftId) || {}).lengthM || 4.6),
      );
      if (p.lat !== 53.5 || p.lon !== -113.5) playerMoved = true;
      for (const r of state.rivals) {
        const gap = vehicleGapM(4.6, (getVehicle(r.craftId) || {}).lengthM || 4.6);
        worstClearance = Math.min(worstClearance, haversineDisplayM(p.lat, p.lon, r.lat, r.lon) - gap);
      }
    }
    t(`seed ${seed}: 15 s of rival driving, none ever inside its gap (worst clearance ${worstClearance.toFixed(2)} m)`,
      worstClearance >= -0.01);
    t(`seed ${seed}: the player never moves during separation`, !playerMoved);
    resetKartStateForTests();
  }

  // clearSpawnPoint — the tapped spawn point itself, checked:
  // a clear tap stands exactly; an occupied tap walks to the
  // nearest clear point 25 m out.
  const tap = { lat: 53.5, lon: -113.5 };
  const rivals = buildRivals({ playerLat: tap.lat, playerLon: tap.lon, playerCraftId: 'wedge-supercar' });
  const keptTap = clearSpawnPoint(tap.lat, tap.lon, rivals);
  t('a clear tap stands exactly as tapped', keptTap.lat === tap.lat && keptTap.lon === tap.lon);
  const occupied = [{ lat: tap.lat + 10 / 60, lon: tap.lon }]; // 10 display m away
  const movedTap = clearSpawnPoint(tap.lat, tap.lon, occupied);
  const movedTapD = haversineDisplayM(movedTap.lat, movedTap.lon, occupied[0].lat, occupied[0].lon);
  t('an occupied tap walks to >= 25 m from the vehicle', movedTapD >= 25 - 0.01);
  t('the walked tap stays near the tap (<= 100 m)',
    haversineDisplayM(movedTap.lat, movedTap.lon, tap.lat, tap.lon) <= 100.01);
  const again = clearSpawnPoint(tap.lat, tap.lon, occupied);
  t('clearSpawnPoint is deterministic', again.lat === movedTap.lat && again.lon === movedTap.lon);
  const emptyTap = clearSpawnPoint(tap.lat, tap.lon, []);
  t('empty others → the tap stands', emptyTap.lat === tap.lat && emptyTap.lon === tap.lon);

  // respawnFor / advanceHit with others: a clear blast spot
  // stands exactly; an occupied one walks 25 m clear.
  const blast = respawnFor(10, 20, 8000, [{ lat: 10 + 5 / 60, lon: 20 }]);
  t('occupied blast spot walks >= 25 m clear',
    haversineDisplayM(blast.lat, blast.lon, 10 + 5 / 60, 20) >= 25 - 0.01);
  eq('respawn still restores integrity', blast.integrity, INTEGRITY_MAX);
  eq('respawn still stops the vehicle', blast.speed, 0);
  eq('respawn still grants 15 s invulnerability', blast.invulnUntilMs, 8000 + INVULN_MS);
  const clearBlast = respawnFor(10, 20, 8000, [{ lat: 11, lon: 20 }]);
  t('clear blast spot stands exactly', clearBlast.lat === 10 && clearBlast.lon === 20);
  const noOthers = respawnFor(10, 20, 8000);
  t('no others → the blast spot stands exactly', noOthers.lat === 10 && noOthers.lon === 20);
  const hit = createHit();
  startHit(hit, { lat: 10, lon: 20, nowMs: 1000 });
  advanceHit(hit, 1000 + FLIP_MS, [{ lat: 10 + 5 / 60, lon: 20 }]);
  const adv = advanceHit(hit, 1000 + FLIP_MS + EXPLODE_MS, [{ lat: 10 + 5 / 60, lon: 20 }]);
  t('advanceHit respawn walks off an occupied blast spot',
    adv.respawn && haversineDisplayM(adv.respawn.lat, adv.respawn.lon, 10 + 5 / 60, 20) >= 25 - 0.01);
  const hit2 = createHit();
  startHit(hit2, { lat: 10, lon: 20, nowMs: 1000 });
  advanceHit(hit2, 1000 + FLIP_MS);
  const adv2 = advanceHit(hit2, 1000 + FLIP_MS + EXPLODE_MS);
  t('advanceHit without others respawns at the blast spot exactly',
    adv2.respawn && adv2.respawn.lat === 10 && adv2.respawn.lon === 20);
}

// --- Speedometer: actual movement, clamped + smoothed (item 4,
// Merlin's 55.9 s Muscle Car video, 2026-11-16) ---
{
  eq('needle time constant is 400 ms', SPEEDO_SMOOTH_TAU_MS, 400);
  eq('needle slew cap is 500 km/h per second', SPEEDO_MAX_SLEW_KMH_PER_S, 500);
  eq('needle snap band is 1 km/h', SPEEDO_SNAP_KMH, 1);
  eq('teleport tolerance is 1.02× top speed', SPEEDO_TELEPORT_TOLERANCE, 1.02);

  // Displacement: 100 display m in 1 s is 360 km/h. The needle
  // measures movement, not the commanded speed — and in display
  // metres, the unit the car actually drives in (1 deg = 60
  // display m on the 55-unit globe).
  t('displacement speed: 100 display m in 1 s reads 360 km/h',
    near(displacementSpeedKmh(0, 0, 100 / 60, 0, 1000), 360, 0.5));
  eq('displacement speed is 0 with no elapsed time',
    displacementSpeedKmh(0, 0, 0.001, 0, 0), 0);
  eq('displacement speed is 0 with a bad fix',
    displacementSpeedKmh(0, 0, NaN, 0, 1000), 0);
  eq('displacement speed is 0 standing still',
    displacementSpeedKmh(10, 20, 10, 20, 250), 0);

  // Clamp + slew: a raw 9999 km/h against a 1601 top never
  // shows above the top — and never jumps more than 125 km/h
  // in one 250 ms poll (500 km/h per second).
  t('smoothed speed never exceeds the top speed',
    near(smoothSpeedKmh(0, 9999, 250, 1601), 125, 0.01));
  // The video's cliff, 375 → 29 in one poll, becomes 375 → 250:
  // the needle sweeps down instead of cliff-diving.
  t('a 375 → 29 raw step moves the needle to 250, not 29',
    near(smoothSpeedKmh(375, 29, 250, 1601), 250, 0.01));
  eq('needle snaps inside 1 km/h', smoothSpeedKmh(100, 100.5, 250, 1601), 100.5);
  eq('needle holds with no elapsed time', smoothSpeedKmh(375, 0, 0, 1601), 375);
  eq('negative raw speed reads 0', smoothSpeedKmh(0, -50, 250, 1601), 0);
  let v = 0;
  for (let i = 0; i < 20; i++) v = smoothSpeedKmh(v, 500, 250, 1601);
  t('needle converges on a held speed', near(v, 500, 1));

  // One poll's state: first fix baselines at 0 (spawn speed is 0).
  const first = stepDisplaySpeed(null, { lat: 0, lon: 0 }, 250, 1601);
  t('first fix baselines the needle at 0',
    first.kmh === 0 && first.lat === 0 && first.lon === 0);
  // Steady driving: 100 display m in 1 s → raw 360, smoothed
  // from 0 with tau 400 ms → 330.4 (slew cap 500 does not bind).
  // This is the stuck-at-0 regression pin: the old haversineM
  // read this step 1,855x high, tripped the teleport guard every
  // poll, and the needle HELD at 0 while driving.
  const driving = stepDisplaySpeed({ kmh: 0, lat: 0, lon: 0 }, { lat: 100 / 60, lon: 0 }, 1000, 1601);
  t('steady driving reads the real displacement speed (not stuck at 0)',
    near(driving.kmh, 330.4, 1) && driving.lat === 100 / 60);
  // Teleport / respawn jump: 1112 display m in 250 ms is
  // 16012 km/h — far past the top — so the baseline moves but
  // the needle HOLDS at 100 instead of reading top speed for a
  // poll.
  const jumped = stepDisplaySpeed({ kmh: 100, lat: 0, lon: 0 }, { lat: 1112 / 60, lon: 0 }, 250, 1601);
  t('a teleport jump re-baselines but holds the needle',
    jumped.kmh === 100 && jumped.lat === 1112 / 60);
  // Against a wall (or in a fall — the fix does not move): no
  // displacement, so the needle decays from 375 toward 0
  // instead of reading the commanded speed.
  const stuck = stepDisplaySpeed({ kmh: 375, lat: 10, lon: 20 }, { lat: 10, lon: 20 }, 250, 1601);
  t('no displacement decays the needle (wall / fall)',
    near(stuck.kmh, 250, 0.01));
  // A bad fix holds the previous state.
  const bad = stepDisplaySpeed({ kmh: 50, lat: 0, lon: 0 }, { lat: NaN, lon: 0 }, 250, 1601);
  t('a bad fix holds the previous state', bad.kmh === 50 && bad.lat === 0);
}

console.log(`earth1-kart: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
