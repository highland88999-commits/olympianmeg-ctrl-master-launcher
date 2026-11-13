// components/PortalGunCard.jsx — THE PORTAL GUN, in the backpack
// (Merlin, Nov 13, 2026).
//
// Earned at 10 portals entered; it lives in the backpack and is
// usable from anywhere the backpack lives — the profile pack and
// every realm's pack panel both mount this card. Firing it opens
// the portal room (side 'gun'): every realm on demand, heaven
// light and hell fire as one gradient, the same horizontal
// scrolling holographic system as the upper and lower portals.
//
// Before it is earned the card shows the count honestly —
// "7 / 10 portals" — never a fake gun.

'use client';

import { useState } from 'react';
import { useBackpack } from '@/lib/backpack/store';
import { portalsToGun, usePortalProgress } from '@/lib/portal/progress';
import { hasPortalGun } from '@/lib/portal/gun';
import PortalRoom from './PortalRoom';

export default function PortalGunCard({ onClosePanel }) {
  const record = useBackpack();
  const progress = usePortalProgress();
  const [roomOpen, setRoomOpen] = useState(false);
  const held = hasPortalGun(record);
  const toGo = portalsToGun(progress);

  const fire = () => {
    if (onClosePanel) onClosePanel();
    setRoomOpen(true);
  };

  return (
    <>
      <div
        style={{
          fontSize: 13, marginTop: 10, padding: '0.5rem 0.7rem', borderRadius: 10,
          background: 'rgba(192,132,252,0.10)', border: '1px solid rgba(192,132,252,0.35)',
        }}
      >
        <div style={{ fontWeight: 700 }}>🔫 Portal Gun</div>
        {held ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <span style={{ opacity: 0.85 }}>Every realm, on demand — heaven light and hell fire, one portal.</span>
            <button
              type="button"
              onClick={fire}
              style={{
                background: '#c084fc', color: '#1a1026', border: 'none', borderRadius: 999,
                padding: '0.25rem 0.9rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0,
              }}
            >
              Fire
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 2, opacity: 0.85 }}>
            {progress.totalPortals} / 10 portals entered — {toGo} more to earn it.
          </div>
        )}
      </div>
      <PortalRoom side="gun" open={roomOpen} onClose={() => setRoomOpen(false)} />
    </>
  );
}
