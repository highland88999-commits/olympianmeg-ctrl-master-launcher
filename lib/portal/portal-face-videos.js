// lib/portal/portal-face-videos.js
//
// VIDEO PORTAL FACES (Merlin, Nov 15 ~22:25): the faces of the
// portal cards in components/PortalRoom.jsx — one per heaven/hell
// realm — wear VIDEO, muted and looping, over the realm's
// illustrated graphic (lib/portal/portal-graphics.js), which stays
// underneath as the fallback. A face with no video yet keeps its
// static graphic, named here so the next batch knows what is owed.
//
// COUNT (this batch): 9 video faces of 24 unique realms —
//   · 3 REUSED sky videos from the nether batch (batch 1):
//     hades, hell, helheim (public/videos/nether/<key>-sky.mp4).
//     The floor videos are hazard-liquid close-ups, not faces —
//     only the sky videos are reused, and only on their own realm.
//   · 6 NEW face videos (public/videos/portal-faces/<key>.mp4):
//     elysium, heaven, valhalla, duat, naraka, tiangong.
//     Picked as the faces that needed them most: Elysium is the
//     flagship higher realm (two doors into one); Heaven is the
//     namesake; Valhalla the most iconic heaven; Duat pairs with
//     Hades; Naraka hosts the Wheel of Rebirth; Tiangong holds the
//     peaches. 4 heaven + 2 nether — the heaven side had no video
//     anywhere before this batch.
//   · 15 realms still on the static illustrated graphic (named in
//     PORTAL_FACE_STATIC_KEYS) — follow-up batches, 6 per message.
//
// REUSE, STATED PLAINLY: Orun and Elysium each appear on TWO cards
// (heaven side + nether side, 12 + 14 = 26 cards from 24 realms).
// That is the SAME realm's face on both its cards — one video per
// realm, never one video shared across two different realms.
//
// The new videos are 10.0 s, 1280×720, h264, no audio, loop-fixed
// with a 0.25 s dissolve at the seam (same standard as the nether
// batch) — first-vs-last-frame mean RGB differences 1–13/255.
//
// Pure module: no DOM, no React — node tests drive it directly.

import { graphicForRealm } from './portal-graphics.js';

/** Base URL for the new face videos. */
export const PORTAL_FACE_VIDEO_BASE = '/videos/portal-faces';
/** Base URL for the reused nether sky videos. */
export const NETHER_FACE_VIDEO_BASE = '/videos/nether';

/**
 * Realm key → video URL. Exactly one video per realm; no video is
 * shared across two different realms.
 */
export const PORTAL_FACE_VIDEOS = {
  // ——— Reused (nether batch 1 sky videos, their own realms) ———
  hades: `${NETHER_FACE_VIDEO_BASE}/hades-sky.mp4`,
  hell: `${NETHER_FACE_VIDEO_BASE}/hell-sky.mp4`,
  helheim: `${NETHER_FACE_VIDEO_BASE}/helheim-sky.mp4`,
  // ——— New (this batch) ———
  elysium: `${PORTAL_FACE_VIDEO_BASE}/elysium.mp4`,
  heaven: `${PORTAL_FACE_VIDEO_BASE}/heaven.mp4`,
  valhalla: `${PORTAL_FACE_VIDEO_BASE}/valhalla.mp4`,
  duat: `${PORTAL_FACE_VIDEO_BASE}/duat.mp4`,
  naraka: `${PORTAL_FACE_VIDEO_BASE}/naraka.mp4`,
  tiangong: `${PORTAL_FACE_VIDEO_BASE}/tiangong.mp4`,
};

/** Realm keys whose face video was made in this batch. */
export const PORTAL_FACE_NEW_KEYS = ['elysium', 'heaven', 'valhalla', 'duat', 'naraka', 'tiangong'];

/** Realm keys whose face reuses an existing nether sky video. */
export const PORTAL_FACE_REUSED_KEYS = ['hades', 'hell', 'helheim'];

/**
 * Realm keys still on the static illustrated graphic — owed in
 * follow-up batches (6 videos per message). 8 nether + 7 heaven.
 */
export const PORTAL_FACE_STATIC_KEYS = [
  'yomi', 'annwn', 'mictlan', 'xibalba', 'kur', 'nav', 'diyu', 'orun',
  'svarga', 'takamagahara', 'tir-na-nog', 'tlalocan', 'maya-sky', 'vyraj', 'aaru',
];

/** The video URL for a realm's portal face, or null when it has none yet. */
export function faceVideoUrlForRealm(realmKey) {
  return PORTAL_FACE_VIDEOS[realmKey] ?? null;
}

/**
 * A realm's whole face: { video, fallback, kind }.
 * video is the face video URL or null; fallback is always the
 * realm's illustrated graphic (it exists for every realm); kind is
 * 'video' or 'static'.
 */
export function faceForRealm(realmKey) {
  const video = faceVideoUrlForRealm(realmKey);
  return { video, fallback: graphicForRealm(realmKey), kind: video ? 'video' : 'static' };
}

/** Repo-relative paths of the 6 new face video files (for tests). */
export const PORTAL_FACE_NEW_FILES = PORTAL_FACE_NEW_KEYS.map(
  (k) => `public/videos/portal-faces/${k}.mp4`
);

/** Repo-relative paths of the 3 reused nether sky video files (for tests). */
export const PORTAL_FACE_REUSED_FILES = PORTAL_FACE_REUSED_KEYS.map(
  (k) => `public/videos/nether/${k}-sky.mp4`
);
