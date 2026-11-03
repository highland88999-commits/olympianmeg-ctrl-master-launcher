// app/dream-engine/page.jsx
// THE DREAM ENGINE — Sandbox Mode.
// Describe a dream; the Interpreter (Gemini) shapes it into a 3D scene you
// can walk through, then keep directing it in words: "make the sky obsidian",
// "add a staircase to nowhere". The WebGL scene is instant; meanwhile the
// Projection (stage 4) renders a Veo film of the same dream, which fades in
// on the great arch in-world and in a corner panel when it is ready.
// Mode 1 of Merlin's dual-mode design — the Cinematic Vault (cloud render)
// is a later chapter.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Moon,
  Sparkles,
  Wand2,
  Footprints,
  Orbit,
  RefreshCw,
  Send,
  Loader2,
  Shuffle,
  ChevronLeft,
  Clapperboard,
  Eye,
  EyeOff,
} from 'lucide-react';
import { normalizeScene, DEFAULT_SCENE } from '@/lib/dream-engine/schema';
import { EXAMPLE_DREAMS, randomSurprise } from '@/lib/dream-engine/examples';
import MuseEngineChat from '@/components/muse/MuseEngineChat';

const DreamCanvas = dynamic(() => import('@/components/dream-engine/DreamCanvas'), {
  ssr: false,
  loading: () => (
    <div className="de-loading">
      <Loader2 className="de-spin" size={28} />
      <span>Opening the dream…</span>
    </div>
  ),
});

async function callInterpreter(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch('/api/dream-engine/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'The Interpreter stayed silent.');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROJECTION_POLL_MS = 10000;
const PROJECTION_TIMEOUT_MS = 3 * 60 * 1000;

export default function DreamEnginePage() {
  const [scene, setScene] = useState(() => normalizeScene(DEFAULT_SCENE));
  const [phase, setPhase] = useState('intro'); // intro | dreaming
  const [dreamText, setDreamText] = useState('');
  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState('walk');
  const [fadeTick, setFadeTick] = useState(0);
  const [log, setLog] = useState([]);
  // Projection (stage 4): the Veo film of the dream.
  // status: idle | forming | ready | unavailable
  const [projection, setProjection] = useState({ status: 'idle', videoUrl: null });
  const [projNote, setProjNote] = useState('');
  const [showScreen, setShowScreen] = useState(true);
  const projRun = useRef(0);
  const lastDream = useRef('');
  const rig = useRef({ mode: 'walk', joyX: 0, joyY: 0 });
  const joyBase = useRef(null);
  const joyKnob = useRef(null);

  useEffect(() => {
    rig.current.mode = mode;
  }, [mode]);

  // Cancel any in-flight projection poll when the page unmounts.
  useEffect(() => () => { projRun.current += 1; }, []);

  const applyScene = useCallback((data, logLine) => {
    setScene(normalizeScene(data.scene));
    setFadeTick((t) => t + 1);
    if (data.fallback) setNote(data.message || 'The Interpreter is unavailable — showing the threshold dreamscape.');
    else setNote('');
    if (logLine) setLog((l) => [...l.slice(-5), logLine]);
  }, []);

  // Start a Veo projection and poll until the film exists (~3 min cap).
  // Fire-and-forget by design: the WebGL dream never waits on the film.
  // Any failure lands in the honest unavailable state — no fake video.
  const startProjection = useCallback(async (sourceText) => {
    const text = (sourceText || '').trim();
    if (!text) return;
    const run = ++projRun.current;
    setProjection({ status: 'forming', videoUrl: null });
    setProjNote('');
    try {
      const res = await fetch('/api/dream-engine/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text.slice(0, 1200) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.op) throw new Error('projection_start_failed');
      const op = data.op;
      const deadline = Date.now() + PROJECTION_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await sleep(PROJECTION_POLL_MS);
        if (projRun.current !== run) return; // superseded by a newer dream
        const poll = await fetch(`/api/dream-engine/project?op=${encodeURIComponent(op)}`);
        const pdata = await poll.json().catch(() => null);
        if (projRun.current !== run) return;
        if (!poll.ok || pdata?.error) throw new Error('projection_poll_failed');
        if (pdata?.done && pdata?.videoUrl) {
          setProjection({ status: 'ready', videoUrl: pdata.videoUrl });
          return;
        }
      }
      throw new Error('projection_timeout');
    } catch {
      if (projRun.current !== run) return;
      setProjection({ status: 'unavailable', videoUrl: null });
      setProjNote('Projection unavailable — the dream remains in WebGL.');
    }
  }, []);

  const beginDream = useCallback(async (text) => {
    const prompt = (text || '').trim();
    if (!prompt || busy) return;
    setBusy(true);
    setBusyLabel('Interpreting your dream…');
    // A new dream retires any film of the old one.
    projRun.current += 1;
    setProjection({ status: 'idle', videoUrl: null });
    setProjNote('');
    try {
      const data = await callInterpreter({ prompt });
      applyScene(data, `Dream: ${prompt}`);
      setPhase('dreaming');
      if (!data.fallback) {
        lastDream.current = prompt;
        startProjection(prompt); // fire-and-forget; WebGL is already live
      }
    } catch (e) {
      setNote(e.message || 'Something went quiet in the dream. Try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, applyScene, startProjection]);

  // Re-project: regenerate the film from where the dream has drifted to —
  // its current mood, hour and forms, with the original dream for grounding.
  const reproject = useCallback(() => {
    const env = scene.environment;
    const summary =
      `${scene.mood.label}. ${scene.mood.reading} ` +
      `Time of day: ${env.timeOfDay}; ground of ${env.groundType}; ` +
      `${scene.objects.length} dream forms drift in ${env.particles} light.` +
      (lastDream.current ? ` Original dream: ${lastDream.current}` : '');
    startProjection(summary);
  }, [scene, startProjection]);

  const direct = useCallback(async () => {
    const instruction = command.trim();
    if (!instruction || busy) return;
    setBusy(true);
    setBusyLabel('Reshaping the dream…');
    try {
      const data = await callInterpreter({ instruction, currentScene: scene });
      applyScene(data, `You directed: ${instruction}`);
      setCommand('');
    } catch (e) {
      setNote(e.message || 'The dream resisted that change. Try again.');
    } finally {
      setBusy(false);
    }
  }, [command, busy, scene, applyScene]);

  const newDream = useCallback(() => {
    projRun.current += 1; // cancel any projection poll
    setProjection({ status: 'idle', videoUrl: null });
    setProjNote('');
    lastDream.current = '';
    setPhase('intro');
    setDreamText('');
    setCommand('');
    setLog([]);
    setNote('');
  }, []);

  const surprise = useCallback(() => {
    const text = randomSurprise(dreamText);
    setDreamText(text);
    beginDream(text);
  }, [dreamText, beginDream]);

  // --- touch joystick -------------------------------------------------------
  const joyStart = (e) => {
    const base = joyBase.current;
    if (!base) return;
    base.setPointerCapture?.(e.pointerId);
    joyMove(e);
  };
  const joyMove = (e) => {
    const base = joyBase.current;
    if (!base || !e.buttons && e.pointerType === 'mouse') return;
    if (e.type === 'pointermove' && !draggingJoy.current) return;
    const rect = base.getBoundingClientRect();
    let dx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    let dy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    rig.current.joyX = dx;
    rig.current.joyY = dy;
    if (joyKnob.current) joyKnob.current.style.transform = `translate(${dx * 26}px, ${dy * 26}px)`;
  };
  const draggingJoy = useRef(false);
  const joyEnd = () => {
    draggingJoy.current = false;
    rig.current.joyX = 0;
    rig.current.joyY = 0;
    if (joyKnob.current) joyKnob.current.style.transform = 'translate(0px, 0px)';
  };

  return (
    <main className="de-root">
      <div className="de-canvas">
        <DreamCanvas
          scene={scene}
          rig={rig}
          projectionUrl={projection.status === 'ready' ? projection.videoUrl : null}
          showScreen={showScreen}
        />
      </div>

      {/* fade pulse on every scene change */}
      {fadeTick > 0 && <div key={fadeTick} className="de-fade" />}

      {/* top bar */}
      <header className="de-topbar">
        <Link href="/" className="de-back" aria-label="Back to the hub">
          <ChevronLeft size={20} />
        </Link>
        <div className="de-title">
          <Moon size={18} className="de-title-icon" />
          <span>DREAM ENGINE</span>
        </div>
        {phase === 'dreaming' && (
          <div className="de-top-actions">
            <span className="de-count">{scene.objects.length} forms</span>
            <button
              className={`de-chip-btn ${mode === 'walk' ? 'active' : ''}`}
              onClick={() => setMode('walk')}
            >
              <Footprints size={15} /> Walk
            </button>
            <button
              className={`de-chip-btn ${mode === 'orbit' ? 'active' : ''}`}
              onClick={() => setMode('orbit')}
            >
              <Orbit size={15} /> Orbit
            </button>
            <button
              className="de-chip-btn"
              onClick={reproject}
              disabled={projection.status === 'forming'}
            >
              <Clapperboard size={15} /> {projection.status === 'forming' ? 'Projecting…' : 'Re-project'}
            </button>
            {projection.status === 'ready' && (
              <button
                className={`de-chip-btn ${showScreen ? 'active' : ''}`}
                onClick={() => setShowScreen((s) => !s)}
              >
                {showScreen ? <Eye size={15} /> : <EyeOff size={15} />} Screen
              </button>
            )}
            <button className="de-chip-btn" onClick={newDream}>
              <RefreshCw size={15} /> New Dream
            </button>
            <Link href="/dream-engine/ar" className="de-chip-btn" aria-label="View in AR">
              🥽 AR
            </Link>
          </div>
        )}
      </header>

      {/* mood plaque */}
      {phase === 'dreaming' && (
        <div className="de-mood">
          <div className="de-mood-label">{scene.mood.label}</div>
          <div className="de-mood-reading">{scene.mood.reading}</div>
          <div className="de-mood-meta">
            {scene.environment.timeOfDay} · ground of {scene.environment.groundType}
          </div>
        </div>
      )}

      {note && <div className="de-note">{note}</div>}

      {/* projection forming shimmer chip */}
      {phase === 'dreaming' && projection.status === 'forming' && (
        <div className="de-proj-chip">
          <Loader2 className="de-spin" size={13} />
          <span>Projection forming…</span>
        </div>
      )}

      {/* dream projection — picture in picture */}
      {phase === 'dreaming' && projection.status === 'ready' && projection.videoUrl && (
        <div className="de-pip">
          <div className="de-pip-head">
            <Clapperboard size={12} /> DREAM PROJECTION
          </div>
          <video
            key={projection.videoUrl}
            src={projection.videoUrl}
            autoPlay
            loop
            muted
            playsInline
          />
        </div>
      )}

      {/* honest one-liner when the film could not be made */}
      {phase === 'dreaming' && projNote && (
        <div className="de-proj-note">{projNote}</div>
      )}

      {/* intro / start panel */}
      {phase === 'intro' && (
        <div className="de-intro-wrap">
          <section className="de-intro">
            <div className="de-intro-kicker"><Sparkles size={14} /> SANDBOX MODE</div>
            <h1 className="de-intro-h">Describe your dream.<br />Step inside it.</h1>
            <p className="de-intro-sub">
              The Interpreter shapes your words into a living 3D dreamscape — then you
              keep directing it while you walk: <em>“make the sky obsidian.”</em>
            </p>
            <textarea
              className="de-textarea"
              rows={4}
              maxLength={1200}
              placeholder="I was in a hallway that never ended. A clock was melting on the wall, and every door opened onto the sea…"
              value={dreamText}
              onChange={(e) => setDreamText(e.target.value)}
            />
            <div className="de-chips">
              {EXAMPLE_DREAMS.slice(0, 4).map((d) => (
                <button key={d} className="de-chip" onClick={() => setDreamText(d)}>
                  {d.length > 64 ? `${d.slice(0, 64)}…` : d}
                </button>
              ))}
            </div>
            <div className="de-intro-actions">
              <button className="de-cta" disabled={busy || !dreamText.trim()} onClick={() => beginDream(dreamText)}>
                {busy ? <Loader2 className="de-spin" size={18} /> : <Wand2 size={18} />}
                {busy ? busyLabel : 'Enter the Dream'}
              </button>
              <button className="de-ghost" disabled={busy} onClick={surprise}>
                <Shuffle size={16} /> Surprise Me
              </button>
            </div>
            {note && <div className="de-note inline">{note}</div>}
            <p className="de-intro-foot">WASD / arrows to walk · drag to look · Shift to hurry · touch joystick on mobile</p>
          </section>
        </div>
      )}

      {/* directing bar */}
      {phase === 'dreaming' && (
        <div className="de-direct-wrap">
          {log.length > 0 && (
            <div className="de-log">
              {log.map((l, i) => <div key={i} className="de-log-line">{l}</div>)}
            </div>
          )}
          <div className="de-direct">
            <Wand2 size={17} className="de-direct-icon" />
            <input
              className="de-command"
              maxLength={600}
              placeholder="Direct the dream… “make the sky obsidian”, “add a staircase to nowhere”"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') direct(); }}
            />
            <button className="de-send" disabled={busy || !command.trim()} onClick={direct}>
              {busy ? <Loader2 className="de-spin" size={16} /> : <Send size={16} />}
              {busy ? busyLabel.replace('…', '') : 'Direct'}
            </button>
          </div>
        </div>
      )}

      {/* touch joystick (walk mode, touch/small screens) */}
      {phase === 'dreaming' && mode === 'walk' && (
        <div
          ref={joyBase}
          className="de-joy"
          onPointerDown={(e) => { draggingJoy.current = true; joyStart(e); }}
          onPointerMove={joyMove}
          onPointerUp={joyEnd}
          onPointerCancel={joyEnd}
          onPointerLeave={joyEnd}
        >
          <div ref={joyKnob} className="de-joy-knob" />
        </div>
      )}

      <style jsx>{`
        .de-root {
          position: fixed; inset: 0; overflow: hidden;
          background: #07050f; color: #ece7ff;
          font-family: 'Segoe UI', system-ui, sans-serif;
        }
        .de-canvas { position: absolute; inset: 0; }
        .de-loading {
          height: 100%; display: flex; flex-direction: column; gap: 12px;
          align-items: center; justify-content: center; color: #b7a8ff;
          background: radial-gradient(ellipse at 50% 40%, #1b1440 0%, #07050f 70%);
        }
        .de-spin { animation: de-spin 1s linear infinite; }
        @keyframes de-spin { to { transform: rotate(360deg); } }
        .de-fade {
          position: absolute; inset: 0; pointer-events: none; z-index: 5;
          background: radial-gradient(ellipse at center, rgba(20,12,50,0) 30%, rgba(10,6,28,0.85) 100%);
          animation: de-fade-pulse 1s ease-out forwards;
        }
        @keyframes de-fade-pulse { 0% { opacity: 1; } 100% { opacity: 0; } }

        .de-topbar {
          position: absolute; top: 0; left: 0; right: 0; z-index: 10;
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px;
          background: rgba(7,5,15,0.97);
        }
        .de-back {
          display: flex; align-items: center; justify-content: center;
          width: 38px; height: 38px; border-radius: 12px; color: #cfc4ff;
          background: rgba(38,28,84,0.55); border: 1px solid rgba(150,130,255,0.35);
          backdrop-filter: blur(8px);
        }
        .de-title {
          display: flex; align-items: center; gap: 8px;
          font-family: Orbitron, 'Segoe UI', sans-serif; font-weight: 700;
          letter-spacing: 0.22em; font-size: 15px; color: #f3efff;
          text-shadow: 0 0 18px rgba(150,120,255,0.8);
        }
        .de-title-icon { color: #ffd98a; }
        .de-top-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .de-count { font-size: 12px; color: #a99ae0; letter-spacing: 0.08em; }
        .de-chip-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 12px; border-radius: 999px; font-size: 12.5px; font-weight: 600;
          color: #d9d0ff; background: rgba(38,28,84,0.55);
          border: 1px solid rgba(150,130,255,0.35); backdrop-filter: blur(8px);
          cursor: pointer; transition: all 0.2s;
        }
        .de-chip-btn:hover { border-color: rgba(255,217,138,0.7); color: #ffe9b0; }
        .de-chip-btn.active { background: rgba(255,217,138,0.16); border-color: #ffd98a; color: #ffd98a; }

        .de-mood {
          position: absolute; top: 68px; left: 14px; z-index: 9; max-width: min(360px, 78vw);
          padding: 12px 14px; border-radius: 16px;
          background: rgba(16,10,38,0.62); border: 1px solid rgba(150,130,255,0.28);
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.45);
        }
        .de-mood-label {
          font-family: Orbitron, sans-serif; font-size: 14px; letter-spacing: 0.14em;
          color: #ffd98a; text-transform: uppercase;
        }
        .de-mood-reading { margin-top: 4px; font-size: 13.5px; line-height: 1.45; color: #e6defc; font-style: italic; }
        .de-mood-meta { margin-top: 6px; font-size: 11px; letter-spacing: 0.1em; color: #9789c9; text-transform: uppercase; }

        .de-note {
          position: absolute; top: 68px; right: 14px; z-index: 11; max-width: min(340px, 80vw);
          padding: 10px 12px; border-radius: 12px; font-size: 13px; line-height: 1.4;
          background: rgba(64,20,40,0.75); border: 1px solid rgba(255,140,170,0.5); color: #ffd7e2;
          backdrop-filter: blur(8px);
        }
        .de-note.inline { position: static; max-width: none; margin-top: 12px; }

        .de-proj-chip {
          position: absolute; top: 66px; left: 50%; transform: translateX(-50%); z-index: 11;
          display: inline-flex; align-items: center; gap: 7px;
          padding: 7px 14px; border-radius: 999px; font-size: 12px; letter-spacing: 0.06em;
          color: #ffe9b0; border: 1px solid rgba(255,217,138,0.45);
          background: linear-gradient(110deg, rgba(38,28,84,0.85) 30%, rgba(96,74,190,0.9) 50%, rgba(38,28,84,0.85) 70%);
          background-size: 200% 100%;
          animation: de-shimmer 1.6s linear infinite;
          backdrop-filter: blur(8px); white-space: nowrap;
        }
        @keyframes de-shimmer { to { background-position: -200% 0; } }

        .de-pip {
          position: absolute; right: 14px; bottom: 118px; z-index: 10;
          width: 228px; border-radius: 14px; overflow: hidden;
          background: rgba(12,8,30,0.85); border: 1px solid rgba(255,217,138,0.5);
          box-shadow: 0 14px 44px rgba(0,0,0,0.6), 0 0 24px rgba(255,200,100,0.15);
          backdrop-filter: blur(10px);
          animation: de-fade-pulse 0.8s ease-out reverse;
        }
        .de-pip-head {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 10px; font-family: Orbitron, sans-serif;
          font-size: 9.5px; letter-spacing: 0.24em; color: #ffd98a;
          background: rgba(38,28,84,0.6);
        }
        .de-pip video { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: #000; }

        .de-proj-note {
          position: absolute; right: 14px; bottom: 118px; z-index: 10; max-width: min(300px, 80vw);
          padding: 8px 12px; border-radius: 10px; font-size: 12px; line-height: 1.4;
          color: #cfc4ff; background: rgba(16,10,38,0.78);
          border: 1px solid rgba(150,130,255,0.35); backdrop-filter: blur(8px);
        }

        .de-intro-wrap {
          position: absolute; inset: 0; z-index: 8; display: flex;
          align-items: flex-start; justify-content: center;
          padding: 76px 18px 18px;
          background: radial-gradient(ellipse at 50% 120%, rgba(30,20,80,0.25), rgba(4,2,10,0.55) 75%);
          overflow-y: auto;
        }
        .de-intro {
          width: min(620px, 100%); padding: 30px 30px 24px; border-radius: 26px;
          background: linear-gradient(160deg, rgba(26,18,64,0.88), rgba(10,7,28,0.92));
          border: 1px solid rgba(160,140,255,0.4);
          box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 24px 80px rgba(0,0,0,0.65), 0 0 60px rgba(110,80,255,0.22) inset;
          backdrop-filter: blur(14px);
        }
        .de-intro-kicker {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: Orbitron, sans-serif; font-size: 11px; letter-spacing: 0.3em; color: #ffd98a;
        }
        .de-intro-h {
          margin: 12px 0 8px; font-family: Orbitron, sans-serif; font-weight: 700;
          font-size: clamp(26px, 5vw, 38px); line-height: 1.15; color: #f6f2ff;
          text-shadow: 0 0 26px rgba(150,120,255,0.55);
        }
        .de-intro-sub { margin: 0 0 16px; font-size: 14.5px; line-height: 1.55; color: #c9bdf2; }
        .de-textarea {
          width: 100%; box-sizing: border-box; resize: vertical; min-height: 96px;
          padding: 14px; border-radius: 16px; font-size: 15px; line-height: 1.5;
          color: #f2edff; background: rgba(7,5,20,0.75);
          border: 1px solid rgba(150,130,255,0.4); outline: none;
        }
        .de-textarea:focus { border-color: #ffd98a; box-shadow: 0 0 0 3px rgba(255,217,138,0.18); }
        .de-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .de-chip {
          padding: 7px 11px; border-radius: 999px; font-size: 12px; text-align: left;
          color: #cfc4ff; background: rgba(52,38,110,0.5);
          border: 1px solid rgba(150,130,255,0.3); cursor: pointer; transition: all 0.2s;
        }
        .de-chip:hover { border-color: #ffd98a; color: #ffe9b0; }
        .de-intro-actions { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
        .de-cta {
          display: inline-flex; align-items: center; gap: 9px;
          padding: 14px 22px; border-radius: 16px; font-size: 15px; font-weight: 700;
          font-family: Orbitron, sans-serif; letter-spacing: 0.06em;
          color: #1a1030; background: linear-gradient(135deg, #ffd98a, #ffb35c);
          border: none; cursor: pointer; box-shadow: 0 8px 30px rgba(255,180,90,0.35);
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .de-cta:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 36px rgba(255,180,90,0.5); }
        .de-cta:disabled { opacity: 0.55; cursor: wait; }
        .de-ghost {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 14px 18px; border-radius: 16px; font-size: 14px; font-weight: 600;
          color: #d9d0ff; background: rgba(38,28,84,0.5);
          border: 1px solid rgba(150,130,255,0.4); cursor: pointer;
        }
        .de-ghost:hover:not(:disabled) { border-color: #ffd98a; color: #ffe9b0; }
        .de-intro-foot { margin: 16px 0 0; font-size: 12px; color: #8d7fc0; letter-spacing: 0.04em; }

        .de-direct-wrap {
          position: absolute; left: 0; right: 0; bottom: 0; z-index: 10;
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 10px 14px calc(12px + env(safe-area-inset-bottom));
          background: linear-gradient(0deg, rgba(7,5,15,0.88), rgba(7,5,15,0));
        }
        .de-log { width: min(680px, 100%); display: flex; flex-direction: column; gap: 2px; }
        .de-log-line {
          font-size: 11.5px; color: #a99ae0; white-space: nowrap; overflow: hidden;
          text-overflow: ellipsis; opacity: 0.85;
        }
        .de-direct {
          width: min(680px, 100%); display: flex; align-items: center; gap: 10px;
          padding: 8px 8px 8px 14px; border-radius: 18px;
          background: rgba(16,10,38,0.78); border: 1px solid rgba(150,130,255,0.4);
          backdrop-filter: blur(12px); box-shadow: 0 12px 40px rgba(0,0,0,0.5);
        }
        .de-direct-icon { color: #ffd98a; flex-shrink: 0; }
        .de-command {
          flex: 1; min-width: 0; background: transparent; border: none; outline: none;
          color: #f2edff; font-size: 14.5px;
        }
        .de-command::placeholder { color: #7d6fb3; }
        .de-send {
          display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0;
          padding: 10px 16px; border-radius: 12px; font-weight: 700; font-size: 13.5px;
          font-family: Orbitron, sans-serif; letter-spacing: 0.05em;
          color: #1a1030; background: linear-gradient(135deg, #ffd98a, #ffb35c);
          border: none; cursor: pointer;
        }
        .de-send:disabled { opacity: 0.5; cursor: wait; }

        .de-joy {
          position: absolute; left: 18px; bottom: 96px; z-index: 10;
          width: 108px; height: 108px; border-radius: 50%;
          background: rgba(30,22,70,0.4); border: 1px solid rgba(150,130,255,0.45);
          backdrop-filter: blur(6px); display: none;
          align-items: center; justify-content: center; touch-action: none;
        }
        .de-joy-knob {
          width: 48px; height: 48px; border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #cfc0ff, #6a54c9);
          box-shadow: 0 4px 16px rgba(0,0,0,0.5);
          pointer-events: none;
        }
        @media (pointer: coarse) { .de-joy { display: flex; } }
        @media (max-width: 640px) {
          .de-mood { top: 62px; }
          .de-count { display: none; }
          .de-intro { padding: 22px 18px 18px; }
          .de-pip { width: 168px; bottom: 108px; }
          .de-proj-note { bottom: 108px; }
        }
      `}</style>
      <MuseEngineChat engine="dream-engine" title="Dream Engine"
        context={{ dreamText, mode, projectionStatus: projection.status }} accent="#a855f7" />
    </main>
  );
}
