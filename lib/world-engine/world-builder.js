// World Engine — procedural textured planets for the World Builder forge.
// Replaces the bare wireframe sphere preview with a real planet: displaced
// terrain, per-biome vertex colors, an atmosphere shell tinted by the sun
// color, and the golden Ω floating brand stamp.
//
// buildWorld(THREE, params) returns a THREE.Group. Params come from the
// synthesis AI: terrainType, terrainRoughness, sunColor, atmosphereDensity,
// ambientLightIntensity, weatherType.

import { makeOmegaBadge } from '@/lib/omega-brand';
import { buildWorldLife } from './life-render.js';

// --- tiny deterministic value-noise ---------------------------------------
function hash3(x, y, z) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  let res = 0;
  // trilinear interpolation over the 8 lattice corners
  const c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi);
  const c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1);
  const c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
  const x00 = c000 + u * (c100 - c000), x10 = c010 + u * (c110 - c010);
  const x01 = c001 + u * (c101 - c001), x11 = c011 + u * (c111 - c011);
  const y0 = x00 + v * (x10 - x00), y1 = x01 + v * (x11 - x01);
  res = y0 + w * (y1 - y0);
  return res; // 0..1
}
function fbm(x, y, z) {
  return noise3(x, y, z) * 0.6 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.28 + noise3(x * 4.3, y * 4.3, z * 4.3) * 0.12;
}

// --- palettes per terrain type: [low, mid, high, accent] -------------------
const PALETTES = {
  alien:    [0x2a0a4a, 0x6b21a8, 0xc084fc, 0x2dd4bf], // violet mesas, teal glow basins
  desert:   [0x8a5a2b, 0xd9a05b, 0xf5d9a0, 0x6b4226], // iron-sand ochres
  ocean:    [0x0a2a5e, 0x1e5fa8, 0x7fd4ff, 0x2dd4bf], // deep blue, shallow teal
  mountains:[0x2b2f36, 0x6b7280, 0xf3f4f6, 0x9ca3af], // rock, snow peaks
  plains:   [0x1a4d2e, 0x3d8b4f, 0xa3d9a5, 0xd9c05b], // greens, dry grass
};
const DEFAULT_PALETTE = PALETTES.alien;

function hexColor(THREE, hex) { return new THREE.Color(hex); }

export function buildWorld(THREE, params = {}) {
  const p = params || {};
  const terrainType = PALETTES[p.terrainType] ? p.terrainType : 'alien';
  const roughness = Math.min(1, Math.max(0.05, Number(p.terrainRoughness) || 0.5));
  const palette = PALETTES[terrainType] || DEFAULT_PALETTE;
  const sun = new THREE.Color(p.sunColor || '#c084fc');
  const atmoDensity = Math.min(1, Math.max(0, Number(p.atmosphereDensity) ?? 0.5));

  const radius = 2;
  const group = new THREE.Group();

  // --- terrain sphere with displaced vertices + vertex colors ---
  const geo = new THREE.IcosahedronGeometry(radius, 24);
  const posAttr = geo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const cLow = hexColor(THREE, palette[0]);
  const cMid = hexColor(THREE, palette[1]);
  const cHigh = hexColor(THREE, palette[2]);
  const cAccent = hexColor(THREE, palette[3]);
  const tmp = new THREE.Color();
  const v = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i);
    const n = v.clone().normalize();
    // ridged fbm for mountains/mesas feel
    const h = fbm(n.x * 2.2 + 7.3, n.y * 2.2 + 3.1, n.z * 2.2 + 5.7);
    const ridged = 1 - Math.abs(2 * h - 1);
    const displacement = (h * 0.7 + ridged * 0.3) * roughness * 0.55;
    v.copy(n).multiplyScalar(radius + displacement);
    posAttr.setXYZ(i, v.x, v.y, v.z);

    // color by elevation + accent veins
    const e = displacement / (roughness * 0.55 + 1e-6); // 0..~1
    if (e < 0.45) tmp.copy(cLow).lerp(cMid, e / 0.45);
    else tmp.copy(cMid).lerp(cHigh, (e - 0.45) / 0.55);
    // teal/glow accent in the low basins
    const vein = noise3(n.x * 6 + 40, n.y * 6, n.z * 6);
    if (e < 0.3 && vein > 0.62) tmp.lerp(cAccent, 0.65);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const terrain = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.15 })
  );
  group.add(terrain);

  // --- faint wireframe overlay keeps the "forge schematic" feel ---
  const wire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius * 1.002, 8),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee, wireframe: true, transparent: true, opacity: 0.10 })
  );
  group.add(wire);

  // --- atmosphere shell, tinted by the sun color ---
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.18, 32, 32),
    new THREE.MeshBasicMaterial({
      color: sun, transparent: true,
      opacity: 0.06 + atmoDensity * 0.16,
      side: THREE.BackSide, depthWrite: false,
    })
  );
  group.add(atmo);

  // --- key light tinted by the sun so the palette reads correctly ---
  const key = new THREE.DirectionalLight(sun, 2.2);
  key.position.set(4, 3, 2);
  group.add(key);
  group.add(new THREE.AmbientLight(0xffffff, 0.35));

  // --- golden Ω floating brand stamp ---
  const badge = makeOmegaBadge(THREE, 0.7);
  badge.position.set(0, radius + 1.35, 0);
  group.add(badge);

  // --- LIFE: the seed-grown flora + fauna layer ---
  // Automatic — every seeded world grows its ecosystem from its seed.
  // The life group animates itself via userData.update.
  const lifeGroup = buildWorldLife(THREE, p, radius);
  group.add(lifeGroup);

  group.userData.update = (dt, t) => {
    group.rotation.y += dt * 0.05; // slow planetary spin
    badge.rotation.y = -group.rotation.y; // stamp stays facing forward
    if (typeof lifeGroup.userData.update === 'function') {
      lifeGroup.userData.update(dt, t);
    }
  };
  return group;
}
