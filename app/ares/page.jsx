'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { BackButton } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { summarize } from '@/lib/ares/intel';
import { findCohorts } from '@/lib/ares/cohorts';
import ThreatGauge from '@/components/ares/ThreatGauge';
import HivePanel from '@/components/ares/HivePanel';
import CohortsPanel from '@/components/ares/CohortsPanel';
import ReviewQueue from '@/components/ares/ReviewQueue';
import ScalingPolicyPanel from '@/components/ares/ScalingPolicyPanel';
import EventsFeed from '@/components/ares/EventsFeed';
import TopLists from '@/components/ares/TopLists';
import ListsManager from '@/components/ares/ListsManager';
import UsersManager from '@/components/ares/UsersManager';
import AttackSources from '@/components/ares/AttackSources';
import ModuleToggles from '@/components/ares/ModuleToggles';
import LearningPanel from '@/components/ares/LearningPanel';
import MollyPanel from '@/components/ares/MollyPanel';
import DuoMathPanel from '@/components/ares/DuoMathPanel';
import BroadcastStudio from '@/components/broadcast/BroadcastStudio';

// ATHENA interior treatment: inline SVG glyph set (zero image weight).
function AresGlyph({ size = 14, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      {children}
    </svg>
  );
}
const GlyphShield = ({ size = 30 }) => (
  <AresGlyph size={size}>
    <path d="M12 3 L20 6 V11 C20 16 16.6 19.4 12 21 C7.4 19.4 4 16 4 11 V6 Z" />
    <path d="M9 11.5 L11.4 14 L15.4 9.6" />
  </AresGlyph>
);
const GlyphRefresh = () => (
  <AresGlyph>
    <path d="M20 12 a8 8 0 1 1 -2.34 -5.66" />
    <path d="M20 3.5 V8 H15.5" />
  </AresGlyph>
);

const ARES_CSS = `
.ares-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: linear-gradient(rgba(5,5,5,0.84), rgba(5,5,5,0.91)), url('/images/ares/bg.webp') center / cover no-repeat, #050505; }
.ares-shell { position: relative; z-index: 1; }
.ares-head { background: linear-gradient(rgba(5,5,5,0.55), rgba(5,5,5,0.78)), url('/images/ares/header.webp') center / cover no-repeat;
  border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 14px 18px; }
.ares-panel { border-radius: 14px; padding: 5px;
  background: linear-gradient(rgba(9,9,14,0.5), rgba(9,9,14,0.58)), url('/images/ares/ares-panel.webp');
  border: 1px solid rgba(255,255,255,0.06); }
.ares-veil { display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; padding: 4rem 1rem; color: #f0abfc; font-size: 0.72rem; letter-spacing: 3px;
  text-transform: uppercase; }
.ares-veil svg { animation: ares-breathe 1.8s ease-in-out infinite; }
@keyframes ares-breathe { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
.ares-empty { display: flex; align-items: center; gap: 10px; margin-top: 1rem;
  border: 1px dashed rgba(240,171,252,0.35); border-radius: 10px; padding: 14px 16px;
  color: #d4a5e8; font-size: 0.85rem; letter-spacing: 1px; }
.ares-refresh { display: inline-flex; align-items: center; gap: 8px; }
@media (prefers-reduced-motion: reduce) { .ares-veil svg { animation: none; } }
`;

// Locked screen: what anyone who is not the keeper sees. ARES aesthetic,
// honest, on-brand — no pop-ups, no redirect tricks. The data routes
// enforce the same lock server-side, so this is the veil, not the vault.
function LockedScreen({ reason }) {
  const signedOut = reason === 'signed-out';
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-[#050505] px-6 py-10 text-center">
      <style>{ARES_CSS}</style>
      <div className="ares-bg" aria-hidden="true" />
      <div className="ares-shell flex w-full max-w-sm flex-col items-center gap-5">
        <div>
          <h1 className="bg-gradient-to-br from-fuchsia-400 to-red-500 bg-clip-text text-4xl font-black uppercase tracking-[0.2em] text-transparent">
            Ares
          </h1>
          <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-zinc-500">
            Autonomous Response and Evidence System
          </p>
        </div>
        <div className="w-full rounded-2xl border border-fuchsia-500/25 bg-fuchsia-500/[0.04] px-6 py-6">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-fuchsia-300">
            Restricted to the throne
          </p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            {signedOut
              ? 'The watchtower answers only to its keeper. Sign in to approach the console.'
              : 'This console is sealed. Only the keeper\u2019s credentials open it \u2014 there is nothing to see here.'}
          </p>
        </div>
        {signedOut ? (
          <BackButton label="Go sign in" href="/" />
        ) : (
          <BackButton label="Exit" />
        )}
      </div>
    </main>
  );
}

// Pin wall: the same passcode door as Molly's sandbox. The form posts
// to /api/molly/gate — the exact same check, so the same pin opens both
// doors. Tab-only: closing the tab locks it again. Like Molly's door,
// this is a privacy screen on top of the keeper gate, not the vault:
// the keeper check and the data routes still enforce who may see
// anything, and no passcode value ever appears in this file.
function PinWall({ onUnlock }) {
  const [passcode, setPasscode] = useState('');
  const [gateError, setGateError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitGate(event) {
    event.preventDefault();
    setGateError('');
    setBusy(true);
    try {
      const res = await fetch('/api/molly/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) {
        setGateError('That didn’t open it.');
        setPasscode('');
        return;
      }
      try { sessionStorage.setItem('ares-unlocked', '1'); } catch {}
      onUnlock();
    } catch {
      setGateError('The door didn’t answer. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-[#050505] px-6 py-10 text-center">
      <style>{ARES_CSS}</style>
      <div className="ares-bg" aria-hidden="true" />
      <div className="ares-shell flex w-full max-w-sm flex-col items-center gap-5">
        <div>
          <h1 className="bg-gradient-to-br from-fuchsia-400 to-red-500 bg-clip-text text-4xl font-black uppercase tracking-[0.2em] text-transparent">
            Ares
          </h1>
          <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-zinc-500">
            Autonomous Response and Evidence System
          </p>
        </div>
        <div className="w-full rounded-2xl border border-fuchsia-500/25 bg-fuchsia-500/[0.04] px-6 py-6 text-left">
          <p className="text-sm text-zinc-400">This console asks for a passcode before it opens — the same door as Molly&apos;s sandbox.</p>
          <form onSubmit={submitGate} className="mt-4 flex flex-col gap-3">
            <label htmlFor="ares-passcode" className="text-xs font-bold uppercase tracking-widest text-zinc-400">Passcode</label>
            <input
              id="ares-passcode"
              type="password"
              autoComplete="off"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter the passcode"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-base text-zinc-100"
            />
            {gateError && <p className="text-sm text-red-400">{gateError}</p>}
            <button type="submit" disabled={busy || !passcode}
              className="rounded-xl bg-fuchsia-400 px-4 py-3 text-sm font-bold text-black disabled:opacity-50">
              {busy ? 'Checking…' : 'Open the door'}
            </button>
          </form>
        </div>
        <BackButton label="Exit" />
      </div>
    </main>
  );
}

export default function AresConsole() {
  const [token, setToken] = useState(null);
  // Owner gate: 'checking' = verifying, 'locked' = sealed shut,
  // 'open' = the keeper is verified. Fail closed — anything unverified
  // sees only the locked screen, never the console.
  const [gate, setGate] = useState('checking');
  const [lockedReason, setLockedReason] = useState('signed-out'); // 'signed-out' | 'sealed'
  // Pin wall state: same door as Molly's sandbox (same pin, same check
  // endpoint), tab-only. Checked after the keeper gate opens.
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pinChecking, setPinChecking] = useState(true);
  useEffect(() => {
    try { if (sessionStorage.getItem('ares-unlocked') === '1') setPinUnlocked(true); } catch {}
    setPinChecking(false);
  }, []);
  const [events, setEvents] = useState([]);
  const [hive, setHive] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  const [regUsers, setRegUsers] = useState([]);
  const [trapped, setTrapped] = useState([]);
  const [sources, setSources] = useState([]);
  const [settings, setSettings] = useState({ sentinelEnabled: true, phalanxEnabled: true, killSwitch: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cloudOffline, setCloudOffline] = useState(false);

  useEffect(() => {
    const init = async () => {
      let auth;
      try {
        auth = supabase.auth; // throws 'Supabase is not configured' when env vars are missing
      } catch {
        setCloudOffline(true);
        return;
      }
      const { data: { session } } = await auth.getSession();
      if (!session) {
        // No session at all — show the locked screen with a sign-in prompt
        // instead of silently bouncing away.
        setLockedReason('signed-out');
        setGate('locked');
        return;
      }
      // Keeper-style gate: the server validates this session's token
      // against the Supabase Auth API and checks it belongs to the
      // console owner. Fail closed — if the gate can't verify, the
      // console stays shut.
      try {
        const res = await fetch('/api/ares/gate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ access_token: session.access_token }),
        });
        if (res.ok) {
          setToken(session.access_token);
          setGate('open');
        } else {
          setLockedReason('sealed');
          setGate('locked');
        }
      } catch {
        setLockedReason('sealed');
        setGate('locked');
      }
    };
    init();
  }, []);

  const authedFetch = useCallback(async (url, opts = {}) => {
    const res = await fetch(url, {
      ...opts,
      headers: { ...(opts.headers || {}), authorization: `Bearer ${token}` },
    });
    return res;
  }, [token]);

  const load = useCallback(async (opts = {}) => {
    if (!token) return;
    const silent = !!opts.silent;
    if (!silent) setLoading(true);
    try {
      const [ev, hv, bl, wl, st, us, tr] = await Promise.all([
        authedFetch('/api/ares/events?limit=100').then((r) => r.json()),
        authedFetch('/api/ares/agents').then((r) => r.json()).catch(() => ({})),
        authedFetch('/api/ares/blocks').then((r) => r.json()),
        authedFetch('/api/ares/whitelist').then((r) => r.json()),
        authedFetch('/api/ares/settings').then((r) => r.json()),
        authedFetch('/api/ares/users').then((r) => r.json()).catch(() => ({})),
        authedFetch('/api/ares/trapped').then((r) => r.json()).catch(() => ({})),
      ]);
      setEvents(ev.events || []);
      if (Array.isArray(hv.agents)) setHive(hv);
      setBlocks(bl.blocks || []);
      setWhitelist(wl.whitelist || []);
      setRegUsers(us.users || []);
      setTrapped(tr.trapped || []);
      setSources(tr.sources || []);
      if (st.settings) setSettings(st.settings);
    } catch { /* keep whatever loaded */ }
    if (!silent) setLoading(false);
  }, [token, authedFetch]);

  useEffect(() => { load(); }, [load]);

  // REAL-TIME (Merlin, 2026-11-03): everything auto-populates —
  // threats, events, blocks, whitelist, users, trapped, sources,
  // settings. Silent background refresh every 15 seconds; the
  // header Refresh button is now just a manual nudge. A failed
  // tick keeps the last good data and retries on the next tick.
  useEffect(() => {
    if (!token) return undefined;
    const tick = async () => {
      try {
        await load({ silent: true });
      } catch { /* next tick retries */ }
    };
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, [token, load]);

  const saveSettings = async (next) => {
    setSettings(next);
    setSaving(true);
    try {
      await authedFetch('/api/ares/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
    } catch { /* UI already reflects the intent; a refresh shows truth */ }
    setSaving(false);
  };

  if (gate !== 'open') {
    if (cloudOffline) {
      return (
        <div className="flex h-dvh w-screen items-center justify-center bg-black p-8 text-center">
          <style>{ARES_CSS}</style>
          <div className="ares-bg" aria-hidden="true" />
          <p className="ares-shell max-w-md text-sm text-zinc-400">
            Cloud features are offline — Ares needs the database connection. The watchtower will come back online once it&apos;s connected.
          </p>
        </div>
      );
    }
    if (gate === 'locked') {
      return <LockedScreen reason={lockedReason} />;
    }
    return (
      <div className="h-dvh w-screen bg-black">
        <style>{ARES_CSS}</style>
        <div className="ares-veil h-full" role="status" aria-label="Verifying keeper credentials">
          <GlyphShield size={38} />
          <span>Approaching the watchtower…</span>
        </div>
      </div>
    );
  }

  if (pinChecking) {
    return (
      <div className="h-dvh w-screen bg-black">
        <style>{ARES_CSS}</style>
        <div className="ares-veil h-full" role="status" aria-label="Verifying keeper credentials">
          <GlyphShield size={38} />
          <span>Approaching the watchtower…</span>
        </div>
      </div>
    );
  }

  if (!pinUnlocked) {
    return <PinWall onUnlock={() => setPinUnlocked(true)} />;
  }

  const summary = summarize(events);
  // Phase 1 cohort correlation v1: cross-IP clusters in the recent
  // events, computed client-side from the rows already loaded.
  const cohorts = useMemo(() => findCohorts(events), [events]);

  return (
    <main className="min-h-dvh w-full bg-[#050505] px-4 py-6 text-zinc-200 sm:px-8">
      <style>{ARES_CSS}</style>
      <div className="ares-bg" aria-hidden="true" />
      <div className="ares-shell mx-auto flex max-w-5xl flex-col gap-4">
        <header className="ares-head flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-fuchsia-300/90"><GlyphShield /></span>
            <div>
              <h1 className="bg-gradient-to-br from-fuchsia-400 to-red-500 bg-clip-text text-2xl font-black uppercase tracking-[0.2em] text-transparent sm:text-3xl">
                Ares
              </h1>
              <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                Autonomous Response and Evidence System
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load}
              className="ares-refresh rounded-lg border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-400 transition-colors hover:border-fuchsia-400 hover:text-fuchsia-300">
              <GlyphRefresh />
              <span>Refresh</span>
            </button>
            <BackButton label="Exit" />
          </div>
        </header>

        {loading ? (
          <div className="ares-veil" role="status" aria-label="Loading threat data">
            <GlyphShield size={38} />
            <span>Reading the watchtower…</span>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-5">
              <div className="ares-panel md:col-span-3">
                <ThreatGauge level={summary.level} label={summary.label} trend={summary.trend} />
              </div>
              <div className="ares-panel md:col-span-2">
                <ModuleToggles settings={settings} onChange={saveSettings} disabled={saving} />
              </div>
            </div>
            <div className="ares-panel"><TopLists events={events} /></div>
            <div className="ares-panel"><HivePanel hive={hive} /></div>
            <div className="ares-panel"><CohortsPanel cohorts={cohorts} /></div>
            <div className="ares-panel"><ReviewQueue events={events} authedFetch={authedFetch} onRefresh={load} /></div>
            <div className="ares-panel"><ScalingPolicyPanel /></div>
            <div className="ares-panel"><EventsFeed events={events} /></div>
            <div className="ares-panel"><LearningPanel events={events} authedFetch={authedFetch} /></div>
            <div className="ares-panel"><ListsManager authedFetch={authedFetch} whitelist={whitelist} blocks={blocks} onRefresh={load} /></div>
            <div className="ares-panel"><UsersManager authedFetch={authedFetch} users={regUsers} onRefresh={load} /></div>
            <div className="ares-panel"><AttackSources authedFetch={authedFetch} trapped={trapped} sources={sources} onRefresh={load} /></div>
            <div className="ares-panel"><MollyPanel /></div>
            <div className="ares-panel"><DuoMathPanel /></div>
            <footer className="pb-8 pt-2 text-center text-[11px] text-zinc-600">
              Defensive only. Ares logs and blocks; it never retaliates. Evidence older than 90 days is purged.
            </footer>
            <div className="ares-panel"><BroadcastStudio /></div>
            <div aria-hidden="true" className="player-clear" />
          </>
        )}
      </div>
    </main>
  );
}
