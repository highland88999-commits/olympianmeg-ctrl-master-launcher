'use client';

// Molly's broadcast overlay (Merlin, 2026-10-29).
//
// When the keeper presses send in the threat monitor console, everyone
// online sees Molly's head: she "speaks" his words — the broadcast
// audio plays once through the overlay — and when it finishes playing
// the first time, the overlay disappears. The file is already stored
// by the publish flow, so past announcements stay replayable from the
// Concourse notifications menu.
//
// Autoplay: the overlay tries to play on mount. If the browser blocks
// it (no prior gesture on the page), Molly waits with a "tap to hear"
// button — the tap is the gesture that unlocks sound. On the sender's
// own device the studio already played the clip back, so the overlay
// shows her head without a second playthrough and dismisses on tap
// (or after the clip's length).
import { useEffect, useRef, useState } from 'react';
import MollyHead3D from '@/components/molly/MollyHead3D';

export default function MollyBroadcastOverlay({ item, selfSent, presetLabel, onPlayingChange, onDone }) {
  const audioRef = useRef(null);
  const [state, setState] = useState(selfSent ? 'sent' : 'trying'); // trying | blocked | speaking | sent | failed
  const doneRef = useRef(false);
  const finish = (fn) => { if (!doneRef.current) { doneRef.current = true; fn(); } };

  useEffect(() => {
    if (selfSent) {
      // Sender's device: the studio already played it back. Show her
      // head, then step aside on tap or when the clip would have ended.
      const ms = Math.max(Number(item.durationMs) || 0, 4000) + 1500;
      const t = setTimeout(() => finish(onDone), ms);
      return () => clearTimeout(t);
    }
    const el = audioRef.current;
    if (!el) return undefined;
    let alive = true;
    el.play().then(() => {
      if (!alive) return;
      setState('speaking');
      try { onPlayingChange(true, el); } catch {}
    }).catch(() => {
      if (!alive) return;
      setState('blocked');
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function hearIt() {
    const el = audioRef.current;
    if (!el) return;
    el.play().then(() => {
      setState('speaking');
      try { onPlayingChange(true, el); } catch {}
    }).catch(() => setState('failed'));
  }

  function handleEnded() {
    try { onPlayingChange(false, null); } catch {}
    finish(onDone);
  }

  return (
    <div
      role="dialog"
      aria-label="Molly has an announcement"
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 p-6"
      onClick={() => { if (state === 'sent') finish(onDone); }}
    >
      <style>{`
        .molly-speaking { animation: molly-speak 1.1s ease-in-out infinite; }
        @keyframes molly-speak {
          0%, 100% { filter: drop-shadow(0 0 6px rgba(56,189,248,0.45)); transform: scale(1); }
          50% { filter: drop-shadow(0 0 22px rgba(56,189,248,0.9)); transform: scale(1.03); }
        }
      `}</style>
      <div className="w-full max-w-xs rounded-2xl border border-sky-900/60 bg-zinc-950/95 p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">
          Molly · Announcement
        </p>
        <div className={state === 'speaking' ? 'molly-speaking' : ''}>
          {/* Her real 3D head — never the 2D placeholder (Merlin, 2026-10-29).
              While the model loads, the head shows its own loader; if it
              fails, the announcement still plays — the voice is the point. */}
          <MollyHead3D
            showMotionToggle={false}
            className="max-w-[200px]"
            fallback={
              <div className="mx-auto flex h-[220px] w-full max-w-[200px] items-center justify-center">
                <div className="h-16 w-16 animate-pulse rounded-full bg-sky-400/30 blur-md" aria-hidden="true" />
              </div>
            }
          />
        </div>
        <p className="mt-3 text-xs text-zinc-400">
          {state === 'speaking' && 'Molly is speaking…'}
          {state === 'trying' && 'Tuning in…'}
          {state === 'blocked' && 'Molly has something to say.'}
          {state === 'sent' && `Sent · ${presetLabel} voice`}
          {state === 'failed' && 'The clip would not play.'}
        </p>
        {state === 'blocked' && (
          <button type="button" onClick={hearIt}
            className="mt-4 rounded-full bg-sky-400 px-5 py-2.5 text-sm font-bold text-black">
            Tap to hear Molly
          </button>
        )}
        {(state === 'sent' || state === 'failed') && (
          <button type="button" onClick={() => finish(onDone)}
            className="mt-4 rounded-full border border-zinc-700 px-5 py-2.5 text-sm font-bold text-zinc-100">
            Close
          </button>
        )}
      </div>
      <audio
        ref={audioRef}
        src={item.audioUrl}
        preload="auto"
        onEnded={handleEnded}
        onPause={() => { try { onPlayingChange(false, null); } catch {} }}
        onError={() => setState((s) => (s === 'speaking' ? s : 'failed'))}
      />
    </div>
  );
}
