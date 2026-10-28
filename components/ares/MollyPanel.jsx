'use client';

// Molly inside ARES — her working home next to the watchtower.
//
// This is the DEMO interface (the same contained copy as the /molly sandbox
// portal, now seated in the ARES program): a digitized head, a tracking
// display, a talk box, and a demo hunt runner. Everything runs in the
// browser alone. The real Molly stays sealed in her own private repo.
//
// The tracking display follows a DECOY TRIP — a thing Molly planted —
// never a person. No facial, voice, DNA, or behavior scoring of any human,
// no clearance levels, no re-education language. The video's target panel
// is style reference only (glowing head, signal bars, tracking lines),
// never content.

import { useEffect, useRef, useState } from 'react';
import { MOLLY_DEMO_LINES, mollyReplyFor } from '@/lib/molly/talk';

// Digitized head — an original dot-matrix head in glowing blue, in the
// spirit of the clip Merlin sent (particle head, more digitized, not a
// realistic face). Dots are clipped to an angular head silhouette; the
// eyes are two bright bars; a slow pulse keeps it alive.
function MollyHead() {
  const dots = [];
  for (let row = 0; row < 26; row += 1) {
    for (let col = 0; col < 24; col += 1) {
      dots.push({ x: 8 + col * 8, y: 10 + row * 8, key: `${row}-${col}` });
    }
  }
  return (
    <svg viewBox="0 0 200 220" role="img" aria-label="Molly — digitized head"
      className="molly-head mx-auto block w-full max-w-[220px]">
      <defs>
        <clipPath id="molly-head-clip">
          <path d="M100 8 L150 22 L168 70 L162 130 L138 178 L122 205 L100 212 L78 205 L62 178 L38 130 L32 70 L50 22 Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#molly-head-clip)">
        {dots.map((d) => (
          <circle key={d.key} cx={d.x} cy={d.y} r="2.1" fill="#38bdf8" opacity="0.75" />
        ))}
        <polyline points="32,70 60,100 90,84 120,108 150,88 168,70" fill="none" stroke="#7dd3fc" strokeWidth="1" opacity="0.6" />
        <polyline points="38,130 70,150 100,138 132,152 162,130" fill="none" stroke="#7dd3fc" strokeWidth="1" opacity="0.6" />
      </g>
      <path d="M100 8 L150 22 L168 70 L162 130 L138 178 L122 205 L100 212 L78 205 L62 178 L38 130 L32 70 L50 22 Z"
        fill="none" stroke="#38bdf8" strokeWidth="1.5" opacity="0.9" />
      <rect x="62" y="96" width="26" height="7" rx="3.5" fill="#e0f2fe" />
      <rect x="112" y="96" width="26" height="7" rx="3.5" fill="#e0f2fe" />
    </svg>
  );
}

function SignalBar({ label, value }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 tracking-widest text-sky-300/80">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <span className="block h-full rounded-full bg-sky-400" style={{ width: `${value}%` }} />
      </span>
      <span className="w-10 shrink-0 text-right text-sky-100">{value}%</span>
    </div>
  );
}

export default function MollyPanel() {
  const [frozen, setFrozen] = useState(false);
  const [running, setRunning] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [messages, setMessages] = useState([
    { from: 'molly', text: 'Hello. I am Molly — from inside ARES now. Ask me about my mission, or run a demo hunt and watch the tracking display light up.' },
  ]);
  const [draft, setDraft] = useState('');
  const timers = useRef([]);

  useEffect(() => () => { timers.current.forEach((t) => clearTimeout(t)); }, []);

  const huntDone = revealed >= MOLLY_DEMO_LINES.length;

  function runDemo() {
    if (frozen || running) return;
    setRunning(true);
    setRevealed(0);
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = MOLLY_DEMO_LINES.map((_, i) =>
      setTimeout(() => {
        setRevealed(i + 1);
        if (i === MOLLY_DEMO_LINES.length - 1) setRunning(false);
      }, 450 * (i + 1)));
  }

  function sendTalk(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    if (frozen) {
      setMessages((m) => [...m, { from: 'you', text }, { from: 'molly', text: 'Molly is frozen. Nothing moves until the Architect unfreezes her.' }]);
      return;
    }
    setMessages((m) => [...m, { from: 'you', text }, { from: 'molly', text: mollyReplyFor(text) }]);
  }

  return (
    <div className="flex flex-col gap-4">
      <style>{`.molly-head { animation: molly-pulse 3.2s ease-in-out infinite; }
        @keyframes molly-pulse { 0%, 100% { opacity: 0.75; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .molly-head { animation: none; } }`}</style>
      <div className="flex flex-col items-center gap-1 text-center">
        <MollyHead />
        <h2 className="text-xl font-black uppercase tracking-[0.2em] text-sky-300">Molly</h2>
        <p className="max-w-md text-xs leading-relaxed text-zinc-400">
          Predator-and-scam hunter, seated in ARES. Bait and report — never hack back.
          Demo interface: the real Molly stays sealed in her own repo.
        </p>
      </div>

      <div className="rounded-xl border border-sky-900/60 bg-black/40 p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-sky-300">
          Signal search // Decoy trip
        </p>
        <p className="mb-3 font-mono text-xs text-zinc-400">DECOY MLY-DEMO-0001 · SWARM TRACKING 0045</p>
        {huntDone ? (
          <div className="flex flex-col gap-2">
            <SignalBar label="DETECTION" value={75} />
            <SignalBar label="PATTERN" value={68} />
            <SignalBar label="SEVERITY" value={60} />
            <SignalBar label="MATCH" value={69} />
            <p className="mt-2 font-mono text-xs leading-relaxed text-zinc-400">
              ARCHIVE // RECALL LOG — chain intact<br />
              COUNCIL // BOTH JUDGES AGREE<br />
              PACKAGE // PENDING ARCHITECT APPROVAL
            </p>
          </div>
        ) : (
          <p className="font-mono text-xs text-zinc-500">
            {running ? 'Tracking a practice trip…' : 'No hunt run yet. Press “Run a demo hunt”.'}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={runDemo} disabled={running || frozen}
            className="rounded-lg bg-sky-400 px-4 py-2 text-xs font-bold uppercase tracking-widest text-black disabled:opacity-50">
            {running ? 'Hunting…' : 'Run a demo hunt'}
          </button>
          <button onClick={() => setFrozen((f) => !f)}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-300">
            {frozen ? 'Unfreeze Molly' : 'Freeze Molly (silver bullet)'}
          </button>
        </div>
        {revealed > 0 && (
          <div className="mt-3 flex flex-col gap-1 font-mono text-xs leading-relaxed text-zinc-300">
            {MOLLY_DEMO_LINES.slice(0, revealed).map((line, i) => <span key={i}>{line}</span>)}
          </div>
        )}
        {frozen && <p className="mt-2 text-xs text-red-400">Molly is frozen. Talk and demo hunts refuse until she is unfrozen.</p>}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-black/30 p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Talk to her</p>
        <div className="flex flex-col gap-2">
          {messages.map((m, i) => (
            <p key={i} className={`text-sm ${m.from === 'molly' ? 'text-zinc-100' : 'text-zinc-400'}`}>
              <strong>{m.from === 'molly' ? 'Molly' : 'You'}:</strong> {m.text}
            </p>
          ))}
        </div>
        <form onSubmit={sendTalk} className="mt-3 flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask Molly something…"
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
          <button type="submit" className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-bold text-black">Send</button>
        </form>
      </div>

      <p className="text-center text-[11px] text-zinc-600">
        This panel tracks decoy trips, never people. Nothing here reaches any outside service.
      </p>
    </div>
  );
}
