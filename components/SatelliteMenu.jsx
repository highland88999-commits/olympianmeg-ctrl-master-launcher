'use client';

import { useState } from 'react';
import { GOD_MENUS } from '@/lib/god-menus';
import { FLOORS } from '@/lib/babel/floors';
import { fx } from '@/lib/fx';

/**
 * SatelliteMenu — two-axis slidable program menu, Hermes-style.
 *
 * - CATEGORIES ride a horizontal slider rail across the top (swipe/scroll).
 * - ITEMS for the selected category scroll vertically beneath it.
 * - Tapping a satellite slides its programs open with the Hermes drawer
 *   motion: max-height 0 → open on an expo-out curve
 *   (cubic-bezier(0.19, 1, 0.22, 1), 0.6s), padding easing with it.
 * - The whole thing lives INSIDE the menu window opened by the floating
 *   button — the slider is anchored to that frame, never a full-screen
 *   takeover or a detached edge drawer.
 * - Launching still goes through the single menu-to-satellite function
 *   passed in as onLaunch (the parent's launchPocketUniverse).
 *
 * BABEL appears like any other satellite — its programs list the tower's
 * floors (pocket universes) from lib/babel/floors.
 */

// Hermes expo-out — the exact curve from Merlin's Hermes landing drawer.
const HERMES_EASE = 'cubic-bezier(0.19, 1, 0.22, 1)';

function programsFor(key, sat, t) {
  const title = t(`sat.${key}.title`);
  const subtitle = t(`sat.${key}.subtitle`);
  if (key === 'babel') {
    return {
      title,
      subtitle,
      programs: FLOORS.map((f) => ({
        key: `babel-floor-${f.id}`,
        name: f.name,
        sub: f.subtitle,
        route: f.kind === 'route' ? f.route : `/babel?floor=${f.id}`,
      })),
    };
  }
  return {
    title,
    subtitle,
    programs: [
      {
        key: `${key}-program`,
        name: `Enter ${title}`,
        sub: subtitle,
        route: sat.route,
      },
    ],
  };
}

export default function SatelliteMenu({ t, satIndex, onLaunch }) {
  const [activeGod, setActiveGod] = useState(GOD_MENUS[0].god);
  const [openSat, setOpenSat] = useState(null);

  const menu = GOD_MENUS.find((m) => m.god === activeGod) || GOD_MENUS[0];

  const selectGod = (god) => {
    if (god === activeGod) return;
    fx.menuOpen();
    setActiveGod(god);
    setOpenSat(null);
  };

  const toggle = (key) => {
    if (openSat === key) {
      fx.menuClose();
      setOpenSat(null);
    } else {
      fx.menuOpen();
      setOpenSat(key);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <style>{`
        @keyframes satmenu-enter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .satmenu-enter { animation: satmenu-enter 0.45s ${HERMES_EASE}; }
        @media (prefers-reduced-motion: reduce) {
          .satmenu-enter { animation: none; }
        }
      `}</style>

      {/* Category rail — horizontal slider. Sticky so it stays pinned at the
          top of the menu window while the items slide vertically beneath. */}
      <div
        role="tablist"
        aria-label="Program categories"
        className="custom-scrollbar sticky top-0 z-10 -mx-1 flex shrink-0 snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth bg-zinc-950/95 px-1 pb-3 backdrop-blur-md"
      >
        {GOD_MENUS.map((m) => {
          const active = m.god === activeGod;
          return (
            <button
              key={m.god}
              role="tab"
              aria-selected={active}
              onClick={() => selectGod(m.god)}
              className={`flex min-h-[44px] shrink-0 snap-start flex-col justify-center rounded-xl border px-4 py-2 text-left transition-all motion-reduce:transition-none ${
                active
                  ? 'border-cyan-400/60 bg-cyan-400/10'
                  : 'border-zinc-800 bg-black/60 hover:border-zinc-600'
              }`}
            >
              <span
                className={`text-[11px] font-black tracking-[0.2em] uppercase ${
                  active ? 'text-cyan-200' : 'text-zinc-300'
                }`}
              >
                {m.god}
              </span>
              <span className="mt-0.5 max-w-[140px] truncate text-[10px] text-zinc-500">
                {m.category}
              </span>
            </button>
          );
        })}
      </div>

      {/* Items — vertical list beneath the rail, inside the menu window. */}
      <div
        key={menu.god}
        role="tabpanel"
        aria-label={`${menu.god} programs`}
        className="custom-scrollbar satmenu-enter min-h-0 flex-1 overflow-y-auto px-1 pb-10"
      >
        <p className="px-1 pb-3 text-[11px] leading-relaxed text-zinc-500">
          {menu.tagline}
        </p>
        <div className="flex flex-col gap-2">
          {menu.satellites.map((key) => {
            const sat = satIndex.get(key);
            if (!sat) return null;
            const open = openSat === key;
            const { title, subtitle, programs } = programsFor(key, sat, t);
            return (
              <div
                key={key}
                className="overflow-hidden rounded-xl border border-zinc-800 bg-black/60"
              >
                <button
                  onClick={() => toggle(key)}
                  aria-expanded={open}
                  className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors motion-reduce:transition-none hover:bg-zinc-900/60"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-black uppercase tracking-widest text-white">
                      {title}
                    </span>
                    <span className="mt-0.5 truncate text-[10px] uppercase text-zinc-500">
                      {subtitle}
                    </span>
                  </span>
                  <span
                    className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] text-zinc-400 uppercase"
                    aria-hidden="true"
                  >
                    Deploy {open ? '▾' : '▸'}
                  </span>
                </button>
                {/* Hermes slider: the programs panel lives just inside the
                    satellite's frame and slides open on the expo-out curve. */}
                <div
                  className={`overflow-hidden transition-[max-height,padding] duration-700 motion-reduce:transition-none ${
                    open ? 'max-h-[640px]' : 'max-h-0'
                  }`}
                  style={{ transitionTimingFunction: HERMES_EASE }}
                >
                  <div
                    className={`flex flex-col gap-1.5 border-t border-zinc-800/70 bg-black/40 px-3 transition-[padding] duration-700 motion-reduce:transition-none ${
                      open ? 'py-2' : 'py-0'
                    }`}
                    style={{ transitionTimingFunction: HERMES_EASE }}
                  >
                    {programs.map((p) => (
                      <button
                        key={p.key}
                        tabIndex={open ? 0 : -1}
                        onClick={() => onLaunch(p.route, key, sat.pos)}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-left transition-all motion-reduce:transition-none hover:border-cyan-500/40 hover:bg-zinc-900"
                      >
                        <span className="block text-[13px] font-bold text-zinc-100">
                          {p.name}
                        </span>
                        {p.sub ? (
                          <span className="mt-0.5 block text-[10px] text-zinc-500">
                            {p.sub}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
