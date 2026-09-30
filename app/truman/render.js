/*
 * TRUMAN — hand-rolled canvas 2.5D renderer.
 *
 * No external 3D libraries in this module
 * (the master app has none of those deps and the source shipped them
 * via CDN — stripped). Everything below is plain Canvas2D: an angled
 * orthographic projection, painter-sorted prisms, glow accents.
 *
 * Lighting rule: bloom/flash stays LOCAL. Storm lightning renders as a
 * small radial burst plus a faint screen tint — never a full washout.
 */

import { BLOCK_SIZE } from './world.js';

const AXIOM_COLORS = ['#ff003c', '#00f2ff', '#aa00ff', '#ffffff'];

function lerp(a, b, t) { return a + (b - a) * t; }
function hexLerp(h1, h2, t) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = p(h1), b = p(h2);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}

/* Angled orthographic projection: world (x,y,z) -> screen */
export function project(x, y, z, cam) {
  const dx = x - cam.x, dz = z - cam.z;
  const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
  const rx = dx * c - dz * s;
  const rz = dx * s + dz * c;
  return {
    x: cam.cx + rx * 0.866 * cam.zoom,
    y: cam.cy + rz * 0.5 * cam.zoom - y * cam.zoom,
    depth: rx + rz,
  };
}

function drawPrism(ctx, x, y, z, w, h, d, cam, topColor, leftColor, rightColor, edge) {
  const p000 = project(x - w / 2, y, z - d / 2, cam);
  const p100 = project(x + w / 2, y, z - d / 2, cam);
  const p110 = project(x + w / 2, y, z + d / 2, cam);
  const p010 = project(x - w / 2, y, z + d / 2, cam);
  const p001 = project(x - w / 2, y + h, z - d / 2, cam);
  const p101 = project(x + w / 2, y + h, z - d / 2, cam);
  const p111 = project(x + w / 2, y + h, z + d / 2, cam);
  const p011 = project(x - w / 2, y + h, z + d / 2, cam);
  const poly = (pts, fill) => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.stroke(); }
  };
  poly([p010, p110, p111, p011], leftColor);   // left face
  poly([p110, p100, p101, p111], rightColor);  // right face
  poly([p001, p101, p111, p011], topColor);    // roof
}

function drawGridFloor(ctx, W, H, cam, storm, dayBright) {
  // Sky
  const night = '#030507', day = '#0a1322';
  let sky = hexLerp(night, day, dayBright);
  if (storm) sky = hexLerp(sky, '#2a0a12', 0.55);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, sky);
  g.addColorStop(0.7, storm ? '#160408' : '#05070a');
  g.addColorStop(1, '#020304');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // Ground plane corners in world space
  const R = 950;
  const c = [project(-R, 0, -R, cam), project(R, 0, -R, cam), project(R, 0, R, cam), project(-R, 0, R, cam)];
  ctx.beginPath();
  ctx.moveTo(c[0].x, c[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(c[i].x, c[i].y);
  ctx.closePath();
  ctx.fillStyle = storm ? '#0c0507' : '#05070a';
  ctx.fill();

  // Cyan grid lines every block (source: grid floor with cyan strokes)
  ctx.strokeStyle = storm ? 'rgba(255,0,68,0.28)' : 'rgba(0,242,255,0.22)';
  ctx.lineWidth = 1;
  for (let i = -R; i <= R; i += BLOCK_SIZE) {
    let a = project(i, 0, -R, cam), b = project(i, 0, R, cam);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    a = project(-R, 0, i, cam); b = project(R, 0, i, cam);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // City edge marker
  ctx.strokeStyle = storm ? 'rgba(255,0,68,0.5)' : 'rgba(0,242,255,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(c[0].x, c[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(c[i].x, c[i].y);
  ctx.closePath(); ctx.stroke();
}

/* Procedural stylized figure for Henry (the 9.3MB henry.glb is not shipped). */
export function drawFigure(ctx, x, y, z, cam, opts = {}) {
  const { color = '#00f2ff', scale = 1, bob = 0, walking = false } = opts;
  const p = project(x, y, z, cam);
  const s = cam.zoom * scale;
  const legSwing = walking ? Math.sin(bob * 10) * 3 * s : 0;
  const bobY = Math.sin(bob * 4) * 1.5 * s;
  ctx.save();
  ctx.translate(p.x, p.y - bobY);
  ctx.shadowColor = color; ctx.shadowBlur = 14 * s;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.4 * s; ctx.lineCap = 'round';
  // legs
  ctx.beginPath();
  ctx.moveTo(0, -7 * s); ctx.lineTo(-2.5 * s + legSwing, 0);
  ctx.moveTo(0, -7 * s); ctx.lineTo(2.5 * s - legSwing, 0);
  // torso
  ctx.moveTo(0, -7 * s); ctx.lineTo(0, -15 * s);
  // arms
  ctx.moveTo(0, -13 * s); ctx.lineTo(-4.5 * s - legSwing * 0.6, -8 * s);
  ctx.moveTo(0, -13 * s); ctx.lineTo(4.5 * s + legSwing * 0.6, -8 * s);
  ctx.stroke();
  // head
  ctx.beginPath(); ctx.arc(0, -18.5 * s, 3.2 * s, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* Neon billboard panel, pre-rendered per ad for speed. */
function makeAdSprite(ad) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const c = cv.getContext('2d');
  const hue = ad.hue;
  c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillRect(0, 0, 512, 256);
  c.strokeStyle = `hsla(${hue},100%,60%,0.9)`; c.lineWidth = 6;
  c.strokeRect(10, 10, 492, 236);
  c.fillStyle = `hsl(${hue},100%,65%)`;
  c.font = 'bold 52px system-ui, sans-serif';
  c.textAlign = 'center';
  c.fillText(ad.copy.title, 256, 105);
  c.font = '28px system-ui, sans-serif';
  c.fillStyle = `hsla(${hue},100%,80%,0.9)`;
  c.fillText(ad.copy.sub, 256, 165);
  // scanlines
  c.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < 256; y += 6) c.fillRect(0, y, 512, 3);
  return cv;
}

export function createRenderer() {
  let adSprites = null;
  return {
    draw(ctx, W, H, S) {
      const { cam, buildings, ads, trees, traffic, ash, henryCar, world, calm, t } = S;
      const storm = world.isStormActive;
      const hour = (world.simulatedMinutes % 1440) / 60;
      const dayBright = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
      if (!adSprites) adSprites = ads.map(makeAdSprite);

      // Camera shake (disabled in calm mode)
      const shx = !calm && S.shake > 0.3 ? (Math.random() - 0.5) * S.shake : 0;
      const shy = !calm && S.shake > 0.3 ? (Math.random() - 0.5) * S.shake : 0;
      const camS = { ...cam, cx: cam.cx + shx, cy: cam.cy + shy };

      drawGridFloor(ctx, W, H, camS, storm, dayBright);

      // Painter-sorted entities
      const ents = [];
      for (const b of buildings) ents.push({ k: 'b', d: b.x + b.z, b });
      for (const tr of trees) ents.push({ k: 't', d: tr.x + tr.z, tr });
      for (const car of traffic.cars) ents.push({ k: 'c', d: car.x + car.z, car });
      ents.sort((a, b) => a.d - b.d);

      for (const e of ents) {
        if (e.k === 'b') {
          const b = e.b;
          const base = storm ? '#1c0d12' : '#0d1622';
          drawPrism(ctx, b.x, 0, b.z, b.w, b.h, b.w, camS,
            storm ? '#33202a' : '#1a2a3d', base, storm ? '#140a0e' : '#0a1220',
            storm ? 'rgba(255,0,68,0.25)' : 'rgba(0,242,255,0.18)');
          // window sparkle
          if (Math.abs(b.x - cam.x) < 700 && Math.abs(b.z - cam.z) < 700) {
            const p = project(b.x, b.h * 0.7, b.z, camS);
            ctx.fillStyle = storm ? 'rgba(255,0,68,0.5)' : 'rgba(0,242,255,0.35)';
            ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
          }
        } else if (e.k === 't') {
          const tr = e.tr;
          const sway = storm ? Math.sin(t * 5 + tr.x * 0.05) * 0.15 : Math.sin(t + tr.x * 0.05) * 0.02;
          const p = project(tr.x, 0, tr.z, camS);
          const s = camS.zoom * tr.s * 22;
          ctx.fillStyle = storm ? '#33101a' : '#0a2a18';
          ctx.beginPath();
          ctx.moveTo(p.x - s * 0.5 + sway * s, p.y);
          ctx.lineTo(p.x + s * 0.5 + sway * s, p.y);
          ctx.lineTo(p.x + sway * s * 1.5, p.y - s);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#1a100a';
          ctx.fillRect(p.x - s * 0.06, p.y - s * 0.25, s * 0.12, s * 0.25);
        } else {
          const car = e.car;
          const p = project(car.x, 0.6, car.z, camS);
          const col = car.cyan ? '#00f2ff' : '#ff00ff';
          const ang = (car.dir * Math.PI) / 2 + cam.yaw;
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(-ang * 0 + (car.dir === 0 || car.dir === 2 ? 0 : Math.PI / 2) * 0);
          // light trail
          ctx.strokeStyle = col; ctx.globalAlpha = 0.55; ctx.lineWidth = 2.5;
          ctx.shadowColor = col; ctx.shadowBlur = 10;
          const tx = car.dir === 0 ? 0 : car.dir === 1 ? -26 : car.dir === 2 ? 0 : 26;
          const ty = car.dir === 0 ? 26 : car.dir === 1 ? 0 : car.dir === 2 ? -26 : 0;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(tx * camS.zoom, ty * camS.zoom); ctx.stroke();
          ctx.globalAlpha = 1; ctx.shadowBlur = 0;
          // body
          const wdt = 3.4 * camS.zoom, len = 7.4 * camS.zoom;
          ctx.fillStyle = '#0b0b0d';
          if (car.dir === 0 || car.dir === 2) ctx.fillRect(-wdt / 2, -len / 2, wdt, len);
          else ctx.fillRect(-len / 2, -wdt / 2, len, wdt);
          ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.strokeRect(
            car.dir === 0 || car.dir === 2 ? -wdt / 2 : -len / 2,
            car.dir === 0 || car.dir === 2 ? -len / 2 : -wdt / 2,
            car.dir === 0 || car.dir === 2 ? wdt : len,
            car.dir === 0 || car.dir === 2 ? len : wdt);
          ctx.restore();
        }
      }

      // Hologram ads (bob disabled in calm mode)
      ads.forEach((ad, i) => {
        const bobY = calm ? 0 : Math.sin(t * 2 + ad.phase) * 5;
        const p = project(ad.x, ad.y + bobY, ad.z, camS);
        if (p.x < -300 || p.x > W + 300 || p.y < -300 || p.y > H + 300) return;
        const w = 150 * camS.zoom, h = 75 * camS.zoom;
        ctx.save();
        ctx.globalAlpha = 0.88;
        ctx.shadowColor = `hsl(${ad.hue},100%,60%)`; ctx.shadowBlur = calm ? 0 : 22;
        ctx.drawImage(adSprites[i], p.x - w / 2, p.y - h / 2, w, h);
        ctx.restore();
        // flicker scanline accent
        if (!calm && Math.random() > 0.96) {
          ctx.fillStyle = `hsla(${ad.hue},100%,70%,0.25)`;
          ctx.fillRect(p.x - w / 2, p.y - h / 2 + Math.random() * h, w, 3);
        }
      });

      // Henry's apartment platform floating above the city (source: y=200)
      {
        const ap = project(0, 200, 0, camS);
        const pw = 46 * camS.zoom, ph = 46 * camS.zoom;
        ctx.save();
        ctx.strokeStyle = storm ? 'rgba(255,0,68,0.7)' : 'rgba(0,242,255,0.55)';
        ctx.lineWidth = 2; ctx.shadowColor = storm ? '#ff003c' : '#00f2ff'; ctx.shadowBlur = calm ? 0 : 16;
        ctx.strokeRect(ap.x - pw / 2, ap.y - ph / 2, pw, ph);
        ctx.fillStyle = 'rgba(0,20,30,0.55)';
        ctx.fillRect(ap.x - pw / 2, ap.y - ph / 2, pw, ph);
        ctx.shadowBlur = 0;
        ctx.fillStyle = storm ? '#ff003c' : '#00f2ff';
        ctx.font = `${Math.max(10, 11 * camS.zoom)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText("HENRY'S APARTMENT", ap.x, ap.y - ph / 2 - 8);
        ctx.restore();
        // Henry standing at his desk
        drawFigure(ctx, 10, 200, -12, camS, { color: S.henryColor, scale: 1.8, bob: t });
      }

      // Henry's car (black shell + headlights, source: henrycar.jsx)
      if (henryCar.visible) {
        const p = project(henryCar.x, 0.9, henryCar.z, camS);
        const wdt = 3.6 * camS.zoom, len = 8.4 * camS.zoom;
        ctx.save();
        ctx.fillStyle = '#050505';
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        if (henryCar.dir === 0 || henryCar.dir === 2) ctx.fillRect(p.x - wdt / 2, p.y - len / 2, wdt, len);
        else ctx.fillRect(p.x - len / 2, p.y - wdt / 2, len, wdt);
        // headlights
        ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = calm ? 0 : 12;
        const fz = henryCar.dir === 0 ? -len / 2 : henryCar.dir === 2 ? len / 2 : 0;
        const fx = henryCar.dir === 1 ? len / 2 : henryCar.dir === 3 ? -len / 2 : 0;
        ctx.beginPath(); ctx.arc(p.x + (henryCar.dir < 2 ? -1 : 1) * wdt * 0.28 + fx * 0.9, p.y + fz * 0.95, 2.2 * camS.zoom, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(p.x - (henryCar.dir < 2 ? -1 : 1) * wdt * 0.28 + fx * 0.9, p.y + fz * 0.95, 2.2 * camS.zoom, 0, 7); ctx.fill();
        ctx.restore();
      }

      // Storm ash particles
      for (const pt of ash.parts) {
        const p = project(pt.x, pt.y, pt.z, camS);
        if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) continue;
        ctx.fillStyle = storm ? 'rgba(255,0,68,0.7)' : 'rgba(0,242,255,0.28)';
        const sz = storm ? 2.4 : 1.4;
        ctx.fillRect(p.x, p.y, sz, sz);
      }

      // Lightning: LOCALIZED radial burst + faint tint (lighting rule honored)
      if (S.flash > 0.02 && !calm) {
        const fp = project(S.flashX, 120, S.flashZ, camS);
        const rg = ctx.createRadialGradient(fp.x, fp.y, 0, fp.x, fp.y, 220 * camS.zoom);
        rg.addColorStop(0, S.flashColor + 'cc');
        rg.addColorStop(1, S.flashColor + '00');
        ctx.fillStyle = rg;
        ctx.fillRect(fp.x - 240 * camS.zoom, fp.y - 240 * camS.zoom, 480 * camS.zoom, 480 * camS.zoom);
        ctx.fillStyle = S.flashColor + '14';
        ctx.fillRect(0, 0, W, H);
      }

      // Celestial hint synced to brain time (source: environment.jsx orbit sync)
      {
        const ang = world.globalTime * 0.1;
        const mx = cam.cx + Math.cos(ang) * W * 0.32, my = H * 0.12 + Math.sin(ang) * H * 0.05;
        ctx.save();
        ctx.globalAlpha = storm ? 0.25 : 0.85;
        ctx.fillStyle = storm ? '#ff003c' : (dayBright > 0.3 ? '#fff7d6' : '#dfe9ff');
        ctx.shadowColor = storm ? '#ff003c' : '#cfe0ff'; ctx.shadowBlur = calm ? 0 : 30;
        ctx.beginPath(); ctx.arc(mx, my, 26, 0, 7); ctx.fill();
        ctx.restore();
      }
    },
  };
}

export { AXIOM_COLORS };

/*
 * Apartment cutaway view.
 * Source (apartment.jsx): penthouse at y=200 — dark polished concrete floor,
 * glass walls overlooking the city, Merlin Ambros' workstation desk with a
 * glowing cyan laptop terminal, a dog bed, localized cyan/white lighting.
 * Henry stands at the desk (source: henry.jsx spawns at [10, 200, -12]).
 */
export function drawApartment(ctx, W, H, S) {
  const { t, calm, storm, henryColor } = S;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, storm ? '#1a060b' : '#04070c');
  g.addColorStop(1, '#010203');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const floorY = H * 0.78;
  // City lights through the glass wall
  ctx.save();
  for (let i = 0; i < 60; i++) {
    const x = (i * 97) % W, y = (i * 53) % (floorY - 40);
    ctx.fillStyle = `rgba(${storm ? '255,0,68' : '0,255,255'},${0.08 + (i % 5) * 0.03})`;
    ctx.fillRect(x, y, 3, 3 + (i % 7) * 3);
  }
  ctx.restore();
  // Glass wall sheen
  ctx.fillStyle = 'rgba(0,180,255,0.05)';
  ctx.fillRect(0, 0, W, floorY);
  ctx.strokeStyle = 'rgba(0,242,255,0.25)';
  ctx.beginPath(); ctx.moveTo(0, floorY); ctx.lineTo(W, floorY); ctx.stroke();

  // Floor — dark polished concrete
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, floorY, W, H - floorY);
  ctx.fillStyle = 'rgba(0,242,255,0.08)';
  ctx.fillRect(0, floorY, W, 2);

  const cx = W / 2;
  // Desk (workstation)
  ctx.fillStyle = '#121214';
  ctx.fillRect(cx - 130, floorY - 70, 260, 14);
  ctx.fillRect(cx - 120, floorY - 56, 10, 56);
  ctx.fillRect(cx + 110, floorY - 56, 10, 56);
  // Laptop — glowing cyan terminal
  ctx.save();
  ctx.shadowColor = '#00f2ff'; ctx.shadowBlur = calm ? 0 : 24;
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - 45, floorY - 108, 90, 42);
  ctx.strokeStyle = '#00f2ff'; ctx.lineWidth = 2;
  ctx.strokeRect(cx - 45, floorY - 108, 90, 42);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#00f2ff';
  ctx.font = '11px monospace'; ctx.textAlign = 'left';
  const lines = ['> vercel --prod', '> deploying…', '> matrix: SYNCED'];
  lines.forEach((l, i) => ctx.fillText(l, cx - 38, floorY - 92 + i * 13));
  ctx.restore();
  // Cyan desk lamp glow
  const lg = ctx.createRadialGradient(cx, floorY - 90, 0, cx, floorY - 90, 130);
  lg.addColorStop(0, 'rgba(0,242,255,0.14)'); lg.addColorStop(1, 'rgba(0,242,255,0)');
  ctx.fillStyle = lg; ctx.fillRect(cx - 130, floorY - 220, 260, 220);

  // Dog bed
  ctx.fillStyle = '#222222';
  ctx.beginPath(); ctx.ellipse(W * 0.16, floorY - 12, 52, 16, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#2e2e2e';
  ctx.beginPath(); ctx.ellipse(W * 0.16, floorY - 16, 44, 12, 0, 0, 7); ctx.fill();

  // Henry at the desk — procedural figure
  const hx = cx + 40, hy = floorY;
  const bobY = calm ? 0 : Math.sin(t * 4) * 2;
  ctx.save();
  ctx.translate(hx, hy - bobY);
  ctx.shadowColor = henryColor; ctx.shadowBlur = calm ? 0 : 16;
  ctx.strokeStyle = henryColor; ctx.fillStyle = henryColor;
  ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -34); ctx.lineTo(-11, 0); ctx.moveTo(0, -34); ctx.lineTo(11, 0);
  ctx.moveTo(0, -34); ctx.lineTo(0, -72);
  ctx.moveTo(0, -62); ctx.lineTo(-20, -44); ctx.moveTo(0, -62); ctx.lineTo(20, -50);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -86, 13, 0, 7); ctx.fill();
  ctx.restore();

  // Label
  ctx.fillStyle = storm ? '#ff003c' : '#00f2ff';
  ctx.font = '13px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText("HENRY'S APARTMENT — 200M ABOVE THE GRID", 18, 30);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('Workstation live · dog asleep · city humming below', 18, 52);
}
