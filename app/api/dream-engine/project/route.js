// app/api/dream-engine/project/route.js
// THE PROJECTION — stage 4 of the Dream Engine.
// The WebGL dreamscape is instant; the film of the dream takes longer. This
// route starts a Gemini Veo generation (POST), polls it (GET ?op=), and —
// once the film exists — streams it back through this server (GET ?uri=) so
// the browser never needs the Gemini key. Failures are honest: every error
// path returns { error, fallback: true } and the client simply keeps the
// dream in WebGL. No video is ever faked.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  veoPredictUrl,
  operationUrl,
  buildVeoRequestBody,
  parseOperationName,
  parseOperationStatus,
  isValidOperationName,
  isAllowedVideoUri,
} from '@/lib/dream-engine/projection';

const MAX_PROMPT_CHARS = 1200;

// POST { prompt } -> { op } — start a Veo dream projection.
export async function POST(req) {
  const key = process.env.GEMINI_API_KEY;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.', fallback: true }, { status: 400 });
  }

  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, MAX_PROMPT_CHARS) : '';
  if (!prompt) {
    return NextResponse.json({ error: 'Describe the dream to project it.', fallback: true }, { status: 400 });
  }
  if (!key) {
    return NextResponse.json(
      { error: 'no_key', fallback: true, message: 'The projection booth is dark (no Gemini key on the server).' },
      { status: 503 }
    );
  }

  let res;
  try {
    res = await fetch(veoPredictUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(buildVeoRequestBody(prompt)),
    });
  } catch {
    return NextResponse.json({ error: 'network', fallback: true }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`[dream-engine] projection start failed: HTTP ${res.status} :: ${detail.slice(0, 300)}`);
    return NextResponse.json({ error: `gemini_${res.status}`, fallback: true }, { status: 502 });
  }

  const data = await res.json().catch(() => null);
  const op = parseOperationName(data);
  if (!op) {
    console.error(
      `[dream-engine] projection start returned no operation :: ${JSON.stringify(data || {}).slice(0, 300)}`
    );
    return NextResponse.json({ error: 'no_operation', fallback: true }, { status: 502 });
  }

  return NextResponse.json({ op });
}

// GET ?op=<operation name>  -> { done:false } | { done:true, videoUrl } | { done:true, error }
// GET ?uri=<video uri>      -> the film itself, streamed as video/mp4
export async function GET(req) {
  const key = process.env.GEMINI_API_KEY;
  const { searchParams } = new URL(req.url);

  const uri = searchParams.get('uri');
  if (uri) return streamVideo(uri, key, req);

  const op = searchParams.get('op');
  if (op) return pollOperation(op, key);

  return NextResponse.json(
    { error: 'Pass ?op=<operation> to poll a projection, or ?uri=<video> to stream one.', fallback: true },
    { status: 400 }
  );
}

async function pollOperation(op, key) {
  if (!isValidOperationName(op)) {
    return NextResponse.json({ error: 'Invalid operation name.', fallback: true }, { status: 400 });
  }
  if (!key) {
    return NextResponse.json({ error: 'no_key', fallback: true }, { status: 503 });
  }

  let res;
  try {
    res = await fetch(operationUrl(op), { headers: { 'x-goog-api-key': key } });
  } catch {
    return NextResponse.json({ error: 'network', fallback: true }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`[dream-engine] projection poll failed: HTTP ${res.status} :: ${detail.slice(0, 300)}`);
    return NextResponse.json({ error: `gemini_${res.status}`, fallback: true }, { status: 502 });
  }

  const data = await res.json().catch(() => null);
  const status = parseOperationStatus(data);

  if (status.error) {
    return NextResponse.json({ done: true, error: status.error, fallback: true });
  }
  if (!status.done) {
    return NextResponse.json({ done: false });
  }
  // The film exists on Google's side; hand the browser OUR stream URL so the
  // key stays on the server.
  return NextResponse.json({
    done: true,
    videoUrl: `/api/dream-engine/project?uri=${encodeURIComponent(status.videoUri)}`,
  });
}

async function streamVideo(uri, key, req) {
  if (!isAllowedVideoUri(uri)) {
    return NextResponse.json({ error: 'That video source is not allowed.', fallback: true }, { status: 400 });
  }
  if (!key) {
    return NextResponse.json({ error: 'no_key', fallback: true }, { status: 503 });
  }

  const headers = { 'x-goog-api-key': key };
  const range = req.headers.get('range');
  if (range) headers.Range = range;

  let upstream;
  try {
    upstream = await fetch(uri, { headers });
  } catch {
    return NextResponse.json({ error: 'network', fallback: true }, { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    const detail = await upstream.text().catch(() => '');
    console.error(`[dream-engine] projection stream failed: HTTP ${upstream.status} :: ${detail.slice(0, 300)}`);
    return NextResponse.json({ error: `gemini_${upstream.status}`, fallback: true }, { status: 502 });
  }

  const out = new Headers();
  out.set('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
  const len = upstream.headers.get('content-length');
  if (len) out.set('Content-Length', len);
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) out.set('Content-Range', contentRange);
  out.set('Accept-Ranges', 'bytes');
  out.set('Cache-Control', 'private, max-age=3600');

  return new Response(upstream.body, { status: upstream.status, headers: out });
}
