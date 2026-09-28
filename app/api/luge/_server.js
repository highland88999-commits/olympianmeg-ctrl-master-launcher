// app/api/luge/_server.js
// Shared server-only helpers for the Luge API routes.
// Not a route (underscore prefix). Uses the service-role key — never import into client code.
import { createClient } from '@supabase/supabase-js';

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

export function jsonError(message, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

// Verifies the caller's Supabase session. The client sends:
//   Authorization: Bearer <access_token>  (from supabase.auth.getSession())
export async function getUserFromRequest(req) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return { error: 'Sign in to use this feature.', status: 401 };

  let adminClient;
  try {
    adminClient = getAdminClient();
  } catch {
    return { error: 'The service is not configured yet.', status: 503 };
  }

  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) return { error: 'Your session has expired. Please sign in again.', status: 401 };
  return { user };
}
