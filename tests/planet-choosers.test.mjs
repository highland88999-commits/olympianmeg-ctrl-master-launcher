// tests/planet-choosers.test.mjs
// Jupiter + Mars menus like Earth's (Merlin, Nov 15 ~04:29): tapping a
// planet in the hub offers its worlds — "Choose your Jupiter" lists
// Jupiter 1 + Jupiter 2, "Choose your Mars" lists Mars 1 + Mars 2 —
// following Earth's "Choose your Earth" chooser exactly (app/page.jsx,
// Merlin 2026-10-31).
//
// Registry finding (check-first): Earth's chooser worlds have NO
// registry entries — Earth 1 / Earth 2 are chooser-only — and neither
// do Jupiter 1 / Mars 1 need one. The standalone routes (mars,
// jupiter-2, mars-2) are ALREADY in BOTH registries with titles +
// subtitles in all 34 locales, so this suite asserts that existing
// coverage rather than adding duplicate keys.
// Run: node --test tests/planet-choosers.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { PLANET_CHOOSERS } from '../lib/planets/planet-choosers.js';
import { GOD_MENUS } from '../lib/god-menus.js';
import { SATELLITES } from '../lib/i18n/satellites.ts';
import { planetSeedFor } from '../lib/planets/planet-seeds.js';
import { PLANETS } from '../lib/god-orbits.js';

const page = readFileSync('app/page.jsx', 'utf8');

describe('planet chooser menus (Earth pattern)', () => {
  it('Jupiter menu lists exactly Jupiter 1 + Jupiter 2, in order', () => {
    const ids = PLANET_CHOOSERS.jupiter.options.map((o) => o.id);
    assert.deepEqual(ids, ['jupiter-1', 'jupiter-2']);
    assert.equal(PLANET_CHOOSERS.jupiter.title, 'Choose your Jupiter');
    assert.equal(PLANET_CHOOSERS.jupiter.subtitle, 'Two worlds. One tap.');
  });

  it('Mars menu lists exactly Mars 1 + Mars 2, in order', () => {
    const ids = PLANET_CHOOSERS.mars.options.map((o) => o.id);
    assert.deepEqual(ids, ['mars-1', 'mars-2']);
    assert.equal(PLANET_CHOOSERS.mars.title, 'Choose your Mars');
    assert.equal(PLANET_CHOOSERS.mars.subtitle, 'Two worlds. One tap.');
  });

  it('chooser targets are real: Jupiter 1 dives, Jupiter 2 + Mars 2 route, Mars 1 dives', () => {
    const [j1, j2] = PLANET_CHOOSERS.jupiter.options;
    assert.deepEqual(j1.target, { kind: 'planet', key: 'jupiter' });
    assert.ok(PLANETS.some((p) => p.key === 'jupiter'), 'jupiter must be an outer planet');
    assert.ok(planetSeedFor('jupiter'), 'jupiter needs a canonical seed to dive');
    assert.deepEqual(j2.target, { kind: 'route', route: '/jupiter-2' });
    assert.ok(existsSync('app/jupiter-2/page.jsx'), '/jupiter-2 route missing');
    const [m1, m2] = PLANET_CHOOSERS.mars.options;
    assert.deepEqual(m1.target, { kind: 'mars' });
    assert.deepEqual(m2.target, { kind: 'route', route: '/mars-2' });
    assert.ok(existsSync('app/mars-2/page.jsx'), '/mars-2 route missing');
  });

  it('button backgrounds exist (images on disk, gradients are gradients)', () => {
    for (const chooser of Object.values(PLANET_CHOOSERS)) {
      assert.ok(existsSync(`public${chooser.background}`), `${chooser.background} missing`);
      for (const opt of chooser.options) {
        if (opt.background.startsWith('/')) {
          assert.ok(existsSync(`public${opt.background}`), `${opt.background} missing`);
        } else {
          assert.ok(opt.background.startsWith('linear-gradient'), `${opt.id} background must be an image or a gradient`);
        }
      }
    }
  });

  it('page.jsx renders from the module — no second copy of the menu text', () => {
    assert.match(page, /PLANET_CHOOSERS\.jupiter\.options\.map/);
    assert.match(page, /PLANET_CHOOSERS\.mars\.options\.map/);
    assert.match(page, /\{PLANET_CHOOSERS\.jupiter\.title\}/);
    assert.match(page, /\{PLANET_CHOOSERS\.mars\.title\}/);
    assert.match(page, /\{opt\.label\}/);
    assert.match(page, /\{opt\.description\}/);
    assert.match(page, /onClick=\{\(\) => pickJupiter\(opt\)\}/);
    assert.match(page, /onClick=\{\(\) => pickMars\(opt\)\}/);
    // The literal menu strings live only in the module, not in the page.
    assert.ok(!page.includes('Choose your Jupiter'));
    assert.ok(!page.includes('Choose your Mars'));
    assert.ok(!page.includes('🪐 Jupiter 1'));
    assert.ok(!page.includes('⚡ Jupiter 2'));
    assert.ok(!page.includes('🔴 Mars 1'));
    assert.ok(!page.includes('🚙 Mars 2'));
  });

  it('Jupiter 1 has no registry entry — chooser-only, like Earth 1', () => {
    assert.ok(!GOD_MENUS.some((m) => (m.satellites || []).includes('jupiter')), 'jupiter must not be a god-menu satellite (no route)');
    assert.equal(SATELLITES.find((s) => s.key === 'jupiter'), undefined, 'jupiter must not be in satellites.ts (no route)');
    assert.ok(!GOD_MENUS.some((m) => (m.satellites || []).includes('earth')), 'earth has no satellite entry either — the chooser is the menu');
    assert.equal(SATELLITES.find((s) => s.key === 'earth'), undefined);
  });

  it('mars, jupiter-2, mars-2 are already in BOTH registries (ARES / ARGUS)', () => {
    for (const [key, route] of [['mars', '/mars'], ['jupiter-2', '/jupiter-2'], ['mars-2', '/mars-2']]) {
      const menus = GOD_MENUS.filter((m) => (m.satellites || []).includes(key));
      assert.equal(menus.length, 1, `${key} must live in exactly one god menu`);
      assert.equal(menus[0].god, 'ARES');
      const entry = SATELLITES.find((s) => s.key === key);
      assert.ok(entry, `${key} missing from satellites.ts`);
      assert.equal(entry.route, route);
      assert.equal(entry.pos, 'ARES');
      assert.equal(entry.section, 'OBSERVATORY');
      assert.equal(entry.constellation, 'ARGUS');
    }
  });

  it('all 34 locales carry titles + subtitles for mars, jupiter-2, mars-2', () => {
    const files = readdirSync('lib/i18n/locales').filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 34);
    for (const f of files) {
      const d = JSON.parse(readFileSync(`lib/i18n/locales/${f}`, 'utf8'));
      for (const key of ['mars', 'jupiter-2', 'mars-2']) {
        assert.ok(typeof d[`sat.${key}.title`] === 'string' && d[`sat.${key}.title`].length > 0, `${f} lacks ${key} title`);
        assert.ok(typeof d[`sat.${key}.subtitle`] === 'string' && d[`sat.${key}.subtitle`].length > 0, `${f} lacks ${key} subtitle`);
      }
    }
  });
});

describe('hub wiring (page.jsx)', () => {
  it('Jupiter tap opens the chooser; the pick dispatches by target', () => {
    assert.match(page, /const beginJupiterDive = \(\) => \{\s*if \(appState !== 'hub_freeroam'\) return;\s*setShowJupiterChooser\(true\);/);
    assert.match(page, /const pickJupiter = \(opt\) => \{\s*setShowJupiterChooser\(false\);\s*if \(opt\.target\.kind === 'route'\) \{\s*window\.location\.href = opt\.target\.route;\s*return;\s*\}\s*beginPlanetDive\(opt\.target\.key\);/);
    assert.match(page, /aria-label=\{PLANET_CHOOSERS\.jupiter\.title\}/);
    assert.match(page, /showJupiterChooser && \(/);
  });

  it('Mars tap opens the chooser; the pick dispatches by target', () => {
    assert.match(page, /const beginMarsDive = \(\) => \{\s*if \(appState !== 'hub_freeroam'\) return;\s*setShowMarsChooser\(true\);/);
    assert.match(page, /const pickMars = \(opt\) => \{\s*setShowMarsChooser\(false\);\s*if \(opt\.target\.kind === 'route'\) \{\s*window\.location\.href = opt\.target\.route;\s*return;\s*\}\s*if \(appState !== 'hub_freeroam'\) return;\s*setAppState\('mars_surface'\);/);
    assert.match(page, /aria-label=\{PLANET_CHOOSERS\.mars\.title\}/);
    assert.match(page, /showMarsChooser && \(/);
  });

  it('planet tap dispatch sends Jupiter to its chooser, others dive as before', () => {
    assert.match(page, /const handlePlanetTap = \(key\) => \{\s*if \(key === 'jupiter'\) \{\s*beginJupiterDive\(\);\s*return;\s*\}\s*beginPlanetDive\(key\);/);
    assert.match(page, /beginPlanetDive=\{handlePlanetTap\}/);
    assert.match(page, /const beginPlanetDive = \(key\) => \{/);
  });

  it('Earth chooser is untouched — still four worlds, still the Omega lamp', () => {
    assert.ok(page.includes('Choose your Earth'), 'Earth chooser title gone');
    for (const label of ['🌍 Earth 1', '🌑 Earth 2', '🌍 Earth 3', '🌍 Earth 4']) {
      assert.ok(page.includes(label), `Earth chooser lost ${label}`);
    }
    assert.match(page, /const chooseEarth1 = \(\) => \{/);
    assert.match(page, /const chooseEarth2 = \(\) => \{/);
    assert.match(page, /const chooseEarth3 = \(\) => \{/);
    assert.match(page, /const chooseEarth4 = \(\) => \{/);
    assert.ok(page.includes('Ω OMEGA PORTAL'), 'Earth chooser lost the Omega Portal lamp');
    assert.match(page, /aria-label="Choose your Earth"/);
  });
});
