// lib/artemis/server.js
//
// Server-side helpers for the /api/artemis routes. Follows the launcher's
// established pattern (see lib/world-engine/server.js):
//   - service-role admin client from env (never the anon key server-side)
//   - user identity from the Authorization: Bearer <supabase access token>
//     header, validated with admin.auth.getUser
//   - Gemini calls read process.env.GEMINI_API_KEY only, server-side only.

import { createClient } from '@supabase/supabase-js';

let _admin = null;

export async function getAdminClient() {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _admin = createClient(url, key);
  return _admin;
}

export async function getUserFromRequest(req) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return { error: 'Sign in to use this feature.', status: 401 };

  const admin = await getAdminClient();
  if (!admin) return { error: 'The service is not configured yet.', status: 503 };

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) return { error: 'Your session has expired. Please sign in again.', status: 401 };
  return { user };
}

// Gemini model — the launcher's current standard (see
// app/api/medusa/generate/route.js: "Updated to gemini-3.8-flash").
export const GEMINI_MODEL = 'gemini-3.8-flash';

export function requireGeminiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error('GEMINI_API_KEY is not configured.');
    err.status = 503;
    throw err;
  }
  return key;
}

export async function geminiGenerate(apiKey, systemPrompt, userText, extraBody) {
  const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userText}` }] },
      ],
      ...(extraBody || {}),
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`);
  }
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
