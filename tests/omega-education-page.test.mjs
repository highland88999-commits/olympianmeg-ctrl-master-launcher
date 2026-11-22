// tests/omega-education-page.test.mjs — Static wiring checks on page.jsx.
// Run: node --test tests/omega-education-page.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../lib/education/levels.js';
import { FIELDS } from '../lib/education/fields.js';

const PAGE = readFileSync(new URL('../app/education/page.jsx', import.meta.url), 'utf8');

test('page imports the education levels, fields and graphics helpers', () => {
  assert.ok(PAGE.includes("from '@/lib/education/levels.js'"));
  assert.ok(PAGE.includes("from '@/lib/education/fields.js'"));
  assert.ok(PAGE.includes('LEVELS'));
  assert.ok(PAGE.includes('levelImageSrc'));
  assert.ok(PAGE.includes('BACKGROUND_IMAGE_SRC'));
  assert.ok(PAGE.includes('fieldForKeywords'));
});

test('page carries the search, location and results testids the probe uses', () => {
  for (const id of [
    'education-background', 'centre-label', 'use-my-location', 'place-input',
    'apply-place', 'search-keywords', 'search-level', 'search-field',
    'search-button', 'results-list', 'miles-referral',
  ]) {
    assert.ok(PAGE.includes(`data-testid="${id}"`), `missing testid ${id}`);
  }
  assert.ok(PAGE.includes('id="education-results"'), 'missing results section id');
  // Radius buttons are rendered from RADIUS_OPTIONS with a templated
  // testid (`radius-${opt.id}`), so check the template plus the option ids.
  assert.ok(PAGE.includes('data-testid={`radius-${opt.id}`}'), 'radius testid template');
  const radiusBlock = PAGE.slice(PAGE.indexOf('const RADIUS_OPTIONS'), PAGE.indexOf('];', PAGE.indexOf('const RADIUS_OPTIONS')));
  for (const opt of ['5', '10', '25', '50', '100', 'province', 'country', 'anywhere']) {
    assert.ok(radiusBlock.includes(`id: '${opt}'`), `missing radius option ${opt}`);
  }
  // Level buttons are rendered from LEVELS with a templated testid.
  assert.ok(PAGE.includes('data-testid={`level-${lvl.id}`}'), 'level button testid template');
  assert.ok(PAGE.includes('{LEVELS.map((lvl) =>'), 'level grid maps LEVELS');
});

test('page keeps the Miles referral and the Olympus learning links', () => {
  assert.ok(PAGE.includes("MILES_REFERRAL_CODE = 'MILES'"));
  assert.ok(PAGE.includes('Embark with Miles'));
  assert.ok(PAGE.includes('data-testid="miles-referral"'));
  for (const route of ['/olympian-education', '/alexandria', '/playbook', '/iq-test', '/meet-the-gods', '/trifold']) {
    assert.ok(PAGE.includes(`route: '${route}'`), `missing Olympus link ${route}`);
  }
});

test('page asks for geolocation at most once and falls back to Redwater', () => {
  assert.ok(PAGE.includes('geoAskedRef.current'), 'geolocation asked-once guard');
  assert.ok(PAGE.includes("if (geoAskedRef.current) return;"), 'guard returns early on second ask');
  assert.ok(PAGE.includes("label: 'Redwater, AB'"), 'Redwater default centre');
  assert.ok(PAGE.includes('Back to Redwater, AB'), 'reset-to-Redwater button');
});

test('page says plainly that K-12 schools show for any field', () => {
  assert.ok(PAGE.includes('K-12 schools teach the full curriculum, so they show for any field you pick.'));
});

test('page fetches the education APIs and never the job-board ones', () => {
  assert.ok(PAGE.includes("fetch('/api/education/sources')"));
  assert.ok(PAGE.includes("fetch(`/api/education/search?"));
  assert.ok(!PAGE.includes('/api/job-board/'), 'no job-board API calls on the education page');
});

test('level and field selects offer every real level and field', () => {
  assert.ok(PAGE.includes('{LEVELS.map((l) =>'), 'level select maps LEVELS');
  assert.ok(PAGE.includes('{FIELDS.map((f) =>'), 'field select maps FIELDS');
  assert.ok(PAGE.includes('<option value="">Any level</option>'));
  assert.ok(PAGE.includes('<option value="">Any field</option>'));
});
