// tests/fintrac-explanation.test.mjs
// FINTRAC explanation modal + menu entries (Merlin, 2026-10-26):
// every signed-in user sees the plain-English explanation on each
// hub load, with a Skip button that dismisses it for THAT LOAD
// ONLY (no persisted dismissal), and can re-open it anytime from
// the main menu surfaces (Concourse tile, hub Program menu,
// Portal Room page). Wording is verbatim from Merlin's approved
// draft: no promise of future cash payouts, no aether-as-money
// language anywhere.
//
// Run: node --test tests/fintrac-explanation.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FINTRAC_EVENT,
  FINTRAC_EXPLANATION_TITLE,
  FINTRAC_EXPLANATION_PARAGRAPHS,
  shouldAutoShowFintrac,
} from '../lib/fintrac-explanation.js';

function src(rel) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

describe('shouldAutoShowFintrac: hub load, signed-in, not skipped', () => {
  it('shows on a hub load for a signed-in user', () => {
    assert.equal(shouldAutoShowFintrac({ pathname: '/', signedIn: true, dismissed: false }), true);
  });
  it('does not auto-show on a program/game route (never a game overlay)', () => {
    assert.equal(shouldAutoShowFintrac({ pathname: '/hollow-earth', signedIn: true, dismissed: false }), false);
    assert.equal(shouldAutoShowFintrac({ pathname: '/portal-room', signedIn: true, dismissed: false }), false);
    assert.equal(shouldAutoShowFintrac({ pathname: '/store', signedIn: true, dismissed: false }), false);
  });
  it('does not auto-show signed-out', () => {
    assert.equal(shouldAutoShowFintrac({ pathname: '/', signedIn: false, dismissed: false }), false);
    assert.equal(shouldAutoShowFintrac({ pathname: '/', signedIn: null, dismissed: false }), false);
  });
  it('does not auto-show again after a Skip in the same load', () => {
    assert.equal(shouldAutoShowFintrac({ pathname: '/', signedIn: true, dismissed: true }), false);
  });
});

describe('explanation copy: verbatim, no payout promise, no aether-as-money', () => {
  it('title is exactly "FINTRAC explanation"', () => {
    assert.equal(FINTRAC_EXPLANATION_TITLE, 'FINTRAC explanation');
  });
  it('paragraphs match Merlin\'s approved draft word for word', () => {
    assert.deepEqual(FINTRAC_EXPLANATION_PARAGRAPHS, [
      "What's coming this Christmas: You'll be able to buy products and services on Olympus. You just pay by card — you don't need any special account to check out.",
      "If you create things here: What your programs earn builds up inside Olympus as credit you can spend here. Turning that credit into real money comes later, once the regulatory approvals are in place. We're working toward that and we'll be upfront with you about where it stands — no surprises, no fine print.",
    ]);
  });
  it('copy never names aether and never promises a payout', () => {
    const text = FINTRAC_EXPLANATION_PARAGRAPHS.join(' ').toLowerCase();
    assert.equal(text.includes('aether'), false);
    for (const banned of ['guarantee', 'promised', 'will pay', 'will be paid', 'payout']) {
      assert.equal(text.includes(banned), false, `copy must not contain "${banned}"`);
    }
  });
  it('open event name is stable for every menu surface', () => {
    assert.equal(FINTRAC_EVENT, 'olympus:fintrac-explanation-open');
  });
});

describe('wiring: modal, host, and menu entries', () => {
  it('Concourse carries a FINTRAC tile with the IMPORTANT flag', () => {
    const c = src('components/Concourse.jsx');
    assert.match(c, /id: 'fintrac', label: 'FINTRAC', title: 'FINTRAC explanation'/);
    assert.match(c, /important: true/);
    assert.match(c, /tile\.important/);
    assert.match(c, />IMPORTANT</);
    assert.match(c, /tile\.id === 'fintrac'\) \{ fireFintracExplanation\(\); setOpen\(false\); return; \}/);
    assert.match(c, /<FintracExplanationHost \/>/);
  });
  it('modal scrolls vertically and Skip dismisses for this load only', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /overflow-y-auto/);
    assert.match(f, />\s*Skip\s*</);
    assert.match(f, /FintracExplanationModal/);
    // Skip is React state only: no persisted dismissal anywhere
    // (the word may appear in comments explaining exactly that).
    for (const file of [f, src('lib/fintrac-explanation.js')]) {
      assert.equal(file.includes('localStorage.getItem'), false);
      assert.equal(file.includes('localStorage.setItem'), false);
    }
  });
  it('host auto-show is session-gated and hub-gated', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /supabase\.auth\.getSession\(\)/);
    assert.match(f, /shouldAutoShowFintrac\(\{ pathname, signedIn: !!session, dismissed \}\)/);
    assert.match(f, /window\.addEventListener\(FINTRAC_EVENT/);
  });
  it('hub Program menu carries the full-title entry', () => {
    const p = src('app/page.jsx');
    assert.match(p, /import \{ FintracExplanationMenuButton \} from '@\/components\/FintracExplanation';/);
    assert.match(p, /<FintracExplanationMenuButton \/>/);
  });
  it('Portal Room carries the entry as page chrome, not a roster row', () => {
    const p = src('app/portal-room/page.jsx');
    assert.match(p, /import \{ FintracExplanationMenuButton \} from '@\/components\/FintracExplanation';/);
    assert.ok(
      p.indexOf('<FintracExplanationMenuButton') < p.indexOf('<PortalRoomGate basePrograms'),
      'entry must sit above the registry-derived roster, never inside it'
    );
    assert.match(p, /buildPortalRoster\(/);
  });
  it('god submenus are untouched: no FINTRAC entry in SatelliteMenu or GodMenuPanel', () => {
    assert.equal(src('components/SatelliteMenu.jsx').includes('Fintrac'), false);
    assert.equal(src('components/GodMenuPanel.jsx').includes('Fintrac'), false);
  });
});
