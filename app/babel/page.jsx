'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Tower from '@/components/babel/Tower';
import FloorSylva from '@/components/babel/FloorSylva';
import FloorDuat from '@/components/babel/FloorDuat';
import FloorAvalon from '@/components/babel/FloorAvalon';
import FloorHermes from '@/components/babel/FloorHermes';
import WalkMode from '@/components/babel/WalkMode';
import AquariumViewport from '@/components/babel/AquariumViewport';
import { FLOORS, getFloor } from '@/lib/babel/floors';
import { GOLD_FOUND_EVENT } from '@/components/babel/SylvaGold';
import { DuatArenaProvider, DuatHUD, DuatToasts } from '@/components/babel/DuatArena';
import { DuatFireControls } from '@/components/babel/DuatCombat';
import ElevatorPanel from '@/components/babel/ElevatorPanel';
import TowerGoldBar from '@/components/babel/TowerGoldBar';
import { GOLDBAR_FOUND_EVENT } from '@/lib/babel/monthlyGold';
import { toggleCameraMode, prefersReducedMotion, isTouchDevice } from '@/lib/babel/walk';
import AphroIcon from '@/components/aphrodite/icons';
import { AphroVideoBg, aphroPanel } from '@/components/aphrodite/ambience';

const SCENES = {
  sylva: FloorSylva,
  duat: FloorDuat,
  avalon: FloorAvalon,
  hermes: FloorHermes,
};

// Orbit-camera defaults per view — walk mode restores these when it hands
// the camera back, so the orbit view is exactly as it was.
const ORBIT_CAM = {
  tower: { position: [30, 20, 36], target: [0, 20, 0] },
  scene: { position: [0, 9, 36], target: [0, 6, 0] },
};

// Touch joystick for walk mode. Writes normalized -1..1 into inputRef.joy.
function Joystick({ inputRef }) {
  const pid = useRef(null);
  const center = useRef({ x: 0, y: 0 });
  const knobRef = useRef(null);
  const baseRef = useRef(null);
  const R = 44;

  const setKnob = (dx, dy) => {
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const onDown = (e) => {
    if (pid.current !== null) return;
    pid.current = e.pointerId;
    const r = baseRef.current.getBoundingClientRect();
    center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e) => {
    if (e.pointerId !== pid.current) return;
    let dx = e.clientX - center.current.x;
    let dy = e.clientY - center.current.y;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    inputRef.current.joy = { x: dx / R, y: dy / R };
    setKnob(dx, dy);
  };
  const onUp = (e) => {
    if (e.pointerId !== pid.current) return;
    pid.current = null;
    inputRef.current.joy = { x: 0, y: 0 };
    setKnob(0, 0);
  };

  return (
    <div
      data-ui
      ref={baseRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className="absolute left-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] w-28 h-28 rounded-full border border-amber-500/40 bg-black/50 backdrop-blur-sm z-10"
      style={{ touchAction: 'none' }}
      aria-label="Walk joystick"
    >
      <div
        ref={knobRef}
        className="absolute left-1/2 top-1/2 -ml-7 -mt-7 w-14 h-14 rounded-full bg-amber-500/70 border border-amber-200/60"
      />
    </div>
  );
}

export default function BabelPage() {
  const router = useRouter();
  const [view, setView] = useState('tower'); // 'tower' or a scene floor id
  const [mode, setMode] = useState('orbit'); // 'orbit' | 'walk' — orbit is the untouched default
  const [showAquarium, setShowAquarium] = useState(false);
  const [fading, setFading] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [touch, setTouch] = useState(false);
  // Sylva (endless forest) extras: carried lantern on/off + gold-find toasts.
  const [lantern, setLantern] = useState(true);
  const [goldToast, setGoldToast] = useState(null);
  const goldToastTimer = useRef(null);

  // Shared walker state: the page shell writes input, WalkMode consumes it.
  const inputRef = useRef({
    pos: { x: 0, z: 34 },
    yaw: 0,
    pitch: 0,
    keys: { fwd: false, back: false, left: false, right: false },
    joy: { x: 0, y: 0 },
    look: { dx: 0, dy: 0 },
  });

  useEffect(() => {
    setReduced(prefersReducedMotion());
    setTouch(isTouchDevice());
  }, []);

  // Lantern preference persists across visits; default on.
  useEffect(() => {
    try {
      if (window.localStorage.getItem('babel-sylva-lantern') === 'off') setLantern(false);
    } catch {
      // private mode — lantern just defaults on
    }
  }, []);

  const toggleLantern = () => {
    setLantern((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('babel-sylva-lantern', next ? 'on' : 'off');
      } catch {
        // private mode — session-only toggle
      }
      return next;
    });
  };

  // L key toggles the lantern while walking the endless forest.
  useEffect(() => {
    if (mode !== 'walk' || view !== 'sylva') return;
    const onKey = (e) => {
      if (e.code === 'KeyL' && !e.repeat) toggleLantern();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, view]);

  // Gold-find toasts dispatched by the forest scene.
  useEffect(() => {
    const onFound = (e) => {
      const d = e.detail || {};
      setGoldToast(`✦ You found a gold piece (${d.found || 1}/${d.total || 2})`);
      if (goldToastTimer.current) clearTimeout(goldToastTimer.current);
      goldToastTimer.current = setTimeout(() => setGoldToast(null), 3500);
    };
    window.addEventListener(GOLD_FOUND_EVENT, onFound);
    return () => {
      window.removeEventListener(GOLD_FOUND_EVENT, onFound);
      if (goldToastTimer.current) clearTimeout(goldToastTimer.current);
    };
  }, []);

  // Monthly gold-bar toast (tower plaza).
  useEffect(() => {
    const onBar = () => {
      setGoldToast('✦ You found the monthly gold bar!');
      if (goldToastTimer.current) clearTimeout(goldToastTimer.current);
      goldToastTimer.current = setTimeout(() => setGoldToast(null), 3500);
    };
    window.addEventListener(GOLDBAR_FOUND_EVENT, onBar);
    return () => window.removeEventListener(GOLDBAR_FOUND_EVENT, onBar);
  }, []);

  // Deep link from the satellite menu: /babel?floor=<id> opens that floor's
  // programming directly. Scene floors set the view; the aquarium floor opens
  // the viewport. ('route' floors link straight to their route instead.)
  useEffect(() => {
    try {
      const fid = new URLSearchParams(window.location.search).get('floor');
      if (!fid) return;
      const floor = getFloor(fid);
      if (!floor) return;
      if (floor.kind === 'aquarium') setShowAquarium(true);
      else if (floor.kind === 'scene') setView(floor.id);
    } catch {
      // Malformed URL — stay on the tower view.
    }
  }, []);

  // WASD / arrow-key movement while in walk mode.
  useEffect(() => {
    if (mode !== 'walk') return;
    const map = {
      KeyW: 'fwd', ArrowUp: 'fwd',
      KeyS: 'back', ArrowDown: 'back',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
    };
    const onDown = (e) => {
      const k = map[e.code];
      if (!k) return;
      inputRef.current.keys[k] = true;
      if (e.code.startsWith('Arrow')) e.preventDefault();
    };
    const onUp = (e) => {
      const k = map[e.code];
      if (!k) return;
      inputRef.current.keys[k] = false;
    };
    const onBlur = () => {
      inputRef.current.keys = { fwd: false, back: false, left: false, right: false };
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      onBlur();
    };
  }, [mode]);

  // Drag-to-look (mouse or touch) while in walk mode. UI elements opt out
  // with data-ui so buttons and the joystick never rotate the camera.
  const dragId = useRef(null);
  const dragLast = useRef({ x: 0, y: 0 });
  const onPointerDown = (e) => {
    if (mode !== 'walk') return;
    if (e.target.closest('[data-ui]')) return;
    if (dragId.current !== null) return;
    dragId.current = e.pointerId;
    dragLast.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e) => {
    if (e.pointerId !== dragId.current) return;
    inputRef.current.look.dx += e.clientX - dragLast.current.x;
    inputRef.current.look.dy += e.clientY - dragLast.current.y;
    dragLast.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e) => {
    if (e.pointerId === dragId.current) dragId.current = null;
  };

  const rideElevator = (floorId) => {
    const floor = getFloor(floorId);
    if (!floor) return;
    if (floor.kind === 'route') {
      router.push(floor.route);
      return;
    }
    if (floor.kind === 'aquarium') {
      setShowAquarium(true);
      return;
    }
    // Scene floors: fade out, swap the universe, fade back in.
    // Walk mode resets — orbit stays the default view of every floor.
    const swap = () => {
      setMode('orbit');
      setView(floorId);
      setTimeout(() => setFading(false), 120);
    };
    if (reduced) {
      swap();
    } else {
      setFading(true);
      setTimeout(swap, 380);
    }
  };

  const goToTower = () => {
    const swap = () => {
      setMode('orbit');
      setView('tower');
      setTimeout(() => setFading(false), 120);
    };
    if (reduced) {
      swap();
    } else {
      setFading(true);
      setTimeout(swap, 380);
    }
  };

  const toggleMode = () => {
    const next = toggleCameraMode(mode);
    if (reduced) {
      // Instant, non-animated transition under reduced motion.
      setMode(next);
      return;
    }
    setFading(true);
    setTimeout(() => {
      setMode(next);
      setTimeout(() => setFading(false), 120);
    }, 280);
  };

  const Scene = SCENES[view];
  const activeFloor = view === 'tower' ? null : getFloor(view);
  const orbitCam = view === 'tower' ? ORBIT_CAM.tower : ORBIT_CAM.scene;

  const walkHint = touch
    ? 'Left stick walks — drag to look around'
    : 'WASD or arrow keys to walk — drag to look around';

  return (
    <div
      className="relative w-full h-full bg-black text-white select-none"
      style={mode === 'walk' ? { touchAction: 'none' } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* APHRODITE ambient tower art: behind the WebGL canvas, visible while
          the scene mounts and through the transition veil. */}
      <AphroVideoBg
        video="/images/aphrodite/babel-loop.mp4"
        still="/images/aphrodite/babel-still.jpg"
        storageKey="babel-bg"
        opacity={0.55}
        toggleStyle={{ right: 16, left: 'auto', top: 76, bottom: 'auto' }}
      />
      {/* Single DuatArenaProvider for the whole page: the in-Canvas arena
          stage (FloorDuat) and the DOM overlays below share one gameRef.
          DOM overlays must live OUTSIDE <Canvas> — R3F throws
          "not part of the THREE namespace" on divs inside it. */}
      <DuatArenaProvider inputRef={inputRef}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={view === 'tower' ? { position: [30, 20, 36], fov: 50 } : { position: [0, 9, 36], fov: 55 }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          {view === 'tower' ? (
            <>
              <Tower onSelectFloor={rideElevator} />
              <TowerGoldBar inputRef={inputRef} walkMode={mode === 'walk'} />
              {mode === 'walk' ? (
                <WalkMode view={view} inputRef={inputRef} orbitCamera={orbitCam} />
              ) : (
                <OrbitControls
                  target={[0, 20, 0]}
                  autoRotate
                  autoRotateSpeed={0.5}
                  minDistance={18}
                  maxDistance={90}
                  maxPolarAngle={Math.PI / 2.05}
                  enablePan={false}
                />
              )}
            </>
          ) : (
            Scene && (
              <>
                <Scene inputRef={inputRef} walkMode={mode === 'walk'} lanternOn={lantern} />
                {mode === 'walk' ? (
                  <WalkMode view={view} inputRef={inputRef} orbitCamera={orbitCam} />
                ) : (
                  // NOTE (crash fix 2026-10-01): React reuses this OrbitControls
                  // fiber across the tower<->scene swap (same Fragment position),
                  // so R3F updates the drei <primitive> in place. R3F restores a
                  // REMOVED prop by calling `new OrbitControls()` with no camera,
                  // which throws on `this.object.position`. Keep the prop SHAPE
                  // identical to the tower branch — never let a prop disappear.
                  <OrbitControls
                    target={[0, 6, 0]}
                    autoRotate={false}
                    autoRotateSpeed={0.5}
                    minDistance={10}
                    maxDistance={80}
                    maxPolarAngle={Math.PI / 2.05}
                    enablePan={false}
                  />
                )}
              </>
            )
          )}
        </Suspense>
      </Canvas>

      {/* duat arena DOM overlays — walk mode only; the in-Canvas director
          gates the match on walkMode, and orbit stays chrome-free */}
      {view === 'duat' && mode === 'walk' && (
        <>
          <DuatHUD />
          <DuatToasts />
          <DuatFireControls walkMode={mode === 'walk'} />
        </>
      )}

      {/* fade veil for elevator rides and camera-mode switches — styled
          transition state with tower art instead of a black flash */}
      <div
        className={`absolute inset-0 pointer-events-none ${reduced ? '' : 'transition-opacity duration-300'} ${fading ? 'opacity-100' : 'opacity-0'}`}
      >
        <img src="/images/aphrodite/babel-still.jpg" alt="" aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/55" />
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-rose-200/90 text-sm font-bold tracking-[0.4em] uppercase drop-shadow-[0_0_16px_rgba(244,114,182,0.5)]">
            ✦ Travelling ✦
          </p>
        </div>
      </div>

      {/* header */}
      <div className="absolute top-0 left-0 right-0 p-4 sm:p-6 pointer-events-none">
        <h1 className="text-2xl sm:text-3xl font-black tracking-[0.25em] text-amber-200 uppercase drop-shadow-[0_0_18px_rgba(212,162,78,0.45)]">
          Babel
        </h1>
        <p className="text-zinc-400 text-xs sm:text-sm mt-1">
          {activeFloor ? `${activeFloor.name} — ${activeFloor.subtitle}` : 'Tower of pocket universes'}
        </p>
        {activeFloor && (
          <p className="text-zinc-500 text-xs mt-1 max-w-md italic">{activeFloor.mythos}</p>
        )}
      </div>

      {/* back to tower */}
      {view !== 'tower' && (
        <button
          data-ui
          onClick={goToTower}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 min-h-[44px] px-5 rounded border border-amber-500/40 text-amber-200 text-sm font-bold tracking-widest uppercase hover:bg-amber-500/20 transition-all inline-flex items-center gap-2"
        >
          <AphroIcon name="tower" size={16} /> Tower
        </button>
      )}

      {/* camera-mode toggle: orbit is the untouched default; walk is opt-in */}
      <button
        data-ui
        onClick={toggleMode}
        className="absolute bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 sm:right-6 z-10 min-h-[44px] px-5 rounded border border-amber-500/40 text-amber-200 text-sm font-bold tracking-widest uppercase hover:bg-amber-500/20 transition-all bg-black/60 inline-flex items-center gap-2"
      >
        <AphroIcon name={mode === 'walk' ? 'orbit' : 'walk'} size={16} />
        {mode === 'walk' ? 'Orbit view' : 'Walk mode'}
      </button>

      {/* lantern toggle — endless forest walk mode only */}
      {view === 'sylva' && mode === 'walk' && (
        <button
          data-ui
          onClick={toggleLantern}
          aria-label={lantern ? 'Turn lantern off' : 'Turn lantern on'}
          className="absolute bottom-[calc(8rem+env(safe-area-inset-bottom))] right-4 sm:right-6 z-10 min-h-[44px] px-5 rounded border border-amber-500/40 text-amber-200 text-sm font-bold tracking-widest uppercase hover:bg-amber-500/20 transition-all bg-black/60 inline-flex items-center gap-2"
        >
          <AphroIcon name="flame" size={16} /> {lantern ? 'Lantern on' : 'Lantern off'}
        </button>
      )}

      {/* touch joystick (walk mode, touch devices) */}
      {mode === 'walk' && touch && <Joystick inputRef={inputRef} />}

      {/* elevator panel — collapsible; orbit view only so walk mode stays clean */}
      {view === 'tower' && mode === 'orbit' && (
        <ElevatorPanel floors={FLOORS} onSelect={rideElevator} reduced={reduced} />
      )}

      {/* floor hint — lifted above the fixed radio bar; stays tucked behind the
          elevator panel when the panel is showing (its original position) */}
      <div className={`absolute ${view === 'tower' && mode === 'orbit' ? 'bottom-[max(0.75rem,env(safe-area-inset-bottom))]' : 'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]'} left-0 right-0 text-center pointer-events-none`}>
        <p className="text-zinc-500 text-[11px] tracking-widest uppercase">
          {mode === 'walk'
            ? walkHint
            : view === 'tower'
              ? 'Orbit view — switch to Walk mode to explore on foot'
              : 'Drag to look around'}
        </p>
      </div>

      {/* gold-find toast */}
      {goldToast && (
        <div className="absolute bottom-[calc(11.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <p className="px-5 py-2.5 rounded-full border border-amber-300/50 bg-black/70 text-amber-200 text-sm font-bold tracking-widest whitespace-nowrap shadow-[0_0_24px_rgba(212,162,78,0.35)]">
            {goldToast}
          </p>
        </div>
      )}

      {showAquarium && <AquariumViewport onClose={() => setShowAquarium(false)} />}
      </DuatArenaProvider>
    </div>
  );
}
