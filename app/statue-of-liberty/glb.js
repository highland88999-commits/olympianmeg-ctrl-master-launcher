// STATUE OF LIBERTY — procedural GLB export.
// An honest, dependency-free .glb writer: the monument is built in-page as a
// low-poly procedural mesh (no external model, no CDN), then serialized to
// binary glTF 2.0. Pure, DOM-free — fully headless-testable. The page only
// wraps buildStatueGlb() in a Blob download.

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- materials
const MATERIALS = [
  {
    name: "verdigris-copper",
    baseColorFactor: [0.36, 0.55, 0.45, 1.0],
    metallicFactor: 0.35,
    roughnessFactor: 0.65,
  },
  {
    name: "pedestal-stone",
    baseColorFactor: [0.55, 0.53, 0.49, 1.0],
    metallicFactor: 0.0,
    roughnessFactor: 0.9,
  },
  {
    name: "gold-flame",
    baseColorFactor: [1.0, 0.84, 0.38, 1.0],
    metallicFactor: 0.85,
    roughnessFactor: 0.3,
  },
];
const MAT_COPPER = 0;
const MAT_STONE = 1;
const MAT_GOLD = 2;

// ---------------------------------------------------------------- primitives
// All generators return { positions: [x,y,z,...], indices: [a,b,c,...] }.

export function genBox(w, h, d) {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const positions = [
    -x, -y, -z, x, -y, -z, x, y, -z, -x, y, -z, // back
    -x, -y, z, x, -y, z, x, y, z, -x, y, z, // front
    -x, -y, -z, -x, y, -z, -x, y, z, -x, -y, z, // left
    x, -y, -z, x, y, -z, x, y, z, x, -y, z, // right
    -x, -y, -z, x, -y, -z, x, -y, z, -x, -y, z, // bottom
    -x, y, -z, x, y, -z, x, y, z, -x, y, z, // top
  ];
  const indices = [];
  for (let f = 0; f < 6; f++) {
    const o = f * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  return { positions, indices };
}

export function genCylinder(topR, botR, h, seg = 14) {
  const positions = [];
  const indices = [];
  const y = h / 2;
  // side wall
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    positions.push(c * topR, y, s * topR, c * botR, -y, s * botR);
  }
  for (let i = 0; i < seg; i++) {
    const o = i * 2;
    indices.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
  }
  // caps
  const addCap = (r, cy, flip) => {
    const base = positions.length / 3;
    positions.push(0, cy, 0);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU;
      positions.push(Math.cos(a) * r, cy, Math.sin(a) * r);
    }
    for (let i = 1; i <= seg; i++) {
      if (flip) indices.push(base, base + i + 1, base + i);
      else indices.push(base, base + i, base + i + 1);
    }
  };
  addCap(topR, y, true);
  addCap(botR, -y, false);
  return { positions, indices };
}

export function genSphere(r, segU = 16, segV = 12) {
  const positions = [];
  const indices = [];
  for (let v = 0; v <= segV; v++) {
    const ph = (v / segV) * Math.PI;
    const sy = Math.cos(ph);
    const sr = Math.sin(ph);
    for (let u = 0; u <= segU; u++) {
      const a = (u / segU) * TAU;
      positions.push(r * sr * Math.cos(a), r * sy, r * sr * Math.sin(a));
    }
  }
  for (let v = 0; v < segV; v++) {
    for (let u = 0; u < segU; u++) {
      const o = v * (segU + 1) + u;
      indices.push(o, o + 1, o + segU + 1, o + 1, o + segU + 2, o + segU + 1);
    }
  }
  return { positions, indices };
}

export function genCone(r, h, seg = 12) {
  return genCylinder(0.001, r, h, seg); // apex approximated as a tiny cap
}

// ---------------------------------------------------------------- transforms
// 4x4 column-major matrices, as glTF expects.

export function matIdentity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function matTranslate(x, y, z) {
  const m = matIdentity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function matScale(x, y, z) {
  const m = matIdentity();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}

export function matRotateX(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

export function matRotateY(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

export function matRotateZ(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function matMul(a, b) {
  // column-major: result = a * b
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

// Cylinder between two points: builds a unit-Y cylinder, rotates +Y onto the
// direction, then translates. Returns a transform matrix.
export function matCylinderBetween(p0, p1) {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const dz = p1[2] - p0[2];
  const len = Math.hypot(dx, dy, dz);
  const dir = [dx / len, dy / len, dz / len];
  // rotate +Y onto dir
  const up = [0, 1, 0];
  const dot = up[1] * dir[0] * 0 + dir[1]; // = dir.y
  let rot;
  if (dot > 0.99999) {
    rot = matIdentity();
  } else if (dot < -0.99999) {
    rot = matRotateZ(Math.PI);
  } else {
    // axis = up x dir, angle = acos(dot)
    const ax = up[1] * dir[2] - up[2] * dir[1];
    const ay = up[2] * dir[0] - up[0] * dir[2];
    const az = up[0] * dir[1] - up[1] * dir[0];
    const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const t = 1 - c;
    const n = Math.hypot(ax, ay, az);
    const x = ax / n;
    const y = ay / n;
    const z = az / n;
    // Rodrigues, column-major
    rot = [
      t * x * x + c,
      t * x * y + s * z,
      t * x * z - s * y,
      0,
      t * x * y - s * z,
      t * y * y + c,
      t * y * z + s * x,
      0,
      t * x * z + s * y,
      t * y * z - s * x,
      t * z * z + c,
      0,
      0,
      0,
      0,
      1,
    ];
  }
  const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
  return matMul(matTranslate(mid[0], mid[1], mid[2]), matMul(rot, matScale(1, len, 1)));
}

export function transformPoint(m, p) {
  const [x, y, z] = p;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

// ---------------------------------------------------------------- statue mesh
// A part: { geo, matrix, material }. All parts are merged per material into
// one mesh with one primitive per material.

export function buildStatueParts() {
  const parts = [];
  const add = (geo, matrix, material) => parts.push({ geo, matrix, material });

  // ---- pedestal (stone): stepped base + column ----
  add(genBox(4.6, 0.7, 4.6), matTranslate(0, 0.35, 0), MAT_STONE);
  add(genBox(3.6, 0.7, 3.6), matTranslate(0, 1.05, 0), MAT_STONE);
  add(genBox(2.6, 2.0, 2.6), matTranslate(0, 2.4, 0), MAT_STONE);
  add(genBox(3.0, 0.35, 3.0), matTranslate(0, 3.55, 0), MAT_STONE);

  // ---- robe (copper): tapered gown from pedestal to torso ----
  add(
    genCylinder(0.72, 1.15, 4.4, 16),
    matTranslate(0, 5.9, 0),
    MAT_COPPER
  );
  // torso
  add(
    genCylinder(0.55, 0.72, 1.5, 14),
    matTranslate(0, 8.85, 0),
    MAT_COPPER
  );

  // ---- head + crown (copper) ----
  add(genSphere(0.5, 16, 12), matTranslate(0, 10.1, 0), MAT_COPPER);
  add(
    genCylinder(0.56, 0.56, 0.2, 16),
    matTranslate(0, 10.55, 0),
    MAT_COPPER
  );
  // seven spikes, fanning upward
  for (let i = 0; i < 7; i++) {
    const th = ((i - 3) / 3) * 0.85; // -0.85..0.85 rad around the crown
    const px = Math.sin(th) * 0.5;
    const pz = -Math.cos(th) * 0.5 * 0.35; // shallow depth arc
    const tilt = 0.42; // outward lean
    const m = matMul(
      matTranslate(px, 10.95, pz),
      matMul(matRotateZ(-th * 1.1), matRotateX(tilt * -Math.cos(th)))
    );
    add(genCone(0.07, 0.85, 8), m, MAT_COPPER);
  }

  // ---- left arm + tablet (copper) ----
  add(
    genCylinder(0.16, 0.19, 1, 10),
    matCylinderBetween([-0.55, 9.2, 0], [-1.55, 7.9, 0.1]),
    MAT_COPPER
  );
  add(
    genBox(0.62, 0.85, 0.1),
    matMul(matTranslate(-1.62, 7.75, 0.12), matRotateZ(0.25)),
    MAT_COPPER
  );

  // ---- right arm raised + torch (copper) ----
  add(
    genCylinder(0.16, 0.19, 1, 10),
    matCylinderBetween([0.55, 9.2, 0], [1.25, 11.4, 0]),
    MAT_COPPER
  );
  // torch handle
  add(
    genCylinder(0.1, 0.1, 1, 10),
    matCylinderBetween([1.25, 11.4, 0], [1.42, 12.5, 0]),
    MAT_COPPER
  );
  // torch cup (wider at top)
  add(
    genCylinder(0.26, 0.12, 0.38, 12),
    matTranslate(1.44, 12.65, 0),
    MAT_COPPER
  );
  // flame (gold)
  add(genCone(0.19, 0.7, 10), matTranslate(1.44, 13.2, 0), MAT_GOLD);

  return parts;
}

// ---------------------------------------------------------------- GLB writer

function computeNormals(positions, indices) {
  const n = positions.length / 3;
  const normals = new Float32Array(n * 3);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    // face normal = ab x ac
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    normals[a] += nx;
    normals[a + 1] += ny;
    normals[a + 2] += nz;
    normals[b] += nx;
    normals[b + 1] += ny;
    normals[b + 2] += nz;
    normals[c] += nx;
    normals[c + 1] += ny;
    normals[c + 2] += nz;
  }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
    if (l > 1e-12) {
      normals[i * 3] /= l;
      normals[i * 3 + 1] /= l;
      normals[i * 3 + 2] /= l;
    }
  }
  return normals;
}

function mergeParts(parts) {
  // one { positions, indices } per material
  const groups = MATERIALS.map(() => ({ positions: [], indices: [] }));
  for (const part of parts) {
    const g = groups[part.material];
    const base = g.positions.length / 3;
    const gp = part.geo.positions;
    for (let i = 0; i < gp.length; i += 3) {
      const p = transformPoint(part.matrix, [gp[i], gp[i + 1], gp[i + 2]]);
      g.positions.push(p[0], p[1], p[2]);
    }
    for (const idx of part.geo.indices) g.indices.push(base + idx);
  }
  return groups;
}

// Returns a Uint8Array with the full .glb binary.
export function buildStatueGlb() {
  const groups = mergeParts(buildStatueParts());

  // per-primitive accessors: POSITION, NORMAL, INDICES
  const binParts = []; // Uint8Arrays, appended in accessor order
  const bufferViews = [];
  const accessors = [];
  let byteOffset = 0;

  const pushAccessor = (data, componentType, count, type, min, max) => {
    const byteLength = data.byteLength;
    bufferViews.push({ buffer: 0, byteOffset, byteLength });
    binParts.push(data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    accessors.push({
      bufferView: bufferViews.length - 1,
      byteOffset: 0,
      componentType,
      count,
      type,
      min,
      max,
    });
    byteOffset += byteLength;
    // pad to 4 bytes
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad > 0) {
      bufferViews.push({ buffer: 0, byteOffset, byteLength: pad });
      binParts.push(new Uint8Array(pad));
      byteOffset += pad;
    }
  };

  const primitives = [];
  for (let m = 0; m < groups.length; m++) {
    const g = groups[m];
    if (g.positions.length === 0) continue;
    const pos = new Float32Array(g.positions);
    const nor = computeNormals(g.positions, g.indices);
    const use32 = pos.length / 3 > 65535;
    const idx = use32
      ? new Uint32Array(g.indices)
      : new Uint16Array(g.indices);
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (pos[i + k] < min[k]) min[k] = pos[i + k];
        if (pos[i + k] > max[k]) max[k] = pos[i + k];
      }
    }
    const posIx = accessors.length;
    pushAccessor(pos, 5126, pos.length / 3, "VEC3", Array.from(min), Array.from(max));
    const norIx = accessors.length;
    pushAccessor(nor, 5126, nor.length / 3, "VEC3");
    const idxIx = accessors.length;
    pushAccessor(idx, use32 ? 5125 : 5123, idx.length, "SCALAR");
    primitives.push({
      attributes: { POSITION: posIx, NORMAL: norIx },
      indices: idxIx,
      material: m,
      mode: 4,
    });
  }

  const json = {
    asset: { version: "2.0", generator: "ARGUS procedural GLB writer" },
    scene: 0,
    scenes: [{ name: "Liberty Monument", nodes: [0] }],
    nodes: [{ name: "Statue of Liberty", mesh: 0 }],
    meshes: [{ name: "Liberty Monument", primitives }],
    materials: MATERIALS.map((mt) => ({
      name: mt.name,
      pbrMetallicRoughness: {
        baseColorFactor: mt.baseColorFactor,
        metallicFactor: mt.metallicFactor,
        roughnessFactor: mt.roughnessFactor,
      },
    })),
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const binTotal = byteOffset;

  const totalLength =
    12 + // header
    8 +
    jsonBytes.length +
    jsonPad + // JSON chunk
    8 +
    binTotal; // BIN chunk (already 4-aligned)

  const out = new Uint8Array(totalLength);
  const view = new DataView(out.buffer);
  // header
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  // JSON chunk
  let o = 12;
  view.setUint32(o, jsonBytes.length + jsonPad, true);
  view.setUint32(o + 4, 0x4e4f534a, true); // "JSON"
  o += 8;
  out.set(jsonBytes, o);
  out.fill(0x20, o + jsonBytes.length, o + jsonBytes.length + jsonPad);
  o += jsonBytes.length + jsonPad;
  // BIN chunk
  view.setUint32(o, binTotal, true);
  view.setUint32(o + 4, 0x004e4942, true); // "BIN\0"
  o += 8;
  for (const part of binParts) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}
