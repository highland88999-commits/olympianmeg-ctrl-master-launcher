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
// Onboarding wizard (Merlin, 2026-10-29): five steps —
//   1. Landing setup (traffic light: red = camera perspective,
//      yellow = starting character, green = continue)
//   2. Device controls
//   3. Welcome to Olympus
//   4. FINTRAC explanation (menu entries jump straight here)
//   5. Take The Tour
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
  ONBOARDING_STEP1_TITLE,
  ONBOARDING_STEP2_CARDS,
  ONBOARDING_STEP2_NOTE,
  ONBOARDING_STEP2_TITLE,
  ONBOARDING_STEP3_PARAGRAPHS,
  ONBOARDING_STEP3_TITLE,
  ONBOARDING_STEP5_TITLE,
  LANDING_DEFAULT_PERSPECTIVE,
  LANDING_PERSPECTIVE_KEY,
  LANDING_CHARACTER_KEY,
  LANDING_CHARACTER_MIRROR_KEY,
  readLandingCharacterMirror,
  writeLandingCharacterMirror,
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
    assert.equal(shouldAutoShowFintrac({ pathname: '/earth-2', signedIn: true, dismissed: false }), false);
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
    assert.match(c, /tile\.id === 'fintrac'\) \{ fireFintracExplanation\(4\); setPortal3dOpen\(false\); return; \}/);
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
  it('the flat grid carries the entry at the head of its SHOPPING section, not as a roster row', () => {
    const p = src('components/ConcoursePortals.jsx');
    assert.match(p, /import \{ FintracExplanationMenuButton \} from '\.\/FintracExplanation';/);
    assert.ok(p.includes("wallSection === 'SHOPPING'"), 'entry sits in the SHOPPING section (payments & creator earnings)');
    assert.ok(
      p.indexOf('<FintracExplanationMenuButton') < p.indexOf('<PortalFlatGrid'),
      'entry must sit above the grid, never inside the roster'
    );
    assert.match(p, /buildPortalRoster\(/);
  });
  it('god submenus are untouched: no FINTRAC entry in SatelliteMenu or GodMenuPanel', () => {
    assert.equal(src('components/SatelliteMenu.jsx').includes('Fintrac'), false);
    assert.equal(src('components/GodMenuPanel.jsx').includes('Fintrac'), false);
  });
});

describe('onboarding wizard: five steps, traffic light first', () => {
  it('has exactly 5 steps with the right titles', () => {
    assert.equal(ONBOARDING_STEP_COUNT, 5);
    assert.equal(ONBOARDING_STEP1_TITLE, 'Landing setup');
    assert.equal(ONBOARDING_STEP2_TITLE, 'Device controls');
    assert.equal(ONBOARDING_STEP3_TITLE, 'Welcome to Olympus');
    assert.equal(ONBOARDING_STEP5_TITLE, 'Take The Tour');
    assert.equal(onboardingStepTitle(1), 'Landing setup');
    assert.equal(onboardingStepTitle(2), 'Device controls');
    assert.equal(onboardingStepTitle(3), 'Welcome to Olympus');
    assert.equal(onboardingStepTitle(4), 'FINTRAC explanation');
    assert.equal(onboardingStepTitle(5), 'Take The Tour');
  });
  it('step navigation: Next advances, Close ends the box', () => {
    assert.equal(onboardingNextStep(1), 2);
    assert.equal(onboardingNextStep(2), 3);
    assert.equal(onboardingNextStep(3), 4);
    assert.equal(onboardingNextStep(4), 5);
    assert.equal(onboardingNextStep(5), 5);
    assert.equal(onboardingNextButtonLabel(1), 'Next');
    assert.equal(onboardingNextButtonLabel(2), 'Next');
    assert.equal(onboardingNextButtonLabel(3), 'Next');
    assert.equal(onboardingNextButtonLabel(4), 'Next');
    assert.equal(onboardingNextButtonLabel(5), 'Close');
  });
  it('step clamping: out-of-range and unusable values land safely', () => {
    assert.equal(clampOnboardingStep(0), 1);
    assert.equal(clampOnboardingStep(1), 1);
    assert.equal(clampOnboardingStep(2), 2);
    assert.equal(clampOnboardingStep(3), 3);
    assert.equal(clampOnboardingStep(4), 4);
    assert.equal(clampOnboardingStep(5), 5);
    assert.equal(clampOnboardingStep(6), 5);
    assert.equal(clampOnboardingStep(NaN), 4);
    assert.equal(clampOnboardingStep(undefined), 4);
  });
  it('step indicator reads "N of 5"', () => {
    assert.equal(onboardingStepLabel(1), '1 of 5');
    assert.equal(onboardingStepLabel(2), '2 of 5');
    assert.equal(onboardingStepLabel(3), '3 of 5');
    assert.equal(onboardingStepLabel(4), '4 of 5');
    assert.equal(onboardingStepLabel(5), '5 of 5');
  });
  it('step 1: traffic light — red camera, yellow character, green continue', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /LandingSetupFrame/);
    assert.match(f, /aria-label="Landing setup"/);
    // Red: camera perspective toggle (1st/3rd)
    assert.match(f, /Camera perspective/);
    assert.match(f, /LANDING_PERSPECTIVE_LABELS\[perspective\]/);
    // Yellow: character picker
    assert.match(f, /Pick your character/);
    assert.match(f, /CHARACTERS/);
    // Green: continue
    assert.match(f, /aria-label="Continue to device controls"/);
    // Landing picks persist per account, not in localStorage
    assert.equal(LANDING_PERSPECTIVE_KEY, 'landing_perspective');
    assert.equal(LANDING_CHARACTER_KEY, 'landing_character');
    assert.equal(LANDING_DEFAULT_PERSPECTIVE, '3rd');
  });
  it('step 1: character picker shows a preview above the roster grid', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /aria-label="Pick your character"/);
    assert.match(f, /grid-cols-3/);
    assert.match(f, /preview/);
    // Solid overlay: no ghost text bleeding through from the frame behind
    assert.match(f, /rounded-3xl bg-zinc-950"/);
    assert.equal(f.includes('bg-zinc-950/95'), false);
  });
  it('step 1: the yellow light shows the character (short-name word + name caption) in both perspectives', () => {
    // Part 12 (Merlin, Nov 27, 2026): the orb no longer carries the
    // character portrait — it shows the character's short name as a
    // silver word, and the caption below still carries the full name.
    const f = src('components/FintracExplanation.jsx');
    assert.equal(f.includes('src={character.preview}'), false, 'orb portrait is gone');
    assert.match(f, /characterShort/);
    assert.match(f, /character \? character\.name : 'Character'/);
  });
  it('all five frames render the same size card', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /h-\[min\(82dvh,680px\)\]/);
  });
  it('ui-state accepts the landing keys with validation', () => {
    const r = src('app/api/ui-state/route.js');
    assert.match(r, /'landing_perspective' in prefs/);
    assert.match(r, /"landing_perspective must be '1st' or '3rd'."/);
    assert.match(r, /'landing_character' in prefs/);
    assert.match(r, /landing_character must be a non-empty string/);
  });
  it('step 2: left side motion (joystick), right side camera, one at a time', () => {
    assert.equal(ONBOARDING_STEP2_CARDS.length, 2);
    const [left, right] = ONBOARDING_STEP2_CARDS;
    assert.equal(left.side, 'Left side');
    assert.equal(left.title, 'Motion');
    assert.match(left.text, /joystick/);
    assert.equal(right.side, 'Right side');
    assert.equal(right.title, 'Camera');
    assert.match(ONBOARDING_STEP2_NOTE, /one at a time/);
  });
  it('step 3: plain-English outline of everything Olympus offers', () => {
    const text = ONBOARDING_STEP3_PARAGRAPHS.join(' ');
    assert.match(text, /170/);
    assert.match(text, /games/);
    assert.match(text, /marketplace/);
    assert.match(text, /Fortress/);
    assert.match(text, /walk/);
  });
  it('step 3 money line: in-world credit only, no payout promise, no aether-as-money', () => {
    const text = ONBOARDING_STEP3_PARAGRAPHS.join(' ').toLowerCase();
    assert.match(text, /credit you can spend inside olympus/);
    assert.match(text, /regulatory approvals/);
    assert.equal(text.includes('aether'), false);
    for (const banned of ['guarantee', 'promised', 'will pay', 'will be paid', 'payout', 'money owed']) {
      assert.equal(text.includes(banned), false, `step 3 must not contain "${banned}"`);
    }
  });
  it('modal: IMPORTANT badge and footer note belong to step 4 only', () => {
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
    assert.match(f, /onClick=\{\(\) => fireFintracExplanation\(4\)\}/);
  });
  it('step 5: Take The Tour frame with a circular text-only tour button (Part 12)', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /ONBOARDING_STEP5_PARAGRAPHS/);
    // Part 12: the tour artwork is out of the button — it carries the
    // word TOUR in silver, nothing else.
    assert.equal(f.includes('/concourse-icons/tour.webp'), false, 'tour artwork is gone from the button');
    assert.match(f, />TOUR</);
    assert.match(f, /aria-label="Take the tour"/);
    assert.match(f, /onTakeTour/);
    assert.match(f, /Take The Tour/);
  });
  it('step 5 tour button opens the Travelator and closes the box', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /const takeTour = \(\) => \{/);
    assert.match(f, /onTakeTour=\{onTakeTour\}/);
    const c = src('components/Concourse.jsx');
    assert.match(c, /<FintracExplanationHost/);
    assert.match(c, /onTakeTour=\{\(\) => setTravelatorOpen\(true\)\}/);
  });
  it('all five frames wear the Concourse backdrop image', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /CONCOURSE_BG_ART/);
    assert.match(f, /bgUrl/);
    const c = src('components/Concourse.jsx');
    assert.match(c, /bgUrl=\{bgPref\?\.kind === 'image' && bgPref\.url \? bgPref\.url : CONCOURSE_BG_ART\}/);
  });
  it('menu entries jump straight to step 4, never the tutorial', () => {
    const lib = src('lib/fintrac-explanation.js');
    assert.match(lib, /export function fireFintracExplanation\(step = 4\)/);
    assert.match(src('components/Concourse.jsx'), /fireFintracExplanation\(4\)/);
  });
});

describe('landing character mirror (Merlin, 2026-11-19: orb flashed "?" on every reload)', () => {
  const fakeStorage = (seed = {}) => {
    const store = { ...seed };
    return {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      _store: store,
    };
  };

  it('mirror key is namespaced and distinct from the ui-state key', () => {
    assert.equal(LANDING_CHARACTER_MIRROR_KEY, 'olympus.landing.character');
    assert.notEqual(LANDING_CHARACTER_MIRROR_KEY, LANDING_CHARACTER_KEY);
  });

  it('read returns null with no storage, empty, or missing value', () => {
    assert.equal(readLandingCharacterMirror(fakeStorage()), null);
    assert.equal(readLandingCharacterMirror(fakeStorage({ [LANDING_CHARACTER_MIRROR_KEY]: '' })), null);
    assert.equal(readLandingCharacterMirror(null), null);
  });

  it('write then read round-trips the character id', () => {
    const s = fakeStorage();
    writeLandingCharacterMirror('q044-eddie-munson', s);
    assert.equal(readLandingCharacterMirror(s), 'q044-eddie-munson');
    assert.equal(s._store[LANDING_CHARACTER_MIRROR_KEY], 'q044-eddie-munson');
  });

  it('write ignores empty ids and a throwing storage', () => {
    const s = fakeStorage();
    writeLandingCharacterMirror('', s);
    assert.equal(readLandingCharacterMirror(s), null);
    const throwing = { getItem: () => { throw new Error('nope'); }, setItem: () => { throw new Error('nope'); } };
    assert.equal(readLandingCharacterMirror(throwing), null);
    assert.doesNotThrow(() => writeLandingCharacterMirror('q001-freddy-krueger', throwing));
  });

  it('component initializes the orb from the mirror and writes on pick + server restore', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /readLandingCharacterMirror/);
    assert.match(f, /writeLandingCharacterMirror/);
    assert.match(f, /useState\(mirroredCharacterId\)/);
    assert.match(f, /const \[characterId, setCharacterId\] = useState\(mirroredCharacterId\)/);
    assert.match(f, /const \[previewId, setPreviewId\] = useState\(mirroredCharacterId\)/);
    // pick writes the mirror; the async server restore re-syncs it too.
    assert.match(f, /writeLandingCharacterMirror\(id\)/);
    assert.match(f, /writeLandingCharacterMirror\(prefs\[LANDING_CHARACTER_KEY\]\)/);
  });
});
