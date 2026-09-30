// lib/argo-street.js — Street-level Earth math for ARGO.
//
// Pure logic: no DOM, no THREE imports, fully headless-testable.
//
// The orbit globe lives in "hub space" (55-unit globe). The street scene
// lives in real meters in a local ENU frame (x = east, y = up, z = south)
// centered on the destination. Google's 3D tiles are ECEF meters, so the
// street renderer maps ECEF -> ENU -> three.js with one 4x4 matrix.

export const WGS84_A = 6378137;
export const WGS84_F = 1 / 298.257223563;
export const WGS84_E2 = 2 * WGS84_F - WGS84_F * WGS84_F;

export const STREET_HOVER_M = 2.2; // bike hover above terrain
export const STREET_WALK_EYE_M = 1.7;
export const STREET_GOLD_PER_BAR = 1000; // liquid gold per collected bar
export const GOLD_LEDGER_KEY = 'nexus_gold_liquid';

export function deg2rad(d) {
  return (d * Math.PI) / 180;
}

// WGS84 geodetic (degrees, meters) -> ECEF meters. Plain {x, y, z}.
export function wgs84ToEcef(latDeg, lonDeg, hMeters = 0) {
  const phi = deg2rad(latDeg);
  const lam = deg2rad(lonDeg);
  const s = Math.sin(phi);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * s * s);
  const cphi = Math.cos(phi);
  return {
    x: (N + hMeters) * cphi * Math.cos(lam),
    y: (N + hMeters) * cphi * Math.sin(lam),
    z: ((1 - WGS84_E2) * N + hMeters) * s,
  };
}

// 4x4 matrix (row-major, 16 numbers) mapping ECEF meters -> street frame
// meters: three.x = east, three.y = up, three.z = south (-north).
// Feed straight into THREE.Matrix4().set(...m) with matrixAutoUpdate off.
export function ecefToStreetMatrix(latDeg, lonDeg, hMeters = 0) {
  const phi = deg2rad(latDeg);
  const lam = deg2rad(lonDeg);
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  const sl = Math.sin(lam);
  const cl = Math.cos(lam);
  const p0 = wgs84ToEcef(latDeg, lonDeg, hMeters);

  // three.x = east  = -sl*(x-x0) + cl*(y-y0)
  // three.y = up    = cp*cl*(x-x0) + cp*sl*(y-y0) + sp*(z-z0)
  // three.z = south = sp*cl*(x-x0) + sp*sl*(y-y0) - cp*(z-z0)
  const rows = [
    [-sl, cl, 0],
    [cp * cl, cp * sl, sp],
    [sp * cl, sp * sl, -cp],
  ];
  const m = [];
  for (let r = 0; r < 3; r++) {
    const [a, b, c] = rows[r];
    m.push(a, b, c, -(a * p0.x + b * p0.y + c * p0.z));
  }
  m.push(0, 0, 0, 1);
  return m;
}

// Apply a row-major 4x4 matrix to a point. Plain in/out.
export function applyMatrix4(m, p) {
  return {
    x: m[0] * p.x + m[1] * p.y + m[2] * p.z + m[3],
    y: m[4] * p.x + m[5] * p.y + m[6] * p.z + m[7],
    z: m[8] * p.x + m[9] * p.y + m[10] * p.z + m[11],
  };
}

// --- Deterministic placement -----------------------------------------------

// FNV-1a string hash -> uint32.
export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Mulberry32 seeded PRNG.
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

// Deterministic street layout for a destination key. Positions are in street
// meters: x = east, z = south. y is resolved at runtime via terrain raycast
// (falls back to 0 = ellipsoid surface).
// - 12 billboards: ring 60–170m, facing the center.
// - 3 portals: 25–50m out.
// - 8 gold bars: 30–210m; the last is "tucked" behind a billboard.
export function streetLayout(destKey) {
  const rand = mulberry32(hashStr(`argo-street:${destKey}`));
  const billboards = [];
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const r = 60 + rand() * 110;
    billboards.push({
      slot: i,
      x: Math.cos(ang) * r,
      z: Math.sin(ang) * r,
      faceAngle: Math.atan2(-Math.cos(ang), -Math.sin(ang)), // face center
    });
  }
  const portalRoutes = [
    { route: '/nova', name: 'NOVA' },
    { route: '/myriad', name: 'MYRIAD' },
    { route: '/erebus', name: 'EREBUS' },
  ];
  const portals = portalRoutes.map((p, i) => {
    const ang = (i / 3) * Math.PI * 2 + 0.5 + (rand() - 0.5) * 0.4;
    const r = 25 + rand() * 25;
    return { ...p, x: Math.cos(ang) * r, z: Math.sin(ang) * r };
  });
  const goldBars = [];
  for (let i = 0; i < 8; i++) {
    const ang = rand() * Math.PI * 2;
    const r = 30 + rand() * 180;
    goldBars.push({ id: `${destKey}:gold:${i}`, x: Math.cos(ang) * r, z: Math.sin(ang) * r, tucked: i === 7 });
  }
  // Tuck the last bar behind billboard 0 (slightly hidden, medium difficulty).
  const b0 = billboards[0];
  goldBars[7].x = b0.x * 1.12;
  goldBars[7].z = b0.z * 1.12;
  return { billboards, portals, goldBars };
}

// --- Gold ledger (local, per-user) ------------------------------------------
// 1,000 liquid gold = 1 gold bar (Merlin's v2 model). Server ledger ships
// with the final consolidated SQL; until then street finds credit locally.

function storage() {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function getLiquidGold() {
  const s = storage();
  if (!s) return 0;
  const v = Number(s.getItem(GOLD_LEDGER_KEY));
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

export function addLiquidGold(amount) {
  const s = storage();
  const total = getLiquidGold() + Math.max(0, Math.floor(amount));
  try {
    s && s.setItem(GOLD_LEDGER_KEY, String(total));
  } catch {
    /* private mode: credit is session-only */
  }
  return total;
}

// Per-destination collected bar ids, so finds persist across visits.
export function collectedBarIds(destKey) {
  const s = storage();
  if (!s) return new Set();
  try {
    const raw = s.getItem(`argo_street_gold:${destKey}`);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function markBarCollected(destKey, barId) {
  const s = storage();
  if (!s) return;
  try {
    const ids = collectedBarIds(destKey);
    ids.add(barId);
    s.setItem(`argo_street_gold:${destKey}`, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}
