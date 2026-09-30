import { useState } from 'react'
import { useGameStore } from '@/store/battleship/useGameStore'
import { ThreeEvent } from '@react-three/fiber'

export default function TargetingGrid() {
  const { status, turn, viewMode, broadcastShot, placeShip, placementOrientation, placingIndex, playerShips } = useGameStore()
  const [hover, setHover] = useState<[number, number] | null>(null)

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (status !== 'setup' && (status !== 'playing' || turn !== 'player' || viewMode !== 'target')) {
      setHover(null)
      return
    }
    const gridX = Math.floor(e.point.x / 2) * 2 + 1;
    const gridZ = Math.floor(e.point.z / 2) * 2 + 1;
    if (Math.abs(gridX) <= 9 && Math.abs(gridZ) <= 9) {
      setHover([gridX, gridZ])
    } else {
      setHover(null)
    }
  }

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    
    const gridX = Math.floor(e.point.x / 2) * 2 + 1;
    const gridZ = Math.floor(e.point.z / 2) * 2 + 1;
    
    if (Math.abs(gridX) > 9 || Math.abs(gridZ) > 9) return;

    if (status === 'setup') {
      placeShip(gridX, gridZ)
    } else if (status === 'playing' && turn === 'player' && viewMode === 'target') {
      broadcastShot(gridX, gridZ)
    }
  }

  const currentShip = playerShips[placingIndex];
  const length = currentShip?.length || 1;
  const isHoriz = placementOrientation === 'horizontal';
  const cx = isHoriz ? (length - 1) * 1 : 0;
  const cz = isHoriz ? 0 : (length - 1) * 1;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} onPointerMove={handlePointerMove} onPointerOut={() => setHover(null)} onClick={handleClick}>
        <planeGeometry args={[20, 20]} />
        <meshBasicMaterial visible={false} /> 
      </mesh>

      {status === 'setup' && hover && currentShip && (
        <mesh position={[hover[0] + cx, 0.4, hover[1] + cz]}>
          <boxGeometry args={[isHoriz ? length * 2 - 0.4 : 1.2, 0.6, isHoriz ? 1.2 : length * 2 - 0.4]} />
          <meshBasicMaterial color="#00f2ff" opacity={0.5} transparent wireframe />
        </mesh>
      )}

      {status === 'playing' && viewMode === 'target' && hover && (
        <mesh position={[hover[0], 0.1, hover[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.8, 1.8]} />
          <meshBasicMaterial color="#ff00ff" opacity={0.3} transparent />
        </mesh>
      )}
    </group>
  )
}


