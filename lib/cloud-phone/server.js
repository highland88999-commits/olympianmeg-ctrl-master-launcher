// Cloud Phone — shared server plumbing for the cloud-phone API routes.
// Server-only: never import from client components.
//
// Auth model: the client sends the Supabase session access token as
// `Authorization: Bearer <token>`. We build a user-scoped client with that
// header so Postgres RLS enforces per-user ownership — the route code never
// trusts a user_id from the request body.

/** The signed-in user from the request's Authorization header. */
export async function getCloudPhoneUser(req) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { error: 'Sign in to use Cloud Phone.', status: 401 };
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { error: 'Sign in to use Cloud Phone.', status: 401 };
    return { user, supabase };
  } catch {
    return { error: 'Could not verify your sign-in. Please try again.', status: 401 };
  }
}
