// app/u/[username]/page.jsx — public user profile (Personal | Business).
// Server component: fetches the profile, art gallery, and posts with the
// shared supabase client (public-read RLS). Interactive bits (buy, share,
// owner bar, gallery hover-play) live in components/profiles/ProfileClient.jsx.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ProfileClient } from '@/components/profiles/ProfileClient';
import ProfileAffiliatePanel from '@/components/affiliates/ProfileAffiliatePanel';
import CharacterToken from '@/components/characters/CharacterToken';
import { getCharacterById } from '@/lib/characters/roster';

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
    let profile = null;
    if (type === 'business') {
      // Business profiles live under '{username}-biz' and share the user_id.
      // Try direct match first, then fall back via the personal profile's user.
      const { data: direct } = await db
        .from('user_profiles')
        .select('*')
        .eq('username', username)
        .eq('type', 'business')
        .maybeSingle();
      if (direct) {
        profile = direct;
      } else {
        const { data: personal } = await db
          .from('user_profiles')
          .select('user_id')
          .eq('username', username)
          .eq('type', 'personal')
          .maybeSingle();
        if (personal?.user_id) {
          const { data: byUser } = await db
            .from('user_profiles')
            .select('*')
            .eq('user_id', personal.user_id)
            .eq('type', 'business')
            .maybeSingle();
          profile = byUser || null;
        }
        // last resort: the '{username}-biz' convention
        if (!profile) {
          const { data: bySuffix } = await db
            .from('user_profiles')
            .select('*')
            .eq('username', `${username}-biz`)
            .eq('type', 'business')
            .maybeSingle();
          profile = bySuffix || null;
        }
      }
    } else {
      const { data, error } = await db
        .from('user_profiles')
        .select('*')
        .eq('username', username)
        .eq('type', type)
        .maybeSingle();
      if (error) return { missing: true };
      profile = data;
    }
    if (!profile) return { missing: true };
    // WAVE 2: the owner's profile character (platform roster),
    // the display Agora profiles already have. The pick lives on
    // the PERSONAL row (profile_character_id): read it straight
    // off this row for the personal view; for the business view,
    // one guarded lookup by user_id. A missing column (pre-
    // migration) or any error simply means "no character shown".
    let characterId = null;
    try {
      if (type !== 'business' && typeof profile.profile_character_id === 'string') {
        characterId = profile.profile_character_id;
      } else if (profile.user_id) {
        const { data: personal } = await db
          .from('user_profiles')
          .select('profile_character_id')
          .eq('user_id', profile.user_id)
          .eq('type', 'personal')
          .maybeSingle();
        characterId = personal?.profile_character_id || null;
      }
    } catch {
      characterId = null;
    }
    const [{ data: art }, { data: posts }] = await Promise.all([
      db.from('art_pieces').select('*').eq('profile_id', profile.id).order('created_at', { ascending: false }),
      db.from('profile_posts').select('*').eq('profile_id', profile.id).order('created_at', { ascending: false }).limit(50),
    ]);
    return { profile, art: art || [], posts: posts || [], characterId };
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
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.pf-cover { position: relative; width: 100%; height: 30vh; min-height: 200px; max-height: 340px;
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
.pf-toast { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(5rem + env(safe-area-inset-bottom));
  background: rgba(255,209,102,0.95); color: #0a0a0c; font-weight: 700; font-size: 0.85rem;
  padding: 0.7rem 1.2rem; border-radius: 10px; z-index: 60; max-width: 90vw; text-align: center; }
.pf-foot { margin-top: 3rem; text-align: center; }
.pf-foot a { color: #555; font-size: 0.8rem; }
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
  if (data.missing) notFound();

  const { profile: p, art, posts } = data;
  // Roster-validated here; an unknown stored id renders nothing.
  const character = getCharacterById(data.characterId);

  return (
    <main className="pf-root">
      <style>{CSS}</style>

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

        {/* WAVE 2: the owner's profile character — the same
            display the Agora profile carries (CharacterToken
            plate: preview + name), closing the /u gap. */}
        {character && (
          <section className="pf-section" style={{ marginTop: '1.6rem' }} aria-label="Profile character">
            <h2 className="pf-h">Profile character</h2>
            <CharacterToken characterId={character.id} variant="plate" size={56} />
          </section>
        )}

        {/* Affiliate panel: owner-only. Renders nothing for anyone else —
            not even the prompt. Appears on both personal and business views. */}
        <ProfileAffiliatePanel username={p.username} />

        {/* The middle-man menu: pick which profile to view. */}
        <nav className="pf-switch" aria-label="Profile type">
          <Link href={`/u/${encodeURIComponent(p.username)}`} className={type === 'personal' ? 'on' : ''} aria-current={type === 'personal' ? 'page' : undefined}>
            Personal
          </Link>
          <Link href={`/u/${encodeURIComponent(p.username)}?v=business`} className={type === 'business' ? 'on' : ''} aria-current={type === 'business' ? 'page' : undefined}>
            Business
          </Link>
        </nav>

        <ProfileClient username={p.username} type={type} art={art} posts={posts} />

        <div className="pf-foot">
          <Link href="/agora">Back to the Agora</Link>
        </div>
      </div>
    </main>
  );
}
