// Native capability layer tests — Capacitor plugin wiring with web fallbacks.
// Convention: node:test + assert/strict. Native plugins are stubbed by running
// in plain node (isNative() === false), so every test exercises the graceful
// fallback path. No JSX imports, no browser needed.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const native = await import('../lib/native.js');
const push = await import('../lib/push.js');

// --- navigator stubbing (node 24 ships a bare getter-only navigator global) ---

function setNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}
const REAL_NAVIGATOR = globalThis.navigator;
beforeEach(() => {
  setNavigator(REAL_NAVIGATOR);
});
afterEach(() => {
  setNavigator(REAL_NAVIGATOR);
});

// --- platform detection ---

test('isNative() is false outside the Capacitor shell', () => {
  assert.equal(native.isNative(), false);
});

test('isPushAvailable() is false outside the Capacitor shell', () => {
  assert.equal(push.isPushAvailable(), false);
});

// --- deep-link parsing (pure) ---

test('parseDeepLink: custom-scheme host-segment shape', () => {
  const p = native.parseDeepLink('nexusvortex://battleship?code=ABC123');
  assert.ok(p);
  assert.equal(p.path, '/battleship');
  assert.equal(p.search, '?code=ABC123');
  assert.equal(p.code, 'ABC123');
});

test('parseDeepLink: custom-scheme with domain host keeps pathname', () => {
  const p = native.parseDeepLink('nexusvortex://olympusverse.com/chess?code=zz99aa');
  assert.ok(p);
  assert.equal(p.path, '/chess');
  assert.equal(p.code, 'ZZ99AA');
});

test('parseDeepLink: universal https link', () => {
  const p = native.parseDeepLink('https://olympusverse.com/nova?code=QWERTY');
  assert.ok(p);
  assert.equal(p.path, '/nova');
  assert.equal(p.search, '?code=QWERTY');
  assert.equal(p.code, 'QWERTY');
});

test('parseDeepLink: link without a code still routes the path', () => {
  const p = native.parseDeepLink('https://olympusverse.com/erebus');
  assert.ok(p);
  assert.equal(p.path, '/erebus');
  assert.equal(p.search, '');
  assert.equal(p.code, null);
});

test('parseDeepLink: rejects malformed codes and garbage input', () => {
  const bad = native.parseDeepLink('https://olympusverse.com/?code=TOOLONG123');
  assert.ok(bad);
  assert.equal(bad.code, null); // 6 alnum chars only
  assert.equal(native.parseDeepLink('not a url'), null);
  assert.equal(native.parseDeepLink(''), null);
  assert.equal(native.parseDeepLink(null), null);
});

// --- deep-link init (no-op off native) ---

test('initDeepLinks: no-ops off native and returns a cleanup', async () => {
  let routed = false;
  const cleanup = await native.initDeepLinks({ onRoute: () => { routed = true; } });
  assert.equal(typeof cleanup, 'function');
  assert.equal(routed, false);
  cleanup(); // must not throw
});

// --- haptics fallbacks ---

test('tap(): silent none when no haptic channel exists', async () => {
  setNavigator({});
  assert.equal(await native.tap(), 'none');
  assert.equal(await native.confirm(), 'none');
});

test('tap(): falls back to navigator.vibrate on web', async () => {
  const calls = [];
  setNavigator({ vibrate: (p) => { calls.push(p); return true; } });
  assert.equal(await native.tap(), 'vibrate');
  assert.deepEqual(calls, [8]); // subtle: 8ms, not a buzz
  assert.equal(await native.confirm(), 'vibrate');
  assert.deepEqual(calls, [8, 20]);
});

// --- share fallbacks ---

test('shareContent(): uses Web Share API when available', async () => {
  const seen = [];
  setNavigator({
    share: async (data) => { seen.push(data); },
  });
  const r = await native.shareContent({ title: 'T', text: 'X', url: 'https://olympusverse.com' });
  assert.equal(r.ok, true);
  assert.equal(r.method, 'web');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'https://olympusverse.com');
});

test('shareContent(): falls back to clipboard when Web Share is missing', async () => {
  const written = [];
  setNavigator({
    clipboard: { writeText: async (t) => { written.push(t); } },
  });
  const r = await native.shareContent({ title: 'T', text: 'X', url: 'https://olympusverse.com/y' });
  assert.equal(r.ok, true);
  assert.equal(r.method, 'clipboard');
  assert.ok(written[0].includes('https://olympusverse.com/y'));
});

test('shareContent(): honest failure when nothing can share', async () => {
  setNavigator({});
  const r = await native.shareContent({ text: 'X' });
  assert.equal(r.ok, false);
  assert.equal(r.method, 'none');
});

test('shareContent(): never throws', async () => {
  setNavigator({
    share: async () => { throw new Error('user cancelled'); },
  });
  const r = await native.shareContent({ text: 'X' });
  assert.equal(r.ok, false);
  assert.equal(r.method, 'none');
  assert.ok(r.error);
});

// --- push (no-op off native) ---

test('push: registerPush refuses off native without prompting', async () => {
  const r = await push.registerPush({ onToken: () => { throw new Error('must not be called'); } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not-native');
});

test('push: permission status is unavailable off native', async () => {
  assert.equal(await push.getPushPermissionStatus(), 'unavailable');
});

test('push: unregisterPush always resolves cleanly', async () => {
  const r = await push.unregisterPush();
  assert.equal(r.ok, true);
});
