'use client'
import { useEffect, useState, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCerberusStore } from '@/store/cerberus/useCerberusStore'
import NodeMap from '@/components/cerberus/NodeMap'
import CyberHUD from '@/components/cerberus/CyberHUD'
import Holoframe from '@/components/cerberus/Holoframe'

export default function CerberusApp() {
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
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 text-[10px] font-bold tracking-widest text-[#c0c0c0] uppercase transition-colors border rounded bg-black/80 border-[#333] hover:text-[#00f2ff] hover:border-[#00f2ff]"
        >
          [ DISCONNECT NODE ]
        </button>
      </div>
    </div>
  )

  if (isLoading || !localSession) return <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000' }} />

  return (
    <main style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: '#000000', overflow: 'hidden', userSelect: 'none' }}>
      
      {/* THE EXIT BUTTON */}
      <button 
        onClick={() => router.push('/')}
        className="absolute z-50 px-4 py-2 text-[10px] font-bold tracking-widest text-[#c0c0c0] uppercase transition-colors border rounded top-5 left-5 bg-black/80 border-[#333] hover:text-[#00f2ff] hover:border-[#00f2ff] font-bitcount"
      >
        [ DISCONNECT NODE ]
      </button>

      {/* BACKGROUND VIDEO LAYER */}
      <video 
        autoPlay 
        loop 
        muted 
        playsInline 
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, opacity: 0.6 }}
      >
        <source src="/assets/cerberus/background.mov" type="video/mp4" />
      </video>

      {/* FULLSCREEN 3D WEB (Transparent Background) */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10 }}>
        <Canvas 
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

    </main>
  )
}


