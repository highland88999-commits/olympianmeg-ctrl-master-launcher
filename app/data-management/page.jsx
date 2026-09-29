'use client';

/*
 * PROJECT OLYMPUS // MISSION CONTROL — holographic diagnostic deck.
 * Rebuilt from the single-file original as a self-contained module.
 * The original loaded Google Fonts from fonts.googleapis.com; this build
 * uses system font stacks only. No external requests of any kind.
 * Deck position persists on this device only (localStorage).
 */

import { useEffect, useRef, useState } from 'react';

const TITLE = 'PROJECT OLYMPUS // MISSION CONTROL';
const STORAGE_KEY = 'mission-control.deck.v1';
const NODE_COUNT = 60;

const DECKS = [
  '01 // HOME DECK',
  '02 // THE ENGINE CELLS',
  '03 // SPIDERWEB GRID',
  '04 // HYDRO SYSTEM',
  '05 // SYNAPSE OS',
];

const CSS = `
.mc-wrap { box-sizing: border-box; margin: 0; padding: 0; font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace; background: #020813; color: #e0f7fc; overflow: hidden; height: 100dvh; width: 100vw; user-select: none; }
.mc-wave { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; opacity: 0.7; }
.mc-holo { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; pointer-events: none; background: linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.25) 50%), linear-gradient(90deg, rgba(255,0,0,0.06), rgba(0,255,0,0.02), rgba(0,0,255,0.06)); background-size: 100% 4px, 6px 100%; }
.mc-shell { position: relative; z-index: 3; display: flex; flex-direction: column; height: 100vh; width: 100vw; padding: 20px; box-sizing: border-box; }
.mc-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #00f3ff; padding-bottom: 10px; margin-bottom: 16px; }
.mc-header h1 { font-family: system-ui, 'Segoe UI', sans-serif; font-weight: 900; letter-spacing: 3px; color: #00f3ff; font-size: 1.8rem; margin: 0; }
.mc-status { font-size: 0.9rem; color: #ffaa00; text-align: right; }
.mc-status span { color: #00ff66; animation: mcPulse 1.5s infinite; }
.mc-nav { display: flex; justify-content: center; gap: 10px; margin-bottom: 16px; overflow-x: auto; padding-bottom: 5px; }
.mc-navbtn { background: rgba(0,243,255,0.05); border: 1px solid #00f3ff; color: #00f3ff; padding: 10px 16px; font-family: system-ui, 'Segoe UI', sans-serif; font-weight: 700; cursor: pointer; transition: all 0.3s ease; clip-path: polygon(0 0, 90% 0, 100% 100%, 10% 100%); min-height: 44px; white-space: nowrap; }
.mc-navbtn:hover, .mc-navbtn.active { background: #00f3ff; color: #020813; box-shadow: 0 0 15px #00f3ff; }
.mc-viewport { flex: 1; overflow: hidden; position: relative; border: 1px solid rgba(0,243,255,0.2); border-radius: 4px; min-height: 0; }
.mc-carousel { display: flex; height: 100%; width: 500%; transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1); }
.mc-page { width: 20%; height: 100%; overflow-y: auto; padding: 30px; padding-bottom: max(5rem, env(safe-area-inset-bottom)); box-sizing: border-box; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); background: rgba(2,16,32,0.45); scrollbar-width: thin; scrollbar-color: #00f3ff transparent; }
.mc-page::-webkit-scrollbar { width: 6px; }
.mc-page::-webkit-scrollbar-thumb { background: #00f3ff; border-radius: 3px; }
.mc-page h2 { font-family: system-ui, 'Segoe UI', sans-serif; color: #00f3ff; margin: 0 0 20px; text-transform: uppercase; letter-spacing: 2px; border-left: 4px solid #ff0055; padding-left: 10px; }
.mc-page h3 { font-family: system-ui, 'Segoe UI', sans-serif; color: #00f3ff; margin: 24px 0 12px; }
.mc-page p { font-size: 1.05rem; line-height: 1.6; margin: 0 0 20px; text-align: justify; }
.mc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; margin-bottom: 25px; }
.mc-card { border: 1px solid rgba(0,243,255,0.15); background: rgba(2,12,24,0.4); padding: 20px; position: relative; border-radius: 2px; }
.mc-card::before { content: ''; position: absolute; top: 0; left: 0; width: 10px; height: 10px; border-top: 2px solid #00f3ff; border-left: 2px solid #00f3ff; }
.mc-card .t { font-size: 0.85rem; color: rgba(0,243,255,0.7); text-transform: uppercase; margin-bottom: 5px; }
.mc-card .v { font-size: 2rem; font-weight: bold; font-family: system-ui, 'Segoe UI', sans-serif; color: #ff0055; text-shadow: 0 0 10px rgba(255,0,85,0.3); }
.mc-card .s { font-size: 0.85rem; color: #ffaa00; margin-top: 5px; }
.mc-tablewrap { width: 100%; overflow-x: auto; margin: 20px 0; border: 1px solid rgba(0,243,255,0.2); background: rgba(1,10,20,0.6); scrollbar-width: thin; }
.mc-table { width: 100%; border-collapse: collapse; min-width: 600px; text-align: left; }
.mc-th, .mc-td { padding: 12px 15px; border-bottom: 1px solid rgba(0,243,255,0.1); }
.mc-th { background: rgba(0,243,255,0.1); color: #00f3ff; text-transform: uppercase; font-family: system-ui, 'Segoe UI', sans-serif; font-size: 0.9rem; }
.mc-tr:hover { background: rgba(255,0,85,0.05); }
.mc-nodes { display: grid; grid-template-columns: repeat(20, 1fr); gap: 4px; margin: 15px 0; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 4px; }
.mc-dot { aspect-ratio: 1; background-color: #00ff66; border-radius: 2px; box-shadow: 0 0 4px #00ff66; animation: mcFlicker 3s infinite ease-in-out; border: 0; padding: 0; cursor: pointer; }
.mc-dot.warn { background-color: #ffaa00; box-shadow: 0 0 4px #ffaa00; animation: none; }
.mc-dot.fault { background-color: #ff2255; box-shadow: 0 0 8px #ff2255; animation: none; }
.mc-legend { font-size: 0.9rem; color: #00f3ff; margin-bottom: 20px; }
.mc-rowbtns { display: flex; gap: 10px; flex-wrap: wrap; margin: 10px 0 20px; }
.mc-ghostbtn { background: transparent; border: 1px solid #00f3ff; color: #00f3ff; font-family: inherit; font-size: 0.85rem; padding: 10px 16px; cursor: pointer; border-radius: 3px; min-height: 44px; }
.mc-ghostbtn:hover { background: rgba(0,243,255,0.12); }
@keyframes mcPulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; text-shadow: 0 0 8px #00ff66; } }
@keyframes mcFlicker { 0%,100% { opacity: 1; } 45% { opacity: 0.8; } 50% { opacity: 0.3; } 55% { opacity: 1; } }
@media (max-width: 768px) { .mc-shell { padding: 10px; } .mc-header h1 { font-size: 1.3rem; } .mc-page { padding: 15px; padding-bottom: max(5rem, env(safe-area-inset-bottom)); } .mc-card .v { font-size: 1.5rem; } }
`;

const HOME_CARDS = [
  { t: 'Total Compute Mass', v: '3.0 EXAFLOPS', s: 'Peak performance under extreme parallel computation' },
  { t: 'Internal Core Power Draw', v: '25.0 MW', s: 'Baseline operational capacity for 1,000,000 cells' },
  { t: 'Total Facility Capacity', v: '27.5 MW', s: 'Factoring an ultra-efficient PUE threshold of 1.1' },
  { t: 'On-Site Energy Generation', v: '> 30.0 MW', s: 'Sustained output via kinetic VAWT & thin-film solar array' },
];

const HOME_TABLE = [
  ['01 // Energy Intake', 'Wind Kinetic, Solar Radiation', 'Dual-Tier VAWT Arrays & Polycarbonate Solar Skin', 'DC Voltage Stream to Main Bus', 'Excess redirected to LFP Transient Buffers'],
  ['02 // Compute Array', 'Raw System Tasks, Inbound Packets', 'Three-Tier Cluster Node Pipeline', '1 Exabyte Decentralized Cryptographic Storage', 'Thermal Output (Waste Heat) at 65°C'],
  ['03 // Hydro Loop', 'Untreated/Industrial Inflow', 'Thermal Evaporation + Graphene Filtration', 'Purified Coolant and Potable Reserves', 'Pre-heated coolant loop returned to data core'],
  ['04 // Thermal Harvest', 'High-Temp Coolant Return', 'Direct-to-Chip Closed Heat Exchangers', 'Facility Interior Climate Comfort (-50°C Shield)', 'Cooled fluid recycled to compute elements'],
];

const CELL_TABLE = [
  ['Processor Shell', 'Screenless, High-Density Form', 'Anodized T6-6061 Aluminum Alloy', 'Direct mating to micro-channel cooling plates'],
  ['On-Board Energy Storage', 'Integrated Backup Layer', 'Lithium Iron Phosphate (LFP) Cells', 'High-cycle stability, zero risk of thermal runaway'],
  ['Network Interface', 'Dual Native Bus', 'Blind-Mate Combined Power/Data Rails', 'Eliminates consumer wiring tangles completely'],
];

const GRID_TABLE = [
  ['Deep Winterization', 'Temperatures drop below -30°C', 'Aramid tension lines tighten automatically', 'Retract blinders to maximize solar absorption'],
  ['Kinetic Dampening', 'Extreme high winds / Tornado threat', 'Superstructure shifts geometries flexibly', 'Circulating fluid acts as a natural stabilizer'],
  ['Faraday Grounding', 'Severe electrical / Lightning strikes', 'Conductive titanium skin engages', 'Shunts current safely away from data core'],
];

const HYDRO_TABLE = [
  ['01 // Intake', 'Automated Monitoring Nodes', 'Checks raw input water parameters', 'Baseline turbidity and mineral density logging'],
  ['02 // Thermal Exchange', 'Micro-Channel Cold Plates', 'Server waste heat boosts water temperature', 'Maintains core processor temperatures below 70°C'],
  ['03 // Purification', 'Nanofiltration Array', 'Heated water undergoes rapid filtration', 'Removes particulates down to molecular sizes'],
  ['04 // Discharge', 'End-Point Sensor Units', 'Validates status of clean reserves', 'Ensures safe municipal-grade standards'],
];

const SYNAPSE_TABLE = [
  ['Intake Pipeline', 'Custom High-Throughput Buffers', 'Balances inbound workloads efficiently', 'Instantly re-routes traffic if lines saturate'],
  ['Compute Engine', 'Hardened Distributed Kernels', 'Processes isolated code segments in parallel', 'Failing nodes drop out; adjacent units pick up tasks'],
  ['Storage Matrix', 'Decentralized File Network', '3x internal data replication factor', 'Rebuilds lost data segments onto active blades'],
];

function MetricCard({ t, v, s }) {
  return (
    <div className="mc-card">
      <div className="t">{t}</div>
      <div className="v">{v}</div>
      <div className="s">{s}</div>
    </div>
  );
}

function DataTable({ heads, rows }) {
  return (
    <div className="mc-tablewrap">
      <table className="mc-table">
        <thead>
          <tr>{heads.map((h) => <th className="mc-th" key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr className="mc-tr" key={i}>{r.map((c, j) => <td className="mc-td" key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MissionControlPage() {
  const waveRef = useRef(null);
  const viewportRef = useRef(null);
  const [deck, setDeck] = useState(0);
  const [nodes, setNodes] = useState(() => Array.from({ length: NODE_COUNT }, () => 'ok'));
  const startX = useRef(0);

  useEffect(() => {
    document.title = TITLE;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const n = JSON.parse(raw).deck;
        if (typeof n === 'number' && n >= 0 && n < DECKS.length) setDeck(n);
      }
    } catch { /* start on deck 0 if storage is unavailable */ }

    // Ambient wave canvas.
    const canvas = waveRef.current;
    const ctx = canvas ? canvas.getContext('2d') : null;
    let raf = 0;
    let offset = 0;
    const resize = () => {
      if (canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    };
    resize();
    window.addEventListener('resize', resize);
    const drawWave = (color, freq, amp, off) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height);
      for (let x = 0; x <= canvas.width; x += 10) {
        ctx.lineTo(x, canvas.height - 150 + Math.sin(x * freq + off) * amp);
      }
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();
      ctx.fill();
    };
    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawWave('rgba(0, 243, 255, 0.08)', 0.004, 30, offset);
      drawWave('rgba(255, 0, 85, 0.04)', 0.006, 20, offset + Math.PI);
      offset += 0.015;
      raf = requestAnimationFrame(loop);
    };
    if (ctx) loop();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const switchPage = (i) => {
    const n = Math.max(0, Math.min(DECKS.length - 1, i));
    setDeck(n);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ deck: n })); } catch { /* noop */ }
  };

  const injectFault = () => {
    setNodes((prev) => {
      const next = [...prev];
      let placed = 0;
      while (placed < 5) {
        const idx = (Math.random() * next.length) | 0;
        if (next[idx] === 'ok') { next[idx] = placed < 3 ? 'warn' : 'fault'; placed++; }
      }
      return next;
    });
  };

  const clearFaults = () => setNodes(Array.from({ length: NODE_COUNT }, () => 'ok'));
  const cycleNode = (idx) => {
    setNodes((prev) => {
      const next = [...prev];
      next[idx] = next[idx] === 'ok' ? 'warn' : next[idx] === 'warn' ? 'fault' : 'ok';
      return next;
    });
  };
  const warnCount = nodes.filter((n) => n === 'warn').length;
  const faultCount = nodes.filter((n) => n === 'fault').length;

  // Swipe support on mobile (horizontal tables keep their own scrolling).
  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    const dx = startX.current - e.changedTouches[0].clientX;
    if (Math.abs(dx) > 60 && !e.target.closest('.mc-tablewrap')) {
      if (dx > 0 && deck < DECKS.length - 1) switchPage(deck + 1);
      else if (dx < 0 && deck > 0) switchPage(deck - 1);
    }
  };

  return (
    <div className="mc-wrap">
      <style>{CSS}</style>
      <canvas ref={waveRef} className="mc-wave" aria-hidden="true" />
      <div className="mc-holo" aria-hidden="true" />

      <div className="mc-shell">
        <header className="mc-header">
          <div>
            <h1>PROJECT OLYMPUS</h1>
            <div style={{ fontSize: '0.8rem', color: '#00f3ff' }}>HOLOGRAPHIC DIAGNOSTIC DECK v4.26</div>
          </div>
          <div className="mc-status">
            AUTONOMY STATE: <span>ACTIVE // NET-ZERO</span><br />
            LOCATION: STURGEON COUNTY, AB
          </div>
        </header>

        <nav className="mc-nav" aria-label="Decks">
          {DECKS.map((label, i) => (
            <button key={label} type="button" className={'mc-navbtn' + (deck === i ? ' active' : '')} onClick={() => switchPage(i)}>
              {label}
            </button>
          ))}
        </nav>

        <div
          className="mc-viewport"
          ref={viewportRef}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="mc-carousel" style={{ transform: `translateX(-${deck * 20}%)` }}>

            <section className="mc-page">
              <h2>System Diagnostics &amp; I/O Blueprint</h2>
              <p>Welcome to Project Olympus. This blueprint details an autonomous, high-density computing platform that operates completely independent of external grid reliance. By integrating 1,000,000 screenless custom compute cells directly into a physical structural matrix, we eliminate the division between energy transport, structural weight, and processing load.</p>
              <div className="mc-grid">{HOME_CARDS.map((c) => <MetricCard key={c.t} {...c} />)}</div>
              <h3>Input/Output Operational Pipeline</h3>
              <DataTable heads={['Phase', 'Input Resources', 'Processing Mechanism', 'Output/Product', 'Regulated Feedback']} rows={HOME_TABLE} />
            </section>

            <section className="mc-page">
              <h2>02 // Custom Compute Cells</h2>
              <p>Instead of relying on fragile, consumer-grade smartphones with volatile screens and bloated operating systems, Project Olympus uses specialized, screenless <strong>Intelligent Compute Cells</strong>. Every unit is cast within a sealed, thermally conductive aluminum housing that acts as a direct chassis mount and heat sink.</p>
              <div className="mc-grid">
                <MetricCard t="Memory Profile" v="16 GB LPDDR5X" s="Dedicated ultra-low latency RAM per individual blade" />
                <MetricCard t="Flash Array" v="1 TB NVMe SSD" s="High-speed physical storage layer per node" />
              </div>
              <h3>Micro-LED Interactive Node Simulation</h3>
              <p>The exterior of each cell is fitted with an IP68-rated, silicone-encapsulated LED indicator node. Tap any node to cycle its state, or run a fault drill to see how the deck reports.</p>
              <div className="mc-rowbtns">
                <button type="button" className="mc-ghostbtn" onClick={injectFault}>Run fault drill</button>
                <button type="button" className="mc-ghostbtn" onClick={clearFaults}>Reset all nodes</button>
              </div>
              <div className="mc-legend">
                🟢 GREEN = Operating Optimal ({NODE_COUNT - warnCount - faultCount}) &nbsp;|&nbsp; 🟡 AMBER = Transient Cache Throttle ({warnCount}) &nbsp;|&nbsp; 🔴 RED = Fault Identified ({faultCount})
              </div>
              <div className="mc-nodes" role="group" aria-label="Compute cell node indicators">
                {nodes.map((state, i) => (
                  <button key={i} type="button" className={'mc-dot' + (state === 'ok' ? '' : ' ' + state)} aria-label={`Node ${i + 1}: ${state}`} onClick={() => cycleNode(i)} />
                ))}
              </div>
              <h3>Hardware Component Matrix</h3>
              <DataTable heads={['Component', 'Specification', 'Industrial Material Class', 'Operational Benefit']} rows={CELL_TABLE} />
            </section>

            <section className="mc-page">
              <h2>03 // Structural Tensegrity Dome</h2>
              <p>Project Olympus abandons rigid, fracture-prone architecture. The entire facility is suspended off the ground using a pre-stressed tensegrity system that functions like a mechanical spiderweb. When external forces alter the envelope, the structural nodes oscillate and distribute kinetic energy evenly across the entire frame.</p>
              <div className="mc-grid">
                <MetricCard t="Structural Core" v="TI-GRADE 5" s="Titanium compression struts for lightweight durability" />
                <MetricCard t="Tension Networks" v="ARAMID / KEVLAR" s="Near-zero thermal expansion coefficient down to -50°C" />
              </div>
              <h3>Environmental Adaptation Profile</h3>
              <p>To survive intense Alberta blizzards, wind gusts, and storms, the dome features an automated, active system designed to preserve system performance.</p>
              <DataTable heads={['Weather Matrix Mode', 'Environmental Trigger', 'Structural Configuration', 'Thermal Management Response']} rows={GRID_TABLE} />
            </section>

            <section className="mc-page">
              <h2>04 // Closed-Loop Cooling &amp; Purification</h2>
              <p>Water treatment and high-performance computing are joined into a single process. Server waste heat is recycled to power the purification of incoming water, creating a clean cycle that keeps the system performing efficiently.</p>
              <div className="mc-grid">
                <MetricCard t="Coolant Medium" v="PROPYLENE GLYCOL" s="Non-toxic fluid mix to prevent sub-zero line freezing" />
                <MetricCard t="Primary Filter Class" v="GRAPHENE-OXIDE" s="Molecular-level filtration for ultimate purity" />
              </div>
              <h3>Hydrological Flow Architecture</h3>
              <DataTable heads={['Stage', 'Sub-System Element', 'Mechanical Process', 'Quality Control Metric']} rows={HYDRO_TABLE} />
            </section>

            <section className="mc-page">
              <h2>05 // Synapse Cluster Architecture</h2>
              <p>The entire facility runs on a custom, stripped-down operating system. To eliminate data congestion and network bottlenecks, the one-million-node cluster is split into three equal, dedicated tiers that run concurrently.</p>
              <div className="mc-grid">
                <MetricCard t="Queue Intake (1/3 Base)" v="333,333 NODES" s="Handles data organization and task distribution" />
                <MetricCard t="Core Processing (1/3 Base)" v="333,334 NODES" s="Dedicated completely to heavy parallel computation" />
                <MetricCard t="Output & Storage (1/3 Base)" v="333,333 NODES" s="Manages data caching and distributed storage" />
              </div>
              <h3>Cluster Network Management</h3>
              <p>Instead of a traditional hierarchy, the cluster uses a distributed gossip protocol. Nodes constantly monitor adjacent hardware states, adjusting resources instantly if a unit goes offline.</p>
              <DataTable heads={['Tier Classification', 'Primary Software Stack', 'Network Routing Behavior', 'Fault Tolerance Action']} rows={SYNAPSE_TABLE} />
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
