'use client';
// components/crocodile-swamp/SwampCanvas.jsx
// Thin R3F Canvas wrapper, dynamically imported with ssr:false by the page.

import { Canvas } from '@react-three/fiber';
import SwampScene from './SwampScene';

export default function SwampCanvas({ stateRef }) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 55, near: 0.1, far: 220, position: [0, 26, 23] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ background: '#04140a' }}
    >
      <SwampScene stateRef={stateRef} />
    </Canvas>
  );
}
