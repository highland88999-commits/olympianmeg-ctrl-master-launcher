// lib/phone-home/steps.ts — Pure helpers for the /phone-home step counter.
// DOM-free on purpose: every export here is covered by tests/phone-home-steps.test.mjs.
// Supabase I/O lives in the page component; localStorage queue serialization
// helpers here take storage as an argument so the same logic is testable.

/** One row of the public.user_steps table. */
export interface StepRow {
  user_id: string;
  step_date: string; // 'YYYY-MM-DD'
  steps: number;
  updated_at?: string;
}

/** A step entry waiting in the offline queue on this device. */
export interface QueuedStepEntry {
  user_id: string;
  step_date: string; // 'YYYY-MM-DD'
  steps: number;
  queuedAt: string; // ISO timestamp — latest write wins per (user, date)
}

/** localStorage key for the offline step-entry queue. */
export const STEPS_QUEUE_KEY = 'phone_home_steps_queue';

/** Cap so the queue can't grow without bound while offline. */
export const STEPS_QUEUE_MAX = 50;

/**
 * Local calendar-day key 'YYYY-MM-DD' (user's timezone — "today" means
 * their today, not UTC's).
 */
export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Validate a manual step entry. Returns a whole non-negative integer, or
 * null when the input is not a usable step count. No negatives, no NaN,
 * no fake filler values — invalid input is rejected, not coerced.
 */
export function clampSteps(input: unknown): number | null {
  if (typeof input === 'string' && input.trim() === '') return null;
  const n = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(n) || n < 0) return null;
  const whole = Math.floor(n);
  return whole;
}

/** Sum of the steps column. Empty list → 0. */
export function totalSteps(rows: Array<{ steps: number }>): number {
  return rows.reduce((sum, r) => sum + (Number.isFinite(r.steps) ? r.steps : 0), 0);
}

/**
 * Today's entry from the user's rows (or null when nothing logged yet).
 * Pure helper around the PK semantics of user_steps: one row per (user, date).
 */
export function findTodayEntry(rows: StepRow[], date: string): StepRow | null {
  return rows.find((r) => r.step_date === date) ?? null;
}

/**
 * Merge a freshly logged entry into an in-memory row list using the same
 * upsert semantics as the database PK: same (user, date) → replaced.
 */
export function upsertLocal(rows: StepRow[], entry: StepRow): StepRow[] {
  const idx = rows.findIndex(
    (r) => r.user_id === entry.user_id && r.step_date === entry.step_date
  );
  if (idx === -1) return [...rows, entry];
  const next = rows.slice();
  next[idx] = entry;
  return next;
}

/**
 * Add an entry to the offline queue. Same (user, date) → the latest write
 * wins (queuedAt decides). Queue is capped at STEPS_QUEUE_MAX, oldest-first
 * dropped when full.
 */
export function mergeQueueEntry(
  queue: QueuedStepEntry[],
  entry: QueuedStepEntry
): QueuedStepEntry[] {
  const rest = queue.filter(
    (q) => !(q.user_id === entry.user_id && q.step_date === entry.step_date)
  );
  const merged = [...rest, entry].sort((a, b) =>
    a.queuedAt < b.queuedAt ? -1 : a.queuedAt > b.queuedAt ? 1 : 0
  );
  while (merged.length > STEPS_QUEUE_MAX) merged.shift();
  return merged;
}

/** Read the queue from a storage-like object (localStorage shape). */
export function readQueue(storage: {
  getItem(key: string): string | null;
}): QueuedStepEntry[] {
  try {
    const raw = storage.getItem(STEPS_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) =>
        e &&
        typeof e.user_id === 'string' &&
        typeof e.step_date === 'string' &&
        Number.isFinite(e.steps) &&
        e.steps >= 0 &&
        typeof e.queuedAt === 'string'
    );
  } catch {
    return [];
  }
}

/** Persist the queue to a storage-like object. */
export function writeQueue(
  storage: { setItem(key: string, value: string): void },
  queue: QueuedStepEntry[]
): void {
  storage.setItem(STEPS_QUEUE_KEY, JSON.stringify(queue));
}
