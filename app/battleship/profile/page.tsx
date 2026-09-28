'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/battleship/supabase'
import Link from 'next/link'

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null)
  const [username, setUsername] = useState('')
  const [hasProfile, setHasProfile] = useState(false)
  
  const [friendSearch, setFriendSearch] = useState('')
  const [friendsList, setFriendsList] = useState<any[]>([])
  const [msg, setMsg] = useState('')

  useEffect(() => {
    loadProfile()
  }, [])

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
      loadFriends(user.id)
    }
  }

  const loadFriends = async (userId: string) => {
    const { data } = await supabase
      .from('olympus_battleship_friends')
      .select(`
        id, status,
        user_id, friend_id,
        sender:user_id(username),
        receiver:friend_id(username)
      `)
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      
    if (data) setFriendsList(data)
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

    const { error } = await supabase
      .from('olympus_battleship_friends')
      .insert([{ user_id: user.id, friend_id: friendProfile.id, status: 'pending' }])

    if (error) setMsg('Request already sent or error occurred.')
    else {
      setMsg('Friend request sent!')
      setFriendSearch('')
      loadFriends(user.id)
    }
  }

  const handleAcceptRequest = async (requestId: string) => {
    await supabase.from('olympus_battleship_friends').update({ status: 'accepted' }).eq('id', requestId)
    loadFriends(user.id)
  }

  if (!user) return <div className="w-screen h-screen bg-black"></div>

  return (
    <div className="relative flex items-center justify-center w-screen h-screen overflow-hidden bg-black text-white">
      <video autoPlay loop muted playsInline className="absolute inset-0 z-0 object-cover w-full h-full opacity-30" src="/assets/battleship/profile-bg.mp4" />
      
      <div className="relative z-10 flex flex-col w-full max-w-lg gap-8 p-10 bg-zinc-950/80 backdrop-blur-md border border-cyan-500/40 rounded-xl shadow-[0_0_40px_rgba(0,255,255,0.1)]">
        
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-transparent uppercase bg-clip-text bg-gradient-to-r from-cyan-400 to-fuchsia-500 tracking-widest">Command Profile</h1>
          <Link href="/battleship" className="text-xs font-bold tracking-widest text-zinc-400 hover:text-white uppercase transition-all">← Back to Grid</Link>
        </div>

        <form onSubmit={handleSaveProfile} className="flex flex-col gap-2 p-5 border rounded-lg bg-black/40 border-zinc-800">
          <label className="text-xs tracking-widest text-cyan-400 uppercase">Your Callsign (Username)</label>
          <div className="flex gap-2">
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="Enter a unique username" className="flex-1 px-4 py-3 text-white transition-all bg-black border rounded outline-none border-zinc-700 focus:border-cyan-500" />
            <button type="submit" className="px-6 font-bold tracking-widest text-white transition-all border rounded border-cyan-500 bg-cyan-500/20 hover:bg-cyan-500/40">SAVE</button>
          </div>
        </form>

        {hasProfile && (
          <div className="flex flex-col gap-6">
            <form onSubmit={handleSendFriendRequest} className="flex flex-col gap-2">
              <label className="text-xs tracking-widest text-fuchsia-400 uppercase">Add a Friend</label>
              <div className="flex gap-2">
                <input type="text" value={friendSearch} onChange={(e) => setFriendSearch(e.target.value)} required placeholder="Friend's exact username" className="flex-1 px-4 py-3 text-white transition-all bg-black border rounded outline-none border-zinc-700 focus:border-fuchsia-500" />
                <button type="submit" className="px-6 font-bold tracking-widest text-white transition-all border rounded border-fuchsia-500 bg-fuchsia-500/20 hover:bg-fuchsia-500/40">ADD</button>
              </div>
            </form>

            <div className="flex flex-col gap-2">
              <h3 className="text-xs tracking-widest text-zinc-400 border-b border-zinc-800 pb-2 uppercase">Your Network</h3>
              {friendsList.length === 0 && <p className="text-sm text-zinc-600">No connections yet.</p>}
              
              {friendsList.map(req => {
                const isReceiver = req.friend_id === user.id;
                const otherUser = isReceiver ? req.sender.username : req.receiver.username;
                
                return (
                  <div key={req.id} className="flex items-center justify-between p-3 border rounded bg-black/50 border-zinc-800">
                    <div>
                      <span className="font-bold text-cyan-400">{otherUser}</span>
                      <span className="ml-2 text-xs text-zinc-500 uppercase">({req.status})</span>
                    </div>
                    {isReceiver && req.status === 'pending' && (
                      <button onClick={() => handleAcceptRequest(req.id)} className="px-3 py-1 text-xs font-bold text-black bg-cyan-400 rounded hover:bg-cyan-300 transition-all">ACCEPT</button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {msg && <p className="text-sm text-center text-cyan-400 animate-pulse">{msg}</p>}
      </div>
    </div>
  )
}


