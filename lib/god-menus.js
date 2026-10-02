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
// Category framework restructured 2026-10-01 (Merlin + Gemini strategy):
// programs aligned to their gods' domains — 20 moves, 135 total, keys/routes
// unchanged. The 3D orbit bands follow automatically via godMenuFor().
//
// `texture` points at public/textures/menus/<god>/banner.* imported as-is
// from Merlin's highland88999-commits repos. Null until the import lands;
// the UI falls back to the honest CSS gradient in `gradient`.
//
// `menuArt` points at the Merlin-generated menu art (2026-10-01 transfer):
// public/images/menu/banners/banner-<god>.webp. MenuBanner prefers menuArt,
// then texture, then the gradient. Program buttons use menuArtFor(key) ->
// public/images/menu/programs/<key>.webp.

export const GOD_MENUS = [
  {
    god: 'ARES',
    category: 'Battle, Competition & Defense',
    tagline: 'Weapons, combat, aggressive sports, and threat monitoring.',
    texture: '/textures/menus/ares/banner.jpg',
    menuArt: '/images/menu/banners/banner-ares.webp',
    gradient: ['#7f1d1d', '#1c0a0a'],
    accent: 'red',
    satellites: [
      'battleship', 'colosseum', 'excalibur', 'guillotine', 'basketball',
      'enyo', 'astra', 'zeus-protocol', 'starblood', 'arachnid-weaver',
      'ares',
    ],
  },
  {
    god: 'APOLLO',
    category: 'Music, Arts & Exhibitions',
    tagline: 'Audio, light, projections, and creative galleries.',
    texture: '/textures/menus/apollo/banner.jpeg',
    menuArt: '/images/menu/banners/banner-apollo.webp',
    gradient: ['#a16207', '#1c1005'],
    accent: 'amber',
    satellites: [
      'maestro', 'persymphony', 'convergence', 'nexus-symbiote', 'loki',
      'hyperion-gravitas', 'light-particle-engine', 'vortex', 'statue-of-liberty', 'architectural-legacy',
      'museum', 'persephone',
    ],
  },
  {
    god: 'HERMES',
    category: 'Transit, Comms & Shopping',
    tagline: 'Navigation, fleet movement, communication lines, and commerce.',
    texture: '/textures/menus/hermes/banner.jpeg',
    menuArt: '/images/menu/banners/banner-hermes.webp',
    gradient: ['#8a6a1f', '#1c1305'],
    accent: 'gold',
    satellites: [
      // Merlin's direction 2026-09-30: Hermes' landing as he made it — the paid
      // directory (/hermes) leads; the Omega Store is the shopping program under it.
      'hermes', 'store', 'phone-home', 'argo', 'to-infinity-and-beyond',
      'omega-postal', 'venus-wifi', 'nexus-vortex', 'olympus-map-node', 'flying-dutchman',
      'prime',
    ],
  },
  {
    god: 'HEPHAESTUS',
    category: 'Forge, Craft & Building',
    tagline: 'Coding, metalworking, engineering, tools, and architecture.',
    texture: '/textures/menus/hephaestus/banner.jpeg',
    menuArt: '/images/menu/banners/banner-hephaestus.webp',
    gradient: ['#9a3412', '#1c0f08'],
    accent: 'orange',
    satellites: [
      'forge', 'hephaestus', 'nexus-model-generation', 'manuscript-forge', 'mordor-smelting',
      'prometheus', 'blueprint-protocol', 'housing-architecture', 'world-engine', 'resume',
      'tools', 'terminal', 'waste-extraction', 't-1000', 'atlantis',
    ],
  },
  {
    god: 'ATHENA',
    category: 'Wisdom, Strategy & Systems',
    tagline: 'Knowledge archives, pure logic, data structures, and puzzles.',
    texture: '/textures/menus/athena/banner.jpeg',
    menuArt: '/images/menu/banners/banner-athena.webp',
    gradient: ['#1e3a8a', '#0b1026'],
    accent: 'indigo',
    satellites: [
      'alexandria', 'human-ai', 'olympian-education', 'iq-test', 'playbook',
      'nv2-video-library', 'omega-mind', 'hitchhikers-guide', 'meet-the-gods', 'labyrinth',
      'data-management', 'holoframe', 'cerberus', 'fortress-of-solitude', 'chess',
      'nexus-codex',
    ],
  },
  {
    god: 'ARTEMIS',
    category: 'Space, The Wilds & Exploration',
    tagline: 'Nature, weather, environments, planets, and deep-space realms.',
    texture: '/textures/menus/artemis/banner.jpg',
    menuArt: '/images/menu/banners/banner-artemis.webp',
    gradient: ['#134e4a', '#04211f'],
    accent: 'teal',
    satellites: [
      'artemis', 'artemis-hub', 'architect-artemis', 'hercules', 'tree',
      'beekeeper', 'mount-olympus', 'aethelgard', 'the-big-bang', 'tornado',
      'lightning-bolt', 'olympus-eclipse', 'olympus-aetheris', 'aquarium', 'aetheris',
      'abyssal-voyage', 'nova', 'myriad', 'erebus', 'bearth',
      'planet-x', 'pearl', 'mount-doom',
    ],
  },
  {
    god: 'HESTIA',
    category: 'Life, Healing & Sanctuary',
    tagline: 'Inner reflection, the soul, health, and passages.',
    texture: '/textures/menus/hestia/banner.jpeg',
    menuArt: '/images/menu/banners/banner-hestia.webp',
    gradient: ['#78350f', '#1f130a'],
    accent: 'yellow',
    satellites: [
      'medusa-lair', 'anti-life', 'grief-gully', 'life', 'magic-mirror',
      'meaning-of-life', 'rem', 'the-afterlife', 'styx', 'underworld-awakening',
      'hygieia',
    ],
  },
  {
    god: 'DIONYSUS',
    category: 'Thrills, Play & Entertainment',
    tagline: 'Arcades, racing, venues, and game libraries.',
    texture: '/textures/menus/dionysus/banner.jpeg',
    menuArt: '/images/menu/banners/banner-dionysus.webp',
    gradient: ['#6b21a8', '#1a0b2e'],
    accent: 'purple',
    satellites: [
      'dk-hero', 'ice-dragon', 'ice-monster', 'luge', 'neon-racer',
      'raptor-rush', 'rogers-arena', 'browsers-castle', 'gym-equipment', 'orbital-ascent',
      'air-hockey', 'omega-pinball', 'zeus-v-hades', 'underworld',
    ],
  },
  {
    god: 'PLUTUS',
    category: 'Wealth, Trade & Resources',
    tagline: 'Finance, auctions, ledgers, grids, and economies.',
    texture: '/textures/menus/plutus/banner.jpeg',
    menuArt: '/images/menu/banners/banner-plutus.webp',
    gradient: ['#14532d', '#0a1f12'],
    accent: 'green',
    satellites: [
      'plutus', 'liquid-gold', 'auction-house', 'olympus', 'olympus-b2b',
      'project-khaos', 'referral-system', 'merlin-mandates', 'olympus-energy',
    ],
  },
  {
    god: 'APHRODITE',
    category: 'People, Community & Cities',
    tagline: 'Social hubs, profiles, metropolis infrastructure, and hives.',
    texture: '/textures/menus/aphrodite/banner.jpeg',
    menuArt: '/images/menu/banners/banner-aphrodite.webp',
    gradient: ['#9d174d', '#20060f'],
    accent: 'pink',
    satellites: [
      'agora', 'truman', 'mega-city', 'babel', 'skyscraper',
      'omegalodon', 'omega-hub', 'omega', 'omega-mansion', 'user-profile',
      'profile', 'hive', 'beehive',
    ],
  }
];

/** Find the god menu that owns a satellite key (or null). */
export function godMenuFor(satelliteKey) {
  return GOD_MENUS.find((m) => m.satellites.includes(satelliteKey)) || null;
}

/** Flat list of every satellite key claimed by the god menus. */
export function allGodMenuSatellites() {
  return GOD_MENUS.flatMap((m) => m.satellites);
}

/** Banner art for a god menu (Merlin's 2026-10-01 transfer set). */
export function menuBannerFor(god) {
  return `/images/menu/banners/banner-${String(god).toLowerCase()}.webp`;
}

/** Button art for a program/satellite key (Merlin's 2026-10-01 transfer set). */
export function menuArtFor(satelliteKey) {
  return `/images/menu/programs/${satelliteKey}.webp`;
}
