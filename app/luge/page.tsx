// @ts-nocheck
/* eslint-disable */
'use client';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { BackButton } from '@/components/ui';
import Link from 'next/link';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useSceneContextGuard } from '@/components/SceneContextGuard';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { supabase } from '@/lib/supabase';
import { LUGE_COURSES, LUGE_SLEDS, LUGE_PREMIUM_IDS, LUGE_PREMIUM_COUNT } from '@/lib/luge_data';
import {
  generateZones,
  zoneAt,
  steerAngle,
  zoneSpeedDelta,
  TUBE_RADIUS,
  RIDE_RADIUS,
} from '@/lib/luge/track';
import { createFinishGuard } from '@/lib/luge/finish-guard';
import GoldCheckoutOption from '@/components/economy/GoldCheckoutOption';
import { fx, unlockFx } from '@/lib/fx';
import { resolveSurfaceCharacter } from '@/lib/characters/embodiment';
import {
  createEmbodimentScene,
  prefetchCharacterGlbs,
} from '@/lib/characters/character-glb';
import {
  LUGE_RIDER_MOUNT,
  LUGE_RIDER_POSE,
  LUGE_RIDER_PROC_SIZE,
} from '@/lib/luge/rider-embodiment';
import {
  createRoom,
  joinRoom,
  getRoom,
  subscribeToRoom,
  normalizeCode,
  isValidRoomCode,
  ROOM_STATUS,
} from '@/lib/oasis/rooms';

// --- DIONYSUS interior treatment: SVG glyph system + ambient menu backdrop ---
const LUGE_BG = '/images/luge/bg.webp';
const LUGE_VIDEO = '/images/luge/bg-loop.mp4';
const LUGE_STILL = '/images/luge/bg-still.jpg';
const LUGE_ICE_TILE = '/images/shared/ice-crystal-tile.webp';

const LUGE_GLYPHS = {
  flag: 'M6 3h2v18H6zM10 4h11l-3 4 3 4H10z',
  users: 'M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-8 0a4 4 0 1 0-.6-7.95A5.5 5.5 0 0 1 8 11zm8 2c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4zM2 16v-2c0-1.9 3.1-3 5-3.4A6.6 6.6 0 0 0 6 13c0 1.5.6 2.9 1.6 4H4v-1z',
  bag: 'M8 8V6a4 4 0 0 1 8 0v2h3l-1 13H6L5 8zm2 0h4V6a2 2 0 0 0-4 0z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  arrowRight: 'M5 11h11V7l5 5-5 5v-4H5z',
  copy: 'M8 3h11v14h-2V5H8zm-4 4h11v14H4zm2 2v10h7V9z',
  share: 'M18 8a3 3 0 1 0-2.8-4H15a3 3 0 0 0 .1.8L8.9 8.1a3 3 0 0 0 0 3.8l6.2 3.3a3 3 0 1 0 .9-1.6L9.8 10.3a3.4 3.4 0 0 0 0-1.4l6.2-3.3c.5.6 1.2 1 2 1z',
  replay: 'M12 5V1L7 6l5 5V7c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z',
  zap: 'M13 2 4 14h6l-1 8 9-12h-6z',
  x: 'M6 6l12 12M18 6 6 18',
  home: 'M12 3l9 8h-3v9h-4v-6H10v6H6v-9H3z',
  play: 'M8 5v14l11-7z',
};
function LIcon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
      <path d={LUGE_GLYPHS[name]} />
    </svg>
  );
}

// Ambient backdrop for luge menus (video ONLY on menus — never over gameplay).
// Cycles Video → Still → Off, persisted in localStorage ('luge-bg').
function LugeBackdrop({ video, toggle, mode }) {
  return (
    <>
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
        {video && mode === 'video' && (
          <video
            src={LUGE_VIDEO}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            poster={LUGE_STILL}
            className="absolute inset-0 w-full h-full object-cover opacity-55"
            aria-hidden="true"
          />
        )}
        {(!video || mode === 'still') && mode !== 'off' && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-55"
            style={{ backgroundImage: `url(${video ? LUGE_STILL : LUGE_BG})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/85" />
      </div>
      {toggle && (
        <button
          onClick={toggle}
          aria-label={`Ambience: ${mode}. Activate to change.`}
          title={`Ambience: ${mode} (Video → Still → Off)`}
          className="absolute top-4 right-4 z-20 min-h-[44px] px-3 rounded-full bg-black/60 border border-white/20 text-[10px] font-bold tracking-widest uppercase text-zinc-300 hover:border-cyan-400/60"
        >
          {mode === 'video' ? 'Video' : mode === 'still' ? 'Still' : 'Off'}
        </button>
      )}
    </>
  );
}
const lugePanelTile = {
  backgroundImage: `url(${LUGE_ICE_TILE})`,
  backgroundSize: '128px 128px',
  backgroundBlendMode: 'overlay',
};
import {
  LUGE_PVP_SLUG,
  LUGE_MAX_RACERS,
  LUGE_MIN_RACERS,
  PVP_COUNTDOWN_MS,
  PVP_POLL_MS,
  BEACON_INTERVAL_MS,
  buildRaceState,
  raceStateFromRoom,
  canStartRace,
  decidePvpJoin,
  pvpRoomIsFull,
  beaconRow,
  sortStandings,
  raceIsOver,
  pvpResults,
  ghostColorFor,
  formatRaceTime,
} from '@/lib/luge/pvp';
import {
  buildJoinUrl,
  codeFromSearch,
  copyTextToClipboard,
  shareRoomInvite,
} from '@/lib/oasis/share';

// The tube's banked frame rolls around the world Z axis in turns.
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// A glowing band laid on the tube interior marking a speed-up zone (cyan)
// or a sand patch (sandy amber). Radius sits just inside the main tube so it
// reads as paint on the wall, not new geometry to collide with.
function ZoneBand({ curve, zone, kind }) {
  const subCurve = useMemo(() => {
    const pts = [];
    const N = 24;
    for (let i = 0; i <= N; i++) {
      pts.push(curve.getPointAt(THREE.MathUtils.lerp(zone.start, zone.end, i / N)));
    }
    return new THREE.CatmullRomCurve3(pts, false);
  }, [curve, zone]);
  return (
    <mesh>
      <tubeGeometry args={[subCurve, 24, TUBE_RADIUS - 0.35, 16, false]} />
      {kind === 'boost' ? (
        <meshBasicMaterial color="#00f2ff" transparent opacity={0.22} side={THREE.BackSide} toneMapped={false} />
      ) : (
        <meshBasicMaterial color="#d9b36a" transparent opacity={0.5} side={THREE.BackSide} />
      )}
    </mesh>
  );
}

// ==========================================
// 3D TRACK & PHYSICS ENGINE
// ==========================================

// Ghost markers for PvP rivals: small glowing orbs riding the tube at each
// rival's beaconed progress. Cosmetic only — positions come from ~1/sec
// beacons, never trusted for timing.
function RivalGhosts({ curve, rivals }) {
  const items = useMemo(
    () =>
      (rivals || []).map((r) => {
        const p = Math.min(0.999, Math.max(0, r.progress || 0));
        const pos = curve.getPointAt(p);
        return { ...r, pos };
      }),
    [curve, rivals]
  );
  return (
    <group>
      {items.map((r) => (
        <mesh key={r.userId} position={[r.pos.x, r.pos.y + 2.5, r.pos.z]}>
          <sphereGeometry args={[0.9, 12, 12]} />
          <meshBasicMaterial color={r.color} toneMapped={false} transparent opacity={0.85} />
        </mesh>
      ))}
    </group>
  );
}

// WAVE 6 — the rider: the user's picked character (profile
// default, or this surface's override) lying on the sled in the
// pose driver's 'seated' pose, tipped back into the luge recline
// by the mount contract in lib/luge/rider-embodiment.js (mount ->
// recline -> yaw -> the Wave 0 embodiment). Visual swap only: the
// sled's physics, tube, speeds and balance never see the rider,
// and with no character picked nothing mounts at all — the sled
// renders exactly as it always has. The mount stays invisible
// until the model is truly on stage (fallback law: no pop-in, no
// hole — the empty sled is this surface's native state).
function RiderFigure() {
  const pick = useMemo(() => resolveSurfaceCharacter('luge'), []);
  const yawRef = useRef(null);
  const handleRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!pick || !yawRef.current) return undefined;
    prefetchCharacterGlbs([pick.id]);
    const scene = createEmbodimentScene({ maxLiveGlb: 1 });
    const handle = scene.attach({
      characterId: pick.id,
      procSize: LUGE_RIDER_PROC_SIZE,
      slotKey: 'luge:self',
    });
    if (!handle) return undefined;
    let live = true;
    handleRef.current = handle;
    yawRef.current.add(handle.group);
    handle.ready.then((ok) => { if (live && ok) setReady(true); });
    return () => {
      live = false;
      handleRef.current = null;
      if (handle.group && handle.group.parent === yawRef.current) {
        yawRef.current.remove(handle.group);
      }
      handle.dispose();
    };
  }, [pick]);

  useFrame((state, delta) => {
    const h = handleRef.current;
    if (h) h.update(LUGE_RIDER_POSE, delta, state.clock.elapsedTime);
  });

  if (!pick) return null;
  return (
    <group position={LUGE_RIDER_MOUNT.position} visible={ready}>
      <group rotation={[LUGE_RIDER_MOUNT.recline, 0, 0]}>
        <group rotation={[0, LUGE_RIDER_MOUNT.yaw, 0]} ref={yawRef} />
      </group>
    </group>
  );
}

function LugeTrack({ course, sled, tiltData, onFinish, pvp, onZoneFx }) {
  const { camera } = useThree();
  const sledRef = useRef(null);

  const [trackTex, setTrackTex] = useState(null);
  const [hullTex, setHullTex] = useState(null);
  // Zone FX is lifted to LugeEngine (onZoneFx prop) so the HUD can read it.
  // Set only on change — never at frame rate.
  const setZoneFx = onZoneFx || (() => {});
  const progress = useRef(0);
  const speed = useRef(0);
  // Angular position around the tube interior: 0 = floor, PI/2 = right wall,
  // PI = ceiling. Steering rolls the full 360° — the whole tube is track.
  const tubeAngle = useRef(0);
  const activeZone = useRef(null);

  const baseMaxSpeed = 150 + (course.turns * 8);

  // Deterministic per-course speed-up / sand layout (same every run).
  const zones = useMemo(() => generateZones(course), [course]);

  // 1. Dynamic Texture Loader & UV Wrapper (course walls)
  useEffect(() => {
    let isMounted = true;
    const loader = new THREE.TextureLoader();

    loader.load(course.texture, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.MirroredRepeatWrapping;
      tex.wrapT = THREE.MirroredRepeatWrapping;
      tex.repeat.set(Math.floor(course.length / 40), 4);
      if (isMounted) setTrackTex(tex);
    }, undefined, () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = 512;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0a0a14'; ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#00f2ff'; ctx.lineWidth = 4; ctx.strokeRect(0, 0, 512, 512);
      const blank = new THREE.CanvasTexture(canvas);
      blank.wrapS = THREE.MirroredRepeatWrapping;
      blank.wrapT = THREE.MirroredRepeatWrapping;
      blank.repeat.set(Math.floor(course.length / 40), 4);
      if (isMounted) setTrackTex(blank);
    });

    return () => { isMounted = false; };
  }, [course]);

  // 1b. Sled hull texture (falls back to the sled's flat color when absent)
  useEffect(() => {
    let isMounted = true;
    let tex = null;
    if (sled.hull) {
      tex = new THREE.TextureLoader().load(
        sled.hull,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          if (isMounted) setHullTex(t);
        },
        undefined,
        () => { if (isMounted) setHullTex(null); }
      );
    } else {
      setHullTex(null);
    }
    return () => { isMounted = false; if (tex) tex.dispose(); };
  }, [sled.hull]);

  // 2. Mathematically Generate the 3D Spline Curve
  const curve = useMemo(() => {
    const points = [];
    const numSegments = Math.max(100, Math.floor(course.length / 20));
    for (let i = 0; i <= numSegments; i++) {
      const t = i / numSegments;
      const x = Math.sin(t * Math.PI * course.turns) * (30 + course.turns * 3);
      const y = -t * course.drop * 3;
      const z = -t * course.length;
      points.push(new THREE.Vector3(x, y, z));
    }
    return new THREE.CatmullRomCurve3(points, false);
  }, [course]);

  // 3. The 60FPS Game Loop with DeviceOrientation Physics
  useFrame((state, delta) => {
    // TILT PHYSICS: Acceleration (Beta)
    const tiltAccel = tiltData.current.y; // -1 (forward) to 1 (backward)
    if (tiltAccel < 0) {
      speed.current += Math.abs(tiltAccel) * delta * 150; // Lean forward to accelerate
    } else {
      speed.current -= tiltAccel * delta * 200; // Lean back to brake hard
    }

    // Auto-accelerate slightly if neutral
    if (speed.current < baseMaxSpeed && tiltAccel <= 0) speed.current += delta * 40;

    // SPEED-UP ZONES & SAND PATCHES: deterministic per course. Premium
    // hulls earn their price here — sand resist shrugs off drag, boost gain
    // pulls harder out of speed-up bands (lib/luge/track.js zoneSpeedDelta).
    // They feed the same clamp below, so top speed never changes and the
    // server anti-cheat floor (lib/luge/logic.js) stays valid — boosts just
    // reach top speed dramatically faster (a real launch out of sand and
    // braking zones).
    const zoneProg = Math.min(progress.current, 0.999);
    const zone = zoneAt(zones, zoneProg);
    if (zone !== activeZone.current) {
      activeZone.current = zone;
      setZoneFx(zone);
      if (zone === 'boost') fx.boost();
      else if (zone === 'sand') fx.sandDrag();
    }
    speed.current += zoneSpeedDelta(zone, sled, delta);

    speed.current = THREE.MathUtils.clamp(speed.current, 20, baseMaxSpeed * 1.5);

    progress.current += (speed.current * delta) / course.length;

    // PvP progress beacon hook (solo runs pass no pvp prop — untouched).
    if (pvp && pvp.onProgress) pvp.onProgress(progress.current);

    if (progress.current >= 0.999) {
      onFinish();
      return;
    }

    const safeProgress = Math.min(progress.current, 0.999);

    const pos = curve.getPointAt(safeProgress);
    const tangent = curve.getTangentAt(safeProgress);

    const roll = tangent.x * Math.PI * 1.2;
    const up = new THREE.Vector3(0, 1, 0).applyAxisAngle(Z_AXIS, roll);
    const right = new THREE.Vector3().crossVectors(tangent, up).normalize();

    // TILT PHYSICS: Steering (Gamma) rolls the sled around the tube's full
    // 360° interior. tilt.x is -1 (left) to 1 (right).
    tubeAngle.current = steerAngle(tubeAngle.current, tiltData.current.x, delta);
    const sinT = Math.sin(tubeAngle.current);
    const cosT = Math.cos(tubeAngle.current);
    // Outward radial from the tube axis to the sled: theta=0 rides the floor,
    // PI/2 the right wall, PI the ceiling. RIDE_RADIUS < TUBE_RADIUS, so the
    // side-wall barriers are solid from the inside by construction — the sled
    // can never pass through them.
    const radial = right.clone().multiplyScalar(sinT).addScaledVector(up, -cosT);
    // The rider's head points back at the tube axis (wall-of-death stance).
    const sledUp = radial.clone().negate();

    if (sledRef.current) {
      sledRef.current.position.copy(pos).addScaledVector(tangent, 15).addScaledVector(radial, RIDE_RADIUS);
      const sledMatrix = new THREE.Matrix4().lookAt(sledRef.current.position, sledRef.current.position.clone().add(tangent), sledUp);
      sledRef.current.quaternion.setFromRotationMatrix(sledMatrix);
    }

    // Chase camera on a gimbal: it follows the sled around the tube but its
    // up vector stays on the track's banked frame, so the horizon never
    // flips — even riding the ceiling, the bottom never flips the rider.
    const sledPos = sledRef.current ? sledRef.current.position : pos;
    const camPos = sledPos.clone().addScaledVector(sledUp, 3.4).addScaledVector(tangent, -7.5);
    camera.position.copy(camPos);
    camera.up.copy(up);
    camera.lookAt(sledPos.clone().addScaledVector(tangent, 16));

    camera.fov = THREE.MathUtils.lerp(camera.fov, 60 + (speed.current * 0.15), delta * 2);
    camera.updateProjectionMatrix();

    if (trackTex && trackTex.isTexture) {
      trackTex.offset.y -= delta * speed.current * 0.02;
    }
  });

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, Math.floor(course.length / 20), 10, 16, false]} />
        <meshBasicMaterial
          key={trackTex ? trackTex.uuid : 'loading'}
          map={trackTex}
          side={THREE.BackSide}
          color={course.bg === '#0a0a14' ? '#ffffff' : course.bg}
        />
      </mesh>

      {/* Speed-up zones (cyan) and sand patches (amber) painted on the walls */}
      {zones.boosts.map((z, i) => (
        <ZoneBand key={`boost-${i}`} curve={curve} zone={z} kind="boost" />
      ))}
      {zones.sands.map((z, i) => (
        <ZoneBand key={`sand-${i}`} curve={curve} zone={z} kind="sand" />
      ))}

      {/* PvP rival ghosts (absent in solo runs) */}
      {pvp && pvp.rivals && <RivalGhosts curve={curve} rivals={pvp.rivals} />}

      <group ref={sledRef}>
        <mesh castShadow>
          <boxGeometry args={[3, 1, 6]} />
          {hullTex ? (
            <meshStandardMaterial map={hullTex} roughness={0.35} metalness={0.75} />
          ) : (
            <meshStandardMaterial color={sled.color} roughness={0.3} metalness={0.9} />
          )}
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[3.2, 0.2, 6.2]} />
          <meshBasicMaterial color={sled.accent} toneMapped={false} />
        </mesh>
        {/* WAVE 6: the rider — your character, seated on the sled.
            Purely visual; nothing here touches the sled's physics. */}
        <RiderFigure />
        {/* Kept small and local: light must never drown out the hull textures. */}
        <pointLight color={sled.accent} intensity={2.0} distance={60} position={[0, 2, -5]} />
      </group>
    </group>
  );
}

// ==========================================
// MAIN APP COMPONENT
// ==========================================
const FINAL_COURSE_ID = 20;

export default function LugeEngine() {
  // Context-loss guard (fleet rollout 2026-10-15): freeze on loss, heal on
  // restore, recoverable FEED LOST fallback if the context stays gone.
  const sceneGuard = useSceneContextGuard({ label: 'LUGE' });
  const [mounted, setMounted] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [cloudOffline, setCloudOffline] = useState(false);

  // States: 'menu', 'store', 'pre_race_calibrate', 'racing', 'podium'
  const [gameState, setGameState] = useState('menu');

  // HUD label for the zone the sled is currently in ('boost' | 'sand' | null).
  // Lifted from LugeTrack so the HUD overlay in this component can read it.
  const [zoneFx, setZoneFx] = useState(null);

  // Ambient menu backdrop: Video → Still → Off (persisted). Reduced-motion users get Still.
  const [ambience, setAmbience] = useState('video');
  useEffect(() => {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setAmbience('still'); return; }
      const saved = window.localStorage.getItem('luge-bg');
      if (saved === 'still' || saved === 'off' || saved === 'video') setAmbience(saved);
    } catch { /* storage unavailable */ }
  }, []);
  const cycleAmbience = () => {
    setAmbience((a) => {
      const next = a === 'video' ? 'still' : a === 'still' ? 'off' : 'video';
      try { window.localStorage.setItem('luge-bg', next); } catch { /* noop */ }
      return next;
    });
  };

  const [selectedCourse, setSelectedCourse] = useState(LUGE_COURSES[0]);
  const [selectedSled, setSelectedSled] = useState(LUGE_SLEDS[0]);

  // Ownership state (from luge_inventory / luge_redemptions via RLS reads)
  const [ownedIds, setOwnedIds] = useState(new Set());
  const [redeemed, setRedeemed] = useState(false);
  const [inventoryLoaded, setInventoryLoaded] = useState(false);

  // Store display info (price comes from the server)
  const [storeInfo, setStoreInfo] = useState({ priceUsd: null, premiumCount: LUGE_PREMIUM_COUNT });
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [storeError, setStoreError] = useState('');
  const [useGold, setUseGold] = useState(false);

  // Reward-eligibility state (server-side truth from /api/luge/eligibility).
  const [eligibility, setEligibility] = useState(null);
  const [purchaseNote, setPurchaseNote] = useState('');

  // Plain-English recording failure, shown on the menu board when a finished
  // run could not be recorded server-side (it was silently swallowed before).
  const [recordError, setRecordError] = useState('');

  // ---------- PvP race state ----------
  // Solo flow ('menu' -> 'pre_race_calibrate' -> 'racing' -> 'podium') is
  // untouched: every PvP field below is null/inactive unless a race room
  // is entered. PvP screens: 'pvp_lobby', 'pvp_waiting', 'pvp_countdown',
  // 'pvp_spectate', 'pvp_results'.
  const [pvpCodeInput, setPvpCodeInput] = useState('');
  const [pvpMsg, setPvpMsg] = useState('');
  const [pvpBusy, setPvpBusy] = useState(false);
  const [pvpShareNote, setPvpShareNote] = useState('');
  const [pvpRoom, setPvpRoom] = useState(null);
  const [pvpMode, setPvpMode] = useState('race'); // 'race' | 'spectate'
  const [pvpCallsign, setPvpCallsign] = useState(() => {
    try { return localStorage.getItem('luge_callsign') || ''; } catch { return ''; }
  });
  const [pvpStartsAt, setPvpStartsAt] = useState(0);
  const [pvpCountdown, setPvpCountdown] = useState(0);
  const [pvpStandings, setPvpStandings] = useState([]);
  const [pvpRivals, setPvpRivals] = useState([]); // ghost markers
  const [pvpOutcome, setPvpOutcome] = useState(null); // { results, dnfs }
  const [pvpBoard, setPvpBoard] = useState([]); // global leaderboard entries
  const [pvpBoardNotice, setPvpBoardNotice] = useState('');

  const userIdRef = useRef('');
  const gameStateRef = useRef('menu');
  const pvpRoomRef = useRef(null);
  const pvpModeRef = useRef('race');
  const pvpCallsignRef = useRef('');
  const pvpUnsubRef = useRef(null);
  const pvpBeaconTimerRef = useRef(null);
  const pvpPollTimerRef = useRef(null);
  const pvpProgressRef = useRef(0);
  const pvpBeaconAtRef = useRef(0);
  const pvpFinishedRef = useRef(false);
  const pvpStartsAtRef = useRef(0);
  const pvpCodeRef = useRef('');
  const pvpSledIdRef = useRef('g1');
  const pvpCourseSetRef = useRef(false);
  const pvpOverRef = useRef(false);
  const controlsAttachedRef = useRef(false);
  const pvpSeatPendingRef = useRef(false);
  const countdownBeepRef = useRef(-1);

  const setGameStateBoth = (s) => { gameStateRef.current = s; setGameState(s); };

  // Hardware Tilt Refs
  const tiltData = useRef({ x: 0, y: 0 }); // Normalized -1 to 1
  const baselineBeta = useRef(40); // Standard holding angle
  const tokenRef = useRef('');
  const raceStartRef = useRef(0); // Wall-clock ms when the current run began
  // One finish, one recording (lib/luge/finish-guard.js): the race loop
  // calls onFinish every frame past the line, so handleFinish claims the
  // recording once per run and ignores the rest. Re-armed on race start.
  const finishGuardRef = useRef(null);
  if (finishGuardRef.current === null) finishGuardRef.current = createFinishGuard();

  const ownsArsenal = LUGE_PREMIUM_IDS.every((id) => ownedIds.has(id));

  // Course ids the server has recorded as legitimately completed.
  const doneCourseIds = useMemo(
    () => new Set(
      eligibility && eligibility.provisioned
        ? LUGE_COURSES.map((c) => c.id).filter((id) => !(eligibility.missingCourses || []).includes(id))
        : []
    ),
    [eligibility]
  );

  const authHeaders = () => ({ Authorization: `Bearer ${tokenRef.current}` });

  const refreshInventory = async () => {
    try {
      const { data: inv } = await supabase.from('luge_inventory').select('sled_id');
      setOwnedIds(new Set((inv || []).map((r) => r.sled_id)));
      const { data: red } = await supabase.from('luge_redemptions').select('user_id').maybeSingle();
      setRedeemed(!!red);
    } catch {
      // Tables may not exist yet (SQL not run) — treat as owning nothing.
      setOwnedIds(new Set());
      setRedeemed(false);
    } finally {
      setInventoryLoaded(true);
    }
  };

  // Server-side reward truth: courses completed + arsenal + claim status.
  // Never trusted from the client.
  const refreshEligibility = async () => {
    try {
      const res = await fetch('/api/luge/eligibility', { headers: authHeaders() });
      const data = await res.json();
      if (data && data.ok) setEligibility(data);
    } catch {
      // Leave the previous value; the UI degrades honestly without it.
    }
  };

  // ---------- PvP helpers ----------
  // Every helper below is a no-op until a race room is entered; solo play
  // never touches them.

  const stopPvpTimers = () => {
    if (pvpUnsubRef.current) { try { pvpUnsubRef.current(); } catch { /* noop */ } pvpUnsubRef.current = null; }
    if (pvpBeaconTimerRef.current) { clearInterval(pvpBeaconTimerRef.current); pvpBeaconTimerRef.current = null; }
    if (pvpPollTimerRef.current) { clearInterval(pvpPollTimerRef.current); pvpPollTimerRef.current = null; }
  };

  // One beacon upsert: my progress / finish for this room. Best-effort —
  // a failed beacon degrades the live board, never the race itself.
  const sendBeacon = async (finished, finishMs) => {
    try {
      await supabase.from('luge_race_beacons').upsert(
        beaconRow({
          roomCode: pvpCodeRef.current,
          userId: userIdRef.current,
          callsign: pvpCallsignRef.current || 'Rider',
          sledId: pvpSledIdRef.current,
          progress: pvpProgressRef.current,
          finished,
          finishMs,
        }),
        { onConflict: 'room_code,user_id' }
      );
    } catch {
      // Tables may not exist yet (SQL not run) — standings degrade, race continues.
    }
  };

  // Called by LugeTrack's frame loop; throttled to ~1/sec at the call site.
  const handlePvpProgress = (progress) => {
    pvpProgressRef.current = progress;
    const now = Date.now();
    if (!pvpFinishedRef.current && now - pvpBeaconAtRef.current >= BEACON_INTERVAL_MS) {
      pvpBeaconAtRef.current = now;
      void sendBeacon(false);
    }
  };

  // Poll the beacon board -> live standings + ghost markers. When the race
  // is over (everyone finished or the timeout hit), settle the results.
  const pollPvpBoard = async () => {
    const code = pvpCodeRef.current;
    if (!code) return;
    let beacons = [];
    try {
      const { data, error } = await supabase.from('luge_race_beacons').select('*').eq('room_code', code);
      if (error) throw error;
      beacons = data || [];
    } catch {
      return; // degraded: keep the last board, the race continues
    }
    const now = Date.now();
    const standings = sortStandings(beacons, now);
    setPvpStandings(standings);
    setPvpRivals(
      beacons
        .filter((b) => !b.spectating && b.user_id !== userIdRef.current)
        .map((b) => ({ userId: b.user_id, progress: Number(b.progress) || 0, color: ghostColorFor(b.user_id) }))
    );
    if (!pvpOverRef.current && pvpStartsAtRef.current && raceIsOver(beacons, pvpStartsAtRef.current, now)) {
      pvpOverRef.current = true;
      setPvpOutcome(pvpResults(beacons, now));
      // Any seated racer may close the room — hostless by design.
      try {
        await supabase.from('oasis_rooms').update({ status: ROOM_STATUS.FINISHED }).eq('room_code', code);
      } catch { /* best-effort */ }
      if (pvpBeaconTimerRef.current) { clearInterval(pvpBeaconTimerRef.current); pvpBeaconTimerRef.current = null; }
      detachRaceControls();
      setGameStateBoth('pvp_results');
    }
  };

  const startPvpLoops = () => {
    if (pvpPollTimerRef.current) clearInterval(pvpPollTimerRef.current);
    pvpPollTimerRef.current = setInterval(() => { void pollPvpBoard(); }, PVP_POLL_MS);
    void pollPvpBoard();
  };

  // Room-row watcher: drives waiting -> countdown -> racing -> results.
  const handleRoomUpdate = (room) => {
    pvpRoomRef.current = room;
    setPvpRoom(room);
    if (!room) return;
    const rs = raceStateFromRoom(room);
    const gs = gameStateRef.current;
    if (room.status === ROOM_STATUS.PLAYING && rs) {
      // Everyone rides the host's course — set it once, before the countdown.
      if (!pvpCourseSetRef.current) {
        pvpCourseSetRef.current = true;
        const rc = LUGE_COURSES.find((c) => c.id === rs.courseId);
        if (rc) setSelectedCourse(rc);
      }
      pvpStartsAtRef.current = rs.startsAt;
      setPvpStartsAt(rs.startsAt);
      if (gs !== 'racing' && gs !== 'pvp_spectate' && gs !== 'pvp_results') {
        setGameStateBoth('pvp_countdown');
      }
    } else if (room.status === ROOM_STATUS.FINISHED) {
      if ((gs === 'racing' || gs === 'pvp_spectate') && !pvpOverRef.current) {
        pvpOverRef.current = true;
        void pollPvpBoard().then(() => {
          // If the board was unreachable, still show what we have.
          setGameStateBoth('pvp_results');
        });
      }
    } else if (room.status === ROOM_STATUS.WAITING) {
      // Finished-room joiners land in the lobby unseated (joinRoom only
      // seats waiting rooms): seat them now that the room is open again.
      const ids = Array.isArray(room.player_ids) ? room.player_ids : [];
      if (userIdRef.current && !ids.includes(userIdRef.current) && !pvpRoomIsFull(room) && pvpCodeRef.current && !pvpSeatPendingRef.current) {
        pvpSeatPendingRef.current = true;
        void joinRoom(supabase, { code: pvpCodeRef.current, playerId: userIdRef.current })
          .finally(() => { pvpSeatPendingRef.current = false; });
      }
      if (gs === 'pvp_results' || gs === 'pvp_spectate') {
        // A new race is forming — back to the lobby view. Spectators
        // graduate to racers for the next heat (auto-seated above).
        pvpOverRef.current = false;
        setPvpOutcome(null);
        if (gs === 'pvp_spectate') {
          pvpModeRef.current = 'race';
          setPvpMode('race');
        }
        setGameStateBoth('pvp_waiting');
      }
    }
  };

  const enterPvpRoom = (room, mode) => {
    stopPvpTimers();
    pvpCodeRef.current = room.room_code;
    pvpModeRef.current = mode;
    pvpCourseSetRef.current = false;
    pvpOverRef.current = false;
    pvpProgressRef.current = 0;
    pvpFinishedRef.current = false;
    pvpStartsAtRef.current = 0;
    pvpSledIdRef.current = selectedSled.id;
    setPvpCodeInput(room.room_code);
    setPvpMode(mode);
    setPvpRoom(room);
    pvpRoomRef.current = room;
    setPvpOutcome(null);
    setPvpStandings([]);
    setPvpRivals([]);
    setPvpMsg('');
    setPvpShareNote('');
    pvpUnsubRef.current = subscribeToRoom(supabase, room.room_code, handleRoomUpdate, PVP_POLL_MS);
    // Already racing? Go straight to spectate; otherwise wait in the lobby.
    const rs = raceStateFromRoom(room);
    if (room.status === ROOM_STATUS.PLAYING && rs && mode === 'spectate') {
      pvpStartsAtRef.current = rs.startsAt;
      setPvpStartsAt(rs.startsAt);
      const rc = LUGE_COURSES.find((c) => c.id === rs.courseId);
      if (rc) { setSelectedCourse(rc); pvpCourseSetRef.current = true; }
      setGameStateBoth('pvp_spectate');
      startPvpLoops();
    } else {
      setGameStateBoth('pvp_waiting');
    }
  };

  const createPvpRace = async () => {
    if (!userIdRef.current) { setPvpMsg('Sign in to host a race.'); return; }
    setPvpBusy(true);
    setPvpMsg('');
    try {
      const room = await createRoom(supabase, {
        game: LUGE_PVP_SLUG,
        hostId: userIdRef.current,
        minPlayers: LUGE_MIN_RACERS,
        maxPlayers: LUGE_MAX_RACERS,
      });
      fx.unlock();
      enterPvpRoom(room, 'race');
    } catch {
      setPvpMsg('Race rooms unlock with the next database update — solo descents still work.');
    } finally {
      setPvpBusy(false);
    }
  };

  const joinPvpRace = async (rawCode) => {
    const clean = normalizeCode(rawCode);
    if (!isValidRoomCode(clean)) { setPvpMsg('Enter a valid 6-character race code.'); return; }
    if (!userIdRef.current) { setPvpMsg('Sign in to join a race.'); return; }
    setPvpBusy(true);
    setPvpMsg('');
    try {
      const room = await getRoom(supabase, clean);
      const decision = decidePvpJoin(room);
      if (decision.error || !decision.ok) { setPvpMsg(decision.error || 'Race not found.'); return; }
      if (decision.mode === 'race') {
        if (pvpRoomIsFull(room)) { setPvpMsg(`That race is full (${LUGE_MAX_RACERS} racers).`); return; }
        const res = await joinRoom(supabase, { code: clean, playerId: userIdRef.current });
        if (res.error) { setPvpMsg(res.error); return; }
        const fresh = await getRoom(supabase, clean);
        enterPvpRoom(fresh || room, 'race');
      } else if (decision.mode === 'spectate') {
        enterPvpRoom(room, 'spectate');
        setPvpMsg('That race is already running — spectating until the next countdown.');
      } else {
        enterPvpRoom(room, 'race');
        setPvpMsg('That race just finished — you are in for the next countdown.');
      }
    } catch {
      setPvpMsg('Could not reach the race room. Check your connection.');
    } finally {
      setPvpBusy(false);
    }
  };

  // Any seated rider may start the countdown (hostless by design).
  const startPvpCountdown = async () => {
    const room = pvpRoomRef.current;
    if (!canStartRace(room, userIdRef.current)) return;
    setPvpBusy(true);
    setPvpMsg('');
    try {
      const startsAt = Date.now() + PVP_COUNTDOWN_MS;
      const { error } = await supabase
        .from('oasis_rooms')
        .update({ status: ROOM_STATUS.PLAYING, full_state: buildRaceState({ startsAt, courseId: selectedCourse.id }) })
        .eq('room_code', pvpCodeRef.current);
      if (error) throw error;
      fx.go();
    } catch {
      setPvpMsg('Could not start the race. Try again.');
    } finally {
      setPvpBusy(false);
    }
  };

  const sharePvpRace = async () => {
    const code = pvpCodeRef.current;
    if (!code) return;
    const res = await shareRoomInvite({
      gameSlug: 'luge',
      code,
      title: 'Join my Luge PvP race',
      text: `Race me on the Neon Descent! Code: ${code}`,
    });
    setPvpShareNote(
      res === 'shared' ? 'Invite sent.' :
      res === 'copied' ? `Race link copied: ${buildJoinUrl(typeof window !== 'undefined' ? window.location.origin : '', 'luge', code)}` :
      'Could not share — the code is shown above.'
    );
  };

  const copyPvpCode = async () => {
    const ok = await copyTextToClipboard(pvpCodeRef.current);
    setPvpShareNote(ok ? 'Code copied.' : 'Copy failed — long-press the code.');
  };

  const leavePvp = async () => {
    const code = pvpCodeRef.current;
    stopPvpTimers();
    // Best-effort: pull my beacon so I stop haunting the board.
    try {
      if (code && userIdRef.current) {
        await supabase.from('luge_race_beacons').delete().eq('room_code', code).eq('user_id', userIdRef.current);
      }
    } catch { /* noop */ }
    pvpCodeRef.current = '';
    pvpRoomRef.current = null;
    setPvpRoom(null);
    setPvpOutcome(null);
    setPvpStandings([]);
    setPvpRivals([]);
    setPvpMsg('');
    setGameStateBoth('menu');
  };

  // Back to the waiting lobby for another heat. Any seated rider may reopen.
  const raceAgain = async () => {
    const code = pvpCodeRef.current;
    stopPvpTimers();
    pvpOverRef.current = false;
    pvpCourseSetRef.current = false;
    pvpProgressRef.current = 0;
    pvpFinishedRef.current = false;
    pvpStartsAtRef.current = 0;
    setPvpOutcome(null);
    setPvpStandings([]);
    setPvpRivals([]);
    try {
      if (code) {
        await supabase.from('oasis_rooms')
          .update({ status: ROOM_STATUS.WAITING, full_state: null })
          .eq('room_code', code);
      }
    } catch { /* best-effort: the watcher will pick up whatever the room says */ }
    if (code) pvpUnsubRef.current = subscribeToRoom(supabase, code, handleRoomUpdate, PVP_POLL_MS);
    setGameStateBoth('pvp_waiting');
  };

  useEffect(() => {
    // The shared supabase client throws when the database connection isn't
    // configured. Catch that (and any auth failure) and say so honestly
    // instead of leaving a dead black screen.
    try {
      supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setMounted(true);
        setAuthed(false);
        return;
      }
      tokenRef.current = session.access_token;
      userIdRef.current = session.user.id;
      // Rider callsign for PvP + the global board: saved preference wins,
      // otherwise the email prefix. Editable in the race lobby.
      if (!pvpCallsignRef.current) {
        const prefix = String(session.user.email || '').split('@')[0].slice(0, 24);
        const cs = pvpCallsign || prefix || 'Rider';
        setPvpCallsign(cs);
        pvpCallsignRef.current = cs;
      }
      setAuthed(true);
      setMounted(true);
      await refreshInventory();
      await refreshEligibility();

      // Deep link: /luge?code=XXXXXX auto-opens the race lobby and joins.
      try {
        const deepCode = codeFromSearch(window.location.search);
        if (deepCode && isValidRoomCode(deepCode)) {
          setPvpCodeInput(deepCode);
          setGameStateBoth('pvp_lobby');
          void joinPvpRace(deepCode);
        }
      } catch { /* deep link is a convenience, never a blocker */ }

      // Store display info (server-set price).
      try {
        const res = await fetch('/api/luge/checkout');
        const info = await res.json();
        if (info.ok) setStoreInfo({ priceUsd: info.priceUsd, premiumCount: info.premiumCount });
      } catch { /* leave defaults */ }

      // Returning from a successful Stripe checkout?
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('purchase') === 'success') {
          setPurchaseNote('Payment received — your arsenal is unlocking. If your hulls are not showing yet, wait a few seconds and reopen the garage.');
          // Re-check a few times; the webhook grants within seconds.
          let tries = 0;
          const timer = setInterval(async () => {
            tries += 1;
            await refreshInventory();
            if (tries >= 6) clearInterval(timer);
          }, 5000);
          window.history.replaceState({}, '', window.location.pathname);
        } else if (params.get('purchase') === 'cancelled') {
          setPurchaseNote('Checkout was cancelled — no charge was made.');
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
      }).catch(() => setCloudOffline(true));
    } catch {
      setCloudOffline(true);
    }
  }, []);

  // Keep the ref mirror of gameState in sync for the room watcher.
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // Stop PvP timers on unmount.
  useEffect(() => () => stopPvpTimers(), []);

  // Refetch the global board for a course. Extracted so a finish can refresh
  // it too — the board used to fetch only when the course changed, so a rider
  // who had just finished still saw the pre-race (often empty) board and
  // reasonably concluded the run was never recorded.
  const boardCourseRef = useRef(0);
  const refreshBoard = useCallback(async (courseId) => {
    boardCourseRef.current = courseId;
    try {
      const res = await fetch(`/api/luge/leaderboard?course=${courseId}`);
      const d = await res.json();
      if (!d || !d.ok) return;
      if (boardCourseRef.current !== courseId) return; // a newer course asked first
      setPvpBoard(Array.isArray(d.entries) ? d.entries : []);
      setPvpBoardNotice(d.notice || '');
    } catch { /* offline: the board simply stays as-is */ }
  }, []);

  // Global leaderboard board for the selected course (public, global).
  // Degrades honestly when the table isn't provisioned yet.
  useEffect(() => {
    setPvpBoard([]);
    setPvpBoardNotice('');
    refreshBoard(selectedCourse.id);
  }, [selectedCourse.id, refreshBoard]);

  const onCallsignChange = (v) => {
    const clean = String(v || '').slice(0, 24);
    setPvpCallsign(clean);
    pvpCallsignRef.current = clean;
    try { localStorage.setItem('luge_callsign', clean); } catch { /* noop */ }
  };

  // Countdown driver: synced to the room's startsAt, not the local clock.
  useEffect(() => {
    if (gameState !== 'pvp_countdown') return undefined;
    countdownBeepRef.current = -1;
    const timer = setInterval(() => {
      const left = Math.max(0, pvpStartsAtRef.current - Date.now());
      setPvpCountdown(left);
      const sec = Math.ceil(left / 1000);
      if (sec !== countdownBeepRef.current && sec <= 5 && sec >= 1) {
        countdownBeepRef.current = sec;
        fx.countdownBeep(sec === 1);
      }
      if (left <= 0) {
        clearInterval(timer);
        fx.go();
        // Unseated riders (a full room, a failed seat) watch this heat —
        // never race without a seat.
        const seated = (pvpRoomRef.current?.player_ids || []).includes(userIdRef.current);
        if (pvpModeRef.current === 'spectate' || !seated) {
          setGameStateBoth('pvp_spectate');
          startPvpLoops();
        } else {
          // Green light: the synced timestamp is the race clock, so every
          // racer's finish time is comparable.
          attachRaceControls();
          raceStartRef.current = pvpStartsAtRef.current;
          finishGuardRef.current.reset();
          setRecordError('');
          pvpProgressRef.current = 0;
          pvpFinishedRef.current = false;
          pvpBeaconAtRef.current = 0;
          setGameStateBoth('racing');
          startPvpLoops();
          void sendBeacon(false);
        }
      }
    }, 200);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // Request iOS Gyroscope Permissions & Start Listener
  const attachRaceControls = () => {
    if (controlsAttachedRef.current) return;
    controlsAttachedRef.current = true;
    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('keydown', handleKeys);
  };
  const detachRaceControls = () => {
    controlsAttachedRef.current = false;
    window.removeEventListener('deviceorientation', handleOrientation);
    window.removeEventListener('keydown', handleKeys);
    tiltData.current = { x: 0, y: 0 };
  };
  const requestTiltAccessAndStart = async () => {
    unlockFx(); // starting is a gesture: make sure FX is live
    fx.tap(); // ignition confirmed
    const start = () => {
      attachRaceControls();
      raceStartRef.current = Date.now();
      finishGuardRef.current.reset();
      setRecordError('');
      setGameState('racing');
    };
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') {
          // Fall through to touch/keyboard steering.
        }
      } catch (error) {
        console.error(error);
      }
    }
    start();
  };

  const handleOrientation = (event) => {
    // event.gamma: Left to Right (-90 to 90)
    // event.beta: Front to Back (-180 to 180)

    // Normalize Gamma (X-axis steering)
    let rawX = event.gamma || 0;
    rawX = THREE.MathUtils.clamp(rawX, -45, 45); // Limit extreme tilts
    tiltData.current.x = rawX / 45; // -1 to 1

    // Normalize Beta (Y-axis accel/brake)
    let rawY = event.beta || 40;
    // Difference from neutral baseline
    let diffY = rawY - baselineBeta.current;
    diffY = THREE.MathUtils.clamp(diffY, -30, 30);
    tiltData.current.y = diffY / 30; // -1 (forward) to 1 (backward)
  };

  // Keyboard fallback (desktop): arrows steer and brake/accelerate.
  const handleKeys = (event) => {
    if (event.key === 'ArrowLeft') tiltData.current.x = -1;
    else if (event.key === 'ArrowRight') tiltData.current.x = 1;
    else if (event.key === 'ArrowUp') tiltData.current.y = -1;
    else if (event.key === 'ArrowDown') tiltData.current.y = 1;
  };
  const releaseKeys = () => { tiltData.current.x = 0; tiltData.current.y = 0; };

  // Touch fallback: left/right screen halves steer.
  const touchSteer = (clientX) => {
    tiltData.current.x = clientX < window.innerWidth / 2 ? -1 : 1;
  };
  const touchRelease = () => { tiltData.current.x = 0; };

  // Cleanup listeners on unmount
  useEffect(() => {
    // FX system: unlock sound+haptics on the first gesture.
    const unlock = () => unlockFx();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('keydown', handleKeys);
      window.removeEventListener('keyup', releaseKeys);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const handleFinish = async () => {
    // One finish, one recording: the race loop calls onFinish every frame
    // once progress passes the line, and the first call awaits network
    // round-trips before the scene unmounts. Without this claim a single
    // finish recorded dozens of times (live Nov 13: ~50 leaderboard rows
    // for one run). Later frames in the same run return here and do nothing.
    if (!finishGuardRef.current.claim()) return;
    fx.gameWin(); // crossed the finish line: full fanfare
    detachRaceControls();

    const isPvp = !!pvpCodeRef.current && pvpModeRef.current === 'race' && gameStateRef.current === 'racing';
    // PvP finish times use the synced race clock (startsAt from the room),
    // so every racer's time is comparable. Solo runs use the local clock.
    const runMs = isPvp
      ? Math.max(1, Date.now() - pvpStartsAtRef.current)
      : Math.max(1, Date.now() - (raceStartRef.current || Date.now()));
    const finishSledId = isPvp ? pvpSledIdRef.current : selectedSled.id;

    if (isPvp) {
      pvpFinishedRef.current = true;
      if (pvpBeaconTimerRef.current) { clearInterval(pvpBeaconTimerRef.current); pvpBeaconTimerRef.current = null; }
      await sendBeacon(true, runMs);
    }

    // The token captured on mount goes stale after the 1-hour JWT expiry —
    // a long session's finishes were answered 401 and swallowed silently.
    // Refresh it at the finish line so the recording always carries a live
    // token for this rider.
    let finishToken = tokenRef.current;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        finishToken = session.access_token;
        tokenRef.current = finishToken;
      }
    } catch { /* fall back to the mounted token */ }
    const finishHeaders = { Authorization: `Bearer ${finishToken}`, 'Content-Type': 'application/json' };

    // Global leaderboard: every validated run — PvP or solo — can post a
    // time. Server-validated against the physics floor; a failed submit
    // never blocks the game.
    const submitGlobalTime = async () => {
      try {
        await fetch('/api/luge/leaderboard', {
          method: 'POST',
          headers: finishHeaders,
          body: JSON.stringify({
            courseId: selectedCourse.id,
            runMs,
            sledId: finishSledId,
            player: pvpCallsignRef.current || 'Rider',
          }),
        });
      } catch { /* best-effort */ }
    };

    // Record the run server-side (anti-cheat validated there). A failed
    // recording never blocks the game — the run still happened — but it is
    // now said out loud on the menu board instead of swallowed silently.
    let freshEligibility = eligibility;
    try {
      const completeRes = await fetch('/api/luge/complete', {
        method: 'POST',
        headers: finishHeaders,
        body: JSON.stringify({
          courseId: selectedCourse.id,
          runMs,
          sledId: finishSledId,
        }),
      });
      let completeData = null;
      try { completeData = await completeRes.json(); } catch { /* non-JSON error page */ }
      if (!completeRes.ok || !completeData?.ok) {
        setRecordError(`Your run finished but was not recorded — ${completeData?.error || 'please run the course again.'}`);
      } else {
        setRecordError('');
      }
    } catch {
      setRecordError('Your run finished but was not recorded — you may be offline. Run the course again when you are back online.');
    }
    try {
      const res = await fetch('/api/luge/eligibility', { headers: finishHeaders });
      const data = await res.json();
      if (data && data.ok) {
        setEligibility(data);
        freshEligibility = data;
      }
    } catch {
      // Eligibility is a display refresh, never a blocker.
    }
    void submitGlobalTime();
    // The board used to refresh only when the course changed, so a rider
    // who had just finished still saw the pre-race board. Refresh it now
    // so the new time is visible immediately.
    void refreshBoard(selectedCourse.id);

    if (isPvp) {
      // The beacon poll keeps running: the results board fills in live as
      // the rest of the field finishes (or the timeout lands).
      setGameStateBoth('pvp_results');
      return;
    }

    // The reward podium appears when the rider is fully eligible (every
    // course + the whole Arsenal), whichever course finished last — or
    // when course 20 itself is conquered.
    if ((freshEligibility && freshEligibility.eligible) || selectedCourse.id === FINAL_COURSE_ID) {
      setGameState('podium');
    } else {
      setGameState('menu');
    }
  };

  const startCheckout = async () => {
    setCheckoutBusy(true);
    setStoreError('');
    try {
      const res = await fetch('/api/luge/checkout', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ useGold, idemKey: crypto.randomUUID() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStoreError(data.error || 'Could not start checkout. Try again.');
        return;
      }
      if (data.type === 'gold') {
        setPurchaseNote(data.notice || 'Paid with gold.');
        setUseGold(false);
        await refreshInventory();
        return;
      }
      window.location.href = data.url;
    } catch {
      setStoreError('Could not reach the store. Check your connection and try again.');
    } finally {
      setCheckoutBusy(false);
    }
  };

  const isSledLocked = (sled) => sled.type === 'premium' && !ownedIds.has(sled.id);

  if (cloudOffline) return (
    <div className="relative flex flex-col items-center justify-center w-full h-full p-8 text-center text-white bg-black overflow-hidden">
      <LugeBackdrop mode={ambience} />
      <div className="relative z-10 flex flex-col items-center">
      <h1 className="mb-2 text-4xl text-cyan-400 uppercase tracking-widest">Cyberpunk Luge</h1>
      <p className="mb-4 text-sm font-bold tracking-widest text-amber-400 uppercase">Cloud features are offline</p>
      <p className="max-w-md mb-8 text-sm text-zinc-400">
        This page needs the database connection. Check back once the cloud is connected.
      </p>
      <BackButton label="Go to the hub" />
      </div>
    </div>
  );

  if (!authed) {
    return (
      <div className="relative flex flex-col items-center justify-center w-full h-full p-8 text-center text-white bg-black overflow-hidden">
        <LugeBackdrop mode={ambience} />
        <div className="relative z-10 flex flex-col items-center">
        <h1 className="mb-2 text-4xl text-cyan-400 uppercase tracking-widest">Cyberpunk Luge</h1>
        <p className="mb-8 text-sm tracking-widest text-zinc-400 uppercase">Sign in to ride</p>
        <p className="max-w-md mb-8 text-sm text-zinc-400">
          Your garage, your hulls, and your hoodie claim all live on your account.
          Sign in at the master hub, then come back here.
        </p>
      <BackButton label="Go to the hub" />
        </div>
      </div>
    );
  }

  return (
    <>
      <BackButton label="EXIT MATRIX" />

      {gameState === 'menu' && (
        <div className="relative flex flex-col items-center w-full h-full p-6 sm:p-8 text-center text-white bg-black overflow-y-auto">
          <LugeBackdrop video toggle={cycleAmbience} mode={ambience} />
          <div className="relative z-10 flex flex-col items-center w-full shrink-0">
          <h1 className="relative mb-2 text-4xl text-cyan-400 drop-shadow-[0_0_15px_rgba(0,242,255,0.5)] uppercase tracking-widest shrink-0">Cyberpunk Luge</h1>
          <p className="mb-2 text-sm tracking-widest text-zinc-500 uppercase shrink-0">Neon Descent Engine</p>
          {ownsArsenal && (
            <p className="mb-2 text-[11px] font-bold tracking-widest text-amber-400 uppercase">Complete Arsenal owned</p>
          )}
          {eligibility && eligibility.provisioned && (
            <p className="mb-1 text-[11px] font-bold tracking-widest text-cyan-300 uppercase">
              Courses conquered: {eligibility.coursesCompleted} of {eligibility.coursesTotal}
            </p>
          )}
          <p className="mb-4 max-w-xl text-[10px] leading-relaxed text-zinc-500">
            Free-hoodie reward: conquer all 20 courses with the Complete Arsenal in your
            garage. Only runs finished after the reward launched count — earlier runs
            don&apos;t carry over.
          </p>
          {purchaseNote && (
            <p className="max-w-xl mb-4 text-xs text-emerald-300">{purchaseNote}</p>
          )}

          <div className="flex flex-col sm:flex-row w-full max-w-5xl gap-6 sm:gap-8 sm:h-[60vh] shrink-0">
            <div className="flex flex-col flex-1 min-h-[38vh] sm:min-h-0 p-4 overflow-y-auto border rounded border-cyan-500/30 bg-black/50 custom-scrollbar" style={lugePanelTile}>
              <h2 className="mb-4 font-bold text-fuchsia-400">SELECT COURSE</h2>
              {LUGE_COURSES.map(course => (
                <div
                  key={course.id}
                  onClick={() => setSelectedCourse(course)}
                  className={`p-3 mb-2 text-left border rounded cursor-pointer transition-all ${selectedCourse.id === course.id ? 'border-cyan-400 bg-cyan-900/30' : 'border-zinc-800 hover:border-zinc-500'}`}
                >
                  <div className="text-sm font-bold text-white uppercase">
                    {course.name}
                    {doneCourseIds.has(course.id) && <span className="ml-2 text-emerald-400">✓</span>}
                  </div>
                  <div className="text-[10px] text-zinc-400">{course.desc}</div>
                </div>
              ))}
              {/* Safari bottom-bar clearance */}
              <div aria-hidden="true" className="player-clear shrink-0" />
            </div>

            <div className="flex flex-col flex-1 min-h-[38vh] sm:min-h-0 p-4 overflow-y-auto border rounded border-fuchsia-500/30 bg-black/50 custom-scrollbar" style={lugePanelTile}>
              <h2 className="mb-4 font-bold text-cyan-400">SELECT SLED</h2>
              {LUGE_SLEDS.map(sled => {
                const locked = isSledLocked(sled);
                return (
                  <div
                    key={sled.id}
                    onClick={() => { if (!locked) setSelectedSled(sled); else setGameState('store'); }}
                    className={`p-3 mb-2 text-left border rounded transition-all ${locked ? 'border-zinc-800 opacity-60 cursor-pointer hover:border-amber-500/60' : `cursor-pointer ${selectedSled.id === sled.id ? 'border-fuchsia-400 bg-fuchsia-900/30' : 'border-zinc-800 hover:border-zinc-500'}`}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white uppercase">{sled.name}</span>
                      <span className="text-[10px] uppercase text-zinc-500 border border-zinc-700 px-2 py-0.5 rounded">
                        {locked ? 'Locked' : sled.type}
                      </span>
                    </div>
                    <div className="text-[10px] text-amber-400 mt-1">{sled.desc}</div>
                    <div className="text-[10px] text-zinc-500 mt-1 tracking-wider">
                      SAND RESIST {Math.round((sled.sandResist || 0) * 100)}% · BOOST ×{sled.boostGain || 1}
                    </div>
                    {locked && (
                      <div className="text-[10px] text-zinc-500 mt-1">Part of the Complete Arsenal — tap to view the store.</div>
                    )}
                  </div>
                );
              })}
              <button
                onClick={() => setGameState('store')}
                className="flex items-center justify-center gap-3 w-full py-3 mt-4 text-xs font-bold tracking-widest text-black uppercase transition-all bg-amber-400 rounded hover:bg-white"
              >
                <LIcon name="bag" size={18} />
                OPEN PREMIUM STORE
              </button>
              {/* Safari bottom-bar clearance */}
              <div aria-hidden="true" className="player-clear shrink-0" />
            </div>
          </div>

          <div className="w-full max-w-5xl p-4 mt-2 text-left border rounded border-zinc-800 bg-black/50 shrink-0">
            <h2 className="mb-2 text-xs font-bold tracking-widest text-amber-300 uppercase">
              Global top times — {selectedCourse.name}
            </h2>
            {pvpBoardNotice && (
              <p className="mb-2 text-[10px] text-zinc-500">{pvpBoardNotice}</p>
            )}
            {recordError && (
              <p className="mb-2 text-[10px] text-amber-300">{recordError}</p>
            )}
            {pvpBoard.length === 0 && !pvpBoardNotice && (
              <p className="text-[10px] text-zinc-600">No times yet on this course — be the first.</p>
            )}
            {pvpBoard.slice(0, 10).map((e, i) => (
              <div key={`${e.player}-${e.timeMs}-${i}`} className="flex items-center justify-between py-1 text-[11px] border-b border-zinc-900 last:border-0">
                <span className="text-zinc-400">
                  <span className="inline-block w-6 text-zinc-600">{i + 1}.</span>
                  <span className="text-zinc-200 font-bold">{e.player}</span>
                </span>
                <span className="font-mono text-cyan-300">{formatRaceTime(e.timeMs)}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 mt-6 mb-12 shrink-0">
            <button
              onClick={() => setGameState('pre_race_calibrate')}
              className="flex items-center justify-center gap-3 px-12 py-4 text-lg font-bold text-black uppercase transition-all bg-cyan-400 rounded-full hover:bg-white hover:shadow-[0_0_30px_rgba(0,242,255,0.6)] tracking-widest"
            >
              <LIcon name="flag" size={22} />
              START DESCENT
            </button>
            <button
              onClick={() => { setPvpMsg(''); setPvpShareNote(''); setGameStateBoth('pvp_lobby'); }}
              className="flex items-center justify-center gap-3 px-12 py-4 text-lg font-bold uppercase transition-all rounded-full tracking-widest text-fuchsia-300 border border-fuchsia-500/60 hover:bg-fuchsia-500/20 hover:shadow-[0_0_30px_rgba(255,0,255,0.35)]"
            >
              <LIcon name="users" size={22} />
              PVP RACE
            </button>
          </div>
          </div>
        </div>
      )}

      {gameState === 'pvp_lobby' && (
        <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center text-white bg-zinc-950 overflow-y-auto">
          <h1 className="mb-2 text-3xl text-fuchsia-400 drop-shadow-[0_0_15px_rgba(255,0,255,0.5)] uppercase tracking-widest">PvP Race</h1>
          <p className="mb-6 text-xs tracking-widest text-zinc-400 uppercase">Up to {LUGE_MAX_RACERS} riders · one course · synced start</p>

          <div className="w-full max-w-md p-6 border rounded border-fuchsia-500/30 bg-black/50 text-left" style={lugePanelTile}>
            <label className="block mb-1 text-[10px] tracking-widest text-zinc-500 uppercase">Rider callsign</label>
            <input
              value={pvpCallsign}
              onChange={(e) => onCallsignChange(e.target.value)}
              maxLength={24}
              placeholder="Rider"
              className="w-full px-3 py-2 mb-5 text-sm text-white bg-zinc-900 border border-zinc-700 rounded focus:border-fuchsia-400 focus:outline-none"
            />

            <button
              onClick={createPvpRace}
              disabled={pvpBusy}
              className="flex items-center justify-center gap-3 w-full px-8 py-3 mb-3 font-bold tracking-widest text-black uppercase bg-fuchsia-400 rounded hover:bg-white disabled:opacity-50"
            >
              <LIcon name="plus" size={18} />
              {pvpBusy ? 'Creating…' : 'HOST A RACE'}
            </button>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-[10px] text-zinc-600 tracking-widest">OR JOIN</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>

            <div className="flex gap-2">
              <input
                value={pvpCodeInput}
                onChange={(e) => setPvpCodeInput(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="CODE"
                className="flex-1 px-3 py-2 text-sm text-center tracking-[0.4em] text-white uppercase bg-zinc-900 border border-zinc-700 rounded focus:border-fuchsia-400 focus:outline-none"
              />
              <button
                onClick={() => joinPvpRace(pvpCodeInput)}
                disabled={pvpBusy}
                className="flex items-center justify-center gap-2 px-6 py-2 text-xs font-bold tracking-widest text-fuchsia-300 uppercase border border-fuchsia-500/60 rounded hover:bg-fuchsia-500/20 disabled:opacity-50"
              >
                <LIcon name="arrowRight" size={16} />
                JOIN
              </button>
            </div>

            {pvpMsg && <p className="mt-4 text-xs text-amber-300">{pvpMsg}</p>}
            <p className="mt-4 text-[10px] text-zinc-600 leading-relaxed">
              Racing as <span className="text-zinc-300">{selectedSled.name}</span> on{' '}
              <span className="text-zinc-300">{selectedCourse.name}</span> — change them in the garage before hosting.
            </p>
          </div>

          <button
            onClick={() => setGameStateBoth('menu')}
            className="flex items-center justify-center gap-2 px-8 py-3 mt-6 text-xs font-bold tracking-widest text-zinc-300 uppercase border border-zinc-700 rounded hover:border-zinc-400"
          >
            <LIcon name="home" size={16} />
            Back to garage
          </button>
          <div aria-hidden="true" className="player-clear shrink-0" />
        </div>
      )}

      {gameState === 'pvp_waiting' && pvpRoom && (
        <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center text-white bg-zinc-950 overflow-y-auto">
          <h1 className="mb-1 text-3xl text-fuchsia-400 uppercase tracking-widest">Race Lobby</h1>
          <p className="mb-4 text-xs tracking-widest text-zinc-400 uppercase">
            {(pvpRoom.player_ids || []).length} / {LUGE_MAX_RACERS} riders · {selectedCourse.name}
          </p>

          <button onClick={copyPvpCode} title="Tap to copy" className="mb-2 px-6 py-3 border border-fuchsia-500/60 rounded bg-black/60 hover:bg-fuchsia-500/20">
            <span className="block text-[10px] tracking-widest text-zinc-500 uppercase mb-1">Race code — tap to copy</span>
            <span className="text-3xl font-black tracking-[0.5em] text-white">{pvpCodeInput}</span>
          </button>
          <div className="flex gap-2 mb-4">
            <button onClick={sharePvpRace} className="flex items-center justify-center gap-2 px-4 py-2 text-[11px] font-bold tracking-widest uppercase border border-zinc-700 rounded hover:border-fuchsia-400 text-zinc-300">
              <LIcon name="share" size={14} />
              SHARE INVITE
            </button>
            <button onClick={copyPvpCode} className="flex items-center justify-center gap-2 px-4 py-2 text-[11px] font-bold tracking-widest uppercase border border-zinc-700 rounded hover:border-fuchsia-400 text-zinc-300">
              <LIcon name="copy" size={14} />
              COPY CODE
            </button>
          </div>
          {pvpShareNote && <p className="mb-4 text-[11px] text-cyan-300 break-all max-w-md">{pvpShareNote}</p>}

          <div className="w-full max-w-md p-4 mb-4 border rounded border-zinc-800 bg-black/50 text-left" style={lugePanelTile}>
            <label className="block mb-1 text-[10px] tracking-widest text-zinc-500 uppercase">Rider callsign</label>
            <input
              value={pvpCallsign}
              onChange={(e) => onCallsignChange(e.target.value)}
              maxLength={24}
              className="w-full px-3 py-2 text-sm text-white bg-zinc-900 border border-zinc-700 rounded focus:border-fuchsia-400 focus:outline-none"
            />
            <p className="mt-3 text-[10px] text-zinc-600">
              Racing as <span className="text-zinc-300">{selectedSled.name}</span> ·
              SAND RESIST {Math.round((selectedSled.sandResist || 0) * 100)}% · BOOST ×{selectedSled.boostGain || 1}
            </p>
          </div>

          {pvpMsg && <p className="mb-4 text-xs text-amber-300 max-w-md">{pvpMsg}</p>}

          {canStartRace(pvpRoom, userIdRef.current) ? (
            <button
              onClick={startPvpCountdown}
              disabled={pvpBusy}
              className="flex items-center justify-center gap-3 px-12 py-4 mb-3 text-lg font-bold text-black uppercase transition-all bg-fuchsia-400 rounded-full hover:bg-white tracking-widest disabled:opacity-50"
            >
              <LIcon name="flag" size={20} />
              {pvpBusy ? 'Starting…' : 'START RACE'}
            </button>
          ) : (
            <p className="mb-3 text-xs text-zinc-500 tracking-widest uppercase">
              Waiting for the countdown — need at least {LUGE_MIN_RACERS} riders. Anyone seated can start it.
            </p>
          )}

          <button
            onClick={leavePvp}
            className="flex items-center justify-center gap-2 px-8 py-2 text-xs font-bold tracking-widest text-zinc-400 uppercase border border-zinc-800 rounded hover:border-zinc-500"
          >
            <LIcon name="x" size={14} />
            LEAVE RACE
          </button>
          <div aria-hidden="true" className="player-clear shrink-0" />
        </div>
      )}

      {gameState === 'pvp_countdown' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <p className="mb-2 text-xs tracking-[0.4em] text-fuchsia-400 uppercase">Riders ready</p>
          <div className="text-8xl font-black text-white tabular-nums">
            {Math.ceil(pvpCountdown / 1000)}
          </div>
          <p className="mt-4 text-xs tracking-widest text-zinc-500 uppercase">{selectedCourse.name}</p>
        </div>
      )}

      {gameState === 'pvp_spectate' && (
        <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center text-white bg-zinc-950 overflow-y-auto">
          <h1 className="mb-1 text-2xl text-fuchsia-400 uppercase tracking-widest">Spectating</h1>
          <p className="mb-6 text-xs tracking-widest text-zinc-500 uppercase">
            {selectedCourse.name} · live from the beacon board
          </p>
          <div className="w-full max-w-md p-4 border rounded border-zinc-800 bg-black/60 text-left">
            {pvpStandings.length === 0 && (
              <p className="text-xs text-zinc-600">Waiting for rider beacons…</p>
            )}
            {pvpStandings.map((s) => (
              <div key={s.userId} className="flex items-center justify-between py-1.5 text-xs border-b border-zinc-900 last:border-0">
                <span className="text-zinc-400">
                  <span className="inline-block w-6 text-zinc-600">{s.rank}.</span>
                  <span className="text-zinc-200 font-bold">{s.callsign}</span>
                  {s.stale && <span className="ml-2 text-[9px] text-red-400 uppercase">dropped</span>}
                </span>
                <span className="font-mono text-cyan-300">
                  {s.finished ? formatRaceTime(s.finishMs) : `${Math.round(s.progress * 100)}%`}
                </span>
              </div>
            ))}
          </div>
          {pvpMsg && <p className="mt-4 text-xs text-amber-300 max-w-md">{pvpMsg}</p>}
          <p className="mt-4 text-[11px] text-zinc-600">You race in the next heat.</p>
          <button
            onClick={leavePvp}
            className="flex items-center justify-center gap-2 px-8 py-2 mt-4 text-xs font-bold tracking-widest text-zinc-400 uppercase border border-zinc-800 rounded hover:border-zinc-500"
          >
            <LIcon name="x" size={14} />
            LEAVE
          </button>
          <div aria-hidden="true" className="player-clear shrink-0" />
        </div>
      )}

      {gameState === 'pvp_results' && (
        <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center text-white bg-zinc-950 overflow-y-auto">
          <h1 className="mb-1 text-3xl text-amber-400 drop-shadow-[0_0_20px_rgba(255,215,0,0.5)] uppercase tracking-widest">
            Race Results
          </h1>
          <p className="mb-6 text-xs tracking-widest text-zinc-500 uppercase">
            {selectedCourse.name} · {pvpCodeInput}
          </p>

          <div className="w-full max-w-md p-4 mb-2 border rounded border-amber-500/30 bg-black/60 text-left" style={lugePanelTile}>
            {!pvpOutcome && (
              <p className="text-xs text-zinc-500">Waiting for the field to finish…</p>
            )}
            {pvpOutcome && pvpOutcome.results.map((s) => (
              <div
                key={s.userId}
                className={`flex items-center justify-between py-1.5 text-xs border-b border-zinc-900 last:border-0 ${s.userId === userIdRef.current ? 'bg-amber-400/10 -mx-2 px-2 rounded' : ''}`}
              >
                <span className="text-zinc-400">
                  <span className="inline-block w-6 text-amber-300 font-bold">{s.rank}.</span>
                  <span className="text-zinc-100 font-bold">{s.callsign}{s.userId === userIdRef.current ? ' (you)' : ''}</span>
                </span>
                <span className="font-mono text-cyan-300">{formatRaceTime(s.finishMs)}</span>
              </div>
            ))}
            {pvpOutcome && pvpOutcome.dnfs.length > 0 && (
              <>
                <p className="mt-3 mb-1 text-[10px] tracking-widest text-zinc-600 uppercase">Did not finish</p>
                {pvpOutcome.dnfs.map((s) => (
                  <div key={s.userId} className="flex items-center justify-between py-1 text-[11px] text-zinc-600">
                    <span>{s.callsign}{s.userId === userIdRef.current ? ' (you)' : ''}{s.stale ? ' — dropped' : ''}</span>
                    <span className="font-mono">{Math.round(s.progress * 100)}%</span>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <button
              onClick={raceAgain}
              className="flex items-center justify-center gap-2 px-8 py-3 text-xs font-bold tracking-widest text-black uppercase bg-fuchsia-400 rounded hover:bg-white"
            >
              <LIcon name="replay" size={16} />
              RACE AGAIN
            </button>
            <button
              onClick={leavePvp}
              className="flex items-center justify-center gap-2 px-8 py-3 text-xs font-bold tracking-widest text-zinc-300 uppercase border border-zinc-700 rounded hover:border-zinc-400"
            >
              <LIcon name="x" size={16} />
              LEAVE RACE
            </button>
          </div>
          <div aria-hidden="true" className="player-clear shrink-0" />
        </div>
      )}

      {gameState === 'store' && (
        <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center text-white bg-zinc-950 overflow-y-auto">
          <h1 className="mb-2 text-3xl text-amber-400 drop-shadow-[0_0_15px_rgba(255,215,0,0.5)] uppercase tracking-widest">Premium Sled Store</h1>
          <p className="mb-8 text-sm tracking-widest text-zinc-400 uppercase">One pack. Everything in it. Yours forever.</p>

          <div className="w-full max-w-2xl p-8 border rounded border-amber-500/30 bg-black/50 text-left" style={lugePanelTile}>
            <div className="text-xl font-bold text-white uppercase tracking-widest mb-1">Complete Arsenal</div>
            <div className="text-3xl font-black text-amber-400 mb-6">
              {storeInfo.priceUsd != null ? `$${storeInfo.priceUsd}` : '…'}
              <span className="text-sm font-normal text-zinc-400"> one-time</span>
            </div>

            <ul className="text-sm text-zinc-300 space-y-3 mb-6">
              <li>All {storeInfo.premiumCount} premium sled hulls, unlocked in your garage right after payment.</li>
              <li>Each hull changes how your sled looks on the track.</li>
              <li>Free-hoodie reward: conquer all 20 courses with the Complete Arsenal and a physical Olympus hoodie is yours — free, one per rider. Only runs finished after the reward launched count.</li>
            </ul>

            <p className="text-xs text-zinc-500 mb-6">
              No subscription. No loot boxes. You pay once and the hulls are yours.
              The price is set on our server at checkout — what you see here is what you pay.
            </p>

            {storeError && <p className="text-sm text-red-400 mb-4">{storeError}</p>}

            {!ownsArsenal && storeInfo.priceUsd != null && (
              <div className="mb-4">
                <GoldCheckoutOption
                  totalCents={Math.round(storeInfo.priceUsd * 100)}
                  checked={useGold}
                  onToggle={setUseGold}
                />
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4">
              {ownsArsenal ? (
                <p className="text-sm font-bold text-emerald-300 uppercase tracking-widest py-3">You already own the Complete Arsenal.</p>
              ) : (
                <button
                  onClick={startCheckout}
                  disabled={checkoutBusy || storeInfo.priceUsd == null}
                  className="flex items-center justify-center gap-2 px-8 py-3 font-bold tracking-widest text-black uppercase bg-amber-400 rounded hover:bg-white disabled:opacity-50"
                >
                  <LIcon name="bag" size={18} />
                  {checkoutBusy ? 'Starting checkout…' : `Buy the arsenal — $${storeInfo.priceUsd ?? '…'}`}
                </button>
              )}
              <button
                onClick={() => setGameState('menu')}
                className="flex items-center justify-center gap-2 px-8 py-3 font-bold tracking-widest text-zinc-300 uppercase border border-zinc-700 rounded hover:border-zinc-400"
              >
                <LIcon name="home" size={18} />
                Back to garage
              </button>
              {/* Safari bottom-bar clearance */}
              <div aria-hidden="true" className="player-clear shrink-0" />
            </div>
          </div>
        </div>
      )}

      {gameState === 'pre_race_calibrate' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="flex flex-col items-center p-8 bg-zinc-950 border border-cyan-500/40 rounded-xl shadow-[0_0_40px_rgba(0,242,255,0.15)] max-w-md text-center">
            <h2 className="text-2xl font-black text-transparent uppercase bg-clip-text bg-gradient-to-r from-cyan-400 to-fuchsia-500 tracking-widest mb-4">GYRO CALIBRATION</h2>
            <p className="text-sm text-zinc-300 mb-6 leading-relaxed">
              Hold your device in a comfortable playing position.
              <br /><br />
              <span className="text-cyan-400 font-bold">TILT LEFT/RIGHT</span> to roll around the tube — floor, walls, ceiling, the whole 360°. <br />
              <span className="text-cyan-400 font-bold">TILT FORWARD</span> to accelerate. <br />
              <span className="text-fuchsia-500 font-bold">TILT BACKWARD</span> to brake.
            </p>
            <p className="text-xs text-zinc-500 mb-6">
              No gyroscope? Tap the left or right half of the screen to roll.
              On desktop, use the arrow keys.
            </p>
            <button
              onClick={requestTiltAccessAndStart}
              className="flex items-center justify-center gap-3 w-full px-8 py-4 text-sm font-bold tracking-widest text-black uppercase transition-all bg-cyan-400 rounded hover:bg-white hover:shadow-[0_0_20px_rgba(0,242,255,0.6)]"
            >
              <LIcon name="zap" size={20} />
              CALIBRATE &amp; IGNITE ENGINE
            </button>
          </div>
        </div>
      )}

      {gameState === 'racing' && (
        <div
          className="relative w-full h-full bg-black"
          onTouchStart={(e) => touchSteer(e.touches[0].clientX)}
          onTouchEnd={touchRelease}
        >
          <Canvas camera={{ position: [0, 0, 0], fov: 60 }} style={{ position: 'absolute', inset: 0 }} onCreated={sceneGuard.onCreated}>
            <color attach="background" args={['#020202']} />
            <fogExp2 attach="fog" args={['#020202', 0.005]} />
            <ambientLight intensity={0.5} />

            <LugeTrack
              key={selectedCourse.id}
              course={selectedCourse}
              sled={selectedSled}
              tiltData={tiltData}
              onFinish={handleFinish}
              onZoneFx={setZoneFx}
              pvp={
                gameState === 'racing' && pvpCodeInput && pvpMode === 'race'
                  ? { onProgress: handlePvpProgress, rivals: pvpRivals }
                  : null
              }
            />

            {/* Restrained bloom: glow stays local, textures stay readable. */}
            <EffectComposer>
              <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.2} intensity={0.7} />
            </EffectComposer>
          </Canvas>

          <div className="absolute top-5 left-5 bg-black/80 border border-cyan-500/50 p-4 rounded backdrop-blur text-left z-10 pointer-events-none">
            <div className="text-cyan-400 font-bold uppercase tracking-widest text-sm mb-1">{selectedCourse.name}</div>
            <div className="text-zinc-400 text-[10px] uppercase tracking-wider mb-2">SLED: {selectedSled.name}</div>
            <div className="text-white text-xs font-mono">LENGTH: {selectedCourse.length}M</div>
            <div className="text-white text-xs font-mono">TURNS: {selectedCourse.turns}</div>
          </div>

          {/* Live standings during a PvP race (absent in solo runs) */}
          {pvpCodeInput && pvpMode === 'race' && pvpStandings.length > 0 && (
            <div className="absolute top-24 right-5 z-10 w-40 p-2 rounded bg-black/60 border border-fuchsia-500/30 backdrop-blur-sm pointer-events-none">
              <p className="text-[9px] tracking-widest text-fuchsia-300 uppercase mb-1">Standings</p>
              {pvpStandings.slice(0, 8).map((s) => (
                <div
                  key={s.userId}
                  className={`flex items-center justify-between py-0.5 text-[10px] ${s.userId === userIdRef.current ? 'text-white font-bold' : 'text-zinc-400'}`}
                >
                  <span>
                    <span className="inline-block w-4 text-zinc-600">{s.rank}.</span>
                    {(s.callsign || '').slice(0, 10)}{s.userId === userIdRef.current ? ' ★' : ''}
                  </span>
                  <span className="font-mono">
                    {s.finished ? formatRaceTime(s.finishMs) : `${Math.round(s.progress * 100)}%`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {zoneFx === 'boost' && (
            <div className="absolute top-5 right-5 z-10 pointer-events-none px-4 py-2 rounded border border-cyan-300 bg-cyan-500/20 backdrop-blur">
              <span className="text-cyan-300 text-sm font-black tracking-[0.3em] uppercase">Boost</span>
            </div>
          )}
          {zoneFx === 'sand' && (
            <div className="absolute top-5 right-5 z-10 pointer-events-none px-4 py-2 rounded border border-amber-500 bg-amber-600/20 backdrop-blur">
              <span className="text-amber-400 text-sm font-black tracking-[0.3em] uppercase">Sand — drag</span>
            </div>
          )}

          <div className="absolute bottom-10 w-full text-center text-zinc-500 text-[10px] tracking-[0.3em] pointer-events-none z-10">
            TILT TO ROLL AROUND THE TUBE — OR TAP LEFT / RIGHT SIDE OF THE SCREEN.
          </div>
        </div>
      )}

      {gameState === 'podium' && (() => {
        const rewardEligible = !!(eligibility && eligibility.eligible && !redeemed);
        return (
        <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center text-white bg-zinc-950 overflow-y-auto">
          <h1 className="mb-2 text-4xl text-amber-400 drop-shadow-[0_0_20px_rgba(255,215,0,0.5)] uppercase tracking-widest">
            {rewardEligible ? 'REWARD UNLOCKED' : 'OLYMPUS CONQUERED'}
          </h1>
          <p className="mb-8 text-sm tracking-widest text-zinc-400 uppercase">
            {rewardEligible
              ? 'Every course. Every sled. The hoodie is yours.'
              : selectedCourse.id === FINAL_COURSE_ID
                ? 'You have survived all 20 descents.'
                : 'Another descent conquered.'}
          </p>
          {recordError && (
            <p className="mb-8 text-xs text-amber-300">{recordError}</p>
          )}

          <div className="w-full max-w-2xl p-8 border rounded border-amber-500/50 bg-black/60 shadow-[0_0_50px_rgba(255,215,0,0.1)]">
            {redeemed ? (
              <>
                <div className="mb-4 text-lg font-bold text-white uppercase tracking-widest">Hoodie claimed</div>
                <p className="text-sm text-zinc-400 mb-6">
                  This account already claimed its free hoodie — one per rider.
                  Merlin confirms every claim by hand before anything ships.
                </p>
              </>
            ) : rewardEligible ? (
              <>
                <div className="mb-4 text-lg font-bold text-white uppercase tracking-widest">Your free hoodie is waiting</div>
                <p className="text-sm text-zinc-300 mb-6 leading-relaxed">
                  You conquered all {eligibility.coursesTotal} courses with the Complete Arsenal
                  in your garage. Claim your physical Olympus hoodie in the store —
                  free, no charge, one per rider.
                </p>
                <Link
                  href="/store?reward=luge"
                  className="inline-block px-8 py-3 mb-6 font-bold tracking-widest text-black uppercase bg-amber-400 rounded hover:bg-white"
                >
                  CLAIM YOUR FREE HOODIE
                </Link>
              </>
            ) : (
              <>
                <div className="mb-4 text-lg font-bold text-white uppercase tracking-widest">The road to the hoodie</div>
                {eligibility && eligibility.provisioned ? (
                  <div className="text-sm text-zinc-300 mb-6 leading-relaxed space-y-2">
                    <p>Courses conquered: {eligibility.coursesCompleted} of {eligibility.coursesTotal}.</p>
                    <p>
                      {eligibility.arsenalComplete
                        ? 'Complete Arsenal: owned.'
                        : `Complete Arsenal: ${eligibility.premiumOwned} of ${eligibility.premiumTotal} sleds — the hoodie needs every one.`}
                    </p>
                    <p className="text-xs text-zinc-500">
                      Only runs finished after the reward launched count — earlier runs don&apos;t carry over.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400 mb-6">
                    Reward tracking is not connected yet. Your runs will count once it is — nothing is lost.
                  </p>
                )}
                {!ownsArsenal && (
                  <button
                    onClick={() => setGameState('store')}
                    className="flex items-center justify-center gap-2 px-6 py-2 mb-6 text-xs font-bold tracking-widest text-amber-400 uppercase border border-amber-400 rounded hover:bg-amber-400/20"
                  >
                    <LIcon name="bag" size={16} />
                    OPEN THE STORE
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => setGameState('menu')}
              className="flex items-center justify-center gap-3 w-full px-8 py-3 font-bold tracking-widest text-black uppercase bg-cyan-400 rounded hover:bg-white"
            >
              <LIcon name="home" size={18} />
              RETURN TO MENU
            </button>
            {/* Safari bottom-bar clearance */}
            <div aria-hidden="true" className="player-clear shrink-0" />
          </div>
        </div>
        );
      })}
    </>
  );
}
