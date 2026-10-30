'use client';

// VortexTubeRide — the vortex tube drop sequence (Merlin, 2026-10-29).
//
// The rider drops into a solid, opaque tube. Watchers see the OUTSIDE
// skin spinning; the rider inside sees only the INSIDE skin — never both.
// The tube spins around the rider; the rider does NOT spin (no motion
// sickness): the camera auto-fixes to look straight forward for the whole
// ride, so the destination program renders in front of them at the end.
//
// Reusable: Collapse Run renders this when the floor catches the runner
// (the tube "spawns under where they fall"). Props:
//   outsideSkin, insideSkin — site paths from pickVortexWraps()
//   destinationName        — shown at the tube's end
//   durationMs             — ride length (default 8s)
//   onDone                 — called when the ride completes

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { flightProgress } from '../lib/vortex.js';
import {
  VORTEX_RIDE_MS,
  TUBE_SPIN_RAD_PER_SEC,
  TUBE_LENGTH,
  TUBE_RADIUS,
  tubeSpinAngle,
  tubeCameraZ,
} from '../lib/tube.js';
import VortexFallbackRide from './VortexFallbackRide.jsx';

export default function VortexTubeRide({
  outsideSkin,
  insideSkin,
  destinationName,
  durationMs = VORTEX_RIDE_MS,
  onDone,
}) {
  const mountRef = useRef(null);
  const doneRef = useRef(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [arriving, setArriving] = useState(false);
  const [exitVisible, setExitVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mount = mountRef.current;
    if (!mount || webglFailed) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      setWebglFailed(true);
      return;
    }
    const W = () => mount.clientWidth || window.innerWidth;
    const H = () => mount.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(W(), H());
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0x000000, 25, TUBE_LENGTH);

    const camera = new THREE.PerspectiveCamera(72, W() / H(), 0.1, TUBE_LENGTH + 60);
    camera.position.set(0, 0, 8);
    // Auto-fix: the one true forward. Re-applied every frame so the
    // rider always faces the destination, never the spin.
    const lookForward = () => camera.lookAt(0, 0, -TUBE_LENGTH);
    lookForward();

    // The tube: one open cylinder, two skins — outside wall for
    // watchers (FrontSide), inside wall for the rider (BackSide).
    const geo = new THREE.CylinderGeometry(TUBE_RADIUS, TUBE_RADIUS, TUBE_LENGTH, 48, 1, true);
    geo.rotateX(Math.PI / 2); // long axis -> Z
    geo.translate(0, 0, -TUBE_LENGTH / 2 + 8); // mouth behind the camera
    const tubeGroup = new THREE.Group();

    const loader = new THREE.TextureLoader();
    const prepTex = (url, rx, ry) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0x0b0b14 });
      if (url) {
        loader.load(
          url,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(rx, ry); // stretched to fit the tube
            tex.anisotropy = 4;
            mat.map = tex;
            mat.color.set(0xffffff);
            mat.needsUpdate = true;
          },
          undefined,
          () => { /* keep the flat color on load failure */ }
        );
      }
      return mat;
    };
    const outer = new THREE.Mesh(geo, prepTex(outsideSkin, 4, 3));
    outer.material.side = THREE.FrontSide;
    const inner = new THREE.Mesh(geo, prepTex(insideSkin, 4, 3));
    inner.material.side = THREE.BackSide;
    inner.scale.setScalar(0.995); // no z-fighting between the walls
    tubeGroup.add(outer, inner);
    scene.add(tubeGroup);

    // Exit glow at the far end — the destination ahead.
    const ringGeo = new THREE.TorusGeometry(TUBE_RADIUS * 0.7, 0.12, 12, 48);
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.9 })
    );
    ring.position.set(0, 0, -TUBE_LENGTH + 12);
    scene.add(ring);

    const start = performance.now();
    let raf = 0;
    const onResize = () => {
      camera.aspect = W() / H();
      camera.updateProjectionMatrix();
      renderer.setSize(W(), H());
    };
    window.addEventListener('resize', onResize);

    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      setArriving(true);
      setTimeout(() => { if (onDone) onDone(); }, 650);
    };

    const loop = (now) => {
      const elapsed = now - start;
      const progress = flightProgress(elapsed, durationMs);

      // The vortex spins; the rider does not.
      if (!reduceMotion) tubeGroup.rotation.z = tubeSpinAngle(elapsed);
      ring.rotation.z = reduceMotion ? 0 : -elapsed / 900;

      // Forward through the tube, eased.
      camera.position.z = tubeCameraZ(progress);
      lookForward(); // auto-fix, every frame

      // Destination renders ahead in the last stretch.
      if (progress > 0.72) setExitVisible(true);

      renderer.render(scene, camera);
      if (progress >= 1) { finish(); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      geo.dispose();
      ringGeo.dispose();
      outer.material.map?.dispose();
      inner.material.map?.dispose();
      outer.material.dispose();
      inner.material.dispose();
      ring.material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [webglFailed, outsideSkin, insideSkin, destinationName, durationMs, onDone]);

  if (webglFailed) {
    return (
      <VortexFallbackRide
        destinationName={destinationName}
        durationMs={durationMs}
        onDone={onDone}
      />
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} aria-label="Vortex tube ride" />
      {/* The destination renders in front of the rider at the ride's end. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          pointerEvents: 'none', opacity: exitVisible ? 1 : 0,
          transition: 'opacity 1.2s ease', padding: '24px',
        }}
      >
        <p style={{ color: '#ffd700', letterSpacing: '6px', textTransform: 'uppercase', fontSize: '12px', margin: '0 0 10px' }}>
          Approaching
        </p>
        <p style={{ color: '#fff', fontSize: 'clamp(1.6rem, 6vw, 2.6rem)', letterSpacing: '3px', margin: 0 }}>
          {destinationName}
        </p>
      </div>
      {/* Exit fade */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, background: '#fff', pointerEvents: 'none',
          opacity: arriving ? 1 : 0, transition: 'opacity 0.6s ease',
        }}
      />
    </div>
  );
}
