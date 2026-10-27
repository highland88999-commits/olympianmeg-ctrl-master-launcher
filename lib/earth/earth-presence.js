// lib/earth/earth-presence.js — Earth 1 position encoding for
// the shared presence client (lib/presence.js).
//
// Earth street state is lat/lon + yaw (roamState, carState),
// while presence rows carry a generic pos {x, y, z}. The
// encoding is fixed here, in one place, so the sender and the
// renderer can never drift apart:
//
//   x = latitude in degrees  (-90..90)
//   y = longitude in degrees (-180..180)
//   z = yaw in degrees       (0..360)
//
// A peer's lat/lon decodes back through the SAME globe placement
// EarthWalker/EarthSupercar use (latLonToVec3 + tangentFrame),
// so a peer stands on the same ground the local traveler sees —
// including the street-patch facet max (never buried).
//
// Nearby-only rule (phone frame rates): only the ~6 nearest
// peers within ~200 m render. At 2.5 s update cadence a peer
// would otherwise jump between fixes — worse for a driving
// peer, whose fixes are ~200 m apart at boost — so the renderer
// lerps each peer's lat/lon/yaw toward its latest fix every
// frame (lib/earth/earth-presence.js owns the math; the
// component owns the clock).

export const EARTH_PRESENCE_SECTOR = 'argo:earth';
export const EARTH_PEER_MAX_DISTANCE_M = 200;
export const EARTH_PEER_MAX_RENDER = 6;

export function encodeEarthPos(lat, lon, yawDeg) {
  const la = Number(lat);
  const lo = Number(lon);
  const yw = Number(yawDeg);
  return {
    x: Number.isFinite(la) ? Math.max(-90, Math.min(90, la)) : 0,
    y: Number.isFinite(lo) ? ((lo + 540) % 360) - 180 : 0,
    z: Number.isFinite(yw) ? ((yw % 360) + 360) % 360 : 0,
  };
}

export function decodeEarthPos(pos) {
  if (!pos || typeof pos !== 'object') return null;
  const lat = Number(pos.x);
  const lon = Number(pos.y);
  const yawDeg = Number(pos.z);
  if (![lat, lon, yawDeg].every(Number.isFinite)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon, yawDeg };
}

/** Great-circle distance in metres (haversine, mean radius). */
export function earthDistanceM(aLat, aLon, bLat, bLon) {
  const R = 6371000;
  const p1 = (aLat * Math.PI) / 180;
  const p2 = (bLat * Math.PI) / 180;
  const dp = ((bLat - aLat) * Math.PI) / 180;
  const dl = ((bLon - aLon) * Math.PI) / 180;
  const h = Math.sin(dp / 2) * Math.sin(dp / 2)
    + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Nearby-only filter: peers within maxDistanceM of the local
 *  traveler, nearest first, capped at maxRender. Peers without
 *  a decodable position never render (no guessing). */
export function nearbyPeers(peers, lat, lon, maxDistanceM = EARTH_PEER_MAX_DISTANCE_M, maxRender = EARTH_PEER_MAX_RENDER) {
  const out = [];
  for (const peer of peers || []) {
    const at = decodeEarthPos(peer.pos);
    if (!at) continue;
    const d = earthDistanceM(lat, lon, at.lat, at.lon);
    if (d <= maxDistanceM) out.push({ peer, at, distanceM: d });
  }
  out.sort((a, b) => a.distanceM - b.distanceM);
  return out.slice(0, maxRender);
}

/** Per-frame lerp toward the latest fix. Positions lerp in
 *  lat/lon space (fine under 200 m — the arc is ~flat there);
 *  yaw lerps along the SHORT arc so a peer never spins the
 *  long way around when crossing 0°/360°. Factor is frame-rate
 *  independent: k = 1 - exp(-rate * dt). */
export function lerpEarthPos(from, to, dt, rate = 4) {
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  let dyaw = ((to.yawDeg - from.yawDeg + 540) % 360) - 180;
  return {
    lat: from.lat + (to.lat - from.lat) * k,
    lon: from.lon + (to.lon - from.lon) * k,
    yawDeg: ((from.yawDeg + dyaw * k) % 360 + 360) % 360,
  };
}
