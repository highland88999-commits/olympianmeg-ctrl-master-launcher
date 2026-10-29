'use client';

import { useEffect, useState } from 'react';
import { getEarthSyncStatus } from '@/lib/earth/sync-status';

// One-line sync readout for the Earth console's pinned header.
// Plain words: what the mapped-coverage sync did last, how many
// cells this device has marked, and whether anything is waiting
// to send. Re-reads every 2 seconds; never throws.
function describe(s) {
  const cells = `${s.cells} cell${s.cells === 1 ? '' : 's'} marked`;
  const ago = s.lastBeat ? ` · ${Math.max(0, Math.round((Date.now() - s.lastBeat) / 1000))}s ago` : '';
  const waiting = s.dirty ? ' · waiting to send' : '';
  if (!s.lastBeat) return `SYNC idle · ${cells}`;
  if (s.lastHttp === 'no-token') return `SYNC no sign-in token · ${cells}${waiting}`;
  if (s.lastHttp === 'network') return `SYNC network failed · ${cells}${waiting}${ago}`;
  if (s.lastOk) return `SYNC ok · ${cells}${ago}`;
  return `SYNC server ${s.lastHttp} · ${cells}${waiting}${ago}`;
}

export default function EarthSyncLine() {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 2000);
    return () => clearInterval(id);
  }, []);
  let text = 'SYNC idle · 0 cells marked';
  try {
    text = describe(getEarthSyncStatus());
  } catch {}
  return (
    <div className="text-[10px] text-zinc-500 mt-1 truncate" title="Mapped-coverage sync status">
      {text}
    </div>
  );
}
