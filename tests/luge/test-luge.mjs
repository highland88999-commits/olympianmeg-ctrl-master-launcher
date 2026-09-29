// tests/luge/test-luge.mjs
// Headless tests for the Luge module. Run: node tests/luge/test-luge.mjs
// (from the repo root). No browser, no network.
import { readFileSync } from 'fs';
import {
  ownsArsenal,
  isSledLocked,
  decideClaim,
  decideWebhookEvent,
  arsenalGrantRows,
  LUGE_PREMIUM_IDS,
  LUGE_PREMIUM_COUNT,
} from '../../lib/luge/logic.js';
import { LUGE_SLEDS, LUGE_COURSES } from '../../lib/luge_data.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- dynamic premium count ---
t('premium count is 26 (not hardcoded elsewhere)', LUGE_PREMIUM_COUNT === 26);
t('premium ids length matches count', LUGE_PREMIUM_IDS.length === LUGE_PREMIUM_COUNT);
t('premium ids match a fresh filter of the sled list',
  JSON.stringify(LUGE_PREMIUM_IDS) ===
  JSON.stringify(LUGE_SLEDS.filter((s) => s.type === 'premium').map((s) => s.id)));
t('every premium id is unique', new Set(LUGE_PREMIUM_IDS).size === LUGE_PREMIUM_IDS.length);
t('exactly 2 generic sleds exist', LUGE_SLEDS.filter((s) => s.type === 'generic').length === 2);
t('20 courses defined', LUGE_COURSES.length === 20);

// --- hull texture wiring ---
const HULL_SLEDS = { g1: 'hull-g1.webp', p1: 'hull-p1.webp', p2: 'hull-p2.webp', p3: 'hull-p3.webp', p17: 'hull-p17.webp', p26: 'hull-p26.webp' };
for (const [id, file] of Object.entries(HULL_SLEDS)) {
  const sled = LUGE_SLEDS.find((s) => s.id === id);
  t(`sled ${id} has hull texture ${file}`, !!sled && sled.hull === `/textures/luge/${file}`);
}
t('every sled has a hull texture wired',
  LUGE_SLEDS.every((s) => s.hull === `/textures/luge/hull-${s.id}.webp`));
t('hull count matches sled count',
  LUGE_SLEDS.filter((s) => s.hull).length === LUGE_SLEDS.length);

// --- ownsArsenal ---
t('ownsArsenal: full set -> true', ownsArsenal(LUGE_PREMIUM_IDS) === true);
t('ownsArsenal: missing one -> false',
  ownsArsenal(LUGE_PREMIUM_IDS.slice(1)) === false);
t('ownsArsenal: empty -> false', ownsArsenal([]) === false);
t('ownsArsenal: extra ids are fine',
  ownsArsenal([...LUGE_PREMIUM_IDS, 'g1', 'bogus']) === true);
t('ownsArsenal: null-safe', ownsArsenal(null) === false);

// --- isSledLocked ---
const g1 = LUGE_SLEDS.find((s) => s.id === 'g1');
const p1 = LUGE_SLEDS.find((s) => s.id === 'p1');
t('generic sled never locked', isSledLocked(g1, []) === false);
t('premium locked when unowned', isSledLocked(p1, []) === true);
t('premium unlocked when owned', isSledLocked(p1, ['p1']) === false);
t('other premium still locked', isSledLocked(LUGE_SLEDS.find((s) => s.id === 'p2'), ['p1']) === true);

// --- decideClaim ---
t('claim: full ownership, not redeemed -> ok',
  decideClaim({ ownedSledIds: LUGE_PREMIUM_IDS, alreadyRedeemed: false }).ok === true);
const partial = decideClaim({ ownedSledIds: LUGE_PREMIUM_IDS.slice(0, 25), alreadyRedeemed: false });
t('claim: missing a sled -> 403', partial.ok === false && partial.status === 403);
t('claim: 403 message names the counts', /25 of 26/.test(partial.error));
const dup = decideClaim({ ownedSledIds: LUGE_PREMIUM_IDS, alreadyRedeemed: true });
t('claim: already redeemed -> 409', dup.ok === false && dup.status === 409);
t('claim: 409 message mentions one per rider', /One per rider/.test(dup.error));

// --- decideWebhookEvent ---
t('webhook: new event is not a duplicate',
  decideWebhookEvent([], 'evt_123').duplicate === false);
t('webhook: seen event is a duplicate',
  decideWebhookEvent(['evt_123'], 'evt_123').duplicate === true);
t('webhook: missing event id errors',
  decideWebhookEvent([], '').ok === false);

// --- arsenalGrantRows ---
const rows = arsenalGrantRows('user-abc');
t('grant rows cover every premium sled', rows.length === LUGE_PREMIUM_COUNT);
t('grant rows carry the user id', rows.every((r) => r.user_id === 'user-abc'));
t('grant rows cover all premium ids',
  LUGE_PREMIUM_IDS.every((id) => rows.some((r) => r.sled_id === id)));

// --- server price is the confirmed $129 (single source of truth) ---
import { LUGE_ARSENAL_PRICE_USD } from '../../lib/luge/logic.js';
t('arsenal price is the confirmed $129', LUGE_ARSENAL_PRICE_USD === 129);
const logicSrc = readFileSync('lib/luge/logic.js', 'utf8');
t('price comment records the confirmed price math',
  /Hoodie lands at \$72 CAD/.test(logicSrc));

// --- audit: banned patterns must not ship ---
const pageSrc = readFileSync('app/luge/page.tsx', 'utf8');
t('page: no telemetry', !/central_telemetry/.test(pageSrc));
t('page: no hardcoded fulfillment email', !/stakeme10000@gmail\.com/.test(pageSrc));
t('page: no fake store copy', !/STORE CONNECTION OFFLINE/.test(pageSrc));
t('page: no dev toggle', !/DEV: TOGGLE/.test(pageSrc));
t('page: no innerHTML auth hack', !/document\.body\.innerHTML/.test(pageSrc));
t('page: bloom restrained to 0.7', /intensity=\{0\.7\}/.test(pageSrc));
t('page: no hardcoded 24-skin count', !/24 premium/i.test(pageSrc) || /LUGE_PREMIUM_COUNT/.test(pageSrc));
const claimSrc = readFileSync('app/api/luge/claim/route.js', 'utf8');
t('claim route: email only from env', /process\.env\.LUGE_FULFILLMENT_EMAIL/.test(claimSrc) && !/stakeme10000/.test(claimSrc));
const sqlSrc = readFileSync('supabase/luge.sql', 'utf8');
t('sql: three tables defined',
  /create table if not exists public\.luge_inventory/.test(sqlSrc) &&
  /create table if not exists public\.luge_stripe_events/.test(sqlSrc) &&
  /create table if not exists public\.luge_redemptions/.test(sqlSrc));
t('sql: RLS enabled on all three',
  (sqlSrc.match(/enable row level security/g) || []).length === 3);

// --- hull wrap assets resolve (match OG Luge-Refuge livery descriptions) ---
import { existsSync, statSync } from 'fs';
const RECREATED_FROM_DESCRIPTION = ['hull-g2.webp', 'hull-p3.webp', 'hull-p11.webp'];
for (const sled of LUGE_SLEDS) {
  const rel = `public${sled.hull}`; // sled.hull is '/textures/luge/<file>'
  t(`wrap asset exists on disk: ${sled.id} -> ${rel}`, existsSync(rel));
  if (existsSync(rel)) {
    const buf = readFileSync(rel);
    const isWebp = buf.length > 12 &&
      buf.subarray(0, 4).toString() === 'RIFF' &&
      buf.subarray(8, 12).toString() === 'WEBP';
    t(`wrap is a valid webp: ${sled.id}`, isWebp);
    t(`wrap is non-trivial size: ${sled.id}`, buf.length > 20_000);
  }
}
const lugeDataSrc = readFileSync('lib/luge_data.js', 'utf8');
t('luge_data: hull-wrap provenance block present',
  /Hull-wrap provenance/.test(lugeDataSrc));
for (const f of RECREATED_FROM_DESCRIPTION) {
  t(`luge_data: labels ${f} as recreated-from-description`,
    lugeDataSrc.includes(f) && /recreated/i.test(lugeDataSrc));
}
t('wrap generator script present (reproducible recreations)',
  existsSync('scripts/gen-luge-wraps.py'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
