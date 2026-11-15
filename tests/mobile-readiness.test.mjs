// Mobile readiness invariants — PWA baseline, viewport, touch floor, Capacitor config.
// Convention: source-level assertions (readFileSync), no JSX imports —
// matches tests/fullscale-ui.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const src = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => existsSync(path.join(ROOT, p));

test('pwa manifest: installable baseline is present and sound', () => {
  assert.ok(exists('public/manifest.webmanifest'), 'manifest.webmanifest exists');
  const m = JSON.parse(src('public/manifest.webmanifest'));
  assert.equal(m.display, 'standalone', 'standalone display');
  assert.equal(m.start_url, '/', 'start_url is /');
  assert.equal(m.theme_color, '#050505', 'theme color');
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192'), '192 icon declared');
  assert.ok(sizes.includes('512x512'), '512 icon declared');
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'), 'maskable icon declared');
});

test('pwa manifest: /manifest.json exists for the layouts that declare it', () => {
  // app/fortress-of-solitude/layout.tsx and app/phone-home/layout.tsx
  // declare manifest: '/manifest.json' — without the file the browser
  // logs a 404 on every visit (scout flaw 13, Nov 14, 2026). It mirrors
  // the webmanifest: same name, start_url, theme, and on-disk icons.
  assert.ok(exists('public/manifest.json'), 'manifest.json exists');
  const m = JSON.parse(src('public/manifest.json'));
  const w = JSON.parse(src('public/manifest.webmanifest'));
  assert.equal(m.name, w.name, 'same name as webmanifest');
  assert.equal(m.short_name, w.short_name, 'same short_name as webmanifest');
  assert.equal(m.start_url, '/', 'start_url is /');
  assert.equal(m.display, 'standalone', 'standalone display');
  assert.equal(m.theme_color, '#050505', 'theme color');
  for (const icon of m.icons) {
    assert.ok(exists(`public${icon.src}`), `${icon.src} exists`);
  }
});

test('pwa icons: required files exist on disk', () => {
  for (const f of [
    'public/icons/icon-192.png',
    'public/icons/icon-512.png',
    'public/icons/icon-maskable-192.png',
    'public/icons/icon-maskable-512.png',
    'public/icons/apple-touch-icon.png',
    'public/icons/app-store-master-1024.png',
  ]) {
    assert.ok(exists(f), `${f} exists`);
  }
});

test('viewport: pinch zoom is not blocked', () => {
  const layout = src('app/layout.jsx');
  assert.match(layout, /width:\s*["']device-width["']/, 'device-width set');
  assert.match(layout, /initialScale:\s*1/, 'initialScale set');
  const m = layout.match(/export const viewport = \{([\s\S]*?)\};/);
  assert.ok(m, 'viewport export found');
  const body = m[1].replace(/\/\/.*$/gm, ''); // ignore explanatory comments
  assert.ok(!body.includes('maximumScale'), 'no maximumScale in viewport export (pinch zoom allowed)');
  assert.ok(!body.includes('userScalable'), 'no userScalable=false in viewport export (pinch zoom allowed)');
});

test('design tokens: mobile floors are documented', () => {
  const t = src('lib/design-tokens.js');
  assert.match(t, /touchMin:\s*'44px'/, '44px touch target floor');
  assert.match(t, /playerClear:/, 'radio-bar clearance token present');
});

test('capacitor config: native-shell scaffold is present and sane', () => {
  assert.ok(exists('capacitor.config.ts'), 'capacitor.config.ts exists');
  const c = src('capacitor.config.ts');
  assert.match(c, /appId:\s*'[^']+'/, 'appId set');
  assert.match(c, /appName:\s*'NEXUS VORTEX'/, 'app name set');
  assert.match(c, /url:\s*'https:\/\/olympusverse\.com'/, 'live server URL points at production');
  assert.match(c, /cleartext:\s*false/, 'cleartext disabled');
});
