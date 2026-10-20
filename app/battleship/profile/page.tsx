'use client'
import { useEffect, useState } from 'react'
import { BackButton } from '@/components/ui'
import { supabase } from '@/lib/battleship/supabase'
// Unified friends system — one friend graph for the whole platform
// (Order 67, hub, profiles, battleship). All reads/writes go through
// /api/friends/* backed by the canonical `friendships` table.
import {
  fetchFriends,
  fetchPendingRequests,
  sendFriendRequest,
  respondToFriendshipClient,
} from '@/lib/friends'

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null)
  const [username, setUsername] = useState('')
  const [hasProfile, setHasProfile] = useState(false)

  const [friendSearch, setFriendSearch] = useState('')
  const [friendsList, setFriendsList] = useState<any[]>([])
  const [pendingIn, setPendingIn] = useState<any[]>([])
  const [friendsError, setFriendsError] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    loadProfile()
  }, [])

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  }

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return window.location.href = '/battleship'
    setUser(user)

    const { data: profile } = await supabase
      .from('olympus_battleship_profiles')
      .select('username')
      .eq('id', user.id)
      .single()

    if (profile) {
      setUsername(profile.username)
      setHasProfile(true)
      loadFriends()
    }
  }

  const loadFriends = async () => {
    setFriendsError('')
    try {
      const token = await getToken()
      if (!token) {
        setFriendsError('Sign in to see your friends.')
        return
      }
      const [f, p] = await Promise.all([fetchFriends(token), fetchPendingRequests(token)])
      setFriendsList(f.friends || [])
      setPendingIn(p.requests || [])
    } catch (e: any) {
      setFriendsError(e?.message || 'Could not load friends.')
    }
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    const { error } = await supabase.from('olympus_battleship_profiles').upsert([
      { id: user.id, username: username.trim() }
    ])
    if (error) setMsg(error.message)
    else {
      setMsg('Profile saved successfully!')
      setHasProfile(true)
    }
  }

  const handleSendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')

    // Battleship callsigns live in olympus_battleship_profiles; resolve the
    // exact username to the player's auth id, then use the unified request API.
    const { data: friendProfile } = await supabase
      .from('olympus_battleship_profiles')
      .select('id')
      .eq('username', friendSearch.trim())
      .single()

    if (!friendProfile) {
      return setMsg('User not found.')
    }

    if (friendProfile.id === user.id) {
      return setMsg("You can't add yourself.")
    }

    try {
      const token = await getToken()
      if (!token) return setMsg('Sign in to send friend requests.')
      await sendFriendRequest(token, friendProfile.id)
      setMsg('Friend request sent!')
      setFriendSearch('')
      loadFriends()
    } catch (e: any) {
      setMsg(e?.message || 'Request already sent or error occurred.')
    }
  }

  const handleAnswerRequest = async (friendshipId: string, action: 'accept' | 'decline') => {
    try {
      const token = await getToken()
      if (!token) return setMsg('Sign in to answer requests.')
      await respondToFriendshipClient(token, friendshipId, action)
      loadFriends()
    } catch (e: any) {
      setMsg(e?.message || 'Could not answer the request.')
    }
  }

  if (!user) return <div className="w-screen h-dvh bg-black"></div>

  return (
    <div className="relative flex min-h-dvh w-full flex-col items-center overflow-y-auto bg-black px-3 text-white">
      <video autoPlay loop muted playsInline className="fixed inset-0 z-0 object-cover w-full h-full opacity-30" src="/assets/battleship/profile-bg.mp4" />

      <div className="relative z-10 my-10 flex w-full max-w-lg flex-col gap-8 p-5 sm:p-10 bg-zinc-950/80 backdrop-blur-md border border-cyan-500/40 rounded-xl shadow-[0_0_40px_rgba(0,242,255,0.1)]">

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h1 className="min-w-0 text-2xl font-black text-transparent uppercase bg-clip-text bg-gradient-to-r from-cyan-400 to-fuchsia-500 tracking-widest">Command Profile</h1>
          <BackButton label="Back to Grid" href="/battleship" />
        </div>

        <form onSubmit={handleSaveProfile} className="flex flex-col gap-2 p-5 border rounded-lg bg-black/40 border-zinc-800">
          <label className="text-xs tracking-widest text-cyan-400 uppercase">Your Callsign (Username)</label>
          <div className="flex gap-2">
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="Enter a unique username" className="flex-1 min-w-0 px-4 py-3 text-white transition-all bg-black border rounded outline-none border-zinc-700 focus:border-cyan-500" />
            <button type="submit" className="shrink-0 px-6 font-bold tracking-widest text-white transition-all border rounded border-cyan-500 bg-cyan-500/20 hover:bg-cyan-500/40">SAVE</button>
          </div>
        </form>

        {hasProfile && (
          <div className="flex flex-col gap-6">
            <form onSubmit={handleSendFriendRequest} className="flex flex-col gap-2">
              <label className="text-xs tracking-widest text-fuchsia-400 uppercase">Add a Friend</label>
              <div className="flex gap-2">
                <input type="text" value={friendSearch} onChange={(e) => setFriendSearch(e.target.value)} required placeholder="Friend's exact username" className="flex-1 min-w-0 px-4 py-3 text-white transition-all bg-black border rounded outline-none border-zinc-700 focus:border-fuchsia-500" />
                <button type="submit" className="shrink-0 px-6 font-bold tracking-widest text-white transition-all border rounded border-fuchsia-500 bg-fuchsia-500/20 hover:bg-fuchsia-500/40">ADD</button>
              </div>
            </form>

            <div className="flex flex-col gap-2">
              <h3 className="text-xs tracking-widest text-zinc-400 border-b border-zinc-800 pb-2 uppercase">Your Network</h3>
              {friendsError && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-amber-200/80">{friendsError}</p>
                  <button onClick={loadFriends} className="self-start px-4 py-2 text-xs font-bold tracking-widest text-amber-100 border border-amber-200/40 rounded hover:bg-amber-100/10">RETRY</button>
                </div>
              )}
              {!friendsError && friendsList.length === 0 && pendingIn.length === 0 && (
                <p className="text-sm text-zinc-600">No connections yet.</p>
              )}

              {friendsList.map(f => (
                <div key={f.user_id} className="flex items-center justify-between gap-3 p-3 border rounded bg-black/50 border-zinc-800">
                  <div className="min-w-0 truncate">
                    <span className="font-bold text-cyan-400">{f.display_name || f.username}</span>
                    <span className="ml-2 text-xs text-zinc-500">@{f.username}</span>
                  </div>
                  <span className="shrink-0 text-xs text-emerald-400/80 uppercase tracking-widest">friends</span>
                </div>
              ))}

              {pendingIn.map(r => (
                <div key={r.friendship_id} className="flex items-center justify-between gap-3 p-3 border rounded bg-black/50 border-amber-200/30">
                  <div className="min-w-0 truncate">
                    <span className="font-bold text-amber-200">{r.requester.display_name || r.requester.username}</span>
                    <span className="ml-2 text-xs text-zinc-500">wants to be friends</span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => handleAnswerRequest(r.friendship_id, 'accept')} className="px-3 py-1 text-xs font-bold text-black bg-cyan-400 rounded hover:bg-cyan-300 transition-all">ACCEPT</button>
                    <button onClick={() => handleAnswerRequest(r.friendship_id, 'decline')} className="px-3 py-1 text-xs font-bold text-zinc-300 border border-zinc-600 rounded hover:border-zinc-400 hover:text-white transition-all">DECLINE</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {msg && <p className="text-sm text-center text-cyan-400 animate-pulse">{msg}</p>}
        <div aria-hidden="true" className="player-clear" />
      </div>
    </div>
  )
}
