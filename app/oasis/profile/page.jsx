// OASIS profile — the persistent gamer identity across every PvP game.
// Callsign, avatar sigil, per-game wins/losses, boss victories and titles.
// Plain English, mobile-first.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { normalizeStats, winRate, AVATARS, getAvatar } from '@/lib/oasis/profile';
import { AVATAR_ARCHETYPES } from '@/lib/glb/avatars';
import CharacterSelect from '@/components/glb/CharacterSelect';
import { getGame } from '@/lib/oasis/games';
import { getBoss } from '@/lib/oasis/bosses';

const GAME_ORDER = ['chess', 'basketball', 'colosseum', 'battleship'];

export default function OasisProfilePage() {
  const [user, setUser] = useState(null);
  const [callsign, setCallsign] = useState('');
  const [avatarId, setAvatarId] = useState('nova');
  const [glbAvatar, setGlbAvatar] = useState('scout');
  const [glbTint, setGlbTint] = useState(null);
  const [stats, setStats] = useState(normalizeStats(null));
  const [bossWins, setBossWins] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [cloudOffline, setCloudOffline] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    let user;
    try {
      ({ data: { user } } = await supabase.auth.getUser());
    } catch {
      // Database connection missing — show the page with an honest banner,
      // never a fake identity or a raw error screen.
      setCloudOffline(true);
      return;
    }
    if (!user) { window.location.href = '/'; return; }
    setUser(user);
    const { data } = await supabase
      .from('oasis_profiles')
      .select('callsign, avatar, stats, boss_wins')
      .eq('id', user.id)
      .single();
    if (data) {
      setCallsign(data.callsign || '');
      setAvatarId(data.avatar || 'nova');
      setStats(normalizeStats(data.stats));
      setBossWins(Array.isArray(data.boss_wins) ? data.boss_wins : []);
    } else {
      setCallsign((user.email || 'player').split('@')[0].toUpperCase().slice(0, 16));
    }
    // 3D avatar frame + armor tint (columns arrive with the updated oasis.sql;
    // read them defensively so the page works before the migration is run).
    try {
      const { data: av } = await supabase
        .from('oasis_profiles')
        .select('avatar_glb, avatar_tint')
        .eq('id', user.id)
        .single();
      if (av) {
        if (av.avatar_glb && AVATAR_ARCHETYPES.some((a) => a.id === av.avatar_glb)) setGlbAvatar(av.avatar_glb);
        if (av.avatar_tint) setGlbTint(av.avatar_tint);
      }
    } catch { /* columns not migrated yet — defaults stand */ }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setMsg('');
    const clean = callsign.trim().toUpperCase().slice(0, 16) || 'PLAYER';
    const { error } = await supabase.from('oasis_profiles').upsert([{
      id: user.id, callsign: clean, avatar: avatarId, stats, boss_wins: bossWins,
    }]);
    // Persist the 3D avatar frame separately — the columns may not exist yet.
    try {
      await supabase.from('oasis_profiles').update({
        avatar_glb: glbAvatar, avatar_tint: glbTint,
      }).eq('id', user.id);
    } catch { /* migration pending — the rest of the identity still saved */ }
    setMsg(error ? error.message : 'Identity saved.');
    if (!error) setCallsign(clean);
    setSaving(false);
  };

  const avatar = getAvatar(avatarId);

  return (
    <main className="min-h-screen bg-black text-white px-4 py-8 sm:py-12">
      <div className="max-w-xl mx-auto flex flex-col gap-8">
        <div className="text-center">
          <h1 className="text-3xl font-black tracking-[0.2em] uppercase text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-fuchsia-500">
            OASIS Identity
          </h1>
          <p className="text-xs tracking-widest text-zinc-500 uppercase mt-2">
            One callsign across every arena
          </p>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-5 p-6 bg-zinc-950 border border-zinc-800 rounded-xl">
          {cloudOffline && (
            <p className="text-sm text-amber-300 border border-amber-500/50 bg-amber-950/30 p-3 rounded">
              Cloud features are offline — this page needs the database connection.
              Your identity can't be loaded or saved right now; nothing here is fake,
              it's just unavailable until the connection is set up.
            </p>
          )}
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black ${avatar.bg} ${avatar.fg} border border-zinc-700`}>
              {avatar.glyph}
            </div>
            <div className="flex-1">
              <label className="text-[10px] tracking-widest uppercase text-zinc-500">Callsign</label>
              <input value={callsign} onChange={(e) => setCallsign(e.target.value.toUpperCase())} maxLength={16}
                placeholder="YOUR CALLSIGN"
                className="w-full mt-1 px-4 py-3 font-mono text-lg font-bold tracking-[0.15em] text-white uppercase bg-black border border-zinc-700 rounded outline-none focus:border-cyan-500 placeholder:text-zinc-700" />
            </div>
          </div>

          <div>
            <label className="text-[10px] tracking-widest uppercase text-zinc-500">Avatar sigil</label>
            <div className="flex gap-2 mt-2 flex-wrap">
              {AVATARS.map((a) => (
                <button type="button" key={a.id} onClick={() => setAvatarId(a.id)} title={a.label}
                  className={`w-11 h-11 rounded-full flex items-center justify-center font-black ${a.bg} ${a.fg} border transition-all ${avatarId === a.id ? 'border-white scale-110' : 'border-zinc-800 hover:border-zinc-500'}`}>
                  {a.glyph}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-6">
            <CharacterSelect
              initialArchetype={glbAvatar}
              initialTint={glbTint}
              onChange={({ archetype, tint }) => { setGlbAvatar(archetype); setGlbTint(tint); }}
            />
          </div>

          <button type="submit" disabled={saving || cloudOffline}
            className="w-full px-6 py-3 text-sm font-bold tracking-widest uppercase border border-cyan-500/50 text-cyan-400 bg-cyan-950/20 hover:bg-cyan-900/40 rounded transition-all disabled:opacity-50">
            {cloudOffline ? 'CLOUD OFFLINE' : saving ? 'SAVING…' : 'SAVE IDENTITY'}
          </button>
          {msg && <p className="text-xs text-center text-zinc-400">{msg}</p>}
        </form>

        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-bold tracking-widest uppercase text-zinc-400">Combat record</h2>
          {GAME_ORDER.map((slug) => {
            const g = getGame(slug);
            const s = stats[slug];
            const rate = winRate(s);
            return (
              <div key={slug} className="flex items-center gap-4 px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                <span className={`text-sm font-black tracking-widest uppercase ${g.theme.accentText}`}>{g.name}</span>
                <span className="ml-auto font-mono text-sm text-zinc-300">
                  {s.wins}W <span className="text-zinc-600">/</span> {s.losses}L
                </span>
                <span className="font-mono text-xs text-zinc-500 w-14 text-right">
                  {rate === null ? '—' : `${Math.round(rate * 100)}%`}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-bold tracking-widest uppercase text-zinc-400">Boss victories</h2>
          {bossWins.length === 0 ? (
            <p className="text-xs text-zinc-600 tracking-widest uppercase">No bosses felled yet. They are waiting.</p>
          ) : bossWins.map((w) => {
            const boss = getBoss(w.bossId);
            return (
              <div key={w.bossId} className="px-4 py-3 bg-zinc-950 border border-red-500/40 rounded-lg">
                <div className="text-sm font-black tracking-widest uppercase text-red-300">
                  {boss ? boss.name : w.bossId}
                </div>
                {w.title && <p className="text-[11px] text-amber-300 tracking-widest uppercase mt-1">Title earned: {w.title}</p>}
              </div>
            );
          })}
        </div>

        <Link href="/" className="text-center text-xs tracking-widest uppercase text-zinc-600 hover:text-zinc-300">
          Back to the launcher
        </Link>

        {/* Safari bottom-bar clearance */}
        <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
      </div>
    </main>
  );
}
