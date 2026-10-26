'use client';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import GoogleEarthTiles from '@/components/GoogleEarthTiles';
import ProceduralEarthGlobe from '@/components/ProceduralEarthGlobe';
import EarthWalker from '@/components/EarthWalker';
import RedwaterFarmstead from '@/components/earth/RedwaterFarmstead';
import RedwaterMount from '@/components/earth/RedwaterMount';
import EarthBike from '@/components/EarthBike';
import EarthSupercar from '@/components/EarthSupercar';
import EarthPitMarker from '@/components/EarthPitMarker';
import StreetGroundPatch, { StreetFillLight } from '@/components/StreetGroundPatch';
import { LENS_PRESETS, LENS_LIFT, lensTilePlan, buildLensGeometryData } from '@/lib/earth/lens';
import { tileCellKey, recordRenderedTileKey } from '@/lib/earth/lens-cache';
import { HUB_UNITS_PER_DEGREE, DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import { loadHeightData, getHeightData } from '@/lib/earth/heightmap';
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
// stay mounted; beyond the cap the sheet FARTHEST from the current
// centre is disposed (distance eviction — the ground under and
// behind the traveler outlives a far-away sheet from an earlier
// focus). The cap is a GPU-memory call: each street sheet is a
// 2160² canvas texture (~19 MB; it was 2048² ≈ 17 MB before the
// 2026-10-22 range tripling), so 4 sheets ≈ 75 MB worst case —
// the cap deliberately did NOT grow with the ×3 radius: per-sheet
// memory is ≈ unchanged, and 4 sheets at the tripled radius
// already cover ×9 the ground the old 4 did.
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

export default function NexusEarth({ onSelect, quatRef, focus, phase, spinEnabled, controls, onTeleportNYC }) {
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
  const shellRef = useRef();

  const roaming = phase === 'diving_to_street' || phase === 'earth_roam';
  const effectiveLayer = roaming ? 'terrain' : layer;

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
      // UNMASKED (2026-10-26, Earth 1 expansion): a rendered tile
      // STAYS rendered and visible. The old fade hid every sheet
      // whenever focus cleared or during earth_travel, so ground
      // the traveler had already revealed vanished back to bare
      // globe — a mask in everything but name. Rendered sheets
      // now hold at full opacity in every phase; the only thing
      // that still removes a sheet is the MAX_LENS_SHEETS distance
      // eviction (a GPU-memory cap, not a hide). The
      // photorealistic layer's own gate (hidden while roaming, so
      // the street layer can stand) is untouched — that layer is
      // a product decision, not a mask, and disabling it is out
      // of scope.
      const target = 0.96;
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

  // Lens build manager (2026-10-26, street-tiles fix). The old
  // effect abandoned a build the moment the traveler walked to a
  // new centre — and a street sheet needs 36×36 = 1,296 tile
  // fetches while walking recenters every ~36 m, so in motion NO
  // sheet ever finished and the ground stayed flat patch-colour
  // forever (Merlin's footage; only a rare standstill sheet
  // landed). Now builds run SERIALLY: a recenter while a build
  // runs only queues the newest centre, and sheets mount
  // PROGRESSIVELY — the mesh lands at once and tiles paint as
  // they arrive (texture uploads throttled to 750 ms so a
  // 2160² canvas isn't re-uploaded per tile), so photographic
  // ground grows within seconds instead of all-or-nothing.
  const lensBuildRef = useRef({ busy: false, pending: null, alive: true });
  const lensGenRef = useRef(0);

  const disposeLensSheet = (s) => {
    s.mesh.geometry.dispose();
    s.mesh.material.map?.dispose();
    s.mesh.material.dispose();
  };

  // Persist a sheet alongside the recent ones (see
  // MAX_LENS_SHEETS): a rebuilt cell replaces its old sheet;
  // only sheets beyond the cap are disposed, farthest first —
  // never the one the traveler is standing on.
  const mountLensSheet = (key, mesh, lat, lon) => {
    const replaced = sheetsRef.current.find((s) => s.key === key);
    if (replaced) disposeLensSheet(replaced);
    const next = [...sheetsRef.current.filter((s) => s.key !== key),
      { key, mesh, lat, lon }];
    while (next.length > MAX_LENS_SHEETS) {
      let farIdx = 0;
      let farDist = -1;
      for (let i = 0; i < next.length - 1; i++) {
        const dLat = next[i].lat - lat;
        const dLon = next[i].lon - lon;
        const d = dLat * dLat + dLon * dLon;
        if (d > farDist) { farDist = d; farIdx = i; }
      }
      disposeLensSheet(next[farIdx]);
      next.splice(farIdx, 1);
    }
    sheetsRef.current = next;
    setLensSheets(next);
  };

  const removeLensSheet = (key) => {
    const hit = sheetsRef.current.find((s) => s.key === key);
    if (!hit) return;
    disposeLensSheet(hit);
    const next = sheetsRef.current.filter((s) => s.key !== key);
    sheetsRef.current = next;
    setLensSheets(next);
  };

  const pumpLensQueue = () => {
    const mgr = lensBuildRef.current;
    if (mgr.busy || !mgr.alive) return;
    const job = mgr.pending;
    mgr.pending = null;
    if (job) startLensBuild(job);
  };

  const startLensBuild = (job) => {
    const mgr = lensBuildRef.current;
    const gen = lensGenRef.current;
    mgr.busy = true;
    const preset = LENS_PRESETS[job.presetName];
    const plan = lensTilePlan(job.lat, job.lon, preset.zoom, preset.grid, preset.canvasPx);
    const S = preset.canvasPx / preset.grid;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = preset.canvasPx;
    const ctx = canvas.getContext('2d');
    const hd = getHeightData();
    // iPhone hardening (2026-10-01): iOS Safari returns null for 2D
    // contexts under canvas memory pressure — skip the build
    // honestly instead of throwing; the next recenter retries.
    if (!ctx || !hd) { mgr.busy = false; pumpLensQueue(); return; }
    const data = buildLensGeometryData(
      hd.data, hd.w, hd.h, job.lat, job.lon,
      preset.radiusUnits, plan,
      {
        // Street rings 12 → 24 (2026-10-22, with the radius
        // tripling): the wider disc gets a denser drape so
        // relief still hugs the terrain out at the 90 m rim.
        rings: job.presetName === 'street' ? 24 : 22,
        sectors: 48,
        lift: preset.lift ?? LENS_LIFT,
      },
    );
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 3;
    // Progressive mount: the sheet is on screen at once (the
    // frame loop animates its opacity 0 → 0.96) and tiles paint
    // into it as they arrive — no more waiting on all 1,296
    // tiles before ANY photographic ground shows.
    mountLensSheet(job.key, mesh, job.lat, job.lon);
    let settledCount = 0;
    let okCount = 0;
    let texTimer = null;
    const queueTexUpload = () => {
      if (texTimer) return;
      texTimer = setTimeout(() => {
        texTimer = null;
        tex.needsUpdate = true;
      }, 750);
    };
    const finish = () => {
      if (texTimer) { clearTimeout(texTimer); texTimer = null; }
      tex.needsUpdate = true;
      if (gen !== lensGenRef.current || !mgr.alive) {
        // Superseded (centre cleared) or unmounted: drop the sheet.
        removeLensSheet(job.key);
      } else if (okCount > 0) {
        // Feather the rim into the globe: opaque through the
        // middle, gone at the edge — no hard matte ring.
        ctx.globalCompositeOperation = 'destination-in';
        const c = preset.canvasPx / 2;
        const grad = ctx.createRadialGradient(c, c, c * 0.68, c, c, c);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, preset.canvasPx, preset.canvasPx);
        ctx.globalCompositeOperation = 'source-over';
        tex.needsUpdate = true;
        // The device record of rendered ground — this cell has
        // been mapped on this device, permanently (lens-cache.js).
        recordRenderedTileKey(tileCellKey(job.presetName, plan));
      } else {
        // Every tile failed: leave no invisible sheet behind.
        removeLensSheet(job.key);
      }
      mgr.busy = false;
      pumpLensQueue();
    };
    plan.tiles.forEach((t) => {
      if (!t.url) { settledCount += 1; if (settledCount === plan.tiles.length) finish(); return; }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (gen === lensGenRef.current && mgr.alive) {
          ctx.drawImage(img, t.px, t.py, S, S);
          queueTexUpload();
        }
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
  };

  useEffect(() => {
    if (!lensCenter || !heightReady) {
      // Leaving Earth / no focus: drop sheets AND any queued
      // build, and invalidate in-flight builds (their finish
      // disposes instead of mounting).
      lensGenRef.current += 1;
      lensBuildRef.current.pending = null;
      clearLensSheets();
      return undefined;
    }
    const mgr = lensBuildRef.current;
    const job = { key: centerKey, lat: lensCenter.lat, lon: lensCenter.lon, presetName };
    if (mgr.busy) { mgr.pending = job; return undefined; }
    startLensBuild(job);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey, heightReady]);

  // Dispose all lens sheets on unmount.
  useEffect(() => () => {
    lensBuildRef.current.alive = false;
    lensBuildRef.current.pending = null;
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
            quatRef={quatRef}
            onActive={() => setLayer('photorealistic')}
            onInactive={() => setLayer('terrain')}
          />
        </group>
        {effectiveLayer === 'terrain' && <ProceduralEarthGlobe onSelect={onSelect} quatRef={quatRef} waterInOrbit={!roaming} />}
        {/* Earth 1 simplification (2026-10-26): all placed 3D
            objects are staged off the scene — the full record
            lives in ~/workspace/earth1-staged-objects/inventory.json.
            Only the Redwater spawn farmstead remains, as journey
            dressing. Terrain, lens imagery, sky, ground, character
            and vehicles are untouched. */}
        {effectiveLayer === 'terrain' && <RedwaterFarmstead />}
        {effectiveLayer === 'terrain' && <EarthWalker />}
        {/* Street-level journey + player systems only. Ladders,
            monument elevators and traveler-following scatter were
            staged with the rest of the placed objects. */}
        {/* The Redwater quicksand journey: proximity-gated to the
            pit near Redwater, Alberta — same street gate as the
            ladders. The NYC portal drops into /mega-city via
            onTeleportNYC (HomeScene). */}
        {effectiveLayer === 'terrain' && roaming && <RedwaterMount onTeleportNYC={onTeleportNYC} />}
        {/* Summonable TRON bike — street only */}
        {effectiveLayer === 'terrain' && roaming && <EarthBike controls={controls} />}
        {/* Summonable Lamborghini Aventador — street only, Earth's
            fastest vehicle (Earth 1 expansion). Same gate as the
            bike; the car itself stays grounded. */}
        {effectiveLayer === 'terrain' && roaming && <EarthSupercar controls={controls} />}
        {/* Visible quicksand-pit marker (video QA V2-5): gold beam +
            ring + spinning diamond over the Redwater pit, so the
            journey is findable from the spawn. Visual only — it
            never blocks the pit, the sink, the tunnel or the core. */}
        {effectiveLayer === 'terrain' && roaming && <EarthPitMarker />}

        {effectiveLayer === 'terrain' && lensSheets.map((s) => (
          <primitive key={s.key} object={s.mesh} />
        ))}
        {/* Street-level detail ground + lantern fill: only on the
            terrain layer while roaming (walkthrough flaw 2026-10-17:
            the 160×120 globe's ~135 m facets read as broken shards
            from 1.62 m up). */}
        {effectiveLayer === 'terrain' && roaming && (
          <StreetGroundPatch center={patchCenter} />
        )}
        {effectiveLayer === 'terrain' && <StreetFillLight active={roaming} />}
        {/* Day sky dome at street level: blue during day, transparent at night.
            Uses sun direction to fade — day side gets blue sky, night side
            stays clear so stars show through. Replaces the atmosphere shell
            which saturates to white when the camera is inside it.
            The ONLY sky at street level: the old second sky for the
            removed second layer is gone with it. */}
        {effectiveLayer === 'terrain' && roaming && (
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
                  // Skybox fallback (video QA V2-4 hardening,
                  // 2026-10-26): the sky never fades to fully
                  // transparent — at night it holds a deep blue
                  // floor instead of the void black behind the
                  // canvas, so a camera clip never reads as a
                  // solid black half-screen. The street camera's
                  // floor clamp (EarthFlightController) is the
                  // primary guard; this is the backstop.
                  vec3 nightBlue = vec3(0.04, 0.06, 0.15);
                  vec3 sky = mix(nightBlue, skyBlue, dayness);
                  gl_FragColor = vec4(sky, 0.35 + dayness * 0.6);
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
