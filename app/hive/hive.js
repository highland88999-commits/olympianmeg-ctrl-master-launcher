// hive.js — pure logic for the Hive module. No DOM, no canvas, no network.
// Axial-coordinate hex grid (pointy-top), pulse propagation, hive-mind meter.

export const DIRECTIONS = [
  [1, 0], [1, -1], [0, -1],
  [-1, 0], [-1, 1], [0, 1],
];

export const MODES = {
  dormant: {
    label: 'Dormant',
    description: 'The hive sleeps. Tap a cell to wake it.',
    streamCount: 0,
    droneCount: 0,
    ambientSpeed: 0.25,
    pulseDelayMs: 220,
  },
  active: {
    label: 'Active',
    description: 'Data streams flow through the hive channels.',
    streamCount: 14,
    droneCount: 0,
    ambientSpeed: 1,
    pulseDelayMs: 140,
  },
  swarm: {
    label: 'Swarm',
    description: 'Drone lights orbit the core. The hive is fully awake.',
    streamCount: 22,
    droneCount: 12,
    ambientSpeed: 1.8,
    pulseDelayMs: 90,
  },
};

export const MODE_KEYS = Object.keys(MODES);

export function hexKey(q, r) {
  return q + ',' + r;
}

export function parseKey(key) {
  const [q, r] = key.split(',').map(Number);
  return [q, r];
}

// The six axial neighbors of (q, r).
export function neighborKeys(q, r) {
  return DIRECTIONS.map(([dq, dr]) => hexKey(q + dq, r + dr));
}

// Build a hexagonal grid of the given radius (radius 0 = single cell).
// Returns a Map of key -> { q, r, energy }.
export function buildGrid(radius) {
  const cells = new Map();
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      cells.set(hexKey(q, r), { q, r, energy: 0 });
    }
  }
  return cells;
}

export function cellCount(radius) {
  return 1 + 3 * radius * (radius + 1);
}

// Pointy-top axial -> pixel.
export function hexToPixel(q, r, size) {
  return {
    x: size * Math.sqrt(3) * (q + r / 2),
    y: size * 1.5 * r,
  };
}

// Pixel -> axial, rounded to the nearest hex (cube rounding).
export function pixelToHex(x, y, size) {
  const qf = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
  const rf = ((2 / 3) * y) / size;
  // axial -> cube
  let cx = qf;
  let cz = rf;
  let cy = -cx - cz;
  // round cube
  let rx = Math.round(cx);
  let ry = Math.round(cy);
  let rz = Math.round(cz);
  const dx = Math.abs(rx - cx);
  const dy = Math.abs(ry - cy);
  const dz = Math.abs(rz - cz);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return [rx, rz]; // cube x -> axial q, cube z -> axial r
}

const PULSE_SPREAD = 0.55; // energy passed to each neighbor ring
const PULSE_RINGS = 2;     // how many rings the chain reaction reaches
const METER_PER_TAP = 6;
const METER_DECAY_PER_SEC = 1.2;
const AWAKEN_RESET = 20;

export class HiveCore {
  constructor({ radius = 5, mode = 'active' } = {}) {
    this.radius = radius;
    this.cells = buildGrid(radius);
    this.queue = []; // { at, key, energy, ring }
    this.meter = 0;
    this.awakenedAt = 0; // timestamp (ms) of last awakening, 0 = never
    this.setMode(mode);
  }

  setMode(mode) {
    if (!MODES[mode]) throw new Error('Unknown hive mode: ' + mode);
    this.mode = mode;
    this.modeParams = MODES[mode];
  }

  getCell(key) {
    return this.cells.get(key);
  }

  // A direct tap: energize the cell and schedule the chain reaction.
  // Returns the number of pulses scheduled (self + rings).
  energize(key, nowMs) {
    const cell = this.cells.get(key);
    if (!cell) return 0;
    let scheduled = 0;
    this.queue.push({ at: nowMs, key, energy: 1, ring: 0 });
    scheduled += 1;
    let frontier = [key];
    const seen = new Set([key]);
    const delay = this.modeParams.pulseDelayMs;
    for (let ring = 1; ring <= PULSE_RINGS; ring++) {
      const next = [];
      for (const fk of frontier) {
        const [q, r] = parseKey(fk);
        for (const nk of neighborKeys(q, r)) {
          if (seen.has(nk) || !this.cells.has(nk)) continue;
          seen.add(nk);
          next.push(nk);
          this.queue.push({
            at: nowMs + ring * delay,
            key: nk,
            energy: Math.pow(PULSE_SPREAD, ring),
            ring,
          });
          scheduled += 1;
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    this.meter = Math.min(100, this.meter + METER_PER_TAP);
    return scheduled;
  }

  // Advance the simulation to nowMs. Returns events: [{ type: 'awaken' }].
  step(nowMs) {
    const events = [];
    if (this._lastStepMs == null) this._lastStepMs = nowMs;
    const dtSec = Math.max(0, (nowMs - this._lastStepMs) / 1000);
    this._lastStepMs = nowMs;

    // Fire due pulses.
    const due = [];
    const rest = [];
    for (const item of this.queue) {
      if (item.at <= nowMs) due.push(item);
      else rest.push(item);
    }
    this.queue = rest;
    for (const item of due) {
      const cell = this.cells.get(item.key);
      if (cell) cell.energy = Math.min(1.5, cell.energy + item.energy);
    }

    // Decay cell energy.
    const decayFactor = Math.pow(0.35, dtSec); // fast-ish fade
    for (const cell of this.cells.values()) {
      if (cell.energy > 0.001) cell.energy *= decayFactor;
      else cell.energy = 0;
    }

    // Decay the meter.
    this.meter = Math.max(0, this.meter - METER_DECAY_PER_SEC * dtSec);

    // Awakening.
    if (this.meter >= 100) {
      this.awakenedAt = nowMs;
      this.meter = AWAKEN_RESET;
      events.push({ type: 'awaken' });
      // Celebration: energize every cell once, no meter gain.
      for (const key of this.cells.keys()) {
        this.queue.push({ at: nowMs + Math.random() * 400, key, energy: 0.8, ring: 0, quiet: true });
      }
    }

    return events;
  }

  // Cells with meaningful energy, for the renderer.
  litCells() {
    const out = [];
    for (const [key, cell] of this.cells) {
      if (cell.energy > 0.01) out.push({ key, q: cell.q, r: cell.r, energy: cell.energy });
    }
    return out;
  }

  pendingCount() {
    return this.queue.length;
  }
}
