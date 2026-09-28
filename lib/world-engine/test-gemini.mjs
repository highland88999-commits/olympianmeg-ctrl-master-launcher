// Headless tests: Gemini synthesis helpers (payload building, parsing, stubbed calls).
import assert from 'node:assert/strict';
import {
  GEMINI_MODEL_DEFAULT, SYSTEM_INSTRUCTION, buildInputQuery,
  extractJsonText, parseParams, synthesizeWithGemini, validateSynthesizeInput,
} from './gemini.js';

let passed = 0;
const test = (name, fn) => {
  const run = async () => { await fn(); passed++; console.log(`ok - ${name}`); };
  return run().catch((e) => { console.error(`FAIL - ${name}\n  ${e.message}`); process.exitCode = 1; });
};
const tests = [];

tests.push(test('default model is gemini-2.5-flash', () => {
  assert.equal(GEMINI_MODEL_DEFAULT, 'gemini-2.5-flash');
}));

tests.push(test('system instruction lists every renderer key', () => {
  for (const key of ['sunColor', 'terrainRoughness', 'rotationSpeed', 'atmosphereDensity',
    'ambientLightIntensity', 'terrainType', 'weatherType', 'precipitationIntensity',
    'windSpeed', 'objectDensity']) {
    assert.ok(SYSTEM_INSTRUCTION.includes(key), `missing ${key}`);
  }
  assert.ok(SYSTEM_INSTRUCTION.includes('Respond ONLY with a raw JSON object'));
}));

tests.push(test('buildInputQuery prefers the prompt, falls back to the URL', () => {
  assert.equal(buildInputQuery('  neon desert  ', 'https://x.test/a.glb'), 'neon desert');
  assert.equal(buildInputQuery('', 'https://x.test/a.glb'),
    'Analyze this URL and generate a corresponding 3D world ecosystem: https://x.test/a.glb');
}));

tests.push(test('extractJsonText reads the first candidate part', () => {
  const data = { candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] };
  assert.equal(extractJsonText(data), '{"a":1}');
}));

tests.push(test('extractJsonText throws on empty candidates', () => {
  assert.throws(() => extractJsonText({ candidates: [] }), /malformed/);
  assert.throws(() => extractJsonText({}), /malformed/);
}));

tests.push(test('parseParams parses valid JSON and throws on garbage', () => {
  assert.deepEqual(parseParams('{"sunColor":"#fff"}'), { sunColor: '#fff' });
  assert.throws(() => parseParams('not json {{{'), /invalid JSON/);
}));

tests.push(test('synthesizeWithGemini posts to the right endpoint and parses the reply', async () => {
  let seenUrl = '', seenBody = null;
  const stub = async (url, opts) => {
    seenUrl = url; seenBody = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"weatherType":"rain"}' }] } }] }),
    };
  };
  const out = await synthesizeWithGemini({ apiKey: 'k', prompt: 'stormy', targetUrl: '', fetchImpl: stub });
  assert.deepEqual(out, { weatherType: 'rain' });
  assert.ok(seenUrl.includes(`/models/${GEMINI_MODEL_DEFAULT}:generateContent`), `url: ${seenUrl}`);
  assert.equal(seenBody.generationConfig.response_mime_type, 'application/json');
  assert.ok(seenBody.system_instruction.parts[0].text.includes('sunColor'));
}));

tests.push(test('synthesizeWithGemini surfaces API error messages', async () => {
  const stub = async () => ({ ok: false, json: async () => ({ error: { message: 'bad key' } }) });
  await assert.rejects(() => synthesizeWithGemini({ apiKey: 'k', prompt: 'x', fetchImpl: stub }), /bad key/);
}));

tests.push(test('synthesizeWithGemini requires an API key', async () => {
  await assert.rejects(() => synthesizeWithGemini({ apiKey: '', prompt: 'x' }), /not configured/);
}));

tests.push(test('validateSynthesizeInput accepts prompt or URL, caps lengths', () => {
  assert.equal(validateSynthesizeInput({ prompt: 'hello' }).ok, true);
  assert.equal(validateSynthesizeInput({ targetUrl: 'https://a.test/x.glb' }).ok, true);
  assert.equal(validateSynthesizeInput({}).ok, false);
  assert.equal(validateSynthesizeInput({ targetUrl: 'ftp://x' }).ok, false);
  const long = validateSynthesizeInput({ prompt: 'x'.repeat(5000) });
  assert.equal(long.prompt.length, 2000);
}));

await Promise.all(tests);
console.log(`\n${passed} gemini tests passed.`);
