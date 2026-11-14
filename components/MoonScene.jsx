'use client';

// components/MoonScene.jsx — the lunar surface (Merlin, Nov 13, 2026).
//
// The /moon route: stand on the Moon itself. The Moon is the real
// hub sphere — radius 14, same procedural crater texture as the hub
// orb (components/HubMoon.jsx makeMoonTexture, one source of truth)
// — with Earth hanging in the sky at the hub's own scene scale
// (radius 55 at 180 away, 35.58° across) and a starfield behind.
//
// The rig is first-person, deliberately like the sun base's: drag
// to look, WASD / arrows / the shared WalkJoystick to walk, Space
// or the JUMP button to bounce. The physics lives in lib/moon.js
// (pure, tested): real lunar gravity 1.62 m/s², jump apex 2.7778 m,
// hang 3.7037 s. The walker stands ON the sphere — up is the
// surface normal, so the horizon tilts correctly as you walk
// around the Moon — and the step re-projects onto the sphere every
// frame, so you can never fall through or drift off into space.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Stars, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import VanGoghText from './VanGoghText';
import { makeMoonTexture } from './HubMoon';
import {
  MOON_RADIUS,
  MOON_GRAVITY,
  MOON_EYE_HEIGHT,
  MOON_EARTH_DIR,
  MOON_EARTH_DISTANCE,
  MOON_LANDING_FEET,
  MOON_SPAWN_FEET,
  moonLandingState,
  moonTangentBasis,
  stepMoonWalker,
} from '@/lib/moon';
import { EARTH_RADIUS } from '@/lib/god-orbits';

// Earth as seen from the Moon: radius 55 at 180 away.
const EARTH_POS = {
  x: MOON_EARTH_DIR.x * MOON_EARTH_DISTANCE,
  y: MOON_EARTH_DIR.y * MOON_EARTH_DISTANCE,
  z: MOON_EARTH_DIR.z * MOON_EARTH_DISTANCE,
};

// Procedural Earth: blue oceans, green/brown land, white clouds,
// bright poles — seeded so every client paints the same Earth.
function makeEarthTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  let seed = 19690720;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  ctx.fillStyle = '#2f6fd0';
  ctx.fillRect(0, 0, 512, 256);
  // Continents: clustered green/brown blobs.
  for (let i = 0; i < 26; i++) {
    const cx = rnd() * 512;
    const cy = 40 + rnd() * 176;
    const r = 12 + rnd() * 30;
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(63,143,79,0.9)' : 'rgba(138,111,63,0.9)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * (0.5 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Clouds: white streaks.
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * 512, rnd() * 256, 8 + rnd() * 26, 2 + rnd() * 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Ice caps.
  ctx.fillStyle = 'rgba(240,248,255,0.95)';
  ctx.fillRect(0, 0, 512, 14);
  ctx.fillRect(0, 242, 512, 14);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Deterministic rocks near the landing site (seeded — same every load).
function rockPlacements() {
  let seed = 20261113;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const up = { x: 0, y: 1, z: 0 };
  const rocks = [];
  for (let i = 0; i < 16; i++) {
    const az = rnd() * Math.PI * 2;
    const ang = 0.12 + rnd() * 0.45; // 0.12–0.57 rad from the pad (~1.7–8 m away)
    // Direction = landing up rotated by ang around a horizontal axis at azimuth az.
    const axis = { x: Math.cos(az), y: 0, z: Math.sin(az) };
    // Rodrigues: dir = up·cos(ang) + (axis × up)·sin(ang) (axis ⊥ up).
    const cross = { x: axis.y * up.z - axis.z * up.y, y: axis.z * up.x - axis.x * up.z, z: axis.x * up.y - axis.y * up.x };
    const dir = {
      x: up.x * Math.cos(ang) + cross.x * Math.sin(ang),
      y: up.y * Math.cos(ang) + cross.y * Math.sin(ang),
      z: up.z * Math.cos(ang) + cross.z * Math.sin(ang),
    };
    const size = 0.3 + rnd() * 0.9;
    rocks.push({
      pos: { x: dir.x * (MOON_RADIUS - size * 0.3), y: dir.y * (MOON_RADIUS - size * 0.3), z: dir.z * (MOON_RADIUS - size * 0.3) },
      size,
      rot: rnd() * Math.PI * 2,
    });
  }
  return rocks;
}

const FLAG_OFFSET_M = 2.6; // flag stands 2.6 m north of the pad centre
// The flag sits 2.6 m north of the pole, where the surface normal
// tilts 2.6/14 rad (10.5°) toward -Z — lean the pole group by that
// much so the flag stands square on the ground, not vertical.
const FLAG_TILT = Math.atan(FLAG_OFFSET_M / MOON_RADIUS);

function MoonRig({ moveRef, jumpRef, hudRef }) {
  const { camera, gl } = useThree();
  // Arrive facing north (-Z, toward Earth's azimuth) and slightly
  // up (pitch 0.35 ≈ 20°) — Earth hangs 26° up ahead on arrival.
  const yaw = useRef(0);
  const pitch = useRef(0.35);
  const walker = useRef(moonLandingState());
  const keys = useRef(new Set());
  const dragging = useRef(null);
  const jumpQueued = useRef(false);

  useEffect(() => {
    const down = (e) => {
      keys.current.add(String(e.key).toLowerCase());
      if (e.code === 'Space' && !e.repeat) {
        jumpQueued.current = true;
        e.preventDefault();
      }
    };
    const up = (e) => keys.current.delete(String(e.key).toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e) => {
      dragging.current = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e) => {
      const d = dragging.current;
      if (!d) return;
      yaw.current -= (e.clientX - d.x) * 0.004;
      pitch.current = Math.max(-1.2, Math.min(1.2, pitch.current - (e.clientY - d.y) * 0.004));
      dragging.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      dragging.current = null;
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [gl]);

  useFrame((state, delta) => {
    const k = keys.current;
    let fwd =
      (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    let strafe =
      (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    if (moveRef && moveRef.current) {
      fwd += moveRef.current.y || 0;
      strafe += moveRef.current.x || 0;
    }
    const len = Math.hypot(fwd, strafe);
    if (len > 1) {
      fwd /= len;
      strafe /= len;
    }
    // The JUMP button (page HUD) arms the same edge as the Space key.
    if (jumpRef && jumpRef.current) {
      jumpQueued.current = true;
      jumpRef.current = false;
    }
    const { up, forward, right } = moonTangentBasis(walker.current.feet, yaw.current);
    walker.current = stepMoonWalker(
      walker.current,
      { fwd, strafe, jump: jumpQueued.current, forward, right },
      Math.min(delta, 0.05)
    );
    jumpQueued.current = false;
    const { feet } = walker.current;
    // Camera rides the surface normal: position above the feet,
    // up = the normal, so the horizon tilts as you walk the sphere.
    camera.position.set(
      feet.x + up.x * MOON_EYE_HEIGHT,
      feet.y + up.y * MOON_EYE_HEIGHT,
      feet.z + up.z * MOON_EYE_HEIGHT
    );
    camera.up.set(up.x, up.y, up.z);
    const cp = Math.cos(pitch.current);
    const sp = Math.sin(pitch.current);
    camera.lookAt(
      camera.position.x + (forward.x * cp + up.x * sp),
      camera.position.y + (forward.y * cp + up.y * sp),
      camera.position.z + (forward.z * cp + up.z * sp)
    );
    if (hudRef) {
      const h = Math.hypot(feet.x, feet.y, feet.z) - MOON_RADIUS;
      hudRef.current = { height: h, grounded: walker.current.grounded };
    }
  });

  return null;
}

export default function MoonScene({ moveRef, jumpRef, hudRef }) {
  const moonTex = useMemo(makeMoonTexture, []);
  const earthTex = useMemo(makeEarthTexture, []);
  const rocks = useMemo(rockPlacements, []);
  useEffect(
    () => () => {
      moonTex && moonTex.dispose();
      earthTex && earthTex.dispose();
    },
    [moonTex, earthTex]
  );

  return (
    <>
      {/* Sunlight: hard and white, like real lunar daylight. */}
      <ambientLight intensity={0.12} />
      <directionalLight position={[50, 80, 40]} intensity={2.2} color="#fff2dd" />
      <Stars radius={300} depth={50} count={5000} factor={4} fade speed={0.5} />

      {/* The Moon itself — the walker stands on this sphere. */}
      <mesh>
        <sphereGeometry args={[MOON_RADIUS, 64, 48]} />
        <meshStandardMaterial map={moonTex} roughness={0.95} metalness={0} />
      </mesh>

      {/* Earth hanging in the sky, hub scene scale (r55 at 180). */}
      <mesh position={[EARTH_POS.x, EARTH_POS.y, EARTH_POS.z]}>
        <sphereGeometry args={[EARTH_RADIUS, 48, 32]} />
        <meshStandardMaterial map={earthTex} roughness={0.7} metalness={0} />
      </mesh>
      <Billboard position={[EARTH_POS.x, EARTH_POS.y + EARTH_RADIUS + 22, EARTH_POS.z]}>
        <VanGoghText fontSize={9} color="#cfe8ff" anchorX="center" anchorY="middle" outlineWidth={0.4} outlineColor="#000000">
          ◈ EARTH
        </VanGoghText>
      </Billboard>

      {/* Landing zone: gold ring at the pad + the Olympus flag. */}
      <mesh position={[MOON_LANDING_FEET.x, MOON_LANDING_FEET.y + 0.05, MOON_LANDING_FEET.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.7, 2.1, 48]} />
        <meshBasicMaterial color="#ffd700" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      <group position={[MOON_LANDING_FEET.x, MOON_LANDING_FEET.y, MOON_LANDING_FEET.z - FLAG_OFFSET_M]} rotation={[-FLAG_TILT, 0, 0]}>
        <mesh position={[0, 1.2, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 2.4, 8]} />
          <meshStandardMaterial color="#cfd2d6" roughness={0.4} metalness={0.8} />
        </mesh>
        <mesh position={[0.58, 2.1, 0]}>
          <planeGeometry args={[1.15, 0.65]} />
          <meshBasicMaterial color="#ffd700" side={THREE.DoubleSide} />
        </mesh>
        <Billboard position={[0, 3.1, 0]}>
          <VanGoghText fontSize={0.9} color="#ffd700" anchorX="center" anchorY="middle" outlineWidth={0.15} outlineColor="#000000">
            OLYMPUS
          </VanGoghText>
        </Billboard>
      </group>

      {/* Scattered rocks near the landing zone. */}
      {rocks.map((rock, i) => (
        <mesh key={i} position={[rock.pos.x, rock.pos.y, rock.pos.z]} rotation={[0, rock.rot, 0]}>
          <dodecahedronGeometry args={[rock.size, 0]} />
          <meshStandardMaterial color="#8a8a8a" roughness={1} metalness={0} flatShading />
        </mesh>
      ))}

      <MoonRig moveRef={moveRef} jumpRef={jumpRef} hudRef={hudRef} />
    </>
  );
}
