// components/mars2/MarsMoonScene.jsx — MARS'S RED MOON (Merlin, Nov 17, 2026).
//
// The red moon as a world: /mars-moon. The hub Moon's scene
// (components/MoonScene.jsx) is the pattern — the walker stands ON
// the sphere via the shared sphere walker, Mars hangs in the sky
// ahead of you, 26° up, and a jump arcs 2.78 m for 3.70 s under
// the same low gravity. Only the colour and the planet overhead
// change: the ground wears Merlin's moon photo tinted blood-red
// (the same wrap + tint as the sky moon), the rocks are red, and
// Mars — rust-red, 45 m across at 180 — hangs where Earth hangs
// over the hub Moon. Tap Mars and you are back on Mars 2 on foot
// (the hub Moon's Earth-tap hop, same words).
//
// The physics lives in lib/mars2/moon.js (pure, tested): radius
// 14, gravity 1.62 m/s², walk 2.5 m/s, the shared 3.0 m/s
// take-off. The scene never re-derives a number by hand.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Stars, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import VanGoghText from '../VanGoghText';
import { makeMoonTexture } from '../HubMoon';
import {
  MARS_MOON_RADIUS,
  MARS_MOON_EYE_HEIGHT,
  MARS_MOON_PLANET,
  MARS_MOON_MARS_DIR,
  MARS_MOON_MARS_DISTANCE,
  MARS_MOON_MARS_RADIUS,
  MARS_MOON_LANDING_FEET,
  marsMoonLandingState,
  marsMoonRockPlacements,
  marsMoonPebblePlacements,
  marsMoonGlobalRockPlacements,
  marsMoonGlobalPebblePlacements,
  MARS_MOON_DUST_FIELD,
} from '@/lib/mars2/moon';
import {
  sphereTangentBasis,
  stepSphereWalker,
  lookTurnForDrag,
  dampLookAngle,
  recenterLookOffset,
  lookOffsetFromHeading,
  LOOK_PITCH_MAX,
} from '@/lib/planet-walker';
import { moonPhaseDaylight } from '@/lib/day-night';
import { planetMaps, materialForPlanet } from '@/lib/planet-cgi/textures';
import { makeDustField, updateDustField } from '@/lib/planet-cgi/motion';

// Mars as seen from its moon: radius 45 at 180, 26° up.
const MARS_POS = {
  x: MARS_MOON_MARS_DIR.x * MARS_MOON_MARS_DISTANCE,
  y: MARS_MOON_MARS_DIR.y * MARS_MOON_MARS_DISTANCE,
  z: MARS_MOON_MARS_DIR.z * MARS_MOON_MARS_DISTANCE,
};
const MARS_ATMO_RADIUS = MARS_MOON_MARS_RADIUS * 1.06;

function MarsInSky({ onMarsClick }) {
  const marsMaps = useMemo(() => planetMaps('marsRegolith', 'mars-2'), []);
  const marsClick = onMarsClick
    ? {
        onClick: (e) => { e.stopPropagation(); onMarsClick(); },
        onPointerOver: (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; },
        onPointerOut: () => { document.body.style.cursor = ''; },
      }
    : {};
  return (
    <group position={[MARS_POS.x, MARS_POS.y, MARS_POS.z]} {...marsClick}>
      <mesh>
        <sphereGeometry args={[MARS_MOON_MARS_RADIUS, 48, 32]} />
        <meshStandardMaterial map={marsMaps.map} bumpMap={marsMaps.bumpMap} bumpScale={marsMaps.bumpScale} roughness={marsMaps.roughness} metalness={0} />
      </mesh>
      {/* Faint atmosphere rim: a BackSide additive shell — a cheap
          fresnel-ish glow around the disc, no shader. */}
      <mesh>
        <sphereGeometry args={[MARS_ATMO_RADIUS, 48, 32]} />
        <meshBasicMaterial color="#ff8a5a" transparent opacity={0.14} blending={THREE.AdditiveBlending} side={THREE.BackSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function MarsMoonCgiMotion({ dust }) {
  useFrame(() => {
    const now = Date.now();
    if (dust) updateDustField(dust, now);
  });
  return null;
}

function MarsMoonRig({ moveRef, jumpRef, hudRef }) {
  const { camera, gl } = useThree();
  // Arrive facing north (-Z, toward Mars's azimuth) and slightly
  // up (pitch 0.35 ≈ 20°) — Mars hangs 26° up ahead on arrival.
  const yaw = useRef(0);
  const pitch = useRef(0.35);
  const yawTarget = useRef(0);
  const pitchTarget = useRef(0.35);
  const walker = useRef(marsMoonLandingState());
  const keys = useRef(new Set());
  const dragging = useRef(null);
  const recenterRef = useRef(false);
  const lookAnchorRef = useRef({ yaw: 0, pitch: 0.35 });
  const lookMovedRef = useRef(false);
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
      e.preventDefault();
      lookAnchorRef.current = { yaw: yawTarget.current, pitch: pitchTarget.current };
      recenterRef.current = false;
      lookMovedRef.current = false;
      dragging.current = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e) => {
      const d = dragging.current;
      if (!d) return;
      lookMovedRef.current = true;
      // The drag moves the look TARGET, not the angle — the frame
      // loop eases the camera toward it. FINGER-FOLLOWS (the Moon
      // rig's law, same basis): yaw+ is look-right here, so drag
      // right ADDS the turn; pitch+ is look-up, so drag down
      // (dy > 0) SUBTRACTS.
      const w = el.clientWidth || window.innerWidth || 1;
      yawTarget.current += lookTurnForDrag(e.clientX - d.x, w);
      pitchTarget.current = Math.max(
        -LOOK_PITCH_MAX,
        Math.min(LOOK_PITCH_MAX, pitchTarget.current - lookTurnForDrag(e.clientY - d.y, w))
      );
      dragging.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      if (lookMovedRef.current) recenterRef.current = true;
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
    if (jumpRef && jumpRef.current) {
      jumpQueued.current = true;
      jumpRef.current = false;
    }
    const dtC = Math.min(delta, 0.05);
    if (recenterRef.current) {
      const eased = recenterLookOffset(
        { yaw: lookOffsetFromHeading(yawTarget.current, lookAnchorRef.current.yaw), pitch: pitchTarget.current - lookAnchorRef.current.pitch },
        dtC
      );
      yawTarget.current = lookAnchorRef.current.yaw + eased.yaw;
      pitchTarget.current = lookAnchorRef.current.pitch + eased.pitch;
      if (Math.abs(eased.yaw) < 0.005 && Math.abs(eased.pitch) < 0.005) {
        yawTarget.current = lookAnchorRef.current.yaw;
        pitchTarget.current = lookAnchorRef.current.pitch;
        recenterRef.current = false;
      }
    }
    yaw.current = dampLookAngle(yaw.current, yawTarget.current, dtC);
    pitch.current = dampLookAngle(pitch.current, pitchTarget.current, dtC);
    const { up, forward, right } = sphereTangentBasis(walker.current.feet, yaw.current, MARS_MOON_RADIUS);
    walker.current = stepSphereWalker(
      walker.current,
      { fwd, strafe, jump: jumpQueued.current, forward, right },
      dtC,
      MARS_MOON_PLANET
    );
    jumpQueued.current = false;
    const { feet } = walker.current;
    camera.position.set(
      feet.x + up.x * MARS_MOON_EYE_HEIGHT,
      feet.y + up.y * MARS_MOON_EYE_HEIGHT,
      feet.z + up.z * MARS_MOON_EYE_HEIGHT
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
      const h = Math.hypot(feet.x, feet.y, feet.z) - MARS_MOON_RADIUS;
      hudRef.current = { height: h, grounded: walker.current.grounded };
    }
  });

  return null;
}

export default function MarsMoonScene({ moveRef, jumpRef, hudRef, onMarsClick }) {
  const moonMaps = useMemo(makeMoonTexture, []);
  const rocks = useMemo(marsMoonRockPlacements, []);
  const pebbles = useMemo(marsMoonPebblePlacements, []);
  const globalRocks = useMemo(marsMoonGlobalRockPlacements, []);
  const globalPebbles = useMemo(marsMoonGlobalPebblePlacements, []);
  const dust = useMemo(() => makeDustField(MARS_MOON_DUST_FIELD), []);
  const rockMatA = useMemo(() => materialForPlanet('rock', 'mars-moon-rock-a', '#c96a4a'), []);
  const rockMatB = useMemo(() => materialForPlanet('rock', 'mars-moon-rock-b', '#b45a40'), []);
  useEffect(
    () => () => {
      dust.geometry.dispose();
      dust.material.dispose();
    },
    [dust]
  );
  // Day/night: the hard sunlight scales by the moon's real
  // illuminated fraction (the shared law) — full moon = the built
  // 2.2 daylight on the Mars-facing side, new moon = night,
  // floored at 0.05 so the scene never goes pitch black. The sky
  // stays black either way and Mars stays hanging where it was.
  const [sunlight, setSunlight] = useState(2.2);
  useEffect(() => {
    const applyPhase = () => {
      try {
        setSunlight(0.05 + 2.15 * moonPhaseDaylight(Date.now()));
      } catch {}
    };
    applyPhase();
    const id = setInterval(applyPhase, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <ambientLight intensity={0.12} />
      <directionalLight position={[50, 80, 40]} intensity={sunlight} color="#fff2dd" />
      {/* Marsshine: a soft red fill from Mars's direction so the
          night side isn't dead black — Mars is the moonlight here. */}
      <directionalLight position={[MARS_POS.x, MARS_POS.y, MARS_POS.z]} intensity={0.35} color="#ff7a5a" />
      <Stars radius={300} depth={50} count={5000} factor={4} fade speed={0.5} />

      {/* The red moon itself — Merlin's photo, tinted blood-red. */}
      <mesh>
        <sphereGeometry args={[MARS_MOON_RADIUS, 64, 48]} />
        <meshStandardMaterial map={moonMaps.map} bumpMap={moonMaps.bumpMap} bumpScale={moonMaps.bumpScale} roughness={moonMaps.roughness} metalness={0} color="#ff6a4a" />
      </mesh>

      {/* Mars hanging in the sky — tap it and you land back on
          Mars 2 on foot (the hub Moon's Earth hop, same words). */}
      <MarsInSky onMarsClick={onMarsClick} />
      <Billboard position={[MARS_POS.x, MARS_POS.y + MARS_MOON_MARS_RADIUS + 22, MARS_POS.z]}>
        <VanGoghText font="/fonts/DejaVuSans.ttf" fontSize={9} color="#ffb08a" anchorX="center" anchorY="middle" outlineWidth={0.4} outlineColor="#000000">
          ◈ MARS
        </VanGoghText>
      </Billboard>

      {/* Dust motes drifting around the landing site. */}
      <primitive object={dust} position={[MARS_MOON_LANDING_FEET.x, MARS_MOON_LANDING_FEET.y, MARS_MOON_LANDING_FEET.z]} />

      {/* A small label at the landing site, so the walker knows where they are. */}
      <Billboard position={[MARS_MOON_LANDING_FEET.x, MARS_MOON_LANDING_FEET.y + 2.75, MARS_MOON_LANDING_FEET.z]}>
        <VanGoghText font="/fonts/DejaVuSans.ttf" fontSize={0.3} color="#ff8a5a" anchorX="center" anchorY="middle" outlineWidth={0.05} outlineColor="#000000">
          RED MOON
        </VanGoghText>
      </Billboard>

      {/* Scattered rocks near the landing zone — red rock, bump-mapped. */}
      {rocks.map((rock, i) => (
        <mesh key={i} position={[rock.pos.x, rock.pos.y, rock.pos.z]} rotation={[0, rock.rot, 0]} material={i % 2 ? rockMatB : rockMatA}>
          <dodecahedronGeometry args={[rock.size, 0]} />
        </mesh>
      ))}
      {pebbles.map((pebble, i) => (
        <mesh key={`peb-${i}`} position={[pebble.pos.x, pebble.pos.y, pebble.pos.z]} rotation={[0, pebble.rot, 0]} material={i % 2 ? rockMatB : rockMatA}>
          <dodecahedronGeometry args={[pebble.size, 0]} />
        </mesh>
      ))}
      {globalRocks.map((rock, i) => (
        <mesh key={`grock-${i}`} position={[rock.pos.x, rock.pos.y, rock.pos.z]} rotation={[0, rock.rot, 0]} material={i % 2 ? rockMatB : rockMatA}>
          <dodecahedronGeometry args={[rock.size, 0]} />
        </mesh>
      ))}
      {globalPebbles.map((pebble, i) => (
        <mesh key={`gpeb-${i}`} position={[pebble.pos.x, pebble.pos.y, pebble.pos.z]} rotation={[0, pebble.rot, 0]} material={i % 2 ? rockMatB : rockMatA}>
          <dodecahedronGeometry args={[pebble.size, 0]} />
        </mesh>
      ))}

      <MarsMoonCgiMotion dust={dust} />
      <MarsMoonRig moveRef={moveRef} jumpRef={jumpRef} hudRef={hudRef} />
    </>
  );
}
