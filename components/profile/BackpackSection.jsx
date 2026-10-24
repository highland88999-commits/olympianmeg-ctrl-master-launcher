'use client';

// components/profile/BackpackSection.jsx
// THE BACKPACK on the profile (Merlin, 2026-10-23): the pack that
// follows the traveller into every realm. The header reads the
// REAL server balances (gold + aether from their ledgers, gold
// bars from the refinery save) — the pack displays the currency,
// the ledgers own it. Below: the chosen pack style (GTA-flavoured
// packs lead the shelf) rendered as the pack's frame, and the
// contents grouped Weapons / Materials / Collectibles /
// Consumables. Earth 2's field tallies (Dracula & Hammond
// counters) ride in the record too and are labelled as what they
// are — field tallies, not ledger balances.
//
// Contents come from the backpack store (lib/backpack/store.js):
// account-persisted when signed in, device-local when not — the
// section says which, in plain words.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  BACKPACK_STYLES,
  backpackStyleById,
  equippedWeaponEntry,
  itemsOfKind,
  lightsaberEntry,
  setActiveWeapon,
  setBackpackStyle,
} from '@/lib/backpack/backpack';
import { useBackpack, updateBackpack } from '@/lib/backpack/store';
import { fossilItemsFromRecord, sacCount } from '@/lib/backpack/earth2-bridge';

async function authHeaders() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data && data.session && data.session.access_token;
    return token ? { Authorization: `Bearer ${token}` } : null;
  } catch {
    return null;
  }
}

const KIND_GROUPS = [
  { kind: 'weapon', label: 'Weapons', icon: '⚔️' },
  { kind: 'material', label: 'Materials', icon: '🧪' },
  { kind: 'collectible', label: 'Collectibles', icon: '💠' },
  { kind: 'consumable', label: 'Consumables', icon: '🧴' },
];

const RETICLE_GLYPH = { crosshair: '✛', dot: '•', chevron: '»' };

export default function BackpackSection() {
  const record = useBackpack();
  const [balances, setBalances] = useState({ gold: null, aether: null, bars: null });
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const headers = await authHeaders();
      if (!headers) {
        if (alive) setSignedIn(false);
        return;
      }
      if (alive) setSignedIn(true);
      try {
        const [goldRes, refRes] = await Promise.all([
          fetch('/api/economy/balance', { headers, cache: 'no-store' }),
          fetch('/api/economy/refinery/state', { headers, cache: 'no-store' }),
        ]);
        const goldData = await goldRes.json().catch(() => null);
        const refData = await refRes.json().catch(() => null);
        if (!alive) return;
        setBalances({
          gold: goldData && typeof goldData.gold === 'number' ? goldData.gold : null,
          aether: refData && typeof refData.aetherBalance === 'number' ? refData.aetherBalance : null,
          bars: refData && refData.saved && refData.saved.gameState
            ? Math.max(0, Math.floor(Number(refData.saved.gameState.bars) || 0))
            : null,
        });
      } catch {
        // balances stay null and render as — (never a fake number)
      }
    })();
    return () => { alive = false; };
  }, []);

  const style = backpackStyleById(record.style) || BACKPACK_STYLES[0];
  const fossils = useMemo(() => fossilItemsFromRecord(record), [record]);
  const sacs = sacCount(record);
  const equipped = equippedWeaponEntry(record);
  const saber = lightsaberEntry(record);
  const saberEquipped = saber && equipped && equipped.uid === saber.uid;
  const REALM_LABELS = {
    hub: 'the hub', 'earth-2': 'Earth 2', 'star-wars': 'Star Wars',
    'middle-earth': 'Middle-earth', 'hollow-earth': 'the Monsterverse',
    mars: 'Mars', planet: 'a planet realm',
  };
  const equippedRealmLabel = record.activeWeaponRealm
    ? (REALM_LABELS[record.activeWeaponRealm] || record.activeWeaponRealm)
    : null;
  const groups = useMemo(
    () => KIND_GROUPS.map((g) => ({ ...g, items: itemsOfKind(record, g.kind) })),
    [record]
  );
  const totalItems = record.items.reduce((n, e) => n + e.qty, 0);

  const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : '—');

  return (
    <section
      aria-label="Backpack"
      className="rounded-2xl border-2 p-5"
      style={{
        borderColor: style.trim,
        background: `linear-gradient(160deg, ${style.shell} 0%, rgba(10,10,18,0.92) 55%)`,
        boxShadow: `0 0 24px ${style.trim}33`,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h2 className="text-sm font-bold tracking-[0.3em] uppercase text-neutral-100">
          🎒 Backpack
        </h2>
        <span
          className="text-[11px] font-bold tracking-widest uppercase rounded-full px-2.5 py-1 border"
          style={{ color: style.accent, borderColor: `${style.trim}88` }}
        >
          {style.name}
        </span>
      </div>
      <p className="text-xs text-neutral-400 mb-4">
        Your pack follows you into every realm. Forged weapons live here; your currency
        rides in the header. {signedIn
          ? 'Saved to your account — it meets you on any device you sign in on.'
          : 'You are signed out, so this pack lives on this device only.'}
      </p>

      {/* Equipped weapon — the one the realms fight with, set from
          any realm's backpack panel; the realm note names where
          the last equip happened. */}
      <p className="text-sm mb-4">
        {equipped ? (
          <>⚔ Equipped: <strong className="text-amber-200">{equipped.name}</strong>
            {equippedRealmLabel ? <span className="text-neutral-400"> — last equipped in {equippedRealmLabel}</span> : null}</>
        ) : (
          <>⚔ No weapon equipped — open the 🎒 button in any realm to equip one.</>
        )}
      </p>

      {/* Lightsaber slot (Merlin, 2026-10-24): a link to the
          Kyber Smith's crystal forge until the first saber is
          created, then the saber itself lives here, with the
          same global Equip/Unequip as the realm panels. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-cyan-400/10 border border-cyan-300/25 px-3 py-2 text-sm mb-4">
        <span className="font-bold">🔦 Lightsaber</span>
        {!saber ? (
          <Link href="/weapons-forge" className="text-cyan-100 underline font-bold">
            Forge your first saber →
          </Link>
        ) : (
          <>
            <span className="font-semibold text-neutral-100">{saber.name}</span>
            {typeof saber.meta.damage === 'number' && (
              <span className="text-xs text-neutral-400">dmg {saber.meta.damage}</span>
            )}
            {saberEquipped ? (
              <>
                <span className="text-amber-200 font-bold text-xs">Equipped</span>
                <button
                  type="button"
                  onClick={() => updateBackpack((rec) => setActiveWeapon(rec, null))}
                  className="text-amber-200 underline text-xs"
                >Unequip</button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => updateBackpack((rec) => setActiveWeapon(rec, saber.uid))}
                className="rounded-full bg-amber-300 px-3 py-1 text-xs font-bold text-neutral-900"
              >Equip</button>
            )}
          </>
        )}
        {!saber && (
          <span className="text-xs text-neutral-400">at the Kyber Smith&apos;s crystal forge</span>
        )}
      </div>

      {/* Currency header — real server balances, read live. */}
      <div className="flex flex-wrap gap-2 mb-4" role="list" aria-label="Currency">
        <span role="listitem" className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm">
          🪙 <strong className="text-amber-200">{fmt(balances.gold)}</strong>{' '}
          <span className="text-neutral-400 text-xs">gold</span>
        </span>
        <span role="listitem" className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm">
          ◆ <strong className="text-cyan-200">{fmt(balances.aether)}</strong>{' '}
          <span className="text-neutral-400 text-xs">aether</span>
        </span>
        <span role="listitem" className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm">
          🧱 <strong className="text-yellow-100">{fmt(balances.bars)}</strong>{' '}
          <span className="text-neutral-400 text-xs">gold bars</span>
        </span>
        {(record.tallies.gold > 0 || record.tallies.aether > 0) && (
          <span role="listitem" className="rounded-xl bg-purple-400/10 border border-purple-300/25 px-3 py-2 text-sm">
            🧛 <strong className="text-purple-100">{fmt(record.tallies.gold)}</strong>{' '}
            <span className="text-purple-200/70 text-xs">E2 gold</span>{' '}
            ◆ <strong className="text-purple-100">{fmt(record.tallies.aether)}</strong>{' '}
            <span className="text-purple-200/70 text-xs">E2 aether — Earth 2 field tallies</span>
          </span>
        )}
      </div>

      {/* Style picker — the pack's frame. Colourway buttons, 44px+. */}
      <div className="mb-5">
        <div id="backpack-style-label" className="text-[11px] tracking-[0.25em] uppercase text-neutral-400 mb-2">
          Pack style
        </div>
        <div role="radiogroup" aria-labelledby="backpack-style-label" className="flex flex-wrap gap-2">
          {BACKPACK_STYLES.map((s) => {
            const active = s.id === record.style;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => updateBackpack((rec) => setBackpackStyle(rec, s.id))}
                className="min-h-[44px] rounded-xl border-2 px-3 py-2 text-left transition-transform"
                style={{
                  borderColor: active ? s.trim : 'rgba(255,255,255,0.14)',
                  background: s.shell,
                  transform: active ? 'scale(1.03)' : 'scale(1)',
                }}
              >
                <span className="block text-xs font-bold" style={{ color: s.accent }}>{s.name}</span>
                <span className="block text-[10px] text-neutral-400 max-w-[180px]">{s.blurb}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Contents, grouped. */}
      {totalItems === 0 ? (
        <p className="text-sm text-neutral-400">
          Your pack is empty — for now. Hunt Earth 2, trade with its strange residents,
          or <Link href="/weapons-forge" className="text-amber-200 underline">forge your first weapon</Link>.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (g.items.length ? (
            <div key={g.kind}>
              <h3 className="text-[11px] tracking-[0.25em] uppercase text-neutral-400 mb-2">
                {g.icon} {g.label}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {g.items.map((e) => (
                  <li
                    key={e.uid}
                    className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm"
                  >
                    <span className="font-semibold text-neutral-100">{e.name}</span>
                    {e.qty > 1 && <span className="text-neutral-400 text-xs">× {e.qty}</span>}
                    {e.kind === 'weapon' && e.meta && (
                      <span className="text-xs text-neutral-400">
                        {e.meta.weaponClass || 'blade'}
                        {typeof e.meta.damage === 'number' ? ` · dmg ${e.meta.damage}` : ''}
                        {e.meta.rarity ? ` · ${e.meta.rarity}` : ''}
                      </span>
                    )}
                    {e.kind === 'weapon' && e.meta && e.meta.reticle && (
                      <span
                        className="ml-auto rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-cyan-100"
                        title="Reticle — every weapon ships with one"
                      >
                        {RETICLE_GLYPH[e.meta.reticle.style] || '◎'} {e.meta.reticle.style}
                      </span>
                    )}
                    {e.kind === 'weapon' && e.meta && e.meta.aiGenerated && e.meta.forgedBy && (
                      <span
                        className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-amber-100"
                        title="AI-created by a patron smith at the Weapons Forge"
                      >
                        ✨ Forged by {({ hammond: 'John Hammond', dracula: 'Dracula', dwarf: 'the Dwarven Smith', kyber: 'the Kyber Smith' })[e.meta.forgedBy] || 'a patron smith'}
                      </span>
                    )}
                    {e.meta && e.meta.fossil && (
                      <span className="text-xs text-neutral-400">
                        {e.meta.fossil.speciesName || e.meta.fossil.species} · {e.meta.fossil.condition} · {e.meta.fossil.goldValue}g
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null))}
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-xs text-neutral-500">
        <span>🦴 Fossils held: {fossils.length}</span>
        <span>🩸 Blood sacs: {sacs}</span>
        <Link href="/weapons-forge" className="text-amber-200 underline">⚒️ Visit the Weapons Forge</Link>
      </div>
    </section>
  );
}
