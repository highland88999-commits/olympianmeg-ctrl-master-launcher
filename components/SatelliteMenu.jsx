'use client';

import { useState } from 'react';
import { GOD_MENUS } from '@/lib/god-menus';
import { FLOORS } from '@/lib/babel/floors';
import { fx } from '@/lib/fx';

/**
 * SatelliteMenu — "Select your satellites."
 *
 * The classic satellite menu: every satellite is a row. Tapping a row opens
 * a dropdown of the programming inside that satellite; tapping a program
 * launches it through the one menu-to-satellite function passed in as
 * onLaunch (the parent's launchPocketUniverse).
 *
 * BABEL appears like any other satellite — its dropdown lists the tower's
 * floors (pocket universes) from lib/babel/floors. Every other satellite's
 * programming is the program itself.
 */
export default function SatelliteMenu({ t, satIndex, onLaunch }) {
  const [openSat, setOpenSat] = useState(null);

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
    <div className="flex flex-col gap-5 pb-10">
      {GOD_MENUS.map((menu) => (
        <div key={menu.god} className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2 border-b border-zinc-800 pb-1">
            <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase">
              {menu.god}
            </span>
            <span className="text-[10px] text-zinc-600">{menu.category}</span>
          </div>
          {menu.satellites.map((key) => {
            const sat = satIndex.get(key);
            if (!sat) return null;
            const open = openSat === key;
            const title = t(`sat.${key}.title`);
            const subtitle = t(`sat.${key}.subtitle`);
            const isBabel = key === 'babel';
            // The programming inside this satellite.
            const programs = isBabel
              ? FLOORS.map((f) => ({
                  key: `babel-floor-${f.id}`,
                  name: f.name,
                  sub: f.subtitle,
                  route: f.kind === 'route' ? f.route : `/babel?floor=${f.id}`,
                }))
              : [
                  {
                    key: `${key}-program`,
                    name: `Enter ${title}`,
                    sub: subtitle,
                    route: sat.route,
                  },
                ];
            return (
              <div
                key={key}
                className="rounded-xl border border-zinc-800 bg-black/60 overflow-hidden"
              >
                <button
                  onClick={() => toggle(key)}
                  aria-expanded={open}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 min-h-[44px] text-left hover:bg-zinc-900/60 transition-all"
                >
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm font-black text-white tracking-widest uppercase truncate">
                      {title}
                    </span>
                    <span className="text-[10px] text-zinc-500 uppercase mt-0.5 truncate">
                      {subtitle}
                    </span>
                  </span>
                  <span className="text-zinc-500 text-xs shrink-0" aria-hidden="true">
                    {open ? '▾' : '▸'}
                  </span>
                </button>
                {open && (
                  <div className="border-t border-zinc-800/70 px-3 py-2 flex flex-col gap-1.5 bg-black/40">
                    {programs.map((p) => (
                      <button
                        key={p.key}
                        onClick={() => onLaunch(p.route, key, sat.pos)}
                        className="w-full text-left px-4 py-3 min-h-[44px] rounded-lg bg-zinc-900/60 border border-zinc-800 hover:border-cyan-500/40 hover:bg-zinc-900 transition-all"
                      >
                        <span className="block text-[13px] font-bold text-zinc-100">
                          {p.name}
                        </span>
                        {p.sub ? (
                          <span className="block text-[10px] text-zinc-500 mt-0.5">
                            {p.sub}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
