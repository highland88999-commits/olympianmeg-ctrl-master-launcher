// World Engine — MiniViewport: small live 3D preview per builder sector.
// Ported from nexus-vortex's components/3d/MiniViewport.jsx.
'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { guardCanvasContext } from '@/lib/scene-context-guard';
import { buildCreationMesh, creationThemeColor } from '@/lib/world-engine/creation-mesh';
import {
  UPLINK_LOAD_TIMEOUT_MS,
  applyUplinkScale,
  groundUplinkModel,
  isLoadableAssetUrl,
  uplinkPreviewState,
} from '@/lib/world-engine/uplink-load';

const getThemeColor = creationThemeColor;

export default function MiniViewport({ category, params }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const meshRef = useRef(null);
  const requestRef = useRef(null);
  // Uplink only: the GLB once loaded (keyed by its URL, so a scale
  // slider drag never re-downloads it) and the URL of a load in
  // flight. loadTokenRef invalidates a stale load when a newer load
  // starts or the viewport unmounts.
  const loadedRef = useRef(null);
  const loadingUrlRef = useRef('');
  const loadTokenRef = useRef(0);
  const [uplinkStatus, setUplinkStatus] = useState('idle');

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 100);
    camera.position.set(0, 2, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // Context-loss guard (fleet rollout 2026-10-15) — this viewport is the
    // shared 3D surface for the World Engine builders, the store profile
    // and the auction house: transient losses heal in place, a loss that
    // stays gone surfaces the FEED LOST fallback, and animate() freezes
    // while the context is lost.
    const contextGuard = guardCanvasContext(renderer.domElement, { label: 'WORLD ENGINE' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2.0;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    const grid = new THREE.GridHelper(10, 20, getThemeColor(category), 0x222222);
    grid.material.opacity = 0.2;
    grid.material.transparent = true;
    scene.add(grid);

    const clock = new THREE.Clock();
    const animate = () => {
      requestRef.current = requestAnimationFrame(animate);
      if (contextGuard.isLost()) return; // frozen while the context is gone
      controls.update();

      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      if (meshRef.current && typeof meshRef.current.userData.update === 'function') {
        meshRef.current.userData.update(dt, t);
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(container.clientHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      // Invalidate any uplink load still in flight: a late success
      // must never add a model to a disposed scene.
      loadTokenRef.current += 1;
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(requestRef.current);
      contextGuard.dispose();
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    // ASSET UPLINK (GAP 4): when the params carry a loadable .glb URL,
    // the linked model replaces the placeholder box once loaded. The
    // box stays visible while loading and on failure, with a
    // plain-words line under the preview (rendered below). Every other
    // category runs the original path untouched.
    const url = category === 'asset_link' ? params?.url : '';
    const loadable = isLoadableAssetUrl(url);

    // Same URL already loaded: a scale slider drag only re-applies
    // the scale — it never re-downloads the model.
    if (loadable && loadedRef.current && loadedRef.current.userData.uplinkUrl === url) {
      applyUplinkScale(loadedRef.current, params?.scale);
      groundUplinkModel(THREE, loadedRef.current);
      if (meshRef.current && meshRef.current !== loadedRef.current) {
        scene.remove(meshRef.current);
      }
      if (!scene.children.includes(loadedRef.current)) scene.add(loadedRef.current);
      meshRef.current = loadedRef.current;
      setUplinkStatus('loaded');
      return;
    }

    // Same URL already loading: leave the load alone, just rebuild
    // the placeholder box at the current scale.
    const alreadyLoading = loadable && loadingUrlRef.current === url;

    if (meshRef.current) {
      scene.remove(meshRef.current);
      // Deep-dispose: weapon builds are Groups of many meshes. The shared
      // gold-Omega texture is cached on purpose, so maps are left alone.
      meshRef.current.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose());
        }
      });
      meshRef.current = null;
    }
    // A loaded model from another URL (or another category) is gone
    // with meshRef above; drop the reference so it cannot be reused.
    if (!alreadyLoading) loadedRef.current = null;

    // The mesh itself is built by the shared creation-mesh helper — the
    // same mesh the profile download exports, so preview and file can
    // never drift apart. Scene dressing (lights, grid, background)
    // stays here. For the uplink this box is the loading / failed /
    // no-URL placeholder; the loaded GLB swaps in below.
    const mesh = buildCreationMesh(THREE, category, params || {});

    // Weather systems set their own sky.
    if (category === 'weather' && typeof mesh.userData.skyColor === 'number') {
      scene.background = new THREE.Color(mesh.userData.skyColor);
    } else {
      scene.background = null;
    }

    scene.add(mesh);
    meshRef.current = mesh;

    if (!loadable) {
      // The URL went away (or the builder changed) while a load was
      // in flight: invalidate it so a late success cannot resurrect
      // a model for a URL that is no longer there.
      if (loadingUrlRef.current) {
        loadTokenRef.current += 1;
        loadingUrlRef.current = '';
      }
      setUplinkStatus('idle');
      return;
    }
    if (alreadyLoading) return;

    // Fresh load for this URL. The loader is imported lazily so the
    // GLTFLoader never enters the bundle until an uplink preview
    // actually needs it (the repo's established pattern). A 404, a
    // CORS block, or a bad file rejects the load; the timeout caps a
    // hung fetch so the preview can never spin forever.
    const token = ++loadTokenRef.current;
    loadingUrlRef.current = url;
    setUplinkStatus('loading');
    let timeoutId = null;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Uplink load timed out.')), UPLINK_LOAD_TIMEOUT_MS);
    });
    const loaded = (async () => {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      return new GLTFLoader().loadAsync(url);
    })();
    Promise.race([loaded, timeout])
      .then((gltf) => {
        clearTimeout(timeoutId);
        if (token !== loadTokenRef.current) return; // superseded or unmounted
        loadingUrlRef.current = '';
        const model = gltf.scene;
        model.userData.uplinkUrl = url;
        applyUplinkScale(model, params?.scale);
        groundUplinkModel(THREE, model);
        if (meshRef.current) {
          scene.remove(meshRef.current);
          meshRef.current.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
              const mats = Array.isArray(o.material) ? o.material : [o.material];
              mats.forEach((m) => m.dispose());
            }
          });
        }
        scene.add(model);
        meshRef.current = model;
        loadedRef.current = model;
        setUplinkStatus('loaded');
      })
      .catch(() => {
        clearTimeout(timeoutId);
        if (token !== loadTokenRef.current) return; // superseded or unmounted
        loadingUrlRef.current = '';
        setUplinkStatus('failed');
      });
  }, [category, params]);

  // Plain-words uplink state line, rendered from the shared preview
  // state (uplink-load.js). Only the uplink ever shows one; every
  // other category gets null here, so their previews are unchanged.
  const preview = uplinkPreviewState({
    category,
    url: params?.url,
    loadStatus: uplinkStatus,
  });

  return (
    <div className="absolute inset-0 z-0 h-full w-full" ref={mountRef}>
      {preview.statusLine && (
        <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap bg-black/70 px-3 py-1 text-xs text-gray-200">
          {preview.statusLine}
        </div>
      )}
    </div>
  );
}
