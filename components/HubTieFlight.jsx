'use client';

// HubTieFlight — the occasional twin-panel fighter fly-through of the
// main hub (Merlin, 2026-10-23). A loose three-ship flight crosses the
// front vista every few minutes on the lane proved clear in
// lib/hub-flight.js, then is GONE — hidden, not parked, not orbiting.
// Visual only: no weapons fire, no sound (the hub has its radio).
//
// The GLB loads once; the three ships are clones sharing its geometry
// and materials. Between passes the group is visible=false and the
// frame callback does one clock lookup — no per-frame allocations
// (every temp is a module-level scratch object).

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  FIGHTER_URL,
  FIGHTER_WINGSPAN,
  FIGHTER_YAW_FIX,
  SHIP_COUNT,
  createFlightClock,
  poseAtInto,
} from '../lib/hub-flight';

const _pose = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1, bank: 0 };
const _xAxis = new THREE.Vector3();
const _yAxis = new THREE.Vector3();
const _zAxis = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _matrix = new THREE.Matrix4();
const _bankQuat = new THREE.Quaternion();
const _zUnit = new THREE.Vector3(0, 0, 1);

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

export default function HubTieFlight() {
  const groupRef = useRef(null);
  const shipsRef = useRef([]);
  const clockRef = useRef(null);
  const elapsedRef = useRef(0);
  if (!clockRef.current) clockRef.current = createFlightClock();

  useEffect(() => {
    let alive = true;
    let loadedScene = null;
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
        // on the wrap origin (the raw model sits base-at-zero).
        const box = new THREE.Box3().setFromObject(loadedScene);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);
        const fit = FIGHTER_WINGSPAN / Math.max(size.x, size.y, size.z, 1e-6);
        const halfDepth = (size.z * fit) / 2;

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
          // if the yaw correction is ever flipped): a small additive
          // sprite at the rear of the ball, blooming via the hub's
          // existing Bloom pass.
          const glowMat = new THREE.SpriteMaterial({
            map: glowTex,
            color: '#9fd8ff',
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0.9,
          });
          const glow = new THREE.Sprite(glowMat);
          glow.scale.setScalar(3.2);
          glow.position.set(0, 0, -halfDepth - 0.6);
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

  useFrame((_, delta) => {
    const ships = shipsRef.current;
    if (!ships.length) return;
    // Tab-hidden pause: RAF stalls in a hidden tab anyway; the check
    // plus the delta clamp keep the schedule honest on return.
    if (typeof document !== 'undefined' && document.hidden) return;
    elapsedRef.current += Math.min(delta, 0.05);
    const win = clockRef.current.at(elapsedRef.current);
    if (!win) {
      for (const ship of ships) ship.visible = false;
      return;
    }
    for (let i = 0; i < ships.length; i++) {
      const ship = ships[i];
      poseAtInto(win.passIndex, win.u, i, _pose);
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
    }
  });

  return <group ref={groupRef} />;
}
