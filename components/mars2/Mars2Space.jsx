// components/mars2/Mars2Space.jsx — MARS 2 SPACE (Merlin, Nov 17, 2026).
//
// The space layer around Mars 2: the atmosphere thinning as you
// climb, the full-sphere star field, the sun and the red moon as
// real 3D bodies you can fly to and enter, the planets of our
// solar system hanging in the sky, and the see-through orb that
// gets you there. The hub is the model: the hub sun is a body
// you tap or fly through into /sun-base, the hub Moon a walkable
// world — Mars 2's sun IS that Sun (same /sun-base) and its red
// moon is its own walkable world (/mars-moon).
//
// The ship (redesigned Nov 17 ~23:37 from Merlin's phone video):
// a SEE-THROUGH ORB the user sits inside — it floats up out of
// Mars, no runway, and the user looks out in all directions from
// inside it. So the flight camera sits INSIDE the orb (first
// person, looking out), not chasing behind it.
//
// The cross-fade, by altitude (lib/mars2/space.js — the air thins
// 60 → 150 m): on the ground the sky, fog and dome stars read
// exactly as before; in space the sky is black, the fog is gone,
// the dome stars hand over to the full-sphere field, the sky moon
// hands over to the moon body, and the rig's sun disc stays the
// bright core in front of the sun body. Nothing here edits the
// shared DayNightRig — the space layer owns its own fades.
//
// Entry is the hub Sun Base motion (lib/sun-base.js): tap a body
// in space, or fly into it, and the camera is pulled in for
// 1.4 s (ease-in cubic), then the destination opens. The bodies
// are only enterable from space (spaceF ≥ 0.5) — you fly there
// first; a tap on the sun from the dunes does nothing.

'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { getParticleTexture } from '@/lib/particles/sprites';
import { makeMoonTexture } from '../HubMoon';
import VanGoghText from '../VanGoghText';
import { materialForPlanet } from '@/lib/planet-cgi/textures';
import { dayNightFor, dateMsForSolarTime, getDayNightPlace, rgbStr } from '@/lib/day-night';
import { recenterLookOffset, dampLookAngle } from '@/lib/planet-walker';
import { pullEasedProgress } from '@/lib/sun-base';
import {
  spaceFactorForAltitude,
  spaceBodyPositions,
  isMarsSunTriggerPoint,
  isMarsMoonTriggerPoint,
  pullTargetFor,
  spaceStarDirections,
  solarPlanetPositions,
  isSolarPlanetTriggerPoint,
  planetPushOut,
  SOLAR_PLANET_PULL_STOP_M,
  SPACE_STAR_RADIUS_M,
  MARS_SUN_BODY_RADIUS_M,
  MARS_SUN_PULL_STOP_M,
  MARS_MOON_BODY_RADIUS_M,
  MARS_MOON_PULL_STOP_M,
} from '@/lib/mars2/space';
import {
  ORB_RADIUS_M,
  SHIP_OUTPOST_AIR_M,
  SHIP_BODY_R_M,
  updateShip,
  shipIsLanded,
  dismountShip,
  canDismountShip,
  shipSpeedKmh,
} from '@/lib/mars2/spaceship';
import { WORLD_RADIUS, EYE_HEIGHT, outpostCollide } from '@/lib/mars2/world';

// The destinations the pull opens. The sun is the hub's Sun
// Base — the same Sun, the same interior — with ?from=mars-2 so
// its way back returns to Mars 2 instead of the hub.
export const MARS_SUN_ENTRY_ROUTE = '/sun-base?from=mars-2';
export const MARS_MOON_ENTRY_ROUTE = '/mars-moon';

const SPACE_BLACK = new THREE.Color(0x000000);

// --- the atmosphere thinning + the sky going black ------------------
// Reads the camera's altitude every frame, writes the shared
// space factor (0 on the ground → 1 in space) for the stars, the
// fog and the sky moon to read, and lerps the scene background
// from the rig's daylight colour toward black. The rig still
// owns the ground colour (recomputed from the same law, same
// timeOfDay, once a second) — this only darkens it with height.
export function Mars2SpaceSky({ timeOfDay, spaceFRef }) {
  const { scene } = useThree();
  const bg = useMemo(() => new THREE.Color(), []);
  const groundTop = useRef(new THREE.Color('#3a1c0d'));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const topStr = useMemo(() => {
    try {
      const place = getDayNightPlace();
      const dateMs = Number.isFinite(timeOfDay)
        ? dateMsForSolarTime(timeOfDay, place.lat, place.lon, Date.now())
        : Date.now();
      return rgbStr(dayNightFor(dateMs, place.lat, place.lon).palette.top);
    } catch {
      return '#3a1c0d';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeOfDay, tick]);
  useEffect(() => {
    try {
      groundTop.current.set(topStr);
    } catch {}
  }, [topStr]);
  useFrame((state) => {
    const alt = state.camera.position.y;
    const spaceF = spaceFactorForAltitude(alt);
    spaceFRef.current.spaceF = spaceF;
    spaceFRef.current.altitudeM = alt;
    bg.copy(groundTop.current).lerp(SPACE_BLACK, spaceF);
    scene.background = bg;
  });
  return null;
}

// --- the space star field --------------------------------------------
// The shared sky law's 700 field stars as a full sphere around
// the camera (not a dome — space has stars below you too), at 600
// m: inside the 900 far plane, past the sun/moon bodies. It
// follows the camera (stars are effectively at infinity — no
// parallax) and fades in with the space factor, handing over from
// the surface dome stars. Brightness follows each star's
// magnitude; positions refresh once a minute with the real sky.
export function Mars2SpaceStars({ spaceFRef }) {
  const groupRef = useRef();
  const [directions, setDirections] = useState(() => {
    try {
      return spaceStarDirections(Date.now());
    } catch {
      return [];
    }
  });
  useEffect(() => {
    const id = setInterval(() => {
      try {
        setDirections(spaceStarDirections(Date.now()));
      } catch {}
    }, 60000);
    return () => clearInterval(id);
  }, []);
  const points = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(directions.length * 3);
    const col = new Float32Array(directions.length * 3);
    directions.forEach((s, i) => {
      pos[i * 3] = s.x * SPACE_STAR_RADIUS_M;
      pos[i * 3 + 1] = s.y * SPACE_STAR_RADIUS_M;
      pos[i * 3 + 2] = s.z * SPACE_STAR_RADIUS_M;
      const b = Math.max(0.5, Math.min(1, 1.15 - (s.mag - 3.6) * 0.25));
      col[i * 3] = b;
      col[i * 3 + 1] = b * 0.96;
      col[i * 3 + 2] = b * 0.9;
    });
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 1.6, map: getParticleTexture('star') || undefined,
      sizeAttenuation: false, transparent: true, opacity: 0,
      depthWrite: false, fog: false, vertexColors: true,
    });
    return new THREE.Points(geo, mat);
  }, [directions]);
  useEffect(() => () => {
    points.geometry.dispose();
    points.material.dispose();
  }, [points]);
  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    g.position.copy(state.camera.position);
    points.material.opacity = spaceFRef.current.spaceF || 0;
  });
  return (
    <group ref={groupRef}>
      <primitive object={points} />
    </group>
  );
}

// --- the sun + the red moon as bodies --------------------------------
// Real 3D spheres on the live sun/moon directions, past the sky
// visuals (sun 520 / moon 480, vs the sky's 380) — approachable
// and enterable. The sun body is the world behind the rig's disc
// (the disc stays the bright core in front of it); the moon body
// wears the moon wrap tinted red, the same tint as the sky moon
// it replaces in space. Each fades with its own visibility law
// (the sun gone at night, the moon gone by day / at new moon),
// so space never shows a body the surface sky does not have.
// Tap one in space, or fly into it, and the hub pull carries you
// in (1.4 s, ease-in cubic) — then onEnter opens the destination.
export function Mars2SpaceBodies({ timeOfDay, spaceFRef, onEnter }) {
  const { camera } = useThree();
  const [positions, setPositions] = useState(() => {
    try {
      return spaceBodyPositions(timeOfDay);
    } catch {
      return { sunPos: { x: 0, y: 520, z: 0 }, moonPos: { x: 0, y: 480, z: 0 }, sunVis: 0, moonVis: 0, sunColor: [255, 200, 120] };
    }
  });
  useEffect(() => {
    const id = setInterval(() => {
      try {
        setPositions(spaceBodyPositions(timeOfDay));
      } catch {}
    }, 1000);
    return () => clearInterval(id);
  }, [timeOfDay]);
  const moonMaps = useMemo(() => makeMoonTexture(), []);
  const glowTex = useMemo(() => getParticleTexture('glow') || undefined, []);
  // The solar system (Merlin, Nov 17, 2026 — redesigned): the
  // planets hang at fixed positions in the space layer. Their
  // materials are CLONES of the shared planet materials
  // (materialForPlanet caches one material per family+seed+tint
  // and marks it shared — mutating its opacity would fade every
  // world wearing it, so each planet here owns its clone, with a
  // dim emissive so it still reads on the night side).
  const planets = useMemo(() => solarPlanetPositions(), []);
  const planetMats = useMemo(() => planets.map((p) => {
    if (p.photo) return null; // the Moon wears the photo (own JSX material)
    const m = materialForPlanet(p.family, `${p.key}-space`, p.tint).clone();
    m.transparent = true;
    m.emissive = new THREE.Color(p.tint);
    m.emissiveIntensity = 0.35;
    return m;
  }), [planets]);
  useEffect(() => () => {
    planetMats.forEach((m) => { if (m) m.dispose(); });
  }, [planetMats]);
  const photoMatRef = useRef();
  const planetRingRef = useRef();
  const labelsGroupRef = useRef();
  const sunMatRef = useRef();
  const sunHaloRef = useRef();
  const moonMatRef = useRef();
  const moonHaloRef = useRef();
  const enteredRef = useRef(false);
  const pullRef = useRef({ active: false, from: null, target: null, center: null, startMs: 0, route: null });

  const startPull = (bodyPos, route, stopShort, fromPos) => {
    if (enteredRef.current || !onEnter) return;
    const from = fromPos ? { x: fromPos.x, y: fromPos.y, z: fromPos.z } : { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    enteredRef.current = true;
    spaceFRef.current.pullActive = true;
    pullRef.current = {
      active: true,
      from: new THREE.Vector3(from.x, from.y, from.z),
      target: new THREE.Vector3(),
      center: new THREE.Vector3(bodyPos.x, bodyPos.y, bodyPos.z),
      startMs: performance.now(),
      route,
    };
    const t = pullTargetFor(bodyPos, from, stopShort);
    pullRef.current.target.set(t.x, t.y, t.z);
  };

  useFrame((state) => {
    const spaceF = spaceFRef.current.spaceF || 0;
    if (sunMatRef.current) sunMatRef.current.opacity = 0.95 * positions.sunVis * spaceF;
    if (sunHaloRef.current) sunHaloRef.current.opacity = 0.55 * positions.sunVis * spaceF;
    if (moonMatRef.current) moonMatRef.current.opacity = 0.95 * positions.moonVis * spaceF;
    if (moonHaloRef.current) moonHaloRef.current.opacity = 0.4 * positions.moonVis * spaceF;
    // The planets fade in with the space factor, like the bodies.
    planets.forEach((p, i) => {
      const m = p.photo ? photoMatRef.current : planetMats[i];
      if (m) m.opacity = spaceF;
    });
    if (planetRingRef.current) planetRingRef.current.opacity = spaceF * 0.7;
    if (labelsGroupRef.current) labelsGroupRef.current.visible = spaceF > 0.05;
    const pull = pullRef.current;
    if (pull.active) {
      const p = pullEasedProgress(performance.now() - pull.startMs);
      state.camera.position.lerpVectors(pull.from, pull.target, p);
      state.camera.lookAt(pull.center.x, pull.center.y, pull.center.z);
      if (p >= 1) {
        pull.active = false;
        spaceFRef.current.pullActive = false;
        if (onEnter) onEnter(pull.route);
      }
      return;
    }
    if (enteredRef.current || !onEnter) return;
    const cam = state.camera.position;
    if (isMarsSunTriggerPoint(cam, positions)) {
      startPull(positions.sunPos, MARS_SUN_ENTRY_ROUTE, MARS_SUN_PULL_STOP_M, cam);
    } else if (isMarsMoonTriggerPoint(cam, positions)) {
      startPull(positions.moonPos, MARS_MOON_ENTRY_ROUTE, MARS_MOON_PULL_STOP_M, cam);
    } else {
      // A destination planet: fly into it and the pull carries
      // you to its world. A visible-only planet has no route —
      // there is nowhere to land — so flying into it does nothing
      // here (the rig keeps the orb out of its surface).
      for (const p of planets) {
        if (!p.route) continue;
        if (isSolarPlanetTriggerPoint(cam, p)) {
          startPull(p.pos, p.route, SOLAR_PLANET_PULL_STOP_M, cam);
          break;
        }
      }
    }
  });

  // Bodies are only enterable from space — a tap on the sun from
  // the dunes does nothing (you fly there first), and a body
  // with no light (night sun, day moon) is not a destination.
  const inSpace = () => (spaceFRef.current.spaceF || 0) >= 0.5;
  const sunClick = (e) => {
    if (e.delta > 10) return;
    e.stopPropagation();
    if (!inSpace() || positions.sunVis <= 0.05) return;
    startPull(positions.sunPos, MARS_SUN_ENTRY_ROUTE, MARS_SUN_PULL_STOP_M);
  };
  const moonClick = (e) => {
    if (e.delta > 10) return;
    e.stopPropagation();
    if (!inSpace() || positions.moonVis <= 0.05) return;
    startPull(positions.moonPos, MARS_MOON_ENTRY_ROUTE, MARS_MOON_PULL_STOP_M);
  };
  // A destination planet, tapped in space: the pull carries you
  // to its world. A visible-only planet has no route and no tap.
  const planetClick = (planet) => (e) => {
    if (e.delta > 10) return;
    e.stopPropagation();
    if (!inSpace() || !planet.route) return;
    startPull(planet.pos, planet.route, SOLAR_PLANET_PULL_STOP_M);
  };
  const pointerProps = (click) => ({
    onClick: click,
    onPointerOver: (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; },
    onPointerOut: () => { document.body.style.cursor = ''; },
  });

  return (
    <group>
      {/* the sun as a body: the world behind the rig's disc */}
      <mesh position={[positions.sunPos.x, positions.sunPos.y, positions.sunPos.z]} {...pointerProps(sunClick)}>
        <sphereGeometry args={[MARS_SUN_BODY_RADIUS_M, 32, 32]} />
        <meshBasicMaterial ref={sunMatRef} color={rgbStr(positions.sunColor)} fog={false} transparent opacity={0} depthWrite={false} />
      </mesh>
      <sprite position={[positions.sunPos.x, positions.sunPos.y, positions.sunPos.z]} scale={[300, 300, 1]}>
        <spriteMaterial ref={sunHaloRef} map={glowTex} color={rgbStr(positions.sunColor)} fog={false} transparent opacity={0} depthWrite={false} />
      </sprite>
      {/* the red moon as a body: the moon wrap, tinted red */}
      <mesh position={[positions.moonPos.x, positions.moonPos.y, positions.moonPos.z]} {...pointerProps(moonClick)}>
        <sphereGeometry args={[MARS_MOON_BODY_RADIUS_M, 32, 32]} />
        <meshBasicMaterial ref={moonMatRef} map={moonMaps.map} color="#ff6a4a" fog={false} transparent opacity={0} depthWrite={false} />
      </mesh>
      <sprite position={[positions.moonPos.x, positions.moonPos.y, positions.moonPos.z]} scale={[110, 110, 1]}>
        <spriteMaterial ref={moonHaloRef} map={glowTex} color="#ff4a2a" fog={false} transparent opacity={0} depthWrite={false} />
      </sprite>
      {/* the solar system: real bodies to fly to and look at */}
      {planets.map((p, i) => (
        <group key={p.key} position={[p.pos.x, p.pos.y, p.pos.z]}>
          <mesh {...(p.route ? pointerProps(planetClick(p)) : {})} material={p.photo ? undefined : planetMats[i]}>
            <sphereGeometry args={[p.radiusM, 32, 32]} />
            {p.photo ? (
              <meshBasicMaterial ref={photoMatRef} map={moonMaps.map} color="#ffffff" fog={false} transparent opacity={0} depthWrite={false} />
            ) : null}
          </mesh>
          {p.rings ? (
            <mesh rotation={[Math.PI / 2 - 0.35, 0, 0]}>
              <ringGeometry args={[p.radiusM * 1.3, p.radiusM * 2.2, 64]} />
              <meshBasicMaterial ref={planetRingRef} color="#d8c49a" fog={false} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
          ) : null}
        </group>
      ))}
      {/* planet names — visible once the planets fade in. The font
          is BUNDLED (public/fonts/DejaVuSans.ttf), never the
          troika/drei default: the default resolves its font through
          the jsdelivr CDN, and if that fetch never returns, the
          font load suspends the R3F first render forever — Canvas
          onCreated never fires and all of Mars 2 stays on
          SYNTHESIZING (found headlessly Nov 18, 2026, where
          jsdelivr is unreachable; on a phone it loads, but the
          scene must never hang on one CDN). An explicit font loads
          straight from /fonts, no resolver, no CDN. */}
      <group ref={labelsGroupRef} visible={false}>
        {planets.map((p) => (
          <Billboard key={`label-${p.key}`} position={[p.pos.x, p.pos.y + p.radiusM + Math.max(4, p.radiusM * 0.35), p.pos.z]}>
            <VanGoghText font="/fonts/DejaVuSans.ttf" fontSize={Math.max(3, p.radiusM * 0.3)} color="#ffe3cc" anchorX="center" anchorY="middle" outlineWidth={0.4} outlineColor="#000000">
              ◈ {p.name.toUpperCase()}
            </VanGoghText>
          </Billboard>
        ))}
      </group>
    </group>
  );
}

// --- the orb's model -----------------------------------------------------
// The ship is a SEE-THROUGH ORB the user sits inside (Merlin, Nov
// 17, 2026 — redesigned): a transparent bubble, 2.5 m radius, with
// a thin glowing ring around its equator and a small platform disc
// under the rider's feet. No GLB — the orb is procedural, like the
// rover. The shell is DoubleSide and depthWrite-off, so the camera
// sitting at the centre sees the planets and stars through it in
// every direction, and from outside it reads as a glass bubble.
// The orb itself never pitches or banks — a bubble stays level;
// the ring turns slowly, so the craft still feels alive.
export function ShipModel({ shipRef }) {
  const groupRef = useRef();
  const ringRef = useRef();
  useFrame((state) => {
    const g = groupRef.current;
    const ship = shipRef.current;
    if (!g) return;
    if (!ship || (!ship.active && !ship.parked)) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(ship.x, ship.y, ship.z);
    if (ringRef.current) ringRef.current.rotation.y = state.clock.elapsedTime * 0.25;
  });
  return (
    <group ref={groupRef} visible={false}>
      {/* the glass shell */}
      <mesh renderOrder={10}>
        <sphereGeometry args={[ORB_RADIUS_M, 48, 32]} />
        <meshStandardMaterial color="#bfefff" transparent opacity={0.16} roughness={0.08} metalness={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* the equator ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]} renderOrder={11}>
        <torusGeometry args={[ORB_RADIUS_M, 0.07, 12, 64]} />
        <meshBasicMaterial color="#7fe8e0" transparent opacity={0.85} depthWrite={false} />
      </mesh>
      {/* the platform under the rider's feet */}
      <mesh position={[0, -ORB_RADIUS_M + 0.35, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={11}>
        <circleGeometry args={[1.1, 32]} />
        <meshBasicMaterial color="#1a2e33" transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// --- the flight rig --------------------------------------------------------
// Fly mode: the same keys as walk/drive fly the orb (the page's
// stick + WASD). The camera sits INSIDE the orb, at its heart,
// looking out in every direction — the whole point of a
// see-through ship — so there is no chase camera: the gaze rides
// the orb's heading, a drag swings the look around (finger
// follows, the Moon rig's law), and on release it eases back
// onto the heading. While the entry pull owns the camera the rig
// stands down. OUT while airborne starts the auto-landing; the
// rig completes the dismount the moment the orb has touched down
// slow — the walker steps out beside it, facing the same way,
// and the page drops back to walk.
export function ShipRig({ inputRef, mode, groundHeight, walkerRef, yawRef, pitchRef, shipRef, onShipChange, outpost, spaceFRef, flightAxisRef }) {
  const { camera, gl } = useThree();
  const dragging = useRef(false);
  const last = useRef([0, 0]);
  const lookYaw = useRef(0);
  const lookPitch = useRef(0);
  const lookYawTarget = useRef(0);
  const lookPitchTarget = useRef(0);
  const recentering = useRef(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const lastTelemetry = useRef(0);
  const planets = useMemo(() => solarPlanetPositions(), []);

  useEffect(() => {
    const el = gl.domElement;
    const s = (e) => {
      if (modeRef.current !== 'fly') return;
      dragging.current = true;
      recentering.current = false;
      last.current = [e.clientX, e.clientY];
    };
    const m = (e) => {
      if (!dragging.current || modeRef.current !== 'fly') return;
      const dx = e.clientX - last.current[0];
      const dy = e.clientY - last.current[1];
      last.current = [e.clientX, e.clientY];
      // Finger-follows (the Moon rig's law): drag right turns the
      // gaze right, drag down looks down.
      lookYawTarget.current += dx * 0.004;
      lookPitchTarget.current = Math.max(-1.0, Math.min(1.0, lookPitchTarget.current - dy * 0.004));
    };
    const e = () => {
      dragging.current = false;
      recentering.current = true;
    };
    const ts = (e2) => {
      if (modeRef.current !== 'fly') return;
      const t = e2.touches[0];
      dragging.current = true;
      recentering.current = false;
      last.current = [t.clientX, t.clientY];
    };
    const tm = (e2) => {
      if (!dragging.current || modeRef.current !== 'fly') return;
      const t = e2.touches[0];
      const dx = t.clientX - last.current[0];
      const dy = t.clientY - last.current[1];
      last.current = [t.clientX, t.clientY];
      lookYawTarget.current += dx * 0.005;
      lookPitchTarget.current = Math.max(-1.0, Math.min(1.0, lookPitchTarget.current - dy * 0.005));
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
    };
  }, [gl]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (mode !== 'fly') return;
    if (spaceFRef.current.pullActive) return;
    const ship = shipRef.current;
    if (!ship || !ship.active) return;
    const k = inputRef.current.keys;
    updateShip(ship, k, flightAxisRef.current, dt, groundHeight, WORLD_RADIUS);
    // The outpost's domes are solid to a low-flying orb too —
    // it cannot clip through the habitat at rooftop height.
    if (outpost && ship.y < SHIP_OUTPOST_AIR_M) {
      const c = outpostCollide(ship.x, ship.z, outpost, SHIP_BODY_R_M);
      ship.x = c.x;
      ship.z = c.z;
    }
    // Visible-only planets are solid: the orb slides around
    // them instead of clipping through a planet's surface (a
    // collider, not a wall — flight itself stays unbounded).
    for (const p of planets) {
      if (p.route) continue;
      const fixed = planetPushOut(ship, p, SHIP_BODY_R_M);
      ship.x = fixed.x;
      ship.y = fixed.y;
      ship.z = fixed.z;
    }
    // The auto-landing touched down: step the walker out beside
    // the orb and hand the page back to walk.
    if (ship.landing && shipIsLanded(ship)) {
      const spot = dismountShip(ship);
      walkerRef.current.set(spot.x, groundHeight(spot.x, spot.z) + EYE_HEIGHT, spot.z);
      yawRef.current = spot.heading;
      pitchRef.current = -0.05;
      if (onShipChange) {
        onShipChange({ active: false, speedKmh: 0, altitudeM: 0, landed: true, landing: false, landBlocked: false, canLand: true });
      }
      return;
    }
    // The gaze: the heading, swung by the drag, easing back onto
    // the heading on release (the hub's auto-center law).
    if (recentering.current) {
      const eased = recenterLookOffset({ yaw: lookYawTarget.current, pitch: lookPitchTarget.current }, dt);
      lookYawTarget.current = eased.yaw;
      lookPitchTarget.current = eased.pitch;
      if (Math.abs(eased.yaw) < 0.005 && Math.abs(eased.pitch) < 0.005) {
        lookYawTarget.current = 0;
        lookPitchTarget.current = 0;
        recentering.current = false;
      }
    }
    lookYaw.current = dampLookAngle(lookYaw.current, lookYawTarget.current, dt);
    lookPitch.current = dampLookAngle(lookPitch.current, lookPitchTarget.current, dt);
    // Inside the orb: the camera sits at the orb's heart and
    // looks out — forward is (-sin h, -cos h), the rover's law.
    camera.position.set(ship.x, ship.y, ship.z);
    const lookYawTotal = ship.heading + lookYaw.current;
    const cp = Math.cos(lookPitch.current);
    camera.lookAt(
      ship.x - Math.sin(lookYawTotal) * cp,
      ship.y + Math.sin(lookPitch.current),
      ship.z - Math.cos(lookYawTotal) * cp,
    );
    // The walker rides with the orb, so a dismount starts here.
    walkerRef.current.set(ship.x, ship.y + EYE_HEIGHT, ship.z);
    yawRef.current = ship.heading;
    const now = state.clock.elapsedTime;
    if (now - lastTelemetry.current > 0.25) {
      lastTelemetry.current = now;
      if (onShipChange) {
        onShipChange({
          active: true,
          speedKmh: shipSpeedKmh(Math.abs(ship.speed)),
          altitudeM: Math.max(0, ship.y - groundHeight(ship.x, ship.z)),
          landed: false,
          landing: ship.landing,
          landBlocked: ship.landBlocked,
          canLand: canDismountShip(ship),
        });
      }
    }
  });
  return null;
}
