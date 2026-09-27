// ARES tests: IP matching (CIDR + whitelist) and one-way hashing.
import { hashIp, ipFingerprint, cidrContains, isWhitelisted, whitelistFromEnv } from './ip.js';

let pass = 0;
let fail = 0;
function t(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}

t('/24 contains member', cidrContains('192.168.1.0/24', '192.168.1.55'));
t('/24 excludes outsider', !cidrContains('192.168.1.0/24', '192.168.2.1'));
t('/32 matches exactly', cidrContains('10.0.0.7/32', '10.0.0.7'));
t('/32 rejects neighbor', !cidrContains('10.0.0.7/32', '10.0.0.8'));
t('/16 contains member', cidrContains('172.16.0.0/16', '172.16.200.9'));
t('invalid cidr returns false', !cidrContains('not-a-cidr', '1.2.3.4'));
t('invalid ip returns false', !cidrContains('10.0.0.0/24', '999.1.1.1'));

t('localhost always friendly', isWhitelisted('127.0.0.1', []));
t('exact match whitelisted', isWhitelisted('203.0.113.9', ['203.0.113.9']));
t('non-listed ip rejected', !isWhitelisted('203.0.113.10', ['203.0.113.9']));
t('cidr entry matches', isWhitelisted('198.51.100.44', ['198.51.100.0/24']));
t('empty ip never whitelisted', !isWhitelisted('', ['0.0.0.0/0']));
t('blank entries ignored', isWhitelisted('203.0.113.9', ['', '  ', '203.0.113.9']));

const h1 = hashIp('203.0.113.9', 'salt1');
const h2 = hashIp('203.0.113.9', 'salt1');
const h3 = hashIp('203.0.113.9', 'salt2');
const h4 = hashIp('203.0.113.10', 'salt1');
t('hash is deterministic', h1 === h2);
t('hash is 64 hex chars', /^[0-9a-f]{64}$/.test(h1));
t('salt changes hash', h1 !== h3);
t('different ip different hash', h1 !== h4);
t('hash never contains the raw ip', !h1.includes('203.0.113.9'));
t('fingerprint is 12 chars', ipFingerprint(h1).length === 12);

const wl = whitelistFromEnv({ MILES_IP: '198.51.100.7', ARES_HOME_IPS: '203.0.113.1, 203.0.113.2' });
t('MILES_IP is pre-whitelisted with label', wl.some((e) => e.label === 'Miles' && e.value === '198.51.100.7'));
t('home ips parsed', wl.filter((e) => e.label.startsWith('Home')).length === 2);
t('whitelist entries match via isWhitelisted', isWhitelisted('198.51.100.7', wl.map((e) => e.value)));
const wlEmpty = whitelistFromEnv({});
t('no env means no entries', wlEmpty.length === 0);

console.log(`ip: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
