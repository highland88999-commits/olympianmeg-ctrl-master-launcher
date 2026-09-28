// ARES tests: feature extraction (pure, deterministic).
import { extractFeatures, validateVector, vectorToObject, FEATURE_NAMES, FEATURE_VERSION } from './features.js';

let pass = 0;
let fail = 0;
function t(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}

t('feature version is v1', FEATURE_VERSION === 'v1');
t('12 features in fixed order', FEATURE_NAMES.length === 12);

const browser = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  path: '/olympus',
  method: 'GET',
  headers: { 'accept-language': 'en-US,en;q=0.9', accept: 'text/html' },
};

const clean = extractFeatures(browser);
t('clean browser vector validates', validateVector(clean.vector));
t('clean browser has no suspicious UA flag', clean.vector[0] === 0);
t('clean browser has no missing UA flag', clean.vector[1] === 0);
t('clean browser has no scanner path flag', clean.vector[2] === 0);
t('clean browser has zero missing headers', clean.vector[4] === 0);
t('path depth of /olympus is 1', clean.vector[5] === 1);
t('common method is not unusual', clean.vector[8] === 0);

const botFpInput = { userAgent: 'sqlmap/1.7.2', path: '/wp-login.php?id=1', headers: {} };
const bot = extractFeatures(botFpInput);
t('sqlmap UA flagged', bot.vector[0] === 1);
t('scanner path flagged', bot.vector[2] === 1);
t('query string flagged', bot.vector[7] === 1);
t('two missing headers counted', bot.vector[4] === 2);

const noUa = extractFeatures({ path: '/' });
t('missing UA flagged', noUa.vector[1] === 1);
t('missing UA is not suspicious UA', noUa.vector[1] === 1 && noUa.vector[0] === 0);

const trap = extractFeatures({ userAgent: 'curl/8.0', path: '/api/honeypot/wp-login', honeypotHit: true });
t('honeypot hit flagged', trap.vector[3] === 1);

const flood = extractFeatures({ ...browser, windowHits: 130, windowMax: 120 });
t('window hit ratio caps at 1', flood.vector[10] === 1);
const half = extractFeatures({ ...browser, windowHits: 60, windowMax: 120 });
t('window hit ratio is proportional', half.vector[10] === 0.5);

const strikes = extractFeatures({ ...browser, strikes: 5 });
t('strikes normalize to 0.5', strikes.vector[11] === 0.5);
const manyStrikes = extractFeatures({ ...browser, strikes: 99 });
t('strikes cap at 1', manyStrikes.vector[11] === 1);

const weird = extractFeatures({ ...browser, method: 'DELETE' });
t('unusual method flagged', weird.vector[8] === 1);

const injection = extractFeatures({ ...browser, bodySignals: ["' UNION SELECT * FROM users"] });
t('injection payload flagged', injection.vector[9] === 1);
const cleanBody = extractFeatures({ ...browser, bodySignals: ['hello world'] });
t('benign payload not flagged', cleanBody.vector[9] === 0);

const deep = extractFeatures({ ...browser, path: '/a/b/c/d/e/f/g/h/i/j/k/l/m/n' });
t('path depth caps at 12', deep.vector[5] === 12);

t('deterministic: same input, same vector', JSON.stringify(extractFeatures(botFpInput).vector) === JSON.stringify(bot.vector));
t('headers-like object works', extractFeatures({ ...browser, headers: { get: (n) => (n === 'accept-language' ? 'en' : null) } }).vector[4] === 1);

const named = vectorToObject(clean.vector);
t('vectorToObject names every feature', Object.keys(named).length === 12 && named.ua_suspicious === 0);

t('validateVector rejects wrong length', !validateVector([1, 2, 3]));
t('validateVector rejects non-numbers', !validateVector(new Array(12).fill('x')));
t('validateVector rejects NaN', !validateVector(new Array(12).fill(NaN)));
t('empty fingerprint still validates', validateVector(extractFeatures().vector));

console.log(`features: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
