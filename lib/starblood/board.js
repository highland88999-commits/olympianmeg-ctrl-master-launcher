// lib/starblood/board.js
// Pure, headless Starblood game logic: deck construction, shuffling, and
// leaderboard helpers. No DOM, no network — shared by the game page, the
// leaderboard API route, and the headless tests.
//
// Starblood is a 20-card memory-match game: 10 unique card faces, each
// appearing exactly twice. Fewer flips wins.

export const PAIR_COUNT = 10;
export const DECK_SIZE = PAIR_COUNT * 2;
export const BOARD_ROWS = 5;
export const BOARD_COLS = 4;
export const BOARD_SLOTS = BOARD_ROWS * BOARD_COLS; // 20 == DECK_SIZE

export const MAX_USERNAME_LEN = 24;
export const MAX_FLIPS = 1000; // sanity ceiling: 20 cards can always be cleared far below this
export const BOARD_LIMIT = 10; // global top-10

// Card faces, self-hosted under public/textures/starblood (imported from
// Merlin's Starblood repo; media audit: no external hosts).
export const CARD_FACES = Array.from(
  { length: PAIR_COUNT },
  (_, i) => `/textures/starblood/card-${String(i + 1).padStart(2, '0')}.jpeg`
);

/** Build a fresh deck: each of the 10 faces exactly twice, in order. */
export function buildDeck(faces = CARD_FACES) {
  const deck = [];
  for (const face of faces) {
    deck.push({ face }, { face });
  }
  return deck;
}

/**
 * Fisher-Yates shuffle. Returns a NEW array; the input is untouched.
 * Accepts an optional random function (defaults to Math.random) so tests
 * can inject a seeded PRNG.
 */
export function shuffleDeck(deck, rand = Math.random) {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Count occurrences of each face in a deck — every face must appear exactly twice. */
export function faceCounts(deck) {
  const counts = new Map();
  for (const card of deck) {
    counts.set(card.face, (counts.get(card.face) || 0) + 1);
  }
  return counts;
}

/** Sort leaderboard entries: fewest flips first, oldest first on ties. */
export function sortEntries(entries) {
  return entries.slice().sort((a, b) => {
    if (a.flips !== b.flips) return a.flips - b.flips;
    const da = a.created_at ? Date.parse(a.created_at) : 0;
    const db = b.created_at ? Date.parse(b.created_at) : 0;
    return da - db;
  });
}

/** Keep only the top N entries (default: the global top-10). */
export function topEntries(entries, limit = BOARD_LIMIT) {
  return sortEntries(entries).slice(0, limit);
}

/**
 * Validate a leaderboard submission. Returns { ok, username, flips } on
 * success or { ok: false, error } with a plain-English reason.
 */
export function validateScore(body) {
  const rawName = body && typeof body.username === 'string' ? body.username.trim() : '';
  const flips = body ? body.flips : undefined;

  if (!rawName) return { ok: false, error: 'Enter a name for the leaderboard.' };
  if (rawName.length > MAX_USERNAME_LEN)
    return { ok: false, error: `Name must be ${MAX_USERNAME_LEN} characters or fewer.` };
  if (!Number.isInteger(flips) || flips < DECK_SIZE / 2 || flips >= MAX_FLIPS)
    return { ok: false, error: 'That score is not possible in a 20-card game.' };

  return { ok: true, username: rawName, flips };
}
