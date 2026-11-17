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
import { planetParams, sphereTangentBasis, sphereSurfaceUp, lookTurnForDrag, dampLookAngle, LOOK_PITCH_MAX, recenterLookOffset, lookOffsetFromHeading } from '@/lib/planet-walker';

const JUPITER_PLANET = planetParams('jupiter');
import {
  createSpeederState, summonSpeeder, dismissSpeeder, dismountSpeeder, stepSpeeder, SPEEDER_SPEED,
  SPEEDER_MOUNTED_EYE_M,
} from '@/lib/jupiter2/speeder';
import {
  createLeverState, pullLever, confirmOblivion, cancelLever, leverStatus, LEVER_GREEN,
} from '@/lib/jupiter2/lever';
import { lifeFor, homeFor, CHASE_SPEED_MPS, DEMOBAT_DIVE_SPEED_MPS } from '@/lib/jupiter2/operators';
// Elemental orbs + speeder blaster + shields (Merlin, Nov 16 ~01:16,
// round 2 workstream 7): the drop/collect/trade/shoot/shield law
// lives in lib/jupiter2/elemental-orbs.js — this file only wires it
// into the brain tick, the speeder and the HUD.
import {
  ORB_ELEMENTS, createOrbDrop, pruneOrbs, collectOrbs,
  totalOrbs, addOrb, spendOrbs,
  SHIELD_TIERS, SHIELD_RECHARGE_COST, shieldTierFor, buyShieldTier,
  BLASTER_TIERS, BLASTER_CONE_DEG, blasterTierFor, blasterReady, buyBlasterTier,
  applyBlasterHit, strikeWalkerWithShield, burnTickWithShield,
  loadProgress, saveProgress,
} from '@/lib/jupiter2/elemental-orbs';
import { recordSoulArrival } from '@/lib/land-of-the-dead/souls';
import { flashAt, boltFor, rainBases, stormIntensity, RAIN_COUNT, WIND } from '@/lib/jupiter2/storm';
import { buildSpeeder, buildOblivionLever, buildMountain } from '@/lib/jupiter2/meshes';
import OrbButton, { OrbLabel } from '@/components/world/OrbButton';
import { useOrbDock } from '@/components/world/useOrbDock';
// The ONE backpack (Merlin, Nov 16 — the J2 layout): BackpackHud is
// the shared mount Hollow Earth and Middle-earth wear — the BACKPACK
// orb above JUMP opens this same pack, never a second one. The FIRE
// orb fires the weapon this pack arms, read at strike time through
// the store (useBackpack / equippedWeaponEntry), the Hollow
// Earth / Middle-earth pattern.
import BackpackHud from '@/components/backpack/BackpackHud';
import { useBackpack } from '@/lib/backpack/store';
import { equippedWeaponEntry, equippedDamageForSlot, weaponHand } from '@/lib/backpack/backpack';

// JUPITER 2 — walkable storm surface (Merlin, Nov 15 ~01:11, spec Nov 10).
// The user stands ON the cloud deck INSIDE the storm at street level:
// wind-driven rain, seeded lightning, short storm fog. A speeder
// summons per user (Earth 1's summon contract), lightning monsters
// walk the deck, demobats circle overhead, and a glowing green
// oblivion lever stands on the deck behind a confirm gate.
// The creatures are REAL GLBs now (Merlin, Nov 15 ~14:44): the
// lightning monsters are the Monsterverse lightning seats and the
// demobats the Hawkins GLB — no WebGL placeholders. The speeder
// is the real Star Wars landspeeder GLB now (Merlin, Nov 16
// ~01:11); the lever stays procedural. Day/night runs the shared law
// (timeOfDay01, real clock by default, page-driven like Mars).

const ACCENT = '#e8a35c';

// Orb dock sizes (lib/world/orb-dock.js — the one shared mechanism,
// also used by Hollow Earth): px side per draggable orb in this
// scene — boost/shoot/fire 64, summon/trade 56, dismount 64. The
// stick is NOT dock-owned any more (Merlin, Nov 16 — the J2 layout:
// fixed bottom-left, never moves), so it has no entry here.
const J2_SCENE_ORB_SIZES = { boost: 64, shoot: 64, fire: 64, summon: 56, dismount: 64, trade: 56 };

// The Hawkins loader normalizes the demobat to its manifest height
// (7 Hawkins units); Jupiter 2 stands it DEMOBAT_HEIGHT_M tall.
const DEMOBAT_SCALE = DEMOBAT_HEIGHT_M / ((hawkinsModel(DEMOBAT_MODEL_ID) || {}).heightUnits || 7);

// Level pitch for the mounted camera (the −0.05 the rig starts at):
// the auto-center eases the pitch target back here, never to 0.
const LOOK_LEVEL_PITCH = -0.05;

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
// gravity; the way back up is the ramp due north (the easy way)
// or straight up the cliff scarp itself — a steep climbable
// slope, not a wall — and the speeder rides the whole planet
// with no clamp at the far side. On foot the walk
// runs on stepJupiter2Walker (variable ground radius, Jupiter
// gravity 24.79, shared 3.0 m/s take-off): Space or the page's
// JUMP button hops (0.18 m — barely a hop, honest real gravity).
function FirstPerson({ inputRef, speederRef, walkerRef, walkerStateRef, onRideChange, jumpRef }) {
  const { camera, gl } = useThree();
  const yaw = useRef(0.6);
  const pitch = useRef(-0.05);
  // Gentle look (Merlin, Nov 16, 2026 — the Moon's round-3 law, which
  // Jupiter 2 never got): the drag sets a TARGET and the frame loop
  // eases the camera toward it. The targets start at the arrival
  // angles, and every place that re-aims the camera (respawn, mount,
  // dismount, the mounted heading follow) re-aims the targets too,
  // so the ease never drags the view back to a stale angle.
  const yawTarget = useRef(0.6);
  const pitchTarget = useRef(-0.05);
  // Mounted heading follow: the speeder's yaw from the previous
  // frame, so only its CHANGE is folded into the look target —
  // steering turns the view smoothly instead of snapping it, and
  // a drag-look offset while riding survives (it is relative to
  // the heading, not overwritten by it).
  const prevSpYaw = useRef(0);
  // Auto-center (Merlin, Nov 16 ~02:43 — UNIFY, shared helper in
  // lib/planet-walker.js): true while the mounted view is easing
  // back to forward after a look-drag. Set on release (see the
  // look handler below), cleared by a new drag, by mounting /
  // dismounting, and by respawn.
  const recenterRef = useRef(false);
  const feet = useRef(new THREE.Vector3());
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

  // Gentle look (Merlin, Nov 16, 2026 — the Moon's round-3 law):
  // the old code wrote the angle STRAIGHT from the drag at a fixed
  // 0.0042 rad/px (mouse) / 0.005 rad/px (touch), with separate
  // mouse + touch handlers sharing one flag — so a thumb drag
  // snapped the camera, a coalesced touchmove delta could jump it
  // ~30° in one frame, and on touch devices the emulated mouse
  // events could drive both handlers at once (0.0092 rad/px).
  // One pointer handler now serves touch drag and desktop mouse
  // drag alike, the turn is a fraction of the screen
  // (lookTurnForDrag: one full-width swipe turns half a circle),
  // and the drag moves only the TARGET — the frame loop eases the
  // camera toward it (dampLookAngle, 20/s), so the view follows
  // the finger instead of whipping after it. The Moon's scene
  // carries this same law (components/MoonScene.jsx).
  useEffect(() => {
    camera.rotation.order = 'YXZ';
    const el = gl.domElement;
    const anchor = { x: 0, y: 0 };
    let dragging = false;
    let moved = false; // this press actually dragged the look (a tap never starts a recenter)
    const onDown = (e) => {
      dragging = true;
      moved = false;
      // A new drag cancels the ease back to forward.
      recenterRef.current = false;
      anchor.x = e.clientX;
      anchor.y = e.clientY;
    };
    const onMove = (e) => {
      if (!dragging) return;
      moved = true;
      // Each event applies only its own delta (the anchor is
      // re-set below), so the turn never compounds.
      //
      // DIRECTION, PROVEN FROM THE RIG (Merlin, Nov 16 — the camera
      // turning was inverted on his phone): yaw+ turns RIGHT —
      // sphereTangentBasis forward is (sin yaw, −cos yaw), so yaw+
      // swings the view from −Z toward +X, the walker's right — so
      // a drag right (dx > 0) must ADD to the yaw target. The old
      // SUBTRACT turned the view left: grab-the-world. Pitch was
      // already right and is untouched: pitch+ lifts the gaze
      // (lookAt adds up·sin(pitch)), so a drag down (dy > 0) must
      // SUBTRACT to look down. The gaze follows the finger on both
      // axes now; the recenter below is untouched.
      const w = el.clientWidth || window.innerWidth || 1;
      yawTarget.current += lookTurnForDrag(e.clientX - anchor.x, w);
      pitchTarget.current = Math.max(
        -LOOK_PITCH_MAX,
        Math.min(LOOK_PITCH_MAX, pitchTarget.current - lookTurnForDrag(e.clientY - anchor.y, w))
      );
      anchor.x = e.clientX;
      anchor.y = e.clientY;
    };
    const onUp = () => {
      dragging = false;
      // Release after a real look-drag while riding: ease back to
      // forward (the shared auto-center in lib/planet-walker.js).
      // A tap never starts it, and neither does a press on an orb
      // (the canvas never saw its pointerdown, so moved is false).
      if (moved) {
        const sp = speederRef.current;
        if (sp && sp.summoned && sp.mounted) recenterRef.current = true;
      }
      moved = false;
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
      yawTarget.current = 0.6;
      pitchTarget.current = -0.05;
      recenterRef.current = false;
    }
    if (mounted !== wasMounted.current) {
      wasMounted.current = mounted;
      recenterRef.current = false;
      if (mounted) {
        yaw.current = sp.yaw;
        yawTarget.current = sp.yaw;
        prevSpYaw.current = sp.yaw;
        speederInit.current = false;
      } else {
        const p = spherePointFromDeck(sp.x, sp.z);
        feet.current.set(p.x, p.y, p.z);
        yaw.current = sp.yaw;
        yawTarget.current = sp.yaw;
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
        // Analog steer from the touch stick (null/undefined while
        // the stick is untouched, so WASD keeps its binary keys).
        steer: inputRef.current.steer,
      }, dt);
      // The flat (x, z) maps onto the sphere by surface distance;
      // there is NO wall at the far side: the planet wraps, so a
      // speeder driven past the antipode comes back around through
      // deckToDir instead of being clamped and turned back.
      //
      // The heading steers the look TARGET by its own change, and
      // the frame eases the camera toward it below — the old code
      // hard-set yaw.current = sp.yaw every frame, which ate any
      // drag-look while riding and snapped the whole world around
      // at the full 2.2 rad/s steering rate. Steering now turns
      // the view smoothly, and a drag-look offset while riding
      // survives as an offset from the heading.
      yawTarget.current += sp.yaw - prevSpYaw.current;
      prevSpYaw.current = sp.yaw;
      // Auto-center (Merlin, Nov 16 ~02:43 — UNIFY): the shared
      // recenterLookOffset (lib/planet-walker.js) decays the look
      // offset — yaw from the speeder's heading, pitch from level —
      // toward zero at LOOK_RECENTER_RATE (0.8/s: 95% back in
      // ~3.75 s, most of a 90° look-aside gone in ~2 s). SLOW, never
      // a snap; steering still folds the heading in above, so the
      // ease composes with turning, and a new drag cancels it.
      if (recenterRef.current) {
        const eased = recenterLookOffset(
          {
            yaw: lookOffsetFromHeading(yawTarget.current, sp.yaw),
            pitch: pitchTarget.current - LOOK_LEVEL_PITCH,
          },
          dt,
        );
        yawTarget.current = sp.yaw + eased.yaw;
        pitchTarget.current = LOOK_LEVEL_PITCH + eased.pitch;
        if (Math.abs(eased.yaw) < 0.005 && Math.abs(eased.pitch) < 0.005) {
          yawTarget.current = sp.yaw;
          pitchTarget.current = LOOK_LEVEL_PITCH;
          recenterRef.current = false;
        }
      }
      yaw.current = dampLookAngle(yaw.current, yawTarget.current, dt);
      pitch.current = dampLookAngle(pitch.current, pitchTarget.current, dt);
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
      // Gentle look on foot: ease the camera toward the drag
      // target (the Moon's law) before stepping the walker, so
      // the walker turns where the eased camera looks.
      yaw.current = dampLookAngle(yaw.current, yawTarget.current, dt);
      pitch.current = dampLookAngle(pitch.current, pitchTarget.current, dt);
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
export function Jupiter2TouchControls({ inputRef, riding, onShoot, onFire, panelOpen, orbDock }) {
  const stickRef = useRef(null);
  const knobRef = useRef(null);
  const activeId = useRef(null);
  const setKey = (name, v) => { if (inputRef.current) inputRef.current.keys[name] = v; };
  const clearStick = () => {
    setKey('fwd', false); setKey('back', false); setKey('left', false); setKey('right', false);
    // The stick is untouched again: the analog steer goes back to
    // null (not 0), so WASD steering works again — a 0 would keep
    // overriding the keys in stepSpeeder.
    if (inputRef.current) inputRef.current.steer = null;
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
    // Analog steer for the speeder (Merlin, Nov 16, 2026): the old
    // stick was digital — any left hold, however slight, turned
    // the speeder at the full 2.2 rad/s, which is the spin in his
    // video (the knob sat up-left in every frame). The steer is
    // the stick's sideways deflection, +1 full left to −1 full
    // right, with a small dead zone, so a slight hold turns
    // gently and only a hard hold turns at full rate. Null while
    // the stick is untouched (see clearStick), so WASD keeps its
    // binary steering. On foot this is unused — walking takes the
    // digital keys, as before.
    const raw = dx / max; // −1 (full left) .. +1 (full right)
    const mag = Math.abs(raw);
    const scaled = mag < 0.12 ? 0 : Math.min(1, (mag - 0.12) / 0.88);
    // Push right steers right (verified against
    // lib/jupiter2/speeder.js: steer is +1 = full left and it
    // SUBTRACTS from the yaw, and yaw+ is right — so a right push
    // must emit a negative steer). Do not flip this sign.
    if (inputRef.current) inputRef.current.steer = -scaled * Math.sign(raw);
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
  const boostHold = holdBtn('boost');
  return (
    <>
      {/* The stick is FIXED bottom-left (Merlin, Nov 16 — the J2
          layout): it steers, it never moves. The old dock drag is
          gone — no bind, no styleFor, no recentre-on-drag — so a
          thumb sliding off the stick can never park it somewhere
          else. Bottom-left is the universal joystick spot. */}
      <div
        ref={stickRef} role="application" aria-label="Move"
        onPointerDown={onDown}
        onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onLostPointerCapture={onUp}
        style={{
          position: 'absolute', left: 16, bottom: 16, zIndex: 6,
          width: 104, height: 104, borderRadius: '50%',
          border: '1px solid rgba(232,163,92,0.55)', background: 'rgba(18,8,4,0.38)',
          touchAction: 'none',
        }}
      >
        <div ref={knobRef} style={{
          position: 'absolute', left: '50%', top: '50%', width: 46, height: 46,
          marginLeft: -23, marginTop: -23, borderRadius: '50%',
          background: 'rgba(232,163,92,0.35)', border: '1px solid rgba(232,163,92,0.8)',
          pointerEvents: 'none',
        }} />
      </div>
      {/* BOOST parks ABOVE the SHOOT orb (bottom 88, SHOOT ends at
          bottom 76) in the riding column — it used to park above
          JUMP, but JUMP moved up the column (Merlin, Nov 16 — the
          J2 layout: FIRE below it, BACKPACK above it), and BOOST at
          the old bottom 104 would sit on top of JUMP while riding.
          JUMP and BOOST now sit side by side at bottom 88, each its
          own circle orb, one label per orb, never overlapping. */}
      {riding && (
        <button type="button" aria-label="Boost"
          {...orbDock.bind('boost', {
            onPointerDown: boostHold.onPointerDown,
            // A drag is not a boost: release the key the moment the
            // press becomes a drag.
            onDragStart: () => setKey('boost', false),
          })}
          onPointerUp={boostHold.onPointerUp}
          onPointerCancel={boostHold.onPointerCancel}
          onLostPointerCapture={boostHold.onLostPointerCapture}
          style={{
            ...orbDock.styleFor('boost', { right: 104, bottom: 88 }),
            width: 64, height: 64, borderRadius: '50%',
            touchAction: 'none', border: '1px solid rgba(57,200,255,0.7)',
            background: 'rgba(10,20,30,0.5)', color: '#bfe9ff', fontSize: 12, letterSpacing: 1,
          }}>BOOST</button>
      )}
      {/* SHOOT — the speeder blaster (Merlin, Nov 16 ~01:16). Its own
          plain circle orb, LEFT of the page's JUMP orb: JUMP spans
          right 12–88, SHOOT spans right 104–168 (16 px clear), and
          below BOOST (bottom 88) — so it never overlaps either.
          Riding only; on foot the blaster is inactive, so no orb.
          Tap to fire; the blaster's own cooldown paces repeat shots. */}
      {riding && onShoot && (
        <OrbButton size={64} onClick={() => { if (orbDock.tapGuard()) return; onShoot(); }} ariaLabel="Shoot the speeder blaster"
          accent="#39c8ff"
          {...orbDock.bind('shoot', {})}
          style={orbDock.styleFor('shoot', { right: 104, bottom: 12 })}>
          <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>🎯</span>
          <OrbLabel>SHOOT</OrbLabel>
        </OrbButton>
      )}
      {/* FIRE — the on-foot attack (Merlin, Nov 16 — the J2 layout):
          walking mode only, UNDER the page's JUMP orb in the right
          column (JUMP sits at bottom 88, FIRE at bottom 12, the
          BACKPACK orb above JUMP at bottom 176). It fires the weapon
          the user has equipped in their backpack. Riding uses SHOOT
          (the speeder blaster) instead, so this orb never shows
          while mounted — and it hides while a creature panel owns
          the bottom of the stage, like JUMP. fn="fire" wears the
          TRON reticle face (tron-reticle.webp). */}
      {!riding && onFire && !panelOpen && (
        <OrbButton size={64} fn="fire" onClick={() => { if (orbDock.tapGuard()) return; onFire(); }} ariaLabel="Fire your equipped weapon"
          accent="#ff5f4d"
          {...orbDock.bind('fire', {})}
          style={orbDock.styleFor('fire', { right: 12, bottom: 12 })}>
          <OrbLabel>FIRE</OrbLabel>
        </OrbButton>
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

// --- elemental orbs in the world -------------------------------------------
// Dropped orbs float above the deck where the monster died, bobbing in
// their element colour, until the walker collects them or they fade
// (120 s). Pure presentation: the brain tick owns spawn/collect.
function ElementalOrbField({ orbs }) {
  const groupRef = useRef();
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const t = Date.now() / 1000;
    g.children.forEach((mesh, i) => {
      const orb = (orbs || [])[i];
      if (!orb) return;
      const r = Math.hypot(orb.x, orb.y, orb.z) || 1;
      const bob = 0.9 + Math.sin(t * 2 + i * 1.7) * 0.25;
      mesh.position.set(orb.x + (orb.x / r) * bob, orb.y + (orb.y / r) * bob, orb.z + (orb.z / r) * bob);
    });
  });
  return (
    <group ref={groupRef}>
      {(orbs || []).map((orb) => {
        const def = ORB_ELEMENTS[orb.element] || ORB_ELEMENTS.storm;
        return (
          <mesh key={orb.id} position={[orb.x, orb.y, orb.z]}>
            <sphereGeometry args={[0.35, 16, 12]} />
            <meshBasicMaterial color={def.core} transparent opacity={0.95} />
          </mesh>
        );
      })}
    </group>
  );
}

// The blaster bolt: a short-lived cyan line from the speeder's nose
// to the shot's endpoint, drawn for 150 ms after fireBlaster records
// the shot in blasterRef. Presentation only — the hit is already
// applied when the shot is recorded.
function BlasterBolt({ blasterRef }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    return g;
  }, []);
  const lineRef = useRef();
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(() => {
    const line = lineRef.current;
    if (!line) return;
    const shot = blasterRef && blasterRef.current && blasterRef.current.lastShot;
    const fresh = shot && Date.now() - shot.atMs < 150;
    line.visible = !!fresh;
    if (!fresh) return;
    const attr = geo.getAttribute('position');
    attr.array[0] = shot.from.x; attr.array[1] = shot.from.y; attr.array[2] = shot.from.z;
    attr.array[3] = shot.to.x; attr.array[4] = shot.to.y; attr.array[5] = shot.to.z;
    attr.needsUpdate = true;
  });
  return (
    <line ref={lineRef} geometry={geo} visible={false} frustumCulled={false}>
      <lineBasicMaterial color="#7df9ff" transparent opacity={0.95} />
    </line>
  );
}

// --- scene content -----------------------------------------------------------
function SceneContent({ timeOfDay, mode, inputRef, speederRef, walkerRef, walkerStateRef, brainRef, creaturesRef, leverStateRef, onSelect, selectedId, onRideChange, onLever, jumpRef, orbs, blasterRef }) {
  const sky = useMemo(() => jupiter2Sky(timeOfDay), [timeOfDay]);
  const groundGeo = useMemo(() => {
    // The planet itself: a sphere, displaced by the ground law —
    // the deck cap at 88, the shelf at 74, the cliff a steep
    // climbable scarp between them, the mountain bump on the
    // shelf. Every vertex sits on its ground radius, so the
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
    // Soft jets: the gas-giant map's hard jet steps read on the
    // sky as pale flat rectangles (Merlin, Nov 16 — the "ash/dust"
    // flecks); the ground shares the same cached map, so it gets
    // the same soft jets.
    const maps = planetMaps('gasGiant', JUPITER2_SEED, { softJets: true });
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
    // Soft jets (see groundMat): the sky dome is where the hard
    // jet steps showed as pale rectangles, so it wears the
    // feathered map.
    const maps = planetMaps('gasGiant', JUPITER2_SEED, { softJets: true });
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
  // The lever label's anchor (8 m above the cave mouth) and its
  // close-range fade (Merlin, Nov 16 — J2 overlap fix): the label
  // used to wear a distanceFactor of 50, which scales it by distance
  // — gigantic and clipped when close (it filled the whole screen
  // at the lever, running behind the top UI), unreadably small far
  // away. It now renders at one constant readable size, and hides
  // inside 25 m — at the lever the green beacon and the lever
  // itself say what it is, and the sign can never sit on top of a
  // control. The flip is a state change only when the camera
  // crosses the threshold, never per frame.
  const labelAnchor = useMemo(() => new THREE.Vector3(
    mouthPoint.x + mouthUp.x * 8, mouthPoint.y + mouthUp.y * 8, mouthPoint.z + mouthUp.z * 8,
  ), [mouthPoint, mouthUp]);
  const [labelFar, setLabelFar] = useState(true);
  const labelFarRef = useRef(true);
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
  useFrame((state) => {
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
      // The outer flame brightens at speed (as the old underglow
      // did); the plume itself is dark parked and lit only while
      // driving — the Star Wars landspeeder law (zone.js): length
      // grows with speed, width flickers.
      speederGroup.userData.glowMat.opacity = 0.6 + Math.min(1, Math.abs(sp.speed) / SPEEDER_SPEED) * 0.4;
      const flame = speederGroup.userData.flame;
      if (flame) {
        const driving = Math.abs(sp.speed) > 1;
        flame.group.visible = driving;
        if (driving) {
          const tt = Date.now() / 1000;
          const ratio = Math.min(1, Math.abs(sp.speed) / SPEEDER_SPEED);
          const flick = 0.85 + 0.25 * Math.sin(tt * 29 + flame.phase)
            + 0.12 * Math.sin(tt * 47 + flame.phase * 1.3);
          const w = Math.max(0.4, flick);
          flame.outer.scale.set(w, (0.7 + 0.6 * ratio) * flick, w);
          flame.inner.scale.set(w, (0.6 + 0.5 * ratio) * flick, w);
        }
      }
    }
    const arm = leverGroup.userData.arm;
    if (arm) {
      const target = leverStateRef.current.pulled ? -0.9 : 0;
      arm.rotation.x += (target - arm.rotation.x) * 0.08;
    }
    // The beacon breathes so it reads through the rain.
    const t = Date.now() / 1000;
    leverGroup.userData.beaconMat.opacity = 0.13 + 0.06 * Math.sin(t * 1.8);
    // The lever label hides up close (see labelAnchor above): the
    // sign is for finding the cave from the deck, not for standing
    // at the lever — inside 25 m it would sit on top of the HUD.
    const far = state.camera.position.distanceTo(labelAnchor) > 25;
    if (far !== labelFarRef.current) {
      labelFarRef.current = far;
      setLabelFar(far);
    }
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
      <ElementalOrbField orbs={orbs} />
      <BlasterBolt blasterRef={blasterRef} />
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
      {/* The lever label — one constant readable size, never scaled
          by distance (the old distanceFactor of 50 blew it up to
          full-screen at the lever and shrank it to nothing from
          the deck), and hidden inside 25 m (see the useFrame
          above), so it can never run behind or over a control.
          zIndexRange keeps it under the HUD orbs either way. */}
      {labelFar && (
        <Html position={[mouthPoint.x + mouthUp.x * 8, mouthPoint.y + mouthUp.y * 8, mouthPoint.z + mouthUp.z * 8]} center zIndexRange={[2, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{ fontSize: 11, letterSpacing: 3, whiteSpace: 'nowrap', color: LEVER_GREEN, textShadow: '0 1px 6px #000', fontWeight: 700 }}>⚡ OBLIVION LEVER</div>
        </Html>
      )}

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
  timeOfDay = 0.32, mode = 'walk', inputRef, onSelect, selectedId, jumpRef, shootRef = null,
  stageSize = null, exclusions = null,
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
  const [hpUi, setHpUi] = useState({ hp: WALKER_MAX_HP, burning: false, shield: 0, shieldMax: 0 });
  const hpUiRef = useRef({ hp: WALKER_MAX_HP, burning: false, shield: 0, shieldMax: 0 });
  const [lastDeathAt, setLastDeathAt] = useState(0);
  const lastDeathAtRef = useRef(0);

  // ── elemental orbs + blaster + shields (Merlin, Nov 16 ~01:16) ──
  // Progress loads once from device-local storage (no server table,
  // no SQL) and every change saves straight back. Refs are the
  // truth inside the 500 ms tick (its closure never re-runs); the
  // *Ui states are only mirrors for rendering.
  const [initialProgress] = useState(() => loadProgress());
  const walletRef = useRef(initialProgress.orbs);
  const [walletUi, setWalletUi] = useState(initialProgress.orbs);
  const shieldRef = useRef({
    tier: initialProgress.shieldTier,
    max: shieldTierFor(initialProgress.shieldTier).max,
    current: initialProgress.shield,
  });
  const [shieldUi, setShieldUi] = useState({
    tier: initialProgress.shieldTier,
    max: shieldTierFor(initialProgress.shieldTier).max,
    current: initialProgress.shield,
  });
  const blasterRef = useRef({ tier: initialProgress.blasterTier, lastShotMs: null, lastShot: null });
  const [blasterUi, setBlasterUi] = useState({ tier: initialProgress.blasterTier });
  // The on-foot FIRE cooldown (the blaster's own lastShotMs paces the
  // speeder shot; the foot strike keeps its own clock).
  const lastFootStrikeRef = useRef(0);
  // Live orbs on the deck: the ref is the truth in the tick, the
  // state is what SceneContent renders.
  const orbsRef = useRef([]);
  const [orbsUi, setOrbsUi] = useState([]);
  const prevFeetRef = useRef(null);
  const [notice, setNotice] = useState(null);
  const noticeRef = useRef(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  // The backpack's equipped weapon, read at FIRE time (a ref so the
  // key handler's closure never goes stale when the traveller equips
  // mid-hunt — the Hollow Earth / Middle-earth pattern).
  const pack = useBackpack();
  const equippedRef = useRef(null);
  useEffect(() => { equippedRef.current = equippedWeaponEntry(pack); }, [pack]);
  // The control-instructions hint fades after 5 s (Merlin, Nov 16 —
  // the J2 layout): it shows on entry and re-shows whenever the mode
  // changes (walk ↔ speeder, walk ↔ orbit), then eases out. It does
  // NOT re-show on respawn — the death banner already speaks there.
  const [hintOn, setHintOn] = useState(true);
  useEffect(() => {
    setHintOn(true);
    const t = setTimeout(() => setHintOn(false), 5000);
    return () => clearTimeout(t);
  }, [riding, mode]);
  // Orb dock (Merlin, Nov 16 ~02:35 — the Hollow Earth mirror): the
  // scene's orbs drag individually and persist per user under
  // `olympus:jupiter-2:orb-dock:v1` (lib/world/orb-dock.js, the one
  // shared mechanism — Hollow Earth uses the same module). The page
  // owns the JUMP orb's instance; the ids are disjoint, and every
  // save merges against a fresh storage read, so neither instance
  // can clobber the other's newer save. The page measures the stage
  // and passes the backpack's fixed home slot as an exclusion
  // (lib/jupiter2/hud-layout.js): no dock orb may park on the
  // backpack, and a stored spot already covering it is repaired
  // back to its home (Merlin, Nov 16 — J2 overlap fix).
  const dock = useOrbDock('jupiter-2', J2_SCENE_ORB_SIZES, { stageSize, exclusions });

  // Show a short centred notice for 3 s (the tick clears it).
  const showNotice = (text) => {
    const atMs = Date.now();
    noticeRef.current = { text, atMs };
    setNotice({ text, atMs });
  };
  // Write the refs out to UI state + localStorage after any
  // wallet / shield / blaster change.
  const syncProgressUi = () => {
    setWalletUi({ ...walletRef.current });
    setShieldUi({ ...shieldRef.current });
    setBlasterUi({ tier: blasterRef.current.tier });
    setHpUi((prev) => ({ ...prev, shield: shieldRef.current.current, shieldMax: shieldRef.current.max }));
    hpUiRef.current = { ...hpUiRef.current, shield: shieldRef.current.current, shieldMax: shieldRef.current.max };
    saveProgress({
      orbs: walletRef.current,
      shieldTier: shieldRef.current.tier,
      blasterTier: blasterRef.current.tier,
      shield: shieldRef.current.current,
    });
  };

  // ── the speeder blaster (Merlin, Nov 16 ~01:16) ──
  // SHOOT orb press handler — the orb lives in Jupiter2TouchControls
  // (its own plain circle, left of JUMP, below BOOST) and calls this
  // through onShoot; F fires it too, and the optional shootRef prop
  // exposes it to the page. On foot it is inactive;
  // riding, it auto-aims at the nearest live monster inside the
  // tier's range and a 35° cone off the speeder's nose, and applies
  // the tier's damage. The kill itself is recorded by the brain tick
  // (cause 'user-kill', killerId 'user') — the tick is the one place
  // a drop spawns.
  const fireBlaster = () => {
    const sp = speederRef.current;
    const now = Date.now();
    if (!sp.summoned || !sp.mounted) return { ok: false, reason: 'on-foot' };
    const tier = blasterTierFor(blasterRef.current.tier);
    if (!blasterReady(blasterRef.current.lastShotMs, now, blasterRef.current.tier)) {
      return { ok: false, reason: 'cooldown' };
    }
    blasterRef.current.lastShotMs = now;
    const creatures = creaturesRef.current;
    const ground = walkerStateRef.current.feet
      ? { x: walkerStateRef.current.feet.x, y: walkerStateRef.current.feet.y, z: walkerStateRef.current.feet.z }
      : spherePointFromDeck(sp.x, sp.z);
    // The bolt leaves from the nose, ~1 m above the deck.
    const gr = Math.hypot(ground.x, ground.y, ground.z) || 1;
    const from = {
      x: ground.x + (ground.x / gr) * 1.0,
      y: ground.y + (ground.y / gr) * 1.0,
      z: ground.z + (ground.z / gr) * 1.0,
    };
    const basis = sphereTangentBasis(from, sp.yaw, PLANET_R);
    const fwd = basis.forward;
    const fwdLen = Math.hypot(fwd.x, fwd.y, fwd.z) || 1;
    const fx = fwd.x / fwdLen;
    const fy = fwd.y / fwdLen;
    const fz = fwd.z / fwdLen;
    const cosCone = Math.cos((BLASTER_CONE_DEG * Math.PI) / 180);
    let best = null;
    if (creatures) {
      const all = [
        ...creatures.monsters.map((c) => ({ ...c, map: 'monsters' })),
        ...creatures.bats.map((c) => ({ ...c, map: 'bats' })),
      ];
      for (const c of all) {
        const entry = (brainRef.current[c.map] || {})[c.id];
        if (!entry || entry.dead || entry.hp <= 0) continue;
        const p = c.group.position;
        const dx = p.x - from.x;
        const dy = p.y - from.y;
        const dz = p.z - from.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > tier.rangeM || d <= 0) continue;
        const cos = (dx * fx + dy * fy + dz * fz) / d;
        if (cos < cosCone) continue;
        if (!best || d < best.d) best = { c, entry, d, p: { x: p.x, y: p.y, z: p.z } };
      }
    }
    // The bolt flies to the target, or to max range along the nose on a miss.
    const to = best
      ? best.p
      : { x: from.x + fx * tier.rangeM, y: from.y + fy * tier.rangeM, z: from.z + fz * tier.rangeM };
    blasterRef.current.lastShot = { from: { ...from }, to, atMs: now };
    if (!best) return { ok: true, hit: false };
    const res = applyBlasterHit(best.entry, tier.dmg);
    best.entry.hp = res.hp;
    best.entry.lastStriker = 'user';
    return { ok: true, hit: true, killed: res.killed, target: best.c.id };
  };

  // ── the on-foot attack (Merlin, Nov 16 — the J2 layout) ──
  // FIRE = ATTACK: the FIRE orb (walking mode only) fires the weapon
  // the user has equipped in their backpack — the same hand the
  // backpack arms in Hollow Earth / Middle-earth, read at strike
  // time so an equip mid-hunt takes effect at once. No weapon, or a
  // weapon with no hand: the orb says so and does nothing. Spec
  // mirrors Hollow Earth's weaponSpec (melee 2.4 m / wide arc /
  // 0.45 s, ranged 40 m / narrow cone / 0.8 s); a rated weapon deals
  // its rating, an unrated one the J2 native 20. The strike is the
  // blaster's shape on foot: the nearest live monster inside the arc
  // takes the damage straight onto its brain entry with lastStriker
  // 'user' — so the brain tick records the kill and drops the
  // elemental orb exactly like a blaster kill. The cyan bolt draws
  // through blasterRef, the same line the speeder shot wears.
  const fireOnFoot = () => {
    const sp = speederRef.current;
    if (sp.summoned && sp.mounted) return { ok: false, reason: 'riding' };
    const now = Date.now();
    const equipped = equippedRef.current;
    const hand = equipped ? weaponHand(equipped) : null;
    if (!equipped || !hand) {
      showNotice('⚔ NO WEAPON EQUIPPED — OPEN THE BACKPACK');
      return { ok: false, reason: 'no-weapon' };
    }
    const melee = hand === 'melee';
    const dmg = equippedDamageForSlot(equipped, hand) ?? 20;
    const range = melee ? 2.4 : 40;
    const arcCos = Math.cos(melee ? 1.22 : 0.21);
    const cooldownMs = melee ? 450 : 800;
    if (now - lastFootStrikeRef.current < cooldownMs) return { ok: false, reason: 'cooldown' };
    lastFootStrikeRef.current = now;
    const feet = walkerStateRef.current.feet;
    if (!feet) return { ok: false, reason: 'no-feet' };
    // The walker's forward on the sphere, from the live yaw the rig
    // writes every frame — the same basis the camera looks along.
    const yaw = walkerRef.current.yaw || 0;
    const basis = sphereTangentBasis(feet, yaw, PLANET_R);
    const fwd = basis.forward;
    const fwdLen = Math.hypot(fwd.x, fwd.y, fwd.z) || 1;
    const fx = fwd.x / fwdLen;
    const fy = fwd.y / fwdLen;
    const fz = fwd.z / fwdLen;
    // The bolt leaves from chest height above the deck, like the blaster's.
    const gr = Math.hypot(feet.x, feet.y, feet.z) || 1;
    const from = {
      x: feet.x + (feet.x / gr) * 1.0,
      y: feet.y + (feet.y / gr) * 1.0,
      z: feet.z + (feet.z / gr) * 1.0,
    };
    let best = null;
    const creatures = creaturesRef.current;
    if (creatures) {
      const all = [
        ...creatures.monsters.map((c) => ({ ...c, map: 'monsters' })),
        ...creatures.bats.map((c) => ({ ...c, map: 'bats' })),
      ];
      for (const c of all) {
        const entry = (brainRef.current[c.map] || {})[c.id];
        if (!entry || entry.dead || entry.hp <= 0) continue;
        const p = c.group.position;
        const dx = p.x - from.x;
        const dy = p.y - from.y;
        const dz = p.z - from.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > range || d <= 0) continue;
        const cos = (dx * fx + dy * fy + dz * fz) / d;
        if (cos < arcCos) continue;
        if (!best || d < best.d) best = { c, entry, d, p: { x: p.x, y: p.y, z: p.z } };
      }
    }
    const to = best
      ? best.p
      : { x: from.x + fx * range, y: from.y + fy * range, z: from.z + fz * range };
    blasterRef.current.lastShot = { from: { ...from }, to, atMs: now };
    if (!best) return { ok: true, hit: false };
    best.entry.hp -= dmg;
    best.entry.lastStriker = 'user';
    if (best.entry.hp <= 0) {
      let name = best.c.kind;
      try { name = lifeFor(best.c.kind, best.c.index, now).name; } catch { /* keep kind */ }
      showNotice(`⚔ ${String(name).toUpperCase()} FALLS`);
    }
    return { ok: true, hit: true, killed: best.entry.hp <= 0, target: best.c.id };
  };

  // F fires whichever hand the user is in: the speeder blaster while
  // riding, the equipped backpack weapon on foot (the FIRE orb calls
  // fireOnFoot directly; the SHOOT orb calls fireBlaster directly).
  const fireWeapon = () => {
    const sp = speederRef.current;
    return (sp.summoned && sp.mounted) ? fireBlaster() : fireOnFoot();
  };

  // ── the deck trade (Merlin, Nov 16 ~01:16) ──
  // Buys spend orbs from the wallet (any mix, storm → dragon →
  // demobat) and persist immediately. Buying a shield tier refills
  // it to the new max; buying a blaster tier takes effect on the
  // next shot.
  const buyShield = (tier) => {
    const res = buyShieldTier(walletRef.current, shieldRef.current.tier, tier);
    if (!res.ok) {
      showNotice(res.reason === 'need-orbs' ? `⬡ NEED ${shieldTierFor(tier).cost} ORBS FOR THAT SHIELD` : '⬡ SHIELD ALREADY OWNED');
      return;
    }
    walletRef.current = res.wallet;
    const max = shieldTierFor(res.tier).max;
    shieldRef.current = { tier: res.tier, max, current: max };
    syncProgressUi();
    showNotice(`🛡️ ${shieldTierFor(res.tier).label.toUpperCase()} — SHIELD ${max}`);
  };
  const buyBlaster = (tier) => {
    const res = buyBlasterTier(walletRef.current, blasterRef.current.tier, tier);
    if (!res.ok) {
      showNotice(res.reason === 'need-orbs' ? `⬡ NEED ${blasterTierFor(tier).cost} ORBS FOR THAT BLASTER` : '⬡ BLASTER ALREADY OWNED');
      return;
    }
    walletRef.current = res.wallet;
    blasterRef.current.tier = res.tier;
    syncProgressUi();
    showNotice(`🔫 ${blasterTierFor(res.tier).label.toUpperCase()} — ${blasterTierFor(res.tier).dmg} DMG`);
  };
  const rechargeShield = () => {
    if (shieldRef.current.tier === 0) { showNotice('⬡ NO SHIELD TO RECHARGE — BUY ONE FIRST'); return; }
    if (shieldRef.current.current >= shieldRef.current.max) { showNotice('🛡️ SHIELD ALREADY FULL'); return; }
    const next = spendOrbs(walletRef.current, SHIELD_RECHARGE_COST);
    if (!next) { showNotice(`⬡ NEED ${SHIELD_RECHARGE_COST} ORBS TO RECHARGE`); return; }
    walletRef.current = next;
    shieldRef.current.current = shieldRef.current.max;
    syncProgressUi();
    showNotice(`🛡️ SHIELD RECHARGED TO ${shieldRef.current.max}`);
  };

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
          // A demobat hunts ground monsters only while diving low
          // itself — its clock activity rides in ctx.diving.
          life = lifeFor(c.kind, c.index, now, {
            ...pos, walker, others, kill: entry.kill,
            diving: c.kind === 'demobat' && activities[c.id] === 'diving low through the rain',
          });
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
            // Shield first (elemental orbs): the bought shield
            // absorbs the strike hit before HP does.
            const shielded = strikeWalkerWithShield(brain.walker, shieldRef.current.current, now);
            brain.walker = shielded.walker;
            shieldRef.current.current = shielded.shield;
            if (shielded.shieldBroken) showNotice('🛡️ SHIELD BROKEN');
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
        // Killed: predation, once, for this generation — or a USER
        // kill when the blaster struck last (fireBlaster only deals
        // damage; this tick records the kill, and ONLY a user kill
        // drops an elemental orb, at the death point).
        if (entry.hp <= 0 && !entry.kill) {
          const userKill = entry.lastStriker === 'user';
          entry.kill = { generation: life.generation, cause: userKill ? 'user-kill' : 'predation', diedAtMs: now, killerId: entry.lastStriker || null };
          // The Land of the Dead (Merlin, Nov 16 ~04:02): every
          // death arrives there — user-kill, predation and duel
          // alike. This block runs once per generation's kill.
          let soulName = c.kind;
          try { soulName = lifeFor(c.kind, c.index, now).name; } catch { /* keep kind */ }
          recordSoulArrival({ kind: c.kind === 'demobat' ? 'creature' : 'monster', name: soulName, origin: 'jupiter-2', diedAt: now });
          if (userKill) {
            const orb = createOrbDrop({ kind: c.kind, index: c.index, position: pos, nowMs: now });
            if (orb) {
              orbsRef.current = pruneOrbs([...orbsRef.current, orb], now);
              setOrbsUi(orbsRef.current);
            }
          }
        }
      }
      // The walker's own burn + death: the storm takes them, and
      // they wake back at the deck, whole. Burn ticks route through
      // the shield first, like strikes.
      if (brain.walker.burnRemainingS > 0) {
        const shielded = burnTickWithShield(brain.walker, shieldRef.current.current, 0.5);
        brain.walker = shielded.walker;
        shieldRef.current.current = shielded.shield;
        if (shielded.shieldBroken) showNotice('🛡️ SHIELD BROKEN');
      }
      if (brain.walker.hp <= 0) {
        brain.walker = createVictimState(WALKER_MAX_HP);
        // Death refills the bought shield to its tier max (the
        // capacity is owned; the charge is what breaks).
        shieldRef.current.current = shieldRef.current.max;
        walkerStateRef.current.respawn = true;
        lastDeathAtRef.current = now;
        setLastDeathAt(now);
        recordSoulArrival({ kind: 'user', origin: 'jupiter-2', diedAt: now });
      }
      if (lastDeathAtRef.current && now - lastDeathAtRef.current > 5000) {
        lastDeathAtRef.current = 0;
        setLastDeathAt(0);
      }
      // Elemental orbs: collect what the walker crossed this tick
      // (segment-checked, so the speeder cannot step over one) and
      // fade the expired. The path runs from the last tick's feet
      // to this tick's.
      const feetPos = feet ? { x: feet.x, y: feet.y, z: feet.z } : null;
      if (feetPos && orbsRef.current.length > 0) {
        const { collected, remaining } = collectOrbs(orbsRef.current, prevFeetRef.current, feetPos);
        if (collected.length > 0) {
          let wallet = walletRef.current;
          for (const orb of collected) wallet = addOrb(wallet, orb.element);
          walletRef.current = wallet;
          orbsRef.current = pruneOrbs(remaining, now);
          setOrbsUi(orbsRef.current);
          const names = collected.map((o) => (ORB_ELEMENTS[o.element] || {}).label || o.element);
          showNotice(`⬡ +${collected.length} ${names.join(', ')} ORB${collected.length > 1 ? 'S' : ''}`);
          syncProgressUi();
        } else {
          const pruned = pruneOrbs(orbsRef.current, now);
          if (pruned.length !== orbsRef.current.length) {
            orbsRef.current = pruned;
            setOrbsUi(pruned);
          }
        }
      }
      if (feetPos) prevFeetRef.current = feetPos;
      // A notice fades after 3 s.
      if (noticeRef.current && now - noticeRef.current.atMs > 3000) {
        noticeRef.current = null;
        setNotice(null);
      }
      const nextHp = { hp: Math.round(brain.walker.hp), burning: brain.walker.burnRemainingS > 0, shield: shieldRef.current.current, shieldMax: shieldRef.current.max };
      if (nextHp.hp !== hpUiRef.current.hp || nextHp.burning !== hpUiRef.current.burning || nextHp.shield !== hpUiRef.current.shield) {
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
  // F = fire: the speeder blaster while riding, the equipped backpack
  // weapon on foot (fireWeapon dispatches on the mounted state).
  useEffect(() => {
    const down = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'b') summon();
      else if (k === 'e' && speederRef.current.summoned) dismount();
      else if (k === 'f') fireWeapon();
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The SHOOT orb's press handler (workstream 1 owns the orb's
  // shape + placement): the page passes a shootRef, the orb calls
  // shootRef.current(). Assigned every render so the orb always
  // calls the current action. On foot it is inactive — the action
  // itself no-ops there.
  useEffect(() => {
    if (shootRef) shootRef.current = fireBlaster;
  });

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
          orbs={orbsUi} blasterRef={blasterRef}
        />
      </Canvas>
      {!ready && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: ACCENT, letterSpacing: 3, fontSize: 12,
        }}>ENTERING THE STORM…</div>
      )}
      {/* Hint — below the top row of orbs (top 76), wrapping inside
          a centred band that clears the left orb column and the
          top-right EXIT/FULLSCREEN orb, so it can never be cut off
          behind a button again. It fades after 5 s (see hintOn) and
          re-shows on a mode change. */}
      {mode !== 'orbit' && (
        <div style={{
          position: 'absolute', top: 76, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 'calc(100% - 184px)',
          color: '#ffe3cc', fontSize: 11, letterSpacing: 1, lineHeight: 1.5, textAlign: 'center',
          textShadow: '0 1px 4px #000',
          background: 'rgba(0,0,0,0.35)', padding: '6px 10px', borderRadius: 8,
          pointerEvents: 'none', zIndex: 5,
          opacity: hintOn ? 1 : 0, transition: 'opacity 0.6s ease',
        }}>
          {riding ? 'SPEEDER · STICK/WASD STEER · SHIFT BOOST · F FIRE' : 'STICK/WASD MOVE · DRAG LOOK · SPACE JUMP · B SUMMON SPEEDER'}
        </div>
      )}
      {/* walker health — an orb, not a pill: quiet while whole; the
          lightning burn shows here. It sits top-left, second in the
          row after the speeder orb. A readout, not a control, so it
          is a plain circle div, not a button. */}
      {mode !== 'orbit' && (hpUi.hp < WALKER_MAX_HP || hpUi.burning || hpUi.shield > 0) && (
        <div style={{
          position: 'absolute', top: 12, left: 76, zIndex: 6,
          width: 56, height: 56, borderRadius: '50%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: hpUi.burning ? '#ffb14d' : '#ffe3cc', fontSize: 12, fontWeight: 700, lineHeight: 1.2,
          background: 'rgba(0,0,0,0.5)',
          border: `2px solid ${hpUi.burning ? '#ff8c1a' : '#5a3220'}`,
          pointerEvents: 'none',
        }}>
          <span>❤ {hpUi.hp}</span>
          {hpUi.burning && <span style={{ fontSize: 8, letterSpacing: 1 }}>🔥 BURNING</span>}
          {hpUi.shield > 0 && <span style={{ fontSize: 8, letterSpacing: 1 }}>🛡 {hpUi.shield}</span>}
        </div>
      )}
      {lastDeathAt > 0 && (
        <div style={{
          position: 'absolute', top: 132, left: '50%', transform: 'translateX(-50%)', zIndex: 7,
          maxWidth: 'calc(100% - 24px)', textAlign: 'center',
          color: '#ffb14d', fontSize: 13, letterSpacing: 2, fontWeight: 700, lineHeight: 1.4,
          background: 'rgba(20,5,0,0.8)', padding: '10px 18px', borderRadius: 8,
          border: '1px solid #ff8c1a', pointerEvents: 'none',
        }}>
          THE STORM TOOK YOU — BACK AT THE DECK
        </div>
      )}
      {notice && (
        <div style={{
          position: 'absolute', top: 180, left: '50%', transform: 'translateX(-50%)', zIndex: 7,
          maxWidth: 'calc(100% - 24px)', textAlign: 'center',
          color: '#ffe3cc', fontSize: 12, letterSpacing: 2, fontWeight: 700, lineHeight: 1.4,
          background: 'rgba(20,5,0,0.8)', padding: '8px 14px', borderRadius: 8,
          border: '1px solid #e8a35c', pointerEvents: 'none',
        }}>
          {notice.text}
        </div>
      )}
      {mode !== 'orbit' && <Jupiter2TouchControls inputRef={inputRef} riding={riding} onShoot={fireBlaster} onFire={fireOnFoot} panelOpen={!!selectedId} orbDock={dock} />}
      {/* speeder summon / dismount / deck trade — FREE-FLOATING orbs
          now (Merlin, Nov 16 ~02:35 — the Hollow Earth mirror): the
          top-left column container is GONE. Each orb drags on its
          own through the shared orb dock (lib/world/orb-dock.js)
          and its spot persists per user; the defaults below are
          the column's old slots, measured, so nothing moves until
          the user drags it. The top-right corner still belongs to
          the EXIT / FULLSCREEN orb alone. One label per orb.
          Layout (Merlin, Nov 16 — the J2 layout): SUMMON shows on
          foot only (hidden while riding — DISMOUNT is the way off);
          the ORBS tally sits beside the HP orb at top-left and
          opens the merchant; the armed-lever orb is a READOUT (an
          action-less orb), fixed in its slot. Every default sits
          fully on screen — see tests/jupiter2-layout.test.mjs. */}
      {mode !== 'orbit' && (
        <>
          {/* SUMMON shows on foot only (Merlin, Nov 16 — the J2
              layout): while riding its state is DISMISS, and the orb
              is hidden — DISMOUNT (below, unmoved) is the way off
              the speeder. B still toggles summon/dismiss. The label
              is 8 px, not OrbLabel's 9 px: on Merlin's phone the
              6-letter word clipped to "SUMMOI" at the orb's right
              edge (the DISMISS orb in his speeder video clips the
              same way) — DISMOUNT's 8-letter label fits at 8 px in
              this file's own precedent, so SUMMON wears it too. */}
          {!riding && (
            <OrbButton onClick={() => { if (dock.tapGuard()) return; summon(); }} ariaLabel="Summon speeder"
              accent={ACCENT}
              {...dock.bind('summon', {})}
              style={dock.styleFor('summon', { left: 12, top: 12 })}>
              <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>🛸</span>
              <span style={{ fontSize: 8, letterSpacing: 1, lineHeight: 1 }}>SUMMON</span>
            </OrbButton>
          )}
          {riding && (
            <OrbButton size={64} onClick={() => { if (dock.tapGuard()) return; dismount(); }} ariaLabel="Dismount speeder"
              {...dock.bind('dismount', {})}
              style={dock.styleFor('dismount', { left: 12, top: 76 })}>
              <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>⏏</span>
              <span style={{ fontSize: 8, letterSpacing: 1, lineHeight: 1 }}>DISMOUNT</span>
            </OrbButton>
          )}
          {/* deck trade — elemental orbs buy shields + blaster
              upgrades. The panel opens here; the fiction is the
              deck trader at spawn. */}
          <OrbButton onClick={() => { if (dock.tapGuard()) return; setTradeOpen(true); }} ariaLabel="Open the deck trade — spend elemental orbs on shields and blaster upgrades"
            {...dock.bind('trade', {})}
            style={dock.styleFor('trade', { left: 12, top: riding ? 148 : 76 })}>
            <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>⬡</span>
            <OrbLabel>TRADE</OrbLabel>
          </OrbButton>
          {/* The orb tally — beside the HP orb at top-left (Merlin,
              Nov 16 — the J2 layout), not down the column: HP spans
              left 76–132, this one 140–196, both at top 12. A control
              now, not a readout: tapping it opens the merchant (the
              deck trade panel) for upgrades. TRADE stays in the
              column below. Fixed here, never dock-owned. */}
          <OrbButton size={56} onClick={() => setTradeOpen(true)}
            ariaLabel={`Elemental orbs, ${totalOrbs(walletUi)} — open the deck trade`}
            title={`Elemental orbs — storm ${walletUi.storm} · dragon ${walletUi.dragon} · demobat ${walletUi.demobat}`}
            style={{ position: 'absolute', left: 140, top: 12, zIndex: 6 }}>
            <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>⬡ {totalOrbs(walletUi)}</span>
            <OrbLabel>ORBS</OrbLabel>
          </OrbButton>
          {leverUi.phase === 'armed' && (
            <OrbButton ariaLabel={`Oblivion armed${leverUi.countdown ? `, ${leverUi.countdown}` : ''}`} accent="#22ff66"
              style={{ position: 'absolute', left: 12, top: riding ? 212 : 140, zIndex: 6 }}>
              <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>⚡</span>
              <span style={{ fontSize: 8, letterSpacing: 0.5, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>
                {leverUi.countdown || 'ARMED'}
              </span>
            </OrbButton>
          )}
          {/* Backpack — the ONE pack (Merlin, Nov 16 — the J2 layout):
              BackpackHud, the same mount Hollow Earth and
              Middle-earth wear (combatApplies: the FIRE orb fires the
              weapon this pack arms). Its own circle is the BACKPACK
              orb, home above JUMP in the right column (JUMP bottom
              88 + 76 + 12 gap = bottom 176); draggable from there,
              its spot persists per user. Hidden while a creature
              panel owns the bottom of the stage, like JUMP. */}
          {!selectedId && (
            <div style={{ position: 'absolute', right: 12, bottom: 176, zIndex: 10 }}>
              <BackpackHud realm="jupiter-2" realmLabel="Jupiter 2" combatApplies docked />
            </div>
          )}
        </>
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
      {/* deck trade — elemental orbs buy shields + blaster upgrades.
          Kill a monster with the speeder blaster and it drops one
          orb of its element; walk over the orb to collect it. Costs
          are the worker's call (5 / 10 / 15 orbs a track, mirroring
          Medusa's flat-per-tier pattern); any mix of orbs pays. */}
      {tradeOpen && (
        <div role="dialog" aria-label="Deck trade — elemental orbs"
          style={{
            position: 'absolute', inset: 0, zIndex: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)', padding: 16,
          }}>
          {/* Compact, one frame (Merlin, Nov 16 ~02:35 — the Hollow
              Earth mirror's one-frame menu spirit): tight padding
              and margins, short copy, every buy/recharge/close
              kept. overflowY stays as a backstop for the smallest
              screens, but the panel now measures ~500 px tall and
              fits a phone frame without scrolling. */}
          <div style={{
            maxWidth: 440, width: '100%', maxHeight: 'calc(100% - 32px)', overflowY: 'auto',
            background: '#160a04', border: '2px solid #e8a35c', borderRadius: 12, padding: 0,
          }}>
            {/* Deck-trade art (Merlin, Nov 16 — the J2 layout): one
                true-to-place illustrated graphic for this surface,
                the Swamp Run wrap — art under a dark scrim, text
                below it, no layout change. No repeats: the creature
                panel and the page intro wear their own. */}
            <div aria-hidden="true" style={{
              height: 110, borderRadius: '12px 12px 0 0',
              backgroundImage: 'linear-gradient(rgba(22,10,4,0.15), rgba(22,10,4,0.55)), url(/images/jupiter-2/jupiter2-trade-banner.webp)',
              backgroundSize: 'cover', backgroundPosition: 'center 38%',
            }} />
            <div style={{ padding: '12px 14px 14px' }}>
            <h2 style={{ margin: '0 0 4px', color: '#e8a35c', letterSpacing: 2, fontSize: 18 }}>⬡ DECK TRADE</h2>
            <p style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.5, color: '#c99a78' }}>
              Storm {walletUi.storm} · Dragon {walletUi.dragon} · Demobat {walletUi.demobat} — total {totalOrbs(walletUi)} orbs.
              Kill with the speeder blaster, walk over the orb to collect it.
            </p>
            <h3 style={{ margin: '0 0 6px', color: '#ffe3cc', letterSpacing: 2, fontSize: 13 }}>🛡️ SHIELDS — ABSORB DAMAGE BEFORE YOUR 100 HP</h3>
            {SHIELD_TIERS.slice(1).map((t) => {
              const owned = shieldUi.tier >= t.tier;
              const afford = totalOrbs(walletUi) >= t.cost;
              return (
                <div key={t.tier} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4, color: '#f6e8da' }}>
                    <b>{t.label}</b> — absorbs {t.max} damage · {t.cost} ⬡
                  </div>
                  <button type="button" disabled={owned || !afford} onClick={() => buyShield(t.tier)}
                    style={{
                      minHeight: 44, padding: '10px 14px', borderRadius: 8, cursor: owned || !afford ? 'default' : 'pointer',
                      border: '1px solid #e8a35c', background: owned ? '#1c0d06' : '#e8a35c', color: owned ? '#c99a78' : '#160a04',
                      fontWeight: 700, fontSize: 12, letterSpacing: 1, opacity: owned || !afford ? 0.55 : 1, whiteSpace: 'nowrap',
                    }}>
                    {owned ? 'OWNED' : `BUY ${t.cost} ⬡`}
                  </button>
                </div>
              );
            })}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4, color: '#f6e8da' }}>
                <b>Recharge shield</b> — back to full ({shieldUi.max}) · {SHIELD_RECHARGE_COST} ⬡
              </div>
              <button type="button"
                disabled={shieldUi.tier === 0 || shieldUi.current >= shieldUi.max || totalOrbs(walletUi) < SHIELD_RECHARGE_COST}
                onClick={rechargeShield}
                style={{
                  minHeight: 44, padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid #5a3220', background: '#1c0d06', color: '#f6e8da',
                  fontWeight: 700, fontSize: 12, letterSpacing: 1, whiteSpace: 'nowrap',
                }}>
                RECHARGE {SHIELD_RECHARGE_COST} ⬡
              </button>
            </div>
            <h3 style={{ margin: '0 0 6px', color: '#ffe3cc', letterSpacing: 2, fontSize: 13 }}>🔫 SPEEDER BLASTER — STOCK 34 DMG · 500 MS · 60 M</h3>
            {BLASTER_TIERS.slice(1).map((t) => {
              const owned = blasterUi.tier >= t.tier;
              const afford = totalOrbs(walletUi) >= t.cost;
              return (
                <div key={t.tier} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4, color: '#f6e8da' }}>
                    <b>{t.label}</b> — {t.dmg} dmg · {t.cooldownMs} ms · {t.rangeM} m · {t.cost} ⬡
                  </div>
                  <button type="button" disabled={owned || !afford} onClick={() => buyBlaster(t.tier)}
                    style={{
                      minHeight: 44, padding: '10px 14px', borderRadius: 8, cursor: owned || !afford ? 'default' : 'pointer',
                      border: '1px solid #e8a35c', background: owned ? '#1c0d06' : '#e8a35c', color: owned ? '#c99a78' : '#160a04',
                      fontWeight: 700, fontSize: 12, letterSpacing: 1, opacity: owned || !afford ? 0.55 : 1, whiteSpace: 'nowrap',
                    }}>
                    {owned ? 'OWNED' : `BUY ${t.cost} ⬡`}
                  </button>
                </div>
              );
            })}
            <p style={{ margin: '6px 0 10px', fontSize: 12, lineHeight: 1.5, color: '#c99a78' }}>
              Blaster fires from the speeder only (F key, or the SHOOT orb). Shields refill to full on tier purchase and when the storm takes you.
            </p>
            <button type="button" onClick={() => setTradeOpen(false)}
              style={{
                minHeight: 44, padding: '10px 18px', borderRadius: 8, cursor: 'pointer',
                border: '1px solid #5a3220', background: '#1c0d06', color: '#f6e8da',
                fontSize: 13, letterSpacing: 1,
              }}>
              CLOSE
            </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
