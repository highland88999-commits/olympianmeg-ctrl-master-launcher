// tests/job-board-taxonomy.test.mjs — Job category system.
// Run: node --test tests/job-board-taxonomy.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES, SOC_MAP, categoryForKeywords, subcategoriesOf, categoryById,
  ADZUNA_CATEGORY_MAP, ADZUNA_NON_SECTOR_TAGS, adzunaCategoryToOurs,
} from '../lib/job-board/taxonomy.js';

test('every category has an id, label, NOC groups, subcategories and keywords', () => {
  assert.ok(CATEGORIES.length >= 20, `expected 20+ categories, got ${CATEGORIES.length}`);
  const ids = new Set();
  for (const cat of CATEGORIES) {
    assert.ok(cat.id && typeof cat.id === 'string', 'category id');
    assert.ok(!ids.has(cat.id), `duplicate category id ${cat.id}`);
    ids.add(cat.id);
    assert.ok(cat.label, `${cat.id} label`);
    assert.ok(Array.isArray(cat.noc) && cat.noc.length > 0, `${cat.id} NOC groups`);
    assert.ok(Array.isArray(cat.subcategories) && cat.subcategories.length > 0,
      `${cat.id} subcategories`);
    for (const sub of cat.subcategories) {
      assert.ok(sub.id && sub.label, `${cat.id} subcategory shape`);
    }
    assert.ok(Array.isArray(cat.keywords) && cat.keywords.length >= 5,
      `${cat.id} keywords`);
  }
});

test('required categories from the order are all present', () => {
  const ids = new Set(CATEGORIES.map((c) => c.id));
  for (const id of [
    'trades', 'healthcare', 'tech', 'retail-sales', 'hospitality-food',
    'transport-logistics', 'admin-office', 'education', 'finance-accounting',
    'manufacturing', 'agriculture-natural-resources', 'government-public-service',
    'construction', 'engineering', 'legal', 'arts-media', 'science-research',
    'social-services', 'energy-mining', 'security-protective',
  ]) {
    assert.ok(ids.has(id), `missing category ${id}`);
  }
});

test('categoryForKeywords classifies sample titles', () => {
  assert.equal(categoryForKeywords('Welder — structural metal'), 'trades');
  assert.equal(categoryForKeywords('Registered Nurse, ICU'), 'healthcare');
  assert.equal(categoryForKeywords('Senior Software Developer (Python)'), 'tech');
  assert.equal(categoryForKeywords('Truck Driver, Class 1'), 'transport-logistics');
  assert.equal(categoryForKeywords('Executive Assistant'), 'admin-office');
  assert.equal(categoryForKeywords('High School Teacher'), 'education');
  assert.equal(categoryForKeywords('Accountant, CPA'), 'finance-accounting');
  assert.equal(categoryForKeywords('Line Cook'), 'hospitality-food');
  assert.equal(categoryForKeywords('Police Officer'), 'security-protective');
  assert.equal(categoryForKeywords('Civil Engineer, P.Eng.'), 'engineering');
  assert.equal(categoryForKeywords(''), null);
  assert.equal(categoryForKeywords(null), null);
});

test('categoryForKeywords does not match on substrings', () => {
  // "learn" must not match the "rn" keyword; "cookie" must not match "cook".
  assert.notEqual(categoryForKeywords('I love to learn new things'), 'healthcare');
  assert.notEqual(categoryForKeywords('Cookie decorator hobbyist'), 'hospitality-food');
});

test('subcategoriesOf and categoryById', () => {
  assert.equal(categoryById('trades').label, 'Trades & Skilled Trades');
  assert.equal(categoryById('nope'), null);
  const subs = subcategoriesOf('healthcare');
  assert.ok(subs.some((s) => s.id === 'nursing'));
  assert.deepEqual(subcategoriesOf('nope'), []);
});

test('SOC crosswalk covers the top categories', () => {
  for (const id of ['trades', 'healthcare', 'tech', 'construction', 'engineering']) {
    assert.ok(Array.isArray(SOC_MAP[id]) && SOC_MAP[id].length > 0, `SOC_MAP ${id}`);
  }
});

// --- Adzuna crosswalk (course correction, Nov 21) ---
// Published Adzuna category tags, from developer.adzuna.com/docs/categories
// (endpoint shape + example tags) and Adzuna's published category list
// (labels as in the ONS Adzuna dataset + Adzuna browse pages). Tags are
// country-specific — re-check the ca/us lists when the Adzuna adapter is
// built and a key is held.

test('Adzuna crosswalk: every mapped slug points at a real category id', () => {
  const ids = new Set(CATEGORIES.map((c) => c.id));
  const tags = Object.keys(ADZUNA_CATEGORY_MAP);
  assert.ok(tags.length >= 26, `expected 26+ mapped Adzuna tags, got ${tags.length}`);
  for (const [tag, ours] of Object.entries(ADZUNA_CATEGORY_MAP)) {
    assert.ok(ids.has(ours), `Adzuna tag ${tag} maps to unknown category ${ours}`);
  }
});

test('Adzuna crosswalk: all 29 published tags are accounted for', () => {
  const mapped = new Set(Object.keys(ADZUNA_CATEGORY_MAP));
  const nonSector = new Set(ADZUNA_NON_SECTOR_TAGS);
  // No tag is both mapped and non-sector.
  for (const tag of nonSector) assert.ok(!mapped.has(tag), `${tag} in both lists`);
  const all = new Set([...mapped, ...nonSector]);
  for (const tag of [
    'accounting-finance-jobs', 'admin-jobs', 'charity-jobs', 'consultancy-jobs',
    'creative-design-jobs', 'customer-services-jobs', 'domestic-help-cleaning-jobs',
    'energy-oil-gas-jobs', 'engineering-jobs', 'facilities-maintenance-jobs',
    'graduate-jobs', 'healthcare-nursing-jobs', 'hospitality-catering-jobs',
    'hr-recruitment-jobs', 'it-jobs', 'legal-jobs', 'manufacturing-jobs',
    'marketing-pr-jobs', 'other-jobs', 'part-time-jobs', 'property-jobs',
    'retail-jobs', 'sales-jobs', 'scientific-qa-jobs', 'social-care-jobs',
    'teaching-jobs', 'trade-construction-jobs', 'transport-logistics-jobs',
    'travel-jobs',
  ]) {
    assert.ok(all.has(tag), `published Adzuna tag ${tag} is missing from the crosswalk`);
  }
  assert.equal(all.size, 29, 'expected 29 published Adzuna tags in total');
});

test('Adzuna crosswalk: spot-check mappings', () => {
  assert.equal(adzunaCategoryToOurs('it-jobs'), 'tech');
  assert.equal(adzunaCategoryToOurs('accounting-finance-jobs'), 'finance-accounting');
  assert.equal(adzunaCategoryToOurs('healthcare-nursing-jobs'), 'healthcare');
  assert.equal(adzunaCategoryToOurs('teaching-jobs'), 'education');
  assert.equal(adzunaCategoryToOurs('trade-construction-jobs'), 'construction');
  assert.equal(adzunaCategoryToOurs('transport-logistics-jobs'), 'transport-logistics');
  assert.equal(adzunaCategoryToOurs('energy-oil-gas-jobs'), 'energy-mining');
  assert.equal(adzunaCategoryToOurs('scientific-qa-jobs'), 'science-research');
  assert.equal(adzunaCategoryToOurs('legal-jobs'), 'legal');
  assert.equal(adzunaCategoryToOurs('social-care-jobs'), 'social-services');
  assert.equal(adzunaCategoryToOurs('charity-jobs'), 'social-services');
  assert.equal(adzunaCategoryToOurs('travel-jobs'), 'hospitality-food');
  assert.equal(adzunaCategoryToOurs('retail-jobs'), 'retail-sales');
  assert.equal(adzunaCategoryToOurs('sales-jobs'), 'retail-sales');
});

test('Adzuna crosswalk: non-sector and unknown tags map to null', () => {
  // Level/type buckets are deliberately unmapped — the adapter must fall
  // back to keyword classification, never force a wrong category.
  for (const tag of ADZUNA_NON_SECTOR_TAGS) {
    assert.equal(adzunaCategoryToOurs(tag), null, `${tag} should be unmapped`);
  }
  assert.equal(adzunaCategoryToOurs('not-a-real-tag'), null);
  assert.equal(adzunaCategoryToOurs(''), null);
  assert.equal(adzunaCategoryToOurs(null), null);
});

test('NOC audit: every real NOC 2021 major group is covered except 00', () => {
  // Full official list of the 45 NOC 2021 major groups (noc.esdc.gc.ca).
  const ALL_MAJOR_GROUPS = [
    '00', '10', '11', '12', '13', '14', '20', '21', '22', '30', '31', '32',
    '33', '40', '41', '42', '43', '44', '45', '50', '51', '52', '53', '54',
    '55', '60', '62', '63', '64', '65', '70', '72', '73', '74', '75', '80',
    '82', '83', '84', '85', '90', '92', '93', '94', '95',
  ];
  const covered = new Set(CATEGORIES.flatMap((c) => c.noc));
  for (const g of ALL_MAJOR_GROUPS) {
    if (g === '00') continue; // cross-sector senior managers: deliberately unassigned
    assert.ok(covered.has(g), `NOC major group ${g} is covered by no category`);
  }
  // No group that does not exist in NOC 2021 may appear.
  for (const bogus of ['23', '61', '71', '91']) {
    assert.ok(!covered.has(bogus), `bogus NOC group ${bogus} must not appear`);
  }
});
