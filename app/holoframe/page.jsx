'use client';

import { useEffect, useRef, useState } from 'react';
import shellEngine from '../terminal/engine.js';
import { responsiveScale, layoutMonitors, statusLabel, MODES } from './array.js';

const { createState, runCommand, promptFor, resolvePath } = shellEngine;

const ACCENTS = ['#00ffff', '#ff00aa', '#39ff14', '#ffaa00', '#9d00ff', '#00f9ff', '#ff5555', '#7dcfff'];
const MAX_MONITORS = 8;

const CSS = `
.hf-mono { font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace; }
.hf-stage { perspective: 1600px; perspective-origin: 50% 45%; }
.hf-monitor { position: absolute; left: 50%; top: 46%; transform-style: preserve-3d; will-change: transform; }
.hf-frame {
  border: 2px solid #00ffff; border-radius: 18px; overflow: hidden;
  background: rgba(0, 12, 24, 0.72); backdrop-filter: blur(6px);
  animation: hf-cycle 18s infinite ease-in-out;
}
@keyframes hf-cycle {
  0%, 100% { border-color: #00ffff; box-shadow: 0 0 22px rgba(0,255,255,0.30), inset 0 0 14px rgba(0,255,255,0.12); }
  25% { border-color: #9d00ff; box-shadow: 0 0 22px rgba(157,0,255,0.30), inset 0 0 14px rgba(157,0,255,0.12); }
  50% { border-color: #ff007f; box-shadow: 0 0 22px rgba(255,0,127,0.30), inset 0 0 14px rgba(255,0,127,0.12); }
  75% { border-color: #39ff14; box-shadow: 0 0 22px rgba(57,255,20,0.30), inset 0 0 14px rgba(57,255,20,0.12); }
}
.hf-scan { position: relative; }
.hf-scan::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.16) 51%);
  background-size: 100% 4px;
}
.hf-scroll::-webkit-scrollbar { width: 5px; }
.hf-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 5px; }
.hf-line { white-space: pre-wrap; word-break: break-word; line-height: 1.45; }
.hf-input { caret-color: currentColor; }
`;

function loadPrefs() {
  try {
    const raw = localStorage.getItem('holoframe-prefs');
    if (raw) {
      const p = JSON.parse(raw);
      return {
        mode: MODES.includes(p.mode) ? p.mode : 'single',
        count: Math.min(MAX_MONITORS, Math.max(1, parseInt(p.count, 10) || 3)),
      };
    }
  } catch (e) { /* defaults */ }
  return { mode: 'single', count: 3 };
}

// ---------- starfield backdrop ----------
function Starfield() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let w, h, stars, raf;
    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      stars = Array.from({ length: Math.min(220, Math.floor(w * h / 9000)) }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() * 1.4 + 0.3, s: Math.random() * 0.25 + 0.05,
        tw: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener('resize', resize);
    const tick = (ts) => {
      ctx.fillStyle = '#030307';
      ctx.fillRect(0, 0, w, h);
      const t = ts / 1000;
      for (const st of stars) {
        st.y += st.s;
        if (st.y > h) st.y = 0;
        const a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2 + st.tw));
        ctx.fillStyle = 'rgba(120,220,255,' + a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    tick(0);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="fixed inset-0 w-full h-full" style={{ zIndex: -1, opacity: 0.85 }} aria-hidden />;
}

// ---------- one interactive shell inside one monitor ----------
function MiniShell({ nodeIndex, accent }) {
  const shellRef = useRef(null);
  const [lines, setLines] = useState([]);
  const [input, setInput] = useState('');
  const [editor, setEditor] = useState(null);
  const histIdx = useRef(0);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const s = createState();
    s.user = 'node' + String(nodeIndex + 1).padStart(2, '0');
    shellRef.current = s;
    histIdx.current = 0;
    setLines([
      { text: statusLabel(nodeIndex) + ' // SHELL READY', cls: 'accent' },
      { text: 'type "help" — every monitor is its own console.', cls: 'dim' },
    ]);
  }, [nodeIndex]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const clsColor = (cls) => {
    if (cls === 'err') return '#ff5555';
    if (cls === 'ok') return accent;
    if (cls === 'accent' || cls === 'info' || cls === 'prompt') return accent;
    if (cls === 'warn') return '#ffaa00';
    if (cls === 'dim') return 'rgba(255,255,255,0.45)';
    return '#d7f7ff';
  };

  const exec = (raw) => {
    const s = shellRef.current;
    if (!s) return;
    const trimmed = raw.trim();
    setLines((prev) => [...prev, { text: promptFor(s) + ' ' + raw, cls: 'prompt' }].slice(-300));
    if (!trimmed) return;
    const res = runCommand(s, trimmed);
    histIdx.current = s.history.length;
    let extra = [];
    if (res.action && res.action.type === 'edit') {
      const rp = resolvePath(s, res.action.path);
      setEditor({ path: res.action.path, content: rp.node && rp.node.type === 'file' ? rp.node.content || '' : '' });
    } else if (res.action && res.action.type === 'fx' && res.action.fx === 'matrix') {
      const glyphs = '01アイカサタナ$#@%&';
      extra = Array.from({ length: 5 }, () =>
        ({ text: Array.from({ length: 42 }, () => glyphs[Math.floor(Math.random() * glyphs.length)]).join(''), cls: 'ok' }));
    }
    if (res.action && res.action.type === 'clear') setLines([]);
    else setLines((prev) => [...prev, ...res.lines, ...extra].slice(-300));
  };

  const onKey = (e) => {
    const s = shellRef.current;
    if (e.key === 'Enter') { exec(input); setInput(''); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (s && histIdx.current > 0) { histIdx.current -= 1; setInput(s.history[histIdx.current] || ''); }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (s) {
        if (histIdx.current < s.history.length - 1) { histIdx.current += 1; setInput(s.history[histIdx.current] || ''); }
        else { histIdx.current = s.history.length; setInput(''); }
      }
    }
  };

  const saveEditor = () => {
    const s = shellRef.current;
    if (s && editor) {
      const rp = resolvePath(s, editor.path);
      if (rp.node && rp.node.type === 'file') rp.node.content = editor.content;
      setLines((prev) => [...prev, { text: 'saved ' + editor.path, cls: 'ok' }]);
    }
    setEditor(null);
  };

  return (
    <div className="relative w-full h-full flex flex-col" onClick={() => inputRef.current && inputRef.current.focus()}>
      <div ref={bodyRef} className="hf-scroll flex-1 overflow-y-auto px-3 py-2 text-[11px] sm:text-xs cursor-text">
        {lines.map((l, i) => (
          <div key={i} className="hf-line" style={{ color: clsColor(l.cls) }}>{l.text || ' '}</div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 px-3 py-2 border-t border-white/10 shrink-0">
        <span className="text-[11px] font-bold truncate" style={{ color: accent }}>
          {shellRef.current ? promptFor(shellRef.current) : '$'}
        </span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          className="hf-input hf-mono flex-1 min-w-0 bg-transparent outline-none text-[11px] sm:text-xs text-white"
          autoComplete="off" autoCapitalize="off" spellCheck={false}
          aria-label={'monitor ' + (nodeIndex + 1) + ' input'}
        />
      </div>
      {editor && (
        <div className="absolute inset-0 z-10 flex flex-col" style={{ background: 'rgba(2,6,12,0.97)' }}>
          <div className="px-3 py-1.5 flex items-center justify-between border-b border-white/10">
            <span className="text-[10px] font-bold tracking-widest truncate" style={{ color: accent }}>NANO: {editor.path}</span>
            <div className="flex gap-1.5">
              <button onClick={(e) => { e.stopPropagation(); setEditor(null); }} className="text-[10px] px-2 py-1 border border-white/25 rounded text-white/70">x</button>
              <button onClick={(e) => { e.stopPropagation(); saveEditor(); }} className="text-[10px] px-2.5 py-1 rounded font-bold text-black" style={{ background: accent }}>save</button>
            </div>
          </div>
          <textarea value={editor.content} onChange={(e) => setEditor({ ...editor, content: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="hf-mono hf-scroll flex-1 bg-transparent outline-none p-3 text-xs resize-none text-white" spellCheck={false} autoFocus />
        </div>
      )}
    </div>
  );
}

// ---------- the 3D array page ----------
export default function HoloframePage() {
  const [prefs, setPrefs] = useState({ mode: 'single', count: 3 });
  const [angle, setAngle] = useState(0);
  const [ready, setReady] = useState(false);
  const stageRef = useRef(null);
  const monitorsRef = useRef([]); // { cur: {x,y,z,rotY,scale}, el }
  const targetRef = useRef([]);

  useEffect(() => {
    setPrefs(loadPrefs());
    setReady(true);
  }, []);

  useEffect(() => {
    try { localStorage.setItem('holoframe-prefs', JSON.stringify(prefs)); } catch (e) { /* ignore */ }
    targetRef.current = layoutMonitors(prefs.mode, prefs.count, angle, responsiveScale(window.innerWidth, window.innerHeight - 76));
    // init current transforms on first run
    monitorsRef.current.forEach((m, i) => {
      if (m && !m.cur) {
        const tg = targetRef.current[i];
        m.cur = { ...tg, scale: 0 };
      }
    });
  }, [prefs, angle]);

  // float + lerp loop
  useEffect(() => {
    if (!ready) return;
    let raf;
    const t0 = Date.now();
    const tick = () => {
      const time = (Date.now() - t0) / 1000;
      monitorsRef.current.forEach((m, i) => {
        if (!m || !m.el || !m.cur) return;
        const tg = targetRef.current[i] || { x: 0, y: 0, z: -3000, rotY: 0, scale: 0 };
        let floatY = 0, floatR = 0;
        if ((prefs.mode === 'single' && i === 0) || prefs.mode === 'carousel') {
          floatY = Math.sin(time + i) * 12;
          floatR = Math.sin(time * 0.5 + i) * 0.03;
        }
        const c = m.cur, k = 0.09;
        c.x += (tg.x - c.x) * k;
        c.y += ((tg.y + floatY) - c.y) * k;
        c.z += (tg.z - c.z) * k;
        c.rotY += ((tg.rotY + floatR) - c.rotY) * k;
        c.scale += (tg.scale - c.scale) * 0.12;
        m.el.style.opacity = c.scale > 0.02 ? 1 : 0;
        m.el.style.transform =
          'translate(-50%,-50%) translate3d(' + c.x.toFixed(1) + 'px,' + c.y.toFixed(1) + 'px,' + c.z.toFixed(1) + 'px)' +
          ' rotateY(' + c.rotY.toFixed(3) + 'rad) scale(' + c.scale.toFixed(3) + ')';
      });
      raf = requestAnimationFrame(tick);
    };
    tick();
    const onResize = () => {
      targetRef.current = layoutMonitors(prefs.mode, prefs.count, angle, responsiveScale(window.innerWidth, window.innerHeight - 76));
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [ready, prefs, angle]);

  const setMode = (mode) => setPrefs((p) => ({ ...p, mode }));
  const rotate = (dir) => {
    const step = (Math.PI * 2) / Math.max(3, prefs.count);
    setAngle((a) => a + dir * step);
  };
  const addMonitor = () => setPrefs((p) => ({ ...p, count: Math.min(MAX_MONITORS, p.count + 1) }));
  const removeMonitor = () => setPrefs((p) => ({ ...p, count: Math.max(1, p.count - 1) }));

  const stageMode = prefs.mode !== 'stacked';

  return (
    <div className="hf-mono min-h-dvh flex flex-col text-cyan-100" style={{ background: '#030307' }}>
      <style>{CSS}</style>
      <Starfield />

      {/* header */}
      <header className="px-4 sm:px-6 py-3.5 flex items-center justify-between border-b border-cyan-400/20 bg-black/60 backdrop-blur z-20">
        <div>
          <div className="text-lg sm:text-xl font-bold tracking-tight text-white" style={{ textShadow: '0 0 10px rgba(0,255,255,0.5)' }}>
            HOLOFRAME
          </div>
          <div className="text-[10px] tracking-[3px] text-cyan-300/60">HOLOGRAPHIC MONITOR ARRAY</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={removeMonitor} disabled={prefs.count <= 1}
            className="px-3 py-1.5 text-xs border border-white/20 rounded disabled:opacity-30 hover:bg-white/5">− SCREEN</button>
          <button onClick={addMonitor} disabled={prefs.count >= MAX_MONITORS}
            className="px-3 py-1.5 text-xs border border-emerald-400/60 text-emerald-300 rounded disabled:opacity-30 hover:bg-emerald-400/10">+ ADD MONITOR</button>
        </div>
      </header>

      {stageMode ? (
        <div ref={stageRef} className="hf-stage relative flex-1 overflow-hidden" style={{ minHeight: 'calc(100dvh - 150px)' }}>
          {ready && Array.from({ length: prefs.count }, (_, i) => (
            <div
              key={i}
              ref={(el) => {
                if (el) monitorsRef.current[i] = monitorsRef.current[i] || {};
                if (el) monitorsRef.current[i].el = el;
              }}
              className="hf-monitor"
              style={{ width: 1200, height: 800, maxWidth: 'none' }}
            >
              <div className="hf-frame hf-scan w-full h-full flex flex-col">
                <div className="flex items-center justify-between px-5 h-10 border-b border-cyan-300/20 bg-black/50 text-[11px] tracking-[2px] shrink-0" style={{ color: ACCENTS[i % ACCENTS.length] }}>
                  <span>{statusLabel(i)}</span>
                  <span>STATUS: READY</span>
                </div>
                <div className="flex-1 min-h-0">
                  <MiniShell nodeIndex={i} accent={ACCENTS[i % ACCENTS.length]} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 py-6 flex flex-col items-center gap-8">
          {ready && Array.from({ length: prefs.count }, (_, i) => (
            <div key={i} className="w-full max-w-3xl">
              <div className="hf-frame hf-scan w-full flex flex-col" style={{ aspectRatio: '3 / 2' }}>
                <div className="flex items-center justify-between px-5 h-10 border-b border-cyan-300/20 bg-black/50 text-[11px] tracking-[2px] shrink-0" style={{ color: ACCENTS[i % ACCENTS.length] }}>
                  <span>{statusLabel(i)}</span>
                  <span>STATUS: READY</span>
                </div>
                <div className="flex-1 min-h-0">
                  <MiniShell nodeIndex={i} accent={ACCENTS[i % ACCENTS.length]} />
                </div>
              </div>
            </div>
          ))}
          {/* Safari bottom-bar clearance */}
          <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))] shrink-0" />
        </div>
      )}

      {/* footer controls */}
      <footer className="border-t border-cyan-400/25 bg-black/85 backdrop-blur px-4 py-3 flex flex-wrap items-center justify-between gap-3 z-20">
        <div className="flex gap-2">
          {[
            ['single', 'MODE 1: SINGLE'],
            ['carousel', 'MODE 2: CAROUSEL'],
            ['stacked', 'MODE 3: STACKED'],
          ].map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)}
              className={'px-3 sm:px-4 py-2 text-[11px] sm:text-xs font-bold tracking-wider rounded border transition ' +
                (prefs.mode === m ? 'bg-cyan-400 text-black border-cyan-400' : 'border-cyan-400/60 text-cyan-300 hover:bg-cyan-400/10')}>
              {label}
            </button>
          ))}
        </div>
        {prefs.mode === 'carousel' && (
          <div className="flex gap-2">
            <button onClick={() => rotate(-1)} className="px-3 py-2 text-xs border border-cyan-400/60 text-cyan-300 rounded hover:bg-cyan-400/10">◀ ROTATE</button>
            <button onClick={() => rotate(1)} className="px-3 py-2 text-xs border border-cyan-400/60 text-cyan-300 rounded hover:bg-cyan-400/10">ROTATE ▶</button>
          </div>
        )}
        <div className="text-[10px] text-white/40 tracking-widest hidden sm:block">
          {prefs.count} MONITOR{prefs.count > 1 ? 'S' : ''} • DRAG NOTHING, JUST TYPE
        </div>
      </footer>

      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))] shrink-0" />
    </div>
  );
}
