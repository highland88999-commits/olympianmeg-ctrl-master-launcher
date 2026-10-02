'use client';
// components/store/StoreSpaceBackground.jsx — the Omega Store's deep-space
// backdrop. One fixed full-viewport video element sits behind the entire
// store flow (listing, reward mode, checkout success/cancelled states — all
// render on /store, so the background never reloads or flashes between
// them). Product cards are translucent + blurred, so the space ghosts
// through behind them while text stays crisp white.
//
// Phone-first: a single 720x1280 H.264 element, muted/autoplay/loop/inline,
// poster frame while loading. prefers-reduced-motion gets the static poster
// instead of the video. Stripe-hosted checkout pages are off-site and can't
// take the background — the in-app flow is what's covered.
import { useEffect, useState } from 'react';

export const STORE_SPACE_VIDEO = '/videos/store-space-background.mp4';
export const STORE_SPACE_POSTER = '/videos/store-space-background-poster.jpg';

export default function StoreSpaceBackground() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e) => setReduced(e.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    return undefined;
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#06070d]"
    >
      {/* deep-space base so there's never a white flash before first frame */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#0d1330_0%,#06070d_72%)]" />
      {reduced ? (
        <img
          src={STORE_SPACE_POSTER}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />
      ) : (
        <video
          className="absolute inset-0 h-full w-full object-cover opacity-80"
          src={STORE_SPACE_VIDEO}
          poster={STORE_SPACE_POSTER}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
          tabIndex={-1}
          style={{ transform: 'translateZ(0)' }}
        />
      )}
      {/* legibility veil: keeps card text crisp over bright nebula patches */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/15 to-black/65" />
    </div>
  );
}
