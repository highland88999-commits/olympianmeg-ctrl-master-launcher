'use client';

// components/ChristmasPresents.jsx
//
// Twenty claimable Christmas presents (Merlin, Nov 27, 2026): one
// per user, 1 aether each, server-enforced. Twenty small gift boxes
// ring the tree base — OUTSIDE the tree's hit-proxy sphere, so each
// one is tappable (the layout helper proves the clearance). Tap one
// -> POST /api/seasonal/christmas-present/claim; a claimed present
// dims and goes untappable. Signed-out -> a sign-in toast, no fake
// credit. The aether credit itself is server-side only.
//
// The tree's own decorative presents (lib/seasonal/tree.js
// buildPresents) are untouched — these are the claimable set, and
// they wear the same colours and gold ribbon.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { christmasPresentLayout, PRESENT_RIBBON_COLOR } from '@/lib/seasonal/hub-christmas-fx';
import { EARTH_CENTER, EARTH_RADIUS } from '@/lib/god-orbits';
import { treeSwapPlacement } from '@/lib/seasonal/tree';
import { seasonToast } from './SeasonalDecor';

export default function ChristmasPresents({ built }) {
  const [claimed, setClaimed] = useState(() => new Set());
  const [claiming, setClaiming] = useState(null);
  const pressRef = useRef(null);

  // Which presents this user already collected (server truth).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/seasonal/christmas-presents');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.claimed)) setClaimed(new Set(data.claimed));
      } catch {
        // Offline: presents stay tappable; the claim reports the miss.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { layout, scale } = useMemo(() => {
    const swap = built && built.swap ? built.swap : treeSwapPlacement(EARTH_CENTER, EARTH_RADIUS);
    return {
      scale: swap.scale,
      layout: christmasPresentLayout({
        earthCenter: EARTH_CENTER,
        earthRadius: EARTH_RADIUS,
        scale: swap.scale,
        hitRadius: swap.hitRadius,
      }),
    };
  }, [built]);

  const claim = useCallback(
    async (id) => {
      if (claimed.has(id) || claiming) return;
      setClaiming(id);
      try {
        const res = await fetch('/api/seasonal/christmas-present/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ presentId: id }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          seasonToast('Sign in to collect your present');
          return;
        }
        if (res.status === 503 && data.setupRequired) {
          seasonToast('Presents open soon — the gift list is still being wrapped');
          return;
        }
        if (!res.ok) {
          seasonToast(data.error || 'That present would not open — try again');
          return;
        }
        setClaimed((prev) => new Set(prev).add(id));
        if (data.credited) seasonToast('+1 aether — Merry Christmas!');
      } catch {
        seasonToast('No connection — your present is still waiting');
      } finally {
        setClaiming(null);
      }
    },
    [claimed, claiming]
  );

  return (
    <group>
      {layout.map((p) => {
        const s = p.size * scale;
        const h = s * 0.8;
        const isClaimed = claimed.has(p.id);
        const isClaiming = claiming === p.id;
        return (
          <group
            key={p.id}
            position={p.position}
            rotation={[0, p.rotationY, 0]}
            scale={isClaimed ? 0.85 : 1}
          >
            <mesh>
              <boxGeometry args={[s, h, s]} />
              <meshStandardMaterial
                color={p.color}
                roughness={0.6}
                transparent={isClaimed}
                opacity={isClaimed ? 0.35 : 1}
              />
            </mesh>
            {/* Gold ribbon crossing over the top, and a bow. */}
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[s * 0.14, h * 1.02, s * 1.02]} />
              <meshStandardMaterial color={PRESENT_RIBBON_COLOR} metalness={0.6} roughness={0.35} transparent={isClaimed} opacity={isClaimed ? 0.35 : 1} />
            </mesh>
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[s * 1.02, h * 1.02, s * 0.14]} />
              <meshStandardMaterial color={PRESENT_RIBBON_COLOR} metalness={0.6} roughness={0.35} transparent={isClaimed} opacity={isClaimed ? 0.35 : 1} />
            </mesh>
            <mesh position={[0, h / 2 + s * 0.1, 0]}>
              <sphereGeometry args={[s * 0.16, 12, 12]} />
              <meshStandardMaterial color={PRESENT_RIBBON_COLOR} metalness={0.7} roughness={0.3} transparent={isClaimed} opacity={isClaimed ? 0.35 : 1} />
            </mesh>
            {/* Fat invisible hit target (opacity 0, NOT visible=false —
                r3f skips invisible objects in raycasts). Tap, not drag:
                ignore releases more than 8px from the press point, the
                same guard the tree uses. stopPropagation so the tap
                does not also open the Earth menu behind it. */}
            {!isClaimed && (
              <mesh
                onPointerDown={(e) => {
                  pressRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  const press = pressRef.current;
                  const ne = e.nativeEvent;
                  if (press && ne && Math.max(Math.abs(ne.clientX - press.x), Math.abs(ne.clientY - press.y)) > 8) return;
                  if (!isClaiming) claim(p.id);
                }}
              >
                <sphereGeometry args={[s * 0.95, 8, 8]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}
