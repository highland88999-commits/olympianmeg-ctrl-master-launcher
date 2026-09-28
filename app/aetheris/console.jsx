'use client';

import { useEffect, useRef, useState } from 'react';
import {
  UNIT_ID,
  SWAP_STAGES,
  createUnitState,
  startSwap,
  advanceSwap,
  tickUnit,
  pressureDropKpa,
  flowRateM3h,
  statusFor,
} from './simulation';

const TIME_SCALES = [
  { label: '1x', monthsPerSec: 0.05 },
  { label: '10x', monthsPerSec: 0.5 },
  { label: '60x', monthsPerSec: 3 },
];

function fmt(n) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export default function DiagnosticConsole() {
  const [state, setState] = useState(() => createUnitState());
  const [timeScale, setTimeScale] = useState(0);
  const [swapTick, setSwapTick] = useState(0); // re-render driver during swaps
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  const logRef = useRef(null);
  const reduced = useRef(false);

  stateRef.current = state;

  useEffect(() => {
    reduced.current =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Simulation clock. State syncs to React at most 4x/sec; canvas runs its own loop.
  useEffect(() => {
    let last = performance.now();
    let raf = 0;
    let syncAcc = 0;
    let lastLogLen = stateRef.current.log.length;
    const loop = (now) => {
      const dtSec = Math.min(1, (now - last) / 1000);
      last = now;
      const s = stateRef.current;
      if (s.swapping) {
        advanceSwap(s, dtSec);
        setSwapTick((t) => t + 1);
      } else if (s.online) {
        tickUnit(s, TIME_SCALES[timeScale].monthsPerSec * dtSec);
      }
      syncAcc += dtSec;
      if (syncAcc >= 0.25 || s.log.length !== lastLogLen) {
        syncAcc = 0;
        lastLogLen = s.log.length;
        setState({ ...s, log: [...s.log] });
      }
      if (!reduced.current) raf = requestAnimationFrame(loop);
    };
    if (reduced.current) {
      // Single static frame.
      drawFrame();
    } else {
      raf = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeScale]);

  // Auto-scroll log.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.log.length]);

  // Canvas render loop (particles).
  useEffect(() => {
    if (reduced.current) return;
    let raf = 0;
    const particles = [];
    const spawn = () => {
      const s = stateRef.current;
      const active = s.online && !s.swapping;
      if (!active || particles.length > 140) return;
      const dirty = Math.random() < 0.55;
      particles.push({
        x: 60 + Math.random() * 80,
        y: dirty ? 300 + Math.random() * 40 : 40 + Math.random() * 30,
        vy: dirty ? -(0.6 + Math.random() * 1.2) : -(0.4 + Math.random() * 0.8),
        dirty,
        life: 1,
      });
    };
    const render = () => {
      spawn();
      drawFrame(particles);
      for (const p of particles) {
        p.y += p.vy;
        p.life -= 0.004;
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i].y < 10 || particles[i].life <= 0) particles.splice(i, 1);
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function drawFrame(particles = []) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const s = stateRef.current;
    ctx.clearRect(0, 0, W, H);

    // Tower body: tapered column.
    const cx = W / 2;
    const topW = 46;
    const botW = 64;
    const topY = 40;
    const botY = 300;
    const grad = ctx.createLinearGradient(cx - botW, 0, cx + botW, 0);
    const health = s.filterLife;
    const col = health > 0.4 ? '0,212,255' : health > 0.15 ? '255,170,0' : '255,70,70';
    grad.addColorStop(0, 'rgba(20,24,32,1)');
    grad.addColorStop(0.5, `rgba(${col},0.25)`);
    grad.addColorStop(1, 'rgba(20,24,32,1)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - topW, topY);
    ctx.lineTo(cx - botW, botY);
    ctx.lineTo(cx + botW, botY);
    ctx.lineTo(cx + topW, topY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(${col},0.9)`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Filter column indicator.
    ctx.fillStyle = `rgba(${col},0.5)`;
    const colH = (botY - topY - 40) * health;
    ctx.fillRect(cx - topW + 6, botY - 20 - colH, (topW - 6) * 2, colH);

    // Base intake + top exhaust labels.
    ctx.fillStyle = '#71717a';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('360\u00b0 INTAKE', cx, botY + 18);
    ctx.fillText('DIFFUSED EXHAUST', cx, topY - 10);

    // Particles.
    for (const p of particles) {
      ctx.fillStyle = p.dirty
        ? `rgba(160,160,170,${0.7 * p.life})`
        : `rgba(0,220,255,${0.8 * p.life})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.dirty ? 2 : 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!s.online && !s.swapping) {
      ctx.fillStyle = 'rgba(255,70,70,0.9)';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('OFFLINE', cx, (topY + botY) / 2);
    }
  }

  const status = statusFor(state);
  const statusColor =
    status === 'SYNCED'
      ? 'text-emerald-400'
      : status === 'DEGRADED'
        ? 'text-amber-400'
        : status === 'CRITICAL'
          ? 'text-red-400'
          : 'text-cyan-300';

  const handleSwap = () => {
    const s = stateRef.current;
    if (startSwap(s)) setState({ ...s, log: [...s.log] });
  };

  const swapStage = state.swapping ? SWAP_STAGES[state.swapStageIndex] : null;
  const swapProgress = state.swapping
    ? ((state.swapStageIndex + state.swapStageElapsed / swapStage.durationSec) / SWAP_STAGES.length) * 100
    : 0;

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="lg:w-72 shrink-0 bg-black/60 border border-zinc-800 rounded p-4">
        <canvas ref={canvasRef} width={200} height={340} className="w-full h-auto" aria-label="UNIT_07 tower schematic" />
        <div className="mt-2 text-[11px] font-mono text-zinc-500 break-all">{UNIT_ID}</div>
        <div className="mt-1 text-xs font-mono">
          STATUS: <span className={statusColor + ' font-black'}>{status}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-black/60 border border-zinc-800 rounded p-4">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Filter integrity</div>
            <div className="text-2xl font-black text-white mt-1">{Math.round(state.filterLife * 100)}%</div>
            <div className="mt-2 h-2 bg-zinc-800 rounded overflow-hidden">
              <div
                className={
                  'h-full transition-all ' +
                  (state.filterLife > 0.4 ? 'bg-cyan-400' : state.filterLife > 0.15 ? 'bg-amber-400' : 'bg-red-500')
                }
                style={{ width: Math.round(state.filterLife * 100) + '%' }}
              />
            </div>
          </div>
          <div className="bg-black/60 border border-zinc-800 rounded p-4">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Pressure drop</div>
            <div className="text-2xl font-black text-white mt-1">{pressureDropKpa(state.filterLife).toFixed(2)}</div>
            <div className="text-[10px] text-zinc-500">kPa across filter</div>
          </div>
          <div className="bg-black/60 border border-zinc-800 rounded p-4">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Flow rate</div>
            <div className="text-2xl font-black text-white mt-1">{fmt(flowRateM3h(state.filterLife) / 1000)}k</div>
            <div className="text-[10px] text-zinc-500">m\u00b3/h</div>
          </div>
          <div className="bg-black/60 border border-zinc-800 rounded p-4">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Air cleaned</div>
            <div className="text-2xl font-black text-white mt-1">{fmt(state.totalAirCleanedM3 / 1e6)}M</div>
            <div className="text-[10px] text-zinc-500">m\u00b3 lifetime</div>
          </div>
        </div>

        <div className="bg-black/60 border border-zinc-800 rounded p-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSwap}
              disabled={state.swapping || !state.online}
              className="px-6 py-3 min-h-[44px] rounded bg-cyan-500/20 border border-cyan-400/60 text-cyan-200 text-sm font-black tracking-widest uppercase hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {state.swapping ? 'Swap in progress' : 'Initiate filter swap'}
            </button>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="uppercase tracking-widest">Sim speed</span>
              {TIME_SCALES.map((t, i) => (
                <button
                  key={t.label}
                  onClick={() => setTimeScale(i)}
                  className={
                    'px-3 py-2 min-h-[44px] rounded border text-xs font-bold ' +
                    (i === timeScale ? 'border-cyan-400/60 text-cyan-200 bg-cyan-500/10' : 'border-zinc-700 text-zinc-500')
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="text-xs text-zinc-500 ml-auto">Swaps performed: {state.swapsPerformed}</div>
          </div>
          {state.swapping && swapStage && (
            <div className="mt-4">
              <div className="text-xs text-cyan-300 font-mono">
                Stage {state.swapStageIndex + 1}/5: {swapStage.label}
              </div>
              <div className="mt-2 h-2 bg-zinc-800 rounded overflow-hidden">
                <div className="h-full bg-cyan-400 transition-all" style={{ width: swapProgress + '%' }} />
              </div>
            </div>
          )}
        </div>

        <div className="bg-black/60 border border-zinc-800 rounded p-4">
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Maintenance log</div>
          <div ref={logRef} className="h-40 overflow-y-auto font-mono text-xs text-zinc-400 space-y-1" aria-live="polite">
            {state.log.map((entry, i) => (
              <div key={i} className="border-b border-zinc-900 pb-1">
                <span className="text-cyan-500/70 mr-2">&gt;</span>
                {entry}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
