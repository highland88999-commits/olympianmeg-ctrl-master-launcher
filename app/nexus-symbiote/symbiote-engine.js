/**
 * symbiote-engine.js — raw WebGL point-cloud engine for Nexus Symbiote.
 *
 * The source used three.js from a CDN to render a video feed as a field of
 * coloured points. This port does the same with plain WebGL1 (no libraries,
 * no network): each pixel of the sampler canvas becomes one point whose
 * colour matches the pixel and whose depth follows its brightness.
 *
 * Effect toggles (ported from the source):
 *   vortex — swirls points around the centre
 *   pulse  — breathes brightness
 *   ripple — wobbles points on a sine field
 */

import { FEED_W, FEED_H } from "./demo-feed.js";

export const VERTEX_SHADER = `
attribute vec3 position;
attribute vec3 color;
varying vec3 vC;
uniform vec2 uScale;
void main() {
  vC = color;
  float depth = clamp(position.z * 0.12 - 0.15, -0.95, 0.95);
  gl_PointSize = 1.5 + max(position.z, 0.0) * 0.35;
  gl_Position = vec4(position.xy * uScale, depth, 1.0);
}
`;

export const FRAGMENT_SHADER = `
precision mediump float;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  if (dot(d, d) > 0.25) discard;
  gl_FragColor = vec4(vC, 1.0);
}
`;

export const SAMPLE_W = FEED_W;
export const SAMPLE_H = FEED_H;

/**
 * Pure transform: given a sample pixel's anchor position (ax, ay in sample
 * units), its brightness `lum` (0..1), the active effects and time `t`,
 * return the target 3D position of the point. Exported so tests can verify
 * the effect math without a GPU.
 */
export function projectPixel(ax, ay, lum, effects, t) {
  let tx = ((ax - SAMPLE_W / 2) * 0.14) / 12;
  let ty = ((SAMPLE_H / 2 - ay) * 0.14) / 12;
  let tz = lum * 3.5;
  if (effects.vortex && lum > 0.05) {
    const dist = Math.sqrt(tx * tx + ty * ty);
    const a = t * 1.5 * (1.0 / (dist + 0.8));
    const rx = tx * Math.cos(a) - ty * Math.sin(a);
    ty = tx * Math.sin(a) + ty * Math.cos(a);
    tx = rx;
  }
  if (effects.ripple) {
    tx += Math.sin(ay * 0.3 + t * 5) * 0.008;
    ty += Math.cos(ax * 0.3 + t * 5) * 0.008;
  }
  return [tx, ty, tz];
}

/** Pure colour transform: pulse effect modulates brightness over time. */
export function pixelColor(r, g, b, ay, effects, t) {
  let boost = 1.0;
  if (effects.pulse) boost = 1.0 + Math.sin(t * 8 + ay * 0.2) * 0.3;
  return [r * boost, g * boost, b * boost];
}

/**
 * Create the live engine bound to a visible <canvas>. Returns a controller:
 *   setFeedSource(drawFrame) — drawFrame(samplerCtx) paints the current frame
 *   setEffects({vortex, pulse, ripple})
 *   start() / stop()
 *   captureStream(fps) — for local recording via MediaRecorder
 */
export function createEngine(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: true });
  if (!gl) return null;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error("Shader compile failed: " + gl.getShaderInfoLog(s));
    }
    return s;
  }
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  gl.useProgram(program);

  const N = SAMPLE_W * SAMPLE_H;
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  // anchor grid: one point per sample pixel
  const anchors = new Float32Array(N * 2);
  for (let y = 0; y < SAMPLE_H; y++) {
    for (let x = 0; x < SAMPLE_W; x++) {
      const i = y * SAMPLE_W + x;
      anchors[i * 2] = x + 0.5;
      anchors[i * 2 + 1] = y + 0.5;
      const p = projectPixel(x + 0.5, y + 0.5, 0, {}, 0);
      positions[i * 3] = p[0];
      positions[i * 3 + 1] = p[1];
      positions[i * 3 + 2] = 0;
    }
  }

  const posBuf = gl.createBuffer();
  const colBuf = gl.createBuffer();
  const locPos = gl.getAttribLocation(program, "position");
  const locCol = gl.getAttribLocation(program, "color");
  const locScale = gl.getUniformLocation(program, "uScale");

  function resize() {
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 400;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const aspect = canvas.width / canvas.height;
    gl.uniform2f(locScale, 1 / 12, aspect / 12);
  }
  resize();

  const sampler = document.createElement("canvas");
  sampler.width = SAMPLE_W;
  sampler.height = SAMPLE_H;
  const sCtx = sampler.getContext("2d", { willReadFrequently: true });

  let drawFrame = null;
  let effects = { vortex: false, pulse: false, ripple: false };
  let raf = 0;
  let running = false;

  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (drawFrame) drawFrame(sCtx);
    const t = performance.now() * 0.001;
    let img;
    try {
      img = sCtx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
    } catch (e) {
      return; // tainted source — skip frame
    }
    for (let i = 0; i < N; i++) {
      const ax = anchors[i * 2];
      const ay = anchors[i * 2 + 1];
      const px = ((ay - 0.5) | 0) * SAMPLE_W + ((ax - 0.5) | 0);
      const d4 = px * 4;
      const r = img[d4] / 255;
      const g = img[d4 + 1] / 255;
      const b = img[d4 + 2] / 255;
      const lum = (r + g + b) / 3;
      const p = projectPixel(ax, ay, lum, effects, t);
      const c = pixelColor(r, g, b, ay, effects, t);
      const i3 = i * 3;
      // ease toward target (same 0.2 lerp as the source)
      positions[i3] += (p[0] - positions[i3]) * 0.2;
      positions[i3 + 1] += (p[1] - positions[i3 + 1]) * 0.2;
      positions[i3 + 2] += (p[2] - positions[i3 + 2]) * 0.2;
      colors[i3] = lum < 0.04 ? 0 : c[0];
      colors[i3 + 1] = lum < 0.04 ? 0 : c[1];
      colors[i3 + 2] = lum < 0.04 ? 0 : c[2];
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(locCol);
    gl.vertexAttribPointer(locCol, 3, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, N);
  }

  return {
    setFeedSource(fn) {
      drawFrame = fn;
    },
    setEffects(fx) {
      effects = { ...fx };
    },
    start() {
      if (running) return;
      running = true;
      resize();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    captureStream(fps) {
      return canvas.captureStream(fps);
    },
    samplerCanvas: sampler,
  };
}
