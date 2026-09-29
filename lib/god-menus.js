// lib/god-menus.js
// The 10 god menus — the NAVIGATION layer of the Nexus launcher.
// Each menu is named for a god relevant to its field, with a plain-English
// category label that tells a normal person what's inside.
//
// This is separate from the 3D grouping layer: constellations (ZEUS, ARES,
// THOTH, ARGUS, MEDUSA, ARTEMIS in lib/i18n/satellites.ts) still drive the
// 3D hub positions via POS_MAP. God menus only organize navigation.
// Every satellite lives in exactly one god menu — see tests/god-menus.test.js.
//
// `texture` points at public/textures/menus/<god>/banner.* imported as-is
// from Merlin's highland88999-commits repos. Null until the import lands;
// the UI falls back to the honest CSS gradient in `gradient`.

export const GOD_MENUS = [
  {
    god: 'ARES',
    category: 'Battle & Competition',
    tagline: 'Head-to-head games: chess, shooters, sports, and arena battles.',
    texture: '/textures/menus/ares/banner.jpg',
    gradient: ['#7f1d1d', '#1c0a0a'],
    accent: 'red',
    satellites: [
      'chess', 'battleship', 'colosseum', 'excalibur', 'guillotine',
      'zeus-v-hades', 'basketball', 'air-hockey', 'omega-pinball', 'enyo',
      'astra', 'zeus-protocol', 'starblood', 'arachnid-weaver',
    ],
  },
  {
    god: 'APOLLO',
    category: 'Music & Arts',
    tagline: 'Make music, play with light, and explore visual art toys.',
    texture: '/textures/menus/apollo/banner.jpeg',
    gradient: ['#a16207', '#1c1005'],
    accent: 'amber',
    satellites: [
      'maestro', 'persymphony', 'convergence', 'nexus-symbiote', 'loki',
      'hyperion-gravitas', 'light-particle-engine', 'vortex',
      'statue-of-liberty', 'architectural-legacy', 't-1000', 'pearl',
    ],
  },
  {
    god: 'HERMES',
    category: 'Travel, Flight & Messages',
    tagline: 'Fly between worlds, voyage far, and stay in touch.',
    texture: '/textures/menus/hermes/banner.jpeg',
    gradient: ['#0c4a6e', '#082f49'],
    accent: 'sky',
    satellites: [
      'hermes', 'phone-home', 'argo', 'nova', 'myriad',
      'to-infinity-and-beyond', 'omega-postal', 'venus-wifi', 'bearth',
      'planet-x', 'nexus-vortex', 'olympus-map-node', 'flying-dutchman',
    ],
  },
  {
    god: 'HEPHAESTUS',
    category: 'Forge, Craft & Building',
    tagline: 'Build things: code, 3D models, writing, and living spaces.',
    texture: '/textures/menus/hephaestus/banner.jpeg',
    gradient: ['#9a3412', '#1c0f08'],
    accent: 'orange',
    satellites: [
      'forge', 'hephaestus', 'nexus-model-generation', 'manuscript-forge',
      'nexus-codex', 'mordor-smelting', 'prometheus', 'blueprint-protocol',
      'housing-architecture', 'world-engine', 'resume', 'tools', 'terminal',
      'mount-doom', 'waste-extraction', 'prime',
    ],
  },
  {
    god: 'ATHENA',
    category: 'Wisdom & Systems',
    tagline: 'Learn, read, and run smart systems — knowledge and know-how.',
    texture: '/textures/menus/athena/banner.jpeg',
    gradient: ['#1e3a8a', '#0b1026'],
    accent: 'indigo',
    satellites: [
      'alexandria', 'human-ai', 'olympian-education', 'iq-test', 'playbook',
      'nv2-video-library', 'omega-mind', 'hitchhikers-guide', 'meet-the-gods',
      'labyrinth', 'data-management', 'holoframe', 'cerberus', 'ares',
      'fortress-of-solitude',
    ],
  },
  {
    god: 'ARTEMIS',
    category: 'Space, Wilds & Exploration',
    tagline: 'Explore planets, storms, forests, and the night sky.',
    texture: '/textures/menus/artemis/banner.jpg',
    gradient: ['#134e4a', '#04211f'],
    accent: 'teal',
    satellites: [
      'artemis', 'artemis-hub', 'architect-artemis', 'hercules', 'tree',
      'beekeeper', 'mount-olympus', 'aethelgard', 'the-big-bang', 'tornado',
      'lightning-bolt', 'olympus-eclipse', 'olympus-aetheris', 'aquarium',
      'aetheris', 'abyssal-voyage',
    ],
  },
  {
    god: 'HESTIA',
    category: 'Life, Healing & Home',
    tagline: 'Slow down: reflection, healing, dreams, and the big questions.',
    texture: '/textures/menus/hestia/banner.jpeg',
    gradient: ['#78350f', '#1f130a'],
    accent: 'yellow',
    satellites: [
      'medusa-lair', 'anti-life', 'grief-gully', 'life', 'magic-mirror',
      'meaning-of-life', 'rem', 'the-afterlife', 'styx', 'underworld',
      'underworld-awakening',
    ],
  },
  {
    god: 'DIONYSUS',
    category: 'Thrills & Play',
    tagline: 'Pure fun: racing, climbing, arcade rides, and wild worlds.',
    texture: '/textures/menus/dionysus/banner.jpeg',
    gradient: ['#6b21a8', '#1a0b2e'],
    accent: 'purple',
    satellites: [
      'dk-hero', 'ice-dragon', 'ice-monster', 'luge', 'neon-racer',
      'raptor-rush', 'rogers-arena', 'hive', 'browsers-castle',
      'gym-equipment', 'orbital-ascent', 'beehive', 'atlantis',
      'persephone',
    ],
  },
  {
    god: 'PLUTUS',
    category: 'Wealth & Trade',
    tagline: 'Money, gold, stores, and markets — the treasure rooms.',
    texture: '/textures/menus/plutus/banner.jpeg',
    gradient: ['#14532d', '#0a1f12'],
    accent: 'green',
    satellites: [
      'plutus', 'liquid-gold', 'auction-house', 'olympus', 'olympus-b2b',
      'project-khaos', 'referral-system', 'merlin-mandates', 'olympus-energy',
    ],
  },
  {
    god: 'APHRODITE',
    category: 'People & Community',
    tagline: 'Gather: town squares, shared worlds, and your identity.',
    texture: '/textures/menus/aphrodite/banner.jpeg',
    gradient: ['#9d174d', '#20060f'],
    accent: 'pink',
    satellites: [
      'agora', 'truman', 'mega-city', 'babel', 'omegalodon', 'omega-hub',
      'omega', 'omega-mansion', 'user-profile', 'profile',
    ],
  },
];

/** Find the god menu that owns a satellite key (or null). */
export function godMenuFor(satelliteKey) {
  return GOD_MENUS.find((m) => m.satellites.includes(satelliteKey)) || null;
}

/** Flat list of every satellite key claimed by the god menus. */
export function allGodMenuSatellites() {
  return GOD_MENUS.flatMap((m) => m.satellites);
}
