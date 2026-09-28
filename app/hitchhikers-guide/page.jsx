// Hitchhiker's Guide — a black-hole multiverse toy.
// Port of highland88999-commits/Hitchhikers-Guide-to-the-Vortex. Tap to launch
// objects (Marble up to Star) into the singularity; hold the button to cycle
// the launch ladder. Pure canvas 2D, zero network calls.
"use client";

import { useEffect, useRef, useState } from 'react';
import {
  TIERS,
  createWorld,
  spawnBody,
  stepWorld,
  tierForHoldTime,
  chargeFill,
  makeStars,
  HOLD_THRESHOLD_MS,
} from './singularity.js';

const BTN =
  'min-h-[44px] px-4 py-3 rounded font-bold tracking-widest text-xs uppercase transition-colors';

export default function HitchhikersGuidePage() {
  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const starsRef = useRef([]);
  const slabImageRef = useRef(null); // uploaded image drawn on the Data Slab tier
  const [lockedTier, setLockedTier] = useState(0);
  const [charge, setCharge] = useState(0);
  const [holding, setHolding] = useState(false);
  const [counts, setCounts] = useState({ launched: 0, consumed: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const pressRef = useRef({ active: false, start: 0 });

  const tier = TIERS[lockedTier];

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (e) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Canvas setup + animation loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let last = performance.now();
    let ringAngle = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      worldRef.current = createWorld(w, h);
      starsRef.current = makeStars(220, w, h);
    }
    resize();
    window.addEventListener('resize', resize);

    function draw(now) {
      raf = requestAnimationFrame(draw);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const world = worldRef.current;
      if (!world) return;
      stepWorld(world, dt);
      if (!reducedMotion) ringAngle += dt * 0.5;

      const { width: w, height: h } = world;
      ctx.fillStyle = '#010103';
      ctx.fillRect(0, 0, w, h);

      // Starfield.
      for (const s of starsRef.current) {
        const a = reducedMotion ? 0.7 : 0.45 + 0.35 * Math.sin(now / 700 + s.tw);
        ctx.globalAlpha = Math.max(0.1, a);
        ctx.fillStyle = '#cfefff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const { x: hx, y: hy, r: hr } = world.hole;

      // Accretion ring: localized glow around the hole.
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(ringAngle);
      for (let i = 0; i < 3; i += 1) {
        const rr = hr * (1.5 + i * 0.45);
        ctx.strokeStyle = ['#00ffff', '#7df9ff', '#0088aa'][i];
        ctx.globalAlpha = 0.55 - i * 0.15;
        ctx.lineWidth = 3 - i * 0.8;
        ctx.setLineDash([rr * 0.5, rr * 0.28]);
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // The singularity: black disc with a thin bright rim (glow stays local).
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.strokeStyle = '#66f6ff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Impact flashes.
      for (const f of world.flashes) {
        const t = reducedMotion ? 1 : f.age / 0.6;
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 6 + t * 46, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Bodies.
      for (const b of world.bodies) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.angle);
        ctx.fillStyle = b.color;
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        // Glyph label so tiers are readable at a glance.
        ctx.rotate(-b.angle);
        ctx.fillStyle = '#001114';
        ctx.font = `bold ${Math.max(9, b.radius * 0.8)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.glyph, 0, 1);
        // Uploaded image on the Data Slab tier.
        if (b.tierIndex === TIERS.length - 1 && slabImageRef.current) {
          const img = slabImageRef.current;
          ctx.save();
          ctx.beginPath();
          ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
          ctx.clip();
          const side = b.radius * 2;
          ctx.drawImage(img, -b.radius, -b.radius, side, side);
          ctx.restore();
        }
        ctx.restore();
      }

      setCounts((c) =>
        c.launched === world.launched && c.consumed === world.consumed
          ? c
          : { launched: world.launched, consumed: world.consumed }
      );
    }
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [reducedMotion]);

  // Hold-to-cycle + tap-to-launch on the big button.
  function onPressStart(e) {
    if (e.cancelable) e.preventDefault();
    pressRef.current = { active: true, start: performance.now() };
    setHolding(true);
  }
  function onPressEnd(e) {
    if (e.cancelable) e.preventDefault();
    const { active, start } = pressRef.current;
    if (!active) return;
    pressRef.current = { active: false, start: 0 };
    setHolding(false);
    setCharge(0);
    const heldMs = performance.now() - start;
    if (heldMs < HOLD_THRESHOLD_MS && worldRef.current) {
      spawnBody(worldRef.current, lockedTier);
    }
  }

  // While held, advance the locked tier at the cycle rate.
  useEffect(() => {
    if (!holding) return;
    const id = setInterval(() => {
      const heldMs = performance.now() - pressRef.current.start;
      const next = tierForHoldTime(heldMs);
      setCharge(chargeFill(heldMs));
      if (next !== null) {
        setLockedTier((cur) => (cur === next ? cur : next));
      }
    }, 60);
    return () => clearInterval(id);
  }, [holding]);

  function onPickMedia(e) {
    const file = e.target.files && e.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file); // local object URL only, no network
    const img = new Image();
    img.onload = () => {
      slabImageRef.current = img;
      setLockedTier(TIERS.length - 1); // jump to the Data Slab tier
      URL.revokeObjectURL(url);
    };
    img.src = url;
    e.target.value = '';
  }

  function clearField() {
    if (worldRef.current) {
      worldRef.current.bodies = [];
      worldRef.current.flashes = [];
    }
  }

  return (
    <div className="relative w-full h-[100dvh] bg-black text-cyan-100 overflow-hidden select-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-label="Black hole simulation" />

      <div className="absolute top-0 left-0 right-0 pt-8 pb-4 text-center pointer-events-none">
        <h1 className="text-xl md:text-2xl font-bold tracking-[0.3em] uppercase text-white">
          A Hitchhiker&rsquo;s Guide
        </h1>
        <p className="text-xs tracking-[0.4em] uppercase text-cyan-400 mt-1">to the multiverse</p>
      </div>

      <div className="absolute bottom-0 left-0 right-0 pb-8 flex flex-col items-center gap-3 px-4">
        <div className="text-center">
          <div className="text-lg font-bold tracking-[0.25em] uppercase" style={{ color: tier.color }}>
            Locked: {tier.name}
          </div>
          <div className="text-[11px] text-zinc-400 tracking-widest uppercase mt-1">
            Tap to launch &middot; hold to cycle &middot; {counts.launched} launched, {counts.consumed} consumed
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <label className={`${BTN} border border-fuchsia-500 text-fuchsia-400 bg-fuchsia-500/10 cursor-pointer hover:bg-fuchsia-500 hover:text-black`}>
            Inject media
            <input type="file" accept="image/*" className="hidden" onChange={onPickMedia} />
          </label>
          <button
            type="button"
            className="w-24 h-24 rounded-full border-2 bg-cyan-950/70 font-bold text-sm tracking-widest uppercase active:scale-95 touch-none"
            style={{ borderColor: tier.color, color: tier.color }}
            onPointerDown={onPressStart}
            onPointerUp={onPressEnd}
            onPointerLeave={onPressEnd}
            onPointerCancel={onPressEnd}
            onContextMenu={(e) => e.preventDefault()}
          >
            Tap / Hold
          </button>
          <button
            type="button"
            className={`${BTN} border border-cyan-500 text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500 hover:text-black`}
            onClick={clearField}
          >
            Clear field
          </button>
        </div>

        <div
          className="w-64 max-w-full h-1.5 rounded bg-cyan-950 border border-cyan-800 overflow-hidden transition-opacity"
          style={{ opacity: holding ? 1 : 0 }}
          aria-hidden={!holding}
        >
          <div className="h-full bg-cyan-400" style={{ width: `${charge * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
