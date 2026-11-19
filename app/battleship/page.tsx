'use client'
import { Canvas } from '@react-three/fiber'
import { useSceneContextGuard } from '@/components/SceneContextGuard';
import { OrbitControls, Environment } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { BackButton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { grantAchievement } from '@/lib/achievements/award'
import AchievementBanner from '@/components/achievements/AchievementBanner'
import { AresBackdrop, AresLoader } from '@/components/ares/ares-chrome'

import GameBoard from '@/components/battleship/GameBoard'
import Ship from '@/components/battleship/Ship'
import TargetingGrid from '@/components/battleship/TargetingGrid'
import Markers from '@/components/battleship/Markers'
import HUD from '@/components/battleship/HUD'
import Lobby from '@/components/battleship/Lobby'
import OasisDeepLinkJoiner from '@/components/battleship/OasisDeepLinkJoiner'
import { useGameSync } from '@/hooks/battleship/useGameSync'
import { useGameStore } from '@/store/battleship/useGameStore'
import { unlockFx } from '@/lib/fx'

function GameNetworkManager() {
  useGameSync()
  return null
}

export default function Game() {
  // Context-loss guard (fleet rollout 2026-10-15): freeze on loss, heal on
  // restore, recoverable FEED LOST fallback if the context stays gone.
  const sceneGuard = useSceneContextGuard({ label: 'BATTLESHIP' });
  const router = useRouter()
  const [session, setSession] = useState<any>(null)
  const [mounted, setMounted] = useState(false)
  const [cloudOffline, setCloudOffline] = useState(false)
  
  const roomId = useGameStore(state => state.roomId)
  const status = useGameStore(state => state.status)
  const mode = useGameStore(state => state.mode)
  const winner = useGameStore(state => state.winner)
  const viewMode = useGameStore(state => state.viewMode)
  const playerShips = useGameStore(state => state.playerShips)
  const opponentShips = useGameStore(state => state.opponentShips)
  const playerShots = useGameStore(state => state.playerShots)
  const opponentShots = useGameStore(state => state.opponentShots)

  const [celebrateKey, setCelebrateKey] = useState<string | null>(null) // achievement celebration
  const sunkAwardedRef = useRef(false)
  const winAwardedRef = useRef(false)

  // Fire-and-forget achievement grant. Signed-in users only (guests earn
  // nothing server-side); the banner shows only when the server confirms
  // a fresh award (awarded=false means already held — no repeat celebration).
  const getToken = async () => {
    try {
      const { data } = await supabase.auth.getSession()
      return data?.session?.access_token || null
    } catch { return null }
  }
  const award = (key: string) => {
    grantAchievement(key, getToken).then((r) => {
      if (r && r.awarded) setCelebrateKey((cur) => cur ?? key)
    }).catch(() => {})
  }

  // Achievements, driven by the game store:
  // - first sinking: the first enemy ship destroyed in a game
  // - fleet destroyer: all five enemy ships sunk = a win
  // - admiral: a win in a PvP room (mode 'pvp')
  // NOTE: the grant route verifies PvP wins via pvp_matches — no match
  // records are written anywhere yet, so the admiral grant 403s until
  // that path exists.
  useEffect(() => {
    if (status === 'setup') {
      sunkAwardedRef.current = false
      winAwardedRef.current = false
      return
    }
    const sunk = opponentShips.filter((s) => s.destroyed).length
    if (sunk >= 1 && !sunkAwardedRef.current) {
      sunkAwardedRef.current = true
      award('battleship-first-sinking')
    }
    if (status === 'game_over' && winner === 'player' && !winAwardedRef.current) {
      winAwardedRef.current = true
      award('battleship-fleet-destroyer')
      if (mode === 'pvp') award('battleship-admiral')
    }
  }, [status, winner, mode, opponentShips])

  useEffect(() => {
    // unlock on first gesture (deep links may land here without the hub)
    const unlock = () => unlockFx();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

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

  if (!mounted || !session) return <AresLoader label="ESTABLISHING UPLINK" />

  return (
    <div className="relative w-screen h-dvh overflow-hidden bg-black">
      {/* ARES interior art: page backdrop behind menus/HUD (never over gameplay) */}
      <AresBackdrop src="/images/battleship/battleship-bg.webp" strength={0.35} />
      <BackButton label="EXIT MATRIX" />

      {!roomId && <Lobby />}
      {/* OASIS adapter: /battleship?code=XXXXXX auto-joins a linked lobby. */}
      {!roomId && session && <OasisDeepLinkJoiner userId={session.user.id} />}
      {roomId && <GameNetworkManager />}
      
      {roomId && (
        <>
          <HUD />
          <Canvas camera={{ position: [0, 25, 18], fov: 45 }} onCreated={sceneGuard.onCreated}>
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
      <AchievementBanner
        achievementKey={celebrateKey}
        show={!!celebrateKey}
        onDismiss={() => setCelebrateKey(null)}
      />
    </div>
  )
}


