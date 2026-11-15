// tests/jupiter2-mars2-registry.test.mjs
// Jupiter 2 + Mars 2 (Merlin, Nov 15 ~01:11) — the dual-registry rule:
// a satellite renders ONLY if it is in BOTH lib/god-menus.js AND
// lib/i18n/satellites.ts, with a title + subtitle in every locale
// (the English title in all 34 locales, per the cheat-code rule).
// Run: node --test tests/jupiter2-mars2-registry.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { GOD_MENUS } from '../lib/god-menus.js';
import { SATELLITES } from '../lib/i18n/satellites.ts';

const WORLDS = [
  { key: 'jupiter-2', route: '/jupiter-2', title: 'Jupiter 2' },
  { key: 'mars-2', route: '/mars-2', title: 'Mars 2' },
];

describe('Jupiter 2 + Mars 2 registry (dual-registry rule)', () => {
  for (const w of WORLDS) {
    it(`${w.key} is in a god menu (beside Mars, ARES)`, () => {
      const menus = GOD_MENUS.filter((m) =>
        (m.satellites || []).includes(w.key),
      );
      assert.equal(menus.length, 1, `${w.key} must live in exactly one god menu`);
      assert.equal(menus[0].god, 'ARES');
    });

    it(`${w.key} is in satellites.ts with the right route + placement`, () => {
      const entry = SATELLITES.find((s) => s.key === w.key);
      assert.ok(entry, `${w.key} missing from satellites.ts`);
      assert.equal(entry.route, w.route);
      assert.equal(entry.pos, 'ARES');
      assert.equal(entry.section, 'OBSERVATORY');
      assert.equal(entry.constellation, 'ARGUS');
    });

    it(`${w.key} route file exists`, () => {
      assert.ok(existsSync(`app${w.route}/page.jsx`), `app${w.route}/page.jsx missing`);
    });

    it(`${w.key} has an English title + subtitle`, () => {
      const en = JSON.parse(readFileSync('lib/i18n/locales/en.json', 'utf8'));
      assert.equal(en[`sat.${w.key}.title`], w.title);
      assert.ok(
        typeof en[`sat.${w.key}.subtitle`] === 'string' &&
          en[`sat.${w.key}.subtitle`].length > 0,
        `${w.key} subtitle missing`,
      );
    });
  }

  it('all 34 locales carry the English title for both worlds', () => {
    const files = readdirSync('lib/i18n/locales').filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 34);
    for (const f of files) {
      const d = JSON.parse(readFileSync(`lib/i18n/locales/${f}`, 'utf8'));
      for (const w of WORLDS) {
        assert.equal(d[`sat.${w.key}.title`], w.title, `${f} lacks ${w.key} title`);
        assert.ok(d[`sat.${w.key}.subtitle`], `${f} lacks ${w.key} subtitle`);
      }
    }
  });

  it('the two worlds are distinct routes, not aliases of Mars 1 / each other', () => {
    const routes = SATELLITES.filter((s) => ['mars', 'jupiter-2', 'mars-2'].includes(s.key));
    assert.equal(routes.length, 3);
    assert.equal(new Set(routes.map((s) => s.route)).size, 3);
  });
});
