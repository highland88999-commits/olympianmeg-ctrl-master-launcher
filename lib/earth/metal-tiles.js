// lib/earth/metal-tiles.js — Merlin's 9 scratched-metal graphics:
// the canonical colour order + file table for Earth 1.
//
// HISTORY: this module used to PICK one metal per lens sheet
// (FNV-1a of the tile cell key mod 9 — the mosaic Merlin saw
// filling his whole screen as one giant flat colour, Nov 15).
// Merlin, 2026-11-15 ~19:36: "Get rid of the mapping function
// in the overlays... make the ground wrapped in a single color
// on a fading loop through all images provided." The mapping is
// GONE — metalTileColorForCell, metalTileHash and
// metalTileCropForTile were deleted with it (nothing in the repo
// imports them any more). The ground is now ONE video
// (lib/earth/ground-video.js, public/videos/earth1/ground-loop.mp4)
// that fades through these 9 images in this order, built from
// the same files below — so this module is now the order + the
// URLs, and the video is the loop.
//
// THE PHOTOS: 8 colors live in the sibling shared module
// (lib/portal/scratched-textures.js, one file per color under
// public/textures/scratched/). The 9th color, deep gold, is
// byte-identical to the archway gold and is NOT copied again:
// it lives at public/textures/gold/gold-scratched.jpg
// (lib/portal/gold-texture.js GOLD_TEXTURE_URL).
//
// Pure functions, headless-testable. The URL table comes from
// the sibling modules (both node-importable).

import { SCRATCHED_TEXTURES } from '../portal/scratched-textures.js';
import { GOLD_TEXTURE_URL } from '../portal/gold-texture.js';

/** The 9 colors, in the order Merlin sent them — also the floor
 *  video's fade order. */
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

/** The file URL for a color. Deep gold is the archway gold
 *  (never copied); the other 8 come from the sibling table.
 *  Unknown colors give null — never a broken URL. */
export function metalTileImageUrl(color) {
  if (color === 'deep-gold') return GOLD_TEXTURE_URL;
  const entry = SCRATCHED_TEXTURES[color];
  return entry ? entry.url : null;
}
