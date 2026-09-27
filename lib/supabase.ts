import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Lazy singleton behind a Proxy. Why:
// 1. No credentials are baked into the source or the client bundle — the key
//    lives only in NEXT_PUBLIC_SUPABASE_* env vars.
// 2. `next build` never crashes on a missing env var; the client is created
//    on first real use, inside the browser or a request handler.
// 3. All existing `supabase.from(...)` / `supabase.auth...` call sites keep
//    working unchanged.
let _client: SupabaseClient | null = null;

function getClient() {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
      );
    }
    _client = createClient(url, key);
  }
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getClient() as any)[prop];
  },
});
