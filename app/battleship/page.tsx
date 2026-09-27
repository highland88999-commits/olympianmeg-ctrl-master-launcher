'use client'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

import GameBoard from '@/components/battleship/GameBoard'
import Ship from '@/components/battleship/Ship'
import TargetingGrid from '@/components/battleship/TargetingGrid'
import Markers from '@/components/battleship/Markers'
import HUD from '@/components/battleship/HUD'
import Lobby from '@/components/battleship/Lobby'
import { useGameSync } from '@/hooks/battleship/useGameSync'
import { useGameStore } from '@/store/battleship/useGameStore'

function GameNetworkManager() {
  useGameSync()
  return null
}

export default function Game() {
  const router = useRouter()
  const [session, setSession] = useState<any>(null)
  const [mounted, setMounted] = useState(false)
  
  const roomId = useGameStore(state => state.roomId)
  const status = useGameStore(state => state.status)
  const viewMode = useGameStore(state => state.viewMode)
  const playerShips = useGameStore(state => state.playerShips)
  const opponentShips = useGameStore(state => state.opponentShips)
  const playerShots = useGameStore(state => state.playerShots)
  const opponentShots = useGameStore(state => state.opponentShots)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return router.push('/')
      setSession(session)
      setMounted(true)
    })
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.push('/')
      else setSession(session)
    })
    
    return () => subscription.unsubscribe()
  }, [router])

  if (!mounted || !session) return <div className="w-screen h-screen bg-black" />

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      <button 
        onClick={() => router.push('/')}
        className="absolute z-50 px-4 py-2 text-xs font-bold tracking-widest text-zinc-400 uppercase transition-colors border rounded top-5 right-5 bg-black/80 border-zinc-700 hover:text-fuchsia-400 hover:border-fuchsia-400"
      >
        EXIT MATRIX
      </button>

      {!roomId && <Lobby />}
      {roomId && <GameNetworkManager />}
      
      {roomId && (
        <>
          <HUD />
          <Canvas camera={{ position: [0, 25, 18], fov: 45 }}>
            <color attach="background" args={['#050505']} />
            
            <ambientLight intensity={0.2} />
            <directionalLight position={[10, 10, 5]} intensity={2} color="#00ffff" castShadow />
            <directionalLight position={[-10, 10, -5]} intensity={1} color="#ff00ff" />
            
            <Suspense fallback={null}>
              <Environment preset="city" />
              <GameBoard />
              <TargetingGrid />
              
              {viewMode === 'target' && <Markers shots={playerShots} isOpponent={false} />}
              {viewMode === 'fleet' && <Markers shots={opponentShots} isOpponent={true} />}

              {(status === 'setup' || viewMode === 'fleet') && 
                playerShips.map(ship => <Ship key={ship.id} data={ship} />)
              }

              {(viewMode === 'target' || status === 'game_over') &&
                opponentShips.filter(s => s.destroyed || status === 'game_over').map(ship => <Ship key={`opp-${ship.id}`} data={ship} />)
              }
            </Suspense>
            
            <OrbitControls 
              maxPolarAngle={Math.PI / 2.1} 
              minPolarAngle={0} 
              minDistance={10} 
              maxDistance={40} 
              enablePan={false} 
              makeDefault 
            />
            
            <EffectComposer>
              <Bloom luminanceThreshold={1} mipmapBlur intensity={1.5} />
            </EffectComposer>
          </Canvas>
        </>
      )}
    </div>
  )
}


