// lib/muse/server.js — server-only helpers for the Muse portal APIs.
// Never import into client code: uses the service-role key.
import { createClient } from '@supabase/supabase-js';
import { OWNER_EMAIL } from '../owner.js';

let admin = null;

export function getAdminClient() {
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Supabase is not configured (missing URL or service-role key).');
    }
    admin = createClient(url, key);
  }
  return admin;
}

// Merlin's auth user id — verified against auth.users on 2026-10-02.
// Used as the notifications recipient for new portal messages.
const MERLIN_USER_ID_FALLBACK = '44357e00-59cc-437a-b66c-adda44cc7999';

export async function merlinUserId() {
  try {
    const sb = getAdminClient();
    const { data } = await sb.auth.admin.listUsers({ perPage: 1000 });
    const hit = (data?.users || []).find(
      (u) => String(u.email || '').toLowerCase() === OWNER_EMAIL
    );
    if (hit?.id) return hit.id;
  } catch {
    // fall through to the known id
  }
  return MERLIN_USER_ID_FALLBACK;
}

export async function notifyMerlin({ title, body, meta = {} }) {
  try {
    const sb = getAdminClient();
    const recipient_id = await merlinUserId();
    await sb.from('notifications').insert({
      recipient_id,
      type: 'muse_inbox',
      title,
      body,
      meta,
    });
  } catch {
    // Notifications are best-effort; the message itself is already stored.
  }
}
