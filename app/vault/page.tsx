// @ts-nocheck
/* eslint-disable */
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Vault() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        if (window.top === window.self) router.push('/');
        else document.body.innerHTML = '<div style="color:#08f7fe; text-align:center; padding:50px; font-family:monospace;">UNAUTHORIZED. PLEASE LOG IN AT MASTER HUB.</div>';
        return;
      }
      setMounted(true);

      const REPO_NAME = window.location.hostname || 'Unknown-Node';
      supabase.from('central_telemetry').insert([{
          repository_name: REPO_NAME,
          action_type: 'page_load',
          details: { url: window.location.href, timestamp: new Date().toISOString() }
      }]);

      const currentUser = session.user;
      document.getElementById('display-email').innerText = currentUser.email;
      document.getElementById('input-email-locked').value = currentUser.email;

      supabase.from('profiles').select('*').eq('id', currentUser.id).single().then(({data: profile}) => {
        if (profile) {
            if (profile.alias) {
                document.getElementById('display-alias').innerText = profile.alias;
                document.getElementById('input-alias').value = profile.alias;
            }
            if (profile.bio) document.getElementById('input-bio').value = profile.bio;
        }
        loadMockVaultData('purchased');
      });

      document.getElementById('btn-save-profile').onclick = async () => {
        const btn = document.getElementById('btn-save-profile');
        btn.innerText = "SYNCING...";
        const newAlias = document.getElementById('input-alias').value.trim();
        const newBio = document.getElementById('input-bio').value.trim();
        const { error } = await supabase.from('profiles').upsert({ id: currentUser.id, alias: newAlias, bio: newBio, updated_at: new Date() });
        if (!error) {
            document.getElementById('display-alias').innerText = newAlias || "Anonymous Node";
            btn.innerText = "SYNC COMPLETE"; btn.style.borderColor = "#0f0"; btn.style.color = "#0f0";
        }
        setTimeout(() => { btn.innerText = "SYNC PROFILE DATA"; btn.style.borderColor = "var(--neon-cyan)"; btn.style.color = "var(--neon-cyan)"; }, 3000);
      };
    });

    window.switchTab = function(tabType, btnElement) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        btnElement.classList.add('active');
        loadMockVaultData(tabType);
    };

    async function loadMockVaultData(tabType) {
      const grid = document.getElementById('acquired-grid');
      grid.innerHTML = `<p style="color: var(--text-muted); font-family: monospace; grid-column: 1 / -1;">Accessing ${tabType.toUpperCase()} database...</p>`;
      const { data: books } = await supabase.from('manuscripts').select('*').limit(3);
      grid.innerHTML = '';
      if (!books || books.length === 0) {
        grid.innerHTML = `<p style="color: var(--text-muted); font-family: monospace; grid-column: 1 / -1;">No artifacts detected in this sector.</p>`;
        return;
      }
      let tagLabel = tabType === 'purchased' ? 'PERMANENT ASSET' : tabType === 'rentals' ? 'TIME-LOCKED RENTAL' : 'BOOKMARKED';
      books.forEach(book => {
        const readerUrl = `/alexandria/artifact?id=${book.id}`;
        const card = document.createElement('div');
        card.className = 'vault-card';
        card.innerHTML = `
          <span class="card-type">${tagLabel}</span>
          <div><div class="card-title">${book.title}</div><div class="card-author">By ${book.author}</div></div>
          <div class="card-actions">
            <a href="${readerUrl}" target="_blank" class="action-link">INITIALIZE CODEX</a>
            <button class="share-link" onclick="navigator.clipboard.writeText(window.location.origin + '${readerUrl}'); alert('Link Copied!');">SHARE</button>
          </div>
        `;
        grid.appendChild(card);
      });
    }
  }, [router]);

  if (!mounted) return <div style={{background: '#050508', width: '100vw', height: '100vh'}}></div>;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Rajdhani:wght@400;600&display=swap');
        .vault-wrapper { --bg-obsidian: #050508; --bg-surface: rgba(12, 12, 18, 0.9); --neon-cyan: #08f7fe; --neon-magenta: #fe53bb; --text-main: #f2f2f2; --text-muted: #888888; background-color: var(--bg-obsidian); color: var(--text-main); min-height: 100vh; display: flex; flex-direction: column; align-items: center; overflow-x: hidden; font-family: 'Rajdhani', sans-serif; }
        .vault-wrapper::before { content: ""; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-image: linear-gradient(rgba(8, 247, 254, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(8, 247, 254, 0.03) 1px, transparent 1px); background-size: 40px 40px; z-index: -1; pointer-events: none; }
        header { width: 100%; background: rgba(5, 5, 8, 0.9); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(8, 247, 254, 0.3); padding: 1rem 5%; display: flex; justify-content: space-between; align-items: center; z-index: 100; }
        .logo { font-family: 'Orbitron', sans-serif; font-size: 1.4rem; font-weight: bold; color: var(--neon-cyan); text-transform: uppercase; letter-spacing: 2px; text-shadow: 0 0 10px rgba(8, 247, 254, 0.4); }
        .video-hero { position: relative; width: 100%; height: 35vh; min-height: 250px; display: flex; justify-content: center; align-items: center; border-bottom: 1px solid rgba(8, 247, 254, 0.3); overflow: hidden; }
        .hero-video { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%; height: 100%; object-fit: cover; opacity: 0.7; z-index: 1; }
        .hero-overlay { position: absolute; inset: 0; z-index: 2; background: linear-gradient(to bottom, rgba(5,5,8,0.2) 0%, var(--bg-obsidian) 100%); }
        .container { width: 100%; max-width: 1200px; padding: 0 1.5rem 8rem 1.5rem; display: flex; flex-direction: column; gap: 2.5rem; position: relative; z-index: 10; margin-top: -60px; }
        .profile-card { background: var(--bg-surface); backdrop-filter: blur(10px); border: 1px solid rgba(8, 247, 254, 0.3); border-radius: 8px; padding: 2.5rem; display: flex; flex-wrap: wrap; gap: 2.5rem; align-items: flex-start; box-shadow: 0 20px 40px rgba(0,0,0,0.9); }
        .avatar-section { display: flex; flex-direction: column; align-items: center; gap: 15px; }
        .avatar-wrapper { position: relative; width: 140px; height: 140px; border-radius: 50%; border: 3px solid var(--neon-cyan); background: #000; display: flex; justify-content: center; align-items: center; font-size: 3.5rem; color: var(--neon-cyan); box-shadow: 0 0 30px rgba(8, 247, 254, 0.2); overflow: hidden; }
        .user-info { flex: 1; min-width: 250px; display: flex; flex-direction: column; gap: 15px; }
        .user-header { border-bottom: 1px solid rgba(8, 247, 254, 0.2); padding-bottom: 15px; }
        .user-alias-display { font-family: 'Orbitron', sans-serif; font-size: 2.2rem; color: var(--neon-cyan); text-shadow: 0 0 10px rgba(8, 247, 254, 0.4); margin-bottom: 5px; }
        .user-email-display { font-family: monospace; font-size: 1rem; color: var(--text-muted); }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .form-group { display: flex; flex-direction: column; gap: 8px; }
        .form-group.full-width { grid-column: 1 / -1; }
        .form-group label { font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-family: monospace; letter-spacing: 1px; }
        .form-group input, .form-group textarea { width: 100%; background: #0a0a0c; border: 1px solid #333; padding: 1rem; color: var(--neon-cyan); border-radius: 4px; font-family: inherit; font-size: 1rem; transition: 0.3s; }
        .form-group textarea { resize: vertical; min-height: 100px; }
        .save-btn { background: transparent; border: 1px solid var(--neon-cyan); color: var(--neon-cyan); padding: 1rem 2rem; border-radius: 4px; font-family: 'Orbitron', sans-serif; font-weight: bold; cursor: pointer; transition: 0.3s; letter-spacing: 2px; align-self: flex-start; }
        .save-btn:hover { background: var(--neon-cyan); color: #000; box-shadow: 0 0 20px rgba(8, 247, 254, 0.5); }
        .vault-section { display: flex; flex-direction: column; gap: 20px; }
        .vault-tabs { display: flex; gap: 15px; border-bottom: 1px solid rgba(8, 247, 254, 0.3); padding-bottom: 10px; overflow-x: auto; scrollbar-width: none; }
        .tab-btn { background: none; border: none; color: var(--text-muted); font-family: 'Orbitron', sans-serif; font-size: 1.1rem; padding: 10px 20px; cursor: pointer; transition: 0.3s; letter-spacing: 1px; white-space: nowrap; }
        .tab-btn.active { color: var(--neon-cyan); text-shadow: 0 0 10px rgba(8, 247, 254, 0.4); border-bottom: 2px solid var(--neon-cyan); }
        .artifact-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 2rem; }
        .vault-card { background: rgba(18, 18, 24, 0.8); border: 1px solid rgba(8, 247, 254, 0.2); border-radius: 6px; padding: 1.5rem; display: flex; flex-direction: column; gap: 15px; transition: 0.3s; backdrop-filter: blur(5px); }
        .vault-card:hover { border-color: var(--neon-cyan); transform: translateY(-4px); box-shadow: 0 10px 20px rgba(0,0,0,0.5); }
        .card-type { font-family: monospace; font-size: 0.7rem; color: var(--neon-magenta); border: 1px solid var(--neon-magenta); padding: 3px 8px; border-radius: 10px; align-self: flex-start; }
        .card-title { font-family: 'Orbitron', sans-serif; font-size: 1.2rem; color: #fff; }
        .card-author { font-size: 0.9rem; color: var(--text-muted); }
        .card-actions { display: flex; gap: 10px; margin-top: auto; }
        .action-link { flex: 1; text-align: center; padding: 0.6rem; border: 1px solid var(--neon-cyan); color: var(--neon-cyan); text-decoration: none; font-size: 0.8rem; font-family: 'Orbitron', sans-serif; border-radius: 4px; font-weight: bold; }
        .share-link { flex: 1; text-align: center; padding: 0.6rem; border: 1px solid #444; color: #ccc; font-size: 0.8rem; font-family: 'Orbitron', sans-serif; border-radius: 4px; cursor: pointer; background: transparent; }
      `}</style>
      
      <div className="vault-wrapper">
        <header>
            <div className="logo">Reader Vault</div>
        </header>

        <div className="video-hero">
            <video src="https://file.garden/alXjUY_coXedLaNA/gemini_generated_video_B57E08C4.mp4" autoPlay loop muted playsInline className="hero-video"></video>
            <div className="hero-overlay"></div>
        </div>

        <main className="container">
            <section className="profile-card">
            <div className="avatar-section">
                <div className="avatar-wrapper"><span id="user-avatar-placeholder">👤</span></div>
            </div>
            <div className="user-info">
                <div className="user-header">
                    <h1 className="user-alias-display" id="display-alias">Anonymous Node</h1>
                    <p className="user-email-display" id="display-email">Awaiting Sync...</p>
                </div>
                <div className="form-row">
                    <div className="form-group"><label>Network Alias</label><input type="text" id="input-alias" placeholder="e.g., Merlin Ambros" /></div>
                    <div className="form-group"><label>Associated Email</label><input type="email" id="input-email-locked" disabled style={{opacity: 0.5}} /></div>
                </div>
                <div className="form-group full-width"><label>Public Bio Matrix</label><textarea id="input-bio" placeholder="Broadcast your status to the network..."></textarea></div>
                <button className="save-btn" id="btn-save-profile">SYNC PROFILE DATA</button>
            </div>
            </section>

            <section className="vault-section">
            <div className="vault-tabs">
                <button className="tab-btn active" onClick={(e) => window.switchTab('purchased', e.target)}>PERMANENT LIBRARY</button>
                <button className="tab-btn" onClick={(e) => window.switchTab('rentals', e.target)}>ACTIVE RENTALS</button>
                <button className="tab-btn" onClick={(e) => window.switchTab('saved', e.target)}>SAVED ARTIFACTS</button>
            </div>
            <div className="artifact-grid" id="acquired-grid"></div>
            </section>
        </main>
      </div>
    </>
  );
}


