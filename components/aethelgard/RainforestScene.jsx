'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { HOTSPOTS, seasonAt, skyPalette } from '@/lib/aethelgard/data';
import Canopy from './Canopy';
import Ground from './Ground';
import Atmosphere from './Atmosphere';
import Water from './Water';
import Wildlife from './Wildlife';
import SkyDome from './SkyDome';
import { AncientKapok, CanopyBridge, OrchidGrove, JaguarDen } from './Landmarks';

// AETHELGARD pocket rainforest — R3F scene.
// Modes: 'orbit' (default), 'walk' (WASD, eye 1.7), 'fly' (WASD + Space/C).
// The page shell drives: mode, timeOfDay (0..1), seasonIdx, inputRef (keys),
// focusReq {hotspot, nonce} to fly the camera, onHotspot(id|null).

const EYE = 1.7;
const WORLD_R = 92;

function useKeys(inputRef) {
  useEffect(() => {
    const down = (e) => {
      const k = e.key.toLowerCase();
      const inp = inputRef.current;
      if (k === 'w' || k === 'arrowup') inp.keys.fwd = true;
      if (k === 's' || k === 'arrowdown') inp.keys.back = true;
      if (k === 'a' || k === 'arrowleft') inp.keys.left = true;
      if (k === 'd' || k === 'arrowright') inp.keys.right = true;
      if (k === ' ') inp.keys.up = true;
      if (k === 'c' || k === 'control') inp.keys.down = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    };
    const up = (e) => {
      const k = e.key.toLowerCase();
      const inp = inputRef.current;
      if (k === 'w' || k === 'arrowup') inp.keys.fwd = false;
      if (k === 's' || k === 'arrowdown') inp.keys.back = false;
      if (k === 'a' || k === 'arrowleft') inp.keys.left = false;
      if (k === 'd' || k === 'arrowright') inp.keys.right = false;
      if (k === ' ') inp.keys.up = false;
      if (k === 'c' || k === 'control') inp.keys.down = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [inputRef]);
}

// First-person rig shared by walk + fly. Drag on canvas to look.
function FirstPerson({ inputRef, fly }) {
  const { camera, gl } = useThree();
  const yaw = useRef(0.6);
  const pitch = useRef(-0.05);
  const pos = useRef(new THREE.Vector3(10, fly ? 14 : EYE, 26));
  const dragging = useRef(false);
  const last = useRef([0, 0]);

  useEffect(() => {
    camera.rotation.order = 'YXZ';
    pos.current.set(10, fly ? 14 : EYE, 26);
    yaw.current = 0.6;
    pitch.current = fly ? -0.15 : -0.05;
    const el = gl.domElement;
    const s = (e) => {
      dragging.current = true;
      last.current = [e.clientX, e.clientY];
    };
    const m = (e) => {
      if (!dragging.current) return;
      const dx = e.clientX - last.current[0];
      const dy = e.clientY - last.current[1];
      last.current = [e.clientX, e.clientY];
      yaw.current -= dx * 0.0042;
      pitch.current = Math.max(-1.35, Math.min(1.35, pitch.current - dy * 0.0042));
    };
    const e = () => { dragging.current = false; };
    // touch
    const ts = (e2) => {
      const t = e2.touches[0];
      dragging.current = true;
      last.current = [t.clientX, t.clientY];
    };
    const tm = (e2) => {
      const t = e2.touches[0];
      if (!dragging.current) return;
      const dx = t.clientX - last.current[0];
      const dy = t.clientY - last.current[1];
      last.current = [t.clientX, t.clientY];
      yaw.current -= dx * 0.005;
      pitch.current = Math.max(-1.35, Math.min(1.35, pitch.current - dy * 0.005));
    };
    el.addEventListener('mousedown', s);
    window.addEventListener('mousemove', m);
    window.addEventListener('mouseup', e);
    el.addEventListener('touchstart', ts, { passive: true });
    el.addEventListener('touchmove', tm, { passive: true });
    el.addEventListener('touchend', e);
    return () => {
      el.removeEventListener('mousedown', s);
      window.removeEventListener('mousemove', m);
      window.removeEventListener('mouseup', e);
      el.removeEventListener('touchstart', ts);
      el.removeEventListener('touchmove', tm);
      el.removeEventListener('touchend', e);
      camera.rotation.order = 'XYZ';
    };
  }, [camera, gl, fly]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const k = inputRef.current.keys;
    const fwd = (k.fwd ? 1 : 0) - (k.back ? 1 : 0);
    const strafe = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    const speed = fly ? 16 : 7;
    const sin = Math.sin(yaw.current), cos = Math.cos(yaw.current);
    const p = pos.current;
    p.x += (-sin * fwd + cos * strafe) * speed * dt;
    p.z += (-cos * fwd - sin * strafe) * speed * dt;
    if (fly) {
      p.y += ((k.up ? 1 : 0) - (k.down ? 1 : 0)) * 12 * dt;
      p.y = Math.max(1.2, Math.min(60, p.y));
    } else {
      p.y = EYE;
    }
    const r = Math.hypot(p.x, p.z);
    if (r > WORLD_R - 3) { p.x *= (WORLD_R - 3) / r; p.z *= (WORLD_R - 3) / r; }
    camera.position.copy(p);
    camera.rotation.set(pitch.current, yaw.current, 0);
  });
  return null;
}

// Touch movement for walk/fly. On a touchscreen there are no WASD keys —
// before this existed, drag-look was the ONLY touch input in these modes,
// and it died whenever the browser claimed the gesture as a page scroll
// (the page CSS now keeps touch-action: none on the canvas in all modes).
// The stick writes into the same inputRef.keys the keyboard fills, so the
// FirstPerson rig cannot tell the two apart. Keys are cleared on release,
// cancel, and unmount — a stuck key would be its own controls bug.
function TouchControls({ inputRef, fly }) {
  const stickRef = useRef(null);
  const knobRef = useRef(null);
  const activeId = useRef(null);

  const setKey = (name, v) => { if (inputRef.current) inputRef.current.keys[name] = v; };
  const clearStick = () => {
    setKey('fwd', false); setKey('back', false); setKey('left', false); setKey('right', false);
    if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)';
  };
  useEffect(() => () => { clearStick(); setKey('up', false); setKey('down', false); }, []);

  const moveStick = (e) => {
    const el = stickRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    const T = 12;
    setKey('fwd', dy < -T); setKey('back', dy > T);
    setKey('left', dx < -T); setKey('right', dx > T);
  };
  const onDown = (e) => { activeId.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); moveStick(e); };
  const onMove = (e) => { if (activeId.current === e.pointerId) moveStick(e); };
  const onUp = (e) => { if (activeId.current === e.pointerId) { activeId.current = null; clearStick(); } };

  const holdBtn = (name) => ({
    onPointerDown: (e) => { e.currentTarget.setPointerCapture(e.pointerId); setKey(name, true); },
    onPointerUp: () => setKey(name, false),
    onPointerCancel: () => setKey(name, false),
    onLostPointerCapture: () => setKey(name, false),
  });

  const zone = {
    position: 'absolute', bottom: 16, width: 104, height: 104, borderRadius: '50%',
    border: '1px solid rgba(125,223,154,0.55)', background: 'rgba(6,12,8,0.38)',
    touchAction: 'none', zIndex: 6,
  };
  return (
    <>
      <div
        ref={stickRef}
        role="application" aria-label="Move"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{ ...zone, left: 16 }}
      >
        <div ref={knobRef} style={{
          position: 'absolute', left: '50%', top: '50%', width: 46, height: 46,
          marginLeft: -23, marginTop: -23, borderRadius: '50%',
          background: 'rgba(125,223,154,0.35)', border: '1px solid rgba(125,223,154,0.8)',
          pointerEvents: 'none',
        }} />
      </div>
      {fly && (
        <div style={{ position: 'absolute', right: 16, bottom: 16, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 6 }}>
          <button type="button" aria-label="Fly up" {...holdBtn('up')} style={{
            width: 52, height: 52, borderRadius: '50%', touchAction: 'none',
            border: '1px solid rgba(125,223,154,0.55)', background: 'rgba(6,12,8,0.38)', color: '#dff2df', fontSize: 18,
          }}>▲</button>
          <button type="button" aria-label="Fly down" {...holdBtn('down')} style={{
            width: 52, height: 52, borderRadius: '50%', touchAction: 'none',
            border: '1px solid rgba(125,223,154,0.55)', background: 'rgba(6,12,8,0.38)', color: '#dff2df', fontSize: 18,
          }}>▼</button>
        </div>
      )}
    </>
  );
}

// Smooth fly-to for hotspot focus (orbit mode).
function FocusRig({ focusReq, orbitRef }) {
  const anim = useRef(null);
  const { camera } = useThree();
  useEffect(() => {
    if (!focusReq || !orbitRef.current) return;
    const h = HOTSPOTS.find((x) => x.id === focusReq.id);
    if (!h) return;
    anim.current = {
      t: 0,
      fromP: camera.position.clone(),
      toP: new THREE.Vector3(...h.cam),
      fromT: orbitRef.current.target.clone(),
      toT: new THREE.Vector3(...h.tgt),
    };
  }, [focusReq, camera, orbitRef]);
  useFrame((_, rawDt) => {
    const a = anim.current;
    if (!a || !orbitRef.current) return;
    a.t = Math.min(1, a.t + rawDt / 1.4);
    const s = a.t * a.t * (3 - 2 * a.t);
    camera.position.lerpVectors(a.fromP, a.toP, s);
    orbitRef.current.target.lerpVectors(a.fromT, a.toT, s);
    orbitRef.current.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

function HotspotMarkers({ onHotspot, activeId }) {
  const refs = useRef({});
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    HOTSPOTS.forEach((h, i) => {
      const m = refs.current[h.id];
      if (m) {
        m.position.y = h.pos[1] + 3.2 + Math.sin(t * 1.6 + i * 1.3) * 0.35;
        m.rotation.y = t * 0.8 + i;
      }
    });
  });
  return (
    <group>
      {HOTSPOTS.map((h) => (
        <group key={h.id} position={[h.pos[0], 0, h.pos[2]]}>
          <mesh
            ref={(m) => { refs.current[h.id] = m; }}
            position={[0, h.pos[1] + 3.2, 0]}
            onClick={(e) => { e.stopPropagation(); onHotspot(h.id); }}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = ''; }}
          >
            <octahedronGeometry args={[0.85, 0]} />
            <meshBasicMaterial
              color={activeId === h.id ? '#ffffff' : '#7ddf9a'}
              transparent opacity={0.92} depthWrite={false}
            />
          </mesh>
          <Html position={[0, h.pos[1] + 4.6, 0]} center distanceFactor={46}
            style={{ pointerEvents: 'none' }}>
            <div style={{
              fontSize: 11, letterSpacing: 2, whiteSpace: 'nowrap',
              color: activeId === h.id ? '#fff' : '#cfe8cf',
              textShadow: '0 1px 6px #000', fontWeight: 700,
            }}>{h.title.toUpperCase()}</div>
          </Html>
        </group>
      ))}
    </group>
  );
}

function SceneContent({ mode, timeOfDay, seasonIdx, inputRef, focusReq, onHotspot, activeId }) {
  const orbitRef = useRef();
  const season = seasonAt(seasonIdx);
  const sky = useMemo(() => skyPalette(timeOfDay), [timeOfDay]);

  return (
    <>
      <color attach="background" args={[sky.bg]} />
      <fog attach="fog" args={[sky.fog, sky.fogNear * season.fogMul, sky.fogFar * season.fogMul]} />

      {/* lights — the existing set only; the CGI pass adds no new lights */}
      <ambientLight intensity={sky.ambient} color={sky.hemiSky} />
      <hemisphereLight args={[sky.hemiSky, sky.hemiGround, 0.5]} />
      <directionalLight position={sky.sunPos} intensity={sky.sunIntensity} color={sky.sunColor} />
      {/* cool fill from the opposite side so the gloom never goes black */}
      <directionalLight position={[-40, 24, 40]} intensity={0.25} color="#6a8a7a" />

      <SkyDome sky={sky} timeOfDay={timeOfDay} />
      <Ground dapple={sky.godRay * season.rayMul} />
      <Canopy />
      <Water flowSpeed={0.7 + season.rain * 0.9} />
      <Atmosphere rainLevel={season.rain} rayOpacity={sky.godRay * season.rayMul}
        fogMul={season.fogMul} dayFactor={sky.day} />
      <Wildlife nightFactor={sky.firefly} flutterMul={season.flutterMul} />

      <AncientKapok />
      <CanopyBridge />
      <OrchidGrove bloomMul={season.bloomMul} />
      <JaguarDen nightFactor={sky.firefly} />

      <HotspotMarkers onHotspot={onHotspot} activeId={activeId} />

      {mode === 'orbit' && (
        <>
          <OrbitControls ref={orbitRef} makeDefault enableDamping dampingFactor={0.08}
            maxPolarAngle={Math.PI * 0.52} minDistance={6} maxDistance={170}
            target={[0, 8, 0]} />
          <FocusRig focusReq={focusReq} orbitRef={orbitRef} />
        </>
      )}
      {mode !== 'orbit' && <FirstPerson key={mode} inputRef={inputRef} fly={mode === 'fly'} />}
    </>
  );
}

export default function RainforestScene({
  mode = 'orbit', timeOfDay = 0.32, seasonIdx = 1,
  inputRef, focusReq, onHotspot, activeId,
}) {
  useKeys(inputRef);
  const [ready, setReady] = useState(false);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [34, 26, 52], fov: 55, near: 0.1, far: 600 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={() => setReady(true)}
      >
        <SceneContent
          mode={mode} timeOfDay={timeOfDay} seasonIdx={seasonIdx}
          inputRef={inputRef} focusReq={focusReq}
          onHotspot={onHotspot} activeId={activeId}
        />
      </Canvas>
      {!ready && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#7ddf9a', letterSpacing: 3, fontSize: 12,
        }}>GROWING THE RAINFOREST…</div>
      )}
      {mode !== 'orbit' && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          color: '#dff2df', fontSize: 11, letterSpacing: 2, textShadow: '0 1px 4px #000',
          background: 'rgba(0,0,0,0.35)', padding: '6px 14px', borderRadius: 8,
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          {mode === 'walk' ? 'STICK / WASD MOVE · DRAG LOOK' : 'STICK / WASD MOVE · ▲▼ / SPACE / C · DRAG LOOK'}
        </div>
      )}
      {mode !== 'orbit' && <TouchControls inputRef={inputRef} fly={mode === 'fly'} />}
    </div>
  );
}
