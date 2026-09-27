import { useFrame } from '@react-three/fiber'
import { useState, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { ShipData } from '@/store/battleship/useGameStore'

export default function Ship({ data }: { data: ShipData }) {
  const [particles, setParticles] = useState<any[]>([])
  const shipRef = useRef<THREE.Group>(null)

  useEffect(() => {
    if (data.destroyed && particles.length === 0 && data.position) {
      const newParticles = Array.from({ length: data.length * 15 }).map(() => ({
        position: new THREE.Vector3(data.position![0], data.position![1] + 0.5, data.position![2]),
        velocity: new THREE.Vector3((Math.random() - 0.5), Math.random(), (Math.random() - 0.5)),
        color: Math.random() > 0.5 ? '#00ffff' : '#ff00ff'
      }))
      setParticles(newParticles)
    }
  }, [data.destroyed, data.position, particles.length, data.length])

  useFrame(() => {
    if (data.destroyed && particles.length > 0) {
      setParticles(prev => prev.map(p => {
        p.position.add(p.velocity)
        p.velocity.y -= 0.02 
        return p
      }))
    }
  })

  if (!data.position) return null;

  const isHoriz = data.orientation === 'horizontal';
  const cx = isHoriz ? (data.length - 1) * 1 : 0;
  const cz = isHoriz ? 0 : (data.length - 1) * 1;
  const width = isHoriz ? data.length * 2 - 0.4 : 1.2;
  const depth = isHoriz ? 1.2 : data.length * 2 - 0.4;

  if (data.destroyed) {
    return (
      <group>
        {particles.map((p, i) => (
          <mesh key={i} position={p.position}>
            <boxGeometry args={[0.15, 0.15, 0.15]} />
            <meshStandardMaterial color={p.color} emissive={p.color} emissiveIntensity={3} toneMapped={false} />
          </mesh>
        ))}
      </group>
    )
  }

  return (
    <group ref={shipRef} position={[data.position[0] + cx, 0.4, data.position[2] + cz]}>
      <mesh castShadow>
        <boxGeometry args={[width, 0.6, depth]} />
        <meshStandardMaterial color="#0a0a0c" roughness={0.2} metalness={0.9} />
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[isHoriz ? width - 0.4 : 0.4, 0.2, isHoriz ? 0.4 : depth - 0.4]} />
        <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={2} toneMapped={false} />
      </mesh>
    </group>
  )
}


