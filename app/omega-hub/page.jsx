'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { SECTORS, getSector, HAZARD_LABEL } from './content';
import { TERMINAL_BANNER, runCommand } from './terminal';
import {
  CATALOG, createBackpack, addItem, removeItem, listItems, itemCount,
  summarizeBackpack, serializeBackpack, deserializeBackpack,
} from './backpack';

// Rebuilt from the Omega-Hub repo ("NEXUS • Sector Gateway").
// The source was a 3D world browser with a cloud sign-in widget
// (auth-terminal.js) and a cloud-backed 3D-model inventory
// (neural-backpack.js). All backends are stripped: this is a local hub
// portal with four tabs — hub overview, a procedural sector view, a
// clearly-simulated terminal, and a local loadout panel.

const TABS = ['HUB', 'WORLD', 'TERMINAL', 'BACKPACK'];
const mono = { fontFamily: 'monospace' };

function makeGuestTag() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'GUEST-' + s;
}

// Procedural sector vista: gradient sky, stars, portal ring, drifting motes.
function SectorCanvas({ sector, reducedMotion }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0, w = 0, h = 0;
    const resize = () => {
      const r = canvas.parentElement.getBoundingClientRect();
      w = Math.max(280, r.width); h = Math.max(220, Math.min(420, r.width * 0.5));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let seed = sector.id.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const rnd = (() => { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
    const stars = Array.from({ length: 130 }, () => ({ x: rnd(), y: rnd() * 0.7, r: 0.4 + rnd() * 1.4, p: rnd() * 6.28 }));
    const motes = Array.from({ length: 26 }, () => ({ x: rnd(), y: 0.3 + rnd() * 0.6, s: 0.3 + rnd() * 0.9, v: 0.02 + rnd() * 0.06 }));
    let t = 0, last = performance.now();

    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!reducedMotion) t += dt;

      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, sector.palette.skyTop);
      g.addColorStop(1, sector.palette.skyBottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      for (const s of stars) {
        ctx.globalAlpha = reducedMotion ? 0.7 : 0.4 + 0.3 * Math.sin(t * 1.4 + s.p);
        ctx.fillStyle = '#dff6ff';
        ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r, 0, 6.29); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ground
      ctx.fillStyle = sector.palette.ground;
      ctx.fillRect(0, h * 0.78, w, h * 0.22);
      ctx.strokeStyle = sector.palette.accent + '55';
      ctx.beginPath(); ctx.moveTo(0, h * 0.78); ctx.lineTo(w, h * 0.78); ctx.stroke();

      // portal ring
      const cx = w / 2, cy = h * 0.46, R = Math.min(w, h) * 0.2;
      ctx.strokeStyle = sector.palette.accent;
      ctx.lineWidth = 5;
      ctx.shadowColor = sector.palette.accent;
      ctx.shadowBlur = 22;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.29); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = sector.palette.accent + '88';
      ctx.lineWidth = 2;
      const spin = reducedMotion ? 0 : t * 0.7;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * (0.55 + i * 0.14), spin + i * 2.1, spin + i * 2.1 + 3.6);
        ctx.stroke();
      }

      // drifting motes
      ctx.fillStyle = sector.palette.accent;
      for (const m of motes) {
        if (!reducedMotion) { m.y -= dt * m.v; if (m.y < 0.15) m.y = 0.9; }
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(m.x * w, m.y * h, m.s * 2, 0, 6.29); ctx.fill();
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [sector, reducedMotion]);

  return <canvas ref={ref} style={{ display: 'block', borderRadius: '8px', width: '100%' }} aria-label={'Procedural vista of ' + sector.name} />;
}

function GearIcon({ hue, kind }) {
  // Procedural glyph per item kind: tool = diamond, armor = shield-ish square, trinket = circle, consumable = triangle.
  const shape =
    kind === 'tool' ? <polygon points="20,4 36,20 20,36 4,20" /> :
    kind === 'armor' ? <rect x="7" y="7" width="26" height="26" rx="6" /> :
    kind === 'consumable' ? <polygon points="20,5 35,33 5,33" /> :
    <circle cx="20" cy="20" r="14" />;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <g fill={`hsla(${hue},90%,55%,0.25)`} stroke={`hsl(${hue},95%,60%)`} strokeWidth="2">{shape}</g>
      <circle cx="20" cy="20" r="4" fill={`hsl(${hue},95%,65%)`} />
    </svg>
  );
}

export default function OmegaHubPage() {
  const [tab, setTab] = useState('HUB');
  const [sectorId, setSectorId] = useState('nexus-prime');
  const [guestTag, setGuestTag] = useState('GUEST-????');
  const [lines, setLines] = useState(TERMINAL_BANNER);
  const [cmd, setCmd] = useState('');
  const [bp, setBp] = useState(createBackpack);
  const [reducedMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const termEndRef = useRef(null);
  const sector = getSector(sectorId);

  useEffect(() => {
    try {
      let tag = localStorage.getItem('omega-hub-guest');
      if (!tag) { tag = makeGuestTag(); localStorage.setItem('omega-hub-guest', tag); }
      setGuestTag(tag);
      const saved = localStorage.getItem('omega-hub-backpack');
      if (saved) setBp(deserializeBackpack(saved));
    } catch { /* storage unavailable — play session-only */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem('omega-hub-backpack', serializeBackpack(bp)); } catch { /* ignore */ }
  }, [bp]);

  useEffect(() => {
    termEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, tab]);

  const submitCmd = useCallback((e) => {
    e.preventDefault();
    const result = runCommand(cmd, {
      guestTag,
      backpackSummary: () => summarizeBackpack(bp),
    });
    if (result.clear) setLines(TERMINAL_BANNER);
    else setLines((prev) => [...prev, '> ' + cmd, ...result.lines].slice(-120));
    setCmd('');
  }, [cmd, guestTag, bp]);

  const tabBtn = (t) => ({
    ...mono,
    padding: '10px 14px', minHeight: '44px', cursor: 'pointer',
    background: tab === t ? 'rgba(0,240,255,0.14)' : 'transparent',
    border: '1px solid ' + (tab === t ? '#00f0ff' : 'rgba(0,240,255,0.3)'),
    color: tab === t ? '#00f0ff' : 'rgba(224,255,255,0.7)',
    borderRadius: '6px', letterSpacing: '2px', fontSize: '0.8rem', fontWeight: 'bold',
  });

  return (
    <main style={{ ...mono, minHeight: '100dvh', background: '#010409', color: '#e0ffff', padding: '18px 16px 60px' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', letterSpacing: '4px', color: '#00f0ff', textShadow: '0 0 14px rgba(0,240,255,0.6)' }}>
              OMEGA HUB
            </h1>
            <div style={{ fontSize: '0.75rem', color: 'rgba(224,255,255,0.6)', letterSpacing: '1px', marginTop: '4px' }}>
              Sector gateway — local build, no login, no uplink
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#00ffaa', border: '1px solid rgba(0,255,170,0.4)', borderRadius: '6px', padding: '8px 12px' }}>
            {guestTag} · guest session
          </div>
        </header>

        <nav style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }} aria-label="Hub sections">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={tabBtn(t)} aria-pressed={tab === t}>{t}</button>
          ))}
        </nav>

        {tab === 'HUB' && (
          <section>
            <p style={{ color: 'rgba(224,255,255,0.75)', fontSize: '0.9rem' }}>
              Four sectors are charted. Pick one, then open the WORLD tab to look through the portal.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
              {SECTORS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setSectorId(s.id); setTab('WORLD'); }}
                  style={{
                    ...mono, textAlign: 'left', cursor: 'pointer', padding: '16px',
                    background: 'rgba(0,0,0,0.5)', border: '1px solid ' + s.palette.accent,
                    borderRadius: '8px', color: '#e0ffff',
                  }}
                >
                  <div style={{ color: s.palette.accent, fontSize: '0.7rem', letterSpacing: '3px' }}>{s.tag}</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 'bold', letterSpacing: '2px', margin: '6px 0' }}>{s.name}</div>
                  <div style={{ fontSize: '0.82rem', color: 'rgba(224,255,255,0.7)', lineHeight: 1.5 }}>{s.desc}</div>
                  <div style={{ marginTop: '10px', fontSize: '0.72rem', color: HAZARD_LABEL[s.hazard] === 'CALM' ? '#00ffaa' : '#ffaa00' }}>
                    [{HAZARD_LABEL[s.hazard]}]
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {tab === 'WORLD' && (
          <section>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {SECTORS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSectorId(s.id)}
                  style={{
                    ...mono, padding: '8px 12px', minHeight: '44px', cursor: 'pointer', fontSize: '0.75rem',
                    background: s.id === sectorId ? 'rgba(0,240,255,0.14)' : 'transparent',
                    border: '1px solid ' + s.palette.accent, color: s.palette.accent, borderRadius: '6px',
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
            <SectorCanvas sector={sector} reducedMotion={reducedMotion} />
            <p style={{ color: 'rgba(224,255,255,0.75)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              <strong style={{ color: sector.palette.accent }}>{sector.name}</strong> — {sector.desc}
            </p>
          </section>
        )}

        {tab === 'TERMINAL' && (
          <section>
            <div style={{
              background: '#000', border: '1px solid rgba(0,240,255,0.4)', borderRadius: '8px',
              padding: '14px', height: '340px', overflowY: 'auto', fontSize: '0.85rem', lineHeight: 1.6,
            }} aria-label="Simulated terminal output">
              {lines.map((l, i) => (
                <div key={i} style={{ color: l.startsWith('>') ? '#00ffaa' : 'rgba(224,255,255,0.85)', whiteSpace: 'pre-wrap' }}>{l}</div>
              ))}
              <div ref={termEndRef} />
            </div>
            <form onSubmit={submitCmd} style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <span style={{ color: '#00ffaa', padding: '10px 0' }}>&gt;</span>
              <input
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
                placeholder="type HELP and press enter"
                aria-label="Terminal command"
                autoComplete="off"
                style={{
                  ...mono, flex: 1, background: '#000', border: '1px solid rgba(0,240,255,0.4)',
                  borderRadius: '6px', color: '#e0ffff', padding: '10px 12px', fontSize: '0.9rem', minHeight: '44px',
                }}
              />
              <button type="submit" style={{ ...mono, minHeight: '44px', padding: '10px 18px', background: 'rgba(0,240,255,0.12)', border: '1px solid #00f0ff', color: '#00f0ff', borderRadius: '6px', cursor: 'pointer' }}>
                RUN
              </button>
            </form>
            <p style={{ fontSize: '0.75rem', color: 'rgba(224,255,255,0.5)' }}>
              Simulated console — every reply is generated on this device. Nothing is sent anywhere.
            </p>
          </section>
        )}

        {tab === 'BACKPACK' && (
          <section>
            <h2 style={{ fontSize: '1rem', letterSpacing: '3px', color: '#00f0ff' }}>
              NEURAL BACKPACK <span style={{ color: 'rgba(224,255,255,0.5)', fontSize: '0.8rem' }}>({itemCount(bp)} items · stored on this device)</span>
            </h2>
            {listItems(bp).length > 0 && (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
                {listItems(bp).map((i) => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(0,240,255,0.4)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.8rem' }}>
                    <GearIcon hue={i.hue} kind={i.kind} />
                    <span>{i.name} × {i.qty}</span>
                    <button
                      onClick={() => setBp((b) => removeItem(b, i.id))}
                      style={{ ...mono, background: 'transparent', border: '1px solid #ff4d6d', color: '#ff4d6d', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', minHeight: '32px' }}
                      aria-label={'Remove one ' + i.name}
                    >
                      −
                    </button>
                  </div>
                ))}
              </div>
            )}
            <h3 style={{ fontSize: '0.9rem', letterSpacing: '2px', color: 'rgba(224,255,255,0.7)' }}>FIELD CATALOG</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
              {CATALOG.map((c) => (
                <div key={c.id} style={{ border: '1px solid rgba(0,240,255,0.25)', borderRadius: '8px', padding: '14px', background: 'rgba(0,0,0,0.4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <GearIcon hue={c.hue} kind={c.kind} />
                    <div style={{ fontWeight: 'bold', letterSpacing: '1px' }}>{c.name}</div>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(224,255,255,0.65)', marginBottom: '10px' }}>{c.desc}</div>
                  <button
                    onClick={() => setBp((b) => addItem(b, c.id))}
                    style={{ ...mono, width: '100%', minHeight: '44px', background: 'rgba(0,240,255,0.1)', border: '1px solid #00f0ff', color: '#00f0ff', borderRadius: '6px', cursor: 'pointer', letterSpacing: '2px' }}
                  >
                    + STOW
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer style={{ marginTop: '34px', fontSize: '0.72rem', color: 'rgba(224,255,255,0.4)', letterSpacing: '1px' }}>
          OMEGA HUB — offline rebuild. The original phoned home to a telemetry database and required
          a cloud login; this version keeps everything on your device.
        </footer>
        <div aria-hidden="true" style={{ height: 'max(5rem, env(safe-area-inset-bottom))' }} />
      </div>
    </main>
  );
}
