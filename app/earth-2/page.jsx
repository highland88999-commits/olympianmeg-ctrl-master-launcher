'use client';

// app/earth-2/page.jsx
// EARTH 2 — THE OWNER TEST CHAMBER (Phase 2 foundation, 2026-10-21).
//
// Merlin's order: Phase 2 begins now, locked behind his account alone
// (olympiannexus@gmail.com) "for testing purposes — no other account
// should be able to see it." So this page gates on the Supabase
// browser session before it renders anything at all: signed-out
// visitors and every other account get a plain not-found screen with
// no Earth 2 branding and no content, and every /api/earth2/* route
// re-verifies the owner server-side (and 404s) besides. The portal
// entries that lead here (Portal Room + Concourse Portals 3D) only
// exist for the owner too — lib/portal-roster.js withOwnerPortals.
//
// Inside: the 1000-parcel map of the new world (buy with gold), the
// Gold Forge (claim what time pours), the rent rule and its ledger,
// and Dinosaur Bay — honestly empty until the Tripo3D foundry
// delivers the real assets for inspection.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isOwnerEmail, OWNER_EMAIL } from '@/lib/owner';
import { PARCELS, PARCEL_COLS, parcelById } from '@/lib/earth2/parcels';
import {
  forgeAccrued,
  FORGE_RATE_GOLD_PER_HOUR,
  FORGE_DAILY_CAP_GOLD,
} from '@/lib/earth2/forge';
import { formatGold } from '@/lib/economy/config';

const TIER_LABEL = { standard: 'Standard', prime: 'Prime', landmark: 'Landmark' };
const KIND_LABEL = { buy: 'Parcel bought', rent: 'Rent', forge: 'Forge claim' };

const fmtDeg = (n) => `${Number(n).toFixed(1)}°`;

export default function Earth2Page() {
  const [gate, setGate] = useState('checking'); // 'checking' | 'locked' | 'open'
  const [myEmail, setMyEmail] = useState('');
  const [state, setState] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => Date.now());
  // Preview mode (database tables not landed yet): the forge clock
  // runs locally from page open so the math is visible; nothing is
  // written anywhere until the real tables exist.
  const [previewStart] = useState(() => Date.now());

  const authHeaders = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data && data.session && data.session.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }, []);

  const loadState = useCallback(async () => {
    try {
      const res = await fetch('/api/earth2/state', { headers: await authHeaders() });
      if (res.status === 404) {
        setGate('locked');
        return;
      }
      const data = await res.json().catch(() => null);
      if (data && data.ok) setState(data);
    } catch {
      /* keep the last good state on screen */
    }
  }, [authHeaders]);

  // The gate: whose session is this? Only the owner's opens the door.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const email = data?.session?.user?.email || '';
        if (!alive) return;
        if (isOwnerEmail(email)) {
          setMyEmail(email);
          setGate('open');
          loadState();
        } else {
          setGate('locked');
        }
      } catch {
        if (alive) setGate('locked');
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      const email = session?.user?.email || '';
      if (isOwnerEmail(email)) {
        setMyEmail(email);
        setGate('open');
        loadState();
      } else {
        setGate('locked');
      }
    });
    return () => {
      alive = false;
      if (sub && sub.subscription) sub.subscription.unsubscribe();
    };
  }, [loadState]);

  // One tick a second so the forge accrual visibly climbs.
  useEffect(() => {
    if (gate !== 'open') return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [gate]);

  const owners = useMemo(() => {
    const map = new Map();
    (state?.parcels || []).forEach((row) => map.set(row.parcel_id, row));
    return map;
  }, [state]);

  const setupRequired = !!(state && state.setupRequired);
  const selected = selectedId ? parcelById(selectedId) : null;
  const selectedRow = selectedId ? owners.get(selectedId) || null : null;

  const forgeLastClaim = setupRequired
    ? previewStart
    : state?.forge?.lastClaim ?? null;
  const accrued = forgeAccrued(forgeLastClaim, now);

  const post = useCallback(
    async (path, payload) => {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(payload || {}),
      });
      return res.json().catch(() => null);
    },
    [authHeaders]
  );

  const buy = async () => {
    if (!selected || busy) return;
    setBusy('buy');
    setNotice('');
    const data = await post('/api/earth2/buy', { parcelId: selected.id });
    if (data?.setupRequired) setNotice('Database setup is still pending — buying switches on when the earth2 tables land.');
    else if (data?.ok) setNotice(`${selected.id} is yours — ${selected.name} joins your titles.`);
    else setNotice(data?.error || 'That purchase did not go through.');
    await loadState();
    setBusy('');
  };

  const claimForge = async () => {
    if (busy || setupRequired) return;
    setBusy('forge');
    setNotice('');
    const data = await post('/api/earth2/forge');
    if (data?.setupRequired) setNotice('Database setup is still pending — the forge lights when the earth2 tables land.');
    else if (data?.lit) setNotice('The forge is lit. Gold is pouring — come back and claim it.');
    else if (data?.ok && data.claimed > 0) setNotice(`The forge poured out ${data.claimed} gold.`);
    else if (data?.ok) setNotice('Nothing to claim yet — the forge is still pouring.');
    else setNotice(data?.error || 'The forge did not answer.');
    await loadState();
    setBusy('');
  };

  const testEntry = async () => {
    if (!selected || busy) return;
    setBusy('rent');
    setNotice('');
    const data = await post('/api/earth2/rent', {
      parcelId: selected.id,
      entryId: `${selected.id}-${Date.now()}`,
    });
    if (data?.setupRequired) setNotice('Database setup is still pending — rent switches on when the earth2 tables land.');
    else if (data?.ok) setNotice(data.message || 'Stepped in free.');
    else setNotice(data?.error || 'That step did not register.');
    await loadState();
    setBusy('');
  };

  if (gate === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050310] text-zinc-500">
        <p className="text-sm tracking-widest">Loading…</p>
      </main>
    );
  }

  if (gate === 'locked') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center text-zinc-900">
        <p className="text-5xl font-light">404</p>
        <p className="mt-3 text-sm text-zinc-500">This page could not be found.</p>
        <a href="/" className="mt-6 text-sm text-zinc-700 underline underline-offset-4">
          Return home
        </a>
      </main>
    );
  }

  const cellClass = (parcel) => {
    const row = owners.get(parcel.id);
    let base = 'bg-white/10';
    if (parcel.tier === 'landmark') base = 'bg-white/30';
    else if (parcel.tier === 'prime') base = 'bg-emerald-200/25';
    if (row && row.owner_email === myEmail) base = 'bg-amber-300';
    else if (row && row.owner_email === OWNER_EMAIL) base = 'bg-violet-400';
    else if (row) base = 'bg-cyan-300';
    const ring = parcel.id === selectedId ? ' ring-2 ring-white ring-inset z-10' : '';
    return `h-3 w-full rounded-[2px] transition hover:brightness-150 sm:h-3.5 ${base}${ring}`;
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050310] text-zinc-100">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(1100px 480px at 50% -120px, rgba(255,176,66,0.13), transparent 60%), radial-gradient(900px 620px at 85% 18%, rgba(88,60,220,0.16), transparent 62%), radial-gradient(760px 560px at 12% 30%, rgba(0,180,220,0.10), transparent 60%)',
        }}
      />
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-24 pt-6">
        <a href="/portal-room" className="text-xs tracking-widest text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline">
          ← PORTAL ROOM
        </a>

        {/* Header */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-4xl font-black tracking-[0.18em] text-amber-100 drop-shadow-[0_0_18px_rgba(255,190,80,0.45)]">
              EARTH 2
            </h1>
            <p className="mt-1 text-[11px] font-bold tracking-[0.3em] text-cyan-200">
              TEST BUILD — PHASE 2
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-amber-300/50 bg-amber-300/10 px-3 py-1.5 text-[11px] font-bold tracking-widest text-amber-100">
              🔒 OWNER ONLY
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-zinc-200">
              🪙 {state && state.gold != null ? formatGold(state.gold) : '—'}
            </span>
          </div>
        </div>

        {setupRequired && (
          <div className="mt-5 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm leading-relaxed text-amber-100">
            Database setup pending — the <span className="font-mono">earth2</span> tables
            (supabase/earth2.sql) have not landed yet. The map and the forge math below are
            live in preview; buying, claiming and rent switch on the moment the tables exist.
          </div>
        )}
        {notice && (
          <div className="mt-5 rounded-2xl border border-cyan-300/40 bg-cyan-300/10 px-4 py-3 text-sm leading-relaxed text-cyan-100">
            {notice}
          </div>
        )}

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
          {/* The parcel map */}
          <section className="rounded-[1.5rem] border border-white/12 bg-white/[0.04] p-4 backdrop-blur-md sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-black tracking-[0.25em] text-zinc-100">
                THE PARCEL MAP
              </h2>
              <span className="text-xs text-zinc-400">1,000 parcels · tap one to see it</span>
            </div>
            <div
              className="mt-4 grid gap-[2px]"
              style={{ gridTemplateColumns: `repeat(${PARCEL_COLS}, minmax(0, 1fr))` }}
              role="grid"
              aria-label="Earth 2 parcel map"
            >
              {PARCELS.map((parcel) => (
                <button
                  key={parcel.id}
                  type="button"
                  title={`${parcel.id} · ${parcel.name}`}
                  aria-label={`${parcel.id} ${parcel.name}`}
                  onClick={() => setSelectedId(parcel.id)}
                  className={cellClass(parcel)}
                />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-zinc-400">
              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] bg-amber-300" />Mine</span>
              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] bg-violet-400" />The house</span>
              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] bg-cyan-300" />Other owners</span>
              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] bg-white/30" />Landmark land</span>
              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] bg-emerald-200/25" />Prime land</span>
              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] bg-white/10" />Open land</span>
            </div>
          </section>

          {/* Right column: parcel detail, forge, rent */}
          <div className="flex flex-col gap-5">
            <section className="rounded-[1.5rem] border border-white/12 bg-white/[0.04] p-5 backdrop-blur-md">
              <h2 className="text-sm font-black tracking-[0.25em] text-zinc-100">THE PARCEL</h2>
              {selected ? (
                <div className="mt-3">
                  <div className="text-2xl font-bold text-zinc-50">{selected.name}</div>
                  <div className="mt-0.5 text-xs tracking-widest text-zinc-400">
                    {selected.id} · {TIER_LABEL[selected.tier]} land
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-zinc-300">
                    <p>
                      {fmtDeg(selected.latMin)} to {fmtDeg(selected.latMax)} latitude ·{' '}
                      {fmtDeg(selected.lonMin)} to {fmtDeg(selected.lonMax)} longitude
                    </p>
                    <p>
                      {selectedRow
                        ? selectedRow.owner_email === myEmail
                          ? 'Owned by you — the title is in your name.'
                          : `Owned by ${selectedRow.owner_email}.`
                        : 'Unowned — open land, waiting for a title.'}
                    </p>
                    <p className="text-amber-100">{formatGold(selected.priceGold)}</p>
                  </div>
                  {!selectedRow && (
                    <button
                      type="button"
                      onClick={buy}
                      disabled={!!busy || setupRequired}
                      className="mt-4 w-full rounded-full border border-amber-300/70 bg-amber-300/15 px-4 py-3 text-sm font-bold tracking-wide text-amber-100 transition hover:bg-amber-300/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy === 'buy' ? 'Buying…' : `Buy for ${formatGold(selected.priceGold)}`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={testEntry}
                    disabled={!!busy || setupRequired}
                    className="mt-2 w-full rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy === 'rent' ? 'Stepping…' : 'Test stepping onto this land'}
                  </button>
                  <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                    Prices are placeholders from the plan — final tile pricing is still
                    Merlin&rsquo;s call.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  Tap any square on the map. Every square is one parcel of the new world —
                  its name, its price, and whose title it carries.
                </p>
              )}
            </section>

            <section className="rounded-[1.5rem] border border-orange-300/25 bg-orange-400/[0.06] p-5 backdrop-blur-md">
              <h2 className="text-sm font-black tracking-[0.25em] text-orange-100">
                🔥 THE GOLD FORGE
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                The forge pours gold while it burns: {FORGE_RATE_GOLD_PER_HOUR} gold an
                hour, up to {FORGE_DAILY_CAP_GOLD.toLocaleString('en-US')} gold a day.
                Time in the world becomes gold in your pocket.
              </p>
              <div className="mt-4 text-3xl font-black text-amber-100">
                {accrued} <span className="text-base font-bold text-zinc-300">gold ready</span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                {forgeLastClaim
                  ? `Burning since ${new Date(forgeLastClaim).toLocaleString()}`
                  : 'Not lit yet — the first claim lights the forge.'}
              </p>
              <button
                type="button"
                onClick={claimForge}
                disabled={!!busy || setupRequired}
                className="mt-4 w-full rounded-full border border-orange-300/70 bg-orange-300/15 px-4 py-3 text-sm font-bold tracking-wide text-orange-100 transition hover:bg-orange-300/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {setupRequired
                  ? 'Forge (setup pending)'
                  : busy === 'forge'
                    ? 'Forging…'
                    : accrued > 0
                      ? `Claim ${accrued} gold`
                      : forgeLastClaim
                        ? 'Claim forge gold'
                        : 'Light the forge'}
              </button>
            </section>

            <section className="rounded-[1.5rem] border border-white/12 bg-white/[0.04] p-5 backdrop-blur-md">
              <h2 className="text-sm font-black tracking-[0.25em] text-zinc-100">
                🚪 RENT — THE HOUSE RULE
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                Step onto someone else&rsquo;s land and rent is charged the moment your
                foot lands: <span className="font-bold text-zinc-100">2 gold</span> — one
                gold to the owner, one gold to the house. Your own land is always free.
              </p>
              <div className="mt-4">
                <div className="text-[11px] font-bold tracking-[0.25em] text-zinc-500">
                  RECENT LEDGER
                </div>
                {state && state.ledger && state.ledger.length ? (
                  <ul className="mt-2 space-y-2">
                    {state.ledger.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-baseline justify-between gap-3 rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-xs"
                      >
                        <span className="min-w-0">
                          <span className="font-semibold text-zinc-100">
                            {KIND_LABEL[row.kind] || row.kind}
                          </span>
                          {row.parcel_id ? (
                            <span className="text-zinc-400"> · {row.parcel_id}</span>
                          ) : null}
                          {row.counterparty ? (
                            <span className="block truncate text-zinc-500">{row.counterparty}</span>
                          ) : null}
                        </span>
                        <span className={row.amount_gold > 0 ? 'font-bold text-emerald-300' : 'font-bold text-zinc-300'}>
                          {row.amount_gold > 0 ? `+${row.amount_gold}` : row.amount_gold} gold
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                    Nothing yet — buys, rent and forge claims land here as they happen.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* Dinosaur Bay — honest empty state until the foundry delivers. */}
        <section className="mt-5 rounded-[1.5rem] border border-dashed border-emerald-300/30 bg-emerald-400/[0.04] p-6 text-center backdrop-blur-md">
          <div aria-hidden="true" className="text-4xl">🦕</div>
          <h2 className="mt-2 text-sm font-black tracking-[0.25em] text-emerald-100">
            DINOSAUR BAY
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-zinc-300">
            Tripo3D assets are in the foundry. The dinosaurs arrive here first — walking,
            eating, sleeping — for inspection before they set foot in Phase 2. This bay
            fills when the real assets land; nothing here is a stand-in.
          </p>
        </section>
      </div>
    </main>
  );
}
