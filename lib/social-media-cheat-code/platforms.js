// lib/social-media-cheat-code/platforms.js
// THE PLATFORM SELECTOR — each platform re-divvies the whole
// hashtag list into pieces sized to what THAT platform caps at.
// The carousel rooms become the platform-sized pieces (copy
// button + per-account checkbox per piece), never sub-divisions
// inside the 120-rooms.
//
// Caps — never guessed; each carries its source, shown in the room:
//   · TikTok 5 — Merlin's own observed cap (capped at 5 posting
//     tonight); TikTok's in-app cap since Aug 2025.
//   · Instagram 5 — Instagram's Help Center, since Dec 2025.
//     The old 30 is DEAD: Instagram announced "up to 5 hashtags
//     in a reel or post" on Dec 18, 2025, and its Help Center
//     now says "You can use up to 5 tags on a post." Meta's
//     developer docs still list 30 for API publishing — stale
//     tooling, not the app rule. Shipping 30 would break posts.
//   · Facebook 120 — Merlin's screenshot: Facebook accepted the
//     whole list in one post, but only ~120 tags render
//     blue/clickable (ending at #mapleridge); 120 is the
//     linkify-safe piece size, not a Facebook-published cap.
//   · YouTube 60 — YouTube's Help Center: over 60 hashtags on
//     a video and EVERY hashtag is ignored (the old 15 figure
//     is outdated).
// Excluded on purpose (no verified hard cap, so no guessing):
// X (Help Center recommends ≤2 as best practice, but allows any
// number — a recommendation, not a cap), Threads (one topic tag
// per post — a different mechanism, not hashtags), LinkedIn
// (no published cap), Pinterest (hashtags stopped being
// clickable in 2020).
//
// Logos: the platforms' real brand glyphs (Simple Icons, CC0),
// self-hosted under public/cheat-code-logos/ — never hotlinked.
// Brand colors are baked into each file; TikTok's glyph is white
// (its dark-background treatment — Simple Icons' black hex would
// vanish on obsidian).

import { ALL_TAGS, chunkArray } from './chunks.js';

export const PLATFORMS = [
  {
    id: 'facebook',
    name: 'Facebook',
    cap: 120,
    capLine: 'Facebook: 120 tags per post',
    capSource: 'The blue-linkify limit from your screenshot — Facebook takes the whole list, but only about 120 linkify.',
    logo: '/cheat-code-logos/facebook.svg',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    cap: 5,
    capLine: 'TikTok: 5 tags per post',
    capSource: 'Your observed cap tonight — TikTok’s in-app cap since Aug 2025.',
    logo: '/cheat-code-logos/tiktok.svg',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    cap: 5,
    capLine: 'Instagram: 5 tags per post',
    capSource: 'Instagram’s Help Center, since Dec 2025 — the old 30 no longer applies.',
    logo: '/cheat-code-logos/instagram.svg',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    cap: 60,
    capLine: 'YouTube: 60 tags per video',
    capSource: 'YouTube’s Help Center — over 60 and every hashtag is ignored.',
    logo: '/cheat-code-logos/youtube.svg',
  },
];

export const PLATFORM_IDS = PLATFORMS.map((p) => p.id);

export function getPlatform(id) {
  return PLATFORMS.find((p) => p.id === id) || PLATFORMS[0];
}

// The platform's pieces: the whole list re-divvied at its cap.
export function platformPieces(id) {
  return chunkArray(ALL_TAGS, getPlatform(id).cap);
}

export function platformPieceCount(id) {
  return platformPieces(id).length;
}

// 1-based tag range of a piece ("1-5", "3091-3098", …).
export function pieceRange(platformId, index) {
  const cap = getPlatform(platformId).cap;
  const start = index * cap + 1;
  const pieces = platformPieces(platformId);
  const len = pieces[index] ? pieces[index].length : 0;
  return `${start}-${start + len - 1}`;
}
