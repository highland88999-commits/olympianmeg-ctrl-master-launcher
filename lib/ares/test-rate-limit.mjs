// ARES tests: sliding-window rate limiter.
import { createRateLimiter } from './rate-limit.js';

let pass = 0;
let fail = 0;
function t(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}

const lim = createRateLimiter({ windowMs: 60_000, maxHits: 3 });
t('first hit allowed', lim.check('a', 1000).allowed);
t('second hit allowed', lim.check('a', 2000).allowed);
t('third hit allowed', lim.check('a', 3000).allowed);
const blocked = lim.check('a', 4000);
t('fourth hit blocked', !blocked.allowed);
t('remaining is 0 when blocked', blocked.remaining === 0);
t('retryAfterMs is positive when blocked', blocked.retryAfterMs > 0);

t('different key unaffected', lim.check('b', 4000).allowed);
const lim2 = createRateLimiter({ windowMs: 60_000, maxHits: 10 });
lim2.check('c', 1000); lim2.check('c', 2000); lim2.check('c', 61_001);
t('count reflects sliding window (oldest expired)', lim2.count('c', 61_001) === 2);
t('window slides: old hits expire', lim.check('a', 61_001).allowed);

lim.reset('a');
t('reset clears the key', lim.count('a', 61_002) === 0);

const tiny = createRateLimiter({ windowMs: 1000, maxHits: 1 });
tiny.check('x', 0);
t('boundary: hit at exactly window edge expires', tiny.check('x', 1000).allowed);

console.log(`rate-limit: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
