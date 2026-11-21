// components/starforge/graphics.jsx — Starforge art only.
//
// Mostly pure SVG React components. No hooks, no external images, no extra
// deps. One exception: CardFace / CardBack layer a small muted looping
// video (public/videos/starforge/cards/) over the SVG face for the five
// base development cards and the card back — the SVG stays underneath as
// the poster/fallback, so a card still looks right if its video cannot
// play. Videos are lazy (preload="none": they only fetch when the card
// renders, i.e. when the Cards panel is open) and only in normal HTML
// flow — inside an SVG (x/y passed) the plain SVG renders instead.
// No words on any piece that sits on an orb (orbs are the page's job).
//
// HOW TO WIRE IN (page worker):
// - Every component below renders a nested <svg> positioned by its TOP-LEFT
//   (x, y) in the parent SVG's units, EXCEPT the pieces, which are also
//   nested <svg>s positioned by top-left. So: to centre a piece at board
//   point (px, py), render it with x={px - size/2} y={py - size/2}.
// - Board geometry (from app/starforge/page.jsx): HEX_SIZE = 34,
//   pointy-top hexes, axialToPixel(q, r, 34). A hex tile is 68x68 units:
//   <HexTileArt terrain={h.terrain} size={34} x={cx - 34} y={cy - 34} />.
//   The number token (r=13 circle) sits on top of the tile, so every tile
//   keeps its centre disc (r < 14) clear.
// - Hubs sit at hubPos(): <TradeHubArt type={hub.type} size={32}
//   x={pos.x - 16} y={pos.y - 16} /> (page's old hub circle was r=13).
// - Warp Lanes run along edges of length 34: <WarpLanePiece color angle={deg}
//   size={34} x={mx - 17} y={my - 17} /> where (mx, my) is the edge
//   midpoint and angle = atan2(dy, dx) in degrees. Starships the same way.
// - Outposts/stations sit on vertices: <OutpostPiece color size={24}
//   x={vx - 12} y={vy - 12} />. Void Pirate/corsair sit on hex centres like the
//   old "R" badge: x={cx - 12} y={cy - 12} size={24}.
// - Cards are standalone: <CardFace kind="iron" width={120} height={168} />
//   in normal HTML flow (no x/y needed outside an SVG).
// - Dice: <DiceFace value={d1} kind="red" size={48} />,
//   <DiceFace value={d2} kind="yellow" size={48} />,
//   <DiceFace kind="event" face="fleet" size={48} /> (Stations & Starfighters).
// - Colours match lib/starforge/engine.js RESOURCE_COLOR exactly.
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
        <linearGradient id="sfOmegaGold" gradientUnits="userSpaceOnUse" x1="0" y1="18" x2="0" y2="112">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.45" stopColor="#ffd700" />
          <stop offset="0.75" stopColor="#c9962e" />
          <stop offset="1" stopColor="#8a5a14" />
        </linearGradient>
        <filter id="sfOmegaGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#ffc83c" floodOpacity="0.8" />
        </filter>
      </defs>
      <text
        x="64" y="68" textAnchor="middle" dominantBaseline="central"
        fontFamily="Georgia, 'Times New Roman', serif" fontWeight="900" fontSize="88"
        fill="url(#sfOmegaGold)" filter="url(#sfOmegaGlow)"
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
  iron: '#6b5a44', waterIce: '#a5e3f0', silicon: '#a8b8cc', titanium: '#9aa5b1',
  gold: '#d4af37', sea: '#0b1026', goldVein: '#8a6d1f', lake: '#274b73',
  oasis: '#3f6212', void: '#14141f',
};

const TERRAIN_LABEL = {
  iron: 'iron', waterIce: 'water-ice', silicon: 'silicon', titanium: 'titanium',
  gold: 'gold', sea: 'deep space', goldVein: 'gold vein', lake: 'crater lake',
  oasis: 'waystation', void: 'void',
};

// Pointy-top hex polygon for radius 34 (matches the page's hexPoints()).
const HEX_POINTS = [0, 1, 2, 3, 4, 5].map((i) => {
  const a = (Math.PI / 180) * (30 + 60 * i);
  return `${(34 * Math.cos(a)).toFixed(1)},${(34 * Math.sin(a)).toFixed(1)}`;
}).join(' ');

// Asteroid rock with iron glints (iron terrain).
function Asteroid({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <polygon points="0,-10 -9,-3 -6,8 5,9 10,0 6,-8" fill="#8a7a63" stroke="#3f3126" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="-3" cy="-2" r="1.8" fill="#d4af37" />
      <circle cx="4" cy="3" r="1.4" fill="#d4af37" />
      <circle cx="0" cy="6" r="1.2" fill="#e5e7eb" />
    </g>
  );
}

// Silicon crystal shard (silicon terrain).
function Crystal({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <polygon points="0,-11 -5,2 0,9 5,2" fill="#c7d2e0" stroke="#64748b" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="0" y1="-11" x2="0" y2="9" stroke="#64748b" strokeWidth="1" />
      <line x1="-5" y1="2" x2="5" y2="2" stroke="#64748b" strokeWidth="1" />
      <polygon points="0,-11 -2.5,-2 0,2 2.5,-2" fill="#f8fafc" opacity="0.8" />
    </g>
  );
}

// Titanium ridge peak with a light cap (titanium terrain).
function Ridge({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <polygon points="-12,10 0,-12 12,10" fill="#9aa5b1" stroke="#4b5563" strokeWidth="1.5" strokeLinejoin="round" />
      <polygon points="0,-12 -4,-4 0,-1 4,-4" fill="#f8fafc" />
      <line x1="-12" y1="10" x2="12" y2="10" stroke="#4b5563" strokeWidth="1.5" />
    </g>
  );
}

// Ice shard (water-ice terrain).
function IceShard({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <polygon points="0,-11 -4,0 0,11 4,0" fill="#bae6fd" stroke="#0369a1" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="0" y1="-11" x2="0" y2="11" stroke="#0369a1" strokeWidth="1" />
      <polygon points="0,-11 -1.5,-3 0,1 1.5,-3" fill="#fff" opacity="0.9" />
    </g>
  );
}

function HexArt({ terrain }) {
  switch (terrain) {
    case 'iron':
      return (
        <g>
          <Asteroid x={-19} y={-13} />
          <Asteroid x={19} y={-13} s={0.85} />
          <Asteroid x={0} y={23} s={0.8} />
          <circle cx={-8} cy={20} r="2" fill="#d4af37" />
          <circle cx={10} cy={-22} r="2" fill="#d4af37" />
        </g>
      );
    case 'silicon':
      return (
        <g>
          <path d="M-28,24 Q-14,12 0,24 Q14,12 28,24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
          <path d="M-28,16 Q-14,6 0,16 Q14,6 28,16" fill="none" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          <Crystal x={-16} y={-12} />
          <Crystal x={16} y={-12} s={0.85} />
          <Crystal x={0} y={22} s={0.7} />
        </g>
      );
    case 'titanium':
      return (
        <g>
          <Ridge x={-16} y={-8} />
          <Ridge x={16} y={-8} s={0.85} />
          <Ridge x={0} y={22} s={0.7} />
          <circle cx={-24} cy={18} r="2" fill="#e5e7eb" />
          <circle cx={24} cy={18} r="2" fill="#e5e7eb" />
        </g>
      );
    case 'waterIce':
      return (
        <g>
          <IceShard x={-19} y={-12} />
          <IceShard x={19} y={-12} s={0.85} />
          <IceShard x={0} y={22} s={0.8} />
          <circle cx={-24} cy={14} r="2" fill="#fff" />
          <circle cx={24} cy={14} r="2" fill="#fff" />
          <circle cx={-8} cy={-22} r="1.6" fill="#fff" />
          <circle cx={8} cy={-22} r="1.6" fill="#fff" />
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
    case 'void':
      return (
        <g>
          <circle cx="0" cy="0" r="17" fill="none" stroke="#7c3aed" strokeWidth="1.5" opacity="0.5" />
          <circle cx="0" cy="0" r="10" fill="#000" opacity="0.6" />
          <path d="M-22,-18 l1.5,4 4,1.5 -4,1.5 -1.5,4 -1.5,-4 -4,-1.5 4,-1.5 z" fill="#a78bfa" opacity="0.8" />
          <path d="M20,14 l1.2,3.2 3.2,1.2 -3.2,1.2 -1.2,3.2 -1.2,-3.2 -3.2,-1.2 3.2,-1.2 z" fill="#a78bfa" opacity="0.6" />
          <circle cx="24" cy="-18" r="1.5" fill="#a78bfa" />
        </g>
      );
    case 'sea':
      return (
        <g>
          <path d="M-6,-20 l2,5 5,2 -5,2 -2,5 -2,-5 -5,-2 5,-2 z" fill="#fff" opacity="0.9" />
          <path d="M18,-8 l1.5,4 4,1.5 -4,1.5 -1.5,4 -1.5,-4 -4,-1.5 4,-1.5 z" fill="#c7d2fe" opacity="0.8" />
          <path d="M-22,10 l1.5,4 4,1.5 -4,1.5 -1.5,4 -1.5,-4 -4,-1.5 4,-1.5 z" fill="#c7d2fe" opacity="0.7" />
          <circle cx="6" cy="18" r="1.8" fill="#fff" />
          <circle cx="-14" cy="-2" r="1.4" fill="#fff" />
          <path d="M8,4 a8,8 0 1 1 8,8" fill="none" stroke="#a78bfa" strokeWidth="1.5" opacity="0.8" />
        </g>
      );
    case 'goldVein':
      return (
        <g>
          <g fill="#f59e0b" stroke="#92400e" strokeWidth="1.5">
            <circle cx="-18" cy="-14" r="6" />
            <circle cx="18" cy="-14" r="6" />
            <circle cx="0" cy="22" r="6" />
          </g>
          <path d="M-28,6 L28,6 M-28,-2 L28,-2" stroke="#fbbf24" strokeWidth="2" opacity="0.7" />
          <path d="M-6,-24 l2,5 5,2 -5,2 -2,5 -2,-5 -5,-2 5,-2 z" fill="#fff7cc" />
        </g>
      );
    case 'lake':
      return (
        <g>
          <ellipse cx="0" cy="0" rx="26" ry="20" fill="#1d4ed8" stroke="#93c5fd" strokeWidth="2" opacity="0.55" />
          <ellipse cx="0" cy="0" rx="20" ry="14" fill="#38bdf8" opacity="0.5" />
          <g fill="#86efac" stroke="#166534" strokeWidth="1">
            <circle cx="-14" cy="-16" r="4" />
            <circle cx="16" cy="14" r="4" />
            <circle cx="14" cy="-18" r="3" />
          </g>
          <circle cx="-14" cy="-16" r="1.5" fill="#dcfce7" />
          <circle cx="16" cy="14" r="1.5" fill="#dcfce7" />
        </g>
      );
    case 'oasis':
      return (
        <g>
          <path d="M-20,20 A20,14 0 0 1 20,20 Z" fill="#e5e7eb" stroke="#64748b" strokeWidth="1.5" />
          <line x1="0" y1="6" x2="0" y2="-12" stroke="#64748b" strokeWidth="2" />
          <circle cx="0" cy="-14" r="3" fill="#fbbf24" stroke="#92400e" strokeWidth="1" />
          <ellipse cx="0" cy="22" rx="22" ry="4" fill="#475569" stroke="#1e293b" strokeWidth="1.5" />
          <path d="M-14,22 h28" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="3 3" />
        </g>
      );
    default:
      return null;
  }
}

export function HexTileArt({ terrain = 'iron', size = 34, x, y }) {
  return (
    <svg width={size * 2} height={size * 2} x={x} y={y} viewBox="-34 -34 68 68" role="img" aria-label={`${TERRAIN_LABEL[terrain] || terrain} hex`}>
      <polygon points={HEX_POINTS} fill={TERRAIN_FILL[terrain] || TERRAIN_FILL.void} stroke="#0b1f14" strokeWidth="1.5" strokeLinejoin="round" />
      <HexArt terrain={terrain} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Hubs — coast markers. type: 'any' (3:1) or a resource ('iron','waterIce',
// 'silicon','titanium','gold') for the 2:1 hubs. The coloured arc names the
// resource; the rate text is on the marker, never on an orb.
// ---------------------------------------------------------------------------
const HUB_LABEL = { any: '3:1', iron: '2:1', waterIce: '2:1', silicon: '2:1', titanium: '2:1', gold: '2:1' };

export function TradeHubArt({ type = 'any', size = 32, x, y }) {
  const isAny = type === 'any';
  const arcColor = isAny ? '#e8b93c' : (TERRAIN_FILL[type] || '#e8b93c');
  return (
    <svg width={size} height={size} x={x} y={y} viewBox="-20 -20 40 40" role="img" aria-label={`${isAny ? '3:1' : `${type} 2:1`} hub`}>
      <circle cx="0" cy="0" r="18" fill="#f5eeda" stroke="#0b1f14" strokeWidth="2" />
      <path d="M-18,0 A18,18 0 0 1 18,0" fill="none" stroke={arcColor} strokeWidth="4" />
      <g stroke="#1c1917" strokeWidth="2" fill="none" transform="translate(0 -3)">
        <circle cx="0" cy="0" r="7" />
        <line x1="0" y1="-7" x2="0" y2="-12" />
        <line x1="-6" y1="4" x2="-10" y2="7" />
        <line x1="6" y1="4" x2="10" y2="7" />
        <circle cx="0" cy="0" r="2" fill="#1c1917" stroke="none" />
      </g>
      <text x="0" y="15" textAnchor="middle" fontSize="9" fontWeight="800" fill="#1c1917" fontFamily="Georgia, serif">
        {HUB_LABEL[type] || '3:1'}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Cards — resource, commodity (Stations & Starfighters), development, progress.
// kind: 'iron'|'waterIce'|'silicon'|'titanium'|'gold' (resources),
//   'blueprint'|'nanoweave'|'credit' (commodities),
//   'starfighter'|'discovery'|'marketCorner'|'supplyDrop'|'warpLaneRush' (dev),
//   or any Stations & Starfighters progress type (alchemist, crane, ...).
// Faces carry a bold icon, a plain-English name and a short effect line.
// Backs carry the OmegaMark and nothing else.
// ---------------------------------------------------------------------------
const CARD_INFO = {
  iron: { name: 'Iron', color: '#6b5a44', icon: '⛏️', lines: ['Builds warp lanes', 'and outposts.'] },
  waterIce: { name: 'Water-Ice', color: '#0e7490', icon: '🧊', lines: ['Builds warp lanes', 'and outposts.'] },
  silicon: { name: 'Silicon', color: '#64748b', icon: '💠', lines: ['Builds outposts', 'and buys cards.'] },
  titanium: { name: 'Titanium', color: '#9aa5b1', icon: '🔩', lines: ['Builds outposts', 'and stations.'] },
  gold: { name: 'Gold', color: '#b8860b', icon: '🪙', lines: ['Builds stations', 'and buys cards.'] },
  blueprint: { name: 'Blueprint', color: '#0e7490', icon: '📄', lines: ['Research goods.', 'Improve your stations.'] },
  nanoweave: { name: 'Nanoweave', color: '#7c3aed', icon: '🧵', lines: ['Commerce goods.', 'Improve your stations.'] },
  credit: { name: 'Credit', color: '#b45309', icon: '🪙', lines: ['Command goods.', 'Improve your stations.'] },
  starfighter: { name: 'Starfighter', color: '#78350f', icon: '🚀', lines: ['Move the void pirate,', 'steal 1 card.'] },
  discovery: { name: 'Discovery', color: '#78350f', icon: '⭐', lines: ['Worth 1 point.', 'Keep it secret.'] },
  marketCorner: { name: 'Market Corner', color: '#78350f', icon: '👑', lines: ['Name a resource.', 'Take it from everyone.'] },
  supplyDrop: { name: 'Supply Drop', color: '#78350f', icon: '📦', lines: ['Take any 2 resources', 'from the bank.'] },
  warpLaneRush: { name: 'Warp Lane Rush', color: '#78350f', icon: '🌀', lines: ['Build 2 warp lanes', 'for free.'] },
};

const PROGRESS_NAMES = {
  alchemist: 'Synthesist', crane: 'Crane', engineer: 'Engineer', inventor: 'Inventor',
  irrigation: 'Hydroponics', medicine: 'Medbay', mining: 'Mining', printer: 'Fabricator',
  smith: 'Smith', bishop: 'Envoy', constitution: 'Charter', deserter: 'Defector',
  diplomat: 'Diplomat', intrigue: 'Intrigue', saboteur: 'Saboteur', spy: 'Spy',
  warlord: 'Warlord', wedding: 'Alliance', commercialHarbor: 'Commercial Dock',
  masterMerchant: 'Master Merchant', merchant: 'Merchant', merchantFleet: 'Merchant Fleet',
  resourceCorner: 'Resource Corner', tradeCorner: 'Trade Corner',
};

const PROGRESS_COLOR = {
  alchemist: '#15803d', crane: '#15803d', engineer: '#15803d', inventor: '#15803d',
  irrigation: '#15803d', medicine: '#15803d', mining: '#15803d', printer: '#15803d',
  smith: '#15803d', warpLaneRush: '#15803d',
  bishop: '#1d4ed8', constitution: '#1d4ed8', deserter: '#1d4ed8', diplomat: '#1d4ed8',
  intrigue: '#1d4ed8', saboteur: '#1d4ed8', spy: '#1d4ed8', warlord: '#1d4ed8', wedding: '#1d4ed8',
  commercialHarbor: '#b45309', masterMerchant: '#b45309', merchant: '#b45309',
  merchantFleet: '#b45309', resourceCorner: '#b45309', tradeCorner: '#b45309',
};

// Video faces for the five base development cards (public/videos/
// starforge/cards/). Progress cards, resources and commodities have no
// video and keep their SVG face. The card back's video is card-back.mp4.
const DEV_CARD_VIDEO = {
  starfighter: 'starfighter',
  discovery: 'discovery',
  marketCorner: 'market-corner',
  supplyDrop: 'supply-drop',
  warpLaneRush: 'warp-lane-rush',
};

export function CardFace({ kind = 'iron', width = 120, height = 168, x, y }) {
  const info = CARD_INFO[kind] || (PROGRESS_NAMES[kind]
    ? { name: PROGRESS_NAMES[kind], color: PROGRESS_COLOR[kind] || '#78350f', icon: '📜', lines: ['Progress card.', 'Stations & Starfighters.'] }
    : { name: kind, color: '#78350f', icon: '🃏', lines: ['Development card.'] });
  const faceSvg = (
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
  // Base development cards wear their video face (SVG underneath as the
  // poster/fallback). Resource, commodity and progress cards stay SVG-only.
  const video = DEV_CARD_VIDEO[kind];
  if (!video || x !== undefined || y !== undefined) return faceSvg;
  return (
    <div style={{ position: 'relative', width, height, borderRadius: 10, overflow: 'hidden', boxShadow: '0 0 14px rgba(167,139,250,0.45), 0 0 4px rgba(255,215,0,0.25)', animation: 'sfCardReveal 0.45s ease-out' }}>
      {faceSvg}
      <video src={`/videos/starforge/cards/${video}.mp4`} autoPlay muted loop playsInline preload="none" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10, display: 'block' }} />
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 10, pointerEvents: 'none', background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.16) 50%, transparent 70%)', backgroundSize: '250% 100%', animation: 'sfCardShimmer 3.5s ease-in-out infinite' }} />
      <style>{`@keyframes sfCardReveal { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } } @keyframes sfCardShimmer { 0% { background-position: 180% 0; } 100% { background-position: -80% 0; } }`}</style>
    </div>
  );
}

export function CardBack({ width = 120, height = 168, x, y }) {
  const s = 72;
  const backSvg = (
    <svg width={width} height={height} x={x} y={y} viewBox="0 0 120 168" role="img" aria-label="Card back">
      <rect x="2" y="2" width="116" height="164" rx="10" fill="#123524" stroke="#e8b93c" strokeWidth="3" />
      <rect x="9" y="9" width="102" height="150" rx="7" fill="none" stroke="#e8b93c" strokeWidth="1" opacity="0.6" />
      <OmegaMark size={s} x={(120 - s) / 2} y={(168 - s) / 2} />
    </svg>
  );
  // The deck's card back wears the golden-omega video (SVG underneath as
  // the poster/fallback). Same lazy, muted, looping treatment as the faces.
  if (x !== undefined || y !== undefined) return backSvg;
  return (
    <div style={{ position: 'relative', width, height, borderRadius: 10, overflow: 'hidden', boxShadow: '0 0 14px rgba(167,139,250,0.45), 0 0 4px rgba(255,215,0,0.25)', animation: 'sfCardReveal 0.45s ease-out' }}>
      {backSvg}
      <video src="/videos/starforge/cards/card-back.mp4" autoPlay muted loop playsInline preload="none" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10, display: 'block' }} />
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 10, pointerEvents: 'none', background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.16) 50%, transparent 70%)', backgroundSize: '250% 100%', animation: 'sfCardShimmer 3.5s ease-in-out infinite' }} />
      <style>{`@keyframes sfCardReveal { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } } @keyframes sfCardShimmer { 0% { background-position: 180% 0; } 100% { background-position: -80% 0; } }`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dice — two standard dice (red + yellow, the Stations & Starfighters pair) with
// pips, plus the event die (face: 'fleet' | 'research' | 'commerce' | 'command').
// ---------------------------------------------------------------------------
const PIP = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

const EVENT_FACE_COLOR = { fleet: '#1c1917', research: '#15803d', commerce: '#b45309', command: '#1d4ed8' };

// One small themed glyph per pip-die face, drawn in the top-left corner
// (the pips still carry the value): 1 star, 2 twin moons, 3 asteroids,
// 4 four-point star, 5 constellation, 6 galaxy spiral.
function FaceGlyph({ value, color }) {
  const g = { fill: color, opacity: 0.85 };
  if (value === 1) return <path d="M7,3 l1,2.5 2.5,1 -2.5,1 -1,2.5 -1,-2.5 -2.5,-1 2.5,-1 z" {...g} />;
  if (value === 2) return (<g {...g}><circle cx="5.5" cy="5.5" r="2" /><circle cx="9.5" cy="8.5" r="1.5" /></g>);
  if (value === 3) return (<g {...g}><circle cx="5" cy="5" r="1.8" /><circle cx="9.5" cy="7" r="1.4" /><circle cx="7" cy="10" r="1.2" /></g>);
  if (value === 4) return <path d="M7,2.5 l0.9,3 3,0.9 -3,0.9 -0.9,3 -0.9,-3 -3,-0.9 3,-0.9 z" {...g} />;
  if (value === 5) return (<g stroke={color} strokeWidth="1" opacity="0.85"><circle cx="5" cy="4.5" r="1.2" fill={color} stroke="none" /><circle cx="10" cy="6.5" r="1.2" fill={color} stroke="none" /><circle cx="7.5" cy="10" r="1.2" fill={color} stroke="none" /><path d="M5,4.5 L10,6.5 L7.5,10" fill="none" /></g>);
  return (<g fill="none" stroke={color} strokeWidth="1.2" opacity="0.85"><path d="M7,8 a3.2,3.2 0 1 1 3.2,3.2" /><circle cx="7" cy="8" r="1" fill={color} stroke="none" /></g>);
}

function EventFaceArt({ face }) {
  const color = EVENT_FACE_COLOR[face] || '#1c1917';
  if (face === 'fleet') {
    // Void-fleet dreadnought: prow triangle, armoured hull, turret.
    return (
      <g fill={color}>
        <polygon points="24,8 30,28 18,28" />
        <polygon points="12,28 36,28 32,38 16,38" />
        <circle cx="24" cy="33" r="1.6" fill="#fff" />
      </g>
    );
  }
  if (face === 'research') {
    return (
      <g>
        <circle cx="24" cy="24" r="15" fill={color} />
        <circle cx="24" cy="24" r="9" fill="none" stroke="#fff" strokeWidth="2" />
        <circle cx="24" cy="24" r="3" fill="#fff" />
      </g>
    );
  }
  if (face === 'commerce') {
    return (
      <g>
        <circle cx="24" cy="24" r="15" fill="#fbbf24" stroke={color} strokeWidth="2.5" />
        <circle cx="24" cy="24" r="9" fill="none" stroke={color} strokeWidth="2" />
        <text x="24" y="29" textAnchor="middle" fontSize="13" fontWeight="900" fill={color} fontFamily="Georgia, serif">Ω</text>
      </g>
    );
  }
  // command
  return (
    <g fill={color} stroke={color} strokeWidth="1.5" strokeLinejoin="round">
      <polygon points="11,32 11,20 17,26 24,15 31,26 37,20 37,32" />
      <rect x="11" y="32" width="26" height="4" />
    </g>
  );
}

export function DiceFace({ value = 1, kind = 'red', face = 'fleet', size = 48, x, y }) {
  const isEvent = kind === 'event';
  const fill = isEvent ? '#f5f5f4' : kind === 'yellow' ? '#eab308' : '#dc2626';
  const pipColor = kind === 'yellow' ? '#1c1917' : '#ffffff';
  const pips = PIP[Math.min(6, Math.max(1, value || 1))] || PIP[1];
  return (
    <svg width={size} height={size} x={x} y={y} viewBox="0 0 48 48" role="img" aria-label={isEvent ? `Event die: ${face}` : `${kind} die: ${value}`}>
      <rect x="2" y="2" width="44" height="44" rx="9" fill={fill} stroke="#111827" strokeWidth="2" />
      {isEvent
        ? <EventFaceArt face={face} />
        : (<g>
          <FaceGlyph value={Math.min(6, Math.max(1, value || 1))} color={pipColor} />
          {pips.map(([dx, dy], i) => (
            <circle key={i} cx={24 + dx * 10} cy={24 + dy * 10} r="4.5" fill={pipColor} />
          ))}
        </g>)}
    </svg>
  );
}

// Void Fleet-starship marker for the Stations & Starfighters voidFleet track (7 steps).
export function VoidFleetShipMarker({ size = 32, x, y }) {
  return (
    <svg width={size} height={size} x={x} y={y} viewBox="-16 -16 32 32" role="img" aria-label="Void Fleet starship">
      <polygon points="0,-13 5,-2 12,6 12,10 -12,10 -12,6 -5,-2" fill="#7f1d1d" stroke="#111827" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="0" cy="2" r="2" fill="#fbbf24" stroke="#111827" strokeWidth="0.8" />
      <circle cx="-6" cy="7" r="1.2" fill="#fff" />
      <circle cx="6" cy="7" r="1.2" fill="#fff" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pieces — chunky, colour-filled, readable at ~20px. Each is a nested <svg>
// positioned by its TOP-LEFT (x, y); centre it with x = cx - size/2.
// Warp Lane/starship length matches the board edge (34 units at size 34); rotate
// them with `angle` (degrees, 0 = horizontal) around their centre.
// ---------------------------------------------------------------------------
function PieceSvg({ size, x, y, label, children }) {
  return (
    <svg width={size} height={size} x={x} y={y} viewBox="-12 -12 24 24" role="img" aria-label={label}>
      {children}
    </svg>
  );
}

export function OutpostPiece({ color = '#2563eb', size = 24, x, y }) {
  return (
    <PieceSvg size={size} x={x} y={y} label="Outpost">
      <path d="M-8,8 A8,8 0 0 1 8,8 Z" fill={color} stroke="#111827" strokeWidth="1.2" />
      <rect x="-8" y="7" width="16" height="2.5" fill={color} stroke="#111827" strokeWidth="1" />
      <line x1="0" y1="0" x2="0" y2="-8" stroke="#111827" strokeWidth="1.5" />
      <circle cx="0" cy="-9" r="1.8" fill="#fbbf24" stroke="#111827" strokeWidth="0.8" />
      <rect x="-2" y="2" width="4" height="4" fill="#111827" opacity="0.35" />
    </PieceSvg>
  );
}

export function StationPiece({ color = '#2563eb', size = 32, x, y }) {
  return (
    <PieceSvg size={size} x={x} y={y} label="Station">
      <circle cx="0" cy="0" r="9" fill="none" stroke={color} strokeWidth="3.5" />
      <circle cx="0" cy="0" r="9" fill="none" stroke="#111827" strokeWidth="0.8" opacity="0.4" />
      <rect x="-3" y="-3" width="6" height="6" rx="1" fill={color} stroke="#111827" strokeWidth="1.2" />
      <rect x="-11" y="-2" width="4" height="4" fill={color} stroke="#111827" strokeWidth="1" />
      <rect x="7" y="-2" width="4" height="4" fill={color} stroke="#111827" strokeWidth="1" />
    </PieceSvg>
  );
}

export function WarpLanePiece({ color = '#2563eb', size = 34, angle = 0, x, y }) {
  return (
    <PieceSvg size={size} x={x} y={y} label="Warp Lane">
      <g transform={`rotate(${angle} 0 0)`}>
        <line x1="-14" y1="0" x2="14" y2="0" stroke="#111827" strokeWidth="8.5" strokeLinecap="round" />
        <line x1="-14" y1="0" x2="14" y2="0" stroke={color} strokeWidth="5.5" strokeLinecap="round" />
        <path d="M-6,-3 L-2,0 L-6,3 M2,-3 L6,0 L2,3" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
      </g>
    </PieceSvg>
  );
}

export function StarshipPiece({ color = '#2563eb', size = 34, angle = 0, x, y }) {
  return (
    <PieceSvg size={size} x={x} y={y} label="Starship">
      <g transform={`rotate(${angle} 0 0)`}>
        <polygon points="0,-11 0,0 9,-1" fill="#f5eeda" stroke="#111827" strokeWidth="1.2" strokeLinejoin="round" />
        <line x1="0" y1="-11" x2="0" y2="2" stroke="#111827" strokeWidth="1.5" />
        <path d="M-11,2 L11,2 L8,8 L-8,8 Z" fill={color} stroke="#111827" strokeWidth="1.2" strokeLinejoin="round" />
        <circle cx="-5" cy="10" r="1.3" fill="#fbbf24" />
        <circle cx="5" cy="10" r="1.3" fill="#fbbf24" />
      </g>
    </PieceSvg>
  );
}

export function StarfighterPiece({ color = '#2563eb', level = 1, size = 24, x, y }) {
  const lvl = Math.min(3, Math.max(1, level || 1));
  // Own viewBox (24x26): the level pips sit below the shield at y=13.5,
  // outside the standard 24x24 piece box.
  return (
    <svg width={size} height={(size * 26) / 24} x={x} y={y} viewBox="-12 -12 24 26" role="img" aria-label={`Starfighter level ${lvl}`}>
      <polygon points="0,-11 3,-2 9,7 0,4 -9,7 -3,-2" fill={color} stroke="#111827" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="0" cy="-4" r="2" fill="#fff" stroke="#111827" strokeWidth="0.8" />
      <circle cx="0" cy="9" r="1.5" fill="#fbbf24" stroke="#111827" strokeWidth="0.8" />
      {Array.from({ length: lvl }).map((_, i) => (
        <circle key={i} cx={(i - (lvl - 1) / 2) * 6} cy="13.5" r="1.8" fill="#fbbf24" stroke="#111827" strokeWidth="0.8" />
      ))}
    </svg>
  );
}

export function VoidPiratePiece({ size = 24, x, y }) {
  return (
    <PieceSvg size={size} x={x} y={y} label="Void Pirate">
      <path d="M0,-11 C-7,-8 -9,2 -9,9 L9,9 C9,2 7,-8 0,-11 Z" fill="#312e81" stroke="#f8fafc" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="-3" cy="-2" r="1.3" fill="#fff" />
      <circle cx="3" cy="-2" r="1.3" fill="#fff" />
    </PieceSvg>
  );
}

export function CorsairPiece({ size = 24, x, y }) {
  return (
    <PieceSvg size={size} x={x} y={y} label="Corsair">
      <rect x="-1" y="-11" width="2" height="13" fill="#111827" />
      <polygon points="1,-11 10,-8 1,-5" fill="#111827" stroke="#f8fafc" strokeWidth="0.8" />
      <circle cx="5" cy="-8" r="1.2" fill="#fff" />
      <path d="M-10,2 L10,2 L7,8 L-7,8 Z" fill="#7f1d1d" stroke="#f8fafc" strokeWidth="1.2" strokeLinejoin="round" />
    </PieceSvg>
  );
}

// ---------------------------------------------------------------------------
// Menu art — title screen. The only text in the module besides card faces
// and hub rates. Sized for the game menu / loading screen.
// ---------------------------------------------------------------------------
export function MenuArt({ width = 480, height = 260, x, y }) {
  return (
    <svg width={width} height={height} x={x} y={y} viewBox="0 0 480 260" role="img" aria-label="Starforge">
      <defs>
        <linearGradient id="sfMenuGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.45" stopColor="#ffd700" />
          <stop offset="0.75" stopColor="#c9962e" />
          <stop offset="1" stopColor="#8a5a14" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="474" height="254" rx="18" fill="#0b1026" stroke="#e8b93c" strokeWidth="3" />
      <g fill="#fff">
        <circle cx="40" cy="40" r="1.5" /><circle cx="440" cy="50" r="1.5" /><circle cx="60" cy="210" r="1.5" />
        <circle cx="420" cy="200" r="1.5" /><circle cx="240" cy="18" r="1.2" /><circle cx="120" cy="90" r="1.2" />
        <circle cx="360" cy="100" r="1.2" />
      </g>
      <path d="M30,70 a120,120 0 0 1 60,-35" fill="none" stroke="#a78bfa" strokeWidth="2" opacity="0.5" />
      <OmegaMark size={104} x={188} y={22} />
      <text x="240" y="196" textAnchor="middle" fontSize="40" fontWeight="800" fill="url(#sfMenuGold)" fontFamily="Georgia, 'Times New Roman', serif">
        Starforge
      </text>
      <line x1="120" y1="216" x2="215" y2="216" stroke="#e8b93c" strokeWidth="2" />
      <line x1="265" y1="216" x2="360" y2="216" stroke="#e8b93c" strokeWidth="2" />
      <text x="240" y="222" textAnchor="middle" fontSize="16" fontWeight="900" fill="#e8b93c" fontFamily="Georgia, 'Times New Roman', serif">Ω</text>
    </svg>
  );
}
