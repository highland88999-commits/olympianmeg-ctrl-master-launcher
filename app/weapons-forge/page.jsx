'use client';

// app/weapons-forge/page.jsx
// THE WEAPONS FORGE (Merlin, 2026-10-23) — seated under
// HEPHAESTUS / TOOLS in the master portal. Travellers forge
// weapons here and the weapons land in their BACKPACK (the pack
// in their profile that follows them into every realm). Every
// weapon on the shelf carries its reticle — the forge stamps it
// at creation (the reticle law, lib/backpack/backpack.js); the
// gun system will render them when it arrives.
//
// Prices: gold bars (the refinery's currency — the balance of
// record is the refinery save, read + settled by
// /api/weapons-forge) plus backpack materials — fossil specimens
// and blood sacs gathered on Earth 2. Forging is a signed-in act:
// the server validates the price against the account's own
// records before the weapon is shelved.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  FORGE_WEAPONS,
  forgeAffordability,
  forgeMaterialStock,
  forgeWeaponReticle,
} from '@/lib/backpack/weapons';
import { PATRONS, PATRON_IDS } from '@/lib/backpack/patrons';
import {
  flushBackpack,
  replaceBackpackRecord,
  useBackpack,
} from '@/lib/backpack/store';
import MuseEngineChat from '@/components/muse/MuseEngineChat';

const RETICLE_GLYPH = { crosshair: '✛', dot: '•', chevron: '»' };

const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
const RARITY_CLASS = {
  common: 'text-neutral-300 border-white/20',
  uncommon: 'text-green-200 border-green-300/30',
  rare: 'text-sky-200 border-sky-300/30',
  epic: 'text-purple-200 border-purple-300/30',
  legendary: 'text-amber-200 border-amber-300/40',
};

async function authHeaders() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data && data.session && data.session.access_token;
    return token ? { Authorization: `Bearer ${token}` } : null;
  } catch {
    return null;
  }
}

function newIdemKey() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `forge-${crypto.randomUUID()}`;
  } catch { /* fall through */ }
  return `forge-${Date.now().toString(36)}-${Math.floor(Math.random() * 4294967296).toString(36)}`;
}

function costLabel(weapon) {
  const parts = [];
  if (weapon.cost.bars > 0) parts.push(`🧱 ${weapon.cost.bars} bars`);
  for (const m of weapon.cost.materials) {
    parts.push(m.item === 'fossil' ? `🦴 ${m.qty} fossil${m.qty > 1 ? 's' : ''}` : `🩸 ${m.qty} blood sac${m.qty > 1 ? 's' : ''}`);
  }
  return parts.length ? parts.join(' · ') : 'Free';
}

export default function WeaponsForgePage() {
  const record = useBackpack();
  const [bars, setBars] = useState(null);
  const [signedIn, setSignedIn] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const [patronThemes, setPatronThemes] = useState(() => Object.fromEntries(PATRON_IDS.map((p) => [p, ''])));
  const [patronBusy, setPatronBusy] = useState('');
  const [patronDone, setPatronDone] = useState(() => Object.fromEntries(PATRON_IDS.map((p) => [p, false])));

  const loadBars = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) {
      setSignedIn(false);
      setBars(null);
      return;
    }
    setSignedIn(true);
    try {
      const res = await fetch('/api/weapons-forge', { headers, cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (data && typeof data.bars === 'number') setBars(data.bars);
      else setBars(null);
    } catch {
      setBars(null);
    }
  }, []);

  useEffect(() => { void loadBars(); }, [loadBars]);

  const loadCommissions = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    try {
      const res = await fetch('/api/weapons-forge/commission', { headers, cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (data && data.commissions) {
        const next = {};
        for (const p of PATRON_IDS) next[p] = data.commissions[p] === true;
        setPatronDone(next);
      }
    } catch { /* the cards stay commissionable; the server guards the day */ }
  }, []);

  useEffect(() => { void loadCommissions(); }, [loadCommissions]);

  const commission = useCallback(async (patronId) => {
    setNotice('');
    setPatronBusy(patronId);
    try {
      const headers = await authHeaders();
      if (!headers) {
        setNotice('Sign in to commission — the patrons forge for account holders.');
        return;
      }
      await flushBackpack();
      const res = await fetch('/api/weapons-forge/commission', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ patron: patronId, theme: patronThemes[patronId] || '' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        if (data && data.backpack) replaceBackpackRecord(data.backpack);
        if (data && data.alreadyCommissioned) {
          setPatronDone((d) => ({ ...d, [patronId]: true }));
        }
        setNotice((data && data.error) || 'The patron could not forge that. Try again.');
        return;
      }
      if (data.backpack) replaceBackpackRecord(data.backpack);
      setPatronDone((d) => ({ ...d, [patronId]: true }));
      setNotice(
        `${PATRONS[patronId].glyph} ${PATRONS[patronId].name} forged you the ${data.weapon.name} ` +
        `(${data.weapon.rarity}, ${data.weapon.weaponClass}, dmg ${data.weapon.damage}) — ` +
        `it is shelved in your backpack.`
      );
    } catch {
      setNotice('The forge could not be reached. Your pack is unchanged.');
    } finally {
      setPatronBusy('');
    }
  }, [patronThemes]);

  const stock = useMemo(() => forgeMaterialStock(record), [record]);
  const ownedNames = useMemo(
    () => new Set(record.items.filter((e) => e.kind === 'weapon').map((e) => e.id)),
    [record]
  );

  const forge = useCallback(async (weapon) => {
    setNotice('');
    setBusyId(weapon.id);
    try {
      const headers = await authHeaders();
      if (!headers) {
        setNotice('Sign in to forge — the smith works for account holders.');
        return;
      }
      // The server judges the price against the account copy of
      // the pack: flush this device's record first so the freshest
      // finds are on the scale.
      await flushBackpack();
      const res = await fetch('/api/weapons-forge', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ weaponId: weapon.id, idemKey: newIdemKey() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        if (data && data.backpack) replaceBackpackRecord(data.backpack);
        if (data && typeof data.bars === 'number') setBars(data.bars);
        setNotice((data && data.error) || 'The forge refused that work. Try again.');
        return;
      }
      if (data.backpack) replaceBackpackRecord(data.backpack);
      if (typeof data.bars === 'number') setBars(data.bars);
      setNotice(data.duplicate
        ? `${weapon.name} was already on the anvil — no double charge.`
        : `⚒️ ${weapon.name} forged and shelved in your backpack — reticle set (${forgeWeaponReticle(weapon)}).`);
    } catch {
      setNotice('The forge could not be reached. Your pack is unchanged.');
    } finally {
      setBusyId('');
    }
  }, []);

  const shelf = useMemo(
    () => [...FORGE_WEAPONS].sort((a, b) => (RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]) || (a.damage - b.damage)),
    []
  );

  return (
    <main className="min-h-dvh bg-[#0a0705] text-neutral-100 px-4 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-[11px] font-bold tracking-[0.35em] uppercase text-orange-300/80">
            Hephaestus · Tools
          </p>
          <h1 className="text-3xl font-black tracking-tight">⚒️ The Weapons Forge</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">
            Forge a weapon and it is shelved in your{' '}
            <Link href="/profile" className="text-amber-200 underline">backpack</Link>{' '}
            — the pack that follows you into every realm. Every weapon leaves the anvil
            with its reticle set. Prices are gold bars plus what the wilds provide:
            fossil specimens and blood sacs from Earth 2.
          </p>
        </header>

        {/* The purse — bars (server balance) + pack materials. */}
        <section aria-label="Your purse" className="flex flex-wrap gap-2">
          <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
            🧱 <strong className="text-yellow-100">{bars === null ? '—' : bars.toLocaleString('en-US')}</strong>{' '}
            <span className="text-xs text-neutral-400">gold bars{signedIn ? '' : ' (sign in to forge)'}</span>
          </span>
          <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
            🦴 <strong className="text-amber-100">{stock.fossils}</strong>{' '}
            <span className="text-xs text-neutral-400">fossils in pack</span>
          </span>
          <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
            🩸 <strong className="text-red-200">{stock.bloodSacs}</strong>{' '}
            <span className="text-xs text-neutral-400">blood sacs in pack</span>
          </span>
          <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
            🎒 <strong className="text-neutral-100">{record.items.filter((e) => e.kind === 'weapon').length}</strong>{' '}
            <span className="text-xs text-neutral-400">weapons owned</span>
          </span>
        </section>

        {notice && (
          <p role="status" className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {notice}
          </p>
        )}
        {!signedIn && (
          <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-neutral-400">
            You are browsing the shelf signed out. The catalogue is open to everyone;
            forging needs an account so the price can be judged against your own
            bars and pack.
          </p>
        )}

        {/* Patron smiths — Hammond and Dracula commission
            AI-created weapons and distribute them to travellers:
            one commission per patron per day, free of bars and
            materials; the scarcity is the day, not the price. */}
        <section aria-label="Patron smiths" className="flex flex-col gap-3">
          <div>
            <h2 className="text-xl font-black tracking-tight">👑 Patron Smiths</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-400">
              Four old hands keep an anvil here. Each will invent a weapon for you —
              once a day, shaped by their craft — and hand it straight to your
              backpack. Give them a hint, or let them surprise you.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PATRON_IDS.map((patronId) => {
              const patron = PATRONS[patronId];
              const done = patronDone[patronId];
              const busy = patronBusy === patronId;
              return (
                <article
                  key={patronId}
                  className="flex flex-col gap-2 rounded-2xl border border-amber-200/20 bg-gradient-to-b from-white/[0.05] to-transparent p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold leading-snug">
                      {patron.glyph} {patron.name}, {patron.title}
                    </h3>
                  </div>
                  <p className="text-sm italic text-neutral-300">“{patron.line}”</p>
                  <p className="text-xs leading-relaxed text-neutral-400">
                    📍 {patron.seat}
                  </p>
                  <p className="text-xs leading-relaxed text-neutral-400">
                    Favours: {patron.favours.join(' · ')}
                  </p>
                  <label className="flex flex-col gap-1 text-xs text-neutral-400">
                    A hint for the smith (optional)
                    <input
                      type="text"
                      maxLength={120}
                      value={patronThemes[patronId]}
                      disabled={!signedIn || done || busy}
                      onChange={(e) => setPatronThemes((t) => ({ ...t, [patronId]: e.target.value }))}
                      placeholder="e.g. a spear that remembers the sea"
                      className="min-h-[44px] rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 disabled:opacity-40"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!signedIn || done || busy}
                    onClick={() => void commission(patronId)}
                    className="min-h-[44px] rounded-xl border border-amber-300/40 bg-amber-500/20 px-4 py-2 text-sm font-bold text-amber-50 transition hover:bg-amber-500/35 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy
                      ? 'The patron is at the anvil…'
                      : done
                        ? 'Forged for you today — return tomorrow'
                        : `✨ Commission a weapon from ${patron.name}`}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        {/* The shelf. */}
        <section aria-label="Forge catalogue" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shelf.map((weapon) => {
            const afford = forgeAffordability(record, weapon, bars === null ? 0 : bars);
            const owned = ownedNames.has(weapon.id);
            const reticle = forgeWeaponReticle(weapon);
            return (
              <article
                key={weapon.id}
                className="flex flex-col gap-2 rounded-2xl border border-orange-200/15 bg-gradient-to-b from-white/[0.05] to-transparent p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-bold leading-snug">{weapon.name}</h2>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${RARITY_CLASS[weapon.rarity] || RARITY_CLASS.common}`}>
                    {weapon.rarity}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-neutral-400">{weapon.blurb}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-300">
                  <span>Class: <strong>{weapon.weaponClass}</strong></span>
                  <span>Damage: <strong>{weapon.damage}</strong></span>
                  <span title="Reticle — set at the forge, carried in your pack">
                    Reticle: <strong>{RETICLE_GLYPH[reticle] || '◎'} {reticle}</strong>
                  </span>
                </div>
                <div className="mt-auto flex flex-col gap-2 pt-1">
                  <span className="text-xs text-neutral-400">{costLabel(weapon)}</span>
                  <button
                    type="button"
                    disabled={!signedIn || busyId === weapon.id}
                    onClick={() => void forge(weapon)}
                    className="min-h-[44px] rounded-xl border border-orange-300/40 bg-orange-500/20 px-4 py-2 text-sm font-bold text-orange-50 transition hover:bg-orange-500/35 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busyId === weapon.id
                      ? 'Forging…'
                      : owned
                        ? 'Forge another'
                        : afford.ok
                          ? '⚒️ Forge it'
                          : '⚒️ Forge it'}
                  </button>
                  {signedIn && !afford.ok && (
                    <span className="text-[11px] leading-snug text-neutral-500">
                      Still needed:{' '}
                      {afford.missing.map((m) => (m.item === 'bars'
                        ? `🧱 ${m.need - m.held} more bars`
                        : m.item === 'fossil'
                          ? `🦴 ${m.need - m.held} more fossils`
                          : `🩸 ${m.need - m.held} more blood sacs`)).join(' · ')}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        <footer className="text-xs leading-relaxed text-neutral-500">
          Bars are minted at the <Link href="/liquid-gold" className="text-amber-200 underline">Liquid Gold refinery</Link>;
          fossils and blood sacs are gathered on <span className="text-neutral-300">Earth 2</span> —
          hunt the Bay, mind the mosquitos, and trade kindly with its residents.
          Forged weapons ride in your backpack from realm to realm.
        </footer>
      </div>
      <MuseEngineChat engine="weapons-forge" title="Weapons Forge"
        context={{ signedIn, bars }} accent="#ef4444" />
    </main>
  );
}
