'use client';
// components/tidal-rush/TidalRushCanvas.jsx
// Thin R3F Canvas wrapper, dynamically imported with ssr:false by the page.

import { Canvas } from '@react-three/fiber';
import TidalRushScene from './TidalRushScene';

export default function TidalRushCanvas({ stateRef }) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 62, near: 0.1, far: 2400, position: [0, 9, -26] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ background: '#7ec8e3' }}
    >
      <TidalRushScene stateRef={stateRef} />
    </Canvas>
  );
}
