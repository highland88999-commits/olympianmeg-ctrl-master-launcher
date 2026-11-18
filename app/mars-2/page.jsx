"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { generateMarsProfile } from "@/lib/mars/engine";
import { timeOfDay01, getDayNightPlace, requestDayNightPlace, dayNightFor } from "@/lib/day-night";
import { MARS2_SEED, MARS2_WORLD_NAME } from "@/lib/mars2/world";
import { ROVER_NAME, ROVER_TOP_SPEED_MPS, WALK_SPEED_MPS, roverSpeedKmh } from "@/lib/mars2/rovers";
import { IcSunrise, IcSun, IcSunset, IcMoon, IcRoute } from "@/app/artemis-ui/icons";
import OrbButton, { OrbLabel } from "@/components/world/OrbButton";
import ControlsCore from "@/components/world/ControlsCore";
import BuildPanel from "@/components/mars2/BuildPanel";
import { useBackpack, updateBackpack } from "@/lib/backpack/store";
import { addItem, removeItem, countItem } from "@/lib/backpack/backpack";
import { materialById, materialItemFor, MARS_MINE_MATERIAL_IDS } from "@/lib/economy/materials";
import {
  plotsFor, miningAreasFor, loadBuildState, saveBuildState,
  buildMine, buildBarracks, upgradeBuilding, recruitCrew, assignCrew,
  tickBuildings, collectBuilding, mineMaterialId,
} from "@/lib/mars2/build-mode";

// MARS 2 — the successor world (Merlin, Nov 15, 2026). One-word
// spec: ROVERS. Fixed seed, no seed picker, no exobiology — walk
// the red dunes or summon the ARES-2 survey rover and drive them.
// Day/night runs the shared law (lib/day-night.js): real time by
// default, the slider and presets take it manual, REAL TIME hands
// it back. The menu registries are owned by the coordinator;
// this page is the route itself (/mars-2).

// R3F scene loads client-side only (WebGL).
const Mars2Scene = dynamic(() => import("@/components/mars2/Mars2Scene"), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffa658", letterSpacing: 3, fontSize: 12 }}>
      SYNTHESIZING MARS 2…
    </div>
  ),
});

const ACCENT = "#e07840";
const PRESET_ICONS = [IcSunrise, IcSun, IcSunset, IcMoon];

// Same clock helpers the other surface pages use (t: 0..1 of a day).
function timeLabel(t) {
  const h = Math.floor((((t % 1) + 1) % 1) * 24);
  if (h >= 5 && h < 8) return "DAWN";
  if (h >= 8 && h < 17) return "DAY";
  if (h >= 17 && h < 20) return "DUSK";
  return "NIGHT";
}
function timeString(t) {
  const mins = Math.floor((((t % 1) + 1) % 1) * 24 * 60);
  return String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
}

export default function Mars2Page() {
  const inputRef = useRef({ keys: { fwd: false, back: false, left: false, right: false, up: false, down: false } });
  const jumpRef = useRef(false);
  const [time, setTime] = useState(0.32);
  // Day/night (Merlin, 2026-11-14): the clock runs on REAL time
  // by default — the shared law's timeOfDay01 for the walker's
  // place (real location when granted, Sydney when not),
  // refreshed every 10 s. The slider and presets still work:
  // touching either one takes the clock manual, and REAL TIME
  // hands it back.
  const [liveTime, setLiveTime] = useState(true);
  const liveTimeRef = useRef(true);
  const setManualTime = (t) => {
    liveTimeRef.current = false;
    setLiveTime(false);
    setTime(t);
  };
  const resumeLiveTime = () => {
    liveTimeRef.current = true;
    setLiveTime(true);
  };

  useEffect(() => {
    requestDayNightPlace();
    if (!liveTime) return undefined;
    const applyRealTime = () => {
      try {
        const place = getDayNightPlace();
        setTime(timeOfDay01(Date.now(), place.lat, place.lon));
      } catch {}
    };
    applyRealTime();
    const id = setInterval(applyRealTime, 10000);
    return () => clearInterval(id);
  }, [liveTime]);
  const [mode, setMode] = useState("orbit"); // orbit | walk | drive
  const [roverCmd, setRoverCmd] = useState(null); // { action: 'summon' | 'dismount', nonce }
  const [rover, setRover] = useState({ active: false, speedKmh: 0 });
  // Fullscreen (Merlin, Nov 16 — circle orb law: the maximize
  // orb sits at the very top right): the Earth 3 / Earth 4
  // mechanism — a fixed inset-0 stage at z-80, no Fullscreen API
  // (iPhone Safari has none for arbitrary elements). Escape or
  // the orb drops it back. The R3F canvas resizes itself when
  // the stage changes size.
  const [fullscreen, setFullscreen] = useState(false);
  // The merged panel (Merlin, Nov 18, 2026 — phone check): the
  // hint strip + the time/mode controls are ONE panel, and it
  // collapses into a single orb top-left under the hint line.
  // Default open — the controls stay reachable on first entry,
  // as they were; one tap on MIN hides them, one tap on the orb
  // brings them back.
  const [panelMinimized, setPanelMinimized] = useState(false);

  useEffect(() => {
    if (!fullscreen) return undefined;
    const down = (e) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [fullscreen]);

  const profile = useMemo(() => generateMarsProfile(MARS2_SEED), []);

  useEffect(() => {
    document.title = "Mars 2 — Rovers";
  }, []);

  function toggleMode(m) {
    // Leaving the rover for foot always steps out of it first:
    // walk mode must never carry an active rover, or the stick
    // moves the walker while the roverbar still says ROVER ACTIVE
    // (and its speedo freezes at the last value) and the JUMP orb
    // shows as if the rover could jump. The dismount parks the
    // rover where it stands; RIDE summons it back.
    if (m === "walk" && rover.active) {
      dismountRover();
      return;
    }
    setMode((prev) => (prev === m ? "orbit" : m));
  }

  function summonRover() {
    setRoverCmd({ action: "summon", nonce: Date.now() });
    setMode("drive");
  }

  function dismountRover() {
    setRoverCmd({ action: "dismount", nonce: Date.now() });
    setMode("walk");
  }

  // Storm death (outpost round 2, Merlin, Nov 17, 2026): a
  // sandstorm caught the walker exposed and their health hit 0 —
  // the scene already put them back on foot at the outpost spawn
  // with HP restored; the mode drops to walk here so the rover
  // does not carry a dead walker on.
  function handleRespawn() {
    setMode("walk");
  }

  // BUILD MODE (Merlin, Nov 17, 2026): land plots appear on the
  // terrain, mines go in the designated mining areas, barracks
  // recruit crew, everything upgrades. The materials are the
  // SHARED ones (lib/economy/materials.js) — banked into and
  // spent from the backpack, so a Mars-mined unit is the same
  // material the rest of the ecosystem collects. Build state
  // (plots, buildings, crew) is device-local; the materials
  // themselves live in the pack.
  const [buildMode, setBuildMode] = useState(false);
  const backpackRecord = useBackpack();
  const plots = useMemo(() => plotsFor(profile), [profile]);
  const areas = useMemo(() => miningAreasFor(profile), [profile]);
  const [buildState, setBuildState] = useState(() => loadBuildState(plotsFor(profile)));
  const [selectedPlotId, setSelectedPlotId] = useState(null);
  const [buildNotice, setBuildNotice] = useState("");
  // The panel collapses to a chip so the user can see the plots
  // (it covers most of the stage on a phone). Tapping a plot
  // reopens it; the BUILD orb exits build mode outright.
  const [buildPanelCollapsed, setBuildPanelCollapsed] = useState(false);
  function handleSelectPlot(plotId) {
    setSelectedPlotId(plotId);
    if (plotId) setBuildPanelCollapsed(false);
  }
  const wallet = useMemo(() => {
    const w = {};
    for (const id of MARS_MINE_MATERIAL_IDS) w[id] = countItem(backpackRecord, id);
    return w;
  }, [backpackRecord]);

  // Mines accrue only while the page is open — the tick runs
  // here, every 5 s, never offline.
  useEffect(() => {
    const id = setInterval(() => {
      setBuildState((prev) => {
        const next = tickBuildings(prev, Date.now());
        saveBuildState(next);
        return next;
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Apply an engine result's wallet spend to the backpack: the
  // engine spends from the plain wallet, the pack is the truth.
  function spendWalletDiff(oldWallet, newWallet) {
    if (!newWallet) return;
    updateBackpack((rec) => {
      let next = rec;
      for (const id of Object.keys(newWallet)) {
        const diff = (oldWallet[id] || 0) - (newWallet[id] || 0);
        if (diff > 0) next = removeItem(next, id, diff);
      }
      return next;
    });
  }

  function handleBuildMine(plotId) {
    const res = buildMine(buildState, plots, plotId, wallet, Date.now());
    if (!res.ok) { setBuildNotice(res.reason); return; }
    spendWalletDiff(wallet, res.wallet);
    setBuildState(res.state);
    saveBuildState(res.state);
    setBuildNotice("Mine staked — it works the seam now. Collect when it fills.");
  }

  function handleBuildBarracks(plotId) {
    const res = buildBarracks(buildState, plots, plotId, wallet, Date.now());
    if (!res.ok) { setBuildNotice(res.reason); return; }
    spendWalletDiff(wallet, res.wallet);
    setBuildState(res.state);
    saveBuildState(res.state);
    setBuildNotice("Barracks up — crew can be recruited here now.");
  }

  function handleUpgrade(buildingId) {
    const res = upgradeBuilding(buildState, buildingId, wallet, Date.now());
    if (!res.ok) { setBuildNotice(res.reason); return; }
    spendWalletDiff(wallet, res.wallet);
    setBuildState(res.state);
    saveBuildState(res.state);
    setBuildNotice("Upgraded — bigger, better output.");
  }

  function handleCollect(buildingId) {
    const building = buildState.buildings.find((b) => b.id === buildingId);
    const res = collectBuilding(buildState, buildingId);
    if (!res.ok) { setBuildNotice(res.reason); return; }
    const matId = mineMaterialId(building, plots);
    const item = materialItemFor(matId, res.qty, "mars-2-mine");
    const mat = materialById(matId);
    if (item) {
      updateBackpack((rec) => addItem(rec, item));
      setBuildNotice(`Collected ${res.qty} ${mat ? mat.name : matId} into the backpack.`);
    } else {
      // No plot, no material: the yield has nowhere to bank.
      // Say so plainly instead of claiming it banked.
      setBuildNotice("That mine's plot is gone — its yield couldn't be banked.");
    }
    setBuildState(res.state);
    saveBuildState(res.state);
  }

  function handleRecruit() {
    const res = recruitCrew(buildState, wallet);
    if (!res.ok) { setBuildNotice(res.reason); return; }
    spendWalletDiff(wallet, res.wallet);
    setBuildState(res.state);
    saveBuildState(res.state);
    setBuildNotice("Crew recruited — assign them to a mine to raise its output.");
  }

  function handleAssignCrew(buildingId, delta) {
    const res = assignCrew(buildState, buildingId, delta);
    if (!res.ok) { setBuildNotice(res.reason); return; }
    setBuildState(res.state);
    saveBuildState(res.state);
    setBuildNotice(delta > 0 ? "Crew on the mine — output up." : "Crew pulled off the mine.");
  }

  // Touch stick (the universal controls core): the scene reads
  // these keys for walking AND for driving the rover, so the
  // stick drives both. 0.2 dead zone, so a resting thumb never
  // creeps the walker. The keyboard writes the same keys; a stick
  // release centres them (a held key + stick together is the one
  // overlap — the stick wins while it is held).
  const onMarsMove = (x, y) => {
    const k = inputRef.current.keys;
    k.fwd = y > 0.2;
    k.back = y < -0.2;
    k.left = x < -0.2;
    k.right = x > 0.2;
  };

  const presets = [["Dawn", 0.26], ["Day", 0.5], ["Dusk", 0.72], ["Night", 0.95]];
  const clock = useMemo(() => {
    try {
      const place = getDayNightPlace();
      return dayNightFor(Date.now(), place.lat, place.lon).clock;
    } catch {
      return "";
    }
  }, [time]);

  // The under-screen controls, as shared fragments: the same
  // controls render below the stage in the normal layout and
  // inside the stage in fullscreen (Merlin, Nov 17 ~22:09 — in
  // fullscreen the fixed stage covers the page below it, so the
  // TIME slider, presets and WALK/RIDE/ORBIT were unreachable).
  // Same handlers, same orbs — only where they live changes.
  // The status line — the "information script" that already
  // sits top-left (the roverbar's text). One fragment, two homes:
  // the roverbar itself (normal layout, and fullscreen while the
  // merged panel is minimized) and the merged panel's header row
  // (fullscreen while it is open). Same words either way.
  const statusLine = rover.active ? (
    <span><b>◉ ROVER ACTIVE</b> · {rover.speedKmh.toFixed(0)} km/h · top {roverSpeedKmh(ROVER_TOP_SPEED_MPS).toFixed(0)} km/h</span>
  ) : (
    <span><b>○ ON FOOT</b> · walk {WALK_SPEED_MPS.toFixed(0)} m/s — summon the rover to drive</span>
  );
  const timeSlider = (
    <div className="ctl">
      <span>TIME</span>
      <input type="range" min="0" max="1000" value={Math.round(time * 1000)}
        onChange={(e) => setManualTime(Number(e.target.value) / 1000)} aria-label="Time of day" />
      <span className="clock">{timeString(time)} · {timeLabel(time)}{liveTime ? " · LIVE" : " · MANUAL"}{clock ? ` · ${clock}` : ""}</span>
    </div>
  );
  const timeOrbs = (
    <>
      {presets.map(([label, t], i) => {
        const Icon = PRESET_ICONS[i % PRESET_ICONS.length];
        return (
          <OrbButton key={label} accent="#e07840" onClick={() => setManualTime(t)} ariaLabel={`Set time to ${label}`}>
            <Icon /><OrbLabel>{label.toUpperCase()}</OrbLabel>
          </OrbButton>
        );
      })}
      <OrbButton accent="#e07840" active={liveTime} onClick={resumeLiveTime} aria-pressed={liveTime} ariaLabel="Follow real time">
        <IcSun /><OrbLabel>LIVE</OrbLabel>
      </OrbButton>
    </>
  );
  const modeOrbs = (
    <>
      <OrbButton accent="#e07840" active={mode === "walk"} onClick={() => toggleMode("walk")} aria-pressed={mode === "walk"} ariaLabel={mode === "walk" ? "Walking" : "Walk"}>
        <IcRoute /><OrbLabel>WALK</OrbLabel>
      </OrbButton>
      {rover.active ? (
        <OrbButton accent="#e07840" onClick={dismountRover} ariaLabel="Dismount rover">
          <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>⬇</span>
          <OrbLabel>OUT</OrbLabel>
        </OrbButton>
      ) : (
        <OrbButton accent="#e07840" onClick={summonRover} ariaLabel="Summon rover">
          <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>⬆</span>
          <OrbLabel>RIDE</OrbLabel>
        </OrbButton>
      )}
      <OrbButton accent="#e07840" active={mode === "orbit"} onClick={() => setMode("orbit")} aria-pressed={mode === "orbit"} ariaLabel={mode === "orbit" ? "Orbiting" : "Orbit"}>
        <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>◍</span>
        <OrbLabel>ORBIT</OrbLabel>
      </OrbButton>
      {/* BUILD MODE (Merlin, Nov 17, 2026): plots appear on the
          terrain, mines in the mining areas, barracks for crew.
          An overlay mode — the walker still walks, drives and
          flies while it is on. */}
      <OrbButton accent="#e07840" active={buildMode} onClick={() => { setBuildMode((b) => !b); setSelectedPlotId(null); setBuildPanelCollapsed(false); }} aria-pressed={buildMode} ariaLabel={buildMode ? "Exit build mode" : "Enter build mode"}>
        <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>⬢</span>
        <OrbLabel>BUILD</OrbLabel>
      </OrbButton>
    </>
  );

  return (
    <main className="mars2">
      <div className="mars2-bg" aria-hidden="true" />
      <style>{`
        .mars2 { min-height: 100dvh; background: #120806; color: #f6e8da; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; position: relative; }
        .mars2-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background: radial-gradient(120% 90% at 50% 0%, #3a1c0d 0%, #22100a 45%, #120806 100%); }
        .mars2 > *:not(.mars2-bg) { position: relative; z-index: 1; }
        .mars2 header { padding: 18px 20px 10px; }
        .mars2 .kicker { font-size: 11px; letter-spacing: 4px; color: ${ACCENT}; text-transform: uppercase; }
        .mars2 h1 { margin: 4px 0 2px; font-size: clamp(1.6rem, 5vw, 2.6rem); letter-spacing: 6px; font-weight: 800; }
        .mars2 .sub { color: #c99a78; font-size: 0.9rem; max-width: 60ch; }
        .mars2 .stage { position: relative; margin: 10px 16px 0; border: 1px solid #5a3220; border-radius: 14px; overflow: hidden; height: min(62dvh, 560px); min-height: 320px; background: #000; }
        .mars2 .stage canvas { touch-action: none; }
        .mars2 .roverbar { position: absolute; left: 12px; top: 12px; z-index: 5;
          max-width: calc(100% - 92px);
          background: linear-gradient(rgba(16,7,3,0.93), rgba(16,7,3,0.93)); border: 1px solid ${ACCENT}; border-radius: 10px; padding: 10px 14px;
          font-size: 0.8rem; letter-spacing: 1px; color: #f0dcc8; }
        .mars2 .roverbar b { color: ${ACCENT}; }
        .mars2 .controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 14px 20px; }
        .mars2 .ctl { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; letter-spacing: 1px; color: #c99a78; }
        .mars2 input[type="range"] { width: 150px; accent-color: ${ACCENT}; }
        .mars2 button { min-height: 44px; min-width: 44px; padding: 10px 16px; border-radius: 8px; border: 1px solid #5a3220; background: #1c0d06; color: #f6e8da; font-size: 0.8rem; letter-spacing: 1px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
        .mars2 button.on { background: ${ACCENT}; border-color: ${ACCENT}; color: #160a04; font-weight: 700; }
        .mars2 button.rover { border-color: ${ACCENT}; }
        .mars2 .clock { font-variant-numeric: tabular-nums; color: #fff; font-weight: 700; }
        .mars2 .world { margin: 0 16px 20px; border: 1px solid #5a3220; border-radius: 14px; padding: 16px 18px; background: rgba(20,9,4,0.72); }
        .mars2 .world h3 { margin: 0 0 4px; font-size: 0.95rem; letter-spacing: 3px; color: ${ACCENT}; }
        .mars2 .world .biome { color: #e8b48a; font-size: 0.85rem; letter-spacing: 1px; margin-bottom: 10px; }
        .mars2 .vitals { font-size: 0.82rem; color: #c99a78; letter-spacing: 1px; line-height: 1.7; }
        .mars2 .fs-controls { position: absolute; left: 10px; right: 10px; bottom: calc(150px + env(safe-area-inset-bottom, 0px)); z-index: 6;
          display: flex; flex-direction: column; gap: 10px; align-items: center; pointer-events: auto;
          background: linear-gradient(rgba(16,7,3,0.93), rgba(16,7,3,0.93)); border: 1px solid ${ACCENT}; border-radius: 14px; padding: 10px 12px; }
        .mars2 .fs-controls .fs-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center; width: 100%; }
        .mars2 .fs-controls .fs-head { display: flex; gap: 8px; align-items: center; justify-content: space-between; width: 100%; }
        .mars2 .fs-controls .fs-status { flex: 1 1 auto; text-align: left; font-size: 0.8rem; letter-spacing: 1px; color: #f0dcc8; }
        .mars2 .fs-controls .fs-status b { color: ${ACCENT}; }
        .mars2 .fs-controls .ctl { flex: 1 1 100%; flex-wrap: wrap; justify-content: center; }
        .mars2 .fs-controls input[type="range"] { flex: 1 1 120px; min-width: 100px; width: auto; }
      `}</style>

      <header>
        <div className="kicker">ARES // OLYMPUS SURFACE PROGRAM</div>
        <h1>MARS 2</h1>
        <div className="sub">{MARS2_WORLD_NAME} — the successor world. Same red Mars, a new reason to be here: rovers. Walk the dunes, or summon the {ROVER_NAME} and drive them — Olympus Mons on the horizon, dust devils crossing the flats, the ARES outpost waiting at the end of the track.</div>
      </header>

      <div className="stage" style={fullscreen ? { position: "fixed", inset: 0, zIndex: 80, margin: 0, height: "100dvh", borderRadius: 0, border: "none" } : undefined}>
        <Mars2Scene
          profile={profile}
          worldKey={MARS2_SEED}
          timeOfDay={time}
          mode={mode}
          inputRef={inputRef}
          roverCmd={roverCmd}
          onRoverChange={setRover}
          buildMode={buildMode}
          buildState={buildState}
          buildPlots={plots}
          buildAreas={areas}
          selectedPlotId={selectedPlotId}
          onSelectPlot={handleSelectPlot}
          jumpRef={jumpRef}
          onRespawn={handleRespawn}
        />
        {/* Build mode panel — inside the stage, so it stays
            reachable in fullscreen too (the fixed stage covers
            the page below it). Sits below the Thule pill, clear
            of the roverbar, joystick, JUMP and fullscreen orb. */}
        {buildMode && (
          <BuildPanel
            plots={plots}
            areas={areas}
            state={buildState}
            wallet={wallet}
            selectedPlotId={selectedPlotId}
            onSelectPlot={handleSelectPlot}
            onBuildMine={handleBuildMine}
            onBuildBarracks={handleBuildBarracks}
            onUpgrade={handleUpgrade}
            onCollect={handleCollect}
            onRecruit={handleRecruit}
            onAssignCrew={handleAssignCrew}
            onClose={() => { setBuildMode(false); setSelectedPlotId(null); setBuildPanelCollapsed(false); }}
            onCollapse={() => setBuildPanelCollapsed(true)}
            collapsed={buildPanelCollapsed}
            onExpand={() => setBuildPanelCollapsed(false)}
            notice={buildNotice}
          />
        )}
        {/* Universal controls core (Merlin, Nov 16 ~03:49): the
            fixed joystick bottom-left + the docked JUMP orb (walk
            mode only, and only while the rover is parked — the
            rover has no jump) + the fullscreen orb at the very
            top right. The roverbar above already carries the
            instructions, so no hint pill here. Mars 2 has no
            backpack, no weapon and no merchant, so those core
            slots stay off — nothing invented. */}
        <ControlsCore world="mars-2" accent={ACCENT}
          onMove={mode === "orbit" ? undefined : onMarsMove}
          onJump={mode === "walk" && !rover.active ? () => { jumpRef.current = true; } : undefined}
          fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen((f) => !f)}
        />
        {/* The roverbar — the information script, top-left. It
            shows whenever the merged panel is NOT open in
            fullscreen: in the normal layout always, and in
            fullscreen while the panel is minimized (the orb sits
            directly under it). While the panel is open, the same
            status line is the panel's header row, so the roverbar
            hides — one status line, never two. */}
        {(!fullscreen || panelMinimized) && (
          <div className="roverbar" aria-live="polite">
            {statusLine}
          </div>
        )}
        {/* Fullscreen controls (Merlin, Nov 17 ~22:09): the fixed
            stage covers the page below it, so the under-screen
            controls move INSIDE the stage while fullscreen is on —
            the same fragments, parked above the joystick row (the
            stick's top edge sits 138 px + safe-area off the floor,
            so the panel's 150 px + safe-area floor clears it by
            12 px) where they never cover the stick, JUMP, roverbar,
            Thule pill or the fullscreen orb. Normal layout keeps
            them below the stage, exactly as before. */}
        {fullscreen && (
          <>
            {!panelMinimized && (
              <div className="fs-controls" role="group" aria-label="Mars 2 controls">
                <div className="fs-head">
                  <span className="fs-status">{statusLine}</span>
                  <OrbButton fn="minimize" size={40} ariaLabel="Minimize panel" title="Minimize panel" onClick={() => setPanelMinimized(true)} />
                </div>
                <div className="fs-row">{timeSlider}</div>
                <div className="fs-row">{timeOrbs}</div>
                <div className="fs-row">{modeOrbs}</div>
              </div>
            )}
            {panelMinimized && (
              <OrbButton fn="expand" ariaLabel="Expand Mars 2 controls" title="Expand Mars 2 controls" onClick={() => setPanelMinimized(false)} style={{ position: "absolute", left: 12, top: 88, zIndex: 6 }}>
                <OrbLabel>PANEL</OrbLabel>
              </OrbButton>
            )}
          </>
        )}
      </div>

      {/* Under-screen controls — circle orbs only (Merlin, Nov 16 —
          standing law). The TIME slider stays a slider: a continuous
          range input has no orb form, and its thumb is already a
          circle. The maximize orb lives on the stage itself, top
          right, via the controls core. In fullscreen these live
          inside the stage instead (see .fs-controls above) — the
          fixed stage covers this part of the page. */}
      {!fullscreen && (
        <>
          <div className="controls">
            {timeSlider}
            {timeOrbs}
          </div>

          <div className="controls" style={{ paddingTop: 0 }}>
            {modeOrbs}
          </div>
        </>
      )}

      <section className="world" aria-label="World profile">
        <h3>{MARS2_WORLD_NAME}</h3>
        <div className="biome">Dune Sea · Seed {MARS2_SEED} · Successor to Mars 1</div>
        <div className="vitals">
          ROVER {ROVER_NAME} · TOP {roverSpeedKmh(ROVER_TOP_SPEED_MPS).toFixed(0)} KM/H · 6 WHEELS · CAMERA MAST · HIGH-GAIN DISH<br />
          WALK {WALK_SPEED_MPS.toFixed(0)} M/S ON FOOT · OLYMPUS MONS ON THE HORIZON · DUST DEVILS · ARES OUTPOST · DAY / NIGHT ON THE REAL CLOCK
        </div>
      </section>
    </main>
  );
}
