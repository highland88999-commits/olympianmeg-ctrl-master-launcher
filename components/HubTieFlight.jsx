'use client';

// HubTieFlight — the twin-panel fighter fly-throughs of the main hub.
// Round 1 (Merlin, 2026-10-23) crossed a small flight over the front
// vista every few minutes. Round 2 is his verdict on the live build:
// the ships are QUADRUPLE size (60-unit wingspan — movie-level
// threatening), a pass starts roughly every 24 seconds, each pass
// takes a seeded-random heading from the proven-safe family in
// lib/hub-flight.js, every ship leaves a short ion-blue trail, and
// each pass carries the synthesized flyby roar ("that neooooo
// sound") shaped per frame by every ship's real distance, closing
// speed and bearing to the camera. Merlin's verdict on the round-2
// mix — "the sound isn't right" — brought a sound-only rework the
// same night: distorted, fluttering per-ship voices, a near-octave
// doppler arc, stereo travel, and real presence (see the audio
// section below). Between passes the flight is GONE — hidden,
// silent, not parked, not orbiting.
//
// The GLB loads once; the three ships are clones sharing its geometry
// and materials. Trails are preallocated ribbon geometries fed by
// the pure ring buffers in the module. No per-frame allocations:
// every temp is a module-level scratch object.

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  FIGHTER_URL,
  FIGHTER_WINGSPAN,
  FIGHTER_YAW_FIX,
  FLYBY_VOICE_DETUNE,
  SHIP_COUNT,
  TRAIL_CAPACITY,
  TRAIL_HALF_WIDTH,
  TRAIL_SPACING,
  createFlightClock,
  createTrailBuffer,
  flybyEnvelope,
  flybyPan,
  poseAtInto,
} from '../lib/hub-flight';

const _pose = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1, bank: 0 };
const _sample = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1 };
// Per-ship audio frames for this tick: position + distance/closing
// to the camera, filled in the pose loop, read by the audio drive.
const _shipFrames = Array.from({ length: SHIP_COUNT }, () => ({
  x: 0, y: 0, z: 0, distance: 0, closing: 0,
}));
const _camDir = new THREE.Vector3();
const _xAxis = new THREE.Vector3();
const _yAxis = new THREE.Vector3();
const _zAxis = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _side = new THREE.Vector3();
const _view = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _bankQuat = new THREE.Quaternion();
const _zUnit = new THREE.Vector3(0, 0, 1);

// Ion blue, matching the engine glow.
const TRAIL_RGB = { r: 0.35, g: 0.65, b: 1.0 };

// One soft ion-blue glow sprite texture, drawn once.
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(210,240,255,1)');
  grad.addColorStop(0.35, 'rgba(130,200,255,0.55)');
  grad.addColorStop(1, 'rgba(110,180,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// One ship's trail ribbon: a preallocated triangle strip, two verts
// per trail sample, additive with vertex colours fading to black at
// the tail (additive black = invisible). Rebuilt in place each frame
// from the ship's ring buffer — no allocations after creation.
function makeTrailMesh() {
  const positions = new Float32Array(TRAIL_CAPACITY * 2 * 3);
  const colors = new Float32Array(TRAIL_CAPACITY * 2 * 3);
  const index = [];
  for (let i = 0; i < TRAIL_CAPACITY - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    index.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(index);
  geo.setDrawRange(0, 0);
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}

// --- Flyby audio ------------------------------------------------------
// A synthesized Web Audio roar, REWORKED after Merlin's verdict on
// the round-2 mix ("the sound isn't right" — too thin, too clean,
// too quiet, glued to the centre). The voice now:
// - GRIT: per ship, two detuned saws + a square sub run through a
//   waveshaper (tanh drive) and a resonant band-pass, with a slow
//   7-9 Hz tremolo flutter riding each voice — the roar pulses and
//   snarls instead of humming.
// - DOPPLER: the pure flybyEnvelope() in lib/hub-flight.js, its
//   pitch law widened toward an octave of sweep, driven per ship
//   by that ship's real distance / closing speed to the camera.
// - PRESENCE: envelope peak 0.30, summed voices tamed by a
//   DynamicsCompressor on the master so stacked layers can't clip.
// - STEREO: every voice (and the noise bed) pans with the pure
//   flybyPan() of its ship's bearing to the camera — a crossing
//   pass travels across the listener's ears.
// - CHORUS: the three ships are three voices, detuned ~1% apart
//   (FLYBY_VOICE_DETUNE) with staggered envelope smoothing, so the
//   formation sounds like three engines flying in loose time.
// A shared noise bed (band-passed white noise) follows the loudest
// ship. The graph is created ONLY on a user gesture (browsers block
// autoplay; passes before the first tap stay silent, which is
// fine). Master gain is a gate: 1 while any voice is in earshot,
// 0 otherwise — silence() and tab-hidden ride it exactly as before.

// Per-voice mix weights (the envelope's 0.30 peak is the leader's;
// wingmen support, they don't triple the peak).
const VOICE_WEIGHTS = [0.72, 0.45, 0.45];
// Per-voice envelope smoothing — the wingmen's envelopes lag the
// leader's a touch on top of their natural geometric lag.
const VOICE_TC = [0.05, 0.09, 0.13];
// Tremolo flutter rates, one per voice (Hz).
const FLUTTER_HZ = [7.3, 8.2, 8.9];
// Oscillator stack per voice: two saws (fundamental + fifth) and a
// square sub an octave down, into the shared-per-voice waveshaper.
const VOICE_PARTIALS = [
  { type: 'sawtooth', freq: 78, level: 0.5 },
  { type: 'sawtooth', freq: 117.4, level: 0.34 },
  { type: 'square', freq: 39, level: 0.42 },
];

function createFlybyAudio() {
  let ctx = null;
  let master = null;
  let noiseFilter = null;
  let noiseGain = null;
  let noisePan = null;
  let voices = [];
  let disposed = false;

  function ensure() {
    if (disposed) return null;
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      // Master: gate gain → soft-limiter compressor → out. The
      // compressor is the ceiling that lets three distorted voices
      // + noise stack without clipping.
      master = ctx.createGain();
      master.gain.value = 0;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.knee.value = 24;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.24;
      master.connect(limiter);
      limiter.connect(ctx.destination);

      // Waveshaper drive curve, shared by every voice: a tanh
      // saturation that grows harmonics as the stack pushes into it.
      const curve = new Float32Array(256);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(2.2 * x);
      }

      // Per-ship voices.
      voices = [];
      for (let i = 0; i < SHIP_COUNT; i++) {
        const shaper = ctx.createWaveShaper();
        shaper.curve = curve;
        shaper.oversample = '2x';
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 460;
        filter.Q.value = 2.4;
        // Flutter: an LFO wobbling a unity-gain node ±0.22 — a
        // relative tremolo, so it scales with the envelope for free.
        const flutter = ctx.createGain();
        flutter.gain.value = 1;
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = FLUTTER_HZ[i];
        const lfoDepth = ctx.createGain();
        lfoDepth.gain.value = 0.22;
        lfo.connect(lfoDepth);
        lfoDepth.connect(flutter.gain);
        lfo.start();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const pan = ctx.createStereoPanner();
        shaper.connect(filter);
        filter.connect(flutter);
        flutter.connect(gain);
        gain.connect(pan);
        pan.connect(master);
        const detune = 1 + (FLYBY_VOICE_DETUNE[i] || 0);
        const oscs = [];
        for (const part of VOICE_PARTIALS) {
          const osc = ctx.createOscillator();
          osc.type = part.type;
          osc.frequency.value = part.freq * detune;
          const level = ctx.createGain();
          level.gain.value = part.level;
          osc.connect(level);
          level.connect(shaper);
          osc.start();
          oscs.push({ osc, base: part.freq });
        }
        voices.push({ gain, pan, filter, oscs, detune });
      }

      // Noise bed: 2 s of looped white noise into a band-pass,
      // gained + panned by the loudest ship each frame.
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 620;
      noiseFilter.Q.value = 1.6;
      noiseGain = ctx.createGain();
      noiseGain.gain.value = 0;
      noisePan = ctx.createStereoPanner();
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(noisePan);
      noisePan.connect(master);
      noise.start();
    } catch {
      ctx = null;
      voices = [];
      return null;
    }
    return ctx;
  }

  function onGesture() {
    ensure();
  }

  return {
    attach() {
      window.addEventListener('pointerdown', onGesture, { passive: true });
      window.addEventListener('keydown', onGesture);
    },
    // Shape the roar for this frame. frames[i] is ship i's
    // { x, y, z, distance, closing } for this frame; camPos and
    // camDir are the camera position and unit look direction.
    // Envelopes and pans are the pure helpers in lib/hub-flight.js;
    // smoothing is the graph's own (setTargetAtTime constants).
    drive(frames, camPos, camDir) {
      if (!ctx || !master) return;
      const t = ctx.currentTime;
      let anyAudible = false;
      let loudest = null;
      for (let i = 0; i < voices.length; i++) {
        const f = frames[i];
        if (!f) continue;
        const env = flybyEnvelope(f.distance, f.closing);
        const v = voices[i];
        v.gain.gain.setTargetAtTime(env.gain * VOICE_WEIGHTS[i], t, VOICE_TC[i]);
        if (!env.inRange) continue;
        anyAudible = true;
        const p = env.pitch;
        for (const o of v.oscs) {
          o.osc.frequency.setTargetAtTime(o.base * p * v.detune, t, 0.045);
        }
        v.filter.frequency.setTargetAtTime(460 * Math.pow(p, 1.6), t, 0.045);
        v.pan.pan.setTargetAtTime(flybyPan(f, camPos, camDir), t, 0.06);
        if (!loudest || env.gain > loudest.env.gain) loudest = { env, frame: f };
      }
      master.gain.setTargetAtTime(anyAudible ? 1 : 0, t, 0.09);
      if (loudest) {
        noiseFilter.frequency.setTargetAtTime(
          620 * Math.pow(loudest.env.pitch, 1.4),
          t,
          0.05,
        );
        noiseGain.gain.setTargetAtTime(loudest.env.gain * 0.5, t, 0.07);
        noisePan.pan.setTargetAtTime(flybyPan(loudest.frame, camPos, camDir), t, 0.06);
      } else {
        noiseGain.gain.setTargetAtTime(0, t, 0.07);
      }
    },
    silence() {
      if (!ctx || !master) return;
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.07);
    },
    dispose() {
      disposed = true;
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      if (ctx) {
        ctx.close().catch(() => {});
        ctx = null;
      }
    },
  };
}

export default function HubTieFlight() {
  const groupRef = useRef(null);
  const shipsRef = useRef([]);
  const trailsRef = useRef([]);
  const trailBuffersRef = useRef([]);
  const clockRef = useRef(null);
  const audioRef = useRef(null);
  const elapsedRef = useRef(0);
  const lastPassRef = useRef(-1);
  // Per-ship distance history for the closing-speed differences
  // (each voice's envelope is driven by its own ship's geometry).
  const prevDistsRef = useRef(null);
  const closingsRef = useRef(null);
  if (!prevDistsRef.current) prevDistsRef.current = new Array(SHIP_COUNT).fill(-1);
  if (!closingsRef.current) closingsRef.current = new Array(SHIP_COUNT).fill(0);
  const lastPushRef = useRef([]);
  const halfDepthRef = useRef(0);
  if (!clockRef.current) clockRef.current = createFlightClock();
  if (!audioRef.current) audioRef.current = createFlybyAudio();

  // Audio gesture gate: the context may only be created/resumed
  // after the user has tapped or typed.
  useEffect(() => {
    const audio = audioRef.current;
    audio.attach();
    return () => audio.dispose();
  }, []);

  useEffect(() => {
    let alive = true;
    let loadedScene = null;

    // Trail ribbons exist independently of the GLB load.
    const group = groupRef.current;
    const trailMeshes = [];
    const trailBuffers = [];
    if (group) {
      for (let i = 0; i < SHIP_COUNT; i++) {
        const mesh = makeTrailMesh();
        group.add(mesh);
        trailMeshes.push(mesh);
        trailBuffers.push(createTrailBuffer());
      }
    }
    trailsRef.current = trailMeshes;
    trailBuffersRef.current = trailBuffers;

    (async () => {
      try {
        const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
          import('three/examples/jsm/loaders/GLTFLoader.js'),
          import('three/examples/jsm/libs/meshopt_decoder.module.js'),
        ]);
        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        const gltf = await loader.loadAsync(FIGHTER_URL);
        if (!alive || !groupRef.current) return;
        loadedScene = gltf.scene;

        // Normalise once: largest extent -> FIGHTER_WINGSPAN, centred
        // on the wrap origin (the raw model sits base-at-zero). At
        // the round-2 fit the wingspan is 60 units.
        const box = new THREE.Box3().setFromObject(loadedScene);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);
        const fit = FIGHTER_WINGSPAN / Math.max(size.x, size.y, size.z, 1e-6);
        const halfDepth = (size.z * fit) / 2;
        halfDepthRef.current = halfDepth;

        const glowTex = makeGlowTexture();
        const ships = [];
        for (let i = 0; i < SHIP_COUNT; i++) {
          // Outer wrap: position + flight orientation from the module.
          const ship = new THREE.Group();
          ship.visible = false;
          // Inner wrap carries the measured nose correction so the
          // outer frame can treat +Z as the direction of travel.
          const inner = new THREE.Group();
          inner.rotation.y = FIGHTER_YAW_FIX;
          const model = i === 0 ? loadedScene : loadedScene.clone();
          model.scale.setScalar(fit);
          model.position.set(-center.x * fit, -center.y * fit, -center.z * fit);
          model.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = false;
              o.receiveShadow = false;
            }
          });
          inner.add(model);
          ship.add(inner);
          // Engine glow rides the OUTER frame (always the tail, even
          // if the yaw correction is ever flipped): an additive
          // sprite at the rear of the ball, blooming via the hub's
          // existing Bloom pass. Scaled up with the quadruple hull.
          const glowMat = new THREE.SpriteMaterial({
            map: glowTex,
            color: '#9fd8ff',
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0.9,
          });
          const glow = new THREE.Sprite(glowMat);
          glow.scale.setScalar(9.5);
          glow.position.set(0, 0, -halfDepth - 2);
          ship.add(glow);
          groupRef.current.add(ship);
          ships.push(ship);
        }
        shipsRef.current = ships;
      } catch {
        // Best-effort dressing: a failed load just means no fly-throughs.
      }
    })();
    return () => {
      alive = false;
      for (const mesh of trailMeshes) {
        mesh.geometry?.dispose();
        mesh.material?.dispose();
        mesh.removeFromParent();
      }
      trailsRef.current = [];
      trailBuffersRef.current = [];
      if (groupRef.current) {
        groupRef.current.traverse((o) => {
          if (o.isSprite) {
            o.material?.map?.dispose();
            o.material?.dispose();
          }
        });
      }
      if (loadedScene) {
        loadedScene.traverse((o) => {
          if (o.isMesh) {
            o.geometry?.dispose();
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => m?.dispose());
          }
        });
      }
      shipsRef.current = [];
    };
  }, []);

  useFrame((state, delta) => {
    const ships = shipsRef.current;
    // Tab-hidden pause: RAF stalls in a hidden tab anyway; the check
    // plus the delta clamp keep the schedule honest on return — and
    // the roar never keeps playing to an empty room.
    if (typeof document !== 'undefined' && document.hidden) {
      audioRef.current.silence();
      return;
    }
    const dt = Math.min(delta, 0.05);
    elapsedRef.current += dt;
    const win = clockRef.current.at(elapsedRef.current);
    if (!win) {
      if (lastPassRef.current !== -1) {
        lastPassRef.current = -1;
        prevDistsRef.current.fill(-1);
        closingsRef.current.fill(0);
        for (const buf of trailBuffersRef.current) buf.reset();
        for (const mesh of trailsRef.current) mesh.visible = false;
      }
      for (const ship of ships) ship.visible = false;
      audioRef.current.silence();
      return;
    }
    if (win.passIndex !== lastPassRef.current) {
      // A new pass: trails start clean at the engine, never strung
      // across the sky from the previous pass's exit.
      lastPassRef.current = win.passIndex;
      prevDistsRef.current.fill(-1);
      closingsRef.current.fill(0);
      lastPushRef.current = [];
      for (const buf of trailBuffersRef.current) buf.reset();
    }
    if (!ships.length) return;

    const cam = state.camera.position;
    const halfDepth = halfDepthRef.current;

    for (let i = 0; i < ships.length; i++) {
      const ship = ships[i];
      poseAtInto(win.passIndex, win.u, i, _pose);
      // This ship's audio frame: position now, distance/closing
      // filled after the loop (closing needs the frame's dt).
      const frame = _shipFrames[i];
      frame.x = _pose.x;
      frame.y = _pose.y;
      frame.z = _pose.z;
      ship.visible = true;
      ship.position.set(_pose.x, _pose.y, _pose.z);
      // Basis build with +Z as the nose: z = forward, x = up × z,
      // y = z × x. Banking is a roll about the forward axis on top.
      _zAxis.set(_pose.fx, _pose.fy, _pose.fz).normalize();
      _xAxis.crossVectors(_up, _zAxis);
      if (_xAxis.lengthSq() < 1e-6) _xAxis.set(1, 0, 0);
      _xAxis.normalize();
      _yAxis.crossVectors(_zAxis, _xAxis);
      _matrix.makeBasis(_xAxis, _yAxis, _zAxis);
      ship.quaternion.setFromRotationMatrix(_matrix);
      _bankQuat.setFromAxisAngle(_zUnit, _pose.bank);
      ship.quaternion.multiply(_bankQuat);

      // --- Trail: push the engine position every TRAIL_SPACING
      // units of travel, then rebuild this ship's ribbon in place.
      const buf = trailBuffersRef.current[i];
      const mesh = trailsRef.current[i];
      if (buf && mesh) {
        const ex = _pose.x - _pose.fx * (halfDepth + 1);
        const ey = _pose.y - _pose.fy * (halfDepth + 1);
        const ez = _pose.z - _pose.fz * (halfDepth + 1);
        const last = lastPushRef.current[i];
        if (!last) {
          buf.push(ex, ey, ez, _pose.fx, _pose.fy, _pose.fz);
          lastPushRef.current[i] = { x: ex, y: ey, z: ez };
        } else {
          const dx = ex - last.x;
          const dy = ey - last.y;
          const dz = ez - last.z;
          if (dx * dx + dy * dy + dz * dz >= TRAIL_SPACING * TRAIL_SPACING) {
            buf.push(ex, ey, ez, _pose.fx, _pose.fy, _pose.fz);
            last.x = ex;
            last.y = ey;
            last.z = ez;
          }
        }
        const n = buf.count();
        if (n >= 2) {
          const posAttr = mesh.geometry.getAttribute('position');
          const colAttr = mesh.geometry.getAttribute('color');
          for (let j = 0; j < n; j++) {
            buf.sampleInto(j, _sample);
            const fade = j / (n - 1);
            _fwd.set(_sample.fx, _sample.fy, _sample.fz);
            _view.set(_sample.x - cam.x, _sample.y - cam.y, _sample.z - cam.z);
            _side.crossVectors(_fwd, _view);
            if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
            _side.normalize();
            const w = TRAIL_HALF_WIDTH * fade;
            const bright = Math.pow(fade, 1.6) * 0.85;
            const o = j * 6;
            posAttr.array[o] = _sample.x + _side.x * w;
            posAttr.array[o + 1] = _sample.y + _side.y * w;
            posAttr.array[o + 2] = _sample.z + _side.z * w;
            posAttr.array[o + 3] = _sample.x - _side.x * w;
            posAttr.array[o + 4] = _sample.y - _side.y * w;
            posAttr.array[o + 5] = _sample.z - _side.z * w;
            colAttr.array[o] = TRAIL_RGB.r * bright;
            colAttr.array[o + 1] = TRAIL_RGB.g * bright;
            colAttr.array[o + 2] = TRAIL_RGB.b * bright;
            colAttr.array[o + 3] = TRAIL_RGB.r * bright;
            colAttr.array[o + 4] = TRAIL_RGB.g * bright;
            colAttr.array[o + 5] = TRAIL_RGB.b * bright;
          }
          posAttr.needsUpdate = true;
          colAttr.needsUpdate = true;
          mesh.geometry.setDrawRange(0, (n - 1) * 6);
          mesh.visible = true;
        } else {
          mesh.visible = false;
        }
      }
    }

    // --- Flyby roar: each voice is driven by its own ship's real
    // distance to the camera and closing speed (smoothed finite
    // difference — responsive enough that the pitch drop tracks
    // closest approach instead of trailing it), and panned by the
    // ship's bearing to the camera.
    for (let i = 0; i < ships.length; i++) {
      const frame = _shipFrames[i];
      const dist = Math.hypot(frame.x - cam.x, frame.y - cam.y, frame.z - cam.z);
      const prev = prevDistsRef.current[i];
      if (prev >= 0 && dt > 0) {
        const raw = (prev - dist) / dt;
        closingsRef.current[i] += (raw - closingsRef.current[i]) * 0.5;
      } else {
        closingsRef.current[i] = 0;
      }
      prevDistsRef.current[i] = dist;
      frame.distance = dist;
      frame.closing = closingsRef.current[i];
    }
    state.camera.getWorldDirection(_camDir);
    audioRef.current.drive(_shipFrames, cam, _camDir);
  });

  return <group ref={groupRef} />;
}
