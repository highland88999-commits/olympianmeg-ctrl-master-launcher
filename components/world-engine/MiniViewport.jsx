// World Engine — MiniViewport: small live 3D preview per builder sector.
// Ported from nexus-vortex's components/3d/MiniViewport.jsx.
'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { guardCanvasContext } from '@/lib/scene-context-guard';
import { buildWeapon } from '@/lib/world-engine/weapon-builder';
import { buildWeatherSystem } from '@/lib/world-engine/weather-builder';
import { buildWorld } from '@/lib/world-engine/world-builder';
import { makeOmegaBadge } from '@/lib/omega-brand';

const getThemeColor = (category) => {
  const colors = {
    weapon: 0xffd700,
    character: 0xff00ff,
    object: 0x00ffcc,
    vehicle: 0xff5500,
    weather: 0x0055ff,
    world: 0x00f0ff,
    asset_link: 0x00ff00,
  };
  return colors[category] || 0xffffff;
};

export default function MiniViewport({ category, params }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const meshRef = useRef(null);
  const requestRef = useRef(null);

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
    }

    const themeHex = getThemeColor(category);
    let geometry, material, mesh;

    if (category !== 'weapon') {
      material = new THREE.MeshStandardMaterial({
        color: themeHex,
        emissive: themeHex,
        emissiveIntensity: 0.4,
        wireframe: category === 'world',
        transparent: true,
        opacity: 0.9,
      });
    }

    switch (category) {
      case 'weapon':
        // CoD-level procedural build with gold Omega branding.
        mesh = buildWeapon(THREE, params || {});
        mesh.rotation.y = Math.PI / 2; // side profile to the camera
        mesh.position.y = 0.85;
        break;
      case 'character':
        geometry = new THREE.CapsuleGeometry(0.5, params?.height || 1.8, 4, 16);
        break;
      case 'object':
      case 'asset_link':
        geometry = new THREE.BoxGeometry(params?.scale?.x || 1, params?.scale?.y || 1, params?.scale?.z || 1);
        break;
      case 'vehicle':
        geometry = new THREE.BoxGeometry(2, 0.8, 4);
        if (params?.speed) geometry.scale(1, 1, 1 + params.speed * 0.005);
        break;
      case 'world':
        // Textured procedural planet: displaced terrain, biome colors,
        // atmosphere shell, slow spin, gold Ω stamp (inside buildWorld).
        mesh = buildWorld(THREE, params || {});
        mesh.position.y = 0.4;
        break;
      case 'weather': {
        // Full weather system: rain, snow, fog, storm, ash, clear — each with
        // its own particles, palette, and per-frame behavior.
        mesh = buildWeatherSystem(THREE, params || {});
        mesh.position.y = 0.5;
        break;
      }
      default:
        geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    if (!mesh) mesh = new THREE.Mesh(geometry, material);

    // Golden Ω brand stamp on every forge preview (weapons brand inside buildWeapon).
    // Each badge is placed for the category: chest emblem, front decal, hood mark, floating stamp.
    if (category === 'character') {
      const badge = makeOmegaBadge(THREE, 0.35);
      badge.position.set(0, 0.55, 0.52); // chest, just off the capsule surface
      mesh.add(badge);
    } else if (category === 'object' || category === 'asset_link') {
      const badge = makeOmegaBadge(THREE, 0.3);
      const depth = params?.scale?.z || 1;
      badge.position.set(0, 0, depth / 2 + 0.012); // front face
      mesh.add(badge);
    } else if (category === 'vehicle') {
      const badge = makeOmegaBadge(THREE, 0.4);
      badge.position.set(0, 0.1, 2.012); // hood/front mark
      mesh.add(badge);
    }
    // world carries its Ω stamp inside buildWorld; weather is raw particles.

    if (category === 'character') mesh.position.y = (params?.height || 1.8) / 2 + 0.25;
    if (category === 'object' || category === 'asset_link') mesh.position.y = (params?.scale?.y || 1) / 2;
    if (category === 'vehicle') mesh.position.y = 0.4;

    // Weather systems set their own sky.
    if (category === 'weather' && typeof mesh.userData.skyColor === 'number') {
      scene.background = new THREE.Color(mesh.userData.skyColor);
    } else {
      scene.background = null;
    }

    scene.add(mesh);
    meshRef.current = mesh;
  }, [category, params]);

  return <div className="absolute inset-0 z-0 h-full w-full" ref={mountRef} />;
}
