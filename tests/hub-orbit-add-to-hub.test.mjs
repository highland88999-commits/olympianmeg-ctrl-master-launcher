// Part 13 second refinement + Part 14 — horizontal rings, rings made
// as they fill up, and Add to Hub (engines + profiles).
//
//   - Capacity: 12 items per ring; a full ring spawns the next
//     exponential ring outward; nothing ever overflows a ring.
//   - Distance still decides the starting ring (Part 13 rule); a full
//     starting ring spills outward, never inward.
//   - Placement is on the flat HORIZONTAL plane (y = ORBIT_CENTER.y);
//     labels stay readable because they are Billboards (see the
//     component-wiring tests below).
//   - The rings carry every orbitable kind the World Engine places,
//     not planets only.
//   - Add to Hub sends the item to the hub with no dialog, dedups by
//     id, and persists to localStorage (no server table in this round).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ORBIT_RING_GROWTH,
  ORBIT_RING_CAPACITY,
  ORBIT_RING_PLANE,
  ORBITABLE_KINDS,
  normalizeOrbitKind,
  HUB_ORBIT_RING_RADII,
  HUB_ORBIT_ITEMS_KEY,
  hubOrbitRingRadius,
  ringIndexForDistance,
  ringIndexForDistanceWithCapacity,
  ringCounts,
  placeOrbitItem,
  addOrbitItem,
  drawnHubOrbitRingRadii,
  loadHubOrbitItems,
  saveHubOrbitItems,
  addItemToHub,
  hubOrbitItemFor,
} from '../lib/hub-orbit-rings.js';
import { ORBIT_CENTER } from '../lib/god-orbits.js';

const approx = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const mk = (id, extra = {}) => ({ id, kind: 'world', name: 'Item ' + id, ...extra });

// --- Capacity ---------------------------------------------------------------

test('per-ring capacity is 12 (Merlin corrects it with one number)', () => {
  assert.equal(ORBIT_RING_CAPACITY, 12);
});

test('a ring at capacity spawns the next ring; the new ring follows k', () => {
  let items = [];
  for (let i = 0; i < 12; i++) {
    const r = addOrbitItem(items, mk('w' + i));
    assert.equal(r.placed.ringIndex, 1, 'first 12 all land on ring 1');
    assert.equal(r.added, true);
    assert.equal(r.spawnedNewRing, i === 0, 'only the first item makes ring 1');
    items = r.items;
  }
  assert.deepEqual(ringCounts(items), { 1: 12 });
  const thirteenth = addOrbitItem(items, mk('w12'));
  assert.equal(thirteenth.placed.ringIndex, 2, '13th spills to ring 2, not the full ring 1');
  assert.equal(thirteenth.spawnedNewRing, true, 'ring 2 is made by the spill');
  assert.ok(approx(thirteenth.placed.radius, hubOrbitRingRadius(2)));
  assert.ok(approx(thirteenth.placed.radius / hubOrbitRingRadius(1), ORBIT_RING_GROWTH));
  assert.equal(thirteenth.items.length, 13);
});

test('fill-up keeps going: ring 2 full spawns ring 3 at 2x again', () => {
  let items = [];
  for (let i = 0; i < 24; i++) items = addOrbitItem(items, mk('x' + i)).items;
  assert.deepEqual(ringCounts(items), { 1: 12, 2: 12 });
  const next = addOrbitItem(items, mk('x24'));
  assert.equal(next.placed.ringIndex, 3);
  assert.ok(approx(next.placed.radius, 1965.6, 0.5));
});

test('distance still decides the starting ring; a full starting ring spills outward only', () => {
  // Far item (distance ~1500) starts on ring 3 even with ring 1 empty.
  const far = placeOrbitItem(mk('far', { center: { x: ORBIT_CENTER.x + 1500, y: ORBIT_CENTER.y, z: ORBIT_CENTER.z } }), []);
  assert.equal(ringIndexForDistance(1500), 3);
  assert.equal(far.ringIndex, 3);
  // Fill ring 1, then a near item spills to ring 2 — never inward (there is no ring 0).
  let items = [];
  for (let i = 0; i < 12; i++) items = addOrbitItem(items, mk('n' + i)).items;
  const near = placeOrbitItem(mk('near', { center: { x: ORBIT_CENTER.x + 300, y: ORBIT_CENTER.y, z: ORBIT_CENTER.z } }), items);
  assert.equal(ringIndexForDistance(300), 1);
  assert.equal(near.ringIndex, 2);
  assert.equal(ringIndexForDistanceWithCapacity(300, ringCounts(items)), 2);
  // And a far item with ring 1 full still starts on ring 3, not ring 2.
  const far2 = placeOrbitItem(mk('far2', { center: { x: ORBIT_CENTER.x + 1500, y: ORBIT_CENTER.y, z: ORBIT_CENTER.z } }), items);
  assert.equal(far2.ringIndex, 3);
});

// --- Horizontal plane --------------------------------------------------------

test('the ring plane is horizontal and placed items sit on it', () => {
  assert.equal(ORBIT_RING_PLANE, 'horizontal');
  // Even a desired centre far above/below the plane flattens onto it.
  // (3D distance sqrt(400^2 + 300^2) = 500, inside ring 1's boundary.)
  const placed = placeOrbitItem(
    mk('high', { center: { x: ORBIT_CENTER.x + 400, y: ORBIT_CENTER.y + 300, z: ORBIT_CENTER.z } }),
    []
  );
  assert.equal(placed.center.y, ORBIT_CENTER.y);
  assert.ok(approx(dist(placed.center, ORBIT_CENTER), placed.radius));
  assert.equal(placed.ringIndex, 1);
});

test('items on one ring are slotted around it, never stacked on one angle', () => {
  let items = [];
  for (let i = 0; i < 12; i++) items = addOrbitItem(items, mk('s' + i)).items;
  const angles = items.map((e) => e.angle).sort((a, b) => a - b);
  for (let i = 1; i < angles.length; i++) {
    assert.ok(angles[i] - angles[i - 1] > 0.05, 'angles stay apart: ' + angles.join(', '));
  }
  assert.ok(angles[angles.length - 1] - angles[0] < Math.PI * 2, 'all inside one turn');
});

// --- Kinds -------------------------------------------------------------------

test('rings carry every kind the World Engine places, not planets only', () => {
  // Mirrors AUCTION_CATEGORIES in lib/auction/helpers.js, plus 'planet'.
  const expected = ['world', 'weather', 'character', 'creature', 'vehicle', 'object', 'weapon', 'asset_link'];
  for (const k of expected) {
    assert.ok(ORBITABLE_KINDS.includes(k), k + ' is orbitable');
    assert.equal(normalizeOrbitKind(k), k);
    const placed = placeOrbitItem({ id: 'k-' + k, kind: k, name: k }, []);
    assert.ok(placed && placed.kind === k && placed.ringIndex === 1, k + ' places on ring 1');
  }
  assert.equal(normalizeOrbitKind('planet'), 'planet');
  assert.equal(normalizeOrbitKind('land_tiles'), null, 'land tiles are not orbitable');
  assert.equal(normalizeOrbitKind(''), null);
  assert.equal(placeOrbitItem({ id: 'bad', kind: 'land_tiles' }, []), null);
  assert.equal(placeOrbitItem({ kind: 'world' }, []), null, 'no id, no placement');
});

// --- Dedup + storage ----------------------------------------------------------

test('re-adding the same item never duplicates it or makes a ring', () => {
  const first = addOrbitItem([], mk('dup'));
  const second = addOrbitItem(first.items, mk('dup'));
  assert.equal(second.added, false);
  assert.equal(second.items.length, 1);
  assert.equal(second.spawnedNewRing, false);
  assert.deepEqual(second.placed, first.placed);
});

test('addItemToHub persists to localStorage and reads back on the hub', () => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  try {
    assert.deepEqual(loadHubOrbitItems(), []);
    const res = addItemToHub({ id: 'asset-1', kind: 'vehicle', name: 'My Speeder', source: 'profile' });
    assert.equal(res.added, true);
    assert.equal(res.placed.ringIndex, 1);
    assert.equal(res.placed.center.y, ORBIT_CENTER.y);
    assert.ok(store[HUB_ORBIT_ITEMS_KEY], 'written under the hub key');
    const loaded = loadHubOrbitItems();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, 'asset-1');
    assert.equal(hubOrbitItemFor('asset-1').kind, 'vehicle');
    assert.equal(hubOrbitItemFor('missing'), null);
    const again = addItemToHub({ id: 'asset-1', kind: 'vehicle', name: 'My Speeder', source: 'profile' });
    assert.equal(again.added, false, 'second Add to Hub is a no-op');
    assert.equal(loadHubOrbitItems().length, 1);
    // A corrupt store never throws — the hub just starts empty.
    store[HUB_ORBIT_ITEMS_KEY] = '{not json';
    assert.deepEqual(loadHubOrbitItems(), []);
    saveHubOrbitItems([]);
    assert.deepEqual(loadHubOrbitItems(), []);
  } finally {
    delete globalThis.localStorage;
  }
});

// --- Drawn rings ---------------------------------------------------------------

test('drawn rings: the three Part 13 rings always, further rings only once made', () => {
  assert.deepEqual(
    drawnHubOrbitRingRadii([]).map((r) => Math.round(r * 10) / 10),
    HUB_ORBIT_RING_RADII.map((r) => Math.round(r * 10) / 10)
  );
  let items = [];
  for (let i = 0; i < 37; i++) items = addOrbitItem(items, mk('d' + i)).items;
  assert.deepEqual(ringCounts(items), { 1: 12, 2: 12, 3: 12, 4: 1 });
  const radii = drawnHubOrbitRingRadii(items);
  assert.equal(radii.length, 4, 'ring 4 appears once fill-up makes it');
  assert.ok(approx(radii[3], hubOrbitRingRadius(4)));
});

// --- Component wiring ----------------------------------------------------------

test('GodOrbitRings renders hub items with upright Billboard labels + green glow, on drawn-as-made rings', () => {
  const src = readFileSync('components/GodOrbitRings.jsx', 'utf8');
  assert.ok(src.includes('loadHubOrbitItems'), 'reads the stored hub items');
  assert.ok(src.includes('HUB_ORBIT_ITEMS_CHANGED_EVENT'), 'refreshes live when an item is added');
  assert.ok(src.includes('drawnHubOrbitRingRadii'), 'rings drawn as they are made');
  assert.ok(src.includes('HUB_ORBIT_RING_RADII'), 'the three Part 13 rings are still drawn');
  assert.ok(src.includes('#39ff88'), 'Treasure Planet green glow ring');
  assert.ok(src.includes('HubOrbitItem'), 'added items render on their rings');
  assert.ok(src.includes('<Billboard'), 'item labels are Billboards — upright and readable at any camera angle');
  assert.ok(src.includes('orbitRingBillboardBlend'), 'perfect-circle billboard blend kept: horizontal at the hub, camera-facing scrolled out');
});

test('AddToHubButton is the Part 12 unified style and sends with no dialog', () => {
  const src = readFileSync('components/world-engine/AddToHubButton.jsx', 'utf8');
  assert.ok(src.includes('DialogUnified.module.css'), 'shared .btn style');
  assert.ok(src.includes('dialogStyles.btn'), 'uses the .btn class');
  assert.ok(src.includes('addItemToHub'), 'click sends the item to the hub');
  assert.ok(src.includes('Add to Hub'), 'button label');
  assert.ok(src.includes('On the hub'), 'already-added state');
  assert.ok(!src.includes('confirm(') && !src.includes('window.prompt'), 'no intermediate dialog');
});

test('Add to Hub is in every World Engine surface that has a creation', () => {
  const forge = readFileSync('components/world-engine/ForgeSector.jsx', 'utf8');
  assert.ok(forge.includes('AddToHubButton'), 'ForgeSector (all 7 builders) has the button');
  assert.ok(forge.includes("select('id, display_name')"), 'saved creation id captured for the button');
  const engine = readFileSync('app/world-engine/engine/page.jsx', 'utf8');
  assert.ok(engine.includes('AddToHubButton'), '3D engine page has the button');
  assert.ok(engine.includes('readSeed'), 'engine item is identified by its world seed');
  const studio = readFileSync('app/world-engine/studio/page.jsx', 'utf8');
  assert.ok(studio.includes('AddToHubButton'), 'Hologram Studio has the button');
  const profile = readFileSync('components/profile/MyCreations.jsx', 'utf8');
  assert.ok(profile.includes('AddToHubButton'), 'profile creations have the button');
  assert.ok(profile.includes("source: 'profile'"), 'profile button sends the saved asset by row id');
});

test('all seven ForgeSector builders route through the one button (sectors check)', () => {
  const sectors = readFileSync('lib/world-engine/sectors.js', 'utf8');
  for (const key of ['architect', 'characters', 'weapons', 'vehicles', 'weather', 'objects', 'uplink']) {
    assert.ok(sectors.includes(key + ':') || sectors.includes(key + ' :'), key + ' sector exists');
  }
  const pages = ['architect', 'characters', 'weapons', 'vehicles', 'weather', 'objects', 'uplink'];
  for (const p of pages) {
    const src = readFileSync('app/world-engine/' + p + '/page.jsx', 'utf8');
    assert.ok(src.includes('ForgeSector'), p + ' page renders ForgeSector, so it gets the button');
  }
});
