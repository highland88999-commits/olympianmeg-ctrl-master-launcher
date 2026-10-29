'use client';

// Molly's real 3D head — the Tripo rig (Batch #6, 17-joint rig),
// shared between her ARES seat and the site-wide broadcast
// overlay. House GLB pattern: lazy three + GLTFLoader, Tripo
// materials tamed so the model does not render black, full GPU
// disposal on unmount. Eyes forward, always: the head faces the
// viewer (its +Z, jaw-verified in the GLB); with Follow motion on
// it tracks the phone's tilt — same tilt law as the portal
// cards — easing back to forward when motion is off.
// Reduced motion keeps forward-only. This is display only: the
// head does not drive jaw or blink from her voice; that rig is
// a separate build.
import { useEffect, useRef, useState } from 'react';
import { tameTripoMaterials } from '@/lib/characters/tame-materials';
import { guardCanvasContext } from '@/lib/scene-context-guard';
import { tiltFromOrientation } from '@/lib/portal-card-tilt';

export default function MollyHead3D({ showMotionToggle = true, fallback = null, className = '' }) {
  const mountRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [motionOn, setMotionOn] = useState(false);
  const baseQuatRef = useRef(null);
  const tiltRef = useRef({ yaw: 0, pitch: 0 });
  const targetRef = useRef({ yaw: 0, pitch: 0 });
  const baselineRef = useRef(null);
  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    let cancelled = false;
    let renderer = null;
    let model = null;
    let raf = 0;
    let contextGuard = null;
    const clockHolder = { last: 0 };

    (async () => {
      try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        if (cancelled || !mountRef.current) return;
        const mount = mountRef.current;
        const w = mount.clientWidth || 220;
        const h = 220;

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        mount.appendChild(renderer.domElement);
        contextGuard = guardCanvasContext(renderer.domElement, { label: 'MOLLY HEAD' });

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
        scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1c22, 0.9));
        const key = new THREE.DirectionalLight(0xffffff, 1.6);
        key.position.set(3, 5, 4);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
        rim.position.set(-4, 2, -3);
        scene.add(rim);

        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync('/models/molly-head.glb');
        if (cancelled) return;
        model = gltf.scene;
        // Tripo GLBs ship metal defaults that render pitch black under
        // plain lights without an environment map — tame them first.
        tameTripoMaterials(model);
        // Turntable pivot at the model's center, so the turn reads as a
        // head turning rather than orbiting around a far origin.
        const bbox = new THREE.Box3().setFromObject(model);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const pivot = new THREE.Group();
        pivot.position.copy(center);
        model.position.sub(center);
        pivot.add(model);
        scene.add(pivot);
        camera.position.set(center.x + maxDim * 0.4, center.y + maxDim * 0.35, center.z + maxDim * 1.9);
        camera.lookAt(center);
        // Face-forward base: +Z toward the camera (the GLB's jaw sits
        // further +Z than its crown, so +Z is the face side). Stored
        // once — the camera never moves — and the tilt offset below
        // rides on top of it each frame.
        pivot.lookAt(camera.position);
        baseQuatRef.current = pivot.quaternion.clone();

        const tick = (t) => {
          raf = requestAnimationFrame(tick);
          if (contextGuard && contextGuard.isLost()) return;
          const dt = Math.min(0.05, (t - clockHolder.last) / 1000 || 0.016);
          clockHolder.last = t;
          if (baseQuatRef.current) {
            // Ease the tilt toward its target (and back to forward
            // when the target is zeroed); base facing never moves.
            const k = 1 - Math.exp(-9 * dt);
            tiltRef.current.yaw += (targetRef.current.yaw - tiltRef.current.yaw) * k;
            tiltRef.current.pitch += (targetRef.current.pitch - tiltRef.current.pitch) * k;
            const tq = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(tiltRef.current.pitch, tiltRef.current.yaw, 0, 'YXZ'),
            );
            pivot.quaternion.copy(baseQuatRef.current).multiply(tq);
          }
          renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(tick);
        if (!cancelled) setStatus('ready');
      } catch (e) {
        if (!cancelled) {
          console.error('Molly head failed to load', e);
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (contextGuard) contextGuard.dispose();
      if (raf) cancelAnimationFrame(raf);
      if (model) {
        model.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => m.dispose());
          }
        });
      }
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phone-tilt follow: calibrate the neutral hold on the first
  // reading after enabling, then map tilt deltas through the
  // portal-card tilt law. iOS needs a permission tap; other
  // platforms fire the event without one. Reduced motion never
  // listens — forward-only, always.
  useEffect(() => {
    if (!motionOn || reducedMotion) return undefined;
    const onOrient = (e) => {
      if (e.gamma == null || e.beta == null) return;
      if (!baselineRef.current) {
        baselineRef.current = { gamma: e.gamma, beta: e.beta };
        return;
      }
      const { yaw, pitch } = tiltFromOrientation({
        gammaDelta: e.gamma - baselineRef.current.gamma,
        betaDelta: e.beta - baselineRef.current.beta,
      });
      targetRef.current = { yaw, pitch };
    };
    window.addEventListener('deviceorientation', onOrient);
    return () => {
      window.removeEventListener('deviceorientation', onOrient);
      baselineRef.current = null;
    };
  }, [motionOn, reducedMotion]);

  async function toggleMotion() {
    if (motionOn) {
      targetRef.current = { yaw: 0, pitch: 0 };
      baselineRef.current = null;
      setMotionOn(false);
      return;
    }
    try {
      const DOE = window.DeviceOrientationEvent;
      if (DOE && typeof DOE.requestPermission === 'function') {
        const res = await DOE.requestPermission();
        if (res !== 'granted') return;
      }
    } catch {
      return;
    }
    setMotionOn(true);
  }

  if (status === 'error') return fallback;
  return (
    <>
      <div ref={mountRef} style={{ width: '100%', maxWidth: 220, height: 220 }} className={`mx-auto ${className}`}>
        {status === 'loading' && (
          <p className="flex h-full items-center justify-center text-center text-xs text-zinc-500">Loading Molly's head…</p>
        )}
      </div>
      {showMotionToggle && status === 'ready' && !reducedMotion && (
        <button type="button" onClick={toggleMotion}
          className="mx-auto mt-1 block rounded-lg border border-zinc-700 px-3 py-1 text-xs font-bold text-zinc-100">
          {motionOn ? 'Follow motion: on' : 'Follow motion: off'}
        </button>
      )}
    </>
  );
}

