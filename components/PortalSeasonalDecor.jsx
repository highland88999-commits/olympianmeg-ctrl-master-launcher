'use client';

// components/PortalSeasonalDecor.jsx
//
// Seasonal dressing for the portal menu (Merlin 2026-10-09, "be creative").
// Two ambient, non-interactive treatments driven by lib/seasonal/seasons.js:
//   - PortalButtonDecor: wraps the floating black-hole portal button with
//     orbiting trinkets + a seasonal glow ring. Rendered as a SIBLING of the
//     button (the button clips overflow), pointer-events-none throughout.
//   - MenuHeaderDecor: a small garnish beside "SELECT YOUR SATELLITES" in
//     the fullscreen menu overlay.
// Off-season (getSeason() -> null) both render nothing — the portal stays
// exactly as Merlin made it.

import { useMemo } from 'react';
import { getSeason, starwarsDay } from '@/lib/seasonal/seasons';

// Per-season art direction. glow = box-shadow color for the button ring.
const THEMES = {
  halloween:    { glow: '0 0 28px rgba(168,85,247,0.55)', orbit: ['🎃', '🎃', '🎃'], wisp: '👻' },
  remembrance:  { glow: '0 0 18px rgba(220,60,60,0.4)',  pin: '🌺' },
  thanksgiving: { glow: '0 0 22px rgba(217,119,6,0.5)',   fall: ['🍂', '🍁', '🍂'] },
  christmas:    { glow: '0 0 26px rgba(239,68,68,0.5)',   hat: '🎅', orbit: ['🔴', '🟢', '🟡'] },
  newyear:      { glow: '0 0 30px rgba(255,215,94,0.6)',   burst: ['✨', '🎆', '✨'] },
  valentine:    { glow: '0 0 24px rgba(244,114,182,0.55)', rise: ['💗', '💖', '💗'] },
  stpatrick:    { glow: '0 0 24px rgba(34,197,94,0.55)',  orbit: ['☘️', '☘️', '☘️'] },
  easter:       { glow: '0 0 22px rgba(196,181,253,0.5)',  base: ['🥚', '🐣', '🥚'] },
  holi:         { glow: '0 0 26px rgba(217,70,239,0.5)',   orbit: ['🟣', '🟡', '🟢'] },
  lunarnewyear: { glow: '0 0 26px rgba(239,68,68,0.55)',  pin: '🏮' },
  canadaday:    { glow: '0 0 26px rgba(239,68,68,0.5)',   orbit: ['🍁', '🍁'] },
  independence: { glow: '0 0 26px rgba(96,165,250,0.55)', burst: ['🎆', '✨', '🎇'] },
  diwali:       { glow: '0 0 24px rgba(251,146,60,0.6)',   pin: '🪔', flicker: true },
  starwars:     { glow: null, twinkle: ['✦', '✦', '✦', '✦'] }, // glow set per-day below
};

const SW_GLOW = {
  4: '0 0 30px rgba(79,195,255,0.65)',  // Jedi blue/green
  5: '0 0 30px rgba(255,59,48,0.65)',   // Sith red
  6: '0 0 30px rgba(255,215,94,0.65)',  // Endor gold
};

const CSS = `
@keyframes psd-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes psd-orbit-rev { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
@keyframes psd-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
@keyframes psd-rise { 0% { transform: translateY(6px); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(-26px); opacity: 0; } }
@keyframes psd-fall { 0% { transform: translateY(-8px) rotate(0deg); opacity: 0; } 25% { opacity: 1; } 100% { transform: translateY(22px) rotate(70deg); opacity: 0; } }
@keyframes psd-twinkle { 0%,100% { opacity: 0.25; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.15); } }
@keyframes psd-flicker { 0%,100% { opacity: 1; } 45% { opacity: 0.75; } 60% { opacity: 0.95; } 80% { opacity: 0.7; } }
`;

function useTheme() {
  return useMemo(() => {
    const season = getSeason(new Date());
    if (!season) return null;
    const t = THEMES[season];
    if (!t) return null;
    if (season === 'starwars') {
      const day = starwarsDay(new Date());
      return { ...t, glow: SW_GLOW[day] || SW_GLOW[4] };
    }
    return t;
  }, []);
}

// Sibling overlay for the floating portal button. The parent in app/page.jsx
// wraps the button in a relative div and renders this after it.
export function PortalButtonDecor() {
  const t = useTheme();
  if (!t) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -inset-4 select-none">
      <style>{CSS}</style>
      {/* seasonal glow ring hugging the button */}
      <div
        className="absolute inset-2 rounded-full"
        style={{ boxShadow: t.glow, animation: t.flicker ? 'psd-flicker 2.2s ease-in-out infinite' : undefined }}
      />
      {/* orbiting trinkets */}
      {t.orbit && (
        <div className="absolute inset-0" style={{ animation: 'psd-orbit 9s linear infinite' }}>
          {t.orbit.map((e, i) => {
            const a = (i / t.orbit.length) * Math.PI * 2;
            return (
              <span
                key={i}
                style={{
                  position: 'absolute', left: '50%', top: '50%',
                  transform: `translate(-50%,-50%) rotate(${(a * 180) / Math.PI}deg) translateX(52px) rotate(${(-a * 180) / Math.PI}deg)`,
                  fontSize: 17, lineHeight: 1,
                }}
              >
                {e}
              </span>
            );
          })}
        </div>
      )}
      {/* pinned trinket (top-right of the button) */}
      {t.pin && (
        <span style={{ position: 'absolute', right: -2, top: -6, fontSize: 22, animation: 'psd-bob 3s ease-in-out infinite' }}>
          {t.pin}
        </span>
      )}
      {/* santa hat tilted over the top edge */}
      {t.hat && (
        <span style={{ position: 'absolute', left: '50%', top: -16, transform: 'translateX(-30%) rotate(-14deg)', fontSize: 30 }}>
          {t.hat}
        </span>
      )}
      {/* ghost wisp drifting beside the button */}
      {t.wisp && (
        <span style={{ position: 'absolute', left: -14, bottom: 6, fontSize: 20, animation: 'psd-bob 4s ease-in-out infinite' }}>
          {t.wisp}
        </span>
      )}
      {/* rising / falling / bursting particles */}
      {(t.rise || t.fall || t.burst) && (
        <div className="absolute inset-0">
          {(t.rise || t.fall || t.burst).map((e, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: `${18 + i * 26}%`,
                top: t.rise ? '70%' : t.fall ? '10%' : `${30 + (i % 2) * 20}%`,
                fontSize: 15,
                animation: `${t.rise ? 'psd-rise' : t.fall ? 'psd-fall' : 'psd-twinkle'} ${2.6 + i * 0.7}s ease-in-out ${i * 0.9}s infinite`,
              }}
            >
              {e}
            </span>
          ))}
        </div>
      )}
      {/* base row (easter eggs at the button's foot) */}
      {t.base && (
        <div style={{ position: 'absolute', left: '50%', bottom: -10, transform: 'translateX(-50%)', display: 'flex', gap: 4, fontSize: 15 }}>
          {t.base.map((e, i) => <span key={i}>{e}</span>)}
        </div>
      )}
      {/* starfield twinkles */}
      {t.twinkle && (
        <div className="absolute inset-0">
          {t.twinkle.map((e, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: `${12 + i * 24}%`, top: `${8 + ((i * 37) % 60)}%`,
                fontSize: 13, color: '#cfe9ff',
                animation: `psd-twinkle ${1.8 + i * 0.5}s ease-in-out ${i * 0.4}s infinite`,
              }}
            >
              {e}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Garnish beside "SELECT YOUR SATELLITES" in the fullscreen menu overlay.
export function MenuHeaderDecor() {
  const t = useTheme();
  const season = useMemo(() => getSeason(new Date()), []);
  if (!t || !season) return null;
  const pick = t.orbit?.[0] || t.pin || t.hat || t.wisp || t.rise?.[0] || t.fall?.[0] || t.burst?.[0] || t.base?.[0] || t.twinkle?.[0] || '✦';
  return (
    <span aria-hidden="true" className="pointer-events-none select-none" style={{ fontSize: 18, animation: 'psd-bob 3.5s ease-in-out infinite', display: 'inline-block' }}>
      <style>{CSS}</style>
      {pick}
    </span>
  );
}
