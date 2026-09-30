'use client'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { BackButton } from '@/components/ui'
import { supabase } from '@/lib/supabase'

import GameBoard from '@/components/battleship/GameBoard'
import Ship from '@/components/battleship/Ship'
import TargetingGrid from '@/components/battleship/TargetingGrid'
import Markers from '@/components/battleship/Markers'
import HUD from '@/components/battleship/HUD'
import Lobby from '@/components/battleship/Lobby'
import OasisDeepLinkJoiner from '@/components/battleship/OasisDeepLinkJoiner'
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
  const [cloudOffline, setCloudOffline] = useState(false)
  
  const roomId = useGameStore(state => state.roomId)
  const status = useGameStore(state => state.status)
  const viewMode = useGameStore(state => state.viewMode)
  const playerShips = useGameStore(state => state.playerShips)
  const opponentShips = useGameStore(state => state.opponentShips)
  const playerShots = useGameStore(state => state.playerShots)
  const opponentShots = useGameStore(state => state.opponentShots)

  useEffect(() => {
    // The shared supabase client throws when the database connection isn't
    // configured. Catch that (and any auth failure) and say so honestly
    // instead of crashing into the error boundary.
    let subscription: { unsubscribe(): void } | undefined
    try {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return router.push('/')
        setSession(session)
        setMounted(true)
      }).catch(() => setCloudOffline(true))

      const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session) router.push('/')
        else setSession(session)
      })
      subscription = sub
    } catch {
      setCloudOffline(true)
    }

    return () => subscription?.unsubscribe()
  }, [router])

  if (cloudOffline) return (
    <div className="w-screen h-dvh bg-black flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <p className="text-zinc-300 tracking-widest uppercase text-sm mb-3">Cloud features are offline</p>
        <p className="text-zinc-500 text-sm mb-6">
          This page needs the database connection. Check back once the cloud is connected.
        </p>
        <BackButton label="Back to the launcher" />
      </div>
    </div>
  )

  if (!mounted || !session) return <div className="w-screen h-dvh bg-black" />

  return (
    <div className="relative w-screen h-dvh overflow-hidden bg-black">
      <BackButton label="EXIT MATRIX" />

      {!roomId && <Lobby />}
      {/* OASIS adapter: /battleship?code=XXXXXX auto-joins a linked lobby. */}
      {!roomId && session && <OasisDeepLinkJoiner userId={session.user.id} />}
      {roomId && <GameNetworkManager />}
      
      {roomId && (
        <>
          <HUD />
          <Canvas camera={{ position: [0, 25, 18], fov: 45 }}>
            <color attach="background" args={['#050505']} />
            
            <ambientLight intensity={0.2} />
            <directionalLight position={[10, 10, 5]} intensity={2} color="#00f2ff" castShadow />
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
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear" />
    </div>
  )
}


