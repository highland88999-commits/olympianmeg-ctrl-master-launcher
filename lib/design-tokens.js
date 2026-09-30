// Canonical design tokens — the single source of truth for the launcher's
// visual language. Phase 2a (2026-09-29): tokens defined here; Phase 2b sweeps
// the 7 cyans / 4+ golds / 9 near-blacks found across pages onto these values.
//
// Rules:
// - New code uses these tokens (or the Tailwind theme, which mirrors them).
// - Never invent a new hex for cyan/gold/surface — pick from here.
// - `.page-back`, `.eyebrow` etc. live in app/globals.css; semantic colors live here.

export const colors = {
  // THE cyan. (Retired: #08f7fe, #00f3ff, #00f9ff, #0ff, #22d3ee, #45f3ff.)
  cyan: '#00f2ff',
  cyanDim: 'rgba(0, 242, 255, 0.14)',
  cyanFaint: 'rgba(0, 242, 255, 0.06)',

  // THE gold. (Retired: #d4af37, #fbbf24, amber-300/400.)
  gold: '#ffd700',
  goldDim: 'rgba(255, 215, 0, 0.14)',

  // Surface scale — near-blacks unified. (Retired: #030303, #050505 dupes,
  // #0a0a0a, #111, #18181b-as-surface, zinc-950-as-surface, etc.)
  surface: {
    void: '#030303', // page background
    base: '#050505', // body background (matches globals.css --background)
    raised: '#0b0b0d', // cards, panels
    overlay: '#121214', // modals, sheets
  },

  text: {
    primary: '#ffffff',
    secondary: '#d4d4d8', // zinc-300
    muted: '#71717a', // zinc-500
    faint: '#52525b', // zinc-600
  },

  line: {
    hairline: 'rgba(255, 255, 255, 0.10)',
    soft: 'rgba(255, 255, 255, 0.14)',
    strong: 'rgba(255, 255, 255, 0.35)',
  },

  // Status / accent (kept narrow on purpose)
  danger: '#ff003c',
  success: '#39ff14',
  violet: '#b026ff',
};

export const radii = {
  sm: '8px',
  md: '10px', // canonical control radius (matches .page-back)
  lg: '16px',
  xl: '24px',
  pill: '9999px',
};

export const spacing = {
  // Radio-bar clearance — mirrors --player-clear in app/globals.css.
  // Every scrollable page must end above this.
  playerClear: 'calc(3.5rem + 1rem + env(safe-area-inset-bottom, 0px))',
  pageMax: '72rem', // matches .page-col
  pageGutter: '1rem',
};

export const type = {
  eyebrow: {
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
  },
  touchMin: '44px', // minimum touch target — accessibility floor
};

// Tailwind arbitrary-value helpers for the canonical tokens, so pages can
// adopt them without new CSS: e.g. className={`text-[${colors.cyan}]`}
export const tw = {
  cyan: 'text-[#00f2ff]',
  cyanBorder: 'border-[#00f2ff]',
  gold: 'text-[#ffd700]',
  goldBorder: 'border-[#ffd700]',
  surfaceRaised: 'bg-[#0b0b0d]',
  surfaceOverlay: 'bg-[#121214]',
};
