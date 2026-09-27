// Server-side catalog validation for Olympus checkout.
// Every order is re-priced here from the canonical catalog — client-supplied
// prices, names, or images are ignored. Unknown product ids, invalid sizes,
// and bad quantities are rejected with explicit errors.

import { getProduct, PRICE_CENTS, SIZES } from './products.js';

const MAX_QTY_PER_LINE = 10;
const MAX_LINES = 25;

/**
 * Validate raw cart lines from a client.
 * @param {Array<{id:number|string,size:string,qty:number}>} items
 * @returns {{ ok:boolean, errors:string[], lines:Array, totalCents:number, itemCount:number }}
 */
export function validateItems(items) {
  const errors = [];
  const lines = [];

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, errors: ['Your cart is empty.'], lines, totalCents: 0, itemCount: 0 };
  }
  if (items.length > MAX_LINES) {
    return { ok: false, errors: [`Too many different items (max ${MAX_LINES}).`], lines, totalCents: 0, itemCount: 0 };
  }

  for (let i = 0; i < items.length; i++) {
    const raw = items[i] || {};
    const product = getProduct(raw.id);
    if (!product) {
      errors.push(`Item ${i + 1}: unknown product.`);
      continue;
    }
    const size = String(raw.size || '').toUpperCase();
    if (!SIZES.includes(size)) {
      errors.push(`"${product.name}": pick a size (${SIZES.join(', ')}).`);
      continue;
    }
    const qty = Number(raw.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      errors.push(`"${product.name}": quantity must be 1–${MAX_QTY_PER_LINE}.`);
      continue;
    }
    lines.push({
      productId: product.id,
      name: product.name,
      size,
      qty,
      unitCents: PRICE_CENTS,
      lineTotalCents: PRICE_CENTS * qty,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors, lines: [], totalCents: 0, itemCount: 0 };
  }

  const totalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);
  return { ok: true, errors: [], lines, totalCents, itemCount };
}
