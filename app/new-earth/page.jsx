"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createWorld, LANDMARKS, TOUR } from "./scene";
import { supabase } from "../../lib/supabase";
import { worldToTile } from "../../lib/earth3/terrain";
import {
  tileIdFor,
  tileInfo,
  claimTile,
  ownerOf,
  claimsForUser,
  loadLocalClaims,
  saveLocalClaims,
} from "../../lib/earth3/claims";

/**
 * New Earth — Merlin's vision of Earth's future, explorable in 3D.
 * Walk or fly through the Hephaestus macro-vision: AETHERIS scrubbers,
 * tensegrity housing, the factory, MORDOR smelter, floating island,
 * ocean-dome city and arctic dome. Guided tour mode for presentations.
 * Honest framing throughout: speculative tech is labeled vision/concept.
 */

const ACCENT = "#7ddf9a";

function Glyph({ size = 16, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ flexShrink: 0 }}>{children}</svg>
  );
}
const IC = {
  walk: <><circle cx="13" cy="4" r="1.6" /><path d="M13 7l-3 5 2 3v6M10 12l-3 2M13 7l4 3 3 1M12 15l3 2 1 4" /></>,
  fly: <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></>,
  tour: <><circle cx="12" cy="12" r="9" /><path d="M10 8.5l5 3.5-5 3.5z" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  up: <path d="M12 19V5M5 12l7-7 7 7" />,
  down: <path d="M12 5v14M5 12l7 7 7-7" />,
  jump: <><path d="M12 20v-8" /><path d="M8 12l4-4 4 4" /><path d="M5 20h14" /></>,
  pin: <><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
};

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
      className="ne-stick"
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
      <div ref={knobRef} className="ne-knob" />
    </div>
  );
}

export default function NewEarthPage() {
  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const [booted, setBooted] = useState(false);
  const [failed, setFailed] = useState(false);
  // WebGL retry (Merlin, 2026-11-14 — Earth 3 showed "needs
  // WebGL" on his phone): the first failure retries once by
  // itself after a short pause; if that fails too, the fail
  // screen offers a manual retry instead of a dead end.
  const autoRetried = useRef(false);
  const [retryKey, setRetryKey] = useState(0);
  const retryWorld = useCallback(() => {
    setFailed(false);
    setBooted(false);
    setRetryKey((k) => k + 1);
  }, []);
  const [mode, setMode] = useState("walk");
  const [caption, setCaption] = useState(null);
  const [tour, setTour] = useState({ active: false, index: 0 });
  // Fullscreen (Merlin, Nov 16 ~00:02 — "full screen like we have
  // for earth 2"): Earth 2's mechanism is a fixed inset-0 overlay
  // that takes over the whole screen when you enter the world, with
  // an exit back to the menu. This page's stage is the same shape:
  // boxed by default, fixed inset-0 at z-80 when entered, Escape
  // or the exit button drops it back. The scene exposes resize(),
  // called on the next frame after the stage changes size.
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return undefined;
    const down = (e) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [fullscreen]);

  useEffect(() => {
    const w = worldRef.current;
    if (!w || typeof w.resize !== "function") return undefined;
    const raf = requestAnimationFrame(() => { if (worldRef.current) worldRef.current.resize(); });
    return () => cancelAnimationFrame(raf);
  }, [fullscreen]);
  // Earth 3 land + dinos (Merlin, 2026-11-14): the tile under the
  // walker's feet, who owns it, and how many dinosaurs are near.
  const [user, setUser] = useState(null);
  const [claims, setClaims] = useState([]);
  const [serverReady, setServerReady] = useState(null);
  const [tile, setTile] = useState(null);
  const [dinoCount, setDinoCount] = useState(0);
  const [claimMsg, setClaimMsg] = useState(null);
  // Edge of the world (Merlin, 2026-11-14): the scene fires
  // onEdge when the walker reaches the turn-back wall at the
  // edge of the 2,800 km grid.
  const [atEdge, setAtEdge] = useState(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const tourRef = useRef(tour);
  tourRef.current = tour;

  useEffect(() => {
    document.title = "New Earth — HEPHAESTUS";
    let world = null;
    try {
      world = createWorld(canvasRef.current, {
        onCaption: (lm) => {
          setCaption(lm);
          if (lm && tourRef.current.active) {
            const i = TOUR.indexOf(lm.id);
            if (i >= 0) setTour((t) => ({ ...t, index: i }));
          } else if (!lm && tourRef.current.active) {
            setTour({ active: false, index: 0 });
          }
        },
        onReady: () => setBooted(true),
        onEdge: setAtEdge,
      });
    } catch (err) {
      console.error("[new-earth] world failed:", err);
      // One automatic retry after a short pause: a context that
      // failed to start can succeed once the browser has had a
      // moment to free a 3D slot. If the retry fails too, the
      // fail screen (with its manual retry) takes over.
      if (!autoRetried.current) {
        autoRetried.current = true;
        const t = setTimeout(() => setRetryKey((k) => k + 1), 1500);
        return () => clearTimeout(t);
      }
      setFailed(true);
      return;
    }
    worldRef.current = world;

    const onKey = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === " ") { world.jump(); e.preventDefault(); }
      if (k === "f") toggleFly();
      if (k === "t") toggleTour();
      if (k === "escape" && tourRef.current.active) world.stopTour();
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); world.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  const toggleFly = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    const next = modeRef.current === "walk" ? "fly" : "walk";
    w.setMode(next);
    setMode(next);
  }, []);

  const toggleTour = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    if (tourRef.current.active) { w.stopTour(); setTour({ active: false, index: 0 }); }
    else { setCaption(null); w.startTour(); setTour({ active: true, index: 0 }); }
  }, []);

  const visit = useCallback((id) => {
    const w = worldRef.current;
    if (!w) return;
    if (tourRef.current.active) { w.stopTour(); setTour({ active: false, index: 0 }); }
    const lm = LANDMARKS.find((l) => l.id === id);
    w.gotoLandmark(id);
    if (lm) setCaption(lm);
  }, []);

  const onMove = useCallback((x, y) => {
    const w = worldRef.current;
    if (w) w.setMove(x, y);
  }, []);

  const setLift = (v) => { const w = worldRef.current; if (w) w.setLift(v); };

  // Who is signed in (Earth 2's pattern): the session decides
  // what the claim button may do; the API routes re-verify
  // server-side regardless.
  useEffect(() => {
    let sub = null;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const u = data?.session?.user || null;
        setUser(u ? { id: u.id, email: u.email || '' } : null);
      } catch { setUser(null); }
    })();
    try {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        const u = session?.user || null;
        setUser(u ? { id: u.id, email: u.email || '' } : null);
      });
      sub = data?.subscription || null;
    } catch { /* signed-out stays signed-out */ }
    return () => { try { sub && sub.unsubscribe(); } catch {} };
  }, []);

  // Claims: device-local rows first (they stand until the shared
  // registry opens), then the server's picture when it answers.
  // Device-local claims of mine that the registry does not know
  // yet are offered to it once, best-effort — a claim made on
  // this device before the tables landed still counts.
  useEffect(() => {
    const local = loadLocalClaims();
    setClaims(local);
    if (!user) { setServerReady(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };
        const res = await fetch('/api/earth3/state', { headers });
        if (!res.ok || cancelled) return;
        const body = await res.json().catch(() => null);
        if (!body || cancelled) return;
        if (body.setupRequired) { setServerReady(false); return; }
        if (!body.ok || !Array.isArray(body.tiles)) return;
        setServerReady(true);
        setClaims(body.tiles);
        const mine = local.filter((r) => String(r.owner_id) === String(user.id));
        let synced = false;
        for (const row of mine) {
          if (body.tiles.some((t) => t.tile_id === row.tile_id)) continue;
          try {
            const cr = await fetch('/api/earth3/claim', {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({ tileId: row.tile_id }),
            });
            const cb = await cr.json().catch(() => null);
            if (cb && cb.setupRequired) { setServerReady(false); return; }
            if (cb && cb.ok) synced = true;
          } catch { /* stays device-local */ }
        }
        if (synced && !cancelled) {
          try {
            const res2 = await fetch('/api/earth3/state', { headers });
            const body2 = await res2.json().catch(() => null);
            if (body2 && body2.ok && Array.isArray(body2.tiles)) setClaims(body2.tiles);
          } catch { /* keep the first read */ }
        }
      } catch { /* device-local claims stand */ }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // The tile under the walker's feet + the dinosaurs nearby,
  // refreshed twice a second (the scene itself refreshes its
  // herd every second).
  useEffect(() => {
    if (!booted) return;
    const id = window.setInterval(() => {
      const w = worldRef.current;
      if (!w) return;
      try {
        const p = w.getPosition();
        if (p) setTile(tileInfo(tileIdFor(worldToTile(p.x, p.z))));
        setDinoCount(w.getDinoCount());
      } catch { /* the world is still booting */ }
    }, 500);
    return () => window.clearInterval(id);
  }, [booted]);

  // Draw the gold square on the tile I own, wherever it sits.
  useEffect(() => {
    const w = worldRef.current;
    if (!w) return;
    const mine = user ? claimsForUser(claims, user.id) : [];
    try { w.setClaimMarker(mine.length ? mine[0] : null); } catch {}
  }, [claims, user, booted]);

  const claimCurrentTile = useCallback(async () => {
    if (!tile) return;
    if (!user) { setClaimMsg('Sign in to claim a tile.'); return; }
    const computed = claimTile(claims, tile.id, user, Date.now());
    if (!computed.ok) { setClaimMsg(computed.error); return; }
    // The shared registry first, when it is open; the device
    // otherwise — the claim is never lost either way.
    if (serverReady) {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (token) {
          const res = await fetch('/api/earth3/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ tileId: tile.id }),
          });
          const body = await res.json().catch(() => null);
          if (body && body.ok && body.tile) {
            setClaims((prev) => [...prev, body.tile]);
            setClaimMsg(`Tile ${tile.id} is yours.`);
            return;
          }
          if (body && body.setupRequired) {
            setServerReady(false);
          } else {
            setClaimMsg((body && body.error) || 'The claim did not go through.');
            return;
          }
        }
      } catch {
        setClaimMsg('The registry did not answer — saved on this device instead.');
      }
    }
    saveLocalClaims(null, computed.rows);
    setClaims(computed.rows);
    setClaimMsg(`Tile ${tile.id} is yours — saved on this device. The shared registry opens once Merlin green-lights the Earth 3 tables.`);
  }, [tile, user, claims, serverReady]);

  const tileOwner = tile ? ownerOf(claims, tile.id) : null;
  const tileIsMine = !!(tileOwner && user && String(tileOwner.owner_id) === String(user.id));

  return (
    <main className="ne">
      <style>{`
        .ne { min-height: 100dvh; background: #04120c; color: #eef7ee; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; }
        .ne-hero { position: relative; padding: 20px 20px 12px; background: linear-gradient(180deg, #06281a 0%, #04120c 100%); }
        .ne .kicker { font-size: 11px; letter-spacing: 4px; color: ${ACCENT}; text-transform: uppercase; }
        .ne h1 { margin: 4px 0 2px; font-size: clamp(1.7rem, 6vw, 2.8rem); letter-spacing: 5px; font-weight: 800; }
        .ne .sub { color: #a9c9b4; font-size: 0.92rem; max-width: 60ch; }
        .ne .vision-note { margin-top: 8px; display: inline-block; font-size: 0.72rem; letter-spacing: 1px; color: #0b1f14; background: ${ACCENT}; border-radius: 999px; padding: 4px 12px; font-weight: 700; }
        .ne .stage { position: relative; margin: 12px 16px 0; border: 1px solid #1e4030; border-radius: 14px; overflow: hidden; height: min(64dvh, 600px); min-height: 340px; background: #020a06; }
        .ne canvas { width: 100%; height: 100%; display: block; touch-action: none; }
        .ne-boot { position: absolute; inset: 0; z-index: 6; display: flex; align-items: center; justify-content: center; gap: 10px; background: rgba(2,10,6,0.85); color: ${ACCENT}; font-size: 0.78rem; letter-spacing: 3px; text-transform: uppercase; animation: ne-pulse 1.6s ease-in-out infinite; }
        @keyframes ne-pulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .ne-boot { animation: none; } }
        .ne-fail { position: absolute; inset: 0; z-index: 6; display: flex; align-items: center; justify-content: center; padding: 24px; text-align: center; color: #c9b8a6; font-size: 0.9rem; }
        /* HUD */
        .ne-hud { position: absolute; inset: 0; z-index: 5; pointer-events: none; }
        .ne-hud > * { pointer-events: auto; }
        .ne-stick { position: absolute; left: 14px; bottom: calc(14px + env(safe-area-inset-bottom)); width: 124px; height: 124px; border-radius: 50%; background: rgba(10,30,20,0.55); border: 1px solid rgba(125,223,154,0.45); touch-action: none; }
        .ne-knob { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%; background: rgba(125,223,154,0.85); box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
        .ne-btns { position: absolute; right: 14px; bottom: calc(14px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 10px; align-items: flex-end; }
        .ne-btnrow { display: flex; gap: 10px; }
        .ne button { min-height: 56px; min-width: 56px; padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(125,223,154,0.5); background: rgba(8,26,17,0.82); color: #eef7ee; font-size: 0.75rem; letter-spacing: 1.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
        .ne button.on { background: ${ACCENT}; border-color: ${ACCENT}; color: #0b1f14; }
        .ne button:active { transform: scale(0.96); }
        /* caption card */
        .ne-card { position: absolute; left: 12px; right: 12px; bottom: calc(152px + env(safe-area-inset-bottom)); max-width: 440px; background: rgba(4,16,10,0.94); border: 1px solid ${ACCENT}; border-radius: 12px; padding: 14px 16px 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); }
        .ne-card h2 { margin: 0 0 2px; font-size: 1.02rem; letter-spacing: 1.5px; color: ${ACCENT}; display: flex; align-items: center; gap: 8px; }
        .ne-card .tag { font-size: 0.72rem; letter-spacing: 2px; color: #8fb89a; text-transform: uppercase; margin-bottom: 6px; }
        .ne-card p { margin: 0 0 10px; font-size: 0.88rem; line-height: 1.55; color: #dcefe0; }
        .ne-card .vbadge { display: inline-block; font-size: 0.66rem; letter-spacing: 1.5px; text-transform: uppercase; border: 1px solid #c9a86a; color: #c9a86a; border-radius: 999px; padding: 2px 10px; margin-bottom: 10px; }
        .ne-card .crow { display: flex; gap: 8px; }
        .ne-card .cx { margin-left: auto; min-width: 44px; }
        /* tour bar */
        .ne-tourbar { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; background: rgba(4,16,10,0.9); border: 1px solid ${ACCENT}; border-radius: 999px; padding: 6px 8px 6px 14px; font-size: 0.74rem; letter-spacing: 1.5px; white-space: nowrap; }
        /* edge of the world */
        .ne-edge { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); background: rgba(4,16,10,0.92); border: 1px solid #c9a86a; color: #ffd97a; border-radius: 999px; padding: 8px 16px; font-size: 0.78rem; letter-spacing: 1.5px; font-weight: 700; white-space: nowrap; }
        .ne-tourbar button { min-height: 40px; min-width: 40px; padding: 6px 10px; font-size: 0.7rem; }
        /* landmark chips */
        .ne-chips { display: flex; gap: 8px; overflow-x: auto; padding: 12px 16px calc(14px + env(safe-area-inset-bottom)); -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .ne-chips::-webkit-scrollbar { display: none; }
        .ne-chips button { flex-shrink: 0; min-height: 44px; }
        /* tile claim bar */
        .ne-tilebar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 12px 16px 0; padding: 10px 14px; border: 1px solid rgba(125,223,154,0.4); border-radius: 12px; background: rgba(8,26,17,0.82); font-size: 0.82rem; }
        .ne-tilebar .ne-tileinfo { flex: 1; min-width: 200px; color: #dcefe0; }
        .ne-tilebar .ne-tileinfo strong { color: ${ACCENT}; letter-spacing: 1px; }
        .ne-tilebar button { min-height: 44px; }
        .ne-mine { color: ${ACCENT}; font-weight: 800; letter-spacing: 2px; font-size: 0.78rem; }
        .ne-claimed { color: #9db8a6; font-weight: 700; letter-spacing: 2px; font-size: 0.78rem; }
        .ne-claimmsg { margin: 8px 16px 0; color: #c9a86a; font-size: 0.82rem; }
        .ne-about { padding: 0 20px calc(28px + env(safe-area-inset-bottom)); color: #9db8a6; font-size: 0.84rem; line-height: 1.6; max-width: 70ch; }
        .ne-about strong { color: #dcefe0; }
      `}</style>

      <header className="ne-hero">
        <div className="kicker">Hephaestus · Vision Showcase</div>
        <h1>NEW EARTH</h1>
        <p className="sub">Earth, as it could be — Merlin's vision of the planet thriving. Walk it, fly it, or take the guided tour.</p>
        <span className="vision-note">CONCEPT SHOWCASE — SPECULATIVE TECH, PRESENTED HONESTLY</span>
      </header>

      <div className="stage" style={fullscreen ? { position: "fixed", inset: 0, zIndex: 80, margin: 0, height: "100dvh", borderRadius: 0, border: "none" } : undefined}>
        <canvas ref={canvasRef} aria-label="New Earth 3D world" />
        {fullscreen && (
          <button type="button" aria-label="Exit fullscreen" onClick={() => setFullscreen(false)}
            style={{ position: "absolute", left: 14, top: 14, zIndex: 9, minHeight: 48, padding: "10px 18px", borderRadius: 12, border: "1px solid rgba(125,223,154,0.5)", background: "rgba(8,26,17,0.9)", color: "#eef7ee", fontWeight: 700, letterSpacing: 2, cursor: "pointer" }}>
            ✕ EXIT FULLSCREEN
          </button>
        )}
        {!booted && !failed && <div className="ne-boot">Growing New Earth…</div>}
        {failed && (
          <div className="ne-fail" style={{ flexDirection: "column", gap: 14 }}>
            <div>3D could not start on this device. New Earth needs WebGL.</div>
            <div style={{ fontSize: "0.8rem", color: "#8fb89a", maxWidth: 420 }}>
              This usually means the browser has run out of 3D slots after hopping between worlds — closing this tab completely and reopening the site frees them.
            </div>
            <button type="button" onClick={retryWorld} style={{ minHeight: 48, padding: "10px 22px", borderRadius: 12, border: "1px solid rgba(125,223,154,0.5)", background: "rgba(8,26,17,0.82)", color: "#eef7ee", fontWeight: 700, letterSpacing: 2, cursor: "pointer" }}>
              ↻ TRY AGAIN
            </button>
          </div>
        )}

        <div className="ne-hud">
          {tour.active && (
            <div className="ne-tourbar" role="status">
              <Glyph size={14}>{IC.tour}</Glyph>
              <span>TOUR {tour.index + 1}/{TOUR.length}</span>
              <button onClick={() => worldRef.current && worldRef.current.tourPrev()} aria-label="Previous stop">‹</button>
              <button onClick={() => worldRef.current && worldRef.current.tourNext()} aria-label="Next stop">›</button>
              <button onClick={toggleTour} aria-label="Exit tour"><Glyph size={13}>{IC.x}</Glyph></button>
            </div>
          )}

          {atEdge && (
            <div className="ne-edge" role="status">Edge of the world — turn back</div>
          )}

          <Joystick onMove={onMove} />

          <div className="ne-btns">
            {mode === "fly" && (
              <div className="ne-btnrow">
                <button aria-label="Ascend"
                  onPointerDown={() => setLift(1)} onPointerUp={() => setLift(0)} onPointerLeave={() => setLift(0)}>
                  <Glyph>{IC.up}</Glyph>
                </button>
                <button aria-label="Descend"
                  onPointerDown={() => setLift(-1)} onPointerUp={() => setLift(0)} onPointerLeave={() => setLift(0)}>
                  <Glyph>{IC.down}</Glyph>
                </button>
              </div>
            )}
            <div className="ne-btnrow">
              {mode === "walk" && (
                <button aria-label="Jump" onPointerDown={() => worldRef.current && worldRef.current.jump()}>
                  <Glyph>{IC.jump}</Glyph>JUMP
                </button>
              )}
              <button className={mode === "fly" ? "on" : ""} onClick={toggleFly} aria-label="Toggle fly">
                <Glyph>{mode === "fly" ? IC.walk : IC.fly}</Glyph>{mode === "fly" ? "WALK" : "FLY"}
              </button>
              <button className={tour.active ? "on" : ""} onClick={toggleTour} aria-label="Guided tour">
                <Glyph>{IC.tour}</Glyph>TOUR
              </button>
              <button onClick={() => setFullscreen(true)} aria-label="Enter fullscreen">
                ⛶ FULLSCREEN
              </button>
            </div>
          </div>

          {caption && !tour.active && (
            <div className="ne-card" role="dialog" aria-label={caption.name}>
              <h2><Glyph size={15}>{IC.pin}</Glyph>{caption.name}</h2>
              <div className="tag">{caption.tagline}</div>
              <span className="vbadge">Vision concept</span>
              <p>{caption.caption}</p>
              <div className="crow">
                <button onClick={() => visit(caption.id)}><Glyph size={13}>{IC.eye}</Glyph>VISIT</button>
                <button className="cx" onClick={() => setCaption(null)} aria-label="Close"><Glyph size={13}>{IC.x}</Glyph></button>
              </div>
            </div>
          )}
          {caption && tour.active && (
            <div className="ne-card" role="status" aria-label={caption.name}>
              <h2><Glyph size={15}>{IC.pin}</Glyph>{caption.name}</h2>
              <div className="tag">{caption.tagline}</div>
              <p>{caption.caption}</p>
            </div>
          )}
        </div>
      </div>

      {/* Tile claim bar (Merlin, 2026-11-14): the tile under the
          walker's feet, who owns it, and the dinosaurs nearby. */}
      <div className="ne-tilebar" role="status">
        <span className="ne-tileinfo">
          {tile ? (
            <>📍 Tile <strong>{tile.id}</strong> · {tile.ownable ? 'Ownable — free to claim' : 'Free Commons — open land'} · 🦕 {dinoCount} {dinoCount === 1 ? 'dinosaur' : 'dinosaurs'} nearby</>
          ) : (
            <>📍 Finding your tile…</>
          )}
        </span>
        {tile && (tileIsMine ? (
          <span className="ne-mine">YOURS ✓</span>
        ) : tileOwner ? (
          <span className="ne-claimed">CLAIMED</span>
        ) : !tile.ownable ? (
          <span className="ne-claimed">OPEN LAND</span>
        ) : (
          <button onClick={claimCurrentTile}>{user ? 'CLAIM THIS TILE — FREE' : 'SIGN IN TO CLAIM'}</button>
        ))}
      </div>
      {claimMsg && <div className="ne-claimmsg" role="status">{claimMsg}</div>}

      <nav className="ne-chips" aria-label="Landmarks">
        {LANDMARKS.map((l) => (
          <button key={l.id} onClick={() => visit(l.id)}>
            <Glyph size={13}>{IC.pin}</Glyph>{l.name}
          </button>
        ))}
      </nav>

      <section className="ne-about">
        <p><strong>What is this?</strong> New Earth is a walkable showcase of the future Merlin is building toward:
        an atmosphere being cleaned, waste becoming building material, homes for everyone, and a green
        island risen from ocean plastic. Everything speculative is labeled <strong>vision concept</strong> —
        an honest picture of the destination, not a claim about today.</p>
        <p style={{ marginTop: 8 }}>For partners and collaborators: press <strong>TOUR</strong> for the guided
        walkthrough. Drag to look around, use the stick to move, FLY to soar.</p>
        <p style={{ marginTop: 8 }}>The land: Earth 3 holds ten billion tiles, and the tile under your
        feet can be yours — free while the world is under construction, one homestead claim per
        explorer. Dinosaurs roam the wilds around you; the same spot always holds the same animal.</p>
      </section>
    </main>
  );
}
