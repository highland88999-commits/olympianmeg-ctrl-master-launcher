'use client';

// components/social-media-cheat-code/CheatCodeRoom.jsx
// THE SOCIAL MEDIA CHEAT CODE ROOM (Merlin, 2026-10-26) — a 3D
// room carousel for the town-and-city hashtag list. Users swipe
// left or right through rooms; each room holds ONE piece of the
// list, sized to the platform picked in the selector (TikTok 5,
// Instagram 5, Facebook 120, YouTube 60 — each cap labeled with
// its source in lib/social-media-cheat-code/platforms.js).
// Every piece has a Copy button and a mark-as-complete checkbox.
//
// The visitor does NOT walk around the room: instead they switch
// 1st-person / 3rd-person view, and pick a character who stands
// as the gatekeeper of the room (the Earth character idiom — the
// platform roster's previews + the Earth extension roster).
//
// Look (Merlin's direction): obsidian background with deep red
// glowing veins, rock surrounding the interface, see-through
// glassy panels with thin borders and minimal text, and ALL words
// in silver over the obsidian.
//
// Controls stay FIXED in the middle of each room's interface at
// the optimal tapping level — plaque on top, Copy + checkbox
// band in the middle, the piece's tags scrolling beneath. They
// never wander or drift.
//
// Checks are PER ACCOUNT and PER PLATFORM, never shared: the
// signed-in account's record lives in /api/ui-state
// (`cheat_code_checks`, keyed platform + piece) with a
// localStorage instant cache; the DB wins on login. Guests keep
// a device-only record. An unchecked piece is honestly unchecked.
//
// The per-visit prompt (Merlin, 2026-10-26) appears on EVERY
// visit and is dismissed by tapping it — mission-panel idiom, a
// tappable element, never a blocking modal. Closing it dismisses
// it for that visit ONLY: no dismissal is saved anywhere (no
// localStorage flag, no account setting), so it returns on the
// next visit, the same per-load pattern as the FINTRAC modal and
// the Earth mission panel.
//
// The 3D is CSS 3D (perspective + rotateY cover-flow), not WebGL:
// it stays smooth in a phone webview, and the rooms peek at the
// sides of the current one as the carousel turns.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackButton } from '@/components/ui';
import { TOTAL_TAGS, ALL_TAGS_TEXT } from '@/lib/social-media-cheat-code/chunks';
import {
  PLATFORMS,
  getPlatform,
  platformPieces,
  pieceRange,
} from '@/lib/social-media-cheat-code/platforms';
import {
  loadLocalChecks,
  saveLocalChecks,
  sanitizeCheatCodeChecks,
} from '@/lib/social-media-cheat-code/tracking';
import { CHARACTERS } from '@/lib/characters/roster';
import { EARTH_CHARACTER_EXTENSIONS } from '@/lib/earth/earth-characters';
import { EARTH_EXTENSION_CHARACTER_KEY } from '@/lib/earth/earth-extension-character';

// Silver over obsidian — every word in the room uses this scale.
const SILVER = '#e8e8ee';
const SILVER_DIM = '#c9c9d0';
const SILVER_MUTED = '#8f8f99';

const GATEKEEPER_LS_KEY = 'olympus.cheatCodeGatekeeper.v1';
const DEFAULT_GATEKEEPER = 'x-me-wizard'; // The Grey Pilgrim

// Copy text with a phone-webview fallback: clipboard.writeText
// first, then a hidden textarea + execCommand when the async
// clipboard is unavailable (older webviews, insecure contexts).
async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

async function getToken() {
  try {
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

// The gatekeeper figure: a platform character's preview image, or
// an extension character's emoji in a glassy ring. A failed image
// falls back to the character's initial — never a broken hole.
function GatekeeperFigure({ char, size }) {
  const [imgOk, setImgOk] = useState(true);
  if (!char) return null;
  if (char.preview && imgOk) {
    return (
      <img
        src={char.preview}
        alt=""
        aria-hidden="true"
        draggable={false}
        loading="lazy"
        onError={() => setImgOk(false)}
        style={{ width: size, height: size, objectFit: 'cover', borderRadius: '9999px' }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex items-center justify-center rounded-full border border-white/15 bg-white/[0.05]"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {char.emoji || (char.name || '?').slice(0, 1)}
    </span>
  );
}

export default function CheatCodeRoom() {
  const [platformId, setPlatformId] = useState('facebook');
  const [index, setIndex] = useState(0);
  const [checks, setChecks] = useState({});
  const [signedIn, setSignedIn] = useState(false);
  const [copied, setCopied] = useState('');
  const [dragDx, setDragDx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState('third'); // 'third' | 'first'
  const [gatekeeperId, setGatekeeperId] = useState(DEFAULT_GATEKEEPER);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Per-visit prompt: component state ONLY — no dismissal is ever
  // saved, so it returns on every next visit by design.
  const [promptDismissed, setPromptDismissed] = useState(false);
  const press = useRef(null);
  const saveTimer = useRef(null);

  const platform = getPlatform(platformId);
  const pieces = useMemo(() => platformPieces(platformId), [platformId]);
  const pieceCount = pieces.length;

  // The character list, Earth idiom: the platform roster's visible
  // 43 (q001–q043, with preview images) + the Earth extension 29
  // (Middle-earth heroes, Hawkins, batch-4 — emoji marks).
  const characters = useMemo(() => {
    const platform43 = CHARACTERS
      .map((c) => ({ id: c.id, name: c.name, preview: c.preview, num: parseInt(String(c.id).slice(1, 4), 10) }))
      .filter((c) => Number.isInteger(c.num) && c.num >= 1 && c.num <= 43)
      .sort((a, b) => a.num - b.num);
    const ext = EARTH_CHARACTER_EXTENSIONS.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji }));
    return [...platform43, ...ext];
  }, []);
  const gatekeeper = characters.find((c) => c.id === gatekeeperId) || characters[0] || null;

  const go = useCallback((next) => {
    setIndex(((next % pieceCount) + pieceCount) % pieceCount);
    setCopied('');
  }, [pieceCount]);
  const prev = useCallback(() => go(index - 1), [go, index]);
  const next = useCallback(() => go(index + 1), [go, index]);

  const switchPlatform = useCallback((id) => {
    setPlatformId(id);
    setIndex(0);
    setCopied('');
  }, []);

  // Load: device record first (instant), then the account record
  // wins on login. Guests never POST — device-only, silently.
  // The gatekeeper pick: stored room pick first, else the user's
  // Earth extension pick, else the Grey Pilgrim.
  useEffect(() => {
    let alive = true;
    setChecks(loadLocalChecks());
    try {
      const stored = localStorage.getItem(GATEKEEPER_LS_KEY);
      const earthExt = localStorage.getItem(EARTH_EXTENSION_CHARACTER_KEY);
      if (stored && characters.some((c) => c.id === stored)) setGatekeeperId(stored);
      else if (earthExt && characters.some((c) => c.id === earthExt)) setGatekeeperId(earthExt);
    } catch {}
    (async () => {
      const token = await getToken();
      if (!alive) return;
      setSignedIn(!!token);
      if (!token) {
        setLoaded(true);
        return;
      }
      try {
        const res = await fetch('/api/ui-state', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => null);
        const db = body && body.preferences ? sanitizeCheatCodeChecks(body.preferences.cheat_code_checks) : null;
        if (alive && db) {
          setChecks(db);
          saveLocalChecks(db);
        }
      } catch {}
      if (alive) setLoaded(true);
    })();
    return () => {
      alive = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [characters]);

  // Persist a change: device instantly, account debounced.
  const persist = useCallback((nextChecks) => {
    saveLocalChecks(nextChecks);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const token = await getToken();
      if (!token) return;
      try {
        await fetch('/api/ui-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ preferences: { cheat_code_checks: nextChecks } }),
        });
      } catch {}
    }, 600);
  }, []);

  const toggleCheck = useCallback((piece) => {
    setChecks((prevChecks) => {
      const platformChecks = { ...(prevChecks[platformId] || {}) };
      if (platformChecks[piece]) delete platformChecks[piece];
      else platformChecks[piece] = true;
      const nextChecks = { ...prevChecks, [platformId]: platformChecks };
      persist(nextChecks);
      return nextChecks;
    });
  }, [persist, platformId]);

  const pickGatekeeper = useCallback((id) => {
    setGatekeeperId(id);
    try {
      localStorage.setItem(GATEKEEPER_LS_KEY, id);
    } catch {}
    setPickerOpen(false);
  }, []);

  const copyPiece = useCallback(async (piece) => {
    const tags = pieces[piece] || [];
    const ok = await copyText(tags.join(' '));
    setCopied(ok ? `Piece ${piece + 1} copied — paste it into your post.` : 'Copy did not go through — long-press the tags to copy by hand.');
  }, [pieces]);

  const copyAll = useCallback(async () => {
    const ok = await copyText(ALL_TAGS_TEXT);
    setCopied(ok ? `All ${TOTAL_TAGS.toLocaleString()} tags copied.` : 'Copy did not go through — long-press the tags to copy by hand.');
  }, []);

  // Swipe: horizontal drags over the carousel turn the rooms;
  // taps on buttons/checkboxes/links/inputs never navigate.
  const onPointerDown = (e) => {
    if (e.target.closest('button, input, label, a, textarea, select')) return;
    press.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e) => {
    if (!press.current) return;
    const dx = e.clientX - press.current.x;
    const dy = e.clientY - press.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) setDragDx(dx);
  };
  const onPointerUp = (e) => {
    if (!press.current) return;
    const dx = e.clientX - press.current.x;
    const dy = e.clientY - press.current.y;
    press.current = null;
    setDragDx(0);
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next();
      else prev();
    }
  };

  const platformChecks = checks[platformId] || {};
  const doneCount = Object.keys(platformChecks).length;

  return (
    <main className="min-h-screen" style={{ background: '#0a0908', color: SILVER_DIM }}>
      <style>{`
        .cheat-room { transition: transform 0.45s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.45s ease; }
        @media (prefers-reduced-motion: reduce) { .cheat-room { transition: none; } }
      `}</style>
      {/* Deep red glowing veins over obsidian — decorative, behind
          everything, never intercepting a tap. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          <path d="M0 22 L18 18 L30 30 L52 24 L70 34 L100 28" fill="none" stroke="#7f1d1d" strokeWidth="0.35" opacity="0.7" />
          <path d="M30 30 L38 48 L30 66 L44 82 L38 100" fill="none" stroke="#991b1b" strokeWidth="0.3" opacity="0.55" />
          <path d="M100 62 L78 58 L64 70 L48 66 L0 78" fill="none" stroke="#7f1d1d" strokeWidth="0.3" opacity="0.5" />
          <path d="M18 0 L22 18 L14 34 L24 52 L16 100" fill="none" stroke="#991b1b" strokeWidth="0.25" opacity="0.45" />
          <path d="M82 0 L74 22 L86 40 L78 62 L88 100" fill="none" stroke="#7f1d1d" strokeWidth="0.25" opacity="0.45" />
        </svg>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(600px 300px at 50% 0%, rgba(153,27,27,0.14), transparent 60%)' }} />
      </div>

      {/* Rock surrounding the interface. */}
      <div
        className="relative mx-auto w-full max-w-3xl px-2 py-3 sm:px-3"
      >
        <div
          className="rounded-[28px] p-2.5 sm:p-3"
          style={{
            background:
              'linear-gradient(160deg, #292524 0%, #1c1917 30%, #44403c 50%, #1c1917 70%, #292524 100%)',
            border: '1px solid #57534e',
          }}
        >
          <div className="relative rounded-[20px] px-4 pb-10 pt-4" style={{ background: 'rgba(10,9,8,0.96)', border: '1px solid rgba(255,255,255,0.10)' }}>
            <BackButton />
            <div className="flex flex-col gap-1 pt-2">
              <h1 className="text-2xl font-black tracking-wide" style={{ color: SILVER }}>Social Media Cheat Code</h1>
              <p className="text-sm leading-relaxed" style={{ color: SILVER_DIM }}>
                Every town and city hashtag, room by room. Pick a platform, swipe a room, copy its piece, check it off.
              </p>
            </div>

            {/* Per-visit prompt — tappable to dismiss, never a modal,
                and the dismissal is NEVER saved: it returns on every
                next visit by design. */}
            {!promptDismissed && (
              <div
                role="button"
                tabIndex={0}
                aria-label="Dismiss this message"
                onClick={() => setPromptDismissed(true)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setPromptDismissed(true); }}
                className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 py-3"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)' }}
              >
                <span className="text-sm" style={{ color: SILVER }}>
                  Copy a room and drop it into your next social post.
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs" style={{ color: SILVER_MUTED }}>
                  <span>Tap to dismiss</span>
                  <span aria-hidden="true">✕</span>
                </span>
              </div>
            )}

            {/* Platform selector — real brand marks, self-hosted. */}
            <div className="mt-4 flex flex-col gap-2">
              <span className="text-[11px] font-black uppercase tracking-[0.25em]" style={{ color: SILVER_MUTED }}>Pick a platform</span>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => {
                  const active = p.id === platformId;
                  const count = platformPieces(p.id).length;
                  const done = Object.keys(checks[p.id] || {}).length;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => switchPlatform(p.id)}
                      aria-pressed={active}
                      aria-label={`${p.name} — ${p.cap} tags per piece, ${count} pieces, ${done} done`}
                      className="flex min-h-[52px] items-center gap-2.5 rounded-2xl px-3.5"
                      style={{
                        background: active ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
                        border: active ? '1px solid rgba(220,38,38,0.65)' : '1px solid rgba(255,255,255,0.12)',
                      }}
                    >
                      <img src={p.logo} alt="" aria-hidden="true" draggable={false} className="h-7 w-7 shrink-0" />
                      <span className="flex flex-col items-start leading-tight">
                        <span className="text-sm font-bold" style={{ color: SILVER }}>{p.name}</span>
                        <span className="text-[10px]" style={{ color: SILVER_MUTED }}>{p.cap} per piece · {done}/{count} done</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs leading-relaxed" style={{ color: SILVER_DIM }}>
                {platform.capLine}. <span style={{ color: SILVER_MUTED }}>{platform.capSource}</span>
              </p>
            </div>

            {/* View + gatekeeper — the visitor never walks: they
                switch 1st/3rd person, and their character stands as
                the room's gatekeeper. */}
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-[0.25em]" style={{ color: SILVER_MUTED }}>View</span>
                {[
                  { id: 'third', label: '3rd person' },
                  { id: 'first', label: '1st person' },
                ].map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setView(v.id)}
                    aria-pressed={view === v.id}
                    className="min-h-[44px] rounded-full px-4 text-sm font-bold"
                    style={{
                      background: view === v.id ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                      border: view === v.id ? '1px solid rgba(220,38,38,0.65)' : '1px solid rgba(255,255,255,0.12)',
                      color: SILVER,
                    }}
                  >
                    {v.label}
                  </button>
                ))}
                <span className="text-xs" style={{ color: SILVER_MUTED }}>
                  {view === 'third' ? 'See the room from outside, gatekeeper at the door.' : 'Stand inside the room, facing the piece.'}
                </span>
              </div>

              <div
                className="flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <GatekeeperFigure char={gatekeeper} size={56} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-bold" style={{ color: SILVER }}>{gatekeeper ? gatekeeper.name : 'Gatekeeper'}</span>
                  <span className="text-[11px]" style={{ color: SILVER_MUTED }}>Gatekeeper of this room</span>
                </span>
                <button
                  type="button"
                  onClick={() => setPickerOpen((o) => !o)}
                  aria-expanded={pickerOpen}
                  className="ml-auto min-h-[44px] rounded-full px-4 text-sm font-bold"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: SILVER }}
                >
                  {pickerOpen ? 'Close picker' : 'Choose gatekeeper'}
                </button>
              </div>
              {pickerOpen && (
                <div
                  className="grid max-h-[280px] grid-cols-2 gap-1.5 overflow-y-auto rounded-2xl p-2 sm:grid-cols-3"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.10)' }}
                >
                  {characters.map((c) => {
                    const active = c.id === gatekeeperId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => pickGatekeeper(c.id)}
                        aria-pressed={active}
                        className="flex min-h-[48px] items-center gap-2 rounded-xl px-2 py-1.5 text-left"
                        style={{
                          background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
                          border: active ? '1px solid rgba(220,38,38,0.65)' : '1px solid transparent',
                        }}
                      >
                        <GatekeeperFigure char={c} size={32} />
                        <span className="truncate text-xs font-bold" style={{ color: SILVER }}>{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-3 py-1 text-xs font-bold"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: SILVER }}
              >
                {doneCount} of {pieceCount} {platform.name} pieces done
              </span>
              <button
                type="button"
                onClick={copyAll}
                className="rounded-full px-3 py-1 text-xs font-bold"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: SILVER }}
              >
                Copy all {TOTAL_TAGS.toLocaleString()} tags
              </button>
              {!signedIn && loaded && (
                <span className="text-xs" style={{ color: SILVER_MUTED }}>Sign in to keep your checks on every device — otherwise they live on this device only.</span>
              )}
            </div>
            <p aria-live="polite" className="min-h-[1.25rem] text-xs font-bold" style={{ color: SILVER }}>{copied}</p>

            {/* The 3D carousel: rooms ride a cover-flow ring in
                3rd person; in 1st person the current room fills
                the frame, flat, as if standing inside it. Swipe
                left or right, or use the arrows. */}
            <div
              className="relative mx-auto w-full touch-pan-y select-none"
              style={{ perspective: '1200px', height: '580px', maxWidth: '520px' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') prev();
                if (e.key === 'ArrowRight') next();
              }}
            >
              {pieces.map((tags, i) => {
                const offset = i - index;
                if (view === 'first' && offset !== 0) return null;
                if (view === 'third' && Math.abs(offset) > 2) return null;
                const done = !!(platformChecks[i] || false);
                const shift = dragDx ? dragDx * 0.6 : 0;
                const transform = view === 'first'
                  ? 'translateX(-50%)'
                  : `translateX(calc(-50% + ${offset * 72}% + ${shift}px)) rotateY(${offset * -30}deg) translateZ(${-Math.abs(offset) * 180}px)`;
                return (
                  <section
                    key={i}
                    aria-label={`Piece ${i + 1} of ${pieceCount} for ${platform.name}`}
                    aria-hidden={offset !== 0}
                    className="cheat-room absolute left-1/2 top-0 flex h-full w-[92%] max-w-[440px] flex-col rounded-3xl backdrop-blur-md"
                    style={{
                      transform,
                      zIndex: 10 - Math.abs(offset),
                      opacity: view === 'first' || offset === 0 ? 1 : 0.55,
                      background: 'rgba(255,255,255,0.04)',
                      border: done ? '1px solid rgba(220,38,38,0.65)' : '1px solid rgba(255,255,255,0.14)',
                      boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
                      pointerEvents: offset === 0 ? 'auto' : 'none',
                    }}
                  >
                    {/* Piece plaque — the room's crown. */}
                    <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-4">
                      <span className="text-[11px] font-black uppercase tracking-[0.25em]" style={{ color: SILVER }}>
                        Piece {i + 1} of {pieceCount}
                      </span>
                      <span className="text-[11px]" style={{ color: SILVER_MUTED }}>Tags {pieceRange(platformId, i)}</span>
                      {done && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-black"
                          style={{ background: 'rgba(220,38,38,0.25)', border: '1px solid rgba(220,38,38,0.55)', color: SILVER }}
                        >
                          ✓ DONE
                        </span>
                      )}
                    </div>
                    <div
                      aria-hidden="true"
                      className="mx-4 h-px shrink-0"
                      style={{ background: 'linear-gradient(90deg, rgba(220,38,38,0.9), rgba(220,38,38,0.1))' }}
                    />

                    {/* Controls — FIXED in the middle of the room,
                        at thumb level: Copy and the checkbox,
                        centered, big tap targets, never at an edge. */}
                    <div className="flex shrink-0 flex-col items-center gap-3 px-4 py-4">
                      <button
                        type="button"
                        onClick={() => copyPiece(i)}
                        tabIndex={offset === 0 ? 0 : -1}
                        className="min-h-[52px] w-full max-w-[300px] rounded-2xl text-base font-black tracking-wide transition-all active:scale-95"
                        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.20)', color: SILVER }}
                      >
                        Copy piece {i + 1}
                      </button>
                      <label
                        className="flex min-h-[48px] w-full max-w-[300px] cursor-pointer items-center justify-center gap-3 rounded-2xl px-4"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)' }}
                      >
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={() => toggleCheck(i)}
                          tabIndex={offset === 0 ? 0 : -1}
                          aria-label={`Mark piece ${i + 1} as complete`}
                          className="h-6 w-6 shrink-0"
                          style={{ accentColor: '#c0c0c8' }}
                        />
                        <span className="text-sm font-bold" style={{ color: SILVER }}>
                          {done ? 'Done — posted' : 'Mark as complete'}
                        </span>
                      </label>
                    </div>

                    {/* The piece's tags — scrolls inside the room. */}
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                      <p className="text-[13px] leading-relaxed" style={{ color: SILVER_DIM, overflowWrap: 'anywhere' }}>
                        {tags.join(' ')}
                      </p>
                    </div>

                    {/* The room's floor — a red vein line. */}
                    <div
                      aria-hidden="true"
                      className="h-px shrink-0 rounded-b-3xl"
                      style={{ background: 'linear-gradient(90deg, rgba(220,38,38,0.5), rgba(220,38,38,0.05))' }}
                    />
                  </section>
                );
              })}
            </div>

            {/* Carousel navigation — arrows + position, below the rooms. */}
            <div className="mt-4 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={prev}
                aria-label="Previous piece"
                className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-full text-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)', color: SILVER }}
              >
                ‹
              </button>
              <span className="text-sm font-bold" style={{ color: SILVER }}>
                Piece {index + 1} of {pieceCount}
              </span>
              <button
                type="button"
                onClick={next}
                aria-label="Next piece"
                className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-full text-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)', color: SILVER }}
              >
                ›
              </button>
            </div>
            {pieceCount <= 60 ? (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5" role="tablist" aria-label="Pieces">
                {pieces.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={`Go to piece ${i + 1}${platformChecks[i] ? ' (done)' : ''}`}
                    onClick={() => go(i)}
                    className="h-2.5 rounded-full transition-all"
                    style={{
                      width: i === index ? 28 : 10,
                      background: i === index ? SILVER : platformChecks[i] ? 'rgba(220,38,38,0.8)' : '#3f3f46',
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="mx-auto mt-3 h-1.5 w-full max-w-[300px] overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.10)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${((index + 1) / pieceCount) * 100}%`, background: 'rgba(220,38,38,0.8)' }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
