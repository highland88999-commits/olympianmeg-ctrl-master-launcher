// lib/pvp/invites.js — Friend invites for PvP, riding OASIS rooms.
//
// Merlin's baseline: every game gets PvP, and inviting friends is the
// default path in. OASIS rooms ARE the lobbies (6-char codes, DB polling);
// this module adds the missing piece: directed invites to friends.
//
// Flow:
//   1. Host creates an OASIS room (lib/oasis/rooms.js createRoom) for a game.
//   2. Host calls createInvite() per friend -> row in `pvp_invites` (status
//      pending) + an instant Realtime broadcast on `pvp-invites:<inviteeId>`.
//   3. Invitee's InviteInbox sees it (broadcast, or the DB row on poll
//      fallback) and shows Accept / Decline.
//   4. Accept -> invite marked accepted -> invitee navigates to
//      /<game>?code=XXXXXX, which auto-joins via the game's existing
//      ?code= deep-link handler. Decline -> marked declined, host sees it.
//
// The DB row is the source of truth; the broadcast is just the doorbell.
// Invites expire after INVITE_TTL_MS (client-enforced; a janitor query can
// also run server-side). Pure helpers are headless-testable; Supabase calls
// take the client as an argument and never hard-code a connection.

export const INVITE_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const INVITE_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
};

const TABLE = 'pvp_invites';

/** Realtime broadcast channel a user listens on for incoming invites. */
export function inviteChannelFor(userId) {
  return `pvp-invites:${userId}`;
}

/** True when the invite is still actionable (pending + within TTL). */
export function isInviteFresh(invite, nowMs = Date.now()) {
  if (!invite || invite.status !== INVITE_STATUS.PENDING) return false;
  const created = new Date(invite.created_at).getTime();
  if (!Number.isFinite(created)) return false;
  return nowMs - created < INVITE_TTL_MS;
}

/** Sanitize a display name for invite UI. Never trust raw profile text. */
export function sanitizeName(raw, fallback = 'A friend') {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.replace(/[<>\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return clean || fallback;
}

// ---------------------------------------------------------------------------
// Supabase operations (client passed in; table: pvp_invites)
// ---------------------------------------------------------------------------

/**
 * Invite one friend to an OASIS room. Writes the DB row (source of truth),
 * then rings the doorbell: a Realtime broadcast to the invitee's channel.
 * Broadcast failure never fails the invite — the inbox polls the table too.
 */
export async function createInvite(supabase, { gameSlug, roomCode, inviterId, inviteeId, inviterName = '' }) {
  if (!gameSlug || !roomCode || !inviterId || !inviteeId) {
    throw new Error('createInvite needs gameSlug, roomCode, inviterId, inviteeId.');
  }
  if (inviterId === inviteeId) throw new Error('You cannot invite yourself.');
  const { data, error } = await supabase
    .from(TABLE)
    .insert([{
      game_slug: gameSlug,
      room_code: roomCode,
      inviter_id: inviterId,
      invitee_id: inviteeId,
      inviter_name: sanitizeName(inviterName),
      status: INVITE_STATUS.PENDING,
    }])
    .select()
    .single();
  if (error) throw error;
  // Doorbell — best effort only.
  try {
    const channel = supabase.channel(inviteChannelFor(inviteeId));
    await channel.subscribe();
    await channel.send({ type: 'broadcast', event: 'invite:new', payload: data });
    await supabase.removeChannel(channel);
  } catch { /* inbox polling covers it */ }
  return data;
}

/** Pending, unexpired invites addressed to a user, newest first. */
export async function listPendingInvites(supabase, userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('invitee_id', userId)
    .eq('status', INVITE_STATUS.PENDING)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return [];
  return (data || []).filter((inv) => isInviteFresh(inv));
}

/** Pending invites a user sent (so the host sees who accepted/declined). */
export async function listSentInvites(supabase, inviterId, roomCode) {
  if (!inviterId) return [];
  let query = supabase.from(TABLE).select('*').eq('inviter_id', inviterId).order('created_at', { ascending: false }).limit(20);
  if (roomCode) query = query.eq('room_code', roomCode);
  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

/**
 * Accept or decline. Only the invitee's own row can move, and only once
 * (pending -> accepted|declined). Returns the updated row, or null when the
 * invite is gone/stale/already answered.
 */
export async function respondInvite(supabase, inviteId, userId, accept) {
  if (!inviteId || !userId) return null;
  const { data: invite } = await supabase.from(TABLE).select('*').eq('id', inviteId).single();
  if (!invite || invite.invitee_id !== userId || !isInviteFresh(invite)) return null;
  const status = accept ? INVITE_STATUS.ACCEPTED : INVITE_STATUS.DECLINED;
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status, responded_at: new Date().toISOString() })
    .eq('id', inviteId)
    .eq('status', INVITE_STATUS.PENDING)
    .select()
    .single();
  if (error) return null;
  return data;
}

/** Host cancels an unanswered invite. */
export async function cancelInvite(supabase, inviteId, inviterId) {
  if (!inviteId || !inviterId) return false;
  const { error } = await supabase
    .from(TABLE)
    .update({ status: INVITE_STATUS.CANCELLED, responded_at: new Date().toISOString() })
    .eq('id', inviteId)
    .eq('inviter_id', inviterId)
    .eq('status', INVITE_STATUS.PENDING);
  return !error;
}

/**
 * Listen for incoming invites on the user's channel. Calls onInvite(invite).
 * Returns an unsubscribe function. The caller should ALSO poll
 * listPendingInvites on an interval — broadcast is instant when Realtime is
 * up, the poll is the honest fallback when it is not.
 */
export function subscribeInvites(supabase, userId, onInvite) {
  if (!supabase || !userId || typeof onInvite !== 'function') return () => {};
  let channel = null;
  let stopped = false;
  try {
    channel = supabase.channel(inviteChannelFor(userId));
    channel.on('broadcast', { event: 'invite:new' }, ({ payload }) => {
      if (!stopped && payload && isInviteFresh(payload)) onInvite(payload);
    });
    channel.subscribe();
  } catch {
    channel = null;
  }
  return () => {
    stopped = true;
    if (channel) { try { supabase.removeChannel(channel); } catch { /* noop */ } }
  };
}
