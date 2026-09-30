// singularity.js — pure logic for the Hitchhiker's Guide singularity toy.
// A black hole sits at the center of a 2D field. Launched objects fall toward
// it on simple gravity and are consumed when they reach the event horizon.
// No DOM, no network. All randomness is injected via an rng function so tests
// can use a deterministic seed.

export const GRAVITY = 150;
export const HOLD_THRESHOLD_MS = 300; // hold longer than this to cycle tiers
export const CYCLE_MS = 700; // how long each tier stays locked while cycling

// The launch ladder, smallest to largest. Port of the source's objectTiers
// (Marble -> Star), plus the Data Slab that accepts an uploaded image.
export const TIERS = [
  { name: 'Marble', radius: 6, color: '#00f2ff', glyph: 'M' },
  { name: 'Dice', radius: 8, color: '#ffffff', glyph: 'D' },
  { name: 'Tesseract', radius: 10, color: '#aa00ff', glyph: 'T' },
  { name: 'Meteor', radius: 12, color: '#888888', glyph: 'M' },
  { name: 'Satellite', radius: 14, color: '#00aaff', glyph: 'S' },
  { name: 'Truck', radius: 16, color: '#ff0000', glyph: 'T' },
  { name: 'UFO', radius: 18, color: '#00ff88', glyph: 'U' },
  { name: 'Pyramid', radius: 20, color: '#ffd700', glyph: 'P' },
  { name: 'House', radius: 22, color: '#00ff00', glyph: 'H' },
  { name: 'Skyscraper', radius: 24, color: '#00bbff', glyph: 'S' },
  { name: 'Moon', radius: 28, color: '#bbbbbb', glyph: 'M' },
  { name: 'Station', radius: 32, color: '#ffffff', glyph: 'S' },
  { name: 'Planet', radius: 36, color: '#0055ff', glyph: 'P' },
  { name: 'Gas Giant', radius: 42, color: '#ffaa55', glyph: 'G' },
  { name: 'Pulsar', radius: 50, color: '#ddffff', glyph: 'P' },
  { name: 'Star', radius: 58, color: '#ffaa00', glyph: 'S' },
  { name: 'Data Slab', radius: 26, color: '#ff00ff', glyph: '#' },
];

export function createWorld(width, height) {
  const holeR = Math.max(28, Math.min(width, height) * 0.07);
  return {
    width,
    height,
    hole: { x: width / 2, y: height / 2, r: holeR },
    bodies: [],
    flashes: [], // {x, y, age} impact flashes rendered by the view layer
    consumed: 0,
    launched: 0,
  };
}

// rng: () => number in [0, 1). Defaults to Math.random.
export function spawnBody(world, tierIndex, rng = Math.random) {
  const tier = TIERS[((tierIndex % TIERS.length) + TIERS.length) % TIERS.length];
  const angle = rng() * Math.PI * 2;
  const dist = Math.min(world.width, world.height) * 0.45 + rng() * 40;
  const x = world.hole.x + Math.cos(angle) * dist;
  const y = world.hole.y + Math.sin(angle) * dist;
  // Tangential kick so bodies orbit instead of falling straight in.
  const speed = 60 + rng() * 60;
  const vx = -Math.sin(angle) * speed;
  const vy = Math.cos(angle) * speed;
  const body = {
    tierIndex,
    name: tier.name,
    color: tier.color,
    glyph: tier.glyph,
    radius: tier.radius,
    x,
    y,
    vx,
    vy,
    spin: (rng() - 0.5) * 2,
    angle: rng() * Math.PI * 2,
  };
  world.bodies.push(body);
  world.launched += 1;
  return body;
}

// Advance the simulation by dt seconds. Returns the number of bodies consumed.
export function stepWorld(world, dt) {
  if (!(dt > 0)) return 0;
  // Clamp huge frame gaps so a backgrounded tab does not teleport bodies.
  const step = Math.min(dt, 0.05);
  let consumed = 0;
  const { x: hx, y: hy, r: hr } = world.hole;

  for (let i = world.bodies.length - 1; i >= 0; i -= 1) {
    const b = world.bodies[i];
    const dx = hx - b.x;
    const dy = hy - b.y;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq) || 1;

    if (dist < hr + b.radius * 0.5) {
      world.bodies.splice(i, 1);
      world.flashes.push({ x: b.x, y: b.y, age: 0, color: b.color });
      world.consumed += 1;
      consumed += 1;
      continue;
    }

    const force = GRAVITY / (distSq * 0.01 + 1);
    b.vx += (dx / dist) * force * step;
    b.vy += (dy / dist) * force * step;
    // Soft speed cap keeps orbits stable and the view readable.
    const sp = Math.hypot(b.vx, b.vy);
    const maxSp = 260;
    if (sp > maxSp) {
      b.vx = (b.vx / sp) * maxSp;
      b.vy = (b.vy / sp) * maxSp;
    }
    b.x += b.vx * step;
    b.y += b.vy * step;
    b.angle += b.spin * step;
  }

  for (let i = world.flashes.length - 1; i >= 0; i -= 1) {
    world.flashes[i].age += step;
    if (world.flashes[i].age > 0.6) world.flashes.splice(i, 1);
  }
  return consumed;
}

// Which tier index is locked after holding the launch button for pressMs.
// Pure function of time; the view layer calls it while the button is held.
export function tierForHoldTime(pressMs, tierCount = TIERS.length) {
  if (pressMs < HOLD_THRESHOLD_MS) return null; // still a tap: keep current tier
  const cycleTime = pressMs - HOLD_THRESHOLD_MS;
  return Math.floor(cycleTime / CYCLE_MS) % tierCount;
}

// Charge-bar fill in [0,1] for the current cycle position.
export function chargeFill(pressMs) {
  if (pressMs < HOLD_THRESHOLD_MS) return 0;
  const cycleTime = pressMs - HOLD_THRESHOLD_MS;
  return (cycleTime % CYCLE_MS) / CYCLE_MS;
}

// Deterministic seeded rng (mulberry32) for the starfield and tests.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Starfield points for the background. Deterministic for a given seed.
export function makeStars(count, width, height, rng = mulberry32(42)) {
  const stars = [];
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: rng() * width,
      y: rng() * height,
      r: 0.4 + rng() * 1.3,
      tw: rng() * Math.PI * 2, // twinkle phase
    });
  }
  return stars;
}
