// OASIS NPC roster — original characters in a pop-culture adventure spirit.
// Homages only: no direct IP, no borrowed names. Think arcade mythology,
// gunter culture, synthwave duels — the genre, not the franchise.
//
// Tiers: rookie (learning the ropes) / veteran (seasoned) / elite (feared).
// difficulty is 1-10 and orders NPCs within and across tiers.

export const TIERS = ['rookie', 'veteran', 'elite'];

const TIER_ORDER = { rookie: 0, veteran: 1, elite: 2 };

export const NPCS = [
  // -- Rookie: hungry, fast, beatable -------------------------------------
  {
    id: 'pixel_paige',
    name: 'Pixel Paige',
    tagline: 'High-score chaser from the boardwalk arcades.',
    tier: 'rookie',
    difficulty: 2,
    games: ['basketball', 'colosseum'],
  },
  {
    id: 'cassette_kid',
    name: 'Cassette Kid',
    tagline: 'Learned everything from dusty strategy tapes.',
    tier: 'rookie',
    difficulty: 3,
    games: ['chess', 'colosseum'],
  },
  {
    id: 'nova_drift',
    name: 'Nova Drift',
    tagline: 'Fast fingers, faster mouth.',
    tier: 'rookie',
    difficulty: 2,
    games: ['basketball'],
  },
  {
    id: 'button_masher',
    name: 'Button Masher',
    tagline: 'Subtlety is a rumor. Enthusiasm is a weapon.',
    tier: 'rookie',
    difficulty: 1,
    games: ['colosseum', 'basketball'],
  },
  // -- Veteran: seasoned, crafty ------------------------------------------
  {
    id: 'vector_vex',
    name: 'Vector Vex',
    tagline: 'Undefeated in three sector leagues.',
    tier: 'veteran',
    difficulty: 5,
    games: ['chess', 'colosseum'],
  },
  {
    id: 'glitch_witch',
    name: 'Glitch Witch',
    tagline: 'Finds the seams in every system.',
    tier: 'veteran',
    difficulty: 6,
    games: ['chess', 'basketball'],
  },
  {
    id: 'captain_cathode',
    name: 'Captain Cathode',
    tagline: 'Old-school duelist. Never blinks first.',
    tier: 'veteran',
    difficulty: 5,
    games: ['colosseum', 'basketball'],
  },
  {
    id: 'mirage_nine',
    name: 'Mirage-9',
    tagline: 'You never face the same Mirage twice.',
    tier: 'veteran',
    difficulty: 7,
    games: ['chess', 'colosseum'],
  },
  {
    id: 'combo_breaker',
    name: 'Combo Breaker',
    tagline: 'Lives for the fourth quarter.',
    tier: 'veteran',
    difficulty: 6,
    games: ['basketball', 'colosseum'],
  },
  // -- Elite: feared -------------------------------------------------------
  {
    id: 'null_prophet',
    name: 'Null Prophet',
    tagline: 'Reads the board three moves before you do.',
    tier: 'elite',
    difficulty: 9,
    games: ['chess'],
  },
  {
    id: 'the_archivist',
    name: 'The Archivist',
    tagline: 'Has catalogued ten thousand defeats. None were hers.',
    tier: 'elite',
    difficulty: 9,
    games: ['chess', 'colosseum'],
  },
  {
    id: 'deadline_dj',
    name: 'Deadline DJ',
    tagline: 'Scores in rhythm. The clock is her instrument.',
    tier: 'elite',
    difficulty: 8,
    games: ['basketball'],
  },
  {
    id: 'iron_mandala',
    name: 'Iron Mandala',
    tagline: 'Perfect circles. Perfect strikes.',
    tier: 'elite',
    difficulty: 8,
    games: ['colosseum', 'basketball'],
  },
  {
    id: 'paradox_prime',
    name: 'Paradox Prime',
    tagline: 'The rumor the leaderboards whisper about.',
    tier: 'elite',
    difficulty: 10,
    games: ['chess', 'colosseum', 'basketball'],
  },
];

/** Look up an NPC by id. Returns null when unknown. */
export function getNpc(id) {
  return NPCS.find((n) => n.id === id) || null;
}

/** All NPCs willing to play a given game slug, easiest first. */
export function npcsForGame(gameSlug) {
  return NPCS.filter((n) => n.games.includes(gameSlug)).sort(
    (a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name),
  );
}

/** NPCs of a given tier, easiest first. */
export function npcsByTier(tier) {
  if (!TIERS.includes(tier)) throw new Error(`Unknown tier: ${tier}`);
  return NPCS.filter((n) => n.tier === tier).sort((a, b) => a.difficulty - b.difficulty);
}

/** Sort any NPC list by difficulty ascending (stable by name). */
export function sortByDifficulty(list) {
  return [...list].sort(
    (a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name),
  );
}

/**
 * Pick backfill NPCs for a game: prefer the tier band closest to the table's
 * average human skill when known, otherwise fill from the requested tier
 * (default rookie) upward. Never returns duplicates or NPCs outside the game.
 */
export function pickBackfill({ gameSlug, count, tier = 'rookie', excludeIds = [] }) {
  const excluded = new Set(excludeIds);
  const start = TIER_ORDER[tier] ?? 0;
  const picks = [];
  for (let t = start; t < TIERS.length && picks.length < count; t += 1) {
    for (const npc of npcsByTier(TIERS[t])) {
      if (picks.length >= count) break;
      if (!npc.games.includes(gameSlug) || excluded.has(npc.id)) continue;
      excluded.add(npc.id);
      picks.push(npc);
    }
  }
  return picks;
}

/** Human-readable difficulty label for UI. */
export function difficultyLabel(difficulty) {
  if (difficulty <= 3) return 'Rookie';
  if (difficulty <= 7) return 'Veteran';
  return 'Elite';
}
