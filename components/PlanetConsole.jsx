'use client';

// PlanetConsole — the DOM shell for a hub planet's realm INSIDE the
// hub (Merlin, 2026-10-22: "Street level click enabled for all
// planets"). Modeled directly on MarsConsole (components/
// MarsConsole.jsx): header top-left, world panel top-right, control
// dock bottom-center, organism card bottom-right, minimize chips on
// both windows. Two deliberate differences from Mars:
//   - The seed is CANONICAL (lib/planets/planet-seeds.js) — shown,
//     never edited. There is no seed input, no APPLY, no RANDOM.
//   - The world's LIFE TYPE is a first-class line: seed, planet and
//     life kind are the realm's identity (seedEntry arrives as a
//     prop alongside the generated profile).
// Realm state (time/mode/selection/focus/input) is owned by
// app/page.jsx; the 3D half is PlanetRealmContent mounted by
// HomeScene, and walk/fly TouchControls are the Mars scene's own,
// rendered here as DOM — one implementation, no drift.

import { useEffect, useMemo, useState } from 'react';
import { TouchControls } from '@/components/mars/MarsScene';
import { IcSunrise, IcSun, IcSunset, IcMoon, IcWings, IcClose, IcRoute } from "@/app/artemis-ui/icons";
import { lifeTypeLabel } from '@/lib/planets/planet-seeds';
import { getLandscape } from '@/lib/planets/landscape';

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

// The region underfoot (Merlin, 2026-10-22: regions with invisible
// lines and organic transitions). The planet's surface is five soft
// regions blended by continuous weights (lib/planets/landscape.js)
// — there is no line to cross, so this readout names the DOMINANT
// region, and inside a blend band it says so honestly: "BETWEEN X
// AND Y". Polls the scene-fed position ref a few times a second.
function RegionReadout({ profile, posRef }) {
  const landscape = useMemo(() => getLandscape(profile), [profile]);
  const [label, setLabel] = useState(null);
  useEffect(() => {
    if (!posRef) return undefined;
    const read = () => {
      const p = posRef.current || { x: 10, z: 26 };
      const b = landscape.blendAt(p.x, p.z);
      setLabel({
        text: b.between
          ? `BETWEEN ${b.top.name.toUpperCase()} AND ${b.second.name.toUpperCase()}`
          : b.top.name.toUpperCase(),
        color: b.top.colorHex,
      });
    };
    read();
    const id = setInterval(read, 300);
    return () => clearInterval(id);
  }, [landscape, posRef]);
  if (!posRef || !label) return null;
  return (
    <div className="regionline">
      <span className="dot" style={{ background: label.color }} aria-hidden="true" />
      <span>REGION&nbsp;·&nbsp;{label.text}</span>
    </div>
  );
}

function PlanetConsoleStyles({ accent, deep }) {
  return (
    <style>{`
      .planet { color: #eef2f5; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
      .planet-console { position: absolute; inset: 0; z-index: 70; pointer-events: none; }
      .planet-console header { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 14px); left: 16px; max-width: min(430px, 50vw); pointer-events: none; text-shadow: 0 1px 8px rgba(0,0,0,0.85); }
      .planet .kicker { font-size: 11px; letter-spacing: 4px; color: ${accent}; text-transform: uppercase; }
      .planet h1 { margin: 4px 0 2px; font-size: clamp(1.6rem, 5vw, 2.6rem); letter-spacing: 6px; font-weight: 800; }
      .planet .sub { color: #c3ced6; font-size: 0.9rem; max-width: 60ch; }
      .planet .panel { position: absolute; right: 12px; bottom: 12px; width: min(430px, calc(100vw - 24px)); z-index: 5; pointer-events: auto;
        background: linear-gradient(${deep}, ${deep}); border: 1px solid ${accent}; border-radius: 10px; padding: 14px 16px; }
      .planet .panel h2 { margin: 0 0 6px; font-size: 1.05rem; letter-spacing: 2px; color: ${accent}; }
      .planet .panel p { margin: 0 0 6px; font-size: 0.88rem; line-height: 1.5; color: #e6edf2; }
      .planet .panel .meta { font-size: 0.78rem; letter-spacing: 1px; color: #aeb9c2; text-transform: uppercase; }
      .planet-console .dock { position: absolute; left: 50%; transform: translateX(-50%); bottom: 10px; width: max-content; max-width: calc(100vw - 20px);
        display: flex; flex-direction: column; background: rgba(8,12,16,0.55); border: 1px solid ${accent}; border-radius: 12px; padding: 4px 10px; }
      .planet-console.walking .dock { bottom: 136px; }
      .planet-console.walking .panel { bottom: 150px; }
      .planet .controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 8px 6px; }
      .planet .ctl { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; letter-spacing: 1px; color: #aeb9c2; }
      .planet input[type="range"] { width: 150px; accent-color: ${accent}; pointer-events: auto; }
      .planet button { min-height: 44px; min-width: 44px; padding: 10px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.22); background: rgba(8,12,16,0.85); color: #eef2f5; font-size: 0.8rem; letter-spacing: 1px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; pointer-events: auto; }
      .planet button.on { background: ${accent}; border-color: ${accent}; color: #0b0f13; font-weight: 700; }
      .planet button.returnbtn { border-color: ${accent}; color: ${accent}; font-weight: 700; }
      .planet .clock { font-variant-numeric: tabular-nums; color: #fff; font-weight: 700; }
      .planet .seedline { font-size: 0.8rem; letter-spacing: 1px; color: #aeb9c2; }
      .planet .seedline b { color: ${accent}; }
      .planet .world { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 14px); right: 16px; width: min(330px, 44vw); max-height: 46dvh; overflow-y: auto; pointer-events: auto;
        border: 1px solid rgba(255,255,255,0.22); border-radius: 14px; padding: 16px 18px; background: rgba(8,12,16,0.72); }
      .planet .world h3 { margin: 0 0 4px; font-size: 0.95rem; letter-spacing: 3px; color: ${accent}; }
      .planet .world .biome { color: #d7dfe5; font-size: 0.85rem; letter-spacing: 1px; margin-bottom: 6px; }
      .planet .world .life { color: #aeb9c2; font-size: 0.82rem; letter-spacing: 0.5px; margin-bottom: 10px; line-height: 1.45; }
      .planet .world .life b { color: ${accent}; }
      .planet .regionline { display: flex; align-items: center; gap: 8px; font-size: 0.78rem; letter-spacing: 1px; color: #e6edf2; margin-bottom: 10px; }
      .planet .regionline .dot { width: 10px; height: 10px; border-radius: 999px; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.35); }
      .planet .regions { margin-bottom: 10px; display: flex; flex-direction: column; gap: 5px; }
      .planet .regions .rrow { display: flex; align-items: center; gap: 8px; font-size: 0.78rem; letter-spacing: 0.5px; color: #d7dfe5; }
      .planet .regions .rdot { width: 9px; height: 9px; border-radius: 999px; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.3); }
      .planet .regions .rform { color: #aeb9c2; text-transform: uppercase; font-size: 0.68rem; letter-spacing: 1px; }
      .planet .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
      .planet .chip { border: 1px solid rgba(255,255,255,0.22); border-radius: 999px; padding: 5px 12px; font-size: 0.75rem; letter-spacing: 1px; color: #e6edf2; background: rgba(8,12,16,0.85); }
      .planet .chip b { color: ${accent}; }
      .planet .vitals { font-size: 0.82rem; color: #aeb9c2; letter-spacing: 1px; line-height: 1.7; }
      .planet .species { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
      .planet .species .row { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: baseline; border-top: 1px solid rgba(255,255,255,0.14); padding-top: 8px; font-size: 0.85rem; }
      .planet .species .name { font-weight: 700; color: #ffffff; }
      .planet .species .niche { color: ${accent}; font-size: 0.75rem; letter-spacing: 1px; text-transform: uppercase; }
      .planet .species .diet { color: #aeb9c2; font-size: 0.8rem; }
      .planet-console .hint { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); color: #ffffff; font-size: 11px; letter-spacing: 2px;
        text-shadow: 0 1px 4px #000; background: rgba(0,0,0,0.35); padding: 6px 14px; border-radius: 8px; pointer-events: none; white-space: nowrap; }
      .planet-console .touchwrap div, .planet-console .touchwrap button { pointer-events: auto; }
      .planet .worldhead { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
      .planet .minbtn { min-height: 32px; min-width: 32px; padding: 4px 8px; font-size: 0.9rem; line-height: 1; flex-shrink: 0; }
      .planet .worldchip { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 14px); right: 16px; z-index: 5; border-radius: 999px; border-color: ${accent}; color: #ffffff; font-size: 0.75rem; letter-spacing: 1px; background: rgba(8,12,16,0.85); }
      .planet .dockchip { position: absolute; left: 50%; transform: translateX(-50%); bottom: 10px; z-index: 5; border-radius: 999px; border-color: ${accent}; color: #ffffff; font-size: 0.75rem; letter-spacing: 1px; background: rgba(8,12,16,0.85); white-space: nowrap; }
      .planet-console.walking .dockchip { bottom: 136px; }
      @media (max-width: 760px) {
        .planet-console header { max-width: 46vw; }
        .planet .sub { display: none; }
        .planet .world { width: 46vw; max-height: 34dvh; padding: 12px; }
        .planet .panel { bottom: 168px; }
        .planet-console.walking .panel { bottom: 292px; }
      }
    `}</style>
  );
}

export default function PlanetConsole({
  profile, seedEntry, time, setTime, mode, onToggleMode,
  selected, onSelect, inputRef, onExit, posRef,
}) {
  const landscape = useMemo(() => getLandscape(profile), [profile]);
  // Minimize state for the two overlay windows — same pattern and
  // rationale as MarsConsole (Merlin bug report, 2026-10-22: overlay
  // windows must minimize on a phone), remembered on-device.
  const [worldMin, setWorldMin] = useState(() => {
    try { return localStorage.getItem('planet-world-minimized') === '1'; } catch { return false; }
  });
  const [dockMin, setDockMin] = useState(() => {
    try { return localStorage.getItem('planet-dock-minimized') === '1'; } catch { return false; }
  });
  const toggleWorldMin = (v) => {
    setWorldMin(v);
    try { localStorage.setItem('planet-world-minimized', v ? '1' : '0'); } catch {}
  };
  const toggleDockMin = (v) => {
    setDockMin(v);
    try { localStorage.setItem('planet-dock-minimized', v ? '1' : '0'); } catch {}
  };

  const presets = [["Dawn", 0.26], ["Day", 0.5], ["Dusk", 0.72], ["Night", 0.95]];
  const c = profile.counts;
  const accent = '#' + profile.groundAccentColor.getHexString();
  const deep = 'rgba(8,12,16,0.93)';
  const planetName = profile.planetName || seedEntry.key;

  return (
    <div className={`planet planet-console ui-element${mode !== 'orbit' ? ' walking' : ''}`}>
      <PlanetConsoleStyles accent={accent} deep={deep} />

      <header>
        <div className="kicker">OLYMPUS SURFACE PROGRAM</div>
        <h1>{planetName.toUpperCase()}</h1>
        <div className="sub">{profile.worldName} — {profile.biomeClass}. {seedEntry.lifeLabel}. One canonical seed grows the whole region: terrain, basins, flora, and five niches of seeded life. Drag to orbit, walk the surface, or fly — tap a creature for its biology.</div>
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
        <div className="life">🌱 <b>{lifeTypeLabel(seedEntry.lifeType)}</b> — {seedEntry.lifeLabel}</div>
        <RegionReadout profile={profile} posRef={posRef} />
        <div className="regions" aria-label="Surface regions">
          {landscape.biomes.map((b) => {
            const topArch = Object.entries(b.archetypeWeights).sort((x, y) => y[1] - x[1])[0];
            return (
              <div key={b.id} className="rrow">
                <span className="rdot" style={{ background: b.colorHex }} aria-hidden="true" />
                <span>{b.name}</span>
                <span className="rform">{b.floraForm} · {topArch ? topArch[0] : 'wild'}</span>
              </div>
            );
          })}
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
        <button className="dockchip" onClick={() => toggleDockMin(false)} aria-label="Show planet controls">
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
          <button className="minbtn" onClick={() => toggleDockMin(true)} aria-label="Minimize planet controls" title="Minimize">—</button>
        </div>

        <div className="controls" style={{ paddingTop: 0 }}>
          <div className="seedline">
            🌱 SEED <b>{seedEntry.seed}</b> · {lifeTypeLabel(seedEntry.lifeType).toUpperCase()}
          </div>
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
