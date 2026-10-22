'use client';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import GoogleEarthTiles from '@/components/GoogleEarthTiles';
import ProceduralEarthGlobe from '@/components/ProceduralEarthGlobe';
import EarthAssets from '@/components/EarthAssets';
import EarthWalker from '@/components/EarthWalker';
import EarthLadders from '@/components/EarthLadders';
import MonumentElevator from '@/components/MonumentElevator';
import EarthBike from '@/components/EarthBike';
import StreetGroundPatch, { StreetFillLight, MicroGroundDisc } from '@/components/StreetGroundPatch';
import QuantumSkyDome from '@/components/QuantumSkyDome';
import UnderwaterVeil from '@/components/UnderwaterVeil';
import { LENS_PRESETS, LENS_LIFT, lensTilePlan, buildLensGeometryData } from '@/lib/earth/lens';
import { tileCellKey, recordRenderedTileKey } from '@/lib/earth/lens-cache';
import { HUB_UNITS_PER_DEGREE, DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import { loadHeightData, getHeightData } from '@/lib/earth/heightmap';
import { parachuteState } from '@/lib/earth/parachute';
import { QUANTUM_ENABLED } from '@/lib/earth/quantum';
import { roamState } from '@/lib/earth/roam';

// The hub Earth: Google's photorealistic 3D tiles when they stream, a real
// procedural 3D terrain globe as the fallback — Earth is always 3D, never a
// flat picture.
// - Clickable: onSelect fires (gated by parent to hub_freeroam).
// - Orientation is driven through the shared quatRef so the flight
//   controller can rotate the world (the treadmill: the traveler stands
//   still, the environment comes to them).
// - A detail "lens" drapes real ESRI World Imagery over the terrain
//   at the current focus (overlook) or under the traveler's feet
//   (street level): the sheet is built from lib/earth/lens.js —
//   every vertex grounded on the heightmap, the texture registered
//   by true lat/lon, the rim feathered into the globe. (Day 2 fix
//   for demo flaw E2: the old flat, unregistered disc let terrain
//   poke through in wedges and never matched the coast beneath it.)
// - When Google's photorealistic 3D tiles are available (session minted
//   server-side from GOOGLE_MAP_TILES_API_KEY), the terrain globe swaps
//   for the real photorealistic globe. The procedural terrain globe is the
//   honest fallback: it renders until the tiles actually load, and returns
//   if they fail. All textures are self-hosted under public/textures/earth.
// - Street level (Day 2) runs on the terrain globe — the layer that
//   carries the placed world — so roaming forces the terrain layer
//   and mounts the embodied traveler (EarthWalker).
// - A small badge names the active layer in plain English.
// Rendered lens sheets PERSIST (Merlin, 2026-10-20: "once a tile
// has rendered, it stays rendered"). Recentering used to dispose
// the previous sheet, so the photographic ground behind the
// traveler vanished back to bare globe. Now the last few sheets
// stay mounted; only beyond the cap is the oldest disposed. The
// cap is a GPU-memory call: each sheet is a 2048² canvas texture
// (~17 MB), so 4 sheets ≈ 67 MB worst case — the current area plus
// the ground just walked, without unbounded growth on an iPhone.
const MAX_LENS_SHEETS = 4;

// The globe's centre in world space (this component's outer group
// position) — the atmosphere shell's camera-distance gate below
// measures against it.
const EARTH_CENTER_WORLD = new THREE.Vector3(0, -60, -120);
// The atmosphere shell (radius 55 × 1.025 ≈ 56.4) only renders
// while the camera is OUTSIDE this distance from the centre:
// additive BackSide shading saturates to a naked white frame for
// as long as the lens travels inside the shell band (round 4,
// defect 5 — the ~1.5 s whiteout on every ascend, and the flash
// on return to orbit: the shell used to remount the moment the
// phase left `roaming`, with the camera still at street level
// inside it).
const SHELL_CAMERA_MIN_DIST = 57.5;
// Below this Ant-Man scale the Quantum Realm is sealed (round 4,
// defect 1): the macro globe itself hands over to the realm's own
// floor (MicroGroundDisc) and sky (QuantumSkyDome). The threshold
// sits deep in the dive — by 0.05x the dome is already fully
// opaque and the ground fills the view, so the handover reads as
// arriving inside the tile, not as the world blinking out.
const DEEP_MICRO_SCALE = 0.05;

export default function NexusEarth({ onSelect, onParachute, onTileSelect, quatRef, focus, phase, spinEnabled, controls }) {
  const spinRef = useRef();
  const sheetsRef = useRef([]); // [{ key, mesh }] — mirror of lensSheets for frame-loop access
  const roamCenterRef = useRef(null);
  const patchCenterRef = useRef(null);
  const lastLensBuildRef = useRef(0);
  const [lensSheets, setLensSheets] = useState([]);
  const [heightReady, setHeightReady] = useState(false);
  const [roamCenter, setRoamCenter] = useState(null);
  const [patchCenter, setPatchCenter] = useState(null);
  // 'terrain' = procedural 3D globe + ESRI lens (default, always 3D).
  // 'photorealistic' = Google 3D tiles, only after they really render.
  const [layer, setLayer] = useState('terrain');
  // Micro mode: when shrunk to Ant-Man size (scale < 0.5), hide all 3D
  // objects (trees, rocks, buildings). They reappear on REANIMATE.
  const [microMode, setMicroMode] = useState(false);
  // Deep micro (scale < 0.05): the Quantum Realm seal — even the
  // globe itself stands down (see DEEP_MICRO_SCALE above).
  const [deepMicro, setDeepMicro] = useState(false);
  const shellRef = useRef();

  const roaming = phase === 'diving_to_street' || phase === 'earth_roam';
  const effectiveLayer = roaming ? 'terrain' : layer;

  // Track Ant-Man scale: hide objects at micro size
  useFrame(() => {
    const s = parachuteState?.scale || 1;
    const isMicro = s < 0.5;
    if (isMicro !== microMode) setMicroMode(isMicro);
    const isDeep = s < DEEP_MICRO_SCALE;
    if (isDeep !== deepMicro) setDeepMicro(isDeep);
  });

  // Shared heightmap: one decode for globe, assets, lens, walker.
  useEffect(() => {
    let alive = true;
    loadHeightData().then((hd) => { if (alive && hd) setHeightReady(true); });
    return () => { alive = false; };
  }, []);

  // While roaming, recenter the street lens when the traveler has
  // walked out of its middle (throttled: the composite is a real
  // canvas build, and the feather hides the handoff).
  useFrame((state, delta) => {
    // Atmosphere shell gate (SHELL_CAMERA_MIN_DIST above): the
    // shell exists only for a camera outside its band — never
    // while the lens is transiting it on the way up or down.
    if (shellRef.current) {
      shellRef.current.visible = state.camera.position.distanceTo(EARTH_CENTER_WORLD) > SHELL_CAMERA_MIN_DIST;
    }
    if (spinEnabled && spinRef.current && quatRef?.current) {
      const qy = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), delta * 0.05
      );
      quatRef.current.multiply(qy);
    }
    if (spinRef.current && quatRef?.current) {
      spinRef.current.quaternion.copy(quatRef.current);
    }
    if (sheetsRef.current.length) {
      const target = (focus || roaming) && phase !== 'earth_travel' ? 0.96 : 0;
      for (const s of sheetsRef.current) {
        const m = s.mesh.material;
        m.opacity += (target - m.opacity) * Math.min(1, delta * 3);
        s.mesh.visible = m.opacity > 0.02;
      }
    }
    if (roaming && roamState.active) {
      const c = roamCenterRef.current;
      // Recenter when the traveler walks out of the street disc's
      // middle: 40% of the street lens radius, in degrees. (The old
      // fixed 0.06° refired every few steps at full tilt, thrashing
      // the 64-tile composite; this keeps the traveler on the
      // photographic ground with far fewer rebuilds.)
      const recenterDeg = (LENS_PRESETS.street.radiusUnits * 0.4) / HUB_UNITS_PER_DEGREE;
      const moved = !c
        || Math.abs(c.lat - roamState.lat) > recenterDeg
        || Math.abs(c.lon - roamState.lon) > recenterDeg;
      const now = performance.now();
      if (moved && now - lastLensBuildRef.current > 900) {
        lastLensBuildRef.current = now;
        const next = { lat: roamState.lat, lon: roamState.lon };
        roamCenterRef.current = next;
        setRoamCenter(next);
      }
      // The street PATCH recenters on its own, much tighter beat: it
      // is pure geometry (no tile fetches), and at bike speed the
      // traveler crosses the lens's 900ms throttle in a blink — the
      // floor must already be there, all around and behind, before
      // it's needed (Merlin, 2026-10-20). ~10 m threshold, no timer.
      const pc = patchCenterRef.current;
      const patchDeg = (10 * DISPLAY_UNITS_PER_METRE) / HUB_UNITS_PER_DEGREE;
      if (!pc
        || Math.abs(pc.lat - roamState.lat) > patchDeg
        || Math.abs(pc.lon - roamState.lon) > patchDeg) {
        const next = { lat: roamState.lat, lon: roamState.lon };
        patchCenterRef.current = next;
        setPatchCenter(next);
      }
    }
  });

  // Dispose every persisted lens sheet (leaving Earth / unmount).
  const clearLensSheets = () => {
    for (const s of sheetsRef.current) {
      s.mesh.geometry.dispose();
      s.mesh.material.map?.dispose();
      s.mesh.material.dispose();
    }
    sheetsRef.current = [];
    setLensSheets([]);
  };

  // Build the lens for the current centre + range preset.
  const lensCenter = roaming ? roamCenter : focus;
  const presetName = roaming ? 'street' : 'overlook';
  const centerKey = lensCenter
    ? `${presetName}:${lensCenter.lat.toFixed(4)},${lensCenter.lon.toFixed(4)}`
    : null;
  useEffect(() => {
    if (!lensCenter || !heightReady) { clearLensSheets(); return undefined; }
    let alive = true;
    const preset = LENS_PRESETS[presetName];
    const plan = lensTilePlan(lensCenter.lat, lensCenter.lon, preset.zoom, preset.grid, preset.canvasPx);
    const S = preset.canvasPx / preset.grid;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = preset.canvasPx;
    const ctx = canvas.getContext('2d');
    // iPhone hardening (2026-10-01): iOS Safari returns null for 2D
    // contexts under canvas memory pressure — skip the lens honestly
    // instead of throwing into the React error boundary.
    if (!ctx) return undefined;
    let settledCount = 0;
    let okCount = 0;
    const finish = () => {
      if (!alive || okCount === 0) return;
      // Feather the rim into the globe: opaque through the middle,
      // gone at the edge — no hard matte ring.
      ctx.globalCompositeOperation = 'destination-in';
      const c = preset.canvasPx / 2;
      const grad = ctx.createRadialGradient(c, c, c * 0.68, c, c, c);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, preset.canvasPx, preset.canvasPx);
      ctx.globalCompositeOperation = 'source-over';
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const hd = getHeightData();
      if (!hd) return;
      const data = buildLensGeometryData(
        hd.data, hd.w, hd.h, lensCenter.lat, lensCenter.lon,
        preset.radiusUnits, plan,
        {
          rings: presetName === 'street' ? 12 : 22,
          sectors: 48,
          lift: preset.lift ?? LENS_LIFT,
        },
      );
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
      geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 3;
      // Persist this sheet alongside the recent ones (see
      // MAX_LENS_SHEETS): a rebuilt cell replaces its old sheet;
      // only sheets beyond the cap are disposed.
      const disposeSheet = (s) => {
        s.mesh.geometry.dispose();
        s.mesh.material.map?.dispose();
        s.mesh.material.dispose();
      };
      const key = centerKey;
      const replaced = sheetsRef.current.find((s) => s.key === key);
      if (replaced) disposeSheet(replaced);
      const next = [...sheetsRef.current.filter((s) => s.key !== key), { key, mesh }];
      while (next.length > MAX_LENS_SHEETS) disposeSheet(next.shift());
      sheetsRef.current = next;
      setLensSheets(next);
      // The device record of rendered ground — this cell has been
      // mapped on this device, permanently (lens-cache.js).
      recordRenderedTileKey(tileCellKey(presetName, plan));
    };
    plan.tiles.forEach((t) => {
      if (!t.url) { settledCount += 1; if (settledCount === plan.tiles.length) finish(); return; }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!alive) return;
        ctx.drawImage(img, t.px, t.py, S, S);
        okCount += 1;
        settledCount += 1;
        if (settledCount === plan.tiles.length) finish();
      };
      img.onerror = () => {
        settledCount += 1;
        if (settledCount === plan.tiles.length) finish();
      };
      img.src = t.url;
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey, heightReady]);

  // Dispose all lens sheets on unmount.
  useEffect(() => () => {
    for (const s of sheetsRef.current) {
      s.mesh.geometry.dispose();
      s.mesh.material.map?.dispose();
      s.mesh.material.dispose();
    }
    sheetsRef.current = [];
  }, []);

  return (
    <group position={[0, -60, -120]}>
      <group ref={spinRef}>
        <group visible={!roaming}>
          <GoogleEarthTiles
            onSelect={onSelect}
            onParachute={onParachute}
            onTileSelect={onTileSelect}
            quatRef={quatRef}
            onActive={() => setLayer('photorealistic')}
            onInactive={() => setLayer('terrain')}
          />
        </group>
        {effectiveLayer === 'terrain' && !deepMicro && <ProceduralEarthGlobe onSelect={onSelect} onParachute={onParachute} onTileSelect={onTileSelect} quatRef={quatRef} />}
        {/* 3D objects hidden in micro (Ant-Man) mode — reappear on REANIMATE */}
        {effectiveLayer === 'terrain' && !microMode && <EarthAssets />}
        {effectiveLayer === 'terrain' && <EarthWalker />}
        {/* Climbable ladders on structures, monument elevators — street only, not in micro */}
        {effectiveLayer === 'terrain' && roaming && !microMode && <EarthLadders visible={roaming} />}
        {effectiveLayer === 'terrain' && roaming && !microMode && <MonumentElevator visible={roaming} />}
        {/* Summonable TRON bike — street only */}
        {effectiveLayer === 'terrain' && roaming && <EarthBike controls={controls} />}

        {effectiveLayer === 'terrain' && !microMode && lensSheets.map((s) => (
          <primitive key={s.key} object={s.mesh} />
        ))}
        {/* Street-level detail ground + lantern fill: only on the
            terrain layer while roaming (walkthrough flaw 2026-10-17:
            the 160×120 globe's ~135 m facets read as broken shards
            from 1.62 m up). */}
        {effectiveLayer === 'terrain' && roaming && !microMode && (
          <StreetGroundPatch center={patchCenter} />
        )}
        {/* The Quantum Realm's own floor: a small opaque disc that
            follows the tiny walker in every direction. QUANTUM OFF
            (Merlin, 2026-10-22, "for now"): not mounted at all while
            QUANTUM_ENABLED is false (lib/earth/quantum.js) — the
            component itself is untouched and returns with the flag. */}
        {effectiveLayer === 'terrain' && roaming && QUANTUM_ENABLED && (
          <MicroGroundDisc />
        )}
        {/* The Quantum Realm's own sky: renders only below 0.5x —
            from normal size it does not exist at all. Also unmounted
            while the Quantum Realm is off (same flag, same note). */}
        {effectiveLayer === 'terrain' && roaming && QUANTUM_ENABLED && (
          <QuantumSkyDome />
        )}
        {/* Underwater ambience for swimming: a clear bright-blue
            wash that exists only while the camera is under the
            waterline (self-gating inside the component). */}
        {effectiveLayer === 'terrain' && roaming && (
          <UnderwaterVeil />
        )}
        {effectiveLayer === 'terrain' && <StreetFillLight active={roaming} />}
        {/* Day sky dome at street level: blue during day, transparent at night.
            Uses sun direction to fade — day side gets blue sky, night side
            stays clear so stars show through. Replaces the atmosphere shell
            which saturates to white when the camera is inside it.
            NORMAL LAYER ONLY: in the Quantum Realm this sky hands over
            to the QuantumSkyDome — two skies, two layers, never mixed. */}
        {effectiveLayer === 'terrain' && roaming && !microMode && (
          <mesh scale={[1.5, 1.5, 1.5]}>
            <sphereGeometry args={[55, 32, 32]} />
            <shaderMaterial
              side={THREE.BackSide}
              transparent={true}
              depthWrite={false}
              uniforms={{
                sunDirection: { value: new THREE.Vector3(0, 150, 370).normalize() },
              }}
              vertexShader={`
                varying vec3 vWorldNormal;
                void main() {
                  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
              `}
              fragmentShader={`
                uniform vec3 sunDirection;
                varying vec3 vWorldNormal;
                void main() {
                  float dayness = smoothstep(-0.1, 0.3, dot(normalize(vWorldNormal), sunDirection));
                  vec3 skyBlue = vec3(0.53, 0.81, 0.92);
                  gl_FragColor = vec4(skyBlue, dayness * 0.95);
                }
              `}
            />
          </mesh>
        )}
      </group>

      {/* Atmosphere shell — hidden at street level (camera is inside it,
          additive blending saturates to white). Only for orbital view,
          and (round 4) only while the camera is outside its band: the
          group starts hidden and the frame loop shows it once the
          lens is clear, so ascents never flash white through it. */}
      {!roaming && (
      <group ref={shellRef} visible={false}>
      <mesh scale={[1.025, 1.025, 1.025]}>
        <sphereGeometry args={[55, 64, 64]} />
        <shaderMaterial
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          transparent={true}
          depthWrite={false}
          vertexShader={`
            varying vec3 vNormalWorld;
            void main() {
              vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            varying vec3 vNormalWorld;
            void main() {
              vec3 cameraDir = normalize(cameraPosition - vNormalWorld);
              float intensity = pow(0.6 - dot(normalize(vNormalWorld), cameraDir), 2.0);
              vec3 atmosphere = vec3(0.1, 0.4, 1.0) * intensity;
              gl_FragColor = vec4(atmosphere, 1.0) * (intensity * 1.5);
            }
          `}
        />
      </mesh>
      </group>
      )}
    </group>
  );
}
