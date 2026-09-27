// World Engine — server-only helpers (never import from client components).
//
// - The service-role client is created lazily, so `next build` and local
//   runs never crash when the env vars are absent.
// - Auth: the client sends `Authorization: Bearer <access_token>`; we verify
//   it with the service-role client and get the real user id.

let _admin = null;

export async function getAdminClient() {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  const { createClient } = await import('@supabase/supabase-js');
  _admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  return _admin;
}

/** Verify the request's Bearer token. Returns { user } or { error, status }. */
export async function getUserFromRequest(req) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return { error: 'Sign in to use this feature.', status: 401 };

  const admin = await getAdminClient();
  if (!admin) return { error: 'The service is not configured yet.', status: 503 };

  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return { error: 'Your session has expired. Please sign in again.', status: 401 };
  return { user };
}
