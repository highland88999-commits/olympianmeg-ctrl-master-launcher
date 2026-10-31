'use client';
// components/swamp-run/SwampRunScene.jsx
// R3F rendering for Swamp Run. Reads the pure engine state from a ref every
// frame and syncs three.js objects imperatively (no React re-renders in the
// hot loop). Murky Everglades: green-brown heightfield islands, cypress
// canopy, lily pads, fog — under a low dusk sun.

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { terrainHeight, WORLD_SIZE } from '@/lib/swamp-run/world';

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
const MUD = new THREE.Color('#4a3d28');
const WET = new THREE.Color('#5d4e30');
const GRASS = new THREE.Color('#47602e');
const DEEP_GRASS = new THREE.Color('#33491f');

function groundY(seed, x, z) {
  const h = terrainHeight(seed, x, z);
  return h <= 0 ? h * 0.6 - 0.5 : h;
}

function Terrain({ stateRef }) {
  const geo = useMemo(() => {
    const s = stateRef.current;
    if (!s) return null;
    const g = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 108, 108);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrainHeight(s.seed, x, z);
      pos.setY(i, h <= 0 ? h * 0.6 - 0.5 : h);
      if (h <= 0) tmpColor.copy(MUD).multiplyScalar(0.8 + ((x * 13 + z * 7) % 10) / 60);
      else if (h <= 0.06) tmpColor.copy(WET);
      else tmpColor.copy(GRASS).lerp(DEEP_GRASS, Math.min(1, h * 1.4));
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateRef.current?.seed]);

  if (!geo) return null;
  return (
    <mesh geometry={geo} receiveShadow={false}>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  );
}

function Water() {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.material.opacity = 0.82 + Math.sin(t * 0.6) * 0.05;
    ref.current.position.y = Math.sin(t * 0.5) * 0.03;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[WORLD_SIZE * 1.6, WORLD_SIZE * 1.6]} />
      <meshStandardMaterial color="#3d4d2a" transparent opacity={0.85} roughness={0.35} metalness={0.05} />
    </mesh>
  );
}

function useCypressGeometry() {
  // One cypress tree, merged: flared buttress trunk + three layered
  // canopy puffs. Built once, instanced per tree. Slightly more
  // realistic than the old blob — Merlin's words, don't overdo it.
  return useMemo(() => {
    const parts = [];
    // Buttress trunk: flared at the base like a real cypress.
    const trunk = new THREE.CylinderGeometry(0.42, 0.95, 3.6, 7);
    trunk.translate(0, 1.8, 0);
    parts.push(trunk);
    // Three canopy puffs: wide low, medium mid, small top — Spanish-moss green.
    const puff1 = new THREE.SphereGeometry(2.6, 8, 6);
    puff1.scale(1.25, 0.62, 1.25);
    puff1.translate(0, 4.4, 0);
    parts.push(puff1);
    const puff2 = new THREE.SphereGeometry(1.9, 8, 6);
    puff2.scale(1.1, 0.6, 1.1);
    puff2.translate(0.7, 5.9, -0.4);
    parts.push(puff2);
    const puff3 = new THREE.SphereGeometry(1.25, 7, 6);
    puff3.scale(1, 0.65, 1);
    puff3.translate(-0.5, 7.1, 0.5);
    parts.push(puff3);
    // Merge into one geometry. (BufferGeometryUtils not imported to keep
    // the bundle lean — manual merge of position/normal/uv.)
    let vCount = 0;
    let iCount = 0;
    for (const p of parts) {
      vCount += p.attributes.position.count;
      iCount += p.index.count;
    }
    const pos = new Float32Array(vCount * 3);
    const nor = new Float32Array(vCount * 3);
    const uv = new Float32Array(vCount * 2);
    const idx = new Uint16Array(iCount);
    let vo = 0;
    let io = 0;
    for (const p of parts) {
      const n = p.attributes.position.count;
      pos.set(p.attributes.position.array, vo * 3);
      nor.set(p.attributes.normal.array, vo * 3);
      uv.set(p.attributes.uv.array, vo * 2);
      const pi = p.index.array;
      for (let i = 0; i < pi.length; i++) idx[io + i] = pi[i] + vo;
      vo += n;
      io += pi.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }, []);
}

function Trees({ stateRef }) {
  const treeRef = useRef(null);
  const mossRef = useRef(null);
  const builtFor = useRef('');
  const geo = useCypressGeometry();
  const count = stateRef.current?.world.trees.length || 0;
  // Moss strands: only trees with moss > 0.55 get them (3 strands each).
  const mossCount = useMemo(() => {
    const trees = stateRef.current?.world.trees || [];
    return trees.filter((t) => (t.moss || 0) > 0.55).length * 3;
  }, [count]);
  useFrame(() => {
    const s = stateRef.current;
    const mesh = treeRef.current;
    const moss = mossRef.current;
    if (!s || !mesh) return;
    const sig = `seed:${s.seed}`;
    if (builtFor.current === sig) return;
    builtFor.current = sig;
    let mi = 0;
    s.world.trees.forEach((t, i) => {
      const baseY = t.water ? -0.5 : groundY(s.seed, t.x, t.z) - 0.25;
      dummy.position.set(t.x, baseY, t.z);
      const sc = t.water ? 0.62 : 0.85 + (t.h - 7) * 0.09;
      dummy.scale.set(t.r * 1.15, sc, t.r * 1.15);
      dummy.rotation.set(0, (t.x * 7 + t.z * 3) % Math.PI, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tmpColor.setHSL(0.26 + ((i * 37) % 10) / 110, 0.38, 0.2 + ((i * 53) % 10) / 140);
      mesh.setColorAt(i, tmpColor);
      // Spanish moss: grey-green strands hanging from the low canopy.
      if (moss && (t.moss || 0) > 0.55) {
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + i;
          dummy.position.set(
            t.x + Math.cos(a) * 1.7 * sc,
            baseY + 4.1 * sc,
            t.z + Math.sin(a) * 1.7 * sc
          );
          dummy.scale.set(1, 0.8 + ((i + k) % 3) * 0.35, 1);
          dummy.rotation.set(0.08 * Math.sin(i + k), 0, 0.08 * Math.cos(i * 2 + k));
          dummy.updateMatrix();
          moss.setMatrixAt(mi++, dummy.matrix);
        }
      }
    });
    mesh.count = s.world.trees.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (moss) {
      moss.count = mi;
      moss.instanceMatrix.needsUpdate = true;
    }
  });
  if (!count) return null;
  return (
    <group>
      <instancedMesh ref={treeRef} args={[geo, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial color="#ffffff" roughness={1} flatShading={false} />
      </instancedMesh>
      {mossCount > 0 && (
        <instancedMesh ref={mossRef} args={[undefined, undefined, mossCount]} frustumCulled={false}>
          <cylinderGeometry args={[0.05, 0.015, 1.6, 4]} />
          <meshStandardMaterial color="#8a9578" roughness={1} transparent opacity={0.85} />
        </instancedMesh>
      )}
    </group>
  );
}

function Reeds({ stateRef }) {
  const reedRef = useRef(null);
  const tipRef = useRef(null);
  const builtFor = useRef('');
  const reeds = stateRef.current?.world.reeds || [];
  const count = reeds.length;
  const cattails = useMemo(() => reeds.filter((r) => r.kind === 'cattail').length, [count]);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const mesh = reedRef.current;
    if (!s || !mesh) return;
    const sig = `seed:${s.seed}`;
    if (builtFor.current !== sig) {
      builtFor.current = sig;
      let ci = 0;
      s.world.reeds.forEach((r, i) => {
        dummy.position.set(r.x, r.h / 2 - 0.1, r.z);
        dummy.scale.set(1, r.h / 2.2, 1);
        dummy.rotation.set(r.lean, r.rot, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        tmpColor.setHSL(0.24 + (i % 5) / 90, 0.4, 0.3 + (i % 7) / 90);
        mesh.setColorAt(i, tmpColor);
      });
      mesh.count = s.world.reeds.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // Cattail heads sit atop the cattail reeds.
      const tips = tipRef.current;
      if (tips) {
        s.world.reeds.forEach((r) => {
          if (r.kind !== 'cattail') return;
          dummy.position.set(
            r.x + Math.sin(r.lean) * r.h * 0.5,
            r.h - 0.25,
            r.z
          );
          dummy.scale.setScalar(1);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          tips.setMatrixAt(ci++, dummy.matrix);
        });
        tips.count = ci;
        tips.instanceMatrix.needsUpdate = true;
      }
    }
    // Gentle sway.
    mesh.rotation.y = Math.sin(clock.elapsedTime * 0.5) * 0.01;
  });
  if (!count) return null;
  return (
    <group>
      <instancedMesh ref={reedRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <cylinderGeometry args={[0.035, 0.06, 2.2, 5]} />
        <meshStandardMaterial color="#ffffff" roughness={1} />
      </instancedMesh>
      {cattails > 0 && (
        <instancedMesh ref={tipRef} args={[undefined, undefined, cattails]} frustumCulled={false}>
          <capsuleGeometry args={[0.09, 0.32, 3, 8]} />
          <meshStandardMaterial color="#5a3d22" roughness={1} />
        </instancedMesh>
      )}
    </group>
  );
}

function Knees({ stateRef }) {
  const ref = useRef(null);
  const builtFor = useRef('');
  const count = stateRef.current?.world.knees.length || 0;
  useFrame(() => {
    const s = stateRef.current;
    const mesh = ref.current;
    if (!s || !mesh) return;
    if (builtFor.current === `seed:${s.seed}`) return;
    builtFor.current = `seed:${s.seed}`;
    s.world.knees.forEach((k, i) => {
      dummy.position.set(k.x, k.h / 2 - 0.15, k.z);
      dummy.scale.set(k.r / 0.2, k.h / 0.7, k.r / 0.2);
      dummy.rotation.set(0, (k.x * 3 + k.z * 5) % Math.PI, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = s.world.knees.length;
    mesh.instanceMatrix.needsUpdate = true;
  });
  if (!count) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <coneGeometry args={[0.2, 0.7, 6]} />
      <meshStandardMaterial color="#5c4a30" roughness={1} />
    </instancedMesh>
  );
}

function Lilies({ stateRef }) {
  const ref = useRef(null);
  const builtFor = useRef('');
  const count = stateRef.current?.world.lilies.length || 0;
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const mesh = ref.current;
    if (!s || !mesh) return;
    if (builtFor.current !== `seed:${s.seed}`) {
      builtFor.current = `seed:${s.seed}`;
      s.world.lilies.forEach((l, i) => {
        dummy.position.set(l.x, 0.04, l.z);
        dummy.scale.setScalar(l.r);
        dummy.rotation.set(0, l.rot, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.count = s.world.lilies.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
    mesh.position.y = Math.sin(clock.elapsedTime * 0.7) * 0.02;
  });
  if (!count) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <circleGeometry args={[1, 10]} />
      <meshStandardMaterial color="#51763a" roughness={0.9} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

function useDetailedCanoeGeometry() {
  // A proper dugout canoe: carved hull (lathe-formed), gunwale rails,
  // two thwart seats. Procedural stand-in until the Tripo detailed
  // canoe lands in /models/swamp/canoe-detailed.glb (see lib/swamp-run/models.js).
  return useMemo(() => {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#6e4f2a', roughness: 0.85 });
    const darkWood = new THREE.MeshStandardMaterial({ color: '#54391c', roughness: 1 });
    const railWood = new THREE.MeshStandardMaterial({ color: '#7d5a30', roughness: 0.8 });

    // Hull: a stretched, hollowed half-capsule. Build from a lathe then
    // scale — gives the curved dugout profile the old box hull lacked.
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10; // 0 stern -> 1 bow
      const y = Math.sin(t * Math.PI) * 0.32; // rocker curve
      pts.push(new THREE.Vector2(0.42 * Math.sin(t * Math.PI * 0.92 + 0.08), y));
    }
    const hullGeo = new THREE.LatheGeometry(pts, 10, 0, Math.PI);
    hullGeo.scale(1, 1, 4.4);
    hullGeo.rotateY(Math.PI / 2);
    // Lathe makes a half-pipe; flip so the opening faces up.
    hullGeo.rotateZ(Math.PI);
    const hull = new THREE.Mesh(hullGeo, wood);
    hull.position.y = 0.1;
    group.add(hull);

    // Gunwale rails along both sheer lines.
    for (const side of [-1, 1]) {
      const railGeo = new THREE.BoxGeometry(0.09, 0.07, 3.5);
      // Bend the rail: approximate the sheer with 3 segments.
      for (let sgi = 0; sgi < 3; sgi++) {
        const rail = new THREE.Mesh(railGeo, railWood);
        const zt = (sgi - 1) * 1.15;
        rail.position.set(side * 0.4 * Math.cos(zt * 0.5), 0.32 + Math.abs(zt) * 0.06, zt);
        rail.rotation.x = -Math.sign(zt) * 0.1;
        rail.scale.z = 0.36;
        group.add(rail);
      }
    }

    // Two thwart seats.
    for (const zt of [-0.7, 0.7]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.05, 0.28), darkWood);
      seat.position.set(0, 0.22, zt);
      group.add(seat);
    }

    // Bow and stern caps.
    for (const zt of [1.78, -1.78]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), railWood);
      cap.position.set(0, 0.3, zt);
      cap.rotation.x = zt > 0 ? 0.45 : -0.45;
      group.add(cap);
    }
    return group;
  }, []);
}

function PlayerAndCanoe({ stateRef, onCanoeClick }) {
  const canoeRef = useRef(null);
  const figureRef = useRef(null);
  const paddleRef = useRef(null);
  const canoeGroup = useDetailedCanoeGeometry();
  useFrame(({ clock }) => {
    const s = stateRef.current;
    if (!s || !canoeRef.current || !figureRef.current) return;
    const t = clock.elapsedTime;
    const p = s.player;
    const bob = Math.sin(t * 2.1) * 0.05;

    // Canoe: with the player, parked at the shore, or gone (capsized).
    const canoe = canoeRef.current;
    canoe.visible = s.canoe.alive;
    if (s.canoe.alive) {
      canoe.position.set(s.canoe.x, 0.1 + bob, s.canoe.z);
      canoe.rotation.set(Math.sin(t * 1.7) * 0.02, s.canoe.heading, Math.sin(t * 1.3) * 0.03);
    }

    // Figure: rides in the canoe, swims low, or runs upright.
    const fig = figureRef.current;
    if (p.mode === 'canoe') {
      fig.position.set(p.x, 0.32 + bob, p.z);
      fig.rotation.set(0, p.heading, 0);
    } else if (p.mode === 'swim') {
      fig.position.set(p.x, -0.28 + Math.sin(t * 5) * 0.05, p.z);
      fig.rotation.set(1.15, p.heading, 0); // prone, paddling
    } else {
      const runBob = Math.abs(Math.sin(t * 9)) * 0.12 * Math.min(1, Math.abs(p.speed));
      fig.position.set(p.x, groundY(s.seed, p.x, p.z) + 0.85 + runBob, p.z);
      fig.rotation.set(0, p.heading, 0);
    }

    // Paddle strokes while canoeing.
    if (paddleRef.current) {
      const stroking = p.mode === 'canoe' && Math.abs(p.speed) > 0.3;
      paddleRef.current.visible = p.mode === 'canoe';
      paddleRef.current.rotation.x = stroking
        ? Math.sin(t * (s.input.sprint ? 11 : 6.5)) * 0.7
        : 0.25;
    }
  });
  return (
    <group>
      <group
        ref={canoeRef}
        onClick={(e) => {
          e.stopPropagation();
          onCanoeClick?.();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto';
        }}
      >
        <primitive object={canoeGroup} />
        {/* Invisible fat hitbox so taps land easily on phones. */}
        <mesh visible={false}>
          <boxGeometry args={[2.2, 1.6, 4.6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      <group ref={figureRef}>
        {/* body */}
        <mesh position={[0, 0.35, 0]}>
          <capsuleGeometry args={[0.26, 0.55, 4, 10]} />
          <meshStandardMaterial color="#b8502e" roughness={0.8} />
        </mesh>
        {/* head + hat */}
        <mesh position={[0, 0.95, 0]}>
          <sphereGeometry args={[0.21, 12, 10]} />
          <meshStandardMaterial color="#c98a5e" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.08, 0]}>
          <cylinderGeometry args={[0.34, 0.36, 0.07, 12]} />
          <meshStandardMaterial color="#77663a" roughness={0.9} />
        </mesh>
        {/* paddle */}
        <group ref={paddleRef} position={[0.42, 0.55, 0.2]}>
          <mesh>
            <boxGeometry args={[0.07, 1.5, 0.16]} />
            <meshStandardMaterial color="#8a652f" roughness={0.85} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function Croc({ stateRef }) {
  const groupRef = useRef(null);
  const jawRef = useRef(null);
  const ripple1 = useRef(null);
  const ripple2 = useRef(null);
  const eyeMat = useRef(null);
  const deathAt = useRef(null);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const g = groupRef.current;
    if (!s || !g) return;
    const t = clock.elapsedTime;
    const c = s.croc;
    const inWater = terrainHeight(s.seed, c.x, c.z) <= 0;
    const hunting = c.mode === 'chase' || c.mode === 'hunt';

    let y = inWater ? -0.32 : groundY(s.seed, c.x, c.z) + 0.12;
    let x = c.x;
    let z = c.z;
    let jaw = hunting ? 0.35 + Math.sin(t * 3.2) * 0.12 : 0.06;

    if (s.status === 'dead' && s.death) {
      // Death cam: the lunge. It flies the last metres, jaws wide.
      if (deathAt.current === null) deathAt.current = t;
      const k = Math.min(1, (t - deathAt.current) / 0.45);
      x = THREE.MathUtils.lerp(s.death.crocX, s.death.x, k);
      z = THREE.MathUtils.lerp(s.death.crocZ, s.death.z, k);
      y = 0.35 + Math.sin(k * Math.PI) * 0.5;
      jaw = 0.25 + k * 0.75;
    }

    g.position.set(x, y, z);
    g.rotation.set(0, s.status === 'dead' && s.death ? s.death.crocHeading : c.heading, 0);
    if (jawRef.current) jawRef.current.rotation.x = jaw;
    if (eyeMat.current) {
      const angry = hunting || c.mode === 'circle';
      eyeMat.current.emissive.set(angry ? '#ff2a1a' : '#ffb300');
      eyeMat.current.emissiveIntensity = angry ? 1.6 : 0.8;
    }

    // Ripples trail the submerged body.
    const ripples = [ripple1.current, ripple2.current];
    ripples.forEach((r, i) => {
      if (!r) return;
      r.visible = inWater && s.status !== 'dead';
      const ph = (t * 0.55 + i * 0.5) % 1;
      r.position.set(c.x, 0.06, c.z);
      r.scale.setScalar(1 + ph * 5.5);
      r.material.opacity = (1 - ph) * 0.4;
    });
  });
  return (
    <group>
      <group ref={groupRef}>
        {/* snout + skull */}
        <mesh position={[0, 0.18, 1.35]}>
          <boxGeometry args={[0.62, 0.3, 1.5]} />
          <meshStandardMaterial color="#4c5a33" roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.22, 0.45]}>
          <boxGeometry args={[0.85, 0.42, 0.9]} />
          <meshStandardMaterial color="#55653a" roughness={0.95} />
        </mesh>
        {/* lower jaw */}
        <group ref={jawRef} position={[0, 0.1, 0.6]}>
          <mesh position={[0, -0.06, 0.75]}>
            <boxGeometry args={[0.55, 0.12, 1.5]} />
            <meshStandardMaterial color="#66744a" roughness={0.95} />
          </mesh>
        </group>
        {/* eyes */}
        <mesh position={[-0.26, 0.5, 0.72]}>
          <sphereGeometry args={[0.11, 10, 8]} />
          <meshStandardMaterial ref={eyeMat} color="#201a08" emissive="#ffb300" emissiveIntensity={0.8} />
        </mesh>
        <mesh position={[0.26, 0.5, 0.72]}>
          <sphereGeometry args={[0.11, 10, 8]} />
          <meshStandardMaterial color="#201a08" emissive="#ffb300" emissiveIntensity={0.8} />
        </mesh>
        {/* back + ridges */}
        <mesh position={[0, 0.16, -0.7]}>
          <boxGeometry args={[0.95, 0.36, 1.6]} />
          <meshStandardMaterial color="#4c5a33" roughness={1} />
        </mesh>
        {[0.1, -0.6, -1.3].map((zz, i) => (
          <mesh key={i} position={[0, 0.4, zz]}>
            <coneGeometry args={[0.16, 0.3, 5]} />
            <meshStandardMaterial color="#3d4a29" roughness={1} />
          </mesh>
        ))}
        {/* tail */}
        <mesh position={[0, 0.12, -2.2]} rotation={[Math.PI / 2.25, 0, 0]}>
          <coneGeometry args={[0.4, 2.2, 6]} />
          <meshStandardMaterial color="#4c5a33" roughness={1} />
        </mesh>
      </group>
      <mesh ref={ripple1} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.05, 28]} />
        <meshBasicMaterial color="#cfe3b0" transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={ripple2} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.05, 28]} />
        <meshBasicMaterial color="#cfe3b0" transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Fireflies() {
  const ref = useRef(null);
  const seeds = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        x: Math.sin(i * 39.7) * 240,
        z: Math.cos(i * 27.3) * 240,
        ph: i * 1.37,
      })),
    []
  );
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    seeds.forEach((f, i) => {
      dummy.position.set(
        f.x + Math.sin(t * 0.4 + f.ph) * 6,
        1.2 + Math.sin(t * 0.9 + f.ph * 2) * 0.5,
        f.z + Math.cos(t * 0.3 + f.ph) * 6
      );
      dummy.scale.setScalar(0.5 + Math.sin(t * 2 + f.ph * 3) * 0.3);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 60]} frustumCulled={false}>
      <sphereGeometry args={[0.09, 6, 6]} />
      <meshBasicMaterial color="#ffe98a" transparent opacity={0.85} />
    </instancedMesh>
  );
}

function Gator({ stateRef }) {
  // Procedural alligator stand-in — dark olive, broad U snout, low and
  // lurking. Steps aside for /models/swamp/alligator-rigged.glb when
  // Merlin drops the Tripo model in (see lib/swamp-run/models.js).
  const groupRef = useRef(null);
  const jawRef = useRef(null);
  const eyeMat = useRef(null);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const g = groupRef.current;
    if (!s || !g || !s.gator) return;
    const t = clock.elapsedTime;
    const gt = s.gator;
    const bursting = gt.mode === 'burst';
    const y = -0.38 + (bursting ? Math.sin(t * 14) * 0.06 : Math.sin(t * 1.2) * 0.02);
    g.position.set(gt.x, y, gt.z);
    g.rotation.set(0, gt.heading, 0);
    if (jawRef.current) {
      jawRef.current.rotation.x = bursting
        ? 0.5 + Math.sin(t * 6) * 0.18
        : 0.04 + Math.sin(t * 0.8) * 0.02;
    }
    if (eyeMat.current) {
      eyeMat.current.emissive.set(bursting ? '#ff2a1a' : '#c9a227');
      eyeMat.current.emissiveIntensity = bursting ? 1.8 : 0.5;
    }
    // Lurking gators sit low — only eyes and snout break the surface.
    g.scale.y = gt.mode === 'lurk' ? 0.82 : 1;
  });
  return (
    <group ref={groupRef}>
      {/* broad U-shaped snout — the alligator's tell vs the croc's V */}
      <mesh position={[0, 0.14, 1.25]}>
        <boxGeometry args={[0.78, 0.26, 1.3]} />
        <meshStandardMaterial color="#3f4a26" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.18, 0.4]}>
        <boxGeometry args={[0.9, 0.38, 0.85]} />
        <meshStandardMaterial color="#46522c" roughness={0.95} />
      </mesh>
      <group ref={jawRef} position={[0, 0.08, 0.55]}>
        <mesh position={[0, -0.05, 0.7]}>
          <boxGeometry args={[0.68, 0.1, 1.3]} />
          <meshStandardMaterial color="#55632f" roughness={0.95} />
        </mesh>
      </group>
      {/* eyes — high on the skull, the lurker's periscope */}
      <mesh position={[-0.3, 0.42, 0.62]}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshStandardMaterial ref={eyeMat} color="#1a1408" emissive="#c9a227" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0.3, 0.42, 0.62]}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshStandardMaterial color="#1a1408" emissive="#c9a227" emissiveIntensity={0.5} />
      </mesh>
      {/* low armored back */}
      <mesh position={[0, 0.12, -0.75]}>
        <boxGeometry args={[1.0, 0.3, 1.7]} />
        <meshStandardMaterial color="#3f4a26" roughness={1} />
      </mesh>
      {[0.05, -0.65, -1.35].map((zz, i) => (
        <mesh key={i} position={[0, 0.32, zz]}>
          <coneGeometry args={[0.14, 0.24, 5]} />
          <meshStandardMaterial color="#333d1f" roughness={1} />
        </mesh>
      ))}
      {/* thick tail */}
      <mesh position={[0, 0.08, -2.3]} rotation={[Math.PI / 2.3, 0, 0]}>
        <coneGeometry args={[0.42, 2.4, 6]} />
        <meshStandardMaterial color="#3f4a26" roughness={1} />
      </mesh>
    </group>
  );
}

function CameraRig({ stateRef }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dtRaw) => {
    const s = stateRef.current;
    if (!s) return;
    const dt = Math.min(dtRaw, 0.05);
    const p = s.player;

    if (s.status === 'dead' && s.death) {
      // Death cam: swing low in front of the kill.
      const hx = Math.sin(s.death.crocHeading);
      const hz = Math.cos(s.death.crocHeading);
      target.set(s.death.x + hx * 5.5, 2.2, s.death.z + hz * 5.5);
      look.set(s.death.x, 0.4, s.death.z);
    } else {
      const back = p.mode === 'canoe' ? 10.5 : 7.5;
      const up = p.mode === 'canoe' ? 6.4 : 5;
      target.set(
        p.x - Math.sin(p.heading) * back,
        up + Math.max(0, groundY(s.seed, p.x, p.z)) * 0.4,
        p.z - Math.cos(p.heading) * back
      );
      look.set(p.x + Math.sin(p.heading) * 5, 0.6, p.z + Math.cos(p.heading) * 5);
    }
    const k = 1 - Math.pow(0.0015, dt); // smooth follow
    camera.position.lerp(target, k);
    camera.lookAt(look);
  });
  return null;
}

export default function SwampRunScene({ stateRef, onCanoeClick }) {
  return (
    <>
      <color attach="background" args={['#27351d']} />
      <fog attach="fog" args={['#2c3d21', 26, 135]} />
      <hemisphereLight args={['#e8e4b0', '#1c2a14', 0.75]} />
      <directionalLight position={[70, 90, -40]} intensity={1.5} color="#ffb469" />
      <directionalLight position={[-50, 40, 60]} intensity={0.3} color="#9db98a" />
      <Terrain stateRef={stateRef} />
      <Water />
      <Trees stateRef={stateRef} />
      <Reeds stateRef={stateRef} />
      <Knees stateRef={stateRef} />
      <Lilies stateRef={stateRef} />
      <PlayerAndCanoe stateRef={stateRef} onCanoeClick={onCanoeClick} />
      <Croc stateRef={stateRef} />
      <Gator stateRef={stateRef} />
      <Fireflies />
      <CameraRig stateRef={stateRef} />
    </>
  );
}
