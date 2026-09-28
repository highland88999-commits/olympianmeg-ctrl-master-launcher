// components/hermes/GalaxyCanvas.jsx
// Procedural starfield backdrop. No video hosts, no tracking, no external assets.
// Lighting kept restrained per the house rule: dim points, no bloom.
'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function GalaxyCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 10000);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    const galaxyColors = [0x00c8d8, 0x7a4fd0, 0xb06ab3];
    let colorIndex = 0;
    const targetColor = new THREE.Color(galaxyColors[0]);

    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    for (let i = 0; i < 6000; i++) {
      vertices.push(
        THREE.MathUtils.randFloatSpread(6000),
        THREE.MathUtils.randFloatSpread(6000),
        THREE.MathUtils.randFloatSpread(6000)
      );
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const material = new THREE.PointsMaterial({ color: 0x00c8d8, size: 1.4, transparent: true, opacity: 0.55 });
    const particlesMesh = new THREE.Points(geometry, material);
    scene.add(particlesMesh);
    camera.position.z = 1200;

    const colorInterval = setInterval(() => {
      colorIndex = (colorIndex + 1) % galaxyColors.length;
      targetColor.setHex(galaxyColors[colorIndex]);
    }, 12000);

    let animationFrameId;
    function animate() {
      animationFrameId = requestAnimationFrame(animate);
      particlesMesh.rotation.y += 0.0006;
      particlesMesh.rotation.x += 0.0003;
      material.color.lerp(targetColor, 0.01);
      renderer.render(scene, camera);
    }
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearInterval(colorInterval);
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 -z-10 h-full w-full" />;
}
