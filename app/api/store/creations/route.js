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
// (Stripe product images), else the live Printful catalog thumbnail
// for the same product, else the card renders the store placeholder.
import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { listCreationRecords } from '@/lib/store/custom-creations';
import { creationCardsFromRecords, publicCreatorLabel } from '@/lib/store/creator-pages';
import { getCatalog } from '@/lib/store-printful';
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

// Live catalog thumbnails by bare Printful id, best-effort (the
// catalog fetch is cached server-side; a hiccup just means records
// without their own image fall back to the placeholder).
async function catalogImagesById() {
  const byId = new Map();
  try {
    const cards = await getCatalog();
    for (const card of cards || []) {
      if (card && card.id && card.image) {
        byId.set(String(card.id).replace(/^pf_/, ''), card.image);
      }
    }
  } catch { /* placeholder fallback covers it */ }
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
  const catalogById = needsCatalog ? await catalogImagesById() : new Map();

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
