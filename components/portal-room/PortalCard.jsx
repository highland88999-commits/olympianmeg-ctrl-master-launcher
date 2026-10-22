'use client';

// PortalCard — one program's portal in the Portal Room: an
// arch-shaped frame labeled UNDERNEATH with its program, per
// Merlin's spec. Extracted from PortalRoom.jsx so the Concourse's
// Portals 3D panel can render the very same cards in its List mode
// (the DOM fallback for the 3D hall) — one card implementation for
// every portal surface.
//
// A portal plays its own looping video (/videos/portals/<key>.mp4,
// produced through the Omega Portal Videos queue); a portal whose
// video has not arrived yet turns with a living violet swirl instead
// — never a broken frame. Videos load lazily as they approach the
// screen and pause when they leave it, so a full hall stays light.
//
// The card's CSS (.portal-arch / .portal-swirl) lives in
// <PortalStyles /> below — the parent surface renders it ONCE;
// cards themselves inject no styles.

import { useEffect, useRef, useState } from 'react';

export function PortalStyles() {
  return (
    <style>{`
      .portal-arch { border-radius: 999px 999px 22px 22px; }
      .portal-swirl {
        background:
          radial-gradient(circle at 50% 62%, rgba(0,229,255,0.20), transparent 55%),
          conic-gradient(from 0deg at 50% 55%, #160b33, #3b1d78, #0d2a4a, #6d28d9, #160b33);
        animation: portal-spin 14s linear infinite;
      }
      @keyframes portal-spin { to { transform: rotate(360deg); } }
    `}</style>
  );
}

export default function PortalCard({ program, onEnter }) {
  const frameRef = useRef(null);
  const videoRef = useRef(null);
  const [failed, setFailed] = useState(false);

  // Lazy video: only fetch/play when the portal nears the screen; pause
  // when it leaves, so 165 portals never stream at once.
  useEffect(() => {
    const frame = frameRef.current;
    const video = videoRef.current;
    if (!frame || !video || failed) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (!video.src) video.src = `/videos/portals/${program.key}.mp4`;
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { rootMargin: '320px 0px' }
    );
    io.observe(frame);
    return () => io.disconnect();
  }, [failed, program.key]);

  return (
    <button
      type="button"
      onClick={() => onEnter(program)}
      className="group block w-full text-left focus:outline-none"
      aria-label={`Enter ${program.title}`}
    >
      <div
        ref={frameRef}
        className="portal-arch relative aspect-[3/4] w-full overflow-hidden border border-cyan-300/25 bg-[#0a0618] shadow-[0_0_24px_rgba(80,60,220,0.25)] transition duration-300 group-hover:border-amber-300/60 group-hover:shadow-[0_0_36px_rgba(255,180,60,0.35)] group-focus-visible:border-amber-300/80"
      >
        {!failed ? (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            muted
            loop
            playsInline
            preload="none"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="portal-swirl absolute inset-0" aria-hidden="true">
            <span className="absolute inset-0 flex items-center justify-center text-6xl text-amber-200/70">
              Ω
            </span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/45" />
      </div>
      {/* The label lives under the portal, as specced. */}
      <div className="px-1 pt-2.5 pb-1 text-center">
        <div className="truncate text-[15px] font-semibold tracking-wide text-zinc-100">
          {program.title}
        </div>
        {program.subtitle ? (
          <div className="truncate text-xs text-zinc-400">{program.subtitle}</div>
        ) : null}
      </div>
    </button>
  );
}
