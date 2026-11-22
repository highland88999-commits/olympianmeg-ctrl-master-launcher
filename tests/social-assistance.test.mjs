// tests/social-assistance.test.mjs — Omega Social Assistance directory.
// Run: node --test tests/social-assistance.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CATEGORIES,
  DISCLAIMER,
  JURISDICTIONS,
  PROGRAMS,
  categoriesFor,
  categoryById,
  emptyCategoriesFor,
  jurisdictionById,
  programsFor,
} from '../lib/social-assistance/data.js';

// Official domains only: federal/provincial/state government hosts.
// Nothing commercial, nothing third-party, no invented URLs.
const OFFICIAL_HOSTS = new Set([
  'canada.ca',
  'www.canada.ca',
  'alberta.ca',
  'www.alberta.ca',
  'studentaid.alberta.ca',
  'www.fns.usda.gov',
  'fns.usda.gov',
  'www.ssa.gov',
  'ssa.gov',
  'www.benefits.gov',
  'benefits.gov',
  'www.medicaid.gov',
  'medicaid.gov',
  'www.hud.gov',
  'hud.gov',
  'www.irs.gov',
  'irs.gov',
  'studentaid.gov',
]);

// Benefit amounts are never printed (they change every year and the
// same program was quoted at different figures by different official
// pages). The ONLY dollar figures allowed anywhere in the data are
// these eligibility thresholds, each verified from the official page:
// $90,000 family income (CDCP, Alberta Child Care Subsidy),
// $2,000 / $3,000 resource limits (SSI).
const ALLOWED_DOLLAR_FIGURES = new Set(['$90,000', '$2,000', '$3,000']);

test('three jurisdictions: Canada federal, Alberta, United States federal', () => {
  assert.equal(JURISDICTIONS.length, 3);
  assert.deepEqual(JURISDICTIONS.map((j) => j.id), ['canada', 'alberta', 'united-states']);
  const ids = new Set();
  for (const j of JURISDICTIONS) {
    assert.ok(!ids.has(j.id), `duplicate jurisdiction id ${j.id}`);
    ids.add(j.id);
    assert.ok(j.name && j.blurb && j.startHere, `${j.id} copy`);
    assert.ok(j.startHereUrl.startsWith('http'), `${j.id} start-here link`);
    assert.ok(j.country && j.kind, `${j.id} country/kind`);
  }
  assert.equal(jurisdictionById('alberta')?.name, 'Alberta');
  assert.equal(jurisdictionById('nope'), null);
});

test('eight categories, all with a label and plain-words blurb', () => {
  assert.equal(CATEGORIES.length, 8);
  assert.deepEqual(CATEGORIES.map((c) => c.id), [
    'income', 'disability', 'children', 'food', 'housing', 'health', 'emergency', 'education',
  ]);
  const ids = new Set();
  for (const c of CATEGORIES) {
    assert.ok(!ids.has(c.id), `duplicate category id ${c.id}`);
    ids.add(c.id);
    assert.ok(c.label && c.blurb, `${c.id} copy`);
  }
  assert.equal(categoryById('food')?.label, 'Food help');
  assert.equal(categoryById('nope'), null);
});

test('34 programs: 11 Canada federal, 10 Alberta, 13 US federal', () => {
  assert.equal(PROGRAMS.length, 34);
  assert.equal(programsFor('canada').length, 11);
  assert.equal(programsFor('alberta').length, 10);
  assert.equal(programsFor('united-states').length, 13);
  assert.equal(programsFor('canada', 'income').length, 3);
  assert.equal(programsFor('united-states', 'food').length, 2);
  assert.equal(programsFor('alberta', 'food').length, 0);
});

test('every program has id, jurisdiction, category, name, what, who, apply, url, source', () => {
  const ids = new Set();
  for (const p of PROGRAMS) {
    assert.ok(p.id && typeof p.id === 'string', 'program id');
    assert.ok(!ids.has(p.id), `duplicate program id ${p.id}`);
    ids.add(p.id);
    assert.ok(jurisdictionById(p.jurisdiction), `${p.id} jurisdiction resolves`);
    assert.ok(categoryById(p.category), `${p.id} category resolves`);
    for (const field of ['name', 'what', 'who', 'apply', 'url', 'source']) {
      assert.ok(typeof p[field] === 'string' && p[field].trim().length > 0, `${p.id} ${field}`);
    }
  }
});

test('every program links to an official government page', () => {
  for (const p of PROGRAMS) {
    assert.ok(/^https?:\/\//.test(p.url), `${p.id} url is http(s)`);
    const host = new URL(p.url).hostname;
    assert.ok(OFFICIAL_HOSTS.has(host), `${p.id} url host ${host} is not an official government host`);
  }
});

// Some official pages are genuinely shared (one hub page covers two
// programs, or a state-run program points at the federal finder).
// The shared URLs are exactly these four pairs — anything else sharing
// a URL would be a copy-paste error.
const KNOWN_SHARED_URLS = new Set([
  'https://www.canada.ca/en/services/benefits/disability.html',
  'https://www.alberta.ca/alberta-supports',
  'https://www.medicaid.gov/',
  'https://www.benefits.gov/',
]);

test('no program shares a URL except the four known official hubs', () => {
  const byUrl = new Map();
  for (const p of PROGRAMS) {
    byUrl.set(p.url, [...(byUrl.get(p.url) || []), p.id]);
  }
  for (const [url, ids] of byUrl) {
    if (ids.length > 1) {
      assert.ok(KNOWN_SHARED_URLS.has(url), `unexpected shared url ${url} (${ids.join(', ')})`);
      assert.equal(ids.length, 2, `${url} shared by more than two programs`);
    }
  }
});

test('no benefit amounts in the data — only the verified eligibility thresholds', () => {
  for (const p of PROGRAMS) {
    const text = `${p.what} ${p.who} ${p.apply}`;
    for (const match of text.match(/\$\d[\d,]*/g) || []) {
      assert.ok(ALLOWED_DOLLAR_FIGURES.has(match),
        `${p.id} prints a dollar figure ${match} — benefit amounts are not printed`);
    }
  }
  // And no benefit description ever carries a dollar figure at all.
  for (const p of PROGRAMS) {
    assert.ok(!/\$/.test(p.what), `${p.id} 'what' prints a dollar figure`);
  }
});

test('category chips and honest gaps per jurisdiction', () => {
  assert.deepEqual(categoriesFor('canada').map((c) => c.id), [
    'income', 'disability', 'children', 'food', 'housing', 'health', 'education',
  ]);
  assert.deepEqual(emptyCategoriesFor('canada').map((c) => c.id), ['emergency']);
  assert.deepEqual(emptyCategoriesFor('alberta').map((c) => c.id), ['food']);
  assert.deepEqual(emptyCategoriesFor('united-states'), []);
  assert.equal(categoriesFor('alberta').find((c) => c.id === 'emergency')?.count, 2);
});

test('disclaimer says plainly that the program decides eligibility, not the site', () => {
  assert.ok(/decides for itself/.test(DISCLAIMER), 'disclaimer: program decides');
  assert.ok(/does not decide anything/.test(DISCLAIMER), 'disclaimer: site decides nothing');
  assert.ok(/official page/.test(DISCLAIMER), 'disclaimer: official page is the source of truth');
});

test('page exists, is a client component, and exports nothing but the default page', () => {
  const src = readFileSync(new URL('../app/social-assistance/page.jsx', import.meta.url), 'utf8');
  assert.ok(src.startsWith("'use client'"), 'page is a client component');
  assert.ok(src.includes("from '../../lib/social-assistance/data'"), 'page imports the data module');
  assert.ok(src.includes('data-testid="social-assistance-page"'), 'page has its test id');
  assert.ok(src.includes('data-testid="jurisdiction-picker"'), 'jurisdiction picker has its test id');
  assert.ok(src.includes('data-testid="program-card"'), 'program cards have their test id');
  assert.ok(!/export const/.test(src), 'page exports no extra const (route-module rule)');
  assert.ok(src.includes("DEFAULT_JURISDICTION = 'alberta'"), 'page defaults to Alberta');
  assert.ok(src.includes('DISCLAIMER'), 'page renders the disclaimer');
});
