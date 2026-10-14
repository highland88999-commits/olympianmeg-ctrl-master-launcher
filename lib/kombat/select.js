// lib/kombat/select.js
//
// Fighter-select truth (Kombat wiring plan Step 2): the one read model
// both select screens (duel + brawl) share, derived entirely from the
// Step 1 data bridge (lib/kombat/loadouts.js). Components never read
// the sprint pipeline files directly, and nothing here hard-codes
// which fighters exist: availability, previews and locks all follow
// the bridge, so when the sprint completes another fighter — or a
// regen swaps a model — its select slot simply wakes on the next
// bridge regeneration, with no UI change.
//
// Semantics:
//   available — the sprint has completed this fighter's model (bridge
//     record.available). Only available fighters can be picked, by the
//     player or for the CPU, in either mode.
//   locked — a roster fighter the sprint has not completed yet. It
//     stays visible in the grid as a darkened silhouette with the
//     STILL FORGING treatment (name visible, never selectable).
//   preview — the fighter's real generated preview PNG once published
//     in lib/characters/roster.js (bridge record.preview); null until
//     then. A fighter can be available before its preview is
//     published — those fighters select exactly as before, with the
//     live procedural preview as their portrait.
//   profile link — a signed-in user's saved profile character
//     (user_profiles.profile_character_id, a published-roster
//     character id) resolves here to the Kombat fighter it
//     pre-highlights on the select screens. Guests get no preselect.
import { LOADOUTS, getLoadout } from './loadouts.js';
import { FIGHTERS } from './roster.js';
import { isCharacterId } from '../characters/roster.js';

export const LOCKED_LABEL = 'STILL FORGING';

const BY_CHARACTER_ID = new Map(LOADOUTS.map((l) => [l.characterId, l]));

// The select-screen record for one fighter: bridge truth, reshaped.
// Returns null for ids that are not Kombat fighters at all.
export function getSelectEntry(kombatId) {
  const l = getLoadout(kombatId);
  if (!l) return null;
  return {
    kombatId: l.kombatId,
    characterId: l.characterId,
    name: l.name,
    available: l.available === true,
    locked: l.available !== true,
    preview: l.preview || null,
  };
}

// Playable means: a real roster fighter whose model the sprint has
// completed. Unknown ids and non-strings are never selectable.
export function isFighterSelectable(kombatId) {
  const l = getLoadout(kombatId);
  return !!l && l.available === true;
}

export function isFighterLocked(kombatId) {
  const l = getLoadout(kombatId);
  return !!l && l.available !== true;
}

// The fighter's published preview PNG path, or null (not yet
// published, or not a Kombat fighter). The grid shows the preview
// image iff this is non-null.
export function fighterPreview(kombatId) {
  const l = getLoadout(kombatId);
  return l ? l.preview || null : null;
}

// Bridge-ordered id lists (queue order — the order the sprint, and
// therefore the roster's promise, runs in).
export function selectableFighterIds() {
  return LOADOUTS.filter((l) => l.available === true).map((l) => l.kombatId);
}

export function lockedFighterIds() {
  return LOADOUTS.filter((l) => l.available !== true).map((l) => l.kombatId);
}

// Roster-ordered playable fighter records (lib/kombat/roster.js
// objects) — the pool random/opponent picks must draw from, so a
// locked fighter can never be dealt into a match.
export function selectableFighters() {
  return FIGHTERS.filter((f) => isFighterSelectable(f.id));
}

// The profile <-> Kombat link: a saved profile character id resolves
// to the Kombat fighter it pre-highlights. Only PUBLISHED roster
// members resolve (lib/characters/roster.js is the membership truth —
// a profile pick can only ever be one of those), and the fighter must
// exist in the bridge. Anything else — unknown ids, unpublished
// fighters, kombat ids, non-strings — resolves to null (no
// pre-highlight).
export function resolveProfileFighter(profileCharacterId) {
  if (typeof profileCharacterId !== 'string') return null;
  if (!isCharacterId(profileCharacterId)) return null;
  const l = BY_CHARACTER_ID.get(profileCharacterId);
  return l ? l.kombatId : null;
}
