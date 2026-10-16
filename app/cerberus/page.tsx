'use client'
import { useEffect, useState, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { useSceneContextGuard } from '@/components/SceneContextGuard';
import { OrbitControls, Environment } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useRouter } from 'next/navigation'
import { BackButton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useCerberusStore } from '@/store/cerberus/useCerberusStore'
import NodeMap from '@/components/cerberus/NodeMap'

/* ATHENA interior treatment: the triple-sigil emblem — three interlocking
   rings for Cerberus' three heads around a gold heart (zero image weight). */
function CerberusSigil({ size = 46 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none"
      stroke="#00f2ff" strokeWidth="2" strokeLinecap="round" aria-hidden="true"
      style={{ flex: 'none' }}>
      <circle cx="24" cy="16" r="9" />
      <circle cx="16.5" cy="30" r="9" />
      <circle cx="31.5" cy="30" r="9" />
      <circle cx="24" cy="25" r="2.5" fill="#FFD700" stroke="none" />
    </svg>
  );
}

const CERBERUS_CSS = `
.cerb-veil { animation: cerb-veil-breathe 1.8s ease-in-out infinite; }
@keyframes cerb-veil-breathe { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
.cerb-veil-text { color: #00f2ff; font-size: 11px; letter-spacing: 5px;
  text-transform: uppercase; font-family: ui-monospace, Menlo, monospace; }
@media (prefers-reduced-motion: reduce) { .cerb-veil { animation: none; } }
`;
import CyberHUD from '@/components/cerberus/CyberHUD'
import Holoframe from '@/components/cerberus/Holoframe'

export default function CerberusApp() {
  // Context-loss guard (fleet rollout 2026-10-15): freeze on loss, heal on
  // restore, recoverable FEED LOST fallback if the context stays gone.
  const sceneGuard = useSceneContextGuard({ label: 'CERBERUS' });
  const router = useRouter()
  const { isZoomModeActive, openFrames, setSession, fetchUserNodes } = useCerberusStore()
  const [localSession, setLocalSession] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [cloudOffline, setCloudOffline] = useState(false)

  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe(): void } | undefined;

    // The shared supabase client throws when the database connection isn't
    // configured. Catch that (and any auth failure) and say so honestly
    // instead of crashing into the error boundary.
    const markOffline = () => { if (mounted) { setCloudOffline(true); setIsLoading(false); } };

    try {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!mounted) return;
        if (!session) {
          router.push('/')
          return
        }
        setLocalSession(session)
        setSession(session)
        fetchUserNodes().finally(() => { if (mounted) setIsLoading(false) })
      }).catch(markOffline)

      const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (mounted) {
          if (!session) return router.push('/')
          setLocalSession(session)
          setSession(session)
        }
      })
      subscription = sub
    } catch {
      markOffline()
    }

    return () => {
      mounted = false;
      subscription?.unsubscribe()
    }
  }, [setSession, fetchUserNodes, router])

  if (cloudOffline) return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <p style={{ color: '#c0c0c0', letterSpacing: 3, fontSize: 13, textTransform: 'uppercase', marginBottom: 12 }}>
          Cloud features are offline
        </p>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>
          This page needs the database connection. Check back once the cloud is connected.
        </p>
        <BackButton label="[ DISCONNECT NODE ]" />
      </div>
    </div>
  )

  if (isLoading || !localSession) return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '18px' }} role="status" aria-label="Cerberus is waking">
      <style>{CERBERUS_CSS}</style>
      <span className="cerb-veil" style={{ display: 'inline-flex' }}><CerberusSigil /></span>
      <div className="cerb-veil-text">Awakening Cerberus</div>
    </div>
  )

  return (
    <main style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100dvh', backgroundColor: '#000000', overflow: 'hidden', userSelect: 'none' }}>
      
      {/* THE EXIT BUTTON */}
      <BackButton label="[ DISCONNECT NODE ]" />

      {/* BACKGROUND VIDEO LAYER */}
      <video 
        autoPlay 
        loop 
        muted 
        playsInline
        poster="/images/cerberus/bg.webp"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, opacity: 0.6 }}
      >
        <source src="/assets/cerberus/background.mp4" type="video/mp4" />
      </video>

      {/* FULLSCREEN 3D WEB (Transparent Background) */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10 }}>
        <Canvas 
          onCreated={sceneGuard.onCreated}
          camera={{ position: [0, 5, 25], fov: 50 }} 
          dpr={[1, 2]} 
          gl={{ antialias: false, powerPreference: "high-performance", alpha: true }}
          style={{ width: '100%', height: '100%', outline: 'none' }}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 20, 10]} intensity={2.5} color="#ffffff" />

          <Suspense fallback={null}>
            <NodeMap />
            <Environment preset="city" /> 
          </Suspense>

          <OrbitControls
            enableRotate={!isZoomModeActive}
            enableZoom={!isZoomModeActive}
            enablePan={true}
            enableDamping={true}
            dampingFactor={0.05}
            maxDistance={120}
            minDistance={5}
          />

          <EffectComposer>
            <Bloom luminanceThreshold={0.2} mipmapBlur intensity={2.0} levels={8} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* OPEN WORKSPACES */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 20, pointerEvents: 'none' }}>
        {openFrames.map((id) => (
          <Holoframe key={id} id={id} />
        ))}
      </div>

      {/* CENTERED UI OVERLAYS */}
      <CyberHUD />

      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear" />

    </main>
  )
}


