// lib/earth2/shard-server.js — server-side shard state (Merlin, Nov 13).
// The aether ledger IS the shard record: a shard's collection is its
// ledger row (reason 'earth2-shard:<month>:<key>'), the rollover's
// house payment is its ledger row (reason
// 'earth2-shard-rollover:<month>', new coordinates in meta). No new
// tables — the routes read the ledger, and the month's positions are
// deterministic (lib/earth2/shard-cycle.js), the same for everyone.
//
// Server-only (service-role client). The collect route and the
// rollover route share these helpers.
import { HOUSE_WALLET_EMAIL, shardReason } from './shard-cycle.js';

/** The shard keys collected during a month (every user — the
 *  ledger rows are the shared collected state). */
export async function listCollectedShardKeys(admin, month) {
  const { data, error } = await admin
    .from('aether_ledger')
    .select('reason')
    .like('reason', `earth2-shard:${month}:%`);
  if (error) throw error;
  const prefix = `earth2-shard:${month}:`;
  return (data || [])
    .map((r) => String(r.reason || '').slice(prefix.length))
    .filter(Boolean);
}

/** The rollover ledger row for a month, or null when it hasn't run. */
export async function getRolloverRow(admin, month) {
  const { data, error } = await admin
    .from('aether_ledger')
    .select('id, meta, created_at')
    .eq('reason', `earth2-shard-rollover:${month}`)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Resolve the house (Olympus) wallet's user id by email — the
 *  same listUsers pattern lib/oracle/server.js uses for Merlin. */
export async function resolveHouseUserId(admin) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`Could not resolve the house wallet: ${error.message}`);
  const found = (data?.users || []).find(
    (u) => String(u?.email || '').toLowerCase() === HOUSE_WALLET_EMAIL,
  );
  if (!found) throw new Error('House wallet account not found.');
  return found.id;
}
