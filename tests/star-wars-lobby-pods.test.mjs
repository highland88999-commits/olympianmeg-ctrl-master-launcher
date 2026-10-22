/*
 * Star Wars — exit-to-lobby + pods regression (bug report 2026-10-16).
 * Run: node tests/star-wars-lobby-pods.test.mjs
 * Source-level checks for the page shell (no browser), plus data checks
 * that Tatooine actually carries podracers.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/star-wars/page.jsx', import.meta.url), 'utf8');
const landmarksSrc = readFileSync(new URL('../app/star-wars/landmarks.js', import.meta.url), 'utf8');
const { PLANETS } = await import('../app/star-wars/data.js');
const LM = await import('../app/star-wars/landmarks.js');

describe('star-wars exit to lobby', () => {
  it('page has an always-visible Exit to Lobby link to the hub (/)', () => {
    assert.match(page, /href="\/"[^>]*aria-label="Exit to lobby"|aria-label="Exit to lobby"/);
    assert.match(page, /Exit to Lobby/);
  });
  it('exit button is styled top-left, above every mode overlay', () => {
    assert.match(page, /exitBtn:\s*\{[^}]*top:\s*BANNER_CLEAR[^}]*left:\s*20[^}]*zIndex:\s*90/s);
  });
  it('exit link is rendered outside all mode conditionals', () => {
    const exitIdx = page.indexOf('Exit to Lobby');
    const menuIdx = page.indexOf("{mode === 'menu'");
    assert.ok(exitIdx > -1 && menuIdx > -1 && exitIdx < menuIdx, 'exit must render before/independent of mode blocks');
  });
  it('map and zone title rows sit below the exit row (no overlap)', () => {
    assert.match(page, /mapTop:\s*\{[^}]*BANNER_CLEAR \+ ' \+ 54px/s);
    assert.match(page, /zoneTop:\s*\{[^}]*BANNER_CLEAR \+ ' \+ 54px/s);
  });
});

describe('star-wars pods', () => {
  it('podracer is a registered landmark type with solid colliders', () => {
    assert.ok(LM.LANDMARK_TYPES.includes('podracer'));
    assert.match(landmarksSrc, /'podracer':\s*function/);
    const fakeT = {};
    // buildLandmark needs THREE; import it the same way builders tests do
    return import('three').then((THREE) => {
      const built = LM.buildLandmark('podracer', THREE, fakeT);
      assert.ok(built.group instanceof THREE.Group);
      assert.equal(built.colliders.length, 3);
      for (const c of built.colliders) assert.ok(c.r > 0);
    });
  });
  it('Tatooine carries two podracers (the pods)', () => {
    const pods = PLANETS.tatooine.landmarks.filter((l) => l.type === 'podracer');
    assert.equal(pods.length, 2);
  });
});
