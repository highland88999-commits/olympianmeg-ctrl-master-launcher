// app/api/keepsake/[id]/route.js
// GET /api/keepsake/[id] -> { ok, globe }
// Public read: a shared keepsake opens for anyone with the link, no
// sign-in. Only globes marked public are ever returned.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { apiGuard } from '@/lib/api-guard';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = apiGuard(async function GET(_req, ctx) {
  // Next 14 hands params as an object; newer Next hands a promise.
  // Accept both so the viewer never breaks on a framework bump.
  const rawParams = ctx && ctx.params;
  const params = rawParams && typeof rawParams.then === 'function' ? await rawParams : rawParams;
  const globeId = params && typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(globeId)) {
    return NextResponse.json({ error: 'That keepsake link is not valid.' }, { status: 400 });
  }

  let row;
  try {
    // Video columns (media_type, duration_sec) arrive with
    // supabase/keepsake-video.sql. On a pre-migration database the
    // select fails with 42703 — retry without them; the viewer then
    // reads the media type from palette.mediaType instead.
    const withVideo = await supabase
      .from('keepsake_globes')
      .select('id, title, plaque, image_url, palette, media_type, duration_sec, created_at')
      .eq('id', globeId)
      .eq('is_public', true)
      .maybeSingle();
    if (withVideo.error) {
      const code = String(withVideo.error.code || '');
      if (code === '42703' || /column .* does not exist|undefined_column/i.test(withVideo.error.message || '')) {
        const plain = await supabase
          .from('keepsake_globes')
          .select('id, title, plaque, image_url, palette, created_at')
          .eq('id', globeId)
          .eq('is_public', true)
          .maybeSingle();
        if (plain.error) throw plain.error;
        row = plain.data;
      } else {
        throw withVideo.error;
      }
    } else {
      row = withVideo.data;
    }
  } catch (err) {
    const msg = String(err?.message || err);
    if (/relation .* does not exist|table .* does not exist|keepsake_globes/i.test(msg)) {
      return NextResponse.json(
        { error: 'Keepsake sharing is not set up yet (run supabase/keepsake.sql).' },
        { status: 503 },
      );
    }
    if (/invalid api key/i.test(msg)) {
      return NextResponse.json(
        { error: 'Keepsake sharing is not connected yet.' },
        { status: 503 },
      );
    }
    throw err;
  }

  if (!row) return NextResponse.json({ error: 'That keepsake does not exist or is not shared.' }, { status: 404 });
  return NextResponse.json({ ok: true, globe: row });
});
