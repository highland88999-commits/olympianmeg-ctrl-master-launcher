// Earth Interiors + construct animation (Merlin, 2026-10-22 —
// Planet Program Part 4):
//  - windmills / turbines / pumpjacks animate (vertex-level — the
//    Tripo GLBs are single fused meshes; detectors + driver pins).
//  - EVERY building/construct class resolves a door + parametric
//    interior; buildings stay solid except the door sector.
//  - aether pickups: deterministic, inside buildings ONLY.
//  - door entry/exit round-trip at unit level (fair walks through
//    moveWithCollision — destinations derive from the walker's
//    actual position, small steps, like the real roam loop).
//  - quantum is GONE (Part 1's rule replaced 2026-10-26: the
//    realm was removed completely, not flagged off).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { EARTH_ASSETS } from '../lib/earth/assets.js';
import {
  getInteriors,
  interiorById,
  interiorAt,
  doorSectorOk,
  liftPadAt,
  floorAltM,
  latLonFromOffsets,
} from '../lib/earth/interiors.js';
import { buildColliders, moveWithCollision } from '../lib/earth/collision.js';
import { allAetherPlacements } from '../lib/earth/aether.js';
import {
  detectRotor,
  detectBeam,
  registerVertexAnimation,
  stepVertexAnimations,
  clearVertexAnimations,
} from '../lib/earth/asset-anim.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// ---------- the enterable set ----------

const SEGMENT_LANDMARKS = new Set(['e056-great-wall', 'e059-golden-gate']);
function expectedEnterable() {
  return EARTH_ASSETS.filter((a) => {
    if (SEGMENT_LANDMARKS.has(a.id)) return false;
    if (a.category === 'building') return true;
    if (a.category === 'landmark' && a.placement && a.placement.mode === 'single') return true;
    return false;
  });
}

test('every building class and single landmark resolves an interior', () => {
  const expected = expectedEnterable();
  const specs = getInteriors();
  assert.equal(specs.length, expected.length,
    `interiors ${specs.length} vs enterable assets ${expected.length}`);
  for (const a of expected) {
    const spec = interiorById(a.id);
    assert.ok(spec, `${a.id} (${a.category}) has no interior`);
    assert.ok(spec.radiusM >= 1, `${a.id} radius`);
    assert.ok(spec.doorWidthM > 0 && spec.wallM > 0, `${a.id} door/wall`);
    assert.ok(spec.doorBearingDeg >= 0 && spec.doorBearingDeg < 360, `${a.id} door bearing`);
    assert.ok(spec.floors >= 1 && spec.floorHeightM > 0, `${a.id} floors`);
    assert.ok(spec.lightColor, `${a.id} interior light color`);
    if (spec.floors > 1) assert.ok(spec.lift, `${a.id} multi-floor needs a lift volume`);
    else assert.equal(spec.lift, null, `${a.id} single floor must not carry a lift`);
  }
  // Walk-along structures and terrain singles stay solid-only:
  assert.equal(interiorById('e056-great-wall'), null);
  assert.equal(interiorById('e059-golden-gate'), null);
});

test('houses get warm interior lighting; classes are distinct', () => {
  const house = interiorById('e023-prairie-farmhouse');
  assert.equal(house.class, 'house');
  assert.equal(house.lightColor, '#ffb46b');
  assert.equal(house.windows, true);
  const classes = new Set(getInteriors().map((s) => s.class));
  for (const c of ['house', 'barn', 'silo', 'windmill', 'lighthouse', 'water-tower',
    'grain-elevator', 'control-tower', 'dome-church', 'landmark']) {
    assert.ok(classes.has(c), `missing interior class ${c}`);
  }
});

test('big constructs are enterable with many floors + a working lift spec', () => {
  const burj = interiorById('e060-burj-khalifa');
  assert.ok(burj.floors >= 8, `burj floors ${burj.floors}`);
  assert.equal(liftPadAt(burj, burj.lift.eastM, burj.lift.northM), 'up');
  assert.equal(liftPadAt(burj, burj.lift.eastM, burj.lift.northM + burj.lift.padGapM), 'down');
  assert.equal(liftPadAt(burj, 0, 0), null);
  assert.ok(floorAltM(burj, 3) > floorAltM(burj, 0));
  assert.equal(floorAltM(burj, 0), 0);
});

// ---------- aether ----------

test('aether placements are deterministic, unique, and INSIDE buildings only', () => {
  const placements = allAetherPlacements();
  assert.ok(placements.length >= 40, `expected a good spread, got ${placements.length}`);
  const ids = new Set(placements.map((a) => a.id));
  assert.equal(ids.size, placements.length, 'aether ids unique');
  const again = allAetherPlacements();
  assert.deepEqual(
    again.map((a) => [a.id, a.lat, a.lon, a.floor]),
    placements.map((a) => [a.id, a.lat, a.lon, a.floor]),
    'same world for every visitor (fixed seeds)',
  );
  const classes = new Set();
  for (const a of placements) {
    const spec = interiorById(a.interiorId);
    assert.ok(spec, `aether ${a.id} belongs to an interior`);
    classes.add(spec.class);
    const d = Math.hypot(a.eastM, a.northM);
    assert.ok(d < spec.radiusM - spec.wallM,
      `${a.id} must sit inside the room free zone (d=${d.toFixed(2)}, free=${(spec.radiusM - spec.wallM).toFixed(2)})`);
    assert.ok(a.floor >= 0 && a.floor < spec.floors, `${a.id} floor exists`);
    // and its lat/lon really is inside the construct's footprint:
    const hit = interiorAt(a.lat, a.lon);
    assert.ok(hit && hit.spec.id === spec.id, `${a.id} lat/lon resolves inside ${spec.id}`);
  }
  assert.ok(classes.size >= 8, `aether spread across classes (got ${classes.size})`);
});

// ---------- doors: collision + round-trip ----------
//
// STAGED CONTRACT (Earth 1 simplification, 2026-10-26): every
// interior's asset id is staged, so buildColliders() publishes
// NO interior colliders while staged — otherwise the walker
// would hit invisible walls where visible objects used to be.
// The interior SPECS below (door bearings, room math, aether
// placements) are unchanged and still pass; only the collider
// contract is suspended. To restore an interior: remove its id
// from lib/earth/staged-objects.js AND remount its renderer —
// these tests must then be restored to the door-collider form.
test('staged interiors publish no colliders (no invisible walls)', () => {
  const colliders = buildColliders();
  assert.deepEqual(colliders, []);
  for (const spec of getInteriors()) {
    const c = colliders.find((x) => x.id === spec.id);
    assert.equal(c, undefined, `${spec.id} must publish no collider while staged`);
  }
});

/** Fair walk: step from the walker's ACTUAL position toward a
 *  target on the same bearing line, ≤ stepM per moveWithCollision
 *  call — the discipline the real roam loop uses. */
function fairWalk(spec, bearingDeg, startD, targetD, stepM = 0.3) {
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((spec.lat * Math.PI) / 180);
  const rad = (bearingDeg * Math.PI) / 180;
  const point = (d) => ({
    lat: spec.lat + (Math.cos(rad) * d) / mPerDegLat,
    lon: spec.lon + (Math.sin(rad) * d) / mPerDegLon,
  });
  let cur = point(startD);
  const target = point(targetD);
  let blocked = 0;
  let moves = 0;
  for (let i = 0; i < 300; i++) {
    const dLat = (target.lat - cur.lat) * mPerDegLat;
    const dLon = (target.lon - cur.lon) * mPerDegLon;
    const dist = Math.hypot(dLat, dLon);
    if (dist < 0.05) break;
    const s = Math.min(stepM, dist) / dist;
    const nxt = { lat: cur.lat + (dLat * s) / mPerDegLat, lon: cur.lon + (dLon * s) / mPerDegLon };
    const r = moveWithCollision(cur.lat, cur.lon, nxt.lat, nxt.lon, 0.5, false);
    moves++;
    if (Math.abs(r.lat - nxt.lat) > 1e-9 || Math.abs(r.lon - nxt.lon) > 1e-9) blocked++;
    cur = r;
  }
  const endD = Math.hypot(
    (cur.lat - spec.lat) * mPerDegLat,
    (cur.lon - spec.lon) * mPerDegLon,
  );
  return { blocked, moves, endD, lat: cur.lat, lon: cur.lon };
}

for (const id of ['e023-prairie-farmhouse', 'e065-lighthouse', 'e021-red-gambrel-barn']) {
  test(`door round-trip: ${id} — in through the door, back out, never trapped`, () => {
    const spec = interiorById(id);
    const R = spec.radiusM;
    const inward = fairWalk(spec, spec.doorBearingDeg, R + 6, 0.4);
    assert.equal(inward.blocked, 0, `entry must be unobstructed (blocked ${inward.blocked}/${inward.moves})`);
    const insideHit = interiorAt(inward.lat, inward.lon);
    assert.ok(insideHit && insideHit.spec.id === id, 'walker ends inside');
    const outward = fairWalk(spec, spec.doorBearingDeg, 0.4, R + 6);
    assert.equal(outward.blocked, 0, `exit must be unobstructed (blocked ${outward.blocked}/${outward.moves})`);
    assert.equal(interiorAt(outward.lat, outward.lon), null, 'walker ends outside');
  });

  test(`staged walls hold nothing: ${id} — a former wall approach is unblocked`, () => {
    const spec = interiorById(id);
    const R = spec.radiusM;
    for (const off of [90, 180, 270]) {
      const w = fairWalk(spec, (spec.doorBearingDeg + off) % 360, R + 6, 0.4);
      assert.equal(w.blocked, 0, `staged wall at +${off}° must not block (blocked ${w.blocked}/${w.moves})`);
    }
  });
}

test('doorSectorOk: true at the door, false at the walls', () => {
  const house = interiorById('e023-prairie-farmhouse');
  const R = house.radiusM;
  const atDoor = latLonFromOffsets(house.lat, house.lon, 0, -(R - 0.1)); // door faces south (180°)
  assert.equal(doorSectorOk(house, atDoor.lat, atDoor.lon, 0.5), true);
  const atWall = latLonFromOffsets(house.lat, house.lon, R - 0.1, 0);
  assert.equal(doorSectorOk(house, atWall.lat, atWall.lon, 0.5), false);
});

// ---------- animation ----------

function fakeGeometry(kind) {
  const pts = [];
  if (kind === 'rotor') {
    for (let i = 0; i < 400; i++) pts.push((Math.random() - 0.5) * 0.6, Math.random() * 6, (Math.random() - 0.5) * 0.6);
    for (let i = 0; i < 900; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.sqrt(Math.random()) * 2.5;
      pts.push(Math.cos(a) * r, 6.4 + Math.sin(a) * r, (Math.random() - 0.5) * 0.3);
    }
  } else {
    for (let i = 0; i < 500; i++) pts.push((Math.random() - 0.5) * 2, Math.random() * 1.4, (Math.random() - 0.5) * 1.4);
    for (let i = 0; i < 700; i++) pts.push((Math.random() * 2 - 1) * 4, 1.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.5);
  }
  return { attributes: { position: { array: new Float32Array(pts), count: pts.length / 3, needsUpdate: false } } };
}

test('vertex animation: rotor + beam detection, stepping moves only the part', () => {
  clearVertexAnimations();
  const gRotor = fakeGeometry('rotor');
  const rotor = detectRotor(gRotor.attributes.position.array, gRotor.attributes.position.count);
  assert.ok(rotor && rotor.indices.length >= 40, 'rotor disc detected');
  assert.equal(rotor.axis, 2, 'disc normal is z for the synthetic fan');

  const gBeam = fakeGeometry('beam');
  const beam = detectBeam(gBeam.attributes.position.array, gBeam.attributes.position.count);
  assert.ok(beam && beam.indices.length >= 40, 'pumpjack beam detected');

  const reg = registerVertexAnimation(gRotor, 'rotor');
  assert.ok(reg, 'registration succeeds');
  const vi = reg.indices[Math.floor(reg.indices.length / 2)];
  const before = gRotor.attributes.position.array[vi * 3 + 1];
  stepVertexAnimations(0, 0.6);
  const after = gRotor.attributes.position.array[vi * 3 + 1];
  assert.notEqual(before, after, 'stepping rotates masked vertices');
  assert.equal(gRotor.attributes.position.needsUpdate, true);
  clearVertexAnimations();

  // A flat ground plane has no top band at all: detection
  // honestly declines (the asset stays static, never breaks).
  const flatPts = [];
  for (let i = 0; i < 300; i++) flatPts.push(Math.random() * 10, 0, Math.random() * 10);
  assert.equal(detectRotor(new Float32Array(flatPts), 300), null);
  assert.equal(registerVertexAnimation({ attributes: { position: { array: new Float32Array(flatPts), count: 300 } } }, 'rotor'), null);
});

test('vertex animation: the plate-normal test separates blades from lattice', () => {
  // Same synthetic fan as above, but WITH normals: blade plates
  // face the axis (normal = ±z), an added crown lattice block has
  // normals facing up. Only the plates (and hub core) may mask.
  clearVertexAnimations();
  const pos = [];
  const nor = [];
  for (let i = 0; i < 400; i++) { pos.push((Math.random() - 0.5) * 0.6, Math.random() * 6, (Math.random() - 0.5) * 0.6); nor.push(0, 1, 0); }
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.5 + Math.sqrt(Math.random()) * 2.5;
    pos.push(Math.cos(a) * r, 6.4 + Math.sin(a) * r, (Math.random() - 0.5) * 0.3);
    nor.push(0, 0, 1);
  }
  // crown lattice block at MODERATE radius (outside the hub-core
  // exemption, inside the disc radius), normals facing UP:
  let lattice = 0;
  for (let i = 0; i < 300; i++) {
    pos.push(1.8 + (Math.random() - 0.5) * 1.2, 6.4 + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.3);
    nor.push(0, 1, 0);
    lattice++;
  }
  const count = pos.length / 3;
  const det = detectRotor(new Float32Array(pos), count, new Float32Array(nor));
  assert.ok(det, 'disc detected with normals present');
  const masked = new Set(det.indices);
  let latticeMasked = 0;
  for (let i = 1300; i < count; i++) if (masked.has(i)) latticeMasked++;
  assert.ok(latticeMasked <= lattice * 0.34,
    `lattice verts must mostly stay out of the mask (got ${latticeMasked}/${lattice})`);
  clearVertexAnimations();
});

test('animation + interiors are wired into the Earth render path', () => {
  const assets = read('components/EarthAssets.jsx');
  assert.match(assets, /registerVertexAnimation\(fm\.geometry, 'rotor'\)/, 'farm windmill fan');
  assert.match(assets, /registerVertexAnimation\(geo, 'rotor'\)/, 'wind turbines');
  assert.match(assets, /registerVertexAnimation\(geo, 'beam'\)/, 'oil pumpjacks');
  assert.match(assets, /buildInteriorRoom\(interior, placements\[0\]\)/, 'rooms built at placement');
  assert.match(assets, /function InteriorsDriver/, 'interiors driver in the render loop');
  assert.match(assets, /collectAether\(a\.id\)/, 'aether collection in the driver');
  assert.match(assets, /fx\.coin\(\)/, 'standard pickup feedback');

  const room = read('components/EarthInteriorRoom.js');
  assert.match(room, /export function buildInteriorRoom/);

  const collision = read('lib/earth/collision.js');
  assert.match(collision, /c\.door/, 'door-aware collision');

  const walker = read('components/EarthWalker.jsx');
  assert.match(walker, /getInteriorAltM\(\)/, 'walker rides interior altitude');
  const flight = read('components/EarthFlightController.jsx');
  assert.match(flight, /getClimbAltM\(\) \+ getInteriorAltM\(\) \+ bikeLiftM/, 'street camera includes interior altitude');
  assert.match(flight, /getInteriorAltM\(\) <= 0\.05/, 'floor clamp stands down inside');

  // Staged contract (2026-10-26, street QA 3): interiors are
  // staged off Earth 1, so the console must NOT promise aether
  // hidden in buildings — that copy was dead and is removed.
  // The specs and driver code above stay for restoration.
  const consoleSrc = read('components/EarthConsole.jsx');
  assert.ok(!consoleSrc.includes('hidden inside Earth'), 'no dead aether-in-buildings copy in the console');
});

test('Part 1 rule replaced 2026-10-26: quantum is GONE, not flagged off', () => {
  assert.throws(() => read('lib/earth/quantum.js'), /ENOENT/);
  for (const f of ['app/page.jsx', 'components/EarthConsole.jsx', 'components/NexusEarth.jsx', 'components/HomeScene.jsx']) {
    assert.ok(!read(f).includes('QUANTUM_ENABLED'), `${f} must not reference the quantum flag`);
  }
});
