// lib/asteroid-belt.js
// The asteroid belt's procedural generation — pure, no three.js, no
// React — so the renderer (components/AsteroidField.jsx), the hub
// flight colliders (lib/hub-collision.js, via the component's
// registration) AND the baseball bounce set (lib/hub-baseball/
// colliders.js) all read the SAME rocks from the SAME seeded
// generator. Moved verbatim from AsteroidField.jsx (Nov 27, 2026):
// the RNG seed (9001), the draw order and every constant are
// unchanged, so the belt renders exactly where it always did. The
// only difference: spinAxis is a plain {x,y,z} here (the component
// wraps it in a THREE.Vector3 at use time) so this module stays
// headless-testable. The IIFE keeps the three spin-axis draws in
// their original position in the sequence (after scale, before
// spinSpeed) — moving them would re-deal the whole belt.

import {
  ASTEROID_CENTER,
  ASTEROID_COUNT,
  ASTEROID_FIELD_RADIUS,
} from './hub-layout.js';

// Seeded RNG so the belt is identical for every client.
export function makeRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// Per-asteroid analytic motion parameters.
export function makeBelt() {
  const rnd = makeRng(9001);
  const rocks = [];
  for (let i = 0; i < ASTEROID_COUNT; i++) {
    // Random point in a flattened disc around the field center.
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * ASTEROID_FIELD_RADIUS;
    const size = 1.6 + rnd() * rnd() * 5.2; // 1.6..~6.8 world radius
    rocks.push({
      anchor: {
        x: ASTEROID_CENTER.x + Math.cos(a) * r,
        y: ASTEROID_CENTER.y + (rnd() - 0.5) * 70,
        z: ASTEROID_CENTER.z + Math.sin(a) * r,
      },
      driftAmp: 4 + rnd() * 7,
      driftW: [0.008 + rnd() * 0.02, 0.006 + rnd() * 0.016, 0.008 + rnd() * 0.02],
      driftP: [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28],
      scale: [
        size * (0.75 + rnd() * 0.6),
        size * (0.7 + rnd() * 0.55),
        size * (0.75 + rnd() * 0.6),
      ],
      spinAxis: (() => {
        const sx = rnd() - 0.5;
        const sy = rnd() - 0.5;
        const sz = rnd() - 0.5;
        const sl = Math.hypot(sx, sy, sz) || 1;
        return { x: sx / sl, y: sy / sl, z: sz / sl };
      })(),
      spinSpeed: 0.05 + rnd() * 0.22, // slow tumble
      spinPhase: rnd() * 6.28,
      tint: 0.82 + rnd() * 0.36,
      radius: Math.max(size * 1.35, 2.2),
    });
  }
  return rocks;
}

/** Analytic rock center at time t — shared by renderer and colliders. */
export function asteroidPositionAt(rock, t) {
  return {
    x: rock.anchor.x + Math.sin(rock.driftW[0] * t + rock.driftP[0]) * rock.driftAmp,
    y: rock.anchor.y + Math.sin(rock.driftW[1] * t + rock.driftP[1]) * rock.driftAmp * 0.6,
    z: rock.anchor.z + Math.sin(rock.driftW[2] * t + rock.driftP[2]) * rock.driftAmp,
  };
}
