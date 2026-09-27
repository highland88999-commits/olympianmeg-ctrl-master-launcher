// ARES tests: bot/scraper heuristics.
import { scoreRequest, BOT_THRESHOLD } from './heuristics.js';

let pass = 0;
let fail = 0;
function t(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}

const realBrowser = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  path: '/',
  headers: { 'accept-language': 'en-US,en;q=0.9', accept: 'text/html' },
};

t('real mobile browser is not a bot', !scoreRequest(realBrowser).isBot);
t('real browser score is 0', scoreRequest(realBrowser).score === 0);

t('sqlmap UA is a bot', scoreRequest({ ...realBrowser, userAgent: 'sqlmap/1.7.2' }).isBot);
t('nikto UA is a bot', scoreRequest({ ...realBrowser, userAgent: 'Nikto/2.1.6' }).isBot);
t('curl UA is a bot', scoreRequest({ ...realBrowser, userAgent: 'curl/8.0.1' }).isBot);
t('python-requests UA is a bot', scoreRequest({ ...realBrowser, userAgent: 'python-requests/2.31.0' }).isBot);
t('zmeu scanner is a bot', scoreRequest({ ...realBrowser, userAgent: 'ZmEu' }).isBot);
t('go-http-client is a bot', scoreRequest({ ...realBrowser, userAgent: 'Go-http-client/1.1' }).isBot);

t('wp-login.php path scores 30 and names the path', (() => { const r = scoreRequest({ ...realBrowser, path: '/wp-login.php' }); return r.score === 30 && r.reasons.some((x) => x.includes('/wp-login.php')); })());
t('.env path scores 30', scoreRequest({ ...realBrowser, path: '/.env' }).score === 30);
t('.git/config path scores 30', scoreRequest({ ...realBrowser, path: '/.git/config' }).score === 30);
t('scanner path plus bot UA crosses the threshold', scoreRequest({ ...realBrowser, userAgent: 'curl/8.0.1', path: '/wp-login.php' }).isBot);
t('scanner path reasons mention the path', scoreRequest({ ...realBrowser, path: '/xmlrpc.php' }).reasons.some((r) => r.includes('/xmlrpc.php')));

t('missing UA is flagged', scoreRequest({ ...realBrowser, userAgent: '' }).isBot);
t('missing UA reason names it', scoreRequest({ ...realBrowser, userAgent: null }).reasons.some((r) => r.includes('missing-user-agent')));

const noHeaders = { userAgent: 'SomeCustomApp/1.0', path: '/', headers: {} };
const rNoHeaders = scoreRequest(noHeaders);
t('missing browser headers add score but stay under threshold alone', rNoHeaders.score === 15 && !rNoHeaders.isBot);

t('reasons array is non-empty for bots', scoreRequest({ ...realBrowser, userAgent: 'curl/8.0.1' }).reasons.length > 0);
t('threshold constant is sane', BOT_THRESHOLD === 40);
t('case-insensitive UA match', scoreRequest({ ...realBrowser, userAgent: 'CURL/8.0.1' }).isBot);

console.log(`heuristics: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
