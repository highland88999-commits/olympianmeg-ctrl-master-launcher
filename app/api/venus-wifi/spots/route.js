// app/api/venus-wifi/spots/route.js
// GET  /api/venus-wifi/spots?lat=<deg>&lng=<deg>&radiusKm=5
//        -> public: live spots within the radius, nearest first, each with
//           distanceKm + bearing. No contributor data, ever.
// POST /api/venus-wifi/spots  { ssid, lat, lng, openFree: true, note?, source? }
//        -> signed-in users only. A contribution that matches an existing
//           spot (same SSID within ~75 m) MERGES into it: confirmations +1,
//           last_confirmed refreshed. Otherwise a new spot is inserted.
//        The future native background logger posts through this same route
//        with source: 'auto'.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import {
  getServiceClient,
  requireUser,
  fetchLiveSpots,
  fetchMergeCandidates,
} from '@/lib/venus-wifi/server';
import {
  validateSpotInput,
  findMergeCandidate,
  publicSpot,
  spotsWithinRadius,
  DEFAULT_RADIUS_KM,
} from '@/lib/venus-wifi/spots';

function authFail(err) {
  return Response.json(
    { ok: false, error: err?.message || 'Sign in to continue.' },
    { status: err?.status === 403 ? 403 : 401 }
  );
}

const NOT_CONNECTED = {
  ok: false,
  error: 'The WiFi map is not connected yet.',
  spots: [],
};

export const GET = apiGuard(async function GET(req) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng') ?? url.searchParams.get('lon'));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return Response.json(
      { ok: false, error: 'Send lat and lng so we can find the spots near you.', spots: [] },
      { status: 400 }
    );
  }
  const radiusRaw = Number(url.searchParams.get('radiusKm'));
  const radiusKm = Number.isFinite(radiusRaw)
    ? Math.min(50, Math.max(0.1, radiusRaw))
    : DEFAULT_RADIUS_KM;

  const admin = await getServiceClient();
  if (!admin) return Response.json(NOT_CONNECTED, { status: 503 });

  const rows = await fetchLiveSpots(admin);
  const spots = spotsWithinRadius(rows.map(publicSpot), { lat, lng }, radiusKm);
  return Response.json({ ok: true, radiusKm, count: spots.length, spots });
});

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) return Response.json(NOT_CONNECTED, { status: 503 });

  let user;
  try {
    user = await requireUser(req, admin);
  } catch (err) {
    return authFail(err);
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Send the spot as JSON.' }, { status: 400 });
  }
  const checked = validateSpotInput(body);
  if (!checked.ok) {
    return Response.json({ ok: false, error: checked.error }, { status: 400 });
  }
  const value = checked.value;
  const nowIso = new Date().toISOString();

  // Duplicate merge: same network within ~75 m is the same spot.
  const candidates = await fetchMergeCandidates(admin, value.ssid);
  const existing = findMergeCandidate(candidates, value);
  if (existing) {
    const patch = {
      confirmations: (existing.confirmations ?? 1) + 1,
      last_confirmed: nowIso,
      updated_at: nowIso,
    };
    if (!existing.note && value.note) patch.note = value.note;
    const { data, error } = await admin
      .from('venus_wifi_spots')
      .update(patch)
      .eq('id', existing.id)
      .select('id, ssid, open_free, lat, lng, note, confirmations, first_seen, last_confirmed, updated_at')
      .single();
    if (error) throw new Error('Could not update that spot.');
    return Response.json({ ok: true, merged: true, spot: publicSpot(data) });
  }

  const { data, error } = await admin
    .from('venus_wifi_spots')
    .insert({
      ssid: value.ssid,
      open_free: true,
      lat: value.lat,
      lng: value.lng,
      note: value.note,
      source: value.source,
      contributor_id: user.id,
      confirmations: 1,
      first_seen: nowIso,
      last_confirmed: nowIso,
    })
    .select('id, ssid, open_free, lat, lng, note, confirmations, first_seen, last_confirmed, updated_at')
    .single();
  if (error) throw new Error('Could not save that spot.');
  return Response.json({ ok: true, merged: false, spot: publicSpot(data) }, { status: 201 });
});
