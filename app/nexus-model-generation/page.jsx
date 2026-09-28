'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  planGeneration, buildMesh, rotatePoint, project, meshToObj,
} from './lib/engine.js';

// Nexus Model Generation — rebuilt as an honest local experience.
// The source repo generated 3D models via cloud APIs and secret keys.
// There is no cloud here: the prompt seeds a deterministic procedural engine,
// and the model is rendered live as a wireframe on canvas. The page says so,
// clearly, right next to the button.

const SIMULATED_MS = 1600;

export default function NexusModelGenerationPage() {
  const [prompt, setPrompt] = useState('crystal spire');
  const [plan, setPlan] = useState(null);       // plan committed for render
  const [simulating, setSimulating] = useState(false);
  const [progress, setProgress] = useState(0);
  const canvasRef = useRef(null);
  const bgRef = useRef(null);
  const rotRef = useRef(0);
  const reduceMotion = useRef(false);

  const handleGenerate = () => {
    const text = prompt.trim();
    if (!text || simulating) return;
    setSimulating(true);
    setProgress(0);
    const t0 = performance.now();
    const tick = () => {
      const done = Math.min(1, (performance.now() - t0) / SIMULATED_MS);
      setProgress(done);
      if (done < 1) {
        requestAnimationFrame(tick);
      } else {
        // "Generation" is pure local math: plan -> mesh -> wireframe.
        setPlan(planGeneration(text));
        setSimulating(false);
      }
    };
    requestAnimationFrame(tick);
  };

  const downloadObj = () => {
    if (!plan) return;
    const obj = meshToObj(buildMesh(plan));
    const blob = new Blob([obj], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-model-${plan.shape}-${plan.seed.toString(16)}.obj`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Main render loop: vortex particle background + rotating wireframe model.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion.current = mq.matches;

    const fg = canvasRef.current;
    const bg = bgRef.current;
    if (!fg || !bg) return;
    const fctx = fg.getContext('2d');
    const bctx = bg.getContext('2d');

    let raf = 0;
    let w = 0, h = 0;

    // Vortex particle field (background), seeded once.
    const P_COUNT = 320;
    const parts = [];
    for (let i = 0; i < P_COUNT; i++) {
      parts.push({
        r: 40 + Math.random() * 320,
        a: Math.random() * Math.PI * 2,
        speed: 0.002 + Math.random() * 0.008,
        y: Math.random(),
        hue: 190 + Math.random() * 60,
      });
    }

    const resize = () => {
      const rect = fg.parentElement.getBoundingClientRect();
      w = Math.max(300, rect.width);
      h = Math.max(320, rect.height);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const c of [fg, bg]) {
        c.width = w * dpr;
        c.height = h * dpr;
        c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const drawBg = (t) => {
      bctx.fillStyle = '#040408';
      bctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      for (const p of parts) {
        const ang = p.a + t * p.speed * 60;
        const rr = p.r * (0.75 + 0.25 * Math.sin(t * 0.6 + p.a));
        const x = cx + Math.cos(ang) * rr;
        const y = cy + (p.y - 0.5) * h * 1.2 + Math.sin(t * 0.8 + p.a * 3) * 18;
        const alpha = Math.max(0, 0.7 - rr / 560);
        bctx.fillStyle = `hsla(${p.hue}, 90%, 60%, ${alpha.toFixed(3)})`;
        bctx.fillRect(x, y, 1.6, 1.6);
      }
      // Center glow (localized).
      const g = bctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
      g.addColorStop(0, 'rgba(0,243,255,0.18)');
      g.addColorStop(1, 'rgba(0,243,255,0)');
      bctx.fillStyle = g;
      bctx.fillRect(cx - 90, cy - 90, 180, 180);
    };

    const drawModel = (t) => {
      fctx.clearRect(0, 0, w, h);
      if (!plan) {
        fctx.fillStyle = '#5a6a75';
        fctx.font = '14px system-ui, sans-serif';
        fctx.textAlign = 'center';
        fctx.fillText('Type a prompt and press Generate — the model is drawn live, on this device.', w / 2, h / 2);
        return;
      }
      if (!reduceMotion.current) rotRef.current = t * 0.45;
      const mesh = buildMesh(plan);
      const cx = w / 2, cy = h / 2;
      const s = Math.min(w, h) / 6.4;
      const proj = [];
      for (const row of mesh.pts) {
        const prow = [];
        for (const p of row) {
          const [rx, ry, rz] = rotatePoint(p, rotRef.current);
          prow.push(project([rx * s, ry * s, rz * s], cx, cy, 900, 900));
        }
        proj.push(prow);
      }
      const hue = plan.hue;
      fctx.strokeStyle = `hsla(${hue}, 95%, 62%, 0.75)`;
      fctx.lineWidth = 1;
      // Wireframe: horizontal rows + vertical columns.
      for (let j = 0; j < proj.length; j += 2) {
        fctx.beginPath();
        for (let i = 0; i < proj[j].length; i++) {
          const [x, y] = proj[j][i];
          if (i === 0) fctx.moveTo(x, y); else fctx.lineTo(x, y);
        }
        fctx.stroke();
      }
      for (let i = 0; i < proj[0].length; i += 2) {
        fctx.beginPath();
        for (let j = 0; j < proj.length; j++) {
          const [x, y] = proj[j][i];
          if (j === 0) fctx.moveTo(x, y); else fctx.lineTo(x, y);
        }
        fctx.stroke();
      }
      fctx.fillStyle = `hsl(${hue}, 95%, 70%)`;
      fctx.font = '12px system-ui, sans-serif';
      fctx.textAlign = 'left';
      fctx.fillText(`shape: ${plan.shape} · seed ${plan.seed.toString(16)}`, 12, h - 12);
    };

    const loop = () => {
      const t = performance.now() / 1000;
      drawBg(reduceMotion.current ? 0 : t);
      drawModel(t);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [plan]);

  const badge = useMemo(() => plan ? `seed ${plan.seed.toString(16)} · shape ${plan.shape}` : '', [plan]);

  return (
    <main style={styles.page}>
      <div style={styles.inner}>
        <header style={styles.header}>
          <p style={styles.kicker}>Nexus Model Generation</p>
          <h1 style={styles.h1}>Procedural Forge</h1>
          <p style={styles.sub}>
            Type a prompt. A local engine turns it into a parametric wireframe you can spin and download as an OBJ file.
          </p>
          <p style={styles.local}>
            <span style={styles.dot} aria-hidden="true" /> LOCAL SIMULATION — no cloud, no API keys, nothing leaves this device.
          </p>
        </header>

        <form
          style={styles.form}
          onSubmit={(e) => { e.preventDefault(); handleGenerate(); }}
        >
          <label style={styles.label} htmlFor="mg-prompt">Model prompt</label>
          <div style={styles.row}>
            <input
              id="mg-prompt" style={styles.input} value={prompt} maxLength={140}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. crystal spire, copper torus, storm orb"
              disabled={simulating}
            />
            <button type="submit" style={styles.generate} disabled={simulating || !prompt.trim()}>
              {simulating ? 'Forging…' : 'Generate'}
            </button>
          </div>
          {simulating && (
            <div style={styles.barWrap} role="status" aria-label="Generation progress">
              <div style={{ ...styles.bar, width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
          {simulating && (
            <p style={styles.simNote}>
              Assembling parametric mesh locally — same prompt always gives the same model.
            </p>
          )}
        </form>

        <div style={styles.canvasWrap}>
          <canvas ref={bgRef} style={styles.canvas} aria-hidden="true" />
          <canvas ref={canvasRef} style={styles.canvas} aria-label="Procedural 3D model preview" />
        </div>

        {plan && (
          <div style={styles.meta}>
            <p style={styles.badge}>{badge}</p>
            <p style={styles.note}>
              Same prompt, same model — every time. Deterministic, on-device math.
            </p>
            <button type="button" style={styles.download} onClick={downloadObj}>
              Download OBJ
            </button>
          </div>
        )}
      </div>

      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" style={{ height: 'max(5rem, env(safe-area-inset-bottom))' }} />
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100dvh', background: '#040408', color: '#E0E0E0',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', padding: '24px 16px 48px', boxSizing: 'border-box',
  },
  inner: { maxWidth: '900px', margin: '0 auto' },
  header: { textAlign: 'center', marginBottom: '18px' },
  kicker: { letterSpacing: '6px', textTransform: 'uppercase', color: '#00F3FF', fontSize: '12px', margin: '0 0 8px' },
  h1: { fontSize: 'clamp(1.8rem, 5vw, 2.8rem)', margin: '0 0 10px', letterSpacing: '3px', color: '#fff' },
  sub: { color: '#9aa', fontSize: '0.95rem', maxWidth: '600px', margin: '0 auto 10px', lineHeight: 1.6 },
  local: {
    display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', letterSpacing: '1px',
    color: '#7dffb0', border: '1px solid rgba(125,255,176,0.35)', borderRadius: '999px', padding: '8px 14px', margin: 0,
  },
  dot: { width: '8px', height: '8px', borderRadius: '50%', background: '#7dffb0' },
  form: { margin: '18px 0' },
  label: { display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#888', marginBottom: '6px' },
  row: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  input: {
    flex: '1 1 240px', minHeight: '48px', background: '#000', border: '1px solid #333', color: '#00F3FF',
    borderRadius: '8px', padding: '12px 14px', fontSize: '1rem', boxSizing: 'border-box', fontFamily: 'inherit',
  },
  generate: {
    minHeight: '48px', padding: '0 28px', background: 'transparent', border: '1px solid #00F3FF', color: '#00F3FF',
    borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', letterSpacing: '1px', textTransform: 'uppercase',
  },
  barWrap: { height: '6px', background: '#111', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' },
  bar: { height: '100%', background: '#00F3FF', transition: 'width 120ms linear' },
  simNote: { color: '#777', fontSize: '0.82rem', marginTop: '8px' },
  canvasWrap: {
    position: 'relative', height: 'min(62vh, 520px)', border: '1px solid rgba(0,243,255,0.25)',
    borderRadius: '12px', overflow: 'hidden', background: '#040408',
  },
  canvas: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' },
  meta: { textAlign: 'center', marginTop: '16px' },
  badge: { color: '#00F3FF', fontSize: '0.82rem', letterSpacing: '1px', margin: '0 0 6px' },
  note: { color: '#777', fontSize: '0.82rem', margin: '0 0 12px' },
  download: {
    minHeight: '48px', padding: '0 28px', background: 'transparent', border: '1px solid #fe53bb', color: '#fe53bb',
    borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem', letterSpacing: '1px', textTransform: 'uppercase',
  },
};
