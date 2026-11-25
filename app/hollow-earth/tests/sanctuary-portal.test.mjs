// Sanctuary portal tests (dive round, Merlin Nov 24 ~16:51):
// walk through the portal at a sanctuary's heart and it carries
// you out to monsters of that sanctuary's type. Pure module
// first (sanctuary-portal.js), then the mesh build with real
// THREE, then the zone wiring (buildWorld hangs one portal per
// zone, no collider) and the page wiring pins.
//
// The DOM stub is installed BEFORE the dynamic imports (the
// builders-test pattern): the static imports above it are all
// DOM-free, and zone.js / textures.js / data.js load after the
// stub, like builders.test.mjs does.

const fakeCtx = new Proxy(
  {
    canvas: null,
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: [] }),
    measureText: () => ({ width: 100 }),
  },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }
);
const fakeCanvas = {
  width: 0,
  height: 0,
  getContext: () => fakeCtx,
  style: {},
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? fakeCanvas : { style: {} }),
};
globalThis.window = globalThis;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import * as THREE from 'three';
import {
  SAFE_ZONES,
  isInSanctuary, isInsideAnyRing,
} from '../sanctuary.js';
import { BIOMES } from '../biomes.js';
import { FAMILIES_BY_ELEMENT } from '../families.js';
import { ringElementColor, SANCTUARY_GOLD } from '../sanctuary-ring.js';
import {
  PORTAL_ARCH_R_M, PORTAL_DISC_R_M, PORTAL_TRIGGER_R_M,
  PORTAL_STANDOFF_M, PORTAL_CLEAR_M,
  portalElementForZone, portalFamiliesForZone,
  portalSeatForZone, portalYawForZone, pickPortalDestination,
  buildSanctuaryPortal,
} from '../sanctuary-portal.js';
import { spawnField } from '../spawns.js';

const THREE_MOD = THREE;
const { buildWorld } = await import('../zone.js');
const T = await import('../textures.js');
const DATA = await import('../data.js');

// The static landmark colliders (data.js seats ×
// buildLandmark colliderR): the five band landmarks that sit
// on a zone centre, plus the Haven (colliderR 0 — never a
// wall). Scatter colliders are not in this list; the buildWorld
// test below pins the seats against the real collider list.
const LANDMARK_COLLIDERS = [
  { x: 0, z: 155, r: 0 }, // the Haven: no collider
  { x: -160, z: 40, r: 6 * 1.2 }, // ooze-pool at Acid Hollow
  { x: 160, z: -60, r: 3 * 1.1 }, // ember-spire at Ember Rest
  { x: -70, z: -170, r: 2.5 }, // storm-pylon at Storm Calm
  { x: 180, z: 110, r: 4 }, // mire-arch at Spore Sanctuary
  { x: 210, z: -150, r: 4 * 1.1 }, // peak-shrine at Mountain Watch
];

const sorted = (arr) => [...arr].sort();

// ---- the element → families table (all fourteen zones) ----

test('portal mapping: every zone has a portal element, and the family table is exact', () => {
  const expected = {
    'The Haven': { element: null, families: [] },
    'Acid Hollow': { element: 'acid', families: ['slot-01', 'slot-21', 'slot-27', 'slot-29', 'slot-33', 'slot-37', 'oozealot'] },
    'Ember Rest': { element: 'fire', families: ['slot-02', 'slot-03', 'slot-06', 'slot-07', 'slot-08', 'slot-09', 'slot-14', 'slot-18', 'slot-22', 'slot-25', 'slot-30', 'slot-32', 'slot-34', 'embermane-horse'] },
    'Storm Calm': { element: 'lightning', families: ['slot-16', 'slot-17', 'slot-19', 'slot-20', 'slot-39', 'aureline', 'eagle-talon'] },
    'Spore Sanctuary': { element: 'poison', families: ['slot-36', 'slot-38', 'slot-40', 'vice'] },
    'Gloom Refuge': { element: 'shadow', families: ['slot-11', 'slot-12', 'slot-26', 'slot-35', 'slot-43', 'umbrax', 'fenris-warg', 'wonder'] },
    'Frost Haven': { element: 'frost', families: ['slot-10', 'frostbite-lizard'] },
    'Mountain Watch': { element: 'lightning', families: ['slot-16', 'slot-17', 'slot-19', 'slot-20', 'slot-39', 'aureline', 'eagle-talon'] },
    'Dune Rest': { element: 'sand', families: ['slot-05', 'slot-23', 'slot-24', 'slot-28', 'scarab-beetle', 'dune-maw-2'] },
    'East Reach': { element: 'poison', families: ['slot-36', 'slot-38', 'slot-40', 'vice'] },
    'Storm Heights': { element: 'lightning', families: ['slot-16', 'slot-17', 'slot-19', 'slot-20', 'slot-39', 'aureline', 'eagle-talon'] },
    Southwatch: { element: 'lightning', families: ['slot-16', 'slot-17', 'slot-19', 'slot-20', 'slot-39', 'aureline', 'eagle-talon'] },
    'West Gloom': { element: 'shadow', families: ['slot-11', 'slot-12', 'slot-26', 'slot-35', 'slot-43', 'umbrax', 'fenris-warg', 'wonder'] },
    'North Dunes': { element: 'sand', families: ['slot-05', 'slot-23', 'slot-24', 'slot-28', 'scarab-beetle', 'dune-maw-2'] },
  };
  assert.equal(SAFE_ZONES.length, 14);
  for (const zone of SAFE_ZONES) {
    const want = expected[zone.name];
    assert.ok(want, `no expected mapping for ${zone.name}`);
    assert.equal(portalElementForZone(zone), want.element, `${zone.name} portal element`);
    assert.deepEqual(sorted(portalFamiliesForZone(zone)), sorted(want.families), `${zone.name} portal families`);
    // The family list is the element's own table, never a
    // second copy: it must match families.js exactly.
    if (want.element) {
      assert.deepEqual(
        sorted(portalFamiliesForZone(zone)),
        sorted(FAMILIES_BY_ELEMENT[want.element]),
        `${zone.name} must read its families off FAMILIES_BY_ELEMENT`,
      );
    }
  }
});

test('portal mapping: mountain is lightning, read off biomes.js — never assumed', () => {
  assert.equal(BIOMES.mountain.element, 'lightning', 'biomes.js says the mountain element IS lightning');
  for (const name of ['Mountain Watch', 'Storm Heights']) {
    const zone = SAFE_ZONES.find((z) => z.name === name);
    assert.equal(portalElementForZone(zone), 'lightning', `${name} must map to lightning`);
    assert.deepEqual(
      sorted(portalFamiliesForZone(zone)),
      sorted(FAMILIES_BY_ELEMENT.lightning),
      `${name} takes the lightning families`,
    );
  }
});

test('portal mapping: The Haven is decided — gold, no element, nearest field monsters of any family', () => {
  const haven = SAFE_ZONES[0];
  assert.equal(haven.name, 'The Haven');
  assert.equal(haven.element, 'gold');
  assert.equal(portalElementForZone(haven), null, 'gold maps to no element — the general door out');
  assert.deepEqual(portalFamiliesForZone(haven), [], 'no element means no family list');
  // The destination proves the decision: with a mixed field the
  // Haven lands by a monster of whatever element is nearest,
  // not by an element filter.
  const world = {
    monsters: [
      { id: 'm-fire', type: 'slot-02', element: 'fire', x: 30, z: 160 },
    ],
  };
  const dest = pickPortalDestination(haven, world);
  assert.ok(dest, 'the Haven portal must find a road');
  assert.equal(dest.monsterId, 'm-fire', 'the Haven takes the NEAREST field monster');
  assert.equal(dest.element, 'fire');
  assert.equal(dest.fallback, false, 'gold is by design any-element, not a fallback');
  assert.equal(dest.targetElement, null);
});

// ---- the destination rule, on the real spawn field ----

function fieldWorld() {
  // The real field (same seed the zone builds with): every
  // placed family is in it, poison has no live monster in it.
  const records = spawnField(77701, { habitatAt: () => 'sand' });
  return { monsters: records.map((r) => ({ ...r, dead: false })), rings: [] };
}

test('portal destination: every zone lands in the wilds, clear of monsters, facing one', () => {
  const world = fieldWorld();
  assert.ok(world.monsters.length >= 140, `field too small (${world.monsters.length})`);
  const seen = new Set();
  for (const zone of SAFE_ZONES) {
    const dest = pickPortalDestination(zone, world);
    assert.ok(dest, `${zone.name} must find a destination on the real field`);
    assert.equal(dest.zoneName, zone.name);
    assert.equal(isInSanctuary(dest.x, dest.z), false,
      `${zone.name} destination landed inside a sanctuary at (${dest.x.toFixed(0)},${dest.z.toFixed(0)})`);
    assert.equal(isInsideAnyRing(dest.x, dest.z, world.rings), false, 'no structure ring at the landing either');
    assert.ok(Math.hypot(dest.x, dest.z) <= 540, 'the landing stays inside the hunted disc');
    // Clear of EVERY live monster, not just the anchor.
    let nearest = Infinity;
    let anchor = null;
    for (const m of world.monsters) {
      const d = Math.hypot(dest.x - m.x, dest.z - m.z);
      if (d < nearest) nearest = d;
      if (m.id === dest.monsterId) anchor = m;
    }
    assert.ok(nearest >= PORTAL_CLEAR_M, `${zone.name} landing is ${nearest.toFixed(1)} m from a monster (need ${PORTAL_CLEAR_M})`);
    assert.ok(anchor, 'the destination must name its anchor monster');
    // A few metres off the anchor — the standoff, not on top.
    const offAnchor = Math.hypot(dest.x - anchor.x, dest.z - anchor.z);
    assert.ok(offAnchor >= PORTAL_STANDOFF_M - 0.01 && offAnchor <= 15.01,
      `${zone.name} landing is ${offAnchor.toFixed(1)} m off its anchor (need ${PORTAL_STANDOFF_M}–15)`);
    // Facing it: the unit vector from the landing to the anchor
    // must be the flat forward at faceYaw, (−sin, −cos).
    const ux = (anchor.x - dest.x) / offAnchor;
    const uz = (anchor.z - dest.z) / offAnchor;
    assert.ok(Math.abs(-Math.sin(dest.faceYaw) - ux) < 1e-9, `${zone.name} faceYaw must face the anchor (x)`);
    assert.ok(Math.abs(-Math.cos(dest.faceYaw) - uz) < 1e-9, `${zone.name} faceYaw must face the anchor (z)`);
    // The anchor is the right kind — except where the fallback
    // says otherwise (poison: no live poison monsters exist)
    // or where there is no kind at all (The Haven: any family).
    if (!dest.fallback && dest.targetElement) assert.equal(anchor.element, dest.targetElement);
    // Deterministic: the same zone + world always lands the
    // same way, and each zone has its own road.
    assert.deepEqual(pickPortalDestination(zone, world), dest, `${zone.name} destination must be deterministic`);
    seen.add(`${dest.x.toFixed(1)},${dest.z.toFixed(1)}`);
  }
  assert.ok(seen.size >= 10, `destinations must vary per zone (only ${seen.size} distinct across 14 zones)`);
});

test('portal destination: poison falls back to the nearest live monsters — and says so', () => {
  // A world with no poison monster at all: both poison zones
  // must still find a road, flagged, at a real monster.
  const world = {
    monsters: [
      { id: 'm-fire', type: 'slot-02', element: 'fire', x: 205, z: 135 },
      { id: 'm-sand', type: 'slot-23', element: 'sand', x: 200, z: 80 },
    ],
    rings: [],
  };
  for (const name of ['Spore Sanctuary', 'East Reach']) {
    const zone = SAFE_ZONES.find((z) => z.name === name);
    const dest = pickPortalDestination(zone, world);
    assert.ok(dest, `${name} must find a fallback road`);
    assert.equal(dest.fallback, true, `${name} must flag the fallback — no live poison monsters exist`);
    assert.equal(dest.targetElement, 'poison', 'the target stays poison even on fallback');
    assert.notEqual(dest.element, 'poison', 'the anchor cannot be a poison monster — none is live');
    assert.equal(isInSanctuary(dest.x, dest.z), false, 'the fallback landing is still wilds');
  }
  // And the fallback heals itself: the moment a poison
  // monster IS live, the same zone points at it, unflagged.
  const withPoison = {
    monsters: [
      ...world.monsters,
      // Outside Spore Sanctuary (30 m off its centre — a live
      // monster never stands inside one, so the test must not
      // plant one there either).
      { id: 'm-poison', type: 'slot-36', element: 'poison', x: 210, z: 110 },
    ],
    rings: [],
  };
  const dest = pickPortalDestination(SAFE_ZONES.find((z) => z.name === 'Spore Sanctuary'), withPoison);
  assert.ok(dest);
  assert.equal(dest.fallback, false);
  assert.equal(dest.monsterId, 'm-poison', 'a live poison monster takes the portal, no code change');
});

test('portal destination: no road means no travel — null, never a blind jump', () => {
  const zone = SAFE_ZONES.find((z) => z.name === 'Acid Hollow');
  assert.equal(pickPortalDestination(zone, { monsters: [], rings: [] }), null, 'an empty world has no road');
  assert.equal(
    pickPortalDestination(zone, { monsters: [{ id: 'm-dead', type: 'slot-01', element: 'acid', x: 0, z: 0, dead: true }], rings: [] }),
    null, 'a dead monster is no road',
  );
  // One live monster, ringed by sanctuary: its anchor sits at
  // the Acid Hollow centre, so every standoff ring (8–15 m)
  // still lands inside the r 24 zone — no landing passes.
  assert.equal(
    pickPortalDestination(zone, { monsters: [{ id: 'm-in', type: 'slot-01', element: 'acid', x: -160, z: 40 }], rings: [] }),
    null, 'an anchor with no wilds around it must return null',
  );
});

test('portal destination: a landing never sits inside a structure ring either', () => {
  const zone = SAFE_ZONES.find((z) => z.name === 'Ember Rest');
  // The anchor is a fire monster just outside a wide structure
  // ring: the near standoffs land inside the ring and must be
  // skipped for a farther bearing that clears it.
  const world = {
    monsters: [{ id: 'm-fire', type: 'slot-02', element: 'fire', x: 300, z: 300 }],
    rings: [{ x: 300, z: 300, r: 11, name: 'test-hulk' }],
  };
  const dest = pickPortalDestination(zone, world);
  assert.ok(dest, 'a landing past the ring must still be found');
  assert.equal(isInsideAnyRing(dest.x, dest.z, world.rings), false, 'the landing must clear the structure ring');
  assert.ok(Math.hypot(dest.x - 300, dest.z - 300) >= 11.99, 'the landing steps past the ring, not into it');
});

// ---- the seat: reachable, deterministic, inside the sanctuary ----

test('portal seat: the centre wherever it is open, stepped clear where a landmark covers it', () => {
  const seats = {};
  for (const zone of SAFE_ZONES) {
    const seat = portalSeatForZone(zone, LANDMARK_COLLIDERS);
    seats[zone.name] = seat;
    // Deterministic: the same inputs seat the same way.
    assert.deepEqual(portalSeatForZone(zone, LANDMARK_COLLIDERS), seat, `${zone.name} seat must be deterministic`);
    // Inside the sanctuary, with room to stand.
    const fromCentre = Math.hypot(seat.x - zone.x, seat.z - zone.z);
    assert.ok(fromCentre <= zone.r - 2, `${zone.name} seat is ${fromCentre.toFixed(1)} m out in an r ${zone.r} zone`);
    // Reachable: the walker can stand AT the seat (outside
    // every collider by 0.5 m) and so within trigger range.
    for (const c of LANDMARK_COLLIDERS) {
      if (!(c.r > 0)) continue;
      const d = Math.hypot(seat.x - c.x, seat.z - c.z);
      assert.ok(d >= c.r + 0.5, `${zone.name} seat is ${d.toFixed(1)} m from a r ${c.r} collider — unreachable`);
    }
  }
  // Nine zones seat dead centre (The Haven included — its pole
  // is no collider).
  for (const name of ['The Haven', 'Gloom Refuge', 'Frost Haven', 'Dune Rest', 'East Reach', 'Storm Heights', 'Southwatch', 'West Gloom', 'North Dunes']) {
    assert.equal(seats[name].offset, false, `${name} centre is open — the portal must seat there`);
    assert.equal(seats[name].offsetM, 0);
  }
  // Five zones step clear of the band landmark on their centre.
  const stepped = {
    'Acid Hollow': 6 * 1.2 + PORTAL_TRIGGER_R_M + 0.5,
    'Ember Rest': 3 * 1.1 + PORTAL_TRIGGER_R_M + 0.5,
    'Storm Calm': 2.5 + PORTAL_TRIGGER_R_M + 0.5,
    'Spore Sanctuary': 4 + PORTAL_TRIGGER_R_M + 0.5,
    'Mountain Watch': 4 * 1.1 + PORTAL_TRIGGER_R_M + 0.5,
  };
  for (const [name, want] of Object.entries(stepped)) {
    assert.equal(seats[name].offset, true, `${name} centre is covered — the portal must step out`);
    assert.ok(Math.abs(seats[name].offsetM - want) < 0.01, `${name} steps ${seats[name].offsetM.toFixed(2)} m, expected ${want}`);
  }
  // The yaw faces the heart for an offset seat, the arrival
  // ground for a centre seat.
  for (const zone of SAFE_ZONES) {
    const seat = seats[zone.name];
    const yaw = portalYawForZone(zone, seat);
    const target = seat.offset ? { x: zone.x, z: zone.z } : { x: 0, z: 95 };
    const dx = target.x - seat.x;
    const dz = target.z - seat.z;
    const d = Math.hypot(dx, dz);
    assert.ok(Math.abs(-Math.sin(yaw) - dx / d) < 1e-9, `${zone.name} portal must face its approach (x)`);
    assert.ok(Math.abs(-Math.cos(yaw) - dz / d) < 1e-9, `${zone.name} portal must face its approach (z)`);
  }
});

// ---- the mesh: one per zone, ward-line look, no collider ----

test('portal mesh: one per zone, arch + glow disc + gold, no collider ever', () => {
  assert.ok(PORTAL_ARCH_R_M > 0 && PORTAL_DISC_R_M < PORTAL_ARCH_R_M, 'the disc must fill the arch, not overhang it');
  for (const zone of SAFE_ZONES) {
    const built = buildSanctuaryPortal(zone, THREE_MOD);
    assert.equal(built.userData.sanctuaryPortal, true, `${zone.name} group must be marked a portal`);
    assert.equal(built.userData.zone, zone.name);
    assert.equal(built.userData.element, zone.element);
    assert.equal(built.userData.colliderR, 0, 'a portal is never a wall — colliderR must be 0');
    assert.equal(built.children.length, 5, `${zone.name} portal must be arch + trim + glow + core + foot-ring`);
    const mats = built.userData.portal;
    assert.ok(mats && mats.glowMat && mats.archMat && mats.coreMat, 'the breathing mats must be exposed');
    // The ward-line: the arch wears the zone's element colour
    // (mountain wears lightning, The Haven wears gold).
    const wantColor = ringElementColor(portalElementForZone(zone) || 'gold');
    assert.equal(mats.archMat.color.getHex(), wantColor, `${zone.name} arch must wear its element colour`);
    assert.equal(mats.archMat.emissive.getHex(), wantColor);
    assert.ok(mats.archMat.emissiveIntensity > 0, 'the arch must glow');
    assert.equal(mats.glowMat.transparent, true, 'the glow disc must be transparent');
    assert.equal(mats.glowMat.blending, THREE_MOD.AdditiveBlending, 'the glow disc must be additive, like the ring veil');
    assert.equal(mats.glowMat.side, THREE_MOD.DoubleSide, 'the disc must read from either side');
    // The arch stands on its local ground: its centre is one
    // arch-radius up, so the ring meets the ground at its foot.
    const archMesh = built.children[0];
    assert.ok(Math.abs(archMesh.position.y - PORTAL_ARCH_R_M) < 1e-9, 'the arch centre must sit one radius above the ground');
    assert.ok(Math.abs(mats.glowMat.opacity - 0.5) < 1e-9, 'the glow disc starts at half opacity (the zone breathes it)');
  }
  // Gold for The Haven, lightning for a mountain zone — the two
  // cases the colour rule exists for.
  assert.equal(ringElementColor('gold'), SANCTUARY_GOLD);
  assert.equal(
    buildSanctuaryPortal(SAFE_ZONES.find((z) => z.name === 'Mountain Watch'), THREE_MOD).userData.portal.archMat.color.getHex(),
    ringElementColor('lightning'),
    'a mountain portal must wear lightning’s colour',
  );
});

// ---- the zone wiring: buildWorld hangs one per zone ----

test('portal wiring: buildWorld hangs one portal per zone, seats match the pure rule, none collide', () => {
  const world = buildWorld(THREE_MOD, DATA.WORLD, T, { gateOpen: false });
  try {
    assert.ok(Array.isArray(world.sanctuaryPortals), 'buildWorld must expose its portals');
    assert.equal(world.sanctuaryPortals.length, 14, 'one portal per safe zone');
    const groups = [];
    world.group.traverse((o) => { if (o.userData && o.userData.sanctuaryPortal) groups.push(o); });
    assert.equal(groups.length, 14, 'fourteen portal groups in the scene');
    for (const zone of SAFE_ZONES) {
      const rec = world.sanctuaryPortals.find((p) => p.name === zone.name);
      assert.ok(rec, `${zone.name} must have a portal record`);
      // The shipped seat IS the pure rule applied to the real
      // collider list (landmarks + scatter + dressing).
      const want = portalSeatForZone(zone, world.colliders);
      assert.ok(Math.abs(rec.x - want.x) < 1e-9 && Math.abs(rec.z - want.z) < 1e-9,
        `${zone.name} shipped seat (${rec.x.toFixed(1)},${rec.z.toFixed(1)}) must match the pure rule`);
      assert.equal(rec.element, zone.element);
      const group = groups.find((gr) => gr.userData.zone === zone.name);
      assert.ok(group, `${zone.name} portal group must be in the scene`);
      assert.equal(group.userData.colliderR, 0, 'no portal may carry a collider');
    }
    // No portal contributes a collider: every world collider
    // belongs to a landmark or a scatter piece (the portal
    // seats are not in the list at all).
    for (const rec of world.sanctuaryPortals) {
      const clash = world.colliders.find((c) => Math.hypot(c.x - rec.x, c.z - rec.z) < 0.01);
      assert.equal(clash, undefined, `${rec.name} portal seat must not appear in world.colliders`);
    }
    // The portals breathe without breaking the frame, and
    // dispose removes them cleanly (second dispose is a no-op).
    world.setObserver({ x: 0, z: 95 });
    world.update(0.1);
    world.update(0.1);
  } finally {
    world.dispose();
    world.dispose();
  }
});

// ---- the page wiring: the walk-through, the cooldown, the law ----

test('portal wiring: page + zone source pins', () => {
  const page = readFileSync(new URL('../page.jsx', import.meta.url), 'utf8');
  const zone = readFileSync(new URL('../zone.js', import.meta.url), 'utf8');
  const sanctuary = readFileSync(new URL('../sanctuary.js', import.meta.url), 'utf8');
  // The tick fires the travel on a walk-through: inside a zone
  // sanctuary, within trigger range of that zone's portal, past
  // the cooldown — and repositions the walker facing the
  // destination, resetting the sphere walker there.
  assert.match(page, /pickPortalDestination\(zone, \{ monsters: world\.monsters/, 'the tick must pick the destination from the live field');
  assert.match(page, /PORTAL_TRIGGER_R_M/, 'the tick must read the trigger radius, not a second copy');
  assert.match(page, /PORTAL_COOLDOWN_S/, 'the tick must read the cooldown, not a second copy');
  assert.match(page, /walker\.yaw = dest\.faceYaw/, 'the walker must land facing the anchor monster');
  assert.match(page, /Through the portal —/, 'the travel must toast naming what waits ahead');
  // Mounted travel dismounts first, the death path's order.
  assert.match(page, /rideApiRef\.current\.dismount\(\);\s*\n\s*walker\.pos\.x = dest\.x/, 'a mounted rider must dismount before the portal moves them');
  // The zone builds the portals from the zone table and exposes
  // them; the mesh builder is the portal module's.
  assert.match(zone, /buildSanctuaryPortal/, 'zone.js must build the portals from sanctuary-portal.js');
  assert.match(zone, /for \(const zone of SAFE_ZONES\) \{\s*\n\s*const seat = portalSeatForZone/, 'one portal per SAFE_ZONES entry');
  assert.match(zone, /sanctuaryPortals/, 'buildWorld must expose its portals');
  assert.match(zone, /sanctuaryPortalRecs\.length = 0/, 'dispose must empty the portal list');
  // The sanctuary law is untouched: no portal language in
  // sanctuary.js, and the page's damage guard still reads the
  // full sanctuary predicate (this module adds travel, never
  // an exemption).
  assert.doesNotMatch(sanctuary, /portal/i, 'sanctuary.js must not mention portals — the law is unchanged');
  assert.match(page, /inSanctuaryAt\(walker\.pos\.x, walker\.pos\.z\)/, 'the observer flag must still read the full sanctuary list');
});
