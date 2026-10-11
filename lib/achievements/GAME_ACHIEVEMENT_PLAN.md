# Game Achievement Plan

Comprehensive achievement plan for every playable game in the Olympus launcher.
Merlin's rules: every achievement ships with a cinematic video celebration; prestige only, no gold;
no grind-count achievements; every achievement must be earnable and detectable in code.

**26 games · 78 achievements** (3 per game: first taste → skill → mastery/PvP).

Video placement for every achievement: `/videos/achievements/<key>.mp4`.
Catalog wiring: add each key to `lib/achievements/catalog.js` with `video:` set;
whitelist server-verifiable keys in `CLIENT_GRANTABLE` (PvP wins verify via `pvp_matches`).

Already shipped (not duplicated here): `cloud-phone-pioneer`, `calendar-first-entry`,
`calendar-tenth-entry`, `calculator-first-use`, `olympian-scholar`,
Spooky Coin Collector trophy, and the Hawkins Vecna Slayer milestones
(which live separately in `lib/hawkins/vecna-slayer.js`).

Excluded: `order-67` (P2P voice calls, not a game). `shadow-realm-grid` is a Shadow Realm
mode, not a separate game. Kombat's #3 is a mastery feat, not PvP — its engine needs a
network-driver refactor before honest PvP exists (documented in `lib/pvp/GAME_MATRIX.md`).

## Quantum Chess (`chess`)
Route: `/chess` · PvP: live (2 players)

### `chess-first-blood` — First Blood
- **Description:** Win your first game of Quantum Chess — against the CPU or a human.
- **Trigger (detectable):** Game result = win (any opponent).
- **Video:** `/videos/achievements/chess-first-blood.mp4`
- **Prompt:** Cinematic trophy reveal — a fuchsia knight toppling a cyan pawn in slow motion on a floating orbital chessboard. A golden trophy materializes from the fallen pieces reforming in light. The words 'FIRST BLOOD' ignite in molten gold lettering. Tense, cerebral, triumphant. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `chess-tactician` — Tactician
- **Description:** Win 3 games in a row.
- **Trigger (detectable):** Consecutive-win counter reaches 3.
- **Video:** `/videos/achievements/chess-tactician.mp4`
- **Prompt:** Cinematic trophy reveal — a grandmaster's-eye view of the orbital board, holographic move-lines tracing three brilliant checkmates. A golden trophy materializes as the glowing lines converge. The words 'TACTICIAN' ignite in molten gold lettering. Brilliant, calculated, electric. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `chess-sector-champion` — Sector Champion
- **Description:** Win your first PvP match against a human opponent.
- **Trigger (detectable):** OASIS/PvP match result = win vs a human opponent.
- **Video:** `/videos/achievements/chess-sector-champion.mp4`
- **Prompt:** Cinematic trophy reveal — two rival kings facing off across the void, fuchsia and cyan nebulas clashing behind them. A golden trophy materializes from the checkmate flash. The words 'SECTOR CHAMPION' ignite in molten gold lettering. Legendary, cosmic, absolute. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Streetball (`basketball`)
Route: `/basketball` · PvP: live (2–6 players)

### `basketball-first-bucket` — First Bucket
- **Description:** Score your first basket in a shootout.
- **Trigger (detectable):** Shootout score > 0.
- **Video:** `/videos/achievements/basketball-first-bucket.mp4`
- **Prompt:** Cinematic trophy reveal — a rain-slicked blacktop court under amber streetlights, a basketball swishing through a glowing chain net in slow motion. A golden trophy materializes from the net's rippling light. The words 'FIRST BUCKET' ignite in molten gold lettering. Gritty, electric, hungry. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `basketball-sharpshooter` — Sharpshooter
- **Description:** Score 30+ points in a single 60-second shootout.
- **Trigger (detectable):** Final shootout score ≥ 30.
- **Video:** `/videos/achievements/basketball-sharpshooter.mp4`
- **Prompt:** Cinematic trophy reveal — the same blacktop at midnight, ball after ball arcing through the net leaving trails of fire. A golden trophy materializes from a storm of swishes. The words 'SHARPSHOOTER' ignite in molten gold lettering. Relentless, blazing, automatic. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `basketball-court-king` — Court King
- **Description:** Finish 1st in a PvP shootout with 3 or more players.
- **Trigger (detectable):** PvP room rank = 1 with ≥ 3 human players.
- **Video:** `/videos/achievements/basketball-court-king.mp4`
- **Prompt:** Cinematic trophy reveal — a packed streetball court, rivals frozen mid-play under the floodlights. A golden trophy materializes as the crowd erupts. The words 'COURT KING' ignite in molten gold lettering. Dominant, loud, undeniable. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Colosseum (`colosseum`)
Route: `/colosseum` · PvP: live (2–8 players)

### `colosseum-first-victory` — First Victory
- **Description:** Win your first arena bout.
- **Trigger (detectable):** Bout result = win.
- **Video:** `/videos/achievements/colosseum-first-victory.mp4`
- **Prompt:** Cinematic trophy reveal — a torch-lit sand arena at night, a champion's sword planted in the sand as the crowd roars. A golden trophy materializes from swirling sand and embers. The words 'FIRST VICTORY' ignite in molten gold lettering. Primal, roaring, earned. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `colosseum-undefeated` — Undefeated
- **Description:** Win 5 bouts in a row.
- **Trigger (detectable):** Consecutive-win counter reaches 5.
- **Video:** `/videos/achievements/colosseum-undefeated.mp4`
- **Prompt:** Cinematic trophy reveal — the arena under a blood-orange moon, five fallen banners lying in the dust. A golden trophy materializes from the champion's unbroken shadow. The words 'UNDEFEATED' ignite in molten gold lettering. Feared, flawless, eternal. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `colosseum-arena-champion` — Arena Champion
- **Description:** Win a PvP arena match with 4 or more combatants.
- **Trigger (detectable):** PvP match win with ≥ 4 human players.
- **Video:** `/videos/achievements/colosseum-arena-champion.mp4`
- **Prompt:** Cinematic trophy reveal — the grand arena packed to the walls, gladiators circling as teal flames roar. A golden trophy materializes from the clash of the final blow. The words 'ARENA CHAMPION' ignite in molten gold lettering. Mythic, thunderous, supreme. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Battleship (`battleship`)
Route: `/battleship` · PvP: live (2 players)

### `battleship-first-sinking` — First Sinking
- **Description:** Sink your first enemy ship.
- **Trigger (detectable):** Ships sunk ≥ 1 in a game.
- **Video:** `/videos/achievements/battleship-first-sinking.mp4`
- **Prompt:** Cinematic trophy reveal — a moonlit black ocean, a neon-lit warship erupting in magenta flame as it slips beneath the waves. A golden trophy materializes from the rising mist. The words 'FIRST SINKING' ignite in molten gold lettering. Cold, precise, ruthless. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `battleship-fleet-destroyer` — Fleet Destroyer
- **Description:** Sink the entire enemy fleet and win the battle.
- **Trigger (detectable):** Game result = win (all enemy ships sunk).
- **Video:** `/videos/achievements/battleship-fleet-destroyer.mp4`
- **Prompt:** Cinematic trophy reveal — the whole enemy fleet burning on the horizon, radar sweeps crossing over sinking hulls. A golden trophy materializes from the firestorm's heart. The words 'FLEET DESTROYER' ignite in molten gold lettering. Total, devastating, absolute. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `battleship-admiral` — Admiral
- **Description:** Win a PvP fleet battle against a human admiral.
- **Trigger (detectable):** PvP match result = win.
- **Video:** `/videos/achievements/battleship-admiral.mp4`
- **Prompt:** Cinematic trophy reveal — two flagships broadside-to-broadside in a storm, lightning forking over the fleet. A golden trophy materializes from the parting storm clouds. The words 'ADMIRAL' ignite in molten gold lettering. Commanding, legendary, unbowed. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Luge (`luge`)
Route: `/luge` · PvP: live (2–100 players)

### `luge-first-run` — First Run
- **Description:** Complete your first full run down the ice.
- **Trigger (detectable):** Cross the finish line.
- **Video:** `/videos/achievements/luge-first-run.mp4`
- **Prompt:** Cinematic trophy reveal — a moonlit ice chute, a sledder carving the first glowing turn, frost spraying. A golden trophy materializes from the ice spray. The words 'FIRST RUN' ignite in molten gold lettering. Fast, clean, exhilarating. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `luge-ice-bullet` — Ice Bullet
- **Description:** Set a top-10 leaderboard time on any track.
- **Trigger (detectable):** Leaderboard rank ≤ 10 on any track.
- **Video:** `/videos/achievements/luge-ice-bullet.mp4`
- **Prompt:** Cinematic trophy reveal — the track a blur of blue ice and speed lines, the sled a silver streak. A golden trophy materializes from the sonic rush. The words 'ICE BULLET' ignite in molten gold lettering. Blinding, fearless, record-breaking. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `luge-pack-leader` — Pack Leader
- **Description:** Win a PvP mass race.
- **Trigger (detectable):** PvP race rank = 1.
- **Video:** `/videos/achievements/luge-pack-leader.mp4`
- **Prompt:** Cinematic trophy reveal — a hundred sleds launching together under floodlights, ice thunder rolling. A golden trophy materializes ahead of the pack. The words 'PACK LEADER' ignite in molten gold lettering. Unstoppable, electric, first. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Raptor Rush (`raptor-rush`)
Route: `/raptor-rush` · PvP: live (2–4 players)

### `raptor-rush-first-feast` — First Feast
- **Description:** Eat your first rabbit.
- **Trigger (detectable):** Rabbits eaten ≥ 1.
- **Video:** `/videos/achievements/raptor-rush-first-feast.mp4`
- **Prompt:** Cinematic trophy reveal — a red-rock canyon at golden hour, a raptor snatching a rabbit mid-sprint, dust exploding. A golden trophy materializes from the dust cloud. The words 'FIRST FEAST' ignite in molten gold lettering. Wild, hungry, alive. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `raptor-rush-apex-predator` — Apex Predator
- **Description:** Score 5,000+ points in a single hunt.
- **Trigger (detectable):** Hunt score ≥ 5,000.
- **Video:** `/videos/achievements/raptor-rush-apex-predator.mp4`
- **Prompt:** Cinematic trophy reveal — the canyon floor marked by the hunt's trail, the raptor leaping a ravine against the setting sun. A golden trophy materializes from the sunburst. The words 'APEX PREDATOR' ignite in molten gold lettering. Savage, majestic, supreme. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `raptor-rush-alpha` — Alpha
- **Description:** Finish 1st in a PvP hunt.
- **Trigger (detectable):** PvP hunt rank = 1 among human hunters.
- **Video:** `/videos/achievements/raptor-rush-alpha.mp4`
- **Prompt:** Cinematic trophy reveal — four raptors neck-and-neck down the canyon, the leader pulling away. A golden trophy materializes from the leader's wake. The words 'ALPHA' ignite in molten gold lettering. Dominant, primal, first. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Shadow Realm (`shadow-realm`)
Route: `/shadow-realm` · PvP: live (2–12 players)

### `shadow-realm-first-ride` — First Ride
- **Description:** Complete your first Night Grid race.
- **Trigger (detectable):** Race completed.
- **Video:** `/videos/achievements/shadow-realm-first-ride.mp4`
- **Prompt:** Cinematic trophy reveal — the Night Grid's endless neon lattice, a light-cycle igniting its trail for the first time. A golden trophy materializes from the fresh light trail. The words 'FIRST RIDE' ignite in molten gold lettering. Neon, fast, awakened. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `shadow-realm-neon-survivor` — Neon Survivor
- **Description:** Win a race without a single crash.
- **Trigger (detectable):** Race win with crash count = 0.
- **Video:** `/videos/achievements/shadow-realm-neon-survivor.mp4`
- **Prompt:** Cinematic trophy reveal — the grid at full speed, the rider threading impossible gaps without a scratch, trails weaving. A golden trophy materializes from the unbroken trail. The words 'NEON SURVIVOR' ignite in molten gold lettering. Flawless, flowing, untouchable. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `shadow-realm-grid-lord` — Grid Lord
- **Description:** Win a PvP bump race.
- **Trigger (detectable):** PvP race rank = 1.
- **Video:** `/videos/achievements/shadow-realm-grid-lord.mp4`
- **Prompt:** Cinematic trophy reveal — twelve light-cycles colliding in a storm of neon, the victor's trail boxing in the last rival. A golden trophy materializes from the collapsing grid. The words 'GRID LORD' ignite in molten gold lettering. Ruthless, brilliant, supreme. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Air Hockey (`air-hockey`)
Route: `/air-hockey` · PvP: live (2 players)

### `air-hockey-first-goal` — First Goal
- **Description:** Score your first goal.
- **Trigger (detectable):** Goals scored ≥ 1.
- **Video:** `/videos/achievements/air-hockey-first-goal.mp4`
- **Prompt:** Cinematic trophy reveal — a glowing air-hockey table in a dark arcade, the puck a comet of light slamming home. A golden trophy materializes from the goal's flash. The words 'FIRST GOAL' ignite in molten gold lettering. Sharp, electric, satisfying. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `air-hockey-shutout` — Shutout
- **Description:** Win a match without conceding a single goal.
- **Trigger (detectable):** Match win with opponent score = 0.
- **Video:** `/videos/achievements/air-hockey-shutout.mp4`
- **Prompt:** Cinematic trophy reveal — the table a fortress, every rival shot turned aside in a blur of the mallet. A golden trophy materializes from the untouched goal line. The words 'SHUTOUT' ignite in molten gold lettering. Impenetrable, cold, perfect. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `air-hockey-table-king` — Table King
- **Description:** Win your first PvP match.
- **Trigger (detectable):** PvP match result = win.
- **Video:** `/videos/achievements/air-hockey-table-king.mp4`
- **Prompt:** Cinematic trophy reveal — two players locked in a lightning rally, the arcade's ghosts watching. A golden trophy materializes from the winning strike. The words 'TABLE KING' ignite in molten gold lettering. Clutch, legendary, crowned. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Kombat (`kombat`)
Route: `/kombat` · PvP: planned (PvP needs engine refactor)

### `kombat-first-ko` — First KO
- **Description:** Win your first fight.
- **Trigger (detectable):** Fight result = win.
- **Video:** `/videos/achievements/kombat-first-ko.mp4`
- **Prompt:** Cinematic trophy reveal — a smoke-choked arena, the victor standing over a fallen foe as embers rise. A golden trophy materializes from the embers. The words 'FIRST KO' ignite in molten gold lettering. Brutal, raw, earned. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `kombat-finish-him` — Finish Him
- **Description:** Land a finisher on a defeated opponent.
- **Trigger (detectable):** Fatality/finisher executed.
- **Video:** `/videos/achievements/kombat-finish-him.mp4`
- **Prompt:** Cinematic trophy reveal — the arena gone silent, the finisher's strike frozen in blood-red light. A golden trophy materializes, forged in the impact flash. The words 'FINISH HIM' ignite in molten gold lettering. Savage, iconic, final. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `kombat-flawless-victory` — Flawless Victory
- **Description:** Win a full match without taking any damage.
- **Trigger (detectable):** Match win with damage taken = 0.
- **Video:** `/videos/achievements/kombat-flawless-victory.mp4`
- **Prompt:** Cinematic trophy reveal — the fighter untouched in the arena's center, two rounds of fury leaving not a mark. A golden trophy materializes from pure, unbroken light. The words 'FLAWLESS VICTORY' ignite in molten gold lettering. Perfect, untouchable, divine. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Enyo (`enyo`)
Route: `/enyo` · PvP: planned (2–8 players)

### `enyo-first-frag` — First Frag
- **Description:** Get your first elimination.
- **Trigger (detectable):** Eliminations ≥ 1 in a match.
- **Video:** `/videos/achievements/enyo-first-frag.mp4`
- **Prompt:** Cinematic trophy reveal — a neon-lit combat arena, muzzle flash freezing the first takedown. A golden trophy materializes from the dissipating smoke. The words 'FIRST FRAG' ignite in molten gold lettering. Sharp, tactical, cold. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `enyo-rampage` — Rampage
- **Description:** Get 10 eliminations in a single match.
- **Trigger (detectable):** Eliminations ≥ 10 in one match.
- **Video:** `/videos/achievements/enyo-rampage.mp4`
- **Prompt:** Cinematic trophy reveal — the arena floor strewn with holographic wreckage, the tenth target falling. A golden trophy materializes from the kill-feed's glow. The words 'RAMPAGE' ignite in molten gold lettering. Relentless, furious, unstoppable. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `enyo-untouchable` — Untouchable
- **Description:** Win a deathmatch without dying once.
- **Trigger (detectable):** Match win with deaths = 0.
- **Video:** `/videos/achievements/enyo-untouchable.mp4`
- **Prompt:** Cinematic trophy reveal — the operative moving like a ghost through crossfire, untouched. A golden trophy materializes from the undisturbed air. The words 'UNTOUCHABLE' ignite in molten gold lettering. Ghostlike, perfect, lethal. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Omega Pinball (`omega-pinball`)
Route: `/omega-pinball` · PvP: planned (2–4 players)

### `omega-pinball-silver-ball` — Silver Ball
- **Description:** Score 100,000 points in a single game.
- **Trigger (detectable):** Game score ≥ 100,000.
- **Video:** `/videos/achievements/omega-pinball-silver-ball.mp4`
- **Prompt:** Cinematic trophy reveal — a colossal pinball machine, the chrome ball screaming through bumpers in electric-blue flashes. A golden trophy materializes from the score reel's blaze. The words 'SILVER BALL' ignite in molten gold lettering. Electric, chaotic, thrilling. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `omega-pinball-multiball-master` — Multiball Master
- **Description:** Trigger multiball 3 times in one game.
- **Trigger (detectable):** Multiball triggers ≥ 3 in one game.
- **Video:** `/videos/achievements/omega-pinball-multiball-master.mp4`
- **Prompt:** Cinematic trophy reveal — three chrome balls in chaotic orbit, lights strobing, the machine shaking. A golden trophy materializes from the multiball storm. The words 'MULTIBALL MASTER' ignite in molten gold lettering. Wild, overloaded, glorious. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `omega-pinball-grand-champion` — Grand Champion
- **Description:** Take the #1 spot on the leaderboard.
- **Trigger (detectable):** Leaderboard rank = 1.
- **Video:** `/videos/achievements/omega-pinball-grand-champion.mp4`
- **Prompt:** Cinematic trophy reveal — the machine's crown display flashing the top score, confetti of sparks. A golden trophy materializes atop the backglass. The words 'GRAND CHAMPION' ignite in molten gold lettering. Immortal, arcade-royal, best. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Starblood (`starblood`)
Route: `/starblood` · PvP: planned (2–4 players)

### `starblood-first-pair` — First Pair
- **Description:** Match your first rune pair.
- **Trigger (detectable):** Pairs matched ≥ 1.
- **Video:** `/videos/achievements/starblood-first-pair.mp4`
- **Prompt:** Cinematic trophy reveal — a dark void of floating rune cards, two crimson runes locking together with a pulse. A golden trophy materializes from the paired light. The words 'FIRST PAIR' ignite in molten gold lettering. Mystic, focused, awakening. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `starblood-clear-board` — Clear Board
- **Description:** Clear all 20 rune cards.
- **Trigger (detectable):** Board fully cleared (game won).
- **Video:** `/videos/achievements/starblood-clear-board.mp4`
- **Prompt:** Cinematic trophy reveal — all twenty cards face-up in a perfect ring, runes blazing. A golden trophy materializes at the ring's center. The words 'CLEAR BOARD' ignite in molten gold lettering. Complete, radiant, masterful. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `starblood-perfect-recall` — Perfect Recall
- **Description:** Clear the board in 12 moves or fewer.
- **Trigger (detectable):** Game won with moves ≤ 12.
- **Video:** `/videos/achievements/starblood-perfect-recall.mp4`
- **Prompt:** Cinematic trophy reveal — the cards flipping in a flawless twelve-move cascade, each pair snapping home. A golden trophy materializes from the final pair's flash. The words 'PERFECT RECALL' ignite in molten gold lettering. Surgical, brilliant, photographic. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Astra (`astra`)
Route: `/astra` · PvP: planned (2–4 players)

### `astra-first-kill` — First Kill
- **Description:** Destroy your first drone.
- **Trigger (detectable):** Drones destroyed ≥ 1.
- **Video:** `/videos/achievements/astra-first-kill.mp4`
- **Prompt:** Cinematic trophy reveal — the cockpit canopy framing deep space, the first drone bursting into debris. A golden trophy materializes from the expanding wreckage. The words 'FIRST KILL' ignite in molten gold lettering. Cold, precise, initiated. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `astra-ace` — Ace
- **Description:** Destroy 50 drones in a single patrol run.
- **Trigger (detectable):** Kills ≥ 50 in one run.
- **Video:** `/videos/achievements/astra-ace.mp4`
- **Prompt:** Cinematic trophy reveal — fifty drone kills painting the void with fire, the patrol ship weaving through it all. A golden trophy materializes from the fiftieth explosion. The words 'ACE' ignite in molten gold lettering. Lethal, storied, unmatched. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `astra-iron-hull` — Iron Hull
- **Description:** Complete a full patrol run without losing your ship.
- **Trigger (detectable):** Run completed with deaths = 0.
- **Video:** `/videos/achievements/astra-iron-hull.mp4`
- **Prompt:** Cinematic trophy reveal — the ship gliding home through a debris field, hull pristine and gleaming. A golden trophy materializes from the ship's running lights. The words 'IRON HULL' ignite in molten gold lettering. Steadfast, unbreakable, home. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Zeus Protocol (`zeus-protocol`)
Route: `/zeus-protocol` · PvP: planned (2–8 players)

### `zeus-protocol-first-strike` — First Strike
- **Description:** Destroy your first enemy fighter.
- **Trigger (detectable):** Kills ≥ 1.
- **Video:** `/videos/achievements/zeus-protocol-first-strike.mp4`
- **Prompt:** Cinematic trophy reveal — a lone interceptor diving through a fighter screen, the first kill blooming. A golden trophy materializes from the fireball. The words 'FIRST STRIKE' ignite in molten gold lettering. Bold, fast, committed. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `zeus-protocol-wave-breaker` — Wave Breaker
- **Description:** Survive to wave 10.
- **Trigger (detectable):** Wave number ≥ 10 reached.
- **Video:** `/videos/achievements/zeus-protocol-wave-breaker.mp4`
- **Prompt:** Cinematic trophy reveal — wave after wave breaking against the player's guns, the tenth wave shattering. A golden trophy materializes from the wreckage field. The words 'WAVE BREAKER' ignite in molten gold lettering. Defiant, enduring, iron. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `zeus-protocol-god-of-thunder` — God of Thunder
- **Description:** Clear the campaign on the hardest difficulty.
- **Trigger (detectable):** Hardest difficulty cleared.
- **Video:** `/videos/achievements/zeus-protocol-god-of-thunder.mp4`
- **Prompt:** Cinematic trophy reveal — the final assault on the hardest front, lightning raking the void. A golden trophy materializes, struck by a bolt and crackling. The words 'GOD OF THUNDER' ignite in molten gold lettering. Wrathful, divine, ultimate. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Neon Racer (`neon-racer`)
Route: `/neon-racer` · PvP: planned (2–8 players)

### `neon-racer-first-flight` — First Flight
- **Description:** Survive your first full 90-second mission.
- **Trigger (detectable):** Mission timer reaches 90s (survived).
- **Video:** `/videos/achievements/neon-racer-first-flight.mp4`
- **Prompt:** Cinematic trophy reveal — a deep-space race tunnel, the ship surviving the full 90-second gauntlet. A golden trophy materializes from the finish gate's light. The words 'FIRST FLIGHT' ignite in molten gold lettering. Fast, alive, through. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `neon-racer-wormrider` — Wormrider
- **Description:** Thread 5 wormhole rings in a single run.
- **Trigger (detectable):** Wormhole rings ≥ 5 in one run.
- **Video:** `/videos/achievements/neon-racer-wormrider.mp4`
- **Prompt:** Cinematic trophy reveal — the ship threading five wormhole rings, reality bending around each. A golden trophy materializes emerging through the fifth ring. The words 'WORMRIDER' ignite in molten gold lettering. Warped, daring, beyond. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `neon-racer-star-surfer` — Star Surfer
- **Description:** Collect 100 star shards in a single run.
- **Trigger (detectable):** Star shards ≥ 100 in one run.
- **Video:** `/videos/achievements/neon-racer-star-surfer.mp4`
- **Prompt:** Cinematic trophy reveal — a river of one hundred star shards streaming into the ship's wake. A golden trophy materializes from the shard-storm. The words 'STAR SURFER' ignite in molten gold lettering. Greedy, glittering, rich. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Excalibur (`excalibur`)
Route: `/excalibur` · PvP: planned (2 players)

### `excalibur-worthy` — Worthy
- **Description:** Win your first duel.
- **Trigger (detectable):** Duel result = win.
- **Video:** `/videos/achievements/excalibur-worthy.mp4`
- **Prompt:** Cinematic trophy reveal — a misty stone circle at dawn, two duelists, the victor's blade catching first light. A golden trophy materializes from the parting mist. The words 'WORTHY' ignite in molten gold lettering. Noble, quiet, proven. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `excalibur-stone-shaker` — Stone Shaker
- **Description:** Draw the sword fully from the stone.
- **Trigger (detectable):** Sword extraction = 100%.
- **Video:** `/videos/achievements/excalibur-stone-shaker.mp4`
- **Prompt:** Cinematic trophy reveal — the ancient stone splitting with light as the sword slides free. A golden trophy materializes from the stone's radiant cracks. The words 'STONE SHAKER' ignite in molten gold lettering. Mythic, destined, earth-shaking. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `excalibur-high-king` — High King
- **Description:** Win 5 duels in a row.
- **Trigger (detectable):** Consecutive duel wins = 5.
- **Video:** `/videos/achievements/excalibur-high-king.mp4`
- **Prompt:** Cinematic trophy reveal — the crowned champion before five fallen challengers' banners, the sword raised. A golden trophy materializes from the dawn breaking over the stones. The words 'HIGH KING' ignite in molten gold lettering. Regal, undefeated, crowned. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Zeus v Hades (`zeus-v-hades`)
Route: `/zeus-v-hades` · PvP: planned (2 players)

### `zeus-v-hades-first-soul` — First Soul
- **Description:** Collect your first soul.
- **Trigger (detectable):** Souls ≥ 1.
- **Video:** `/videos/achievements/zeus-v-hades-first-soul.mp4`
- **Prompt:** Cinematic trophy reveal — the neon track split between Olympian gold and underworld blue, the first soul wisp captured. A golden trophy materializes from the soul's glow. The words 'FIRST SOUL' ignite in molten gold lettering. Haunting, bright, claimed. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `zeus-v-hades-soul-surge` — Soul Surge
- **Description:** Charge and unleash a full lightning boost.
- **Trigger (detectable):** Lightning boost activated at full charge.
- **Video:** `/videos/achievements/zeus-v-hades-soul-surge.mp4`
- **Prompt:** Cinematic trophy reveal — lightning coiling around the racer as the boost hits full charge. A golden trophy materializes from the lightning's heart. The words 'SOUL SURGE' ignite in molten gold lettering. Charged, violent, divine. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `zeus-v-hades-godslayer` — Godslayer
- **Description:** Beat Hades to the finish line.
- **Trigger (detectable):** Race result = win vs Hades.
- **Video:** `/videos/achievements/zeus-v-hades-godslayer.mp4`
- **Prompt:** Cinematic trophy reveal — the finish line ahead, Hades' chariot falling behind in blue flame. A golden trophy materializes from the gold light swallowing the dark. The words 'GODSLAYER' ignite in molten gold lettering. Defiant, triumphant, immortal. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Guillotine (`guillotine`)
Route: `/guillotine` · PvP: planned (2–4 players)

### `guillotine-first-drop` — First Drop
- **Description:** Complete your first blade drop.
- **Trigger (detectable):** Drop sequence completed.
- **Video:** `/videos/achievements/guillotine-first-drop.mp4`
- **Prompt:** Cinematic trophy reveal — the ancient machine in a moonlit chamber, the blade completing its first fall. A golden trophy materializes from the settling dust. The words 'FIRST DROP' ignite in molten gold lettering. Heavy, final, historic. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `guillotine-dead-center` — Dead Center
- **Description:** Land a perfect-center drop.
- **Trigger (detectable):** Drop accuracy = perfect.
- **Video:** `/videos/achievements/guillotine-dead-center.mp4`
- **Prompt:** Cinematic trophy reveal — the blade frozen a hair above dead center in slow motion, a single moonbeam on the mark. A golden trophy materializes on the exact center point. The words 'DEAD CENTER' ignite in molten gold lettering. Surgical, chilling, exact. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `guillotine-master-executioner` — Master Executioner
- **Description:** Land 3 perfect drops in a row.
- **Trigger (detectable):** Consecutive perfect drops = 3.
- **Video:** `/videos/achievements/guillotine-master-executioner.mp4`
- **Prompt:** Cinematic trophy reveal — three perfect drops in sequence, the machine almost reverent. A golden trophy materializes from the triple flash. The words 'MASTER EXECUTIONER' ignite in molten gold lettering. Inevitable, precise, feared. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Arachnid Weaver (`arachnid-weaver`)
Route: `/arachnid-weaver` · PvP: planned (2–4 players)

### `arachnid-weaver-first-night` — First Night
- **Description:** Survive 60 seconds in the Weaver's nest.
- **Trigger (detectable):** Survival time ≥ 60s.
- **Video:** `/videos/achievements/arachnid-weaver-first-night.mp4`
- **Prompt:** Cinematic trophy reveal — the moonlit nest, the torch-bearer still running after sixty seconds, webs glistening. A golden trophy materializes from the torch flame. The words 'FIRST NIGHT' ignite in molten gold lettering. Tense, hunted, alive. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `arachnid-weaver-web-dodger` — Web Dodger
- **Description:** Escape 5 web traps in a single run.
- **Trigger (detectable):** Trap escapes ≥ 5 in one run.
- **Video:** `/videos/achievements/arachnid-weaver-web-dodger.mp4`
- **Prompt:** Cinematic trophy reveal — the runner slipping a fifth web trap, silk strands snapping harmlessly. A golden trophy materializes from the torn webbing. The words 'WEB DODGER' ignite in molten gold lettering. Quick, slippery, defiant. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `arachnid-weaver-dawn-bringer` — Dawn Bringer
- **Description:** Survive the full night and see dawn.
- **Trigger (detectable):** Full-duration survival completed.
- **Video:** `/videos/achievements/arachnid-weaver-dawn-bringer.mp4`
- **Prompt:** Cinematic trophy reveal — first light piercing the nest canopy as the survivor stands tall. A golden trophy materializes from the sunrise. The words 'DAWN BRINGER' ignite in molten gold lettering. Enduring, hopeful, reborn. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Hawkins: Hunt For Vecna (`hawkins`)
Route: `/hawkins` · PvP: planned (2–4 players)

### `hawkins-first-clue` — First Clue
- **Description:** Find your first clue in the hunt.
- **Trigger (detectable):** Clues found ≥ 1.
- **Video:** `/videos/achievements/hawkins-first-clue.mp4`
- **Prompt:** Cinematic trophy reveal — a flashlight beam finding the first clue in the dark woods, Christmas lights flickering. A golden trophy materializes from the light's pool. The words 'FIRST CLUE' ignite in molten gold lettering. Eerie, curious, brave. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `hawkins-party-up` — Party Up
- **Description:** Complete a hunt alongside other players.
- **Trigger (detectable):** Multiplayer/co-op hunt completed.
- **Video:** `/videos/achievements/hawkins-party-up.mp4`
- **Prompt:** Cinematic trophy reveal — the whole party together, flashlights crossing over the hunt's trail. A golden trophy materializes from the crossing beams. The words 'PARTY UP' ignite in molten gold lettering. Loyal, united, stronger. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `hawkins-gatekeeper` — Gatekeeper
- **Description:** Seal the gate in the final hunt chapter.
- **Trigger (detectable):** Final hunt chapter completed.
- **Video:** `/videos/achievements/hawkins-gatekeeper.mp4`
- **Prompt:** Cinematic trophy reveal — the gate sealing shut in a storm of ash and spores, the town safe. A golden trophy materializes from the closing rift. The words 'GATEKEEPER' ignite in molten gold lettering. Heroic, final, sealing. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## DK Hero (`dk-hero`)
Route: `/dk-hero` · PvP: planned (2 players)

### `dk-hero-top-of-the-tower` — Top of the Tower
- **Description:** Climb to the ship and clear the first level.
- **Trigger (detectable):** Level 1 completed.
- **Video:** `/videos/achievements/dk-hero-top-of-the-tower.mp4`
- **Prompt:** Cinematic trophy reveal — the pixel construction site at 8-bit sunset, the hero grabbing the ship at the top. A golden trophy materializes in a burst of pixels. The words 'TOP OF THE TOWER' ignite in molten gold lettering. Retro, joyful, climbed. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `dk-hero-barrel-dodger` — Barrel Dodger
- **Description:** Clear a level without taking a single hit.
- **Trigger (detectable):** Level completed with hits = 0.
- **Video:** `/videos/achievements/dk-hero-barrel-dodger.mp4`
- **Prompt:** Cinematic trophy reveal — barrels rolling past harmlessly as the hero climbs untouched. A golden trophy materializes from a smashed barrel. The words 'BARREL DODGER' ignite in molten gold lettering. Slick, untouched, classic. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `dk-hero-siege-breaker` — Siege Breaker
- **Description:** Clear every level of the siege.
- **Trigger (detectable):** Final level completed.
- **Video:** `/videos/achievements/dk-hero-siege-breaker.mp4`
- **Prompt:** Cinematic trophy reveal — the final level cleared, the whole tower cheering in chiptune light. A golden trophy materializes from the victory fanfare's fireworks. The words 'SIEGE BREAKER' ignite in molten gold lettering. Triumphant, 8-bit, complete. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Ice Dragon (`ice-dragon`)
Route: `/ice-dragon` · PvP: planned (2 players)

### `ice-dragon-first-wake` — First Wake
- **Description:** Wake the dragon to full wakefulness.
- **Trigger (detectable):** Wake meter reaches 100%.
- **Video:** `/videos/achievements/ice-dragon-first-wake.mp4`
- **Prompt:** Cinematic trophy reveal — the glacial dragon's eye opening under the aurora, ice groaning awake. A golden trophy materializes from the dragon's first breath-frost. The words 'FIRST WAKE' ignite in molten gold lettering. Ancient, vast, stirring. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `ice-dragon-sky-rider` — Sky Rider
- **Description:** Complete a full flight loop around the glacier.
- **Trigger (detectable):** Flight loop completed.
- **Video:** `/videos/achievements/ice-dragon-sky-rider.mp4`
- **Prompt:** Cinematic trophy reveal — the dragon completing its loop around the glacier, wings eclipsing the moon. A golden trophy materializes from the aurora's ribbons. The words 'SKY RIDER' ignite in molten gold lettering. Majestic, free, soaring. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `ice-dragon-glacier-king` — Glacier King
- **Description:** Complete 5 full flight loops in one session.
- **Trigger (detectable):** Flight loops ≥ 5 in one session.
- **Video:** `/videos/achievements/ice-dragon-glacier-king.mp4`
- **Prompt:** Cinematic trophy reveal — five loops carved in the sky, the dragon sovereign over endless ice. A golden trophy materializes from the fifth loop's trail. The words 'GLACIER KING' ignite in molten gold lettering. Sovereign, eternal, ice-crowned. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Ice Monster (`ice-monster`)
Route: `/ice-monster` · PvP: planned (2 players)

### `ice-monster-first-blood` — First Blood
- **Description:** Land your first hit on the monster.
- **Trigger (detectable):** Damage dealt > 0.
- **Video:** `/videos/achievements/ice-monster-first-blood.mp4`
- **Prompt:** Cinematic trophy reveal — the cavern dark, the monster's glowing eyes, the first strike landing. A golden trophy materializes from the impact's ice-shatter. The words 'FIRST BLOOD' ignite in molten gold lettering. Bold, cold, begun. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `ice-monster-monster-slayer` — Monster Slayer
- **Description:** Defeat the ice monster.
- **Trigger (detectable):** Boss defeated.
- **Video:** `/videos/achievements/ice-monster-monster-slayer.mp4`
- **Prompt:** Cinematic trophy reveal — the beast collapsing in an avalanche of crystals. A golden trophy materializes from the settling frost. The words 'MONSTER SLAYER' ignite in molten gold lettering. Fierce, final, victorious. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `ice-monster-flawless-hunt` — Flawless Hunt
- **Description:** Defeat the monster without taking damage.
- **Trigger (detectable):** Boss defeated with damage taken = 0.
- **Video:** `/videos/achievements/ice-monster-flawless-hunt.mp4`
- **Prompt:** Cinematic trophy reveal — the hunter untouched, the monster defeated without laying a claw. A golden trophy materializes from pristine, unbroken ice. The words 'FLAWLESS HUNT' ignite in molten gold lettering. Perfect, fearless, clean. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Rogers Arena (`rogers-arena`)
Route: `/rogers-arena` · PvP: planned (2–8 players)

### `rogers-arena-first-show` — First Show
- **Description:** Attend your first Concert Night.
- **Trigger (detectable):** Concert Night mode completed.
- **Video:** `/videos/achievements/rogers-arena-first-show.mp4`
- **Prompt:** Cinematic trophy reveal — the arena blacked out, then spotlights sweeping pink and cyan over the roaring crowd. A golden trophy materializes on the spotlight beam. The words 'FIRST SHOW' ignite in molten gold lettering. Loud, bright, alive. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `rogers-arena-hat-trick` — Hat Trick
- **Description:** Score 3 goals in a single Game Night.
- **Trigger (detectable):** Goals ≥ 3 in one Game Night.
- **Video:** `/videos/achievements/rogers-arena-hat-trick.mp4`
- **Prompt:** Cinematic trophy reveal — three pucks in the net, hats raining onto the ice. A golden trophy materializes from the hat-storm. The words 'HAT TRICK' ignite in molten gold lettering. Electric, classic, raining. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `rogers-arena-game-night-mvp` — Game Night MVP
- **Description:** Win a Game Night match.
- **Trigger (detectable):** Game Night result = win.
- **Video:** `/videos/achievements/rogers-arena-game-night-mvp.mp4`
- **Prompt:** Cinematic trophy reveal — the final buzzer, the arena shaking, the MVP raised up. A golden trophy materializes from the championship glare. The words 'GAME NIGHT MVP' ignite in molten gold lettering. Clutch, roaring, best. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Hive (`hive`)
Route: `/hive` · PvP: planned (2–6 players)

### `hive-first-pulse` — First Pulse
- **Description:** Send your first pulse through the hive.
- **Trigger (detectable):** Pulses sent ≥ 1.
- **Video:** `/videos/achievements/hive-first-pulse.mp4`
- **Prompt:** Cinematic trophy reveal — the vast hex hive glowing amber, the first pulse racing through the channels. A golden trophy materializes where the pulse lands. The words 'FIRST PULSE' ignite in molten gold lettering. Curious, glowing, connected. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `hive-hive-mind` — Hive Mind
- **Description:** Fill the hive-mind meter to 100%.
- **Trigger (detectable):** Hive-mind meter = 100%.
- **Video:** `/videos/achievements/hive-hive-mind.mp4`
- **Prompt:** Cinematic trophy reveal — the hive-mind meter full, every cell blazing in unison. A golden trophy materializes at the hive's radiant heart. The words 'HIVE MIND' ignite in molten gold lettering. Unified, humming, one. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `hive-perfect-harmony` — Perfect Harmony
- **Description:** Solve a hive puzzle with the optimal move count.
- **Trigger (detectable):** Puzzle solved with moves = optimal.
- **Video:** `/videos/achievements/hive-perfect-harmony.mp4`
- **Prompt:** Cinematic trophy reveal — the puzzle solved in the exact optimal moves, pulses flowing like music. A golden trophy materializes from the final perfect pulse. The words 'PERFECT HARMONY' ignite in molten gold lettering. Elegant, exact, resonant. Ultra-detailed, cinematic 4K, seamless 8-second loop.

## Orbital Ascent (`orbital-ascent`)
Route: `/orbital-ascent` · PvP: planned (2–4 players)

### `orbital-ascent-first-boost` — First Boost
- **Description:** Land your first perfectly-timed jump boost.
- **Trigger (detectable):** Boosted jumps ≥ 1.
- **Video:** `/videos/achievements/orbital-ascent-first-boost.mp4`
- **Prompt:** Cinematic trophy reveal — the tower of platforms rising into the stratosphere, the ball catching its first perfect boost. A golden trophy materializes from the boost's shockwave. The words 'FIRST BOOST' ignite in molten gold lettering. Light, rising, timed. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `orbital-ascent-high-flyer` — High Flyer
- **Description:** Reach level 50 of the ascent.
- **Trigger (detectable):** Level ≥ 50.
- **Video:** `/videos/achievements/orbital-ascent-high-flyer.mp4`
- **Prompt:** Cinematic trophy reveal — level fifty, clouds far below, the ball still climbing. A golden trophy materializes from the thin-air sunlight. The words 'HIGH FLYER' ignite in molten gold lettering. Airy, determined, halfway. Ultra-detailed, cinematic 4K, seamless 8-second loop.

### `orbital-ascent-summit` — Summit
- **Description:** Reach level 99 — the top of the tower.
- **Trigger (detectable):** Level = 99.
- **Video:** `/videos/achievements/orbital-ascent-summit.mp4`
- **Prompt:** Cinematic trophy reveal — level ninety-nine, the summit platform bathed in full sun above the world. A golden trophy materializes at the very top. The words 'SUMMIT' ignite in molten gold lettering. Exalted, complete, highest. Ultra-detailed, cinematic 4K, seamless 8-second loop.
