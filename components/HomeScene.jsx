'use client';

// HomeScene: the hub's 3D orbit scene, code-split out of app/page.jsx via
// next/dynamic (ssr:false) so the heavy three.js stack (fiber, drei,
// postprocessing, three) and every god panel only load for the 3D hub.
// Scene, markup, ad inventory (tower panels: Merlin's native stake.com slot
// plus the rotating billboard partner inventory), and camera logic are
// byte-identical to the inline version — this is a pure code-split.
import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';
import GodOrbitRings from './GodOrbitRings';
import BikeRig, { BIKE_PARK_POS, RIDER_OFFSET, BIKE_LOOK_AHEAD } from './BikeRig';
import NexusEarth from './NexusEarth';
import HubMoon from './HubMoon';
import AsteroidField from './AsteroidField';
import NavBeacons from './NavBeacons';
import EarthFlightController from './EarthFlightController';
import { ORBIT_CENTER, EARTH_CENTER, EARTH_RADIUS, GOD_BANDS } from '../lib/god-orbits';
import { FREE_FLY_SPEED, BIKE_TUNING } from '../lib/hub-layout';
import { registerCollider, unregisterCollider, resolveFlightCollision } from '../lib/hub-collision';
import { createBikeFlightState, stepBikeFlight, rotateOffsetByYaw, bikeForward } from '../lib/bike-flight';
import { dismountPosition } from '../lib/rider-state';
import SeasonalDecor, { SeasonBadge } from './SeasonalDecor';
import { applyCoverFit } from '../lib/texture-fit';
import { GOD_TOWER_SPOTS } from '../lib/home-positions';
import { panelsForTower } from '../lib/tower-panels';
import GodTower from './GodTower';

function MarsBackground() {
  const marsRef = useRef();
  useFrame((state, delta) => { if (marsRef.current) marsRef.current.rotation.y += delta * 0.05; });
  
  return (
    <group position={[-70, 45, -100]}>
      <mesh ref={marsRef} receiveShadow castShadow>
        <sphereGeometry args={[30, 64, 64]} />
        <meshStandardMaterial color="#b33900" roughness={0.9} metalness={0.1} />
      </mesh>

      <pointLight color="#ff4500" intensity={0.8} distance={100} position={[0, 0, 35]} />

      <mesh scale={[1.035, 1.035, 1.035]}>
        <sphereGeometry args={[30, 64, 64]} />
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
      <group position={[0, 90, 250]}>
        <mesh ref={sunRef}>
          <sphereGeometry args={[45, 64, 64]} />
          <meshBasicMaterial map={sunMap} color="#ffcc66" toneMapped={false} />
        </mesh>

        <mesh scale={[1.1, 1.1, 1.1]}>
          <sphereGeometry args={[45, 64, 64]} />
          <meshBasicMaterial color="#ffaa55" transparent opacity={0.4} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
        
        <mesh scale={[1.3, 1.3, 1.3]}>
          <sphereGeometry args={[45, 64, 64]} />
          <meshBasicMaterial color="#ff6600" transparent opacity={0.15} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>

        {/* Light bleed: camera-facing halo, luminous from every angle */}
        {glowMap && (
          <sprite scale={[430, 430, 1]}>
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
        position={[0, 90, 250]} 
        color="#ffffff" 
        intensity={1.5} 
        target-position={[0, -60, -120]} 
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

function SequenceController({ launchState, setLaunchState, portalTex, payloadTex, targetRoute, controls, flightAxis, dropTarget, bikeRef, onBikeDismount }) {
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

        if (flightAxis === 'horizontal') {
          camera.position.addScaledVector(forward, -moveY * speed);
          camera.position.addScaledVector(right, moveX * speed);
        } else {
          camera.position.y += -moveY * speed;
          camera.position.addScaledVector(right, moveX * speed);
        }

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
      const c = controls.current;
      if (!bikeFlight.current) {
        const p0 = bikeRef.current ? bikeRef.current.position : new THREE.Vector3(...BIKE_PARK_POS);
        const y0 = bikeRef.current ? bikeRef.current.rotation.y : 0;
        bikeFlight.current = createBikeFlightState([p0.x, p0.y, p0.z], y0);
        if (bikeRef.current) bikeRef.current.userData.flying = true;
      }
      const st = bikeFlight.current;
      const input = {
        throttle: THREE.MathUtils.clamp((c.keyW - c.keyS) - c.moveY, -1, 1),
        steer: THREE.MathUtils.clamp((c.keyD - c.keyA) + c.moveX, -1, 1),
        vertical: flightAxis === 'vertical',
      };

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
        // Controller owns the bike while mounted: pose + gentle hover bob +
        // bank into turns. (BikeRig stands down via userData.flying.)
        bikeRef.current.position.set(
          st.pos.x,
          st.pos.y + Math.sin(t * 2.2) * 0.25,
          st.pos.z
        );
        bikeRef.current.rotation.y = st.yaw;
        bikeRef.current.rotation.z = THREE.MathUtils.lerp(
          bikeRef.current.rotation.z,
          -input.steer * 0.38,
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
        if (targetRoute.startsWith('http')) {
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
        // The ad creative maps onto portrait 3.8×4.5 panel faces: cover-fit
        // it (center-crop, no stretch) instead of warping the source art.
        // The body/hull/prop/tail textures are cylinder wraps — tiling is
        // correct for those, so they keep plain repeat wrapping.
        try {
          const ad = loadedTextures.adTex;
          if (ad && ad.isTexture && ad.image && ad.image.width > 1) {
            applyCoverFit(ad, ad.image.width, ad.image.height, 3.8, 4.5);
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

  // Deterministic ad panels per tower (panel 0 = Merlin's native stake.com
  // slot on every tower; panels 1–3 rotate the real billboard inventory).
  // Memoized so the memoized GodTower never sees a fresh array identity.
  // NOTE: this hook MUST stay above the early return below — React requires
  // every hook to run on every render in the same order. When it sat below
  // `if (!textures) return null`, the first render ran 2 hooks and the
  // post-load render ran 3, throwing React error #310 and white-screening
  // the homepage (2026-10-01). panelsForTower is deterministic and does not
  // depend on `textures`, so hoisting is behavior-preserving.
  const towerPanels = useMemo(
    () => GOD_TOWER_SPOTS.map((_, i) => panelsForTower(i)),
    []
  );

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
        />
      ))}
    </>
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
    registerCollider('sun', () => ({ x: 0, y: 90, z: 250 }), 46);
    registerCollider('mars', () => ({ x: -70, y: 45, z: -100 }), 32);
    return () => {
      ['earth', 'sun', 'mars'].forEach(unregisterCollider);
    };
  }, []);
  return null;
}


// ---------------------------------------------------------------------------
// HomeScene — the client-only 3D hub. Mounted by app/page.jsx through
// next/dynamic with ssr:false. All DOM/UI around it stays in the page.
// Canvas props, child order, and every prop below are byte-identical to the
// inline version that used to live in app/page.jsx — pure code-split.
// ---------------------------------------------------------------------------
export default function HomeScene({
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
  onLaunchExternal,
  onBikeDismount,
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

  return (
    <div className="absolute inset-0 pointer-events-none">
      <Canvas shadows="soft" gl={{ alpha: true }} camera={{ position: [ORBIT_CENTER.x, ORBIT_CENTER.y, ORBIT_CENTER.z], fov: 52, far: 2000 }} style={{ pointerEvents: 'auto' }}>
        {!bgVideoOk && <color attach="background" args={['#050505']} />}
        {/* Thin fog: the tower field (~180 out) must read clearly from
            spawn, not vanish into haze. */}
        <fogExp2 attach="fog" args={['#050505', 0.0016]} />
        <Stars radius={100} depth={50} count={7000} factor={4} saturation={0} fade speed={1} />

        {/* Seasonal decoration cycle: date-driven holiday decor + Merlin's
            Christmas tree (Nov 22 - Twelfth Night). Renders nothing off-season. */}
        <SeasonalDecor />

        <ambientLight intensity={0.4} color="#222233" />

        <Suspense fallback={null}>
          <SunBackground />
          <NexusEarth
            onSelect={appState === 'hub_freeroam' ? beginEarthDive : null}
            quatRef={earthQuatRef}
            focus={earthFocus}
            phase={appState}
            spinEnabled={appState === 'hub_intro' || appState === 'hub_freeroam'}
          />
          <MarsBackground />
          <TextureProvider onLaunchExternal={onLaunchExternal} />
          {/* Hub satellite constellation — 10 physical textured satellites.
              The floating video button's satellite menu is the single way
              into programs; the rings no longer launch anything. */}
          <GodOrbitRings />
          {/* The Moon, the asteroid belt, and the waypoint beacons */}
          <HubMoon />
          <AsteroidField />
          <NavBeacons />
          <StaticColliders />
          {/* NOTE (declutter, 2026-09-29): the persistent space-portal gate
              field was removed from the interface — too cluttered. The
              launch-travel portal effects (portalTex/payloadTex in
              SequenceController) are the original portals and stay. Every
              program remains reachable through the floating button's
              satellite menu. */}
          <BikeRig bikeRef={bikeRef} />
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
          <Bloom luminanceThreshold={0.4} luminanceSmoothing={0.2} intensity={1.5} />
        </EffectComposer>
      </Canvas>
      <SeasonBadge />
    </div>
  );
}
