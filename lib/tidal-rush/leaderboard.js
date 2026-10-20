// lib/tidal-rush/leaderboard.js
// Tidal Rush leaderboard client: tries the global board first, degrades
// gracefully to a per-device board when Supabase is unreachable (the Brain
// connector is currently down — the page must never crash on that).
//
// Contract with the page:
//   fetchLeaderboard() -> { source: 'global'|'local', entries: [...], offline }
//   submitScore({ username, totalMs, bestLapMs, racers }) -> { ok, source, queued }
// Queued times are flushed the next time the global board answers.

'use client';

const LOCAL_KEY = 'tidal_rush_local_board';
const PENDING_KEY = 'tidal_rush_pending_scores';
const NAME_KEY = 'tidal_rush_name';
const MAX_LOCAL = 10;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode etc. — the board just won't persist
  }
}

export function getSavedName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function saveName(name) {
  try {
    localStorage.setItem(NAME_KEY, String(name || '').slice(0, 24));
  } catch {
    /* ignore */
  }
}

async function fetchGlobal(limit = 10) {
  const res = await fetch(`/api/tidal-rush/leaderboard?limit=${limit}`, {
    headers: { 'Cache-Control': 'no-store' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'leaderboard failed');
  return data.entries || [];
}

async function postGlobal(payload) {
  const res = await fetch('/api/tidal-rush/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function recordLocal(entry) {
  const list = readJson(LOCAL_KEY, []);
  list.push({ ...entry, created_at: new Date().toISOString(), local: true });
  list.sort((a, b) => a.total_ms - b.total_ms);
  writeJson(LOCAL_KEY, list.slice(0, MAX_LOCAL));
}

async function flushPending() {
  const pending = readJson(PENDING_KEY, []);
  if (!pending.length) return;
  const remaining = [];
  for (const entry of pending) {
    try {
      await postGlobal(entry);
    } catch {
      remaining.push(entry);
    }
  }
  writeJson(PENDING_KEY, remaining);
}

export async function fetchLeaderboard(limit = 10) {
  try {
    const entries = await fetchGlobal(limit);
    // The board answered — quietly flush anything we queued while offline.
    try {
      await flushPending();
    } catch {
      /* best effort */
    }
    return { source: 'global', entries, offline: false };
  } catch {
    const entries = readJson(LOCAL_KEY, []);
    return { source: 'local', entries, offline: true };
  }
}

export async function submitScore({ username, totalMs, bestLapMs, racers }) {
  const entry = {
    username: String(username || 'Rider').slice(0, 24),
    total_ms: Math.round(Number(totalMs) || 0),
    best_lap_ms: Math.round(Number(bestLapMs) || 0),
    racers: [4, 6, 8, 10].includes(Number(racers)) ? Number(racers) : 6,
  };
  recordLocal(entry); // always keep the device board honest, win or lose
  try {
    await postGlobal(entry);
    try {
      await flushPending();
    } catch {
      /* best effort */
    }
    return { ok: true, source: 'global', queued: false };
  } catch {
    const pending = readJson(PENDING_KEY, []);
    pending.push(entry);
    writeJson(PENDING_KEY, pending.slice(-20));
    return { ok: true, source: 'local', queued: true };
  }
}
