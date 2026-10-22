// lib/earth/interiors.js — the Earth interiors SYSTEM (Merlin,
// 2026-10-22): every placed building construct gets a door ENTRY
// point, an interior volume, and interior lighting; big constructs
// included. Parametric, not bespoke: one spec generator covers
// every building/landmark class in the placement registry, one
// door rule opens every wall, one lift volume serves every
// multi-floor interior.
//
// Pure math + data — no THREE, no DOM (the THREE room factory is
// components/EarthInteriorRoom.js; the collision rule lives in
// lib/earth/collision.js and reads its door data from here). This
// module deliberately does NOT import collision.js (which imports
// this registry) — the haversine below mirrors collision.js's
// formula so the two never drift in value, only in location.
//
// Spaces, honestly stated (the diorama's standing convention):
// - Positions and radii live in collision.js's space: real metres
//   over lat/lon, haversine-measured — the same space the walker's
//   step and every existing collider already use.
// - The interior's RENDERED size comes from the display placement
//   (displayScaleFor): what you see is the capped display size.
// - Floor altitudes are DISPLAY metres — the same metre the climb
//   system (getClimbAltM) and swim lift speak, converted by callers
//   with DISPLAY_UNITS_PER_METRE.
//
// The never-pass-through law holds: an interior's wall band is
// solid everywhere except its door sector, which passes BOTH ways
// (the sector test is position-based, not direction-based), so
// walking in and back out can never trap the walker.
import { EARTH_ASSETS } from './assets.js';
import {
  anchorFromRegion,
  FARM_OFFSETS,
  displayScaleFor,
  seededRandom,
} from './placements.js';

const EARTH_RADIUS_M = 6371000;

/** Haversine distance in metres — mirrors lib/earth/collision.js. */
export function haversineM(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Local tangent-plane offsets in metres (east, north) of a point
 *  from an origin — equirectangular, exact enough at building
 *  scale (the whole registry spans < 1 km per construct). */
export function localOffsetsM(fromLat, fromLon, lat, lon) {
  const toRad = (d) => (d * Math.PI) / 180;
  return {
    eastM: toRad(lon - fromLon) * EARTH_RADIUS_M * Math.cos(toRad(fromLat)),
    northM: toRad(lat - fromLat) * EARTH_RADIUS_M,
  };
}

/** Inverse of localOffsetsM: the lat/lon at (eastM, northM) from an origin. */
export function latLonFromOffsets(fromLat, fromLon, eastM, northM) {
  const toDeg = (r) => (r * 180) / Math.PI;
  return {
    lat: fromLat + toDeg(northM / EARTH_RADIUS_M),
    lon: fromLon + toDeg(eastM / (EARTH_RADIUS_M * Math.cos((fromLat * Math.PI) / 180))),
  };
}

/** Compass bearing (0 = north, 90 = east) of an ENU offset. */
export function bearingDegOf(eastM, northM) {
  const deg = (Math.atan2(eastM, northM) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Smallest absolute difference between two compass bearings. */
export function angleDiffDeg(a, b) {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

// --- classes -------------------------------------------------------------------
// One row per construct class: floor policy, interior light, door
// width, whether windows glow. Open structures (windmill tower,
// water-tower tank) get a base room — a lattice tower has no
// enclosed volume to parametrize honestly, so its interior is the
// pump-house at its foot (noted in the build report).
const CLASS_SPECS = {
  house: { maxFloors: 1, lightColor: '#ffb46b', doorWidthM: 1.3, windows: true, label: 'House' },
  barn: { maxFloors: 1, lightColor: '#ffc98a', doorWidthM: 2.6, windows: false, label: 'Barn' },
  silo: { maxFloors: 1, lightColor: '#cfe4ff', doorWidthM: 1.2, windows: false, label: 'Grain silo' },
  windmill: { maxFloors: 1, lightColor: '#ffd9a0', doorWidthM: 1.2, windows: false, openStructure: true, label: 'Windmill pump-house' },
  lighthouse: { maxFloors: 6, lightColor: '#ffe9b8', doorWidthM: 1.3, windows: true, label: 'Lighthouse' },
  'water-tower': { maxFloors: 1, lightColor: '#ffd9a0', doorWidthM: 1.2, windows: false, openStructure: true, label: 'Water tower base' },
  'grain-elevator': { maxFloors: 6, lightColor: '#ffca7a', doorWidthM: 2.2, windows: false, label: 'Grain elevator' },
  'control-tower': { maxFloors: 8, lightColor: '#cfe8ff', doorWidthM: 1.4, windows: true, label: 'Control tower' },
  'dome-church': { maxFloors: 1, lightColor: '#ffe4a8', doorWidthM: 1.8, windows: true, label: 'Dome church' },
  landmark: { maxFloors: 16, lightColor: '#ffd98f', doorWidthM: 3.0, windows: true, label: 'Landmark' },
};

export function interiorClassFor(asset) {
  if (asset.category === 'landmark') return 'landmark';
  switch (asset.id) {
    case 'e023-prairie-farmhouse': return 'house';
    case 'e072-santorini-dome-church': return 'dome-church';
    case 'e021-red-gambrel-barn': return 'barn';
    case 'e022-grain-silo': return 'silo';
    case 'e024-farm-windmill': return 'windmill';
    case 'e065-lighthouse': return 'lighthouse';
    case 'e066-small-town-water-tower': return 'water-tower';
    case 'e064-prairie-grain-elevator': return 'grain-elevator';
    case 'e067-airport-control-tower': return 'control-tower';
    default: return 'house';
  }
}

/** Resolve a single-placement asset's lat/lon exactly as
 *  placementsFor() does: exact coordinates win; otherwise the
 *  region anchor plus the farmstead offset for its id. */
export function resolveSingleLatLon(asset) {
  const p = asset.placement || {};
  if (p.lat != null && p.lon != null) return { lat: p.lat, lon: p.lon };
  const anchor = anchorFromRegion(p.region);
  if (!anchor) return null;
  const off = FARM_OFFSETS[asset.id] || { dLat: 0, dLon: 0 };
  return { lat: anchor.lat + off.dLat, lon: anchor.lon + off.dLon };
}

const FLOOR_HEIGHT_TARGET_M = 3.4;

/** The full interior spec for one asset, or null when the asset is
 *  not an enterable construct (not a single-placement building or
 *  landmark, or no resolvable position). */
export function interiorSpecFor(asset) {
  if (!asset || !asset.placement || asset.placement.mode !== 'single') return null;
  if (asset.category !== 'building' && asset.category !== 'landmark') return null;
  const at = resolveSingleLatLon(asset);
  if (!at) return null;

  const cls = interiorClassFor(asset);
  const cs = CLASS_SPECS[cls];
  const disp = displayScaleFor(asset);
  const [nx, ny, nz] = asset.nativeSize || [1, 1, 1];
  const heightM = disp.heightM;
  const widthM = (nx / Math.max(ny, 1e-6)) * heightM;
  const depthM = (nz / Math.max(ny, 1e-6)) * heightM;
  const radiusM = Math.max((asset.scaleM || 2) / 2, 1.0); // == its collider radius
  const floors = Math.max(1, Math.min(cs.maxFloors, Math.round(heightM / FLOOR_HEIGHT_TARGET_M)));
  const floorHeightM = heightM / floors;
  const headingDeg = asset.placement.headingDeg ?? null;
  const doorBearingDeg = ((headingDeg ?? 180) + 360) % 360;
  const wallM = Math.min(2.5, radiusM * 0.5);

  const spec = {
    id: asset.id,
    name: asset.name || asset.id,
    category: asset.category,
    class: cls,
    classLabel: cs.label,
    lat: at.lat,
    lon: at.lon,
    headingDeg,
    doorBearingDeg,
    doorWidthM: cs.doorWidthM,
    wallM,
    radiusM,
    heightM,
    widthM,
    depthM,
    floors,
    floorHeightM,
    lightColor: cs.lightColor,
    windows: cs.windows,
    openStructure: !!cs.openStructure,
    // The lift volume (multi-floor interiors): a shaft at the
    // room's east side with an UP pad and a DOWN pad per floor.
    lift: floors > 1
      ? {
          eastM: radiusM * 0.45,
          northM: -radiusM * 0.45,
          padRadiusM: 1.5,
          padGapM: 3.2,
        }
      : null,
    aether: [],
  };

  // AETHER (deterministic): a fixed world seed per interior — the
  // same placements for every visitor, always INSIDE the room:
  // polar-bounded to the inner 45% of the radius, which stays
  // inside the collision free zone (radius minus the wall band)
  // even for the smallest interior. None outside, ever.
  const count = floors >= 6 ? 3 : floors >= 2 ? 2 : 1;
  const rand = seededRandom(asset.id + ':aether');
  for (let i = 0; i < count; i++) {
    const floor = Math.floor(rand() * floors);
    const ang = rand() * Math.PI * 2;
    const rr = radiusM * 0.45 * Math.sqrt(rand());
    const eastM = Math.cos(ang) * rr;
    const northM = Math.sin(ang) * rr;
    const ll = latLonFromOffsets(at.lat, at.lon, eastM, northM);
    spec.aether.push({
      id: `${asset.id}#aether-${i}`,
      interiorId: asset.id,
      floor,
      eastM,
      northM,
      lat: ll.lat,
      lon: ll.lon,
    });
  }
  return spec;
}

let _interiors = null;

/** Every enterable interior on Earth, registry order (asset order). */
export function buildInteriors() {
  const out = [];
  for (const asset of EARTH_ASSETS) {
    const spec = interiorSpecFor(asset);
    if (spec) out.push(spec);
  }
  return out;
}

export function getInteriors() {
  if (!_interiors) _interiors = buildInteriors();
  return _interiors;
}

export function interiorById(id) {
  return getInteriors().find((s) => s.id === id) || null;
}

/** Position facts about a point relative to an interior. */
export function interiorLocal(spec, lat, lon) {
  const { eastM, northM } = localOffsetsM(spec.lat, spec.lon, lat, lon);
  const d = haversineM(spec.lat, spec.lon, lat, lon);
  return { eastM, northM, d, bearingDeg: bearingDegOf(eastM, northM) };
}

/** The interior the point is INSIDE (within its wall radius), with
 *  its local frame — or null. Nearest wins on overlap. */
export function interiorAt(lat, lon) {
  let best = null;
  for (const spec of getInteriors()) {
    const local = interiorLocal(spec, lat, lon);
    if (local.d < spec.radiusM && (!best || local.d < best.local.d)) {
      best = { spec, local };
    }
  }
  return best;
}

/** The nearest interior and its local frame, inside or not (door
 *  approach checks). */
export function nearestInterior(lat, lon) {
  let best = null;
  for (const spec of getInteriors()) {
    const local = interiorLocal(spec, lat, lon);
    if (!best || local.d < best.local.d) best = { spec, local };
  }
  return best;
}

/** May a walker at this point pass through the interior's wall
 *  band? Only inside the door sector: the angular gate widens with
 *  door width + walker radius, so the corridor is at least
 *  doorWidth + 2×playerRadius wide AT the wall, for any radius. */
/** Angular half of the door test: true when the walker's bearing
 *  from the centre is within the door sector. The wall-band range
 *  half is applied by lib/earth/collision.js, which inlines the
 *  same math on ENU offsets. */
export function doorSectorOk(spec, lat, lon, playerRadiusM = 0.5) {
  const local = interiorLocal(spec, lat, lon);
  const halfAngleDeg = (Math.asin(Math.min(1,
    (spec.doorWidthM / 2 + playerRadiusM) / Math.max(local.d, 0.5))) * 180) / Math.PI;
  return angleDiffDeg(local.bearingDeg, spec.doorBearingDeg) <= halfAngleDeg;
}

/** Which lift pad (if any) a local position stands on: 'up' rides
 *  one floor up, 'down' one floor down, null off-pad. The pads sit
 *  padGapM apart along north from the shaft centre. */
export function liftPadAt(spec, eastM, northM) {
  if (!spec.lift) return null;
  const { eastM: lx, northM: lz, padRadiusM, padGapM } = spec.lift;
  if (Math.hypot(eastM - lx, northM - lz) <= padRadiusM) return 'up';
  if (Math.hypot(eastM - lx, northM - (lz + padGapM)) <= padRadiusM) return 'down';
  return null;
}

/** The altitude (display metres) of a floor index in an interior. */
export function floorAltM(spec, floor) {
  return Math.max(0, Math.min(spec.floors - 1, floor)) * spec.floorHeightM;
}

// --- live interior state ---------------------------------------------------------
// The interiors driver (components/EarthAssets.jsx) publishes the
// occupied interior + the walker's lift altitude here each frame;
// EarthWalker and the street camera read getInteriorAltM() exactly
// the way they read getClimbAltM() (lib/earth/parachute.js) — one
// altitude channel per system, summed by the rigs.
export const interiorState = {
  activeId: null,
  floor: 0,
  altM: 0,
};

export function getInteriorAltM() {
  return interiorState.altM;
}
