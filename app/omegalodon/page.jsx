'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PLATFORMS, makeGuestTag, FIELD_KIT } from './gateway';

// Rebuilt from the Omegalodon repo: "ECOSYSTEM GATEWAY", a central portal
// directory. The source played two looping remote videos behind everything,
// linked out to four hosted apps, and had Login / Create Account buttons
// wired to nothing (with a hardcoded display name). This rebuild keeps the
// layout and gold-on-black style, but: the backdrop is a procedural canvas
// (dark water + tech grid), only Omega Hub links anywhere (to /omega-hub,
// part of this build), and sign-in is a clearly-labeled simulated guest
// session stored on this device.

function Backdrop() {
  const ref = useRef(null);
  const [reducedMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    let t = 0, last = performance.now();
    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!reducedMotion) t += dt;
      const w = window.innerWidth, h = window.innerHeight;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      // dark water: layered sine bands
      for (let b = 0; b < 5; b++) {
        const yBase = h * (0.35 + b * 0.14);
        ctx.beginPath();
        for (let x = 0; x <= w; x += 14) {
          const y = yBase + Math.sin(x * 0.012 + t * (0.5 + b * 0.22) + b * 2.1) * (10 + b * 7);
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(0,180,220,${0.10 - b * 0.012})`;
        ctx.lineWidth = 2 + b;
        ctx.stroke();
      }

      // tech grid overlay, faint
      ctx.strokeStyle = 'rgba(0,242,255,0.05)';
      ctx.lineWidth = 1;
      const gs = 64;
      for (let x = 0; x < w; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      // drifting gold motes
      ctx.fillStyle = 'rgba(255,215,0,0.35)';
      for (let i = 0; i < 40; i++) {
        const mx = ((i * 173.3 + t * (8 + (i % 5) * 4)) % (w + 40)) - 20;
        const my = (i * 97.7) % h;
        ctx.fillRect(mx, my, 2, 2);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [reducedMotion]);
  return <canvas ref={ref} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100dvh', zIndex: 0, pointerEvents: 'none', opacity: 0.9 }} aria-hidden="true" />;
}

export default function EcosystemGateway() {
  const [guest, setGuest] = useState(null);
  const [kitOpen, setKitOpen] = useState(false);
  const [kit, setKit] = useState([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('omegalodon-guest');
      if (saved) setGuest(saved);
      const k = localStorage.getItem('omegalodon-kit');
      if (k) setKit(JSON.parse(k));
    } catch { /* ignore */ }
  }, []);

  const signIn = () => {
    const tag = makeGuestTag();
    setGuest(tag);
    try { localStorage.setItem('omegalodon-guest', tag); } catch { /* ignore */ }
  };
  const signOut = () => {
    setGuest(null);
    try { localStorage.removeItem('omegalodon-guest'); } catch { /* ignore */ }
  };
  const toggleKitItem = (id) => {
    setKit((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem('omegalodon-kit', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const goldBtn = {
    display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'transparent',
    border: '1px solid rgba(255, 215, 0, 0.7)', color: '#ffd700', padding: '8px 15px',
    borderRadius: '4px', cursor: 'pointer', fontFamily: 'monospace', minHeight: '44px',
    boxShadow: '0 0 10px rgba(255, 215, 0, 0.1)',
  };

  return (
    <main style={{
      minHeight: '100dvh', width: '100vw', color: '#e0ffff', fontFamily: 'monospace',
      position: 'relative', backgroundColor: '#000',
    }}>
      <Backdrop />

      <div style={{ position: 'relative', zIndex: 2, width: '100%', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        <header style={{
          width: '100%', display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
          padding: '15px 30px', gap: '15px', backgroundColor: 'transparent', boxSizing: 'border-box', flexWrap: 'wrap',
        }}>
          <button style={goldBtn} onClick={() => setKitOpen((o) => !o)} aria-expanded={kitOpen}>
            <span aria-hidden="true">🎒</span> Backpack{kit.length > 0 ? ` (${kit.length})` : ''}
          </button>

          {!guest ? (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={signIn}
                title="Simulated guest session — no account is created"
                style={{
                  backgroundColor: 'transparent', border: 'none', color: '#e0ffff',
                  padding: '8px 15px', cursor: 'pointer', fontFamily: 'monospace',
                  textDecoration: 'underline', minHeight: '44px',
                }}
              >
                Guest Sign-In
              </button>
              <span style={{ fontSize: '0.7rem', color: 'rgba(224,255,255,0.5)' }}>(simulated · local only)</span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ color: '#ffd700', fontSize: '0.9rem' }}>
                Visiting as: <strong>{guest}</strong> <span style={{ color: 'rgba(224,255,255,0.5)', fontSize: '0.75rem' }}>(simulated)</span>
              </div>
              <button
                onClick={signOut}
                style={{ ...goldBtn, borderColor: 'rgba(255,255,255,0.3)', color: '#e0ffff' }}
              >
                Leave
              </button>
            </div>
          )}
        </header>

        {kitOpen && (
          <div style={{
            width: '100%', maxWidth: '600px', padding: '0 20px', boxSizing: 'border-box', marginBottom: '10px',
          }}>
            <div style={{
              border: '1px solid rgba(255,215,0,0.5)', borderRadius: '8px', padding: '16px 20px',
              backgroundColor: 'rgba(0,0,0,0.75)',
            }}>
              <div style={{ color: '#ffd700', letterSpacing: '2px', marginBottom: '6px' }}>FIELD KIT — packed on this device</div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(224,255,255,0.6)', marginBottom: '12px' }}>
                Tap to pack or unpack. For the full loadout, visit the Omega Hub.
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {FIELD_KIT.map((item) => {
                  const packed = kit.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleKitItem(item.id)}
                      aria-pressed={packed}
                      style={{
                        fontFamily: 'monospace', minHeight: '44px', padding: '8px 14px', cursor: 'pointer',
                        borderRadius: '6px', border: '1px solid ' + (packed ? '#ffd700' : 'rgba(255,215,0,0.35)'),
                        background: packed ? 'rgba(255,215,0,0.12)' : 'transparent',
                        color: packed ? '#ffd700' : 'rgba(224,255,255,0.7)',
                      }}
                    >
                      {packed ? '✓ ' : '+ '}{item.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginBottom: '40px', marginTop: '5vh', padding: '0 20px' }}>
          <h1 style={{
            fontSize: '2.5rem', color: '#00f2ff',
            textShadow: '0 0 15px rgba(0, 255, 255, 0.8), 0 0 30px rgba(0, 255, 255, 0.4)',
            letterSpacing: '2px', marginBottom: '10px',
          }}>
            ECOSYSTEM GATEWAY
          </h1>
          <p style={{ color: 'rgba(224, 255, 255, 0.9)', fontSize: '1rem', textShadow: '0 2px 5px rgba(0,0,0,0.9)' }}>
            Select a platform to connect to the network.
          </p>
        </div>

        <div style={{
          display: 'flex', flexDirection: 'column', gap: '20px', width: '100%',
          maxWidth: '600px', padding: '0 20px', boxSizing: 'border-box', marginBottom: '50px',
        }}>
          {PLATFORMS.map((app) => {
            const online = app.status === 'ONLINE' && app.route;
            const card = (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <h2 style={{
                    margin: 0, fontSize: '1.2rem', color: '#ffffff', letterSpacing: '1px',
                    textShadow: '0 2px 4px rgba(0,0,0,0.9)',
                  }}>
                    {app.title}
                  </h2>
                  <span style={{
                    fontSize: '0.7rem', color: online ? '#ffd700' : 'rgba(224,255,255,0.5)',
                    backgroundColor: 'transparent', padding: '3px 8px', borderRadius: '12px',
                    border: '1px solid ' + (online ? 'rgba(255, 215, 0, 0.5)' : 'rgba(224,255,255,0.25)'),
                    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                  }}>
                    {app.status}
                  </span>
                </div>
                <p style={{
                  margin: 0, color: 'rgba(224, 255, 255, 0.8)', fontSize: '0.85rem',
                  lineHeight: '1.4', textShadow: '0 2px 4px rgba(0,0,0,0.9)',
                }}>
                  {app.description}
                </p>
                {app.note && (
                  <p style={{ margin: '8px 0 0 0', color: 'rgba(224,255,255,0.5)', fontSize: '0.75rem' }}>
                    {app.note}
                  </p>
                )}
              </>
            );
            const style = {
              display: 'block', textDecoration: 'none', backgroundColor: 'transparent',
              border: '1px solid rgba(255, 215, 0, 0.6)', borderRadius: '8px', padding: '20px 25px',
              boxShadow: '0 0 15px rgba(255, 215, 0, 0.15)', color: 'inherit',
              opacity: online ? 1 : 0.75,
            };
            return online ? (
              <Link key={app.id} href={app.route} style={{ ...style, cursor: 'pointer' }}>{card}</Link>
            ) : (
              <div key={app.id} style={{ ...style, cursor: 'default' }} aria-disabled="true">{card}</div>
            );
          })}
        </div>

        <footer style={{
          fontSize: '0.72rem', color: 'rgba(224,255,255,0.45)', letterSpacing: '1px',
          padding: '0 20px 30px', textAlign: 'center', maxWidth: '600px',
        }}>
          ECOSYSTEM GATEWAY — offline rebuild. The original streamed remote video and linked
          to external apps; this version draws its own backdrop and keeps every session local.
        </footer>
        <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
      </div>
    </main>
  );
}
