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
//
// TESSERACT ROOM (Merlin, 2026-11-03): the head floats inside a
// static 3D tesseract — a cube within a cube, wireframe, Marvel
// blue. It does NOT rotate. A blue light burns behind her like
// the Tesseract's glow, and a rainbow aura hugs her head. The
// room replaces the head's old empty space only — the rest of
// the card is untouched.
import { useEffect, useRef, useState } from 'react';
import { tameTripoMaterials } from '@/lib/characters/tame-materials';
import { guardCanvasContext } from '@/lib/scene-context-guard';
import { tiltFromOrientation } from '@/lib/portal-card-tilt';

// The tesseract's 16 corners: 8 for the outer cube, 8 for the
// inner cube (half the size, same centre). A tesseract is two
// cubes with each outer corner joined to its inner twin.
function tesseractGeometry(THREE, size) {
  const s = size / 2;
  const q = size / 4;
  const outer = [];
  const inner = [];
  for (const x of [-s, s]) for (const y of [-s, s]) for (const z of [-s, s]) {
    outer.push([x, y, z]);
    inner.push([x / 2, y / 2, z / 2]);
  }
  // Order the corners so index i of outer pairs with index i of inner.
  const pts = [];
  const edge = (a, b) => { pts.push(...a, ...b); };
  // Outer cube edges: corners differing in exactly one coordinate.
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
    const d = (outer[i][0] !== outer[j][0]) + (outer[i][1] !== outer[j][1]) + (outer[i][2] !== outer[j][2]);
    if (d === 1) edge(outer[i], outer[j]);
  }
  // Inner cube edges, same rule.
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
    const d = (inner[i][0] !== inner[j][0]) + (inner[i][1] !== inner[j][1]) + (inner[i][2] !== inner[j][2]);
    if (d === 1) edge(inner[i], inner[j]);
  }
  // The 8 struts joining each outer corner to its inner twin.
  for (let i = 0; i < 8; i++) edge(outer[i], inner[i]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

// Rainbow aura: a soft shell around the head whose colour drifts
// through the spectrum. Fresnel falloff so it glows at the
// silhouette, not over her face.
function auraMaterial(THREE) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vView;
      vec3 hue(float h) {
        vec3 p = abs(fract(h + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
        return clamp(p - 1.0, 0.0, 1.0);
      }
      void main() {
        float f = pow(1.0 - abs(dot(vNormal, vView)), 2.2);
        vec3 rainbow = hue(uTime * 0.08);
        gl_FragColor = vec4(rainbow * f * 0.9, f * 0.55);
      }`,
  });
}

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
    const roomDisposables = [];

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
        // TESSERACT BLUE (Merlin, 2026-11-03): a cold blue light
        // burning behind her head, like the Marvel Tesseract's
        // glow spilling past her silhouette.
        const tessLight = new THREE.PointLight(0x2e9bff, 12, 12, 1.6);
        tessLight.position.set(0, 0.4, -1.6);
        scene.add(tessLight);
        // The tesseract room itself: static wireframe, cube within
        // a cube, Marvel blue. It never rotates — her head is the
        // only thing that moves in here.
        const tessGeo = tesseractGeometry(THREE, 2.6);
        const tessLines = new THREE.LineSegments(
          tessGeo,
          new THREE.LineBasicMaterial({ color: 0x2e9bff, transparent: true, opacity: 0.75 }),
        );
        tessLines.position.set(0, 0.1, -0.4);
        scene.add(tessLines);
        roomDisposables.push(tessGeo, tessLines.material);
        // A faint blue wash on the room's back wall, so the
        // tesseract reads as a lit chamber, not floating lines.
        const glowTex = (() => {
          const c = document.createElement('canvas');
          c.width = c.height = 128;
          const g = c.getContext('2d');
          const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
          grad.addColorStop(0, 'rgba(46,155,255,0.55)');
          grad.addColorStop(1, 'rgba(46,155,255,0)');
          g.fillStyle = grad;
          g.fillRect(0, 0, 128, 128);
          const t = new THREE.CanvasTexture(c);
          return t;
        })();
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTex, transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, opacity: 0.8,
        }));
        glow.scale.set(3.2, 3.2, 1);
        glow.position.set(0, 0.1, -1.2);
        scene.add(glow);
        roomDisposables.push(glowTex, glow.material);

        // LOAD FIX (Merlin, 2026-11-03): the head sometimes hung
        // on "Loading…" forever — a 12-second timeout plus one
        // retry, then the fallback. Never a stuck spinner.
        const loader = new GLTFLoader();
        let gltf = null;
        let lastErr = null;
        for (let attempt = 0; attempt < 2 && !gltf; attempt++) {
          try {
            gltf = await Promise.race([
              loader.loadAsync('/models/molly-head.glb'),
              new Promise((_, reject) => setTimeout(() => reject(new Error('head load timeout')), 12000)),
            ]);
          } catch (e) { lastErr = e; }
        }
        if (!gltf) throw lastErr || new Error('head failed to load');
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
        // RAINBOW AURA (Merlin, 2026-11-03): a soft spectral shell
        // hugging her head, drifting through the rainbow. It rides
        // the pivot so it follows her tilt.
        const auraMat = auraMaterial(THREE);
        const aura = new THREE.Mesh(
          new THREE.SphereGeometry(maxDim * 0.85, 32, 32),
          auraMat,
        );
        pivot.add(aura);
        roomDisposables.push(aura.geometry, auraMat);

        const tick = (t) => {
          raf = requestAnimationFrame(tick);
          if (contextGuard && contextGuard.isLost()) return;
          const dt = Math.min(0.05, (t - clockHolder.last) / 1000 || 0.016);
          clockHolder.last = t;
          // The aura's rainbow drifts with time.
          auraMat.uniforms.uTime.value = t / 1000;
          // Her head's gentle float — the same quiet hover it
          // always had, untouched by the room around it.
          pivot.position.y = center.y + Math.sin(t / 1400) * maxDim * 0.03;
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
      // The tesseract room's own pieces.
      for (const d of roomDisposables) {
        try { if (d && typeof d.dispose === 'function') d.dispose(); } catch {}
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

