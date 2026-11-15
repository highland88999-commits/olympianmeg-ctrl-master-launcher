// tests/anti-life-lingering.test.mjs — ANTI-LIFE LINGERING DECAY
// (Merlin, 2026-11-15): every visit to /anti-life grants the decay
// for 10 minutes; it follows the user everywhere; 1 km range;
// everything touched resets when the timer dies; passing effected
// ground infects with a fresh 10 minutes; once all effect has worn
// out, only a return to Anti-Life re-acquires it.
// Run: node tests/anti-life-lingering.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DECAY_DURATION_MS,
  DECAY_RANGE_M,
  POSITION_EVENT,
  SPOT_RADIUS_M,
  SPOT_SPACING_M,
  STORAGE_KEY,
  createCarrierState,
  createSpot,
  decayStrengthAt,
  distanceM,
  elapsedFraction,
  findInfection,
  formatRemaining,
  grantCarrier,
  isCarrierActive,
  isSpotLive,
  loadCarrier,
  overlayStrength,
  parseCarrier,
  rangeCoversWorld,
  remainingMs,
  serializeCarrier,
  shouldWriteSpot,
  spotId,
  worldScale,
} from '../lib/anti-life/lingering.js';

const NOW = 1800000000000;
const memStore = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};

// --- the law: 10 minutes, 1 km --------------------------------------------

test('the law is 10 minutes and 1 km', () => {
  assert.equal(DECAY_DURATION_MS, 10 * 60 * 1000);
  assert.equal(DECAY_RANGE_M, 1000);
  assert.equal(SPOT_RADIUS_M, 50, 'infection is ~50 m around decayed ground; the carrier field stays 1 km');
  assert.equal(SPOT_SPACING_M, 200);
});

test('grant is a fresh 10 minutes from the grant moment', () => {
  const s = createCarrierState({ source: 'anti-life', nowMs: NOW });
  assert.equal(s.expiresAt - s.grantedAt, DECAY_DURATION_MS);
  assert.equal(s.source, 'anti-life');
  assert.equal(isCarrierActive(s, NOW), true);
  assert.equal(isCarrierActive(s, NOW + DECAY_DURATION_MS - 1), true);
  assert.equal(isCarrierActive(s, NOW + DECAY_DURATION_MS), false, 'dead at exactly 10:00');
  assert.equal(remainingMs(s, NOW), DECAY_DURATION_MS);
  assert.equal(remainingMs(s, NOW + 60 * 1000), 9 * 60 * 1000);
  assert.equal(remainingMs(s, NOW + DECAY_DURATION_MS), 0);
});

test('elapsed fraction drives the deepening: 0 at grant, 1 at death', () => {
  const s = createCarrierState({ source: 'anti-life', nowMs: NOW });
  assert.equal(elapsedFraction(s, NOW), 0);
  assert.equal(elapsedFraction(s, NOW + DECAY_DURATION_MS / 2), 0.5);
  assert.equal(elapsedFraction(s, NOW + DECAY_DURATION_MS), 1);
  const early = overlayStrength(0);
  const late = overlayStrength(1);
  assert.ok(late.desat > early.desat, 'the world greys as the timer runs down');
  assert.ok(late.darken > early.darken, 'and darkens');
  assert.ok(late.ash > early.ash, 'and the ash thickens');
});

test('formatRemaining reads M:SS', () => {
  assert.equal(formatRemaining(600000), '10:00');
  assert.equal(formatRemaining(599000), '9:59');
  assert.equal(formatRemaining(61000), '1:01');
  assert.equal(formatRemaining(0), '0:00');
});

// --- storage: grants persist, expiry forgets, garbage never grants --------

test('a grant persists across loads and dies on expiry', () => {
  const store = memStore();
  const s = grantCarrier(store, 'anti-life', NOW, 'carrier-1');
  assert.equal(s.carrierId, 'carrier-1', 'the carrier id survives re-grants');
  assert.equal(loadCarrier(store, NOW + 1000).carrierId, 'carrier-1');
  assert.equal(loadCarrier(store, NOW + DECAY_DURATION_MS), null, 'expired: forgotten');
  assert.equal(store.getItem(STORAGE_KEY), null, 'expired: the row is cleared');
});

test('re-granting is always a NEW timer, never an extension', () => {
  const store = memStore();
  grantCarrier(store, 'anti-life', NOW, 'carrier-1');
  const again = grantCarrier(store, 'anti-life', NOW + 5 * 60 * 1000, 'carrier-1');
  assert.equal(again.grantedAt, NOW + 5 * 60 * 1000, 'the clock restarts at the visit');
  assert.equal(again.expiresAt, NOW + 15 * 60 * 1000, 'not 10 + 5');
});

test('corrupt storage never becomes a carrier', () => {
  assert.equal(parseCarrier(null), null);
  assert.equal(parseCarrier(''), null);
  assert.equal(parseCarrier('not json'), null);
  assert.equal(parseCarrier('{"carrierId": 1}'), null, 'id must be a string');
  assert.equal(parseCarrier(JSON.stringify({ carrierId: 'x', grantedAt: NOW, expiresAt: NOW })), null,
    'expiry must be after grant');
  const good = parseCarrier(serializeCarrier(createCarrierState({ source: 'anti-life', nowMs: NOW })));
  assert.ok(good && good.carrierId, 'round-trip works');
});

// --- 1 km mapped onto each world's scale -----------------------------------

test('metre worlds: 1 km covers the whole world', () => {
  for (const w of ['/middle-earth', '/earth-2', '/nether-realm', '/hell', '/star-wars', '/hollow-earth', '/']) {
    assert.equal(rangeCoversWorld(w), true, `${w} is smaller than the field`);
  }
  assert.equal(worldScale('/middle-earth').sizeM, 680);
  assert.equal(worldScale('/earth-2').sizeM, 1400);
  assert.equal(worldScale('/nether-realm').sizeM, 760);
});

test('planet-scale worlds take a real 1 km radius', () => {
  assert.equal(rangeCoversWorld('/earth'), false);
  assert.equal(rangeCoversWorld('/earth-3'), false);
  // Redwater: 0.009 degrees of latitude is ~1000 m.
  const d = distanceM('/earth', { x: 53.95235, y: -113.11636 }, { x: 53.96135, y: -113.11636 });
  assert.ok(d > 950 && d < 1050, `0.009 deg lat is ~1 km (got ${d})`);
  const dLon = distanceM('/earth', { x: 53.95235, y: -113.11636 }, { x: 53.95235, y: -113.10036 });
  assert.ok(dLon > 900 && dLon < 1150, `0.016 deg lon is ~1 km at Redwater (got ${dLon})`);
});

test('metre distance is Euclidean on x/z', () => {
  assert.equal(distanceM('/middle-earth', { x: 0, z: 0 }, { x: 3, z: 4 }), 5);
  assert.equal(distanceM('/middle-earth', { x: 0, z: 0 }, { x: 600, z: 800 }), 1000);
  assert.equal(distanceM('/anti-life', { x: 0, z: 0 }, { x: 1, z: 1 }), null,
    'the 2D canvas has no metres — its own decay.js rules there');
  assert.equal(distanceM('/no-such-route', { x: 0, z: 0 }, { x: 3, z: 4 }), 5,
    'unknown routes assume metres');
});

test('decay strength falls from 1 at the feet to 0 at the 1 km edge', () => {
  assert.equal(decayStrengthAt(0), 1);
  assert.equal(decayStrengthAt(500), 0.5);
  assert.equal(decayStrengthAt(1000), 0);
  assert.equal(decayStrengthAt(5000), 0);
});

// --- spots: one row per cell, live until the carrier dies -------------------

test('spot ids quantize to the 200 m grid', () => {
  const a = spotId('c1', '/middle-earth', 10, 10);
  const b = spotId('c1', '/middle-earth', 90, 90);
  assert.equal(a, b, 'same cell, same row');
  assert.notEqual(a, spotId('c1', '/middle-earth', 250, 10), 'next cell, new row');
  assert.notEqual(a, spotId('c2', '/middle-earth', 10, 10), 'other carrier, other row');
});

test('a spot lives until the carrier expiry, then it is dead ground', () => {
  const spot = createSpot({ carrierId: 'c1', world: '/middle-earth', x: 0, z: 0, expiresAt: NOW + 600000, nowMs: NOW });
  assert.equal(spot.radiusM, 50);
  assert.equal(isSpotLive(spot, NOW + 599999), true);
  assert.equal(isSpotLive(spot, NOW + 600000), false, 'dead at the carrier expiry — the reset law');
});

test('write gate: throttle + 200 m spacing', () => {
  const pos = { world: '/middle-earth', x: 0, y: 0, z: 0 };
  assert.equal(shouldWriteSpot(null, null, pos, NOW).ok, true, 'first write');
  const last = { atMs: NOW, world: '/middle-earth', x: 0, z: 0 };
  assert.equal(shouldWriteSpot(last, pos, pos, NOW + 1000).ok, false, 'throttled inside 2.5 s');
  assert.equal(shouldWriteSpot(last, pos, { ...pos, x: 100 }, NOW + 3000).ok, false,
    'moved, but under one cell');
  assert.equal(shouldWriteSpot(last, pos, { ...pos, x: 250 }, NOW + 3000).ok, true,
    'one cell on, one write');
  assert.equal(shouldWriteSpot(null, null, null, NOW).ok, false, 'no position, no write');
});

// --- contagion: passing effected ground infects, fresh 10 minutes ----------

function liveSpot(carrierId, x, z, expiresAt) {
  return createSpot({ carrierId, world: '/middle-earth', x, y: 0, z, expiresAt, nowMs: NOW });
}

test('inside a live spot field: infected', () => {
  const spots = [liveSpot('c1', 0, 0, NOW + 600000)];
  const hit = findInfection('/middle-earth', { x: 40, z: 0 }, spots, NOW, 'me');
  assert.ok(hit, '40 m inside a 50 m field infects');
  assert.equal(hit.spot.carrierId, 'c1');
  assert.equal(hit.distanceM, 40);
  assert.equal(findInfection('/middle-earth', { x: 60, z: 0 }, spots, NOW, 'me'), null,
    '60 m is past the 50 m field — no infection');
});

test('outside every live spot: not infected', () => {
  const spots = [liveSpot('c1', 0, 0, NOW + 600000)];
  assert.equal(findInfection('/middle-earth', { x: 60, z: 0 }, spots, NOW, 'me'), null);
  assert.equal(findInfection('/middle-earth', { x: 0, z: 0 }, [], NOW, 'me'), null);
});

test('expired spots never infect — the chain dies out', () => {
  const spots = [liveSpot('c1', 0, 0, NOW + 600000)];
  assert.equal(findInfection('/middle-earth', { x: 0, z: 0 }, spots, NOW + 600001, 'me'), null);
});

test('own spots never re-infect you', () => {
  const spots = [liveSpot('me', 0, 0, NOW + 600000)];
  assert.equal(findInfection('/middle-earth', { x: 0, z: 0 }, spots, NOW, 'me'), null);
});

test('nearest live spot wins', () => {
  const spots = [
    liveSpot('c1', 45, 0, NOW + 600000),
    liveSpot('c2', 10, 0, NOW + 600000),
  ];
  const hit = findInfection('/middle-earth', { x: 0, z: 0 }, spots, NOW, 'me');
  assert.equal(hit.spot.carrierId, 'c2');
});

// --- wiring: grant, heartbeat, reporting ------------------------------------

test('the Anti-Life page grants on visit', () => {
  const src = readFileSync('app/anti-life/page.jsx', 'utf8');
  assert.ok(src.includes("grantCarrier(window.localStorage, 'anti-life')"), 'grant on mount');
  assert.ok(src.includes('LINGERING:'), 'HUD shows the lingering countdown');
  assert.ok(src.includes('follows you when you leave'), 'HUD says it follows');
});

test('the heartbeat is mounted once in the root layout', () => {
  const src = readFileSync('app/layout.jsx', 'utf8');
  assert.ok(src.includes('LingeringDecayHeartbeat'), 'layout mounts the heartbeat');
  assert.ok(src.includes("from '@/components/anti-life/LingeringDecay'"), 'imported once');
});

test('the heartbeat never grants by itself — only visit or infection', () => {
  const src = readFileSync('components/anti-life/LingeringDecay.jsx', 'utf8');
  assert.ok(!src.includes("grantCarrier(window.localStorage, 'anti-life')"),
    'no visit-grant in the heartbeat');
  assert.ok(src.includes("grantCarrier(window.localStorage, 'contagion'"),
    'infection grants, with source contagion');
  assert.ok(src.includes('purgeOwnExpired'), 'expiry purges our spots');
});

test('the decay bus event name is shared', () => {
  assert.equal(POSITION_EVENT, 'olympus:decay-position');
  const beat = readFileSync('components/anti-life/LingeringDecay.jsx', 'utf8');
  assert.ok(beat.includes('POSITION_EVENT'), 'heartbeat listens on the bus');
  for (const f of ['app/nether-realm/page.jsx', 'app/middle-earth/page.jsx', 'components/earth2/Earth2World.jsx']) {
    assert.ok(readFileSync(f, 'utf8').includes('reportDecayPosition'),
      `${f} reports the walker`);
  }
});
