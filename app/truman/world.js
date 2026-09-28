/*
 * TRUMAN — Local Matrix Brain simulator.
 *
 * Faithful local replica of server/index.js from the Truman repo:
 *   globalTime += 0.016           (every tick, 60 ticks/sec)
 *   simulatedMinutes = (globalTime * SIM_SPEED) % MINUTES_IN_MONTH
 *   isStormActive = simulatedMinutes > (MINUTES_IN_MONTH - STORM_DURATION)
 *
 * The original client connected to https://olympus-matrix-brain.onrender.com
 * over a realtime socket. That host is DROPPED in this module — the whole protocol
 * runs in-browser via requestAnimationFrame. No network traffic at all.
 *
 * This module also holds the procedural city generation + traffic agents,
 * ported from citygrid.jsx, trafficmatrix.jsx, henrycar.jsx, environment.jsx.
 * Pure logic only — no DOM, no canvas — so it is unit-testable.
 */

export const MINUTES_IN_MONTH = 43200; // 30 simulated days
export const STORM_DURATION = 30;      // storm occupies the final 30 minutes
export const SIM_SPEED = 20;           // simulated minutes per unit of globalTime
export const TICK = 0.016;             // globalTime increment per 60fps tick
export const BLOCK_SIZE = 50;          // city grid block size (source: citygrid.jsx)
export const LANE_OFFSET = 2.5;        // traffic lane offset (source: trafficmatrix.jsx)

/**
 * One Matrix Brain tick. Replicates the server's world-sync math EXACTLY.
 * @param {number} globalTime — previous brain clock value
 * @returns {{globalTime:number, simulatedMinutes:number, isStormActive:boolean}}
 */
export function tickWorld(globalTime) {
  const next = globalTime + TICK;
  const simulatedMinutes = (next * SIM_SPEED) % MINUTES_IN_MONTH;
  const isStormActive = simulatedMinutes > (MINUTES_IN_MONTH - STORM_DURATION);
  return { globalTime: next, simulatedMinutes, isStormActive };
}

/** Minutes remaining until the next axiom storm starts (0 while storming). */
export function minutesUntilStorm(simulatedMinutes) {
  const stormStart = MINUTES_IN_MONTH - STORM_DURATION;
  return simulatedMinutes > stormStart ? 0 : stormStart - simulatedMinutes;
}

/** Global time value that puts the next tick exactly at the given minute. */
export function globalTimeForMinute(minute) {
  return minute / SIM_SPEED;
}

/** Human-readable calendar readout for the simulated month. */
export function formatClock(simulatedMinutes) {
  const m = ((simulatedMinutes % MINUTES_IN_MONTH) + MINUTES_IN_MONTH) % MINUTES_IN_MONTH;
  const day = Math.floor(m / 1440) + 1; // 1..30
  const dayMinute = m % 1440;
  const hh = Math.floor(dayMinute / 60);
  const mm = Math.floor(dayMinute % 60);
  const pad = (n) => String(n).padStart(2, '0');
  return { day, hh, mm, label: `DAY ${day} — ${pad(hh)}:${pad(mm)}` };
}

/** Henry's car shift: ACTIVE 08:00–12:00 simulated time (source: henrycar.jsx). */
export function henryCarActive(simulatedMinutes) {
  const hour = (simulatedMinutes % 1440) / 60;
  return hour >= 8 && hour < 12;
}

/** Seeded PRNG so the generated city is stable across sessions. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * City grid buildings. Source logic (citygrid.jsx): spread 8, gaps for roads
 * wherever a block has BOTH |x| and |z| odd — buildings spawn when
 * |x|%2===0 OR |z|%2===0. Height 40 + rand*120, jittered ±7.5 within block.
 */
export function buildCity(seed = 1337) {
  const rand = mulberry32(seed);
  const buildings = [];
  const spread = 8;
  for (let x = -spread; x <= spread; x++) {
    for (let z = -spread; z <= spread; z++) {
      if (Math.abs(x) % 2 === 0 || Math.abs(z) % 2 === 0) {
        buildings.push({
          bx: x, bz: z,
          x: x * BLOCK_SIZE + (rand() - 0.5) * 15,
          z: z * BLOCK_SIZE + (rand() - 0.5) * 15,
          h: 40 + rand() * 120,
          w: 16 + rand() * 6,
        });
      }
    }
  }
  return buildings;
}

/**
 * Hologram ad billboards. Source logic (hologramads.jsx): one per two blocks,
 * only on diagonal intersections (x===z, |x| even, x!==0), floating at y=150.
 * The source streamed a video from files.catbox.moe (external — dropped);
 * here each billboard gets a procedural neon ad message instead.
 */
export const AD_COPY = [
  { title: 'AXIOM COLA', sub: 'TASTE THE SIMULATION' },
  { title: 'NEXUS VORTEX', sub: 'ENTER THE ABYSS' },
  { title: 'OLYMPUS PRIME', sub: 'CITYSCAPE DISTRICT' },
  { title: "HENRY'S WOK", sub: 'EAT SOMETHING REAL' },
  { title: 'SYNTHWAVE LOUNGE', sub: 'FREE WILL, NIGHTLY' },
  { title: 'STORM INSURANCE', sub: 'AXIOM EVENTS COVERED' },
  { title: 'TRUMAN TOURS', sub: 'SEE HOW HE LIVES' },
  { title: 'DOME MAINTENANCE', sub: 'REPORT A GLITCH' },
];

export function buildAds() {
  const ads = [];
  const spread = 8;
  let i = 0;
  for (let x = -spread; x <= spread; x++) {
    for (let z = -spread; z <= spread; z++) {
      if (x === z && Math.abs(x) % 2 === 0 && x !== 0) {
        ads.push({
          id: `ad-${x}-${z}`,
          x: x * BLOCK_SIZE,
          y: 150,
          z: z * BLOCK_SIZE,
          phase: (i * 1.7) % (Math.PI * 2),
          copy: AD_COPY[i % AD_COPY.length],
          hue: [180, 300, 45, 200][i % 4],
        });
        i++;
      }
    }
  }
  return ads;
}

/** Fast procedural noise used for biome mapping (source: environment.jsx). */
export function fbm(x, y) {
  return Math.sin(x * 0.05) * Math.cos(y * 0.05) + Math.sin(x * 0.1) * 0.5;
}

/** Forest clusters outside the city zone (source: environment.jsx). */
export function buildTrees(seed = 4242, maxTrees = 900) {
  const rand = mulberry32(seed);
  const trees = [];
  const spread = 15;
  for (let x = -spread; x <= spread && trees.length < maxTrees; x++) {
    for (let z = -spread; z <= spread && trees.length < maxTrees; z++) {
      const wx = x * BLOCK_SIZE, wz = z * BLOCK_SIZE;
      const elevation = fbm(wx, wz);
      if (elevation > 0.2 && elevation < 0.8) {
        const cluster = Math.floor(rand() * 4);
        for (let i = 0; i < cluster && trees.length < maxTrees; i++) {
          trees.push({
            x: wx + (rand() - 0.5) * 40,
            z: wz + (rand() - 0.5) * 40,
            s: 0.7 + rand() * 0.8,
          });
        }
      }
    }
  }
  return trees;
}

/** Snap a traffic agent to its lane (source: trafficmatrix.jsx). */
export function alignCarToLane(car) {
  if (car.dir === 0 || car.dir === 2) {
    car.x = Math.round(car.x / BLOCK_SIZE) * BLOCK_SIZE + (car.dir === 0 ? LANE_OFFSET : -LANE_OFFSET);
  } else {
    car.z = Math.round(car.z / BLOCK_SIZE) * BLOCK_SIZE + (car.dir === 1 ? LANE_OFFSET : -LANE_OFFSET);
  }
  return car;
}

export function isLaneAligned(car) {
  const eps = 1e-6;
  if (car.dir === 0 || car.dir === 2) {
    const expected = Math.round(car.x / BLOCK_SIZE) * BLOCK_SIZE + (car.dir === 0 ? LANE_OFFSET : -LANE_OFFSET);
    return Math.abs(car.x - expected) < eps;
  }
  const expected = Math.round(car.z / BLOCK_SIZE) * BLOCK_SIZE + (car.dir === 1 ? LANE_OFFSET : -LANE_OFFSET);
  return Math.abs(car.z - expected) < eps;
}

/** Traffic agents — 200 neon cars on the grid (source: trafficmatrix.jsx). */
export class TrafficSim {
  constructor(seed = 777, count = 200) {
    this.rand = mulberry32(seed);
    this.cars = [];
    for (let i = 0; i < count; i++) {
      const car = {
        x: (this.rand() - 0.5) * 1000,
        z: (this.rand() - 0.5) * 1000,
        dir: Math.floor(this.rand() * 4), // 0:N 1:E 2:S 3:W
        speed: 0.8 + this.rand() * 0.6,
        cyan: this.rand() > 0.5,
      };
      alignCarToLane(car);
      this.cars.push(car);
    }
  }
  step(camX, camZ) {
    for (const a of this.cars) {
      if (a.dir === 0) a.z -= a.speed;
      else if (a.dir === 1) a.x += a.speed;
      else if (a.dir === 2) a.z += a.speed;
      else a.x -= a.speed;
      // Wrap around the camera so traffic stays in view (source behavior)
      if (Math.abs(a.x - camX) > 500) {
        a.x = camX - Math.sign(a.x - camX) * 500;
        a.dir = Math.floor(this.rand() * 4);
        alignCarToLane(a);
      }
      if (Math.abs(a.z - camZ) > 500) {
        a.z = camZ - Math.sign(a.z - camZ) * 500;
        a.dir = Math.floor(this.rand() * 4);
        alignCarToLane(a);
      }
    }
  }
}

/** Henry's car — autonomous, only on shift (source: henrycar.jsx). */
export class HenryCarSim {
  constructor() {
    this.x = 0; this.z = 0; this.dir = 0; this.speed = 1.2;
    this.rand = mulberry32(99);
  }
  step(simulatedMinutes) {
    if (!henryCarActive(simulatedMinutes)) return false;
    if (this.dir === 0) this.z -= this.speed;
    else if (this.dir === 1) this.x += this.speed;
    else if (this.dir === 2) this.z += this.speed;
    else this.x -= this.speed;
    // Random turns at intersections (every 50 units), small probability
    if (Math.abs(this.x % BLOCK_SIZE) < 1.5 && Math.abs(this.z % BLOCK_SIZE) < 1.5) {
      if (this.rand() > 0.97) {
        this.dir = Math.floor(this.rand() * 4);
        if (this.dir === 0 || this.dir === 2) {
          this.x = Math.round(this.x / BLOCK_SIZE) * BLOCK_SIZE + (this.dir === 0 ? LANE_OFFSET : -LANE_OFFSET);
        } else {
          this.z = Math.round(this.z / BLOCK_SIZE) * BLOCK_SIZE + (this.dir === 1 ? LANE_OFFSET : -LANE_OFFSET);
        }
      }
    }
    // Infinite city wrapping
    if (this.x > 800) this.x -= 1600;
    if (this.x < -800) this.x += 1600;
    if (this.z > 800) this.z -= 1600;
    if (this.z < -800) this.z += 1600;
    return true;
  }
}

/** Storm ash particles (source: environment.jsx storm particulate system). */
export class AshSim {
  constructor(seed = 5150, count = 320) {
    const rand = mulberry32(seed);
    this.parts = [];
    for (let i = 0; i < count; i++) {
      this.parts.push({
        x: (rand() - 0.5) * 1600, y: rand() * 600, z: (rand() - 0.5) * 1600,
        speed: 1 + rand() * 3, wobble: rand() * Math.PI * 2,
      });
    }
  }
  step(storm, t) {
    for (const p of this.parts) {
      if (storm) {
        p.y -= p.speed * 4;
        p.x += Math.sin(t * 2 + p.wobble) * 2;
      } else {
        p.y -= p.speed * 0.2;
        p.x += Math.sin(t + p.wobble) * 0.5;
      }
      if (p.y < 0) p.y = 600;
    }
  }
}
