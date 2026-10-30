/**
 * olympus-eclipse — pure eclipse choreography + meteor physics.
 * No DOM, no network. Unit-testable in Node.
 */

export const CYCLE = 90; // seconds, mirrors the original's 90s timeline

/** Phase windows within one 90s cycle: [start, end, label, alertKind]. */
export const EVENT_WINDOWS = [
  { start: 7.5, end: 22.5, label: "TOTAL SOLAR ECLIPSE", kind: "solar" },
  { start: 37.5, end: 52.5, label: "LUNAR ECLIPSE", kind: "lunar" },
  { start: 67.5, end: 82.5, label: "BLOOD MOON SEQUENCE", kind: "blood" },
];

/**
 * Describe the cycle state at time t (seconds, any value; wraps).
 * Returns { cycleT, phase, activeEvent, moonShadow }.
 * - phase: "solar" | "lunar" | "blood"
 * - activeEvent: the EVENT_WINDOWS entry when inside a window, else null
 * - moonShadow: 0..1 darkness applied to the moon (earth shadow during lunar)
 * - corona: 0..1 intensity of the solar corona ring during totality
 */
export function phaseAt(t) {
  const cycleT = ((t % CYCLE) + CYCLE) % CYCLE;
  const phase = cycleT < 30 ? "solar" : cycleT < 60 ? "lunar" : "blood";
  const activeEvent =
    EVENT_WINDOWS.find((w) => cycleT >= w.start && cycleT < w.end) || null;

  // Moon sweep: passes through the sun-earth line at the middle of each window.
  // angle = offset in radians from perfect alignment, -PI..PI.
  let align = 0;
  if (phase === "solar") {
    // sweeps from +60° to -60° across the 30s phase; alignment at t=15
    align = ((15 - cycleT) / 30) * ((Math.PI * 2) / 3);
  } else {
    // lunar & blood: moon swings behind earth; alignment at t=45 / t=75
    const mid = phase === "lunar" ? 45 : 75;
    align = ((cycleT - mid) / 30) * ((Math.PI * 2) / 3);
  }

  let corona = 0;
  let moonShadow = 0;
  let bloodTint = 0;
  if (activeEvent) {
    const progress = (cycleT - activeEvent.start) / (activeEvent.end - activeEvent.start);
    const envelope = Math.sin(progress * Math.PI); // 0->1->0 across the window
    if (activeEvent.kind === "solar") corona = envelope;
    if (activeEvent.kind === "lunar") moonShadow = envelope;
    if (activeEvent.kind === "blood") bloodTint = envelope;
  }
  return { cycleT, phase, activeEvent, align, corona, moonShadow, bloodTint };
}

/** Seconds from t until the next event window starts (0 if inside one). */
export function nextEventIn(t) {
  const cycleT = ((t % CYCLE) + CYCLE) % CYCLE;
  for (const w of EVENT_WINDOWS) {
    if (cycleT >= w.start && cycleT < w.end) return 0;
    if (cycleT < w.start) return w.start - cycleT;
  }
  return EVENT_WINDOWS[0].start + CYCLE - cycleT;
}

/** Seconds from t until the start of the next window AFTER the current one:
 *  if inside a window, skips to the following window (NEXT EVENT behavior). */
export function nextWindowStart(t) {
  const cycleT = ((t % CYCLE) + CYCLE) % CYCLE;
  for (let i = 0; i < EVENT_WINDOWS.length; i++) {
    const w = EVENT_WINDOWS[i];
    if (cycleT < w.start) return w.start - cycleT;
    if (cycleT < w.end) {
      const nxt = EVENT_WINDOWS[(i + 1) % EVENT_WINDOWS.length];
      return (nxt.start - cycleT + CYCLE) % CYCLE;
    }
  }
  return EVENT_WINDOWS[0].start + CYCLE - cycleT;
}

/** Meteor showers run 8s every 45s, like the original. */
export function meteorShowerActive(t) {
  return t % 45 < 8;
}

/** 2D diorama layout for a canvas of w×h. */
export function layout(w, h) {
  const sunR = Math.min(w, h) * 0.16;
  const earthOrbitR = Math.min(w, h) * 0.34;
  const moonOrbitR = Math.min(w, h) * 0.085;
  const earthR = Math.min(w, h) * 0.052;
  const moonR = Math.min(w, h) * 0.02;
  return {
    sun: { x: w * 0.5, y: h * 0.5, r: sunR },
    earthOrbitR,
    moonOrbitR,
    earthR,
    moonR,
  };
}

/**
 * Earth position on its orbit at cycle time; moon position relative to earth
 * using the scripted alignment offset so eclipses land on schedule.
 */
export function bodyPositions(t, w, h) {
  const L = layout(w, h);
  const { cycleT } = phaseAt(t);
  // Earth drifts slowly around the sun across the cycle
  const earthAngle = -Math.PI / 2 + (cycleT / CYCLE) * Math.PI * 0.5;
  const ex = L.sun.x + Math.cos(earthAngle) * L.earthOrbitR;
  const ey = L.sun.y + Math.sin(earthAngle) * L.earthOrbitR * 0.72;
  const { align, phase } = phaseAt(t);
  // Moon sits on the sun-earth line at alignment; swings away otherwise.
  // Base direction: from earth away from sun for lunar/blood, toward sun for solar.
  const toSun = Math.atan2(L.sun.y - ey, L.sun.x - ex);
  const base = phase === "solar" ? toSun : toSun + Math.PI;
  const ma = base + align;
  const mx = ex + Math.cos(ma) * L.moonOrbitR;
  const my = ey + Math.sin(ma) * L.moonOrbitR * 0.72;
  return { ...L, ex, ey, mx, my, earthAngle };
}

/** Spawn a deterministic-ish meteor field above the viewport. */
export function spawnMeteors(count, w, h, rand = Math.random) {
  const ps = [];
  for (let i = 0; i < count; i++) {
    ps.push({
      x: rand() * w,
      y: -rand() * h * 0.4,
      vx: (rand() - 0.5) * 60,
      vy: 220 + rand() * 260,
      life: 1,
      len: 40 + rand() * 80,
    });
  }
  return ps;
}

/** Advance meteors by dt seconds; returns survivors. */
export function meteorStep(ps, dt, w, h, rand = Math.random) {
  const out = [];
  for (const p of ps) {
    const life = p.life - dt * 0.55;
    if (life <= 0) continue;
    let { x, y } = p;
    x += p.vx * dt;
    y += p.vy * dt;
    if (y > h + 120) {
      // recycle to the top
      x = rand() * w;
      y = -40 - rand() * 120;
    }
    out.push({ ...p, x, y, life });
  }
  return out;
}
