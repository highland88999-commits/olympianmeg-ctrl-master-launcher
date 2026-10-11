// lib/achievements/catalog.js
// Achievement catalog: every earnable achievement in Olympus.
// Vecna Slayer milestones live separately (lib/hawkins/vecna-slayer.js)
// because of their global ordering + collectible video.
//
// MERLIN'S RULE (2026-10-09): achievements ALWAYS ship with a cinematic
// video celebration. `video` points at public/videos/achievements/<key>.mp4.
// The celebration component plays the video when the file loads and falls
// back to the typographic card while the video is missing.

export const ACHIEVEMENTS = {
  'olympian-scholar': {
    title: 'Olympian Scholar',
    description: 'Completed all 12 Olympian Education lessons across the three schools.',
    // Lesson IDs that must all be present for the award to be granted.
    requiresLessonIds: [
      'socratic', 'democracy', 'alphabet', 'stoicism',
      'pythagoras', 'nightsky', 'levers', 'watercycle',
      'binary', 'algorithms', 'webpage', 'pixels',
    ],
  },
  // Cloud Phone Pioneer: awarded server-side only (see
  // app/api/cloud-phone/install/route.js) on a user's first-ever cloud
  // install. Pure prestige — no gold. Listed here so the achievements
  // ledger page renders its title/description.
  'cloud-phone-pioneer': {
    title: 'Cloud Phone Pioneer',
    description: 'Installed your first app into Cloud Phone — your apps now live in your cloud, not on your phone.',
    video: '/videos/achievements/cloud-phone-pioneer.mp4',
  },
  // Calendar achievements: granted from app/calendar/page.jsx via the
  // whitelisted POST /api/achievements/grant route. The created-count
  // (olympus:calendar:created-count:<uid>) tracks lifetime events created
  // so deleting events can't re-trigger or game the milestones.
  'calendar-first-entry': {
    title: 'First Entry',
    description: 'Created your first calendar event. The schedule begins.',
    video: '/videos/achievements/calendar-first-entry.mp4',
  },
  'calendar-tenth-entry': {
    title: 'Ten Entries',
    description: 'Created your tenth calendar event. A life, organized.',
    video: '/videos/achievements/calendar-tenth-entry.mp4',
  },
  // Calculator: granted from app/calculator/page.jsx on the user's first
  // completed calculation (a valid `=` evaluation), via the whitelisted
  // POST /api/achievements/grant route.
  'calculator-first-use': {
    title: 'First Calculation',
    description: 'Completed your first calculation. Precision unlocked.',
    video: '/videos/achievements/calculator-first-use.mp4',
  },
  // -----------------------------------------------------------------
  // Game achievements: 26 games x 3 (first taste -> skill -> mastery/PvP).
  // Generated 2026-10-11 from lib/achievements/game-achievement-manifest.json
  // (see also GAME_ACHIEVEMENT_PLAN.md for triggers + cinematic prompts).
  // Every entry carries `video:` per MERLIN'S RULE — the cinematic
  // celebration at /videos/achievements/<key>.mp4, typographic gold card
  // fallback while the video is missing. `game` is the route slug used
  // by the grant route for PvP verification via pvp_matches.
  // -----------------------------------------------------------------
  // --- Quantum Chess (chess) ---
  "chess-first-blood": {
    title: "First Blood",
    description: "Win your first game of Quantum Chess — against the CPU or a human.",
    video: "/videos/achievements/chess-first-blood.mp4",
    game: "chess",
  },
  "chess-tactician": {
    title: "Tactician",
    description: "Win 3 games in a row.",
    video: "/videos/achievements/chess-tactician.mp4",
    game: "chess",
  },
  "chess-sector-champion": {
    title: "Sector Champion",
    description: "Win your first PvP match against a human opponent.",
    video: "/videos/achievements/chess-sector-champion.mp4",
    game: "chess",
    verify: 'pvp', // server-verified: grant route checks pvp_matches
  },
  // --- Streetball (basketball) ---
  "basketball-first-bucket": {
    title: "First Bucket",
    description: "Score your first basket in a shootout.",
    video: "/videos/achievements/basketball-first-bucket.mp4",
    game: "basketball",
  },
  "basketball-sharpshooter": {
    title: "Sharpshooter",
    description: "Score 30+ points in a single 60-second shootout.",
    video: "/videos/achievements/basketball-sharpshooter.mp4",
    game: "basketball",
  },
  "basketball-court-king": {
    title: "Court King",
    description: "Finish 1st in a PvP shootout with 3 or more players.",
    video: "/videos/achievements/basketball-court-king.mp4",
    game: "basketball",
    verify: 'pvp', // server-verified: grant route checks pvp_matches
  },
  // --- Colosseum (colosseum) ---
  "colosseum-first-victory": {
    title: "First Victory",
    description: "Win your first arena bout.",
    video: "/videos/achievements/colosseum-first-victory.mp4",
    game: "colosseum",
  },
  "colosseum-undefeated": {
    title: "Undefeated",
    description: "Win 5 bouts in a row.",
    video: "/videos/achievements/colosseum-undefeated.mp4",
    game: "colosseum",
  },
  "colosseum-arena-champion": {
    title: "Arena Champion",
    description: "Win a PvP arena match with 4 or more combatants.",
    video: "/videos/achievements/colosseum-arena-champion.mp4",
    game: "colosseum",
    verify: 'pvp', // server-verified: grant route checks pvp_matches
  },
  // --- Battleship (battleship) ---
  "battleship-first-sinking": {
    title: "First Sinking",
    description: "Sink your first enemy ship.",
    video: "/videos/achievements/battleship-first-sinking.mp4",
    game: "battleship",
  },
  "battleship-fleet-destroyer": {
    title: "Fleet Destroyer",
    description: "Sink the entire enemy fleet and win the battle.",
    video: "/videos/achievements/battleship-fleet-destroyer.mp4",
    game: "battleship",
  },
  "battleship-admiral": {
    title: "Admiral",
    description: "Win a PvP fleet battle against a human admiral.",
    video: "/videos/achievements/battleship-admiral.mp4",
    game: "battleship",
    verify: 'pvp', // server-verified: grant route checks pvp_matches
  },
  // --- Luge (luge) ---
  "luge-first-run": {
    title: "First Run",
    description: "Complete your first full run down the ice.",
    video: "/videos/achievements/luge-first-run.mp4",
    game: "luge",
  },
  "luge-ice-bullet": {
    title: "Ice Bullet",
    description: "Set a top-10 leaderboard time on any track.",
    video: "/videos/achievements/luge-ice-bullet.mp4",
    game: "luge",
  },
  "luge-pack-leader": {
    title: "Pack Leader",
    description: "Win a PvP mass race.",
    video: "/videos/achievements/luge-pack-leader.mp4",
    game: "luge",
    verify: 'pvp', // server-verified: grant route checks pvp_matches
  },
  // --- Raptor Rush (raptor-rush) ---
  "raptor-rush-first-feast": {
    title: "First Feast",
    description: "Eat your first rabbit.",
    video: "/videos/achievements/raptor-rush-first-feast.mp4",
    game: "raptor-rush",
  },
  "raptor-rush-apex-predator": {
    title: "Apex Predator",
    description: "Score 5,000+ points in a single hunt.",
    video: "/videos/achievements/raptor-rush-apex-predator.mp4",
    game: "raptor-rush",
  },
  "raptor-rush-alpha": {
    title: "Alpha",
    description: "Finish 1st in a PvP hunt.",
    video: "/videos/achievements/raptor-rush-alpha.mp4",
    game: "raptor-rush",
    verify: 'pvp', // server-verified: grant route checks pvp_matches
  },
  // --- Shadow Realm (shadow-realm) ---
  "shadow-realm-first-ride": {
    title: "First Ride",
    description: "Complete your first Night Grid race.",
    video: "/videos/achievements/shadow-realm-first-ride.mp4",
    game: "shadow-realm",
  },
  "shadow-realm-neon-survivor": {
    title: "Neon Survivor",
    description: "Win a race without a single crash.",
    video: "/videos/achievements/shadow-realm-neon-survivor.mp4",
    game: "shadow-realm",
  },
  "shadow-realm-grid-lord": {
    title: "Grid Lord",
    description: "Win a PvP bump race.",
    video: "/videos/achievements/shadow-realm-grid-lord.mp4",
    game: "shadow-realm",
    verify: 'pvp', // server-verified: grant route checks pvp_matches
  },
  // --- Air Hockey (air-hockey) ---
  "air-hockey-first-goal": {
    title: "First Goal",
    description: "Score your first goal.",
    video: "/videos/achievements/air-hockey-first-goal.mp4",
    game: "air-hockey",
  },
  "air-hockey-shutout": {
    title: "Shutout",
    description: "Win a match without conceding a single goal.",
    video: "/videos/achievements/air-hockey-shutout.mp4",
    game: "air-hockey",
  },
  "air-hockey-table-king": {
    title: "Table King",
    description: "Win your first PvP match.",
    video: "/videos/achievements/air-hockey-table-king.mp4",
    game: "air-hockey",
    verify: 'pvp', // server-verified: grant route checks pvp_matches
  },
  // --- Kombat (kombat) ---
  "kombat-first-ko": {
    title: "First KO",
    description: "Win your first fight.",
    video: "/videos/achievements/kombat-first-ko.mp4",
    game: "kombat",
  },
  "kombat-finish-him": {
    title: "Finish Him",
    description: "Land a finisher on a defeated opponent.",
    video: "/videos/achievements/kombat-finish-him.mp4",
    game: "kombat",
  },
  "kombat-flawless-victory": {
    title: "Flawless Victory",
    description: "Win a full match without taking any damage.",
    video: "/videos/achievements/kombat-flawless-victory.mp4",
    game: "kombat",
  },
  // --- Enyo (enyo) ---
  "enyo-first-frag": {
    title: "First Frag",
    description: "Get your first elimination.",
    video: "/videos/achievements/enyo-first-frag.mp4",
    game: "enyo",
  },
  "enyo-rampage": {
    title: "Rampage",
    description: "Get 10 eliminations in a single match.",
    video: "/videos/achievements/enyo-rampage.mp4",
    game: "enyo",
  },
  "enyo-untouchable": {
    title: "Untouchable",
    description: "Win a deathmatch without dying once.",
    video: "/videos/achievements/enyo-untouchable.mp4",
    game: "enyo",
  },
  // --- Omega Pinball (omega-pinball) ---
  "omega-pinball-silver-ball": {
    title: "Silver Ball",
    description: "Score 100,000 points in a single game.",
    video: "/videos/achievements/omega-pinball-silver-ball.mp4",
    game: "omega-pinball",
  },
  "omega-pinball-multiball-master": {
    title: "Multiball Master",
    description: "Trigger multiball 3 times in one game.",
    video: "/videos/achievements/omega-pinball-multiball-master.mp4",
    game: "omega-pinball",
  },
  "omega-pinball-grand-champion": {
    title: "Grand Champion",
    description: "Take the #1 spot on the leaderboard.",
    video: "/videos/achievements/omega-pinball-grand-champion.mp4",
    game: "omega-pinball",
  },
  // --- Starblood (starblood) ---
  "starblood-first-pair": {
    title: "First Pair",
    description: "Match your first rune pair.",
    video: "/videos/achievements/starblood-first-pair.mp4",
    game: "starblood",
  },
  "starblood-clear-board": {
    title: "Clear Board",
    description: "Clear all 20 rune cards.",
    video: "/videos/achievements/starblood-clear-board.mp4",
    game: "starblood",
  },
  "starblood-perfect-recall": {
    title: "Perfect Recall",
    description: "Clear the board in 12 moves or fewer.",
    video: "/videos/achievements/starblood-perfect-recall.mp4",
    game: "starblood",
  },
  // --- Astra (astra) ---
  "astra-first-kill": {
    title: "First Kill",
    description: "Destroy your first drone.",
    video: "/videos/achievements/astra-first-kill.mp4",
    game: "astra",
  },
  "astra-ace": {
    title: "Ace",
    description: "Destroy 50 drones in a single patrol run.",
    video: "/videos/achievements/astra-ace.mp4",
    game: "astra",
  },
  "astra-iron-hull": {
    title: "Iron Hull",
    description: "Complete a full patrol run without losing your ship.",
    video: "/videos/achievements/astra-iron-hull.mp4",
    game: "astra",
  },
  // --- Zeus Protocol (zeus-protocol) ---
  "zeus-protocol-first-strike": {
    title: "First Strike",
    description: "Destroy your first enemy fighter.",
    video: "/videos/achievements/zeus-protocol-first-strike.mp4",
    game: "zeus-protocol",
  },
  "zeus-protocol-wave-breaker": {
    title: "Wave Breaker",
    description: "Survive to wave 10.",
    video: "/videos/achievements/zeus-protocol-wave-breaker.mp4",
    game: "zeus-protocol",
  },
  "zeus-protocol-god-of-thunder": {
    title: "God of Thunder",
    description: "Clear the campaign on the hardest difficulty.",
    video: "/videos/achievements/zeus-protocol-god-of-thunder.mp4",
    game: "zeus-protocol",
  },
  // --- Neon Racer (neon-racer) ---
  "neon-racer-first-flight": {
    title: "First Flight",
    description: "Survive your first full 90-second mission.",
    video: "/videos/achievements/neon-racer-first-flight.mp4",
    game: "neon-racer",
  },
  "neon-racer-wormrider": {
    title: "Wormrider",
    description: "Thread 5 wormhole rings in a single run.",
    video: "/videos/achievements/neon-racer-wormrider.mp4",
    game: "neon-racer",
  },
  "neon-racer-star-surfer": {
    title: "Star Surfer",
    description: "Collect 100 star shards in a single run.",
    video: "/videos/achievements/neon-racer-star-surfer.mp4",
    game: "neon-racer",
  },
  // --- Excalibur (excalibur) ---
  "excalibur-worthy": {
    title: "Worthy",
    description: "Win your first duel.",
    video: "/videos/achievements/excalibur-worthy.mp4",
    game: "excalibur",
  },
  "excalibur-stone-shaker": {
    title: "Stone Shaker",
    description: "Draw the sword fully from the stone.",
    video: "/videos/achievements/excalibur-stone-shaker.mp4",
    game: "excalibur",
  },
  "excalibur-high-king": {
    title: "High King",
    description: "Win 5 duels in a row.",
    video: "/videos/achievements/excalibur-high-king.mp4",
    game: "excalibur",
  },
  // --- Zeus v Hades (zeus-v-hades) ---
  "zeus-v-hades-first-soul": {
    title: "First Soul",
    description: "Collect your first soul.",
    video: "/videos/achievements/zeus-v-hades-first-soul.mp4",
    game: "zeus-v-hades",
  },
  "zeus-v-hades-soul-surge": {
    title: "Soul Surge",
    description: "Charge and unleash a full lightning boost.",
    video: "/videos/achievements/zeus-v-hades-soul-surge.mp4",
    game: "zeus-v-hades",
  },
  "zeus-v-hades-godslayer": {
    title: "Godslayer",
    description: "Beat Hades to the finish line.",
    video: "/videos/achievements/zeus-v-hades-godslayer.mp4",
    game: "zeus-v-hades",
  },
  // --- Guillotine (guillotine) ---
  "guillotine-first-drop": {
    title: "First Drop",
    description: "Complete your first blade drop.",
    video: "/videos/achievements/guillotine-first-drop.mp4",
    game: "guillotine",
  },
  "guillotine-dead-center": {
    title: "Dead Center",
    description: "Land a perfect-center drop.",
    video: "/videos/achievements/guillotine-dead-center.mp4",
    game: "guillotine",
  },
  "guillotine-master-executioner": {
    title: "Master Executioner",
    description: "Land 3 perfect drops in a row.",
    video: "/videos/achievements/guillotine-master-executioner.mp4",
    game: "guillotine",
  },
  // --- Arachnid Weaver (arachnid-weaver) ---
  "arachnid-weaver-first-night": {
    title: "First Night",
    description: "Survive 60 seconds in the Weaver's nest.",
    video: "/videos/achievements/arachnid-weaver-first-night.mp4",
    game: "arachnid-weaver",
  },
  "arachnid-weaver-web-dodger": {
    title: "Web Dodger",
    description: "Escape 5 web traps in a single run.",
    video: "/videos/achievements/arachnid-weaver-web-dodger.mp4",
    game: "arachnid-weaver",
  },
  "arachnid-weaver-dawn-bringer": {
    title: "Dawn Bringer",
    description: "Survive the full night and see dawn.",
    video: "/videos/achievements/arachnid-weaver-dawn-bringer.mp4",
    game: "arachnid-weaver",
  },
  // --- Hawkins: Hunt For Vecna (hawkins) ---
  "hawkins-first-clue": {
    title: "First Clue",
    description: "Find your first clue in the hunt.",
    video: "/videos/achievements/hawkins-first-clue.mp4",
    game: "hawkins",
  },
  "hawkins-party-up": {
    title: "Party Up",
    description: "Complete a hunt alongside other players.",
    video: "/videos/achievements/hawkins-party-up.mp4",
    game: "hawkins",
  },
  "hawkins-gatekeeper": {
    title: "Gatekeeper",
    description: "Seal the gate in the final hunt chapter.",
    video: "/videos/achievements/hawkins-gatekeeper.mp4",
    game: "hawkins",
  },
  // --- DK Hero (dk-hero) ---
  "dk-hero-top-of-the-tower": {
    title: "Top of the Tower",
    description: "Climb to the ship and clear the first level.",
    video: "/videos/achievements/dk-hero-top-of-the-tower.mp4",
    game: "dk-hero",
  },
  "dk-hero-barrel-dodger": {
    title: "Barrel Dodger",
    description: "Clear a level without taking a single hit.",
    video: "/videos/achievements/dk-hero-barrel-dodger.mp4",
    game: "dk-hero",
  },
  "dk-hero-siege-breaker": {
    title: "Siege Breaker",
    description: "Clear every level of the siege.",
    video: "/videos/achievements/dk-hero-siege-breaker.mp4",
    game: "dk-hero",
  },
  // --- Ice Dragon (ice-dragon) ---
  "ice-dragon-first-wake": {
    title: "First Wake",
    description: "Wake the dragon to full wakefulness.",
    video: "/videos/achievements/ice-dragon-first-wake.mp4",
    game: "ice-dragon",
  },
  "ice-dragon-sky-rider": {
    title: "Sky Rider",
    description: "Complete a full flight loop around the glacier.",
    video: "/videos/achievements/ice-dragon-sky-rider.mp4",
    game: "ice-dragon",
  },
  "ice-dragon-glacier-king": {
    title: "Glacier King",
    description: "Complete 5 full flight loops in one session.",
    video: "/videos/achievements/ice-dragon-glacier-king.mp4",
    game: "ice-dragon",
  },
  // --- Ice Monster (ice-monster) ---
  "ice-monster-first-blood": {
    title: "First Blood",
    description: "Land your first hit on the monster.",
    video: "/videos/achievements/ice-monster-first-blood.mp4",
    game: "ice-monster",
  },
  "ice-monster-monster-slayer": {
    title: "Monster Slayer",
    description: "Defeat the ice monster.",
    video: "/videos/achievements/ice-monster-monster-slayer.mp4",
    game: "ice-monster",
  },
  "ice-monster-flawless-hunt": {
    title: "Flawless Hunt",
    description: "Defeat the monster without taking damage.",
    video: "/videos/achievements/ice-monster-flawless-hunt.mp4",
    game: "ice-monster",
  },
  // --- Rogers Arena (rogers-arena) ---
  "rogers-arena-first-show": {
    title: "First Show",
    description: "Attend your first Concert Night.",
    video: "/videos/achievements/rogers-arena-first-show.mp4",
    game: "rogers-arena",
  },
  "rogers-arena-hat-trick": {
    title: "Hat Trick",
    description: "Score 3 goals in a single Game Night.",
    video: "/videos/achievements/rogers-arena-hat-trick.mp4",
    game: "rogers-arena",
  },
  "rogers-arena-game-night-mvp": {
    title: "Game Night MVP",
    description: "Win a Game Night match.",
    video: "/videos/achievements/rogers-arena-game-night-mvp.mp4",
    game: "rogers-arena",
  },
  // --- Hive (hive) ---
  "hive-first-pulse": {
    title: "First Pulse",
    description: "Send your first pulse through the hive.",
    video: "/videos/achievements/hive-first-pulse.mp4",
    game: "hive",
  },
  "hive-hive-mind": {
    title: "Hive Mind",
    description: "Fill the hive-mind meter to 100%.",
    video: "/videos/achievements/hive-hive-mind.mp4",
    game: "hive",
  },
  "hive-perfect-harmony": {
    title: "Perfect Harmony",
    description: "Solve a hive puzzle with the optimal move count.",
    video: "/videos/achievements/hive-perfect-harmony.mp4",
    game: "hive",
  },
  // --- Orbital Ascent (orbital-ascent) ---
  "orbital-ascent-first-boost": {
    title: "First Boost",
    description: "Land your first perfectly-timed jump boost.",
    video: "/videos/achievements/orbital-ascent-first-boost.mp4",
    game: "orbital-ascent",
  },
  "orbital-ascent-high-flyer": {
    title: "High Flyer",
    description: "Reach level 50 of the ascent.",
    video: "/videos/achievements/orbital-ascent-high-flyer.mp4",
    game: "orbital-ascent",
  },
  "orbital-ascent-summit": {
    title: "Summit",
    description: "Reach level 99 — the top of the tower.",
    video: "/videos/achievements/orbital-ascent-summit.mp4",
    game: "orbital-ascent",
  },

};

// Keys the client is allowed to request via POST /api/achievements/grant.
// NEVER add a key here that the server cannot verify or that must stay
// server-initiated. cloud-phone-pioneer is additionally verified server-side
// (the requester must actually own a cloud phone instance).
export const CLIENT_GRANTABLE = [
  'cloud-phone-pioneer',
  'calendar-first-entry',
  'calendar-tenth-entry',
  'calculator-first-use',
  // Game achievements (26 games x 3). PvP-win keys are additionally
  // verified server-side via pvp_matches in the grant route.
  "chess-first-blood",
  "chess-tactician",
  "chess-sector-champion",
  "basketball-first-bucket",
  "basketball-sharpshooter",
  "basketball-court-king",
  "colosseum-first-victory",
  "colosseum-undefeated",
  "colosseum-arena-champion",
  "battleship-first-sinking",
  "battleship-fleet-destroyer",
  "battleship-admiral",
  "luge-first-run",
  "luge-ice-bullet",
  "luge-pack-leader",
  "raptor-rush-first-feast",
  "raptor-rush-apex-predator",
  "raptor-rush-alpha",
  "shadow-realm-first-ride",
  "shadow-realm-neon-survivor",
  "shadow-realm-grid-lord",
  "air-hockey-first-goal",
  "air-hockey-shutout",
  "air-hockey-table-king",
  "kombat-first-ko",
  "kombat-finish-him",
  "kombat-flawless-victory",
  "enyo-first-frag",
  "enyo-rampage",
  "enyo-untouchable",
  "omega-pinball-silver-ball",
  "omega-pinball-multiball-master",
  "omega-pinball-grand-champion",
  "starblood-first-pair",
  "starblood-clear-board",
  "starblood-perfect-recall",
  "astra-first-kill",
  "astra-ace",
  "astra-iron-hull",
  "zeus-protocol-first-strike",
  "zeus-protocol-wave-breaker",
  "zeus-protocol-god-of-thunder",
  "neon-racer-first-flight",
  "neon-racer-wormrider",
  "neon-racer-star-surfer",
  "excalibur-worthy",
  "excalibur-stone-shaker",
  "excalibur-high-king",
  "zeus-v-hades-first-soul",
  "zeus-v-hades-soul-surge",
  "zeus-v-hades-godslayer",
  "guillotine-first-drop",
  "guillotine-dead-center",
  "guillotine-master-executioner",
  "arachnid-weaver-first-night",
  "arachnid-weaver-web-dodger",
  "arachnid-weaver-dawn-bringer",
  "hawkins-first-clue",
  "hawkins-party-up",
  "hawkins-gatekeeper",
  "dk-hero-top-of-the-tower",
  "dk-hero-barrel-dodger",
  "dk-hero-siege-breaker",
  "ice-dragon-first-wake",
  "ice-dragon-sky-rider",
  "ice-dragon-glacier-king",
  "ice-monster-first-blood",
  "ice-monster-monster-slayer",
  "ice-monster-flawless-hunt",
  "rogers-arena-first-show",
  "rogers-arena-hat-trick",
  "rogers-arena-game-night-mvp",
  "hive-first-pulse",
  "hive-hive-mind",
  "hive-perfect-harmony",
  "orbital-ascent-first-boost",
  "orbital-ascent-high-flyer",
  "orbital-ascent-summit",
];

export function getAchievement(key) {
  return ACHIEVEMENTS[key] || null;
}
