// tests/hologram-studio.test.mjs — HOLOGRAM STUDIO: real 3D preview.
// Pure logic only — the schema shape, the slider-to-3D-preview mapping,
// defaults/limits/save rules, and the page wiring. The live three.js
// hologram itself is NOT exercised here (no WebGL in Node); it is proven
// by Merlin's phone check after push, like every other 3D scene.
// Run: node tests/hologram-studio.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STUDIO_DEFAULTS,
  STUDIO_SLIDERS,
  STUDIO_LIMITS,
  STUDIO_SAVE_RULES,
  STUDIO_3D,
  STUDIO_PRESETS,
  buildHologramSchema,
  hologramPreviewStyle,
  hologramPreview3D,
  hologramTextAspect,
} from '../lib/world-engine/datasheets/studio.js';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('schema shape is unchanged: HolographicMesh with the same parameters', () => {
  const schema = buildHologramSchema({});
  assert.equal(schema.assetType, 'HolographicMesh');
  assert.deepEqual(Object.keys(schema.parameters), [
    'content',
    'emissiveColor',
    'scaleMultiplier',
    'bloomIntensity',
    'rotation',
  ]);
  assert.equal(schema.parameters.content, 'WORLD ENGINE');
  assert.equal(schema.parameters.emissiveColor, '#00ffcc');
  assert.equal(schema.parameters.scaleMultiplier, 4);
  assert.equal(schema.parameters.bloomIntensity, 1.5);
  assert.deepEqual(schema.parameters.rotation, { x: 0, y: 0, z: 0 });
});

test('schema carries custom slider values through unchanged', () => {
  const schema = buildHologramSchema({
    text: 'OLYMPUS',
    color: '#ffd700',
    scale: 6,
    glowIntensity: 2.5,
    rotationX: -10,
    rotationY: 20,
  });
  assert.equal(schema.parameters.content, 'OLYMPUS');
  assert.equal(schema.parameters.emissiveColor, '#ffd700');
  assert.equal(schema.parameters.scaleMultiplier, 6);
  assert.equal(schema.parameters.bloomIntensity, 2.5);
  assert.deepEqual(schema.parameters.rotation, { x: -10, y: 20, z: 0 });
});

test('defaults and limits are unchanged', () => {
  assert.deepEqual(STUDIO_DEFAULTS, {
    text: 'WORLD ENGINE',
    color: '#00ffcc',
    scale: 4,
    glowIntensity: 1.5,
    rotationX: 0,
    rotationY: 0,
  });
  assert.equal(STUDIO_LIMITS.maxTextLength, 60);
  assert.equal(STUDIO_LIMITS.glowCapForPreview, 3);
  assert.equal(STUDIO_LIMITS.previewGlowBlurPxPerUnit, 8);
  assert.equal(STUDIO_LIMITS.previewFontFamily, 'monospace');
  assert.equal(STUDIO_LIMITS.previewFontWeight, 'bold');
  for (const s of STUDIO_SLIDERS) {
    assert.equal(s.default, STUDIO_DEFAULTS[s.key], s.key);
  }
  assert.equal(STUDIO_PRESETS.length, 5);
});

test('save rules are unchanged: object category, procedural_generation URL', () => {
  assert.equal(STUDIO_SAVE_RULES.table, 'world_engine_assets');
  assert.equal(STUDIO_SAVE_RULES.category, 'object');
  assert.equal(STUDIO_SAVE_RULES.assetUrl, 'procedural_generation');
  assert.equal(STUDIO_SAVE_RULES.namePrefix, 'Hologram: ');
  assert.equal(STUDIO_SAVE_RULES.nameMaxLength, 40);
  assert.equal(STUDIO_SAVE_RULES.requiresSession, true);
});

test('3D mapping: defaults drive the scene', () => {
  const m = hologramPreview3D({});
  // Scale 4 of 1–10 maps a third of the way from 0.5 to 2.5.
  assert.ok(approx(m.groupScale, 0.5 + (3 / 9) * 2));
  // Glow 1.5 → opacity 0.55 + 0.15 × 1.5, light 1.5 × 1.2.
  assert.ok(approx(m.opacity, 0.775));
  assert.ok(approx(m.lightIntensity, 1.8));
  assert.ok(approx(m.rotationX, 0));
  assert.ok(approx(m.rotationY, 0));
  // Canvas glow blur follows the old CSS rule: capped glow × 8 px.
  assert.ok(approx(m.canvasGlowBlurPx, 12));
  assert.ok(approx(m.aspect, 'WORLD ENGINE'.length * 0.6));
});

test('3D mapping: scale slider spans the full group-scale range', () => {
  assert.ok(approx(hologramPreview3D({ scale: 1 }).groupScale, STUDIO_3D.groupScaleMin));
  assert.ok(approx(hologramPreview3D({ scale: 10 }).groupScale, STUDIO_3D.groupScaleMax));
  assert.ok(approx(hologramPreview3D({ scale: 5.5 }).groupScale, 1.5));
});

test('3D mapping: glow is capped at 3 so text stays readable', () => {
  const capped = hologramPreview3D({ glowIntensity: 3 });
  const over = hologramPreview3D({ glowIntensity: 5 });
  assert.deepEqual(over, capped);
  assert.ok(approx(capped.opacity, 1)); // 0.55 + 0.15 × 3 = 1.0, never above
  assert.ok(approx(capped.lightIntensity, 3.6));
  assert.ok(approx(capped.canvasGlowBlurPx, 24));
  assert.ok(approx(hologramPreview3D({ glowIntensity: 0 }).opacity, 0.55));
  assert.ok(approx(hologramPreview3D({ glowIntensity: 0 }).lightIntensity, 0));
  // The old CSS style caps the same way — the two previews agree.
  assert.equal(hologramPreviewStyle({ glowIntensity: 5 }).textShadow, '0 0 24px #00ffcc');
});

test('3D mapping: Tilt/Turn become radians, ±90° is ±π/2', () => {
  assert.ok(approx(hologramPreview3D({ rotationX: 90 }).rotationX, Math.PI / 2));
  assert.ok(approx(hologramPreview3D({ rotationX: -90 }).rotationX, -Math.PI / 2));
  assert.ok(approx(hologramPreview3D({ rotationY: 45 }).rotationY, Math.PI / 4));
  assert.ok(approx(hologramPreview3D({ rotationY: -20 }).rotationY, (-20 * Math.PI) / 180));
});

test('text aspect follows the monospace rule and never drops below the floor', () => {
  assert.ok(approx(hologramTextAspect('WORLD ENGINE'), 12 * 0.6));
  assert.ok(approx(hologramTextAspect('EXIT →'), 6 * 0.6));
  assert.ok(approx(hologramTextAspect(''), STUDIO_3D.minAspect));
  assert.ok(hologramTextAspect('A') > hologramTextAspect(''));
});

test('no cost is stated anywhere in the Studio — the survey line is stale', () => {
  // The page and the preview component must never show a cost.
  for (const p of [
    'app/world-engine/studio/page.jsx',
    'components/world-engine/HologramPreview.jsx',
  ]) {
    const src = read(p);
    assert.ok(!src.includes('Aether'), `${p} must not state an Aether cost`);
    assert.ok(!/costAether:\s*[0-9]/.test(src), `${p} must not carry a numeric cost`);
  }
  // The datasheet documents the deliberate null: the Studio never calls
  // the synthesize API, so costAether stays null (the word Aether only
  // appears in that documentation comment, never as a charged amount).
  const sheet = read('lib/world-engine/datasheets/studio.js');
  assert.ok(sheet.includes('costAether: null'));
  assert.ok(!/costAether:\s*[1-9]/.test(sheet));
});

test('page wires the real 3D preview and keeps save/copy/schema intact', () => {
  const src = read('app/world-engine/studio/page.jsx');
  assert.ok(src.includes("import HologramPreview from '@/components/world-engine/HologramPreview'"));
  assert.ok(src.includes('<HologramPreview {...previewParams} />'));
  assert.ok(src.includes('text, color, scale, glowIntensity, rotationX, rotationY'));
  // The CSS preview div is gone — no text-shadow style, no perspective.
  assert.ok(!src.includes('hologramPreviewStyle'), 'CSS preview style must be gone');
  assert.ok(!src.includes('perspective'), 'CSS perspective must be gone');
  // Save path, schema export and copy are untouched.
  assert.ok(src.includes('saveToLibrary'));
  assert.ok(src.includes('world_engine_assets') || src.includes('STUDIO_SAVE_RULES.table'));
  assert.ok(src.includes('buildHologramSchema'));
  assert.ok(src.includes('copyToClipboard'));
  assert.ok(src.includes('Save to library'));
  assert.ok(src.includes('Copy schema'));
});

test('HologramPreview reuses the MiniViewport renderer pattern', () => {
  const src = read('components/world-engine/HologramPreview.jsx');
  assert.ok(src.includes('guardCanvasContext'));
  assert.ok(src.includes("label: 'HOLOGRAM STUDIO'"));
  assert.ok(src.includes('contextGuard.isLost()'));
  assert.ok(src.includes('OrbitControls'));
  assert.ok(src.includes('autoRotate'));
  assert.ok(src.includes('renderer.dispose()'));
  assert.ok(src.includes('controls.dispose()'));
  assert.ok(src.includes('contextGuard.dispose()'));
  assert.ok(src.includes('CanvasTexture'));
  assert.ok(src.includes('AdditiveBlending'));
  assert.ok(src.includes('hologramPreview3D'));
  assert.ok(src.includes('scanline') || src.includes('Scanlines'));
  // No CSS fake: no text-shadow, no perspective transform on a div.
  assert.ok(!src.includes('textShadow'));
  assert.ok(!src.includes('rotateX('));
});
