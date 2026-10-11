import { useState } from 'react'
import { supabase } from '@/lib/battleship/supabase'
import { useGameStore } from '@/store/battleship/useGameStore'
import OasisLinkedHost from '@/components/battleship/OasisLinkedHost'
import FriendInvite from '@/components/pvp/FriendInvite'
import { createLinkedLobby } from '@/lib/battleship/oasis-adapter'
import Link from 'next/link'
import { AresButton, AresIcon, AresLoader, ARES } from '@/components/ares/ares-chrome'

export default function Lobby() {
  const setGameMode = useGameStore(state => state.setGameMode)
  const setRoomId = useGameStore(state => state.setRoomId)

  const [roomInput, setRoomInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [inviteCode, setInviteCode] = useState(null)
  const [userId, setUserId] = useState(null)

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

  // Friend invites (PvP baseline): create the linked lobby (code lives in
  // both the native battleship table and oasis_rooms), then open the friend
  // picker. Invited friends accept and land on /battleship?code=XXXXXX,
  // which the OasisDeepLinkJoiner seats into both rows.
  const handleInviteFriends = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setErrorMsg('Sign in to invite friends.'); setLoading(false); return }
      setUserId(user.id)
      const { code } = await createLinkedLobby(supabase, { userId: user.id })
      setInviteCode(code)
    } catch (e) {
      setErrorMsg((e && e.message) || 'Could not create a battle room.')
    }
    setLoading(false)
  }

  const closeInvitePicker = () => {
    const code = inviteCode
    setInviteCode(null)
    if (code) {
      setGameMode('pvp')
      setRoomId(code, true)
    }
  }

  // onRoomReady(code: string): the picker confirms it is bound to our linked
  // lobby. Seating deliberately stays in onClose, not here — the picker must
  // remain mounted as the live waiting UI (accept/decline feed), and seating
  // the game unmounts this Lobby (page renders the board when roomId is set).
  const handleRoomReady = (code: string) => {
    if (code && code !== inviteCode) setInviteCode(code)
  }

  return (
    <>
    <div className="absolute z-20 flex items-center justify-center w-full h-full overflow-hidden">
      {/* ARES interior art behind the lobby card */}
      <img
        src="/images/battleship/battleship-bg.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.9) 100%)' }}
      />
      <div className="relative flex flex-col items-center gap-8 p-10 bg-zinc-950/90 border border-fuchsia-500/40 rounded-xl shadow-[0_0_40px_rgba(255,0,255,0.15)] w-[450px] overflow-hidden">
        {/* ARES panel texture */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url('${ARES.panelTile}')`,
            backgroundSize: '512px 512px',
            opacity: 0.25,
          }}
        />
        <div className="relative text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center" style={{ color: ARES.goldSoft }}>
            <AresIcon name="anchor" className="h-10 w-10" />
          </div>
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-fuchsia-500 tracking-[0.2em] mb-2">LOBBY</h1>
          <p className="text-xs tracking-widest text-cyan-500/70">CHOOSE GAME MODE</p>
        </div>

        <div className="relative flex flex-col w-full gap-4">
          {loading ? (
            <AresLoader label="SIGNALING FLEET" />
          ) : (
            <>
          <AresButton icon="robot" tone="gold" onClick={handleStartPvE} className="w-full">Play vs Computer</AresButton>

          <div className="flex items-center gap-4 my-2 opacity-50"><div className="flex-1 h-px bg-gradient-to-r from-transparent via-white to-transparent" /><span className="font-mono text-xs text-white">OR</span><div className="flex-1 h-px bg-gradient-to-r from-transparent via-white to-transparent" /></div>

          <AresButton icon="users" tone="crimson" onClick={handleCreatePvP}>Host Multiplayer Game</AresButton>

          {/* Friend invites (PvP baseline): linked lobby + directed invites. */}
          <AresButton icon="users" tone="gold" onClick={handleInviteFriends} disabled={loading}>Invite Friends</AresButton>

          {/* OASIS adapter: same battle, shareable 6-char code + deep link. */}
          <OasisLinkedHost />

          <div className="flex gap-2">
            <input type="text" placeholder="ENTER 6-DIGIT CODE" maxLength={6} value={roomInput} onChange={(e) => setRoomInput(e.target.value.toUpperCase())} disabled={loading} className="w-full px-4 py-3 font-mono text-center text-white uppercase transition-all bg-black border outline-none border-zinc-700 focus:border-cyan-500 focus:shadow-[0_0_15px_rgba(0,242,255,0.2)] placeholder:text-zinc-600 disabled:opacity-50" />
            <AresButton icon="check" tone="ghost" onClick={handleJoinPvP} disabled={roomInput.length !== 6}>JOIN</AresButton>
          </div>
            </>
          )}
          {errorMsg && <p className="mt-2 text-xs text-center text-red-500 animate-pulse">{errorMsg}</p>}
        </div>

        <Link href="/battleship/profile" className="mt-4 text-xs tracking-widest text-zinc-500 hover:text-cyan-400 transition-colors uppercase border-b border-transparent hover:border-cyan-400">
          Manage Profile & Friends
        </Link>
      </div>
    </div>
    {inviteCode && (
      <FriendInvite
        supabase={supabase}
        userId={userId}
        gameSlug="battleship"
        gameName="Battleship"
        minPlayers={2}
        maxPlayers={2}
        existingRoomCode={inviteCode}
        onRoomReady={handleRoomReady}
        onClose={closeInvitePicker}
      />
    )}
    </>
  )
}


