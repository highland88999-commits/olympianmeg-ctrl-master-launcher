"use client";

import { useEffect, useRef, useState } from "react";
import {
  mulberry32, depthForSlider, explorerZone, ISLAND,
  spawnBubble, stepBubbles, spawnFish, stepFish, SPECS,
} from "./engine";
import RenewalPlanBadge from "@/components/RenewalPlanBadge";

/**
 * Atlantis — the Olympus Anchor macro-engineering prospectus as an
 * interactive underwater blueprint. Hero canvas: procedural island
 * cross-section with animated light rays, bubbles, and a fish school.
 * Depth slider explores the structure; blueprint cards below.
 * Zero external requests.
 */
export default function AtlantisPage() {
  const canvasRef = useRef(null);
  const [depth, setDepth] = useState(0.25);
  const [playing, setPlaying] = useState(true);
  const [showRays, setShowRays] = useState(true);
  const [showFish, setShowFish] = useState(true);
  const [reduced, setReduced] = useState(false);

  // --- DIONYSUS interior treatment ---
  const AT_BG = "/images/atlantis/bg.webp";
  const AT_TILE = "/images/shared/ice-crystal-tile.webp";
  const AT_GLYPHS = {
    play: "M8 5v14l11-7z",
    pause: "M6 5h4v14H6zM14 5h4v14h-4z",
    rays: "M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8",
    fish: "M3 12c3-4.2 7.5-6 11.5-6 2.8 0 5 1.2 6.5 2.5L23 6l-1 6 1 6-2-2.5C19.5 16.8 17.3 18 14.5 18 10.5 18 6 16.2 3 12zm11.5-3.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z",
  };
  const AtIcon = ({ name, size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={name === "rays" ? "none" : "currentColor"} stroke={name === "rays" ? "currentColor" : "none"} strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={AT_GLYPHS[name]} />
    </svg>
  );
  const atCardTile = {
    backgroundImage: `url(${AT_TILE})`,
    backgroundSize: "128px 128px",
    backgroundBlendMode: "overlay",
  };

  useEffect(() => {
    document.title = "Atlantis";
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const playingRef = useRef(playing);
  const depthRef = useRef(depth);
  const raysRef = useRef(showRays);
  const fishRef = useRef(showFish);
  playingRef.current = playing;
  depthRef.current = depth;
  raysRef.current = showRays;
  fishRef.current = showFish;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = ISLAND.W;
    const H = 560;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rng = mulberry32(2026);
    const bubbles = [];
    for (let i = 0; i < 70; i++) bubbles.push(spawnBubble(rng, W, 0));
    const school = [];
    for (let i = 0; i < 14; i++) school.push(spawnFish(rng, W, ISLAND.sceneH, i));

    let last = performance.now();
    let raf = 0;
    let t = 0;

    function draw(now) {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (playingRef.current && !reduced) t += dt;

      const camY = depthForSlider(depthRef.current);
      const toY = (sceneY) => sceneY - camY + 100;

      // water gradient (darkens with depth)
      const mix = Math.min(1, depthRef.current * 1.1);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, mix < 0.4 ? "#0a3a60" : "#03141f");
      g.addColorStop(1, "#010609");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // light rays
      if (raysRef.current && !reduced && depthRef.current < 0.7) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.09 * (1 - depthRef.current);
        for (let i = 0; i < 5; i++) {
          const rx = (i * 0.21 + 0.06) * W + Math.sin(t * 0.4 + i * 2) * 24;
          const rg = ctx.createLinearGradient(rx, 0, rx + 60, H);
          rg.addColorStop(0, "rgba(140,230,255,0.7)");
          rg.addColorStop(1, "rgba(140,230,255,0)");
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.moveTo(rx, 0); ctx.lineTo(rx + 34, 0);
          ctx.lineTo(rx + 120, H); ctx.lineTo(rx + 86, H);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }

      const d = ISLAND.dome;
      const surfY = toY(ISLAND.surfaceY);

      // island body (cross-section)
      ctx.fillStyle = "#0e1c2a";
      ctx.beginPath();
      ctx.moveTo(120, surfY);
      ctx.quadraticCurveTo(200, surfY + 320, 340, surfY + 480);
      ctx.lineTo(620, surfY + 480);
      ctx.quadraticCurveTo(760, surfY + 320, 840, surfY);
      ctx.closePath();
      ctx.fill();
      // ballast keel
      ctx.fillStyle = "#12263a";
      ctx.beginPath();
      ctx.moveTo(380, surfY + 440);
      ctx.lineTo(580, surfY + 440);
      ctx.lineTo(520, surfY + 620);
      ctx.lineTo(440, surfY + 620);
      ctx.closePath();
      ctx.fill();
      // keel glow vents (localized)
      if (!reduced) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const vx of [440, 520]) {
          const vg = ctx.createRadialGradient(vx, surfY + 610, 0, vx, surfY + 610, 46);
          vg.addColorStop(0, "rgba(0,242,255,0.35)");
          vg.addColorStop(1, "rgba(0,242,255,0)");
          ctx.fillStyle = vg;
          ctx.beginPath(); ctx.arc(vx, surfY + 610, 46, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      // dome (arc over the island)
      const domeY = (sy) => toY(sy);
      ctx.save();
      ctx.strokeStyle = "rgba(0,212,255,0.85)";
      ctx.lineWidth = 3;
      ctx.shadowColor = "rgba(0,212,255,0.6)";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.ellipse(d.cx, domeY(d.cy), d.rx, d.ry, 0, Math.PI, 0);
      ctx.stroke();
      ctx.restore();
      // dome glass sheen
      ctx.fillStyle = "rgba(0,212,255,0.06)";
      ctx.beginPath();
      ctx.ellipse(d.cx, domeY(d.cy), d.rx, d.ry, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      // dome struts
      ctx.strokeStyle = "rgba(0,212,255,0.25)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i <= 8; i++) {
        const th = Math.PI + (i / 8) * Math.PI;
        const px = d.cx + d.rx * Math.cos(th);
        const py = domeY(d.cy - d.ry * Math.sin(th));
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(d.cx, domeY(d.cy) + 8);
        ctx.stroke();
      }
      // housing blocks inside dome
      ctx.fillStyle = "rgba(150,220,255,0.28)";
      for (let i = 0; i < 12; i++) {
        const bx = 240 + (i % 6) * 82;
        const by = domeY(d.cy) - 30 - Math.floor(i / 6) * 44;
        const bh = 22 + ((i * 37) % 24);
        ctx.fillRect(bx, by - bh, 46, bh);
      }
      // trees on the island
      for (let i = 0; i < 9; i++) {
        const tx = 200 + i * 72;
        const ty = surfY + 6;
        ctx.strokeStyle = "#3a2c1c";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - 26); ctx.stroke();
        ctx.fillStyle = i % 2 ? "rgba(0,200,120,0.5)" : "rgba(20,170,150,0.5)";
        ctx.beginPath(); ctx.arc(tx, ty - 34, 13, 0, Math.PI * 2); ctx.fill();
      }

      // surface line
      ctx.strokeStyle = "rgba(120,220,255,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const y = surfY + Math.sin(x * 0.05 + t * 1.6) * 3;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // thrusters (localized glows under hull)
      if (!reduced) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const [tx, off] of [[360, 0], [600, 1.7]]) {
          const pu = 0.5 + 0.5 * Math.sin(t * 3 + off);
          const pg = ctx.createRadialGradient(tx, surfY + 470, 0, tx, surfY + 470, 34);
          pg.addColorStop(0, `rgba(0,255,170,${0.28 * pu})`);
          pg.addColorStop(1, "rgba(0,255,170,0)");
          ctx.fillStyle = pg;
          ctx.beginPath(); ctx.arc(tx, surfY + 470, 34, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      // bubbles
      if (playingRef.current && !reduced) stepBubbles(bubbles, dt, 0, rng, W);
      ctx.fillStyle = "rgba(170,235,255,0.35)";
      for (const b of bubbles) {
        const by = b.y - camY * 0.15;
        if (by < -10 || by > H + 10) continue;
        ctx.beginPath(); ctx.arc(b.x + Math.sin(b.sway) * 8, by, b.r, 0, Math.PI * 2); ctx.fill();
      }

      // fish school
      if (fishRef.current) {
        if (playingRef.current && !reduced) stepFish(school, dt, W, ISLAND.sceneH, rng);
        for (const f of school) {
          const fy = f.y - camY;
          if (fy < -30 || fy > H + 30) continue;
          const wag = Math.sin(f.phase) * 0.5;
          ctx.save();
          ctx.translate(f.x, fy);
          ctx.scale(f.dir, 1);
          ctx.fillStyle = f.hue === "cyan" ? "rgba(0,220,255,0.75)" : "rgba(255,90,170,0.75)";
          ctx.beginPath();
          ctx.ellipse(0, 0, f.size, f.size * 0.42, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(-f.size * 0.8, 0);
          ctx.lineTo(-f.size * 1.5, -f.size * 0.5 + wag * 4);
          ctx.lineTo(-f.size * 1.5, f.size * 0.5 + wag * 4);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      // scanline vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <div style={styles.page}>
      {/* Ambient backdrop: fixed behind the scrolling page */}
      <div aria-hidden="true" style={{ position: "fixed", inset: 0, backgroundImage: `url(${AT_BG})`, backgroundSize: "cover", backgroundPosition: "center", opacity: 0.35, pointerEvents: "none", zIndex: 0 }} />
      <div aria-hidden="true" style={{ position: "fixed", inset: 0, background: "linear-gradient(rgba(2,8,19,0.55), rgba(2,8,19,0.75))", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ ...styles.wrap, position: "relative", zIndex: 1 }}>
        <header style={styles.head}>
          <h1 style={styles.title}>SUNKEN CITY</h1>
          <p style={styles.tag}>Olympus Anchor · 5-Kilometer Macro-Engineering Prospectus</p>
          <div style={{ marginTop: 8 }}><RenewalPlanBadge nodeId="node-7" /></div>
        </header>

        <div style={styles.heroFrame}>
          <div style={styles.liveBadge}><span style={styles.dot} />SIMULATION FEED // ACTIVE</div>
          <canvas ref={canvasRef} style={styles.canvas} aria-label="Atlantis island cross-section simulation" />
          <div style={styles.depthBar}>
            <div style={styles.depthRead}>
              <span style={styles.depthLabel}>DEPTH EXPLORER</span>
              <span style={styles.depthZone}>{explorerZone(depthForSlider(depth))}</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.01} value={depth}
              onChange={(e) => setDepth(parseFloat(e.target.value))}
              style={styles.slider} aria-label="Depth explorer"
            />
          </div>
        </div>

        <div style={{ ...styles.controls, display: "flex" }}>
          <button onClick={() => setPlaying(!playing)} style={{ ...styles.btn, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <AtIcon name={playing ? "pause" : "play"} />
            {playing ? "PAUSE FEED" : "RESUME FEED"}
          </button>
          <button onClick={() => setShowRays(!showRays)} style={{ ...styles.btn, ...(showRays ? styles.btnOn : {}), display: "inline-flex", alignItems: "center", gap: 8 }}>
            <AtIcon name="rays" />
            LIGHT RAYS
          </button>
          <button onClick={() => setShowFish(!showFish)} style={{ ...styles.btn, ...(showFish ? styles.btnOn : {}), display: "inline-flex", alignItems: "center", gap: 8 }}>
            <AtIcon name="fish" size={17} />
            FISH SCHOOL
          </button>
        </div>

        <p style={styles.lede}>
          The evolution of the Olympus Anchor to a <strong style={{ color: "#00d4ff" }}>5-kilometer diameter</strong> represents
          a monumental leap in marine architecture. To guarantee absolute structural resilience, the island is engineered to
          survive a catastrophic 360-degree oceanic roll — the internal biosphere operating with the airtight precision of
          a deep-sea spacecraft.
        </p>

        <div style={styles.grid}>
          {SPECS.map((s) => (
            <section key={s.id} style={{ ...styles.card, ...atCardTile }}>
              <h3 style={styles.cardTitle}><span style={styles.cardNo}>{s.no}</span>{s.title}</h3>
              {s.rows && (
                <table style={styles.table}>
                  <tbody>
                    {s.rows.map(([k, v]) => (
                      <tr key={k}><td style={styles.tdK}>{k}</td><td style={styles.tdV}>{v}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              {s.points && (
                <ul style={styles.list}>
                  {s.points.map((p, i) => <li key={i} style={styles.li}>{p}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>

        <footer style={styles.foot}>Olympus Nexus // Macro-Engineering Division // 2026</footer>
        <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100dvh", background: "#020813", color: "#e0f2fe", fontFamily: "ui-monospace, Menlo, monospace", padding: "24px 12px 48px" },
  wrap: { maxWidth: 1080, margin: "0 auto" },
  head: { textAlign: "center", marginBottom: 20 },
  title: { fontSize: "clamp(2.2rem, 8vw, 4rem)", letterSpacing: 12, color: "#00d4ff", textShadow: "0 0 18px rgba(0,212,255,0.7)", margin: "0 0 6px" },
  tag: { color: "#ff6fa5", letterSpacing: 4, textTransform: "uppercase", fontSize: "0.8rem", margin: 0 },
  heroFrame: { position: "relative", border: "1px solid rgba(0,212,255,0.4)", borderRadius: 12, overflow: "hidden", boxShadow: "0 0 30px rgba(0,212,255,0.15)" },
  liveBadge: { position: "absolute", top: 12, left: 12, zIndex: 2, display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(0,212,255,0.3)", borderRadius: 6, padding: "6px 12px", color: "#00d4ff", fontSize: "0.7rem", letterSpacing: 2 },
  dot: { width: 8, height: 8, borderRadius: "50%", background: "#ff3344", boxShadow: "0 0 8px #ff3344" },
  canvas: { display: "block", width: "100%", height: "auto", aspectRatio: "960 / 560" },
  depthBar: { padding: "12px 16px 16px", background: "rgba(2,10,18,0.9)", borderTop: "1px solid rgba(0,212,255,0.2)" },
  depthRead: { display: "flex", justifyContent: "space-between", marginBottom: 8 },
  depthLabel: { color: "rgba(0,212,255,0.7)", fontSize: "0.7rem", letterSpacing: 3 },
  depthZone: { color: "#00ff9f", fontSize: "0.75rem", letterSpacing: 2 },
  slider: { width: "100%", accentColor: "#00d4ff" },
  controls: { display: "flex", gap: 10, flexWrap: "wrap", margin: "16px 0" },
  btn: { padding: "10px 16px", fontSize: "0.75rem", cursor: "pointer", background: "transparent", color: "#9fdcff", border: "1px solid rgba(0,212,255,0.35)", letterSpacing: 2, borderRadius: 6, fontFamily: "inherit" },
  btnOn: { color: "#00d4ff", borderColor: "#00d4ff", background: "rgba(0,212,255,0.1)" },
  lede: { maxWidth: 760, margin: "28px auto", textAlign: "center", lineHeight: 1.8, color: "#bfe3ff", fontSize: "1.05rem" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 },
  card: { background: "linear-gradient(180deg, rgba(6,20,38,0.75), rgba(2,8,15,0.85))", border: "1px solid rgba(0,255,159,0.2)", borderTop: "3px solid #00ff9f", borderRadius: 12, padding: 24 },
  cardTitle: { color: "#00d4ff", fontSize: "1.1rem", letterSpacing: 1, margin: "0 0 16px", borderBottom: "1px solid rgba(0,212,255,0.15)", paddingBottom: 10 },
  cardNo: { color: "#ff6fa5", marginRight: 10, fontSize: "0.85rem" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" },
  tdK: { padding: "8px 10px 8px 0", color: "#00d4ff", fontWeight: 600, verticalAlign: "top", borderBottom: "1px solid rgba(255,255,255,0.08)", width: "38%" },
  tdV: { padding: "8px 0", color: "#d7e8f5", borderBottom: "1px solid rgba(255,255,255,0.08)" },
  list: { margin: 0, paddingLeft: 18, color: "#d7e8f5", fontSize: "0.9rem", lineHeight: 1.7 },
  li: { marginBottom: 8 },
  foot: { textAlign: "center", color: "rgba(160,190,210,0.5)", fontSize: "0.75rem", letterSpacing: 3, marginTop: 44, textTransform: "uppercase" },
};
