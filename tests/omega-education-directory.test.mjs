// tests/omega-education-directory.test.mjs — The baked-in directory.
// Run: node --test tests/omega-education-directory.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIRECTORY, entryById } from '../lib/education/directory.js';
import { LEVEL_IDS } from '../lib/education/levels.js';
import { FIELD_IDS } from '../lib/education/fields.js';

test('615 entries: 476 K-12, 74 university, 53 college, 7 trades, 5 daycare', () => {
  const byLevel = {};
  for (const e of DIRECTORY) byLevel[e.level] = (byLevel[e.level] || 0) + 1;
  assert.equal(DIRECTORY.length, 615);
  assert.equal(byLevel.k12, 476);
  assert.equal(byLevel.university, 74);
  assert.equal(byLevel.college, 53);
  assert.equal(byLevel.trades, 7);
  assert.equal(byLevel.daycare, 5);
  assert.equal(byLevel.preschool || 0, 0);
});

test('every entry is well-formed: unique id, real name and URL, known level and fields, real coords', () => {
  const ids = new Set();
  const urls = new Set();
  for (const e of DIRECTORY) {
    assert.ok(e.id && typeof e.id === 'string', 'id');
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
    ids.add(e.id);
    assert.ok(e.name && e.name.length > 1, `${e.id} name`);
    assert.ok(/^https?:\/\//.test(e.url), `${e.id} url must be http(s): ${e.url}`);
    // Several Alberta schools list their authority's homepage, so one URL
    // may serve several schools — but the same school must never appear twice.
    assert.ok(!urls.has(`${e.name.toLowerCase()}|${e.url.toLowerCase()}`), `duplicate school ${e.name} ${e.url}`);
    urls.add(`${e.name.toLowerCase()}|${e.url.toLowerCase()}`);
    assert.ok(LEVEL_IDS.has(e.level), `${e.id} level ${e.level}`);
    assert.ok(Array.isArray(e.fields) && e.fields.length > 0, `${e.id} fields`);
    for (const f of e.fields) assert.ok(FIELD_IDS.has(f), `${e.id} field ${f}`);
    assert.ok(Array.isArray(e.programs) && e.programs.length > 0, `${e.id} programs`);
    assert.ok(e.location && e.location.city && e.location.region && e.location.country, `${e.id} location`);
    assert.ok(typeof e.location.lat === 'number' && e.location.lat >= 30 && e.location.lat <= 70, `${e.id} lat ${e.location.lat}`);
    assert.ok(typeof e.location.lon === 'number' && e.location.lon >= -136 && e.location.lon <= -50, `${e.id} lon ${e.location.lon}`);
    assert.ok(['alberta-open-data', 'institution', 'trades-authority'].includes(e.source), `${e.id} source ${e.source}`);
  }
});

test('K-12 entries carry fields [general] and grade programs from the Alberta file', () => {
  const k12 = DIRECTORY.filter((e) => e.level === 'k12');
  assert.ok(k12.length > 0);
  for (const e of k12) {
    assert.deepEqual(e.fields, ['general']);
    assert.equal(e.source, 'alberta-open-data');
    assert.ok(e.programs.some((p) => /Elementary|Junior High|Senior High|Early Childhood/.test(p)), `${e.id} programs ${e.programs}`);
    assert.ok(e.location.region === 'Alberta' && e.location.country === 'Canada');
  }
  // The home corridor is fully covered.
  const corridor = ['Redwater', 'Gibbons', 'Bon Accord', 'Morinville', 'Legal', 'St. Albert', 'Fort Saskatchewan', 'Sherwood Park'];
  for (const city of corridor) {
    assert.ok(k12.some((e) => e.location.city === city), `no K-12 school in ${city}`);
  }
});

test('post-secondary entries cover both countries and the home town', () => {
  const ps = DIRECTORY.filter((e) => e.level !== 'k12');
  assert.ok(ps.some((e) => e.name === 'University of Alberta'));
  assert.ok(ps.some((e) => e.name === 'University of Toronto'));
  assert.ok(ps.some((e) => e.name === 'Massachusetts Institute of Technology (MIT)'));
  assert.ok(ps.some((e) => e.name === 'Red Seal Program'));
  assert.ok(ps.some((e) => e.name === 'Little Steps Daycare' && e.location.city === 'Redwater'));
  assert.ok(ps.some((e) => e.name === 'Athabasca University' && e.online === true));
  const countries = new Set(ps.map((e) => e.location.country));
  assert.deepEqual([...countries].sort(), ['Canada', 'United States']);
  const cities = new Set(DIRECTORY.map((e) => e.location.city));
  assert.ok(cities.size >= 140, `expected 140+ cities, got ${cities.size}`);
});

test('entryById finds entries and returns null for unknown ids', () => {
  const first = DIRECTORY[0];
  assert.equal(entryById(first.id).name, first.name);
  assert.equal(entryById('no-such-id'), null);
});

test('directory file carries its source note and OGLA attribution', () => {
  const src = readFileSync(new URL('../lib/education/directory.js', import.meta.url), 'utf8');
  assert.ok(src.includes('Open Government Licence'), 'OGLA attribution in the header');
  assert.ok(src.includes('authority_and_school.xlsx'), 'Alberta file named in the header');
  assert.ok(src.includes('gen-directory.mjs'), 'generator named in the header');
});
