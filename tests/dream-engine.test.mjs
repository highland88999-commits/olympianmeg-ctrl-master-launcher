/*
 * DREAM ENGINE tests — run with: node --test tests/dream-engine.test.mjs
 * Covers: scene schema validation, normalization of hostile/sloppy LLM
 * output (bad types, out-of-range numbers, non-hex colors, oversized
 * arrays), cluster expansion, and the default-scene fallback contract.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeScene,
  normalizeObject,
  normalizeEnvironment,
  isValidScene,
  DEFAULT_SCENE,
  OBJECT_TYPES,
  MAX_OBJECTS,
} from '../lib/dream-engine/schema.js';
import { EXAMPLE_DREAMS, SURPRISE_DREAMS, randomSurprise } from '../lib/dream-engine/examples.js';
import {
  VEO_MODEL,
  buildDreamVideoPrompt,
  buildVeoRequestBody,
  parseOperationName,
  parseOperationStatus,
  isValidOperationName,
  isAllowedVideoUri,
} from '../lib/dream-engine/projection.js';

test('default scene is itself valid and normalized', () => {
  const s = normalizeScene(DEFAULT_SCENE);
  assert.equal(s.objects.length, DEFAULT_SCENE.objects.length);
  assert.ok(s.objects.every((o) => OBJECT_TYPES.includes(o.type)));
  assert.match(s.environment.skyColor, /^#[0-9a-f]{6}$/);
  assert.ok(isValidScene(DEFAULT_SCENE));
});

test('garbage input falls back to the default scene', () => {
  for (const bad of [null, undefined, 42, 'dream', [], { objects: 'nope' }]) {
    const s = normalizeScene(bad);
    assert.equal(s.environment.skyColor, DEFAULT_SCENE.environment.skyColor);
    assert.ok(Array.isArray(s.objects) && s.objects.length > 0);
    assert.equal(typeof s.mood.label, 'string');
  }
});

test('unknown object types are dropped, known types kept', () => {
  const s = normalizeScene({
    objects: [
      { type: 'spaceship', position: [0, 1, 0] },
      { type: 'tower', position: [1, 0, -4] },
      { type: 'ufo' },
      'not-an-object',
      { type: 'crystal', position: [3, 2, -6] },
    ],
  });
  assert.deepEqual(s.objects.map((o) => o.type), ['tower', 'crystal']);
});

test('every vocabulary type survives normalization', () => {
  const s = normalizeScene({ objects: OBJECT_TYPES.map((type, i) => ({ type, position: [i, 1, -i] })) });
  assert.equal(s.objects.length, OBJECT_TYPES.length);
});

test('numbers are clamped into renderer-safe ranges', () => {
  const o = normalizeObject({
    type: 'sphere',
    position: [9999, -500, 12],
    scale: 500,
    roughness: 7,
    metalness: -2,
    emissiveIntensity: 99,
  });
  assert.ok(o.position[0] <= 80 && o.position[1] >= -10);
  assert.ok(o.scale.every((v) => v <= 40));
  assert.equal(o.roughness, 1);
  assert.equal(o.metalness, 0);
  assert.equal(o.emissiveIntensity, 3);
});

test('non-finite and stringy numbers coerce or default', () => {
  const o = normalizeObject({ type: 'door', position: ['x', NaN, null], roughness: '0.4' });
  assert.ok(o.position.every((v) => Number.isFinite(v)));
  assert.equal(o.roughness, 0.4);
});

test('colors must be hex; #rgb expands to #rrggbb', () => {
  const good = normalizeObject({ type: 'ring', color: '#Fc0' });
  assert.equal(good.color, '#ffcc00');
  const bad = normalizeObject({ type: 'ring', color: 'javascript:alert(1)', emissive: 'red' });
  assert.match(bad.color, /^#[0-9a-f]{6}$/);
  assert.equal(bad.emissive, '#000000');
});

test('environment enums fall back, fog density clamps', () => {
  const e = normalizeEnvironment({
    groundType: 'lava',
    particles: 'fireflies',
    fogDensity: 5,
    lightIntensity: -1,
    ambient: 'high',
  });
  assert.equal(e.groundType, 'flat');
  assert.equal(e.particles, 'stars');
  assert.equal(e.fogDensity, 0.08);
  assert.equal(e.lightIntensity, 0);
  assert.equal(typeof e.ambient, 'number');
});

test('object count is capped at MAX_OBJECTS', () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ type: 'candle', position: [i % 10, 0, -i % 10] }));
  const s = normalizeScene({ objects: many });
  assert.equal(s.objects.length, MAX_OBJECTS);
});

test('clusters expand deterministically and respect the cap', () => {
  const raw = { objects: [{ type: 'tree', position: [0, 0, -10], cluster: { count: 6, spread: 8 } }] };
  const a = normalizeScene(raw);
  const b = normalizeScene(raw);
  assert.equal(a.objects.length, 6);
  assert.deepEqual(a.objects.map((o) => o.position), b.objects.map((o) => o.position));
  const huge = normalizeScene({
    objects: Array.from({ length: 20 }, () => ({ type: 'candle', position: [0, 0, 0], cluster: { count: 12, spread: 5 } })),
  });
  assert.ok(huge.objects.length <= MAX_OBJECTS);
});

test('spin and float are strictly typed', () => {
  const o = normalizeObject({ type: 'ring', spin: 'fast', float: 'yes' });
  assert.equal(o.spin, 'none');
  assert.equal(o.float, false);
  const p = normalizeObject({ type: 'ring', spin: 'slow', float: true });
  assert.equal(p.spin, 'slow');
  assert.equal(p.float, true);
});

test('mood text is trimmed to safe lengths', () => {
  const s = normalizeScene({ mood: { label: 'x'.repeat(500), reading: 'y'.repeat(900) } });
  assert.ok(s.mood.label.length <= 48);
  assert.ok(s.mood.reading.length <= 280);
  const empty = normalizeScene({ mood: { label: '   ', reading: '' } });
  assert.equal(empty.mood.label, DEFAULT_SCENE.mood.label);
});

test('examples and surprises are non-empty dream strings', () => {
  assert.ok(EXAMPLE_DREAMS.length >= 4);
  assert.ok(SURPRISE_DREAMS.length >= 4);
  assert.ok(EXAMPLE_DREAMS.every((d) => typeof d === 'string' && d.length > 20));
  const pick = randomSurprise(EXAMPLE_DREAMS[0]);
  assert.ok(SURPRISE_DREAMS.includes(pick));
});

// ---------------------------------------------------------------------------
// Projection (stage 4): Veo request shaping + operation parsing + URI guard
// ---------------------------------------------------------------------------

test('veo request body is shaped for predictLongRunning', () => {
  assert.equal(VEO_MODEL, 'veo-3.1-fast-generate-preview');
  const body = buildVeoRequestBody('a hallway of melting clocks above the sea');
  assert.equal(body.parameters.aspectRatio, '16:9');
  assert.equal(body.instances.length, 1);
  assert.equal(typeof body.instances[0].prompt, 'string');
  assert.match(body.instances[0].prompt, /melting clocks/);
  assert.match(body.instances[0].prompt, /[Cc]inematic dream/);
});

test('dream video prompt survives garbage and stays bounded', () => {
  for (const bad of [null, undefined, 42, '']) {
    const p = buildDreamVideoPrompt(bad);
    assert.equal(typeof p, 'string');
    assert.ok(p.length > 40);
  }
  const huge = buildDreamVideoPrompt('x'.repeat(10000));
  assert.ok(huge.length < 1100, `prompt too long: ${huge.length}`);
});

test('parseOperationName extracts only real operation names', () => {
  const name = 'models/veo-3.1-fast-generate-preview/operations/abc123';
  assert.equal(parseOperationName({ name }), name);
  assert.equal(parseOperationName({}), null);
  assert.equal(parseOperationName({ name: 'models/veo' }), null);
  assert.equal(parseOperationName(null), null);
  assert.equal(parseOperationName('operations/abc'), null);
});

test('operation names validate strictly', () => {
  assert.ok(isValidOperationName('models/veo-3.1-fast-generate-preview/operations/abc123'));
  assert.ok(isValidOperationName('operations/abc-123_XYZ'));
  for (const bad of [
    '',
    'https://generativelanguage.googleapis.com/v1beta/operations/abc',
    '../operations/abc',
    'models/veo/operations/',
    'operations/',
    'operations/a b',
    'operations/a/b',
    null,
    42,
  ]) {
    assert.equal(isValidOperationName(bad), false, `should reject: ${bad}`);
  }
});

test('parseOperationStatus reads pending, ready, and failed operations', () => {
  assert.deepEqual(parseOperationStatus({ name: 'operations/x', done: false }), {
    done: false,
    videoUri: null,
    error: null,
  });

  const uri = 'https://generativelanguage.googleapis.com/v1beta/files/abc123';
  const ready = parseOperationStatus({
    done: true,
    response: { generateVideoResponse: { generatedSamples: [{ video: { uri } }] } },
  });
  assert.deepEqual(ready, { done: true, videoUri: uri, error: null });

  const vertexReady = parseOperationStatus({
    done: true,
    response: { generatedVideos: [{ video: { uri: 'https://storage.googleapis.com/bucket/film.mp4' } }] },
  });
  assert.equal(vertexReady.done, true);
  assert.equal(vertexReady.videoUri, 'https://storage.googleapis.com/bucket/film.mp4');

  const failed = parseOperationStatus({ done: true, error: { message: 'quota exhausted' } });
  assert.equal(failed.done, true);
  assert.equal(failed.videoUri, null);
  assert.equal(failed.error, 'quota exhausted');

  const empty = parseOperationStatus({ done: true, response: {} });
  assert.equal(empty.done, true);
  assert.equal(empty.videoUri, null);
  assert.ok(empty.error);

  const silent = parseOperationStatus(null);
  assert.equal(silent.done, true);
  assert.ok(silent.error);
});

test('video URI guard allows only Google media hosts over https', () => {
  assert.ok(isAllowedVideoUri('https://generativelanguage.googleapis.com/v1beta/files/abc'));
  assert.ok(isAllowedVideoUri('https://storage.googleapis.com/bucket/film.mp4'));
  for (const bad of [
    'http://generativelanguage.googleapis.com/v1beta/files/abc',
    'https://generativelanguage.googleapis.com.evil.com/files/abc',
    'https://evil-generativelanguage.googleapis.com/files/abc',
    'https://example.com/film.mp4',
    'javascript:alert(1)',
    'not a url',
    '',
    null,
    undefined,
  ]) {
    assert.equal(isAllowedVideoUri(bad), false, `should reject: ${bad}`);
  }
});
