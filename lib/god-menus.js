// lib/god-menus.js
// The 11 god menus — the NAVIGATION layer of the Nexus launcher.
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
      'museum',
    ],
  },
  {
    god: 'HERMES',
    category: 'Shopping',
    tagline:
      "Hermes' merchant row: the Omega Store, paid listings, and goods from across the Nexus — plus his old travel and message routes.",
    texture: '/textures/menus/hermes/banner.jpeg',
    gradient: ['#8a6a1f', '#1c1305'],
    accent: 'gold',
    satellites: [
      // Merlin's direction 2026-09-30: Hermes' landing as he made it — the paid
      // directory (/hermes) leads; the Omega Store is the shopping program under it.
      'hermes', 'store', 'phone-home', 'order-67', 'argo', 'tidal-rush', 'nova', 'myriad', 'erebus',
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
      'geometry-engine', 'publisher-studio', 'planet-tech', 'new-earth',
      'cloud-phone', 'world-nexus',
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
      'fortress-of-solitude', 'trifold', 'oracle', 'renewal-plan', 'languages',
      'dream-engine',
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
      'underworld-awakening', 'hygieia',
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
      'hawkins', 'star-wars', 'middle-earth',
      'dk-hero', 'ice-dragon', 'ice-monster', 'luge', 'neon-racer', 'neon-void', 'swamp-run',
      'tetrus', 
      'raptor-rush', 'rogers-arena', 'hive', 'browsers-castle',
      'gym-equipment', 'orbital-ascent', 'beehive', 'atlantis',
      'persephone', 'live-recordings', 'undulatus',
      'shadow-realm', 'kombat',
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
      'affiliates', 'plutus', 'liquid-gold', 'auction-house', 'olympus', 'olympus-b2b',
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
      'agora', 'truman', 'mega-city', 'babel', 'skyscraper', 'omegalodon', 'omega-hub',
      'omega', 'omega-mansion', 'user-profile', 'profile',
    ],
  },
  {
    god: 'UTILITIES',
    category: 'Utilities',
    tagline: 'Everyday tools: notes, a calculator, a calendar, and handy helpers.',
    texture: null,
    gradient: ['#1d4ed8', '#0a1120'],
    accent: 'indigo',
    satellites: [
      'notepad', 'calculator', 'calendar',
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

/**
 * Banner art for a god's category rail tab — Merlin's transfer art.
 * Returns the god's `texture` from GOD_MENUS (e.g. ares → banner.jpg,
 * the rest → banner.jpeg). Unknown/non-string god → '' — the caller's
 * <img onError> hides it and the tab falls back to its plain style,
 * so a bad key never breaks the menu.
 */
export function menuBannerFor(god) {
  if (typeof god !== 'string' || !god) return '';
  const menu = GOD_MENUS.find((m) => m.god === god);
  return (menu && typeof menu.texture === 'string' && menu.texture) || '';
}

/**
 * Row art for a satellite — Merlin's 2026-10-01 Menu Art Transfer art.
 * Convention: /images/menu/programs/<satKey>.webp (batch 1, 135 programs).
 * A missing file 404s → the caller's <img onError> hides it and the row
 * falls back to its plain style, so unwired art never breaks the menu.
 * Non-string/empty key → ''.
 */
export function menuArtFor(satKey) {
  if (typeof satKey !== 'string' || !satKey) return '';
  return `/images/menu/programs/${satKey}.webp`;
}

/**
 * Sub-menu option art — Merlin's 2026-10-04 Menu Art Transfer batch 2.
 * Convention: /images/menu/submenu/<subKey>.webp (108 sub-menu slots:
 * agora sections, argo destinations + fleet, babel sections, program
 * sub-options, skyscraper zones, world-engine sectors).
 * Same graceful-fallback contract as menuArtFor.
 */
export function submenuArtFor(subKey) {
  if (typeof subKey !== 'string' || !subKey) return '';
  return `/images/menu/submenu/${subKey}.webp`;
}

/**
 * Shadow Realm ride-control glyphs + menu background — transfer batch 2.
 * Convention: /images/shadow-realm/ui/<key>.webp
 * (tron-gas, tron-brake, tron-steer-left, tron-steer-right, tron-boost,
 * tron-recenter, tron-pause, tron-leave, tron-menu-bg).
 */
export function tronUiArtFor(key) {
  if (typeof key !== 'string' || !key) return '';
  return `/images/shadow-realm/ui/${key}.webp`;
}

/**
 * Trim-bike skin art — transfer batch 2 vehicle-skin wraps.
 * Convention: /images/shadow-realm/skins/<key>.webp (9 skins).
 */
export function bikeSkinArtFor(key) {
  if (typeof key !== 'string' || !key) return '';
  return `/images/shadow-realm/skins/${key}.webp`;
}

/**
 * Museum photo art — transfer batch 2 (rebuilt museum, Gemini pieces only).
 * Convention: /images/museum/photos/<key>.webp
 */
export function museumPhotoArtFor(key) {
  if (typeof key !== 'string' || !key) return '';
  return `/images/museum/photos/${key}.webp`;
}

/**
 * Museum concept films — transfer batch 2.
 * Convention: /textures/museum/videos/<key>.mp4
 */
export function museumVideoFor(key) {
  if (typeof key !== 'string' || !key) return '';
  return `/textures/museum/videos/${key}.mp4`;
}
