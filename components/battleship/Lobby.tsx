import { useState } from 'react'
import { supabase } from '@/lib/battleship/supabase'
import { useGameStore } from '@/store/battleship/useGameStore'
import OasisLinkedHost from '@/components/battleship/OasisLinkedHost'
import Link from 'next/link'

export default function Lobby() {
  const setGameMode = useGameStore(state => state.setGameMode)
  const setRoomId = useGameStore(state => state.setRoomId)
  
  const [roomInput, setRoomInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleStartPvE = () => {
    setGameMode('pve')
    setRoomId('local-ai', true)
  }

  const handleCreatePvP = async () => {
    setLoading(true)
    setErrorMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const newRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { error } = await supabase
      .from('olympus_battleship_rooms')
      .insert([{ room_code: newRoomCode, host_id: user.id, status: 'waiting' }])

    if (error) {
      setErrorMsg('Failed to create a game room.')
      setLoading(false)
      return
    }

    setGameMode('pvp')
    setRoomId(newRoomCode, true)
  }

  const handleJoinPvP = async () => {
    if (roomInput.length !== 6) return
    setLoading(true)
    setErrorMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data: room, error } = await supabase
      .from('olympus_battleship_rooms')
      .select('*')
      .eq('room_code', roomInput)
      .single()

    if (error || !room || room.status !== 'waiting') {
      setErrorMsg('Room not found or already full.')
      setLoading(false)
      return
    }

    await supabase
      .from('olympus_battleship_rooms')
      .update({ guest_id: user.id, status: 'playing' })
      .eq('room_code', roomInput)

    setGameMode('pvp')
    setRoomId(roomInput, false)
  }

  return (
    <div className="absolute z-20 flex items-center justify-center w-full h-full bg-black/90 backdrop-blur-md">
      <div className="flex flex-col items-center gap-8 p-10 bg-zinc-950 border border-fuchsia-500/40 rounded-xl shadow-[0_0_40px_rgba(255,0,255,0.15)] w-[450px]">
        <div className="text-center">
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-fuchsia-500 tracking-[0.2em] mb-2">LOBBY</h1>
          <p className="text-xs tracking-widest text-cyan-500/70">CHOOSE GAME MODE</p>
        </div>

        <div className="flex flex-col w-full gap-4">
          <button onClick={handleStartPvE} disabled={loading} className="w-full px-6 py-4 text-sm font-bold tracking-widest text-cyan-400 uppercase transition-all border border-cyan-500/50 bg-cyan-950/20 hover:bg-cyan-900/40 hover:shadow-[0_0_20px_rgba(0,255,255,0.3)] disabled:opacity-50">Play vs Computer</button>
          
          <div className="flex items-center gap-4 my-2 opacity-50"><div className="flex-1 h-px bg-gradient-to-r from-transparent via-white to-transparent" /><span className="font-mono text-xs text-white">OR</span><div className="flex-1 h-px bg-gradient-to-r from-transparent via-white to-transparent" /></div>

          <button onClick={handleCreatePvP} disabled={loading} className="w-full px-6 py-4 text-sm font-bold tracking-widest text-fuchsia-400 uppercase transition-all border border-fuchsia-500/50 bg-fuchsia-950/20 hover:bg-fuchsia-900/40 hover:shadow-[0_0_20px_rgba(255,0,255,0.3)] disabled:opacity-50">Host Multiplayer Game</button>

          {/* OASIS adapter: same battle, shareable 6-char code + deep link. */}
          <OasisLinkedHost />

          <div className="flex gap-2">
            <input type="text" placeholder="ENTER 6-DIGIT CODE" maxLength={6} value={roomInput} onChange={(e) => setRoomInput(e.target.value.toUpperCase())} disabled={loading} className="w-full px-4 py-3 font-mono text-center text-white uppercase transition-all bg-black border outline-none border-zinc-700 focus:border-cyan-500 focus:shadow-[0_0_15px_rgba(0,255,255,0.2)] placeholder:text-zinc-600 disabled:opacity-50" />
            <button onClick={handleJoinPvP} disabled={roomInput.length !== 6 || loading} className="px-6 font-bold tracking-widest text-white transition-all border disabled:opacity-50 disabled:cursor-not-allowed border-zinc-500 hover:bg-white hover:text-black">JOIN</button>
          </div>
          {errorMsg && <p className="mt-2 text-xs text-center text-red-500 animate-pulse">{errorMsg}</p>}
        </div>

        <Link href="/battleship/profile" className="mt-4 text-xs tracking-widest text-zinc-500 hover:text-cyan-400 transition-colors uppercase border-b border-transparent hover:border-cyan-400">
          Manage Profile & Friends
        </Link>
      </div>
    </div>
  )
}


