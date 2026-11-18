'use client';

// PortalSuckOverlay — being sucked into a portal (Merlin, Nov 18,
// 2026): tap a portal in the flat grid and it zooms out of its grid
// slot into a fullscreen video — the user is sucked into the video.
// The portal video plays once, to its end; then the portal system
// engages (the parent's enterProgram → vortex tube ride → realm).
// No skip button — the video runs to its end. Esc cancels before
// travel engages. Reduced motion skips the video entirely and the
// travel engages at once (the house rule).
//
// Never strand the user: a portal with no video (earth-2, mars-moon)
// or a video that fails to load shows the shared swirl face
// fullscreen for a short beat, then travel engages anyway; a safety
// timeout engages travel if the video stalls past its length.

import { useEffect, useRef, useState } from 'react';
import { portalHasVideo } from '@/lib/portal-videos';
import { getSwirlDataUrl } from './PortalFlatGrid';

const ZOOM_MS = 480; // the suck-in, from the grid slot to fullscreen
const NO_VIDEO_BEAT_MS = 1200; // swirl fullscreen, then travel engages
const STALL_SLACK_MS = 5000; // past the video's length, engage anyway

export default function PortalSuckOverlay({ program, fromRect, onDone, onCancel }) {
  const videoRef = useRef(null);
  const doneRef = useRef(false);
  // onDone in a ref: the safety-timeout effect mounts once, and the
  // parent's callback may be re-created on re-renders — the ref
  // always calls the latest one.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const [zoomed, setZoomed] = useState(false);
  const [settled, setSettled] = useState(false);
  const hasVideo = program ? portalHasVideo(program.key) : false;
  const swirlUrl = useMemoSwirl();

  // Reduced motion: no zoom, no video — travel engages at once.
  const reduced =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  // The suck-in: one frame at the grid slot, then the container
  // grows to the viewport — circle face morphing into the fullscreen
  // video, the video already playing inside it.
  useEffect(() => {
    if (reduced) return undefined;
    const raf = requestAnimationFrame(() => setZoomed(true));
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  // Travel engages exactly once, however the video ends.
  const engage = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  };

  // Safety timeout: if the video stalls (or never loads), travel
  // still engages — a stalled video never strands the user. Armed
  // first at a 15 s fallback, then re-armed from the video's real
  // length once its metadata lands (duration + 5 s of slack).
  const safetyTimerRef = useRef(null);
  const armSafety = (waitMs) => {
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    safetyTimerRef.current = setTimeout(engage, waitMs);
  };
  useEffect(() => {
    if (!program) return undefined;
    armSafety(15000);
    return () => {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program]);

  // No video at all: the swirl holds fullscreen for a beat, then
  // travel engages.
  useEffect(() => {
    if (!program || hasVideo) return undefined;
    const timer = setTimeout(engage, NO_VIDEO_BEAT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, hasVideo]);

  // Esc cancels the suck-in before travel engages.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (doneRef.current) return;
      onCancelRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Reduced motion mounts straight into travel — no overlay at all.
  useEffect(() => {
    if (reduced && program) engage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, program]);

  if (!program) return null;
  if (reduced) return null;

  const start = fromRect || { left: 0, top: 0, width: 120, height: 120 };
  const style = settled
    ? undefined
    : zoomed
      ? {
          left: 0,
          top: 0,
          width: '100vw',
          height: '100dvh',
          borderRadius: 0,
          transition: `left ${ZOOM_MS}ms cubic-bezier(0.22, 1, 0.36, 1), top ${ZOOM_MS}ms cubic-bezier(0.22, 1, 0.36, 1), width ${ZOOM_MS}ms cubic-bezier(0.22, 1, 0.36, 1), height ${ZOOM_MS}ms cubic-bezier(0.22, 1, 0.36, 1), border-radius ${ZOOM_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        }
      : {
          left: start.left,
          top: start.top,
          width: start.width,
          height: start.height,
          borderRadius: '50%',
        };

  return (
    <div
      className="fixed z-[70] overflow-hidden bg-black"
      style={settled ? { inset: 0 } : { position: 'fixed', ...style, willChange: 'left, top, width, height, border-radius' }}
      role="dialog"
      aria-label={`Entering ${program.title}`}
      onTransitionEnd={() => setSettled(true)}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={`/videos/portals/${program.key}.mp4`}
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={engage}
          onError={engage}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) armSafety(d * 1000 + STALL_SLACK_MS);
          }}
        />
      ) : (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={swirlUrl ? { backgroundImage: `url(${swirlUrl})` } : undefined}
        >
          <div className="absolute inset-0 flex items-center justify-center text-7xl text-amber-200/70">
            Ω
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center pb-8">
        <span className="text-[13px] font-bold tracking-[0.25em] text-zinc-100 drop-shadow-[0_0_12px_rgba(0,0,0,0.9)]">
          {program.title.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

// The shared swirl data URL, painted once (same cache as the grid).
function useMemoSwirl() {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    setUrl(getSwirlDataUrl());
  }, []);
  return url;
}
