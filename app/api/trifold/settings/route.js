// app/api/trifold/settings/route.js
// GET  /api/trifold/settings  -> buddy config (buddy only; NEVER the API key)
// POST /api/trifold/settings  -> save provider / key / buddy email / user id (buddy only,
//                                or bootstrap via TRIFOLD_EDITOR_USER_ID when unset)
//
// The AI key is write-only: it goes in encrypted, and no route ever reads it
// back out. The GET response says only whether a key is configured.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireBuddy, getSettingsRaw, getEditorUserId } from '@/lib/trifold/server';
import { encryptApiKey } from '@/lib/trifold/crypto';
import { TRIFOLD_AI_PROVIDERS } from '@/lib/trifold/ai';

async function canWrite(req, admin) {
  // Normal path: the designated buddy. Bootstrap path: no buddy set yet and
  // the caller presents the TRIFOLD_EDITOR_USER_ID env value... which the
  // buddy can't know. So bootstrap happens when buddy_user_id is empty AND
  // the request carries a valid Supabase session: the first writer becomes
  // the buddy ONLY if TRIFOLD_ALLOW_SELF_BOOTSTRAP=true. Otherwise Merlin
  // sets TRIFOLD_EDITOR_USER_ID in Vercel env once.
  try {
    const user = await requireBuddy(req, admin);
    return { user, bootstrap: false };
  } catch {
    const editorId = await getEditorUserId(admin);
    if (!editorId && process.env.TRIFOLD_ALLOW_SELF_BOOTSTRAP === 'true') {
      return { user: null, bootstrap: true };
    }
    const e = new Error('Only the newsletter editor can do that.');
    e.status = 403;
    throw e;
  }
}

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The newsletter service is not connected yet.');
  await requireBuddy(req, admin);
  const raw = await getSettingsRaw(admin);
  return Response.json({
    ok: true,
    settings: {
      buddy_email: raw?.buddy_email || '',
      buddy_user_id: raw?.buddy_user_id || '',
      ai_provider: raw?.ai_provider || 'openai',
      ai_key_configured: !!(raw?.ai_api_key_enc),
      rotation_index: raw?.rotation_index || 0,
      rotation_log: raw?.rotation_log || [],
    },
  });
});

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The newsletter service is not connected yet.');
  const { user, bootstrap } = await canWrite(req, admin);
  let body = {};
  try { body = await req.json(); } catch {
    return Response.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }
  const patch = {};
  if (typeof body.buddy_email === 'string') patch.buddy_email = body.buddy_email.trim().slice(0, 200);
  if (typeof body.ai_provider === 'string' && TRIFOLD_AI_PROVIDERS.includes(body.ai_provider)) {
    patch.ai_provider = body.ai_provider;
  }
  if (typeof body.api_key === 'string' && body.api_key.trim()) {
    // Write-only: encrypt immediately, never store or log plaintext.
    patch.ai_api_key_enc = await encryptApiKey(body.api_key.trim());
  }
  if (body.clear_key === true) patch.ai_api_key_enc = '';
  // The buddy's user ID: set on bootstrap, or corrected by the buddy himself.
  if (bootstrap && user === null) {
    // Resolve the caller's identity from the bearer token for self-bootstrap.
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
    const { data } = await client.auth.getUser(token);
    if (data?.user?.id) patch.buddy_user_id = data.user.id;
  } else if (typeof body.buddy_user_id === 'string' && body.buddy_user_id) {
    patch.buddy_user_id = body.buddy_user_id.slice(0, 100);
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ ok: false, error: 'Nothing to save.' }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();
  const { error } = await admin.from('trifold_settings').update(patch).eq('id', 1);
  if (error) throw new Error('Could not save settings.');
  return Response.json({ ok: true, saved: Object.keys(patch).filter((k) => k !== 'ai_api_key_enc' && k !== 'updated_at'), key_configured: patch.ai_api_key_enc !== undefined ? !!patch.ai_api_key_enc : undefined });
});
