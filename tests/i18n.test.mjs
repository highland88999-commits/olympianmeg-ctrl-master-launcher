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

// --- key coverage: all 134 satellites + sections + chrome ---
const satKeys = enKeys.filter((k) => k.startsWith('sat.'));
t('134 satellites x title+subtitle = 268 sat keys', satKeys.length === 268);
t('section names present', ['games', 'utilities', 'tools', 'ai-programs', 'observatory', 'therapy', 'sanctum', 'shopping'].every((s) => en[`sec.${s}.name`]));
t('constellation names present', ['zeus', 'ares', 'thoth', 'argus', 'medusa', 'artemis'].every((c) => en[`const.${c}`]));
t('ui chrome keys present', ['ui.nexusHub', 'ui.operator', 'ui.collapse', 'ui.language', 'ui.disconnect'].every((k) => en[k]));

// --- registry integrity ---
const regSrc = readFileSync('lib/i18n/satellites.ts', 'utf8');
const satBlock = regSrc.slice(regSrc.indexOf('export const SATELLITES'), regSrc.indexOf('\n];', regSrc.indexOf('export const SATELLITES')));
const routes = [...satBlock.matchAll(/route: "([^"]+)"/g)].map((m) => m[1]);
t('registry has 134 entries', routes.length === 134);
t('registry routes unique', new Set(routes).size === 134);
const keys = [...satBlock.matchAll(/key: "([^"]+)"/g)].map((m) => m[1]);
t('registry keys unique', new Set(keys).size === 134);
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
  /\{ key: "store", route: "\/store", pos: "ARGUS_POS", section: "SHOPPING", constellation: "ARGUS" \}/.test(satBlock));
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
t('POS_MAP covers all six targets', /ZEUS_POS, ARES_POS, THOTH_POS, ARGUS_POS, BABEL_POS, MEDUSA_POS/.test(launcher));

// --- core module: fallback + language list ---
const core = readFileSync('lib/i18n/index.tsx', 'utf8');
t('English fallback for missing keys', /en\[key\]/.test(core));
t('7 languages registered', (core.match(/code: '[a-z]+'/g) || []).length === 7);
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
