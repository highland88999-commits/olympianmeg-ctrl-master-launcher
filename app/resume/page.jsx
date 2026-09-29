'use client';

import { useEffect, useRef, useState } from 'react';

// Generic placeholder content only — no real names, contacts, or employers.
const TEMPLATE = {
  name: 'Alex Morgan',
  title: 'Operations & Logistics Professional',
  contact: 'City, Province · your.email@example.com · (555) 010-2030',
  summary:
    'Reliable, adaptable professional with broad experience across operations, logistics, and technical work. Known for a strong work ethic, fast skill pickup, and consistent punctuality. Comfortable managing independent projects and solving problems on the fly.',
  jobs: [
    {
      role: 'Logistics Driver',
      company: 'Northline Delivery Co.',
      meta: '2024 – Present · Your City, ST',
      bullets: [
        'Run efficient, high-volume delivery routes across the metro area.',
        'Manage independent scheduling, deadlines, and client communication.',
        'Maintain high reliability ratings for punctuality and accuracy.',
      ],
    },
    {
      role: 'General Contractor — Exteriors',
      company: 'Summit Exteriors Ltd.',
      meta: '2022 – 2024 · Your City, ST',
      bullets: [
        'Installed and repaired residential exterior systems to spec.',
        'Held strict safety standards working at heights and on ladders.',
        'Coordinated with crew leads to hit tight project deadlines.',
      ],
    },
  ],
  education: [
    { school: 'Riverside Technical College', detail: 'Diploma — Business Operations' },
    { school: 'Industry Certifications', detail: 'First Aid · Forklift Operator · WHMIS' },
  ],
  skills: 'Project coordination, route planning, preventive maintenance, safety compliance, fast learning, dependable attendance.',
};

const ACCENTS = [
  { id: 'cyan', label: 'Cyan', hex: '#00e5ff' },
  { id: 'emerald', label: 'Emerald', hex: '#00ff9f' },
  { id: 'amber', label: 'Amber', hex: '#ffb300' },
  { id: 'magenta', label: 'Magenta', hex: '#ff4fd8' },
];

const CSS = `
.rz-root { min-height: 100vh; background: #05050a; color: #f0f0f0;
  font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; position: relative; }
.rz-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
.rz-wrap { position: relative; z-index: 1; max-width: 960px; margin: 0 auto; padding: 24px 16px 60px; }
.rz-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between;
  margin-bottom: 18px; }
.rz-bar h1 { font-size: 1.3rem; margin: 0; letter-spacing: 1px; text-transform: uppercase; }
.rz-controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.rz-btn { border: 1px solid rgba(255,255,255,0.2); background: rgba(15,15,20,0.6); color: #fff;
  padding: 10px 16px; border-radius: 30px; font-size: 0.85rem; font-weight: 700; cursor: pointer;
  letter-spacing: 0.5px; min-height: 44px; }
.rz-btn:hover { border-color: var(--rz-accent); box-shadow: 0 0 14px rgba(0,229,255,0.25); }
.rz-btn.primary { background: var(--rz-accent); color: #05050a; border-color: var(--rz-accent); text-shadow: none; }
.rz-swatch { width: 40px; height: 40px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
.rz-swatch.on { border-color: #fff; box-shadow: 0 0 10px currentColor; }
.rz-card { background: rgba(15,15,20,0.35); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px;
  padding: 40px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); backdrop-filter: blur(6px);
  text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
.rz-card h2 { font-size: 1.25rem; color: var(--rz-accent); border-bottom: 1px solid rgba(255,255,255,0.14);
  padding-bottom: 6px; margin: 30px 0 14px; text-transform: uppercase; letter-spacing: 1px; }
.rz-name { font-size: 2.4rem; margin: 0; text-align: center; letter-spacing: 2px; text-transform: uppercase;
  background: linear-gradient(90deg, #fff, var(--rz-accent)); -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8)); }
.rz-contact { text-align: center; color: #ccc; margin: 10px 0 0; }
.rz-job { margin-bottom: 22px; }
.rz-jobhead { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; margin-bottom: 6px; }
.rz-role { font-weight: 700; font-size: 1.08rem; }
.rz-co { font-style: italic; color: #d0d0d0; }
.rz-meta { color: var(--rz-accent); font-weight: 700; font-size: 0.95rem; }
.rz-card ul { margin: 0; padding-left: 20px; }
.rz-card li { margin-bottom: 6px; }
.rz-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
.rz-ed { margin-bottom: 12px; }
.rz-editor { margin-top: 26px; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.12);
  border-radius: 12px; padding: 22px; text-shadow: none; }
.rz-editor h3 { margin: 0 0 14px; font-size: 1rem; text-transform: uppercase; letter-spacing: 1px; color: var(--rz-accent); }
.rz-editor label { display: block; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px;
  color: #9fb3c8; margin: 14px 0 6px; }
.rz-editor input, .rz-editor textarea { width: 100%; box-sizing: border-box; background: #0a0a10;
  border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 8px; padding: 10px 12px;
  font-size: 0.95rem; font-family: inherit; }
.rz-editor input:focus, .rz-editor textarea:focus { outline: none; border-color: var(--rz-accent); }
.rz-editor textarea { min-height: 90px; resize: vertical; }
.rz-jobedit { border: 1px dashed rgba(255,255,255,0.2); border-radius: 8px; padding: 14px; margin-top: 14px; }
.rz-row { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.rz-small { font-size: 0.78rem; color: #9fb3c8; }
@media (max-width: 700px) { .rz-card { padding: 24px 18px; } .rz-grid { grid-template-columns: 1fr; } .rz-name { font-size: 1.7rem; } }
@media print {
  .rz-bar, .rz-editor, .rz-bg { display: none !important; }
  .rz-root { background: #fff; color: #111; }
  .rz-card { background: #fff; border: 1px solid #ccc; box-shadow: none; backdrop-filter: none; text-shadow: none; color: #111; }
  .rz-card li, .rz-contact, .rz-co { color: #333; }
  .rz-name { -webkit-text-fill-color: #111; background: none; filter: none; }
  .rz-wrap { padding: 0; }
}
`;

function uid() {
  return 'j' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

export default function ResumePage() {
  const canvasRef = useRef(null);
  const [data, setData] = useState(TEMPLATE);
  const [accent, setAccent] = useState('cyan');
  const [editing, setEditing] = useState(false);
  const [ready, setReady] = useState(false);
  const accentHex = (ACCENTS.find((a) => a.id === accent) || ACCENTS[0]).hex;

  // Load saved template from this device
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('resume-template');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.data) {
          setData({ ...TEMPLATE, ...parsed.data });
          setAccent(parsed.accent || 'cyan');
        }
      }
    } catch { /* fresh template */ }
    setReady(true);
  }, []);

  // Persist edits to this device
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem('resume-template', JSON.stringify({ data, accent }));
    } catch { /* storage unavailable */ }
  }, [data, accent, ready]);

  // 2D particle vortex backdrop (no external 3D library)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let w = 0, h = 0;
    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w; canvas.height = h;
    };
    resize();
    window.addEventListener('resize', resize);
    const N = 900;
    const parts = Array.from({ length: N }, () => {
      const radius = 2 + Math.random() * 24;
      const theta = Math.random() * Math.PI * 2;
      return {
        r: radius, th: theta,
        y: (Math.random() - 0.5) * 60,
        s: 0.4 + Math.random() * 1.2,
        mix: Math.random(),
      };
    });
    const accentRgb = [0, 229, 255];
    let t = 0;
    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      for (const p of parts) {
        p.th += 0.0018 * p.s;
        const x = cx + p.r * 14 * Math.cos(p.th + p.r * 0.5);
        const y = cy + p.y * 14 + Math.sin(t + p.r) * 6;
        const isAccent = p.mix > 0.5;
        ctx.fillStyle = isAccent
          ? 'rgba(' + accentRgb.join(',') + ',' + (0.25 + p.mix * 0.35).toFixed(2) + ')'
          : 'rgba(68,0,255,' + (0.2 + p.mix * 0.3).toFixed(2) + ')';
        ctx.fillRect(x, y, p.s, p.s);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  const set = (patch) => setData((d) => ({ ...d, ...patch }));
  const setJob = (i, patch) =>
    setData((d) => ({ ...d, jobs: d.jobs.map((j, k) => (k === i ? { ...j, ...patch } : j)) }));
  const addJob = () =>
    setData((d) => ({
      ...d,
      jobs: [...d.jobs, { key: uid(), role: 'New Role', company: 'Example Employer', meta: 'Year – Year · City, ST', bullets: ['Describe an achievement or duty.'] }],
    }));
  const removeJob = (i) => setData((d) => ({ ...d, jobs: d.jobs.filter((_, k) => k !== i) }));
  const resetTemplate = () => {
    setData(TEMPLATE);
    setAccent('cyan');
    try { window.localStorage.removeItem('resume-template'); } catch { /* ignore */ }
  };

  const bulletsText = (j) => j.bullets.join('\n');
  const setBullets = (i, text) => setJob(i, { bullets: text.split('\n').filter((b) => b.trim() !== '') });

  if (!ready) {
    return (
      <main className="rz-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888', letterSpacing: 2, textTransform: 'uppercase', fontSize: '0.85rem' }}>Loading template…</p>
      </main>
    );
  }

  return (
    <main className="rz-root" style={{ '--rz-accent': accentHex }}>
      <style>{CSS}</style>
      <canvas ref={canvasRef} className="rz-bg" aria-hidden="true" />

      <div className="rz-wrap">
        <div className="rz-bar">
          <h1>Resume Studio</h1>
          <div className="rz-controls">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                className={'rz-swatch' + (accent === a.id ? ' on' : '')}
                style={{ background: a.hex, color: a.hex }}
                onClick={() => setAccent(a.id)}
                aria-label={a.label + ' accent'}
                aria-pressed={accent === a.id}
              />
            ))}
            <button className="rz-btn" onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
              {editing ? 'Hide editor' : 'Customize'}
            </button>
            <button className="rz-btn primary" onClick={() => window.print()}>Print / Save PDF</button>
          </div>
        </div>

        <div className="rz-card">
          <header>
            <h1 className="rz-name">{data.name}</h1>
            <p className="rz-contact">{data.title}<br />{data.contact}</p>
          </header>

          <h2>Professional Summary</h2>
          <p style={{ textAlign: 'justify' }}>{data.summary}</p>

          <h2>Professional Experience</h2>
          {data.jobs.map((j, i) => (
            <div className="rz-job" key={j.key || i}>
              <div className="rz-jobhead">
                <div><span className="rz-role">{j.role}</span> <span className="rz-co">| {j.company}</span></div>
                <div className="rz-meta">{j.meta}</div>
              </div>
              <ul>{j.bullets.map((b, k) => <li key={k}>{b}</li>)}</ul>
            </div>
          ))}

          <div className="rz-grid">
            <div>
              <h2>Education &amp; Training</h2>
              {data.education.map((e, i) => (
                <div className="rz-ed" key={i}>
                  <strong>{e.school}</strong><br />
                  <span className="rz-co">{e.detail}</span>
                </div>
              ))}
            </div>
            <div>
              <h2>Skills</h2>
              <p>{data.skills}</p>
            </div>
          </div>
        </div>

        {editing && (
          <div className="rz-editor">
            <h3>Edit your template</h3>
            <p className="rz-small">
              This is a starter template with placeholder text — replace everything with your
              own details. Your edits are saved on this device only.
            </p>
            <label htmlFor="rz-name">Full name</label>
            <input id="rz-name" value={data.name} onChange={(e) => set({ name: e.target.value })} />
            <label htmlFor="rz-title">Professional title</label>
            <input id="rz-title" value={data.title} onChange={(e) => set({ title: e.target.value })} />
            <label htmlFor="rz-contact">Contact line</label>
            <input id="rz-contact" value={data.contact} onChange={(e) => set({ contact: e.target.value })} />
            <label htmlFor="rz-summary">Professional summary</label>
            <textarea id="rz-summary" value={data.summary} onChange={(e) => set({ summary: e.target.value })} />

            {data.jobs.map((j, i) => (
              <div className="rz-jobedit" key={j.key || i}>
                <h3>Position {i + 1}</h3>
                <label>Role</label>
                <input value={j.role} onChange={(e) => setJob(i, { role: e.target.value })} />
                <label>Employer</label>
                <input value={j.company} onChange={(e) => setJob(i, { company: e.target.value })} />
                <label>Dates · Location</label>
                <input value={j.meta} onChange={(e) => setJob(i, { meta: e.target.value })} />
                <label>Achievements (one per line)</label>
                <textarea value={bulletsText(j)} onChange={(e) => setBullets(i, e.target.value)} />
                <div className="rz-row">
                  <button className="rz-btn" onClick={() => removeJob(i)}>Remove position</button>
                </div>
              </div>
            ))}
            <div className="rz-row">
              <button className="rz-btn" onClick={addJob}>+ Add position</button>
              <button className="rz-btn" onClick={resetTemplate}>Reset template</button>
            </div>

            <h3 style={{ marginTop: 22 }}>Education</h3>
            {data.education.map((e, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label>School / program</label>
                  <input value={e.school} onChange={(ev) =>
                    set({ education: data.education.map((x, k) => (k === i ? { ...x, school: ev.target.value } : x)) })} />
                </div>
                <div>
                  <label>Detail</label>
                  <input value={e.detail} onChange={(ev) =>
                    set({ education: data.education.map((x, k) => (k === i ? { ...x, detail: ev.target.value } : x)) })} />
                </div>
              </div>
            ))}
            <label htmlFor="rz-skills">Skills (comma separated)</label>
            <textarea id="rz-skills" value={data.skills} onChange={(e) => set({ skills: e.target.value })} />
          </div>
        )}
      <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))]" />
      </div>
    </main>
  );
}
