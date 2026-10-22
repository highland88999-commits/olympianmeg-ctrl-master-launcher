'use client';

// MarsConsole — the DOM shell for the Mars realm INSIDE the hub
// (Merlin, 2026-10-21: the seeded surface lives in the hub's Mars
// planet, tapped open like Earth — the standalone /mars page stays as
// a second door). Markup, classes and copy are lifted from
// app/mars/page.jsx; the layout is re-hung as a full-screen overlay
// (header top-left, world panel top-right, control dock bottom-center,
// organism card bottom-right) and the .mars styles ride along in this
// component so the hub page gets them without touching the page's own
// copy. Realm state (seed/time/mode/selection/focus/input) is owned by
// app/page.jsx and arrives as props; the 3D half is MarsRealmContent
// (components/mars/MarsScene.jsx) mounted by HomeScene, and the
// walk/fly TouchControls are the scene's own, rendered here as DOM.

import { useState } from 'react';
import { TouchControls } from '@/components/mars/MarsScene';
import { IcSunrise, IcSun, IcSunset, IcMoon, IcWings, IcClose, IcRoute, IcRefresh, IcMeteor } from "@/app/artemis-ui/icons";

const ACCENT = "#e07840";
const PRESET_ICONS = [IcSunrise, IcSun, IcSunset, IcMoon];
const ELEMENT_LABELS = [
  ["earth", "EARTH"], ["air", "AIR"], ["fire", "FIRE"],
  ["water", "WATER"], ["mercury", "MERCURY"], ["aether", "AETHER"],
];
const NICHE_ORDER = ["airborne", "grazer", "carnivore", "waterBorne", "mercuryBorne"];

// Same clock helpers the surface pages use (t: 0..1 of a day).
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

function MarsConsoleStyles() {
  return (
    <style>{`
      .mars { color: #f6e8da; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
      .mars-console { position: absolute; inset: 0; z-index: 70; pointer-events: none; }
      .mars-console header { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 14px); left: 16px; max-width: min(430px, 50vw); pointer-events: none; text-shadow: 0 1px 8px rgba(0,0,0,0.85); }
      .mars .kicker { font-size: 11px; letter-spacing: 4px; color: ${ACCENT}; text-transform: uppercase; }
      .mars h1 { margin: 4px 0 2px; font-size: clamp(1.6rem, 5vw, 2.6rem); letter-spacing: 6px; font-weight: 800; }
      .mars .sub { color: #c99a78; font-size: 0.9rem; max-width: 60ch; }
      .mars .panel { position: absolute; right: 12px; bottom: 12px; width: min(430px, calc(100vw - 24px)); z-index: 5; pointer-events: auto;
        background: linear-gradient(rgba(16,7,3,0.93), rgba(16,7,3,0.93)); border: 1px solid ${ACCENT}; border-radius: 10px; padding: 14px 16px; }
      .mars .panel h2 { margin: 0 0 6px; font-size: 1.05rem; letter-spacing: 2px; color: ${ACCENT}; }
      .mars .panel p { margin: 0 0 6px; font-size: 0.88rem; line-height: 1.5; color: #f0dcc8; }
      .mars .panel .meta { font-size: 0.78rem; letter-spacing: 1px; color: #c99a78; text-transform: uppercase; }
      .mars-console .dock { position: absolute; left: 50%; transform: translateX(-50%); bottom: 10px; width: max-content; max-width: calc(100vw - 20px);
        display: flex; flex-direction: column; background: rgba(18,8,4,0.55); border: 1px solid #5a3220; border-radius: 12px; padding: 4px 10px; }
      .mars-console.walking .dock { bottom: 136px; }
      .mars-console.walking .panel { bottom: 150px; }
      .mars .controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 8px 6px; }
      .mars .ctl { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; letter-spacing: 1px; color: #c99a78; }
      .mars input[type="range"] { width: 150px; accent-color: ${ACCENT}; pointer-events: auto; }
      .mars input[type="text"] { min-height: 44px; padding: 10px 14px; border-radius: 8px; border: 1px solid #5a3220; background: #1c0d06; color: #f6e8da; font-size: 0.85rem; letter-spacing: 2px; text-transform: uppercase; width: 200px; pointer-events: auto; }
      .mars button { min-height: 44px; min-width: 44px; padding: 10px 16px; border-radius: 8px; border: 1px solid #5a3220; background: #1c0d06; color: #f6e8da; font-size: 0.8rem; letter-spacing: 1px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; pointer-events: auto; }
      .mars button.on { background: ${ACCENT}; border-color: ${ACCENT}; color: #160a04; font-weight: 700; }
      .mars button.returnbtn { border-color: ${ACCENT}; color: #ffb37a; font-weight: 700; }
      .mars .clock { font-variant-numeric: tabular-nums; color: #fff; font-weight: 700; }
      .mars .world { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 14px); right: 16px; width: min(330px, 44vw); max-height: 46dvh; overflow-y: auto; pointer-events: auto;
        border: 1px solid #5a3220; border-radius: 14px; padding: 16px 18px; background: rgba(20,9,4,0.72); }
      .mars .world h3 { margin: 0 0 4px; font-size: 0.95rem; letter-spacing: 3px; color: ${ACCENT}; }
      .mars .world .biome { color: #e8b48a; font-size: 0.85rem; letter-spacing: 1px; margin-bottom: 10px; }
      .mars .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
      .mars .chip { border: 1px solid #5a3220; border-radius: 999px; padding: 5px 12px; font-size: 0.75rem; letter-spacing: 1px; color: #f0dcc8; background: #1c0d06; }
      .mars .chip b { color: ${ACCENT}; }
      .mars .vitals { font-size: 0.82rem; color: #c99a78; letter-spacing: 1px; line-height: 1.7; }
      .mars .species { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
      .mars .species .row { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: baseline; border-top: 1px solid #3a2013; padding-top: 8px; font-size: 0.85rem; }
      .mars .species .name { font-weight: 700; color: #ffe3cc; }
      .mars .species .niche { color: ${ACCENT}; font-size: 0.75rem; letter-spacing: 1px; text-transform: uppercase; }
      .mars .species .diet { color: #c99a78; font-size: 0.8rem; }
      .mars-console .hint { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); color: #ffe3cc; font-size: 11px; letter-spacing: 2px;
        text-shadow: 0 1px 4px #000; background: rgba(0,0,0,0.35); padding: 6px 14px; border-radius: 8px; pointer-events: none; white-space: nowrap; }
      .mars-console .touchwrap div, .mars-console .touchwrap button { pointer-events: auto; }
      .mars .worldhead { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
      .mars .minbtn { min-height: 32px; min-width: 32px; padding: 4px 8px; font-size: 0.9rem; line-height: 1; flex-shrink: 0; }
      .mars .worldchip { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 14px); right: 16px; z-index: 5; border-radius: 999px; border-color: ${ACCENT}; color: #ffe3cc; font-size: 0.75rem; letter-spacing: 1px; background: rgba(20,9,4,0.85); }
      .mars .dockchip { position: absolute; left: 50%; transform: translateX(-50%); bottom: 10px; z-index: 5; border-radius: 999px; border-color: ${ACCENT}; color: #ffe3cc; font-size: 0.75rem; letter-spacing: 1px; background: rgba(20,9,4,0.85); white-space: nowrap; }
      .mars-console.walking .dockchip { bottom: 136px; }
      @media (max-width: 760px) {
        .mars-console header { max-width: 46vw; }
        .mars .sub { display: none; }
        .mars .world { width: 46vw; max-height: 34dvh; padding: 12px; }
        .mars .panel { bottom: 168px; }
        .mars-console.walking .panel { bottom: 292px; }
      }
    `}</style>
  );
}

export default function MarsConsole({
  profile, seed, setSeed, time, setTime, mode, onToggleMode,
  selected, onSelect, inputRef, onExit,
}) {
  const [seedInput, setSeedInput] = useState(seed);
  // Minimize state for the two overlay windows (Merlin bug report,
  // 2026-10-22: "the planetary information window is also not
  // minimizable" — the world-profile panel had NO minimize or close
  // control at all, and neither did the control dock; on a phone the
  // panel permanently covers the top-right of the scene). Both
  // collapse to a small chip that brings them back, and the choice
  // is remembered on-device like the Earth console's.
  const [worldMin, setWorldMin] = useState(() => {
    try { return localStorage.getItem('mars-world-minimized') === '1'; } catch { return false; }
  });
  const [dockMin, setDockMin] = useState(() => {
    try { return localStorage.getItem('mars-dock-minimized') === '1'; } catch { return false; }
  });
  const toggleWorldMin = (v) => {
    setWorldMin(v);
    try { localStorage.setItem('mars-world-minimized', v ? '1' : '0'); } catch {}
  };
  const toggleDockMin = (v) => {
    setDockMin(v);
    try { localStorage.setItem('mars-dock-minimized', v ? '1' : '0'); } catch {}
  };

  function applySeed() {
    const clean = seedInput.trim();
    if (clean) setSeed(clean.toUpperCase());
  }

  function randomSeed() {
    const s = "MARS-" + Math.floor(1000 + Math.random() * 9000);
    setSeedInput(s);
    setSeed(s);
    onSelect(null);
  }

  const presets = [["Dawn", 0.26], ["Day", 0.5], ["Dusk", 0.72], ["Night", 0.95]];
  const c = profile.counts;

  return (
    <div className={`mars mars-console ui-element${mode !== 'orbit' ? ' walking' : ''}`}>
      <MarsConsoleStyles />

      <header>
        <div className="kicker">ARES // OLYMPUS SURFACE PROGRAM</div>
        <h1>MARS</h1>
        <div className="sub">{profile.worldName} — {profile.biomeClass}. One seed grows the whole region: terrain, brine and quicksilver basins, flora, and five niches of seeded life. Drag to orbit, walk the regolith, or fly the basin — tap a creature for its exobiology.</div>
      </header>

      {worldMin ? (
        <button className="worldchip" onClick={() => toggleWorldMin(false)} aria-label="Show world information">
          🪐 {profile.worldName} · INFO ＋
        </button>
      ) : (
      <section className="world" aria-label="World profile">
        <div className="worldhead">
          <div>
            <h3>{profile.worldName}</h3>
            <div className="biome">{profile.biomeClass} · Seed {profile.seed}</div>
          </div>
          <button className="minbtn" onClick={() => toggleWorldMin(true)} aria-label="Minimize world information" title="Minimize">—</button>
        </div>
        <div className="chips">
          {ELEMENT_LABELS.map(([key, label]) => (
            <span key={key} className="chip">{label} <b>{profile.elements[key]}%</b></span>
          ))}
        </div>
        <div className="vitals">
          GRAVITY {profile.gravity} · SURFACE {profile.surfaceTemp} · ATMOSPHERE {profile.atmosPressure}<br />
          FLORA {c.flora} · AIRBORNE {c.airborne} · GRAZERS {c.grazers} · CARNIVORES {c.carnivores} · HYDRO {c.waterBorne} · FERRO {c.mercuryBorne}
        </div>
        <div className="species">
          {NICHE_ORDER.map((niche) => {
            const s = profile.speciesCatalog[niche];
            return (
              <div key={niche} className="row">
                <span className="name">{s.name}</span>
                <span className="niche">{s.niche}</span>
                <span className="diet">{s.diet}</span>
              </div>
            );
          })}
        </div>
      </section>
      )}

      {selected && (
        <div className="panel" role="dialog" aria-label={selected.name}>
          <h2>{selected.name}</h2>
          <div className="meta">{selected.niche}</div>
          <p>Element: {selected.element}</p>
          <p>Diet: {selected.diet}</p>
          <button onClick={() => onSelect(null)} aria-label="Close organism panel"><IcClose /><span>Close</span></button>
        </div>
      )}

      {dockMin ? (
        <button className="dockchip" onClick={() => toggleDockMin(false)} aria-label="Show Mars controls">
          ⚙ CONTROLS ＋
        </button>
      ) : (
      <div className="dock">
        <div className="controls">
          <div className="ctl">
            <span>TIME</span>
            <input type="range" min="0" max="1000" value={Math.round(time * 1000)}
              onChange={(e) => setTime(Number(e.target.value) / 1000)} aria-label="Time of day" />
            <span className="clock">{timeString(time)} · {timeLabel(time)}</span>
          </div>
          {presets.map(([label, t], i) => {
            const Icon = PRESET_ICONS[i % PRESET_ICONS.length];
            return (
              <button key={label} onClick={() => setTime(t)} aria-label={`Set time to ${label}`}>
                <Icon /><span>{label}</span>
              </button>
            );
          })}
          <button className={mode === "walk" ? "on" : ""} onClick={() => onToggleMode("walk")} aria-pressed={mode === "walk"}>
            <IcRoute /><span>{mode === "walk" ? "WALKING" : "WALK"}</span>
          </button>
          <button className={mode === "fly" ? "on" : ""} onClick={() => onToggleMode("fly")} aria-pressed={mode === "fly"}>
            <IcWings /><span>{mode === "fly" ? "FLYING" : "FLY"}</span>
          </button>
          <button className="minbtn" onClick={() => toggleDockMin(true)} aria-label="Minimize Mars controls" title="Minimize">—</button>
        </div>

        <div className="controls" style={{ paddingTop: 0 }}>
          <div className="ctl">
            <span>SEED</span>
            <input type="text" value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applySeed(); }}
              aria-label="World seed" />
          </div>
          <button onClick={applySeed} aria-label="Apply seed"><IcMeteor /><span>APPLY</span></button>
          <button onClick={randomSeed} aria-label="Random seed"><IcRefresh /><span>RANDOM</span></button>
          <button className="returnbtn" onClick={onExit} aria-label="Return to orbit">RETURN TO ORBIT</button>
        </div>
      </div>
      )}

      {mode !== 'orbit' && (
        <div className="hint">
          {mode === 'walk' ? 'STICK / WASD MOVE · DRAG LOOK' : 'STICK / WASD MOVE · ▲▼ / SPACE / C · DRAG LOOK'}
        </div>
      )}
      {mode !== 'orbit' && (
        <div className="touchwrap">
          <TouchControls inputRef={inputRef} fly={mode === 'fly'} />
        </div>
      )}
    </div>
  );
}
