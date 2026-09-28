// PROJECT KHAOS — tier sanctum data.
// Four demo access tiers, each with its own procedural simulation. Everything
// here is a simulation demo: nothing is sold, nothing is gated, nothing is
// tracked.

export const TIERS = [
  {
    id: "bronze",
    name: "BRONZE",
    tag: "The Ember Tier",
    color: "#cd7f32",
    sim: "embers",
    blurb:
      "The first spark. A slow-burning ember field for those entering the sanctum — warm, steady, and unhurried.",
    perks: [
      "Ember-field simulation chamber",
      "Sanctum orientation walkthrough",
      "Community hall access (demo)",
    ],
  },
  {
    id: "platinum",
    name: "PLATINUM",
    tag: "The Frost Tier",
    color: "#e5e4e2",
    sim: "frost",
    blurb:
      "Cold precision. Drifting ice crystal formations for operators who want the sanctum at its clearest and calmest.",
    perks: [
      "Frost-crystal simulation chamber",
      "Priority chamber queue (demo)",
      "Extended session timers (demo)",
    ],
  },
  {
    id: "gold",
    name: "GOLD",
    tag: "The Solar Tier",
    color: "#ffd700",
    sim: "solar",
    blurb:
      "Full radiance. A solar-flare simulation that runs hot and bright — the sanctum's signature spectacle.",
    perks: [
      "Solar-flare simulation chamber",
      "Spectacle mode: full-bleed visuals",
      "Founder's wall inscription (demo)",
    ],
  },
  {
    id: "diamond",
    name: "DIAMOND",
    tag: "The Prism Tier",
    color: "#b9f2ff",
    sim: "prism",
    blurb:
      "Refracted light. A prism-beam simulation that splits the sanctum's glow into its component colors.",
    perks: [
      "Prism-beam simulation chamber",
      "All lower-tier chambers included (demo)",
      "Name etched in the keystone (demo)",
    ],
  },
];

export function tierById(id) {
  return TIERS.find((t) => t.id === id) || null;
}

export function tierIndex(id) {
  return TIERS.findIndex((t) => t.id === id);
}

// comparison matrix rows: [label, bronze, platinum, gold, diamond]
export const COMPARISON = [
  ["Simulation chambers", "1", "2", "3", "4"],
  ["Session length (demo)", "15 min", "30 min", "60 min", "Unlimited"],
  ["Spectacle mode", "—", "—", "Yes", "Yes"],
  ["Founder's wall", "—", "—", "Yes", "Keystone"],
];

export function nextTier(id) {
  const i = tierIndex(id);
  return TIERS[Math.min(TIERS.length - 1, i + 1)].id;
}

export function prevTier(id) {
  const i = tierIndex(id);
  return TIERS[Math.max(0, i - 1)].id;
}

// ---------------------------------------------------------------------------
// Auction floor — simulated tier auctions. Demo credits only; nothing is
// sold for real money. Pure logic, DOM-free, fully testable.
// ---------------------------------------------------------------------------

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const RIVALS = ["VEX", "MIRA", "JUNO", "KAI", "ONYX", "LYRA", "SOL", "NIX"];

const LOT_CORES = {
  bronze: ["Ember Relic", "Cinder Sigil", "Ash Totem", "Coal Prism", "Smolder Mask", "Flint Idol"],
  platinum: ["Frost Shard", "Glacier Seal", "Rime Crown", "Pale Monolith", "Snowline Key", "Winter Vow"],
  gold: ["Solar Sigil", "Sunbrand", "Helios Coin", "Dawn Chalice", "Radiant Helm", "Flare Medallion"],
  diamond: ["Prism Core", "Light Lattice", "Refraction Eye", "Crystal Verdict", "Spectrum Fang", "Diamond Oath"],
};

const TIER_BASE = { bronze: 25, platinum: 80, gold: 200, diamond: 500 };

export function createLot(tierId, rng, seq) {
  const cores = LOT_CORES[tierId] || LOT_CORES.bronze;
  const core = cores[Math.floor(rng() * cores.length)];
  const series = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"][seq % 9];
  const base = TIER_BASE[tierId] || TIER_BASE.bronze;
  const startBid = Math.round(base * (0.7 + rng() * 1.2));
  const buyNow = Math.round(startBid * (3 + rng() * 2));
  return {
    id: `${tierId}-${seq}-${Math.floor(rng() * 1e6)}`,
    name: `${core} ${series}`,
    tierId,
    startBid,
    currentBid: startBid,
    bidder: null,
    bids: [],
    buyNow,
    endsIn: Math.round(120 + rng() * 480), // demo clock, seconds
    status: "open",
    soldTo: null,
    artSeed: Math.floor(rng() * 1e9),
  };
}

export function createLots(tierId, seed, count = 9) {
  const rng = mulberry32(seed);
  const lots = [];
  for (let i = 0; i < count; i++) lots.push(createLot(tierId, rng, i));
  return lots;
}

export function minIncrement(bid) {
  if (bid < 50) return 5;
  if (bid < 200) return 10;
  if (bid < 1000) return 25;
  return 50;
}

export function minBid(lot) {
  return lot.currentBid + minIncrement(lot.currentBid);
}

// Returns { ok, reason }. Mutates the lot on success.
export function placeBid(lot, bidder, amount) {
  if (lot.status !== "open") return { ok: false, reason: "closed" };
  const need = minBid(lot);
  if (amount < need) return { ok: false, reason: `bid below minimum ${need}` };
  lot.currentBid = amount;
  lot.bidder = bidder;
  lot.bids.push({ bidder, amount });
  return { ok: true, reason: "" };
}

// Returns { ok, reason }. Mutates the lot on success.
export function buyNow(lot, bidder) {
  if (lot.status !== "open") return { ok: false, reason: "closed" };
  lot.currentBid = lot.buyNow;
  lot.bidder = bidder;
  lot.bids.push({ bidder, amount: lot.buyNow });
  lot.status = "sold";
  lot.soldTo = bidder;
  return { ok: true, reason: "" };
}

export function cloneLot(lot) {
  return { ...lot, bids: lot.bids.map((b) => ({ ...b })) };
}

// Advances lot clocks by dt seconds. Expired lots with bids go to the last
// bidder; expired lots with no bids are replaced by a fresh lot (auto-refresh
// with new lots, like the source). Pushes events into `events`.
export function tickLots(lots, dt, rng, events) {
  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (lot.status !== "open") continue;
    lot.endsIn -= dt;
    if (lot.endsIn > 0) continue;
    if (lot.bids.length > 0) {
      lot.status = "sold";
      lot.soldTo = lot.bidder;
      events.push({ type: "sold", lotId: lot.id, winner: lot.bidder, price: lot.currentBid });
    } else {
      const fresh = createLot(lot.tierId, rng, Math.floor(rng() * 1000));
      lots[i] = fresh;
      events.push({ type: "relisted", lotId: fresh.id, tierId: lot.tierId });
    }
  }
}

// One simulated rival-bid pass. rng() < 0.4 triggers a bid on a random open lot.
export function rivalBidStep(lots, rng, events) {
  const open = lots.filter((l) => l.status === "open");
  if (open.length === 0) return;
  if (rng() >= 0.4) return;
  const lot = open[Math.floor(rng() * open.length)];
  const rival = RIVALS[Math.floor(rng() * RIVALS.length)];
  const res = placeBid(lot, rival, minBid(lot));
  if (res.ok) events.push({ type: "bid", lotId: lot.id, bidder: rival, price: lot.currentBid });
}

export function formatClock(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
