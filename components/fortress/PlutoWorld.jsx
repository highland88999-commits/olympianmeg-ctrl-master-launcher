// components/fortress/PlutoWorld.jsx — the Fortress of Solitude's frozen
// world (Pluto), built in CGI. Procedural three.js + canvas textures,
// in the Fortress's own ice-crystal idiom: pale ice, cyan glow, no
// imported models, no video. Merlin (Nov 28): the Fortress is a 3D
// space inside a frozen world (Pluto); users land on the floor that
// holds the crystals.
//
// buildPlutoWorld(THREE, scene) adds the world and returns:
//   { floorMesh, outerDome, innerDome, dispose }
// floorMesh is the crystal-floor top disc (the page's Set Floor still
// retextures it); the domes are the frozen sky (Set Walls still
// retextures the outer dome). dispose() removes everything it added.

import { DISC_Y, ICE_Y } from '@/lib/fortress/pluto';

// Deterministic pseudo-random so the spires sit in the same places
// every visit (no reshuffle on reload).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The Pluto ice plain: pale blue-white with hairline cracks and sparkle.
function makeIceTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, '#dceefb');
  g.addColorStop(0.5, '#c3ddf2');
  g.addColorStop(1, '#d8ecf9');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const rand = mulberry32(1337);
  // Hairline cracks.
  ctx.strokeStyle = 'rgba(90, 140, 190, 0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 46; i++) {
    let x = rand() * 512;
    let y = rand() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += (rand() - 0.5) * 120;
      y += (rand() - 0.5) * 120;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Sparkle.
  for (let i = 0; i < 320; i++) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + rand() * 0.55})`;
    ctx.fillRect(rand() * 512, rand() * 512, 1.6, 1.6);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28, 28);
  return tex;
}

// The crystal-floor top: deeper ice-blue with cyan veins.
function makePlatformTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(256, 256, 20, 256, 256, 256);
  g.addColorStop(0, '#9fd8ee');
  g.addColorStop(0.6, '#6fb3d8');
  g.addColorStop(1, '#4a86b3');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const rand = mulberry32(4242);
  ctx.strokeStyle = 'rgba(0, 242, 255, 0.5)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) {
    let x = rand() * 512;
    let y = rand() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (rand() - 0.5) * 160;
      y += (rand() - 0.5) * 160;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.2 + rand() * 0.5})`;
    ctx.fillRect(rand() * 512, rand() * 512, 1.5, 1.5);
  }
  return new THREE.CanvasTexture(canvas);
}

// The frozen Pluto sky: pale horizon, deep indigo zenith, a faint far
// sun and stars. Painted once, wrapped on the sky domes.
export function makePlutoSkyTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#0a1030');
  g.addColorStop(0.45, '#274b7a');
  g.addColorStop(0.72, '#8fb8dd');
  g.addColorStop(1, '#cfe8ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  // The far sun: small, pale, low over the horizon.
  const sun = ctx.createRadialGradient(760, 330, 2, 760, 330, 46);
  sun.addColorStop(0, 'rgba(255, 250, 230, 0.95)');
  sun.addColorStop(0.25, 'rgba(230, 240, 255, 0.55)');
  sun.addColorStop(1, 'rgba(230, 240, 255, 0)');
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(760, 330, 46, 0, Math.PI * 2);
  ctx.fill();
  // Stars, denser toward the zenith.
  const rand = mulberry32(99);
  for (let i = 0; i < 420; i++) {
    const y = rand() * rand() * 300;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.35 + rand() * 0.6})`;
    const s = rand() < 0.12 ? 2 : 1;
    ctx.fillRect(rand() * 1024, y, s, s);
  }
  return new THREE.CanvasTexture(canvas);
}

export function buildPlutoWorld(THREE, scene) {
  const added = [];
  const track = (obj) => {
    scene.add(obj);
    added.push(obj);
    return obj;
  };

  // Frozen sky: a pale backdrop colour behind the domes.
  scene.background = new THREE.Color(0x0a1030);
  scene.fog = new THREE.Fog(0x0d1b33, 90, 380);

  // Light: Pluto's far sun — dim, cold, low. The crystals keep
  // their own emissive glow; this light is what makes the ice read.
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x16283f, 0.6);
  track(hemi);
  const sun = new THREE.DirectionalLight(0xe8f2ff, 0.8);
  sun.position.set(80, 50, -100);
  track(sun);

  // The Pluto ice plain, unbounded under the platform.
  const iceMat = new THREE.MeshStandardMaterial({
    map: makeIceTexture(THREE),
    color: 0xd7e9f7,
    roughness: 0.6,
    metalness: 0.05,
  });
  const icePlain = new THREE.Mesh(new THREE.CircleGeometry(420, 64), iceMat);
  icePlain.rotation.x = -Math.PI / 2;
  icePlain.position.y = ICE_Y;
  track(icePlain);

  // The crystal floor: a low platform whose top disc is the floor
  // that holds the crystals. The top disc is its own mesh so the
  // page's Set Floor can retexture it exactly as before.
  const platformMat = new THREE.MeshStandardMaterial({
    map: makePlatformTexture(THREE),
    color: 0x9fd4e8,
    roughness: 0.4,
    metalness: 0.1,
  });
  const platformBody = new THREE.Mesh(
    new THREE.CylinderGeometry(15, 16.5, 1.2, 64),
    platformMat,
  );
  platformBody.position.y = DISC_Y - 0.6;
  track(platformBody);

  const floorMat = new THREE.MeshStandardMaterial({
    map: makePlatformTexture(THREE),
    color: 0xbfe6f5,
    roughness: 0.35,
    metalness: 0.1,
  });
  const floorMesh = new THREE.Mesh(new THREE.CircleGeometry(15, 64), floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = DISC_Y + 0.02;
  track(floorMesh);

  // The glowing rim: the edge of the floor you walk off to levitate.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(15, 0.15, 12, 96),
    new THREE.MeshBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.85 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = DISC_Y + 0.05;
  track(rim);
  const rim2 = new THREE.Mesh(
    new THREE.TorusGeometry(15.5, 0.08, 12, 96),
    new THREE.MeshBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.4 }),
  );
  rim2.rotation.x = Math.PI / 2;
  rim2.position.y = DISC_Y - 0.3;
  track(rim2);

  // The sky domes: the frozen sky wrapped around the whole world.
  // The outer dome keeps the page's Set Walls behaviour (its map is
  // the one a wall upload replaces).
  const skyTex = makePlutoSkyTexture(THREE);
  const outerDome = new THREE.Mesh(
    new THREE.SphereGeometry(380, 40, 40),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, transparent: true, opacity: 0.96 }),
  );
  track(outerDome);
  const innerDome = new THREE.Mesh(
    new THREE.SphereGeometry(375, 40, 40),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending }),
  );
  track(innerDome);

  // Ice spires on the plain: distant frozen mountains, fixed places.
  const rand = mulberry32(20261128);
  const spireMat = new THREE.MeshStandardMaterial({
    color: 0xcfe6ff,
    roughness: 0.35,
    metalness: 0.05,
    flatShading: true,
    emissive: 0x7fb8e8,
    emissiveIntensity: 0.12,
  });
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + rand() * 0.4;
    const dist = 70 + rand() * 150;
    const h = 14 + rand() * 28;
    const r = 3 + rand() * 6;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), spireMat);
    spire.position.set(Math.cos(angle) * dist, ICE_Y + h / 2, Math.sin(angle) * dist);
    spire.rotation.y = rand() * Math.PI;
    track(spire);
  }
  // Small shards near the platform, so the near ice is not bare.
  for (let i = 0; i < 6; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 20 + rand() * 18;
    const h = 3 + rand() * 4;
    const shard = new THREE.Mesh(new THREE.ConeGeometry(1 + rand(), h, 6), spireMat);
    shard.position.set(Math.cos(angle) * dist, ICE_Y + h / 2, Math.sin(angle) * dist);
    shard.rotation.z = (rand() - 0.5) * 0.3;
    track(shard);
  }

  // The beacon: a tall cyan light pillar above the platform centre —
  // the way home when you have drifted out over the ice.
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0x00f2ff, transparent: true, opacity: 0.14,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 70, 12, 1, true), beaconMat);
  beacon.position.set(0, DISC_Y + 35, 0);
  track(beacon);
  const beaconCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 70, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  beaconCore.position.set(0, DISC_Y + 35, 0);
  track(beaconCore);

  return {
    floorMesh,
    outerDome,
    innerDome,
    dispose() {
      for (const obj of added) {
        scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m && m.map) m.map.dispose();
          if (m) m.dispose();
        }
      }
      scene.fog = null;
      scene.background = null;
    },
  };
}
