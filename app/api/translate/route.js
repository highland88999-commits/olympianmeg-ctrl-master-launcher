// app/api/translate/route.js
// POST /api/translate { text, target? } -> { ok, translated, sourceLang, sourceName, target }
//
// In-app translation with English as the default target (Merlin's rule).
// Server-side only: the browser never talks to translation providers
// directly. Translation happens ONLY on explicit user request (a tap) —
// nothing is bulk-sent anywhere unprompted.
//
// Providers (free, no key): Google's public endpoint is primary (it
// auto-detects the source language reliably); MyMemory is the fallback
// with an explicit script-guessed source pair. Failures answer honestly
// (502) — a translation is never faked.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import {
  targetDefault,
  validateTranslateInput,
  guessSourceLang,
  languageName,
  cacheKey,
} from '@/lib/translate';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const PROVIDER_TIMEOUT_MS = 12000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30; // per IP per minute — generous for taps, stops abuse
const CACHE_MAX = 500;
const CACHE_TTL_MS = 3_600_000;

const cache = new Map(); // key -> { translated, sourceLang, at }
const hits = new Map(); // ip -> [timestamps]

function clientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  if (hits.size > 2000) hits.clear();
  hits.set(ip, arr);
  return arr.length > RATE_MAX;
}

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

// Primary: Google's public endpoint. sl=auto detects the source language;
// the response carries it (data[2]) for the "Translated from X" label.
async function viaGoogle(text, target) {
  const url =
    'https://translate.googleapis.com/translate_a/single?' +
    new URLSearchParams({ client: 'gtx', sl: 'auto', tl: target, dt: 't', q: text });
  const r = await fetchWithTimeout(url, PROVIDER_TIMEOUT_MS);
  if (!r.ok) throw new Error(`google status ${r.status}`);
  const data = await r.json();
  const segments = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : null;
  if (!segments) throw new Error('google shape');
  const translated = segments
    .map((s) => (s && s[0]) || '')
    .join('')
    .trim();
  if (!translated) throw new Error('google empty');
  const sourceLang = typeof data[2] === 'string' ? data[2] : null;
  return { translated, sourceLang };
}

// Fallback: MyMemory needs an explicit source|target pair — no reliable
// auto-detect — so the source is guessed from the script. Garbage in
// (or an unguessable source) means this provider is skipped honestly.
async function viaMyMemory(text, target) {
  const src = guessSourceLang(text);
  if (!src) throw new Error('no source guess');
  const url =
    'https://api.mymemory.translated.net/get?' +
    new URLSearchParams({ q: text, langpair: `${src}|${target}` });
  const r = await fetchWithTimeout(url, PROVIDER_TIMEOUT_MS);
  if (!r.ok) throw new Error(`mymemory status ${r.status}`);
  const data = await r.json();
  const t = data && data.responseData && data.responseData.translatedText;
  if (!t || /invalid/i.test(String(t)) || data.responseStatus !== 200) {
    throw new Error('mymemory bad payload');
  }
  return { translated: String(t).trim(), sourceLang: src };
}

function remember(key, result) {
  cache.set(key, { translated: result.translated, sourceLang: result.sourceLang, at: Date.now() });
  if (cache.size > CACHE_MAX) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
}

export const POST = apiGuard(async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }
  const v = validateTranslateInput(body);
  if (!v.ok) return Response.json({ ok: false, error: v.error }, { status: v.status });

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return Response.json(
      { ok: false, error: 'Too many translation requests. Try again in a minute.' },
      { status: 429 }
    );
  }

  const key = cacheKey(v.text, v.target);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return Response.json({
      ok: true,
      translated: hit.translated,
      sourceLang: hit.sourceLang,
      sourceName: languageName(hit.sourceLang),
      target: v.target,
      cached: true,
    });
  }

  let result = null;
  try {
    result = await viaGoogle(v.text, v.target);
  } catch {
    try {
      result = await viaMyMemory(v.text, v.target);
    } catch {
      result = null;
    }
  }
  if (!result) {
    return Response.json(
      { ok: false, error: "Couldn't translate — showing the original." },
      { status: 502 }
    );
  }
  remember(key, result);
  return Response.json({
    ok: true,
    translated: result.translated,
    sourceLang: result.sourceLang,
    sourceName: languageName(result.sourceLang),
    target: v.target,
    cached: false,
  });
});
