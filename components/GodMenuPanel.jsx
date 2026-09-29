'use client';

import { useState } from 'react';
import { GOD_MENUS } from '@/lib/god-menus';
import { fx } from '@/lib/fx';

// Accent styles per god menu. Kept dim on purpose: light must never drown
// out texture wraps — the banner gradient stays dark, text stays readable.
const ACCENTS = {
  red:    { ring: 'border-red-500/30 hover:border-red-400/60',    name: 'text-red-400',    glow: 'shadow-[0_0_18px_rgba(239,68,68,0.15)]' },
  amber:  { ring: 'border-amber-500/30 hover:border-amber-400/60', name: 'text-amber-400',  glow: 'shadow-[0_0_18px_rgba(245,158,11,0.15)]' },
  sky:    { ring: 'border-sky-500/30 hover:border-sky-400/60',     name: 'text-sky-400',    glow: 'shadow-[0_0_18px_rgba(56,189,248,0.15)]' },
  orange: { ring: 'border-orange-500/30 hover:border-orange-400/60', name: 'text-orange-400', glow: 'shadow-[0_0_18px_rgba(251,146,60,0.15)]' },
  indigo: { ring: 'border-indigo-500/30 hover:border-indigo-400/60', name: 'text-indigo-400', glow: 'shadow-[0_0_18px_rgba(129,140,248,0.15)]' },
  teal:   { ring: 'border-teal-500/30 hover:border-teal-400/60',   name: 'text-teal-400',   glow: 'shadow-[0_0_18px_rgba(45,212,191,0.15)]' },
  yellow: { ring: 'border-yellow-500/30 hover:border-yellow-400/60', name: 'text-yellow-300', glow: 'shadow-[0_0_18px_rgba(253,224,71,0.15)]' },
  purple: { ring: 'border-purple-500/30 hover:border-purple-400/60', name: 'text-purple-400', glow: 'shadow-[0_0_18px_rgba(192,132,252,0.15)]' },
  green:  { ring: 'border-green-500/30 hover:border-green-400/60', name: 'text-green-400',  glow: 'shadow-[0_0_18px_rgba(74,222,128,0.15)]' },
  pink:   { ring: 'border-pink-500/30 hover:border-pink-400/60',   name: 'text-pink-400',   glow: 'shadow-[0_0_18px_rgba(244,114,182,0.15)]' },
};

function MenuBanner({ menu }) {
  const [imgOk, setImgOk] = useState(true);
  const [g0, g1] = menu.gradient;
  return (
    <div
      className="relative h-20 sm:h-24 w-full overflow-hidden rounded-t-xl"
      style={{ background: `linear-gradient(135deg, ${g0}, ${g1})` }}
      aria-hidden="true"
    >
      {menu.texture && imgOk && (
        <img
          src={menu.texture}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-70"
          onError={() => setImgOk(false)}
          loading="lazy"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
    </div>
  );
}

/**
 * GodMenuPanel — the 10 god menus. Each card opens to reveal its satellites;
 * tapping a satellite launches it through the one menu-to-satellite function
 * passed in as onLaunch (the parent's launchPocketUniverse).
 */
export default function GodMenuPanel({ t, satIndex, onLaunch }) {
  const [openGod, setOpenGod] = useState(null);

  return (
    <div className="flex flex-col gap-3 pb-10">
      {GOD_MENUS.map((menu) => {
        const acc = ACCENTS[menu.accent] || ACCENTS.sky;
        const open = openGod === menu.god;
        return (
          <div
            key={menu.god}
            className={`rounded-xl border bg-black/60 overflow-hidden transition-all ${acc.ring} ${open ? acc.glow : ''}`}
          >
            <button
              onClick={() => { if (open) fx.menuClose(); else fx.menuOpen(); setOpenGod(open ? null : menu.god); }}
              aria-expanded={open}
              className="w-full text-left"
            >
              <MenuBanner menu={menu} />
              <div className="px-4 pt-3 pb-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-lg font-black tracking-[0.18em] uppercase ${acc.name}`}>
                    {menu.god}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono whitespace-nowrap">
                    {menu.satellites.length} worlds
                  </span>
                </div>
                <div className="text-sm font-bold text-zinc-100 mt-0.5">
                  {menu.category}
                </div>
                <div className="text-[11px] text-zinc-400 mt-1 leading-snug">
                  {menu.tagline}
                </div>
                <div className="text-[10px] text-zinc-600 mt-2 tracking-widest uppercase">
                  {open ? '▾ Tap to close' : '▸ Tap to open'}
                </div>
              </div>
            </button>
            {open && (
              <div className="px-3 pb-3 flex flex-col gap-2">
                {menu.satellites.map((key) => {
                  const sat = satIndex.get(key);
                  if (!sat) return null;
                  return (
                    <button
                      key={key}
                      onClick={() => onLaunch(sat.route, key, sat.pos)}
                      className="flex flex-col text-left px-4 py-3 min-h-[44px] justify-center bg-black/60 border border-zinc-800 rounded hover:bg-zinc-900/80 transition-all group"
                    >
                      <span className="text-sm font-black text-white group-hover:text-zinc-100 tracking-widest uppercase">
                        {t(`sat.${key}.title`)}
                      </span>
                      <span className="text-[10px] text-zinc-500 uppercase mt-1">
                        {t(`sat.${key}.subtitle`)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
