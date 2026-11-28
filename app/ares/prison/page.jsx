// app/ares/prison/page.jsx — the ARES Prison (Merlin, 2026-11-15).
//
// A walkable 3D hall where the keeper can see every prisoner ARES
// captured, in its own sandbox cell, as it appears — stacked in rows,
// red lights throughout. Viewing only: there is NO release control
// here. Release stays in the console (components/ares/AttackSources),
// owner-locked, as it is.
//
// ACCESS: the same two locks as the /ares console, in the same order.
//   1. Keeper gate — the session token is validated server-side by
//      POST /api/ares/gate (owner email only). Fail closed.
//   2. Pin wall — the same pin as Molly's sandbox, tab-only
//      (sessionStorage 'ares-unlocked'), checked at /api/molly/gate.
// The data route enforces the owner lock independently, so these are
// the UX locks and the route is the universal lock — exactly as the
// console does it.
//
// DATA: GET /api/ares/trapped with the session Bearer token — the
// console's own read path. Live: silent refresh every 15 s, like the
// console. The first row the API returns (last_seen desc) takes the
// first cell.

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import { supabase } from '@/lib/supabase';
import { useSceneContextGuard } from '@/components/SceneContextGuard';
import { PrisonScene, createPrisonWalker } from './world3d';
import { mergePrisonerRows, PRISON_CAPACITY, PRISON_CELL } from '@/lib/ares/prison';
import { assignGrownCells } from '@/lib/ares/prison-expansion';
import PrisonerReport from '@/components/ares/PrisonerReport';

const STICK_RADIUS = 44;

// The way out. One shared exit, used in EVERY state of this page —
// the hall, the locked screen states, and the loading/offline screens —
// so the keeper is never stuck in the prison with no button to leave.
// It always goes back to the /ares console. It is NOT a release: it
// only navigates away; nothing here releases a prisoner.
function ExitToAres() {
  return (
    <Link
      href="/ares"
      className="pointer-events-auto inline-block rounded-full border border-white/30 bg-black/60 px-5 py-3 text-sm font-semibold text-white"
    >
      ← Exit to ARES
    </Link>
  );
}

function LockedScreen({ reason }) {
  const signedOut = reason === 'signed-out';
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-[#050505] px-6 py-10 text-center">
      <div className="flex w-full max-w-sm flex-col items-center gap-5">
        <div>
          <h1 className="bg-gradient-to-br from-red-400 to-red-700 bg-clip-text text-4xl font-black uppercase tracking-[0.2em] text-transparent">
            The Prison
          </h1>
          <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-zinc-500">
            Ares · where the captured are kept
          </p>
        </div>
        <div className="w-full rounded-2xl border border-red-500/25 bg-red-500/[0.04] px-6 py-6">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-red-300">
            Restricted to the throne
          </p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            {signedOut
              ? 'The watchtower answers only to its keeper. Sign in to approach the prison.'
              : 'This hall is sealed. Only the keeper\u2019s credentials open it \u2014 there is nothing to see here.'}
          </p>
        </div>
        <Link
          href={signedOut ? '/' : '/ares'}
          className="inline-block rounded-full border border-white/30 bg-black/60 px-4 py-2 text-sm font-semibold text-white"
        >
          {signedOut ? 'Go sign in' : 'Back to the console'}
        </Link>
      </div>
    </main>
  );
}

// Pin wall: the same door as the console and Molly's sandbox — same
// pin, same check endpoint, tab-only. No passcode value ever appears here.
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
        setGateError('That didn\u2019t open it.');
        setPasscode('');
        return;
      }
      try { sessionStorage.setItem('ares-unlocked', '1'); } catch {}
      onUnlock();
    } catch {
      setGateError('The door didn\u2019t answer. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-[#050505] px-6 py-10 text-center">
      <div className="flex w-full max-w-sm flex-col items-center gap-5">
        <div>
          <h1 className="bg-gradient-to-br from-red-400 to-red-700 bg-clip-text text-4xl font-black uppercase tracking-[0.2em] text-transparent">
            The Prison
          </h1>
          <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-zinc-500">
            Ares · where the captured are kept
          </p>
        </div>
        <div className="w-full rounded-2xl border border-red-500/25 bg-red-500/[0.04] px-6 py-6 text-left">
          <p className="text-sm text-zinc-400">This hall asks for a passcode before it opens — the same door as the console.</p>
          <form onSubmit={submitGate} className="mt-4 flex flex-col gap-3">
            <label htmlFor="prison-passcode" className="text-xs font-bold uppercase tracking-widest text-zinc-400">Passcode</label>
            <input
              id="prison-passcode"
              type="password"
              autoComplete="off"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter the passcode"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-base text-zinc-100"
            />
            {gateError && <p className="text-sm text-red-400">{gateError}</p>}
            <button type="submit" disabled={busy || !passcode}
              className="rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
              {busy ? 'Checking\u2026' : 'Open the door'}
            </button>
          </form>
        </div>
        <Link
          href="/ares"
          className="inline-block rounded-full border border-white/30 bg-black/60 px-4 py-2 text-sm font-semibold text-white"
        >
          Back to the console
        </Link>
      </div>
    </main>
  );
}

export default function AresPrison() {
  const router = useRouter();
  const sceneGuard = useSceneContextGuard({ label: 'ARES-PRISON' });
  const [gate, setGate] = useState('checking');
  const [lockedReason, setLockedReason] = useState('signed-out');
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pinChecking, setPinChecking] = useState(true);
  const [cloudOffline, setCloudOffline] = useState(false);
  const [token, setToken] = useState(null);
  const [cells, setCells] = useState([]);
  const [layout, setLayout] = useState(null);
  const [prisonerCount, setPrisonerCount] = useState(0);
  const [overflow, setOverflow] = useState(0);
  const [loading, setLoading] = useState(true);
  const [touchUI, setTouchUI] = useState(false);
  // The prisoner report: opens when the keeper clicks a prisoner's
  // NAME — its cell label in the hall, or its row in the roster.
  const [reportForm, setReportForm] = useState(null);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMinimized, setReportMinimized] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  // Mute (Merlin, Nov 27): one audio stream (the marvel-christmas
  // video) — the orb toggles it. Default: sound ON.
  const [muted, setMuted] = useState(false);
  // The walk-through door back to the hub (Merlin, Nov 27): walking
  // into the doorway in the entrance end wall navigates home.
  const handleExitToHub = useCallback(() => {
    router.push('/');
  }, [router]);
  // The camera far plane grows with the hall: the hall is ever-expanding
  // (a level at a time), and the far plane must outrun its height.
  const cameraFar = layout
    ? Math.max(120, layout.levels * PRISON_CELL.heightM + 80)
    : 120;

  const walkerRef = useRef(null);
  if (!walkerRef.current) walkerRef.current = createPrisonWalker();
  const inputRef = useRef({ fwd: 0, strafe: 0, sprint: false, lookDx: 0 });
  const keysRef = useRef(new Set());
  const dragRef = useRef({ active: false, lastX: 0 });
  const stickRef = useRef({ id: null, ox: 0, oy: 0 });
  const lookTouchRef = useRef({ id: null, lastX: 0 });
  const [stick, setStick] = useState({ dx: 0, dy: 0, active: false });

  useEffect(() => {
    try {
      if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) setTouchUI(true);
    } catch { /* desktop path */ }
    try { if (sessionStorage.getItem('ares-unlocked') === '1') setPinUnlocked(true); } catch {}
    setPinChecking(false);
  }, []);

  // Keeper gate — the console's own check, verbatim in shape.
  useEffect(() => {
    const init = async () => {
      let auth;
      try {
        auth = supabase.auth;
      } catch {
        setCloudOffline(true);
        return;
      }
      const { data: { session } } = await auth.getSession();
      if (!session) {
        setLockedReason('signed-out');
        setGate('locked');
        return;
      }
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

  // Live trapped set, from the console's own read path. The Warden
  // (lib/ares/prison-expansion.js) grows the hall on every load: the
  // moment the cells fill, the next level is already standing.
  const load = useCallback(async (opts = {}) => {
    if (!token) return;
    if (!opts.silent) setLoading(true);
    try {
      const data = await authedFetch('/api/ares/trapped').then((r) => r.json()).catch(() => ({}));
      const rows = mergePrisonerRows(data.trapped || [], data.sources || []);
      const grown = assignGrownCells(rows);
      setCells(grown.cells);
      setLayout(grown.layout);
      setPrisonerCount(rows.length);
      setOverflow(grown.overflow);
    } catch { /* keep whatever loaded */ }
    if (!opts.silent) setLoading(false);
  }, [token, authedFetch]);

  useEffect(() => { load(); }, [load]);

  // REAL-TIME, like the console: silent refresh every 15 s. A failed
  // tick keeps the last good data and retries on the next tick.
  useEffect(() => {
    if (!token) return undefined;
    const id = setInterval(() => { load({ silent: true }).catch(() => {}); }, 15000);
    return () => clearInterval(id);
  }, [token, load]);

  // Open one prisoner's report: the name (cell label or roster row)
  // carries the full prisoner id, and the owner-locked report route
  // returns the merged record. A failed fetch still opens the panel
  // with what the cell already knows, so the keeper is never left
  // tapping a dead name.
  const openReport = useCallback(async (form) => {
    if (!form) return;
    setReportForm(form);
    setReport(null);
    setReportMinimized(false);
    setRosterOpen(false);
    if (!token || !form.ipHash) return;
    setReportLoading(true);
    try {
      const data = await authedFetch(`/api/ares/prisoner-report?ip_hash=${encodeURIComponent(form.ipHash)}`).then((r) => r.json()).catch(() => ({}));
      if (data && data.report) setReport(data.report);
    } catch { /* panel falls back to the cell's own facts */ }
    setReportLoading(false);
  }, [token, authedFetch]);

  // --- keyboard: WASD / arrows walk, Shift runs (realm pattern) ---------
  const applyKeys = useCallback(() => {
    const k = keysRef.current;
    const fwd = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const strafe = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    inputRef.current.fwd = fwd;
    inputRef.current.strafe = strafe;
    inputRef.current.sprint = k.has('shift');
  }, []);

  useEffect(() => {
    const down = (e) => {
      const key = String(e.key || '').toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) {
        e.preventDefault();
        keysRef.current.add(key);
        applyKeys();
      }
    };
    const up = (e) => {
      keysRef.current.delete(String(e.key || '').toLowerCase());
      applyKeys();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [applyKeys]);

  // --- mouse drag to look (desktop) ---------------------------------------
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse') return;
    dragRef.current = { active: true, lastX: e.clientX };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragRef.current.active || e.pointerType !== 'mouse') return;
    inputRef.current.lookDx += e.clientX - dragRef.current.lastX;
    dragRef.current.lastX = e.clientX;
  };
  const onPointerUp = () => {
    dragRef.current.active = false;
  };

  // --- touch stick (left) + drag-to-look (right) ---------------------------
  const onStickStart = (e) => {
    const t = e.changedTouches[0];
    if (!t || stickRef.current.id !== null) return;
    stickRef.current = { id: t.identifier, ox: t.clientX, oy: t.clientY };
    setStick({ dx: 0, dy: 0, active: true });
  };
  const onStickMove = (e) => {
    const s = stickRef.current;
    if (s.id === null) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== s.id) continue;
      let dx = t.clientX - s.ox;
      let dy = t.clientY - s.oy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx = (dx / len) * STICK_RADIUS;
        dy = (dy / len) * STICK_RADIUS;
      }
      inputRef.current.strafe = dx / STICK_RADIUS;
      inputRef.current.fwd = -dy / STICK_RADIUS;
      setStick({ dx, dy, active: true });
    }
  };
  const onStickEnd = (e) => {
    const s = stickRef.current;
    if (s.id === null) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== s.id) continue;
      stickRef.current = { id: null, ox: 0, oy: 0 };
      inputRef.current.strafe = 0;
      inputRef.current.fwd = 0;
      setStick({ dx: 0, dy: 0, active: false });
    }
  };
  const onLookStart = (e) => {
    const t = e.changedTouches[0];
    if (!t || lookTouchRef.current.id !== null) return;
    lookTouchRef.current = { id: t.identifier, lastX: t.clientX };
  };
  const onLookMove = (e) => {
    const l = lookTouchRef.current;
    if (l.id === null) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== l.id) continue;
      inputRef.current.lookDx += t.clientX - l.lastX;
      lookTouchRef.current.lastX = t.clientX;
    }
  };
  const onLookEnd = (e) => {
    const l = lookTouchRef.current;
    if (l.id === null) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== l.id) continue;
      lookTouchRef.current = { id: null, lastX: 0 };
    }
  };

  if (gate !== 'open') {
    if (cloudOffline) {
      return (
        <div className="flex h-dvh w-screen flex-col items-center justify-center gap-4 bg-black p-8 text-center">
          <p className="max-w-md text-sm text-zinc-400">
            Cloud features are offline — the prison needs the database connection. The hall will come back once it&apos;s connected.
          </p>
          <ExitToAres />
        </div>
      );
    }
    if (gate === 'locked') return <LockedScreen reason={lockedReason} />;
    return (
      <div className="flex h-dvh w-screen flex-col items-center justify-center gap-4 bg-black">
        <p className="text-xs uppercase tracking-[0.3em] text-red-300">Approaching the prison\u2026</p>
        <ExitToAres />
      </div>
    );
  }

  if (pinChecking) {
    return (
      <div className="flex h-dvh w-screen flex-col items-center justify-center gap-4 bg-black">
        <p className="text-xs uppercase tracking-[0.3em] text-red-300">Approaching the prison\u2026</p>
        <ExitToAres />
      </div>
    );
  }

  if (!pinUnlocked) return <PinWall onUnlock={() => setPinUnlocked(true)} />;

  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white" style={{ touchAction: 'none' }}>
      {/* 3D hall */}
      <div
        className="absolute inset-0"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: false, powerPreference: 'high-performance' }}
          camera={{ fov: 60, near: 0.1, far: cameraFar, position: [-21, 2.4, 0] }}
          onCreated={sceneGuard.onCreated}
          style={{ width: '100%', height: '100%' }}
        >
          <PrisonScene
            cells={cells}
            walkerRef={walkerRef}
            inputRef={inputRef}
            layout={layout}
            muted={muted}
            onExitToHub={handleExitToHub}
            onSelectPrisoner={openReport}
          />
        </Canvas>
      </div>

      {/* touch controls: left stick walks, right side drag looks */}
      {touchUI && (
        <>
          <div
            className="absolute bottom-0 left-0 z-10 h-[45%] w-[45%]"
            style={{ touchAction: 'none' }}
            onTouchStart={onStickStart}
            onTouchMove={onStickMove}
            onTouchEnd={onStickEnd}
            onTouchCancel={onStickEnd}
          >
            <div
              className="absolute bottom-24 left-8 h-28 w-28 rounded-full border-2 border-white/25 bg-white/5"
              style={{ touchAction: 'none' }}
            >
              <div
                className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-white/35"
                style={{
                  transform: `translate(calc(-50% + ${stick.dx}px), calc(-50% + ${stick.dy}px))`,
                }}
              />
            </div>
          </div>
          <div
            className="absolute bottom-0 right-0 z-10 h-[45%] w-[55%]"
            style={{ touchAction: 'none' }}
            onTouchStart={onLookStart}
            onTouchMove={onLookMove}
            onTouchEnd={onLookEnd}
            onTouchCancel={onLookEnd}
          />
        </>
      )}

      {/* HUD — plain English, nothing overlaps anything else */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center px-4 pt-16 text-center">
        <h1 className="text-2xl font-bold tracking-[0.3em] text-red-100 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
          ARES PRISON
        </h1>
        <p className="mt-1 text-sm text-red-200/80 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          {loading
            ? 'Counting the prisoners\u2026'
            : `${prisonerCount} prisoner${prisonerCount === 1 ? '' : 's'} · ${layout?.capacity ?? PRISON_CAPACITY} cells${overflow > 0 ? ` · ${overflow} waiting for a cell` : ''}`}
        </p>
        <p className="mt-3 rounded-full bg-black/55 px-4 py-2 text-xs text-stone-200">
          {touchUI
            ? 'Left stick to walk · drag the right side to look around · each cell holds one prisoner, as it appears'
            : 'WASD or arrows to walk · drag to look around · Shift to run · each cell holds one prisoner, as it appears'}
        </p>
        <p className="mt-2 text-[11px] text-zinc-500">
          Viewing only — release happens in the console.
        </p>
        <button
          type="button"
          onClick={() => setRosterOpen(true)}
          className="pointer-events-auto mt-3 min-h-11 rounded-full border border-red-500/50 bg-black/60 px-5 py-2 text-xs font-bold text-red-100"
        >
          Prisoners ({prisonerCount}) — tap a name for its report
        </button>
      </div>

      {/* roster: every prisoner's name, as a button that opens its report */}
      {rosterOpen && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-4">
          <div className="pointer-events-auto flex max-h-[75dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-red-500/40 bg-[#180505]/95 shadow-2xl">
            <div className="flex items-start justify-between gap-2 border-b border-red-500/25 px-4 py-3">
              <h2 className="text-sm font-bold text-red-100">Prisoners — tap a name for its report</h2>
              <button
                type="button"
                onClick={() => setRosterOpen(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/25 bg-black/60 text-lg font-bold text-white"
                aria-label="Close prisoner list"
              >
                ×
              </button>
            </div>
            <ul className="flex flex-col gap-2 overflow-y-auto px-4 py-4">
              {cells.filter((c) => c.prisoner).map((c) => (
                <li key={c.prisoner.shortId}>
                  <button
                    type="button"
                    onClick={() => openReport(c.prisoner)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-left"
                  >
                    <span className="font-mono text-xs text-red-100">{c.prisoner.label} · {c.prisoner.shortId}</span>
                    <span className="text-[11px] text-zinc-500">score {c.prisoner.score}</span>
                  </button>
                </li>
              ))}
              {cells.filter((c) => c.prisoner).length === 0 && (
                <li className="text-sm text-zinc-500">No prisoners right now.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* prisoner report: opens from a name, minimizable */}
      {reportForm && (
        <PrisonerReport
          report={report || {
            kind: 'prisoner',
            short_id: reportForm.shortId,
            name: `${reportForm.label} · ${reportForm.shortId}`,
            what_sandboxed: { reason: reportForm.reason, score: reportForm.score, hits: reportForm.hits },
            why_sandboxed: reportForm.reason,
            why_not_recorded: false,
            why_not_sandboxed: null,
            sandboxed_at: reportForm.firstSeen,
            last_seen: reportForm.lastSeen,
            sender_ip_hash: reportForm.ipHash || '',
            sender_ip_fingerprint: reportForm.shortId,
            legal_reports: [],
            self_terminate_reports: [],
            event_count: 0,
          }}
          minimized={reportMinimized}
          onMinimize={() => setReportMinimized(true)}
          onRestore={() => setReportMinimized(false)}
          onClose={() => { setReportForm(null); setReport(null); setReportMinimized(false); }}
        />
      )}
      {reportForm && reportLoading && !reportMinimized && (
        <p className="pointer-events-none absolute inset-x-0 bottom-24 z-40 text-center text-xs text-red-200/80">Opening the report…</p>
      )}

      <div className="absolute left-4 top-4 z-30">
        <ExitToAres />
      </div>
      <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
        {/* Mute orb (Merlin, Nov 27): one audio stream, on or off.
            Plain circle orb per the orb law; the state is obvious —
            🔊 sounding, 🔇 muted with a red ring. Default: sound ON. */}
        <button
          type="button"
          aria-label={muted ? 'Unmute prison sound' : 'Mute prison sound'}
          title={muted ? 'Unmute prison sound' : 'Mute prison sound'}
          onClick={() => setMuted((m) => !m)}
          className={`pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border bg-black/60 text-lg ${
            muted ? 'border-red-400 text-red-300 ring-2 ring-red-500/60' : 'border-white/30 text-white'
          }`}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <Link
          href="/"
          className="pointer-events-auto inline-block rounded-full border border-white/30 bg-black/60 px-4 py-2 text-sm font-semibold text-white"
        >
          Leave
        </Link>
      </div>
    </main>
  );
}
