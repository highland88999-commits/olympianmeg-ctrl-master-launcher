// tests/realm-info-fade.test.mjs — REALM INFO OVERLAY FADE (Merlin, Nov 13, 2026).
//
// "In all heaven/hell realms... make the realm information that
// overlays the screen fade when a user clicks the screen."
//
// The overlay is per-realm code: every one of the 24 realm pages
// renders its own HUD block (title, tagline, "You are in: ...",
// hint pill). The fade itself is ONE shared hook —
// components/useRealmInfoFade.js — and every page wires it the same
// way. This suite pins both halves: the hook fades smoothly (opacity
// only, never a hard cut), and all 24 pages are wired identically.
//
// A click fades AND lets through: the HUD is pointer-events-none, so
// the click that fades it still reaches the scene (drag to look, the
// touch stick, arches, buttons). A small "Info" button brings the
// overlay back; the information is never lost for good.
// Run: node tests/realm-info-fade.test.mjs (from the repo root).
// No browser, no network — pure wired-source audits (same grep style
// as the realm-gates suite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PORTAL_REALMS } from '../lib/portal/realms.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const HOOK_PATH = '../components/useRealmInfoFade.js';

// --- 1. The hook exists and fades smoothly (opacity only) ---

test('the shared fade hook exists and fades with opacity, never a hard cut', () => {
  assert.ok(existsSync(new URL(HOOK_PATH, import.meta.url)), 'hook file exists');
  const hook = src(HOOK_PATH);
  assert.ok(hook.includes('export function useRealmInfoFade'), 'hook is exported');
  assert.ok(hook.includes('export const REALM_INFO_FADE_MS'), 'one fade length is exported');
  assert.ok(hook.includes('REALM_INFO_FADE_MS = 600'), 'the fade is 600 ms');
  // Smooth opacity fade: the style sets opacity + an opacity transition.
  assert.ok(hook.includes('opacity: infoHidden ? 0 : 1'), 'hidden means opacity 0, shown means 1');
  assert.ok(hook.includes('`opacity ${REALM_INFO_FADE_MS}ms ease-out`'), 'the transition is an opacity fade');
  // Never a hard cut: no display/visibility removal, no unmounting.
  assert.ok(!hook.includes('display'), 'no display toggling — the overlay stays mounted');
  assert.ok(!hook.includes('visibility'), 'no visibility toggling — opacity alone does the fade');
  // Reduced motion: no transition at all (still opacity, still no cut).
  assert.ok(hook.includes("transition: reduced ? 'none'"), 'reduced motion gets no transition');
  // Fade and restore both exist and are idempotent-safe.
  assert.ok(hook.includes('setInfoHidden((was) => (was ? was : true))'), 'fading when already hidden is a no-op');
  assert.ok(hook.includes('setInfoHidden(false)'), 'restore brings the overlay back');
  assert.ok(hook.includes("import { useCallback, useState } from 'react'"), 'hook imports are present');
});

// --- 2. The pass covers exactly the 24 portal realms ---

test('the pass covers exactly the 24 portal realms, each with its own page', () => {
  assert.equal(PORTAL_REALMS.length, 24, 'the portal system counts 24 realms');
  for (const realm of PORTAL_REALMS) {
    const file = `../app${realm.route}/page.jsx`;
    assert.ok(existsSync(new URL(file, import.meta.url)), `no page for ${realm.label} (${realm.route})`);
  }
});

// --- 3. Every realm page wires the fade identically ---

test('every realm page wires the shared fade: import, state, main handler, HUD style, restore button', () => {
  for (const realm of PORTAL_REALMS) {
    const page = src(`../app${realm.route}/page.jsx`);
    assert.ok(
      page.includes("import { useRealmInfoFade } from '@/components/useRealmInfoFade';"),
      `${realm.label}: imports the shared hook`
    );
    assert.ok(
      page.includes('const { infoHidden, fadeInfo, restoreInfo, infoStyle } = useRealmInfoFade({ reduced });'),
      `${realm.label}: destructures the fade state`
    );
    assert.ok(
      page.includes("onPointerDown={fadeInfo}>"),
      `${realm.label}: a click/tap anywhere on the screen fades the overlay`
    );
    assert.ok(
      page.includes('style={infoStyle} aria-hidden={infoHidden}'),
      `${realm.label}: the HUD fades by opacity and is hidden from assistive tech when faded`
    );
    assert.ok(
      page.includes('aria-label="Show realm information"'),
      `${realm.label}: the restore button is labelled`
    );
    assert.ok(
      page.includes('onPointerDown={(e) => e.stopPropagation()}'),
      `${realm.label}: the restore button does not re-trigger the fade on the same press`
    );
    assert.ok(
      page.includes('onClick={restoreInfo}'),
      `${realm.label}: the restore button brings the overlay back`
    );
  }
});

// --- 4. The overlay content is unchanged — only the fade was added ---

test('no realm lost its information: title, region line and hint pill are all still there', () => {
  for (const realm of PORTAL_REALMS) {
    const page = src(`../app${realm.route}/page.jsx`);
    assert.ok(page.includes('<h1'), `${realm.label}: title still present`);
    assert.ok(page.includes('You are in: {region}'), `${realm.label}: region line still present`);
    assert.ok(
      page.includes('rounded-full bg-black/55 px-4 py-2 text-xs text-stone-200'),
      `${realm.label}: hint pill still present`
    );
    // The HUD keeps its place: same classes, same top position.
    assert.ok(
      page.includes('pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center px-4 pt-16 text-center'),
      `${realm.label}: HUD position and styling unchanged`
    );
  }
});

// --- 5. The click still reaches the scene underneath ---

test('the fading click is not swallowed: drag-to-look, stick and look zones are untouched', () => {
  for (const realm of PORTAL_REALMS) {
    const page = src(`../app${realm.route}/page.jsx`);
    // Desktop drag-to-look keeps its own handler on the canvas container.
    assert.ok(
      page.includes('onPointerDown={onPointerDown}'),
      `${realm.label}: the canvas keeps its own drag-to-look handler`
    );
    // Touch controls keep their handlers.
    assert.ok(page.includes('onTouchStart={onStickStart}'), `${realm.label}: the walk stick is untouched`);
    assert.ok(page.includes('onTouchStart={onLookStart}'), `${realm.label}: the look zone is untouched`);
    // The HUD never intercepts a pointer: still pointer-events-none.
    const hudLine = page
      .split('\n')
      .find((line) => line.includes('pointer-events-none absolute inset-x-0 top-0 z-20'));
    assert.ok(hudLine, `${realm.label}: HUD line found`);
    assert.ok(!hudLine.includes('pointer-events-auto'), `${realm.label}: the HUD never grabs the click`);
  }
});

// --- 6. The restore button sits where it cannot overlap anything ---

test('the restore button sits below the Leave/Sound row, centred where the title was', () => {
  for (const realm of PORTAL_REALMS) {
    const page = src(`../app${realm.route}/page.jsx`);
    // top-16: below the top-4 Leave/Sound row, in the empty space the
    // faded title leaves behind. It only renders while the HUD is hidden.
    assert.ok(
      page.includes('absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full border border-white/30 bg-black/60'),
      `${realm.label}: restore button placement is top-16 centred`
    );
    assert.ok(page.includes('{infoHidden && ('), `${realm.label}: restore button only renders while faded`);
  }
});
