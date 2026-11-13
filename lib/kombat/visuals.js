/**
 * KOMBAT ARENA — per-fighter visual parameters for all 59 roster fighters.
 *
 * Each entry is a params object for buildFighterRig() from lib/kombat/rig.js
 * (see the PARAMS SCHEMA documented at the top of that file).
 *
 * Keys are kebab-case fighter ids and must match the roster exactly.
 * Likeness note: these are procedural approximations — signature silhouettes,
 * colors, weapons and effects only. No actor likenesses, no photo scans,
 * no copyrighted mesh data; everything is generated box/sphere/cylinder
 * geometry driven by these parameter sets.
 */

export const VISUALS = {
  // ------------------------------------------------ HORROR
  'freddy-krueger': {
    body: 'humanoid', height: 1.0, bulk: 0.95,
    colors: { skin: 0xb0714f, suit: 0xa02020, accent: 0x1f5c1f, eyes: 0xffdd44 },
    head: { type: 'cap', color: 0x5a3a22, detail: 'fedora' }, // fedora + claw glove
    attachments: [{ type: 'claw-glove', side: 'right' }],
  },
  'jason-voorhees': {
    body: 'bulky', height: 1.12, bulk: 1.15,
    colors: { skin: 0xc9a180, suit: 0x2e2e33, accent: 0xb02020, eyes: 0x111111 },
    head: { type: 'mask', color: 0xd8d4cc, detail: 'jason' }, // hockey mask + red chevrons
    attachments: [{ type: 'machete', side: 'right' }],
  },
  'michael-myers': {
    body: 'humanoid', height: 1.05, bulk: 1.0,
    colors: { skin: 0xd8c8b8, suit: 0x1f2a44, accent: 0x1f2a44, eyes: 0x0a0a0a },
    head: { type: 'mask', color: 0xe8e0d4 }, // blank white mask, dark coveralls
    attachments: [{ type: 'knife', side: 'right' }],
  },
  'leatherface': {
    body: 'bulky', height: 1.1, bulk: 1.2,
    colors: { skin: 0xd8b898, suit: 0x6b5233, accent: 0x8a2a2a, eyes: 0x3a2a1a },
    head: { type: 'mask', color: 0xd8b898 }, // stitched skin mask
    attachments: [{ type: 'chainsaw', side: 'right', color: 0x8a2a2a }],
  },
  'pennywise': {
    body: 'humanoid', height: 1.05, bulk: 1.0,
    colors: { skin: 0xf0ece4, suit: 0xc02020, accent: 0xe8a020, eyes: 0xffdd00 },
    head: { type: 'bare', detail: ['clown', 'balloon'] }, // red nose, hair puffs, balloon
    attachments: [ // dual-wield law: razor-claw gloves on BOTH hands
      { type: 'claw-glove', side: 'right' },
      { type: 'claw-glove', side: 'left' },
    ],
    effects: [{ type: 'glow', color: 0xff3020 }],
  },
  'ghostface': {
    body: 'humanoid', height: 1.0, bulk: 0.9,
    colors: { skin: 0xe8e8e8, suit: 0x0c0c0e, accent: 0xe8e8e8, eyes: 0x000000 },
    head: { type: 'hood', color: 0x0c0c0e },
    attachments: [{ type: 'knife', side: 'right' }],
  },
  'chucky': {
    body: 'small', height: 0.55, bulk: 0.9,
    colors: { skin: 0xd8a878, suit: 0x2a4a8a, accent: 0xcc2222, eyes: 0x33aaff },
    head: { type: 'bare', color: 0xd8a878, detail: [] }, // striped shirt via torso bands
    attachments: [{ type: 'knife', side: 'right' }],
    stance: { armSpread: 0.45, crouch: 0.1 },
  },
  'pinhead': {
    body: 'humanoid', height: 1.05, bulk: 0.95,
    colors: { skin: 0xd8cfc0, suit: 0x141416, accent: 0x9a9aa0, eyes: 0x0a0a0a },
    head: { type: 'bare' },
    effects: [{ type: 'glow', color: 0x8888aa }],
  },
  'candyman': {
    body: 'humanoid', height: 1.05, bulk: 1.0,
    colors: { skin: 0x6b4a30, suit: 0x3a2e24, accent: 0xc8a020, eyes: 0x221100 },
    head: { type: 'bare' },
    attachments: [{ type: 'claws', side: 'right', color: 0xb0b0b8 }], // hook approximated as claws
  },
  'samara-morgan': {
    body: 'humanoid', height: 0.95, bulk: 0.8,
    colors: { skin: 0xd8cfc4, suit: 0xdcd8d0, accent: 0x1a1a1a, eyes: 0x000000 },
    head: { type: 'hood', color: 0x141414 }, // black hair veil over white dress
    effects: [{ type: 'particles', color: 0x88aaff }],
  },
  'xenomorph': {
    body: 'humanoid', height: 1.12, bulk: 0.8,
    colors: { skin: 0x15151a, suit: 0x1c1c22, accent: 0x3a3a44, eyes: 0x111111 },
    head: { type: 'bare', detail: 'jaw' }, // elongated cranium + inner jaw
    attachments: [{ type: 'claws', side: 'right' }, { type: 'claws', side: 'left' }],
    effects: [{ type: 'slime', color: 0x66ff88 }],
  },
  'predator': {
    body: 'bulky', height: 1.15, bulk: 1.1,
    colors: { skin: 0x7a6a3a, suit: 0x2a2a26, accent: 0xc8a020, eyes: 0xffaa00 },
    head: { type: 'bare', detail: 'dreadlocks' },
    attachments: [
      { type: 'blaster', side: 'right', color: 0x88ccff }, // plasma caster
      { type: 'claws', side: 'right' }, // wrist blades (gauntlet blades approximated as claws)
      { type: 'claws', side: 'left' }, // wrist blades — dual-wield law: both gauntlets
    ],
    effects: [{ type: 'glow', color: 0x44ff88 }],
  },

  // ------------------------------------------------ SCI-FI
  'darth-vader': {
    body: 'humanoid', height: 1.12, bulk: 1.1,
    colors: { skin: 0x0a0a0c, suit: 0x101014, accent: 0xff2222, eyes: 0xff2222 },
    head: { type: 'helmet', color: 0x0a0a0c, detail: 'vader' },
    attachments: [{ type: 'lightsaber', side: 'right' }], // blade color from accent = red
    effects: [{ type: 'glow', color: 0xff2222 }],
  },
  'luke-skywalker': {
    body: 'humanoid', height: 1.0, bulk: 0.95,
    colors: { skin: 0xd8a878, suit: 0xc8b898, accent: 0x2266cc, eyes: 0x446688 },
    head: { type: 'bare', color: 0xd8a878 },
    attachments: [{ type: 'lightsaber', side: 'right', color: 0x3388ff }], // blue blade
  },
  'yoda': {
    body: 'small', height: 0.55, bulk: 0.9,
    colors: { skin: 0x6a8a4a, suit: 0x8a6f4a, accent: 0x33ff66, eyes: 0x222211 },
    head: { type: 'hood', color: 0x6b5233 },
    attachments: [
      { type: 'lightsaber', side: 'right', color: 0x33ff66 },
      { type: 'staff', side: 'back', color: 0x6b5233 },
    ],
    effects: [{ type: 'glow', color: 0x66ff88 }],
  },
  'emperor-palpatine': {
    body: 'humanoid', height: 1.0, bulk: 0.9,
    colors: { skin: 0xc8b898, suit: 0x1a1a20, accent: 0x8844ff, eyes: 0xffdd44 },
    head: { type: 'hood', color: 0x1a1a20 },
    attachments: [{ type: 'staff', side: 'right', color: 0x8844ff }],
    effects: [{ type: 'electricity', color: 0xaa66ff }],
  },
  't-800': {
    body: 'bulky', height: 1.08, bulk: 1.15,
    colors: { skin: 0xd8a878, suit: 0x1a1a1c, accent: 0xb0b0b8, eyes: 0xff2222 },
    head: { type: 'bare', detail: 'visor-red' },
    attachments: [{ type: 'blaster', side: 'right', color: 0xffaa00 }],
  },
  't-1000': {
    body: 'humanoid', height: 1.02, bulk: 1.0,
    colors: { skin: 0xb8bcc4, suit: 0x8a8e96, accent: 0xd8dce4, eyes: 0x444a52 },
    head: { type: 'bare' },
    attachments: [ // dual-wield law: morphic blade arms on BOTH sides
      { type: 'knife', side: 'right', color: 0xd8dce4 },
      { type: 'knife', side: 'left', color: 0xd8dce4 },
    ],
    effects: [{ type: 'glow', color: 0xaaccff }],
  },
  'ellen-ripley': {
    body: 'humanoid', height: 1.0, bulk: 0.95,
    colors: { skin: 0xd8a878, suit: 0x6a6a72, accent: 0xe8722a, eyes: 0x446688 },
    head: { type: 'bare', color: 0xd8a878 },
    attachments: [{ type: 'blaster', side: 'right', color: 0xffcc33 }],
  },
  'neo': {
    body: 'humanoid', height: 1.02, bulk: 0.95,
    colors: { skin: 0xd8a878, suit: 0x0c0c0e, accent: 0x33ff66, eyes: 0x111111 },
    head: { type: 'bare', detail: 'visor' }, // sunglasses
    effects: [{ type: 'particles', color: 0x33ff66 }], // matrix code rain
  },

  // ------------------------------------------------ DINOS
  't-rex': {
    body: 'dino', height: 1.6, bulk: 1.3,
    colors: { skin: 0x5a6b3a, suit: 0x4a5a30, accent: 0xd8cc88, eyes: 0xffcc00 },
    head: { type: 'bare' },
  },
  'raptor-swift': {
    body: 'dino', height: 1.05, bulk: 0.85,
    colors: { skin: 0x7a5a34, suit: 0x6a4e2c, accent: 0x44ddff, eyes: 0xffcc00 },
    head: { type: 'bare' },
    effects: [{ type: 'particles', color: 0x88ccff }], // speed trail
  },
  'raptor-claw': {
    body: 'dino', height: 1.1, bulk: 0.9,
    colors: { skin: 0x8a3a2a, suit: 0x7a3222, accent: 0xff6622, eyes: 0xffcc00 },
    head: { type: 'bare' },
  },
  'raptor-fang': {
    body: 'dino', height: 1.0, bulk: 0.8,
    colors: { skin: 0x3a5a6a, suit: 0x324e5c, accent: 0x88ffcc, eyes: 0xffcc00 },
    head: { type: 'bare' },
  },

  // ------------------------------------------------ GHOSTBUSTERS
  'peter-venkman': {
    body: 'humanoid', height: 1.0, bulk: 0.95,
    colors: { skin: 0xd8a878, suit: 0xa89878, accent: 0xcc2222, eyes: 0x446688 },
    head: { type: 'bare' },
    attachments: [
      { type: 'proton-pack', side: 'back' },
      { type: 'ghost-trap', side: 'left' },
    ],
  },
  'ray-stantz': {
    body: 'humanoid', height: 0.98, bulk: 1.05,
    colors: { skin: 0xd8a878, suit: 0xa89878, accent: 0xcc2222, eyes: 0x446688 },
    head: { type: 'cap', color: 0x6b5a3a },
    attachments: [
      { type: 'proton-pack', side: 'back' },
      { type: 'ghost-trap', side: 'left' },
    ],
  },
  'egon-spengler': {
    body: 'humanoid', height: 1.02, bulk: 0.9,
    colors: { skin: 0xd8c8a8, suit: 0xa89878, accent: 0xcc2222, eyes: 0x446688 },
    head: { type: 'bare', detail: 'visor' }, // glasses
    attachments: [
      { type: 'proton-pack', side: 'back' },
      { type: 'ghost-trap', side: 'left' },
    ],
  },
  'winston-zeddemore': {
    body: 'humanoid', height: 1.0, bulk: 1.05,
    colors: { skin: 0x8a5a34, suit: 0xa89878, accent: 0xcc2222, eyes: 0x332211 },
    head: { type: 'cap', color: 0x3a3a3a },
    attachments: [
      { type: 'proton-pack', side: 'back' },
      { type: 'ghost-trap', side: 'left' },
    ],
  },
  'slimer': {
    body: 'blob', height: 1.0, bulk: 1.1,
    colors: { skin: 0x44cc44, suit: 0x33aa33, accent: 0x88ff88, eyes: 0xffffff },
    head: { type: 'bare' },
    effects: [{ type: 'slime', color: 0x55ee55 }],
  },
  'stay-puft': {
    body: 'giant', height: 1.7, bulk: 1.35,
    colors: { skin: 0xf0f0f0, suit: 0xe8e8e8, accent: 0x2255aa, eyes: 0x334455 },
    head: { type: 'cap', color: 0xf0f0f0 }, // sailor cap
    effects: [{ type: 'glow', color: 0xffffff }],
  },

  // ------------------------------------------------ TOONS
  'bugs-bunny': {
    body: 'small', height: 0.8, bulk: 0.85,
    colors: { skin: 0x9a9aa0, suit: 0x8a8a90, accent: 0xffffff, eyes: 0x222222 },
    head: { type: 'bare', detail: 'rabbit-ears' },
    attachments: [{ type: 'carrot', side: 'right' }],
  },
  'tasmanian-devil': {
    body: 'humanoid', height: 0.85, bulk: 1.25,
    colors: { skin: 0x6b4a2e, suit: 0x5a3d26, accent: 0xd8b088, eyes: 0xffdd00 },
    head: { type: 'bare' },
    effects: [{ type: 'particles', color: 0x8a6a4a }], // dust whirl
    stance: { armSpread: 0.6, crouch: 0.2 },
  },

  // ------------------------------------------------ MARVEL
  'hulk': {
    body: 'bulky', height: 1.35, bulk: 1.5,
    colors: { skin: 0x3a8a3a, suit: 0x5a2a6a, accent: 0x2a6a2a, eyes: 0x111111 },
    head: { type: 'bare' },
    stance: { armSpread: 0.5, crouch: 0.15 },
  },
  'deadpool': {
    body: 'humanoid', height: 1.0, bulk: 1.0,
    colors: { skin: 0xcc2222, suit: 0xb02020, accent: 0x1a1a1a, eyes: 0xffffff },
    head: { type: 'mask', color: 0xb02020 },
    // Dual-wield law: twin katanas, one per hand (was one katana + a knife).
    attachments: [
      { type: 'katana', side: 'right' },
      { type: 'katana', side: 'left' },
    ],
  },
  'wolverine': {
    body: 'humanoid', height: 0.95, bulk: 1.15,
    colors: { skin: 0xd8a878, suit: 0xd8a020, accent: 0x1a2a6a, eyes: 0x111111 },
    head: { type: 'mask', color: 0x1a2a6a }, // blue cowl
    attachments: [
      { type: 'claws', side: 'right', color: 0xd8dce4 },
      { type: 'claws', side: 'left', color: 0xd8dce4 },
    ],
  },
  'thanos': {
    body: 'bulky', height: 1.25, bulk: 1.4,
    colors: { skin: 0x6a4a8a, suit: 0x2a2a4a, accent: 0xc8a020, eyes: 0xffdd44 },
    head: { type: 'bare' },
    effects: [{ type: 'glow', color: 0xcc88ff }],
  },
  'iron-man': {
    body: 'humanoid', height: 1.0, bulk: 1.05,
    colors: { skin: 0xb02020, suit: 0xa01818, accent: 0xd8a020, eyes: 0x88ccff },
    head: { type: 'helmet', color: 0xa01818, detail: 'visor' }, // gold faceplate visor
    effects: [ // twin repulsors, one per palm (dual-wield law)
      { type: 'glow', color: 0x66ccff, anchor: 'hand' },
      { type: 'glow', color: 0x66ccff, anchor: 'handL' },
    ],
  },

  // ------------------------------------------------ FINAL FANTASY
  'cloud-strife': {
    body: 'humanoid', height: 1.0, bulk: 0.95,
    colors: { skin: 0xd8a878, suit: 0x2a2a5a, accent: 0x8a8ab0, eyes: 0x33aaff },
    head: { type: 'bare', color: 0xd8a878 },
    attachments: [{ type: 'buster-sword', side: 'back' }],
  },
  'sephiroth': {
    body: 'humanoid', height: 1.15, bulk: 0.9,
    colors: { skin: 0xd8c8b8, suit: 0x0c0c10, accent: 0x8a8aa0, eyes: 0x44ff88 },
    head: { type: 'bare', color: 0xd8d8e0 }, // silver hair approximated via head color
    attachments: [{ type: 'masamune', side: 'right' }],
    effects: [{ type: 'particles', color: 0x664488 }],
  },
  'tifa-lockhart': {
    body: 'humanoid', height: 1.0, bulk: 0.9,
    colors: { skin: 0xd8a878, suit: 0xe8e8e8, accent: 0xcc2222, eyes: 0x882222 },
    head: { type: 'bare', color: 0x1a1a1a }, // dark hair
    attachments: [ // dual-wield law: fighting gloves on BOTH hands
      { type: 'gloves', side: 'right', color: 0xcc2222 },
      { type: 'gloves', side: 'left', color: 0xcc2222 },
    ],
    effects: [{ type: 'glow', color: 0xff4444 }],
  },

  // ------------------------------------------------ MONSTERS VS ALIENS
  'bob-blob': {
    body: 'blob', height: 1.05, bulk: 1.2,
    colors: { skin: 0x3388cc, suit: 0x2a76b8, accent: 0x88ccff, eyes: 0xffffff },
    head: { type: 'bare' },
    effects: [{ type: 'slime', color: 0x55aaff }],
  },
  'missing-link': {
    body: 'humanoid', height: 1.05, bulk: 1.1,
    colors: { skin: 0x3a8a7a, suit: 0x2a6a5a, accent: 0x88ddcc, eyes: 0xffdd44 },
    head: { type: 'bare' },
    effects: [{ type: 'particles', color: 0x66ccff }],
  },
  'dr-cockroach': {
    body: 'humanoid', height: 0.9, bulk: 0.9,
    colors: { skin: 0x6b4a2a, suit: 0xe8e8e8, accent: 0x44aaff, eyes: 0x111111 },
    head: { type: 'bare', detail: 'visor' }, // goggles
    effects: [{ type: 'electricity', color: 0x66ccff }],
  },
  // ------------------------------------------------ HAWKINS (2026-10-22 wave)
  // Procedural fallback specs for Merlin's 16 Studio-rigged fighters;
  // colors deliberately match each fighter's GLB tint in the bridge.
  'eddie-munson': {
    body: 'humanoid', height: 1.0, bulk: 0.9,
    colors: { skin: 0xc9a180, suit: 0x3a3f4a, accent: 0x7a4a2b, eyes: 0x2a1a0a },
    head: { type: 'bare' }, // wild curls; spiked bat in hand
    attachments: [{ type: 'baseball-bat', side: 'right' }],
  },
  'eleven': {
    body: 'humanoid', height: 0.92, bulk: 0.8,
    colors: { skin: 0xd8b8a8, suit: 0x5a6a7a, accent: 0xb98a94, eyes: 0x1a0f0a },
    head: { type: 'bare' }, // buzz cut; the glow is the tell
    effects: [{ type: 'glow', color: 0xb98a94 }],
  },
  'jim-hopper': {
    body: 'bulky', height: 1.05, bulk: 1.1,
    colors: { skin: 0xc9a180, suit: 0x6a5a3a, accent: 0x8a6d3f, eyes: 0x1a1a1a },
    head: { type: 'cap', color: 0x8a6d3f, detail: 'stubble' }, // sheriff's hat
    attachments: [{ type: 'blaster', side: 'right' }], // pump shotgun, approximated
  },
  'vecna': {
    body: 'humanoid', height: 1.15, bulk: 0.95,
    colors: { skin: 0x7d4b3a, suit: 0x4a2e22, accent: 0x8a1a1a, eyes: 0xff3020 },
    head: { type: 'bare' }, // vine-wrapped revenant
    effects: [{ type: 'glow', color: 0x8a1a1a }],
  },
  'demogorgon': {
    body: 'humanoid', height: 1.1, bulk: 1.0,
    colors: { skin: 0x6b5d4f, suit: 0x5a4f45, accent: 0x8a2a2a, eyes: 0x000000 },
    head: { type: 'bare' }, // the petal maw is the silhouette
    attachments: [
      { type: 'claws', side: 'right' },
      { type: 'claws', side: 'left' },
    ],
  },
  'demobats': {
    body: 'blob', height: 0.85, bulk: 1.1,
    colors: { skin: 0x3d4451, suit: 0x2e3440, accent: 0x707a8a, eyes: 0xffdd44 },
    head: { type: 'bare' }, // a swarm mass, not a body
    effects: [{ type: 'particles', color: 0x3d4451 }],
  },
  'mind-flayer': {
    body: 'giant', height: 1.5, bulk: 1.1,
    colors: { skin: 0x4b3a63, suit: 0x3a2e4f, accent: 0x6a4a8a, eyes: 0xffaa33 },
    head: { type: 'bare' }, // crown of tendrils
    effects: [{ type: 'particles', color: 0x4b3a63 }],
  },
  'mind-flayer-hybrid': {
    body: 'humanoid', height: 1.2, bulk: 1.0,
    colors: { skin: 0x7a3550, suit: 0x4f2e3a, accent: 0xc02040, eyes: 0xff5030 },
    head: { type: 'bare' },
    effects: [{ type: 'glow', color: 0xc02040 }], // the red aura (Merlin's spec)
  },
  // ------------------------------------------------ OPERATIVES (2026-10-22 wave)
  'bounty-hunter': {
    body: 'humanoid', height: 1.0, bulk: 1.0,
    colors: { skin: 0x9a5a2e, suit: 0x5e4a3a, accent: 0xb06a2e, eyes: 0x111111 },
    head: { type: 'helmet', color: 0x6a6a72 }, // T-slit visor
    attachments: [{ type: 'blaster', side: 'right' }],
  },
  'cybernetic-soldier': {
    body: 'bulky', height: 1.05, bulk: 1.1,
    colors: { skin: 0x8a7a6a, suit: 0x3f5a5e, accent: 0xc02020, eyes: 0xff2020 },
    head: { type: 'helmet', color: 0x3f5a5e, detail: 'visor-red' },
    attachments: [{ type: 'blaster', side: 'right' }], // integral arm cannon, approximated
  },
  'cyberpunk-operative': {
    body: 'humanoid', height: 0.98, bulk: 0.85,
    colors: { skin: 0xd8a888, suit: 0x2a2a3a, accent: 0x8e3a6e, eyes: 0x33ffee },
    head: { type: 'bare' },
    attachments: [{ type: 'knife', side: 'right' }], // monowire, approximated as a blade
    effects: [{ type: 'glow', color: 0x8e3a6e }],
  },
  'futuristic-female-operative': {
    body: 'humanoid', height: 1.0, bulk: 0.85,
    colors: { skin: 0xd8b8a0, suit: 0xe8e8ee, accent: 0x7d7fa8, eyes: 0x2244aa },
    head: { type: 'bare' },
    attachments: [{ type: 'blaster', side: 'right' }], // pulse sidearm
  },
  'post-apocalyptic': {
    body: 'bulky', height: 1.05, bulk: 1.15,
    colors: { skin: 0xb08050, suit: 0x6e6a45, accent: 0x8a5a2a, eyes: 0x2a1a0a },
    head: { type: 'bare' },
    attachments: [{ type: 'hammer', side: 'right' }], // scrap hammer
  },
  'space-marine': {
    body: 'bulky', height: 1.2, bulk: 1.35,
    colors: { skin: 0xc9a180, suit: 0x3a4f7d, accent: 0xc8a020, eyes: 0x1a1a1a },
    head: { type: 'helmet', color: 0x3a4f7d },
    attachments: [{ type: 'blaster', side: 'right' }], // bolter rifle, approximated
  },
  'tactical-hitman': {
    body: 'humanoid', height: 1.0, bulk: 0.9,
    colors: { skin: 0xd8b898, suit: 0x1c1c22, accent: 0x5e2f35, eyes: 0x2a2a2a },
    head: { type: 'bare' }, // bald, barcode, perfect suit
    attachments: [{ type: 'blaster', side: 'right' }], // Silverballer
  },
  'tactical-soldier': {
    body: 'humanoid', height: 1.0, bulk: 1.0,
    colors: { skin: 0xa87850, suit: 0x4d5e3a, accent: 0x2e3a22, eyes: 0x1a1a1a },
    head: { type: 'helmet', color: 0x4d5e3a },
    attachments: [{ type: 'blaster', side: 'right' }], // assault rifle, approximated
  },
};

export const FIGHTER_IDS = Object.keys(VISUALS);
export const FIGHTER_COUNT = FIGHTER_IDS.length;
