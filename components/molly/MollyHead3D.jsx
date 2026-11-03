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

// TESSERACT FLOW (Merlin, 2026-11-03): no wireframe — the whole
// space IS the Tesseract's interior. A full-bleed shader plane
// behind her head carries flowing blue energy: currents of light
// drifting and pulsing like the Marvel Tesseract's power. The
// head itself is untouched — same size, same float, same tilt.

// Flowing Tesseract energy: layered drifting noise in deep blue
// to electric cyan, with bright currents that surge and fade.
// This is the room's back wall — the whole space she floats in.
function tesseractFlowMaterial(THREE) {
  return new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uAspect: { value: 1 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uAspect;
      varying vec2 vUv;
      // Cheap hash + value noise + fbm — smooth enough for energy.
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      void main() {
        vec2 uv = vUv;
        uv.x *= uAspect;
        float t = uTime * 0.35;
        // Two drifting noise fields, flowing in different directions —
        // their interference makes the currents.
        float n1 = fbm(uv * 3.0 + vec2(t * 0.7, -t * 0.4));
        float n2 = fbm(uv * 5.0 - vec2(t * 0.5, t * 0.9) + n1 * 2.0);
        float flow = fbm(uv * 2.0 + vec2(n2 * 3.0 - t, n1 * 2.0 + t * 0.6));
        // Deep space blue base, electric cyan currents, white-hot cores.
        vec3 deep = vec3(0.02, 0.08, 0.22);
        vec3 mid = vec3(0.10, 0.45, 1.00);
        vec3 hot = vec3(0.55, 0.95, 1.00);
        vec3 col = mix(deep, mid, smoothstep(0.25, 0.75, flow));
        col = mix(col, hot, smoothstep(0.72, 0.95, flow) * 0.85);
        // Gentle pulse — the Tesseract breathes.
        col *= 0.85 + 0.15 * sin(uTime * 1.4 + flow * 6.0);
        // Vignette: darker at the edges, her head stays the focus.
        vec2 c = vUv - 0.5;
        c.x *= uAspect;
        col *= smoothstep(0.85, 0.25, length(c));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
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
        // The space fills its container now — full card width, taller.
        // The HEAD stays exactly the same size: the camera keeps its
        // distance and field of view, so she renders at the same
        // pixel size with more Tesseract around her.
        const w = mount.clientWidth || 340;
        const h = Math.round(w * 0.85);

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
        // FLOWING TESSERACT (Merlin, 2026-11-03): the wireframe is
        // gone. The back wall is a living sheet of blue energy —
        // currents drifting and surging like the Tesseract's power.
        const flowMat = tesseractFlowMaterial(THREE);
        flowMat.uniforms.uAspect.value = w / h;
        const flowPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(8, 8),
          flowMat,
        );
        flowPlane.position.set(0, 0.1, -2.5);
        scene.add(flowPlane);
        roomDisposables.push(flowPlane.geometry, flowMat);
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
          // The aura's rainbow drifts with time; the Tesseract's
          // blue currents flow behind her.
          auraMat.uniforms.uTime.value = t / 1000;
          flowMat.uniforms.uTime.value = t / 1000;
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
      <div ref={mountRef} style={{ width: '100%', aspectRatio: '1 / 0.85' }} className={`mx-auto overflow-hidden rounded-xl ${className}`}>
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

