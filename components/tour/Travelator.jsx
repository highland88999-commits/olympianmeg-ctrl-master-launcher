'use client';

// The Travelator — the Concourse tour system (Phase 2).
//
// Tap the Tour tile and the ride begins: gate by gate through the program
// registry, one Gate Card at a time, five seconds per gate. The travelator
// never waits — doing nothing keeps riding. Each gate card uses the
// program itself as its background: the program live in an iframe,
// full-bleed behind the tour chrome. The card overtop is see-through —
// labels, symbols, borders and buttons only, no solid fills (a faint
// bottom shade keeps the labels readable over bright previews). The
// tour controls are circular icon buttons: the words are gone, a
// symbol matching each function takes their place (words survive as
// aria-labels for screen readers). Tour Bar controls:
// Previous («), Pause/Resume (❚❚/▶), Next Gate (»), Open (⬈ — leave
// the ride and enter that program), End Tour (■). Ending shrinks the
// card back down, the way the ride collapses back into the Orb.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SATELLITES } from '@/lib/i18n/satellites';
import { useI18n } from '@/lib/i18n';
import { SECTION_ORDER } from '@/lib/portal-roster';
import { GATE_SECONDS, buildTour, prettifyKey } from '@/lib/tour/itinerary';

export default function Travelator({ open, onClose }) {
  const router = useRouter();
  const { t } = useI18n();
  const [mode, setMode] = useState('choose');
  const [gates, setGates] = useState([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [shrinking, setShrinking] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (open) {
      setMode('choose');
      setGates([]);
      setIndex(0);
      setPaused(false);
      setShrinking(false);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [open ]);

  useEffect(() => {
    if (mode !== 'riding' || paused || gates.length === 0) return undefined;
    timerRef.current = setTimeout(() => {
      if (index >= gates.length - 1) {
        setMode('done');
      } else {
        setIndex((i) => i + 1);
      }
    }, GATE_SECONDS * 1000);
    return () => clearTimeout(timerRef.current);
  }, [mode, index, paused, gates]);

  if (!open) return null;

  const titleFor = (key) => {
    const full = `sat.${key}.title`;
    const v = t(full);
    return v && v !== full ? v : prettifyKey(key);
  };
  const subtitleFor = (key) => {
    const full = `sat.${key}.subtitle`;
    const v = t(full);
    return v && v !== full ? v : '';
  };

  function startRide(rideMode) {
    setGates(buildTour(SATELLITES, rideMode, SECTION_ORDER));
    setIndex(0);
    setPaused(false);
    setMode('riding');
  }

  function endTour() {
    setShrinking(true);
    setTimeout(() => { setShrinking(false); onClose(); }, 650);
  }

  function openGate() {
    const gate = gates[index];
    if (!gate) return;
    onClose();
    router.push(gate.route);
  }

  const gate = gates[index] || null;
  const progress = gates.length ? Math.round(((index + 1) / gates.length) * 100) : 0;
  // The preview iframe carries ?tourPreview=1 so the page hides its
  // broadcast announcement box — the tour shows the program only.
  const previewSrc = gate ? gate.route + (gate.route.includes('?') ? '&' : '?') + 'tourPreview=1' : '';
  const iconBtn = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-600 bg-black/50 text-lg leading-none text-zinc-100 backdrop-blur transition hover:border-sky-400 disabled:opacity-40';
  const iconBtnPrimary = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-sky-400 bg-sky-400 text-lg leading-none text-black backdrop-blur transition hover:bg-sky-300';

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-y-auto bg-black/90 p-2" role="dialog" aria-label="The Travelator tour">
      <div
        className="w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-950 p-3 transition-all duration-500"
        style={shrinking || mode === 'done'
          ? { transform: 'scale(0.1)', opacity: 0 }
          : { transform: 'scale(1)', opacity: 1 }}
      >
        {mode === 'choose' && (
          <div className="flex flex-col gap-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">The Travelator</p>
            <h2 className="text-2xl font-black text-zinc-100">A ride through every program</h2>
            <p className="text-sm leading-relaxed text-zinc-400">
              The airport walkway of the Concourse: gate by gate, {GATE_SECONDS} seconds
              each, and it never waits for you. Pause it, go back, skip ahead, step off
              into any program, or ride it to the end — ending shrinks you
              back down, the way the ride collapses into the Orb.
            </p>
            <button type="button" onClick={() => startRide('grand')}
              className="rounded-xl bg-sky-400 px-4 py-3 text-sm font-bold text-black">
              Grand tour — one gate per section
            </button>
            <button type="button" onClick={() => startRide('full')}
              className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-100">
              Full tour — every program ({SATELLITES.length} gates)
            </button>
            <p className="text-[11px] text-zinc-600">
              Nothing here is faked: every gate
              is a real program from the registry.
            </p>
            <button type="button" onClick={onClose} className="text-sm text-zinc-400">Not now</button>
          </div>
        )}

        {mode === 'riding' && gate && (
          <div className="relative flex h-[94dvh] flex-col overflow-hidden">
            {/* The program itself is the background: live in an
                iframe, full-bleed behind the tour chrome.
                pointer-events-none keeps the glimpse from swallowing
                tour taps or scrolls; Open this program is how you
                step inside. Sandboxed to scripts + same origin so the
                page renders as itself, but it cannot navigate the
                tour away. A heavy program may still be painting when
                its 5 s gate ends — that is the live preview's cost. */}
            <iframe
              key={gate.key}
              src={previewSrc}
              title={`${titleFor(gate.key)} preview`}
              sandbox="allow-scripts allow-same-origin"
              className="pointer-events-none absolute inset-0 block h-full w-full border-0 bg-black"
            />
            {/* See-through card overtop: labels, symbols, borders
                and buttons only — no solid fills. A faint bottom
                shade keeps the labels readable over bright
                previews; the words live on as aria-labels. */}
            <div className="relative z-10 flex h-full flex-col justify-between p-5">
              <div>
                {/* HUB sits on its own at the top-left, clear of the gate
                    label (Merlin, 2026-10-29 — it was overlapping
                    "Gate X of 179"). Ends the ride back to the hub. */}
                <button type="button" onClick={endTour}
                  aria-label="Back to the hub" title="Back to the hub"
                  className="rounded-full border border-zinc-600 bg-black/50 px-3 py-1.5 text-xs font-bold text-zinc-100 backdrop-blur transition hover:border-sky-400">
                  ← HUB
                </button>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">Gate {index + 1} of {gates.length}</p>
                  <p className="text-xs text-zinc-300 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">{gate.section}</p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/50">
                  <div className="h-full rounded-full bg-sky-400 transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
              </div>
              <div className="-mx-5 -mb-5 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-5 pb-5 pt-10">
                {/* Decluttered (Merlin, 2026-10-29): the program's own
                    title, subtitle and route are gone from the tour
                    chrome — the iframe already shows the program as
                    itself. Buttons first, the moving-on line below. */}
                <div className="flex items-center gap-3">
                  <button type="button" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}
                    aria-label="Previous gate" title="Previous gate" className={iconBtn}>
                    <span aria-hidden="true">«</span>
                  </button>
                  <button type="button" onClick={() => setPaused((p) => !p)}
                    aria-label={paused ? 'Resume' : 'Pause'} title={paused ? 'Resume' : 'Pause'} className={iconBtn}>
                    <span aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
                  </button>
                  <button type="button" onClick={() => { if (index >= gates.length - 1) setMode('done'); else setIndex((i) => i + 1); }}
                    aria-label="Next gate" title="Next gate" className={iconBtn}>
                    <span aria-hidden="true">»</span>
                  </button>
                  <button type="button" onClick={openGate}
                    aria-label="Open this program" title="Open this program" className={iconBtnPrimary}>
                    <span aria-hidden="true">⬈</span>
                  </button>
                  <button type="button" onClick={endTour}
                    aria-label="End tour" title="End tour" className={iconBtn}>
                    <span aria-hidden="true">■</span>
                  </button>
                </div>
                <p className="mt-3 text-xs text-zinc-300 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">
                  {paused ? 'Paused — the walkway is holding.' : `Moving on in ${GATE_SECONDS} seconds — or skip ahead.`}
                </p>
              </div>
            </div>
          </div>
        )}

        {mode === 'done' && (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Tour complete</p>
            <h2 className="text-2xl font-black text-zinc-100">Back to the hub</h2>
            <p className="text-sm text-zinc-400">The ride collapses back into the Orb.</p>
            <button type="button" onClick={endTour} className="rounded-xl bg-sky-400 px-4 py-3 text-sm font-bold text-black">
              Return to the hub
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
