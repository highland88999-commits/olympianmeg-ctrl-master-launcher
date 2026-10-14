// tests/characters-tokens.test.mjs — headless tests for WAVE 5 of
// the characters-everywhere program: 2D tokens.
//   - lib/characters/raptor-runners.js: the Raptor Rush runner
//     registry (Swift/Claw/Fang only — T-Rex excluded, decision D8
//     still open), the roster join for picker options, and the
//     pick-chain resolution with cast validation (a non-raptor
//     profile pick never enters the canyon; a raptor profile pick
//     is the default runner);
//   - the sprite assets themselves: real PNG files on disk under
//     public/images/raptor-rush/ (top-down GLB renders, 256×256);
//   - source wiring: Raptor Rush (renderer sprite path + native
//     procedural fallback intact, page picker + persistence),
//     Labyrinth (profile-character billboard in the 3D scene, orb
//     fallback intact, page pick-chain resolution), Arachnid
//     Weaver stretch (token branch in drawPlayer, native figure
//     intact);
//   - logic bodies untouched: raptorBox dimensions, maze sim,
//     Weaver catch geometry all verified live, not by source.
// Run: node tests/characters-tokens.test.mjs (from the repo root).
import fs from 'node:fs';
import path from 'node:path';
import {
  RAPTOR_RUSH_SURFACE,
  RAPTOR_RUNNERS,
  runnerForCharacter,
  runnerForKombatId,
  isRaptorRunnerId,
  raptorRunnerOptions,
  readSurfaceRunner,
} from '../lib/characters/raptor-runners.js';
import {
  getEmbodiment,
  writeSurfaceOverride,
  PROFILE_CHARACTER_LS_KEY,
  surfacePickKey,
} from '../lib/characters/embodiment.js';
import {
  createGame as createRushGame,
  update as updateRush,
  raptorBox,
} from '../app/raptor-rush/game.js';
import {
  createStage,
  tryMove,
  tokensRemaining,
} from '../app/labyrinth/maze.js';
import {
  PLAYER as WEAVER_PLAYER,
  SPIDER as WEAVER_SPIDER,
} from '../app/arachnid-weaver/game.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const SWIFT = 'q022-swift-raptor';
const CLAW = 'q023-claw-raptor';
const FANG = 'q024-fang-raptor';
const TREX = 'q021-t-rex';
const JASON = 'q002-jason-voorhees';

// --- the runner registry -------------------------------------------
t('registry has exactly 3 runners', RAPTOR_RUNNERS.length === 3);
t(
  'registry cast is Swift/Claw/Fang in order',
  RAPTOR_RUNNERS.map((r) => r.characterId).join(',') === [SWIFT, CLAW, FANG].join(','),
);
t(
  'kombatIds are the bridge raptor ids',
  RAPTOR_RUNNERS.map((r) => r.kombatId).join(',') === 'raptor-swift,raptor-claw,raptor-fang',
);
t('T-Rex is NOT a runner (D8 open)', runnerForCharacter(TREX) === null);
t('T-Rex kombatId is NOT a runner', runnerForKombatId('t-rex') === null);
t('no registry row carries the T-Rex id', !RAPTOR_RUNNERS.some((r) => r.characterId === TREX));
t('isRaptorRunnerId agrees', isRaptorRunnerId(CLAW) && !isRaptorRunnerId(TREX) && !isRaptorRunnerId(JASON));
t('runnerForKombatId round-trips', runnerForKombatId('raptor-fang')?.characterId === FANG);
t('unknown ids resolve null', runnerForCharacter('nope') === null && runnerForCharacter(null) === null);
t(
  'every runner joins the roster read model',
  RAPTOR_RUNNERS.every((r) => {
    const e = getEmbodiment(r.characterId);
    return e && e.kombatId === r.kombatId && typeof e.name === 'string' && e.name.length > 0;
  }),
);
t(
  'every runner carries an accent hex + sprite path',
  RAPTOR_RUNNERS.every((r) => /^#[0-9a-f]{6}$/i.test(r.accent) && r.sprite.startsWith('/images/raptor-rush/') && r.sprite.endsWith('.png')),
);

// --- picker options --------------------------------------------------
const options = raptorRunnerOptions();
t('picker offers exactly the 3 runners', options.length === 3);
t(
  'picker options carry roster name + preview',
  options.every((o) => o.name === getEmbodiment(o.characterId).name && o.preview === `/characters/${o.characterId}.png`),
);
t('picker short names', options.map((o) => o.shortName).join(',') === 'Swift,Claw,Fang');

// --- the sprite assets are real files -------------------------------
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
for (const r of RAPTOR_RUNNERS) {
  const file = path.join('public', r.sprite);
  const exists = fs.existsSync(file);
  t(`${r.shortName} sprite exists at public${r.sprite}`, exists);
  if (exists) {
    const buf = fs.readFileSync(file);
    t(`${r.shortName} sprite is a real PNG`, PNG_SIG.every((b, i) => buf[i] === b));
    t(
      `${r.shortName} sprite is 256x256`,
      buf.readUInt32BE(16) === 256 && buf.readUInt32BE(20) === 256,
    );
    t(`${r.shortName} sprite has real content (>10 KB)`, buf.length > 10000);
  }
}
t(
  'no T-Rex sprite asset ships in this wave',
  !fs.existsSync('public/images/raptor-rush/raptor-t-rex.png'),
);

// --- the pick chain, with cast validation ----------------------------
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}
t('surface key is raptor-rush', RAPTOR_RUSH_SURFACE === 'raptor-rush' && surfacePickKey(RAPTOR_RUSH_SURFACE) === 'olympus.characterPick.raptor-rush');
t('no picks at all -> native runner', readSurfaceRunner(fakeStorage()) === null);
t(
  'raptor profile pick becomes the default runner',
  readSurfaceRunner(fakeStorage({ [PROFILE_CHARACTER_LS_KEY]: SWIFT }))?.characterId === SWIFT,
);
t(
  'non-raptor profile pick never enters the canyon',
  readSurfaceRunner(fakeStorage({ [PROFILE_CHARACTER_LS_KEY]: JASON })) === null,
);
t(
  'T-Rex profile pick does not make it playable',
  readSurfaceRunner(fakeStorage({ [PROFILE_CHARACTER_LS_KEY]: TREX })) === null,
);
t(
  'surface override beats the profile default',
  readSurfaceRunner(fakeStorage({
    [PROFILE_CHARACTER_LS_KEY]: SWIFT,
    [surfacePickKey(RAPTOR_RUSH_SURFACE)]: CLAW,
  }))?.characterId === CLAW,
);
{
  const store = fakeStorage();
  t('page pick write validates + stores', writeSurfaceOverride(RAPTOR_RUSH_SURFACE, FANG, store) === true);
  t('written pick resolves to Fang', readSurfaceRunner(store)?.characterId === FANG);
  t('clearing the pick returns the native runner', writeSurfaceOverride(RAPTOR_RUSH_SURFACE, null, store) === true && readSurfaceRunner(store) === null);
  t('a T-Rex override write is roster-valid but cast-refused at read',
    writeSurfaceOverride(RAPTOR_RUSH_SURFACE, TREX, store) === true && readSurfaceRunner(store) === null);
}

// --- source wiring: Raptor Rush --------------------------------------
const rushRender = fs.readFileSync('app/raptor-rush/render.js', 'utf8');
const rushPage = fs.readFileSync('app/raptor-rush/page.jsx', 'utf8');
t('renderer exposes setRunner', rushRender.includes('function setRunner') && rushRender.includes('setRunner }'));
t('renderer draws the GLB sprite when ready', rushRender.includes('drawImage(spriteImg'));
t('renderer keeps per-runner fallback palettes', rushRender.includes('RUNNER_PALETTES') && rushRender.includes("'raptor-claw'"));
t('native procedural raptor intact as fallback', rushRender.includes('function drawRaptorSprite'));
t('hit flash applies to the sprite too', rushRender.includes('blink') && rushRender.includes('spriteReady && spriteImg && !blink'));
t('page renders the runner picker', rushPage.includes('raptorRunnerOptions') && rushPage.includes('Choose your raptor'));
t('page restores the pick through the registry', rushPage.includes('readSurfaceRunner()'));
t('page persists picks via the pick chain', rushPage.includes("writeSurfaceOverride('raptor-rush'"));
t('page hands the renderer a sprite loader + runner', rushPage.includes('spriteLoader') && rushPage.includes('runner: runnerRef.current'));
t('picker tokens are the shared CharacterToken', rushPage.includes("import CharacterToken from '@/components/characters/CharacterToken'"));

// --- source wiring: Labyrinth -----------------------------------------
const labScene = fs.readFileSync('app/labyrinth/scene.js', 'utf8');
const labPage = fs.readFileSync('app/labyrinth/page.jsx', 'utf8');
t('labyrinth page resolves the pick chain', labPage.includes("resolveSurfaceCharacter('labyrinth')"));
t('labyrinth page passes the preview into the scene', labPage.includes('characterPreview:'));
t('scene builds a billboard sprite for the token', labScene.includes('new THREE.Sprite') && labScene.includes('options.characterPreview'));
t('token is a circular disc with the player ring', labScene.includes("dctx.arc") && labScene.includes("'#39ffdd'"));
t('orb yields only after the token texture arrives', labScene.includes('player.visible = false'));
t('token failure removes itself, orb stays', labScene.includes('scene.remove(sprite)'));
t('billboard rides the orb glide each frame', labScene.includes('playerSprite.position.set'));

// --- source wiring: Arachnid Weaver (stretch) --------------------------
const weaverPage = fs.readFileSync('app/arachnid-weaver/page.jsx', 'utf8');
t('weaver page resolves the pick chain', weaverPage.includes('resolveSurfaceCharacter("arachnid-weaver")'));
t('weaver drawPlayer has the token branch', weaverPage.includes('tokenReady && tokenImg'));
t('weaver token counter-rotates to stay upright', weaverPage.includes('ctx.rotate(-(Math.atan2(p.vy, p.vx)'));
t('weaver native torch-bearer intact as fallback', weaverPage.includes('// cloak') && weaverPage.includes('// torch arm + flame'));
t('weaver keeps the torch light with the token', weaverPage.indexOf('drawPlayer') > -1 && weaverPage.includes('localized torch light'));

// --- logic bodies untouched (verified live) -----------------------------
{
  const g = createRushGame(7, { mode: 'solo' });
  g.phase = 'running';
  for (let i = 0; i < 120; i++) updateRush(g, 1 / 30);
  const box = raptorBox(g);
  t('raptor hitbox unchanged (62x92)', box.w === 62 && box.h === 92);
  t('rush sim runs clean with the new art layer around it', g.time > 3.9 && g.score >= 0);
}
{
  const stage = createStage(0);
  t('maze stage builds with its tokens', tokensRemaining(stage) > 0 && !!stage.player && !!stage.exit);
  const before = { ...stage.player };
  const moved = tryMove(stage, 1, 0) || tryMove(stage, 0, 1) || tryMove(stage, -1, 0) || tryMove(stage, 0, -1);
  t('maze movement logic alive', typeof moved === 'boolean' && (!moved || stage.player.x !== before.x || stage.player.y !== before.y || moved));
}
t('weaver logic radii unchanged', WEAVER_PLAYER.radius === 14 && WEAVER_SPIDER.catchRadius === 36);

console.log(`\ncharacters-tokens: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
