// tests/species-auction.test.mjs
// Headless tests for the Species databases in the Auction House
// (lib/auction/species.js) — the pure catalogue + pricing law.
// Run: node tests/species-auction.test.mjs (from the repo root).
// No browser, no network.
import {
  SPECIES_BUCKET,
  SPECIES_FREE_DOWNLOADS,
  SPECIES_PRICE_CENTS,
  SPECIES_DATASETS,
  speciesAllFiles,
  speciesFileByKey,
  speciesPriceCents,
  speciesIsFree,
  speciesFreeLeft,
  formatSpeciesBytes,
  speciesPurchaseRef,
  speciesSaleRef,
  speciesFeeRef,
} from '../lib/auction/species.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- Catalogue shape ---------------------------------------------------------
t('bucket is species-files', SPECIES_BUCKET === 'species-files');
t('6 datasets', SPECIES_DATASETS.length === 6);
t('dataset ids in series order', SPECIES_DATASETS.map((d) => d.id).join(',') === 'naming,characteristics,behavior,movement,sounds,anatomy');
t('14 files total (11 live + 3 anatomy)', speciesAllFiles().length === 14);
t('11 live files', speciesAllFiles().filter((f) => f.datasetStatus === 'live').length === 11);
t('3 anatomy files', speciesAllFiles().filter((f) => f.datasetId === 'anatomy').length === 3);
t('anatomy is coming-soon', SPECIES_DATASETS.find((d) => d.id === 'anatomy').status === 'coming-soon');
t('other datasets are live', SPECIES_DATASETS.filter((d) => d.id !== 'anatomy').every((d) => d.status === 'live'));
t('every dataset has 2137451 rows', SPECIES_DATASETS.every((d) => d.rows === 2137451));
t('every dataset has 26 sheets', SPECIES_DATASETS.every((d) => d.sheets === 26));

// --- File keys: unique, well-formed, storage keys under species/ -------------
{
  const keys = speciesAllFiles().map((f) => f.key);
  t('file keys unique', new Set(keys).size === keys.length);
  t('file keys are slugs', keys.every((k) => /^[a-z0-9-]+$/.test(k)));
  t('live files have a storage key under species/',
    speciesAllFiles().filter((f) => f.datasetStatus === 'live').every((f) => String(f.storageKey).startsWith('species/')));
  t('live files have a positive byte size',
    speciesAllFiles().filter((f) => f.datasetStatus === 'live').every((f) => Number(f.bytes) > 0));
  t('live files have a format', speciesAllFiles().filter((f) => f.datasetStatus === 'live').every((f) => ['CSV', 'XLSX', 'PDF'].includes(f.format)));
  t('anatomy files have no size yet (not built)', speciesAllFiles().filter((f) => f.datasetId === 'anatomy').every((f) => f.bytes === null));
  t('anatomy has the JSONL build map', speciesAllFiles().some((f) => f.key === 'anatomy-build-map' && f.format === 'JSONL'));
  t('naming has all three formats', ['CSV', 'XLSX', 'PDF'].every((fmt) => speciesAllFiles().some((f) => f.datasetId === 'naming' && f.format === fmt)));
}

// --- Lookup ------------------------------------------------------------------
{
  const hit = speciesFileByKey('sounds-xlsx');
  t('lookup finds the sounds spreadsheet', hit && hit.file.key === 'sounds-xlsx' && hit.dataset.id === 'sounds');
  t('lookup trims', speciesFileByKey('  behavior-pdf ')?.file.key === 'behavior-pdf');
  t('unknown key -> null', speciesFileByKey('nope') === null);
  t('empty key -> null', speciesFileByKey('') === null);
  t('anatomy lookup carries coming-soon', speciesFileByKey('anatomy-pdf')?.dataset.status === 'coming-soon');
}

// --- Pricing: first 20 free, then $5.00 ---------------------------------------
t('free downloads = 20', SPECIES_FREE_DOWNLOADS === 20);
t('price = 500 cents', SPECIES_PRICE_CENTS === 500);
t('price at 0 downloads is $0', speciesPriceCents(0) === 0);
t('price at 19 downloads is $0', speciesPriceCents(19) === 0);
t('price at 20 downloads is $5.00', speciesPriceCents(20) === 500);
t('price at 100 downloads is $5.00', speciesPriceCents(100) === 500);
t('price at negative count is $0', speciesPriceCents(-5) === 0);
t('isFree at 0', speciesIsFree(0) === true);
t('isFree at 19', speciesIsFree(19) === true);
t('not free at 20', speciesIsFree(20) === false);
t('freeLeft at 0 is 20', speciesFreeLeft(0) === 20);
t('freeLeft at 19 is 1', speciesFreeLeft(19) === 1);
t('freeLeft at 20 is 0', speciesFreeLeft(20) === 0);
t('freeLeft at 100 is 0', speciesFreeLeft(100) === 0);

// --- Byte formatting -----------------------------------------------------------
t('bytes: 337145808 -> 337.1 MB', formatSpeciesBytes(337145808) === '337.1 MB');
t('bytes: 186430532 -> 186.4 MB', formatSpeciesBytes(186430532) === '186.4 MB');
t('bytes: 1500 -> 1.5 KB', formatSpeciesBytes(1500) === '1.5 KB');
t('bytes: 500 -> 500 B', formatSpeciesBytes(500) === '500 B');
t('bytes: null -> dash', formatSpeciesBytes(null) === '—');
t('bytes: 0 -> dash', formatSpeciesBytes(0) === '—');

// --- Idempotency references ------------------------------------------------------
{
  const a = speciesPurchaseRef('sounds-xlsx', 'U1', 'P1');
  const b = speciesPurchaseRef('sounds-xlsx', 'U1', 'P2');
  t('purchase ref is namespaced', a === 'species:buy:sounds-xlsx:U1:P1');
  t('different purchase ids differ (repeat buys are real)', a !== b);
  t('sale ref', speciesSaleRef('sounds-xlsx', 'P1') === 'species:sale:sounds-xlsx:P1');
  t('fee ref', speciesFeeRef('sounds-xlsx', 'P1') === 'species:sounds-xlsx:P1');
}

console.log(`species-auction: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
