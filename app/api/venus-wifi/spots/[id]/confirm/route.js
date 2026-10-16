// app/api/venus-wifi/spots/[id]/confirm/route.js
// POST /api/venus-wifi/spots/:id/confirm
//   "Still here" — a signed-in user confirms this free network still
//   exists. Bumps confirmations and refreshes last_confirmed, which is
//   what keeps a spot on the map (spots unconfirmed for 12 months drop
//   off). Confirming an expired spot revives it.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireUser, PUBLIC_SPOT_COLUMNS } from '@/lib/venus-wifi/server';
import { publicSpot } from '@/lib/venus-wifi/spots';

export const POST = apiGuard(async function POST(req, ctx) {
  const admin = await getServiceClient();
  if (!admin) {
    return Response.json(
      { ok: false, error: 'The WiFi map is not connected yet.' },
      { status: 503 }
    );
  }

  try {
    await requireUser(req, admin);
  } catch (err) {
    return Response.json(
      { ok: false, error: err?.message || 'Sign in to continue.' },
      { status: err?.status === 403 ? 403 : 401 }
    );
  }

  const params = await ctx.params;
  const id = String(params?.id || '').trim();
  if (!id) {
    return Response.json({ ok: false, error: 'Missing spot id.' }, { status: 400 });
  }

  const { data: row, error: readErr } = await admin
    .from('venus_wifi_spots')
    .select(PUBLIC_SPOT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new Error('Could not load that spot.');
  if (!row) {
    return Response.json({ ok: false, error: 'That spot is no longer on the map.' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from('venus_wifi_spots')
    .update({
      confirmations: (row.confirmations ?? 1) + 1,
      last_confirmed: nowIso,
      updated_at: nowIso,
    })
    .eq('id', id)
    .select(PUBLIC_SPOT_COLUMNS)
    .single();
  if (error) throw new Error('Could not confirm that spot.');
  return Response.json({ ok: true, spot: publicSpot(data) });
});
