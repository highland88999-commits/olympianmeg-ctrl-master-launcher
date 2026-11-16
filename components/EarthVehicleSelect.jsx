'use client';
// components/EarthVehicleSelect.jsx — the Earth 1 entry menu.
//
// VEHICLES ONLY (Merlin, 2026-11-15): on entering Earth 1 the
// user gets ONLY this menu — every roster vehicle listed WITH
// a live 3D preview of it. The entry is select + preview +
// spawn, nothing else: no search, no quick locations, no
// landmark list, no character pick, no craft summon keys.
//
// ALL VEHICLES KEEP THEIR EXISTING MODELS (Merlin, 2026-11-15):
// Mario Kart is the gameplay (orbs, torpedoes, boost pads,
// bumper-car smashing), NOT the look. No vehicle is remodeled,
// reskinned in shape, or swapped: the preview loads the real
// GLB for the selected craft through lib/earth/vehicle-model.js
// (the same loader EarthSupercar uses), never a faked preview
// image or a static picture standing in for the model. On a
// load failure the preview says so honestly ("Model failed to
// load — pick another vehicle") and the list still works.
//
// FLOW: step 1 picks the vehicle (the preview follows the
// selection); "Tap the Earth to spawn" calls onSelect(craftId)
// and collapses the menu to the step-2 banner, and the parent
// (app/page.jsx) switches the hub globe into pick mode — a tap
// on the Earth globe spawns the driver there, already in the
// selected vehicle. The globe click itself is wired by the
// parent (the globe is outside this menu); onSpawnPick is the
// parent's handler for it, listed here in the contract so the
// flow reads in one place. onPickModeChange tells the parent
// when the banner is up (globe clicks spawn) and when it is
// down again (globe clicks do their normal thing).
//
// OPEN MAP, NO TRACK (Merlin, 2026-11-15): there is no circuit,
// no laps, no start/finish — the driver spawns anywhere on the
// open planet and drives anywhere.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  listVehicles,
  getVehicle,
  boostTopSpeed,
  DEFAULT_CRAFT_ID,
} from '@/lib/earth/vehicles';
import {
  getVehicleModel,
  ensureVehicleModel,
  subscribeVehicleModel,
} from '@/lib/earth/vehicle-model';

// km/h the same way the in-drive HUD converts it
// (kartHud.speedKmh = speed × 3 m/s × 3.6): the menu number is
// the number the driver will actually see when boosting.
function topSpeedKmh(v) {
  return Math.round(boostTopSpeed(v) * 3 * 3.6);
}

// Slow turntable for the preview — the driver sees the real
// model from all sides before picking it.
function PreviewTurntable({ model }) {
  const ref = useRef();
  useFrame((state, rawDt) => {
    const g = ref.current;
    if (!g) return;
    g.rotation.y += Math.min(0.05, rawDt || 0.016) * 0.5;
  });
  const clone = useMemo(() => {
    if (!model) return null;
    // Clone, like EarthSupercar does: the cached original is
    // never attached anywhere, so the preview and the street
    // never fight over one scene. The clone shares the cached
    // geometries/materials — never disposed, just dropped.
    return model.scene.clone(true);
  }, [model]);
  if (!clone) return null;
  return (
    <group ref={ref} scale={model.scale} rotation-y={model.rotY} position-y={model.liftY * model.scale}>
      <primitive object={clone} />
    </group>
  );
}

function VehiclePreview({ craftId }) {
  const [model, setModel] = useState(() => getVehicleModel(craftId));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setModel(getVehicleModel(craftId));
    setFailed(false);
    // ensureVehicleModel caches null on failure (never a crash)
    // — a settled load with no model is the honest failure.
    void ensureVehicleModel(craftId).then(() => {
      if (!getVehicleModel(craftId)) setFailed(true);
    });
    const unsub = subscribeVehicleModel(({ id, model: m }) => {
      if (id === craftId) setModel(m);
    });
    return unsub;
  }, [craftId]);
  const craft = getVehicle(craftId);
  if (failed) {
    return (
      <div className="flex h-48 w-full items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 text-center text-[11px] text-zinc-400">
        Model failed to load — pick another vehicle.
      </div>
    );
  }
  if (!model) {
    return (
      <div className="flex h-48 w-full items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-[11px] text-zinc-500 animate-pulse">
        Loading {craft ? craft.name : 'vehicle'}…
      </div>
    );
  }
  return (
    <div className="h-48 w-full overflow-hidden rounded-lg border border-cyan-500/30 bg-zinc-900/60">
      {/* The preview Canvas carries its own minimal lights
          (ambient + one directional), confined to this box —
          it never touches the globe scene's lighting. */}
      <Canvas camera={{ position: [0, 2.2, 9], fov: 45 }} dpr={[1, 2]}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[5, 8, 5]} intensity={1.4} />
        <PreviewTurntable model={model} />
      </Canvas>
    </div>
  );
}

export default function EarthVehicleSelect({ onSelect, onCancel, onPickModeChange }) {
  const vehicles = listVehicles();
  const [selected, setSelected] = useState(DEFAULT_CRAFT_ID);
  const [step, setStep] = useState('select');
  const craft = getVehicle(selected);

  const enterPick = () => {
    onSelect(selected);
    setStep('pick');
    if (onPickModeChange) onPickModeChange(true);
  };
  const backToSelect = () => {
    setStep('select');
    if (onPickModeChange) onPickModeChange(false);
  };
  const cancel = () => {
    if (onPickModeChange) onPickModeChange(false);
    onCancel();
  };

  // Step 2: the menu collapses to a banner — the Earth globe
  // behind it is the spawn picker now.
  if (step === 'pick') {
    return (
      <div className="absolute inset-x-0 top-4 z-[90] flex justify-center pointer-events-none ui-element">
        <div className="pointer-events-auto w-[min(92vw,22rem)] rounded-xl border border-cyan-500/40 bg-zinc-950/95 p-4 shadow-[0_0_30px_rgba(0,242,255,0.15)]">
          <div className="text-sm font-black tracking-wide text-white">
            🌍 Tap the Earth to choose your spawn
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">
            {craft ? `${craft.emoji} ${craft.name}` : 'Your vehicle'} — you spawn where you tap, already driving.
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={backToSelect}
              className="flex-1 py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-300 border border-zinc-700 rounded hover:border-cyan-500/50 hover:text-white transition-all"
            >
              ← Back to vehicles
            </button>
            <button
              onClick={cancel}
              className="flex-1 py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-300 border border-zinc-700 rounded hover:border-red-500/50 hover:text-white transition-all"
            >
              ✕ Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-[90] flex items-center justify-center pointer-events-none ui-element">
      <div className="bg-zinc-950/95 border border-cyan-500/30 rounded-xl p-4 shadow-[0_0_30px_rgba(0,242,255,0.12)] flex flex-col max-h-[86dvh] overflow-hidden w-[min(92vw,22rem)] pointer-events-auto [transform:translateZ(0)]">
        <div className="shrink-0 border-b border-zinc-800 pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-black tracking-[0.25em] uppercase text-cyan-300">
              Choose your vehicle
            </div>
            <button
              onClick={cancel}
              aria-label="Cancel — back to hub"
              title="Cancel"
              className="w-9 h-9 shrink-0 rounded-full border border-zinc-700 text-zinc-400 hover:text-white hover:border-cyan-500/60 flex items-center justify-center text-base leading-none transition-all"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">
            Earth 1 is vehicles only — pick your ride, then tap the Earth to spawn.
          </div>
        </div>

        <div className="mt-3 shrink-0">
          <VehiclePreview craftId={selected} />
          {craft && (
            <div className="mt-2 text-center">
              <span className="text-sm font-black text-white">{craft.emoji} {craft.name}</span>
              <span className="text-[11px] text-zinc-400 ml-2">top {topSpeedKmh(craft)} km/h</span>
              <div className="text-[11px] text-zinc-500 mt-0.5">{craft.blurb}</div>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto custom-scrollbar pt-3">
          {vehicles.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelected(v.id)}
              aria-pressed={v.id === selected}
              className={`flex items-center gap-2 text-left px-2 py-1.5 rounded border transition-all ${
                v.id === selected
                  ? 'bg-cyan-950/70 border-cyan-500/60'
                  : 'bg-zinc-900/60 border-zinc-800 hover:border-cyan-500/40'
              }`}
            >
              <span aria-hidden="true" className="text-lg shrink-0">{v.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-bold text-zinc-100 truncate">{v.name}</span>
                <span className="block text-[10px] text-zinc-500 truncate">{v.blurb}</span>
              </span>
              <span className="text-[10px] font-bold tabular-nums text-cyan-300 shrink-0">
                {topSpeedKmh(v)} km/h
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={enterPick}
          className="mt-3 w-full py-2.5 text-[11px] font-bold tracking-[0.2em] uppercase text-cyan-100 border border-cyan-600/60 bg-cyan-950/50 rounded hover:border-cyan-400 hover:text-white transition-all"
        >
          🌍 Tap the Earth to spawn →
        </button>
      </div>
    </div>
  );
}
