// tests/hermes-online-mall.test.mjs
// Headless tests for Merlin's Online Mall helpers (lib/hermes/online-mall.js):
// category grouping, labels, URL formatting, and the self-hosted media contract
// (no external hotlinks — his videos/logo live under /public/hermes).
// Run: node tests/hermes-online-mall.test.mjs  (from the repo root).
import {
  MALL_VIDEOS,
  MALL_LOGO,
  labelForCategory,
  formatMallUrl,
  groupLinksByCategory,
  mallVideoFor,
} from '../lib/hermes/online-mall.js';

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`ok - ${name}`);
  } else {
    failures++;
    console.error(`FAIL - ${name}`);
  }
}

// --- grouping (his verbatim grouping) ---------------------------------------
const links = [
  { id: '1', title: 'Acme', url: 'https://acme.example', category: 'tech' },
  { id: '2', title: 'Bakery', url: 'https://bakery.example', category: 'food' },
  { id: '3', title: 'Chips', url: 'https://chips.example', category: 'tech' },
  { id: '4', title: 'NoCat', url: 'https://nocat.example' },
];
const { grouped, categories } = groupLinksByCategory(links);
check('groups into insertion-ordered categories', JSON.stringify(categories) === JSON.stringify(['tech', 'food', 'Uncategorized']));
check('tech page holds two links', grouped.tech.length === 2);
check('missing category falls back to Uncategorized', grouped.Uncategorized.length === 1 && grouped.Uncategorized[0].title === 'NoCat');
const empty = groupLinksByCategory([]);
check('empty input yields no categories', empty.categories.length === 0);
const nulled = groupLinksByCategory(null);
check('null input yields no categories', nulled.categories.length === 0);

// --- labels -----------------------------------------------------------------
check('known slug resolves via CATEGORIES', labelForCategory('tech') === 'TECHNOLOGY');
check('unknown slug is prettified', labelForCategory('about_home') === 'ABOUT HOME');
check('missing slug is UNCATEGORIZED', labelForCategory(null) === 'UNCATEGORIZED');

// --- URL formatting (his verbatim) ------------------------------------------
check('https URL passes through', formatMallUrl('https://a.example') === 'https://a.example');
check('bare domain gets https://', formatMallUrl('a.example') === 'https://a.example');
check('missing URL becomes #', formatMallUrl(null) === '#');

// --- self-hosted media contract ----------------------------------------------
check('mall logo is a local path', MALL_LOGO === '/hermes/online-mall-logo.jpeg');
check('two self-hosted background videos', MALL_VIDEOS.length === 2);
check(
  'no external hotlinks in mall media',
  MALL_VIDEOS.every((v) => v.startsWith('/hermes/') && !/catbox|file\.garden|^https?:\/\//.test(v)),
);
check('video cycling wraps', mallVideoFor(0) === MALL_VIDEOS[0] && mallVideoFor(2) === MALL_VIDEOS[0] && mallVideoFor(3) === MALL_VIDEOS[1]);

if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log('All hermes-online-mall tests passed.');
