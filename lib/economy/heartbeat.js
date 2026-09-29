// lib/economy/heartbeat.js
// Engagement idempotency: one accrual per user per 60-second window, keyed
// server-side from the UTC day + minute bucket. Retries, double-fires, and
// clock-skewed duplicates all collapse onto the same key.

export function heartbeatIdemKey(userId, nowMs = Date.now()) {
  const bucket = Math.floor(nowMs / 60000);
  const day = new Date(nowMs).toISOString().slice(0, 10); // UTC day
  return `engage:${userId}:${day}:${bucket}`;
}
