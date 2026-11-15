// ARES tests: fake bait content — every id returns inert fake content.
import { fakeBaitFor, BAIT_IDS, MOBILE_BAIT_IDS, isMobileUserAgent, AWS_EXAMPLE_ACCESS_KEY, AWS_EXAMPLE_SECRET_KEY } from './fake-bait.js';

let pass = 0;
let fail = 0;
function t(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}

// Inventory shape: 28 bait ids total, 9 of them mobile (~a third).
t('BAIT_IDS has 28 entries', BAIT_IDS.length === 28);
t('MOBILE_BAIT_IDS has 9 entries', MOBILE_BAIT_IDS.length === 9);
t('every mobile id is a bait id', MOBILE_BAIT_IDS.every((id) => BAIT_IDS.includes(id)));
t('BAIT_IDS has no duplicates', new Set(BAIT_IDS).size === BAIT_IDS.length);

// Every id returns a usable { contentType, body } pair.
for (const id of BAIT_IDS) {
  let out;
  try { out = fakeBaitFor(id); } catch { out = null; }
  t(`bait ${id} returns content`, !!out && typeof out.contentType === 'string' && out.contentType.length > 0 && typeof out.body === 'string' && out.body.length > 0);
}

// Every body carries an explicit inert marker — nothing here can be
// mistaken for a real secret, key, dump, or config.
for (const id of BAIT_IDS) {
  t(`bait ${id} body is marked fake`, /fake/i.test(fakeBaitFor(id).body));
}

// The only AWS credentials anywhere are AWS's own published example
// values — documented by AWS as non-functional.
t('env bait uses the AWS example access key', fakeBaitFor('env').body.includes(AWS_EXAMPLE_ACCESS_KEY));
t('env bait uses the AWS example secret key', fakeBaitFor('env').body.includes(AWS_EXAMPLE_SECRET_KEY));
t('aws-credentials bait uses the exact example keys', (() => {
  const b = fakeBaitFor('aws-credentials').body;
  return b.includes(`aws_access_key_id = ${AWS_EXAMPLE_ACCESS_KEY}`) && b.includes(`aws_secret_access_key = ${AWS_EXAMPLE_SECRET_KEY}`);
})());
t('example keys are exactly the AWS documented values', AWS_EXAMPLE_ACCESS_KEY === 'AKIAIOSFODNN7EXAMPLE' && AWS_EXAMPLE_SECRET_KEY === 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
for (const id of BAIT_IDS) {
  const b = fakeBaitFor(id).body;
  const otherAkia = (b.match(/AKIA[0-9A-Z]{16}/g) || []).filter((k) => k !== AWS_EXAMPLE_ACCESS_KEY);
  t(`bait ${id} has no AWS key other than the example`, otherAkia.length === 0);
}

// No real hostnames or repo paths leak into any body: every URL points
// at .example.invalid, and no body names the real site, Supabase,
// GitHub, or a repo path.
const REAL_LEAKS = ['olympusverse', 'supabase', 'github.com', 'lib/ares', 'app/api', 'olympus'];
for (const id of BAIT_IDS) {
  const b = fakeBaitFor(id).body;
  t(`bait ${id} body has no real hostname or repo path`, !REAL_LEAKS.some((s) => b.toLowerCase().includes(s)));
  const urls = b.match(/https?:\/\/[^\s"'<>]+/g) || [];
  t(`bait ${id} URLs are all .example.invalid`, urls.every((u) => u.includes('.example.invalid')));
}

// Fake keys decode to nothing real: the PEM bodies are base64 for
// "FAKE-KEY-NOT-REAL", and the htpasswd hashes carry a FAKE salt.
t('id-rsa PEM decodes to FAKE-KEY-NOT-REAL', (() => {
  const lines = fakeBaitFor('id-rsa').body.split('\n').filter((l) => /^[A-Za-z0-9+/=]+$/.test(l));
  const decoded = lines.map((l) => Buffer.from(l, 'base64').toString('utf8')).join('');
  return decoded === 'FAKE-KEY-NOT-REAL'.repeat(3);
})());
t('htpasswd hashes use a FAKE salt', fakeBaitFor('htpasswd').body.includes('$apr1$FAKEFAKE$'));

// JSON baits parse, HTML baits are HTML, binary-ish baits carry magic.
for (const id of ['api-keys', 'config-json', 'mobile-auth', 'mobile-config', 'mobile-login', 'sms-send', 'otp-verify']) {
  t(`bait ${id} is valid JSON`, (() => { try { JSON.parse(fakeBaitFor(id).body); return true; } catch { return false; } })());
}
for (const id of ['admin', 'phpinfo', 'mobile-admin']) {
  t(`bait ${id} is HTML`, fakeBaitFor(id).body.startsWith('<!doctype html>'));
}
t('backup-zip starts with the PK header', fakeBaitFor('backup-zip').body.startsWith('PK\x03\x04'));
t('db-sqlite starts with the SQLite magic', fakeBaitFor('db-sqlite').body.startsWith('SQLite format 3\x00'));
t('ds-store starts with the Bud1 magic', fakeBaitFor('ds-store').body.startsWith('Bud1'));

// Mobile variants: a mobile UA flavour exists where promised, the
// standard body is untouched for ids without one, and scoring never
// branches on UA (that is fake-bait's whole job — flavour only).
t('config-json mobile variant is mobile-flavoured', fakeBaitFor('config-json', { mobile: true }).body.includes('FAKE MOBILE APP CONFIG'));
t('config-json standard body is the server flavour', fakeBaitFor('config-json').body.includes('FAKE CONFIG'));
t('api-keys mobile variant is mobile-flavoured', fakeBaitFor('api-keys', { mobile: true }).body.includes('FAKE MOBILE SDK KEYS'));
t('env mobile variant is the mobile backend flavour', fakeBaitFor('env', { mobile: true }).body.includes('mobile backend env'));
t('ids without a mobile variant ignore the flag', fakeBaitFor('wp-config', { mobile: true }).body === fakeBaitFor('wp-config').body);
t('isMobileUserAgent spots iPhone', isMobileUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'));
t('isMobileUserAgent spots Android', isMobileUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'));
t('isMobileUserAgent says no to desktop', !isMobileUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'));
t('isMobileUserAgent says no to empty', !isMobileUserAgent('') && !isMobileUserAgent(null));

t('unknown bait id throws', (() => { try { fakeBaitFor('no-such-bait'); return false; } catch { return true; } })());

console.log(`fake-bait: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
