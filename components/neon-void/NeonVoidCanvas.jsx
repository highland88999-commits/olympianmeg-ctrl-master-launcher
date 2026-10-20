'use client';
// components/neon-void/NeonVoidCanvas.jsx
// Thin R3F Canvas wrapper, dynamically imported with ssr:false by the page.

import { Canvas } from '@react-three/fiber';
import NeonVoidScene from './NeonVoidScene';

export default function NeonVoidCanvas({ stateRef }) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 50, near: 0.1, far: 120, position: [0, 20, 13] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ background: '#020208' }}
    >
      <NeonVoidScene stateRef={stateRef} />
    </Canvas>
  );
}
