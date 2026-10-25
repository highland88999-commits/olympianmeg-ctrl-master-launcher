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
  'air-hockey',
  'astra',
  'battleship',
  'beehive',
  'chess',
  'cloud-gaming',
  'colosseum',
  'dk-hero',
  'enyo',
  'guillotine',
  'hawkins',
  'hive',
  'ice-dragon',
  'ice-monster',
  'iq-test',
  'kombat',
  'labyrinth',
  'liquid-gold',
  'live-recordings',
  'loki',
  'luge',
  'myriad',
  'middle-earth',
  'neon-racer',
  'neon-void',
  'nova',
  'omega-pinball',
  'pearl',
  'persephone',
  'persymphony',
  'rogers-arena',
  't-1000',
  'underworld',
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
