// tests/store-share.test.mjs
// Contract tests for the Omega Store share buttons (Merlin, 2026-10-13:
// a share button beside every product a user makes, and any product or
// category in the store shareable).
// Run: node tests/store-share.test.mjs (from the repo root).
// No browser, no network — the pure helpers in lib/store/share.js only.
//
// The laws under test:
//   - Share URLs are ABSOLUTE on the production origin
//     (https://olympusverse.com) so they work pasted anywhere.
//   - A product's share URL carries its canonical store key `pf_<id>` —
//     the same key checkout and the custom buy route use — whether the
//     caller passes the keyed id (store cards) or the bare numeric id
//     (the designer's create result).
//   - A category's share URL carries the exact category title the store
//     page groups by, URL-encoded.
//   - The anchor ids the helpers compute are the same ids the store
//     page stamps on cards/sections, so the deep-link scroll lands.
//   - Missing/blank ids degrade to the plain storefront URL, never a
//     malformed link.
import {
  STORE_CANONICAL_ORIGIN,
  STORE_PATH,
  productKeyOf,
  productShareUrl,
  categoryShareUrl,
  slugifyAnchor,
  productAnchorId,
  categoryAnchorId,
  productShareTitle,
  productShareText,
  categoryShareTitle,
  categoryShareText,
} from '../lib/store/share.js';

let passed = 0;
let failed = 0;
function eq(actual, expected, label) {
  if (actual === expected) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}
function ok(cond, label) {
  eq(!!cond, true, label);
}

// Canonical origin + path.
eq(STORE_CANONICAL_ORIGIN, 'https://olympusverse.com', 'canonical origin');
eq(STORE_PATH, '/store', 'store path');

// Product key normalization.
eq(productKeyOf('pf_474601990'), 'pf_474601990', 'keyed id passes through');
eq(productKeyOf(474601990), 'pf_474601990', 'numeric id gains the pf_ prefix');
eq(productKeyOf(' 474601990 '), 'pf_474601990', 'bare id is trimmed then keyed');
eq(productKeyOf(''), '', 'empty id -> empty key');
eq(productKeyOf(null), '', 'null id -> empty key');
eq(productKeyOf(undefined), '', 'undefined id -> empty key');

// Product share URLs.
eq(
  productShareUrl('pf_474601990'),
  'https://olympusverse.com/store?product=pf_474601990',
  'product URL from a store card id'
);
eq(
  productShareUrl(474601990),
  'https://olympusverse.com/store?product=pf_474601990',
  'product URL from the designer create result (bare numeric id)'
);
eq(productShareUrl(''), 'https://olympusverse.com/store', 'blank id degrades to the storefront');
eq(productShareUrl(null), 'https://olympusverse.com/store', 'null id degrades to the storefront');
ok(productShareUrl('pf_1').startsWith('https://'), 'product URL is absolute https');

// Category share URLs.
eq(
  categoryShareUrl('Hoodies'),
  'https://olympusverse.com/store?category=Hoodies',
  'category URL carries the exact section title'
);
eq(
  categoryShareUrl('More'),
  'https://olympusverse.com/store?category=More',
  'fallback category shares too'
);
eq(
  categoryShareUrl('T Shirts & Co'),
  'https://olympusverse.com/store?category=T%20Shirts%20%26%20Co',
  'category names are URL-encoded'
);
eq(categoryShareUrl(''), 'https://olympusverse.com/store', 'blank category degrades to the storefront');
eq(categoryShareUrl('  Mugs  '), 'https://olympusverse.com/store?category=Mugs', 'category is trimmed');

// Anchor ids — the store page stamps exactly these on cards/sections.
eq(productAnchorId('pf_474601990'), 'product-pf_474601990', 'product anchor from keyed id');
eq(productAnchorId(474601990), 'product-pf_474601990', 'product anchor from bare id matches');
eq(productAnchorId(''), '', 'blank id -> no anchor');
eq(categoryAnchorId('Hoodies'), 'category-hoodies', 'category anchor slug');
eq(categoryAnchorId('More'), 'category-more', 'fallback category anchor');
eq(slugifyAnchor('T Shirts & Co'), 't-shirts-co', 'slug collapses punctuation runs');
eq(slugifyAnchor('  Posters  '), 'posters', 'slug trims and lowercases');

// The query value in the URL and the anchor id must agree: the store
// page reads ?product= / ?category= and resolves them through the same
// anchor helpers.
eq(
  productAnchorId(new URL(productShareUrl('pf_42')).searchParams.get('product')),
  'product-pf_42',
  'product URL round-trips to its anchor'
);
eq(
  categoryAnchorId(new URL(categoryShareUrl('Mugs')).searchParams.get('category')),
  'category-mugs',
  'category URL round-trips to its anchor'
);

// Share copy.
eq(productShareTitle({ name: 'Hocus Locusts Hoodie' }), 'Hocus Locusts Hoodie', 'product share title is the name');
eq(productShareTitle(null), 'Omega Store', 'missing product still gets a title');
eq(
  productShareText({ name: 'Hocus Locusts Hoodie', priceLabel: 'CA$95.00' }),
  'Hocus Locusts Hoodie — CA$95.00 · Printed on demand at the Omega Store',
  'product share text carries name + price'
);
eq(
  productShareText({ name: 'Mystery Mug' }),
  'Mystery Mug · Printed on demand at the Omega Store',
  'product share text works without a price'
);
eq(categoryShareTitle('Stickers'), 'Stickers · Omega Store', 'category share title');
eq(categoryShareText('Stickers'), 'Stickers — printed on demand at the Omega Store', 'category share text');

console.log(`store-share: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
