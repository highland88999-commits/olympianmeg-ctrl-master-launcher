'use client';

/*
 * HEPHAESTUS — the forge of the empire.
 * Commissioned by Merlin (Artemis). One forge, two fires, plus ideas.
 * Mission: "Take my logic and make it multiply to as many people as possible."
 * Prime directive: "Poverty needs to end."
 *
 * Four chambers: the Forge (digital module pipeline + commission intake),
 * the Factory (physical goods — the digital pays for physical, made visible),
 * the Foundry (idea board seeded with Merlin's own words), and the Multiplier
 * (share/distribution + a reach visualization).
 *
 * Zero external requests. localStorage only — no SQL, no env vars, no webhooks.
 * Glow stays localized (lighting rule). Plain English throughout.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, BackButton } from '@/components/ui';
import { SATELLITES } from '@/lib/i18n/satellites';
import {
  FORGE_STAGES, IDEA_STAGES, IDEA_STAGE_IDS, SEED_IDEAS,
  nextIdeaStage, nextForgeStage,
  validateCommission, suggestMythicName, buildShareCopy,
  loadJSON, saveJSON, makeId,
  OLYMPUS_FACTS, OLYMPUS_PRODUCTS, LUGE_ARSENAL_FACTS, FACTORY_LOOP,
} from '@/lib/hephaestus';

const COMMISSIONS_KEY = 'hephaestus.commissions.v1';
const IDEAS_KEY = 'hephaestus.ideas.v1';

const EMBER = '#f97316';
const GOLD = '#ffd700';

/* ---------------- Ember canvas: the forge fire (localized glow) ---------------- */
function EmberCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduce = typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, raf = 0;
    const embers = [];
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = canvas.width = Math.max(1, Math.floor(r.width));
      h = canvas.height = Math.max(1, Math.floor(r.height));
    };
    resize();
    window.addEventListener('resize', resize);
    const spawn = (seeded) => ({
      x: Math.random() * w,
      y: seeded ? Math.random() * h : h + 8,
      vy: 0.4 + Math.random() * 1.1,
      vx: (Math.random() - 0.5) * 0.5,
      r: 1 + Math.random() * 2.4,
      life: 1,
      decay: 0.004 + Math.random() * 0.008,
      hue: 18 + Math.random() * 26,
    });
    for (let i = 0; i < 70; i++) embers.push(spawn(true));
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      // Localized forge glow: bottom-center only, never floods the page.
      const g = ctx.createRadialGradient(w / 2, h + 20, 10, w / 2, h + 20, Math.max(w * 0.45, 120));
      g.addColorStop(0, 'rgba(249,115,22,0.34)');
      g.addColorStop(0.55, 'rgba(249,115,22,0.10)');
      g.addColorStop(1, 'rgba(249,115,22,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Dark anvil silhouette along the bottom.
      ctx.fillStyle = '#030303';
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h - 26);
      ctx.quadraticCurveTo(w * 0.3, h - 44, w * 0.5, h - 30);
      ctx.quadraticCurveTo(w * 0.7, h - 44, w, h - 26);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      for (const e of embers) {
        if (!reduce) {
          e.y -= e.vy; e.x += e.vx + Math.sin(e.y * 0.02) * 0.3; e.life -= e.decay;
          if (e.life <= 0 || e.y < -10) Object.assign(e, spawn(false));
        }
        ctx.beginPath();
        ctx.fillStyle = `hsla(${e.hue}, 95%, 58%, ${Math.max(0, e.life) * 0.85})`;
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}

/* ---------------- Reach canvas: one spark branching to many ---------------- */
function ReachCanvas({ sparkCount }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduce = typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, raf = 0, t = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = canvas.width = Math.max(1, Math.floor(r.width));
      h = canvas.height = Math.max(1, Math.floor(r.height));
    };
    resize();
    window.addEventListener('resize', resize);
    // Deterministic pseudo-random from a seed so the tree is stable.
    const rand = (() => { let s = 1234567; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
    const branches = [];
    const grow = (x, y, angle, len, depth) => {
      if (depth > 4 || len < 8) return;
      const nx = x + Math.cos(angle) * len, ny = y + Math.sin(angle) * len;
      branches.push({ x1: x, y1: y, x2: nx, y2: ny, depth, born: depth * 22 });
      const kids = depth === 0 ? 5 : 2 + Math.floor(rand() * 2);
      for (let i = 0; i < kids; i++) {
        grow(nx, ny, angle + (rand() - 0.5) * 1.5, len * (0.62 + rand() * 0.18), depth + 1);
      }
    };
    grow(w / 2, h - 24, -Math.PI / 2, Math.min(h * 0.22, 90), 0);
    const maxBorn = Math.max(...branches.map((b) => b.born)) + 40;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      t = reduce ? maxBorn : (t + 1) % (maxBorn + 90);
      for (const b of branches) {
        const p = Math.min(1, Math.max(0, (t - b.born) / 30));
        if (p <= 0) continue;
        const mx = b.x1 + (b.x2 - b.x1) * p, my = b.y1 + (b.y2 - b.y1) * p;
        ctx.strokeStyle = `rgba(251,191,36,${0.28 + (1 - b.depth / 5) * 0.5})`;
        ctx.lineWidth = Math.max(1, 3.4 - b.depth * 0.7);
        ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(mx, my); ctx.stroke();
        if (p >= 1 && b.depth >= 3) {
          ctx.fillStyle = 'rgba(249,115,22,0.9)';
          ctx.beginPath(); ctx.arc(b.x2, b.y2, 2.6, 0, Math.PI * 2); ctx.fill();
        }
      }
      // The spark at the root.
      const sg = ctx.createRadialGradient(w / 2, h - 24, 2, w / 2, h - 24, 34);
      sg.addColorStop(0, 'rgba(249,115,22,0.85)');
      sg.addColorStop(1, 'rgba(249,115,22,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(w / 2, h - 24, 34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff7ed';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const people = branches.filter((b) => b.depth >= 3 && t - b.born > 30).length * (sparkCount || 1);
      // Branch count of the drawing only — an illustration, never a real reach number.
      ctx.fillText(`${people.toLocaleString()} branches (illustration)`, w / 2, 22);
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [sparkCount]);
  return <canvas ref={ref} aria-hidden="true" style={{ width: '100%', height: 300, display: 'block' }} />;
}

/* ---------------- small UI atoms ---------------- */
const btn = {
  minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '0 18px', borderRadius: 10, border: '1px solid rgba(249,115,22,0.45)',
  background: 'rgba(249,115,22,0.12)', color: '#fed7aa', fontWeight: 600, cursor: 'pointer',
  fontSize: 15,
};
const btnPrimary = { ...btn, background: 'linear-gradient(180deg,#f97316,#c2410c)', color: '#fff7ed', border: '1px solid #f97316' };
const input = {
  width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 10, fontSize: 15,
  background: '#121214', border: '1px solid #3a2a18', color: '#f5f5f4',
};
const card = {
  background: 'rgba(20,14,8,0.85)', border: '1px solid rgba(249,115,22,0.22)',
  borderRadius: 16, padding: 18,
};

function ShareButtons({ kind, title, detail }) {
  const [msg, setMsg] = useState('');
  const share = async () => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const { text, url } = buildShareCopy(kind, title, detail, base);
    setMsg('');
    try {
      if (navigator.share) { await navigator.share({ title, text, url }); return; }
      throw new Error('no-share');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(text);
        setMsg('Copied — paste it anywhere.');
      } catch {
        setMsg('Copy this: ' + url);
      }
    }
  };
  const copy = async () => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const { text } = buildShareCopy(kind, title, detail, base);
    try { await navigator.clipboard.writeText(text); setMsg('Copied — paste it anywhere.'); }
    catch { setMsg('Copy failed — long-press to select.'); }
  };
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
      <button type="button" onClick={share} style={btn}>Multiply it ↗</button>
      <button type="button" onClick={copy} style={btn}>Copy the words</button>
      {msg && <span style={{ fontSize: 13, color: GOLD }}>{msg}</span>}
    </div>
  );
}

/* ---------------- THE FORGE chamber ---------------- */
function ForgeChamber() {
  const [commissions, setCommissions] = useState(null);
  const [name, setName] = useState('');
  const [concept, setConcept] = useState('');
  const [mythic, setMythic] = useState('');
  const [errors, setErrors] = useState([]);
  const [filter, setFilter] = useState('');

  useEffect(() => { setCommissions(loadJSON(COMMISSIONS_KEY, [])); }, []);
  const persist = (next) => { setCommissions(next); saveJSON(COMMISSIONS_KEY, next); };

  const submit = (e) => {
    e.preventDefault();
    const v = validateCommission({ name, concept, mythicName: mythic });
    setErrors(v.errors);
    if (!v.ok) return;
    const order = {
      id: makeId('commission'),
      name: name.trim(), concept: concept.trim(),
      mythicName: mythic.trim() || suggestMythicName(concept),
      stage: 'concept', createdAt: new Date().toISOString(),
    };
    persist([order, ...(commissions || [])]);
    setName(''); setConcept(''); setMythic(''); setErrors([]);
  };

  const advance = (id) => persist((commissions || []).map((c) =>
    c.id === id ? { ...c, stage: nextForgeStage(c.stage) } : c));
  const remove = (id) => persist((commissions || []).filter((c) => c.id !== id));

  const fleet = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return SATELLITES.filter((s) => !q || s.key.includes(q) || s.route.includes(q));
  }, [filter]);

  return (
    <div>
      <p style={{ color: '#d6d3d1', maxWidth: 640, lineHeight: 1.6 }}>
        The Forge builds pocket universes: concept, audit, strip, build, test, publish.
        Nothing ships with trackers, phone-homes, or junk. The fleet below is live —
        every satellite was forged this way.
      </p>

      <div style={{ ...card, marginTop: 18 }}>
        <Badge tone="gold" className="block">The live fleet</Badge>
        <div style={{ fontSize: 40, fontWeight: 800, color: '#fff7ed', margin: '6px 0' }}>
          {SATELLITES.length} <span style={{ fontSize: 18, fontWeight: 400, color: '#a8a29e' }}>pocket universes</span>
        </div>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search the fleet…"
          aria-label="Search the fleet" style={{ ...input, maxWidth: 340, marginBottom: 12 }} />
        <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 6 }}>
          {fleet.map((s) => (
            <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '8px 10px', background: '#0b0b0d', borderRadius: 8 }}>
              <span style={{ color: '#e7e5e4' }}>{s.key}</span>
              <span style={{ color: '#78716c' }}>{s.route} · {s.constellation}</span>
            </div>
          ))}
          {fleet.length === 0 && <div style={{ color: '#78716c', fontSize: 14 }}>No satellite matches.</div>}
        </div>
      </div>

      <div style={{ ...card, marginTop: 18 }}>
        <Badge tone="gold" className="block">Commission a universe</Badge>
        <p style={{ color: '#a8a29e', fontSize: 14, lineHeight: 1.6 }}>
          Name it, describe it, give it a mythic heart. Your commission is saved to your
          private planning board below — on this device only, it isn&apos;t sent anywhere.
        </p>
        <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Universe name" aria-label="Universe name" style={input} maxLength={60} />
          <textarea value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="The concept, in a sentence or two…" aria-label="Concept" rows={3} style={{ ...input, minHeight: 76, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input value={mythic} onChange={(e) => setMythic(e.target.value)} placeholder="Mythic name (optional)" aria-label="Mythic name" style={{ ...input, flex: '1 1 200px' }} maxLength={40} />
            <button type="button" style={btn} onClick={() => setMythic(suggestMythicName(concept || name || 'forge'))}>
              Suggest one
            </button>
          </div>
          {errors.length > 0 && (
            <ul style={{ color: '#fca5a5', fontSize: 14, margin: 0, paddingLeft: 20 }}>
              {errors.map((er, i) => <li key={i}>{er}</li>)}
            </ul>
          )}
          <button type="submit" style={btnPrimary}>Save it to my planning board</button>
        </form>
      </div>

      <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
        {(commissions || []).map((c) => (
          <div key={c.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#fff7ed' }}>{c.name}</span>
                {c.mythicName && <span style={{ color: GOLD, fontSize: 14 }}> · {c.mythicName}</span>}
              </div>
              <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: EMBER }}>
                {FORGE_STAGES.find((s) => s.id === c.stage)?.label}
              </span>
            </div>
            <p style={{ color: '#a8a29e', fontSize: 14, lineHeight: 1.6 }}>{c.concept}</p>
            <div style={{ display: 'flex', gap: 8, margin: '10px 0', flexWrap: 'wrap' }}>
              {FORGE_STAGES.map((s, i) => {
                const cur = FORGE_STAGE_IDS.indexOf(c.stage);
                const done = i < cur, isCur = i === cur;
                return (
                  <span key={s.id} title={s.blurb}
                    style={{ fontSize: 11, padding: '6px 10px', borderRadius: 24, minHeight: 28, display: 'inline-flex', alignItems: 'center',
                      background: done ? 'rgba(249,115,22,0.25)' : isCur ? 'rgba(249,115,22,0.12)' : '#121214',
                      border: isCur ? '1px solid #f97316' : '1px solid #3a2a18',
                      color: done || isCur ? '#fed7aa' : '#78716c' }}>
                    {done ? '✓ ' : ''}{s.label}
                  </span>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {c.stage !== 'publish' && <button type="button" style={btn} onClick={() => advance(c.id)}>Advance a stage</button>}
              <button type="button" style={{ ...btn, border: '1px solid #44403c', background: 'transparent', color: '#a8a29e' }} onClick={() => remove(c.id)}>Withdraw</button>
            </div>
            <ShareButtons kind="commission" title={c.name} detail={c.concept} />
          </div>
        ))}
        {commissions && commissions.length === 0 && (
          <p style={{ color: '#78716c', fontSize: 14 }}>No commissions yet. The forge is listening.</p>
        )}
      </div>
    </div>
  );
}

/* ---------------- THE FACTORY chamber ---------------- */
function FactoryChamber() {
  return (
    <div>
      <p style={{ color: '#d6d3d1', maxWidth: 640, lineHeight: 1.6 }}>
        The digital pays for physical. Money made in the digital world flows back into
        the factory — and the factory makes real things for real hands. This is the loop,
        running in the open.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginTop: 18 }}>
        {FACTORY_LOOP.map((s, i) => (
          <div key={s.id} style={{ ...card, position: 'relative' }}>
            <div style={{ fontSize: 12, color: EMBER, fontWeight: 700 }}>0{i + 1}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff7ed', margin: '4px 0' }}>{s.label}</div>
            <div style={{ fontSize: 13, color: '#a8a29e', lineHeight: 1.55 }}>{s.blurb}</div>
            {i < FACTORY_LOOP.length - 1 && (
              <div aria-hidden="true" style={{ position: 'absolute', right: -14, top: '50%', color: EMBER, fontSize: 20, zIndex: 1 }}>→</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ ...card, marginTop: 18 }}>
        <Badge tone="gold" className="block">Olympus Grand Multiverse Store</Badge>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#fff7ed', margin: '6px 0' }}>
          {OLYMPUS_FACTS.count} designs <span style={{ fontSize: 15, fontWeight: 400, color: '#a8a29e' }}>· CAD ${OLYMPUS_FACTS.priceCad.toFixed(2)} each</span>
        </div>
        <p style={{ color: '#a8a29e', fontSize: 14, lineHeight: 1.6 }}>
          {OLYMPUS_FACTS.note} Every sale is priced on the server — what you see is what you pay.
        </p>
        <div style={{ maxHeight: 240, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8, marginTop: 12 }}>
          {OLYMPUS_PRODUCTS.map((p) => (
            <div key={p.name} style={{ background: '#0b0b0d', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ color: '#e7e5e4', fontSize: 14, fontWeight: 600 }}>{p.name}</div>
              <div style={{ color: '#78716c', fontSize: 12 }}>{p.tag}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <a href={OLYMPUS_FACTS.route} style={{ ...btnPrimary, textDecoration: 'none' }}>Open the store</a>
        </div>
        <ShareButtons kind="product" title="Olympus store" detail={`${OLYMPUS_FACTS.count} designs, CAD $${OLYMPUS_FACTS.priceCad.toFixed(2)} each, made to order.`} />
      </div>

      <div style={{ ...card, marginTop: 18 }}>
        <Badge tone="gold" className="block">Luge · {LUGE_ARSENAL_FACTS.name}</Badge>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#fff7ed', margin: '6px 0' }}>
          ${LUGE_ARSENAL_FACTS.priceUsd} USD <span style={{ fontSize: 15, fontWeight: 400, color: '#a8a29e' }}>· {LUGE_ARSENAL_FACTS.premiumHulls} premium hulls</span>
        </div>
        <p style={{ color: '#a8a29e', fontSize: 14, lineHeight: 1.6 }}>
          The full arsenal of sleds, plus one hoodie claim per owner — verified on the server,
          one per person, no screenshots. The price is set on the server at checkout.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <a href={LUGE_ARSENAL_FACTS.route} style={{ ...btnPrimary, textDecoration: 'none' }}>Open Luge</a>
        </div>
        <ShareButtons kind="product" title={`Luge ${LUGE_ARSENAL_FACTS.name}`} detail={`$${LUGE_ARSENAL_FACTS.priceUsd} USD — ${LUGE_ARSENAL_FACTS.premiumHulls} premium hulls and a hoodie claim.`} />
      </div>

      <div style={{ ...card, marginTop: 18, border: '1px solid rgba(251,191,36,0.4)' }}>
        <Badge tone="gold" className="block">Why the factory exists</Badge>
        <p style={{ color: '#d6d3d1', fontSize: 15, lineHeight: 1.7, marginBottom: 0 }}>
          The factory arm exists for missions like <strong style={{ color: '#fff7ed' }}>ending homelessness</strong> —
          tensegrity housing that rides the wind like a spider web, raised above the flood line.
          Digital revenue today; shelter, tools, and real answers tomorrow. Poverty needs to end,
          and the factory is how the forge pays for it.
        </p>
      </div>
    </div>
  );
}

/* ---------------- THE FOUNDRY chamber ---------------- */
function FoundryChamber() {
  const [ideas, setIdeas] = useState(null);
  const [text, setText] = useState('');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    const stored = loadJSON(IDEAS_KEY, null);
    if (stored) setIdeas(stored);
    else { setIdeas(SEED_IDEAS); saveJSON(IDEAS_KEY, SEED_IDEAS); }
  }, []);
  const persist = (next) => { setIdeas(next); saveJSON(IDEAS_KEY, next); };

  const add = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    persist([{ id: makeId('idea'), text: t, detail: detail.trim(), stage: 'spark', origin: 'visitor', prime: false }, ...(ideas || [])]);
    setText(''); setDetail('');
  };
  const advance = (id) => persist((ideas || []).map((i) => i.id === id ? { ...i, stage: nextIdeaStage(i.stage) } : i));
  const remove = (id) => persist((ideas || []).filter((i) => i.id !== id));

  return (
    <div>
      <p style={{ color: '#d6d3d1', maxWidth: 640, lineHeight: 1.6 }}>
        The foundry is where raw thinking becomes shaped intent. Ideas enter as sparks,
        glow as embers, and leave forged. The seeds below are Artemis&rsquo;s own words —
        they were here before you arrived.
      </p>

      <div style={{ ...card, marginTop: 18 }}>
        <Badge tone="gold" className="block">Cast an idea</Badge>
        <form onSubmit={add} style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="The idea, in one line…" aria-label="Idea" style={input} maxLength={140} />
          <textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Shape it a little more (optional)…" aria-label="Idea detail" rows={2} style={{ ...input, minHeight: 60, resize: 'vertical' }} />
          <button type="submit" style={btnPrimary}>Throw it in the fire</button>
        </form>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, marginTop: 18, alignItems: 'start' }}>
        {IDEA_STAGES.map((stage) => (
          <div key={stage.id} style={{ ...card, minHeight: 200 }}>
            <Badge tone="gold" className="block">{stage.label}</Badge>
            <div style={{ fontSize: 12, color: '#78716c', marginBottom: 10 }}>{stage.blurb}</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {(ideas || []).filter((i) => i.stage === stage.id).map((i) => (
                <div key={i.id} style={{
                  background: i.prime ? 'rgba(249,115,22,0.10)' : '#0b0b0d',
                  border: i.prime ? '1px solid rgba(249,115,22,0.55)' : '1px solid #2a2118',
                  borderRadius: 10, padding: 12,
                }}>
                  {i.prime && <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: EMBER, marginBottom: 4 }}>Prime directive</div>}
                  <div style={{ color: '#fff7ed', fontSize: 15, fontWeight: 600, lineHeight: 1.45 }}>{i.text}</div>
                  {i.detail && <div style={{ color: '#a8a29e', fontSize: 13, lineHeight: 1.55, marginTop: 6 }}>{i.detail}</div>}
                  {i.origin === 'artemis' && !i.prime && <div style={{ fontSize: 11, color: '#78716c', marginTop: 6 }}>— Artemis</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {i.stage !== 'forged' && (
                      <button type="button" onClick={() => advance(i.id)} style={{ ...btn, minHeight: 40, fontSize: 13, padding: '0 12px' }}>
                        → {IDEA_STAGES[IDEA_STAGE_IDS.indexOf(i.stage) + 1].label}
                      </button>
                    )}
                    {i.origin !== 'artemis' && (
                      <button type="button" onClick={() => remove(i.id)} style={{ ...btn, minHeight: 40, fontSize: 13, padding: '0 12px', border: '1px solid #44403c', background: 'transparent', color: '#a8a29e' }}>
                        Remove
                      </button>
                    )}
                  </div>
                  <ShareButtons kind="idea" title={i.text} detail={i.detail} />
                </div>
              ))}
              {(ideas || []).filter((i) => i.stage === stage.id).length === 0 && (
                <div style={{ color: '#57534e', fontSize: 13 }}>Nothing here yet.</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- THE MULTIPLIER chamber ---------------- */
function MultiplierChamber() {
  const [ideas, setIdeas] = useState([]);
  const [commissions, setCommissions] = useState([]);
  useEffect(() => {
    setIdeas(loadJSON(IDEAS_KEY, SEED_IDEAS).filter((i) => i.prime || i.origin === 'artemis'));
    setCommissions(loadJSON(COMMISSIONS_KEY, []));
  }, []);
  const sparks = 1 + ideas.length + commissions.length + 2; // ideas + commissions + 2 products
  return (
    <div>
      <p style={{ color: '#d6d3d1', maxWidth: 640, lineHeight: 1.6 }}>
        One spark of logic, branching outward. Everything forged here carries multiply
        actions — take any of them and put it in front of people. That is the whole mission.
      </p>
      <div style={{ ...card, marginTop: 18, padding: 10 }}>
        <ReachCanvas sparkCount={sparks} />
        <div style={{ fontSize: 12, color: '#78716c', padding: '8px 10px 2px' }}>
          Illustrative reach map — shows how ideas could branch, not real visitors.
        </div>
      </div>
      <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
        {ideas.map((i) => (
          <div key={i.id} style={card}>
            <div style={{ color: '#fff7ed', fontWeight: 600, fontSize: 15 }}>
              {i.prime && <span style={{ color: EMBER, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, display: 'block', marginBottom: 4 }}>Prime directive</span>}
              {i.text}
            </div>
            <ShareButtons kind="idea" title={i.text} detail={i.detail} />
          </div>
        ))}
        {commissions.map((c) => (
          <div key={c.id} style={card}>
            <div style={{ color: '#fff7ed', fontWeight: 600, fontSize: 15 }}>{c.name}{c.mythicName ? ` · ${c.mythicName}` : ''}</div>
            <div style={{ color: '#a8a29e', fontSize: 13 }}>{c.concept}</div>
            <ShareButtons kind="commission" title={c.name} detail={c.concept} />
          </div>
        ))}
        <div style={card}>
          <div style={{ color: '#fff7ed', fontWeight: 600, fontSize: 15 }}>Olympus store — {OLYMPUS_FACTS.count} designs</div>
          <ShareButtons kind="product" title="Olympus store" detail={`${OLYMPUS_FACTS.count} designs, CAD $${OLYMPUS_FACTS.priceCad.toFixed(2)} each.`} />
        </div>
        <div style={card}>
          <div style={{ color: '#fff7ed', fontWeight: 600, fontSize: 15 }}>Luge {LUGE_ARSENAL_FACTS.name} — ${LUGE_ARSENAL_FACTS.priceUsd} USD</div>
          <ShareButtons kind="product" title={`Luge ${LUGE_ARSENAL_FACTS.name}`} detail={`${LUGE_ARSENAL_FACTS.premiumHulls} premium hulls and a hoodie claim.`} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- page ---------------- */
const CHAMBERS = [
  { id: 'forge', label: 'The Forge', blurb: 'Digital — where pocket universes are built' },
  { id: 'factory', label: 'The Factory', blurb: 'Physical — the digital pays for physical' },
  { id: 'foundry', label: 'The Foundry', blurb: 'Ideas — sparks, embers, forged intent' },
  { id: 'multiplier', label: 'The Multiplier', blurb: 'Reach — take the logic to the people' },
];

export default function HephaestusPage() {
  const [chamber, setChamber] = useState('forge');
  return (
    <main style={{ minHeight: '100dvh', background: '#050505', color: '#f5f5f4', fontFamily: 'system-ui, sans-serif' }}>
      <BackButton label="Launcher" />

      <header style={{ position: 'relative', overflow: 'hidden', padding: '56px 20px 64px', textAlign: 'center' }}>
        <EmberCanvas />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <Badge tone="gold" className="block">The forge of the empire</Badge>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(40px, 8vw, 72px)', margin: '10px 0', color: '#fff7ed', letterSpacing: 2 }}>
            HEPHAESTUS
          </h1>
          <p style={{ fontSize: 17, color: '#fed7aa', maxWidth: 620, margin: '0 auto', lineHeight: 1.6, fontStyle: 'italic' }}>
            &ldquo;Take my logic and make it multiply to as many people as possible.&rdquo;
          </p>
          <div style={{ display: 'inline-block', marginTop: 16, padding: '10px 20px', borderRadius: 9999,
            border: '1px solid rgba(249,115,22,0.6)', background: 'rgba(249,115,22,0.10)',
            color: '#fdba74', fontWeight: 700, letterSpacing: 1, fontSize: 14 }}>
            PRIME DIRECTIVE: POVERTY NEEDS TO END
          </div>
        </div>
      </header>

      <nav aria-label="Chambers" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, padding: '0 16px', maxWidth: 900, margin: '0 auto' }}>
        {CHAMBERS.map((c) => (
          <button key={c.id} type="button" onClick={() => setChamber(c.id)}
            aria-pressed={chamber === c.id}
            style={{ ...btn, flexDirection: 'column', gap: 2, padding: '10px 8px', minHeight: 60,
              background: chamber === c.id ? 'rgba(249,115,22,0.20)' : 'rgba(249,115,22,0.06)',
              border: chamber === c.id ? '1px solid #f97316' : '1px solid rgba(249,115,22,0.25)' }}>
            <span style={{ fontWeight: 700 }}>{c.label}</span>
            <span style={{ fontSize: 11, color: '#a8a29e', fontWeight: 400 }}>{c.blurb}</span>
          </button>
        ))}
      </nav>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 80px' }}>
        {chamber === 'forge' && <ForgeChamber />}
        {chamber === 'factory' && <FactoryChamber />}
        {chamber === 'foundry' && <FoundryChamber />}
        {chamber === 'multiplier' && <MultiplierChamber />}
      </section>

      <footer style={{ textAlign: 'center', padding: '0 16px 40px', color: '#57534e', fontSize: 13 }}>
        Forged by Artemis&rsquo;s forge · nothing leaves your device · the loop is the point
      </footer>
      <div aria-hidden="true" className="player-clear" />
    </main>
  );
}
