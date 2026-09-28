// GLSL sources for the T-1000 liquid-metal holo-dome.
// Fullscreen raymarched chrome blob. No textures, no external assets.
// Deliberately NO bloom pass: highlights are painted in-shader at restrained
// values so the metal stays readable (lighting rule).

export const VERT = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const FRAG = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform float uSwirl;      // accumulated stir rotation (radians)
uniform vec4  uRipples[8]; // x, y in blob-local [-1,1], z = age, w = strength
uniform vec3  uMode;       // noiseScale, flowSpeed, turbulence
uniform float uAlign;       // 0 = swirl noise, 1 = magnetic bands
uniform float uRim;         // rim light amount (restrained)

// ---- hash / noise ----
float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 4.1);
    a *= 0.5;
  }
  return v;
}

// ---- ripple displacement at a blob-local xy ----
float rippleField(vec2 q) {
  float h = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 r = uRipples[i];
    float age = r.z;
    if (age <= 0.0 || age >= 2.2 || r.w <= 0.0) continue;
    float d = distance(q, r.xy);
    float wavefront = age * 1.6;
    float ring = sin((d - wavefront) * 22.0);
    float g = (d - wavefront) * 9.0;
    float band = exp(-g * g);
    float fade = exp(-2.2 * age) * (1.0 - smoothstep(1.4, 2.2, age));
    h += ring * band * fade * r.w;
  }
  return h;
}

// ---- scene SDF: liquid metal blob ----
float mapBlob(vec3 p, out vec2 blobUV) {
  // Rotate the noise domain by the accumulated stir.
  float c = cos(uSwirl), s = sin(uSwirl);
  vec3 q = p;
  q.xy = mat2(c, -s, s, c) * q.xy;

  vec3 nq = q * uMode.x;
  nq.y *= mix(1.0, 3.2, uAlign);      // magnetic bands stretch vertically
  nq += vec3(0.0, -uTime * uMode.y, uTime * uMode.y * 0.6);

  float n = fbm(nq);
  float r = length(p - vec3(0.0, 0.05, 0.0));
  float d = r - 0.92 + (n - 0.5) * uMode.z * 1.1;

  // Ripples displace the surface using the point's blob-local xy.
  blobUV = (p.xy - vec2(0.0, 0.05)) / 0.92;
  d -= rippleField(blobUV) * 0.16;
  return d;
}

vec3 calcNormal(vec3 p) {
  vec2 uv;
  const float e = 0.004;
  vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * mapBlob(p + k.xyy * e, uv) +
                   k.yyx * mapBlob(p + k.yyx * e, uv) +
                   k.yxy * mapBlob(p + k.yxy * e, uv) +
                   k.xxx * mapBlob(p + k.xxx * e, uv));
}

// Procedural studio environment — painted in-shader, no texture fetch.
vec3 envColor(vec3 r) {
  float up = clamp(r.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 base = mix(vec3(0.05, 0.06, 0.09), vec3(0.16, 0.19, 0.26), up);
  // Two soft "softbox" strips for the chrome to catch.
  float s1 = (r.x * 0.7 + r.z * 0.7 - 0.35) * 6.0;
  float s2 = (r.x * 0.7 - r.z * 0.7 + 0.45) * 7.0;
  float strip1 = exp(-s1 * s1) * smoothstep(0.1, 0.6, r.y);
  float strip2 = exp(-s2 * s2) * smoothstep(0.0, 0.5, r.y);
  base += vec3(0.9, 0.95, 1.0) * (strip1 * 0.55 + strip2 * 0.4);
  // Faint warm floor bounce.
  base += vec3(0.10, 0.06, 0.03) * smoothstep(0.0, -0.6, r.y);
  return base;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);

  vec3 ro = vec3(0.0, 0.1, 3.1);
  vec3 rd = normalize(vec3(uv, -1.6));

  // Raymarch the blob.
  float t = 0.0;
  vec2 blobUV;
  bool hit = false;
  for (int i = 0; i < 56; i++) {
    vec3 p = ro + rd * t;
    float d = mapBlob(p, blobUV);
    if (d < 0.002) { hit = true; break; }
    t += d * 0.85;
    if (t > 6.0) break;
  }

  vec3 col;
  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 v = -rd;
    vec3 r = reflect(-v, n);

    // Chrome: mostly environment reflection, little diffuse.
    vec3 env = envColor(r);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 baseMetal = vec3(0.42, 0.45, 0.52);

    // Key light for form readability.
    vec3 L = normalize(vec3(0.5, 0.8, 0.6));
    float diff = max(dot(n, L), 0.0) * 0.28;

    col = baseMetal * diff + env * (0.55 + 0.45 * fres);

    // Restrained rim — holo-dome edge, never blown out.
    col += vec3(0.35, 0.75, 0.95) * fres * uRim;

    // Ripple sparkle where the surface is disturbed.
    float rip = abs(rippleField(blobUV));
    col += vec3(0.5, 0.7, 0.85) * clamp(rip * 0.6, 0.0, 0.35);
  } else {
    // Holo-dome void: dark radial gradient + faint dome rings.
    float d = length(uv);
    col = mix(vec3(0.015, 0.02, 0.035), vec3(0.0, 0.0, 0.01), smoothstep(0.0, 1.6, d));
    float rings = smoothstep(0.48, 0.5, abs(fract(d * 3.0 - uTime * 0.03) - 0.5));
    col += vec3(0.1, 0.3, 0.4) * (1.0 - rings) * 0.05 * smoothstep(1.4, 0.3, d);
    // Soft glow beneath the blob.
    float gd = d * 2.4;
    col += vec3(0.08, 0.16, 0.2) * exp(-gd * gd) * 0.5;
  }

  // Gentle filmic-ish tonemap + gamma; keeps highlights in check.
  col = col / (col + vec3(0.55));
  col = pow(col, vec3(1.0 / 2.2));
  gl_FragColor = vec4(col, 1.0);
}
`;
