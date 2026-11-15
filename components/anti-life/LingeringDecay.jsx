// components/anti-life/LingeringDecay.jsx
// The lingering decay heartbeat — mounted once in the root layout.
//
// ANTI-LIFE LINGERING DECAY (Merlin, 2026-11-15): the effect follows
// the carrier everywhere for the remaining 10 minutes. This component
// is the "everywhere": it loads the carrier's timer from localStorage,
// ticks it once a second, renders the decay over the whole app (the
// same bloom → ash drain as the Anti-Life art piece — desaturation,
// darkening, falling ash, deepening as the timer runs down), writes
// the carrier's decayed spots to the shared table as they move, and
// checks infection — a non-carrier standing on effected ground
// catches a fresh 10 minutes.
//
// What it NEVER does: grant the effect by itself. A grant comes only
// from visiting /anti-life (source 'anti-life') or from an infection
// (source 'contagion'). When the timer dies the overlays lift, the
// carrier's spots die with it, and the only way back is the return
// to Anti-Life. The chain never renews itself.
//
// The sync client no-ops cleanly when the spots table is missing:
// the carrier still decays their own view, nobody else is infected,
// nothing errors. No fake contagion, ever.

'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  POSITION_EVENT,
  elapsedFraction,
  findInfection,
  formatRemaining,
  grantCarrier,
  isCarrierActive,
  loadCarrier,
  overlayStrength,
  remainingMs,
} from '@/lib/anti-life/lingering';
import { createDecaySpotsClient } from '@/lib/anti-life/decay-spots';

const ASH_COUNT = 42;

// The heartbeat's layer (Merlin, 2026-11-15 — the Earth 2
// follow-through fix): the overlays + pill must sit above EVERY
// persistent world root, or the decay stops following the carrier
// the moment they enter that world. Earth 2's world root is the
// highest persistent layer on the platform — the "Earth Console
// (80)" in the Concourse's z-order comment — so the heartbeat
// lives at 85/86: above the Earth Console and every other world
// root (all the rest are bare fixed inset-0, z-auto), and below
// the transient modal layers (notifications/popovers at 88,
// dialogs at 90+, the program menu at 40000), which still cover
// the pill while they are open, as a modal should. The heartbeat
// never disturbs a world's own layering — it only rises above it.
const HEARTBEAT_OVERLAY_Z = 85;
const HEARTBEAT_PILL_Z = 86;

function AshCanvas({ opacity }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let running = true;
    let last = performance.now();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener('resize', resize);
    const parts = Array.from({ length: ASH_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: (0.6 + Math.random() * 1.8) * dpr,
      v: 0.012 + Math.random() * 0.035, // fraction of height per second
      drift: (Math.random() - 0.5) * 0.02,
      ph: Math.random() * Math.PI * 2,
    }));
    const loop = (t) => {
      if (!running) return;
      const dt = Math.min(0.1, (t - last) / 1000 || 0.016);
      last = t;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(205, 195, 185, 0.6)';
      for (const p of parts) {
        p.y += p.v * dt;
        p.x += Math.sin(t / 1600 + p.ph) * p.drift * dt;
        if (p.y > 1.05) {
          p.y = -0.05;
          p.x = Math.random();
        }
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.s, 0, 6.2832);
        ctx.fill();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 h-full w-full"
      style={{ zIndex: HEARTBEAT_OVERLAY_Z, opacity }}
    />
  );
}

export default function LingeringDecayHeartbeat() {
  const pathname = usePathname();
  const [view, setView] = useState({ active: false, remainingMs: 0, source: null, justInfected: false });
  const [reducedMotion, setReducedMotion] = useState(false);
  const carrierRef = useRef(null);
  const spotsRef = useRef([]);
  const latestPosRef = useRef(null);
  const clientRef = useRef(null);
  const worldRef = useRef(typeof window !== 'undefined' ? window.location.pathname : '/');
  const wasActiveRef = useRef(false);
  const infectedFlashUntilRef = useRef(0);

  useEffect(() => {
    try {
      const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
      setReducedMotion(!!(mq && mq.matches));
    } catch { /* desktop default: motion on */ }

    carrierRef.current = loadCarrier(window.localStorage);
    wasActiveRef.current = isCarrierActive(carrierRef.current);

    const onPosition = (e) => {
      const d = e && e.detail ? e.detail : null;
      if (d && typeof d.world === 'string') latestPosRef.current = d;
    };
    window.addEventListener(POSITION_EVENT, onPosition);

    let cancelled = false;
    let client = null;
    (async () => {
      try {
        let userId;
        try {
          const { data } = await supabase.auth.getSession();
          const sessionUser = data && data.session ? data.session.user : null;
          userId = sessionUser ? sessionUser.id : undefined;
        } catch { /* signed-out or unconfigured — guest carrier id */ }
        if (cancelled) return;
        const carrier = carrierRef.current;
        client = createDecaySpotsClient(supabase, {
          world: worldRef.current,
          userId,
          carrierId: carrier ? carrier.carrierId : undefined,
          getPosition: () => latestPosRef.current,
          onSpots: (spots) => {
            if (!cancelled) spotsRef.current = spots || [];
          },
        });
        clientRef.current = client;
        await client.join();
      } catch { /* spots unavailable — local decay only */ }
    })();

    // Headless probe hook (best effort): window.__lingeringDecay.
    try {
      window.__lingeringDecay = {
        get carrier() { return carrierRef.current; },
        get spots() { return spotsRef.current.slice(); },
        remainingMs: () => remainingMs(carrierRef.current),
      };
    } catch { /* noop */ }

    const tick = () => {
      const now = Date.now();
      // World follows navigation.
      let world = worldRef.current;
      try {
        const path = pathname || window.location.pathname;
        if (path && path !== worldRef.current) {
          worldRef.current = path;
          world = path;
          if (clientRef.current) clientRef.current.setWorld(path);
        }
      } catch { /* keep last world */ }

      // The stored row is the source of truth (another tab, or the
      // Anti-Life page, may have granted since our last tick).
      const stored = loadCarrier(window.localStorage);
      carrierRef.current = stored;
      const active = isCarrierActive(stored, now);

      if (active) {
        wasActiveRef.current = true;
        // Moving while a carrier decays the ground behind us.
        try {
          if (clientRef.current) void clientRef.current.update(stored);
        } catch { /* spot write is best effort */ }
        setView((v) => {
          const rem = remainingMs(stored, now);
          const flash = now < infectedFlashUntilRef.current;
          if (v.active && v.source === stored.source && Math.abs(v.remainingMs - rem) < 1500) {
            // Keep the pill stable second-to-second; the infection
            // flash reads for 10 s, then clears on its own.
            return v.justInfected === flash && v.remainingMs === rem ? v
              : { ...v, remainingMs: rem, justInfected: flash };
          }
          return { active: true, remainingMs: rem, source: stored.source, justInfected: flash };
        });
        return;
      }

      // Timer died: our spots die with it (purge best effort — the
      // expiry filters them everywhere even if this never runs).
      if (wasActiveRef.current) {
        wasActiveRef.current = false;
        try {
          if (clientRef.current) void clientRef.current.purgeOwnExpired();
        } catch { /* noop */ }
      }
      setView((v) => (v.active ? { active: false, remainingMs: 0, source: null, justInfected: false } : v));

      // Not a carrier: standing on effected ground infects, fresh
      // 10 minutes. The chain lives only while live spots remain.
      const pos = latestPosRef.current;
      if (!pos || pos.world !== world) return;
      const prevId = stored ? stored.carrierId : null;
      const hit = findInfection(world, pos, spotsRef.current, now, prevId);
      if (!hit) return;
      const fresh = grantCarrier(window.localStorage, 'contagion', now, prevId);
      carrierRef.current = fresh;
      wasActiveRef.current = true;
      infectedFlashUntilRef.current = now + 10000;
      setView({ active: true, remainingMs: remainingMs(fresh, now), source: 'contagion', justInfected: true });
    };

    const iv = setInterval(tick, 1000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(iv);
      window.removeEventListener(POSITION_EVENT, onPosition);
      if (client) client.dispose();
      clientRef.current = null;
      try {
        if (window.__lingeringDecay) delete window.__lingeringDecay;
      } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!view.active) return null;

  const frac = 1 - Math.max(0, Math.min(1, view.remainingMs / (10 * 60 * 1000)));
  const strength = overlayStrength(frac);

  return (
    <>
      {/* Desaturate the world beneath: grey overlay in 'saturation'
          blend takes the colour out without touching layout or taps. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{ zIndex: HEARTBEAT_OVERLAY_Z, backgroundColor: '#8a8a8a', mixBlendMode: 'saturation', opacity: strength.desat }}
      />
      {/* Ashen darkening over the top. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{ zIndex: HEARTBEAT_OVERLAY_Z, backgroundColor: '#241812', mixBlendMode: 'multiply', opacity: strength.darken }}
      />
      {!reducedMotion && <AshCanvas opacity={strength.ash} />}
      {/* The countdown pill: plain English, top centre, never a tap target. */}
      <div
        className="pointer-events-none fixed left-1/2 top-3 -translate-x-1/2 rounded-full border border-red-500/60 bg-black/70 px-4 py-1.5 text-center text-[11px] font-bold tracking-[0.2em] text-red-200"
        style={{ zIndex: HEARTBEAT_PILL_Z }}
        role="status"
      >
        ☠ LINGERING DECAY {formatRemaining(view.remainingMs)} — everything within 1 km withers
        {view.justInfected && (
          <span className="block text-[10px] font-semibold tracking-normal text-red-300/90">
            caught from decayed ground — a fresh 10 minutes
          </span>
        )}
      </div>
    </>
  );
}
