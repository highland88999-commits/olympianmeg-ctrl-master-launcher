/**
 * AEGIS Watchdog
 *
 * Passive monitoring layer. Stands on watch until an attack occurs.
 * - Allows legitimate users through untouched
 * - Intercepts AI agent attackers
 * - Classifies every actor: user | ai_attacker | suspicious | unknown
 *
 * Watchdog only takes defensive countermeasures when an attack is detected.
 * Otherwise it observes, logs, and stands ready.
 */

import { MAJOR_ATTACK_THRESHOLD } from './grid-coordinator.js';

export const CLASSIFICATION = {
  USER: 'user',
  AI_ATTACKER: 'ai_attacker',
  SUSPICIOUS: 'suspicious',
  UNKNOWN: 'unknown',
};

// Known AI agent / bot signatures (user-agent fragments, behavior patterns)
const AI_AGENT_SIGNATURES = [
  'gptbot', 'chatgpt', 'claudebot', 'anthropic', 'cohere',
  'bytespider', 'ccbot', 'google-extended', 'bard',
  'perplexitybot', 'youbot', 'dalle', 'midjourney',
  'crawl', 'spider', 'scraper', 'selenium', 'puppeteer',
  'headless', 'phantom', 'python-requests', 'curl', 'wget',
];

// Behavioral thresholds
const THRESHOLDS = {
  // Requests per minute above which a non-authenticated actor is suspicious
  RATE_SUSPICIOUS: 60,
  // Requests per minute above which a non-authenticated actor is an attacker
  RATE_ATTACKER: 300,
  // Failed auth attempts before flagging
  FAILED_AUTH_SUSPICIOUS: 5,
  FAILED_AUTH_ATTACKER: 20,
};

/**
 * Classify an incoming request.
 * @param {object} req - { ip, userAgent, path, method, ratePerMin, failedAuth, hasSession, isOwner }
 */
export function classifyActor(req = {}) {
  const {
    userAgent = '',
    ratePerMin = 0,
    failedAuth = 0,
    hasSession = false,
    isOwner = false,
  } = req;

  // Owner always passes
  if (isOwner) return CLASSIFICATION.USER;

  const ua = userAgent.toLowerCase();

  // AI agent signature in user-agent
  const hasAISignature = AI_AGENT_SIGNATURES.some(sig => ua.includes(sig));

  // Authenticated session with normal behavior = user
  if (hasSession && ratePerMin < THRESHOLDS.RATE_SUSPICIOUS && failedAuth < THRESHOLDS.FAILED_AUTH_SUSPICIOUS) {
    return CLASSIFICATION.USER;
  }

  // High-rate + AI signature = confirmed AI attacker
  if (hasAISignature && ratePerMin >= THRESHOLDS.RATE_SUSPICIOUS) {
    return CLASSIFICATION.AI_ATTACKER;
  }

  // Extreme rate regardless of signature = attacker
  if (ratePerMin >= THRESHOLDS.RATE_ATTACKER) {
    return CLASSIFICATION.AI_ATTACKER;
  }

  // Repeated failed auth = attacker
  if (failedAuth >= THRESHOLDS.FAILED_AUTH_ATTACKER) {
    return CLASSIFICATION.AI_ATTACKER;
  }

  // Moderate anomalies = suspicious (watch, don't block yet)
  if (
    hasAISignature ||
    ratePerMin >= THRESHOLDS.RATE_SUSPICIOUS ||
    failedAuth >= THRESHOLDS.FAILED_AUTH_SUSPICIOUS
  ) {
    return CLASSIFICATION.SUSPICIOUS;
  }

  return CLASSIFICATION.UNKNOWN;
}

/**
 * Watchdog observation record.
 * Lightweight — watchdog logs observations, escalates only on attack.
 */
export function observe(req = {}) {
  const classification = classifyActor(req);
  return {
    at: new Date().toISOString(),
    ip: req.ip || 'unknown',
    path: req.path || '/',
    method: req.method || 'GET',
    classification,
    // Watchdog engages only on confirmed attackers; suspicious actors are watched
    action: classification === CLASSIFICATION.AI_ATTACKER ? 'intercept' :
            classification === CLASSIFICATION.SUSPICIOUS ? 'watch' : 'allow',
  };
}

/**
 * Determine if an observation batch constitutes an attack.
 * @param {Array} observations - recent observations
 * @returns {object} { isAttack, attackerCount, severity }
 */
export function detectAttack(observations = []) {
  const attackers = observations.filter(o =>
    o.classification === CLASSIFICATION.AI_ATTACKER
  );
  const uniqueIps = new Set(attackers.map(a => a.ip)).size;

  const attackerCount = attackers.length;

  let severity = 0;
  if (attackerCount > 0) severity = 1;
  if (attackerCount >= 1000) severity = 2;
  if (attackerCount >= MAJOR_ATTACK_THRESHOLD) severity = 3; // Major attack threshold (rides the grid baseline: 10B since the 2026-10-21 expansion)

  return {
    isAttack: attackerCount > 0,
    attackerCount,
    uniqueIps,
    severity, // 0=none, 1=minor, 2=significant, 3=major
    isMajor: severity >= 3,
  };
}
