// app/api/venus-wifi/snapshot/route.js
// GET /api/venus-wifi/snapshot
//   -> public: the whole live map as one downloadable snapshot:
//      { ok, version, generatedAt, checksum, spots }
//      spots use the light shape { ssid, lat, lng, note, lastConfirmed }
//      with expired spots (unconfirmed for 12 months) already excluded
//      server-side. checksum = sha256 hex of the canonical string of
//      { version, spots } (see lib/venus-wifi/spots.js) — the client
//      verifies it before REPLACING its stored copy, so a corrupt or
//      partial download never wipes a good list. Viewing the downloaded
//      list needs no connection at all.
export const dynamic = 'force-dynamic';

import { createHash } from 'node:crypto';
import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, fetchLiveSpots } from '@/lib/venus-wifi/server';
import { buildSnapshot, snapshotCanonicalString } from '@/lib/venus-wifi/spots';

export const GET = apiGuard(async function GET() {
  const admin = await getServiceClient();
  if (!admin) {
    return Response.json(
      { ok: false, error: 'The WiFi map is not connected yet.' },
      { status: 503 }
    );
  }
  const rows = await fetchLiveSpots(admin);
  const snap = buildSnapshot(rows);
  const checksum = createHash('sha256')
    .update(snapshotCanonicalString(snap), 'utf8')
    .digest('hex');
  return Response.json({
    ok: true,
    version: snap.version,
    generatedAt: snap.generatedAt,
    checksum,
    count: snap.spots.length,
    spots: snap.spots,
  });
});
