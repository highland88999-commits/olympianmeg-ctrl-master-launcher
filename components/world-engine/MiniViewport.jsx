// World Engine — MiniViewport: small live 3D preview per builder sector.
// Ported from nexus-vortex's components/3d/MiniViewport.jsx.
'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildWeapon } from '@/lib/world-engine/weapon-builder';

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

    const animate = () => {
      requestRef.current = requestAnimationFrame(animate);
      controls.update();

      if (category === 'weather' && meshRef.current) {
        const positions = meshRef.current.geometry.attributes.position.array;
        for (let i = 1; i < positions.length; i += 3) {
          positions[i] -= (params?.windSpeed || 10) * 0.001;
          if (positions[i] < -2) positions[i] = 5;
        }
        meshRef.current.geometry.attributes.position.needsUpdate = true;
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
        geometry = new THREE.SphereGeometry(params?.terrainRoughness ? 2 + params.terrainRoughness : 2, 32, 32);
        break;
      case 'weather': {
        geometry = new THREE.BufferGeometry();
        const count = Math.floor(2000 * (params?.precipitationIntensity || 0.1));
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count * 3; i++) {
          positions[i] = (Math.random() - 0.5) * 10;
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        material = new THREE.PointsMaterial({ color: themeHex, size: 0.05, transparent: true, opacity: 0.8 });
        mesh = new THREE.Points(geometry, material);
        break;
      }
      default:
        geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    if (!mesh) mesh = new THREE.Mesh(geometry, material);

    if (category === 'character') mesh.position.y = (params?.height || 1.8) / 2 + 0.25;
    if (category === 'object' || category === 'asset_link') mesh.position.y = (params?.scale?.y || 1) / 2;
    if (category === 'vehicle') mesh.position.y = 0.4;

    scene.add(mesh);
    meshRef.current = mesh;
  }, [category, params]);

  return <div className="absolute inset-0 z-0 h-full w-full" ref={mountRef} />;
}
