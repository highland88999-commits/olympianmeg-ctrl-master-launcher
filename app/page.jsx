'use client';
import { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';
import Auth from '@/components/Auth'; 
import { supabase } from '@/lib/supabase';
import { LanguageProvider, useI18n } from '@/lib/i18n';
import { SATELLITES } from '@/lib/i18n/satellites';
import GodMenuPanel from '@/components/GodMenuPanel';
import GodOrbitRings from '@/components/GodOrbitRings';
import BikeRig, { BIKE_PARK_POS, RIDER_OFFSET, BIKE_LOOK_AHEAD } from '@/components/BikeRig';
import { ORBIT_CENTER, orbitTime, orbitPositionFor } from '@/lib/god-orbits';
import SettingsGear from '@/components/SettingsGear';
import NexusEarth from '@/components/NexusEarth';
import EarthFlightController from '@/components/EarthFlightController';
import EarthConsole from '@/components/EarthConsole';
import { getUserPosition, FALLBACK_POSITION } from '@/lib/geo';

import Zeus from '@/components/Zeus';
import Ares from '@/components/Ares';
import Thoth from '@/components/Thoth';
import Argus from '@/components/Argus';
import Medusa from '@/components/Medusa';

const ORBIT_RADIUS = 40;

const ZEUS_POS = [ORBIT_CENTER.x, ORBIT_CENTER.y, ORBIT_CENTER.z + ORBIT_RADIUS];
const ARES_POS = [ORBIT_CENTER.x + Math.sin((Math.PI * 2) / 10) * ORBIT_RADIUS, ORBIT_CENTER.y, ORBIT_CENTER.z + Math.cos((Math.PI * 2) / 10) * ORBIT_RADIUS];
const THOTH_POS = [ORBIT_CENTER.x + Math.sin((Math.PI * 4) / 10) * ORBIT_RADIUS, ORBIT_CENTER.y, ORBIT_CENTER.z + Math.cos((Math.PI * 4) / 10) * ORBIT_RADIUS];
const ARGUS_POS = [ORBIT_CENTER.x + Math.sin((Math.PI * 6) / 10) * ORBIT_RADIUS, ORBIT_CENTER.y, ORBIT_CENTER.z + Math.cos((Math.PI * 6) / 10) * ORBIT_RADIUS];
const BABEL_POS = [ORBIT_CENTER.x + Math.sin((Math.PI * 7) / 10) * ORBIT_RADIUS, ORBIT_CENTER.y, ORBIT_CENTER.z + Math.cos((Math.PI * 7) / 10) * ORBIT_RADIUS];
const MEDUSA_POS = [ORBIT_CENTER.x + Math.sin((Math.PI * 8) / 10) * ORBIT_RADIUS, ORBIT_CENTER.y, ORBIT_CENTER.z + Math.cos((Math.PI * 8) / 10) * ORBIT_RADIUS];
// Merlin's seat — above the hub, apart from every cluster. Everything else orbits it.
const ARTEMIS_POS = [ORBIT_CENTER.x, ORBIT_CENTER.y + 28, ORBIT_CENTER.z];

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

function SequenceController({ launchState, setLaunchState, portalTex, payloadTex, targetRoute, controls, flightAxis, dropTarget, bikeRef }) {
  const { camera } = useThree();
  const router = useRouter(); 
  const bulletRef = useRef();
  const portalRef = useRef();
  const routed = useRef(false);
  const [bulletY, setBulletY] = useState(40);
  // Drag-look offsets while mounted on the bike.
  const lookYaw = useRef(0);
  const lookPitch = useRef(0);
  
  const ATMOSPHERE_Y = 5;
  const PORTAL_POS = [dropTarget[0], ATMOSPHERE_Y, dropTarget[2]];

  useFrame((state, delta) => {
    if (launchState === 'hub_intro') {
      // Spawn in the middle: the camera sits at the constellation's center,
      // ringed by the 10 god bands, and slowly pans to take in the orbit
      // rings. The parked TRON bike dead ahead (-Z) is the first thing seen.
      const time = state.clock.elapsedTime;
      camera.position.set(ORBIT_CENTER.x, ORBIT_CENTER.y, ORBIT_CENTER.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(0, -time * 0.12, 0);

      if (time > 14 || controls.current.moveX !== 0 || controls.current.moveY !== 0 || controls.current.lookDeltaX !== 0 || controls.current.keyW || controls.current.keyS || controls.current.keyA || controls.current.keyD) {
        setLaunchState('hub_freeroam');
      }
    } 
    else if (launchState === 'hub_freeroam') {
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
        const speed = delta * 40; 
        const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawQuat);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yawQuat);

        if (flightAxis === 'horizontal') {
          camera.position.addScaledVector(forward, -moveY * speed);
          camera.position.addScaledVector(right, moveX * speed);
        } else {
          camera.position.y += -moveY * speed;
          camera.position.addScaledVector(right, moveX * speed);
        }
      }

      camera.fov = THREE.MathUtils.lerp(camera.fov, controls.current.zoom, delta * 5);
      camera.updateProjectionMatrix();
    }
    else if (launchState === 'to_bike') {
      // Fly the camera from wherever it is into the rider's seat on the bike.
      lookYaw.current = 0;
      lookPitch.current = 0;
      const bp = bikeRef.current ? bikeRef.current.position : new THREE.Vector3(...BIKE_PARK_POS);
      const rider = new THREE.Vector3(bp.x + RIDER_OFFSET.x, bp.y + RIDER_OFFSET.y, bp.z + RIDER_OFFSET.z);
      camera.position.lerp(rider, Math.min(1, delta * 2.5));

      const look = new THREE.Vector3(bp.x, bp.y + 1.0, bp.z + BIKE_LOOK_AHEAD);
      const currentQuat = camera.quaternion.clone();
      camera.lookAt(look);
      const targetQuat = camera.quaternion.clone();
      camera.quaternion.copy(currentQuat);
      camera.quaternion.slerp(targetQuat, Math.min(1, delta * 3));

      if (camera.position.distanceTo(rider) < 0.8) setLaunchState('on_bike');
    }
    else if (launchState === 'on_bike') {
      // Mounted: the camera rides the bike's hover bob, facing the bike's
      // nose (+Z, toward the constellation). Drag to look around.
      const bp = bikeRef.current ? bikeRef.current.position : new THREE.Vector3(...BIKE_PARK_POS);
      camera.position.set(bp.x + RIDER_OFFSET.x, bp.y + RIDER_OFFSET.y, bp.z + RIDER_OFFSET.z);

      lookYaw.current -= controls.current.lookDeltaX * 0.003;
      lookPitch.current -= controls.current.lookDeltaY * 0.003;
      lookPitch.current = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, lookPitch.current));
      controls.current.lookDeltaX = 0;
      controls.current.lookDeltaY = 0;

      camera.rotation.order = 'YXZ';
      camera.rotation.set(lookPitch.current, Math.PI + lookYaw.current, 0);
    }
    else if (launchState === 'returning_to_satellite') {
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

  if (!textures) return null;

  return (
    <>
      <Zeus position={ZEUS_POS} onLaunchExternal={(url) => onLaunchExternal(url, ZEUS_POS)} textures={textures} />
      <Ares position={ARES_POS} onLaunchExternal={(url) => onLaunchExternal(url, ARES_POS)} textures={textures} />
      <Thoth position={THOTH_POS} onLaunchExternal={(url) => onLaunchExternal(url, THOTH_POS)} textures={textures} />
      <Argus position={ARGUS_POS} onLaunchExternal={(url) => onLaunchExternal(url, ARGUS_POS)} textures={textures} />
      <Medusa position={MEDUSA_POS} onLaunchExternal={(url) => onLaunchExternal(url, MEDUSA_POS)} textures={textures} />
    </>
  );
}


function NexusHub() {
  const { t } = useI18n();
  const POS_MAP = { ZEUS_POS, ARES_POS, THOTH_POS, ARGUS_POS, BABEL_POS, MEDUSA_POS, ARTEMIS_POS };

  const [appState, setAppState] = useState('hub_intro');
  const [isMenuExpanded, setIsMenuExpanded] = useState(true);
  const [user, setUser] = useState(null);
  // Honest guest mode: true while no Supabase backend is configured (fresh
  // deploy before Merlin's new Supabase project exists). The hub stays fully
  // explorable; the Auth gate is bypassed ONLY in this state. The moment env
  // vars exist, original auth behavior returns unchanged.
  const [cloudOffline, setCloudOffline] = useState(false);
  const [cloudNoteDismissed, setCloudNoteDismissed] = useState(false);
  
  const targetRouteRef = useRef('');
  const adWindowRef = useRef(null);
  
  const [activeSatTarget, setActiveSatTarget] = useState(ZEUS_POS);
  
  const [payloadTex, setPayloadTex] = useState(null);
  const [kingHoleTex, setKingHoleTex] = useState(null);

  const [flightAxis, setFlightAxis] = useState('horizontal'); 

  // --- Explorable Earth: the traveler stands still, the world moves. ---
  const earthQuatRef = useRef(null);
  if (!earthQuatRef.current && typeof THREE !== 'undefined') {
    earthQuatRef.current = new THREE.Quaternion();
  }
  const [earthFocus, setEarthFocus] = useState(null);   // { lat, lon, label }
  const [pendingDest, setPendingDest] = useState(null); // destination being brought to us

  const beginEarthDive = () => {
    if (appState !== 'hub_freeroam') return;
    setEarthFocus({ ...FALLBACK_POSITION, label: t('earth.locating') });
    setAppState('diving_to_earth');
    getUserPosition().then((pos) => {
      if (pos) setEarthFocus({ lat: pos.lat, lon: pos.lon, label: t('earth.yourLocation') });
      else setEarthFocus({ ...FALLBACK_POSITION });
    });
  };
  const travelToEarth = (dest) => { setPendingDest(dest); setAppState('earth_travel'); };
  const arriveEarth = (dest) => { setEarthFocus(dest); setPendingDest(null); setAppState('earth_surface'); };
  const returnToOrbit = () => { setPendingDest(null); setEarthFocus(null); setAppState('returning_to_orbit'); };

  const controlsRef = useRef({
    moveX: 0, moveY: 0, lookDeltaX: 0, lookDeltaY: 0, keyW: 0, keyS: 0, keyA: 0, keyD: 0, zoom: 52, lastPinchDist: null
  });

  // Parked TRON bike rig (position read by the camera controller).
  const bikeRef = useRef(null);

  // Satellite index for the god menus — top-level hook (never conditional).
  const satIndex = useMemo(() => new Map(SATELLITES.map((s) => [s.key, s])), []);

  const [joyBase, setJoyBase] = useState({ x: 0, y: 0 });
  const [joyStick, setJoyStick] = useState({ x: 0, y: 0 });
  const [joyActive, setJoyActive] = useState(false);
  const lastLook = useRef({ x: 0, y: 0 });
  const isLooking = useRef(false);

  useEffect(() => {
    // No backend configured yet: enter honest guest mode instead of crashing.
    // lib/supabase.ts throws on first use when NEXT_PUBLIC_SUPABASE_* are
    // missing, so we check before touching the client at all.
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setCloudOffline(true);
      const cached = localStorage.getItem('nexus_user');
      if (cached) setUser(cached);
      return;
    }
    try {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          const callsign = session.user.user_metadata?.username || session.user.user_metadata?.callsign || localStorage.getItem('nexus_user') || session.user.email?.split('@')[0].toUpperCase();
          localStorage.setItem('nexus_user', callsign);
          setUser(callsign);
        } else {
          const cached = localStorage.getItem('nexus_user');
          if (cached) setUser(cached);
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          const callsign = session.user.user_metadata?.username || session.user.user_metadata?.callsign || session.user.email?.split('@')[0].toUpperCase();
          localStorage.setItem('nexus_user', callsign);
          setUser(callsign);
        } else {
          localStorage.removeItem('nexus_user');
          setUser(null);
        }
      });

      return () => subscription.unsubscribe();
    } catch (err) {
      // Backend unreachable/misconfigured at runtime: degrade honestly,
      // never crash the hub into the error boundary.
      console.warn('Cloud auth unavailable, entering guest mode:', err);
      setCloudOffline(true);
      const cached = localStorage.getItem('nexus_user');
      if (cached) setUser(cached);
    }
  }, []);

  useEffect(() => {
    // Device-adaptable menu: start collapsed on phones so the 3D hub is
    // visible first; the bottom-left menu button opens it on demand.
    // Runs only on mount (client side), so no SSR window access.
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setIsMenuExpanded(false);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (appState === 'hub_intro') setAppState('hub_freeroam');
      if(e.key.toLowerCase()==='w') controlsRef.current.keyW = 1;
      if(e.key.toLowerCase()==='s') controlsRef.current.keyS = 1;
      if(e.key.toLowerCase()==='a') controlsRef.current.keyA = 1;
      if(e.key.toLowerCase()==='d') controlsRef.current.keyD = 1;
    };
    const handleKeyUp = (e) => {
      if(e.key.toLowerCase()==='w') controlsRef.current.keyW = 0;
      if(e.key.toLowerCase()==='s') controlsRef.current.keyS = 0;
      if(e.key.toLowerCase()==='a') controlsRef.current.keyA = 0;
      if(e.key.toLowerCase()==='d') controlsRef.current.keyD = 0;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [appState]);

  useEffect(() => {
    const loadEffectVideo = (src) => {
      const vid = document.createElement("video");
      vid.src = src; vid.crossOrigin = "Anonymous"; vid.loop = true; vid.muted = true; vid.playsInline = true;
      vid.play().catch(e => console.warn("Auto-play prevented", e));
      const tex = new THREE.VideoTexture(vid);
      tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    };
    
    setKingHoleTex(loadEffectVideo('/gemini_generated_video_758D2655.mov'));
    setPayloadTex(loadEffectVideo('/gemini_generated_video_65272AD7.mov'));
  }, []);

  const handleLogin = (callsign) => setUser(callsign);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Cloud offline: nothing to sign out of server-side.
    }
    localStorage.removeItem('nexus_user');
    setUser(null);
  };

  const launchPocketUniverse = (route, satKey, fallbackPos, directPos) => {
    // The one menu-to-satellite function. Drop target resolution:
    // 1. directPos — explicit 3D position (tower ad panels);
    // 2. the satellite's live orbit-node position (god bands);
    // 3. the constellation tower position the satellite lists.
    let target = null;
    if (directPos) {
      target = directPos;
    } else {
      if (satKey) {
        const p = orbitPositionFor(satKey, orbitTime());
        if (p) target = [p.x, p.y, p.z];
      }
      if (!target) target = POS_MAP[fallbackPos] || ZEUS_POS;
    }
    setActiveSatTarget(target);
    targetRouteRef.current = route;
    setIsMenuExpanded(false);
    setAppState('returning_to_satellite');
  };

  const toggleBike = () => {
    if (appState === 'on_bike' || appState === 'to_bike') {
      setAppState('hub_freeroam');
    } else if (appState === 'hub_intro' || appState === 'hub_freeroam') {
      setAppState('to_bike');
    }
  };

  const handlePointerDown = (e) => {
    if (e.target.closest('.ui-element')) return; 
    if (appState === 'hub_intro') setAppState('hub_freeroam');
    
    const clientX = e.clientX;
    const clientY = e.clientY;

    if (clientX < window.innerWidth / 2) {
      setJoyBase({ x: clientX, y: clientY });
      setJoyStick({ x: clientX, y: clientY });
      setJoyActive(true);
    } else {
      isLooking.current = true;
      lastLook.current = { x: clientX, y: clientY };
    }
  };

  const handlePointerMove = (e) => {
    const clientX = e.clientX;
    const clientY = e.clientY;

    if (joyActive) {
      setJoyStick({ x: clientX, y: clientY });
      const dx = clientX - joyBase.x;
      const dy = clientY - joyBase.y;
      const deadzone = 10;
      let dist = Math.hypot(dx, dy);
      
      if (dist > deadzone) {
        const maxDist = 50;
        dist = Math.min(dist, maxDist);
        const normalizedDist = (dist - deadzone) / (maxDist - deadzone);
        const angle = Math.atan2(dy, dx);
        controlsRef.current.moveX = Math.cos(angle) * normalizedDist;
        controlsRef.current.moveY = Math.sin(angle) * normalizedDist;
      } else {
        controlsRef.current.moveX = 0;
        controlsRef.current.moveY = 0;
      }
    } else if (isLooking.current) {
      controlsRef.current.lookDeltaX += clientX - lastLook.current.x;
      controlsRef.current.lookDeltaY += clientY - lastLook.current.y;
      lastLook.current = { x: clientX, y: clientY };
    }
  };

  const handlePointerUp = () => {
    setJoyActive(false);
    isLooking.current = false;
    controlsRef.current.moveX = 0;
    controlsRef.current.moveY = 0;
  };

  return (
    <main 
      className="relative w-screen h-screen overflow-hidden bg-[#050505] touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={(e) => {
        controlsRef.current.zoom += e.deltaY * 0.05;
        controlsRef.current.zoom = Math.max(20, Math.min(100, controlsRef.current.zoom));
      }}
    >
      {!user && !cloudOffline && <Auth onLogin={handleLogin} />}
      {cloudOffline && !cloudNoteDismissed && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
          <div className="flex items-center gap-3 bg-zinc-950/90 border border-amber-500/40 rounded-full pl-4 pr-2 py-2 shadow-lg backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[11px] text-zinc-300 tracking-wide">
              Cloud features are offline — exploring as a guest. Sign-in and cloud saves return once the database is connected.
            </span>
            <button
              onClick={() => setCloudNoteDismissed(true)}
              className="text-zinc-500 hover:text-white text-xs px-2"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      
      {(user || cloudOffline) && (appState === 'hub_intro' || appState === 'hub_freeroam') && (
        <>
          <div className="absolute bottom-5 left-5 z-50 flex flex-col items-start gap-4 ui-element pointer-events-auto">
            {isMenuExpanded ? (
              <div className="bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 shadow-[0_0_30px_rgba(0,0,0,0.5)] backdrop-blur-md w-[min(16rem,calc(100vw-2.5rem))] max-h-[70vh] overflow-y-auto custom-scrollbar flex flex-col gap-5">
                <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold tracking-widest text-white uppercase">{t('ui.nexusHub')}</span>
                    <span className="text-[9px] font-mono text-cyan-400 tracking-wider uppercase">{t('ui.operator')}: {user || 'GUEST'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <SettingsGear />
                    <button onClick={() => setIsMenuExpanded(false)} title={t('ui.collapse')} className="text-zinc-500 hover:text-white text-xs px-1">[_]</button>
                  </div>
                </div>
                
                {/* God menus: the 10 god-named navigation menus. Satellites launch
                    ("drop") out of their parent menu through the one
                    menu-to-satellite function, launchPocketUniverse. */}
                <GodMenuPanel
                  t={t}
                  satIndex={satIndex}
                  onLaunch={(route, key, pos) => launchPocketUniverse(route, key, pos)}
                />

                {/* DISCONNECT — signed-in users only; guests have nothing to disconnect */}
                {user && (
                <button 
                  onClick={handleSignOut}
                  className="w-full py-2.5 text-[10px] font-bold tracking-widest text-red-400 uppercase transition-all border border-red-500/30 rounded bg-red-950/20 hover:bg-red-900/40 hover:border-red-500/60 mt-1"
                >
                  {t('ui.disconnect')}
                </button>
                )}
              </div>
            ) : (
              <button 
                onClick={() => setIsMenuExpanded(true)}
                aria-label="Open menu"
                className="w-16 h-16 rounded-full flex items-center justify-center shadow-[0_0_25px_rgba(0,255,255,0.4)] hover:scale-105 transition-all overflow-hidden border-2 border-cyan-500 relative bg-cyan-950/60"
              >
                <video src="/gemini_generated_video_758D2655.mov" autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover scale-110" />
              </button>
            )}
          </div>

          <button 
            onClick={() => setFlightAxis(m => m === 'horizontal' ? 'vertical' : 'horizontal')}
            className="absolute top-5 right-5 z-50 px-6 py-4 text-[10px] sm:text-xs font-bold tracking-widest text-cyan-400 uppercase transition-all border border-cyan-500/50 rounded-xl bg-zinc-950/90 shadow-[0_0_20px_rgba(0,255,255,0.15)] backdrop-blur-md hover:bg-cyan-900/40 ui-element pointer-events-auto"
          >
            FLIGHT AXIS: <span className="text-white">{flightAxis}</span>
          </button>

          {joyActive && Math.hypot(joyStick.x - joyBase.x, joyStick.y - joyBase.y) > 5 && (
            <div
              className="absolute z-40 flex items-center justify-center w-20 h-20 border-2 rounded-full pointer-events-none border-cyan-500/30 bg-cyan-950/20"
              style={{ left: joyBase.x - 40, top: joyBase.y - 40 }}
            >
              <div
                className="w-8 h-8 rounded-full bg-cyan-400/80 shadow-[0_0_15px_#00ffff]"
                style={{ transform: `translate(${Math.max(-30, Math.min(30, joyStick.x - joyBase.x))}px, ${Math.max(-30, Math.min(30, joyStick.y - joyBase.y))}px)` }}
              />
            </div>
          )}
        </>
      )}

      {/* Spawn to Bike — fixed bottom-right. Flies the camera into the
          rider's seat on the parked TRON bike; tap again to dismount. */}
      {(user || cloudOffline) && (appState === 'hub_intro' || appState === 'hub_freeroam' || appState === 'to_bike' || appState === 'on_bike') && (
        <button
          onClick={toggleBike}
          className="absolute bottom-5 right-5 z-50 px-6 py-4 text-[10px] sm:text-xs font-bold tracking-widest text-teal-300 uppercase transition-all border border-teal-400/50 rounded-xl bg-zinc-950/90 shadow-[0_0_20px_rgba(45,212,191,0.15)] backdrop-blur-md hover:bg-teal-900/40 ui-element pointer-events-auto"
        >
          {(appState === 'on_bike' || appState === 'to_bike') ? 'LEAVE BIKE' : 'SPAWN TO BIKE'}
        </button>
      )}

      {(user || cloudOffline) && (appState === 'diving_to_earth' || appState === 'earth_surface' || appState === 'earth_travel') && (
        <EarthConsole
          focus={earthFocus}
          phase={appState}
          onTravel={travelToEarth}
          onReturn={returnToOrbit}
        />
      )}

      {(user || cloudOffline) && appState === 'hub_freeroam' && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
          <div className="text-[10px] tracking-[0.25em] uppercase text-cyan-300/70 bg-black/40 px-4 py-2 rounded-full border border-cyan-500/20">
            {t('earth.tapHint')}
          </div>
        </div>
      )}

      <div className="absolute inset-0 pointer-events-none">
        <Canvas shadows="soft" camera={{ position: [ORBIT_CENTER.x, ORBIT_CENTER.y, ORBIT_CENTER.z], fov: 52, far: 2000 }} style={{ pointerEvents: 'auto' }}>
          <color attach="background" args={['#050505']} />
          <fogExp2 attach="fog" args={['#050505', 0.015]} />
          <Stars radius={100} depth={50} count={7000} factor={4} saturation={0} fade speed={1} />
          
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
            <TextureProvider onLaunchExternal={(url, id) => {
              adWindowRef.current = window.open('', '_blank');
              launchPocketUniverse(url, null, null, id);
            }} />
            <GodOrbitRings
              satIndex={satIndex}
              canLaunch={appState === 'hub_intro' || appState === 'hub_freeroam'}
              onLaunch={(route, key) => launchPocketUniverse(route, key, null)}
            />
            <BikeRig bikeRef={bikeRef} />
          </Suspense>

          <SequenceController 
            launchState={appState} 
            setLaunchState={setAppState} 
            portalTex={kingHoleTex} 
            payloadTex={payloadTex} 
            targetRoute={targetRouteRef.current} 
            controls={controlsRef} 
            flightAxis={flightAxis}
            adWindowRef={adWindowRef}
            dropTarget={activeSatTarget}
            bikeRef={bikeRef}
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
      </div>
    </main>
  );
}

export default function NexusHubPage() {
  return (
    <LanguageProvider>
      <NexusHub />
    </LanguageProvider>
  );
}
