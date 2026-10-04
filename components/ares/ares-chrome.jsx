'use client';
// ARES batch graphics chrome — shared interior treatment for the
// Battle, Competition & Defense programs (ARES god menu).
//
// Palette (from lib/god-menus.js ARES entry + Merlin's gold):
//   crimson #dc2626 (ARES accent), gold #d4af37 (his gold),
//   deep blacks, teal as a supporting tint only.
//
// Zero image weight for glyphs (inline SVG). The only raster assets used:
//   /images/<program>/<program>-bg.webp  (page backdrop, ≤300KB each)
//   /images/ares/ares-panel.webp          (512px tile for HUD panels)
// Every behavior is untouched — this file only elevates the chrome.

export const ARES = {
  crimson: '#dc2626',
  crimsonDeep: '#7f1d1d',
  gold: '#d4af37',
  goldSoft: '#f5d67b',
  teal: '#2dd4bf',
  black: '#050505',
  panelTile: '/images/ares/ares-panel.webp',
};

/* ------------------------------------------------------------------ */
/* Backdrop: full-bleed page art behind menus / HUD, never over gameplay.
   First child of the page's relative container; pointer-events-none so it
   can never swallow input. A dark crimson→black scrim keeps text legible.  */
export function AresBackdrop({ src, strength = 0.42, scrimTop = 0.82, scrimBottom = 0.94 }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <img
        src={src}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ opacity: strength }}
        loading="eager"
        decoding="async"
      />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, rgba(5,5,5,${scrimTop}) 0%, rgba(28,10,10,0.55) 45%, rgba(5,5,5,${scrimBottom}) 100%)`,
        }}
      />
      {/* crimson vignette */}
      <div
        className="absolute inset-0"
        style={{ boxShadow: 'inset 0 0 180px 60px rgba(127,29,29,0.35)' }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel: HUD / card wrapper with the shared 512px ares-panel tile.     */
export function AresPanel({ className = '', style = {}, children, tileOpacity = 0.32 }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-red-900/40 bg-black/60 backdrop-blur-sm ${className}`}
      style={style}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `url('${ARES.panelTile}')`,
          backgroundSize: '512px 512px',
          opacity: tileOpacity,
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Loader: styled loading state (replaces plain "Loading…").           */
export function AresLoader({ label = 'LOADING' }) {
  return (
    <div className="flex h-full min-h-[40dvh] w-full flex-col items-center justify-center gap-5 bg-[#050505]">
      <div className="relative h-16 w-16">
        <div
          className="absolute inset-0 rounded-full border-2 border-red-900/30"
          style={{ borderTopColor: ARES.gold, animation: 'ares-spin 1s linear infinite' }}
        />
        <div
          className="absolute inset-3 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(220,38,38,0.8) 0%, transparent 70%)', animation: 'ares-pulse 1.6s ease-in-out infinite' }}
        />
      </div>
      <p className="text-[11px] font-bold uppercase" style={{ letterSpacing: '0.45em', color: ARES.goldSoft }}>
        {label}
      </p>
      <style>{`@keyframes ares-spin{to{transform:rotate(360deg)}}@keyframes ares-pulse{0%,100%{opacity:.35;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state: styled "nothing here yet" panel.                       */
export function AresEmpty({ title = 'NOTHING HERE YET', hint = '' }) {
  return (
    <AresPanel className="mx-auto max-w-md p-8 text-center">
      <div className="mx-auto mb-4 h-10 w-10" style={{ color: ARES.gold }}>
        <AresIcon name="shield" className="h-10 w-10" />
      </div>
      <p className="text-xs font-bold uppercase" style={{ letterSpacing: '0.3em', color: ARES.goldSoft }}>{title}</p>
      {hint && <p className="mt-3 text-sm text-zinc-400">{hint}</p>}
    </AresPanel>
  );
}

/* ------------------------------------------------------------------ */
/* Icon set: inline SVG glyphs (stroke = currentColor).                 */
const GLYPHS = {
  sword: <><path d="M4 20 L16 8 M14 4 l6 6 M13 5 l6 6 M4 20 l-1 1 M4 20 l1 -1" /><path d="M14.5 9.5 l-5 5 M16 4 l4 4" /></>,
  crown: <path d="M3 18 h18 M4 18 l-1.5 -9 L8 12 L12 5 L16 12 L21.5 9 L20 18 Z" />,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /><path d="M12 1 v4 M12 19 v4 M1 12 h4 M19 12 h4" /></>,
  crosshair: <><circle cx="12" cy="12" r="7" /><path d="M12 2 v5 M12 17 v5 M2 12 h5 M17 12 h5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></>,
  play: <path d="M7 4.5 L19 12 L7 19.5 Z" fill="currentColor" stroke="none" />,
  pause: <><rect x="6.5" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /><rect x="13.5" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /></>,
  sound: <><path d="M4 9 v6 h4 l5 4 V5 L8 9 Z" fill="currentColor" stroke="none" /><path d="M16.5 8.5 a5 5 0 0 1 0 7 M19 6 a8.5 8.5 0 0 1 0 12" /></>,
  mute: <><path d="M4 9 v6 h4 l5 4 V5 L8 9 Z" fill="currentColor" stroke="none" /><path d="M16 9 l6 6 M22 9 l-6 6" /></>,
  close: <path d="M6 6 l12 12 M18 6 L6 18" />,
  check: <path d="M4 12.5 l5 5 L20 6.5" />,
  trophy: <><path d="M7 4 h10 v6 a5 5 0 0 1 -10 0 Z" /><path d="M7 5 H4 a3 3 0 0 0 3 5 M17 5 h3 a3 3 0 0 1 -3 5" /><path d="M12 15 v3 M8 21 h8 M9.5 18 h5" /></>,
  flag: <><path d="M5 21 V4" /><path d="M5 4 h13 l-3 4 3 4 H5" /></>,
  quit: <><path d="M14 4 h6 v16 h-6" /><path d="M3 12 h12 M11 6 l6 6 -6 6" /></>,
  zap: <path d="M13 2 L4 14 h6 l-1 8 9 -12 h-6 Z" />,
  skull: <><path d="M12 3 a8 8 0 0 0 -8 8 c0 3 2 5 4 6 v3 h8 v-3 c2 -1 4 -3 4 -6 a8 8 0 0 0 -8 -8 Z" /><circle cx="9" cy="11" r="1.6" fill="currentColor" stroke="none" /><circle cx="15" cy="11" r="1.6" fill="currentColor" stroke="none" /><path d="M10.5 20 v-2 M13.5 20 v-2" /></>,
  dice: <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" /><circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none" /><circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none" /><circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9.5 V13 l3 2 M9 2 h6" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20 a6.5 6.5 0 0 1 13 0" /><circle cx="17" cy="9" r="2.6" /><path d="M16 14.6 a5.5 5.5 0 0 1 5.5 5.4" /></>,
  robot: <><rect x="5" y="8" width="14" height="10" rx="2" /><path d="M12 8 V4 M9 4 h6" /><circle cx="9.5" cy="13" r="1.2" fill="currentColor" stroke="none" /><circle cx="14.5" cy="13" r="1.2" fill="currentColor" stroke="none" /><path d="M2 12 v4 M22 12 v4" /></>,
  home: <path d="M3 11 L12 3 L21 11 M5.5 9.5 V21 h13 V9.5" />,
  rocket: <><path d="M12 2 c4 3 5 8 3 13 l-3 3 c-5 -2 -8 -7 -8 -12 Z" /><circle cx="12" cy="9" r="1.8" /><path d="M9 15 l-3 5 M15 15 l3 5 M12 18 v4" /></>,
  star: <path d="M12 2.5 L14.9 9 L22 9.6 L16.4 14 L18.2 21 L12 17 L5.8 21 L7.6 14 L2 9.6 L9.1 9 Z" />,
  shield: <path d="M12 2.5 L20 6 v6 c0 5.5 -3.5 9.3 -8 11.5 C7.5 21.3 4 17.5 4 12 V6 Z" />,
  spark: <><path d="M12 2 v6 M12 16 v6 M2 12 h6 M16 12 h6" /><path d="M12 8 a4 4 0 1 0 0.1 0 M18.5 3.5 l-2.5 2.5 M5.5 3.5 l2.5 2.5" /></>,
  plus: <path d="M12 4 v16 M4 12 h16" />,
  save: <><path d="M5 3 h11 l5 5 v13 H5 Z" /><path d="M8 3 v5 h8 V3 M8 21 v-7 h8 v7" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5 a2.5 2.5 0 1 1 3.6 2.2 c-0.8 0.4 -1.1 0.9 -1.1 1.8" /><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" /></>,
  music: <><path d="M9 18 a3 3 0 1 1 -3 -3 a3 3 0 0 1 3 3 Z M15 16 a3 3 0 1 1 -3 -3 a3 3 0 0 1 3 3 Z" /><path d="M9 18 V4 l9 -2 v12" /></>,
  bolt: <path d="M13 2 L5 13.5 h5.5 L10 22 l8 -11.5 h-5.5 Z" />,
  eye: <><path d="M2 12 s3.5 -6.5 10 -6.5 S22 12 22 12 s-3.5 6.5 -10 6.5 S2 12 2 12 Z" /><circle cx="12" cy="12" r="2.5" /></>,
  flame: <path d="M12 2.5 c1 4 -4 6 -4 11 a4.5 4.5 0 0 0 9 0 c0 -2 -1 -3.5 -2 -5 c-0.5 1.5 -1.5 2 -2.5 2 C13 8 12.5 5 12 2.5 Z" />,
  anchor: <><circle cx="12" cy="5" r="2.5" /><path d="M12 7.5 V21 M4 13 a8 8 0 0 0 16 0 M7 11 h3 M14 11 h3" /></>,
  waves: <path d="M2 9 c2.5 -2.5 5 -2.5 7.5 0 s5 2.5 7.5 0 s4 -2 5 0 M2 15 c2.5 -2.5 5 -2.5 7.5 0 s5 2.5 7.5 0 s4 -2 5 0" />,
  orbit: <><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" /><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-20 12 12)" /><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(35 12 12)" /></>,
  sprint: <><path d="M4 6 l6 6 -6 6 M11 6 l6 6 -6 6" /></>,
  rotate: <><path d="M20 12 a8 8 0 1 1 -2.3 -5.6" /><path d="M20 3 v4 h-4" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>,
  chevron: <path d="M6 9 l6 6 6 -6" />,
  share: <><circle cx="6" cy="12" r="2.5" /><circle cx="17" cy="5.5" r="2.5" /><circle cx="17" cy="18.5" r="2.5" /><path d="M8.3 10.7 l6.4 -3.9 M8.3 13.3 l6.4 3.9" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15 V6 a2 2 0 0 1 2 -2 h8" /></>,
};

export function AresIcon({ name, className = 'h-5 w-5', style }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {GLYPHS[name] || GLYPHS.spark}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Button: icon + label, ARES tones. Keeps every onClick/disabled prop. */
const TONES = {
  gold: {
    border: 'border-[#d4af37]/60',
    text: 'text-[#f5d67b]',
    bg: 'bg-[#d4af37]/10 hover:bg-[#d4af37]/25',
    glow: 'hover:shadow-[0_0_24px_rgba(212,175,55,0.35)]',
  },
  crimson: {
    border: 'border-red-700/70',
    text: 'text-red-200',
    bg: 'bg-red-950/40 hover:bg-red-900/60',
    glow: 'hover:shadow-[0_0_24px_rgba(220,38,38,0.4)]',
  },
  ghost: {
    border: 'border-zinc-700/80',
    text: 'text-zinc-300',
    bg: 'bg-black/50 hover:bg-zinc-800/60',
    glow: 'hover:shadow-[0_0_18px_rgba(255,255,255,0.08)]',
  },
};

export function AresButton({
  icon, children, tone = 'gold', className = '', iconClassName = 'h-4 w-4', ...props
}) {
  const t = TONES[tone] || TONES.gold;
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-lg border px-5 py-3 text-xs font-bold uppercase transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${t.border} ${t.text} ${t.bg} ${t.glow} ${className}`}
      style={{ letterSpacing: '0.22em' }}
    >
      {icon && <AresIcon name={icon} className={iconClassName} />}
      <span>{children}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Header banner: header art strip for lobby-style pages.              */
export function AresHeader({ src, title, subtitle, icon = 'sword' }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-xl border border-red-900/40">
      <img src={src} alt="" aria-hidden="true" className="h-36 w-full object-cover sm:h-44" loading="eager" decoding="async" draggable={false} />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(5,5,5,0.25) 0%, rgba(28,10,10,0.55) 55%, rgba(5,5,5,0.92) 100%)' }}
      />
      <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-5">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[#d4af37]/60 bg-black/60"
          style={{ color: ARES.goldSoft, boxShadow: '0 0 22px rgba(212,175,55,0.3)' }}
        >
          <AresIcon name={icon} className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-xl font-black uppercase sm:text-2xl" style={{ letterSpacing: '0.28em', color: '#fff' }}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-[11px] uppercase" style={{ letterSpacing: '0.3em', color: ARES.goldSoft }}>{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}
