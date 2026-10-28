'use client';

import { useState, useRef, useMemo } from 'react';
import { GOD_MENUS, AGENT_FORGE_MENU, menuArtFor, menuBannerFor } from '@/lib/god-menus';
import { filterMenuIndex } from '@/lib/menu-search';
import { FLOORS } from '@/lib/babel/floors';
import { fx } from '@/lib/fx';

/**
 * SatelliteMenu — two-axis slidable program menu, Hermes-style.
 *
 * - CATEGORIES ride a horizontal slider rail across the top (swipe/scroll).
 *   Each rail tab wears its god's banner art (menuBannerFor) behind a dark
 *   legibility scrim; a missing image falls back to the plain tab style.
 * - SEARCH sits directly under the rail (pinned with it while scrolling) and
 *   filters all 10 god menus at once — satellite titles/subtitles plus the
 *   Babel tower floors. Results replace the items list, grouped by god;
 *   tapping a result launches it through the same onLaunch path.
 * - ITEMS for the selected category scroll vertically beneath it.
 * - Tapping a satellite slides its programs open with the Hermes drawer
 *   motion: max-height 0 → open on an expo-out curve
 *   (cubic-bezier(0.19, 1, 0.22, 1), 0.6s), padding easing with it.
 * - The whole thing lives INSIDE the menu window opened by the floating
 *   button. Since 2026-10-03 the menu window is a fullscreen corner-to-corner
 *   overlay above all hub UI (Merlin: resolves visibility/CSS overlap); the
 *   slider rail stays anchored to the top of that overlay and the items list
 *   scrolls beneath it.
 * - Launching still goes through the single menu-to-satellite function
 *   passed in as onLaunch (the parent's launchPocketUniverse).
 * - Each satellite row carries Merlin's 2026-10-01 transfer art as its
 *   background (menuArtFor), with a dark legibility overlay; a missing
 *   image falls back to the plain row style.
 *
 * BABEL appears like any other satellite — its programs list the tower's
 * floors (pocket universes) from lib/babel/floors.
 */

// Hermes expo-out — the exact curve from Merlin's Hermes landing drawer.
const HERMES_EASE = 'cubic-bezier(0.19, 1, 0.22, 1)';

// Merlin's 2026-10-01 transfer art as a menu-row background. Hides itself
// on error so the row falls back to its plain style — a missing image
// never breaks the menu.
function MenuRowArt({ satKey }) {
  const [imgOk, setImgOk] = useState(true);
  if (!imgOk) return null;
  return (
    <img
      src={menuArtFor(satKey)}
      alt=""
      aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover"
      loading="lazy"
      onError={() => setImgOk(false)}
    />
  );
}

// Merlin's 2026-10-01 transfer banner as a category-rail tab background.
// Same contract as MenuRowArt: hides itself on error so the tab falls back
// to its plain style.
function RailArt({ god }) {
  const [imgOk, setImgOk] = useState(true);
  if (!imgOk) return null;
  return (
    <img
      src={menuBannerFor(god)}
      alt=""
      aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover"
      loading="lazy"
      onError={() => setImgOk(false)}
    />
  );
}

// Featured Order 67 art for the pinned top button. Same contract as
// RailArt: hides itself on error so the button falls back to its dark
// gradient style — intentional-looking before Merlin's art lands.
function FeaturedArt() {
  const [imgOk, setImgOk] = useState(true);
  if (!imgOk) return null;
  return (
    <img
      src={menuArtFor('order-67')}
      alt=""
      aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover"
      loading="lazy"
      onError={() => setImgOk(false)}
    />
  );
}

// Featured Social Media Cheat Code art for its pinned top button.
// Same contract: a missing image hides itself and the button falls
// back to its dark gradient style — the room has no menu art yet.
function FeaturedCheatCodeArt() {
  const [imgOk, setImgOk] = useState(true);
  if (!imgOk) return null;
  return (
    <img
      src={menuArtFor('social-media-cheat-code')}
      alt=""
      aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover"
      loading="lazy"
      onError={() => setImgOk(false)}
    />
  );
}

function programsFor(key, sat, t) {
  // Agent Forge (owner-only menu entry): no locale strings exist for it,
  // so the row wears the shared display copy instead of an echoed key.
  if (key === AGENT_FORGE_MENU.key) {
    return {
      title: AGENT_FORGE_MENU.title,
      subtitle: AGENT_FORGE_MENU.subtitle,
      programs: [{
        key: `${key}-program`,
        name: `Enter ${AGENT_FORGE_MENU.title}`,
        sub: AGENT_FORGE_MENU.subtitle,
        route: AGENT_FORGE_MENU.route,
      }],
    };
  }
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
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);

  // i18n with an honest English fallback — new search strings degrade
  // gracefully if the locale files don't carry them yet.
  const tt = (key, fallback) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

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

  const searching = query.trim().length > 0;
  const searchGroups = useMemo(
    () => (searching ? filterMenuIndex(query, { t, satIndex }) : []),
    [searching, query, t, satIndex]
  );

  const clearSearch = () => {
    setQuery('');
    searchRef.current?.focus();
  };

  // Featured Order 67 launch — the pinned top button. Goes through the
  // same onLaunch path as every other satellite.
  const launchOrder67 = () => {
    fx.menuOpen();
    const sat = satIndex.get('order-67');
    onLaunch('/order-67', 'order-67', sat ? sat.pos : 'HERMES');
  };

  // Featured Social Media Cheat Code launch — the second pinned top
  // button (Merlin, 2026-10-26: featured on every portal entry
  // point). Same onLaunch path as every other satellite.
  const launchCheatCode = () => {
    fx.menuOpen();
    const sat = satIndex.get('social-media-cheat-code');
    onLaunch('/social-media-cheat-code', 'social-media-cheat-code', sat ? sat.pos : 'HERMES');
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-zinc-950">
      <style>{`
        @keyframes satmenu-enter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .satmenu-enter { animation: satmenu-enter 0.45s ${HERMES_EASE}; }
        @media (prefers-reduced-motion: reduce) {
          .satmenu-enter { animation: none; }
          .menu-bg-video { display: none; }
        }
      `}</style>

      {/* Menu background video — behind the menu and buttons. Decorative:
          muted, looping, inline; hidden under prefers-reduced-motion. */}
      <video
        className="menu-bg-video pointer-events-none absolute inset-0 h-full w-full object-cover"
        src="/videos/menu-background.mp4"
        muted
        autoPlay
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        disablePictureInPicture
      />
      {/* Dark scrim above the video — every button and text stays legible. */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-black/90"
        aria-hidden="true"
      />

      {/* Category rail + search — pinned together at the top of the menu
          window while the items slide vertically beneath. Overlap
          repair (2026-10-27): solid background (no translucent blur
          for scrolled rows to ghost through) and no negative margins
          (the header used to stick out 4px past the rows on each side). */}
      <div className="sticky top-0 z-10 shrink-0 bg-zinc-950 px-1 pb-2">
        {/* Featured: ORDER 67 — the first thing visible when the menu opens. */}
        <button
          onClick={launchOrder67}
          aria-label={`${tt('sat.order-67.title', 'Order 67')} — ${tt('sat.order-67.subtitle', 'Holographic calls')}`}
          className="relative mb-2 flex min-h-[64px] w-full items-center overflow-hidden rounded-xl border border-cyan-400/30 text-left transition-all motion-reduce:transition-none hover:border-cyan-300/60"
        >
          <FeaturedArt />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/30"
            aria-hidden="true"
          />
          <div className="relative flex flex-col justify-center px-4 py-2">
            <span className="text-sm font-black uppercase tracking-[0.25em] text-white">
              {tt('sat.order-67.title', 'ORDER 67')}
            </span>
            <span className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-300/80">
              {tt('sat.order-67.subtitle', 'Holographic calls')}
            </span>
          </div>
          <span aria-hidden="true" className="relative ml-auto pr-4 text-lg text-cyan-300/70">
            ▸
          </span>
        </button>
        {/* Featured: SOCIAL MEDIA CHEAT CODE — the second pinned top
            button, beside Order 67 (Merlin, 2026-10-26: featured on
            every portal entry point). */}
        <button
          onClick={launchCheatCode}
          aria-label={`${tt('sat.social-media-cheat-code.title', 'Social Media Cheat Code')} — ${tt('sat.social-media-cheat-code.subtitle', 'Copy-ready city hashtags, room by room')}`}
          className="relative mb-2 flex min-h-[64px] w-full items-center overflow-hidden rounded-xl border border-red-400/30 text-left transition-all motion-reduce:transition-none hover:border-red-300/60"
        >
          <FeaturedCheatCodeArt />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/30"
            aria-hidden="true"
          />
          <div className="relative flex flex-col justify-center px-4 py-2">
            <span className="text-sm font-black uppercase tracking-[0.25em] text-white">
              {tt('sat.social-media-cheat-code.title', 'SOCIAL MEDIA CHEAT CODE')}
            </span>
            <span className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-red-300/80">
              {tt('sat.social-media-cheat-code.subtitle', 'Copy-ready city hashtags, room by room')}
            </span>
          </div>
          <span aria-hidden="true" className="relative ml-auto pr-4 text-lg text-red-300/70">
            ▸
          </span>
        </button>
        <div
          role="tablist"
          aria-label="Program categories"
          className="custom-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth pb-2"
        >
          {GOD_MENUS.map((m) => {
            const active = m.god === activeGod;
            return (
              <button
                key={m.god}
                role="tab"
                aria-selected={active}
                onClick={() => selectGod(m.god)}
                className={`relative flex min-h-[44px] shrink-0 snap-start flex-col justify-center overflow-hidden rounded-xl border px-4 py-2 text-left transition-all motion-reduce:transition-none ${
                  active
                    ? 'border-cyan-400/60 bg-cyan-400/10'
                    : 'border-zinc-800 bg-black/60 hover:border-zinc-600'
                }`}
              >
                <RailArt god={m.god} />
                <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/55 to-black/85 pointer-events-none" aria-hidden="true" />
                <span
                  className={`relative text-[11px] font-black tracking-[0.2em] uppercase ${
                    active ? 'text-cyan-200' : 'text-zinc-300'
                  }`}
                >
                  {m.god}
                </span>
                <span className="relative mt-0.5 max-w-[140px] truncate text-[10px] text-zinc-500">
                  {m.category}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search — filters all 10 god menus at once. */}
        <div role="search" className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <input
            ref={searchRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setQuery('');
              }
            }}
            placeholder={tt('menu.search.placeholder', 'Search worlds…')}
            aria-label={tt('menu.search.label', 'Search programs')}
            className="min-h-[44px] w-full rounded-xl border border-zinc-800 bg-black/60 pl-10 pr-12 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-400/60 focus:outline-none"
          />
          {searching ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label={tt('menu.search.clear', 'Clear search')}
              className="absolute right-1 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-lg text-xl leading-none text-zinc-400 transition-colors motion-reduce:transition-none hover:text-white"
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Items — vertical list beneath the rail, inside the menu window.
          While searching, the normal category list is replaced by grouped
          results across all 10 god menus. */}
      <div
        key={searching ? 'search' : menu.god}
        role="tabpanel"
        aria-label={searching ? `Search results for ${query.trim()}` : `${menu.god} programs`}
        className="custom-scrollbar satmenu-enter relative min-h-0 flex-1 overflow-y-auto px-1 pb-10"
      >
        {searching ? (
          searchGroups.length > 0 ? (
            <div className="flex flex-col gap-4 pt-1">
              {searchGroups.map((g) => (
                <section key={g.god} aria-label={`${g.god} results`}>
                  <h3 className="px-1 pb-2 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400">
                    {g.god}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {g.results.map((r) => (
                      <button
                        key={r.key}
                        onClick={() => onLaunch(r.route, r.satKey, r.pos)}
                        className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/60 px-4 py-3 text-left transition-colors motion-reduce:transition-none hover:border-cyan-500/40 hover:bg-zinc-900/60"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-bold text-zinc-100">
                            {r.name}
                          </span>
                          {r.sub ? (
                            <span className="mt-0.5 truncate text-[10px] text-zinc-500">
                              {r.sub}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className="shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500"
                          aria-hidden="true"
                        >
                          {r.kind === 'floor' ? 'Babel floor' : 'Launch'} ▸
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className="px-1 py-10 text-center text-[13px] leading-relaxed text-zinc-500">
              {tt('menu.search.empty', 'No worlds match')}{' '}
              <span className="text-zinc-300">“{query.trim()}”</span>
            </p>
          )
        ) : (
          <>
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
                      className="relative flex min-h-[44px] w-full items-center justify-between gap-3 overflow-hidden px-4 py-3 text-left transition-colors motion-reduce:transition-none hover:bg-zinc-900/60"
                    >
                      <MenuRowArt satKey={key} />
                      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/30 pointer-events-none" aria-hidden="true" />
                      <span className="relative flex min-w-0 flex-col">
                        <span className="line-clamp-2 text-sm font-black uppercase tracking-widest text-white">
                          {title}
                        </span>
                        <span className="mt-0.5 truncate text-[10px] uppercase text-zinc-500">
                          {subtitle}
                        </span>
                      </span>
                      <span
                        className="relative flex shrink-0 items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] text-zinc-400 uppercase"
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
          </>
        )}
      </div>
    </div>
  );
}
