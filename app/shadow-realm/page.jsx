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

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import RealmScene from './scene';
import { makeBots, placements } from './ai';
import { TRACKS, trackByKey, isBumpTrack } from './tracks';
import { isRoam } from './roam';
import { TRAIL_SCHEMES, VEHICLES, schemeByKey, vehicleByKey } from './schemes';
import { parseShadowMode } from './launch';
// BUMP RACE (Merlin 2026-10-03): bumper bikes around the eternal flame.
import { BUMP_LIVES, BOT_AGGRESSION, sortBumpStandings } from '@/lib/shadow-realm/bump';
import {
  STEER_LEFT,
  STEER_RIGHT,
  pressPad,
  releasePad,
  padSteer,
  shouldShowTouchSteer,
} from './steer-pads';
import { loadPrefs, savePrefs, accountIdFromWindow, hasSeenTutorial, markTutorialSeen } from './prefs';
import {
  createTapState,
  tapDown,
  tapUp,
  markControlUse,
} from '@/lib/shadow-realm/recenter';
import { boostMeter } from '@/lib/shadow-realm/boost-meter';
import { fx } from '@/lib/fx';
import { useBikeMotion } from '@/lib/use-bike-motion';
import { useFullscreen } from '@/lib/use-fullscreen';
import { supabase } from '@/lib/supabase';
// Drop-2 netcode: PvP track matches + open-world presence.
import {
  RACE_BEACON_MS,
  ROAM_BEACON_MS,
  REMOTE_CAP,
  GRID_ROOM_CODE,
  beaconRow,
  isBeaconStale,
  sortStandings,
  nearestN,
} from '@/lib/shadow-realm/net';
import {
  PVP_SIZES,
  hashRoomCode,
  createPvpRoom,
  shouldLaunch,
  launchRoom,
  aiAutofillCount,
  shouldClaimHost,
  claimHost,
  leavePvpRoom,
  decidePvpJoin,
  joinOrCreateGridRoom,
  queueRemainingMs,
} from '@/lib/shadow-realm/pvp';
import {
  getRoom,
  joinRoom,
  subscribeToRoom,
  humansInRoom,
  normalizeCode,
  isValidRoomCode,
} from '@/lib/oasis/rooms';
import { ghostColorFor } from '@/lib/luge/pvp';

// HOW TO RIDE tutorial cards (Merlin 2026-10-03): 5 clean, minimal cards —
// one at a time, dots + Next/Skip. Dark UI, matches the realm aesthetic.
const TUTORIAL_CARDS = [
  {
    emoji: '🏍️',
    title: 'STEER',
    body: 'Tilt your phone left to go left, right to go right. It is never inverted — right is always right.',
  },
  {
    emoji: '💨',
    title: 'SPEED',
    body: 'Your bike cruises on its own. Tilt forward for more speed, tilt back to brake.',
  },
  {
    emoji: '⚡',
    title: 'BOOST',
    body: 'Bump rivals — or tilt hard left to regen-charge your meter. Then tap BOOST for a surge.',
  },
  {
    emoji: '🔥',
    title: 'SURVIVE',
    body: 'Rival light trails are lethal in races. In Bump Race, don\'t get knocked into the flame — 3 lives each.',
  },
  {
    emoji: '🎯',
    title: 'RECENTER',
    body: 'Double-tap anytime to reset your neutral hold. Your current grip becomes straight-and-level.',
  },
];

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
  // HOW TO RIDE tutorial (menu layer only — never during the ride).
  helpBtn: {
    position: 'absolute', top: 14, right: 14, width: 40, height: 40,
    borderRadius: '50%', border: '1px solid #1e3a5f', background: 'rgba(10,18,38,.85)',
    color: '#7dd3fc', fontSize: 20, fontWeight: 700, cursor: 'pointer', zIndex: 10,
  },
  tutOverlay: {
    position: 'absolute', inset: 0, zIndex: 50, display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: 24,
    background: 'rgba(2,5,14,.82)',
  },
  tutCard: {
    width: '100%', maxWidth: 340, padding: '28px 24px 20px', borderRadius: 18,
    background: '#0a1226', border: '1px solid #1e3a5f',
    boxShadow: '0 0 40px rgba(56,189,248,.18)', textAlign: 'center',
  },
  tutEmoji: { fontSize: 44, marginBottom: 10 },
  tutTitle: { fontSize: 16, fontWeight: 800, letterSpacing: 4, color: '#7dd3fc', marginBottom: 10 },
  tutBody: { fontSize: 15, lineHeight: 1.55, color: '#cbd5e1', marginBottom: 20, minHeight: 70 },
  tutDots: { display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 18 },
  tutDot: { width: 8, height: 8, borderRadius: '50%', background: '#1e3a5f' },
  tutDotOn: { background: '#38bdf8', boxShadow: '0 0 8px rgba(56,189,248,.8)' },
  hud: {
    position: 'absolute',
    // Safe-area aware: iPhone notches and the Safari chrome must never clip
    // the pills (Merlin 2026-10-03: "IMMU…" / "LAP…" were cut off).
    top: 'calc(10px + env(safe-area-inset-top, 0px))',
    left: 'calc(10px + env(safe-area-inset-left, 0px))',
    right: 'calc(10px + env(safe-area-inset-right, 0px))',
    display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center',
    flexWrap: 'wrap', // narrow screens wrap instead of clipping
    pointerEvents: 'none', zIndex: 5,
  },
  hudChip: {
    background: 'rgba(4,10,22,.72)', border: '1px solid #1e3a5f', borderRadius: 10,
    padding: '7px 11px', fontSize: 13, color: '#bae6fd', letterSpacing: 1,
    textAlign: 'center', whiteSpace: 'nowrap',
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

// Shared track picker card list (solo track select + PvP setup reuse it).
function TrackCards({ trackKey, onPick }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {TRACKS.map((t) => (
        <div
          key={t.key}
          style={{ ...css.card, ...(t.key === trackKey ? css.cardSel : {}) }}
          onClick={() => onPick(t.key)}
        >
          <div style={css.cardName}>{t.name} {t.bump ? '🔥' : ''}</div>
          <div style={css.cardMeta}>{t.layout.toUpperCase()} · {Math.round(t.width)} WIDE{t.bump ? ' · BUMP ARENA' : ''}</div>
          <div style={css.cardDesc}>{t.desc}</div>
        </div>
      ))}
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
  const [laps, setLaps] = useState([3, 5, 8].includes(prefs?.laps) ? prefs.laps : 3);
  const [aiCount, setAiCount] = useState(prefs?.aiCount || 0);
  const [count, setCount] = useState(3);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState({ speed: 0, lap: 1, lapsTotal: 3, time: 0, progress: 0 });
  const [lastLap, setLastLap] = useState(null);
  const [result, setResult] = useState(null);
  // BUMP RACE: heat-flash screen feedback on flame hits.
  const [heatFlash, setHeatFlash] = useState(false);
  const heatFlashTimer = useRef(null);
  // BOOST button pressed visual (instant local feedback — the HUD's
  // BOOSTING pill follows at 7Hz from the physics rig).
  const [boostHeld, setBoostHeld] = useState(false);
  // Hardened double-tap-to-recenter (Merlin 2026-10-03): the bare
  // onDoubleClick fired on any two quick taps, so grip adjustments kept
  // recentering the neutral hold. tapState requires two taps on the same
  // spot within a tight window, rejects drags, and ignores taps that land
  // right after a control press (see lib/shadow-realm/recenter.js).
  const tapStateRef = useRef(null);
  if (!tapStateRef.current) tapStateRef.current = createTapState();
  const noteControlUse = useCallback(() => {
    markControlUse(tapStateRef.current, typeof performance !== 'undefined' ? performance.now() : Date.now());
  }, []);
  // BUMP RACE (PvP): highest alive-count seen this race — the race only
  // ends at <=1 alive once it has genuinely started (>= 2 seen).
  const bumpSeenRef = useRef(0);
  // Finish rollout: delayed setStage('finished') so the coast is visible.
  const finishTimerRef = useRef(null);
  // HOW TO RIDE tutorial (Merlin 2026-10-03): 5 cards, menu layer only.
  // Auto-shows on first visit (localStorage flag), one-tap skip, "?"
  // reopens it anytime. Never touches the ride itself.
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutStep, setTutStep] = useState(0);
  useEffect(() => () => { if (finishTimerRef.current) clearTimeout(finishTimerRef.current); }, []);

  // ---- Drop-2 netcode: PvP track matches + open-world presence ----
  // Stages gained: 'pvp-setup' (field size / track / laps / join-by-code),
  // 'pvp-lobby' (room code, queue countdown, rider list). The 'ride' stage
  // is reused for PvP; roam gains silent presence on the grid room.
  const [pvpMax, setPvpMax] = useState(4);
  const [pvpJoinCode, setPvpJoinCode] = useState('');
  const [pvpCode, setPvpCode] = useState('');
  const [pvpRoom, setPvpRoom] = useState(null);
  const [pvpCallsigns, setPvpCallsigns] = useState({});
  const [pvpMsg, setPvpMsg] = useState('');
  const [remotes, setRemotes] = useState([]);
  const [nowTick, setNowTick] = useState(Date.now());
  const [shared, setShared] = useState(false);
  // Bumped whenever the net session activates/deactivates so the beacon
  // loops (which only run on stage changes otherwise) pick it up even when
  // presence joins async after the ride already started.
  const [netTick, setNetTick] = useState(0);
  const pvpUnsubRef = useRef(null);
  const launchedRef = useRef(false);
  const pvpSyncRef = useRef(null); // synced startsAt for the PvP countdown
  const pvpStartsAtRef = useRef(0);
  const netActiveRef = useRef(null); // null | 'pvp' | 'roam'
  const netRoomRef = useRef('');
  const netNowRef = useRef(Date.now());
  const remotesRef = useRef([]);
  const myUserIdRef = useRef('');
  const myCallsignRef = useRef('Rider');
  const deepLinkedRef = useRef(false);

  const inputRef = useRef({ steer: 0, boost: false, lookYaw: 0, lookPitch: 0, throttle: 0, brake: 0, regen: 0, motionDrive: false });
  const hudRef = useRef(null);
  // VS AI roster for the run (built in mount(), advanced by Bots in the scene).
  const botsRef = useRef([]);
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

  // Mode/track consistency (Merlin 2026-10-03, video bug hunt): FREE ROAM on
  // a bump track is an impossible state — no track mesh renders, no flame
  // renders, the HUD mixes roam + bump chips, and roam spawns at the origin
  // (inside the flame). The bump arena only exists for BUMP RACE. Normalize
  // by construction: roam mode always rides a normal track. This covers the
  // FREE ROAM button (which doesn't set trackKey), ?mode=roam deep links,
  // and stale persisted prefs — no silent broken state, ever.
  useEffect(() => {
    if (isRoam(mode) && isBumpTrack(track)) {
      const safe = TRACKS.find((t) => !isBumpTrack(t));
      if (safe && safe.key !== trackKey) setTrackKey(safe.key);
    }
  }, [mode, track, trackKey]);

  // HOW TO RIDE tutorial: first visit only. The flag is device-scoped
  // (it's about the rider's hands, not their login); a private-mode
  // failure just means it shows again — harmless, never blocking.
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && !hasSeenTutorial(window.localStorage)) {
        setShowTutorial(true);
      }
    } catch { /* tutorial is optional chrome, never fatal */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skipTutorial = () => {
    try {
      if (typeof window !== 'undefined') markTutorialSeen(window.localStorage);
    } catch { /* noop */ }
    setShowTutorial(false);
  };
  const nextTutorial = () => {
    try { fx.tap(); } catch { /* noop */ }
    if (tutStep >= TUTORIAL_CARDS.length - 1) skipTutorial();
    else setTutStep(tutStep + 1);
  };
  const openTutorial = () => {
    try { fx.tap(); } catch { /* noop */ }
    setTutStep(0);
    setShowTutorial(true);
  };

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
      vehicleKey, schemeKey, trackKey, mode, laps, aiCount, ...patch,
    });
  };

  // ---------------- drop-2 netcode helpers ----------------
  // Identity for beacons: the signed-in user id + their OASIS callsign
  // (public read; falls back to 'Rider'). Cached for the session.
  const ensureIdentity = async () => {
    if (myUserIdRef.current) return myUserIdRef.current;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !user.id) return '';
      myUserIdRef.current = user.id;
      try {
        const { data: prof } = await supabase
          .from('oasis_profiles')
          .select('callsign')
          .eq('id', user.id)
          .single();
        if (prof && prof.callsign) myCallsignRef.current = String(prof.callsign).slice(0, 24);
      } catch { /* signed in, no profile row — 'Rider' stands */ }
      return user.id;
    } catch {
      return '';
    }
  };

  // Leave whatever net session is active: drop from player_ids + delete the
  // own beacon row. Safe to call when nothing is active.
  const stopNet = async () => {
    const code = netRoomRef.current;
    const kind = netActiveRef.current;
    const myId = myUserIdRef.current;
    netActiveRef.current = null;
    netRoomRef.current = '';
    remotesRef.current = [];
    setRemotes([]);
    setNetTick((t) => t + 1);
    if (!code || !kind || !myId) return;
    try {
      await leavePvpRoom(supabase, { code, playerId: myId });
    } catch { /* leave proceeds regardless */ }
  };

  // One beacon for this rider: live transform from the scene's hudRef.
  // BUMP RACE battle events from the scene: flame hits flash the screen red
  // (the Rig already plays fx.hit() on bumps itself — no double audio here).
  // LETHAL TRAILS: a trail death raises a "SHREDDED BY <name>'s TRAIL" toast.
  const [deathToast, setDeathToast] = useState(null);
  const deathToastTimer = useRef(null);
  const handleBumpEvent = (evt) => {
    if (!evt) return;
    if (evt.type === 'flame-hit') {
      setHeatFlash(true);
      if (heatFlashTimer.current) clearTimeout(heatFlashTimer.current);
      heatFlashTimer.current = setTimeout(() => setHeatFlash(false), 750);
      try { fx.hit(); } catch { /* best-effort */ }
    } else if (evt.type === 'trail-death') {
      const owner = String(evt.owner || 'RIVAL').slice(0, 24);
      setDeathToast(`SHREDDED BY ${owner}'s TRAIL`);
      if (deathToastTimer.current) clearTimeout(deathToastTimer.current);
      deathToastTimer.current = setTimeout(() => setDeathToast(null), 3000);
    }
  };
  useEffect(() => () => {
    if (deathToastTimer.current) clearTimeout(deathToastTimer.current);
  }, []);

  const buildMyBeacon = (finished, finishMs) => {
    const h = hudRef.current || {};
    const overall = laps > 0
      ? Math.min(1, Math.max(0, (Math.max(1, h.lap || 1) - 1 + (h.progress || 0)) / laps))
      : 0;
    return beaconRow({
      roomCode: netRoomRef.current,
      userId: myUserIdRef.current,
      callsign: myCallsignRef.current,
      x: h.x || 0,
      z: h.z || 0,
      heading: h.heading || 0,
      speed: h.speedRaw || 0,
      boosting: !!inputRef.current.boost,
      progress: netActiveRef.current === 'pvp' ? overall : 0,
      finished,
      finishMs,
      // BUMP RACE battle state — self-reported like finish times.
      lives: h.lives == null ? BUMP_LIVES : h.lives,
      // LETHAL TRAILS — self-reported like lives: the recent trail for
      // remote collision, the death count, and the last death timestamp.
      trail: h.trail || null,
      deaths: h.deaths || 0,
      diedAt: h.diedAtWall ? new Date(h.diedAtWall).toISOString() : null,
    });
  };

  const sendBeaconNow = async (finished, finishMs) => {
    if (!netActiveRef.current || !netRoomRef.current || !myUserIdRef.current) return;
    try {
      await supabase
        .from('shadow_realm_beacons')
        .upsert(buildMyBeacon(finished, finishMs), { onConflict: 'room_code,user_id' });
    } catch {
      // Best-effort: a failed beacon degrades the live board, never the ride.
    }
  };

  // Enter the lobby with a fresh room row: adopt the host's track/laps so
  // joiners ride the same config, and arm the net session.
  const enterPvpLobby = (room) => {
    const fs = room.full_state || {};
    if (fs.trackKey && trackByKey(fs.trackKey)) {
      setTrackKey(fs.trackKey);
      persist({ trackKey: fs.trackKey });
    }
    if (fs.laps) {
      setLaps(fs.laps);
      persist({ laps: fs.laps });
    }
    launchedRef.current = false;
    pvpSyncRef.current = null;
    setPvpRoom(room);
    setPvpCode(room.room_code);
    setPvpCallsigns({});
    netActiveRef.current = 'pvp';
    netRoomRef.current = room.room_code;
    setNetTick((t) => t + 1);
    setStage('pvp-lobby');
  };

  const createPvp = async () => {
    setPvpMsg('Creating room…');
    const myId = await ensureIdentity();
    if (!myId) { setPvpMsg('Sign in to race real riders.'); return; }
    try {
      const room = await createPvpRoom(supabase, {
        hostId: myId, maxPlayers: pvpMax, trackKey, laps,
      });
      setPvpMsg('');
      enterPvpLobby(room);
    } catch {
      setPvpMsg('Could not create the room — try again.');
    }
  };

  const joinPvp = async (raw) => {
    const code = normalizeCode(raw || pvpJoinCode);
    if (!isValidRoomCode(code)) { setPvpMsg('Enter the 6-character room code.'); return; }
    setPvpMsg('Joining…');
    const myId = await ensureIdentity();
    if (!myId) { setPvpMsg('Sign in to join the race.'); return; }
    try {
      const room = await getRoom(supabase, code);
      const d = decidePvpJoin(room);
      if (d.error) { setPvpMsg(d.error); return; }
      if (d.mode === 'spectate') { setPvpMsg('That race already started — ask the host for the next one.'); return; }
      const res = await joinRoom(supabase, { code, playerId: myId });
      if (res.error) { setPvpMsg(res.error); return; }
      setPvpMsg('');
      enterPvpLobby(res.room);
    } catch {
      setPvpMsg('Could not join — try again.');
    }
  };

  // The room launched (by us or a rival's poll): build the deterministic
  // AI backfill locally — every client seeds from the room code, so the
  // rival roster matches on all devices with zero coordination — then run
  // the synced countdown off the shared startsAt.
  const startPvpRace = (room) => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    try { if (pvpUnsubRef.current) pvpUnsubRef.current(); } catch { /* noop */ }
    pvpUnsubRef.current = null;
    const fs = room.full_state || {};
    const trk = trackByKey(fs.trackKey || trackKey) || track;
    if (trk.key !== trackKey) setTrackKey(trk.key);
    const raceLaps = fs.laps || laps;
    if (raceLaps !== laps) setLaps(raceLaps);
    botsRef.current = makeBots({
      count: aiAutofillCount(room),
      track: trk,
      seed: hashRoomCode(room.room_code),
      // Bump-arena PvP: autofilled rivals shove too.
      aggression: trk.bump ? BOT_AGGRESSION : 0,
    });
    pvpStartsAtRef.current = fs.startsAt || Date.now();
    pvpSyncRef.current = pvpStartsAtRef.current;
    setPaused(false);
    setResult(null);
    setLastLap(null);
    setStage('countdown');
  };

  const leaveLobby = async () => {
    try { if (pvpUnsubRef.current) pvpUnsubRef.current(); } catch { /* noop */ }
    pvpUnsubRef.current = null;
    await stopNet();
    setPvpRoom(null);
    setPvpCode('');
    setPvpCallsigns({});
    setPvpMsg('');
    launchedRef.current = false;
    pvpSyncRef.current = null;
    setStage('mode');
  };

  const backToPvpSetup = async () => {
    await stopNet();
    launchedRef.current = false;
    pvpSyncRef.current = null;
    setStage('pvp-setup');
  };

  const shareRoom = async () => {
    if (!pvpCode) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/shadow-realm?code=${pvpCode}`);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch { /* clipboard unavailable — the code is on screen */ }
  };

  // Open-world presence: join-or-create the persistent grid room. Runs
  // async after the roam ride starts; everything it touches is best-effort,
  // so a DB hiccup just means solo roaming.
  const joinGridPresence = async () => {
    const myId = await ensureIdentity();
    if (!myId) return; // signed-out riders roam solo — no presence
    netActiveRef.current = 'roam';
    netRoomRef.current = GRID_ROOM_CODE;
    setNetTick((t) => t + 1);
    try {
      await joinOrCreateGridRoom(supabase, myId);
    } catch { /* presence degrades, the roam continues */ }
  };

  // PvP results: human beacon standings (synced finish_ms) merged with the
  // local AI roster, finished-first by time then by progress.
  const pvpStandings = (finishMs) => {
    const mine = {
      user_id: myUserIdRef.current,
      callsign: `${myCallsignRef.current} ★`,
      progress: 1,
      finished: true,
      finish_ms: finishMs,
      updated_at: new Date().toISOString(),
    };
    const humans = sortStandings([...remotesRef.current, mine]);
    const rows = [
      ...humans.map((h) => ({
        name: h.callsign,
        color: h.userId === myUserIdRef.current ? scheme.primary : ghostColorFor(h.userId),
        isPlayer: h.userId === myUserIdRef.current,
        finishTime: h.finished && h.finishMs != null ? h.finishMs / 1000 : null,
        progress: h.progress,
      })),
      ...(botsRef.current || []).map((b) => ({
        name: b.name,
        color: b.color,
        isPlayer: false,
        finishTime: b.finished ? b.finishTime : null,
        progress: b.progress || 0,
      })),
    ];
    rows.sort((a, b) => {
      const af = a.finishTime != null;
      const bf = b.finishTime != null;
      if (af && bf) return a.finishTime - b.finishTime;
      if (af) return -1;
      if (bf) return 1;
      return b.progress - a.progress;
    });
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  };

  // countdown beeps
  useEffect(() => {
    if (stage !== 'countdown') return;
    // PvP launch: the countdown is synced — every rider ticks off the same
    // startsAt the room row carries, so the green light lands together.
    if (pvpSyncRef.current) {
      const startsAt = pvpSyncRef.current;
      let timer = null;
      const tick = () => {
        const remain = Math.max(0, startsAt - Date.now());
        setCount(Math.max(1, Math.ceil(remain / 1000)));
        if (remain <= 0) {
          try { fx.go(); } catch { /* best-effort */ }
          pvpSyncRef.current = null;
          setStage('ride');
        } else {
          timer = setTimeout(tick, 120);
        }
      };
      tick();
      return () => { if (timer) clearTimeout(timer); };
    }
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
  // TRAIL-AHEAD warning: the audio blip fires on the warning's rising edge
  // only (the overlay itself is driven by hud.trailWarn below).
  const trailWarnWasRef = useRef(false);
  useEffect(() => {
    if (stage !== 'ride') return;
    const id = setInterval(() => {
      if (hudRef.current) {
        const h = { ...hudRef.current };
        setHud(h);
        const warning = !!h.trailWarn;
        if (warning && !trailWarnWasRef.current) {
          try { fx.warn(); } catch { /* best-effort */ }
        }
        trailWarnWasRef.current = warning;
      }
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

  // ---------------- drop-2 netcode effects ----------------
  // PvP lobby: poll the room (2s, the OASIS pattern — no Realtime). Every
  // poll runs the lobby housekeeping: launch when the queue expires or the
  // room fills, migrate the host seat when it's orphaned, and start the
  // synced race the moment the room flips to playing.
  useEffect(() => {
    if (stage !== 'pvp-lobby' || !pvpCode) return;
    let alive = true;
    const code = pvpCode;
    const onRoom = async (room) => {
      if (!alive) return;
      setPvpRoom(room);
      const now = Date.now();
      try {
        if (room.status === 'waiting') {
          if (shouldLaunch(room, now)) {
            // Idempotent: the first writer wins; the rest read its startsAt.
            const res = await launchRoom(supabase, room, now);
            if (res.won && res.room && alive) { startPvpRace(res.room); return; }
          } else if (shouldClaimHost(room, myUserIdRef.current)) {
            await claimHost(supabase, room, myUserIdRef.current);
          }
        } else if (room.status === 'playing') {
          startPvpRace(room);
        }
      } catch { /* transient — the next poll retries */ }
    };
    const unsub = subscribeToRoom(supabase, code, onRoom, 2000);
    pvpUnsubRef.current = unsub;
    // Rider list: poll the beacon board for callsigns where known.
    const pollBeacons = async () => {
      try {
        const { data } = await supabase
          .from('shadow_realm_beacons')
          .select('user_id,callsign')
          .eq('room_code', code);
        if (!alive) return;
        const map = {};
        for (const b of data || []) {
          if (b && b.user_id) map[b.user_id] = b.callsign || 'Rider';
        }
        setPvpCallsigns(map);
      } catch { /* callsigns degrade to seats */ }
    };
    void pollBeacons();
    const bTimer = setInterval(pollBeacons, 4000);
    const tick = setInterval(() => { if (alive) setNowTick(Date.now()); }, 1000);
    return () => {
      alive = false;
      try { unsub(); } catch { /* noop */ }
      pvpUnsubRef.current = null;
      clearInterval(bTimer);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, pvpCode]);

  // Beacon up: own transform ~3Hz in PvP races, 1Hz while roaming.
  useEffect(() => {
    if (stage !== 'ride' || !netActiveRef.current) return;
    const cadence = netActiveRef.current === 'pvp' ? RACE_BEACON_MS : ROAM_BEACON_MS;
    void sendBeaconNow(false, null);
    const id = setInterval(() => { void sendBeaconNow(false, null); }, cadence);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, laps, netTick]);

  // Beacon board: poll ~1s, hide stale, cap for iPhone perf. Roam renders
  // the nearest 12; PvP renders the capped field.
  useEffect(() => {
    if (stage !== 'ride' || !netActiveRef.current) return;
    let alive = true;
    const poll = async () => {
      try {
        const { data } = await supabase
          .from('shadow_realm_beacons')
          .select('*')
          .eq('room_code', netRoomRef.current);
        if (!alive) return;
        const now = Date.now();
        const mine = myUserIdRef.current;
        const live = (data || []).filter(
          (b) => b && b.user_id !== mine && !isBeaconStale(b, now) && b.lives !== 0
        );
        const h = hudRef.current || {};
        const capped = netActiveRef.current === 'roam'
          ? nearestN(live, { x: h.x || 0, z: h.z || 0 }, REMOTE_CAP)
          : live.slice(0, REMOTE_CAP);
        remotesRef.current = capped;
        setRemotes(capped);
        // BUMP RACE (PvP): last bike standing ends the race. Count self +
        // live remote beacons + local AI rivals. Only ends once the race
        // genuinely started (>= 2 alive seen) — early polls have no data.
        if (isBumpTrack(track) && netActiveRef.current === 'pvp' && stage === 'ride') {
          const myLives = h.lives == null ? BUMP_LIVES : h.lives;
          const botsAlive = (botsRef.current || []).filter((b) => b && !b.eliminated).length;
          const aliveCount = (myLives > 0 ? 1 : 0) + live.length + botsAlive;
          if (aliveCount > bumpSeenRef.current) bumpSeenRef.current = aliveCount;
          if (bumpSeenRef.current >= 2 && aliveCount <= 1 && myLives > 0) {
            handleFinish({ total: h.time || 0, laps: Math.min(h.lap || 1, laps), bumpWin: true });
          }
        }
      } catch { /* board degrades, the ride continues */ }
    };
    void poll();
    const id = setInterval(poll, 1000);
    return () => { alive = false; clearInterval(id); };
  }, [stage, netTick]);

  // ?code=CODE deep link: straight into the lobby (join by code).
  useEffect(() => {
    if (deepLinkedRef.current) return;
    deepLinkedRef.current = true;
    const dc = sp.get('code');
    if (dc && isValidRoomCode(dc)) {
      setMode('race');
      setStage('pvp-setup');
      void joinPvp(dc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mount = () => {
    try { fx.bikeMount(); } catch { /* best-effort */ }
    persist({});
    // Merlin 2026-10-03: the MOUNT & RIDE tap is a user gesture, so iOS
    // grants motion permission from it — tilt drives the bike from the very
    // first ride (steer/gas/brake/regen), no separate ◐ tap needed. Denial
    // degrades honestly: toast + auto-throttle + touch steer pads.
    try { motion.enableMotionFromGesture(); } catch { /* motion is best-effort */ }
    // Fresh run, fresh net session — no stale presence survives RIDE AGAIN.
    void stopNet();
    pvpSyncRef.current = null;
    // Fresh run, fresh battle — the last-standing detector restarts.
    bumpSeenRef.current = 0;
    if (mode === 'roam') {
      botsRef.current = [];
      setPaused(false);
      setResult(null);
      setLastLap(null);
      setStage('countdown');
      // Open-world presence joins async; the roam never waits on it.
      void joinGridPresence();
      return;
    }
    botsRef.current = makeBots({
      count: aiCount,
      track,
      seed: Date.now(),
      // BUMP RACE: rivals come to shove — tuned aggression, still beatable.
      aggression: mode === 'bump' ? BOT_AGGRESSION : 0,
    });
    setPaused(false);
    setResult(null);
    setLastLap(null);
    setStage('countdown');
  };

  const leave = () => {
    try { fx.bikeDismount(); } catch { /* best-effort */ }
    void stopNet();
    router.push('/');
  };

  // Leaving the page entirely — never leak a beacon or a seat.
  useEffect(() => () => { void stopNet(); }, []);

  const handleLap = (lapNum, lapTime) => {
    try { fx.checkpoint(); } catch { /* best-effort */ }
    setLastLap({ lapNum, lapTime });
  };

  const handleFinish = (res) => {
    try { fx.victory(); } catch { /* best-effort */ }
    // Finish rollout (Merlin 2026-10-03): the Rig coasts the bike to a stop
    // (s.finished, no input) — hold the ride stage ~2s so the coast is
    // visible behind the results, then show the finish screen.
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    const showFinish = () => {
      finishTimerRef.current = setTimeout(() => setStage('finished'), 2000);
    };
    // BUMP RACE: last bike standing, or laps done with riders alive — rank
    // by alive → laps → lives → time. Bots' battle state is right on the
    // bot objects; PvP humans fold in from the beacon board.
    if (isBumpTrack(track)) {
      if (netActiveRef.current === 'pvp') {
        const finishMs = Math.max(1, Date.now() - (pvpStartsAtRef.current || Date.now()));
        void sendBeaconNow(true, finishMs);
      }
      const h = hudRef.current || {};
      const myLives = h.lives == null ? BUMP_LIVES : h.lives;
      const myLaps = res?.laps || 0;
      const entries = (botsRef.current || []).map((b) => ({
        name: b.name,
        color: b.color,
        isPlayer: false,
        laps: Math.floor(b.progress || 0),
        lives: b.lives ?? BUMP_LIVES,
        progress: b.progress || 0,
        finishTime: b.finishTime != null ? b.finishTime : null,
      }));
      entries.push({
        name: callsign,
        color: scheme.primary,
        isPlayer: true,
        laps: myLaps,
        lives: myLives,
        progress: myLaps + (h.progress || 0),
        finishTime: res?.total != null ? res.total : null,
      });
      if (netActiveRef.current === 'pvp') {
        for (const b of remotesRef.current || []) {
          if (!b || b.user_id === myUserIdRef.current) continue;
          entries.push({
            name: b.callsign || 'Rider',
            color: '#94a3b8',
            isPlayer: false,
            laps: Math.floor((b.progress || 0) * laps),
            lives: b.lives ?? BUMP_LIVES,
            progress: (b.progress || 0) * laps,
            finishTime: b.finish_ms != null ? b.finish_ms / 1000 : null,
          });
        }
      }
      setResult({ ...res, standings: sortBumpStandings(entries), mode: 'bump', bumpWin: !!res?.bumpWin });
      showFinish();
      return;
    }
    // PvP: stamp the finish on the beacon (synced finish_ms off the room's
    // startsAt) and build results from the live human board + the AI roster.
    if (netActiveRef.current === 'pvp') {
      const finishMs = Math.max(1, Date.now() - (pvpStartsAtRef.current || Date.now()));
      void sendBeaconNow(true, finishMs);
      setResult({ ...res, standings: pvpStandings(finishMs) });
      showFinish();
      return;
    }
    const standings = placements(
      { name: 'YOU', color: scheme.primary, finishTime: res?.total, progress: laps },
      botsRef.current
    );
    setResult({ ...res, standings });
    showFinish();
  };

  // Manual-steer tracking: tilt steering never fights an active pad or key.
  // The always-on pads are gone — tilt is the steering — but a fallback
  // pad pair renders while tilt is not driving (see steer-pads.js), feeding
  // this same plumbing so touch always wins and the pads vanish the moment
  // tilt starts driving.

  // ---------------- menus ----------------
  if (stage === 'mode' || stage === 'track' || stage === 'garage' || stage === 'pvp-setup' || stage === 'pvp-lobby') {
    return (
      <div style={css.screen} onContextMenu={(e) => e.preventDefault()}>
        <div style={css.center}>
          <div style={css.title}>SHADOW REALM</div>
          <div style={css.sub}>NIGHT-CYCLE GRID · TRON LIGHT BIKES</div>
          {stage === 'mode' && (
            <button style={css.helpBtn} onClick={openTutorial} aria-label="How to ride">
              ?
            </button>
          )}
          {stage === 'mode' && showTutorial && (
            <div style={css.tutOverlay} onClick={skipTutorial}>
              <div style={css.tutCard} onClick={(e) => e.stopPropagation()}>
                <div style={css.tutEmoji}>{TUTORIAL_CARDS[tutStep].emoji}</div>
                <div style={css.tutTitle}>{TUTORIAL_CARDS[tutStep].title}</div>
                <div style={css.tutBody}>{TUTORIAL_CARDS[tutStep].body}</div>
                <div style={css.tutDots}>
                  {TUTORIAL_CARDS.map((_, i) => (
                    <div key={i} style={{ ...css.tutDot, ...(i === tutStep ? css.tutDotOn : {}) }} />
                  ))}
                </div>
                <div style={css.row}>
                  <button style={{ ...css.ghostBtn, flex: 1 }} onClick={skipTutorial}>
                    SKIP
                  </button>
                  <button style={{ ...css.bigBtn, flex: 2 }} onClick={nextTutorial}>
                    {tutStep >= TUTORIAL_CARDS.length - 1 ? 'RIDE' : 'NEXT'}
                  </button>
                </div>
              </div>
            </div>
          )}

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
                onClick={() => {
                  setMode('roam');
                  // Never roam on the bump arena (impossible state: no track
                  // mesh, no flame, mixed HUD). The normalization effect below
                  // is the backstop; this avoids even a one-frame flash.
                  if (isBumpTrack(track)) {
                    const safe = TRACKS.find((t) => !isBumpTrack(t));
                    if (safe) { setTrackKey(safe.key); persist({ trackKey: safe.key }); }
                  }
                  try { fx.menuOpen(); } catch {}
                  setStage('garage');
                }}
              >
                FREE ROAM
              </button>
              <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center' }}>
                No laps, no clock. Cruise the grid under the moon.
              </div>
              <button
                style={css.ghostBtn}
                onClick={() => { setMode('race'); setPvpMsg(''); try { fx.menuOpen(); } catch {} setStage('pvp-setup'); }}
              >
                PVP RACE
              </button>
              <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center' }}>
                Race real riders — 2 to 20 bikes. Empty seats fill with AI rivals.
              </div>
              <button
                style={css.ghostBtn}
                onClick={() => { setMode('bump'); setTrackKey('eternal-flame'); persist({ mode: 'bump', trackKey: 'eternal-flame' }); try { fx.menuOpen(); } catch {} setStage('garage'); }}
              >
                🔥 BUMP RACE
              </button>
              <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center' }}>
                Bumper bikes around the eternal flame — 3 lives. Don't get dumped in.
              </div>
              {mode === 'race' && (
                <div>
                  <div style={css.sectionLabel}>LAPS</div>
                  <div style={{ ...css.row, marginTop: 8 }}>
                    {[3, 5, 8].map((n) => (
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
              <TrackCards
                trackKey={trackKey}
                onPick={(k) => { setTrackKey(k); persist({ trackKey: k }); try { fx.tap(); } catch {} }}
              />
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
              {(mode === 'race' || mode === 'bump') && (
                <>
                  <div style={css.sectionLabel}>AI RIVALS{mode === 'bump' ? ' · MEAN ONES' : ''}</div>
                  <div style={{ ...css.row, marginTop: 8 }}>
                    {[0, 1, 3, 7].map((n) => (
                      <button
                        key={n}
                        style={{ ...css.chip, ...(aiCount === n ? { background: '#0d2a4d', borderColor: '#38bdf8' } : {}) }}
                        onClick={() => { setAiCount(n); persist({ aiCount: n }); try { fx.tap(); } catch {} }}
                      >
                        {n === 0 ? 'SOLO' : n}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div style={css.row}>
                <button style={{ ...css.ghostBtn, flex: 1 }} onClick={() => setStage(mode === 'roam' || mode === 'bump' ? 'mode' : 'track')}>BACK</button>
                <button style={{ ...css.bigBtn, flex: 2 }} onClick={mount}>
                  {mode === 'race' ? 'MOUNT & RACE' : mode === 'bump' ? '🔥 MOUNT & BUMP' : 'MOUNT & RIDE'}
                </button>
              </div>
            </>
          )}

          {stage === 'pvp-setup' && (
            <>
              <div style={css.sectionLabel}>PVP RACE · FIELD SIZE</div>
              <div style={{ ...css.row, marginTop: 4 }}>
                {PVP_SIZES.map((n) => (
                  <button
                    key={n}
                    style={{ ...css.chip, ...(pvpMax === n ? { background: '#0d2a4d', borderColor: '#38bdf8' } : {}) }}
                    onClick={() => { setPvpMax(n); try { fx.tap(); } catch {} }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div style={css.sectionLabel}>TRACK</div>
              <TrackCards
                trackKey={trackKey}
                onPick={(k) => { setTrackKey(k); persist({ trackKey: k }); try { fx.tap(); } catch {} }}
              />
              <div style={css.sectionLabel}>LAPS</div>
              <div style={{ ...css.row, marginTop: 4 }}>
                {[3, 5, 8].map((n) => (
                  <button
                    key={n}
                    style={{ ...css.chip, ...(laps === n ? { background: '#0d2a4d', borderColor: '#38bdf8' } : {}) }}
                    onClick={() => { setLaps(n); persist({ laps: n }); try { fx.tap(); } catch {} }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button style={css.bigBtn} onClick={createPvp}>CREATE ROOM</button>
              <div style={css.sectionLabel}>JOIN WITH CODE</div>
              <div style={css.row}>
                <input
                  value={pvpJoinCode}
                  onChange={(e) => setPvpJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  placeholder="6-CHAR CODE"
                  maxLength={6}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  style={{
                    flex: 2, padding: '14px 12px', fontSize: 18, fontWeight: 700, letterSpacing: 4,
                    textAlign: 'center', color: '#e0f2fe', background: '#0a1226',
                    border: '1px solid #1e3a5f', borderRadius: 12, outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <button style={{ ...css.ghostBtn, flex: 1 }} onClick={() => joinPvp()}>JOIN</button>
              </div>
              {pvpMsg ? (
                <div style={{ fontSize: 13, color: '#fbbf24', textAlign: 'center', letterSpacing: 1 }}>{pvpMsg}</div>
              ) : null}
              <button style={css.ghostBtn} onClick={() => setStage('mode')}>BACK</button>
            </>
          )}

          {stage === 'pvp-lobby' && pvpRoom && (
            <>
              <div style={css.sectionLabel}>ROOM CODE · SHARE IT</div>
              <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: 10, color: '#7dd3fc', textAlign: 'center', textShadow: '0 0 24px rgba(56,189,248,.5)' }}>
                {pvpRoom.room_code}
              </div>
              <div style={{ textAlign: 'center', fontSize: 15, color: '#94a3b8', letterSpacing: 2 }}>
                {(() => {
                  const left = queueRemainingMs(pvpRoom, nowTick);
                  if (left == null) return 'WAITING FOR RIDERS';
                  const m = Math.floor(left / 60000);
                  const s = Math.floor((left % 60000) / 1000);
                  return `LAUNCH IN ${m}:${String(s).padStart(2, '0')}`;
                })()}
              </div>
              <div style={{ textAlign: 'center', fontSize: 13, color: '#38bdf8', letterSpacing: 2 }}>
                {(() => {
                  const n = humansInRoom(pvpRoom);
                  const max = pvpRoom.max_players || pvpMax;
                  return `RIDERS ${n}/${max} · ${Math.max(0, max - n)} SLOTS LEFT`;
                })()}
              </div>
              <div style={css.sectionLabel}>ON THE GRID</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(pvpRoom.player_ids || []).map((id, i) => {
                  const c = ghostColorFor(id);
                  return (
                    <div key={id} style={{ ...css.card, cursor: 'default', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: c, boxShadow: `0 0 8px ${c}` }} />
                      <div style={{ ...css.cardName, flex: 1 }}>
                        {pvpCallsigns[id] || `RIDER ${i + 1}`}
                        {id === myUserIdRef.current ? ' ★' : ''}
                      </div>
                      {id === pvpRoom.host_id ? (
                        <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 2 }}>HOST</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <button style={css.ghostBtn} onClick={shareRoom}>
                {shared ? 'LINK COPIED ✓' : 'SHARE INVITE LINK'}
              </button>
              <div style={{ fontSize: 12, color: '#475569', textAlign: 'center' }}>
                Launches when the timer ends or the room fills. Empty seats fill with AI rivals.
              </div>
              <button style={css.ghostBtn} onClick={leaveLobby}>LEAVE</button>
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
        onPointerDown={(e) => { tapDown(tapStateRef.current, e.clientX, e.clientY); }}
        onPointerUp={(e) => {
          const r = tapUp(
            tapStateRef.current,
            e.clientX,
            e.clientY,
            typeof performance !== 'undefined' ? performance.now() : Date.now()
          );
          if (r.fire) {
            // Deliberate double-tap on the same spot — recenter.
            if (motion.motionOn) motion.recenter('double-tap');
          } else {
            // Diagnosability: rejected patterns are whisper-quiet, but they
            // explain "it keeps recentering" without guessing.
            try { console.debug('[shadow-realm] recenter tap rejected:', r.reason); } catch { /* noop */ }
          }
        }}
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
          onBumpEvent={handleBumpEvent}
          botsRef={botsRef}
          remoteBeacons={remotes}
          netUserId={myUserIdRef.current}
          netNowRef={netNowRef}
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
          <style>{`@keyframes trailWarnPulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }`}</style>
          {!immersed && (
            <div style={css.hud}>
              {mode === 'roam' && (
                <div style={css.hudChip}>GRID · FREE ROAM</div>
              )}
              {mode === 'race' && (
                <div style={css.hudChip}>LAP {hud.lap}/{hud.lapsTotal}</div>
              )}
              {isBumpTrack(track) && (
                <div style={{ ...css.hudChip, borderColor: '#f97316', color: '#fdba74' }}>🔥 BUMP RACE</div>
              )}
              {isBumpTrack(track) && (
                <div style={{ ...css.hudChip, borderColor: '#f97316' }} aria-label="lives remaining">
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ opacity: (hud.lives ?? BUMP_LIVES) > i ? 1 : 0.25 }}>🔥</span>
                  ))}
                </div>
              )}
              {/* LETHAL TRAILS: immunity countdown pill */}
              {hud.immune && stage === 'ride' && (
                <div style={{ ...css.hudChip, borderColor: '#7df9ff', color: '#7df9ff' }} aria-label="trail immunity">
                  🛡️ IMMUNE {hud.immuneT}s
                </div>
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
              {/* Manual BOOST: unmistakable while the button is held. */}
              {hud.boosting && (
                <div
                  style={{
                    ...css.hudChip,
                    color: '#0a0a0a',
                    background: '#fbbf24',
                    borderColor: '#fbbf24',
                    fontWeight: 800,
                  }}
                  aria-label="boosting"
                >
                  ⚡ BOOSTING
                </div>
              )}
            </div>
          )}
          {lastLap && mode === 'race' && !immersed && (
            <div style={{ position: 'absolute', top: 'calc(66px + env(safe-area-inset-top, 0px))', width: '100%', textAlign: 'center', zIndex: 5, pointerEvents: 'none', color: '#7dd3fc', fontSize: 13, letterSpacing: 2 }}>
              LAP {lastLap.lapNum} · {fmtTime(lastLap.lapTime)}
            </div>
          )}
          {/* BUMP RACE: heat flash on flame hits (screen-edge fire feedback) */}
          {heatFlash && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 8, pointerEvents: 'none',
              background: 'radial-gradient(ellipse at center, rgba(255,90,0,0) 40%, rgba(255,90,0,0.55) 100%)',
            }} />
          )}
          {/* TRAIL-AHEAD fairness warning: a rival trail sits in the forward
              path cone. Screen-edge glow on the threat's side (+ a flash pill
              when chrome is visible) BEFORE it becomes a shred. */}
          {hud.trailWarn && stage === 'ride' && (
            <div
              style={{
                position: 'absolute', inset: 0, zIndex: 8, pointerEvents: 'none',
                background: hud.trailWarn.side >= 0
                  ? 'linear-gradient(to left, rgba(255,47,179,0.42) 0%, rgba(255,47,179,0) 26%)'
                  : 'linear-gradient(to right, rgba(255,47,179,0.42) 0%, rgba(255,47,179,0) 26%)',
                animation: 'trailWarnPulse 0.7s ease-in-out infinite',
              }}
              aria-label="trail ahead warning"
            />
          )}
          {!immersed && hud.trailWarn && stage === 'ride' && (
            <div style={{
              position: 'absolute', top: 'calc(64px + env(safe-area-inset-top, 0px))', width: '100%',
              textAlign: 'center', zIndex: 8, pointerEvents: 'none',
            }}>
              <div style={{
                display: 'inline-block', padding: '8px 18px', borderRadius: 999,
                background: 'rgba(3,6,18,.82)', border: '1px solid #ff2fb3',
                color: '#ff8fd4', fontSize: 14, fontWeight: 800, letterSpacing: 3,
                animation: 'trailWarnPulse 0.7s ease-in-out infinite',
              }}>
                ⚠ TRAIL AHEAD
              </div>
            </div>
          )}
          {/* LETHAL TRAILS: death toast naming the trail owner */}
          {deathToast && stage === 'ride' && (
            <div style={{
              position: 'absolute', top: '38%', width: '100%', textAlign: 'center',
              zIndex: 9, pointerEvents: 'none',
            }}>
              <div style={{
                display: 'inline-block', padding: '12px 22px', borderRadius: 12,
                background: 'rgba(3,6,18,.78)', border: '1px solid #ff2fb3',
                color: '#ff2fb3', fontSize: 17, fontWeight: 800, letterSpacing: 2,
              }}>
                {deathToast}
              </div>
            </div>
          )}
          {/* BUMP RACE: eliminated — bike burned out, rider spectates */}
          {isBumpTrack(track) && hud.eliminated && stage === 'ride' && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ textAlign: 'center', padding: 24, borderRadius: 16, background: 'rgba(3,6,18,.72)', border: '1px solid #f97316', pointerEvents: 'auto' }}>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, color: '#fdba74' }}>🔥 ELIMINATED</div>
                <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6, letterSpacing: 1 }}>THE FLAME TOOK ALL 3 LIVES · SPECTATING</div>
                <button
                  style={{ ...css.ghostBtn, marginTop: 14 }}
                  onClick={() => handleFinish({ total: hud.time || 0, laps: Math.min(hud.lap || 1, laps), bumpWin: false })}
                >
                  LEAVE ARENA
                </button>
              </div>
            </div>
          )}
          {/* touch controls: BOOST + fallback steer pads (pads render only
              while tilt is NOT driving — tilt riders never see them).
              Ride camera is a locked chase cam (Merlin 2026-10-03): no
              drag-orbit, no gyro-pan while riding. */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none' }}>
            {shouldShowTouchSteer(stage, motion.motionOn) && (
              <div
                style={{
                  position: 'absolute', left: 18, bottom: 'calc(128px + env(safe-area-inset-bottom, 0px))', display: 'flex', gap: 12,
                  pointerEvents: 'auto', touchAction: 'none',
                }}
              >
                <div
                  role="button"
                  aria-label="Steer left (fallback — tilt steering is off)"
                  onPointerDown={(e) => { noteControlUse(); pressSteerPad(STEER_LEFT)(e); }}
                  onPointerUp={releaseSteerPad(STEER_LEFT)}
                  onPointerCancel={releaseSteerPad(STEER_LEFT)}
                >
                  <div style={{ width: 76, height: 76, borderRadius: '50%', border: `2px solid ${scheme.primary}`, background: 'rgba(10,20,40,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700, color: scheme.primary }}>‹</div>
                </div>
                <div
                  role="button"
                  aria-label="Steer right (fallback — tilt steering is off)"
                  onPointerDown={(e) => { noteControlUse(); pressSteerPad(STEER_RIGHT)(e); }}
                  onPointerUp={releaseSteerPad(STEER_RIGHT)}
                  onPointerCancel={releaseSteerPad(STEER_RIGHT)}
                >
                  <div style={{ width: 76, height: 76, borderRadius: '50%', border: `2px solid ${scheme.primary}`, background: 'rgba(10,20,40,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700, color: scheme.primary }}>›</div>
                </div>
              </div>
            )}
            <div
              style={{ position: 'absolute', right: 18, bottom: 'calc(128px + env(safe-area-inset-bottom, 0px))', pointerEvents: 'auto', touchAction: 'none' }}
              onPointerDown={(e) => {
                // Set the boost flag FIRST — setPointerCapture can throw on
                // some iOS WebKit paths, and it must never swallow the input.
                inputRef.current.boost = true;
                setBoostHeld(true);
                noteControlUse();
                try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* best-effort */ }
                try { fx.boost(); } catch { /* best-effort */ }
              }}
              onPointerUp={() => { inputRef.current.boost = false; setBoostHeld(false); }}
              onPointerCancel={() => { inputRef.current.boost = false; setBoostHeld(false); }}
              onLostPointerCapture={() => { inputRef.current.boost = false; setBoostHeld(false); }}
            >
              {/* Boost charge ring (Merlin 2026-10-03): the meter was
                  unreadable, so the charge now wraps the button as an amber
                  ring — glanceable at speed. Fills with regen/bump charge,
                  drains on boost, glows while surging. */}
              {(() => {
                const m = boostMeter(hud.boostCharge);
                return (
                  <div style={{ position: 'relative', width: 88, height: 88 }} role="meter"
                    aria-label={`Boost charge ${m.pct} percent`} aria-valuenow={m.pct} aria-valuemin={0} aria-valuemax={100}>
                    <svg width="88" height="88" viewBox="0 0 88 88"
                      style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)', pointerEvents: 'none' }}>
                      <circle cx="44" cy="44" r="40" fill="none" stroke="rgba(251,191,36,0.16)" strokeWidth="5" />
                      <circle cx="44" cy="44" r="40" fill="none"
                        stroke={hud.surging ? '#fde68a' : '#fbbf24'} strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={m.circumference} strokeDashoffset={m.dashoffset}
                        style={{
                          transition: 'stroke-dashoffset 140ms linear',
                          filter: hud.surging ? 'drop-shadow(0 0 6px #fbbf24)' : 'none',
                        }} />
                    </svg>
                    <div style={{ position: 'absolute', left: 6, top: 6, width: 76, height: 76, borderRadius: '50%', border: `2px solid ${scheme.primary}`, background: boostHeld ? scheme.primary : 'rgba(10,20,40,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: boostHeld ? '#0a0a0a' : scheme.primary, letterSpacing: 1, transform: boostHeld ? 'scale(1.12)' : 'scale(1)', transition: 'transform 80ms, background 80ms' }}>BOOST</div>
                  </div>
                );
              })()}
            </div>
            {/* ride controls: motion + immersion circles; pause/leave adapt to immersion */}
            <div style={{ position: 'absolute', top: 'calc(12px + env(safe-area-inset-top, 0px))', right: 'calc(12px + env(safe-area-inset-right, 0px))', display: 'flex', gap: 8, pointerEvents: 'auto', zIndex: 7 }}>
              <button
                aria-label={motion.motionOn ? 'Turn off tilt steering and gyro look' : 'Turn on tilt steering and gyro look'}
                title="Tilt steering + gyro look"
                onClick={() => { noteControlUse(); motion.toggleMotion(); }}
                style={css.circleBtn(motion.motionArmed)}
              >
                ◐
              </button>
              <button
                aria-label={immersed ? 'Exit fullscreen ride' : 'Fullscreen ride'}
                title={immersed ? 'Exit fullscreen' : 'Fullscreen'}
                onClick={() => { noteControlUse(); fsx.toggleFullscreen(); }}
                style={css.circleBtn(immersed)}
              >
                ⛶
              </button>
              {motion.motionOn && (
                <button
                  aria-label="Recenter view and steering neutral"
                  title="Recenter (or double-tap the track)"
                  onClick={() => { noteControlUse(); motion.recenter('button'); }}
                  style={css.circleBtn(false)}
                >
                  ⟳
                </button>
              )}
              <button
                aria-label={paused ? 'Resume ride' : 'Pause ride'}
                title={paused ? 'Ride' : 'Hold'}
                onClick={() => { noteControlUse(); setPaused((p) => !p); }}
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
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 4, color: scheme.primary }}>
              {result?.mode === 'bump' ? (result?.bumpWin ? '🔥 BUMP CHAMPION' : 'BUMP RACE') : 'FINISH'}
            </div>
            <div style={{ fontSize: 15, color: '#94a3b8' }}>
              {track.name} · {result?.mode === 'bump' ? 'last bike standing' : `${result?.laps} laps`}
            </div>
            <div style={{ fontSize: 44, fontWeight: 800, color: '#e0f2fe' }}>{fmtTime(result?.total)}</div>
            {result?.standings && result.standings.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
                {result.standings.map((s) => (
                  <div
                    key={s.rank}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      borderRadius: 10, background: s.isPlayer ? '#0d1a33' : '#0a1226',
                      border: s.isPlayer ? '1px solid #38bdf8' : '1px solid #16294a',
                    }}
                  >
                    <div style={{ width: 30, fontWeight: 800, color: '#64748b' }}>{s.rank}</div>
                    <div style={{ flex: 1, textAlign: 'left', fontWeight: 700, color: s.color }}>{s.name}</div>
                    <div style={{ fontSize: 13, color: '#94a3b8' }}>
                      {result?.mode === 'bump' ? (
                        <span aria-label={`${s.lives ?? 3} lives`}>
                          {[0, 1, 2].map((i) => (
                            <span key={i} style={{ opacity: (s.lives ?? 3) > i ? 1 : 0.25 }}>🔥</span>
                          ))}
                        </span>
                      ) : s.finishTime != null ? fmtTime(s.finishTime) : `${Math.round((s.progress / laps) * 100)}%`}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {netActiveRef.current === 'pvp' ? (
              <>
                <button style={css.bigBtn} onClick={backToPvpSetup}>BACK TO LOBBY</button>
                <button style={css.ghostBtn} onClick={leave}>LEAVE REALM</button>
              </>
            ) : (
              <>
                <button style={css.bigBtn} onClick={mount}>RIDE AGAIN</button>
                <button style={css.ghostBtn} onClick={() => setStage(result?.mode === 'bump' ? 'mode' : 'track')}>
                  {result?.mode === 'bump' ? 'CHANGE MODE' : 'CHANGE TRACK'}
                </button>
                <button style={css.ghostBtn} onClick={leave}>LEAVE REALM</button>
              </>
            )}
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
