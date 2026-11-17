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
import { DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import VehicleSelectMenu from '@/components/world/VehicleSelectMenu';
import OrbButton, { OrbLabel } from '@/components/world/OrbButton';
import { earthVehicleOptions } from '@/lib/world/vehicle-select';

// The preview box is ~2 hub units across at the camera's depth,
// but prepareModel scales a 4.5 m car to ~0.07 hub units — the
// car read as ~1% of the frame and the box looked black (round
// 1 diagnosis, still live Nov 15). The turntable group is
// scaled back up so the model reads ~2 units long in the box,
// and the camera is pulled in to match — the real GLB, framed
// from its rendered size. Lift scales with it so the car keeps
// sitting on the box floor.
function previewFitScale(craft) {
  if (!craft || !craft.lengthM) return 1;
  return 2 / (craft.lengthM * DISPLAY_UNITS_PER_METRE);
}

// km/h the same way the in-drive HUD converts it
// (kartHud.speedKmh = speed × 3 m/s × 3.6): the menu number is
// the number the driver will actually see when boosting.
function topSpeedKmh(v) {
  return Math.round(boostTopSpeed(v) * 3 * 3.6);
}

// Slow turntable for the preview — the driver sees the real
// model from all sides before picking it.
function PreviewTurntable({ model, fitScale = 1 }) {
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
    <group ref={ref} scale={model.scale * fitScale} rotation-y={model.rotY} position-y={model.liftY * model.scale * fitScale}>
      <primitive object={clone} />
    </group>
  );
}

function VehiclePreview({ craftId }) {
  const [model, setModel] = useState(() => getVehicleModel(craftId));
  const [failed, setFailed] = useState(false);
  // Sticky preview (Merlin, 2026-11-16 — Earth 1 video: every
  // swipe blanked to "Loading…" for 1–2 s while the next GLB
  // downloaded). The last shown model stays on the turntable
  // until the new one arrives — a swipe never blanks the box.
  // The loading line survives as a small chip over the old car,
  // and as the full box only when nothing has shown yet.
  const prevModelRef = useRef(model);
  useEffect(() => {
    const cached = getVehicleModel(craftId);
    setModel(cached);
    setFailed(false);
    if (cached) {
      prevModelRef.current = cached;
      return undefined;
    }
    // ensureVehicleModel caches null on failure (never a crash)
    // — a settled load with no model is the honest failure.
    let alive = true;
    void ensureVehicleModel(craftId).then(() => {
      if (alive && !getVehicleModel(craftId)) setFailed(true);
    });
    const unsub = subscribeVehicleModel(({ id, model: m }) => {
      if (id === craftId && m) {
        prevModelRef.current = m;
        setModel(m);
      }
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [craftId]);
  const craft = getVehicle(craftId);
  // The model on screen: this craft's, or the last one shown
  // while the next still downloads. Nothing to show yet on the
  // very first load — the honest loading line stands alone.
  const shown = model || prevModelRef.current;
  if (failed && !shown) {
    return (
      <div className="flex h-48 w-full items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 text-center text-[11px] text-zinc-400">
        Model failed to load — pick another vehicle.
      </div>
    );
  }
  if (!shown) {
    return (
      <div className="flex h-48 w-full items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-[11px] text-zinc-500 animate-pulse">
        Loading {craft ? craft.name : 'vehicle'}…
      </div>
    );
  }
  const loadingNext = !model && !failed;
  const failedNext = !model && failed;
  return (
    <div className="relative h-48 w-full overflow-hidden rounded-lg border border-cyan-500/30" style={{ background: 'linear-gradient(180deg, #4a4f5c 0%, #262932 100%)' }}>
      {/* Preview lighting (Merlin, 2026-11-16 — Earth 1 video:
          black cars were nearly invisible against the black box:
          one dim key light + a near-black background). Brighter
          ambient, a second fill light from the opposite side, a
          lighter box and a floor disc under the car, so black
          paint reads against the box. The camera stays pulled in
          at [0, 1.2, 6] (round 2 pin) — the ~2-unit fitted model
          still fills the frame. */}
      <Canvas camera={{ position: [0, 1.2, 6], fov: 45 }} dpr={[1, 2]}>
        <ambientLight intensity={2.0} />
        <directionalLight position={[5, 8, 5]} intensity={2.2} />
        <directionalLight position={[-6, 3, -5]} intensity={1.0} />
        <mesh rotation-x={-Math.PI / 2} position-y={0}>
          <circleGeometry args={[1.7, 48]} />
          <meshBasicMaterial color="#2e323c" />
        </mesh>
        <PreviewTurntable model={shown} fitScale={previewFitScale(craft)} />
      </Canvas>
      {loadingNext && (
        <div className="absolute left-2 top-2 z-10 rounded-full border border-cyan-500/40 bg-zinc-950/85 px-2.5 py-1 text-[10px] text-zinc-300 animate-pulse">
          Loading {craft ? craft.name : 'vehicle'}…
        </div>
      )}
      {failedNext && (
        <div className="absolute left-2 top-2 z-10 rounded-full border border-red-500/40 bg-zinc-950/85 px-2.5 py-1 text-[10px] text-zinc-300">
          Model failed to load — pick another vehicle.
        </div>
      )}
    </div>
  );
}

export default function EarthVehicleSelect({ onSelect, onCancel, onPickModeChange }) {
  const vehicles = listVehicles();
  const [selected, setSelected] = useState(DEFAULT_CRAFT_ID);
  const [step, setStep] = useState('select');
  const craft = getVehicle(selected);

  // Background preload (Merlin, 2026-11-16 — Earth 1 video: every
  // swipe waited 1–2 s on a cold GLB download). The neighbours of
  // the current pick load on every selection change, and a slow
  // sequential sweep walks the rest of the roster once — one GLB
  // at a time, so the phone never juggles 19 parallel downloads.
  // The loader caches per session, so the street drive reuses
  // every model warmed here.
  useEffect(() => {
    const idx = vehicles.findIndex((v) => v.id === selected);
    [vehicles[idx], vehicles[idx + 1], vehicles[idx - 1]].forEach((v) => {
      if (v) void ensureVehicleModel(v.id);
    });
  }, [selected, vehicles]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const v of vehicles) {
        if (cancelled) return;
        try {
          await ensureVehicleModel(v.id);
        } catch {
          /* a failed model stays absent; the sweep walks on */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vehicles]);

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
          {/* Circle Orb Controls Law (Merlin, Nov 16 — standing):
              the spawn sheet's two controls are plain circular
              OrbButton orbs, never rectangles. BACK wears no
              function face (it returns to the vehicle list, not
              the hub); CANCEL wears the shared close face. */}
          <div className="mt-3 flex items-start justify-center gap-6">
            <OrbButton ariaLabel="Back to vehicles" title="Back to vehicles" onClick={backToSelect}>
              <span aria-hidden="true" className="text-xl leading-none">←</span>
              <OrbLabel>BACK</OrbLabel>
            </OrbButton>
            <OrbButton fn="close" ariaLabel="Cancel — back to hub" title="Cancel" onClick={cancel}>
              <OrbLabel>CLOSE</OrbLabel>
            </OrbButton>
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

        {/* VEHICLE SELECTION MENU (Merlin, Nov 16 ~03:49 — workstream
            E): the roster is picked with circle orbs, each wearing
            a graphic of THAT vehicle, no words on the orbs. The
            picked name / speed / blurb still show above (the
            preview block), and the spawn step is unchanged — the
            orb only SELECTS; "Tap the Earth to spawn" still
            starts the globe pick. One shared menu, not a second
            selector: the list rows this replaced were the old
            rectangular picker. */}
        <div className="flex min-h-0 flex-col overflow-y-auto custom-scrollbar pt-3">
          {/* columns={4} (overlap audit, Merlin Nov 16): the
              menu's default 5 columns need 5×56 + 4×10 = 320 px,
              but this sheet's panel inner width is 292 px at 390
              wide (352 sheet − 32 padding − 28 panel padding)
              and 271 px at 360 — the 5th column was clipped 14 px
              at 390 and ~35 px at 360 by the sheet's own scroller.
              4 columns need 254 px and fit both widths; the 19
              orbs still scroll vertically inside the same box. */}
          <VehicleSelectMenu
            embedded
            showTitle={false}
            columns={4}
            options={earthVehicleOptions(vehicles)}
            selectedId={selected}
            onSelect={(opt) => setSelected(opt.id)}
          />
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
