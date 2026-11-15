// lib/planets/planet-choosers.js
// Jupiter + Mars chooser menus (Merlin, 2026-11-15): tapping a planet in
// the hub offers its worlds, exactly like Earth's "Choose your Earth"
// chooser (app/page.jsx, Merlin 2026-10-31).
//
// The pattern, copied from Earth:
//   - Jupiter 1 / Mars 1 are IN-HUB realms with no route of their own —
//     like Earth 1, they live in the chooser only and have NO registry
//     entry (no god-menu satellite, no satellites.ts row, no locale keys).
//   - Jupiter 2 (/jupiter-2), Mars 2 (/mars-2) and Mars 1's second door
//     (/mars) are standalone routes ALREADY in BOTH registries
//     (lib/god-menus.js ARES + lib/i18n/satellites.ts ARGUS/OBSERVATORY,
//     titles + subtitles in all 34 locales) — nothing new to register.
//   - The chooser buttons use the planet's own image where one exists
//     (/planets/jupiter.jpg, /planets/mars.jpg), and a CSS gradient for
//     the "2" worlds — the same split Earth's chooser uses (real art for
//     Earth 1/2, gradients for Earth 3/4).
//
// Pure data only — app/page.jsx owns the state + handlers and renders
// these entries with the Earth chooser's exact structure.
export const PLANET_CHOOSERS = {
  jupiter: {
    title: 'Choose your Jupiter',
    subtitle: 'Two worlds. One tap.',
    background: '/planets/jupiter.jpg',
    options: [
      {
        id: 'jupiter-1',
        label: '🪐 Jupiter 1',
        description: 'The gas giant itself — walk its storm surface.',
        background: '/planets/jupiter.jpg',
        target: { kind: 'planet', key: 'jupiter' },
      },
      {
        id: 'jupiter-2',
        label: '⚡ Jupiter 2',
        description: 'Street-level storms, a speeder, lightning monsters and demobats.',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #3b2d5c 50%, #6d28d9 100%)',
        target: { kind: 'route', route: '/jupiter-2' },
      },
    ],
  },
  mars: {
    title: 'Choose your Mars',
    subtitle: 'Two worlds. One tap.',
    background: '/planets/mars.jpg',
    options: [
      {
        id: 'mars-1',
        label: '🔴 Mars 1',
        description: 'The red planet — seeded exobiology surface.',
        background: '/planets/mars.jpg',
        target: { kind: 'mars' },
      },
      {
        id: 'mars-2',
        label: '🚙 Mars 2',
        description: 'Driveable rovers and the ARES outpost.',
        background: 'linear-gradient(135deg, #2a0f0f 0%, #7f1d1d 50%, #b45309 100%)',
        target: { kind: 'route', route: '/mars-2' },
      },
    ],
  },
};
