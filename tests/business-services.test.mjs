// tests/business-services.test.mjs — Omega Business Services directory.
// Run: node --test tests/business-services.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIENCES,
  CATEGORIES,
  JURISDICTIONS,
  RESOURCES,
  countByJurisdiction,
  filterResources,
} from '../lib/business-services/resources.js';
import { PORTAL_VIDEO_KEYS } from '../lib/portal-videos.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

test('every resource has an id, name, category, audiences, jurisdiction, source, what/who/how and an official https URL', () => {
  assert.ok(RESOURCES.length >= 30, `expected 30+ resources, got ${RESOURCES.length}`);
  const ids = new Set();
  const categoryIds = new Set(CATEGORIES.map((c) => c.id));
  const audienceIds = new Set(AUDIENCES.map((a) => a.id));
  const jurisdictionIds = new Set(JURISDICTIONS.map((j) => j.id));
  for (const r of RESOURCES) {
    assert.ok(r.id && typeof r.id === 'string' && /^[a-z0-9-]+$/.test(r.id), `${r.id} id`);
    assert.ok(!ids.has(r.id), `duplicate resource id ${r.id}`);
    ids.add(r.id);
    assert.ok(r.name && typeof r.name === 'string', `${r.id} name`);
    assert.ok(categoryIds.has(r.category), `${r.id} unknown category ${r.category}`);
    assert.ok(Array.isArray(r.audiences) && r.audiences.length > 0, `${r.id} audiences`);
    for (const a of r.audiences) assert.ok(audienceIds.has(a), `${r.id} unknown audience ${a}`);
    assert.ok(jurisdictionIds.has(r.jurisdiction), `${r.id} unknown jurisdiction ${r.jurisdiction}`);
    assert.ok(r.source && typeof r.source === 'string', `${r.id} source`);
    for (const field of ['what', 'who', 'how']) {
      assert.ok(r[field] && typeof r[field] === 'string' && r[field].length >= 20, `${r.id} ${field}`);
    }
    assert.ok(r.url && typeof r.url === 'string', `${r.id} url`);
    assert.ok(r.url.startsWith('https://'), `${r.id} url must be https: ${r.url}`);
    assert.ok(!r.url.includes('example.'), `${r.id} url must not be a placeholder`);
    assert.ok(!/\s/.test(r.url), `${r.id} url must not contain spaces`);
    if (r.amount !== undefined) assert.ok(typeof r.amount === 'string' && r.amount.length > 0, `${r.id} amount`);
    if (r.note !== undefined) assert.ok(typeof r.note === 'string' && r.note.length > 0, `${r.id} note`);
  }
});

test('every category and every jurisdiction has at least one resource', () => {
  for (const c of CATEGORIES) {
    assert.ok(RESOURCES.some((r) => r.category === c.id), `no resource in category ${c.id}`);
  }
  for (const j of JURISDICTIONS) {
    assert.ok(RESOURCES.some((r) => r.jurisdiction === j.id), `no resource in jurisdiction ${j.id}`);
  }
});

test('coverage per jurisdiction matches the curated counts', () => {
  const counts = countByJurisdiction();
  assert.equal(counts['canada-federal'], 15);
  assert.equal(counts.alberta, 9);
  assert.equal(counts['us-federal'], 7);
  assert.equal(counts.california, 1);
  assert.equal(counts['new-york'], 1);
  assert.equal(RESOURCES.length, 33);
});

test('both audiences are served in Canada and in the United States', () => {
  const canada = RESOURCES.filter((r) => ['canada-federal', 'alberta'].includes(r.jurisdiction));
  const us = RESOURCES.filter((r) => ['us-federal', 'california', 'new-york'].includes(r.jurisdiction));
  for (const group of [canada, us]) {
    assert.ok(group.some((r) => r.audiences.includes('startup')), 'no startup resource in group');
    assert.ok(group.some((r) => r.audiences.includes('existing')), 'no existing-business resource in group');
  }
});

test('filterResources honours audience, jurisdiction, category and query', () => {
  const startups = filterResources({ audience: 'startup' });
  assert.ok(startups.length > 0 && startups.length < RESOURCES.length, 'startup filter narrows');
  assert.ok(startups.every((r) => r.audiences.includes('startup')), 'startup filter leaks');
  const alberta = filterResources({ jurisdiction: 'alberta' });
  assert.equal(alberta.length, 9);
  assert.ok(alberta.every((r) => r.jurisdiction === 'alberta'), 'alberta filter leaks');
  const taxes = filterResources({ category: 'taxes' });
  assert.equal(taxes.length, 4);
  assert.ok(taxes.every((r) => r.category === 'taxes'), 'taxes filter leaks');
  const exporting = filterResources({ query: 'export' });
  assert.ok(exporting.length >= 5, `expected 5+ export matches, got ${exporting.length}`);
  assert.ok(exporting.every((r) => `${r.name} ${r.what} ${r.who} ${r.how}`.toLowerCase().includes('export')),
    'query filter leaks');
  assert.equal(filterResources({ audience: 'startup', jurisdiction: 'alberta' }).length, 6);
  assert.equal(filterResources().length, RESOURCES.length);
});

test('the satellite registry, god menu and locales carry the seat', async () => {
  const satellitesText = readFileSync(join(REPO, 'lib/i18n/satellites.ts'), 'utf8');
  assert.ok(
    satellitesText.includes('{ key: "business-services", route: "/business-services", pos: "UTILITIES", section: "UTILITIES", constellation: "ARES" }'),
    'satellites.ts seat missing',
  );
  const { GOD_MENUS } = await import('../lib/god-menus.js');
  const utilities = GOD_MENUS.find((m) => m.god === 'UTILITIES');
  assert.ok(utilities, 'UTILITIES god missing');
  assert.ok(utilities.satellites.includes('business-services'), 'god menu missing business-services');
  for (const locale of ['en', 'de', 'fr', 'es', 'el', 'it', 'pt']) {
    const json = JSON.parse(readFileSync(join(REPO, 'lib/i18n/locales', `${locale}.json`), 'utf8'));
    assert.equal(json['sat.business-services.title'], 'Business Services', `${locale} title`);
    assert.ok(
      (json['sat.business-services.subtitle'] || '').startsWith('Grants, loans, mentors'),
      `${locale} subtitle`,
    );
  }
});

test('the portal video key is registered, sorted, and the file exists', () => {
  assert.ok(PORTAL_VIDEO_KEYS.includes('business-services'), 'portal video key missing');
  const sorted = [...PORTAL_VIDEO_KEYS].sort();
  assert.deepEqual(PORTAL_VIDEO_KEYS, sorted, 'PORTAL_VIDEO_KEYS must stay sorted');
  const file = join(REPO, 'public/videos/portals/business-services.mp4');
  assert.ok(existsSync(file), 'portal video file missing');
  const { size } = statSync(file);
  assert.ok(size > 100 * 1024, `portal video suspiciously small: ${size} bytes`);
});
