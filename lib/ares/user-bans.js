// lib/ares/user-bans.js — account-level bans (server only).
//
// The allowlist is the registered users themselves: anyone who registers
// or signs in is allowed by definition, so there is no grant step to
// forget. A ban is the exception — one row here, and the account is
// refused by every API route until the keeper lifts it. The keeper's
// own account can never be banned (the route refuses it before writing).
//
// Fail-open by design, like the edge ban check: if the ban table is
// missing (SQL not run yet) or the lookup errors, the user is treated
// as not banned rather than locking everyone out.

import { serviceClient } from './server.js';

function db() {
  try {
    return serviceClient();
  } catch {
    return null;
  }
}

/** The ban row for a user, or null when the account is in good standing. */
export async function getUserBan(userId) {
  if (!userId) return null;
  const client = db();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from('ares_user_bans')
      .select('user_id, email, reason, banned_by, created_at')
      .eq('user_id', userId)
      .single();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export async function isUserBanned(userId) {
  return (await getUserBan(userId)) !== null;
}

/** All banned user ids, for flagging the registered-users list. */
export async function listBannedUserIds() {
  const client = db();
  if (!client) return new Set();
  try {
    const { data, error } = await client.from('ares_user_bans').select('user_id');
    if (error || !data) return new Set();
    return new Set(data.map((r) => r.user_id));
  } catch {
    return new Set();
  }
}
