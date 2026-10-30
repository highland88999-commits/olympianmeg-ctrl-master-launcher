// app/quidditch/quidditch3d.js — three.js renderer for Quidditch (Seeker Duel).
// Night stadium: oval pitch, hoops, tiered stands, floodlights. The player
// rides a broom wearing their character badge; the rival is a red rider;
// the Snitch is a golden winged ball; Bludgers are iron spheres that telegraph
// red before homing. Pure render; all game state comes from engine.js.

import * as THREE from 'three';
import { PITCH_HALF_L, PITCH_HALF_W } from './engine.js';

// Circular character badge from a preview PNG (previews are RGB-on-black,
// no alpha — the feathered circular clip handles that, same treatment as
// the collapse-run runner badge).
function makeCharacterTexture(img) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.save();
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
  g.clip();
  const scale = Math.max(S / img.width, S / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
  g.restore();
  g.globalCompositeOperation = 'destination-in';
  const feather = g.createRadialGradient(S / 2, S / 2, S / 2 - 26, S / 2, S / 2, S / 2);
  feather.addColorStop(0, 'rgba(0,0,0,1)');
  feather.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = feather;
  g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createQuidditchRenderer(mount) {
  const W = () => mount.clientWidth || window.innerWidth;
  const H = () => mount.clientHeight || window.innerHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W(), H());
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070f);
  scene.fog = new THREE.Fog(0x05070f, 90, 260);

  const camera = new THREE.PerspectiveCamera(68, W() / H(), 0.1, 500);

  // Lights: night game — cool ambient, moon dir light, two real spotlights.
  scene.add(new THREE.AmbientLight(0x8fa3c7, 0.55));
  const moon = new THREE.DirectionalLight(0xbdd0ff, 0.7);
  moon.position.set(-40, 80, -30);
  scene.add(moon);
  for (const sx of [-1, 1]) {
    const sp = new THREE.SpotLight(0xfff2cc, 900, 220, 0.5, 0.45, 1.6);
    sp.position.set(sx * (PITCH_HALF_W + 26), 46, 0);
    sp.target.position.set(0, 0, 0);
    scene.add(sp, sp.target);
  }

  // Stars.
  const starGeo = new THREE.BufferGeometry();
  {
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 180 + Math.random() * 140;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 30 + Math.random() * 160;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  }
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.1, sizeAttenuation: false })));

  // Pitch: green ellipse + white markings.
  const pitchMat = new THREE.MeshLambertMaterial({ color: 0x1d6b2f });
  const pitch = new THREE.Mesh(new THREE.CircleGeometry(1, 48), pitchMat);
  pitch.rotation.x = -Math.PI / 2;
  pitch.scale.set(PITCH_HALF_W + 14, PITCH_HALF_L + 14, 1);
  scene.add(pitch);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf4f7ff });
  const addLine = (w, l, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, z);
    scene.add(m);
  };
  addLine(PITCH_HALF_W * 2, 0.5, 0, 0);                       // halfway line
  addLine(0.5, PITCH_HALF_L * 2, 0, 0);                        // center stripe
  const centerRing = new THREE.Mesh(new THREE.RingGeometry(7.6, 8, 40), lineMat);
  centerRing.rotation.x = -Math.PI / 2;
  centerRing.position.y = 0.02;
  scene.add(centerRing);

  // Hoops: 3 torus on poles at each end.
  const hoopGeo = new THREE.TorusGeometry(2.2, 0.28, 10, 28);
  const poleGeo = new THREE.CylinderGeometry(0.28, 0.34, 14, 8);
  const hoopMat = new THREE.MeshLambertMaterial({ color: 0xffd75e, emissive: 0xffd75e, emissiveIntensity: 0.35 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x9aa3b2 });
  for (const ez of [-1, 1]) {
    for (let i = -1; i <= 1; i++) {
      const h = 12 + (i === 0 ? 3 : 0);
      const hoop = new THREE.Mesh(hoopGeo, hoopMat);
      hoop.position.set(i * 7, h, ez * (PITCH_HALF_L - 4));
      scene.add(hoop);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(i * 7, h / 2 - 1, ez * (PITCH_HALF_L - 4));
      scene.add(pole);
    }
  }

  // Tiered stands: boxes ringing the oval (cheap, low draw calls).
  const standMat = new THREE.MeshLambertMaterial({ color: 0x232b3d });
  const standMat2 = new THREE.MeshLambertMaterial({ color: 0x2c3650 });
  const stands = new THREE.Group();
  const tiers = 4;
  for (let s = 0; s < 28; s++) {
    const a = (s / 28) * Math.PI * 2;
    const rx = PITCH_HALF_W + 30;
    const rz = PITCH_HALF_L + 30;
    for (let tI = 0; tI < tiers; tI++) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(9, 3.2, 7),
        tI % 2 ? standMat : standMat2
      );
      const rr = 1 + tI * 0.09;
      box.position.set(Math.cos(a) * rx * rr, 2 + tI * 3.4, Math.sin(a) * rz * rr);
      box.lookAt(0, 2 + tI * 3.4, 0);
      stands.add(box);
    }
  }
  scene.add(stands);

  // Floodlight towers at the four corners.
  const towerGeo = new THREE.CylinderGeometry(0.5, 0.8, 46, 8);
  const headGeo = new THREE.BoxGeometry(6, 2.4, 1.2);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const tower = new THREE.Mesh(towerGeo, poleMat);
      tower.position.set(sx * (PITCH_HALF_W + 26), 23, sz * (PITCH_HALF_L + 26));
      scene.add(tower);
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(sx * (PITCH_HALF_W + 26), 46, sz * (PITCH_HALF_L + 26));
      head.lookAt(0, 0, 0);
      scene.add(head);
    }
  }

  // --- The player: broom + character badge ---
  const broomGeo = new THREE.CylinderGeometry(0.09, 0.13, 3.4, 8);
  broomGeo.rotateX(Math.PI / 2);
  const broomMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const broom = new THREE.Mesh(broomGeo, broomMat);
  scene.add(broom);
  const badgeSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ transparent: true, depthWrite: false })
  );
  badgeSprite.scale.set(1.6, 1.6, 1);
  badgeSprite.visible = false;
  scene.add(badgeSprite);
  const fallbackRider = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 0.8, 6, 12),
    new THREE.MeshBasicMaterial({ color: 0x35d0ff })
  );
  scene.add(fallbackRider);
  let characterUrl = null;

  function setCharacter(previewUrl) {
    if (!previewUrl || previewUrl === characterUrl) return;
    characterUrl = previewUrl;
    const img = new Image();
    img.onload = () => {
      try {
        const tex = makeCharacterTexture(img);
        badgeSprite.material.map = tex;
        badgeSprite.material.needsUpdate = true;
        badgeSprite.visible = true;
        fallbackRider.visible = false;
      } catch { /* capsule stands */ }
    };
    img.onerror = () => { /* capsule stands */ };
    img.src = previewUrl;
  }

  // --- The rival: red broom + red rider ---
  const rivalBroom = new THREE.Mesh(broomGeo, new THREE.MeshLambertMaterial({ color: 0x5a3a20 }));
  scene.add(rivalBroom);
  const rivalRider = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 0.8, 6, 12),
    new THREE.MeshBasicMaterial({ color: 0xff4d5e })
  );
  scene.add(rivalRider);

  // --- The Golden Snitch: gold ball + flapping wings + glow ---
  const snitch = new THREE.Group();
  const snitchBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd75e })
  );
  snitch.add(snitchBall);
  const wingGeo = new THREE.PlaneGeometry(0.9, 0.34);
  const wingMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  const wingR = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.x = -0.5;
  wingR.position.x = 0.5;
  snitch.add(wingL, wingR);
  const snitchGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ color: 0xffd75e, transparent: true, opacity: 0.35, depthWrite: false })
  );
  snitchGlow.scale.set(2.4, 2.4, 1);
  snitch.add(snitchGlow);
  scene.add(snitch);

  // --- Bludgers: iron spheres; pulse red while telegraphing ---
  const bludgerGeo = new THREE.SphereGeometry(0.55, 14, 10);
  const bludgerMatA = new THREE.MeshLambertMaterial({ color: 0x2b2f36, emissive: 0xff2222, emissiveIntensity: 0 });
  const bludgerMatB = bludgerMatA.clone();
  const bludgerA = new THREE.Mesh(bludgerGeo, bludgerMatA);
  const bludgerB = new THREE.Mesh(bludgerGeo, bludgerMatB);
  scene.add(bludgerA, bludgerB);

  // --- Quaffle: ambient red ball on a lazy circuit ---
  const quaffle = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 14, 10),
    new THREE.MeshLambertMaterial({ color: 0xc22a2a, emissive: 0xc22a2a, emissiveIntensity: 0.25 })
  );
  scene.add(quaffle);

  // --- Incoming-bludger warning arrow (red cone above the player) ---
  const arrowGeo = new THREE.ConeGeometry(0.55, 1.4, 4);
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xff2b2b, transparent: true, opacity: 0.95 });
  const warnArrow = new THREE.Mesh(arrowGeo, arrowMat);
  warnArrow.visible = false;
  scene.add(warnArrow);

  function placeFlyer(broomMesh, riderMesh, badgeMesh, f, time, isPlayer) {
    broomMesh.position.copy(f.pos);
    broomMesh.rotation.set(0, f.yaw, 0);
    broomMesh.rotateX(-f.pitch * 0.7);
    broomMesh.rotation.z = 0;
    const bobY = Math.sin(time * 7 + (isPlayer ? 0 : 2)) * 0.12;
    riderMesh.position.set(f.pos.x, f.pos.y + 0.75 + bobY, f.pos.z);
    riderMesh.rotation.y = f.yaw;
    if (badgeMesh) {
      badgeMesh.position.set(f.pos.x, f.pos.y + 0.85 + bobY, f.pos.z);
    }
  }

  function update(g, dt, time) {
    const p = g.player;

    // Player + rival.
    placeFlyer(broom, fallbackRider, badgeSprite, p, time, true);
    placeFlyer(rivalBroom, rivalRider, null, g.rival, time, false);
    // Stunned rider wobbles.
    if (p.stunT > 0) {
      fallbackRider.rotation.z = Math.sin(time * 22) * 0.5;
      badgeSprite.material.rotation = Math.sin(time * 22) * 0.4;
    } else {
      fallbackRider.rotation.z = 0;
      badgeSprite.material.rotation = 0;
    }

    // Snitch: wings flap, glow pulses.
    snitch.position.copy(g.snitch.pos);
    const flap = Math.sin(time * 34) * 0.9;
    wingL.rotation.z = 0.5 + flap;
    wingR.rotation.z = -0.5 - flap;
    snitchGlow.material.opacity = 0.28 + Math.sin(time * 6) * 0.12;
    snitch.rotation.y = time * 2;

    // Bludgers; telegraphing ones pulse red.
    const bludgerMeshes = [
      { m: bludgerA, mat: bludgerMatA, b: g.bludgers[0] },
      { m: bludgerB, mat: bludgerMatB, b: g.bludgers[1] },
    ];
    let threat = null;
    for (const { m, mat, b } of bludgerMeshes) {
      m.position.copy(b.pos);
      m.rotation.x = time * 3;
      m.rotation.y = time * 2.2;
      if (b.state === 'telegraph') {
        mat.emissiveIntensity = 0.6 + Math.sin(time * 18) * 0.5;
        threat = b;
      } else if (b.state === 'homing') {
        mat.emissiveIntensity = 0.9;
        threat = b;
      } else {
        mat.emissiveIntensity = 0;
      }
    }

    // Warning arrow above the player, pointing at the incoming bludger.
    if (threat && g.phase === 'playing') {
      warnArrow.visible = true;
      warnArrow.position.set(p.pos.x, p.pos.y + 2.6, p.pos.z);
      const dir = new THREE.Vector3(
        threat.pos.x - p.pos.x, threat.pos.y - p.pos.y, threat.pos.z - p.pos.z
      ).normalize();
      warnArrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      warnArrow.material.opacity = 0.65 + Math.sin(time * 14) * 0.3;
      const s = 1 + Math.sin(time * 14) * 0.12;
      warnArrow.scale.set(s, s, s);
    } else {
      warnArrow.visible = false;
    }

    // Quaffle drifts on its lazy circuit.
    quaffle.position.set(
      Math.sin(time * 0.35) * (PITCH_HALF_W - 8),
      14 + Math.sin(time * 0.5) * 5,
      Math.cos(time * 0.27) * (PITCH_HALF_L - 12)
    );

    // Chase camera: behind and above the player, looking ahead.
    // Screen shake while stunned.
    const shake = p.stunT > 0 ? 0.5 : 0;
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;
    const back = 9;
    const fwX = Math.sin(p.yaw);
    const fwZ = Math.cos(p.yaw);
    camera.position.set(
      p.pos.x - fwX * back + sx,
      p.pos.y + 3.6 + sy,
      p.pos.z - fwZ * back
    );
    camera.lookAt(p.pos.x + fwX * 14, p.pos.y + 1, p.pos.z + fwZ * 14);

    renderer.render(scene, camera);
  }

  function onResize() {
    camera.aspect = W() / H();
    camera.updateProjectionMatrix();
    renderer.setSize(W(), H());
  }
  window.addEventListener('resize', onResize);

  function dispose() {
    window.removeEventListener('resize', onResize);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
    renderer.dispose();
    if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
  }

  return { update, setCharacter, dispose };
}
