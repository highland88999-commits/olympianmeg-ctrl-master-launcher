'use client';
// components/dream-engine/DreamCanvas.jsx
// Thin R3F Canvas wrapper, dynamically imported with ssr:false by the page.

import { Canvas } from '@react-three/fiber';
import DreamScene from './DreamScene';

export default function DreamCanvas({ scene, rig, projectionUrl = null, showScreen = true }) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 55, near: 0.1, far: 400, position: [0, 1.7, 9] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ background: '#0b1026' }}
    >
      <DreamScene scene={scene} rig={rig} projectionUrl={projectionUrl} showScreen={showScreen} />
    </Canvas>
  );
}
