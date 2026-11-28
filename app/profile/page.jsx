// app/profile/page.jsx — PROFILE: the universal rider identity.
//
// One profile for the whole launcher: character creation/customization
// (rider name, callsign, suit / helmet / tron bike glow colors, avatar
// frame) plus the user's own photos and videos.
//
// Honesty rules:
// - Photos/videos are stored FOR REAL on this device in IndexedDB.
//   Nothing is uploaded anywhere. The page says so in plain words.
// - No telemetry, no phone-home. Everything local — except "My Creations",
//   which fetches your forged items from your signed-in account (the page
//   says that too).
// - Reduced motion: glow pulse is disabled under prefers-reduced-motion.
// - Plain-English labels. Touch targets >= 44px. Page scrolls with
//   Safari bottom-bar clearance.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  AVATAR_STYLES,
  deleteMediaItem,
  getMediaItem,
  listMediaItems,
  loadProfile,
  saveMediaItem,
  saveProfile,
} from '@/lib/profile';
import {
  registerAllProfileMedia,
  registerProfileMedia,
  unregisterProfileMedia,
} from '@/lib/user-content/bridges';
import DefaultAvatarPicker from '@/components/profile/DefaultAvatarPicker';
import ForgedAvatarPicker from '@/components/profile/ForgedAvatarPicker';
import MiniViewport from '@/components/world-engine/MiniViewport';
import MyCreations from '@/components/profile/MyCreations';
import BackpackSection from '@/components/profile/BackpackSection';
import MyCharacters from '@/components/profile/MyCharacters';
import MyStorefront from '@/components/profile/MyStorefront';
import Achievements from '@/components/profile/Achievements';
import ConnectMuseButton from '@/components/muse-connector/ConnectMuseButton';

const SUIT_COLORS = [
  '#00f2ff', '#ff2fd6', '#ffd166', '#06d6a0', '#8b5cf6',
  '#f8f9fa', '#ff4d4d', '#3a86ff', '#5c677d', '#0b0b10',
];
const HELMET_COLORS = [
  '#23233a', '#0b0b10', '#3a3a4d', '#8b93a7', '#c0c6d4',
  '#5b3a8c', '#0e4d5c', '#7a1f2b', '#2f5d34', '#b8860b',
];
const GLOW_COLORS = [
  '#00f2ff', '#ff2fd6', '#ffd166', '#06d6a0', '#8b5cf6',
  '#ff4d4d', '#3a86ff', '#7dff5e', '#ff8c42', '#f8f9fa',
];

const FRAME_LABELS = { ring: 'Ring', hex: 'Hex', none: 'None' };

// Stylized rider portrait: helmet + visor + shoulders, tinted live.
function RiderPortrait({ suit, helmet, glow, label }) {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={label || 'Rider preview'}
      className="w-full h-full block">
      {/* shoulders */}
      <path d="M38 200 C38 158 66 140 100 140 C134 140 162 158 162 200 Z" fill={suit} />
      <path d="M58 176 Q100 162 142 176" fill="none" stroke={glow} strokeWidth="3"
        strokeLinecap="round" opacity="0.9" className="rider-glow" />
      <path d="M70 190 Q100 180 130 190" fill="none" stroke={glow} strokeWidth="2"
        strokeLinecap="round" opacity="0.55" className="rider-glow" />
      {/* helmet */}
      <ellipse cx="100" cy="86" rx="46" ry="50" fill={helmet} />
      <ellipse cx="84" cy="62" rx="16" ry="10" fill="#ffffff" opacity="0.10" />
      <rect x="97" y="38" width="6" height="16" rx="3" fill={glow} className="rider-glow" />
      {/* visor */}
      <path d="M60 78 Q100 66 140 78 L133 104 Q100 94 67 104 Z" fill="#070b14" />
      <path d="M76 74 L96 102" stroke={glow} strokeWidth="5" strokeLinecap="round"
        opacity="0.6" className="rider-glow" />
      <path d="M104 70 L118 96" stroke={glow} strokeWidth="3" strokeLinecap="round"
        opacity="0.35" className="rider-glow" />
      {/* helmet side lights */}
      <circle cx="58" cy="92" r="4" fill={glow} className="rider-glow" />
      <circle cx="142" cy="92" r="4" fill={glow} className="rider-glow" />
    </svg>
  );
}

function AvatarFrame({ frame, glow, size, children, label }) {
  const s = { width: size, height: size };
  if (frame === 'hex') {
    const hex = 'polygon(25% 5%, 75% 5%, 95% 27%, 95% 73%, 75% 95%, 25% 95%, 5% 73%, 5% 27%)';
    return (
      <div aria-label={label} style={{ ...s, clipPath: hex, background: glow, padding: 4 }}>
        <div style={{ width: '100%', height: '100%', clipPath: hex, background: '#0a0a12', overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    );
  }
  if (frame === 'none') {
    return (
      <div aria-label={label} style={{ ...s, borderRadius: 14, overflow: 'hidden', background: '#0a0a12' }}>
        {children}
      </div>
    );
  }
  return (
    <div aria-label={label} style={{ ...s, borderRadius: '50%', border: `3px solid ${glow}`, padding: 3, background: '#0a0a12' }}>
      <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function Swatches({ label, colors, value, onPick, labelledBy }) {
  return (
    <div>
      <div id={labelledBy} className="text-[11px] tracking-[0.25em] uppercase text-neutral-400 mb-2">
        {label}
      </div>
      <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
        {colors.map((c) => {
          const active = c.toLowerCase() === String(value).toLowerCase();
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${label} ${c}`}
              onClick={() => onPick(c)}
              className="min-h-[44px] min-w-[44px] rounded-full border-2 transition-transform"
              style={{
                background: c,
                borderColor: active ? '#ffffff' : 'rgba(255,255,255,0.18)',
                transform: active ? 'scale(1.12)' : 'scale(1)',
                boxShadow: active ? `0 0 14px ${c}` : 'none',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

const inputCls =
  'w-full min-h-[44px] rounded-lg bg-white/5 border border-white/15 px-4 py-2.5 ' +
  'text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-cyan-300/70';

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const [media, setMedia] = useState([]);
  const [urls, setUrls] = useState({});
  const [photoUrl, setPhotoUrl] = useState(null);
  // The forged character picked as the avatar (the creation row behind
  // profile.forgedAvatarId, reported by ForgedAvatarPicker once its
  // list loads) and whether that report has landed yet.
  const [forgedAvatar, setForgedAvatar] = useState(null);
  const [forgedState, setForgedState] = useState('loading'); // loading | signed-out | loaded | error
  const onForgedSelected = useCallback((creation, meta) => {
    setForgedAvatar(creation || null);
    setForgedState(meta && meta.state ? meta.state : 'loaded');
  }, []);
  const [viewerId, setViewerId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const saveTimer = useRef(null);
  const dirtyRef = useRef(false);

  // Load profile + media on mount. Existing gallery uploads are registered
  // into the shared user-content pool exactly once (dedupe by id).
  useEffect(() => {
    setProfile(loadProfile());
    listMediaItems()
      .then((list) => {
        setMedia(list);
        registerAllProfileMedia(list, getMediaItem).catch(() => {});
      })
      .catch(() => setMedia([]));
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Revoke object URLs on unmount.
  useEffect(() => {
    const snapshot = urls;
    return () => {
      Object.values(snapshot).forEach((u) => {
        try { URL.revokeObjectURL(u); } catch { /* noop */ }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave.
  useEffect(() => {
    if (!profile || !dirtyRef.current) return;
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setProfile((p) => saveProfile(p));
      dirtyRef.current = false;
      setSaveState('saved');
    }, 700);
  }, [profile]);

  const patch = useCallback((fields) => {
    dirtyRef.current = true;
    setProfile((p) => ({ ...p, ...fields }));
  }, []);

  // Load thumbnail URLs for media items as they appear.
  useEffect(() => {
    let cancelled = false;
    media.forEach((m) => {
      if (urls[m.id]) return;
      getMediaItem(m.id)
        .then((item) => {
          if (!item || cancelled) return;
          setUrls((u) => ({ ...u, [m.id]: item.url }));
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media]);

  // Resolve the chosen profile photo.
  useEffect(() => {
    let cancelled = false;
    const id = profile && profile.profilePhotoId;
    if (!id) { setPhotoUrl(null); return; }
    getMediaItem(id)
      .then((item) => {
        if (cancelled) return;
        if (item && item.kind === 'photo') setPhotoUrl(item.url);
        else {
          setPhotoUrl(null);
          patch({ profilePhotoId: null }); // stale reference: clear it
        }
      })
      .catch(() => { if (!cancelled) setPhotoUrl(null); });
    return () => { cancelled = true; };
  }, [profile && profile.profilePhotoId, patch]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshMedia = useCallback(() => {
    listMediaItems().then(setMedia).catch(() => {});
  }, []);

  const onFiles = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const f of files) {
        // eslint-disable-next-line no-await-in-loop
        const mediaId = await saveMediaItem(f);
        // Register the new upload in the shared user-content pool (best-effort).
        try {
          // eslint-disable-next-line no-await-in-loop
          const full = await getMediaItem(mediaId);
          if (full && full.blob) {
            // eslint-disable-next-line no-await-in-loop
            await registerProfileMedia(
              { id: mediaId, kind: full.kind, name: full.name, createdAt: full.createdAt },
              full.blob
            );
          }
        } catch { /* pool registration must never break uploads */ }
      }
      refreshMedia();
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }, [refreshMedia]);

  const removeMedia = useCallback(async (id) => {
    await deleteMediaItem(id).catch(() => {});
    unregisterProfileMedia(id).catch(() => {}); // drop from the shared pool too
    setUrls((u) => {
      const next = { ...u };
      if (next[id]) {
        try { URL.revokeObjectURL(next[id]); } catch { /* noop */ }
        delete next[id];
      }
      return next;
    });
    setMedia((list) => list.filter((m) => m.id !== id));
    setViewerId(null);
    setConfirmDelete(false);
    setProfile((p) => {
      if (p && p.profilePhotoId === id) {
        dirtyRef.current = true;
        return { ...p, profilePhotoId: null };
      }
      return p;
    });
  }, []);

  const randomize = useCallback(() => {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    patch({ suitColor: pick(SUIT_COLORS), helmetColor: pick(HELMET_COLORS), bikeGlow: pick(GLOW_COLORS) });
  }, [patch]);

  if (!profile) {
    return (
      <div className="min-h-dvh bg-[#050508] text-neutral-200 flex items-center justify-center">
        <p className="tracking-[0.3em] uppercase text-xs text-neutral-500">Loading profile…</p>
      </div>
    );
  }

  const viewer = viewerId ? media.find((m) => m.id === viewerId) : null;

  // One live preview, first picture that exists wins: your uploaded photo,
  // then your forged character (a live 3D render from its forge params),
  // then a picked default avatar (or your profile character), then the
  // drawn rider in your colours. Picking any one clears the others, so
  // at most one picture source is ever set.
  const previewImage = photoUrl || profile.defaultAvatar || null;

  // A forged character has no image — its preview is the live
  // MiniViewport render of the creation's generation_params.
  const showForgedPreview = !photoUrl && !profile.defaultAvatar && !!forgedAvatar;

  return (
    <div className="min-h-dvh bg-[#050508] text-neutral-200">
      <style>{`
        .rider-glow { animation: riderPulse 3.2s ease-in-out infinite; }
        @keyframes riderPulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .rider-glow { animation: none; } }
      `}</style>

      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#050508]/90 backdrop-blur border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Client-side nav keeps the root layout — and the radio — alive. */}
          <Link href="/"
            className="min-h-[44px] inline-flex items-center px-3 rounded-lg border border-white/15 text-sm text-neutral-300 hover:bg-white/10">
            ← All satellites
          </Link>
          <div className="text-right">
            <div className="text-[10px] tracking-[0.3em] uppercase text-cyan-300/80">Universal</div>
            <h1 className="text-lg font-bold tracking-widest">PROFILE</h1>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 pt-6 pb-10 flex flex-col gap-6">
        {/* Your rider — the whole avatar setup in one panel: the live
            preview stays front and centre, and every control that shapes
            it (name, callsign, frame, colours, picture) lives here, so
            setting up a rider takes no scrolling around the page. */}
        <section aria-label="Your rider" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-bold tracking-[0.3em] uppercase text-neutral-100 mb-1">Your rider</h2>
          <p className="text-xs text-neutral-500 mb-4">Your rider, everywhere in the launcher. Changes save on their own.</p>

          <div className="flex flex-col sm:flex-row gap-5">
            <div className="shrink-0 mx-auto sm:mx-0 text-center">
              <AvatarFrame frame={profile.avatarStyle} glow={profile.bikeGlow} size={180} label="Your rider preview">
                {photoUrl ? (
                  <Image src={photoUrl} alt="Your rider" width={360} height={360} unoptimized className="w-full h-full object-cover" />
                ) : showForgedPreview ? (
                  <div className="relative w-full h-full">
                    <MiniViewport category="character" params={forgedAvatar.generation_params || {}} />
                  </div>
                ) : previewImage ? (
                  <Image src={previewImage} alt="Your rider" width={360} height={360} unoptimized className="w-full h-full object-cover" />
                ) : (
                  <RiderPortrait suit={profile.suitColor} helmet={profile.helmetColor} glow={profile.bikeGlow} label="Rider preview" />
                )}
              </AvatarFrame>
              <div className="text-lg font-bold truncate mt-3 max-w-[180px] mx-auto">{profile.displayName || 'Unnamed rider'}</div>
              <div className="text-sm text-neutral-400 tracking-widest uppercase">
                {profile.callsign ? `“${profile.callsign}”` : 'No callsign yet'}
              </div>
              <div className="text-[11px] text-neutral-500 mt-1 h-4" role="status" aria-live="polite">
                {saveState === 'saving' && 'Saving…'}
                {saveState === 'saved' && <span className="text-emerald-300">Saved</span>}
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-4 min-w-0">
              <div>
                <label htmlFor="displayName" className="text-[11px] tracking-[0.25em] uppercase text-neutral-400 block mb-1.5">
                  Rider name
                </label>
                <input id="displayName" type="text" maxLength={60} value={profile.displayName}
                  onChange={(e) => patch({ displayName: e.target.value })}
                  placeholder="What should the launcher call you?" className={inputCls} />
              </div>
              <div>
                <label htmlFor="callsign" className="text-[11px] tracking-[0.25em] uppercase text-neutral-400 block mb-1.5">
                  Callsign
                </label>
                <input id="callsign" type="text" maxLength={24} value={profile.callsign}
                  onChange={(e) => patch({ callsign: e.target.value })}
                  placeholder="e.g. NIGHTFALL" className={inputCls + ' uppercase'} />
              </div>
              <div>
                <div className="text-[11px] tracking-[0.25em] uppercase text-neutral-400 mb-2">Avatar frame</div>
                <div className="flex gap-2" role="radiogroup" aria-label="Avatar frame">
                  {AVATAR_STYLES.map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={profile.avatarStyle === s}
                      onClick={() => patch({ avatarStyle: s })}
                      className="min-h-[44px] px-4 rounded-lg border text-sm tracking-widest uppercase transition-colors"
                      style={{
                        borderColor: profile.avatarStyle === s ? profile.bikeGlow : 'rgba(255,255,255,0.15)',
                        color: profile.avatarStyle === s ? '#fff' : '#a3a3a3',
                        background: profile.avatarStyle === s ? 'rgba(255,255,255,0.08)' : 'transparent',
                      }}>
                      {FRAME_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" onClick={randomize}
                className="min-h-[44px] self-start px-4 rounded-lg border border-white/15 text-sm text-neutral-300 hover:bg-white/10">
                Surprise me — random colors
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-4">
            <Swatches labelledBy="suitLabel" label="Suit color" colors={SUIT_COLORS}
              value={profile.suitColor} onPick={(c) => patch({ suitColor: c })} />
            <Swatches labelledBy="helmetLabel" label="Helmet color" colors={HELMET_COLORS}
              value={profile.helmetColor} onPick={(c) => patch({ helmetColor: c })} />
            <Swatches labelledBy="glowLabel" label="Tron bike glow" colors={GLOW_COLORS}
              value={profile.bikeGlow} onPick={(c) => patch({ bikeGlow: c })} />
          </div>

          {/* Picture — pick a default, use your character, or upload your own. */}
          <div className="mt-6 pt-5 border-t border-white/10">
            <div className="text-[11px] tracking-[0.25em] uppercase text-neutral-400 mb-1">Picture</div>
            <p className="text-xs text-neutral-500 mb-4">
              What shows in the preview above. A photo beats a forged avatar;
              a forged avatar beats a default avatar; a default avatar beats
              the drawn rider.
            </p>
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden"
              onChange={onFiles} aria-label="Choose photos or videos" />
            <button type="button" onClick={() => fileRef.current && fileRef.current.click()}
              disabled={uploading}
              className="min-h-[44px] px-5 rounded-lg bg-cyan-300/90 text-black text-sm font-bold tracking-widest uppercase hover:bg-cyan-200 disabled:opacity-50">
              {uploading ? 'Adding…' : 'Add photos / videos'}
            </button>
            <div className="mt-5">
              <DefaultAvatarPicker
                value={profile.defaultAvatar || null}
                onPick={(src) => patch({ defaultAvatar: profile.defaultAvatar === src ? null : src, profilePhotoId: null, forgedAvatarId: null })}
              />
              <p className="text-[11px] text-neutral-500 mt-2">
                {profile.profilePhotoId
                  ? 'Using your photo as your rider picture.'
                  : profile.forgedAvatarId
                    ? forgedState === 'loaded' && forgedAvatar
                      ? `Using your forged character “${forgedAvatar.display_name || 'Untitled character'}” as your rider picture.`
                      : forgedState === 'signed-out'
                        ? 'Your forged character needs sign-in to show — pick another picture, or sign in.'
                        : forgedState === 'error'
                          ? 'Your forged character could not be loaded — pick another picture, or try again below.'
                          : forgedState === 'loaded'
                            ? 'That forged character is gone from your account — pick another picture.'
                            : 'Loading your forged character…'
                    : profile.defaultAvatar
                      ? 'Using a default avatar. Upload a photo above to use your own instead.'
                      : 'No photo yet — pick a default avatar, forge your own, or upload a photo.'}
              </p>
            </div>
            <div className="mt-5 pt-5 border-t border-white/10">
              <ForgedAvatarPicker
                value={profile.forgedAvatarId || null}
                onPick={(id) => patch({ forgedAvatarId: profile.forgedAvatarId === id ? null : id, profilePhotoId: null, defaultAvatar: null })}
                onSelectedCreation={onForgedSelected}
              />
            </div>
          </div>
        </section>

        {/* Photos & videos — your gallery. Photos are added from Your rider
            above; they land here, and any photo can become your rider
            picture from its viewer. */}
        <section aria-label="Photos and videos" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-bold tracking-[0.3em] uppercase text-neutral-100 mb-1">Photos &amp; videos</h2>
          <p className="text-xs text-neutral-500 mb-4">
            Yours, kept on this device in private browser storage. Nothing is uploaded
            anywhere — personal cloud sync arrives later with your own storage bucket.
            Add photos from Your rider above; they land here.
          </p>

          {media.length === 0 ? (
            <p className="text-sm text-neutral-500 mt-4">Nothing here yet — add your first photo or video from Your rider above.</p>
          ) : (
            <>
              <p className="text-[11px] text-neutral-500 tracking-widest uppercase mt-4 mb-2">
                {media.length} item{media.length === 1 ? '' : 's'} on this device
              </p>
              <div className="grid grid-cols-3 gap-2">
                {media.map((m) => (
                  <button key={m.id} type="button" onClick={() => { setViewerId(m.id); setConfirmDelete(false); }}
                    aria-label={`Open ${m.kind} ${m.name}`}
                    className="relative aspect-square rounded-lg overflow-hidden bg-black/40 border border-white/10 min-h-[44px]">
                    {m.kind === 'video' ? (
                      urls[m.id] ? (
                        <video src={urls[m.id]} muted playsInline preload="metadata"
                          className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-neutral-600 text-xs">video…</span>
                      )
                    ) : urls[m.id] ? (
                      <Image src={urls[m.id]} alt={m.name} fill sizes="(max-width: 768px) 50vw, 33vw" unoptimized className="object-cover" />
                    ) : (
                      <span className="text-neutral-600 text-xs">photo…</span>
                    )}
                    {m.kind === 'video' && (
                      <span className="absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-neutral-200">
                        VIDEO
                      </span>
                    )}
                    {profile.profilePhotoId === m.id && m.kind === 'photo' && (
                      <span className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-cyan-300/90 text-black font-bold">
                        PROFILE
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        {/* The Backpack (Merlin, 2026-10-23) — the pack that follows
            the traveller into every realm: forged weapons, Earth 2
            field finds, the live currency header, and its chosen
            style. Account-persisted via /api/ui-state when signed
            in; device-local when not (the section says which). */}
        <BackpackSection />

        {/* My Creations — server-backed forge items (the one section that
            talks to the network: your creations live on your account). */}
        <MyCreations />

        {/* Connect Muse — the one in-Olympus step of the connector
            setup (Merlin, Nov 27, 2026): register the account here
            with the live session, then copy the setup prompt below
            and paste it to Muse. No key anywhere — Supabase is the
            gatekeeper (key placement dropped Nov 27 ~04:15); the
            prompt is copyable in-app (Nov 27 ~04:16). */}
        <ConnectMuseButton />

        {/* Characters — the platform roster from the Olympus 3D
            generator. Pick one as your profile character; the pick is
            stored on your account (device-local until the character
            column's platform update lands). Signed-in only. */}
        <MyCharacters />

        {/* My Storefront — the creator's public Omega Store page (their
            Custom Designer products for sale), plus design/marketplace
            links. Renders only when signed in. */}
        <MyStorefront />

        {/* Achievements — Vecna Slayer milestones, Olympian Scholar, … */}
        <Achievements />

        <p className="text-[11px] text-neutral-600 text-center px-6">
          This profile lives in your browser on this device. It travels with you
          once your personal storage bucket is ready. Your creations are saved
          to your signed-in account and show up wherever you sign in.
        </p>
      </main>

      {/* Viewer */}
      {viewer && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          role="dialog" aria-modal="true" aria-label={`${viewer.kind} viewer`}
          onClick={() => { setViewerId(null); setConfirmDelete(false); }}>
          <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-[#0a0a12] p-4"
            onClick={(e) => e.stopPropagation()}>
            <div className="rounded-xl overflow-hidden bg-black max-h-[60vh] flex items-center justify-center">
              {viewer.kind === 'video' ? (
                urls[viewer.id] ? (
                  <video src={urls[viewer.id]} controls playsInline className="w-full max-h-[60vh]" />
                ) : (
                  <p className="text-neutral-500 text-sm p-8">Loading video…</p>
                )
              ) : urls[viewer.id] ? (
                <Image src={urls[viewer.id]} alt={viewer.name} width={1200} height={900} unoptimized className="w-full h-auto max-h-[60vh] object-contain" />
              ) : (
                <p className="text-neutral-500 text-sm p-8">Loading photo…</p>
              )}
            </div>
            <p className="text-xs text-neutral-500 truncate mt-3 mb-3">{viewer.name}</p>
            <div className="flex flex-wrap gap-2">
              {viewer.kind === 'photo' && (
                <button type="button"
                  onClick={() => { patch({ profilePhotoId: viewer.id, defaultAvatar: null, forgedAvatarId: null }); setViewerId(null); }}
                  className="min-h-[44px] px-4 rounded-lg bg-cyan-300/90 text-black text-sm font-bold hover:bg-cyan-200">
                  {profile.profilePhotoId === viewer.id ? 'This is your profile photo ✓' : 'Use as profile photo'}
                </button>
              )}
              <button type="button"
                onClick={() => {
                  if (confirmDelete) removeMedia(viewer.id);
                  else setConfirmDelete(true);
                }}
                className={`min-h-[44px] px-4 rounded-lg border text-sm ${
                  confirmDelete
                    ? 'border-red-400 bg-red-500/20 text-red-200'
                    : 'border-white/15 text-neutral-300 hover:bg-white/10'
                }`}>
                {confirmDelete ? 'Tap again to confirm delete' : 'Delete'}
              </button>
              <button type="button" onClick={() => { setViewerId(null); setConfirmDelete(false); }}
                className="min-h-[44px] px-4 rounded-lg border border-white/15 text-sm text-neutral-300 hover:bg-white/10 ml-auto">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear" />
    </div>
  );
}
