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

import { useEffect, useState } from 'react';
import { updateBackpack, useBackpack } from '@/lib/backpack/store';
import { portalGunEarned, portalsToGun, usePortalProgress } from '@/lib/portal/progress';
import { hasForgedPortalGunEntry, hasPortalGun, healForgedPortalGun, maybeAwardPortalGun } from '@/lib/portal/gun';
import PortalRoom from './PortalRoom';

export default function PortalGunCard({ onClosePanel }) {
  const record = useBackpack();
  const progress = usePortalProgress();
  const [roomOpen, setRoomOpen] = useState(false);
  const held = hasPortalGun(record);
  const toGo = portalsToGun(progress);

  // Catch-up (Merlin, Nov 15): the gun was only awarded on the exact
  // crossing edge inside a PortalRoom entry. A count that reaches 10
  // any other way — entries from before the gun shipped, progress
  // restored from another device — left the card at "10 / 10, 0 more"
  // with no gun and nothing ever catching up. If the count says earned
  // and the pack does not hold the gun, grant it now. Idempotent:
  // maybeAwardPortalGun returns the same record when already held,
  // so the effect no-ops once the gun lands.
  useEffect(() => {
    if (portalGunEarned(progress) && !held) {
      updateBackpack((rec) => maybeAwardPortalGun(rec, progress));
    }
  }, [progress, held]);

  // Heal (Merlin, Nov 15): a Portal Gun forged through the forge
  // landed in the pack as a generic timestamp-id weapon, so the
  // card above stayed on the "N / 10 portals" branch even though
  // its owner holds the gun. Re-id that entry to 'portal-gun' the
  // moment this card mounts — the profile pack and every realm's
  // pack panel both mount it, so the heal runs everywhere the
  // backpack lives, with no portal count needed. Idempotent:
  // healForgedPortalGun returns the same record when there is
  // nothing to heal, and the guard below keeps the write from
  // firing at all once the gun is held.
  const needsHeal = !held && hasForgedPortalGunEntry(record);
  useEffect(() => {
    if (needsHeal) {
      updateBackpack((rec) => healForgedPortalGun(rec));
    }
  }, [needsHeal]);

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
