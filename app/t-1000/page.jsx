'use client';

import { useEffect, useRef, useState } from 'react';
import { VERT, FRAG } from './shader';
import {
  createState,
  setMode,
  stir,
  addRipple,
  step,
  packRipples,
  getMode,
  MODE_KEYS,
  MODES,
} from './liquid';

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

const TILE = '/images/apollo-shared/apollo-panel-tile.webp';
const BG = '/images/t-1000/t-1000-bg.webp';

// Inline SVG glyph system (zero image weight) — liquid-metal gold treatment.
const G = (props) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props} />
);
const MODE_ICONS = {
  calm: <G><path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11z" /></G>,
  storm: <G><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></G>,
  magnetic: <G><path d="M6 4v7a6 6 0 0 0 12 0V4" /><path d="M6 4h4v5H6zM14 4h4v5h-4z" fill="currentColor" stroke="none" opacity="0.85" /></G>,
};
const IconSpin = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#e8b93c" strokeWidth="3"
    strokeLinecap="round" aria-hidden="true" style={{ animation: 'tspin 0.9s linear infinite' }}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
);

export default function T1000Page() {
  const canvasRef = useRef(null);
  const stateRef = useRef(null); // shared with the render loop
  const drawRef = useRef(null); // set by the effect (for reduced-motion redraws)
  const [modeKey, setModeKey] = useState('calm');
  const [liquefying, setLiquefying] = useState(true); // styled loading veil while the metal warms up

  useEffect(() => {
    const t = setTimeout(() => setLiquefying(false), 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) return;

    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link failed');
    } catch {
      return;
    }
    gl.useProgram(prog);

    // Fullscreen triangle.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = (n) => gl.getUniformLocation(prog, n);
    const uRes = U('uRes');
    const uTime = U('uTime');
    const uSwirl = U('uSwirl');
    const uRipples = U('uRipples');
    const uMode = U('uMode');
    const uAlign = U('uAlign');
    const uRim = U('uRim');

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state = createState();
    stateRef.current = state;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const draw = () => {
      resize();
      const m = getMode(state);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, state.time);
      gl.uniform1f(uSwirl, state.swirl);
      gl.uniform4fv(uRipples, packRipples(state));
      gl.uniform3f(uMode, m.noiseScale, m.flowSpeed, m.turbulence);
      gl.uniform1f(uAlign, m.align);
      gl.uniform1f(uRim, m.rim);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    drawRef.current = draw;

    let raf = 0;
    let last = performance.now();
    if (reduced) {
      draw(); // one static frame
    } else {
      const loop = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        step(state, dt);
        draw();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    // Pointer: drag stirs, quick tap sends a pulse.
    let downAt = 0;
    let downX = 0;
    let downY = 0;
    let lastX = 0;
    let lastY = 0;
    let dragging = false;

    const toBlob = (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      const nx = ((cx - r.left) / r.width) * 2 - 1;
      const ny = -(((cy - r.top) / r.height) * 2 - 1);
      const s = Math.min(r.width, r.height) || 1;
      return [(nx * r.width) / s / 0.92, (ny * r.height) / s / 0.92];
    };

    const onDown = (e) => {
      dragging = true;
      downAt = performance.now();
      downX = lastX = e.clientX;
      downY = lastY = e.clientY;
    };
    const onMove = (e) => {
      if (!dragging) return;
      stir(state, e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = (e) => {
      dragging = false;
      const dt = performance.now() - downAt;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (dt < 350 && moved < 12) {
        const [bx, by] = toBlob(e.clientX, e.clientY);
        addRipple(state, bx, by);
        if (reduced) draw();
      }
    };

    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      stateRef.current = null;
      drawRef.current = null;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  const pick = (key) => {
    setModeKey(key);
    if (stateRef.current) {
      setMode(stateRef.current, key);
      if (drawRef.current && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        drawRef.current();
      }
    }
  };

  return (
    <>
    <main className="fixed inset-0 bg-black overflow-hidden select-none">
      {/* Page background art: bed behind the liquid-metal shader, visible while it compiles. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ backgroundImage: `url(${BG})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.6 }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" />

      {/* Styled loading veil — the "liquefying" beat while the shader compiles. */}
      {liquefying && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4"
          role="status"
          aria-label="Liquefying"
          style={{
            backgroundImage: `linear-gradient(rgba(4,3,1,0.78), rgba(4,3,1,0.86)), url(${BG})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <IconSpin />
          <div className="text-amber-200/90 text-sm tracking-[0.35em] uppercase font-semibold">
            Liquefying…
          </div>
        </div>
      )}

      <div className="absolute top-0 left-0 right-0 p-5 pointer-events-none">
        <h1 className="text-white text-2xl font-black tracking-widest uppercase" style={{ textShadow: '0 0 22px rgba(232,185,60,0.35)' }}>Liquid Metal Dome</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Liquid metal holo-dome. Drag to stir the metal, tap to send a pulse.
        </p>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-wrap gap-2 justify-center">
        {MODE_KEYS.map((k) => (
          <button
            key={k}
            onClick={() => pick(k)}
            className={`px-4 py-2 rounded-full text-sm font-bold uppercase tracking-wider border transition-colors inline-flex items-center gap-2 ${
              modeKey === k
                ? 'bg-amber-400/20 border-amber-300/60 text-amber-200'
                : 'bg-black/50 border-white/20 text-zinc-300 hover:border-amber-300/50'
            }`}
            style={modeKey === k ? {} : {
              backgroundImage: `url(${TILE})`,
              backgroundSize: '200px',
              backgroundColor: 'rgba(5,4,2,0.55)',
            }}
          >
            {MODE_ICONS[k] || null}
            {MODES[k].label}
          </button>
        ))}
      </div>
    </main>
    <style>{`@keyframes tspin { to { transform: rotate(360deg); } }`}</style>
    {/* Safari bottom-bar clearance: blank space under the fixed holo-dome viewport */}
    <div aria-hidden="true" className="player-clear" />
    </>
  );
}
