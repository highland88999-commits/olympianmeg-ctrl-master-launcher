'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  APPS,
  appById,
  createDesktopState,
  spawnWindow,
  focusWindow,
  minimizeWindow,
  closeWindow,
  moveWindow,
  snapWindow,
  snapEdgeFor,
  visibleWindows,
  minimizedWindows,
  resolveCommand,
} from './os';
import { runCommand, bootLines, formatUptime } from './terminal';
import { createMonitor, tickMonitor, gaugeLevel } from './monitor';
import { createStarfieldRenderer } from './background';

const BOOT_DURATION = 2600;

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/* ------------------------------ app bodies ------------------------------ */

function NexusHub({ onLaunch, stats }) {
  return (
    <div style={{ padding: 16, overflowY: 'auto', height: '100%' }}>
      <div style={{ fontSize: 11, letterSpacing: 3, opacity: 0.6, marginBottom: 10 }}>
        MISSION DASHBOARD
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          ['WINDOWS', String(stats.open)],
          ['THREADS', String(stats.minimized)],
          ['UPTIME', stats.uptime],
        ].map(([k, v]) => (
          <div
            key={k}
            style={{
              border: '1px solid rgba(0,242,255,0.25)',
              borderRadius: 8,
              padding: '8px 14px',
              minWidth: 90,
            }}
          >
            <div style={{ fontSize: 9, letterSpacing: 2, opacity: 0.55 }}>{k}</div>
            <div style={{ fontSize: 16, fontWeight: 'bold', color: '#9df3ff' }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, letterSpacing: 3, opacity: 0.6, marginBottom: 10 }}>
        INSTALLED APPS
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: 10,
        }}
      >
        {APPS.map((a) => (
          <button
            key={a.id}
            onClick={() => onLaunch(a.id)}
            style={{
              background: 'rgba(0,242,255,0.05)',
              border: '1px solid rgba(0,242,255,0.25)',
              borderRadius: 10,
              padding: '14px 8px',
              color: '#d9fbff',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 26, marginBottom: 6 }}>{a.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 'bold' }}>{a.name}</div>
            <div style={{ fontSize: 10, opacity: 0.55, marginTop: 4 }}>{a.tagline}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TerminalApp({ onLaunch }) {
  const [lines, setLines] = useState(() => bootLines());
  const [value, setValue] = useState('');
  const [bootTime] = useState(() => Date.now());
  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const submit = (e) => {
    e.preventDefault();
    const input = value;
    setValue('');
    const { lines: out, action } = runCommand(input, { bootTime });
    setLines((prev) => [...prev, `> ${input}`, ...out]);
    if (action?.type === 'launch') onLaunch(action.appId);
    if (action?.type === 'clear') setLines([]);
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(0,8,12,0.85)' }}
      onClick={() => inputRef.current?.focus()}
    >
      <div
        ref={bodyRef}
        style={{ flex: 1, overflowY: 'auto', padding: 12, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}
      >
        {lines.map((l, i) => (
          <div key={i} style={{ color: l.startsWith('>') ? '#9df3ff' : '#bfeef7' }}>
            {l}
          </div>
        ))}
      </div>
      <form onSubmit={submit} style={{ display: 'flex', borderTop: '1px solid rgba(0,242,255,0.2)' }}>
        <span style={{ padding: '10px 0 10px 12px', color: '#00f2ff' }}>&gt;</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder='type "help"'
          aria-label="Terminal input"
          autoComplete="off"
          spellCheck={false}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#fff',
            padding: 10,
            fontFamily: 'inherit',
            fontSize: 13,
          }}
        />
      </form>
    </div>
  );
}

function Gauge({ label, value, unit }) {
  const level = gaugeLevel(value);
  const color = level === 'calm' ? '#00f2ff' : level === 'busy' ? '#ffd166' : '#ff5d73';
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span style={{ letterSpacing: 2, opacity: 0.7 }}>{label}</span>
        <span style={{ color }}>
          {value.toFixed(0)}
          {unit}
        </span>
      </div>
      <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
        <div
          style={{
            width: `${Math.min(100, value)}%`,
            height: '100%',
            background: color,
            borderRadius: 4,
            transition: 'width 0.8s ease',
            boxShadow: `0 0 8px ${color}`,
          }}
        />
      </div>
    </div>
  );
}

function MonitorApp() {
  const [mon, setMon] = useState(() => createMonitor());
  useEffect(() => {
    const id = setInterval(() => setMon((m) => tickMonitor(m)), 1200);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ padding: 16, overflowY: 'auto', height: '100%' }}>
      <div style={{ fontSize: 11, letterSpacing: 3, opacity: 0.6, marginBottom: 12 }}>
        SYSTEM VITALS <span style={{ opacity: 0.7 }}>(simulated)</span>
      </div>
      <Gauge label="CPU" value={mon.cpu} unit="%" />
      <Gauge label="MEMORY" value={mon.mem} unit="%" />
      <Gauge label="UPLINK" value={mon.net} unit=" Mb/s" />
      <Gauge label="CORE TEMP" value={mon.temp} unit="°C" />
      <div style={{ fontSize: 10, opacity: 0.5, marginTop: 8, lineHeight: 1.6 }}>
        These gauges are procedural fiction for atmosphere.
        <br />
        Artemis measures nothing about your machine.
      </div>
    </div>
  );
}

function NotesApp() {
  const [text, setText] = useState('');
  useEffect(() => {
    try {
      setText(localStorage.getItem('artemis-notes') || '');
    } catch {
      /* private mode */
    }
  }, []);
  const onChange = (e) => {
    setText(e.target.value);
    try {
      localStorage.setItem('artemis-notes', e.target.value);
    } catch {
      /* private mode */
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ fontSize: 11, letterSpacing: 3, opacity: 0.6, padding: '12px 16px 0' }}>
        SCRATCHPAD <span style={{ opacity: 0.7 }}>(device-local)</span>
      </div>
      <textarea
        value={text}
        onChange={onChange}
        placeholder="Type here. Notes stay on this device, in this browser."
        aria-label="Notes"
        style={{
          flex: 1,
          margin: 12,
          background: 'rgba(0,10,16,0.7)',
          border: '1px solid rgba(0,242,255,0.25)',
          borderRadius: 8,
          color: '#eafcff',
          padding: 12,
          fontFamily: 'inherit',
          fontSize: 13,
          resize: 'none',
          outline: 'none',
        }}
      />
    </div>
  );
}

function AboutApp() {
  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', lineHeight: 1.8, fontSize: 13 }}>
      <div style={{ fontSize: 11, letterSpacing: 3, opacity: 0.6, marginBottom: 12 }}>
        WHAT THIS IS
      </div>
      <p style={{ color: '#d9fbff' }}>
        <strong>Artemis</strong> is a concept interface — a playable sketch of an
        operating system, not an operating system.
      </p>
      <p style={{ opacity: 0.85 }}>
        It cannot see your files, your network, or your machine. Every gauge,
        log line, and terminal reply is procedural fiction rendered locally in
        this browser tab. Notes never leave your device. There is no account,
        no tracking, no uplink of any kind.
      </p>
      <p style={{ opacity: 0.85 }}>
        Rebuilt from a static concept page. The original phoned home to a
        telemetry database, harvested IP addresses, and iframed remote sites —
        all of that was removed. What remains is the aesthetic: glass, cyan,
        and stars.
      </p>
      <p style={{ fontSize: 11, opacity: 0.5, letterSpacing: 1 }}>
        ARTEMIS OS v1.0 — CONCEPT BUILD
      </p>
    </div>
  );
}

const APP_BODIES = {
  nexus: NexusHub,
  terminal: TerminalApp,
  monitor: MonitorApp,
  notes: NotesApp,
  about: AboutApp,
};

/* -------------------------------- window -------------------------------- */

function OsWindow({ win, onLaunch, onFocus, onMinimize, onClose, onDragStart, stats }) {
  const Body = APP_BODIES[win.appId] || AboutApp;
  return (
    <div
      onPointerDown={() => onFocus(win.id)}
      style={{
        position: 'absolute',
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
        zIndex: win.z,
        background: 'rgba(2,14,22,0.88)',
        border: '1px solid rgba(0,242,255,0.45)',
        borderRadius: 10,
        backdropFilter: 'blur(14px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 12px 44px rgba(0,0,0,0.55), 0 0 18px rgba(0,242,255,0.08)',
      }}
    >
      <div
        onPointerDown={(e) => onDragStart(e, win.id)}
        style={{
          padding: '9px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(0,242,255,0.08)',
          borderBottom: '1px solid rgba(0,242,255,0.25)',
          cursor: 'grab',
          userSelect: 'none',
          touchAction: 'none',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: 2 }}>
          {appById(win.appId)?.icon} {win.title.toUpperCase()}
        </span>
        <div style={{ display: 'flex', gap: 14 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMinimize(win.id);
            }}
            aria-label={`Minimize ${win.title}`}
            style={chromeBtn}
          >
            _
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose(win.id);
            }}
            aria-label={`Close ${win.title}`}
            style={{ ...chromeBtn, color: '#ff8ba0' }}
          >
            ✕
          </button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, color: '#c9f2fa' }}>
        <Body onLaunch={onLaunch} stats={stats} />
      </div>
    </div>
  );
}

const chromeBtn = {
  background: 'transparent',
  border: 'none',
  color: '#9df3ff',
  cursor: 'pointer',
  fontSize: 14,
  fontFamily: 'inherit',
  padding: '2px 4px',
};

/* --------------------------------- page --------------------------------- */

export default function ArtemisPage() {
  const canvasRef = useRef(null);
  const [booted, setBooted] = useState(false);
  const [bootProgress, setBootProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [desk, setDesk] = useState(() => createDesktopState());
  const [dockOpen, setDockOpen] = useState(false);
  const [cmd, setCmd] = useState('');
  const [cmdMsg, setCmdMsg] = useState('');
  const [bootTime] = useState(() => Date.now());
  const dragRef = useRef(null);

  const now = useClock();
  const uptime = formatUptime(Date.now() - bootTime);
  const open = visibleWindows(desk);
  const minimized = minimizedWindows(desk);

  // Reduced motion + background renderer.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const rm = !!mq?.matches;
    setReducedMotion(rm);
    if (canvasRef.current) {
      const r = createStarfieldRenderer(canvasRef.current, { reducedMotion: rm });
      return () => r.stop();
    }
  }, []);

  // Boot sequence.
  useEffect(() => {
    if (reducedMotion) {
      setBooted(true);
      return;
    }
    setBootProgress(0);
    const t0 = performance.now();
    let raf;
    const stepFn = (t) => {
      const p = Math.min(1, (t - t0) / BOOT_DURATION);
      setBootProgress(p);
      if (p < 1) raf = requestAnimationFrame(stepFn);
      else setTimeout(() => setBooted(true), 350);
    };
    raf = requestAnimationFrame(stepFn);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  const viewport = () =>
    typeof window === 'undefined'
      ? { w: 1200, h: 800 }
      : { w: window.innerWidth, h: window.innerHeight };

  const launch = useCallback(
    (appId) => {
      setDesk((d) => spawnWindow(d, appId, viewport()));
      setDockOpen(false);
    },
    []
  );

  const submitCommand = (e) => {
    e.preventDefault();
    const res = resolveCommand(cmd);
    setCmd('');
    if (res.action === 'launch') {
      launch(res.appId);
      setCmdMsg('');
    } else if (res.action === 'unknown') {
      setCmdMsg(`unknown command: "${res.query}" — try an app name`);
      setTimeout(() => setCmdMsg(''), 2600);
    }
  };

  // Window dragging (pointer events cover mouse + touch).
  const onDragStart = useCallback(
    (e, id) => {
      if (e.button !== undefined && e.button !== 0) return;
      const win = desk.windows.find((w) => w.id === id);
      if (!win) return;
      setDesk((d) => focusWindow(d, id));
      dragRef.current = {
        id,
        dx: e.clientX - win.x,
        dy: e.clientY - win.y,
        moved: false,
      };
    },
    [desk.windows]
  );

  useEffect(() => {
    const onMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      drag.moved = true;
      setDesk((d) => moveWindow(d, drag.id, e.clientX - drag.dx, e.clientY - drag.dy, viewport()));
      const edge = snapEdgeFor(e.clientX, window.innerWidth);
      document.querySelectorAll('.artemis-snap').forEach((el) => {
        const side = el.dataset.side;
        el.style.opacity = edge === side ? '0.5' : '0';
      });
    };
    const onUp = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      document.querySelectorAll('.artemis-snap').forEach((el) => (el.style.opacity = '0'));
      const edge = snapEdgeFor(e.clientX, window.innerWidth);
      if (edge) setDesk((d) => snapWindow(d, drag.id, edge, viewport()));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const stats = { open: open.length, minimized: minimized.length, uptime };
  const bootLog = bootLines();

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        color: '#c9f2fa',
        fontFamily: "'Courier New', ui-monospace, monospace",
        overflow: 'hidden',
      }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* snap guides */}
      {['left', 'right'].map((side) => (
        <div
          key={side}
          data-side={side}
          className="artemis-snap"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: 4,
            [side]: 0,
            background: '#00f2ff',
            opacity: 0,
            transition: 'opacity 0.15s',
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        />
      ))}

      {!booted && (
        <div
          onClick={() => setBooted(true)}
          style={{
            position: 'absolute',
            inset: 0,
            background: '#000',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 24,
          }}
        >
          <h1 style={{ letterSpacing: 14, color: '#00f2ff', margin: '0 0 8px', fontSize: 34 }}>
            ARTEMIS
          </h1>
          <div style={{ fontSize: 10, letterSpacing: 4, opacity: 0.5, marginBottom: 18 }}>
            CONCEPT INTERFACE — TAP TO SKIP
          </div>
          <div style={{ width: 220, height: 2, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.round(bootProgress * 100)}%`,
                height: '100%',
                background: '#00f2ff',
                boxShadow: '0 0 12px rgba(0,242,255,0.8)',
                transition: 'width 0.1s linear',
              }}
            />
          </div>
          <div style={{ marginTop: 18, fontSize: 10, opacity: 0.55, lineHeight: 1.9, textAlign: 'left' }}>
            {bootLog.slice(0, 1 + Math.floor(bootProgress * (bootLog.length - 1))).map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </div>
      )}

      {/* top bar */}
      <header
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          padding: '10px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)',
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', gap: 18, fontSize: 10, letterSpacing: 2, alignItems: 'center' }}>
          <span>
            CORE <strong style={{ color: '#fff' }}>{pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}</strong>
          </span>
          <span>
            SYSTEM <strong style={{ color: '#00f2ff' }}>ARTEMIS</strong>
          </span>
          <span
            style={{
              border: '1px solid rgba(0,242,255,0.4)',
              borderRadius: 4,
              padding: '1px 6px',
              fontSize: 9,
              color: '#9df3ff',
            }}
          >
            CONCEPT
          </span>
        </div>
        <form onSubmit={submitCommand} style={{ width: '100%', maxWidth: 400, pointerEvents: 'auto' }}>
          <input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder="INITIATE COMMAND… (try: terminal)"
            aria-label="Command bar"
            style={{
              width: '100%',
              padding: '10px 22px',
              borderRadius: 24,
              border: '1px solid rgba(0,242,255,0.35)',
              background: 'rgba(0,0,0,0.6)',
              color: '#fff',
              outline: 'none',
              textAlign: 'center',
              fontFamily: 'inherit',
              fontSize: 12,
              letterSpacing: 1,
            }}
          />
        </form>
        {cmdMsg && (
          <div style={{ fontSize: 10, color: '#ffd166', letterSpacing: 1 }}>{cmdMsg}</div>
        )}
      </header>

      {/* desktop */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
        {open.map((w) => (
          <OsWindow
            key={w.id}
            win={w}
            stats={stats}
            onLaunch={launch}
            onFocus={(id) => setDesk((d) => focusWindow(d, id))}
            onMinimize={(id) => setDesk((d) => minimizeWindow(d, id))}
            onClose={(id) => setDesk((d) => closeWindow(d, id))}
            onDragStart={onDragStart}
          />
        ))}
        {open.length === 0 && booted && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              textAlign: 'center',
              padding: 24,
            }}
          >
            <div style={{ opacity: 0.5, fontSize: 12, letterSpacing: 3, lineHeight: 2.2 }}>
              DESKTOP CLEAR
              <br />
              <span style={{ opacity: 0.8 }}>OPEN THE DOCK → OR TYPE AN APP NAME ABOVE</span>
            </div>
          </div>
        )}
      </div>

      {/* dock toggle */}
      <button
        onClick={() => setDockOpen((v) => !v)}
        aria-label="Toggle app dock"
        style={{
          position: 'absolute',
          right: dockOpen ? 250 : 0,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 5001,
          background: '#00f2ff',
          color: '#000',
          border: 'none',
          padding: '14px 9px',
          borderRadius: dockOpen ? '8px 0 0 8px' : '8px 0 0 8px',
          cursor: 'pointer',
          fontSize: 16,
          transition: 'right 0.35s cubic-bezier(0.1,0.9,0.2,1)',
        }}
      >
        {dockOpen ? '›' : '‹'}
      </button>

      {/* side dock */}
      <aside
        style={{
          position: 'absolute',
          right: dockOpen ? 0 : -260,
          top: 0,
          bottom: 0,
          width: 250,
          background: 'rgba(1,10,15,0.96)',
          borderLeft: '1px solid rgba(0,242,255,0.3)',
          transition: 'right 0.35s cubic-bezier(0.1,0.9,0.2,1)',
          zIndex: 5000,
          padding: 18,
          overflowY: 'auto',
        }}
      >
        <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.5, marginBottom: 10 }}>
          APPS
        </div>
        {APPS.map((a) => (
          <button
            key={a.id}
            onClick={() => launch(a.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '10px 12px',
              margin: '6px 0',
              background: 'rgba(0,242,255,0.05)',
              border: '1px solid transparent',
              borderRadius: 8,
              color: '#d9fbff',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
            }}
          >
            <span style={{ marginRight: 8 }}>{a.icon}</span>
            {a.name}
            <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>{a.tagline}</div>
          </button>
        ))}
        <hr style={{ border: 0, borderTop: '1px solid rgba(0,242,255,0.2)', margin: '16px 0' }} />
        <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.5, marginBottom: 10 }}>
          ACTIVE THREADS
        </div>
        {minimized.length === 0 && (
          <div style={{ fontSize: 11, opacity: 0.4 }}>no minimized windows</div>
        )}
        {minimized.map((w) => (
          <button
            key={w.id}
            onClick={() => setDesk((d) => focusWindow(d, w.id))}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '8px 12px',
              margin: '6px 0',
              background: 'rgba(0,242,255,0.1)',
              border: '1px solid rgba(0,242,255,0.25)',
              borderRadius: 8,
              color: '#9df3ff',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 12,
            }}
          >
            ↩ {w.title}
          </button>
        ))}
      </aside>

      {/* footer honesty strip */}
      <footer
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          padding: '6px 14px',
          fontSize: 9,
          letterSpacing: 2,
          opacity: 0.45,
          display: 'flex',
          justifyContent: 'space-between',
          pointerEvents: 'none',
        }}
      >
        <span>ARTEMIS — CONCEPT INTERFACE</span>
        <span>NO SYSTEM ACCESS · NO NETWORK · NO TRACKING</span>
      </footer>
    </main>
  );
}
