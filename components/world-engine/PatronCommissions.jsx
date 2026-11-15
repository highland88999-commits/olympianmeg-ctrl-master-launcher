// components/world-engine/PatronCommissions.jsx
// PATRON COMMISSIONS — on the forge (Merlin, Nov 15, 2026).
//
// The /weapons-forge page is gone (its interface was removed and
// replaced with the real forge's functions; /weapons-forge now
// redirects to /world-engine/weapons). The patron smiths' function
// moved here, onto the forge: John Hammond, Dracula, the Dwarven
// Smith, and the Kyber Smith each invent a weapon for the
// traveller — once a day, shaped by their craft — and hand it
// straight to the backpack. Commissions are free under a daily
// guard (one per patron per user per day); the scarcity is the
// day, not the price.
//
// Ported from the deleted page's commission section (behaviour
// identical: the same cards, the same hint input, the same daily
// guard, the same notices) — the only change is the path: the
// section calls the forge agent (lib/world-engine/forge-agent.js
// executePatronCommission / loadPatronCommissions), the single
// handler for forge prompts, and the agent calls the kept
// commission route (/api/weapons-forge/commission), which stays
// the agent's backend. Realm links land here with a patron
// preselected (?patron=<id> on /world-engine/weapons): the
// matching card scrolls into view and carries a highlight ring.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PATRONS, PATRON_IDS } from '@/lib/backpack/patrons';
import { executePatronCommission, loadPatronCommissions } from '@/lib/world-engine/forge-agent';
import { flushBackpack, replaceBackpackRecord } from '@/lib/backpack/store';
import MuseEngineChat from '@/components/muse/MuseEngineChat';

/** One short line for a CGI spec: "GLB model · bullet at 350 m/s". */
function cgiLine(cgi) {
  if (!cgi || !cgi.model || !cgi.firing) return '';
  const model = cgi.model.kind === 'glb' ? 'GLB model' : `procedural ${cgi.model.build}`;
  return ` CGI: ${model} · ${cgi.firing.kind} ${cgi.firing.speedMps} m/s.`;
}

async function authHeaders() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data && data.session && data.session.access_token;
    return token ? { Authorization: `Bearer ${token}` } : null;
  } catch {
    return null;
  }
}

export default function PatronCommissions({ initialPatron = null, accent = '#ffd700' }) {
  const [signedIn, setSignedIn] = useState(false);
  const [notice, setNotice] = useState('');
  const [patronThemes, setPatronThemes] = useState(() => Object.fromEntries(PATRON_IDS.map((p) => [p, ''])));
  const [patronBusy, setPatronBusy] = useState('');
  const [patronDone, setPatronDone] = useState(() => Object.fromEntries(PATRON_IDS.map((p) => [p, false])));
  const sectionRef = useRef(null);

  const selectedPatron = PATRON_IDS.includes(initialPatron) ? initialPatron : null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const headers = await authHeaders();
      if (!headers) {
        if (!cancelled) setSignedIn(false);
        return;
      }
      if (!cancelled) setSignedIn(true);
      const data = await loadPatronCommissions({
        fetchImpl: fetch,
        getAuthHeaders: async () => headers,
      });
      if (!cancelled && data.commissions) setPatronDone(data.commissions);
    })();
    return () => { cancelled = true; };
  }, []);

  // A realm link with ?patron=<id> lands here: bring that smith's
  // card into view so the traveller sees who they came to see.
  useEffect(() => {
    if (!selectedPatron) return;
    const el = document.getElementById(`patron-${selectedPatron}`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedPatron]);

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
      const data = await executePatronCommission({
        patron: patronId,
        theme: patronThemes[patronId] || '',
        fetchImpl: fetch,
        getAuthHeaders: async () => headers,
      });
      if (!data.ok) {
        if (data.backpack) replaceBackpackRecord(data.backpack);
        if (data.alreadyCommissioned) {
          setPatronDone((d) => ({ ...d, [patronId]: true }));
        }
        setNotice(data.error || 'The patron could not forge that. Try again.');
        return;
      }
      if (data.backpack) replaceBackpackRecord(data.backpack);
      setPatronDone((d) => ({ ...d, [patronId]: true }));
      setNotice(
        `${PATRONS[patronId].glyph} ${PATRONS[patronId].name} forged you the ${data.weapon.name} ` +
        `(${data.weapon.rarity}, ${data.weapon.weaponClass}, dmg ${data.weapon.damage}) — ` +
        `it is shelved in your backpack.${data.weapon.cgi ? cgiLine(data.weapon.cgi) : ''}`
      );
    } catch {
      setNotice('The forge could not be reached. Your pack is unchanged.');
    } finally {
      setPatronBusy('');
    }
  }, [patronThemes]);

  return (
    <section aria-label="Patron smiths" ref={sectionRef} className="flex flex-col gap-3 border border-gray-800 bg-black/80 p-6">
      <div>
        <h2 className="text-sm font-bold tracking-widest" style={{ color: accent }}>👑 Patron Smiths</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-400">
          Four old hands keep an anvil here. Each will invent a weapon for you —
          once a day, shaped by their craft — and hand it straight to your
          backpack. Give them a hint, or let them surprise you.
        </p>
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {notice}
        </p>
      )}
      {!signedIn && (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-neutral-400">
          Sign in to commission — the patrons forge for account holders.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PATRON_IDS.map((patronId) => {
          const patron = PATRONS[patronId];
          const done = patronDone[patronId];
          const busy = patronBusy === patronId;
          const selected = selectedPatron === patronId;
          return (
            <article
              key={patronId}
              id={`patron-${patronId}`}
              className="flex flex-col gap-2 rounded-2xl border border-amber-200/20 bg-gradient-to-b from-white/[0.05] to-transparent p-4"
              style={selected ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}` } : undefined}
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
      {/* The patrons' Muse chat keeps the weapons-forge engine id:
          it is a chat persona, not the deleted page. */}
      <MuseEngineChat engine="weapons-forge" title="Patron Smiths"
        context={{ signedIn }} accent="#ef4444" />
    </section>
  );
}
