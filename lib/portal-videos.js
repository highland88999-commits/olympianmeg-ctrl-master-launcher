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
  'affiliates',
  'agent-engine',
  'air-hockey',
  'alexandria',
  'arachnid-weaver',
  'architect-artemis',
  'artemis',
  'artemis-hub',
  'astra',
  'basketball',
  'battleship',
  'beehive',
  'browsers-castle',
  'cerberus',
  'chess',
  'cloud-gaming',
  'cloud-phone',
  'colosseum',
  'dk-hero',
  'dream-engine',
  'enyo',
  'erebus',
  'excalibur',
  'forge',
  'fortress-of-solitude',
  'guillotine',
  'hawkins',
  'hephaestus',
  'hercules',
  'hitchhikers-guide',
  'hive',
  'hollow-earth',
  'holoframe',
  'housing-architecture',
  'human-ai',
  'ice-dragon',
  'ice-monster',
  'iq-test',
  'kombat',
  'labyrinth',
  'liquid-gold',
  'live-recordings',
  'loki',
  'luge',
  'maestro',
  'manuscript-forge',
  'meet-the-gods',
  'merlin-mandates',
  'middle-earth',
  'myriad',
  'neon-racer',
  'neon-void',
  'nexus-codex',
  'nexus-model-generation',
  'nexus-symbiote',
  'nexus-vortex',
  'nova',
  'omega-500',
  'omega-pinball',
  'oracle',
  'orbital-ascent',
  'order-67',
  'pearl',
  'persephone',
  'persymphony',
  'phone-home',
  'plutus',
  'prime',
  'profile',
  'raptor-rush',
  'referral-system',
  'resume',
  'rogers-arena',
  'shadow-realm',
  'star-wars',
  'starblood',
  'swamp-run',
  't-1000',
  'terminal',
  'tetrus',
  'tidal-rush',
  'tools',
  'trifold',
  'underworld',
  'undulatus',
  'user-profile',
  'venus-wifi',
  'waste-extraction',
  'world-engine',
  'world-nexus',
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
