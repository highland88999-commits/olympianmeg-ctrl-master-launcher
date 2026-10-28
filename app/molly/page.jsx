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
import { MOLLY_DEMO_LINES, MOLLY_PARTS, mollyReplyFor } from '@/lib/molly/talk';
import { speakMolly, speechSupported, stopMollySpeech } from '@/lib/molly/voice';

const UNLOCK_KEY = 'molly-unlocked';




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
  const [voiceOn, setVoiceOn] = useState(() => {
    try { return localStorage.getItem('molly-voice') === '1'; } catch { return false; }
  });
  const [voiceAvailable, setVoiceAvailable] = useState(false);
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

  useEffect(() => { setVoiceAvailable(speechSupported()); }, []);

  useEffect(() => () => stopMollySpeech(), []);

  useEffect(() => {
    if (!voiceOn) return;
    const last = messages[messages.length - 1];
    if (last && last.from === 'molly') speakMolly(last.text);
  }, [messages, voiceOn]);

  function toggleVoice() {
    if (!voiceAvailable) return;
    const next = !voiceOn;
    setVoiceOn(next);
    try { localStorage.setItem('molly-voice', next ? '1' : '0'); } catch {}
    if (!next) {
      stopMollySpeech();
    } else {
      const last = [...messages].reverse().find((m) => m.from === 'molly');
      if (last) speakMolly(last.text);
    }
  }

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
    setMessages((m) => [...m, { from: 'you', text }, { from: 'molly', text: mollyReplyFor(text) }]);
  }

  function runDemo() {
    if (frozen) {
      setLog((l) => [...l, 'Refused: Molly is frozen.']);
      return;
    }
    setLog(MOLLY_DEMO_LINES);
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
        {MOLLY_PARTS.map(([name, desc]) => (
          <div key={name} style={{ border: '1px solid #27272a', borderRadius: 12, padding: '12px 14px' }}>
            <strong>{name}.</strong> {desc}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '24px 0 10px' }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>Talk to her</h2>
        <button type="button" onClick={toggleVoice} disabled={!voiceAvailable} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #3f3f46', background: voiceOn ? '#0c4a6e' : '#18181b', color: '#fafafa', cursor: voiceAvailable ? 'pointer' : 'default', opacity: voiceAvailable ? 1 : 0.5 }}>
          {voiceOn ? 'Voice: on' : 'Voice: off'}
        </button>
      </div>
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
