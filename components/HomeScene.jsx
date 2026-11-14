'use client';

// HomeScene: the hub's 3D orbit scene, code-split out of app/page.jsx via
// next/dynamic (ssr:false) so the heavy three.js stack (fiber, drei,
// postprocessing, three) and every god panel only load for the 3D hub.
// Scene, markup, ad inventory (tower panels: Merlin's native stake.com slot
// plus the rotating billboard partner inventory), and camera logic are
// byte-identical to the inline version — this is a pure code-split.
import { useState, useEffect, useRef, useMemo, Suspense, Component, cloneElement, isValidElement } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';
import GodOrbitRings from './GodOrbitRings';
import HubPortals from './HubPortals';
import NexusEarth from './NexusEarth';
import { MarsRealmContent } from './mars/MarsScene';
import { PlanetRealmContent } from './planets/PlanetRealmContent';
import HubMoon from './HubMoon';
import AsteroidField from './AsteroidField';
import HubTieFlight from './HubTieFlight';
import NavBeacons from './NavBeacons';
import EarthFlightController from './EarthFlightController';
import { ORBIT_CENTER, EARTH_CENTER, EARTH_RADIUS, GOD_BANDS, MARS_CENTER, MARS_RADIUS, PLANETS, SYSTEM_RING_RADII, SYSTEM_RING_TILTS, BIKE_PARK_POS, RIDER_OFFSET, BIKE_LOOK_AHEAD } from '../lib/god-orbits';
import { FREE_FLY_SPEED, BIKE_TUNING } from '../lib/hub-layout';
import { registerCollider, unregisterCollider, resolveFlightCollision } from '../lib/hub-collision';
import { createBikeFlightState, stepBikeFlight, rotateOffsetByYaw, bikeForward } from '../lib/bike-flight';
import { dismountPosition } from '../lib/rider-state';
import { flightAxisMove, bikeAxisInput } from '../lib/flight-axis';
import SeasonalDecor, { SeasonToast, TrophyOverlay } from './SeasonalDecor';
import { applyCoverFit } from '../lib/texture-fit';
import { userPlanetDescriptor } from '../lib/communiverse/spiral';
import { GOD_TOWER_SPOTS } from '../lib/home-positions';
import { probeWebGL, resetWebGLProbeCache, diagnoseWebGL } from '../lib/webgl-support';
import { panelsForTower } from '../lib/tower-panels';
import { manifestToOverrides, applyOverridesToTowerPanels } from '../lib/billboards/overrides';
import { dropPausedOverrides } from '../lib/billboards/subscriptions';
import GodTower, { preloadHubPanelVideos } from './GodTower';
// OmegaHubGate + Earth2HubGate imports retired 2026-10-31 (Merlin):
// both portals were unmounted from hub space — the Omega portal now
// lives in the Earth chooser street light, Earth 2 via the chooser.
import VanGoghSky from './VanGoghSky';
import { setVanGoghActive, VANGOGH_BODY_CLASS } from '../lib/vangogh';
import { resolveUiSettings, readUiSettingsCache, UI_SETTINGS_EVENT } from '../lib/ui-settings';

function MarsBackground({ onSelect }) {
  const marsRef = useRef();
  useFrame((state, delta) => { if (marsRef.current) marsRef.current.rotation.y += delta * 0.05; });
  // The real Mars map (Merlin's graphic, 2026-10-21) re-skins the
  // planet; the flat rust color stays as the pre-load fallback and is
  // dropped the moment the texture lands (a map multiplies the color,
  // so a loaded map renders against white).
  const [marsMap, setMarsMap] = useState(null);
  useEffect(() => {
    let live = true;
    new THREE.TextureLoader().load('/planets/mars.jpg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      if (live) setMarsMap(tex);
    });
    return () => { live = false; };
  }, []);
  
  // Mars rides the far side of the satellites (Merlin, 2026-10-20):
  // the whole planetary system expanded outward from ORBIT_CENTER by
  // 1.5× and Mars grew 1.5× with it — group position
  // ORBIT_CENTER + 1.5×([-105, 68, -150] − ORBIT_CENTER), sphere
  // 30 → 45. Expansion pass later that day: the offset from
  // ORBIT_CENTER scaled another 1.5× (size unchanged) so the planets
  // stay beyond the doubled satellites and the pushed-out towers.
  // Position + radius read MARS_CENTER / MARS_RADIUS (lib/god-orbits.js)
  // — the single source of truth that also feeds its collider in
  // StaticColliders and the Mars-centered SYSTEM RINGS, so the three
  // can never drift apart. Earth stays exactly where it is.
  // Clickable (Merlin, 2026-10-21): tapping the hub's Mars body dives
  // INTO the planet — the seeded surface renders inside this same
  // Canvas (MarsRealmContent at the origin, appState 'mars_surface'),
  // mirroring how clicking Earth begins the dive. onSelect is gated
  // by the parent to hub_freeroam (same gate as NexusEarth's
  // onSelect); the handler sits on the group so both the planet mesh
  // and its atmosphere shell deliver the tap.
  return (
    <group
      position={[MARS_CENTER.x, MARS_CENTER.y, MARS_CENTER.z]}
      onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(); } : undefined}
    >
      <mesh ref={marsRef} receiveShadow castShadow>
        <sphereGeometry args={[MARS_RADIUS, 64, 64]} />
        <meshStandardMaterial map={marsMap || undefined} color={marsMap ? '#ffffff' : '#b33900'} roughness={0.9} metalness={0.1} />
      </mesh>

      <pointLight color="#ff4500" intensity={0.8} distance={150} position={[0, 0, 52.5]} />

      <mesh scale={[1.035, 1.035, 1.035]}>
        <sphereGeometry args={[MARS_RADIUS, 64, 64]} />
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
              vec3 atmosphere = vec3(1.0, 0.3, 0.1) * intensity;
              gl_FragColor = vec4(atmosphere, 1.0) * (intensity * 1.5);
            }
          `}
        />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// The outer planets (Merlin, 2026-10-21): eight worlds wrapped in his
// graphics, expanded outward past the existing system — data lives in
// lib/god-orbits.js PLANETS (single source for mesh + collider).
// PlanetBody spins its world on its own axis inside an axial-tilt
// group; Saturn's strip texture becomes its rings via a radial UV
// remap (RingGeometry's stock UVs are planar — the strip's width is
// the radial axis, sampled at v = 0.5).
// ---------------------------------------------------------------------------
// Clickable (Merlin, 2026-10-22 — the Planet Program): tapping a
// planet body in freeroam dives INTO it, exactly like Mars and Earth
// — its seeded surface renders inside this same Canvas
// (PlanetRealmContent at the origin, appState 'planet_surface').
// onSelect is gated by the parent to hub_freeroam and arrives as
// null everywhere else; the handler sits on the outer group so the
// sphere AND Saturn's rings deliver the tap, and hover gets the
// same pointer-cursor affordance the realms' creatures use.
function PlanetBody({ planet, map, ringMap, onSelect }) {
  const spinRef = useRef();
  useFrame((state, delta) => { if (spinRef.current) spinRef.current.rotation.y += delta * planet.spin; });
  const ringGeo = useMemo(() => {
    if (!planet.rings) return null;
    const geo = new THREE.RingGeometry(planet.rings.inner, planet.rings.outer, 128, 1);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      uv.setXY(i, (v.length() - planet.rings.inner) / (planet.rings.outer - planet.rings.inner), 0.5);
    }
    uv.needsUpdate = true;
    return geo;
  }, [planet]);
  useEffect(() => () => { if (ringGeo) ringGeo.dispose(); }, [ringGeo]);
  return (
    <group
      position={[planet.center.x, planet.center.y, planet.center.z]}
      onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(planet.key); } : undefined}
      onPointerOver={onSelect ? (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; } : undefined}
      onPointerOut={onSelect ? () => { document.body.style.cursor = ''; } : undefined}
    >
      <group rotation={[0, 0, planet.tilt || 0]}>
        <mesh ref={spinRef}>
          <sphereGeometry args={[planet.radius, 48, 48]} />
          <meshStandardMaterial map={map || undefined} color={map ? '#ffffff' : (planet.color || '#777777')} roughness={0.95} metalness={0.05} />
        </mesh>
        {planet.rings && ringGeo && (
          <mesh geometry={ringGeo} rotation={[-Math.PI / 2, 0, 0]}>
            <meshStandardMaterial map={ringMap || undefined} color={ringMap ? '#ffffff' : '#b8a88f'} roughness={1} metalness={0} side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
    </group>
  );
}

function BackdropPlanets({ onPlanetSelect }) {
  const [maps, setMaps] = useState({});
  useEffect(() => {
    let live = true;
    const loader = new THREE.TextureLoader();
    const load = (url, key) => loader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      if (live) setMaps((m) => ({ ...m, [key]: tex }));
    });
    PLANETS.forEach((p) => {
      load(p.texture, p.key);
      if (p.rings) load(p.rings.texture, p.key + ':rings');
    });
    return () => { live = false; };
  }, []);
  return (
    <>
      {PLANETS.map((p) => (
        <PlanetBody key={p.key} planet={p} map={maps[p.key] || null} ringMap={maps[p.key + ':rings'] || null} onSelect={onPlanetSelect} />
      ))}
    </>
  );
}

// User-forged planets (Merlin, 2026-10-30): every published world becomes
// a planet in the hub, placed on the mathematical outward spiral
// (lib/communiverse/spiral.js) — radial AND vertical, 25 billboard rows
// of height, infinitely outward, never colliding. Color derives from the
// world's seed so each planet is visually distinct. Clicking a planet
// opens its world page.
function UserPlanets() {
  const [worlds, setWorlds] = useState([]);
  useEffect(() => {
    let live = true;
    fetch('/api/communiverse')
      .then((r) => r.json())
      .then((d) => {
        if (live && d && d.ok && Array.isArray(d.worlds)) setWorlds(d.worlds);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  // Flight colliders for user planets — registered when worlds load,
  // unregistered on unmount. Positions are static (spiral is deterministic).
  useEffect(() => {
    const keys = [];
    worlds.forEach((w, i) => {
      const desc = userPlanetDescriptor(i, w.id);
      const key = 'user-planet-' + String(w.id);
      keys.push(key);
      registerCollider(key, () => ({ ...desc.center }), desc.radius);
    });
    return () => { keys.forEach(unregisterCollider); };
  }, [worlds]);
  return (
    <>
      {worlds.map((w, i) => {
        const desc = userPlanetDescriptor(i, w.id);
        // Seed-derived hue: hash the seed string to 0-360
        let h = 0;
        const s = String(w.seed || w.id || i);
        for (let c = 0; c < s.length; c++) h = (h * 31 + s.charCodeAt(c)) % 360;
        const planet = {
          ...desc,
          color: `hsl(${h}, 45%, 55%)`,
        };
        return (
          <PlanetBody
            key={planet.key}
            planet={planet}
            map={null}
            ringMap={null}
            onSelect={() => { window.location.href = w.enter_href || ('/communiverse/world/' + encodeURIComponent(w.id)); }}
          />
        );
      })}
    </>
  );
}

function SunBackground() {
  const sunRef = useRef();
  const [sunMap, setSunMap] = useState(null);
  const [glowMap, setGlowMap] = useState(null);
  
  useEffect(() => {
    let isMounted = true;
    new THREE.TextureLoader().load('/IMG_0035.jpeg', tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        if (isMounted) setSunMap(tex);
    }, undefined, () => {
        const blank = new THREE.DataTexture(new Uint8Array([255, 200, 100, 255]), 1, 1, THREE.RGBAFormat);
        blank.needsUpdate = true;
        if (isMounted) setSunMap(blank);
    });
    // Procedural radial light-bleed texture: a camera-facing halo so the sun
    // never reads as a dark disc from any angle.
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0.0, 'rgba(255, 236, 190, 1)');
    grad.addColorStop(0.22, 'rgba(255, 196, 130, 0.6)');
    grad.addColorStop(0.5, 'rgba(255, 150, 70, 0.2)');
    grad.addColorStop(1.0, 'rgba(255, 120, 40, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const glow = new THREE.CanvasTexture(canvas);
    glow.colorSpace = THREE.SRGBColorSpace;
    if (isMounted) setGlowMap(glow);
    return () => { isMounted = false; glow.dispose(); };
  }, []);

  useFrame((state, delta) => { if (sunRef.current) sunRef.current.rotation.y += delta * 0.01; });
  
  if (!sunMap) return null;

  return (
    <>
      <group position={[0, 158.75, 662.5]}>
        <mesh ref={sunRef}>
          <sphereGeometry args={[67.5, 64, 64]} />
          <meshBasicMaterial map={sunMap} color="#ffcc66" toneMapped={false} />
        </mesh>

        <mesh scale={[1.1, 1.1, 1.1]}>
          <sphereGeometry args={[67.5, 64, 64]} />
          <meshBasicMaterial color="#ffaa55" transparent opacity={0.4} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>

        <mesh scale={[1.3, 1.3, 1.3]}>
          <sphereGeometry args={[67.5, 64, 64]} />
          <meshBasicMaterial color="#ff6600" transparent opacity={0.15} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>

        {/* Light bleed: camera-facing halo, luminous from every angle */}
        {glowMap && (
          <sprite scale={[645, 645, 1]}>
            <spriteMaterial
              map={glowMap}
              color="#ffe2a8"
              transparent
              opacity={0.95}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </sprite>
        )}
        
        <pointLight color="#ffd27f" intensity={4.0} distance={800} decay={1.5} position={[0, 0, 0]} />
      </group>

      <directionalLight
        position={[0, 158.75, 662.5]}
        color="#fff5e6" 
        intensity={0.85} 
        target-position={[0, -30, -80]} 
        castShadow 
        shadow-mapSize={[2048, 2048]} 
        shadow-camera-near={0.5}
        shadow-camera-far={1000}
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={200}
        shadow-camera-bottom={-200}
      />
    </>
  );
}

function SequenceController({ launchState, setLaunchState, portalTex, payloadTex, targetRoute, controls, flightAxis, dropTarget, bikeRef, onBikeDismount, onSatellitePortal }) {
  const { camera } = useThree();
  const router = useRouter(); 
  const bulletRef = useRef();
  const portalRef = useRef();
  const routed = useRef(false);
  const [bulletY, setBulletY] = useState(40);
  // Drag-look offsets while mounted on the bike.
  const lookYaw = useRef(0);
  const lookPitch = useRef(0);
  // Previous launch state: detects the on_bike/to_bike -> hub_freeroam edge
  // so the dismount spot is placed exactly once per dismount.
  const prevLaunchRef = useRef(launchState);
  // Mounted bike-flight state (lib/bike-flight.js) — created on mount,
  // cleared on dismount. This is what makes the bike actually FLY.
  const bikeFlight = useRef(null);
  
  const ATMOSPHERE_Y = 5;
  const PORTAL_POS = [dropTarget[0], ATMOSPHERE_Y, dropTarget[2]];

  useFrame((state, delta) => {
    if (launchState === 'hub_intro') {
      // Spawn in the middle: the camera sits at the constellation's center,
      // ringed by the 10 god bands, and makes one full slow revolution —
      // every satellite and the ad-tower field get their moment — ending
      // dead-ahead on the parked TRON bike (-Z) for a clean freeroam handoff.
      const time = state.clock.elapsedTime;
      camera.position.set(ORBIT_CENTER.x, ORBIT_CENTER.y, ORBIT_CENTER.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(0, -time * ((Math.PI * 2) / 14), 0);

      if (time > 14 || controls.current.moveX !== 0 || controls.current.moveY !== 0 || controls.current.lookDeltaX !== 0 || controls.current.keyW || controls.current.keyS || controls.current.keyA || controls.current.keyD) {
        setLaunchState('hub_freeroam');
      }
    } 
    else if (launchState === 'hub_freeroam') {
      // Dismount edge: coming off the bike — place the rider right BESIDE
      // the bike (offset from the bike's CURRENT position/yaw, never a
      // default spawn point), facing the bike. The page persists the spot
      // per account via onBikeDismount.
      const wasRiding =
        prevLaunchRef.current === 'on_bike' || prevLaunchRef.current === 'to_bike';
      if (wasRiding && bikeRef.current) {
        const bp = bikeRef.current.position;
        const spot = dismountPosition(bp, bikeRef.current.rotation.y);
        // Solid hub: keep the dismount spot out of geometry (slide/deflect).
        resolveFlightCollision(
          { x: camera.position.x, y: camera.position.y, z: camera.position.z },
          spot,
          1.2
        );
        camera.position.set(spot.x, spot.y, spot.z);
        camera.lookAt(bp.x, bp.y + 1.2, bp.z);
        if (typeof onBikeDismount === 'function') {
          try {
            onBikeDismount(spot);
          } catch {
            // Persistence must never break the frame.
          }
        }
      }
      // Leaving the bike: hand flight control back to the rig's parked hover
      // around wherever the bike was left.
      if (bikeRef.current && bikeRef.current.userData.flying) {
        bikeRef.current.userData.flying = false;
        bikeRef.current.userData.baseY = bikeRef.current.position.y;
      }
      bikeFlight.current = null;

      if (controls.current.lookDeltaX !== 0 || controls.current.lookDeltaY !== 0) {
        camera.rotation.order = 'YXZ'; 
        camera.rotation.y -= controls.current.lookDeltaX * 0.003;
        camera.rotation.x -= controls.current.lookDeltaY * 0.003;
        camera.rotation.x = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, camera.rotation.x));
        camera.rotation.z = 0; 
        controls.current.lookDeltaX = 0;
        controls.current.lookDeltaY = 0;
      }

      const moveX = controls.current.moveX + (controls.current.keyD - controls.current.keyA);
      const moveY = controls.current.moveY + (controls.current.keyS - controls.current.keyW);
      
      if (moveX !== 0 || moveY !== 0) {
        const speed = delta * FREE_FLY_SPEED;
        const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawQuat);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yawQuat);

        // Solid hub: sweep the move against every collider and slide/deflect
        // instead of passing through geometry.
        const prevX = camera.position.x;
        const prevY = camera.position.y;
        const prevZ = camera.position.z;

        // Movement mapping lives in lib/flight-axis.js (one source of
        // truth, headless-tested): horizontal = stick up/down drives
        // forward/back on the hub plane; vertical = stick up/down drives
        // climb/descend. Left/right always strafes. Tilt steers climb /
        // descend through the same moveY channel, but only while the
        // axis is vertical (lib/use-tilt.js) — in horizontal mode the
        // phone can tilt freely without drifting up or down.
        const m = flightAxisMove({ moveX, moveY, axis: flightAxis });
        if (m.forward !== 0) camera.position.addScaledVector(forward, m.forward * speed);
        if (m.strafe !== 0) camera.position.addScaledVector(right, m.strafe * speed);
        if (m.climb !== 0) camera.position.y += m.climb * speed;

        resolveFlightCollision(
          { x: prevX, y: prevY, z: prevZ },
          camera.position,
          1.2
        );
      }

      camera.fov = THREE.MathUtils.lerp(camera.fov, controls.current.zoom, delta * 5);
      camera.updateProjectionMatrix();
    }
    else if (launchState === 'to_bike') {
      // Fly the camera from wherever it is into the rider's seat on the bike.
      // Yaw-aware: the bike may have been left pointing anywhere after a ride.
      lookYaw.current = 0;
      lookPitch.current = 0;
      const bikeObj = bikeRef.current;
      const bp = bikeObj ? bikeObj.position : new THREE.Vector3(...BIKE_PARK_POS);
      const yaw = bikeObj ? bikeObj.rotation.y : 0;
      const off = rotateOffsetByYaw(RIDER_OFFSET, yaw);
      const rider = new THREE.Vector3(bp.x + off.x, bp.y + off.y, bp.z + off.z);
      camera.position.lerp(rider, Math.min(1, delta * 2.5));

      const fwd = bikeForward(yaw);
      const look = new THREE.Vector3(
        bp.x + fwd.x * BIKE_LOOK_AHEAD,
        bp.y + 1.0,
        bp.z + fwd.z * BIKE_LOOK_AHEAD
      );
      const currentQuat = camera.quaternion.clone();
      camera.lookAt(look);
      const targetQuat = camera.quaternion.clone();
      camera.quaternion.copy(currentQuat);
      camera.quaternion.slerp(targetQuat, Math.min(1, delta * 3));

      if (camera.position.distanceTo(rider) < 0.8) {
        // Clean handoff: seed the flight model from the bike's real pose and
        // hand the rig to the controller until dismount.
        const p = bikeObj ? bikeObj.position : new THREE.Vector3(...BIKE_PARK_POS);
        bikeFlight.current = createBikeFlightState([p.x, p.y, p.z], yaw);
        if (bikeObj) {
          bikeObj.userData.flying = true;
          // Park the hover bob at the mount point so there's no pop.
          bikeObj.userData.baseY = p.y;
        }
        setLaunchState('on_bike');
      }
    }
    else if (launchState === 'on_bike') {
      // Mounted flight: W/S (or joystick) throttles, A/D steers, FLIGHT AXIS
      // switches W/S between forward/reverse and climb/descend. The camera
      // rides in the rider's seat, facing the bike's nose; drag looks around.
      // Input mapping lives in lib/flight-axis.js (bikeAxisInput): in
      // vertical mode the same stick/keys that throttle forward now climb
      // and descend instead — tilt steers that channel too, but only
      // while the axis is vertical (lib/use-tilt.js).
      const c = controls.current;
      if (!bikeFlight.current) {
        const p0 = bikeRef.current ? bikeRef.current.position : new THREE.Vector3(...BIKE_PARK_POS);
        const y0 = bikeRef.current ? bikeRef.current.rotation.y : 0;
        bikeFlight.current = createBikeFlightState([p0.x, p0.y, p0.z], y0);
        if (bikeRef.current) bikeRef.current.userData.flying = true;
      }
      const st = bikeFlight.current;
      const input = bikeAxisInput({
        keyW: c.keyW,
        keyS: c.keyS,
        keyA: c.keyA,
        keyD: c.keyD,
        moveX: c.moveX,
        moveY: c.moveY,
        axis: flightAxis,
      });

      const step = Math.min(delta, 0.05);
      const prevPos = { x: st.pos.x, y: st.pos.y, z: st.pos.z };
      stepBikeFlight(st, input, step, BIKE_TUNING);

      // Solid hub: a bump deflects and scrubs speed — never kills the ride.
      if (resolveFlightCollision(prevPos, st.pos, 3)) {
        st.speed *= 0.3;
        st.vertSpeed *= 0.3;
      }

      const t = state.clock.elapsedTime;
      if (bikeRef.current) {
        // Controller owns the mounted ride: pose + gentle hover bob +
        // bank into turns. (No hub bike object anymore — this only runs
        // if a bike ref is ever attached again.)
        bikeRef.current.position.set(
          st.pos.x,
          st.pos.y + Math.sin(t * 2.2) * 0.25,
          st.pos.z
        );
        bikeRef.current.rotation.y = st.yaw;
        bikeRef.current.rotation.z = THREE.MathUtils.lerp(
          bikeRef.current.rotation.z,
          // Bank INTO the turn: positive steer (right) leans the bike right
          // — in the bike's local frame its top tips toward −X, the rider's
          // right when facing the +Z nose, which is positive rotation.z.
          // (Sign flipped with the 2026-10-21 steering fix in bike-flight.)
          input.steer * 0.38,
          Math.min(1, step * 6)
        );
      }

      const off = rotateOffsetByYaw(RIDER_OFFSET, st.yaw);
      camera.position.set(st.pos.x + off.x, st.pos.y + off.y, st.pos.z + off.z);

      lookYaw.current -= c.lookDeltaX * 0.003;
      lookPitch.current -= c.lookDeltaY * 0.003;
      lookPitch.current = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, lookPitch.current));
      c.lookDeltaX = 0;
      c.lookDeltaY = 0;

      camera.rotation.order = 'YXZ';
      camera.rotation.set(lookPitch.current, Math.PI + st.yaw + lookYaw.current, 0);
    }
    else if (launchState === 'returning_to_satellite') {
      // Launching (possibly from the bike): stand the flight model down so
      // the rig resumes its parked hover wherever it was left.
      if (bikeRef.current && bikeRef.current.userData.flying) {
        bikeRef.current.userData.flying = false;
        bikeRef.current.userData.baseY = bikeRef.current.position.y;
      }
      bikeFlight.current = null;

      const viewPos = new THREE.Vector3(dropTarget[0], 65, dropTarget[2] + 35);
      camera.position.lerp(viewPos, delta * 4);

      const currentQuat = camera.quaternion.clone();
      camera.lookAt(new THREE.Vector3(...dropTarget));
      const targetQuat = camera.quaternion.clone();
      camera.quaternion.copy(currentQuat);
      camera.quaternion.slerp(targetQuat, delta * 6);

      if (camera.position.distanceTo(viewPos) < 2) {
        setBulletY(40); 
        setLaunchState('dropping');
      }
    }
    else if (launchState === 'dropping') {
      const newY = bulletY - delta * 15; 
      setBulletY(newY);
      bulletRef.current.position.set(dropTarget[0], newY, dropTarget[2]);
      
      const camTarget = new THREE.Vector3(dropTarget[0], newY + 8, dropTarget[2] + 5);
      camera.position.lerp(camTarget, delta * 5);
      
      const lookPos = new THREE.Vector3(dropTarget[0], newY - 10, dropTarget[2]);
      const currentQuat = camera.quaternion.clone();
      camera.lookAt(lookPos);
      const targetQuat = camera.quaternion.clone();
      camera.quaternion.copy(currentQuat);
      camera.quaternion.slerp(targetQuat, delta * 8);

      if (newY <= ATMOSPHERE_Y + 10) setLaunchState('portal_opening');
    }
    else if (launchState === 'portal_opening') {
      portalRef.current.scale.lerp(new THREE.Vector3(8, 8, 8), delta * 5);
      portalRef.current.rotation.z += delta * 2;
      
      const newY = bulletY - delta * 15;
      setBulletY(newY);
      bulletRef.current.position.set(dropTarget[0], newY, dropTarget[2]);
      
      const camTarget = new THREE.Vector3(dropTarget[0], newY + 5, dropTarget[2] + 2);
      camera.position.lerp(camTarget, delta * 5);
      
      const lookPos = new THREE.Vector3(dropTarget[0], ATMOSPHERE_Y, dropTarget[2]);
      const currentQuat = camera.quaternion.clone();
      camera.lookAt(lookPos);
      const targetQuat = camera.quaternion.clone();
      camera.quaternion.copy(currentQuat);
      camera.quaternion.slerp(targetQuat, delta * 8);

      if (newY <= ATMOSPHERE_Y - 2) setLaunchState('entering');
    }
    else if (launchState === 'entering') {
      camera.position.lerp(new THREE.Vector3(dropTarget[0], ATMOSPHERE_Y - 5, dropTarget[2]), delta * 8);
      portalRef.current.rotation.z += delta * 5;
      
      if (camera.position.y < ATMOSPHERE_Y && !routed.current) {
        routed.current = true;
        // The satellite drop now hands off to the vortex tube (Merlin,
        // 2026-10-29) — the fullscreen ride carries the user the last
        // stretch, then the caller routes. External links skip the tube.
        if (onSatellitePortal) {
          onSatellitePortal(targetRoute);
        } else if (targetRoute.startsWith('http')) {
          window.location.href = targetRoute;
        } else {
          router.push(targetRoute);
        }
      }
    }
    prevLaunchRef.current = launchState;
  });

  return (
    <group>
      {(launchState === 'dropping' || launchState === 'portal_opening') && (
        <mesh ref={bulletRef} position={[dropTarget[0], bulletY, dropTarget[2]]}>
          <cylinderGeometry args={[1.5, 1.5, 6, 32, 1, true]} />
          <meshBasicMaterial map={payloadTex} color="#ffffff" transparent opacity={0.95} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
      )}
      {(launchState === 'portal_opening' || launchState === 'entering') && (
        <mesh ref={portalRef} position={PORTAL_POS} rotation={[-Math.PI / 2, 0, 0]} scale={0}>
          <circleGeometry args={[1, 32]} />
          <meshBasicMaterial map={portalTex} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function TextureProvider({ onLaunchExternal }) {
  const [textures, setTextures] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loader = new THREE.TextureLoader();
    const texKeys = ['propTex', 'bodyTex', 'hullTex', 'tailTex', 'adTex'];
    const urls = [
      '/IMG_3078.jpeg',
      '/IMG_3079.jpeg',
      '/IMG_3077.jpeg',
      '/IMG_3076.jpeg',
      '/98e9a2ae9bd79f47859ccfabbdbc6f51.jpeg'
    ];
    
    let loadedCount = 0;
    const loadedTextures = {};

    const checkComplete = () => {
      if (loadedCount === urls.length && isMounted) {
        Object.values(loadedTextures).forEach(t => {
          if (t && t.isTexture) {
            t.wrapS = THREE.RepeatWrapping;
            t.wrapT = THREE.RepeatWrapping;
            t.colorSpace = THREE.SRGBColorSpace;
          }
        });
        // The ad creative maps onto the widened 12.64×7.0 panel faces:
        // cover-fit it (center-crop, no stretch) instead of warping the
        // source art. NOTE: this texture is shared with the god panels
        // (whose planes are 3.8x4.5, never fit for themselves) — splitting
        // their fit is a follow-up, not done here.
        // The body/hull/prop/tail textures are cylinder wraps — tiling is
        // correct for those, so they keep plain repeat wrapping.
        try {
          const ad = loadedTextures.adTex;
          if (ad && ad.isTexture && ad.image && ad.image.width > 1) {
            applyCoverFit(ad, ad.image.width, ad.image.height, 12.64, 7.0);
          }
        } catch { /* honest fallback: uncorrected mapping, never a crash */ }
        setTextures(loadedTextures);
      }
    };

    urls.forEach((url, i) => {
      loader.load(url, (tex) => {
        loadedTextures[texKeys[i]] = tex;
        loadedCount++;
        checkComplete();
      }, undefined, (err) => {
        const blank = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255]), 1, 1, THREE.RGBAFormat);
        blank.needsUpdate = true;
        loadedTextures[texKeys[i]] = blank;
        loadedCount++;
        checkComplete();
      });
    });

    return () => { isMounted = false; };
  }, []);

  // Manager-wired billboards (Merlin, 2026-10-27): the live manifest
  // is repo content written by the builder via the push path — never
  // by the manager page. A missing manifest (or a failed fetch) just
  // means no overrides: the rotating inventory below stays as-is.
  const [billboardManifest, setBillboardManifest] = useState(null);
  useEffect(() => {
    let live = true;
    fetch('/billboards/manifest.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => { if (live) setBillboardManifest(json); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // Stopped billboard ads (paused for short credit, or cancelled on
  // opt-out): the hub drops their manifest entries so the ad stops
  // showing without a manifest rewrite. A missing endpoint (or a
  // failed fetch) just means nothing is stopped.
  const [stoppedBillboards, setStoppedBillboards] = useState([]);
  useEffect(() => {
    let live = true;
    fetch('/api/billboard-requests/paused')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => { if (live && json) setStoppedBillboards(json.stopped || []); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // Active solo billboards (whole-space purchases, Merlin's playlist
  // rule 2026-10-27): the hub forces a solo board to the buyer's ad
  // alone from live subscription state, so a solo takes its number
  // immediately — even before the next manifest wire — and the house
  // ad + rotating entries stay off that number for the solo term. A
  // missing endpoint (or a failed fetch) just means no solo boards.
  const [soloBillboards, setSoloBillboards] = useState([]);
  useEffect(() => {
    let live = true;
    fetch('/api/billboards/solo')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => { if (live && json) setSoloBillboards(json.solo || []); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // Deterministic ad panels per tower (panel 0 = Merlin's native stake.com
  // slot on every tower; panels 1–3 rotate the real billboard inventory).
  // Memoized so the memoized GodTower never sees a fresh array identity.
  // NOTE: this hook MUST stay above the early return below — React requires
  // every hook to run on every render in the same order. When it sat below
  // `if (!textures) return null`, the first render ran 2 hooks and the
  // post-load render ran 3, throwing React error #310 and white-screening
  // the homepage (2026-10-01). panelsForTower is deterministic and does not
  // depend on `textures`, so hoisting is behavior-preserving.
  // Manager overrides (when the manifest lands) replace the slot for
  // their billboard number — including stake numbers Merlin explicitly
  // sets — and leave every other panel on the base assignment.
  // Stopped ads (paused or cancelled) are dropped from the overrides
  // first, so a billboard whose only ad stopped falls back to its
  // base inventory slot instead of showing a dead ad. Active solos
  // resolve inside manifestToOverrides (solo entry alone on its
  // number, even when the manifest is stale).
  const towerPanels = useMemo(
    () => {
      const soloMap = new Map(
        (soloBillboards || []).map((s) => [Number(s.billboardNumber), s])
      );
      const overrides = dropPausedOverrides(manifestToOverrides(billboardManifest, soloMap), stoppedBillboards);
      return GOD_TOWER_SPOTS.map((_, i) => applyOverridesToTowerPanels(panelsForTower(i), i, overrides));
    },
    [billboardManifest, stoppedBillboards, soloBillboards]
  );

  // Panel videos preload in the BACKGROUND (Merlin, 2026-10-27 fix):
  // towers render immediately on mount — NEVER gated on video load,
  // manifest settle, or any list. The 2026-10-27 gate hid the whole
  // satellite system on his phone: the manifest fetch has no timeout
  // (a stall leaves the gate shut forever), and a detached video
  // element on iOS may never fire canplay, so the 20s per-URL timeout
  // path held towers back for the full window. The preload still
  // runs in strict billboard-number order 1→44 whenever the tower
  // panels change, so downloads start early; each panel swaps its
  // video in the moment its URL is ready, and until then shows the
  // honest branded face, never black or blank.
  useEffect(() => {
    preloadHubPanelVideos(towerPanels).catch(() => {});
    return undefined;
  }, [towerPanels]);

  if (!textures) return null;

  // One tower satellite per god-menu category (Merlin, 2026-09-30) —
  // the Zeus pattern with the name and color changed per category.
  // Colors come from the god bands so towers match their ring satellites.
  return (
    <>
      {GOD_TOWER_SPOTS.map((spot, i) => (
        <GodTower
          key={spot.god}
          god={spot.god}
          color={GOD_BANDS[i].color}
          position={spot.pos}
          onLaunchExternal={(url) => onLaunchExternal(url, spot.pos)}
          textures={textures}
          panels={towerPanels[i]}
          towerIndex={i}
        />
      ))}
    </>
  );
}


// ---------------------------------------------------------------------------
// SystemRings — the grand rings of the planetary system
// (Merlin, 2026-10-20): eleven rainbow rings centered on MARS
// (MARS_CENTER, lib/god-orbits.js) — they belong to the planet, out
// where the planets live. The loading spot is dead center of the hub
// and the satellites' circle (the towers at 150, colliders reaching
// 172) is the boundary: no part of any ring is inside that circle or
// between the loading spot and the satellites (nearest ring arc
// ≈ 201 from ORBIT_CENTER; the planets share this outer zone at
// lanes 195–231 and clear the ring tori by ≈ 17, sampled). The
// first ring (52) sits just
// outside Mars' sphere (r45), the family steps +4 out to 92. Static,
// NOT part of the satellites' counter-rotating assembly. Near-flat
// alternating tilts (SYSTEM_RING_TILTS, ≤ 0.009 rad). Radii/tilts
// live in lib/god-orbits.js.
// ---------------------------------------------------------------------------
function SystemRings() {
  return (
    <group position={[MARS_CENTER.x, MARS_CENTER.y, MARS_CENTER.z]}>
      {SYSTEM_RING_RADII.map((R, i) => (
        <group key={R} rotation={[0, 0, SYSTEM_RING_TILTS[i]]}>
          <mesh rotation-x={Math.PI / 2}>
            <torusGeometry args={[R, 0.2, 8, 256]} />
            <meshBasicMaterial
              color={`hsl(${Math.round((i * 360) / SYSTEM_RING_RADII.length)}, 85%, 60%)`}
              transparent
              opacity={0.85}
              fog={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}


// ---------------------------------------------------------------------------
// StaticColliders — solid-geometry registration for the hub's big bodies.
// Satellites, Moon, asteroids, and the god towers register their own (live)
// colliders; Earth, Sun, and Mars are static and live here.
// Everything solid: bounce/deflect, never kill. Portals stay the sole
// pass-through exception (they're launch effects, not colliders).
// ---------------------------------------------------------------------------
function StaticColliders() {
  useEffect(() => {
    registerCollider('earth', () => ({ ...EARTH_CENTER }), EARTH_RADIUS + 1);
    registerCollider('sun', () => ({ x: 0, y: 158.75, z: 662.5 }), 68);
    registerCollider('mars', () => ({ ...MARS_CENTER }), MARS_RADIUS);
    PLANETS.forEach((p) => registerCollider('planet-' + p.key, () => ({ ...p.center }), p.radius));
    return () => {
      ['earth', 'sun', 'mars', ...PLANETS.map((p) => 'planet-' + p.key)].forEach(unregisterCollider);
    };
  }, []);
  return null;
}


// ---------------------------------------------------------------------------
// HubScene — the client-only 3D hub scene itself. Mounted by the guarded
// HomeScene wrapper below (app/page.jsx loads the wrapper through
// next/dynamic with ssr:false). All DOM/UI around it stays in the page.
// Canvas props, child order, and every prop below are byte-identical to
// the inline version that used to live in app/page.jsx — pure code-split —
// with ONE deliberate addition: the Canvas onCreated hook that routes a
// live WebGL context loss to the wrapper's fallback.
// ---------------------------------------------------------------------------
function HubScene({
  bgVideoOk,
  appState,
  setAppState,
  satIndex,
  targetRoute,
  controlsRef,
  flightAxis,
  adWindowRef,
  activeSatTarget,
  bikeRef,
  earthQuatRef,
  earthFocus,
  pendingDest,
  arriveEarth,
  beginEarthDive,
  beginMarsDive,
  marsProfile,
  marsTime,
  marsMode,
  marsInputRef,
  marsFocusReq,
  onMarsSelect,
  marsSelectedId,
  beginPlanetDive,
  planetProfile,
  planetTime,
  planetMode,
  planetInputRef,
  planetFocusReq,
  onPlanetSelect,
  planetSelectedId,
  planetPosRef,
  onLaunchExternal,
  onBikeDismount,
  onSatellitePortal,
  onHubPortal,
  heavenUnlocked,
  onContextLost,
  vgogh,
}) {
  // Keep the quaternion ref initialized without the page needing three.js.
  if (!earthQuatRef.current) earthQuatRef.current = new THREE.Quaternion();

  // Effect-video textures for the black-hole portal and payload bay
  // (browser-compatible MP4; SequenceController falls back to a plain
  // material if a file is missing — honest, never a fake video).
  const [payloadTex, setPayloadTex] = useState(null);
  const [kingHoleTex, setKingHoleTex] = useState(null);
  useEffect(() => {
    const loadEffectVideo = (src) => {
      const vid = document.createElement("video");
      vid.src = src; vid.crossOrigin = "Anonymous"; vid.loop = true; vid.muted = true; vid.playsInline = true;
      vid.play().catch(e => console.warn("Auto-play prevented", e));
      const tex = new THREE.VideoTexture(vid);
      tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    };

    setKingHoleTex(loadEffectVideo('/chess/assets/effects/gemini_generated_video_758D2655.mp4'));
    setPayloadTex(loadEffectVideo('/gemini_generated_video_65272AD7.mp4'));
  }, []);

  // Mars realm (Merlin, 2026-10-21): while appState is 'mars_surface'
  // the hub's visuals stand down entirely and the seeded Mars surface
  // (MarsRealmContent, self-lit with its own sky/fog) renders at the
  // origin instead — the same in-Canvas realm pattern as Earth. The
  // camera controllers need no branch for it: SequenceController and
  // EarthFlightController only act on their own states, so the Mars
  // rig (OrbitControls / FirstPerson) owns the camera here, exactly
  // as EarthWalker owns it in earth_roam.
  const inMars = appState === 'mars_surface';
  // Planet realms (Merlin, 2026-10-22): 'planet_surface' is the same
  // realm pattern with the active planet's profile — hub visuals
  // stand down, the seeded surface renders at the origin, and the
  // camera controllers idle (verified: SequenceController and
  // EarthFlightController branch only on their own named states, so
  // 'planet_surface' — like 'mars_surface' — leaves the camera to
  // the realm's own rig).
  const inPlanet = appState === 'planet_surface';
  const inRealm = inMars || inPlanet;

  return (
      <Canvas shadows="soft" dpr={[1, 1.75]} gl={{ alpha: true, antialias: false, powerPreference: 'default' }} camera={{ position: [ORBIT_CENTER.x, ORBIT_CENTER.y, ORBIT_CENTER.z], fov: 52, far: 2000 }} style={{ pointerEvents: 'auto' }} onCreated={({ gl }) => {
        // Pixel-ratio cap (2026-10-26 outage repair): uncapped, a
        // phone renders at its full device pixel ratio (up to 3x),
        // tripling the shaded pixels every frame on top of a heavy
        // scene — the "chunky, brutal" feel in Merlin's footage.
        // 1.75 keeps the hub sharp on phones (the Myriad precedent)
        // at roughly a third of the fill-rate cost.
        // Live context loss (GPU reset, driver hiccup, OS sleep): hand it
        // to the wrapper, which swaps in the 2D fallback — never a dead
        // canvas and never the global error screen.
        gl.domElement.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
          if (onContextLost) onContextLost();
        });
      }}>
        {!bgVideoOk && !inRealm && (
          <color key={vgogh ? 'vgogh-bg' : 'std-bg'} attach="background" args={[vgogh ? '#0a1030' : '#050505']} />
        )}
        {/* Thin fog: the tower field (~180 out) must read clearly from
            spawn, not vanish into haze. The realms attach their own
            fog, so the hub's stands down while one is mounted.
            Van Gogh mode fades to deep blue, not black. */}
        {!inRealm && (
          <fogExp2 key={vgogh ? 'vgogh-fog' : 'std-fog'} attach="fog" args={[vgogh ? '#101a4a' : '#050505', 0.0016]} />
        )}
        {!inRealm && (
          <>
            {vgogh ? (
              <VanGoghSky />
            ) : (
              <Stars radius={400} depth={200} count={20000} factor={5} saturation={0} fade speed={1} />
            )}

            {/* Seasonal decoration cycle: date-driven holiday decor + Merlin's
                Christmas tree (Nov 22 - Twelfth Night). Renders nothing off-season. */}
            <SeasonalDecor />
          </>
        )}

        {!inRealm && <ambientLight intensity={0.4} color="#222233" />}

        <Suspense fallback={null}>
          {inMars ? (
            <MarsRealmContent
              key={marsProfile.seed}
              profile={marsProfile}
              timeOfDay={marsTime}
              mode={marsMode}
              inputRef={marsInputRef}
              focusReq={marsFocusReq}
              onSelect={onMarsSelect}
              selectedId={marsSelectedId}
            />
          ) : inPlanet ? (
            <PlanetRealmContent
              key={planetProfile.seed}
              profile={planetProfile}
              timeOfDay={planetTime}
              mode={planetMode}
              inputRef={planetInputRef}
              focusReq={planetFocusReq}
              onSelect={onPlanetSelect}
              selectedId={planetSelectedId}
              posRef={planetPosRef}
            />
          ) : (
          <>
            {!['diving_to_street', 'earth_roam'].includes(appState) && <SunBackground />}
            {/* THE OMEGA ARCH + EARTH 2 DOOR — REMOVED 2026-10-31 (Merlin):
                both portals stood just beyond the Sun; the Omega portal
                now lives as a street-light lamp at the bottom of the
                Earth chooser (app/page.jsx chooseOmegaPortal — same
                handleSatellitePortal('/portal-room') the arch called),
                and Earth 2 is reached through the chooser's Earth 2
                button. Components kept (OmegaHubGate, Earth2HubGate)
                but no longer mounted in hub space. */}
          <NexusEarth
            onSelect={appState === 'hub_freeroam' ? beginEarthDive : null}
            quatRef={earthQuatRef}
            focus={earthFocus}
            phase={appState}
            spinEnabled={appState === 'hub_intro' || appState === 'hub_freeroam'}
            controls={controlsRef}
            onTeleportNYC={() => router.push('/mega-city')}
          />
            {!['diving_to_street', 'earth_roam'].includes(appState) && <MarsBackground onSelect={appState === 'hub_freeroam' ? beginMarsDive : null} />}
            {/* Hub vista hides at street level (2026-10-26, street
                QA 3): god labels, towers, satellites and rainbow
                rings bled through the street sky — same gate the
                Moon and NavBeacons already used. NexusEarth itself
                stays: it IS the street. */}
            {!['diving_to_street', 'earth_roam'].includes(appState) && <BackdropPlanets onPlanetSelect={appState === 'hub_freeroam' ? beginPlanetDive : null} />}
            {/* User-forged planets on the outward spiral (Merlin, 2026-10-30) */}
            {!['diving_to_street', 'earth_roam'].includes(appState) && <UserPlanets />}
            {/* The planetary system's grand rainbow rings — fixed frame
                around the planets, outside the satellite hollow. */}
            {!['diving_to_street', 'earth_roam'].includes(appState) && <SystemRings />}
            {!['diving_to_street', 'earth_roam'].includes(appState) && <TextureProvider onLaunchExternal={onLaunchExternal} />}
            {/* Hub satellite constellation — 10 physical textured satellites.
                The floating video button's satellite menu is the single way
                into programs; the rings no longer launch anything. */}
            {!['diving_to_street', 'earth_roam'].includes(appState) && <GodOrbitRings />}
            {/* THE HUB PORTALS (Merlin, 2026-11-13): two horizontal
                nanite discs — Heaven above the tower top (locked
                until 1 Nether Realm visit), Nether below Earth.
                Same street-level gate as the rest of the vista. */}
            {!['diving_to_street', 'earth_roam'].includes(appState) && (
              <HubPortals heavenUnlocked={heavenUnlocked} onPortalClick={onHubPortal} />
            )}
            {/* The Moon, the asteroid belt, and the waypoint beacons.
                The Moon hides at street level (2026-10-26 outage
                repair): its Billboard label bled through the street
                sky as a faint "MOON" in Merlin's footage — same gate
                as NavBeacons below, orbit views keep it. */}
            {!['diving_to_street', 'earth_roam'].includes(appState) && <HubMoon />}
            {!['diving_to_street', 'earth_roam'].includes(appState) && <AsteroidField />}
            {/* Occasional twin-panel fighter fly-throughs across the
                front vista (Merlin, 2026-10-23) — the lane, schedule
                and clearance proof live in lib/hub-flight.js. */}
            {!['diving_to_street', 'earth_roam'].includes(appState) && <HubTieFlight />}
            {/* Hide waypoint beacons at street level (they're orbit navigation aids) */}
            {!['diving_to_street', 'earth_roam'].includes(appState) && <NavBeacons />}
          <StaticColliders />
          {/* NOTE (declutter, 2026-09-29): the persistent space-portal gate
              field was removed from the interface — too cluttered. The
              launch-travel portal effects (portalTex/payloadTex in
              SequenceController) are the original portals and stay. Every
              program remains reachable through the floating button's
              satellite menu. */}
            {/* Parked hub bike display removed 2026-10-27 (Merlin: clutter). */}
          </>
          )}
        </Suspense>

        <SequenceController
          launchState={appState}
          setLaunchState={setAppState}
          portalTex={kingHoleTex}
          payloadTex={payloadTex}
          targetRoute={targetRoute}
          controls={controlsRef}
          flightAxis={flightAxis}
          adWindowRef={adWindowRef}
          dropTarget={activeSatTarget}
          bikeRef={bikeRef}
          onBikeDismount={onBikeDismount}
          onSatellitePortal={onSatellitePortal}
        />

        <EarthFlightController
          launchState={appState}
          setLaunchState={setAppState}
          quatRef={earthQuatRef}
          focus={earthFocus}
          pendingDest={pendingDest}
          onArriveDest={arriveEarth}
          controls={controlsRef}
        />

        <EffectComposer>
          <Bloom luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={0.6} />
        </EffectComposer>
      </Canvas>
  );
}


// ---------------------------------------------------------------------------
// WebGL resilience guard (2026-10-15) — the default export.
//
// Why: three.js throws "Error creating WebGL context." synchronously at
// Canvas mount on browsers/devices that cannot create a WebGL context
// (crawlers, GPU-blocklisted or ancient browsers). With no local guard the
// throw escaped to app/global-error.jsx, which replaces the ENTIRE page —
// auth, menus, every DOM control — with the error screen (client_errors
// class B, the site's #1 client error: 47 rows since 2026-10-01).
//
// The guard, in order:
//   1. Pre-flight probe (lib/webgl-support.js): if WebGL is unavailable,
//      the Canvas never mounts — the fallback renders instead.
//   2. SceneErrorBoundary around the scene: any render/mount failure is
//      caught HERE and swapped for the same fallback.
//   3. A webglcontextlost listener (attached in HubScene's Canvas
//      onCreated) routes live context loss to the fallback too.
// The fallback is the scene's dark shell plus a short notice; the page's
// DOM UI is a sibling of this component and stays fully intact and
// functional either way. Capable browsers see zero change.
// ---------------------------------------------------------------------------

// Fire-and-forget report when the fallback engages, so the crew can see
// how often real devices land here (kind 'scene-fallback', distinct from
// the global boundary's reports). Mirrors global-error.jsx's reporter:
// never throws, never blocks rendering. The API route dedupes bursts.
function reportSceneFallback(error) {
  try {
    const payload = JSON.stringify({
      kind: 'scene-fallback',
      message: String((error && error.message) || 'WebGL unavailable').slice(0, 500),
      stack: String((error && error.stack) || '').slice(0, 2500),
      digest: null,
      url: typeof window !== 'undefined' ? window.location.href.slice(0, 300) : '',
      ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : '',
    });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(
        '/api/client-error',
        new Blob([payload], { type: 'application/json' })
      );
    } else if (typeof fetch !== 'undefined') {
      fetch('/api/client-error', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* reporter never throws */
  }
}

class SceneErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return { failed: true, errorMessage: String((error && error.message) || error || '').slice(0, 300) };
  }

  componentDidCatch(error) {
    reportSceneFallback(error);
    // Store the error message so the fallback UI can display it
    if (this.props.onError) {
      try { this.props.onError(String((error && error.message) || error || '').slice(0, 300)); } catch {}
    }
  }

  render() {
    if (this.state.failed && this.props.fallback) {
      // Clone the fallback element to inject the error message
      const { fallback } = this.props;
      if (isValidElement(fallback)) {
        return cloneElement(fallback, { threeError: this.state.errorMessage });
      }
      return fallback;
    }
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// The dark shell + notice shown in place of the 3D scene. Purely visual
// (inherits the wrapper's pointer-events-none), so nothing on the page
// becomes unclickable because of it. Styled to match global-error.jsx.
// Includes a retry button: iOS Safari sometimes fails the WebGL probe
// transiently (GPU process pressure, context limit), and a re-probe
// after a moment often succeeds.
function ThreeDUnavailableNotice({ onRetry, diagnosis, threeError }) {
  return (
    <div className="absolute inset-0 bg-[#050505] flex items-center justify-center pointer-events-auto" role="status">
      <div className="text-center px-6 max-w-md">
        <div className="text-[0.7rem] tracking-[0.3em] text-cyan-300 mb-4">NEXUS VORTEX</div>
        <h2 className="text-zinc-100 text-xl font-extrabold mb-3">3D is unavailable on this device</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          This browser couldn&apos;t start WebGL, so the 3D hub is resting — everything
          else still works: sign-in, menus, and every program in the hub.
        </p>
        {diagnosis && diagnosis.detail && (
          <p className="text-xs text-zinc-500 leading-relaxed mt-3 font-mono">
            {diagnosis.detail}
          </p>
        )}
        {threeError && (
          <p className="text-xs text-red-400/80 leading-relaxed mt-2 font-mono break-words">
            3D error: {threeError}
          </p>
        )}
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-6 px-6 py-3 rounded-full bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 text-sm font-semibold tracking-wide hover:bg-cyan-500/30 active:scale-95 transition-all"
          >
            Try 3D Again
          </button>
        )}
        <p className="text-[11px] text-zinc-600 leading-relaxed mt-4">
          {diagnosis && diagnosis.suggestion ? diagnosis.suggestion : (
            <>Tip: close other browser tabs, turn off Low Power Mode, and make sure you&apos;re not in Private Browsing.</>
          )}
        </p>
      </div>
    </div>
  );
}

export default function HomeScene(props) {
  // Keep the quaternion ref initialized without the page needing three.js —
  // on every path below, fallback included.
  if (!props.earthQuatRef.current) props.earthQuatRef.current = new THREE.Quaternion();
  // Radio-sheet layering (demo fix, 2026-10-15): the page passes
  // radioSheetOpen while the Nexus Radio library sheet is open; the
  // seasonal overlays below (Halloween badge, season toast, trophy
  // overlay) then hide so they can never render over the sheet. It is a
  // page-UI concern, not a scene prop — keep it out of HubScene's spread.
  const { radioSheetOpen, ...sceneProps } = props;

  // Pre-flight probe, once, before the Canvas ever mounts.
  const [webglOk, setWebglOk] = useState(() => probeWebGL());
  const [diagnosis, setDiagnosis] = useState(() => diagnoseWebGL());
  const [contextLost, setContextLost] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const reportedRef = useRef(false);

  // Van Gogh sky (Merlin, 2026-10-31): separate background option,
  // toggled in Concourse Settings → Sky. Syncs from the ui-settings
  // cache + broadcast event; drives the module flag (canvas labels),
  // the body class (DOM text shadows), and the sky/fog swap below.
  const [vgogh, setVgogh] = useState(false);
  useEffect(() => {
    const apply = () => {
      try {
        const s = resolveUiSettings(readUiSettingsCache(window.localStorage));
        const v = !!s.vgogh;
        setVgogh(v);
        setVanGoghActive(v);
        document.body.classList.toggle(VANGOGH_BODY_CLASS, v);
      } catch {}
    };
    apply();
    window.addEventListener(UI_SETTINGS_EVENT, apply);
    return () => {
      window.removeEventListener(UI_SETTINGS_EVENT, apply);
      try { document.body.classList.remove(VANGOGH_BODY_CLASS); } catch {}
      setVanGoghActive(false);
    };
  }, []);

  // Retry the WebGL probe (iOS Safari transient failures). Reset the
  // memoized verdict, wait a beat for the GPU process to settle, re-probe.
  const retryWebGL = () => {
    resetWebGLProbeCache();
    // Small delay lets Safari's GPU process recover from pressure.
    setTimeout(() => {
      const diag = diagnoseWebGL();
      setDiagnosis(diag);
      setRetryCount((c) => c + 1);
      setWebglOk(diag.ok);
      if (diag.ok) {
        setContextLost(false);
        reportedRef.current = false;
      }
    }, 800);
  };

  useEffect(() => {
    if (!webglOk && !reportedRef.current) {
      reportedRef.current = true;
      reportSceneFallback(new Error('WebGL unavailable (pre-flight probe)'));
    }
  }, [webglOk]);

  const handleContextLost = () => {
    if (!reportedRef.current) {
      reportedRef.current = true;
      reportSceneFallback(new Error('WebGL context lost'));
    }
    setContextLost(true);
  };

  const unavailable = !webglOk || contextLost;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {unavailable ? (
        <ThreeDUnavailableNotice onRetry={retryWebGL} diagnosis={diagnosis} />
      ) : (
        <SceneErrorBoundary fallback={<ThreeDUnavailableNotice onRetry={retryWebGL} diagnosis={diagnosis} />}>
          <HubScene {...sceneProps} vgogh={vgogh} onContextLost={handleContextLost} />
        </SceneErrorBoundary>
      )}
      <div
        style={radioSheetOpen ? { visibility: 'hidden' } : undefined}
        aria-hidden={radioSheetOpen || undefined}
      >
        {/* The season badge moved into the bottom of the Concourse
            (Merlin, 2026-10-20); toasts and the trophy stay here. */}
        <SeasonToast />
        <TrophyOverlay />
      </div>
    </div>
  );
}
