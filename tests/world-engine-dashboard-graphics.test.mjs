// tests/world-engine-dashboard-graphics.test.mjs
// World Engine dashboard graphics (Merlin, Nov 15, 2026): every
// dashboard card carries its own tailored illustrated graphic in
// its card's accent color, and the dark space behind the cards has
// its own separate background graphic. Presentation only — titles,
// descriptions, accents, routes and layout are untouched.
//
// The page is 'use client' JSX, so this asserts at source level +
// against the image files on disk (existence, non-empty, distinct
// SHA-256 per graphic, background distinct from all nine cards).
//
// Run: node --test tests/world-engine-dashboard-graphics.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');
const sha = (p) => createHash('sha256').update(readFileSync(join(repo, p))).digest('hex');

const EXPECTED = [
  ['World Builder', '/world-engine/architect', '#00f0ff', 'world-builder.jpg'],
  ['Character Builder', '/world-engine/characters', '#ff00ff', 'character-builder.jpg'],
  ['Vehicle Builder', '/world-engine/vehicles', '#ff5500', 'vehicle-builder.jpg'],
  ['Weapon Builder', '/world-engine/weapons', '#ffd700', 'weapon-builder.jpg'],
  ['Weather Studio', '/world-engine/weather', '#0055ff', 'weather-studio.jpg'],
  ['Object Builder', '/world-engine/objects', '#00ffcc', 'object-builder.jpg'],
  ['Asset Uplink', '/world-engine/uplink', '#00ff00', 'asset-uplink.jpg'],
  ['Hologram Studio', '/world-engine/studio', '#a78bfa', 'hologram-studio.jpg'],
  ['3D Engine', '/world-engine/engine', '#ffffff', 'engine-3d.jpg'],
];

describe('world engine dashboard graphics', () => {
  const src = read('app/world-engine/dashboard/page.jsx');

  it('all nine cards carry their own graphic, in their accent color', () => {
    for (const [title, route, accent, file] of EXPECTED) {
      assert.ok(src.includes(`title: '${title}'`), `${title} title`);
      assert.ok(src.includes(`route: '${route}'`), `${title} route`);
      assert.ok(src.includes(`accent: '${accent}'`), `${title} accent`);
      assert.ok(
        src.includes(`graphic: '/images/world-engine/dashboard/${file}'`),
        `${title} graphic ${file}`
      );
    }
    const graphics = [...src.matchAll(/graphic: '([^']+)'/g)].map((m) => m[1]);
    assert.equal(graphics.length, 9);
    assert.equal(new Set(graphics).size, 9, 'no two cards share a graphic');
  });

  it('every card graphic exists on disk, non-empty, and distinct', () => {
    const hashes = new Map();
    for (const [, , , file] of EXPECTED) {
      const p = `public/images/world-engine/dashboard/${file}`;
      assert.ok(existsSync(join(repo, p)), `${file} exists`);
      assert.ok(statSync(join(repo, p)).size > 10000, `${file} non-trivial size`);
      const h = sha(p);
      assert.ok(!hashes.has(h), `${file} duplicates ${hashes.get(h)}`);
      hashes.set(h, file);
    }
  });

  it('the background graphic is its own dark layer, distinct from the cards', () => {
    const bg = 'public/images/world-engine/dashboard/dashboard-background.jpg';
    assert.ok(existsSync(join(repo, bg)), 'background exists');
    assert.ok(statSync(join(repo, bg)).size > 10000, 'background non-trivial size');
    // Wired in as the page backdrop (fixed still) and the header art.
    assert.ok(src.includes('src="/images/world-engine/dashboard/dashboard-background.jpg"'), 'still img');
    assert.ok(src.includes('url(/images/world-engine/dashboard/dashboard-background.jpg)'), 'header bg');
    const bgHash = sha(bg);
    for (const [, , , file] of EXPECTED) {
      assert.notEqual(sha(`public/images/world-engine/dashboard/${file}`), bgHash, `background != ${file}`);
    }
  });

  it('the old shared background is gone from the dashboard but kept for the landing page', () => {
    assert.ok(!src.includes('worldengine-bg.webp'), 'dashboard no longer references worldengine-bg.webp');
    assert.ok(existsSync(join(repo, 'public/images/world-engine/worldengine-bg.webp')), 'webp still on disk');
    assert.ok(read('app/world-engine/page.jsx').includes('worldengine-bg.webp'), 'landing page still uses it');
  });

  it('the card symbols still render over the graphics (menu-dressing fallback)', () => {
    assert.ok(src.includes('MODULE_ICONS[m.route]'), 'icon still rendered per card');
    assert.ok(src.includes('we-tile-ic relative z-10'), 'icon sits above the graphic');
    assert.ok(src.includes('<img src={m.graphic}'), 'graphic is an img in the card band');
  });
});
