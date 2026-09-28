"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { simulateDay, fmtHour } from "./engine.js";

/**
 * Olympus Energy — simulated microgrid console.
 * Solar, wind, demand and battery over a 24h cycle. Deterministic. Zero network.
 */
export default function OlympusEnergyPage() {
  const chartRef = useRef(null);
  const [solarKW, setSolarKW] = useState(20);
  const [turbines, setTurbines] = useState(2);
  const [windSpeed, setWindSpeed] = useState(7);
  const [cloud, setCloud] = useState(0.3);
  const [demandKW, setDemandKW] = useState(18);
  const [batteryKWh, setBatteryKWh] = useState(40);
  const [scrub, setScrub] = useState(12);

  const sim = useMemo(
    () => simulateDay({ solarKW, turbines, turbineKW: 5, windSpeed, cloud, demandKW, batteryKWh, seed: 42 }),
    [solarKW, turbines, windSpeed, cloud, demandKW, batteryKWh]
  );

  useEffect(() => {
    document.title = "Olympus Energy";
    const canvas = chartRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = r.width, h = r.height;
      ctx.fillStyle = "#04070c";
      ctx.fillRect(0, 0, w, h);

      const pad = { l: 44, r: 12, t: 14, b: 26 };
      const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
      const steps = sim.steps;
      const maxKW = Math.max(1, ...steps.map((s) => Math.max(s.gen, s.demand)));
      const X = (i) => pad.l + (i / (steps.length - 1)) * iw;
      const Y = (v) => pad.t + ih - (v / maxKW) * ih;

      // gridlines
      ctx.strokeStyle = "rgba(90,140,190,0.15)";
      ctx.fillStyle = "#5f7fa6";
      ctx.font = "10px ui-monospace, monospace";
      ctx.lineWidth = 1;
      for (let g = 0; g <= 4; g++) {
        const v = (maxKW * g) / 4;
        ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(w - pad.r, Y(v)); ctx.stroke();
        ctx.fillText(`${v.toFixed(0)}kW`, 4, Y(v) + 3);
      }
      for (let hh = 0; hh <= 24; hh += 6) {
        ctx.fillText(fmtHour(hh), X(hh * 4) - 12, h - 8);
      }

      // battery fill under curve (subtle)
      ctx.beginPath();
      steps.forEach((s, i) => { const x = X(i), y = Y(s.batteryPct * maxKW); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.lineTo(X(steps.length - 1), pad.t + ih);
      ctx.lineTo(X(0), pad.t + ih);
      ctx.closePath();
      ctx.fillStyle = "rgba(90,200,255,0.08)";
      ctx.fill();

      const line = (key, color, width, dash = []) => {
        ctx.beginPath();
        ctx.setLineDash(dash);
        steps.forEach((s, i) => { const x = X(i), y = Y(s[key]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
        ctx.setLineDash([]);
      };
      line("demand", "#ff7a7a", 1.5, [5, 4]);
      line("gen", "#ffd34d", 2);
      line("solar", "#ffb066", 1);
      line("wind", "#8ef3ff", 1);

      // scrub cursor
      const si = Math.round(scrub * 4);
      const sx = X(Math.min(95, si));
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath(); ctx.moveTo(sx, pad.t); ctx.lineTo(sx, pad.t + ih); ctx.stroke();
    }
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [sim, scrub]);

  const T = sim.totals;
  const at = sim.steps[Math.min(95, Math.round(scrub * 4))];
  const slider = (label, value, set, min, max, step, unit) => (
    <div key={label}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, letterSpacing: 1, color: "#5f7fa6", textTransform: "uppercase" }}>
        <span>{label}</span><span style={{ color: "#cfeaff" }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} style={{ width: "100%" }}
        aria-label={label} onChange={(e) => set(Number(e.target.value))} />
    </div>
  );

  const card = {
    background: "rgba(6,12,22,0.9)", border: "1px solid rgba(142,243,255,0.2)",
    borderRadius: 10, padding: 12, fontSize: 12, color: "#9db8d6",
  };
  const kpi = (label, value, color) => (
    <div style={card}>
      <div style={{ fontSize: 11, letterSpacing: 1.5, color: "#5f7fa6", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, color, marginTop: 4 }}>{value}</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#04070c", color: "#cfeaff", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", padding: 16, paddingBottom: 48 }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, letterSpacing: 3, textAlign: "center", color: "#8ef3ff", margin: "8px 0 2px" }}>OLYMPUS ENERGY</h1>
        <p style={{ textAlign: "center", color: "#5f7fa6", fontSize: 12, marginTop: 0 }}>simulated microgrid console · deterministic · all local</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 12 }}>
          {kpi("Generated / day", `${T.generated.toFixed(1)} kWh`, "#ffd34d")}
          {kpi("Grid import", `${T.gridImport.toFixed(1)} kWh`, "#ff7a7a")}
          {kpi("Self-sufficient", `${Math.round(T.selfSufficiency * 100)}%`, "#8ef3ff")}
          {kpi("Curtailed", `${T.curtailed.toFixed(1)} kWh`, "#c99aff")}
        </div>

        <div style={{ ...card, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
            <span style={{ color: "#5f7fa6" }}>24H GENERATION VS DEMAND</span>
            <span><span style={{ color: "#ffd34d" }}>— gen</span> <span style={{ color: "#ffb066" }}>— solar</span> <span style={{ color: "#8ef3ff" }}>— wind</span> <span style={{ color: "#ff7a7a" }}>- - demand</span></span>
          </div>
          <canvas ref={chartRef} style={{ width: "100%", height: 240, display: "block" }} />
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#5f7fa6" }}>
              <span>TIME SCRUB</span><span style={{ color: "#cfeaff" }}>{fmtHour(scrub)}</span>
            </div>
            <input type="range" min={0} max={24} step={0.25} value={scrub} style={{ width: "100%" }}
              aria-label="Time of day" onChange={(e) => setScrub(Number(e.target.value))} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8, marginTop: 6, fontSize: 12 }}>
              <div>Solar <b style={{ color: "#ffb066" }}>{at.solar.toFixed(1)} kW</b></div>
              <div>Wind <b style={{ color: "#8ef3ff" }}>{at.wind.toFixed(1)} kW</b></div>
              <div>Demand <b style={{ color: "#ff7a7a" }}>{at.demand.toFixed(1)} kW</b></div>
              <div>Battery <b style={{ color: "#8ef3ff" }}>{Math.round(at.batteryPct * 100)}%</b></div>
            </div>
          </div>
        </div>

        <div style={{ ...card, display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, letterSpacing: 2, color: "#8ef3ff" }}>GRID CONTROLS</div>
          {slider("Solar array", solarKW, setSolarKW, 0, 60, 1, " kW")}
          {slider("Wind turbines", turbines, setTurbines, 0, 8, 1, " × 5 kW")}
          {slider("Wind speed", windSpeed, setWindSpeed, 0, 20, 0.5, " m/s")}
          {slider("Cloud cover", cloud, setCloud, 0, 1, 0.05, "")}
          {slider("Peak demand", demandKW, setDemandKW, 4, 40, 1, " kW")}
          {slider("Battery", batteryKWh, setBatteryKWh, 10, 120, 5, " kWh")}
        </div>
      </div>
    </div>
  );
}
