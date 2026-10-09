// lib/seasonal/tree.js
//
// Merlin's perfected Christmas tree ("Christmas Tree — Winter Mountaintop"),
// ported from ~/workspace/christmas-tree/perfected-tree.html into a reusable
// three.js group for the hub. Geometry, colors, counts, and the twinkle
// animation are his — only the scene/camera/renderer scaffolding was lifted
// out so the tree can live inside the launcher's 3D hub.
//
// buildChristmasTree(THREE) -> { group, update(t), dispose() }
//   group  : THREE.Group containing trunk, foliage, ornaments, lights,
//            star, and presents. ~30 units tall, base at y=0.
//   update : call every frame with elapsed seconds — twinkles the lights,
//            breathes the star, spins the ornaments (his beatPulse logic).
//   dispose: frees geometries/materials/textures.

export function buildChristmasTree(THREE) {
  const group = new THREE.Group();
  const ornaments = [];
  const lightMeshes = [];
  const treeLights = [];
  let starMesh = null;
  let starGlow = null;

  function makeSprite(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const warmGlowTex = makeSprite('rgba(255,220,150,1)', 'rgba(255,180,80,0)');

  // ---- his buildTree(), verbatim except scene -> group ----
  const treeGroup = new THREE.Group();
  group.add(treeGroup);
  const H = 30;

  // trunk
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.4, 5, 10),
    new THREE.MeshStandardMaterial({ color: 0x4a2f1d, roughness: 0.95 })
  );
  trunk.position.y = 2.5;
  treeGroup.add(trunk);

  // foliage — layered cones with organic noise + snow dusting via vertex colors
  const layers = 7;
  for (let l = 0; l < layers; l++) {
    const t = l / (layers - 1);
    const r = 11 * (1 - t * 0.82) + 0.6, h = 7.5;
    const y = 4.5 + t * (H - 6);
    const geo = new THREE.ConeGeometry(r, h, 24, 6);
    const posA = geo.attributes.position;
    const colors = [];
    const cGreen = new THREE.Color(0x14532a), cSnow = new THREE.Color(0xeef4ff);
    const tmp = new THREE.Color();
    for (let i = 0; i < posA.count; i++) {
      const vx = posA.getX(i), vy = posA.getY(i), vz = posA.getZ(i);
      const n = Math.sin(vx * 1.7 + vy) * Math.cos(vz * 1.9) * 0.55 + Math.sin(vy * 3.1 + vx) * 0.3;
      const s = 1 + n * 0.09;
      posA.setX(i, vx * s); posA.setZ(i, vz * s);
      const up = THREE.MathUtils.clamp((vy / h) + 0.5, 0, 1);
      const snowAmt = Math.pow(up, 2.2) * 0.85;
      tmp.copy(cGreen).lerp(cSnow, snowAmt);
      const vr = 0.92 + Math.random() * 0.16;
      colors.push(tmp.r * vr, tmp.g * vr, tmp.b * vr);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.9, metalness: 0.0, flatShading: true
    }));
    m.position.y = y;
    treeGroup.add(m);
  }

  // ---- ornaments: reflective baubles ----
  const ornColors = [0xc0272d, 0xd4af37, 0xc0c0e0, 0xb01e28, 0x2d6cdf, 0xe8b923];
  const ornGeo = new THREE.SphereGeometry(0.55, 20, 20);
  for (let i = 0; i < 90; i++) {
    const t = Math.random();
    const y = 5 + t * 23;
    const maxR = 11 * (1 - (y - 4.5) / (H - 6) * 0.82);
    const rr = maxR * (0.55 + Math.random() * 0.5);
    const a = Math.random() * Math.PI * 2;
    const mat = new THREE.MeshStandardMaterial({
      color: ornColors[i % ornColors.length],
      roughness: 0.15, metalness: 1.0
    });
    const o = new THREE.Mesh(ornGeo, mat);
    o.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
    const s = 0.7 + Math.random() * 0.7;
    o.scale.set(s, s, s);
    treeGroup.add(o);
    ornaments.push(o);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.25, 8),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.3 })
    );
    cap.position.set(o.position.x, o.position.y + 0.55 * s, o.position.z);
    treeGroup.add(cap);
  }

  // ---- tree lights: warm glowing points spiraling up ----
  const lightGeo = new THREE.SphereGeometry(0.16, 8, 8);
  const lightCols = [0xffd27a, 0xfff3c4, 0xffb347, 0xffe9a8];
  for (let i = 0; i < 320; i++) {
    const t = i / 320;
    const y = 5 + t * 23.5;
    const maxR = 11 * (1 - (y - 4.5) / (H - 6) * 0.82);
    const a = t * Math.PI * 14;
    const rr = maxR * 0.92;
    const col = lightCols[i % lightCols.length];
    const lm = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: col }));
    lm.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
    treeGroup.add(lm);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: warmGlowTex, color: col, transparent: true,
      opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    glow.scale.set(1.6, 1.6, 1);
    glow.position.copy(lm.position);
    treeGroup.add(glow);
    lightMeshes.push({ mesh: lm, glow, phase: Math.random() * Math.PI * 2, speed: 1.5 + Math.random() * 2 });
  }

  // ---- star topper ----
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1.6 : 0.65;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i === 0 ? starShape.moveTo(x, y) : starShape.lineTo(x, y);
  }
  starShape.closePath();
  const starGeo = new THREE.ExtrudeGeometry(starShape, {
    depth: 0.5, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2
  });
  starGeo.center();
  starMesh = new THREE.Mesh(starGeo, new THREE.MeshStandardMaterial({
    color: 0xffd700, emissive: 0xffb300, emissiveIntensity: 1.2,
    metalness: 0.9, roughness: 0.25
  }));
  starMesh.position.y = H + 1.2;
  treeGroup.add(starMesh);
  starGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: warmGlowTex, color: 0xffd700, transparent: true,
    opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  starGlow.scale.set(9, 9, 1);
  starGlow.position.copy(starMesh.position);
  treeGroup.add(starGlow);

  // warm light washing the tree (kept — part of the tree's look)
  const warm = new THREE.PointLight(0xffc873, 1.6, 70);
  warm.position.set(0, 16, 14);
  treeGroup.add(warm);
  treeLights.push({ light: warm, base: 1.6, phase: 0 });
  const warm2 = new THREE.PointLight(0xff9a3c, 1.1, 60);
  warm2.position.set(-10, 10, -8);
  treeGroup.add(warm2);
  treeLights.push({ light: warm2, base: 1.1, phase: 1.3 });

  // ---- presents (his buildPresents) ----
  const presentCols = [0xc0272d, 0x1d5fa8, 0x2d8a4e, 0x7a2dc0, 0xd4af37, 0xe8e8f0];
  const spots = [
    [6.5, 0, 3.5, 2.6], [-6, 0, 4.5, 2.2], [4, 0, -6.5, 3.0],
    [-4.5, 0, -4, 1.8], [8.5, 0, -2, 2.0], [-8, 0, 1, 2.4],
  ];
  for (let i = 0; i < spots.length; i++) {
    const [px, , pz, s] = spots[i];
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(s, s * 0.8, s),
      new THREE.MeshStandardMaterial({
        color: presentCols[i % presentCols.length], roughness: 0.5, metalness: 0.2
      })
    );
    box.position.set(px, (s * 0.8) / 2, pz);
    box.rotation.y = Math.random() * Math.PI;
    treeGroup.add(box);
    const ribbonMat = new THREE.MeshStandardMaterial({
      color: 0xe8c33c, metalness: 0.8, roughness: 0.35
    });
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(s * 1.02, s * 0.82, s * 0.18), ribbonMat);
    r1.position.copy(box.position); r1.rotation.y = box.rotation.y;
    treeGroup.add(r1);
    const r2 = new THREE.Mesh(new THREE.BoxGeometry(s * 0.18, s * 0.82, s * 1.02), ribbonMat);
    r2.position.copy(box.position); r2.rotation.y = box.rotation.y;
    treeGroup.add(r2);
  }

  // ---- his beatPulse + per-frame tree animation, minus camera/snow ----
  function beatPulse(t) {
    const bpm = 128, spb = 60 / bpm;
    const beat = (t / spb) % 4;
    const env = Math.pow(Math.max(0, 1 - Math.abs(beat - 0.12) * 6), 2);
    const env2 = Math.pow(Math.max(0, 1 - Math.abs(beat - 2.12) * 6), 2) * 0.5;
    return 0.55 + env * 0.45 + env2;
  }

  function update(t) {
    const pulse = beatPulse(t);
    for (const l of lightMeshes) {
      const tw = 0.6 + 0.4 * Math.sin(t * l.speed + l.phase);
      const b = tw * (0.55 + pulse * 0.65);
      l.glow.material.opacity = 0.35 + b * 0.55;
      const s = 1.1 + b * 0.9;
      l.glow.scale.set(s, s, 1);
    }
    for (const tl of treeLights) {
      tl.light.intensity = tl.base * (0.7 + pulse * 0.5 + Math.sin(t * 3 + tl.phase) * 0.12);
    }
    starMesh.rotation.y = t * 0.6;
    starMesh.material.emissiveIntensity = 0.9 + pulse * 0.9;
    starGlow.material.opacity = 0.55 + pulse * 0.4;
    const ss = 8 + pulse * 3;
    starGlow.scale.set(ss, ss, 1);
    for (let i = 0; i < ornaments.length; i++) {
      ornaments[i].rotation.y = t * 0.4 + i;
    }
  }

  function dispose() {
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
    warmGlowTex.dispose();
  }

  return { group, update, dispose };
}
