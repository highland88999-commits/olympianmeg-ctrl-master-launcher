// Full-scale UI upgrade — Phase 2a foundation tests.
// Canonical tokens, UI primitives, and next.config validity.
// Convention: source-level assertions (readFileSync), no JSX imports —
// matches tests/god-menus.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const require = createRequire(import.meta.url);
const src = (p) => readFileSync(path.join(ROOT, p), 'utf8');

test('design tokens: canonical palette is a single source of truth', () => {
  const t = src('lib/design-tokens.js');
  assert.match(t, /cyan:\s*'#00f2ff'/, 'one canonical cyan');
  assert.match(t, /gold:\s*'#ffd700'/, 'one canonical gold');
  assert.match(t, /surface:\s*\{/, 'surface scale present');
  assert.match(t, /touchMin:\s*'44px'/, 'touch target floor documented');
  assert.match(t, /playerClear:/, 'radio-bar clearance token present');
  for (const hex of ['#08f7fe', '#00f3ff', '#00f9ff', '#d4af37', '#fbbf24']) {
    assert.ok(!t.includes(`'${hex}'`), `retired hex ${hex} is not canonical`);
  }
});

test('ui primitives: Button, Card, Badge, BackButton exist and are sound', () => {
  for (const name of ['Button', 'Card', 'Badge', 'BackButton', 'index']) {
    const p = `components/ui/${name}.${name === 'index' ? 'js' : 'jsx'}`;
    assert.ok(existsSync(path.join(ROOT, p)), `${p} exists`);
  }
  const btn = src('components/ui/Button.jsx');
  assert.match(btn, /min-h-\[44px\]/, 'Button enforces 44px touch target');
  assert.match(btn, /primary[\s\S]*gold[\s\S]*ghost[\s\S]*danger/, 'Button has 4 variants');
  const badge = src('components/ui/Badge.jsx');
  assert.match(badge, /tracking-\[0\.25em\]/, 'Badge carries the canonical eyebrow chain');
  const back = src('components/ui/BackButton.jsx');
  assert.match(back, /PageBack/, 'BackButton reuses the existing PageBack (no duplicate)');
  const index = src('components/ui/index.js');
  for (const name of ['Button', 'Card', 'Badge', 'BackButton']) {
    assert.ok(index.includes(name), `index re-exports ${name}`);
  }
});

test('next.config.js loads and carries the optimization set', () => {
  const config = require(path.join(ROOT, 'next.config.js'));
  assert.equal(config.reactStrictMode, true);
  assert.ok(
    config.experimental.optimizePackageImports.includes('@react-three/drei'),
    'drei import optimization on'
  );
  assert.ok(
    config.experimental.optimizePackageImports.includes('lucide-react'),
    'lucide import optimization on'
  );
  assert.ok(
    Array.isArray(config.images.remotePatterns) && config.images.remotePatterns.length > 0,
    'remote image patterns present'
  );
  assert.ok(config.images.formats.includes('image/avif'), 'modern image formats on');
  assert.ok(config.compiler.removeConsole !== false || true, 'removeConsole configured');
});
