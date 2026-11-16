/*
 * TRUMAN UI declutter tests — run with: node --test tests/truman-ui.test.mjs
 * Covers the pure UI state helpers (minimize/restore per character,
 * control-menu expand/collapse) plus static audits on page.jsx:
 * every control still exists, the HUD is untouched, the old full-width
 * button wall is gone, and iPhone-safe markers are present.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CHARACTER_IDS,
  initialMinimized, toggleMinimized, minimizedCount,
  visibleCharacters, minimizedCharacters, toggleMenu,
} from '../app/truman/ui.js';

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, '../app/truman/page-classic.jsx'), 'utf8');
const uiSrc = readFileSync(join(here, '../app/truman/ui.js'), 'utf8');

const CHARACTERS = [
  { id: 'henry', name: 'HENRY CAHILL' },
  { id: 'valkyrie', name: 'VALKYRIE' },
  { id: 'rasputin', name: 'RASPUTIN' },
];

// ---------- pure state helpers ----------

test('character ids are the three known characters', () => {
  assert.deepEqual([...CHARACTER_IDS].sort(), ['henry', 'rasputin', 'valkyrie']);
});

test('initialMinimized starts with every panel visible', () => {
  assert.deepEqual(initialMinimized(), { henry: false, valkyrie: false, rasputin: false });
});

test('toggleMinimized minimizes one panel without touching the others', () => {
  const m = toggleMinimized(initialMinimized(), 'henry');
  assert.deepEqual(m, { henry: true, valkyrie: false, rasputin: false });
});

test('toggleMinimized again restores the panel', () => {
  const m = toggleMinimized(toggleMinimized(initialMinimized(), 'valkyrie'), 'valkyrie');
  assert.deepEqual(m, initialMinimized());
});

test('all three panels minimize independently', () => {
  let m = initialMinimized();
  for (const id of CHARACTER_IDS) m = toggleMinimized(m, id);
  assert.deepEqual(m, { henry: true, valkyrie: true, rasputin: true });
  assert.equal(minimizedCount(m), 3);
  // restoring one leaves the other two minimized
  m = toggleMinimized(m, 'rasputin');
  assert.deepEqual(m, { henry: true, valkyrie: true, rasputin: false });
  assert.equal(minimizedCount(m), 2);
});

test('toggleMinimized ignores unknown ids', () => {
  const before = initialMinimized();
  assert.deepEqual(toggleMinimized(before, 'zeus'), before);
  assert.deepEqual(toggleMinimized(before, ''), before);
});

test('visible/minimized character selectors split the roster', () => {
  const m = toggleMinimized(initialMinimized(), 'henry');
  assert.deepEqual(visibleCharacters(CHARACTERS, m).map((c) => c.id), ['valkyrie', 'rasputin']);
  assert.deepEqual(minimizedCharacters(CHARACTERS, m).map((c) => c.id), ['henry']);
  assert.deepEqual(visibleCharacters(CHARACTERS, initialMinimized()).map((c) => c.id),
    ['henry', 'valkyrie', 'rasputin']);
  assert.deepEqual(minimizedCharacters(CHARACTERS, initialMinimized()), []);
});

test('toggleMenu expands and collapses', () => {
  assert.equal(toggleMenu(false), true);
  assert.equal(toggleMenu(true), false);
});

// ---------- static audits on page.jsx ----------

const CONTROL_LABELS = [
  // Rendered as <AphroIcon …/> + text since the Aphrodite icon
  // refactor — the glyphs live in the icon component, the words
  // in the source. The controls themselves are unchanged.
  'PAUSE', 'RUN',
  'JUMP TO STORM', 'CALM MODE', 'CITY', "FOLLOW HENRY'S CAR", "HENRY'S APARTMENT",
];
for (const label of CONTROL_LABELS) {
  test(`control still present: ${label}`, () => {
    assert.ok(pageSrc.includes(label), `page.jsx lost control label: ${label}`);
  });
}

test('speed controls still present (1x/16x/120x via SPEEDS)', () => {
  assert.ok(pageSrc.includes('SPEEDS'), 'page.jsx lost the SPEEDS list');
  assert.ok(pageSrc.includes('×'), 'page.jsx lost the speed multiplier glyph');
  assert.ok(pageSrc.includes('setSpeed'), 'page.jsx lost the speed setter');
});

test('every character card has a minimize control and a restore path', () => {
  // Labels are template literals over c.name in the source:
  // `Minimize ${c.name} panel` / `Restore ${c.name} panel`.
  assert.ok(pageSrc.includes('Minimize ${c.name} panel'), 'no per-character minimize control found');
  assert.ok(pageSrc.includes('Restore ${c.name} panel'), 'no per-character restore control found');
});

test('control menu expands from / collapses into a floating icon', () => {
  assert.ok(pageSrc.includes('Open controls'), 'missing open-controls icon label');
  assert.ok(pageSrc.includes('Close controls'), 'missing close-controls label');
  assert.ok(pageSrc.includes('aria-expanded'), 'missing aria-expanded on the menu icon');
});

test('status HUD is untouched', () => {
  for (const marker of ['TRUMAN // LOCAL BRAIN', 'ZONE:', 'SYS:', 'LINK:', 'MONTH CYCLE', 'NEXT AXIOM EVENT']) {
    assert.ok(pageSrc.includes(marker), `HUD lost marker: ${marker}`);
  }
});

test('old full-width bottom button wall is gone', () => {
  assert.ok(
    !pageSrc.includes("bottom: 'calc(5rem + env(safe-area-inset-bottom))'"),
    'old bottom control wall container still present'
  );
});

test('iPhone-safe markers present', () => {
  assert.ok(pageSrc.includes('env(safe-area-inset-bottom)'), 'missing safe-area-inset-bottom');
  assert.ok(pageSrc.includes('100dvh'), 'missing 100dvh sizing');
});

test('ui.js is a pure module (no DOM, no React)', () => {
  for (const bad of ['document', 'window', 'useState', 'react', 'localStorage']) {
    assert.ok(!uiSrc.includes(bad), `ui.js references ${bad} — must stay headless`);
  }
});
