'use client';

// Molly — testing sandbox inside Olympus.
//
// This is a CONTAINED DEMO COPY for testing: everything here runs in the
// browser alone. The real Molly stays sealed in her own private repo; this
// page never talks to her, never calls any outside service, and never sends
// anything anywhere. The talk box answers from scripted replies, and the
// demo hunt replays the same plant -> trip -> engage -> score -> govern ->
// package pipeline her real code runs, with the same weights.
//
// The door: a passcode prompt guards this page. The passcode itself is never
// displayed, logged, or stored here — the browser only posts what the
// visitor typed to /api/molly/gate, which checks it server-side. Access
// lasts for this tab only (sessionStorage); closing the tab locks it again.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const UNLOCK_KEY = 'molly-unlocked';

const PARTS = [
  ['Skin', 'Sentinel decoys — fake files, wallets, and profiles with tracking IDs. When one is taken, it reports home.'],
  ['Nerves', 'A small swarm that engages a tripwire contact and collects observations. Here it runs practice scenarios only.'],
  ['Brain', 'ARES-style scoring: detection leads (0.40), defense pattern (0.35), severity (0.25). Every catch sharpens the next.'],
  ['Conscience', 'Artemis governance: nurture, organize, protect. Two judges must agree, and a human must approve, before anything counts as report-ready.'],
  ['Memory', 'A hash-chained recall log. Every hunt is remembered, in order, tamper-evident.'],
];

function replyFor(text) {
  const t = text.toLowerCase();
  if (/(^|\s)(hi|hello|hey)(\s|$|!)/.test(t)) return 'Hello. I am Molly — a sandbox copy of the hunter, here for testing. The real me stays sealed away; I am the version you can poke at safely.';
  if (t.includes('who are you') || t.includes('what are you')) return 'I am Molly, a predator-and-scam hunter. I bait and report — I never hack back. My job is to lure the people who exploit others into revealing themselves, gather clean evidence, and package it for the authorities.';
  if (t.includes('mission') || t.includes('why') || t.includes('purpose')) return 'My mission is to hunt online predation and eradicate it — and to grow, one day, into protection offline too: safe housing for people with nothing. Safety as a utility, like heat and light.';
  if (t.includes('skin') || t.includes('decoy') || t.includes('tripwire') || t.includes('canary')) return 'My skin is Sentinel decoys: fake credential files, wallet seeds, and profiles, each with a unique tracking ID. When someone takes one, the taking itself is the evidence.';
  if (t.includes('swarm') || t.includes('nerve') || t.includes('engage')) return 'My nerves are a small swarm. Agents engage a tripwire contact just long enough to collect observations — links, pressure, identifiers — and never attack. Here they run practice scenarios, not live chats.';
  if (t.includes('brain') || t.includes('score') || t.includes('ares')) return 'My brain scores every trip three ways: detection 0.40, defense pattern 0.35, severity 0.25. Detection leads, because a hunter that cannot detect cannot do anything else. Press "Run a demo hunt" and watch it work.';
  if (t.includes('conscience') || t.includes('govern') || t.includes('directive') || t.includes('mom')) return 'My conscience is three directives: nurture, organize, protect. Two judges must agree and a human must approve before any package counts as report-ready. And one command freezes me cold — the silver bullet.';
  if (t.includes('memory') || t.includes('recall') || t.includes('log')) return 'My memory is a hash-chained log: every hunt appended in order, each entry carrying the hash of the last, so tampering breaks the chain. What I remember, I remember in order.';
  if (t.includes('freeze') || t.includes('frozen') || t.includes('silver bullet')) return 'The silver bullet is my freeze: one command stops everything and preserves all state. Only the Architect unfreezes me. Try the Freeze button below — everything else will refuse until you unfreeze.';
  if (t.includes('hunt') || t.includes('demo')) return 'Press "Run a demo hunt" and I will walk you through one: plant a decoy, trip it, engage, score, govern, and package — all here, all offline.';
  if (t.includes('help') || t.includes('what can you')) return 'Ask me about my mission, my skin, my swarm, my brain, my conscience, or my memory — or press "Run a demo hunt" to watch a full hunt play out.';
  return 'I am a sandbox copy, so I answer from a small script, not a live mind. Ask me about my mission, my parts, or press "Run a demo hunt" — or ask for help to see what I can show you.';
}

const DEMO_LINES = [
  'Planting decoy: a wallet seed with a fresh tracking ID… planted.',
  'Trip: the decoy was taken. Trip recorded.',
  'Swarm engaging (practice scenario)…',
  '  observation: contact asks for the wallet seed phrase.',
  '  observation: contact shares a lookalike wallet-restore link.',
  '  observation: contact urges immediate transfer before “expiry”.',
  '  observation: contact reveals a receiving address.',
  'Scoring: detection 0.750, pattern 0.675, severity 0.600 → total 0.686.',
  'Verification: verified and corroborated (4 distinct observation kinds).',
  'Council: both judges agree.',
  'Package pkg-0001 → pending-approval. It waits on the Architect — a human — before it ever counts as report-ready.',
];

export default function MollySandboxPage() {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [passcode, setPasscode] = useState('');
  const [gateError, setGateError] = useState('');
  const [busy, setBusy] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [messages, setMessages] = useState([
    { from: 'molly', text: 'Hello. I am Molly — a sandbox copy, here for testing. Ask me about my mission or my parts, or run a demo hunt.' },
  ]);
  const [draft, setDraft] = useState('');
  const [log, setLog] = useState([]);
  const logEndRef = useRef(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(UNLOCK_KEY) === '1') setUnlocked(true);
    } catch {}
    setChecking(false);
  }, []);

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [log]);

  async function submitGate(event) {
    event.preventDefault();
    setGateError('');
    setBusy(true);
    try {
      const res = await fetch('/api/molly/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) {
        setGateError('That didn’t open it.');
        setPasscode('');
        return;
      }
      try { sessionStorage.setItem(UNLOCK_KEY, '1'); } catch {}
      setUnlocked(true);
    } catch {
      setGateError('The door didn’t answer. Try again.');
    } finally {
      setBusy(false);
    }
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
    setMessages((m) => [...m, { from: 'you', text }, { from: 'molly', text: replyFor(text) }]);
  }

  function runDemo() {
    if (frozen) {
      setLog((l) => [...l, 'Refused: Molly is frozen.']);
      return;
    }
    setLog(DEMO_LINES);
  }

  if (checking) return <main style={{ padding: 24, color: '#e4e4e7' }}>Opening Molly…</main>;

  if (!unlocked) {
    return (
      <main style={{ padding: 24, maxWidth: 520, margin: '0 auto', color: '#e4e4e7', fontFamily: 'system-ui, sans-serif' }}>
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 0, marginBottom: 24 }}>← Back to hub</button>
        <h1 style={{ fontSize: 28, margin: '0 0 8px' }}>Molly</h1>
        <p style={{ color: '#a1a1aa', margin: '0 0 24px' }}>Testing sandbox. This door asks for a passcode before she shows herself.</p>
        <form onSubmit={submitGate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label htmlFor="molly-passcode" style={{ fontSize: 14 }}>Passcode</label>
          <input
            id="molly-passcode"
            type="password"
            autoComplete="off"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Enter the passcode"
            style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #3f3f46', background: '#18181b', color: '#fafafa', fontSize: 16 }}
          />
          {gateError && <p style={{ color: '#f87171', margin: 0 }}>{gateError}</p>}
          <button type="submit" disabled={busy || !passcode} style={{ padding: '12px 14px', borderRadius: 12, border: 'none', background: '#fafafa', color: '#09090b', fontSize: 16, cursor: 'pointer', opacity: busy || !passcode ? 0.5 : 1 }}>
            {busy ? 'Checking…' : 'Open the door'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: '0 auto', color: '#e4e4e7', fontFamily: 'system-ui, sans-serif' }}>
      <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 0, marginBottom: 16 }}>← Back to hub</button>
      <div style={{ border: '1px solid #f59e0b', borderRadius: 12, padding: '10px 14px', marginBottom: 20, background: '#292524' }}>
        <strong>SANDBOX — TESTING ONLY.</strong> A contained demo copy. The real Molly stays sealed in her own repo; nothing here touches her, and nothing here reaches any outside service.
      </div>
      <h1 style={{ fontSize: 28, margin: '0 0 8px' }}>Molly</h1>
      <p style={{ color: '#a1a1aa', margin: '0 0 20px' }}>
        Predator-and-scam hunter. Bait and report — never hack back. Her mission: hunt online
        predation and eradicate it, and grow one day into protection offline: safe housing for
        people with nothing.
      </p>

      <h2 style={{ fontSize: 18, margin: '20px 0 10px' }}>Her parts</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {PARTS.map(([name, desc]) => (
          <div key={name} style={{ border: '1px solid #27272a', borderRadius: 12, padding: '12px 14px' }}>
            <strong>{name}.</strong> {desc}
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 18, margin: '24px 0 10px' }}>Talk to her</h2>
      <div style={{ border: '1px solid #27272a', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((m, i) => (
          <p key={i} style={{ margin: 0, color: m.from === 'molly' ? '#fafafa' : '#a1a1aa' }}>
            <strong>{m.from === 'molly' ? 'Molly' : 'You'}:</strong> {m.text}
          </p>
        ))}
        <form onSubmit={sendTalk} style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask Molly something…"
            style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #3f3f46', background: '#18181b', color: '#fafafa', fontSize: 15 }}
          />
          <button type="submit" style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#fafafa', color: '#09090b', cursor: 'pointer' }}>Send</button>
        </form>
      </div>

      <h2 style={{ fontSize: 18, margin: '24px 0 10px' }}>Demo hunt</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={runDemo} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#fafafa', color: '#09090b', cursor: 'pointer' }}>Run a demo hunt</button>
        <button onClick={() => setFrozen((f) => !f)} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #3f3f46', background: frozen ? '#7f1d1d' : '#18181b', color: '#fafafa', cursor: 'pointer' }}>
          {frozen ? 'Unfreeze Molly' : 'Freeze Molly (silver bullet)'}
        </button>
        <button onClick={() => setLog([])} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #3f3f46', background: '#18181b', color: '#fafafa', cursor: 'pointer' }}>Clear log</button>
      </div>
      {frozen && <p style={{ color: '#f87171' }}>Molly is frozen. Talk and demo hunts refuse until she is unfrozen.</p>}
      <div style={{ border: '1px solid #27272a', borderRadius: 12, padding: 14, fontFamily: 'ui-monospace, monospace', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {log.length === 0 && <span style={{ color: '#71717a' }}>No hunt run yet. Press “Run a demo hunt”.</span>}
        {log.map((line, i) => <span key={i}>{line}</span>)}
        <span ref={logEndRef} />
      </div>
      <p style={{ color: '#71717a', fontSize: 13, marginTop: 20 }}>
        Sandbox note: the talk box answers from a script, and the demo hunt replays fixed
        practice data. Neither is the live creature, and neither sends anything anywhere.
      </p>
    </main>
  );
}
