// app/api/keepsake/route.js
// POST /api/keepsake { path, imageUrl, title, plaque, palette }
//   -> { ok, id, url: '/keepsake/view/<id>' }
//
// Saves a keepsake globe after the photo reached Storage through the
// signed upload URL. The path is verified to live under the caller's
// own folder, so one user can never claim another's upload. The share
// link is public: anyone with it can open the globe, no sign-in.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';

function cleanText(v, max, fallback) {
  const s = typeof v === 'string' ? v.trim().slice(0, max) : '';
  return s || fallback;
}

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const path = body && body.path;
  const imageUrl = body && body.imageUrl;
  if (typeof path !== 'string' || !path.startsWith(`keepsake-globes/${auth.user.id}/`)) {
    return NextResponse.json({ error: 'That photo upload could not be verified.' }, { status: 400 });
  }
  if (typeof imageUrl !== 'string' || !/^https:\/\//.test(imageUrl)) {
    return NextResponse.json({ error: 'That photo link is not valid.' }, { status: 400 });
  }

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Keepsake saving is not connected yet.' }, { status: 503 });

  // Video columns (media_type, duration_sec) arrive with
  // supabase/keepsake-video.sql. The push may land before the SQL is
  // run: on Postgres 42703 (undefined column) the insert retries
  // WITHOUT them and stashes both values in the palette JSONB instead,
  // so a video keepsake never 500s on a pre-migration database. The
  // viewer reads media_type first, palette.mediaType second.
  const mediaType = body.mediaType === 'video' ? 'video' : 'image';
  const durationSec = Number.isFinite(Number(body.durationSec)) && Number(body.durationSec) > 0
    ? Number(body.durationSec)
    : null;
  const palette = body.palette && typeof body.palette === 'object' ? body.palette : {};
  const row = {
    owner_id: auth.user.id,
    owner_email: auth.user.email || null,
    title: cleanText(body.title, 60, 'Keepsake'),
    plaque: cleanText(body.plaque, 40, 'Keepsake'),
    image_path: path,
    image_url: imageUrl,
    palette,
    is_public: true,
    media_type: mediaType,
    duration_sec: durationSec,
  };

  let inserted;
  try {
    const res = await admin.from('keepsake_globes').insert(row).select('id').single();
    if (res.error) throw res.error;
    inserted = res.data;
  } catch (err) {
    const code = String(err?.code || '');
    const msg = String(err?.message || err);
    if (code === '42703' || /column .* does not exist|undefined_column/i.test(msg)) {
      // Pre-migration database: retry without the video columns,
      // stashing the media type + duration in the palette JSONB.
      const fallbackRow = { ...row };
      delete fallbackRow.media_type;
      delete fallbackRow.duration_sec;
      fallbackRow.palette = { ...palette, mediaType, durationSec };
      const retry = await admin.from('keepsake_globes').insert(fallbackRow).select('id').single();
      if (retry.error) throw retry.error;
      inserted = retry.data;
    } else {
      if (/relation .* does not exist|table .* does not exist|keepsake_globes/i.test(msg)) {
        return NextResponse.json(
          { error: 'Keepsake saving is not set up yet (run supabase/keepsake.sql).' },
          { status: 503 },
        );
      }
      if (/invalid api key/i.test(msg)) {
        return NextResponse.json(
          { error: 'Keepsake saving is not connected yet.' },
          { status: 503 },
        );
      }
      throw err;
    }
  }

  return NextResponse.json({ ok: true, id: inserted.id, url: `/keepsake/view/${inserted.id}` });
});
