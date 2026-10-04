// tests/hub-tutorial.test.mjs — Headless tests for the hub tutorial rollout
// (Merlin 2026-10-03): 30-day standard window, then new registrations only.
// Skip persists like completion. Guest fallback via first-seen timestamp.
//
// Run: node --test tests/hub-tutorial.test.mjs (from repo root).

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  HUB_TUTORIAL_STANDARD_UNTIL,
  HUB_TUTORIAL_SEEN_KEY,
  HUB_TUTORIAL_FIRST_SEEN_KEY,
  HUB_TUTORIAL_REGISTERED_KEY,
  shouldShowHubTutorial,
  isHubTutorialSeen,
  markHubTutorialSeen,
  stashHubRegisteredAt,
  resolveHubRegisteredAt,
} from '../lib/hub-tutorial.js';

// Minimal in-memory localStorage behind a fake window.
function installStorage() {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(String(k), String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    },
  };
  return store;
}

describe('hub tutorial rollout rule', () => {
  it('cutoff constant is 30 days after 2026-10-03', () => {
    assert.equal(HUB_TUTORIAL_STANDARD_UNTIL, '2026-11-03');
  });

  it('before cutoff + unseen -> show (old user still sees it in the standard window)', () => {
    assert.equal(
      shouldShowHubTutorial({
        seen: false,
        now: new Date('2026-10-15T12:00:00Z'),
        registeredAt: '2026-09-01T00:00:00Z',
      }),
      true
    );
  });

  it('before cutoff + unseen + no registeredAt -> show', () => {
    assert.equal(
      shouldShowHubTutorial({ seen: false, now: new Date('2026-10-20T00:00:00Z'), registeredAt: null }),
      true
    );
  });

  it('before cutoff + skipped -> hide', () => {
    assert.equal(
      shouldShowHubTutorial({
        seen: true,
        now: new Date('2026-10-15T12:00:00Z'),
        registeredAt: '2026-09-01T00:00:00Z',
      }),
      false
    );
  });

  it('after cutoff + old registration -> hide', () => {
    assert.equal(
      shouldShowHubTutorial({
        seen: false,
        now: new Date('2026-11-10T12:00:00Z'),
        registeredAt: '2026-10-01T00:00:00Z',
      }),
      false
    );
  });

  it('after cutoff + new registration -> show', () => {
    assert.equal(
      shouldShowHubTutorial({
        seen: false,
        now: new Date('2026-11-10T12:00:00Z'),
        registeredAt: '2026-11-05T00:00:00Z',
      }),
      true
    );
  });

  it('registered exactly on the cutoff counts as new -> show', () => {
    assert.equal(
      shouldShowHubTutorial({
        seen: false,
        now: new Date('2026-11-10T12:00:00Z'),
        registeredAt: '2026-11-03T00:00:00Z',
      }),
      true
    );
  });

  it('exactly at the cutoff instant uses the post-cutoff rule', () => {
    // now == cutoff is NOT < cutoff, so an old registration stays hidden.
    assert.equal(
      shouldShowHubTutorial({
        seen: false,
        now: new Date('2026-11-03T00:00:00Z'),
        registeredAt: '2026-10-01T00:00:00Z',
      }),
      false
    );
  });

  it('after cutoff + unknown registration -> hide (never nag on unknown age)', () => {
    assert.equal(
      shouldShowHubTutorial({ seen: false, now: new Date('2026-12-01T00:00:00Z'), registeredAt: null }),
      false
    );
  });

  it('garbage dates never throw and never show', () => {
    assert.equal(shouldShowHubTutorial({ seen: false, now: 'not-a-date', registeredAt: null }), false);
    assert.equal(
      shouldShowHubTutorial({ seen: false, now: new Date('2026-12-01T00:00:00Z'), registeredAt: 'garbage' }),
      false
    );
  });

  it('string "now" works like a Date', () => {
    assert.equal(
      shouldShowHubTutorial({ seen: false, now: '2026-10-15T12:00:00Z', registeredAt: null }),
      true
    );
  });
});

describe('hub tutorial persistence', () => {
  let store;
  beforeEach(() => { store = installStorage(); });

  it('skip persists: mark -> isSeen true, and the pure check hides it', () => {
    assert.equal(isHubTutorialSeen(), false);
    markHubTutorialSeen();
    assert.equal(isHubTutorialSeen(), true);
    assert.equal(store.get(HUB_TUTORIAL_SEEN_KEY), '1');
    assert.equal(
      shouldShowHubTutorial({ seen: isHubTutorialSeen(), now: new Date('2026-10-15T00:00:00Z'), registeredAt: null }),
      false
    );
  });

  it('stashHubRegisteredAt stores created_at; resolve prefers it over first-seen', () => {
    stashHubRegisteredAt('2026-11-20T00:00:00Z');
    assert.equal(store.get(HUB_TUTORIAL_REGISTERED_KEY), '2026-11-20T00:00:00Z');
    assert.equal(resolveHubRegisteredAt(), '2026-11-20T00:00:00Z');
  });

  it('resolve falls back to first-seen and sets it once', () => {
    const first = resolveHubRegisteredAt();
    assert.ok(first, 'returns a timestamp');
    assert.equal(store.get(HUB_TUTORIAL_FIRST_SEEN_KEY), first);
    // Second call returns the same stored value, not a new "now".
    assert.equal(resolveHubRegisteredAt(), first);
  });

  it('works with no window at all (SSR safety)', () => {
    delete globalThis.window;
    assert.equal(isHubTutorialSeen(), false);
    markHubTutorialSeen(); // no throw
    assert.equal(shouldShowHubTutorial({ seen: false, now: new Date('2026-10-15T00:00:00Z'), registeredAt: null }), true);
    assert.ok(resolveHubRegisteredAt(), 'falls back to an in-memory timestamp');
  });
});
