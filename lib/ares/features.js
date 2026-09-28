// ARES feature extraction — pure functions, no I/O, edge-safe.
// Turns a request fingerprint into a fixed numeric feature vector that a
// future classifier can be trained on. Versioned: bump FEATURE_VERSION
// whenever the vector layout changes so training data stays comparable.
//
// Fingerprint fields (all optional):
//   userAgent, path, method, headers (Headers-like or plain object),
//   bodySignals (string or array of strings, e.g. scanned payload text),
//   honeypotHit (bool), windowHits, windowMax (rate window counters),
//   strikes (prior strike count for this visitor)

export const FEATURE_VERSION = 'v1';

// Fixed order. Never reorder without bumping FEATURE_VERSION.
export const FEATURE_NAMES = [
  'ua_suspicious',      // 0/1 — UA matches a known scanner/script pattern
  'ua_missing',         // 0/1 — no user-agent at all
  'scanner_path',       // 0/1 — path is a known probe target
  'honeypot_hit',       // 0/1 — the request tripped a honeypot trap
  'missing_headers',    // 0-2 — count of missing browser headers
  'path_depth',         // int — URL segment count (capped)
  'path_length_norm',   // 0-1 — path length / 200, capped
  'has_query',          // 0/1 — URL carries a query string
  'method_unusual',     // 0/1 — method is not GET/POST/HEAD/OPTIONS
  'body_suspicious',    // 0/1 — payload shows injection patterns
  'window_hit_ratio',   // 0-1 — windowHits / windowMax, capped
  'strikes_norm',       // 0-1 — strikes / 10, capped
];

const UA_PATTERNS = [
  /sqlmap/i, /nikto/i, /nmap/i, /masscan/i, /nessus/i, /openvas/i,
  /acunetix/i, /netsparker/i, /wpscan/i, /dirbuster/i, /gobuster/i,
  /ffuf/i, /hydra/i, /metasploit/i, /zmeu/i, /mirai/i, /zgrab/i,
  /censys/i, /shodan/i, /binaryedge/i, /stretchoid/i, /python-requests/i,
  /curl/i, /wget/i, /libwww-perl/i, /httpclient/i, /go-http-client/i,
  /java\/\d/i, /phantomjs/i, /headlesschrome/i,
];

const SCANNER_PATHS = [
  '/wp-login.php', '/wp-admin', '/xmlrpc.php', '/.env', '/.git/config',
  '/.git/HEAD', '/phpmyadmin', '/admin.php', '/administrator',
  '/config.php', '/.aws/credentials', '/server-status', '/actuator/health',
];

const BODY_PATTERNS = [
  /union\s+select/i, /drop\s+table/i, /<script/i, /javascript:/i,
  /\.\.\/\.\./, /etc\/passwd/i, /\$\{.*\}/, /__proto__/i,
];

const COMMON_METHODS = new Set(['GET', 'POST', 'HEAD', 'OPTIONS']);

function headerGet(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

function isScannerPath(path) {
  if (!path) return false;
  const lower = String(path).toLowerCase().split('?')[0];
  return SCANNER_PATHS.some((p) => lower === p || lower.startsWith(p + '/'));
}

export function extractFeatures(fp = {}) {
  const ua = fp.userAgent || '';
  const path = String(fp.path || '/');
  const vector = new Array(FEATURE_NAMES.length).fill(0);

  // 0: ua_suspicious
  if (ua && UA_PATTERNS.some((re) => re.test(ua))) vector[0] = 1;
  // 1: ua_missing
  if (!ua) vector[1] = 1;
  // 2: scanner_path
  if (isScannerPath(path)) vector[2] = 1;
  // 3: honeypot_hit
  if (fp.honeypotHit) vector[3] = 1;
  // 4: missing_headers (accept-language, accept)
  let missing = 0;
  if (!headerGet(fp.headers, 'accept-language')) missing++;
  if (!headerGet(fp.headers, 'accept')) missing++;
  vector[4] = missing;
  // 5: path_depth (capped at 12)
  vector[5] = Math.min(12, path.split('?')[0].split('/').filter(Boolean).length);
  // 6: path_length_norm
  vector[6] = Math.min(1, path.length / 200);
  // 7: has_query
  if (path.includes('?')) vector[7] = 1;
  // 8: method_unusual
  const method = String(fp.method || 'GET').toUpperCase();
  if (!COMMON_METHODS.has(method)) vector[8] = 1;
  // 9: body_suspicious
  const bodyText = Array.isArray(fp.bodySignals)
    ? fp.bodySignals.join('\n')
    : String(fp.bodySignals || '');
  if (bodyText && BODY_PATTERNS.some((re) => re.test(bodyText))) vector[9] = 1;
  // 10: window_hit_ratio
  const max = Number(fp.windowMax) || 0;
  vector[10] = max > 0 ? Math.min(1, (Number(fp.windowHits) || 0) / max) : 0;
  // 11: strikes_norm
  vector[11] = Math.min(1, (Number(fp.strikes) || 0) / 10);

  return { version: FEATURE_VERSION, names: FEATURE_NAMES, vector };
}

// Named-object view of a vector (handy for the JSONL export).
export function vectorToObject(vector) {
  const obj = {};
  FEATURE_NAMES.forEach((name, i) => { obj[name] = vector[i]; });
  return obj;
}

export function validateVector(vector) {
  return (
    Array.isArray(vector) &&
    vector.length === FEATURE_NAMES.length &&
    vector.every((v) => typeof v === 'number' && Number.isFinite(v))
  );
}
