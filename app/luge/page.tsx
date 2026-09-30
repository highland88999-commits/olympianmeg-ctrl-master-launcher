// @ts-nocheck
/* eslint-disable */
'use client';
import { useEffect, useState, useRef, useMemo } from 'react';
import { BackButton } from '@/components/ui';
import Link from 'next/link';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { supabase } from '@/lib/supabase';
import { LUGE_COURSES, LUGE_SLEDS, LUGE_PREMIUM_IDS, LUGE_PREMIUM_COUNT } from '@/lib/luge_data';
import GoldCheckoutOption from '@/components/economy/GoldCheckoutOption';
import { fx, unlockFx } from '@/lib/fx';

// ==========================================
// 3D TRACK & PHYSICS ENGINE
// ==========================================
function LugeTrack({ course, sled, tiltData, onFinish }) {
  const { camera } = useThree();
  const sledRef = useRef(null);

  const [trackTex, setTrackTex] = useState(null);
  const [hullTex, setHullTex] = useState(null);
  const progress = useRef(0);
  const speed = useRef(0);
  const playerX = useRef(0); // Horizontal track offset

  const baseMaxSpeed = 150 + (course.turns * 8);

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

    // Auto-accelerate slightly if neutral, clamp limits
    if (speed.current < baseMaxSpeed && tiltAccel <= 0) speed.current += delta * 40;
    speed.current = THREE.MathUtils.clamp(speed.current, 20, baseMaxSpeed * 1.5);

    progress.current += (speed.current * delta) / course.length;

    if (progress.current >= 0.999) {
      onFinish();
      return;
    }

    const safeProgress = Math.min(progress.current, 0.999);
    const pos = curve.getPointAt(safeProgress);
    const tangent = curve.getTangentAt(safeProgress);
    const lookAtPos = curve.getPointAt(Math.min(safeProgress + 0.02, 1.0));

    const roll = tangent.x * Math.PI * 1.2;
    const up = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), roll);
    const down = up.clone().negate();
    const right = new THREE.Vector3().crossVectors(tangent, up).normalize();

    // TILT PHYSICS: Steering (Gamma)
    // tilt.x is -1 (left) to 1 (right)
    const targetX = tiltData.current.x * 14; // Max drift is 14 units left/right
    playerX.current = THREE.MathUtils.lerp(playerX.current, targetX, delta * 5);

    if (sledRef.current) {
      // Apply pos, tangent, down, AND horizontal steering (right * playerX)
      sledRef.current.position.copy(pos).addScaledVector(tangent, 15).addScaledVector(down, 8.5).addScaledVector(right, playerX.current);
      const sledMatrix = new THREE.Matrix4().lookAt(sledRef.current.position, sledRef.current.position.clone().add(tangent), up);
      sledRef.current.quaternion.setFromRotationMatrix(sledMatrix);
    }

    // Camera physically tracks the sled's horizontal drift
    const camPos = pos.clone().addScaledVector(up, -2).addScaledVector(right, playerX.current * 0.5);
    camera.position.copy(camPos);
    camera.up.copy(up);
    camera.lookAt(lookAtPos.addScaledVector(right, playerX.current * 0.5));

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
  const [mounted, setMounted] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [cloudOffline, setCloudOffline] = useState(false);

  // States: 'menu', 'store', 'pre_race_calibrate', 'racing', 'podium'
  const [gameState, setGameState] = useState('menu');

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

  // Hardware Tilt Refs
  const tiltData = useRef({ x: 0, y: 0 }); // Normalized -1 to 1
  const baselineBeta = useRef(40); // Standard holding angle
  const tokenRef = useRef('');
  const raceStartRef = useRef(0); // Wall-clock ms when the current run began

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
      setAuthed(true);
      setMounted(true);
      await refreshInventory();
      await refreshEligibility();

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

  // Request iOS Gyroscope Permissions & Start Listener
  const requestTiltAccessAndStart = async () => {
    unlockFx(); // starting is a gesture: make sure FX is live
    fx.tap(); // ignition confirmed
    const start = () => {
      window.addEventListener('deviceorientation', handleOrientation);
      window.addEventListener('keydown', handleKeys);
      raceStartRef.current = Date.now();
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
    fx.gameWin(); // crossed the finish line: full fanfare
    window.removeEventListener('deviceorientation', handleOrientation);
    window.removeEventListener('keydown', handleKeys);
    tiltData.current = { x: 0, y: 0 };

    // Record the run server-side (anti-cheat validated there). A failed
    // recording never blocks the game — the run still happened.
    let freshEligibility = eligibility;
    try {
      const runMs = Math.max(1, Date.now() - (raceStartRef.current || Date.now()));
      await fetch('/api/luge/complete', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: selectedCourse.id,
          runMs,
          sledId: selectedSled.id,
        }),
      });
      const res = await fetch('/api/luge/eligibility', { headers: authHeaders() });
      const data = await res.json();
      if (data && data.ok) {
        setEligibility(data);
        freshEligibility = data;
      }
    } catch {
      // Offline or unprovisioned — the podium still works off this finish.
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
    <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center text-white bg-zinc-950">
      <h1 className="mb-2 text-4xl text-cyan-400 uppercase tracking-widest">Cyberpunk Luge</h1>
      <p className="mb-4 text-sm font-bold tracking-widest text-amber-400 uppercase">Cloud features are offline</p>
      <p className="max-w-md mb-8 text-sm text-zinc-400">
        This page needs the database connection. Check back once the cloud is connected.
      </p>
      <BackButton label="Go to the hub" />
    </div>
  );

  if (!authed) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center text-white bg-zinc-950">
        <h1 className="mb-2 text-4xl text-cyan-400 uppercase tracking-widest">Cyberpunk Luge</h1>
        <p className="mb-8 text-sm tracking-widest text-zinc-400 uppercase">Sign in to ride</p>
        <p className="max-w-md mb-8 text-sm text-zinc-400">
          Your garage, your hulls, and your hoodie claim all live on your account.
          Sign in at the master hub, then come back here.
        </p>
      <BackButton label="Go to the hub" />
      </div>
    );
  }

  return (
    <>
      <BackButton label="EXIT MATRIX" />

      {gameState === 'menu' && (
        <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center text-white bg-zinc-950">
          <h1 className="mb-2 text-4xl text-cyan-400 drop-shadow-[0_0_15px_rgba(0,242,255,0.5)] uppercase tracking-widest">Cyberpunk Luge</h1>
          <p className="mb-2 text-sm tracking-widest text-zinc-500 uppercase">Neon Descent Engine</p>
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

          <div className="flex w-full max-w-5xl gap-8 h-[60vh]">
            <div className="flex flex-col flex-1 p-4 overflow-y-auto border rounded border-cyan-500/30 bg-black/50 custom-scrollbar">
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

            <div className="flex flex-col flex-1 p-4 overflow-y-auto border rounded border-fuchsia-500/30 bg-black/50 custom-scrollbar">
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
                    {locked && (
                      <div className="text-[10px] text-zinc-500 mt-1">Part of the Complete Arsenal — tap to view the store.</div>
                    )}
                  </div>
                );
              })}
              <button
                onClick={() => setGameState('store')}
                className="w-full py-3 mt-4 text-xs font-bold tracking-widest text-black uppercase transition-all bg-amber-400 rounded hover:bg-white"
              >
                OPEN PREMIUM STORE
              </button>
              {/* Safari bottom-bar clearance */}
              <div aria-hidden="true" className="player-clear shrink-0" />
            </div>
          </div>

          <button
            onClick={() => setGameState('pre_race_calibrate')}
            className="px-12 py-4 mt-8 text-lg font-bold text-black uppercase transition-all bg-cyan-400 rounded-full hover:bg-white hover:shadow-[0_0_30px_rgba(0,242,255,0.6)] tracking-widest"
          >
            INITIATE DESCENT
          </button>
        </div>
      )}

      {gameState === 'store' && (
        <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center text-white bg-zinc-950 overflow-y-auto">
          <h1 className="mb-2 text-3xl text-amber-400 drop-shadow-[0_0_15px_rgba(255,215,0,0.5)] uppercase tracking-widest">Premium Sled Store</h1>
          <p className="mb-8 text-sm tracking-widest text-zinc-400 uppercase">One pack. Everything in it. Yours forever.</p>

          <div className="w-full max-w-2xl p-8 border rounded border-amber-500/30 bg-black/50 text-left">
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
                  className="px-8 py-3 font-bold tracking-widest text-black uppercase bg-amber-400 rounded hover:bg-white disabled:opacity-50"
                >
                  {checkoutBusy ? 'Starting checkout…' : `Buy the arsenal — $${storeInfo.priceUsd ?? '…'}`}
                </button>
              )}
              <button
                onClick={() => setGameState('menu')}
                className="px-8 py-3 font-bold tracking-widest text-zinc-300 uppercase border border-zinc-700 rounded hover:border-zinc-400"
              >
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
              <span className="text-cyan-400 font-bold">TILT LEFT/RIGHT</span> to steer. <br />
              <span className="text-cyan-400 font-bold">TILT FORWARD</span> to accelerate. <br />
              <span className="text-fuchsia-500 font-bold">TILT BACKWARD</span> to brake.
            </p>
            <p className="text-xs text-zinc-500 mb-6">
              No gyroscope? Tap the left or right half of the screen to steer.
              On desktop, use the arrow keys.
            </p>
            <button
              onClick={requestTiltAccessAndStart}
              className="w-full px-8 py-4 text-sm font-bold tracking-widest text-black uppercase transition-all bg-cyan-400 rounded hover:bg-white hover:shadow-[0_0_20px_rgba(0,242,255,0.6)]"
            >
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
          <Canvas camera={{ position: [0, 0, 0], fov: 60 }} style={{ position: 'absolute', inset: 0 }}>
            <color attach="background" args={['#020202']} />
            <fogExp2 attach="fog" args={['#020202', 0.005]} />
            <ambientLight intensity={0.5} />

            <LugeTrack
              key={selectedCourse.id}
              course={selectedCourse}
              sled={selectedSled}
              tiltData={tiltData}
              onFinish={handleFinish}
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

          <div className="absolute bottom-10 w-full text-center text-zinc-500 text-[10px] tracking-[0.3em] pointer-events-none z-10">
            TILT TO STEER — OR TAP LEFT / RIGHT SIDE OF THE SCREEN.
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
                    className="px-6 py-2 mb-6 text-xs font-bold tracking-widest text-amber-400 uppercase border border-amber-400 rounded hover:bg-amber-400/20"
                  >
                    OPEN THE STORE
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => setGameState('menu')}
              className="w-full px-8 py-3 font-bold tracking-widest text-black uppercase bg-cyan-400 rounded hover:bg-white"
            >
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
