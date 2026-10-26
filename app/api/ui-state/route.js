// app/api/ui-state/route.js — per-account UI state (Muse FAB position,
// Concourse Orb position + pinned tiles, backpack circle position, …).
//   GET  /api/ui-state -> { ok: true, preferences }
//   POST /api/ui-state { preferences: { muse_fab: { x, y } } } -> { ok: true, preferences }
//
// Stored in public.account_state.preferences (jsonb, one row per user).
// Writes merge atomically via merge_account_preferences() — other keys are
// never clobbered. Positions are viewport fractions in [0, 1]; validated.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';
import { sanitizeFractions } from '@/lib/muse-fab';
import { sanitizeConcourseBg } from '@/lib/concourse-bg';
import { sanitizeUiSettings } from '@/lib/ui-settings';
import { sanitizeBackpackRecord } from '@/lib/backpack/backpack';

function pickMuseFab(prefs) {
  if (!prefs || typeof prefs !== 'object') return null;
  const v = prefs.muse_fab;
  return v && typeof v === 'object' ? { x: v.x, y: v.y } : null;
}

export const GET = noCache(
  apiGuard(async function GET(req) {
    const auth = await getUserFromRequest(req);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const admin = await getServiceClient();
    if (!admin) return NextResponse.json({ error: 'UI state is not connected yet.', status: 503 });

    const { data, error } = await admin
      .from('account_state')
      .select('preferences')
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ ok: true, preferences: (data && data.preferences) || {} });
  })
);

export const POST = noCache(
  apiGuard(async function POST(req) {
    const auth = await getUserFromRequest(req);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const admin = await getServiceClient();
    if (!admin) return NextResponse.json({ error: 'UI state is not connected yet.', status: 503 });

    const body = await req.json().catch(() => null);
    const prefs = body && body.preferences;
    if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) {
      return NextResponse.json({ error: 'preferences must be an object.' }, { status: 400 });
    }

    // Only known keys are accepted; unknown keys are ignored (never stored).
    const patch = {};
    if ('muse_fab' in prefs) {
      const sane = sanitizeFractions(pickMuseFab(prefs));
      if (!sane) {
        return NextResponse.json({ error: 'muse_fab must be { x, y } with 0..1 numbers.' }, { status: 400 });
      }
      patch.muse_fab = sane;
    }
    if ('concourse_orb' in prefs) {
      const v = prefs.concourse_orb;
      const sane = v && typeof v === 'object' ? sanitizeFractions({ x: v.x, y: v.y }) : null;
      if (!sane) {
        return NextResponse.json({ error: 'concourse_orb must be { x, y } with 0..1 numbers.' }, { status: 400 });
      }
      patch.concourse_orb = sane;
    }
    if ('backpack_icon' in prefs) {
      // The draggable backpack circle's position (same fraction shape
      // and validation as concourse_orb; see lib/backpack/icon.js).
      const v = prefs.backpack_icon;
      const sane = v && typeof v === 'object' ? sanitizeFractions({ x: v.x, y: v.y }) : null;
      if (!sane) {
        return NextResponse.json({ error: 'backpack_icon must be { x, y } with 0..1 numbers.' }, { status: 400 });
      }
      patch.backpack_icon = sane;
    }
    if ('concourse_box' in prefs) {
      // The Concourse glass box's own top-left position (Merlin,
      // 2026-10-22: the box itself must be movable anywhere on
      // screen, not just anchored to the Orb). Same fraction shape
      // and validation as concourse_orb.
      const v = prefs.concourse_box;
      const sane = v && typeof v === 'object' ? sanitizeFractions({ x: v.x, y: v.y }) : null;
      if (!sane) {
        return NextResponse.json({ error: 'concourse_box must be { x, y } with 0..1 numbers.' }, { status: 400 });
      }
      patch.concourse_box = sane;
    }
    if ('concourse_pins' in prefs) {
      // Map of Concourse tile id -> viewport fractions. Tile ids are
      // whitelisted; malformed entries are dropped, never stored.
      const TILE_IDS = ['tour', 'portals', 'intro', 'guide', 'portalroom', 'renewal', 'night', 'bike', 'muse', 'radio', 'store', 'bug', 'alerts', 'profile', 'phone', 'calls', 'settings'];
      const raw = prefs.concourse_pins;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return NextResponse.json({ error: 'concourse_pins must be an object of tile positions.' }, { status: 400 });
      }
      const pins = {};
      for (const [id, v] of Object.entries(raw)) {
        if (!TILE_IDS.includes(id) || !v || typeof v !== 'object') continue;
        const sane = sanitizeFractions({ x: v.x, y: v.y });
        if (sane) pins[id] = sane;
      }
      patch.concourse_pins = pins;
    }
    if ('concourse_bg' in prefs) {
      // Concourse box backdrop: { kind: 'default' } or
      // { kind: 'image'|'video', url: https://… }. Junk is rejected,
      // never stored (sanitizeConcourseBg in lib/concourse-bg).
      const sane = sanitizeConcourseBg(prefs.concourse_bg);
      if (!sane) {
        return NextResponse.json({ error: 'concourse_bg must be { kind: default|image|video, url? }.' }, { status: 400 });
      }
      patch.concourse_bg = sane;
    }
    if ('settings' in prefs) {
      // Account UI settings from the Concourse Settings sheet:
      // { sound: boolean }. Validated like every other key here.
      const sane = sanitizeUiSettings(prefs.settings);
      if (!sane) {
        return NextResponse.json({ error: 'settings must be { sound: boolean }.' }, { status: 400 });
      }
      patch.settings = sane;
    }
    if ('backpack' in prefs) {
      // The Backpack record (Merlin, 2026-10-23): items, style,
      // Earth 2 field tallies — sanitized by lib/backpack (the
      // reticle law is enforced there: no weapon persists without
      // a reticle). Size-guarded: a pack is hundreds of small
      // entries, never megabytes.
      const sane = sanitizeBackpackRecord(prefs.backpack);
      if (JSON.stringify(sane).length > 131072) {
        return NextResponse.json({ error: 'backpack record is too large.' }, { status: 400 });
      }
      patch.backpack = sane;
    }
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
    }

    const { data, error } = await admin.rpc('merge_account_preferences', {
      p_user_id: auth.user.id,
      p_patch: patch,
    });
    if (error) throw error;

    return NextResponse.json({ ok: true, preferences: data || {} });
  })
);
