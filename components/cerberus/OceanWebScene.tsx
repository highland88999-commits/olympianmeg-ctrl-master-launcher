import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Line, Float, Text, Billboard } from '@react-three/drei'
import * as THREE from 'three'
import { useCerberusStore } from '@/store/cerberus/useCerberusStore'

export default function OceanWebScene() {
  const { nodes, activeFrameId, openFrame, cameraDistance } = useCerberusStore()
  const mapRef = useRef<THREE.Group>(null)
  const { camera } = useThree()

  useFrame((state, delta) => {
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, cameraDistance, delta * 3)
    if (mapRef.current && !activeFrameId) {
      mapRef.current.rotation.y += delta * 0.05
    }
  })

  return (
    <group ref={mapRef}>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {nodes.map((node) => {
        const isSelected = activeFrameId === node.id

        return (
          <group key={node.id}>
            <Line
              points={[[0, 0, 0], node.position]}
              color="#ffffff"
              opacity={isSelected ? 1 : 0.6}
              transparent
              lineWidth={3} 
            />

            <Float speed={2} rotationIntensity={1} floatIntensity={2}>
              <group
                position={node.position}
                onClick={(e) => {
                  e.stopPropagation()
                  openFrame(node.id)
                }}
                onPointerOver={() => (document.body.style.cursor = 'pointer')}
                onPointerOut={() => (document.body.style.cursor = 'default')}
              >
                <mesh>
                  <icosahedronGeometry args={[isSelected ? 1.5 : 1.2, 1]} />
                  <meshPhysicalMaterial
                    color="#ffffff"
                    transmission={0.9}
                    opacity={1}
                    transparent
                    roughness={0.1}
                    metalness={0.8}
                    wireframe={!isSelected}
                  />
                </mesh>

                <mesh>
                  <octahedronGeometry args={[isSelected ? 0.8 : 0.5, 0]} />
                  <meshStandardMaterial
                    color="#ffffff"
                    emissive="#c0c0c0"
                    emissiveIntensity={isSelected ? 3 : 1}
                    metalness={1}
                    roughness={0.2}
                  />
                </mesh>
              </group>

              <Billboard position={[node.position[0], node.position[1] - 2.5, node.position[2]]}>
                <Text
                  fontSize={0.8}
                  color="#ffffff"
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={0.05}
                  outlineColor="#000000"
                  font="/fonts/ShareTechMono-Regular.ttf"
                >
                  {node.name}
                </Text>
              </Billboard>
            </Float>
          </group>
        )
      })}
    </group>
  )
}


