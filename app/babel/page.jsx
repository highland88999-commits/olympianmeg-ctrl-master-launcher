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
import { toggleCameraMode, prefersReducedMotion, isTouchDevice } from '@/lib/babel/walk';

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
      className="absolute left-4 bottom-[max(1rem,env(safe-area-inset-bottom))] w-28 h-28 rounded-full border border-amber-500/40 bg-black/50 backdrop-blur-sm z-10"
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
                <Scene />
                {mode === 'walk' ? (
                  <WalkMode view={view} inputRef={inputRef} orbitCamera={orbitCam} />
                ) : (
                  <OrbitControls
                    target={[0, 6, 0]}
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

      {/* fade veil for elevator rides and camera-mode switches */}
      <div
        className={`absolute inset-0 bg-black pointer-events-none ${reduced ? '' : 'transition-opacity duration-300'} ${fading ? 'opacity-100' : 'opacity-0'}`}
      />

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
          className="absolute top-4 right-4 sm:top-6 sm:right-6 min-h-[44px] px-5 rounded border border-amber-500/40 text-amber-200 text-sm font-bold tracking-widest uppercase hover:bg-amber-500/20 transition-all"
        >
          Tower
        </button>
      )}

      {/* camera-mode toggle: orbit is the untouched default; walk is opt-in */}
      <button
        data-ui
        onClick={toggleMode}
        className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-4 sm:right-6 z-10 min-h-[44px] px-5 rounded border border-amber-500/40 text-amber-200 text-sm font-bold tracking-widest uppercase hover:bg-amber-500/20 transition-all bg-black/60"
      >
        {mode === 'walk' ? 'Orbit view' : 'Walk mode'}
      </button>

      {/* touch joystick (walk mode, touch devices) */}
      {mode === 'walk' && touch && <Joystick inputRef={inputRef} />}

      {/* elevator panel — orbit view only, so the mobile layout stays clean in walk mode */}
      {view === 'tower' && mode === 'orbit' && (
        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-2xl mx-auto rounded-xl border border-amber-500/25 bg-black/60 backdrop-blur-md p-3 sm:p-4">
            <p className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 uppercase mb-2 text-center">
              Elevator — choose a floor
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {FLOORS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => rideElevator(f.id)}
                  className="min-h-[52px] px-3 py-2 rounded-lg border text-left transition-all hover:scale-[1.02]"
                  style={{ borderColor: `${f.accent}55`, background: `${f.accent}14` }}
                >
                  <span className="block text-sm font-black tracking-widest uppercase" style={{ color: f.accent }}>
                    {f.name}
                  </span>
                  <span className="block text-[10px] text-zinc-400 mt-0.5">{f.subtitle}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* floor hint */}
      <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-0 right-0 text-center pointer-events-none">
        <p className="text-zinc-500 text-[11px] tracking-widest uppercase">
          {mode === 'walk'
            ? walkHint
            : view === 'tower'
              ? 'Orbit view — switch to Walk mode to explore on foot'
              : 'Drag to look around'}
        </p>
      </div>

      {showAquarium && <AquariumViewport onClose={() => setShowAquarium(false)} />}
    </div>
  );
}
