// lib/user-content/types.js
//
// Universal user-content pool ("cross-pollination") — type definitions and
// program accept-declarations.
//
// CONCEPT: when a user uploads or selects their own media anywhere in the
// launcher, it is registered ONCE in a shared per-user content pool and made
// available to every program that declares it handles that media type.
// One upload, usable everywhere relevant.
//
// HARD PRIVACY RULES (encoded here and enforced in pool.js):
// - The pool is per-user. Nothing becomes public unless the user explicitly
//   publishes it somewhere.
// - Nothing is auto-shared into shared/multiplayer surfaces (OASIS rooms,
//   presence/GhostRiders). Sharing always requires an explicit user action.
// - THE BABEL VAULT IS EXCLUDED. Vault contents never enter the pool.
//   EXCLUDED_ORIGINS below exists so pool.js can reject vault-origin items,
//   and a test asserts the rejection. This module must never import, read,
//   write, or reference vault code paths — the exclusion is by origin string
//   only.

export const CONTENT_TYPES = Object.freeze(['image', 'video', 'audio', 'playlist']);

// Per-program accept declarations: which content types each program handles.
// Programs ask for what they can use; the pool never pushes anything in.
export const PROGRAM_ACCEPTS = Object.freeze({
  profile: Object.freeze(['image', 'video']),      // gallery + avatar frames
  persephone: Object.freeze(['audio', 'video']),  // artist media / ambience
  redwater: Object.freeze(['video']),             // drive-in theater screenings
  radio: Object.freeze(['audio', 'playlist']),    // station tracks + playlists
});

// Origin programs whose items are NEVER allowed into the pool.
// The BABEL vault is excluded permanently: vault contents are private to the
// vault and must never cross-pollinate anywhere. Do not remove this.
export const EXCLUDED_ORIGINS = Object.freeze(['vault']);

export function acceptsType(programId, type) {
  const list = PROGRAM_ACCEPTS[programId];
  return Array.isArray(list) && list.includes(type);
}

export function isContentType(type) {
  return CONTENT_TYPES.includes(type);
}

export function isExcludedOrigin(originProgram) {
  if (typeof originProgram !== 'string') return false;
  return EXCLUDED_ORIGINS.includes(originProgram.trim().toLowerCase());
}
