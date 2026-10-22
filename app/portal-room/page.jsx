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
//
// The roster is built from the satellite registry + the en dictionary —
// the same sources the hub menu renders — deduped by route, so the room
// can never drift from the menu. Portal videos are produced through the
// Omega Portal Videos queue and land at /videos/portals/<key>.mp4; a
// portal without a video yet shows the living swirl, never a gap.

import { BackButton } from '@/components/ui';
import { SATELLITES } from '@/lib/i18n/satellites';
import en from '@/lib/i18n/locales/en.json';
import PortalRoom from '@/components/portal-room/PortalRoom';

export const metadata = {
  title: 'Portal Room — Olympus',
  description:
    'Every realm in Olympus, one room of portals. Step through the Omega Arch and choose your world.',
};

const PROGRAMS = (() => {
  const seen = new Set();
  const list = [];
  for (const sat of SATELLITES) {
    if (sat.key === 'portal-room') continue; // the room does not portal to itself
    if (seen.has(sat.route)) continue;
    seen.add(sat.route);
    list.push({
      key: sat.key,
      route: sat.route,
      section: sat.section,
      title: en[`sat.${sat.key}.title`] || sat.key,
      subtitle: en[`sat.${sat.key}.subtitle`] || '',
    });
  }
  return list;
})();

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
        <PortalRoom programs={PROGRAMS} />
      </div>
    </main>
  );
}
