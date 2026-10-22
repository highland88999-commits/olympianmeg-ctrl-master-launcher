// lib/omega-comms/core.js
// Pure, headless-testable core for Omega Comms — the Communications
// Array ported from Merlin's Communications-Array repo (MIT, his own
// code). No DOM, no network: the React feeds in
// components/omega-comms/ do the Supabase calls and lean on these
// helpers for every decision that can be tested.
//
// Model (unchanged from the source): three feeds — Global, Direct
// (person-to-person, what the source calls P2P), and Squad — stored
// as rows in Supabase tables and delivered live by Supabase Realtime
// postgres_changes. There is no WebRTC/libp2p transport in the
// source; "p2p" names the direct-message feed. Every row is
// namespaced by repo_id; inside Olympus the namespace is the single
// constant below (the source ran one comms space per ecosystem node;
// Olympus is one node).
//
// Identity: rows carry auth.users ids. Display names resolve from
// public.profiles (the launcher's profile system) — the source's
// user_profiles table does not exist here.

export const OMEGA_COMMS_REPO_ID = 'olympus';

export const COMMS_TABLES = {
  global: 'global_chat',
  p2p: 'p2p_chat',
  squads: 'squads',
  squadMembers: 'squad_members',
  squadChat: 'squad_chat',
};

export const COMMS_TABS = [
  { id: 'global', label: 'GLOBAL' },
  { id: 'p2p', label: 'DIRECT' },
  { id: 'squads', label: 'SQUAD' },
];

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_USERNAME_LENGTH = 64;

/** Strip control characters and cap length — display-bound strings only. */
export function sanitizeLabel(value, max = MAX_USERNAME_LENGTH) {
  if (value == null) return '';
  return String(value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

/**
 * Validate an outgoing message body. Returns { ok, text } or
 * { ok: false, reason } — never silently truncates a user's words.
 */
export function validateMessageText(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: 'too-long' };
  return { ok: true, text };
}

/**
 * The source stamped every message with the environment it was sent
 * from (app title + hostname) and shows it under the sender's name —
 * provenance, so a message from another node of the ecosystem says
 * where it came from. Inside Olympus the values are Olympus's own
 * title/host; the stamp still travels with the row.
 */
export function buildEnvStamp({ title, hostname } = {}) {
  return {
    app_name: sanitizeLabel(title, 120) || 'Olympus',
    origin_url: sanitizeLabel(hostname, 120) || 'olympusverse.com',
  };
}

/** Row for global_chat / p2p_chat / squad_chat inserts. Null when invalid. */
export function buildMessageRow({ repoId, senderId, receiverId, squadId, text, env } = {}) {
  const check = validateMessageText(text);
  if (!check.ok || !senderId) return null;
  const stamp = env && typeof env === 'object' ? env : buildEnvStamp();
  const row = {
    repo_id: repoId || OMEGA_COMMS_REPO_ID,
    sender_id: senderId,
    message: check.text,
    app_name: stamp.app_name,
    origin_url: stamp.origin_url,
  };
  if (receiverId) row.receiver_id = receiverId;
  if (squadId) row.squad_id = squadId;
  return row;
}

/** True when a p2p row belongs to the conversation between two users. */
export function isConversationMessage(rec, userId, contactId) {
  if (!rec || !userId || !contactId) return false;
  return (
    (rec.sender_id === userId && rec.receiver_id === contactId) ||
    (rec.sender_id === contactId && rec.receiver_id === userId)
  );
}

/**
 * Unique contacts from p2p rows, most recent conversation first.
 * Rows must arrive newest-first (the feed orders by created_at desc);
 * the first sighting of the other party wins, exactly as the source
 * derived its contact list.
 */
export function deriveContacts(rows, userId) {
  const seen = new Map();
  for (const row of rows || []) {
    if (!row) continue;
    const contactId = row.sender_id === userId ? row.receiver_id : row.sender_id;
    if (!contactId || contactId === userId) continue;
    if (!seen.has(contactId)) seen.set(contactId, { id: contactId });
  }
  return Array.from(seen.values());
}

/** Ids of messages addressed to userId that have not been read yet. */
export function unreadMessageIds(rows, userId) {
  return (rows || [])
    .filter((msg) => msg && msg.receiver_id === userId && msg.read_at == null)
    .map((msg) => msg.id)
    .filter(Boolean);
}

/**
 * Flatten squad_members join rows ({ squad_id, squads: {...} }) into
 * the squad list the sidebar renders. Drops malformed rows.
 */
export function flattenSquadMemberships(rows) {
  const out = [];
  const seen = new Set();
  for (const rec of rows || []) {
    const squad = rec && rec.squads;
    if (!squad || !squad.id || seen.has(squad.id)) continue;
    seen.add(squad.id);
    out.push({ id: squad.id, name: squad.name || 'Unnamed squad', leader_id: squad.leader_id ?? null, repo_id: squad.repo_id ?? null });
  }
  return out;
}

/**
 * user_id -> username from public.profiles rows. Every account has a
 * personal and a business profile with distinct usernames; the
 * personal one is the display handle when both are present.
 */
export function usernameMapFromProfiles(rows) {
  const map = new Map();
  const rank = (type) => (type === 'personal' ? 0 : 1);
  const sorted = [...(rows || [])].sort((a, b) => rank(a?.type) - rank(b?.type));
  for (const row of sorted) {
    if (!row || !row.user_id || !row.username) continue;
    if (!map.has(row.user_id)) map.set(row.user_id, row.username);
  }
  return map;
}

/** Exact-username lookup normalization (profiles.username is unique). */
export function normalizeUsername(raw) {
  const name = sanitizeLabel(raw, MAX_USERNAME_LENGTH);
  return name || null;
}

/**
 * Missing-table detection, mirroring lib/phone-home/contacts: until
 * supabase/omega-comms.sql runs, PostgREST answers with PGRST205 (or
 * Postgres 42P01 surfaces through other paths) and the UI shows the
 * honest setup-pending note instead of an error dump.
 */
export function isMissingTableError(error) {
  if (!error) return false;
  const code = String(error.code || '');
  if (code === '42P01' || code === 'PGRST205') return true;
  const msg = String(error.message || '');
  return /does not exist|Could not find the table|relation .* does not exist/i.test(msg);
}

/**
 * Fold one realtime payload into a message list (the p2p feed's
 * INSERT/UPDATE/DELETE handling from the source, with insert dedupe
 * so a replayed event can never double a bubble).
 */
export function applyRealtimeEvent(messages, payload) {
  const list = Array.isArray(messages) ? messages : [];
  if (!payload) return list;
  const { eventType, new: newRec, old: oldRec } = payload;
  if (eventType === 'INSERT' && newRec && newRec.id) {
    if (list.some((m) => m.id === newRec.id)) return list;
    return [...list, newRec];
  }
  if (eventType === 'UPDATE' && newRec && newRec.id) {
    return list.map((m) => (m.id === newRec.id ? newRec : m));
  }
  if (eventType === 'DELETE' && oldRec && oldRec.id) {
    return list.filter((m) => m.id !== oldRec.id);
  }
  return list;
}
