// tests/tatooine-ground.test.mjs — headless tests for the Tatooine
// ground law (Merlin, 2026-11-15): Tatooine is SAND, not grass.
// Run: node tests/tatooine-ground.test.mjs (from the repo root).
// No browser, no network — proves from the planet defs in
// app/star-wars/data.js (the single source the CGI ground painter and
// the walk-zone terrain both read):
//   * Tatooine's ground + ground2 are warm sand hues (red > green >
//     blue, tan/ochre hue), never green-dominant
//   * Tatooine paints with the 'sand' ground family (dune bands +
//     ripples), not 'leaf' or 'swamp'
//   * SWEEP — the same law holds for every desert/arid world (Jakku
//     'desert', Geonosis 'rocky desert'): warm hues, sand/rock family,
//     never green
//   * every planet's tex is a known ground family from cgi.js
//   * Tatooine's menu art exists (the art is sand — checked by eye)
// The grass Merlin saw was in the generated giant-video's invented
// beam/menu frames (frames 8-10 of part 3), not in the live site:
// the code ground was sand before this build and this test pins it.
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PLANETS } from '../app/star-wars/data.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed += 1; }
  else { failed += 1; console.error(`FAIL: ${name}`); }
}

const rgb = (hex) => [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
/* Warm sand/ochre: red strongest, green middle, blue weakest. */
const isWarm = (hex) => { const [r, g, b] = rgb(hex); return r > g && g > b; };
/* Green-dominant: green beats both red and blue by a clear margin. */
const isGreenDominant = (hex) => { const [r, g, b] = rgb(hex); return g > r + 10 && g > b + 10; };

/* The ground families the CGI painter knows (app/star-wars/cgi.js
 * GROUND_PAINTERS / GROUND_STYLE). */
const GROUND_FAMILIES = new Set([
  'sand', 'rock', 'ice', 'lava', 'metal', 'leaf', 'water', 'salt', 'swamp', 'city',
]);

/* --- Tatooine --- */
const tatooine = PLANETS.tatooine;
t('Tatooine exists in PLANETS', !!tatooine);
t("Tatooine biome is 'desert'", tatooine.biome === 'desert');
t('Tatooine ground is warm sand (0xd9a441)', tatooine.ground === 0xd9a441 && isWarm(tatooine.ground));
t('Tatooine ground2 is warm sand (0xb57f2a)', tatooine.ground2 === 0xb57f2a && isWarm(tatooine.ground2));
t('Tatooine ground is NOT green-dominant', !isGreenDominant(tatooine.ground));
t('Tatooine ground2 is NOT green-dominant', !isGreenDominant(tatooine.ground2));
t("Tatooine paints with the 'sand' family", tatooine.tex === 'sand');
t('Tatooine fog is sand-toned, not green', isWarm(tatooine.fog));
t('Tatooine menu art exists', existsSync(join(ROOT, 'public', 'art', 'star-wars', 'tatooine.jpg')));

/* --- sweep: every desert/arid world --- */
const ARID_BIOMES = new Set(['desert', 'rocky desert']);
for (const [id, def] of Object.entries(PLANETS)) {
  if (!ARID_BIOMES.has(def.biome)) continue;
  t(`${id} (${def.biome}): ground is warm, never green`,
    isWarm(def.ground) && !isGreenDominant(def.ground));
  t(`${id} (${def.biome}): ground2 is warm, never green`,
    isWarm(def.ground2) && !isGreenDominant(def.ground2));
  t(`${id} (${def.biome}): tex is sand or rock, never leaf/swamp`,
    def.tex === 'sand' || def.tex === 'rock');
}

/* --- every planet's tex is a known ground family (walk worlds paint
 * ground; fly worlds — Alderaan, Death Star — are starfields with no
 * ground to paint, so tex is undefined by design) --- */
for (const [id, def] of Object.entries(PLANETS)) {
  if (def.kind === 'fly') {
    t(`${id}: fly world carries no ground tex`, def.tex === undefined);
  } else {
    t(`${id}: tex '${def.tex}' is a known ground family`, GROUND_FAMILIES.has(def.tex));
  }
}
t('19 Star Wars worlds enumerated', Object.keys(PLANETS).length === 19);

console.log(`\ntatooine-ground: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
