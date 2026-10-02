// tests/bike-ui.test.mjs
// Headless tests for the Tron batch (bike-ui worker):
// - FLIGHT AXIS toggle state machine
// - dismount-beside-bike offset math
// - rider-state route core (mocked auth + mocked db)
// - rider-state client helpers (stubbed fetch)
// - supabase/rider-state.sql migration shape
// - app/api/rider/state/route.js wiring (static checks)
//
// Run: node --test tests/bike-ui.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  nextFlightAxis,
  dismountPosition,
  isValidSavedState,
  fetchRiderState,
  saveRiderState,
  DISMOUNT_SIDE,
  DISMOUNT_EYE,
  RIDER_REALMS,
} from '../lib/rider-state.js';
import {
  validateRiderPayload,
  getRiderState,
  saveRiderState as saveRiderStateServer,
  TABLE,
} from '../lib/rider-state-server.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---------------------------------------------------------------------------
// 1. FLIGHT AXIS toggle state machine
// ---------------------------------------------------------------------------
describe('flight axis state machine', () => {
  it('toggles horizontal -> vertical -> horizontal', () => {
    assert.equal(nextFlightAxis('horizontal'), 'vertical');
    assert.equal(nextFlightAxis('vertical'), 'horizontal');
  });

  it('recovers to horizontal from an unknown value', () => {
    assert.equal(nextFlightAxis('sideways'), 'horizontal');
  });

  it('is an involution over two taps', () => {
    assert.equal(nextFlightAxis(nextFlightAxis('horizontal')), 'horizontal');
    assert.equal(nextFlightAxis(nextFlightAxis('vertical')), 'vertical');
  });
});

// ---------------------------------------------------------------------------
// 2. Dismount-beside-bike offset math
// ---------------------------------------------------------------------------
describe('dismountPosition', () => {
  const bike = { x: 10, y: 4, z: -60 };

  it('places the rider beside the bike at yaw 0 (offset +X, eye height +Y)', () => {
    const s = dismountPosition(bike, 0);
    assert.ok(approx(s.x, bike.x + DISMOUNT_SIDE));
    assert.ok(approx(s.y, bike.y + DISMOUNT_EYE));
    assert.ok(approx(s.z, bike.z));
  });

  it('rotates the side offset with the bike yaw (yaw=PI/2: nose +X, side -Z)', () => {
    const s = dismountPosition(bike, Math.PI / 2);
    assert.ok(approx(s.x, bike.x, 1e-6));
    assert.ok(approx(s.y, bike.y + DISMOUNT_EYE));
    assert.ok(approx(s.z, bike.z - DISMOUNT_SIDE, 1e-6));
  });

  it('rotates the side offset with the bike yaw (yaw=PI: nose -Z, side -X)', () => {
    const s = dismountPosition(bike, Math.PI);
    assert.ok(approx(s.x, bike.x - DISMOUNT_SIDE, 1e-6));
    assert.ok(approx(s.z, bike.z, 1e-6));
  });

  it('keeps a constant standoff distance from the bike', () => {
    for (const yaw of [0, 0.7, Math.PI / 2, Math.PI, 4.2]) {
      const s = dismountPosition(bike, yaw);
      const d = Math.hypot(s.x - bike.x, s.y - bike.y, s.z - bike.z);
      assert.ok(approx(d, Math.hypot(DISMOUNT_SIDE, DISMOUNT_EYE), 1e-6), `yaw=${yaw}`);
    }
  });

  it('never mutates the input position', () => {
    const before = { ...bike };
    dismountPosition(bike, 1.3);
    assert.deepEqual(bike, before);
  });

  it('defaults are sane: side 3.4 clears the trim pods, eye 1.7 is standing height', () => {
    assert.equal(DISMOUNT_SIDE, 3.4);
    assert.equal(DISMOUNT_EYE, 1.7);
  });
});

describe('isValidSavedState', () => {
  it('accepts a well-formed saved row', () => {
    assert.equal(isValidSavedState({ x: 1, y: 2, z: 3, realm: 'hub' }), true);
  });

  it('rejects NaN / Infinity / missing coords', () => {
    assert.equal(isValidSavedState({ x: NaN, y: 2, z: 3, realm: 'hub' }), false);
    assert.equal(isValidSavedState({ x: 1, y: Infinity, z: 3, realm: 'hub' }), false);
    assert.equal(isValidSavedState({ x: 1, y: 2, realm: 'hub' }), false);
    assert.equal(isValidSavedState(null), false);
  });

  it('rejects unknown realms', () => {
    assert.equal(isValidSavedState({ x: 1, y: 2, z: 3, realm: 'earth' }), false);
    assert.deepEqual(RIDER_REALMS, ['hub']);
  });
});

// ---------------------------------------------------------------------------
// 3. Server payload validation
// ---------------------------------------------------------------------------
describe('validateRiderPayload', () => {
  it('accepts finite coords and a known realm', () => {
    const r = validateRiderPayload({ x: 10, y: 4.5, z: -60, realm: 'hub' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, { x: 10, y: 4.5, z: -60, realm: 'hub' });
  });

  it('defaults a junk realm to hub rather than storing attacker input', () => {
    const r = validateRiderPayload({ x: 1, y: 2, z: 3, realm: 'hax' });
    assert.equal(r.ok, true);
    assert.equal(r.value.realm, 'hub');
  });

  it('rejects non-finite coords, missing body, and out-of-range values', () => {
    assert.equal(validateRiderPayload({ x: NaN, y: 2, z: 3 }).ok, false);
    assert.equal(validateRiderPayload({ x: 1, y: 2, z: Infinity }).ok, false);
    assert.equal(validateRiderPayload({ x: '1', y: 2, z: 3 }).ok, false);
    assert.equal(validateRiderPayload({ x: 1, y: 2 }).ok, false);
    assert.equal(validateRiderPayload(null).ok, false);
    assert.equal(validateRiderPayload('nope').ok, false);
    assert.equal(validateRiderPayload({ x: 2e9, y: 2, z: 3 }).ok, false);
  });
});

// ---------------------------------------------------------------------------
// 4. Route core with mocked auth (user object) and mocked db
// ---------------------------------------------------------------------------
function makeDb({ row = null, selectError = null, upsertError = null } = {}) {
  const calls = [];
  const chain = {
    select(cols) {
      calls.push(['select', cols]);
      return chain;
    },
    eq(col, val) {
      calls.push(['eq', col, val]);
      return chain;
    },
    async maybeSingle() {
      calls.push(['maybeSingle']);
      return selectError ? { data: null, error: selectError } : { data: row, error: null };
    },
    async upsert(values, opts) {
      calls.push(['upsert', values, opts]);
      return upsertError ? { error: upsertError } : { error: null };
    },
  };
  return {
    from(table) {
      calls.push(['from', table]);
      return chain;
    },
    calls,
  };
}

const USER = { id: '11111111-2222-3333-4444-555555555555' };

describe('getRiderState (mocked auth + db)', () => {
  it('401s when there is no authenticated user', async () => {
    const db = makeDb();
    const res = await getRiderState({ db, user: null });
    assert.equal(res.status, 401);
    assert.equal(res.body.ok, false);
    assert.equal(db.calls.length, 0); // never touches the db unsigned
  });

  it('returns the caller’s row, scoped by server-derived user_id', async () => {
    const row = { x: 10, y: 5.7, z: -60, realm: 'hub', updated_at: '2026-10-02T00:00:00Z' };
    const db = makeDb({ row });
    const res = await getRiderState({ db, user: USER });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, state: row });
    assert.deepEqual(
      db.calls.filter((c) => c[0] === 'eq'),
      [['eq', 'user_id', USER.id]]
    );
    assert.deepEqual(
      db.calls.filter((c) => c[0] === 'from'),
      [['from', TABLE]]
    );
  });

  it('returns state: null when the account has no row yet', async () => {
    const db = makeDb({ row: null });
    const res = await getRiderState({ db, user: USER });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, state: null });
  });

  it('500s honestly on a db error', async () => {
    const db = makeDb({ selectError: new Error('boom') });
    const res = await getRiderState({ db, user: USER });
    assert.equal(res.status, 500);
    assert.equal(res.body.ok, false);
  });
});

describe('saveRiderState (mocked auth + db)', () => {
  it('401s when there is no authenticated user and never writes', async () => {
    const db = makeDb();
    const res = await saveRiderStateServer({ db, user: null }, { x: 1, y: 2, z: 3 });
    assert.equal(res.status, 401);
    assert.equal(db.calls.length, 0);
  });

  it('upserts with the SERVER-derived user_id (no client self-assertion)', async () => {
    const db = makeDb();
    const res = await saveRiderStateServer({ db, user: USER }, { x: 10, y: 5.7, z: -60, realm: 'hub' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    const up = db.calls.find((c) => c[0] === 'upsert');
    assert.ok(up, 'upsert was called');
    assert.equal(up[1].user_id, USER.id);
    assert.equal(up[1].x, 10);
    assert.equal(up[1].realm, 'hub');
    assert.deepEqual(up[2], { onConflict: 'user_id' });
  });

  it('ignores any user_id smuggled in the payload', async () => {
    const db = makeDb();
    await saveRiderStateServer(
      { db, user: USER },
      { x: 1, y: 2, z: 3, user_id: 'attacker-chosen-id' }
    );
    const up = db.calls.find((c) => c[0] === 'upsert');
    assert.equal(up[1].user_id, USER.id);
  });

  it('400s on invalid payload without touching the db', async () => {
    const db = makeDb();
    const res = await saveRiderStateServer({ db, user: USER }, { x: NaN, y: 2, z: 3 });
    assert.equal(res.status, 400);
    assert.equal(db.calls.length, 0);
  });

  it('500s honestly on a db error', async () => {
    const db = makeDb({ upsertError: new Error('boom') });
    const res = await saveRiderStateServer({ db, user: USER }, { x: 1, y: 2, z: 3 });
    assert.equal(res.status, 500);
    assert.equal(res.body.ok, false);
  });
});

// ---------------------------------------------------------------------------
// 5. Client fetch helpers (stubbed fetch)
// ---------------------------------------------------------------------------
describe('client fetch helpers', () => {
  it('fetchRiderState returns the row and sends the Bearer token', async () => {
    const seen = {};
    globalThis.fetch = async (url, opts) => {
      seen.url = url;
      seen.auth = opts.headers.Authorization;
      return { ok: true, json: async () => ({ ok: true, state: { x: 1, y: 2, z: 3, realm: 'hub' } }) };
    };
    const s = await fetchRiderState(async () => 'tok-123');
    assert.deepEqual(s, { x: 1, y: 2, z: 3, realm: 'hub' });
    assert.equal(seen.url, '/api/rider/state');
    assert.equal(seen.auth, 'Bearer tok-123');
  });

  it('fetchRiderState returns null without a token and never fetches', async () => {
    let fetched = false;
    globalThis.fetch = async () => {
      fetched = true;
      throw new Error('should not happen');
    };
    assert.equal(await fetchRiderState(async () => null), null);
    assert.equal(fetched, false);
  });

  it('fetchRiderState returns null on network failure', async () => {
    globalThis.fetch = async () => {
      throw new Error('offline');
    };
    assert.equal(await fetchRiderState(async () => 'tok'), null);
  });

  it('saveRiderState POSTs coords + realm with the Bearer token', async () => {
    const seen = {};
    globalThis.fetch = async (url, opts) => {
      seen.url = url;
      seen.method = opts.method;
      seen.auth = opts.headers.Authorization;
      seen.body = JSON.parse(opts.body);
      return { ok: true };
    };
    const ok = await saveRiderState({ x: 10, y: 5.7, z: -60 }, async () => 'tok-9', 'hub');
    assert.equal(ok, true);
    assert.equal(seen.url, '/api/rider/state');
    assert.equal(seen.method, 'POST');
    assert.equal(seen.auth, 'Bearer tok-9');
    assert.deepEqual(seen.body, { x: 10, y: 5.7, z: -60, realm: 'hub' });
  });

  it('saveRiderState resolves false (never throws) without a token', async () => {
    assert.equal(await saveRiderState({ x: 1, y: 2, z: 3 }, async () => null), false);
  });
});

// ---------------------------------------------------------------------------
// 6. Migration shape
// ---------------------------------------------------------------------------
describe('supabase/rider-state.sql', () => {
  const sql = readFileSync(join(repo, 'supabase', 'rider-state.sql'), 'utf8');
  const lower = sql.toLowerCase();

  it('creates the table idempotently with the required columns', () => {
    assert.match(lower, /create table if not exists public\.rider_state/);
    assert.match(lower, /user_id uuid primary key/);
    assert.match(lower, /references auth\.users\(id\) on delete cascade/);
    assert.match(lower, /x double precision/);
    assert.match(lower, /y double precision/);
    assert.match(lower, /z double precision/);
    assert.match(lower, /realm text/);
    assert.match(lower, /updated_at timestamptz/);
  });

  it('enables RLS with an owner-read policy only', () => {
    assert.match(lower, /enable row level security/);
    assert.match(lower, /create policy rider_state_owner_read/);
    assert.match(lower, /for select/);
    assert.match(lower, /auth\.uid\(\) = user_id/);
  });

  it('grants NO client write policies (writes go through the service-role route)', () => {
    assert.ok(!lower.includes('for insert'), 'must not contain an INSERT policy');
    assert.ok(!lower.includes('for update'), 'must not contain an UPDATE policy');
    assert.ok(!lower.includes('for delete'), 'must not contain a DELETE policy');
  });
});

// ---------------------------------------------------------------------------
// 7. Route wiring (static checks on route.js)
// ---------------------------------------------------------------------------
describe('app/api/rider/state/route.js', () => {
  const src = readFileSync(join(repo, 'app', 'api', 'rider', 'state', 'route.js'), 'utf8');

  it('uses the service-role key server-side and derives the user from the token', () => {
    assert.ok(src.includes('SUPABASE_SERVICE_ROLE_KEY'), 'service-role key present');
    assert.ok(src.includes('requireUser'), 'requireUser present');
    assert.ok(src.includes('auth.getUser(token)'), 'user derived from the bearer token');
  });

  it('never reads user_id from the client body', () => {
    assert.ok(!src.includes('body.user_id'), 'no client-supplied user_id');
    assert.ok(!src.includes("['user_id']"), 'no client-supplied user_id');
  });

  it('exposes GET and POST', () => {
    assert.ok(src.includes('export async function GET('));
    assert.ok(src.includes('export async function POST('));
  });
});
