import { useMemo } from 'react';
import * as THREE from 'three';

export default function Board({ onTileClick, boardTex, highlights = [] }) {
  const tiles = useMemo(() => {
    const grid = [];
    for (let x = 0; x < 8; x++) {
      for (let z = 0; z < 8; z++) {
        const isLight = (x + z) % 2 !== 0; 
        grid.push({ x, z, isLight });
      }
    }
    return grid;
  }, []);

  const highlightSet = useMemo(() => {
    const s = new Set();
    for (const h of highlights) s.add(`${h.x},${h.z}`);
    return s;
  }, [highlights]);

  return (
    <group>
      {boardTex && (
        <mesh position={[0, 0.038, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[8, 8]} />
          <meshBasicMaterial map={boardTex} toneMapped={false} />
        </mesh>
      )}
      <mesh position={[0, 0.041, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 8]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.05} />
      </mesh>
      <gridHelper args={[8, 8, '#000000', '#000000']} position={[0, 0.042, 0]} />
      {tiles.map(({ x, z, isLight }) => (
        <mesh key={`${x}-${z}`} position={[x - 3.5, 0, z - 3.5]} onClick={(e) => { e.stopPropagation(); onTileClick(x, z); }}>
          <boxGeometry args={[0.98, 0.08, 0.98]} />
          <meshStandardMaterial color="#000000" transparent={isLight} opacity={isLight ? 0 : 1} roughness={0.8} metalness={0.1} />
          {highlightSet.has(`${x},${z}`) && (
            <mesh position={[0, 0.06, 0]}>
              <cylinderGeometry args={[0.14, 0.14, 0.02, 24]} />
              <meshBasicMaterial color="#00f2ff" transparent opacity={0.85} toneMapped={false} />
            </mesh>
          )}
        </mesh>
      ))}
    </group>
  );
}
