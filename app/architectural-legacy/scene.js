/*
 * Architectural Legacy — ARGUS Observatory archive.
 * Hand-rolled canvas 2D starfield + procedural era illustrations. Zero network calls.
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

// ---------------- archive data ----------------
export const ERAS = [
  {
    id: "classical", name: "CLASSICAL", span: "800 BC – 400 AD",
    fact: "Post-and-lintel temples in marble. Proportion was law: the column orders — Doric, Ionic, Corinthian — set the grammar of Western building for two millennia.",
    accent: "#ffd700",
  },
  {
    id: "gothic", name: "GOTHIC", span: "1150 – 1500",
    fact: "Pointed arches and flying buttresses let stone reach for light. Ribbed vaults turned cathedrals into forests of carved shadow.",
    accent: "#8a93ad",
  },
  {
    id: "renaissance", name: "RENAISSANCE", span: "1400 – 1600",
    fact: "Brunelleschi's dome proved mathematics could out-build empires. Symmetry, domes and perspective returned architecture to human measure.",
    accent: "#c9a06a",
  },
  {
    id: "industrial", name: "INDUSTRIAL", span: "1760 – 1910",
    fact: "Iron, steel and glass broke the stone ceiling. Factories, stations and exhibition halls were machines you could walk inside.",
    accent: "#7a8494",
  },
  {
    id: "modern", name: "MODERN", span: "1920 – 1980",
    fact: "The curtain wall freed the facade from the frame. Concrete, steel and glass stacked the city vertically — form followed function, then forgot it.",
    accent: "#4aa8de",
  },
  {
    id: "future", name: "FUTURE", span: "2026 →",
    fact: "Parametric shells, living facades, buildings that breathe and print themselves. The next order is written in code, not stone.",
    accent: "#00f2ff",
  },
];

export function eraCount() {
  return ERAS.length;
}

export function nextEra(i) {
  return (i + 1) % ERAS.length;
}

export function prevEra(i) {
  return (i - 1 + ERAS.length) % ERAS.length;
}

export function eraAt(i) {
  return ERAS[((i % ERAS.length) + ERAS.length) % ERAS.length];
}

// Archive slabs preserved from the source.
export const SLABS = [
  {
    id: "manifesto", tag: "ARCHITECT // 001", title: "The Nexus Manifesto",
    sections: [
      ["I. Sovereignty over Submission", "Unlike the world we were handed, where work was a tool of control, we build for purpose. You will be the architect of your own time."],
      ["II. Truth over Silence", "A 30-year silence is a void where families die. In our ecosystem, the truth is the foundation. Understanding where the foundation cracked is the only way to build a tower that won't fall."],
      ["III. Controlled Power", "Anger is a wild current. We channel it into creation — into 3D worlds, into code, into the Safe Zone. Power is shown by how much you can protect."],
      ["IV. The \"Safe Zone\" Protocol", "The world we are building — the Olympus, the Vortex — is designed to be a sanctuary. Our legacy is a space where the logic is sound and the physics are fair."],
    ],
  },
  {
    id: "legacy", tag: "STAY RESOLUTE", title: "Project: Legacy",
    sections: [
      ["To Miles,", "I grew up in a world of \"Mercy\" that showed none. For thirty years, the silence of those before me was a vacuum. I had to learn to breathe in that space alone."],
      ["", "I was a worker before I was a man. I am writing this so you never have to learn that language."],
      ["The Protocols:", "Build, Don't Occupy: if it's broken, rewrite the source. The Safe Zone: I built this as your shield. Break the Loop: my history was a circle; your life is a straight line."],
      ["", "I survived the ruins so you could inherit the city. Stay brave."],
    ],
  },
];

export const ACCENT = "#ffd700";

// ---------------- scene ----------------
const rng = mulberry32(0xae9);
const STARS = Array.from({ length: 220 }, () => ({
  x: rng() * WORLD_W, y: rng() * WORLD_H, z: 0.2 + rng() * 0.8, o: 0.3 + rng() * 0.7, p: rng() * 6.28,
}));

export function createScene(canvas, opts) {
  const onEra = (opts && opts.onEra) || function () {};
  const ctx = canvas.getContext("2d");
  const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0, H = 0, dpr = 1;
  const state = { era: 0, prev: 0, slide: 0, auto: false, autoT: 0, t: 0 };

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

  const fit = Math.min(W / WORLD_W, H / WORLD_H);

  function drawEraShape(era, ox, alpha) {
    const cx = W / 2 + ox;
    const base = H * 0.82;
    const s = fit * 1.15;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = era.accent;
    ctx.fillStyle = era.accent;
    ctx.lineWidth = Math.max(1.5, 3 * fit);
    const X = (dx) => cx + dx * s;
    const Y = (dy) => base + dy * s;

    if (era.id === "classical") {
      ctx.fillRect(X(-220), Y(-14), 440 * s, 14 * s);
      ctx.fillRect(X(-200), Y(-28), 400 * s, 14 * s);
      for (let i = 0; i < 8; i++) ctx.fillRect(X(-180) + i * 48 * s, Y(-168), 18 * s, 140 * s);
      ctx.fillRect(X(-210), Y(-196), 420 * s, 28 * s);
      ctx.beginPath();
      ctx.moveTo(X(-230), Y(-196)); ctx.lineTo(cx, Y(-280)); ctx.lineTo(X(230), Y(-196));
      ctx.closePath(); ctx.fill();
    } else if (era.id === "gothic") {
      ctx.fillRect(X(-150), Y(0), 300 * s, 0);
      ctx.beginPath();
      ctx.moveTo(X(-150), Y(0)); ctx.lineTo(X(-150), Y(-220)); ctx.quadraticCurveTo(X(-75), Y(-280), X(0), Y(-220));
      ctx.lineTo(X(0), Y(0)); ctx.closePath(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(X(150), Y(0)); ctx.lineTo(X(150), Y(-220)); ctx.quadraticCurveTo(X(75), Y(-280), X(0), Y(-220));
      ctx.lineTo(X(0), Y(0)); ctx.closePath(); ctx.stroke();
      for (const tx of [-110, 110]) {
        ctx.beginPath();
        ctx.moveTo(X(tx - 26), Y(0)); ctx.lineTo(X(tx - 26), Y(-300)); ctx.lineTo(X(tx), Y(-380)); ctx.lineTo(X(tx + 26), Y(-300)); ctx.lineTo(X(tx + 26), Y(0));
        ctx.closePath(); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(cx, Y(-120), 46 * s, 0, 6.29); ctx.stroke();
    } else if (era.id === "renaissance") {
      ctx.fillRect(X(-260), Y(-16), 520 * s, 16 * s);
      ctx.fillRect(X(-230), Y(-160), 60 * s, 144 * s);
      ctx.fillRect(X(170), Y(-160), 60 * s, 144 * s);
      ctx.beginPath();
      ctx.arc(cx, Y(-150), 110 * s, Math.PI, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(X(-14), Y(-330), 28 * s, 70 * s);
      ctx.beginPath(); ctx.arc(cx, Y(-330), 14 * s, 0, 6.29); ctx.fill();
      ctx.strokeRect(X(-260), Y(-160), 520 * s, 144 * s);
    } else if (era.id === "industrial") {
      for (const fx of [-220, -60, 100]) {
        ctx.strokeRect(X(fx), Y(-120), 140 * s, 120 * s);
        ctx.beginPath();
        ctx.moveTo(X(fx), Y(-120));
        for (let k = 0; k < 4; k++) { ctx.lineTo(X(fx + 17.5 + k * 35), Y(-170)); ctx.lineTo(X(fx + 35 + k * 35), Y(-120)); }
        ctx.stroke();
      }
      for (const chx of [-160, 160]) {
        ctx.fillRect(X(chx - 14), Y(-330), 28 * s, 330 * s);
        ctx.beginPath(); ctx.ellipse(X(chx), Y(-330), 20 * s, 8 * s, 0, 0, 6.29); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(X(260), Y(-70), 52 * s, 0, 6.29); ctx.stroke();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * 6.29;
        ctx.beginPath();
        ctx.moveTo(X(260) + Math.cos(a) * 52 * s, Y(-70) + Math.sin(a) * 52 * s);
        ctx.lineTo(X(260) + Math.cos(a) * 78 * s, Y(-70) + Math.sin(a) * 78 * s);
        ctx.stroke();
      }
    } else if (era.id === "modern") {
      const towers = [[-260, 300, 130], [-110, 420, 150], [60, 340, 120], [200, 260, 100]];
      for (const [tx, th, tw] of towers) {
        ctx.strokeRect(X(tx), Y(-th), tw * s, th * s);
        ctx.save();
        ctx.globalAlpha = alpha * 0.5;
        for (let ry = 0; ry < Math.floor(th / 34); ry++)
          for (let rx = 0; rx < Math.floor(tw / 30); rx++)
            ctx.fillRect(X(tx + 8 + rx * 30), Y(-th + 10 + ry * 34), 16 * s, 18 * s);
        ctx.restore();
      }
    } else {
      // future arcology: flowing arcs + neon rim
      ctx.beginPath();
      ctx.arc(cx, Y(40), 250 * s, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, Y(40), 170 * s, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(X(-250), Y(0)); ctx.quadraticCurveTo(cx, Y(-330), X(250), Y(0));
      ctx.stroke();
      ctx.save();
      ctx.shadowColor = era.accent; ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(cx, Y(-160), 10 * s, 0, 6.29); ctx.fill();
      ctx.restore();
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(X(k * 90), Y(0)); ctx.lineTo(X(k * 70), Y(-190));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function draw(now) {
    const dt = Math.min(0.05, (now - (draw.last || now)) / 1000);
    draw.last = now;
    if (!reduced) {
      state.t += dt;
      if (state.slide !== 0) {
        state.slide += (0 - state.slide) * Math.min(1, dt * 6);
        if (Math.abs(state.slide) < 2) state.slide = 0;
      }
      if (state.auto && state.slide === 0) {
        state.autoT += dt;
        if (state.autoT > 6) { state.autoT = 0; goTo(nextEra(state.era), 1); }
      }
    }

    // starfield
    ctx.fillStyle = "#050508";
    ctx.fillRect(0, 0, W, H);
    for (const st of STARS) {
      if (!reduced) {
        st.x -= st.z * 26 * dt * fit;
        if (st.x < 0) st.x = WORLD_W;
      }
      const tw = 0.55 + 0.45 * Math.sin(state.t * 2 + st.p);
      ctx.globalAlpha = st.o * tw;
      ctx.fillStyle = "#cfe0ff";
      const sx = (st.x / WORLD_W) * W;
      const sy = (st.y / WORLD_H) * H;
      ctx.fillRect(sx, sy, Math.max(1, st.z * 2.2), Math.max(1, st.z * 2.2));
    }
    ctx.globalAlpha = 1;

    // ground line
    ctx.strokeStyle = "rgba(212,175,55,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.82);
    ctx.lineTo(W, H * 0.82);
    ctx.stroke();

    // era shapes with slide transition
    const cur = eraAt(state.era);
    drawEraShape(cur, state.slide, 1);
    if (state.slide !== 0) {
      const dir = state.slide > 0 ? -1 : 1;
      drawEraShape(eraAt(state.prev), state.slide + dir * W, 0.35);
    }

    // era label
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = cur.accent;
    ctx.globalAlpha = 0.95;
    ctx.font = "700 " + Math.round(15 * fit + 22) + "px system-ui, sans-serif";
    ctx.fillText(cur.name, W / 2, H * 0.12);
    ctx.fillStyle = "#9aa3b8";
    ctx.font = Math.round(10 * fit + 12) + "px system-ui, sans-serif";
    ctx.fillText(cur.span, W / 2, H * 0.12 + 30 * fit + 8);
    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  function goTo(i, dir) {
    state.prev = state.era;
    state.era = i;
    state.slide = reduced ? 0 : dir * W * 0.6;
    state.autoT = 0;
    onEra(i);
  }

  let raf = 0, downX = 0, dragging = false;
  function loop(now) { draw(now); raf = requestAnimationFrame(loop); }

  canvas.addEventListener("pointerdown", (e) => { dragging = true; downX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    const dx = e.clientX - downX;
    if (dx < -60) goTo(nextEra(state.era), 1);
    else if (dx > 60) goTo(prevEra(state.era), -1);
  });
  canvas.addEventListener("pointercancel", () => { dragging = false; });
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") goTo(nextEra(state.era), 1);
    if (e.key === "ArrowLeft") goTo(prevEra(state.era), -1);
  });

  const api = {
    goTo(i, dir) { goTo(i, dir == null ? 1 : dir); },
    next() { goTo(nextEra(state.era), 1); },
    prev() { goTo(prevEra(state.era), -1); },
    setAuto(v) { state.auto = !!v && !reduced; state.autoT = 0; },
    era() { return state.era; },
    render() { draw(performance.now()); },
    destroy() { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); },
  };

  canvas.tabIndex = 0;
  if (reduced) draw(performance.now());
  else loop(performance.now());
  return api;
}
