'use client';

import { useEffect, useRef } from 'react';
import { BackButton } from '@/components/ui';
import { HUB_TITLE, HUB_TAGLINE, SIMULATED_NOTE, MODULE_CARDS, STATUS_READOUTS } from './data';

const ACCENT = '#00f2ff';
const INK = '#d9f6ff';

/* Procedural hero: a slow constellation/orbit field drawn on canvas.
 * Replaces the source MP4s. Glow is kept local to the points. */
function ConstellationHero() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    let raf = 0;
    let t = 0;
    const reduced = typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Deterministic star layout (seeded) so the hero looks the same every load.
    let seed = 20260927;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const stars = Array.from({ length: 90 }, () => ({
      x: rand(),
      y: rand(),
      r: 0.8 + rand() * 1.8,
      drift: 0.0004 + rand() * 0.0012,
      phase: rand() * Math.PI * 2,
    }));

    function size() {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, r.width * dpr);
      canvas.height = Math.max(1, r.height * dpr);
    }
    size();
    window.addEventListener('resize', size);

    function draw() {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const orbitR = Math.min(w, h) * 0.3;

      // Orbit rings.
      for (let i = 1; i <= 3; i += 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, orbitR * i * 0.55, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 242, 255, ${0.22 - i * 0.05})`;
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();
      }

      // Orbiting nodes with small localized glows.
      for (let i = 0; i < 3; i += 1) {
        const a = t * (0.25 + i * 0.08) + (i * Math.PI * 2) / 3;
        const x = cx + Math.cos(a) * orbitR * (i + 1) * 0.55;
        const y = cy + Math.sin(a) * orbitR * (i + 1) * 0.55 * 0.72;
        ctx.beginPath();
        ctx.arc(x, y, 4 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = '#aef7ff';
        ctx.shadowColor = 'rgba(0, 242, 255, 0.6)';
        ctx.shadowBlur = 10 * dpr;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Starfield drift.
      for (const s of stars) {
        const x = ((s.x + t * s.drift) % 1) * w;
        const y = s.y * h;
        const tw = 0.35 + 0.35 * Math.sin(t * 2 + s.phase);
        ctx.beginPath();
        ctx.arc(x, y, s.r * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(174, 247, 255, ${tw.toFixed(3)})`;
        ctx.fill();
      }

      // Core.
      ctx.beginPath();
      ctx.arc(cx, cy, 7 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#00f2ff';
      ctx.shadowColor = 'rgba(0, 242, 255, 0.55)';
      ctx.shadowBlur = 16 * dpr;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (!reduced) {
        t += 1 / 60;
        raf = requestAnimationFrame(draw);
      }
    }
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
  }, []);

  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden="true" />;
}

export default function ArtemisHubPage() {
  return (
    <main style={styles.page}>
      <header style={styles.top}>
        <BackButton label="Launcher" />
      </header>

      <section style={styles.hero}>
        <div style={styles.heroVisual} aria-label="Procedural constellation visual">
          <ConstellationHero />
        </div>
        <div style={styles.heroText}>
          <h1 style={styles.title}>{HUB_TITLE}</h1>
          <p style={styles.tagline}>{HUB_TAGLINE}</p>
          <p style={styles.simNote}>{SIMULATED_NOTE}</p>
        </div>
      </section>

      <section aria-label="Artemis modules">
        <h2 style={styles.sectionTitle}>Pocket universes</h2>
        <div style={styles.grid}>
          {MODULE_CARDS.map((c) => (
            <a key={c.id} href={c.route} style={styles.card}>
              <div style={styles.cardKind}>{c.kind}</div>
              <div style={styles.cardName}>{c.name}</div>
              <p style={styles.cardBlurb}>{c.blurb}</p>
              <div style={styles.cardFoot}>
                <span style={styles.cardRoute}>{c.route}</span>
                <span style={styles.cardGo} aria-hidden="true">→</span>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section aria-label="Status readouts">
        <h2 style={styles.sectionTitle}>Status <span style={styles.simPill}>simulated</span></h2>
        <p style={styles.simNote}>{SIMULATED_NOTE}</p>
        <div style={styles.readouts}>
          {STATUS_READOUTS.map((r) => (
            <div key={r.label} style={styles.readout}>
              <div style={styles.readoutLabel}>{r.label}</div>
              <div style={styles.readoutValue}>{r.value}</div>
              <div style={styles.readoutDetail}>{r.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <footer style={styles.footer}>
        <p>
          This hub replaced a page that phoned home with visitor telemetry, harvested IP addresses,
          and shipped video files. None of that is here: the videos became this canvas,
          the trackers were dropped, and every card stays inside this launcher.
        </p>
      </footer>
      <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100dvh',
    background: '#02090d',
    color: INK,
    fontFamily: "'Courier New', ui-monospace, monospace",
    padding: '20px 16px 40px',
    maxWidth: '1040px',
    margin: '0 auto',
  },
  top: { marginBottom: '12px' },
  backLink: { color: ACCENT, textDecoration: 'none', fontSize: '14px' },
  hero: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px',
    alignItems: 'stretch',
    marginBottom: '28px',
  },
  heroVisual: {
    minHeight: '240px',
    border: '1px solid rgba(0, 242, 255, 0.35)',
    borderRadius: '14px',
    overflow: 'hidden',
    background: 'radial-gradient(circle at 50% 50%, #06222b 0%, #02090d 72%)',
  },
  heroText: { display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '8px 4px' },
  title: { margin: 0, fontSize: '34px', letterSpacing: '3px', color: '#ffffff', textTransform: 'uppercase' },
  tagline: { margin: '10px 0 6px', fontSize: '15px', color: '#a8dbe6', lineHeight: 1.6 },
  simNote: { margin: '6px 0 0', fontSize: '12px', color: '#7fa8b3', lineHeight: 1.6 },
  sectionTitle: { fontSize: '18px', color: '#ffffff', margin: '0 0 14px', letterSpacing: '1px' },
  simPill: {
    fontSize: '11px',
    border: '1px solid rgba(0, 242, 255, 0.5)',
    borderRadius: '999px',
    padding: '2px 10px',
    color: ACCENT,
    letterSpacing: '0px',
    verticalAlign: 'middle',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '14px',
    marginBottom: '30px',
  },
  card: {
    display: 'block',
    textDecoration: 'none',
    color: INK,
    border: '1px solid rgba(0, 242, 255, 0.3)',
    borderRadius: '12px',
    padding: '16px',
    background: 'rgba(6, 34, 43, 0.5)',
    transition: 'border-color 0.2s, transform 0.2s',
  },
  cardKind: { fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: ACCENT, marginBottom: '6px' },
  cardName: { fontSize: '20px', color: '#ffffff', marginBottom: '8px' },
  cardBlurb: { fontSize: '13px', lineHeight: 1.6, color: '#a8dbe6', margin: '0 0 12px', minHeight: '62px' },
  cardFoot: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardRoute: { fontSize: '12px', color: '#7fa8b3' },
  cardGo: { color: ACCENT, fontSize: '18px' },
  readouts: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px',
  },
  readout: {
    border: '1px solid rgba(0, 242, 255, 0.25)',
    borderRadius: '10px',
    padding: '14px',
    background: 'rgba(6, 34, 43, 0.35)',
  },
  readoutLabel: { fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#7fa8b3', marginBottom: '6px' },
  readoutValue: { fontSize: '22px', color: '#ffffff', marginBottom: '6px' },
  readoutDetail: { fontSize: '12px', color: '#a8dbe6', lineHeight: 1.5 },
  footer: { marginTop: '28px', fontSize: '12px', color: '#5f828c', lineHeight: 1.7, maxWidth: '720px' },
};
