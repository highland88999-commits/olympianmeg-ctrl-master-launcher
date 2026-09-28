'use client';

/*
 * ARTEMIS — Merlin's personal realm.
 *
 * His command deck and sanctuary in the launcher: the fleet at a glance,
 * quick-launch to his key realms, and a calm status view. Counts come from
 * the real satellite registry — nothing here is invented, nothing is lore.
 *
 * Quiet by design: one restrained starfield, hairline gold rules, motion
 * that yields to prefers-reduced-motion. Zero external requests.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SATELLITES } from '@/lib/i18n/satellites';
import {
  REALM_NAME,
  REDUCED_MOTION_QUERY,
  createStarfield,
  twinkle,
  fleetSummary,
  resolveQuickLaunch,
  formatRealmDate,
} from './realm';

// Established launcher signature: launchPocketUniverse(route, targetPos).
// The hub's fly-in animation is not reachable from inside a satellite route,
// so the realm honors the same signature and carries out the navigation.
function useLaunchPocketUniverse() {
  const router = useRouter();
  return (route, _targetPos) => {
    if (typeof route === 'string' && route.startsWith('/')) router.push(route);
  };
}

const INK = '#e9e6df';
const DIM = '#9a958a';
const GOLD = '#c9a86a';
const HAIRLINE = 'rgba(201,168,106,0.22)';

/* ---------------- Restrained procedural starfield ---------------- */
function Starfield() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia(REDUCED_MOTION_QUERY).matches;
    const stars = createStarfield();
    let w = 0;
    let h = 0;
    let raf = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = canvas.width = Math.max(1, Math.floor(r.width));
      h = canvas.height = Math.max(1, Math.floor(r.height));
    };
    resize();
    window.addEventListener('resize', resize);
    const paint = (t) => {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const a = reduce ? 0.5 : 0.28 + 0.32 * twinkle(s, t);
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fillStyle = s.warm
          ? `rgba(201,168,106,${a})`
          : `rgba(233,230,223,${a * 0.9})`;
        ctx.fill();
      }
    };
    if (reduce) {
      paint(0); // single static frame — no motion
    } else {
      const loop = (ms) => {
        paint(ms / 1000);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}

/* ---------------- Small building blocks ---------------- */
function Eyebrow({ children }) {
  return (
    <div
      style={{
        fontSize: 11,
        letterSpacing: 4,
        color: GOLD,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div
      style={{
        border: `1px solid ${HAIRLINE}`,
        borderRadius: 10,
        padding: '18px 20px',
        background: 'rgba(255,255,255,0.025)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default function ArtemisRealm() {
  const launchPocketUniverse = useLaunchPocketUniverse();
  const summary = useMemo(() => fleetSummary(SATELLITES), []);
  const quickLaunch = useMemo(() => resolveQuickLaunch(SATELLITES), []);
  const today = useMemo(() => formatRealmDate(new Date()), []);

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#060809',
        color: INK,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        position: 'relative',
      }}
    >
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .artemis * { transition: none !important; animation: none !important; }
        }
      `}</style>
      <Starfield />
      <div className="artemis" style={{ position: 'relative', zIndex: 1 }}>
        <main
          style={{
            maxWidth: 1080,
            margin: '0 auto',
            padding: '56px 24px 64px',
          }}
        >
          {/* Header */}
          <header style={{ marginBottom: 44 }}>
            <Eyebrow>PERSONAL REALM</Eyebrow>
            <h1
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontWeight: 400,
                fontSize: 'clamp(44px, 8vw, 76px)',
                letterSpacing: 6,
                margin: '0 0 12px',
                color: INK,
              }}
            >
              {REALM_NAME}
            </h1>
            <p style={{ color: DIM, fontSize: 15, margin: '0 0 6px', maxWidth: 560 }}>
              Merlin&rsquo;s command deck. The fleet at a glance, and a clear
              path to every realm he has built.
            </p>
            <p style={{ color: DIM, fontSize: 13, margin: 0 }}>{today}</p>
          </header>

          {/* Fleet status — counts derived from the real registry */}
          <section aria-label="Fleet status" style={{ marginBottom: 44 }}>
            <Eyebrow>THE FLEET</Eyebrow>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 12,
              }}
            >
              <Card style={{ borderColor: 'rgba(201,168,106,0.45)' }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: DIM, marginBottom: 8 }}>
                  SATELLITES
                </div>
                <div
                  style={{
                    fontFamily: 'Georgia, serif',
                    fontSize: 40,
                    color: GOLD,
                    lineHeight: 1,
                  }}
                >
                  {summary.total}
                </div>
                <div style={{ fontSize: 12, color: DIM, marginTop: 8 }}>
                  pocket universes in orbit
                </div>
              </Card>
              {summary.constellations.map((c) => (
                <Card key={c.name}>
                  <div style={{ fontSize: 11, letterSpacing: 2, color: DIM, marginBottom: 8 }}>
                    {c.name}
                  </div>
                  <div
                    style={{
                      fontFamily: 'Georgia, serif',
                      fontSize: 40,
                      color: INK,
                      lineHeight: 1,
                    }}
                  >
                    {c.count}
                  </div>
                  <div style={{ fontSize: 12, color: DIM, marginTop: 8 }}>
                    {c.count === 1 ? 'satellite' : 'satellites'}
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {/* Quick launch */}
          <section aria-label="Quick launch" style={{ marginBottom: 44 }}>
            <Eyebrow>QUICK LAUNCH</Eyebrow>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              {quickLaunch.map((q) => (
                <button
                  key={q.key}
                  onClick={() => launchPocketUniverse(q.route, q.pos)}
                  style={{
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                    border: `1px solid ${HAIRLINE}`,
                    borderRadius: 10,
                    padding: '18px 20px',
                    background: 'rgba(255,255,255,0.025)',
                    color: INK,
                    minHeight: 44,
                    transition: 'border-color 0.2s ease, background 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(201,168,106,0.6)';
                    e.currentTarget.style.background = 'rgba(201,168,106,0.06)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = HAIRLINE;
                    e.currentTarget.style.background = 'rgba(255,255,255,0.025)';
                  }}
                >
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      letterSpacing: 0.5,
                      marginBottom: 6,
                    }}
                  >
                    {q.label}
                  </div>
                  <div style={{ fontSize: 13, color: DIM }}>{q.blurb}</div>
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: 2,
                      color: GOLD,
                      marginTop: 12,
                      opacity: 0.85,
                    }}
                  >
                    ENTER&nbsp;&nbsp;&rarr;
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Constellations at a glance */}
          <section aria-label="Constellations" style={{ marginBottom: 44 }}>
            <Eyebrow>CONSTELLATIONS</Eyebrow>
            <div style={{ display: 'grid', gap: 10 }}>
              {summary.sections.map((s) => (
                <Card
                  key={s.name}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 16,
                    padding: '14px 20px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, letterSpacing: 2, fontWeight: 600 }}>
                      {s.name}
                    </div>
                    <div style={{ fontSize: 13, color: DIM, marginTop: 4 }}>
                      {s.blurb}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: 'Georgia, serif',
                      fontSize: 26,
                      color: GOLD,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.count}
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {/* Footer */}
          <footer
            style={{
              borderTop: `1px solid ${HAIRLINE}`,
              paddingTop: 24,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <a
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 44,
                padding: '0 18px',
                border: `1px solid ${HAIRLINE}`,
                borderRadius: 8,
                color: INK,
                fontSize: 14,
                textDecoration: 'none',
              }}
            >
              &larr;&nbsp;&nbsp;Return to the launcher
            </a>
            <span style={{ fontSize: 12, color: DIM, letterSpacing: 1 }}>
              {summary.total} satellites &middot; counts from the registry
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
