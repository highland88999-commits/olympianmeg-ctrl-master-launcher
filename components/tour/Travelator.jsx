'use client';

// The Travelator — the Concourse tour system (Phase 2).
//
// Tap the Tour tile and the ride begins: gate by gate through the program
// registry, one Gate Card at a time, five seconds per gate. The travelator
// never waits — doing nothing keeps riding. Each gate shows TWO stacked
// frames in the one overlay: a preview frame on top (the program itself,
// live in an iframe — not a video of it) and the tour controls +
// information frame below it. Tour Bar controls:
// Previous, Pause, Next Gate, Open (leave the ride and enter that
// program), End Tour. Ending shrinks the card back down, the way the
// ride collapses back into the Orb. The tile keeps its SOON badge: this
// is the preview ride — the full hub-camera glide is a later step,
// not this one.

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

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-y-auto bg-black/90 p-4" role="dialog" aria-label="The Travelator tour">
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6 transition-all duration-500"
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
              Preview ride — the tile keeps its SOON badge while the full
              hub-camera glide is built. Nothing here is faked: every gate
              is a real program from the registry.
            </p>
            <button type="button" onClick={onClose} className="text-sm text-zinc-400">Not now</button>
          </div>
        )}

        {mode === 'riding' && gate && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Gate {index + 1} of {gates.length}</p>
              <p className="text-xs text-zinc-500">{gate.section}</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-sky-400 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            {/* Preview frame (top of the two stacked frames): the
                program itself, live in an iframe — not a video of it.
                pointer-events-none keeps the glimpse from swallowing
                tour taps or scrolls; Open this program is how you
                step inside. Sandboxed to scripts + same origin so the
                page renders as itself, but it cannot navigate the
                tour away. A heavy program may still be painting when
                its 5 s gate ends — that is the live preview's cost. */}
            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-black">
              <iframe
                key={gate.key}
                src={gate.route}
                title={`${titleFor(gate.key)} preview`}
                sandbox="allow-scripts allow-same-origin"
                className="pointer-events-none block aspect-video w-full border-0 bg-black"
              />
            </div>
            <div className="rounded-xl border border-zinc-800 bg-black/40 p-5">
              <h2 className="text-2xl font-black text-zinc-100">{titleFor(gate.key)}</h2>
              {subtitleFor(gate.key) && <p className="mt-1 text-sm text-zinc-400">{subtitleFor(gate.key)}</p>}
              <p className="mt-3 font-mono text-xs text-zinc-500">{gate.route}</p>
            </div>
            <p className="text-xs text-zinc-500">
              {paused ? 'Paused — the walkway is holding.' : `Moving on in ${GATE_SECONDS} seconds — or skip ahead.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-bold text-zinc-100 disabled:opacity-40">
                Previous gate
              </button>
              <button type="button" onClick={() => setPaused((p) => !p)}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-bold text-zinc-100">
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button type="button" onClick={() => { if (index >= gates.length - 1) setMode('done'); else setIndex((i) => i + 1); }}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-bold text-zinc-100">
                Next gate
              </button>
              <button type="button" onClick={openGate}
                className="rounded-lg bg-sky-400 px-4 py-2 text-xs font-bold text-black">
                Open this program
              </button>
              <button type="button" onClick={endTour}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-bold text-zinc-300">
                End tour
              </button>
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
