// lib/notifications.js — isomorphic helpers for the notification inbox.
// Pure validation runs on the server; client fetch helpers run in the browser
// (token is passed in so this module never touches window at import time).

export const NOTIFICATION_TYPES = ['friend_request', 'group_invite', 'system', 'achievement'];

export const ACTIONABLE_TYPES = ['friend_request', 'group_invite'];

// Types a signed-in user may SEND to another user through POST /api/notifications.
// 'system' and 'achievement' are server-issued only (service-role client).
export const USER_SENDABLE_TYPES = ['friend_request', 'group_invite'];

export function validateNotificationCreate(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be an object.' };
  const { recipient_id, type, title, body: text, meta } = body;
  if (typeof recipient_id !== 'string' || !recipient_id) {
    return { ok: false, error: 'recipient_id is required.' };
  }
  if (!USER_SENDABLE_TYPES.includes(type)) {
    return { ok: false, error: `type must be one of: ${USER_SENDABLE_TYPES.join(', ')}.` };
  }
  if (typeof title !== 'string' || !title.trim() || title.length > 120) {
    return { ok: false, error: 'title is required (max 120 chars).' };
  }
  if (text != null && (typeof text !== 'string' || text.length > 500)) {
    return { ok: false, error: 'body must be a string (max 500 chars).' };
  }
  if (meta != null && (typeof meta !== 'object' || Array.isArray(meta))) {
    return { ok: false, error: 'meta must be an object.' };
  }
  return {
    ok: true,
    value: {
      recipient_id,
      type,
      title: title.trim().slice(0, 120),
      body: (text || '').slice(0, 500),
      meta: meta || {},
    },
  };
}

export function validateNotificationPatch(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be an object.' };
  const { action, ids } = body;
  if (!['read', 'read_all', 'accept', 'decline'].includes(action)) {
    return { ok: false, error: 'action must be read, read_all, accept, or decline.' };
  }
  if (action !== 'read_all') {
    if (!Array.isArray(ids) || !ids.length || ids.length > 100) {
      return { ok: false, error: 'ids must be a non-empty array (max 100).' };
    }
    if (!ids.every((id) => typeof id === 'string' && id.length > 0)) {
      return { ok: false, error: 'ids must be strings.' };
    }
  }
  return { ok: true, value: { action, ids: action === 'read_all' ? [] : ids } };
}

// --- Client helpers (browser only; pass the supabase access token) ---

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

export function fetchNotifications(token) {
  return authed(token, '/api/notifications');
}

export function markNotificationsRead(token, ids) {
  return authed(token, '/api/notifications', {
    method: 'PATCH',
    body: JSON.stringify({ action: ids === 'all' ? 'read_all' : 'read', ids: ids === 'all' ? [] : ids }),
  });
}

export function respondToNotification(token, id, decision) {
  return authed(token, '/api/notifications', {
    method: 'PATCH',
    body: JSON.stringify({ action: decision === 'accept' ? 'accept' : 'decline', ids: [id] }),
  });
}

export function sendNotification(token, { recipient_id, type, title, body, meta }) {
  return authed(token, '/api/notifications', {
    method: 'POST',
    body: JSON.stringify({ recipient_id, type, title, body, meta }),
  });
}
