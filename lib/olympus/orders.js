// Order-request validation for Olympus (shared by client form + tests).
// An "order request" is the no-card-payment path: the customer sends their
// details and cart, Merlin fulfills it manually. Card payments go through the
// /api/olympus/checkout route instead.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * @param {{ name:string, email:string, notes?:string }} customer
 * @param {Array} items raw cart lines
 * @returns {{ ok:boolean, errors:string[], customer:{name:string,email:string,notes:string} }}
 */
export function validateOrderRequest(customer, items) {
  const errors = [];
  const name = String(customer?.name || '').trim();
  const email = String(customer?.email || '').trim().toLowerCase();
  const notes = String(customer?.notes || '').trim().slice(0, 500);

  if (name.length < 2) errors.push('Please enter your name.');
  else if (name.length > 80) errors.push('Name is too long (max 80 characters).');
  if (!EMAIL_RE.test(email)) errors.push('Please enter a valid email address.');
  if (!Array.isArray(items) || items.length === 0) errors.push('Your cart is empty.');

  return {
    ok: errors.length === 0,
    errors,
    customer: { name: name.slice(0, 80), email: email.slice(0, 120), notes },
  };
}
