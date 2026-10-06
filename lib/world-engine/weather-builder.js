// World Engine — procedural weather systems for the Weather Studio forge.
// Each weatherType gets its own particle behavior, palette, and atmosphere:
// clear (dust motes, warm light), rain (fast streaks), snow (slow drifting
// flakes), fog (billowing mist sprites), storm (rain + lightning flicker),
// ash (glowing embers drifting on the wind).
//
// buildWeatherSystem(THREE, params) returns a THREE.Group with
// group.userData.update(dt, elapsed) for the per-frame animation and
// group.userData.skyColor for the scene background.

function makePoints(THREE, count, color, size, opacity) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 12;
    positions[i * 3 + 1] = Math.random() * 7 - 2;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 12;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color, size, transparent: true, opacity,
    depthWrite: false,
  });
  return new THREE.Points(geometry, material);
}

function softCircleTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

const WEATHER_TYPES = ['clear', 'rain', 'snow', 'fog', 'storm', 'ash'];

export function buildWeatherSystem(THREE, params = {}) {
  const p = params || {};
  const type = WEATHER_TYPES.includes(p.weatherType) ? p.weatherType : 'rain';
  const intensity = Math.min(1, Math.max(0, Number(p.precipitationIntensity) || 0));
  const wind = Number(p.windSpeed) || 0;
  const windDrift = wind * 0.02;

  const group = new THREE.Group();
  const updaters = [];
  let skyColor = 0x05070f;

  const recycle = (positions, count, top = 5, bottom = -2) => {
    for (let i = 0; i < count; i++) {
      if (positions[i * 3 + 1] < bottom) {
        positions[i * 3 + 1] = top + Math.random() * 2;
        positions[i * 3] = (Math.random() - 0.5) * 12;
      }
    }
  };

  if (type === 'clear') {
    skyColor = 0x0a1830;
    const motes = makePoints(THREE, 120, 0xffe6b0, 0.06, 0.5);
    group.add(motes);
    const pos = motes.geometry.attributes.position.array;
    updaters.push((dt, t) => {
      for (let i = 0; i < pos.length; i += 3) {
        pos[i] += Math.sin(t * 0.6 + i) * 0.15 * dt + windDrift * dt;
        pos[i + 1] += Math.cos(t * 0.4 + i * 0.7) * 0.1 * dt;
      }
      motes.geometry.attributes.position.needsUpdate = true;
    });
    const sun = new THREE.PointLight(0xffd9a0, 60, 30);
    sun.position.set(3, 5, 2);
    group.add(sun);
  } else if (type === 'rain') {
    skyColor = 0x0a1018;
    const count = Math.floor(400 + intensity * 1400);
    const drops = makePoints(THREE, count, 0x7fa8c9, 0.05, 0.75);
    group.add(drops);
    const pos = drops.geometry.attributes.position.array;
    const fall = 6 + intensity * 6;
    updaters.push((dt) => {
      for (let i = 0; i < pos.length; i += 3) {
        pos[i + 1] -= fall * dt;
        pos[i] += windDrift * dt * 2;
      }
      recycle(pos, count);
      drops.geometry.attributes.position.needsUpdate = true;
    });
  } else if (type === 'snow') {
    skyColor = 0x10141c;
    const count = Math.floor(300 + intensity * 1000);
    const flakes = makePoints(THREE, count, 0xffffff, 0.09, 0.9);
    group.add(flakes);
    const pos = flakes.geometry.attributes.position.array;
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) seeds[i] = Math.random() * Math.PI * 2;
    updaters.push((dt, t) => {
      for (let i = 0; i < count; i++) {
        pos[i * 3 + 1] -= (0.9 + intensity * 0.8) * dt;
        pos[i * 3] += (Math.sin(t * 1.4 + seeds[i]) * 0.5 + windDrift) * dt;
      }
      recycle(pos, count);
      flakes.geometry.attributes.position.needsUpdate = true;
    });
  } else if (type === 'fog') {
    skyColor = 0x14171c;
    const tex = softCircleTexture(THREE);
    const count = 26 + Math.floor(intensity * 30);
    const sprites = [];
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex, color: 0x9aa4b0, transparent: true,
        opacity: 0.10 + Math.random() * 0.10, depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      const sc = 3 + Math.random() * 4;
      s.scale.set(sc, sc, 1);
      s.position.set((Math.random() - 0.5) * 12, Math.random() * 4 - 1, (Math.random() - 0.5) * 8);
      s.userData.speed = 0.2 + Math.random() * 0.5 + windDrift;
      group.add(s);
      sprites.push(s);
    }
    updaters.push((dt) => {
      for (const s of sprites) {
        s.position.x += s.userData.speed * dt;
        if (s.position.x > 7) s.position.x = -7;
      }
    });
  } else if (type === 'storm') {
    skyColor = 0x070a12;
    const count = Math.floor(600 + intensity * 1200);
    const drops = makePoints(THREE, count, 0x6f87a0, 0.06, 0.8);
    group.add(drops);
    const pos = drops.geometry.attributes.position.array;
    const bolt = new THREE.PointLight(0xcfe4ff, 0, 40);
    bolt.position.set(0, 6, 0);
    group.add(bolt);
    let flash = 0;
    let nextStrike = 1 + Math.random() * 3;
    updaters.push((dt, t) => {
      for (let i = 0; i < pos.length; i += 3) {
        pos[i + 1] -= (8 + intensity * 6) * dt;
        pos[i] += windDrift * dt * 3;
      }
      recycle(pos, count);
      drops.geometry.attributes.position.needsUpdate = true;
      // Lightning: random strikes, double-flicker decay.
      nextStrike -= dt;
      if (nextStrike <= 0) {
        flash = 120 + Math.random() * 80;
        nextStrike = 1.5 + Math.random() * 4;
      }
      if (flash > 0) {
        bolt.intensity = flash * (0.6 + 0.4 * Math.sin(t * 90));
        flash -= dt * 400;
      } else {
        bolt.intensity = 0;
      }
    });
  } else if (type === 'ash') {
    skyColor = 0x140d08;
    const count = Math.floor(300 + intensity * 800);
    const embers = makePoints(THREE, count, 0xd97b3f, 0.07, 0.85);
    group.add(embers);
    const pos = embers.geometry.attributes.position.array;
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) seeds[i] = Math.random() * Math.PI * 2;
    updaters.push((dt, t) => {
      for (let i = 0; i < count; i++) {
        pos[i * 3 + 1] -= (0.7 + intensity * 0.7) * dt;
        pos[i * 3] += (Math.sin(t * 0.9 + seeds[i]) * 0.8 + windDrift * 1.5) * dt;
      }
      recycle(pos, count);
      embers.geometry.attributes.position.needsUpdate = true;
    });
    const glow = new THREE.PointLight(0xff7b2f, 25, 25);
    glow.position.set(0, 1, 0);
    group.add(glow);
  }

  group.userData.update = (dt, t) => { for (const u of updaters) u(dt, t); };
  group.userData.skyColor = skyColor;
  group.userData.weatherType = type;
  return group;
}

export { WEATHER_TYPES };
