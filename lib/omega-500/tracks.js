// lib/omega-500/tracks.js — Omega 500 track data (pure data + geometry).
//
// 20 tracks, each a small parameter set. Geometry is generated
// procedurally from the parameters — no hand-built meshes:
//   - speedway ovals: a stadium loop (two straights + two semicircles,
//     possibly different radii each end, so a tri-oval reads as one).
//   - road / street / themed circuits: a closed loop whose radius is a
//     sum of harmonics around a circle, r(theta) = R * (1 + sum a_k
//     sin(k*theta + phase)). Modest amplitudes keep the loop smooth and
//     non-self-intersecting; different harmonics give each track its own
//     shape. The loop is then scaled so its length equals the track's
//     stated length in miles.
//
// Race distance rule: laps = round(distance / length), so a 500-mile
// race is 500 miles on every track. Default distance is 100; shorter
// distances (250 / 25 / 5) and the full 500 exist so a race fits a normal
// session — the distance picker is a choice, not a second race format.

export const MILES_TO_M = 1609.344;

export const RACE_DISTANCES = [500, 250, 100, 25, 5];
export const DEFAULT_DISTANCE_MILES = 100;

/** Laps for a track at a given race distance (miles). */
export function lapsForTrack(track, distanceMiles = DEFAULT_DISTANCE_MILES) {
  return Math.max(1, Math.round(distanceMiles / track.lengthMiles));
}

export const TRACKS = [
  // ---- Speedway ovals ----
  {
    id: 'olympus-superspeedway', name: 'Olympus Superspeedway', type: 'speedway',
    lengthMiles: 2.5, turns: 4, banking: '33-degree banking', surface: 'asphalt',
    widthM: 23, grip: 1.0, shape: { kind: 'oval', radiusA: 220, radiusB: 220 },
    theme: { sky: '#7db8e8', ground: '#3f7a3a', wall: '#e8e8e8' },
    blurb: 'The flagship — wide, fast, and banked for full-throttle racing.',
  },
  {
    id: 'nexus-tri-oval', name: 'Nexus Tri-Oval', type: 'speedway',
    lengthMiles: 1.5, turns: 4, banking: '24-degree banking', surface: 'asphalt',
    widthM: 23, grip: 1.0, shape: { kind: 'oval', radiusA: 160, radiusB: 120 },
    theme: { sky: '#8ec8f0', ground: '#4a8a44', wall: '#e8e8e8' },
    blurb: 'A tri-oval with a kinked front straight — three distinct corners.',
  },
  {
    id: 'golden-mile-oval', name: 'Golden Mile Oval', type: 'speedway',
    lengthMiles: 1.0, turns: 4, banking: '18-degree banking', surface: 'asphalt',
    widthM: 21, grip: 1.0, shape: { kind: 'oval', radiusA: 110, radiusB: 110 },
    theme: { sky: '#ffd98a', ground: '#5a8a3a', wall: '#f0d060' },
    blurb: 'A flat-out mile — short laps, bumper to bumper.',
  },
  {
    id: 'aether-ring', name: 'Aether Ring', type: 'speedway',
    lengthMiles: 2.0, turns: 4, banking: '28-degree banking, night lights', surface: 'asphalt',
    widthM: 23, grip: 1.0, shape: { kind: 'oval', radiusA: 190, radiusB: 190 },
    theme: { sky: '#1a2340', ground: '#2a4a2a', wall: '#c8d8ff' },
    blurb: 'Under the lights — the night race of the calendar.',
  },
  {
    id: 'titan-bowl', name: 'Titan Bowl', type: 'speedway',
    lengthMiles: 1.25, turns: 4, banking: '36-degree banking', surface: 'asphalt',
    widthM: 21, grip: 1.0, shape: { kind: 'oval', radiusA: 120, radiusB: 120 },
    theme: { sky: '#e8a860', ground: '#6a5a3a', wall: '#e8e8e8' },
    blurb: 'A steep little bowl — hold it flat and hang on.',
  },
  // ---- Road courses ----
  {
    id: 'redwater-ridge-road', name: 'Redwater Ridge Road', type: 'road',
    lengthMiles: 3.2, turns: 14, banking: 'rolling hills', surface: 'asphalt',
    widthM: 18, grip: 1.0, shape: { kind: 'circuit', harmonics: [[2, 0.18, 0], [3, 0.12, 1.2], [5, 0.08, 2.0]] },
    theme: { sky: '#9ec8e8', ground: '#4a6a3a', wall: '#d8d8d8' },
    blurb: 'Fourteen corners over the ridge — the thinking driver’s track.',
  },
  {
    id: 'hawkins-hills', name: 'Hawkins Hills', type: 'road',
    lengthMiles: 2.8, turns: 11, banking: 'elevation changes', surface: 'asphalt',
    widthM: 18, grip: 1.0, shape: { kind: 'circuit', harmonics: [[2, 0.22, 0.5], [4, 0.10, 0.3]] },
    theme: { sky: '#b8d8a8', ground: '#3a5a3a', wall: '#d8d8d8' },
    blurb: 'Blind crests and quick downhill turns through the hills.',
  },
  {
    id: 'olympus-grand-circuit', name: 'Olympus Grand Circuit', type: 'road',
    lengthMiles: 3.5, turns: 16, banking: 'varied', surface: 'asphalt',
    widthM: 18, grip: 1.0, shape: { kind: 'circuit', harmonics: [[3, 0.16, 0], [5, 0.10, 1.0], [7, 0.06, 2.2]] },
    theme: { sky: '#8ec8f0', ground: '#4a7a44', wall: '#e8e8e8' },
    blurb: 'The grand tour — sixteen corners, nothing repeated.',
  },
  {
    id: 'vinewood-valley-run', name: 'Vinewood Valley Run', type: 'road',
    lengthMiles: 2.2, turns: 9, banking: 'gentle sweepers', surface: 'asphalt',
    widthM: 18, grip: 1.0, shape: { kind: 'circuit', harmonics: [[2, 0.14, 1.0], [3, 0.10, 0.2]] },
    theme: { sky: '#c8e8a8', ground: '#5a7a3a', wall: '#d8d8d8' },
    blurb: 'Flowing sweepers down the valley — carry the speed.',
  },
  {
    id: 'storm-coast-road', name: 'Storm Coast Road', type: 'road',
    lengthMiles: 4.1, turns: 18, banking: 'coastal cliffs', surface: 'asphalt',
    widthM: 18, grip: 0.98, shape: { kind: 'circuit', harmonics: [[3, 0.20, 0.7], [4, 0.12, 1.9], [6, 0.07, 0.4]] },
    theme: { sky: '#7a9ab8', ground: '#3a5a4a', wall: '#c8d8d8' },
    blurb: 'Eighteen corners along the cliffs — the longest road course.',
  },
  {
    id: 'ember-canyon-course', name: 'Ember Canyon Course', type: 'road',
    lengthMiles: 3.0, turns: 12, banking: 'canyon walls', surface: 'asphalt',
    widthM: 18, grip: 1.0, shape: { kind: 'circuit', harmonics: [[2, 0.16, 0], [4, 0.14, 1.1]] },
    theme: { sky: '#e8a878', ground: '#7a4a2a', wall: '#d8b090' },
    blurb: 'Red rock walls on both sides — no room for mistakes.',
  },
  {
    id: 'atlas-mountain-pass', name: 'Atlas Mountain Pass', type: 'road',
    lengthMiles: 4.5, turns: 21, banking: 'hairpins', surface: 'asphalt',
    widthM: 17, grip: 0.97, shape: { kind: 'circuit', harmonics: [[3, 0.18, 1.5], [5, 0.12, 0.6], [7, 0.08, 1.3], [9, 0.05, 2.0]] },
    theme: { sky: '#a8c8e8', ground: '#5a6a5a', wall: '#d8d8d8' },
    blurb: 'Twenty-one corners up the mountain — the hardest lap here.',
  },
  // ---- Street circuits ----
  {
    id: 'nexus-city-streets', name: 'Nexus City Streets', type: 'street',
    lengthMiles: 2.0, turns: 14, banking: '90-degree city corners', surface: 'street',
    widthM: 15, grip: 0.95, shape: { kind: 'circuit', harmonics: [[4, 0.16, 0], [3, 0.10, 1.4]] },
    theme: { sky: '#8ab8e8', ground: '#4a4a52', wall: '#f0d060' },
    blurb: 'Walls on both sides through downtown Nexus.',
  },
  {
    id: 'olympus-harbour-front', name: 'Olympus Harbour Front', type: 'street',
    lengthMiles: 1.8, turns: 12, banking: 'harbour-side sweepers', surface: 'street',
    widthM: 15, grip: 0.95, shape: { kind: 'circuit', harmonics: [[2, 0.20, 0.9], [5, 0.09, 0.1]] },
    theme: { sky: '#9ec8e8', ground: '#3a4a5a', wall: '#e8e8e8' },
    blurb: 'Along the water — fast, then a wall at the end of it.',
  },
  {
    id: 'redwater-downtown', name: 'Redwater Downtown', type: 'street',
    lengthMiles: 1.5, turns: 10, banking: 'tight city grid', surface: 'street',
    widthM: 15, grip: 0.95, shape: { kind: 'circuit', harmonics: [[3, 0.14, 0.3], [4, 0.10, 2.1]] },
    theme: { sky: '#b8c8d8', ground: '#4a4a4a', wall: '#f0d060' },
    blurb: 'A tight grid of city blocks — brake late, thread it.',
  },
  {
    id: 'agora-plaza-circuit', name: 'Agora Plaza Circuit', type: 'street',
    lengthMiles: 1.2, turns: 8, banking: 'plaza hairpins', surface: 'street',
    widthM: 15, grip: 0.95, shape: { kind: 'circuit', harmonics: [[2, 0.12, 0], [4, 0.08, 0.8]] },
    theme: { sky: '#d8c8a8', ground: '#6a5a4a', wall: '#e8d8a8' },
    blurb: 'The shortest lap — eight corners around the plaza.',
  },
  // ---- Themed (Olympus worlds) ----
  {
    id: 'luge-ice-run', name: 'Luge Ice Run', type: 'themed',
    lengthMiles: 2.6, turns: 9, banking: 'ice — low grip', surface: 'ice',
    widthM: 21, grip: 0.7, shape: { kind: 'circuit', harmonics: [[3, 0.15, 1.2], [2, 0.10, 0.0]] },
    theme: { sky: '#cfe8f8', ground: '#d8ecf8', wall: '#a8d8f0' },
    blurb: 'The luge run, frozen over — grip is a rumour here.',
  },
  {
    id: 'earth-2-dino-valley', name: 'Earth 2 Dino Valley', type: 'themed',
    lengthMiles: 3.4, turns: 13, banking: 'valley floor', surface: 'asphalt',
    widthM: 18, grip: 1.0, shape: { kind: 'circuit', harmonics: [[2, 0.18, 0.4], [5, 0.11, 1.7]] },
    theme: { sky: '#f0a860', ground: '#7a6a3a', wall: '#d8b090' },
    blurb: 'Sunset over the valley — thirteen corners past the herds.',
  },
  {
    id: 'vortex-spiral', name: 'Vortex Spiral', type: 'themed',
    lengthMiles: 2.4, turns: 7, banking: 'spiralling descent', surface: 'asphalt',
    widthM: 18, grip: 1.0, shape: { kind: 'circuit', harmonics: [[2, 0.25, 0], [3, 0.12, 1.0]] },
    theme: { sky: '#6a4a9a', ground: '#3a2a5a', wall: '#b89ae8' },
    blurb: 'Seven corners winding down the vortex.',
  },
  {
    id: 'erebus-night-circuit', name: 'Erebus Night Circuit', type: 'themed',
    lengthMiles: 2.9, turns: 15, banking: 'night — headlights only', surface: 'asphalt',
    widthM: 18, grip: 0.98, shape: { kind: 'circuit', harmonics: [[4, 0.15, 1.0], [3, 0.11, 0.2], [6, 0.06, 1.8]] },
    theme: { sky: '#0a0a18', ground: '#1a1a2a', wall: '#8a7ae8' },
    blurb: 'Fifteen corners in the dark — the night shift.',
  },
];

const TRACK_BY_ID = new Map(TRACKS.map((t) => [t.id, t]));

/** Track record by id, or null. */
export function getTrack(id) {
  return typeof id === 'string' ? TRACK_BY_ID.get(id) || null : null;
}

/** All 20 tracks, in picker order. */
export function listTracks() {
  return TRACKS;
}

// ---------------------------------------------------------------------------
// Procedural centerline geometry.
// A centerline is a closed loop of N samples: x[], z[] (metres), cum[]
// (cumulative metres), totalM. s = metres along the loop from the
// start/finish line; sampleAt(s) interpolates position + tangent.
// ---------------------------------------------------------------------------

function halfEllipsePerimeter(rx, ry) {
  // Ramanujan's approximation for half an ellipse perimeter.
  const h = ((rx - ry) * (rx - ry)) / ((rx + ry) * (rx + ry));
  return (Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))) / 2;
}

function stadiumPoints(totalM, radiusA, radiusB, count) {
  // Two straights at z = +radiusA and z = -radiusB, joined by half-ellipse
  // end caps (a true circle when the radii match). Each cap is centred on
  // the straight's midpoint in z so the joins are tangent-continuous even
  // when the two ends have different radii (a tri-oval).
  const rxA = (radiusA + radiusB) / 2; const ryA = (radiusA + radiusB) / 2;
  const rxB = rxA; const ryB = ryA;
  const cyA = (radiusA - radiusB) / 2; const cyB = cyA;
  const turnA = halfEllipsePerimeter(rxA, ryA);
  const turnB = halfEllipsePerimeter(rxB, ryB);
  const straight = Math.max(40, (totalM - turnA - turnB) / 2);
  const total = 2 * straight + turnA + turnB;
  const pts = [];
  for (let i = 0; i < count; i++) {
    const d = (i / count) * total;
    let x; let z;
    if (d < straight) {
      // Front straight, heading +X at z = +radiusA.
      x = -straight / 2 + d; z = radiusA;
    } else if (d < straight + turnA) {
      // Right end cap: half-ellipse from +Z around +X to -Z.
      // Parameterise by arc fraction — even resampling fixes spacing later.
      const a = ((d - straight) / turnA) * Math.PI;
      x = straight / 2 + Math.sin(a) * rxA; z = cyA + Math.cos(a) * ryA;
    } else if (d < 2 * straight + turnA) {
      // Back straight, heading -X at z = -radiusB.
      const dd = d - straight - turnA;
      x = straight / 2 - dd; z = -radiusB;
    } else {
      // Left end cap: half-ellipse from -Z around -X to +Z.
      const a = ((d - 2 * straight - turnA) / turnB) * Math.PI;
      x = -straight / 2 - Math.sin(a) * rxB; z = cyB - Math.cos(a) * ryB;
    }
    pts.push([x, z]);
  }
  return pts;
}

function harmonicPoints(count, harmonics) {
  // Unit loop from the polar profile, then scaled to the target length.
  const raw = [];
  for (let i = 0; i < count; i++) {
    const th = (i / count) * Math.PI * 2;
    let r = 1;
    for (const [k, amp, phase] of harmonics) r += amp * Math.sin(k * th + phase);
    raw.push([Math.cos(th) * r, Math.sin(th) * r]);
  }
  return raw;
}

function polylineLength(pts) {
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]; const b = pts[(i + 1) % pts.length];
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return len;
}

/** Build the sampled centerline for a track. Pure — safe in node tests. */
export function buildCenterline(track, count = 400) {
  const targetM = track.lengthMiles * MILES_TO_M;
  let pts;
  if (track.shape.kind === 'oval') {
    pts = stadiumPoints(targetM, track.shape.radiusA, track.shape.radiusB, count);
  } else {
    const raw = harmonicPoints(count, track.shape.harmonics);
    const scale = targetM / polylineLength(raw);
    pts = raw.map(([x, z]) => [x * scale, z * scale]);
  }
  // Resample to even arc-length spacing so s maps linearly to the index.
  const resampled = resampleEven(pts, count);
  const xs = resampled.map((p) => p[0]);
  const zs = resampled.map((p) => p[1]);
  const cum = [0];
  for (let i = 1; i <= count; i++) {
    const a = resampled[i - 1]; const b = resampled[i % count];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const totalM = cum[count];
  return { xs, zs, cum, totalM, count };
}

function resampleEven(pts, count) {
  // Walk the polyline and drop a point every total/count metres.
  const total = polylineLength(pts);
  const step = total / count;
  const out = [pts[0]];
  let seg = 0; // current segment index
  let segPos = 0; // metres already walked into the current segment
  let need = step;
  while (out.length < count) {
    const a = pts[seg % pts.length]; const b = pts[(seg + 1) % pts.length];
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const remain = segLen - segPos;
    if (remain >= need) {
      const t = (segPos + need) / segLen;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      segPos += need;
      need = step;
    } else {
      need -= remain;
      seg = (seg + 1) % pts.length;
      segPos = 0;
      if (seg === 0 && out.length > 1) break; // wrapped — safety
    }
  }
  while (out.length < count) out.push(pts[out.length % pts.length]);
  return out.slice(0, count);
}

/** Position + tangent at arc-length s (metres, wraps). */
export function sampleAt(line, s) {
  const { xs, zs, cum, totalM, count } = line;
  let d = ((s % totalM) + totalM) % totalM;
  // Binary search the segment.
  let lo = 0; let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid + 1] <= d) lo = mid + 1; else hi = mid;
  }
  const i = Math.min(lo, count - 1);
  const segLen = cum[i + 1] - cum[i] || 1;
  const t = (d - cum[i]) / segLen;
  const x = xs[i] + (xs[(i + 1) % count] - xs[i]) * t;
  const z = zs[i] + (zs[(i + 1) % count] - zs[i]) * t;
  const tx = xs[(i + 1) % count] - xs[i];
  const tz = zs[(i + 1) % count] - zs[i];
  const tl = Math.hypot(tx, tz) || 1;
  return { x, z, tx: tx / tl, tz: tz / tl, angle: Math.atan2(tz, tx), index: i };
}

/** Signed lateral offset (metres) of point (x, z) from the centerline near s. */
export function lateralAt(line, s, x, z) {
  const p = sampleAt(line, s);
  const dx = x - p.x; const dz = z - p.z;
  // Left of the direction of travel is positive.
  return dx * -p.tz + dz * p.tx;
}
