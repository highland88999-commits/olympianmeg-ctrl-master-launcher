/*
 * Mount Doom — ARGUS Observatory scene.
 * Hand-rolled canvas 2D volcanic panorama. Zero network calls.
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
  { t: 0.0, top: "#04050d", mid: "#0b0a1e", bot: "#1a1226", star: 1, sun: 0, moon: 1 },
  { t: 0.2, top: "#04050d", mid: "#0b0a1e", bot: "#1a1226", star: 1, sun: 0, moon: 1 },
  { t: 0.25, top: "#2c2358", mid: "#8a4a6e", bot: "#ff9a5a", star: 0.15, sun: 0.7, moon: 0 },
  { t: 0.35, top: "#3f8fd6", mid: "#8fc7ef", bot: "#e8f4ff", star: 0, sun: 1, moon: 0 },
  { t: 0.6, top: "#3f8fd6", mid: "#8fc7ef", bot: "#e8f4ff", star: 0, sun: 1, moon: 0 },
  { t: 0.7, top: "#2c2358", mid: "#a04a5e", bot: "#ff6a4a", star: 0.15, sun: 0.7, moon: 0 },
  { t: 0.78, top: "#04050d", mid: "#0b0a1e", bot: "#1a1226", star: 1, sun: 0, moon: 1 },
  { t: 1.0, top: "#04050d", mid: "#0b0a1e", bot: "#1a1226", star: 1, sun: 0, moon: 1 },
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

// ---------------- module data ----------------
export const HOTSPOTS = [
  { id: "summit", x: 800, y: 300, title: "The Summit", body: "Orodruin's crown at 4,500 ft. The air shimmers here; the crater mouth glows even at noon." },
  { id: "crater", x: 800, y: 400, title: "Crater Forge", body: "The open vent. Molten rock wells up from the deep mantle and spills over the crater rim." },
  { id: "river", x: 1010, y: 620, title: "River of Fire", body: "A lava channel cuts down the eastern flank, feeding the ash plains below. Flow rate rises with eruption intensity." },
  { id: "ash", x: 380, y: 700, title: "Ashen Fields", body: "Grey wastes west of the cone. Fine ash falls like snow and swallows every footstep." },
  { id: "gate", x: 1260, y: 720, title: "Orodruin Gate", body: "The only safe approach: a basalt causeway winding up from the eastern plains to the forge." },
];

export const ACCENT = "#ff5a1f";

// ---------------- scene ----------------
const rng = mulberry32(0xd00d);
const STARS = Array.from({ length: 150 }, () => ({ x: rng() * WORLD_W, y: rng() * 560, r: 0.4 + rng() * 1.4, p: rng() * 6.28 }));
const FAR_RIDGE = [];
for (let i = 0; i <= 24; i++) FAR_RIDGE.push({ x: (i / 24) * WORLD_W, y: 470 - rng() * 130 });
const MID_RIDGE = [];
for (let i = 0; i <= 20; i++) MID_RIDGE.push({ x: (i / 20) * WORLD_W, y: 560 - rng() * 90 });
const ASH = Array.from({ length: 7 }, (_, i) => ({ x: rng() * WORLD_W, y: 120 + rng() * 260, w: 180 + rng() * 220, h: 40 + rng() * 40, v: 6 + rng() * 14 }));
const CRACKS = [];
for (let i = 0; i < 9; i++) {
  const pts = [];
  let x = 80 + rng() * 1440;
  let y = 730;
  pts.push([x, y]);
  for (let k = 0; k < 5; k++) { x += (rng() - 0.5) * 220; y += 20 + rng() * 30; pts.push([x, y]); }
  CRACKS.push(pts);
}

export function createScene(canvas, opts) {
  const onHotspot = (opts && opts.onHotspot) || function () {};
  const ctx = canvas.getContext("2d");
  const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0, H = 0, dpr = 1;
  const state = {
    time: 0.72,
    intensity: 0.7,
    cam: defaultCamera(),
    selected: null,
    fly: false,
    t: 0,
  };
  const embers = [];
  let emberSeed = 1234;

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
  function wy2sy(wy) {
    return (wy - state.cam.y) * state.cam.z + H / 2;
  }

  function spawnEmber() {
    const r = mulberry32((emberSeed = (emberSeed * 1103515245 + 12345) & 0x7fffffff));
    embers.push({
      x: 800 + (r() - 0.5) * 90,
      y: 360,
      vx: (r() - 0.5) * 60,
      vy: -(60 + r() * 160),
      life: 1,
      decay: 0.25 + r() * 0.5,
      r: 1.5 + r() * 3,
    });
  }

  function drawRidge(pts, factor, color, baseY) {
    ctx.beginPath();
    ctx.moveTo(-50, H + 50);
    for (const p of pts) ctx.lineTo(layerX(p.x, factor), wy2sy(p.y));
    ctx.lineTo(W + 50, H + 50);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function draw(now) {
    const dt = Math.min(0.05, (now - (draw.last || now)) / 1000);
    draw.last = now;
    if (!reduced) state.t += dt;
    if (state.fly && !reduced) {
      state.cam.x = WORLD_W / 2 + Math.sin(state.t * 0.12) * 420;
      state.cam.z = 1.05 + Math.sin(state.t * 0.07) * 0.35;
      state.cam = clampCamera(state.cam);
    }

    const sky = skyAt(state.time);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky.top);
    g.addColorStop(0.55, sky.mid);
    g.addColorStop(1, sky.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // stars
    if (sky.star > 0.02) {
      ctx.save();
      for (const s of STARS) {
        const tw = 0.6 + 0.4 * Math.sin(state.t * 2 + s.p);
        ctx.globalAlpha = sky.star * tw * 0.9;
        ctx.fillStyle = "#cfe4ff";
        ctx.fillRect(layerX(s.x, 0.15), wy2sy(s.y), s.r, s.r);
      }
      ctx.restore();
    }

    // sun
    const sp = clamp((state.time - 0.25) / 0.5, 0, 1);
    if (sky.sun > 0.02 && sp > 0 && sp < 1) {
      const sx = W * 0.12 + sp * W * 0.76;
      const sy = H * 0.72 - Math.sin(sp * Math.PI) * H * 0.55;
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 90);
      glow.addColorStop(0, "rgba(255,220,150," + (0.9 * sky.sun) + ")");
      glow.addColorStop(1, "rgba(255,220,150,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 90, sy - 90, 180, 180);
      ctx.fillStyle = "#fff3d6";
      ctx.beginPath();
      ctx.arc(sx, sy, 22 * sky.sun + 6, 0, 6.29);
      ctx.fill();
    }
    // moon
    if (sky.moon > 0.02) {
      const mp = (state.time < 0.25 ? state.time + 1 : state.time) - 0.75;
      const mx = W * 0.7 - mp * W * 0.5;
      const my = H * 0.2;
      ctx.fillStyle = "rgba(220,230,255," + (0.9 * sky.moon) + ")";
      ctx.beginPath();
      ctx.arc(mx, my, 18, 0, 6.29);
      ctx.fill();
    }

    const dark = 1 - sky.sun * 0.55;

    // far + mid ridges
    drawRidge(FAR_RIDGE, 0.25, mixHex("#241a2e", "#0e0a16", dark), 0);
    drawRidge(MID_RIDGE, 0.55, mixHex("#1c141f", "#0a080e", dark), 0);

    // ash clouds drifting
    ctx.save();
    for (const a of ASH) {
      if (!reduced) {
        a.x += a.v * dt;
        if (a.x - a.w > WORLD_W) a.x = -a.w;
      }
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = "#2a2028";
      ctx.beginPath();
      ctx.ellipse(layerX(a.x, 0.7), wy2sy(a.y), a.w * state.cam.z * 0.5, a.h * state.cam.z * 0.5, 0, 0, 6.29);
      ctx.fill();
    }
    ctx.restore();

    // volcano cone
    const cx = layerX(800, 1), cy = wy2sy(340), cz = state.cam.z;
    ctx.beginPath();
    ctx.moveTo(cx - 430 * cz, wy2sy(760));
    ctx.lineTo(cx - 90 * cz, cy + 40 * cz);
    ctx.lineTo(cx - 60 * cz, cy);
    ctx.lineTo(cx + 60 * cz, cy);
    ctx.lineTo(cx + 90 * cz, cy + 40 * cz);
    ctx.lineTo(cx + 430 * cz, wy2sy(760));
    ctx.closePath();
    ctx.fillStyle = mixHex("#3a2420", "#120c0c", dark);
    ctx.fill();
    // slope shading
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 90 * cz, cy + 40 * cz);
    ctx.lineTo(cx + 430 * cz, wy2sy(760));
    ctx.lineTo(cx + 120 * cz, wy2sy(760));
    ctx.closePath();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();

    // crater glow (localized)
    const glowR = (150 + state.intensity * 60) * cz;
    const cg = ctx.createRadialGradient(cx, cy + 10 * cz, 0, cx, cy + 10 * cz, glowR);
    const pulse = reduced ? 0.85 : 0.75 + 0.15 * Math.sin(state.t * 3);
    cg.addColorStop(0, "rgba(255,120,20," + (0.95 * pulse) + ")");
    cg.addColorStop(0.4, "rgba(255,60,10," + (0.55 * pulse) + ")");
    cg.addColorStop(1, "rgba(255,60,10,0)");
    ctx.fillStyle = cg;
    ctx.fillRect(cx - glowR, cy + 10 * cz - glowR, glowR * 2, glowR * 2);
    // lava pool
    ctx.fillStyle = "#ffb01f";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8 * cz, 52 * cz, 12 * cz, 0, 0, 6.29);
    ctx.fill();

    // lava river down the east flank
    ctx.save();
    ctx.strokeStyle = "#ff7a1f";
    ctx.lineCap = "round";
    ctx.shadowColor = "#ff5a1f";
    ctx.shadowBlur = 18;
    ctx.lineWidth = 10 * cz;
    ctx.setLineDash([26 * cz, 18 * cz]);
    ctx.lineDashOffset = reduced ? 0 : -state.t * 90;
    ctx.beginPath();
    ctx.moveTo(cx + 60 * cz, cy + 30 * cz);
    ctx.bezierCurveTo(
      layerX(950, 1), wy2sy(500),
      layerX(900, 1), wy2sy(640),
      layerX(1010, 1), wy2sy(760)
    );
    ctx.stroke();
    ctx.restore();

    // embers
    if (!reduced) {
      const want = Math.floor(state.intensity * 60);
      while (embers.length < want) spawnEmber();
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.x += e.vx * dt; e.y += e.vy * dt; e.vy -= 20 * dt; e.life -= e.decay * dt;
        if (e.life <= 0 || e.y < 40) { embers.splice(i, 1); continue; }
        const s = worldToScreen(e.x, e.y, state.cam, W, H);
        ctx.globalAlpha = clamp(e.life, 0, 1);
        ctx.fillStyle = e.life > 0.5 ? "#ffd23f" : "#ff5a1f";
        ctx.beginPath();
        ctx.arc(s.x, s.y, e.r * state.cam.z, 0, 6.29);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // foreground rock with glowing cracks
    ctx.fillStyle = mixHex("#171112", "#070505", dark);
    ctx.fillRect(0, wy2sy(720), W, H - wy2sy(720) + 2);
    ctx.save();
    ctx.strokeStyle = "rgba(255,90,31,0.85)";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "#ff5a1f";
    ctx.shadowBlur = 10;
    for (const c of CRACKS) {
      ctx.beginPath();
      c.forEach(([px, py], i) => {
        const s = worldToScreen(px, py, state.cam, W, H);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      });
      ctx.globalAlpha = 0.35 + 0.65 * (1 - dark);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // hotspots
    for (const h of HOTSPOTS) {
      const s = worldToScreen(h.x, h.y, state.cam, W, H);
      const sel = state.selected && state.selected.id === h.id;
      const pr = reduced ? 12 : 10 + 4 * Math.sin(state.t * 4);
      ctx.beginPath();
      ctx.arc(s.x, s.y, (sel ? 16 : pr) * state.cam.z * 0.9 + 4, 0, 6.29);
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

    // vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  // ---- interaction ----
  let raf = 0;
  let dragging = false, moved = false, lx = 0, ly = 0;
  let pinchD = 0;

  function loop(now) {
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  function pick(sx, sy) {
    const r = canvas.getBoundingClientRect();
    const w = screenToWorld(sx - r.left, sy - r.top, state.cam, W, H);
    return hotspotAt(HOTSPOTS, w.x, w.y, 46 / state.cam.z);
  }

  function onDown(x, y) { dragging = true; moved = false; lx = x; ly = y; }
  function onMove(x, y) {
    if (!dragging) return;
    const dx = x - lx, dy = y - ly;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    state.cam.x -= dx / state.cam.z;
    state.cam.y -= dy / state.cam.z;
    state.cam = clampCamera(state.cam);
    lx = x; ly = y;
  }
  function onUp(x, y) {
    dragging = false;
    if (!moved) {
      const h = pick(x, y);
      state.selected = h;
      onHotspot(h);
    }
  }

  canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); onDown(e.clientX, e.clientY); });
  canvas.addEventListener("pointermove", (e) => onMove(e.clientX, e.clientY));
  canvas.addEventListener("pointerup", (e) => onUp(e.clientX, e.clientY));
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
    setIntensity(v) { state.intensity = clamp(v, 0, 1); if (reduced) draw(performance.now()); },
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
