// tests/vangogh.test.mjs
// Van Gogh sky mode (Merlin, 2026-10-31): a separate, toggleable
// Starry-Night hub background + painterly letter shadowing.
//
// Run: node --test tests/vangogh.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  setVanGoghActive,
  isVanGoghActive,
  onVanGoghChange,
  vanGoghTextProps,
  VANGOGH_SHADOW_COLOR,
  VANGOGH_BODY_CLASS,
} from '../lib/vangogh.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

describe('van gogh module flag', () => {
  it('starts off and toggles with subscriber notification', () => {
    setVanGoghActive(false);
    assert.equal(isVanGoghActive(), false);
    const seen = [];
    const unsub = onVanGoghChange((v) => seen.push(v));
    setVanGoghActive(true);
    assert.equal(isVanGoghActive(), true);
    assert.deepEqual(seen, [true]);
    setVanGoghActive(true); // no-op: no duplicate notify
    assert.deepEqual(seen, [true]);
    unsub();
    setVanGoghActive(false);
    assert.deepEqual(seen, [true], 'unsubscribed listener stays quiet');
    assert.equal(isVanGoghActive(), false);
  });

  it('vanGoghTextProps is empty when off, painterly when on', () => {
    setVanGoghActive(false);
    assert.deepEqual(vanGoghTextProps(1.6), {});
    setVanGoghActive(true);
    const p = vanGoghTextProps(1.6);
    assert.equal(p.outlineColor, VANGOGH_SHADOW_COLOR);
    assert.ok(p.outlineWidth > 0, 'outline has width');
    assert.ok(p.outlineOpacity > 0.5, 'outline is visible');
    setVanGoghActive(false);
  });

  it('shadow color is a warm umber, not a digital black', () => {
    assert.equal(VANGOGH_SHADOW_COLOR, '#2b1608');
    assert.notEqual(VANGOGH_SHADOW_COLOR, '#000000');
  });
});

describe('van gogh sky wiring (static)', () => {
  it('HomeScene swaps sky, fog, and background color on the flag', () => {
    const hs = read('components/HomeScene.jsx');
    assert.ok(hs.includes("import VanGoghSky from './VanGoghSky'"), 'sky component imported');
    assert.ok(hs.includes('<VanGoghSky />'), 'sky rendered');
    assert.ok(hs.includes('vgogh ?'), 'conditional swap present');
    assert.ok(hs.includes("'#101a4a'"), 'fog goes deep blue, not black');
    assert.ok(hs.includes("'#0a1030'"), 'background color goes deep blue');
    assert.ok(hs.includes('VANGOGH_BODY_CLASS'), 'body class toggled for DOM text');
  });

  it('the sky shader is phone-cheap: one sphere, no textures', () => {
    const sky = read('components/VanGoghSky.jsx');
    assert.ok(sky.includes('shaderMaterial'), 'single shader material');
    assert.ok(sky.includes('fog={false}'), 'sky ignores fog');
    assert.ok(sky.includes('BackSide'), 'inside-out sphere');
    assert.ok(!sky.includes('TextureLoader'), 'no texture loads');
    // 4-octave fbm: bounded cost per pixel.
    assert.ok(sky.includes('i < 4'), 'fbm octave count capped');
  });

  it('the toggle lives in Concourse Settings and persists via ui-settings', () => {
    const panel = read('components/ConcourseSettings.jsx');
    assert.ok(panel.includes("id: 'sky'"), 'sky section');
    assert.ok(panel.includes('vgogh'), 'bound to the vgogh setting');
    const settings = read('lib/ui-settings.js');
    assert.ok(settings.includes('vgogh'), 'settings shape carries vgogh');
    assert.ok(settings.includes('vgogh: false'), 'default is off');
  });

  it('hub troika labels use the Van Gogh wrapper', () => {
    for (const f of ['GodTower', 'NavBeacons', 'HubMoon', 'Ares', 'Zeus']) {
      const src = read(`components/${f}.jsx`);
      assert.ok(src.includes('VanGoghText'), `${f} uses the wrapper`);
      assert.ok(!src.includes('<Text'), `${f} has no raw <Text> left`);
    }
  });

  it('canvas sprite labels repaint on toggle', () => {
    for (const f of ['OmegaHubGate', 'Earth2HubGate', 'PlanetPortal', 'SpacePortalGates']) {
      const src = read(`components/${f}.jsx`);
      assert.ok(src.includes('paintVanGoghText') || src.includes('useVanGoghActive'), `${f} wired for painterly shadows`);
    }
  });

  it('DOM text gets painterly shadows under the body class', () => {
    const css = read('app/globals.css');
    assert.ok(css.includes('vgogh-sky-active'), 'body class rule present');
    assert.ok(css.includes('text-shadow'), 'shadow declared');
    assert.ok(css.includes('43, 22, 8'), 'warm umber tone in the shadow');
  });
});
