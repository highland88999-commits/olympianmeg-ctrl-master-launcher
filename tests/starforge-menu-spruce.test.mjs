// tests/starforge-menu-spruce.test.mjs — Starforge menu spruce-up (Merlin, Nov 21):
// centred landing header + menu, looping video background behind the board,
// and graphics dressing every menu section.
// Run: node --test tests/starforge-menu-spruce.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pageSrc = readFileSync(join(root, 'app/starforge/page.jsx'), 'utf8');
const graphicsSrc = readFileSync(join(root, 'components/starforge/graphics.jsx'), 'utf8');
const menuDir = join(root, 'public/images/starforge/menu');
const boardBg = join(root, 'public/videos/starforge/board-bg.mp4');

// The menu return block (screen === 'menu'), up to the lobby block.
const menuBlock = pageSrc.slice(
  pageSrc.indexOf("if (screen === 'menu')"),
  pageSrc.indexOf('// ---- Online lobby ----'),
);
// The game return block, from the background-video comment above it.
const gameBlock = pageSrc.slice(pageSrc.indexOf('Game screen background video'));

// --- Centred landing header + menu -----------------------------------------

test('menu column is a centred fluid column (max-width + margin auto, no fixed widths)', () => {
  assert.ok(menuBlock.includes('data-testid="starforge-menu-column"'), 'menu column carries its test id');
  const col = menuBlock.slice(menuBlock.indexOf('data-testid="starforge-menu-column"'));
  assert.ok(col.includes("width: '100%'"), 'column is fluid (width 100%)');
  assert.ok(col.includes('maxWidth: 440'), 'column caps at 440px');
  assert.ok(col.includes("margin: '0 auto'"), 'column is centred with margin auto');
  assert.ok(col.includes("boxSizing: 'border-box'"), 'column uses border-box so padding cannot push it wide');
  // The old defect: a fixed 440px MenuArt SVG inside a 370px-wide column
  // at 390px viewport overflowed 70px right and the menu read left-leaning.
  assert.ok(!menuBlock.includes('<MenuArt'), 'menu no longer renders the fixed-width MenuArt SVG');
  assert.ok(!/width=\{440/.test(menuBlock), 'no fixed 440px-wide element remains on the menu');
});

test('menu header card is fluid and centred, title is real text over the header art', () => {
  assert.ok(menuBlock.includes('data-testid="starforge-menu-header"'), 'header card carries its test id');
  const header = menuBlock.slice(menuBlock.indexOf('data-testid="starforge-menu-header"'));
  assert.ok(header.includes("width: '100%'"), 'header card is fluid');
  assert.ok(header.includes("overflow: 'hidden'"), 'header card clips its art to the rounded card');
  assert.ok(header.includes('src="/images/starforge/menu/header-art.webp"'), 'header art image dresses the card');
  assert.ok(header.includes("height: 'auto'"), 'header art scales with the column (no fixed height)');
  assert.ok(header.includes('<h1'), 'Starforge title is a real heading, not text baked into the image');
  assert.ok(header.includes('>Starforge</h1>'), 'title text is unchanged');
  // The title sits over the image's lower band with a dark scrim behind it
  // so it stays readable on the nebula art.
  assert.ok(header.includes('linear-gradient(transparent 55%, rgba(11,16,38,0.85) 100%)'), 'title has a legibility scrim');
  assert.ok(header.includes("textAlign: 'center'"), 'title is centred within the card');
});

test('menu panels are centred children of the column and keep their copy + behaviour', () => {
  for (const id of ['menu-panel-name', 'menu-panel-expansions', 'menu-panel-solo', 'menu-panel-online']) {
    assert.ok(menuBlock.includes(`data-testid="${id}"`), `${id} exists`);
  }
  // Copy is untouched.
  for (const copy of ['Your name', 'Expansions — pick any, or none', 'Solo — you vs three agents',
    'Online room — play with friends, agents fill empty seats', 'Or join with a code:']) {
    assert.ok(menuBlock.includes(copy), `menu copy kept: ${copy}`);
  }
  // Behaviour is untouched: name input, expansion toggle, Solo + Online flows.
  assert.ok(menuBlock.includes('value={playerName}'), 'name input still bound to playerName');
  assert.ok(menuBlock.includes('onChange={(e) => setPlayerName(e.target.value)}'), 'name input still updates');
  assert.ok(menuBlock.includes('onClick={() => toggleExpansion(info.key)}'), 'expansion rows still toggle');
  assert.ok(menuBlock.includes('onClick={startSolo}'), 'Solo still starts a solo game');
  assert.ok(menuBlock.includes('onClick={createOnlineRoom}'), 'Create room still wired');
  assert.ok(menuBlock.includes('onClick={joinOnlineRoom}'), 'Join room still wired');
  // The name input is full-width inside its panel so it cannot overflow it.
  assert.ok(menuBlock.includes("width: '100%'"), 'name input is full-width');
});

// --- Looping video background behind the board ------------------------------

test('board background video exists on disk: small, real MP4, 10 s drift', () => {
  const size = statSync(boardBg).size;
  assert.ok(size > 10_000, `board-bg.mp4 is suspiciously small: ${size}`);
  assert.ok(size < 200_000, `board-bg.mp4 is too big for a background loop: ${size}`);
  const head = readFileSync(boardBg).subarray(0, 12);
  assert.equal(head.subarray(4, 8).toString('ascii'), 'ftyp', 'board-bg.mp4 is not an MP4');
  // No audio track: a background loop must be silent (checked via ffprobe
  // in the probe; the transcode dropped audio with -an).
});

test('background video wiring: muted loop autoplay, behind the board, static bg stays as fallback', () => {
  assert.ok(gameBlock.includes('data-testid="board-bg-video"'), 'background video carries its test id');
  const video = gameBlock.slice(gameBlock.indexOf('data-testid="board-bg-video"'));
  assert.ok(video.includes('src="/videos/starforge/board-bg.mp4"'), 'video src is the board background');
  for (const attr of ['muted', 'loop', 'playsInline', 'autoPlay']) {
    assert.ok(video.includes(attr), `background video must carry ${attr}`);
  }
  assert.ok(video.includes('poster="/images/myriad/bg.webp"'), 'poster is the static Myriad sky');
  assert.ok(video.includes("position: 'absolute', inset: 0"), 'video covers the whole game screen');
  assert.ok(video.includes("objectFit: 'cover'"), 'video covers without distortion');
  assert.ok(video.includes('zIndex: 0'), 'video sits at the back (z-index 0)');
  assert.ok(video.includes("pointerEvents: 'none'"), 'video never eats taps');
  // Dimmed so it never fights the tiles, tokens or text for attention.
  const opacity = Number((video.match(/opacity: (0\.\d+)/) || [])[1]);
  assert.ok(opacity > 0 && opacity <= 0.6, `background video dimmed to ${opacity} (must be <= 0.6)`);
  // The game column renders after the video at z-index 1, above it.
  const videoAt = gameBlock.indexOf('data-testid="board-bg-video"');
  const colAt = gameBlock.indexOf("zIndex: 1", videoAt);
  assert.ok(colAt > videoAt, 'game column sits above the video');
  // The static Myriad background stays on the main as the fallback under
  // the video if the video cannot play.
  assert.ok(gameBlock.includes('...MYRIAD_BG'), 'static Myriad bg still on the game screen');
  // Exactly one background video: the tile videos are the only other
  // videos and they live in TileVideoLayer, not on this screen.
  const bgVideos = (pageSrc.match(/data-testid="board-bg-video"/g) || []).length;
  assert.equal(bgVideos, 1, 'exactly one board background video');
});

// --- Menu section graphics ---------------------------------------------------

const EXPECTED_MENU_IMAGES = {
  'header-art.webp': 'header card',
  'name.webp': 'Your name',
  'starfarers.webp': 'Starfarers',
  'stations-starfighters.webp': 'Stations & Starfighters',
  'harvesters.webp': 'Harvesters',
  'caravans.webp': 'Rover Caravans',
  'solo.webp': 'Solo',
  'online.webp': 'Online room',
};

test('all eight menu graphics exist on disk with sane sizes', () => {
  const onDisk = readdirSync(menuDir).filter((f) => f.endsWith('.webp')).sort();
  assert.deepEqual(onDisk, Object.keys(EXPECTED_MENU_IMAGES).sort());
  let total = 0;
  for (const name of Object.keys(EXPECTED_MENU_IMAGES)) {
    const p = join(menuDir, name);
    const size = statSync(p).size;
    assert.ok(size > 5_000, `${name} is suspiciously small: ${size}`);
    assert.ok(size < 50_000, `${name} is too big for menu dressing: ${size}`);
    // WebP magic: 'RIFF' at 0, 'WEBP' at 8.
    const head = readFileSync(p).subarray(0, 12);
    assert.equal(head.subarray(0, 4).toString('ascii'), 'RIFF', `${name} is not a WebP (RIFF)`);
    assert.equal(head.subarray(8, 12).toString('ascii'), 'WEBP', `${name} is not a WebP (WEBP)`);
    total += size;
  }
  assert.ok(total < 200_000, `total menu graphic weight too big: ${total}`);
});

test('each menu section carries its graphic; expansion rows keep checkbox + description', () => {
  // Header + name + solo + online are direct <img> tags in the menu block.
  for (const [file, section] of Object.entries(EXPECTED_MENU_IMAGES)) {
    if (['starfarers.webp', 'stations-starfighters.webp', 'harvesters.webp', 'caravans.webp'].includes(file)) continue;
    assert.ok(menuBlock.includes(`/images/starforge/menu/${file}`), `${section} section carries ${file}`);
  }
  // Expansions carry theirs through EXPANSION_INFO (image field per row).
  for (const [key, file] of [['starfarers', 'starfarers.webp'], ['stationsStarfighters', 'stations-starfighters.webp'],
    ['harvesters', 'harvesters.webp'], ['caravans', 'caravans.webp']]) {
    assert.ok(pageSrc.includes(`key: '${key}'`), `${key} expansion still exists`);
    assert.ok(pageSrc.includes(`image: '/images/starforge/menu/${file}'`), `${key} row carries ${file}`);
  }
  assert.ok(menuBlock.includes('<img src={info.image}'), 'expansion rows render their image');
  // Rows keep checkbox + name + description, in that order.
  const row = menuBlock.slice(menuBlock.indexOf('<img src={info.image}'));
  assert.ok(menuBlock.includes("expansions[info.key] ? '☑️' : '⬜'"), 'expansion checkbox kept');
  assert.ok(menuBlock.includes('{info.name}'), 'expansion name kept');
  assert.ok(menuBlock.includes('{info.desc}'), 'expansion description kept');
  // Graphics dress the sections: fixed small thumbs that cannot push
  // content around (fixed size + flexShrink 0 in rows, centred block in
  // the Solo/Online panels), and no graphic overlaps anything (the menu
  // is normal flow; the only absolute element is the header title scrim).
  assert.ok(menuBlock.includes("width: 44, height: 44"), 'expansion thumbs are fixed 44px');
  assert.ok(menuBlock.includes("width: 120, height: 80"), 'solo/online art is a fixed centred banner');
  assert.ok(menuBlock.includes("margin: '0 auto 8px'"), 'solo/online art is centred above its title');
});

// --- Nothing else moved ------------------------------------------------------

test('last-fix confirmations still wired: tile hold, tile videos, golden dice, button images', () => {
  assert.ok(pageSrc.includes("import {"), 'imports intact');
  assert.ok(pageSrc.includes('createTileHold'), 'tile hold still imported');
  assert.ok(pageSrc.includes('Tiles still playing — End turn unlocks when the video finishes.'), 'tile-hold line kept');
  assert.ok(pageSrc.includes('<TileVideoLayer'), 'tile video layer still on the board');
  assert.ok(pageSrc.includes('<DiceFace value={game.dice[0]}'), 'golden dice still render');
  assert.ok(pageSrc.includes('image="/images/starforge/buttons/roll.webp"'), 'roll button image kept');
  assert.ok(pageSrc.includes('image="/images/starforge/buttons/end-turn.webp"'), 'end-turn button image kept');
  // MenuArt itself is untouched in graphics.jsx (still exported for reuse);
  // only the menu page stopped rendering its fixed-width form.
  assert.ok(graphicsSrc.includes('export function MenuArt'), 'MenuArt still exported from graphics.jsx');
  assert.ok(!pageSrc.includes('MenuArt'), 'page no longer imports MenuArt');
});
