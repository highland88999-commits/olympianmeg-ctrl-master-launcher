// components/profiles/ProfileClient.jsx
// Client islands for the public profile page: gallery (hover-play videos +
// Buy buttons), posts, share actions, and the owner bar.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { profileUrl, fetchFriendsOf } from '@/lib/friends';

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

export function ProfileClient({ username, type, art, posts, userId }) {
  const [isOwner, setIsOwner] = useState(false);
  const [buying, setBuying] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  // Blocking: silent both ways — the blocked user is never notified.
  const [blockedList, setBlockedList] = useState([]);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const confirmTimer = useRef(null);
  // Friends section: canonical friendships source via /api/friends/of.
  // friends === null -> not loaded or signed out (section hidden).
  const [friends, setFriends] = useState(null);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsBlocked, setFriendsBlocked] = useState(false);
  const [removeArmed, setRemoveArmed] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(null);
  const removeTimer = useRef(null);

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
    // Blocked list: who I have blocked (drives the BLOCK button + owner panel).
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
      try {
        const bres = await fetch('/api/friends/blocked', { headers });
        if (!bres.ok) return;
        const bdata = await bres.json();
        setBlockedList(bdata.blocked || []);
      } catch { /* offline */ }
      // Friends section: canonical source. Signed out -> hidden (no leak,
      // and blocks can only be enforced for a known viewer).
      try {
        if (!userId) return;
        setFriendsLoading(true);
        const token = String(headers.Authorization || '').replace(/^Bearer\s+/, '');
        const fdata = await fetchFriendsOf(token, userId);
        if (fdata.blocked) {
          setFriendsBlocked(true);
          setFriends([]);
        } else {
          setFriends(fdata.friends || []);
        }
      } catch { /* offline or unauthorized */ } finally {
        setFriendsLoading(false);
      }
    })();
  }, [username, userId, showToast]);

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
      // Honest landing: take them to the post that was just created in the
      // Agora — the proof it worked. The URL is validated before use so this
      // can never send anyone to a dead 404.
      showToast('Shared to the Agora!');
      const agoraUrl = typeof data.agora_url === 'string' ? data.agora_url : '';
      if (/^\/agora\/post\/[A-Za-z0-9-]+$/.test(agoraUrl)) {
        setTimeout(() => { window.location.href = agoraUrl; }, 900);
      }
    } catch {
      showToast('Could not share to the Agora.');
    } finally {
      setSharing(false);
    }
  }, [username, type, showToast]);

  const isBlocked = userId ? blockedList.some((b) => b.user_id === userId) : false;

  const doBlockToggle = useCallback(async () => {
    if (blockBusy || !userId) return;
    if (!isBlocked && !confirmBlock) {
      // first tap: arm the confirm; second tap within 3s executes
      setConfirmBlock(true);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmBlock(false), 3000);
      return;
    }
    setBlockBusy(true);
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
      if (!headers.Authorization) {
        showToast('Sign in to block users.');
        return;
      }
      const path = isBlocked ? '/api/friends/unblock' : '/api/friends/block';
      const res = await fetch(path, {
        method: 'POST',
        headers,
        body: JSON.stringify({ friend_id: userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Could not update the block.');
        return;
      }
      setConfirmBlock(false);
      if (isBlocked) {
        setBlockedList((l) => l.filter((b) => b.user_id !== userId));
        showToast('Unblocked.');
      } else {
        showToast('Blocked. They cannot contact you here, and they will not be told.');
        try {
          const bres = await fetch('/api/friends/blocked', { headers });
          const bdata = await bres.json().catch(() => ({}));
          setBlockedList(bdata.blocked || []);
        } catch { /* keep last */ }
      }
    } catch {
      showToast('Could not update the block.');
    } finally {
      setBlockBusy(false);
    }
  }, [blockBusy, userId, isBlocked, confirmBlock, showToast]);

  const unblockFromList = useCallback(async (blockedId) => {
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
      if (!headers.Authorization) return;
      const res = await fetch('/api/friends/unblock', {
        method: 'POST',
        headers,
        body: JSON.stringify({ friend_id: blockedId }),
      });
      if (!res.ok) return;
      setBlockedList((l) => l.filter((b) => b.user_id !== blockedId));
    } catch { /* offline */ }
  }, []);

  // Unfriend: two-tap confirm (first tap arms "Sure?", second removes).
  const doRemove = useCallback(async (friendId) => {
    if (removeBusy || !friendId) return;
    if (removeArmed !== friendId) {
      setRemoveArmed(friendId);
      if (removeTimer.current) clearTimeout(removeTimer.current);
      removeTimer.current = setTimeout(() => setRemoveArmed(null), 3000);
      return;
    }
    setRemoveBusy(friendId);
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
      if (!headers.Authorization) {
        showToast('Sign in to manage friends.');
        return;
      }
      const res = await fetch('/api/friends/remove', {
        method: 'POST',
        headers,
        body: JSON.stringify({ friend_id: friendId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Could not remove friend.');
        return;
      }
      setFriends((f) => (f || []).filter((x) => x.user_id !== friendId));
      showToast('Removed from friends.');
    } catch {
      showToast('Could not remove friend.');
    } finally {
      setRemoveArmed(null);
      setRemoveBusy(null);
    }
  }, [removeBusy, removeArmed, showToast]);

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
      {!isOwner && userId ? (
        <div className="pf-actions" style={{ paddingTop: 0 }}>
          <button
            type="button"
            className={`pf-btn pf-blockbtn${confirmBlock ? ' armed' : ''}`}
            onClick={doBlockToggle}
            disabled={blockBusy}
            aria-live="polite"
          >
            {blockBusy ? 'Working…' : isBlocked ? 'Unblock' : confirmBlock ? 'Tap again to confirm block' : 'Block'}
          </button>
        </div>
      ) : null}

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

      {/* Friends: canonical friendships source, collapsible. Hidden when
          signed out or when the pair is blocked (silent — no leak). */}
      {friends !== null && !friendsBlocked ? (
        <section className="pf-section" aria-label="Friends" data-ui="profile-friends">
          <details className="pf-friends">
            <summary className="pf-h pf-friends-summary">
              Friends
              <span className="pf-friends-count">{friends.length}</span>
            </summary>
            {friendsLoading ? (
              <p className="pf-empty">Loading…</p>
            ) : friends.length === 0 ? (
              <p className="pf-empty">
                {isOwner ? 'No friends yet — meet players in Order 67.' : 'No friends to show.'}
              </p>
            ) : (
              <ul className="pf-friends-list">
                {friends.map((f) => (
                  <li key={f.user_id} className="pf-friend-row">
                    <Link href={profileUrl(f)} className="pf-friend-link">
                      {f.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.avatar_url} alt="" className="pf-friend-avatar" loading="lazy" />
                      ) : (
                        <span className="pf-friend-avatar pf-friend-fallback" aria-hidden="true">
                          {(f.display_name || f.username || '?').slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="pf-friend-name">
                        {f.display_name || f.username}
                        {f.username ? <span className="pf-username-sm"> @{f.username}</span> : null}
                      </span>
                    </Link>
                    {isOwner ? (
                      <button
                        type="button"
                        data-ui="profile-friend-remove"
                        className={`pf-btn pf-unfriend${removeArmed === f.user_id ? ' armed' : ''}`}
                        onClick={() => doRemove(f.user_id)}
                        disabled={removeBusy === f.user_id}
                      >
                        {removeBusy === f.user_id ? 'Working…' : removeArmed === f.user_id ? 'Sure?' : 'Remove'}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </details>
        </section>
      ) : null}

      {isOwner ? (
        <>
          <button
            type="button"
            className="pf-fab"
            onClick={() => setBlockedOpen((v) => !v)}
            aria-label={blockedOpen ? 'Close blocked list' : 'Open blocked list'}
            title="Blocked users"
          >
            &#128683;
            {blockedList.length > 0 ? <span className="pf-fab-count">{blockedList.length}</span> : null}
          </button>
          {blockedOpen ? (
            <div className="pf-blocked-sheet" role="dialog" aria-label="Blocked users">
              <div className="pf-blocked-head">
                <h2 className="pf-h">Blocked</h2>
                <button type="button" className="pf-btn" onClick={() => setBlockedOpen(false)}>
                  Close
                </button>
              </div>
              <p className="pf-note">Blocked users stay silent — they are never told, and they cannot reach you here.</p>
              {blockedList.length === 0 ? (
                <p className="pf-empty">Nobody blocked.</p>
              ) : (
                blockedList.map((b) => (
                  <div key={b.user_id} className="pf-blocked-row">
                    <span className="pf-blocked-name">
                      {b.display_name || b.username || 'Unknown'}
                      {b.username ? <span className="pf-username-sm"> @{b.username}</span> : null}
                    </span>
                    <button
                      type="button"
                      className="pf-btn"
                      onClick={() => unblockFromList(b.user_id)}
                    >
                      Unblock
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
