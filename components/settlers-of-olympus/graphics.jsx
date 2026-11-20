// components/settlers-of-olympus/graphics.jsx — Settlers of Olympus art only.
//
// Pure SVG React components. No hooks, no external images, no extra deps.
// No words on any piece that sits on an orb (orbs are the page's job).
//
// HOW TO WIRE IN (page worker):
// - Every component below renders a nested <svg> positioned by its TOP-LEFT
//   (x, y) in the parent SVG's units, EXCEPT the pieces, which are also
//   nested <svg>s positioned by top-left. So: to centre a piece at board
//   point (px, py), render it with x={px - size/2} y={py - size/2}.
// - Board geometry (from app/settlers-of-olympus/page.jsx): HEX_SIZE = 34,
//   pointy-top hexes, axialToPixel(q, r, 34). A hex tile is 68x68 units:
//   <HexTileArt terrain={h.terrain} size={34} x={cx - 34} y={cy - 34} />.
//   The number token (r=13 circle) sits on top of the tile, so every tile
//   keeps its centre disc (r < 14) clear.
// - Ports sit at portPos(): <PortArt type={port.type} size={32}
//   x={pos.x - 16} y={pos.y - 16} /> (page's old port circle was r=13).
// - Roads run along edges of length 34: <RoadPiece color angle={deg}
//   size={34} x={mx - 17} y={my - 17} /> where (mx, my) is the edge
//   midpoint and angle = atan2(dy, dx) in degrees. Ships the same way.
// - Settlements/cities sit on vertices: <SettlementPiece color size={24}
//   x={vx - 12} y={vy - 12} />. Robber/pirate sit on hex centres like the
//   old "R" badge: x={cx - 12} y={cy - 12} size={24}.
// - Cards are standalone: <CardFace kind="wood" width={120} height={168} />
//   in normal HTML flow (no x/y needed outside an SVG).
// - Dice: <DiceFace value={d1} kind="red" size={48} />,
//   <DiceFace value={d2} kind="yellow" size={48} />,
//   <DiceFace kind="event" face="ship" size={48} /> (Cities & Knights).
// - Colours match lib/settlers-of-olympus/engine.js RESOURCE_COLOR exactly.
// - The omega matches lib/omega-brand.js exactly (see OmegaMark): gradient
//   #fff3c4 -> #ffd700 -> #c9962e -> #8a5a14, Georgia 900 serif Omega,
//   glow rgba(255,200,60,0.8) blur 8, ring #e8b93c.

import React from 'react';

// ---------------------------------------------------------------------------
// House brand — golden omega (lib/omega-brand.js, canvas original)
// ---------------------------------------------------------------------------
// Canvas spec: 128px, gradient (0,18)->(0,112): 0 #fff3c4, 0.45 #ffd700,
// 0.75 #c9962e, 1 #8a5a14; font '900 88px Georgia, "Times New Roman", serif';
// Omega at (64,68); shadow rgba(255,200,60,0.8) blur 8; ring arc r=57,
// stroke #e8b93c, width 3. This SVG is the same mark, same numbers.
export function OmegaMark({ size = 48, x, y }) {
  return (
    <svg width={size} height={size} x={x} y={y} viewBox="0 0 128 128" role="img" aria-label="Omega">
      <defs>
        <linearGradient id="ssoOmegaGold" gradientUnits="userSpaceOnUse" x1="0" y1="18" x2="0" y2="112">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.45" stopColor="#ffd700" />
          <stop offset="0.75" stopColor="#c9962e" />
          <stop offset="1" stopColor="#8a5a14" />
        </linearGradient>
        <filter id="ssoOmegaGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#ffc83c" floodOpacity="0.8" />
        </filter>
      </defs>
      <text
        x="64" y="68" textAnchor="middle" dominantBaseline="central"
        fontFamily="Georgia, 'Times New Roman', serif" fontWeight="900" fontSize="88"
        fill="url(#ssoOmegaGold)" filter="url(#ssoOmegaGlow)"
      >
        Ω
      </text>
      <circle cx="64" cy="64" r="57" fill="none" stroke="#e8b93c" strokeWidth="3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Hex tiles — one illustrated face per terrain.
// viewBox is a fixed 68x68 (HEX_SIZE 34) so `size` scales it cleanly.
// The centre disc (r < 14) is kept clear for the number token.
// ---------------------------------------------------------------------------
const TERRAIN_FILL = {
  wood: '#2d6a2e', brick: '#b5492a', sheep: '#7fb069', wheat: '#e3a008',
  ore: '#6b7280', sea: '#1d4e79', gold: '#d4af37', lake: '#7fb3d5',
  oasis: '#c2b280', desert: '#d9c08a',
};

// Pointy-top hex polygon for radius 34 (matches the page's hexPoints()).
const HEX_POINTS = [0, 1, 2, 3, 4, 5].map((i) => {
  const a = (Math.PI / 180) * (30 + 60 * i);
  return `${(34 * Math.cos(a)).toFixed(1)},${(34 * Math.sin(a)).toFixed(1)}`;
}).join(' ');

function Pine({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-1.5" y="4" width="3" height="6" fill="#5d3a1a" />
      <polygon points="0,-12 -8,5 8,5" fill="#14532d" stroke="#0b1f14" strokeWidth="1.5" strokeLinejoin="round" />
      <polygon points="0,-12 -5,0 5,0" fill="#166534" />
    </g>
  );
}

function Sheep({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <line x1="-5" y1="5" x2="-5" y2="9" stroke="#1c1917" strokeWidth="1.5" />
      <line x1="5" y1="5" x2="5" y2="9" stroke="#1c1917" strokeWidth="1.5" />
      <ellipse cx="0" cy="0" rx="10" ry="6.5" fill="#fafaf9" stroke="#d6d3d1" strokeWidth="1" />
      <circle cx="9" cy="-3" r="3.5" fill="#1c1917" />
      <circle cx="10" cy="-4" r="1" fill="#fff" />
    </g>
  );
}

function WheatStalk({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} stroke="#92400e" strokeWidth="1.5">
      <line x1="0" y1="0" x2="0" y2="12" />
      <ellipse cx="-3" cy="-2" rx="2.5" ry="4.5" fill="#fef3c7" transform="rotate(-25 -3 -2)" />
      <ellipse cx="3" cy="-2" rx="2.5" ry="4.5" fill="#fef3c7" transform="rotate(25 3 -2)" />
      <ellipse cx="0" cy="-7" rx="2.5" ry="5" fill="#fef3c7" />
    </g>
  );
}

function HexArt({ terrain }) {
  switch (terrain) {
    case 'wood':
      return (
        <g>
          <Pine x={-19} y={-13} />
          <Pine x={19} y={-13} />
          <Pine x={0} y={23} s={0.8} />
          <circle cx={-8} cy={20} r="4" fill="#1f4d1f" />
          <circle cx={10} cy={-22} r="4" fill="#1f4d1f" />
        </g>
      );
    case 'sheep':
      return (
        <g>
          <Sheep x={-15} y={-14} />
          <Sheep x={15} y={13} />
          <path d="M-24,22 q4,-4 8,0 M14,-22 q4,-4 8,0" fill="none" stroke="#4d7c4d" strokeWidth="2" strokeLinecap="round" />
          <circle cx={-22} cy={-20} r="2.5" fill="#fafaf9" />
          <circle cx={22} cy={20} r="2.5" fill="#fafaf9" />
        </g>
      );
    case 'wheat':
      return (
        <g>
          <WheatStalk x={-20} y={-12} />
          <WheatStalk x={20} y={-12} />
          <WheatStalk x={0} y={21} s={0.8} />
          <path d="M-26,8 q8,-4 16,0 M10,8 q8,-4 16,0" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    case 'brick':
      return (
        <g>
          <path d="M-30,26 Q-15,6 0,26 Q15,10 30,26" fill="#7c2d12" />
          <path d="M-30,26 Q-15,14 0,26 Q15,18 30,26" fill="#9a3412" />
          <g fill="#7f1d1d" stroke="#450a0a" strokeWidth="1">
            <rect x="-28" y="-24" width="12" height="6" rx="1" />
            <rect x="-14" y="-24" width="12" height="6" rx="1" />
            <rect x="16" y="-24" width="12" height="6" rx="1" />
            <rect x="-21" y="-16" width="12" height="6" rx="1" />
            <rect x="21" y="-16" width="12" height="6" rx="1" />
          </g>
        </g>
      );
    case 'ore':
      return (
        <g>
          <polygon points="-30,26 -20,-6 -8,26" fill="#374151" stroke="#111827" strokeWidth="1.5" strokeLinejoin="round" />
          <polygon points="-20,-6 -23,-1 -17,-1" fill="#f8fafc" />
          <polygon points="30,26 20,-6 8,26" fill="#4b5563" stroke="#111827" strokeWidth="1.5" strokeLinejoin="round" />
          <polygon points="20,-6 17,-1 23,-1" fill="#f8fafc" />
          <circle cx="-18" cy="10" r="2.5" fill="#e5e7eb" />
          <circle cx="-14" cy="18" r="2" fill="#e5e7eb" />
          <circle cx="18" cy="12" r="2.5" fill="#e5e7eb" />
          <circle cx="-2" cy="26" r="3" fill="#9ca3af" stroke="#111827" strokeWidth="1" />
        </g>
      );
    case 'desert':
      return (
        <g>
          <circle cx="17" cy="-19" r="6" fill="#f59e0b" stroke="#b45309" strokeWidth="1.5" />
          <path d="M-30,18 Q-10,10 12,20 T30,18" fill="none" stroke="#b45309" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M-30,28 Q-8,20 14,28" fill="none" stroke="#b45309" strokeWidth="2.5" strokeLinecap="round" />
          <g fill="#166534" stroke="#14532d" strokeWidth="1">
            <rect x="-24" y="-20" width="5" height="14" rx="2.5" />
            <rect x="-28" y="-14" width="4" height="7" rx="2" transform="rotate(-30 -26 -11)" />
            <rect x="-19" y="-14" width="4" height="7" rx="2" transform="rotate(30 -17 -11)" />
          </g>
        </g>
      );
    case 'sea':
      return (
        <g fill="none" stroke="#7dd3fc" strokeWidth="3" strokeLinecap="round">
          <path d="M-26,-18 q6,-6 12,0 t12,0" />
          <path d="M14,-24 q6,-6 12,0" />
          <path d="M-26,20 q6,-6 12,0 t12,0" />
          <path d="M-28,2 q5,-5 10,0" />
          <path d="M18,2 q5,-5 10,0" />
        </g>
      );
    case 'gold':
      return (
        <g>
          <g fill="#fbbf24" stroke="#92400e" strokeWidth="1.5">
            <circle cx="-18" cy="-14" r="7" />
            <circle cx="18" cy="-14" r="7" />
            <circle cx="0" cy="22" r="7" />
          </g>
          <g fill="none" stroke="#92400e" strokeWidth="1.5">
            <circle cx="-18" cy="-14" r="3.5" />
            <circle cx="18" cy="-14" r="3.5" />
            <circle cx="0" cy="22" r="3.5" />
          </g>
          <path d="M-6,-24 l2,5 5,2 -5,2 -2,5 -2,-5 -5,-2 5,-2 z" fill="#fff7cc" />
          <path d="M22,6 l1.5,4 4,1.5 -4,1.5 -1.5,4 -1.5,-4 -4,-1.5 4,-1.5 z" fill="#fff7cc" />
        </g>
      );
    case 'lake':
      return (
        <g>
          <g fill="none" stroke="#e0f2fe" strokeWidth="3" strokeLinecap="round">
            <path d="M-26,-18 q6,-6 12,0 t12,0" />
            <path d="M-26,22 q6,-6 12,0 t12,0" />
          </g>
          <g fill="#f97316" stroke="#7c2d12" strokeWidth="1">
            <g transform="translate(-19 0)">
              <ellipse cx="0" cy="0" rx="5" ry="3" />
              <polygon points="-5,0 -9,-3.5 -9,3.5" />
            </g>
            <g transform="translate(19 0)">
              <ellipse cx="0" cy="0" rx="5" ry="3" />
              <polygon points="5,0 9,-3.5 9,3.5" />
            </g>
          </g>
        </g>
      );
    case 'oasis':
      return (
        <g>
          <path d="M-16,-18 Q-12,-4 -16,8" fill="none" stroke="#5d3a1a" strokeWidth="4" strokeLinecap="round" />
          <g stroke="#166534" strokeWidth="3" strokeLinecap="round">
            <path d="M-16,-18 Q-26,-24 -30,-16" fill="none" />
            <path d="M-16,-18 Q-6,-24 -2,-16" fill="none" />
            <path d="M-16,-18 Q-16,-28 -16,-30" fill="none" />
          </g>
          <ellipse cx="12" cy="18" rx="14" ry="6" fill="#38bdf8" stroke="#0369a1" strokeWidth="1.5" />
          <path d="M-28,24 Q-10,16 8,24" fill="none" stroke="#92400e" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      );
    default:
      return null;
  }
}

export function HexTileArt({ terrain = 'wood', size = 34, x, y }) {
  return (
    <svg width={size * 2} height={size * 2} x={x} y={y} viewBox="-34 -34 68 68" role="img" aria-label={`${terrain} hex`}>
      <polygon points={HEX_POINTS} fill={TERRAIN_FILL[terrain] || TERRAIN_FILL.desert} stroke="#0b1f14" strokeWidth="1.5" strokeLinejoin="round" />
      <HexArt terrain={terrain} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Ports — coast markers. type: 'any' (3:1) or a resource ('wood','brick',
// 'sheep','wheat','ore') for the 2:1 ports. The coloured arc names the
// resource; the rate text is on the marker, never on an orb.
// ---------------------------------------------------------------------------
const PORT_LABEL = { any: '3:1', wood: '2:1', brick: '2:1', sheep: '2:1', wheat: '2:1', ore: '2:1' };

export function PortArt({ type = 'any', size = 32, x, y }) {
  const isAny = type === 'any';
  const arcColor = isAny ? '#e8b93c' : (TERRAIN_FILL[type] || '#e8b93c');
  return (
    <svg width={size} height={size} x={x} y={y} viewBox="-20 -20 40 40" role="img" aria-label={`${isAny ? '3:1' : `${type} 2:1`} port`}>
      <circle cx="0" cy="0" r="18" fill="#f5eeda" stroke="#0b1f14" strokeWidth="2" />
      <path d="M-18,0 A18,18 0 0 1 18,0" fill="none" stroke={arcColor} strokeWidth="4" />
      <g stroke="#1c1917" strokeWidth="2.5" strokeLinecap="round" fill="none" transform="translate(0 -3)">
        <line x1="0" y1="-7" x2="0" y2="7" />
        <line x1="-5" y1="-4" x2="5" y2="-4" />
        <path d="M-6,1 Q-6,7 0,7 Q6,7 6,1" />
      </g>
      <text x="0" y="15" textAnchor="middle" fontSize="9" fontWeight="800" fill="#1c1917" fontFamily="Georgia, serif">
        {PORT_LABEL[type] || '3:1'}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Cards — resource, commodity (Cities & Knights), development, progress.
// kind: 'wood'|'brick'|'sheep'|'wheat'|'ore' (resources),
//   'paper'|'cloth'|'coin' (commodities),
//   'knight'|'victoryPoint'|'monopoly'|'yearOfPlenty'|'roadBuilding' (dev),
//   or any Cities & Knights progress type (alchemist, crane, ...).
// Faces carry a bold icon, a plain-English name and a short effect line.
// Backs carry the OmegaMark and nothing else.
// ---------------------------------------------------------------------------
const CARD_INFO = {
  wood: { name: 'Wood', color: '#2d6a2e', icon: '🌲', lines: ['Builds roads', 'and settlements.'] },
  brick: { name: 'Brick', color: '#b5492a', icon: '🧱', lines: ['Builds roads', 'and settlements.'] },
  sheep: { name: 'Sheep', color: '#4d7c4d', icon: '🐑', lines: ['Builds settlements', 'and buys cards.'] },
  wheat: { name: 'Wheat', color: '#b45309', icon: '🌾', lines: ['Builds settlements', 'and cities.'] },
  ore: { name: 'Ore', color: '#4b5563', icon: '⛰️', lines: ['Builds cities', 'and buys cards.'] },
  paper: { name: 'Paper', color: '#0e7490', icon: '📄', lines: ['Science goods.', 'Improve your cities.'] },
  cloth: { name: 'Cloth', color: '#7c3aed', icon: '🧵', lines: ['Trade goods.', 'Improve your cities.'] },
  coin: { name: 'Coin', color: '#b45309', icon: '🪙', lines: ['Politics goods.', 'Improve your cities.'] },
  knight: { name: 'Knight', color: '#78350f', icon: '⚔️', lines: ['Move the robber,', 'steal 1 card.'] },
  victoryPoint: { name: 'Victory Point', color: '#78350f', icon: '⭐', lines: ['Worth 1 point.', 'Keep it secret.'] },
  monopoly: { name: 'Monopoly', color: '#78350f', icon: '👑', lines: ['Name a resource.', 'Take it from everyone.'] },
  yearOfPlenty: { name: 'Year of Plenty', color: '#78350f', icon: '🌾', lines: ['Take any 2 resources', 'from the bank.'] },
  roadBuilding: { name: 'Road Building', color: '#78350f', icon: '🛣️', lines: ['Build 2 roads', 'for free.'] },
};

const PROGRESS_NAMES = {
  alchemist: 'Alchemist', crane: 'Crane', engineer: 'Engineer', inventor: 'Inventor',
  irrigation: 'Irrigation', medicine: 'Medicine', mining: 'Mining', printer: 'Printer',
  smith: 'Smith', bishop: 'Bishop', constitution: 'Constitution', deserter: 'Deserter',
  diplomat: 'Diplomat', intrigue: 'Intrigue', saboteur: 'Saboteur', spy: 'Spy',
  warlord: 'Warlord', wedding: 'Wedding', commercialHarbor: 'Commercial Harbor',
  masterMerchant: 'Master Merchant', merchant: 'Merchant', merchantFleet: 'Merchant Fleet',
  resourceMonopoly: 'Resource Monopoly', tradeMonopoly: 'Trade Monopoly',
};

const PROGRESS_COLOR = {
  alchemist: '#15803d', crane: '#15803d', engineer: '#15803d', inventor: '#15803d',
  irrigation: '#15803d', medicine: '#15803d', mining: '#15803d', printer: '#15803d',
  smith: '#15803d', roadBuilding: '#15803d',
  bishop: '#1d4ed8', constitution: '#1d4ed8', deserter: '#1d4ed8', diplomat: '#1d4ed8',
  intrigue: '#1d4ed8', saboteur: '#1d4ed8', spy: '#1d4ed8', warlord: '#1d4ed8', wedding: '#1d4ed8',
  commercialHarbor: '#b45309', masterMerchant: '#b45309', merchant: '#b45309',
  merchantFleet: '#b45309', resourceMonopoly: '#b45309', tradeMonopoly: '#b45309',
};

export function CardFace({ kind = 'wood', width = 120, height = 168, x, y }) {
  const info = CARD_INFO[kind] || (PROGRESS_NAMES[kind]
    ? { name: PROGRESS_NAMES[kind], color: PROGRESS_COLOR[kind] || '#78350f', icon: '📜', lines: ['Progress card.', 'Cities & Knights.'] }
    : { name: kind, color: '#78350f', icon: '🃏', lines: ['Development card.'] });
  return (
    <svg width={width} height={height} x={x} y={y} viewBox="0 0 120 168" role="img" aria-label={`${info.name} card`}>
      <rect x="2" y="2" width="116" height="164" rx="10" fill="#f5eeda" stroke="#8a5a14" strokeWidth="3" />
      <path d="M2,12 a10,10 0 0 1 10,-10 h96 a10,10 0 0 1 10,10 v22 h-116 z" fill={info.color} />
      <text x="60" y="26" textAnchor="middle" fontSize="14" fontWeight="800" fill="#fff" fontFamily="Georgia, serif">
        {info.name}
      </text>
      <text x="60" y="98" textAnchor="middle" fontSize="42">{info.icon}</text>
      {info.lines.map((line, i) => (
        <text key={i} x="60" y={126 + i * 15} textAnchor="middle" fontSize="11.5" fill="#1c1917" fontFamily="Georgia, serif">
          {line}
        </text>
      ))}
      <text x="60" y="160" textAnchor="middle" fontSize="12" fill="#c9962e" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="900">Ω</text>
    </svg>
  );
}

export function CardBack({ width = 120, height = 168, x, y }) {
  const s = 72;
  return (
    <svg width={width} height={height} x={x} y={y} viewBox="0 0 120 168" role="img" aria-label="Card back">
      <rect x="2" y="2" width="116" height="164" rx="10" fill="#123524" stroke="#e8b93c" strokeWidth="3" />
      <rect x="9" y="9" width="102" height="150" rx="7" fill="none" stroke="#e8b93c" strokeWidth="1" opacity="0.6" />
      <OmegaMark size={s} x={(120 - s) / 2} y={(168 - s) / 2} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Dice — two standard dice (red + yellow, the Cities & Knights pair) with
// pips, plus the event die (face: 'ship' | 'science' | 'trade' | 'politics').
// ---------------------------------------------------------------------------
const PIP = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

const EVENT_FACE_COLOR = { ship: '#1c1917', science: '#15803d', trade: '#b45309', politics: '#1d4ed8' };

function EventFaceArt({ face }) {
  const color = EVENT_FACE_COLOR[face] || '#1c1917';
  if (face === 'ship') {
    return (
      <g fill={color}>
        <path d="M10,30 L38,30 L34,38 L14,38 Z" />
        <rect x="23" y="10" width="2.5" height="20" />
        <polygon points="25.5,11 25.5,24 36,24" />
      </g>
    );
  }
  if (face === 'science') {
    return (
      <g>
        <circle cx="24" cy="24" r="15" fill={color} />
        <circle cx="24" cy="24" r="9" fill="none" stroke="#fff" strokeWidth="2" />
        <circle cx="24" cy="24" r="3" fill="#fff" />
      </g>
    );
  }
  if (face === 'trade') {
    return (
      <g>
        <circle cx="24" cy="24" r="15" fill="#fbbf24" stroke={color} strokeWidth="2.5" />
        <circle cx="24" cy="24" r="9" fill="none" stroke={color} strokeWidth="2" />
        <text x="24" y="29" textAnchor="middle" fontSize="13" fontWeight="900" fill={color} fontFamily="Georgia, serif">Ω</text>
      </g>
    );
  }
  // politics
  return (
    <g fill={color} stroke={color} strokeWidth="1.5" strokeLinejoin="round">
      <polygon points="11,32 11,20 17,26 24,15 31,26 37,20 37,32" />
      <rect x="11" y="32" width="26" height="4" />
    </g>
  );
}

export function DiceFace({ value = 1, kind = 'red', face = 'ship', size = 48, x, y }) {
  const isEvent = kind === 'event';
  const fill = isEvent ? '#f5f5f4' : kind === 'yellow' ? '#eab308' : '#dc2626';
  const pipColor = kind === 'yellow' ? '#1c1917' : '#ffffff';
  const pips = PIP[Math.min(6, Math.max(1, value || 1))] || PIP[1];
  return (
    <svg width={size} height={size} x={x} y={y} viewBox="0 0 48 48" role="img" aria-label={isEvent ? `Event die: ${face}` : `${kind} die: ${value}`}>
      <rect x="2" y="2" width="44" height="44" rx="9" fill={fill} stroke="#111827" strokeWidth="2" />
      {isEvent
        ? <EventFaceArt face={face} />
        : pips.map(([dx, dy], i) => (
          <circle key={i} cx={24 + dx * 10} cy={24 + dy * 10} r="4.5" fill={pipColor} />
        ))}
    </svg>
  );
}

// Barbarian-ship marker for the Cities & Knights barbarian track (7 steps).
export function BarbarianShipMarker({ size = 32, x, y }) {
  return (
    <svg width={size} height={size} x={x} y={y} viewBox="-16 -16 32 32" role="img" aria-label="Barbarian ship">
      <polygon points="0,-13 0,1 10,-1" fill="#dc2626" stroke="#7f1d1d" strokeWidth="1" />
      <rect x="-1" y="-13" width="2" height="15" fill="#1c1917" />
      <path d="M-13,2 L13,2 L9,10 L-9,10 Z" fill="#111827" stroke="#000" strokeWidth="1.5" />
      <circle cx="-5" cy="5" r="1.5" fill="#fff" />
      <circle cx="5" cy="5" r="1.5" fill="#fff" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pieces — chunky, colour-filled, readable at ~20px. Each is a nested <svg>
// positioned by its TOP-LEFT (x, y); centre it with x = cx - size/2.
// Road/ship length matches the board edge (34 units at size 34); rotate
// them with `angle` (degrees, 0 = horizontal) around their centre.
// ---------------------------------------------------------------------------
function PieceSvg({ size, x, y, label, children }) {
  return (
    <svg width={size} height={size} x={x} y={y} viewBox="-12 -12 24 24" role="img" aria-label={label}>
      {children}
    </svg>
  );
}

export function SettlementPiece({ color = '#2563eb', size = 24, x, y }) {
  return (
    <PieceSvg size={size} x={x} y={y} label="Settlement">
      <rect x="-6" y="-1" width="12" height="8" fill={color} stroke="#111827" strokeWidth="1.2" />
      <polygon points="-8,-1 0,-9 8,-1" fill={color} stroke="#111827" strokeWidth="1.2" strokeLinejoin="round" />
    </PieceSvg>
  );
}

export function CityPiece({ color = '#2563eb', size = 32, x, y }) {
  return (
    <PieceSvg size={size} x={x} y={y} label="City">
      <rect x="-3" y="-11" width="6" height="5" fill={color} stroke="#111827" strokeWidth="1.2" />
      <rect x="-7" y="-1" width="14" height="9" fill={color} stroke="#111827" strokeWidth="1.2" />
      <polygon points="-9,-1 0,-10 9,-1" fill={color} stroke="#111827" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="3" y="1" width="4" height="4" fill="#111827" opacity="0.35" />
    </PieceSvg>
  );
}

export function RoadPiece({ color = '#2563eb', size = 34, angle = 0, x, y }) {
  return (
    <PieceSvg size={size} x={x} y={y} label="Road">
      <g transform={`rotate(${angle} 0 0)`}>
        <line x1="-14" y1="0" x2="14" y2="0" stroke="#111827" strokeWidth="8.5" strokeLinecap="round" />
        <line x1="-14" y1="0" x2="14" y2="0" stroke={color} strokeWidth="5.5" strokeLinecap="round" />
      </g>
    </PieceSvg>
  );
}

export function ShipPiece({ color = '#2563eb', size = 34, angle = 0, x, y }) {
  return (
    <PieceSvg size={size} x={x} y={y} label="Ship">
      <g transform={`rotate(${angle} 0 0)`}>
        <polygon points="0,-11 0,0 9,-1" fill="#f5eeda" stroke="#111827" strokeWidth="1.2" strokeLinejoin="round" />
        <line x1="0" y1="-11" x2="0" y2="2" stroke="#111827" strokeWidth="1.5" />
        <path d="M-11,2 L11,2 L8,8 L-8,8 Z" fill={color} stroke="#111827" strokeWidth="1.2" strokeLinejoin="round" />
      </g>
    </PieceSvg>
  );
}

export function KnightPiece({ color = '#2563eb', level = 1, size = 24, x, y }) {
  const lvl = Math.min(3, Math.max(1, level || 1));
  // Own viewBox (24x26): the level pips sit below the shield at y=13.5,
  // outside the standard 24x24 piece box.
  return (
    <svg width={size} height={(size * 26) / 24} x={x} y={y} viewBox="-12 -12 24 26" role="img" aria-label={`Knight level ${lvl}`}>
      <path d="M0,-10 L8,-6 L8,2 L0,10 L-8,2 L-8,-6 Z" fill={color} stroke="#111827" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="0" y1="-6" x2="0" y2="6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <line x1="-4" y1="-2" x2="4" y2="-2" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      {Array.from({ length: lvl }).map((_, i) => (
        <circle key={i} cx={(i - (lvl - 1) / 2) * 6} cy="13.5" r="1.8" fill="#fbbf24" stroke="#111827" strokeWidth="0.8" />
      ))}
    </svg>
  );
}

export function RobberPiece({ size = 24, x, y }) {
  return (
    <PieceSvg size={size} x={x} y={y} label="Robber">
      <path d="M0,-11 C-7,-8 -9,2 -9,9 L9,9 C9,2 7,-8 0,-11 Z" fill="#111827" stroke="#f8fafc" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="-3" cy="-2" r="1.3" fill="#fff" />
      <circle cx="3" cy="-2" r="1.3" fill="#fff" />
    </PieceSvg>
  );
}

export function PiratePiece({ size = 24, x, y }) {
  return (
    <PieceSvg size={size} x={x} y={y} label="Pirate">
      <rect x="-1" y="-11" width="2" height="13" fill="#111827" />
      <polygon points="1,-11 10,-8 1,-5" fill="#111827" stroke="#f8fafc" strokeWidth="0.8" />
      <circle cx="5" cy="-8" r="1.2" fill="#fff" />
      <path d="M-10,2 L10,2 L7,8 L-7,8 Z" fill="#1f2937" stroke="#f8fafc" strokeWidth="1.2" strokeLinejoin="round" />
    </PieceSvg>
  );
}

// ---------------------------------------------------------------------------
// Menu art — title screen. The only text in the module besides card faces
// and port rates. Sized for the game menu / loading screen.
// ---------------------------------------------------------------------------
export function MenuArt({ width = 480, height = 260, x, y }) {
  return (
    <svg width={width} height={height} x={x} y={y} viewBox="0 0 480 260" role="img" aria-label="Settlers of Olympus">
      <defs>
        <linearGradient id="ssoMenuGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.45" stopColor="#ffd700" />
          <stop offset="0.75" stopColor="#c9962e" />
          <stop offset="1" stopColor="#8a5a14" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="474" height="254" rx="18" fill="#123524" stroke="#e8b93c" strokeWidth="3" />
      <OmegaMark size={104} x={188} y={22} />
      <text x="240" y="196" textAnchor="middle" fontSize="40" fontWeight="800" fill="url(#ssoMenuGold)" fontFamily="Georgia, 'Times New Roman', serif">
        Settlers of Olympus
      </text>
      <line x1="120" y1="216" x2="215" y2="216" stroke="#e8b93c" strokeWidth="2" />
      <line x1="265" y1="216" x2="360" y2="216" stroke="#e8b93c" strokeWidth="2" />
      <text x="240" y="222" textAnchor="middle" fontSize="16" fontWeight="900" fill="#e8b93c" fontFamily="Georgia, 'Times New Roman', serif">Ω</text>
    </svg>
  );
}
