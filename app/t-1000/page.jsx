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

export default function T1000Page() {
  const canvasRef = useRef(null);
  const stateRef = useRef(null); // shared with the render loop
  const drawRef = useRef(null); // set by the effect (for reduced-motion redraws)
  const [modeKey, setModeKey] = useState('calm');

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
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" />

      <div className="absolute top-0 left-0 right-0 p-5 pointer-events-none">
        <h1 className="text-white text-2xl font-black tracking-widest uppercase">T-1000</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Liquid metal holo-dome. Drag to stir the metal, tap to send a pulse.
        </p>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-5 flex flex-wrap gap-2 justify-center">
        {MODE_KEYS.map((k) => (
          <button
            key={k}
            onClick={() => pick(k)}
            className={`px-4 py-2 rounded-full text-sm font-bold uppercase tracking-wider border transition-colors ${
              modeKey === k
                ? 'bg-cyan-400/20 border-cyan-300/60 text-cyan-200'
                : 'bg-black/50 border-white/20 text-zinc-300 hover:border-white/50'
            }`}
          >
            {MODES[k].label}
          </button>
        ))}
      </div>
    </main>
    {/* Safari bottom-bar clearance: blank space under the fixed holo-dome viewport */}
    <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
    </>
  );
}
