'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import AphroIcon from '@/components/aphrodite/icons';
import { AphroBg } from '@/components/aphrodite/ambience';
import DefaultAvatarPicker from '@/components/profile/DefaultAvatarPicker';

// APHRODITE treatment: vault-night art behind the grid overlay, SVG icon
// buttons and tabs, shared panel texture on the cards.
// (Renders synchronously from localStorage — no loading phase to style.)

const TAB_ICONS = { library: 'book', rentals: 'clock', saved: 'bookmark' };

const CSS = `
.uv-root { min-height: 100dvh; background: #050508; color: #f2f2f2;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  display: flex; flex-direction: column; align-items: center; position: relative; }
.uv-grid { position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background-image: linear-gradient(rgba(8,247,254,0.04) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(8,247,254,0.04) 1px, transparent 1px);
  background-size: 40px 40px; }
.uv-mono { font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace; }
.uv-head { width: 100%; z-index: 10; background: rgba(5,5,8,0.9); backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(8,247,254,0.3); padding: 1rem 5%; display: flex;
  justify-content: space-between; align-items: center; }
.uv-logo { font-size: 1.3rem; font-weight: 800; color: #00f2ff; text-transform: uppercase;
  letter-spacing: 2px; text-shadow: 0 0 10px rgba(8,247,254,0.4); }
.uv-note { font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 1px; }
.uv-hero { position: relative; width: 100%; height: 32vh; min-height: 220px; overflow: hidden;
  border-bottom: 1px solid rgba(8,247,254,0.3); z-index: 1; }
.uv-hero canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.uv-fade { position: absolute; inset: 0;
  background: linear-gradient(to bottom, rgba(5,5,8,0.2), #050508 100%); }
.uv-wrap { width: 100%; max-width: 1100px; padding: 0 1.25rem calc(10rem + env(safe-area-inset-bottom)); z-index: 10; margin-top: -60px;
  display: flex; flex-direction: column; gap: 2rem; }
.uv-card { background: rgba(12,12,18,0.92); backdrop-filter: blur(10px);
  border: 1px solid rgba(8,247,254,0.3); border-radius: 8px; padding: 2rem;
  box-shadow: 0 20px 40px rgba(0,0,0,0.7); display: flex; flex-wrap: wrap; gap: 2rem;
  background-image: url(/images/aphrodite/panel-texture.webp); background-size: 512px 512px;
  background-blend-mode: overlay; }
.uv-avatar { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.uv-ring { position: relative; width: 140px; height: 140px; border-radius: 50%;
  border: 3px solid #00f2ff; background: #000; display: flex; justify-content: center; align-items: center;
  font-size: 3.2rem; overflow: hidden; box-shadow: 0 0 30px rgba(8,247,254,0.2); }
.uv-ring img { width: 100%; height: 100%; object-fit: cover; }
.uv-cam { position: absolute; bottom: 4px; right: 4px; width: 36px; height: 36px; border-radius: 50%;
  background: #050508; border: 1px solid #00f2ff; color: #00f2ff; font-size: 1rem; cursor: pointer;
  display: flex; align-items: center; justify-content: center; }
.uv-cam:hover { background: #00f2ff; color: #000; }
.uv-info { flex: 1; min-width: 260px; display: flex; flex-direction: column; gap: 14px; }
.uv-alias { font-size: 2rem; font-weight: 800; color: #00f2ff; margin: 0;
  text-shadow: 0 0 10px rgba(8,247,254,0.4); letter-spacing: 1px; }
.uv-bio { color: #aaa; margin: 0; line-height: 1.55; font-size: 0.95rem; }
.uv-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.uv-form label { display: block; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px;
  color: #888; margin-bottom: 6px; }
.uv-form input, .uv-form textarea, .uv-add input, .uv-add select {
  width: 100%; box-sizing: border-box; background: #0a0a0c; border: 1px solid #333; padding: 0.9rem;
  color: #00f2ff; border-radius: 4px; font-size: 0.95rem; font-family: inherit; }
.uv-form textarea { resize: vertical; min-height: 84px; grid-column: 1 / -1; }
.uv-form input:focus, .uv-form textarea:focus, .uv-add input:focus, .uv-add select:focus {
  outline: none; border-color: #00f2ff; box-shadow: 0 0 12px rgba(8,247,254,0.2); }
.uv-btn { background: transparent; border: 1px solid #00f2ff; color: #00f2ff; padding: 0.9rem 1.6rem;
  border-radius: 4px; font-weight: 800; letter-spacing: 2px; cursor: pointer; transition: 0.25s;
  text-transform: uppercase; font-size: 0.85rem; min-height: 48px; align-self: flex-start;
  display: inline-flex; align-items: center; gap: 8px; }
.uv-btn:hover { background: #00f2ff; color: #000; box-shadow: 0 0 18px rgba(8,247,254,0.5); }
.uv-btn.danger { border-color: #fe53bb; color: #fe53bb; }
.uv-btn.danger:hover { background: #fe53bb; color: #000; box-shadow: 0 0 18px rgba(254,83,187,0.5); }
.uv-tabs { display: flex; gap: 8px; border-bottom: 1px solid rgba(8,247,254,0.3); padding-bottom: 10px;
  overflow-x: auto; }
.uv-tab { background: none; border: none; color: #888; font-size: 1rem; font-weight: 700; padding: 10px 18px;
  cursor: pointer; letter-spacing: 1px; white-space: nowrap; min-height: 44px; }
.uv-tab.on { color: #00f2ff; text-shadow: 0 0 10px rgba(8,247,254,0.4); border-bottom: 2px solid #00f2ff; }
.uv-grid2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.25rem; }
.uv-art { background: rgba(18,18,24,0.85); border: 1px solid rgba(8,247,254,0.2); border-radius: 6px;
  padding: 1.25rem; display: flex; flex-direction: column; gap: 10px; transition: 0.25s; }
.uv-art:hover { border-color: #00f2ff; transform: translateY(-3px); }
.uv-tag { align-self: flex-start; font-size: 0.68rem; color: #fe53bb; border: 1px solid #fe53bb;
  padding: 3px 10px; border-radius: 12px; text-transform: uppercase; letter-spacing: 1px; }
.uv-title { font-size: 1.15rem; font-weight: 700; margin: 0; }
.uv-author { color: #888; font-size: 0.9rem; margin: 0; }
.uv-exp { color: #FFD700; font-size: 0.8rem; margin: 0; }
.uv-actions { display: flex; gap: 8px; margin-top: auto; }
.uv-actions .uv-btn { padding: 0.55rem 0.8rem; min-height: 40px; font-size: 0.72rem; flex: 1; text-align: center; }
.uv-empty { color: #666; grid-column: 1 / -1; padding: 2rem 0; text-align: center; }
.uv-add { display: grid; grid-template-columns: 2fr 2fr 1fr auto; gap: 10px; align-items: end; }
.uv-add label { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px;
  color: #888; margin-bottom: 6px; }
.uv-foot { position: fixed; bottom: calc(5rem + env(safe-area-inset-bottom)); left: 0; width: 100%; background: rgba(5,5,8,0.95);
  border-top: 1px solid rgba(8,247,254,0.2); padding: 10px 16px max(10px, env(safe-area-inset-bottom)); display: flex; justify-content: center;
  align-items: center; gap: 16px; font-size: 0.75rem; color: #888; z-index: 50; }
.uv-toast { position: fixed; bottom: calc(11rem + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); background: rgba(8,247,254,0.92);
  color: #000; font-weight: 700; padding: 10px 18px; border-radius: 8px; font-size: 0.85rem; z-index: 60; }
@media (max-width: 700px) {
  .uv-card { flex-direction: column; align-items: center; text-align: center; padding: 1.5rem; }
  .uv-form { grid-template-columns: 1fr; }
  .uv-btn { align-self: center; width: 100%; }
  .uv-add { grid-template-columns: 1fr; }
}
`;

const TABS = [
  { id: 'library', label: 'Library', tag: 'On the shelf' },
  { id: 'rentals', label: 'Borrowed', tag: 'Due back' },
  { id: 'saved', label: 'Saved', tag: 'Saved for later' },
];

const SEED = {
  library: [
    { id: 'seed-1', title: 'The Design of Everyday Things', author: 'Don Norman' },
    { id: 'seed-2', title: 'A Field Guide to Getting Lost', author: 'Rebecca Solnit' },
  ],
  rentals: [],
  saved: [{ id: 'seed-3', title: 'The Martian Chronicles', author: 'Ray Bradbury' }],
};

function uid() {
  return 'a' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

export default function UserProfilePage() {
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const [tab, setTab] = useState('library');
  const [alias, setAlias] = useState('Anonymous Reader');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('');
  const [vault, setVault] = useState(SEED);
  const [tTitle, setTTitle] = useState('');
  const [tAuthor, setTAuthor] = useState('');
  const [tDays, setTDays] = useState(14);
  const [toast, setToast] = useState('');
  const [ready, setReady] = useState(false);

  // Starfield hero — replaces the external video with a procedural canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let w = 0, h = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w; canvas.height = h;
    };
    resize();
    window.addEventListener('resize', resize);
    const stars = Array.from({ length: 220 }, () => ({
      x: Math.random(), y: Math.random(),
      s: 0.4 + Math.random() * 1.6,
      v: 0.02 + Math.random() * 0.12,
      tw: Math.random() * Math.PI * 2,
      cyan: Math.random() > 0.75,
    }));
    let t = 0;
    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      for (const st of stars) {
        st.y += st.v / h;
        st.tw += 0.04;
        if (st.y > 1) st.y = 0;
        const a = 0.3 + Math.abs(Math.sin(st.tw)) * 0.6;
        ctx.fillStyle = st.cyan
          ? 'rgba(8,247,254,' + a.toFixed(2) + ')'
          : 'rgba(255,255,255,' + (a * 0.8).toFixed(2) + ')';
        ctx.fillRect(st.x * w, st.y * h, st.s, st.s);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  // Load local data once
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('reader-vault');
      if (raw) {
        const p = JSON.parse(raw);
        if (p.alias) setAlias(p.alias);
        if (p.email) setEmail(p.email);
        if (p.bio) setBio(p.bio);
        if (p.avatar) setAvatar(p.avatar);
        if (p.vault) setVault({ ...SEED, ...p.vault });
      }
    } catch { /* fresh vault */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem('reader-vault', JSON.stringify({ alias, email, bio, avatar, vault }));
    } catch { /* storage unavailable */ }
  }, [alias, email, bio, avatar, vault, ready]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const saveProfile = () => setToast('Profile saved on this device.');

  const onAvatarFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 600 * 1024) {
      setToast('Image too large — pick one under 600 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result));
    reader.readAsDataURL(f);
  };

  const addArtifact = () => {
    const title = tTitle.trim();
    if (!title) { setToast('Give the artifact a title first.'); return; }
    const item = { id: uid(), title, author: tAuthor.trim() || 'Unknown' };
    if (tab === 'rentals') {
      item.due = Date.now() + Math.max(1, tDays) * 86400000;
    }
    setVault((v) => ({ ...v, [tab]: [...(v[tab] || []), item] }));
    setTTitle(''); setTAuthor('');
    setToast('Added to ' + (TABS.find((x) => x.id === tab) || {}).label + '.');
  };

  const removeArtifact = (id) =>
    setVault((v) => ({ ...v, [tab]: v[tab].filter((a) => a.id !== id) }));

  const shareArtifact = async (a) => {
    const text = a.title + ' — ' + a.author + ' (from my Reader Vault)';
    try {
      await navigator.clipboard.writeText(text);
      setToast('Reference copied to clipboard.');
    } catch {
      setToast('Copy blocked — long-press to copy manually.');
    }
  };

  const daysLeft = (due) => Math.max(0, Math.ceil((due - Date.now()) / 86400000));
  const currentTab = TABS.find((x) => x.id === tab);

  return (
    <>
    <main className="uv-root">
      <style>{CSS}</style>
      <AphroBg img="/images/aphrodite/userprofile-bg.webp" opacity={0.4} />
      <div className="uv-grid" aria-hidden="true" />

      <header className="uv-head">
        <div className="uv-logo">Reader Vault</div>
        <div className="uv-note">Alexandria · Local Vault</div>
      </header>

      <div className="uv-hero">
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="uv-fade" />
      </div>

      <div className="uv-wrap">
        <section className="uv-card" aria-label="Reader profile">
          <div className="uv-avatar">
            <div className="uv-ring">
              {avatar ? <Image src={avatar} alt="Reader avatar" width={140} height={140} /> : <span aria-hidden="true">📖</span>}
              <button className="uv-cam" onClick={() => fileRef.current && fileRef.current.click()}
                aria-label="Upload profile picture" title="Upload profile picture"><AphroIcon name="camera" size={18} /></button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvatarFile} />
            </div>

          <div style={{ marginTop: 12, width: '100%', maxWidth: 320 }}>
            <DefaultAvatarPicker value={avatar} onPick={(src) => { setAvatar(src); setToast('Avatar updated — save your profile.'); }} />
          </div>
          </div>
          <div className="uv-info">
            <h1 className="uv-alias">{alias || 'Anonymous Reader'}</h1>
            {bio ? <p className="uv-bio">{bio}</p> : <p className="uv-bio">No bio yet — tell the vault who you are.</p>}
            <div className="uv-form">
              <div>
                <label htmlFor="uv-alias">Reader alias</label>
                <input id="uv-alias" value={alias} onChange={(e) => setAlias(e.target.value)}
                  placeholder="e.g. Night Owl" maxLength={40} />
              </div>
              <div>
                <label htmlFor="uv-email">Contact email (optional, stays on this device)</label>
                <input id="uv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" maxLength={80} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="uv-bio">Reader bio</label>
                <textarea id="uv-bio" value={bio} onChange={(e) => setBio(e.target.value)}
                  placeholder="What are you reading? What should the vault know?" maxLength={500} />
              </div>
            </div>
            <button className="uv-btn" onClick={saveProfile}><AphroIcon name="check" size={16} /> Save profile</button>
          </div>
        </section>

        <section className="uv-card" style={{ flexDirection: 'column' }} aria-label="Vault library">
          <div className="uv-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id}
                className={'uv-tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <AphroIcon name={TAB_ICONS[t.id]} size={14} /> {t.label.toUpperCase()}
                </span>
              </button>
            ))}
          </div>

          <div className="uv-add">
            <div>
              <label htmlFor="uv-t">Title</label>
              <input id="uv-t" value={tTitle} onChange={(e) => setTTitle(e.target.value)}
                placeholder="Book or artifact title" maxLength={120} />
            </div>
            <div>
              <label htmlFor="uv-a">Author</label>
              <input id="uv-a" value={tAuthor} onChange={(e) => setTAuthor(e.target.value)}
                placeholder="Author name" maxLength={80} />
            </div>
            {tab === 'rentals' ? (
              <div>
                <label htmlFor="uv-d">Due in (days)</label>
                <input id="uv-d" type="number" min="1" max="365" value={tDays}
                  onChange={(e) => setTDays(Math.max(1, Math.min(365, Number(e.target.value) || 14)))} />
              </div>
            ) : <div />}
            <button className="uv-btn" onClick={addArtifact}><AphroIcon name="plus" size={16} /> Add</button>
          </div>

          <div className="uv-grid2">
            {(vault[tab] || []).length === 0 && (
              <p className="uv-empty">No artifacts in this sector yet — add one above.</p>
            )}
            {(vault[tab] || []).map((a) => (
              <div className="uv-art" key={a.id}>
                <span className="uv-tag">{currentTab.tag}</span>
                <h3 className="uv-title">{a.title}</h3>
                <p className="uv-author">By {a.author}</p>
                {a.due && <p className="uv-exp">⏳ Due back in {daysLeft(a.due)} day{daysLeft(a.due) === 1 ? '' : 's'}</p>}
                <div className="uv-actions">
                  <button className="uv-btn" onClick={() => shareArtifact(a)}><AphroIcon name="share" size={15} /> Share</button>
                  <button className="uv-btn danger" onClick={() => removeArtifact(a.id)}><AphroIcon name="trash" size={15} /> Remove</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="uv-foot">
        <span className="uv-mono">Everything in this vault stays on your device — no account, no cloud.</span>
      </div>

      {toast && <div className="uv-toast" role="status">{toast}</div>}
    </main>
    {/* Safari bottom-bar clearance: lets the final content rest above the browser bar */}
    <div aria-hidden="true" className="player-clear" />
    </>
  );
}
