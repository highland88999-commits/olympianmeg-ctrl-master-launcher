// Tests for the Flying Dutchman engine (run with node).
import {
  makeShip, makeWind, stepWind, stepShip, targetSpeed, windAngle,
  fireBroadside, stepBalls, damageShip, spawnSouls, stepSouls,
  makeAI, stepAI, makeWorld, spawnWave, stepWorld,
  waveHeight, reloadTime, SHIP, SAILS, clamp, wrapAngle, makeRng,
} from '../../app/flying-dutchman/engine.js';

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}
const approx = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// --- helpers ---
check('wrapAngle', approx(wrapAngle(Math.PI + 0.5), -Math.PI + 0.5));
check('clamp', clamp(5, 0, 3) === 3 && clamp(-1, 0, 3) === 0);

// --- wind ---
const w = makeWind(42);
check('wind strength sane', w.strength >= 0.5 && w.strength <= 1.5);
stepWind(w, 10);
check('wind steps', w._t === 10);

// --- sailing: running before the wind is fastest ---
const s1 = makeShip({ heading: 0 });
const wRun = { dir: 0, strength: 1, _t: 0 }; // wind blows toward +z, ship heads +z
const wBeat = { dir: Math.PI, strength: 1, _t: 0 }; // wind on the nose
check('running faster than beating', targetSpeed(s1, wRun) > targetSpeed(s1, wBeat) * 2);
s1.sails = SAILS.FURLED;
check('furled slower than full', targetSpeed(s1, wRun) < SHIP.maxSpeed);
s1.sails = SAILS.FULL;

// --- stepShip moves the ship ---
const s2 = makeShip({ x: 0, z: 0, heading: 0 });
s2.rudder = 0;
stepShip(s2, 5, wRun);
check('ship moves forward', s2.z > 5);
const h0 = s2.heading;
s2.rudder = 1; s2.speed = 8;
stepShip(s2, 1, wRun);
check('rudder turns ship', s2.heading !== h0);

// --- cannons ---
const s3 = makeShip({ x: 0, z: 0, heading: 0, crew: 6 });
const r1 = fireBroadside(s3, 'stbd', 0);
check('broadside fires 6 balls', r1.fired && r1.balls.length === SHIP.cannonsPerSide);
check('reload set', s3.reloadStbd > 0);
const r2 = fireBroadside(s3, 'stbd', 0);
check('no double fire while reloading', !r2.fired);
check('reload faster with crew', reloadTime(makeShip({ crew: 20 })) < reloadTime(makeShip({ crew: 0 })));

// --- ballistics: balls fall and splash ---
{
  const balls = r1.balls.map((b) => ({ ...b, delay: 0 }));
  const ships = [s3];
  const souls = [];
  const ev = [];
  for (let i = 0; i < 400; i++) stepBalls(balls, ships, souls, 1 / 30, i / 30, ev, makeRng(7));
  check('balls resolve', balls.length === 0);
  check('splashes happened', ev.some((e) => e.type === 'splash'));
}

// --- damage sinks ships and releases souls ---
{
  const atk = makeShip({ x: 0, z: 0 });
  const vic = makeShip({ x: 30, z: 0, crew: 5 });
  const souls = [];
  const ev = [];
  damageShip(vic, 200, ev, souls, makeRng(9), 30, 0);
  check('ship sinks', !vic.alive && vic.sinking);
  check('sunk event', ev.some((e) => e.type === 'sunk'));
  check('souls released', souls.length >= 3);
}

// --- souls are claimable ---
{
  const souls = [];
  spawnSouls(souls, 0, 0, 3, makeRng(3));
  const claimer = makeShip({ x: 0, z: 0, crew: 2, hull: 50 });
  claimer.hull = 50;
  const ev = [];
  // pull souls onto the ship
  for (const s of souls) { s.x = 0; s.z = 0; }
  stepSouls(souls, [claimer], 0.1, 0, ev);
  check('souls claimed', claimer.crew === 5 && claimer.souls === 3);
  check('soul heals', claimer.hull > 50);
  check('soul events', ev.filter((e) => e.type === 'soul').length === 3);
}

// --- AI fires broadsides ---
{
  const world = makeWorld(99);
  spawnWave(world, 1);
  const ai = world.enemies[0];
  // park the player abeam of the AI in range
  world.player.x = ai.x + 60; world.player.z = ai.z;
  ai.heading = 0;
  let fired = false;
  for (let i = 0; i < 600; i++) {
    const side = stepAI(ai, world.player, world.wind, 0.1);
    if (side) {
      const r = fireBroadside(ai, side, i * 0.1);
      if (r.fired) { fired = true; break; }
    }
  }
  check('AI fires when abeam', fired);
}

// --- world tick: waves spawn, events flow ---
{
  const world = makeWorld(1234);
  spawnWave(world, 2);
  check('wave spawned', world.enemies.length === 2);
  const ev = stepWorld(world, { rudder: 0.2, sails: SAILS.FULL }, 1 / 60);
  check('world ticks', world.t > 0 && Array.isArray(ev));
}

// --- waveHeight is finite everywhere ---
check('waveHeight sane', Number.isFinite(waveHeight(123, -456, 78.9)));

console.log(`\nflying-dutchman engine: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
