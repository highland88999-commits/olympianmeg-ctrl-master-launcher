// Loki — "Loki's Illusions": pure logic (no DOM, no AudioContext here).
// Themes, seeded illusion state, cycling, and the audio engine factory.

export const THEMES = [
  {
    id: 'aurora',
    name: 'Aurora Veil',
    tagline: 'The northern lights, woven by a trickster hand.',
    palette: {
      skyTop: '#04040f',
      skyBottom: '#0b1233',
      bands: ['#39ff9a', '#35e0ff', '#a855f7'],
      particles: ['#9dffd2', '#baf3ff', '#d8b4fe'],
      glow: '#35e0ff',
    },
    motion: { kind: 'drift', speed: 0.35, count: 130 },
    audio: {
      droneFreqs: [55.0, 82.41, 110.2],
      droneType: 'sine',
      filterFreq: 420,
      filterQ: 0.8,
      lfoRate: 0.07,
      lfoDepth: 220,
      noiseLevel: 0.05,
      noiseBand: 800,
      masterLevel: 0.5,
    },
  },
  {
    id: 'mist',
    name: 'Emerald Mist',
    tagline: 'A green fog that remembers every footstep.',
    palette: {
      skyTop: '#031008',
      skyBottom: '#0a2a18',
      bands: ['#2affa3', '#7bf1a8', '#ffd166'],
      particles: ['#c8ffe0', '#ffe9a8', '#8ff5c0'],
      glow: '#2affa3',
    },
    motion: { kind: 'swirl', speed: 0.5, count: 110 },
    audio: {
      droneFreqs: [110.0, 164.81, 220.5],
      droneType: 'triangle',
      filterFreq: 640,
      filterQ: 1.1,
      lfoRate: 0.11,
      lfoDepth: 160,
      noiseLevel: 0.09,
      noiseBand: 1400,
      masterLevel: 0.45,
    },
  },
  {
    id: 'serpent',
    name: "Serpent's Coil",
    tagline: 'Something vast moves beneath the dark.',
    palette: {
      skyTop: '#120608',
      skyBottom: '#2a0f14',
      bands: ['#ff6b35', '#c1121f', '#ff9e5e'],
      particles: ['#ffc49b', '#ff8f6b', '#e5383b'],
      glow: '#ff6b35',
    },
    motion: { kind: 'coil', speed: 0.6, count: 90 },
    audio: {
      droneFreqs: [49.0, 73.42, 98.3],
      droneType: 'sawtooth',
      filterFreq: 260,
      filterQ: 1.4,
      lfoRate: 0.16,
      lfoDepth: 120,
      noiseLevel: 0.04,
      noiseBand: 500,
      masterLevel: 0.42,
    },
  },
  {
    id: 'bifrost',
    name: 'Bifrost Storm',
    tagline: 'The rainbow bridge, caught mid-shatter.',
    palette: {
      skyTop: '#030816',
      skyBottom: '#0d1b3d',
      bands: ['#ff3d71', '#ffb300', '#35e0ff', '#39ff9a'],
      particles: ['#ffd6e0', '#fff3c4', '#c4f5ff', '#d2ffe8'],
      glow: '#ff3d71',
    },
    motion: { kind: 'streak', speed: 1.4, count: 150 },
    audio: {
      droneFreqs: [220.0, 277.18, 329.63],
      droneType: 'sine',
      filterFreq: 1800,
      filterQ: 0.7,
      lfoRate: 0.31,
      lfoDepth: 480,
      noiseLevel: 0.12,
      noiseBand: 3200,
      masterLevel: 0.4,
    },
  },
];

export function themeById(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

export function nextThemeIndex(i) {
  return (i + 1) % THEMES.length;
}

export function prevThemeIndex(i) {
  return (i - 1 + THEMES.length) % THEMES.length;
}

// Seeded RNG (mulberry32) so each theme's opening frame is stable.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createIllusionState(themeIndex = 0, seed = 20260927) {
  const theme = THEMES[((themeIndex % THEMES.length) + THEMES.length) % THEMES.length];
  const rng = mulberry32(seed + themeIndex * 7919);
  const particles = [];
  const count = theme.motion.count;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: rng(), // 0..1
      y: rng(), // 0..1
      size: 0.6 + rng() * 2.4,
      color: theme.palette.particles[i % theme.palette.particles.length],
      phase: rng() * Math.PI * 2,
      speed: 0.5 + rng(),
      trail: 0.1 + rng() * 0.25,
    });
  }
  const bands = theme.palette.bands.map((color, i) => ({
    color,
    baseY: 0.28 + i * 0.14,
    amplitude: 0.05 + rng() * 0.05,
    wavelength: 1.6 + rng() * 1.8,
    phase: rng() * Math.PI * 2,
    drift: 0.12 + rng() * 0.2,
  }));
  return { themeIndex, theme, time: 0, particles, bands };
}

// Advance the illusion by dt seconds (mutates state).
export function stepIllusion(state, dt) {
  const s = Math.max(0, Math.min(dt, 0.1)); // clamp tab-switch jumps
  state.time += s;
  const kind = state.theme.motion.kind;
  const v = state.theme.motion.speed * s;
  for (const p of state.particles) {
    const sway = Math.sin(state.time * 0.9 + p.phase) * 0.02;
    if (kind === 'drift') {
      p.y -= v * 0.05 * p.speed;
      p.x += sway * 0.4;
    } else if (kind === 'swirl') {
      const ang = state.time * 0.35 * p.speed + p.phase;
      p.x += Math.cos(ang) * v * 0.06 + sway * 0.3;
      p.y += Math.sin(ang) * v * 0.04 - v * 0.01;
    } else if (kind === 'coil') {
      p.x += v * 0.09 * p.speed;
      p.y += Math.sin(p.x * 9 + state.time * 1.6 + p.phase) * v * 0.09;
    } else if (kind === 'streak') {
      p.x += v * 0.28 * p.speed;
      p.y += v * 0.16 * p.speed + sway * 0.5;
    }
    // Wrap around the unit square.
    if (p.x > 1.05) p.x -= 1.1;
    if (p.x < -0.05) p.x += 1.1;
    if (p.y > 1.05) p.y -= 1.1;
    if (p.y < -0.05) p.y += 1.1;
  }
  for (const b of state.bands) {
    b.phase += s * b.drift;
  }
  return state;
}

// ---------------------------------------------------------------------------
// Generative audio engine. The AudioContext is injected via makeContext so the
// engine stays testable and no context is created before a user gesture.
// Required context surface: createOscillator, createGain, createBiquadFilter,
// createBuffer, createBufferSource, destination, currentTime, resume, close.
// ---------------------------------------------------------------------------
export function createAudioEngine(makeContext) {
  let ctx = null;
  let nodes = null;
  let muted = false;
  let playing = false;
  let theme = THEMES[0];

  function buildNodes() {
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : theme.audio.masterLevel;
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = theme.audio.filterFreq;
    filter.Q.value = theme.audio.filterQ;
    filter.connect(master);

    const oscs = theme.audio.droneFreqs.map((freq, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? theme.audio.droneType : 'sine';
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.28;
      o.connect(g);
      g.connect(filter);
      o.start();
      return o;
    });

    // Slow filter sweep — the "breathing" of the illusion.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = theme.audio.lfoRate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = theme.audio.lfoDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    // Airy noise bed.
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = theme.audio.noiseBand;
    noiseFilter.Q.value = 0.6;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = theme.audio.noiseLevel;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start();

    return { master, filter, oscs, lfo, lfoGain, noise, noiseGain };
  }

  function applyTheme(t) {
    const a = t.audio;
    const now = ctx.currentTime;
    nodes.oscs.forEach((o, i) => {
      o.frequency.setTargetAtTime(a.droneFreqs[i] || a.droneFreqs[0], now, 0.8);
      if (i === 0) o.type = a.droneType;
    });
    nodes.filter.frequency.setTargetAtTime(a.filterFreq, now, 0.8);
    nodes.filter.Q.setTargetAtTime(a.filterQ, now, 0.8);
    nodes.lfo.frequency.setTargetAtTime(a.lfoRate, now, 0.8);
    nodes.lfoGain.gain.setTargetAtTime(a.lfoDepth, now, 0.8);
    nodes.noiseGain.gain.setTargetAtTime(a.noiseLevel, now, 0.8);
    nodes.master.gain.setTargetAtTime(muted ? 0 : a.masterLevel, now, 0.4);
  }

  return {
    start() {
      if (!ctx) {
        ctx = makeContext();
        nodes = buildNodes();
        applyTheme(theme);
      }
      if (typeof ctx.resume === 'function') ctx.resume();
      playing = true;
    },
    stop() {
      playing = false;
      if (nodes) {
        nodes.master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      }
    },
    setMuted(m) {
      muted = !!m;
      if (nodes) {
        nodes.master.gain.setTargetAtTime(muted ? 0 : theme.audio.masterLevel, ctx.currentTime, 0.15);
      }
    },
    isMuted() {
      return muted;
    },
    isPlaying() {
      return playing;
    },
    setTheme(t) {
      theme = t;
      if (nodes) applyTheme(t);
    },
    getTheme() {
      return theme;
    },
    dispose() {
      playing = false;
      if (nodes) {
        try {
          nodes.oscs.forEach((o) => o.stop());
          nodes.lfo.stop();
          nodes.noise.stop();
        } catch (_) {
          /* already stopped */
        }
        nodes = null;
      }
      if (ctx && typeof ctx.close === 'function') {
        try {
          ctx.close();
        } catch (_) {
          /* already closed */
        }
        ctx = null;
      }
    },
  };
}
