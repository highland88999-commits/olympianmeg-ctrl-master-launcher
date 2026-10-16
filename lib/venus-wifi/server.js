// lib/venus-wifi/server.js
// Server-only helpers for the Venus WiFi routes. Never import from
// client components.
//
// Access pattern (same shape as the ORACLE / wallet features):
//  * The venus_wifi_spots table has RLS on and NO public policies, so
//    direct PostgREST access is deny-all. Every read and write flows
//    through these routes with the service client.
//  * Reads select PUBLIC_SPOT_COLUMNS — an explicit list that omits
//    contributor_id — so who logged a spot can never leak. Contributions
//    are published anonymously: network name + location only.
//  * Writes require a signed-in user (Bearer token), verified here.

import { getServiceClient } from '@/lib/economy/supabase';
import { expiryCutoffIso } from './spots.js';

export { getServiceClient };

// The explicit public column list. contributor_id is private, forever.
export const PUBLIC_SPOT_COLUMNS =
  'id, ssid, open_free, lat, lng, note, confirmations, first_seen, last_confirmed, updated_at';

const MAX_ROWS = 10000; // community-map scale guard for JS-side geo math

/** Require a signed-in user. Throws with .status (401) like the wallet gate. */
export async function requireUser(req, admin) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    const e = new Error('Sign in to add to the map.');
    e.status = 401;
    throw e;
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    const e = new Error('Your session has expired. Please sign in again.');
    e.status = 401;
    throw e;
  }
  return data.user;
}

/** All live (not expired) spots, public columns only, freshest first. */
export async function fetchLiveSpots(admin, now = Date.now()) {
  const { data, error } = await admin
    .from('venus_wifi_spots')
    .select(PUBLIC_SPOT_COLUMNS)
    .gte('last_confirmed', expiryCutoffIso(now))
    .order('last_confirmed', { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw new Error('Could not load the WiFi map.');
  return data || [];
}

/** Candidate rows for the duplicate merge: same SSID, any age. */
export async function fetchMergeCandidates(admin, ssid) {
  // Escape ilike wildcards so an SSID containing % or _ matches literally.
  const pattern = String(ssid).replace(/[%_\\]/g, (c) => `\\${c}`);
  const { data, error } = await admin
    .from('venus_wifi_spots')
    .select(PUBLIC_SPOT_COLUMNS)
    .ilike('ssid', pattern)
    .limit(500);
  if (error) throw new Error('Could not check for a duplicate spot.');
  return data || [];
}
