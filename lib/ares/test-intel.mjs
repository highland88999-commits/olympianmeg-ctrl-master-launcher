// ARES tests: local threat-intel aggregation.
import { threatLevel, topPaths, topFingerprints, trendDirection, summarize } from './intel.js';

let pass = 0;
let fail = 0;
function t(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}

const NOW = Date.now();
const mins = (m) => new Date(NOW - m * 60_000).toISOString();
const ev = (type, agoMin, path = '/wp-login.php', ip = 'a'.repeat(64)) =>
  ({ event_type: type, created_at: mins(agoMin), path, ip_hash: ip });

t('empty log is Calm at 0', (() => { const r = threatLevel([]); return r.level === 0 && r.label === 'Calm'; })());
t('single honeypot hit is Watchful', threatLevel([ev('honeypot_hit', 10)]).label === 'Watchful');
t('many recent honeypot hits become Severe', threatLevel(Array.from({ length: 8 }, (_, i) => ev('honeypot_hit', i))).label === 'Severe');
t('old events outside 24h ignored', threatLevel([ev('honeypot_hit', 60 * 25)]).level === 0);
t('level caps at 100', threatLevel(Array.from({ length: 50 }, () => ev('honeypot_hit', 5))).level === 100);
t('unknown event type counts weight 1', threatLevel([ev('weird_type', 5)]).level === 1);

const paths = [ev('scanner_path', 5, '/a'), ev('scanner_path', 6, '/b'), ev('scanner_path', 7, '/a')];
const tp = topPaths(paths);
t('topPaths ranks by count', tp[0].path === '/a' && tp[0].count === 2);
t('topPaths respects limit', topPaths(paths, 1).length === 1);
t('topPaths skips missing path', topPaths([{ event_type: 'x', created_at: mins(1) }]).length === 0);

const fps = [ev('bot_blocked', 5, '/x', 'f'.repeat(64)), ev('bot_blocked', 6, '/x', 'e'.repeat(64)), ev('bot_blocked', 7, '/x', 'f'.repeat(64))];
const tf = topFingerprints(fps);
t('topFingerprints uses 12-char fingerprint', tf[0].fingerprint === 'f'.repeat(12) && tf[0].count === 2);

t('rising trend detected', trendDirection([...Array.from({ length: 6 }, (_, i) => ev('bot_blocked', 10 + i)), ev('bot_blocked', 70)]) === 'rising');
t('falling trend detected', trendDirection([ev('bot_blocked', 5), ...Array.from({ length: 6 }, (_, i) => ev('bot_blocked', 70 + i))]) === 'falling');
t('steady when quiet', trendDirection([]) === 'steady');

const s = summarize([ev('honeypot_hit', 5, '/wp-login.php')]);
t('summarize includes level, label, trend, totals', s.level !== undefined && s.label && s.trend && s.total === 1);
t('summarize includes top paths', Array.isArray(s.topPaths) && s.topPaths.length === 1);

console.log(`intel: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
