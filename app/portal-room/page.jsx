// app/portal-room/page.jsx
// THE PORTAL ROOM — one labeled portal for every program in the menu,
// each playing its own video, each a door into that realm.
//
// Entry points (Merlin: "more than one entry point is the idea"):
//   1. The Omega Arch in hub space, just beyond the Sun — click it or
//      fly through it (components/OmegaHubGate.jsx).
//   2. The portal menu: this room is itself a registered satellite
//      (key "portal-room", claimed by HERMES in lib/god-menus.js).
//   3. This page directly: olympusverse.com/portal-room.
//   4. The Concourse's Portals 3D tile — the same roster as a wall of
//      3D portals, minimized until expanded (components/
//      ConcoursePortals.jsx).
//
// The roster is built from the satellite registry + the en dictionary
// — the same sources the hub menu renders — deduped by route, so the
// room can never drift from the menu. The derivation itself lives in
// lib/portal-roster.js (buildPortalRoster), shared with the
// Concourse panel: one roster, every surface. Portal videos are
// produced through the Omega Portal Videos queue and land at
// /videos/portals/<key>.mp4; a portal without a video yet shows the
// living swirl, never a gap.

import { BackButton } from '@/components/ui';
import CheatCodeFeatured from '@/components/CheatCodeFeatured';
import { SATELLITES } from '@/lib/i18n/satellites';
import en from '@/lib/i18n/locales/en.json';
import { buildPortalRoster } from '@/lib/portal-roster';
import PortalRoomGate from '@/components/portal-room/PortalRoomGate';
import { FintracExplanationMenuButton } from '@/components/FintracExplanation';

export const metadata = {
  title: 'Portal Room — Olympus',
  description:
    'Every realm in Olympus, one room of portals. Step through the Omega Arch and choose your world.',
};

const PROGRAMS = buildPortalRoster(
  SATELLITES,
  (key) => en[`sat.${key}.title`],
  (key) => en[`sat.${key}.subtitle`]
);

export default function PortalRoomPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050310] text-zinc-100">
      {/* Deep-space wash: violet nebula over near-black, gold at the crown. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(1100px 480px at 50% -120px, rgba(255,176,66,0.13), transparent 60%), radial-gradient(900px 620px at 85% 18%, rgba(88,60,220,0.16), transparent 62%), radial-gradient(760px 560px at 12% 30%, rgba(0,180,220,0.10), transparent 60%)',
        }}
      />
      <div className="relative">
        <div className="mx-auto w-full max-w-6xl px-4 pt-4">
          <BackButton />
        </div>
        {/* FINTRAC explanation entry (Merlin, 2026-10-26) — page
            chrome ABOVE the roster, never a roster row: the roster
            is derived from the satellite registry and must stay
            program-only, or the room would drift from the menu. */}
        <div className="mx-auto w-full max-w-6xl px-4 pt-4">
          <FintracExplanationMenuButton />
        </div>
        {/* FEATURED — the Social Media Cheat Code room sits above
            the roster (Merlin, 2026-10-26: featured on every
            portal entry point), never buried as an ordinary card:
            the roster below stays program-only, derived from the
            registry, so the room can never drift from the menu. */}
        <div className="mx-auto w-full max-w-6xl px-4 pt-4">
          <CheatCodeFeatured />
        </div>
        {/* The gate appends the owner-only portals (Earth 2) when the
            signed-in session is the owner's; the base roster above is
            what everyone else sees, unchanged. */}
        <PortalRoomGate basePrograms={PROGRAMS} />
      </div>
    </main>
  );
}
