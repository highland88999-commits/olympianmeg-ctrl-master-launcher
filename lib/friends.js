// lib/friends.js — isomorphic helpers for the friends system.
// Pure validation + friendship math runs anywhere (unit-tested, no DOM).
// Server functions take the service-role client as a param — this module
// never imports server-only modules at top level, so it also loads in
// plain Node (tests) and in client components. Client fetch helpers take
// the supabase access token, like lib/notifications.js.

export const FRIENDSHIP_STATUSES = ['pending', 'accepted', 'declined', 'blocked'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

// Search input: letters, digits, underscore, dash, spaces only — this keeps
// the postgrest .or() filter syntax safe. Minimum 2 characters.
export function normalizeSearchQuery(q) {
  const s = String(q || '')
    .trim()
    .replace(/[^a-zA-Z0-9_ \-]/g, '')
    .replace(/\s+/g, ' ');
  return s.length >= 2 ? s.slice(0, 40) : '';
}

/** Canonical unordered pair key — mirrors the SQL unique index on the pair. */
export function pairKey(a, b) {
  const [x, y] = [String(a), String(b)].sort();
  return `${x}:${y}`;
}

export function validateFriendRequest(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be an object.' };
  const { addressee_id } = body;
  if (!isUuid(addressee_id)) return { ok: false, error: 'addressee_id must be a UUID.' };
  return { ok: true, value: { addressee_id } };
}

export function validateFriendRespond(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be an object.' };
  const { friendship_id, action } = body;
  if (!isUuid(friendship_id)) return { ok: false, error: 'friendship_id must be a UUID.' };
  if (action !== 'accept' && action !== 'decline') {
    return { ok: false, error: "action must be 'accept' or 'decline'." };
  }
  return { ok: true, value: { friendship_id, action } };
}

export function validateCallInvite(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be an object.' };
  const { friend_id, room_code } = body;
  if (!isUuid(friend_id)) return { ok: false, error: 'friend_id must be a UUID.' };
  if (typeof room_code !== 'string' || !/^[A-Z0-9]{6}$/.test(room_code)) {
    return { ok: false, error: 'room_code must be a 6-character code.' };
  }
  return { ok: true, value: { friend_id, room_code } };
}

/** The other party's user id in a friendship row, from my perspective. */
export function counterpartId(row, myId) {
  if (!row || !myId) return null;
  if (row.requester_id === myId) return row.addressee_id;
  if (row.addressee_id === myId) return row.requester_id;
  return null;
}

/** Pick the display profile for a user: prefer personal, fall back to any row. */
export function pickProfile(rows) {
  if (!rows || !rows.length) return null;
  return rows.find((r) => r.type === 'personal') || rows[0];
}

export function toFriendView(userId, profile) {
  return {
    user_id: userId,
    username: (profile && profile.username) || 'player',
    display_name: (profile && (profile.display_name || profile.username)) || 'Player',
    avatar_url: (profile && profile.avatar_url) || null,
  };
}

// ---------------------------------------------------------------------------
// Server functions — pass the service-role client as `admin`.
// ---------------------------------------------------------------------------

function codedError(message, status) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/** Every friendship row I am a party to. */
export async function listMyFriendships(admin, userId) {
  const { data, error } = await admin
    .from('friendships')
    .select('*')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getDisplayProfile(admin, userId) {
  const { data, error } = await admin
    .from('user_profiles')
    .select('user_id, username, display_name, avatar_url, type')
    .eq('user_id', userId);
  if (error) throw error;
  return pickProfile(data || []);
}

/**
 * Create (or rekindle) a friend request. Handles the declined-then-retry
 * case by refreshing the old row with the new requester. Throws coded
 * errors (e.status) for 403/404/409 cases.
 */
export async function createFriendRequest(admin, { requesterId, addresseeId }) {
  const mine = await listMyFriendships(admin, requesterId);
  const existing = mine.find(
    (r) => pairKey(r.requester_id, r.addressee_id) === pairKey(requesterId, addresseeId)
  );
  if (existing) {
    if (existing.status === 'accepted') throw codedError('You are already friends.', 409);
    if (existing.status === 'pending') throw codedError('A request is already pending.', 409);
    if (existing.status === 'blocked') throw codedError('This player is unavailable.', 403);
    // declined -> re-request: refresh the row with the new requester
    const { data, error } = await admin
      .from('friendships')
      .update({
        requester_id: requesterId,
        addressee_id: addresseeId,
        status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return { friendship: data, created: false, rekindled: true };
  }
  const { data, error } = await admin
    .from('friendships')
    .insert({ requester_id: requesterId, addressee_id: addresseeId, status: 'pending' })
    .select('*')
    .single();
  if (error) throw error;
  return { friendship: data, created: true, rekindled: false };
}

/** Addressee answers a pending request. Idempotent: non-pending rows pass through. */
export async function respondToFriendship(admin, { userId, friendshipId, action }) {
  const { data: row, error } = await admin
    .from('friendships')
    .select('*')
    .eq('id', friendshipId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw codedError('Friend request not found.', 404);
  if (row.addressee_id !== userId) {
    throw codedError('Only the recipient can answer this request.', 403);
  }
  if (row.status !== 'pending') return { friendship: row, changed: false };
  const { data, error: upErr } = await admin
    .from('friendships')
    .update({
      status: action === 'accept' ? 'accepted' : 'declined',
      updated_at: new Date().toISOString(),
    })
    .eq('id', friendshipId)
    .select('*')
    .single();
  if (upErr) throw upErr;
  return { friendship: data, changed: true };
}

/**
 * Full answer flow: write the friendship row, mark the matching
 * friend_request notification(s) handled+read, and notify the requester
 * when accepted. Used by POST /api/friends/respond and by the
 * notifications PATCH accept path.
 */
export async function answerFriendRequest(admin, { userId, friendshipId, action }) {
  const { friendship, changed } = await respondToFriendship(admin, { userId, friendshipId, action });
  await markFriendshipNotificationsHandled(admin, {
    userId,
    friendshipId: friendship.id,
    decision: action,
  });
  if (changed && action === 'accept') {
    const me = await getDisplayProfile(admin, userId);
    await notifyFriendAccepted(admin, {
      recipientId: friendship.requester_id,
      actorId: userId,
      actorName: (me && (me.display_name || me.username)) || 'A player',
      friendshipId: friendship.id,
    });
  }
  return { friendship, changed };
}

/** Accepted friends with display profiles. */
export async function listFriends(admin, { userId }) {
  const mine = await listMyFriendships(admin, userId);
  const ids = [
    ...new Set(
      mine
        .filter((r) => r.status === 'accepted')
        .map((r) => counterpartId(r, userId))
        .filter(Boolean)
    ),
  ];
  if (!ids.length) return [];
  const { data, error } = await admin
    .from('user_profiles')
    .select('user_id, username, display_name, avatar_url, type')
    .in('user_id', ids);
  if (error) throw error;
  const byUser = {};
  for (const p of data || []) (byUser[p.user_id] = byUser[p.user_id] || []).push(p);
  return ids.map((id) => toFriendView(id, pickProfile(byUser[id])));
}

/** Incoming pending requests with the requester's display profile. */
export async function listPendingRequests(admin, { userId }) {
  const { data, error } = await admin
    .from('friendships')
    .select('*')
    .eq('addressee_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = data || [];
  const ids = [...new Set(rows.map((r) => r.requester_id))];
  const byUser = {};
  if (ids.length) {
    const { data: profs, error: pErr } = await admin
      .from('user_profiles')
      .select('user_id, username, display_name, avatar_url, type')
      .in('user_id', ids);
    if (pErr) throw pErr;
    for (const p of profs || []) (byUser[p.user_id] = byUser[p.user_id] || []).push(p);
  }
  return rows.map((r) => ({
    friendship_id: r.id,
    created_at: r.created_at,
    requester: toFriendView(r.requester_id, pickProfile(byUser[r.requester_id])),
  }));
}

/** Player search: ilike over username/display_name, minus self and anyone
 *  already connected (any status). Returns at most 20. */
export async function searchPlayers(admin, { userId, q }) {
  const query = normalizeSearchQuery(q);
  if (!query) return [];
  const like = `%${query}%`;
  const { data, error } = await admin
    .from('user_profiles')
    .select('user_id, username, display_name, avatar_url, type')
    .or(`username.ilike.${like},display_name.ilike.${like}`)
    .limit(40);
  if (error) throw error;
  const mine = await listMyFriendships(admin, userId);
  const excluded = new Set([userId]);
  for (const r of mine) {
    const c = counterpartId(r, userId);
    if (c) excluded.add(c);
  }
  const byUser = {};
  for (const p of data || []) {
    if (excluded.has(p.user_id)) continue;
    (byUser[p.user_id] = byUser[p.user_id] || []).push(p);
  }
  return Object.keys(byUser)
    .slice(0, 20)
    .map((id) => toFriendView(id, pickProfile(byUser[id])));
}

// ---------------------------------------------------------------------------
// Notification writers (service-role inserts; notifications RLS has no client
// INSERT, so these must run server-side).
// ---------------------------------------------------------------------------

export async function notifyFriendRequest(admin, { recipientId, actorId, actorName, friendshipId }) {
  const { error } = await admin.from('notifications').insert({
    recipient_id: recipientId,
    type: 'friend_request',
    title: `${actorName} wants to be friends`,
    body: 'Accept to add them as a friend — then you can summon each other in Order 67.',
    actor_id: actorId,
    meta: { friendship_id: friendshipId, kind: 'friend-request' },
  });
  if (error) throw error;
}

export async function notifyFriendAccepted(admin, { recipientId, actorId, actorName, friendshipId }) {
  const { error } = await admin.from('notifications').insert({
    recipient_id: recipientId,
    type: 'system',
    title: `${actorName} accepted your friend request`,
    body: 'You are friends now — summon them from Order 67.',
    actor_id: actorId,
    meta: { friendship_id: friendshipId, kind: 'friend-accepted' },
  });
  if (error) throw error;
}

export async function notifyCallInvite(admin, { recipientId, actorId, actorName, roomCode }) {
  const { error } = await admin.from('notifications').insert({
    recipient_id: recipientId,
    type: 'system',
    title: 'Incoming hologram call',
    body: `${actorName} summons you to Order 67 — enter code ${roomCode} on your throne room screen.`,
    actor_id: actorId,
    meta: { kind: 'order67-invite', room_code: roomCode },
  });
  if (error) throw error;
}

/** Stamp the friend_request notification(s) for a friendship handled+read. */
export async function markFriendshipNotificationsHandled(admin, { userId, friendshipId, decision }) {
  const { data, error } = await admin
    .from('notifications')
    .select('id, meta')
    .eq('recipient_id', userId)
    .eq('type', 'friend_request');
  if (error) throw error;
  for (const n of data || []) {
    if (n.meta && n.meta.friendship_id === friendshipId) {
      const { error: upErr } = await admin
        .from('notifications')
        .update({ read: true, meta: { ...n.meta, handled: true, decision } })
        .eq('id', n.id);
      if (upErr) throw upErr;
    }
  }
}

// ---------------------------------------------------------------------------
// Client helpers (browser only; pass the supabase access token).
// ---------------------------------------------------------------------------

async function authed(token, path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

export function fetchFriends(token) {
  return authed(token, '/api/friends');
}

export function fetchPendingRequests(token) {
  return authed(token, '/api/friends/pending');
}

export function searchPlayersClient(token, q) {
  return authed(token, `/api/friends/search?q=${encodeURIComponent(q)}`);
}

export function sendFriendRequest(token, addressee_id) {
  return authed(token, '/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ addressee_id }),
  });
}

export function respondToFriendshipClient(token, friendship_id, action) {
  return authed(token, '/api/friends/respond', {
    method: 'POST',
    body: JSON.stringify({ friendship_id, action }),
  });
}

export function sendCallInvite(token, friend_id, room_code) {
  return authed(token, '/api/friends/invite', {
    method: 'POST',
    body: JSON.stringify({ friend_id, room_code }),
  });
}
