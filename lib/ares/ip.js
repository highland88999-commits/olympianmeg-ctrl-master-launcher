// ARES — IP utilities (Node). Edge-safe matching lives in ip-edge.js;
// this module adds one-way IP hashing, which needs node:crypto.
// Privacy rule: raw IPs are NEVER stored, only SHA-256(ip + salt).

import { createHash } from 'crypto';
import { cidrContains, isWhitelisted, whitelistFromEnv } from './ip-edge.js';

export { cidrContains, isWhitelisted, whitelistFromEnv };

export function hashIp(ip, salt = '') {
  const clean = String(ip || '').trim().toLowerCase();
  return createHash('sha256').update(`${salt}::${clean}`).digest('hex');
}

// Short public fingerprint for the dashboard (first 12 hex chars).
export function ipFingerprint(ipHash) {
  return String(ipHash || '').slice(0, 12);
}
