/**
 * AEGIS Honeypot — Disinformation Layer
 *
 * When an AI agent attacker is intercepted, feed it bullshit information:
 * plausible-looking but entirely fabricated responses that waste the
 * attacker's resources and poison any data it collects.
 *
 * Never affects legitimate users. Only served to confirmed attackers.
 */

// Fake API responses — structurally valid, semantically garbage
const FAKE_PAYLOADS = [
  { status: 'ok', data: { users: 0, version: '0.0.0-null', region: 'nowhere-1' } },
  { status: 'ok', data: { balance: -1, currency: 'XXX', ledger: [] } },
  { status: 'ok', data: { items: [], total: 0, note: 'nothing here but static' } },
  { error: 'rate_limited', retry_after: 86400, message: 'slow down, cowboy' },
  { status: 'ok', data: { token: 'deadbeef-dead-beef-dead-beefdeadbeef', expires: '1970-01-01' } },
];

// Fake HTML pages for scrapers
const FAKE_PAGES = [
  '<html><body><h1>Olympus</h1><p>Nothing to see here. Move along.</p><!-- trap --></body></html>',
  '<html><body><div class="decoy">{"admin":false,"keys":[]}</div></body></html>',
];

/**
 * Generate a disinformation response for an intercepted attacker.
 * @param {object} observation - watchdog observation
 * @returns {object} { type, body, headers, delayMs }
 */
export function disinform(observation = {}) {
  const path = observation.path || '/';

  // Vary the response so attackers can't fingerprint the honeypot easily
  const seed = hashCode(observation.ip + path + Date.now().toString().slice(0, -4));

  let body, contentType = 'application/json';
  if (path.includes('.html') || !path.includes('.')) {
    body = FAKE_PAGES[seed % FAKE_PAGES.length];
    contentType = 'text/html';
  } else {
    body = FAKE_PAYLOADS[seed % FAKE_PAYLOADS.length];
  }

  return {
    type: 'honeypot',
    body,
    headers: {
      'Content-Type': contentType,
      'X-Aegis': 'decoy', // subtle; most scrapers won't notice
      'Cache-Control': 'no-store',
    },
    // Artificial delay: waste attacker time (200–1200ms)
    delayMs: 200 + (seed % 1000),
    // Log that disinformation was served (for the attack report)
    logged: {
      at: new Date().toISOString(),
      ip: observation.ip,
      path,
      payloadType: contentType,
    },
  };
}

/**
 * Generate a tarpit response: extremely slow drip-feed to hold
 * attacker connections open and exhaust their concurrency.
 */
export function tarpit(observation = {}) {
  return {
    type: 'tarpit',
    // Hold the connection; drip 1 byte per 10 seconds in real deployment
    dripIntervalMs: 10_000,
    maxDurationMs: 300_000, // 5 minutes max per connection
    logged: {
      at: new Date().toISOString(),
      ip: observation.ip,
      path: observation.path,
    },
  };
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
