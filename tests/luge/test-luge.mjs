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
  courseTopSpeed,
  minRunMs,
  RUN_CHEAT_MARGIN,
  MAX_RUN_MS,
  validateRun,
  courseCompletionStatus,
  decideRewardEligibility,
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
t('sql: four luge tables defined',
  /create table if not exists public\.luge_inventory/.test(sqlSrc) &&
  /create table if not exists public\.luge_stripe_events/.test(sqlSrc) &&
  /create table if not exists public\.luge_redemptions/.test(sqlSrc) &&
  /create table if not exists public\.luge_course_completions/.test(sqlSrc));
t('sql: RLS enabled on all four',
  (sqlSrc.match(/enable row level security/g) || []).length === 4);
t('sql: completion PK is (user_id, course_id)',
  /primary key \(user_id, course_id\)/.test(sqlSrc));
t('sql: completions get an owner-read policy only',
  /luge_course_completions_owner_read/.test(sqlSrc) && /for select/.test(sqlSrc));
t('sql: redemptions track reward/size/order',
  /add column if not exists reward/.test(sqlSrc) &&
  /add column if not exists size/.test(sqlSrc) &&
  /add column if not exists store_order_id/.test(sqlSrc));
t('sql: anti-backfill rule written down', /backfill/i.test(sqlSrc));

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

// --- free-hoodie reward chain (Merlin 2026-09-29): complete ALL 20 courses
// AND own the Complete Arsenal -> one free hoodie. Entirely separate from
// the Valkyrie referral program. Only runs after launch count — no backfills.
const ALL_COURSE_IDS = LUGE_COURSES.map((c) => c.id);
const ALL_PREMIUM = LUGE_PREMIUM_IDS.slice();

// Run anti-cheat: the game's own physics is the floor; a client flag
// alone can never qualify.
t('run: unknown course rejected (400)',
  validateRun({ courseId: 999, runMs: 60000, sledId: 'g1', ownedSledIds: [] }).status === 400);
t('run: unknown sled rejected (400)',
  validateRun({ courseId: 1, runMs: 60000, sledId: 'ghost', ownedSledIds: [] }).status === 400);
t('run: unowned premium sled rejected (403)',
  validateRun({ courseId: 1, runMs: 60000, sledId: 'p1', ownedSledIds: [] }).status === 403);
t('run: owned premium sled accepted',
  validateRun({ courseId: 1, runMs: 60000, sledId: 'p1', ownedSledIds: ['p1'] }).ok === true);
t('run: free sled needs no ownership',
  validateRun({ courseId: 1, runMs: 60000, sledId: 'g1', ownedSledIds: [] }).ok === true);
t('run: zero time rejected (400)',
  validateRun({ courseId: 1, runMs: 0, sledId: 'g1', ownedSledIds: [] }).status === 400);
t('run: NaN time rejected (400)',
  validateRun({ courseId: 1, runMs: NaN, sledId: 'g1', ownedSledIds: [] }).status === 400);
t('run: absurd time rejected (400)',
  validateRun({ courseId: 1, runMs: MAX_RUN_MS + 1, sledId: 'g1', ownedSledIds: [] }).status === 400);
const cheatFloor = minRunMs(LUGE_COURSES[0]) * RUN_CHEAT_MARGIN;
t('run: impossible time rejected (422)',
  validateRun({ courseId: 1, runMs: Math.floor(cheatFloor) - 1, sledId: 'g1', ownedSledIds: [] }).status === 422);
t('run: bare client flag cannot qualify',
  validateRun({ courseId: 1, sledId: 'g1', ownedSledIds: [] }).ok === false);
t('run: physics floor is finite for every course',
  LUGE_COURSES.every((c) => Number.isFinite(minRunMs(c)) && minRunMs(c) > 0) &&
  LUGE_COURSES.every((c) => Number.isFinite(courseTopSpeed(c)) && courseTopSpeed(c) > 0));

// Honest x/20 progress — never claims everything from one run.
const pNone = courseCompletionStatus([]);
t('progress: starts at 0 of 20', pNone.completed === 0 && pNone.total === 20 && !pNone.complete);
const pPartial = courseCompletionStatus([1, 2, 3]);
t('progress: honest x/20', pPartial.completed === 3 && pPartial.total === 20 &&
  !pPartial.complete && pPartial.missing.length === 17);
const pFull = courseCompletionStatus(ALL_COURSE_IDS);
t('progress: all 20 complete', pFull.complete === true && pFull.missing.length === 0);

// Reward eligibility is always server-derived.
t('reward: double claim refused (409)',
  decideRewardEligibility({ completedCourseIds: ALL_COURSE_IDS, ownedSledIds: ALL_PREMIUM, alreadyRedeemed: true }).status === 409);
t('reward: missing courses refused (403)',
  decideRewardEligibility({ completedCourseIds: [1], ownedSledIds: ALL_PREMIUM, alreadyRedeemed: false }).status === 403);
t('reward: missing sleds refused (403)',
  decideRewardEligibility({ completedCourseIds: ALL_COURSE_IDS, ownedSledIds: ['p1'], alreadyRedeemed: false }).status === 403);
t('reward: carries the progress breakdown',
  decideRewardEligibility({ completedCourseIds: [1], ownedSledIds: ALL_PREMIUM, alreadyRedeemed: false }).courses.completed === 1);
t('reward: fully eligible',
  decideRewardEligibility({ completedCourseIds: ALL_COURSE_IDS, ownedSledIds: ALL_PREMIUM, alreadyRedeemed: false }).ok === true);

// --- route/source audits: server proof, all-map checks, reward store mode ---
const completeSrc = readFileSync('app/api/luge/complete/route.js', 'utf8');
t('complete route: validates runs server-side', /validateRun/.test(completeSrc));
t('complete route: upserts with (user_id, course_id) guard', /onConflict: 'user_id,course_id'/.test(completeSrc));
t('complete route: never trusts a client flag',
  !/body\?\.completed/.test(completeSrc) && !/completed:\s*true/.test(completeSrc));
const eligSrc = readFileSync('app/api/luge/eligibility/route.js', 'utf8');
t('eligibility route: checks every course', /courseCompletionStatus/.test(eligSrc));
t('eligibility route: checks the full arsenal', /ownsArsenal/.test(eligSrc));
t('eligibility route: honest when tables are missing', /provisioned: false/.test(eligSrc));
t('claim route: server-side eligibility gate', /decideRewardEligibility/.test(claimSrc));
t('claim route: requires a size', /Pick a hoodie size first/.test(claimSrc));
t('claim route: records a $0 reward order', /amount_cents: 0/.test(claimSrc) && /store_orders/.test(claimSrc));
t('claim route: names the hoodie product', /Axiom Repository - Premium Unisex Hoodie/.test(claimSrc));
t('claim route: locks redemption before ordering', /luge_redemptions/.test(claimSrc) && /23505/.test(claimSrc));
t('claim route: never opens a Stripe checkout',
  !/stripe\.checkout/i.test(claimSrc) && !/checkout\.sessions/i.test(claimSrc));
t('claim route: states the Valkyrie separation', /separate from the Valkyrie/i.test(claimSrc));
t('page: records each finish server-side', /\/api\/luge\/complete/.test(pageSrc));
t('page: reads server eligibility', /\/api\/luge\/eligibility/.test(pageSrc));
t('page: server-observed run timing', /raceStartRef/.test(pageSrc));
t('page: podium gated on server eligibility', /eligibility\.eligible/.test(pageSrc));
t('page: reward CTA links to /store?reward=luge', /\/store\?reward=luge/.test(pageSrc));
t('page: shows honest x/20 progress', /Courses conquered/.test(pageSrc));
t('page: no-backfill honesty', /earlier runs/i.test(pageSrc));
const storeSrc = readFileSync('app/store/page.jsx', 'utf8');
t('store: reward mode from ?reward=luge', /params\.get\('reward'\) === 'luge'/.test(storeSrc));
t('store: "Redeem free hoodie" copy', /Redeem free hoodie/.test(storeSrc));
t('store: redeem posts to the claim route', /\/api\/luge\/claim/.test(storeSrc));
t('store: reward checks eligibility first', /\/api\/luge\/eligibility/.test(storeSrc));
const redeemBody = storeSrc.slice(storeSrc.indexOf('const onRedeem'), storeSrc.indexOf('}, []);', storeSrc.indexOf('const onRedeem')));
t('store: reward path never touches Stripe checkout', !/checkout/i.test(redeemBody));
t('store: states the Valkyrie separation', /separate from the Valkyrie/i.test(storeSrc));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
