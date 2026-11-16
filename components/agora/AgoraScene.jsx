'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { mulberry32, hashString } from '@/lib/earth4/creature-textures';
import { getParticleTexture } from '@/lib/particles/sprites';
import DayNightRig from '@/components/DayNightRig';
import { TouchControls } from '@/components/mars/MarsScene';
import {
  AGORA_SEED, WORLD_RADIUS, WALKER_SPAWN, EYE_HEIGHT,
  FOUNTAIN_RADIUS, FOUNTAIN_POSITION,
  TEMPLE_POSITION, TEMPLE_RISE,
  agoraDayFactor, stallSites, STOA_SIDES, STOA_COLUMN_COUNT,
  STOA_COLUMN_SPACING, STOA_COLUMN_HEIGHT, oliveTreeSites,
} from '@/lib/agora/world';
import { materialForAgora } from '@/lib/agora/textures';
import {
  meltemiWindAt, makePollenField, updatePollenField,
  awningSwayRad, windCompass,
} from '@/lib/agora/weather';
import { lifeFor, crowdCount, CROWD_KINDS } from '@/lib/agora/operators';

// AGORA — THE MARKET CITY (Merlin, Nov 15, 2026). The CGI
// makeover for the town square: Agora was a 2D feed with no 3D
// scene at all — no ground, no sky, no buildings, no stalls —
// so the market city is built fresh here in the house CGI idiom
// (Mars 2 / Star Wars): procedural textures, the shared
// day/night rig, crowd operators as pure functions of the device
// clock, the Meltemi breeze. Modes: 'orbit' overview, 'walk'
// (WASD + stick, flat square, eye 1.7 m). No vehicles in a
// market square — this world is walked, not driven. No new real
// lights anywhere: window and temple glow are unlit
// MeshBasicMaterial (emissive only), and the only lights are the
// shared DayNightRig's, exactly as Mars 2 runs it.

const WALK_RADIUS = 40; // the walker stays inside the market square

function useKeys(inputRef) {
  useEffect(() => {
    const down = (e) => {
      const k = e.key.toLowerCase();
      const inp = inputRef.current;
      if (!inp) return;
      if (k === 'w' || k === 'arrowup') inp.keys.fwd = true;
      if (k === 's' || k === 'arrowdown') inp.keys.back = true;
      if (k === 'a' || k === 'arrowleft') inp.keys.left = true;
      if (k === 'd' || k === 'arrowright') inp.keys.right = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    };
    const up = (e) => {
      const k = e.key.toLowerCase();
      const inp = inputRef.current;
      if (!inp) return;
      if (k === 'w' || k === 'arrowup') inp.keys.fwd = false;
      if (k === 's' || k === 'arrowdown') inp.keys.back = false;
      if (k === 'a' || k === 'arrowleft') inp.keys.left = false;
      if (k === 'd' || k === 'arrowright') inp.keys.right = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [inputRef]);
}

// A triangular pediment / roof prism from a 2D shape — the
// temple gable and the house roofs. Pure three.js, node-safe.
function prismGeometry(width, height, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

// --- ground: cobbled square + mosaic medallion --------------------
// Flat city ground (a market square has no dunes): one cobbled
// disc for the whole city floor, the mosaic medallion under the
// fountain at the centre, and the low temple rise at the north
// end. The square is the walkable floor; the rise is visual
// only, like the Mars 2 Mons — the walker stays on the flat.
function AgoraGround() {
  const mats = useMemo(() => ({
    cobble: materialForAgora('cobble', AGORA_SEED),
    mosaic: materialForAgora('mosaic', AGORA_SEED),
    marble: materialForAgora('marble', AGORA_SEED),
  }), []);
  const cobble = useMemo(() => {
    const m = mats.cobble.clone();
    m.map = mats.cobble.map.clone();
    m.map.repeat.set(24, 24);
    m.map.needsUpdate = true;
    m.bumpMap = mats.cobble.bumpMap.clone();
    m.bumpMap.repeat.set(24, 24);
    m.bumpMap.needsUpdate = true;
    return m;
  }, [mats]);
  useEffect(() => () => { cobble.dispose(); }, [cobble]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={cobble}>
        <circleGeometry args={[WORLD_RADIUS + 8, 64]} />
      </mesh>
      {/* mosaic medallion under the fountain */}
      <mesh position={[FOUNTAIN_POSITION.x, 0.02, FOUNTAIN_POSITION.z]} rotation={[-Math.PI / 2, 0, 0]} material={mats.mosaic}>
        <circleGeometry args={[6.5, 48]} />
      </mesh>
      {/* temple rise — a low marble platform at the north end */}
      <mesh position={[TEMPLE_POSITION.x, TEMPLE_RISE / 2, TEMPLE_POSITION.z]} material={mats.marble}>
        <cylinderGeometry args={[13, 14.5, TEMPLE_RISE, 48]} />
      </mesh>
    </group>
  );
}

// --- the fountain -----------------------------------------------------
function Fountain({ dayF }) {
  const marble = useMemo(() => materialForAgora('marble', AGORA_SEED), []);
  const waterMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#5fb8e8', transparent: true, opacity: 0.85, depthWrite: false,
  }), []);
  const rimMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffd28a', transparent: true, opacity: 0.35,
  }), []);
  useFrame(() => {
    const t = Date.now() / 1000;
    // The water shimmers on the clock; the rim glows after dark.
    waterMat.opacity = 0.72 + 0.13 * Math.sin(t * 1.4);
    rimMat.opacity = 0.12 + 0.6 * (1 - dayF);
  });
  useEffect(() => () => { waterMat.dispose(); rimMat.dispose(); }, [waterMat, rimMat]);
  return (
    <group position={[FOUNTAIN_POSITION.x, 0, FOUNTAIN_POSITION.z]}>
      <mesh position={[0, 0.5, 0]} material={marble}>
        <cylinderGeometry args={[FOUNTAIN_RADIUS, FOUNTAIN_RADIUS + 0.3, 1, 32]} />
      </mesh>
      <mesh position={[0, 0.98, 0]} rotation={[-Math.PI / 2, 0, 0]} material={waterMat}>
        <circleGeometry args={[FOUNTAIN_RADIUS - 0.3, 32]} />
      </mesh>
      <mesh position={[0, 1.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={rimMat}>
        <ringGeometry args={[FOUNTAIN_RADIUS - 0.3, FOUNTAIN_RADIUS - 0.05, 32]} />
      </mesh>
      {/* centre column + spout */}
      <mesh position={[0, 1.7, 0]} material={marble}>
        <cylinderGeometry args={[0.35, 0.5, 1.6, 12]} />
      </mesh>
      <mesh position={[0, 2.6, 0]} material={marble}>
        <sphereGeometry args={[0.45, 12, 12]} />
      </mesh>
      <Html position={[0, 4.2, 0]} center distanceFactor={50} style={{ pointerEvents: 'none' }}>
        <div style={{
          fontSize: 11, letterSpacing: 3, whiteSpace: 'nowrap',
          color: '#fff3d6', textShadow: '0 1px 6px #000', fontWeight: 700,
        }}>THE FOUNTAIN</div>
      </Html>
    </group>
  );
}

// --- stoa colonnades ----------------------------------------------------
// Two roofed colonnades flank the square east and west — marble
// columns, an entablature beam, a terracotta roof slab. The
// shaded walk where the crowd strolls.
function Stoa() {
  const mats = useMemo(() => ({
    marble: materialForAgora('marble', AGORA_SEED),
    terracotta: materialForAgora('terracotta', AGORA_SEED),
  }), []);
  const columns = useMemo(() => {
    const list = [];
    for (const side of STOA_SIDES) {
      for (let i = 0; i < STOA_COLUMN_COUNT; i++) {
        const z = (i - (STOA_COLUMN_COUNT - 1) / 2) * STOA_COLUMN_SPACING;
        list.push({ x: side.x, z, key: `${side.side}-${i}` });
      }
    }
    return list;
  }, []);
  return (
    <group>
      {columns.map((c) => (
        <mesh key={c.key} position={[c.x, STOA_COLUMN_HEIGHT / 2, c.z]} material={mats.marble}>
          <cylinderGeometry args={[0.42, 0.52, STOA_COLUMN_HEIGHT, 16]} />
        </mesh>
      ))}
      {STOA_SIDES.map((side) => (
        <group key={side.side}>
          {/* entablature beam */}
          <mesh position={[side.x, STOA_COLUMN_HEIGHT + 0.35, 0]} material={mats.marble}>
            <boxGeometry args={[1.6, 0.7, STOA_COLUMN_COUNT * STOA_COLUMN_SPACING]} />
          </mesh>
          {/* terracotta roof slab */}
          <mesh position={[side.x, STOA_COLUMN_HEIGHT + 0.85, 0]} material={mats.terracotta}>
            <boxGeometry args={[3.4, 0.25, STOA_COLUMN_COUNT * STOA_COLUMN_SPACING + 1.5]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// --- the temple ----------------------------------------------------------
// Six marble columns, a pediment, and a warm glowing doorway —
// the glow is unlit MeshBasicMaterial (emissive only), brighter
// after dark, so the temple reads as a lamp on the hill at night.
function Temple({ dayF }) {
  const marble = useMemo(() => materialForAgora('marble', AGORA_SEED), []);
  const terracotta = useMemo(() => materialForAgora('terracotta', AGORA_SEED), []);
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffb35a', transparent: true, opacity: 0.55,
  }), []);
  const pedimentGeo = useMemo(() => prismGeometry(11, 2.2, 7), []);
  useFrame(() => {
    glowMat.opacity = 0.25 + 0.65 * (1 - dayF);
  });
  useEffect(() => () => { glowMat.dispose(); pedimentGeo.dispose(); }, [glowMat, pedimentGeo]);
  const frontZ = -6.5;
  return (
    <group position={[TEMPLE_POSITION.x, TEMPLE_RISE, TEMPLE_POSITION.z]}>
      {/* steps */}
      <mesh position={[0, 0.15, 2.5]} material={marble}>
        <boxGeometry args={[13, 0.3, 2]} />
      </mesh>
      <mesh position={[0, 0.45, 1.5]} material={marble}>
        <boxGeometry args={[12, 0.3, 2]} />
      </mesh>
      {/* cella (inner chamber) */}
      <mesh position={[0, 3, -1]} material={marble}>
        <boxGeometry args={[8, 6, 8]} />
      </mesh>
      {/* glowing doorway, facing the square (south, +Z) */}
      <mesh position={[0, 2.6, 3.05]} material={glowMat}>
        <planeGeometry args={[2.2, 4.4]} />
      </mesh>
      {/* front columns */}
      {[-5, -3, -1, 1, 3, 5].map((x) => (
        <mesh key={x} position={[x, 3.6, frontZ]} material={marble}>
          <cylinderGeometry args={[0.42, 0.52, 7.2, 16]} />
        </mesh>
      ))}
      {/* side columns */}
      {[-3, 0, 3].map((z) => (
        <group key={z}>
          <mesh position={[-5.5, 3.6, z]} material={marble}>
            <cylinderGeometry args={[0.42, 0.52, 7.2, 16]} />
          </mesh>
          <mesh position={[5.5, 3.6, z]} material={marble}>
            <cylinderGeometry args={[0.42, 0.52, 7.2, 16]} />
          </mesh>
        </group>
      ))}
      {/* entablature + pediment + roof */}
      <mesh position={[0, 7.5, -1]} material={marble}>
        <boxGeometry args={[12.5, 0.8, 15]} />
      </mesh>
      <mesh position={[0, 7.9, frontZ + 4.5]} geometry={pedimentGeo} material={terracotta} />
      <Html position={[0, 12.5, 0]} center distanceFactor={60} style={{ pointerEvents: 'none' }}>
        <div style={{
          fontSize: 11, letterSpacing: 3, whiteSpace: 'nowrap',
          color: '#fff3d6', textShadow: '0 1px 6px #000', fontWeight: 700,
        }}>THE TEMPLE</div>
      </Html>
    </group>
  );
}

// --- city houses -----------------------------------------------------------
// Whitewashed houses with terracotta roofs ring the square
// outside the stoa. Blue shutters, lit windows — the windows are
// unlit MeshBasicMaterial (emissive only), one shared material
// whose opacity the frame loop drives with the day factor, so
// the whole city warms up after dark.
function houseSites() {
  const rnd = mulberry32(hashString(`agora:houses:${AGORA_SEED}`));
  const houses = [];
  const count = 12;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.2;
    const dist = 47 + rnd() * 7;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (Math.abs(x) < 10 && z > 24) continue; // south gate lane
    if (Math.abs(x) < 10 && z < -30) continue; // temple approach
    houses.push({
      x, z, angle,
      w: 6 + rnd() * 3, d: 6 + rnd() * 2, h: 4 + rnd() * 2.5,
      roofH: 1.6 + rnd() * 0.9,
    });
  }
  return houses;
}

function Houses({ dayF }) {
  const sites = useMemo(() => houseSites(), []);
  const mats = useMemo(() => ({
    plaster: materialForAgora('plaster', AGORA_SEED),
    terracotta: materialForAgora('terracotta', AGORA_SEED),
  }), []);
  const windowMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffd28a', transparent: true, opacity: 0.3,
  }), []);
  const shutterMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#2f6db3', roughness: 0.8,
  }), []);
  useFrame(() => {
    windowMat.opacity = 0.18 + 0.75 * (1 - dayF);
  });
  useEffect(() => () => { windowMat.dispose(); shutterMat.dispose(); }, [windowMat, shutterMat]);
  return (
    <group>
      {sites.map((h, i) => (
        <group key={i} position={[h.x, 0, h.z]} rotation={[0, h.angle + Math.PI / 2, 0]}>
          <mesh position={[0, h.h / 2, 0]} material={mats.plaster}>
            <boxGeometry args={[h.w, h.h, h.d]} />
          </mesh>
          {/* pitched terracotta roof: two slabs meeting at a ridge */}
          <mesh position={[0, h.h + h.roofH / 2, -h.d / 4 - 0.2]} rotation={[0.42, 0, 0]} material={mats.terracotta}>
            <boxGeometry args={[h.w + 0.6, 0.18, h.d / 2 + 1.2]} />
          </mesh>
          <mesh position={[0, h.h + h.roofH / 2, h.d / 4 + 0.2]} rotation={[-0.42, 0, 0]} material={mats.terracotta}>
            <boxGeometry args={[h.w + 0.6, 0.18, h.d / 2 + 1.2]} />
          </mesh>
          {/* lit windows + blue shutters on the square-facing wall */}
          {[-1, 1].map((sx) => (
            <group key={sx}>
              <mesh position={[sx * (h.w / 4), h.h * 0.55, h.d / 2 + 0.03]} material={windowMat}>
                <planeGeometry args={[0.9, 1.2]} />
              </mesh>
              <mesh position={[sx * (h.w / 4) - 0.65, h.h * 0.55, h.d / 2 + 0.02]} material={shutterMat}>
                <boxGeometry args={[0.35, 1.2, 0.06]} />
              </mesh>
              <mesh position={[sx * (h.w / 4) + 0.65, h.h * 0.55, h.d / 2 + 0.02]} material={shutterMat}>
                <boxGeometry args={[0.35, 1.2, 0.06]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

// --- olive trees -------------------------------------------------------------
function OliveTrees() {
  const sites = useMemo(() => oliveTreeSites(), []);
  const wood = useMemo(() => materialForAgora('oliveWood', AGORA_SEED, '#8a7a5a'), []);
  const leafMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#6b7d3a', roughness: 1,
  }), []);
  useEffect(() => () => { leafMat.dispose(); }, [leafMat]);
  return (
    <group>
      {sites.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} rotation={[0, 0, t.lean]} scale={[t.scale, t.scale, t.scale]}>
          <mesh position={[0, 1.1, 0]} material={wood}>
            <cylinderGeometry args={[0.18, 0.3, 2.2, 8]} />
          </mesh>
          <mesh position={[0, 2.6, 0]} material={leafMat}>
            <sphereGeometry args={[1.5, 12, 10]} />
          </mesh>
          <mesh position={[0.9, 2.2, 0.4]} material={leafMat}>
            <sphereGeometry args={[1.0, 10, 8]} />
          </mesh>
          <mesh position={[-0.8, 2.3, -0.3]} material={leafMat}>
            <sphereGeometry args={[0.9, 10, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// --- market stalls ------------------------------------------------------------
// Eight stalls ring the square: olive-wood counter, posts, a
// striped awning in the stall's own colour that breathes with
// the Meltemi, produce piled on the counter, amphorae at the
// side. The awning sway is a pure function of the live wind.
function Stalls() {
  const sites = useMemo(() => stallSites(), []);
  const mats = useMemo(() => ({
    wood: materialForAgora('oliveWood', AGORA_SEED),
    marble: materialForAgora('marble', AGORA_SEED),
    clay: materialForAgora('terracotta', AGORA_SEED, '#c07850'),
  }), []);
  const awningMats = useMemo(() => sites.map((s) => materialForAgora('awning', AGORA_SEED, s.awning, { side: THREE.DoubleSide })), [sites]);
  const awningRefs = useRef([]);
  const produceMats = useMemo(() => sites.map((s) => ({
    a: new THREE.MeshStandardMaterial({ color: s.produce, roughness: 0.7 }),
    b: new THREE.MeshStandardMaterial({ color: s.produceAlt, roughness: 0.7 }),
  })), [sites]);
  useEffect(() => () => {
    produceMats.forEach((m) => { m.a.dispose(); m.b.dispose(); });
  }, [produceMats]);
  useFrame(() => {
    const now = Date.now();
    const wind = meltemiWindAt(now);
    const sway = awningSwayRad(wind);
    const t = now / 1000;
    for (let i = 0; i < awningRefs.current.length; i++) {
      const g = awningRefs.current[i];
      if (!g) continue;
      // The awning leans downwind and ripples with the gusts.
      g.rotation.x = -0.12 + sway * Math.sin(t * 1.3 + i * 1.7);
      g.rotation.z = sway * 0.6 * Math.cos(t * 1.1 + i * 2.1);
    }
  });
  return (
    <group>
      {sites.map((s, i) => (
        <group key={s.trade} position={[s.x, 0, s.z]} rotation={[0, s.angle, 0]}>
          {/* counter */}
          <mesh position={[0, 0.55, 0]} material={mats.wood}>
            <boxGeometry args={[3.4, 1.1, 1.4]} />
          </mesh>
          {/* posts */}
          {[[-1.6, -0.6], [1.6, -0.6], [-1.6, 0.6], [1.6, 0.6]].map(([px, pz]) => (
            <mesh key={`${px},${pz}`} position={[px, 1.1, pz]} material={mats.wood}>
              <cylinderGeometry args={[0.07, 0.07, 2.2, 8]} />
            </mesh>
          ))}
          {/* striped awning — sways with the Meltemi */}
          <group ref={(el) => { awningRefs.current[i] = el; }} position={[0, 2.25, 0]}>
            <mesh material={awningMats[i]}>
              <boxGeometry args={[4, 0.06, 2.2]} />
            </mesh>
          </group>
          {/* produce piled on the counter */}
          {[-1.1, -0.35, 0.4, 1.15].map((px, j) => (
            <mesh key={j} position={[px, 1.28, (j % 2 ? -0.25 : 0.25)]} material={j % 2 ? produceMats[i].b : produceMats[i].a}>
              <sphereGeometry args={[0.28, 10, 8]} />
            </mesh>
          ))}
          {/* amphorae at the side */}
          <mesh position={[-1.9, 0.45, 0.9]} material={mats.clay}>
            <sphereGeometry args={[0.32, 12, 10]} />
          </mesh>
          <mesh position={[-1.9, 0.85, 0.9]} material={mats.clay}>
            <cylinderGeometry args={[0.09, 0.13, 0.3, 8]} />
          </mesh>
          <mesh position={[1.9, 0.45, -0.9]} material={mats.clay}>
            <sphereGeometry args={[0.32, 12, 10]} />
          </mesh>
          <mesh position={[1.9, 0.85, -0.9]} material={mats.clay}>
            <cylinderGeometry args={[0.09, 0.13, 0.3, 8]} />
          </mesh>
          <Html position={[0, 3.4, 0]} center distanceFactor={46} style={{ pointerEvents: 'none' }}>
            <div style={{
              fontSize: 11, letterSpacing: 2, whiteSpace: 'nowrap',
              color: '#fff3d6', textShadow: '0 1px 6px #000', fontWeight: 700,
            }}>{s.label}</div>
          </Html>
        </group>
      ))}
    </group>
  );
}

// --- the crowd ---------------------------------------------------------------
// Procedural people — capsule tunic, sphere head — driven by the
// operators (lib/agora/operators.js): vendors at their stalls,
// shoppers looping the square, gulls circling overhead. Positions
// are pure functions of the device clock; the frame loop only
// renders what lifeFor says. Tunic colours are seeded per person.
const TUNIC_COLORS = ['#c8a06a', '#7a4a8a', '#2f6db3', '#a85a3a', '#5a7d2a', '#d45a8a', '#e8c832', '#3a86a8'];
const SKIN_COLORS = ['#e8b88a', '#d9a06a', '#c88a5a', '#f0c8a0'];

function Crowd() {
  const members = useMemo(() => {
    const list = [];
    for (const kind of CROWD_KINDS) {
      for (let i = 0; i < crowdCount(kind); i++) list.push({ kind, index: i });
    }
    return list;
  }, []);
  const groupRefs = useRef([]);
  const wingRefs = useRef([]);
  const tunicMats = useMemo(() => members.map((m, i) => {
    if (m.kind === 'gull') return null;
    const rnd = mulberry32(hashString(`agora:tunic:${m.kind}:${m.index}`));
    return new THREE.MeshStandardMaterial({
      color: TUNIC_COLORS[Math.floor(rnd() * TUNIC_COLORS.length)], roughness: 0.9,
    });
  }), [members]);
  const skinMats = useMemo(() => members.map((m) => {
    if (m.kind === 'gull') return null;
    const rnd = mulberry32(hashString(`agora:skin:${m.kind}:${m.index}`));
    return new THREE.MeshStandardMaterial({
      color: SKIN_COLORS[Math.floor(rnd() * SKIN_COLORS.length)], roughness: 0.8,
    });
  }), [members]);
  const gullMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.9 }), []);
  useEffect(() => () => {
    tunicMats.forEach((m) => m && m.dispose());
    skinMats.forEach((m) => m && m.dispose());
    gullMat.dispose();
  }, [tunicMats, skinMats, gullMat]);
  useFrame(() => {
    const now = Date.now();
    const t = now / 1000;
    for (let i = 0; i < members.length; i++) {
      const g = groupRefs.current[i];
      if (!g) continue;
      const life = lifeFor(members[i].kind, members[i].index, now);
      g.position.set(life.x, life.y + (life.bob || 0), life.z);
      g.rotation.y = life.heading;
      if (members[i].kind === 'gull') {
        const wings = wingRefs.current[i];
        if (wings) wings.rotation.z = Math.sin(t * 6 + i) * 0.45;
      }
    }
  });
  return (
    <group>
      {members.map((m, i) => (
        <group key={`${m.kind}-${m.index}`} ref={(el) => { groupRefs.current[i] = el; }}>
          {m.kind === 'gull' ? (
            <group>
              <mesh material={gullMat}>
                <sphereGeometry args={[0.22, 10, 8]} />
              </mesh>
              <group ref={(el) => { wingRefs.current[i] = el; }}>
                <mesh position={[-0.55, 0, 0]} rotation={[0, 0, 0.15]} material={gullMat}>
                  <boxGeometry args={[1.1, 0.05, 0.35]} />
                </mesh>
                <mesh position={[0.55, 0, 0]} rotation={[0, 0, -0.15]} material={gullMat}>
                  <boxGeometry args={[1.1, 0.05, 0.35]} />
                </mesh>
              </group>
            </group>
          ) : (
            <group>
              {/* tunic */}
              <mesh position={[0, 0.85, 0]} material={tunicMats[i]}>
                <capsuleGeometry args={[0.32, 0.85, 6, 10]} />
              </mesh>
              {/* head */}
              <mesh position={[0, 1.72, 0]} material={skinMats[i]}>
                <sphereGeometry args={[0.24, 12, 10]} />
              </mesh>
              {/* vendor's apron: a pale band across the tunic */}
              {m.kind === 'vendor' && (
                <mesh position={[0, 0.95, 0.3]} material={skinMats[i]}>
                  <boxGeometry args={[0.5, 0.7, 0.06]} />
                </mesh>
              )}
            </group>
          )}
        </group>
      ))}
    </group>
  );
}

// --- stars ---------------------------------------------------------------------
function AgoraStars({ opacity }) {
  const points = useMemo(() => {
    const rng = mulberry32(hashString(`agora:stars:${AGORA_SEED}`));
    const starCount = 450;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = rng() * Math.PI * 2;
      const phi = 0.08 + rng() * (Math.PI * 0.52 - 0.08);
      const r = 420;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xf3e9d8, size: 1.6, map: getParticleTexture('star') || undefined, sizeAttenuation: false,
      transparent: true, opacity: 0, depthWrite: false, fog: false,
    });
    return new THREE.Points(starGeo, starMat);
  }, []);
  useEffect(() => () => {
    points.geometry.dispose();
    points.material.dispose();
  }, [points]);
  points.material.opacity = opacity;
  return <primitive object={points} />;
}

// --- Meltemi weather: drifting pollen -------------------------------------------
function AgoraWeather({ dayF }) {
  const pollen = useMemo(() => makePollenField({ seed: AGORA_SEED + '-meltemi' }), []);
  useEffect(() => () => {
    pollen.geometry.dispose();
    pollen.material.dispose();
  }, [pollen]);
  useFrame((state, rawDt) => {
    const now = Date.now();
    const wind = meltemiWindAt(now);
    updatePollenField(pollen, wind, Math.min(rawDt, 0.05), now, 0.35 + 0.65 * dayF);
  });
  return <primitive object={pollen} />;
}

// --- walk rig --------------------------------------------------------------------
// Walk: first-person, drag to look, stick/WASD, eye 1.7 m over the
// flat square, clamped to the market (radius 40) so the walker
// stays among the stalls and out of the houses and the temple.
function WalkerRig({ inputRef, mode, walkerRef, yawRef, pitchRef }) {
  const { camera, gl } = useThree();
  const dragging = useRef(false);
  const last = useRef([0, 0]);

  useEffect(() => {
    camera.rotation.order = 'YXZ';
    const el = gl.domElement;
    const s = (e) => { dragging.current = true; last.current = [e.clientX, e.clientY]; };
    const m = (e) => {
      if (!dragging.current) return;
      const dx = e.clientX - last.current[0];
      const dy = e.clientY - last.current[1];
      last.current = [e.clientX, e.clientY];
      yawRef.current -= dx * 0.0042;
      pitchRef.current = Math.max(-1.35, Math.min(1.35, pitchRef.current - dy * 0.0042));
    };
    const e = () => { dragging.current = false; };
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
      yawRef.current -= dx * 0.005;
      pitchRef.current = Math.max(-1.35, Math.min(1.35, pitchRef.current - dy * 0.005));
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
  }, [camera, gl, yawRef, pitchRef]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const k = inputRef.current.keys;
    const fwd = (k.fwd ? 1 : 0) - (k.back ? 1 : 0);
    const strafe = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    const sin = Math.sin(yawRef.current);
    const cos = Math.cos(yawRef.current);
    const p = walkerRef.current;
    p.x += (-sin * fwd + cos * strafe) * 3 * dt;
    p.z += (-cos * fwd - sin * strafe) * 3 * dt;
    const r = Math.hypot(p.x, p.z);
    if (r > WALK_RADIUS) { p.x *= WALK_RADIUS / r; p.z *= WALK_RADIUS / r; }
    p.y = EYE_HEIGHT;
    camera.position.copy(p);
    camera.rotation.set(pitchRef.current, yawRef.current, 0);
  });
  return null;
}

// --- scene composition ---------------------------------------------------------
function SceneContent({ timeOfDay, mode, inputRef }) {
  const orbitRef = useRef();
  const walkerRef = useRef(new THREE.Vector3(WALKER_SPAWN.x, EYE_HEIGHT, WALKER_SPAWN.z));
  const yawRef = useRef(0); // spawn faces the square (north, -Z)
  const pitchRef = useRef(-0.05);
  const dayF = agoraDayFactor(timeOfDay);

  return (
    <>
      <DayNightRig shade="earth" fogDensity={0.0035} />
      <AgoraStars opacity={1 - dayF} />
      <AgoraGround />
      <Fountain dayF={dayF} />
      <Stoa />
      <Temple dayF={dayF} />
      <Houses dayF={dayF} />
      <OliveTrees />
      <Stalls />
      <Crowd />
      <AgoraWeather dayF={dayF} />

      {mode === 'orbit' && (
        <OrbitControls ref={orbitRef} makeDefault enableDamping dampingFactor={0.08}
          maxPolarAngle={Math.PI * 0.52} minDistance={5} maxDistance={170}
          target={[0, 4, 0]} />
      )}
      {mode !== 'orbit' && (
        <WalkerRig
          inputRef={inputRef} mode={mode}
          walkerRef={walkerRef} yawRef={yawRef} pitchRef={pitchRef}
        />
      )}
    </>
  );
}

// --- Meltemi breeze readout ------------------------------------------------------
// A small live pill (top-right of the stage): the breeze's speed
// and compass bearing, refreshed once a second. "GUSTING" when
// the gust factor is high — so the weather is readable, not just
// felt.
function MeltemiWindPill() {
  const [wind, setWind] = useState(() => meltemiWindAt(Date.now()));
  useEffect(() => {
    const id = setInterval(() => setWind(meltemiWindAt(Date.now())), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{
      position: 'absolute', top: 10, right: 10, zIndex: 5,
      color: '#fff3d6', fontSize: 11, letterSpacing: 2, textShadow: '0 1px 4px #000',
      background: 'rgba(0,0,0,0.35)', padding: '6px 12px', borderRadius: 8,
      pointerEvents: 'none', whiteSpace: 'nowrap',
    }}>
      🌬 MELTEMI {wind.speed.toFixed(0)} m/s {windCompass(wind.bearingDeg)}{wind.gust > 0.6 ? ' · GUSTING' : ''}
    </div>
  );
}

export default function AgoraScene({
  worldKey, timeOfDay = 0.32, mode = 'orbit', inputRef,
}) {
  useKeys(inputRef);
  const [ready, setReady] = useState(false);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [26, 16, 44], fov: 55, near: 0.1, far: 900 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={() => setReady(true)}
      >
        <SceneContent
          key={worldKey || AGORA_SEED}
          timeOfDay={timeOfDay} mode={mode} inputRef={inputRef}
        />
      </Canvas>
      {!ready && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#f2c879', letterSpacing: 3, fontSize: 12,
        }}>BUILDING THE MARKET…</div>
      )}
      {mode !== 'orbit' && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          color: '#fff3d6', fontSize: 11, letterSpacing: 2, textShadow: '0 1px 4px #000',
          background: 'rgba(0,0,0,0.35)', padding: '6px 14px', borderRadius: 8,
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          STICK / WASD MOVE · DRAG LOOK
        </div>
      )}
      <MeltemiWindPill />
      {mode !== 'orbit' && <TouchControls inputRef={inputRef} fly={false} />}
    </div>
  );
}
