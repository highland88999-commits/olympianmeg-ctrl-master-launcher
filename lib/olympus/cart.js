// Pure cart helpers for the Olympus store. No DOM, no network — the page
// component owns state and persistence; these functions do the math.

/**
 * A cart line: { productId, size, qty }.
 * Lines are unique by productId + size.
 */

export function cartKey(line) {
  return `${line.productId}__${line.size}`;
}

/** Add a line (or bump qty) — returns a NEW cart array. */
export function addLine(cart, { productId, size, qty = 1 }) {
  const key = `${productId}__${size}`;
  const existing = cart.find((l) => cartKey(l) === key);
  if (existing) {
    return cart.map((l) =>
      cartKey(l) === key ? { ...l, qty: Math.min(l.qty + qty, 10) } : l
    );
  }
  return [...cart, { productId, size, qty: Math.max(1, Math.min(qty, 10)) }];
}

/** Remove a line entirely. */
export function removeLine(cart, productId, size) {
  const key = `${productId}__${size}`;
  return cart.filter((l) => cartKey(l) !== key);
}

/** Set a line's quantity (clamped 1–10); qty <= 0 removes the line. */
export function setQty(cart, productId, size, qty) {
  if (qty <= 0) return removeLine(cart, productId, size);
  const key = `${productId}__${size}`;
  const q = Math.max(1, Math.min(10, Math.floor(qty)));
  return cart.map((l) => (cartKey(l) === key ? { ...l, qty: q } : l));
}

/** Total number of items. */
export function countItems(cart) {
  return cart.reduce((s, l) => s + l.qty, 0);
}

/**
 * Enrich cart lines with catalog data and compute the total.
 * Unknown product ids are dropped (defensive; catalog is the source of truth).
 */
export function enrichCart(cart, getProduct, priceCents) {
  const lines = [];
  for (const l of cart) {
    const p = getProduct(l.productId);
    if (!p) continue;
    lines.push({ ...l, name: p.name, image: p.image, unitCents: priceCents });
  }
  const totalCents = lines.reduce((s, l) => s + l.unitCents * l.qty, 0);
  return { lines, totalCents };
}

/** Serialize for localStorage. */
export function serialize(cart) {
  return JSON.stringify(cart);
}

/** Parse from localStorage; returns [] on anything unexpected. */
export function deserialize(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l) =>
        l &&
        Number.isFinite(Number(l.productId)) &&
        typeof l.size === 'string' &&
        Number.isFinite(Number(l.qty))
    );
  } catch {
    return [];
  }
}
