// lib/luge/sled-cgi.js
// Procedural CGI bobsleds — the luge sleds ARE the bobsleds (there is no
// separate bobsled program). The authoritative designs live in the
// original Luge-Refuge repo (src/bobsleds/*.py): each sled is a pygame
// livery — a hull base colour plus signature motifs (Neon Phantom's
// phantom-white hull + neon-pink eyes, Street Samurai's blade-silver
// hull + red runes). The local hull-*.webp files are wraps of those
// liveries. This module gives every sled the full CGI treatment in the
// same pass as the track:
//
//   - a real procedural 3D hull (makeSledHullGeometry): an extruded,
//     bevelled side profile — tapered nose, flat belly, kicked tail,
//     crowned cockpit deck — ~3 wide x ~1 tall x 6 long, the same
//     footprint as the old flat box, so the rider mount, the tube and
//     every collision number are untouched;
//   - a seeded procedural livery texture (makeSledLiveryTexture):
//     the sled's own base colour + accent from lib/luge_data.js, with
//     its OG motif drawn on in canvas (eyes, runes, vortex, lightning,
//     scales, wings, crown, ... — sledMotifFor maps name -> motif);
//   - the existing hull-*.webp stays as the cockpit deck inlay where
//     it fits (the page keeps loading it), so the OG wraps are not
//     thrown away — the procedural livery carries the sides, the webp
//     carries the deck.
//
// Same CGI method as the Earth 4 v2 pass: seeded PRNG + procedural
// CanvasTexture, procedural geometry, alive motion (the page drives
// vibration + lean on the run). NO Tripo, NO paid assets. Sled physics
// and stats are untouched: sandResist tiers, boostGain, and the client
// clamp (same top speed for every sled) all live in lib/luge_data.js
// and lib/luge/track.js exactly as before.
import * as THREE from 'three';
import { seededRandom } from './track.js';

/** Hull footprint the procedural geometry must match (the old box). */
export const SLED_HULL_DIMS = { width: 3, height: 1.1, length: 6 };

/**
 * OG-motif lookup, priority-ordered by name. Pure — headless-testable.
 * The first matching rule wins ('Chrono Phantom' echoes before it eyes).
 */
export const MOTIF_RULES = [
  [/chrono/i, 'echoes'],
  [/phantom/i, 'eyes'],
  [/samurai/i, 'runes'],
  [/apex/i, 'runes'],
  [/marauder|vortex/i, 'vortex'],
  [/zeus/i, 'lightning'],
  [/leviathan/i, 'scales'],
  [/hermes/i, 'wings'],
  [/odin/i, 'eye'],
  [/abyss/i, 'tentacles'],
  [/stellar/i, 'stars'],
  [/quantum/i, 'hexagons'],
  [/neural/i, 'nodes'],
  [/entropy/i, 'swirls'],
  [/mech|titan/i, 'plates'],
  [/glider|urban/i, 'fins'],
  [/grid|runner/i, 'circuit'],
  [/hacker/i, 'glyphs'],
  [/fury|plasma/i, 'flames'],
  [/whisper|void/i, 'wisps'],
  [/overlord/i, 'laser'],
  [/mirage/i, 'mirage'],
  [/predator|bio/i, 'tendrils'],
  [/warlord|ares/i, 'chevrons'],
  [/nightmare/i, 'glitch'],
  [/eternal|olympus|emperor|sovereign/i, 'crown'],
  [/drifter/i, 'patches'],
  [/standard/i, 'stripes'],
];

export function sledMotifFor(sled) {
  const name = (sled && sled.name) || '';
  for (const [re, motif] of MOTIF_RULES) {
    if (re.test(name)) return motif;
  }
  return 'stripes';
}

/** Small string hash -> uint32 seed, so a sled id seeds its own livery. */
export function sledSeed(sled) {
  const s = String((sled && sled.id) || 'g1');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// --- motif painters: each draws its OG signature in accent on the hull ---
function paintMotif(g, motif, accent, rand, W, H) {
  const cx = W * 0.68;
  const cy = H * 0.5;
  g.save();
  switch (motif) {
    case 'eyes': {
      // Neon Phantom: two slanted glowing eye slits (neon pink).
      g.fillStyle = '#ff2ea6';
      g.shadowColor = '#ff2ea6';
      g.shadowBlur = 18;
      for (const dx of [-52, 52]) {
        g.beginPath();
        g.moveTo(cx + dx - 42, cy - 14);
        g.lineTo(cx + dx + 42, cy - 26);
        g.lineTo(cx + dx + 42, cy + 6);
        g.lineTo(cx + dx - 42, cy + 18);
        g.closePath();
        g.fill();
      }
      break;
    }
    case 'runes': {
      // Street Samurai: crimson rune strokes + green blade edge.
      g.strokeStyle = '#e10600';
      g.lineWidth = 8;
      g.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        const x = cx + i * 62;
        g.beginPath();
        g.moveTo(x, cy - 52); g.lineTo(x, cy + 52);
        g.moveTo(x, cy - 28); g.lineTo(x + 34, cy); g.lineTo(x, cy + 28);
        g.moveTo(x, cy - 28); g.lineTo(x - 34, cy); g.lineTo(x, cy + 28);
        g.stroke();
      }
      g.strokeStyle = '#00ff66';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(0, H - 14); g.lineTo(W, H - 14); g.stroke();
      break;
    }
    case 'vortex': {
      g.strokeStyle = accent;
      g.shadowColor = accent;
      g.shadowBlur = 12;
      for (let r = 14; r <= 84; r += 14) {
        g.lineWidth = 5;
        g.beginPath();
        g.arc(cx, cy, r, r * 0.11, r * 0.11 + Math.PI * 1.35);
        g.stroke();
      }
      g.fillStyle = accent;
      g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'lightning': {
      g.fillStyle = accent;
      g.shadowColor = accent;
      g.shadowBlur = 14;
      for (const dx of [-70, 10, 80]) {
        g.beginPath();
        const x = cx + dx;
        g.moveTo(x, cy - 70); g.lineTo(x + 26, cy - 70); g.lineTo(x + 4, cy - 2);
        g.lineTo(x + 30, cy - 2); g.lineTo(x - 12, cy + 70); g.lineTo(x + 8, cy + 70);
        g.lineTo(x - 8, cy + 12); g.lineTo(x - 30, cy + 12);
        g.closePath(); g.fill();
      }
      break;
    }
    case 'scales': {
      g.strokeStyle = accent;
      g.lineWidth = 4;
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 7; col++) {
          const x = cx - 110 + col * 36 + (row % 2 ? 18 : 0);
          const y = cy - 60 + row * 40;
          g.beginPath(); g.arc(x, y, 17, 0, Math.PI); g.stroke();
        }
      }
      break;
    }
    case 'wings': {
      g.strokeStyle = accent;
      g.lineWidth = 5;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(cx - 110, cy - 40 + i * 26);
        g.quadraticCurveTo(cx, cy - 66 + i * 26, cx + 110, cy - 30 + i * 26);
        g.stroke();
      }
      break;
    }
    case 'eye': {
      g.strokeStyle = accent;
      g.lineWidth = 6;
      g.beginPath(); g.ellipse(cx, cy, 74, 34, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = accent;
      g.beginPath(); g.arc(cx, cy, 16, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(cx - 5, cy - 5, 5, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'tentacles': {
      g.strokeStyle = accent;
      g.lineWidth = 7;
      g.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const x = cx - 100 + i * 50;
        g.beginPath();
        g.moveTo(x, cy + 70);
        g.bezierCurveTo(x - 26, cy + 10, x + 26, cy - 30, x, cy - 70);
        g.stroke();
      }
      break;
    }
    case 'stars': {
      for (let i = 0; i < 26; i++) {
        const x = cx - 120 + rand() * 240;
        const y = cy - 80 + rand() * 160;
        const r = 2 + rand() * 5;
        g.fillStyle = i % 3 === 0 ? '#ffffff' : accent;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    case 'hexagons': {
      g.strokeStyle = accent;
      g.lineWidth = 3;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 5; col++) {
          const x = cx - 100 + col * 52 + (row % 2 ? 26 : 0);
          const y = cy - 52 + row * 46;
          g.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (Math.PI / 3) * k;
            const px = x + Math.cos(a) * 24;
            const py = y + Math.sin(a) * 24;
            if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
          }
          g.closePath(); g.stroke();
        }
      }
      break;
    }
    case 'nodes': {
      const pts = [];
      for (let i = 0; i < 12; i++) pts.push([cx - 120 + rand() * 240, cy - 70 + rand() * 140]);
      g.strokeStyle = accent;
      g.lineWidth = 2;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i][0] - pts[j][0];
          const dy = pts[i][1] - pts[j][1];
          if (dx * dx + dy * dy < 90 * 90) {
            g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[j][0], pts[j][1]); g.stroke();
          }
        }
      }
      g.fillStyle = '#ffffff';
      for (const [x, y] of pts) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'swirls': {
      g.strokeStyle = accent;
      g.lineWidth = 5;
      for (let i = 0; i < 5; i++) {
        const x = cx - 100 + i * 50;
        g.beginPath(); g.arc(x, cy, 18 + i * 4, i, i + Math.PI * 1.5); g.stroke();
      }
      break;
    }
    case 'plates': {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = 0; i < 4; i++) {
        g.fillRect(cx - 120 + i * 62, cy - 56, 54, 112);
        g.strokeStyle = accent;
        g.lineWidth = 3;
        g.strokeRect(cx - 120 + i * 62, cy - 56, 54, 112);
      }
      break;
    }
    case 'fins': {
      g.fillStyle = accent;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        const x = cx - 110 + i * 58;
        g.moveTo(x, cy + 60); g.lineTo(x + 44, cy - 60); g.lineTo(x + 58, cy + 60);
        g.closePath(); g.fill();
      }
      break;
    }
    case 'circuit': {
      g.strokeStyle = accent;
      g.lineWidth = 3;
      for (let y = cy - 60; y <= cy + 60; y += 40) {
        g.beginPath(); g.moveTo(cx - 120, y); g.lineTo(cx + 120, y); g.stroke();
      }
      for (let x = cx - 120; x <= cx + 120; x += 60) {
        g.beginPath(); g.moveTo(x, cy - 60); g.lineTo(x, cy + 60); g.stroke();
      }
      g.fillStyle = '#ffffff';
      for (let y = cy - 60; y <= cy + 60; y += 40) {
        for (let x = cx - 120; x <= cx + 120; x += 60) {
          g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
        }
      }
      break;
    }
    case 'glyphs': {
      g.fillStyle = accent;
      g.font = 'bold 26px monospace';
      const glyphs = ['01', '10', '##', '><', '++', '::'];
      for (let i = 0; i < 6; i++) g.fillText(glyphs[i % glyphs.length], cx - 120 + i * 44, cy - 30 + (i % 2) * 70);
      break;
    }
    case 'flames': {
      g.fillStyle = '#ff6a00';
      g.shadowColor = '#ff4500';
      g.shadowBlur = 14;
      for (let i = 0; i < 4; i++) {
        const x = cx - 96 + i * 64;
        g.beginPath();
        g.moveTo(x, cy + 60);
        g.quadraticCurveTo(x - 26, cy, x, cy - 66);
        g.quadraticCurveTo(x + 26, cy, x, cy + 60);
        g.fill();
      }
      break;
    }
    case 'wisps': {
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = 4;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(cx - 120, cy - 40 + i * 28);
        g.bezierCurveTo(cx - 40, cy - 70 + i * 28, cx + 40, cy - 10 + i * 28, cx + 120, cy - 40 + i * 28);
        g.stroke();
      }
      break;
    }
    case 'laser': {
      g.fillStyle = accent;
      g.shadowColor = accent;
      g.shadowBlur = 16;
      g.fillRect(cx - 130, cy - 8, 260, 10);
      g.fillRect(cx - 90, cy + 26, 180, 5);
      break;
    }
    case 'mirage': {
      for (let i = 0; i < 6; i++) {
        g.fillStyle = i % 2 === 0 ? accent : 'rgba(255,255,255,0.7)';
        g.globalAlpha = 0.55;
        g.fillRect(cx - 120, cy - 66 + i * 24, 240, 12);
      }
      g.globalAlpha = 1;
      break;
    }
    case 'tendrils': {
      g.strokeStyle = '#39d353';
      g.lineWidth = 5;
      g.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const x = cx - 100 + i * 50;
        g.beginPath();
        g.moveTo(x, cy + 66);
        g.quadraticCurveTo(x + (i % 2 ? 34 : -34), cy, x, cy - 62);
        g.stroke();
      }
      break;
    }
    case 'chevrons': {
      g.fillStyle = accent;
      for (let i = 0; i < 3; i++) {
        const x = cx - 110 + i * 84;
        g.beginPath();
        g.moveTo(x, cy - 56); g.lineTo(x + 56, cy); g.lineTo(x, cy + 56);
        g.lineTo(x + 26, cy + 56); g.lineTo(x + 82, cy); g.lineTo(x + 26, cy - 56);
        g.closePath(); g.fill();
      }
      break;
    }
    case 'glitch': {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 === 0 ? accent : '#ffffff';
        g.globalAlpha = 0.8;
        g.fillRect(cx - 120 + rand() * 200, cy - 70 + rand() * 130, 20 + rand() * 40, 6 + rand() * 10);
      }
      g.globalAlpha = 1;
      break;
    }
    case 'crown': {
      g.fillStyle = '#ffd700';
      g.shadowColor = '#ffd700';
      g.shadowBlur = 14;
      g.beginPath();
      g.moveTo(cx - 90, cy + 50); g.lineTo(cx - 90, cy - 20); g.lineTo(cx - 45, cy + 10);
      g.lineTo(cx, cy - 56); g.lineTo(cx + 45, cy + 10); g.lineTo(cx + 90, cy - 20);
      g.lineTo(cx + 90, cy + 50);
      g.closePath(); g.fill();
      break;
    }
    case 'patches': {
      g.fillStyle = 'rgba(0,0,0,0.4)';
      for (let i = 0; i < 5; i++) {
        g.fillRect(cx - 120 + rand() * 200, cy - 60 + rand() * 100, 30 + rand() * 40, 18 + rand() * 26);
      }
      g.strokeStyle = accent;
      g.lineWidth = 3;
      g.strokeRect(cx - 120, cy - 60, 240, 120);
      break;
    }
    case 'echoes': {
      g.strokeStyle = accent;
      g.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        g.globalAlpha = 1 - i * 0.3;
        g.beginPath(); g.arc(cx + i * 26, cy, 52 - i * 10, 0, Math.PI * 2); g.stroke();
      }
      g.globalAlpha = 1;
      break;
    }
    default: {
      // stripes: diagonal accent speed stripes.
      g.fillStyle = accent;
      for (let i = 0; i < 4; i++) {
        g.save();
        g.translate(cx - 110 + i * 62, cy);
        g.rotate(-0.5);
        g.fillRect(-8, -62, 16, 124);
        g.restore();
      }
      break;
    }
  }
  g.restore();
}

/**
 * Seeded procedural livery for one sled: base colour + accent from
 * lib/luge_data.js, shading, panel lines, rivets, and the sled's OG
 * motif. Returns a THREE.CanvasTexture, or null headlessly (no document)
 * — the page falls back to the flat sled colour then.
 */
export function makeSledLiveryTexture(sled) {
  const canvas = makeCanvas(512, 256);
  if (!canvas) return null;
  const g = canvas.getContext('2d');
  const W = 512;
  const H = 256;
  const base = (sled && sled.color) || '#a9a9a9';
  const accent = (sled && sled.accent) || '#00ffff';
  const rand = seededRandom(sledSeed(sled));
  const motif = sledMotifFor(sled);

  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  // Top light / bottom shade so the hull reads rounded, not flat.
  const shade = g.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(255,255,255,0.28)');
  shade.addColorStop(0.45, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.38)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  // Seeded carbon speckle.
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(0,0,0,${0.05 + rand() * 0.12})`;
    g.fillRect(rand() * W, rand() * H, 2, 2);
  }
  // Accent centre stripe + pinstripe.
  g.fillStyle = accent;
  g.globalAlpha = 0.9;
  g.fillRect(0, H * 0.42, W, 22);
  g.globalAlpha = 1;
  g.fillStyle = '#ffffff';
  g.fillRect(0, H * 0.42 - 3, W, 2);
  g.fillRect(0, H * 0.42 + 24, W, 2);
  // Panel lines + rivets.
  g.strokeStyle = 'rgba(0,0,0,0.3)';
  g.lineWidth = 2;
  for (let x = 64; x < W; x += 64) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.5)';
  for (let x = 16; x < W; x += 32) {
    g.beginPath(); g.arc(x, 10, 2.5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x, H - 10, 2.5, 0, Math.PI * 2); g.fill();
  }
  // The OG motif, centre-right where the hull side shows it.
  paintMotif(g, motif, accent, rand, W, H);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Procedural 3D hull: an extruded, bevelled side profile — tapered
 * nose, flat belly, kicked tail, crowned cockpit deck. Same footprint
 * as the old 3 x 1 x 6 box (bounding box checked in tests), centred on
 * the sled group origin, nose toward local -Z (the travel direction).
 * UVs are normalised to 0..1 across the profile so the livery texture
 * wraps the hull once, motif and all.
 */
export function makeSledHullGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-3.0, 0.15);
  s.quadraticCurveTo(-2.2, 0.05, -1.0, 0.02);
  s.lineTo(2.4, 0.0);
  s.lineTo(3.0, 0.25);
  s.lineTo(3.0, 0.62);
  s.lineTo(1.6, 0.78);
  s.quadraticCurveTo(0.2, 0.92, -1.2, 0.88);
  s.quadraticCurveTo(-2.4, 0.8, -3.0, 0.45);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 2.76,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.12,
    bevelSegments: 2,
  });
  // Extrusion runs along +Z (the width); rotate so width is X and the
  // nose (shape x = -3) points at local -Z, the travel direction.
  geo.rotateY(-Math.PI / 2);
  geo.translate(1.38, -0.55, 0);
  // Normalise UVs (extrude UVs are raw shape coords) to 0..1 — the bevel
  // extends a hair past the profile, so clamp as well as scale.
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      THREE.MathUtils.clamp((uv.getX(i) + 3) / 6, 0, 1),
      THREE.MathUtils.clamp(uv.getY(i) / 1.2, 0, 1)
    );
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}
