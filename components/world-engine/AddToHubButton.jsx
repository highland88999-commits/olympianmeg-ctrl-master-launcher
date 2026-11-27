// Add to Hub button (Merlin, Nov 27, 2026 — Part 14).
//
// ONE shared button for every place the World Engine lives: clicking
// it SENDS the item straight to the hub — onto the orbit rings under
// the Part 13 placement rules (lib/hub-orbit-rings.js: its distance
// decides its ring; a full ring spawns the next ring outward). No
// intermediate step, no extra dialog.
//
// Style is the Part 12 unified style (components/DialogUnified
// .module.css `.btn`): see-through, silver text and border. Layout
// utilities (padding, size, tracking) come from the caller's
// className; the module owns fill/border/text colour.
//
// `item`: { id, kind|category, name?, center?, source? } — the id is
// the dedup key: an item already on the hub shows "On the hub" and
// is never added twice.
'use client';

import { useEffect, useState } from 'react';
import dialogStyles from '@/components/DialogUnified.module.css';
import { addItemToHub, hubOrbitItemFor } from '@/lib/hub-orbit-rings';

export default function AddToHubButton({ item, className }) {
  const [status, setStatus] = useState(null); // null | { onHub, ringIndex, spawnedNewRing }

  const itemId = item && item.id ? String(item.id) : '';

  useEffect(() => {
    if (!itemId) { setStatus(null); return; }
    const found = hubOrbitItemFor(itemId);
    setStatus(found ? { onHub: true, ringIndex: found.ringIndex, spawnedNewRing: false } : null);
  }, [itemId]);

  const handleClick = () => {
    if (!item || !itemId) return;
    const result = addItemToHub(item);
    if (result.placed) {
      setStatus({
        onHub: true,
        ringIndex: result.placed.ringIndex,
        spawnedNewRing: result.added && result.spawnedNewRing,
      });
    }
  };

  const onHub = !!(status && status.onHub);
  const label = onHub
    ? 'On the hub · Ring ' + status.ringIndex + (status.spawnedNewRing ? ' — new ring made' : '')
    : 'Add to Hub';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={onHub || !itemId}
      title={onHub ? 'This creation is on the hub\u2019s orbit rings.' : 'Send this creation to the hub\u2019s orbit rings.'}
      className={(dialogStyles.btn || '') + ' ' + (className || '')}
    >
      {label}
    </button>
  );
}
