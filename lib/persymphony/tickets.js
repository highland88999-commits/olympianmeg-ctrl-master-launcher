// lib/persymphony/tickets.js
// Pure, headless-testable core for PerSymphony tickets.
// No DOM, no network, no secrets — safe to import from API routes and tests.
//
// Business model (Merlin):
//   - Performers set their own ticket prices.
//   - Platform fee: 10% of performer NET profit per show.
//   - v1 net profit = ticket revenue - Stripe processing fees.
//     Platform takes 10%, performer keeps 90%. Ledger only, no payouts.
//   - Any performance type allowed; venue types: physical / virtual /
//     livestream / hybrid. Ticketing, pricing, distribution, and the ledger
//     work identically across all venue types; only the entry payload adapts.

export const TICKET_PREFIX = 'PS';
export const TICKET_CODE_LEN = 8;
// Unambiguous alphabet: no 0/O, no 1/I/L — readable on a phone screen.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const VENUE_TYPES = ['physical', 'virtual', 'livestream', 'hybrid'];
export const PLATFORM_FEE_RATE = 0.10;
export const MAX_TICKETS_PER_ORDER = 8;

/** Generate a ticket number like PS-7KQ2M9XD. rand is injectable for tests. */
export function makeTicketNumber(rand = Math.random) {
  let code = '';
  for (let i = 0; i < TICKET_CODE_LEN; i++) {
    code += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  }
  return `${TICKET_PREFIX}-${code}`;
}

/** Normalize user input: accepts "ps-7kq2m9xd", "PS7KQ2M9XD", "ps 7kq2m9xd". */
export function normalizeTicketNumber(input) {
  const t = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.startsWith(TICKET_PREFIX) && t.length === TICKET_PREFIX.length + TICKET_CODE_LEN) {
    return `${TICKET_PREFIX}-${t.slice(TICKET_PREFIX.length)}`;
  }
  return t;
}

export function isWellFormedTicketNumber(input) {
  return new RegExp(`^${TICKET_PREFIX}-[${ALPHABET}]{${TICKET_CODE_LEN}}$`).test(
    normalizeTicketNumber(input)
  );
}

/**
 * Fee/ledger math. All values in cents (integers).
 * net = gross - stripe fees; platform = 10% of net (rounded); performer = rest.
 * Invariant: platform_fee_cents + performer_share_cents === net_cents always.
 */
export function computeLedger({ gross_cents, stripe_fee_cents }) {
  const gross = Math.max(0, Math.round(Number(gross_cents) || 0));
  const fee = Math.max(0, Math.round(Number(stripe_fee_cents) || 0));
  const net = Math.max(0, gross - fee);
  const platform_fee_cents = Math.round(net * PLATFORM_FEE_RATE);
  const performer_share_cents = net - platform_fee_cents;
  return {
    gross_cents: gross,
    stripe_fee_cents: fee,
    net_cents: net,
    platform_fee_cents,
    performer_share_cents,
    platform_rate: PLATFORM_FEE_RATE,
  };
}

/**
 * Aggregate a list of ticket rows ({amount_cents, stripe_fee_cents, status})
 * into a ledger. Refunded tickets are excluded — money returned to the buyer
 * is not revenue, so it must not inflate gross, net, or either share.
 */
export function ledgerFromTickets(tickets) {
  const rows = (Array.isArray(tickets) ? tickets : []).filter((t) => t.status !== 'refunded');
  const gross = rows.reduce((s, t) => s + (Number(t.amount_cents) || 0), 0);
  const fee = rows.reduce((s, t) => s + (Number(t.stripe_fee_cents) || 0), 0);
  return { ...computeLedger({ gross_cents: gross, stripe_fee_cents: fee }), tickets_sold: rows.length };
}

/**
 * Pure entry-gate decision. ticket: { show_id, status } | null.
 * Returns { ok, code, message }. The route then redeems atomically.
 */
export function decideEntry({ ticket, showId }) {
  if (!ticket) {
    return { ok: false, code: 'invalid', message: 'That ticket number was not found. Check it and try again.' };
  }
  if (ticket.show_id !== showId) {
    return { ok: false, code: 'wrong_event', message: 'That ticket is for a different show.' };
  }
  if (ticket.status === 'redeemed') {
    return { ok: false, code: 'already_redeemed', message: 'That ticket has already been used for entry.' };
  }
  if (ticket.status === 'refunded') {
    return { ok: false, code: 'refunded', message: 'That ticket was refunded and is no longer valid.' };
  }
  if (ticket.status !== 'valid') {
    return { ok: false, code: 'invalid', message: 'That ticket is no longer valid.' };
  }
  return { ok: true, code: 'admitted', message: 'Ticket accepted. Enjoy the show.' };
}

/**
 * What the entry gate reveals AFTER a ticket is validated + redeemed.
 * stream_url is only ever included here — never in public show data.
 * show: { venue_type, venue_name, venue_address, arena_id, title }
 * secrets: { stream_url } | null
 */
export function entryPayload(show, secrets) {
  const out = {
    venue_type: show.venue_type,
    venue_name: show.venue_name || '',
    title: show.title || '',
  };
  if (show.venue_type === 'physical' || show.venue_type === 'hybrid') {
    out.door = { venue_name: show.venue_name || '', venue_address: show.venue_address || '' };
  }
  if (show.venue_type === 'virtual' || show.venue_type === 'hybrid') {
    out.arena = {
      arena_id: show.arena_id || '',
      url: show.arena_id ? `/persymphony?arena=${encodeURIComponent(show.arena_id)}` : '/persymphony',
    };
  }
  if (
    (show.venue_type === 'livestream' || show.venue_type === 'hybrid') &&
    secrets &&
    secrets.stream_url
  ) {
    out.stream = { url: secrets.stream_url };
  }
  return out;
}

/**
 * Validate show-creation input. allowedArenas: array of valid arena ids
 * (passed in so this stays pure; the route supplies the ARENAS registry).
 * Returns { ok, errors[] }.
 */
export function validateShowInput(input, allowedArenas = []) {
  const errors = [];
  const s = input || {};
  if (!String(s.title || '').trim()) errors.push('A title is required.');
  if (!String(s.performance_type || '').trim()) errors.push('A performance type is required.');
  const starts = new Date(s.starts_at);
  if (Number.isNaN(starts.getTime())) errors.push('A valid date and time is required.');
  else if (starts.getTime() < Date.now() - 60_000) errors.push('The show must start in the future.');
  if (!VENUE_TYPES.includes(s.venue_type)) errors.push('Pick a venue type: physical, virtual, livestream, or hybrid.');
  if (s.venue_type === 'physical' || s.venue_type === 'hybrid') {
    if (!String(s.venue_name || '').trim()) errors.push('A venue name is required for physical shows.');
    if (!String(s.venue_address || '').trim()) errors.push('A venue address is required for physical shows.');
  }
  if (s.venue_type === 'virtual' || s.venue_type === 'hybrid') {
    if (!String(s.arena_id || '').trim()) errors.push('Pick a virtual arena.');
    else if (allowedArenas.length && !allowedArenas.includes(s.arena_id)) {
      errors.push('That arena does not exist.');
    }
  }
  if (s.venue_type === 'livestream' || s.venue_type === 'hybrid') {
    if (!String(s.stream_url || '').trim()) errors.push('A stream URL is required for livestream shows.');
  }
  if (s.venue_capacity != null && s.venue_capacity !== '') {
    const cap = Number(s.venue_capacity);
    if (!Number.isInteger(cap) || cap <= 0) errors.push('Venue capacity must be a positive whole number.');
  }
  const tiers = Array.isArray(s.tiers) ? s.tiers : [];
  if (!tiers.length) errors.push('Add at least one ticket tier.');
  let tierTotal = 0;
  tiers.forEach((t, i) => {
    const n = i + 1;
    if (!String(t.name || '').trim()) errors.push(`Tier ${n}: a name is required.`);
    const price = Number(t.price_cents);
    if (!Number.isInteger(price) || price < 0) errors.push(`Tier ${n}: price must be 0 or more (in cents).`);
    const qty = Number(t.quantity);
    if (!Number.isInteger(qty) || qty <= 0) errors.push(`Tier ${n}: quantity must be at least 1.`);
    else tierTotal += qty;
  });
  const cap = Number(s.venue_capacity);
  if (Number.isInteger(cap) && cap > 0 && tierTotal > cap) {
    errors.push(`Tier quantities (${tierTotal}) exceed the venue capacity (${cap}).`);
  }
  return { ok: errors.length === 0, errors };
}

/** Webhook idempotency decision: skip fulfillment when tickets already exist. */
export function shouldFulfill({ existingTicketCount }) {
  return !existingTicketCount || existingTicketCount <= 0;
}

/**
 * Show lifecycle transitions a performer may drive from the dashboard.
 *   draft     -> published | cancelled
 *   published -> live | cancelled
 *   live      -> ended | cancelled
 *   ended     -> (terminal)
 *   cancelled -> (terminal)
 * Cancelling never auto-refunds in v1 (Merlin's call) — the tickets stay
 * valid in the ledger and the performer handles buyers directly. Returns
 * { ok, error? }.
 */
const SHOW_TRANSITIONS = {
  draft: ['published', 'cancelled'],
  published: ['live', 'cancelled'],
  live: ['ended', 'cancelled'],
  ended: [],
  cancelled: [],
};

export function canTransitionShowStatus(from, to) {
  const allowed = SHOW_TRANSITIONS[String(from)] || [];
  if (allowed.includes(String(to))) return { ok: true };
  return { ok: false, error: `A ${from || 'unknown'} show cannot move to ${to || 'unknown'}.` };
}

export function showStatusTransitions(from) {
  return [...(SHOW_TRANSITIONS[String(from)] || [])];
}

/** Split a total across N tickets in cents, keeping the sum exact. */
export function splitCents(totalCents, n) {
  const total = Math.max(0, Math.round(Number(totalCents) || 0));
  const count = Math.max(1, Math.floor(Number(n) || 1));
  const base = Math.floor(total / count);
  const out = new Array(count).fill(base);
  out[count - 1] += total - base * count;
  return out;
}

export function formatCents(cents) {
  return `$${(Math.max(0, Math.round(Number(cents) || 0)) / 100).toFixed(2)}`;
}
