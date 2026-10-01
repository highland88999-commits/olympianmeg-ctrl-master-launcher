// lib/artemis/mail.js
//
// ARTEMIS mail engine — pure helpers (headless-testable).
//
// Ported from engine/core/stewardship/mailer.js and
// engine/core/stewardship/mail-engine.js in Merlin's original artemis repo,
// which sent stewardship / audit / nurture reports to the Architect through
// Resend (RESEND_API_KEY, server-side only). The actual send lives in
// app/api/artemis/mail/route.js; this file holds the pure parts: address
// defaults, validation, and the counsel-report HTML template.
//
// Deliberately NOT ported: pitchSiteOwner (unsolicited cold outreach to
// third-party site owners). The architect-report half is the feature; the
// mail route only ever sends to the architect's own address.

export function isValidEmail(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (s.length === 0 || s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Sender identity. Merlin's olympusverse.com domain is verified in Resend
// (SPF/DKIM/DMARC), so the domain sender works; RESEND_FROM_EMAIL overrides.
export function mailFrom() {
  return (process.env.RESEND_FROM_EMAIL || 'artemis@olympusverse.com').trim();
}

// The Architect's own inbox. The mail route only ever sends here — no
// third-party recipients, so the key can't be turned into a spam cannon.
export function architectEmail() {
  return (process.env.ARCHITECT_EMAIL || 'olympiannexus@gmail.com').trim();
}

// Stewardship-styled counsel report, adapted from the original
// notifyArchitect template (dark, monospace, cyan headers).
export function buildCounselHtml({ persona, prompt, reply }) {
  const p = escapeHtml(persona || 'ORACLE').slice(0, 60);
  const q = escapeHtml(prompt || '').slice(0, 6000);
  const r = escapeHtml(reply || '').slice(0, 30000);
  return (
    `<div style="font-family: monospace; color: #cfe6f2; background: #0a0a0a; padding: 24px;">` +
    `<h2 style="color: #00f2ff; background: #000; padding: 12px; margin: 0 0 16px;">ARTEMIS COUNSEL — ${p}</h2>` +
    (q ? `<p style="color: #9fb6c6;"><strong style="color: #e8f1f7;">Prompt:</strong><br>${q}</p><hr style="border-color: #1d2a35;">` : '') +
    `<div style="white-space: pre-wrap; line-height: 1.7;">${r}</div>` +
    `<hr style="border-color: #1d2a35; margin-top: 20px;">` +
    `<p style="color: #5b6b7a; font-size: 12px;">Sent from the ARTEMIS pocket universe · olympusverse.com/artemis</p>` +
    `</div>`
  );
}
