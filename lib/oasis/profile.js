// OASIS profile stats — pure helpers for the persistent gamer identity.
// Stats shape per game: { wins, losses, eliteWins }. Boss wins are a list
// of boss ids plus earned titles.

export function emptyStats() {
  return {
    chess: { wins: 0, losses: 0, eliteWins: 0 },
    basketball: { wins: 0, losses: 0, eliteWins: 0 },
    colosseum: { wins: 0, losses: 0, eliteWins: 0 },
    battleship: { wins: 0, losses: 0, eliteWins: 0 },
  };
}

/** Merge stored stats over the empty shape so new games never break old rows. */
export function normalizeStats(stored) {
  const base = emptyStats();
  if (!stored || typeof stored !== 'object') return base;
  for (const game of Object.keys(base)) {
    if (stored[game] && typeof stored[game] === 'object') {
      base[game] = {
        wins: Math.max(0, stored[game].wins | 0),
        losses: Math.max(0, stored[game].losses | 0),
        eliteWins: Math.max(0, stored[game].eliteWins | 0),
      };
    }
  }
  return base;
}

/**
 * Record a finished match. `eliteWin` marks wins against elite-tier NPCs
 * (which is what unlocks boss fights).
 */
export function recordResult(stats, gameSlug, { won, eliteWin = false } = {}) {
  const next = normalizeStats(stats);
  if (!next[gameSlug]) return next;
  if (won) {
    next[gameSlug].wins += 1;
    if (eliteWin) next[gameSlug].eliteWins += 1;
  } else {
    next[gameSlug].losses += 1;
  }
  return next;
}

/** Record a boss victory: boss id + the bragging-rights title it grants. */
export function recordBossWin(bossWins, bossId, title) {
  const wins = Array.isArray(bossWins) ? [...bossWins] : [];
  if (!wins.some((w) => w.bossId === bossId)) {
    wins.push({ bossId, title, at: new Date().toISOString() });
  }
  return wins;
}

/** Win rate 0..1 for a game, null when no matches played. */
export function winRate(gameStats) {
  const played = (gameStats?.wins | 0) + (gameStats?.losses | 0);
  if (played === 0) return null;
  return gameStats.wins / played;
}

export const AVATARS = [
  { id: 'nova', label: 'Nova', bg: 'bg-cyan-500/20', fg: 'text-cyan-300', glyph: 'N' },
  { id: 'vortex', label: 'Vortex', bg: 'bg-fuchsia-500/20', fg: 'text-fuchsia-300', glyph: 'V' },
  { id: 'ember', label: 'Ember', bg: 'bg-amber-500/20', fg: 'text-amber-300', glyph: 'E' },
  { id: 'tide', label: 'Tide', bg: 'bg-teal-500/20', fg: 'text-teal-300', glyph: 'T' },
  { id: 'onyx', label: 'Onyx', bg: 'bg-zinc-500/20', fg: 'text-zinc-300', glyph: 'O' },
  { id: 'pulse', label: 'Pulse', bg: 'bg-red-500/20', fg: 'text-red-300', glyph: 'P' },
];

export function getAvatar(id) {
  return AVATARS.find((a) => a.id === id) || AVATARS[0];
}
