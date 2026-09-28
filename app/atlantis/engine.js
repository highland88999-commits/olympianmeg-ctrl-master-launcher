/**
 * Atlantis — pure logic for the Olympus Anchor interactive blueprint.
 * Scene cross-section math, bubble/fish school spawners, depth mapping.
 */

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

/** Depth explorer: slider 0..1 maps to a camera offset in a 1200px scene. */
export function depthForSlider(s) {
  const clamped = Math.max(0, Math.min(1, s));
  return clamped * 1200;
}

/** Zone label for the explorer readout. */
export function explorerZone(depth) {
  if (depth < 250) return "SURFACE SWELL";
  if (depth < 550) return "ANCHOR FIELD";
  if (depth < 850) return "DOME INTERIOR";
  return "BALLAST KEEL";
}

/** Geometry of the island cross-section in scene units (W=960, sceneH=1400). */
export const ISLAND = {
  W: 960,
  sceneH: 1400,
  surfaceY: 260,
  dome: { cx: 480, cy: 460, rx: 300, ry: 200 }, // elliptical dome
  keelDepth: 85 * 6, // 85m draft scaled
};

/** Spawn a bubble. Pure — takes rng. */
export function spawnBubble(rng, W, topY) {
  return {
    x: rng() * W,
    y: topY + rng() * 300,
    r: 1.5 + rng() * 4,
    vy: 18 + rng() * 40,
    sway: rng() * Math.PI * 2,
    life: 8 + rng() * 6,
  };
}

export function stepBubbles(bubbles, dt, topY, rng, W) {
  for (const b of bubbles) {
    b.y -= b.vy * dt;
    b.sway += dt * 2;
    b.x += Math.sin(b.sway) * 12 * dt;
    b.life -= dt;
    if (b.life <= 0 || b.y < topY - 40) {
      Object.assign(b, spawnBubble(rng, W, topY));
    }
  }
  return bubbles;
}

/** Spawn a fish with a cruising lane. */
export function spawnFish(rng, W, sceneH, id) {
  const dir = rng() > 0.5 ? 1 : -1;
  return {
    id,
    x: dir > 0 ? -60 : W + 60,
    y: 120 + rng() * (sceneH - 240),
    dir,
    speed: 40 + rng() * 70,
    size: 8 + rng() * 14,
    hue: rng() > 0.5 ? "cyan" : "pink",
    phase: rng() * Math.PI * 2,
  };
}

export function stepFish(school, dt, W, sceneH, rng) {
  for (const f of school) {
    f.x += f.dir * f.speed * dt;
    f.phase += dt * 6;
    f.y += Math.sin(f.phase) * 10 * dt;
    if ((f.dir > 0 && f.x > W + 80) || (f.dir < 0 && f.x < -80)) {
      Object.assign(f, spawnFish(rng, W, sceneH, f.id));
    }
  }
  return school;
}

/** Point on the dome ellipse for angle theta (0..2π). */
export function domePoint(theta, dome) {
  return {
    x: dome.cx + dome.rx * Math.cos(theta),
    y: dome.cy - dome.ry * Math.sin(theta),
  };
}

/** The four blueprint spec sections (content preserved from the prospectus). */
export const SPECS = [
  {
    id: "geometry",
    no: "01",
    title: "Geometric & Volumetric Scaling",
    rows: [
      ["Total Diameter", "5,000 meters (5 km)"],
      ["Surface Area", "19.6 Square Kilometers"],
      ["Submerged Draft", "85 meters deep (heavy ballast for self-righting)"],
      ["Mass Displacement", "500,000,000,000 kg (500 Megatonnes)"],
      ["Hull Material", "Smelted karbonite core, 5-meter titanium-basalt matrix"],
    ],
  },
  {
    id: "roll",
    no: "02",
    title: "360° Roll Survival Protocol",
    points: [
      "Aegis Dome 2.0 — polycarbonate-graphene laminate, hermetic seal in under 8 minutes.",
      "Structural fusing — all 500 housing units molecularly welded to the titanium sub-frame.",
      "Emergency gyro-seats — gimballed 5-point harness seats keep occupants upright during a roll.",
      "Articulated breakaway dock — magnetic clamps auto-detach to prevent asymmetrical drag.",
    ],
  },
  {
    id: "habitation",
    no: "03",
    title: "Habitation, Flora & Soil Matrix",
    points: [
      "500 aerodynamically-shaped housing units zoned into the landscape.",
      "300,000 cubic meters of engineered lightweight soil sustain the floating forest.",
      "Root-locking titanium honeycomb grid locks tree roots into the hull for inversions.",
      "Zero-gravity backflow preventers keep waste contained during a capsize.",
    ],
  },
  {
    id: "propulsion",
    no: "04",
    title: "Propulsion & AI Navigation",
    points: [
      "24 azimuth thrusters (360°) powered by kinetic wave generators and a deep-hull micro-reactor.",
      "Dynamic Positioning System — real-time wind, current and wave compensation without tethers.",
      "Automated AIS/aviation broadcast warns incoming traffic during dome deployments.",
    ],
  },
];
