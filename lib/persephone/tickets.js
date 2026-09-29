// lib/persephone/tickets.js
// Server-side ticket catalog for PERSEPHONE.
// The checkout route re-prices from THIS catalog; client prices are ignored.

export const TICKETS = [
  {
    id: 'ga',
    name: 'General Admission',
    blurb: 'Standing room on the main floor. The embers, the bass, the crowd.',
    priceCents: 2500,
  },
  {
    id: 'front',
    name: 'Front Row',
    blurb: 'Right at the stage rail. You will feel the kick drum in your ribs.',
    priceCents: 7500,
  },
  {
    id: 'vip',
    name: 'VIP Booth',
    blurb: 'Raised booth with a straight view of the decks and the hall below.',
    priceCents: 15000,
  },
];

export const MAX_QTY = 8;

export function getTicket(id) {
  return TICKETS.find((t) => t.id === id) || null;
}

/**
 * Validate a ticket order server-side.
 * Returns { ok, errors[], ticket, qty, totalCents }.
 */
export function validateTicketOrder({ ticketId, qty } = {}) {
  const errors = [];
  const ticket = getTicket(ticketId);
  if (!ticket) errors.push('Pick a ticket type.');
  const q = Number(qty);
  if (!Number.isInteger(q) || q < 1) errors.push('Pick at least 1 ticket.');
  else if (q > MAX_QTY) errors.push(`At most ${MAX_QTY} tickets per order.`);
  if (errors.length > 0) return { ok: false, errors, ticket: null, qty: 0, totalCents: 0 };
  return { ok: true, errors: [], ticket, qty: q, totalCents: ticket.priceCents * q };
}

/** Public-safe catalog for the client (no secrets here — prices are public). */
export function publicCatalog() {
  return TICKETS.map((t) => ({ id: t.id, name: t.name, blurb: t.blurb, priceCents: t.priceCents }));
}
