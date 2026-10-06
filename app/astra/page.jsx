'use client';

// ASTRA — cockpit shooter. A fictional deep-space patrol run: hold the lane,
// burn drones with cannon and seeker missiles, hyper-burst out of trouble.
// Presented as pure science fiction. All visuals are procedural canvas 2D.
// Zero network calls.

import { useEffect, useRef, useState } from "react";
import { AresBackdrop, AresButton, AresIcon, ARES } from "@/components/ares/ares-chrome";
import {
  FIELD,
  PLAYER_CFG,
  DRONE_CFG,
  BOSS_CFG,
  createBattle,
  updateBattle,
  drainEvents,
} from "./astra.js";

const TAU = Math.PI * 2;

export default function Astra() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const battleRef = useRef(null);
  const inputRef = useRef({ dx: 0, dy: 0, cannon: false, seeker: false, hyper: false });
  const keysRef = useRef({});
  const [screen, setScreen] = useState("title"); // title | play | over
  const [hud, setHud] = useState({
    shield: 10, level: 1, kills: 0, boss: null, bossHp: 0, bossMax: 1,
    hyperReady: true, seekerReady: true,
  });
  const [endStats, setEndStats] = useState(null);
  const [best, setBest] = useState(0);
  const reducedRef = useRef(false);

  useEffect(() => {
    try {
      setBest(Number(localStorage.getItem("astra-best") || 0));
    } catch (e) {}
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    const reduced = reducedRef.current;

    let raf = 0;
    let last = performance.now();
    let shake = 0;

    // procedural starfield (three parallax layers)
    const stars = [];
    for (let i = 0; i < 150; i++) {
      stars.push({
        x: Math.random() * FIELD.w,
        y: Math.random() * FIELD.h,
        z: 0.25 + Math.random() * 0.75,
        r: 0.6 + Math.random() * 1.6,
        tw: Math.random() * TAU,
      });
    }
    // nebula blobs: fixed pseudo-random puffs, drawn additively and dim
    const nebulae = [];
    for (let i = 0; i < 7; i++) {
      nebulae.push({
        x: Math.random() * FIELD.w,
        y: Math.random() * FIELD.h,
        r: 160 + Math.random() * 220,
        hue: [190, 210, 280, 320][i % 4],
      });
    }
    // chunk grid drifting past (replaces the terrain chunks)
    let chunkOffset = 0;

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

    const onKey = (down) => (e) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k))
        e.preventDefault();
      keysRef.current[k] = down;
      if (down && k === "j") inputRef.current.seeker = true;
      if (down && k === "k") inputRef.current.hyper = true;
      if (down && k === " ") inputRef.current.cannon = true;
      if (!down && k === " ") inputRef.current.cannon = false;
    };
    const kd = onKey(true);
    const ku = onKey(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    // drag-to-steer on the canvas
    let dragId = null;
    let dragSX = 0;
    let dragSY = 0;
    let dragPX = 0;
    let dragPY = 0;
    const ts = (e) => {
      const t = e.changedTouches[0];
      dragId = t.identifier;
      dragSX = t.clientX;
      dragSY = t.clientY;
      const b = battleRef.current;
      if (b) {
        dragPX = b.player.x;
        dragPY = b.player.y;
      }
    };
    const tm = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== dragId) continue;
        const b = battleRef.current;
        if (!b) continue;
        const r = canvas.getBoundingClientRect();
        const scale = FIELD.w / r.width;
        b.player.x = Math.max(
          PLAYER_CFG.radius,
          Math.min(FIELD.w - PLAYER_CFG.radius, dragPX + (t.clientX - dragSX) * scale)
        );
        b.player.y = Math.max(
          PLAYER_CFG.radius,
          Math.min(FIELD.h - PLAYER_CFG.radius, dragPY + (t.clientY - dragSY) * scale)
        );
      }
      if (e.cancelable) e.preventDefault();
    };
    const te = (e) => {
      for (const t of e.changedTouches)
        if (t.identifier === dragId) dragId = null;
    };
    canvas.addEventListener("touchstart", ts, { passive: true });
    canvas.addEventListener("touchmove", tm, { passive: false });
    canvas.addEventListener("touchend", te);
    canvas.addEventListener("touchcancel", te);

    const pollKeys = () => {
      const k = keysRef.current;
      let dx = 0;
      let dy = 0;
      if (k["a"] || k["arrowleft"]) dx -= 1;
      if (k["d"] || k["arrowright"]) dx += 1;
      if (k["w"] || k["arrowup"]) dy -= 1;
      if (k["s"] || k["arrowdown"]) dy += 1;
      if (dragId === null) {
        inputRef.current.dx = dx;
        inputRef.current.dy = dy;
      } else {
        inputRef.current.dx = 0;
        inputRef.current.dy = 0;
      }
    };

    function drawShip(p, t) {
      ctx.save();
      ctx.translate(p.x, p.y);
      // engine glow — localized
      const eg = ctx.createRadialGradient(0, 26, 0, 0, 26, 26);
      eg.addColorStop(0, "rgba(90,200,255,0.5)");
      eg.addColorStop(1, "rgba(90,200,255,0)");
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(0, 26, 26, 0, TAU);
      ctx.fill();
      // hull
      ctx.fillStyle = "#3a4a63";
      ctx.beginPath();
      ctx.moveTo(0, -26);
      ctx.lineTo(14, 6);
      ctx.lineTo(22, 20);
      ctx.lineTo(8, 14);
      ctx.lineTo(-8, 14);
      ctx.lineTo(-22, 20);
      ctx.lineTo(-14, 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(140,200,255,0.8)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // cockpit
      ctx.fillStyle = "#9fd8ff";
      ctx.beginPath();
      ctx.ellipse(0, -8, 5, 9, 0, 0, TAU);
      ctx.fill();
      if (p.hyperActive > 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 34 + Math.sin(t * 30) * 4, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawDrone(d, t) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(Math.sin(d.t * 3 + d.ph) * 0.3);
      ctx.fillStyle = "#5a1f1f";
      const s = DRONE_CFG.radius;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + d.t * 1.5;
        const x = Math.cos(a) * s;
        const y = Math.sin(a) * s;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,90,90,0.8)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#ff5d5d";
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    function drawBoss(b, t) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.sin(b.t * 0.8) * 0.15);
      const r = BOSS_CFG.radius;
      ctx.fillStyle = "#3d1630";
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + b.t * 0.6;
        const rr = r * (0.82 + 0.18 * Math.sin(b.t * 3 + i));
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,80,180,0.85)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // core — the one localized glow
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
      cg.addColorStop(0, "rgba(255,120,200,0.9)");
      cg.addColorStop(1, "rgba(255,120,200,0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ffd7f2";
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1;
      const t = now / 1000;

      const b = battleRef.current;
      if (b && !b.over) {
        pollKeys();
        updateBattle(b, inputRef.current, dt);
        inputRef.current.seeker = false;
        inputRef.current.hyper = false;
        for (const e of drainEvents(b)) {
          if (e.type === "damage") shake = Math.max(shake, 7);
          if (e.type === "bossDown") shake = Math.max(shake, 12);
          if (e.type === "gameOver") {
            setEndStats({ kills: e.kills, level: e.level });
            setBest((prev) => {
              const nb = Math.max(prev, e.kills);
              try {
                localStorage.setItem("astra-best", String(nb));
              } catch (err) {}
              return nb;
            });
            setScreen("over");
          }
        }
        setHud({
          shield: Math.ceil(b.player.shield),
          level: b.level,
          kills: b.kills,
          boss: !!b.boss,
          bossHp: b.boss ? Math.max(0, b.boss.hp) : 0,
          bossMax: b.boss ? b.boss.maxHp : 1,
          hyperReady: b.player.hyperT <= 0,
          seekerReady: b.player.seekerT <= 0,
        });
        chunkOffset = (chunkOffset + dt * 260) % 220;
      }

      // ------- render -------
      const w = canvas.width;
      const h = canvas.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewW = w / dpr;
      const viewH = h / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#02030a";
      ctx.fillRect(0, 0, viewW, viewH);

      const scale = Math.min(viewW / FIELD.w, viewH / FIELD.h);
      const ox = (viewW - FIELD.w * scale) / 2;
      const oy = (viewH - FIELD.h * scale) / 2;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);
      if (shake > 0 && !reduced) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        shake *= 0.88;
        if (shake < 0.4) shake = 0;
      }
      // clip to field
      ctx.beginPath();
      ctx.rect(0, 0, FIELD.w, FIELD.h);
      ctx.clip();

      // nebulae (dim, additive-feel via low alpha)
      for (const n of nebulae) {
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        g.addColorStop(0, `hsla(${n.hue},70%,40%,0.10)`);
        g.addColorStop(1, "hsla(0,0%,0%,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, TAU);
        ctx.fill();
      }
      // drifting grid chunks
      ctx.strokeStyle = "rgba(0,90,140,0.30)";
      ctx.lineWidth = 2;
      for (let gy = -220; gy < FIELD.h + 220; gy += 220) {
        const y = gy + chunkOffset;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(FIELD.w, y);
        ctx.stroke();
      }
      for (let gx = 0; gx <= FIELD.w; gx += 150) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, FIELD.h);
        ctx.stroke();
      }
      // stars
      for (const s of stars) {
        const y = (s.y + chunkOffset * s.z * 2) % FIELD.h;
        const tw = reduced ? 0.8 : 0.55 + 0.35 * Math.sin(t * 2 + s.tw);
        ctx.fillStyle = `rgba(200,225,255,${(0.35 * s.z + 0.25) * tw})`;
        ctx.beginPath();
        ctx.arc(s.x, y, s.r * s.z + 0.4, 0, TAU);
        ctx.fill();
      }

      if (b) {
        for (const d of b.drones) drawDrone(d, t);
        if (b.boss) drawBoss(b.boss, t);
        // cannon bolts — short bright dashes, no bloom
        ctx.strokeStyle = "#7fe7ff";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        for (const sh of b.shots) {
          ctx.moveTo(sh.x, sh.y);
          ctx.lineTo(sh.x, sh.y + 26);
        }
        ctx.stroke();
        // seekers
        for (const sk of b.seekers) {
          ctx.save();
          ctx.translate(sk.x, sk.y);
          ctx.fillStyle = "#ff7fb0";
          ctx.beginPath();
          ctx.arc(0, 0, 6, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
        drawShip(b.player, t);
      }

      // radar
      const rw = 120;
      const rh = 120;
      const rx = FIELD.w - rw - 14;
      const ry = 14;
      ctx.fillStyle = "rgba(0,20,26,0.72)";
      ctx.beginPath();
      ctx.arc(rx + rw / 2, ry + rh / 2, rw / 2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,242,255,0.6)";
      ctx.lineWidth = 2;
      ctx.stroke();
      // sweep
      if (!reduced) {
        const sa = (t * 2.2) % TAU;
        ctx.save();
        ctx.beginPath();
        ctx.arc(rx + rw / 2, ry + rh / 2, rw / 2, 0, TAU);
        ctx.clip();
        ctx.strokeStyle = "rgba(0,242,255,0.35)";
        ctx.beginPath();
        ctx.moveTo(rx + rw / 2, ry + rh / 2);
        ctx.lineTo(
          rx + rw / 2 + Math.cos(sa) * rw / 2,
          ry + rh / 2 + Math.sin(sa) * rw / 2
        );
        ctx.stroke();
        ctx.restore();
      }
      if (b) {
        ctx.fillStyle = "#ff5d5d";
        const plot = (x, y, r) => {
          ctx.beginPath();
          ctx.arc(rx + (x / FIELD.w) * rw, ry + (y / FIELD.h) * rh, r, 0, TAU);
          ctx.fill();
        };
        for (const d of b.drones) plot(d.x, d.y, 3);
        if (b.boss) {
          ctx.fillStyle = "#ff9de2";
          plot(b.boss.x, b.boss.y, 6);
        }
        ctx.fillStyle = "#7fe7ff";
        plot(b.player.x, b.player.y, 3.5);
      }
      ctx.restore();
    };
    raf = requestAnimationFrame(frame);

    const onVis = () => {
      if (document.hidden) last = performance.now();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("touchstart", ts);
      canvas.removeEventListener("touchmove", tm);
      canvas.removeEventListener("touchend", te);
      canvas.removeEventListener("touchcancel", te);
    };
  }, []);

  const start = () => {
    battleRef.current = createBattle((Date.now() % 100000) | 0);
    inputRef.current = { dx: 0, dy: 0, cannon: false, seeker: false, hyper: false };
    setScreen("play");
  };

  const hold = (name, v) => (e) => {
    e.preventDefault();
    if (name === "tap") {
      inputRef.current[name] = true;
      if (v === "seeker") inputRef.current.seeker = true;
      if (v === "hyper") inputRef.current.hyper = true;
      return;
    }
    inputRef.current[name] = v;
  };

  const btn = {
    width: 84,
    height: 84,
    borderRadius: 14,
    border: "2px solid #35e0ff",
    background: "rgba(0,30,40,0.6)",
    color: "#9ff0ff",
    fontSize: 11,
    letterSpacing: 1,
    fontFamily: "inherit",
    touchAction: "none",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#02030a",
        color: "#cfeaff",
        fontFamily: "'Courier New', ui-monospace, monospace",
        overflow: "hidden",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* ARES interior art: page backdrop behind menus/HUD (never over gameplay) */}
      <AresBackdrop src="/images/astra/astra-bg.webp" strength={0.35} />
      <div ref={wrapRef} style={{ position: "absolute", inset: 0, touchAction: "none" }}>
        <canvas ref={canvasRef} style={{ display: "block" }} />
      </div>

      {screen !== "title" && (
        <div
          style={{
            position: "absolute",
            top: "calc(env(safe-area-inset-top, 0px) + 54px)",
            left: 0,
            right: 150,
            padding: "12px 14px",
            pointerEvents: "none",
            fontSize: 13,
            letterSpacing: 2,
          }}
        >
          <div style={{ color: "#9ff0ff" }}>
            LVL {hud.level} &nbsp; SHIELD {hud.shield}
          </div>
          <div style={{ marginTop: 6, maxWidth: 220 }}>
            <div
              style={{
                height: 8,
                background: "rgba(255,255,255,0.12)",
                borderRadius: 4,
              }}
            >
              <div
                style={{
                  width: (hud.shield / PLAYER_CFG.shieldMax) * 100 + "%",
                  height: "100%",
                  borderRadius: 4,
                  background: "linear-gradient(90deg,#35e0ff,#9ff0ff)",
                }}
              />
            </div>
          </div>
          <div style={{ marginTop: 6, color: "#8f9bb3" }}>KILLS {hud.kills}</div>
          {hud.boss && (
            <div style={{ marginTop: 8, maxWidth: 260 }}>
              <div style={{ color: "#ff9de2", fontSize: 11, marginBottom: 4 }}>
                ⚠ CAPITAL DRONE
              </div>
              <div
                style={{
                  height: 8,
                  background: "rgba(255,255,255,0.12)",
                  borderRadius: 4,
                }}
              >
                <div
                  style={{
                    width: (hud.bossHp / hud.bossMax) * 100 + "%",
                    height: "100%",
                    borderRadius: 4,
                    background: "linear-gradient(90deg,#ff5d9e,#ff9de2)",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {screen === "play" && (
        <div
          style={{
            position: "absolute",
            bottom: "max(5.5rem, calc(env(safe-area-inset-bottom) + 4.5rem))",
            right: 16,
            display: "grid",
            gridTemplateColumns: "repeat(2, 84px)",
            gap: 10,
          }}
        >
          <button
            style={{ ...btn, gridColumn: "span 2", height: 46, borderColor: "#fff", color: "#fff" }}
            onTouchStart={(e) => {
              e.preventDefault();
              inputRef.current.hyper = true;
            }}
            onMouseDown={() => (inputRef.current.hyper = true)}
          >
            {hud.hyperReady ? "HYPER" : "…"}
          </button>
          <button
            style={{ ...btn, opacity: hud.seekerReady ? 1 : 0.45 }}
            onTouchStart={hold("tap", "seeker")}
            onMouseDown={() => (inputRef.current.seeker = true)}
          >
            SEEKER
          </button>
          <button
            style={btn}
            onTouchStart={(e) => {
              e.preventDefault();
              inputRef.current.cannon = true;
            }}
            onTouchEnd={() => (inputRef.current.cannon = false)}
            onMouseDown={() => (inputRef.current.cannon = true)}
            onMouseUp={() => (inputRef.current.cannon = false)}
            onMouseLeave={() => (inputRef.current.cannon = false)}
          >
            CANNON
          </button>
        </div>
      )}

      {screen === "title" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "safe center",
            textAlign: "center",
            overflowY: "auto",
            background:
              "radial-gradient(ellipse at center, rgba(2,8,16,0.5) 0%, rgba(1,2,6,0.93) 100%)",
            padding: 24,
            zIndex: 5,
          }}
        >
          {/* ARES interior art behind the title */}
          <img
            src="/images/astra/astra-bg.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.45,
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ color: ARES.goldSoft, marginBottom: 4 }}>
            <AresIcon name="rocket" className="h-10 w-10" />
          </div>
          <div
            style={{
              fontSize: "clamp(40px, 9vw, 76px)",
              letterSpacing: 22,
              color: "#eaf7ff",
              textShadow: "0 0 26px rgba(60,200,255,0.6)",
            }}
          >
            ASTRA
          </div>
          <div style={{ marginTop: 8, letterSpacing: 5, color: "#7fb6d8", fontSize: 13 }}>
            DEEP-SPACE PATROL RUN
          </div>
          <div
            style={{
              position: "relative",
              marginTop: 24,
              maxWidth: 480,
              padding: 16,
              background: "rgba(2,8,16,0.55)",
              border: "1px solid rgba(212,175,55,0.4)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: `url('${ARES.panelTile}')`,
                backgroundSize: "512px 512px",
                opacity: 0.2,
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "relative",
                color: "#a9c3d8",
                fontSize: 14,
                lineHeight: 1.9,
              }}
            >
              Hold the lane against the drone swarm. Cannon for steady fire,
              Seeker missiles lock the nearest hostile, Hyper bursts you clear
              and shields you for a breath. Every third level, a capital drone
              arrives. Your shield regenerates — if you stop getting hit.
            </div>
          </div>
          <div style={{ marginTop: 16, color: "#6f8299", fontSize: 12, lineHeight: 2 }}>
            STEER — WASD / arrows / drag
            <br />
            CANNON — hold SPACE &nbsp;·&nbsp; SEEKER — J &nbsp;·&nbsp; HYPER — K
          </div>
          <AresButton icon="rocket" tone="gold" onClick={start} style={{ marginTop: 28 }}>
            LAUNCH
          </AresButton>
          {best > 0 && (
            <div style={{ marginTop: 14, color: "#6f8299", fontSize: 12, letterSpacing: 2 }}>
              BEST {best} KILLS
            </div>
          )}
          </div>
        </div>
      )}

      {screen === "over" && endStats && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "safe center",
            textAlign: "center",
            overflowY: "auto",
            background: "rgba(2,4,10,0.9)",
            padding: 24,
            zIndex: 5,
          }}
        >
          {/* ARES interior art behind the result screen */}
          <img
            src="/images/astra/astra-bg.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.3,
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ marginTop: 8, color: "#ff9d9d", letterSpacing: 8 }}>
            <AresIcon name="skull" className="h-10 w-10 inline-block" />
          </div>
          <div
            style={{
              fontSize: "clamp(26px, 5vw, 44px)",
              letterSpacing: 8,
              color: "#ff9d9d",
            }}
          >
            HULL BREACH
          </div>
          <div style={{ marginTop: 20, color: "#a9c3d8", fontSize: 15, lineHeight: 2.2 }}>
            Reached level <b style={{ color: "#9ff0ff" }}>{endStats.level}</b>
            <br />
            Drones downed <b style={{ color: "#ffd98a" }}>{endStats.kills}</b>
            <br />
            <span style={{ color: "#6f8299", fontSize: 13 }}>
              Best {Math.max(best, endStats.kills)} kills
            </span>
          </div>
          <AresButton icon="rotate" tone="gold" onClick={start} style={{ marginTop: 26 }}>
            FLY AGAIN
          </AresButton>
          </div>
        </div>
      )}

      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear" />
    </div>
  );
}
