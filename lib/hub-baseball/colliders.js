// lib/hub-baseball/colliders.js
// The bounce set for Hub Baseball — every solid object the ball can
// hit, and the reflection math for the bounce (Merlin, Nov 27, 2026:
// "No passing through for the ball. Bouncing off of and changing
// direction according to the physics of how it hits" + "Anything").
//
// RULE: the ball bounces off ANYTHING it hits — any and all objects
// in its trajectory, stars included — and its direction changes by
// real impact physics: angle of incidence = angle of reflection off
// the surface it strikes. Nothing is passed through; nothing stops
// it. Restitution is 1.0 (perfectly elastic): a bounce changes the
// DIRECTION only, never the speed — the ball keeps going at full
// pace. Black holes are the one exception to bouncing: they EAT the
// ball (unchanged — a hole is a hazard, not a surface).
//
// Every collider is single-sourced from the hub layout modules it
// already lives in — never re-typed — so a hub move moves the bounce
// set with it. Moving bodies (the god planets, the moon, the belt
// rocks) are analytic in the orbit clock: buildColliders takes the
// orbit time at the swing, and positions are evaluated at
// orbitTime0 + elapsed flight time, exactly as the scene renders
// them (lib/god-orbits.js menuSatellitePosition, lib/hub-layout.js
// moonPositionAt, lib/asteroid-belt.js asteroidPositionAt).
//
// WHAT IS IN THE SET
//   Spheres — Earth (its sphere also covers the winter tree, which
//     stands in Earth's place at the same centre and radius), Mars,
//     the 8 outer planets, the Sun (SUN_RADIUS 67.5, solid per
//     lib/sun-base.js), the blue giant star, the 24 god planets
//     (hull 11.8), the Moon, the 90 belt rocks, and the scoreboard
//     (a sphere of half its width — the board is a flat Billboard
//     that always faces the camera, so a sphere is the honest
//     approximation; it clears the ball's rest by 12).
//   Boxes — the 24 god towers (oriented boxes, lib/tower-collider.js).
//     NOTE: users still pass through towers freely in freeroam
//     (Merlin, Nov 24, 2026) — that order is about the USER. The
//     BALL bounces off them under this order ("Anything").
//   Rings — Saturn's ring disc (annulus 78–132, tilted with the
//     planet): a flat surface the ball bounces off like a wall.
// WHAT IS NOT IN THE SET (and why — no invented collisions)
//   The starfield: 20,000 background points with no surface. A point
//     has nothing to hit; the ball flies through the starfield as it
//     must (it is everywhere). The STARS WITH SURFACES — the Sun and
//     the blue giant star — DO bounce, as spheres above.
//   Mars' system rings: 24 tori with a 0.2 tube — no surface at
//     ball scale (the ball is r=55); the ball bounces off Mars
//     itself.
//   Home plate: the batting marker, not a solid body. The ball rests
//     directly against it by design (the plate's bottom edge dips
//     3.5 into the ball's top, mirroring the original arrangement) —
//     colliding it would push the ball off its own rest.
//   The parked TRON bike: a small vehicle with no solid body in the
//     flight model.
//   Black holes: hazards, not surfaces — they eat (flight.js).
//
// Pure math on {x,y,z} objects — no three.js — so it stays
// headless-testable. 1 unit = 1 m.

import {
  EARTH_CENTER,
  EARTH_RADIUS,
  GOD_BANDS,
  MARS_CENTER,
  MARS_RADIUS,
  PLANETS,
  menuSatellitePosition,
} from '../god-orbits.js';
import { SUN_CENTER, SUN_RADIUS } from '../omega-arch.js';
import { MOON_RADIUS, moonPositionAt } from '../hub-layout.js';
import { GOD_TOWER_SPOTS } from '../home-positions.js';
import {
  TOWER_BOX_HALF_SIDE,
  TOWER_BOX_Y_CENTER,
  TOWER_BOX_Y_HALF,
  towerFixedYaw,
} from '../tower-collider.js';
import { makeBelt, asteroidPositionAt } from '../asteroid-belt.js';
import {
  BLUE_STAR_POS,
  BLUE_STAR_RADIUS,
  SCOREBOARD_POS,
  SCOREBOARD_SIZE,
} from './placement.js';

/** Restitution: 1.0 — perfectly elastic. A bounce changes direction only, never speed. */
export const BOUNCE_RESTITUTION = 1.0;
/** How far past the surface the ball is pushed out on a bounce (units). */
export const BOUNCE_MARGIN = 0.05;
/** Bounce-resolution passes per flight step (stacked contacts settle). */
export const MAX_BOUNCES_PER_STEP = 4;

/** God-planet hull radius — components/GodOrbitRings.jsx SAT_RADIUS (not exported there). */
export const GOD_PLANET_HULL_RADIUS = 11.8;
/** Scoreboard collider radius: half the board's width (a sphere stands in for the flat plane). */
export const SCOREBOARD_COLLIDER_RADIUS = SCOREBOARD_SIZE[0] / 2; // 22

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function scale(v, k) {
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function normalize(v) {
  const l = length(v);
  if (l < 1e-9) return { x: 0, y: 1, z: 0 };
  return scale(v, 1 / l);
}

/**
 * Build the bounce set for a flight that starts at orbit time
 * `orbitTime0` (the scene's orbitTime() at the swing; 0 in tests).
 * Every collider carries `centerAt(t)` — the centre at elapsed
 * flight time t — so moving bodies stay honest. Static bodies return
 * a fixed centre. Shape:
 *   { kind: 'sphere', id, radius, centerAt(t) }
 *   { kind: 'box', id, half: {x,y,z}, yaw, centerAt(t) }
 *   { kind: 'ring', id, centerAt(t), normal, inner, outer }
 */
export function buildColliders(orbitTime0 = 0) {
  const spheres = [];
  const boxes = [];
  const rings = [];
  const at = (c) => () => ({ ...c });
  const moving = (fn) => (t) => fn(orbitTime0 + t);

  // Earth — and the winter tree, which stands in Earth's place at the
  // same centre and radius (one sphere covers both).
  spheres.push({
    kind: 'sphere', id: 'earth', radius: EARTH_RADIUS,
    centerAt: at(EARTH_CENTER),
  });
  // Mars.
  spheres.push({
    kind: 'sphere', id: 'mars', radius: MARS_RADIUS,
    centerAt: at(MARS_CENTER),
  });
  // The 8 outer planets (+ Saturn's ring disc, below).
  for (const p of PLANETS) {
    spheres.push({
      kind: 'sphere', id: `planet-${p.key}`, radius: p.radius,
      centerAt: at(p.center),
    });
    if (p.rings) {
      // RingGeometry lies flat (normal +Y) inside a group tilted by
      // rotation.z = tilt — so the world normal is Rz(tilt) applied
      // to +Y: (-sin tilt, cos tilt, 0).
      const tilt = p.tilt || 0;
      rings.push({
        kind: 'ring', id: `rings-${p.key}`,
        centerAt: at(p.center),
        normal: { x: -Math.sin(tilt), y: Math.cos(tilt), z: 0 },
        inner: p.rings.inner,
        outer: p.rings.outer,
      });
    }
  }
  // The Sun — a solid star (lib/sun-base.js: "solid collider").
  spheres.push({
    kind: 'sphere', id: 'sun', radius: SUN_RADIUS,
    centerAt: at(SUN_CENTER),
  });
  // The blue giant star — a star with a surface, so it bounces.
  spheres.push({
    kind: 'sphere', id: 'blue-star', radius: BLUE_STAR_RADIUS,
    centerAt: at({ x: BLUE_STAR_POS[0], y: BLUE_STAR_POS[1], z: BLUE_STAR_POS[2] }),
  });
  // The scoreboard — sphere of half its width (see header).
  spheres.push({
    kind: 'sphere', id: 'scoreboard', radius: SCOREBOARD_COLLIDER_RADIUS,
    centerAt: at({ x: SCOREBOARD_POS[0], y: SCOREBOARD_POS[1], z: SCOREBOARD_POS[2] }),
  });
  // The 24 god planets — moving, analytic in the orbit clock.
  for (let i = 0; i < GOD_BANDS.length; i++) {
    spheres.push({
      kind: 'sphere', id: `god-planet-${i}`, radius: GOD_PLANET_HULL_RADIUS,
      centerAt: moving((t) => menuSatellitePosition(i, t)),
    });
  }
  // The Moon — moving, analytic in the orbit clock.
  spheres.push({
    kind: 'sphere', id: 'moon', radius: MOON_RADIUS,
    centerAt: moving((t) => moonPositionAt(t)),
  });
  // The 90 belt rocks — moving, analytic in the orbit clock.
  const rocks = makeBelt();
  rocks.forEach((rock, i) => {
    spheres.push({
      kind: 'sphere', id: `asteroid-${i}`, radius: rock.radius,
      centerAt: moving((t) => asteroidPositionAt(rock, t)),
    });
  });
  // The 24 god towers — oriented boxes, fixed yaw square to the ring.
  for (const spot of GOD_TOWER_SPOTS) {
    const center = {
      x: spot.pos[0],
      y: spot.pos[1] + TOWER_BOX_Y_CENTER,
      z: spot.pos[2],
    };
    boxes.push({
      kind: 'box', id: `tower-${spot.god}`,
      half: { x: TOWER_BOX_HALF_SIDE, y: TOWER_BOX_Y_HALF, z: TOWER_BOX_HALF_SIDE },
      yaw: towerFixedYaw(spot.pos),
      centerAt: at(center),
    });
  }
  return { spheres, boxes, rings };
}

/** Counts by kind — for tests and the receipt. */
export function countColliders(colliders) {
  return {
    spheres: colliders.spheres.length,
    boxes: colliders.boxes.length,
    rings: colliders.rings.length,
    total: colliders.spheres.length + colliders.boxes.length + colliders.rings.length,
  };
}

/**
 * Reflect a velocity off a surface with unit normal `n` (pointing
 * back at the incoming ball): v' = v - (1+e)(v·n)n. Restitution 1.0
 * keeps |v| exactly — direction changes, speed never does.
 * Returns a NEW vector; the input is untouched.
 */
export function reflectVelocity(vel, n, restitution = BOUNCE_RESTITUTION) {
  const vn = dot(vel, n);
  const k = (1 + restitution) * vn;
  return { x: vel.x - k * n.x, y: vel.y - k * n.y, z: vel.z - k * n.z };
}

// --- Segment sweep helpers -------------------------------------------------
// Each returns the earliest contact along prev→pos as
// { t, point, normal, gap } — t in [0,1], point the contact point on
// the segment, normal the outward surface normal there, gap how far
// the ball centre must sit from the surface (object radius +
// ballRadius, or ballRadius for a flat ring) — or null when the
// segment never touches. `elapsed` is the flight time at the END of
// the step (moving bodies are evaluated there).

function sphereContact(c, prev, pos, elapsed, ballRadius) {
  const centre = c.centerAt(elapsed);
  const R = c.radius + ballRadius;
  const d = sub(pos, prev);
  const m = sub(prev, centre);
  const a = dot(d, d);
  const b = 2 * dot(m, d);
  const cc = dot(m, m) - R * R;
  if (a < 1e-12) {
    // No motion: only a standing overlap counts.
    if (cc >= 0) return null;
    const n = normalize(sub(prev, centre));
    // Resting spot is the surface along the radial from the centre.
    return { t: 0, point: { ...prev }, normal: n, gap: R - Math.sqrt(dot(m, m)) };
  }
  if (cc < 0) {
    // Starts inside the expanded sphere: out along the radial.
    const n = normalize(sub(prev, centre));
    return { t: 0, point: { ...prev }, normal: n, gap: R - Math.sqrt(dot(m, m)) };
  }
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > 1) return null;
  const point = add(prev, scale(d, t));
  const normal = normalize(sub(point, centre));
  // The contact point is already where the ball centre rests (the
  // expanded sphere's surface) — gap 0, only the margin is added.
  return { t, point, normal, gap: 0 };
}

function boxContact(c, prev, pos, elapsed, ballRadius) {
  const centre = c.centerAt(elapsed);
  const H = {
    x: c.half.x + ballRadius,
    y: c.half.y + ballRadius,
    z: c.half.z + ballRadius,
  };
  // World -> local: translate by -centre, rotate by -yaw about Y.
  const cos = Math.cos(-c.yaw);
  const sin = Math.sin(-c.yaw);
  const toLocal = (p) => {
    const dx = p.x - centre.x;
    const dy = p.y - centre.y;
    const dz = p.z - centre.z;
    return [dx * cos + dz * sin, dy, -dx * sin + dz * cos];
  };
  const p0 = toLocal(prev);
  const p1 = toLocal(pos);
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const h = [H.x, H.y, H.z];
  let tmin = -Infinity;
  let tmax = Infinity;
  let axis = -1;
  let sign = 0;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) {
      if (p0[a] < -h[a] || p0[a] > h[a]) return null;
    } else {
      let t1 = (-h[a] - p0[a]) / d[a];
      let t2 = (h[a] - p0[a]) / d[a];
      let s = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        s = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        axis = a;
        sign = s;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  if (tmax < 0 || tmin > 1) return null;
  // Local -> world normal: the entry face's outward normal, rotated by +yaw.
  const localNormal = [0, 0, 0];
  const cos2 = Math.cos(c.yaw);
  const sin2 = Math.sin(c.yaw);
  const toWorldNormal = (l) => ({
    x: l[0] * cos2 + l[2] * sin2,
    y: l[1],
    z: -l[0] * sin2 + l[2] * cos2,
  });
  const toWorldPoint = (l) => ({
    x: l[0] * cos2 + l[2] * sin2 + centre.x,
    y: l[1] + centre.y,
    z: -l[0] * sin2 + l[2] * cos2 + centre.z,
  });
  if (tmin < 0) {
    // Starts inside the expanded box: out along the shallowest face.
    let best = Infinity;
    let bAxis = 0;
    let bSign = 1;
    for (let a = 0; a < 3; a++) {
      const pen = h[a] - Math.abs(p0[a]);
      if (pen < best) {
        best = pen;
        bAxis = a;
        bSign = p0[a] >= 0 ? 1 : -1;
      }
    }
    localNormal[bAxis] = bSign;
    const out = [p0[0], p0[1], p0[2]];
    out[bAxis] = bSign * (h[bAxis] + BOUNCE_MARGIN);
    return { t: 0, point: toWorldPoint(out), normal: toWorldNormal(localNormal), gap: 0 };
  }
  // Entry through face (axis, sign) at tmin.
  localNormal[axis] = sign;
  const q = [p0[0] + d[0] * tmin, p0[1] + d[1] * tmin, p0[2] + d[2] * tmin];
  return { t: tmin, point: toWorldPoint(q), normal: toWorldNormal(localNormal), gap: 0 };
}

function ringContact(c, prev, pos, elapsed, ballRadius) {
  const centre = c.centerAt(elapsed);
  const n = c.normal;
  const dPrev = dot(sub(prev, centre), n);
  const dPos = dot(sub(pos, centre), n);
  // The ball's surface touches the ring plane when its centre is
  // ballRadius off it, on the side it came from.
  let side = 0;
  let target = 0;
  if (dPrev > ballRadius && dPos < ballRadius) {
    side = 1;
    target = ballRadius;
  } else if (dPrev < -ballRadius && dPos > -ballRadius) {
    side = -1;
    target = -ballRadius;
  } else {
    return null;
  }
  const denom = dPos - dPrev;
  const t = Math.abs(denom) < 1e-12 ? 0 : (target - dPrev) / denom;
  if (t < 0 || t > 1) return null;
  const point = add(prev, scale(sub(pos, prev), t));
  // The crossing must land inside the annulus (radial distance from
  // the centre, measured in the plane).
  const rel = sub(point, centre);
  const radial = Math.sqrt(Math.max(0, dot(rel, rel) - Math.pow(dot(rel, n), 2)));
  if (radial < c.inner || radial > c.outer) return null;
  // The normal faces the incoming ball.
  const normal = side > 0 ? { ...n } : scale(n, -1);
  // The contact point is already where the ball centre rests (one
  // ball radius off the plane) — gap 0, only the margin is added.
  return { t, point, normal, gap: 0 };
}

/**
 * Sweep the ball's step (prev → pos) against every collider and
 * bounce off each contact in order, earliest first. `vel` is the
 * velocity for the step. Returns { pos, vel, hits } — the corrected
 * endpoint, the reflected velocity, and the ids hit this step (in
 * order). The ball keeps the step's remaining travel along the
 * reflected direction, so a bounce never eats distance. Up to
 * MAX_BOUNCES_PER_STEP contacts per step; the ball is always pushed
 * out to the surface + margin, so it can never end a step inside a
 * solid. Inputs are not mutated.
 */
export function resolveBounces(prev, pos, vel, colliders, elapsed, ballRadius) {
  let curPrev = { ...prev };
  let curPos = { ...pos };
  let curVel = { ...vel };
  const hits = [];
  for (let iter = 0; iter < MAX_BOUNCES_PER_STEP; iter++) {
    let best = null;
    let bestId = null;
    const scan = (list, fn) => {
      for (const c of list) {
        const contact = fn(c, curPrev, curPos, elapsed, ballRadius);
        if (!contact) continue;
        if (!best || contact.t < best.t) {
          best = contact;
          bestId = c.id;
        }
      }
    };
    scan(colliders.spheres, sphereContact);
    scan(colliders.boxes, boxContact);
    scan(colliders.rings, ringContact);
    if (!best) break;
    hits.push(bestId);
    // Reflect the velocity about the surface normal (restitution 1.0
    // keeps the speed — only the direction changes).
    curVel = reflectVelocity(curVel, best.normal);
    // Remaining travel for this step, along the NEW direction.
    const remaining = length(sub(curPos, best.point));
    const dir = normalize(curVel);
    // Rest the ball centre on the surface (+ margin) at the contact,
    // then carry the remaining travel along the reflected direction.
    const base = add(best.point, scale(best.normal, best.gap + BOUNCE_MARGIN));
    curPos = add(base, scale(dir, remaining));
    // The next sweep starts where the ball now sits — just OUTSIDE
    // the surface — never on it: a sweep starting exactly on a
    // surface re-contacts it at t=0 and ping-pongs the same hit.
    curPrev = { ...base };
  }
  return { pos: curPos, vel: curVel, hits };
}
