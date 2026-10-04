"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { IcEye, IcTarget, IcRefresh, IcFlame, IcFan } from "@/app/artemis-ui/icons";
import {
  waggleEncode,
  waggleDecode,
  FLOWERS,
  scoreDecode,
  BAND_LO,
  BAND_HI,
  WEATHER_EVENTS,
  thermoStep,
  inBand,
  pickWeather,
} from "./engine";

/**
 * Apis Nexus — cybernetic bee ecology.
 * Rebuilt from the source: hand-rolled CSS (no CDN utility framework),
 * procedural honeycomb canvas (no external assets), the three real
 * bee-ecology lessons, plus two interactive labs: a waggle-dance decoder
 * and a hive-thermostat simulator. Stripped: CDN stylesheets, external
 * affiliate product links, and the supply-depot link farm.
 */

const FACTS = [
  {
    tag: "// MATRIX DANCE",
    title: "The Waggle Algorithm",
    body: "Foraging bees communicate with a geometric dance: the angle of the waggle run, measured against the sun's position, encodes the direction of flowers, while the duration of the run encodes the distance. Try decoding one in the Waggle Lab below.",
    status: "VERIFIED BIOMODULE",
  },
  {
    tag: "// THERMAL ARRAYS",
    title: "Climate Control Matrix",
    body: "The brood nest is held between 32°C and 35°C. Against the cold, bees flex their flight muscles without moving their wings to generate heat; against heat, they spread water and fan to drive evaporative cooling. Run the shift yourself in the Thermostat Sim.",
    status: "CRITICAL INFRASTRUCTURE",
  },
  {
    tag: "// MESH ARCHITECTURE",
    title: "The Superorganism Network",
    body: "A colony is a decentralized superorganism. No single bee issues orders — tens of thousands of individuals process local inputs and collectively execute foraging, defense, and construction. The hive mind is an emergent protocol.",
    status: "DECENTRALIZED MESH NETWORK",
  },
];

export default function BeekeeperPage() {
  const bgRef = useRef(null);
  const labRef = useRef(null);
  const [labMode, setLabMode] = useState("demo"); // demo | decode
  const [danceInfo, setDanceInfo] = useState(null);
  const [score, setScore] = useState({ rounds: 0, points: 0, last: null });
  const [temp, setTemp] = useState(33.5);
  const [wx, setWx] = useState(WEATHER_EVENTS[0]);
  const [heater, setHeater] = useState(false);
  const [fan, setFan] = useState(false);
  const [stats, setStats] = useState({ inBand: 0, total: 0 });
  const lab = useRef({ dance: null, target: null, reduced: false, flowers: FLOWERS });
  const thermo = useRef({ temp: 33.5, heater: false, fan: false, wx: WEATHER_EVENTS[0], inBand: 0, total: 0 });

  useEffect(() => {
    document.title = "Apis Nexus";
    lab.current.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // ---------- honeycomb background ----------
  useEffect(() => {
    const canvas = bgRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let W = 0;
    let H = 0;
    const stars = [];
    const nodes = [];
    const mouse = { x: null, y: null };
    const HEX_R = 46;

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      stars.length = 0;
      for (let i = 0; i < 130; i++)
        stars.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.4 + 0.4, v: Math.random() * 0.35 + 0.1, c: Math.random() > 0.5 ? "#ff007f" : "#00f0ff", a: Math.random() * 0.6 + 0.2 });
      buildHive();
    };

    const buildHive = () => {
      nodes.length = 0;
      const cx = W / 2;
      const cy = H / 2;
      for (let r = -4; r <= 4; r++) {
        for (let c = -5; c <= 5; c++) {
          const x = cx + c * HEX_R * 1.5;
          const y = cy + r * HEX_R * Math.sqrt(3) + (c % 2 ? (HEX_R * Math.sqrt(3)) / 2 : 0);
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i;
            const vx = x + HEX_R * Math.cos(a);
            const vy = y + HEX_R * Math.sin(a);
            if (!nodes.some((n) => Math.hypot(n.bx - vx, n.by - vy) < 6))
              nodes.push({ bx: vx, by: vy, x: vx + (Math.random() - 0.5) * 260, y: vy + (Math.random() - 0.5) * 260, a: Math.random() * Math.PI * 2, sp: Math.random() * 0.02 + 0.005, b: Math.random() * 6 });
          }
        }
      }
    };

    const onMouse = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouse);
    resize();

    const draw = () => {
      ctx.fillStyle = "#05050a";
      ctx.fillRect(0, 0, W, H);
      for (const s of stars) {
        s.y += s.v;
        if (s.y > H) s.y = 0;
        ctx.globalAlpha = s.a;
        ctx.fillStyle = s.c;
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }
      ctx.globalAlpha = 1;
      // links
      ctx.strokeStyle = "#00f0ff";
      ctx.lineWidth = 0.6;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
          if (d < HEX_R + 6) {
            ctx.globalAlpha = 0.12 * (1 - d / (HEX_R + 6));
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      for (const n of nodes) {
        n.x += (n.bx - n.x) * 0.04;
        n.y += (n.by - n.y) * 0.04;
        n.a += n.sp;
        n.x += Math.sin(n.a) * 0.15;
        n.y += Math.cos(n.a) * 0.15;
        n.b += 0.03;
        if (mouse.x !== null) {
          const dx = n.x - mouse.x;
          const dy = n.y - mouse.y;
          const d = Math.hypot(dx, dy);
          if (d < 130 && d > 1) {
            n.x += (dx / d) * ((130 - d) / 130) * 5;
            n.y += (dy / d) * ((130 - d) / 130) * 5;
          }
        }
        ctx.globalAlpha = Math.max(0.12, 0.3 + Math.sin(n.b) * 0.35);
        ctx.fillStyle = "#ff007f";
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#ff007f";
        ctx.beginPath();
        ctx.arc(n.x, n.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
    };
  }, []);

  // ---------- waggle lab ----------
  const startDance = useCallback((flower) => {
    const enc = waggleEncode(flower.angleDeg, flower.distanceM);
    lab.current.dance = { flower, enc, t0: performance.now(), done: false };
    const dec = waggleDecode(enc.waggleAngleDeg, enc.waggleDurationMs);
    setDanceInfo({ flower, enc, dec });
  }, []);

  const startChallenge = useCallback(() => {
    const f = FLOWERS[Math.floor(Math.random() * FLOWERS.length)];
    lab.current.target = f;
    setDanceInfo(null);
    startDance(f);
  }, [startDance]);

  useEffect(() => {
    const canvas = labRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const L = lab.current;
    let raf = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(280, r.width) * dpr;
      canvas.height = 380 * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const geom = () => {
      const w = canvas.clientWidth;
      const h = 380;
      const cx = w / 2;
      const cy = h / 2 + 20;
      const maxD = Math.max(...FLOWERS.map((f) => f.distanceM));
      const R = Math.min(w, h) / 2 - 44;
      return { w, h, cx, cy, R, maxD };
    };

    const flowerPos = (f, g) => {
      const a = (f.angleDeg * Math.PI) / 180;
      const r = 40 + (f.distanceM / g.maxD) * (g.R - 40);
      return { x: g.cx + Math.sin(a) * r, y: g.cy - Math.cos(a) * r };
    };

    const onClick = (e) => {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const g = geom();
      for (const f of FLOWERS) {
        const p = flowerPos(f, g);
        if (Math.hypot(p.x - mx, p.y - my) < 26) {
          if (labMode === "demo") {
            startDance(f);
          } else if (L.dance?.done && L.target) {
            const pts = scoreDecode(L.target, f.angleDeg, f.distanceM);
            setScore((s) => ({
              rounds: s.rounds + 1,
              points: s.points + pts,
              last: { guess: f.name, actual: L.target.name, pts, perfect: f.id === L.target.id },
            }));
            L.target = null;
          }
          break;
        }
      }
    };
    canvas.addEventListener("click", onClick);

    const drawBee = (x, y, ang, flap) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      // wings
      ctx.fillStyle = "rgba(200,230,255,0.55)";
      const wob = Math.sin(flap) * 0.5;
      ctx.save();
      ctx.rotate(-0.5 - wob);
      ctx.beginPath();
      ctx.ellipse(-2, -7, 7, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.rotate(0.5 + wob);
      ctx.beginPath();
      ctx.ellipse(-2, 7, 7, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // body
      ctx.fillStyle = "#f5a623";
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(-3, -5.5, 3, 11);
      ctx.fillRect(3, -5.5, 2, 11);
      ctx.restore();
    };

    const draw = (now) => {
      const g = geom();
      const w = g.w;
      const h = g.h;
      ctx.fillStyle = "rgba(3,6,12,0.92)";
      ctx.fillRect(0, 0, w, h);

      // sun marker
      ctx.fillStyle = "#ffd94d";
      ctx.shadowColor = "#ffd94d";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(g.cx, 26, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffd94d";
      ctx.font = "10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("SUN", g.cx, 52);

      // hive
      ctx.strokeStyle = "#ff007f";
      ctx.lineWidth = 2;
      const hr = 22;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        const px = g.cx + hr * Math.cos(a);
        const py = g.cy + hr * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = "#ff007f";
      ctx.font = "9px system-ui";
      ctx.fillText("HIVE", g.cx, g.cy + 34);

      // flowers
      ctx.textAlign = "center";
      for (const f of FLOWERS) {
        const p = flowerPos(f, g);
        const isTarget = labMode === "decode" && L.dance && !L.dance.done;
        ctx.fillStyle = isTarget ? "#3a2b12" : "#2f9e44";
        ctx.strokeStyle = isTarget ? "#3a2b12" : "#51cf66";
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(p.x + Math.cos(a) * 7, p.y + Math.sin(a) * 7, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#ffd43b";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(232,246,255,0.75)";
        ctx.font = "9px system-ui";
        ctx.fillText(f.name.toUpperCase(), p.x, p.y + 24);
      }

      // dance animation
      const d = L.dance;
      if (d) {
        const elapsed = now - d.t0;
        const waggleMs = L.reduced ? 0 : d.enc.waggleDurationMs;
        const a = (d.enc.waggleAngleDeg * Math.PI) / 180;
        const dx = Math.sin(a);
        const dy = -Math.cos(a);
        const runLen = 54;
        if (elapsed < waggleMs && waggleMs > 0) {
          const p = elapsed / waggleMs;
          const along = Math.sin(p * Math.PI) * runLen;
          const perp = Math.sin(p * Math.PI * 10) * 6;
          const bx = g.cx + dx * along - dy * perp;
          const by = g.cy + dy * along + dx * perp;
          // trail
          ctx.strokeStyle = "rgba(0,240,255,0.5)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(g.cx, g.cy);
          ctx.lineTo(g.cx + dx * runLen, g.cy + dy * runLen);
          ctx.stroke();
          drawBee(bx, by, Math.atan2(dy, dx), now / 40);
        } else {
          // return loop
          const rt = Math.min(1, (elapsed - waggleMs) / 600);
          const ex = g.cx + dx * runLen;
          const ey = g.cy + dy * runLen;
          const mx = (ex + g.cx) / 2 - dy * 40;
          const my = (ey + g.cy) / 2 + dx * 40;
          const bx = (1 - rt) * (1 - rt) * ex + 2 * (1 - rt) * rt * mx + rt * rt * g.cx;
          const by = (1 - rt) * (1 - rt) * ey + 2 * (1 - rt) * rt * my + rt * rt * g.cy;
          drawBee(bx, by, Math.atan2(by - g.cy, bx - g.cx) || 0, now / 40);
          if (rt >= 1 && !d.done) {
            d.done = true;
            if (labMode === "decode") setDanceInfo({ challenge: true, enc: d.enc });
          }
        }
      } else {
        drawBee(g.cx, g.cy - 0, 0, now / 60);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("click", onClick);
    };
  }, [labMode, startDance]);

  // ---------- thermostat sim ----------
  useEffect(() => {
    const id = setInterval(() => {
      const t = thermo.current;
      t.temp = thermoStep(t.temp, { heater: t.heater, fan: t.fan }, t.wx.ambient, 0.25);
      t.total += 0.25;
      if (inBand(t.temp)) t.inBand += 0.25;
      setTemp(t.temp);
      setStats({ inBand: t.inBand, total: t.total });
      // new weather every ~25s
      if (Math.floor(t.total) % 25 === 0 && Math.floor((t.total - 0.25)) % 25 !== 0) {
        const w = pickWeather();
        t.wx = w;
        setWx(w);
      }
    }, 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    thermo.current.heater = heater;
    thermo.current.fan = fan;
  }, [heater, fan]);

  const resetThermo = () => {
    thermo.current = { temp: 33.5, heater: false, fan: false, wx: pickWeather(), inBand: 0, total: 0 };
    setHeater(false);
    setFan(false);
    setWx(thermo.current.wx);
    setTemp(33.5);
    setStats({ inBand: 0, total: 0 });
  };

  const bandPct = Math.min(100, Math.max(0, ((temp - 12) / (45 - 12)) * 100));
  const loPct = ((BAND_LO - 12) / 33) * 100;
  const hiPct = ((BAND_HI - 12) / 33) * 100;

  return (
    <div style={{ position: "relative", color: "#e8f6ff", fontFamily: "'Courier New', monospace" }}>
      <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: -2, pointerEvents: "none", opacity: 0.5,
        backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.7)), url(/images/beekeeper/bg.webp)",
        backgroundSize: "cover", backgroundPosition: "center" }} />
      <canvas ref={bgRef} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: -1, pointerEvents: "none" }} aria-hidden="true" />
      <style>{`
        .bk-wrap{max-width:1060px;margin:0 auto;padding:0 20px 80px;position:relative;z-index:1}
        .bk-hero{min-height:72vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
        .bk-tag{display:inline-block;padding:6px 14px;margin-bottom:22px;border:1px solid rgba(0,240,255,.4);color:#00f0ff;font-size:.7rem;letter-spacing:3px;background:rgba(0,240,255,.06)}
        .bk-hero h1{font-size:clamp(2rem,7vw,4.2rem);margin:0 0 14px;letter-spacing:2px;color:#fff}
        .bk-hero h1 span{color:#ff007f;text-shadow:0 0 18px rgba(255,0,127,.7)}
        .bk-hero p{max-width:620px;color:#9fb3c8;font-size:.9rem;line-height:1.7}
        .bk-sec{margin:70px 0}
        .bk-sechead{border-left:4px solid #00f0ff;padding-left:14px;margin-bottom:26px}
        .bk-sechead.pink{border-color:#ff007f}
        .bk-sechead h2{margin:0;font-size:1.3rem;letter-spacing:2px;color:#fff}
        .bk-sechead p{margin:4px 0 0;font-size:.7rem;letter-spacing:2px;color:#00f0ff}
        .bk-sechead.pink p{color:#ff007f}
        .bk-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}
        .bk-card{background-image:linear-gradient(rgba(5,5,10,.72), rgba(5,5,10,.72)), url(/images/beekeeper/tile.webp);background-size:auto,170px;border:1px solid rgba(255,0,127,.25);padding:26px;backdrop-filter:blur(10px);display:flex;flex-direction:column}
        .bk-card:hover{border-color:rgba(0,240,255,.6)}
        .bk-card .tag{color:#ff007f;font-weight:bold;font-size:.68rem;letter-spacing:2px;margin-bottom:12px}
        .bk-card h3{margin:0 0 10px;color:#fff;font-size:1.02rem}
        .bk-card p{color:#9fb3c8;font-size:.82rem;line-height:1.65;flex:1}
        .bk-card .st{margin-top:16px;padding-top:12px;border-top:1px solid #1c2733;font-size:.65rem;color:rgba(0,240,255,.6);letter-spacing:1px}
        .bk-lab{background-image:linear-gradient(rgba(3,6,12,.85), rgba(3,6,12,.85)), url(/images/beekeeper/tile.webp);background-size:auto,170px;border:1px solid rgba(0,240,255,.3);border-radius:10px;padding:20px}
        .bk-lab canvas{width:100%;height:380px;display:block;border-radius:6px;cursor:pointer;touch-action:manipulation}
        .bk-tabs{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}
        .bk-btn{background:transparent;border:1px solid #00f0ff;color:#00f0ff;padding:12px 20px;cursor:pointer;
          font-family:inherit;font-size:.72rem;letter-spacing:2px;min-height:44px;border-radius:6px;
          display:inline-flex;align-items:center;justify-content:center;gap:8px}
        .bk-btn:hover{background:#00f0ff;color:#000}
        .bk-btn.on{background:#00f0ff;color:#000}
        .bk-btn.pink{border-color:#ff007f;color:#ff007f}
        .bk-btn.pink:hover,.bk-btn.pink.on{background:#ff007f;color:#fff}
        .bk-readout{margin-top:14px;font-size:.78rem;line-height:1.9;color:#9fd8ff}
        .bk-readout b{color:#ffd94d}
        .bk-thermo{display:grid;grid-template-columns:1fr;gap:18px}
        @media(min-width:720px){.bk-thermo{grid-template-columns:120px 1fr}}
        .bk-gauge{position:relative;height:280px;background:#071018;border:1px solid rgba(0,240,255,.35);border-radius:8px;overflow:hidden}
        .bk-band{position:absolute;left:0;right:0;background:rgba(0,255,136,.18);border-top:1px solid #00ff88;border-bottom:1px solid #00ff88}
        .bk-merc{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(180deg,#ff9f43,#ff007f);transition:height .25s}
        .bk-tlabel{position:absolute;left:8px;font-size:.62rem;color:#9fd8ff}
        .bk-ctl{background-image:linear-gradient(rgba(3,6,12,.85), rgba(3,6,12,.85)), url(/images/beekeeper/tile.webp);background-size:auto,170px;border:1px solid rgba(255,0,127,.3);border-radius:10px;padding:20px}
        .bk-wx{font-size:.8rem;letter-spacing:2px;color:#ffd94d;margin-bottom:6px}
        .bk-wxd{font-size:.75rem;color:#9fb3c8;margin-bottom:16px}
        .bk-toggles{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}
        .bk-big{font-size:2rem;color:#fff;margin:6px 0}
        .bk-big small{font-size:.8rem;color:#9fb3c8}
        .bk-foot{text-align:center;font-size:.68rem;color:#5b6b7d;margin-top:60px;letter-spacing:1px}
      `}</style>

      <div className="bk-wrap">
        <section className="bk-hero">
          <div className="bk-tag">ENVIRONMENTAL DATA NODE · ACTIVATED</div>
          <h1>THE CYBER-ECOLOGY OF<br /><span>THE HONEY BEE</span></h1>
          <p>Explore the biological algorithms, decentralized architecture, and systemic importance of Earth's foundational pollinators. Scroll down to decode the hive mind — then run the labs.</p>
        </section>

        <section className="bk-sec">
          <div className="bk-sechead">
            <h2>DECODED DATA STREAMS</h2>
            <p>BIOLOGICAL ARCHITECTURE &amp; NETWORK INTELLIGENCE</p>
          </div>
          <div className="bk-grid">
            {FACTS.map((f) => (
              <div className="bk-card" key={f.title}>
                <div className="tag">{f.tag}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
                <div className="st">STATUS: {f.status}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="bk-sec">
          <div className="bk-sechead pink">
            <h2>WAGGLE LAB</h2>
            <p>INTERACTIVE DANCE DECODER</p>
          </div>
          <div className="bk-lab">
            <div className="bk-tabs" role="tablist" aria-label="Lab mode">
              <button className={`bk-btn ${labMode === "demo" ? "on" : ""}`} onClick={() => { setLabMode("demo"); lab.current.target = null; lab.current.dance = null; setDanceInfo(null); }}><IcEye /><span>DEMONSTRATE</span></button>
              <button className={`bk-btn ${labMode === "decode" ? "on" : ""}`} onClick={() => { setLabMode("decode"); setScore({ rounds: 0, points: 0, last: null }); startChallenge(); }}><IcTarget /><span>DECODE CHALLENGE</span></button>
              {labMode === "decode" && <button className="bk-btn pink" onClick={startChallenge}><IcRefresh /><span>NEW DANCE</span></button>}
            </div>
            <canvas ref={labRef} aria-label="Waggle dance laboratory" />
            <div className="bk-readout" aria-live="polite">
              {labMode === "demo" && !danceInfo && "Click a flower — the forager will dance its location, and the readout decodes the vector."}
              {labMode === "demo" && danceInfo && !danceInfo.challenge && (
                <span>
                  <b>{danceInfo.flower.name}</b> — waggle angle <b>{danceInfo.enc.waggleAngleDeg}°</b> from sun, run duration <b>{danceInfo.enc.waggleDurationMs} ms</b> → decoded bearing <b>{danceInfo.dec.angleDeg}°</b>, distance <b>{danceInfo.dec.distanceM} m</b> (true: {danceInfo.flower.distanceM} m).
                </span>
              )}
              {labMode === "decode" && !danceInfo?.challenge && "Watch the dance, then click the flower you think it points to."}
              {labMode === "decode" && danceInfo?.challenge && "Dance complete — click the flower it described."}
              {labMode === "decode" && score.last && (
                <span><br />You guessed <b>{score.last.guess}</b> — actual <b>{score.last.actual}</b> · +{score.last.pts} pts {score.last.perfect ? "· PERFECT" : ""}</span>
              )}
              {labMode === "decode" && score.rounds > 0 && (
                <span><br />SCORE: <b>{score.points}</b> over {score.rounds} round{score.rounds === 1 ? "" : "s"}</span>
              )}
            </div>
          </div>
        </section>

        <section className="bk-sec">
          <div className="bk-sechead">
            <h2>HIVE THERMOSTAT</h2>
            <p>BROOD-NEST CLIMATE SHIFT · HOLD 32–35°C</p>
          </div>
          <div className="bk-thermo">
            <div className="bk-gauge" aria-label={`Brood temperature ${temp.toFixed(1)} degrees`}>
              <div className="bk-band" style={{ bottom: `${loPct}%`, height: `${hiPct - loPct}%` }} />
              <div className="bk-merc" style={{ height: `${bandPct}%` }} />
              <div className="bk-tlabel" style={{ bottom: "4px" }}>12°</div>
              <div className="bk-tlabel" style={{ top: "4px" }}>45°</div>
            </div>
            <div className="bk-ctl">
              <div className="bk-big">{temp.toFixed(1)}°C <small>{inBand(temp) ? "· IN BAND" : "· OUT OF BAND"}</small></div>
              <div className="bk-wx">{wx.name}</div>
              <div className="bk-wxd">{wx.desc} · ambient {wx.ambient}°C</div>
              <div className="bk-toggles">
                <button className={`bk-btn pink ${heater ? "on" : ""}`} onClick={() => setHeater((h) => !h)} aria-pressed={heater}>
                  <IcFlame /><span>{heater ? "HEATER ON" : "HEATER OFF"} · +3.2°/s</span>
                </button>
                <button className={`bk-btn ${fan ? "on" : ""}`} onClick={() => setFan((f) => !f)} aria-pressed={fan}>
                  <IcFan /><span>{fan ? "FAN ON" : "FAN OFF"} · −3.8°/s</span>
                </button>
                <button className="bk-btn" onClick={resetThermo}><IcRefresh /><span>RESET SHIFT</span></button>
              </div>
              <div className="bk-readout">
                Time in band: <b>{stats.inBand.toFixed(0)}s</b> / {stats.total.toFixed(0)}s
                {stats.total > 0 && <> · <b>{Math.round((stats.inBand / stats.total) * 100)}%</b> stability</>}
              </div>
            </div>
          </div>
        </section>

        <footer className="bk-foot">APIS · NEXUS · DECENTRALIZED ECOLOGICAL PROTOCOL · ALL SIMULATION LOCAL</footer>
        <div aria-hidden="true" className="player-clear" />
      </div>
    </div>
  );
}
