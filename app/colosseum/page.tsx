'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Telemetry from '@/components/colosseum/Telemetry'

export default function Home() {
  const router = useRouter()
  const [session, setSession] = useState<any>(null)
  const [mounted, setMounted] = useState(false)

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
    <div className="w-full h-full relative">
      <button 
        onClick={() => router.push('/')} 
        className="absolute z-[9999] px-4 py-2 text-[10px] font-bold tracking-widest text-zinc-400 uppercase transition-colors border rounded top-5 right-5 bg-black/80 border-zinc-700 hover:text-fuchsia-400 hover:border-fuchsia-400"
      >
        EXIT MATRIX
      </button>

      <div style={{ paddingTop: '4rem' }}>
        <h1 style={{ 
          textAlign: 'center', 
          color: 'var(--neon-bloom)', 
          textShadow: '0 0 10px rgba(102, 252, 241, 0.5)' 
        }}>
          Network Control
        </h1>
        
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <Telemetry />
        </div>
      </div>
    </div>
  )
}


