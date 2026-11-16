'use client';

// components/MoonScene.jsx — the lunar surface (Merlin, Nov 13, 2026;
// CGI pass Nov 14: "Make it a cgi moon" — the surface, Earth and
// rocks now come from the shared planet-CGI module
// (lib/planet-cgi) with a real bump map, Earth turns on the real
// clock under its own drifting cloud layer, dust motes drift
// around the pad, and the flag waves. The physics lives in
// lib/moon.js (pure, tested): real lunar gravity 1.62 m/s², jump
// apex 2.7778 m, hang 3.7037 s — untouched by the CGI pass.
// The walker stands ON the sphere — up is the surface normal,
// so the horizon tilts correctly as you walk around the Moon —
// and the step re-projects onto the sphere every frame, so you
// can never fall through or drift off into space.

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Stars, Billboard, Environment } from '@react-three/drei';
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
  MOON_EARTH_SPIN_RATE,
  MOON_OLYMPUS_LABEL_SIZE,
  MOON_FLAG_CLOTH,
  MOON_DUST_FIELD,
  moonLandingState,
  moonTangentBasis,
  stepMoonWalker,
} from '@/lib/moon';
import { EARTH_RADIUS } from '@/lib/god-orbits';
import { moonPhaseDaylight } from '@/lib/day-night';
import { planetMaps, materialForPlanet, cloudLayerTexture } from '@/lib/planet-cgi/textures';
import {
  spinAngle,
  cloudDriftAngle,
  makeDustField,
  updateDustField,
  waveFlag,
  moonWind,
} from '@/lib/planet-cgi/motion';
import { GOLD_TEXTURE_URL } from '@/lib/portal/gold-texture';

// Earth as seen from the Moon: radius 55 at 180 away.
const EARTH_POS = {
  x: MOON_EARTH_DIR.x * MOON_EARTH_DISTANCE,
  y: MOON_EARTH_DIR.y * MOON_EARTH_DISTANCE,
  z: MOON_EARTH_DIR.z * MOON_EARTH_DISTANCE,
};

// Earth as seen from the Moon, CGI (Nov 14): a real earthLike
// surface turning slowly on the real clock, a separate cloud
// layer drifting faster above it, and a faint additive
// atmosphere rim. Earth stays 26° up, radius 55 at 180 away.
const EARTH_CLOUD_RADIUS = EARTH_RADIUS * 1.02;
const EARTH_ATMO_RADIUS = EARTH_RADIUS * 1.06;

// Merlin's night map (Nov 15, 2026): his photograph of Earth at
// night wraps the Earth in the /moon sky — a 1170x585 (2:1)
// equirectangular JPEG, the exact shape a sphere wants. The photo
// lives in the globe's night slot (public/textures/earth/
// earth-night.jpg — the same file the hub's procedural globe
// loads as its night texture, so both Earth globes wear it).
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
// NOTE: the photo is a NIGHT map (city lights, dark oceans), so
// this globe reads as night from every angle even in daylight —
// the honest next step (night as an emissive layer over a day
// map) is Merlin's call, not built here.
export const EARTH_NIGHT_PHOTO_URL = '/textures/earth/earth-night.jpg';

let earthTextureShared = null;

export function makeEarthPhotoTexture() {
  if (earthTextureShared) return earthTextureShared;
  const fallback = planetMaps('earthLike', 'earth');
  const out = {
    map: fallback.map,
    bumpMap: fallback.bumpMap,
    roughness: fallback.roughness,
    bumpScale: fallback.bumpScale,
  };
  earthTextureShared = out;
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
      EARTH_NIGHT_PHOTO_URL,
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

// Merlin's flag photos (Nov 15, 2026): his gold-Omega-on-silver
// photograph wraps the flag cloth (both sides). The pole shares the
// ONE gold file — the arch gold at /textures/gold/gold-scratched.jpg
// (lib/portal/gold-texture.js GOLD_TEXTURE_URL), byte-identical to
// his scratched-gold upload; there is exactly one 400 KB copy in
// the repo, and the pole's (1, 8) repeat is its own texture object
// so the arches' repeat is untouched. The Omega photo is
// 1170×653 (1.792), copied byte-for-byte to
// /images/moon/flag-omega.jpg. Shared, cache-owned textures —
// loaded once per page, never disposed by a consumer (same rule
// as the lunar maps). Before a photo lands the caller shows its
// plain-colour fallback (gold cloth, silver pole), so a failed
// load never leaves a blank flag or pole. No re-cut, no colourising.
export const FLAG_OMEGA_PHOTO_URL = '/images/moon/flag-omega.jpg';

const photoTextureCache = new Map();

function setupFlagOmegaTexture(tex) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = true;
}

function setupPoleGoldTexture(tex) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // Pole circumference is 2π × 0.05 ≈ 0.31 m, height 2.4 m — repeat
  // (1, 8) keeps the scratches near-square instead of stretched.
  tex.repeat.set(1, 8);
  tex.flipY = true;
}

// Returns the shared texture once it has loaded, null until then.
// Node-safe: without a DOM (tests, prerender) nothing loads.
function usePhotoTexture(url, setup) {
  const [tex, setTex] = useState(() => photoTextureCache.get(url) || null);
  useEffect(() => {
    if (photoTextureCache.has(url)) {
      setTex(photoTextureCache.get(url));
      return;
    }
    if (typeof document === 'undefined') return;
    let alive = true;
    new THREE.TextureLoader().load(
      url,
      (loaded) => {
        if (setup) setup(loaded);
        photoTextureCache.set(url, loaded);
        if (alive) setTex(loaded);
      },
      undefined,
      () => { /* photo failed: the plain-colour fallback stays */ },
    );
    return () => { alive = false; };
  }, [url, setup]);
  return tex;
}

function EarthInSky({ onEarthClick }) {
  const earthRef = useRef();
  const cloudRef = useRef();
  const earthMaps = useMemo(() => makeEarthPhotoTexture(), []);
  const cloudTex = useMemo(() => cloudLayerTexture('earth-clouds'), []);
  useEffect(() => () => cloudTex.dispose(), [cloudTex]);
  useFrame(() => {
    const now = Date.now();
    if (earthRef.current) earthRef.current.rotation.y = spinAngle(MOON_EARTH_SPIN_RATE, now);
    if (cloudRef.current) cloudRef.current.rotation.y = cloudDriftAngle(MOON_EARTH_SPIN_RATE, now);
  });
  // Clicking Earth brings the user to the Earth menu (Merlin, Nov 15,
  // 2026): the hub's Earth chooser (Earth 1/2/3/4), via the existing
  // ?enter=earth deep link — no new hub param, no hub change. The
  // handlers ride the group so the whole visible disc (surface +
  // clouds + rim) is clickable; the cursor follows the hub's
  // PlanetBody pattern (HomeScene: pointer = 'pointer' on hover).
  const earthClick = onEarthClick
    ? {
        onClick: (e) => { e.stopPropagation(); onEarthClick(); },
        onPointerOver: (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; },
        onPointerOut: () => { document.body.style.cursor = ''; },
      }
    : {};
  return (
    <group position={[EARTH_POS.x, EARTH_POS.y, EARTH_POS.z]} {...earthClick}>
      <mesh ref={earthRef}>
        <sphereGeometry args={[EARTH_RADIUS, 48, 32]} />
        <meshStandardMaterial map={earthMaps.map} bumpMap={earthMaps.bumpMap} bumpScale={earthMaps.bumpScale} roughness={earthMaps.roughness} metalness={0} />
      </mesh>
      {/* Clouds ride their own slightly larger sphere, turning
          1.35× the surface rate so they drift over the ground. */}
      <mesh ref={cloudRef}>
        <sphereGeometry args={[EARTH_CLOUD_RADIUS, 48, 32]} />
        <meshBasicMaterial map={cloudTex} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      {/* Faint atmosphere rim: a BackSide additive shell — a cheap
          fresnel-ish glow around the disc, no shader. */}
      <mesh>
        <sphereGeometry args={[EARTH_ATMO_RADIUS, 48, 32]} />
        <meshBasicMaterial color="#7fb2ff" transparent opacity={0.14} blending={THREE.AdditiveBlending} side={THREE.BackSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

// Per-frame CGI motion, all pure functions of the real clock —
// no stored state: dust drifts, the flag waves with the wind.
function MoonCgiMotion({ dust, flagGeo }) {
  useFrame(() => {
    const now = Date.now();
    if (dust) updateDustField(dust, now);
    if (flagGeo) waveFlag(flagGeo, now, MOON_FLAG_CLOTH.width, MOON_FLAG_CLOTH.amplitude, moonWind(now));
  });
  return null;
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

// Small pebbles scattered on and around the pad (seeded — same every load).
function pebblePlacements() {
  let seed = 20261114;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const up = { x: 0, y: 1, z: 0 };
  const pebbles = [];
  for (let i = 0; i < 8; i++) {
    const az = rnd() * Math.PI * 2;
    const ang = 0.04 + rnd() * 0.18; // 0.04–0.22 rad from the pad (~0.6–3 m away)
    const axis = { x: Math.cos(az), y: 0, z: Math.sin(az) };
    const cross = { x: axis.y * up.z - axis.z * up.y, y: axis.z * up.x - axis.x * up.z, z: axis.x * up.y - axis.y * up.x };
    const dir = {
      x: up.x * Math.cos(ang) + cross.x * Math.sin(ang),
      y: up.y * Math.cos(ang) + cross.y * Math.sin(ang),
      z: up.z * Math.cos(ang) + cross.z * Math.sin(ang),
    };
    const size = 0.05 + rnd() * 0.11;
    pebbles.push({
      pos: { x: dir.x * (MOON_RADIUS - size * 0.3), y: dir.y * (MOON_RADIUS - size * 0.3), z: dir.z * (MOON_RADIUS - size * 0.3) },
      size,
      rot: rnd() * Math.PI * 2,
    });
  }
  return pebbles;
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

export default function MoonScene({ moveRef, jumpRef, hudRef, onEarthClick }) {
  // One source of truth with the hub orb (HubMoon makeMoonTexture):
  // the shared lunar maps now carry a real bump map. The maps and
  // the rock materials are cache-owned by lib/planet-cgi — never
  // disposed by a consumer. Only the per-mount dust field, flag
  // cloth and cloud texture are disposed on unmount.
  const moonMaps = useMemo(makeMoonTexture, []);
  const flagTex = usePhotoTexture(FLAG_OMEGA_PHOTO_URL, setupFlagOmegaTexture);
  const poleTex = usePhotoTexture(GOLD_TEXTURE_URL, setupPoleGoldTexture);
  const rocks = useMemo(rockPlacements, []);
  const pebbles = useMemo(pebblePlacements, []);
  const dust = useMemo(() => makeDustField(MOON_DUST_FIELD), []);
  const flagGeo = useMemo(
    () => new THREE.PlaneGeometry(MOON_FLAG_CLOTH.width, MOON_FLAG_CLOTH.height, MOON_FLAG_CLOTH.segmentsX, MOON_FLAG_CLOTH.segmentsY),
    []
  );
  const rockMatA = useMemo(() => materialForPlanet('rock', 'moon-rock-a'), []);
  const rockMatB = useMemo(() => materialForPlanet('rock', 'moon-rock-b'), []);
  useEffect(
    () => () => {
      dust.geometry.dispose();
      dust.material.dispose();
      flagGeo.dispose();
    },
    [dust, flagGeo]
  );
  // Day/night (Merlin, 2026-11-14): the hard sunlight scales by
  // the moon's real illuminated fraction (the shared law) —
  // full moon = the built 2.2 daylight on the Earth-facing
  // side, new moon = night, floored at 0.05 so the scene never
  // goes pitch black. Refreshed every 10 s; the sky stays black
  // either way and Earth stays hanging where it was.
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
      {/* Sunlight: hard and white, like real lunar daylight —
          scaled by the real moon phase (see the effect above). */}
      <ambientLight intensity={0.12} />
      <directionalLight position={[50, 80, 40]} intensity={sunlight} color="#fff2dd" />
      {/* Earthshine: a soft cool fill from Earth's direction so
          the night side isn't dead black. */}
      <directionalLight position={[EARTH_POS.x, EARTH_POS.y, EARTH_POS.z]} intensity={0.35} color="#a8c4e8" />
      {/* Environment (Merlin, Nov 15, 2026): the gold pole is light
          reflecting — its metal needs something to reflect. The
          night preset is the repo's convention (DeathStarScene
          uses it in a space scene); the nested Suspense means a
          slow HDR fetch never blanks the Moon — the scene renders
          first, the reflections arrive when the HDR lands. The
          preset HDR loads from drei's CDN at runtime, like the
          live DeathStar/Hermes scenes. No new real lights. */}
      <Suspense fallback={null}>
        <Environment preset="night" />
      </Suspense>
      <Stars radius={300} depth={50} count={5000} factor={4} fade speed={0.5} />

      {/* The Moon itself — the walker stands on this sphere.
          Shared lunar maps now carry a real bump map. */}
      <mesh>
        <sphereGeometry args={[MOON_RADIUS, 64, 48]} />
        <meshStandardMaterial map={moonMaps.map} bumpMap={moonMaps.bumpMap} bumpScale={moonMaps.bumpScale} roughness={moonMaps.roughness} metalness={0} />
      </mesh>

      {/* Earth hanging in the sky, hub scene scale (r55 at 180) —
          CGI now: turning surface, drifting clouds, faint rim.
          Click it and the Earth menu opens (see EarthInSky). */}
      <EarthInSky onEarthClick={onEarthClick} />
      <Billboard position={[EARTH_POS.x, EARTH_POS.y + EARTH_RADIUS + 22, EARTH_POS.z]}>
        <VanGoghText fontSize={9} color="#cfe8ff" anchorX="center" anchorY="middle" outlineWidth={0.4} outlineColor="#000000">
          ◈ EARTH
        </VanGoghText>
      </Billboard>

      {/* Dust motes drifting around the landing site. */}
      <primitive object={dust} position={[MOON_LANDING_FEET.x, MOON_LANDING_FEET.y, MOON_LANDING_FEET.z]} />

      {/* Landing zone: darker regolith disc under the gold ring,
          the Olympus flag, and pebbles. */}
      <mesh position={[MOON_LANDING_FEET.x, MOON_LANDING_FEET.y + 0.02, MOON_LANDING_FEET.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.1, 48]} />
        <meshStandardMaterial color="#5f5f5f" roughness={1} metalness={0} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      <mesh position={[MOON_LANDING_FEET.x, MOON_LANDING_FEET.y + 0.05, MOON_LANDING_FEET.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.7, 2.1, 48]} />
        <meshBasicMaterial color="#ffd700" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      <group position={[MOON_LANDING_FEET.x, MOON_LANDING_FEET.y, MOON_LANDING_FEET.z - FLAG_OFFSET_M]} rotation={[-FLAG_TILT, 0, 0]}>
        {/* The pole wears Merlin's scratched-gold photograph (Nov 15,
            2026) and is light reflecting: metalness 1.0, roughness
            0.18, lit by the scene's Environment (see above). Before
            the photo lands it keeps its old silver (metalness 0.8,
            roughness 0.4). The pole itself stays rigid. */}
        <mesh position={[0, 1.2, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 2.4, 8]} />
          <meshStandardMaterial map={poleTex ?? undefined} color={poleTex ? '#ffffff' : '#cfd2d6'} roughness={poleTex ? 0.18 : 0.4} metalness={poleTex ? 1.0 : 0.8} />
        </mesh>
        {/* The cloth is a 12×6 segmented plane so waveFlag can
            ripple the free edge while the pole edge stays pinned;
            the pole itself stays rigid. Merlin's gold-Omega
            photograph wraps BOTH sides (Nov 15, 2026): DoubleSide,
            Omega upright on both — the Ω is bilaterally symmetric
            and the scratches are random, so the mirrored back
            reads the same as the front. The cloth is 1.15 × 0.65
            (aspect 1.769); the photo is 1170×653 (1.792) — a 1.3%
            squeeze, invisible. Before the photo lands the cloth
            keeps its plain gold. The cloth stays cloth — it waves
            with the wind; it is not mirror-coated. */}
        <mesh position={[0.58, 2.1, 0]} geometry={flagGeo}>
          <meshBasicMaterial map={flagTex ?? undefined} color={flagTex ? '#ffffff' : '#ffd700'} side={THREE.DoubleSide} />
        </mesh>
        {/* OLYMPUS was fontSize 0.9 — ~2.6 m in front of the spawn
            camera, filling the whole screen over the help line.
            Now a small label just above the flag. */}
        <Billboard position={[0, 2.75, 0]}>
          <VanGoghText fontSize={MOON_OLYMPUS_LABEL_SIZE} color="#ffd700" anchorX="center" anchorY="middle" outlineWidth={0.05} outlineColor="#000000">
            OLYMPUS
          </VanGoghText>
        </Billboard>
      </group>

      {/* Scattered rocks near the landing zone — shared rock
          material now, bump-mapped instead of flat grey. */}
      {rocks.map((rock, i) => (
        <mesh key={i} position={[rock.pos.x, rock.pos.y, rock.pos.z]} rotation={[0, rock.rot, 0]} material={i % 2 ? rockMatB : rockMatA}>
          <dodecahedronGeometry args={[rock.size, 0]} />
        </mesh>
      ))}

      {/* Pebbles on and around the pad. */}
      {pebbles.map((pebble, i) => (
        <mesh key={`peb-${i}`} position={[pebble.pos.x, pebble.pos.y, pebble.pos.z]} rotation={[0, pebble.rot, 0]} material={i % 2 ? rockMatB : rockMatA}>
          <dodecahedronGeometry args={[pebble.size, 0]} />
        </mesh>
      ))}

      <MoonCgiMotion dust={dust} flagGeo={flagGeo} />
      <MoonRig moveRef={moveRef} jumpRef={jumpRef} hudRef={hudRef} />
    </>
  );
}
