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

/* ============================================================================
 * OPEN-WORLD EXPANSION — seeded district builders.
 * Pure data only (no DOM, no canvas): safe for headless unit tests.
 * The city core spans roughly ±400 world units (spread 8 × BLOCK_SIZE 50).
 * Districts extend the explorable map:
 *   harbor      EAST  (x ≈ 460–860)  — docks, water, piers, boats, cranes
 *   market      CORE  (near origin)  — neon market plaza on a road block
 *   observatory NORTH (z ≈ -620)     — hill with a domed observatory
 *   park        SOUTHWEST            — greenbelt with pond, paths, trees
 *   pois        named points of interest with labels (rendered by districts.js)
 * All builders are seeded with fixed seeds: identical across sessions.
 * ========================================================================== */

/** Fixed seeds so every district is identical across sessions. */
export const DISTRICT_SEEDS = { harbor: 6001, market: 6002, observatory: 6003, park: 6004, pois: 6005 };

/**
 * Docks / water district EAST of the city (x ≈ 460–860, z ≈ 180–620).
 * Water plane region, 4 piers, 3 warehouses, 5 moored boats, 2 pier cranes.
 */
export function buildHarbor(seed = DISTRICT_SEEDS.harbor) {
  const rand = mulberry32(seed);
  const water = { x0: 460, x1: 860, z0: 180, z1: 620 };
  const piers = [];
  for (let i = 0; i < 4; i++) {
    const z = 230 + i * 110;
    piers.push({ x: 550, z, w: 180, h: 4, d: 12 }); // deck spans x 460→640
  }
  const warehouses = [];
  const whDefs = [
    { x: 420, z: 250, w: 64, d: 44 },
    { x: 420, z: 410, w: 56, d: 40 },
    { x: 430, z: 560, w: 60, d: 42 },
  ];
  for (const def of whDefs) {
    warehouses.push({ ...def, h: 26 + rand() * 10, hue: 200 + rand() * 40 });
  }
  const boats = [];
  const boatHues = [190, 210, 160, 200, 180];
  for (let i = 0; i < 5; i++) {
    const pier = piers[i % piers.length];
    boats.push({
      x: 500 + rand() * 120,
      z: pier.z + 20 + rand() * 10,
      w: 24 + rand() * 6, h: 7, d: 10 + rand() * 3,
      phase: rand() * Math.PI * 2,
      hue: boatHues[i % boatHues.length],
    });
  }
  // cranes stand on pier decks (pier 0 and pier 3)
  const cranes = [
    { x: 620, z: 230, h: 64 },
    { x: 620, z: 560, h: 72 },
  ];
  return { water, piers, warehouses, boats, cranes };
}

/**
 * Neon market plaza at the CORE — a dedicated paved plaza near the origin
 * (plaza rect 85–215 on both axes, a both-odd road block with no towers).
 * 8 stalls with striped awnings + corner poles with sagging string lights.
 */
export function buildMarket(seed = DISTRICT_SEEDS.market) {
  const rand = mulberry32(seed);
  const plaza = { x0: 85, x1: 215, z0: 85, z1: 215 };
  const hues = ['#ff2d78', '#00f2ff', '#ffb300', '#aa00ff'];
  const stalls = [];
  const cols = [101, 133, 165, 197];
  const rows = [121, 179];
  let i = 0;
  for (const z of rows) {
    for (const x of cols) {
      stalls.push({
        x, z, w: 22, h: 9, d: 14,
        hue: hues[i % hues.length],
        goods: [hues[(i + 1) % hues.length], hues[(i + 2) % hues.length], hues[(i + 3) % hues.length]],
        phase: rand() * Math.PI * 2,
      });
      i++;
    }
  }
  // string lights: poles at the plaza corners, bulbs sagging along the perimeter
  const poles = [
    { x: 95, z: 95, h: 30 }, { x: 205, z: 95, h: 30 },
    { x: 205, z: 205, h: 30 }, { x: 95, z: 205, h: 30 },
  ];
  const spans = [[0, 1], [1, 2], [2, 3], [3, 0]];
  const bulbs = [];
  for (const [a, b] of spans) {
    const A = poles[a], B = poles[b];
    for (let k = 1; k < 7; k++) {
      const f = k / 7;
      bulbs.push({
        x: A.x + (B.x - A.x) * f,
        z: A.z + (B.z - A.z) * f,
        y: 30 - 6 * Math.sin(Math.PI * f),
        phase: rand() * Math.PI * 2,
      });
    }
  }
  return { plaza, stalls, poles, spans, bulbs };
}

/**
 * Observatory NORTH (z ≈ -620): a terraced hill with a domed observatory
 * on top. baseY of the dome = 42 (top of the third terrace).
 */
export function buildObservatory(seed = DISTRICT_SEEDS.observatory) {
  const rand = mulberry32(seed);
  const x = 0, z = -620;
  const terraces = [
    { w: 240, d: 240, y: 0, h: 14 },
    { w: 170, d: 170, y: 14, h: 14 },
    { w: 110, d: 110, y: 28, h: 14 },
  ];
  const dome = { x, z, w: 46, d: 46, h: 26, baseY: 42, slit: rand() * 0.6 - 0.3 };
  return { x, z, terraces, dome };
}

/**
 * Greenbelt park SOUTHWEST: pond, two crossing paths, 12 extra trees
 * (kept clear of the pond), 3 benches.
 */
export function buildPark(seed = DISTRICT_SEEDS.park) {
  const rand = mulberry32(seed);
  const pond = { x: -430, z: 470, w: 120, d: 84 };
  const paths = [
    { x0: -560, x1: -260, z0: 380, z1: 392 }, // east-west promenade
    { x0: -436, x1: -424, z0: 300, z1: 600 }, // north-south trail
  ];
  const trees = [];
  let guard = 0;
  while (trees.length < 12 && guard++ < 200) {
    const x = -540 + rand() * 260;
    const z = 320 + rand() * 260;
    if (Math.abs(x - pond.x) < pond.w / 2 + 18 && Math.abs(z - pond.z) < pond.d / 2 + 18) continue;
    trees.push({ x, z, s: 0.8 + rand() * 0.7 });
  }
  const benches = [
    { x: -380, z: 372, w: 8, d: 3 },
    { x: -480, z: 400, w: 8, d: 3 },
    { x: -416, z: 520, w: 3, d: 8 },
  ];
  return { pond, paths, trees, benches };
}

/**
 * Named points of interest. Includes the two workplaces referenced in
 * page.jsx ("HENRY'S WOK & GRILL" east near the harbor, "SYNTHWAVE BAR"
 * at the core) plus discoverable landmarks. Layout is hand-placed so
 * labels stay readable; the seed drives per-POI animation phase.
 * Each POI: { id, name, sub, x, z, y, kind }.
 */
export function buildPOIs(seed = DISTRICT_SEEDS.pois) {
  const rand = mulberry32(seed);
  const pois = [
    { id: 'wok', name: "HENRY'S WOK & GRILL", sub: 'East docks · shift kitchen', x: 445, z: 305, y: 0, kind: 'restaurant' },
    { id: 'synthwave', name: 'SYNTHWAVE BAR', sub: 'Core · free will, nightly', x: 62, z: 200, y: 0, kind: 'bar' },
    { id: 'axiom-spire', name: 'AXIOM RELAY SPIRE', sub: 'Network hub · sector 7', x: -520, z: -140, y: 0, kind: 'spire' },
    { id: 'memorial', name: 'MEMORIAL GARDEN', sub: 'For the ones who woke up', x: -340, z: 430, y: 0, kind: 'garden' },
    { id: 'market-gate', name: 'NIGHT MARKET GATE', sub: 'Enter the neon market', x: 150, z: 52, y: 0, kind: 'gate' },
    { id: 'observatory', name: 'STELLAR OBSERVATORY', sub: 'Star charts on the hill', x: 64, z: -600, y: 42, kind: 'observatory' },
    { id: 'harbor', name: 'HARBOR DOCKS', sub: 'East water district', x: 660, z: 400, y: 1, kind: 'harbor' },
    { id: 'park', name: 'GREENBELT PARK', sub: 'Pond · paths · quiet', x: -410, z: 380, y: 0, kind: 'park' },
  ];
  for (const p of pois) p.phase = rand() * Math.PI * 2;
  return pois;
}
