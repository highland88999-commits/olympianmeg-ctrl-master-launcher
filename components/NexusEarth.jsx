'use client';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import GoogleEarthTiles from '@/components/GoogleEarthTiles';
import ProceduralEarthGlobe from '@/components/ProceduralEarthGlobe';
import RedwaterFarmstead from '@/components/earth/RedwaterFarmstead';
import EarthSupercar from '@/components/EarthSupercar';
import EarthKart from '@/components/EarthKart';
import EarthBoostPads from '@/components/EarthBoostPads';
import EarthPeers from '@/components/EarthPeers';
import { StreetFillLight } from '@/components/StreetGroundPatch';
import PrerenderedEarthGround from '@/components/earth/PrerenderedEarthGround';
import { EarthCracks, EarthOrbitCracks } from '@/components/earth/EarthCracks';
import { startGroundVideo, stopGroundVideo } from '@/lib/earth/ground-video';
import { loadHeightData } from '@/lib/earth/heightmap';
import { setStreetFlatActive } from '@/lib/earth/street-flat';
import { sunVector, getDayNightPlace, requestDayNightPlace } from '@/lib/day-night';

// The hub Earth: Google's photorealistic 3D tiles when they stream, a real
// procedural 3D terrain globe as the fallback — Earth is always 3D, never a
// flat picture.
// - Clickable: onSelect fires (gated by parent to hub_freeroam).
// - Orientation is driven through the shared quatRef so the flight
//   controller can rotate the world (the treadmill: the traveler stands
//   still, the environment comes to them).
// - The ground is PRERENDERED around the entire map
//   (Merlin, 2026-11-15 — the tiling system is gone): one
//   sphere wearing the looping floor video (components/earth/
//   PrerenderedEarthGround.jsx), the video fading through his 9
//   scratched-metal colours in his order on a polished mirror
//   finish (lib/earth/ground-video.js). No live per-position
//   tile builds while driving — no lens sheets, no render
//   queue, no restore path, no mapping marks. The old lens
//   system (lib/earth/lens.js + the near/far/coarse pools) and
//   the per-tile photo/metal mapping are deleted from every
//   live path; the pure lens/mapping modules stay on disk,
//   unwired, with their tests.
// - When Google's photorealistic 3D tiles are available (session minted
//   server-side from GOOGLE_MAP_TILES_API_KEY), the terrain globe swaps
//   for the real photorealistic globe. The procedural terrain globe is the
//   honest fallback: it renders until the tiles actually load, and returns
//   if they fail. All textures are self-hosted under public/textures/earth.
// - Street level (Day 2) runs on the terrain globe — the layer that
//   carries the placed world — so roaming forces the terrain layer
//   and mounts the driver's vehicle (EarthSupercar, vehicles only
//   since 2026-11-15 — the walker is gone).
// - A small badge names the active layer in plain English.


const EARTH_CENTER_WORLD = new THREE.Vector3(0, -30, -80);
// The atmosphere shell (radius 55 × 1.025 ≈ 56.4) only renders
// while the camera is OUTSIDE this distance from the centre:
// additive BackSide shading saturates to a naked white frame for
// as long as the lens travels inside the shell band (round 4,
// defect 5 — the ~1.5 s whiteout on every ascend, and the flash
// on return to orbit: the shell used to remount the moment the
// phase left `roaming`, with the camera still at street level
// inside it).
const SHELL_CAMERA_MIN_DIST = 57.5;

export default function NexusEarth({ onSelect, onGlobeClick, quatRef, focus, phase, spinEnabled, controls }) {
  const spinRef = useRef();
  const skyMatRef = useRef(null); // street-level day-sky dome shader material
  // 'terrain' = procedural 3D globe (default, always 3D).
  // 'photorealistic' = Google 3D tiles, only after they really render.
  const [layer, setLayer] = useState('terrain');
  const shellRef = useRef();

  const roaming = phase === 'diving_to_street' || phase === 'earth_roam';
  const effectiveLayer = roaming ? 'terrain' : layer;

  // Height data warm-up: the car ground sampler and the camera
  // read the heightmap directly; loading it once here means the
  // first drive never waits on the fetch.
  useEffect(() => {
    loadHeightData();
  }, []);

  // Street-level flat mode (Merlin, 2026-10-26): while roaming,
  // every ground sampler returns the constant sea-level radius —
  // the globe component morphs its geometry flat on the same
  // signal, so the visible world and the grounding agree. Cleared
  // on phase change and unmount: orbit keeps real relief.
  useEffect(() => {
    setStreetFlatActive(roaming);
    return () => setStreetFlatActive(false);
  }, [roaming]);

  // Day/night (Merlin, 2026-11-14): the street-level sky dome's
  // sunDirection follows the REAL sun for the walker's place
  // (real location when granted, Sydney when not — the shared
  // law, lib/day-night.js), refreshed ~once a second. The
  // shader itself is untouched: day side still gets the blue
  // sky, night side still holds the nightBlue floor so stars
  // show through. The dome only mounts while roaming, so a
  // missing material is a no-op, not an error.
  useEffect(() => {
    requestDayNightPlace();
    const updateSun = () => {
      const mat = skyMatRef.current;
      if (!mat || !mat.uniforms || !mat.uniforms.sunDirection) return;
      try {
        const place = getDayNightPlace();
        const v = sunVector(Date.now(), place.lat, place.lon);
        mat.uniforms.sunDirection.value.set(v.x, v.y, v.z);
      } catch {}
    };
    updateSun();
    const id = setInterval(updateSun, 1000);
    return () => clearInterval(id);
  }, []);




  // While roaming, the frame loop keeps the atmosphere shell
  // gated and the hub spin turning (below).
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
  });

  // Floor video lifecycle: the video starts with the scene
  // (muted + loop, so autoplay is allowed) and pauses on
  // unmount — the ground texture decodes only while Earth 1
  // is on screen.
  useEffect(() => {
    startGroundVideo();
    return () => stopGroundVideo();
  }, []);


  return (
    <group position={[0, -30, -80]}>
      <group ref={spinRef}>
        <group visible={!roaming}>
          <GoogleEarthTiles
            onSelect={onSelect}
            onGlobeClick={onGlobeClick}
            quatRef={quatRef}
            onActive={() => setLayer('photorealistic')}
            onInactive={() => setLayer('terrain')}
          />
        </group>
        {effectiveLayer === 'terrain' && (
          // The photographic globe stays mounted (textures stay
          // loaded) and is hidden only at street level, where
          // the prerendered video ground covers it.
          <group visible={phase !== 'earth_roam'}>
            <ProceduralEarthGlobe onSelect={onSelect} onGlobeClick={onGlobeClick} quatRef={quatRef} waterInOrbit={!roaming} flatTarget={roaming} />
          </group>
        )}
        {/* Jagged world-locked cracks over the orbit globe
            (2026-10-26 late night): the same crack field as the
            street plane, wrapped on the sphere — not lat/lon
            lines, not a grid. A separate overlay — the globe
            shader (and its orbit water illusion) is untouched,
            and it carries no click handlers, so globe clicks
            pass through. */}
        {effectiveLayer === 'terrain' && !roaming && <EarthOrbitCracks />}
        {/* Earth 1 simplification (2026-10-26): all placed 3D
            objects are staged off the scene — the full record
            lives in ~/workspace/earth1-staged-objects/inventory.json.
            Only the Redwater spawn farmstead remains, as journey
            dressing. Terrain, sky, ground, character
            and vehicles are untouched. */}
        {effectiveLayer === 'terrain' && <RedwaterFarmstead />}
        {/* VEHICLES ONLY (Merlin, 2026-11-15): the walker, the
            TRON bike, the Redwater journey mount, and the
            quicksand-pit marker are all gone — Earth 1 is
            vehicles only. The driver spawns in their vehicle
            (EarthSupercar) and stays in it. */}
        {/* The driver's vehicle — street only, Earth's fastest
            vehicle (Earth 1 expansion). The car itself stays
            grounded. */}
        {effectiveLayer === 'terrain' && roaming && <EarthSupercar controls={controls} />}
        {/* Mario Kart systems (Earth 1, 2026-11-15): torpedo
            orbs, heat-seeker torpedoes, rival drivers, bumper-
            car collisions, the explosion burst. Same street gate
            as the vehicle; renders nothing until the driver is
            mounted. */}
        {effectiveLayer === 'terrain' && roaming && <EarthKart />}
        {/* Ground-level boost pads for racers (Earth 1, 2026-11-15):
            light-up pads on a seeded grid across the planet —
            drivers pass over them for an extra speed boost. Same
            street gate as the vehicles; renders nothing while the
            driver is far from every pad. */}
        {effectiveLayer === 'terrain' && roaming && <EarthBoostPads />}
        {/* Passers-by (2026-10-26, see-each-other): other travelers
            on Earth 1 near you — their VEHICLE only (vehicles
            only since 2026-11-15, no on-foot figure). Same street
            gate as the vehicles; renders nothing and claims no
            count while presence is unavailable. */}
        {effectiveLayer === 'terrain' && roaming && <EarthPeers />}

        {/* PRERENDERED GROUND (Merlin, 2026-11-15): the whole
            planet sphere, wearing the ground-loop video + mirror
            sheen once, baked — no live per-position tile builds
            while driving. Mounts at street level; the globe
            above is hidden while it is up. */}
        {effectiveLayer === 'terrain' && phase === 'earth_roam' && <PrerenderedEarthGround />}
        {/* The street-level detail ground patch went with the
            tiling system (Merlin, 2026-11-15): the prerendered
            video sphere above is the ground now. */}
        {/* Jagged world-locked cracks at street level
            (2026-10-26 late night): static fractures glowing
            faintly through the ground — the pattern is a pure
            function of planet-fixed direction, so the cracks
            stay put on the Earth while the car drives over
            them, plus a barely-there color-cycling glow light.
            One shader plane, never rebuilt — same street gate
            as the detail ground. */}
        {effectiveLayer === 'terrain' && roaming && <EarthCracks />}
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
              ref={skyMatRef}
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
