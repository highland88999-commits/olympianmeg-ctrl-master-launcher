// components/SpacePortalGates.jsx
// The vertical space-portal gate field: one luminous gate per pocket universe,
// arranged on concentric rings (a polar grid) around the BABEL position in the
// launcher hub scene. Open space — not inside any tower.
//
// Each gate is a vertical doorway frame in its god-menu accent color with a
// shimmering portal plane and a floating label naming the destination
// universe. Click/tap a gate — or fly through it — to travel there through
// the one menu-to-satellite function, launchPocketUniverse.
//
// Performance: frame + shimmer geometries are built once and shared; there is
// one shared material per accent color (10), so 138 gates cost ~4 draw calls
// each and no per-gate lights — glow stays local, texture wraps stay readable.
'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fx } from '@/lib/fx';
import {
  GATE_SIZE,
  GATE_CROSSING_RADIUS,
  portalRingLayout,
  gateYawToCenter,
  accentForSatellite,
  displayNameFor,
} from '@/lib/space-portals';

function makeLabelTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d');
  // Dark plate so the name stays readable against starfields and nebulae.
  ctx.fillStyle = 'rgba(4,6,12,0.72)';
  ctx.fillRect(4, 10, 504, 76);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 10, 504, 76);
  ctx.font = '700 44px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  // Shrink long names to fit the plate instead of clipping them.
  let size = 44;
  while (ctx.measureText(text).width > 470 && size > 20) {
    size -= 2;
    ctx.font = `700 ${size}px system-ui, -apple-system, sans-serif`;
  }
  ctx.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** One merged doorway frame: two pillars + lintel + sill. Built once, shared. */
function buildFrameGeometry() {
  const pillar = new THREE.BoxGeometry(0.4, GATE_SIZE.height, 0.4);
  const left = pillar.clone();
  left.translate(-GATE_SIZE.width / 2, 0, 0);
  const right = pillar.clone();
  right.translate(GATE_SIZE.width / 2, 0, 0);
  const bar = new THREE.BoxGeometry(GATE_SIZE.width + 0.4, 0.4, 0.4);
  const lintel = bar.clone();
  lintel.translate(0, GATE_SIZE.height / 2, 0);
  const sill = bar.clone();
  sill.translate(0, -GATE_SIZE.height / 2, 0);
  const merged = mergeGeometries([left, right, lintel, sill]);
  pillar.dispose();
  bar.dispose();
  return merged;
}

function Gate({ sat, spot, center, title, accent, res, onTravel }) {
  const labelTex = useMemo(
    () => makeLabelTexture(displayNameFor(sat.key, title), accent),
    [sat.key, title, accent]
  );
  const yaw = useMemo(() => gateYawToCenter(spot, center), [spot, center]);

  const travel = (e) => {
    if (e) e.stopPropagation();
    onTravel(sat);
  };

  return (
    <group position={[spot.x, spot.y, spot.z]} rotation-y={yaw}>
      {/* Doorway frame — unlit accent color, blooms without any point light. */}
      <mesh geometry={res.frameGeo} material={res.frameMats[accent]} />
      {/* Shimmering portal plane inside the frame. */}
      <mesh geometry={res.shimmerGeo} material={res.shimmerMats[accent]} />
      {/* Destination label, floating above the gate. */}
      <sprite position={[0, GATE_SIZE.labelLift, 0]} scale={[11, 2.06, 1]}>
        <spriteMaterial map={labelTex} transparent depthWrite={false} fog={false} />
      </sprite>
      {/* Generous invisible tap target around the whole gate. */}
      <mesh
        geometry={res.hitGeo}
        material={res.hitMat}
        onClick={travel}
        onPointerOver={(e) => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      />
    </group>
  );
}

/**
 * The full gate field.
 *
 * @param {Array} satellites - SATELLITES registry entries { key, route, pos }
 * @param {[number,number,number]} center - BABEL_POS; gates ring it
 * @param {boolean} canLaunch - only hub_intro / hub_freeroam may travel
 * @param {(key: string) => string} getTitle - i18n title per satellite key
 * @param {(sat) => void} onTravel - wired to launchPocketUniverse(route, key, pos)
 */
export default function SpacePortalGates({ satellites, center, canLaunch, getTitle, onTravel }) {
  const reduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const spots = useMemo(
    () => portalRingLayout(satellites.length, { center }),
    [satellites.length, center]
  );

  // Shared GPU resources: one frame geometry, one shimmer plane, one hitbox,
  // and one material per accent color. Built once for all 138 gates.
  const res = useMemo(() => {
    const accents = [...new Set(satellites.map((s) => accentForSatellite(s.key)))];
    const frameMats = {};
    const shimmerMats = {};
    for (const a of accents) {
      frameMats[a] = new THREE.MeshBasicMaterial({ color: a, fog: false });
      shimmerMats[a] = new THREE.MeshBasicMaterial({
        color: a,
        transparent: true,
        opacity: 0.36,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
    }
    return {
      frameGeo: buildFrameGeometry(),
      shimmerGeo: new THREE.PlaneGeometry(GATE_SIZE.width - 0.4, GATE_SIZE.height - 0.8),
      hitGeo: new THREE.BoxGeometry(GATE_SIZE.hitWidth, GATE_SIZE.hitHeight, GATE_SIZE.hitDepth),
      hitMat: new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
      }),
      frameMats,
      shimmerMats,
    };
  }, [satellites]);

  const titles = useMemo(() => {
    const m = {};
    for (const s of satellites) m[s.key] = getTitle(s.key);
    return m;
  }, [satellites, getTitle]);

  // Fly-through detection + shimmer pulse in a single frame loop.
  const canLaunchRef = useRef(canLaunch);
  canLaunchRef.current = canLaunch;
  const lastTravelRef = useRef(0);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Synchronized shimmer pulse; static for reduced-motion users.
    if (!reduced) {
      const o = 0.3 + 0.14 * Math.sin(t * 2.2);
      for (const k of Object.keys(res.shimmerMats)) res.shimmerMats[k].opacity = o;
    }
    if (!canLaunchRef.current) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastTravelRef.current < 1500) return; // lockout: one travel at a time
    const cam = state.camera.position;
    const r2 = GATE_CROSSING_RADIUS * GATE_CROSSING_RADIUS;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      const dx = cam.x - s.x;
      const dy = cam.y - s.y;
      const dz = cam.z - s.z;
      if (dx * dx + dy * dy + dz * dz < r2) {
        lastTravelRef.current = now;
        fx.portal();
        onTravel(satellites[i]);
        break;
      }
    }
  });

  const handleTravel = (sat) => {
    if (!canLaunchRef.current) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastTravelRef.current < 1500) return;
    lastTravelRef.current = now;
    fx.portal();
    onTravel(sat);
  };

  return (
    <group>
      {satellites.map((sat, i) => (
        <Gate
          key={sat.key}
          sat={sat}
          spot={spots[i]}
          center={center}
          title={titles[sat.key]}
          accent={accentForSatellite(sat.key)}
          res={res}
          onTravel={handleTravel}
        />
      ))}
    </group>
  );
}
