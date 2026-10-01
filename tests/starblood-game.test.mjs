// tests/starblood-game.test.mjs
// Headless tests for the Starblood memory-match game logic.
// Run: node tests/starblood-game.test.mjs (from the repo root).
// No browser, no network.
import {
  buildDeck,
  shuffleDeck,
  faceCounts,
  sortEntries,
  topEntries,
  validateScore,
  PAIR_COUNT,
  DECK_SIZE,
  BOARD_SLOTS,
  BOARD_LIMIT,
  CARD_FACES,
  MAX_USERNAME_LEN,
} from '../lib/starblood/board.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// Deterministic PRNG for shuffle tests (mulberry32).
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- constants -------------------------------------------------------------
t('10 pairs make a 20-card deck', PAIR_COUNT === 10 && DECK_SIZE === 20);
t('board has exactly one slot per card', BOARD_SLOTS === DECK_SIZE);
t('global board keeps a top-10', BOARD_LIMIT === 10);
t('10 self-hosted card faces', CARD_FACES.length === 10 &&
  CARD_FACES.every((f) => f.startsWith('/textures/starblood/card-') && f.endsWith('.jpeg')));
t('no external hosts in card faces', CARD_FACES.every((f) => !/^https?:/.test(f)));

// --- deck construction ------------------------------------------------------
const deck = buildDeck();
t('buildDeck returns 20 cards', deck.length === 20);
const counts = faceCounts(deck);
t('every face appears exactly twice', [...counts.values()].every((c) => c === 2));
t('deck covers all 10 faces', counts.size === 10);

// --- shuffle ----------------------------------------------------------------
const shuffled = shuffleDeck(deck, seeded(42));
t('shuffle keeps all 20 cards', shuffled.length === 20);
const sc = faceCounts(shuffled);
t('shuffle preserves pairing (each face still x2)',
  [...sc.values()].every((c) => c === 2) && sc.size === 10);
t('shuffle does not mutate the input deck',
  deck.every((c, i) => deck[i] === c) &&
    deck[0].face === CARD_FACES[0] && deck[1].face === CARD_FACES[0]);
const reshuffled = shuffleDeck(deck, seeded(42));
t('shuffle is deterministic with a seeded PRNG',
  JSON.stringify(shuffled.map((c) => c.face)) === JSON.stringify(reshuffled.map((c) => c.face)));
const differently = shuffleDeck(deck, seeded(7));
t('different seeds give different orders',
  JSON.stringify(shuffled.map((c) => c.face)) !== JSON.stringify(differently.map((c) => c.face)));

// --- leaderboard sort --------------------------------------------------------
const rows = [
  { username: 'b', flips: 40, created_at: '2026-10-01T00:00:02Z' },
  { username: 'a', flips: 24, created_at: '2026-10-01T00:00:01Z' },
  { username: 'c', flips: 24, created_at: '2026-10-01T00:00:03Z' },
];
const sorted = sortEntries(rows);
t('sort asc by flips', sorted[0].username === 'a' && sorted[1].username === 'c' && sorted[2].username === 'b');
t('ties break oldest-first', sorted[0].created_at < sorted[1].created_at);
t('sortEntries does not mutate the input', rows[0].username === 'b');

// --- top-10 truncation --------------------------------------------------------
const many = Array.from({ length: 25 }, (_, i) => ({
  username: `p${i}`,
  flips: 100 - i,
  created_at: `2026-10-01T00:00:${String(i).padStart(2, '0')}Z`,
}));
const top = topEntries(many);
t('topEntries truncates to 10', top.length === 10);
t('topEntries keeps the 10 fewest flips', top[0].flips === 76 && top[9].flips === 85);
t('topEntries([]) is empty', topEntries([]).length === 0);

// --- score validation ---------------------------------------------------------
t('valid score passes', (() => {
  const v = validateScore({ username: 'Merlin', flips: 32 });
  return v.ok && v.username === 'Merlin' && v.flips === 32;
})());
t('username is trimmed', validateScore({ username: '  Ana  ', flips: 30 }).username === 'Ana');
t('empty username rejected', !validateScore({ username: '   ', flips: 30 }).ok);
t('missing username rejected', !validateScore({ flips: 30 }).ok);
t('username over 24 chars rejected',
  !validateScore({ username: 'x'.repeat(MAX_USERNAME_LEN + 1), flips: 30 }).ok);
t('username at exactly 24 chars accepted',
  validateScore({ username: 'x'.repeat(MAX_USERNAME_LEN), flips: 30 }).ok);
t('zero flips rejected', !validateScore({ username: 'a', flips: 0 }).ok);
t('negative flips rejected', !validateScore({ username: 'a', flips: -5 }).ok);
t('fractional flips rejected', !validateScore({ username: 'a', flips: 30.5 }).ok);
t('string flips rejected', !validateScore({ username: 'a', flips: '30' }).ok);
t('missing flips rejected', !validateScore({ username: 'a' }).ok);
t('absurd flips (>=1000) rejected', !validateScore({ username: 'a', flips: 1000 }).ok);
t('below-minimum flips rejected (fewer than 10)', !validateScore({ username: 'a', flips: 9 }).ok);
t('non-object body rejected', !validateScore(null).ok && !validateScore('x').ok);
t('error messages are plain English', (() => {
  const v = validateScore({ username: '', flips: 5 });
  return !v.ok && typeof v.error === 'string' && v.error.length > 0;
})());

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
