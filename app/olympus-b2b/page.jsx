'use client';

import { useEffect, useRef, useState } from 'react';
import { SERVICES, PROCESS, FAQS, LIVE_PROJECTS } from './content';
import { validateInquiry, buildInquiry } from './inquiry';
import { createParticles, stepParticles, particleCountForWidth } from './particles';

const SERVICE_OPTIONS = ['Web Builds', '3D Experiences', 'Automation & Tooling', 'Commerce & Checkout', 'Security Hardening', 'Technical Consulting', 'Something Else'];

// Inline SVG glyph system (zero image weight) — PLUTUS batch.
const PATHS = {
  mail: 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
  send: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
  copy: 'M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z',
  check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  chevronDown: 'M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z',
  chevronRight: 'M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z',
};

function Glyph({ d, className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className || 'w-4 h-4 shrink-0'}>
      <path d={d} />
    </svg>
  );
}

// Shared obsidian panel texture under a dark teal wash.
const cardTile = {
  backgroundImage:
    'linear-gradient(rgba(4,10,13,0.9), rgba(4,10,13,0.9)), url(/images/plutus-shared/panel-tile.webp)',
  backgroundSize: 'auto, 200px',
};

function Seal() {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" className="w-16 h-16 md:w-24 md:h-24 mb-5">
      <circle cx="50" cy="50" r="48" stroke="#00f2ff" strokeWidth="2" />
      <path d="M55 20L35 50H50L45 80L65 50H50L55 20Z" fill="#00f2ff" />
    </svg>
  );
}

export default function OlympusB2BPage() {
  const canvasRef = useRef(null);
  const [openFaq, setOpenFaq] = useState(-1);
  const [form, setForm] = useState({ name: '', contact: '', service: '', details: '' });
  const [formErrors, setFormErrors] = useState([]);
  const [inquiry, setInquiry] = useState('');
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false); // first canvas frame painted
  const paintedRef = useRef(false);

  // Particle background.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let pts = [];
    let mx = 0;
    let my = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      pts = createParticles(particleCountForWidth(canvas.width), canvas.width, canvas.height);
    };
    const onMove = (x, y) => {
      mx = (x / window.innerWidth - 0.5) * 0.6;
      my = (y / window.innerHeight - 0.5) * 0.6;
    };
    const mm = (e) => onMove(e.clientX, e.clientY);
    const tm = (e) => { if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY); };

    const draw = () => {
      if (!paintedRef.current) { paintedRef.current = true; setReady(true); }
      // Transparent bed: the B2B art behind the canvas glows through.
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 65%, ${p.a})`;
        ctx.fill();
      }
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', mm);
    window.addEventListener('touchmove', tm, { passive: true });

    if (reduced) {
      draw(); // single static frame
    } else {
      const tick = () => {
        stepParticles(pts, canvas.width, canvas.height, mx, my);
        draw();
        raf = requestAnimationFrame(tick);
      };
      tick();
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('touchmove', tm);
    };
  }, []);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setInquiry('');
    setCopied(false);
  };

  const compose = (e) => {
    e.preventDefault();
    const { valid, errors } = validateInquiry(form);
    setFormErrors(errors);
    if (!valid) return;
    setInquiry(buildInquiry(form));
  };

  const copyInquiry = async () => {
    if (!inquiry) return;
    try {
      await navigator.clipboard.writeText(inquiry);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const fieldCls = (bad) =>
    `w-full bg-black border rounded-lg px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-400 ${bad ? 'border-red-500' : 'border-zinc-800'}`;

  return (
    <main className="relative min-h-dvh bg-[#050507] text-white overflow-x-hidden">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="fixed inset-0 -z-10"
        style={{ background: '#050507 url(/images/olympus-b2b/bg.webp) center/cover' }}
      />
      {!ready && (
        <div
          role="status"
          aria-label="Loading background"
          className="fixed inset-0 z-0 flex items-center justify-center pointer-events-none"
          style={{ background: '#050507 url(/images/olympus-b2b/bg.webp) center/cover' }}
        >
          <div className="text-cyan-300/80 text-xs font-bold tracking-[0.35em] uppercase">Scoping the foundry…</div>
        </div>
      )}

      <div className="relative z-10 w-[90%] max-w-5xl mx-auto py-12 md:py-20">
        {/* Header */}
        <header className="text-center mb-16 md:mb-24">
          <div className="flex justify-center">
            <Seal />
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-[0.15em] uppercase">Business Services</h1>
          <p className="mt-3 text-cyan-300 tracking-[0.35em] text-xs md:text-sm font-bold">WEB BUILDS · 3D · AUTOMATION</p>
          <p className="mt-6 text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            Software built for businesses, by one developer, with no agency overhead. Hand-built websites,
            interactive 3D, automation, and commerce — scoped in writing, tested on real devices, and handed
            over with the code.
          </p>
        </header>

        {/* Services */}
        <section aria-label="Services" className="mb-16 md:mb-24">
          <h2 className="text-center text-xl md:text-2xl font-black tracking-[0.25em] uppercase text-cyan-300 mb-8">What I build</h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <article key={s.id} className="border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-sm" style={cardTile}>
                <p className="font-mono text-xs text-fuchsia-400 mb-2">{s.label.toUpperCase()}</p>
                <h3 className="text-lg font-bold mb-2">{s.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{s.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Process */}
        <section aria-label="Process" className="mb-16 md:mb-24">
          <h2 className="text-center text-xl md:text-2xl font-black tracking-[0.25em] uppercase text-cyan-300 mb-8">How it works</h2>
          <ol className="space-y-0 max-w-2xl mx-auto">
            {PROCESS.map((p, i) => (
              <li key={p.step} className="relative pl-14 pb-8 last:pb-0">
                {i < PROCESS.length - 1 && <span aria-hidden="true" className="absolute left-5 top-10 bottom-0 w-px bg-cyan-500/30" />}
                <span aria-hidden="true" className="absolute left-0 top-0 w-10 h-10 rounded-full border border-cyan-400/60 bg-black flex items-center justify-center font-mono font-bold text-cyan-300">{p.step}</span>
                <h3 className="font-bold text-lg pt-1.5">{p.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed mt-1">{p.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* FAQ */}
        <section aria-label="FAQ" className="mb-16 md:mb-24 max-w-3xl mx-auto">
          <h2 className="text-center text-xl md:text-2xl font-black tracking-[0.25em] uppercase text-cyan-300 mb-8">Questions, answered</h2>
          <div className="space-y-3">
            {FAQS.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={i} className="border border-zinc-800 rounded-xl overflow-hidden" style={cardTile}>
                  <button
                    onClick={() => setOpenFaq(open ? -1 : i)}
                    aria-expanded={open}
                    className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 min-h-[56px]"
                  >
                    <span className="font-bold">{f.q}</span>
                    <Glyph d={open ? PATHS.chevronDown : PATHS.chevronRight} className="w-5 h-5 shrink-0 text-cyan-300" />
                  </button>
                  {open && <p className="px-5 pb-5 text-zinc-400 text-sm leading-relaxed">{f.a}</p>}
                </div>
              );
            })}
          </div>
        </section>

        {/* Inquiry form */}
        <section aria-label="Start a project" className="mb-16 md:mb-24 max-w-2xl mx-auto">
          <h2 className="text-center text-xl md:text-2xl font-black tracking-[0.25em] uppercase text-cyan-300 mb-3">Start a project</h2>
          <p className="text-center text-zinc-500 text-sm mb-8">
            This form composes your inquiry on your device. Nothing is sent anywhere until you decide to send it.
          </p>
          <form onSubmit={compose} className="border border-fuchsia-500/20 rounded-2xl p-6 md:p-8 space-y-4" style={cardTile}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="b2b-name" className="block text-xs font-bold tracking-widest text-zinc-400 mb-2">YOUR NAME / COMPANY</label>
                <input id="b2b-name" value={form.name} onChange={set('name')} placeholder="Jane Doe, Acme Ltd" className={fieldCls(formErrors.includes('name'))} autoComplete="name" />
              </div>
              <div>
                <label htmlFor="b2b-contact" className="block text-xs font-bold tracking-widest text-zinc-400 mb-2">HOW TO REACH YOU</label>
                <input id="b2b-contact" value={form.contact} onChange={set('contact')} placeholder="Email or phone" className={fieldCls(formErrors.includes('contact'))} autoComplete="email" />
              </div>
            </div>
            <div>
              <label htmlFor="b2b-service" className="block text-xs font-bold tracking-widest text-zinc-400 mb-2">SERVICE NEEDED</label>
              <select id="b2b-service" value={form.service} onChange={set('service')} className={`${fieldCls(formErrors.includes('service'))} ${form.service ? '' : 'text-zinc-600'}`}>
                <option value="">Select a service…</option>
                {SERVICE_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="b2b-details" className="block text-xs font-bold tracking-widest text-zinc-400 mb-2">PROJECT DETAILS</label>
              <textarea id="b2b-details" value={form.details} onChange={set('details')} rows={5} placeholder="What are you trying to build, and by when?" className={fieldCls(formErrors.includes('details'))} />
            </div>
            {formErrors.length > 0 && (
              <p role="alert" className="text-red-400 text-sm">Please fill in every field before composing your inquiry.</p>
            )}
            <button type="submit" className="w-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 text-black font-black tracking-widest uppercase py-4 rounded-lg hover:brightness-110 transition min-h-[56px] inline-flex items-center justify-center gap-2.5">
              <Glyph d={PATHS.mail} className="w-5 h-5 shrink-0" />
              Compose my inquiry
            </button>
          </form>

          {inquiry && (
            <div className="mt-6 bg-black/80 border border-cyan-500/40 rounded-2xl p-6">
              <h3 className="font-bold mb-2">Your inquiry — ready when you are</h3>
              <p className="text-zinc-500 text-sm mb-4">Copy it and send it however you like. Nothing has been transmitted.</p>
              <pre className="whitespace-pre-wrap font-mono text-xs md:text-sm text-zinc-300 bg-black border border-zinc-800 rounded-lg p-4 max-h-72 overflow-y-auto">{inquiry}</pre>
              <button onClick={copyInquiry} className="mt-4 w-full md:w-auto px-8 py-3 border border-cyan-400 text-cyan-300 font-bold tracking-widest uppercase rounded-lg hover:bg-cyan-400 hover:text-black transition min-h-[52px] inline-flex items-center justify-center gap-2">
                <Glyph d={copied ? PATHS.check : PATHS.copy} />
                {copied ? 'Copied' : 'Copy to clipboard'}
              </button>
            </div>
          )}
        </section>

        {/* Live projects */}
        <section aria-label="Live projects" className="text-center mb-16">
          <h2 className="font-mono text-sm tracking-[0.3em] text-cyan-300 mb-6">[ LIVE PROJECTS ]</h2>
          <div className="flex flex-wrap justify-center gap-4">
            {LIVE_PROJECTS.map((p) => (
              <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" className="font-mono text-sm px-8 py-4 border border-cyan-400/70 text-cyan-300 uppercase tracking-widest rounded hover:bg-cyan-400 hover:text-black transition min-h-[52px] inline-flex items-center">
                {p.label}
              </a>
            ))}
          </div>
        </section>

        <footer className="text-center pb-10 text-zinc-600 text-xs tracking-widest">
          © 2026 OLYMPUS B2B · EDMONTON
        </footer>

        {/* Safari bottom-bar clearance */}
        <div aria-hidden="true" className="player-clear" />
      </div>
    </main>
  );
}
