// tests/program-menu-fullscreen.test.mjs
// Program menu fullscreen layering (Merlin 2026-10-03): when opened, the
// program menu stretches corner-to-corner over everything; minimizing
// collapses it back into the portal button and the hub UI reappears.
//
// Static source analysis on app/page.jsx (same pattern as hub-ui.test.mjs).
// Run: node --test tests/program-menu-fullscreen.test.mjs (from repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const page = readFileSync(join(repo, 'app', 'page.jsx'), 'utf8');

describe('program menu fullscreen layering', () => {
  it('expanded menu is a fixed corner-to-corner overlay', () => {
    assert.ok(page.includes('{isMenuExpanded ? ('), 'menu still driven by isMenuExpanded');
    assert.ok(
      page.includes('className="fixed inset-0 z-[40000] ui-element"'),
      'fullscreen fixed overlay at the top in-app layer'
    );
    assert.ok(page.includes('role="dialog"'), 'dialog role on the overlay');
    assert.ok(page.includes('aria-modal="true"'), 'modal semantics');
  });

  it('overlay sits above all hub UI but below the auth layer', () => {
    const zValues = [...page.matchAll(/z-\[(\d+)\]/g)].map((m) => parseInt(m[1], 10));
    assert.ok(zValues.includes(40000), 'menu z-index present');
    // The auth overlay (z-[50000], components/Auth.jsx) stays the topmost
    // system layer; hub chrome (z-50 / z-[80]) sits beneath the menu.
    const inApp = zValues.filter((z) => z < 50000);
    assert.ok(Math.max(...inApp) <= 40000, 'menu is the topmost in-app layer');
  });

  it('minimize collapses the menu; the Concourse PORTALS tile reopens it', () => {
    assert.ok(
      page.includes('onClick={() => { fx.menuClose(); setIsMenuExpanded(false); }}'),
      'minimize ([_]) still closes via fx.menuClose + setIsMenuExpanded(false)'
    );
    // The old floating portal button is gone (2026-10-27): the menu
    // now opens from the Concourse PORTALS tile via the
    // olympus:concourse-open event, which toggles expanded state
    // and plays fx.menuOpen() when opening.
    assert.ok(page.includes('olympus:concourse-open'), 'menu opens via the Concourse tile event');
    assert.ok(page.includes("tile === 'portals'"), 'PORTALS tile is the menu opener');
    assert.ok(
      page.includes('setIsMenuExpanded((expanded)'),
      'PORTALS tile toggles menu expanded state'
    );
  });

  it('all menu functionality is preserved in the overlay', () => {
    assert.ok(page.includes('<SatelliteMenu'), 'SatelliteMenu still rendered');
    assert.ok(
      page.includes('onLaunch={(route, key, pos) => launchPocketUniverse(route, key, pos)}'),
      'launch path unchanged'
    );
    assert.ok(page.includes('<SettingsGear />'), 'settings gear kept');
    assert.ok(page.includes("{t('ui.disconnect')}"), 'disconnect button kept');
    assert.ok(page.includes('Select your satellites'), 'menu title kept');
  });

  it('the old floating-card panel is gone', () => {
    const noComments = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.ok(
      !noComments.includes('w-[min(16rem,calc(100vw-2.5rem))]'),
      'no more 16rem floating card width'
    );
    assert.ok(!noComments.includes('max-h-[70dvh]'), 'no more 70dvh card height cap');
  });

  it('overlay respects iPhone safe areas', () => {
    assert.ok(page.includes('env(safe-area-inset-top)'), 'top safe area');
    assert.ok(page.includes('env(safe-area-inset-bottom)'), 'bottom safe area');
  });
});
