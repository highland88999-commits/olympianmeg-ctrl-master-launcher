// components/GodOrbitRings.jsx
// The hub's physical satellite constellation: EXACTLY 10 satellites — one per
// god menu — evenly spaced (36° apart) on 10 orbit rings around ORBIT_CENTER.
//
// - The whole assembly rotates AS ONE UNIT about the polar (Y) axis,
//   OPPOSITE Earth's spin (Earth: +0.05 rad/s; rings: rotation.y goes
//   negative at RING_SPIN). The analytic orbitPositionFor() in
//   lib/god-orbits.js mirrors this exactly.
// - Each satellite hull wears its own INVENTED wrap (Merlin, Nov 18,
//   2026 — "Invent planet wraps for them"): a procedural surface
//   generated per god in its god colour (lib/hub-planet-wraps.js),
//   one of 12 pattern families, seeded by the god's name — proper
//   surface texture with bump relief, never plain glowing orbs and
//   never a flat colour. The old banner-art hulls are gone: the 14
//   nether-realm planets had no banner (texture: null), so they fell
//   back to flat colour and read as flat discs from hub distance.
//   Lighting is kept modest so the wraps read.
// - Each satellite's rings match its planet (Merlin, Nov 18 ~20:58):
//   the orbit ring and the equatorial accent ring wear the god colour
//   the wrap itself is generated from, so ring + planet read as one thing.
// - Satellites are solid: each registers a sphere collider in the hub
//   collision registry (bounce/deflect, never kill).
// - VISUAL/PHYSICAL ONLY. Program navigation lives in the floating
//   satellite menu; the rings no longer launch anything.
// - PERFECT-CIRCLE BILLBOARD + EXPONENTIAL PLANET RINGS (Merlin,
//   Nov 27, 2026 — Part 13): the assembly tilts to face the camera
//   once scrolled out (blend 250–700 units from the hub centre), so
//   the rings read as perfect circles at any camera angle instead of
//   the squashed ellipse a flat horizontal ring projects (2.34x wider
//   than tall at 25° elevation). At the hub the layout is exactly as
//   before. The exponential planet rings (lib/hub-orbit-rings.js:
//   hub + 3 rings, radii 2x outward) ride the same assembly.

'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import {
  GOD_BANDS,
  ORBIT_CENTER,
  EARTH_CENTER,
  EARTH_RADIUS,
  RING_SPIN,
  orbitTime,
  menuSatellitePosition,
} from '@/lib/god-orbits';
import {
  HUB_ORBIT_RING_RADII,
  orbitRingBillboardBlend,
  loadHubOrbitItems,
  drawnHubOrbitRingRadii,
  HUB_ORBIT_ITEMS_CHANGED_EVENT,
} from '@/lib/hub-orbit-rings';
import { godPlanetWrap } from '@/lib/hub-planet-wraps';
import { registerCollider, unregisterCollider } from '@/lib/hub-collision';

// 2026-10-20 (Merlin): satellites baked 1.5× bigger (was 2.6) so the
// banner ads on their hulls read at hub distances; every satellite-
// derived dimension (accent ring, labels) scales in ratio.
// Later the same day Merlin asked for bigger still: 3.9 → 5.9, with
// the bands spread and the tower ring pushed out to match (below).
// Expansion pass, same day: satellites doubled once more, 5.9 → 11.8,
// and everything else moved out to accommodate (lanes 84–164, tower
// ring 190, planets + rings further still) so no PLANET ever passes
// in front of a satellite. The hub's PLANETS (Mars, the Sun) are a
// separate system on the far side of the satellites — their grand
// rings (SYSTEM_RING_RADII in lib/god-orbits.js) live with them in
// components/HomeScene.jsx, not in this constellation.
const SAT_RADIUS = 11.8;

// God-name label distance behaviour (demo fix, 2026-10-15): at spawn the
// camera sits ~84–164 units from every satellite (lanes after the
// 2026-10-20 expansion pass), where the label's fixed world size reads
// exactly as designed. Flying close used to blow the name across the
// whole viewport ("DIONYSU…"), and a far-side label clipped through
// Earth unreadably. So inside LABEL_REF_DIST the label shrinks with
// distance — its on-screen size never exceeds the normal-orbit size —
// and fades out as you arrive; a label whose sightline passes through
// Earth fades to a whisper instead of clipping through the planet. At
// normal orbit distance nothing changes: full size, full opacity.
// The three distances doubled with the satellites (11.8 hull) so the
// close-approach behaviour is identical in relative terms.
const LABEL_REF_DIST = 60; // at/above this distance: full size
const LABEL_FADE_NEAR = 10; // at/below this distance: fully faded
const LABEL_FADE_FULL = 32; // at/above this distance: fully opaque
const LABEL_MIN_SCALE = 0.1;
const EARTH_C = new THREE.Vector3(EARTH_CENTER.x, EARTH_CENTER.y, EARTH_CENTER.z);
const _wp = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ec = new THREE.Vector3();
// PERFECT-CIRCLE BILLBOARD (Merlin, Nov 27, 2026 — Part 13): the ring
// assembly tilts to face the camera once scrolled out, so the orbit
// rings read as perfect circles instead of the squashed ellipse a flat
// horizontal ring projects at an angle (at 25° elevation the mean lane
// reads 2.34x wider than tall). Scratch state for the per-frame
// orientation — see GodOrbitRings' useFrame. The analytic model in
// lib/god-orbits.js is untouched: it stays the horizontal home model
// (drop targets, flight lanes, tests all read it).
const _center = new THREE.Vector3(ORBIT_CENTER.x, ORBIT_CENTER.y, ORBIT_CENTER.z);
const _viewDir = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);
const _qHome = new THREE.Quaternion();
const _qAlign = new THREE.Quaternion();
const _qSpin = new THREE.Quaternion();
const _satPos = new THREE.Vector3();

function HubSatellite({ band, index, blendRef }) {
  // Invented wrap for this god (Merlin, Nov 18, 2026): generated in
  // its god colour, cached per god, deterministic — no network fetch,
  // no flat-colour fallback possible.
  const wrap = useMemo(
    () => godPlanetWrap(band.god, band.color, index),
    [band.god, band.color, index]
  );
  const angle = band.phase;
  const R = band.radius;
  const satRef = useRef();
  const tiltRef = useRef();
  const labelRef = useRef();
  const textRef = useRef();
  const labelState = useRef({ scale: -1, opacity: -1 });

  // Distance-driven label scale cap + fade (see constants above).
  useFrame(({ camera }) => {
    // Billboard tilt fade (Part 13): at the hub the band keeps its
    // analytic tilt; scrolled out the tilt eases to 0 so the ring and
    // its satellite sit exactly on the camera-facing circle.
    const tilt = tiltRef.current;
    if (tilt) {
      const blend = blendRef ? blendRef.current : 0;
      tilt.rotation.z = band.tiltRad * (1 - blend);
    }
    const sat = satRef.current;
    const label = labelRef.current;
    if (!sat || !label) return;
    sat.getWorldPosition(_wp);
    const dist = camera.position.distanceTo(_wp);

    const scale = THREE.MathUtils.clamp(dist / LABEL_REF_DIST, LABEL_MIN_SCALE, 1);
    let opacity = THREE.MathUtils.smoothstep(dist, LABEL_FADE_NEAR, LABEL_FADE_FULL);

    // Far-side fade: does the camera→label sightline pass through Earth?
    _dir.copy(_wp).sub(camera.position);
    const len = _dir.length();
    if (len > 0.001) {
      _dir.divideScalar(len);
      _ec.copy(EARTH_C).sub(camera.position);
      const t = _ec.dot(_dir);
      if (t > 0) {
        const closestSq = _ec.lengthSq() - t * t;
        const earthDist = camera.position.distanceTo(EARTH_C);
        if (closestSq < (EARTH_RADIUS + 2) * (EARTH_RADIUS + 2) && dist > earthDist) {
          opacity *= 0.08;
        }
      }
    }

    const st = labelState.current;
    if (Math.abs(scale - st.scale) > 0.004) {
      st.scale = scale;
      label.scale.setScalar(scale);
    }
    const text = textRef.current;
    if (text && Math.abs(opacity - st.opacity) > 0.02) {
      st.opacity = opacity;
      text.fillOpacity = opacity;
      text.outlineOpacity = opacity;
    }
    const vis = opacity > 0.02;
    if (label.visible !== vis) label.visible = vis;
  });

  // Solid satellite: register a live sphere collider at the RENDERED
  // position (matches the billboarded transform exactly). The analytic
  // home position is the fallback for the first frame / unmounted ref.
  // The analytic model itself is untouched (lib/god-orbits.js).
  useEffect(() => {
    registerCollider(
      `hubsat-${band.god}`,
      () => {
        const sat = satRef.current;
        if (sat) {
          sat.getWorldPosition(_satPos);
          return { x: _satPos.x, y: _satPos.y, z: _satPos.z };
        }
        return menuSatellitePosition(index, orbitTime());
      },
      SAT_RADIUS + 1.8
    );
    return () => unregisterCollider(`hubsat-${band.god}`);
  }, [band.god, index]);

  const hullMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: wrap.map,
        bumpMap: wrap.bumpMap,
        bumpScale: wrap.bumpScale,
        color: '#ffffff',
        roughness: wrap.roughness,
        metalness: 0.05,
        // Gentle god-color sheen — never enough to wash out the wrap.
        emissive: new THREE.Color(band.color),
        emissiveIntensity: 0.12,
      }),
    [wrap, band.color]
  );
  useEffect(() => () => hullMat.dispose(), [hullMat]);

  return (
    <group ref={tiltRef} rotation={[0, 0, band.tiltRad]}>
      {/* Orbit ring — the satellite's own lane around the landing spot. */}
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[R, 0.28, 8, 160]} />
        <meshBasicMaterial color={band.color} transparent opacity={0.45} />
      </mesh>
      {/* The satellite, fixed at its even-spacing angle */}
      <group ref={satRef} position={[R * Math.cos(angle), 0, R * Math.sin(angle)]}>
        <mesh>
          <sphereGeometry args={[SAT_RADIUS, 32, 24]} />
          <primitive object={hullMat} attach="material" />
        </mesh>
        {/* Equatorial accent ring in the god's color */}
        <mesh rotation-x={Math.PI / 2}>
          <torusGeometry args={[SAT_RADIUS + 2.48, 0.42, 8, 64]} />
          <meshBasicMaterial color={band.color} fog={false} />
        </mesh>
        {/* God-name marker — scale-capped and faded by camera distance
            (see the useFrame above), so it can never fill the viewport
            at close range or clip through Earth unreadably. */}
        <Billboard ref={labelRef} position={[0, SAT_RADIUS + 7.6, 0]}>
          <Text
            ref={textRef}
            fontSize={7.6}
            color={band.color}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.24}
            outlineColor="#000000"
          >
            {band.label}
          </Text>
        </Billboard>
        {/* No number under the satellite (Merlin, 2026-10-20): the
            ad numbering moved onto the billboard inventory itself —
            every god-tower panel now wears its own badge from the
            single 1–44 run (components/GodTower.jsx). */}
      </group>
    </group>
  );
}

// A creation sent to the hub (Part 14). It rides the billboarded
// assembly on its ring, so it stays on the ring at every camera
// angle — and its label is a Billboard, so the name stays upright
// and readable even while the assembly tilts (Part 13 second
// refinement: horizontal axis + readable labels). The thin green
// accent ring is the Treasure Planet glowing-ring look, at item
// scale. Position is local to the assembly (centred on ORBIT_CENTER),
// so the stored hub centre is offset back; y is 0 — the item sits
// on the flat horizontal ring plane.
function HubOrbitItem({ item }) {
  if (!item || !item.center) return null;
  const size = item.kind === 'world' || item.kind === 'planet' ? 14 : 8;
  return (
    <group
      position={[
        item.center.x - ORBIT_CENTER.x,
        item.center.y - ORBIT_CENTER.y,
        item.center.z - ORBIT_CENTER.z,
      ]}
    >
      <mesh>
        <sphereGeometry args={[size, 24, 18]} />
        <meshStandardMaterial color="#9fd8ff" emissive="#1d5f8a" emissiveIntensity={0.35} roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[size + 2.5, 0.5, 8, 64]} />
        <meshBasicMaterial color="#39ff88" transparent opacity={0.85} fog={false} />
      </mesh>
      <Billboard position={[0, size + 8, 0]}>
        <Text
          fontSize={6}
          color="#d9d9d9"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.2}
          outlineColor="#000000"
        >
          {item.name || item.kind}
        </Text>
      </Billboard>
    </group>
  );
}

export default function GodOrbitRings() {
  const spinRef = useRef();
  // Billboard blend shared with the satellites (drives their tilt fade).
  const blendRef = useRef(0);

  // HUB ORBIT ITEMS (Merlin, Nov 27, 2026 — Part 14): creations sent
  // to the hub with Add to Hub live in localStorage; this assembly
  // reads them so they render on their rings. Refreshes live via the
  // hub-orbit-items-changed event (same tab) and the storage event
  // (another tab) — no hub reload needed after adding.
  const [hubItems, setHubItems] = useState([]);
  useEffect(() => {
    const refresh = () => setHubItems(loadHubOrbitItems());
    refresh();
    window.addEventListener(HUB_ORBIT_ITEMS_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(HUB_ORBIT_ITEMS_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  // Rings are drawn as they are made (Part 13 second refinement):
  // the three Part 13 rings always, plus any further ring an item
  // has actually landed on by fill-up.
  const drawnRingRadii = useMemo(() => drawnHubOrbitRingRadii(hubItems), [hubItems]);

  useFrame(({ camera }) => {
    // One unit, counter-rotating against Earth's +Y spin. Driven from the
    // shared orbitTime() clock so orbitPositionFor() always agrees.
    // PERFECT CIRCLE (Part 13): the assembly's plane faces the camera
    // once scrolled out. At the hub (blend 0) the orientation is
    // exactly rotation.y = -RING_SPIN * orbitTime() — today's horizontal
    // layout, pixel-identical. Scrolled out (blend 1) the plane's
    // normal is the view direction, so every ring — god lanes and the
    // exponential planet rings below — projects as a perfect circle,
    // with the counter-rotation carried as an in-plane spin.
    const group = spinRef.current;
    if (!group) return;
    const camDist = camera.position.distanceTo(_center);
    const blend = orbitRingBillboardBlend(camDist);
    blendRef.current = blend;
    const spinAngle = -RING_SPIN * orbitTime();
    _qHome.setFromAxisAngle(_Y, spinAngle);
    if (blend <= 0) {
      group.quaternion.copy(_qHome);
      return;
    }
    _viewDir.copy(camera.position).sub(_center);
    if (_viewDir.lengthSq() < 1e-6) _viewDir.copy(_Y);
    else _viewDir.normalize();
    _qAlign.setFromUnitVectors(_Y, _viewDir);
    _qSpin.setFromAxisAngle(_Y, spinAngle);
    _qAlign.multiply(_qSpin);
    if (blend >= 1) group.quaternion.copy(_qAlign);
    else group.quaternion.copy(_qHome).slerp(_qAlign, blend);
  });

  return (
    <group
      ref={spinRef}
      position={[ORBIT_CENTER.x, ORBIT_CENTER.y, ORBIT_CENTER.z]}
    >
      {/* Exponential planet rings (Merlin, Nov 27, 2026 — Part 13):
          concentric perfect circles centred on the hub, radii growing
          2x outward from the hub's edge (lib/hub-orbit-rings.js). They
          ride the billboarded assembly, so they read as circles at
          every camera angle. First circle is the hub itself; each ring
          holds user-created planets and house-made planets alike.
          GLOW LOOK (Part 13 second refinement — Treasure Planet
          reference: bright glowing green ring): each ring wears a
          green glow torus beside its gold core. Rings beyond the
          three drawn here appear only once fill-up creates them. */}
      {drawnRingRadii.map((R) => (
        <group key={R}>
          <mesh rotation-x={Math.PI / 2}>
            <torusGeometry args={[R, 0.35, 8, 256]} />
            <meshBasicMaterial color="#ffd166" transparent opacity={0.45} fog={false} />
          </mesh>
          <mesh rotation-x={Math.PI / 2}>
            <torusGeometry args={[R, 1.1, 8, 256]} />
            <meshBasicMaterial color="#39ff88" transparent opacity={0.18} fog={false} />
          </mesh>
        </group>
      ))}
      {hubItems.map((item) => (
        <HubOrbitItem key={item.id} item={item} />
      ))}
      {GOD_BANDS.map((band, i) => (
        <HubSatellite key={band.god} band={band} index={i} blendRef={blendRef} />
      ))}
    </group>
  );
}
