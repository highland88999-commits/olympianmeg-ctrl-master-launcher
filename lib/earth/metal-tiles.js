// lib/earth/metal-tiles.js — Earth 1 ground tiling as a mixture
// of Merlin's 9 scratched-metal graphics (Merlin, 2026-11-15:
// "Make the tiling in earth 1 a mixture of these graphics please").
//
// WHAT THIS IS: the Earth 1 lens sheets (components/NexusEarth.jsx,
// built from lib/earth/lens.js) no longer wear photographic ESRI
// tiles. Each sheet wears ONE of the 9 scratched-metal graphics,
// picked deterministically from the sheet's own tile cell key —
// the exact identity the rendered record already uses
// (lib/earth/lens-cache.js tileCellKey = preset + zoom + slippy
// grid origin, e.g. "streetCoarse:z6:-12:34"). A tile keeps its
// color across reloads, and restore-on-load rebuilds it
// identically, because the pick is a pure function of the key.
//
// DISTRIBUTION RULE (plainly, as ordered): the pick is
// FNV-1a(cellKey) mod 9 over the 9 colors in the order Merlin
// sent them — uniform by construction, each color ~1/9 of sheets.
// No color is weighted, no region is special-cased, no seed is
// stored anywhere. If a color ever dominates, the hash is the
// suspect, not the data.
//
// WHAT IS UNTOUCHED: the tile SYSTEM — streaming, caching, phone
// caps (near 4 / far 2 / coarse 3), restore-on-load, tile
// identity, the settle/finish/record path in NexusEarth — only
// the sheet SKIN changes. The sheet still paints tile by tile
// (each tile draws its own crop of the one photo), centre-first.
// Earth 1 stays bare of objects (his standing order) — ground
// skin only, nothing placed on it.
//
// THE PHOTOS: 8 colors live in the sibling shared module
// (lib/portal/scratched-textures.js, one file per color under
// public/textures/scratched/) — this module reuses that table,
// it does not duplicate it. The 9th color, deep gold, is
// byte-identical to the archway gold and is NOT copied again:
// it lives at public/textures/gold/gold-scratched.jpg
// (lib/portal/gold-texture.js GOLD_TEXTURE_URL).
//
// HONEST FLAG (for the receipt): this REPLACES the photographic
// look on Earth 1 ground tiles. Keeping the photos with the
// metals mixed in as accents instead is a one-line variant
// (paint the photo tiles, then overlay the metal on a subset)
// — not built here, Merlin's call.
//
// Pure functions, headless-testable. The URL table comes from
// the sibling modules (both node-importable); the pick and the
// crop math take no imports at all.

import { SCRATCHED_TEXTURES } from '../portal/scratched-textures.js';
import { GOLD_TEXTURE_URL } from '../portal/gold-texture.js';

/** The 9 colors, in the order Merlin sent them. */
export const METAL_TILE_COLORS = [
  'magenta',
  'cyan',
  'blue',
  'bright-gold',
  'red',
  'green',
  'purple',
  'silver',
  'deep-gold',
];
export const METAL_TILE_COUNT = METAL_TILE_COLORS.length;

/** The 9 graphics are all 1170×653 RGB photos. */
export const METAL_TILE_IMAGE_WIDTH = 1170;
export const METAL_TILE_IMAGE_HEIGHT = 653;

/** FNV-1a 32-bit hash — the house deterministic hash (same
 *  family as the ARES maze). Well-distributed over short
 *  strings, so `hash % 9` is near-uniform across cell keys. */
export function metalTileHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The sheet's color: a pure function of its tile cell key.
 *  Same key → same color, forever, on any device. Non-string
 *  or empty keys give null (the caller drops the build
 *  honestly, the way it drops a build with no height data). */
export function metalTileColorForCell(cellKey) {
  if (typeof cellKey !== 'string' || cellKey.length === 0) return null;
  return METAL_TILE_COLORS[metalTileHash(cellKey) % METAL_TILE_COUNT];
}

/** The file URL for a color. Deep gold is the archway gold
 *  (never copied); the other 8 come from the sibling table.
 *  Unknown colors give null — never a broken URL. */
export function metalTileImageUrl(color) {
  if (color === 'deep-gold') return GOLD_TEXTURE_URL;
  const entry = SCRATCHED_TEXTURES[color];
  return entry ? entry.url : null;
}

/** The source crop of the metal photo for one tile of a sheet.
 *  The photo's CENTERED SQUARE is spread across the sheet
 *  (side = min(width, height)), so the scratches keep their
 *  true proportions instead of stretching to the square canvas.
 *  The union of all grid × grid crops covers that square
 *  exactly once — no overlap, no gap, no distortion. */
export function metalTileCropForTile(col, row, grid,
  imgW = METAL_TILE_IMAGE_WIDTH, imgH = METAL_TILE_IMAGE_HEIGHT) {
  const side = Math.min(imgW, imgH);
  const sx0 = (imgW - side) / 2;
  const sy0 = (imgH - side) / 2;
  return {
    sx: sx0 + (col / grid) * side,
    sy: sy0 + (row / grid) * side,
    sw: side / grid,
    sh: side / grid,
  };
}
