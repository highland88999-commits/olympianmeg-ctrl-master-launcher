'use client';

// PROJECT KHAOS — tier sanctum + auction floor.
// Four demo access tiers (Bronze, Platinum, Gold, Diamond), each with its own
// procedural full-bleed simulation chamber and a 9-lot simulated auction
// (bid increments, countdowns, buy-now, rival bidders, sold overlays,
// auto-relisted lots). The source's hotlinked videos are replaced by
// hand-rolled canvas simulations and procedural SVG card art; the remote
// iframe and telemetry are gone. Everything is a simulation demo —
// demo credits only, nothing is sold for real money or gated.

import { useEffect, useRef, useState } from "react";
import {
  TIERS,
  COMPARISON,
  tierById,
  nextTier,
  prevTier,
  createLots,
  cloneLot,
  tickLots,
  rivalBidStep,
  placeBid,
  buyNow,
  minBid,
  formatClock,
  mulberry32,
} from "./khaos.js";

const TAU = Math.PI * 2;

// Deterministic procedural card art from a lot's artSeed — tier-colored
// geometric sigil, no images, no network.
function LotArt({ seed, color }) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const spikes = 5 + Math.floor(rnd() * 5);
  const rot = rnd() * 360;
  const rings = [];
  for (let i = 0; i < 3; i++) {
    rings.push(14 + rnd() * 26 + i * 12);
  }
  const pts = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * 360;
    const r = i % 2 === 0 ? 34 : 16 + rnd() * 8;
    pts.push(`${50 + r * Math.cos((a * Math.PI) / 180)},${50 + r * Math.sin((a * Math.PI) / 180)}`);
  }
  return (
    <svg viewBox="0 0 100 100" style={{ width: "100%", height: 84, display: "block" }}>
      <rect x="0" y="0" width="100" height="100" fill="#050508" />
      {rings.map((r, i) => (
        <circle
          key={i}
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeOpacity={0.25 + i * 0.15}
          strokeWidth="1.5"
        />
      ))}
      <polygon
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        transform={`rotate(${rot} 50 50)`}
      />
      <circle cx="50" cy="50" r="5" fill={color} opacity="0.9" />
    </svg>
  );
}

function fmt(n) {
  return n.toLocaleString("en-US");
}

export default function ProjectKhaos() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const tierRef = useRef("bronze");
  const [tierId, setTierId] = useState("bronze");
  const [showCompare, setShowCompare] = useState(false);
  const [showAuction, setShowAuction] = useState(false);
  const [lots, setLots] = useState(() => createLots("bronze", 7));
  const [flash, setFlash] = useState(null);
  const reducedRef = useRef(false);
  const lotSeedRef = useRef(8);
  const rngRef = useRef(mulberry32(1234));

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    tierRef.current = tierId;
  }, [tierId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    const reduced = reducedRef.current;

    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      canvas.style.width = r.width + "px";
      canvas.style.height = r.height + "px";
    };
    resize();
    window.addEventListener("resize", resize);

    // particle pools per simulation
    const embers = Array.from({ length: 90 }, () => spawnEmber(true));
    const frost = Array.from({ length: 70 }, () => spawnFrost(true));
    const flares = Array.from({ length: 26 }, () => spawnFlare(true));
    const beams = Array.from({ length: 9 }, () => ({
      a: Math.random() * TAU,
      hue: 180 + Math.random() * 160,
      wob: Math.random() * TAU,
    }));

    function spawnEmber(anyY) {
      return {
        x: Math.random(),
        y: anyY ? Math.random() : 1.05,
        r: 1 + Math.random() * 2.6,
        vy: 0.12 + Math.random() * 0.3,
        vx: (Math.random() - 0.5) * 0.08,
        life: 1,
      };
    }
    function spawnFrost(anyY) {
      return {
        x: Math.random(),
        y: anyY ? Math.random() : -0.05,
        s: 4 + Math.random() * 10,
        vy: 0.05 + Math.random() * 0.12,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 0.6,
        hue: 190 + Math.random() * 30,
      };
    }
    function spawnFlare(anyY) {
      return {
        x: 0.5 + (Math.random() - 0.5) * 0.3,
        y: 1.02,
        len: 0.25 + Math.random() * 0.4,
        bend: (Math.random() - 0.5) * 0.5,
        speed: 0.35 + Math.random() * 0.5,
        w: 2 + Math.random() * 5,
        t: anyY ? Math.random() : 0,
      };
    }

    function simEmbers(w, h, t, dt) {
      ctx.fillStyle = "#0b0503";
      ctx.fillRect(0, 0, w, h);
      for (const p of embers) {
        p.y -= p.vy * dt;
        p.x += (p.vx + Math.sin(t * 2 + p.y * 9) * 0.03) * dt;
        p.life -= dt * 0.25;
        if (p.y < -0.05 || p.life <= 0) Object.assign(p, spawnEmber(false));
        const a = Math.max(0, Math.min(1, p.life)) * 0.85;
        ctx.fillStyle = `rgba(255,${120 + Math.floor(80 * p.life)},40,${a})`;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r, 0, TAU);
        ctx.fill();
      }
      // hearth glow at the base — localized
      const g = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, h * 0.45);
      g.addColorStop(0, "rgba(255,120,40,0.28)");
      g.addColorStop(1, "rgba(255,120,40,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    function simFrost(w, h, t, dt) {
      ctx.fillStyle = "#04070d";
      ctx.fillRect(0, 0, w, h);
      for (const p of frost) {
        p.y += p.vy * dt;
        p.x += Math.sin(t * 0.8 + p.y * 12) * 0.02 * dt;
        p.rot += p.vr * dt;
        if (p.y > 1.05) Object.assign(p, spawnFrost(false));
        ctx.save();
        ctx.translate(p.x * w, p.y * h);
        ctx.rotate(p.rot);
        ctx.strokeStyle = `hsla(${p.hue},70%,75%,0.5)`;
        ctx.lineWidth = 1.4;
        const s = p.s;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
          ctx.moveTo(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55);
          ctx.lineTo(
            Math.cos(a + 0.5) * s * 0.8,
            Math.sin(a + 0.5) * s * 0.8
          );
          ctx.moveTo(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55);
          ctx.lineTo(
            Math.cos(a - 0.5) * s * 0.8,
            Math.sin(a - 0.5) * s * 0.8
          );
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    function simSolar(w, h, t, dt) {
      ctx.fillStyle = "#0d0602";
      ctx.fillRect(0, 0, w, h);
      // sun disc — localized
      const sg = ctx.createRadialGradient(w / 2, h * 1.02, 0, w / 2, h * 1.02, h * 0.7);
      sg.addColorStop(0, "rgba(255,190,90,0.5)");
      sg.addColorStop(0.5, "rgba(255,140,50,0.18)");
      sg.addColorStop(1, "rgba(255,140,50,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, w, h);
      for (const f of flares) {
        f.t += dt * f.speed;
        if (f.t > 1) Object.assign(f, spawnFlare(false));
        const x0 = f.x * w;
        const y0 = h * 1.02;
        const x1 = x0 + f.bend * w * f.t;
        const y1 = h * 1.02 - f.len * h * f.t;
        const cxp = x0 + f.bend * w * 0.6;
        const cyp = h * 1.02 - f.len * h * 0.4;
        const a = Math.max(0, 1 - f.t) * 0.75;
        ctx.strokeStyle = `rgba(255,${140 + Math.floor(80 * (1 - f.t))},60,${a})`;
        ctx.lineWidth = f.w * (1 - f.t * 0.6);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cxp, cyp, x1, y1);
        ctx.stroke();
      }
    }

    function simPrism(w, h, t, dt) {
      ctx.fillStyle = "#050508";
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.42;
      // prism
      ctx.fillStyle = "rgba(200,220,255,0.16)";
      ctx.strokeStyle = "rgba(220,235,255,0.7)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 46);
      ctx.lineTo(cx + 40, cy + 30);
      ctx.lineTo(cx - 40, cy + 30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // incoming white beam
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, cy - 90);
      ctx.lineTo(cx - 24, cy - 12);
      ctx.stroke();
      // refracted fan
      for (const b of beams) {
        b.wob += dt * 0.5;
        const spread = reduced ? 0 : Math.sin(b.wob) * 0.05;
        const a = 0.5 + (beams.indexOf(b) / beams.length) * 0.9 + spread;
        ctx.strokeStyle = `hsla(${b.hue},90%,65%,0.5)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx + 20, cy + 8);
        ctx.lineTo(cx + 20 + Math.cos(a) * w, cy + 8 + Math.sin(a) * w * 0.6);
        ctx.stroke();
      }
    }

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1;
      if (reduced) dt = Math.min(dt, 0.033);
      const t = now / 1000;

      const w = canvas.width;
      const h = canvas.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const vw = w / dpr;
      const vh = h / dpr;
      const sim = tierById(tierRef.current).sim;
      if (sim === "embers") simEmbers(vw, vh, t, dt);
      else if (sim === "frost") simFrost(vw, vh, t, dt);
      else if (sim === "solar") simSolar(vw, vh, t, dt);
      else simPrism(vw, vh, t, dt);

      // vignette to keep the canvas readable under UI
      const vg = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.3, vw / 2, vh / 2, vh * 0.95);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, vw, vh);
    };
    raf = requestAnimationFrame(frame);

    const onVis = () => {
      if (document.hidden) last = performance.now();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") setTierId((id) => nextTier(id));
      if (e.key === "ArrowLeft") setTierId((id) => prevTier(id));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Fresh auction floor per tier (demo clock — lots expire in minutes, not 72h).
  useEffect(() => {
    lotSeedRef.current += 1;
    setLots(createLots(tierId, lotSeedRef.current * 7919));
    setShowAuction(false);
  }, [tierId]);

  // Auction heartbeat: clocks tick, rivals bid, expired lots close or relist.
  useEffect(() => {
    if (!showAuction) return;
    const id = setInterval(() => {
      setLots((prev) => {
        const next = prev.map(cloneLot);
        const events = [];
        tickLots(next, 1, rngRef.current, events);
        rivalBidStep(next, rngRef.current, events);
        const notable = events.find(
          (e) => e.type === "sold" || e.type === "relisted"
        );
        if (notable) {
          setFlash(
            notable.type === "sold"
              ? `SOLD — ${notable.winner} took the lot for ${fmt(notable.price)}`
              : "New lot listed on the floor"
          );
          setTimeout(() => setFlash(null), 2600);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [showAuction]);

  const tier = tierById(tierId);

  const doBid = (lotId) => {
    setLots((prev) =>
      prev.map((l) => {
        if (l.id !== lotId) return l;
        const next = cloneLot(l);
        placeBid(next, "YOU", minBid(next));
        return next;
      })
    );
  };

  const doBuyNow = (lotId) => {
    setLots((prev) =>
      prev.map((l) => {
        if (l.id !== lotId) return l;
        const next = cloneLot(l);
        buyNow(next, "YOU");
        return next;
      })
    );
  };

  return (
    <>
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        color: "#eef2f7",
        fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        overflow: "hidden",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div ref={wrapRef} style={{ position: "absolute", inset: 0 }}>
        <canvas ref={canvasRef} style={{ display: "block" }} />
      </div>

      {/* tier nav */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 5,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "12px 12px 10px",
          background: "linear-gradient(180deg, rgba(0,0,0,0.75), rgba(0,0,0,0))",
        }}
      >
        <div style={{ letterSpacing: 8, fontSize: 13, color: "#fff", marginBottom: 10 }}>
          PROJECT KHAOS
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {TIERS.map((tr) => (
            <button
              key={tr.id}
              onClick={() => setTierId(tr.id)}
              style={{
                fontFamily: "inherit",
                fontSize: 12,
                letterSpacing: 2,
                padding: "10px 18px",
                minHeight: 44,
                borderRadius: 6,
                cursor: "pointer",
                border: `2px solid ${tr.color}`,
                background:
                  tr.id === tierId ? tr.color + "2e" : "rgba(0,0,0,0.55)",
                color: tr.color,
                boxShadow: tr.id === tierId ? `0 0 14px ${tr.color}66` : "none",
                fontWeight: tr.id === tierId ? "bold" : "normal",
              }}
            >
              {tr.name}
            </button>
          ))}
        </div>
      </div>

      {/* tier card */}
      <div
        style={{
          position: "absolute",
          left: 14,
          right: 14,
          bottom: 14,
          zIndex: 5,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            pointerEvents: "auto",
            width: "100%",
            maxWidth: 560,
            background: "rgba(4,4,8,0.82)",
            border: `1px solid ${tier.color}`,
            borderRadius: 12,
            padding: "18px 20px",
            backdropFilter: "blur(6px)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ color: tier.color, letterSpacing: 3, fontSize: 16, fontWeight: "bold" }}>
              {tier.name}
            </div>
            <div style={{ color: "#8f9bb3", fontSize: 11, letterSpacing: 2 }}>
              {tier.tag.toUpperCase()} · SIMULATION DEMO
            </div>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.7, color: "#cfd6e2", fontFamily: "Georgia, serif" }}>
            {tier.blurb}
          </p>
          <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none" }}>
            {tier.perks.map((p) => (
              <li key={p} style={{ fontSize: 13, color: "#aeb8c9", lineHeight: 2, paddingLeft: 22, position: "relative" }}>
                <span style={{ position: "absolute", left: 2, color: tier.color }}>▸</span>
                {p}
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button
              onClick={() => setTierId(prevTier(tierId))}
              style={navBtn(tier.color)}
              disabled={tierId === TIERS[0].id}
            >
              ← PREV
            </button>
            <button onClick={() => setShowCompare((s) => !s)} style={navBtn(tier.color)}>
              {showCompare ? "HIDE" : "COMPARE"}
            </button>
            <button
              onClick={() => setShowAuction((s) => !s)}
              style={navBtn(tier.color)}
            >
              {showAuction ? "CLOSE" : "AUCTION"}
            </button>
            <button
              onClick={() => setTierId(nextTier(tierId))}
              style={navBtn(tier.color)}
              disabled={tierId === TIERS[TIERS.length - 1].id}
            >
              NEXT →
            </button>
          </div>

          {showCompare && (
            <div style={{ marginTop: 14, overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                  color: "#cfd6e2",
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle}></th>
                    {TIERS.map((tr) => (
                      <th key={tr.id} style={{ ...thStyle, color: tr.color }}>
                        {tr.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, i) => (
                        <td
                          key={i}
                          style={{
                            ...tdStyle,
                            color: i === 0 ? "#8f9bb3" : "#cfd6e2",
                            textAlign: i === 0 ? "left" : "center",
                          }}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* auction floor */}
      {showAuction && (
        <div
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            bottom: 14,
            zIndex: 8,
            maxHeight: "62vh",
            overflowY: "auto",
            background: "rgba(4,4,8,0.94)",
            border: `1px solid ${tier.color}`,
            borderRadius: 12,
            padding: "16px 18px",
            backdropFilter: "blur(6px)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <div style={{ color: tier.color, letterSpacing: 3, fontSize: 15, fontWeight: "bold" }}>
              {tier.name} AUCTION FLOOR
            </div>
            <button
              onClick={() => setShowAuction(false)}
              style={{ ...navBtn(tier.color), flex: "0 0 auto", padding: "8px 18px" }}
            >
              CLOSE ✕
            </button>
          </div>
          <div style={{ fontSize: 11, letterSpacing: 1.5, color: "#8f9bb3", marginBottom: 12 }}>
            SIMULATED AUCTION · DEMO CREDITS · NO REAL MONEY · RIVAL BIDDERS LIVE
          </div>
          {flash && (
            <div
              style={{
                fontSize: 12,
                letterSpacing: 1,
                color: "#ffd98a",
                border: "1px solid #ffd98a55",
                borderRadius: 8,
                padding: "8px 12px",
                marginBottom: 12,
              }}
            >
              {flash}
            </div>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            {lots.map((lot) => {
              const sold = lot.status === "sold";
              return (
                <div
                  key={lot.id}
                  style={{
                    position: "relative",
                    border: `1px solid ${sold ? "#5a6272" : tier.color}`,
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "#0a0a10",
                    opacity: sold ? 0.85 : 1,
                  }}
                >
                  <LotArt seed={lot.artSeed} color={sold ? "#5a6272" : tier.color} />
                  <div style={{ padding: "10px 12px 12px" }}>
                    <div style={{ fontSize: 12, letterSpacing: 1, color: "#fff", fontWeight: "bold" }}>
                      {lot.name}
                    </div>
                    <div style={{ fontSize: 11, color: "#8f9bb3", marginTop: 4, letterSpacing: 1 }}>
                      ⏳ {sold ? "CLOSED" : formatClock(lot.endsIn)}
                      {lot.bidder && (
                        <span style={{ color: lot.bidder === "YOU" ? "#7dff9a" : "#ffd98a" }}>
                          {" "}· {lot.bidder}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 16, color: tier.color, fontWeight: "bold", marginTop: 6 }}>
                      {fmt(lot.currentBid)}
                      <span style={{ fontSize: 10, color: "#8f9bb3", fontWeight: "normal" }}> credits</span>
                    </div>
                    {!sold && (
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button
                          onClick={() => doBid(lot.id)}
                          style={{ ...navBtn(tier.color), fontSize: 11 }}
                        >
                          BID {fmt(minBid(lot))}
                        </button>
                        <button
                          onClick={() => doBuyNow(lot.id)}
                          style={{ ...navBtn(tier.color), fontSize: 11, background: tier.color + "22" }}
                        >
                          BUY {fmt(lot.buyNow)}
                        </button>
                      </div>
                    )}
                  </div>
                  {sold && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(0,0,0,0.55)",
                        color: "#fff",
                        fontSize: 18,
                        letterSpacing: 6,
                        fontWeight: "bold",
                        transform: "rotate(-8deg)",
                      }}
                    >
                      SOLD
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
    {/* Safari bottom-bar clearance: blank space under the fixed game viewport */}
    <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
    </>
  );
}

const navBtn = (color) => ({
  flex: 1,
  fontFamily: "inherit",
  fontSize: 12,
  letterSpacing: 2,
  padding: "10px 0",
  minHeight: 44,
  borderRadius: 8,
  border: `1px solid ${color}`,
  background: "transparent",
  color,
  cursor: "pointer",
});

const thStyle = {
  padding: "8px 6px",
  borderBottom: "1px solid rgba(255,255,255,0.2)",
  letterSpacing: 1,
  fontSize: 11,
};

const tdStyle = {
  padding: "8px 6px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};
