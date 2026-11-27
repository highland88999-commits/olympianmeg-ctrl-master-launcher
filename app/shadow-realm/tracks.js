// app/shadow-realm/tracks.js — SHADOW REALM track table + procedural layout math.
//
// Pure JavaScript (no JSX, no Three.js) so the headless test suite can
// import it directly. Every track is a CLOSED loop defined by a radial
// harmonic function:
//
//   x = R * ax * cos(t)
//   z = R * az * sin(t)
//   r(t) = 1 + sum( harmonics )           (applied to both x and z)
//
// Closed by construction: r(0) == r(2π). The centerline is sampled into a
// polyline; barrier loops are offset ±halfWidth along the polyline normal
// (winding-corrected), also closed polylines.
//
// Layout vocabulary: oval, ring, circuit, figure-eight, canyon, switchback,
// tri-oval, kidney, comet, volcano, starburst, chicane, diamond, hairpin,
// thunder, coil, crossover, wave, speedway, keyhole.
//
// Standing geometry law: barriers are solid — the rider bounces/deflects
// off them, NEVER dies. Barrier math lives in race.js.

export const TRACKS = [
  {
    key: 'gridiron-oval',
    name: 'Gridiron Oval',
    layout: 'oval',
    R: 120, ax: 1.28, az: 1.0, width: 24,
    desc: 'Classic speedway oval — wide, fast, forgiving. Learn the bike here.',
  },
  {
    key: 'neon-ring',
    name: 'Neon Ring',
    layout: 'ring',
    R: 105, ax: 1.0, az: 1.0, width: 21,
    desc: 'A perfect circle of light. Hold the throttle and carve.',
  },
  {
    key: 'tri-oval-prime',
    name: 'Tri-Oval Prime',
    layout: 'tri-oval',
    R: 118, ax: 1.15, az: 1.0, width: 23,
    harmonics: [{ k: 3, amp: 0.15 }],
    desc: 'Three-lobed super-oval. Rhythm over raw speed.',
  },
  {
    key: 'kidney-run',
    name: 'Kidney Run',
    layout: 'kidney',
    R: 112, ax: 1.12, az: 1.0, width: 21,
    harmonics: [{ k: 1, amp: -0.2 }, { k: 2, amp: 0.07 }],
    desc: 'Bean-shaped duel loop — one tight end, one flowing end.',
  },
  {
    key: 'figure-eight',
    name: 'Figure Eight',
    layout: 'figure-eight',
    R: 110, ax: 1.25, az: 1.0, width: 20,
    desc: 'The grid classic. Two loops, one crossing — mind the traffic line.',
  },
  {
    key: 'canyon-carve',
    name: 'Canyon Carve',
    layout: 'canyon',
    R: 115, ax: 1.45, az: 1.0, width: 23,
    harmonics: [{ k: 4, amp: 0.09, phase: Math.PI / 3 }],
    desc: 'Long canyon walls with a rippled edge. Draft the straights.',
  },
  {
    key: 'switchback',
    name: 'Switchback',
    layout: 'switchback',
    R: 108, ax: 1.2, az: 1.0, width: 20,
    harmonics: [{ k: 3, amp: 0.17, phase: Math.PI / 2 }],
    desc: 'Serpentine S-curves stacked end to end. Brakes earn their keep.',
  },
  {
    key: 'comet-tail',
    name: 'Comet Tail',
    layout: 'comet',
    R: 116, ax: 1.1, az: 1.0, width: 21,
    harmonics: [{ k: 1, amp: 0.32 }],
    desc: 'Teardrop loop — a fat sweeping head into a needle tail.',
  },
  {
    key: 'volcano',
    name: 'Volcano',
    layout: 'volcano',
    R: 106, ax: 1.0, az: 1.0, width: 21,
    harmonics: [{ k: 5, amp: 0.2 }],
    desc: 'Five-lobed rose. Constant radius changes, zero rest.',
  },
  {
    key: 'starburst',
    name: 'Starburst',
    layout: 'starburst',
    R: 110, ax: 1.05, az: 1.0, width: 20,
    harmonics: [{ k: 6, amp: 0.13 }, { k: 3, amp: 0.09 }],
    desc: 'Six-point burst. Punchy direction changes under the moon.',
  },
  {
    key: 'chicane-alley',
    name: 'Chicane Alley',
    layout: 'chicane',
    R: 114, ax: 1.5, az: 1.0, width: 21,
    harmonics: [{ k: 2, amp: 0.11, phase: Math.PI / 2 }],
    desc: 'Long fast alley with a mid-straight chicane kink.',
  },
  {
    key: 'diamond-cut',
    name: 'Diamond Cut',
    layout: 'diamond',
    R: 108, ax: 1.0, az: 1.0, width: 21,
    squircle: 0.52, rotate: Math.PI / 4,
    desc: 'A rotated rounded-square. Four identical 90° tests.',
  },
  {
    key: 'hairpin-heights',
    name: 'Hairpin Heights',
    layout: 'hairpin',
    R: 118, ax: 2.15, az: 1.0, width: 23,
    desc: 'Stretched to the limit — two brutal hairpins, two drag strips.',
  },
  {
    key: 'thunder-loop',
    name: 'Thunder Loop',
    layout: 'thunder',
    R: 112, ax: 1.18, az: 1.0, width: 20,
    harmonics: [{ k: 4, amp: 0.15, phase: Math.PI / 4 }],
    desc: 'Lightning-folded loop. Late apex everything.',
  },
  {
    key: 'coil',
    name: 'The Coil',
    layout: 'coil',
    R: 110, ax: 1.1, az: 1.0, width: 21,
    harmonics: [{ k: 2, amp: 0.12, phase: Math.PI }],
    desc: 'A wound spring of a circuit — tightening, releasing, tightening.',
  },
  {
    key: 'crossover',
    name: 'Crossover',
    layout: 'crossover',
    R: 108, ax: 1.25, az: 1.0, width: 20,
    rotate: Math.PI / 2,
    desc: 'Figure eight stood on end. The crossing hits at full lean.',
  },
  {
    key: 'wave-rider',
    name: 'Wave Rider',
    layout: 'wave',
    R: 116, ax: 1.4, az: 1.0, width: 23,
    harmonics: [{ k: 7, amp: 0.07 }],
    desc: 'Seven rolling swells along a fast oval. Surf the ripples.',
  },
  {
    key: 'neon-mile',
    name: 'Neon Mile',
    layout: 'speedway',
    R: 122, ax: 2.55, az: 1.0, width: 24,
    squircle: 0.42,
    desc: 'The longest straight on the grid. Top speed is the whole game.',
  },
  {
    key: 'keyhole',
    name: 'Keyhole',
    layout: 'keyhole',
    R: 112, ax: 1.0, az: 1.0, width: 21,
    harmonics: [{ k: 2, amp: 0.26, phase: 0 }],
    desc: 'A round bowl pinched into a slot. Entry speed is everything.',
  },
  {
    key: 'grand-circuit',
    name: 'Grand Circuit',
    layout: 'circuit',
    R: 120, ax: 1.35, az: 1.0, width: 23,
    squircle: 0.6,
    desc: 'The championship layout — stadium flow, grand-stand sweep.',
  },
  {
    key: 'eternal-flame',
    name: 'Eternal Flame',
    layout: 'ring',
    R: 96, ax: 1.0, az: 1.0, width: 36,
    desc: 'A long ring around the eternal flame. Bump rivals in — 3 lives, last bike standing wins.',
    // BUMP RACE arena (Merlin 2026-10-03): the inner edge is OPEN — the
    // flame is the hazard. resolveOuterOnly keeps the outer wall solid.
    bump: true,
    flame: { x: 0, z: 0, radius: 62, rimR: 56 },
  },
];

export const TRACK_COUNT = TRACKS.length;

export function trackByKey(key) {
  return TRACKS.find((t) => t.key === key) || TRACKS[0];
}

/** True for bump-rules arenas (inner edge open, flame hazard live). */
export function isBumpTrack(track) {
  return !!(track && track.bump && track.flame);
}

// --- centerline sampling -------------------------------------------------

function radialScale(track, t) {
  let r = 1;
  if (track.harmonics) {
    for (const h of track.harmonics) {
      r += (h.amp || 0) * Math.cos((h.k || 1) * t + (h.phase || 0));
    }
  }
  return r;
}

function superPow(v, exp) {
  return Math.sign(v) * Math.pow(Math.abs(v), exp);
}

// centerline(track, n) -> [{x, z}] closed polyline (last point NOT repeated).
export function centerline(track, n = 256) {
  const pts = [];
  const ax = track.ax || 1;
  const az = track.az || 1;
  const R = track.R || 110;
  const rot = track.rotate || 0;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);

  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    let x;
    let z;
    if (track.layout === 'figure-eight' || track.layout === 'crossover') {
      // Bernoulli lemniscate — a true crossing loop.
      const d = 1 + Math.sin(t) * Math.sin(t);
      x = (R * ax * Math.cos(t)) / d;
      z = (R * az * Math.sin(t) * Math.cos(t)) / d;
    } else if (track.squircle) {
      x = R * ax * superPow(Math.cos(t), track.squircle);
      z = R * az * superPow(Math.sin(t), track.squircle);
    } else {
      const r = radialScale(track, t);
      x = R * ax * Math.cos(t) * r;
      z = R * az * Math.sin(t) * r;
    }
    if (rot) {
      const rx = x * cosR - z * sinR;
      const rz = x * sinR + z * cosR;
      x = rx;
      z = rz;
    }
    pts.push({ x, z });
  }
  return pts;
}

// --- barrier loops --------------------------------------------------------
// Offset the centerline ±halfWidth along the polyline normal. Winding is
// corrected so "outer" is genuinely outward. Both loops are closed
// polylines (no repeated last point).

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}

export function barrierLoops(track, n = 256) {
  const center = centerline(track, n);
  const halfW = (track.width || 21) / 2;
  const ccw = signedArea(center) > 0;
  const inner = [];
  const outer = [];
  for (let i = 0; i < center.length; i++) {
    const p = center[i];
    const q = center[(i + 1) % center.length];
    const r = center[(i - 1 + center.length) % center.length];
    let tx = q.x - r.x;
    let tz = q.z - r.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    // For CCW winding in XZ, outward normal is (tz, -tx); flip otherwise.
    let nx = ccw ? tz : -tz;
    let nz = ccw ? -tx : tx;
    inner.push({ x: p.x - nx * halfW, z: p.z - nz * halfW });
    outer.push({ x: p.x + nx * halfW, z: p.z + nz * halfW });
  }
  return { center, inner, outer, halfW };
}

// startPose(track, n) -> spawn just behind the start/finish line, facing
// along the loop. Used by the scene for spawn-to-bike.
export function startPose(track, n = 256) {
  const center = centerline(track, n);
  const p0 = center[0];
  const p1 = center[1];
  const dx = p1.x - p0.x;
  const dz = p1.z - p0.z;
  const len = Math.hypot(dx, dz) || 1;
  const heading = Math.atan2(dx / len, dz / len); // yaw, nose +Z at 0
  return {
    x: p0.x - (dx / len) * 12,
    z: p0.z - (dz / len) * 12,
    heading,
  };
}

// trackLength(track, n) — approx loop length in world units.
export function trackLength(track, n = 256) {
  const center = centerline(track, n);
  let len = 0;
  for (let i = 0; i < center.length; i++) {
    const p = center[i];
    const q = center[(i + 1) % center.length];
    len += Math.hypot(q.x - p.x, q.z - p.z);
  }
  return len;
}
