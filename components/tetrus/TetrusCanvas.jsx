'use client';
// components/tetrus/TetrusCanvas.jsx
// Thin R3F Canvas wrapper, dynamically imported with ssr:false by the page.

import { Canvas } from '@react-three/fiber';
import TetrusScene from './TetrusScene';

export default function TetrusCanvas({ stateRef }) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 50, near: 0.1, far: 140, position: [0, 13, 16] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ background: '#030208' }}
    >
      <TetrusScene stateRef={stateRef} />
    </Canvas>
  );
}
