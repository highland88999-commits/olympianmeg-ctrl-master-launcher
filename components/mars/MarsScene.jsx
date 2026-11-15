'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { SeedRNG, getTerrainHeight } from '@/lib/mars/engine';
import { terrainMaterial, disposeTerrainMaterial, monsSite, monsSlopeMaterial, monsCapMaterial, hazeSpriteTexture, devilStreakTexture, DUST_DEVIL_COUNT, DUST_DEVIL_AREA, HAZE_COUNT } from '@/lib/mars/cgi';
import { makeDustField, updateDustField, devilFor, PLANET_CGI_EPOCH_MS } from '@/lib/planet-cgi/motion';
import BackpackHud from '@/components/backpack/BackpackHud';
import { SharedMaterials, buildFloraGroup, buildFaunaGroup } from '@/lib/mars/meshes';

// MARS — seeded exobiology surface (ARES surface program).
// A faithful Olympus port of the Xenogenesis world seed generator:
// one seed string grows a whole Martian region — vertex-colored terrain,
// brine + quicksilver basins, procedural flora, and five niches of
// autonomous fauna. Modes mirror the other surfaces: 'orbit' overview,
// 'walk' (WASD + stick, terrain-clamped), 'fly' (WASD + Space/C + ▲▼).
// The page shell drives: profile (per seed), timeOfDay (0..1), mode,
// inputRef (keys), focusReq {pos, nonce}, onSelect(summary|null),
// selectedId.

const EYE = 1.7;
const MOVE_R = 88;

function useKeys(inputRef) {
  useEffect(() => {
    const down = (e) => {
      const k = e.key.toLowerCase();
      const inp = inputRef.current;
      if (k === 'w' || k === 'arrowup') inp.keys.fwd = true;
      if (k === 's' || k === 'arrowdown') inp.keys.back = true;
      if (k === 'a' || k === 'arrowleft') inp.keys.left = true;
      if (k === 'd' || k === 'arrowright') inp.keys.right = true;
      if (k === ' ') inp.keys.up = true;
      if (k === 'c' || k === 'control') inp.keys.down = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    };
    const up = (e) => {
      const k = e.key.toLowerCase();
      const inp = inputRef.current;
      if (k === 'w' || k === 'arrowup') inp.keys.fwd = false;
      if (k === 's' || k === 'arrowdown') inp.keys.back = false;
      if (k === 'a' || k === 'arrowleft') inp.keys.left = false;
      if (k === 'd' || k === 'arrowright') inp.keys.right = false;
      if (k === ' ') inp.keys.up = false;
      if (k === 'c' || k === 'control') inp.keys.down = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [inputRef]);
}

// First-person rig shared by walk + fly. Drag on canvas to look.
// Walk clamps to the Martian terrain via groundHeight(x, z) + EYE;
// fly is free with a soft floor/ceiling.
function FirstPerson({ inputRef, fly, groundHeight }) {
  const { camera, gl } = useThree();
  const yaw = useRef(0.6);
  const pitch = useRef(-0.05);
  const pos = useRef(new THREE.Vector3(10, fly ? 14 : EYE, 26));
  const dragging = useRef(false);
  const last = useRef([0, 0]);

  useEffect(() => {
    camera.rotation.order = 'YXZ';
    pos.current.set(10, fly ? 14 : EYE, 26);
    yaw.current = 0.6;
    pitch.current = fly ? -0.15 : -0.05;
    const el = gl.domElement;
    const s = (e) => {
      dragging.current = true;
      last.current = [e.clientX, e.clientY];
    };
    const m = (e) => {
      if (!dragging.current) return;
      const dx = e.clientX - last.current[0];
      const dy = e.clientY - last.current[1];
      last.current = [e.clientX, e.clientY];
      yaw.current -= dx * 0.0042;
      pitch.current = Math.max(-1.35, Math.min(1.35, pitch.current - dy * 0.0042));
    };
    const e = () => { dragging.current = false; };
    // touch
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
      yaw.current -= dx * 0.005;
      pitch.current = Math.max(-1.35, Math.min(1.35, pitch.current - dy * 0.005));
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
  }, [camera, gl, fly]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const k = inputRef.current.keys;
    const fwd = (k.fwd ? 1 : 0) - (k.back ? 1 : 0);
    const strafe = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    const speed = fly ? 16 : 7;
    const sin = Math.sin(yaw.current), cos = Math.cos(yaw.current);
    const p = pos.current;
    p.x += (-sin * fwd + cos * strafe) * speed * dt;
    p.z += (-cos * fwd - sin * strafe) * speed * dt;
    if (fly) {
      p.y += ((k.up ? 1 : 0) - (k.down ? 1 : 0)) * 12 * dt;
      p.y = Math.max(1.5, Math.min(90, p.y));
    } else {
      p.y = groundHeight(p.x, p.z) + EYE;
    }
    const r = Math.hypot(p.x, p.z);
    if (r > MOVE_R) { p.x *= MOVE_R / r; p.z *= MOVE_R / r; }
    camera.position.copy(p);
    camera.rotation.set(pitch.current, yaw.current, 0);
  });
  return null;
}

// Touch movement for walk/fly — same hardened pattern as the rainforest:
// the stick writes into the same inputRef.keys the keyboard fills, and
// every key is cleared on release, cancel, and unmount. Exported so the
// hub's MarsConsole can render the same DOM controls when the surface
// lives inside the hub Canvas (no second implementation to drift).
export function TouchControls({ inputRef, fly }) {
  const stickRef = useRef(null);
  const knobRef = useRef(null);
  const activeId = useRef(null);

  const setKey = (name, v) => { if (inputRef.current) inputRef.current.keys[name] = v; };
  const clearStick = () => {
    setKey('fwd', false); setKey('back', false); setKey('left', false); setKey('right', false);
    if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)';
  };
  useEffect(() => () => { clearStick(); setKey('up', false); setKey('down', false); }, []);

  const moveStick = (e) => {
    const el = stickRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    const T = 12;
    setKey('fwd', dy < -T); setKey('back', dy > T);
    setKey('left', dx < -T); setKey('right', dx > T);
  };
  const onDown = (e) => { activeId.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); moveStick(e); };
  const onMove = (e) => { if (activeId.current === e.pointerId) moveStick(e); };
  const onUp = (e) => { if (activeId.current === e.pointerId) { activeId.current = null; clearStick(); } };

  const holdBtn = (name) => ({
    onPointerDown: (e) => { e.currentTarget.setPointerCapture(e.pointerId); setKey(name, true); },
    onPointerUp: () => setKey(name, false),
    onPointerCancel: () => setKey(name, false),
    onLostPointerCapture: () => setKey(name, false),
  });

  const zone = {
    position: 'absolute', bottom: 16, width: 104, height: 104, borderRadius: '50%',
    border: '1px solid rgba(255,166,88,0.55)', background: 'rgba(18,8,4,0.38)',
    touchAction: 'none', zIndex: 6,
  };
  return (
    <>
      <div
        ref={stickRef}
        role="application" aria-label="Move"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{ ...zone, left: 16 }}
      >
        <div ref={knobRef} style={{
          position: 'absolute', left: '50%', top: '50%', width: 46, height: 46,
          marginLeft: -23, marginTop: -23, borderRadius: '50%',
          background: 'rgba(255,166,88,0.35)', border: '1px solid rgba(255,166,88,0.8)',
          pointerEvents: 'none',
        }} />
      </div>
      {fly && (
        <div style={{ position: 'absolute', right: 16, bottom: 16, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 6 }}>
          <button type="button" aria-label="Fly up" {...holdBtn('up')} style={{
            width: 52, height: 52, borderRadius: '50%', touchAction: 'none',
            border: '1px solid rgba(255,166,88,0.55)', background: 'rgba(18,8,4,0.38)', color: '#ffe3cc', fontSize: 18,
          }}>▲</button>
          <button type="button" aria-label="Fly down" {...holdBtn('down')} style={{
            width: 52, height: 52, borderRadius: '50%', touchAction: 'none',
            border: '1px solid rgba(255,166,88,0.55)', background: 'rgba(18,8,4,0.38)', color: '#ffe3cc', fontSize: 18,
          }}>▼</button>
        </div>
      )}
    </>
  );
}

// Smooth fly-to for organism focus (orbit mode). focusReq.pos is the
// creature's position snapshot at click time; the camera settles 14
// units out along the current view direction, 5 up, looking at it.
function FocusRig({ focusReq, orbitRef }) {
  const anim = useRef(null);
  const { camera } = useThree();
  useEffect(() => {
    if (!focusReq || !orbitRef.current) return;
    const tgt = new THREE.Vector3(focusReq.pos[0], focusReq.pos[1] + 1, focusReq.pos[2]);
    const dir = camera.position.clone().sub(tgt);
    dir.y = 0;
    if (dir.lengthSq() < 0.001) dir.set(1, 0, 1);
    dir.normalize();
    const camPos = tgt.clone().add(dir.multiplyScalar(14)).add(new THREE.Vector3(0, 5, 0));
    anim.current = {
      t: 0,
      fromP: camera.position.clone(),
      toP: camPos,
      fromT: orbitRef.current.target.clone(),
      toT: tgt,
    };
  }, [focusReq, camera, orbitRef]);
  useFrame((_, rawDt) => {
    const a = anim.current;
    if (!a || !orbitRef.current) return;
    a.t = Math.min(1, a.t + rawDt / 1.4);
    const s = a.t * a.t * (3 - 2 * a.t);
    camera.position.lerpVectors(a.fromP, a.toP, s);
    orbitRef.current.target.lerpVectors(a.fromT, a.toT, s);
    orbitRef.current.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

// --- day/night palette -------------------------------------------------------
// timeOfDay 0..1 (0 = midnight). Sun elevation follows the same arc the
// rainforest uses; day factor is a smoothstep of elevation, then the
// profile's day/night Colors are lerped by it.
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function smoothstep(a, b, x) {
  const s = clamp01((x - a) / (b - a));
  return s * s * (3 - 2 * s);
}

function marsSky(profile, timeOfDay) {
  const elev = Math.sin((timeOfDay - 0.25) * Math.PI * 2);
  const dayF = smoothstep(-0.06, 0.28, elev);
  const bg = new THREE.Color().lerpColors(profile.nightSkyColor, profile.daySkyColor, dayF);
  const fog = new THREE.Color().lerpColors(profile.nightHorizonColor, profile.dayHorizonColor, dayF);
  const sunColor = new THREE.Color().lerpColors(
    new THREE.Color('#8a7a9a'), profile.dayHorizonColor, dayF
  );
  return {
    bg: '#' + bg.getHexString(),
    fog: '#' + fog.getHexString(),
    fogNear: 34 + dayF * 26,
    fogFar: 120 + dayF * 90,
    dayF,
    sunColor: '#' + sunColor.getHexString(),
    sunIntensity: 0.12 + dayF * 1.25,
    ambient: 0.16 + dayF * 0.36,
    hemiSky: '#' + fog.getHexString(),
    hemiGround: '#' + profile.groundColor.getHexString(),
    sunPos: [
      Math.cos((timeOfDay - 0.25) * Math.PI * 2) * 70,
      Math.max(elev, -0.4) * 80 + 12,
      -40,
    ],
    sunDiscPos: [
      Math.cos((timeOfDay - 0.25) * Math.PI * 2) * 380,
      Math.max(elev, -0.4) * 400 + 30,
      -190,
    ],
  };
}

// --- world construction ------------------------------------------------------
// One seeded entity stream (seed + '-ENTITIES'), consumed in the source's
// exact order — basin rims, flora, then fauna — so the world a seed
// describes is the world that renders, every time.
function buildWorld(profile) {
  SharedMaterials.init();
  const rng = new SeedRNG(profile.seed + '-ENTITIES');
  const worldGroup = new THREE.Group();
  const drops = [];
  const floraNodes = [];
  const creatures = [];

  // Basins: pool disc + shoreline dressing.
  profile.basins.forEach((basin) => {
    const poolGeo = new THREE.CircleGeometry(basin.radius, 48);
    poolGeo.rotateX(-Math.PI / 2);
    let poolMat;
    if (basin.type === 'mercury') {
      poolMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#f1f5f9'),
        metalness: 0.99,
        roughness: 0.03,
        emissive: new THREE.Color('#38bdf8'),
        emissiveIntensity: 0.14
      });
    } else {
      poolMat = new THREE.MeshStandardMaterial({
        color: profile.waterColor,
        emissive: profile.waterColor,
        emissiveIntensity: 0.42,
        roughness: 0.12,
        metalness: 0.35,
        transparent: true,
        opacity: 0.84
      });
    }
    const poolMesh = new THREE.Mesh(poolGeo, poolMat);
    poolMesh.position.set(basin.x, basin.level, basin.z);
    worldGroup.add(poolMesh);

    const rimCount = 14;
    for (let r = 0; r < rimCount; r++) {
      const ang = (r / rimCount) * Math.PI * 2 + rng.range(-0.15, 0.15);
      const dist = basin.radius * rng.range(0.92, 1.06);
      const rx = basin.x + Math.cos(ang) * dist;
      const rz = basin.z + Math.sin(ang) * dist;
      const ry = getTerrainHeight(rx, rz, profile);

      if (basin.type === 'mercury') {
        // Levitating ferro-magnetic mercury droplets near shoreline
        const dropGeo = new THREE.SphereGeometry(rng.range(0.25, 0.55), 14, 14);
        const drop = new THREE.Mesh(dropGeo, SharedMaterials.mercuryChrome);
        drop.position.set(rx, ry + rng.range(0.8, 2.2), rz);
        drop.userData = { baseY: drop.position.y, phase: rng.range(0, 6.28) };
        worldGroup.add(drop);
        drops.push(drop);
      } else {
        // Hydro-Lotus bioluminescent water pads
        const padGeo = new THREE.CylinderGeometry(rng.range(0.6, 1.2), 0.2, 0.18, 8);
        const padMat = new THREE.MeshStandardMaterial({
          color: profile.waterColor,
          emissive: profile.waterColor,
          emissiveIntensity: 0.65
        });
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.set(
          basin.x + Math.cos(ang) * (basin.radius * rng.range(0.3, 0.8)),
          basin.level + 0.05,
          basin.z + Math.sin(ang) * (basin.radius * rng.range(0.3, 0.8))
        );
        worldGroup.add(pad);
      }
    }
  });

  // Flora across the terrain.
  const archetypes = ['crystal_earth', 'myco_air', 'mercury_metal', 'pyro_fire'];
  for (let i = 0; i < profile.counts.flora; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(6, 64);
    const fx = Math.cos(angle) * dist;
    const fz = Math.sin(angle) * dist;

    // Keep terrestrial flora out of deep basin centers
    const inDeepPool = profile.basins.some(
      (b) => Math.hypot(fx - b.x, fz - b.z) < b.radius * 0.85
    );
    if (inDeepPool) continue;

    const fy = getTerrainHeight(fx, fz, profile);
    const arch = rng.pick(archetypes);
    const floraMesh = buildFloraGroup(arch, rng, profile);
    floraMesh.position.set(fx, fy, fz);
    const sc = rng.range(0.75, 1.45);
    floraMesh.scale.setScalar(sc);
    worldGroup.add(floraMesh);

    floraNodes.push({ x: fx, y: fy, z: fz, archetype: arch });
  }

  // Fauna across all 5 niches.
  const spawnCreature = (niche, index, customPos) => {
    const spec = profile.speciesCatalog[niche];
    const built = buildFaunaGroup(niche, spec);
    built.group.position.copy(customPos);

    const creatureObj = {
      id: `${niche}_${index}`,
      niche,
      spec,
      group: built.group,
      limbs: built.limbs,
      velocity: new THREE.Vector3(rng.range(-1, 1), 0, rng.range(-1, 1)).normalize(),
      speed:
        niche === 'airborne'
          ? rng.range(5.5, 8.5)
          : niche === 'carnivore'
          ? rng.range(4.2, 5.8)
          : niche === 'mercuryBorne'
          ? rng.range(3.5, 5.2)
          : niche === 'waterBorne'
          ? rng.range(3.0, 4.6)
          : rng.range(2.2, 3.5),
      phase: rng.range(0, Math.PI * 2),
      state: 'Roam',
      targetPos: new THREE.Vector3(),
      basinRef: null,
      altitudeBase: customPos.y,
      orbitAngle: rng.range(0, Math.PI * 2),
      orbitRadius: rng.range(14, 48)
    };

    creatures.push(creatureObj);
    return creatureObj;
  };

  // Airborne flyers
  for (let i = 0; i < profile.counts.airborne; i++) {
    const ang = rng.range(0, Math.PI * 2);
    const rad = rng.range(12, 52);
    const alt = rng.range(11, 24);
    spawnCreature(
      'airborne',
      i,
      new THREE.Vector3(Math.cos(ang) * rad, alt, Math.sin(ang) * rad)
    );
  }

  // Terrestrial grazers (seeded onto flora targets)
  for (let i = 0; i < profile.counts.grazers; i++) {
    let gx = rng.range(-48, 48);
    let gz = rng.range(-48, 48);
    const inPool = profile.basins.some((b) => Math.hypot(gx - b.x, gz - b.z) < b.radius);
    if (inPool) {
      gx = 0;
      gz = rng.range(-12, 12);
    }
    const gy = getTerrainHeight(gx, gz, profile);
    const c = spawnCreature('grazer', i, new THREE.Vector3(gx, gy, gz));
    if (floraNodes.length > 0) {
      const targetFlora = rng.pick(floraNodes);
      c.targetPos.set(targetFlora.x, targetFlora.y, targetFlora.z);
    }
  }

  // Apex carnivores
  for (let i = 0; i < profile.counts.carnivores; i++) {
    const cx = rng.range(-40, 40);
    const cz = rng.range(-40, 40);
    const cy = getTerrainHeight(cx, cz, profile);
    spawnCreature('carnivore', i, new THREE.Vector3(cx, cy, cz));
  }

  // Water-borne swimmers inside brine basins
  const waterBasins = profile.basins.filter((b) => b.type === 'water');
  for (let i = 0; i < profile.counts.waterBorne; i++) {
    const basin = rng.pick(waterBasins);
    const ang = rng.range(0, Math.PI * 2);
    const rad = rng.range(2, basin.radius * 0.75);
    const wx = basin.x + Math.cos(ang) * rad;
    const wz = basin.z + Math.sin(ang) * rad;
    const c = spawnCreature(
      'waterBorne',
      i,
      new THREE.Vector3(wx, basin.level - 0.15, wz)
    );
    c.basinRef = basin;
  }

  // Mercury-borne symbiotes inside quicksilver basins
  const mercuryBasins = profile.basins.filter((b) => b.type === 'mercury');
  for (let i = 0; i < profile.counts.mercuryBorne; i++) {
    const basin = rng.pick(mercuryBasins);
    const ang = rng.range(0, Math.PI * 2);
    const rad = rng.range(2, basin.radius * 0.78);
    const mx = basin.x + Math.cos(ang) * rad;
    const mz = basin.z + Math.sin(ang) * rad;
    const c = spawnCreature(
      'mercuryBorne',
      i,
      new THREE.Vector3(mx, basin.level + 0.1, mz)
    );
    c.basinRef = basin;
  }

  return { worldGroup, drops, floraNodes, creatures };
}

function disposeWorld(world) {
  if (!world) return;
  const kill = (root) => root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && !o.material.userData?.shared) {
      if (Array.isArray(o.material)) o.material.forEach((m) => { if (!m.userData?.shared) m.dispose(); });
      else o.material.dispose();
    }
  });
  kill(world.worldGroup);
  world.creatures.forEach((c) => kill(c.group));
}

// --- terrain -----------------------------------------------------------------
function MarsTerrain({ profile }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(180, 180, 96, 96);
    g.rotateX(-Math.PI / 2);
    const posAttr = g.attributes.position;
    const colors = [];
    const cLow = profile.groundColor.clone().multiplyScalar(0.55);
    const cMid = profile.groundColor.clone();
    const cHigh = profile.groundAccentColor.clone();
    const cPeak = new THREE.Color('#f8fafc');
    const col = new THREE.Color();
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const vy = getTerrainHeight(vx, vz, profile);
      posAttr.setY(i, vy);
      if (vy < -0.2) {
        col.copy(cLow);
      } else if (vy < 2.2) {
        col.lerpColors(cMid, cHigh, (vy + 0.2) / 2.4);
      } else {
        col.copy(cHigh).lerp(cPeak, Math.min(0.45, (vy - 2.2) * 0.12));
      }
      colors.push(col.r, col.g, col.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [profile]);
  // CGI: the marsRegolith map + bump MULTIPLY over the vertex
  // colours (three.js: map × vertexColor × color), so the seeded
  // rust bands keep their hue and gain dunes + relief. The cloned
  // textures carry the repeat — the shared cache stays pristine.
  const material = useMemo(() => terrainMaterial(profile), [profile]);
  useEffect(() => () => {
    geo.dispose();
    disposeTerrainMaterial(material);
  }, [geo, material]);
  return (
    <mesh geometry={geo} material={material} />
  );
}

// --- CGI: Olympus Mons landmark --------------------------------------------
// No named tallest peak exists in the profile, so one landmark rise
// stands on the outer rise: a broad shield cone (rust slopes, pale
// ice-cap summit) at a seeded spot, labelled. Visual only — the
// walker still stands on getTerrainHeight, never on the cone.
function OlympusMons({ profile }) {
  const site = useMemo(() => monsSite(profile), [profile]);
  const slopeMat = useMemo(() => monsSlopeMaterial(profile), [profile]);
  const capMat = useMemo(() => monsCapMaterial(profile), [profile]);
  return (
    <group position={[site.x, site.y - site.sink, site.z]}>
      <mesh position={[0, site.height / 2, 0]} material={slopeMat}>
        <coneGeometry args={[site.radius, site.height, 64]} />
      </mesh>
      <mesh position={[0, site.capY, 0]} material={capMat}>
        <coneGeometry args={[site.capRadius, site.capHeight, 64]} />
      </mesh>
      <Html position={[0, site.height + 3.5, 0]} center distanceFactor={60}
        style={{ pointerEvents: 'none' }}>
        <div style={{
          fontSize: 11, letterSpacing: 3, whiteSpace: 'nowrap',
          color: '#ffe3cc', textShadow: '0 1px 6px #000', fontWeight: 700,
        }}>OLYMPUS MONS</div>
      </Html>
    </group>
  );
}

// --- CGI: dust, dust devils, storm haze --------------------------------------
// All motion is a pure function of the device clock (lib/planet-cgi):
// the dust motes wander, the devils live ~40 s then reseed elsewhere,
// and the haze breathes thick and thin over ~2.3 minutes. Nothing is
// stored, nothing ticks on a server. dayF dims the dust at night so
// the motes don't glow in the dark.
function MarsCgi({ profile, dayF }) {
  const dust = useMemo(() => makeDustField({
    count: 260, width: 170, height: 8, depth: 170, yBase: 0.3,
    seed: profile.seed + '-dust', color: '#d9a06a', size: 0.12, opacity: 0.5,
  }), [profile]);

  // One open cylinder per devil (outer faint + inner denser shell);
  // the streak map is what makes the spin visible. Opacity is
  // per-devil, so each devil owns its two materials.
  const devilGeo = useMemo(() => new THREE.CylinderGeometry(0.7, 1, 1, 20, 1, true), []);
  const devilTex = useMemo(() => devilStreakTexture(), []);
  const devilMats = useMemo(() => Array.from({ length: DUST_DEVIL_COUNT }, () => ({
    outer: new THREE.MeshBasicMaterial({ map: devilTex, color: '#d9b28c', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    inner: new THREE.MeshBasicMaterial({ map: devilTex, color: '#e8c9a0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  })), [devilTex]);
  const devilRefs = useRef([]);

  const haze = useMemo(() => {
    const rng = new SeedRNG(profile.seed + '-HAZE');
    const tex = hazeSpriteTexture();
    const list = [];
    for (let i = 0; i < HAZE_COUNT; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: '#c98a5a', transparent: true, opacity: 0.08, depthWrite: false });
      const s = new THREE.Sprite(mat);
      const sc = rng.range(42, 72);
      s.scale.set(sc, sc * 0.45, 1);
      const bx = rng.range(-55, 55);
      const bz = rng.range(-55, 55);
      s.position.set(bx, rng.range(7, 15), bz);
      list.push({ sprite: s, baseX: bx, baseZ: bz, phase: rng.range(0, Math.PI * 2) });
    }
    return { tex, list };
  }, [profile]);

  useEffect(() => () => {
    dust.geometry.dispose();
    dust.material.dispose();
    devilGeo.dispose();
    devilTex.dispose();
    devilMats.forEach((m) => { m.outer.dispose(); m.inner.dispose(); });
    haze.tex.dispose();
    haze.list.forEach((h) => h.sprite.material.dispose());
  }, [dust, devilGeo, devilTex, devilMats, haze]);

  useFrame(() => {
    const now = Date.now();
    updateDustField(dust, now);
    dust.material.opacity = 0.18 + 0.34 * dayF;
    const t = (now - PLANET_CGI_EPOCH_MS) / 1000;
    const vis = 0.45 + 0.55 * dayF;
    for (let i = 0; i < DUST_DEVIL_COUNT; i++) {
      const d = devilFor(i, now, DUST_DEVIL_AREA);
      const g = devilRefs.current[i];
      if (!g) continue;
      g.visible = d.alive;
      if (!d.alive) continue;
      const gy = getTerrainHeight(d.x, d.z, profile);
      g.position.set(d.x, gy + d.height / 2, d.z);
      g.rotation.y = d.spin;
      g.scale.set(d.radius, d.height, d.radius);
      devilMats[i].outer.opacity = 0.10 * d.opacity * vis;
      devilMats[i].inner.opacity = 0.24 * d.opacity * vis;
    }
    for (let i = 0; i < haze.list.length; i++) {
      const h = haze.list[i];
      h.sprite.position.x = h.baseX + Math.sin(t * 0.02 + h.phase) * 9;
      h.sprite.position.z = h.baseZ + Math.cos(t * 0.016 + h.phase) * 9;
      const breathe = 0.5 + 0.5 * Math.sin(t * 0.045 + h.phase * 2.3);
      h.sprite.material.opacity = (0.04 + 0.10 * breathe) * (0.45 + 0.55 * dayF);
    }
  });

  return (
    <>
      <primitive object={dust} />
      {devilMats.map((m, i) => (
        <group key={i} ref={(el) => { devilRefs.current[i] = el; }} visible={false}>
          <mesh geometry={devilGeo} material={m.outer} scale={[1.6, 1, 1.6]} />
          <mesh geometry={devilGeo} material={m.inner} scale={[0.85, 1, 0.85]} />
        </group>
      ))}
      {haze.list.map((h, i) => (
        <primitive key={i} object={h.sprite} />
      ))}
    </>
  );
}

// --- starfield ---------------------------------------------------------------
function MarsStars({ profile, opacity }) {
  const points = useMemo(() => {
    const rng = new SeedRNG(profile.seed + '-STARS');
    const starCount = 450;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = rng.range(0, Math.PI * 2);
      const phi = rng.range(0.08, Math.PI * 0.52);
      const r = 420;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xf3e9d8,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false
    });
    return new THREE.Points(starGeo, starMat);
  }, [profile]);
  useEffect(() => () => {
    points.geometry.dispose();
    points.material.dispose();
  }, [points]);
  points.material.opacity = opacity;
  return <primitive object={points} />;
}

// --- fauna behavior + basin droplets -----------------------------------------
const _next = new THREE.Vector3();

function FaunaDriver({ world, profile }) {
  const grazers = useMemo(
    () => world.creatures.filter((c) => c.niche === 'grazer'),
    [world]
  );
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;

    // Levitating mercury droplets bob on their phase.
    for (let i = 0; i < world.drops.length; i++) {
      const drop = world.drops[i];
      drop.position.y = drop.userData.baseY + Math.sin(t * 2.2 + drop.userData.phase) * 0.35;
    }

    for (let i = 0; i < world.creatures.length; i++) {
      const c = world.creatures[i];
      const pos = c.group.position;

      if (c.niche === 'airborne') {
        // Soaring elliptical flight paths overhead
        c.orbitAngle += (c.speed * 0.035) * dt;
        const targetX = Math.cos(c.orbitAngle) * c.orbitRadius + Math.sin(t * 0.4 + c.phase) * 6;
        const targetZ = Math.sin(c.orbitAngle) * c.orbitRadius + Math.cos(t * 0.3 + c.phase) * 6;
        const targetY = c.altitudeBase + Math.sin(t * 1.4 + c.phase) * 2.5;
        _next.set(targetX, targetY, targetZ);
        if (_next.distanceToSquared(pos) > 0.0001) c.group.lookAt(_next);
        pos.copy(_next);
        c.limbs.forEach((limb) => {
          if (limb.type === 'wing') {
            limb.pivot.rotation.z =
              limb.side * Math.sin(t * 6.5 + c.phase + limb.pairIndex * 0.8) * 0.52;
          }
        });

      } else if (c.niche === 'grazer') {
        // Wander between flora nodes & graze
        const distToTarget = Math.hypot(c.targetPos.x - pos.x, c.targetPos.z - pos.z);
        if (distToTarget < 2.2 || world.floraNodes.length === 0) {
          c.state = 'Grazing Flora';
          if (Math.random() < 0.03 && world.floraNodes.length > 0) {
            const nextNode =
              world.floraNodes[Math.floor(Math.random() * world.floraNodes.length)];
            c.targetPos.set(nextNode.x, nextNode.y, nextNode.z);
            c.state = 'Foraging';
          }
        } else {
          const dirX = (c.targetPos.x - pos.x) / distToTarget;
          const dirZ = (c.targetPos.z - pos.z) / distToTarget;
          pos.x += dirX * c.speed * dt;
          pos.z += dirZ * c.speed * dt;
          pos.y = getTerrainHeight(pos.x, pos.z, profile);
          c.group.lookAt(c.targetPos.x, pos.y, c.targetPos.z);
        }
        c.limbs.forEach((limb) => {
          if (limb.type === 'leg') {
            limb.pivot.rotation.x =
              Math.sin(t * 7.0 + c.phase + limb.pairIndex * Math.PI * 0.5) *
              0.45 *
              limb.side;
          }
        });

      } else if (c.niche === 'carnivore') {
        // Stalk nearest grazer prey
        let nearestGrazer = null;
        let minDist = Infinity;
        for (let g = 0; g < grazers.length; g++) {
          const d = pos.distanceTo(grazers[g].group.position);
          if (d < minDist) {
            minDist = d;
            nearestGrazer = grazers[g];
          }
        }
        if (nearestGrazer) {
          c.state = minDist < 8 ? 'Intercepting Prey' : 'Stalking Grazer';
          const target = nearestGrazer.group.position;
          const dx = target.x - pos.x;
          const dz = target.z - pos.z;
          const len = Math.hypot(dx, dz) || 1;
          if (minDist > 3.2) {
            pos.x += (dx / len) * c.speed * dt;
            pos.z += (dz / len) * c.speed * dt;
          } else {
            pos.x += (-dz / len) * c.speed * 0.8 * dt;
            pos.z += (dx / len) * c.speed * 0.8 * dt;
          }
          pos.y = getTerrainHeight(pos.x, pos.z, profile);
          c.group.lookAt(target.x, pos.y, target.z);
        }
        c.limbs.forEach((limb) => {
          if (limb.type === 'leg') {
            limb.pivot.rotation.x =
              Math.sin(t * 9.5 + c.phase + limb.pairIndex) * 0.55 * limb.side;
          } else if (limb.type === 'claw') {
            limb.pivot.rotation.y = limb.side * Math.sin(t * 5.0 + c.phase) * 0.28;
          } else if (limb.type === 'tail') {
            limb.pivot.rotation.x = Math.sin(t * 4.5 + c.phase) * 0.25;
          }
        });

      } else if (c.niche === 'waterBorne' && c.basinRef) {
        // Swim circuits inside the brine basin
        c.orbitAngle += (c.speed * 0.14) * dt;
        const maxR = c.basinRef.radius * 0.72;
        const curR = maxR * (0.45 + 0.45 * Math.sin(t * 0.5 + c.phase));
        const wx = c.basinRef.x + Math.cos(c.orbitAngle) * curR;
        const wz = c.basinRef.z + Math.sin(c.orbitAngle) * curR;
        const wy = c.basinRef.level - 0.12 + Math.sin(t * 2.5 + c.phase) * 0.12;
        _next.set(wx, wy, wz);
        c.group.lookAt(_next);
        pos.copy(_next);
        c.state = 'Hydro-Cruising';
        c.limbs.forEach((limb) => {
          if (limb.type === 'swim_seg') {
            limb.pivot.position.x =
              Math.sin(t * 6.5 + c.phase - limb.pairIndex * 0.7) * 0.22;
          }
        });

      } else if (c.niche === 'mercuryBorne' && c.basinRef) {
        // Skim the quicksilver surface, gyro rings spinning
        c.orbitAngle -= (c.speed * 0.16) * dt;
        const maxR = c.basinRef.radius * 0.75;
        const curR = maxR * (0.35 + 0.55 * Math.cos(t * 0.65 + c.phase));
        const mx = c.basinRef.x + Math.cos(c.orbitAngle) * curR;
        const mz = c.basinRef.z + Math.sin(c.orbitAngle) * curR;
        const my = c.basinRef.level + 0.18 + Math.sin(t * 3.2 + c.phase) * 0.18;
        pos.set(mx, my, mz);
        c.state = 'Ferro-Skimming (Hg)';
        c.limbs.forEach((limb) => {
          if (limb.type === 'gyro_ring') {
            limb.pivot.rotation.x += dt * 1.8 * limb.side;
            limb.pivot.rotation.y += dt * 2.4 * (limb.pairIndex + 1) * 0.5;
          }
        });
      }
    }
  });
  return null;
}

// --- selection tracker ---------------------------------------------------------
function SelectionTracker({ world, selectedId }) {
  const holder = useRef();
  const ringGeo = useMemo(() => {
    const g = new THREE.RingGeometry(1.6, 2.05, 32);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  useEffect(() => () => ringGeo.dispose(), [ringGeo]);
  const selected = world.creatures.find((c) => c.id === selectedId) || null;
  useFrame((state) => {
    const h = holder.current;
    if (!h || !selected) return;
    h.position.copy(selected.group.position);
    h.position.y += 0.15;
    const s = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.08;
    h.scale.setScalar(s);
  });
  if (!selected) return null;
  return (
    <group ref={holder}>
      <mesh geometry={ringGeo}>
        <meshBasicMaterial color="#ffb37a" side={THREE.DoubleSide} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <Html position={[0, 3.4, 0]} center distanceFactor={46}
        style={{ pointerEvents: 'none' }}>
        <div style={{
          fontSize: 11, letterSpacing: 2, whiteSpace: 'nowrap',
          color: '#ffe3cc', textShadow: '0 1px 6px #000', fontWeight: 700,
        }}>{selected.spec.name.toUpperCase()}</div>
      </Html>
    </group>
  );
}

function creatureSummary(c) {
  return {
    id: c.id,
    niche: c.niche,
    name: c.spec.name,
    element: c.spec.element,
    diet: c.spec.diet,
    primaryColor: c.spec.primaryColor,
    secondaryColor: c.spec.secondaryColor,
    pos: [c.group.position.x, c.group.position.y, c.group.position.z]
  };
}

// --- scene composition ---------------------------------------------------------
function SceneContent({ profile, timeOfDay, mode, inputRef, focusReq, onSelect, selectedId }) {
  const orbitRef = useRef();
  const sky = useMemo(() => marsSky(profile, timeOfDay), [profile, timeOfDay]);
  const world = useMemo(() => buildWorld(profile), [profile]);
  useEffect(() => () => disposeWorld(world), [world]);
  const groundHeight = (x, z) => getTerrainHeight(x, z, profile);

  return (
    <>
      <color attach="background" args={[sky.bg]} />
      <fog attach="fog" args={[sky.fog, sky.fogNear, sky.fogFar]} />

      {/* lights */}
      <ambientLight intensity={sky.ambient} color={sky.hemiSky} />
      <hemisphereLight args={[sky.hemiSky, sky.hemiGround, 0.5]} />
      <directionalLight position={sky.sunPos} intensity={sky.sunIntensity} color={sky.sunColor} />
      {/* cool fill from the opposite side so the night never goes black */}
      <directionalLight position={[-40, 24, 40]} intensity={0.18} color="#7a86a8" />

      {/* the small pale Martian sun */}
      <mesh position={sky.sunDiscPos}>
        <sphereGeometry args={[13, 20, 20]} />
        <meshBasicMaterial color={sky.sunColor} fog={false} transparent opacity={0.35 + sky.dayF * 0.65} />
      </mesh>
      <MarsStars profile={profile} opacity={1 - sky.dayF} />

      <MarsTerrain profile={profile} />
      <OlympusMons profile={profile} />
      <MarsCgi profile={profile} dayF={sky.dayF} />
      <primitive object={world.worldGroup} />

      {world.creatures.map((c) => (
        <primitive
          key={c.id}
          object={c.group}
          onClick={(e) => { e.stopPropagation(); onSelect(creatureSummary(c)); }}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = ''; }}
        />
      ))}

      <FaunaDriver world={world} profile={profile} />
      <SelectionTracker world={world} selectedId={selectedId} />

      {mode === 'orbit' && (
        <>
          <OrbitControls ref={orbitRef} makeDefault enableDamping dampingFactor={0.08}
            maxPolarAngle={Math.PI * 0.52} minDistance={5} maxDistance={170}
            target={[0, 6, 0]} />
          <FocusRig focusReq={focusReq} orbitRef={orbitRef} />
        </>
      )}
      {mode !== 'orbit' && <FirstPerson key={mode} inputRef={inputRef} fly={mode === 'fly'} groundHeight={groundHeight} />}
    </>
  );
}

// MarsRealmContent — the surface as pure in-Canvas content (no Canvas
// of its own), for mounting inside another scene. The hub uses this:
// tapping the hub's Mars body dives INTO the planet and HomeScene
// renders this at the origin of the hub Canvas, the same way Earth
// renders inside the hub. Keyboard input (useKeys) rides along here so
// both doors — this and the standalone /mars page below — get it.
export function MarsRealmContent({ profile, timeOfDay, mode, inputRef, focusReq, onSelect, selectedId }) {
  useKeys(inputRef);
  return (
    <SceneContent
      profile={profile} timeOfDay={timeOfDay} mode={mode}
      inputRef={inputRef} focusReq={focusReq}
      onSelect={onSelect} selectedId={selectedId}
    />
  );
}

export default function MarsScene({
  profile, worldKey, timeOfDay = 0.32, mode = 'orbit',
  inputRef, focusReq, onSelect, selectedId,
}) {
  const [ready, setReady] = useState(false);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [34, 20, 46], fov: 55, near: 0.1, far: 900 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={() => setReady(true)}
      >
        <MarsRealmContent
          key={worldKey || profile.seed}
          profile={profile} timeOfDay={timeOfDay} mode={mode}
          inputRef={inputRef} focusReq={focusReq}
          onSelect={onSelect} selectedId={selectedId}
        />
      </Canvas>
      {!ready && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#ffa658', letterSpacing: 3, fontSize: 12,
        }}>SYNTHESIZING MARS…</div>
      )}
      {mode !== 'orbit' && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          color: '#ffe3cc', fontSize: 11, letterSpacing: 2, textShadow: '0 1px 4px #000',
          background: 'rgba(0,0,0,0.35)', padding: '6px 14px', borderRadius: 8,
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          {mode === 'walk' ? 'STICK / WASD MOVE · DRAG LOOK' : 'STICK / WASD MOVE · ▲▼ / SPACE / C · DRAG LOOK'}
        </div>
      )}
      {mode !== 'orbit' && <TouchControls inputRef={inputRef} fly={mode === 'fly'} />}
      {/* The backpack, standalone Mars door — top-left inside this
          scene's own container, clear of the top-centre hint bar. */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 5 }}>
        <BackpackHud realm="mars" realmLabel="Mars" docked
          displayNote="Mars keeps its own arms — the pack rides along." />
      </div>
    </div>
  );
}
