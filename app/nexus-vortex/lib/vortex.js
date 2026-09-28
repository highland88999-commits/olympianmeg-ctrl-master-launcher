// Nexus Vortex — tunnel-flight math for a 2D canvas.
// Faithful port of the source's WebGL vortex (a spiraling particle tunnel
// flown through by a cinematic camera), re-expressed as plain 2D math so it
// runs with zero dependencies. The source ended the flight by loading a REMOTE
// app inside the page; here the flight ends at a local core panel instead.

// Deterministic PRNG (mulberry32) so the tunnel is stable between renders.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build the particle field. Each particle has an angle, radius, depth z
// (0 = near camera, 1 = far down the tunnel), and a hue.
export function makeTunnel(count = 900, seed = 0x9e3779b9) {
  const rng = makeRng(seed);
  const parts = [];
  for (let i = 0; i < count; i++) {
    parts.push({
      a: rng() * Math.PI * 2,          // base angle around the tunnel
      r: 60 + rng() * 260,             // radius from center
      z: rng(),                        // depth 0..1
      speed: 0.10 + rng() * 0.25,      // how fast it streams toward the camera
      hue: 190 + rng() * 50,           // cyan-blue range
      size: 1 + rng() * 2.2,
    });
  }
  return parts;
}

// Advance one particle along the tunnel; wraps from near back to far.
export function streamParticle(p, dt) {
  p.z -= dt * p.speed;
  if (p.z <= 0) {
    p.z += 1;
    p.a += 0.35; // keep the spiral evolving on wrap
  }
  return p;
}

// Perspective-project a tunnel particle to screen coords.
// flight: 0..1 progress of the cinematic journey (camera dives forward).
// sway: {x,y} pointer influence in -1..1.
export function projectParticle(p, t, flight, sway, w, h) {
  const spin = t * 0.9;
  const ang = p.a + spin + flight * 2.2;
  // Tunnel narrows as the camera dives; particles also drift outward as they near.
  const z = Math.max(0.02, p.z);
  const scale = (1 / z) * (0.35 + flight * 1.6);
  const r = p.r * scale * 0.28;
  const cx = w / 2 + sway.x * 40;
  const cy = h / 2 + sway.y * 30;
  const x = cx + Math.cos(ang) * r;
  const y = cy + Math.sin(ang) * r * 0.92 + (1 - z) * 12;
  const alpha = Math.min(1, Math.max(0, (1 - z) * 1.2 - 0.08));
  const size = p.size * (0.5 + (1 - z) * 2.4);
  return { x, y, alpha, size, hue: p.hue };
}

// Core emblem motion: slow spin before the flight, hidden mid-flight.
export function coreState(flight) {
  return { visible: flight < 0.28, scale: 1 + flight * 1.8 };
}

// Flight progress from elapsed ms: 8s ease in/out, mirroring the source's animated flight.
export function flightProgress(elapsedMs, durationMs = 8000) {
  const x = Math.min(1, Math.max(0, elapsedMs / durationMs));
  // easeInOutCubic
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
