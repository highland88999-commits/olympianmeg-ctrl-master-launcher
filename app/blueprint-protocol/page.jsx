'use client';

/*
 * Olympus | Blueprint Protocol — interactive blueprint reader.
 * Rebuilt from the single-file original as a self-contained module.
 * All telemetry was stripped: OMEGA MIND uplink, ipify lookup,
 * central_telemetry inserts, connected_repos registration, the
 * jsdelivr supabase CDN scripts, and the cdnjs three.js CDN script.
 * The particle field is canvas 2D (no WebGL library, no downloads).
 * Nothing leaves this device — sections and progress are local only.
 */

import { useEffect, useRef, useState } from 'react';

const TITLE = 'Olympus | Blueprint Protocol';
const STORAGE_KEY = 'blueprint-protocol.progress.v1';

const SECTIONS = [
  { id: 'economics', num: '01', label: 'Economics of Transformation' },
  { id: 'coop', num: '02', label: 'The Cooperative Economy' },
  { id: 'matrix', num: '03', label: 'The 15% Allocation Matrix' },
  { id: 'legal', num: '04', label: 'The Olympus Foundation' },
  { id: 'roadmap', num: '05', label: 'The Execution Roadmap' },
  { id: 'midas', num: '06', label: 'The Midas Philosophy' },
];

const ALLOCATIONS = [
  { pillar: 'The Genesis Presale', pct: '15%', purpose: 'Jumpstarts initial liquidity. Distributed to early adopters to establish market velocity.' },
  { pillar: 'The Foundation Treasury', pct: '15%', purpose: 'Dedicated exclusively to physical real estate acquisition (The Pilot House).' },
  { pillar: 'The Aetheris R&D Pool', pct: '15%', purpose: 'Locked and vested specifically for the global air filtration engineering infrastructure.' },
  { pillar: 'The Ecosystem Forge', pct: '15%', purpose: 'Feeds the 50-part digital ecosystem (hosting, node security, 3D world expansion).' },
  { pillar: 'The Philanthropy Pool', pct: '15%', purpose: 'Fuels localized charitable operations, clothing distributions, and food bank support.' },
  { pillar: 'The Valkyrie Rewards', pct: '15%', purpose: 'Reserves for the grassroots referral system and maintenance-for-tokens labor rewards.' },
  { pillar: 'Governance Buffer', pct: '10%', purpose: 'Algorithmic stabilization pool for market depth and regulatory compliance.' },
];

const EPOCHS = [
  {
    id: 1,
    title: 'Epoch 1: The Commercial Engine & Legal Charter',
    lede: 'Leveraging the retail engine to generate verifiable capital while securing governmental authorization.',
    items: [
      'Deploy the 50/50 smart contracts across the digital infrastructure and GitHub matrix.',
      'Launch the Valkyries of Olympus retail engine, utilizing the 50% Community Livelihood split to drive aggressive grassroots adoption.',
      'Incorporate the Olympus Foundation and apply for charitable status under the Relief of Poverty mandate, positioning the ecosystem as a self-funded infrastructure that reduces the public tax burden.',
    ],
  },
  {
    id: 2,
    title: 'Epoch 2: Anchor Ground (The Pilot House)',
    lede: 'Materializing the digital treasury into physical, secure real estate.',
    items: [
      'Liquidate the 15% Foundation Treasury allocation to acquire the Pilot House — a supportive apartment block for the unbanked and vulnerable.',
      'Retrofit public corridors with a high-definition surveillance net, backed by an immutable blockchain ledger for absolute security and accountability.',
      'Install plexiglassed QR code portals in every private living unit. Residents scan these to generate a Decentralized Identity (DID) and native wallet.',
      'Activate the maintenance-for-tokens ledger: residents earn digital currency by cleaning and maintaining the facility, reintegrating them into an active economy.',
    ],
  },
  {
    id: 3,
    title: 'Epoch 3: Scaled Infrastructure & Aetheris',
    lede: 'Starting from our anchor ground in Alberta, the network will branch across the country, establishing secure housing nodes province by province, before eventually expanding across borders to launch planetary-scale environmental operations.',
    items: [
      'Execute the annual 25% "Super Burn" from the Treasury Forge to create a supply shock, rewarding early adopters and increasing resident purchasing power.',
      'Leverage the Pilot House physical asset to secure traditional financing for real estate expansion.',
      'Activate the Aetheris allocation: shift the R&D engine toward manufacturing and deploying the Aetheris air filtration network.',
      'Integrate Aetheris maintenance into the tokenized labor pool, creating a global workforce dedicated to atmospheric purification.',
    ],
  },
];

const CSS = `
.bp-wrap { min-height: 100vh; background: #000; color: #fff; font-family: 'Courier New', Courier, monospace; overflow-x: hidden; }
.bp-canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 1; pointer-events: none; }
.bp-content { position: relative; z-index: 2; max-width: 1000px; margin: 0 auto; padding: 4rem 10%; background: transparent; }
.bp-progress { position: fixed; top: 0; left: 0; height: 3px; width: 0%; z-index: 10; background: linear-gradient(90deg, #00ffcc, #ff00ff); transition: width 0.1s linear; }
.bp-nav { position: sticky; top: 0; z-index: 5; display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 0; background: rgba(0,0,0,0.85); border-bottom: 1px solid rgba(0,255,204,0.3); }
.bp-nav button { background: transparent; border: 1px solid rgba(0,255,204,0.4); color: #00ffcc; font-family: inherit; font-size: 0.75rem; padding: 8px 12px; cursor: pointer; border-radius: 3px; min-height: 44px; }
.bp-nav button.active { background: #00ffcc; color: #000; font-weight: bold; }
.bp-h1 { font-size: 3.5rem; color: #00ffcc; text-shadow: 2px 2px 0 #000, 0 0 10px #000; margin-bottom: 1rem; text-transform: uppercase; border-bottom: 1px solid rgba(0,255,204,0.5); padding-bottom: 10px; line-height: 1.1; }
.bp-docheader { text-align: right; font-size: 0.9rem; color: #00ffcc; margin-bottom: 3rem; text-transform: uppercase; border-bottom: 1px solid rgba(0,255,204,0.3); padding-bottom: 5px; }
.bp-h2 { font-size: 2rem; color: #ff00ff; border-left: 4px solid #ff00ff; padding-left: 15px; margin-top: 4rem; text-shadow: 2px 2px 0 #000; scroll-margin-top: 90px; }
.bp-h3 { font-size: 1.5rem; color: #fff; margin-top: 2.5rem; text-shadow: 1px 1px 0 #000; }
.bp-p { font-size: 1.15rem; margin-bottom: 1.2rem; text-shadow: 1.5px 1.5px 0 #000, 0 0 8px #000; line-height: 1.6; }
.bp-ul { padding-left: 25px; }
.bp-li { font-size: 1.15rem; margin-bottom: 1.2rem; text-shadow: 1.5px 1.5px 0 #000; line-height: 1.6; }
.bp-hl { color: #00ffcc; font-weight: bold; }
.bp-callout { border-left: 4px solid #00ffcc; border-right: 1px solid rgba(0,255,204,0.3); border-top: 1px solid rgba(0,255,204,0.3); border-bottom: 1px solid rgba(0,255,204,0.3); padding: 20px; margin: 30px 0; border-radius: 4px; background: rgba(0,255,204,0.04); }
.bp-callout-title { color: #00ffcc; font-weight: bold; margin-bottom: 10px; display: block; text-transform: uppercase; font-size: 1.2rem; }
.bp-tablewrap { overflow-x: auto; margin: 30px 0; border: 1px solid rgba(0,255,204,0.3); border-radius: 4px; }
.bp-table { width: 100%; border-collapse: collapse; min-width: 600px; }
.bp-th, .bp-td { border: 1px solid rgba(0,255,204,0.2); padding: 15px; text-align: left; text-shadow: 1px 1px 0 #000; }
.bp-th { color: #00ffcc; font-weight: bold; font-size: 1.1rem; }
.bp-epoch-tabs { display: flex; gap: 10px; flex-wrap: wrap; margin: 24px 0; }
.bp-epoch-tab { background: transparent; border: 1px solid #ff00ff; color: #ff00ff; font-family: inherit; padding: 10px 16px; cursor: pointer; border-radius: 3px; min-height: 44px; font-size: 0.9rem; }
.bp-epoch-tab.active { background: #ff00ff; color: #000; font-weight: bold; }
.bp-top { position: fixed; bottom: 20px; right: 20px; z-index: 10; background: rgba(0,255,204,0.12); border: 1px solid #00ffcc; color: #00ffcc; font-family: inherit; font-size: 0.85rem; padding: 10px 14px; cursor: pointer; border-radius: 4px; }
@media (max-width: 700px) { .bp-h1 { font-size: 2.2rem; } .bp-content { padding: 2rem 6%; } }
`;

export default function BlueprintProtocolPage() {
  const canvasRef = useRef(null);
  const [activeSection, setActiveSection] = useState('economics');
  const [activeEpoch, setActiveEpoch] = useState(0);
  const [progress, setProgress] = useState(0);

  // Particle vortex background (canvas 2D — no external libraries).
  useEffect(() => {
    document.title = TITLE;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let mx = 0;
    let my = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    const onMove = (e) => {
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    document.addEventListener('mousemove', onMove);

    const palette = ['#00ffcc', '#ff00ff', '#0044ff', '#b000ff'];
    const COUNT = 700;
    const parts = [];
    for (let i = 0; i < COUNT; i++) {
      parts.push({
        angle: Math.random() * Math.PI * 2,
        radius: Math.random() * 45,
        speed: Math.random() * 0.01 + 0.002,
        y: (Math.random() - 0.5) * 60,
        weave: Math.random() * 100,
        color: palette[(Math.random() * palette.length) | 0],
      });
    }

    let t = 0;
    const draw = () => {
      t += 0.016;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2 + mx * 30;
      const cy = h / 2 - my * 30;
      const scale = Math.min(w, h) / 50;
      const globalAlpha = 0.65 + Math.sin(t * 1.2) * 0.35;
      for (const p of parts) {
        p.angle += p.speed;
        p.radius += p.speed * 2.5;
        if (p.radius > 45) {
          p.radius = Math.random() * 2;
          p.y = (Math.random() - 0.5) * 60;
        }
        const weave = Math.sin(t * 2 + p.weave) * 2.5;
        const r = (p.radius + weave) * scale;
        const depth = 1 - (p.y + 30) / 60;
        const x = cx + Math.cos(p.angle) * r;
        const yy = cy + (p.y + Math.cos(t + p.weave) * 1.5) * scale * 0.6 + depth * 200;
        const size = 1 + depth * 2.5;
        ctx.globalAlpha = globalAlpha * (0.4 + depth * 0.6);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, yy, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('mousemove', onMove);
    };
  }, []);

  // Reading progress + section tracking.
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? (window.scrollY / max) * 100 : 0);
      const ids = SECTIONS.map((s) => s.id);
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById('bp-' + id);
        if (el && el.getBoundingClientRect().top < 140) current = id;
      }
      setActiveSection(current);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ section: current }));
      } catch { /* private mode — progress simply isn't saved */ }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const jump = (id) => {
    const el = document.getElementById('bp-' + id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="bp-wrap">
      <style>{CSS}</style>
      <canvas ref={canvasRef} className="bp-canvas" aria-hidden="true" />
      <div className="bp-progress" style={{ width: progress + '%' }} />

      <div className="bp-content">
        <div className="bp-docheader">Olympus Blueprint Protocol // nexusvortex.ca</div>
        <h1 className="bp-h1">Olympus Blueprint Protocol</h1>
        <p className="bp-p">This document outlines the architectural blueprint for the Olympus decentralized ecosystem. It details the transition from purely digital frameworks into self-sustaining physical infrastructure, creating a cooperative economy that bypasses systemic reliance while funding planetary-scale initiatives.</p>

        <nav className="bp-nav" aria-label="Blueprint sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={activeSection === s.id ? 'active' : ''}
              onClick={() => jump(s.id)}
            >
              {s.num} // {s.label}
            </button>
          ))}
        </nav>

        <section id="bp-economics">
          <h2 className="bp-h2">1. The Economics of Transformation</h2>
          <p className="bp-p">The foundation of this ecosystem rests on the economic principle of transforming raw materials into capital assets. A raw penny holds a static, baseline value — often less than the cost to mint it. However, if one million pennies are melted down and forged into a factory component that mass-produces plastic containers, the value of that copper is no longer based on the metal itself; it is based entirely on the future productive output of the goods it generates.</p>
          <p className="bp-p">This exact logic is applied to computer-generated light particles, pixels, and WebGL code within <span className="bp-hl">nexusvortex.ca</span>. By forging interactive 3D spatial environments, virtual commerce hubs, and digital architecture, we transform infinite digital resources into high-value capital assets. The ecosystem&apos;s token is not backed by fiat debt, but by the tangible, functional output of the digital multiverse.</p>
        </section>

        <section id="bp-coop">
          <h2 className="bp-h2">2. The Cooperative Economy (50/50 Split)</h2>
          <p className="bp-p">To eliminate the friction of traditional corporate structures and build a massive participation moat, the ecosystem operates on a hardcoded <strong>50/50 Cooperative Split</strong> across the 50-part GitHub matrix and digital infrastructure.</p>
          <div className="bp-callout">
            <span className="bp-callout-title">The Secondary Minimum Wage</span>
            <p className="bp-p">Every monetized touchpoint — from digital asset sales to Fortress of Solitude data vault subscriptions, to physical merchandise — splits its profit margin straight down the middle.</p>
            <ul className="bp-ul">
              <li className="bp-li"><strong>50% Initiative Drive:</strong> Routed directly into the treasury to fund physical land acquisition, network upkeep, and charitable operations.</li>
              <li className="bp-li"><strong>50% Community Livelihood:</strong> Distributed directly to the creators, developers, and referrers. For example, a $30 profit margin on a Valkyries of Olympus hoodie yields $15 directly to the user who facilitated the sale, functioning as a localized secondary minimum wage.</li>
            </ul>
          </div>
        </section>

        <section id="bp-matrix">
          <h2 className="bp-h2">3. The 15% Systemic Allocation Matrix</h2>
          <p className="bp-p">To ensure synchronized growth across all fronts, the overarching tokenomic distribution is modularly divided into strictly enforced tranches.</p>
          <div className="bp-tablewrap">
            <table className="bp-table">
              <thead>
                <tr>
                  <th className="bp-th">Pillar</th>
                  <th className="bp-th">Allocation</th>
                  <th className="bp-th">Direct Systemic Purpose</th>
                </tr>
              </thead>
              <tbody>
                {ALLOCATIONS.map((row) => (
                  <tr key={row.pillar}>
                    <td className="bp-td">{row.pillar}</td>
                    <td className="bp-td bp-hl">{row.pct}</td>
                    <td className="bp-td">{row.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="bp-legal">
          <h2 className="bp-h2">4. The Legal Bridge: The Olympus Foundation</h2>
          <p className="bp-p">To materialize digital wealth into physical reality in Canada, a separate, legally distinct non-profit entity — the <strong>Olympus Foundation</strong> — is established. This creates a Capital Recycling Loop.</p>
          <ul className="bp-ul">
            <li className="bp-li"><strong>Relief of Poverty Mandate:</strong> The Foundation is registered as a Private Foundation with the specific CRA mandate of providing basic necessities (clothing, supportive housing) to vulnerable populations.</li>
            <li className="bp-li"><strong>The Tax Loop:</strong> Digital token donations are routed to the Foundation, liquidated to fiat, and used to fund physical charity. The Foundation issues valid CRA tax receipts, allowing users to claim deductions, receive fiat refunds from the government, and reinvest those funds back into the nexusvortex.ca ecosystem.</li>
          </ul>
        </section>

        <section id="bp-roadmap">
          <h2 className="bp-h2">5. The Execution Roadmap (The Epochs)</h2>
          <div className="bp-epoch-tabs" role="tablist" aria-label="Epochs">
            {EPOCHS.map((e, i) => (
              <button
                key={e.id}
                type="button"
                role="tab"
                aria-selected={activeEpoch === i}
                className={'bp-epoch-tab' + (activeEpoch === i ? ' active' : '')}
                onClick={() => setActiveEpoch(i)}
              >
                Epoch {e.id}
              </button>
            ))}
          </div>
          <h3 className="bp-h3">{EPOCHS[activeEpoch].title}</h3>
          <p className="bp-p">{EPOCHS[activeEpoch].lede}</p>
          <ul className="bp-ul">
            {EPOCHS[activeEpoch].items.map((item, i) => (
              <li className="bp-li" key={i}>{item}</li>
            ))}
          </ul>
        </section>

        <section id="bp-midas">
          <h2 className="bp-h2">6. The Midas Philosophy</h2>
          <p className="bp-p">The Olympus ecosystem is built on a specific aesthetic and operational philosophy: the high-tech, hooded explorer. Like Midas, the objective is not to hoard wealth in a vault, but to ensure that everything the ecosystem touches — from an incomplete piece of code, to an abandoned building, to a localized community — is transformed into high-value, functional capital. By distributing the wealth immediately back into the hands of the creators and the infrastructure, the system becomes an unstoppable, self-reliant engine.</p>
        </section>
      </div>

      <button type="button" className="bp-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        ↑ Top
      </button>
      <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
    </div>
  );
}
