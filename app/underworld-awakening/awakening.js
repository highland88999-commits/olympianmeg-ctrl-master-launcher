// UNDERWORLD AWAKENING — the descent sequence (pure logic).
// A scripted three-act cinematic: the warp (a soul-road tunnel ride), the
// approach (the gates resolve out of the dark), and the gates themselves.
// The renderer reads this state machine; all math here is headless-testable.

export const PHASES = ["dormant", "warp", "approach", "gates"];

export const WARP_DURATION = 7.0;
export const APPROACH_DURATION = 5.0;
export const RING_COUNT = 26;

export function createDescent() {
  return { phase: "dormant", t: 0 };
}

export function beginDescent(d) {
  d.phase = "warp";
  d.t = 0;
}

export function replayDescent(d) {
  d.phase = "dormant";
  d.t = 0;
}

// advance the cinematic clock; returns the phase after the update
export function updateDescent(d, dt) {
  if (d.phase === "dormant" || d.phase === "gates" || dt <= 0) return d.phase;
  d.t += dt;
  if (d.phase === "warp" && d.t >= WARP_DURATION) {
    d.phase = "approach";
    d.t = 0;
  } else if (d.phase === "approach" && d.t >= APPROACH_DURATION) {
    d.phase = "gates";
    d.t = 0;
  }
  return d.phase;
}

export function phaseProgress(d) {
  if (d.phase === "warp") return Math.min(1, d.t / WARP_DURATION);
  if (d.phase === "approach") return Math.min(1, d.t / APPROACH_DURATION);
  if (d.phase === "gates") return 1;
  return 0;
}

// Tunnel ring i (0 = nearest) at cinematic time t: expanding rings rushing
// past the viewer. Returns { radius (0..1.4 of half-view), alpha }.
export function tunnelRing(i, t, speed = 1) {
  const cycle = 3.2 / speed;
  const p = ((t * speed + (i / RING_COUNT) * cycle) % cycle) / cycle; // 0..1
  const radius = Math.pow(p, 2.2) * 1.4;
  const alpha = Math.max(0, 1 - p) * 0.75;
  return { radius, alpha, p };
}

// A streaking soul-light: deterministic pseudo-random from its index.
export function soulStreak(i, t, count) {
  const a1 = (i * 137.508) % 360; // golden-angle spread
  const rad = (a1 * Math.PI) / 180;
  const speed = 0.5 + ((i * 7919) % 100) / 160;
  const p = (t * speed + ((i * 31) % 100) / 100) % 1;
  return {
    angle: rad,
    r0: p * p * 1.1,
    r1: Math.min(1.4, p * p * 1.1 + 0.12 + 0.1 * p),
    alpha: (1 - p) * 0.8,
    hue: 200 + ((i * 53) % 80), // cold blues/violets/teals
  };
}

export function streakCountFor(w, h) {
  const area = w * h;
  return Math.max(40, Math.min(160, Math.floor(area / 9000)));
}
