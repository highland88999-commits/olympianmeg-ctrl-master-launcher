// app/u/[username]/page.jsx — public user profile (Personal | Business).
// Server component: fetches the profile, art gallery, and posts with the
// shared supabase client (public-read RLS). Interactive bits (buy, share,
// owner bar, gallery hover-play) live in components/profiles/ProfileClient.jsx.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ProfileClient } from '@/components/profiles/ProfileClient';

export const dynamic = 'force-dynamic';

async function loadProfile(username, type) {
  let db;
  try {
    db = supabase; // throws 'Supabase is not configured' when env vars are missing
    // touch it to trigger the lazy init
    void db.from;
  } catch {
    return { offline: true };
  }
  try {
    const { data: profile, error } = await db
      .from('user_profiles')
      .select('*')
      .eq('username', username)
      .eq('type', type)
      .maybeSingle();
    if (error || !profile) return { missing: true };
    const [{ data: art }, { data: posts }] = await Promise.all([
      db.from('art_pieces').select('*').eq('profile_id', profile.id).order('created_at', { ascending: false }),
      db.from('profile_posts').select('*').eq('profile_id', profile.id).order('created_at', { ascending: false }).limit(50),
    ]);
    return { profile, art: art || [], posts: posts || [] };
  } catch {
    return { offline: true };
  }
}

export async function generateMetadata({ params, searchParams }) {
  const type = searchParams?.v === 'business' ? 'business' : 'personal';
  const data = await loadProfile(params.username, type);
  if (data.profile) {
    const p = data.profile;
    return {
      title: `${p.display_name || p.username} | NEXUS VORTEX`,
      description: (p.bio || 'Olympus user profile.').slice(0, 160),
    };
  }
  return { title: 'Profile | NEXUS VORTEX' };
}

const CSS = `
.pf-root { min-height: 100dvh; background: #050508; color: #f2f2f2;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  position: relative; z-index: 2; }
.pf-bgvideo { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
.pf-bgvideo video { width: 100%; height: 100%; object-fit: cover; display: block; }
.pf-bgvideo-scrim { position: fixed; inset: 0; z-index: 1; pointer-events: none;
  background: linear-gradient(to bottom, rgba(5,5,8,0.55), rgba(5,5,8,0.84)); }
@media (prefers-reduced-motion: reduce) {
  .pf-bgvideo, .pf-bgvideo-scrim { display: none; }
}
.pf-cover { position: relative; z-index: 2; width: 100%; height: 30vh; min-height: 200px; max-height: 340px;
  overflow: hidden; background: radial-gradient(120% 120% at 70% 20%, #141422 0%, #050508 70%); }
.pf-cover img, .pf-cover video { width: 100%; height: 100%; object-fit: cover; display: block; }
.pf-cover-fade { position: absolute; inset: 0;
  background: linear-gradient(to bottom, rgba(5,5,8,0.15), #050508 98%); }
.pf-wrap { max-width: 920px; margin: -72px auto 0; padding: 0 1.1rem calc(6rem + env(safe-area-inset-bottom));
  position: relative; z-index: 2; }
.pf-head { display: flex; gap: 1.1rem; align-items: flex-end; flex-wrap: wrap; }
.pf-avatar { width: 128px; height: 128px; border-radius: 50%; overflow: hidden; flex: none;
  border: 3px solid #ffd166; background: #0a0a12; box-shadow: 0 0 28px rgba(255,209,102,0.25); }
.pf-avatar img, .pf-avatar video { width: 100%; height: 100%; object-fit: cover; display: block; }
.pf-avatar-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  font-size: 3rem; font-weight: 800; color: #ffd166; background: #101018; }
.pf-name { font-size: 1.7rem; font-weight: 800; margin: 0; letter-spacing: 0.5px; }
.pf-type { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 2px; color: #00f2ff; }
.pf-bio { color: #b9b9c7; line-height: 1.6; margin: 0.9rem 0 0; font-size: 0.95rem; max-width: 60ch; }
.pf-links { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.9rem; }
.pf-link { font-size: 0.82rem; color: #00f2ff; border: 1px solid rgba(0,242,255,0.35);
  border-radius: 999px; padding: 0.45rem 0.9rem; text-decoration: none; word-break: break-all; }
.pf-switch { display: inline-flex; border: 1px solid rgba(255,209,102,0.4); border-radius: 999px;
  overflow: hidden; margin-top: 1.1rem; }
.pf-switch a { padding: 0.6rem 1.3rem; font-size: 0.8rem; font-weight: 700; letter-spacing: 1.5px;
  text-transform: uppercase; text-decoration: none; color: #8a8a99; min-height: 44px;
  display: inline-flex; align-items: center; }
.pf-switch a.on { background: #ffd166; color: #0a0a0c; }
.pf-section { margin-top: 2.4rem; }
.pf-h { font-size: 1.05rem; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;
  color: #ffd166; margin: 0 0 1rem; }
.pf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.8rem; }
.pf-card { background: rgba(16,16,24,0.9); border: 1px solid rgba(255,209,102,0.22);
  border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
.pf-media { aspect-ratio: 1; background: #0a0a12; position: relative; }
.pf-media img, .pf-media video { width: 100%; height: 100%; object-fit: cover; display: block; }
.pf-card-body { padding: 0.7rem 0.8rem 0.8rem; display: flex; flex-direction: column; gap: 0.35rem; }
.pf-card-title { font-size: 0.9rem; font-weight: 700; margin: 0; }
.pf-price { color: #ffd166; font-weight: 800; font-size: 0.9rem; margin: 0; }
.pf-empty { color: #666; font-size: 0.9rem; padding: 1.2rem 0; }
.pf-post { background: rgba(16,16,24,0.9); border: 1px solid rgba(0,242,255,0.18);
  border-radius: 10px; padding: 1rem 1.1rem; margin-bottom: 0.8rem; }
.pf-post p { margin: 0 0 0.6rem; line-height: 1.6; white-space: pre-wrap; font-size: 0.93rem; }
.pf-post img, .pf-post video { max-width: 100%; border-radius: 8px; display: block; }
.pf-post time { font-size: 0.72rem; color: #777; }
.pf-buy { margin-top: 0.4rem; background: #ffd166; color: #0a0a0c; border: none; border-radius: 8px;
  font-weight: 800; font-size: 0.85rem; letter-spacing: 1px; padding: 0.7rem; cursor: pointer; min-height: 44px; }
.pf-buy:disabled { opacity: 0.55; cursor: wait; }
.pf-actions { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 1.2rem; }
.pf-btn { background: transparent; border: 1px solid #00f2ff; color: #00f2ff; border-radius: 8px;
  font-weight: 700; font-size: 0.82rem; letter-spacing: 1px; padding: 0.7rem 1.1rem; cursor: pointer;
  min-height: 44px; text-decoration: none; display: inline-flex; align-items: center; }
.pf-btn.gold { border-color: #ffd166; color: #ffd166; }
.pf-btn:disabled { opacity: 0.55; cursor: wait; }
.pf-note { font-size: 0.82rem; color: #8a8a99; margin-top: 0.7rem; }
.pf-blockbtn { border-color: rgba(255,90,90,.55) !important; color: #ff9a9a; }
.pf-blockbtn.armed { background: rgba(255,70,70,.22) !important; color: #ffd7d7; }
.pf-fab { position: fixed; right: calc(1rem + env(safe-area-inset-right)); bottom: calc(5.5rem + env(safe-area-inset-bottom)); z-index: 60;
  width: 56px; height: 56px; border-radius: 9999px; font-size: 1.4rem; line-height: 1;
  background: rgba(20,16,28,.92); border: 1px solid rgba(255,120,120,.5); color: #fff;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  box-shadow: 0 6px 24px rgba(0,0,0,.5); }
.pf-fab-count { position: absolute; top: -6px; right: -6px; min-width: 22px; height: 22px; padding: 0 6px;
  border-radius: 9999px; background: #f43f5e; color: #fff; font-size: .7rem; font-weight: 800;
  display: flex; align-items: center; justify-content: center; }
.pf-blocked-sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 70; max-height: 70vh; overflow-y: auto;
  background: rgba(12,10,18,.97); border-top: 1px solid rgba(255,255,255,.14);
  padding: calc(1rem + env(safe-area-inset-top)) 1rem calc(1.25rem + env(safe-area-inset-bottom));
  border-radius: 1.25rem 1.25rem 0 0; box-shadow: 0 -12px 40px rgba(0,0,0,.6); }
.pf-blocked-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: .5rem; }
.pf-blocked-head .pf-h { margin: 0; }
.pf-blocked-row { display: flex; align-items: center; justify-content: space-between; gap: .75rem;
  padding: .6rem 0; border-top: 1px solid rgba(255,255,255,.08); }
.pf-blocked-name { font-weight: 600; }
.pf-username-sm { color: rgba(255,255,255,.55); font-weight: 400; font-size: .85em; }
.pf-toast { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(5rem + env(safe-area-inset-bottom));
  background: rgba(255,209,102,0.95); color: #0a0a0c; font-weight: 700; font-size: 0.85rem;
  padding: 0.7rem 1.2rem; border-radius: 10px; z-index: 60; max-width: 90vw; text-align: center; }
.pf-foot { margin-top: 3rem; text-align: center; }
.pf-foot a { color: #555; font-size: 0.8rem; }
.pf-friends summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 0.6rem; min-height: 44px; }
.pf-friends summary::-webkit-details-marker { display: none; }
.pf-friends summary::before { content: '▸'; color: #ffd166; font-size: 0.9rem; transition: transform 0.15s; }
.pf-friends[open] summary::before { transform: rotate(90deg); }
.pf-friends-count { font-size: 0.75rem; color: #8a8a99; letter-spacing: 1px; }
.pf-friends-list { list-style: none; margin: 0; padding: 0; }
.pf-friend-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  padding: 0.55rem 0; border-top: 1px solid rgba(255,255,255,0.08); }
.pf-friend-link { display: flex; align-items: center; gap: 0.7rem; text-decoration: none; color: inherit;
  min-height: 44px; flex: 1; min-width: 0; }
.pf-friend-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex: none; display: block; }
.pf-friend-fallback { display: inline-flex; align-items: center; justify-content: center;
  background: #101018; color: #ffd166; font-weight: 800; border: 1px solid rgba(255,209,102,0.35); }
.pf-friend-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pf-unfriend { border-color: rgba(255,255,255,0.25) !important; color: #b9b9c7; flex: none; }
.pf-unfriend.armed { border-color: rgba(255,90,90,0.6) !important; color: #ff9a9a; background: rgba(255,70,70,0.12); }
`;

export default async function UserProfilePage({ params, searchParams }) {
  const username = decodeURIComponent(params.username || '');
  const type = searchParams?.v === 'business' ? 'business' : 'personal';
  const data = await loadProfile(username, type);

  if (data.offline) {
    return (
      <main className="pf-root">
        <style>{CSS}</style>
        <div className="pf-wrap" style={{ marginTop: 0, paddingTop: '4rem', textAlign: 'center' }}>
          <h1 className="pf-name">Profiles are offline</h1>
          <p className="pf-bio">The cloud connection is down — this page needs the database. Please check back soon.</p>
        </div>
      </main>
    );
  }
  if (data.missing) {
    // A missing BUSINESS profile is an honest empty state, not a 404 — the
    // user exists (personal profile live) but never created the business one.
    // Only a truly unknown username 404s.
    if (type === 'business') {
      const personal = await loadProfile(username, 'personal');
      if (!personal.missing && !personal.offline && personal.profile) {
        const ownerName = personal.profile.display_name || username;
        return (
          <main className="pf-root">
            <style>{CSS}</style>
            <div className="pf-wrap" style={{ paddingTop: '5rem', textAlign: 'center' }}>
              <div className="pf-type">Business profile</div>
              <h1 className="pf-name">{ownerName}</h1>
              <p className="pf-bio" style={{ marginLeft: 'auto', marginRight: 'auto' }}>
                No business profile yet — create one to list your work, shop, or services.
              </p>
              <nav className="pf-switch" aria-label="Profile type" style={{ marginTop: '1.5rem' }}>
                <Link href={`/u/${encodeURIComponent(username)}`}>
                  Personal
                </Link>
                <Link href={`/u/${encodeURIComponent(username)}?v=business`} className="on" aria-current="page">
                  Business
                </Link>
              </nav>
              <div style={{ marginTop: '1.5rem' }}>
                <Link className="pf-btn gold" href={`/u/${encodeURIComponent(username)}/edit`}>
                  Create business profile
                </Link>
              </div>
              <p className="pf-note" style={{ marginTop: '1rem' }}>
                Only the profile owner can create it — visitors just see this note.
              </p>
            </div>
          </main>
        );
      }
    }
    notFound();
  }

  const { profile: p, art, posts } = data;

  return (
    <main className="pf-root">
      <style>{CSS}</style>

      {p.background_video ? (
        <>
          <div className="pf-bgvideo" aria-hidden="true">
            <video src={p.background_video} autoPlay muted loop playsInline preload="metadata" />
          </div>
          <div className="pf-bgvideo-scrim" aria-hidden="true" />
        </>
      ) : null}

      <div className="pf-cover">
        {p.cover_url ? (
          p.cover_kind === 'video' ? (
            <video src={p.cover_url} autoPlay muted loop playsInline preload="metadata" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.cover_url} alt="" />
          )
        ) : null}
        <div className="pf-cover-fade" />
      </div>

      <div className="pf-wrap">
        <div className="pf-head">
          <div className="pf-avatar">
            {p.profile_video_url ? (
              <video src={p.profile_video_url} autoPlay muted loop playsInline preload="metadata" />
            ) : p.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatar_url} alt={p.display_name || p.username} />
            ) : (
              <div className="pf-avatar-fallback">{(p.display_name || p.username || '?').slice(0, 1).toUpperCase()}</div>
            )}
          </div>
          <div>
            <div className="pf-type">{type === 'business' ? 'Business profile' : 'Personal profile'}</div>
            <h1 className="pf-name">{p.display_name || p.username}</h1>
          </div>
        </div>

        {p.bio ? <p className="pf-bio">{p.bio}</p> : null}

        {Array.isArray(p.website_urls) && p.website_urls.length > 0 ? (
          <div className="pf-links">
            {p.website_urls.map((u) => (
              <a key={u} className="pf-link" href={u} target="_blank" rel="noopener noreferrer">
                {u.replace(/^https?:\/\//, '').slice(0, 40)}
              </a>
            ))}
          </div>
        ) : null}

        {/* The middle-man menu: pick which profile to view. */}
        <nav className="pf-switch" aria-label="Profile type">
          <Link href={`/u/${encodeURIComponent(p.username)}`} className={type === 'personal' ? 'on' : ''} aria-current={type === 'personal' ? 'page' : undefined}>
            Personal
          </Link>
          <Link href={`/u/${encodeURIComponent(p.username)}?v=business`} className={type === 'business' ? 'on' : ''} aria-current={type === 'business' ? 'page' : undefined}>
            Business
          </Link>
        </nav>

        <ProfileClient username={p.username} type={type} art={art} posts={posts} userId={p.user_id} />

        <div className="pf-foot">
          <Link href="/agora">Back to the Agora</Link>
        </div>
      </div>
    </main>
  );
}
