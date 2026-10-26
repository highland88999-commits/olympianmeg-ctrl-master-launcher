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
export function fireFintracExplanation() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(FINTRAC_EVENT));
  }
}

// Auto-show rule, pinned by tests/fintrac-explanation.test.mjs:
// the hub route ('/') only — never over a program/game page —
// signed-in users only, and never after a Skip in this same load.
// `dismissed` is React state, never persisted storage.
export function shouldAutoShowFintrac({ pathname, signedIn, dismissed }) {
  return pathname === '/' && !!signedIn && !dismissed;
}
