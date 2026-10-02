// tests/program-buttons-audit.test.mjs — Program-buttons missing-graphics audit.
// Run: node tests/program-buttons-audit.test.mjs (from the repo root). No browser, no network.
//
// Covers the 2026-10-02 audit of the INNER pages of all 145 satellite programs:
// every fixed, named, menu-style button set rendered as text-only (game mode
// pickers, arena/track/difficulty selectors, category + section nav, theme and
// tab pickers) that carries no background graphic. Generation prompts for the
// flagged buttons are staged at
// ~/workspace/menu-art/program-buttons-missing-graphics-staging.md
// (68 entries, kind:"submenu", keys `submenu-prog-<program>-<slug>`).
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}

// --- 1. pages scanned: the 15 inner pages with text-only menu buttons -------
const PAGES = [
  { program: 'air-hockey',        page: 'app/air-hockey/page.jsx',        buttons: 5 },
  { program: 'auction-house',     page: 'app/auction-house/page.jsx',     buttons: 6 },
  { program: 'basketball',        page: 'app/basketball/page.jsx',        buttons: 3 },
  { program: 'blueprint-protocol',page: 'app/blueprint-protocol/page.jsx',buttons: 6 },
  { program: 'colosseum',         page: 'app/colosseum/page.jsx',         buttons: 2 },
  { program: 'enyo',              page: 'app/enyo/page.jsx',              buttons: 8 },
  { program: 'holoframe',         page: 'app/holoframe/page.jsx',         buttons: 3 },
  { program: 'iq-test',           page: 'app/iq-test/page.jsx',           buttons: 3 },
  { program: 'omega-hub',         page: 'app/omega-hub/page.jsx',         buttons: 8 },
  { program: 'persymphony',       page: 'app/persymphony/page.jsx',       buttons: 9 },
  { program: 'plutus',            page: 'app/plutus/page.jsx',            buttons: 4 },
  { program: 'raptor-rush',       page: 'app/raptor-rush/page.jsx',       buttons: 2 },
  { program: 'rogers-arena',      page: 'app/rogers-arena/page.jsx',      buttons: 3 },
  { program: 'user-profile',      page: 'app/user-profile/page.jsx',      buttons: 3 },
  { program: 'zeus-v-hades',      page: 'app/zeus-v-hades/page.jsx',      buttons: 3 },
];
t('15 inner pages scanned', PAGES.length === 15);
for (const p of PAGES) {
  t(`${p.program}: page file exists in repo`, existsSync(join(ROOT, p.page)));
}
t('total flagged buttons = 68', PAGES.reduce((n, p) => n + p.buttons, 0) === 68);

// --- 2. buttons flagged: the full audit manifest ----------------------------
const FLAGGED = [
  // air-hockey — difficulty + table-look pickers (L313, L331)
  { key: 'submenu-prog-air-hockey-easy',               category: 'DIONYSUS',  title: 'Air Hockey — Easy Rival',        kind: 'submenu', page: 'app/air-hockey/page.jsx', label: 'Easy' },
  { key: 'submenu-prog-air-hockey-medium',             category: 'DIONYSUS',  title: 'Air Hockey — Medium Rival',      kind: 'submenu', page: 'app/air-hockey/page.jsx', label: 'Medium' },
  { key: 'submenu-prog-air-hockey-hard',               category: 'DIONYSUS',  title: 'Air Hockey — Hard Rival',        kind: 'submenu', page: 'app/air-hockey/page.jsx', label: 'Hard' },
  { key: 'submenu-prog-air-hockey-table-classic',      category: 'DIONYSUS',  title: 'Air Hockey — Classic Table',     kind: 'submenu', page: 'app/air-hockey/page.jsx', label: 'Classic table' },
  { key: 'submenu-prog-air-hockey-table-kaleidoscope', category: 'DIONYSUS',  title: 'Air Hockey — Kaleidoscope Table',kind: 'submenu', page: 'app/air-hockey/page.jsx', label: 'Kaleidoscope' },
  // auction-house — category pills (L248)
  { key: 'submenu-prog-auction-house-all',         category: 'PLUTUS', title: 'Auction House — All Lots',     kind: 'submenu', page: 'app/auction-house/page.jsx', label: 'All' },
  { key: 'submenu-prog-auction-house-relics',      category: 'PLUTUS', title: 'Auction House — Relics',       kind: 'submenu', page: 'app/auction-house/page.jsx', label: 'Relics' },
  { key: 'submenu-prog-auction-house-star-charts', category: 'PLUTUS', title: 'Auction House — Star Charts',  kind: 'submenu', page: 'app/auction-house/page.jsx', label: 'Star Charts' },
  { key: 'submenu-prog-auction-house-instruments', category: 'PLUTUS', title: 'Auction House — Instruments',  kind: 'submenu', page: 'app/auction-house/page.jsx', label: 'Instruments' },
  { key: 'submenu-prog-auction-house-manuscripts', category: 'PLUTUS', title: 'Auction House — Manuscripts',  kind: 'submenu', page: 'app/auction-house/page.jsx', label: 'Manuscripts' },
  { key: 'submenu-prog-auction-house-curiosities', category: 'PLUTUS', title: 'Auction House — Curiosities',  kind: 'submenu', page: 'app/auction-house/page.jsx', label: 'Curiosities' },
  // basketball — mode picker (L578+)
  { key: 'submenu-prog-basketball-timed-shootout', category: 'ARES', title: 'Basketball — Timed Shootout',  kind: 'submenu', page: 'app/basketball/page.jsx', label: 'Timed shootout' },
  { key: 'submenu-prog-basketball-free-play',       category: 'ARES', title: 'Basketball — Free Play',       kind: 'submenu', page: 'app/basketball/page.jsx', label: 'Free play' },
  { key: 'submenu-prog-basketball-oasis-multiplayer', category: 'ARES', title: 'Basketball — OASIS Multiplayer', kind: 'submenu', page: 'app/basketball/page.jsx', label: 'OASIS multiplayer' },
  // blueprint-protocol — section nav (L224)
  { key: 'submenu-prog-blueprint-economics',        category: 'ATHENA', title: 'Blueprint — 01 Economics of Transformation', kind: 'submenu', page: 'app/blueprint-protocol/page.jsx', label: 'Economics of Transformation' },
  { key: 'submenu-prog-blueprint-cooperative',     category: 'ATHENA', title: 'Blueprint — 02 The Cooperative Economy',     kind: 'submenu', page: 'app/blueprint-protocol/page.jsx', label: 'The Cooperative Economy' },
  { key: 'submenu-prog-blueprint-allocation-matrix', category: 'ATHENA', title: 'Blueprint — 03 The 15% Allocation Matrix',  kind: 'submenu', page: 'app/blueprint-protocol/page.jsx', label: 'The 15% Allocation Matrix' },
  { key: 'submenu-prog-blueprint-foundation',      category: 'ATHENA', title: 'Blueprint — 04 The Olympus Foundation',      kind: 'submenu', page: 'app/blueprint-protocol/page.jsx', label: 'The Olympus Foundation' },
  { key: 'submenu-prog-blueprint-roadmap',        category: 'ATHENA', title: 'Blueprint — 05 The Execution Roadmap',       kind: 'submenu', page: 'app/blueprint-protocol/page.jsx', label: 'The Execution Roadmap' },
  { key: 'submenu-prog-blueprint-midas',          category: 'ATHENA', title: 'Blueprint — 06 The Midas Philosophy',        kind: 'submenu', page: 'app/blueprint-protocol/page.jsx', label: 'The Midas Philosophy' },
  // colosseum — mode picker (L198+)
  { key: 'submenu-prog-colosseum-enter-the-pit',         category: 'ARES', title: 'Colosseum — Enter the Pit',          kind: 'submenu', page: 'app/colosseum/page.jsx', label: 'ENTER THE PIT' },
  { key: 'submenu-prog-colosseum-challenge-the-champion', category: 'ARES', title: 'Colosseum — Challenge the Champion', kind: 'submenu', page: 'app/colosseum/page.jsx', label: 'CHALLENGE THE CHAMPION' },
  // enyo — arena, battle type + bot skill pickers (L1507, L1527, L1549)
  { key: 'submenu-prog-enyo-ruined-plaza', category: 'ARES', title: 'Enyo — Ruined Plaza',  kind: 'submenu', page: 'app/enyo/page.jsx', label: 'Ruined Plaza' },
  { key: 'submenu-prog-enyo-neon-depot',   category: 'ARES', title: 'Enyo — Neon Depot',    kind: 'submenu', page: 'app/enyo/page.jsx', label: 'Neon Depot' },
  { key: 'submenu-prog-enyo-dust-hollow',  category: 'ARES', title: 'Enyo — Dust Hollow',   kind: 'submenu', page: 'app/enyo/page.jsx', label: 'Dust Hollow' },
  { key: 'submenu-prog-enyo-team-battle',  category: 'ARES', title: 'Enyo — Team Battle',   kind: 'submenu', page: 'app/enyo/page.jsx', label: 'Team battle' },
  { key: 'submenu-prog-enyo-free-for-all', category: 'ARES', title: 'Enyo — Free for All',  kind: 'submenu', page: 'app/enyo/page.jsx', label: 'Free for all' },
  { key: 'submenu-prog-enyo-recruit',      category: 'ARES', title: 'Enyo — Recruit Bots',  kind: 'submenu', page: 'app/enyo/page.jsx', label: 'Recruit' },
  { key: 'submenu-prog-enyo-regular',      category: 'ARES', title: 'Enyo — Regular Bots',  kind: 'submenu', page: 'app/enyo/page.jsx', label: 'Regular' },
  { key: 'submenu-prog-enyo-veteran',      category: 'ARES', title: 'Enyo — Veteran Bots',  kind: 'submenu', page: 'app/enyo/page.jsx', label: 'Veteran' },
  // holoframe — monitor layout modes (L353)
  { key: 'submenu-prog-holoframe-single',   category: 'ATHENA', title: 'Holoframe — Mode 1: Single',   kind: 'submenu', page: 'app/holoframe/page.jsx', label: 'MODE 1: SINGLE' },
  { key: 'submenu-prog-holoframe-carousel', category: 'ATHENA', title: 'Holoframe — Mode 2: Carousel', kind: 'submenu', page: 'app/holoframe/page.jsx', label: 'MODE 2: CAROUSEL' },
  { key: 'submenu-prog-holoframe-stacked',  category: 'ATHENA', title: 'Holoframe — Mode 3: Stacked',  kind: 'submenu', page: 'app/holoframe/page.jsx', label: 'MODE 3: STACKED' },
  // iq-test — difficulty picker (L204)
  { key: 'submenu-prog-iq-test-easy',   category: 'ATHENA', title: 'IQ Test — Easy 2×2',   kind: 'submenu', page: 'app/iq-test/page.jsx', label: 'Easy · 2×2' },
  { key: 'submenu-prog-iq-test-medium', category: 'ATHENA', title: 'IQ Test — Medium 3×3', kind: 'submenu', page: 'app/iq-test/page.jsx', label: 'Medium · 3×3' },
  { key: 'submenu-prog-iq-test-hard',   category: 'ATHENA', title: 'IQ Test — Hard 4×4',   kind: 'submenu', page: 'app/iq-test/page.jsx', label: 'Hard · 4×4' },
  // omega-hub — sector cards + section tabs (L196, L207)
  { key: 'submenu-prog-omega-hub-nexus-prime',    category: 'APHRODITE', title: 'Omega Hub — Nexus Prime',  kind: 'submenu', page: 'app/omega-hub/page.jsx', label: 'NEXUS PRIME' },
  { key: 'submenu-prog-omega-hub-obsidian-reef',  category: 'APHRODITE', title: 'Omega Hub — Obsidian Reef', kind: 'submenu', page: 'app/omega-hub/page.jsx', label: 'OBSIDIAN REEF' },
  { key: 'submenu-prog-omega-hub-vortex-fields',  category: 'APHRODITE', title: 'Omega Hub — Vortex Fields', kind: 'submenu', page: 'app/omega-hub/page.jsx', label: 'VORTEX FIELDS' },
  { key: 'submenu-prog-omega-hub-quiet-harbor',    category: 'APHRODITE', title: 'Omega Hub — Quiet Harbor',  kind: 'submenu', page: 'app/omega-hub/page.jsx', label: 'QUIET HARBOR' },
  { key: 'submenu-prog-omega-hub-tab-hub',      category: 'APHRODITE', title: 'Omega Hub — HUB Tab',      kind: 'submenu', page: 'app/omega-hub/page.jsx', label: 'HUB' },
  { key: 'submenu-prog-omega-hub-tab-world',    category: 'APHRODITE', title: 'Omega Hub — WORLD Tab',    kind: 'submenu', page: 'app/omega-hub/page.jsx', label: 'WORLD' },
  { key: 'submenu-prog-omega-hub-tab-terminal', category: 'APHRODITE', title: 'Omega Hub — TERMINAL Tab', kind: 'submenu', page: 'app/omega-hub/page.jsx', label: 'TERMINAL' },
  { key: 'submenu-prog-omega-hub-tab-backpack', category: 'APHRODITE', title: 'Omega Hub — BACKPACK Tab', kind: 'submenu', page: 'app/omega-hub/page.jsx', label: 'BACKPACK' },
  // persymphony — arena picker (arenas.js L396+)
  { key: 'submenu-prog-persymphony-nebula',         category: 'APOLLO', title: 'Persymphony — Nebula',         kind: 'submenu', page: 'app/persymphony/page.jsx', label: 'Nebula' },
  { key: 'submenu-prog-persymphony-digital-rain',   category: 'APOLLO', title: 'Persymphony — Digital Rain',   kind: 'submenu', page: 'app/persymphony/page.jsx', label: 'Digital Rain' },
  { key: 'submenu-prog-persymphony-storm-engine',  category: 'APOLLO', title: 'Persymphony — Storm Engine',  kind: 'submenu', page: 'app/persymphony/page.jsx', label: 'Storm Engine' },
  { key: 'submenu-prog-persymphony-burning-fractal', category: 'APOLLO', title: 'Persymphony — Burning Fractal', kind: 'submenu', page: 'app/persymphony/page.jsx', label: 'Burning Fractal' },
  { key: 'submenu-prog-persymphony-canyon',        category: 'APOLLO', title: 'Persymphony — Canyon',        kind: 'submenu', page: 'app/persymphony/page.jsx', label: 'Canyon' },
  { key: 'submenu-prog-persymphony-mega-city',     category: 'APOLLO', title: 'Persymphony — Mega City',     kind: 'submenu', page: 'app/persymphony/page.jsx', label: 'Mega City' },
  { key: 'submenu-prog-persymphony-neural-web',   category: 'APOLLO', title: 'Persymphony — Neural Web',   kind: 'submenu', page: 'app/persymphony/page.jsx', label: 'Neural Web' },
  { key: 'submenu-prog-persymphony-pearl',         category: 'APOLLO', title: 'Persymphony — Pearl',         kind: 'submenu', page: 'app/persymphony/page.jsx', label: 'Pearl' },
  { key: 'submenu-prog-persymphony-singularity',   category: 'APOLLO', title: 'Persymphony — Singularity',   kind: 'submenu', page: 'app/persymphony/page.jsx', label: 'Singularity' },
  // plutus — section tabs (L145)
  { key: 'submenu-prog-plutus-tab-overview', category: 'PLUTUS', title: 'Plutus — Overview Tab', kind: 'submenu', page: 'app/plutus/page.jsx', label: 'Overview' },
  { key: 'submenu-prog-plutus-tab-budget',   category: 'PLUTUS', title: 'Plutus — Budget Tab',   kind: 'submenu', page: 'app/plutus/page.jsx', label: 'Budget' },
  { key: 'submenu-prog-plutus-tab-goals',    category: 'PLUTUS', title: 'Plutus — Goals Tab',    kind: 'submenu', page: 'app/plutus/page.jsx', label: 'Goals' },
  { key: 'submenu-prog-plutus-tab-data',     category: 'PLUTUS', title: 'Plutus — Data Tab',     kind: 'submenu', page: 'app/plutus/page.jsx', label: 'Data' },
  // raptor-rush — mode picker (L373+)
  { key: 'submenu-prog-raptor-rush-solo-hunt',     category: 'ARTEMIS', title: 'Raptor Rush — Solo Hunt',     kind: 'submenu', page: 'app/raptor-rush/page.jsx', label: 'Solo hunt' },
  { key: 'submenu-prog-raptor-rush-pvp-party-hunt', category: 'ARTEMIS', title: 'Raptor Rush — PvP Party Hunt', kind: 'submenu', page: 'app/raptor-rush/page.jsx', label: 'PvP party hunt' },
  // rogers-arena — arena mode picker (L163)
  { key: 'submenu-prog-rogers-arena-concert-night', category: 'DIONYSUS', title: 'Rogers Arena — Concert Night', kind: 'submenu', page: 'app/rogers-arena/page.jsx', label: 'Concert Night' },
  { key: 'submenu-prog-rogers-arena-game-night',    category: 'DIONYSUS', title: 'Rogers Arena — Game Night',    kind: 'submenu', page: 'app/rogers-arena/page.jsx', label: 'Game Night' },
  { key: 'submenu-prog-rogers-arena-empty-arena',   category: 'DIONYSUS', title: 'Rogers Arena — Empty Arena',   kind: 'submenu', page: 'app/rogers-arena/page.jsx', label: 'Empty Arena' },
  // user-profile — vault library tabs (L290)
  { key: 'submenu-prog-user-profile-tab-library',  category: 'APHRODITE', title: 'User Profile — Library Tab',  kind: 'submenu', page: 'app/user-profile/page.jsx', label: 'Library' },
  { key: 'submenu-prog-user-profile-tab-borrowed', category: 'APHRODITE', title: 'User Profile — Borrowed Tab', kind: 'submenu', page: 'app/user-profile/page.jsx', label: 'Borrowed' },
  { key: 'submenu-prog-user-profile-tab-saved',    category: 'APHRODITE', title: 'User Profile — Saved Tab',    kind: 'submenu', page: 'app/user-profile/page.jsx', label: 'Saved' },
  // zeus-v-hades — descent picker (L292)
  { key: 'submenu-prog-zeus-v-hades-gates',      category: 'DIONYSUS', title: 'Zeus v Hades — Gates of the Underworld', kind: 'submenu', page: 'app/zeus-v-hades/page.jsx', label: 'Gates of the Underworld' },
  { key: 'submenu-prog-zeus-v-hades-river-styx', category: 'DIONYSUS', title: 'Zeus v Hades — River Styx',              kind: 'submenu', page: 'app/zeus-v-hades/page.jsx', label: 'River Styx' },
  { key: 'submenu-prog-zeus-v-hades-tartarus',   category: 'DIONYSUS', title: 'Zeus v Hades — Tartarus',                 kind: 'submenu', page: 'app/zeus-v-hades/page.jsx', label: 'Tartarus' },
];

// --- 3. already-staged keys this batch must not duplicate -------------------
const EXISTING_STAGED_KEYS = [
  // 15 ARGO prompts (missing-graphics-prompts.md)
  'submenu-argo-dest-tokyo', 'submenu-argo-dest-paris', 'submenu-argo-dest-new-york',
  'submenu-argo-dest-london', 'submenu-argo-dest-rio', 'submenu-argo-dest-sydney',
  'submenu-argo-dest-edmonton', 'submenu-argo-dest-giza', 'submenu-argo-fleet-wisp',
  'submenu-argo-fleet-comet', 'submenu-argo-fleet-skiff', 'submenu-argo-fleet-dart',
  'submenu-argo-fleet-hauler', 'submenu-argo-fleet-cruiser', 'submenu-argo-fleet-titan',
  // 25 submenu slots (submenu-prompts.json)
  'submenu-babel-avalon', 'submenu-babel-duat', 'submenu-babel-hermes', 'submenu-babel-overlook',
  'submenu-babel-sylva', 'submenu-babel-vault', 'submenu-agora-civic', 'submenu-agora-cosmos',
  'submenu-agora-craft', 'submenu-agora-faith', 'submenu-agora-olympus', 'submenu-agora-play',
  'submenu-worldengine-architect', 'submenu-worldengine-characters', 'submenu-worldengine-engine',
  'submenu-worldengine-objects', 'submenu-worldengine-studio', 'submenu-worldengine-uplink',
  'submenu-worldengine-vehicles', 'submenu-worldengine-weapons', 'submenu-worldengine-weather',
  'submenu-skyscraper-amusement', 'submenu-skyscraper-omega', 'submenu-skyscraper-park',
  'submenu-skyscraper-thunderdome',
  // 18 museum slots (museum-slots-staging.md)
  'museum-photo-gold-robot', 'museum-photo-valkyrie', 'museum-photo-neon-city',
  'museum-photo-artemis', 'museum-photo-guillotine', 'museum-photo-shadow-realm',
  'museum-photo-medusa', 'museum-photo-air-car', 'museum-photo-vault',
  'museum-photo-starblood', 'museum-photo-gems', 'museum-photo-colosseum',
  'museum-video-air-car', 'museum-video-light-cycle', 'museum-video-logo-reveal',
  'museum-video-medusa', 'museum-video-neon-drive', 'museum-video-vault',
];
t('existing staged set = 58 keys (15 argo + 25 submenu + 18 museum)',
  EXISTING_STAGED_KEYS.length === 58);
t('existing staged keys are themselves unique',
  new Set(EXISTING_STAGED_KEYS).size === EXISTING_STAGED_KEYS.length);

// --- 4. manifest invariants ---------------------------------------------------
t('68 buttons flagged', FLAGGED.length === 68);
const keys = FLAGGED.map((f) => f.key);
t('no duplicate keys in this batch', new Set(keys).size === keys.length);
const keyRe = /^submenu-prog-[a-z0-9-]+$/;
t('all keys match the submenu-prog-<program>-<slug> pattern',
  keys.every((k) => keyRe.test(k)));
t('no overlap with any previously staged key',
  keys.every((k) => !EXISTING_STAGED_KEYS.includes(k)));

const GODS = new Set(['ARES', 'APOLLO', 'HERMES', 'HEPHAESTUS', 'ATHENA', 'ARTEMIS', 'HESTIA', 'DIONYSUS', 'PLUTUS', 'APHRODITE']);
t('every entry has kind "submenu"', FLAGGED.every((f) => f.kind === 'submenu'));
t('every category is a valid god menu', FLAGGED.every((f) => GODS.has(f.category)));
t('every entry has a non-empty title', FLAGGED.every((f) => typeof f.title === 'string' && f.title.length > 0));
t('every entry points at one of the scanned pages',
  FLAGGED.every((f) => PAGES.some((p) => p.page === f.page)));
for (const p of PAGES) {
  const n = FLAGGED.filter((f) => f.page === p.page).length;
  t(`${p.program}: flagged count matches scan (${n}/${p.buttons})`, n === p.buttons);
}

// --- 5. labels still present in source (audit freshness) -----------------------
// Labels may live in the page itself or in a sibling data module it imports
// (e.g. arenas.js, arena.js, race.js, physics.js, content.js), so search the
// whole program directory.
import { readdirSync, statSync } from 'fs';
function dirSource(dir) {
  let out = '';
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { out += dirSource(p); continue; }
    if (/\.(jsx?|tsx?)$/.test(name)) out += readFileSync(p, 'utf8') + '\n';
  }
  return out;
}
const progSrc = {};
for (const p of PAGES) {
  progSrc[p.program] = dirSource(join(ROOT, 'app', p.program));
}
// enyo bot-skill labels live in a shared lib module, not app/enyo/
const libSrc = dirSource(join(ROOT, 'lib'));
for (const f of FLAGGED) {
  const program = f.page.split('/')[1];
  const hit = progSrc[program].includes(f.label) || libSrc.includes(f.label);
  t(`${f.key}: label "${f.label}" present in app/${program}/ (or lib/)`, hit);
}

// --- 6. staging file schema (when the workspace staging file is reachable) ---
// The staging file lives outside the repo; point PROGBUTTONS_STAGING at it in
// dev, otherwise this section is skipped (the manifest above is the record).
const stagingPath = process.env.PROGBUTTONS_STAGING;
if (stagingPath && existsSync(stagingPath)) {
  const md = readFileSync(stagingPath, 'utf8');
  const stagedKeys = [...md.matchAll(/^- key: `([^`]+)`/gm)].map((m) => m[1]);
  t('staging file: 68 entries', stagedKeys.length === 68);
  t('staging file: keys match the audit manifest',
    stagedKeys.length === keys.length && stagedKeys.every((k) => keys.includes(k)));
  const blocks = md.split(/^- key: `/m).slice(1);
  t('staging file: every entry has category, title, kind:submenu and a prompt',
    blocks.every((b) =>
      /^[^`]+`\s*\n  category: \S/m.test(b) &&
      /  title: /.test(b) &&
      /  kind: submenu/.test(b) &&
      /  prompt: >-/.test(b)));
  t('staging file: every prompt follows the 21:9 no-text voice',
    blocks.every((b) =>
      /21:9\s+cinematic\s+key\s+art/.test(b) &&
      /No\s+text,\s+no\s+logos,\s+no\s+watermarks/.test(b) &&
      /no\s+photorealistic\s+faces/.test(b)));
} else {
  console.log('SKIP: staging-file schema checks (set PROGBUTTONS_STAGING to run them)');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
