'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { planetMaps, spotSwirlTexture, cloudLayerTexture } from '@/lib/planet-cgi/textures';
import { makeDustField, updateDustField, bandFlowOffset, spinAngle, PLANET_CGI_EPOCH_MS } from '@/lib/planet-cgi/motion';
import { getParticleTexture } from '@/lib/particles/sprites';
import {
  JUPITER2_SEED, JUPITER2_SPHERE_R, EYE_HEIGHT,
  DEMOBAT_COUNT, jupiter2Sky,
} from '@/lib/jupiter2/profile';
// The full planet (Merlin, Nov 16 ~00:02): the world is a walkable
// sphere, not a flat disc — the drop, the sub-level shelf, the
// mountain and the cave all live in lib/jupiter2/planet.js.
import {
  PLANET_R, MOUNTAIN_THETA_RAD, MOUNTAIN_AZIMUTH,
  stepJupiter2Walker, spherePointFromDeck, dirToDeck,
  groundRadiusAt, groundPointAt, leverCavePoint, leverCaveMouthPoint,
  spawnPoint, auraRingPoints, moveOnSphere, dirAt,
} from '@/lib/jupiter2/planet';
import {
  AURA_R_M, WALKER_MAX_HP, createVictimState, applyStrike, burnTick,
  strikeDue, lightningColorFor,
} from '@/lib/lightning-aura';
import {
  LIGHTNING_MONSTER_MODELS, DEMOBAT_MODEL_ID, DEMOBAT_HEIGHT_M, modelUrlFor,
} from '@/lib/jupiter2/models';
import { instantiateHawkins } from '@/lib/hawkins/loader';
import { hawkinsModel } from '@/lib/hawkins/models';
import { kickOffGlb } from '@/app/hollow-earth/model-loader';
// The shared planet walker (Merlin, Nov 15, 2026 — the same
// gravity logic on every planet): Jupiter 2's walk runs on it now —
// real Jupiter gravity (24.79 m/s²) with the shared 3.0 m/s
// take-off, so the jump here is barely a hop (0.18 m apex,
// 0.24 s hang). Honest real gravity, NOT buffed. Walk speed stays
// the world's own 6 m/s (via the planet bundle). The sphere step
// itself is stepJupiter2Walker (lib/jupiter2/planet.js) — the
// shared stepSphereWalker takes a fixed radius, and this planet
// has two (88 deck, 74 shelf) plus a mountain.
import { planetParams, sphereTangentBasis, sphereSurfaceUp } from '@/lib/planet-walker';

const JUPITER_PLANET = planetParams('jupiter');
import {
  createSpeederState, summonSpeeder, dismissSpeeder, dismountSpeeder, stepSpeeder, SPEEDER_SPEED,
  SPEEDER_MOUNTED_EYE_M,
} from '@/lib/jupiter2/speeder';
import {
  createLeverState, pullLever, confirmOblivion, cancelLever, leverStatus, LEVER_GREEN,
} from '@/lib/jupiter2/lever';
import { lifeFor, homeFor, CHASE_SPEED_MPS, DEMOBAT_DIVE_SPEED_MPS } from '@/lib/jupiter2/operators';
import { flashAt, boltFor, rainBases, stormIntensity, RAIN_COUNT, WIND } from '@/lib/jupiter2/storm';
import { buildSpeeder, buildOblivionLever, buildMountain } from '@/lib/jupiter2/meshes';

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

// First-person rig on the SPHERE (Merlin, Nov 16 ~00:02 — full
// planet): the walker stands ON the sphere, feet on the ground
// radius, up = the surface normal, so the horizon tilts as you
// walk around the planet (the EarthWalkScene pattern). Walk 6 m/s
// or speeder 28 m/s; the speeder's flat (x, z) maps onto the
// sphere through spherePointFromDeck, so the summon contract is
// unchanged (Earth 1 law: dismount drops the walker back on foot
// exactly where the craft was, and the speeder vanishes). Walk off
// the drop edge and you fall 14 m to the shelf under real Jupiter
// gravity; the ramp due north is the way back up. On foot the walk
// runs on stepJupiter2Walker (variable ground radius, Jupiter
// gravity 24.79, shared 3.0 m/s take-off): Space or the page's
// JUMP button hops (0.18 m — barely a hop, honest real gravity).
function FirstPerson({ inputRef, speederRef, walkerRef, walkerStateRef, onRideChange, jumpRef }) {
  const { camera, gl } = useThree();
  const yaw = useRef(0.6);
  const pitch = useRef(-0.05);
  const feet = useRef(new THREE.Vector3());
  const dragging = useRef(false);
  const last = useRef([0, 0]);
  const wasMounted = useRef(false);
  const jumpQueued = useRef(false);
  const vrRef = useRef(0);
  const groundedRef = useRef(true);
  // The speeder's smoothed ground point: the flat (x, z) maps onto
  // the sphere, and the radius eases toward its target so driving
  // off the cliff drops instead of snapping 14 m in one frame.
  const speederPointRef = useRef(new THREE.Vector3());
  const speederInit = useRef(false);

  useEffect(() => {
    const s = spawnPoint();
    feet.current.set(s.x, s.y, s.z);
    if (walkerStateRef) walkerStateRef.current.feet = feet.current;
  }, [walkerStateRef]);

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

  // Space jumps — on foot only. A press while riding is swallowed
  // by the mounted branch below, so it never fires on dismount.
  useEffect(() => {
    const down = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        jumpQueued.current = true;
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const k = inputRef.current.keys;
    const sp = speederRef.current;
    const mounted = sp.summoned && sp.mounted;
    // Respawn: the parent's brain tick sets walkerStateRef.respawn
    // when the storm kills the walker — back at the deck, whole.
    if (walkerStateRef && walkerStateRef.current.respawn) {
      walkerStateRef.current.respawn = false;
      const s = spawnPoint();
      feet.current.set(s.x, s.y, s.z);
      vrRef.current = 0;
      groundedRef.current = true;
      yaw.current = 0.6;
      pitch.current = -0.05;
    }
    if (mounted !== wasMounted.current) {
      wasMounted.current = mounted;
      if (mounted) {
        yaw.current = sp.yaw;
        speederInit.current = false;
      } else {
        const p = spherePointFromDeck(sp.x, sp.z);
        feet.current.set(p.x, p.y, p.z);
        yaw.current = sp.yaw;
        // A dismount never resumes a stale mid-air state.
        vrRef.current = 0;
        groundedRef.current = true;
      }
      if (onRideChange) onRideChange(mounted);
    }
    if (mounted) {
      // A Space press while riding is swallowed, never queued.
      jumpQueued.current = false;
      stepSpeeder(sp, {
        fwd: k.fwd ? 1 : 0, back: k.back ? 1 : 0,
        left: k.left ? 1 : 0, right: k.right ? 1 : 0,
        boost: !!k.boost,
      }, dt);
      // The flat (x, z) maps onto the sphere by surface distance;
      // clamp it just short of the antipode (276 m) so the map
      // stays sane — the far side of the planet is the wall.
      const sr = Math.hypot(sp.x, sp.z);
      if (sr > 270) { sp.x *= 270 / sr; sp.z *= 270 / sr; }
      yaw.current = sp.yaw;
      const p = spherePointFromDeck(sp.x, sp.z);
      if (!speederInit.current) {
        speederPointRef.current.set(p.x, p.y, p.z);
        speederInit.current = true;
      } else {
        // Ease the radius toward its target: a cliff drop reads as
        // a fall, and ordinary driving is unaffected.
        const cur = speederPointRef.current;
        const curR = Math.hypot(cur.x, cur.y, cur.z);
        const targetR = Math.hypot(p.x, p.y, p.z);
        const nextR = curR + (targetR - curR) * Math.min(1, dt * 8);
        const n = Math.hypot(p.x, p.y, p.z) || 1;
        cur.set((p.x / n) * nextR, (p.y / n) * nextR, (p.z / n) * nextR);
      }
      const point = speederPointRef.current;
      const up = sphereSurfaceUp(point, PLANET_R);
      const basis = sphereTangentBasis(point, yaw.current, PLANET_R);
      const cp = Math.cos(pitch.current);
      const spn = Math.sin(pitch.current);
      camera.position.set(
        point.x + up.x * SPEEDER_MOUNTED_EYE_M,
        point.y + up.y * SPEEDER_MOUNTED_EYE_M,
        point.z + up.z * SPEEDER_MOUNTED_EYE_M,
      );
      camera.up.set(up.x, up.y, up.z);
      camera.lookAt(
        camera.position.x + (basis.forward.x * cp + up.x * spn),
        camera.position.y + (basis.forward.y * cp + up.y * spn),
        camera.position.z + (basis.forward.z * cp + up.z * spn),
      );
      if (walkerStateRef) {
        walkerStateRef.current.mounted = true;
        walkerStateRef.current.feet = point;
      }
    } else {
      const fwd = (k.fwd ? 1 : 0) - (k.back ? 1 : 0);
      const strafe = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      // The JUMP button (page HUD) arms the same edge as the Space key.
      if (jumpRef && jumpRef.current) {
        jumpQueued.current = true;
        jumpRef.current = false;
      }
      const next = stepJupiter2Walker(
        { feet: { x: feet.current.x, y: feet.current.y, z: feet.current.z }, vr: vrRef.current, grounded: groundedRef.current },
        { fwd, strafe, jump: jumpQueued.current, yaw: yaw.current },
        dt,
        JUPITER_PLANET,
      );
      jumpQueued.current = false;
      vrRef.current = next.vr;
      groundedRef.current = next.grounded;
      feet.current.set(next.feet.x, next.feet.y, next.feet.z);
      const up = sphereSurfaceUp(feet.current, PLANET_R);
      const basis = sphereTangentBasis(feet.current, yaw.current, PLANET_R);
      const cp = Math.cos(pitch.current);
      const spn = Math.sin(pitch.current);
      camera.position.set(
        feet.current.x + up.x * EYE_HEIGHT,
        feet.current.y + up.y * EYE_HEIGHT,
        feet.current.z + up.z * EYE_HEIGHT,
      );
      camera.up.set(up.x, up.y, up.z);
      camera.lookAt(
        camera.position.x + (basis.forward.x * cp + up.x * spn),
        camera.position.y + (basis.forward.y * cp + up.y * spn),
        camera.position.z + (basis.forward.z * cp + up.z * spn),
      );
      // The walker pose lives here — summon reads it, so the
      // speeder materializes at the walker's actual feet. The
      // summon contract is flat (x, z), so the feet map back to
      // deck coordinates.
      const deck = dirToDeck(feet.current);
      walkerRef.current.x = deck.x;
      walkerRef.current.z = deck.z;
      walkerRef.current.yaw = yaw.current;
      if (walkerStateRef) {
        walkerStateRef.current.mounted = false;
        walkerStateRef.current.feet = feet.current;
        walkerStateRef.current.grounded = groundedRef.current;
      }
    }
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
    color: '#9fc4d8', size: 0.14, map: getParticleTexture('drop') || undefined, transparent: true, opacity: 0.65, depthWrite: false, sizeAttenuation: true,
  }), []);
  const haze = useMemo(() => makeDustField({
    count: 520, width: 170, height: 10, depth: 170, yBase: 0.3,
    seed: JUPITER2_SEED + '-haze', color: '#c9a06a', size: 0.35, opacity: 0.4, sprite: 'mist',
  }), []);
  const murk = useMemo(() => makeDustField({
    count: 260, width: 170, height: 4, depth: 170, yBase: 0.1,
    seed: JUPITER2_SEED + '-murk', color: '#7a4a28', size: 0.5, opacity: 0.5, sprite: 'mist',
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
    // The haze and murk ride with the walker now — the world is a
    // sphere, so a dust box fixed at the origin would sit at the
    // planet's centre, not around the walker on the deck.
    const camDir = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const camR = Math.hypot(camDir.x, camDir.y, camDir.z) || 1;
    const camGround = groundPointAt({ x: camDir.x / camR, y: camDir.y / camR, z: camDir.z / camR });
    haze.position.set(camGround.x, camGround.y, camGround.z);
    murk.position.set(camGround.x, camGround.y, camGround.z);
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
    // wash, and one bolt — two on the hard flashes. The bolt is
    // anchored at the deck cap pole (its old home, near spawn):
    // the bolt's local frame is y-up from the pole's ground, so a
    // strike reads on the deck wherever the walker stands on the
    // planet. (Anchoring it at the camera would put every strike
    // at the walker's feet.)
    const flash = flashAt(now);
    if (flashLight.current) flashLight.current.intensity = flash * 8;
    washMat.opacity = flash * 0.3;
    const slot = Math.floor((now - PLANET_CGI_EPOCH_MS) / 90);
    const line = boltRef.current;
    const twin = twinRef.current;
    const poleGround = groundPointAt({ x: 0, y: 1, z: 0 });
    const toWorld = (p) => new THREE.Vector3(poleGround.x + p.x, poleGround.y + p.y, poleGround.z + p.z);
    if (line) {
      if (flash >= 0.45 && slot !== lastSlot.current) {
        lastSlot.current = slot;
        const bolt = boltFor(now);
        const pts = bolt.points.map((p) => toWorld(p));
        boltGeo.setFromPoints(pts);
        line.visible = true;
        if (twin) {
          const bolt2 = boltFor(now + 47);
          if (flash >= 0.7 && bolt2.points.length >= 8) {
            twinGeo.setFromPoints(bolt2.points.map((p) => toWorld(p)));
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
// stand-in. The creatures live on the SPHERE now (Merlin, Nov 16
// ~00:02): homes map from deck coordinates through
// spherePointFromDeck, and every step re-projects onto the ground
// radius (moveOnSphere), so a monster can walk the whole planet —
// including down the drop and past the mountain. The brain
// (brainRef, written by the parent's 500 ms tick from the operator
// life lines) steers them: a hunting monster chases its target at
// chase speed; a dead one hides and leaves remains. Each creature
// wears its lightning aura as a ring on the ground (59 m, its own
// colour) and throws a visible streak when the brain says it struck.
function Creatures({ onSelect, brainRef, creaturesRef }) {
  const monsters = useMemo(() => LIGHTNING_MONSTER_MODELS.map((model, i) => {
    const home = homeFor('lightning-monster', i);
    const homePoint = spherePointFromDeck(home.x, home.z);
    const group = new THREE.Group();
    group.position.set(homePoint.x, homePoint.y, homePoint.z);
    const ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    const remainsGeo = new THREE.CircleGeometry(1.4, 20);
    return {
      id: `lightning-monster_${i}`, kind: 'lightning-monster', index: i, model, group,
      home, homePoint, phase: i * 1.3, wander: 0, target: null,
      ringGeo, streakGeo, remainsGeo,
    };
  }), []);
  const bats = useMemo(() => Array.from({ length: DEMOBAT_COUNT }, (_, i) => {
    const home = homeFor('demobat', i);
    const homePoint = spherePointFromDeck(home.x, home.z);
    const group = new THREE.Group();
    const dir = new THREE.Vector3(homePoint.x, homePoint.y, homePoint.z).normalize();
    const alt = 14 + (i % 4) * 3;
    const r = groundRadiusAt({ x: dir.x, y: dir.y, z: dir.z }) + alt;
    group.position.set(dir.x * r, dir.y * r, dir.z * r);
    const ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    const remainsGeo = new THREE.CircleGeometry(1.2, 20);
    return {
      id: `demobat_${i}`, kind: 'demobat', index: i, group, home, homePoint,
      phase: i * 0.9, angle: i * 0.7, radius: 12 + (i % 4) * 6, handle: null,
      alt, ringGeo, streakGeo, remainsGeo,
    };
  }), []);
  const mountedRef = useRef(true);
  const kickedBats = useRef(new Set());
  const ringMats = useMemo(() => {
    const mats = {};
    for (const m of monsters) {
      const lKind = m.model.key === 'sky-dragon' || m.model.key === 'aureline' ? 'dragon' : 'lightning-monster';
      const color = lightningColorFor(lKind);
      mats[m.id] = new THREE.LineBasicMaterial({
        color: color ? color.glow : '#ffe14d', transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
    }
    for (const b of bats) {
      const color = lightningColorFor('demobat');
      mats[b.id] = new THREE.LineBasicMaterial({
        color: color ? color.glow : '#ffe14d', transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
    }
    return mats;
  }, [monsters, bats]);
  const streakMats = useMemo(() => {
    const mats = {};
    for (const m of monsters) {
      const lKind = m.model.key === 'sky-dragon' || m.model.key === 'aureline' ? 'dragon' : 'lightning-monster';
      const color = lightningColorFor(lKind);
      mats[m.id] = new THREE.LineBasicMaterial({
        color: color ? color.core : '#fffbe0', transparent: true, opacity: 0.95,
      });
    }
    for (const b of bats) {
      const color = lightningColorFor('demobat');
      mats[b.id] = new THREE.LineBasicMaterial({
        color: color ? color.core : '#fff9c4', transparent: true, opacity: 0.95,
      });
    }
    return mats;
  }, [monsters, bats]);

  useEffect(() => {
    if (creaturesRef) creaturesRef.current = { monsters, bats };
  }, [creaturesRef, monsters, bats]);

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

  // One jagged streak from a monster's chest to its target, seeded
  // by the strike instant so it holds still for its 0.3 s life.
  const streakPoints = (from, to, seedMs) => {
    let s = (seedMs % 100000) || 1;
    const rnd = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const jx = (rnd() - 0.5) * 2.2 * (i > 0 && i < 7 ? 1 : 0);
      const jy = (rnd() - 0.5) * 1.6 * (i > 0 && i < 7 ? 1 : 0);
      const jz = (rnd() - 0.5) * 2.2 * (i > 0 && i < 7 ? 1 : 0);
      pts.push(new THREE.Vector3(
        from.x + (to.x - from.x) * t + jx,
        from.y + (to.y - from.y) * t + jy,
        from.z + (to.z - from.z) * t + jz,
      ));
    }
    return pts;
  };

  useFrame((state, rawDt) => {
    const t = state.clock.elapsedTime;
    const dt = Math.min(rawDt || 0.016, 0.05);
    const now = Date.now();
    const brain = (brainRef && brainRef.current) || {};
    const upOf = (p) => {
      const r = Math.hypot(p.x, p.y, p.z) || 1;
      return { x: p.x / r, y: p.y / r, z: p.z / r };
    };
    const updateAura = (c, brainEntry) => {
      // The 59 m ring, hugging the sphere, in the creature's colour.
      const dir = upOf(c.group.position);
      const pts = auraRingPoints(dir, AURA_R_M, 48);
      const attr = c.ringGeo.getAttribute('position');
      for (let i = 0; i < 48; i++) {
        attr.array[i * 3] = pts[i].x;
        attr.array[i * 3 + 1] = pts[i].y;
        attr.array[i * 3 + 2] = pts[i].z;
      }
      attr.needsUpdate = true;
      const mat = ringMats[c.id];
      if (mat) mat.opacity = (brainEntry && brainEntry.dead) ? 0 : 0.2 + 0.12 * Math.sin(t * 2 + c.phase);
      // The streak: visible for 0.3 s after the brain says it struck.
      const strike = brainEntry && brainEntry.strike;
      const streakMat = streakMats[c.id];
      if (strike && now - strike.atMs < 300 && streakMat) {
        const up = upOf(c.group.position);
        const from = {
          x: c.group.position.x + up.x * (c.model ? c.model.heightM * 0.7 : 1.4),
          y: c.group.position.y + up.y * (c.model ? c.model.heightM * 0.7 : 1.4),
          z: c.group.position.z + up.z * (c.model ? c.model.heightM * 0.7 : 1.4),
        };
        const spts = streakPoints(from, strike.target, strike.atMs);
        const sattr = c.streakGeo.getAttribute('position');
        for (let i = 0; i < 8; i++) {
          sattr.array[i * 3] = spts[i].x;
          sattr.array[i * 3 + 1] = spts[i].y;
          sattr.array[i * 3 + 2] = spts[i].z;
        }
        sattr.needsUpdate = true;
        streakMat.opacity = 0.95;
      } else if (streakMat) {
        streakMat.opacity = 0;
      }
    };
    for (const m of monsters) {
      const entry = (brain.monsters || {})[m.id] || {};
      const dead = !!entry.dead;
      m.group.visible = !dead;
      updateAura(m, entry);
      if (dead) continue;
      const p = m.group.position;
      const up = upOf(p);
      if (entry.chasing && entry.target) {
        // The hunt: close on the target at chase speed, facing it.
        const next = moveOnSphere({ x: p.x, y: p.y, z: p.z }, entry.target, CHASE_SPEED_MPS, dt);
        m.group.up.set(up.x, up.y, up.z);
        m.group.lookAt(next.x, next.y, next.z);
        p.set(next.x, next.y, next.z);
      } else {
        // Slow wander across the deck, retargeting every few seconds.
        m.wander -= dt;
        if (m.wander <= 0 || !m.target) {
          m.wander = 4 + (m.index % 3);
          const a = t * 0.1 + m.phase;
          const deck = { x: m.home.x + Math.cos(a) * 10, z: m.home.z + Math.sin(a) * 10 };
          m.target = spherePointFromDeck(deck.x, deck.z);
        }
        const next = moveOnSphere({ x: p.x, y: p.y, z: p.z }, m.target, 1.1, dt);
        m.group.up.set(up.x, up.y, up.z);
        m.group.lookAt(next.x, next.y, next.z);
        p.set(next.x, next.y, next.z);
      }
    }
    for (const b of bats) {
      const entry = (brain.bats || {})[b.id] || {};
      const dead = !!entry.dead;
      b.group.visible = !dead;
      updateAura(b, entry);
      if (dead) continue;
      const p = b.group.position;
      const up = upOf(p);
      if (entry.chasing && entry.target) {
        // The dive: close on the walker at dive speed, dropping to
        // ~4 m above the deck so the yellow lightning can reach.
        const targetAlt = 4;
        b.alt += (targetAlt - b.alt) * Math.min(1, dt * 1.5);
        const next = moveOnSphere({ x: p.x, y: p.y, z: p.z }, entry.target, DEMOBAT_DIVE_SPEED_MPS, dt);
        const dir = upOf(next);
        const r = groundRadiusAt(dir) + b.alt;
        b.group.up.set(up.x, up.y, up.z);
        b.group.lookAt(next.x, next.y, next.z);
        p.set(dir.x * r, dir.y * r, dir.z * r);
      } else {
        b.angle += dt * 0.22;
        const basis = sphereTangentBasis(b.homePoint, 0, PLANET_R);
        const cx = b.homePoint.x + basis.right.x * Math.cos(b.angle) * b.radius + basis.forward.x * Math.sin(b.angle) * b.radius;
        const cy = b.homePoint.y + basis.right.y * Math.cos(b.angle) * b.radius + basis.forward.y * Math.sin(b.angle) * b.radius;
        const cz = b.homePoint.z + basis.right.z * Math.cos(b.angle) * b.radius + basis.forward.z * Math.sin(b.angle) * b.radius;
        const dir = upOf({ x: cx, y: cy, z: cz });
        const targetAlt = 14 + (b.index % 4) * 3;
        b.alt += (targetAlt - b.alt) * Math.min(1, dt * 0.5);
        const r = groundRadiusAt(dir) + b.alt;
        const npos = new THREE.Vector3(dir.x * r, dir.y * r, dir.z * r);
        b.group.up.set(up.x, up.y, up.z);
        b.group.lookAt(npos.x, npos.y, npos.z);
        p.copy(npos);
      }
      // The Hawkins rig flaps the arm-chain wings (2.6 Hz).
      if (b.handle && b.handle.update) b.handle.update(t, { phase: b.phase });
    }
  });

  const summary = (c) => {
    const life = lifeFor(c.kind, c.index, Date.now());
    const brain = (brainRef && brainRef.current) || {};
    const entry = ((brain.monsters || {})[c.id] || (brain.bats || {})[c.id] || {});
    return {
      id: c.id, kind: c.kind, name: life.name, niche: life.realm,
      element: c.kind === 'lightning-monster' ? 'storm' : 'air',
      diet: life.diet, habit: life.habit, stage: life.stage,
      activity: entry.dead ? 'remains' : life.activity,
      line: life.line,
      hp: entry.hp != null ? entry.hp : null,
      pos: [c.group.position.x, c.group.position.y, c.group.position.z],
    };
  };
  const remainsFor = (c) => {
    const brain = (brainRef && brainRef.current) || {};
    const entry = ((brain.monsters || {})[c.id] || (brain.bats || {})[c.id] || {});
    if (!entry.dead || !entry.deathPoint) return null;
    const d = entry.deathPoint;
    const r = Math.hypot(d.x, d.y, d.z) || 1;
    const up = { x: d.x / r, y: d.y / r, z: d.z / r };
    return { position: [d.x + up.x * 0.15, d.y + up.y * 0.15, d.z + up.z * 0.15], up };
  };
  return (
    <>
      {monsters.map((m) => {
        const rem = remainsFor(m);
        return (
          <group key={m.id}>
            <primitive object={m.group}
              onClick={(e) => { e.stopPropagation(); onSelect(summary(m)); }}
              onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
              onPointerOut={() => { document.body.style.cursor = ''; }} />
            <lineLoop geometry={m.ringGeo} material={ringMats[m.id]} frustumCulled={false} />
            <line geometry={m.streakGeo} material={streakMats[m.id]} frustumCulled={false} />
            {rem && (
              <mesh geometry={m.remainsGeo} position={rem.position}
                onUpdate={(mesh) => { mesh.lookAt(rem.position[0] + rem.up.x, rem.position[1] + rem.up.y, rem.position[2] + rem.up.z); }}>
                <meshBasicMaterial color="#140b06" transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} />
              </mesh>
            )}
          </group>
        );
      })}
      {bats.map((b) => {
        const rem = remainsFor(b);
        return (
          <group key={b.id}>
            <primitive object={b.group}
              onClick={(e) => { e.stopPropagation(); onSelect(summary(b)); }}
              onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
              onPointerOut={() => { document.body.style.cursor = ''; }} />
            <lineLoop geometry={b.ringGeo} material={ringMats[b.id]} frustumCulled={false} />
            <line geometry={b.streakGeo} material={streakMats[b.id]} frustumCulled={false} />
            {rem && (
              <mesh geometry={b.remainsGeo} position={rem.position}
                onUpdate={(mesh) => { mesh.lookAt(rem.position[0] + rem.up.x, rem.position[1] + rem.up.y, rem.position[2] + rem.up.z); }}>
                <meshBasicMaterial color="#140b06" transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
}

// --- scene content -----------------------------------------------------------
function SceneContent({ timeOfDay, mode, inputRef, speederRef, walkerRef, walkerStateRef, brainRef, creaturesRef, leverStateRef, onSelect, selectedId, onRideChange, onLever, jumpRef }) {
  const sky = useMemo(() => jupiter2Sky(timeOfDay), [timeOfDay]);
  const groundGeo = useMemo(() => {
    // The planet itself: a sphere, displaced by the ground law —
    // the deck cap at 88, the shelf at 74, the mountain bump on
    // the shelf. Every vertex sits on its ground radius, so the
    // mesh and the walker agree exactly about where the ground is.
    const g = new THREE.SphereGeometry(JUPITER2_SPHERE_R, 96, 64);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const dir = { x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) };
      const r = Math.hypot(dir.x, dir.y, dir.z) || 1;
      const groundR = groundRadiusAt({ x: dir.x / r, y: dir.y / r, z: dir.z / r });
      const s = groundR / r;
      pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s, pos.getZ(i) * s);
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
  const mountainGroup = useMemo(() => buildMountain(), []);
  // The lever stands inside the cave; the mountain rises on the
  // shelf past the drop; the beacon label hangs at the cave mouth.
  const leverPoint = useMemo(() => leverCavePoint(), []);
  const leverUp = useMemo(() => {
    const r = Math.hypot(leverPoint.x, leverPoint.y, leverPoint.z) || 1;
    return { x: leverPoint.x / r, y: leverPoint.y / r, z: leverPoint.z / r };
  }, [leverPoint]);
  const leverQuat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(leverUp.x, leverUp.y, leverUp.z),
  ), [leverUp]);
  const mouthPoint = useMemo(() => leverCaveMouthPoint(), []);
  const mouthUp = useMemo(() => {
    const r = Math.hypot(mouthPoint.x, mouthPoint.y, mouthPoint.z) || 1;
    return { x: mouthPoint.x / r, y: mouthPoint.y / r, z: mouthPoint.z / r };
  }, [mouthPoint]);
  const mountainPoint = useMemo(() => groundPointAt(dirAt(MOUNTAIN_THETA_RAD, MOUNTAIN_AZIMUTH)), []);
  const mountainQuat = useMemo(() => {
    const up = new THREE.Vector3(mountainPoint.x, mountainPoint.y, mountainPoint.z).normalize();
    const pole = new THREE.Vector3(0, JUPITER2_SPHERE_R, 0);
    const toPole = pole.clone().sub(new THREE.Vector3(mountainPoint.x, mountainPoint.y, mountainPoint.z));
    toPole.addScaledVector(up, -toPole.dot(up)).normalize();
    // Local +Z (the cave mouth) faces the pole / the drop.
    const zAxis = toPole;
    const xAxis = new THREE.Vector3().crossVectors(up, zAxis).normalize();
    const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
    const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }, [mountainPoint]);
  const spotPoint = useMemo(() => spherePointFromDeck(-42, -55), []);
  const spotQuat = useMemo(() => {
    const r = Math.hypot(spotPoint.x, spotPoint.y, spotPoint.z) || 1;
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(spotPoint.x / r, spotPoint.y / r, spotPoint.z / r),
    );
  }, [spotPoint]);
  const speederSmoothR = useRef(null);

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
  // Speeder mesh follows its state (on the sphere now, radius
  // eased so a cliff drop reads as a fall); lever arm tilts when pulled.
  useFrame(() => {
    const sp = speederRef.current;
    speederGroup.visible = sp.summoned;
    if (sp.summoned) {
      const p = spherePointFromDeck(sp.x, sp.z);
      const targetR = Math.hypot(p.x, p.y, p.z);
      if (speederSmoothR.current == null) speederSmoothR.current = targetR;
      else speederSmoothR.current += (targetR - speederSmoothR.current) * 0.2;
      const r = Math.hypot(p.x, p.y, p.z) || 1;
      const up = { x: p.x / r, y: p.y / r, z: p.z / r };
      const s = speederSmoothR.current / r;
      speederGroup.position.set(p.x * s + up.x * 0.1, p.y * s + up.y * 0.1, p.z * s + up.z * 0.1);
      const basis = sphereTangentBasis({ x: p.x, y: p.y, z: p.z }, sp.yaw, PLANET_R);
      const m = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(basis.right.x, basis.right.y, basis.right.z),
        new THREE.Vector3(up.x, up.y, up.z),
        new THREE.Vector3(-basis.forward.x, -basis.forward.y, -basis.forward.z),
      );
      speederGroup.quaternion.setFromRotationMatrix(m);
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
      {/* the planet — the whole sphere, deck cap + shelf + mountain */}
      <mesh geometry={groundGeo} material={groundMat} />
      {/* the Great Red Spot, a storm pool on the deck, slowly turning */}
      <mesh position={[spotPoint.x, spotPoint.y, spotPoint.z]} quaternion={spotQuat}>
        <circleGeometry args={[17, 40]} />
        <meshBasicMaterial map={spotTex} transparent opacity={0.9} depthWrite={false} />
      </mesh>

      <StormRig dayF={sky.dayF} />
      <Creatures onSelect={onSelect} brainRef={brainRef} creaturesRef={creaturesRef} />
      <primitive object={speederGroup} />

      {/* the mountain past the drop, cave mouth facing the drop */}
      <primitive object={mountainGroup} position={[mountainPoint.x, mountainPoint.y, mountainPoint.z]} quaternion={mountainQuat} />

      {/* the oblivion lever — inside the cave now, green, beacon-lit, clickable */}
      <primitive object={leverGroup}
        position={[leverPoint.x, leverPoint.y, leverPoint.z]} quaternion={leverQuat}
        onClick={(e) => { e.stopPropagation(); onLever(); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = ''; }}
      />
      <Html position={[mouthPoint.x + mouthUp.x * 5, mouthPoint.y + mouthUp.y * 5, mouthPoint.z + mouthUp.z * 5]} center distanceFactor={50} style={{ pointerEvents: 'none' }}>
        <div style={{ fontSize: 11, letterSpacing: 3, whiteSpace: 'nowrap', color: LEVER_GREEN, textShadow: '0 1px 6px #000', fontWeight: 700 }}>⚡ OBLIVION LEVER</div>
      </Html>

      {mode === 'orbit' && (
        <OrbitControls makeDefault enableDamping dampingFactor={0.08}
          maxPolarAngle={Math.PI * 0.52} minDistance={5} maxDistance={170} target={[0, JUPITER2_SPHERE_R, 0]} />
      )}
      {mode !== 'orbit' && (
        <FirstPerson inputRef={inputRef} speederRef={speederRef} walkerRef={walkerRef} walkerStateRef={walkerStateRef} onRideChange={onRideChange} jumpRef={jumpRef} />
      )}
    </>
  );
}

export function Jupiter2RealmContent(props) {
  useKeys(props.inputRef);
  return <SceneContent {...props} />;
}

export default function Jupiter2Scene({
  timeOfDay = 0.32, mode = 'walk', inputRef, onSelect, selectedId, jumpRef,
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
  // The walker's live 3D pose, written by the FirstPerson rig every
  // frame (feet = a Vector3 on the sphere; mounted while riding).
  // The brain tick below reads it — the tick, not the rig, owns
  // health, so the rig never decides a death.
  const walkerStateRef = useRef({ feet: null, mounted: false, grounded: true, respawn: false });
  // The brain: one entry per creature ({ hp, burn, dead, kill,
  // chasing, target, strike, deathPoint }) + the walker's own
  // victim state. Written by the 500 ms tick, read by Creatures
  // (steering, rings, streaks, remains) every frame.
  const brainRef = useRef({ walker: createVictimState(WALKER_MAX_HP), monsters: {}, bats: {} });
  const creaturesRef = useRef(null);
  const [hpUi, setHpUi] = useState({ hp: WALKER_MAX_HP, burning: false });
  const hpUiRef = useRef({ hp: WALKER_MAX_HP, burning: false });
  const [lastDeathAt, setLastDeathAt] = useState(0);
  const lastDeathAtRef = useRef(0);

  // ── the brain tick (500 ms): life lines, hunts, auras, burns ──
  // Every creature's life is recomputed from the operator conductor
  // (lifeFor) with the live positions; the tick only APPLIES what
  // the operators decide: steering targets, aura strikes, burn
  // ticks, duel losses, and the walker's own death + respawn.
  // Deaths are the operator's, not the tick's: a kill is recorded
  // once per generation (cause + diedAtMs + killer), lifeFor turns
  // it into a decomposition, and the next generation clears it.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const brain = brainRef.current;
      const creatures = creaturesRef.current;
      if (!creatures) return;
      const feet = walkerStateRef.current.feet;
      const mounted = !!walkerStateRef.current.mounted;
      const walker = feet
        ? { x: feet.x, y: feet.y, z: feet.z, alive: brain.walker.hp > 0, mounted }
        : null;
      const all = [
        ...creatures.monsters.map((c) => ({ ...c, map: 'monsters' })),
        ...creatures.bats.map((c) => ({ ...c, map: 'bats' })),
      ];
      // Pre-pass: each creature's activity (a diving demobat is
      // prey; a circling one is not) — pure clock reads.
      const activities = {};
      for (const c of all) {
        try {
          activities[c.id] = lifeFor(c.kind, c.index, now).activity;
        } catch {
          activities[c.id] = '';
        }
      }
      const others = all.map((c) => {
        const entry = (brain[c.map] || {})[c.id] || {};
        return {
          id: c.id, kind: c.kind, index: c.index,
          x: c.group.position.x, y: c.group.position.y, z: c.group.position.z,
          alive: !entry.dead,
          heightM: (c.model && c.model.heightM) || 2,
          diving: c.kind === 'demobat' && activities[c.id] === 'diving low through the rain',
        };
      });
      for (const c of all) {
        const map = brain[c.map] || (brain[c.map] = {});
        const entry = map[c.id] || (map[c.id] = {
          hp: 100, maxHp: 100, burnDps: 0, burnRemainingS: 0,
          lastStrikeMs: null, dead: false, kill: null, lastStriker: null,
          chasing: false, target: null, strike: null, deathPoint: null,
        });
        const pos = { x: c.group.position.x, y: c.group.position.y, z: c.group.position.z };
        let life;
        try {
          life = lifeFor(c.kind, c.index, now, { ...pos, walker, others, kill: entry.kill });
        } catch {
          continue;
        }
        // A new generation was born (the recorded kill belongs to
        // an older one): the slot is alive again, whole.
        if (entry.kill && entry.kill.generation < life.generation) {
          entry.kill = null;
          entry.dead = false;
          entry.hp = 100;
          entry.burnDps = 0;
          entry.burnRemainingS = 0;
          entry.deathPoint = null;
        }
        if (life.state === 'decomposing') {
          if (!entry.dead) {
            entry.dead = true;
            entry.deathPoint = { ...pos };
            entry.chasing = false;
            entry.target = null;
          }
          continue;
        }
        entry.dead = false;
        entry.deathPoint = null;
        const hunt = life.hunt || {};
        // Steering: chase the prey the operator picked.
        if (hunt.mode === 'hunt-user' || hunt.mode === 'hunt-prey' || hunt.mode === 'attack') {
          entry.chasing = true;
          entry.target = hunt.targetKind === 'walker' && walker
            ? { x: walker.x, y: walker.y, z: walker.z }
            : ((others.find((o) => o.id === hunt.target) || null));
        } else {
          entry.chasing = false;
          entry.target = null;
        }
        // The duel: the loser dies, once, for this generation.
        if (hunt.mode === 'duel' && hunt.loserSceneId === c.id && !entry.kill) {
          entry.kill = { generation: life.generation, cause: 'territorial-duel', diedAtMs: now, killerId: hunt.winnerSceneId || null };
        }
        // The aura strike: attacking, cadence open, target known.
        if (hunt.mode === 'attack' && entry.target && strikeDue(entry.lastStrikeMs, now)) {
          entry.lastStrikeMs = now;
          entry.strike = { target: { ...entry.target }, atMs: now };
          if (hunt.targetKind === 'walker') {
            brain.walker = applyStrike(brain.walker, now);
          } else {
            const preyMap = hunt.targetKind === 'demobat' ? brain.bats : brain.monsters;
            const prey = preyMap && preyMap[hunt.target];
            if (prey && !prey.dead) {
              const ns = applyStrike({
                hp: prey.hp, maxHp: 100, burnDps: prey.burnDps,
                burnRemainingS: prey.burnRemainingS, lastStrikeMs: prey.lastStrikeMs, dead: false,
              }, now);
              prey.hp = ns.hp;
              prey.burnDps = ns.burnDps;
              prey.burnRemainingS = ns.burnRemainingS;
              prey.lastStrikeMs = ns.lastStrikeMs;
              prey.lastStriker = c.id;
            }
          }
        }
        // The burn eats, 0.5 s at a time.
        if (entry.burnRemainingS > 0) {
          const ns = burnTick({
            hp: entry.hp, maxHp: 100, burnDps: entry.burnDps,
            burnRemainingS: entry.burnRemainingS, lastStrikeMs: entry.lastStrikeMs, dead: false,
          }, 0.5);
          entry.hp = ns.hp;
          entry.burnDps = ns.burnDps;
          entry.burnRemainingS = ns.burnRemainingS;
        }
        // Killed by the burn: predation, once, for this generation.
        if (entry.hp <= 0 && !entry.kill) {
          entry.kill = { generation: life.generation, cause: 'predation', diedAtMs: now, killerId: entry.lastStriker || null };
        }
      }
      // The walker's own burn + death: the storm takes them, and
      // they wake back at the deck, whole.
      if (brain.walker.burnRemainingS > 0) {
        brain.walker = burnTick(brain.walker, 0.5);
      }
      if (brain.walker.hp <= 0) {
        brain.walker = createVictimState(WALKER_MAX_HP);
        walkerStateRef.current.respawn = true;
        lastDeathAtRef.current = now;
        setLastDeathAt(now);
      }
      if (lastDeathAtRef.current && now - lastDeathAtRef.current > 5000) {
        lastDeathAtRef.current = 0;
        setLastDeathAt(0);
      }
      const nextHp = { hp: Math.round(brain.walker.hp), burning: brain.walker.burnRemainingS > 0 };
      if (nextHp.hp !== hpUiRef.current.hp || nextHp.burning !== hpUiRef.current.burning) {
        hpUiRef.current = nextHp;
        setHpUi(nextHp);
      }
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        camera={{ position: [60, 150, 60], fov: 55, near: 0.1, far: 900 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={() => setReady(true)}
      >
        <Jupiter2RealmContent
          key={JUPITER2_SEED}
          timeOfDay={timeOfDay} mode={mode}
          inputRef={inputRef} speederRef={speederRef} walkerRef={walkerRef} walkerStateRef={walkerStateRef}
          brainRef={brainRef} creaturesRef={creaturesRef} leverStateRef={leverRef}
          onSelect={onSelect} selectedId={selectedId}
          onRideChange={onRideChange} onLever={onLever} jumpRef={jumpRef}
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
          {riding ? 'SPEEDER · STICK / WASD STEER · SHIFT / BOOST' : 'STICK / WASD MOVE · DRAG LOOK · SPACE / JUMP · B SUMMON SPEEDER'}
        </div>
      )}
      {/* walker health — quiet while whole; the lightning burn shows here */}
      {mode !== 'orbit' && (hpUi.hp < WALKER_MAX_HP || hpUi.burning) && (
        <div style={{
          position: 'absolute', top: 52, left: 12, zIndex: 6,
          color: hpUi.burning ? '#ffb14d' : '#ffe3cc', fontSize: 12, letterSpacing: 2, fontWeight: 700,
          background: 'rgba(0,0,0,0.5)', padding: '6px 12px', borderRadius: 8,
          border: `1px solid ${hpUi.burning ? '#ff8c1a' : '#5a3220'}`,
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          ❤ {hpUi.hp}{hpUi.burning ? ' · 🔥 BURNING' : ''}
        </div>
      )}
      {lastDeathAt > 0 && (
        <div style={{
          position: 'absolute', top: 96, left: '50%', transform: 'translateX(-50%)', zIndex: 7,
          color: '#ffb14d', fontSize: 13, letterSpacing: 2, fontWeight: 700,
          background: 'rgba(20,5,0,0.8)', padding: '10px 18px', borderRadius: 8,
          border: '1px solid #ff8c1a', pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          THE STORM TOOK YOU — BACK AT THE DECK
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
