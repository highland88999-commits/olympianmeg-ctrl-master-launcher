'use client';

// PortalRoom — the room of portals behind the Omega Arch.
//
// One portal for every program in the menu (the list arrives from the
// server page, built from the same satellite registry the hub menu
// reads — via lib/portal-roster.js, the one derivation every portal
// surface shares). Each portal is an arch-shaped frame labeled
// UNDERNEATH with its program, per Merlin's spec. A portal plays its
// own looping video (/videos/portals/<key>.mp4, produced through the
// Omega Portal Videos queue); a portal whose video has not arrived
// yet turns with a living violet swirl instead — never a broken
// frame. Videos load lazily as they approach the screen and pause
// when they leave it, so the whole hall stays light on a phone.
//
// Entering is a step-through: tap a portal and the view rushes into
// it (a short zoom through the vortex), then the realm's own page
// opens. The card and the step-through live in PortalCard.jsx and
// PortalEnterOverlay.jsx — the Concourse's Portals 3D panel renders
// the same pieces.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { OMEGA_WRAP_VIDEO } from '@/lib/omega-arch';
import { SECTION_ORDER, filterPortals, groupBySection } from '@/lib/portal-roster';
import PortalCard, { PortalStyles } from './PortalCard';
import PortalEnterOverlay from './PortalEnterOverlay';
import { useRiderPrefs } from '@/lib/use-rider-prefs';

export default function PortalRoom({ programs }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [section, setSection] = useState('ALL');
  const [entering, setEntering] = useState(null);
  // Preloaded so the tube ride starts instantly on tap, with the
  // rider's character in front of them in 3rd person.
  const riderPrefs = useRiderPrefs();

  const counts = useMemo(() => {
    const map = new Map();
    programs.forEach((p) => map.set(p.section, (map.get(p.section) || 0) + 1));
    return map;
  }, [programs]);

  const visible = useMemo(
    () => filterPortals(programs, { section, query }),
    [programs, section, query]
  );

  const grouped = useMemo(() => groupBySection(visible), [visible]);

  const enter = (program) => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      router.push(program.route);
      return;
    }
    setEntering(program);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24">
      <PortalStyles />

      {/* The Arch itself, wearing its wrap video — the room's front door. */}
      <div className="mx-auto mt-2 max-w-md">
        <div className="portal-arch relative aspect-[16/10] w-full overflow-hidden border border-amber-300/30 shadow-[0_0_44px_rgba(255,180,60,0.22)]">
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={OMEGA_WRAP_VIDEO}
            autoPlay
            muted
            loop
            playsInline
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/70" />
          <div className="absolute inset-x-0 bottom-3 text-center">
            <div className="text-3xl font-bold tracking-[0.3em] text-amber-200 drop-shadow-[0_0_14px_rgba(255,190,80,0.8)]">
              Ω
            </div>
          </div>
        </div>
        <h1 className="mt-5 text-center text-2xl font-bold tracking-[0.22em] text-zinc-50">
          THE OMEGA ARCH
        </h1>
        <p className="mt-1.5 text-center text-sm tracking-[0.34em] text-cyan-200/80">
          PORTAL ROOM
        </p>
        <p className="mx-auto mt-3 max-w-sm text-center text-sm leading-relaxed text-zinc-400">
          Every realm in Olympus, one room of portals. Tap a portal to step
          through into its world.
        </p>
      </div>

      {/* Find a realm. */}
      <div className="mx-auto mt-8 max-w-xl">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search realms…"
          className="w-full rounded-full border border-white/15 bg-white/5 px-5 py-3 text-[15px] text-zinc-100 placeholder-zinc-500 outline-none backdrop-blur focus:border-cyan-300/50"
        />
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {['ALL', ...SECTION_ORDER.filter((s) => counts.has(s))].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSection(s)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium tracking-wide transition ${
              section === s
                ? 'border-amber-300/70 bg-amber-300/15 text-amber-100'
                : 'border-white/12 bg-white/5 text-zinc-300 hover:border-cyan-300/40'
            }`}
          >
            {s === 'ALL' ? `All · ${programs.length}` : `${s} · ${counts.get(s)}`}
          </button>
        ))}
      </div>

      {/* The hall. */}
      {grouped.length === 0 ? (
        <p className="mt-16 text-center text-zinc-500">
          No realm matches that search yet.
        </p>
      ) : (
        grouped.map(({ section: s, items }) => (
          <section key={s} className="mt-12">
            <h2 className="mb-5 text-center text-sm font-semibold tracking-[0.4em] text-cyan-100/70">
              {s}
            </h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((p) => (
                <PortalCard key={p.key} program={p} onEnter={enter} />
              ))}
            </div>
          </section>
        ))
      )}

      {/* Step-through: the vortex tube ride to the realm, then the
          realm's own page opens. */}
      <PortalEnterOverlay
        program={entering}
        riderPrefs={riderPrefs}
        onDone={() => {
          if (entering) router.push(entering.route);
        }}
      />
    </div>
  );
}
