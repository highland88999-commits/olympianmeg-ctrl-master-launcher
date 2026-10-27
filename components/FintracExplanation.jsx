'use client';

// components/FintracExplanation.jsx
// The onboarding wizard + FINTRAC explanation modal (Merlin, 2026-10-26).
//
// Three pieces, one copy source (lib/fintrac-explanation.js):
//   FintracExplanationModal      — the dialog itself, one step at
//     a time: 1 Device controls, 2 Welcome to Olympus, 3 the
//     FINTRAC explanation (verbatim). Buttons: Skip, Skip, Close.
//   FintracExplanationHost       — mounted once inside the
//     Concourse (layout level, so it lives for the whole app
//     session): auto-shows the full sequence from step 1 on each
//     hub load for signed-in users, and re-opens at step 3
//     whenever any menu entry fires the event.
//   FintracExplanationMenuButton — the full-width menu entry used
//     by the hub Program menu and the Portal Room page; it jumps
//     straight to step 3 (the FINTRAC text).
//
// CLOSE / SKIP = THIS LOAD ONLY: dismissing sets React state,
// never localStorage, so the next app load shows the sequence
// again from step 1. A full reload restarts at step 1;
// mid-session hub returns do NOT re-show after a Close.
// AUTO-SHOW GATE: hub route ('/') + signed-in session only —
// the modal never pops over a program or game page on its own.
// (Merlin's old no-popups preference is superseded here by his
// explicit 2026-10-26 order for this one explanation modal.)

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  FINTRAC_EVENT,
  FINTRAC_EXPLANATION_TITLE,
  FINTRAC_EXPLANATION_PARAGRAPHS,
  ONBOARDING_STEP1_CARDS,
  ONBOARDING_STEP1_NOTE,
  ONBOARDING_STEP2_PARAGRAPHS,
  clampOnboardingStep,
  fireFintracExplanation,
  onboardingNextButtonLabel,
  onboardingNextStep,
  onboardingStepLabel,
  onboardingStepTitle,
  shouldAutoShowFintrac,
} from '@/lib/fintrac-explanation';

export function FintracExplanationModal({ open, step = 3, onNext, onClose }) {
  if (!open) return null;
  const currentStep = clampOnboardingStep(step);
  const isFintracStep = currentStep === 3;
  const title = onboardingStepTitle(currentStep);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="ui-element fixed inset-0 z-[50000]"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-zinc-950/80"
        onClick={onClose}
      />
      <div
        className="relative flex h-full items-center justify-center p-4"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-amber-400/40 bg-zinc-950 shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800 px-5 pb-3 pt-5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="text-base font-black uppercase tracking-widest text-amber-200">
                {title}
              </h2>
              {isFintracStep && (
                <span className="rounded-full bg-red-500 px-2 py-px text-[9px] font-black tracking-wider text-white">
                  IMPORTANT
                </span>
              )}
              <span className="text-[10px] font-bold tracking-widest text-zinc-500">
                {onboardingStepLabel(currentStep)}
              </span>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="ui-element pointer-events-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 text-zinc-300 hover:border-amber-300/60 hover:text-white"
            >
              <span aria-hidden="true" className="text-xs leading-none">×</span>
            </button>
          </div>
          {/* Vertical scroll: small phones must be able to read the
              whole step — the text block scrolls, the header and
              button stay put. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {currentStep === 1 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {ONBOARDING_STEP1_CARDS.map((card) => (
                    <div key={card.side} className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-3 py-4 text-center">
                      <div aria-hidden="true" className="text-2xl leading-none">{card.icon}</div>
                      <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                        {card.side}
                      </div>
                      <div className="mt-1 text-sm font-black text-zinc-100">
                        {card.title}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                        {card.text}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-zinc-200">
                  {ONBOARDING_STEP1_NOTE}
                </p>
              </>
            )}
            {currentStep === 2 && (
              ONBOARDING_STEP2_PARAGRAPHS.map((p, i) => (
                <p key={i} className={i === 0 ? 'text-sm leading-relaxed text-zinc-200' : 'mt-3 text-sm leading-relaxed text-zinc-200'}>
                  {p}
                </p>
              ))
            )}
            {currentStep === 3 && (
              FINTRAC_EXPLANATION_PARAGRAPHS.map((p, i) => (
                <p key={i} className={i === 0 ? 'text-sm leading-relaxed text-zinc-200' : 'mt-3 text-sm leading-relaxed text-zinc-200'}>
                  {p}
                </p>
              ))
            )}
          </div>
          <div className="shrink-0 border-t border-zinc-800 px-5 py-4">
            <button
              type="button"
              onClick={isFintracStep ? onClose : onNext}
              className="ui-element pointer-events-auto w-full rounded-xl bg-amber-400 py-3 text-sm font-black uppercase tracking-widest text-zinc-950 hover:bg-amber-300"
            >
              {onboardingNextButtonLabel(currentStep)}
            </button>
            {isFintracStep && (
              <p className="mt-2 text-center text-[10px] text-zinc-500">
                Skipping hides this until your next visit.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FintracExplanationHost() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [dismissed, setDismissed] = useState(false);
  const autoShownRef = useRef(false);

  useEffect(() => {
    const onOpen = (event) => {
      // Menu entries carry step 3 in the event detail; an event
      // with no detail still lands on the FINTRAC text.
      setStep(clampOnboardingStep(event?.detail?.step));
      setOpen(true);
    };
    window.addEventListener(FINTRAC_EVENT, onOpen);
    return () => window.removeEventListener(FINTRAC_EVENT, onOpen);
  }, []);

  // Mount-only auto-show: one check per app load (the Concourse
  // lives in the root layout, so this component does not remount
  // on route changes). Hub route + signed-in session + not
  // skipped this load — see shouldAutoShowFintrac. Auto-show
  // always runs the full sequence from step 1.
  useEffect(() => {
    if (autoShownRef.current) return;
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!alive) return;
        if (shouldAutoShowFintrac({ pathname, signedIn: !!session, dismissed })) {
          autoShownRef.current = true;
          setStep(1);
          setOpen(true);
        }
      } catch {
        /* never break the shell */
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    setOpen(false);
    setDismissed(true);
  };

  const next = () => {
    setStep((s) => onboardingNextStep(s));
  };

  return <FintracExplanationModal open={open} step={step} onNext={next} onClose={close} />;
}

// Full-width menu entry, styled to match the Agent Forge block in
// the hub Program menu. Jumps straight to step 3 (the FINTRAC
// text) — a user tapping a "FINTRAC" entry wants that text, not
// the tutorial. Fires the open event; the host (mounted in the
// Concourse) does the showing, so this button works from any
// page the Concourse renders on.
export function FintracExplanationMenuButton() {
  return (
    <button
      type="button"
      onClick={() => fireFintracExplanation(3)}
      className="ui-element pointer-events-auto flex w-full flex-col px-4 py-3 text-left bg-black/40 border border-amber-500/30 rounded hover:bg-amber-500/20 transition-all group"
    >
      <span className="flex flex-wrap items-center gap-2 text-sm font-black uppercase tracking-widest text-amber-300 group-hover:text-white">
        {FINTRAC_EXPLANATION_TITLE}
        <span className="rounded-full bg-red-500 px-2 py-px text-[9px] font-black tracking-wider text-white">
          IMPORTANT
        </span>
      </span>
      <span className="mt-1 text-[10px] uppercase text-zinc-500">
        How payments &amp; creator earnings work
      </span>
    </button>
  );
}
