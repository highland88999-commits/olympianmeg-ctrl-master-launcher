'use client';
// components/aphrodite/icons.jsx — shared inline SVG glyph system for the
// APHRODITE batch (People, Community & Cities). Zero image weight: every
// glyph is a stroke path in currentColor so it adapts to each program's
// chrome (Tailwind classes or inline styles).

const PATHS = {
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="m4 12.5 5 5L20 6.5" />,
  minus: <path d="M5 12h14" />,
  'arrow-left': <path d="M19 12H5m6-6-6 6 6 6" />,
  'arrow-right': <path d="M5 12h14m-6-6 6 6-6 6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  pen: <path d="M14 5l5 5L8 21H3v-5L14 5zM12.5 6.5l5 5" />,
  play: <path d="M8 5.5v13l11-6.5z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  bolt: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />,
  cloud: <path d="M7 18a4 4 0 1 1 .6-7.96A5.5 5.5 0 0 1 18.3 12H19a3 3 0 0 1 0 6H7z" />,
  city: <path d="M4 21V9l5-3v15M9 21V4h6v17M15 21v-8h5v8M2 21h20" />,
  crosshair: <><circle cx="12" cy="12" r="7" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></>,
  home: <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9z" />,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></>,
  backpack: <path d="M8 8V6a4 4 0 0 1 8 0v2M6 8h12l1 12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1L6 8zM10 12v5M14 12v5" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 5-5.5 8-5.5s6.5 1.5 8 5.5" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1.2-3.4 4-5 6.5-5s5.3 1.6 6.5 5M16 4.7a3.5 3.5 0 0 1 0 6.6M17.5 15.2c2 .6 3.4 2 4 4.8" /></>,
  'door-exit': <path d="M14 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8M10 12h11m-3-3 3 3-3 3" />,
  grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18" /></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M12 15h5" /></>,
  sunrise: <><path d="M4 18h16M8 18a4 4 0 0 1 8 0M12 6v4M5.6 8.6l1.4 1.4M18.4 8.6 17 10M12 2v1" /><path d="m9 5 3-3 3 3" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>,
  sunset: <><path d="M4 18h16M8 18a4 4 0 0 1 8 0M12 10V6M5.6 12.4 7 11M18.4 12.4 17 11M12 2v1" /><path d="m9 9 3 3 3-3" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />,
  cars: <><path d="M5 16l1.5-5A2 2 0 0 1 8.4 9.5h7.2a2 2 0 0 1 1.9 1.5L19 16M5 16h14M5 16v3M19 16v3" /><circle cx="8.5" cy="19" r="1.4" /><circle cx="15.5" cy="19" r="1.4" /></>,
  rocket: <path d="M12 2c3.5 2.5 5 6.5 5 11l-5 3-5-3c0-4.5 1.5-8.5 5-11zM12 16v5M7 13l-3 4M17 13l3 4" />,
  antenna: <><path d="M12 13v8M8 21h8" /><circle cx="12" cy="10" r="3" /><path d="M6.5 6.5a7.8 7.8 0 0 1 11 0M4 4a11.5 11.5 0 0 1 16 0" /></>,
  pin: <><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></>,
  tower: <path d="M9 21h6M10 21V8l-3-5h10l-3 5v13M10 12h4M9.5 16h5" />,
  walk: <><circle cx="13" cy="4.5" r="2" /><path d="M13 8 9 12l2 4-1 5M13 8l4 2 3 1M13 8l-1 6 4 2 1 5" /></>,
  orbit: <><circle cx="12" cy="12" r="3" /><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-20 12 12)" /></>,
  flame: <path d="M12 2s6 5.5 6 11a6 6 0 0 1-12 0c0-2.5 1.2-4.6 2.6-6.4.4 1.6 1.2 2.7 2.4 3.4C11 7 11.4 4.4 12 2z" />,
  book: <path d="M5 3h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V3zM5 17a2 2 0 0 1 2-2h11" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  bookmark: <path d="M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1z" />,
  share: <><circle cx="6" cy="12" r="2.6" /><circle cx="17" cy="5.5" r="2.6" /><circle cx="17" cy="18.5" r="2.6" /><path d="m8.3 10.8 6.4-4M8.3 13.2l6.4 4" /></>,
  trash: <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 13a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" />,
  camera: <><rect x="3" y="7" width="18" height="13" rx="2" /><circle cx="12" cy="13" r="3.6" /><path d="M8 7l1.5-3h5L16 7" /></>,
  dice: <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1.3" /><circle cx="15" cy="9" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="9" cy="15" r="1.3" /><circle cx="15" cy="15" r="1.3" /></>,
  frame: <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />,
  ghost: <path d="M6 20V10a6 6 0 0 1 12 0v10l-3-2.4L12 20l-3-2.4L6 20zM9.5 11h.01M14.5 11h.01" />,
  map: <path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2-6-2zM9 4v14M15 6v14" />,
  eye: <><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  heart: <path d="M12 20.5S3.5 15.5 3.5 9.3A4.8 4.8 0 0 1 8.3 4.5c1.6 0 3 .9 3.7 2.1a4.8 4.8 0 0 1 3.7-2.1 4.8 4.8 0 0 1 4.8 4.8c0 6.2-8.5 11.2-8.5 11.2z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 5 5" /></>,
  layers: <path d="m12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5" />,
};

export default function AphroIcon({ name, size = 18, className, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0, verticalAlign: '-3px', ...(style || {}) }}
    >
      {PATHS[name] || PATHS.layers}
    </svg>
  );
}
