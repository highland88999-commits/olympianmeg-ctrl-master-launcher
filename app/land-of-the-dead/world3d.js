// app/land-of-the-dead/world3d.js — THE LAND OF THE DEAD, the 3D scene.
//
// A sphere world (the Nov 16 unify law: fully explorable, no
// barriers, no boundaries): you walk the outside of a small dead
// world, r = 55 m, under Earth's real gravity, on the shared sphere
// walker (lib/planet-walker.js stepSphereWalker + sphereTangentBasis
// — the Moon / Earth-walk rig, copied, not reinvented). Ashen ground,
// a pale moon, dead trees, tilted gravestones, cold wisps, and the
// wandering souls (lib/land-of-the-dead/souls.js — worker D owns that
// module). NOTE: D's WanderingSoulField is a DOM/SVG panel, not an
// R3F component — it cannot mount inside this WebGL Canvas (R3F
// rejects DOM tags), so the page renders it under the stage instead;
// this scene does not import it. The souls are still seeded by
// seedSouls() in the page and walk the world as the field's panel.
//
// Drag-look is the shared law: the drag sets a TARGET, the frame loop
// eases the camera toward it (dampLookAngle, 20/s); on release after
// a real drag, the look eases back to where the drag STARTED at the
// shared slow rate (recenterLookOffset, 0.8/s). A tap never starts it.
// Finger-follows: drag right → look right (sphereTangentBasis: yaw+
// is look-right here, so drag right ADDS the turn — the Moon /
// Earth-walk sign, not the flat three.js rigs' sign).
//
// Procedural CGI only — no GLB, no video. The one piece of art is the
// page header banner (public/images/land-of-the-dead/land-of-the-dead-banner.webp).

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  stepSphereWalker,
  sphereTangentBasis,
  lookTurnForDrag,
  dampLookAngle,
  recenterLookOffset,
  lookOffsetFromHeading,
  LOOK_PITCH_MAX,
} from '@/lib/planet-walker';
import {
  LOTD_PLANET,
  lotdLandingState,
  lotdSpawnFeet,
  lotdWalkerHeight,
  radiusFor,
  LOTD_MOON_DIR,
  LOTD_MOON_DISTANCE,
  LOTD_MOON_RADIUS,
  PALE_GATE_DIR,
  makeWorld,
  regionAt,
  WISP_COLORS,
  mulberry32,
} from '@/lib/land-of-the-dead/world';
import { LandOfTheDeadReturn } from '@/components/world/FloorDrop';
import RealmSkyDome from '@/components/RealmSkyDome';
import { FLOOR_EMISSIVE_INTENSITY } from '@/lib/portal/realm-surfaces';
import { floorVideoUrlForRealm, useNetherVideoTexture } from '@/lib/nether-realm/video-wraps';

// --- palette ----------------------------------------------------------------
const GROUND_COLOR = '#23282a'; // ashen dead ground
const TREE_COLOR = '#141412'; // dead black trunks
const STONE_COLOR = '#5d6663'; // weathered grey-green stone
const GATE_COLOR = '#cfd8cc'; // pale bone pillars
const FOG_COLOR = '#0d1210';
const SKY_COLOR = '#0b0f0e';

// --- surface placement ------------------------------------------------------
// A surface point's up is its direction from the centre. Groups stand
// on the sphere by rotating local +Y onto that up.

function useSurfaceQuaternion(pos) {
  return useMemo(() => {
    const up = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  }, [pos.x, pos.y, pos.z]);
}

function DeadTree({ tree }) {
  const q = useSurfaceQuaternion(tree.pos);
  const branches = useMemo(() => {
    const out = [];
    for (let i = 0; i < tree.branches; i += 1) {
      const a = (i / Math.max(tree.branches, 1)) * Math.PI * 2 + tree.rot;
      out.push({ angle: a, tilt: 0.7 + ((tree.id + i) % 3) * 0.25, len: tree.h * (0.42 + ((tree.id + i) % 3) * 0.06) });
    }
    return out;
  }, [tree.branches, tree.rot, tree.id, tree.h]);
  return (
    // Outer group stands the tree on the sphere (surface up);
    // inner group carries its own yaw + lean, so the two rotations
    // never fight over one quaternion.
    <group position={[tree.pos.x, tree.pos.y, tree.pos.z]} quaternion={q}>
      <group rotation={[0, tree.rot, tree.lean]}>
        {/* Trunk, sunk a little so it reads as rooted, not floating. */}
        <mesh position={[0, tree.h / 2 - 0.3, 0]}>
          <cylinderGeometry args={[0.09 * tree.size, 0.24 * tree.size, tree.h, 6]} />
          <meshStandardMaterial color={TREE_COLOR} roughness={1} />
        </mesh>
        {branches.map((b, i) => (
          <mesh key={i} position={[Math.cos(b.angle) * 0.3, tree.h * 0.72, Math.sin(b.angle) * 0.3]}
            rotation={[Math.sin(b.angle) * b.tilt, 0, Math.cos(b.angle) * b.tilt]}>
            <cylinderGeometry args={[0.02, 0.06, b.len, 5]} />
            <meshStandardMaterial color={TREE_COLOR} roughness={1} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Gravestone({ stone }) {
  const q = useSurfaceQuaternion(stone.pos);
  return (
    <group position={[stone.pos.x, stone.pos.y, stone.pos.z]} quaternion={q}>
      <group rotation={[stone.tilt, stone.rot, stone.tilt * 0.5]}>
        <mesh position={[0, stone.h / 2 - 0.12, 0]}>
          <boxGeometry args={[0.62 * stone.size, stone.h, 0.16 * stone.size]} />
          <meshStandardMaterial color={STONE_COLOR} roughness={0.95} />
        </mesh>
      </group>
    </group>
  );
}

function Wisp({ wisp, index, register }) {
  const q = useSurfaceQuaternion(wisp.pos);
  return (
    <group position={[wisp.pos.x, wisp.pos.y, wisp.pos.z]} quaternion={q}>
      {/* meshBasicMaterial is unlit — the wisp glows on its own in
          the fog, so no per-wisp point light: 24 real lights would
          sink a phone (Duat's whole budget is 12). */}
      <mesh ref={(el) => register(index, el)} position={[0, wisp.lift, 0]}>
        <sphereGeometry args={[0.16 * wisp.size + 0.08, 10, 10]} />
        <meshBasicMaterial color={WISP_COLORS[wisp.hue].light} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

function Wisps({ wisps }) {
  const refs = useRef([]);
  const clock = useRef(0);
  const register = (i, el) => { refs.current[i] = el; };
  useFrame((state, dt) => {
    clock.current += Math.min(dt, 0.05);
    const t = clock.current;
    for (let i = 0; i < wisps.length; i += 1) {
      const m = refs.current[i];
      if (!m) continue;
      // Bob gently above the ground, never leaving it.
      m.position.y = wisps[i].lift + Math.sin(t * 0.5 + wisps[i].phase) * 0.3;
    }
  });
  return (
    <group>
      {wisps.map((w, i) => <Wisp key={w.id} wisp={w} index={i} register={register} />)}
    </group>
  );
}

// The Pale Gate is this realm's doorway gate (Gates): two pale
// pillars, 7 m tall, 4 m apart, with a lintel across the top — a
// STATIC vertical stone doorway on the far side of the sphere, where
// the dead pass onward. No bar, no label, no turning part: it cannot
// take the transit treatment, and the gates suite pins it as a
// documented exception under the standard reason.
function Gates({ radius }) {
  const pos = {
    x: PALE_GATE_DIR.x * radius,
    y: PALE_GATE_DIR.y * radius,
    z: PALE_GATE_DIR.z * radius,
  };
  const q = useSurfaceQuaternion(pos);
  return (
    <group position={[pos.x, pos.y, pos.z]} quaternion={q}>
      {/* Two pale pillars, 7 m tall, 4 m apart, with a lintel across the top. */}
      <mesh position={[-2, 3.5, 0]}>
        <boxGeometry args={[0.9, 7, 0.9]} />
        <meshStandardMaterial color={GATE_COLOR} roughness={0.9} />
      </mesh>
      <mesh position={[2, 3.5, 0]}>
        <boxGeometry args={[0.9, 7, 0.9]} />
        <meshStandardMaterial color={GATE_COLOR} roughness={0.9} />
      </mesh>
      <mesh position={[0, 7.2, 0]}>
        <boxGeometry args={[5.6, 0.8, 1]} />
        <meshStandardMaterial color={GATE_COLOR} roughness={0.9} />
      </mesh>
    </group>
  );
}

// VIDEO WRAP (Merlin, Nov 16 ~04:19): the cracked ashen-earth floor
// video when it is live; the painted ashen ground until then. Same
// texture call as the nether Ground() (Hell's pattern: map +
// emissiveMap at FLOOR_EMISSIVE_INTENSITY, white colour while the
// video is live so it is not multiplied dark), adapted from a flat
// disc to this sphere world: the video wraps the sphere on its
// equirect UVs, so near the poles — including spawn, 3 m south of
// the +Y pole — the image pinches; mid-latitudes read clean. No new
// lights; a missing or blocked video can never blank the ground.
function Ground({ radius }) {
  const videoTex = useNetherVideoTexture(floorVideoUrlForRealm('land-of-the-dead'));
  const mat = videoTex
    ? { map: videoTex, emissiveMap: videoTex, emissive: '#ffffff', emissiveIntensity: FLOOR_EMISSIVE_INTENSITY }
    : {};
  return (
    <mesh>
      <sphereGeometry args={[radius, 48, 32]} />
      <meshStandardMaterial {...mat} color={videoTex ? '#ffffff' : GROUND_COLOR} roughness={1} />
    </mesh>
  );
}

// DRIFT SHADES (the afterlife drift figures): one translucent cone
// per region, in this realm's FIGURE_MATERIALS colours, standing on
// the sphere at the region's direction — Bone Orchard (0.866, 0,
// 0.5), Grey Mere (-0.866, 0, 0.5), Pale Gate (0, -1, 0). The colour
// strings are LITERAL in the JSX: the humanoid-operators suite
// matches them by regex, so color={...} would not count.
function DriftShades({ radius }) {
  const shades = useMemo(() => {
    const dirs = [
      { x: 0.866, y: 0, z: 0.5 },
      { x: -0.866, y: 0, z: 0.5 },
      { x: 0, y: -1, z: 0 },
    ];
    return dirs.map((d) => {
      const pos = { x: d.x * radius, y: d.y * radius, z: d.z * radius };
      const up = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      return { pos, q };
    });
  }, [radius]);
  return (
    <group>
      {/* Bone Orchard shade — pale. */}
      <group position={[shades[0].pos.x, shades[0].pos.y, shades[0].pos.z]} quaternion={shades[0].q}>
        <mesh position={[0, 1.1, 0]}>
          <coneGeometry args={[0.7, 2.4, 8]} />
          <meshStandardMaterial color="#e8e8ee" opacity={0.45} transparent />
        </mesh>
      </group>
      {/* Grey Mere shade — pale green. */}
      <group position={[shades[1].pos.x, shades[1].pos.y, shades[1].pos.z]} quaternion={shades[1].q}>
        <mesh position={[0, 1.1, 0]}>
          <coneGeometry args={[0.7, 2.4, 8]} />
          <meshStandardMaterial color="#bfe8d8" opacity={0.5} transparent />
        </mesh>
      </group>
      {/* Pale Gate shade — dark. */}
      <group position={[shades[2].pos.x, shades[2].pos.y, shades[2].pos.z]} quaternion={shades[2].q}>
        <mesh position={[0, 1.1, 0]}>
          <coneGeometry args={[0.7, 2.4, 8]} />
          <meshStandardMaterial color="#2a2a33" opacity={0.7} transparent />
        </mesh>
      </group>
    </group>
  );
}

function Stars() {
  const positions = useMemo(() => {
    const rand = mulberry32(20261116);
    const out = new Float32Array(360 * 3);
    for (let i = 0; i < 360; i += 1) {
      // Uniform over the sky sphere, radius 420 — far beyond the fog.
      const u = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      out[i * 3] = Math.cos(a) * s * 420;
      out[i * 3 + 1] = u * 420;
      out[i * 3 + 2] = Math.sin(a) * s * 420;
    }
    return out;
  }, []);
  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={1.4} sizeAttenuation={false} color="#cfe8d8" transparent opacity={0.75} />
    </points>
  );
}

// --- the walker rig (the Moon / Earth-walk rig, copied) ----------------------

function LandOfTheDeadRig({ moveRef, jumpRef, hudRef, onRegion, radius }) {
  const { camera, gl } = useThree();
  // Arrive facing north (-Z, toward the pale moon's azimuth) and
  // slightly up (pitch 0.2) — the moon hangs 26° up ahead on arrival.
  const yaw = useRef(0);
  const pitch = useRef(0.2);
  const yawTarget = useRef(0);
  const pitchTarget = useRef(0.2);
  const walker = useRef(lotdLandingState(radius));
  // GROWTH: if the world grows underfoot (arrivals read after mount),
  // re-seat the walker on the new surface instead of standing inside
  // the old one — the ground radius moved, the feet must follow.
  useEffect(() => {
    walker.current = lotdLandingState(radius);
  }, [radius]);
  const keys = useRef(new Set());
  const dragging = useRef(null);
  const recenterRef = useRef(false);
  const lookAnchorRef = useRef({ yaw: 0, pitch: 0.2 });
  const lookMovedRef = useRef(false);
  const jumpQueued = useRef(false);
  const regionRef = useRef('');

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
    // Auto-center: decay the offset the drag opened back to the
    // drag-start heading at the shared slow rate, then snap exactly.
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
    const { up, forward, right } = sphereTangentBasis(walker.current.feet, yaw.current, radius);
    walker.current = stepSphereWalker(
      walker.current,
      { fwd, strafe, jump: jumpQueued.current, forward, right },
      dtC,
      LOTD_PLANET
    );
    jumpQueued.current = false;
    const { feet } = walker.current;
    camera.position.set(
      feet.x + up.x * LOTD_PLANET.eyeHeight,
      feet.y + up.y * LOTD_PLANET.eyeHeight,
      feet.z + up.z * LOTD_PLANET.eyeHeight
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
      hudRef.current = { height: lotdWalkerHeight(feet, radius), grounded: walker.current.grounded };
    }
    if (onRegion) {
      const name = regionAt(feet);
      if (name !== regionRef.current) {
        regionRef.current = name;
        onRegion(name);
      }
    }
  });

  return null;
}

// --- scene composition -------------------------------------------------------

const MOON_POS = [
  LOTD_MOON_DIR.x * LOTD_MOON_DISTANCE,
  LOTD_MOON_DIR.y * LOTD_MOON_DISTANCE,
  LOTD_MOON_DIR.z * LOTD_MOON_DISTANCE,
];

const SPAWN_CAM_FOR = (radius) => {
  const s = lotdSpawnFeet(radius);
  return [
    s.x + (s.x / radius) * LOTD_PLANET.eyeHeight,
    s.y + (s.y / radius) * LOTD_PLANET.eyeHeight,
    s.z + (s.z / radius) * LOTD_PLANET.eyeHeight,
  ];
};

// FLOOR-DROP RETURN (WS-C, Nov 16): the portal in the floor, 10 m
// north of spawn along the surface — ahead on arrival, toward the
// moon — so the user can find it. Spawn sits 3 m south of the pole,
// so the portal is 7 m north of the pole. Oriented with the surface
// quaternion, like every other surface piece here.
function ReturnPortal({ onReturn, radius }) {
  const pos = useMemo(() => {
    const a = -7 / radius;
    return { x: 0, y: Math.cos(a) * radius, z: Math.sin(a) * radius };
  }, [radius]);
  const q = useSurfaceQuaternion(pos);
  return <LandOfTheDeadReturn position={pos} quaternion={q} onReturn={onReturn} />;
}

export default function LandOfTheDeadScene({ moveRef, jumpRef, hudRef, onRegion, onReturn, arrivals = 0 }) {
  // GROWTH: the sphere radius follows the recorded arrivals —
  // radiusFor(0) is the starting 55 m. Everything below (ground,
  // gate, shades, return portal, walker, scatter) takes this radius.
  const radius = radiusFor(arrivals);
  const world = useMemo(() => makeWorld(20261116, radius), [radius]);
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ position: SPAWN_CAM_FOR(radius), fov: 60, near: 0.1, far: 1000 }}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={[SKY_COLOR]} />
      <fog attach="fog" args={[FOG_COLOR, 12, 140]} />
      <ambientLight intensity={0.32} color="#b8c8bc" />
      {/* Pale moonlight from the moon's direction — the only strong light. */}
      <directionalLight position={MOON_POS} intensity={0.55} color="#d8e8d8" />
      {/* The dead world itself — see Ground() above (video wrap). */}
      {/* The pale moon, hanging 26° up ahead on arrival. */}
      <mesh position={MOON_POS}>
        <sphereGeometry args={[LOTD_MOON_RADIUS, 24, 24]} />
        <meshBasicMaterial color="#e8f2e4" fog={false} />
      </mesh>
      {/* VIDEO WRAP (Merlin, Nov 16 ~04:19): the blood-red-moon storm
          sky video on the shared dome; the static sky image
          (public/art/realms/land-of-the-dead-sky.jpg) is the fallback
          while it loads. The pale moon mesh stays as the light anchor
          — its red video moon is part of the dome, so the sky carries
          two moons until Merlin says otherwise. */}
      <RealmSkyDome realmKey="land-of-the-dead" />
      <Stars />
      <Ground radius={radius} />
      {world.deadTrees.map((t) => <DeadTree key={t.id} tree={t} />)}
      {world.gravestones.map((s) => <Gravestone key={s.id} stone={s} />)}
      <Wisps wisps={world.wisps} />
      <DriftShades radius={radius} />
      <Gates radius={radius} />
      {/* FLOOR-DROP RETURN (WS-C, Nov 16): the portal in the floor that
          carries the user back to the realm they dropped from. */}
      <ReturnPortal onReturn={onReturn} radius={radius} />
      <LandOfTheDeadRig moveRef={moveRef} jumpRef={jumpRef} hudRef={hudRef} onRegion={onRegion} radius={radius} />
    </Canvas>
  );
}
