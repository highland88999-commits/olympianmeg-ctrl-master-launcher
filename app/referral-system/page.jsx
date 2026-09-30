'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  validateInquiry, buildInquiryRow, queueInquiry, queuedInquiryCount,
  buildInquiryMailto, INQUIRY_EMAIL,
} from './inquiry';

const CSS = `
.rs-root { min-height: 100dvh; background: #030305; color: #fff; overflow: hidden; position: relative;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.rs-bg { position: fixed; inset: 0; z-index: 1; pointer-events: none; }
.rs-scan { position: fixed; inset: 0; z-index: 2; pointer-events: none; opacity: 0.35;
  background: linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.25) 50%),
             linear-gradient(90deg, rgba(255,0,0,0.06), rgba(0,255,0,0.02), rgba(0,0,255,0.06));
  background-size: 100% 4px, 3px 100%; }
.rs-carousel { position: relative; z-index: 3; height: 100dvh; overflow: hidden; display: flex; align-items: center; }
.rs-track { display: flex; width: 300vw; height: 100%; transition: transform 0.6s cubic-bezier(0.25,1,0.5,1); }
.rs-slide { width: 100vw; height: 100%; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; }
.rs-panel { width: 100%; max-width: 700px; max-height: 85dvh; overflow-y: auto; scrollbar-width: none;
  background: rgba(5,10,20,0.55); border: 1px solid rgba(0,243,255,0.3); border-radius: 15px;
  padding: 40px; backdrop-filter: blur(12px); text-align: center;
  display: flex; flex-direction: column; gap: 22px;
  box-shadow: 0 0 30px rgba(0,243,255,0.1), inset 0 0 20px rgba(0,243,255,0.05); }
.rs-panel::-webkit-scrollbar { display: none; }
.rs-h1 { font-size: 2.2rem; margin: 0; color: #00f2ff; text-shadow: 0 0 15px rgba(0,243,255,0.6);
  text-transform: uppercase; letter-spacing: 3px; font-weight: 900; }
.rs-h2 { font-size: 1.5rem; color: #FFD700; margin: 0; text-transform: uppercase; letter-spacing: 2px;
  text-shadow: 0 0 10px rgba(255,215,0,0.4); font-weight: 700; }
.rs-sub { font-size: 1rem; line-height: 1.6; color: #cceeff; margin: 0 auto; max-width: 560px; }
.rs-pillar { background: rgba(0,0,0,0.4); border-left: 3px solid #00f2ff; padding: 15px; text-align: left; border-radius: 0 8px 8px 0; }
.rs-pillar h3 { margin: 0 0 5px 0; font-size: 1.05rem; color: #00f2ff; letter-spacing: 1px; }
.rs-pillar p { margin: 0; font-size: 0.9rem; color: #ddd; line-height: 1.5; }
.rs-price { font-size: 3rem; font-weight: 900; color: #fff;
  text-shadow: 0 0 20px rgba(0,243,255,0.7), 0 0 40px rgba(10,68,255,0.5); letter-spacing: 2px; margin: 6px 0; }
.rs-price small { font-size: 1.1rem; color: #FFD700; font-weight: 700; }
.rs-btn { background: rgba(0,15,30,0.6); border: 1px solid #00f2ff; color: #00f2ff; padding: 14px 18px;
  font-size: 0.9rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; border-radius: 6px;
  cursor: pointer; transition: all 0.25s ease; min-height: 48px; width: 100%; }
.rs-btn:hover { background: #00f2ff; color: #000; box-shadow: 0 0 20px rgba(0,243,255,0.5); }
.rs-btn.gold { border-color: #FFD700; color: #FFD700; background: rgba(30,22,0,0.5); }
.rs-btn.gold:hover { background: #FFD700; color: #000; box-shadow: 0 0 20px rgba(255,215,0,0.5); }
.rs-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.rs-field label { display: block; text-align: left; font-size: 0.72rem; text-transform: uppercase;
  letter-spacing: 1px; color: #9fd8e8; margin-bottom: 6px; }
.rs-field input { width: 100%; box-sizing: border-box; background: #050a12; border: 1px solid rgba(0,243,255,0.35);
  color: #fff; padding: 12px; border-radius: 6px; font-size: 1rem; outline: none; }
.rs-field input:focus { border-color: #00f2ff; box-shadow: 0 0 12px rgba(0,243,255,0.25); }
.rs-kpi { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.rs-kpi div { background: rgba(0,0,0,0.45); border: 1px solid rgba(255,215,0,0.35); border-radius: 8px; padding: 12px 6px; }
.rs-kpi b { display: block; color: #FFD700; font-size: 1.25rem; }
.rs-kpi span { font-size: 0.68rem; color: #9fb3c8; text-transform: uppercase; letter-spacing: 1px; }
.rs-dots { position: absolute; bottom: calc(26px + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); z-index: 10;
  display: flex; flex-direction: column; align-items: center; gap: 10px; pointer-events: none; }
.rs-hint { color: #00f2ff; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 2px;
  animation: rs-pulse 2s infinite; }
@keyframes rs-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
.rs-dotrow { display: flex; gap: 14px; }
.rs-dot { width: 12px; height: 12px; border: 1px solid #00f2ff; border-radius: 50%; transition: 0.3s; }
.rs-dot.active { background: #00f2ff; box-shadow: 0 0 10px #00f2ff; }
.rs-note { font-size: 0.75rem; color: #8aa0b4; line-height: 1.5; }
.rs-divider { border-top: 1px dashed rgba(0,243,255,0.3); padding-top: 20px; margin-top: 4px; }
.rs-field textarea { width: 100%; box-sizing: border-box; background: #050a12; border: 1px solid rgba(0,243,255,0.35);
  color: #fff; padding: 12px; border-radius: 6px; font-size: 1rem; outline: none; min-height: 96px; resize: vertical;
  font-family: inherit; }
.rs-field textarea:focus { border-color: #00f2ff; box-shadow: 0 0 12px rgba(0,243,255,0.25); }
.rs-field .rs-err { color: #ff8a8a; font-size: 0.72rem; text-align: left; margin-top: 4px; }
.rs-status { font-size: 0.82rem; line-height: 1.6; border-radius: 8px; padding: 12px 14px; text-align: left; }
.rs-status.sent { background: rgba(0,243,255,0.1); border: 1px solid rgba(0,243,255,0.5); color: #c8fbff; }
.rs-status.queued { background: rgba(255,215,0,0.07); border: 1px solid rgba(255,215,0,0.45); color: #ffe9a8; }
.rs-status a { color: #00f2ff; }
.rs-toast { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); z-index: 20;
  background: rgba(0,243,255,0.92); color: #000; font-weight: 700; padding: 10px 18px; border-radius: 8px; font-size: 0.85rem; }
@media (max-width: 600px) {
  .rs-h1 { font-size: 1.6rem; }
  .rs-panel { padding: 26px 16px; width: 95%; gap: 16px; }
  .rs-grid2 { grid-template-columns: 1fr; }
  .rs-kpi { grid-template-columns: 1fr; }
}
`;

const NODES = 110;

function useNodeField(canvasRef, slide) {
  const slideRef = useRef(slide);
  slideRef.current = slide;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const pts = Array.from({ length: NODES }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.45, vy: (Math.random() - 0.5) * 0.45,
      r: 1 + Math.random() * 2.2, tw: Math.random() * Math.PI * 2,
    }));
    let t = 0;
    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      const shift = slideRef.current * w * 0.35;
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy; p.tw += 0.03;
        if (p.x < -20) p.x = w + 20; if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20; if (p.y > h + 20) p.y = -20;
        const a = 0.35 + Math.sin(p.tw) * 0.25;
        ctx.beginPath();
        ctx.arc(p.x - shift, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,243,255,' + a.toFixed(3) + ')';
        ctx.fill();
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          if (dx * dx + dy * dy < 150 * 150) {
            ctx.strokeStyle = 'rgba(10,68,255,0.28)';
            ctx.beginPath();
            ctx.moveTo(a.x - shift, a.y);
            ctx.lineTo(b.x - shift, b.y);
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [canvasRef]);
}

const money = (n) =>
  n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

export default function ReferralSystemPage() {
  const canvasRef = useRef(null);
  const [slide, setSlide] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [offset, setOffset] = useState(0);
  const [toast, setToast] = useState('');
  const [avg, setAvg] = useState(85);
  const [reward, setReward] = useState(10);
  const [referrers, setReferrers] = useState(40);
  const [conv, setConv] = useState(25);
  const trackRef = useRef(null);

  // --- Inquiry form ("Request this build") ---------------------------------
  // Tries the cloud table first (supabase/referral-inquiries.sql, queued —
  // not yet run). Missing table or no network -> the entry is saved on this
  // device and the UI says exactly that, with a mailto fallback. It never
  // claims an inquiry was sent when it was only stored locally.
  const [iqName, setIqName] = useState('');
  const [iqEmail, setIqEmail] = useState('');
  const [iqCompany, setIqCompany] = useState('');
  const [iqMessage, setIqMessage] = useState('');
  const [iqErrors, setIqErrors] = useState([]);
  const [iqState, setIqState] = useState('idle'); // idle | sending | sent | queued
  const [iqQueued, setIqQueued] = useState(0);

  useEffect(() => {
    try { setIqQueued(queuedInquiryCount(window.localStorage)); } catch { /* ignore */ }
  }, []);

  useNodeField(canvasRef, slide);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('referral-calc') || 'null');
      if (saved) {
        setAvg(saved.avg ?? 85); setReward(saved.reward ?? 10);
        setReferrers(saved.referrers ?? 40); setConv(saved.conv ?? 25);
      }
    } catch { /* fresh start */ }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('referral-calc', JSON.stringify({ avg, reward, referrers, conv }));
    } catch { /* storage unavailable */ }
  }, [avg, reward, referrers, conv]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const go = (i) => setSlide(Math.max(0, Math.min(2, i)));
  const hints = [
    'Swipe to inspect the architecture',
    'Swipe for deployment protocols',
    'Run the numbers, then deploy',
  ];

  const onStart = (x) => { setDragging(true); setStartX(x); if (trackRef.current) trackRef.current.style.transition = 'none'; };
  const onMove = (x) => { if (!dragging) return; setOffset(((x - startX) / window.innerWidth) * 100); };
  const onEnd = (x) => {
    if (!dragging) return;
    setDragging(false);
    if (trackRef.current) trackRef.current.style.transition = 'transform 0.6s cubic-bezier(0.25,1,0.5,1)';
    const diff = x - startX;
    if (diff < -50) go(slide + 1);
    else if (diff > 50) go(slide - 1);
    setOffset(0);
  };

  const sales = referrers * (conv / 100);
  const payout = sales * avg * (reward / 100);
  const revenue = sales * avg;
  const margin = revenue - payout;

  const copyBrief = async () => {
    const brief =
      'REFERRAL PROGRAM BRIEF\n' +
      'Average order value: ' + money(avg) + '\n' +
      'Referrer reward: ' + reward + '%\n' +
      'Active referrers: ' + referrers + '\n' +
      'Expected conversion: ' + conv + '%\n' +
      'Projected monthly payouts: ' + money(payout) + '\n' +
      'Projected monthly revenue: ' + money(revenue) + '\n' +
      'Projected margin: ' + money(margin) + '\n';
    try {
      await navigator.clipboard.writeText(brief);
      setToast('Brief copied — paste it into your launch doc.');
    } catch {
      setToast('Copy blocked by the browser — long-press to copy manually.');
    }
  };

  const sendInquiry = async (e) => {
    e.preventDefault();
    if (iqState === 'sending') return;
    const { valid, errors } = validateInquiry({
      name: iqName, email: iqEmail, company: iqCompany, message: iqMessage,
    });
    setIqErrors(errors);
    if (!valid) return;
    setIqState('sending');
    const row = buildInquiryRow({ name: iqName, email: iqEmail, company: iqCompany, message: iqMessage });
    try {
      const { error } = await supabase.from('referral_inquiries').insert([row]);
      if (error) throw error;
      setIqState('sent');
      setIqName(''); setIqEmail(''); setIqCompany(''); setIqMessage('');
    } catch {
      // Cloud insert failed (table not live yet, or offline) — keep the
      // inquiry on this device instead of dropping it, and say so plainly.
      try {
        setIqQueued(queueInquiry(window.localStorage, row));
      } catch { /* storage unavailable */ }
      setIqState('queued');
    }
  };

  const inquiryMailto = buildInquiryMailto({
    name: iqName || '—', email: iqEmail || '—', company: iqCompany, message: iqMessage || '—',
  });

  return (
    <>
    <main className="rs-root">
      <style>{CSS}</style>
      <canvas ref={canvasRef} className="rs-bg" aria-hidden="true" />
      <div className="rs-scan" aria-hidden="true" />

      <div
        className="rs-carousel"
        onTouchStart={(e) => onStart(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={(e) => onEnd(e.changedTouches[0].clientX)}
        onMouseDown={(e) => { if (!e.target.closest('button,input,a')) onStart(e.pageX); }}
        onMouseMove={(e) => onMove(e.pageX)}
        onMouseUp={(e) => onEnd(e.pageX)}
        onMouseLeave={() => { if (dragging) { setDragging(false); setOffset(0); } }}
      >
        <div
          ref={trackRef}
          className="rs-track"
          style={{ transform: 'translateX(' + (-slide * 100 + offset) + 'vw)' }}
        >
          {/* SLIDE 1 */}
          <div className="rs-slide">
            <div className="rs-panel">
              <h1 className="rs-h1">Command Your Legion</h1>
              <p className="rs-sub">
                Deploy an autonomous, decentralized sales force. Build referral nodes branded
                to your company&apos;s look and turn your audience into an incentivized,
                hyper-active sales channel.
              </p>
              <p className="rs-note">
                Concept brief &amp; ROI estimator — a planning sketch, not a live product.
                Payout automation is not built; this page runs the numbers, it does not pay anyone.
              </p>
              <div style={{ borderTop: '1px dashed rgba(0,243,255,0.3)', paddingTop: 20 }}>
                <h2 className="rs-h2" style={{ color: '#00f2ff', fontSize: '1.2rem' }}>Total Autonomy (planned)</h2>
                <p className="rs-sub" style={{ fontSize: '0.9rem' }}>
                  In the planned build, the goal would be zero administrative overhead: you set
                  the rewards, and automated payouts would route to referrers on verification,
                  with no 30-day accounting delays. None of that exists yet — this page is an
                  estimator, not a payment system.
                </p>
              </div>
            </div>
          </div>

          {/* SLIDE 2 */}
          <div className="rs-slide">
            <div className="rs-panel">
              <h2 className="rs-h2">The Architecture</h2>
              <p className="rs-sub">More than a tracking link — an operational advantage.</p>
              <div className="rs-pillar">
                <h3>Frictionless Payouts (planned)</h3>
                <p>Not built yet. In the planned system, automated payout routing would let you
                  choose exactly how much to pay your sales force, with payouts released
                  instantly upon verification. Today, this page only estimates the numbers.</p>
              </div>
              <div className="rs-pillar">
                <h3>Immersive Brand Elevation</h3>
                <p>Custom web environments and holographic visual interfaces, so the
                  referral program feels like an exclusive, high-tier network.</p>
              </div>
              <div className="rs-pillar">
                <h3>True Viral Distribution</h3>
                <p>Optimized for mobile scaling. Referrers deploy their unique links
                  seamlessly across their social circles.</p>
              </div>
            </div>
          </div>

          {/* SLIDE 3 */}
          <div className="rs-slide">
            <div className="rs-panel">
              <h2 className="rs-h2">Example Pricing Model</h2>
              <div className="rs-price">$3,500 <small>CAD</small></div>
              <p className="rs-sub" style={{ fontSize: '0.85rem' }}>
                An example one-time setup price for a hypothetical custom build: environment
                build, interface styling, database integration, and payout automation.
                This is a pricing sketch — nothing on this page is for sale and no purchase
                path exists.
              </p>
              <div className="rs-grid2">
                <div className="rs-field">
                  <label htmlFor="rs-avg">Avg. order value ($)</label>
                  <input id="rs-avg" type="number" min="0" value={avg}
                    onChange={(e) => setAvg(Math.max(0, Number(e.target.value) || 0))} />
                </div>
                <div className="rs-field">
                  <label htmlFor="rs-reward">Referrer reward (%)</label>
                  <input id="rs-reward" type="number" min="0" max="100" value={reward}
                    onChange={(e) => setReward(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
                </div>
                <div className="rs-field">
                  <label htmlFor="rs-ref">Active referrers / month</label>
                  <input id="rs-ref" type="number" min="0" value={referrers}
                    onChange={(e) => setReferrers(Math.max(0, Number(e.target.value) || 0))} />
                </div>
                <div className="rs-field">
                  <label htmlFor="rs-conv">Conversion rate (%)</label>
                  <input id="rs-conv" type="number" min="0" max="100" value={conv}
                    onChange={(e) => setConv(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
                </div>
              </div>
              <div className="rs-kpi" aria-live="polite">
                <div><b>{money(payout)}</b><span>Referrer payouts / mo</span></div>
                <div><b>{money(revenue)}</b><span>Referred revenue / mo</span></div>
                <div><b>{money(margin)}</b><span>Margin after payouts</span></div>
              </div>
              <button className="rs-btn gold" onClick={copyBrief}>Copy program brief</button>
              <p className="rs-note">
                Estimates only — run your own margin math before launch. Your numbers stay on
                this device; nothing is uploaded anywhere. Payout automation is not built —
                this page is an ROI estimator, not a payment system.
              </p>

              <div className="rs-divider">
                <h2 className="rs-h2" style={{ fontSize: '1.15rem' }}>Request this build</h2>
                <p className="rs-sub" style={{ fontSize: '0.85rem' }}>
                  The $3,500 CAD figure above is an example sketch, not a checkout. Tell us
                  about your project and we&apos;ll come back with a real quote.
                </p>
                {iqState === 'sent' ? (
                  <div className="rs-status sent" role="status">
                    Inquiry received. We&apos;ll reply to the email you gave us — usually
                    within a couple of days.
                  </div>
                ) : (
                  <form onSubmit={sendInquiry} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="rs-grid2">
                      <div className="rs-field">
                        <label htmlFor="rs-iq-name">Your name</label>
                        <input id="rs-iq-name" type="text" value={iqName}
                          onChange={(e) => setIqName(e.target.value)} autoComplete="name" />
                        {iqErrors.includes('name') && <p className="rs-err">Please add your name.</p>}
                      </div>
                      <div className="rs-field">
                        <label htmlFor="rs-iq-email">Email</label>
                        <input id="rs-iq-email" type="email" value={iqEmail}
                          onChange={(e) => setIqEmail(e.target.value)} autoComplete="email" />
                        {iqErrors.includes('email') && <p className="rs-err">That email doesn&apos;t look right.</p>}
                      </div>
                    </div>
                    <div className="rs-field">
                      <label htmlFor="rs-iq-company">Company <span style={{ opacity: 0.6 }}>(optional)</span></label>
                      <input id="rs-iq-company" type="text" value={iqCompany}
                        onChange={(e) => setIqCompany(e.target.value)} autoComplete="organization" />
                    </div>
                    <div className="rs-field">
                      <label htmlFor="rs-iq-message">What are you building?</label>
                      <textarea id="rs-iq-message" value={iqMessage}
                        onChange={(e) => setIqMessage(e.target.value)}
                        placeholder="A few lines about your audience, your product, and what you want the referral program to do." />
                      {iqErrors.includes('message') && <p className="rs-err">Add a line or two so we know what to quote.</p>}
                    </div>
                    <button type="submit" className="rs-btn" disabled={iqState === 'sending'}>
                      {iqState === 'sending' ? 'Sending…' : 'Send inquiry'}
                    </button>
                    {iqState === 'queued' && (
                      <div className="rs-status queued" role="status">
                        Saved on this device — the inquiry database isn&apos;t live yet, so it
                        hasn&apos;t reached us. {iqQueued > 0 && `(${iqQueued} saved.) `}
                        <a href={inquiryMailto}>Open it in your email app</a> to send it to {INQUIRY_EMAIL} instead.
                      </div>
                    )}
                    <p className="rs-note">
                      Only your inquiry is stored — the calculator numbers above never leave this device.
                    </p>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rs-dots" aria-hidden="true">
          <div className="rs-hint">{hints[slide]}</div>
          <div className="rs-dotrow">
            {[0, 1, 2].map((i) => (
              <div key={i} className={'rs-dot' + (i === slide ? ' active' : '')} />
            ))}
          </div>
        </div>
      </div>

      {toast && <div className="rs-toast" role="status">{toast}</div>}
    </main>
    {/* Safari bottom-bar clearance: blank space under the fixed carousel viewport */}
    <div aria-hidden="true" className="player-clear" />
    </>
  );
}
