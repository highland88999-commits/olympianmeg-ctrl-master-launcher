'use client';
// components/swamp-run/SwampRunCanvas.jsx
// Thin R3F Canvas wrapper, dynamically imported with ssr:false by the page.

import { Canvas } from '@react-three/fiber';
import SwampRunScene from './SwampRunScene';

export default function SwampRunCanvas({ stateRef }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ fov: 55, near: 0.1, far: 400, position: [0, 7, -12] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ background: '#27351d' }}
    >
      <SwampRunScene stateRef={stateRef} />
    </Canvas>
  );
}
