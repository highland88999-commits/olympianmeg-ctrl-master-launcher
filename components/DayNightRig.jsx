// components/DayNightRig.jsx
// DAY / NIGHT RIG (Merlin, 2026-11-14) — the shared cycle for
// every planet and realm, as Earth 2 has it.
//
// One component, mounted inside a scene's Canvas, replacing the
// scene's four static light lines (background / fog / ambient /
// directional). Every ~1 s it reads the real instant, runs
// Earth 2's law (lib/day-night.js) for the walker's place
// (real location when granted, Sydney when not), and repaints
// the sky: the sun rides its real direction, the moon lights
// the night by its real phase, stars come out with the night
// factor (scenes that render stars multiply by palette.night
// themselves — this rig only drives light, fog and sky).
//
// shade: 'earth' (normal daylight) or a nether shade key
// ('blood' | 'ember' | 'crimson' | 'violet' | 'ash') — the
// nether-realms' daylight is red, one shade per realm.
// fogDensity: the realm's fogExp2 density (default 0.0035).
//
// storm: null, or { hue: 'red' | 'purple', bounds, isOpenGround,
// realm, seed } — hellscape lightning. Strikes land on a seeded
// schedule (6–18 s apart, same storm for every visitor); a
// strike sometimes (35%) sets a ground fire. Fires are VISUAL
// ONLY, live 20–45 s, and prune themselves. isOpenGround(x, z)
// is REQUIRED with a storm and MUST exclude the walker (within
// 5 m), buildings and portals — the rig never guesses what is
// open ground. On a strike the rig also dispatches
// window 'olympus:thunder' { realm, hue } — a page that owns a
// sound engine may play a rumble for it; realms without an
// engine stay silent.
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  dayNightFor,
  dateMsForSolarTime,
  netherPalette,
  getDayNightPlace,
  requestDayNightPlace,
  rgbStr,
  strikeDelaySeconds,
  strikePosition,
  strikeRoll,
  rollGroundFire,
  seededRand,
  fireLifetimeMs,
  chooseGroundFireSpot,
  makeGroundFire,
  fireIntensity,
  pruneFires,
  STORM_MAX_FIRES,
} from '@/lib/day-night';
import { makeMoonTexture } from './HubMoon';

const FIRE_COLORS = {
  red: { core: '#ff7a1a', outer: '#ff2a1a', glow: '#ff5a00' },
  purple: { core: '#d8b4fe', outer: '#7c3aed', glow: '#a855f7' },
};
const BOLT_COLORS = { red: '#ff4d2e', purple: '#b06bff' };
const FLASH_COLORS = { red: '#ff3b1a', purple: '#a855f7' };

// A soft radial glow (white core fading to transparent) for the
// sun halo — drawn once on a canvas, tinted by the sprite's
// colour, so the sun carries haze instead of a hard edge.
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function boltGeometry(x, z, seed) {
  const rng = seededRand(seed);
  const pts = [];
  let px = x + (rng() - 0.5) * 14;
  let pz = z + (rng() - 0.5) * 14;
  const top = 55;
  const steps = 7;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = top * (1 - t);
    pts.push(new THREE.Vector3(px, y, pz));
    px += (rng() - 0.5) * 9;
    pz += (rng() - 0.5) * 9;
  }
  pts.push(new THREE.Vector3(x, 0, z));
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  return geo;
}

export default function DayNightRig({
  shade = 'earth',
  storm = null,
  fogDensity = 0.0035,
  lat = null,
  lon = null,
  // timeOfDay (0..1, optional): when a world drives the cycle
  // from its own time control instead of the real clock (Mars 2's
  // TIME slider + presets), the rig runs the same law for that
  // solar time — the slider moves the real sun, not just a label.
  // When it is not a finite number, the real clock drives the
  // cycle exactly as before.
  timeOfDay = null,
  // sun (default false): render the sun itself — a bright core
  // disc plus a glow/haze halo on the rig's real sun direction —
  // so it reads as a sun instead of a flat disc (or nothing).
  // Worlds that do not opt in keep exactly their current sky.
  sun = false,
  // moon (default false): render the moon itself — Merlin's photo
  // wrapped on a sphere on the rig's real moon direction, with a
  // pale halo — so the night sky carries the same moon everywhere.
  // Gone by day and at new moon, like the moonlight it already
  // drives. Worlds that do not opt in keep exactly their current
  // sky. (Mars 2 does NOT opt in: its moon is red, built by a
  // separate coordinator — never the grey photo here.)
  moon = false,
  // moonColor (default '#b8c4e8'): the tint of the moonlight the
  // rig drives. Mars 2 passes its red moon's colour so the night
  // is lit red by its own moon; every other world keeps
  // moonlight blue. The photo moon's halo keeps its own blue.
  moonColor = '#b8c4e8',
}) {
  const placeRef = useRef(null);
  const accRef = useRef(99); // due at once: the sky is right from frame one
  const flashRef = useRef(0);
  const flashLightRef = useRef(null);
  const boltGroupRef = useRef(null);
  const strikeIndexRef = useRef(0);
  const nextStrikeAtRef = useRef(0);
  const fireIdRef = useRef(0);
  const timeOfDayRef = useRef(timeOfDay);
  timeOfDayRef.current = timeOfDay;
  if (placeRef.current === null) {
    const place = getDayNightPlace();
    placeRef.current = { lat: lat ?? place.lat, lon: lon ?? place.lon };
  }
  const [nowTick, setNowTick] = useState(() => Date.now());
  // The cycle recomputes when the real clock ticks (~1 s) AND
  // the moment a timeOfDay override moves — the slider's light
  // follows the slider, not the next tick.
  const cycle = useMemo(() => {
    const p = placeRef.current;
    const t = timeOfDayRef.current;
    const dn = Number.isFinite(t)
      ? dayNightFor(dateMsForSolarTime(t, p.lat, p.lon, nowTick), p.lat, p.lon)
      : dayNightFor(nowTick, p.lat, p.lon);
    const pal = shade === 'earth' ? dn.palette : netherPalette(dn.sun.elevationDeg, shade);
    return { ...dn, pal };
  }, [nowTick, timeOfDay, shade, lat, lon]);
  const [fires, setFires] = useState([]);
  const [bolt, setBolt] = useState(null); // { geo, color, x, z } or null

  const stormSeed = useMemo(() => {
    if (!storm) return 0;
    let s = 0;
    const key = String(storm.realm || 'storm');
    for (let i = 0; i < key.length; i++) s = (Math.imul(s, 31) + key.charCodeAt(i)) | 0;
    return (s ^ (storm.seed || 0x5eED)) >>> 0;
  }, [storm]);

  useFrame((state, dt) => {
    const now = Date.now();
    // The flash decays every frame (imperative — no re-render).
    if (flashRef.current > 0.01) {
      flashRef.current = Math.max(0, flashRef.current - dt * 5);
      if (flashLightRef.current) flashLightRef.current.intensity = flashRef.current * 4;
      if (boltGroupRef.current) boltGroupRef.current.visible = flashRef.current > 0.35;
    } else if (bolt) {
      setBolt(null);
    }
    // The cycle refreshes about once a second (nowTick drives
    // the useMemo above); any failure keeps the last sky. A
    // timeOfDay override recomputes the moment it moves.
    accRef.current += dt;
    if (accRef.current < 1) return;
    accRef.current = 0;
    setNowTick(now);
    if (!placeRef.current) {
      const place = getDayNightPlace();
      placeRef.current = { lat: lat ?? place.lat, lon: lon ?? place.lon };
      requestDayNightPlace();
    }
    // Storm schedule: strikes on the seeded clock.
    if (storm) {
      if (!nextStrikeAtRef.current) {
        nextStrikeAtRef.current = now + strikeDelaySeconds(stormSeed, 0) * 1000;
      }
      if (now >= nextStrikeAtRef.current) {
        const idx = strikeIndexRef.current;
        const bounds = storm.bounds || { xMin: -150, xMax: 150, zMin: -150, zMax: 150 };
        const pos = strikePosition(stormSeed, idx, bounds);
        flashRef.current = 1;
        if (flashLightRef.current) {
          flashLightRef.current.position.set(pos.x, 45, pos.z);
          flashLightRef.current.intensity = 4;
        }
        setBolt({ geo: boltGeometry(pos.x, pos.z, stormSeed + idx * 7919), color: BOLT_COLORS[storm.hue] || BOLT_COLORS.red });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('olympus:thunder', {
            detail: { realm: storm.realm || null, hue: storm.hue || 'red' },
          }));
        }
        // A strike sometimes sets a ground fire — open ground only.
        if (rollGroundFire(strikeRoll(stormSeed, idx)) && typeof storm.isOpenGround === 'function') {
          const rng = seededRand(stormSeed + idx * 104729);
          const spot = chooseGroundFireSpot(() => rng(), bounds, storm.isOpenGround);
          if (spot) {
            const id = fireIdRef.current + 1;
            fireIdRef.current = id;
            const fire = makeGroundFire(
              id, spot.x, spot.z, storm.hue || 'red', now,
              fireLifetimeMs(stormSeed, id),
            );
            setFires((prev) => [...pruneFires(prev, now), fire].slice(-STORM_MAX_FIRES));
          }
        }
        strikeIndexRef.current = idx + 1;
        nextStrikeAtRef.current = now + strikeDelaySeconds(stormSeed, idx + 1) * 1000;
      }
      setFires((prev) => {
        const alive = pruneFires(prev, now);
        return alive.length === prev.length ? prev : alive;
      });
    }
  });

  const { pal, sunVec, moonVec, moon: moonData } = cycle;
  const moonI = pal.night * Math.max(0, Math.min(1, moonData.illum))
    * Math.max(0, Math.min(1, moonData.altDeg / 20)) * 0.85;
  const fireColors = FIRE_COLORS[storm?.hue] || FIRE_COLORS.red;
  // The sun's visibility 0..1 from its own intensity — full by
  // late morning, gone at night (the terrain hides it below the
  // horizon anyway; this keeps the disc + halo from glowing
  // through the dark).
  const sunVis = Math.max(0, Math.min(1, pal.sunIntensity / 0.9));
  const glowTex = useMemo(() => ((sun || moon) ? makeGlowTexture() : null), [sun, moon]);
  useEffect(() => () => { if (glowTex) glowTex.dispose(); }, [glowTex]);
  // The moon's maps (Merlin's photo, shared with the hub moon and
  // the /moon ground — one texture object, procedural fallback, so
  // a failed photo load never leaves a blank moon).
  const moonMaps = useMemo(() => (moon ? makeMoonTexture() : null), [moon]);
  // The moon's visibility 0..1 — same law as the moonlight it
  // already drives: full by night at full moon, gone by day and
  // at new moon (the terrain hides it below the horizon anyway).
  const moonVis = pal.night * Math.max(0, Math.min(1, moonData.illum))
    * Math.max(0, Math.min(1, moonData.altDeg / 20));

  return (
    <group>
      <color attach="background" args={[rgbStr(pal.top)]} />
      <fogExp2 attach="fog" args={[rgbStr(pal.fog), fogDensity]} />
      <ambientLight color={rgbStr(pal.sunColor)} intensity={0.15 + pal.hemiIntensity * 0.6} />
      <directionalLight
        position={[sunVec.x * 120, sunVec.y * 120, sunVec.z * 120]}
        color={rgbStr(pal.sunColor)}
        intensity={pal.sunIntensity}
      />
      {pal.night > 0.05 && (
        <directionalLight
          position={[moonVec.x * 120, moonVec.y * 120, moonVec.z * 120]}
          color={moonColor}
          intensity={moonI}
        />
      )}
      {sun && glowTex && (
        <>
          {/* the sun itself: a bright core disc on the rig's real
              sun direction, with a glow/haze halo — fog:false, so
              the fog never swallows it; the terrain still hides
              it below the horizon. */}
          <mesh position={[sunVec.x * 380, sunVec.y * 380, sunVec.z * 380]}>
            <sphereGeometry args={[6, 20, 20]} />
            <meshBasicMaterial color={rgbStr(pal.sunColor)} fog={false} transparent opacity={0.95 * sunVis} depthWrite={false} />
          </mesh>
          <sprite position={[sunVec.x * 380, sunVec.y * 380, sunVec.z * 380]} scale={[64, 64, 1]}>
            <spriteMaterial map={glowTex} color={rgbStr(pal.sunColor)} fog={false} transparent opacity={0.55 * sunVis} depthWrite={false} />
          </sprite>
        </>
      )}
      {moon && moonMaps && glowTex && moonVis > 0.01 && (
        <>
          {/* the moon itself: Merlin's photo wrapped on a sphere on
              the rig's real moon direction, with a pale halo — the
              same moon in every world that opts in. Unlit (the
              photo's own shading does the work); the halo is the
              rig's glow texture in moonlight blue. */}
          <mesh position={[moonVec.x * 380, moonVec.y * 380, moonVec.z * 380]}>
            <sphereGeometry args={[6, 32, 32]} />
            <meshBasicMaterial map={moonMaps.map} fog={false} transparent opacity={moonVis} depthWrite={false} />
          </mesh>
          <sprite position={[moonVec.x * 380, moonVec.y * 380, moonVec.z * 380]} scale={[48, 48, 1]}>
            <spriteMaterial map={glowTex} color="#b8c4e8" fog={false} transparent opacity={0.3 * moonVis} depthWrite={false} />
          </sprite>
        </>
      )}
      {storm && (
        <directionalLight
          ref={flashLightRef}
          position={[0, 45, 0]}
          color={FLASH_COLORS[storm.hue] || FLASH_COLORS.red}
          intensity={0}
        />
      )}
      {storm && bolt && (
        <group ref={boltGroupRef}>
          <lineSegments geometry={bolt.geo}>
            <lineBasicMaterial color={bolt.color} transparent opacity={0.95} />
          </lineSegments>
        </group>
      )}
      {storm && fires.map((f) => {
        const inten = fireIntensity(f, nowTick);
        if (inten <= 0) return null;
        const flick = 0.8 + 0.2 * Math.sin(nowTick / 90 + f.id * 2.1);
        return (
          <group key={f.id} position={[f.x, 0, f.z]}>
            <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[1.6, 20]} />
              <meshBasicMaterial color="#0a0505" transparent opacity={0.55 * inten} />
            </mesh>
            <mesh position={[0, 0.9, 0]}>
              <coneGeometry args={[0.85, 1.8, 8]} />
              <meshBasicMaterial color={fireColors.outer} transparent opacity={0.85 * inten * flick} />
            </mesh>
            <mesh position={[0, 0.6, 0]}>
              <coneGeometry args={[0.45, 1.1, 8]} />
              <meshBasicMaterial color={fireColors.core} transparent opacity={0.95 * inten * flick} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
