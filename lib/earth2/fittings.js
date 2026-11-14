// lib/earth2/fittings.js — Earth 2 building fittings (Merlin, Nov 13):
// the 16 landmark ladders/elevators, the 19 scattered building
// interiors, and the 3 interiors reserved as sun-base options.
//
// WHY THIS EXISTS: the audit found 91 staged entries with no render
// path. Their staged placements are NOT co-located with their
// buildings — the placement law gives every entry its own parcel,
// so an interior-room entry for the Eiffel Tower sits ~200 m from
// the Eiffel Tower GLB. Merlin's order anchors the fittings to the
// BUILDINGS ("when a user enters a building, that interior is what
// they see"; ladders/elevators "at their landmark buildings"), so
// this module resolves each fitting to its building's :single: GLB
// placement (parcel, x/z, heading, realm scale) and builds the spec
// from that anchor. The parametric entries' own parcels are unused.
//
// Pure math + data — no THREE, no DOM — so the scene stays thin
// and the law stays testable (tests/earth2-fittings.test.mjs).
import { stagedPlacements, stagedColliders } from './staged-objects.js';
import { parcelWorldRect, WORLD_CELL_M, WALKER_RADIUS_M } from './world.js';

// --- interior classes -------------------------------------------------
// Mirrors lib/earth/interiors.js CLASS_SPECS (the source of truth
// for Earth 1 interiors): floor policy, interior light, door width,
// whether windows glow. Open structures get a base room — a lattice
// tower has no enclosed volume to parametrize honestly.
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

// Mirrors lib/earth/interiors.js interiorClassFor.
export function interiorClassFor(assetId, category) {
  if (category === 'landmark') return 'landmark';
  switch (assetId) {
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

const FLOOR_HEIGHT_TARGET_M = 3.4;

// --- the 22 interiors ---------------------------------------------------
// All 22 staged interior-room assetIds, in staged order. The three
// marked reserved are the sun-base options (below) — they are NOT
// scattered into Earth 2 buildings.
const INTERIOR_ASSET_IDS = [
  'e021-red-gambrel-barn',
  'e022-grain-silo',
  'e023-prairie-farmhouse',
  'e024-farm-windmill',
  'e049-eiffel-tower',
  'e050-statue-of-liberty',
  'e051-big-ben',
  'e052-sydney-opera-house',
  'e053-cn-tower',
  'e054-great-pyramid',
  'e055-colosseum',
  'e057-taj-mahal',
  'e058-christ-the-redeemer',
  'e060-burj-khalifa',
  'e061-space-needle',
  'e062-st-basils',
  'e063-sagrada-familia',
  'e064-prairie-grain-elevator',
  'e065-lighthouse',
  'e066-small-town-water-tower',
  'e067-airport-control-tower',
  'e072-santorini-dome-church',
];

/** SUN-BASE RESERVATION (Merlin, Nov 13): the 3 most generic/livable
 *  interiors, held back as options for a sun base (one base per user
 *  inside the sun) — NOT scattered into Earth 2 buildings. The
 *  farmhouse is the most livable (a house), the barn the biggest
 *  open room, the windmill the roomy open structure. Landmarks are
 *  NOT generic — they are iconic monuments, wrong for a personal
 *  base. The sun-base builder reads this list when it offers the
 *  choice; the scene must never place these three. */
export const RESERVED_SUN_BASE_INTERIORS = [
  { assetId: 'e023-prairie-farmhouse', class: 'house', why: 'most livable — a house' },
  { assetId: 'e021-red-gambrel-barn', class: 'barn', why: 'biggest open room' },
  { assetId: 'e024-farm-windmill', class: 'windmill', why: 'roomy open structure' },
];

const RESERVED_ASSET_IDS = new Set(RESERVED_SUN_BASE_INTERIORS.map((r) => r.assetId));

/** True when the assetId's interior is reserved for sun bases. */
export function isSunBaseReserved(assetId) {
  return RESERVED_ASSET_IDS.has(assetId);
}

// --- building anchors ---------------------------------------------------
// The :single: GLB placement of an assetId — the building the
// fittings anchor to. Farm buildings also have a :farm-clone: GLB;
// the :single: is the canonical one.
export function buildingAnchor(assetId) {
  const p = stagedPlacements().find(
    (q) => q.assetId === assetId && q.key.endsWith(':single:0000') && q.sourceFile && q.sourceFile.startsWith('http'),
  );
  if (!p) return null;
  const parcel = { col: p.parcelIndex % 50, row: Math.floor(p.parcelIndex / 50) };
  const rect = parcelWorldRect(parcel);
  return {
    key: p.key,
    assetId: p.assetId,
    name: p.name,
    category: p.category,
    parcelIndex: p.parcelIndex,
    parcelId: p.parcelId,
    x: rect.minX + p.jx * WORLD_CELL_M,
    z: rect.minZ + p.jz * WORLD_CELL_M,
    headingDeg: p.headingDeg,
    scaleM: p.scaleM,
  };
}

/** Compass bearing (0 = north, 90 = east) of a world direction.
 *  Earth 2's flat north is -Z, east is +X — the same convention
 *  the walker's yaw uses (yaw 0 faces -Z). */
export function bearingDegOf(dx, dz) {
  const deg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Smallest absolute difference between two compass bearings. */
export function angleDiffDeg(a, b) {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** The world direction a building's heading points: the GLB clone
 *  rotates by rotation.y = headingDeg, so its local +Z (and the
 *  room's door face) points along (sin h, cos h) in (x, z). */
export function headingDirection(headingDeg) {
  const r = (headingDeg * Math.PI) / 180;
  return { x: Math.sin(r), z: Math.cos(r) };
}

/** The door bearing of a building: the compass bearing of its
 *  heading direction. The room's door, the collider's door sector
 *  and the ladder/elevator side all read this one bearing. */
export function doorBearingDeg(headingDeg) {
  const d = headingDirection(headingDeg);
  return bearingDegOf(d.x, d.z);
}

// --- interior specs -------------------------------------------------------
/** The full interior spec for one building anchor — the Earth 2
 *  port of lib/earth/interiors.js interiorSpecFor. The room is a
 *  square of the building's realm footprint (widthM = depthM =
 *  scaleM), its height is the building's realm scale, floors follow
 *  the 3.4 m target. aether is always [] — Earth 2's 53 shards are
 *  separate staged placements, never inside rooms. */
export function interiorSpecForAnchor(anchor) {
  const cls = interiorClassFor(anchor.assetId, anchor.category);
  const cs = CLASS_SPECS[cls];
  const radiusM = Math.max(anchor.scaleM / 2, 1.0); // == its collider radius
  const heightM = anchor.scaleM;
  const floors = Math.max(1, Math.min(cs.maxFloors, Math.round(heightM / FLOOR_HEIGHT_TARGET_M)));
  const floorHeightM = heightM / floors;
  const wallM = Math.min(2.5, radiusM * 0.5);
  return {
    assetId: anchor.assetId,
    name: anchor.name,
    category: anchor.category,
    class: cls,
    classLabel: cs.label,
    buildingKey: anchor.key,
    parcelId: anchor.parcelId,
    x: anchor.x,
    z: anchor.z,
    headingDeg: anchor.headingDeg,
    doorBearingDeg: doorBearingDeg(anchor.headingDeg),
    doorWidthM: cs.doorWidthM,
    wallM,
    radiusM,
    heightM,
    widthM: anchor.scaleM,
    depthM: anchor.scaleM,
    floors,
    floorHeightM,
    lightColor: cs.lightColor,
    windows: cs.windows,
    openStructure: !!cs.openStructure,
    lift: floors > 1
      ? { eastM: radiusM * 0.45, northM: -radiusM * 0.45, padRadiusM: 1.5, padGapM: 3.2 }
      : null,
    aether: [],
  };
}

/** The 19 interiors scattered into Earth 2 buildings — every staged
 *  interior except the 3 sun-base reservations. Each resolves to its
 *  building's :single: GLB anchor; a spec with no anchor is returned
 *  with anchorMissing: true so the scene can say so honestly instead
 *  of forcing it. */
export function interiorSpecs() {
  const out = [];
  for (const assetId of INTERIOR_ASSET_IDS) {
    if (isSunBaseReserved(assetId)) continue;
    const anchor = buildingAnchor(assetId);
    if (!anchor) {
      out.push({ assetId, anchorMissing: true });
      continue;
    }
    out.push(interiorSpecForAnchor(anchor));
  }
  return out;
}

/** The altitude of a floor index in an interior (port of
 *  lib/earth/interiors.js floorAltM). */
export function floorAltM(spec, floor) {
  return Math.max(0, Math.min(spec.floors - 1, floor)) * spec.floorHeightM;
}

/** May a walker at (x, z) pass through this interior's wall band?
 *  Port of lib/earth/interiors.js doorSectorOk: only inside the
 *  door sector — the angular gate widens with door width + walker
 *  radius, so the corridor is at least doorWidth + 2×playerRadius
 *  wide AT the wall, for any radius. */
export function doorSectorOk(spec, x, z, playerRadiusM = WALKER_RADIUS_M) {
  const dx = x - spec.x;
  const dz = z - spec.z;
  const d = Math.hypot(dx, dz);
  const halfAngleDeg = (Math.asin(Math.min(1,
    (spec.doorWidthM / 2 + playerRadiusM) / Math.max(d, 0.5))) * 180) / Math.PI;
  return angleDiffDeg(bearingDegOf(dx, dz), spec.doorBearingDeg) <= halfAngleDeg;
}

// --- ladders / elevators ----------------------------------------------------
// The 16 staged ladder/elevator assetIds. The 13 landmarks get a
// MonumentElevator-style glass platform (ride to the interior's top
// floor); the 3 small structures get an EarthLadders-style ladder
// (rails + rungs, climb to the top of the structure).
const LADDER_ASSET_IDS = [
  'e049-eiffel-tower',
  'e050-statue-of-liberty',
  'e051-big-ben',
  'e052-sydney-opera-house',
  'e053-cn-tower',
  'e054-great-pyramid',
  'e055-colosseum',
  'e057-taj-mahal',
  'e058-christ-the-redeemer',
  'e060-burj-khalifa',
  'e061-space-needle',
  'e062-st-basils',
  'e063-sagrada-familia',
  'e065-lighthouse',
  'e070-totem-pole',
  'e072-santorini-dome-church',
];

const ELEVATOR_ASSET_IDS = new Set([
  'e049-eiffel-tower', 'e050-statue-of-liberty', 'e051-big-ben',
  'e052-sydney-opera-house', 'e053-cn-tower', 'e054-great-pyramid',
  'e055-colosseum', 'e057-taj-mahal', 'e058-christ-the-redeemer',
  'e060-burj-khalifa', 'e061-space-needle', 'e062-st-basils',
  'e063-sagrada-familia',
]);

/** The climb height of a fitting: elevators ride to their
 *  building's interior top floor; ladders climb to the top of the
 *  structure itself (its realm scale). */
export function climbHeightM(assetId, anchor) {
  if (ELEVATOR_ASSET_IDS.has(assetId)) {
    const spec = interiorSpecForAnchor(anchor);
    return floorAltM(spec, spec.floors - 1);
  }
  return anchor.scaleM;
}

/** The 16 ladder/elevator specs, each anchored to its building's
 *  :single: GLB. The fitting stands at the building's side — offset
 *  (radius + 1.5 m) from the centre, 90° off the door bearing so it
 *  never blocks the door. A spec with no anchor is returned with
 *  anchorMissing: true. */
export function ladderSpecs() {
  const out = [];
  for (const assetId of LADDER_ASSET_IDS) {
    const anchor = buildingAnchor(assetId);
    if (!anchor) {
      out.push({ assetId, anchorMissing: true });
      continue;
    }
    const kind = ELEVATOR_ASSET_IDS.has(assetId) ? 'elevator' : 'ladder';
    // Side offset: 90° clockwise from the door bearing (the door
    // stays clear). x = sin/cos of the side bearing.
    const sideBearing = (doorBearingDeg(anchor.headingDeg) + 90) % 360;
    const sr = (sideBearing * Math.PI) / 180;
    const off = anchor.scaleM / 2 + 1.5;
    // Outward unit vector (building centre -> fitting), for the
    // mesh orientation: local +Z faces outward.
    const outX = Math.sin(sr);
    const outZ = -Math.cos(sr);
    out.push({
      assetId,
      kind,
      name: anchor.name,
      category: anchor.category,
      buildingKey: anchor.key,
      parcelId: anchor.parcelId,
      // The fitting's own position (building side).
      x: anchor.x + outX * off,
      z: anchor.z + outZ * off,
      outX,
      outZ,
      // The building centre + radius, for the ride anchor.
      buildingX: anchor.x,
      buildingZ: anchor.z,
      radiusM: anchor.scaleM / 2,
      headingDeg: anchor.headingDeg,
      doorBearingDeg: doorBearingDeg(anchor.headingDeg),
      heightM: climbHeightM(assetId, anchor),
    });
  }
  return out;
}

// --- colliders with doors ---------------------------------------------------
// stagedColliders() returns one circle per placement, in placement
// order. This zips the 19 interior buildings' door data onto their
// circles so the walker can pass the wall band through the door
// (lib/earth2/world.js pushOutOfCircles reads c.door). Every other
// collider is returned untouched — the solid law is unchanged for
// buildings without interiors.
export function stagedCollidersWithDoors() {
  const colliders = stagedColliders();
  const placements = stagedPlacements();
  const doorByKey = new Map();
  for (const spec of interiorSpecs()) {
    if (spec.anchorMissing) continue;
    doorByKey.set(spec.buildingKey, {
      bearingDeg: spec.doorBearingDeg,
      doorWidthM: spec.doorWidthM,
      wallM: spec.wallM,
    });
  }
  // Colliders are parallel to placements (same order, one each).
  // The door zip runs FIRST so the index mapping stays exact,
  // then the walk-through filter drops trees/rocks below. Each
  // collider also carries its placement's load URL (url): a
  // staged object whose GLB fails to load never renders, so its
  // solid circle would be an INVISIBLE wall — the scene drops
  // colliders whose url is in the load-failure registry (Merlin,
  // 2026-11-14: "like you hit invisible barriers"). Procedural
  // fittings carry no url — they are built, never loaded, so
  // they always render and always collide.
  const withDoors = colliders.map((c, i) => {
    const p = placements[i];
    const door = doorByKey.get(p?.key);
    const url = p && typeof p.sourceFile === 'string' && p.sourceFile.startsWith('http')
      ? p.sourceFile : undefined;
    const out = door ? { ...c, door } : { ...c };
    if (url) out.url = url;
    return out;
  });
  // WALK-THROUGH TREES & ROCKS (Merlin, 2026-11-13 — reverses
  // the 2026-11-03 solid law for Earth 2 only): staged
  // vegetation (trees/shrubs) and terrain (rock formations)
  // carry NO collider — users walk through them. Buildings,
  // landmarks and props stay solid, and door-bearing buildings
  // keep their door sectors (a door is never vegetation or
  // terrain, so the filter cannot eat one).
  return withDoors.filter((c, i) => {
    const cat = placements[i]?.category;
    return cat !== 'vegetation' && cat !== 'terrain';
  });
}

/** The set of object kinds in Earth 2 that must be grappleable:
 *  every solid kind, including the new fittings. Shards are the
 *  only whole-kind exception (collectibles — collected by walking
 *  through). Ground foliage is the one partial exception: short
 *  plants carry userData.grappleSkip at build time (see
 *  isGrappleSkippedFoliage in lib/earth2/grapple.js), so the hook
 *  flies past their leaves — tall trees keep their trunks
 *  grappleable. The scene's hook raycasts the whole scene and
 *  skips only userData.grappleSkip, so coverage is a property of
 *  the meshes the factories build (see lib/earth2/interior-room.js). */
export const GRAPPLEABLE_KINDS = [
  'terrain', 'building', 'landmark', 'bridge', 'prop', 'vegetation',
  'terrain-feature', 'dinosaur', 'vehicle', 'structure',
  'interior-room', 'ladder', 'elevator',
];
