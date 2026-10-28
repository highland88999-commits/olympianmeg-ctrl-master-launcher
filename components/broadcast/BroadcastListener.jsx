'use client';

// Broadcast listener — every user's ear, on every page.
//
// Mounted once in the root layout, so a broadcast reaches users wherever
// they are in Olympus. It polls the public latest.json pointer (same
// polling pattern as presence — no websockets, no Realtime). A broadcast
// that arrives while the page is open plays automatically once the user
// has tapped "Turn on broadcast sound" (browsers block sound before any
// tap on the page); before that, the banner offers a Play button per
// broadcast. Nothing auto-plays on first load for a broadcast that
// arrived while the user was away — the banner still offers it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { BROADCAST_POLL_MS, BROADCAST_PRESETS, latestJsonUrl, validateLatest } from '@/lib/broadcast/voice-changer';
import { useRadio } from '@/components/radio/RadioProvider';
import { isFxEnabled, setFxEnabled } from '@/lib/fx';
import { collectPlayingMedia, resumeMedia } from '@/lib/broadcast/intercom-mute';

const LS_SOUND = 'broadcast-sound';
const LS_LAST_ID = 'broadcast-last-id';

export default function BroadcastListener() {
  const [enabled, setEnabled] = useState(false);
  const [latest, setLatest] = useState(null);
  const [dismissedId, setDismissedId] = useState(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  const enabledRef = useRef(false);
  const radio = useRadio();
  const playingRef = useRef(false);
  const duckRef = useRef(null);

  useEffect(() => { playingRef.current = !!radio.playing; }, [radio.playing]);

  const duckSounds = useCallback(() => {
    if (duckRef.current) return;
    const fxWas = isFxEnabled();
    try { setFxEnabled(false); } catch {}
    const radioWasPlaying = playingRef.current;
    if (radioWasPlaying) {
      try { radio.togglePlay(); } catch {}
    }
    duckRef.current = { fxWas, radioWasPlaying, media: collectPlayingMedia(audioRef.current) };
  }, [radio]);

  const restoreSounds = useCallback(() => {
    const d = duckRef.current;
    if (!d) return;
    duckRef.current = null;
    try {
      if (!isFxEnabled() && d.fxWas) setFxEnabled(true);
    } catch {}
    if (d.radioWasPlaying && !playingRef.current) {
      try { radio.togglePlay(); } catch {}
    }
    resumeMedia(d.media);
  }, [radio]);
  const seenRef = useRef(null);
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');

  const playLatest = useCallback((item) => {
    const el = audioRef.current;
    if (!el || !item) return;
    el.src = item.audioUrl;
    el.play().then(() => { setPlaying(true); duckSounds(); }).catch(() => setPlaying(false));
  }, [duckSounds]);

  useEffect(() => {
    try {
      enabledRef.current = localStorage.getItem(LS_SOUND) === '1';
      setEnabled(enabledRef.current);
      seenRef.current = localStorage.getItem(LS_LAST_ID) || null;
    } catch {}
  }, []);

  useEffect(() => {
    if (!base) return undefined;
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`${latestJsonUrl(base)}?v=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const item = validateLatest(await res.json().catch(() => null));
        if (!item || !alive) return;
        if (seenRef.current === null) {
          // First sighting on this page: remember it, don't replay history.
          seenRef.current = item.id;
          try { localStorage.setItem(LS_LAST_ID, item.id); } catch {}
          setLatest(item);
          return;
        }
        if (item.id === seenRef.current) return;
        seenRef.current = item.id;
        try { localStorage.setItem(LS_LAST_ID, item.id); } catch {}
        setLatest(item);
        setDismissedId(null);
        if (enabledRef.current) playLatest(item);
      } catch {}
    };
    void poll();
    const timer = setInterval(poll, BROADCAST_POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [base, playLatest]);

  if (!base || !latest || dismissedId === latest.id) return null;

  const presetLabel = (BROADCAST_PRESETS[latest.preset] || {}).label || latest.preset;

  function enableSound() {
    enabledRef.current = true;
    setEnabled(true);
    try { localStorage.setItem(LS_SOUND, '1'); } catch {}
    playLatest(latest);
  }

  return (
    <div className="fixed bottom-24 right-4 z-50 w-[calc(100vw-2rem)] max-w-xs rounded-xl border border-sky-900/60 bg-zinc-950/95 p-4 shadow-2xl">
      <audio
        ref={audioRef}
        preload="none"
        onEnded={() => { setPlaying(false); restoreSounds(); }}
        onPause={() => { setPlaying(false); restoreSounds(); }}
      />
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Broadcast · {presetLabel} voice</p>
      <p className="mt-1 text-xs text-zinc-400">
        A new announcement is live · {new Date(latest.createdAt).toLocaleTimeString()}
        {latest.durationMs > 0 && ` · ${Math.round(latest.durationMs / 1000)}s`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {!enabled ? (
          <button type="button" onClick={enableSound}
            className="rounded-lg bg-sky-400 px-3 py-2 text-xs font-bold text-black">
            Turn on broadcast sound
          </button>
        ) : (
          <button type="button" onClick={() => playLatest(latest)}
            className="rounded-lg bg-sky-400 px-3 py-2 text-xs font-bold text-black">
            {playing ? 'Playing…' : 'Play again'}
          </button>
        )}
        <button type="button" onClick={() => { try { audioRef.current?.pause(); } catch {} restoreSounds(); setDismissedId(latest.id); }}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300">
          Dismiss
        </button>
      </div>
    </div>
  );
}
