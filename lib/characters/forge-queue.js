// lib/characters/forge-queue.js
// THE CHARACTER FORGE QUEUE (Merlin, Nov 15 ~04:36, ORDERED).
//
// "Send all stand in characters that haven't been replaced by models
// yet into the character forge/builder... if the character forge
// hasn't been upgraded to meet the demand, then upgrade it first."
// Cerberus goes through first ("Cerberus stands at the gate of
// hades... he'll need to go through there too").
//
// THE FORGE, AS FOUND (check-first, Nov 15 ~04:40) — there are two
// things with similar names, and only one of them makes models:
//   1. World Engine "Character Builder" (app/world-engine/characters/
//      + components/world-engine/ForgeSector.jsx, SECTORS.characters):
//      prompt -> Gemini -> JSON parameters -> procedural 3D preview.
//      200 Aether per character, 20 free/month. Output is PARAMETERS,
//      not a GLB model. It cannot replace a stand-in with a model.
//   2. The Tripo sprint ("the Olympus 3D generator",
//      lib/characters/roster.js): the only path that produces real
//      rigged GLB models. 59 characters in the roster; 76 rigged GLBs
//      already staged in ~/workspace/character-batch-4/ (sorted Oct 26,
//      nothing wired). No generation tooling exists in the repo; the
//      Tripo connector doc is an unfilled template; generation happens
//      in Tripo Studio by hand, rig stage downloaded and joint-checked
//      per ~/workspace/custom-skills/tripo_rig_download_check/SKILL.md.
//
// THE UPGRADE (this file): the sprint never had a queue. Batches ran
// on ad-hoc dirs (~/workspace/character-batch-4/) with no
// prioritization, no status tracking, no per-entry spec, no cost
// accounting, no wiring step. This module is the queue: every audited
// stand-in kind as one entry with its generation prompt (or its
// existing model), its priority, its status, and its wiring target.
// NOTHING HERE GENERATES ANYTHING: this is data + pure helpers. No
// Tripo call, no credits spent, no money moved. Generation itself is
// a Tripo Studio step, gated on Merlin's top-up (see below).
//
// DEMAND vs CAPACITY (Nov 15 ~04:44, from the three code audits):
//   - 85 stand-in kinds audited across the platform.
//   - 68 queue entries (drift kinds collapse by kind-name: one Shade
//     job serves all 14 Shade realms with per-realm tints; the Damned
//     fold into Shade; the duel-foe folds into the duellist).
//   - 50 need NEW Tripo generation. 3 have a model on disk and need
//     wiring only. 12 have a staged file that is truncated and need a
//     Tripo re-send + re-optimize, not a new generation. 1 (Earth 4)
//     is procedural-by-design. 1 (petrified statue) is deferred.
//     1 (Persephone) is blocked — no design exists yet.
//   - Tripo balance: 10 credits, last verified Nov 14. The Tripo
//     brief estimates ~19 credits per character (~310 for 16). At
//     that rate 50 jobs need ~950 credits; even at 1 credit each, 50
//     > 10. NEW GENERATION IS BLOCKED ON A TOP-UP — Merlin's call.
//     The 3 wiring jobs and the 12 re-sends do not need new
//     generation; the re-sends' credit cost (if any) is unverified.
//
// SOURCES: the three audits (afterlife / ME+HE+Dutchman+hub /
// SW+Nexus+Earth+J2+Enyo), each entry citing its source file.
// Prompts for Medusa / Cerberus / Shades come from
// ~/workspace/your_files/character-data/medusa-run-characters.json;
// the rest are written from the auditors' code-grounded descriptions
// (sizes, colours, shapes as rendered today).
//
// IP NOTE: Star Wars ambient kinds are named film creatures already
// in code (app/star-wars/landmarks.js). Their queue entries record
// what the platform already renders; they carry ip_flag so Merlin
// decides before any generation. Nothing new is invented here.

/** Tripo balance, last verified Nov 14, 2026. Re-check in Studio before spending. */
export const TRIPO_CREDITS_BALANCE = 10;

/** Per-model credit estimate from the Tripo brief (~310 for 16 characters). ESTIMATE, not a verified price. */
export const TRIPO_CREDITS_PER_MODEL_ESTIMATE = 19;

/** Queue statuses. */
export const FORGE_STATUSES = [
  'queued-new', // needs a new Tripo generation
  'model-exists-wiring', // model on disk, needs wiring into the scene
  'model-exists-resend', // staged file truncated, needs Tripo re-send + re-optimize
  'procedural-by-design', // stays procedural (Earth 4 class entry)
  'deferred', // optional, not a living character (petrified statue)
  'blocked-needs-design', // no design exists yet (Persephone)
];

/**
 * One entry per forge job.
 *   id: stable slug. name: display name. world: realm/world.
 *   kind: 'drift' | 'figure' | 'creature' | 'boss' | 'statue' | 'class'.
 *   standIn: what renders today. source: code file (auditor-cited).
 *   prompt: Tripo generation prompt, or null when blocked/deferred.
 *   status: one of FORGE_STATUSES. priority: 1 = first (Cerberus, Merlin-ordered).
 *   existingModel: repo/batch path when a model already exists, else null.
 *   realms: for drift kinds, the realms one job serves.
 *   wiring: ready-to-apply wiring target (scene file + function), or null.
 *   ip_flag: set when the kind is licensed IP already in code.
 *   notes: anything the sprint runner needs to know.
 */
export const FORGE_QUEUE = [
  // ---- AFTERLIFE — named figures (Cerberus first, Merlin-ordered) ----
  {
    id: 'cerberus',
    name: 'Cerberus',
    world: 'Hades',
    kind: 'figure',
    standIn: 'Procedural build: box body 5x2.4x2 m, 4 box legs, 3 sphere heads on cylinder necks, red eyes #ff2a1a, box tail, red point light; heads top ~6.8 m.',
    source: 'app/nether-realm/world3d.js:233 Cerberus()',
    prompt: 'A colossal three-headed black hound standing guard at a stone gate, near-black rough hide, long rectangular body on four blocky legs, three long necks each topped with a skull-like head, six glowing red eyes facing the viewer, a straight tail, a red glow burning above it, yellow torchlight ringing the gate, dark fantasy game render.',
    status: 'queued-new',
    priority: 1,
    existingModel: null,
    wiring: 'app/nether-realm/world3d.js Cerberus() — swap the procedural build for the GLB, keep the gate position and red light.',
    notes: 'FIRST through the forge, Merlin-ordered. His arch/place stays untouched (arches order) — only the character goes through.',
  },
  {
    id: 'medusa',
    name: 'Medusa',
    world: 'Hades',
    kind: 'figure',
    standIn: 'Procedural build: torus serpent coil lower half, robe cylinder, 2 cylinder arms, sphere head r0.45 with green eyes, 7 agent-driven snakes; ~3.6 m tall, patrols 1.5 m/s.',
    source: 'app/nether-realm/world3d.js:946 MedusaFigure(); lib/nether-realm/medusa.js',
    prompt: 'Tall robed gorgon boss, about 3.5 metres, slender pale upper body in a long dark-green robe flaring to the floor, lower half a heavy dark-green serpent coil instead of legs, arms reaching forward, pale round face with two small glowing green eyes, hair of seven living snakes raised and swaying independently, green braziers and stone pillars behind, dark fantasy game render.',
    status: 'queued-new',
    priority: 2,
    existingModel: null,
    wiring: 'app/nether-realm/world3d.js MedusaFigure() — swap the procedural build for the GLB; keep the 7-snake motion agents driving the hair.',
  },
  {
    id: 'medusas-head',
    name: "Medusa's Head",
    world: 'Hades',
    kind: 'figure',
    standIn: 'Procedural viewmodel: pale sphere r0.22 + green eyes + 7 snakes at 0.55 scale, rides 0.8 m ahead of camera, first-person only.',
    source: 'app/nether-realm/world3d.js:1075 HeadViewModel()',
    prompt: 'First-person view of a pale severed gorgon head held out ahead, about 0.44 metres across, smooth bone-pale skin, two small glowing green eyes, hair of seven small living snakes raised and coiling, a faint translucent green cone of light flashing forward from its eyes, dark stone chamber behind, held weapon, dark fantasy game render.',
    status: 'queued-new',
    priority: 3,
    existingModel: null,
    wiring: 'app/nether-realm/world3d.js HeadViewModel() — swap the procedural head for the GLB; keep the 0.8 m ahead-of-camera ride and the gaze flash.',
    notes: 'Same character as Medusa, separate forge asset (held weapon, not the boss).',
  },
  {
    id: 'ghost-rider',
    name: 'The Ghost Rider',
    world: 'Ghost Rider realm',
    kind: 'figure',
    standIn: 'Procedural build: bone skull sphere r0.55, burning eye sockets #ff3d00, jaw box, leather torso cylinder, 7 torus chest-chain links, 4 flickering flame cones crowning the skull, fire light; ~4.5 m tall in a scorched circle r12.',
    source: 'app/ghost-rider/world3d.js:163 Rider()',
    prompt: 'A towering skeletal rider wreathed in fire, bone-white flaming skull with burning orange eye sockets, dark leather torso, a heavy chain of seven links across the chest, four tongues of flame crowning the skull, standing in a scorched black circle on a hell plain, embers drifting, dark fantasy game render.',
    status: 'queued-new',
    priority: 4,
    existingModel: null,
    wiring: 'app/ghost-rider/world3d.js Rider() — swap the procedural build for the GLB; keep the scorched circle and the chain.',
  },
  {
    id: 'apep',
    name: 'Apep',
    world: 'Duat',
    kind: 'creature',
    standIn: 'Procedural build: 9 dark-green sphere segments r2.2 on a r22 ring, head sphere r2.8 at y 5.5, gold eyes r0.35 #ffd34d, 5 torus coils.',
    source: 'app/duat/world3d.js:333 DarkWaters; lib/duat/world.js:274 apepCoils',
    prompt: 'A colossal dark-green serpent coiled in a ring on black water, nine heavy body segments, a huge head raised high with glowing gold eyes, coils of dark water and shadow around it, Egyptian underworld, dark fantasy game render.',
    status: 'queued-new',
    priority: 5,
    existingModel: null,
    wiring: 'app/duat/world3d.js DarkWaters — swap the sphere segments for the GLB; keep the r22 ring path.',
  },
  {
    id: 'faithful-dog',
    name: 'The Faithful Dog',
    world: 'Mictlan',
    kind: 'creature',
    standIn: 'Procedural build: grey #3a3a44 boxes, body 3.4x1.8x1.4, head box 1.4, cone ears; ~3.3 m long, ~4.1 m tall with ears.',
    source: 'app/mictlan/world3d.js:231 Dog()',
    prompt: 'A great grey stone-coloured hound sitting watchful on a river bank in the underworld, blocky faithful build, tall cone ears, calm amber eyes, mist and dark water behind, dark fantasy game render.',
    status: 'queued-new',
    priority: 6,
    existingModel: null,
    wiring: 'app/mictlan/world3d.js Dog() — swap the box build for the GLB; keep the river-bank position (14, 26).',
  },
  {
    id: 'charon',
    name: 'Charon',
    world: 'Hell',
    kind: 'figure',
    standIn: 'Label-only: no figure exists at all. Only a HUD button "Call Charon" and ferry notices.',
    source: 'lib/afterlife/ferry.js (pure fare/geometry law); app/hell/page.jsx:501',
    prompt: 'A gaunt hooded ferryman poling a small wooden boat across a dark river in hell, tattered dark robe, pale face half-hidden under the hood, a single lantern on the bow, souls waiting on the bank, embers in the air, dark fantasy game render.',
    status: 'queued-new',
    priority: 7,
    existingModel: null,
    wiring: 'lib/afterlife/ferry.js + app/hell/page.jsx — new figure; no mesh site exists yet, place at the ferry bank.',
    notes: 'No design existed in code; prompt is new, written for the queue. Merlin can rewrite it on his word.',
  },
  // ---- AFTERLIFE — drift kinds (one job serves every realm listed) ----
  {
    id: 'shade',
    name: 'Shade',
    world: 'Afterlife (14 realms)',
    kind: 'drift',
    standIn: 'Plain translucent cone [0.7, 2.4, 8], ~2.4 m tall at y 1.2; 18 copies per realm (8+6+4 across three discs); garments data-only labels.',
    source: 'app/nether-realm/world3d.js:390,421,468; lib/afterlife/humanoid-operators.js FIGURE_MATERIALS',
    prompt: 'A translucent drifting shroud in the shape of a plain cone, 2.4 metres tall, pale grey-white and semi-transparent, hovering just above dark ground and bobbing gently, no face, no limbs, no arms, faint and ghostly, in a dark underworld field with standing stones, dark fantasy game render.',
    status: 'queued-new',
    priority: 8,
    existingModel: null,
    realms: ['hades', 'helheim', 'yomi', 'annwn', 'duat', 'mictlan', 'xibalba', 'hell', 'naraka', 'diyu', 'kur', 'elysium', 'valhalla', 'aaru'],
    wiring: 'Each listed realm world3d.js cone blocks — swap cones for the GLB with per-realm tint from FIGURE_MATERIALS.',
    notes: 'One job serves 14 realms; per-realm tint only. The Ghost Rider Damned (8 cones, #cfcfe0) fold into this job as a tint variant.',
  },
  {
    id: 'blessed',
    name: 'Blessed',
    world: 'Heaven',
    kind: 'drift',
    standIn: 'Plain translucent cone [0.7, 2.4, 8]; #fffbe8, op .55/.7/.7; "white robe" data-only.',
    source: 'app/heaven/world3d.js:297,328,374',
    prompt: 'A radiant drifting figure in a plain white robe, 2.4 metres tall, warm pale gold-white and semi-transparent, hovering just above bright ground and bobbing gently, no face, serene and weightless, in a bright heavenly field, dark fantasy game render.',
    status: 'queued-new',
    priority: 9,
    existingModel: null,
    realms: ['heaven'],
    wiring: 'app/heaven/world3d.js cone blocks — swap cones for the GLB.',
  },
  {
    id: 'drifter',
    name: 'Drifter',
    world: 'Higher realms (4)',
    kind: 'drift',
    standIn: 'Plain translucent cone [0.7, 2.4, 8]; #ffffff op .6; "drifting robe" data-only.',
    source: 'app/tlalocan/world3d.js; app/maya-sky/world3d.js; app/vyraj/world3d.js; app/tiangong/world3d.js',
    prompt: 'A pale drifting figure in a long plain robe, 2.4 metres tall, white and semi-transparent, hovering just above the ground and bobbing gently, no face, calm and distant, in a bright high realm, dark fantasy game render.',
    status: 'queued-new',
    priority: 10,
    existingModel: null,
    realms: ['tlalocan', 'maya-sky', 'vyraj', 'tiangong'],
    wiring: 'Each listed realm world3d.js cone blocks — swap cones for the GLB.',
  },
  {
    id: 'wisp',
    name: 'Wisp',
    world: 'Nav',
    kind: 'drift',
    standIn: 'Plain translucent cone [0.7, 2.4, 8]; #9fd8b8 / #bfe8cc, op .5; "mist shroud" data-only.',
    source: 'app/nav/world3d.js',
    prompt: 'A soft green drifting wisp in the shape of a plain cone, 2.4 metres tall, pale mint-green and semi-transparent like mist, hovering just above dark ground and bobbing gently, no face, faint and quiet, in a misty underworld field, dark fantasy game render.',
    status: 'queued-new',
    priority: 11,
    existingModel: null,
    realms: ['nav'],
    wiring: 'app/nav/world3d.js cone blocks — swap cones for the GLB.',
  },
  {
    id: 'spirit',
    name: 'Spirit',
    world: 'Orun',
    kind: 'drift',
    standIn: 'Plain translucent cone [0.7, 2.4, 8]; #fff3d0 op .55; "white cloth" data-only.',
    source: 'app/orun/world3d.js',
    prompt: 'A warm drifting spirit in the shape of a plain cone, 2.4 metres tall, pale warm cream and semi-transparent like white cloth, hovering just above the ground and bobbing gently, no face, calm and bright, dark fantasy game render.',
    status: 'queued-new',
    priority: 12,
    existingModel: null,
    realms: ['orun'],
    wiring: 'app/orun/world3d.js cone blocks — swap cones for the GLB.',
  },
  {
    id: 'apsara',
    name: 'Apsara',
    world: 'Svarga',
    kind: 'drift',
    standIn: 'Plain translucent cone [0.7, 2.4, 8]; #fffbe8, op .55/.7/.7; "silk drape" data-only.',
    source: 'app/svarga/world3d.js',
    prompt: 'A graceful drifting celestial figure in a plain silk drape, 2.4 metres tall, warm pale gold-white and semi-transparent, hovering just above bright ground and bobbing gently, no face, serene, in a bright heavenly court, dark fantasy game render.',
    status: 'queued-new',
    priority: 13,
    existingModel: null,
    realms: ['svarga'],
    wiring: 'app/svarga/world3d.js cone blocks — swap cones for the GLB.',
  },
  {
    id: 'kami',
    name: 'Kami',
    world: 'Takamagahara',
    kind: 'drift',
    standIn: 'Plain translucent cone [0.7, 2.4, 8]; #fffbe8, op .55/.7/.7; "ceremonial robe" data-only.',
    source: 'app/takamagahara/world3d.js',
    prompt: 'A serene drifting spirit in a plain ceremonial robe, 2.4 metres tall, warm pale gold-white and semi-transparent, hovering just above bright ground and bobbing gently, no face, still and watchful, in a bright high shrine realm, dark fantasy game render.',
    status: 'queued-new',
    priority: 14,
    existingModel: null,
    realms: ['takamagahara'],
    wiring: 'app/takamagahara/world3d.js cone blocks — swap cones for the GLB.',
  },
  {
    id: 'fae',
    name: 'Fae',
    world: "Tir na nOg",
    kind: 'drift',
    standIn: 'Plain translucent cone [0.7, 2.4, 8]; #fffbe8, op .55/.7/.7; "pale mantle" data-only.',
    source: 'app/tir-na-nog/world3d.js',
    prompt: 'A pale drifting fae figure in a plain pale mantle, 2.4 metres tall, warm pale gold-white and semi-transparent, hovering just above bright ground and bobbing gently, no face, light and distant, in a bright green otherworld field, dark fantasy game render.',
    status: 'queued-new',
    priority: 15,
    existingModel: null,
    realms: ['tir-na-nog'],
    wiring: 'app/tir-na-nog/world3d.js cone blocks — swap cones for the GLB.',
  },
  {
    id: 'petrified-statue',
    name: 'Petrified Statue',
    world: 'Hades',
    kind: 'statue',
    standIn: 'Procedural statue: stone-grey #8a8a92 plinth + cone body [0.55, 2.4, 8] + sphere head r0.34, ~3.2 m tall, labelled with victim + petrifier; one per petrify, permanent, solid r1.4.',
    source: 'app/nether-realm/world3d.js:1301 Statues(); lib/nether-realm/medusa.js medusa_statues',
    prompt: null,
    status: 'deferred',
    priority: 67,
    existingModel: null,
    wiring: null,
    notes: 'DEFERRED: a stone monument of a petrified player, not a living character. A forge replacement would be a stone humanoid figure; droppable if the queue counts only living characters.',
  },
  {
    id: 'persephone',
    name: 'Persephone',
    world: 'Hades',
    kind: 'figure',
    standIn: 'No figure exists. Persephone\'s Hall is a place/route label only.',
    source: 'medusa-run-characters.json (persephone entry: NOT READY)',
    prompt: null,
    status: 'blocked-needs-design',
    priority: 68,
    existingModel: null,
    wiring: null,
    notes: 'BLOCKED: no design exists anywhere. Generation prompt marked NOT READY — needs Merlin\'s direction on her look before generation.',
  },
  // ---- FLYING DUTCHMAN ----
  {
    id: 'dutchman-crewman',
    name: "Ship's Crewman",
    world: 'Flying Dutchman',
    kind: 'figure',
    standIn: 'Glowing ghost figure: cone body (r 0.32, h 1.1) + sphere head (r 0.2), ~1.45 m, pale-green emissive; 6 per ship at the guns.',
    source: 'app/flying-dutchman/ship3d.js:337 setCrew',
    prompt: 'A translucent ghostly sailor standing at a ship cannon, pale green glowing figure in tattered seaman clothes, hollow eyes, one hand on the gun, mist curling around the deck, moonlit haunted sea behind, dark fantasy game render.',
    status: 'queued-new',
    priority: 16,
    existingModel: null,
    wiring: 'app/flying-dutchman/ship3d.js setCrew — swap the cone figure for the GLB; keep 6 per ship at the guns.',
  },
  {
    id: 'dutchman-duellist',
    name: 'Duellist',
    world: 'Flying Dutchman',
    kind: 'figure',
    standIn: 'Dark-red cone, r 1.1 x h 3.2, no head/limbs, ~3.2 m; 2-3 seeded per island. The duel itself is fought through a 2D panel.',
    source: 'app/flying-dutchman/page.jsx:595; voyage.js:493 makeSwordDuel',
    prompt: 'A menacing duellist standing on a tropical island shore at dusk, dark-red coat, tricorn hat shadowing the face, one hand on a sword hilt, pale skin and cold eyes, a haunted galleon anchored offshore, dark fantasy game render.',
    status: 'queued-new',
    priority: 17,
    existingModel: null,
    wiring: 'app/flying-dutchman/page.jsx:595 — swap the cone for the GLB; keep the 2-3 per island seeding.',
    notes: 'The duel-foe (no distinct mesh — the duel is a 2D panel) folds into this job: one duellist model serves both.',
  },
  {
    id: 'dutchman-kraken',
    name: 'Kraken',
    world: 'Flying Dutchman',
    kind: 'boss',
    standIn: 'Procedural: 9 m-radius dome body with 2 glowing eyes + 6 segmented tentacles 14-19 m long, 25 m warning disc; 60 HP / 12 cannon hits.',
    source: 'app/flying-dutchman/sea3d.js:469 createKraken',
    prompt: 'A colossal kraken rising from dark ocean water, vast domed body with two huge glowing eyes, six massive segmented tentacles curling 15 metres into the air, water sheeting off its hide, a wooden galleon dwarfed beside it, storm sky, dark fantasy game render.',
    status: 'queued-new',
    priority: 18,
    existingModel: null,
    wiring: 'app/flying-dutchman/sea3d.js createKraken — swap the dome + tentacles for the GLB; keep the 60 HP / 12-hit law.',
  },
  {
    id: 'dutchman-seagull',
    name: 'Seagull',
    world: 'Flying Dutchman',
    kind: 'creature',
    standIn: 'Procedural: flattened cone body + 2 flapping box wings, ~3.9 m wingspan; 2 flocks of 3 circling islands.',
    source: 'app/flying-dutchman/sea3d.js:685 buildGull / createGulls',
    prompt: 'A large white seagull with grey wingtips circling a tropical island, wings spread wide, gliding on sea wind above turquoise water, bright daylight, realistic game render.',
    status: 'queued-new',
    priority: 19,
    existingModel: null,
    wiring: 'app/flying-dutchman/sea3d.js buildGull — swap the cone + box wings for the GLB; keep the 2 flocks of 3.',
  },
  {
    id: 'dutchman-dolphin',
    name: 'Dolphin',
    world: 'Flying Dutchman',
    kind: 'creature',
    standIn: 'Procedural: elongated sphere body + cone dorsal fin + box tail, ~3 m; breaches near the player every 45-90 s.',
    source: 'app/flying-dutchman/sea3d.js:735 createSeaLife',
    prompt: 'A sleek grey dolphin breaching out of bright blue ocean water beside a wooden sailing ship, arched body, water droplets flying, sunlit tropical sea, realistic game render.',
    status: 'queued-new',
    priority: 20,
    existingModel: null,
    wiring: 'app/flying-dutchman/sea3d.js createSeaLife — swap the sphere + fin for the GLB; keep the breach timing.',
  },
  {
    id: 'dutchman-flying-fish',
    name: 'Flying Fish',
    world: 'Flying Dutchman',
    kind: 'creature',
    standIn: 'Procedural: small silver cone dart + wing box, ~1.4 m; 40% of breaches.',
    source: 'app/flying-dutchman/sea3d.js:735 createSeaLife',
    prompt: 'A small silver flying fish gliding just above bright blue ocean waves, long wing-like fins spread, sunlight flashing off its scales, tropical sea, realistic game render.',
    status: 'queued-new',
    priority: 21,
    existingModel: null,
    wiring: 'app/flying-dutchman/sea3d.js createSeaLife — swap the cone dart for the GLB; keep the breach share.',
  },
  {
    id: 'dutchman-merchant',
    name: 'Island Merchant',
    world: 'Flying Dutchman',
    kind: 'figure',
    standIn: 'No 3D figure at all: a map coordinate + 2D shop panel.',
    source: 'app/flying-dutchman/page.jsx:164 MerchantPanel; :583 stall position',
    prompt: null,
    status: 'model-exists-wiring',
    priority: 22,
    existingModel: 'public/models/npcs/vendor.glb',
    wiring: 'app/flying-dutchman/page.jsx MerchantPanel stall (:583) — load vendor.glb at the stall; listed in lib/glb/avatars.js:71, never imported by any Dutchman file.',
    notes: 'Model EXISTS on disk. Wiring only — no generation needed.',
  },
  // ---- STAR WARS (IP-flagged: named film creatures already in code) ----
  {
    id: 'sw-bantha',
    name: 'Bantha',
    world: 'Star Wars',
    kind: 'creature',
    standIn: 'Procedural: boxy brown quadruped, 3.4x1.9x1.7 m box body, 4 legs, 2 ivory horns, ~2.7 m tall, wanders +-7 m.',
    source: 'app/star-wars/landmarks.js AMBIENT_TYPES:925, builders ~940-1130',
    prompt: 'A huge shaggy brown quadruped with a broad boxy body, four sturdy legs, and two long curved ivory horns, standing on a desert plain under twin suns, dust and heat haze, dark fantasy game render.',
    status: 'queued-new',
    priority: 23,
    existingModel: null,
    wiring: 'app/star-wars/landmarks.js AMBIENT builders — swap the box build for the GLB; keep the wander range.',
    ip_flag: 'Named Star Wars creature already rendered in code. Same IP class as the Kombat roster flag — Merlin decides before generation.',
  },
  {
    id: 'sw-jawa',
    name: 'Jawa',
    world: 'Star Wars',
    kind: 'creature',
    standIn: 'Procedural: 1.5 m brown cone robe + dark hood sphere + 2 glowing amber eye boxes, wanders +-4 m.',
    source: 'app/star-wars/landmarks.js AMBIENT builders',
    prompt: 'A small hooded figure in a rough brown robe, face hidden in a dark hood with two glowing amber eyes, standing on desert sand, dark fantasy game render.',
    status: 'queued-new',
    priority: 24,
    existingModel: null,
    wiring: 'app/star-wars/landmarks.js AMBIENT builders — swap the cone robe for the GLB.',
    ip_flag: 'Named Star Wars creature already rendered in code. Same IP class as the Kombat roster flag — Merlin decides before generation.',
  },
  {
    id: 'sw-bird',
    name: 'Bird',
    world: 'Star Wars',
    kind: 'creature',
    standIn: 'Procedural: flapping V of two 1.7 m planes + small sphere body, ~3.4 m wingspan, circles +-9 m at altitude.',
    source: 'app/star-wars/landmarks.js AMBIENT builders',
    prompt: 'A large desert bird with a wide V of flapping wings circling high over sand dunes, small body, twin suns in a pale sky, dark fantasy game render.',
    status: 'queued-new',
    priority: 25,
    existingModel: null,
    wiring: 'app/star-wars/landmarks.js AMBIENT builders — swap the plane V for the GLB; keep the circling path.',
    ip_flag: 'Generic kind, no licensed name — no IP issue.',
  },
  {
    id: 'sw-wampa',
    name: 'Wampa',
    world: 'Star Wars',
    kind: 'creature',
    standIn: 'Procedural: tall white brute, 1.6x2.6x1.1 m box body + sphere head at 3.6 m (~4.1 m tall), wanders +-5 m.',
    source: 'app/star-wars/landmarks.js AMBIENT builders',
    prompt: 'A towering white-furred brute with a broad heavy body and a round head, standing in a snow cave on an ice world, breath fogging in the cold, dark fantasy game render.',
    status: 'queued-new',
    priority: 26,
    existingModel: null,
    wiring: 'app/star-wars/landmarks.js AMBIENT builders — swap the box build for the GLB.',
    ip_flag: 'Named Star Wars creature already rendered in code. Same IP class as the Kombat roster flag — Merlin decides before generation.',
  },
  {
    id: 'sw-tauntaun',
    name: 'Tauntaun',
    world: 'Star Wars',
    kind: 'creature',
    standIn: 'Procedural: tan 2.4 m box body on 2 legs, box head at 2.6 m + 2 horns, ~3.4 m tall, hops +-8 m.',
    source: 'app/star-wars/landmarks.js AMBIENT builders',
    prompt: 'A shaggy tan riding lizard with a long body on two powerful legs, a horned head held high, hopping across a snowy plain on an ice world, dark fantasy game render.',
    status: 'queued-new',
    priority: 27,
    existingModel: null,
    wiring: 'app/star-wars/landmarks.js AMBIENT builders — swap the box build for the GLB; keep the hop.',
    ip_flag: 'Named Star Wars creature already rendered in code. Same IP class as the Kombat roster flag — Merlin decides before generation.',
  },
  {
    id: 'sw-ewok',
    name: 'Ewok',
    world: 'Star Wars',
    kind: 'creature',
    standIn: 'Procedural: small brown furry biped, 0.5 m sphere body + 0.34 m head + cone ears, ~1.6 m tall, wanders +-3.5 m.',
    source: 'app/star-wars/landmarks.js AMBIENT builders',
    prompt: 'A small brown furry biped with a round body, big round head and tall cone ears, standing in a green forest village among tall trees, dark fantasy game render.',
    status: 'queued-new',
    priority: 28,
    existingModel: null,
    wiring: 'app/star-wars/landmarks.js AMBIENT builders — swap the sphere build for the GLB.',
    ip_flag: 'Named Star Wars creature already rendered in code. Same IP class as the Kombat roster flag — Merlin decides before generation.',
  },
  {
    id: 'sw-porg',
    name: 'Porg',
    world: 'Star Wars',
    kind: 'creature',
    standIn: 'Procedural: round 0.45 m sphere body + orange cone beak + one plane wing, hops +-2.5 m.',
    source: 'app/star-wars/landmarks.js AMBIENT builders',
    prompt: 'A small round seabird with a plump body, big dark eyes and a short orange beak, standing on a rocky island cliff above the sea, dark fantasy game render.',
    status: 'queued-new',
    priority: 29,
    existingModel: null,
    wiring: 'app/star-wars/landmarks.js AMBIENT builders — swap the sphere build for the GLB.',
    ip_flag: 'Named Star Wars creature already rendered in code. Same IP class as the Kombat roster flag — Merlin decides before generation.',
  },
  {
    id: 'sw-probe-droid',
    name: 'Probe Droid',
    world: 'Star Wars',
    kind: 'creature',
    standIn: 'Procedural: black 0.7 m sphere pod (scaled 1.25 tall) floating at 2.4 m + 3 cylinder legs + red eye sphere, drifts +-5 m.',
    source: 'app/star-wars/landmarks.js AMBIENT builders',
    prompt: 'A black floating probe droid, a round pod body hovering above the ground on three thin legs, one glowing red eye, drifting slowly over a frozen plain, dark fantasy game render.',
    status: 'queued-new',
    priority: 30,
    existingModel: null,
    wiring: 'app/star-wars/landmarks.js AMBIENT builders — swap the sphere pod for the GLB; keep the hover height.',
    ip_flag: 'Named Star Wars creature already rendered in code. Same IP class as the Kombat roster flag — Merlin decides before generation.',
  },
  {
    id: 'sw-fish',
    name: 'Fish',
    world: 'Star Wars',
    kind: 'creature',
    standIn: 'Procedural: 1.6 m blue cone body + plane tail, swims +-6 m.',
    source: 'app/star-wars/landmarks.js AMBIENT builders',
    prompt: 'A large blue fish with a sleek cone body and a wide flat tail, swimming through clear blue water in an underwater world, light rippling down, realistic game render.',
    status: 'queued-new',
    priority: 31,
    existingModel: null,
    wiring: 'app/star-wars/landmarks.js AMBIENT builders — swap the cone body for the GLB; keep the swim range.',
    ip_flag: 'Generic kind, no licensed name — no IP issue.',
  },
  {
    id: 'sw-tuskan',
    name: 'Tusken Raider',
    world: 'Star Wars',
    kind: 'creature',
    standIn: 'Procedural: 1.9 m tan cone robe + sphere head + 2 tusk cones + 2.2 m staff, wanders +-5 m.',
    source: 'app/star-wars/landmarks.js AMBIENT builders',
    prompt: 'A robed desert raider in a tan cone robe, face wrapped with two small tusk cones showing, carrying a tall wooden staff, standing on a desert dune under twin suns, dark fantasy game render.',
    status: 'queued-new',
    priority: 32,
    existingModel: null,
    wiring: 'app/star-wars/landmarks.js AMBIENT builders — swap the cone robe for the GLB.',
    ip_flag: 'Named Star Wars creature already rendered in code. Same IP class as the Kombat roster flag — Merlin decides before generation.',
  },
  // ---- WORLD NEXUS / EARTH 2 / ENYO / HOLLOW EARTH HERO ----
  {
    id: 'wn-statue-guardian',
    name: 'Guardian Statue',
    world: 'World Nexus',
    kind: 'statue',
    standIn: 'Procedural placeholder: ~3.3 m robed figure (cylinder body, sphere head, glowing accent orb in hand, arm hint), 2 placements at (+-3.2, 13.5).',
    source: 'lib/world-nexus/asset-loader.js fbStatue; app/world-nexus/scene.js:325-326',
    prompt: 'A tall robed guardian statue, 3.3 metres, weathered stone robe, calm round head, one hand raised holding a small glowing orb, standing at the gate of a nexus hall, dark fantasy game render.',
    status: 'queued-new',
    priority: 33,
    existingModel: null,
    wiring: 'lib/world-nexus/asset-loader.js fbStatue — swap the placeholder for the GLB; keep the 2 placements.',
    notes: 'Premise correction from the audit: the "5 GLBs gone" was the landscape group (rock/tree/crystal/floating-isle/lantern), not figures. This statue is the only figure-like stand-in in World Nexus.',
  },
  {
    id: 'e2-pachycephalosaurus',
    name: 'Pachycephalosaurus',
    world: 'Earth 2',
    kind: 'creature',
    standIn: 'Label-only / name-card only, no 3D at all: file null, status awaiting-upload; the roster shows an amber "in the Studio" chip.',
    source: 'lib/earth2/models.js:46; components/earth2/DinosaurBay.jsx:1853-1869',
    prompt: 'A Pachycephalosaurus, 4.5 metres long, thick domed skull with a bony crown, sturdy biped body, dusty brown hide, standing on open grassland among ferns, realistic game render.',
    status: 'queued-new',
    priority: 34,
    existingModel: null,
    wiring: 'lib/earth2/models.js:46 — set file + status placed once the GLB lands; the roster slot already waits for it.',
    notes: 'The only one of 18 Earth 2 dino species without a model. The other 17 are real GLBs.',
  },
  {
    id: 'enyo-bot',
    name: 'Enyo AI Bot',
    world: 'Enyo',
    kind: 'figure',
    standIn: 'Procedural armored humanoid: box thighs/shins/boots, plate-carrier vest, backpack, shoulder pads, helmet + visor goggles + NVG rail, floating health-bar sprite at 2.2 m; ~1.9 m, 5 per match, blue- or red-trimmed.',
    source: 'app/enyo/page.jsx:217 makeBotMesh; :714-721; lib/enyo-bots.js',
    prompt: 'A futuristic armored soldier bot, 1.9 metres, plate-carrier vest, backpack, shoulder pads, helmet with visor goggles and a night-vision rail, blue or red trim, standing ready on a war-torn battlefield, dark fantasy game render.',
    status: 'queued-new',
    priority: 35,
    existingModel: null,
    wiring: 'app/enyo/page.jsx makeBotMesh — swap the box build for the GLB; keep the 5-per-match spawn and the health-bar sprite.',
    notes: 'Kombat soldier GLBs (tactical-soldier, cybernetic-soldier, space-marine) are a different program and not wired here — a fresh Enyo model is the clean job.',
  },
  {
    id: 'he-hero',
    name: 'Kael, the Monster Hunter',
    world: 'Hollow Earth',
    kind: 'figure',
    standIn: 'Procedural: dark-leather coat cylinder + sphere head + spear shaft/cone tip, trophy pauldron for Kael; ~1.9 m. No GLB swap anywhere in Hollow Earth.',
    source: 'app/hollow-earth/characters.js:110 buildHeroFigure; page.jsx:295',
    prompt: 'A rugged monster hunter, 1.9 metres, dark-leather coat, spear in hand, a trophy pauldron on one shoulder, scarred face and wary eyes, standing in a vast underground cavern with glowing crystals, dark fantasy game render.',
    status: 'queued-new',
    priority: 36,
    existingModel: null,
    wiring: 'app/hollow-earth/characters.js buildHeroFigure — swap the coat-cylinder build for the GLB.',
    notes: 'His 5 imported hero picks DO have Middle-earth GLBs (wizard/ranger/elf-archer/dwarf/halfling) but Hollow Earth never loads them — a wiring gap to fix alongside, not a generation job.',
  },
  // ---- HOLLOW EARTH — absent families: truncated (re-send, not new generation) ----
  {
    id: 'he-slot-02',
    name: 'Lava Hulk',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. GLB-only rendering; the staged file is truncated (374,914 bytes missing), so the family never spawns.',
    source: 'app/hollow-earth/models.js:95 TRUNCATED_AWAITING_RESEND; app/hollow-earth/spawns.js:654',
    prompt: null,
    status: 'model-exists-resend',
    priority: 54,
    existingModel: '~/workspace/character-batch-4/lava-demon-3d-model.glb',
    wiring: 'app/hollow-earth/models.js — remove the slot-02 TRUNCATED entry once the re-send lands; the placement re-includes itself with no other change.',
    notes: 'Staged file truncated by 374,914 bytes. Needs a Tripo re-send of the rig stage + re-optimize, not a new generation.',
  },
  {
    id: 'he-slot-03',
    name: 'Ridge Tyrant',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. Staged file truncated (43,581 bytes missing).',
    source: 'app/hollow-earth/models.js:99 TRUNCATED_AWAITING_RESEND',
    prompt: null,
    status: 'model-exists-resend',
    priority: 55,
    existingModel: '~/workspace/character-batch-4/armored-demon-3d-model.glb',
    wiring: 'app/hollow-earth/models.js — remove the slot-03 TRUNCATED entry once the re-send lands.',
    notes: 'Staged file truncated by 43,581 bytes. Re-send + re-optimize.',
  },
  {
    id: 'he-slot-05',
    name: 'Sand Vortex',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. Staged file truncated (19,596 bytes missing).',
    source: 'app/hollow-earth/models.js:100 TRUNCATED_AWAITING_RESEND',
    prompt: null,
    status: 'model-exists-resend',
    priority: 56,
    existingModel: '~/workspace/character-batch-4/desert-creature-3d-model.glb',
    wiring: 'app/hollow-earth/models.js — remove the slot-05 TRUNCATED entry once the re-send lands.',
    notes: 'Staged file truncated by 19,596 bytes. Re-send + re-optimize.',
  },
  {
    id: 'he-slot-06',
    name: 'Spike Tyrant',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. Staged file truncated (108,722 bytes missing).',
    source: 'app/hollow-earth/models.js:97 TRUNCATED_AWAITING_RESEND',
    prompt: null,
    status: 'model-exists-resend',
    priority: 57,
    existingModel: '~/workspace/character-batch-4/lava-golem-3d-model.glb',
    wiring: 'app/hollow-earth/models.js — remove the slot-06 TRUNCATED entry once the re-send lands.',
    notes: 'Staged file truncated by 108,722 bytes. Re-send + re-optimize.',
  },
  {
    id: 'he-slot-18',
    name: 'Ember Pack Brute',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. Staged file truncated (128,100 bytes missing).',
    source: 'app/hollow-earth/models.js:96 TRUNCATED_AWAITING_RESEND',
    prompt: null,
    status: 'model-exists-resend',
    priority: 58,
    existingModel: '~/workspace/character-batch-4/lava-monster-3d-model 2.glb',
    wiring: 'app/hollow-earth/models.js — remove the slot-18 TRUNCATED entry once the re-send lands.',
    notes: 'Staged file truncated by 128,100 bytes. Re-send + re-optimize.',
  },
  {
    id: 'he-slot-24',
    name: 'Sandstorm Hulk',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. Staged file truncated (12,911 bytes missing).',
    source: 'app/hollow-earth/models.js:98 TRUNCATED_AWAITING_RESEND',
    prompt: null,
    status: 'model-exists-resend',
    priority: 59,
    existingModel: '~/workspace/character-batch-4/sand-monster-3d-model.glb',
    wiring: 'app/hollow-earth/models.js — remove the slot-24 TRUNCATED entry once the re-send lands.',
    notes: 'Staged file truncated by 12,911 bytes. Re-send + re-optimize.',
  },
  {
    id: 'he-umbrax',
    name: 'Umbrax the Nightwing',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. Staged file truncated (23,288 bytes missing). 4.0 m flyer.',
    source: 'app/hollow-earth/models.js:104 TRUNCATED_AWAITING_RESEND',
    prompt: null,
    status: 'model-exists-resend',
    priority: 60,
    existingModel: '~/workspace/character-batch-4/dark-dragon-3d-model.glb',
    wiring: 'app/hollow-earth/models.js — remove the umbrax TRUNCATED entry once the re-send lands.',
    notes: 'Staged file truncated by 23,288 bytes. Re-send + re-optimize.',
  },
  {
    id: 'he-frostbite-lizard',
    name: 'Frostbite the Patient',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. Staged file truncated (48,903 bytes missing). 3.0 m, mount candidate.',
    source: 'app/hollow-earth/models.js:105 TRUNCATED_AWAITING_RESEND',
    prompt: null,
    status: 'model-exists-resend',
    priority: 61,
    existingModel: '~/workspace/character-batch-4/snow-lizard-mount-3d-model.glb',
    wiring: 'app/hollow-earth/models.js — remove the frostbite-lizard TRUNCATED entry once the re-send lands; also restores the second Hollow Earth mount (only Embermane rides today).',
    notes: 'Staged file truncated by 48,903 bytes. Re-send + re-optimize. Same file as the truncated Frostbite mount GLB.',
  },
  {
    id: 'he-vice',
    name: 'Vice',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. Staged file truncated (38,598 bytes missing).',
    source: 'app/hollow-earth/models.js:106 TRUNCATED_AWAITING_RESEND',
    prompt: null,
    status: 'model-exists-resend',
    priority: 62,
    existingModel: '~/workspace/character-batch-4/demon-monster-3d-model 2.glb',
    wiring: 'app/hollow-earth/models.js — remove the vice TRUNCATED entry once the re-send lands.',
    notes: 'Staged file truncated by 38,598 bytes. Re-send + re-optimize.',
  },
  {
    id: 'he-wonder',
    name: 'The Unnamed Wonder',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. Staged file truncated (107,419 bytes missing).',
    source: 'app/hollow-earth/models.js:101 TRUNCATED_AWAITING_RESEND',
    prompt: null,
    status: 'model-exists-resend',
    priority: 63,
    existingModel: '~/workspace/character-batch-4/fantasy-creature-3d-model.glb',
    wiring: 'app/hollow-earth/models.js — remove the wonder TRUNCATED entry once the re-send lands.',
    notes: 'Staged file truncated by 107,419 bytes. Re-send + re-optimize.',
  },
  {
    id: 'he-cinder-dragon',
    name: 'Cinder Maw',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. Staged file truncated (33,753 bytes missing). 3.6 m ground dragon.',
    source: 'app/hollow-earth/models.js:102 TRUNCATED_AWAITING_RESEND',
    prompt: null,
    status: 'model-exists-resend',
    priority: 64,
    existingModel: '~/workspace/character-batch-4/lava-dragon-3d-model.glb',
    wiring: 'app/hollow-earth/models.js — remove the cinder-dragon TRUNCATED entry once the re-send lands.',
    notes: 'Staged file truncated by 33,753 bytes. Re-send + re-optimize.',
  },
  {
    id: 'he-muse-dragon',
    name: 'Muse, the Luminous',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. Staged file truncated (55,723 bytes missing). 3.0 m low-hover dragon.',
    source: 'app/hollow-earth/models.js:103 TRUNCATED_AWAITING_RESEND',
    prompt: null,
    status: 'model-exists-resend',
    priority: 65,
    existingModel: '~/workspace/character-batch-4/purple-dragon-3d-model.glb',
    wiring: 'app/hollow-earth/models.js — remove the muse-dragon TRUNCATED entry once the re-send lands.',
    notes: 'Staged file truncated by 55,723 bytes. Re-send + re-optimize.',
  },
  // ---- HOLLOW EARTH — absent families: never placed (new generation) ----
  {
    id: 'he-slot-09',
    name: 'Sea-Scorch Leviathan',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. No staged file assigned anywhere; family exists in families.js only.',
    source: 'app/hollow-earth/families.js; app/hollow-earth/spawns.js MONSTER_TYPES',
    prompt: 'A massive sea-scorched leviathan, 3.4 metres, dark scaled hide scorched black at the edges, huge jaw and small fierce eyes, rising from underground black water in a vast cavern, dark fantasy game render.',
    status: 'queued-new',
    priority: 37,
    existingModel: null,
    wiring: 'app/hollow-earth/models.js BATCH4_PLACEMENTS + spawns.js — add the placement once the GLB lands.',
  },
  {
    id: 'he-slot-12',
    name: 'Grinning Funnel',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. No staged file assigned anywhere.',
    source: 'app/hollow-earth/families.js; app/hollow-earth/spawns.js MONSTER_TYPES',
    prompt: 'A grinning funnel-mouthed monster, 2.4 metres, wide circular maw full of teeth, hunched body, standing in a dark underground cavern, dark fantasy game render.',
    status: 'queued-new',
    priority: 38,
    existingModel: null,
    wiring: 'app/hollow-earth/models.js BATCH4_PLACEMENTS + spawns.js — add the placement once the GLB lands.',
  },
  {
    id: 'he-slot-16',
    name: 'Storm Herald',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. No staged file assigned anywhere.',
    source: 'app/hollow-earth/families.js; app/hollow-earth/spawns.js MONSTER_TYPES',
    prompt: 'A storm herald monster, 2.4 metres, crackling with faint lightning across dark hide, horned head raised, standing on a cavern ridge as wind whips past, dark fantasy game render.',
    status: 'queued-new',
    priority: 39,
    existingModel: null,
    wiring: 'app/hollow-earth/models.js BATCH4_PLACEMENTS + spawns.js — add the placement once the GLB lands.',
  },
  {
    id: 'he-slot-21',
    name: 'Ooze Wight',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. No staged file assigned anywhere.',
    source: 'app/hollow-earth/families.js; app/hollow-earth/spawns.js MONSTER_TYPES',
    prompt: 'An ooze wight, 2.6 metres, a shambling humanoid of dripping dark slime, hollow eyes glowing faintly, leaving a wet trail across cavern stone, dark fantasy game render.',
    status: 'queued-new',
    priority: 40,
    existingModel: null,
    wiring: 'app/hollow-earth/models.js BATCH4_PLACEMENTS + spawns.js — add the placement once the GLB lands.',
  },
  {
    id: 'he-slot-25',
    name: 'Flameback Runner',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. No staged file assigned anywhere.',
    source: 'app/hollow-earth/families.js; app/hollow-earth/spawns.js MONSTER_TYPES',
    prompt: 'A flameback runner, 2.0 metres, a fast lean quadruped with a ridge of small flames along its spine, dark hide, mid-stride in an underground cavern, dark fantasy game render.',
    status: 'queued-new',
    priority: 41,
    existingModel: null,
    wiring: 'app/hollow-earth/models.js BATCH4_PLACEMENTS + spawns.js — add the placement once the GLB lands.',
  },
  {
    id: 'he-slot-27',
    name: 'Verdant Core Golem',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. No staged file assigned anywhere.',
    source: 'app/hollow-earth/families.js; app/hollow-earth/spawns.js MONSTER_TYPES',
    prompt: 'A verdant core golem, 3.0 metres, a hulking figure of moss-covered stone with a glowing green core in its chest, standing among underground ferns in a vast cavern, dark fantasy game render.',
    status: 'queued-new',
    priority: 42,
    existingModel: null,
    wiring: 'app/hollow-earth/models.js BATCH4_PLACEMENTS + spawns.js — add the placement once the GLB lands.',
  },
  {
    id: 'he-slot-28',
    name: 'Sand Vortex Pack',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. No staged file assigned anywhere.',
    source: 'app/hollow-earth/families.js; app/hollow-earth/spawns.js MONSTER_TYPES',
    prompt: 'A sand vortex pack hunter, 3.0 metres, a lean desert beast wreathed in swirling sand, pale hide, sharp teeth, running across a cavern sand flat, dark fantasy game render.',
    status: 'queued-new',
    priority: 43,
    existingModel: null,
    wiring: 'app/hollow-earth/models.js BATCH4_PLACEMENTS + spawns.js — add the placement once the GLB lands.',
  },
  {
    id: 'he-slot-33',
    name: 'Hydra Vortex',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. No staged file assigned anywhere.',
    source: 'app/hollow-earth/families.js; app/hollow-earth/spawns.js MONSTER_TYPES',
    prompt: 'A hydra vortex, 3.0 metres, a many-headed serpent beast with heads swirling like a whirlwind, dark scaled necks, standing in a misty underground cavern, dark fantasy game render.',
    status: 'queued-new',
    priority: 44,
    existingModel: null,
    wiring: 'app/hollow-earth/models.js BATCH4_PLACEMENTS + spawns.js — add the placement once the GLB lands.',
  },
  {
    id: 'he-slot-34',
    name: 'Flameback Charger',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. No staged file assigned anywhere.',
    source: 'app/hollow-earth/families.js; app/hollow-earth/spawns.js MONSTER_TYPES',
    prompt: 'A flameback charger, 2.0 metres, a stocky charging quadruped with a burning ridge along its back, lowered horns, mid-charge in an underground cavern, dark fantasy game render.',
    status: 'queued-new',
    priority: 45,
    existingModel: null,
    wiring: 'app/hollow-earth/models.js BATCH4_PLACEMENTS + spawns.js — add the placement once the GLB lands.',
  },
  {
    id: 'he-slot-35',
    name: 'Funnel Row',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. No staged file assigned anywhere.',
    source: 'app/hollow-earth/families.js; app/hollow-earth/spawns.js MONSTER_TYPES',
    prompt: 'A funnel row monster, 3.0 metres, a tall figure with a wide funnel-shaped maw, dark hide, standing in a row of its kin in an underground cavern, dark fantasy game render.',
    status: 'queued-new',
    priority: 46,
    existingModel: null,
    wiring: 'app/hollow-earth/models.js BATCH4_PLACEMENTS + spawns.js — add the placement once the GLB lands.',
  },
  {
    id: 'he-slot-36',
    name: 'Pustule Bloater',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. No staged file assigned anywhere.',
    source: 'app/hollow-earth/families.js; app/hollow-earth/spawns.js MONSTER_TYPES',
    prompt: 'A pustule bloater, 2.8 metres, a swollen bloated beast covered in bulging sores, pale sickly hide, shuffling through an underground cavern, dark fantasy game render.',
    status: 'queued-new',
    priority: 47,
    existingModel: null,
    wiring: 'app/hollow-earth/models.js BATCH4_PLACEMENTS + spawns.js — add the placement once the GLB lands.',
  },
  {
    id: 'he-slot-37',
    name: 'Blight Bulk',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. No staged file assigned anywhere.',
    source: 'app/hollow-earth/families.js; app/hollow-earth/spawns.js MONSTER_TYPES',
    prompt: 'A blight bulk, 2.8 metres, a massive hulking beast with blighted dark hide and weeping sores, standing in a corrupted corner of an underground cavern, dark fantasy game render.',
    status: 'queued-new',
    priority: 48,
    existingModel: null,
    wiring: 'app/hollow-earth/models.js BATCH4_PLACEMENTS + spawns.js — add the placement once the GLB lands.',
  },
  {
    id: 'he-slot-38',
    name: 'Violet Hollow Pack',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. No staged file assigned anywhere.',
    source: 'app/hollow-earth/families.js; app/hollow-earth/spawns.js MONSTER_TYPES',
    prompt: 'A violet hollow pack hunter, 2.2 metres, a lean violet beast with hollow glowing eyes, prowling in a pack through a dark underground cavern, dark fantasy game render.',
    status: 'queued-new',
    priority: 49,
    existingModel: null,
    wiring: 'app/hollow-earth/models.js BATCH4_PLACEMENTS + spawns.js — add the placement once the GLB lands.',
  },
  {
    id: 'he-slot-39',
    name: 'Storm Roarer',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. No staged file assigned anywhere.',
    source: 'app/hollow-earth/families.js; app/hollow-earth/spawns.js MONSTER_TYPES',
    prompt: 'A storm roarer, 3.0 metres, a massive beast with its head thrown back mid-roar, lightning crackling around its horns, standing on a cavern ridge, dark fantasy game render.',
    status: 'queued-new',
    priority: 50,
    existingModel: null,
    wiring: 'app/hollow-earth/models.js BATCH4_PLACEMENTS + spawns.js — add the placement once the GLB lands.',
  },
  {
    id: 'he-slot-40',
    name: 'Violet Hulk',
    world: 'Hollow Earth',
    kind: 'creature',
    standIn: 'ABSENT — renders nothing. No staged file assigned anywhere.',
    source: 'app/hollow-earth/families.js; app/hollow-earth/spawns.js MONSTER_TYPES',
    prompt: 'A violet hulk, 3.2 metres, a towering violet-skinned brute with heavy fists and glowing eyes, standing in a dark underground cavern, dark fantasy game render.',
    status: 'queued-new',
    priority: 51,
    existingModel: null,
    wiring: 'app/hollow-earth/models.js BATCH4_PLACEMENTS + spawns.js — add the placement once the GLB lands.',
  },
  // ---- JUPITER 2 — models exist, wiring only ----
  {
    id: 'j2-lightning-monster',
    name: 'Lightning Monster',
    world: 'Jupiter 2',
    kind: 'creature',
    standIn: 'Procedural: ~3.6 m hunched dark sphere body + head at 2.75 m, 2 horn cones, 4 back spikes, stumpy cylinder legs, emissive chest core + glowing blue eyes; x7 on the deck.',
    source: 'lib/jupiter2/meshes.js:21 buildLightningMonster; lib/jupiter2/profile.js:37-38',
    prompt: null,
    status: 'model-exists-wiring',
    priority: 52,
    existingModel: '~/workspace/character-batch-4/golden-lightning-monster-3d-model.glb',
    wiring: 'lib/jupiter2/meshes.js buildLightningMonster — swap the sphere build for the GLB; keep the x7 deck count. Second candidate on disk: lightning-demon-3d-model.glb. Both are currently assigned as Hollow Earth monsters (Auric Storm / Volta) — Merlin decides which program keeps them.',
    notes: 'Model EXISTS on disk. Wiring only — no generation needed.',
  },
  {
    id: 'j2-demobat',
    name: 'Demobat',
    world: 'Jupiter 2',
    kind: 'creature',
    standIn: 'Procedural: small dark sphere body (~0.8 m) + horned head + red eyes + two 1.9 m membrane plane wings on pivots (flapping); x9 in the air.',
    source: 'lib/jupiter2/meshes.js:73 buildDemobat; lib/jupiter2/profile.js:37-38',
    prompt: null,
    status: 'model-exists-wiring',
    priority: 53,
    existingModel: 'public/models/kombat/demobats.glb',
    wiring: 'lib/jupiter2/meshes.js buildDemobat — swap the sphere + plane wings for the GLB; keep the x9 air count. Second candidate on disk: ~/workspace/character-batch-4/demobats-decimated.glb (rigged, 78 joints, purpose TBD).',
    notes: 'Model EXISTS on disk (Kombat fighter, roster q049-demobats). Wiring only — no generation needed.',
  },
  // ---- EARTH 4 — procedural by design (class entry, not a generation job) ----
  {
    id: 'e4-procedural-creatures',
    name: 'Earth 4 creatures (class)',
    world: 'Earth 4',
    kind: 'class',
    standIn: 'Procedural-by-design: 1,262 species rendered as primitive geometry (spheres/cylinders/cones, <=9 part-groups each, sizes clamped 0.05-30 m) from anatomy plans.',
    source: 'lib/earth4/creature-builder.js; lib/earth4/creature-plans.json (count: 1262)',
    prompt: null,
    status: 'procedural-by-design',
    priority: 66,
    existingModel: null,
    wiring: null,
    notes: 'ONE class entry, not 1,262 stand-ins. Earth 4 is an exploration/observation world; its creatures are procedural by design. A Tripo hero set for selected species was gated on a top-up (parent-supplied; no hero/top-up reference found in lib/earth4 code).',
  },
];

// ---- Helpers (pure) ----

/** Queue entry by id, or null. */
export function getQueueEntry(id) {
  if (typeof id !== 'string') return null;
  return FORGE_QUEUE.find((e) => e.id === id) || null;
}

/** Entries in one status, in priority order. */
export function entriesByStatus(status) {
  return FORGE_QUEUE.filter((e) => e.status === status).sort((a, b) => a.priority - b.priority);
}

/** The next job through the forge: lowest priority number among queued-new entries. Cerberus is first. */
export function nextUp() {
  const queued = entriesByStatus('queued-new');
  return queued.length ? queued[0] : null;
}

/** How many jobs need a new Tripo generation. */
export function newGenerationDemand() {
  return entriesByStatus('queued-new').length;
}

/** How many jobs are ready to wire with a model already on disk. */
export function readyToWireCount() {
  return FORGE_QUEUE.filter((e) => e.status === 'model-exists-wiring').length;
}

/** How many jobs need a Tripo re-send (staged file truncated). */
export function resendCount() {
  return FORGE_QUEUE.filter((e) => e.status === 'model-exists-resend').length;
}

/** Estimated Tripo credits for all new-generation jobs, at the brief's per-model estimate. */
export function estimatedCreditsNeeded() {
  return newGenerationDemand() * TRIPO_CREDITS_PER_MODEL_ESTIMATE;
}

/** Shortfall vs a balance: positive = credits still needed. */
export function creditsShortfall(balance) {
  const b = Number(balance) || 0;
  return Math.max(0, estimatedCreditsNeeded() - b);
}

/** True when the current balance covers the whole new-generation demand at the estimate. */
export function demandCovered(balance) {
  return creditsShortfall(balance) === 0;
}

/** Count of entries per status, for the receipt. */
export function statusCounts() {
  const counts = {};
  for (const s of FORGE_STATUSES) counts[s] = 0;
  for (const e of FORGE_QUEUE) counts[e.status] = (counts[e.status] || 0) + 1;
  return counts;
}


