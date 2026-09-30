// tests/api-guard.test.mjs
// Headless tests for lib/api-guard.js — the shared safety net around every
// API route handler. Run: node tests/api-guard.test.mjs (from the repo root).
// No browser, no network.
import { apiGuard } from '../lib/api-guard.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}

async function readJson(res) {
  if (res && typeof res.json === 'function') return { status: res.status, body: await res.json() };
  return { status: res.status, body: res.body };
}

// --- Passthrough: a healthy handler is returned untouched ---
{
  const sentinel = { ok: true, data: [1, 2, 3] };
  const out = await apiGuard(async () => sentinel)({});
  t('healthy handler passes through unchanged', out === sentinel);
}

// --- Generic throw: 500, no internal details leaked ---
{
  const out = await readJson(await apiGuard(async () => {
    throw new Error('supabase exploded: relation "x" does not exist');
  })({}));
  t('thrown error -> 500', out.status === 500);
  t('generic message, no leak', out.body.error === 'Something went wrong. Please try again.');
  t('no stack/details in body', !('details' in out.body) && !('stack' in out.body));
  t('ok:false envelope', out.body.ok === false);
}

// --- Missing configuration: honest 503 ---
for (const msg of [
  'Supabase is not configured (missing URL or service-role key).',
  'Spotify sign-in is not configured yet.',
  'The synthesis service is not connected yet.',
  'Webhook not configured.',
]) {
  const out = await readJson(await apiGuard(async () => { throw new Error(msg); })({}));
  t(`config-looking throw -> 503 (${msg.slice(0, 30)}…)`, out.status === 503);
  t('honest 503 copy', out.body.error === 'This service is not connected yet.');
}

// --- Non-Error throws do not crash the guard ---
{
  const out = await readJson(await apiGuard(async () => { throw 'string oops'; })({}));
  t('non-Error throw -> 500 generic', out.status === 500 && out.body.error === 'Something went wrong. Please try again.');
}

// --- Context arg is forwarded ---
{
  const seen = [];
  await apiGuard(async (req, ctx) => { seen.push(ctx); return { ok: true }; })({}, { params: { a: 1 } });
  t('ctx forwarded to handler', seen[0] && seen[0].params.a === 1);
}

console.log(`api-guard: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
