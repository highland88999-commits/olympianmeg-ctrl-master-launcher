// lib/earth/earth-characters.js — the Earth 1 EXTENSION roster.
//
// Merlin, 2026-10-26 ("add ALL characters to Earth 1 as well"):
// Earth 1's character selection must offer the FULL character
// roster — not just the platform picker's visible 43. This file
// is the extension: every playable character found in evidence
// that the platform roster does NOT already offer on Earth.
//
// WHY A SEPARATE ROSTER (checked first, per his standing rule):
// the platform roster (lib/characters/roster.js, 57 entries)
// offers q001–q043 with previews + kombat loadouts, but
// q044–q057 have "Preview PNGs are not published yet" AND no
// loadouts — and CharacterToken returns null without a preview,
// so they are invisible in every picker today. Hand-editing
// loadouts.js is forbidden (it is GENERATED — regenerate with
// build_kombat_loadouts.py), and un-hiding q044–q051 in the
// platform picker would mislead (no loadouts → the pick falls
// back to Ghostface). So the extension roster below wires those
// characters by DIRECT GLB — no roster.js, loadouts.js, or
// CharacterToken change — and EarthWalker renders them through
// a direct path (lib/earth/extension-character-model.js) with
// procedural bob/lean/sway, no bone posing.
//
// Sources (all verified in evidence, 2026-10-26):
//   ME heroes — public/models/middle-earth/*.glb (already
//     optimized, ~0.8–1 MB). UNRIGGED plain models (ME round-2
//     finding: the wizard's staff is baked in; orcs code-built).
//     On Earth they render + move but limbs do NOT articulate —
//     rigid figures with procedural bob — until rigged versions
//     land. That caveat is in the receipt, not hidden.
//   Hawkins 8 — public/models/hawkins/*.glb (q044–q051).
//   Batch-4 intact 16 — public/models/earth-characters/b4-*.glb
//     (optimized 2026-10-26: rigged recipe, RIG-EXACT verified;
//     the batch-4 files are RIGGED but Earth renders them the
//     same direct way — no bone posing yet, so rigging buys
//     future articulation, not today's motion).
//
// DELIBERATELY NOT HERE (listed by name + reason in the
// receipt, never silently dropped):
//   Kael the Monster Hunter — no GLB file exists at the
//     registry path (HE renders a procedural stand-in; Earth
//     has no procedural-figure path, so no honest body).
//   q052–q057 operatives (Bounty Hunter, Cybernetic Soldier,
//     Cyberpunk Operative, Futuristic Female Operative,
//     Post-Apocalyptic, Space Marine) — roster entries exist
//     but no public GLB file.
//   Batch-4 truncated 8 (41, 49, 52, 54, 61, 63, 71, 72) — tail-
//     truncated files (declared length > actual size); they
//     need complete Tripo re-sends. (NEW finding 2026-10-26:
//     the sort's size/etag match did not catch these.)
//   Batch-4 decimated 6 (109–112, 114–116) — purpose TBD per
//     SORT.md (duplicates/variants, not separate characters).
//   Batch-4 creatures (44) — creature roster, not characters.
//   Dark Lord, Saruman — deliberately not playable in the
//     home program. Horse/eagle/warg/fell-beast/dragon —
//     creatures. Jedi Knight, Sith Lord — no hero stats in
//     the home program (the HE file's own exclusion rule).
//
// Ids use x- prefixes so they can NEVER collide with platform
// ids (q001–q057) or with the character pick chain: the
// platform pick and the extension pick are mutually exclusive
// (one body at a time — see lib/earth/earth-extension-character.js).
//
// Heights: ME heroes use the Hollow Earth heights (the same
// figures); every other extension character defaults to 1.9 m
// standing-height fit — no height data exists for them, and
// inventing per-character heights would be worse than one
// honest default.

export const EARTH_CHARACTER_EXTENSIONS = [
  // --- Middle-earth heroes (5) ---
  { id: 'x-me-wizard', name: 'The Grey Pilgrim', source: 'Middle-earth', glbUrl: '/models/middle-earth/wizard.glb', heightM: 1.9, emoji: '🧙', blurb: 'Staff baked in; walks with procedural bob.' },
  { id: 'x-me-ranger', name: 'A Ranger of the North', source: 'Middle-earth', glbUrl: '/models/middle-earth/ranger.glb', heightM: 1.85, emoji: '🏹', blurb: 'Bow hero from the northern roads.' },
  { id: 'x-me-elf-archer', name: 'An Elf of the Valley', source: 'Middle-earth', glbUrl: '/models/middle-earth/elf-archer.glb', heightM: 1.9, emoji: '🧝', blurb: 'Elven archer of the valley.' },
  { id: 'x-me-dwarf', name: 'A Dwarf of Erebor', source: 'Middle-earth', glbUrl: '/models/middle-earth/dwarf.glb', heightM: 1.35, emoji: '⛏️', blurb: 'Stout dwarf of Erebor.' },
  { id: 'x-me-halfling', name: 'A Halfling of the Shire', source: 'Middle-earth', glbUrl: '/models/middle-earth/halfling.glb', heightM: 1.15, emoji: '🌿', blurb: 'Small halfling of the Shire.' },
  // --- Hawkins (8) ---
  { id: 'x-hawkins-eddie', name: 'Eddie Munson', source: 'Hawkins', glbUrl: '/models/hawkins/eddie.glb', heightM: 1.9, emoji: '🎸', blurb: 'Hawkins metalhead, q044.' },
  { id: 'x-hawkins-eleven', name: 'Eleven', source: 'Hawkins', glbUrl: '/models/hawkins/eleven.glb', heightM: 1.9, emoji: '🧇', blurb: 'Hawkins, q045.' },
  { id: 'x-hawkins-hopper', name: 'Jim Hopper', source: 'Hawkins', glbUrl: '/models/hawkins/hopper.glb', heightM: 1.9, emoji: '👮', blurb: 'Hawkins chief, q046.' },
  { id: 'x-hawkins-vecna', name: 'Vecna', source: 'Hawkins', glbUrl: '/models/hawkins/vecna.glb', heightM: 1.9, emoji: '🕷️', blurb: 'Hawkins, q047.' },
  { id: 'x-hawkins-demogorgon', name: 'Demogorgon', source: 'Hawkins', glbUrl: '/models/hawkins/demogorgon.glb', heightM: 1.9, emoji: '🌸', blurb: 'Hawkins, q048.' },
  { id: 'x-hawkins-demobats', name: 'Demobats', source: 'Hawkins', glbUrl: '/models/hawkins/demobats.glb', heightM: 1.9, emoji: '🦇', blurb: 'Hawkins, q049.' },
  { id: 'x-hawkins-mind-flayer', name: 'Mind Flayer', source: 'Hawkins', glbUrl: '/models/hawkins/mind-flayer.glb', heightM: 1.9, emoji: '👁️', blurb: 'Hawkins, q050.' },
  { id: 'x-hawkins-mind-flayer-hybrid', name: 'Mind Flayer Hybrid', source: 'Hawkins', glbUrl: '/models/hawkins/mind-flayer-hybrid.glb', heightM: 1.9, emoji: '🧬', blurb: 'Hawkins, q051.' },
  // --- Batch-4 intact characters (16) — builder names from
  //     the batch-4 sort personalities (SORT.md) ---
  { id: 'x-b4-43', name: "Vex 'the Ledger' Korr", source: 'Batch 4', glbUrl: '/models/earth-characters/b4-43.glb', heightM: 1.9, emoji: '💼', blurb: 'Green-armored bounty hunter.' },
  { id: 'x-b4-45', name: 'Professor Ambrose Finch', source: 'Batch 4', glbUrl: '/models/earth-characters/b4-45.glb', heightM: 1.9, emoji: '🎩', blurb: 'Elderly gentleman.' },
  { id: 'x-b4-46', name: 'Lord Malachar the Eclipse', source: 'Batch 4', glbUrl: '/models/earth-characters/b4-46.glb', heightM: 1.9, emoji: '🌑', blurb: 'Dark space lord.' },
  { id: 'x-b4-47', name: 'Wren Thornwhisper', source: 'Batch 4', glbUrl: '/models/earth-characters/b4-47.glb', heightM: 1.9, emoji: '🏹', blurb: 'Fantasy ranger.' },
  { id: 'x-b4-48', name: 'Commander June Park', source: 'Batch 4', glbUrl: '/models/earth-characters/b4-48.glb', heightM: 1.9, emoji: '🚀', blurb: 'Astronaut suit.' },
  { id: 'x-b4-51', name: 'Aldric the Unfinished', source: 'Batch 4', glbUrl: '/models/earth-characters/b4-51.glb', heightM: 1.9, emoji: '🧙', blurb: 'Wizard character.' },
  { id: 'x-b4-53', name: 'Pippa Underbough', source: 'Batch 4', glbUrl: '/models/earth-characters/b4-53.glb', heightM: 1.9, emoji: '🌿', blurb: 'Fantasy halfling.' },
  { id: 'x-b4-57', name: 'The Iron Regent', source: 'Batch 4', glbUrl: '/models/earth-characters/b4-57.glb', heightM: 1.9, emoji: '👑', blurb: 'Dark-armored villain.' },
  { id: 'x-b4-58', name: 'Grak', source: 'Batch 4', glbUrl: '/models/earth-characters/b4-58.glb', heightM: 1.9, emoji: '👹', blurb: 'Fantasy orc.' },
  { id: 'x-b4-60', name: 'Zug the Second Argument', source: 'Batch 4', glbUrl: '/models/earth-characters/b4-60.glb', heightM: 1.9, emoji: '🪓', blurb: 'Fantasy orc warrior 2.' },
  { id: 'x-b4-62', name: 'Elder Theom', source: 'Batch 4', glbUrl: '/models/earth-characters/b4-62.glb', heightM: 1.9, emoji: '📜', blurb: 'Wise wizard.' },
  { id: 'x-b4-66', name: 'The Quiet', source: 'Batch 4', glbUrl: '/models/earth-characters/b4-66.glb', heightM: 1.9, emoji: '🗡️', blurb: 'Hooded assassin.' },
  { id: 'x-b4-67', name: 'Grandmother Yaga-Vey', source: 'Batch 4', glbUrl: '/models/earth-characters/b4-67.glb', heightM: 1.9, emoji: '🧹', blurb: 'Elderly wizard.' },
  { id: 'x-b4-68', name: 'Burruk', source: 'Batch 4', glbUrl: '/models/earth-characters/b4-68.glb', heightM: 1.9, emoji: '🐻', blurb: 'Chewbacca-renamed; staged only.' },
  { id: 'x-b4-74', name: 'Gloop Ambassador Zib', source: 'Batch 4', glbUrl: '/models/earth-characters/b4-74.glb', heightM: 1.9, emoji: '🟢', blurb: 'Green swamp alien.' },
  { id: 'x-b4-76', name: 'Rook the Finder', source: 'Batch 4', glbUrl: '/models/earth-characters/b4-76.glb', heightM: 1.9, emoji: '🔍', blurb: 'Desert scavenger.' },
];

export function listExtensionCharacters() {
  return EARTH_CHARACTER_EXTENSIONS.slice();
}

export function getExtensionCharacter(id) {
  if (!id) return null;
  return EARTH_CHARACTER_EXTENSIONS.find((c) => c.id === id) || null;
}

export function isExtensionCharacterId(id) {
  return !!getExtensionCharacter(id);
}

/** The full Earth 1 selectable count, for the receipt/tests:
 *  platform visible (43) + extension (29) = 72. */
export const EARTH_SELECTABLE_CHARACTER_COUNT = 43 + EARTH_CHARACTER_EXTENSIONS.length;
