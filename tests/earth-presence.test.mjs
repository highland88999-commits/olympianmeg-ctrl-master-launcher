// tests/earth-presence.test.mjs — Earth 1 passers-by math +
// the presence client's RLS row-id law.
//
// Two halves: (1) lib/earth/earth-presence.js — the lat/lon/yaw
// encoding, the great-circle distance, the nearby-only filter,
// and the short-arc yaw lerp. (2) lib/presence.js opts.userId —
// a signed-in rider's row id MUST be auth.uid() (the draft RLS
// policies demand it); the old sessionId-only row id would
// have been denied on every upsert. Guests keep sessionId.
//
// Run: node tests/earth-presence.test.mjs (from the repo root).
import assert from 'node:assert';
import {
  EARTH_PRESENCE_SECTOR,
  EARTH_PEER_MAX_DISTANCE_M,
  EARTH_PEER_MAX_RENDER,
  encodeEarthPos,
  decodeEarthPos,
  earthDistanceM,
  nearbyPeers,
  lerpEarthPos,
} from '../lib/earth/earth-presence.js';
import { createPresenceClient, sanitizeCharacterId } from '../lib/presence.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}
async function checkAsync(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

// --- Encoding ---
check('lat/lon/yaw round-trips through pos x/y/z', () => {
  const at = decodeEarthPos(encodeEarthPos(53.9486, -113.1067, 42));
  assert.ok(Math.abs(at.lat - 53.9486) < 1e-9, `lat ${at.lat}`);
  assert.ok(Math.abs(at.lon - (-113.1067)) < 1e-9, `lon ${at.lon}`);
  assert.equal(at.yawDeg, 42);
});

check('encoding clamps and normalizes (never a NaN or a wild lon)', () => {
  const at = decodeEarthPos(encodeEarthPos(200, 540, -30));
  assert.equal(at.lat, 90);
  assert.equal(at.lon, -180); // 540° wraps to the -180/180 seam
  assert.equal(at.yawDeg, 330);
  const nan = decodeEarthPos(encodeEarthPos(NaN, NaN, NaN));
  assert.deepEqual(nan, { lat: 0, lon: 0, yawDeg: 0 });
});

check('decoding rejects garbage (no peer renders on a guessed fix)', () => {
  assert.equal(decodeEarthPos(null), null);
  assert.equal(decodeEarthPos({ x: 'a', y: 0, z: 0 }), null);
  assert.equal(decodeEarthPos({ x: 100, y: 0, z: 0 }), null);
  assert.equal(decodeEarthPos({ x: 0, y: 200, z: 0 }), null);
  assert.equal(decodeEarthPos({ x: 0, y: 0 }), null);
});

// --- Distance ---
check('haversine: one degree of latitude is ~111,195 m', () => {
  const d = earthDistanceM(53, -113, 54, -113);
  assert.ok(Math.abs(d - 111195) < 500, `got ${d}`);
  assert.equal(earthDistanceM(53, -113, 53, -113), 0);
});

// --- Nearby filter ---
function peer(id, lat, lon, yaw = 0) {
  return { id, pos: { x: lat, y: lon, z: yaw } };
}

check('nearby-only: within 200 m, nearest first, capped at 6', () => {
  assert.equal(EARTH_PEER_MAX_DISTANCE_M, 200);
  assert.equal(EARTH_PEER_MAX_RENDER, 6);
  const mine = { lat: 53.9486, lon: -113.1067 };
  const peers = [
    peer('far', 53.9586, -113.1067), // ~1.1 km — out
    peer('near1', 53.9487, -113.1067), // ~11 m
    peer('near2', 53.9490, -113.1067), // ~44 m
    peer('bad', null, null), // undecodable — dropped
  ];
  for (let i = 0; i < 8; i++) peers.push(peer(`crowd${i}`, 53.9486 + 0.0002 * (i + 1), -113.1067));
  const near = nearbyPeers(peers, mine.lat, mine.lon);
  assert.equal(near.length, 6, 'cap wins over the crowd');
  assert.equal(near[0].peer.id, 'near1', 'nearest first');
  assert.ok(!near.some((n) => n.peer.id === 'far'), 'far peer excluded');
  assert.ok(!near.some((n) => n.peer.id === 'bad'), 'undecodable peer excluded');
  assert.ok(near.every((n) => n.distanceM <= 200), 'all within range');
});

// --- Lerp ---
check('lerp moves toward the fix, frame-rate independent', () => {
  const from = { lat: 53, lon: -113, yawDeg: 10 };
  const to = { lat: 54, lon: -112, yawDeg: 20 };
  const mid = lerpEarthPos(from, to, 0.25, 4);
  assert.ok(mid.lat > 53 && mid.lat < 54, 'lat lerps');
  assert.ok(mid.yawDeg > 10 && mid.yawDeg < 20, 'yaw lerps');
  const still = lerpEarthPos(from, to, 0, 4);
  assert.deepEqual(still, from, 'zero dt does not move');
});

check('yaw lerps along the SHORT arc across 0°/360° (never the long spin)', () => {
  const from = { lat: 53, lon: -113, yawDeg: 350 };
  const to = { lat: 53, lon: -113, yawDeg: 10 };
  const mid = lerpEarthPos(from, to, 0.25, 4);
  assert.ok(mid.yawDeg > 350 || mid.yawDeg < 10, `short arc, got ${mid.yawDeg}`);
  assert.ok(Math.abs(((mid.yawDeg - 350 + 540) % 360) - 180) < 180, 'moves toward 10, not away');
});

check('Earth presence sector is argo:earth', () => {
  assert.equal(EARTH_PRESENCE_SECTOR, 'argo:earth');
});

check('extension character ids pass the presence slug guard', () => {
  assert.equal(sanitizeCharacterId('x-me-wizard'), 'x-me-wizard');
  assert.equal(sanitizeCharacterId('q020-neo'), 'q020-neo');
  assert.equal(sanitizeCharacterId('not a slug!'), null);
});

// --- RLS row id (fake supabase capturing the query chain) ---
function fakeSupabase() {
  const calls = { upserts: [], deletes: [], selects: [] };
  // Chainable select stub: eq/neq/gt/order/limit return the chain,
  // and awaiting the chain resolves { data: [], error: null }.
  const chain = {
    eq() { return chain; },
    neq(k, v) { calls.selects.push({ neq: [k, v] }); return chain; },
    gt() { return chain; },
    order() { return chain; },
    limit() { return chain; },
    then(resolve) { resolve({ data: [], error: null }); },
  };
  return {
    calls,
    from() {
      return {
        upsert(row) { calls.upserts.push(row); return Promise.resolve({ error: null }); },
        select() { return chain; },
        delete() {
          return { eq(k, v) { calls.deletes.push({ [k]: v }); return Promise.resolve({ error: null }); } };
        },
      };
    },
  };
}

await checkAsync('signed-in row id is auth.uid(), not the device session id', async () => {
  const fake = fakeSupabase();
  const client = createPresenceClient(fake, {
    sector: 'argo:earth',
    sessionId: 'device-session-123',
    userId: 'auth-uid-456',
    getState: () => ({ pos: { x: 53, y: -113, z: 0 }, vehicle: 'wedge-supercar' }),
  });
  assert.equal(client.rowId, 'auth-uid-456');
  await client.join();
  assert.equal(fake.calls.upserts.length, 1);
  assert.equal(fake.calls.upserts[0].id, 'auth-uid-456', 'upsert must carry auth.uid() or RLS denies it');
  await client.leave();
  assert.equal(fake.calls.deletes.length, 1);
  assert.equal(fake.calls.deletes[0].id, 'auth-uid-456', 'delete must target the same row');
});

await checkAsync('guest row id stays the device session id (no userId)', async () => {
  const fake = fakeSupabase();
  const client = createPresenceClient(fake, {
    sector: 'argo:earth',
    sessionId: 'device-session-123',
    getState: () => ({ pos: { x: 53, y: -113, z: 0 } }),
  });
  assert.equal(client.rowId, 'device-session-123');
  await client.join();
  assert.equal(fake.calls.upserts[0].id, 'device-session-123');
  await client.leave(); // stops the poll interval, or node hangs
});

await checkAsync('poll excludes our own row id (signed-in or guest)', async () => {
  const fake = fakeSupabase();
  const client = createPresenceClient(fake, {
    sector: 'argo:earth',
    sessionId: 'device-session-123',
    userId: 'auth-uid-456',
    getState: () => ({}),
  });
  await client.join();
  const neq = fake.calls.selects.find((s) => s.neq && s.neq[0] === 'id');
  assert.ok(neq, 'poll must filter by id');
  assert.equal(neq.neq[1], 'auth-uid-456', 'poll must exclude the RLS row id, not the session id');
  await client.leave(); // stops the poll interval, or node hangs
});

console.log(`earth-presence: ${passed} checks passed`);
