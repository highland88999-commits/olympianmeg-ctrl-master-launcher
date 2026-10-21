'use client';

// ConcourseSettings — Layer 3 of the Concourse system: the sheet
// the Settings tile opens (PhoneFrame family: backdrop tap closes,
// glass card, ✕ to close). The sheet is a LIST of sections so new
// settings slot in without restructuring; v1 ships Background only.

import { useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import {
  TILT_PREF_KEY,
  classifyTiltEnv,
  classifyTiltPermission,
  saveTiltPref,
} from '@/lib/tilt-control';
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

// A plain on/off switch (tilt, sound).
function Switch({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`ui-element pointer-events-auto relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-cyan-400/80' : 'bg-zinc-700'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

// Language: the full locale list, one tap switches the whole app.
// The layout-level LanguageProvider carries the change everywhere
// (this sheet included); the current language is marked.
function LanguageSection() {
  const { lang, setLang, languages } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const current = languages.find((l) => l.code === lang);
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="ui-element pointer-events-auto flex w-full items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-left transition-all hover:border-cyan-300/40 active:scale-[0.98]"
      >
        <span aria-hidden="true" className="text-[16px]">🌐</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-bold text-zinc-100">{current ? current.native : lang}</span>
          <span className="block text-[10px] text-zinc-400">{current ? current.english : 'Language'}</span>
        </span>
        <span aria-hidden="true" className="text-[10px] text-zinc-400">{expanded ? '▴' : '▾'}</span>
      </button>
      {expanded && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-white/10">
          {languages.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              aria-pressed={l.code === lang}
              className={`ui-element pointer-events-auto flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                l.code === lang ? 'bg-cyan-400/10' : 'hover:bg-white/[0.04]'
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-100">
                {l.native} <span className="text-zinc-500">{l.english}</span>
              </span>
              {l.machine && (
                <span className="rounded-full bg-violet-400/20 px-1.5 py-px text-[8px] font-black tracking-wider text-violet-200">AI</span>
              )}
              {l.code === lang && <span aria-hidden="true" className="text-sm text-cyan-300">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function tiltEnvHere() {
  const DOE = typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined;
  let reducedMotion = false;
  try {
    reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {}
  return classifyTiltEnv({
    reducedMotion,
    hasDeviceOrientationEvent: !!DOE,
    hasRequestPermission: !!DOE && typeof DOE.requestPermission === 'function',
  });
}

// Tilt: the hub's tilt steering, bound to the nexus_tilt_enabled
// pref. The live hook (lib/use-tilt.js) hears changes through
// window events — the panel is layout-level, the hook is hub-level.
// On iOS this section is also where motion permission gets granted:
// Merlin's phone showed "Tilt denied" because no visible surface
// ever offered the request in a gesture.
function TiltSection() {
  const [on, setOn] = useState(() => {
    try {
      return window.localStorage.getItem(TILT_PREF_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [env] = useState(tiltEnvHere);
  const [permMsg, setPermMsg] = useState('');
  const [note, setNote] = useState('');

  const toggle = (next) => {
    setOn(next);
    saveTiltPref(window.localStorage, next);
    try {
      window.dispatchEvent(new CustomEvent('olympus:tilt-pref-changed', { detail: { on: next } }));
    } catch {}
  };

  const askPermission = async () => {
    try {
      const res = await DeviceOrientationEvent.requestPermission();
      const p = classifyTiltPermission(res);
      setPermMsg(p.ok ? 'Motion access granted — tilt is live.' : p.message);
      if (p.ok && !on) toggle(true);
    } catch {
      setPermMsg('Tilt denied — enable motion access in Settings.');
    }
  };

  const recalibrate = () => {
    try {
      window.dispatchEvent(new CustomEvent('olympus:tilt-recalibrate'));
    } catch {}
    setNote('Recalibrating — hold the phone the way you naturally hold it; that hold is level now.');
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-bold text-zinc-100">Tilt steering</span>
          <span className="block text-[10px] text-zinc-400">Tilt the phone to climb and descend on the hub.</span>
        </span>
        <Switch on={on} onChange={toggle} label="Tilt steering" />
      </div>
      {!env.ok && env.reason === 'unavailable' && (
        <p className="px-0.5 text-[11px] leading-snug text-zinc-400">Tilt is not available on this device.</p>
      )}
      {!env.ok && env.reason === 'reduced-motion' && (
        <p className="px-0.5 text-[11px] leading-snug text-zinc-400">Tilt stays off — your device asks for reduced motion.</p>
      )}
      {env.ok && env.reason === 'permission-needed' && (
        <>
          <button
            type="button"
            onClick={askPermission}
            className="ui-element pointer-events-auto self-start rounded-full border border-cyan-300/50 px-3 py-1.5 text-[11px] font-bold text-cyan-200 transition-all hover:bg-cyan-400/10 active:scale-95"
          >
            Enable motion access
          </button>
          <p className="px-0.5 text-[10px] leading-snug text-zinc-500">
            iPhones need this permission for tilt. If it was denied before, allow Motion &amp; Orientation in your browser settings, then tap again.
          </p>
        </>
      )}
      {env.ok && env.reason === 'direct' && (
        <p className="px-0.5 text-[11px] leading-snug text-zinc-400">No permission needed on this device — tilt works automatically.</p>
      )}
      {permMsg && <p className="px-0.5 text-[11px] leading-snug text-cyan-200">{permMsg}</p>}
      <button
        type="button"
        onClick={recalibrate}
        className="ui-element pointer-events-auto self-start rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-bold text-zinc-200 transition-all hover:border-cyan-300/40 active:scale-95"
      >
        Recalibrate
      </button>
      {note && <p className="px-0.5 text-[11px] leading-snug text-zinc-400">{note}</p>}
    </div>
  );
}

// Sound: the master switch. It gates the Radio and the hub fx
// sounds (games keep their own sound settings for now — no
// overclaiming, it says so right here).
function SoundSection({ settings, onApply }) {
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-bold text-zinc-100">Sound</span>
        <span className="block text-[10px] text-zinc-400">Radio + hub sounds. Games keep their own sound settings for now.</span>
      </span>
      <Switch on={settings.sound} onChange={(next) => onApply({ ...settings, sound: next })} label="Sound" />
    </div>
  );
}

// Section seams: each entry renders one settings section.
const SECTIONS = [
  { id: 'background', title: 'Background', render: ({ bg, onApplyBg }) => <BackgroundSection bg={bg} onApply={onApplyBg} /> },
  { id: 'language', title: 'Language', render: () => <LanguageSection /> },
  { id: 'tilt', title: 'Tilt', render: () => <TiltSection /> },
  { id: 'sound', title: 'Sound', render: ({ settings, onApplySettings }) => <SoundSection settings={settings} onApply={onApplySettings} /> },
];

export default function ConcourseSettings({ open, onClose, bg, onApplyBg, settings, onApplySettings }) {
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
            {s.render({ bg, onApplyBg, settings, onApplySettings })}
          </section>
        ))}
      </div>
    </div>
  );
}
