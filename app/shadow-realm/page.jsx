// app/shadow-realm/page.jsx — SHADOW REALM entry.
//
// Spawn-to-bike: the rider arrives and picks RACE TRACK or FREE ROAM, then
// a track, then a trim bike (Wisp / Comet / Atlas) and a Tron film light
// scheme. Mounting fires fx.bikeMount() — the hub's bike-mount flow should
// call fx.bikeMount() and then launchPocketUniverse(shadowRealmUrl(mode)).
// See launch.js for the entry contract.
//
// Query params: ?mode=race|roam [&track=<key>] [&vehicle=<key>]

'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import RealmScene from './scene';
import { TRACKS, trackByKey } from './tracks';
import { TRAIL_SCHEMES, VEHICLES, schemeByKey, vehicleByKey } from './schemes';
import { parseShadowMode } from './launch';
import {
  STEER_LEFT,
  STEER_RIGHT,
  pressPad,
  releasePad,
  padSteer,
  shouldShowTouchSteer,
} from './steer-pads';
import { loadPrefs, savePrefs, accountIdFromWindow } from './prefs';
import { fx } from '@/lib/fx';
import { useBikeMotion } from '@/lib/use-bike-motion';
import { useFullscreen } from '@/lib/use-fullscreen';

const css = {
  screen: {
    position: 'fixed', inset: 0, background: '#030612', color: '#dbeafe',
    fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    touchAction: 'manipulation', // no double-tap zoom delay (double-tap = recenter)
    // iOS "hold to select" callout: no selectable text anywhere in the game
    // UI — kills the long-press Copy/Look Up menu over the realm. Pointer,
    // tilt, gyro, and the first-tap motion-permission gesture are unaffected.
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
  },
  center: { flex: 1, width: '100%', maxWidth: 560, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 },
  title: { fontSize: 30, fontWeight: 800, letterSpacing: 6, color: '#7dd3fc', textAlign: 'center', margin: '18px 0 2px' },
  sub: { textAlign: 'center', color: '#64748b', fontSize: 13, letterSpacing: 2 },
  bigBtn: {
    display: 'block', width: '100%', padding: '18px 16px', fontSize: 18, fontWeight: 700,
    letterSpacing: 3, color: '#04101f', background: 'linear-gradient(180deg,#7dd3fc,#38bdf8)',
    border: 'none', borderRadius: 14, cursor: 'pointer',
  },
  ghostBtn: {
    display: 'block', width: '100%', padding: '16px', fontSize: 16, fontWeight: 600,
    letterSpacing: 2, color: '#7dd3fc', background: 'transparent',
    border: '1px solid #1e3a5f', borderRadius: 14, cursor: 'pointer',
  },
  card: {
    padding: '14px 16px', borderRadius: 12, background: '#0a1226',
    border: '1px solid #16294a', cursor: 'pointer',
  },
  cardSel: { border: '1px solid #38bdf8', background: '#0d1a33', boxShadow: '0 0 18px rgba(56,189,248,.25)' },
  cardName: { fontWeight: 700, fontSize: 16, color: '#e0f2fe' },
  cardMeta: { fontSize: 12, color: '#38bdf8', letterSpacing: 1, marginTop: 2 },
  cardDesc: { fontSize: 13, color: '#94a3b8', marginTop: 6, lineHeight: 1.45 },
  row: { display: 'flex', gap: 10, alignItems: 'center' },
  chip: { fontSize: 12, padding: '6px 12px', borderRadius: 999, border: '1px solid #1e3a5f', color: '#7dd3fc', background: 'transparent', cursor: 'pointer' },
  sectionLabel: { fontSize: 12, letterSpacing: 3, color: '#475569', marginTop: 6 },
  hud: {
    position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', gap: 8,
    justifyContent: 'center', pointerEvents: 'none', zIndex: 5,
  },
  hudChip: {
    background: 'rgba(4,10,22,.72)', border: '1px solid #1e3a5f', borderRadius: 10,
    padding: '8px 14px', fontSize: 14, color: '#bae6fd', letterSpacing: 1, minWidth: 86, textAlign: 'center',
  },
  // circular ride-control buttons (hub circle language: 48px, cyan on dark)
  circleBtn: (active) => ({
    width: 48, height: 48, borderRadius: '50%', border: '1px solid #1e3a5f',
    background: active ? 'rgba(14,42,77,.88)' : 'rgba(4,10,22,.72)',
    color: '#7dd3fc', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 19, cursor: 'pointer', pointerEvents: 'auto', flexShrink: 0,
    boxShadow: active ? '0 0 14px rgba(56,189,248,.45)' : 'none',
  }),
  toast: {
    position: 'absolute', bottom: 132, left: '50%', transform: 'translateX(-50%)',
    zIndex: 9, background: 'rgba(4,10,22,.88)', border: '1px solid #1e3a5f',
    borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#bae6fd',
    pointerEvents: 'none', textAlign: 'center', maxWidth: '82%', letterSpacing: 0.5,
  },
};

function fmtTime(s) {
  if (s == null || !isFinite(s)) return '—';
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, '0');
  return m > 0 ? `${m}:${sec}` : `${sec}s`;
}

function StatBar({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <span style={{ fontSize: 11, color: '#64748b', width: 64 }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#16294a', overflow: 'hidden' }}>
        <div style={{ width: `${Math.round(value * 100)}%`, height: '100%', background: '#38bdf8' }} />
      </div>
    </div>
  );
}

function ShadowRealmInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const urlMode = parseShadowMode(sp.get('mode'));

  const [prefs] = useState(() => {
    if (typeof window === 'undefined') return null;
    return loadPrefs(window.localStorage, accountIdFromWindow());
  });
  const [stage, setStage] = useState('mode'); // mode | track | garage | countdown | ride | finished
  const [mode, setMode] = useState(urlMode);
  const [trackKey, setTrackKey] = useState(sp.get('track') || prefs?.trackKey || 'gridiron-oval');
  const [vehicleKey, setVehicleKey] = useState(sp.get('vehicle') || prefs?.vehicleKey || 'comet');
  const [schemeKey, setSchemeKey] = useState(prefs?.schemeKey || 'grid-blue');
  const [laps, setLaps] = useState(prefs?.laps || 3);
  const [count, setCount] = useState(3);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState({ speed: 0, lap: 1, lapsTotal: 3, time: 0, progress: 0 });
  const [lastLap, setLastLap] = useState(null);
  const [result, setResult] = useState(null);

  const inputRef = useRef({ steer: 0, boost: false, lookYaw: 0, lookPitch: 0, throttle: 0, brake: 0, regen: 0, motionDrive: false });
  const hudRef = useRef(null);
  const containerRef = useRef(null);
  // Manual-steer tracking: tilt steering never fights an active pad or key.
  const manualSteer = useRef({ pads: 0, keys: false });
  const touchSteerRef = useRef(false);
  const setManualSteer = () => {
    touchSteerRef.current = manualSteer.current.pads > 0 || manualSteer.current.keys;
  };
  // Fallback steer pads: rendered ONLY while tilt is not driving (motion
  // permission denied, no gyro). They feed the same manual-steer plumbing
  // as the keyboard, so touch always wins over tilt — and the moment tilt
  // starts driving, the pads unmount. heldPads keeps press order so the
  // most-recently-pressed held direction wins under multi-touch.
  const heldPads = useRef([]);
  const syncPadSteer = () => {
    manualSteer.current.pads = heldPads.current.length;
    setManualSteer();
    // Don't clobber a held key's steer when the last pad lifts.
    if (heldPads.current.length > 0 || !manualSteer.current.keys) {
      inputRef.current.steer = padSteer(heldPads.current);
    }
  };
  const pressSteerPad = (dir) => (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    heldPads.current = pressPad(heldPads.current, dir);
    syncPadSteer();
  };
  const releaseSteerPad = (dir) => () => {
    heldPads.current = releasePad(heldPads.current, dir);
    syncPadSteer();
  };
  const track = useMemo(() => trackByKey(trackKey), [trackKey]);
  const vehicle = useMemo(() => vehicleByKey(vehicleKey), [vehicleKey]);
  const scheme = useMemo(() => schemeByKey(schemeKey), [schemeKey]);

  // Phone motion: tilt steering + gyro look-around (per-device preference).
  const motion = useBikeMotion({ inputRef, hudRef, vehicle, stage, touchSteerRef });
  // Immersion: true fullscreen where available, honest focus mode on iPhone.
  const fsx = useFullscreen(containerRef);

  // Calibrate the motion neutral the moment a run starts — the rider's
  // current hold becomes zero, so the first tilt is intentional, not a jump.
  // Also resume the listener if motion stayed armed across runs (RIDE AGAIN).
  useEffect(() => {
    if (stage === 'ride') {
      motion.recalibrate();
      motion.resumeIfArmed();
      // Fresh run: no stale pad presses survive into the ride.
      heldPads.current = [];
      manualSteer.current.pads = 0;
      setManualSteer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Tilt took over mid-press (or the pads unmounted for any reason): drop
  // any in-flight pad presses so a stale held pad can never mute tilt.
  useEffect(() => {
    if (motion.motionOn && heldPads.current.length > 0) {
      heldPads.current = [];
      syncPadSteer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion.motionOn]);

  const persist = (patch) => {
    if (typeof window === 'undefined') return;
    savePrefs(window.localStorage, accountIdFromWindow(), {
      vehicleKey, schemeKey, trackKey, mode, laps, ...patch,
    });
  };

  // countdown beeps
  useEffect(() => {
    if (stage !== 'countdown') return;
    setCount(3);
    const timers = [3, 2, 1].map((n, i) =>
      setTimeout(() => {
        setCount(n);
        try { fx.countdownBeep(n === 1); } catch { /* best-effort */ }
      }, i * 900)
    );
    timers.push(setTimeout(() => {
      try { fx.go(); } catch { /* best-effort */ }
      setStage('ride');
    }, 3 * 900));
    return () => timers.forEach(clearTimeout);
  }, [stage]);

  // HUD polling (scene writes into hudRef, React reads at 7Hz)
  useEffect(() => {
    if (stage !== 'ride') return;
    const id = setInterval(() => {
      if (hudRef.current) setHud({ ...hudRef.current });
    }, 140);
    return () => clearInterval(id);
  }, [stage]);

  // keyboard (desktop) — keys count as manual steering so tilt never fights them
  useEffect(() => {
    if (stage !== 'ride') return;
    const down = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        manualSteer.current.keys = true; setManualSteer(); inputRef.current.steer = -1;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        manualSteer.current.keys = true; setManualSteer(); inputRef.current.steer = 1;
      }
      if (e.key === 'Shift' || e.key === ' ') inputRef.current.boost = true;
      if (e.key === 'p' || e.key === 'P') setPaused((p) => !p);
      if (e.key === 'Escape') leave();
    };
    const up = (e) => {
      if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(e.key)) {
        manualSteer.current.keys = false; setManualSteer();
        if (!touchSteerRef.current) inputRef.current.steer = 0;
      }
      if (e.key === 'Shift' || e.key === ' ') inputRef.current.boost = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const mount = () => {
    try { fx.bikeMount(); } catch { /* best-effort */ }
    persist({});
    setPaused(false);
    setResult(null);
    setLastLap(null);
    setStage('countdown');
  };

  const leave = () => {
    try { fx.bikeDismount(); } catch { /* best-effort */ }
    router.push('/');
  };

  const handleLap = (lapNum, lapTime) => {
    try { fx.checkpoint(); } catch { /* best-effort */ }
    setLastLap({ lapNum, lapTime });
  };

  const handleFinish = (res) => {
    try { fx.victory(); } catch { /* best-effort */ }
    setResult(res);
    setStage('finished');
  };

  // Manual-steer tracking: tilt steering never fights an active pad or key.
  // The always-on pads are gone — tilt is the steering — but a fallback
  // pad pair renders while tilt is not driving (see steer-pads.js), feeding
  // this same plumbing so touch always wins and the pads vanish the moment
  // tilt starts driving.

  // ---------------- menus ----------------
  if (stage === 'mode' || stage === 'track' || stage === 'garage') {
    return (
      <div style={css.screen} onContextMenu={(e) => e.preventDefault()}>
        <div style={css.center}>
          <div style={css.title}>SHADOW REALM</div>
          <div style={css.sub}>NIGHT-CYCLE GRID · TRON LIGHT BIKES</div>

          {stage === 'mode' && (
            <>
              <div style={css.sectionLabel}>HOW DO YOU WANT TO RIDE?</div>
              <button
                style={css.bigBtn}
                onClick={() => { setMode('race'); try { fx.menuOpen(); } catch {} setStage('track'); }}
              >
                RACE TRACK
              </button>
              <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center' }}>
                Time trial — {laps} laps, barriers bounce you back in. Pick your track and bike.
              </div>
              <button
                style={css.ghostBtn}
                onClick={() => { setMode('roam'); try { fx.menuOpen(); } catch {} setStage('track'); }}
              >
                FREE ROAM
              </button>
              <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center' }}>
                No laps, no clock. Cruise the grid under the moon.
              </div>
              {mode === 'race' && (
                <div>
                  <div style={css.sectionLabel}>LAPS</div>
                  <div style={{ ...css.row, marginTop: 8 }}>
                    {[1, 3, 5, 8].map((n) => (
                      <button
                        key={n}
                        style={{ ...css.chip, ...(laps === n ? { background: '#0d2a4d', borderColor: '#38bdf8' } : {}) }}
                        onClick={() => { setLaps(n); persist({ laps: n }); }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {stage === 'track' && (
            <>
              <div style={css.sectionLabel}>{mode === 'race' ? 'PICK YOUR TRACK' : 'PICK YOUR GROUND'} · {TRACKS.length} TRACKS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {TRACKS.map((t) => (
                  <div
                    key={t.key}
                    style={{ ...css.card, ...(t.key === trackKey ? css.cardSel : {}) }}
                    onClick={() => { setTrackKey(t.key); persist({ trackKey: t.key }); try { fx.tap(); } catch {} }}
                  >
                    <div style={css.cardName}>{t.name}</div>
                    <div style={css.cardMeta}>{t.layout.toUpperCase()} · {Math.round(t.width)} WIDE</div>
                    <div style={css.cardDesc}>{t.desc}</div>
                  </div>
                ))}
              </div>
              <div style={css.row}>
                <button style={{ ...css.ghostBtn, flex: 1 }} onClick={() => setStage('mode')}>BACK</button>
                <button style={{ ...css.bigBtn, flex: 2 }} onClick={() => setStage('garage')}>PICK BIKE</button>
              </div>
            </>
          )}

          {stage === 'garage' && (
            <>
              <div style={css.sectionLabel}>PICK YOUR TRIM BIKE</div>
              {VEHICLES.map((v) => (
                <div
                  key={v.key}
                  style={{ ...css.card, ...(v.key === vehicleKey ? css.cardSel : {}) }}
                  onClick={() => { setVehicleKey(v.key); persist({ vehicleKey: v.key }); try { fx.tap(); } catch {} }}
                >
                  <div style={css.cardName}>{v.name}</div>
                  <div style={css.cardDesc}>{v.desc}</div>
                  <StatBar label="Top speed" value={v.maxSpeed / 60} />
                  <StatBar label="Handling" value={v.turnRate / 2.6} />
                  <StatBar label="Boost" value={(v.boostMult - 1) / 0.8} />
                </div>
              ))}
              <div style={css.sectionLabel}>LIGHT SCHEME · ALL THREE FILMS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {TRAIL_SCHEMES.map((s) => (
                  <div
                    key={s.key}
                    style={{ ...css.card, ...(s.key === schemeKey ? css.cardSel : {}) }}
                    onClick={() => { setSchemeKey(s.key); persist({ schemeKey: s.key }); try { fx.tap(); } catch {} }}
                  >
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: s.primary, boxShadow: `0 0 10px ${s.primary}` }} />
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: s.secondary, boxShadow: `0 0 10px ${s.secondary}` }} />
                    </div>
                    <div style={css.cardName}>{s.name}</div>
                    <div style={css.cardMeta}>{s.film.toUpperCase()}</div>
                  </div>
                ))}
              </div>
              <div style={css.row}>
                <button style={{ ...css.ghostBtn, flex: 1 }} onClick={() => setStage('track')}>BACK</button>
                <button style={{ ...css.bigBtn, flex: 2 }} onClick={mount}>
                  {mode === 'race' ? 'MOUNT & RACE' : 'MOUNT & RIDE'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---------------- countdown / ride / finished ----------------
  const riding = stage === 'ride' || stage === 'finished';
  const immersed = fsx.focusMode; // chrome hidden: true fullscreen or iPhone focus mode
  return (
    <div style={css.screen} ref={containerRef} onContextMenu={(e) => e.preventDefault()}>
      <div
        style={{ position: 'absolute', inset: 0 }}
        onDoubleClick={() => { if (motion.motionOn) motion.recenter(); }}
        title={motion.motionOn ? 'Double-tap to recenter view' : undefined}
      >
        <RealmScene
          track={track}
          vehicleKey={vehicleKey}
          schemeKey={schemeKey}
          mode={mode}
          laps={laps}
          running={stage === 'ride' && !paused}
          inputRef={inputRef}
          hudRef={hudRef}
          onLap={handleLap}
          onFinish={handleFinish}
        />
      </div>

      {stage === 'countdown' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10, pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 120, fontWeight: 900, color: scheme.primary, textShadow: `0 0 40px ${scheme.primary}` }}>
            {count}
          </div>
        </div>
      )}

      {riding && (
        <>
          {!immersed && (
            <div style={css.hud}>
              {mode === 'race' && (
                <div style={css.hudChip}>LAP {hud.lap}/{hud.lapsTotal}</div>
              )}
              <div style={css.hudChip}>{fmtTime(hud.time)}</div>
              <div style={css.hudChip}>{hud.speed} MPH</div>
              {motion.motionArmed && (
                <div
                  style={{
                    ...css.hudChip,
                    color: hud.surging ? '#0a0a0a' : '#fbbf24',
                    background: hud.surging ? '#fbbf24' : undefined,
                    borderColor: '#fbbf24',
                  }}
                >
                  {hud.surging ? '⚡ SURGE' : `⚡ ${Math.round((hud.boostCharge || 0) * 100)}%`}
                </div>
              )}
            </div>
          )}
          {lastLap && mode === 'race' && !immersed && (
            <div style={{ position: 'absolute', top: 64, width: '100%', textAlign: 'center', zIndex: 5, pointerEvents: 'none', color: '#7dd3fc', fontSize: 13, letterSpacing: 2 }}>
              LAP {lastLap.lapNum} · {fmtTime(lastLap.lapTime)}
            </div>
          )}
          {/* touch controls: BOOST + fallback steer pads (pads render only
              while tilt is NOT driving — tilt riders never see them);
              camera stays drag-to-orbit */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none' }}>
            {shouldShowTouchSteer(stage, motion.motionOn) && (
              <div
                style={{
                  position: 'absolute', left: 18, bottom: 128, display: 'flex', gap: 12,
                  pointerEvents: 'auto', touchAction: 'none',
                }}
              >
                <div
                  role="button"
                  aria-label="Steer left (fallback — tilt steering is off)"
                  onPointerDown={pressSteerPad(STEER_LEFT)}
                  onPointerUp={releaseSteerPad(STEER_LEFT)}
                  onPointerCancel={releaseSteerPad(STEER_LEFT)}
                >
                  <div style={{ width: 76, height: 76, borderRadius: '50%', border: `2px solid ${scheme.primary}`, background: 'rgba(10,20,40,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700, color: scheme.primary }}>‹</div>
                </div>
                <div
                  role="button"
                  aria-label="Steer right (fallback — tilt steering is off)"
                  onPointerDown={pressSteerPad(STEER_RIGHT)}
                  onPointerUp={releaseSteerPad(STEER_RIGHT)}
                  onPointerCancel={releaseSteerPad(STEER_RIGHT)}
                >
                  <div style={{ width: 76, height: 76, borderRadius: '50%', border: `2px solid ${scheme.primary}`, background: 'rgba(10,20,40,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700, color: scheme.primary }}>›</div>
                </div>
              </div>
            )}
            <div
              style={{ position: 'absolute', right: 18, bottom: 128, pointerEvents: 'auto', touchAction: 'none' }}
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); inputRef.current.boost = true; try { fx.boost(); } catch {} }}
              onPointerUp={() => { inputRef.current.boost = false; }}
              onPointerCancel={() => { inputRef.current.boost = false; }}
            >
              <div style={{ width: 76, height: 76, borderRadius: '50%', border: `2px solid ${scheme.primary}`, background: 'rgba(10,20,40,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: scheme.primary, letterSpacing: 1 }}>BOOST</div>
            </div>
            {/* ride controls: motion + immersion circles; pause/leave adapt to immersion */}
            <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8, pointerEvents: 'auto', zIndex: 7 }}>
              <button
                aria-label={motion.motionOn ? 'Turn off tilt steering and gyro look' : 'Turn on tilt steering and gyro look'}
                title="Tilt steering + gyro look"
                onClick={motion.toggleMotion}
                style={css.circleBtn(motion.motionArmed)}
              >
                ◐
              </button>
              <button
                aria-label={immersed ? 'Exit fullscreen ride' : 'Fullscreen ride'}
                title={immersed ? 'Exit fullscreen' : 'Fullscreen'}
                onClick={fsx.toggleFullscreen}
                style={css.circleBtn(immersed)}
              >
                ⛶
              </button>
              {motion.motionOn && (
                <button
                  aria-label="Recenter view and steering neutral"
                  title="Recenter (or double-tap the track)"
                  onClick={motion.recenter}
                  style={css.circleBtn(false)}
                >
                  ⟳
                </button>
              )}
              <button
                aria-label={paused ? 'Resume ride' : 'Pause ride'}
                title={paused ? 'Ride' : 'Hold'}
                onClick={() => setPaused((p) => !p)}
                style={css.circleBtn(paused)}
              >
                {paused ? '▶' : '❚❚'}
              </button>
              {!immersed && (
                <button
                  aria-label="Leave the realm"
                  title="Leave"
                  onClick={leave}
                  style={css.circleBtn(false)}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          {(motion.motionMsg || fsx.fsMsg) && (
            <div style={css.toast}>{motion.motionMsg || fsx.fsMsg}</div>
          )}
          {paused && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 8, background: 'rgba(3,6,18,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 22, letterSpacing: 4, color: '#7dd3fc' }}>HELD</div>
              <button style={{ ...css.bigBtn, width: 220 }} onClick={() => setPaused(false)}>RIDE</button>
              <button style={{ ...css.ghostBtn, width: 220 }} onClick={leave}>LEAVE REALM</button>
            </div>
          )}
        </>
      )}

      {stage === 'finished' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 9, background: 'rgba(3,6,18,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 420, padding: 24, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 4, color: scheme.primary }}>FINISH</div>
            <div style={{ fontSize: 15, color: '#94a3b8' }}>
              {track.name} · {result?.laps} laps
            </div>
            <div style={{ fontSize: 44, fontWeight: 800, color: '#e0f2fe' }}>{fmtTime(result?.total)}</div>
            <button style={css.bigBtn} onClick={mount}>RIDE AGAIN</button>
            <button style={css.ghostBtn} onClick={() => setStage('track')}>CHANGE TRACK</button>
            <button style={css.ghostBtn} onClick={leave}>LEAVE REALM</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ShadowRealmPage() {
  return (
    <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#030612' }} />}>
      <ShadowRealmInner />
    </Suspense>
  );
}
