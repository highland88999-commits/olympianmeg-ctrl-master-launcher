"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createWorld, GODS, GOD_LABELS } from "./scene";

/**
 * World Nexus — one containing pocket universe holding every world.
 * Walk a 3D plaza hub: 11 god-category districts ring the central spawn,
 * each with its gate arch and a portal to every world. Walk through a
 * portal (or tap it) to travel. The gold NEXUS RETURN gate — or the
 * NEXUS button — brings you back to spawn.
 */

const GOLD = "#c9a86a";

function Joystick({ onMove }) {
  const baseRef = useRef(null);
  const knobRef = useRef(null);
  const activeRef = useRef(null);

  const setKnob = (dx, dy) => {
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const handle = useCallback((e) => {
    const base = baseRef.current;
    if (!base || activeRef.current === null) return;
    const r = base.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const max = r.width / 2 - 14;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    setKnob(dx, dy);
    onMove(dx / max, -dy / max);
  }, [onMove]);

  return (
    <div
      ref={baseRef}
      className="wn-stick"
      onPointerDown={(e) => {
        activeRef.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        handle(e);
      }}
      onPointerMove={(e) => { if (activeRef.current === e.pointerId) handle(e); }}
      onPointerUp={(e) => {
        if (activeRef.current === e.pointerId) {
          activeRef.current = null; setKnob(0, 0); onMove(0, 0);
        }
      }}
      onPointerCancel={() => { activeRef.current = null; setKnob(0, 0); onMove(0, 0); }}
      aria-label="Move"
    >
      <div ref={knobRef} className="wn-knob" />
    </div>
  );
}

export default function WorldNexusPage() {
  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const router = useRouter();
  const [booted, setBooted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [portalCount, setPortalCount] = useState(null);

  useEffect(() => {
    document.title = "World Nexus — HEPHAESTUS";
    let world = null;
    try {
      world = createWorld(canvasRef.current, {
        onReady: ({ portals }) => { setBooted(true); setPortalCount(portals); },
        onNavigate: (route) => { try { router.push(route); } catch (_) { window.location.href = route; } },
        onError: () => setFailed(true),
      });
    } catch (err) {
      console.error("[world-nexus] world failed:", err);
      setFailed(true);
      return;
    }
    worldRef.current = world;
    return () => { world.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMove = useCallback((x, y) => {
    const w = worldRef.current;
    if (w) w.setMove(x, y);
  }, []);

  const goHome = useCallback(() => {
    const w = worldRef.current;
    if (w) w.goHome();
  }, []);

  const gotoDistrict = useCallback((god) => {
    const w = worldRef.current;
    if (w) w.gotoDistrict(god);
  }, []);

  return (
    <main className="wn">
      <style>{`
        .wn { min-height: 100dvh; background: #05070c; color: #eef1f7; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; }
        .wn-hero { position: relative; padding: 20px 20px 12px; background: linear-gradient(180deg, #0d1017 0%, #05070c 100%); }
        .wn .kicker { font-size: 11px; letter-spacing: 4px; color: ${GOLD}; text-transform: uppercase; }
        .wn h1 { margin: 4px 0 2px; font-size: clamp(1.7rem, 6vw, 2.8rem); letter-spacing: 5px; font-weight: 800; }
        .wn .sub { color: #a9b4c9; font-size: 0.92rem; max-width: 60ch; }
        .wn .stage { position: relative; margin: 12px 16px 0; border: 1px solid #232a38; border-radius: 14px; overflow: hidden; height: min(72dvh, 680px); min-height: 380px; background: #020409; }
        .wn canvas { width: 100%; height: 100%; display: block; touch-action: none; }
        .wn-boot { position: absolute; inset: 0; z-index: 6; display: flex; align-items: center; justify-content: center; gap: 10px; background: rgba(2,4,9,0.85); color: ${GOLD}; font-size: 0.78rem; letter-spacing: 3px; text-transform: uppercase; animation: wn-pulse 1.6s ease-in-out infinite; }
        @keyframes wn-pulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .wn-boot { animation: none; } }
        .wn-fail { position: absolute; inset: 0; z-index: 6; display: flex; align-items: center; justify-content: center; padding: 24px; text-align: center; color: #c9b8a6; font-size: 0.9rem; }
        .wn-hud { position: absolute; inset: 0; z-index: 5; pointer-events: none; }
        .wn-hud > * { pointer-events: auto; }
        .wn-stick { position: absolute; left: 14px; bottom: calc(14px + env(safe-area-inset-bottom)); width: 124px; height: 124px; border-radius: 50%; background: rgba(12,16,24,0.55); border: 1px solid rgba(201,168,106,0.45); touch-action: none; }
        .wn-knob { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%; background: rgba(201,168,106,0.85); box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
        .wn-btns { position: absolute; right: 14px; bottom: calc(14px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 10px; align-items: flex-end; }
        .wn button { min-height: 56px; min-width: 56px; padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(201,168,106,0.5); background: rgba(10,14,22,0.82); color: #eef1f7; font-size: 0.75rem; letter-spacing: 1.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
        .wn button.on { background: ${GOLD}; border-color: ${GOLD}; color: #14100a; }
        .wn button:active { transform: scale(0.96); }
        .wn-count { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); background: rgba(6,10,16,0.85); border: 1px solid rgba(201,168,106,0.5); border-radius: 999px; padding: 8px 16px; font-size: 0.72rem; letter-spacing: 2px; white-space: nowrap; color: ${GOLD}; }
        .wn-chips { display: flex; gap: 8px; overflow-x: auto; padding: 12px 16px calc(14px + env(safe-area-inset-bottom)); -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .wn-chips::-webkit-scrollbar { display: none; }
        .wn-chips button { flex-shrink: 0; min-height: 44px; }
        .wn-about { padding: 0 20px calc(28px + env(safe-area-inset-bottom)); color: #9aa4b8; font-size: 0.84rem; line-height: 1.6; max-width: 70ch; }
        .wn-about strong { color: #dfe5ef; }
      `}</style>

      <header className="wn-hero">
        <div className="kicker">Hephaestus · The Hub</div>
        <h1>WORLD NEXUS</h1>
        <p className="sub">One hub. Every world. Walk them all. — Eleven districts ring the central plaza, each holding a portal to every world in its category. Walk through a portal, or tap it, to travel.</p>
      </header>

      <div className="stage">
        <canvas ref={canvasRef} aria-label="World Nexus 3D hub" />
        {!booted && !failed && <div className="wn-boot">Opening the Nexus…</div>}
        {failed && <div className="wn-fail">3D could not start on this device. World Nexus needs WebGL.</div>}

        <div className="wn-hud">
          {portalCount != null && (
            <div className="wn-count" role="status">{portalCount} PORTALS · 11 DISTRICTS</div>
          )}
          <Joystick onMove={onMove} />
          <div className="wn-btns">
            <button onClick={goHome} aria-label="Return to Nexus spawn">NEXUS</button>
          </div>
        </div>
      </div>

      <nav className="wn-chips" aria-label="Districts">
        {GODS.map((g) => (
          <button key={g} onClick={() => gotoDistrict(g)}>{GOD_LABELS[g] || g}</button>
        ))}
      </nav>

      <section className="wn-about">
        <p><strong>How it works.</strong> Drag to look, push the stick (or WASD) to walk. The gold <strong>NEXUS RETURN</strong> gate at spawn — or the NEXUS button — brings you back here. Every frame is solid: only the glowing portal planes carry you through.</p>
        <p style={{ marginTop: 8 }}>The gate arches, statues, fountains and crystals are being generated as real 3D models — until they arrive, clean procedural stand-ins hold their places, so the hub is complete and walkable today.</p>
      </section>
    </main>
  );
}
