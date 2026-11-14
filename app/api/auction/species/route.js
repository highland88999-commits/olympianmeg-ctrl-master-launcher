// app/api/auction/species/route.js
// GET /api/auction/species
//   Public, no sign-in needed: the species catalogue as the Auction
//   House shows it — every dataset with its files, sizes, live free
//   counts, and whether the file is actually in the vault yet.
//   The counters come from the service role (the table has no client
//   policies); if the table or bucket does not exist yet the catalogue
//   still returns, with countersLive/vaultReady false, so the panel can
//   say so honestly instead of failing.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient } from '@/lib/world-engine/server';
import { getServiceClient } from '@/lib/economy/supabase';
import {
  SPECIES_BUCKET,
  SPECIES_DATASETS,
  SPECIES_FREE_DOWNLOADS,
  SPECIES_PRICE_CENTS,
  speciesFreeLeft,
  speciesPriceCents,
} from '@/lib/auction/species';

export const GET = apiGuard(async function GET() {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  // Live free counts, per file key. A missing table (SQL not run yet)
  // is not an error here — counts read 0 and countersLive says so.
  let counts = {};
  let countersLive = false;
  try {
    const { data, error } = await admin
      .from('species_download_counts')
      .select('file_key, download_count');
    if (!error && Array.isArray(data)) {
      countersLive = true;
      for (const row of data) {
        counts[String(row.file_key)] = Math.max(0, Math.round(Number(row.download_count) || 0));
      }
    }
  } catch {
    counts = {};
  }

  // Which files are actually in the vault. A missing bucket (SQL not
  // run yet, or files not uploaded) is not an error either — nothing
  // is available and vaultReady says so.
  let availableKeys = new Set();
  let vaultReady = false;
  try {
    const service = await getServiceClient();
    if (service) {
      const { data, error } = await service.storage.from(SPECIES_BUCKET).list('species', { limit: 100 });
      if (!error && Array.isArray(data)) {
        vaultReady = true;
        for (const obj of data) {
          if (obj && obj.name) availableKeys.add(`species/${obj.name}`);
        }
      }
    }
  } catch {
    availableKeys = new Set();
  }

  const datasets = SPECIES_DATASETS.map((d) => ({
    id: d.id,
    title: d.title,
    description: d.description,
    rows: d.rows,
    sheets: d.sheets,
    coverage: d.coverage,
    status: d.status,
    files: d.files.map((f) => {
      const downloads = counts[f.key] || 0;
      return {
        key: f.key,
        label: f.label,
        format: f.format,
        bytes: f.bytes,
        note: f.note,
        downloads,
        downloadsLeft: speciesFreeLeft(downloads),
        priceCents: speciesPriceCents(downloads),
        // A file is downloadable only when its dataset is live AND the
        // object is in the vault. Anatomy flips live the moment its
        // files land — no code change.
        available: d.status === 'live' && availableKeys.has(f.storageKey),
      };
    }),
  }));

  return NextResponse.json({
    ok: true,
    freeDownloads: SPECIES_FREE_DOWNLOADS,
    priceCents: SPECIES_PRICE_CENTS,
    countersLive,
    vaultReady,
    datasets,
  });
});
