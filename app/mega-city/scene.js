/*
 * Mega City — ARGUS Observatory scene.
 * Hand-rolled canvas 2D cyber-metropolis panorama. Zero network calls.
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
  { t: 0.0, top: "#02030a", mid: "#0a1030", bot: "#1c2a55", star: 1, sun: 0, moon: 1 },
  { t: 0.2, top: "#02030a", mid: "#0a1030", bot: "#1c2a55", star: 1, sun: 0, moon: 1 },
  { t: 0.25, top: "#3a2a6e", mid: "#8a5a8e", bot: "#e09a7a", star: 0.15, sun: 0.7, moon: 0 },
  { t: 0.35, top: "#3a8ad0", mid: "#8ac0ee", bot: "#e8f4ff", star: 0, sun: 1, moon: 0 },
  { t: 0.6, top: "#3a8ad0", mid: "#8ac0ee", bot: "#e8f4ff", star: 0, sun: 1, moon: 0 },
  { t: 0.7, top: "#3a2a6e", mid: "#9a5a8e", bot: "#f07a5a", star: 0.15, sun: 0.7, moon: 0 },
  { t: 0.78, top: "#02030a", mid: "#0a1030", bot: "#1c2a55", star: 1, sun: 0, moon: 1 },
  { t: 1.0, top: "#02030a", mid: "#0a1030", bot: "#1c2a55", star: 1, sun: 0, moon: 1 },
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

// District registry: pure data, tested.
export const DISTRICTS = [
  { id: "harbor", name: "NEON HARBOR", color: "#00f2ff", desc: "Dockside markets under a permanent neon haze." },
  { id: "spire", name: "SPIRE DISTRICT", color: "#a259ff", desc: "The kilometer-high towers where the city plans itself." },
  { id: "bazaar", name: "DATA BAZAAR", color: "#ff3366", desc: "Open-air stalls trading bandwidth, salvage and secrets." },
  { id: "subway", name: "SUBWAY — LINE ONE", color: "#ffcc33", desc: "Trains run underground now. Station doors open for loading; street traffic never stops." },
  { id: "under", name: "FOUNDRY UNDERCITY", color: "#ff7a1f", desc: "Steam, sparks and the machines that feed the towers." },
];

export function districtById(id) {
  return DISTRICTS.find((d) => d.id === id) || null;
}

// ---------------- module data ----------------
export const HOTSPOTS = [
  { id: "harbor", x: 300, y: 600, title: "Neon Harbor", body: "Dockside markets under a permanent neon haze. Ferries run all night to the outer platforms." },
  { id: "spire", x: 800, y: 380, title: "Spire District", body: "Kilometer-high towers where the city plans itself. Observation decks open at dawn." },
  { id: "bazaar", x: 1100, y: 640, title: "Data Bazaar", body: "Open-air stalls trading bandwidth, salvage and secrets. Cash only, questions none." },
  { id: "subway", x: 800, y: 910, title: "Subway — Line One", body: "The city's trains run underground now. Step through the station doors while they stand open for loading — up on the street, traffic never stops for a train." },
  { id: "under", x: 560, y: 740, title: "Foundry Undercity", body: "Steam, sparks and the machines that feed the towers. The city breathes down here." },
];

export const ACCENT = "#00f2ff";

// ---------------- scene ----------------
const rng = mulberry32(0xc17);
const STARS = Array.from({ length: 130 }, () => ({ x: rng() * WORLD_W, y: rng() * 420, r: 0.4 + rng() * 1.3, p: rng() * 6.28 }));

function buildLayer(count, baseY, minH, maxH, minW, maxW, seed) {
  const r = mulberry32(seed);
  const out = [];
  let x = -60;
  while (x < WORLD_W + 60) {
    const w = minW + r() * (maxW - minW);
    const h = minH + r() * (maxH - minH);
    out.push({ x, w, h, lit: r(), hue: r(), antenna: r() > 0.7, sign: r() > 0.78 });
    x += w + 6 + r() * 40;
  }
  return out;
}
const LAYER_FAR = buildLayer(0, 700, 160, 320, 60, 120, 11);
const LAYER_MID = buildLayer(0, 740, 220, 430, 70, 140, 22);
const LAYER_NEAR = buildLayer(0, 790, 120, 260, 90, 180, 33);

const CARS = Array.from({ length: 18 }, (_, i) => ({ x: (i / 18) * WORLD_W, lane: i % 2, v: 60 + (i % 5) * 25, c: i % 3 }));

// ---------------- subway (underground line, cutaway view) ----------------
// The trains run BELOW the street in a bored tunnel, drawn as a cutaway so
// the line stays visible. Grade-separated: there are no level crossings,
// so street traffic never stops for a train.
export const SUBWAY = {
  tunnelTop: 872,
  tunnelBottom: 952,
  railY: 928,
  carH: 30,
  carLen: 120,
  cars: 3,
  stations: [350, 800, 1250],
  stationNames: ["NEON HARBOR", "SPIRE DISTRICT", "DATA BAZAAR"],
  stationHalf: 150,
  cruiseV: 150,
  accel: 90,
  brake: 130,
  dwell: 3.4,
  doorTime: 0.7,
  wrapPad: 260,
};
export const SUBWAY_PERIOD = WORLD_W + SUBWAY.wrapPad * 2;

// Ahead-distance on the circular line (handles wrap-around).
export function subwayAhead(sx, x) {
  return (((sx - x) % SUBWAY_PERIOD) + SUBWAY_PERIOD) % SUBWAY_PERIOD;
}

// Index of the next station ahead of x.
export function subwayNextStation(x, stations) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < stations.length; i++) {
    const d = subwayAhead(stations[i], x);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

export function subwayBrakeDistance(v, decel) {
  return (v * v) / (2 * decel);
}

// Door openness 0..1 across a dwell window: open, hold, close.
export function subwayDoorOpen(dwellT, dwell, doorTime) {
  if (dwellT < 0) return 0;
  if (dwellT < doorTime) return dwellT / doorTime;
  if (dwellT > dwell - doorTime) return Math.max(0, (dwell - dwellT) / doorTime);
  return 1;
}

export function subwayTrainLength() {
  return SUBWAY.cars * SUBWAY.carLen;
}

export function createSubwayState() {
  return { x: -SUBWAY.wrapPad, v: SUBWAY.cruiseV, mode: "cruise", station: -1, dwellT: 0, door: 0 };
}

// Advance the subway one tick. Pure-ish: mutates and returns `sub`.
export function updateSubway(sub, dt) {
  const S = SUBWAY;
  if (sub.mode === "cruise" || sub.mode === "depart") {
    sub.v = Math.min(S.cruiseV, sub.v + S.accel * dt);
    sub.x += sub.v * dt;
    const si = subwayNextStation(sub.x, S.stations);
    const dist = subwayAhead(S.stations[si], sub.x);
    if (dist <= subwayBrakeDistance(sub.v, S.brake) + 2) {
      sub.mode = "brake";
      sub.station = si;
    } else if (sub.mode === "depart" && sub.v >= S.cruiseV) {
      sub.mode = "cruise";
    }
  } else if (sub.mode === "brake") {
    sub.v = Math.max(0, sub.v - S.brake * dt);
    sub.x += sub.v * dt;
    const sx = S.stations[sub.station];
    if (sub.v === 0 || sub.x >= sx) {
      sub.x = sx;
      sub.v = 0;
      sub.mode = "dwell";
      sub.dwellT = 0;
    }
  } else if (sub.mode === "dwell") {
    sub.dwellT += dt;
    sub.door = subwayDoorOpen(sub.dwellT, S.dwell, S.doorTime);
    if (sub.dwellT >= S.dwell) {
      sub.mode = "depart";
      sub.door = 0;
    }
  }
  if (sub.x > WORLD_W + S.wrapPad) {
    sub.x -= SUBWAY_PERIOD;
    sub.v = S.cruiseV;
    sub.mode = "cruise";
    sub.station = -1;
    sub.door = 0;
  }
  return sub;
}

export function createScene(canvas, opts) {
  const onHotspot = (opts && opts.onHotspot) || function () {};
  const ctx = canvas.getContext("2d");
  const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0, H = 0, dpr = 1;
  const state = { time: 0.95, traffic: true, cam: defaultCamera(), selected: null, fly: false, t: 0 };
  const sub = createSubwayState();
  // Reduced motion: freeze a readable tableau — train dwelling with doors open.
  if (reduced) { sub.x = 800; sub.v = 0; sub.mode = "dwell"; sub.station = 1; sub.dwellT = 1.2; sub.door = 1; }

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

  function drawBuilding(b, baseY, factor, color, winAlpha) {
    const x = layerX(b.x, factor);
    const yBase = syOf(baseY);
    const z = state.cam.z;
    const w = b.w * z, h = b.h * z;
    ctx.fillStyle = color;
    ctx.fillRect(x, yBase - h, w, h);
    if (b.antenna) {
      ctx.fillRect(x + w / 2 - 1.5 * z, yBase - h - 26 * z, 3 * z, 26 * z);
      ctx.fillStyle = "#ff4040";
      ctx.beginPath();
      ctx.arc(x + w / 2, yBase - h - 28 * z, 3 * z, 0, 6.29);
      ctx.fill();
      ctx.fillStyle = color;
    }
    // windows: seeded grid
    const r = mulberry32((b.x * 13 + b.h * 7) | 0);
    const cols = Math.max(2, Math.floor(w / (10 * z)));
    const rows = Math.max(3, Math.floor(h / (14 * z)));
    for (let ci = 0; ci < cols; ci++) {
      for (let ri = 0; ri < rows; ri++) {
        if (r() < b.lit * winAlpha) {
          const huePick = r();
          ctx.fillStyle = huePick > 0.85 ? "#ffd76a" : huePick > 0.6 ? "#9fd4ff" : "#ffe9b8";
          ctx.globalAlpha = 0.55 + r() * 0.45;
          ctx.fillRect(x + 4 * z + ci * (w - 8 * z) / cols, yBase - h + 6 * z + ri * (h - 12 * z) / rows, (w - 8 * z) / cols * 0.55, (h - 12 * z) / rows * 0.5);
        }
      }
    }
    ctx.globalAlpha = 1;
    if (b.sign && winAlpha > 0.4) {
      const sc = ["#00f2ff", "#ff3366", "#a259ff", "#ffcc33"][(b.h | 0) % 4];
      const sg = ctx.createRadialGradient(x + w / 2, yBase - h * 0.75, 0, x + w / 2, yBase - h * 0.75, 44 * z);
      sg.addColorStop(0, sc + "cc");
      sg.addColorStop(1, sc + "00");
      ctx.fillStyle = sg;
      ctx.fillRect(x + w / 2 - 44 * z, yBase - h * 0.75 - 44 * z, 88 * z, 88 * z);
      ctx.fillStyle = sc;
      ctx.fillRect(x + w / 2 - 22 * z, yBase - h * 0.75 - 4 * z, 44 * z, 8 * z);
    }
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
        ctx.fillStyle = "#d8e8ff";
        ctx.fillRect(layerX(s.x, 0.15), syOf(s.y), s.r, s.r);
      }
      ctx.restore();
    }
    const sp = clamp((state.time - 0.25) / 0.5, 0, 1);
    if (sky.sun > 0.02 && sp > 0 && sp < 1) {
      const sx = W * 0.12 + sp * W * 0.76;
      const syy = H * 0.68 - Math.sin(sp * Math.PI) * H * 0.45;
      ctx.fillStyle = "rgba(255,244,214," + (0.9 * sky.sun) + ")";
      ctx.beginPath();
      ctx.arc(sx, syy, 20, 0, 6.29);
      ctx.fill();
    }
    if (sky.moon > 0.02) {
      ctx.fillStyle = "rgba(225,235,255," + (0.85 * sky.moon) + ")";
      ctx.beginPath();
      ctx.arc(W * 0.8, H * 0.16, 16, 0, 6.29);
      ctx.fill();
    }

    const dark = 1 - sky.sun * 0.55;
    const z = state.cam.z;
    const winAlpha = 0.35 + 0.65 * dark;

    // city glow on horizon (localized)
    const hg = ctx.createRadialGradient(W / 2, syOf(640), 0, W / 2, syOf(640), W * 0.5);
    hg.addColorStop(0, "rgba(0,180,220," + (0.22 * dark) + ")");
    hg.addColorStop(1, "rgba(0,180,220,0)");
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, H);

    for (const b of LAYER_FAR) drawBuilding(b, 700, 0.35, mixHex("#2a3350", "#0a0e1c", dark), winAlpha * 0.7);
    for (const b of LAYER_MID) drawBuilding(b, 740, 0.65, mixHex("#1c2338", "#070a14", dark), winAlpha * 0.85);
    for (const b of LAYER_NEAR) drawBuilding(b, 790, 1, mixHex("#141a2a", "#05070d", dark), winAlpha);

    // street level
    ctx.fillStyle = mixHex("#0c0f18", "#030405", dark);
    ctx.fillRect(0, syOf(790), W, H - syOf(790) + 2);
    // lane lines
    ctx.strokeStyle = "rgba(255,220,120,0.4)";
    ctx.lineWidth = 2;
    ctx.setLineDash([18 * z, 22 * z]);
    const laneY = syOf(830);
    ctx.beginPath();
    ctx.moveTo(0, laneY);
    ctx.lineTo(W, laneY);
    ctx.stroke();
    ctx.setLineDash([]);

    // traffic
    if (state.traffic && !reduced) {
      for (const c of CARS) {
        c.x += (c.lane === 0 ? c.v : -c.v) * dt;
        if (c.x > WORLD_W + 40) c.x = -40;
        if (c.x < -40) c.x = WORLD_W + 40;
        const s = w2s(c.x, 818 + c.lane * 26);
        ctx.fillStyle = c.lane === 0 ? "#ffd76a" : "#ff5a5a";
        ctx.globalAlpha = 0.95;
        ctx.fillRect(s.x - 8 * z, s.y - 2.5 * z, 16 * z, 5 * z);
      }
      ctx.globalAlpha = 1;
    }

    // subway — the trains run UNDERGROUND now (cutaway view).
    // Grade-separated: no level crossings, so street cars never stop for trains.
    if (!reduced) updateSubway(sub, dt);
    const S = SUBWAY;
    const tTop = syOf(S.tunnelTop), tBot = syOf(S.tunnelBottom);
    // soil strata between the street and the tunnel
    ctx.fillStyle = "rgba(150,110,70,0.10)";
    for (let sy = 806; sy < S.tunnelTop; sy += 18) {
      ctx.fillRect(0, syOf(sy), W, 1.5 * z);
    }
    // tunnel bore
    ctx.fillStyle = "#04060a";
    ctx.fillRect(0, tTop, W, tBot - tTop);
    ctx.strokeStyle = "rgba(150,180,220,0.28)";
    ctx.lineWidth = 2 * z;
    ctx.beginPath(); ctx.moveTo(0, tTop + 1 * z); ctx.lineTo(W, tTop + 1 * z); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, tBot - 1 * z); ctx.lineTo(W, tBot - 1 * z); ctx.stroke();
    for (let px = 0; px < WORLD_W; px += 90) {
      const s = w2s(px, 0);
      ctx.fillStyle = "rgba(150,180,220,0.07)";
      ctx.fillRect(s.x, tTop, 2 * z, tBot - tTop);
    }
    for (let px = 130; px < WORLD_W; px += 260) {
      const s = w2s(px, S.tunnelTop + 10);
      ctx.fillStyle = "rgba(255,200,120," + (0.45 + 0.2 * dark) + ")";
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.5 * z, 0, 6.29); ctx.fill();
    }
    // sleepers + rails
    for (let px = 0; px < WORLD_W; px += 26) {
      const s = w2s(px, S.railY);
      ctx.fillStyle = "#0e141d";
      ctx.fillRect(s.x - 2 * z, s.y - 7 * z, 4 * z, 14 * z);
    }
    ctx.strokeStyle = "#5a6a80";
    ctx.lineWidth = 2 * z;
    for (const off of [-4, 4]) {
      const ry = syOf(S.railY + off);
      ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(W, ry); ctx.stroke();
    }
    // stations: platforms, signs, stair shafts, street kiosks with opening doors
    ctx.textAlign = "center";
    S.stations.forEach((sx, i) => {
      const x0 = sx - S.stationHalf, x1 = sx + S.stationHalf;
      const a = w2s(x0, 0), b = w2s(x1, 0);
      ctx.fillStyle = "#0a1119";
      ctx.fillRect(a.x, tTop, b.x - a.x, tBot - tTop);
      const deckY = syOf(S.railY - S.carH);
      ctx.fillStyle = "#141c28";
      ctx.fillRect(a.x, deckY, b.x - a.x, 8 * z);
      ctx.fillStyle = "rgba(255,205,90,0.75)";
      for (let px = x0 + 6; px < x1 - 6; px += 24) {
        ctx.fillRect(w2s(px, 0).x, deckY, 12 * z, 2.5 * z);
      }
      const sign = w2s(sx, S.tunnelTop + 28);
      ctx.fillStyle = "#ffcc33";
      ctx.beginPath(); ctx.arc(sign.x - 64 * z, sign.y, 3 * z, 0, 6.29); ctx.fill();
      ctx.fillStyle = "rgba(230,240,255,0.85)";
      ctx.font = Math.max(9, 10 * z) + "px monospace";
      ctx.fillText(S.stationNames[i], sign.x, sign.y + 3 * z);
      for (const lx of [-90, 0, 90]) {
        const s = w2s(sx + lx, S.tunnelTop + 14);
        const lg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 26 * z);
        lg.addColorStop(0, "rgba(255,210,140," + (0.3 * dark + 0.1) + ")");
        lg.addColorStop(1, "rgba(255,210,140,0)");
        ctx.fillStyle = lg;
        ctx.fillRect(s.x - 26 * z, s.y - 26 * z, 52 * z, 52 * z);
      }
      // stair shaft from the street kiosk down to the platform
      const kx = sx + 100;
      const shx = w2s(kx, 0).x;
      const shaftTop = syOf(790), shaftBot = deckY + 8 * z;
      ctx.fillStyle = "#030509";
      ctx.fillRect(shx - 15 * z, shaftTop, 30 * z, shaftBot - shaftTop);
      ctx.strokeStyle = "rgba(150,180,220,0.22)";
      ctx.lineWidth = 1.5 * z;
      let step = 0;
      for (let wy = 802; wy < S.railY - S.carH - 6; wy += 12) {
        const s2 = w2s(kx, wy);
        const left = (step++ % 2) === 0;
        ctx.beginPath();
        ctx.moveTo(s2.x + (left ? -15 : 0) * z, s2.y);
        ctx.lineTo(s2.x + (left ? 0 : 15) * z, s2.y);
        ctx.stroke();
      }
      // entrance kiosk on the street — doors open for loading while the train dwells here
      const kb = w2s(kx, 790);
      const kw = 56 * z, kh = 40 * z;
      ctx.fillStyle = "rgba(120,200,240,0.13)";
      ctx.fillRect(kb.x - kw / 2, kb.y - kh, kw, kh);
      ctx.strokeStyle = "rgba(150,210,245,0.5)";
      ctx.lineWidth = 1.5 * z;
      ctx.strokeRect(kb.x - kw / 2, kb.y - kh, kw, kh);
      ctx.fillStyle = "#00f2ff";
      ctx.font = Math.max(8, 9 * z) + "px monospace";
      ctx.fillText("SUBWAY", kb.x, kb.y - kh - 6 * z);
      const open = (sub.mode === "dwell" && sub.station === i) ? sub.door : 0;
      const dw = 30 * z, dh = 30 * z;
      const dx = kb.x - dw / 2, dy = kb.y - dh;
      if (open > 0.02) {
        ctx.fillStyle = "rgba(255,205,120," + (0.5 * open) + ")";
        ctx.fillRect(dx, dy, dw, dh);
      }
      ctx.fillStyle = "#0d1622";
      const slide = open * (dw / 2 - 1 * z);
      ctx.fillRect(dx, dy, dw / 2 - slide, dh);
      ctx.fillRect(dx + dw / 2 + slide, dy, dw / 2 - slide, dh);
      ctx.strokeStyle = "rgba(160,200,235,0.5)";
      ctx.lineWidth = 1 * z;
      ctx.strokeRect(dx, dy, dw, dh);
    });
    // the train — car doors slide open for loading at stations
    const trainLen = subwayTrainLength();
    for (let c = 0; c < S.cars; c++) {
      const cx = sub.x - trainLen / 2 + c * S.carLen;
      const cs = w2s(cx, S.railY);
      const cw = S.carLen * z, ch = S.carH * z;
      ctx.fillStyle = "#16222f";
      ctx.fillRect(cs.x, cs.y - ch, cw, ch);
      ctx.fillStyle = "#0b1420";
      ctx.fillRect(cs.x, cs.y - ch, cw, 5 * z);
      ctx.fillStyle = "rgba(190,230,255,0.8)";
      const winY = cs.y - ch + 8 * z, winH = 9 * z;
      for (const seg of [[0.04, 0.22], [0.4, 0.6], [0.78, 0.96]]) {
        ctx.fillRect(cs.x + seg[0] * cw, winY, (seg[1] - seg[0]) * cw, winH);
      }
      for (const f of [0.3, 0.7]) {
        const dcx = cs.x + f * cw, dw2 = 10 * z;
        const dTop = cs.y - ch + 4 * z, dH = ch - 6 * z;
        if (sub.door > 0.02) {
          ctx.fillStyle = "rgba(255,205,120," + (0.6 * sub.door) + ")";
          ctx.fillRect(dcx - dw2, dTop, dw2 * 2, dH);
        }
        ctx.fillStyle = "#1d2c3d";
        const dslide = sub.door * (dw2 - 1 * z);
        ctx.fillRect(dcx - dw2, dTop, dw2 - dslide, dH);
        ctx.fillRect(dcx + dslide, dTop, dw2 - dslide, dH);
        ctx.strokeStyle = "rgba(160,200,235,0.5)";
        ctx.lineWidth = 1 * z;
        ctx.strokeRect(dcx - dw2, dTop, dw2 * 2, dH);
      }
      if (c > 0) {
        ctx.fillStyle = "#05080d";
        ctx.fillRect(cs.x - 2 * z, cs.y - ch + 6 * z, 4 * z, ch - 12 * z);
      }
    }
    // headlight at the front
    const hs = w2s(sub.x + trainLen / 2, S.railY - 10);
    const hg2 = ctx.createRadialGradient(hs.x, hs.y, 0, hs.x, hs.y, 22 * z);
    hg2.addColorStop(0, "rgba(255,240,200," + (0.5 * dark + 0.15) + ")");
    hg2.addColorStop(1, "rgba(255,240,200,0)");
    ctx.fillStyle = hg2;
    ctx.fillRect(hs.x - 22 * z, hs.y - 22 * z, 44 * z, 44 * z);

    // undercity steam vents
    if (!reduced && dark > 0.4) {
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = "#8a93ad";
      for (let i = 0; i < 5; i++) {
        const vx = 420 + i * 90;
        const s = w2s(vx, 740 - ((state.t * 30 + i * 60) % 120));
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, 30 * z, 14 * z, 0, 0, 6.29);
        ctx.fill();
      }
      ctx.restore();
    }

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
    setTraffic(v) { state.traffic = !!v; if (reduced) draw(performance.now()); },
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
