// lib/portal-videos.js
// PORTAL VIDEO PRESENCE — which programs' portals have their video.
//
// The files themselves are the truth: a program has a portal video
// when public/videos/portals/<key>.mp4 exists (produced through the
// Omega Portal Videos queue and wired in there). This module is the
// one list every portal surface reads that truth through — when a
// video is wired, its file lands in public/videos/portals/ and its
// key joins PORTAL_VIDEO_KEYS below; tests/concourse-portals.test.mjs
// pins this list to the directory on disk, so the two can never
// silently drift apart.
//
// Pure data + pure helpers — no imports — so node tests exercise it
// directly, like lib/portal-roster.js.

// One entry per file in public/videos/portals/, alphabetical.
export const PORTAL_VIDEO_KEYS = Object.freeze([
  'abyssal-voyage',
  'aethelgard',
  'aetheris',
  'affiliates',
  'agent-engine',
  'agora',
  'air-hockey',
  'alexandria',
  'annwn',
  'aquarium',
  'arachnid-weaver',
  'architect-artemis',
  'architectural-legacy',
  'argo',
  'artemis',
  'artemis-hub',
  'astra',
  'atlantis',
  'auction-house',
  'babel',
  'basketball',
  'battleship',
  'bearth',
  'beehive',
  'beekeeper',
  'blueprint-protocol',
  'browsers-castle',
  'calculator',
  'calendar',
  'cerberus',
  'chess',
  'cloud-gaming',
  'cloud-phone',
  'collapse-run',
  'colosseum',
  'convergence',
  'data-management',
  'diyu',
  'dk-hero',
  'dream-engine',
  'duat',
  'earth-4',
  'enyo',
  'erebus',
  'excalibur',
  'flying-dutchman',
  'forge',
  'fortress-of-solitude',
  'ghost-rider',
  'guillotine',
  'gym-equipment',
  'hawkins',
  'helheim',
  'hell',
  'hephaestus',
  'hercules',
  'hermes',
  'hitchhikers-guide',
  'hive',
  'hollow-earth',
  'holoframe',
  'housing-architecture',
  'human-ai',
  'hyperion-gravitas',
  'ice-dragon',
  'ice-monster',
  'iq-test',
  'jupiter-2',
  'keepsake',
  'kombat',
  'kur',
  'labyrinth',
  'light-particle-engine',
  'lightning-bolt',
  'liquid-gold',
  'live-recordings',
  'loki',
  'luge',
  'maestro',
  'manuscript-forge',
  'mars',
  'mars-2',
  'meet-the-gods',
  'mega-city',
  'merlin-mandates',
  'merlins-agent',
  'mictlan',
  'middle-earth',
  'mordor-smelting',
  'mount-doom',
  'mount-olympus',
  'myriad',
  'naraka',
  'nav',
  'neon-racer',
  'neon-void',
  'nether-realm',
  'new-earth',
  'nexus-codex',
  'nexus-model-generation',
  'nexus-symbiote',
  'nexus-vortex',
  'notepad',
  'nova',
  'nv2-video-library',
  'olympian-education',
  'olympus',
  'olympus-aetheris',
  'olympus-b2b',
  'olympus-eclipse',
  'olympus-energy',
  'olympus-map-node',
  'omega',
  'omega-500',
  'omega-hub',
  'omega-mansion',
  'omega-mind',
  'omega-pinball',
  'omega-postal',
  'omegalodon',
  'oracle',
  'orbital-ascent',
  'order-67',
  'orun',
  'pearl',
  'persephone',
  'persymphony',
  'phone-home',
  'planet-x',
  'playbook',
  'plutus',
  'prime',
  'profile',
  'project-khaos',
  'prometheus',
  'quidditch',
  'raptor-rush',
  'referral-system',
  'resume',
  'rogers-arena',
  'shadow-realm',
  'skyscraper',
  'star-wars',
  'starblood',
  'statue-of-liberty',
  'swamp-run',
  't-1000',
  'the-big-bang',
  'terminal',
  'tetrus',
  'tidal-rush',
  'tools',
  'trifold',
  'truman',
  'underworld',
  'undulatus',
  'user-profile',
  'venus-wifi',
  'waste-extraction',
  'world-engine',
  'world-nexus',
  'xibalba',
  'yomi',
  'zeus-protocol',
  'zeus-v-hades',
]);

const VIDEO_KEY_SET = new Set(PORTAL_VIDEO_KEYS);

// True when the program's portal video has arrived and been wired.
export function portalHasVideo(key) {
  return VIDEO_KEY_SET.has(key);
}

// Cover-fit UV transform for wearing a video on the expanded
// portal's square disc WITHOUT stretching it: the disc samples a
// square, so a portrait source (taller than wide) would smear
// sideways if mapped raw. For a portrait source, show the full
// width and a centered band of the height (cover semantics, the
// same crop object-cover performs for the DOM cards in
// PortalCard.jsx). Returns { repeat: [x, y], offset: [x, y] } for
// THREE.Texture.repeat/.offset, or null when no transform is
// needed — landscape and square sources keep the hall's established
// raw mapping, and non-positive dimensions are not a video at all.
export function portalVideoCoverFit(width, height) {
  if (!(width > 0) || !(height > 0)) return null;
  if (width >= height) return null;
  const shown = width / height; // fraction of the height that fits
  return { repeat: [1, shown], offset: [0, (1 - shown) / 2] };
}
