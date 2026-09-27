// ARES Sentinel — bot and scraper heuristics (pure logic, no I/O).
// Inspects request signals and returns a verdict: { score, reasons[], isBot }.
// Higher score = more bot-like. Thresholds live in config.js.

const SUSPICIOUS_UA_PATTERNS = [
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /nessus/i,
  /openvas/i,
  /acunetix/i,
  /netsparker/i,
  /wpscan/i,
  /dirbuster/i,
  /gobuster/i,
  /ffuf/i,
  /hydra/i,
  /metasploit/i,
  /zmeu/i,            // Mirai-family scanner
  /mirai/i,
  /zgrab/i,
  /censys/i,
  /shodan/i,
  /binaryedge/i,
  /stretchoid/i,
  /python-requests/i, // default UA of scripts (not browsers)
  /curl/i,
  /wget/i,
  /libwww-perl/i,
  /httpclient/i,
  /go-http-client/i,
  /java\/\d/i,
  /phantomjs/i,
  /headlesschrome/i,  // headless without the real-Chrome signals
];

// Paths scanners probe that a normal visitor never touches.
const SCANNER_PATHS = [
  '/wp-login.php',
  '/wp-admin',
  '/xmlrpc.php',
  '/.env',
  '/.git/config',
  '/.git/HEAD',
  '/phpmyadmin',
  '/phpMyAdmin',
  '/admin.php',
  '/administrator',
  '/config.php',
  '/.aws/credentials',
  '/server-status',
  '/actuator/health',
  '/.well-known/security.txt', // note: legit scanners use this too; low weight
];

const SCANNER_PATH_WEIGHT = 30;
const SCANNER_UA_WEIGHT = 45;
const MISSING_HEADERS_WEIGHT = 15;
const BOT_THRESHOLD = 40;

function isSuspiciousUA(ua) {
  if (!ua) return { hit: true, pattern: 'missing-user-agent' };
  for (const pattern of SUSPICIOUS_UA_PATTERNS) {
    if (pattern.test(ua)) return { hit: true, pattern: String(pattern) };
  }
  return { hit: false, pattern: null };
}

function isScannerPath(path) {
  if (!path) return false;
  const lower = path.toLowerCase();
  return SCANNER_PATHS.some((p) => lower === p || lower.startsWith(p + '/') || lower.startsWith(p + '?'));
}

// Browsers always send Accept-Language; most naive bots do not.
function missingBrowserHeaders(headers) {
  const missing = [];
  const get = (name) => {
    if (typeof headers.get === 'function') return headers.get(name);
    return headers[name] ?? headers[name.toLowerCase()];
  };
  if (!get('accept-language')) missing.push('accept-language');
  if (!get('accept')) missing.push('accept');
  return missing;
}

export function scoreRequest({ userAgent, path, headers = {} }) {
  const reasons = [];
  let score = 0;

  const uaCheck = isSuspiciousUA(userAgent);
  if (uaCheck.hit) {
    score += SCANNER_UA_WEIGHT;
    reasons.push(`suspicious-user-agent (${uaCheck.pattern})`);
  }

  if (isScannerPath(path)) {
    score += SCANNER_PATH_WEIGHT;
    reasons.push(`scanner-path (${path})`);
  }

  const missing = missingBrowserHeaders(headers);
  if (missing.length > 0 && !uaCheck.hit) {
    // Only count missing headers when the UA was not already flagged,
    // so one bot does not get double counted for the same visit.
    score += MISSING_HEADERS_WEIGHT;
    reasons.push(`missing-headers (${missing.join(', ')})`);
  }

  return { score, reasons, isBot: score >= BOT_THRESHOLD };
}

export { BOT_THRESHOLD, SCANNER_PATHS };
