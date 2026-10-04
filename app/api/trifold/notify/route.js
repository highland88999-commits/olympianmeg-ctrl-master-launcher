// app/api/trifold/notify/route.js
// POST /api/trifold/notify { edition_id }  (buddy only)
// Sends the "new issue" email to every trialing/active subscriber via Resend.
// Called by the buddy from the studio right after publishing (kept manual
// so the human stays in the loop). The Tuesday pipeline publish step calls
// the same shared sender in lib/trifold/notify.js.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireBuddy } from '@/lib/trifold/server';
import { sendIssueEmails } from '@/lib/trifold/notify';

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The newsletter service is not connected yet.');
  await requireBuddy(req, admin);

  let body = {};
  try { body = await req.json(); } catch {
    return Response.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }
  const { data: edition, error } = await admin
    .from('trifold_editions')
    .select('*')
    .eq('id', String(body.edition_id || ''))
    .eq('status', 'published')
    .maybeSingle();
  if (error || !edition) {
    return Response.json({ ok: false, error: 'Published issue not found.' }, { status: 404 });
  }

  const { sent } = await sendIssueEmails(admin, edition);
  if (sent === 0) return Response.json({ ok: true, sent: 0, note: 'No subscribers yet.' });
  return Response.json({ ok: true, sent });
});
