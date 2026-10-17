// lib/payouts/shakepay.js
// Shakepay BTC payout module — API client + per-queue-leg operations.
// Server-only. Money-in stays on Stripe; the wallet ledger stays the book
// of record; Shakepay is the BTC payout leg only. Users receive BTC and
// convert to CAD inside Shakepay themselves.
//
// *** API STATUS (2026-10-17) ***
// Shakepay publishes NO public business API. Their product is a consumer
// app, and third-party integrators confirm no API connection is supported
// at this time. EVERY endpoint path, request shape, auth detail, and
// webhook format below is ASSUMED — designed against standard crypto-payout
// API conventions so the queue architecture is ready the moment Shakepay
// grants API access. All assumed values live in the SHAKEPAY_API config
// block directly below; swap them for the real spec when it arrives.
// Nothing in this file is presented as a verified Shakepay endpoint.
//
// Queue legs (Merlin: "you're going to need more queues"):
//   FUND    — platform buys BTC with CAD to keep the payout wallet funded
//             (app/api/payouts/cron/shakepay-fund-queue)
//   SEND    — strict-FIFO BTC sends to users (app/api/payouts/cron/shakepay-queue)
//   CONFIRM — polls in-flight sends; 'completed' only after N on-chain
//             confirmations (app/api/payouts/cron/shakepay-confirm-queue)
// The webhook (app/api/payouts/shakepay-webhook) is the primary completion
// signal; CONFIRM is the reconciliation fallback for missed deliveries.
//
// Nothing here moves money unless the caller funds/sends, and the queue
// processors refuse to run unless the master kill-switch is on.

import crypto from 'node:crypto';
import { creditWallet, releaseHold } from '@/lib/wallet/ledger';
import { auditPayout } from '@/lib/payouts/settings';

/* =====================================================================
 * ASSUMED API CONFIG — see the header above. Replace every value here
 * with the real Shakepay business API spec when access is granted.
 * ===================================================================== */
const SHAKEPAY_API = {
  // Assumed base URLs. Shakepay's consumer app lives at shakepay.com; a
  // business API would presumably live under a dedicated host.
  LIVE_BASE: 'https://api.shakepay.com', // ASSUMED
  SANDBOX_BASE: 'https://api-sandbox.shakepay.com', // ASSUMED
  PATHS: {
    balances: '/v1/wallets/balances', // ASSUMED — GET
    ticker: '/v1/market/BTC-CAD/ticker', // ASSUMED — GET
    buyOrder: '/v1/orders/buy', // ASSUMED — POST
    orderStatus: (id) => `/v1/orders/${encodeURIComponent(id)}`, // ASSUMED — GET
    btcSend: '/v1/bitcoin/sends', // ASSUMED — POST
    sendStatus: (id) => `/v1/bitcoin/sends/${encodeURIComponent(id)}`, // ASSUMED — GET
  },
  // Assumed auth: Bearer <redacted>
  // Assumed webhook: HMAC-SHA256 over the RAW body bytes, hex digest in
  // `x-shakepay-signature`, delivery id in `x-shakepay-delivery-id`,
  // secret in SHAKEPAY_WEBHOOK_SECRET.
};

/** Dust threshold: never create a send below this. */
export const BTC_DUST_SATS = 546;
export const SATS_PER_BTC = 100_000_000;
/** Sanity cap per send (1 BTC) — large payouts split across withdrawals. */
export const SEND_MAX_SATS = 100_000_000;
export const DEFAULT_CONFIRMATIONS_REQUIRED = 3;
export const FUND_TARGET_SATS_DEFAULT = 10_000_000; // 0.1 BTC

function baseUrl() {
  return String(process.env.SHAKEPAY_ENV || 'sandbox').toLowerCase() === 'live'
    ? SHAKEPAY_API.LIVE_BASE
    : SHAKEPAY_API.SANDBOX_BASE;
}

function apiKey() {
  const k = String(process.env.SHAKEPAY_API_KEY || '').trim();
  if (!k) throw new Error('Shakepay is not configured yet (SHAKEPAY_API_KEY).');
  return k;
}

export function shakepayEnv() {
  return String(process.env.SHAKEPAY_ENV || 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox';
}

async function shakepayFetch(path, { method = 'GET', body, idempotencyKey } = {}) {
  const res = await fetch(baseUrl() + path, {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': String(idempotencyKey).slice(0, 64) } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const msg = (data && (data.message || data.error || data.code)) || text || `Shakepay API ${res.status}`;
    throw new Error(`Shakepay API error (${res.status}): ${String(msg).slice(0, 300)}`);
  }
  return data;
}

/* ------------------------------------------------------------------ *
 * FUND leg — platform BTC acquisition
 * ------------------------------------------------------------------ */

/**
 * Platform BTC balance in sats.
 * Assumed response shape: { balances: { BTC: "0.12345678", CAD: "1234.56" } }
 * (major units as strings).
 */
export async function getBtcBalanceSats() {
  const data = await shakepayFetch(SHAKEPAY_API.PATHS.balances);
  const btc = Number(data?.balances?.BTC);
  if (!Number.isFinite(btc)) throw new Error('Shakepay did not return a BTC balance.');
  return Math.max(0, Math.round(btc * SATS_PER_BTC));
}

/** Platform CAD balance in cents. Same assumed shape as above. */
export async function getCadBalanceCents() {
  const data = await shakepayFetch(SHAKEPAY_API.PATHS.balances);
  const cad = Number(data?.balances?.CAD);
  if (!Number.isFinite(cad)) throw new Error('Shakepay did not return a CAD balance.');
  return Math.max(0, Math.round(cad * 100));
}

/**
 * Current BTC/CAD rate (CAD per 1 BTC).
 * Assumed response shape: { pair: "BTC/CAD", last: "123456.78" }.
 * The rate is read fresh every run — never hardcoded.
 */
export async function getBtcCadRate() {
  const data = await shakepayFetch(SHAKEPAY_API.PATHS.ticker);
  const rate = Number(data?.last ?? data?.price);
  if (!(rate > 0)) throw new Error('Shakepay did not return a usable BTC/CAD rate.');
  return rate;
}

/** Convert a CAD cent amount to sats at the given rate. */
export function satsForCadCents(cadCents, rateCadPerBtc) {
  const cad = Math.round(Number(cadCents) || 0) / 100;
  const rate = Number(rateCadPerBtc);
  if (!(rate > 0)) throw new Error('A positive BTC/CAD rate is required.');
  if (cad <= 0) return 0;
  return Math.max(0, Math.round((cad / rate) * SATS_PER_BTC));
}

/**
 * Place a market buy: spend CAD to receive BTC.
 * Idempotent via the caller's idempotencyKey (the fund queue derives it
 * from the run timestamp, one buy per run max).
 * Assumed response shape: { id, status: "open", ... }.
 */
export async function createBtcBuyOrder({ cadCents, idempotencyKey }) {
  const cents = Math.round(Number(cadCents) || 0);
  if (cents <= 0) throw new Error('Buy amount must be positive.');
  const order = await shakepayFetch(SHAKEPAY_API.PATHS.buyOrder, {
    method: 'POST',
    idempotencyKey,
    body: {
      pair: 'BTC/CAD',
      side: 'buy',
      quoteCurrencyAmount: Number((cents / 100).toFixed(2)),
      type: 'market',
    },
  });
  if (!order || !order.id) throw new Error('Shakepay did not return a buy order.');
  return order;
}

/** Poll a buy order. Assumed shape: { id, status, filledSats?, ... }. */
export async function getOrderStatus({ orderId }) {
  if (!orderId) throw new Error('An order id is required.');
  return shakepayFetch(SHAKEPAY_API.PATHS.orderStatus(orderId));
}

/* ------------------------------------------------------------------ *
 * SEND leg — BTC payouts to users
 * ------------------------------------------------------------------ */

/** Basic bech32/base58 sanity check (not full checksum validation). */
const BTC_ADDRESS_RE = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/;
export function isValidBtcAddress(addr) {
  return BTC_ADDRESS_RE.test(String(addr || '').trim());
}

/**
 * Create a BTC send. Idempotent: the queue passes
 * `shakepay:<withdrawal_id>` as the idempotency key, so retries after a
 * crash never double-send.
 * Assumed response shape: { id, status: "broadcast" | "pending", txid? }.
 * THIS broadcasts the transaction — the caller must have passed the
 * liquidity gate first.
 */
export async function createBtcSend({ address, sats, withdrawalId }) {
  const dest = String(address || '').trim();
  if (!isValidBtcAddress(dest)) throw new Error('A valid Bitcoin address is required.');
  const amount = Math.round(Number(sats) || 0);
  if (amount < BTC_DUST_SATS) {
    throw new Error(`Send amount ${amount} sats is below dust (${BTC_DUST_SATS} sats).`);
  }
  if (amount > SEND_MAX_SATS) {
    throw new Error(`Send amount exceeds the per-send cap of ${SEND_MAX_SATS} sats.`);
  }
  if (!withdrawalId) throw new Error('A withdrawal id is required for idempotency.');
  const send = await shakepayFetch(SHAKEPAY_API.PATHS.btcSend, {
    method: 'POST',
    idempotencyKey: `shakepay:${String(withdrawalId)}`,
    body: {
      address: dest,
      amountSats: amount,
      network: 'mainnet',
    },
  });
  if (!send || !send.id) throw new Error('Shakepay did not return a send.');
  return send;
}

/** Poll a send. Assumed shape: { id, status, confirmations, txid? }. */
export async function getSendStatus({ sendId }) {
  if (!sendId) throw new Error('A send id is required.');
  return shakepayFetch(SHAKEPAY_API.PATHS.sendStatus(sendId));
}

/**
 * Map a Shakepay send state to our withdrawal status.
 * 'completed' requires the configured confirmation count — a mere
 * broadcast is still 'processing'.
 */
export function shakepayStateToStatus(state, confirmations, required) {
  const s = String(state || '').toLowerCase();
  const need = Math.max(1, Math.round(Number(required) || DEFAULT_CONFIRMATIONS_REQUIRED));
  if (['confirmed', 'settled', 'complete', 'completed'].includes(s)) {
    return Number(confirmations) >= need ? 'completed' : 'processing';
  }
  if (['failed', 'cancelled', 'canceled', 'rejected', 'refunded', 'expired'].includes(s)) return 'failed';
  return 'processing';
}

/* ------------------------------------------------------------------ *
 * Webhook verification (assumed HMAC-SHA256 — see SHAKEPAY_API header)
 * ------------------------------------------------------------------ */

/**
 * Verify a Shakepay webhook signature: HMAC-SHA256 over the RAW body
 * bytes, hex digest. Secret comes from SHAKEPAY_WEBHOOK_SECRET. Fails closed.
 */
export function verifyWebhookSignature(rawBody, signatureHex) {
  const secret = String(process.env.SHAKEPAY_WEBHOOK_SECRET || '').trim();
  if (!secret) throw new Error('Shakepay webhook secret is not configured.');
  if (!signatureHex) return false;
  try {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8'));
    const digest = hmac.digest('hex');
    const a = Buffer.from(digest, 'utf8');
    const b = Buffer.from(String(signatureHex).trim().toLowerCase(), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Shared ops — re-crediting a withdrawal when a BTC send fails
 * ------------------------------------------------------------------ */

async function setWithdrawal(admin, id, patch) {
  const { error } = await admin.from('wallet_withdrawals').update(patch).eq('id', id);
  if (error) throw new Error(`Status update failed: ${error.message}`);
}

/**
 * Re-credit a withdrawal when Shakepay reports a send failure.
 * Funds were debited only if the send was actually broadcast (audit has
 * 'shakepay_sent'); otherwise the hold is simply released. Never touches a
 * withdrawal already marked 'completed'. Returns true when it acted.
 * (Mirrors lib/payouts/etransfer.js recreditWithdrawal.)
 */
export async function recreditBtcWithdrawal(admin, withdrawalId, reason) {
  const { data: w } = await admin
    .from('wallet_withdrawals')
    .select('id, user_id, amount_cents, status')
    .eq('id', withdrawalId)
    .maybeSingle();
  if (!w || w.status === 'completed') return false;
  const { data: sent } = await admin
    .from('payout_audit_log')
    .select('id')
    .eq('withdrawal_id', withdrawalId)
    .eq('action', 'shakepay_sent')
    .limit(1)
    .maybeSingle();
  if (sent) {
    await creditWallet(admin, w.user_id, {
      program: 'payout_refund',
      amountCents: w.amount_cents,
      reason: `BTC payout refunded: ${reason}`,
      reference: `wallet:withdrawal:${w.id}:refund`,
      currency: 'cad',
    });
  } else {
    await releaseHold(admin, w.user_id, w.amount_cents);
  }
  await setWithdrawal(admin, w.id, { status: 'failed', note: `BTC payout refunded: ${reason}`.slice(0, 500) });
  await auditPayout(admin, {
    withdrawalId: w.id,
    userId: w.user_id,
    action: 'refunded',
    detail: { reason: String(reason).slice(0, 300), was_debited: !!sent },
  });
  return true;
}
