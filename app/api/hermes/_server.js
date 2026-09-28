// app/api/hermes/_server.js
// Shared server-only helpers for the Hermes API routes.
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
