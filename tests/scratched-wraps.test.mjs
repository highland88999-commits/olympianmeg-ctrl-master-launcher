// tests/scratched-wraps.test.mjs — headless tests for the COLORED
// SCRATCHED-METAL WRAPS (Merlin, 2026-11-15): eight scratched-metal
// photos in eight colours, each wrapped onto the structures Merlin
// approved. Run:
//   node tests/scratched-wraps.test.mjs (from the repo root).
// No browser, no network — proves:
//   * each photo is Merlin's upload, byte-for-byte, at the one
//     shared path (public/textures/scratched/<color>.jpg)
//   * the shared module exports the URLs + hashes + reflective
//     props (metalness 0.9, roughness 0.3) and both the R3F hook
//     and the imperative apply helper
//   * the deep-gold ninth upload was NOT copied again — it is
//     byte-identical to the archway gold, which still lives at its
//     one path (public/textures/gold/gold-scratched.jpg)
//   * every placed wrap is wired in its scene (source-level):
//     the named meshes wear the wrap, with the structure's own
//     material as fallback so nothing goes blank
//   * the things that must stay are still there: video floors,
//     gold caps, glow panels/discs, emissive accents, doorway
//     art, PortalArches (gold), labels
//   * the placements that could NOT honestly be made are absent:
//     Star Wars landmarks, Ghost Rider, Life, Anti-Life, the ARES
//     prison, the Fortress of Solitude — no wrap was faked onto
//     any of them (and the Moon scene was never touched: the flag
//     worker was editing it live)
import { createHash } from 'crypto';
import { existsSync, readFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  SCRATCHED_TEXTURES,
  SCRATCHED_COLORS,
  SCRATCHED_METALNESS,
  SCRATCHED_ROUGHNESS,
  scratchedTextureUrl,
  useScratchedTexture,
  useScratchedMaterial,
  applyScratchedToMaterial,
} from '../lib/portal/scratched-textures.js';
import {
  GOLD_TEXTURE_URL,
  GOLD_TEXTURE_SHA256,
} from '../lib/portal/gold-texture.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${name}`);
  }
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
function count(src, needle) {
  return src.split(needle).length - 1;
}
function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}
/* Body of `function NAME(` up to the next top-level function. */
function fnBody(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return '';
  const next = src.indexOf('\nfunction ', start + 1);
  return src.slice(start, next < 0 ? src.length : next);
}

/* --- A. The eight photos on disk: Merlin's uploads, byte-for-byte. --- */
t('8 scratched colours', SCRATCHED_COLORS.length === 8);
for (const color of SCRATCHED_COLORS) {
  const entry = SCRATCHED_TEXTURES[color];
  const file = join(ROOT, 'public', entry.url.slice(1));
  t(`${color} file exists at ${entry.url}`, existsSync(file));
  if (existsSync(file)) {
    t(`${color} SHA matches the upload`, sha256(file) === entry.sha256);
    t(`${color} byte size matches`, statSync(file).size === entry.bytes);
    t(
      `${color} URL is under the one shared path`,
      entry.url.startsWith('/textures/scratched/'),
    );
  }
}

/* --- B. The shared module. --- */
t('metalness is 0.9', SCRATCHED_METALNESS === 0.9);
t('roughness is 0.3', SCRATCHED_ROUGHNESS === 0.3);
t('scratchedTextureUrl is a function', typeof scratchedTextureUrl === 'function');
t('useScratchedTexture is a function', typeof useScratchedTexture === 'function');
t('useScratchedMaterial is a function', typeof useScratchedMaterial === 'function');
t('applyScratchedToMaterial is a function', typeof applyScratchedToMaterial === 'function');
t(
  "scratchedTextureUrl('cyan') returns the shared path",
  scratchedTextureUrl('cyan') === '/textures/scratched/cyan.jpg',
);
let threw = false;
try {
  scratchedTextureUrl('nope');
} catch (e) {
  threw = true;
}
t('scratchedTextureUrl throws on an unknown colour', threw);

/* --- C. The deep-gold ninth upload was NOT copied again. --- */
const goldFile = join(ROOT, 'public', GOLD_TEXTURE_URL.slice(1));
t('archway gold still exists at its one path', existsSync(goldFile));
if (existsSync(goldFile)) {
  t('archway gold SHA unchanged', sha256(goldFile) === GOLD_TEXTURE_SHA256);
}
for (const color of SCRATCHED_COLORS) {
  const file = join(ROOT, 'public', SCRATCHED_TEXTURES[color].url.slice(1));
  t(
    `${color} is not a second copy of the archway gold`,
    sha256(file) !== GOLD_TEXTURE_SHA256,
  );
}

/* --- D. Wiring, per placed wrap. --- */

/* CYAN — Helheim ice. */
const helheim = read('app/helheim/world3d.js');
t('helheim imports useScratchedMaterial', helheim.includes("from '@/lib/portal/scratched-textures'"));
t('helheim FrostPools: 2 cyan hooks', count(fnBody(helheim, 'FrostPools'), "useScratchedMaterial('cyan'") === 2);
t('helheim FrozenShore: 2 cyan hooks', count(fnBody(helheim, 'FrozenShore'), "useScratchedMaterial('cyan'") === 2);
t('helheim: 4 cyan hooks total', count(helheim, "useScratchedMaterial('cyan'") === 4);
t('helheim Ground() keeps its video wrap', fnBody(helheim, 'Ground').includes('useNetherVideoTexture'));
t('helheim Ground() has no scratched ref', !fnBody(helheim, 'Ground').includes('scratched'));

/* BLUE — Dutchman hull + barrels; Tlalocan river + pools. */
const ship = read('app/flying-dutchman/ship3d.js');
t('ship3d imports applyScratchedToMaterial', ship.includes('applyScratchedToMaterial'));
t('ship3d hull carries UVs for the map', ship.includes("setAttribute('uv'"));
t(
  "ship3d setSkin applies the blue wrap",
  fnBody(ship, 'setSkin').includes("applyScratchedToMaterial(m, 'blue')"),
);
t('ship3d setSkin restores the original material', fnBody(ship, 'setSkin').includes('_scratchOrig'));
const tlalocan = read('app/tlalocan/world3d.js');
t('tlalocan imports the scratched module', tlalocan.includes("from '@/lib/portal/scratched-textures'"));
t('tlalocan Pools: 2 blue hooks', count(fnBody(tlalocan, 'Pools'), "useScratchedMaterial('blue'") === 2);
t('tlalocan River loads the blue texture', fnBody(tlalocan, 'River').includes("useScratchedTexture('blue')"));
t('tlalocan River scrolls a clone, not the shared texture', fnBody(tlalocan, 'River').includes('.clone()'));

/* GREEN — Tlalocan pyramid tiers only. */
t('tlalocan Center: 4 green tier hooks', count(fnBody(tlalocan, 'Center'), "useScratchedMaterial('green'") === 4);
t('tlalocan gold cap stays gold', tlalocan.includes('#f5c542'));

/* RED — Mars 2 rover + outpost. */
const mars2 = read('components/mars2/Mars2Scene.jsx');
t('mars2 imports useScratchedMaterial', mars2.includes("from '@/lib/portal/scratched-textures'"));
t('mars2 Outpost: 4 red hooks', count(fnBody(mars2, 'Outpost'), "useScratchedMaterial('red'") === 4);
t('mars2 RoverModel: 3 red hooks', count(fnBody(mars2, 'RoverModel'), "useScratchedMaterial('red'") === 3);
t('mars2: 7 red hooks total', count(mars2, "useScratchedMaterial('red'") === 7);
t('mars2 fallback keeps each part’s own material', mars2.includes('function scratchedFallback(mat)'));
t('mars2 pad / panels / treads stay unwrapped', count(mars2, 'material={mats.') >= 3);

/* PURPLE — Naraka landmark, Xibalba ballcourt, Kur throne hall. */
const naraka = read('app/naraka/world3d.js');
t('naraka imports useScratchedMaterial', naraka.includes("from '@/lib/portal/scratched-textures'"));
t('naraka Landmark: 4 purple hooks', count(fnBody(naraka, 'Landmark'), "useScratchedMaterial('purple'") === 4);
t('naraka throne glow panel stays saffron', naraka.includes('#ffab2e'));
t('naraka Ground() has no scratched ref', !fnBody(naraka, 'Ground').includes('scratched'));
const xibalba = read('app/xibalba/world3d.js');
t('xibalba imports useScratchedMaterial', xibalba.includes("from '@/lib/portal/scratched-textures'"));
t('xibalba Ballcourt: 3 purple hooks', count(fnBody(xibalba, 'Ballcourt'), "useScratchedMaterial('purple'") === 3);
t('xibalba ballcourt ring is wrapped with the court', fnBody(xibalba, 'Ballcourt').includes('ringMat'));
t('xibalba Ground() has no scratched ref', !fnBody(xibalba, 'Ground').includes('scratched'));
const kur = read('app/kur/world3d.js');
t('kur imports useScratchedMaterial', kur.includes("from '@/lib/portal/scratched-textures'"));
t('kur ThroneHall: 4 purple hooks', count(fnBody(kur, 'ThroneHall'), "useScratchedMaterial('purple'") === 4);
t('kur ember insets stay ember', count(kur, '#e07a2a') >= 2);
t('kur Ground() has no scratched ref', !fnBody(kur, 'Ground').includes('scratched'));

/* MAGENTA — hologram ring + studio accents. */
const holo = read('components/world-engine/HologramPreview.jsx');
t('hologram imports applyScratchedToMaterial', holo.includes('applyScratchedToMaterial'));
t('hologram ring wears magenta', holo.includes("applyScratchedToMaterial(ringMaterial, 'magenta')"));
t('hologram ring fallback is plain magenta metal', holo.includes('0xe600a8'));
const studio = read('app/world-engine/studio/page.jsx');
t('studio imports scratchedTextureUrl', studio.includes('scratchedTextureUrl'));
t('studio slider tracks use the magenta URL', studio.includes('background-image: url(${MAGENTA_WRAP_URL})'));

/* BRIGHT GOLD — Sun base interior, hub tower rings, Duat barque + hall. */
const sunbase = read('components/SunBaseScene.jsx');
t('sunbase imports applyScratchedToMaterial', sunbase.includes('applyScratchedToMaterial'));
t('sunbase wraps only structural colours', sunbase.includes('STRUCTURAL_COLORS'));
t('sunbase applies bright-gold', sunbase.includes("applyScratchedToMaterial(m, 'bright-gold')"));
const tower = read('components/GodTower.jsx');
t('tower imports useScratchedMaterial', tower.includes("from '@/lib/portal/scratched-textures'"));
t('tower: 1 bright-gold ring hook', count(tower, "useScratchedMaterial('bright-gold'") === 1);
t('tower: 4 ring meshes wear the wrap', count(tower, '{...ringWrapMat}') === 4);
const duat = read('app/duat/world3d.js');
t('duat imports useScratchedMaterial', duat.includes("from '@/lib/portal/scratched-textures'"));
t('duat Barque: bright-gold hook', count(fnBody(duat, 'Barque'), "useScratchedMaterial('bright-gold'") === 1);
t('duat Hall: bright-gold hook', count(fnBody(duat, 'Hall'), "useScratchedMaterial('bright-gold'") === 1);
t('duat sun disc stays a glow disc, unwrapped', fnBody(duat, 'Barque').includes('NOT wrapped: the sun disc'));
t('duat Ground() has no scratched ref', !fnBody(duat, 'Ground').includes('scratched'));

/* --- E. The placements that could NOT honestly be made are absent. --- */
const ABSENT = [
  ['Star Wars landmarks (worker refused)', 'app/star-wars/landmarks.js'],
  ['Ghost Rider (no metal structure)', 'app/ghost-rider/world3d.js'],
  ['Life (2D canvas, no surface)', 'app/life/canvas.js'],
  ['Anti-Life (2D canvas, no surface)', 'app/anti-life/canvas.js'],
  ['ARES prison (bars are blue energy)', 'app/ares/prison/world3d.jsx'],
  ['Fortress of Solitude (vault UI, no 3D scene)', 'app/fortress-of-solitude/page.tsx'],
  ['forge agent (profile coordinator’s work)', 'lib/world-engine/forge-agent.js'],
  ['portal gun (profile coordinator’s work)', 'lib/portal/gun.js'],
];
for (const [label, rel] of ABSENT) {
  const src = read(rel);
  t(
    `${label}: no scratched-textures import`,
    !src.includes('scratched-textures'),
  );
  t(
    `${label}: no wrap hook or apply call`,
    !src.includes('useScratchedMaterial') && !src.includes('applyScratchedToMaterial'),
  );
}
const moon = read('components/MoonScene.jsx');
t('Moon scene: no scratched-textures import (flag worker’s file)', !moon.includes('scratched-textures'));

console.log(`\nscratched-wraps: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
