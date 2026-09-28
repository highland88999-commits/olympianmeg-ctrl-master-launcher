// ARES IP matching — EDGE SAFE. No Node APIs here; the middleware
// (edge runtime) imports from this file. Hashing lives in ip.js
// (Node only) because it needs node:crypto.

export function ipToInt(ip) {
  const parts = String(ip).trim().split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

export function cidrContains(cidr, ip) {
  const [base, bitsRaw] = String(cidr).split('/');
  const bits = Number(bitsRaw);
  if (!base || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const baseInt = ipToInt(base);
  const ipInt = ipToInt(ip);
  if (baseInt === null || ipInt === null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return (baseInt & mask) === (ipInt & mask);
}

// entries: array of plain IPs or CIDR strings. Localhost always friendly.
export function isWhitelisted(ip, entries = []) {
  const clean = String(ip || '').trim();
  if (!clean) return false;
  if (clean === '127.0.0.1' || clean === '::1') return true;
  for (const entry of entries) {
    const e = String(entry || '').trim();
    if (!e) continue;
    if (e.includes('/')) {
      if (cidrContains(e, clean)) return true;
    } else if (e.toLowerCase() === clean.toLowerCase()) {
      return true;
    }
  }
  return false;
}

// MILES_IP is pre-whitelisted (from the source ares_config.yaml); its
// VALUE comes from env, never from code.
export function whitelistFromEnv(env) {
  const list = [];
  const source = env || {};
  if (source.MILES_IP) list.push({ label: 'Miles', value: source.MILES_IP });
  const home = String(source.ARES_HOME_IPS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  home.forEach((ip, i) => list.push({ label: i === 0 ? 'Home' : `Home ${i + 1}`, value: ip }));
  return list;
}
