import * as THREE from 'three'
import { CellState } from '@/store/battleship/useGameStore'

const pegGeometry = new THREE.CylinderGeometry(0.2, 0.2, 1, 16)
const hitMaterial = new THREE.MeshStandardMaterial({ color: '#ff0055', emissive: '#ff0055', emissiveIntensity: 4, toneMapped: false })
const missMaterial = new THREE.MeshStandardMaterial({ color: '#00f2ff', emissive: '#00f2ff', emissiveIntensity: 4, toneMapped: false })

export default function Markers({ shots, isOpponent }: { shots: Record<string, CellState>, isOpponent: boolean }) {
  return (
    <group>
      {Object.entries(shots).map(([coord, result]) => {
        const [x, z] = coord.split(',').map(Number);
        return (
          <mesh key={`${isOpponent ? 'opp' : 'p1'}-${coord}`} position={[x, 0.5, z]} geometry={pegGeometry} material={result === 'hit' ? hitMaterial : missMaterial} />
        )
      })}
    </group>
  )
}


