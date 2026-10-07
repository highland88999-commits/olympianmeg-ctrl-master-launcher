// lib/gta/subway.js — Rideable subway for Mega City GTA.
// Ports the classic Line One state machine (cruise/brake/dwell/depart +
// sliding doors) from the 2D scene into the 3D world. The line runs as a loop
// through the 3 stations in a bored tunnel below street level, per Merlin's
// spec: sliding doors, station stops, grade-separated underground line.
//
// Player flow (handled by the scene):
//   surface -> E at entrance -> platform -> E when train dwells -> riding
//   riding -> E during dwell -> platform -> E at stairs -> surface

export const SUBWAY = {
  cruiseV: 26,    // units per second
  accel: 16,
  brake: 22,
  dwell: 6,       // seconds the train stands with doors open
  doorTime: 0.8,  // door slide animation time
  tunnelY: -14,   // tunnel floor, well below street level
  lineName: 'LINE ONE',
};

export function createSubway(stations) {
  // stations: [{ id, name, x, z }]
  const segLen = [];
  let total = 0;
  for (let i = 0; i < stations.length; i++) {
    const a = stations[i];
    const b = stations[(i + 1) % stations.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    segLen.push(len);
    total += len;
  }
  return {
    stations,
    segLen,
    total,
    s: 0,            // distance along the loop
    v: SUBWAY.cruiseV,
    mode: 'cruise',   // cruise | brake | dwell | depart
    station: -1,      // station index while braking/dwelling
    dwellT: 0,
    door: 0,          // 0..1 sliding-door openness
  };
}

// Ahead-distance along the loop (handles wrap-around).
function aheadDist(from, to, total) {
  return (((to - from) % total) + total) % total;
}

// Loop-coordinate of station i.
export function stationS(sub, i) {
  let s = 0;
  for (let k = 0; k < i; k++) s += sub.segLen[k];
  return s;
}

export function nextStationIdx(sub) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < sub.stations.length; i++) {
    const d = aheadDist(sub.s, stationS(sub, i), sub.total);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

export function brakeDistance(v) {
  return (v * v) / (2 * SUBWAY.brake);
}

// Door openness 0..1 across the dwell window: slide open, hold, slide shut.
export function doorOpen(dwellT) {
  const { dwell, doorTime } = SUBWAY;
  if (dwellT < 0) return 0;
  if (dwellT < doorTime) return dwellT / doorTime;
  if (dwellT > dwell - doorTime) return Math.max(0, (dwell - dwellT) / doorTime);
  return 1;
}

// Advance the train one tick. Mutates and returns `sub`.
export function updateSubway(sub, dt) {
  const S = SUBWAY;
  if (sub.mode === 'cruise' || sub.mode === 'depart') {
    sub.v = Math.min(S.cruiseV, sub.v + S.accel * dt);
    sub.s = (sub.s + sub.v * dt) % sub.total;
    const si = nextStationIdx(sub);
    const dist = aheadDist(sub.s, stationS(sub, si), sub.total);
    if (dist <= brakeDistance(sub.v) + 1.5) {
      sub.mode = 'brake';
      sub.station = si;
    } else if (sub.mode === 'depart' && sub.v >= S.cruiseV) {
      sub.mode = 'cruise';
    }
  } else if (sub.mode === 'brake') {
    sub.v = Math.max(0, sub.v - S.brake * dt);
    sub.s = (sub.s + sub.v * dt) % sub.total;
    const sx = stationS(sub, sub.station);
    const dist = aheadDist(sub.s, sx, sub.total);
    if (sub.v === 0 || dist < 1 || dist > sub.total - 2) {
      // Arrived: snap to the platform mark, open the doors.
      sub.s = sx;
      sub.v = 0;
      sub.mode = 'dwell';
      sub.dwellT = 0;
    }
  } else if (sub.mode === 'dwell') {
    sub.dwellT += dt;
    sub.door = doorOpen(sub.dwellT);
    if (sub.dwellT >= S.dwell) {
      sub.mode = 'depart';
      sub.door = 0;
    }
  }
  return sub;
}

// World position + heading of the train nose. Writes into `out`.
export function subwayPos(sub, out) {
  out = out || {};
  let s = sub.s;
  for (let i = 0; i < sub.segLen.length; i++) {
    if (s <= sub.segLen[i] || i === sub.segLen.length - 1) {
      const a = sub.stations[i];
      const b = sub.stations[(i + 1) % sub.stations.length];
      const t = sub.segLen[i] > 0 ? Math.min(1, Math.max(0, s / sub.segLen[i])) : 0;
      out.x = a.x + (b.x - a.x) * t;
      out.z = a.z + (b.z - a.z) * t;
      out.heading = Math.atan2(b.x - a.x, b.z - a.z);
      out.seg = i;
      return out;
    }
    s -= sub.segLen[i];
  }
  return out;
}

// Display info for the riding overlay.
export function subwayStatus(sub) {
  if (sub.mode === 'dwell' || sub.mode === 'brake') {
    return {
      atStation: sub.stations[sub.station] || null,
      nextStop: sub.stations[sub.station] || null,
      mode: sub.mode,
      door: sub.door,
    };
  }
  const ni = nextStationIdx(sub);
  return {
    atStation: null,
    nextStop: sub.stations[ni] || null,
    mode: sub.mode,
    door: 0,
  };
}

// Nearest station entrance to a surface point. Returns { station, index, dist }.
export function nearestStationEntrance(x, z, stations) {
  let best = null;
  let bestD = Infinity;
  let bestI = -1;
  stations.forEach((st, i) => {
    const d = Math.hypot(x - st.x, z - st.z);
    if (d < bestD) { bestD = d; best = st; bestI = i; }
  });
  return { station: best, index: bestI, dist: bestD };
}
