'use client';

import { useEffect, useRef, useState } from 'react';

const CSS = `
.ha-root { min-height: 100vh; background: #010604; color: #e0f2fe; overflow-x: hidden;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.ha-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: radial-gradient(circle at 50% 0%, #032415 0%, #010a08 50%, #010604 100%); }
.ha-scan { position: fixed; inset: 0; z-index: 999; pointer-events: none; opacity: 0.6;
  background: linear-gradient(to bottom, transparent 50%, rgba(0,255,159,0.015) 50%);
  background-size: 100% 4px; }
.ha-mono { font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace; }
.ha-nav { position: relative; z-index: 10; text-align: center; padding: 40px 16px 18px; }
.ha-nav h1 { margin: 0; font-size: clamp(2rem, 7vw, 4.2rem); font-weight: 700; letter-spacing: 0.18em;
  color: #00ff9f; text-shadow: 0 0 15px rgba(0,255,159,0.45); text-transform: uppercase; }
.ha-nav p { color: #ffaa00; letter-spacing: 0.3em; text-transform: uppercase; font-weight: 600;
  font-size: clamp(0.65rem, 2.5vw, 1rem); margin: 8px 0 0; }
.ha-main { position: relative; z-index: 10; max-width: 1100px; margin: 0 auto; padding: 8px 16px 60px;
  display: flex; flex-direction: column; align-items: center; }
.ha-hero { position: relative; width: 100%; aspect-ratio: 21 / 9; min-height: 240px; border-radius: 12px;
  overflow: hidden; background: rgba(10,25,15,0.35); border: 1px solid rgba(0,255,159,0.4);
  box-shadow: 0 0 30px rgba(0,255,159,0.18), inset 0 0 30px rgba(0,255,159,0.08); margin-bottom: 40px; }
.ha-hero canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.ha-live { position: absolute; top: 12px; left: 12px; z-index: 2; display: flex; align-items: center; gap: 8px;
  background: rgba(0,0,0,0.6); padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(0,255,159,0.3);
  font-size: 0.75rem; letter-spacing: 0.15em; text-transform: uppercase; color: #a7f3d0; }
.ha-dot { width: 8px; height: 8px; border-radius: 50%; background: #ffaa00; animation: ha-blink 2s infinite; }
@keyframes ha-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
.ha-fade { position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background: linear-gradient(to top, #010604 0%, transparent 40%); }
.ha-intro { max-width: 800px; text-align: center; font-size: clamp(1.05rem, 3vw, 1.4rem);
  line-height: 1.7; color: #d1fae5; font-weight: 300; margin: 0 0 48px; }
.ha-intro strong { color: #ffaa00; }
.ha-card { width: 100%; background: linear-gradient(180deg, rgba(10,25,15,0.75), rgba(5,15,10,0.85));
  border: 1px solid rgba(0,255,159,0.2); border-top: 3px solid #ffaa00; border-radius: 12px;
  padding: 28px; margin-bottom: 28px; transition: border-color 0.3s, box-shadow 0.3s, transform 0.3s; }
.ha-card:hover { border-color: rgba(0,255,159,0.55); box-shadow: 0 10px 30px rgba(0,255,159,0.12);
  transform: translateY(-3px); }
.ha-card h3 { margin: 0 0 20px; font-size: 1.5rem; color: #ffaa00; letter-spacing: 0.06em;
  border-bottom: 1px solid rgba(0,255,159,0.25); padding-bottom: 10px; text-transform: uppercase; }
.ha-table { width: 100%; border-collapse: collapse; min-width: 560px; }
.ha-scroll { overflow-x: auto; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.4); }
.ha-table th { background: rgba(0,0,0,0.5); color: #00ff9f; text-transform: uppercase; letter-spacing: 0.12em;
  font-size: 0.8rem; padding: 12px 16px; text-align: left; border-bottom: 1px solid rgba(0,255,159,0.3); }
.ha-table td { padding: 12px 16px; font-size: 0.92rem; border-bottom: 1px solid rgba(255,255,255,0.08); }
.ha-table tr:last-child td { border-bottom: none; }
.ha-table tbody tr:hover { background: rgba(255,255,255,0.04); }
.ha-spec { color: #ffaa00; font-weight: 600; }
.ha-val { color: #d4d4d8; }
.ha-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 16px; }
.ha-list li { font-size: 0.95rem; color: #d4d4d8; line-height: 1.55; }
.ha-list strong { display: block; color: #00ff9f; font-size: 1.02rem; margin-bottom: 2px; }
.ha-list .ha-sup { color: #ffaa00; }
.ha-step { border: 1px solid rgba(0,255,159,0.18); border-radius: 8px; background: rgba(0,0,0,0.4);
  margin-bottom: 10px; overflow: hidden; }
.ha-step > button { width: 100%; background: none; border: none; color: #fff; text-align: left;
  padding: 16px 18px; font-size: 1rem; cursor: pointer; display: flex; gap: 12px; align-items: center;
  font-family: inherit; min-height: 48px; }
.ha-step > button:hover { background: rgba(0,255,159,0.06); }
.ha-letter { color: #ffaa00; font-weight: 800; }
.ha-step p { margin: 0; padding: 0 18px 18px 48px; color: #a1a1aa; font-size: 0.93rem; line-height: 1.6; }
.ha-check { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.35); cursor: pointer; }
.ha-check:hover { border-color: rgba(0,255,159,0.4); }
.ha-check input { width: 22px; height: 22px; margin-top: 2px; accent-color: #00ff9f; flex-shrink: 0; }
.ha-check.done span { text-decoration: line-through; color: #6b7280; }
.ha-check span { font-size: 0.92rem; color: #d4d4d8; line-height: 1.5; }
.ha-progress { height: 10px; border-radius: 6px; background: rgba(255,255,255,0.08); overflow: hidden; margin: 0 0 18px; }
.ha-progress i { display: block; height: 100%; background: linear-gradient(90deg, #00ff9f, #ffaa00);
  transition: width 0.4s ease; }
.ha-foot { text-align: center; padding: 30px; color: #52525b; font-size: 0.8rem; letter-spacing: 0.25em;
  text-transform: uppercase; position: relative; z-index: 10; }
@media (max-width: 640px) { .ha-card { padding: 20px 16px; } }
`;

// Build a pseudo-tensegrity net: nodes on two staggered rings + top/bottom anchors,
// struts (thick green) + cables (thin amber). All computed once, animated by rotation.
function buildNet() {
  const nodes = [];
  const rings = 3;
  for (let r = 0; r < rings; r++) {
    const n = 8;
    const y = (r - 1) * 1.1;
    const rad = 1.6 - Math.abs(r - 1) * 0.25;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r * 0.4;
      nodes.push({ x: Math.cos(a) * rad, y, z: Math.sin(a) * rad });
    }
  }
  nodes.push({ x: 0, y: 2.0, z: 0 }); // apex
  nodes.push({ x: 0, y: -2.0, z: 0 }); // base
  const struts = [];
  const cables = [];
  const ringNodes = (r) => Array.from({ length: 8 }, (_, i) => r * 8 + i);
  for (let r = 0; r < rings; r++) {
    const rn = ringNodes(r);
    rn.forEach((ni, i) => {
      struts.push([ni, rn[(i + 3) % 8]]); // compression struts skip across the ring
      cables.push([ni, rn[(i + 1) % 8]]); // ring cables
    });
    if (r < rings - 1) {
      const next = ringNodes(r + 1);
      rn.forEach((ni, i) => {
        cables.push([ni, next[i]]);
        cables.push([ni, next[(i + 1) % 8]]);
      });
    }
  }
  const apex = nodes.length - 2, base = nodes.length - 1;
  ringNodes(0).forEach((ni) => cables.push([ni, apex]));
  ringNodes(2).forEach((ni) => cables.push([ni, base]));
  return { nodes, struts, cables };
}

const SPECS = [
  ['Total Height', '14.0m (Grade to wind turbine apex)'],
  ['Habitable Floor Area', '~1,200 sq. ft. (split over two primary levels)'],
  ['Floor Elevations', 'Level 1: 3.5m above grade · Level 2: 6.5m above grade'],
  ['Primary Strut Lengths', '4.0m to 8.5m variable high-strength steel tubes'],
  ['Environmental Loads', 'Engineered for heavy snow (up to 2.5 kPa) and high wind shear; the cable net dampens aeroelastic movement.'],
];

const MATERIALS = [
  ['Compression Struts', 'HSS 350W hollow structural steel with marine-grade epoxy coating to prevent corrosion.'],
  ['Tension Cables', 'AISI 316 stainless steel structural cable (19×7 wire rope core) with adjustable turnbuckles.'],
  ['Enclosure', 'Cross-laminated timber modular panels (5-ply, 175mm) for strength-to-weight and thermal mass.'],
  ['Glazing', 'Triple-glazed, argon-filled curtain wall units with thermally broken frames and low-E coatings.'],
  ['Microgrid', '6.5kW rooftop solar PV plus three 2kW vertical-axis wind turbines feeding a 200kWh LiFePO4 battery.'],
];

const SUPPLIERS = [
  ['Structural Steel Fabrication', 'Specialists in custom HSS fabrication and heavy structural engineering.'],
  ['Cables & Rigging', 'Distributors of architectural tensile cable systems and rigging hardware.'],
  ['Mass Timber (CLT)', 'Producers of cross-laminated timber panels for modular construction.'],
  ['Energy Systems', 'Solar and wind integrators paired with commercial battery storage vendors.'],
  ['Glazing Systems', 'Custom architectural glass and curtain wall fabricators.'],
];

const STEPS = [
  ['A', 'Site Preparation & Foundation', 'Core drilling into bedrock for seismic rock anchors and reinforced concrete micropiles. Establishes the fixed tension nodes that resist freeze-thaw cycles and frost heave.'],
  ['B', 'Anchor Node Assembly', 'Crane placement of the lower compression struts onto ball-jointed anchor nodes. Temporary shoring is required — primary struts cannot stand independently in a true tensegrity design.'],
  ['C', 'Rigging the Primary Net', 'Installation of diagonal stainless cables. Tensioned incrementally with hydraulic jacks to pull the lower struts into their self-balancing, pre-stressed configuration before temporary shoring is removed.'],
  ['D', 'Modular Core Levitation', 'Pre-fabricated CLT floor plates are craned into the center of the network. Secondary cables route from node joints to floor plate corners, suspending the living platform within the structural matrix.'],
  ['E', 'Roof Canopy Integration', 'The upper compression ring and roof struts are secured. The roof canopy is tensioned downward into the main structural net to counter wind uplift forces.'],
  ['F', 'Enclosure & Commissioning', 'Installation of triple-glazed walls and CLT partitions. The containerized battery is sited at grade; rooftop solar and wind route insulated DC power lines down the hollow steel strut cores.'],
];

const CHECKLIST = [
  'Geotechnical survey complete — bedrock anchors verified',
  'All HSS struts delivered and epoxy coating inspected',
  'Cable tensioning sequence signed off by structural engineer',
  'CLT floor plates craned and suspended within the net',
  'Glazing and enclosure weather-tight',
  'Microgrid energized — solar, wind, and battery commissioned',
  'Final torque check on all turnbuckles and fork terminals',
];

export default function HousingArchitecturePage() {
  const canvasRef = useRef(null);
  const [openStep, setOpenStep] = useState(null);
  const [checked, setChecked] = useState([]);
  const netRef = useRef(null);

  // Animated tensegrity net — fully procedural, no external assets
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!netRef.current) netRef.current = buildNet();
    const { nodes, struts, cables } = netRef.current;
    let raf = 0;
    let w = 0, h = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w; canvas.height = h;
    };
    resize();
    window.addEventListener('resize', resize);
    let t = 0;
    const project = (p) => {
      const ca = Math.cos(t), sa = Math.sin(t);
      const x = p.x * ca - p.z * sa;
      const z = p.x * sa + p.z * ca;
      const s = 130 / (4.2 - z);
      return [w / 2 + x * s, h / 2 + p.y * s * 0.9];
    };
    const draw = () => {
      t += 0.006;
      ctx.clearRect(0, 0, w, h);
      // cables first (thin amber)
      ctx.strokeStyle = 'rgba(255,170,0,0.35)';
      ctx.lineWidth = 1;
      for (const [a, b] of cables) {
        const [x1, y1] = project(nodes[a]);
        const [x2, y2] = project(nodes[b]);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      // struts (thicker green)
      ctx.strokeStyle = 'rgba(0,255,159,0.75)';
      ctx.lineWidth = 3;
      for (const [a, b] of struts) {
        const [x1, y1] = project(nodes[a]);
        const [x2, y2] = project(nodes[b]);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      // nodes
      for (const p of nodes) {
        const [x, y] = project(p);
        ctx.fillStyle = 'rgba(0,255,159,0.9)';
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  // Load checklist progress from this device
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('housing-checklist');
      if (raw) setChecked(JSON.parse(raw));
    } catch { /* fresh */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem('housing-checklist', JSON.stringify(checked)); } catch { /* ignore */ }
  }, [checked]);

  const toggleCheck = (i) =>
    setChecked((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));
  const pct = Math.round((checked.length / CHECKLIST.length) * 100);

  return (
    <main className="ha-root">
      <style>{CSS}</style>
      <div className="ha-bg" aria-hidden="true" />
      <div className="ha-scan" aria-hidden="true" />

      <nav className="ha-nav">
        <h1 className="ha-mono">Tensegrity Habitat</h1>
        <p>Structural &amp; Architectural Blueprint</p>
      </nav>

      <div className="ha-main">
        <div className="ha-hero">
          <canvas ref={canvasRef} aria-label="Animated tensegrity structural model" />
          <div className="ha-live"><span className="ha-dot" /> Node Simulation // Active</div>
          <div className="ha-fade" />
        </div>

        <p className="ha-intro">
          The <strong>Tensegrity Living Node</strong> merges high-tensile structural
          engineering with cross-laminated timber modularity. Suspended within an
          aeroelastic cable net, the habitable core &ldquo;floats&rdquo; to dampen extreme
          environmental loads while operating entirely off-grid.
        </p>

        <div className="ha-card">
          <h3 className="ha-mono">1. Structural Dimensions &amp; Tolerances</h3>
          <div className="ha-scroll">
            <table className="ha-table">
              <thead>
                <tr><th>Specification</th><th>Parameter</th></tr>
              </thead>
              <tbody>
                {SPECS.map(([s, v]) => (
                  <tr key={s}>
                    <td className="ha-spec">{s}</td>
                    <td className="ha-val">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ha-card">
          <h3 className="ha-mono">2. Material Specifications</h3>
          <ul className="ha-list">
            {MATERIALS.map(([name, desc]) => (
              <li key={name}><strong>{name}</strong>{desc}</li>
            ))}
          </ul>
        </div>

        <div className="ha-card">
          <h3 className="ha-mono">3. Supplier Categories</h3>
          <ul className="ha-list">
            {SUPPLIERS.map(([name, desc]) => (
              <li key={name}><strong className="ha-sup">{name}</strong>{desc}</li>
            ))}
          </ul>
        </div>

        <div className="ha-card">
          <h3 className="ha-mono">4. Sequential Installation Methodology</h3>
          {STEPS.map(([letter, title, body], i) => (
            <div className="ha-step" key={letter}>
              <button onClick={() => setOpenStep(openStep === i ? null : i)} aria-expanded={openStep === i}>
                <span className="ha-letter">{letter}.</span> {title}
                <span style={{ marginLeft: 'auto', color: '#00ff9f' }}>{openStep === i ? '−' : '+'}</span>
              </button>
              {openStep === i && <p>{body}</p>}
            </div>
          ))}
        </div>

        <div className="ha-card">
          <h3 className="ha-mono">5. Build Checklist</h3>
          <div className="ha-progress" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
            <i style={{ width: pct + '%' }} />
          </div>
          <p style={{ color: '#a7f3d0', fontSize: '0.9rem', margin: '0 0 14px' }}>
            {checked.length} of {CHECKLIST.length} phases complete ({pct}%). Progress is saved on this device.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CHECKLIST.map((item, i) => (
              <label className={'ha-check' + (checked.includes(i) ? ' done' : '')} key={i}>
                <input
                  type="checkbox"
                  checked={checked.includes(i)}
                  onChange={() => toggleCheck(i)}
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <footer className="ha-foot">Architectural Blueprint // Concept Study</footer>
    </main>
  );
}
