'use client';

// ConcourseSettings — Layer 3 of the Concourse system: the sheet
// the Settings tile opens (PhoneFrame family: backdrop tap closes,
// glass card, ✕ to close). The sheet is a LIST of sections so new
// settings slot in without restructuring; v1 ships Background only.

import { useRef, useState } from 'react';
import {
  CONCOURSE_BG_ART,
  BG_IMAGE_MAX_BYTES,
  BG_VIDEO_MAX_BYTES,
  BG_IMAGE_MIME,
  BG_VIDEO_MIME,
} from '@/lib/concourse-bg';

async function getToken() {
  try {
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

// Upload one background file through the signed-URL route: the file
// goes straight from the phone to storage (the public profile-media
// bucket the profile system already uses); only the small JSON
// handshake passes through the app. Mirrors the profile editor.
async function uploadBackground(file) {
  const token = await getToken();
  if (!token) throw new Error('Sign in to use your own photo or video.');
  const r1 = await fetch('/api/concourse/background-upload-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
  });
  const d1 = await r1.json().catch(() => ({}));
  if (!r1.ok) throw new Error(d1.error || 'Could not prepare the upload.');
  const r2 = await fetch(d1.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!r2.ok) throw new Error('Upload failed. Try a smaller file.');
  return d1.publicUrl;
}

function BackgroundSection({ bg, onApply }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const photoRef = useRef(null);
  const videoRef = useRef(null);

  const pick = async (media, file) => {
    if (!file) return;
    setError('');
    const mimes = media === 'image' ? BG_IMAGE_MIME : BG_VIDEO_MIME;
    const max = media === 'image' ? BG_IMAGE_MAX_BYTES : BG_VIDEO_MAX_BYTES;
    if (!mimes.includes(file.type)) {
      setError(media === 'image'
        ? 'That photo type is not supported — JPG, PNG, WebP or GIF.'
        : 'That video type is not supported — MP4 or WebM.');
      return;
    }
    if (file.size > max) {
      setError(`That file is too large (max ${Math.round(max / 1024 / 1024)} MB).`);
      return;
    }
    setBusy(media);
    try {
      const url = await uploadBackground(file);
      onApply({ kind: media, url });
    } catch (e) {
      setError(e?.message || 'Upload failed.');
    } finally {
      setBusy('');
    }
  };

  const choice = ({ active, onClick, thumb, title, sub }) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`ui-element pointer-events-auto flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all active:scale-[0.98] ${
        active
          ? 'border-cyan-300/70 bg-cyan-400/10'
          : 'border-white/12 bg-white/[0.04] hover:border-cyan-300/40'
      }`}
    >
      {thumb}
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-bold text-zinc-100">{title}</span>
        <span className="block text-[10px] text-zinc-400">{sub}</span>
      </span>
      {active && <span aria-hidden="true" className="text-sm text-cyan-300">✓</span>}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      {choice({
        active: bg.kind === 'default',
        onClick: () => onApply({ kind: 'default' }),
        thumb: <img src={CONCOURSE_BG_ART} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />,
        title: 'Default',
        sub: 'The Olympus artwork',
      })}
      {choice({
        active: bg.kind === 'image',
        onClick: () => photoRef.current?.click(),
        thumb: bg.kind === 'image' && bg.url
          ? <img src={bg.url} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
          : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/20 text-[16px]">🖼️</span>,
        title: busy === 'image' ? 'Uploading…' : 'My photo',
        sub: 'Your image as the backdrop (max 8 MB)',
      })}
      {choice({
        active: bg.kind === 'video',
        onClick: () => videoRef.current?.click(),
        thumb: bg.kind === 'video' && bg.url
          ? <video src={bg.url} muted playsInline preload="metadata" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
          : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/20 text-[16px]">🎞️</span>,
        title: busy === 'video' ? 'Uploading…' : 'My video',
        sub: 'Plays muted + looping (MP4/WebM, max 15 MB)',
      })}
      <input
        ref={photoRef}
        type="file"
        accept={BG_IMAGE_MIME.join(',')}
        className="hidden"
        onChange={(e) => { pick('image', e.target.files?.[0]); e.target.value = ''; }}
      />
      <input
        ref={videoRef}
        type="file"
        accept={BG_VIDEO_MIME.join(',')}
        className="hidden"
        onChange={(e) => { pick('video', e.target.files?.[0]); e.target.value = ''; }}
      />
      {error && <p className="px-0.5 text-[11px] leading-snug text-rose-300">{error}</p>}
      {bg.kind !== 'default' && (
        <button
          type="button"
          onClick={() => onApply({ kind: 'default' })}
          className="ui-element pointer-events-auto mt-1 self-start text-[11px] font-bold text-cyan-300 underline underline-offset-2"
        >
          Back to default
        </button>
      )}
    </div>
  );
}

// Section seams: each entry renders one settings section. Language,
// Tilt and Sound slot into this list later — nothing else changes.
const SECTIONS = [
  { id: 'background', title: 'Background', render: (ctx) => <BackgroundSection {...ctx} /> },
];

export default function ConcourseSettings({ open, onClose, bg, onApplyBg }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[62] flex items-center justify-center p-4" role="dialog" aria-label="Concourse settings">
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="ui-element pointer-events-auto absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />
      <div className="ui-element pointer-events-auto relative max-h-[82dvh] w-[min(340px,88vw)] overflow-y-auto rounded-[1.6rem] border border-white/20 bg-zinc-950/90 p-4 shadow-[0_30px_80px_rgba(0,0,0,0.7),0_0_40px_rgba(0,242,255,0.10)] backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[11px] font-black tracking-[0.3em] uppercase text-cyan-200">Settings</div>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="ui-element pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-zinc-300 transition-all hover:text-white"
          >
            <span aria-hidden="true" className="text-xs leading-none">✕</span>
          </button>
        </div>
        {SECTIONS.map((s) => (
          <section key={s.id} aria-label={s.title} className="mb-4 last:mb-0">
            <div className="mb-2 text-[10px] font-black tracking-[0.22em] uppercase text-zinc-400">{s.title}</div>
            {s.render({ bg, onApply: onApplyBg })}
          </section>
        ))}
      </div>
    </div>
  );
}
