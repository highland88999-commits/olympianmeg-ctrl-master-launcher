"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fx } from "@/lib/fx";
import GoldBalance from "@/components/economy/GoldBalance";
import {
  newState, pourTick, refineTick, barValue, sellBars, buyUpgrade,
  upgradeCost, vatCapacity, flowRate, canSurge, activateSurge,
  surgeRemaining, surgeCooldownRemaining, setPouring, createHoldPour, UPGRADE_DEFS, TICK,
} from "./engine.js";

/**
 * Liquid Gold Refinery — idle refinery game.
 * Pour crude, refine to purity, mint bars, sell, upgrade.
 *
 * Selling bars also earns real gold (in-house credit): every sell sends the
 * append-only action log to /api/economy/mine/claim, which replays the game
 * server-side and credits gold only for what the replay proves. The log is
 * never cleared except on RESET, so retries and continued play stay safe.
 */
export default function LiquidGoldPage() {
  const canvasRef = useRef(null);
  const [, force] = useState(0);
  const [goldNotice, setGoldNotice] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const goldBalanceRef = useRef(null);
  const stateRef = useRef(null);
  if (!stateRef.current) stateRef.current = newState();
  const logRef = useRef([]);
  const holdRef = useRef(null);
  if (!holdRef.current) holdRef.current = createHoldPour();
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function rerender() { force((n) => n + 1); }

  // Stamp an action with the number of completed game ticks — the server
  // replays actions in exactly this order.
  function logAction(entry) {
    logRef.current.push({ t: Math.round(stateRef.current.now / TICK), ...entry });
  }

  async function claimGold() {
    const log = logRef.current.slice();
    const tickCount = Math.round(stateRef.current.now / TICK);
    if (log.length === 0) return;
    setClaiming(true);
    setGoldNotice("Verifying your bars…");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setGoldNotice("Bars sold locally. Sign in from the launcher to turn bars into real gold.");
        return;
      }
      const res = await fetch("/api/economy/mine/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ log, tickCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not verify your bars.");
      setGoldNotice(data.notice || (data.creditedGold > 0 ? `+${data.creditedGold} gold.` : null));
      fx.checkoutConfirm(); // bars sold, gold credited — confirm it
      goldBalanceRef.current?.refresh();
    } catch (err) {
      setGoldNotice(err.message || "Could not verify your bars.");
      fx.error(); // claim failed: the user needs to know and retry
    } finally {
      setClaiming(false);
    }
  }

  // Hold-to-pour: press starts the pour, release stops it. The helper is
  // idempotent, so repeat/overlapping pointer events can't double-log or
  // leave the pour stuck on. Actions are logged {a:"pour",on} so the
  // server-side replay sees exactly the same event stream as before.
  function pressStart() {
    if (!holdRef.current.press()) return;
    setPouring(stateRef.current, true);
    logAction({ a: "pour", on: true });
    rerender();
  }
  function pressEnd() {
    if (!holdRef.current.release()) return;
    setPouring(stateRef.current, false);
    logAction({ a: "pour", on: false });
    rerender();
  }

  function handleSell() {
    const st = stateRef.current;
    if (st.bars === 0 || claiming) return;
    logAction({ a: "sell" });
    sellBars(st);
    rerender();
    claimGold();
  }

  useEffect(() => {
    document.title = "Liquid Gold Refinery";
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const drip = { x: 0, y: 0, on: false, t: 0 };

    function draw(now) {
      if (!ctx) return;
      const st = stateRef.current;
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.floor(r.width * dpr)) {
        canvas.width = Math.floor(r.width * dpr);
        canvas.height = Math.floor(r.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = r.width, h = r.height;
      ctx.fillStyle = "#060502";
      ctx.fillRect(0, 0, w, h);

      // silo
      const sx = w / 2 - 70, sy = 24, sw = 140, sh = h - 70;
      const cap = vatCapacity(st);
      const level = Math.min(1, st.crude / cap);
      const ly = sy + sh * (1 - level);
      const pur = st.purity;

      // pour stream
      if (st.pouring && !reduced) {
        drip.t = now / 60;
        const px = w / 2;
        ctx.fillStyle = "rgba(255,200,40,0.85)";
        const wob = Math.sin(drip.t) * 1.5;
        ctx.fillRect(px - 2 + wob, 0, 4, ly);
      }

      // glass
      ctx.strokeStyle = "#3a3a2a";
      ctx.lineWidth = 4;
      ctx.strokeRect(sx, sy, sw, sh);
      // liquid — localized gold glow
      if (level > 0.005) {
        const g = ctx.createLinearGradient(0, ly, 0, sy + sh);
        const light = 30 + pur * 45;
        g.addColorStop(0, `hsla(${44 + pur * 6},95%,${light + 18}%,0.95)`);
        g.addColorStop(1, `hsla(40,90%,${light - 10}%,0.95)`);
        ctx.fillStyle = g;
        ctx.fillRect(sx + 4, ly, sw - 8, sy + sh - 4 - ly);
        // bubbles
        ctx.fillStyle = "rgba(255,240,180,0.5)";
        for (let i = 0; i < 8; i++) {
          const bx = sx + 12 + ((i * 37 + now / 30) % (sw - 24));
          const by = ly + 10 + ((i * 53 + now / 22) % Math.max(1, (sy + sh - ly - 20)));
          ctx.beginPath(); ctx.arc(bx, by, 1.6, 0, Math.PI * 2); ctx.fill();
        }
      }
      // pipes
      ctx.fillStyle = "#222";
      ctx.fillRect(sx - 46, 8, 46, 12);
      ctx.fillRect(sx + sw, 8, 46, 12);
      // label
      ctx.fillStyle = "#c9a227";
      ctx.font = "11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`CRUDE ${st.crude.toFixed(1)} / ${cap} L`, w / 2, h - 44);
      ctx.fillText(`PURITY ${(pur * 100).toFixed(1)}%`, w / 2, h - 28);
      ctx.fillText(`FLOW ${flowRate(st).toFixed(1)} L/s${st.now < st.surgeUntil ? " · SURGE ×3" : ""}`, w / 2, h - 12);

      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    const iv = setInterval(() => {
      const st = stateRef.current;
      st.now += TICK;
      pourTick(st, TICK);
      const minted = refineTick(st, TICK);
      if (minted > 0) fx.victory(); // bar minted — the victory moment
      rerender();
    }, TICK * 1000);

    return () => { cancelAnimationFrame(raf); clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const st = stateRef.current;
  const gold = { color: "#ffd34d" };
  const btn = {
    background: "rgba(20,14,4,0.92)", color: "#ffd34d", border: "1px solid rgba(255,211,77,0.45)",
    borderRadius: 8, padding: "12px", fontSize: 14, cursor: "pointer", fontFamily: "inherit", width: "100%",
  };
  const card = {
    background: "rgba(10,8,3,0.85)", border: "1px solid rgba(255,211,77,0.25)",
    borderRadius: 10, padding: 12, fontSize: 12, color: "#e8cf8a",
  };
  const surgeCD = surgeCooldownRemaining(st);
  const pouring = st.pouring;

  return (
    <div style={{ minHeight: "100dvh", background: "#060502", color: "#e8cf8a", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", padding: 16, paddingBottom: 40 }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ ...gold, fontSize: 20, letterSpacing: 3, textAlign: "center", margin: "8px 0 2px" }}>LIQUID GOLD REFINERY</h1>
        <p style={{ textAlign: "center", color: "#8a7648", fontSize: 12, marginTop: 0 }}>hold to pour crude · refine to 98% purity · bar mints automatically · sell · upgrade</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div style={card}>CREDITS<div style={{ fontSize: 22, color: "#ffd34d" }}>{st.credits}</div>
            <div style={{ fontSize: 11, color: "#8a7648" }}>in-game only</div></div>
          <div style={card}>GOLD BARS<div style={{ fontSize: 22, color: "#ffd34d" }}>{st.bars}</div>
            <div style={{ fontSize: 11, color: "#8a7648" }}>each worth {barValue(st)}</div>
            {st.now - st.lastMintAt < 3 && <div style={{ fontSize: 12, color: "#fff3b0", marginTop: 4 }}>⚒ BAR MINTED</div>}</div>
        </div>

        <div style={{ ...card, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div>
            <div style={{ color: "#ffd34d", fontSize: 13 }}>REAL GOLD</div>
            <div style={{ fontSize: 11, color: "#8a7648" }}>selling bars earns it · dollars off at checkout</div>
          </div>
          <GoldBalance ref={goldBalanceRef} label="" hideWhenZero={false} style={{ fontSize: 15, color: "#ffd34d", whiteSpace: "nowrap" }} />
        </div>
        {goldNotice && <div style={{ ...card, marginBottom: 12, color: "#fff3b0" }}>{goldNotice}</div>}

        <canvas ref={canvasRef} style={{ width: "100%", height: 340, border: "1px solid rgba(255,211,77,0.25)", borderRadius: 10, background: "#060502", display: "block" }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "12px 0" }}>
          {/* Hold-to-pour: press-and-hold pours, release stops. Pointer capture
              keeps the release registered even if the finger slides off the
              button; context menu + callout suppression kills the iPhone
              long-press popup. */}
          <button style={{
            ...btn,
            background: pouring ? "rgba(120,80,10,0.9)" : btn.background,
            touchAction: "none", userSelect: "none",
            WebkitUserSelect: "none", WebkitTouchCallout: "none",
          }}
            aria-pressed={pouring}
            aria-label={pouring ? "Pouring — release to stop" : "Press and hold to pour"}
            onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); pressStart(); }}
            onPointerUp={pressEnd}
            onPointerCancel={pressEnd}
            onLostPointerCapture={pressEnd}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) pressStart(); }}
            onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") pressEnd(); }}
          >
            {pouring ? "⛽ POURING — HOLDING" : "HOLD TO POUR"}
          </button>
          <button style={btn} disabled={st.bars === 0 || claiming} onClick={handleSell}>
            {claiming ? "VERIFYING…" : `SELL ${st.bars} BAR${st.bars === 1 ? "" : "S"}`}
          </button>
          <button style={btn} disabled={!canSurge(st)} onClick={() => { if (activateSurge(st)) logAction({ a: "surge" }); rerender(); }}>
            {st.now < st.surgeUntil ? `SURGE ${surgeRemaining(st).toFixed(0)}s` : surgeCD > 0 ? `SURGE COOLDOWN ${surgeCD.toFixed(0)}s` : "ACTIVATE SURGE ×3"}
          </button>
          <button style={btn} onClick={() => { stateRef.current = newState(); logRef.current = []; setGoldNotice(null); rerender(); }}>RESET</button>
        </div>

        <h2 style={{ fontSize: 13, letterSpacing: 2, color: "#c9a227" }}>UPGRADES</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {Object.keys(UPGRADE_DEFS).map((k) => {
            const def = UPGRADE_DEFS[k];
            const lvl = st.upgrades[k];
            const cost = upgradeCost(k, lvl);
            return (
              <div key={k} style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div><div style={{ color: "#ffd34d" }}>{def.name} <span style={{ color: "#8a7648" }}>lv {lvl}</span></div>
                  <div style={{ fontSize: 11, color: "#8a7648" }}>{def.desc}</div></div>
                <button style={{ ...btn, width: "auto", padding: "10px 16px" }} disabled={st.credits < cost}
                  onClick={() => { if (buyUpgrade(st, k)) logAction({ a: "buy", kind: k }); rerender(); }}>{cost} cr</button>
              </div>
            );
          })}
        </div>

        <div style={card}>LIFETIME POURED<div style={{ fontSize: 16 }}>{st.pouredTotal.toFixed(1)} L · {st.barsMinted} bars minted</div></div>

        {/* Safari bottom-bar clearance */}
        <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
      </div>
    </div>
  );
}
