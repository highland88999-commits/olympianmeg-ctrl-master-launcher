// app/api/earth2/model-urls/route.js
// POST /api/earth2/model-urls { keys?: string[] }
//   → { ok: true, urls: { '<key>': '<signed url>' }, expiresIn: 3600 }
//
// THE EARTH 2 ASSET LOCK (Merlin, 2026-10-22): "No characters for
// earth 2 should appear anywhere in the multiverse except in earth 2
// file which is behind lock and key to my account until oblivion
// day." The foundry GLBs therefore live in the PRIVATE Supabase
// Storage bucket 'earth2-models' (supabase/earth2-models-bucket.sql),
// addressed by relative keys ('tyrannosaurus-rex.glb'). This route is
// the only door: it verifies the session server-side against the
// Earth 2 access law (lib/earth2/access.js — the owner, plus since
// the 2026-10-23 proof of concept the one named guest; everyone
// else gets a 404, this surface does not admit it exists), then
// mints short-lived signed URLs with the service role.
//
// The request can only ever narrow the set: keys are filtered
// against the manifest allowlist (lib/earth2/models.js), unknown keys
// are dropped silently, and the response never enumerates the vault
// beyond what the owner asked for. Until the bucket exists the route
// answers setupRequired — the Bay falls back to the public files
// while EARTH2_PUBLIC_FALLBACK holds (see lib/earth2/models.js).

import { NextResponse } from 'next/server';
import { verifyEarth2AccessSession } from '@/lib/earth2/access';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';
import {
  EARTH2_MODEL_BUCKET,
  EARTH2_SIGNED_URL_TTL_SECONDS,
  earth2ModelKeys,
  isEarth2ModelKey,
} from '@/lib/earth2/models';

export const dynamic = 'force-dynamic';

function notFound() {
  return NextResponse.json({ error: 'Not found.' }, { status: 404 });
}

export const POST = noCache(apiGuard(async function POST(req) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { user } = await verifyEarth2AccessSession(token).catch(() => ({ user: null }));
  if (!user) return notFound();

  let body = null;
  try { body = await req.json(); } catch { body = null; }
  const requested = body && Array.isArray(body.keys) ? body.keys : null;
  const keys = [...new Set(requested ? requested.filter(isEarth2ModelKey) : earth2ModelKeys())];
  if (!keys.length) {
    return NextResponse.json({ ok: true, urls: {}, expiresIn: EARTH2_SIGNED_URL_TTL_SECONDS });
  }

  const db = await getServiceClient();
  if (!db) {
    return NextResponse.json({ ok: false, setupRequired: true, error: 'Model vault is not connected yet.' });
  }

  const { data, error } = await db.storage
    .from(EARTH2_MODEL_BUCKET)
    .createSignedUrls(keys, EARTH2_SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    // Bucket not created or objects not uploaded yet — the honest
    // setup state; the chamber falls back while the flag holds.
    return NextResponse.json({ ok: false, setupRequired: true, error: 'Model vault is not set up yet.' });
  }

  const urls = {};
  for (const row of data) {
    if (row && row.path && row.signedUrl) urls[row.path] = row.signedUrl;
  }
  return NextResponse.json({ ok: true, urls, expiresIn: EARTH2_SIGNED_URL_TTL_SECONDS });
}));
