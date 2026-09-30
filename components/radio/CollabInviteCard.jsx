// components/radio/CollabInviteCard.jsx
// One-time, dismissible invite to collaborate on the station playlist.
// Shown during the user's first-load session only (see RadioProvider's
// showCollabInvite) and never again once dismissed — no nagging.
//
// Honesty: playlist collaboration itself happens through Spotify's own
// invite-collaborators flow — Merlin flips that toggle himself in the
// Spotify app and approves collaborators there. This card only points at
// the playlist; it never claims the app can grant access.

'use client';

import { ExternalLink, Users, X } from 'lucide-react';
import { useRadio } from './RadioProvider';
import { STATION } from '@/lib/radio/station';

export default function CollabInviteCard() {
  const { showCollabInvite, dismissCollabInvite } = useRadio();
  if (!showCollabInvite) return null;

  return (
    <div
      className="mx-3 mt-2 rounded-xl border border-teal-300/25 bg-teal-300/5 px-4 py-3"
      role="note"
      aria-label="Invitation to collaborate on the station playlist"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-300/15">
          <Users size={15} className="text-teal-300" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white">Make the station yours</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-white/65">
            This station is contributable — pocket universes and listeners add
            tracks, and Merlin&apos;s original ten always stay put. Want in?
            Open the playlist on Spotify and ask to collaborate; Merlin
            approves collaborators there.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <a
              href={STATION.openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-teal-300 px-3.5 py-2 text-[12px] font-semibold text-black transition-opacity motion-reduce:transition-none hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <ExternalLink size={13} aria-hidden="true" /> Open the playlist
            </a>
            <button
              type="button"
              onClick={dismissCollabInvite}
              className="rounded-lg px-3 py-2 text-[12px] font-medium text-white/60 transition-colors motion-reduce:transition-none hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismissCollabInvite}
          aria-label="Dismiss the collaborate invitation"
          title="Dismiss"
          className="shrink-0 rounded-full p-1.5 text-white/50 transition-colors motion-reduce:transition-none hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
