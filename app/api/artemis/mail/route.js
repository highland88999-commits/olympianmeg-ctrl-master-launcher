// app/api/artemis/mail/route.js
//
// POST /api/artemis/mail  (Bearer <redacted> required)
//   { action: 'counsel', persona?, prompt?, text } -> { ok, to, resend_id }
//   { action: 'report', subject, html }           -> { ok, to, resend_id }
//
// The ARTEMIS mail engine, ported from engine/core/stewardship/mailer.js in
// Merlin's original artemis repo. Sends through Resend's HTTPS API with
// RESEND_API_KEY — server-side only, never in the bundle, never in a URL.
//
// Safety: the route only ever sends to the architect's own inbox
// (ARCHITECT_EMAIL, default olympiannexus@gmail.com). The original's
// pitchSiteOwner cold-outreach-to-strangers flow was deliberately not
// ported. Honest 503 when the key isn't configured yet.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getUserFromRequest, getAdminClient } from '@/lib/artemis/server';
import { buildCounselHtml, mailFrom, architectEmail, isValidEmail } from '@/lib/artemis/mail';

function requireResendKey() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    const err = new Error('Email is not connected yet (RESEND_API_KEY).');
    err.status = 503;
    throw err;
  }
  return key;
}

async function sendViaResend({ to, subject, html }) {
  const key = requireResendKey();
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Artemis <${mailFrom()}>`,
      to: [to],
      subject,
      html,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || data?.error?.message || `Resend HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status >= 500 ? 502 : res.status;
    throw err;
  }
  return data?.id || null;
}

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }

  const to = architectEmail();
  if (!isValidEmail(to)) {
    return NextResponse.json({ ok: false, error: 'The architect email is not configured.' }, { status: 500 });
  }

  const action = String(body.action || 'counsel').toLowerCase();
  let subject;
  let html;

  if (action === 'report') {
    subject = String(body.subject || '').trim().slice(0, 200);
    html = String(body.html || '').trim().slice(0, 100000);
    if (!subject || !html) {
      return NextResponse.json({ ok: false, error: 'A report needs a subject and a body.' }, { status: 400 });
    }
  } else if (action === 'counsel') {
    const persona = String(body.persona || 'ORACLE').toUpperCase().slice(0, 40);
    const prompt = String(body.prompt || '').slice(0, 4000);
    const text = String(body.text || '').trim().slice(0, 20000);
    if (!text) {
      return NextResponse.json(
        { ok: false, error: 'Nothing to email yet — ask the oracle first.' },
        { status: 400 }
      );
    }
    subject = `Artemis counsel — ${persona}`;
    html = buildCounselHtml({ persona, prompt, reply: text });
  } else {
    return NextResponse.json({ ok: false, error: 'Unknown mail action.' }, { status: 400 });
  }

  let resendId = null;
  try {
    resendId = await sendViaResend({ to, subject, html });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'The email failed to send.' }, { status: e.status || 502 });
  }

  // Best-effort log to the architect's own mail history (honest offline if
  // the table hasn't been created yet — the email already went out).
  try {
    const admin = await getAdminClient();
    if (admin) {
      await admin.from('artemis_mail_log').insert([{
        user_id: auth.user.id,
        to_email: to,
        subject,
        resend_id: resendId,
      }]);
    }
  } catch {
    /* logging is a nicety, not the send */
  }

  return NextResponse.json({ ok: true, to, resend_id: resendId });
});
