'use client';

// ARACHNID WEAVER — survival chase game.
// You are a torch-bearer trapped in the Weaver's nest. Run. Manage your
// stamina. If the spider catches you, you are rolled up and eaten.
// All art is procedural canvas 2D. Zero network calls.

import { useEffect, useRef, useState } from "react";
import { fx, unlockFx, throttle } from "@/lib/fx";
import { resolveSurfaceCharacter } from "@/lib/characters/embodiment";
import { AresBackdrop, AresButton, AresIcon, ARES } from "@/components/ares/ares-chrome";
import {
  ARENA,
  PLAYER,
  SPIDER,
  CAUGHT_DURATION,
  createGame,
  updateGame,
  scoreOf,
  dist,
} from "./game.js";

const TAU = Math.PI * 2;

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ":" + String(sec).padStart(2, "0");
}

export default function ArachnidWeaver() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const gameRef = useRef(null);
  const inputRef = useRef({ dx: 0, dy: 0, sprint: false });
  const keysRef = useRef({});
  const joyRef = useRef({ active: false, id: null, sx: 0, sy: 0, dx: 0, dy: 0 });
  const [screen, setScreen] = useState("title"); // title | play | dead
  const [hud, setHud] = useState({ t: 0, stamina: 100, near: 0, hunted: false, score: 0 });
  const [best, setBest] = useState(0);
  const [deadStats, setDeadStats] = useState(null);
  const reducedRef = useRef(false);
  // Wave 5 (stretch): the profile character as the prey's token —
  // resolved once here (before the game effect below runs) into a
  // ref the canvas closure reads. Null = the native torch-bearer.
  const tokenRef = useRef(null);

  useEffect(() => {
    const character = resolveSurfaceCharacter("arachnid-weaver");
    if (character && character.preview) tokenRef.current = character;
    try {
      setBest(Number(localStorage.getItem("arachnid-best") || 0));
    } catch (e) {}
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // unlock FX on first gesture (deep links may land here without the hub)
    const unlock = () => unlockFx();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    const reduced = reducedRef.current;

    // Wave 5 (stretch): preload the profile-character token image.
    // tokenReady flips when it decodes; any failure leaves it false
    // forever and the native torch-bearer draws, exactly as before.
    let tokenImg = null;
    let tokenReady = false;
    if (tokenRef.current && tokenRef.current.preview) {
      tokenImg = new Image();
      tokenImg.onload = () => { tokenReady = true; };
      tokenImg.onerror = () => { tokenReady = false; tokenImg = null; };
      tokenImg.src = tokenRef.current.preview;
    }

    let raf = 0;
    let last = performance.now();
    let camX = ARENA.w / 2;
    let camY = ARENA.h / 2;
    let shake = 0;
    let fireflies = [];
    for (let i = 0; i < 26; i++) {
      fireflies.push({
        x: Math.random() * ARENA.w,
        y: Math.random() * ARENA.h,
        ph: Math.random() * TAU,
        r: 1.2 + Math.random() * 2.2,
      });
    }

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
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)
      ) {
        e.preventDefault();
      }
      keysRef.current[e.key.toLowerCase()] = down;
      if (e.key === " ") inputRef.current.spaceSprint = down;
      if (e.key.toLowerCase() === "shift")
        inputRef.current.shiftSprint = down;
    };
    const kd = onKey(true);
    const ku = onKey(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    // --- touch joystick (left half) + sprint is a DOM button ---
    const joyStart = (e) => {
      const t = e.changedTouches[0];
      const r = canvas.getBoundingClientRect();
      if (t.clientX - r.left > r.width * 0.55) return; // right side reserved
      joyRef.current.active = true;
      joyRef.current.id = t.identifier;
      joyRef.current.sx = t.clientX;
      joyRef.current.sy = t.clientY;
      joyRef.current.dx = 0;
      joyRef.current.dy = 0;
    };
    const joyMove = (e) => {
      const j = joyRef.current;
      if (!j.active) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== j.id) continue;
        const R = 70;
        let dx = (t.clientX - j.sx) / R;
        let dy = (t.clientY - j.sy) / R;
        const m = Math.hypot(dx, dy);
        if (m > 1) {
          dx /= m;
          dy /= m;
        }
        j.dx = dx;
        j.dy = dy;
      }
      if (e.cancelable) e.preventDefault();
    };
    const joyEnd = (e) => {
      const j = joyRef.current;
      for (const t of e.changedTouches) {
        if (t.identifier === j.id) {
          j.active = false;
          j.id = null;
          j.dx = 0;
          j.dy = 0;
        }
      }
    };
    canvas.addEventListener("touchstart", joyStart, { passive: true });
    canvas.addEventListener("touchmove", joyMove, { passive: false });
    canvas.addEventListener("touchend", joyEnd);
    canvas.addEventListener("touchcancel", joyEnd);

    const pollKeys = () => {
      const k = keysRef.current;
      let dx = 0;
      let dy = 0;
      if (k["a"] || k["arrowleft"]) dx -= 1;
      if (k["d"] || k["arrowright"]) dx += 1;
      if (k["w"] || k["arrowup"]) dy -= 1;
      if (k["s"] || k["arrowdown"]) dy += 1;
      const j = joyRef.current;
      if (j.active && (j.dx || j.dy)) {
        dx = j.dx;
        dy = j.dy;
      }
      inputRef.current.dx = dx;
      inputRef.current.dy = dy;
      inputRef.current.sprint = !!(
        inputRef.current.shiftSprint ||
        inputRef.current.spaceSprint ||
        inputRef.current.touchSprint
      );
    };

    // ------- drawing helpers -------
    function drawWebTrap(w, t) {
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.strokeStyle = "rgba(200,220,255,0.20)";
      ctx.lineWidth = 1.4;
      const radials = 10;
      for (let i = 0; i < radials; i++) {
        const a = (i / radials) * TAU + w.seed;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * w.r, Math.sin(a) * w.r);
        ctx.stroke();
      }
      for (let ring = 1; ring <= 4; ring++) {
        const rr = (ring / 4) * w.r;
        ctx.beginPath();
        for (let i = 0; i <= radials; i++) {
          const a = (i / radials) * TAU + w.seed;
          const sag = Math.sin(a * radials + t * 0.6) * 3;
          const x = Math.cos(a) * (rr + sag * 0.3);
          const y = Math.sin(a) * (rr + sag * 0.3);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawSpider(s, t) {
      ctx.save();
      ctx.translate(s.x, s.y);
      const ang = Math.atan2(s.vy, s.vx);
      const moving = Math.hypot(s.vx, s.vy) > 20;
      if (moving) ctx.rotate(ang);
      else ctx.rotate(t * 0.15);
      const windup = s.mode === "windup";
      const lunging = s.mode === "lunge";
      const tremble = windup && !reduced ? (Math.random() - 0.5) * 4 : 0;
      ctx.translate(tremble, 0);

      // legs: 4 per side, animated
      const legSwing = moving || windup ? t * 9 : t * 2;
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 4; i++) {
          const baseA = side * (0.5 + i * 0.32);
          const lift = Math.sin(legSwing + i * 1.7 + (side > 0 ? Math.PI : 0)) * (moving ? 10 : 3);
          const raise = windup ? -14 : lunging ? 8 : 0;
          const kneeX = Math.cos(baseA) * 34 + Math.sin(baseA) * lift * 0.4;
          const kneeY = Math.sin(baseA) * 34 - Math.cos(baseA) * lift * 0.2 + raise;
          const footX = Math.cos(baseA) * 62 + Math.sin(baseA) * lift;
          const footY = Math.sin(baseA) * 62 - lift * 0.6 + raise * 1.6;
          ctx.strokeStyle = "#1b1226";
          ctx.lineWidth = 7;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(Math.cos(baseA) * 16, Math.sin(baseA) * 14);
          ctx.lineTo(kneeX, kneeY);
          ctx.lineTo(footX, footY);
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,60,180,0.55)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(baseA) * 16, Math.sin(baseA) * 14);
          ctx.lineTo(kneeX, kneeY);
          ctx.stroke();
        }
      }

      // abdomen
      const abScale = 1 + Math.sin(t * 3.2) * 0.05;
      ctx.fillStyle = "#241a33";
      ctx.beginPath();
      ctx.ellipse(-30, 0, 34 * abScale, 26, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,60,180,0.35)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // thorax
      ctx.fillStyle = "#160f20";
      ctx.beginPath();
      ctx.ellipse(6, 0, 22, 18, 0, 0, TAU);
      ctx.fill();
      // eyes — small localized red glow only
      const eg = ctx.createRadialGradient(18, -6, 0, 18, -6, 14);
      eg.addColorStop(0, "rgba(255,40,40,0.9)");
      eg.addColorStop(1, "rgba(255,40,40,0)");
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(18, -6, 14, 0, TAU);
      ctx.arc(18, 6, 14, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ff2d2d";
      for (const ey of [-8, -3, 3, 8]) {
        ctx.beginPath();
        ctx.arc(22, ey, 2.4, 0, TAU);
        ctx.fill();
      }
      // fangs
      ctx.strokeStyle = "#c9b8ff";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(26, -6);
      ctx.lineTo(34, -2);
      ctx.moveTo(26, 6);
      ctx.lineTo(34, 2);
      ctx.stroke();
      ctx.restore();
    }

    function drawPlayer(p, t) {
      ctx.save();
      ctx.translate(p.x, p.y);
      const moving = Math.hypot(p.vx, p.vy) > 20;
      if (moving) ctx.rotate(Math.atan2(p.vy, p.vx) + Math.PI / 2);

      // localized torch light (lighting rule: light stays local)
      const lg = ctx.createRadialGradient(0, 0, 4, 0, 0, 150);
      lg.addColorStop(0, "rgba(255,190,90,0.20)");
      lg.addColorStop(1, "rgba(255,190,90,0)");
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(0, 0, 150, 0, TAU);
      ctx.fill();

      const bob = moving && !reduced ? Math.sin(t * 14) * 2 : 0;
      if (tokenReady && tokenImg) {
        // Wave 5 (stretch): the prey IS your profile character — a
        // circular token at the figure's own footprint (radius 15
        // vs the logic radius 14; the catch check never sees art).
        // The bearer figure above rotates to face travel; the token
        // counter-rotates so the character's face stays upright.
        // The torch below still marks the bearer.
        const R = 15;
        ctx.save();
        ctx.translate(0, -2 + bob);
        if (moving) ctx.rotate(-(Math.atan2(p.vy, p.vx) + Math.PI / 2));
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, TAU);
        ctx.clip();
        const side = Math.min(tokenImg.naturalWidth, tokenImg.naturalHeight) || R * 2;
        ctx.drawImage(
          tokenImg,
          (tokenImg.naturalWidth - side) / 2,
          (tokenImg.naturalHeight - side) / 2,
          side, side,
          -R, -R, R * 2, R * 2
        );
        ctx.restore();
        ctx.strokeStyle = "rgba(255,190,90,0.85)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -2 + bob, R, 0, TAU);
        ctx.stroke();
      } else {
        // cloak
        ctx.fillStyle = "#2c3a52";
        ctx.beginPath();
        ctx.moveTo(0, -16 + bob);
        ctx.lineTo(-11, 12);
        ctx.lineTo(11, 12);
        ctx.closePath();
        ctx.fill();
        // head
        ctx.fillStyle = "#d9b48f";
        ctx.beginPath();
        ctx.arc(0, -16 + bob, 6.5, 0, TAU);
        ctx.fill();
      }
      // torch arm + flame
      ctx.strokeStyle = "#5a3d22";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(6, -6);
      ctx.lineTo(16, -14);
      ctx.stroke();
      const fl = reduced ? 0 : Math.sin(t * 22) * 2.5;
      const fg = ctx.createRadialGradient(16, -18, 0, 16, -18, 16);
      fg.addColorStop(0, "rgba(255,220,120,0.95)");
      fg.addColorStop(0.5, "rgba(255,140,40,0.55)");
      fg.addColorStop(1, "rgba(255,120,20,0)");
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(16, -18 + fl * 0.4, 13 + fl, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    function drawCaughtWeb(p, t, progress) {
      // strands converge and wrap the player as they are rolled up
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.strokeStyle = "rgba(220,230,255,0.75)";
      ctx.lineWidth = 2;
      const strands = 14;
      for (let i = 0; i < strands; i++) {
        const a = (i / strands) * TAU + t * 0.8;
        const r0 = 26 + progress * 6;
        const r1 = 190 * (1 - progress * 0.75);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        const mx = Math.cos(a + 0.5) * ((r0 + r1) / 2);
        const my = Math.sin(a + 0.5) * ((r0 + r1) / 2);
        ctx.quadraticCurveTo(mx, my, Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.stroke();
      }
      // cocoon
      ctx.fillStyle = `rgba(200,215,240,${0.25 + progress * 0.55})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 20 + progress * 8, 30 + progress * 10, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // ------- main loop -------
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1;
      const t = now / 1000;

      const g = gameRef.current;
      if (g && g.phase !== "dead") {
        pollKeys();
        const events = updateGame(g, inputRef.current, dt);
        for (const e of events) {
          if (e.type === "nearMiss") {
            shake = Math.max(shake, 6);
            if (throttle("arachnid:nearMiss", 900)) fx.tap(); // startle tick
          }
          if (e.type === "caught") {
            shake = Math.max(shake, 10);
            fx.hit(); // the weaver has you: dull thud
          }
          if (e.type === "dead") {
            fx.death(); // rolled up and eaten: long rumble
            const sc = scoreOf(g);
            setDeadStats({
              time: g.time,
              near: g.nearMisses,
              score: sc,
            });
            setBest((prev) => {
              const nb = Math.max(prev, sc);
              try {
                localStorage.setItem("arachnid-best", String(nb));
              } catch (err) {}
              return nb;
            });
            setScreen("dead");
          }
        }
        setHud({
          t: g.time,
          stamina: g.player.stamina,
          near: g.nearMisses,
          hunted: g.spider.mode === "chase" || g.spider.mode === "windup" || g.spider.mode === "lunge",
          score: scoreOf(g),
        });
        // camera follows player
        const tx = Math.max(0, Math.min(ARENA.w, g.player.x));
        const tyy = Math.max(0, Math.min(ARENA.h, g.player.y));
        camX += (tx - camX) * Math.min(1, dt * 5);
        camY += (tyy - camY) * Math.min(1, dt * 5);
      }

      // ------- render -------
      const w = canvas.width;
      const h = canvas.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewW = w / dpr;
      const viewH = h / dpr;
      const scale = Math.min(viewW / 900, viewH / 620);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#060409";
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.save();
      ctx.translate(viewW / 2, viewH / 2);
      ctx.scale(scale, scale);
      if (shake > 0 && !reduced) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        shake *= 0.88;
        if (shake < 0.4) shake = 0;
      }
      ctx.translate(-camX, -camY);

      // cave floor: dark with procedural speckles
      const floorG = ctx.createRadialGradient(
        camX, camY, 80, camX, camY, 900
      );
      floorG.addColorStop(0, "#0d0a14");
      floorG.addColorStop(1, "#050308");
      ctx.fillStyle = floorG;
      ctx.fillRect(camX - 1000, camY - 800, 2000, 1600);
      ctx.fillStyle = "rgba(140,120,180,0.10)";
      for (let i = 0; i < 220; i++) {
        const px = ((i * 733) % ARENA.w + ARENA.w) % ARENA.w;
        const py = ((i * 389) % ARENA.h + ARENA.h) % ARENA.h;
        ctx.fillRect(px, py, 2.4, 2.4);
      }
      // arena boundary: silk walls
      ctx.strokeStyle = "rgba(200,220,255,0.28)";
      ctx.lineWidth = 5;
      ctx.strokeRect(0, 0, ARENA.w, ARENA.h);

      // decorative anchor strands across the ceiling
      ctx.strokeStyle = "rgba(190,200,240,0.10)";
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 12; i++) {
        const x0 = (i * 173) % ARENA.w;
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        ctx.quadraticCurveTo(
          x0 + 90,
          120 + Math.sin(t * 0.4 + i) * 14,
          x0 + 40,
          260
        );
        ctx.stroke();
      }

      // fireflies
      for (const f of fireflies) {
        const tw = reduced ? 0.5 : 0.3 + 0.25 * Math.sin(t * 2 + f.ph);
        ctx.fillStyle = `rgba(170,255,200,${tw * 0.7})`;
        ctx.beginPath();
        ctx.arc(
          f.x + (reduced ? 0 : Math.sin(t * 0.5 + f.ph) * 14),
          f.y + (reduced ? 0 : Math.cos(t * 0.4 + f.ph) * 10),
          f.r,
          0,
          TAU
        );
        ctx.fill();
      }

      if (g) {
        for (const web of g.webs) drawWebTrap(web, t);
        // caught wrapping under the spider so it reads as one event
        if (g.phase === "caught") {
          drawCaughtWeb(g.player, t, Math.min(1, g.caughtT / CAUGHT_DURATION));
        }
        drawSpider(g.spider, t);
        if (g.phase !== "caught") drawPlayer(g.player, t);
        // windup telegraph ring
        if (g.spider.mode === "windup") {
          ctx.strokeStyle = "rgba(255,45,45,0.7)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(
            g.spider.x,
            g.spider.y,
            SPIDER.lungeRange * (1 - g.spider.modeT / SPIDER.lungeWindup),
            0,
            TAU
          );
          ctx.stroke();
        }
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
      canvas.removeEventListener("touchstart", joyStart);
      canvas.removeEventListener("touchmove", joyMove);
      canvas.removeEventListener("touchend", joyEnd);
      canvas.removeEventListener("touchcancel", joyEnd);
    };
  }, []);

  const startGame = () => {
    gameRef.current = createGame((Date.now() % 100000) | 0);
    setScreen("play");
  };

  const setTouchSprint = (v) => {
    inputRef.current.touchSprint = v;
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#060409",
        color: "#dfe8ff",
        fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        overflow: "hidden",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* ARES interior art: page backdrop behind menus/HUD (never over gameplay) */}
      <AresBackdrop src="/images/arachnid-weaver/arachnid-weaver-bg.webp" strength={0.35} />
      <div ref={wrapRef} style={{ position: "absolute", inset: 0, touchAction: "none" }}>
        <canvas ref={canvasRef} style={{ display: "block" }} />
      </div>

      {/* HUD */}
      {screen !== "title" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            padding: "12px 14px",
            pointerEvents: "none",
            fontSize: 13,
            letterSpacing: 2,
          }}
        >
          <div>
            <div style={{ color: "#8fd0ff" }}>SURVIVED {fmtTime(hud.t)}</div>
            <div style={{ marginTop: 6, width: 150 }}>
              <div
                style={{
                  fontSize: 10,
                  color: hud.stamina < 25 ? "#ff6b6b" : "#9fe8b0",
                  marginBottom: 3,
                }}
              >
                STAMINA
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
                    width: hud.stamina + "%",
                    height: "100%",
                    borderRadius: 4,
                    background:
                      hud.stamina < 25 ? "#ff6b6b" : "linear-gradient(90deg,#57d977,#b8f36b)",
                    transition: "width 0.15s",
                  }}
                />
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#ffd98a" }}>SCORE {hud.score}</div>
            <div style={{ marginTop: 4, color: "#c9a2ff" }}>
              NEAR MISSES {hud.near}
            </div>
            {hud.hunted && (
              <div
                style={{
                  marginTop: 6,
                  color: "#ff5d5d",
                  fontWeight: "bold",
                  animation: "awblink 0.7s steps(2) infinite",
                }}
              >
                ⚠ HUNTED
              </div>
            )}
          </div>
        </div>
      )}

      {/* touch sprint button */}
      {screen === "play" && (
        <button
          onTouchStart={(e) => {
            e.preventDefault();
            setTouchSprint(true);
          }}
          onTouchEnd={() => setTouchSprint(false)}
          onMouseDown={() => setTouchSprint(true)}
          onMouseUp={() => setTouchSprint(false)}
          onMouseLeave={() => setTouchSprint(false)}
          style={{
            position: "absolute",
            right: 18,
            bottom: "max(5.5rem, calc(env(safe-area-inset-bottom) + 4.5rem))",
            width: 92,
            height: 92,
            borderRadius: "50%",
            border: "2px solid rgba(255,217,138,0.7)",
            background: "rgba(60,40,10,0.55)",
            color: "#ffd98a",
            fontSize: 12,
            letterSpacing: 2,
            fontFamily: "inherit",
            touchAction: "none",
          }}
        >
          SPRINT
        </button>
      )}

      {/* title screen */}
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
              "radial-gradient(ellipse at center, rgba(10,6,18,0.55) 0%, rgba(4,2,8,0.92) 100%)",
            padding: 24,
            zIndex: 5,
          }}
        >
          {/* ARES interior art behind the title */}
          <img
            src="/images/arachnid-weaver/arachnid-weaver-bg.webp"
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
          <div style={{ color: ARES.goldSoft, marginBottom: 6 }}>
            <AresIcon name="eye" className="h-10 w-10" />
          </div>
          <div
            style={{
              fontSize: "clamp(28px, 6vw, 54px)",
              letterSpacing: 8,
              color: "#f2ecff",
              textShadow: "0 0 24px rgba(190,120,255,0.55)",
            }}
          >
            THE ARACHNID WEAVER
          </div>
          <div style={{ marginTop: 10, color: "#9fb6d8", letterSpacing: 3, fontSize: 13 }}>
            SURVIVE THE NEST
          </div>
          <div
            style={{
              marginTop: 26,
              maxWidth: 460,
              color: "#b8c6de",
              fontSize: 14,
              lineHeight: 1.9,
            }}
          >
            You are the torch-bearer. The Weaver patrols its nest — if it sees
            you, it hunts. Sprint to escape, but watch your stamina. Web traps
            slow you down. If it catches you, you are rolled up… and eaten.
          </div>
          <div
            style={{
              marginTop: 18,
              color: "#7d8ba3",
              fontSize: 12,
              lineHeight: 2,
            }}
          >
            MOVE — WASD / arrows / left-side touch drag
            <br />
            SPRINT — hold SHIFT, SPACE, or the SPRINT button
          </div>
          <AresButton icon="flame" tone="gold" onClick={startGame} style={{ marginTop: 30 }}>
            ENTER THE NEST
          </AresButton>
          {best > 0 && (
            <div style={{ marginTop: 16, color: "#8f9bb3", fontSize: 12, letterSpacing: 2 }}>
              BEST SCORE {best}
            </div>
          )}
          </div>
        </div>
      )}

      {/* death screen */}
      {screen === "dead" && deadStats && (
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
            background: "rgba(8,3,10,0.88)",
            padding: 24,
            zIndex: 5,
          }}
        >
          {/* ARES interior art behind the death screen */}
          <img
            src="/images/arachnid-weaver/arachnid-weaver-bg.webp"
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
          <div style={{ color: "#ff8d8d", marginBottom: 6 }}>
            <AresIcon name="skull" className="h-10 w-10" />
          </div>
          <div
            style={{
              fontSize: "clamp(26px, 5vw, 44px)",
              letterSpacing: 6,
              color: "#ff8d8d",
              textShadow: "0 0 22px rgba(255,60,60,0.5)",
            }}
          >
            ROLLED UP. EATEN.
          </div>
          <div style={{ marginTop: 22, color: "#c7d2e8", fontSize: 15, lineHeight: 2.2 }}>
            Survived <b style={{ color: "#8fd0ff" }}>{fmtTime(deadStats.time)}</b>
            <br />
            Near misses <b style={{ color: "#c9a2ff" }}>{deadStats.near}</b>
            <br />
            Score <b style={{ color: "#ffd98a" }}>{deadStats.score}</b>
            <br />
            <span style={{ color: "#8f9bb3", fontSize: 13 }}>
              Best {Math.max(best, deadStats.score)}
            </span>
          </div>
          <AresButton icon="rotate" tone="crimson" onClick={startGame} style={{ marginTop: 28 }}>
            RUN AGAIN
          </AresButton>
          </div>
        </div>
      )}

      <style>{`@keyframes awblink { 50% { opacity: 0.25; } }`}</style>

      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear" />
    </div>
  );
}
