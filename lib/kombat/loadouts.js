// lib/kombat/loadouts.js
//
// GENERATED FILE — do not edit by hand. Regenerate with:
//   python3 ~/workspace/tripo-figures/build_kombat_loadouts.py \
//     --repo <fresh export of this repo>
//
// The Kombat data bridge (wiring plan Step 1): one record per
// roster fighter joining the game data (lib/kombat/roster.js —
// powers/fatality parity is asserted at generation time) with
// Merlin's character accuracy record (character_loadouts.json:
// weapon/tool, dual-wield, motion class, movement style, rig
// class) and the Tripo sprint's live availability.
//
// Availability semantics:
//   available — the sprint has completed this fighter's model
//     (run_state.json workflow_status == "complete" at generation
//     time; kombat_character_map.json's generated flags are stale
//     and are never consulted).
//   preview — the repo-hosted preview PNG (/characters/<id>.png)
//     once the fighter is published in lib/characters/roster.js;
//     null until then (a fighter can be available before its
//     preview is published).
//   glbUrl — the public Supabase Storage URL of the fighter's
//     optimized GLB (wiring plan Steps 3–4: 100K tris, 1024px
//     WebP, meshopt; ~1 MB), set only when the file was uploaded
//     to the fighter-models bucket and verified live (HEAD 200 +
//     glTF magic) at generation time; null otherwise.
//
// Availability snapshot: 43 of 43 fighters generated, 43 previews published, 43 GLBs hosted.
// run_state.json updated_at at generation: 2026-10-14T08:30:11.722265+00:00

export const LOADOUTS = [
  {
    "kombatId": "freddy-krueger",
    "characterId": "q001-freddy-krueger",
    "name": "Freddy Krueger",
    "queueNumber": 1,
    "available": true,
    "preview": "/characters/q001-freddy-krueger.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q001-freddy-krueger.glb",
    "powers": [
      "Dream Slash",
      "Boiler Room Trap",
      "Never Sleep",
      "Claw Uppercut",
      "Dream Walk"
    ],
    "fatality": "Welcome to My Nightmare",
    "weapon": {
      "name": "Bladed claw glove (steel gauntlet, four knife blades)",
      "hand": "right hand",
      "carry": "worn on the right hand"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Theatrical prowl: predatory hunch, weight swaying side to side, claw raised and fingers wiggling in taunt.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "jason-voorhees",
    "characterId": "q002-jason-voorhees",
    "name": "Jason Voorhees",
    "queueNumber": 2,
    "available": true,
    "preview": "/characters/q002-jason-voorhees.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q002-jason-voorhees.glb",
    "powers": [
      "Campfire Chop",
      "Unstoppable Advance",
      "Lake Grab",
      "Machete Throw",
      "Undying"
    ],
    "fatality": "Camp Crystal Slam",
    "weapon": {
      "name": "Machete (scarred, blood-darkened)",
      "hand": "right hand",
      "carry": "gripped in one massive hand, arm loose at his side"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Slow relentless stalk: inevitable forward lean, head tilted as if listening, no wasted motion — walks the opponent down like weather.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "michael-myers",
    "characterId": "q003-michael-myers",
    "name": "Michael Myers",
    "queueNumber": 3,
    "available": true,
    "preview": "/characters/q003-michael-myers.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q003-michael-myers.glb",
    "powers": [
      "Shape Stab",
      "Silent Stalk",
      "Throat Display",
      "Head Tilt",
      "Halloween Rush"
    ],
    "fatality": "The Shape Remains",
    "weapon": {
      "name": "Kitchen knife (large, well-worn)",
      "hand": "right hand",
      "carry": "held low and loose in the right hand"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Metronomic menace: feet planted, chest barely rising, head tilted a few degrees; glides rather than strides, never hurries.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "leatherface",
    "characterId": "q004-leatherface",
    "name": "Leatherface",
    "queueNumber": 4,
    "available": true,
    "preview": "/characters/q004-leatherface.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q004-leatherface.glb",
    "powers": [
      "Saw Storm",
      "Meat Hook Slam",
      "Butcher Rush",
      "Rev and Feint",
      "Saw Toss"
    ],
    "fatality": "Family Dinner",
    "weapon": {
      "name": "Chainsaw (long scarred bar, orange)",
      "hand": "both hands",
      "carry": "gripped two-handed, revving in short bursts"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Frantic twitchy energy: bounces on the balls of his feet, swings the saw in wild figure-eights, barely contained.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "pennywise",
    "characterId": "q005-pennywise",
    "name": "Pennywise",
    "queueNumber": 5,
    "available": true,
    "preview": "/characters/q005-pennywise.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q005-pennywise.glb",
    "powers": [
      "Deadlights Gaze",
      "Balloon Pop",
      "Dancing Clown Rush",
      "Sewer Grasp",
      "You'll Float Too"
    ],
    "fatality": "You'll Float Too",
    "weapon": {
      "name": "Razor-claw gloves",
      "hand": "both hands",
      "carry": "oversized white gloves tipped with razor claws on both hands"
    },
    "dualWield": true,
    "motionClass": "humanoid",
    "movementStyle": "Gliding, wrong-jointed locomotion: joints bend too far, head snaps sideways; shadow stretches too long behind him.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "ghostface",
    "characterId": "q006-ghostface",
    "name": "Ghostface",
    "queueNumber": 6,
    "available": true,
    "preview": "/characters/q006-ghostface.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q006-ghostface.glb",
    "powers": [
      "Stab Combo",
      "Prank Call",
      "Scream Dash",
      "Voicemail Trap",
      "Double Team"
    ],
    "fatality": "What's Your Favorite Scary Movie?",
    "weapon": {
      "name": "Hunting knife (gleaming)",
      "hand": "right hand",
      "carry": "flashes from the robe's sleeve into the hand"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Jittery theatrical movement: sudden lunges, robe flaring on pivots, head tilting in mock curiosity; coiled and impatient.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "chucky",
    "characterId": "q007-chucky",
    "name": "Chucky",
    "queueNumber": 7,
    "available": true,
    "preview": "/characters/q007-chucky.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q007-chucky.glb",
    "powers": [
      "Doll Dash",
      "Knife Tantrum",
      "Voodoo Chant",
      "Play Dead",
      "Battery Toss"
    ],
    "fatality": "Playtime's Over",
    "weapon": {
      "name": "Kitchen knife (nearly as long as he is tall)",
      "hand": "both hands (single knife)",
      "carry": "gripped in both hands or dragged behind him"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Feral doll sprint: low crouch on stubby legs, head twitching, bouncing foot to foot, cackling.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "pinhead",
    "characterId": "q008-pinhead",
    "name": "Pinhead",
    "queueNumber": 8,
    "available": true,
    "preview": "/characters/q008-pinhead.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q008-pinhead.glb",
    "powers": [
      "Chain Snare",
      "Lament Configuration",
      "Cenobite Judgment",
      "We Have Such Sights",
      "Nail Storm"
    ],
    "fatality": "Such Sights To Show You",
    "weapon": {
      "name": "Lament Configuration puzzle box + hooked chains",
      "hand": "both hands / ambient",
      "carry": "box held in hands; hooked chains dangle from sleeves and the air around him"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Glacial, deliberate grace: perfectly upright, hands clasped or spread in benediction; every gesture a ritual.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "candyman",
    "characterId": "q009-candyman",
    "name": "Candyman",
    "queueNumber": 9,
    "available": true,
    "preview": "/characters/q009-candyman.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q009-candyman.glb",
    "powers": [
      "Hook Sweep",
      "Swarm Command",
      "Say My Name",
      "Throat of Bees",
      "Hook Impale"
    ],
    "fatality": "Say It Five Times",
    "weapon": {
      "name": "Rusted hook",
      "hand": "right hand",
      "carry": "the hook REPLACES the right hand"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Mournful, unhurried dignity: deliberate steps, hook raised in slow arcs, head high.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "samara-morgan",
    "characterId": "q010-samara-morgan",
    "name": "Samara Morgan",
    "queueNumber": 10,
    "available": true,
    "preview": "/characters/q010-samara-morgan.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q010-samara-morgan.glb",
    "powers": [
      "Static Crawl",
      "Hair Lash",
      "Seven Days",
      "Well Drop",
      "Cursed Gaze"
    ],
    "fatality": "Seven Days",
    "weapon": null,
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Stuttering, frame-skipping movement: still one moment, suddenly closer the next, like a corrupted video feed; twitching crouch, head cocked at a broken angle, spider-fast arm whips.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "xenomorph",
    "characterId": "q011-xenomorph",
    "name": "Xenomorph",
    "queueNumber": 11,
    "available": true,
    "preview": "/characters/q011-xenomorph.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q011-xenomorph.glb",
    "powers": [
      "Tail Spear",
      "Inner Jaw",
      "Acid Spit",
      "Pounce",
      "Facehugger Toss"
    ],
    "fatality": "Perfect Organism",
    "weapon": {
      "name": "Natural armament: inner jaw, bladed tail, claws",
      "hand": "body",
      "carry": "inner piston jaw in the mouth, barbed tail, clawed hands and feet"
    },
    "dualWield": false,
    "motionClass": "creature",
    "movementStyle": "Insectile skitter: freezes utterly still, then explodes into motion; predatory digitigrade crouch, tail coiling and uncoiling.",
    "rigClass": "creature",
    "powersPadSides": 6
  },
  {
    "kombatId": "predator",
    "characterId": "q012-predator",
    "name": "Predator",
    "queueNumber": 12,
    "available": true,
    "preview": "/characters/q012-predator.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q012-predator.glb",
    "powers": [
      "Plasma Caster",
      "Wrist Blades",
      "Cloak Ambush",
      "Net Launcher",
      "Combistick Throw"
    ],
    "fatality": "Trophy Taken",
    "weapon": {
      "name": "Wrist blades + shoulder plasma caster + combistick",
      "hand": "both wrists / left shoulder",
      "carry": "retractable twin blades in the wrist gauntlets, plasma caster mounted on one shoulder, combistick carried"
    },
    "dualWield": true,
    "motionClass": "humanoid",
    "movementStyle": "Hunter's crouch: weight forward, utterly still between bursts of terrifying speed, mandibles clicking behind the mask.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "darth-vader",
    "characterId": "q013-darth-vader",
    "name": "Darth Vader",
    "queueNumber": 13,
    "available": true,
    "preview": "/characters/q013-darth-vader.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q013-darth-vader.glb",
    "powers": [
      "Force Choke",
      "Saber Throw",
      "Force Crush",
      "Dark Rage",
      "I Find Your Lack of Defense"
    ],
    "fatality": "I Am Your Father",
    "weapon": {
      "name": "Lightsaber (red blade)",
      "hand": "both hands",
      "carry": "two-handed duelist's grip; hilt at belt when idle"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Slow inexorable menace: fortress posture, shoulders square, saber angled across the body, cape stirring; each step punctuated by mechanical breathing.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "luke-skywalker",
    "characterId": "q014-luke-skywalker",
    "name": "Luke Skywalker",
    "queueNumber": 14,
    "available": true,
    "preview": "/characters/q014-luke-skywalker.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q014-luke-skywalker.glb",
    "powers": [
      "Saber Flurry",
      "Force Push",
      "Jedi Mind Trick",
      "Skywalker Leap",
      "Deflect"
    ],
    "fatality": "A New Hope",
    "weapon": {
      "name": "Lightsaber (blue blade)",
      "hand": "both hands",
      "carry": "relaxed two-handed guard; hilt hung on belt"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Acrobatic flowing grace: lightsaber forms blended with Force leaps, feet light, always balanced and moving.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "yoda",
    "characterId": "q015-yoda",
    "name": "Yoda",
    "queueNumber": 15,
    "available": true,
    "preview": "/characters/q015-yoda.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q015-yoda.glb",
    "powers": [
      "Ataru Whirlwind",
      "Force Lift",
      "Size Matters Not",
      "Saber Boomerang",
      "900 Years of Wisdom"
    ],
    "fatality": "Do Or Do Not",
    "weapon": {
      "name": "Lightsaber (short green blade) + gnarled walking cane",
      "hand": "both hands (saber) / hand (cane)",
      "carry": "cane leaned on at rest and tossed aside in combat; short saber for the whirlwind"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Two-speed movement: cane-supported shuffle and mischievous calm at rest; in combat a whirling green blur ricocheting off walls and ceiling.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "emperor-palpatine",
    "characterId": "q016-emperor-palpatine",
    "name": "Emperor Palpatine",
    "queueNumber": 16,
    "available": true,
    "preview": "/characters/q016-emperor-palpatine.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q016-emperor-palpatine.glb",
    "powers": [
      "Force Lightning",
      "Lightning Web",
      "UNLIMITED POWER",
      "Dark Tempest",
      "Cackle"
    ],
    "fatality": "Unlimited Power",
    "weapon": null,
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Barely walks — he glides: coiled gleeful hunch, sleeves trailing, fingers splayed and twitching, every movement economical and venomous.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "t-800",
    "characterId": "q017-t-800-terminator",
    "name": "T-800 Terminator",
    "queueNumber": 17,
    "available": true,
    "preview": "/characters/q017-t-800-terminator.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q017-t-800-terminator.glb",
    "powers": [
      "Minigun Sweep",
      "Endoskeleton Punch",
      "Target Lock",
      "I'll Be Back",
      "Shotgun Blast"
    ],
    "fatality": "Terminated",
    "weapon": {
      "name": "Lever-action shotgun (or minigun)",
      "hand": "both hands",
      "carry": "carried with casual mechanical ease"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Machine economy: feet planted wide, head scanning with tiny servo jerks, precise linear advance, utterly without flourish.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "t-1000",
    "characterId": "q018-t-1000",
    "name": "T-1000",
    "queueNumber": 18,
    "available": true,
    "preview": "/characters/q018-t-1000.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q018-t-1000.glb",
    "powers": [
      "Blade Arm",
      "Liquid Reform",
      "Hook Sweep",
      "Mimic Strike",
      "Mercury Spike"
    ],
    "fatality": "Liquid Termination",
    "weapon": {
      "name": "Liquid-metal blade arms / hooks (morphic)",
      "hand": "both arms",
      "carry": "his own arms ripple and reform into blades and hooks"
    },
    "dualWield": true,
    "motionClass": "humanoid",
    "movementStyle": "Eerie identical stride: silent, smooth, each step the same, head tilting with insectile curiosity; melts to liquid and reforms for transitions.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "ellen-ripley",
    "characterId": "q019-ellen-ripley",
    "name": "Ellen Ripley",
    "queueNumber": 19,
    "available": true,
    "preview": "/characters/q019-ellen-ripley.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q019-ellen-ripley.glb",
    "powers": [
      "Pulse Rifle Burst",
      "Flamethrower Sweep",
      "Grenade Launcher",
      "Get Away From Her",
      "Motion Tracker"
    ],
    "fatality": "Game Over, Man",
    "weapon": {
      "name": "Pulse rifle (underslung flamethrower + grenade launcher)",
      "hand": "both hands",
      "carry": "shouldered, strapped across the chest; motion tracker worn on the wrist"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Pure infantry: knees bent, rifle shouldered, sweeping the room in short disciplined arcs.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "neo",
    "characterId": "q020-neo",
    "name": "Neo",
    "queueNumber": 20,
    "available": true,
    "preview": "/characters/q020-neo.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q020-neo.glb",
    "powers": [
      "Bullet-Time Dodge",
      "Agent Barrage",
      "Code Sight",
      "There Is No Spoon",
      "One-Inch Punch"
    ],
    "fatality": "Free Your Mind",
    "weapon": null,
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Serene half-speed grace: stillness of a man who sees the code; dodges bend backward at impossible angles, coat flaring.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "t-rex",
    "characterId": "q021-t-rex",
    "name": "T-Rex",
    "queueNumber": 21,
    "available": true,
    "preview": "/characters/q021-t-rex.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q021-t-rex.glb",
    "powers": [
      "Bone-Crunch Bite",
      "Tail Sweep",
      "Stomp Quake",
      "Primal Roar",
      "Death Roll"
    ],
    "fatality": "Apex Predator",
    "weapon": {
      "name": "Natural armament: serrated jaws, tail, talons",
      "hand": "body",
      "carry": "banana-sized serrated teeth, wrecking-ball tail, taloned feet"
    },
    "dualWield": false,
    "motionClass": "creature",
    "movementStyle": "Seismic bipedal stomp: hunched forward, tail swinging for balance, each step a THOOM; jaws slightly agape, fixed predatory focus.",
    "rigClass": "creature",
    "powersPadSides": 6
  },
  {
    "kombatId": "raptor-swift",
    "characterId": "q022-swift-raptor",
    "name": "Swift",
    "queueNumber": 22,
    "available": true,
    "preview": "/characters/q022-swift-raptor.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q022-swift-raptor.glb",
    "powers": [
      "Sickle Slash",
      "Pack Feint",
      "Clever Girl",
      "Raptor Rush",
      "Pack Call"
    ],
    "fatality": "Clever Girl",
    "weapon": {
      "name": "Natural armament: sickle claws (both hind feet) + jaws",
      "hand": "body",
      "carry": "curved killing claw on each foot"
    },
    "dualWield": false,
    "motionClass": "creature",
    "movementStyle": "Constant twitchy motion: feinting, circling, head bobbing in a coiled runner's crouch; tail stiff behind, explodes in any direction.",
    "rigClass": "creature",
    "powersPadSides": 6
  },
  {
    "kombatId": "raptor-claw",
    "characterId": "q023-claw-raptor",
    "name": "Claw",
    "queueNumber": 23,
    "available": true,
    "preview": "/characters/q023-claw-raptor.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q023-claw-raptor.glb",
    "powers": [
      "Double Talon Drop",
      "Pounce Grapple",
      "Tail Whip",
      "Alpha Snarl",
      "Pack Call"
    ],
    "fatality": "Raptor Ballet",
    "weapon": {
      "name": "Natural armament: oversized sickle claws (both hind feet) + jaws",
      "hand": "body",
      "carry": "chipped oversized killing claws on both feet"
    },
    "dualWield": false,
    "motionClass": "creature",
    "movementStyle": "Deliberate heavy prowl: low wrestler's crouch, wide and grounded, tail lashing, jaw working.",
    "rigClass": "creature",
    "powersPadSides": 6
  },
  {
    "kombatId": "raptor-fang",
    "characterId": "q024-fang-raptor",
    "name": "Fang",
    "queueNumber": 24,
    "available": true,
    "preview": "/characters/q024-fang-raptor.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q024-fang-raptor.glb",
    "powers": [
      "Latch Bite",
      "Ankle Biter",
      "Death Shake",
      "Scurry",
      "Pack Call"
    ],
    "fatality": "Shake And Bake",
    "weapon": {
      "name": "Natural armament: oversized jaw and teeth + sickle claws",
      "hand": "body",
      "carry": "latching jaw, sickle claw on each foot"
    },
    "dualWield": false,
    "motionClass": "creature",
    "movementStyle": "Frantic scrambling bursts: jittery sideways skitter, head low and weaving, darts in low, snaps, rolls away.",
    "rigClass": "creature",
    "powersPadSides": 6
  },
  {
    "kombatId": "peter-venkman",
    "characterId": "q025-peter-venkman",
    "name": "Peter Venkman",
    "queueNumber": 25,
    "available": true,
    "preview": "/characters/q025-peter-venkman.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q025-peter-venkman.glb",
    "powers": [
      "Proton Stream",
      "Wise Crack",
      "Trap Toss",
      "Cross The Streams",
      "Dodge The Invoice"
    ],
    "fatality": "We Came, We Saw, We Kicked Its...",
    "weapon": {
      "name": "Proton pack + neutrino wand (+ ghost trap)",
      "hand": "right hand (wand, one-handed)",
      "carry": "pack worn on the back; wand gripped one-handed like a TV remote, fired from the hip; trap slid by hand"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Wisecracking slouch: loose and cocky, weight on one leg, wand twirling, ducking behind cover between quips.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "ray-stantz",
    "characterId": "q026-ray-stantz",
    "name": "Ray Stantz",
    "queueNumber": 26,
    "available": true,
    "preview": "/characters/q026-ray-stantz.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q026-ray-stantz.glb",
    "powers": [
      "Enthusiast Beam",
      "Scoleri Slam",
      "Stay Puft Memory",
      "Ecto Grenade",
      "Childhood Dream"
    ],
    "fatality": "I Tried To Think...",
    "weapon": {
      "name": "Proton pack + neutrino wand (+ ghost trap / ecto grenades)",
      "hand": "both hands (wand)",
      "carry": "pack worn with pride on the back; wand gripped two-handed, braced like a firefighter's hose"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Enthusiastic and planted: feet wide, leaning into the stream, grinning through the chaos.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "egon-spengler",
    "characterId": "q027-egon-spengler",
    "name": "Egon Spengler",
    "queueNumber": 27,
    "available": true,
    "preview": "/characters/q027-egon-spengler.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q027-egon-spengler.glb",
    "powers": [
      "Calculated Stream",
      "PKE Surge",
      "Hypothesis: Pain",
      "Print Is Dead",
      "Do Not Cross"
    ],
    "fatality": "Peer Reviewed",
    "weapon": {
      "name": "Proton pack (modified) + neutrino wand (+ PKE-style devices)",
      "hand": "one hand (wand, precision grip)",
      "carry": "pack on the back modified with extra dials, antennae and readouts; wand aimed like a surveyor's instrument"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Upright and analytical: wand raised precisely, head tilted, observing the opponent like a mold sample; takes readings mid-combat.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "winston-zeddemore",
    "characterId": "q028-winston-zeddemore",
    "name": "Winston Zeddemore",
    "queueNumber": 28,
    "available": true,
    "preview": "/characters/q028-winston-zeddemore.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q028-winston-zeddemore.glb",
    "powers": [
      "Steady Stream",
      "If There's Something Strange",
      "Trap Expert",
      "Overtime Shift",
      "Neighborhood Watch"
    ],
    "fatality": "I Love This Town",
    "weapon": {
      "name": "Proton pack + neutrino wand (+ ghost traps)",
      "hand": "hands (wand, disciplined grip)",
      "carry": "pack worn like he was born with it; wand swept in disciplined arcs"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Balanced athletic ready: knees bent, wand up, eyes tracking — the steady professional anchor.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "slimer",
    "characterId": "q029-slimer",
    "name": "Slimer",
    "queueNumber": 29,
    "available": true,
    "preview": "/characters/q029-slimer.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q029-slimer.glb",
    "powers": [
      "Slime Barrage",
      "Ectoplasm Engulf",
      "Greedy Dash",
      "Slime Trail",
      "Snack Break"
    ],
    "fatality": "He Slimed Me",
    "weapon": null,
    "dualWield": false,
    "motionClass": "floater",
    "movementStyle": "Hovers and bounces: a wobbling bob, mouth opening impossibly wide, arms windmilling; leaves a glistening slime trail. NO ground gait — he floats.",
    "rigClass": "none",
    "powersPadSides": 6
  },
  {
    "kombatId": "stay-puft",
    "characterId": "q030-stay-puft",
    "name": "Stay Puft Marshmallow Man",
    "queueNumber": 30,
    "available": true,
    "preview": "/characters/q030-stay-puft.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q030-stay-puft.glb",
    "powers": [
      "Marshmallow Stomp",
      "S'more Slam",
      "Goo Lob",
      "Jolly Grin",
      "Puft Quake"
    ],
    "fatality": "Nobody Steps On A Church...",
    "weapon": null,
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Slow jolly menace: sailor's rolling gait, arms slightly out for balance, seismic squish footsteps, smile never wavers.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "bugs-bunny",
    "characterId": "q031-bugs-bunny",
    "name": "Bugs Bunny",
    "queueNumber": 31,
    "available": true,
    "preview": "/characters/q031-bugs-bunny.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q031-bugs-bunny.glb",
    "powers": [
      "Anvil Drop",
      "Disguise Artist",
      "Carrot Chomp",
      "Left Turn At Albuquerque",
      "Acme Arsenal",
      "What's Up, Doc?"
    ],
    "fatality": "That's All, Folks!",
    "weapon": {
      "name": "Acme arsenal (anvil, dynamite, spring-loaded boxing glove) + carrot prop",
      "hand": "either hand",
      "carry": "gadgets pulled from hammerspace; carrot munched like a cigar"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Vaudevillian saunter: leans casually against thin air, hip cocked, impossible cartoon physics, loose showman gestures.",
    "rigClass": "humanoid",
    "powersPadSides": 7
  },
  {
    "kombatId": "tasmanian-devil",
    "characterId": "q032-tasmanian-devil",
    "name": "Tasmanian Devil",
    "queueNumber": 32,
    "available": true,
    "preview": "/characters/q032-tasmanian-devil.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q032-tasmanian-devil.glb",
    "powers": [
      "Tornado Spin",
      "Chomp Frenzy",
      "Dust Devil Dash",
      "Taz Hunger",
      "Whirling Dervish"
    ],
    "fatality": "Taz-Style Dining",
    "weapon": {
      "name": "Natural armament: huge jaw and teeth",
      "hand": "body",
      "carry": "massive toothed jaw"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Travels as a spinning dust-devil tornado chewing through scenery; at rest a hunched drooling crouch, eyes swirling, one second from becoming weather again.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "hulk",
    "characterId": "q033-hulk",
    "name": "Hulk",
    "queueNumber": 33,
    "available": true,
    "preview": "/characters/q033-hulk.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q033-hulk.glb",
    "powers": [
      "Thunderclap",
      "Gamma Smash",
      "Hulk Angry",
      "Car Throw",
      "Seismic Stomp"
    ],
    "fatality": "Hulk Smash",
    "weapon": null,
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Knuckle-dragging crouch: arms hanging huge, head lowered and glaring up; every step cracks the floor; leaping bounds.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "deadpool",
    "characterId": "q034-deadpool",
    "name": "Deadpool",
    "queueNumber": 34,
    "available": true,
    "preview": "/characters/q034-deadpool.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q034-deadpool.glb",
    "powers": [
      "Katana Ballet",
      "Fourth Wall Break",
      "Chimichanga Toss",
      "Regeneration",
      "Maximum Effort",
      "Teleport Malfunction"
    ],
    "fatality": "Maximum Effort",
    "weapon": {
      "name": "Twin katanas + dual pistols",
      "hand": "one katana per hand",
      "carry": "katanas crossed in sheaths on his back; pistols holstered at the belt among bandoliers and pouches"
    },
    "dualWield": true,
    "motionClass": "humanoid",
    "movementStyle": "Loose bouncy boxer's shuffle: spinning show-off flourishes, finger guns, dramatic poses mid-combo, constant gesturing at an audience that isn't there.",
    "rigClass": "humanoid",
    "powersPadSides": 7
  },
  {
    "kombatId": "wolverine",
    "characterId": "q035-wolverine",
    "name": "Wolverine",
    "queueNumber": 35,
    "available": true,
    "preview": "/characters/q035-wolverine.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q035-wolverine.glb",
    "powers": [
      "Berserker Barrage",
      "Adamantium Lunge",
      "SNIKT Counter",
      "Healing Factor",
      "Claw Cyclone"
    ],
    "fatality": "I'm The Best There Is",
    "weapon": {
      "name": "Adamantium claws (three per fist)",
      "hand": "both fists",
      "carry": "retractable claws housed in both forearms, SNIKT out of each fist"
    },
    "dualWield": true,
    "motionClass": "humanoid",
    "movementStyle": "Low animal crouch: claws up, head down, circling with economical predatory movement, punctuated by explosive berserker lunges.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "thanos",
    "characterId": "q036-thanos",
    "name": "Thanos",
    "queueNumber": 36,
    "available": true,
    "preview": "/characters/q036-thanos.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q036-thanos.glb",
    "powers": [
      "Power Stone Slam",
      "Reality Warp",
      "Time Stone Rewind",
      "Space Stone Pull",
      "Titan Backhand"
    ],
    "fatality": "Perfectly Balanced",
    "weapon": {
      "name": "Infinity Gauntlet (six Infinity Stones)",
      "hand": "left hand",
      "carry": "worn on the LEFT hand (roster states it explicitly), stones winking with cosmic power"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Upright and regal: contemptuous economy, gauntlet held slightly forward, backhand swipes that level buildings.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "iron-man",
    "characterId": "q037-iron-man",
    "name": "Iron Man",
    "queueNumber": 37,
    "available": true,
    "preview": "/characters/q037-iron-man.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q037-iron-man.glb",
    "powers": [
      "Repulsor Blast",
      "Unibeam",
      "Hulkbuster Protocol",
      "Smart Micro-Missiles",
      "JARVIS Counter"
    ],
    "fatality": "I Am Iron Man",
    "weapon": {
      "name": "Twin palm repulsors (+ chest unibeam, shoulder micro-missiles)",
      "hand": "both palms",
      "carry": "repulsor discs built into both palms; arc reactor in the chest"
    },
    "dualWield": true,
    "motionClass": "humanoid",
    "movementStyle": "Hovers more than he stands: boot thrusters flaring, floating fists-forward guard, dramatic poses out of pure habit. (Humanoid rig; hover/flight is the movement profile.)",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "cloud-strife",
    "characterId": "q038-cloud-strife",
    "name": "Cloud Strife",
    "queueNumber": 38,
    "available": true,
    "preview": "/characters/q038-cloud-strife.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q038-cloud-strife.glb",
    "powers": [
      "Braver",
      "Cross Slash",
      "Blade Beam",
      "Omnislash",
      "Climhazzard"
    ],
    "fatality": "Omnislash Ver. 5",
    "weapon": {
      "name": "Buster Sword",
      "hand": "both hands",
      "carry": "huge slab sword carried on his back, wielded two-handed in huge arcs"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Acrobatic limit-break fury: low sword-dragging readiness, blade tip scraping the floor, then suddenly airborne for diving slashes.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "sephiroth",
    "characterId": "q039-sephiroth",
    "name": "Sephiroth",
    "queueNumber": 39,
    "available": true,
    "preview": "/characters/q039-sephiroth.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q039-sephiroth.glb",
    "powers": [
      "Masamune Arc",
      "Octaslash",
      "Supernova",
      "Shadow Flare",
      "Scintilla"
    ],
    "fatality": "One-Winged Angel",
    "weapon": {
      "name": "Masamune (seven-foot nodachi)",
      "hand": "left hand (canonical; roster says one-handed)",
      "carry": "held one-handed with contemptuous ease, trailing low"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Languid glide: barely moves, each step deliberate, sword trailing, head tilted with cold amusement — the posture of a god indulging insects.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "tifa-lockhart",
    "characterId": "q040-tifa-lockhart",
    "name": "Tifa Lockhart",
    "queueNumber": 40,
    "available": true,
    "preview": "/characters/q040-tifa-lockhart.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q040-tifa-lockhart.glb",
    "powers": [
      "Beat Rush",
      "Somersault",
      "Dolphin Blow",
      "Final Heaven",
      "Starshower"
    ],
    "fatality": "Final Heaven",
    "weapon": {
      "name": "Fighting gloves (red)",
      "hand": "both hands",
      "carry": "gloves worn on both fists — her fists ARE the weapons"
    },
    "dualWield": true,
    "motionClass": "humanoid",
    "movementStyle": "Pure boxer: bounces lightly on the balls of her feet, gloves high, chin down, rhythmic dance-like footwork.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "bob-blob",
    "characterId": "q041-b-o-b",
    "name": "B.O.B.",
    "queueNumber": 41,
    "available": true,
    "preview": "/characters/q041-b-o-b.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q041-b-o-b.glb",
    "powers": [
      "Goo Slam",
      "Absorb",
      "Blob Split",
      "Wobble Dodge",
      "Snack Attack"
    ],
    "fatality": "Brain? What Brain?",
    "weapon": null,
    "dualWield": false,
    "motionClass": "other",
    "movementStyle": "Amorphous ooze locomotion: flows, bounces and splats, reforming around obstacles; eye and grin drift independently inside the mass. NO rig by design (wobble mesh) — movement is squash-and-stretch, never skeletal.",
    "rigClass": "none",
    "powersPadSides": 6
  },
  {
    "kombatId": "missing-link",
    "characterId": "q042-the-missing-link",
    "name": "The Missing Link",
    "queueNumber": 42,
    "available": true,
    "preview": "/characters/q042-the-missing-link.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q042-the-missing-link.glb",
    "powers": [
      "Fish-Ape Fury",
      "Commando Roll",
      "Tidal Throw",
      "Link Leap",
      "Macho Taunt"
    ],
    "fatality": "20,000 Years Of Cool",
    "weapon": null,
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Macho swaggering athleticism: chest out, arms swinging, commando rolls and judo throws; cocky bouncing fighter's crouch. (Fish-ape body on a humanoid rig per manifest; webbed hands/feet and finned crest carry the creature read.)",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  {
    "kombatId": "dr-cockroach",
    "characterId": "q043-dr-cockroach",
    "name": "Dr. Cockroach",
    "queueNumber": 43,
    "available": true,
    "preview": "/characters/q043-dr-cockroach.png",
    "glbUrl": "https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models/q043-dr-cockroach.glb",
    "powers": [
      "Doomsday Ray",
      "Cockroach Swarm",
      "Eureka Grenade",
      "Exoskeleton",
      "Antenna Zapper"
    ],
    "fatality": "For Science!",
    "weapon": {
      "name": "Doomsday ray gun (jury-rigged) + gadgets",
      "hand": "two of his six hands",
      "carry": "ray gun held in two hands while the other limbs mix beakers and wind gadgets"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Jittery caffeinated skitter: hunched multi-armed inventor's crouch, six limbs doing six things, darting with manic energy.",
    "rigClass": "humanoid",
    "powersPadSides": 6
  },
  // ==== HAWKINS + OPERATIVES APPENDIX (hand-measured, 2026-10-22) ====
  // The 16 fighters above the original 43 were rigged by Merlin in
  // Tripo Studio (not the foundry sprint), so they are appended here
  // in the generated format rather than regenerated: powers/fatality
  // mirror lib/kombat/roster.js exactly, rig data is measured from
  // the shipped GLBs in lib/kombat/rig-manifest.js, and the models
  // are served locally from public/models/kombat/ because uploads to
  // the 'fighter-models' bucket are blocked (connector 401). The
  // Studio exports carry NO materials/textures — `tint` is the flat
  // color the loader re-skins them with (lib/kombat/glb-fighter.js).
  {
    "kombatId": "eddie-munson",
    "characterId": "q044-eddie-munson",
    "name": "Eddie Munson",
    "queueNumber": 44,
    "available": true,
    "preview": null,
    "glbUrl": "/models/kombat/eddie-munson.glb",
    "powers": [
      "Master of Puppets",
      "Hellfire Swing",
      "D&D Gambit",
      "Stage Dive",
      "Corroded Coffin"
    ],
    "fatality": "The Most Metal Ever",
    "weapon": {
      "name": "Spiked baseball bat",
      "hand": "right hand",
      "carry": "slung low like a guitar neck, swung two-handed for the big finishes"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Quick, theatrical and taunting — he showboats between exchanges, bouncing and grinning, flourishing the bat like a guitar, then explodes into the swing.",
    "rigClass": "humanoid",
    "tint": "#7a4a2b",
    "powersPadSides": 6
  },
  {
    "kombatId": "eleven",
    "characterId": "q045-eleven",
    "name": "Eleven",
    "queueNumber": 45,
    "available": true,
    "preview": null,
    "glbUrl": "/models/kombat/eleven.glb",
    "powers": [
      "Telekinesis Slam",
      "Nosebleed Nova",
      "Mind Reach",
      "Psychic Wall",
      "Sensory Void"
    ],
    "fatality": "The Void",
    "weapon": null,
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Moves like a held breath — long eerie stillness and total calm, then a single step, a raised hand, and the world moves instead of her.",
    "rigClass": "humanoid",
    "tint": "#b98a94",
    "powersPadSides": 6
  },
  {
    "kombatId": "jim-hopper",
    "characterId": "q046-jim-hopper",
    "name": "Jim Hopper",
    "queueNumber": 46,
    "available": true,
    "preview": null,
    "glbUrl": "/models/kombat/jim-hopper.glb",
    "powers": [
      "Sheriff's Haymaker",
      "Cabin Charge",
      "Coffee and Contemplation",
      "Shotgun Diplomacy",
      "Protective Grab"
    ],
    "fatality": "Don't Touch My Kid",
    "weapon": {
      "name": "Pump shotgun",
      "hand": "both hands",
      "carry": "comes up only when talking has officially failed"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Measured strides and economical violence — a tired professional who walks through trouble like weather, plants his feet, and throws punches with the whole county behind them.",
    "rigClass": "humanoid",
    "tint": "#8a6d3f",
    "powersPadSides": 6
  },
  {
    "kombatId": "vecna",
    "characterId": "q047-vecna",
    "name": "Vecna",
    "queueNumber": 47,
    "available": true,
    "preview": null,
    "glbUrl": "/models/kombat/vecna.glb",
    "powers": [
      "Curse of Vecna",
      "Tendril Lash",
      "Grandfather Clock",
      "Levitate and Break",
      "Mind Lair"
    ],
    "fatality": "Run Up That Hill",
    "weapon": null,
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Glacial and deliberate, he drifts through ash like a tolling bell — ritual slowness, infinite patience, then his wrath arrives all at once.",
    "rigClass": "humanoid",
    "tint": "#7d4b3a",
    "powersPadSides": 6
  },
  {
    "kombatId": "demogorgon",
    "characterId": "q048-demogorgon",
    "name": "Demogorgon",
    "queueNumber": 48,
    "available": true,
    "preview": null,
    "glbUrl": "/models/kombat/demogorgon.glb",
    "powers": [
      "Petal Maw",
      "Upside Down Pounce",
      "Scent of Blood",
      "Tulip Snap",
      "Wall Between Worlds"
    ],
    "fatality": "Flower of Death",
    "weapon": null,
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "A feral prowl — sway-backed, light-fingered, head tilting at sounds no one else hears — that explodes into terrifying motion without warning.",
    "rigClass": "humanoid",
    "tint": "#6b5d4f",
    "powersPadSides": 6
  },
  {
    "kombatId": "demobats",
    "characterId": "q049-demobats",
    "name": "Demobats",
    "queueNumber": 49,
    "available": true,
    "preview": null,
    "glbUrl": "/models/kombat/demobats.glb",
    "powers": [
      "Swarm Descent",
      "A Thousand Wings",
      "Sonic Shriek",
      "Carry Off",
      "Blackout Sky"
    ],
    "fatality": "The Sky Goes Dark",
    "weapon": null,
    "dualWield": false,
    "motionClass": "other",
    "movementStyle": "Frantic and twitchy — a thousand wings of pure chaos that never stop moving, shrieking, swirling, then descending all at once.",
    "rigClass": "creature",
    "tint": "#3d4451",
    "powersPadSides": 6
  },
  {
    "kombatId": "mind-flayer",
    "characterId": "q050-mind-flayer",
    "name": "Mind Flayer",
    "queueNumber": 50,
    "available": true,
    "preview": null,
    "glbUrl": "/models/kombat/mind-flayer.glb",
    "powers": [
      "Shadow Tendril",
      "Storm of the Mind",
      "Possession",
      "Particulates",
      "The Hive Speaks"
    ],
    "fatality": "Become the Storm",
    "weapon": null,
    "dualWield": false,
    "motionClass": "other",
    "movementStyle": "Glacial drift on sweeping tendrils — a storm that hovers, patient and vast, unrolling a hundred arms of shadow at once.",
    "rigClass": "creature",
    "tint": "#4b3a63",
    "powersPadSides": 6
  },
  {
    "kombatId": "mind-flayer-hybrid",
    "characterId": "q051-mind-flayer-hybrid",
    "name": "Mind Flayer Hybrid",
    "queueNumber": 51,
    "available": true,
    "preview": null,
    "glbUrl": "/models/kombat/mind-flayer-hybrid.glb",
    "powers": [
      "Red Tendril",
      "Faster Than Father",
      "Aura of Dread",
      "Hive Fang",
      "Storm Cell"
    ],
    "fatality": "The Heir",
    "weapon": null,
    "dualWield": false,
    "motionClass": "other",
    "movementStyle": "Relentless and feral, he drifts in red-lit patience — then lunges, faster than his father ever moved, all appetite and storm.",
    "rigClass": "creature",
    "tint": "#7a3550",
    "powersPadSides": 6
  },
  {
    "kombatId": "bounty-hunter",
    "characterId": "q052-bounty-hunter",
    "name": "Bounty Hunter",
    "queueNumber": 52,
    "available": true,
    "preview": null,
    "glbUrl": "/models/kombat/bounty-hunter.glb",
    "powers": [
      "Dead or Alive",
      "Wrist Launcher",
      "Jet Boots",
      "Contract Marked",
      "No Disintegrations"
    ],
    "fatality": "The Contract",
    "weapon": {
      "name": "Blaster carbine",
      "hand": "right hand",
      "carry": "worn like he was born with it; a wrist rocket and jet boots ride along"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Military precision and gunslinger patience — economical strides, nothing wasted, tracking his mark like a debt coming due.",
    "rigClass": "humanoid",
    "tint": "#9a5a2e",
    "powersPadSides": 6
  },
  {
    "kombatId": "cybernetic-soldier",
    "characterId": "q053-cybernetic-soldier",
    "name": "Cybernetic Soldier",
    "queueNumber": 53,
    "available": true,
    "preview": null,
    "glbUrl": "/models/kombat/cybernetic-soldier.glb",
    "powers": [
      "Hydraulic Fist",
      "Targeting Array",
      "Servo Slam",
      "Patch Protocol",
      "Overclock"
    ],
    "fatality": "Factory Reset",
    "weapon": {
      "name": "Integral arm cannon",
      "hand": "right arm",
      "carry": "built into the rebuilt arm; the hydraulic fist is the backup argument"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Metronomic machine strides — calm, measured, mechanical; a firing platform that walks, turns machined to the degree, utterly without panic.",
    "rigClass": "humanoid",
    "tint": "#3f5a5e",
    "powersPadSides": 6
  },
  {
    "kombatId": "cyberpunk-operative",
    "characterId": "q054-cyberpunk-operative",
    "name": "Cyberpunk Operative",
    "queueNumber": 54,
    "available": true,
    "preview": null,
    "glbUrl": "/models/kombat/cyberpunk-operative.glb",
    "powers": [
      "Monowire",
      "Neon Ricochet",
      "Chrome Rush",
      "Signal Jam",
      "Overdrive Kick"
    ],
    "fatality": "Ghost in the Wire",
    "weapon": {
      "name": "Monowire whip",
      "hand": "right wrist",
      "carry": "coils at her wrist like a sleeping pet, hair-thin and final"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Fast, acrobatic and whirling, she ricochets around the arena trailing neon afterimages — never where the last frame left her.",
    "rigClass": "humanoid",
    "tint": "#8e3a6e",
    "powersPadSides": 6
  },
  {
    "kombatId": "futuristic-female-operative",
    "characterId": "q055-futuristic-female-operative",
    "name": "Futuristic Female Operative",
    "queueNumber": 55,
    "available": true,
    "preview": null,
    "glbUrl": "/models/kombat/futuristic-female-operative.glb",
    "powers": [
      "Pulse Sidearm",
      "Aerial Ballet",
      "Hardlight Snare",
      "Vector Dash",
      "Starfall Kick"
    ],
    "fatality": "Orbital Grace",
    "weapon": {
      "name": "Pulse sidearm",
      "hand": "right hand",
      "carry": "holstered at the thigh; a hardlight ribbon coils from the other gauntlet"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Grace under zero-g — measured, gliding steps and aerial turns, landings without sound, every motion an economy.",
    "rigClass": "humanoid",
    "tint": "#7d7fa8",
    "powersPadSides": 6
  },
  {
    "kombatId": "post-apocalyptic",
    "characterId": "q056-post-apocalyptic",
    "name": "Post-Apocalyptic",
    "queueNumber": 56,
    "available": true,
    "preview": null,
    "glbUrl": "/models/kombat/post-apocalyptic.glb",
    "powers": [
      "Scrap Hammer",
      "Wasteland Rush",
      "Adrenal Howl",
      "Jury-Rigged Mine",
      "Bone Saw"
    ],
    "fatality": "Road Warrior's Rest",
    "weapon": {
      "name": "Scrap hammer",
      "hand": "right hand",
      "carry": "has fixed and broken everything he owns at least twice"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Barely-contained screaming fury in a brawler's crouch — relentless wasteland strides, swinging the hammer like it owes him rent.",
    "rigClass": "humanoid",
    "tint": "#6e6a45",
    "powersPadSides": 6
  },
  {
    "kombatId": "space-marine",
    "characterId": "q057-space-marine",
    "name": "Space Marine",
    "queueNumber": 57,
    "available": true,
    "preview": null,
    "glbUrl": "/models/kombat/space-marine.glb",
    "powers": [
      "Power Fist",
      "Bolter Burst",
      "Drop Pod Slam",
      "For the Emperor",
      "Chainsword Rev"
    ],
    "fatality": "Orbital Drop",
    "weapon": {
      "name": "Bolter rifle",
      "hand": "both hands",
      "carry": "engraved with oaths; a chainsword rides at the hip for close arguments"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Slow, deliberate ceremony — slow planet-heavy strides, metronomic and unstoppable, a siege engine with liturgy.",
    "rigClass": "humanoid",
    "tint": "#3a4f7d",
    "powersPadSides": 6
  },
  {
    "kombatId": "tactical-hitman",
    "characterId": "q058-tactical-hitman",
    "name": "Tactical Hitman",
    "queueNumber": 58,
    "available": true,
    "preview": null,
    "glbUrl": "/models/kombat/tactical-hitman.glb",
    "powers": [
      "Silverballers",
      "Garrote",
      "Professional's Patience",
      "Clean Shot",
      "Suit and Tie"
    ],
    "fatality": "The Signature",
    "weapon": {
      "name": "Silverballer pistol",
      "hand": "right hand",
      "carry": "appears exactly where the sentence needs it; the garrote is the other punctuation"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Calm, measured, professional — he barely moves at all, then is somewhere else; patience weaponized, one breath, one shot.",
    "rigClass": "humanoid",
    "tint": "#5e2f35",
    "powersPadSides": 6
  },
  {
    "kombatId": "tactical-soldier",
    "characterId": "q059-tactical-soldier",
    "name": "Tactical Soldier",
    "queueNumber": 59,
    "available": true,
    "preview": null,
    "glbUrl": "/models/kombat/tactical-soldier.glb",
    "powers": [
      "Burst Fire",
      "Breacher Charge",
      "Flashbang",
      "Combat Roll",
      "Suppressive Fire"
    ],
    "fatality": "Textbook",
    "weapon": {
      "name": "Assault rifle",
      "hand": "both hands",
      "carry": "carried at a perfect low-ready, kit squared away to the last strap"
    },
    "dualWield": false,
    "motionClass": "humanoid",
    "movementStyle": "Textbook military precision — crisp bursts of motion, angles cleared in order, the manual made flesh.",
    "rigClass": "humanoid",
    "tint": "#4d5e3a",
    "powersPadSides": 6
  }
];

export const LOADOUT_COUNT = LOADOUTS.length;

export const LOADOUT_BY_ID = new Map(
  LOADOUTS.map((l) => [l.kombatId, l]),
);

export function getLoadout(kombatId) {
  if (typeof kombatId !== 'string') return null;
  return LOADOUT_BY_ID.get(kombatId) || null;
}

export function hasLoadout(kombatId) {
  return typeof kombatId === 'string' && LOADOUT_BY_ID.has(kombatId);
}

// Shape law (controller design): a pad's polygon sides equal
// the number of controls it holds. The Powers pad carries every
// special plus the Fatality wedge, so its sides are powers + 1
// (record.powersPadSides). Names for the side counts pads use:
const PAD_SHAPE_NAMES = {
  3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon',
  7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon',
};

export function padShapeName(sides) {
  if (!Number.isInteger(sides)) return null;
  return PAD_SHAPE_NAMES[sides] || null;
}
