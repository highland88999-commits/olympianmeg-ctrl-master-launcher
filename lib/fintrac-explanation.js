// lib/fintrac-explanation.js
// The FINTRAC explanation (Merlin, 2026-10-26): the plain-English
// note about Christmas products/services and how creator earnings
// work, shown to every signed-in user on each hub load with a Skip
// button, and re-openable anytime from the main menu surfaces.
//
// WORDING LAW: the paragraphs below are Merlin's approved draft,
// verbatim. Do NOT add any promise of future cash payouts, and do
// NOT describe aether as money or future money anywhere in this
// copy — the draft deliberately says "credit you can spend here"
// and "comes later, once the regulatory approvals are in place,"
// with no payout promise and no currency name.
//
// SKIP SEMANTICS: Skip dismisses the modal for THIS LOAD ONLY.
// There is deliberately no localStorage / persisted dismissal —
// the next app load shows it again. (Merlin: "on each load with a
// skip button.") The auto-show predicate below is pure so the
// suites can pin it; the component holds the dismissed flag in
// React state only.

export const FINTRAC_EVENT = 'olympus:fintrac-explanation-open';

export const FINTRAC_EXPLANATION_TITLE = 'FINTRAC explanation';

export const FINTRAC_EXPLANATION_PARAGRAPHS = [
  "What's coming this Christmas: You'll be able to buy products and services on Olympus. You just pay by card — you don't need any special account to check out.",
  "If you create things here: What your programs earn builds up inside Olympus as credit you can spend here. Turning that credit into real money comes later, once the regulatory approvals are in place. We're working toward that and we'll be upfront with you about where it stands — no surprises, no fine print.",
];

// Fire-and-forget opener any menu surface can call: the host in
// components/FintracExplanation.jsx listens for this event.
// The optional step (default 4) is the step the box opens on:
// menu entries pass 4, jumping straight to the FINTRAC text,
// while the auto-show path opens at step 1 (see the host).
export function fireFintracExplanation(step = 4) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(FINTRAC_EVENT, { detail: { step: clampOnboardingStep(step) } }));
  }
}

// Auto-show rule, pinned by tests/fintrac-explanation.test.mjs:
// the hub route ('/') only — never over a program/game page —
// signed-in users only, and never after a Skip in this same load.
// `dismissed` is React state, never persisted storage.
export function shouldAutoShowFintrac({ pathname, signedIn, dismissed }) {
  return pathname === '/' && !!signedIn && !dismissed;
}

// ── ONBOARDING WIZARD (Merlin, 2026-10-26; step 4 added 2026-10-29;
//    step 1 landing setup added 2026-10-29) ───
// The same box now runs five steps, one at a time, on hub load:
//   1. Landing setup — the traffic light: red picks the camera
//      perspective for the initial landing (1st or 3rd person),
//      yellow picks the starting character, green continues.
//      Button: the green light → step 2.
//   2. Device controls — left side motion (joystick), right side
//      camera. Button: Next → step 3.
//   3. Welcome to Olympus — a plain-English outline of what the
//      program offers. Button: Next → step 4.
//   4. The FINTRAC explanation (above, verbatim). Button: Next → step 5.
//   5. Take The Tour — a circular tour button (matching the Concourse
//      tour tile) that opens the Travelator. Button: Close.
// Menu entries jump straight to step 4 (a user tapping a
// "FINTRAC" entry wants the FINTRAC text, not the tutorial).
// The IMPORTANT badge and the "FINTRAC explanation" title belong
// to step 4 only. Close / × / backdrop dismiss the whole box for
// this load only — same as Skip always did (no saved dismissal).
// The landing picks (perspective + character) ARE saved per
// account via /api/ui-state — they are preferences, not dismissal.

export const ONBOARDING_STEP_COUNT = 5;

// The traffic-light frame (step 1): how the user arrives.
// Red = camera perspective for the landing sequence;
// yellow = starting character; green = continue.
export const ONBOARDING_STEP1_TITLE = 'Landing setup';
export const ONBOARDING_STEP1_PARAGRAPHS = [
  'How do you want to land? Set your camera and pick the character you arrive as — you can change both anytime.',
];
export const LANDING_PERSPECTIVES = ['1st', '3rd'];
export const LANDING_PERSPECTIVE_LABELS = { '1st': '1st person', '3rd': '3rd person' };
export const LANDING_DEFAULT_PERSPECTIVE = '3rd';
// ui-state keys for the landing picks (see app/api/ui-state/route.js).
export const LANDING_PERSPECTIVE_KEY = 'landing_perspective';
export const LANDING_CHARACTER_KEY = 'landing_character';

export const ONBOARDING_STEP2_TITLE = 'Device controls';

export const ONBOARDING_STEP2_CARDS = [
  { side: 'Left side', icon: '🕹️', title: 'Motion', text: 'The joystick moves you around.' },
  { side: 'Right side', icon: '🎥', title: 'Camera', text: 'Drag to look around.' },
];

export const ONBOARDING_STEP2_NOTE =
  'Take them one at a time: move first, then look — that is all you need to get going.';

export const ONBOARDING_STEP3_TITLE = 'Welcome to Olympus';

export const ONBOARDING_STEP3_PARAGRAPHS = [
  'Olympus is one place for over 170 programs and worlds you can walk around in — from a whole walkable Earth to the monster world of Hollow Earth — plus games, puzzles, and places to hang out with friends.',
  'You can also make things here: build your own programs and designs, and sell what you create in the marketplace. And Fortress gives you your own storage for your stuff.',
  'What your creations earn builds up as credit you can spend inside Olympus. Turning that credit into real money comes later, once the regulatory approvals are in place.',
];

export const ONBOARDING_STEP5_TITLE = 'Take The Tour';
export const ONBOARDING_STEP5_PARAGRAPHS = [
  'The fastest way to see it all: the Travelator rides you through every program on Olympus, gate by gate, a few seconds each. Sit back and watch, or hop off into anything that catches your eye.',
];

// Clamp any step value into 1..5; anything unusable lands on
// step 4 (the FINTRAC text), matching the menu-entry default.
export function clampOnboardingStep(step) {
  const n = Number(step);
  if (!Number.isFinite(n)) return 4;
  return Math.min(ONBOARDING_STEP_COUNT, Math.max(1, Math.floor(n)));
}

// The forward button's step: Skip advances, Close ends the box.
export function onboardingNextStep(step) {
  return Math.min(ONBOARDING_STEP_COUNT, clampOnboardingStep(step) + 1);
}

// The forward button's label: Next on steps 1–4, Close on step 5.
// (Step 1's traffic light carries its own green continue light;
// the bar button below still reads Skip for consistency.)
export function onboardingNextButtonLabel(step) {
  return clampOnboardingStep(step) < ONBOARDING_STEP_COUNT ? 'Next' : 'Close';
}

// The subtle step indicator: "1 of 5" … "5 of 5".
export function onboardingStepLabel(step) {
  return `${clampOnboardingStep(step)} of ${ONBOARDING_STEP_COUNT}`;
}

// The header title for a step (step 4 reuses the FINTRAC title).
export function onboardingStepTitle(step) {
  const s = clampOnboardingStep(step);
  if (s === 1) return ONBOARDING_STEP1_TITLE;
  if (s === 2) return ONBOARDING_STEP2_TITLE;
  if (s === 3) return ONBOARDING_STEP3_TITLE;
  if (s === 5) return ONBOARDING_STEP5_TITLE;
  return FINTRAC_EXPLANATION_TITLE;
}
