'use client';
import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Tower from '@/components/babel/Tower';
import FloorSylva from '@/components/babel/FloorSylva';
import FloorDuat from '@/components/babel/FloorDuat';
import FloorAvalon from '@/components/babel/FloorAvalon';
import FloorHermes from '@/components/babel/FloorHermes';
import AquariumViewport from '@/components/babel/AquariumViewport';
import { FLOORS, getFloor } from '@/lib/babel/floors';

const SCENES = {
  sylva: FloorSylva,
  duat: FloorDuat,
  avalon: FloorAvalon,
  hermes: FloorHermes,
};

export default function BabelPage() {
  const router = useRouter();
  const [view, setView] = useState('tower'); // 'tower' or a scene floor id
  const [showAquarium, setShowAquarium] = useState(false);
  const [fading, setFading] = useState(false);

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
    setFading(true);
    setTimeout(() => {
      setView(floorId);
      setTimeout(() => setFading(false), 120);
    }, 380);
  };

  const goToTower = () => {
    setFading(true);
    setTimeout(() => {
      setView('tower');
      setTimeout(() => setFading(false), 120);
    }, 380);
  };

  const Scene = SCENES[view];
  const activeFloor = view === 'tower' ? null : getFloor(view);

  return (
    <div className="relative w-full h-full bg-black text-white select-none">
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
              <OrbitControls
                target={[0, 20, 0]}
                autoRotate
                autoRotateSpeed={0.5}
                minDistance={18}
                maxDistance={90}
                maxPolarAngle={Math.PI / 2.05}
                enablePan={false}
              />
            </>
          ) : (
            Scene && (
              <>
                <Scene />
                <OrbitControls
                  target={[0, 6, 0]}
                  minDistance={10}
                  maxDistance={80}
                  maxPolarAngle={Math.PI / 2.05}
                  enablePan={false}
                />
              </>
            )
          )}
        </Suspense>
      </Canvas>

      {/* fade veil for elevator rides */}
      <div
        className={`absolute inset-0 bg-black pointer-events-none transition-opacity duration-300 ${fading ? 'opacity-100' : 'opacity-0'}`}
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
          onClick={goToTower}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 min-h-[44px] px-5 rounded border border-amber-500/40 text-amber-200 text-sm font-bold tracking-widest uppercase hover:bg-amber-500/20 transition-all"
        >
          Tower
        </button>
      )}

      {/* elevator panel */}
      {view === 'tower' && (
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
      {view !== 'tower' && (
        <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-0 right-0 text-center pointer-events-none">
          <p className="text-zinc-500 text-[11px] tracking-widest uppercase">Drag to look around</p>
        </div>
      )}

      {showAquarium && <AquariumViewport onClose={() => setShowAquarium(false)} />}
    </div>
  );
}
