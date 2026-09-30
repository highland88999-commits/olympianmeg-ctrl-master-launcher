import { useVideoTexture } from '@react-three/drei'

export default function GameBoard() {
  const videoTexture = useVideoTexture("/assets/battleship/board-texture.mp4")

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial map={videoTexture} color="#222" roughness={0.2} metalness={0.8} />
        <gridHelper args={[20, 10, '#00f2ff', '#ff00ff']} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.01]} />
      </mesh>
    </group>
  )
}


