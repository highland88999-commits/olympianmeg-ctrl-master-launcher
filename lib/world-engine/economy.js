// World Engine — credit economy (pure logic, no I/O).
//
// Aether is the module's credit currency. Users get 20 free generations per
// calendar month; after that each synthesis costs Aether from the cost map.

export const FREE_GENERATIONS_PER_MONTH = 20;

// Cost map for /api/world-engine/synthesize. Kept from the original design:
// big generations cost more than small asset generations.
export const COST_MAP = {
  world: 500,
  weather: 300,
  character: 200,
  creature: 200,
  vehicle: 200,
  object: 100,
  weapon: 100,
  asset_link: 50,
};

export const DEFAULT_COST = 100;

/** Normalise a category string and return its synthesis cost in Aether. */
export function costFor(category) {
  const key = (category || 'object').toString().toLowerCase().trim();
  return COST_MAP[key] ?? DEFAULT_COST;
}

// Server-priced credit tiers. Prices are defined here, on the server, and
// the client never sends a price — only a tier id. Amounts are in cents.
export const CREDIT_TIERS = [
  { id: 'aether-100', tokens: 100, cents: 499, label: '100 Aether', price: '$4.99' },
  { id: 'aether-1000', tokens: 1000, cents: 1999, label: '1,000 Aether', price: '$19.99' },
];

/** Look up a tier by id. Returns undefined for unknown ids. */
export function tierById(tierId) {
  return CREDIT_TIERS.find((t) => t.id === tierId);
}

/** "2026-9" style key for the calendar month of a date. */
export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

/**
 * Decide how a synthesis is paid for given the user's ledger row.
 *
 * ledger: { tokens, free_used, free_reset_month } | null (new user)
 * Returns one of:
 *   { ok: true, isFree, updates, cost, freeRemaining, tokensRemaining }
 *   { ok: false, required, available }              // 402 insufficient funds
 *
 * `updates` is the exact patch to write back to the ledger row.
 */
export function computeBilling(ledger, cost, now = new Date()) {
  const mk = monthKey(now);
  const tokens = ledger?.tokens ?? 0;
  const freeUsed = ledger?.free_used ?? 0;
  const resetMonth = ledger?.free_reset_month ?? null;

  // New calendar month: the free tier resets and this generation is free.
  if (resetMonth !== mk) {
    return {
      ok: true,
      isFree: true,
      updates: { free_used: 1, free_reset_month: mk },
      cost: 0,
      freeRemaining: FREE_GENERATIONS_PER_MONTH - 1,
      tokensRemaining: tokens,
    };
  }

  // Free generations left this month.
  if (freeUsed < FREE_GENERATIONS_PER_MONTH) {
    return {
      ok: true,
      isFree: true,
      updates: { free_used: freeUsed + 1 },
      cost: 0,
      freeRemaining: FREE_GENERATIONS_PER_MONTH - freeUsed - 1,
      tokensRemaining: tokens,
    };
  }

  // Paid path.
  if (tokens < cost) {
    return { ok: false, required: cost, available: tokens };
  }
  return {
    ok: true,
    isFree: false,
    updates: { tokens: tokens - cost },
    cost,
    freeRemaining: 0,
    tokensRemaining: tokens - cost,
  };
}

/** Human-readable balance line for the UI. */
export function formatBalance(tokens) {
  const n = Number.isFinite(tokens) ? tokens : 0;
  return `${n.toLocaleString()} Aether`;
}
