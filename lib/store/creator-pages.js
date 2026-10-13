// lib/store/creator-pages.js
// Pure helpers for the creator storefronts + creations marketplace
// (Merlin, 2026-10-13: a marketplace where all user creations are for
// sale, and a shareable page per creator with everything they made).
//
// Turns creation records (lib/store/custom-creations.js — DB rows or
// Stripe product metadata) into CLIENT-SAFE cards. Client-safe means:
// no creator email, no baseline/markup breakdown (that's the creator's
// own business — the price shown and charged is the recorded final
// price, and the custom buy route re-derives it server-side anyway),
// nothing but what a storefront should show.
//
// Relative imports so the helpers load in plain Node for headless tests.
import { formatMoney } from '../store-printful.js';
import { getCustomProduct } from './custom-products.js';
import { productShareUrl, creatorPagePath } from './share.js';

// The public label for a creator: their public display name when the
// account system exposes one, else the neutral 'Creator'. NEVER an
// email address — a storefront is public.
export function publicCreatorLabel(displayName) {
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  return name || 'Creator';
}

// Human name for a designer template key ('tote-bag' -> 'Tote Bag'),
// from the same server-side template config the designer uses; an
// unknown key degrades to a prettified version of itself.
export function templateNameOf(templateKey) {
  const key = typeof templateKey === 'string' ? templateKey : '';
  const product = key ? getCustomProduct(key) : null;
  if (product && product.name) return product.name;
  if (!key) return 'Custom product';
  return key
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// One creation record -> one marketplace/storefront card (or null when
// the record can't be keyed to a Printful product — it could neither
// be linked nor bought). `catalogImage` is the live catalog card's
// thumbnail for the same product when the caller has it: records whose
// store of record carries no image (DB rows) borrow it, per the
// storefront's "use the record's image, else the catalog's, else the
// placeholder" rule.
export function creationCardFromRecord(record, { catalogImage = null, creatorLabel = null } = {}) {
  if (!record || !record.printfulProductId) return null;
  const printfulId = String(record.printfulProductId);
  const label = publicCreatorLabel(creatorLabel || record.creatorLabel);
  const finalCents = Number.isFinite(record.finalCents) ? record.finalCents : 0;
  const currency = record.currency || 'cad';
  return {
    id: `pf_${printfulId}`,
    printfulId,
    name: record.productName || record.designName || 'Custom creation',
    designName: record.designName || null,
    templateKey: record.templateKey || null,
    templateName: templateNameOf(record.templateKey),
    priceCents: finalCents,
    currency,
    priceLabel: formatMoney(finalCents, currency),
    image: record.image || catalogImage || null,
    creatorUserId: record.creatorUserId || null,
    creatorLabel: label,
    creatorPath: record.creatorUserId ? creatorPagePath(record.creatorUserId) : '',
    storeUrl: productShareUrl(printfulId),
    storePath: `/store?product=${encodeURIComponent(`pf_${printfulId}`)}`,
    createdAt: record.createdAt || null,
  };
}

// Records -> cards. `catalogById` maps bare Printful ids to catalog
// thumbnails; `creatorLabels` maps creator user ids to public display
// names. Order is preserved (callers pass newest-first records).
export function creationCardsFromRecords(records, { catalogById = null, creatorLabels = null } = {}) {
  const cards = [];
  for (const record of records || []) {
    const card = creationCardFromRecord(record, {
      catalogImage:
        catalogById && record && record.printfulProductId
          ? catalogById.get(String(record.printfulProductId)) || null
          : null,
      creatorLabel:
        creatorLabels && record && record.creatorUserId
          ? creatorLabels.get(record.creatorUserId) || null
          : null,
    });
    if (card) cards.push(card);
  }
  return cards;
}
