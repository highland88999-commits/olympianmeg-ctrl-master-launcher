// tests/earth1-kart.test.mjs — Earth 1 Mario Kart systems
// (Merlin, 2026-11-15): torpedo orbs, heat-seeker torpedoes,
// flip-3x-explode, respawn-in-vehicle, bumper-car collisions
// (hidden integrity meter), AI rivals, click-to-spawn math.
//
// Pins: 6,480,000 orbs (one per 0.1° cell, virtual + deterministic);
// one orb = exactly one missile; the missile wears its orb's colour
// (scratched-metal wrap, deep-gold included); the HEAT-SEEKER lock
// rule — the missile ALWAYS tracks the CLOSEST vehicle TO THE
// MISSILE ITSELF, re-evaluated continuously, retargeting on a
// closer pass; torpedo hit = 3 flips then explosion; respawn is at
// the blast spot, in-vehicle, speed 0, integrity restored; the
// integrity meter is hidden (kartHud carries no integrity field);
// collision damage numbers + pair cooldown; 5 deterministic rivals;
// globe-click round-trip.
//
// Run: node tests/earth1-kart.test.mjs (from the repo root).
import assert from 'node:assert';
import {
  ORB_COUNT,
  ORB_TRIGGER_RADIUS_M,
  ORB_REARM_MS,
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
} from '../lib/earth/kart.js';
import { haversineM } from '../lib/earth/boost-pads.js';
import { getVehicle } from '../lib/earth/vehicles.js';
import { latLonToVec3 } from '../lib/geo.js';
import {
  GLOBE_CENTER,
  GLOBE_RADIUS,
  rotateByQuat,
  globeWorldPointToLatLon,
} from '../lib/earth/globe-click.js';
import { SCRATCHED_TEXTURES } from '../lib/portal/scratched-textures.js';
import { GOLD_TEXTURE_URL } from '../lib/portal/gold-texture.js';

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
  eq('orb count is 6,480,000 (1800 × 3600 cells)', ORB_COUNT, 6480000);
  const a = orbForCell(537, 665);
  const b = orbForCell(537, 665);
  t('same cell → identical orb', JSON.stringify(a) === JSON.stringify(b));
  const c = orbForCell(537, 666);
  t('neighbour cell → a different orb', c.lat !== a.lat || c.lon !== a.lon || c.color !== a.color);
  t('orb lat sits inside its cell', a.lat >= -90 + 537 * 0.1 && a.lat < -90 + 538 * 0.1);
  t('orb lon sits inside its cell', a.lon >= -180 + 665 * 0.1 && a.lon < -180 + 666 * 0.1);
  t('orb colour is one of the 9 scratched-metal colours', ORB_COLORS.includes(a.color));
  eq('9 orb colours (8 scratched + deep gold)', ORB_COLORS.length, 9);
  eq('orb cell lookup round-trips', orbCellFor(a.lat, a.lon).key, a.cellKey);
  const nearList = orbsNear(53.5462, -113.4912, 12000);
  t('orbsNear finds orbs within 12 km', nearList.length >= 1 && nearList.length <= 12);
  for (const o of nearList) {
    t('every returned orb is within range', haversineM(53.5462, -113.4912, o.lat, o.lon) <= 12000);
  }
}

// --- One orb = exactly one missile; re-arm after 60 s ---
{
  const state = createKartState();
  const orb = orbForCell(537, 665);
  // Drive a short segment straight through the orb.
  const dLat = 0.00005; // ~5.5 m
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
    lat: orb.lat + 0.0002, lon: orb.lon + 0.0002,
    prevLat: orb.lat - 0.0002, prevLon: orb.lon + 0.0002,
    driving: true, nowMs: 1000,
  }, (o) => collectPlayerMissile(state3, o));
  eq('a pass 20 m off the orb misses', miss.collected.length, 0);
}

// --- Missile wears its orb's colour — including deep gold ---
{
  // Find a deep-gold cell (colour index 8 in METAL_TILE_COLORS order).
  let goldOrb = null;
  for (let i = 0; i < 200 && !goldOrb; i++) {
    const o = orbForCell(900 + i, 1800 + i);
    if (o.color === 'deep-gold') goldOrb = o;
  }
  t('a deep-gold orb exists in the virtual set', !!goldOrb);
  const state = createKartState();
  setKartClientId('test-driver');
  collectPlayerMissile(state, goldOrb);
  const torp = fireTorpedo(state, {
    lat: goldOrb.lat, lon: goldOrb.lon, yawDeg: 0, nowMs: 1000, vehicles: [],
  });
  eq('the fired missile wears the deep-gold orb colour', torp.color, 'deep-gold');
  // Every orb colour has a wrap: the 8 scratched textures, and
  // deep gold is the archway gold texture.
  for (const color of ORB_COLORS) {
    t(`orb colour ${color} has a wrap texture`,
      color === 'deep-gold' ? typeof GOLD_TEXTURE_URL === 'string' && GOLD_TEXTURE_URL.length > 0
        : !!SCRATCHED_TEXTURES[color]);
  }
  t('scratched textures cover 8 colours', Object.keys(SCRATCHED_TEXTURES).length, 8);
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
  const behind = { kind: 'rival', id: 'rival-behind', lat: -0.0009, lon: 0, speedMps: 50 };
  const ahead = { kind: 'rival', id: 'rival-ahead', lat: 0.0027, lon: 0, speedMps: 50 };
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
  const far = { kind: 'rival', id: 'rival-far', lat: 0.01, lon: 0, speedMps: 50 }; // ~1113 m
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
  const a = { kind: 'rival', id: 'rival-a', lat: 0.0027, lon: 0, speedMps: 0 }; // 300 m north
  const b = { kind: 'rival', id: 'rival-b', lat: 0, lon: 0.0036, speedMps: 0 }; // 400 m east
  const torp = fireTorpedo(state, { lat: 0, lon: 0, yawDeg: 0, nowMs: 1000, vehicles: [player, a, b] });
  eq('initial lock is the closer rival', torp.targetId, 'rival-a');
  // Fly a few frames toward A (300 m/s → ~5 m/frame).
  for (let i = 0; i < 10; i++) {
    stepTorpedoes(state, { dt: 0.016, nowMs: 1000 + i * 16, vehicles: [player, a, b] });
  }
  t('torpedo has moved north toward A', torp.lat > 0.0003);
  eq('lock is still A before anyone crosses closer', torp.targetId, 'rival-a');
  // B crosses in close — 40 m east of the missile's current spot,
  // while A is still ~250 m away.
  b.lat = torp.lat;
  b.lon = torp.lon + 0.00036; // ~40 m east at the equator
  stepTorpedoes(state, { dt: 0.016, nowMs: 2000, vehicles: [player, a, b] });
  eq('a closer passer-by STEALS the lock mid-flight', torp.targetId, 'rival-b');
  eq('the stolen lock carries the new kind too', torp.targetKind, 'rival');
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
  const slow = { kind: 'rival', id: 'rival-slow', lat: 0.001, lon: 0, speedMps: 100 };
  const t1 = fireTorpedo(state, { lat: 0, lon: 0, yawDeg: 0, nowMs: 1000, vehicles: [player, slow] });
  eq('one tap spends exactly one missile', state.missiles, 1);
  eq('slow target → floor speed 300 m/s', t1.speedMps, TORPEDO_MIN_SPEED_MPS);
  const fast = { kind: 'rival', id: 'rival-fast', lat: 0.001, lon: 0, speedMps: 400 };
  const t2 = fireTorpedo(state, { lat: 0, lon: 0, yawDeg: 0, nowMs: 1000, vehicles: [player, fast] });
  eq('fast target → 1.3× target speed', t2.speedMps, 400 * TORPEDO_SPEED_FACTOR);
  // A rival's torpedo locks the player when only the player is known.
  const rival = { id: 'rival-x', lat: 0.001, lon: 0, yawDeg: 180, missiles: 1, missileColors: ['cyan'], lastOrbColor: 'cyan' };
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
  const target = { kind: 'rival', id: 'rival-hit', lat: 0.0009, lon: 0, speedMps: 0 }; // 100 m north
  fireTorpedo(state, { lat: 0, lon: 0, yawDeg: 0, nowMs: 1000, vehicles: [player, target] });
  let hit = null;
  for (let i = 0; i < 50 && !hit; i++) {
    const evs = stepTorpedoes(state, { dt: 0.05, nowMs: 1000 + i * 50, vehicles: [player, target] });
    hit = evs.find((e) => e.type === 'hit');
  }
  t('the torpedo reaches and hits its target', !!hit);
  eq('hit names the target kind', hit.targetKind, 'rival');
  eq('hit names the target id', hit.targetId, 'rival-hit');
  t('hit lands at the target', near(hit.lat, target.lat, 0.0001) && near(hit.lon, target.lon, 0.0001));
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
  eq('respawn is invulnerable for 3 s', r.invulnUntilMs, 8000 + INVULN_MS);
  // An invulnerable vehicle is passed through, never hit.
  setKartClientId('test-driver');
  const state = createKartState();
  state.missiles = 1;
  const player = { kind: 'player', id: 'test-driver', lat: 0, lon: 0, yawDeg: 0, speedMps: 0 };
  const ghost = { kind: 'rival', id: 'rival-ghost', lat: 0.0001, lon: 0, speedMps: 0, invulnUntilMs: 999999 };
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
    const d = haversineM(53.5, -113.5, r.lat, r.lon);
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

console.log(`earth1-kart: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
