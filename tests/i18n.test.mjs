// tests/i18n.test.mjs
// Headless tests for the Nexus i18n system. Run: node tests/i18n.test.mjs
// (from the repo root). No browser, no network — asserts on dictionaries,
// the satellite registry, and the launcher's data-driven menu.
import { readFileSync, readdirSync } from 'fs';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const LOCALES = ['en', 'el', 'es', 'fr', 'de', 'pt', 'it'];
const dicts = {};
for (const code of LOCALES) {
  dicts[code] = JSON.parse(readFileSync(`lib/i18n/locales/${code}.json`, 'utf8'));
}
const en = dicts.en;
const enKeys = Object.keys(en);

// --- dictionary completeness: every locale has every English key ---
for (const code of LOCALES) {
  const missing = enKeys.filter((k) => !(k in dicts[code]));
  t(`${code}: no missing keys (${missing.length})`, missing.length === 0);
  const empty = enKeys.filter((k) => !dicts[code][k] || !String(dicts[code][k]).trim());
  t(`${code}: no empty strings (${empty.length})`, empty.length === 0);
}

// --- key coverage: all 215 satellites + sections + chrome ---
// (196 at the last count + nether-realm/styx from the Hades build +
// the 12 nether-realms homes, Nov 12, 2026 + Earth 4, Nov 14, 2026
// + Moon + Sun Base, Nov 14, 2026 + Jupiter 2 + Mars 2, Nov 15, 2026
// + Ghost Rider, Nov 15, 2026 − Weapons Forge, Nov 15, 2026
// + Land of the Dead (THANATOS menu), Nov 16, 2026 − ARES satellite,
// Nov 16, 2026 (Merlin's order: the Concourse ARES tile is now the
// only access; the /ares route and all ARES function stay intact)
// − Land of the Dead seat, Nov 16, 2026 (Merlin's order: floor drop
// only, no portal card, no menu — the realm leaves both registries)
// − Portal Room seat, Nov 16, 2026 (portal menu merge — the 2D room
// is gone; the 3D hall is the one menu).
// Net: 220 entries, 414 en sat keys. (+ Keepsake, Nov 17, 2026; + Red Moon, Nov 17, 2026; + Job Board, Nov 21, 2026 — pins were stale at 215, registry was already 216; + Housing, Nov 21, 2026; + Social Assistance + Business Services, Nov 21, 2026)
const satKeys = enKeys.filter((k) => k.startsWith('sat.'));
t('en sat keys = 414 (220 registry entries; Housing + Social Assistance + Business Services title+subtitle added Nov 21, 2026; Job Board title+subtitle added Nov 21, 2026)', satKeys.length === 414);
t('section names present', ['games', 'utilities', 'tools', 'ai-programs', 'observatory', 'therapy', 'sanctum', 'shopping'].every((s) => en[`sec.${s}.name`]));
t('constellation names present', ['zeus', 'ares', 'thoth', 'argus', 'medusa', 'artemis'].every((c) => en[`const.${c}`]));
t('ui chrome keys present', ['ui.nexusHub', 'ui.operator', 'ui.collapse', 'ui.language', 'ui.disconnect'].every((k) => en[k]));

// --- registry integrity ---
const regSrc = readFileSync('lib/i18n/satellites.ts', 'utf8');
const satBlock = regSrc.slice(regSrc.indexOf('export const SATELLITES'), regSrc.indexOf('\n];', regSrc.indexOf('export const SATELLITES')));
const routes = [...satBlock.matchAll(/route: "([^"]+)"/g)].map((m) => m[1]);
t('registry has 220 entries', routes.length === 220);
t('registry routes unique', new Set(routes).size === 220);
const keys = [...satBlock.matchAll(/key: "([^"]+)"/g)].map((m) => m[1]);
t('registry keys unique', new Set(keys).size === 220);
// every registry key has title+subtitle in en
const missingKeys = keys.filter((k) => !en[`sat.${k}.title`] || !en[`sat.${k}.subtitle`]);
t(`every registry key has en title+subtitle (missing: ${missingKeys.length})`, missingKeys.length === 0);
// every en sat key maps to a registry entry
const orphaned = satKeys.filter((k) => {
  const key = k.slice(4).replace(/\.(title|subtitle)$/, '');
  return !keys.includes(key);
});
t(`no orphaned dictionary keys (orphaned: ${orphaned.length})`, orphaned.length === 0);

// --- SHOPPING section: the HERMES merchant row (2026-09-30) -------------------
const sectionsBlock = regSrc.slice(regSrc.indexOf('export const SECTIONS'));
t('SHOPPING section registered', /name: "SHOPPING", key: "shopping"/.test(sectionsBlock));
t('store satellite wired to /store under SHOPPING',
  /\{ key: "store", route: "\/store", pos: "HERMES", section: "SHOPPING", constellation: "ARGUS" \}/.test(satBlock));
for (const code of LOCALES) {
  t(`${code}: shopping section + store labels present`,
    dicts[code]['sec.shopping.name'] && dicts[code]['sat.store.title'] && dicts[code]['sat.store.subtitle']);
}

// --- launcher wiring ---
const launcher = readFileSync('app/page.jsx', 'utf8');
t('no hardcoded menu buttons remain', !/launchPocketUniverse\('\/[a-z]/.test(launcher));
t('hub builds its satellite index from SATELLITES', /new Map\(SATELLITES\.map/.test(launcher));
const godMenuPanel = readFileSync('components/GodMenuPanel.jsx', 'utf8');
t('menu uses t() for labels', /t\(`sat\.\$\{key\}\.title`\)/.test(godMenuPanel));
t('LanguageProvider wraps hub', /<LanguageProvider>/.test(launcher));
t('SettingsGear in menu header', /<SettingsGear \/>/.test(launcher));
t('POS_MAP covers the ten god-tower targets plus legacy points',
  /GOD_TOWER_POS, BABEL_POS, ARTEMIS_POS/.test(launcher));

// --- core module: fallback + language list ---
const core = readFileSync('lib/i18n/index.tsx', 'utf8');
t('English fallback for missing keys', /en\[key\]/.test(core));
t('34 languages registered', (core.match(/code: '[a-z]+'/g) || []).length === 34);
t('localStorage persistence', /nexus-language/.test(core));
t('browser language auto-detect', /navigator\.language/.test(core));
t('no fetch/XHR in i18n core (bundled dicts)', !/fetch\(|XMLHttpRequest/.test(core));

// --- gear component ---
const gear = readFileSync('components/SettingsGear.tsx', 'utf8');
t('gear closes on outside click', /mousedown/.test(gear));
t('gear closes on Escape', /Escape/.test(gear));
t('gear lists native language names', /l\.native/.test(gear));
t('gear marks current language', /✓/.test(gear));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
