/**
 * Vortex Engine — pure logic for the /vortex module.
 *
 * Replaces the original product's server-side pipeline (an AI blueprint API
 * plus a remote database table) with a fully local, deterministic "aura
 * synthesizer": a destination URL is hashed into a seeded PRNG, which selects
 * a vortex archetype and derives every flight parameter from it. No network,
 * no keys, no database — blueprints live in localStorage.
 *
 * This file is intentionally DOM-free and dependency-free so it can be
 * unit-tested headlessly with node --test.
 */

// ---------------------------------------------------------------------------
// Seeded PRNG + hashing (deterministic per URL, so share codes are stable)
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 seeded PRNG. Returns a function yielding [0, 1). */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a random float in [lo, hi) from a seeded rng. */
export function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

/** Pick one entry from an array using a seeded rng. */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

// ---------------------------------------------------------------------------
// Archetypes — the four structural "personalities" a vortex can take.
// ---------------------------------------------------------------------------

export const ARCHETYPES = [
  {
    id: 'singularity',
    name: 'Singularity',
    tagline: 'A tight, violent black-hole core. Nothing leaves.',
    palettes: [
      ['#7b2ff7', '#00e5ff', '#ffffff'],
      ['#4a00e0', '#8e2de2', '#e0ccff'],
      ['#0f0c29', '#6a5cff', '#00e5ff'],
    ],
    particleCount: [14000, 20000],
    rotationSpeed: [0.012, 0.03],
    waveFrequency: [0.004, 0.01],
    expansionAmplitude: [1.0, 2.6],
    flightDuration: [6.0, 9.0],
    particleSize: [0.05, 0.12],
  },
  {
    id: 'nebula',
    name: 'Nebula Drift',
    tagline: 'A slow, sprawling cosmic mist. Weightless and wide.',
    palettes: [
      ['#00ffaa', '#00f2ff', '#c8fff4'],
      ['#ff7edb', '#7b2ff7', '#ffe3f7'],
      ['#12c2e9', '#c471ed', '#f64f59'],
    ],
    particleCount: [9000, 14000],
    rotationSpeed: [0.003, 0.009],
    waveFrequency: [0.002, 0.006],
    expansionAmplitude: [3.0, 5.5],
    flightDuration: [8.0, 12.0],
    particleSize: [0.07, 0.16],
  },
  {
    id: 'glitch',
    name: 'Glitch Storm',
    tagline: 'A jagged, high-frequency digital fracture field.',
    palettes: [
      ['#ff0055', '#00ffaa', '#ffff00'],
      ['#ff2d95', '#00e5ff', '#ffffff'],
      ['#ccff00', '#ff00ff', '#00f2ff'],
    ],
    particleCount: [16000, 22000],
    rotationSpeed: [-0.03, -0.012],
    waveFrequency: [0.008, 0.016],
    expansionAmplitude: [2.0, 4.0],
    flightDuration: [5.0, 7.5],
    particleSize: [0.04, 0.09],
  },
  {
    id: 'supernova',
    name: 'Supernova Bloom',
    tagline: 'An expanding stellar detonation. Maximum radiance.',
    palettes: [
      ['#ffd700', '#ff8800', '#fffbbf'],
      ['#ff6a00', '#ffd700', '#ffffff'],
      ['#ff3300', '#ffaa00', '#ffeecc'],
    ],
    particleCount: [12000, 18000],
    rotationSpeed: [0.008, 0.018],
    waveFrequency: [0.003, 0.008],
    expansionAmplitude: [3.5, 6.5],
    flightDuration: [6.5, 10.0],
    particleSize: [0.08, 0.18],
  },
];

export function getArchetype(id) {
  return ARCHETYPES.find((a) => a.id === id) || null;
}

// ---------------------------------------------------------------------------
// Blueprint synthesis
// ---------------------------------------------------------------------------

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusables

/** Mint a 6-character share code from a seeded rng. */
export function mintCode(rng) {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  }
  return code;
}

/** Normalize a destination into an https URL string, or null if invalid. */
export function normalizeTargetUrl(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) s = 'https://' + s;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname.includes('.')) return null;
  return u.toString();
}

/**
 * Synthesize a full vortex blueprint for a destination URL.
 * Deterministic for (url, nonce): the same inputs always yield the same
 * blueprint, so share codes are stable and redeemable from the local vault.
 */
export function synthesizeBlueprint(targetUrl, nonce = 0) {
  const normalized = normalizeTargetUrl(targetUrl);
  if (!normalized) throw new Error('Invalid destination URL');
  const rng = seededRandom(hashString(normalized + '::' + nonce));
  const archetype = pick(rng, ARCHETYPES);
  const blueprint = {
    id: mintCode(rng),
    targetUrl: normalized,
    archetype: archetype.id,
    archetypeName: archetype.name,
    tagline: archetype.tagline,
    colorPalette: pick(rng, archetype.palettes),
    particleCount: Math.floor(range(rng, ...archetype.particleCount)),
    rotationSpeed: parseFloat(range(rng, ...archetype.rotationSpeed).toFixed(5)),
    waveFrequency: parseFloat(range(rng, ...archetype.waveFrequency).toFixed(5)),
    expansionAmplitude: parseFloat(range(rng, ...archetype.expansionAmplitude).toFixed(3)),
    flightDuration: parseFloat(range(rng, ...archetype.flightDuration).toFixed(1)),
    particleSize: parseFloat(range(rng, ...archetype.particleSize).toFixed(3)),
    depth: 1800,
    nonce,
  };
  return blueprint;
}

/** Build the human-readable synthesis log shown in the terminal stream. */
export function synthesisLog(blueprint) {
  const host = (() => {
    try {
      return new URL(blueprint.targetUrl).hostname;
    } catch {
      return blueprint.targetUrl;
    }
  })();
  return [
    '> initializing aura synthesis matrix ...',
    '> resolving target identity: ' + host,
    '> archetype resolved: ' + blueprint.archetypeName.toUpperCase(),
    '> ' + blueprint.tagline,
    '> palette locked: ' + blueprint.colorPalette.join('  '),
    '> particles: ' + blueprint.particleCount.toLocaleString('en-US'),
    '> swirl velocity: ' + blueprint.rotationSpeed + ' · wave freq: ' + blueprint.waveFrequency,
    '> expansion amplitude: ' + blueprint.expansionAmplitude,
    '> compiling standalone flight module ...',
    '> flight duration: ' + blueprint.flightDuration + 's',
    '> export sealed · share code: ' + blueprint.id,
  ];
}

// ---------------------------------------------------------------------------
// Standalone export compiler
// ---------------------------------------------------------------------------

/**
 * Self-contained canvas-2D vortex flight runtime. It is defined as a plain
 * function so the exporter can embed its exact source (via .toString()) into
 * generated HTML — the shipped code is always identical to the tested logic.
 *
 * BP fields: particleCount, rotationSpeed, waveFrequency, expansionAmplitude,
 * colorPalette, flightDuration, particleSize, depth, targetUrl, id,
 * archetypeName.
 */
export function runVortexFlight(BP) {
  var canvas = document.getElementById('vortex-canvas');
  var ctx = canvas.getContext('2d');
  var launchBtn = document.getElementById('launch-btn');
  var replayBtn = document.getElementById('replay-btn');
  var reduceMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  var DEPTH = BP.depth || 1800;
  var parts = [];
  var pal = BP.colorPalette;
  for (var i = 0; i < BP.particleCount; i++) {
    parts.push({ z: -Math.random() * DEPTH, phase: i * 0.003, c: pal[i % pal.length] });
  }
  var sparse = canvas.width < 700 ? 2 : 1; // lighter load on small screens

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function draw(camZ, el) {
    var w = canvas.width;
    var h = canvas.height;
    ctx.fillStyle = '#020306';
    ctx.fillRect(0, 0, w, h);
    var f = h * 0.9;
    var cx = w / 2;
    var cy = h / 2;
    var dir = BP.rotationSpeed < 0 ? -1 : 1;
    var swirlRate = 1.1 + Math.min(1.5, Math.abs(BP.rotationSpeed) * 40);
    for (var k = 0; k < parts.length; k += sparse) {
      var p = parts[k];
      var dz = p.z - camZ;
      if (dz <= 0.5) continue;
      var radius = 13 + Math.sin(el * 0.4 + p.z * BP.waveFrequency) * BP.expansionAmplitude;
      var th = p.phase + el * swirlRate * dir;
      var x = Math.cos(th) * radius;
      var y = Math.sin(th) * radius;
      var s = f / dz;
      var sx = cx + x * s;
      var sy = cy + y * s;
      if (sx < -60 || sx > w + 60 || sy < -60 || sy > h + 60) continue;
      var a = 1 - dz / DEPTH;
      if (a < 0) a = 0;
      if (a > 1) a = 1;
      ctx.globalAlpha = 0.2 + 0.8 * a;
      ctx.fillStyle = p.c;
      var r = BP.particleSize * s * 0.02;
      if (r < 0.5) r = 0.5;
      if (r > 9) r = 9;
      ctx.fillRect(sx - r / 2, sy - r / 2, r, r);
    }
    ctx.globalAlpha = 1;
  }

  var start = null;
  var raf = 0;

  function finish() {
    if (launchBtn) launchBtn.style.display = 'inline-block';
  }

  function frame(ts) {
    if (!start) start = ts;
    var el = (ts - start) / 1000;
    var t = el / BP.flightDuration;
    if (t > 1) t = 1;
    if (t >= 1) {
      finish();
      return;
    }
    var camZ = 50 + (-(DEPTH * 0.6) - 50) * easeInOut(t);
    draw(camZ, el);
    raf = requestAnimationFrame(frame);
  }

  function play() {
    if (launchBtn) launchBtn.style.display = 'none';
    start = null;
    cancelAnimationFrame(raf);
    if (reduceMotion) {
      draw(50, 1.2);
      finish();
    } else {
      raf = requestAnimationFrame(frame);
    }
  }

  if (replayBtn) replayBtn.addEventListener('click', play);
  if (launchBtn)
    launchBtn.addEventListener('click', function () {
      window.open(BP.targetUrl, '_blank', 'noopener');
    });

  play();
}

/** Escape a string for safe embedding inside a <script> JSON literal. */
export function escapeForScript(json) {
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

/**
 * Compile a fully self-contained HTML document for a blueprint.
 * Zero external requests: no CDNs, no fonts, no telemetry, no auto-loading
 * iframe. The destination opens only when the viewer clicks LAUNCH.
 */
export function compileStandaloneExport(blueprint) {
  const bpJson = escapeForScript(JSON.stringify(blueprint));
  const engineSrc = runVortexFlight.toString();
  const openScript = '<' + 'script' + '>';
  const closeScript = '<' + '/' + 'script' + '>';
  return (
    '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>Vortex ' +
    blueprint.id +
    ' · ' +
    blueprint.archetypeName +
    '</title>\n' +
    '<style>\n' +
    '  html,body{margin:0;padding:0;width:100%;height:100%;background:#020306;overflow:hidden;font-family:ui-monospace,Menlo,Consolas,monospace;}\n' +
    '  #vortex-canvas{position:fixed;top:0;left:0;display:block;}\n' +
    '  #hud{position:fixed;left:0;right:0;bottom:28px;display:flex;gap:12px;justify-content:center;z-index:5;}\n' +
    '  #hud button{display:none;padding:14px 34px;font:700 0.85rem ui-monospace,Menlo,Consolas,monospace;letter-spacing:3px;cursor:pointer;border-radius:999px;border:1px solid #00f2ff;background:rgba(2,6,8,0.8);color:#00f2ff;}\n' +
    '  #hud button:hover{background:#00f2ff;color:#001114;}\n' +
    '  #replay-btn{display:inline-block !important;border-color:#5a6b7d !important;color:#9fb2c5 !important;background:rgba(2,6,8,0.6) !important;}\n' +
    '  #tag{position:fixed;top:18px;left:0;right:0;text-align:center;color:#8fa3b8;font-size:0.7rem;letter-spacing:4px;z-index:5;pointer-events:none;}\n' +
    '</style>\n' +
    '</head>\n' +
    '<body>\n' +
    '<div id="tag">VORTEX ' +
    blueprint.id +
    ' · ' +
    blueprint.archetypeName.toUpperCase() +
    '</div>\n' +
    '<canvas id="vortex-canvas"></canvas>\n' +
    '<div id="hud">\n' +
    '  <button id="replay-btn" type="button">REPLAY FLIGHT</button>\n' +
    '  <button id="launch-btn" type="button">LAUNCH DESTINATION</button>\n' +
    '</div>\n' +
    openScript +
    '\n' +
    'var BP = JSON.parse("' +
    bpJson.replace(/\\/g, '\\\\').replace(/"/g, '\\"') +
    '");\n' +
    '(' +
    engineSrc +
    ')(BP);\n' +
    closeScript +
    '\n</body>\n' +
    '</html>\n'
  );
}

/** Suggested download filename for an exported blueprint. */
export function exportFilename(blueprint) {
  return 'vortex-' + blueprint.id.toLowerCase() + '.html';
}
