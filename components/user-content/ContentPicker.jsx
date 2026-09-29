// components/user-content/ContentPicker.jsx
//
// "Use one of your uploads" — the plain-English picker for the universal
// user-content pool. Lets the user explicitly pick one of their own uploads
// for a program that accepts that media type.
//
// Props:
//   accept   — array of content types, e.g. ['audio'] or ['image','video']
//   onSelect — (item) => void, called with the chosen pool item
//   onClose  — () => void
//
// Privacy: picking here is an EXPLICIT user action — that is what makes a
// share allowed. The picker never auto-selects anything and never shares
// into multiplayer surfaces; callers decide what the selection means.
//
// Plain-English labels. Mobile-friendly (44px targets). Scrolls with Safari
// bottom-bar clearance. Reduced motion respected.

'use client';

import { useMemo } from 'react';
import { getPool, listByType, persistPool } from '@/lib/user-content/pool';
import { seedStationInto } from '@/lib/user-content/station-seed';
import { describeSyncState } from '@/lib/user-content/sync';
import { CONTENT_TYPES } from '@/lib/user-content/types';

const TYPE_LABELS = {
  image: 'Photos',
  video: 'Videos',
  audio: 'Audio',
  playlist: 'Playlists',
};

const ORIGIN_LABELS = {
  profile: 'your profile gallery',
  persephone: 'PERSEPHONE',
  radio: 'your radio station',
  redwater: 'Redwater drive-in',
};

function originLabel(originProgram) {
  return ORIGIN_LABELS[originProgram] || originProgram || 'your uploads';
}

export default function ContentPicker({ accept, onSelect, onClose }) {
  const wanted = useMemo(() => {
    const list = Array.isArray(accept) ? accept : [];
    return CONTENT_TYPES.filter((t) => list.includes(t));
  }, [accept]);

  // Make sure the radio station seeds are available to pick — seeding is
  // idempotent, so this is safe on every open.
  const sections = useMemo(() => {
    const pool = getPool();
    seedStationInto(pool);
    persistPool();
    return wanted.map((type) => ({
      type,
      label: TYPE_LABELS[type] || type,
      items: listByType(pool, type),
    }));
  }, [wanted]);

  const total = sections.reduce((n, s) => n + s.items.length, 0);

  function choose(item) {
    if (typeof onSelect === 'function') onSelect(item);
  }

  return (
    <div
      className="ucp fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Use one of your uploads"
      onClick={(e) => { if (e.target === e.currentTarget && typeof onClose === 'function') onClose(); }}
    >
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .ucp * { transition: none !important; animation: none !important; }
        }
      `}</style>

      <div className="w-full max-w-lg max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-3xl border border-white/15 bg-[#101018] px-5 pt-5 pb-28 [padding-bottom:calc(7rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-neutral-100">Use one of your uploads</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] rounded-full border border-white/15 text-neutral-300 hover:bg-white/10 motion-safe:transition"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-sm text-neutral-400">
          Pick something you already uploaded — it stays yours until you decide otherwise.
        </p>

        {total === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-white/15 px-5 py-10 text-center">
            <p className="text-neutral-300">You haven&apos;t uploaded anything of this type yet.</p>
            <p className="mt-2 text-sm text-neutral-500">
              Uploads you add in the launcher will show up here automatically.
            </p>
          </div>
        ) : (
          sections.map((section) => section.items.length > 0 && (
            <div key={section.type} className="mt-6">
              <h3 className="text-xs uppercase tracking-[0.25em] text-neutral-500">{section.label}</h3>
              <ul className="mt-2 space-y-2">
                {section.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => choose(item)}
                      className="w-full min-h-[56px] rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:border-cyan-300/50 hover:bg-white/10 motion-safe:transition"
                    >
                      <p className="text-neutral-100 truncate">{item.title || 'Untitled'}</p>
                      <p className="mt-0.5 text-xs text-neutral-500 truncate">
                        From {originLabel(item.originProgram)}
                        {' · '}
                        {describeSyncState(item.syncState)}
                        {item.type === 'audio' && item.remoteUrl && !item.blobRef ? ' · opens in Spotify' : ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full min-h-[48px] rounded-xl border border-white/15 text-neutral-300 hover:bg-white/10 motion-safe:transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
