// app/live-recordings/page.jsx
// LIVE RECORDINGS — community video feed (Part 2).
// Newest-first grid of community recordings with like, share, and upload.
//
// NOTE: depends on two sibling-worker files integrated at publish time:
//   lib/tiktok-attribution (normalizeTikTokHandle, displayTikTokHandle,
//     tiktokProfileUrl, buildShareText, recordingShareUrl)
//   components/live-recordings/ShareRecording (props { recording: { id, title, tiktok_handle } })
// until those land, this page cannot build — the coordinator integrates them.
//
// Defensive: the supabase/migrations/20261004_live_recordings.sql migration
// may not be run yet. If the tables don't exist we show an honest
// "not set up yet" state instead of crashing.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  normalizeTikTokHandle,
  displayTikTokHandle,
  tiktokProfileUrl,
} from '@/lib/tiktok-attribution';
import ShareRecording from '@/components/live-recordings/ShareRecording';
import TranslatedText from '@/components/TranslatedText';
import { resolvePreferredLanguage } from '@/lib/translate';
import {
  snapshotHandle,
  resolveRecordingHandle,
  sortNewestFirst,
  sanitizeRecordingTitle,
} from '@/lib/live-recordings/recordings';

const ACCEPT = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_BYTES = 100 * 1024 * 1024;

// Table-doesn't-exist (migration not run yet).
function isMissingTable(err) {
  if (!err) return false;
  const code = err.code || '';
  const msg = String(err.message || '');
  return code === '42P01' || code === 'PGRST205' || /relation .* does not exist|could not find the table/i.test(msg);
}

async function authBearer() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('signed-out');
  return { user: session.user, headers: { Authorization: `Bearer ${session.access_token}` } };
}

// Best-effort fetch of the signed-in user's personal profile for the handle
// snapshot. tiktok_handle arrives in a not-yet-run migration, so a 42703
// (missing column) is tolerated and yields a null snapshot.
async function fetchMyPersonalProfile(userId) {
  const base = supabase.from('user_profiles').select('id,display_name,username').eq('user_id', userId).eq('type', 'personal');
  const { data } = await base.maybeSingle();
  if (!data) return null;
  try {
    const { data: withHandle } = await supabase
      .from('user_profiles').select('id,display_name,username,tiktok_handle,preferred_language')
      .eq('user_id', userId).eq('type', 'personal').maybeSingle();
    return withHandle || data;
  } catch {
    return data;
  }
}

function putWithProgress(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error('Upload failed (server rejected the file). Try a smaller file.'));
    };
    xhr.onerror = () => reject(new Error('Upload failed (network error). Check your connection and try again.'));
    xhr.send(file);
  });
}

export default function LiveRecordingsPage() {
  const [loading, setLoading] = useState(true);
  const [notSetup, setNotSetup] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [profilesByUser, setProfilesByUser] = useState({});
  const [user, setUser] = useState(null);
  const [myLikes, setMyLikes] = useState(new Set());
  const [deepId, setDeepId] = useState(null);

  // Upload state
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadMsg, setUploadMsg] = useState({ kind: '', text: '' });
  const fileInputRef = useRef(null);
  const cardRefs = useRef({});
  const bumpedRef = useRef(new Set());
  // The VIEWER's preferred content language (default English). Signed-in
  // users: profile column wins. Guests: localStorage `nexus-language`.
  const [viewerLang, setViewerLang] = useState('en');

  useEffect(() => {
    let lang = 'en';
    try {
      lang = resolvePreferredLanguage({ storedLang: window.localStorage.getItem('nexus-language') });
    } catch { /* private mode etc. */ }
    setViewerLang(lang);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);

      // Viewer language: the signed-in user's profile column wins over
      // the guest localStorage value (already set as the initial state).
      if (session?.user?.id) {
        try {
          const mine = await fetchMyPersonalProfile(session.user.id);
          if (mine && mine.preferred_language) {
            setViewerLang(resolvePreferredLanguage({
              profileLang: mine.preferred_language,
              storedLang: window.localStorage.getItem('nexus-language'),
            }));
          }
        } catch { /* keep the guest/local default */ }
      }

      const { data, error: qerr } = await supabase
        .from('live_recordings')
        .select('id,user_id,title,video_url,thumbnail_url,tiktok_handle,created_at,view_count,likes_count')
        .order('created_at', { ascending: false })
        .limit(100);
      if (qerr) throw qerr;
      const list = sortNewestFirst(data || []);
      setRows(list);

      // Poster identity: display name + current handle fallback, from the
      // personal profile rows (public.user_profiles).
      const userIds = [...new Set(list.map((r) => r.user_id))];
      if (userIds.length) {
        const { data: profs } = await supabase
          .from('user_profiles')
          .select('user_id,display_name,username')
          .in('user_id', userIds)
          .eq('type', 'personal');
        const map = {};
        // Try to also get current tiktok_handle; tolerate missing column.
        let withHandles = profs || [];
        try {
          const { data: hd } = await supabase
            .from('user_profiles')
            .select('user_id,tiktok_handle')
            .in('user_id', userIds)
            .eq('type', 'personal');
          const hm = {};
          (hd || []).forEach((h) => { hm[h.user_id] = h.tiktok_handle; });
          withHandles = (profs || []).map((p) => ({ ...p, tiktok_handle: hm[p.user_id] }));
        } catch { /* migration not run — fall back to row snapshot only */ }
        withHandles.forEach((p) => { map[p.user_id] = p; });
        setProfilesByUser(map);
      }

      if (session?.user) {
        const { data: likes } = await supabase
          .from('recording_likes')
          .select('recording_id')
          .eq('user_id', session.user.id);
        setMyLikes(new Set((likes || []).map((l) => l.recording_id)));
      }
    } catch (e) {
      if (isMissingTable(e)) setNotSetup(true);
      else setError('Could not load recordings. Pull to refresh and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Deep link: ?recording=<id> — scroll to it and count the view.
  useEffect(() => {
    if (loading || !rows.length) return;
    const id = new URLSearchParams(window.location.search).get('recording');
    if (!id) return;
    setDeepId(id);
    const el = cardRefs.current[id];
    if (el) {
      const t = setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
      return () => clearTimeout(t);
    }
  }, [loading, rows]);

  useEffect(() => {
    if (!deepId || bumpedRef.current.has(deepId)) return;
    bumpedRef.current.add(deepId);
    supabase.rpc('bump_recording_view', { rec_id: deepId }).then(({ error: e }) => {
      if (!e) setRows((prev) => prev.map((r) => (r.id === deepId ? { ...r, view_count: (r.view_count || 0) + 1 } : r)));
    }).catch(() => {});
  }, [deepId]);

  const toggleLike = useCallback(async (id) => {
    if (!user) { setError('Sign in to like a recording.'); return; }
    const liked = myLikes.has(id);
    // Optimistic.
    setMyLikes((prev) => { const n = new Set(prev); liked ? n.delete(id) : n.add(id); return n; });
    setRows((prev) => prev.map((r) => (r.id === id
      ? { ...r, likes_count: Math.max(0, (r.likes_count || 0) + (liked ? -1 : 1)) } : r)));
    try {
      if (liked) {
        const { error: e } = await supabase.from('recording_likes')
          .delete().eq('user_id', user.id).eq('recording_id', id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from('recording_likes')
          .insert({ user_id: user.id, recording_id: id });
        if (e) throw e;
      }
    } catch {
      // Roll back on failure.
      setMyLikes((prev) => { const n = new Set(prev); liked ? n.add(id) : n.delete(id); return n; });
      setRows((prev) => prev.map((r) => (r.id === id
        ? { ...r, likes_count: Math.max(0, (r.likes_count || 0) + (liked ? 1 : -1)) } : r)));
    }
  }, [user, myLikes]);

  const bumpViewOnPlay = useCallback((id) => {
    if (bumpedRef.current.has(`play-${id}`)) return;
    bumpedRef.current.add(`play-${id}`);
    supabase.rpc('bump_recording_view', { rec_id: id }).then(({ error: e }) => {
      if (!e) setRows((prev) => prev.map((r) => (r.id === id ? { ...r, view_count: (r.view_count || 0) + 1 } : r)));
    }).catch(() => {});
  }, []);

  const onPickFile = (f) => {
    if (!f) return;
    if (!ACCEPT.includes(f.type)) {
      setUploadMsg({ kind: 'err', text: 'That file type is not supported. Use MP4, MOV, or WebM.' });
      return;
    }
    if (f.size > MAX_BYTES) {
      setUploadMsg({ kind: 'err', text: 'Video is too large. Maximum is 100 MB.' });
      return;
    }
    setFile(f);
    setUploadMsg({ kind: '', text: '' });
  };

  const upload = async () => {
    if (!file) { setUploadMsg({ kind: 'err', text: 'Choose a video first.' }); return; }
    const cleanTitle = sanitizeRecordingTitle(title);
    if (!cleanTitle) { setUploadMsg({ kind: 'err', text: 'Give your recording a title.' }); return; }
    setUploading(true);
    setProgress(0);
    setUploadMsg({ kind: '', text: '' });
    try {
      const { user: me, headers } = await authBearer();

      // 1) Signed upload URL.
      const r1 = await fetch('/api/live-recordings/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
      });
      const d1 = await r1.json().catch(() => ({}));
      if (!r1.ok) throw new Error(d1.error || 'Could not prepare the upload.');

      // 2) Direct PUT to storage, honest progress.
      await putWithProgress(d1.uploadUrl, file, file.type, setProgress);

      // 3) Handle snapshot from the personal profile (frozen at post time).
      const myProfile = await fetchMyPersonalProfile(me.id);
      const handle = snapshotHandle(myProfile);

      // 4) Recording row.
      const { error: insErr } = await supabase.from('live_recordings').insert({
        user_id: me.id,
        title: cleanTitle,
        video_url: d1.publicUrl,
        tiktok_handle: handle,
      });
      if (insErr) throw new Error('Video uploaded, but the post did not save. Try again.');

      setUploadMsg({ kind: 'ok', text: 'Posted. Welcome to the feed.' });
      setFile(null);
      setTitle('');
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load();
    } catch (e) {
      setUploadMsg({ kind: 'err', text: e.message === 'signed-out'
        ? 'You are signed out. Sign in and try again.'
        : (e.message || 'Upload failed. Try again.') });
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="lr-wrap">
      <style>{CSS}</style>
      <header className="lr-head">
        <h1>Live Recordings</h1>
        <p className="lr-sub">Community clips from the Olympusverse — newest first.</p>
      </header>

      {notSetup ? (
        <div className="lr-panel">
          <p className="lr-big">Not set up yet.</p>
          <p className="lr-sub">The Live Recordings database is not connected — the feed will appear here once it is.</p>
        </div>
      ) : (
        <>
          {user && !notSetup && (
            <section className="lr-upload">
              <h2>Post a recording</h2>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                disabled={uploading}
                onChange={(e) => onPickFile(e.target.files?.[0])}
              />
              <input
                type="text"
                placeholder="Title your recording…"
                value={title}
                maxLength={120}
                disabled={uploading}
                onChange={(e) => setTitle(e.target.value)}
              />
              {file && <p className="lr-hint">{file.name} — {(file.size / 1048576).toFixed(1)} MB</p>}
              <button className="lr-btn" onClick={upload} disabled={uploading || !file}>
                {uploading ? `Uploading… ${progress}%` : 'Post recording'}
              </button>
              {uploading && (
                <div className="lr-bar"><div className="lr-bar-fill" style={{ width: `${progress}%` }} /></div>
              )}
              {uploadMsg.text && <p className={uploadMsg.kind === 'err' ? 'lr-err' : 'lr-ok'}>{uploadMsg.text}</p>}
              <p className="lr-hint">MP4, MOV, or WebM up to 100 MB. Your TikTok handle is attached automatically from your profile.</p>
            </section>
          )}

          {loading && <p className="lr-sub">Loading recordings…</p>}
          {error && <p className="lr-err">{error}</p>}
          {!loading && !error && rows.length === 0 && (
            <div className="lr-panel">
              <p className="lr-big">No recordings yet.</p>
              <p className="lr-sub">Be the first — post a clip above.</p>
            </div>
          )}

          <section className="lr-grid">
            {rows.map((r) => {
              const prof = profilesByUser[r.user_id];
              const handle = normalizeTikTokHandle(resolveRecordingHandle(r, prof));
              const profileUrl = handle ? tiktokProfileUrl(handle) : null;
              const liked = myLikes.has(r.id);
              return (
                <article
                  key={r.id}
                  ref={(el) => { if (el) cardRefs.current[r.id] = el; }}
                  className={`lr-card${deepId === r.id ? ' lr-focus' : ''}`}
                >
                  <video
                    className="lr-video"
                    src={r.video_url}
                    poster={r.thumbnail_url || undefined}
                    controls
                    preload="metadata"
                    playsInline
                    onPlay={() => bumpViewOnPlay(r.id)}
                  />
                  <div className="lr-card-body">
                    <TranslatedText as="h3" className="lr-title" text={r.title} target={viewerLang} />
                    <p className="lr-meta">
                      <span className="lr-name">{prof?.display_name || prof?.username || 'Olympian'}</span>
                      {handle && profileUrl && (
                        <a
                          className="lr-handle"
                          href={profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {displayTikTokHandle(handle)}
                        </a>
                      )}
                      <span className="lr-views">{r.view_count || 0} views</span>
                    </p>
                    <div className="lr-actions">
                      <button
                        className={`lr-like${liked ? ' liked' : ''}`}
                        onClick={() => toggleLike(r.id)}
                        aria-pressed={liked}
                        aria-label={liked ? 'Unlike' : 'Like'}
                      >
                        {liked ? '♥' : '♡'} {r.likes_count || 0}
                      </button>
                      <ShareRecording recording={{ id: r.id, title: r.title, tiktok_handle: handle }} />
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}

const CSS = `
.lr-wrap { max-width: 1100px; margin: 0 auto; padding: 1.5rem 1rem 4rem; color: #e8e8ee; }
.lr-head h1 { font-size: 1.6rem; margin: 0 0 0.25rem; font-weight: 800; letter-spacing: 0.01em; }
.lr-sub { color: #9a9aa8; font-size: 0.9rem; margin: 0 0 1rem; }
.lr-big { font-size: 1.1rem; font-weight: 700; margin: 0 0 0.5rem; }
.lr-panel { background: rgba(255,255,255,0.03); border: 1px solid #26262f; border-radius: 12px; padding: 1.5rem; margin: 1rem 0; }
.lr-upload { background: rgba(255,255,255,0.03); border: 1px solid #26262f; border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; }
.lr-upload h2 { font-size: 1rem; margin: 0 0 0.75rem; }
.lr-upload input[type="text"] { width: 100%; margin: 0.6rem 0; padding: 0.6rem 0.75rem; border-radius: 8px; border: 1px solid #33333e; background: #0d0d14; color: #eee; font-size: 0.95rem; }
.lr-upload input[type="file"] { color: #bbb; font-size: 0.85rem; }
.lr-btn { display: inline-block; margin-top: 0.6rem; padding: 0.6rem 1.25rem; border: 0; border-radius: 999px; background: #7c3aed; color: #fff; font-weight: 700; font-size: 0.9rem; cursor: pointer; }
.lr-btn:disabled { opacity: 0.55; cursor: default; }
.lr-bar { height: 6px; border-radius: 3px; background: #1c1c26; margin-top: 0.75rem; overflow: hidden; }
.lr-bar-fill { height: 100%; background: #7c3aed; transition: width 0.2s; }
.lr-hint { color: #777; font-size: 0.78rem; margin: 0.5rem 0 0; }
.lr-err { color: #fe53bb; font-size: 0.85rem; }
.lr-ok { color: #06d6a0; font-size: 0.85rem; }
.lr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
.lr-card { background: rgba(255,255,255,0.03); border: 1px solid #26262f; border-radius: 12px; overflow: hidden; transition: border-color 0.3s; }
.lr-card.lr-focus { border-color: #7c3aed; }
.lr-video { width: 100%; aspect-ratio: 9/16; max-height: 480px; background: #000; display: block; }
.lr-card-body { padding: 0.75rem 0.9rem 1rem; }
.lr-title { font-size: 0.95rem; font-weight: 700; margin: 0 0 0.4rem; }
.lr-meta { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; font-size: 0.8rem; color: #9a9aa8; margin: 0 0 0.6rem; }
.lr-name { font-weight: 600; color: #d5d5de; }
.lr-handle { color: #7dd3fc; text-decoration: none; font-weight: 600; }
.lr-handle:hover { text-decoration: underline; }
.lr-views { margin-left: auto; }
.lr-actions { display: flex; align-items: center; gap: 0.75rem; }
.lr-like { background: none; border: 1px solid #33333e; border-radius: 999px; color: #ddd; padding: 0.35rem 0.8rem; font-size: 0.85rem; cursor: pointer; }
.lr-like.liked { color: #fe53bb; border-color: #fe53bb; }
`;
