'use client';

// BroadcastListener — the site-wide ear for the keeper's announcements.
//
// When Merlin presses send in the threat monitor console (/ares, where
// Molly lives), every open page polls latest.json and — for anyone
// online at that moment — Molly's head appears and speaks his words:
// the broadcast audio plays once through the overlay, and when it
// finishes playing the first time, her head disappears. The clip is
// already stored by the publish flow, so past announcements stay
// replayable from the Concourse notifications menu (the separate
// Announcements portal button).
//
// Sound unlock: the overlay tries to play on mount; if the browser
// blocks autoplay, Molly waits behind a "tap to hear" button — that
// tap is the gesture that unlocks sound. On the sender's own device
// the studio already played the clip back, so her head shows without
// a second playthrough and dismisses on tap (or after its length).
import { useCallback, useEffect, useRef, useState } from 'react';
import { BROADCAST_POLL_MS, BROADCAST_PRESETS, latestJsonUrl, validateLatest } from '@/lib/broadcast/voice-changer';
import { useRadio } from '@/components/radio/RadioProvider';
import { isFxEnabled, setFxEnabled } from '@/lib/fx';
import { collectPlayingMedia, resumeMedia } from '@/lib/broadcast/intercom-mute';
import MollyBroadcastOverlay from './MollyBroadcastOverlay';

const LS_LAST_ID = 'broadcast-last-id';
const LS_SELF_SENT = 'broadcast-self-sent';

export default function BroadcastListener() {
  const [overlay, setOverlay] = useState(null); // { item, selfSent } | null
  const seenRef = useRef(null);
  const radio = useRadio();
  const playingRef = useRef(false);
  const duckRef = useRef(null);
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');

  // Tour preview iframes (Merlin, 2026-10-29): ?tourPreview=1 hides the
  // announcement UI so the frame shows the program only.
  const [isTourPreview] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('tourPreview') === '1'; } catch { return false; }
  });

  useEffect(() => { playingRef.current = !!radio.playing; }, [radio.playing]);

  const duckSounds = useCallback((excludeEl) => {
    if (duckRef.current) return;
    const fxWas = isFxEnabled();
    try { setFxEnabled(false); } catch {}
    const radioWasPlaying = playingRef.current;
    if (radioWasPlaying) {
      try { radio.togglePlay(); } catch {}
    }
    duckRef.current = { fxWas, radioWasPlaying, media: collectPlayingMedia(excludeEl) };
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

  useEffect(() => {
    try { seenRef.current = localStorage.getItem(LS_LAST_ID) || null; } catch {}
  }, []);

  // Tell the Concourse bell about every latest id we see, so its dot
  // can mark announcements the user hasn't opened yet.
  function noteLatest(id) {
    try { window.dispatchEvent(new CustomEvent('broadcast-latest', { detail: { id } })); } catch {}
  }

  useEffect(() => {
    if (!base || isTourPreview) return undefined;
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`${latestJsonUrl(base)}?v=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const item = validateLatest(await res.json().catch(() => null));
        if (!item || !alive) return;
        noteLatest(item.id);
        let selfSent = null;
        try { selfSent = localStorage.getItem(LS_SELF_SENT); } catch {}
        if (selfSent && item.id === selfSent) {
          // This device sent it: the studio already played it back, so
          // Molly shows her head but does not speak twice.
          seenRef.current = item.id;
          try { localStorage.setItem(LS_LAST_ID, item.id); } catch {}
          setOverlay({ item, selfSent: true });
          return;
        }
        if (seenRef.current === null) {
          // First sighting on this page: remember it, don't replay history.
          seenRef.current = item.id;
          try { localStorage.setItem(LS_LAST_ID, item.id); } catch {}
          return;
        }
        if (item.id === seenRef.current) return;
        seenRef.current = item.id;
        try { localStorage.setItem(LS_LAST_ID, item.id); } catch {}
        // Fresh arrival while the page is open: Molly appears and speaks.
        setOverlay({ item, selfSent: false });
      } catch {}
    };
    void poll();
    const timer = setInterval(poll, BROADCAST_POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [base, isTourPreview, duckSounds]);

  function handlePlayingChange(on, audioEl) {
    if (on) duckSounds(audioEl || null);
    else restoreSounds();
  }

  function handleDone() {
    setOverlay(null);
    restoreSounds();
  }

  if (isTourPreview || !base || !overlay) return null;

  const presetLabel = (BROADCAST_PRESETS[overlay.item.preset] || {}).label || overlay.item.preset;
  return (
    <MollyBroadcastOverlay
      item={overlay.item}
      selfSent={overlay.selfSent}
      presetLabel={presetLabel}
      onPlayingChange={handlePlayingChange}
      onDone={handleDone}
    />
  );
}
