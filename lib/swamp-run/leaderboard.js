// lib/swamp-run/leaderboard.js
// Swamp Run leaderboard client: tries the global board first, degrades
// gracefully to a per-device board when Supabase is unreachable (the Brain
// connector is currently down — the page must never crash on that).
//
// Contract with the page:
//   fetchLeaderboard() -> { source: 'global'|'local', entries: [...], offline }
//   submitScore({ username, seconds, distance }) -> { ok, source, queued }
// The score itself (seconds x distance) is computed server-side shape —
// computeScore lives in lib/swamp-run/board.js so both sides agree.
// Queued scores are flushed the next time the global board answers.

'use client';

import { computeScore } from './board';

const LOCAL_KEY = 'swamp_run_local_board';
const PENDING_KEY = 'swamp_run_pending_scores';
const NAME_KEY = 'swamp_run_name';
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
  const res = await fetch(`/api/swamp-run/leaderboard?limit=${limit}`, {
    headers: { 'Cache-Control': 'no-store' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'leaderboard failed');
  return data.entries || [];
}

async function postGlobal(payload) {
  const res = await fetch('/api/swamp-run/leaderboard', {
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

export async function submitScore({ username, seconds, distance }) {
  const entry = {
    username: String(username || 'Swamp Rat').slice(0, 24),
    seconds: Math.max(0, Math.floor(Number(seconds) || 0)),
    distance: Math.max(0, Math.floor(Number(distance) || 0)),
  };
  entry.score = computeScore(entry.seconds, entry.distance);
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
