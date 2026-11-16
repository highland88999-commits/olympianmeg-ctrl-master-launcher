'use client';

import { useState } from 'react';
import { faceVideoUrlForRealm } from '@/lib/portal/portal-face-videos';
import { graphicForRealm } from '@/lib/portal/portal-graphics';

/**
 * PortalFaceVideo — THE VIDEO PORTAL FACE (Merlin, Nov 15 ~22:25).
 *
 * A muted looping video over a portal card's illustrated graphic,
 * in the Portal Room (components/PortalRoom.jsx). The card's own
 * CSS background — the static graphic under the dark scrim — stays
 * underneath as the fallback layer, so:
 *   · while the video loads, the card looks exactly as before;
 *   · when the video is ready, it fades in under the SAME scrim
 *     (the exact portalCardBackground gradients, so the label stays
 *     legible at phone size, no layout change);
 *   · if the video fails to load, this layer unmounts and the card
 *     looks exactly as before.
 * No video for the realm → renders nothing (the static face stays).
 * Swamp Run menu-dressing standard: art on the face, NO layout,
 * label, action, order, or size change anywhere.
 */
export default function PortalFaceVideo({ realmKey, hue }) {
  const url = faceVideoUrlForRealm(realmKey);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  if (!url || failed) return null;
  const h = hue || '#7c3aed';
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden',
        opacity: ready ? 1 : 0, transition: 'opacity 0.6s ease',
      }}
    >
      <video
        src={url}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster={graphicForRealm(realmKey)}
        onError={() => setFailed(true)}
        onLoadedData={() => setReady(true)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {/* Same scrim as portalCardBackground, over the video — the
          label legibility is identical, moving or still. */}
      <span
        style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(rgba(6,8,18,0.62), rgba(6,8,18,0.62)), linear-gradient(165deg, ${h}26 0%, rgba(8,8,16,0.85) 55%)`,
        }}
      />
    </span>
  );
}
