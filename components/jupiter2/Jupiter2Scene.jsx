'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { planetMaps, spotSwirlTexture, cloudLayerTexture } from '@/lib/planet-cgi/textures';
import { makeDustField, updateDustField, bandFlowOffset, spinAngle, PLANET_CGI_EPOCH_MS } from '@/lib/planet-cgi/motion';
import {
  JUPITER2_SEED, WALK_SPEED, MOVE_R, EYE_HEIGHT,
  LEVER_POSITION, DEMOBAT_COUNT, groundHeight, jupiter2Sky,
} from '@/lib/jupiter2/profile';
import {
  LIGHTNING_MONSTER_MODELS, DEMOBAT_MODEL_ID, DEMOBAT_HEIGHT_M, modelUrlFor,
} from '@/lib/jupiter2/models';
import { instantiateHawkins } from '@/lib/hawkins/loader';
import { hawkinsModel } from '@/lib/hawkins/models';
import { kickOffGlb } from '@/app/hollow-earth/model-loader';
import {
  createSpeederState, summonSpeeder, dismissSpeeder, dismountSpeeder, stepSpeeder, SPEEDER_SPEED,
  SPEEDER_MOUNTED_EYE_M,
} from '@/lib/jupiter2/speeder';
import {
  createLeverState, pullLever, confirmOblivion, cancelLever, leverStatus, LEVER_GREEN,
} from '@/lib/jupiter2/lever';
import { lifeFor, homeFor } from '@/lib/jupiter2/operators';
import { flashAt, boltFor, rainBases, stormIntensity, RAIN_COUNT, WIND } from '@/lib/jupiter2/storm';
import { buildSpeeder, buildOblivionLever } from '@/lib/jupiter2/meshes';

// JUPITER 2 — walkable storm surface (Merlin, Nov 15 ~01:11, spec Nov 10).
// The user stands ON the cloud deck INSIDE the storm at street level:
// wind-driven rain, seeded lightning, short storm fog. A speeder
// summons per user (Earth 1's summon contract), lightning monsters
// walk the deck, demobats circle overhead, and a glowing green
// oblivion lever stands on the deck behind a confirm gate.
// The creatures are REAL GLBs now (Merlin, Nov 15 ~14:44): the
// lightning monsters are the Monsterverse lightning seats and the
// demobats the Hawkins GLB — no WebGL placeholders. The speeder
// and the lever stay procedural. Day/night runs the shared law
// (timeOfDay01, real clock by default, page-driven like Mars).

const ACCENT = '#e8a35c';

// The Hawkins loader normalizes the demobat to its manifest height
// (7 Hawkins units); Jupiter 2 stands it DEMOBAT_HEIGHT_M tall.
const DEMOBAT_SCALE = DEMOBAT_HEIGHT_M / ((hawkinsModel(DEMOBAT_MODEL_ID) || {}).heightUnits || 7);

function useKeys(inputRef) {
  useEffect(() => {
    const down = (e) => {
      const k = e.key.toLowerCase();
      const inp = inputRef.current;
      if (k === 'w' || k === 'arrowup') inp.keys.fwd = true;
      if (k === 's' || k === 'arrowdown') inp.keys.back = true;
      if (k === 'a' || k === 'arrowleft') inp.keys.left = true;
      if (k === 'd' || k === 'arrowright') inp.keys.right = true;
      if (k === 'shift') inp.keys.boost = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    };
    const up = (e) => {
      const k = e.key.toLowerCase();
      const inp = inputRef.current;
      if (k === 'w' || k === 'arrowup') inp.keys.fwd = false;
      if (k === 's' || k === 'arrowdown') inp.keys.back = false;
      if (k === 'a' || k === 'arrowleft') inp.keys.left = false;
      if (k === 'd' || k === 'arrowright') inp.keys.right = false;
      if (k === 'shift') inp.keys.boost = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [inputRef]);
}

// First-person rig: walk (6 m/s) or speeder (28 m/s). Drag to look.
// When the speeder is mounted the rig rides it — yaw follows the
// craft, eye sits SPEEDER_MOUNTED_EYE_M up; dismount drops the walker
// back on foot exactly where the craft was (the speeder vanishes, Earth 1 law).
function FirstPerson({ inputRef, speederRef, walkerRef, onRideChange }) {
  const { camera, gl } = useThree();
  const yaw = useRef(0.6);
  const pitch = useRef(-0.05);
  const pos = useRef(new THREE.Vector3(10, EYE_HEIGHT, 26));
  const dragging = useRef(false);
  const last = useRef([0, 0]);
  const wasMounted = useRef(false);

  useEffect(() => {
    camera.rotation.order = 'YXZ';
    const el = gl.domElement;
    const s = (e) => { dragging.current = true; last.current = [e.clientX, e.clientY]; };
    const m = (e) => {
      if (!dragging.current) return;
      const dx = e.clientX - last.current[0];
      const dy = e.clientY - last.current[1];
      last.current = [e.clientX, e.clientY];
      yaw.current -= dx * 0.0042;
      pitch.current = Math.max(-1.35, Math.min(1.35, pitch.current - dy * 0.0042));
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
  }, [camera, gl]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const k = inputRef.current.keys;
    const sp = speederRef.current;
    const mounted = sp.summoned && sp.mounted;
    if (mounted !== wasMounted.current) {
      wasMounted.current = mounted;
      if (mounted) yaw.current = sp.yaw;
      else { pos.current.set(sp.x, groundHeight(sp.x, sp.z) + EYE_HEIGHT, sp.z); yaw.current = sp.yaw; }
      if (onRideChange) onRideChange(mounted);
    }
    if (mounted) {
      stepSpeeder(sp, {
        fwd: k.fwd ? 1 : 0, back: k.back ? 1 : 0,
        left: k.left ? 1 : 0, right: k.right ? 1 : 0,
        boost: !!k.boost,
      }, dt);
      const r = Math.hypot(sp.x, sp.z);
      if (r > MOVE_R) { sp.x *= MOVE_R / r; sp.z *= MOVE_R / r; }
      yaw.current = sp.yaw;
      pos.current.set(sp.x, groundHeight(sp.x, sp.z) + SPEEDER_MOUNTED_EYE_M, sp.z);
    } else {
      const fwd = (k.fwd ? 1 : 0) - (k.back ? 1 : 0);
      const strafe = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      const sin = Math.sin(yaw.current), cos = Math.cos(yaw.current);
      const p = pos.current;
      p.x += (-sin * fwd + cos * strafe) * WALK_SPEED * dt;
      p.z += (-cos * fwd - sin * strafe) * WALK_SPEED * dt;
      p.y = groundHeight(p.x, p.z) + EYE_HEIGHT;
      const r = Math.hypot(p.x, p.z);
      if (r > MOVE_R) { p.x *= MOVE_R / r; p.z *= MOVE_R / r; }
      // The walker pose lives here — summon reads it, so the
      // speeder materializes at the walker's actual feet.
      walkerRef.current.x = p.x;
      walkerRef.current.z = p.z;
      walkerRef.current.yaw = yaw.current;
    }
    camera.position.copy(pos.current);
    camera.rotation.set(pitch.current, yaw.current, 0);
  });
  return null;
}

// Touch stick — the Mars pattern: writes into the same inputRef.keys
// the keyboard fills, every key cleared on release/cancel/unmount.
export function Jupiter2TouchControls({ inputRef, riding }) {
  const stickRef = useRef(null);
  const knobRef = useRef(null);
  const activeId = useRef(null);
  const setKey = (name, v) => { if (inputRef.current) inputRef.current.keys[name] = v; };
  const clearStick = () => {
    setKey('fwd', false); setKey('back', false); setKey('left', false); setKey('right', false);
    if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)';
  };
  useEffect(() => () => { clearStick(); setKey('boost', false); }, []);
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
  return (
    <>
      <div
        ref={stickRef} role="application" aria-label="Move"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{
          position: 'absolute', bottom: 16, left: 16, width: 104, height: 104, borderRadius: '50%',
          border: '1px solid rgba(232,163,92,0.55)', background: 'rgba(18,8,4,0.38)',
          touchAction: 'none', zIndex: 6,
        }}
      >
        <div ref={knobRef} style={{
          position: 'absolute', left: '50%', top: '50%', width: 46, height: 46,
          marginLeft: -23, marginTop: -23, borderRadius: '50%',
          background: 'rgba(232,163,92,0.35)', border: '1px solid rgba(232,163,92,0.8)',
          pointerEvents: 'none',
        }} />
      </div>
      {riding && (
        <button type="button" aria-label="Boost" {...holdBtn('boost')} style={{
          position: 'absolute', right: 16, bottom: 16, width: 64, height: 64, borderRadius: '50%',
          touchAction: 'none', zIndex: 6, border: '1px solid rgba(57,200,255,0.7)',
          background: 'rgba(10,20,30,0.5)', color: '#bfe9ff', fontSize: 12, letterSpacing: 1,
        }}>BOOST</button>
      )}
    </>
  );
}

// --- storm rig: rain, lightning, haze -------------------------------------
// MORE LIGHTNING (Merlin, Nov 15 ~14:44) + the CGI atmosphere
// treatment: a drifting storm-cloud dome overhead, a low murk
// layer under the haze, a lightning-lit sky wash, and twin bolts
// on the hard flashes. Emissive flashes only — no new real lights;
// the one flash light is the existing directional, driven harder.
function StormRig({ dayF }) {
  const rainGeo = useMemo(() => {
    const bases = rainBases();
    const pos = new Float32Array(RAIN_COUNT * 3);
    bases.forEach((b, i) => { pos[i * 3] = b.x; pos[i * 3 + 1] = b.y; pos[i * 3 + 2] = b.z; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.userData.bases = bases;
    return g;
  }, []);
  const rainMat = useMemo(() => new THREE.PointsMaterial({
    color: '#9fc4d8', size: 0.14, transparent: true, opacity: 0.65, depthWrite: false, sizeAttenuation: true,
  }), []);
  const haze = useMemo(() => makeDustField({
    count: 520, width: 170, height: 10, depth: 170, yBase: 0.3,
    seed: JUPITER2_SEED + '-haze', color: '#c9a06a', size: 0.35, opacity: 0.4,
  }), []);
  const murk = useMemo(() => makeDustField({
    count: 260, width: 170, height: 4, depth: 170, yBase: 0.1,
    seed: JUPITER2_SEED + '-murk', color: '#7a4a28', size: 0.5, opacity: 0.5,
  }), []);
  const cloudMat = useMemo(() => {
    const map = cloudLayerTexture(`${JUPITER2_SEED}-storm-clouds`);
    map.needsUpdate = true;
    return new THREE.MeshBasicMaterial({
      map, transparent: true, opacity: 0.45, side: THREE.BackSide, fog: false, depthWrite: false,
    });
  }, []);
  const washMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#cfe8ff', transparent: true, opacity: 0, side: THREE.BackSide,
    fog: false, blending: THREE.AdditiveBlending, depthWrite: false,
  }), []);
  const flashLight = useRef();
  const boltRef = useRef();
  const twinRef = useRef();
  const boltGeo = useMemo(() => new THREE.BufferGeometry(), []);
  const twinGeo = useMemo(() => new THREE.BufferGeometry(), []);
  const lastSlot = useRef(-1);

  useEffect(() => () => {
    rainGeo.dispose(); rainMat.dispose(); boltGeo.dispose(); twinGeo.dispose();
    haze.geometry.dispose(); haze.material.dispose();
    murk.geometry.dispose(); murk.material.dispose();
    cloudMat.map.dispose(); cloudMat.dispose(); washMat.dispose();
  }, [rainGeo, rainMat, boltGeo, twinGeo, haze, murk, cloudMat, washMat]);

  useFrame(({ camera }) => {
    const now = Date.now();
    // Wind-driven rain: falls fast, slants with the wind, wraps
    // around the walker so the storm never runs out ahead of them.
    const attr = rainGeo.getAttribute('position');
    const arr = attr.array;
    const bases = rainGeo.userData.bases;
    const dt = 0.016;
    for (let i = 0; i < RAIN_COUNT; i++) {
      let y = arr[i * 3 + 1] - bases[i].speed * dt;
      let x = arr[i * 3] + WIND.x * dt;
      let z = arr[i * 3 + 2] + WIND.z * dt;
      if (y < 0) y += 22;
      const dx = x - camera.position.x;
      const dz = z - camera.position.z;
      if (dx > 30) x -= 60; else if (dx < -30) x += 60;
      if (dz > 30) z -= 60; else if (dz < -30) z += 60;
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
    }
    attr.needsUpdate = true;
    updateDustField(haze, now);
    haze.material.opacity = (0.2 + 0.3 * stormIntensity(now)) * (0.5 + 0.5 * dayF);
    updateDustField(murk, now);
    murk.material.opacity = (0.25 + 0.25 * stormIntensity(now)) * (0.5 + 0.5 * dayF);
    // The storm-cloud dome drifts with the wind, a touch faster
    // than the sky bands beneath it (the kit's cloud law: clouds
    // turn ~1.35x the surface).
    cloudMat.map.offset.x = bandFlowOffset(0.004, now);
    cloudMat.map.needsUpdate = true;
    // Lightning: the seeded flash drives the real light, the sky
    // wash, and one bolt — two on the hard flashes.
    const flash = flashAt(now);
    if (flashLight.current) flashLight.current.intensity = flash * 8;
    washMat.opacity = flash * 0.3;
    const slot = Math.floor((now - PLANET_CGI_EPOCH_MS) / 90);
    const line = boltRef.current;
    const twin = twinRef.current;
    if (line) {
      if (flash >= 0.45 && slot !== lastSlot.current) {
        lastSlot.current = slot;
        const bolt = boltFor(now);
        const pts = bolt.points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
        boltGeo.setFromPoints(pts);
        line.visible = true;
        if (twin) {
          const bolt2 = boltFor(now + 47);
          if (flash >= 0.7 && bolt2.points.length >= 8) {
            twinGeo.setFromPoints(bolt2.points.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
            twin.visible = true;
          } else {
            twin.visible = false;
          }
        }
      } else if (flash < 0.2) {
        line.visible = false;
        if (twin) twin.visible = false;
      }
    }
  });

  return (
    <>
      <points geometry={rainGeo} material={rainMat} frustumCulled={false} />
      <primitive object={haze} />
      <primitive object={murk} />
      {/* storm-cloud dome — textured cloud streaks overhead, drifting */}
      <mesh material={cloudMat}>
        <sphereGeometry args={[380, 32, 24]} />
      </mesh>
      {/* lightning-lit sky — the whole dome flares with each crack */}
      <mesh material={washMat}>
        <sphereGeometry args={[410, 32, 24]} />
      </mesh>
      <directionalLight ref={flashLight} position={[20, 50, -10]} intensity={0} color="#cfe8ff" />
      <line ref={boltRef} geometry={boltGeo} visible={false}>
        <lineBasicMaterial color="#d6ecff" transparent opacity={0.95} />
      </line>
      <line ref={twinRef} geometry={twinGeo} visible={false}>
        <lineBasicMaterial color="#d6ecff" transparent opacity={0.95} />
      </line>
    </>
  );
}

// --- creatures ---------------------------------------------------------------
// REAL MODELS now (Merlin, Nov 15 ~14:44) — no placeholders. The
// lightning monsters are the Monsterverse lightning seats, the
// demobats the Hawkins GLB. Each creature owns a holder group the
// driver moves; the GLB mounts inside it once its load lands, so
// a creature is simply absent until its model arrives — never a
// stand-in. No death law: they persist (operators.js).
function Creatures({ onSelect }) {
  const monsters = useMemo(() => LIGHTNING_MONSTER_MODELS.map((model, i) => {
    const home = homeFor('lightning-monster', i);
    const group = new THREE.Group();
    group.position.set(home.x, groundHeight(home.x, home.z), home.z);
    return { id: `lightning-monster_${i}`, kind: 'lightning-monster', index: i, model, group, home, phase: i * 1.3, wander: 0, tx: home.x, tz: home.z };
  }), []);
  const bats = useMemo(() => Array.from({ length: DEMOBAT_COUNT }, (_, i) => {
    const home = homeFor('demobat', i);
    const group = new THREE.Group();
    group.position.set(home.x, 14 + (i % 4) * 3, home.z);
    return { id: `demobat_${i}`, kind: 'demobat', index: i, group, home, phase: i * 0.9, angle: i * 0.7, radius: 12 + (i % 4) * 6, handle: null };
  }), []);
  const mountedRef = useRef(true);
  const kickedBats = useRef(new Set());

  useEffect(() => {
    mountedRef.current = true;
    // Monsterverse lightning GLBs into the monster holders — the
    // drop-in loader scales each to its design height, varied a
    // touch per slot so the two Voltas do not read as twins.
    monsters.forEach((m, i) => {
      const heightM = m.model.heightM * (0.95 + (i % 3) * 0.08);
      kickOffGlb(m.group, modelUrlFor(m.model.key), heightM);
    });
    // Hawkins demobats — one shared download, one independent
    // skeleton clone each, wings flapped by the Hawkins rig.
    bats.forEach((b) => {
      if (kickedBats.current.has(b.id)) return;
      kickedBats.current.add(b.id);
      instantiateHawkins(DEMOBAT_MODEL_ID).then((handle) => {
        if (!mountedRef.current || !handle) return;
        handle.group.scale.setScalar(DEMOBAT_SCALE);
        b.group.add(handle.group);
        b.handle = handle;
      }).catch(() => {});
    });
    return () => {
      mountedRef.current = false;
      bats.forEach((b) => { if (b.handle) { b.handle.dispose(); b.handle = null; } });
      // The lightning clones stay owned by the model-loader cache —
      // their geometries are shared with the cached master scene and
      // must not be disposed here.
    };
  }, [monsters, bats]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (const m of monsters) {
      // Slow wander across the deck, retargeting every few seconds.
      m.wander -= 0.016;
      if (m.wander <= 0) {
        m.wander = 4 + (m.index % 3);
        const a = t * 0.1 + m.phase;
        m.tx = m.home.x + Math.cos(a) * 10;
        m.tz = m.home.z + Math.sin(a) * 10;
      }
      const p = m.group.position;
      const dx = m.tx - p.x, dz = m.tz - p.z;
      const len = Math.hypot(dx, dz) || 1;
      p.x += (dx / len) * 1.1 * 0.016;
      p.z += (dz / len) * 1.1 * 0.016;
      p.y = groundHeight(p.x, p.z);
      // The GLBs face +Z in bind pose (Hollow Earth faceYaw law:
      // faceYaw = atan2 of travel), so this walks them forward.
      m.group.rotation.y = Math.atan2(dx, dz);
    }
    for (const b of bats) {
      b.angle += 0.016 * 0.22;
      const p = b.group.position;
      const nx = b.home.x + Math.cos(b.angle) * b.radius;
      const nz = b.home.z + Math.sin(b.angle) * b.radius;
      const ny = 13 + Math.sin(t * 0.7 + b.phase) * 3.5;
      const npos = new THREE.Vector3(nx, ny, nz);
      b.group.lookAt(npos);
      p.copy(npos);
      // The Hawkins rig flaps the arm-chain wings (2.6 Hz).
      if (b.handle && b.handle.update) b.handle.update(t, { phase: b.phase });
    }
  });

  const summary = (c) => {
    const life = lifeFor(c.kind, c.index, Date.now());
    return {
      id: c.id, kind: c.kind, name: life.name, niche: life.realm,
      element: c.kind === 'lightning-monster' ? 'storm' : 'air',
      diet: life.diet, habit: life.habit, stage: life.stage,
      activity: life.activity, pos: [c.group.position.x, c.group.position.y, c.group.position.z],
    };
  };
  return (
    <>
      {monsters.map((m) => (
        <primitive key={m.id} object={m.group}
          onClick={(e) => { e.stopPropagation(); onSelect(summary(m)); }}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = ''; }} />
      ))}
      {bats.map((b) => (
        <primitive key={b.id} object={b.group}
          onClick={(e) => { e.stopPropagation(); onSelect(summary(b)); }}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = ''; }} />
      ))}
    </>
  );
}

// --- scene content -----------------------------------------------------------
function SceneContent({ timeOfDay, mode, inputRef, speederRef, walkerRef, leverStateRef, onSelect, selectedId, onRideChange, onLever }) {
  const sky = useMemo(() => jupiter2Sky(timeOfDay), [timeOfDay]);
  const groundGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(220, 220, 96, 96);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)));
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const groundMat = useMemo(() => {
    const maps = planetMaps('gasGiant', JUPITER2_SEED);
    const map = maps.map.clone();
    map.needsUpdate = true;
    map.repeat.set(9, 9);
    const bump = maps.bumpMap.clone();
    bump.needsUpdate = true;
    bump.repeat.set(9, 9);
    return new THREE.MeshStandardMaterial({
      map, bumpMap: bump, bumpScale: maps.bumpScale, roughness: maps.roughness,
    });
  }, []);
  const skyMat = useMemo(() => {
    const maps = planetMaps('gasGiant', JUPITER2_SEED);
    const map = maps.map.clone();
    map.needsUpdate = true;
    map.repeat.set(2, 1);
    return new THREE.MeshBasicMaterial({ map, side: THREE.BackSide, fog: false });
  }, []);
  const spotTex = useMemo(() => {
    const tex = spotSwirlTexture();
    tex.center.set(0.5, 0.5);
    return tex;
  }, []);
  const speederGroup = useMemo(() => buildSpeeder(), []);
  const leverGroup = useMemo(() => buildOblivionLever(), []);

  useEffect(() => () => {
    groundGeo.dispose(); groundMat.dispose(); skyMat.dispose(); spotTex.dispose();
  }, [groundGeo, groundMat, skyMat, spotTex]);

  // Sky bands flow + the Red Spot swirls on the device clock.
  useFrame(() => {
    const now = Date.now();
    skyMat.map.offset.x = bandFlowOffset(0.003, now);
    skyMat.map.needsUpdate = true;
    // The Great Red Spot turns slowly — a full turn in ~5 min.
    spotTex.rotation = spinAngle(0.02, now);
  });
  // Speeder mesh follows its state; lever arm tilts when pulled.
  useFrame(() => {
    const sp = speederRef.current;
    speederGroup.visible = sp.summoned;
    if (sp.summoned) {
      speederGroup.position.set(sp.x, groundHeight(sp.x, sp.z) + 0.1, sp.z);
      speederGroup.rotation.y = sp.yaw;
      speederGroup.userData.glowMat.opacity = 0.6 + Math.min(1, Math.abs(sp.speed) / SPEEDER_SPEED) * 0.4;
    }
    const arm = leverGroup.userData.arm;
    if (arm) {
      const target = leverStateRef.current.pulled ? -0.9 : 0;
      arm.rotation.x += (target - arm.rotation.x) * 0.08;
    }
    // The beacon breathes so it reads through the rain.
    const t = Date.now() / 1000;
    leverGroup.userData.beaconMat.opacity = 0.13 + 0.06 * Math.sin(t * 1.8);
  });

  return (
    <>
      <color attach="background" args={[sky.bg]} />
      <fog attach="fog" args={[sky.fogColor, sky.fogNear, sky.fogFar]} />
      <ambientLight intensity={sky.ambient} color={sky.hemiSky} />
      <hemisphereLight args={[sky.hemiSky, sky.hemiGround, 0.5]} />
      <directionalLight position={sky.sunPos} intensity={sky.sunIntensity} color={sky.sunColor} />
      <directionalLight position={[-40, 24, 40]} intensity={0.15} color="#7a86a8" />

      {/* storm sky dome — Jupiter's bands overhead, flowing */}
      <mesh material={skyMat}>
        <sphereGeometry args={[420, 32, 24]} />
      </mesh>
      {/* the cloud deck */}
      <mesh geometry={groundGeo} material={groundMat} />
      {/* the Great Red Spot, a storm pool on the deck, slowly turning */}
      <mesh position={[-42, groundHeight(-42, -55) + 0.15, -55]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[17, 40]} />
        <meshBasicMaterial map={spotTex} transparent opacity={0.9} depthWrite={false} />
      </mesh>

      <StormRig dayF={sky.dayF} />
      <Creatures onSelect={onSelect} />
      <primitive object={speederGroup} />

      {/* the oblivion lever — green, beacon-lit, clickable */}
      <primitive object={leverGroup}
        position={[LEVER_POSITION.x, groundHeight(LEVER_POSITION.x, LEVER_POSITION.z), LEVER_POSITION.z]}
        onClick={(e) => { e.stopPropagation(); onLever(); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = ''; }}
      />
      <Html position={[LEVER_POSITION.x, groundHeight(LEVER_POSITION.x, LEVER_POSITION.z) + 5, LEVER_POSITION.z]} center distanceFactor={50} style={{ pointerEvents: 'none' }}>
        <div style={{ fontSize: 11, letterSpacing: 3, whiteSpace: 'nowrap', color: LEVER_GREEN, textShadow: '0 1px 6px #000', fontWeight: 700 }}>⚡ OBLIVION LEVER</div>
      </Html>

      {mode === 'orbit' && (
        <OrbitControls makeDefault enableDamping dampingFactor={0.08}
          maxPolarAngle={Math.PI * 0.52} minDistance={5} maxDistance={170} target={[0, 6, 0]} />
      )}
      {mode !== 'orbit' && (
        <FirstPerson inputRef={inputRef} speederRef={speederRef} walkerRef={walkerRef} onRideChange={onRideChange} />
      )}
    </>
  );
}

export function Jupiter2RealmContent(props) {
  useKeys(props.inputRef);
  return <SceneContent {...props} />;
}

export default function Jupiter2Scene({
  timeOfDay = 0.32, mode = 'walk', inputRef, onSelect, selectedId,
}) {
  const [ready, setReady] = useState(false);
  const speederRef = useRef(createSpeederState());
  const leverRef = useRef(createLeverState());
  // The walker's live pose, written by the FirstPerson rig every
  // frame on foot — summon reads it so the speeder appears at the
  // walker's actual feet, not at the origin.
  const walkerRef = useRef({ x: 10, z: 26, yaw: 0.6 });
  const [riding, setRiding] = useState(false);
  const [leverUi, setLeverUi] = useState({ phase: 'idle', countdown: null });

  const summon = () => {
    const sp = speederRef.current;
    if (sp.summoned) { dismissSpeeder(sp); setRiding(false); return; }
    summonSpeeder(sp, walkerRef.current);
    setRiding(true);
  };
  const dismount = () => {
    const sp = speederRef.current;
    dismountSpeeder(sp);
    setRiding(false);
  };
  const onRideChange = (mounted) => setRiding(mounted);

  const onLever = () => {
    const lv = leverRef.current;
    const res = pullLever(lv, Date.now());
    if (res.action === 'already-armed') {
      setLeverUi(leverStatus(lv, Date.now()));
      return;
    }
    setLeverUi({ phase: 'warned', countdown: null });
  };
  const confirmLever = () => {
    const lv = leverRef.current;
    const rec = confirmOblivion(lv, Date.now());
    if (rec.armed) setLeverUi({ phase: 'armed', countdown: rec.countdown });
    else setLeverUi(leverStatus(lv, Date.now()));
  };
  const cancelLeverUi = () => {
    cancelLever(leverRef.current);
    setLeverUi({ phase: 'idle', countdown: null });
  };

  // B = summon/dismiss the speeder, E = dismount — Earth 1's keys.
  useEffect(() => {
    const down = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'b') summon();
      else if (k === 'e' && speederRef.current.summoned) dismount();
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Armed countdown ticks once a second while armed.
  useEffect(() => {
    if (leverUi.phase !== 'armed') return undefined;
    const id = setInterval(() => setLeverUi(leverStatus(leverRef.current, Date.now())), 1000);
    return () => clearInterval(id);
  }, [leverUi.phase]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [34, 20, 46], fov: 55, near: 0.1, far: 900 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={() => setReady(true)}
      >
        <Jupiter2RealmContent
          key={JUPITER2_SEED}
          timeOfDay={timeOfDay} mode={mode}
          inputRef={inputRef} speederRef={speederRef} walkerRef={walkerRef} leverStateRef={leverRef}
          onSelect={onSelect} selectedId={selectedId}
          onRideChange={onRideChange} onLever={onLever}
        />
      </Canvas>
      {!ready && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: ACCENT, letterSpacing: 3, fontSize: 12,
        }}>ENTERING THE STORM…</div>
      )}
      {mode !== 'orbit' && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          color: '#ffe3cc', fontSize: 11, letterSpacing: 2, textShadow: '0 1px 4px #000',
          background: 'rgba(0,0,0,0.35)', padding: '6px 14px', borderRadius: 8,
          pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5,
        }}>
          {riding ? 'SPEEDER · STICK / WASD STEER · SHIFT / BOOST' : 'STICK / WASD MOVE · DRAG LOOK · B SUMMON SPEEDER'}
        </div>
      )}
      {mode !== 'orbit' && <Jupiter2TouchControls inputRef={inputRef} riding={riding} />}
      {/* speeder summon — the Earth 1 button, per user */}
      {mode !== 'orbit' && (
        <div style={{ position: 'absolute', right: 12, top: 12, zIndex: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" onClick={summon} aria-label={riding ? 'Dismiss speeder' : 'Summon speeder'}
            style={{
              minHeight: 44, padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${riding ? '#39c8ff' : ACCENT}`, background: riding ? '#0a2a3a' : '#1c0d06',
              color: riding ? '#bfe9ff' : '#f6e8da', fontSize: 12, letterSpacing: 2, fontWeight: 700,
            }}>
            {riding ? '🛸 DISMISS SPEEDER' : '🛸 SUMMON SPEEDER'}
          </button>
          {riding && (
            <button type="button" onClick={dismount} aria-label="Dismount speeder"
              style={{
                minHeight: 44, padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
                border: '1px solid #5a3220', background: '#1c0d06',
                color: '#f6e8da', fontSize: 12, letterSpacing: 2,
              }}>
              ⏏ DISMOUNT
            </button>
          )}
          {leverUi.phase === 'armed' && (
            <div style={{
              padding: '8px 12px', borderRadius: 8, border: '1px solid #22ff66',
              background: 'rgba(4,26,12,0.9)', color: '#22ff66', fontSize: 11, letterSpacing: 1,
            }}>
              OBLIVION ARMED<br />{leverUi.countdown}
            </div>
          )}
        </div>
      )}
      {/* oblivion warning — the gate: pull alone never arms it */}
      {leverUi.phase === 'warned' && (
        <div role="alertdialog" aria-label="Oblivion warning"
          style={{
            position: 'absolute', inset: 0, zIndex: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)', padding: 16,
          }}>
          <div style={{
            maxWidth: 420, background: '#160a04', border: '2px solid #22ff66', borderRadius: 12, padding: 20,
          }}>
            <h2 style={{ margin: '0 0 8px', color: '#22ff66', letterSpacing: 2, fontSize: 18 }}>⚠ OBLIVION</h2>
            <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.5, color: '#f6e8da' }}>
              You pulled the oblivion lever. Confirming arms oblivion for Jupiter 2 and starts the
              72-hour countdown — the world will be destroyed at the end of it. This cannot be
              undone by tapping again.
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 12, lineHeight: 1.5, color: '#c99a78' }}>
              Nothing has happened yet. Standing down leaves Jupiter 2 exactly as it is.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={confirmLever}
                style={{
                  minHeight: 44, padding: '10px 18px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid #22ff66', background: '#22ff66', color: '#041a0c',
                  fontWeight: 700, fontSize: 13, letterSpacing: 1,
                }}>
                CONFIRM OBLIVION
              </button>
              <button type="button" onClick={cancelLeverUi}
                style={{
                  minHeight: 44, padding: '10px 18px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid #5a3220', background: '#1c0d06', color: '#f6e8da',
                  fontSize: 13, letterSpacing: 1,
                }}>
                STAND DOWN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
