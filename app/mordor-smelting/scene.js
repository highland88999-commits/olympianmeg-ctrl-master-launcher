/*
 * Mordor Smelting — ARGUS Observatory scene.
 * Hand-rolled canvas 2D industrial foundry panorama. Zero network calls.
 * Pure helpers (top of file) are covered by headless tests.
 */

// ---------------- pure core ----------------
export const WORLD_W = 1600;
export const WORLD_H = 900;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  const p = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return "#" + p(r) + p(g) + p(b);
}

export function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

const SKY_KEYS = [
  { t: 0.0, top: "#050308", mid: "#120a16", bot: "#2a1420", star: 1, sun: 0, moon: 1 },
  { t: 0.2, top: "#050308", mid: "#120a16", bot: "#2a1420", star: 1, sun: 0, moon: 1 },
  { t: 0.25, top: "#3a1f4a", mid: "#8a3a55", bot: "#d4704a", star: 0.15, sun: 0.7, moon: 0 },
  { t: 0.35, top: "#4a6a9a", mid: "#8aa4c0", bot: "#d8e2ea", star: 0, sun: 1, moon: 0 },
  { t: 0.6, top: "#4a6a9a", mid: "#8aa4c0", bot: "#d8e2ea", star: 0, sun: 1, moon: 0 },
  { t: 0.7, top: "#3a1f4a", mid: "#9a3a55", bot: "#e06040", star: 0.15, sun: 0.7, moon: 0 },
  { t: 0.78, top: "#050308", mid: "#120a16", bot: "#2a1420", star: 1, sun: 0, moon: 1 },
  { t: 1.0, top: "#050308", mid: "#120a16", bot: "#2a1420", star: 1, sun: 0, moon: 1 },
];

export function skyAt(t) {
  t = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < SKY_KEYS.length - 2 && t >= SKY_KEYS[i + 1].t) i++;
  const A = SKY_KEYS[i];
  const B = SKY_KEYS[i + 1];
  const f = clamp((t - A.t) / (B.t - A.t || 1), 0, 1);
  const s = f * f * (3 - 2 * f);
  return {
    top: mixHex(A.top, B.top, s),
    mid: mixHex(A.mid, B.mid, s),
    bot: mixHex(A.bot, B.bot, s),
    star: lerp(A.star, B.star, s),
    sun: lerp(A.sun, B.sun, s),
    moon: lerp(A.moon, B.moon, s),
  };
}

export function timeLabel(t) {
  const h = Math.floor((((t % 1) + 1) % 1) * 24);
  if (h >= 5 && h < 8) return "DAWN";
  if (h >= 8 && h < 17) return "DAY";
  if (h >= 17 && h < 20) return "DUSK";
  return "NIGHT";
}

export function timeString(t) {
  const mins = Math.floor((((t % 1) + 1) % 1) * 24 * 60);
  return String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
}

export function defaultCamera() {
  return { x: WORLD_W / 2, y: WORLD_H / 2, z: 1 };
}

export function clampCamera(cam) {
  const z = clamp(cam.z, 0.6, 3);
  const hx = 700 / z;
  const hy = 520 / z;
  return {
    x: clamp(cam.x, WORLD_W / 2 - hx, WORLD_W / 2 + hx),
    y: clamp(cam.y, WORLD_H / 2 - hy, WORLD_H / 2 + hy),
    z,
  };
}

export function worldToScreen(wx, wy, cam, W, H) {
  return { x: (wx - cam.x) * cam.z + W / 2, y: (wy - cam.y) * cam.z + H / 2 };
}

export function screenToWorld(sx, sy, cam, W, H) {
  return { x: (sx - W / 2) / cam.z + cam.x, y: (sy - H / 2) / cam.z + cam.y };
}

export function hotspotAt(list, wx, wy, r) {
  const rr = r == null ? 40 : r;
  for (const h of list) {
    const dx = h.x - wx;
    const dy = h.y - wy;
    if (dx * dx + dy * dy <= rr * rr) return h;
  }
  return null;
}

// Pipeline stages: waste in → products out. Pure, tested.
export const STAGES = [
  { id: "intake", x: 200, y: 640, label: "INTAKE", desc: "Marine offload at The Maw; rail and truck intake on the west line." },
  { id: "sort", x: 500, y: 600, label: "SORTING", desc: "Conveyor arteries feed the sorting silos; debris never touches open ground." },
  { id: "smelt", x: 800, y: 560, label: "SMELTING", desc: "The Caldera runs at full thermal load, fusing waste into Karbonite matrix." },
  { id: "cool", x: 1250, y: 660, label: "COOLING", desc: "Seawater-flooded drydocks cool and inspect the finished megablocks." },
];

export function stageAt(x) {
  let best = STAGES[0], bd = Infinity;
  for (const s of STAGES) {
    const d = Math.abs(s.x - x);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// ---------------- module data ----------------
export const HOTSPOTS = [
  { id: "maw", x: 200, y: 560, title: "The Maw — Deep-Water Port", body: "1.2 km of coastline, 15 berths. Gantry cranes lift 200 tonnes each, offloading compressed marine plastic from the extraction fleet." },
  { id: "silos", x: 470, y: 520, title: "Intake Silos", body: "Landfill freight arrives by dedicated rail spur through a biometric weigh station; 800,000 sq m of freight yard never sleeps." },
  { id: "caldera", x: 800, y: 470, title: "The Caldera — Smelting Core", body: "1.5 sq km of thermal processing. Waste is fused here into buoyant Karbonite and Basalt matrices for the island hull." },
  { id: "eye", x: 1150, y: 330, title: "Eye of Artemis", body: "A 150 m central spire where the site intelligence manages thermal loads, crane automation and monorail traffic." },
  { id: "docks", x: 1380, y: 700, title: "Cooling & Assembly Docks", body: "600,000 sq m of seawater-flooded drydocks where Karbonite megablocks are cooled and inspected before tow-out." },
];

export const ACCENT = "#ff2d78";

// ---------------- scene ----------------
const rng = mulberry32(0xbeef);
const STARS = Array.from({ length: 120 }, () => ({ x: rng() * WORLD_W, y: rng() * 480, r: 0.4 + rng() * 1.3, p: rng() * 6.28 }));
const STACKS = [560, 640, 720, 880];
const SMOKE = Array.from({ length: 26 }, () => ({ sx: 0, x: 0, y: 0, vy: 0, r: 0, a: 0, seed: rng() * 1000 }));
const WAVES = Array.from({ length: 40 }, (_, i) => ({ x: (i / 40) * WORLD_W + rng() * 30, p: rng() * 6.28 }));

export function createScene(canvas, opts) {
  const onHotspot = (opts && opts.onHotspot) || function () {};
  const ctx = canvas.getContext("2d");
  const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0, H = 0, dpr = 1;
  const state = { time: 0.95, cycle: true, cam: defaultCamera(), selected: null, fly: false, t: 0 };
  const flow = [];
  let flowSeed = 4242;

  STACKS.forEach((sx, si) => {
    for (let i = 0; i < 7; i++) {
      SMOKE[si * 7 + i].sx = sx;
      SMOKE[si * 7 + i].x = sx + (rng() - 0.5) * 40;
      SMOKE[si * 7 + i].y = 420 - rng() * 260;
      SMOKE[si * 7 + i].vy = 18 + rng() * 26;
      SMOKE[si * 7 + i].r = 14 + rng() * 26;
    }
  });

  function resize() {
    dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  function layerX(wx, factor) {
    const cx = WORLD_W / 2 + (state.cam.x - WORLD_W / 2) * factor;
    return (wx - cx) * state.cam.z + W / 2;
  }
  function syOf(wy) { return (wy - state.cam.y) * state.cam.z + H / 2; }
  function w2s(wx, wy) { return worldToScreen(wx, wy, state.cam, W, H); }

  function spawnFlow() {
    const r = mulberry32((flowSeed = (flowSeed * 1103515245 + 12345) & 0x7fffffff));
    flow.push({ leg: 0, p: 0, speed: 0.06 + r() * 0.05, r: 3 + r() * 3 });
  }

  // conveyor path legs (world coords)
  const LEGS = [
    [[200, 640], [500, 600]],
    [[500, 600], [800, 560]],
    [[800, 560], [1250, 660]],
  ];
  function legPoint(leg, p) {
    const A = LEGS[leg][0], B = LEGS[leg][1];
    return { x: lerp(A[0], B[0], p), y: lerp(A[1], B[1], p) };
  }

  function draw(now) {
    const dt = Math.min(0.05, (now - (draw.last || now)) / 1000);
    draw.last = now;
    if (!reduced) state.t += dt;
    if (state.fly && !reduced) {
      state.cam.x = WORLD_W / 2 + Math.sin(state.t * 0.1) * 420;
      state.cam = clampCamera(state.cam);
    }

    const sky = skyAt(state.time);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky.top);
    g.addColorStop(0.55, sky.mid);
    g.addColorStop(1, sky.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (sky.star > 0.02) {
      ctx.save();
      for (const s of STARS) {
        ctx.globalAlpha = sky.star * (0.6 + 0.4 * Math.sin(state.t * 2 + s.p)) * 0.9;
        ctx.fillStyle = "#d8e2ff";
        ctx.fillRect(layerX(s.x, 0.15), syOf(s.y), s.r, s.r);
      }
      ctx.restore();
    }
    const sp = clamp((state.time - 0.25) / 0.5, 0, 1);
    if (sky.sun > 0.02 && sp > 0 && sp < 1) {
      const sx = W * 0.12 + sp * W * 0.76;
      const syy = H * 0.7 - Math.sin(sp * Math.PI) * H * 0.5;
      ctx.fillStyle = "rgba(255,240,210," + (0.9 * sky.sun) + ")";
      ctx.beginPath();
      ctx.arc(sx, syy, 20, 0, 6.29);
      ctx.fill();
    }

    const dark = 1 - sky.sun * 0.55;
    const z = state.cam.z;

    // distant hills
    ctx.fillStyle = mixHex("#241a26", "#0b080e", dark);
    ctx.beginPath();
    ctx.moveTo(-50, H + 50);
    for (let i = 0; i <= 16; i++) ctx.lineTo(layerX((i / 16) * WORLD_W, 0.3), syOf(480 - 60 * Math.abs(Math.sin(i * 1.7))));
    ctx.lineTo(W + 50, H + 50);
    ctx.closePath();
    ctx.fill();

    // sea
    const seaY = syOf(740);
    ctx.fillStyle = mixHex("#10222e", "#04090d", dark);
    ctx.fillRect(0, seaY, W, H - seaY + 2);
    ctx.save();
    ctx.strokeStyle = "rgba(120,200,230,0.35)";
    ctx.lineWidth = 1.5;
    for (const wv of WAVES) {
      const off = reduced ? 0 : Math.sin(state.t * 1.5 + wv.p) * 8;
      const s = w2s(wv.x, 760);
      ctx.beginPath();
      ctx.moveTo(s.x - 24 * z, s.y + off * 0.3);
      ctx.quadraticCurveTo(s.x, s.y - 6 + off * 0.3, s.x + 24 * z, s.y + off * 0.3);
      ctx.stroke();
    }
    ctx.restore();

    // ground slab
    ctx.fillStyle = mixHex("#1a1418", "#080608", dark);
    ctx.fillRect(0, syOf(560), W, seaY - syOf(560));

    // port cranes at The Maw
    ctx.strokeStyle = mixHex("#3a3f4a", "#15171c", dark);
    ctx.lineWidth = 6 * z;
    for (const kx of [120, 200, 280]) {
      const s = w2s(kx, 560);
      ctx.beginPath();
      ctx.moveTo(s.x - 30 * z, syOf(740));
      ctx.lineTo(s.x - 30 * z, s.y - 140 * z);
      ctx.lineTo(s.x + 50 * z, s.y - 140 * z);
      ctx.lineTo(s.x + 50 * z, s.y - 100 * z);
      ctx.stroke();
      ctx.fillStyle = mixHex("#ff8a2a", "#7a3a10", dark * 0.5);
      ctx.fillRect(s.x + 40 * z, s.y - 100 * z, 20 * z, 14 * z);
    }

    // intake silos
    ctx.fillStyle = mixHex("#2e3440", "#101318", dark);
    for (let i = 0; i < 4; i++) {
      const s = w2s(400 + i * 55, 560);
      ctx.fillRect(s.x - 20 * z, s.y - 90 * z, 40 * z, 90 * z);
      ctx.beginPath();
      ctx.arc(s.x, s.y - 90 * z, 20 * z, Math.PI, 0);
      ctx.fill();
    }

    // smokestacks with smoke + beacons
    for (const sx of STACKS) {
      const s = w2s(sx, 420);
      ctx.fillStyle = mixHex("#232028", "#0c0a0d", dark);
      ctx.beginPath();
      ctx.moveTo(s.x - 26 * z, syOf(560));
      ctx.lineTo(s.x - 16 * z, s.y);
      ctx.lineTo(s.x + 16 * z, s.y);
      ctx.lineTo(s.x + 26 * z, syOf(560));
      ctx.closePath();
      ctx.fill();
      // beacon (localized glow)
      const blink = reduced ? 0.8 : 0.5 + 0.5 * Math.sin(state.t * 3 + sx);
      const bg = ctx.createRadialGradient(s.x, s.y - 8 * z, 0, s.x, s.y - 8 * z, 26 * z);
      bg.addColorStop(0, "rgba(255,60,60," + (0.85 * blink) + ")");
      bg.addColorStop(1, "rgba(255,60,60,0)");
      ctx.fillStyle = bg;
      ctx.fillRect(s.x - 26 * z, s.y - 34 * z, 52 * z, 52 * z);
      ctx.fillStyle = "#ff5050";
      ctx.beginPath();
      ctx.arc(s.x, s.y - 8 * z, 4 * z, 0, 6.29);
      ctx.fill();
    }
    // smoke
    ctx.save();
    for (const m of SMOKE) {
      if (!reduced) {
        m.y -= m.vy * dt;
        m.x += Math.sin(state.t + m.seed) * 12 * dt;
        if (m.y < 120) { m.y = 420; m.x = m.sx + (mulberry32((m.seed * 1000) | 0)() - 0.5) * 40; }
      }
      const s = w2s(m.x, m.y);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#5a5560";
      ctx.beginPath();
      ctx.arc(s.x, s.y, m.r * z, 0, 6.29);
      ctx.fill();
    }
    ctx.restore();

    // The Caldera — furnace dome with molten slit
    const cs = w2s(800, 560);
    ctx.fillStyle = mixHex("#2b2226", "#0e0b0d", dark);
    ctx.beginPath();
    ctx.arc(cs.x, cs.y, 110 * z, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cs.x - 110 * z, cs.y - 10 * z, 220 * z, 10 * z);
    const pulse = reduced ? 0.85 : 0.75 + 0.2 * Math.sin(state.t * 2.4);
    const mg = ctx.createRadialGradient(cs.x, cs.y - 30 * z, 0, cs.x, cs.y - 30 * z, 120 * z);
    mg.addColorStop(0, "rgba(255,150,40," + (0.8 * pulse) + ")");
    mg.addColorStop(1, "rgba(255,80,20,0)");
    ctx.fillStyle = mg;
    ctx.fillRect(cs.x - 120 * z, cs.y - 150 * z, 240 * z, 160 * z);
    ctx.fillStyle = "#ffc23f";
    ctx.fillRect(cs.x - 70 * z, cs.y - 44 * z, 140 * z, 12 * z);

    // Eye of Artemis spire + sweeping beam (subtle, localized)
    const es = w2s(1150, 560);
    ctx.fillStyle = mixHex("#232a3a", "#0b0e15", dark);
    ctx.beginPath();
    ctx.moveTo(es.x - 18 * z, es.y);
    ctx.lineTo(es.x, es.y - 230 * z);
    ctx.lineTo(es.x + 18 * z, es.y);
    ctx.closePath();
    ctx.fill();
    const beamA = reduced ? 0.6 : state.t * 0.7;
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#9fd4ff";
    ctx.beginPath();
    ctx.moveTo(es.x, es.y - 225 * z);
    ctx.lineTo(es.x + Math.cos(beamA) * 260 * z, es.y - 225 * z + Math.sin(beamA) * 120 * z);
    ctx.lineTo(es.x + Math.cos(beamA + 0.12) * 260 * z, es.y - 225 * z + Math.sin(beamA + 0.12) * 120 * z);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#9fd4ff";
    ctx.beginPath();
    ctx.arc(es.x, es.y - 228 * z, 6 * z, 0, 6.29);
    ctx.fill();

    // cooling docks: block rows
    ctx.fillStyle = mixHex("#2a3038", "#0e1116", dark);
    for (let i = 0; i < 6; i++) {
      const s = w2s(1300 + (i % 3) * 60, 700 + Math.floor(i / 3) * 40);
      ctx.fillRect(s.x - 24 * z, s.y - 20 * z, 48 * z, 20 * z);
    }

    // conveyor legs + flow dots
    ctx.save();
    ctx.strokeStyle = mixHex("#4a4438", "#1a1712", dark);
    ctx.lineWidth = 8 * z;
    for (const leg of LEGS) {
      const A = w2s(leg[0][0], leg[0][1]), B = w2s(leg[1][0], leg[1][1]);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }
    ctx.restore();
    if (state.cycle && !reduced) {
      while (flow.length < 26) spawnFlow();
      ctx.fillStyle = "#ffb01f";
      for (let i = flow.length - 1; i >= 0; i--) {
        const f = flow[i];
        f.p += f.speed * dt;
        if (f.p >= 1) {
          if (f.leg < LEGS.length - 1) { f.leg++; f.p = 0; }
          else { flow.splice(i, 1); continue; }
        }
        const pt = legPoint(f.leg, f.p);
        const s = w2s(pt.x, pt.y - 8);
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.arc(s.x, s.y, f.r, 0, 6.29);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // stage markers
    ctx.save();
    ctx.font = (11 * z + 4) + "px system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const st of STAGES) {
      const s = w2s(st.x, st.y - 60);
      ctx.fillStyle = "rgba(10,6,8,0.8)";
      ctx.fillRect(s.x - 52 * z, s.y - 14, 104 * z, 26);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(s.x - 52 * z, s.y - 14, 104 * z, 26);
      ctx.fillStyle = ACCENT;
      ctx.fillText(st.label, s.x, s.y + 4);
    }
    ctx.restore();

    // hotspots
    for (const h of HOTSPOTS) {
      const s = w2s(h.x, h.y);
      const sel = state.selected && state.selected.id === h.id;
      const pr = reduced ? 12 : 10 + 4 * Math.sin(state.t * 4);
      ctx.beginPath();
      ctx.arc(s.x, s.y, (sel ? 16 : pr) * z * 0.9 + 4, 0, 6.29);
      ctx.strokeStyle = ACCENT;
      ctx.globalAlpha = sel ? 1 : 0.75;
      ctx.lineWidth = sel ? 3 : 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = sel ? "#fff" : ACCENT;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4.5, 0, 6.29);
      ctx.fill();
    }

    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  let raf = 0, dragging = false, moved = false, lx = 0, ly = 0, pinchD = 0;
  function loop(now) { draw(now); raf = requestAnimationFrame(loop); }

  function pick(sx, sy) {
    const r = canvas.getBoundingClientRect();
    const w = screenToWorld(sx - r.left, sy - r.top, state.cam, W, H);
    return hotspotAt(HOTSPOTS, w.x, w.y, 46 / state.cam.z);
  }

  canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); dragging = true; moved = false; lx = e.clientX; ly = e.clientY; });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    state.cam.x -= dx / state.cam.z;
    state.cam.y -= dy / state.cam.z;
    state.cam = clampCamera(state.cam);
    lx = e.clientX; ly = e.clientY;
  });
  canvas.addEventListener("pointerup", (e) => {
    dragging = false;
    if (!moved) {
      const h = pick(e.clientX, e.clientY);
      state.selected = h;
      onHotspot(h);
    }
  });
  canvas.addEventListener("pointercancel", () => { dragging = false; });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    state.cam.z = clamp(state.cam.z * (e.deltaY < 0 ? 1.12 : 0.89), 0.6, 3);
    state.cam = clampCamera(state.cam);
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pinchD > 0) state.cam.z = clamp(state.cam.z * (d / pinchD), 0.6, 3);
      pinchD = d;
    }
  }, { passive: true });
  canvas.addEventListener("touchend", () => { pinchD = 0; });

  const api = {
    setTime(t) { state.time = t; if (reduced) draw(performance.now()); },
    setCycle(v) { state.cycle = !!v; if (reduced) draw(performance.now()); },
    setFly(v) { state.fly = !!v && !reduced; },
    focus(h) {
      state.cam.x = h.x; state.cam.y = h.y - 60;
      state.cam.z = Math.max(state.cam.z, 1.5);
      state.cam = clampCamera(state.cam);
      state.selected = h;
    },
    clearSelection() { state.selected = null; },
    render() { draw(performance.now()); },
    destroy() { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); },
  };

  if (reduced) draw(performance.now());
  else loop(performance.now());
  return api;
}
