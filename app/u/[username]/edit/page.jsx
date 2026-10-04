// app/u/[username]/edit/page.jsx — owner-only profile editor.
// Edit both profiles (Personal | Business), upload avatar / profile video /
// cover (image or video), manage the art gallery (with Stripe sale prices),
// and write posts. Sign-in required; the URL username must be yours.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Auth from '@/components/Auth';
import { normalizeTikTokHandle } from '@/lib/tiktok-attribution';
import { BUNDLED_LANGUAGES, EXTENDED_LANGUAGES, isValidLanguageCode, targetDefault } from '@/lib/translate';

// Guest-convention read for the language picker default: the profile
// column wins when present, otherwise localStorage `nexus-language`,
// otherwise English. Never throws (private mode etc.).
function pickInitialLang(profileLang) {
  if (isValidLanguageCode(profileLang)) return profileLang.trim();
  try {
    const s = window.localStorage.getItem('nexus-language');
    if (isValidLanguageCode(s)) return s.trim();
  } catch { /* ignore */ }
  return targetDefault();
}

const CSS = `
.pe-root { min-height: 100dvh; background: #050508; color: #f2f2f2;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  padding: 1.2rem 1.1rem calc(6rem + env(safe-area-inset-bottom)); }
.pe-wrap { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.6rem; }
.pe-h1 { font-size: 1.5rem; font-weight: 800; margin: 0; }
.pe-back { color: #00f2ff; font-size: 0.85rem; text-decoration: none; }
.pe-tabs { display: inline-flex; border: 1px solid rgba(255,209,102,0.4); border-radius: 999px; overflow: hidden; align-self: flex-start; }
.pe-tabs button { padding: 0.6rem 1.3rem; font-size: 0.8rem; font-weight: 700; letter-spacing: 1.5px;
  text-transform: uppercase; background: none; border: none; color: #8a8a99; cursor: pointer; min-height: 44px; }
.pe-tabs button.on { background: #ffd166; color: #0a0a0c; }
.pe-card { background: rgba(14,14,20,0.92); border: 1px solid rgba(255,209,102,0.25);
  border-radius: 12px; padding: 1.3rem; display: flex; flex-direction: column; gap: 0.9rem; }
.pe-card h2 { font-size: 1rem; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;
  color: #ffd166; margin: 0; }
.pe-label { display: block; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px;
  color: #888; margin-bottom: 0.35rem; }
.pe-input, .pe-area { width: 100%; box-sizing: border-box; background: #0a0a0c; border: 1px solid #333;
  padding: 0.85rem; color: #f2f2f2; border-radius: 8px; font-size: 0.95rem; font-family: inherit; }
.pe-area { resize: vertical; min-height: 90px; }
.pe-input:focus, .pe-area:focus { outline: none; border-color: #ffd166; }
.pe-row { display: flex; gap: 0.7rem; flex-wrap: wrap; align-items: center; }
.pe-btn { background: #ffd166; color: #0a0a0c; border: none; border-radius: 8px; font-weight: 800;
  font-size: 0.85rem; letter-spacing: 1px; padding: 0.8rem 1.2rem; cursor: pointer; min-height: 44px; }
.pe-btn.ghost { background: transparent; border: 1px solid #00f2ff; color: #00f2ff; }
.pe-btn.danger { background: transparent; border: 1px solid #fe53bb; color: #fe53bb; }
.pe-btn:disabled { opacity: 0.55; cursor: wait; }
.pe-thumb { width: 84px; height: 84px; border-radius: 10px; object-fit: cover; background: #0a0a12;
  border: 1px solid #333; }
.pe-thumb.round { border-radius: 50%; }
.pe-item { display: flex; gap: 0.8rem; align-items: center; background: rgba(10,10,14,0.8);
  border: 1px solid #2a2a35; border-radius: 10px; padding: 0.7rem; }
.pe-item .pe-meta { flex: 1; min-width: 0; }
.pe-item .pe-title { font-weight: 700; font-size: 0.9rem; margin: 0 0 0.2rem; }
.pe-item .pe-sub { color: #888; font-size: 0.78rem; margin: 0; }
.pe-check { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; color: #ccc; }
.pe-check input { width: 22px; height: 22px; }
.pe-err { color: #fe53bb; font-size: 0.85rem; }
.pe-ok { color: #06d6a0; font-size: 0.85rem; }
.pe-hint { color: #777; font-size: 0.78rem; }
`;

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('signed-out');
  return { Authorization: `Bearer ${session.access_token}` };
}

async function uploadFile(kind, file) {
  const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
  const r1 = await fetch('/api/profiles/upload-url', {
    method: 'POST', headers,
    body: JSON.stringify({ kind, contentType: file.type, sizeBytes: file.size }),
  });
  const d1 = await r1.json().catch(() => ({}));
  if (!r1.ok) throw new Error(d1.error || 'Could not prepare upload.');
  const r2 = await fetch(d1.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!r2.ok) throw new Error('Upload failed. Try a smaller file.');
  return { publicUrl: d1.publicUrl, media_kind: d1.media_kind };
}

export default function EditProfilePage({ params }) {
  const router = useRouter();
  const slug = decodeURIComponent(params.username || '');
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [profiles, setProfiles] = useState(null);
  const [type, setType] = useState('personal');
  const [form, setForm] = useState({ display_name: '', username: '', bio: '', websites: '', tiktok: '', lang: 'en' });
  const [tiktokErr, setTiktokErr] = useState('');
  const [coverKind, setCoverKind] = useState('image');
  const [art, setArt] = useState([]);
  const [posts, setPosts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [artForm, setArtForm] = useState({ title: '', description: '', for_sale: false, price: '' });
  const [postBody, setPostBody] = useState('');
  const fileRefs = useRef({});

  const say = useCallback((kind, text) => setMsg({ kind, text }), []);

  useEffect(() => {
    let sub;
    try {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user || null);
        setChecking(false);
      });
      const r = supabase.auth.onAuthStateChange((_e, s) => {
        setUser(s?.user || null);
        setChecking(false);
      });
      sub = r.data.subscription;
    } catch {
      setChecking(false);
    }
    return () => sub?.unsubscribe();
  }, []);

  const loadAll = useCallback(async () => {
    const headers = await authHeader();
    const res = await fetch('/api/profiles/me', { headers });
    if (!res.ok) throw new Error('Could not load profiles.');
    const data = await res.json();
    setProfiles(data.profiles);
    const mine = [data.profiles.personal?.username, data.profiles.business?.username];
    if (!mine.includes(slug)) {
      say('err', 'That profile is not yours.');
      return null;
    }
    return data.profiles;
  }, [slug, say]);

  const loadArtPosts = useCallback(async (profileId) => {
    const headers = await authHeader();
    const [ar, pr] = await Promise.all([
      fetch(`/api/profiles/art?profile_id=${profileId}`, { headers }).then((r) => r.json()),
      fetch(`/api/profiles/posts?profile_id=${profileId}`, { headers }).then((r) => r.json()),
    ]);
    setArt(ar.art || []);
    setPosts(pr.posts || []);
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const p = await loadAll();
        if (p) {
          const cur = p[type];
          setForm({
            display_name: cur.display_name || '',
            username: cur.username || '',
            bio: cur.bio || '',
            websites: (cur.website_urls || []).join('\n'),
            // Defensive read: the tiktok_handle migration may not have run
            // yet, in which case the column is simply absent from the row.
            tiktok: cur.tiktok_handle || '',
            // Preferred language: profile column wins; falls back to the
            // guest convention (localStorage nexus-language), then English.
            // The preferred_language migration may not have run yet either.
            lang: pickInitialLang(cur.preferred_language),
          });
          setTiktokErr('');
          setCoverKind(cur.cover_kind || 'image');
          await loadArtPosts(cur.id);
        }
      } catch (e) {
        say('err', e.message || 'Could not load.');
      }
    })();
  }, [user, type, loadAll, loadArtPosts, say]);

  if (checking) return <main className="pe-root"><style>{CSS}</style><p>Loading…</p></main>;
  if (!user) {
    return (
      <main className="pe-root"><style>{CSS}</style>
        <div className="pe-wrap">
          <h1 className="pe-h1">Edit profile</h1>
          <p className="pe-hint">Sign in to edit your profile.</p>
          <Auth onLogin={() => window.location.reload()} />
        </div>
      </main>
    );
  }

  const cur = profiles?.[type];
  if (profiles && !cur) return <main className="pe-root"><style>{CSS}</style><p>Profile not found.</p></main>;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // TikTok handle: strip a leading @ as they type; validate on save.
  const setTiktok = (e) => {
    let v = e.target.value.replace(/^@/, '');
    setForm((f) => ({ ...f, tiktok: v }));
    const trimmed = v.trim();
    if (!trimmed) { setTiktokErr(''); return; }
    setTiktokErr(normalizeTikTokHandle(v) ? '' : 'Letters, numbers, _ and . only (max 24).');
  };

  async function saveProfile(e) {
    e?.preventDefault();
    // TikTok handle is personal-only. Invalid handle blocks this save with
    // an inline error — nothing is sent until it validates or is cleared.
    let tiktok = null;
    if (type === 'personal') {
      const raw = form.tiktok.trim();
      if (raw) {
        tiktok = normalizeTikTokHandle(raw);
        if (!tiktok) {
          setTiktokErr('Letters, numbers, _ and . only (max 24).');
          return;
        }
      }
    }
    // Preferred language is personal-only, like the TikTok handle.
    // Invalid values fall back to English; the PATCH route writes it
    // defensively (42703-tolerant) until the migration runs.
    const preferredLanguage = type === 'personal' && isValidLanguageCode(form.lang)
      ? form.lang.trim()
      : targetDefault();
    setBusy(true);
    say('', '');
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
      const res = await fetch('/api/profiles/me', {
        method: 'PATCH', headers,
        body: JSON.stringify({
          type,
          display_name: form.display_name,
          username: form.username,
          bio: form.bio,
          website_urls: form.websites.split('\n').map((s) => s.trim()).filter(Boolean),
          cover_kind: coverKind,
          // Bare handle, no @; null clears. Sent for personal only.
          tiktok_handle: tiktok,
          // Preferred content language, personal row only.
          preferred_language: preferredLanguage,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed.');
      say('ok', 'Profile saved.');
      // Keep the guest convention in sync: the profile column is the
      // source of truth for signed-in users, localStorage for guests.
      try { window.localStorage.setItem('nexus-language', preferredLanguage); } catch { /* ignore */ }
      if (data.profile?.username && data.profile.username !== slug) {
        router.replace(`/u/${encodeURIComponent(data.profile.username)}/edit`);
      } else {
        await loadAll();
      }
    } catch (err) {
      say('err', err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleMedia(kind, field) {
    const file = fileRefs.current[kind]?.files?.[0];
    if (!file) return;
    setBusy(true);
    say('', '');
    try {
      const { publicUrl } = await uploadFile(kind, file);
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
      const patch = { type };
      if (field === 'cover') {
        patch.cover_url = publicUrl;
        patch.cover_kind = file.type.startsWith('video') ? 'video' : 'image';
        setCoverKind(patch.cover_kind);
      } else {
        patch[field] = publicUrl;
      }
      const res = await fetch('/api/profiles/me', { method: 'PATCH', headers, body: JSON.stringify(patch) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed.');
      say('ok', 'Media updated.');
      await loadAll();
    } catch (err) {
      say('err', err.message);
    } finally {
      setBusy(false);
      if (fileRefs.current[kind]) fileRefs.current[kind].value = '';
    }
  }

  async function addArt(e) {
    e.preventDefault();
    const file = fileRefs.current.art?.files?.[0];
    if (!file) { say('err', 'Choose an image or video for the art.'); return; }
    setBusy(true);
    say('', '');
    try {
      const { publicUrl, media_kind } = await uploadFile('art', file);
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
      const price_cents = artForm.for_sale ? Math.round(Number(artForm.price) * 100) : null;
      const res = await fetch('/api/profiles/art', {
        method: 'POST', headers,
        body: JSON.stringify({
          profile_id: cur.id,
          title: artForm.title,
          description: artForm.description,
          media_url: publicUrl,
          media_kind,
          for_sale: artForm.for_sale,
          price_cents,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not add art.');
      setArtForm({ title: '', description: '', for_sale: false, price: '' });
      fileRefs.current.art.value = '';
      say('ok', 'Art added to your gallery.');
      await loadArtPosts(cur.id);
    } catch (err) {
      say('err', err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteArt(id) {
    if (!window.confirm('Remove this art from your gallery?')) return;
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/profiles/art?id=${id}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error('Delete failed.');
      await loadArtPosts(cur.id);
    } catch (err) {
      say('err', err.message);
    }
  }

  async function addPost(e) {
    e.preventDefault();
    setBusy(true);
    say('', '');
    try {
      let media_url = null;
      let media_kind = null;
      const file = fileRefs.current.post?.files?.[0];
      if (file) {
        const up = await uploadFile('post', file);
        media_url = up.publicUrl;
        media_kind = up.media_kind;
      }
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
      const res = await fetch('/api/profiles/posts', {
        method: 'POST', headers,
        body: JSON.stringify({ profile_id: cur.id, body: postBody, media_url, media_kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not post.');
      setPostBody('');
      if (fileRefs.current.post) fileRefs.current.post.value = '';
      say('ok', 'Posted.');
      await loadArtPosts(cur.id);
    } catch (err) {
      say('err', err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deletePost(id) {
    if (!window.confirm('Delete this post?')) return;
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/profiles/posts?id=${id}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error('Delete failed.');
      await loadArtPosts(cur.id);
    } catch (err) {
      say('err', err.message);
    }
  }

  return (
    <main className="pe-root">
      <style>{CSS}</style>
      <div className="pe-wrap">
        <Link className="pe-back" href={`/u/${encodeURIComponent(slug)}${type === 'business' ? '?v=business' : ''}`}>← View profile</Link>
        <h1 className="pe-h1">Edit profile</h1>

        <div className="pe-tabs" role="tablist" aria-label="Which profile to edit">
          <button type="button" className={type === 'personal' ? 'on' : ''} onClick={() => setType('personal')}>Personal</button>
          <button type="button" className={type === 'business' ? 'on' : ''} onClick={() => setType('business')}>Business</button>
        </div>

        {msg.text ? <p className={msg.kind === 'err' ? 'pe-err' : 'pe-ok'} role="status">{msg.text}</p> : null}

        <form className="pe-card" onSubmit={saveProfile}>
          <h2>Details</h2>
          <div>
            <label className="pe-label" htmlFor="pe-dn">Display name</label>
            <input id="pe-dn" className="pe-input" value={form.display_name} onChange={set('display_name')} maxLength={60} />
          </div>
          <div>
            <label className="pe-label" htmlFor="pe-un">Username (your /u/ link)</label>
            <input id="pe-un" className="pe-input" value={form.username} onChange={set('username')} maxLength={32} />
          </div>
          <div>
            <label className="pe-label" htmlFor="pe-bio">Bio</label>
            <textarea id="pe-bio" className="pe-area" value={form.bio} onChange={set('bio')} maxLength={500} />
          </div>
          {type === 'personal' ? (
            <>
            <div>
              <label className="pe-label" htmlFor="pe-tt">TikTok handle (optional)</label>
              <div className="pe-row" style={{ flexWrap: 'nowrap' }}>
                <span aria-hidden="true" style={{ color: '#888', fontWeight: 700 }}>@</span>
                <input
                  id="pe-tt" className="pe-input" value={form.tiktok} onChange={setTiktok}
                  maxLength={25} placeholder="yourhandle" autoComplete="off" spellCheck={false}
                  aria-describedby="pe-tt-hint" />
              </div>
              {tiktokErr ? <p className="pe-err" role="alert" style={{ margin: '0.35rem 0 0' }}>{tiktokErr}</p> : null}
              <p className="pe-hint" id="pe-tt-hint" style={{ margin: '0.35rem 0 0' }}>
                Used to credit you when your live recordings are shared. Leave blank to skip.
              </p>
            </div>
            <div>
              <label className="pe-label" htmlFor="pe-lang">Preferred language</label>
              <select
                id="pe-lang" className="pe-input" value={form.lang}
                onChange={(e) => setForm((f) => ({ ...f, lang: e.target.value }))}
                aria-describedby="pe-lang-hint"
              >
                <optgroup label="Instant — built in">
                  {BUNDLED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.native} ({l.english})</option>
                  ))}
                </optgroup>
                <optgroup label="Live translation">
                  {EXTENDED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.native} ({l.english})</option>
                  ))}
                </optgroup>
              </select>
              <p className="pe-hint" id="pe-lang-hint" style={{ margin: '0.35rem 0 0' }}>
                The language your content is translated into. English is the default.
                Built-in languages translate instantly; the rest use live translation,
                and menus stay in English.
              </p>
            </div>
            </>
          ) : null}
          <div>
            <label className="pe-label" htmlFor="pe-web">Websites (one per line)</label>
            <textarea id="pe-web" className="pe-area" value={form.websites} onChange={set('websites')} placeholder="https://your-site.com" />
          </div>
          <div className="pe-row">
            <button type="submit" className="pe-btn" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button>
          </div>
        </form>

        <div className="pe-card">
          <h2>Avatar & cover</h2>
          <div>
            <label className="pe-label">Profile photo</label>
            <div className="pe-row">
              {cur?.avatar_url ? <img className="pe-thumb round" src={cur.avatar_url} alt="" /> : null}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" ref={(el) => (fileRefs.current.avatar = el)} aria-label="Profile photo" />
              <button type="button" className="pe-btn ghost" disabled={busy} onClick={() => handleMedia('avatar', 'avatar_url')}>Upload photo</button>
            </div>
          </div>
          <div>
            <label className="pe-label">Profile video (plays in your avatar circle)</label>
            <div className="pe-row">
              <input type="file" accept="video/mp4,video/webm,video/quicktime" ref={(el) => (fileRefs.current.profile_video = el)} aria-label="Profile video" />
              <button type="button" className="pe-btn ghost" disabled={busy} onClick={() => handleMedia('profile_video', 'profile_video_url')}>Upload video</button>
            </div>
            {cur?.profile_video_url ? <p className="pe-hint">A video is set — it plays instead of the photo.</p> : null}
          </div>
          <div>
            <label className="pe-label">Cover (image or video)</label>
            <div className="pe-row">
              {cur?.cover_url && coverKind === 'image' ? <img className="pe-thumb" src={cur.cover_url} alt="" /> : null}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" ref={(el) => (fileRefs.current.cover = el)} aria-label="Cover" />
              <button type="button" className="pe-btn ghost" disabled={busy} onClick={() => handleMedia('cover', 'cover')}>Upload cover</button>
            </div>
          </div>
        </div>

        <div className="pe-card">
          <h2>Art gallery</h2>
          {art.map((a) => (
            <div key={a.id} className="pe-item">
              {a.media_kind === 'video'
                ? <video className="pe-thumb" src={a.media_url} muted playsInline preload="metadata" />
                : <img className="pe-thumb" src={a.media_url} alt="" />}
              <div className="pe-meta">
                <p className="pe-title">{a.title}</p>
                <p className="pe-sub">{a.for_sale && a.price_cents ? `For sale — $${(a.price_cents / 100).toFixed(2)}` : 'Not for sale'} · {a.sold_count || 0} sold</p>
              </div>
              <button type="button" className="pe-btn danger" onClick={() => deleteArt(a.id)}>Remove</button>
            </div>
          ))}
          <form onSubmit={addArt} style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            <div>
              <label className="pe-label">New art — file</label>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" ref={(el) => (fileRefs.current.art = el)} aria-label="Art file" />
            </div>
            <div>
              <label className="pe-label">Title</label>
              <input className="pe-input" value={artForm.title} onChange={(e) => setArtForm((f) => ({ ...f, title: e.target.value }))} maxLength={120} />
            </div>
            <div>
              <label className="pe-label">Description</label>
              <textarea className="pe-area" value={artForm.description} onChange={(e) => setArtForm((f) => ({ ...f, description: e.target.value }))} maxLength={1000} />
            </div>
            <label className="pe-check">
              <input type="checkbox" checked={artForm.for_sale} onChange={(e) => setArtForm((f) => ({ ...f, for_sale: e.target.checked }))} />
              Sell this through Stripe
            </label>
            {artForm.for_sale ? (
              <div>
                <label className="pe-label">Price (CAD, min $1.00)</label>
                <input className="pe-input" type="number" min="1" step="0.01" value={artForm.price} onChange={(e) => setArtForm((f) => ({ ...f, price: e.target.value }))} placeholder="25.00" />
              </div>
            ) : null}
            <div className="pe-row">
              <button type="submit" className="pe-btn" disabled={busy}>{busy ? 'Adding…' : 'Add art'}</button>
            </div>
          </form>
        </div>

        <div className="pe-card">
          <h2>Posts</h2>
          {posts.map((p) => (
            <div key={p.id} className="pe-item">
              <div className="pe-meta">
                <p className="pe-title">{p.body ? p.body.slice(0, 120) : '(media post)'}</p>
                <p className="pe-sub">{new Date(p.created_at).toLocaleDateString()}</p>
              </div>
              <button type="button" className="pe-btn danger" onClick={() => deletePost(p.id)}>Delete</button>
            </div>
          ))}
          <form onSubmit={addPost} style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            <div>
              <label className="pe-label">New post</label>
              <textarea className="pe-area" value={postBody} onChange={(e) => setPostBody(e.target.value)} maxLength={2000} placeholder="What's happening?" />
            </div>
            <div>
              <label className="pe-label">Optional photo/video</label>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" ref={(el) => (fileRefs.current.post = el)} aria-label="Post media" />
            </div>
            <div className="pe-row">
              <button type="submit" className="pe-btn" disabled={busy}>{busy ? 'Posting…' : 'Post'}</button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
