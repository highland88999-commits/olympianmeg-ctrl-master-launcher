// app/api/ui-state/route.js — per-account UI state (Muse FAB position,
// Concourse Orb position + pinned tiles, backpack circle position,
// orb-dock spots per world, portal progress, …).
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
import { sanitizeEarthMappedHex } from '@/lib/earth/mapping-progress';
import { sanitizeCheatCodeChecks } from '@/lib/social-media-cheat-code/tracking';
import { sanitizeOrbDockMap } from '@/lib/world/orb-dock';
import { REGISTRY_TABLE, mergeRegistryHex } from '@/lib/earth/global-registry';

function pickMuseFab(prefs) {
  if (!prefs || typeof prefs !== 'object') return null;
  const v = prefs.muse_fab;
  return v && typeof v === 'object' ? { x: v.x, y: v.y } : null;
}

// Portal progress, mirrored from lib/portal/progress.js
// (sanitizePortalProgress) — the route CANNOT import that module:
// it imports useSyncExternalStore, which a server route may not
// pull in (next build fails). Keep the two in step: { v: 1,
// netherVisits, totalPortals, gunGranted }; counts coerce to
// integers >= 0, gunGranted is strictly boolean, a non-object
// coerces to the empty record. Tests pin both copies.
function sanitizePortalProgressPatch(raw) {
  const out = { v: 1, netherVisits: 0, totalPortals: 0, gunGranted: false };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const num0 = (v) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  out.netherVisits = num0(raw.netherVisits);
  out.totalPortals = num0(raw.totalPortals);
  out.gunGranted = raw.gunGranted === true;
  return out;
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
    if ('backpack_icon_v2' in prefs) {
      // The backpack HOME pair (Merlin, 2026-10-26): docked mounts
      // persist their dragged spots under this separate key, so a
      // pre-home parked spot under `backpack_icon` never wins over
      // the home slot. Same fraction shape and validation.
      const v = prefs.backpack_icon_v2;
      const sane = v && typeof v === 'object' ? sanitizeFractions({ x: v.x, y: v.y }) : null;
      if (!sane) {
        return NextResponse.json({ error: 'backpack_icon_v2 must be { x, y } with 0..1 numbers.' }, { status: 400 });
      }
      patch.backpack_icon_v2 = sane;
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
    if ('earth_mapped' in prefs) {
      // Earth 1 mapped-coverage record (Merlin, 2026-10-26):
      // the v1 bitset hex for the reveal discs this account
      // has swept (see lib/earth/mapping-progress.js). Exact-
      // length hex only; anything else is rejected, never
      // stored — an unknown key would be silently ignored, a
      // malformed record must not be.
      const sane = sanitizeEarthMappedHex(prefs.earth_mapped);
      if (!sane) {
        return NextResponse.json({ error: 'earth_mapped must be a v1 mapped-coverage hex string.' }, { status: 400 });
      }
      patch.earth_mapped = sane;
    }
    if ('cheat_code_checks' in prefs) {
      // Social Media Cheat Code room (Merlin, 2026-10-26):
      // per-account, PER-PLATFORM piece checks, keyed
      // platform + piece index (see lib/social-media-cheat-code/
      // tracking.js). Unknown platforms and out-of-range pieces
      // are dropped, never stored; a non-object is rejected.
      const sane = sanitizeCheatCodeChecks(prefs.cheat_code_checks);
      if (sane === null) {
        return NextResponse.json({ error: 'cheat_code_checks must be an object of platform -> piece checks.' }, { status: 400 });
      }
      patch.cheat_code_checks = sane;
    }
    if ('portal-progress' in prefs) {
      // Portal progress (Merlin, Nov 17 ~14:00, sync order): the
      // traveller's count toward the Portal Gun at 10 — { v,
      // netherVisits, totalPortals, gunGranted }. Sanitized by the
      // mirrored sanitizePortalProgressPatch above (the canonical
      // function lives in lib/portal/progress.js, which this route
      // cannot import). A non-object coerces to the empty
      // record — the record is always valid by construction, so
      // this never 400s.
      patch['portal-progress'] = sanitizePortalProgressPatch(prefs['portal-progress']);
    }
    // Orb-dock spots (Merlin, Nov 17 ~14:00, sync order): one key
    // per world, the client's orbDockUiStateKeyFor naming (see
    // lib/world/orb-dock.js). Hollow Earth stores ONE spot {x, y}
    // (its cluster); Jupiter 2 / Middle-earth store one spot PER
    // ORB — a map { orbId: {x, y} }. Future worlds add one entry
    // here (and only here). Unknown world keys are ignored,
    // never stored. A non-object is rejected with a 400, like
    // the other keys; a map's malformed entries are dropped,
    // never stored (the concourse_pins rule).
    const ORB_DOCK_UI_STATE_KEYS = {
      hollow_earth_orb_dock: 'single',
      jupiter2_orb_dock: 'map',
      middleearth_orb_dock: 'map',
    };
    for (const [key, shape] of Object.entries(ORB_DOCK_UI_STATE_KEYS)) {
      if (!(key in prefs)) continue;
      const raw = prefs[key];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return NextResponse.json({ error: `${key} must be an object of positions.` }, { status: 400 });
      }
      if (shape === 'single') {
        const sane = sanitizeFractions(raw);
        if (!sane) {
          return NextResponse.json({ error: `${key} must be { x, y } with 0..1 numbers.` }, { status: 400 });
        }
        patch[key] = sane;
      } else {
        patch[key] = sanitizeOrbDockMap(raw);
      }
    }
    if ('landing_perspective' in prefs) {
      // Onboarding landing setup (Merlin, 2026-10-29): the camera
      // perspective for the initial landing sequence.
      const v = prefs.landing_perspective;
      if (v !== '1st' && v !== '3rd') {
        return NextResponse.json({ error: "landing_perspective must be '1st' or '3rd'." }, { status: 400 });
      }
      patch.landing_perspective = v;
    }
    if ('landing_character' in prefs) {
      // Onboarding landing setup (Merlin, 2026-10-29): the
      // starting character's roster id. Stored as an opaque
      // string; the roster lives in lib/characters/roster.js.
      const v = prefs.landing_character;
      if (typeof v !== 'string' || !v.trim() || v.length > 120) {
        return NextResponse.json({ error: 'landing_character must be a non-empty string.' }, { status: 400 });
      }
      patch.landing_character = v.trim();
    }
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
    }

    const { data, error } = await admin.rpc('merge_account_preferences', {
      p_user_id: auth.user.id,
      p_patch: patch,
    });
    if (error) throw error;

    if (patch.earth_mapped) {
      // Global team registry (Merlin, 2026-10-26): every personal
      // sync OR-merges this account's FULL bitset into their one
      // registry row, so the team total grows monotonically and a
      // subset re-sync can never shrink it. Best-effort on
      // purpose: before the registry migration has been run the
      // table does not exist, and that must never fail the
      // personal sync above (the personal record is the source
      // of truth; the registry is additive). Guests never reach
      // here — this route requires a signed-in user.
      try {
        const { data: row } = await admin
          .from(REGISTRY_TABLE)
          .select('mapped_hex')
          .eq('user_id', auth.user.id)
          .maybeSingle();
        const merged = mergeRegistryHex(row && row.mapped_hex, patch.earth_mapped);
        if (merged) {
          await admin.from(REGISTRY_TABLE).upsert(
            { user_id: auth.user.id, mapped_hex: merged, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );
        }
      } catch {
        // Registry not ready — personal record already saved.
      }
    }

    return NextResponse.json({ ok: true, preferences: data || {} });
  })
);
