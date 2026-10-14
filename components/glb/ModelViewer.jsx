'use client';

// ModelViewer — reusable GLB preview with animation picker.
// Props:
//   src            GLB url, e.g. "/models/avatars/scout.glb"
//   animations     list of clip names offered in the picker (default: from file)
//   tint           hex color applied to ArmorPrimary / ArmorSecondary materials
//   autoRotate     slowly turntable the model (default true)
//   showPicker     show the animation picker buttons (default true)
//   height         css height of the canvas area (default 320)
//   characterId    WAVE 4: a platform roster characterId instead of
//                  src. Roster GLBs carry NO baked animation clips,
//                  so the figure is the Wave 0 embodiment
//                  (lib/characters/character-glb.js) standing in the
//                  pose driver's idle — driven, never a faked clip
//                  picker, and no tint (legends wear their own
//                  colors). The adapter is imported lazily, like
//                  three itself, so src-only pages pay nothing extra.
//
// three.js is imported lazily so pages without 3D pay nothing.
// Fully disposes GPU resources on unmount (no leaked renderers).
import { useEffect, useRef, useState } from 'react';

const PRETTY = { idle: 'Idle', walk: 'Walk', run: 'Run', wave: 'Wave', drive: 'Drive', hover: 'Hover', beacon: 'Beacon' };
const pretty = (n) => PRETTY[n] || n.charAt(0).toUpperCase() + n.slice(1);

export default function ModelViewer({ src, animations, tint, autoRotate = true, showPicker = true, height = 320, characterId = null }) {
  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const [clips, setClips] = useState([]);
  const [active, setActive] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error

  useEffect(() => {
    let cancelled = false;
    let renderer, scene, camera, controls, mixer, raf, charHandle;
    const clockHolder = { last: 0 };

    (async () => {
      try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        if (cancelled || !mountRef.current) return;

        const mount = mountRef.current;
        const w = mount.clientWidth || 300;
        const h = height;

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        mount.appendChild(renderer.domElement);

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);

        // Restrained lighting: soft key + fill, no bloom. Texture/materials stay readable.
        scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1c22, 0.9));
        const key = new THREE.DirectionalLight(0xffffff, 1.6);
        key.position.set(3, 5, 4);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
        rim.position.set(-4, 2, -3);
        scene.add(rim);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enablePan = false;
        controls.minDistance = 1.2;
        controls.maxDistance = 12;
        controls.autoRotate = !!autoRotate;
        controls.autoRotateSpeed = 1.2;

        // WAVE 4 — roster character mode: the Wave 0 embodiment on
        // this same stage. The model arrives normalized onto the
        // floor at the human scale class, feet at y=0; the pose
        // driver holds it in idle (its own movement profile colors
        // the idle — Slimer hovers, Jason looms). No clip picker:
        // setClips stays empty because there are no clips to pick.
        if (characterId) {
          const { attachCharacterGlb } = await import('@/lib/characters/character-glb');
          const { procSizeForScaleClass } = await import('@/lib/characters/embodiment');
          if (cancelled || !mountRef.current) return;
          const procSize = procSizeForScaleClass('human') || { x: 1.9, y: 1.9, z: 1.9 };
          charHandle = attachCharacterGlb({ characterId, procSize });
          if (!charHandle) { setStatus('error'); return; }
          scene.add(charHandle.group);
          const hgt = procSize.y;
          controls.target.set(0, hgt * 0.52, 0);
          camera.position.set(hgt * 0.62, hgt * 0.74, hgt * 1.55);
          camera.lookAt(controls.target);
          controls.update();
          setClips([]);
          const tickChar = (t) => {
            raf = requestAnimationFrame(tickChar);
            const dt = Math.min(0.05, (t - clockHolder.last) / 1000 || 0.016);
            clockHolder.last = t;
            charHandle.update('idle', dt, t / 1000, {});
            controls.update();
            renderer.render(scene, camera);
          };
          raf = requestAnimationFrame(tickChar);
          charHandle.ready
            .then((ok) => { if (!cancelled) setStatus(ok ? 'ready' : 'error'); })
            .catch(() => { if (!cancelled) setStatus('error'); });
          return;
        }

        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(src);
        if (cancelled) return;
        const model = gltf.scene;
        scene.add(model);

        // frame the model
        const bbox = new THREE.Box3().setFromObject(model);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        controls.target.copy(center);
        camera.position.set(center.x + maxDim * 1.1, center.y + maxDim * 0.55, center.z + maxDim * 1.9);
        camera.lookAt(center);
        controls.update();

        // animations
        mixer = new THREE.AnimationMixer(model);
        const names = (animations && animations.length ? animations : gltf.animations.map((c) => c.name));
        setClips(names);
        const actions = {};
        for (const clip of gltf.animations) {
          actions[clip.name] = mixer.clipAction(clip);
        }
        const play = (name) => {
          for (const k of Object.keys(actions)) actions[k].stop();
          if (name && actions[name]) {
            actions[name].reset().play();
            setActive(name);
          } else {
            setActive(null);
          }
        };

        apiRef.current = { play, names, THREE, model };

        const tick = (t) => {
          raf = requestAnimationFrame(tick);
          const dt = Math.min(0.05, (t - clockHolder.last) / 1000 || 0.016);
          clockHolder.last = t;
          if (mixer) mixer.update(dt);
          controls.update();
          renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(tick);

        // default: play the first offered clip (usually idle)
        if (names.length) play(names[0]);
        setStatus('ready');
      } catch (e) {
        if (!cancelled) {
          console.error('ModelViewer failed to load', src, e);
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (charHandle) { charHandle.dispose(); charHandle = null; }
      const api = apiRef.current;
      if (api && api.model) {
        api.model.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => m.dispose());
          }
        });
      }
      if (controls) controls.dispose();
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, characterId]);

  // apply tint when it changes
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !api.model || !tint) return;
    const { THREE, model } = api;
    const col = new THREE.Color(tint);
    const dark = col.clone().multiplyScalar(0.35);
    model.traverse((o) => {
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (m.name === 'ArmorPrimary') m.color.copy(col);
        if (m.name === 'ArmorSecondary') m.color.copy(dark);
      });
    });
  }, [tint, status]);

  return (
    <div>
      <div ref={mountRef} style={{ width: '100%', height, position: 'relative' }}
        className="rounded-lg overflow-hidden bg-black/40 border border-zinc-800">
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-xs tracking-[0.3em] uppercase">
            Loading model…
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center text-red-300/80 text-xs tracking-widest uppercase px-6 text-center">
            Could not load this model. Check your connection and try again.
          </div>
        )}
      </div>
      {showPicker && clips.length > 0 && status === 'ready' && (
        <div className="flex flex-wrap gap-2 mt-3 justify-center">
          {clips.map((c) => (
            <button
              key={c}
              onClick={() => apiRef.current && apiRef.current.play(c)}
              className={`px-4 py-2 rounded border text-xs font-bold tracking-[0.2em] uppercase transition-all ${
                active === c
                  ? 'border-cyan-400/70 bg-cyan-500/20 text-cyan-100'
                  : 'border-zinc-700 bg-black/40 text-zinc-400 hover:text-white hover:border-zinc-400'
              }`}
            >
              {pretty(c)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
