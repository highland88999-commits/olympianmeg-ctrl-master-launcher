// tests/sound-engine.test.mjs — SOUND ENGINE v1: profile parsing,
// synth parameter math, distance/pan, seed data, and the Hades hook.
// Pure logic only — the browser engine (AudioContext) is not exercised
// here; a headless load of the world proves the wiring instead.
// Run: node tests/sound-engine.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProfile,
  silentProfile,
  createRegistry,
} from '../lib/sound/profiles.js';
import {
  voicePlan,
  envelopePoints,
  expandPattern,
  gainForDistance,
  earshotFor,
  panForListener,
  REFERENCE_DISTANCE,
  MAX_DISTANCE,
} from '../lib/sound/math.js';
import { SEED_PROFILES } from '../lib/sound/seed-profiles.js';
import { HADES_PROFILES, ambientForRegion, shouldGrowl, GROWL_RADIUS, GROWL_COOLDOWN_MS } from '../lib/nether-realm/sounds.js';
import { REGIONS } from '../lib/nether-realm/world.js';
import { createSoundEngine } from '../lib/sound/engine.js';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// --- profiles ---------------------------------------------------------------

test('normalizeProfile fills defaults and keeps good math', () => {
  const { profile, errors } = normalizeProfile({
    id: 'test-wolf', species: 'Test wolf',
    math: { frequency: 350, waveform: 'sawtooth' },
  });
  assert.deepEqual(errors, []);
  assert.equal(profile.id, 'test-wolf');
  assert.equal(profile.math.frequency, 350);
  assert.equal(profile.math.frequencyEnd, null);
  assert.deepEqual(profile.math.harmonics, [{ multiple: 1, gain: 1 }]);
  assert.equal(profile.pattern.type, 'single');
  assert.equal(profile.source, 'synthesized');
  assert.equal(profile.silent, false);
});

test('normalizeProfile rejects bad math on a sounding profile', () => {
  const { profile, errors } = normalizeProfile({
    id: 'bad', species: 'Bad', math: { frequency: -5 },
  });
  assert.equal(profile, null);
  assert.ok(errors.length > 0);
  const noFreq = normalizeProfile({ id: 'bad2', species: 'Bad 2', math: {} });
  assert.equal(noFreq.profile, null);
});

test('normalizeProfile clamps volume and validates waveform', () => {
  const { profile } = normalizeProfile({
    id: 'loud', species: 'Loud', volume: 5,
    math: { frequency: 440, waveform: 'triangle' },
  });
  assert.equal(profile.volume, 1);
  const badWave = normalizeProfile({
    id: 'w', species: 'W', math: { frequency: 440, waveform: 'flute' },
  });
  assert.equal(badWave.profile, null);
});

test('silent profiles need no math and stay silent', () => {
  const { profile, errors } = normalizeProfile({
    id: 'oak', species: 'Oak', silent: true,
  });
  assert.deepEqual(errors, []);
  assert.equal(profile.silent, true);
  assert.equal(profile.math, null);
  const made = silentProfile('oak2', 'Oak 2');
  assert.equal(made.silent, true);
  assert.equal(made.source, 'silent');
});

test('registry resolves defaults, contexts, and unknown species', () => {
  const registry = createRegistry([
    { id: 'wolf', species: 'Wolf', context: 'howl', math: { frequency: 350 } },
    { id: 'wolf', species: 'Wolf', context: 'growl', math: { frequency: 90 } },
  ]);
  assert.equal(registry.resolve('wolf').math.frequency, 350);
  assert.equal(registry.resolve('wolf', 'growl').math.frequency, 90);
  assert.equal(registry.resolve('wolf', 'nope').math.frequency, 350, 'unknown context falls back to default');
  assert.equal(registry.resolve('unicorn'), null, 'unknown species never invents a sound');
  assert.equal(registry.list().length, 1, 'list collapses context duplicates');
});

// --- math: voice plans -------------------------------------------------------

test('voicePlan builds one oscillator per harmonic, gains sum to 1', () => {
  const { profile } = normalizeProfile({
    id: 'v', species: 'V',
    math: {
      frequency: 100,
      harmonics: [{ multiple: 1, gain: 2 }, { multiple: 2, gain: 1 }, { multiple: 3, gain: 1 }],
      waveform: 'sawtooth',
    },
  });
  const plan = voicePlan(profile);
  assert.equal(plan.kind, 'osc');
  assert.equal(plan.oscillators.length, 3);
  assert.deepEqual(plan.oscillators.map((o) => o.freq), [100, 200, 300]);
  const sum = plan.oscillators.reduce((s, o) => s + o.gain, 0);
  assert.ok(approx(sum, 1), `harmonic gains sum to 1, got ${sum}`);
});

test('voicePlan glides harmonics with frequencyEnd', () => {
  const { profile } = normalizeProfile({
    id: 'g', species: 'G',
    math: { frequency: 200, frequencyEnd: 400, harmonics: [{ multiple: 1, gain: 1 }, { multiple: 2, gain: 1 }] },
  });
  const plan = voicePlan(profile);
  assert.deepEqual(plan.oscillators.map((o) => o.freqEnd), [400, 800]);
});

test('voicePlan makes a noise voice for noise waveforms, null for silent', () => {
  const { profile } = normalizeProfile({
    id: 'n', species: 'N',
    math: { frequency: 600, frequencyEnd: 300, waveform: 'noise' },
  });
  const plan = voicePlan(profile);
  assert.equal(plan.kind, 'noise');
  assert.equal(plan.frequency, 600);
  assert.equal(plan.sweepTo, 300);
  assert.equal(voicePlan(silentProfile('s', 'S')), null);
});

// --- math: envelopes + patterns ----------------------------------------------

test('envelopePoints starts at 0, peaks at 1 after attack, ends at 0', () => {
  const points = envelopePoints(2, { attack: 0.4, decay: 0.5, sustain: 0.7, release: 0.6 });
  assert.deepEqual(points[0], [0, 0]);
  assert.deepEqual(points[1], [0.4, 1]);
  assert.deepEqual(points[points.length - 1], [2, 0]);
  assert.ok(points.some(([t, v]) => t === 0.9 && v === 0.7), 'sustain level held after decay');
  for (const [t] of points) assert.ok(t >= 0 && t <= 2);
});

test('envelopePoints scales down when the duration is too short', () => {
  const points = envelopePoints(0.2, { attack: 0.4, decay: 0.5, sustain: 0.7, release: 0.6 });
  assert.deepEqual(points[points.length - 1], [0.2, 0]);
  assert.ok(points.every(([t]) => t >= 0 && t <= 0.2));
});

test('expandPattern: single, repeat, chorus', () => {
  const single = expandPattern({ duration: 1, pattern: { type: 'single' } });
  assert.deepEqual(single.events, [{ delay: 0, duration: 1 }]);
  assert.equal(single.loop, false);
  const repeat = expandPattern({ duration: 0.5, pattern: { type: 'repeat', count: 3, interval: 0.4 } });
  assert.deepEqual(repeat.events, [
    { delay: 0, duration: 0.5 },
    { delay: 0.4, duration: 0.5 },
    { delay: 0.8, duration: 0.5 },
  ]);
  const chorus = expandPattern({ duration: 1, pattern: { type: 'chorus', interval: 5 } });
  assert.equal(chorus.loop, true);
  assert.equal(chorus.interval, 5);
  assert.equal(chorus.events.length, 1);
});

// --- math: distance + pan -----------------------------------------------------

test('gainForDistance: full inside reference, half at twice, silent past max', () => {
  assert.equal(gainForDistance(0), 1);
  assert.equal(gainForDistance(REFERENCE_DISTANCE), 1);
  assert.ok(approx(gainForDistance(REFERENCE_DISTANCE * 2), 0.5));
  assert.equal(gainForDistance(MAX_DISTANCE), 0);
  assert.equal(gainForDistance(MAX_DISTANCE + 50), 0);
});

test('panForListener: ahead is centred, right is +1, left is -1', () => {
  const listener = { x: 0, z: 0, yaw: 0 }; // facing north (-Z)
  assert.deepEqual(panForListener(listener, { x: 0, z: -10 }), { distance: 10, pan: 0 });
  const right = panForListener(listener, { x: 10, z: 0 });
  assert.ok(approx(right.pan, 1), `right pan ${right.pan}`);
  assert.equal(right.distance, 10);
  const left = panForListener(listener, { x: -10, z: 0 });
  assert.ok(approx(left.pan, -1), `left pan ${left.pan}`);
  const behind = panForListener(listener, { x: 0, z: 10 });
  assert.ok(approx(behind.pan, 0), `behind pan ${behind.pan}`);
  assert.deepEqual(panForListener(listener, { x: 0, z: 0 }), { distance: 0, pan: 0 });
});

test('panForListener follows the listener yaw', () => {
  // Facing east (yaw -PI/2): a source to the east is ahead, centred.
  const listener = { x: 0, z: 0, yaw: -Math.PI / 2 };
  const ahead = panForListener(listener, { x: 10, z: 0 });
  assert.ok(approx(ahead.pan, 0), `east-ahead pan ${ahead.pan}`);
});

// --- seed data -----------------------------------------------------------------

test('every seed profile parses clean and has valid sound math (or is silent)', () => {
  const ids = new Set();
  for (const raw of SEED_PROFILES) {
    const { profile, errors } = normalizeProfile(raw);
    assert.ok(profile, `${raw.id} parses: ${errors.join(', ')}`);
    assert.ok(!ids.has(profile.id), `duplicate seed id ${profile.id}`);
    ids.add(profile.id);
    if (profile.silent) {
      assert.equal(profile.source, 'silent');
    } else {
      assert.ok(profile.math.frequency > 0, `${profile.id} has a positive frequency`);
      assert.ok(profile.duration > 0, `${profile.id} has a positive duration`);
      assert.ok(profile.volume > 0 && profile.volume <= 1, `${profile.id} volume in range`);
    }
  }
  assert.ok(ids.size >= 15, `at least 15 seed profiles, got ${ids.size}`);
});

test('seed data covers birds, mammals, frogs, insects, fish and whales', () => {
  const ids = SEED_PROFILES.map((p) => p.id);
  for (const id of ['turdus-migratorius', 'bubo-virginianus', 'canis-lupus', 'panthera-leo',
    'lithobates-catesbeianus', 'apis-mellifera', 'gryllus-assimilis',
    'porichthys-notatus', 'balaenoptera-musculus', 'megaptera-novaeangliae']) {
    assert.ok(ids.includes(id), `seed includes ${id}`);
  }
  const registry = createRegistry(SEED_PROFILES);
  assert.equal(registry.resolve('quercus-robur').silent, true, 'the oak stays silent');
  assert.equal(registry.resolve('canis-lupus').context, 'howl');
});

// --- Hades hook ---------------------------------------------------------------

test('every Hades profile parses clean', () => {
  for (const raw of HADES_PROFILES) {
    const { profile, errors } = normalizeProfile(raw);
    assert.ok(profile, `${raw.id} parses: ${errors.join(', ')}`);
  }
  const registry = createRegistry([...SEED_PROFILES, ...HADES_PROFILES]);
  assert.ok(registry.resolve('cerberus'), 'Cerberus is in the registry');
  assert.equal(registry.resolve('cerberus').math.frequency, 65);
});

test('ambientForRegion covers every region in the world', () => {
  const names = [...REGIONS.map((r) => r.name), 'The Descent', 'The Gates', 'The River Styx', "Hades' Palace", 'Hades', 'nowhere'];
  const registry = createRegistry([...SEED_PROFILES, ...HADES_PROFILES]);
  for (const name of names) {
    const bed = ambientForRegion(name);
    assert.ok(Array.isArray(bed) && bed.length > 0, `${name} has an ambient bed`);
    for (const entry of bed) {
      assert.ok(registry.resolve(entry.id), `${name} bed entry ${entry.id} resolves`);
    }
  }
  const elysium = ambientForRegion('Elysium');
  assert.ok(elysium.some((e) => e.id === 'turdus-migratorius'), 'Elysium gets birdsong');
  const tartarus = ambientForRegion('Tartarus');
  assert.ok(tartarus.some((e) => e.id === 'hades-fire'), 'Tartarus gets fire');
});

test('shouldGrowl fires only close to the Gates and after the cooldown', () => {
  const near = { x: 0, z: 60 }; // 10m from the Gates (0, 70)
  const far = { x: 0, z: 160 }; // at the spawn
  assert.equal(shouldGrowl(near, 0, GROWL_COOLDOWN_MS), true);
  assert.equal(shouldGrowl(near, 0, GROWL_COOLDOWN_MS - 1), false, 'cooldown not yet over');
  assert.equal(shouldGrowl(far, 0, 999999), false, 'too far, no growl');
  assert.equal(shouldGrowl(near, 1000, 1000 + GROWL_COOLDOWN_MS), true, 'cooldown measured from last growl');
  assert.equal(shouldGrowl(null, 0, 999999), false);
  assert.ok(GROWL_RADIUS > 0 && GROWL_COOLDOWN_MS > 0);
});

// --- engine factory (node smoke — no browser, no AudioContext) -------------

test('engine factory loads in node and answers without a browser', () => {
  const engine = createSoundEngine();
  assert.equal(engine.unlocked, false);
  assert.equal(engine.muted, false);
  assert.ok(engine.registry.resolve('canis-lupus'), 'seed wolf is registered');
  assert.equal(engine.playSound('quercus-robur').reason, 'silent', 'the oak stays silent');
  assert.equal(engine.playSound('unicorn').reason, 'unknown', 'unknown species, no invented sound');
  assert.equal(engine.playSound('canis-lupus').reason, 'locked', 'no gesture yet, so no sound');
  engine.setMuted(true);
  assert.equal(engine.muted, true);
  engine.setVolume(0.5);
  assert.equal(engine.volume, 0.5);
  engine.setVolume(9);
  assert.equal(engine.volume, 1, 'volume clamps');
});

test('engine addProfiles wires new species into the registry', () => {
  const engine = createSoundEngine();
  assert.equal(engine.registry.resolve('test-bird'), null);
  engine.addProfiles([
    { id: 'test-bird', species: 'Test bird', math: { frequency: 2000 } },
  ]);
  assert.ok(engine.registry.resolve('test-bird'), 'added profile resolves');
  assert.equal(engine.playSound('test-bird').reason, 'locked', 'plays (once unlocked) like any other');
});

// --- earshot + live volume (Merlin, Nov 12 — volume fix + Earth 4) ----------

test('earshot scales with volume: louder species are heard farther', () => {
  assert.equal(earshotFor(1), MAX_DISTANCE, 'loudest carries to the max');
  assert.equal(earshotFor(0.9), 108, 'lion earshot');
  assert.ok(approx(earshotFor(0.3), 36), 'mosquito earshot');
  assert.equal(earshotFor(0), REFERENCE_DISTANCE, 'never below reference');
  assert.equal(earshotFor(5), MAX_DISTANCE, 'volume clamps');
});

test('gainForDistance with a species earshot: mosquito silent at 50m, lion audible', () => {
  assert.equal(gainForDistance(50, REFERENCE_DISTANCE, earshotFor(0.3)), 0);
  assert.ok(gainForDistance(50, REFERENCE_DISTANCE, earshotFor(0.9)) > 0);
  assert.equal(gainForDistance(0, REFERENCE_DISTANCE, earshotFor(0.3)), 1, 'up close, full volume');
});

// Minimal mock AudioContext: records scheduled gain values so the test can
// prove the live engine honors profile volume (the Nov 12 volume bug:
// scheduleGain overwrote the voice gain with the raw envelope).
class MockGainParam {
  constructor() { this.value = 0; this.calls = []; }
  setValueAtTime(v) { this.calls.push(v); this.value = v; }
  linearRampToValueAtTime(v) { this.calls.push(v); this.value = v; }
}
class MockGainNode {
  constructor() { this.gain = new MockGainParam(); }
  connect() {}
}
class MockOscillator {
  constructor() {
    this.type = '';
    this.frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  }
  connect() {}
  start() {}
  stop() {}
}
class MockPanner {
  constructor() { this.pan = { value: 0 }; }
  connect() {}
}
class MockAudioContext {
  static instances = [];
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.state = 'running';
    this.destination = {};
    this.gains = [];
    MockAudioContext.instances.push(this);
  }
  createGain() { const g = new MockGainNode(); this.gains.push(g); return g; }
  createOscillator() { return new MockOscillator(); }
  createStereoPanner() { return new MockPanner(); }
  createBuffer(_ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  resume() { return Promise.resolve(); }
}

test('live engine honors profile volume: mosquito quiet, lion loud', () => {
  MockAudioContext.instances = [];
  globalThis.window = {
    AudioContext: MockAudioContext,
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  try {
    const engine = createSoundEngine();
    engine.unlock();
    assert.equal(engine.unlocked, true, 'mock context unlocks');
    const ctx = MockAudioContext.instances[0];
    const peakFor = (id) => {
      const mark = ctx.gains.length;
      const res = engine.playSound(id);
      assert.equal(res.played, true, `${id} plays: ${res.reason}`);
      let peak = 0;
      for (const g of ctx.gains.slice(mark)) {
        for (const v of g.gain.calls) peak = Math.max(peak, v);
      }
      return peak;
    };
    assert.ok(approx(peakFor('aedes-aegypti'), 0.3, 1e-6), 'mosquito peaks at its 0.3 volume');
    assert.ok(approx(peakFor('panthera-leo'), 0.9, 1e-6), 'lion peaks at its 0.9 volume');
  } finally {
    delete globalThis.window;
  }
});
