// lib/trifold/notify.js
// Shared "new issue is out" email sender (Resend batch endpoint).
// Used by the buddy's manual POST /api/trifold/notify AND by the Tuesday
// publish step of the pipeline cron. Server-only.

import { TRIFOLD_NAME } from './constants.js';

function siteUrl() {
  const env = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
  if (env) return env.startsWith('http') ? env : `https://${env}`;
  return 'https://olympusverse.com';
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Browsers are throttled by Cloudflare on api.resend.com — send a real
// browser UA so the send isn't bounced before auth is even checked.
const RESEND_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export function buildIssueEmail(edition) {
  const base = siteUrl();
  const issueUrl = `${base}/trifold/issues/${edition.id}`;
  const subject = `${TRIFOLD_NAME} #${edition.issue_number} — ${edition.newspaper_name}: Real, Ruin, Radiant`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#e8e6df;background:#0b0e1a;padding:32px;border-radius:12px">
      <h1 style="margin:0 0 8px">${TRIFOLD_NAME} <span style="color:#a78bfa">#${edition.issue_number}</span></h1>
      <p style="color:#9aa0b5;margin:0 0 16px">This week: <strong>${escapeHtml(edition.newspaper_name)}</strong> (${escapeHtml(edition.newspaper_region)})</p>
      <p>One week, three papers:</p>
      <ul>
        <li><strong>The OG</strong> — the real top stories.</li>
        <li><strong>Ruin</strong> — the same week at its fictional worst. <em>FICTION.</em></li>
        <li><strong>Radiant</strong> — the same week at its fictional best. <em>FICTION.</em></li>
      </ul>
      <p><a href="${issueUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Read issue #${edition.issue_number}</a></p>
      <p style="color:#9aa0b5;font-size:12px;margin-top:24px">You're getting this because you subscribed to ${TRIFOLD_NAME}. Unsubscribe anytime from your account.</p>
    </div>`;
  return { subject, html };
}

/**
 * Email every trialing/active subscriber about a published edition.
 * Returns { sent }. Throws with an honest message on Resend failure.
 */
export async function sendIssueEmails(admin, edition) {
  if (!process.env.RESEND_API_KEY) throw new Error('Email is not connected yet (RESEND_API_KEY).');
  const { data: subs } = await admin
    .from('trifold_subscriptions')
    .select('email')
    .in('status', ['trialing', 'active']);
  const emails = [...new Set((subs || []).map((s) => s.email).filter(Boolean))];
  if (emails.length === 0) return { sent: 0 };

  const { subject, html } = buildIssueEmail(edition);
  // Resend batch endpoint handles up to 100 recipients per call.
  let sent = 0;
  for (let i = 0; i < emails.length; i += 100) {
    const batch = emails.slice(i, i + 100).map((to) => ({
      from: `${TRIFOLD_NAME} <noreply@olympusverse.com>`,
      to: [to],
      subject,
      html,
    }));
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': RESEND_UA,
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`Email send failed: ${msg.slice(0, 200)}`);
    }
    sent += batch.length;
  }
  return { sent };
}
