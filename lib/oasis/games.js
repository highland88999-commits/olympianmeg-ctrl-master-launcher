// OASIS — per-game registry.
// Each PvP-capable game declares its identity, its min/max participation,
// and the visual accent its lobby components should wear. The lobby never
// rebuilds a game; it launches the game's existing engine.

export const GAMES = {
  chess: {
    slug: 'chess',
    name: 'Quantum Chess',
    tagline: 'Orbital combat on the 8x8 grid',
    minPlayers: 2,
    maxPlayers: 2,
    npcBackfill: true,
    bossRush: true,
    // Tailwind accent classes matching the game's existing visual language.
    theme: {
      accentText: 'text-fuchsia-400',
      accentBorder: 'border-fuchsia-500/50',
      accentBg: 'bg-fuchsia-950/20',
      accentHover: 'hover:bg-fuchsia-500/20',
      glow: 'shadow-[0_0_20px_rgba(255,0,255,0.15)]',
      secondaryText: 'text-cyan-400',
      secondaryBorder: 'border-cyan-500/50',
    },
    shareTitle: 'Quantum Chess',
    shareText: (code) => `Join my combat sector! Code: ${code}`,
    codeLabel: 'SECTOR UPLINK CODE',
  },
  basketball: {
    slug: 'basketball',
    name: 'Streetball',
    tagline: 'Shootout on the blacktop',
    minPlayers: 2,
    maxPlayers: 6,
    npcBackfill: true,
    bossRush: true,
    theme: {
      accentText: 'text-amber-300',
      accentBorder: 'border-amber-500/50',
      accentBg: 'bg-amber-950/20',
      accentHover: 'hover:bg-amber-500/20',
      glow: 'shadow-[0_0_20px_rgba(251,191,36,0.15)]',
      secondaryText: 'text-orange-400',
      secondaryBorder: 'border-orange-500/50',
    },
    shareTitle: 'Streetball',
    shareText: (code) => `Run it back with me on the blacktop! Code: ${code}`,
    codeLabel: 'COURT CODE',
  },
  colosseum: {
    slug: 'colosseum',
    name: 'Colosseum',
    tagline: 'Arena combat of champions',
    minPlayers: 2,
    maxPlayers: 8,
    npcBackfill: true,
    bossRush: true,
    theme: {
      accentText: 'text-teal-300',
      accentBorder: 'border-teal-400/50',
      accentBg: 'bg-teal-950/20',
      accentHover: 'hover:bg-teal-500/20',
      glow: 'shadow-[0_0_20px_rgba(102,252,241,0.15)]',
      secondaryText: 'text-cyan-300',
      secondaryBorder: 'border-cyan-400/50',
    },
    shareTitle: 'Colosseum',
    shareText: (code) => `Enter the arena with me! Code: ${code}`,
    codeLabel: 'ARENA CODE',
  },
  battleship: {
    slug: 'battleship',
    name: 'Battleship',
    tagline: 'Fleet command on the dark water',
    minPlayers: 2,
    maxPlayers: 2,
    npcBackfill: false, // battleship keeps its own PvE; the reference implementation is untouched
    bossRush: false,
    theme: {
      accentText: 'text-fuchsia-400',
      accentBorder: 'border-fuchsia-500/50',
      accentBg: 'bg-fuchsia-950/20',
      accentHover: 'hover:bg-fuchsia-500/20',
      glow: 'shadow-[0_0_20px_rgba(255,0,255,0.15)]',
      secondaryText: 'text-cyan-400',
      secondaryBorder: 'border-cyan-500/50',
    },
    shareTitle: 'Battleship',
    shareText: (code) => `Command a fleet against me! Code: ${code}`,
    codeLabel: 'FLEET CODE',
  },
  'raptor-rush': {
    slug: 'raptor-rush',
    name: 'Raptor Rush',
    tagline: 'Dead-ahead canyon hunt — eat rabbits, high score wins',
    minPlayers: 2,
    maxPlayers: 4,
    npcBackfill: false, // PvP party runs are real hunters only; no CPU rivals
    bossRush: false,
    theme: {
      accentText: 'text-emerald-300',
      accentBorder: 'border-emerald-500/50',
      accentBg: 'bg-emerald-950/20',
      accentHover: 'hover:bg-emerald-500/20',
      glow: 'shadow-[0_0_20px_rgba(52,211,153,0.15)]',
      secondaryText: 'text-amber-300',
      secondaryBorder: 'border-amber-500/50',
    },
    shareTitle: 'Raptor Rush',
    shareText: (code) => `Join my raptor hunt! Code: ${code}`,
    codeLabel: 'HUNT CODE',
  },
};

export function getGame(slug) {
  return GAMES[slug] || null;
}

export function gameSlugs() {
  return Object.keys(GAMES);
}
