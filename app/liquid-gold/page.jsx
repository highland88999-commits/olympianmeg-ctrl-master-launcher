'use client';

// /liquid-gold — LIQUID GOLD REFINERY (PLUTUS).
// Refine crude gold into bars, or flip the output to AETHER.
//
// The economy wiring (Merlin's corrected model, 2026-10-22):
// - Every batch of molten gold converts to the picked output:
//   GOLD BARS (the upgrade currency — spent on pump/filter/vat below)
//   or AETHER, the platform's true currency, credited to the server
//   aether balance through the replay-proven claim
//   (POST /api/economy/refinery/claim) under the refinery's own
//   1,000 gold-value/day cap on the aether leg.
// - The whole game persists SERVER-side per account
//   (GET/PUT /api/economy/refinery/state): leaving and returning
//   restores the exact refinery. The aether balance shown is the
//   ledger's, read from the server.
// - Until supabase/refinery.sql + supabase/aether.sql run, the APIs
//   answer setupRequired and the refinery plays in local preview with
//   an honest banner — nothing pretends to be saved or credited.

import { useEffect, useRef, useState } from 'react';
import {
  newState, refineTick, pourTick, setPouring, createHoldPour, activateSurge,
  buyUpgradeWithBars, setOutput,
  flowRate, vatCapacity, barValue, upgradeBarCost,
  canSurge, surgeCooldownRemaining, TICK,
} from './engine';
import { fx } from '@/lib/fx';
import { toStoredState, toEngineState } from '@/lib/economy/refinery-shared';

const UPGRADES = [
  { kind: 'pump', icon: '⛽', name: 'Pump', blurb: 'Faster pour rate' },
  { kind: 'filter', icon: '🧪', name: 'Filter', blurb: 'Faster refining, richer bars' },
  { kind: 'vat', icon: '🛢️', name: 'Vat', blurb: 'Bigger crude capacity' },
];

export default function LiquidGoldPage() {
  const [st, setSt] = useState(() => newState());
  const [uiTick, setUiTick] = useState(0);
  const [fxFlash, setFxFlash] = useState(0);
  const [aetherFx, setAetherFx] = useState('');
  const [notice, setNotice] = useState('');
  // Server truth from GET /api/economy/refinery/state + claim responses:
  // the aether balance is the ledger's; the tally is the refinery diary's.
  const [server, setServer] = useState({ aetherBalance: null, convertedTodayGold: 0, capRemainingGold: null });
  const [setupRequired, setSetupRequired] = useState(false);
  const [restored, setRestored] = useState(false);
  const stRef = useRef(st);
  stRef.current = st;
  const logRef = useRef([]);
  const baseRef = useRef(null); // { prefixHash, baseTick, coveredI } | null
  const claimInFlightRef = useRef(false);
  const claimQueuedRef = useRef(false);
  const restoredRef = useRef(false);
  const saveTimerRef = useRef(null);
  const holdRef = useRef(null);
  if (!holdRef.current) holdRef.current = createHoldPour();

  const bump = () => setUiTick((n) => n + 1);

  // ---- Server sync -------------------------------------------------------

  const applyServerSummary = (data) => {
    if (!data) return;
    setServer((prev) => ({
      aetherBalance: typeof data.aetherBalance === 'number' ? data.aetherBalance : prev.aetherBalance,
      convertedTodayGold: typeof data.convertedTodayGold === 'number' ? data.convertedTodayGold : prev.convertedTodayGold,
      capRemainingGold: typeof data.capRemainingGold === 'number' ? data.capRemainingGold : prev.capRemainingGold,
    }));
  };

  const effectiveLog = () => {
    const covered = baseRef.current?.coveredI || 0;
    return logRef.current.filter((a) => (a.i ?? -1) >= covered);
  };

  const saveNow = async () => {
    if (setupRequired) return;
    try {
      const res = await fetch('/api/economy/refinery/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameState: toStoredState(stRef.current),
          log: effectiveLog(),
          base: baseRef.current,
        }),
      });
      if (res.status === 503) setSetupRequired(true);
    } catch { /* saving retries on the next action / interval */ }
  };

  const scheduleSave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { saveNow(); }, 800);
  };

  // Claim: prove play since the checkpoint; the server converts every
  // proven aether mint into the aether balance (capped per day).
  const claimConversions = async () => {
    if (setupRequired) return;
    if (claimInFlightRef.current) { claimQueuedRef.current = true; return; }
    claimInFlightRef.current = true;
    try {
      const res = await fetch('/api/economy/refinery/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          log: effectiveLog(),
          tickCount: Math.round(stRef.current.now / TICK),
          base: baseRef.current,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 503 || data?.setupRequired) { setSetupRequired(true); return; }
      if (res.status === 409 && data?.resync) {
        // Our base drifted from the server checkpoint: reload the save
        // and claim from it, exactly once.
        await loadFromServer();
        claimInFlightRef.current = false;
        await claimConversions();
        return;
      }
      if (!res.ok || !data) return;
      applyServerSummary(data);
      if (data.creditedAether > 0) {
        setAetherFx(`◆ +${data.creditedAether} AETHER`);
        fx.coin();
      }
      if (data.notice) { setNotice(data.notice); fx.warn(); }
      else if (data.creditedAether > 0) setNotice('');
      if (data.sealed) {
        baseRef.current = {
          prefixHash: data.sealed.prefixHash,
          baseTick: data.sealed.baseTick,
          coveredI: data.sealed.coveredI,
        };
      }
      scheduleSave();
    } catch { /* the next mint / toggle retries */ } finally {
      claimInFlightRef.current = false;
      if (claimQueuedRef.current) {
        claimQueuedRef.current = false;
        claimConversions();
      }
    }
  };

  const loadFromServer = async () => {
    try {
      const res = await fetch('/api/economy/refinery/state');
      const data = await res.json().catch(() => null);
      if (!data) return false;
      if (data.setupRequired) { setSetupRequired(true); return false; }
      applyServerSummary(data);
      if (data.saved?.gameState) {
        const restoredState = toEngineState(data.saved.gameState);
        if (restoredState) {
          stRef.current = restoredState;
          setSt(restoredState);
          const savedLog = Array.isArray(data.saved.log) ? data.saved.log : [];
          const savedBase = data.saved.base || null;
          const covered = savedBase?.coveredI || 0;
          baseRef.current = savedBase;
          logRef.current = savedLog.map((a, idx) => (
            a.i === undefined ? { ...a, i: covered + idx } : a
          ));
          // Leaving the page stops any pour (the loop dies with it) —
          // record that honestly in the log so the server replay and
          // this client agree exactly about when pouring ended.
          if (restoredState.pouring) {
            restoredState.pouring = false;
            logRef.current.push({
              a: 'pour', on: false,
              t: Math.round(restoredState.now / TICK),
              i: covered + savedLog.length,
            });
          }
          setRestored(true);
          bump();
          return true;
        }
      }
      return false;
    } catch { return false; }
  };

  // Restore on entry, then claim anything the restore left unconverted.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const had = await loadFromServer();
      if (cancelled) return;
      restoredRef.current = true;
      if (had) claimConversions();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Game loop.
  useEffect(() => {
    const id = setInterval(() => {
      const s = stRef.current;
      const beforeOutput = s.output;
      const beforeAether = s.aetherMinted || 0;
      s.now += TICK;
      pourTick(s, TICK);
      const minted = refineTick(s, TICK);
      setSt({ ...s, upgrades: { ...s.upgrades } });
      if (minted) {
        setFxFlash(Date.now());
        if (beforeOutput === 'aether') {
          fx.victory();
          if ((s.aetherMinted || 0) > beforeAether && restoredRef.current) {
            claimConversions();
          }
        } else {
          fx.coin();
        }
      }
      if (s.pouring || s.crude > 0 || minted) bump();
    }, TICK * 1000);
    const ui = setInterval(bump, 500);
    return () => { clearInterval(id); clearInterval(ui); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist while playing + when the tab hides / unloads.
  useEffect(() => {
    const id = setInterval(() => { if (restoredRef.current) saveNow(); }, 15000);
    const onHide = () => { if (document.visibilityState === 'hidden') saveNow(); };
    const onUnload = () => { saveNow(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onUnload);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupRequired]);

  // ---- Actions -------------------------------------------------------------

  const logAction = (a) => {
    const s = stRef.current;
    logRef.current.push({ ...a, t: Math.round(s.now / TICK), i: logRef.current.length });
  };

  // Hold-to-pour (the engine's interaction contract): press starts the
  // pour, release / slide-off / OS gesture stops it. Each transition is
  // one logged action — the replay applies the same `on` values.
  const startPour = () => {
    const hold = holdRef.current;
    if (!hold.press()) return;
    const s = stRef.current;
    if (!s.pouring) {
      setPouring(s, true);
      logAction({ a: 'pour', on: true });
      scheduleSave();
    }
    fx.tap();
    setSt({ ...s, upgrades: { ...s.upgrades } });
    bump();
  };

  const stopPour = () => {
    const hold = holdRef.current;
    const wasHolding = hold.isPouring();
    hold.release();
    if (!wasHolding) return;
    const s = stRef.current;
    if (s.pouring) {
      setPouring(s, false);
      logAction({ a: 'pour', on: false });
      scheduleSave();
    }
    setSt({ ...s, upgrades: { ...s.upgrades } });
    bump();
  };

  const onSurge = () => {
    const s = stRef.current;
    if (activateSurge(s)) {
      logAction({ a: 'surge' });
      fx.boost();
      scheduleSave();
    } else fx.error();
    setSt({ ...s, upgrades: { ...s.upgrades } });
    bump();
  };

  const onBuy = (kind) => {
    const s = stRef.current;
    if (buyUpgradeWithBars(s, kind)) {
      logAction({ a: 'buy', kind });
      fx.coin();
      scheduleSave();
    } else fx.error();
    setSt({ ...s, upgrades: { ...s.upgrades } });
    bump();
  };

  const onSetOutput = (out) => {
    const s = stRef.current;
    if (s.output === out) return;
    setOutput(s, out);
    logAction({ a: 'mode', out });
    fx.tap();
    setSt({ ...s, upgrades: { ...s.upgrades } });
    bump();
    scheduleSave();
    // Pick up any aether batches proven but not yet credited.
    claimConversions();
  };

  const onReset = async () => {
    if (!confirm('Reset the refinery? Vat, bars and upgrades start over. (Aether already credited to your account and today\u2019s conversion tally stay — they are yours.)')) return;
    const fresh = newState();
    stRef.current = fresh;
    setSt(fresh);
    logRef.current = [];
    baseRef.current = null;
    setAetherFx('');
    setNotice('');
    setRestored(false);
    fx.error();
    bump();
    // Overwrite the server save so the reset sticks across devices.
    try {
      await fetch('/api/economy/refinery/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameState: toStoredState(fresh), log: [], base: null }),
      });
    } catch { /* the next save retries */ }
  };

  // ---- Derived display values ----------------------------------------------
  void uiTick;
  const cap = vatCapacity(st);
  const pct = Math.min(100, Math.round((st.crude / cap) * 100));
  const purityPct = Math.round(st.purity * 100);
  const refinePctPerSec = ((0.05 + st.upgrades.filter * 0.03) * (0.4 + st.crude / Math.max(1, cap)) * 100).toFixed(1);
  const readyIn = surgeCooldownRemaining(st);
  const surgeActive = st.now < st.surgeUntil;
  const mins = Math.floor(st.now / 60);
  const secs = Math.floor(st.now % 60);
  const output = st.output === 'aether' ? 'aether' : 'bars';
  const capHit = server.capRemainingGold === 0;

  return (
    <main className="min-h-screen bg-[#0a0a12] text-white" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <a href="/" className="page-back rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10">← Olympus</a>
            <h1 className="min-w-0 text-2xl font-black tracking-wide sm:text-3xl">
              <span className="mr-2">🏭</span>
              <span className="bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-500 bg-clip-text text-transparent">LIQUID GOLD REFINERY</span>
            </h1>
          </div>
          <p className="max-w-3xl text-sm leading-relaxed text-white/60">
            Pour crude gold, refine it to 98% purity, and every batch converts to the output you pick:
            <strong className="text-amber-300"> gold bars</strong> — the refinery&rsquo;s upgrade currency — or
            <strong className="text-cyan-300"> ◆ aether</strong>, the true currency, credited to your account.
            Your refinery is saved to your account: leave, come back, everything is where you left it.
          </p>
        </header>

        {setupRequired && (
          <div className="mt-4 rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">
            Local preview: saving and aether crediting connect once the refinery database tables are switched on.
            Play is fully tracked here — nothing you see is pretending to be banked yet.
          </div>
        )}
        {restored && !setupRequired && (
          <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
            Welcome back — your refinery was restored exactly as you left it.
          </div>
        )}
        {notice && (
          <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            {notice}
          </div>
        )}

        {/* Balances */}
        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-amber-400/25 bg-gradient-to-b from-amber-400/15 to-transparent p-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-amber-300/80">Gold bars</div>
            <div className="mt-1 text-3xl font-black text-amber-300">{st.bars}</div>
            <div className="mt-1 text-xs text-white/50">Upgrade currency — spend below</div>
          </div>
          <div className="rounded-2xl border border-cyan-400/25 bg-gradient-to-b from-cyan-400/15 to-transparent p-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-cyan-300/80">◆ Aether — true currency</div>
            <div className="mt-1 text-3xl font-black text-cyan-300">
              {server.aetherBalance === null ? '—' : server.aetherBalance}
            </div>
            <div className="mt-1 text-xs text-white/50">
              {aetherFx ? <span className="text-cyan-300">{aetherFx} — credited to your account. </span> : 'Your server balance. '}
              Converted today: {server.convertedTodayGold} / 1,000 gold value
              {server.capRemainingGold !== null ? ` · ${server.capRemainingGold} left` : ''}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-white/50">Batches refined</div>
            <div className="mt-1 text-3xl font-black">{st.barsMinted}</div>
            <div className="mt-1 text-xs text-white/50">◆ {st.aetherMinted || 0} of them to aether</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-white/50">Session</div>
            <div className="mt-1 text-3xl font-black tabular-nums">{mins}:{String(secs).padStart(2, '0')}</div>
            <div className="mt-1 text-xs text-white/50">Poured {st.pouredTotal.toFixed(0)} L lifetime</div>
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
          {/* Refinery floor */}
          <section className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            {/* Vat */}
            <div>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h2 className="font-bold text-white/90">🛢️ Crude vat</h2>
                <span className="text-sm text-white/60">{st.crude.toFixed(1)} / {cap} L · pour {flowRate(st).toFixed(1)} L/s</span>
              </div>
              <div className="mt-2 h-9 overflow-hidden rounded-xl border border-white/10 bg-black/50">
                <div
                  className="h-full bg-gradient-to-r from-yellow-700 via-amber-500 to-yellow-300 transition-[width] duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Purity */}
            <div>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h2 className="font-bold text-white/90">🧪 Purity</h2>
                <span className="text-sm text-white/60">{purityPct}% · refine +{refinePctPerSec}%/s · batch converts at 98%</span>
              </div>
              <div className="relative mt-2 h-9 overflow-hidden rounded-xl border border-white/10 bg-black/50">
                <div
                  className="h-full bg-gradient-to-r from-orange-800 via-amber-400 to-yellow-200 transition-[width] duration-200"
                  style={{ width: `${purityPct}%` }}
                />
                <div className="absolute inset-y-0 w-0.5 bg-white/70" style={{ left: '98%' }} />
              </div>
              {fxFlash > 0 && Date.now() - fxFlash < 1600 && (
                <div className="mt-2 text-sm font-bold text-amber-300">
                  {output === 'aether' ? '◆ Batch converted to AETHER!' : '✨ Batch refined — +1 GOLD BAR!'}
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex flex-wrap gap-3">
              <button
                onPointerDown={startPour}
                onPointerUp={stopPour}
                onPointerLeave={stopPour}
                onPointerCancel={stopPour}
                onContextMenu={(e) => e.preventDefault()}
                className={`min-w-0 flex-1 touch-none select-none rounded-2xl px-5 py-4 text-lg font-black tracking-wide transition active:scale-95 ${
                  st.pouring
                    ? 'bg-gradient-to-b from-red-400 to-red-600 text-white shadow-[0_0_24px_rgba(239,68,68,0.45)]'
                    : 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[0_0_24px_rgba(16,185,129,0.35)]'
                }`}
              >
                {st.pouring ? '🫗 POURING…' : '▶ HOLD TO POUR'}
              </button>
              <button
                onClick={onSurge}
                disabled={!canSurge(st)}
                className="min-w-0 flex-1 rounded-2xl bg-gradient-to-b from-fuchsia-400 to-purple-600 px-5 py-4 text-lg font-black tracking-wide text-white transition enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {surgeActive ? `⚡ SURGING ${Math.ceil(st.surgeUntil - st.now)}s` : readyIn > 0 ? `⚡ SURGE (${Math.ceil(readyIn)}s)` : '⚡ SURGE ×3'}
              </button>
            </div>

            {/* Conversion output — the pick */}
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-white/50">Refine into</div>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Conversion output">
                <button
                  onClick={() => onSetOutput('bars')}
                  aria-pressed={output === 'bars'}
                  className={`min-w-0 flex-1 rounded-xl px-4 py-3 font-black transition active:scale-95 ${
                    output === 'bars'
                      ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-black shadow-[0_0_18px_rgba(245,158,11,0.4)]'
                      : 'border border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  🧱 GOLD BARS
                </button>
                <button
                  onClick={() => onSetOutput('aether')}
                  aria-pressed={output === 'aether'}
                  aria-label="Convert batches to aether"
                  className={`min-w-0 flex-1 rounded-xl px-4 py-3 font-black transition active:scale-95 ${
                    output === 'aether'
                      ? 'bg-gradient-to-b from-cyan-300 to-cyan-500 text-black shadow-[0_0_18px_rgba(34,211,238,0.4)]'
                      : 'border border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  ◆ AETHER
                </button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-white/50">
                {output === 'bars'
                  ? 'Batches land in your bar inventory — bars buy the upgrades below. Uncapped: the refinery\u2019s own loop.'
                  : capHit
                    ? 'Today\u2019s aether limit is reached — batches still convert, and the aether lands tomorrow. Bars are never capped.'
                    : 'Each finished batch becomes ◆1 aether, credited to your account (cap: 1,000 gold value/day on this leg only — the universe\u2019s scattered gold is untouched).'}
              </p>
            </div>
          </section>

          {/* Upgrades — bought with bars */}
          <section className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="font-bold text-white/90">⬆️ Upgrades <span className="text-xs font-normal text-white/40">— paid in gold bars</span></h2>
            {UPGRADES.map((u) => {
              const level = st.upgrades[u.kind];
              const cost = upgradeBarCost(u.kind, level);
              const afford = st.bars >= cost;
              return (
                <div key={u.kind} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold">{u.icon} {u.name} <span className="text-amber-300">Lv {level}</span></div>
                      <div className="text-xs text-white/50">{u.blurb}</div>
                    </div>
                    <button
                      onClick={() => onBuy(u.kind)}
                      disabled={!afford}
                      aria-label={`Buy ${u.name} level ${level + 1} for ${cost} bars`}
                      className="shrink-0 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-4 py-2 font-black text-black transition enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      BUY — {cost} 🧱
                    </button>
                  </div>
                  <div className="mt-2 flex gap-1">
                    {Array.from({ length: Math.min(10, level) }).map((_, i) => (
                      <span key={i} className="h-1.5 w-6 rounded bg-amber-400" />
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs leading-relaxed text-white/50">
              A bar&rsquo;s metal is worth {barValue(st)} credits on the old exchange — in the refinery it is worth more:
              it <em>is</em> the money here. Bars buy upgrades; aether is the currency that leaves the building.
            </div>
            <button
              onClick={onReset}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/50 transition hover:bg-white/5 hover:text-white/80"
            >
              ↺ Reset refinery
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
