"use client";

// app/land-of-the-dead/page.jsx — THE LAND OF THE DEAD (Merlin, Nov 16, 2026).
//
// The fields where the dead wander: a sphere world, fully explorable,
// no barriers, no boundaries (the Nov 16 unify law). You arrive by
// the floor drop from the hub and walk the ashen ground under a pale
// moon, among dead trees, tilted gravestones, cold wisps, and the
// wandering souls. The Pale Gate stands on the far side, where the
// dead pass onward.
//
// Controls are the universal controls core (components/world/
// ControlsCore.jsx), consumed as-is: fixed joystick bottom-left,
// JUMP orb in the draggable dock, 5 s hint pill, fullscreen orb at
// the very top right of the game screen. This world has no backpack
// orb, no weapon and no merchant — the core shows only the slots a
// world actually has (the Mars 2 / Earth 4 rule: nothing invented),
// so there is no FIRE orb and no ORBS orb here; the souls are not
// traded, they are walked among.
//
// The way back is the floor drop: worker C owns the return UI —
// lib/world/floor-drop.js mounts it at the anchor below. This page
// builds no return UI of its own.

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ControlsCore from "@/components/world/ControlsCore";
import { useRealmInfoFade } from '@/components/useRealmInfoFade';
import { LandOfTheDeadReturnOrb, useLandOfTheDeadReturn } from "@/components/world/FloorDrop";
import { readSoulArrivals, seedSouls, WanderingSoulField } from "@/lib/land-of-the-dead/souls";
import { growthFor } from "@/lib/land-of-the-dead/world";

// R3F scene loads client-side only (WebGL).
const LandOfTheDeadScene = dynamic(() => import("./world3d"), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#bfe8d8", letterSpacing: 3, fontSize: 12 }}>
      THE DEAD ARE WAKING…
    </div>
  ),
});

const ACCENT = "#bfe8d8";

export default function LandOfTheDeadPage() {
  const moveRef = useRef({ x: 0, y: 0 });
  const jumpRef = useRef(false);
  const hudRef = useRef({ height: 0, grounded: true });
  const [hud, setHud] = useState({ height: 0, grounded: true });
  const [region, setRegion] = useState("The Arrival Field");
  const [fullscreen, setFullscreen] = useState(false);
  // FLOOR-DROP RETURN (WS-C, Nov 16): where the user dropped from,
  // so the floor portal knows where to send them back.
  const floorReturn = useLandOfTheDeadReturn();
  // The wandering souls, seeded once (worker D's module).
  const [souls] = useState(() => seedSouls());
  // Realm info fade (Merlin, Nov 13): a click anywhere fades the
  // header + placebar overlay out (opacity only, never a hard cut);
  // the Info button brings it back. Same shared hook as the other
  // portal realms — the overlay here is the header + placebar, not
  // the legacy full-screen HUD, and the drag/stick/look handlers
  // live in ControlsCore + the scene rig, not this page.
  const [reduced, setReduced] = useState(false);
  const { infoHidden, fadeInfo, restoreInfo, infoStyle } = useRealmInfoFade({ reduced });
  useEffect(() => {
    try {
      setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch { /* desktop defaults stand */ }
  }, []);
  // GROWTH (Merlin, Nov 16 ~04:17): the world expands with the
  // recorded arrivals — read after mount (device-local ledger), so
  // the server render and the first client paint agree on 0.
  const [arrivals, setArrivals] = useState(0);
  const growth = growthFor(arrivals);
  useEffect(() => {
    setArrivals(readSoulArrivals().length);
  }, []);

  useEffect(() => {
    document.title = "Land of the Dead — The Fields Where the Dead Wander";
  }, []);

  useEffect(() => {
    if (!fullscreen) return undefined;
    const down = (e) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [fullscreen]);

  // Live altitude readout (200 ms — cheap DOM text, no canvas re-render).
  useEffect(() => {
    const id = setInterval(() => {
      const cur = hudRef.current;
      setHud((prev) =>
        Math.abs(prev.height - cur.height) > 0.02 || prev.grounded !== cur.grounded
          ? { height: cur.height, grounded: cur.grounded }
          : prev
      );
    }, 200);
    return () => clearInterval(id);
  }, []);

  const onMove = useCallback((x, y) => {
    moveRef.current = { x, y };
  }, []);

  const onRegion = useCallback((name) => {
    setRegion(name);
  }, []);

  return (
    <main className="lotd" onPointerDown={fadeInfo}>
      <div className="lotd-bg" aria-hidden="true" />
      <style>{`
        .lotd { min-height: 100dvh; background: #0b0f0e; color: #e8f2e4; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; position: relative; }
        .lotd-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background: radial-gradient(120% 90% at 50% 0%, #1c2622 0%, #121a17 45%, #0b0f0e 100%); }
        .lotd > *:not(.lotd-bg) { position: relative; z-index: 1; }
        .lotd header { padding: 18px 20px 10px; background: linear-gradient(rgba(11,15,14,0.82), rgba(11,15,14,0.88)), url(/images/land-of-the-dead/land-of-the-dead-banner.webp) center 30%/cover; }
        .lotd .kicker { font-size: 11px; letter-spacing: 4px; color: ${ACCENT}; text-transform: uppercase; }
        .lotd h1 { margin: 4px 0 2px; font-size: clamp(1.6rem, 5vw, 2.6rem); letter-spacing: 6px; font-weight: 800; }
        .lotd .sub { color: #a8c4b2; font-size: 0.9rem; max-width: 60ch; }
        .lotd .stage { position: relative; margin: 10px 16px 0; border: 1px solid #2e4038; border-radius: 14px; overflow: hidden; height: min(62dvh, 560px); min-height: 320px; background: #000; }
        .lotd .stage canvas { touch-action: none; }
        .lotd .placebar { position: absolute; left: 12px; top: 12px; z-index: 5;
          background: linear-gradient(rgba(11,15,14,0.93), rgba(11,15,14,0.93)); border: 1px solid ${ACCENT}; border-radius: 10px; padding: 10px 14px;
          font-size: 0.8rem; letter-spacing: 1px; color: #e8f2e4; pointer-events: none; }
        .lotd .placebar b { color: ${ACCENT}; }
        .lotd .world { margin: 0 16px 20px; border: 1px solid #2e4038; border-radius: 14px; padding: 16px 18px; background: rgba(13,18,16,0.72); }
        .lotd .world h3 { margin: 0 0 4px; font-size: 0.95rem; letter-spacing: 3px; color: ${ACCENT}; }
        .lotd .world .biome { color: #a8c4b2; font-size: 0.85rem; letter-spacing: 1px; margin-bottom: 10px; }
        .lotd .world .vitals { font-size: 0.82rem; color: #a8c4b2; letter-spacing: 1px; line-height: 1.7; }
        .lotd .places { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
        .lotd .places .row { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: baseline; border-top: 1px solid #223129; padding-top: 8px; font-size: 0.85rem; }
        .lotd .places .name { font-weight: 700; color: #e8f2e4; }
        .lotd .places .line { color: #a8c4b2; font-size: 0.8rem; }
      `}</style>

      <header style={infoStyle} aria-hidden={infoHidden}>
        <div className="kicker">THE NETHER FIELDS</div>
        <h1>LAND OF THE DEAD</h1>
        <div className="sub">The fields where the dead wander — ashen ground under a pale moon, dead trees, tilted stones, cold wisps, and the souls themselves, drifting. Walk it all: the world is a sphere, and there is nowhere you cannot go.</div>
      </header>

      <div className="stage" style={fullscreen ? { position: "fixed", inset: 0, zIndex: 80, margin: 0, height: "100dvh", borderRadius: 0, border: "none" } : undefined}>
        <LandOfTheDeadScene
          moveRef={moveRef}
          jumpRef={jumpRef}
          hudRef={hudRef}
          onRegion={onRegion}
          onReturn={floorReturn.returnToOrigin}
          arrivals={arrivals}
        />
        <div className="placebar" aria-live="polite" style={infoStyle} aria-hidden={infoHidden}>
          <b>You are in: {region}</b> · HEIGHT {hud.height.toFixed(1)} m · {hud.grounded ? "GROUNDED" : "AIRBORNE"}
        </div>
        {/* Universal controls core (Merlin, Nov 16 ~03:49): the fixed
            joystick bottom-left, the docked JUMP orb, the 5 s hint
            pill, the fullscreen orb top-right. No backpack, no weapon
            and no merchant here, so those core slots stay off —
            nothing invented. The souls are not traded. */}
        <ControlsCore world="land-of-the-dead" accent={ACCENT}
          onMove={onMove}
          onJump={() => { jumpRef.current = true; }}
          hint="Drag to look · stick to walk · JUMP to hop"
          fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen(!fullscreen)}
        />
        {/* FLOOR-DROP RETURN — owned by WS-C: lib/world/floor-drop.js mounts the return here */}
        <div id="lotd-return-anchor" style={{ position: "absolute", right: 12, bottom: 12, zIndex: 6 }}>
          <LandOfTheDeadReturnOrb
            ready={floorReturn.ready}
            originLabel={floorReturn.returnLabel}
            onReturn={floorReturn.returnToOrigin}
          />
        </div>
        {/* Realm info restore (shared fade): only renders while the
            overlay is faded — sits top-centre in the space the header
            leaves behind, below the stage edge. */}
        {infoHidden && (
          <button
            type="button"
            aria-label="Show realm information"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={restoreInfo}
            className="absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full border border-white/30 bg-black/60"
            style={{ padding: "8px 16px", color: "#e8f2e4", fontSize: 12, letterSpacing: 2 }}
          >
            INFO
          </button>
        )}
      </div>

      <section className="world" aria-label="World profile">
        <h3>LAND OF THE DEAD — THE FIELDS</h3>
        <div className="biome">Ashen sphere · r {growth.radius} m · holds {growth.capacity} souls · Eternal dusk under the pale moon</div>
        <div className="vitals">
          GRAVITY 9.81 m/s² · WALK 6 m/s · JUMP 3.0 m/s (APEX 0.46 m, HANG 0.61 s)<br />
          ONE LAP {growth.lapM.toFixed(2)} m · {growth.lapSeconds.toFixed(2)} s AT WALK SPEED · NO WALLS, NO EDGES — THE SPHERE HAS NONE<br />
          THE WORLD GROWS WITH THE DEAD — {arrivals} ARRIVED · +5 m PER +24 SOULS
        </div>
        <div className="places">
          <div className="row">
            <span className="name">The Arrival Field</span>
            <span className="line">The floor drop sets you down here. The dead arrive the same way — and keep walking.</span>
          </div>
          <div className="row">
            <span className="name">The Bone Orchard</span>
            <span className="line">Dead trees in rows, like an orchard that never bore fruit.</span>
          </div>
          <div className="row">
            <span className="name">The Grey Mere</span>
            <span className="line">Still water, grey as slate. Nothing drinks from it.</span>
          </div>
          <div className="row">
            <span className="name">The Pale Gate</span>
            <span className="line">Two pale pillars on the far side. The dead pass through — and do not come back.</span>
          </div>
        </div>
      </section>
      {/* The wandering souls (worker D's module): a DOM/SVG panel,
          not an R3F component — it cannot mount inside the WebGL
          Canvas, so it rides on the page under the stage, fed by the
          same seedSouls() state. The souls are walked among in the
          world; the field names them here. */}
      <section className="world" aria-label="The wandering dead">
        <WanderingSoulField souls={souls} />
      </section>
    </main>
  );
}
