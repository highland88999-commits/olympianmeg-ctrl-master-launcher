// lib/tetrus/leaderboard.js
// Tetrus leaderboard client: tries the global board first, degrades
// gracefully to a per-device board when Supabase is unreachable — the page
// must never crash on that.
//
// Contract with the page:
//   fetchLeaderboard() -> { source: 'global'|'local', entries: [...], offline }
//   submitScore({ username, score, level, lines }) -> { ok, source, queued }
// Queued scores are flushed the next time the global board answers.

'use client';

const LOCAL_KEY = 'tetrus_local_board';
const PENDING_KEY = 'tetrus_pending_scores';
const NAME_KEY = 'tetrus_name';
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
  const res = await fetch(`/api/tetrus/leaderboard?limit=${limit}`, {
    headers: { 'Cache-Control': 'no-store' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'leaderboard failed');
  return data.entries || [];
}

async function postGlobal(payload) {
  const res = await fetch('/api/tetrus/leaderboard', {
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
  list.sort((a, b) => b.score - a.score);
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

export async function submitScore({ username, score, level, lines }) {
  const entry = {
    username: String(username || 'Mason').slice(0, 24),
    score: Math.floor(Number(score) || 0),
    level: Math.max(1, Math.min(100, Math.floor(Number(level) || 1))),
    lines: Math.max(0, Math.floor(Number(lines) || 0)),
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
