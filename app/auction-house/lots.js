// Auction House — curated demo catalog data.
//
// Every lot is fictional. No real brands, no real provenance, no real money.
// Bidding is disabled; this is a showcase catalog with simulated activity.

export const CATEGORIES = [
  'All',
  'Relics',
  'Star Charts',
  'Instruments',
  'Manuscripts',
  'Curiosities',
];

// endsInSec: seconds from page load until the lot's demo clock ends.
export const LOTS = [
  {
    id: 'lot-001',
    title: 'Brass Meridian Astrolabe',
    category: 'Instruments',
    description:
      'A hand-engraved brass astrolabe with five interchangeable plates, each etched for a different latitude of the known world.',
    provenance: 'From the collection of a retired cartographer, Meridian Isles.',
    estimateLow: 1200,
    estimateHigh: 1800,
    startBid: 800,
    endsInSec: 2 * 3600 + 14 * 60,
  },
  {
    id: 'lot-002',
    title: 'Chart of the Ninth Crossing',
    category: 'Star Charts',
    description:
      'Ink on vellum star chart marking the Ninth Crossing — a trade route that only appears in three surviving charts.',
    provenance: 'Estate of an anonymous navigator.',
    estimateLow: 2400,
    estimateHigh: 3200,
    startBid: 1500,
    endsInSec: 5 * 3600 + 42 * 60,
  },
  {
    id: 'lot-003',
    title: 'Obsidian Harbor Bell',
    category: 'Relics',
    description:
      'A small harbor bell carved from a single piece of obsidian. It rings with an unusually long, low tone.',
    provenance: 'Recovered from the old harbor wall during restoration.',
    estimateLow: 600,
    estimateHigh: 900,
    startBid: 400,
    endsInSec: 47 * 60,
  },
  {
    id: 'lot-004',
    title: 'The Tidesmith’s Ledger',
    category: 'Manuscripts',
    description:
      'A bound ledger of tide tables and ship notes spanning eleven years, with marginal sketches of unfamiliar coastlines.',
    provenance: 'Donated by the Tidesmith guildhall archive.',
    estimateLow: 900,
    estimateHigh: 1400,
    startBid: 650,
    endsInSec: 26 * 3600,
  },
  {
    id: 'lot-005',
    title: 'Clockwork Tide Engine (Model)',
    category: 'Curiosities',
    description:
      'A working brass-and-glass model of a tide engine. Turn the key and the miniature gears drive a full tidal cycle.',
    provenance: 'Workshop of an unknown horologist, circa the late brass age.',
    estimateLow: 3000,
    estimateHigh: 4500,
    startBid: 2200,
    endsInSec: 3 * 24 * 3600 + 6 * 3600,
  },
  {
    id: 'lot-006',
    title: 'Lantern of the Deep Watch',
    category: 'Relics',
    description:
      'A storm lantern said to have burned through forty nights of the Deep Watch without being relit.',
    provenance: 'Lighthouse keeper’s cottage, Greyrock Point.',
    estimateLow: 450,
    estimateHigh: 700,
    startBid: 300,
    endsInSec: 3 * 3600 + 5 * 60,
  },
  {
    id: 'lot-007',
    title: 'Twin-Sun Orrery',
    category: 'Instruments',
    description:
      'A mechanical orrery modeling a twin-sun system. All six planets orbit on schedule when wound.',
    provenance: 'Commissioned for a private observatory; maker unknown.',
    estimateLow: 5200,
    estimateHigh: 7800,
    startBid: 4000,
    endsInSec: 2 * 24 * 3600 + 11 * 3600,
  },
  {
    id: 'lot-008',
    title: 'Atlas of Unsailed Seas',
    category: 'Star Charts',
    description:
      'Forty-two hand-drawn charts of seas no ship has ever sailed — part map, part wish.',
    provenance: 'Found in a sealed sea chest, origin unknown.',
    estimateLow: 1800,
    estimateHigh: 2600,
    startBid: 1200,
    endsInSec: 9 * 3600 + 31 * 60,
  },
  {
    id: 'lot-009',
    title: 'Scribe’s Star Compass',
    category: 'Instruments',
    description:
      'A pocket star compass with a needle that settles on the brightest star rather than north.',
    provenance: 'Carried by a traveling scribe for thirty years.',
    estimateLow: 700,
    estimateHigh: 1100,
    startBid: 500,
    endsInSec: 58 * 60,
  },
  {
    id: 'lot-010',
    title: 'The Glasswright’s Sketchbook',
    category: 'Manuscripts',
    description:
      'Ninety pages of furnace diagrams, color trials, and notes in the margins about “glass that remembers light.”',
    provenance: 'Glasswright quarter, sold with the workshop.',
    estimateLow: 1100,
    estimateHigh: 1600,
    startBid: 750,
    endsInSec: 15 * 3600 + 20 * 60,
  },
  {
    id: 'lot-011',
    title: 'Puzzle Box of Seven Tides',
    category: 'Curiosities',
    description:
      'A rosewood puzzle box with seven sliding panels. It has been opened twice; both times it contained a single shell.',
    provenance: 'Private collection, provenance incomplete.',
    estimateLow: 950,
    estimateHigh: 1500,
    startBid: 700,
    endsInSec: 30 * 3600,
  },
  {
    id: 'lot-012',
    title: 'Moonphase Mural Fragment',
    category: 'Relics',
    description:
      'A plaster fragment from a temple mural showing all eight moonphases in mineral pigment. Remarkably intact.',
    provenance: 'Excavated during the old temple restoration.',
    estimateLow: 2100,
    estimateHigh: 3000,
    startBid: 1400,
    endsInSec: 4 * 24 * 3600,
  },
];

export function getLot(id) {
  return LOTS.find((l) => l.id === id) || null;
}

export function lotsByCategory(category) {
  if (!category || category === 'All') return LOTS;
  return LOTS.filter((l) => l.category === category);
}

export function formatUSD(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}
