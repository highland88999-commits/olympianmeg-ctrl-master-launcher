'use client';

// components/EarthWalkScene.jsx — walking on Earth (Merlin, Nov 15, 2026).
//
// "Yes — let me jump around Earth too": the on-foot Earth, the
// Moon's walker under Earth's own real gravity (9.81 m/s²). Same
// 3.0 m/s take-off, so the jump here is a small honest hop — apex
// 0.46 m, hang 0.61 s — against the Moon's 2.78 m / 3.70 s. Walk
// 6 m/s, eye 1.7 m. The walker stands ON the Earth sphere (radius
// 55), up is the surface normal, and the step re-projects onto the
// sphere every frame, so you can never fall through or drift off
// into space — the same physics as the Moon, one shared module
// (lib/planet-walker.js).
//
// Ground: Merlin's day map (public/textures/earth/earth-day.jpg —
// 1600×800 2:1 equirectangular, the exact shape a sphere wants),
// with the procedural earthLike maps as the fallback if the photo
// fails (same pattern as the Moon's sky Earth). Seeded rocks +
// pebbles cover the whole sphere so the far side has features.
// Sky: the Moon hangs 26° up ahead (radius 14 at 180 — the mirror
// of the Moon's Earth); tap it to land back on the Moon. Mars and
// Jupiter are NOT in this sky — from Earth they are bright points,
// not discs you could tap, so no hop is faked for them; the hub
// stays the door to Mars 2 / Jupiter 2. Constant daylight (no
// day/night law wired here yet).

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Stars, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import VanGoghText from './VanGoghText';
import { makeMoonTexture } from './HubMoon';
import { EARTH_RADIUS } from '@/lib/god-orbits';
import {
  EARTH_WALK_PLANET,
  EARTH_WALK_GROUND_PHOTO_URL,
  EARTH_WALK_MOON_DIR,
  EARTH_WALK_MOON_DISTANCE,
  EARTH_WALK_MOON_RADIUS,
  earthWalkLandingState,
  earthWalkRockPlacements,
  earthWalkPebblePlacements,
} from '@/lib/earth-walk';
import {
  LOOK_SENSITIVITY,
  LOOK_PITCH_MAX,
  dampLookAngle,
  sphereTangentBasis,
  stepSphereWalker,
} from '@/lib/planet-walker';
import { planetMaps, materialForPlanet } from '@/lib/planet-cgi/textures';

// The Moon as seen from Earth: radius 14 at 180 away, 26° up.
const MOON_POS = {
  x: EARTH_WALK_MOON_DIR.x * EARTH_WALK_MOON_DISTANCE,
  y: EARTH_WALK_MOON_DIR.y * EARTH_WALK_MOON_DISTANCE,
  z: EARTH_WALK_MOON_DIR.z * EARTH_WALK_MOON_DISTANCE,
};

// Merlin's day map (Nov 15, 2026): his photograph of Earth in
// daylight wraps the ground sphere — a 1600×800 (2:1)
// equirectangular JPEG, the exact shape a sphere wants. The photo
// lives in the ground slot (public/textures/earth/earth-day.jpg).
// No colourising, no new lights, no re-cut. The procedural
// earthLike maps stay as the fallback: the returned texture
// object starts on a canvas painted with the procedural pixels
// and swaps its image to the photo the moment it lands, so a
// failed load never leaves a blank Earth. One texture object is
// shared — a single load, one source of truth, same as the Moon
// (HubMoon makeMoonTexture). The procedural bump map stays (its
// continents do not line up with the photo's real ones, but at
// bumpScale 0.05 it only adds relief — the photo's own shading
// does the work). Node-safe: without a DOM (tests, prerender)
// the procedural maps stand as-is and no loader runs.
export const EARTH_DAY_PHOTO_URL = EARTH_WALK_GROUND_PHOTO_URL;

let earthDayTextureShared = null;

export function makeEarthDayTexture() {
  if (earthDayTextureShared) return earthDayTextureShared;
  const fallback = planetMaps('earthLike', 'earth');
  const out = {
    map: fallback.map,
    bumpMap: fallback.bumpMap,
    roughness: fallback.roughness,
    bumpScale: fallback.bumpScale,
  };
  earthDayTextureShared = out;
  if (typeof document === 'undefined') return out;
  try {
    const src = fallback.map.image;
    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return out;
    const imgData = ctx.createImageData(src.width, src.height);
    imgData.data.set(src.data);
    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.Texture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    // The procedural DataTexture is south-up (flipY false); the
    // canvas must match it or the fallback renders upside down.
    tex.flipY = false;
    tex.needsUpdate = true;
    out.map = tex;
    new THREE.TextureLoader().load(
      EARTH_DAY_PHOTO_URL,
      (loaded) => {
        // The photo is a standard north-up equirectangular map.
        tex.image = loaded.image;
        tex.flipY = true;
        tex.needsUpdate = true;
      },
      undefined,
      () => { /* photo failed: the procedural canvas stays */ },
    );
  } catch {
    // Canvas unavailable: the procedural maps stand as-is.
    out.map = fallback.map;
  }
  return out;
}

function MoonInSky({ onMoonClick }) {
  const moonMaps = useMemo(makeMoonTexture, []);
  // Tapping the Moon lands back on it on foot (Merlin, Nov 15,
  // 2026): the hop is a plain route change, no hub detour. The
  // handlers ride the mesh so the whole visible disc is
  // clickable; the cursor follows the hub's PlanetBody pattern
  // (HomeScene: pointer = 'pointer' on hover).
  const moonClick = onMoonClick
    ? {
        onClick: (e) => { e.stopPropagation(); onMoonClick(); },
        onPointerOver: (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; },
        onPointerOut: () => { document.body.style.cursor = ''; },
      }
    : {};
  return (
    <group position={[MOON_POS.x, MOON_POS.y, MOON_POS.z]} {...moonClick}>
      <mesh>
        <sphereGeometry args={[EARTH_WALK_MOON_RADIUS, 48, 32]} />
        <meshStandardMaterial map={moonMaps.map} bumpMap={moonMaps.bumpMap} bumpScale={moonMaps.bumpScale} roughness={moonMaps.roughness} metalness={0} />
      </mesh>
    </group>
  );
}

function EarthWalkRig({ moveRef, jumpRef, hudRef }) {
  const { camera, gl } = useThree();
  // Arrive facing north (-Z, toward the Moon's azimuth) and
  // slightly up (pitch 0.35 ≈ 20°) — the Moon hangs 26° up ahead
  // on arrival.
  const yaw = useRef(0);
  const pitch = useRef(0.35);
  // Gentle look (the Moon's law, shared): the drag sets a TARGET
  // and the frame loop eases the camera toward it. Targets start
  // at the arrival angles, so the first frame is exactly the
  // arrival view.
  const yawTarget = useRef(0);
  const pitchTarget = useRef(0.35);
  const walker = useRef(earthWalkLandingState());
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
      // The drag moves the look TARGET, not the angle — the frame
      // loop eases the camera toward it. Sensitivity is the shared
      // LOOK_SENSITIVITY (0.0015 rad/px); one handler serves touch
      // drag and desktop mouse drag alike.
      yawTarget.current -= (e.clientX - d.x) * LOOK_SENSITIVITY;
      pitchTarget.current = Math.max(
        -LOOK_PITCH_MAX,
        Math.min(LOOK_PITCH_MAX, pitchTarget.current - (e.clientY - d.y) * LOOK_SENSITIVITY)
      );
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
    // Gentle look: ease the camera toward the drag target instead
    // of snapping to it. The walker step's 0.05 s clamp bounds the
    // ease step too.
    const dtC = Math.min(delta, 0.05);
    yaw.current = dampLookAngle(yaw.current, yawTarget.current, dtC);
    pitch.current = dampLookAngle(pitch.current, pitchTarget.current, dtC);
    const { up, forward, right } = sphereTangentBasis(walker.current.feet, yaw.current, EARTH_RADIUS);
    walker.current = stepSphereWalker(
      walker.current,
      { fwd, strafe, jump: jumpQueued.current, forward, right },
      dtC,
      EARTH_WALK_PLANET
    );
    jumpQueued.current = false;
    const { feet } = walker.current;
    // Camera rides the surface normal: position above the feet,
    // up = the normal, so the horizon tilts as you walk the sphere.
    camera.position.set(
      feet.x + up.x * EARTH_WALK_PLANET.eyeHeight,
      feet.y + up.y * EARTH_WALK_PLANET.eyeHeight,
      feet.z + up.z * EARTH_WALK_PLANET.eyeHeight
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
      const h = Math.hypot(feet.x, feet.y, feet.z) - EARTH_RADIUS;
      hudRef.current = { height: h, grounded: walker.current.grounded };
    }
  });

  return null;
}

export default function EarthWalkScene({ moveRef, jumpRef, hudRef, onMoonClick }) {
  // One source of truth with the hub orb (HubMoon makeMoonTexture):
  // the shared lunar maps now carry a real bump map. The maps and
  // the rock materials are cache-owned by lib/planet-cgi — never
  // disposed by a consumer.
  const earthMaps = useMemo(makeEarthDayTexture, []);
  const rocks = useMemo(earthWalkRockPlacements, []);
  const pebbles = useMemo(earthWalkPebblePlacements, []);
  const rockMatA = useMemo(() => materialForPlanet('rock', 'earth-rock-a'), []);
  const rockMatB = useMemo(() => materialForPlanet('rock', 'earth-rock-b'), []);

  return (
    <>
      {/* Sunlight: steady daylight — no day/night law wired here yet. */}
      <ambientLight intensity={0.25} />
      <directionalLight position={[50, 80, 40]} intensity={2.2} color="#fff2dd" />
      <Stars radius={300} depth={50} count={5000} factor={4} fade speed={0.5} />

      {/* The Earth itself — the walker stands on this sphere.
          Merlin's day photo wraps it; the procedural maps are the
          fallback if the photo fails to load. */}
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, 64, 48]} />
        <meshStandardMaterial map={earthMaps.map} bumpMap={earthMaps.bumpMap} bumpScale={earthMaps.bumpScale} roughness={earthMaps.roughness} metalness={0} />
      </mesh>

      {/* The Moon hanging in the sky, hub scene scale (r14 at 180) —
          tap it and you land back on the Moon on foot. */}
      <MoonInSky onMoonClick={onMoonClick} />
      <Billboard position={[MOON_POS.x, MOON_POS.y + EARTH_WALK_MOON_RADIUS + 6, MOON_POS.z]}>
        <VanGoghText fontSize={4} color="#cfe8ff" anchorX="center" anchorY="middle" outlineWidth={0.4} outlineColor="#000000">
          ◈ MOON
        </VanGoghText>
      </Billboard>

      {/* Scattered rocks across the WHOLE Earth — the ground has
          features everywhere, not just at the landing site. Same
          shared rock material as the Moon's scatter. */}
      {rocks.map((rock, i) => (
        <mesh key={i} position={[rock.pos.x, rock.pos.y, rock.pos.z]} rotation={[0, rock.rot, 0]} material={i % 2 ? rockMatB : rockMatA}>
          <dodecahedronGeometry args={[rock.size, 0]} />
        </mesh>
      ))}

      {/* Pebbles on the ground around the whole sphere. */}
      {pebbles.map((pebble, i) => (
        <mesh key={`peb-${i}`} position={[pebble.pos.x, pebble.pos.y, pebble.pos.z]} rotation={[0, pebble.rot, 0]} material={i % 2 ? rockMatB : rockMatA}>
          <dodecahedronGeometry args={[pebble.size, 0]} />
        </mesh>
      ))}

      <EarthWalkRig moveRef={moveRef} jumpRef={jumpRef} hudRef={hudRef} />
    </>
  );
}
