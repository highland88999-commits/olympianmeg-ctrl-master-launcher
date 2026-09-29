// tests/tools.test.js
// Headless tests for the TOOLS command deck (app/tools/page.jsx) and the
// TOOLS registry home (lib/i18n/satellites.ts + locale labels).
// Run: node tests/tools.test.js  (from the repo root). No browser, no network.

const { readFileSync, existsSync } = require('fs');

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error('FAIL: ' + name); }
}

// ---- fixtures ----
const registry = readFileSync('lib/i18n/satellites.ts', 'utf8');
const launcher = readFileSync('app/page.jsx', 'utf8');
const hub = readFileSync('app/tools/page.jsx', 'utf8');
const en = JSON.parse(readFileSync('lib/i18n/locales/en.json', 'utf8'));

function entries(src) {
  const out = [];
  const re = /\{\s*key:\s*"([^"]+)",\s*route:\s*"([^"]+)",\s*pos:\s*"([^"]+)",\s*section:\s*"([^"]+)",\s*constellation:\s*"([^"]+)"\s*\}/g;
  let m;
  while ((m = re.exec(src))) out.push({ key: m[1], route: m[2], pos: m[3], section: m[4], constellation: m[5] });
  return out;
}
function sections(src) {
  const out = [];
  const re = /\{\s*name:\s*"([^"]+)",\s*key:\s*"([^"]+)",\s*constellation:\s*"([^"]+)"\s*\}/g;
  let m;
  while ((m = re.exec(src))) out.push({ name: m[1], key: m[2], constellation: m[3] });
  return out;
}

const sats = entries(registry);
const secs = sections(registry);
const TOOLS = sats.filter((s) => s.section === 'TOOLS');

const EXPECTED_TOOLS = [
  'forge', 'terminal', 'holoframe', 'nexus-model-generation',
  'manuscript-forge', 'nexus-codex', 'resume',
  'plutus', 'merlin-mandates', 'cerberus',
  'phone-home', 'fortress-of-solitude', 'ares', 'hephaestus', 'prime',
];

// ---- registry: TOOLS home ----
t('TOOLS section exists in SECTIONS', secs.some((s) => s.name === 'TOOLS' && s.key === 'tools'));
t('TOOLS section uses the ARES constellation', secs.find((s) => s.name === 'TOOLS').constellation === 'ARES');
t('TOOLS section has exactly 16 entries (hub + 15 tools)', TOOLS.length === 16);
t('hub entry /tools is first in the TOOLS block', TOOLS[0].key === 'tools' && TOOLS[0].route === '/tools');
t('all 15 true tools moved into TOOLS',
  EXPECTED_TOOLS.every((k) => TOOLS.some((s) => s.key === k && s.route === '/' + k)));
t('no true tool left in UTILITIES', !sats.some((s) => s.section === 'UTILITIES' && EXPECTED_TOOLS.includes(s.key)));
t('no true tool left in AI PROGRAMS', !sats.some((s) => s.section === 'AI PROGRAMS' && EXPECTED_TOOLS.includes(s.key)));
t('all TOOLS entries share ARES_POS', TOOLS.every((s) => s.pos === 'ARES_POS'));
t('all TOOLS entries carry the ARES constellation', TOOLS.every((s) => s.constellation === 'ARES'));
t('no duplicate satellite keys', new Set(sats.map((s) => s.key)).size === sats.length);

// ---- registry: nav-render safety against app/page.jsx ----
const accentNames = [...launcher.matchAll(/^\s{2}(\w+):\s*\{ dot:/gm)].map((m) => m[1]);
const posNames = (launcher.match(/const POS_MAP = \{([^}]+)\}/) || ['', ''])[1].split(',').map((s) => s.trim()).filter(Boolean);
t('every section constellation has an ACCENT entry (no nav crash)',
  secs.every((s) => accentNames.includes(s.constellation)));
t('every satellite pos is a valid POS_MAP key (no undefined dive target)',
  sats.every((s) => posNames.includes(s.pos)));

// ---- routes resolve ----
t('all TOOLS routes have a page file',
  TOOLS.every((s) => {
    const dir = 'app' + s.route;
    return existsSync(dir + '/page.jsx') || existsSync(dir + '/page.tsx');
  }));

// ---- i18n labels ----
t('en: sec.tools.name present', !!en['sec.tools.name']);
t('en: sat.tools.title + subtitle present', !!en['sat.tools.title'] && !!en['sat.tools.subtitle']);
t('en: every TOOLS satellite has a title', TOOLS.every((s) => !!en['sat.' + s.key + '.title']));

// ---- hub page: lists every true tool ----
t('hub defines launchPocketUniverse(route, targetPos)', /function launchPocketUniverse\(route, targetPos\)/.test(hub));
t('hub launches through launchPocketUniverse', /onClick=\{\(\) => launchPocketUniverse\(route/.test(hub));
t('hub lists all 14 tools', EXPECTED_TOOLS.every((k) => hub.includes("'" + k + "'")));
t('hub cards resolve routes from the registry', /SATELLITES\.find\(\(s\) => s\.key === key\)/.test(hub));
t('hub has a plain-English description per tool',
  EXPECTED_TOOLS.every((k) => new RegExp("'" + k + "': '[^']{20,}'").test(hub)));
t('hub has a filter input', /type="search"/.test(hub) && /Filter tools/.test(hub));
t('hub links back to the launcher', /router\.push\('\/'\)/.test(hub));
t('hub groups cards (Build/Write/Organize/Connect)', /'Build'/.test(hub) && /'Connect & Guard'/.test(hub));

// ---- hub: quality bar ----
const hubCode = hub.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
t('hub makes zero external requests', !/https?:\/\//.test(hubCode) && !/fetch\(/.test(hubCode));
t('hub uses system fonts only', !/fonts\.googleapis|@font-face/.test(hubCode));
t('hub cards are real buttons with labels', /<button[\s\S]*?className="tools-card"[\s\S]*?aria-label/.test(hub));
t('hub copy has no invented slogans or hype words',
  !/empire|multiverse|revolution|ultimate|premium|best-in-class/i.test(hubCode));

console.log(`\ntools: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
