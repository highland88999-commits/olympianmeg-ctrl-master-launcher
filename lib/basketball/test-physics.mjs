// Headless tests for lib/basketball/physics.js — run with: node test-physics.mjs
import {
  makeBall, placeBall, shootBall, stepBall, simulateArc,
  shotVelocity, defaultShotSpeed,
} from './physics.js';
import { RIM_Y, RIM_R, BALL_R, SPOTS_END0, rimForEnd, BALL_START_H } from './constants.js';

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}
function run(ball, rim, total = 6, dt = 1 / 60) {
  const events = [];
  for (let t = 0; t < total; t += dt) {
    events.push(...stepBall(ball, rim, dt));
    if (ball.state === 'dead') break;
  }
  return events;
}

const rim = rimForEnd(0); // z = -12.65

console.log('1) drop straight through the rim scores');
{
  const b = makeBall();
  placeBall(b, rim.x, RIM_Y + 1.2, rim.z);
  shootBall(b, { x: 0, y: -0.5, z: 0 });
  const ev = run(b, rim);
  ok('score event', ev.some((e) => e.type === 'score'));
  ok('swish (clean drop)', ev.some((e) => e.type === 'swish'));
  ok('ends dead', b.state === 'dead');
}

console.log('2) default shot from the top spot reaches the rim area');
{
  const s = SPOTS_END0[2];
  const from = { x: s.x, y: BALL_START_H, z: s.z };
  const speed = defaultShotSpeed(from, rim);
  const v = shotVelocity(from, rim, { elevDeg: 52, azimOffset: 0, speed });
  const b = makeBall();
  placeBall(b, from.x, from.y, from.z);
  shootBall(b, v);
  const ev = run(b, rim);
  const scored = ev.some((e) => e.type === 'score');
  const hitSomething = b.touchedRim || b.touchedBoard || scored;
  ok('hits rim/board or scores', hitSomething, `(rim:${b.touchedRim} board:${b.touchedBoard} scored:${scored})`);
  ok('no tunneling below floor', b.p.y >= -0.5, `y=${b.p.y.toFixed(2)}`);
}

console.log('3) five spots: default shots all stay sane');
{
  let sane = true;
  for (const s of SPOTS_END0) {
    const from = { x: s.x, y: BALL_START_H, z: s.z };
    const v = shotVelocity(from, rim, { elevDeg: 52, azimOffset: 0, speed: defaultShotSpeed(from, rim) });
    const b = makeBall();
    placeBall(b, from.x, from.y, from.z);
    shootBall(b, v);
    run(b, rim);
    if (!(b.state === 'dead') || Math.abs(b.p.x) > 19 || Math.abs(b.p.z) > 23) sane = false;
  }
  ok('all resolve to dead ball in bounds', sane);
}

console.log('4) rim collision reflects the ball');
{
  const b = makeBall();
  // clip the side of the ring tube
  placeBall(b, rim.x + RIM_R + 0.1, RIM_Y + 0.25, rim.z);
  shootBall(b, { x: -1.5, y: -0.5, z: 0 });
  const ev = run(b, rim, 4);
  ok('rim touch registered', b.touchedRim || ev.some((e) => e.type === 'rim'));
  ok('ball did not tunnel through rim plane weirdly', b.p.y > -0.5);
}

console.log('5) backboard reflects the ball');
{
  const b = makeBall();
  // high enough to clear the rim, straight into the board
  placeBall(b, 0, 4.2, -11.0);
  shootBall(b, { x: 0, y: 0, z: -6 });
  const ev = run(b, rim, 4);
  ok('board touch registered', b.touchedBoard || ev.some((e) => e.type === 'board'));
  ok('z velocity reversed', b.v.z > -0.01 || b.state === 'dead', `vz=${b.v.z.toFixed(2)}`);
}

console.log('6) floor bounce loses energy');
{
  const b = makeBall();
  placeBall(b, 0, 3, 0);
  shootBall(b, { x: 0, y: 0, z: 0 });
  const ev = run(b, rim, 6);
  const bounces = ev.filter((e) => e.type === 'bounce').length;
  ok('multiple bounces', bounces >= 2, `bounces=${bounces}`);
  ok('settles to dead', b.state === 'dead');
}

console.log('7) wild miss resolves to dead ball');
{
  const b = makeBall();
  placeBall(b, 0, BALL_START_H, -6.3);
  shootBall(b, { x: 9, y: 9, z: 9 });
  const ev = run(b, rim, 10);
  ok('dead event', ev.some((e) => e.type === 'dead'));
}

console.log('8) aim arc preview returns a sane path');
{
  const s = SPOTS_END0[2];
  const from = { x: s.x, y: BALL_START_H, z: s.z };
  const v = shotVelocity(from, rim, { elevDeg: 52, azimOffset: 0, speed: defaultShotSpeed(from, rim) });
  const pts = simulateArc(from, v, rim);
  ok('enough points', pts.length > 10, `n=${pts.length}`);
  ok('arc rises then falls', pts[2].y > pts[0].y && pts[pts.length - 1].y < pts[2].y);
  const nearRim = pts.some((p) => Math.hypot(p.x - rim.x, p.z - rim.z) < 1.2);
  ok('arc passes near the rim', nearRim);
}

console.log('9) swish vs rim distinction');
{
  // clean
  const b1 = makeBall();
  placeBall(b1, rim.x, RIM_Y + 1.2, rim.z);
  shootBall(b1, { x: 0, y: -0.5, z: 0 });
  const ev1 = run(b1, rim);
  // graze the outside of the ring tube: touches metal, cannot score
  const b2 = makeBall();
  placeBall(b2, rim.x + RIM_R + 0.02, RIM_Y + 1.2, rim.z);
  shootBall(b2, { x: 0, y: -0.5, z: 0 });
  const ev2 = run(b2, rim);
  ok('clean shot is swish', ev1.some((e) => e.type === 'swish'));
  ok('rim clip is not swish', !ev2.some((e) => e.type === 'swish'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
