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
  ONBOARDING_STEP_COUNT,
  ONBOARDING_STEP1_CARDS,
  ONBOARDING_STEP1_NOTE,
  ONBOARDING_STEP1_TITLE,
  ONBOARDING_STEP2_PARAGRAPHS,
  ONBOARDING_STEP2_TITLE,
  ONBOARDING_STEP4_TITLE,
  clampOnboardingStep,
  onboardingNextButtonLabel,
  onboardingNextStep,
  onboardingStepLabel,
  onboardingStepTitle,
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
    assert.match(c, /tile\.id === 'fintrac'\) \{ fireFintracExplanation\(3\); setOpen\(false\); return; \}/);
    assert.match(c, /<FintracExplanationHost/);
  });
  it('modal scrolls vertically and Skip/Close dismiss for this load only', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /overflow-y-auto/);
    assert.match(f, /onboardingNextButtonLabel\(currentStep\)/);
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
  it('hub Program menu no longer carries the footer entry (2026-10-28: removed from this placement)', () => {
    const p = src('app/page.jsx');
    assert.equal(p.includes('FintracExplanationMenuButton'), false);
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

describe('onboarding wizard: Skip, Skip, Skip, Close — one step at a time', () => {
  it('has exactly 4 steps with the right titles', () => {
    assert.equal(ONBOARDING_STEP_COUNT, 4);
    assert.equal(ONBOARDING_STEP1_TITLE, 'Device controls');
    assert.equal(ONBOARDING_STEP2_TITLE, 'Welcome to Olympus');
    assert.equal(ONBOARDING_STEP4_TITLE, 'Take The Tour');
    assert.equal(onboardingStepTitle(1), 'Device controls');
    assert.equal(onboardingStepTitle(2), 'Welcome to Olympus');
    assert.equal(onboardingStepTitle(3), 'FINTRAC explanation');
    assert.equal(onboardingStepTitle(4), 'Take The Tour');
  });
  it('step navigation: Skip advances, Close ends the box', () => {
    assert.equal(onboardingNextStep(1), 2);
    assert.equal(onboardingNextStep(2), 3);
    assert.equal(onboardingNextStep(3), 4);
    assert.equal(onboardingNextStep(4), 4);
    assert.equal(onboardingNextButtonLabel(1), 'Skip');
    assert.equal(onboardingNextButtonLabel(2), 'Skip');
    assert.equal(onboardingNextButtonLabel(3), 'Skip');
    assert.equal(onboardingNextButtonLabel(4), 'Close');
  });
  it('step clamping: out-of-range and unusable values land safely', () => {
    assert.equal(clampOnboardingStep(0), 1);
    assert.equal(clampOnboardingStep(1), 1);
    assert.equal(clampOnboardingStep(2), 2);
    assert.equal(clampOnboardingStep(3), 3);
    assert.equal(clampOnboardingStep(4), 4);
    assert.equal(clampOnboardingStep(5), 4);
    assert.equal(clampOnboardingStep(NaN), 3);
    assert.equal(clampOnboardingStep(undefined), 3);
  });
  it('step indicator reads "N of 4"', () => {
    assert.equal(onboardingStepLabel(1), '1 of 4');
    assert.equal(onboardingStepLabel(2), '2 of 4');
    assert.equal(onboardingStepLabel(3), '3 of 4');
    assert.equal(onboardingStepLabel(4), '4 of 4');
  });
  it('step 1: left side motion (joystick), right side camera, one at a time', () => {
    assert.equal(ONBOARDING_STEP1_CARDS.length, 2);
    const [left, right] = ONBOARDING_STEP1_CARDS;
    assert.equal(left.side, 'Left side');
    assert.equal(left.title, 'Motion');
    assert.match(left.text, /joystick/);
    assert.equal(right.side, 'Right side');
    assert.equal(right.title, 'Camera');
    assert.match(ONBOARDING_STEP1_NOTE, /one at a time/);
  });
  it('step 2: plain-English outline of everything Olympus offers', () => {
    const text = ONBOARDING_STEP2_PARAGRAPHS.join(' ');
    assert.match(text, /170/);
    assert.match(text, /games/);
    assert.match(text, /marketplace/);
    assert.match(text, /Fortress/);
    assert.match(text, /walk/);
  });
  it('step 2 money line: in-world credit only, no payout promise, no aether-as-money', () => {
    const text = ONBOARDING_STEP2_PARAGRAPHS.join(' ').toLowerCase();
    assert.match(text, /credit you can spend inside olympus/);
    assert.match(text, /regulatory approvals/);
    assert.equal(text.includes('aether'), false);
    for (const banned of ['guarantee', 'promised', 'will pay', 'will be paid', 'payout', 'money owed']) {
      assert.equal(text.includes(banned), false, `step 2 must not contain "${banned}"`);
    }
  });
  it('modal: IMPORTANT badge and footer note belong to step 3 only', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /isFintracStep && \(\s*<span className="rounded-full bg-red-500/);
    assert.match(f, /isFintracStep && \(\s*<p className="mt-2 text-center text-\[10px\] text-zinc-500">/);
    assert.match(f, /onboardingStepLabel\(currentStep\)/);
    assert.match(f, /onClick=\{isLastStep \? onClose : onNext\}/);
  });
  it('host: auto-show starts at step 1, menu events carry their step', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /setStep\(1\);/);
    assert.match(f, /event\?\.detail\?\.step/);
    assert.match(f, /onClick=\{\(\) => fireFintracExplanation\(3\)\}/);
  });
  it('step 4: Take The Tour frame with a circular Concourse-matching tour button', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /ONBOARDING_STEP4_PARAGRAPHS/);
    assert.match(f, /\/concourse-icons\/tour\.webp/);
    assert.match(f, /aria-label="Take the tour"/);
    assert.match(f, /onTakeTour/);
    assert.match(f, /Take The Tour/);
  });
  it('step 4 tour button opens the Travelator and closes the box', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /const takeTour = \(\) => \{/);
    assert.match(f, /onTakeTour=\{onTakeTour\}/);
    const c = src('components/Concourse.jsx');
    assert.match(c, /<FintracExplanationHost/);
    assert.match(c, /onTakeTour=\{\(\) => setTravelatorOpen\(true\)\}/);
  });
  it('all four frames wear the Concourse backdrop image', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /CONCOURSE_BG_ART/);
    assert.match(f, /bgUrl/);
    const c = src('components/Concourse.jsx');
    assert.match(c, /bgUrl=\{bgPref\?\.kind === 'image' && bgPref\.url \? bgPref\.url : CONCOURSE_BG_ART\}/);
  });
  it('menu entries jump straight to step 3, never the tutorial', () => {
    const lib = src('lib/fintrac-explanation.js');
    assert.match(lib, /export function fireFintracExplanation\(step = 3\)/);
    assert.match(src('components/Concourse.jsx'), /fireFintracExplanation\(3\)/);
  });
});
