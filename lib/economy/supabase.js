// lib/economy/supabase.js
// Lazy service-role client for the gold economy. Server-only — never import
// from client components. Returns null when unconfigured so routes can
// answer with an honest 503 instead of crashing the build.

let _admin = null;
let _tried = false;

export async function getServiceClient() {
  if (_admin) return _admin;
  if (_tried) return null;
  _tried = true;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    _admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    return _admin;
  } catch {
    return null;
  }
}

/** For tests: inject a fake client. */
export function __setServiceClientForTests(client) {
  _admin = client;
  _tried = true;
}

export function __resetServiceClientForTests() {
  _admin = null;
  _tried = false;
}
