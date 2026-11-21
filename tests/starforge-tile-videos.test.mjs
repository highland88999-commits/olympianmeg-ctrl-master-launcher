// tests/starforge-tile-videos.test.mjs — Starforge hex-tile videos, action-orb
// button images, and golden dice with silver pips.
// Run: node --test tests/starforge-tile-videos.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGame } from '../lib/starforge/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const graphicsSrc = readFileSync(join(root, 'components/starforge/graphics.jsx'), 'utf8');
const pageSrc = readFileSync(join(root, 'app/starforge/page.jsx'), 'utf8');
const tilesDir = join(root, 'public/videos/starforge/tiles');
const buttonsDir = join(root, 'public/images/starforge/buttons');

// --- Tile videos on disk ---------------------------------------------------

const EXPECTED_TILE_VIDEOS = ['iron', 'silicon', 'titanium', 'water-ice', 'gold', 'void'];

test('all six tile videos exist on disk with sane sizes', () => {
  const onDisk = readdirSync(tilesDir).filter((f) => f.endsWith('.mp4')).sort();
  assert.deepEqual(onDisk, [...EXPECTED_TILE_VIDEOS].sort().map((n) => `${n}.mp4`));
  let total = 0;
  for (const name of EXPECTED_TILE_VIDEOS) {
    const p = join(tilesDir, `${name}.mp4`);
    const size = statSync(p).size;
    assert.ok(size > 10_000, `${name}.mp4 is suspiciously small: ${size}`);
    assert.ok(size < 200_000, `${name}.mp4 is too big for a hex-face loop: ${size}`);
    // MP4 magic: 'ftyp' at byte 4.
    const head = readFileSync(p).subarray(0, 12);
    assert.equal(head.subarray(4, 8).toString('ascii'), 'ftyp', `${name}.mp4 is not an MP4`);
    total += size;
  }
  // 19 hexes share 6 files; the whole tile-video set must stay in the same
  // weight class as the card videos (~1.4 MB for 6) — far under it, in fact.
  assert.ok(total < 1_000_000, `total tile video weight too big: ${total}`);
});

test('terrain mapping: every terrain key maps to one of the 6 tile videos', () => {
  const mapBlock = graphicsSrc.slice(
    graphicsSrc.indexOf('const TILE_VIDEO'),
    graphicsSrc.indexOf('};', graphicsSrc.indexOf('const TILE_VIDEO')) + 2,
  );
  // Base terrains map to their own video; expansion terrains reuse the closest.
  const expected = {
    iron: 'iron', silicon: 'silicon', titanium: 'titanium',
    waterIce: 'water-ice', gold: 'gold', void: 'void',
    goldVein: 'gold', lake: 'water-ice', sea: 'void', oasis: 'gold',
  };
  for (const [terrain, video] of Object.entries(expected)) {
    assert.ok(mapBlock.includes(`${terrain}: '${video}'`), `${terrain} must map to ${video}`);
    assert.ok(EXPECTED_TILE_VIDEOS.includes(video), `${video} is one of the 6 tile videos`);
  }
  // No other terrain key sneaks in.
  assert.ok(!mapBlock.includes('desert'), 'no invented desert terrain key');
});

test('tile video wiring: HTML overlay layer, clipped to the hex, paused until a roll, SVG fallback underneath', () => {
  // The fix (Nov 21): tile videos must NOT ride in an SVG <foreignObject> —
  // Safari/iOS does not keep a video clipped inside one, so the video
  // escaped to the SVG origin (top-left corner, half off-screen) while the
  // board hexes stayed still. The videos live in TileVideoLayer, a plain
  // HTML layer over the board, each clipped to its hex with CSS clip-path.
  // (The word survives in comments explaining why; the JSX element itself
  // must be gone — match the element form, <foreignObject + attribute.)
  assert.ok(!/<foreignObject\s+[a-zA-Z]/.test(graphicsSrc), 'no foreignObject element anywhere in the tile video path');
  assert.ok(graphicsSrc.includes('export function TileVideoLayer'), 'TileVideoLayer renders the HTML overlay');
  assert.ok(graphicsSrc.includes("position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none'"), 'layer covers exactly the board, clips overflow, lets clicks through');
  assert.ok(graphicsSrc.includes('clipPath: HEX_CLIP'), 'video is clipped to the hex shape');
  assert.ok(graphicsSrc.includes("polygon(93.3% 25%, 50% 0%, 6.7% 25%, 6.7% 75%, 50% 100%, 93.3% 75%)"), 'hex clip polygon is the pointy-top hex');
  assert.ok(graphicsSrc.includes('src={`/videos/starforge/tiles/${video}.mp4`}'), 'tile video src');
  // The layer positions each video from the same geometry the SVG uses:
  // hex centre minus the hex size, over the board bounds, as percentages,
  // so the video sits exactly over its hex and scales with the board.
  const layerFn = graphicsSrc.slice(graphicsSrc.indexOf('export function TileVideoLayer'));
  assert.ok(layerFn.includes('(t.cx - size - bounds.x) / bounds.w'), 'video left is the hex left as % of the board');
  assert.ok(layerFn.includes('(t.cy - size - bounds.y) / bounds.h'), 'video top is the hex top as % of the board');
  assert.ok(layerFn.includes("(box / bounds.w) * 100"), 'video width is the hex width as % of the board');
  assert.ok(layerFn.includes("aspectRatio: '1 / 1'"), 'video keeps the square hex box');
  // Roll-triggered playback: the tile video itself must NOT autoplay or
  // loop — it sits paused until TileVideo's effect wakes it. (Card
  // videos elsewhere in this file still autoplay + loop; scope the check
  // to the TileVideo block.)
  const tileFn = graphicsSrc.slice(
    graphicsSrc.indexOf('function TileVideo('),
    graphicsSrc.indexOf('export function TileVideoLayer'),
  );
  assert.ok(!tileFn.includes('autoPlay'), 'tile video must not autoplay');
  assert.ok(!tileFn.includes(' loop '), 'tile video must not loop');
  assert.ok(!tileFn.includes('loop playsInline'), 'tile video must not loop');
  for (const attr of ['muted', 'playsInline', 'preload="metadata"']) {
    assert.ok(tileFn.includes(attr), `tile video must carry ${attr}`);
  }
  // Play-once then reset: onEnded pauses and rewinds to the first frame.
  assert.ok(tileFn.includes('onEnded'), 'tile video has an onEnded handler');
  assert.ok(tileFn.includes('currentTime = 0'), 'onEnded / wake rewinds to the first frame');
  // A failed video must not deadlock the turn hold: errors report an end.
  assert.ok(tileFn.includes('onError'), 'tile video has an onError handler');
  // SVG art stays underneath as the poster/fallback: HexTileArt still draws
  // the hex polygon + HexArt and carries no video of its own.
  const hexFn = graphicsSrc.slice(
    graphicsSrc.indexOf('export function HexTileArt'),
    graphicsSrc.indexOf('const TILE_VIDEO'),
  );
  assert.ok(hexFn.includes('<polygon points={HEX_POINTS}'), 'SVG hex polygon still renders');
  assert.ok(hexFn.includes('<HexArt terrain={terrain} />'), 'SVG art still renders');
  assert.ok(!hexFn.includes('<video '), 'HexTileArt carries no video');
  assert.ok(graphicsSrc.includes("export function HexTileArt({ terrain = 'iron', size = 34, x, y })"),
    'HexTileArt takes no trigger props');
});

test('tokens and pirate stay on top of the tile videos', () => {
  // The board is three stacked layers sharing one viewBox: SVG hex faces,
  // the HTML TileVideoLayer, then a top SVG carrying the tokens, pirate
  // and pieces. Token disc is opaque (#f5eeda, no opacity) and renders in
  // the top layer, after the video layer in the page.
  const boardBlock = pageSrc.slice(pageSrc.indexOf('{/* Board — three stacked layers'));
  const layerAt = boardBlock.indexOf('<TileVideoLayer');
  assert.ok(layerAt > -1, 'TileVideoLayer call site exists in the board');
  const topSvgAt = boardBlock.indexOf('aria-label="Starforge board"', layerAt);
  assert.ok(topSvgAt > layerAt, 'the top SVG (tokens/pieces) renders after the video layer');
  const tokenAt = boardBlock.indexOf('r={13} fill="#f5eeda"');
  const pirateAt = boardBlock.indexOf('<VoidPiratePiece');
  assert.ok(tokenAt > topSvgAt, 'number token renders in the top SVG, above the videos');
  assert.ok(pirateAt > topSvgAt, 'void pirate renders in the top SVG, above the videos');
  assert.ok(!boardBlock.slice(tokenAt, tokenAt + 80).includes('opacity'), 'token disc stays fully opaque');
  // The top SVG's hex <g> keeps a transparent hit polygon so hex taps
  // still fire (the hex face itself lives in the bottom SVG now).
  assert.ok(boardBlock.includes('<polygon points={hexPoints(h)} fill="transparent" />'), 'hex hit area in the top layer');
  // No video element may render outside the board container: the layer is
  // the only tile-video renderer and it lives inside the board div.
  assert.ok(!/<foreignObject\s+[a-zA-Z]/.test(graphicsSrc), 'no foreignObject escape hatch remains');
  const videoTags = (graphicsSrc.match(/<video /g) || []).length;
  assert.ok(videoTags >= 3, `tile + card videos still render (${videoTags} <video> tags)`);
});

test('base board still deals 19 hexes in the 6-video terrain counts', () => {
  const g = createGame(42);
  const counts = {};
  for (const h of g.hexes) counts[h.terrain] = (counts[h.terrain] || 0) + 1;
  assert.equal(g.hexes.length, 19);
  assert.deepEqual(counts, { iron: 4, silicon: 4, titanium: 4, waterIce: 3, gold: 3, void: 1 });
});

// --- Button images ---------------------------------------------------------

const EXPECTED_BUTTONS = {
  Roll: 'roll', Build: 'build', Trade: 'trade', Cards: 'cards', 'End turn': 'end-turn',
};

test('all five action-orb images exist on disk with sane sizes', () => {
  const onDisk = readdirSync(buttonsDir).filter((f) => f.endsWith('.webp')).sort();
  assert.deepEqual(onDisk, Object.values(EXPECTED_BUTTONS).sort().map((n) => `${n}.webp`));
  let total = 0;
  for (const name of Object.values(EXPECTED_BUTTONS)) {
    const size = statSync(join(buttonsDir, `${name}.webp`)).size;
    assert.ok(size > 500, `${name}.webp is suspiciously small: ${size}`);
    assert.ok(size < 50_000, `${name}.webp is too big for a 56px orb: ${size}`);
    total += size;
  }
  assert.ok(total < 100_000, `total button image weight too big: ${total}`);
});

test('button images wrap exactly the five action orbs', () => {
  // Orb renders an <img> when given an image; otherwise the emoji symbol.
  assert.ok(pageSrc.includes('function Orb({ symbol, label, onClick, disabled, active, small, image })'), 'Orb takes an image prop');
  assert.ok(pageSrc.includes('<img src={image}'), 'Orb renders the image');
  assert.ok(pageSrc.includes("objectFit: 'cover'"), 'orb image covers the circle');
  for (const [label, name] of Object.entries(EXPECTED_BUTTONS)) {
    assert.ok(pageSrc.includes(`label="${label}"`), `${label} orb exists`);
    assert.ok(pageSrc.includes(`image="/images/starforge/buttons/${name}.webp"`), `${label} orb carries the ${name} image`);
  }
  // No other orb gets an image: exactly five image= props on Orb call sites.
  const imageProps = pageSrc.match(/image="\/images\/starforge\/buttons\/[a-z-]+\.webp"/g) || [];
  assert.equal(imageProps.length, 5, `exactly 5 orbs carry images, found ${imageProps.length}`);
  // Dice-result display and trade/bank buttons are NOT part of this: the
  // dice row still uses DiceFace, not images.
  assert.ok(pageSrc.includes('<DiceFace value={game.dice[0]}'), 'dice display still uses DiceFace');
});

// --- Golden dice -----------------------------------------------------------

test('dice are golden with silver pips; event die keeps its themed faces', () => {
  const diceBlock = graphicsSrc.slice(graphicsSrc.indexOf('export function DiceFace'));
  // Gold gradient on the face, silver pips — no red/yellow die left.
  assert.ok(diceBlock.includes('sfDiceGold'), 'dice use the gold gradient');
  assert.ok(diceBlock.includes("fill=\"url(#sfDiceGold)\""), 'die face is gold');
  assert.ok(diceBlock.includes("const pipColor = '#e5e7eb'"), 'pips are silver');
  assert.ok(!diceBlock.includes('#dc2626'), 'no red die fill remains');
  assert.ok(!diceBlock.includes('#eab308'), 'no yellow die fill remains');
  assert.ok(diceBlock.includes('gold die:'), 'aria label names the gold die');
  // Event die: themed faces kept, only the base went gold.
  assert.ok(diceBlock.includes('<EventFaceArt face={face} />'), 'event die still renders its themed face');
  assert.ok(graphicsSrc.includes("face === 'fleet'") && graphicsSrc.includes("face === 'research'")
    && graphicsSrc.includes("face === 'commerce'"), 'all event faces still exist');
  // Commerce face's gold disc went silver-white so it reads on the gold base.
  const commerce = graphicsSrc.slice(graphicsSrc.indexOf("face === 'commerce'"));
  assert.ok(commerce.slice(0, 400).includes('fill="#e5e7eb"'), 'commerce disc is silver on gold');
});
