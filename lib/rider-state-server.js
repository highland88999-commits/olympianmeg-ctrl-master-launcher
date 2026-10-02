// lib/rider-state-server.js
// Server-only core for app/api/rider/state. No Next.js imports: the route
// is a thin wiring layer (auth + service-role client) so this stays
// headless-testable. getRiderState/saveRiderState take injected deps
// { db, user } — user is derived server-side from the access token
// (requireUser in the route), never asserted by the client.

import { RIDER_REALMS } from './rider-state.js';

export const TABLE = 'rider_state';
const MAX_COORD = 1e6; // hub world units; the scene spans hundreds

/** Validate a client-supplied POST body. Never trusts more than it checks. */
export function validateRiderPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Body must be a JSON object.' };
  }
  const { x, y, z, realm } = body;
  for (const [key, value] of [
    ['x', x],
    ['y', y],
    ['z', z],
  ]) {
    if (!Number.isFinite(value)) {
      return { ok: false, error: `${key} must be a finite number.` };
    }
    if (Math.abs(value) > MAX_COORD) {
      return { ok: false, error: `${key} is out of range.` };
    }
  }
  const cleanRealm =
    typeof realm === 'string' && RIDER_REALMS.includes(realm) ? realm : 'hub';
  return { ok: true, value: { x, y, z, realm: cleanRealm } };
}

/** GET core: return the caller's rider_state row, or null when none exists. */
export async function getRiderState({ db, user }) {
  if (!user) {
    return { status: 401, body: { ok: false, error: 'Sign in to load your rider state.' } };
  }
  const { data, error } = await db
    .from(TABLE)
    .select('x,y,z,realm,updated_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    return { status: 500, body: { ok: false, error: 'Could not load your rider state.' } };
  }
  return { status: 200, body: { ok: true, state: data || null } };
}

/** POST core: upsert the caller's dismount position. One row per account. */
export async function saveRiderState({ db, user }, payload) {
  if (!user) {
    return { status: 401, body: { ok: false, error: 'Sign in to save your rider state.' } };
  }
  const clean = validateRiderPayload(payload);
  if (!clean.ok) {
    return { status: 400, body: { ok: false, error: clean.error } };
  }
  const { error } = await db.from(TABLE).upsert(
    {
      user_id: user.id,
      x: clean.value.x,
      y: clean.value.y,
      z: clean.value.z,
      realm: clean.value.realm,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) {
    return { status: 500, body: { ok: false, error: 'Could not save your rider state.' } };
  }
  return { status: 200, body: { ok: true } };
}
