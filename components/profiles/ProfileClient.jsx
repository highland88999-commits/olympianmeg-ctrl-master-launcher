// components/profiles/ProfileClient.jsx
// Client islands for the public profile page: gallery (hover-play videos +
// Buy buttons), posts, share actions, and the owner bar.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

async function authHeader() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
  } catch { /* signed out or offline */ }
  return {};
}

export function ProfileClient({ username, type, art, posts }) {
  const [isOwner, setIsOwner] = useState(false);
  const [buying, setBuying] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  }, []);

  useEffect(() => {
    // Thank-you note after a completed art purchase.
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('purchase') === 'success') {
        showToast('Payment complete — the artist has been notified. Thank you!');
        q.delete('purchase');
        const clean = `${window.location.pathname}${q.toString() ? `?${q}` : ''}`;
        window.history.replaceState(null, '', clean);
      } else if (q.get('purchase') === 'cancelled') {
        q.delete('purchase');
        const clean = `${window.location.pathname}${q.toString() ? `?${q}` : ''}`;
        window.history.replaceState(null, '', clean);
      }
    } catch { /* ignore */ }

    // Owner bar: does the signed-in user own this profile?
    (async () => {
      const headers = await authHeader();
      if (!headers.Authorization) return;
      try {
        const res = await fetch('/api/profiles/me', { headers });
        if (!res.ok) return;
        const data = await res.json();
        const mine = [data?.profiles?.personal?.username, data?.profiles?.business?.username];
        if (mine.includes(username)) setIsOwner(true);
      } catch { /* offline */ }
    })();
  }, [username, showToast]);

  const buy = useCallback(async (artId) => {
    setBuying(artId);
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
      const res = await fetch('/api/art/checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({ art_piece_id: artId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        showToast(data.error || 'Could not start checkout. Please try again.');
        return;
      }
      window.location.href = data.url;
    } catch {
      showToast('Could not start checkout. Please try again.');
    } finally {
      setBuying(null);
    }
  }, [showToast]);

  const shareToAgora = useCallback(async () => {
    setSharing(true);
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
      if (!headers.Authorization) {
        showToast('Sign in to share to the Agora.');
        return;
      }
      const res = await fetch('/api/profiles/share-agora', {
        method: 'POST',
        headers,
        body: JSON.stringify({ username, type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Could not share to the Agora.');
        return;
      }
      showToast('Shared to the Agora!');
    } catch {
      showToast('Could not share to the Agora.');
    } finally {
      setSharing(false);
    }
  }, [username, type, showToast]);

  const shareExternal = useCallback(async () => {
    const url = `${window.location.origin}/u/${encodeURIComponent(username)}${type === 'business' ? '?v=business' : ''}`;
    const shareData = { title: `${username} on Olympus`, url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      throw new Error('no-share');
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        showToast('Profile link copied.');
      } catch {
        showToast(url);
      }
    }
  }, [username, type, showToast]);

  return (
    <>
      <div className="pf-actions">
        <button type="button" className="pf-btn" onClick={shareExternal}>Share profile</button>
        {isOwner ? (
          <>
            <button type="button" className="pf-btn gold" onClick={shareToAgora} disabled={sharing}>
              {sharing ? 'Sharing…' : 'Share to Agora'}
            </button>
            <Link className="pf-btn" href={`/u/${encodeURIComponent(username)}/edit`}>Edit profile</Link>
          </>
        ) : null}
      </div>

      <section className="pf-section" aria-label="Art gallery">
        <h2 className="pf-h">Gallery</h2>
        {art.length === 0 ? (
          <p className="pf-empty">No art shared yet.</p>
        ) : (
          <div className="pf-grid">
            {art.map((a) => (
              <article key={a.id} className="pf-card">
                <div className="pf-media">
                  {a.media_kind === 'video' ? (
                    <video
                      src={a.media_url} muted loop playsInline preload="metadata"
                      onMouseOver={(e) => { e.currentTarget.play().catch(() => {}); }}
                      onMouseOut={(e) => e.currentTarget.pause()}
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.media_url} alt={a.title} loading="lazy" />
                  )}
                </div>
                <div className="pf-card-body">
                  <h3 className="pf-card-title">{a.title}</h3>
                  {a.description ? <p className="pf-note" style={{ marginTop: 0 }}>{a.description.slice(0, 90)}</p> : null}
                  {a.for_sale && a.price_cents ? (
                    <>
                      <p className="pf-price">{money(a.price_cents)}</p>
                      <button type="button" className="pf-buy" disabled={buying === a.id} onClick={() => buy(a.id)}>
                        {buying === a.id ? 'Starting…' : 'Buy with card'}
                      </button>
                    </>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="pf-section" aria-label="Posts">
        <h2 className="pf-h">Posts</h2>
        {posts.length === 0 ? (
          <p className="pf-empty">No posts yet.</p>
        ) : (
          posts.map((post) => (
            <article key={post.id} className="pf-post">
              {post.body ? <p>{post.body}</p> : null}
              {post.media_url ? (
                post.media_kind === 'video' ? (
                  <video src={post.media_url} controls playsInline preload="metadata" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.media_url} alt="" loading="lazy" />
                )
              ) : null}
              <time>{new Date(post.created_at).toLocaleDateString()}</time>
            </article>
          ))
        )}
      </section>

      {toast ? <div className="pf-toast" role="status">{toast}</div> : null}
    </>
  );
}
