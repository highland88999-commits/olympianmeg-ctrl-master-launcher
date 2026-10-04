'use client';
// HERMES-family inline SVG glyph system — zero image weight, gold-friendly.
// Every icon: 24x24 viewBox, stroke = currentColor. Usage:
//   import { CartIcon } from '@/lib/hermes-icons';
//   <CartIcon size={15} className="text-amber-300" />

function G({ size = 16, className = '', sw = 2, children, filled = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const CartIcon = (p) => (
  <G {...p}>
    <path d="M3 4h2l2.4 12.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6" />
    <circle cx="9" cy="20" r="1.5" />
    <circle cx="17" cy="20" r="1.5" />
  </G>
);

export const PhoneIcon = (p) => (
  <G {...p}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7A2 2 0 0 1 22 16.9z" />
  </G>
);

export const PhoneOffIcon = (p) => (
  <G {...p}>
    <path d="M10.7 13.3a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7A2 2 0 0 1 22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.1 9.9" />
    <path d="M23 1 1 23" />
  </G>
);

export const VideoIcon = (p) => (
  <G {...p}>
    <path d="M23 7l-7 5 7 5V7z" />
    <rect x="1" y="5" width="15" height="14" rx="2" />
  </G>
);

export const ChatIcon = (p) => (
  <G {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </G>
);

export const StepsIcon = (p) => (
  <G {...p}>
    <ellipse cx="9" cy="7.5" rx="2.8" ry="4.2" />
    <ellipse cx="15.5" cy="16" rx="2.8" ry="4.2" />
  </G>
);

export const UsersIcon = (p) => (
  <G {...p}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </G>
);

export const SendIcon = (p) => (
  <G {...p}>
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4z" />
  </G>
);

export const EraseIcon = (p) => (
  <G {...p}>
    <path d="M21 6H8l-5 6 5 6h13a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z" />
    <path d="M18 9l-6 6M12 9l6 6" />
  </G>
);

export const RocketIcon = (p) => (
  <G {...p}>
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </G>
);

export const OrbitIcon = (p) => (
  <G {...p}>
    <circle cx="12" cy="12" r="3" />
    <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-24 12 12)" />
    <circle cx="20.4" cy="7.6" r="1.4" fill="currentColor" stroke="none" />
  </G>
);

export const RadarIcon = (p) => (
  <G {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <path d="M12 12l6.5-6.5" />
  </G>
);

export const PinIcon = (p) => (
  <G {...p}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </G>
);

export const BoltIcon = (p) => (
  <G {...p}>
    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
  </G>
);

export const GiftIcon = (p) => (
  <G {...p}>
    <path d="M20 12v10H4V12" />
    <rect x="2" y="7" width="20" height="5" />
    <path d="M12 22V7" />
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
  </G>
);

export const DoorIcon = (p) => (
  <G {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </G>
);

export const ShipIcon = (p) => (
  <G {...p}>
    <path d="M3 16h18l-2.5 4.5h-13z" />
    <path d="M12 16V5" />
    <path d="M12 5c3.5 1 5.5 3.5 5.5 7H12z" />
    <path d="M12 5C8.5 6 6.5 8.5 6.5 12H12z" />
  </G>
);

export const AnchorIcon = (p) => (
  <G {...p}>
    <circle cx="12" cy="5" r="3" />
    <path d="M12 22V8" />
    <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
  </G>
);

export const SnowIcon = (p) => (
  <G {...p}>
    <path d="M12 2v20M4 6l16 12M20 6 4 18M12 6l-2-2m2 2 2-2M12 18l-2 2m2-2 2 2" />
  </G>
);

export const PlayIcon = (p) => (
  <G {...p} filled>
    <path d="M7 4.5v15l13-7.5z" />
  </G>
);

export const PauseIcon = (p) => (
  <G {...p} filled>
    <rect x="6" y="4" width="4.5" height="16" rx="1" />
    <rect x="13.5" y="4" width="4.5" height="16" rx="1" />
  </G>
);

export const GlobeIcon = (p) => (
  <G {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a14.5 14.5 0 0 1 0 18 14.5 14.5 0 0 1 0-18z" />
  </G>
);

export const MicIcon = (p) => (
  <G {...p}>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <path d="M12 19v4M8 23h8" />
  </G>
);

export const CompassIcon = (p) => (
  <G {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15.5 8.5 13.2 13.2 8.5 15.5l2.3-4.7z" fill="currentColor" stroke="none" />
  </G>
);

export const BookIcon = (p) => (
  <G {...p}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </G>
);

export const CrownIcon = (p) => (
  <G {...p}>
    <path d="M3 8l4 4 5-6 5 6 4-4-1.6 10.5H4.6z" />
  </G>
);

export const EyeIcon = (p) => (
  <G {...p}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </G>
);

export const CopyIcon = (p) => (
  <G {...p}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </G>
);

export const RotateIcon = (p) => (
  <G {...p}>
    <path d="M1 4v6h6" />
    <path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10" />
  </G>
);

export const CloudIcon = (p) => (
  <G {...p}>
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
  </G>
);

export const ArrowDownIcon = (p) => (
  <G {...p}>
    <path d="M12 5v14M19 12l-7 7-7-7" />
  </G>
);

export const ArrowUpIcon = (p) => (
  <G {...p}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </G>
);

export const PowerIcon = (p) => (
  <G {...p}>
    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
    <path d="M12 2v10" />
  </G>
);

export const GridIcon = (p) => (
  <G {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </G>
);

export const BikeIcon = (p) => (
  <G {...p}>
    <circle cx="5.5" cy="17.5" r="3.5" />
    <circle cx="18.5" cy="17.5" r="3.5" />
    <path d="M5.5 17.5 9.5 10h5l4 7.5M9.5 10 8 6h2.5" />
  </G>
);

export const WingIcon = (p) => (
  <G {...p}>
    <path d="M2 13c3.5-3.5 6.5-3.5 9 0 2.5-3.5 5.5-3.5 9 0" />
    <path d="M20 13c.8-.8 1.6-1.2 2.5-1.3" />
  </G>
);

export const FastForwardIcon = (p) => (
  <G {...p} filled>
    <path d="M13 5v14l8-7zM4 5v14l8-7z" />
  </G>
);

export const GoldBarIcon = (p) => (
  <G {...p}>
    <path d="M7 9h10l2.5 7h-15z" />
    <path d="M9.5 9 8 16M14.5 9 16 16" />
  </G>
);

export const PortalIcon = (p) => (
  <G {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 3.5a8.5 8.5 0 0 1 7.4 4.3" />
  </G>
);

export const SatelliteIcon = (p) => (
  <G {...p}>
    <rect x="9" y="9" width="6" height="6" rx="1" transform="rotate(45 12 12)" />
    <path d="M3 13l4-4M17 15l4-4M7 17l-3 4M17 7l3-4" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </G>
);

export const RouteIcon = (p) => (
  <G {...p}>
    <circle cx="6" cy="19" r="2.5" />
    <circle cx="18" cy="5" r="2.5" />
    <path d="M8.5 19H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5" />
  </G>
);
