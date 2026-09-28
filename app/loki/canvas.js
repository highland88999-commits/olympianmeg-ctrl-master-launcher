// Loki — canvas renderer for the illusion scene.
// Restrained glow: only particles and aurora bands carry a soft shadowBlur;
// the background stays dark so nothing drowns out.

import { stepIllusion } from './illusions';

export function createIllusionRenderer(canvas, illusion, opts = {}) {
  const { reducedMotion = false } = opts;
  const g = canvas.getContext('2d');
  let current = illusion;
  let raf = 0;
  let running = true;
  let last = 0;

  function resize() {
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
  }

  function paint(time) {
    const w = canvas.width;
    const h = canvas.height;
    if (w < 2 || h < 2) return;
    const pal = current.theme.palette;

    // Night sky.
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, pal.skyTop);
    sky.addColorStop(1, pal.skyBottom);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);

    // Aurora bands — wide soft pass, then a narrow bright core.
    for (const band of current.bands) {
      for (const pass of [
        { width: h * 0.055, alpha: 0.16, blur: 34 },
        { width: h * 0.016, alpha: 0.5, blur: 12 },
      ]) {
        g.beginPath();
        const steps = 48;
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const y =
            (band.baseY +
              Math.sin(u * Math.PI * 2 * band.wavelength + band.phase + time * 0.25) *
                band.amplitude +
              Math.sin(u * Math.PI * 5 + band.phase * 1.7 + time * 0.12) * band.amplitude * 0.35) *
            h;
          const x = u * w;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokeStyle = band.color;
        g.globalAlpha = pass.alpha;
        g.lineWidth = pass.width;
        g.lineCap = 'round';
        g.shadowColor = band.color;
        g.shadowBlur = pass.blur;
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    g.shadowBlur = 0;

    // Particles.
    const kind = current.theme.motion.kind;
    for (const p of current.particles) {
      const x = p.x * w;
      const y = p.y * h;
      const twinkle = 0.55 + 0.45 * Math.sin(time * 1.7 + p.phase * 3);
      if (kind === 'streak') {
        // Motion streaks: short bright trails.
        const tx = x - p.speed * w * p.trail * 0.4;
        const ty = y - p.speed * h * p.trail * 0.22;
        const grad = g.createLinearGradient(x, y, tx, ty);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = 0.75 * twinkle;
        g.strokeStyle = grad;
        g.lineWidth = Math.max(1, p.size * 0.7);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(tx, ty);
        g.stroke();
      } else {
        g.globalAlpha = 0.8 * twinkle;
        g.fillStyle = p.color;
        g.shadowColor = p.color;
        g.shadowBlur = 8;
        g.beginPath();
        g.arc(x, y, p.size * (w / 900 + 0.6), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    g.shadowBlur = 0;

    // Vignette — keeps the edges dark and cinematic.
    const vg = g.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * 0.35,
      w / 2, h / 2, Math.max(w, h) * 0.75
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
  }

  function frame(now) {
    if (!running) return;
    const t = now / 1000;
    const dt = last === 0 ? 0.016 : t - last;
    last = t;
    stepIllusion(current, dt);
    paint(current.time);
    raf = requestAnimationFrame(frame);
  }

  resize();
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', resize);
  }

  if (reducedMotion) {
    // One painted frame — no animation loop.
    paint(2.4);
  } else if (typeof requestAnimationFrame !== 'undefined') {
    raf = requestAnimationFrame(frame);
  }

  return {
    setIllusion(next) {
      current = next;
      paint(current.time);
    },
    repaint() {
      paint(current.time);
    },
    dispose() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', resize);
      }
    },
  };
}
