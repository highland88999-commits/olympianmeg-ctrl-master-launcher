'use client';

// components/backpack/usePackTrophies.js
// THE TROPHY HOOK — one shared heal + status read for both backpack panels (Merlin, 2026-11-15).
//
// Medusa's head and the Ghost Rider's flaming chain are earned
// in the realms, but the SERVER is the authority for both
// (GET /api/medusa/heads, GET /api/ghost-rider/chains — { owned,
// upgradeLevel, uses/earnedAt }). The backpack item is the
// local handle. When the server says owned and the pack lacks
// the handle, the pack gains it (lib/backpack/trophies.js —
// pure, tested); the hook also carries the server level/uses so
// the rows show them honestly. Souls ride along too: the
// underworld ledger is the authority (GET /api/afterlife/souls),
// and the pack DISPLAYS the count — souls are ledger currency,
// never a minted item (minting one would double-count the
// ledger), and their use is the Lake of Fire forge, a deliberate
// cast, not an auto-apply.
//
// Both panels share this hook: the profile section runs it on
// sign-in, the realm HUD runs it when its panel opens. Nothing
// is fetched while signed out, and a 503 (table not live yet)
// reads as "server unknown" — the pack stays the interim truth,
// never a fake number.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getBackpackRecord, updateBackpack } from '@/lib/backpack/store';
import { healTrophies } from '@/lib/backpack/trophies';

async function authHeaders() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data && data.session && data.session.access_token;
    return token ? { Authorization: `Bearer ${token}` } : null;
  } catch {
    return null;
  }
}

/**
 * usePackTrophies(active): when active, fetch the trophy + soul
 * statuses and heal the pack. Returns { head, chain, souls }:
 *   head: { owned, level, uses, serverLive } (level/uses null when unknown)
 *   chain: { owned, level, serverLive }
 *   souls: number | null (null = unknown / signed out / ledger not live)
 */
export default function usePackTrophies(active) {
  const [head, setHead] = useState({ owned: false, level: null, uses: null, serverLive: null });
  const [chain, setChain] = useState({ owned: false, level: null, serverLive: null });
  const [souls, setSouls] = useState(null);

  const refresh = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    // Heads + chains: heal when the server says owned.
    try {
      const [headRes, chainRes, soulsRes] = await Promise.all([
        fetch('/api/medusa/heads', { headers, cache: 'no-store' }),
        fetch('/api/ghost-rider/chains', { headers, cache: 'no-store' }),
        fetch('/api/afterlife/souls', { headers, cache: 'no-store' }),
      ]);
      const headData = headRes.ok ? await headRes.json().catch(() => null) : null;
      const chainData = chainRes.ok ? await chainRes.json().catch(() => null) : null;
      const soulsData = soulsRes.ok ? await soulsRes.json().catch(() => null) : null;
      if (headRes.status === 503) setHead((h) => ({ ...h, serverLive: false }));
      else if (headData) {
        setHead({
          owned: !!headData.owned,
          level: typeof headData.upgradeLevel === 'number' ? headData.upgradeLevel : null,
          uses: typeof headData.uses === 'number' ? headData.uses : null,
          serverLive: true,
        });
      }
      if (chainRes.status === 503) setChain((c) => ({ ...c, serverLive: false }));
      else if (chainData) {
        setChain({
          owned: !!chainData.owned,
          level: typeof chainData.upgradeLevel === 'number' ? chainData.upgradeLevel : null,
          serverLive: true,
        });
      }
      if (soulsData && typeof soulsData.souls === 'number') setSouls(soulsData.souls);
      // Heal: server-owned + pack-missing -> the handle appears.
      if ((headData && headData.owned) || (chainData && chainData.owned)) {
        try {
          const rec = getBackpackRecord();
          const healed = healTrophies(rec, {
            headOwned: !!(headData && headData.owned),
            headEarnedAt: headData && headData.earnedAt,
            chainOwned: !!(chainData && chainData.owned),
          });
          if (healed !== rec) updateBackpack(() => healed);
        } catch { /* pack unavailable — the server statuses above still stand */ }
      }
    } catch { /* API unreachable — the pack stays the interim truth */ }
  }, []);

  useEffect(() => {
    if (active) refresh();
  }, [active, refresh]);

  return { head, chain, souls };
}
