// Air Hockey — Merlin's kaleidoscope, ported faithfully from his version
// (highland88999-commits/Set-Air-Hockey, "Arcade Air Hockey: Ultimate").
//
// In his build this GLSL fragment shader is the table background: an
// 8-segment radial kaleidoscope with his classic rainbow palette, animated
// by wall-clock time, under a semi-transparent table surface. The port keeps
// his shader byte-for-byte (classic branch; isPro stays 0.0) and replays it
// with raw WebGL so the launcher gains no new dependency. His telemetry
// phone-home was deliberately NOT ported — only the visual.
//
// The launcher's default table state is unchanged; this mode is opt-in.

export const VISUAL_MODES = ['classic', 'kaleidoscope'];
export const DEFAULT_VISUAL = 'classic';
export const VISUAL_SETTING_KEY = 'air-hockey-visual';

export function sanitizeVisual(v) {
  return VISUAL_MODES.includes(v) ? v : DEFAULT_VISUAL;
}

function defaultStorage() {
  try {
    return typeof window !== 'undefined' && window.localStorage
      ? window.localStorage
      : null;
  } catch {
    return null;
  }
}

export function loadVisualChoice(storage = defaultStorage()) {
  try {
    if (!storage) return DEFAULT_VISUAL;
    return sanitizeVisual(storage.getItem(VISUAL_SETTING_KEY));
  } catch {
    return DEFAULT_VISUAL;
  }
}

export function saveVisualChoice(v, storage = defaultStorage()) {
  try {
    if (!storage) return;
    storage.setItem(VISUAL_SETTING_KEY, sanitizeVisual(v));
  } catch {
    /* storage unavailable — the choice simply won't persist */
  }
}

// --- Merlin's fragment shader, verbatim from Set-Air-Hockey -----------------
// (classic branch; the isPro uniform exists for fidelity but stays 0.0).
export const KALEIDOSCOPE_FRAG = `
precision mediump float;
uniform float time;
uniform float isPro;
varying vec2 vUv;

vec3 paletteClassic(float t) { return vec3(0.5) + vec3(0.5)*cos(6.28318*(vec3(1.0)*t+vec3(0.263,0.416,0.557))); }
vec3 palettePro(float t) { return vec3(0.3, 0.05, 0.1) + vec3(0.7, 0.1, 0.3)*cos(6.28318*(vec3(1.0)*t+vec3(0.0,0.3,0.6))); }

void main() {
    vec2 uv = (vUv - 0.5) * 2.0;
    vec2 uv0 = uv;
    vec3 finalColor = vec3(0.0);

    float segments = mix(8.0, 12.0, isPro);
    float angle = atan(uv.y, uv.x);
    float radius = length(uv);

    angle = mod(angle, 6.28318 / segments);
    angle = abs(angle - 3.14159 / segments);
    uv = radius * vec2(cos(angle), sin(angle));

    float iters = mix(3.0, 4.0, isPro);
    for (float i = 0.0; i < 4.0; i++) {
        if(i >= iters) break;
        uv = fract(uv * mix(1.5, 2.0, isPro)) - 0.5;
        float d = length(uv) * exp(-length(uv0));
        vec3 col = mix(paletteClassic(length(uv0) + i*.4 + time*.3), palettePro(length(uv0) + i*.8 + time*.6), isPro);

        if(isPro > 0.5) { d = abs(sin(d*12. + time*2.0))/12.; d = pow(0.005 / d, 1.5); }
        else { d = abs(sin(d*8. + time))/8.; d = pow(0.01 / d, 1.2); }
        finalColor += col * d;
    }
    gl_FragColor = vec4(finalColor, 1.0);
}
`;

const KALEIDOSCOPE_VERT = `
attribute vec2 p;
varying vec2 vUv;
void main() {
    vUv = p * 0.5 + 0.5;
    gl_Position = vec4(p, 0.0, 1.0);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`kaleidoscope shader failed to compile: ${log}`);
  }
  return sh;
}

// createKaleidoscope(canvas) -> { render(timeSeconds), resize(cssW, cssH, dpr), dispose() }
// or null when WebGL is unavailable (caller falls back to the classic table).
export function createKaleidoscope(canvas) {
  let gl = null;
  try {
    gl =
      canvas.getContext('webgl', { alpha: false, antialias: false }) ||
      canvas.getContext('experimental-webgl');
  } catch {
    gl = null;
  }
  if (!gl) return null;

  try {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, KALEIDOSCOPE_VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, KALEIDOSCOPE_FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('kaleidoscope program failed to link');
    }
    gl.useProgram(prog);

    // Fullscreen triangle (covers the viewport; vUv spans 0..1 like his plane).
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const timeLoc = gl.getUniformLocation(prog, 'time');
    const isProLoc = gl.getUniformLocation(prog, 'isPro');
    gl.uniform1f(isProLoc, 0.0); // classic — Merlin's kaleidoscope as he made it

    return {
      render(timeSeconds) {
        gl.uniform1f(timeLoc, timeSeconds);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      resize(cssW, cssH, dpr) {
        const w = Math.max(1, Math.floor(cssW * dpr));
        const h = Math.max(1, Math.floor(cssH * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
      },
      dispose() {
        try {
          gl.deleteBuffer(buf);
          gl.deleteProgram(prog);
        } catch {
          /* best effort */
        }
      },
    };
  } catch {
    return null;
  }
}
