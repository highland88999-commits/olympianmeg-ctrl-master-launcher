// lib/hub-stars.js — Endless hub star field: pure math + deterministic generation.
//
// (Merlin, Nov 25, 2026 — infinite space in the Olympus hub.)
//
// The defect: the hub's star field was a drei <Stars> shell fixed on the
// origin (radius 400, depth 200). Fly ~400 units out and you leave the
// stars behind; fly past the camera far plane (5000) and the sky is black.
// The fix: the same field, generated deterministically here, rendered by
// components/HubStars.jsx in a shell that rides on the camera every frame
// — the Mars 2 precedent (components/mars2/Mars2Scene.jsx Mars2Stars).
// Stars are effectively at infinity, so zero parallax is the correct look:
// the field never ends, never pops in, never repeats visibly.
//
// Look preservation: generateHubStars replicates drei Stars' generator
// verbatim in distribution (same radius/depth/count/factor/saturation,
// same radius random-walk, same uniform-sphere directions, same sizes and
// HSL colors) and HubStars uses drei's star shader verbatim — only the
// random source is seeded, so the sky is the same every load instead of
// reshuffling. The effective shell is ~500–600 from the camera (drei's
// radius walk starts at radius + depth and sheds depth/count per star,
// so the radii land in [radius, radius + depth]).
//
// Precision (why no floating-origin recenter of the world is needed):
// three.js multiplies view x model on the CPU in float64 and only then
// uploads the result as float32. For anything near the camera — the star
// shell, the bike, the rider — the +/-100,000 translations cancel in
// float64 before the upload, so the residual error is the float32 ulp of
// the small local offset (cameraLocalErrorBound, < 0.0001 at any distance).
// Only geometry far from the camera (the landmarks, back at home) carries
// the float32 ulp of the camera distance — and landmarks only render while
// the camera is within the far plane (5000), where that ulp is < 0.0005.
// Beyond that they are culled, and the only thing left on screen is the
// camera-local star shell. So flying to 100,000+ units stays smooth with
// no world shift, no landmark move, and no touch to the Earth dive,
// the intro, or freeroam — the sky is the only thing that follows.

// The field, exactly as the old drei <Stars> was mounted in HomeScene:
// <Stars radius={400} depth={200} count={20000} factor={5} saturation={0}
//   fade speed={1} />. Keep these values — they ARE the look near home.
export const HUB_STAR_PARAMS = {
  count: 20000,
  radius: 400,
  depth: 200,
  factor: 5,
  saturation: 0,
  fade: true,
  speed: 1,
};

// Fixed seed: the same sky on every load (the old field reshuffled per reload).
export const HUB_STAR_SEED = 20261125;

// Must match the Canvas camera far in components/HomeScene.jsx — the
// star shell (outer radius radius + depth = 600) must sit well inside it.
// Raised 2000 -> 5000 for the Part 13 exponential orbit rings (ring 3 at
// 1965.6; its far arc needs the headroom at scroll-out). Precision still
// holds: float32 ulp at 5000 is ~0.00049, sub-millimetre per the test.
export const HUB_CAMERA_FAR = 5000;

// Deterministic PRNG (mulberry32) — the only random source in the field.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// THREE.Color.setHSL's algorithm, pure — h, s, l in [0, 1].
export function hslToRgb(h, s, l) {
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

// Generate the star field. Replicates drei Stars' distribution exactly
// (same radius walk, same uniform-sphere directions via Spherical, same
// size/color rules) with a seeded RNG, so the output is deterministic.
export function generateHubStars(params = HUB_STAR_PARAMS, seed = HUB_STAR_SEED) {
  const { count, radius, depth, factor, saturation } = params;
  const rand = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  let r = radius + depth;
  const increment = depth / count;
  for (let i = 0; i < count; i++) {
    r -= increment * rand();
    // Uniform direction on the sphere (drei's Spherical: phi from
    // acos(1 - 2u), theta uniform) at the walked radius.
    const phi = Math.acos(1 - rand() * 2);
    const theta = rand() * 2 * Math.PI;
    const sinPhi = Math.sin(phi);
    positions[i * 3] = r * sinPhi * Math.sin(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * sinPhi * Math.cos(theta);
    const [cr, cg, cb] = hslToRgb((i / count) % 1, saturation, 0.9);
    colors[i * 3] = cr;
    colors[i * 3 + 1] = cg;
    colors[i * 3 + 2] = cb;
    sizes[i] = (0.5 + 0.5 * rand()) * factor;
  }
  return { positions, colors, sizes };
}

// Radii of every star in a generated field, in generation order.
export function starRadii(field) {
  const n = field.positions.length / 3;
  const radii = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = field.positions[i * 3];
    const y = field.positions[i * 3 + 1];
    const z = field.positions[i * 3 + 2];
    radii[i] = Math.hypot(x, y, z);
  }
  return radii;
}

// Hard bounds every generated radius lies within: the walk starts at
// radius + depth and only ever decreases, by at most depth in total.
export function shellBounds(params = HUB_STAR_PARAMS) {
  return { inner: params.radius, outer: params.radius + params.depth };
}

// The follow rule: the shell centre IS the camera position, exactly.
// The shell is centred on the camera, so every star sits inner..outer
// from the camera at every camera position — no boundary, no pop-in,
// and the star-to-camera distance set never changes as the camera moves.
export function shellCenterForCamera(camera) {
  return { x: camera.x, y: camera.y, z: camera.z };
}

// Recenter step: move the shell to the camera, touch nothing else.
// Landmarks are carried by reference — recenter can never move, rotate,
// or rescale them (or the Earth dive, intro, or freeroam state).
export function followShell(state, camera) {
  return { shellCenter: shellCenterForCamera(camera), landmarks: state.landmarks };
}

// float32 unit-in-the-last-place at a magnitude: the quantization a
// float32 value of that size carries.
export function float32Ulp(magnitude) {
  if (!(magnitude > 0) || !Number.isFinite(magnitude)) return 0;
  return Math.pow(2, Math.floor(Math.log2(magnitude)) - 23);
}

// Worst-case render error for geometry that rides with the camera (the
// star shell, the bike): the view x model translations cancel in float64
// on the CPU before the float32 upload, so only the ulp of the small
// local offset remains — independent of how far out the camera has flown.
export function cameraLocalErrorBound(localOffset) {
  return float32Ulp(localOffset);
}

// Worst-case render error for geometry far from the camera (a landmark
// back at home): the float32 ulp of the camera distance itself.
export function distantObjectErrorBound(cameraDistance) {
  return float32Ulp(cameraDistance);
}
