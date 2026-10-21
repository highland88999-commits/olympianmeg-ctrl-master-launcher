// app/api/store/creations/route.js
// GET /api/store/creations[?creator=<userId>][&limit=60]
//   -> { ok, creations: [card...], creator: { userId, label } | null,
//        sources: { db, stripe } }
//
// The read API behind the Creator Marketplace (/store/marketplace) and
// the creator storefronts (/store/creator/<userId>). Creations come
// from lib/store/custom-creations.js (listCreationRecords): the
// store_custom_creations table once Merlin's prepared migration runs,
// Stripe product metadata today — merged either way, so pre-migration
// creations are never hidden.
//
// Cards are built by lib/store/creator-pages.js and are public-safe:
// product name, template, recorded final price, image, and the
// creator's PUBLIC display name (from agora_profiles, the same name
// their public profile shows) or the neutral label 'Creator'. Creator
// emails and the baseline/markup breakdown never leave the server.
//
// Images: a record's own mockup when its store of record carries one
// (Stripe product images), else the live Printful catalog image for
// the same product — the list thumbnail when it is a real file, else
// the product's resolved mockup (the list thumbnail is the bare CDN
// root for most products; see getProductImage in lib/store-printful)
// — else the card renders the store placeholder.
import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { listCreationRecords } from '@/lib/store/custom-creations';
import { creationCardsFromRecords, publicCreatorLabel } from '@/lib/store/creator-pages';
import { getCatalog, getProductImage } from '@/lib/store-printful';
import { getServiceClient } from '@/lib/economy/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Public display names for a set of creator ids, best-effort: any
// failure (or no profile row) leaves the neutral 'Creator' label.
async function displayNamesFor(userIds) {
  const labels = new Map();
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return labels;
  try {
    const admin = await getServiceClient();
    if (!admin) return labels;
    const { data, error } = await admin
      .from('agora_profiles')
      .select('user_id, display_name')
      .in('user_id', ids);
    if (error || !Array.isArray(data)) return labels;
    for (const row of data) {
      if (row && row.user_id && typeof row.display_name === 'string' && row.display_name.trim()) {
        labels.set(row.user_id, row.display_name.trim());
      }
    }
  } catch { /* labels are decoration — never fail the list over them */ }
  return labels;
}

// Live catalog images by bare Printful id, best-effort (the catalog
// fetch is cached server-side; a hiccup just means records without
// their own image fall back to the placeholder). Cards whose list
// thumbnail is degenerate carry imagePending — for the handful of
// ids a creations page actually needs, resolve the real mockup
// (cached server-side) so marketplace cards show the product too.
async function catalogImagesById(neededIds) {
  const byId = new Map();
  const pending = new Set();
  try {
    const cards = await getCatalog();
    for (const card of cards || []) {
      if (!card || !card.id) continue;
      const bare = String(card.id).replace(/^pf_/, '');
      if (card.image) byId.set(bare, card.image);
      else if (card.imagePending) pending.add(bare);
    }
  } catch { /* placeholder fallback covers it */ }
  for (const id of neededIds || []) {
    if (byId.has(id) || !pending.has(id)) continue;
    try {
      const url = await getProductImage(id);
      if (url) byId.set(id, url);
    } catch { /* placeholder fallback covers it */ }
  }
  return byId;
}

export const GET = apiGuard(async (req) => {
  const params = req.nextUrl.searchParams;
  const creator = (params.get('creator') || '').trim() || null;
  const limitRaw = Number(params.get('limit') || 60);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.round(limitRaw))) : 60;

  const { records, fromDb, fromStripe } = await listCreationRecords({
    creatorUserId: creator,
    limit,
  });

  const creatorIds = [...new Set(records.map((r) => r.creatorUserId).filter(Boolean))];
  if (creator && !creatorIds.includes(creator)) creatorIds.push(creator);
  const labels = await displayNamesFor(creatorIds);

  const needsCatalog = records.some((r) => !r.image);
  const neededIds = records
    .filter((r) => !r.image && r.printfulProductId)
    .map((r) => String(r.printfulProductId));
  const catalogById = needsCatalog ? await catalogImagesById(neededIds) : new Map();

  const creations = creationCardsFromRecords(records, {
    catalogById,
    creatorLabels: labels,
  });

  return NextResponse.json({
    ok: true,
    creations,
    creator: creator
      ? { userId: creator, label: publicCreatorLabel(labels.get(creator)) }
      : null,
    sources: { db: fromDb, stripe: fromStripe },
  });
});
