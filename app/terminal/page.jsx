'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import engine from './engine.js';

const { createState, runCommand, promptFor, serialize, deserialize } = engine;

const THEMES = {
  neon: { fg: '#39ff14', accent: '#00f9ff', prompt: '#00f9ff', name: 'neon' },
  amber: { fg: '#ffb000', accent: '#ff7b00', prompt: '#ffd23f', name: 'amber' },
  ghost: { fg: '#c9d6e8', accent: '#8fa3c7', prompt: '#e8eefc', name: 'ghost' },
};

const CSS = `
.ns-mono { font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace; }
.ns-term {
  background-color: #050505;
  background-image:
    linear-gradient(rgba(57,255,20,0.030) 1px, transparent 1px),
    linear-gradient(90deg, rgba(57,255,20,0.015) 1px, transparent 1px);
  background-size: 100% 3px, 4px 100%;
}
.ns-scan { position: relative; }
.ns-scan::after {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 1;
  background: linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.18) 51%);
  background-size: 100% 4px;
}
.ns-crt { position: relative; }
.ns-crt::before {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 2;
  background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.35) 100%);
  border-radius: inherit;
}
.ns-line { white-space: pre-wrap; word-break: break-word; line-height: 1.5; }
.ns-input { caret-color: currentColor; }
.ns-scroll::-webkit-scrollbar { width: 6px; }
.ns-scroll::-webkit-scrollbar-track { background: transparent; }
.ns-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 6px; }
.ns-blink { animation: ns-blink 1.1s steps(2) infinite; }
@keyframes ns-blink { 50% { opacity: 0; } }
.ns-fs { position: fixed !important; inset: 0 !important; z-index: 60 !important; border-radius: 0 !important; }
`;

function loadState() {
  try {
    const raw = localStorage.getItem('neon-shell-state');
    if (raw) return deserialize(raw);
  } catch (e) { /* fresh shell */ }
  return createState();
}

export default function TerminalPage() {
  const [theme, setTheme] = useState('neon');
  const [lines, setLines] = useState([]);
  const [input, setInput] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [editor, setEditor] = useState(null); // { path, content }
  const [fx, setFx] = useState(null); // 'matrix' | 'hack'
  const [ready, setReady] = useState(false);

  const shellRef = useRef(null);
  const histIdxRef = useRef(0);
  const termRef = useRef(null);
  const inputRef = useRef(null);
  const t = THEMES[theme] || THEMES.neon;

  const pushLines = useCallback((newLines) => {
    setLines((prev) => [...prev, ...newLines].slice(-500));
  }, []);

  const save = useCallback(() => {
    try {
      if (shellRef.current) localStorage.setItem('neon-shell-state', serialize(shellRef.current));
    } catch (e) { /* storage full or unavailable */ }
  }, []);

  // Boot
  useEffect(() => {
    const s = loadState();
    shellRef.current = s;
    histIdxRef.current = s.history.length;
    setTheme(s.theme || 'neon');
    setLines([
      { text: 'NEON SHELL v' + engine.VERSION + ' — POCKET CONSOLE INITIALIZED', cls: 'accent' },
      { text: 'Zero network. Files stay on this device. Type "help".', cls: 'dim' },
      { text: '', cls: '' },
    ]);
    setReady(true);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = termRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, fx]);

  const focusInput = () => { if (inputRef.current) inputRef.current.focus(); };

  const exec = (raw) => {
    const s = shellRef.current;
    if (!s) return;
    const prompt = promptFor(s);
    pushLines([{ text: prompt + ' ' + raw, cls: 'prompt' }]);
    const res = runCommand(s, raw);
    histIdxRef.current = s.history.length;
    if (res.action && res.action.type === 'clear') {
      setLines([]);
    } else if (res.action && res.action.type === 'edit') {
      const rp = engine.resolvePath(s, res.action.path);
      setEditor({ path: res.action.path, content: rp.node && rp.node.type === 'file' ? rp.node.content || '' : '' });
    } else if (res.action && res.action.type === 'fx') {
      setFx(res.action.fx);
    }
    if (res.action && res.action.type === 'theme') setTheme(res.action.theme);
    pushLines(res.lines);
    save();
  };

  const onKeyDown = (e) => {
    const s = shellRef.current;
    if (e.key === 'Enter') {
      exec(input);
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (s && histIdxRef.current > 0) {
        histIdxRef.current -= 1;
        setInput(s.history[histIdxRef.current] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (s) {
        if (histIdxRef.current < s.history.length - 1) {
          histIdxRef.current += 1;
          setInput(s.history[histIdxRef.current] || '');
        } else {
          histIdxRef.current = s.history.length;
          setInput('');
        }
      }
    }
  };

  const quick = (cmd) => { exec(cmd); focusInput(); };

  const saveEditor = () => {
    const s = shellRef.current;
    if (s && editor) {
      const rp = engine.resolvePath(s, editor.path);
      if (rp.node && rp.node.type === 'file') rp.node.content = editor.content;
      pushLines([{ text: 'saved ' + editor.path, cls: 'ok' }]);
      save();
    }
    setEditor(null);
    focusInput();
  };

  const clsColor = (cls) => {
    switch (cls) {
      case 'err': return { color: '#ff5555', textShadow: '0 0 6px rgba(255,85,85,0.45)' };
      case 'ok': return { color: t.fg, textShadow: '0 0 6px rgba(57,255,20,0.35)' };
      case 'info': case 'accent': return { color: t.accent };
      case 'warn': return { color: '#ffaa00' };
      case 'dim': return { color: 'rgba(255,255,255,0.45)' };
      case 'prompt': return { color: t.prompt, fontWeight: 700 };
      default: return { color: t.fg };
    }
  };

  return (
    <div className="ns-mono min-h-dvh text-sm" style={{ background: '#0a0a0f', color: t.fg }}>
      <style>{CSS}</style>

      {/* Header */}
      <header className="border-b px-4 sm:px-6 py-4 flex items-center justify-between gap-3 sticky top-0 z-30"
        style={{ borderColor: t.accent + '33', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded border flex items-center justify-center shrink-0"
            style={{ borderColor: t.accent, boxShadow: '0 0 10px ' + t.accent + '44' }}>
            <span style={{ color: t.accent, fontSize: 20 }}>▣</span>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-white"
              style={{ textShadow: '0 0 8px ' + t.accent + '66' }}>NEON SHELL</div>
            <div className="text-[10px] tracking-[3px]" style={{ color: t.accent + 'aa' }}>v{engine.VERSION} • LOCAL CONSOLE</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="hidden sm:inline px-2 py-1 rounded border border-white/15 text-white/60">OFFLINE</span>
          <button onClick={() => setFullscreen((f) => !f)}
            className="px-3 py-1.5 rounded border transition hover:bg-white/10"
            style={{ borderColor: t.accent + '66', color: t.accent }}>
            {fullscreen ? 'EXIT FULL' : 'FULLSCREEN'}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-6 py-5 pb-10">
        {/* Terminal frame */}
        <div className={(fullscreen ? 'ns-fs ' : '') + 'rounded-2xl border overflow-hidden flex flex-col ns-crt'}
          style={{ borderColor: t.accent + '55', background: '#050505', boxShadow: '0 0 24px ' + t.accent + '22' }}>

          <div className="px-4 py-2.5 flex items-center justify-between border-b shrink-0"
            style={{ borderColor: t.accent + '33', background: '#101012' }}>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: t.fg }} />
              <span className="ml-2 text-[10px] tracking-[0.25em] text-white/50 hidden sm:inline">LOCAL SESSION</span>
            </div>
            <div className="text-[10px]" style={{ color: t.accent + 'aa' }}>
              {shellRef.current ? promptFor(shellRef.current) : ''}
            </div>
          </div>

          <div ref={termRef} onClick={focusInput}
            className="ns-term ns-scan ns-scroll overflow-y-auto p-4 sm:p-5 h-[52dvh] sm:h-[56dvh] cursor-text">
            {!ready && <div className="ns-line" style={{ color: t.fg }}>booting…</div>}
            {lines.map((l, i) => (
              <div key={i} className="ns-line" style={clsColor(l.cls)}>{l.text || ' '}</div>
            ))}
            <div className="ns-line"><span className="ns-blink" style={{ color: t.fg }}>▊</span></div>
          </div>

          <div className="border-t px-4 py-3 flex items-center gap-2 shrink-0"
            style={{ borderColor: t.accent + '44', background: '#000' }}>
            <span className="font-bold text-sm shrink-0 break-all" style={{ color: t.prompt }}>
              {shellRef.current ? promptFor(shellRef.current) : '$'}
            </span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              className="ns-input ns-mono flex-1 min-w-0 bg-transparent outline-none text-sm sm:text-base"
              style={{ color: t.fg }}
              placeholder="type a command…"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-label="terminal input"
            />
          </div>
        </div>

        {/* Quick commands */}
        <div className="mt-4 grid grid-cols-3 sm:grid-cols-7 gap-2 text-xs">
          {[
            ['ls', 'ls'], ['help', 'help'], ['neofetch', 'neofetch'],
            ['nano', 'nano notes.txt'], ['matrix', 'matrix'], ['hack', 'hack'], ['clear', 'clear'],
          ].map(([label, cmd]) => (
            <button key={label} onClick={() => quick(cmd)}
              className="px-2 py-2.5 rounded border border-white/10 bg-black/60 hover:bg-white/5 transition text-white/80">
              {label}
            </button>
          ))}
        </div>

        <p className="mt-4 text-[11px] text-white/35">
          Files persist in this browser only. Nothing is sent anywhere — this console has no network code at all.
        </p>
        <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))]" />
      </main>

      {/* Editor overlay */}
      {editor && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(3,3,6,0.96)' }}>
          <div className="px-4 py-2 border-b flex items-center justify-between"
            style={{ borderColor: t.accent + '44', background: '#101012' }}>
            <span className="text-xs font-bold tracking-widest truncate" style={{ color: t.accent }}>
              NANO: {editor.path}
            </span>
            <div className="flex gap-2">
              <button onClick={() => { setEditor(null); focusInput(); }}
                className="text-xs px-3 py-1.5 border border-white/25 rounded text-white/70">cancel</button>
              <button onClick={saveEditor}
                className="text-xs px-4 py-1.5 rounded font-bold text-black"
                style={{ background: t.accent }}>save</button>
            </div>
          </div>
          <textarea
            value={editor.content}
            onChange={(e) => setEditor({ ...editor, content: e.target.value })}
            className="ns-mono ns-scroll flex-1 bg-transparent outline-none p-4 text-sm resize-none"
            style={{ color: t.fg }}
            spellCheck={false}
            autoFocus
          />
        </div>
      )}

      {/* FX overlays */}
      {fx === 'matrix' && <MatrixFx color={t.fg} onClose={() => { setFx(null); focusInput(); }} />}
      {fx === 'hack' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.9)' }}>
          <div className="text-center">
            <div className="text-2xl font-bold mb-2" style={{ color: t.fg }}>ACCESS GRANTED (not really)</div>
            <div className="text-white/50 text-sm mb-6">It was all local. Close this and keep typing.</div>
            <button onClick={() => { setFx(null); focusInput(); }}
              className="px-6 py-2.5 rounded border font-bold"
              style={{ borderColor: t.accent, color: t.accent }}>CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MatrixFx({ color, onClose }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let w, h, cols, drops;
    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      cols = Math.floor(w / 18);
      drops = Array(cols).fill(0).map(() => Math.random() * -50);
    };
    resize();
    window.addEventListener('resize', resize);
    const glyphs = 'アイカサタナハマヤラワ0123456789$#@%&';
    let raf;
    const tick = () => {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = color;
      ctx.font = '16px monospace';
      for (let i = 0; i < cols; i++) {
        const ch = glyphs[Math.floor(Math.random() * glyphs.length)];
        ctx.fillText(ch, i * 18, drops[i] * 18);
        if (drops[i] * 18 > h && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [color]);
  return (
    <div className="fixed inset-0 z-50">
      <canvas ref={canvasRef} className="w-full h-full" />
      <button onClick={onClose}
        className="absolute top-4 right-4 px-4 py-2 rounded border bg-black/70 text-sm font-bold"
        style={{ borderColor: color, color }}>EXIT STREAM</button>
    </div>
  );
}
