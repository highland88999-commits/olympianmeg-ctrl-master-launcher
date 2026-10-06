// lib/payouts/wise.js
// Wise Business API client for Interac e-Transfer payouts.
// Server-only. Money-in stays on Stripe; this is the payout leg only.
//
// Flow per payout: quote (payOut INTERAC) -> recipient (email-keyed) ->
// transfer (idempotent via customerTransactionId) -> fund from CAD balance.
// Nothing here moves money unless the caller funds the transfer, and the
// queue processor refuses to run unless the master kill-switch is on.

import crypto from 'node:crypto';

const LIVE_BASE = 'https://api.wise.com';
const SANDBOX_BASE = 'https://api.wise-sandbox.com';

/** Max Interac payout per transfer (Wise limit): 25,000 CAD. */
export const INTERAC_MAX_CENTS = 2500000;

function baseUrl() {
  return String(process.env.WISE_ENV || 'sandbox').toLowerCase() === 'live'
    ? LIVE_BASE
    : SANDBOX_BASE;
}

function token() {
  const t = String(process.env.WISE_API_TOKEN || '').trim();
  if (!t) throw new Error('Wise is not configured yet (WISE_API_TOKEN).');
  return t;
}

export function wiseProfileId() {
  const id = String(process.env.WISE_PROFILE_ID || '').trim();
  if (!id) throw new Error('Wise is not configured yet (WISE_PROFILE_ID).');
  return id;
}

export function wiseEnv() {
  return String(process.env.WISE_ENV || 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox';
}

async function wiseFetch(path, { method = 'GET', body } = {}) {
  const res = await fetch(baseUrl() + path, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      'X-External-Correlation-Id': crypto.randomUUID().slice(0, 36),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const msg = (data && (data.message || data.error || data.code)) || text || `Wise API ${res.status}`;
    throw new Error(`Wise API error (${res.status}): ${String(msg).slice(0, 300)}`);
  }
  return data;
}

const toMajor = (cents) => (Math.round(Number(cents) || 0) / 100).toFixed(2);

/**
 * Step 1 — authenticated quote for a CAD->CAD Interac payout.
 * Returns the quote (save quote.id; check paymentOptions[].fee.total — never hardcode fees).
 */
export async function createInteracQuote({ amountCents }) {
  const cents = Math.round(Number(amountCents) || 0);
  if (cents <= 0) throw new Error('Quote amount must be positive.');
  if (cents > INTERAC_MAX_CENTS) {
    throw new Error(`Interac payouts are capped at $${(INTERAC_MAX_CENTS / 100).toLocaleString()} per transfer.`);
  }
  const profileId = wiseProfileId();
  const quote = await wiseFetch(`/v2/profiles/${profileId}/quotes`, {
    method: 'POST',
    body: {
      sourceCurrency: 'CAD',
      targetCurrency: 'CAD',
      sourceAmount: Number(toMajor(cents)),
      targetAmount: null,
      targetAccount: null,
      payOut: 'INTERAC',
      preferredPayIn: 'BALANCE',
    },
  });
  if (!quote || !quote.id) throw new Error('Wise did not return a quote.');
  const blocked = (quote.notices || []).some((n) => String(n.type || '').toUpperCase() === 'BLOCKED');
  if (blocked) throw new Error('Wise blocked this quote (see quote notices).');
  return quote;
}

/** Quote fee in cents (read from the quote — never hardcoded). */
export function quoteFeeCents(quote) {
  const opts = Array.isArray(quote?.paymentOptions) ? quote.paymentOptions : [];
  const first = opts[0] || {};
  const total = Number(first?.fee?.total);
  if (!Number.isFinite(total)) return 0;
  return Math.max(0, Math.round(total * 100));
}

/**
 * Step 2 — create (or reuse) the Interac recipient, keyed by email.
 * Field discovery: GET /v1/quotes/{quoteId}/account-requirements is the
 * authoritative source per Wise docs; the shape below follows Wise's
 * documented Interac recipient pattern (name + email, PRIVATE).
 */
export async function createInteracRecipient({ email, legalName }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const name = String(legalName || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) throw new Error('A valid email address is required.');
  if (name.length < 2) throw new Error('The recipient legal name is required.');
  const profileId = wiseProfileId();
  const recipient = await wiseFetch('/v1/accounts', {
    method: 'POST',
    body: {
      profile: Number(profileId),
      accountHolderName: name,
      currency: 'CAD',
      type: 'interac',
      details: { legalType: 'PRIVATE', email: cleanEmail },
    },
  });
  if (!recipient || !recipient.id) throw new Error('Wise did not return a recipient.');
  return recipient;
}

/**
 * Step 3 — create the transfer. Idempotent: customerTransactionId is derived
 * from the withdrawal id, so retries never double-pay.
 */
export async function createTransfer({ quoteUuid, recipientId, withdrawalId, reference }) {
  if (!quoteUuid) throw new Error('A quote UUID is required.');
  if (!recipientId) throw new Error('A recipient id is required.');
  const profileId = wiseProfileId();
  const transfer = await wiseFetch(`/v3/profiles/${profileId}/transfers`, {
    method: 'POST',
    body: {
      targetAccount: Number(recipientId),
      quoteUuid: String(quoteUuid),
      customerTransactionId: `etransfer:${String(withdrawalId)}`,
      details: {
        reference: String(reference || 'Olympusverse payout').slice(0, 100),
        transferPurpose: 'verification.transfers.purpose.pay.bills',
        sourceOfFunds: 'verification.source.of.funds.other',
      },
    },
  });
  if (!transfer || !transfer.id) throw new Error('Wise did not return a transfer.');
  return transfer;
}

/**
 * Step 4 — fund from the CAD balance. THIS moves the money.
 */
export async function fundTransfer({ transferId }) {
  if (!transferId) throw new Error('A transfer id is required.');
  const profileId = wiseProfileId();
  return wiseFetch(`/v3/profiles/${profileId}/transfers/${transferId}/payments`, {
    method: 'POST',
    body: { type: 'BALANCE' },
  });
}

export async function getTransfer({ transferId }) {
  if (!transferId) throw new Error('A transfer id is required.');
  return wiseFetch(`/v1/transfers/${transferId}`, { method: 'GET' });
}

/**
 * Verify a Wise webhook signature: RSA-SHA256 over the RAW body bytes.
 * Public key comes from WISE_WEBHOOK_PUBLIC_KEY (PEM). Fails closed.
 */
export function verifyWebhookSignature(rawBody, signatureB64) {
  const pem = String(process.env.WISE_WEBHOOK_PUBLIC_KEY || '').trim();
  if (!pem) throw new Error('Wise webhook public key is not configured.');
  if (!signatureB64) return false;
  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8'));
    verifier.end();
    return verifier.verify(pem, String(signatureB64), 'base64');
  } catch {
    return false;
  }
}

/** Map a Wise transfer state to our withdrawal status. */
export function wiseStateToStatus(state) {
  const s = String(state || '').toLowerCase();
  if (['outgoing_payment_sent', 'funds_refunded'].includes(s)) return s === 'funds_refunded' ? 'failed' : 'completed';
  if (['cancelled', 'bounced_back'].includes(s)) return 'failed';
  return 'processing';
}
