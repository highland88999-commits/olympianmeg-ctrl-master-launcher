// Artemis OS — procedural starfield background renderer.
// No video, no images, no network. Canvas 2D.

export function createStarfield(seed = 20260927) {
  // Deterministic PRNG for a stable first paint.
  let a = seed >>> 0;
  const rand = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const stars = [];
  for (let i = 0; i < 220; i++) {
    stars.push({
      x: rand(),
      y: rand(),
      r: 0.4 + rand() * 1.6,
      tw: rand() * Math.PI * 2, // twinkle phase
      sp: 0.2 + rand() * 1.2, // twinkle speed
      hue: rand() < 0.12 ? 190 : 0, // a few cyan-tinted stars
    });
  }
  const drifters = [];
  for (let i = 0; i < 26; i++) {
    drifters.push({
      x: rand(),
      y: rand(),
      vx: (rand() - 0.5) * 0.00012,
      vy: (rand() - 0.5) * 0.00008,
      r: 1 + rand() * 2.2,
    });
  }
  return { stars, drifters, rand };
}

// Advance drifter positions by dt seconds. Pure — testable.
export function stepStarfield(field, dt) {
  for (const d of field.drifters) {
    d.x = (d.x + d.vx * dt * 60 + 1) % 1;
    d.y = (d.y + d.vy * dt * 60 + 1) % 1;
  }
  return field;
}

// Attach to a canvas; returns a stop() function.
export function createStarfieldRenderer(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const field = createStarfield(opts.seed);
  const reduced = !!opts.reducedMotion;
  let raf = 0;
  let last = performance.now();
  let running = true;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  function paint(t) {
    const w = canvas.width;
    const h = canvas.height;
    // Deep-space gradient.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#020608');
    g.addColorStop(0.55, '#04121a');
    g.addColorStop(1, '#010304');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Nebula glows (localized, subtle — never washes out windows).
    const neb = (x, y, r, color) => {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, color);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    neb(w * 0.18, h * 0.75, w * 0.35, 'rgba(0,120,160,0.10)');
    neb(w * 0.85, h * 0.2, w * 0.28, 'rgba(80,40,160,0.08)');

    const time = t / 1000;
    for (const s of field.stars) {
      const tw = reduced ? 0.75 : 0.45 + 0.55 * Math.abs(Math.sin(time * s.sp + s.tw));
      const alpha = 0.25 + 0.65 * tw;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r * (w / 1200 + 0.6), 0, Math.PI * 2);
      ctx.fillStyle =
        s.hue === 190
          ? `rgba(120,240,255,${alpha.toFixed(3)})`
          : `rgba(235,245,255,${(alpha * 0.9).toFixed(3)})`;
      ctx.fill();
    }
    for (const d of field.drifters) {
      ctx.beginPath();
      ctx.arc(d.x * w, d.y * h, d.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,220,255,0.16)';
      ctx.fill();
    }
  }

  function frame(t) {
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!reduced) stepStarfield(field, dt);
    paint(t);
    if (!reduced) raf = requestAnimationFrame(frame);
  }

  if (reduced) {
    paint(0); // single static frame
  } else {
    raf = requestAnimationFrame(frame);
  }

  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    },
  };
}
