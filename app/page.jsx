'use client';
import { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';
import Auth from '@/components/Auth'; 
import { supabase } from '@/lib/supabase';

import Zeus from '@/components/Zeus';
import Ares from '@/components/Ares';
import Thoth from '@/components/Thoth';
import Argus from '@/components/Argus';
import Medusa from '@/components/Medusa';

const ORBIT_CENTER = { x: 0, y: 35, z: -80 };
const ORBIT_RADIUS = 40;

const ZEUS_POS = [ORBIT_CENTER.x, ORBIT_CENTER.y, ORBIT_CENTER.z + ORBIT_RADIUS];
const ARES_POS = [ORBIT_CENTER.x + Math.sin((Math.PI * 2) / 10) * ORBIT_RADIUS, ORBIT_CENTER.y, ORBIT_CENTER.z + Math.cos((Math.PI * 2) / 10) * ORBIT_RADIUS];
const THOTH_POS = [ORBIT_CENTER.x + Math.sin((Math.PI * 4) / 10) * ORBIT_RADIUS, ORBIT_CENTER.y, ORBIT_CENTER.z + Math.cos((Math.PI * 4) / 10) * ORBIT_RADIUS];
const ARGUS_POS = [ORBIT_CENTER.x + Math.sin((Math.PI * 6) / 10) * ORBIT_RADIUS, ORBIT_CENTER.y, ORBIT_CENTER.z + Math.cos((Math.PI * 6) / 10) * ORBIT_RADIUS];
const BABEL_POS = [ORBIT_CENTER.x + Math.sin((Math.PI * 7) / 10) * ORBIT_RADIUS, ORBIT_CENTER.y, ORBIT_CENTER.z + Math.cos((Math.PI * 7) / 10) * ORBIT_RADIUS];
const MEDUSA_POS = [ORBIT_CENTER.x + Math.sin((Math.PI * 8) / 10) * ORBIT_RADIUS, ORBIT_CENTER.y, ORBIT_CENTER.z + Math.cos((Math.PI * 8) / 10) * ORBIT_RADIUS];

function EarthBackground() {
  const earthRef = useRef();
  const [textures, setTextures] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loader = new THREE.TextureLoader();
    const dayUrl = 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg';
    const nightUrl = 'https://unpkg.com/three-globe/example/img/earth-night.jpg';

    loader.load(dayUrl, (dayTex) => {
      dayTex.colorSpace = THREE.SRGBColorSpace;
      loader.load(nightUrl, (nightTex) => {
        nightTex.colorSpace = THREE.SRGBColorSpace;
        if (isMounted) setTextures({ day: dayTex, night: nightTex });
      }, undefined, () => {
        const blank = new THREE.DataTexture(new Uint8Array([5, 5, 15, 255]), 1, 1, THREE.RGBAFormat);
        blank.needsUpdate = true;
        if (isMounted) setTextures({ day: dayTex, night: blank });
      });
    }, undefined, () => {
      const blankDay = new THREE.DataTexture(new Uint8Array([50, 100, 200, 255]), 1, 1, THREE.RGBAFormat);
      blankDay.needsUpdate = true;
      if (isMounted) setTextures({ day: blankDay, night: blankDay });
    });

    return () => { isMounted = false; };
  }, []);

  const earthUniforms = useMemo(() => {
    if (!textures) return null;
    const sunPos = new THREE.Vector3(0, 90, 250);
    const earthPos = new THREE.Vector3(0, -60, -120);
    const sunDir = new THREE.Vector3().subVectors(sunPos, earthPos).normalize();
    
    return {
      dayTexture: { value: textures.day },
      nightTexture: { value: textures.night },
      sunDirection: { value: sunDir }
    };
  }, [textures]);

  useFrame((state, delta) => { if (earthRef.current) earthRef.current.rotation.y += delta * 0.05; });

  if (!textures) return null;

  return (
    <group position={[0, -60, -120]}>
      <mesh ref={earthRef} receiveShadow castShadow>
        <sphereGeometry args={[55, 64, 64]} />
        <shaderMaterial
          uniforms={earthUniforms}
          vertexShader={`
            varying vec2 vUv; 
            varying vec3 vNormalWorld;
            void main() { 
              vUv = uv; 
              vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            uniform sampler2D dayTexture;
            uniform sampler2D nightTexture;
            uniform vec3 sunDirection;
            varying vec2 vUv; 
            varying vec3 vNormalWorld;
            void main() {
              vec3 n = normalize(vNormalWorld);
              float sunOrientation = dot(n, sunDirection);
              float dayMix = smoothstep(-0.2, 0.2, sunOrientation);
              vec3 dayColor = texture2D(dayTexture, vUv).rgb;
              vec3 nightColor = texture2D(nightTexture, vUv).rgb;
              vec3 sunset = vec3(0.8, 0.4, 0.1) * (1.0 - abs(sunOrientation * 5.0));
              sunset = clamp(sunset, 0.0, 1.0) * 0.4;
              gl_FragColor = vec4(mix(nightColor, dayColor, dayMix) + sunset, 1.0);
            }
          `}
        />
      </mesh>
      
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
  );
}

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

function SequenceController({ launchState, setLaunchState, portalTex, payloadTex, targetRoute, controls, flightAxis, dropTarget }) {
  const { camera } = useThree();
  const router = useRouter(); 
  const bulletRef = useRef();
  const portalRef = useRef();
  const routed = useRef(false);
  const [bulletY, setBulletY] = useState(40);
  
  const ATMOSPHERE_Y = 5;
  const PORTAL_POS = [dropTarget[0], ATMOSPHERE_Y, dropTarget[2]];

  useFrame((state, delta) => {
    if (launchState === 'hub_intro') {
      const time = state.clock.elapsedTime;
      const midX = (ZEUS_POS[0] + ARES_POS[0] + THOTH_POS[0] + ARGUS_POS[0] + MEDUSA_POS[0]) / 5;
      const midZ = (ZEUS_POS[2] + ARES_POS[2] + THOTH_POS[2] + ARGUS_POS[2] + MEDUSA_POS[2]) / 5;
      
      const targetPos = new THREE.Vector3(midX + Math.sin(time * 0.1) * 20, 75, 25 + Math.cos(time * 0.1) * 15);
      camera.position.lerp(targetPos, delta * 2);
      camera.lookAt(new THREE.Vector3(midX, 35, midZ));

      if (time > 6 || controls.current.moveX !== 0 || controls.current.moveY !== 0 || controls.current.lookDeltaX !== 0 || controls.current.keyW || controls.current.keyS || controls.current.keyA || controls.current.keyD) {
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

export default function NexusHub() {
  const [appState, setAppState] = useState('hub_intro');
  const [isMenuExpanded, setIsMenuExpanded] = useState(true);
  const [user, setUser] = useState(null);
  
  const targetRouteRef = useRef('');
  const adWindowRef = useRef(null);
  
  const [activeSatTarget, setActiveSatTarget] = useState(ZEUS_POS);
  
  const [payloadTex, setPayloadTex] = useState(null);
  const [kingHoleTex, setKingHoleTex] = useState(null);

  const [flightAxis, setFlightAxis] = useState('horizontal'); 

  const controlsRef = useRef({
    moveX: 0, moveY: 0, lookDeltaX: 0, lookDeltaY: 0, keyW: 0, keyS: 0, keyA: 0, keyD: 0, zoom: 52, lastPinchDist: null
  });

  const [joyBase, setJoyBase] = useState({ x: 0, y: 0 });
  const [joyStick, setJoyStick] = useState({ x: 0, y: 0 });
  const [joyActive, setJoyActive] = useState(false);
  const lastLook = useRef({ x: 0, y: 0 });
  const isLooking = useRef(false);

  useEffect(() => {
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
    await supabase.auth.signOut();
    localStorage.removeItem('nexus_user');
    setUser(null);
  };

  const launchPocketUniverse = (route, targetPos) => {
    setActiveSatTarget(targetPos);
    targetRouteRef.current = route;
    setIsMenuExpanded(false);
    setAppState('returning_to_satellite');
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
      {!user && <Auth onLogin={handleLogin} />}
      
      {user && (appState === 'hub_intro' || appState === 'hub_freeroam') && (
        <>
          <div className="absolute bottom-5 left-5 z-50 flex flex-col items-start gap-4 ui-element pointer-events-auto">
            {isMenuExpanded ? (
              <div className="bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 shadow-[0_0_30px_rgba(0,0,0,0.5)] backdrop-blur-md w-64 max-h-[70vh] overflow-y-auto custom-scrollbar flex flex-col gap-5">
                <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold tracking-widest text-white uppercase">Nexus Hub</span>
                    <span className="text-[9px] font-mono text-cyan-400 tracking-wider uppercase">OPERATOR: {user}</span>
                  </div>
                  <button onClick={() => setIsMenuExpanded(false)} className="text-zinc-500 hover:text-white text-xs">[_]</button>
                </div>
                
                {/* 1. GAMES (ZEUS) */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 mb-1 border-b border-zinc-800 pb-1">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_5px_#00ffff]" />
                    <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase">Games <span className="text-cyan-400">/ Zeus</span></span>
                  </div>
                  <button onClick={() => launchPocketUniverse('/chess', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Wizards Chess</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Orbital Payload</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/battleship', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Battleship</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Neon Fleet Command</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/luge', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">LUGE</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Neon Descent Engine</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/basketball', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Streetball</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Full-Court Shootout</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/colosseum', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Colosseum</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Arena Battler</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/underworld', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Underworld</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Game Discovery Catalog</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/beehive', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Beehive</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Room-Sized Honeycomb World</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/browsers-castle', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Browser's Castle</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Web Fortress Concept</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/dk-hero', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">DK Hero</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Barrel Siege Arcade Climber</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/excalibur', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Excalibur</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Sword in the Stone</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/guillotine', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Guillotine</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">300-Year-Old Machine in 3D</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/hercules', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Hercules</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Voyage Across the Solar System</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/ice-dragon', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Ice Dragon</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Wake the Glacial Dragon</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/ice-monster', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Ice Monster</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Calm the Frost Behemoth</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/iq-test', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">IQ Test</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Axiom Scramble 3D Puzzle</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/labyrinth', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Labyrinth</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">3D Maze, the Watching Eye</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/loki', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Loki</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Illusions & Ambience</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/neon-racer', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Neon Racer</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Deep Space Survival</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/omega-pinball', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Omega Pinball</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">The 99-Level Ascent</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/persymphony', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Persymphony</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Music Arena</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/raptor-rush', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Raptor Rush</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Canyon Sprint</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/rogers-arena', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Rogers Arena</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">A Night at the Arena</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/air-hockey', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Air Hockey</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Arcade Classic</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/t-1000', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">T-1000</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Liquid Metal Dome</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/hive', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">The Hive</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Cyber Hive Core</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/zeus-v-hades', ZEUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/60 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all group">
                    <span className="text-sm font-black text-white tracking-widest uppercase group-hover:text-cyan-400">Zeus vs Hades</span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-1">Neon Soul Race</span>
                  </button>
                </div>

                {/* 2. UTILITIES (ARES) */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 mb-1 border-b border-zinc-800 pb-1">
                    <div className="w-2 h-2 rounded-full bg-fuchsia-400 shadow-[0_0_5px_#ff00ff]" />
                    <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase">Utilities <span className="text-fuchsia-400">/ Ares</span></span>
                  </div>
                  <button onClick={() => launchPocketUniverse('/cerberus', ARES_POS)} className="flex flex-col text-left px-4 py-3 bg-black/40 border border-fuchsia-500/30 rounded hover:bg-fuchsia-500/20 transition-all group">
                    <span className="text-sm font-black text-zinc-400 tracking-widest uppercase group-hover:text-white">Cerberus Node</span>
                    <span className="text-[10px] text-zinc-600 uppercase mt-1">Global Pan Network</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/phone-home', ARES_POS)} className="flex flex-col text-left px-4 py-3 bg-black/40 border border-fuchsia-500/30 rounded hover:bg-fuchsia-500/20 transition-all group">
                    <span className="text-sm font-black text-zinc-400 tracking-widest uppercase group-hover:text-white">Phone Home</span>
                    <span className="text-[10px] text-zinc-600 uppercase mt-1">Secure Comms Uplink</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/fortress-of-solitude', ARES_POS)} className="flex flex-col text-left px-4 py-3 bg-black/40 border border-fuchsia-500/30 rounded hover:bg-fuchsia-500/20 transition-all group">
                    <span className="text-sm font-black text-zinc-400 tracking-widest uppercase group-hover:text-white">Fortress of Solitude</span>
                    <span className="text-[10px] text-zinc-600 uppercase mt-1">Secure 3D Data Vault</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/ares', ARES_POS)} className="flex flex-col text-left px-4 py-3 bg-black/40 border border-red-500/40 rounded hover:bg-red-500/20 transition-all group">
                    <span className="text-sm font-black text-zinc-400 tracking-widest uppercase group-hover:text-white">Ares Console</span>
                    <span className="text-[10px] text-zinc-600 uppercase mt-1">Threat Monitoring & Defense</span>
                  </button>
                </div>

                {/* 3. AI PROGRAMS (THOTH) */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 mb-1 border-b border-zinc-800 pb-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_5px_#00ff88]" />
                    <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase">AI Programs <span className="text-emerald-400">/ Thoth</span></span>
                  </div>
                  <button onClick={() => launchPocketUniverse('/human-ai', THOTH_POS)} className="flex flex-col text-left px-4 py-3 bg-black/40 border border-emerald-500/30 rounded hover:bg-emerald-500/20 transition-all group">
                    <span className="text-sm font-black text-emerald-400 tracking-widest uppercase group-hover:text-white">Human AI</span>
                    <span className="text-[10px] text-zinc-600 uppercase mt-1">Omega x Olympus</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/alexandria', THOTH_POS)} className="flex flex-col text-left px-4 py-3 bg-black/40 border border-emerald-500/30 rounded hover:bg-emerald-500/20 transition-all group">
                    <span className="text-sm font-black text-emerald-400 tracking-widest uppercase group-hover:text-white">Nexus Codex</span>
                    <span className="text-[10px] text-zinc-600 uppercase mt-1">Alexandria Archive</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/world-engine', THOTH_POS)} className="flex flex-col text-left px-4 py-3 bg-black/40 border border-emerald-500/30 rounded hover:bg-emerald-500/20 transition-all group">
                    <span className="text-sm font-black text-emerald-400 tracking-widest uppercase group-hover:text-white">World Engine</span>
                    <span className="text-[10px] text-zinc-600 uppercase mt-1">AI 3D World Builder</span>
                  </button>
                </div>

                {/* 4. OBSERVATORY (ARGUS) */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 mb-1 border-b border-zinc-800 pb-1">
                    <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_5px_#ffaa00]" />
                    <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase">Observatory <span className="text-amber-400">/ Argus</span></span>
                  </div>
                  <button onClick={() => launchPocketUniverse('/aquarium', ARGUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/40 border border-amber-500/30 rounded hover:bg-amber-500/20 transition-all group">
                    <span className="text-sm font-black text-amber-400 tracking-widest uppercase group-hover:text-white">Aquarium</span>
                    <span className="text-[10px] text-zinc-600 uppercase mt-1">Multi-Node Console</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/olympus', ARGUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/40 border border-amber-500/30 rounded hover:bg-amber-500/20 transition-all group">
                    <span className="text-sm font-black text-amber-400 tracking-widest uppercase group-hover:text-white">Olympus</span>
                    <span className="text-[10px] text-zinc-600 uppercase mt-1">Grand Multiverse Store</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/babel', BABEL_POS)} className="flex flex-col text-left px-4 py-3 bg-black/40 border border-amber-500/30 rounded hover:bg-amber-500/20 transition-all group">
                    <span className="text-sm font-black text-amber-400 tracking-widest uppercase group-hover:text-white">Babel</span>
                    <span className="text-[10px] text-zinc-600 uppercase mt-1">Tower of Pocket Universes</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/hermes', ARGUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/40 border border-amber-500/30 rounded hover:bg-amber-500/20 transition-all group">
                    <span className="text-sm font-black text-amber-400 tracking-widest uppercase group-hover:text-white">Hermes</span>
                    <span className="text-[10px] text-zinc-600 uppercase mt-1">Paid Link Directory</span>
                  </button>
                  <button onClick={() => launchPocketUniverse('/agora', ARGUS_POS)} className="flex flex-col text-left px-4 py-3 bg-black/40 border border-amber-500/30 rounded hover:bg-amber-500/20 transition-all group">
                    <span className="text-sm font-black text-amber-400 tracking-widest uppercase group-hover:text-white">Agora</span>
                    <span className="text-[10px] text-zinc-600 uppercase mt-1">Community Town Square</span>
                  </button>
                </div>

                {/* 5. THERAPY (MEDUSA) */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 mb-1 border-b border-zinc-800 pb-1">
                    <div className="w-2 h-2 rounded-full bg-[#33ff66] shadow-[0_0_5px_#33ff66]" />
                    <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase">Therapy <span className="text-[#33ff66]">/ Medusa</span></span>
                  </div>
                  <button onClick={() => launchPocketUniverse('/medusa/lair', MEDUSA_POS)} className="flex flex-col text-left px-4 py-3 bg-black/40 border border-[#33ff66]/30 rounded hover:bg-[#33ff66]/20 transition-all group">
                    <span className="text-sm font-black text-[#33ff66] tracking-widest uppercase group-hover:text-white">Medusa's Lair</span>
                    <span className="text-[10px] text-zinc-600 uppercase mt-1">Gaze Chamber</span>
                  </button>
                </div>

                {/* DISCONNECT */}
                <button 
                  onClick={handleSignOut}
                  className="w-full py-2.5 text-[10px] font-bold tracking-widest text-red-400 uppercase transition-all border border-red-500/30 rounded bg-red-950/20 hover:bg-red-900/40 hover:border-red-500/60 mt-1"
                >
                  [ DISCONNECT CALLSIGN ]
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setIsMenuExpanded(true)}
                className="w-16 h-16 rounded-full flex items-center justify-center shadow-[0_0_25px_rgba(0,255,255,0.4)] hover:scale-105 transition-all overflow-hidden border-2 border-cyan-500 relative"
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

      <div className="absolute inset-0 pointer-events-none">
        <Canvas shadows="soft" camera={{ position: [0, 75, 20], fov: 52, far: 2000 }} style={{ pointerEvents: 'auto' }}>
          <color attach="background" args={['#050505']} />
          <fogExp2 attach="fog" args={['#050505', 0.015]} />
          <Stars radius={100} depth={50} count={7000} factor={4} saturation={0} fade speed={1} />
          
          <ambientLight intensity={0.4} color="#222233" />
          
          <Suspense fallback={null}>
            <SunBackground />
            <EarthBackground />
            <MarsBackground />
            <TextureProvider onLaunchExternal={(url, id) => {
              adWindowRef.current = window.open('', '_blank');
              launchPocketUniverse(url, id);
            }} />
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
          />
          
          <EffectComposer>
            <Bloom luminanceThreshold={0.4} luminanceSmoothing={0.2} intensity={1.5} />
          </EffectComposer>
        </Canvas>
      </div>
    </main>
  );
}


