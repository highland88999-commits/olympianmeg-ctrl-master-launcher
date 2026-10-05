// World Engine — landing / gateway.
//
// The launcher already owns authentication, so this page only reflects the
// existing session: signed-in users get an Enter button, guests get a plain
// explanation and a way back. (The original had its own email/Google login
// system, which is intentionally not ported.)
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

function Glyph({ size = 15, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ flexShrink: 0 }}>{children}</svg>
  );
}

const IC = {
  arrow: <path d="M5 12h14m0 0l-6-6m6 6l-6 6" />,
  back: <path d="M19 12H5m0 0l6-6m-6 6l6 6" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" /></>,
  flame: <path d="M12 2c1 4-4 6-4 11a4 4 0 0 0 8 0c0-2-1-3-1-3s3 1 3 5a6 6 0 0 1-12 0C6 8 12 6 12 2z" />,
};

export default function WorldEngineLanding() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [cloudOffline, setCloudOffline] = useState(false);
  const [amb, setAmb] = useState('video');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('worldengine-amb');
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (saved === 'video' || saved === 'still' || saved === 'off') setAmb(saved);
      else if (reduce) setAmb('still');
    } catch { /* default video */ }
  }, []);

  const cycleAmb = () => {
    const order = ['video', 'still', 'off'];
    const next = order[(order.indexOf(amb) + 1) % order.length];
    setAmb(next);
    try { window.localStorage.setItem('worldengine-amb', next); } catch { /* ignore */ }
  };

  useEffect(() => {
    let subscription;
    try {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setChecking(false);
      });
      ({ data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s)));
    } catch {
      // No database connection — honest banner instead of a crash.
      setCloudOffline(true);
      setChecking(false);
    }
    return () => { if (subscription) subscription.unsubscribe(); };
  }, []);

  return (
    <main className="relative min-h-dvh flex items-center justify-center bg-black font-mono overflow-hidden">
      <style>{`.we-pulse { animation: we-pulse 1.6s ease-in-out infinite; }
@keyframes we-pulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .we-pulse { animation: none; } }
.we-tex { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 0.72 0 0 0 0 0.42 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E"); background-size: 140px 140px; }
.we-btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; }`}</style>
      {/* Ambient backdrop: video loop -> still -> off, persisted */}
      {amb !== 'off' && (
        <div className="absolute inset-0 z-0" aria-hidden="true">
          {amb === 'video' ? (
            <video autoPlay muted loop playsInline preload="metadata" className="w-full h-full object-cover opacity-40"
              poster="/images/world-engine/worldengine-bg.webp" src="/images/world-engine/worldengine-bg-loop.mp4" />
          ) : (
            <img src="/images/world-engine/worldengine-bg.webp" alt="" className="w-full h-full object-cover opacity-40" />
          )}
        </div>
      )}
      <div className="absolute inset-0 z-0" aria-hidden="true"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.45) 40%, rgba(0,0,0,0.88) 100%)' }} />
      {/* Ambient backdrop: layered CSS gradients, no hotlinked media */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 45% at 50% 38%, rgba(249,115,22,0.10), transparent 70%), radial-gradient(ellipse 40% 30% at 72% 70%, rgba(255,215,0,0.06), transparent 70%), transparent',
        }}
      />
      <div
        className="absolute inset-0 z-0 opacity-[0.07]"
        style={{ backgroundImage: 'radial-gradient(#f97316 1px, transparent 1px)', backgroundSize: '26px 26px' }}
      />

      <div className="relative z-10 w-full max-w-lg p-6 flex flex-col items-center text-center">
        <div className="mb-5 text-amber-400" style={{ filter: 'drop-shadow(0 0 14px rgba(249,115,22,0.5))' }}>
          <Glyph size={44}>{IC.globe}</Glyph>
        </div>
        <p className="text-[#ffd700] text-xs tracking-[0.5em] uppercase mb-4">AI Programs · Thoth</p>
        <h1 className="text-5xl md:text-6xl font-bold text-white tracking-[0.2em] mb-4">
          WORLD BUILDER
        </h1>
        <div className="flex items-center gap-3 mb-2 text-amber-200/70">
          <Glyph size={15}>{IC.flame}</Glyph>
          <span className="w-24 h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />
          <Glyph size={15}>{IC.flame}</Glyph>
        </div>
        {cloudOffline && (
          <div className="we-tex border border-yellow-500/40 bg-yellow-500/10 p-4 w-full mb-6">
            <p className="text-yellow-200 text-xs leading-relaxed tracking-widest">
              Cloud features are offline — this page needs the database connection.
              AI generation, saving, and sign-in are unavailable until it's set up.
            </p>
          </div>
        )}
        <p className="text-gray-400 text-sm leading-relaxed mb-10 max-w-md">
          Describe a world and watch it take shape: terrain, weather, characters,
          vehicles, weapons, and objects — generated by AI and rendered live in 3D.
        </p>

        {checking ? (
          <p className="we-pulse flex items-center gap-3 text-[#ffd700] text-sm tracking-widest">
            <Glyph size={16}>{IC.globe}</Glyph>Checking session…
          </p>
        ) : session ? (
          <div className="flex flex-col items-center gap-4 w-full">
            <p className="text-[#ffd700] text-xs tracking-[0.3em] uppercase">
              Signed in as {session.user.email}
            </p>
            <button
              onClick={() => router.push('/world-engine/dashboard')}
              className="we-btn w-full py-5 border-2 border-[#f97316] bg-[#f97316]/10 text-white text-2xl font-bold tracking-[0.3em] hover:bg-[#f97316] hover:text-black transition-all"
            >
              ENTER <Glyph size={22}>{IC.arrow}</Glyph>
            </button>
            <p className="text-gray-500 text-xs">
              20 free AI generations every month. Extra generations use Aether credits.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 w-full">
            <div className="we-tex border border-gray-800 bg-black/60 p-6 w-full">
              <p className="text-gray-300 text-sm leading-relaxed mb-4">
                You are browsing as a guest. You can look around, but AI generation
                and saving need a signed-in account.
              </p>
              <button
                onClick={() => router.push('/world-engine/dashboard')}
                className="we-btn w-full py-4 border border-[#f97316] text-[#fdba74] font-bold tracking-[0.2em] hover:bg-[#f97316] hover:text-black transition-all"
              >
                <Glyph size={18}>{IC.eye}</Glyph>BROWSE AS GUEST
              </button>
            </div>
            <p className="text-gray-500 text-xs">Sign in from the launcher to unlock everything.</p>
          </div>
        )}

        <div className="mt-10 flex items-center gap-6">
          <Link href="/" className="we-btn text-xs text-gray-500 hover:text-white tracking-[0.2em] uppercase transition-colors">
            <Glyph size={14}>{IC.back}</Glyph>Back to launcher
          </Link>
          <button
            type="button"
            onClick={cycleAmb}
            className="we-btn text-xs text-gray-500 hover:text-white tracking-[0.2em] uppercase transition-colors"
            aria-label="Cycle background ambience: video, still, off"
          >
            <Glyph size={14}>{IC.video}</Glyph>{amb === 'video' ? 'Video' : amb === 'still' ? 'Still' : 'Off'}
          </button>
        </div>
        {/* Safari bottom-bar clearance: lets the final content rest above the browser bar */}
        <div aria-hidden="true" className="player-clear" />
      </div>
    </main>
  );
}
