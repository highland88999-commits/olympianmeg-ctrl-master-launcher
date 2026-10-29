'use client';

// components/FintracExplanation.jsx
// The onboarding wizard + FINTRAC explanation modal (Merlin, 2026-10-26).
//
// Five steps, one copy source (lib/fintrac-explanation.js):
//   FintracExplanationModal      — the dialog itself, one step at
//     a time: 1 Landing setup (the traffic light: red = camera
//     perspective, yellow = starting character, green = continue),
//     2 Device controls, 3 Welcome to Olympus, 4 the FINTRAC
//     explanation (verbatim), 5 Take The Tour (opens the
//     Travelator). Buttons: Next, Next, Next, Next, Close. All five
//     frames wear the Concourse backdrop image.
//   FintracExplanationHost       — mounted once inside the
//     Concourse (layout level, so it lives for the whole app
//     session): auto-shows the full sequence from step 1 on each
//     hub load for signed-in users, and re-opens at step 4
//     whenever any menu entry fires the event.
//   FintracExplanationMenuButton — the full-width menu entry used
//     by the hub Program menu and the Portal Room page; it jumps
//     straight to step 4 (the FINTRAC text).
//
// CLOSE / SKIP = THIS LOAD ONLY: dismissing sets React state,
// never localStorage, so the next app load shows the sequence
// again from step 1. A full reload restarts at step 1;
// mid-session hub returns do NOT re-show after a Close.
// The landing picks (perspective + character) ARE saved per
// account via /api/ui-state — they are preferences, not dismissal.
// AUTO-SHOW GATE: hub route ('/') + signed-in session only —
// the modal never pops over a program or game page on its own.
// (Merlin's old no-popups preference is superseded here by his
// explicit 2026-10-26 order for this one explanation modal.)

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { CHARACTERS } from '@/lib/characters/roster';
import {
  FINTRAC_EVENT,
  FINTRAC_EXPLANATION_TITLE,
  FINTRAC_EXPLANATION_PARAGRAPHS,
  ONBOARDING_STEP1_PARAGRAPHS,
  ONBOARDING_STEP2_CARDS,
  ONBOARDING_STEP2_NOTE,
  ONBOARDING_STEP3_PARAGRAPHS,
  ONBOARDING_STEP5_PARAGRAPHS,
  ONBOARDING_STEP_COUNT,
  LANDING_DEFAULT_PERSPECTIVE,
  LANDING_PERSPECTIVE_LABELS,
  LANDING_PERSPECTIVE_KEY,
  LANDING_CHARACTER_KEY,
  clampOnboardingStep,
  fireFintracExplanation,
  onboardingNextButtonLabel,
  onboardingNextStep,
  onboardingStepLabel,
  onboardingStepTitle,
  shouldAutoShowFintrac,
} from '@/lib/fintrac-explanation';
import {
  TILT_CONTROLS_KEY,
  LOCATION_ENABLED_KEY,
  DEVICE_PREF_DEFAULTS,
  resolveDevicePrefs,
} from '@/lib/device-prefs';
import { CONCOURSE_BG_ART } from '@/lib/concourse-bg';

// Re-exported for the hub: components/Concourse.jsx imports
// fireFintracExplanation from this module (it was imported here but
// never re-exported, which failed the Next build).
export { fireFintracExplanation };

// Bearer token for /api/ui-state (same pattern as NexusEarth's
// getEarthUiToken): the session token, or null when signed out.
async function getLandingUiToken() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

// Step 2 — device controls with street-light toggles (Merlin, 2026-10-29).
// Tilt/motion controls and location are both AUTO-ON; the user can tap
// either light to turn it off. Green glowing = on, dim red = off.
// Prefs persist per account via /api/ui-state (lib/device-prefs.js).
function DeviceControlsFrame() {
  const [tiltOn, setTiltOn] = useState(DEVICE_PREF_DEFAULTS[TILT_CONTROLS_KEY]);
  const [locationOn, setLocationOn] = useState(DEVICE_PREF_DEFAULTS[LOCATION_ENABLED_KEY]);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      try {
        const token = await getLandingUiToken();
        if (!token) return;
        const res = await fetch('/api/ui-state', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const body = await res.json().catch(() => null);
        const prefs = resolveDevicePrefs(body && body.preferences);
        setTiltOn(prefs[TILT_CONTROLS_KEY]);
        setLocationOn(prefs[LOCATION_ENABLED_KEY]);
      } catch {
        /* auto-on defaults stand when the save can't load */
      }
    })();
  }, []);

  const savePref = async (patch) => {
    try {
      const token = await getLandingUiToken();
      if (!token) return;
      await fetch('/api/ui-state', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: patch }),
      });
    } catch {
      /* never break onboarding over a save */
    }
  };

  const toggleTilt = async () => {
    const next = !tiltOn;
    setTiltOn(next);
    savePref({ [TILT_CONTROLS_KEY]: next });
    if (next) {
      // iOS asks for motion permission from a user gesture — this tap is it.
      try {
        const DOE = window.DeviceOrientationEvent;
        if (DOE && typeof DOE.requestPermission === 'function') {
          await DOE.requestPermission();
        }
      } catch {
        /* permission prompt unavailable — the pref still stands */
      }
    }
  };

  const toggleLocation = () => {
    const next = !locationOn;
    setLocationOn(next);
    savePref({ [LOCATION_ENABLED_KEY]: next });
    // The browser asks for location itself the first time a feature
    // (e.g. the wifi finder) needs it — never during onboarding.
  };

  const light = (on, color) =>
    `ui-element pointer-events-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-4 transition-all active:scale-95 ${
      on
        ? color === 'green'
          ? 'border-green-900 bg-green-600 shadow-[0_0_20px_rgba(22,163,74,0.6)]'
          : 'border-yellow-900 bg-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.6)]'
        : 'border-red-950 bg-red-950/40 shadow-none'
    }`;

  const row = (on, onToggle, emoji, title, text, color, label) => (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={`${title}: ${on ? 'on' : 'off'}. Tap to turn ${on ? 'off' : 'on'}.`}
      className="flex w-full items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-left"
    >
      <span aria-hidden="true" className={light(on, color)}>
        <span className="text-xl leading-none">{emoji}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-black uppercase tracking-widest text-zinc-100">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-zinc-400">
          {text}
        </span>
        <span className={`mt-1 block text-[10px] font-black uppercase tracking-widest ${on ? 'text-green-400' : 'text-red-400'}`}>
          {on ? label.on : label.off}
        </span>
      </span>
    </button>
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {ONBOARDING_STEP2_CARDS.map((card) => (
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
        {ONBOARDING_STEP2_NOTE}
      </p>
      {/* Street-light toggles: both auto-on, tap to turn off. */}
      <div className="mt-4 flex flex-col gap-3 rounded-[2rem] border border-zinc-700 bg-zinc-950/70 px-4 py-4">
        {row(
          tiltOn, toggleTilt, '📳', 'Tilt control',
          'Tilt your phone to steer and look. On by default — tap the light to turn it off.',
          'green', { on: 'On', off: 'Off' }
        )}
        {row(
          locationOn, toggleLocation, '📍', 'Location',
          'Background tracking for mapping — the wifi finder needs it to place networks on the map. On by default.',
          'green', { on: 'On', off: 'Off' }
        )}
      </div>
    </>
  );
}

// Step 1 — the traffic light (Merlin, 2026-10-29). Three circular
// buttons stacked like a street light: red picks the camera
// perspective for the landing (taps toggle 1st/3rd), yellow opens
// the character picker, green continues to step 2. Picks save to
// /api/ui-state when signed in, and load back on the next visit.
function LandingSetupFrame({ onContinue }) {
  const [perspective, setPerspective] = useState(LANDING_DEFAULT_PERSPECTIVE);
  const [characterId, setCharacterId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewId, setPreviewId] = useState(null);
  const loadedRef = useRef(false);

  // Load saved picks once (signed-in accounts only).
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      try {
        const token = await getLandingUiToken();
        if (!token) return;
        const res = await fetch('/api/ui-state', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const body = await res.json().catch(() => null);
        const prefs = body && body.preferences;
        if (!prefs || typeof prefs !== 'object') return;
        if (prefs[LANDING_PERSPECTIVE_KEY] === '1st' || prefs[LANDING_PERSPECTIVE_KEY] === '3rd') {
          setPerspective(prefs[LANDING_PERSPECTIVE_KEY]);
        }
        if (typeof prefs[LANDING_CHARACTER_KEY] === 'string'
          && CHARACTERS.some((c) => c.id === prefs[LANDING_CHARACTER_KEY])) {
          setCharacterId(prefs[LANDING_CHARACTER_KEY]);
          setPreviewId(prefs[LANDING_CHARACTER_KEY]);
        }
      } catch {
        /* session-only picks when the save can't load */
      }
    })();
  }, []);

  const savePick = async (patch) => {
    try {
      const token = await getLandingUiToken();
      if (!token) return;
      await fetch('/api/ui-state', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: patch }),
      });
    } catch {
      /* never break onboarding over a save */
    }
  };

  const togglePerspective = () => {
    const next = perspective === '1st' ? '3rd' : '1st';
    setPerspective(next);
    savePick({ [LANDING_PERSPECTIVE_KEY]: next });
  };

  const pickCharacter = (id) => {
    setCharacterId(id);
    setPreviewId(id);
    savePick({ [LANDING_CHARACTER_KEY]: id });
  };

  const character = CHARACTERS.find((c) => c.id === characterId) || null;
  const preview = CHARACTERS.find((c) => c.id === previewId) || character || null;

  const lightBase =
    'ui-element pointer-events-auto flex h-20 w-20 items-center justify-center rounded-full border-4 transition-all active:scale-95';

  return (
    <div className="flex flex-col items-center">
      {ONBOARDING_STEP1_PARAGRAPHS.map((p, i) => (
        <p key={i} className="text-center text-sm leading-relaxed text-zinc-200">
          {p}
        </p>
      ))}

      {/* The street light: red / yellow / green, top to bottom. */}
      <div
        role="group"
        aria-label="Landing setup"
        className="mt-5 flex flex-col items-center gap-4 rounded-[2rem] border border-zinc-700 bg-zinc-950/70 px-6 py-5"
      >
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={togglePerspective}
            aria-label={`Camera perspective: ${LANDING_PERSPECTIVE_LABELS[perspective]}. Tap to switch.`}
            title="Camera perspective — tap to switch"
            className={`${lightBase} border-red-900 bg-red-600 shadow-[0_0_24px_rgba(220,38,38,0.55)] hover:bg-red-500`}
          >
            <span aria-hidden="true" className="text-2xl leading-none">🎥</span>
          </button>
          <span className="text-[10px] font-black uppercase tracking-widest text-red-300">
            {LANDING_PERSPECTIVE_LABELS[perspective]}
          </span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => { setPreviewId(characterId); setPickerOpen(true); }}
            aria-label={character ? `Character: ${character.name}. Tap to change.` : 'Pick your character'}
            title="Pick your character"
            className={`${lightBase} overflow-hidden border-yellow-900 ${character ? 'bg-yellow-500 shadow-[0_0_24px_rgba(234,179,8,0.55)]' : 'bg-zinc-800 shadow-[0_0_12px_rgba(234,179,8,0.25)]'} hover:bg-yellow-400`}
          >
            {character ? (
              <img
                src={character.preview}
                alt=""
                aria-hidden="true"
                draggable={false}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                className="h-full w-full object-cover"
              />
            ) : (
              <span aria-hidden="true" className="text-2xl leading-none">❔</span>
            )}
          </button>
          <span className="max-w-[7rem] text-center text-[10px] font-black uppercase leading-tight tracking-widest text-yellow-300">
            {character ? character.name : 'Character'}
          </span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={onContinue}
            aria-label="Continue to device controls"
            title="Continue"
            className={`${lightBase} border-green-900 bg-green-600 shadow-[0_0_24px_rgba(22,163,74,0.55)] hover:bg-green-500`}
          >
            <span aria-hidden="true" className="text-2xl leading-none">➡️</span>
          </button>
          <span className="text-[10px] font-black uppercase tracking-widest text-green-300">
            Continue
          </span>
        </div>
      </div>

      {/* 3rd person: your character stands in front of you, below the
          light — compact so the whole frame fits the card (Merlin,
          2026-10-29). 1st person: through their eyes, nothing shown. */}
      {perspective === '3rd' && character && (
        <div className="mt-4 flex flex-col items-center">
          <img
            src={character.preview}
            alt={character.name}
            draggable={false}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            className="h-20 w-20 rounded-2xl border border-amber-400/40 object-cover"
          />
          <span className="mt-1 text-center text-[10px] font-black uppercase tracking-widest text-amber-200">
            {character.name}
          </span>
        </div>
      )}

      {/* Character picker: preview above, the roster grid below —
          sized to land inside the card (Merlin, 2026-10-29). */}
      {pickerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pick your character"
          className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-3xl bg-zinc-950"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
            <span className="text-xs font-black uppercase tracking-widest text-amber-200">
              Pick your character
            </span>
            <button
              type="button"
              aria-label="Close character picker"
              onClick={() => setPickerOpen(false)}
              className="ui-element pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-white/15 text-zinc-300 hover:border-amber-300/60 hover:text-white"
            >
              <span aria-hidden="true" className="text-xs leading-none">×</span>
            </button>
          </div>
          {/* Preview above the grid: tapping a character shows
              them here and selects them on the spot. */}
          <div className="flex shrink-0 flex-col items-center border-b border-zinc-800 px-4 py-3">
            {preview ? (
              <>
                <img
                  src={preview.preview}
                  alt={preview.name}
                  draggable={false}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  className="h-24 w-24 rounded-2xl border border-amber-400/40 object-cover"
                />
                <span className="mt-2 text-sm font-black text-zinc-100">{preview.name}</span>
              </>
            ) : (
              <span className="py-6 text-xs uppercase tracking-widest text-zinc-500">
                Tap a character below
              </span>
            )}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-3 content-start gap-3 overflow-y-auto p-4">
            {CHARACTERS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pickCharacter(c.id)}
                aria-label={c.name}
                title={c.name}
                className={`ui-element pointer-events-auto overflow-hidden rounded-xl border-2 transition-all active:scale-95 ${c.id === characterId ? 'border-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.5)]' : 'border-transparent hover:border-zinc-600'}`}
              >
                <img
                  src={c.preview}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  loading="lazy"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  className="aspect-square w-full bg-zinc-900 object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function FintracExplanationModal({ open, step = 4, onNext, onClose, onTakeTour, bgUrl }) {
  if (!open) return null;
  const currentStep = clampOnboardingStep(step);
  const isFintracStep = currentStep === 4;
  const isLastStep = currentStep === ONBOARDING_STEP_COUNT;
  const title = onboardingStepTitle(currentStep);
  // The frames wear the Concourse backdrop (Merlin, 2026-10-29);
  // video backdrops fall back to the default image — the modal stays light.
  const bg = bgUrl || CONCOURSE_BG_ART;
  const takeTour = () => {
    try { onClose(); } catch {}
    try { if (onTakeTour) onTakeTour(); } catch {}
  };
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
        {/* Fixed height: every step of the load sequence renders
            the same size card (Merlin, 2026-10-29) — the content
            area scrolls, the header and button stay put. */}
        <div className="relative flex h-[min(82dvh,680px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-amber-400/40 shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
          {/* Concourse backdrop behind every frame (Merlin 2026-10-29) */}
          <img src={bg} alt="" aria-hidden="true" draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-zinc-950/55" />
          <div className="relative flex min-h-0 flex-1 flex-col">
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
          <div className="relative min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {currentStep === 1 && <LandingSetupFrame onContinue={onNext} />}
            {currentStep === 2 && <DeviceControlsFrame />}
            {currentStep === 3 && (
              ONBOARDING_STEP3_PARAGRAPHS.map((p, i) => (
                <p key={i} className={i === 0 ? 'text-sm leading-relaxed text-zinc-200' : 'mt-3 text-sm leading-relaxed text-zinc-200'}>
                  {p}
                </p>
              ))
            )}
            {currentStep === 4 && (
              FINTRAC_EXPLANATION_PARAGRAPHS.map((p, i) => (
                <p key={i} className={i === 0 ? 'text-sm leading-relaxed text-zinc-200' : 'mt-3 text-sm leading-relaxed text-zinc-200'}>
                  {p}
                </p>
              ))
            )}
            {currentStep === 5 && (
              <>
                {ONBOARDING_STEP5_PARAGRAPHS.map((p, i) => (
                  <p key={i} className={i === 0 ? 'text-sm leading-relaxed text-zinc-200' : 'mt-3 text-sm leading-relaxed text-zinc-200'}>
                    {p}
                  </p>
                ))}
                {/* Circular tour button, matching the Concourse tour
                    tile's artwork (Merlin, 2026-10-29) */}
                <div className="mt-5 flex justify-center">
                  <button
                    type="button"
                    onClick={takeTour}
                    aria-label="Take the tour"
                    title="Take the tour"
                    className="ui-element pointer-events-auto relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/[0.06] shadow-[0_4px_18px_rgba(0,0,0,0.35)] backdrop-blur-md transition-all hover:border-cyan-300/60 hover:scale-105 active:scale-95"
                  >
                    <img
                      src="/concourse-icons/tour.webp"
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <span aria-hidden="true" className="relative z-10 text-3xl leading-none">🗺️</span>
                  </button>
                </div>
                <p className="mt-2 text-center text-[11px] font-bold uppercase tracking-widest text-zinc-400">
                  Tap the map to start
                </p>
              </>
            )}
          </div>
          <div className="shrink-0 border-t border-zinc-800 px-5 py-4">
            <button
              type="button"
              onClick={isLastStep ? onClose : onNext}
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
    </div>
  );
}

export function FintracExplanationHost({ onTakeTour, bgUrl }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [dismissed, setDismissed] = useState(false);
  const autoShownRef = useRef(false);

  useEffect(() => {
    const onOpen = (event) => {
      // Menu entries carry step 4 in the event detail; an event
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

  return <FintracExplanationModal open={open} step={step} onNext={next} onClose={close} onTakeTour={onTakeTour} bgUrl={bgUrl} />;
}

// Full-width menu entry, styled to match the Agent Forge block in
// the hub Program menu. Jumps straight to step 4 (the FINTRAC
// text) — a user tapping a "FINTRAC" entry wants that text, not
// the tutorial. Fires the open event; the host (mounted in the
// Concourse) does the showing, so this button works from any
// page the Concourse renders on.
export function FintracExplanationMenuButton() {
  return (
    <button
      type="button"
      onClick={() => fireFintracExplanation(4)}
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
