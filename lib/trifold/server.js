// lib/trifold/server.js
// Server-only helpers for TRIFOLD routes: service client, buddy auth,
// settings access. Never import from client components.

import { getServiceClient } from '@/lib/economy/supabase';
import { decryptApiKey } from './crypto.js';

export { getServiceClient };

/**
 * Load trifold_settings (single row, id=1). Returns null when unconfigured.
 * NEVER includes the plaintext API key — use getBuddyApiKey() for that.
 */
export async function getSettings(admin) {
  const { data, error } = await admin
    .from('trifold_settings')
    .select('id, buddy_email, buddy_user_id, ai_provider, rotation_index, rotation_log, updated_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error('Could not load newsletter settings.');
  return data || null;
}

/** Raw settings row including the encrypted key (service-side only). */
export async function getSettingsRaw(admin) {
  const { data, error } = await admin
    .from('trifold_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error('Could not load newsletter settings.');
  return data || null;
}

/**
 * Resolve the editor's user ID: settings.buddy_user_id wins; falls back to
 * the TRIFOLD_EDITOR_USER_ID env var (bootstrap before the buddy is set).
 */
export async function getEditorUserId(admin) {
  const s = await getSettings(admin);
  if (s?.buddy_user_id) return s.buddy_user_id;
  return process.env.TRIFOLD_EDITOR_USER_ID || '';
}

/**
 * Buddy gate: the caller must be signed in AND be the designated editor.
 * Throws with .status for the route to answer 401/403.
 * Server-side account-ID check — hiding buttons is not the enforcement.
 */
export async function requireBuddy(req, admin) {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    const e = new Error('Auth is not configured.');
    e.status = 503;
    throw e;
  }
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    const e = new Error('Sign in to continue.');
    e.status = 401;
    throw e;
  }
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    const e = new Error('Sign in to continue.');
    e.status = 401;
    throw e;
  }
  const editorId = await getEditorUserId(admin);
  if (!editorId || data.user.id !== editorId) {
    const e = new Error('Only the newsletter editor can do that.');
    e.status = 403;
    throw e;
  }
  return data.user;
}

/**
 * Decrypt the buddy's AI key for a single generation call.
 * Returns { provider, apiKey } or throws when not configured.
 */
export async function getBuddyAiCredentials(admin) {
  const raw = await getSettingsRaw(admin);
  if (!raw?.ai_api_key_enc) throw new Error('The editor has not added an AI API key yet.');
  const apiKey = await decryptApiKey(raw.ai_api_key_enc);
  return { provider: raw.ai_provider || 'openai', apiKey };
}

/** Next free issue number (max+1), for publish time. */
export async function nextIssueNumber(admin) {
  const { data } = await admin
    .from('trifold_editions')
    .select('issue_number')
    .not('issue_number', 'is', null)
    .order('issue_number', { ascending: false })
    .limit(1);
  const max = data && data[0] ? Number(data[0].issue_number) || 0 : 0;
  return max + 1;
}
