// tests/omega-500-registration.test.mjs — Omega 500 menu registration.
// Run: node tests/omega-500-registration.test.mjs (from the repo root).
// Mirrors the hygieia registration checks: the program must be in BOTH
// menu registries (dual-registry rule) AND have titles in all 7 locales,
// and the route files must exist.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

let pass = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log(`  ok ${name}`); }
  catch (e) { console.log(`  FAIL ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const regSrc = readFileSync('lib/i18n/satellites.ts', 'utf8');
ok('satellites.ts registers omega-500 (DIONYSUS, GAMES)', () => {
  assert.ok(regSrc.includes(
    '{ key: "omega-500", route: "/omega-500", pos: "DIONYSUS", section: "GAMES", constellation: "ZEUS" }',
  ));
  assert.equal((regSrc.match(/"omega-500"/g) || []).length, 1, 'exactly one entry');
});

const godSrc = readFileSync('lib/god-menus.js', 'utf8');
ok('omega-500 lives in the DIONYSUS god menu', () => {
  assert.ok(/god: 'DIONYSUS'[\s\S]*?'omega-500'/.test(godSrc));
  assert.equal((godSrc.match(/'omega-500'/g) || []).length, 1, 'exactly one entry');
});

for (const code of ['en', 'el', 'es', 'fr', 'de', 'pt', 'it']) {
  ok(`${code}: sat.omega-500.title + subtitle present`, () => {
    const loc = JSON.parse(readFileSync(`lib/i18n/locales/${code}.json`, 'utf8'));
    assert.equal(loc['sat.omega-500.title'], 'Omega 500');
    assert.ok(
      typeof loc['sat.omega-500.subtitle'] === 'string' && loc['sat.omega-500.subtitle'].length > 0,
    );
  });
}

ok('world-nexus world-names.js lists omega-500 (DIONYSUS)', () => {
  const src = readFileSync('app/world-nexus/world-names.js', 'utf8');
  assert.ok(src.includes(
    '{ key: "omega-500", title: "Omega 500", route: "/omega-500", god: "DIONYSUS" }',
  ));
  assert.equal((src.match(/"omega-500"/g) || []).length, 1, 'exactly one entry');
});

ok('route files exist: app/omega-500/page.jsx + layout.jsx', () => {
  assert.ok(existsSync('app/omega-500/page.jsx'));
  assert.ok(existsSync('app/omega-500/layout.jsx'));
});

ok('route files export nothing but the page/layout (no extra route exports)', () => {
  const page = readFileSync('app/omega-500/page.jsx', 'utf8');
  const named = [...page.matchAll(/^export (?!default)\w+/gm)].map((m) => m[0]);
  assert.deepEqual(named, [], `extra exports: ${named}`);
});

ok('no Daytona / NASCAR branding in the route or registries', () => {
  for (const f of ['app/omega-500/page.jsx', 'lib/god-menus.js', 'lib/i18n/satellites.ts']) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/daytona/i.test(src), `${f}: daytona`);
    assert.ok(!/nascar/i.test(src), `${f}: nascar`);
  }
});

console.log(`\n${pass} registration checks passed.`);
