/**
 * demo-feed.js — procedural demo feed for Nexus Symbiote.
 *
 * The source repo shipped two sample clips (Make_the_words_.mp4 and
 * Image_To_Video (9).mp4) as demo material for the particle engine. Those
 * videos are NOT shipped here. Instead this module paints the same kinds of
 * motion procedurally onto a 160x120 canvas, which the WebGL point-cloud
 * engine then samples exactly as it would sample a video frame.
 *
 * Scenes:
 *   "words"  — kinetic neon typography ("MAKE THE WORDS") → replaces Make_the_words_.mp4
 *   "bloom"  — drifting plasma nebula  → replaces Image_To_Video (9).mp4
 *   "pulse"  — radiating waveform rings → extra demo variation
 */

export const FEED_W = 160;
export const FEED_H = 120;

/** Deterministic PRNG so demo scenes look identical on every load. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SCENES = [
  {
    id: "words",
    name: "Kinetic Words",
    seconds: 9,
    note: "Animated neon typography — stands in for the source 'Make the words' clip.",
  },
  {
    id: "bloom",
    name: "Plasma Bloom",
    seconds: 9,
    note: "Drifting plasma nebula — stands in for the source 'Image to video' clip.",
  },
  {
    id: "pulse",
    name: "Waveform Rings",
    seconds: 9,
    note: "Radiating waveform rings, an extra demo variation.",
  },
];

export const SCENE_TOTAL_SECONDS = SCENES.reduce((s, c) => s + c.seconds, 0);

/** Which scene should be showing at `elapsed` seconds into the demo loop. */
export function sceneAt(elapsed) {
  const t = ((elapsed % SCENE_TOTAL_SECONDS) + SCENE_TOTAL_SECONDS) % SCENE_TOTAL_SECONDS;
  let acc = 0;
  for (const scene of SCENES) {
    acc += scene.seconds;
    if (t < acc) return scene;
  }
  return SCENES[0];
}

/** Seconds elapsed within the current scene (for local animation phase). */
export function sceneLocalTime(elapsed) {
  const t = ((elapsed % SCENE_TOTAL_SECONDS) + SCENE_TOTAL_SECONDS) % SCENE_TOTAL_SECONDS;
  let acc = 0;
  for (const scene of SCENES) {
    if (t < acc + scene.seconds) return t - acc;
    acc += scene.seconds;
  }
  return 0;
}

const WORDS = ["MAKE", "THE", "WORDS"];
const WORD_COLORS = ["#00ffcc", "#ff4dff", "#ffe14d"];

function paintWords(ctx, t, rng) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, FEED_W, FEED_H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 22px 'Courier New', monospace";
  WORDS.forEach((word, row) => {
    const y = 28 + row * 32;
    for (let i = 0; i < word.length; i++) {
      const wobble = Math.sin(t * 4 + i * 0.9 + row * 1.7) * 6;
      const drift = Math.sin(t * 1.3 + i) * 2;
      ctx.fillStyle = WORD_COLORS[row];
      ctx.fillText(word[i], 20 + i * 26 + drift, y + wobble);
    }
  });
  // travelling scanline for motion
  const scan = (t * 60) % (FEED_H + 20);
  ctx.fillStyle = "rgba(0,255,204,0.25)";
  ctx.fillRect(0, scan - 10, FEED_W, 3);
  void rng;
}

function paintBloom(ctx, t, rng) {
  ctx.fillStyle = "#020108";
  ctx.fillRect(0, 0, FEED_W, FEED_H);
  ctx.globalCompositeOperation = "lighter";
  const blobs = 7;
  for (let i = 0; i < blobs; i++) {
    const bx = FEED_W / 2 + Math.sin(t * 0.7 + i * 2.4) * 60;
    const by = FEED_H / 2 + Math.cos(t * 0.5 + i * 1.9) * 40;
    const r = 26 + Math.sin(t * 1.1 + i) * 10;
    const hue = (170 + i * 45 + t * 20) % 360;
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, `hsla(${hue},95%,60%,0.85)`);
    g.addColorStop(1, "hsla(0,0%,0%,0)");
    ctx.fillStyle = g;
    ctx.fillRect(bx - r, by - r, r * 2, r * 2);
  }
  // a few fixed stars for depth
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 24; i++) {
    const sx = (rng() * FEED_W) | 0;
    const sy = (rng() * FEED_H) | 0;
    ctx.fillRect(sx, sy, 1, 1);
  }
  ctx.globalCompositeOperation = "source-over";
}

function paintPulse(ctx, t) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, FEED_W, FEED_H);
  const cx = FEED_W / 2;
  const cy = FEED_H / 2;
  for (let ring = 0; ring < 6; ring++) {
    const r = ((t * 34 + ring * 26) % 130) + 4;
    const alpha = Math.max(0, 1 - r / 134);
    const hue = (150 + ring * 30 + t * 40) % 360;
    ctx.strokeStyle = `hsla(${hue},90%,60%,${alpha.toFixed(3)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // waveform through the middle
  ctx.strokeStyle = "#00ffcc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x < FEED_W; x += 2) {
    const y = cy + Math.sin(x * 0.18 + t * 6) * 16 * Math.sin(t * 1.5);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

const PAINTERS = { words: paintWords, bloom: paintBloom, pulse: paintPulse };

/**
 * Paint one demo-feed frame into `ctx` (a 2D context of a FEED_W x FEED_H canvas).
 * `elapsed` is seconds since the demo loop started; `seed` fixes the rng per scene
 * so every visit looks the same.
 */
export function paintFeed(ctx, elapsed, seed = 1234) {
  const scene = sceneAt(elapsed);
  const local = sceneLocalTime(elapsed);
  const rng = mulberry32(seed + SCENES.indexOf(scene) * 7919);
  PAINTERS[scene.id](ctx, local, rng);
  return scene.id;
}
