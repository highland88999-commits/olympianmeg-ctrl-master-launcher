// app/rogers-arena/api/live/route.js
// GET /rogers-arena/api/live?view=scoreboard
//   Today's NHL scoreboard: live games first, then upcoming, then finals.
// GET /rogers-arena/api/live?view=game&id=<nhl game id>
//   One game: status, clock, shots, scoring summary, recent plays.
//
// Server-side proxy to the FREE NHL public API (api-web.nhle.com — no key
// needed). The client never talks to the NHL API directly. Scores are real
// and never invented; when the NHL API is unreachable we answer 502 and the
// UI shows an honest "couldn't reach live scores" state.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  NHL_SCORE_URL,
  nhlGameDetailUrl,
  normalizeScoreboardGame,
  normalizeGameDetail,
  sortGames,
} from '@/lib/nhl-live';

// Tiny in-memory cache. Live data: 30s. Finals: 5 minutes.
const cache = new Map(); // key -> { at, payload }
const LIVE_TTL_MS = 30 * 1000;
const FINAL_TTL_MS = 5 * 60 * 1000;

function readCache(key, ttlMs) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.payload;
  cache.delete(key);
  return null;
}

function writeCache(key, payload) {
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), payload });
}

async function nhlFetch(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`nhl api ${res.status}`);
  return res.json();
}

function json(payload, maxAgeSeconds) {
  const res = NextResponse.json(payload);
  res.headers.set(
    'Cache-Control',
    `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 2}`
  );
  return res;
}

async function getScoreboard() {
  const cached = readCache('scoreboard', LIVE_TTL_MS);
  if (cached) return cached;
  const data = await nhlFetch(NHL_SCORE_URL);
  const raw = Array.isArray(data?.games) ? data.games : [];
  const games = sortGames(raw.map(normalizeScoreboardGame).filter(Boolean));
  const payload = { games, updatedAt: new Date().toISOString() };
  writeCache('scoreboard', payload);
  return payload;
}

async function getGame(id) {
  const cachedLive = readCache(`game:${id}:live`, LIVE_TTL_MS);
  if (cachedLive) return cachedLive;
  const cachedFinal = readCache(`game:${id}:final`, FINAL_TTL_MS);
  if (cachedFinal) return cachedFinal;
  const data = await nhlFetch(nhlGameDetailUrl(id));
  const game = normalizeGameDetail(data);
  if (!game) throw new Error('nhl api returned no game');
  writeCache(`game:${id}:${game.live ? 'live' : 'final'}`, game);
  return game;
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const view = params.get('view');

  if (view === 'game') {
    const id = (params.get('id') || '').trim();
    if (!/^\d+$/.test(id)) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    try {
      const game = await getGame(id);
      return json({ game }, game.live ? 30 : 300);
    } catch {
      return NextResponse.json(
        { error: 'Live scores are unavailable right now.' },
        { status: 502 }
      );
    }
  }

  // Default: scoreboard.
  try {
    const board = await getScoreboard();
    return json(board, 30);
  } catch {
    return NextResponse.json(
      { error: 'Live scores are unavailable right now.' },
      { status: 502 }
    );
  }
}
