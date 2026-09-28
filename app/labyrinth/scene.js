/**
 * Labyrinth — three.js scene factory.
 * First-person-readable elevated view of a dark stone maze:
 * glowing player orb, collectible tokens, an exit portal,
 * and the Watching Eye (the eye-tracking motif from the second source repo) that
 * tracks the player's movement. Restrained bloom, full dispose.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { stoneWallTexture, floorTexture } from './painters.js';

export const CELL = 4;
const WALL_H = 3;
const WALL_T = 0.35;

// Bloom: restrained — only glowing things (player, tokens, exit, eye) bloom.
export const BLOOM = { strength: 0.45, radius: 0.2, threshold: 0.6 };

function cellToWorld(x, y, size) {
  return {
    x: (x - (size - 1) / 2) * CELL,
    z: (y - (size - 1) / 2) * CELL,
  };
}

export function createLabyrinthScene(container, game, options = {}) {
  const reducedMotion = !!options.reducedMotion;
  const size = game.maze.size;
  const half = ((size - 1) / 2) * CELL;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 28, 80);

  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / Math.max(1, container.clientHeight),
    0.1,
    400
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  container.appendChild(renderer.domElement);

  // --- Lights ---
  scene.add(new THREE.AmbientLight(0x334, 0.9));
  const moon = new THREE.DirectionalLight(0x445577, 0.5);
  moon.position.set(-10, 20, 8);
  scene.add(moon);

  const playerLight = new THREE.PointLight(0x39ffdd, 40, 20, 1.6);
  scene.add(playerLight);

  // --- Floor ---
  const floorTex = new THREE.CanvasTexture(floorTexture(77));
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(size, size);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size * CELL + 8, size * CELL + 8),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // --- Walls (single InstancedMesh = one draw call) ---
  const wallTex = new THREE.CanvasTexture(stoneWallTexture(42));
  wallTex.colorSpace = THREE.SRGBColorSpace;
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, metalness: 0.05 });

  const wallGeoH = new THREE.BoxGeometry(CELL + WALL_T, WALL_H, WALL_T); // N/S walls
  const wallGeoV = new THREE.BoxGeometry(WALL_T, WALL_H, CELL + WALL_T); // E/W walls

  const placements = [];
  const { walls } = game.maze;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = cellToWorld(x, y, size);
      const w = walls[y][x];
      if (w & 1) placements.push({ geo: 'h', x: p.x, z: p.z - CELL / 2 }); // north
      if (w & 8) placements.push({ geo: 'v', x: p.x - CELL / 2, z: p.z }); // west
      if (y === size - 1 && w & 4) placements.push({ geo: 'h', x: p.x, z: p.z + CELL / 2 }); // south edge
      if (x === size - 1 && w & 2) placements.push({ geo: 'v', x: p.x + CELL / 2, z: p.z }); // east edge
    }
  }
  const hCount = placements.filter((pl) => pl.geo === 'h').length;
  const wallMeshH = new THREE.InstancedMesh(wallGeoH, wallMat, Math.max(1, hCount));
  const wallMeshV = new THREE.InstancedMesh(wallGeoV, wallMat, Math.max(1, placements.length - hCount));
  const m4 = new THREE.Matrix4();
  let hi = 0;
  let vi = 0;
  for (const pl of placements) {
    m4.makeTranslation(pl.x, WALL_H / 2, pl.z);
    if (pl.geo === 'h') wallMeshH.setMatrixAt(hi++, m4);
    else wallMeshV.setMatrixAt(vi++, m4);
  }
  wallMeshH.instanceMatrix.needsUpdate = true;
  wallMeshV.instanceMatrix.needsUpdate = true;
  scene.add(wallMeshH, wallMeshV);

  // --- Player orb ---
  const player = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 24, 24),
    new THREE.MeshStandardMaterial({
      color: 0x0b2b26,
      emissive: 0x39ffdd,
      emissiveIntensity: 2.2,
      roughness: 0.3,
    })
  );
  const start = cellToWorld(game.player.x, game.player.y, size);
  player.position.set(start.x, 0.6, start.z);
  scene.add(player);
  const playerTarget = player.position.clone();

  // --- Tokens ---
  const tokenGeo = new THREE.OctahedronGeometry(0.42);
  const tokenMat = new THREE.MeshStandardMaterial({
    color: 0x1a1030,
    emissive: 0xb46bff,
    emissiveIntensity: 2.4,
    roughness: 0.25,
  });
  const tokenMeshes = game.tokens.map((t) => {
    const m = new THREE.Mesh(tokenGeo, tokenMat.clone());
    const p = cellToWorld(t.x, t.y, size);
    m.position.set(p.x, 1.1, p.z);
    m.userData.baseY = 1.1;
    scene.add(m);
    return m;
  });

  // --- Start marker (subtle green disc) ---
  const startMark = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 32),
    new THREE.MeshBasicMaterial({ color: 0x1a5c3f, transparent: true, opacity: 0.55 })
  );
  startMark.rotation.x = -Math.PI / 2;
  startMark.position.set(start.x, 0.02, start.z);
  scene.add(startMark);

  // --- Exit portal (hidden until open) ---
  const exitGroup = new THREE.Group();
  const exitRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.16, 16, 48),
    new THREE.MeshStandardMaterial({
      color: 0x0b2b1a,
      emissive: 0x39ff14,
      emissiveIntensity: 2.6,
      roughness: 0.3,
    })
  );
  exitRing.rotation.x = Math.PI / 2;
  const exitLight = new THREE.PointLight(0x39ff14, 30, 14, 1.7);
  const ep = cellToWorld(game.exit.x, game.exit.y, size);
  exitGroup.position.set(ep.x, 1.2, ep.z);
  exitGroup.add(exitRing, exitLight);
  exitGroup.visible = false;
  scene.add(exitGroup);

  // --- The Watching Eye (eye-tracking motif from the second source repo) ---
  const eyeGroup = new THREE.Group();
  const eyeBall = new THREE.Mesh(
    new THREE.SphereGeometry(2.1, 32, 32),
    new THREE.MeshStandardMaterial({
      color: 0xd8d8d8,
      emissive: 0x881111,
      emissiveIntensity: 0.9,
      roughness: 0.15,
    })
  );
  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  pupil.position.z = 1.55;
  const eyeLight = new THREE.PointLight(0xff2222, 12, 16, 1.8);
  eyeGroup.add(eyeBall, pupil, eyeLight);
  eyeGroup.position.set(0, 13, 0);
  scene.add(eyeGroup);

  // --- Post-processing: restrained bloom ---
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    BLOOM.strength,
    BLOOM.radius,
    BLOOM.threshold
  );
  composer.addPass(bloomPass);

  // Camera follow state
  const camTarget = new THREE.Vector3(start.x, 0, start.z);
  const camDist = Math.max(16, size * CELL * 0.85);
  const camHeight = camDist * 0.95;
  const lookOffset = new THREE.Vector3(0, 0, 3.2);
  let disposed = false;

  function sync() {
    const p = cellToWorld(game.player.x, game.player.y, size);
    playerTarget.set(p.x, 0.6, p.z);
    game.tokens.forEach((t, i) => {
      tokenMeshes[i].visible = !t.collected;
    });
    exitGroup.visible = game.exit.open;
    if (reducedMotion) {
      player.position.copy(playerTarget);
      camTarget.copy(playerTarget);
    }
  }
  sync();

  let raf = 0;
  const clock = new THREE.Clock();

  function update() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // Player glide toward target cell
    if (!reducedMotion) {
      player.position.lerp(playerTarget, 1 - Math.pow(0.0001, dt));
      camTarget.lerp(playerTarget, 1 - Math.pow(0.001, dt));
    } else {
      player.position.copy(playerTarget);
      camTarget.copy(playerTarget);
    }
    player.position.y = 0.6 + (reducedMotion ? 0 : Math.sin(t * 3) * 0.08);
    playerLight.position.copy(player.position).y += 1.2;

    // Tokens bob / spin
    if (!reducedMotion) {
      tokenMeshes.forEach((m, i) => {
        if (!m.visible) return;
        m.position.y = m.userData.baseY + Math.sin(t * 2.2 + i * 2.1) * 0.22;
        m.rotation.y = t * 1.4 + i;
      });
      // Exit ring pulse
      if (exitGroup.visible) {
        const s = 1 + Math.sin(t * 3.5) * 0.06;
        exitRing.scale.set(s, s, 1);
      }
      // Eye idle float + track the player
      eyeGroup.position.y = 13 + Math.sin(t * 0.5) * 0.6;
    }
    eyeGroup.lookAt(player.position.x, player.position.y, player.position.z);

    // Camera: elevated follow with gentle sway (disabled in reduced motion)
    const sway = reducedMotion ? 0 : Math.sin(t * 0.25) * 1.2;
    camera.position.set(
      camTarget.x + sway,
      camHeight,
      camTarget.z + camDist * 0.62 + lookOffset.z
    );
    camera.lookAt(camTarget.x, 0, camTarget.z + 1.5);
  }

  function render() {
    if (disposed) return;
    raf = requestAnimationFrame(render);
    update();
    composer.render();
  }
  render();

  function resize() {
    const w = container.clientWidth;
    const h = Math.max(1, container.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  function dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mm) => {
          if (mm.map) mm.map.dispose();
          mm.dispose();
        });
      }
    });
    composer.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  }

  return { sync, resize, dispose, cellToWorld: (x, y) => cellToWorld(x, y, size) };
}
