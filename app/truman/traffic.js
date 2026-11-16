/**
 * app/truman/traffic.js — ambient town traffic for Truman.
 *
 * The live scene had eight parked, identical beige sedans and no
 * moving traffic at all. This module is the town's own traffic:
 * cars circulating the road grid — a pure-logic sim (no THREE,
 * no DOM) so the node suite can pin it.
 *
 * Road law (mirrors town.js TOWN + the ground texture: roads are
 * the 10-wide strips at block boundaries): centerlines at
 * x/z = -250 + 60k. Lane offset ±2.5, same convention as
 * world.js alignCarToLane (dir 0/N +2.5, dir 2/S -2.5, dir 1/E
 * +2.5 on z, dir 3/W -2.5 on z). Cars turn at intersections,
 * wrap at the town edge, and YIELD — they brake to a stop when
 * the player (on foot or driving) is ahead of them in their lane,
 * so they never drive through the player. They never touch a
 * mechanic: no wanted, no collision with the player vehicle,
 * just life on the roads.
 *
 * Deterministic per seed + step sequence: the same seed stepped
 * the same way always lands the same cars in the same places.
 */

export const TRUMAN_TOWN_HALF = 250;
export const TRUMAN_BLOCK = 60;
export const TRUMAN_ROAD_WIDTH = 10;
export const TRUMAN_LANE_OFFSET = 2.5;
export const TRUMAN_TRAFFIC_COUNT = 10;
export const TRUMAN_TRAFFIC_WRAP = 255;

// Small-town palette — every car its own colour, never beige twice.
export const TRUMAN_TRAFFIC_COLORS = [
  '#c96f4a', // rust
  '#7fae7a', // sage
  '#5b7fa6', // dusty blue
  '#d8c27a', // cream yellow
  '#a86f9e', // mauve
  '#e8e0d0', // cream
  '#8a9a8b', // grey-green
  '#b85450', // brick red
];

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/** Road centerlines across the town (world coords). */
export function townRoadLines() {
  const lines = [];
  for (let v = -TRUMAN_TOWN_HALF; v <= TRUMAN_TOWN_HALF; v += TRUMAN_BLOCK) lines.push(v);
  return lines;
}

/** Nearest road centerline to a world coordinate. */
export function nearestRoadLine(v) {
  return Math.round((v + TRUMAN_TOWN_HALF) / TRUMAN_BLOCK) * TRUMAN_BLOCK - TRUMAN_TOWN_HALF;
}

/** Is (x, z) on a road strip (within the road width)? */
export function isOnRoad(x, z) {
  const dx = Math.abs(x - nearestRoadLine(x));
  const dz = Math.abs(z - nearestRoadLine(z));
  return dx <= TRUMAN_ROAD_WIDTH / 2 || dz <= TRUMAN_ROAD_WIDTH / 2;
}

/** Snap a traffic car to its lane (same convention as world.js). */
export function alignCarToTownLane(car) {
  if (car.dir === 0 || car.dir === 2) {
    car.x = nearestRoadLine(car.x) + (car.dir === 0 ? TRUMAN_LANE_OFFSET : -TRUMAN_LANE_OFFSET);
  } else {
    car.z = nearestRoadLine(car.z) + (car.dir === 1 ? TRUMAN_LANE_OFFSET : -TRUMAN_LANE_OFFSET);
  }
  return car;
}

export function isTownTrafficLaneAligned(car) {
  const eps = 1e-6;
  if (car.dir === 0 || car.dir === 2) {
    const expected = nearestRoadLine(car.x) + (car.dir === 0 ? TRUMAN_LANE_OFFSET : -TRUMAN_LANE_OFFSET);
    return Math.abs(car.x - expected) < eps;
  }
  const expected = nearestRoadLine(car.z) + (car.dir === 1 ? TRUMAN_LANE_OFFSET : -TRUMAN_LANE_OFFSET);
  return Math.abs(car.z - expected) < eps;
}

// Forward unit vector for a heading dir.
function dirVec(dir) {
  if (dir === 0) return { x: 0, z: -1 };
  if (dir === 1) return { x: 1, z: 0 };
  if (dir === 2) return { x: 0, z: 1 };
  return { x: -1, z: 0 };
}

/** Heading (rad, three.js rotation.y) for a traffic dir. */
export function trafficHeading(dir) {
  // Model forward is +Z in the car mesh builder; dir 0 (north,
  // -Z) faces π, dir 1 (east, +X) faces π/2, and so on.
  return [Math.PI, Math.PI / 2, 0, -Math.PI / 2][dir] || 0;
}

/**
 * Build the ambient fleet. Cars start on random road lanes
 * (never on the beach, x > 150 is sand, not road).
 */
export function createTownTraffic(seed = 4242, count = TRUMAN_TRAFFIC_COUNT) {
  const rand = mulberry32(seed);
  const lines = townRoadLines().filter((v) => v <= 140);
  const cars = [];
  for (let i = 0; i < count; i++) {
    const dir = Math.floor(rand() * 4);
    const car = {
      x: 0, z: 0, dir,
      speed: 0,
      cruise: 6 + rand() * 4, // 6–10 m/s, town speeds
      color: TRUMAN_TRAFFIC_COLORS[i % TRUMAN_TRAFFIC_COLORS.length],
      // Per-car PRNG so turns stay deterministic per car.
      _rand: mulberry32((seed ^ Math.imul(i + 1, 2654435761)) >>> 0),
    };
    if (dir === 0 || dir === 2) {
      car.x = lines[Math.floor(rand() * lines.length)];
      car.z = (rand() - 0.5) * 460;
    } else {
      car.z = lines[Math.floor(rand() * lines.length)];
      car.x = (rand() - 0.5) * 460;
    }
    alignCarToTownLane(car);
    cars.push(car);
  }
  return cars;
}

/**
 * One step. `player` is { x, z } or null — cars brake to a stop
 * when the player is ahead of them in their lane (within 9 m,
 * inside the lane width), and roll on otherwise. Cars turn at
 * intersections, wrap at the town edge, and stay lane-aligned.
 * Mutates and returns `cars`.
 */
export function stepTownTraffic(cars, dt, player) {
  for (const car of cars) {
    // Yield: is the player ahead of me, in my lane?
    let target = car.cruise;
    if (player) {
      const f = dirVec(car.dir);
      const dx = player.x - car.x, dz = player.z - car.z;
      const ahead = dx * f.x + dz * f.z;
      const lateral = Math.abs(dx * (-f.z) + dz * f.x);
      if (ahead > 0 && ahead < 9 && lateral < 3) target = 0;
    }
    // Ease toward the target speed (brake harder than accelerate).
    const rate = target < car.speed ? 14 : 5;
    car.speed += Math.max(-rate * dt, Math.min(rate * dt, target - car.speed));
    if (car.speed < 0.01) car.speed = target === 0 ? 0 : car.speed;

    const f = dirVec(car.dir);
    car.x += f.x * car.speed * dt;
    car.z += f.z * car.speed * dt;

    // Turn at intersections: near a crossing of two centerlines.
    const nearX = Math.abs(car.x - nearestRoadLine(car.x)) < 2;
    const nearZ = Math.abs(car.z - nearestRoadLine(car.z)) < 2;
    if (nearX && nearZ && car._rand() < 0.012) {
      const choices = [0, 1, 2, 3].filter((d) => d !== car.dir && d !== (car.dir + 2) % 4);
      car.dir = choices[Math.floor(car._rand() * choices.length)];
      alignCarToTownLane(car);
    }

    // Wrap at the town edge, back onto a road lane.
    if (car.x > TRUMAN_TRAFFIC_WRAP) { car.x = -TRUMAN_TRAFFIC_WRAP + 5; alignCarToTownLane(car); }
    if (car.x < -TRUMAN_TRAFFIC_WRAP) { car.x = TRUMAN_TRAFFIC_WRAP - 5; alignCarToTownLane(car); }
    if (car.z > TRUMAN_TRAFFIC_WRAP) { car.z = -TRUMAN_TRAFFIC_WRAP + 5; alignCarToTownLane(car); }
    if (car.z < -TRUMAN_TRAFFIC_WRAP) { car.z = TRUMAN_TRAFFIC_WRAP - 5; alignCarToTownLane(car); }
  }
  return cars;
}
