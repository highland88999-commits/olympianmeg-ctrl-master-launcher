'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MODE_LABEL,
  PERSONA,
  createState,
  parseCommand,
  executeCommand,
  suggestCommands,
} from './engine';

const ACCENT = '#00e5c0';
const INK = '#d7f5ee';

function hasSpeechRecognition() {
  if (typeof window === 'undefined') return false;
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

function hasSpeechSynthesis() {
  if (typeof window === 'undefined') return false;
  return 'speechSynthesis' in window;
}

/* Procedural "signal" canvas: concentric rings whose ripple responds to
 * voice/demo activity. No video, no images. Glow stays localized. */
function SignalCanvas({ active }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    let raf = 0;
    let t = 0;
    const reduced = typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function size() {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, r.width * dpr);
      canvas.height = Math.max(1, r.height * dpr);
    }
    size();
    window.addEventListener('resize', size);

    function draw() {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(w, h) * 0.46;
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < 7; i += 1) {
        const base = maxR * (0.18 + (i / 7) * 0.72);
        const wobble = active
          ? Math.sin(t * 3 + i * 0.9) * maxR * 0.05
          : Math.sin(t * 0.6 + i) * maxR * 0.008;
        const r = base + wobble;
        const alpha = active ? 0.5 - i * 0.055 : 0.28 - i * 0.03;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 229, 192, ${Math.max(0.05, alpha).toFixed(3)})`;
        ctx.lineWidth = (active ? 2.4 : 1.4) * dpr;
        ctx.stroke();
      }

      // Center dot with a small, localized glow.
      const pulse = active ? 0.5 + 0.5 * Math.sin(t * 4) : 0.25 + 0.1 * Math.sin(t);
      ctx.beginPath();
      ctx.arc(cx, cy, 6 * dpr * (1 + pulse * 0.4), 0, Math.PI * 2);
      ctx.fillStyle = '#00e5c0';
      ctx.shadowColor = 'rgba(0, 229, 192, 0.55)';
      ctx.shadowBlur = 14 * dpr;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (!reduced) {
        t += 1 / 60;
        raf = requestAnimationFrame(draw);
      }
    }
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
  }, [active]);

  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden="true" />;
}

const KIND_COLOR = { sys: '#8fd8ff', out: INK, err: '#ffb3a7' };

function ConsoleLine({ item }) {
  return (
    <div style={{ color: KIND_COLOR[item.kind] || INK, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {item.text}
    </div>
  );
}

export default function ArchitectArtemisPage() {
  const router = useRouter();
  const [lines, setLines] = useState(() => [
    { text: 'Architect Artemis console. Type "help" to begin.', kind: 'sys' },
    { text: MODE_LABEL, kind: 'sys' },
  ]);
  const [input, setInput] = useState('');
  const [micOn, setMicOn] = useState(false);
  const [speakOn, setSpeakOn] = useState(false);
  const [state] = useState(createState);
  const [listening, setListening] = useState(false);
  const recogRef = useRef(null);
  const logRef = useRef(null);

  const voiceInput = hasSpeechRecognition();
  const voiceOutput = hasSpeechSynthesis();

  const pushLines = useCallback((newLines) => {
    setLines((prev) => [...prev, ...newLines].slice(-400));
  }, []);

  const say = useCallback(
    (text) => {
      if (!speakOn || !voiceOutput) return;
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      } catch (e) {
        /* speech unavailable; stay silent */
      }
    },
    [speakOn, voiceOutput]
  );

  const run = useCallback(
    (rawText) => {
      const parsed = parseCommand(rawText);
      if (!parsed.command) return;
      pushLines([{ text: `› ${parsed.raw}`, kind: 'sys' }]);
      const result = executeCommand(state, parsed, {
        voiceInput,
        voiceOutput,
        micOn,
        speakOn,
        now: new Date(),
      });
      if (result.lines.length) {
        pushLines(result.lines);
        say(result.lines.filter((l) => l.kind !== 'sys').map((l) => l.text).join(' ').slice(0, 400));
      }
      const action = result.action;
      if (!action) return;
      if (action.type === 'navigate') router.push(action.to);
      else if (action.type === 'clear') setLines([]);
      else if (action.type === 'mic') setMicOn(action.on);
      else if (action.type === 'speak') setSpeakOn(action.on);
    },
    [pushLines, router, say, state, voiceInput, voiceOutput, micOn, speakOn]
  );

  // Microphone lifecycle: guarded, only while the user leaves it on.
  useEffect(() => {
    if (!micOn || !voiceInput) {
      setListening(false);
      if (recogRef.current) {
        try { recogRef.current.stop(); } catch (e) {}
        recogRef.current = null;
      }
      return undefined;
    }
    try {
      const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recog = new Ctor();
      recog.lang = 'en-US';
      recog.interimResults = false;
      recog.onresult = (e) => {
        const text = e.results[e.results.length - 1][0].transcript;
        run(text);
      };
      recog.onend = () => {
        // Keep listening while the mic stays on.
        if (recogRef.current) {
          try { recog.start(); } catch (e) {}
        }
      };
      recog.onerror = () => setMicOn(false);
      recogRef.current = recog;
      recog.start();
      setListening(true);
    } catch (e) {
      setMicOn(false);
    }
    return () => {
      if (recogRef.current) {
        try { recogRef.current.stop(); } catch (e2) {}
        recogRef.current = null;
      }
    };
  }, [micOn, voiceInput, run]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const onSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    setInput('');
    if (text) run(text);
  };

  return (
    <main style={styles.page}>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .aa-pulse { animation: none !important; }
        }
      `}</style>

      <header style={styles.header}>
        <a href="/" style={styles.backLink}>← Launcher</a>
        <div style={styles.titleBlock}>
          <h1 style={styles.title}>Architect Artemis</h1>
          <p style={styles.subtitle}>{PERSONA.tagline}</p>
        </div>
        <span style={styles.badge} className="aa-pulse">{MODE_LABEL}</span>
      </header>

      <section style={styles.grid}>
        <div style={styles.visualWrap} aria-label="Procedural signal visualization">
          <SignalCanvas active={listening || speakOn} />
        </div>

        <aside style={styles.panel}>
          <h2 style={styles.panelTitle}>What this is</h2>
          <p style={styles.panelText}>{PERSONA.description}</p>
          <ul style={styles.list}>
            {PERSONA.principles.map((p) => (
              <li key={p} style={styles.listItem}>{p}</li>
            ))}
          </ul>
          <h3 style={styles.panelTitle}>Voice tools</h3>
          <p style={styles.panelText}>
            Voice input: {voiceInput ? 'available in this browser' : 'not available in this browser'}.
            Spoken replies: {voiceOutput ? 'available' : 'not available'}.
          </p>
          <div style={styles.toggleRow}>
            <button
              type="button"
              onClick={() => setMicOn((v) => !v)}
              disabled={!voiceInput}
              style={{ ...styles.btn, ...(micOn ? styles.btnActive : null) }}
            >
              {micOn ? 'Mic: on' : 'Mic: off'}
            </button>
            <button
              type="button"
              onClick={() => setSpeakOn((v) => !v)}
              disabled={!voiceOutput}
              style={{ ...styles.btn, ...(speakOn ? styles.btnActive : null) }}
            >
              {speakOn ? 'Spoken replies: on' : 'Spoken replies: off'}
            </button>
          </div>
          {!voiceInput && (
            <p style={styles.note}>Your browser does not expose speech recognition here — typed commands work everywhere.</p>
          )}
        </aside>
      </section>

      <section style={styles.console} aria-label="Command console">
        <div ref={logRef} style={styles.log} role="log" aria-live="polite">
          {lines.map((l, i) => (
            <ConsoleLine key={i} item={l} />
          ))}
        </div>
        <form onSubmit={onSubmit} style={styles.form}>
          <span style={styles.prompt} aria-hidden="true">›</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Type a command — try "help"'
            aria-label="Command input"
            style={styles.input}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" style={styles.btn}>Send</button>
        </form>
        {listening && <p style={styles.note}>Listening… speak a command, or turn the mic off above.</p>}
      </section>

      <footer style={styles.footer}>
        <p>Everything on this page runs on your device. No account, no uploads, no model calls.</p>
      </footer>
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100dvh',
    background: '#04110e',
    color: INK,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    padding: '20px 16px 32px',
    maxWidth: '980px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '20px',
  },
  backLink: { color: ACCENT, textDecoration: 'none', fontSize: '14px' },
  titleBlock: { flex: '1 1 220px' },
  title: { margin: 0, fontSize: '28px', letterSpacing: '1px', color: '#ffffff' },
  subtitle: { margin: '4px 0 0', fontSize: '13px', color: '#9fd8cc' },
  badge: {
    fontSize: '12px',
    border: `1px solid ${ACCENT}`,
    borderRadius: '999px',
    padding: '6px 12px',
    color: ACCENT,
    animation: 'aaPulse 2.6s ease-in-out infinite',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px',
    marginBottom: '20px',
  },
  visualWrap: {
    minHeight: '260px',
    border: `1px solid rgba(0, 229, 192, 0.35)`,
    borderRadius: '12px',
    overflow: 'hidden',
    background: 'radial-gradient(circle at 50% 50%, #06231d 0%, #04110e 70%)',
  },
  panel: {
    border: `1px solid rgba(0, 229, 192, 0.35)`,
    borderRadius: '12px',
    padding: '16px',
    background: 'rgba(6, 35, 29, 0.55)',
  },
  panelTitle: { margin: '0 0 8px', fontSize: '15px', color: '#ffffff' },
  panelText: { margin: '0 0 12px', fontSize: '13px', lineHeight: 1.6, color: '#bfe9df' },
  list: { margin: '0 0 16px', paddingLeft: '20px', fontSize: '13px', lineHeight: 1.7, color: '#bfe9df' },
  listItem: { marginBottom: '4px' },
  toggleRow: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  note: { fontSize: '12px', color: '#8fd8ff', margin: '10px 0 0', lineHeight: 1.5 },
  console: {
    border: `1px solid rgba(0, 229, 192, 0.35)`,
    borderRadius: '12px',
    background: '#020a08',
    overflow: 'hidden',
  },
  log: {
    height: 'min(46vh, 380px)',
    overflowY: 'auto',
    padding: '14px',
    fontSize: '13.5px',
    lineHeight: 1.65,
  },
  form: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderTop: '1px solid rgba(0,229,192,0.25)' },
  prompt: { color: ACCENT, fontWeight: 'bold' },
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#ffffff',
    fontSize: '15px',
    fontFamily: 'inherit',
    minHeight: '44px',
  },
  btn: {
    background: 'rgba(0, 229, 192, 0.12)',
    border: `1px solid ${ACCENT}`,
    color: ACCENT,
    borderRadius: '8px',
    padding: '10px 16px',
    minHeight: '44px',
    cursor: 'pointer',
    fontSize: '14px',
    fontFamily: 'inherit',
  },
  btnActive: { background: ACCENT, color: '#04110e', fontWeight: 'bold' },
  footer: { marginTop: '18px', fontSize: '12px', color: '#6fa89c', lineHeight: 1.6 },
};
