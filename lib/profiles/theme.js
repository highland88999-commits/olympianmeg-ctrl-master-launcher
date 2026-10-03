// lib/profiles/theme.js
// Shared color language for profiles + Agora ("perfect the profiles" pass).
//
// Merlin's direction:
// - Navy blue is the shared base.
// - Personal mode accents -> navy blue.
// - Business mode accents -> white (yellow/gold retired everywhere here).
// - Cyan/teal stays only where it's functional (links, active states).
//
// The profile pages theme via CSS custom properties (--pf-accent,
// --pf-accent-rgb, --pf-on-accent) set on the root from profileThemeVars().
// Agora surfaces use the personal (navy) theme directly.

export const NAVY_BASE = '#070d1d'; // page background
export const NAVY_CARD = '#0b1329'; // cards / inputs
export const NAVY_ACCENT = '#3a86ff'; // personal-mode accent (bright navy)
export const NAVY_ACCENT_RGB = '58,134,255';
export const BUSINESS_ACCENT = '#f4f6ff'; // business-mode accent (white)
export const BUSINESS_ACCENT_RGB = '244,246,255';
export const FUNCTIONAL_CYAN = '#00f2ff'; // links + active states only

export const PROFILE_THEMES = {
  personal: {
    accent: NAVY_ACCENT,
    accentRgb: NAVY_ACCENT_RGB,
    onAccent: '#ffffff',
  },
  business: {
    accent: BUSINESS_ACCENT,
    accentRgb: BUSINESS_ACCENT_RGB,
    onAccent: '#0a0f22',
  },
};

// profileTheme('personal' | 'business') -> { accent, accentRgb, onAccent }.
// Unknown types fall back to personal (navy) — never to gold.
export function profileTheme(type) {
  return PROFILE_THEMES[type] || PROFILE_THEMES.personal;
}

// profileThemeVars(type) -> inline-style object for the profile root.
// Sets the CSS vars the pf-* / pe-* stylesheets consume.
export function profileThemeVars(type) {
  const t = profileTheme(type);
  return {
    '--pf-accent': t.accent,
    '--pf-accent-rgb': t.accentRgb,
    '--pf-on-accent': t.onAccent,
  };
}
