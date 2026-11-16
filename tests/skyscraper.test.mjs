// tests/skyscraper.test.mjs
// Headless tests for the /skyscraper pocket universe (preservation port of
// highland88999-commits/Skyscraper, the original tower program).
// Run: node tests/skyscraper.test.mjs (from the repo root).
import { readFileSync, existsSync, readdirSync } from 'fs';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const APP = 'app/skyscraper';
const page = readFileSync(`${APP}/page.jsx`, 'utf8');

// --- route + menu + i18n wiring -------------------------------------------
const regSrc = readFileSync('lib/i18n/satellites.ts', 'utf8');
t('satellites.ts: skyscraper entry mirrors BABEL placement',
  /\{ key: "skyscraper", route: "\/skyscraper", pos: "APHRODITE", section: "OBSERVATORY", constellation: "ARGUS" \}/.test(regSrc));

const menusSrc = readFileSync('lib/god-menus.js', 'utf8');
t('god-menus.js: APHRODITE claims skyscraper', menusSrc.includes("'skyscraper'"));

const LOCALES = ['en', 'el', 'es', 'fr', 'de', 'pt', 'it'];
const dicts = {};
for (const code of LOCALES) dicts[code] = JSON.parse(readFileSync(`lib/i18n/locales/${code}.json`, 'utf8'));
for (const code of LOCALES) {
  t(`${code}: sat.skyscraper.title present`, !!dicts[code]['sat.skyscraper.title']?.trim());
  t(`${code}: sat.skyscraper.subtitle present`, !!dicts[code]['sat.skyscraper.subtitle']?.trim());
}

// --- program files present --------------------------------------------------
const comps = readdirSync(`${APP}/components`).filter((f) => /\.(jsx|tsx)$/.test(f));
// CGI makeover (Nov 15, 2026): 35 — the original 34 plus the shared
// CityViewWindow.jsx interior window (one component for floors 1-3).
t('35 components ported', comps.length === 35);
for (const must of ['page.jsx', 'components/NexusEngine.jsx', 'components/RadialMenu.jsx',
    'components/FloorMenu.jsx', 'components/SkyCycle.jsx', 'components/OmegaArchScene.jsx',
    'components/HermesTerminalScene.jsx', 'components/Telemetry.jsx',
    'utils/ZoneRegistry.js', 'utils/suncalc.js']) {
  t(`exists: ${must}`, existsSync(`${APP}/${must}`));
}

// --- mount adaptations -------------------------------------------------------
t('page imports resolve to ./components', page.includes("from './components/RadialMenu'"));
t('page has scoped skyscraper-root', page.includes('id="skyscraper-root"'));
t('page uses 100dvh (iPhone-safe)', page.includes("height: '100dvh'"));
t('model-viewer self-hosted', page.includes('src="/skyscraper/model-viewer.min.js"'));
t('hermes terminal points at internal /hermes',
  readFileSync(`${APP}/components/HermesTerminalScene.jsx`, 'utf8').includes('src="/hermes"'));
t('SkyCycle uses vendored suncalc',
  readFileSync(`${APP}/components/SkyCycle.jsx`, 'utf8').includes("from '../utils/suncalc'"));
t('vendored suncalc exposes getPosition/getMoonPosition',
  /getPosition/.test(readFileSync(`${APP}/utils/suncalc.js`, 'utf8')) &&
  /getMoonPosition/.test(readFileSync(`${APP}/utils/suncalc.js`, 'utf8')));

// strip comments so documentation of removed phone-home can't trip the scanners
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

// --- phone-home stripped ------------------------------------------------------
const teleSrc = readFileSync(`${APP}/components/Telemetry.jsx`, 'utf8');
const omegaSrc = readFileSync(`${APP}/components/OmegaArchScene.jsx`, 'utf8');
const teleCode = codeOnly(teleSrc);
t('Telemetry: no supabase client code', !/createClient|supabase-js|\.from\(|\.rpc\(/i.test(teleCode));
t('Telemetry: no fetch/XHR', !/fetch\s*\(|XMLHttpRequest/.test(teleCode));
t('Telemetry: no http URLs', !/https?:\/\//.test(teleCode));
t('Telemetry: documents the removal', /TELEMETRY REMOVED/.test(teleSrc));

const omegaCode = codeOnly(omegaSrc);
t('OmegaArchScene: no track_ping call', !/\.rpc\(|track_ping\(/.test(omegaCode));
t('OmegaArchScene: no foreign Supabase URL', !/ezfwzqxwafvdjtwnmyrx/.test(omegaCode));
t('OmegaArchScene: documents the removal', /phone-home/.test(omegaSrc));

// --- zero external hotlinks in the ported program ------------------------------
const HOT = ['files.catbox.moe', 'file.garden', 'ajax.googleapis.com', 'modelviewer.dev',
  'amulgdbdvxpikpmldyoq', 'ezfwzqxwafvdjtwnmyrx', 'hermes-landing-nu'];
const hotHits = [];
function scanDir(dir) {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${f.name}`;
    if (f.isDirectory()) { scanDir(p); continue; }
    if (!/\.(jsx|tsx|js)$/.test(f.name)) continue;
    const src = codeOnly(readFileSync(p, 'utf8'));
    for (const h of HOT) if (src.includes(h)) hotHits.push(`${p}: ${h}`);
  }
}
scanDir(APP);
t(`no external hotlinks/phone-home in app/skyscraper (${hotHits.length})`, hotHits.length === 0);
if (hotHits.length) console.error('  hits:', hotHits.join(', '));

// --- Telemetry component behavior: renders null, no network --------------------
// (imported via data: URL because Node has no .jsx loader; the file itself is
// plain ESM with no JSX after neutering)
const teleImportCode = teleSrc.replace(/^'use client';\s*/, '');
const teleMod = await import(`data:text/javascript,${encodeURIComponent(teleImportCode)}`);
const Tele = teleMod.default;
t('Telemetry default-exports a function', typeof Tele === 'function');
t('Telemetry() returns null', Tele() === null);

// --- his program preserved: portals + affiliate inventory intact ----------------
const radial = readFileSync(`${APP}/components/RadialMenu.jsx`, 'utf8');
t('RadialMenu keeps portal inventory', /dominion-auction-house\.vercel\.app/.test(radial));
t('page keeps plot portals (colossus-xi)', /colossus-xi\.vercel\.app/.test(page));
t('SWA sabers affiliate ref preserved',
  page.includes('swasabers.com?sca_ref=12183767.7E1Om8BE4jRk'));
t('restricted-sector password logic preserved',
  page.includes('Redirection#94'));

// --- self-hosted media: every referenced file present on disk ---------------------
// h7317z.mp4 is DOCUMENTED-UNAVAILABLE: the catbox storage node serves 200
// headers but 0 body bytes (verified 2026-10-01, incl. range requests), so the
// file cannot be recovered right now. Floor1's POM video layer degrades to a
// black texture on that one surface (same as the original shows while catbox
// is down for it). Retry the download later to backfill.
const UNAVAILABLE = ['h7317z.mp4'];
const missingMedia = [];
function scanMedia(dir) {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${f.name}`;
    if (f.isDirectory()) { scanMedia(p); continue; }
    if (!/\.(jsx|tsx|js)$/.test(f.name)) continue;
    const src = readFileSync(p, 'utf8');
    for (const m of src.matchAll(/\/media\/skyscraper\/([A-Za-z0-9_.\-]+)/g)) {
      if (!existsSync(`public/media/skyscraper/${m[1]}`) && !missingMedia.includes(m[1]))
        missingMedia.push(m[1]);
    }
  }
}
scanMedia(APP);
const unexpectedMissing = missingMedia.filter((m) => !UNAVAILABLE.includes(m));
t(`all referenced media self-hosted (unexpected missing: ${unexpectedMissing.length})`, unexpectedMissing.length === 0);
t('h7317z.mp4 documented as unavailable', missingMedia.includes('h7317z.mp4'));
if (unexpectedMissing.length) console.error('  missing:', unexpectedMissing.join(', '));

// --- PortalWarp regression (bug report 2026-10-22) ---------------------------
// Exterior.jsx rendered <PortalWarp> at four sites but the component was
// never defined, so /skyscraper died on load with
// "Can't find variable: PortalWarp" (iPhone Safari). Pin the definition,
// the four call sites, and the contract NexusEngine raycasts against.
const exterior = readFileSync(`${APP}/components/Exterior.jsx`, 'utf8');
const nexus = readFileSync(`${APP}/components/NexusEngine.jsx`, 'utf8');
t('Exterior defines PortalWarp', /const PortalWarp = memo\(/.test(exterior));
t('Exterior renders PortalWarp at all four warp sites',
  (exterior.match(/<PortalWarp\b/g) || []).length === 4);
t('PortalWarp mesh carries the caller-provided name', /<mesh name=\{name\}/.test(exterior));
t('PortalWarp tints via color prop with untinted default', /color = '#ffffff'/.test(exterior));
t('NexusEngine teleports on PORTAL_Respawn', nexus.includes("portalHit.object.name === 'PORTAL_Respawn'"));
t('NexusEngine teleports on PORTAL_WarpB', nexus.includes("portalHit.object.name === 'PORTAL_WarpB'"));
// Generic guard for this bug class: every capitalized JSX tag used in
// Exterior.jsx must resolve to an import or a local definition.
{
  const defined = new Set();
  for (const m of exterior.matchAll(/(?:const|function)\s+([A-Z][A-Za-z0-9]*)/g)) defined.add(m[1]);
  for (const m of exterior.matchAll(/import\s+(?:\{([^}]*)\}|([A-Z][A-Za-z0-9]*))/g)) {
    if (m[2]) defined.add(m[2]);
    if (m[1]) for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (/^[A-Z]/.test(name)) defined.add(name);
    }
  }
  const unresolved = [...new Set([...exterior.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map((m) => m[1]))]
    .filter((name) => !defined.has(name));
  t(`Exterior: every JSX component resolves (${unresolved.join(', ') || 'all defined'})`, unresolved.length === 0);
}

console.log(`\nskyscraper: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
