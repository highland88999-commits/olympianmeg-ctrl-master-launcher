'use client';

// PortalFlatGrid — the flat 2D portal menu (Merlin, Nov 18, 2026:
// "I don't want the 3d version of portals as seen in the video" —
// the 3D hall is gone). The portals look like the wall discs did,
// but BIGGER and flat: one circular video face per program, the
// destination name in BOLD underneath, 3 across (Merlin: "Maybe 3"),
// rows running down the screen. The grid scrolls vertically; one
// page at a time (42), so only the current page ever holds video
// elements — the wall-videos discipline, in flat terms.
//
// Each face wears its own portal video (/videos/portals/<key>.mp4,
// muted + looping + inline) when it has one; a portal with no video
// (earth-2, mars-moon — by design) or whose video failed wears the
// shared painted swirl (lib/portal-swirl.js) with a ring in its
// section hue. Starts are staggered 120 ms per slot, exactly like
// the wall's; every face pauses while the tab is hidden, and a face
// unmount pauses its video and unloads it. Reduced motion keeps the
// first frame, unmoving. Tapping a portal hands its face rect to
// the parent, which sucks the user into the video.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { portalHasVideo } from '@/lib/portal-videos';
import { SECTION_HUES, DEFAULT_SECTION_HUE } from '@/lib/portal-roster';
import { paintPortalSwirl, PORTAL_SWIRL_SIZE } from '@/lib/portal-swirl';

// 3 across — Merlin's call (Nov 18, 2026: "Maybe 3").
export const FLAT_GRID_COLS = 3;
const VIDEO_START_STAGGER_MS = 120; // one slot at a time, like the wall

// The shared swirl face, painted once per page load and cached as a
// data URL — the same painting the 3D hall wore as a texture.
let swirlDataUrlCache = null;
export function getSwirlDataUrl() {
  if (swirlDataUrlCache) return swirlDataUrlCache;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = PORTAL_SWIRL_SIZE;
  canvas.height = PORTAL_SWIRL_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  paintPortalSwirl(ctx, PORTAL_SWIRL_SIZE);
  swirlDataUrlCache = canvas.toDataURL('image/png');
  return swirlDataUrlCache;
}

// One portal's face: its own video when it has one, the shared
// swirl while the video loads or when it has none / failed. The
// video element lives only while this face is mounted — the grid
// mounts one page at a time, so only the current page ever holds
// video elements.
function FlatPortalFace({ item, slotIndex, pausedRef, registerVideo }) {
  const videoRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const hasVideo = portalHasVideo(item.key) && !failed;
  const swirlUrl = useMemo(() => getSwirlDataUrl(), []);
  const hue = SECTION_HUES[item.section] || DEFAULT_SECTION_HUE;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hasVideo) return undefined;
    const reduced =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    let disposed = false;
    let loadTimer = null;
    let playTimer = null;
    const onError = () => {
      if (!disposed) setFailed(true);
    };
    const onCanPlay = () => {
      if (disposed) return;
      video.dataset.gridReady = '1';
      if (reduced) {
        video.dataset.gridStill = '1';
        return; // still face: the first frame, unmoving
      }
      playTimer = setTimeout(() => {
        if (disposed || document.hidden || pausedRef.current) return;
        video.play().catch(() => {});
      }, slotIndex * VIDEO_START_STAGGER_MS);
    };
    video.addEventListener('error', onError);
    video.addEventListener('canplay', onCanPlay);
    // Stagger the load itself so 42 fetches never burst on one
    // frame: a face's src only starts loading in its stagger slot,
    // while the face is mounted.
    loadTimer = setTimeout(() => {
      if (disposed) return;
      video.preload = 'auto';
      video.load();
    }, slotIndex * VIDEO_START_STAGGER_MS);
    registerVideo(item.key, video);
    return () => {
      disposed = true;
      if (loadTimer) clearTimeout(loadTimer);
      if (playTimer) clearTimeout(playTimer);
      video.removeEventListener('error', onError);
      video.removeEventListener('canplay', onCanPlay);
      video.pause();
      video.removeAttribute('src');
      try {
        video.load();
      } catch {}
      registerVideo(item.key, null);
    };
  }, [item.key, slotIndex, hasVideo, pausedRef, registerVideo]);

  return (
    <span
      data-face
      aria-hidden="true"
      className="relative mx-auto block aspect-square w-full max-w-[148px] overflow-hidden rounded-full border-2 bg-[#0a0618]"
      style={{ borderColor: hue, boxShadow: `0 0 18px ${hue}33` }}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          loop
          playsInline
          preload="none"
        />
      ) : (
        <span
          className="absolute inset-0 bg-cover bg-center"
          style={swirlUrl ? { backgroundImage: `url(${swirlUrl})` } : undefined}
        >
          <span className="absolute inset-0 flex items-center justify-center text-4xl text-amber-200/70">
            Ω
          </span>
        </span>
      )}
    </span>
  );
}

export default function PortalFlatGrid({ pageItems, onTap, paused }) {
  // Live grid videos by program key — the tab-hidden pause and the
  // suck-in pause below walk this map; a face registers on mount,
  // unregisters on unmount, so only the mounted page's videos are
  // ever in it.
  const videosRef = useRef(new Map());
  const pausedRef = useRef(!!paused);
  pausedRef.current = !!paused;
  const registerVideo = useCallback((key, vid) => {
    if (vid) videosRef.current.set(key, vid);
    else videosRef.current.delete(key);
  }, []);

  // Every grid video pauses while the tab is hidden and resumes on
  // return — 42 decodes never run behind a hidden tab. Only videos
  // that loaded (gridReady) and are not reduced-motion stills
  // (gridStill) resume; a video whose stagger slot fell while hidden
  // starts here instead.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        for (const vid of videosRef.current.values()) vid.pause();
      } else {
        for (const vid of videosRef.current.values()) {
          if (vid.dataset.gridReady === '1' && vid.dataset.gridStill !== '1' && !pausedRef.current) {
            vid.play().catch(() => {});
          }
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // While the user is being sucked into a portal video, the grid
  // faces behind the fullscreen overlay pause; they resume when the
  // suck-in closes without traveling.
  useEffect(() => {
    if (paused) {
      for (const vid of videosRef.current.values()) vid.pause();
      return undefined;
    }
    for (const vid of videosRef.current.values()) {
      if (vid.dataset.gridReady === '1' && vid.dataset.gridStill !== '1' && !document.hidden) {
        vid.play().catch(() => {});
      }
    }
    return undefined;
  }, [paused]);

  return (
    <div
      className="mx-auto grid w-full max-w-[520px] grid-cols-3 gap-x-3 gap-y-5"
      role="list"
      aria-label="Portals"
    >
      {pageItems.map((item, i) => (
        <button
          key={item.key}
          type="button"
          onClick={(e) => {
            const face = e.currentTarget.querySelector('[data-face]');
            const r = face ? face.getBoundingClientRect() : e.currentTarget.getBoundingClientRect();
            onTap(item, { left: r.left, top: r.top, width: r.width, height: r.height });
          }}
          className="group block w-full focus:outline-none"
          aria-label={`Enter ${item.title}`}
        >
          <FlatPortalFace
            item={item}
            slotIndex={i}
            pausedRef={pausedRef}
            registerVideo={registerVideo}
          />
          {/* The name in BOLD underneath — where the portal goes. */}
          <span className="mt-2 block truncate px-0.5 text-center text-[12px] font-bold tracking-wide text-zinc-100 group-hover:text-amber-100">
            {item.title}
          </span>
        </button>
      ))}
    </div>
  );
}
