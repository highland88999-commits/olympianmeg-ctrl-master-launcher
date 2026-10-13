// lib/store/share.js
// Canonical share URLs + share copy for the Omega Store — pure helpers
// (no React, no browser APIs) so they stay headless-testable in
// tests/store-share.test.mjs.
//
// The storefront is a single page: products render as cards and
// categories as sections on /store, and there is no per-product route.
// A product's canonical share URL is therefore
//   https://olympusverse.com/store?product=pf_<Printful sync id>
// — the same `pf_` product key checkout and the custom buy route use —
// and a category's is
//   https://olympusverse.com/store?category=<Category name>
// The store page honours both params: on load it scrolls the shared
// product/category into view and highlights it briefly, so a pasted
// link lands on the exact item, not just the storefront. A link whose
// target is not in the catalog (e.g. a just-created custom product the
// cached catalog has not picked up yet) degrades gracefully to the
// plain storefront.
//
// URLs are absolute on the production origin so they work pasted
// anywhere (messages, social, email), regardless of which deployment
// the sharer happens to be browsing.

export const STORE_CANONICAL_ORIGIN = 'https://olympusverse.com';
export const STORE_PATH = '/store';

// Store product keys are `pf_<Printful sync id>` everywhere (cards from
// lib/store-printful.js, checkout, the custom buy route). The designer's
// create result carries the bare numeric id, so accept both and
// normalize to the keyed form.
export function productKeyOf(id) {
  const s = String(id == null ? '' : id).trim();
  if (!s) return '';
  return s.startsWith('pf_') ? s : `pf_${s}`;
}

export function productShareUrl(id) {
  const key = productKeyOf(id);
  if (!key) return `${STORE_CANONICAL_ORIGIN}${STORE_PATH}`;
  return `${STORE_CANONICAL_ORIGIN}${STORE_PATH}?product=${encodeURIComponent(key)}`;
}

export function categoryShareUrl(category) {
  const c = String(category == null ? '' : category).trim();
  if (!c) return `${STORE_CANONICAL_ORIGIN}${STORE_PATH}`;
  return `${STORE_CANONICAL_ORIGIN}${STORE_PATH}?category=${encodeURIComponent(c)}`;
}

// DOM ids the store page stamps on cards/sections so the deep-link
// scroll can find them. Both sides of the contract live here.
export function slugifyAnchor(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function productAnchorId(id) {
  const key = productKeyOf(id);
  return key ? `product-${key}` : '';
}

export function categoryAnchorId(category) {
  const slug = slugifyAnchor(category);
  return slug ? `category-${slug}` : '';
}

// Share-sheet / clipboard copy. `product` is anything with a name and
// an optional priceLabel (store cards carry priceLabel; the designer
// passes its server-computed final price formatted the same way).
export function productShareTitle(product) {
  return (product && product.name) || 'Omega Store';
}

export function productShareText(product) {
  const name = productShareTitle(product);
  const price = product && product.priceLabel ? ` — ${product.priceLabel}` : '';
  return `${name}${price} · Printed on demand at the Omega Store`;
}

export function categoryShareTitle(category) {
  const c = String(category == null ? '' : category).trim();
  return c ? `${c} · Omega Store` : 'Omega Store';
}

export function categoryShareText(category) {
  const c = String(category == null ? '' : category).trim();
  return c
    ? `${c} — printed on demand at the Omega Store`
    : 'Printed on demand at the Omega Store';
}
