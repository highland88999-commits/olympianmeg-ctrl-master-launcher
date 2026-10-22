'use client';

// PortalRoom — the room of portals behind the Omega Arch.
//
// One portal for every program in the menu (the list arrives from the
// server page, built from the same satellite registry the hub menu
// reads). Each portal is an arch-shaped frame labeled UNDERNEATH with
// its program, per Merlin's spec. A portal plays its own looping video
// (/videos/portals/<key>.mp4, produced through the Omega Portal Videos
// queue); a portal whose video has not arrived yet turns with a living
// violet swirl instead — never a broken frame. Videos load lazily as
// they approach the screen and pause when they leave it, so the whole
// hall stays light on a phone.
//
// Entering is a step-through: tap a portal and the view rushes into it
// (a short zoom through the vortex), then the realm's own page opens.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { OMEGA_VORTEX_VIDEO, OMEGA_WRAP_VIDEO } from '@/lib/omega-arch';

const SECTION_ORDER = [
  'SANCTUM',
  'GAMES',
  'OBSERVATORY',
  'AI PROGRAMS',
  'TOOLS',
  'UTILITIES',
  'THERAPY',
  'WISDOM',
  'SHOPPING',
];

function PortalCard({ program, onEnter }) {
  const frameRef = useRef(null);
  const videoRef = useRef(null);
  const [failed, setFailed] = useState(false);

  // Lazy video: only fetch/play when the portal nears the screen; pause
  // when it leaves, so 165 portals never stream at once.
  useEffect(() => {
    const frame = frameRef.current;
    const video = videoRef.current;
    if (!frame || !video || failed) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (!video.src) video.src = `/videos/portals/${program.key}.mp4`;
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { rootMargin: '320px 0px' }
    );
    io.observe(frame);
    return () => io.disconnect();
  }, [failed, program.key]);

  return (
    <button
      type="button"
      onClick={() => onEnter(program)}
      className="group block w-full text-left focus:outline-none"
      aria-label={`Enter ${program.title}`}
    >
      <div
        ref={frameRef}
        className="portal-arch relative aspect-[3/4] w-full overflow-hidden border border-cyan-300/25 bg-[#0a0618] shadow-[0_0_24px_rgba(80,60,220,0.25)] transition duration-300 group-hover:border-amber-300/60 group-hover:shadow-[0_0_36px_rgba(255,180,60,0.35)] group-focus-visible:border-amber-300/80"
      >
        {!failed ? (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            muted
            loop
            playsInline
            preload="none"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="portal-swirl absolute inset-0" aria-hidden="true">
            <span className="absolute inset-0 flex items-center justify-center text-6xl text-amber-200/70">
              Ω
            </span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/45" />
      </div>
      {/* The label lives under the portal, as specced. */}
      <div className="px-1 pt-2.5 pb-1 text-center">
        <div className="truncate text-[15px] font-semibold tracking-wide text-zinc-100">
          {program.title}
        </div>
        {program.subtitle ? (
          <div className="truncate text-xs text-zinc-400">{program.subtitle}</div>
        ) : null}
      </div>
    </button>
  );
}

export default function PortalRoom({ programs }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [section, setSection] = useState('ALL');
  const [entering, setEntering] = useState(null);
  const timerRef = useRef(null);

  const counts = useMemo(() => {
    const map = new Map();
    programs.forEach((p) => map.set(p.section, (map.get(p.section) || 0) + 1));
    return map;
  }, [programs]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return programs.filter((p) => {
      if (section !== 'ALL' && p.section !== section) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        (p.subtitle || '').toLowerCase().includes(q) ||
        p.key.toLowerCase().includes(q)
      );
    });
  }, [programs, query, section]);

  const grouped = useMemo(() => {
    const bySection = new Map();
    visible.forEach((p) => {
      if (!bySection.has(p.section)) bySection.set(p.section, []);
      bySection.get(p.section).push(p);
    });
    return SECTION_ORDER.filter((s) => bySection.has(s)).map((s) => ({
      section: s,
      items: bySection.get(s),
    }));
  }, [visible]);

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
    timerRef.current = setTimeout(() => router.push(program.route), 460);
  };

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24">
      <style>{`
        .portal-arch { border-radius: 999px 999px 22px 22px; }
        .portal-swirl {
          background:
            radial-gradient(circle at 50% 62%, rgba(0,229,255,0.20), transparent 55%),
            conic-gradient(from 0deg at 50% 55%, #160b33, #3b1d78, #0d2a4a, #6d28d9, #160b33);
          animation: portal-spin 14s linear infinite;
        }
        @keyframes portal-spin { to { transform: rotate(360deg); } }
        .portal-enter { animation: portal-zoom 0.46s ease-in forwards; }
        @keyframes portal-zoom {
          0% { opacity: 0; transform: scale(0.82); }
          18% { opacity: 1; }
          100% { opacity: 1; transform: scale(1.9); }
        }
      `}</style>

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

      {/* Step-through rush: the vortex swallows the screen, then the
          realm's own page opens. */}
      {entering ? (
        <div className="fixed inset-0 z-[90] overflow-hidden bg-black">
          <video
            className="portal-enter absolute inset-0 h-full w-full object-cover"
            src={OMEGA_VORTEX_VIDEO}
            autoPlay
            muted
            loop
            playsInline
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl text-amber-200 drop-shadow-[0_0_18px_rgba(255,190,80,0.9)]">
                Ω
              </div>
              <div className="mt-3 text-sm tracking-[0.3em] text-zinc-100">
                {entering.title.toUpperCase()}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
