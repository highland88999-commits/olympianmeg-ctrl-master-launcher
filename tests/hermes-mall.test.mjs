// tests/hermes-mall.test.mjs
// Headless tests for the HERMES mall batch: house seed listings, the new
// `legal` category, the categorizer ruleset, the paid-submission pipeline
// (source-level), the no-leak contract, and the deep-space video background.
// Run: node tests/hermes-mall.test.mjs  (from the repo root).
import { readFileSync } from 'fs';
import {
  CATEGORIES,
  CATEGORY_SLUGS,
  validateSubmission,
  normalizeUrl,
  extractRootDomain,
  LISTING_FEE_CENTS,
} from '../lib/hermes/listings.js';
import { suggestCategory, CATEGORIZER_RULES_VERSION } from '../lib/hermes/categorize.js';

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`ok - ${name}`);
  } else {
    failures++;
    console.error(`FAIL - ${name}`);
  }
}
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// Merlin's 9 house links: canonical data. Tracking URLs are byte-exact —
// the rules forbid altering them, so the tests pin them.
const SEEDS = [
  { name: 'Margovil', url: 'https://margovil.pxf.io/PzNOEj', domain: 'margovil.pxf.io', category: 'apparel' },
  { name: 'WHEELTOP', url: 'https://globaloneclicktechnologycolimited.pxf.io/k4GOEV', domain: 'globaloneclicktechnologycolimited.pxf.io', category: 'leisure' },
  { name: 'OpenArt AI', url: 'https://openartai.pxf.io/B5onaJ', domain: 'openartai.pxf.io', category: 'tech' },
  { name: 'GearUP', url: 'https://gearup.sjv.io/L03KL0', domain: 'gearup.sjv.io', category: 'gaming' },
  { name: 'Petscosset', url: 'https://petscosset.pxf.io/QY3j96', domain: 'petscosset.pxf.io', category: 'pets' },
  { name: 'Missacc', url: 'https://missacccom.pxf.io/oNq1Po', domain: 'missacccom.pxf.io', category: 'apparel' },
  { name: 'HelloPrenup', url: 'https://helloprenupinc.sjv.io/AgXPOa', domain: 'helloprenupinc.sjv.io', category: 'legal' },
  { name: 'Stake.com · 19+', url: 'https://stake.com/?c=1FofAXWx', domain: 'stake.com', category: 'gaming' },
  { name: 'Betty · 19+', url: 'https://betty.ca/join/richardnsky8g', domain: 'betty.ca', category: 'gaming' },
];

// --- category coverage -------------------------------------------------------
check('nine house seeds', SEEDS.length === 9);
check('new legal category exists', CATEGORIES.legal === 'Legal & Services');
check('legal is a valid slug', CATEGORY_SLUGS.includes('legal'));
for (const s of SEEDS) {
  check(`seed category valid: ${s.name} -> ${s.category}`, CATEGORY_SLUGS.includes(s.category));
}
check('distinct root domains (one-listing-per-domain holds)', new Set(SEEDS.map((s) => s.domain)).size === 9);
check('gambling seeds carry honest 19+ labeling',
  SEEDS.find((s) => s.domain === 'stake.com').name.includes('19+')
  && SEEDS.find((s) => s.domain === 'betty.ca').name.includes('19+'));
check('seed names fit the 40-char column check', SEEDS.every((s) => s.name.length >= 1 && s.name.length <= 40));

// --- URL handling: tracking URLs survive normalization untouched ---------------
for (const s of SEEDS) {
  const n = normalizeUrl(s.url);
  check(`normalize keeps ${s.domain}`, n.ok && n.url === s.url);
  check(`root domain extracts: ${s.domain}`, extractRootDomain(s.url) === s.domain);
}

// --- submissions validate ------------------------------------------------------
for (const s of SEEDS) {
  const v = validateSubmission({ name: s.name, url: s.url, category: s.category });
  check(`seed validates: ${s.name}`, v.ok && v.data.rootDomain === s.domain && v.data.category === s.category);
}
check('rejects unknown category', !validateSubmission({ name: 'X', url: 'https://x.example', category: 'nope' }).ok);
check('rejects bad url', !validateSubmission({ name: 'X', url: 'not a url at all !!!', category: 'tech' }).ok);
check('rejects overlong name', !validateSubmission({ name: 'x'.repeat(41), url: 'https://x.example', category: 'tech' }).ok);
check('fee is $2.00 fixed', LISTING_FEE_CENTS === 200);

// --- categorizer rules -----------------------------------------------------------
check('ruleset versioned', typeof CATEGORIZER_RULES_VERSION === 'number');
for (const s of SEEDS) {
  const r = suggestCategory({ name: s.name, url: s.url, rootDomain: s.domain });
  check(`categorizer: ${s.name} -> ${s.category} (high)`, r.slug === s.category && r.confidence === 'high');
}
{
  const r = suggestCategory({ name: 'Acme Prenup Lawyers', url: 'https://acmeprenup.example', rootDomain: 'acmeprenup.example' });
  check('keyword: prenup lawyers -> legal', r.slug === 'legal' && r.confidence !== 'low');
}
{
  const r = suggestCategory({ name: 'Pixel Pets Store', url: 'https://pixelpets.example/shop', rootDomain: 'pixelpets.example' });
  check('keyword: pet store -> pets', r.slug === 'pets' && r.confidence !== 'low');
}
{
  const r = suggestCategory({ name: 'Xyzzy Quux', url: 'https://xyzzyquux.example', rootDomain: 'xyzzyquux.example' });
  check('unknown -> other (low)', r.slug === 'other' && r.confidence === 'low');
}
check('empty input -> other (low)', suggestCategory({}).slug === 'other');

// --- pipeline: source-level --------------------------------------------------------
const checkout = src('../app/api/hermes/checkout/route.js');
const webhook = src('../app/api/hermes/webhook/route.js');
const scrub = src('../app/api/hermes/cron-scrub/route.js');
const approve = src('../app/api/hermes/_approve.js');

check('checkout fixes the $2 price server-side (no client price)',
  checkout.includes('buildLineItem') && !/unit_amount:\s*body/.test(checkout));
check('checkout records pending before payment', checkout.includes("payment_status: 'pending'") || checkout.includes("payment_status:'pending'"));
check('checkout enforces one-listing-per-domain', checkout.includes('isDuplicateDomain'));
check('webhook verifies the Stripe signature', webhook.includes('stripe.webhooks.constructEvent'));
check('webhook only flips pending -> approved (idempotent)',
  webhook.includes(".eq('payment_status', 'pending')"));
check('webhook sets the 12-month expiry', webhook.includes('listingExpiryIso'));
check('webhook ignores unpaid sessions', webhook.includes('billableSessionOrNull'));
check('verify-on-return helper exists', approve.includes('approvePaidSession'));
check('cron-scrub requires the CRON_SECRET bearer', scrub.includes('Bearer ${secret}') || scrub.includes('`Bearer ${secret}`'));
check('cron-scrub only deletes stale pendings',
  scrub.includes(".eq('payment_status', 'pending')") && scrub.includes('created_at'));

// --- no-leak contract ------------------------------------------------------------------
// The directory page and cards may only ever carry public card data.
// payment_status, stripe_session_id, submission_id, emails must never be selected or rendered.
const page = src('../app/hermes/page.jsx');
const grid = src('../components/hermes/DirectoryGrid.jsx');
const drawer = src('../components/hermes/SubmitDrawer.jsx');
{
  const m = page.match(/\.select\(([^)]+)\)/);
  const cols = m ? m[1] : '';
  check('page selects only public columns',
    /id/.test(cols) && /name/.test(cols) && /url/.test(cols) && /root_domain/.test(cols) && /category/.test(cols));
  check('page never selects payment state', !cols.includes('payment_status'));
  check('page never selects stripe session ids', !cols.includes('stripe_session_id'));
  check('page never selects submission ids', !cols.includes('submission_id'));
}
check('grid renders only public card fields',
  !grid.includes('payment_status') && !grid.includes('stripe_session_id') && !grid.includes('submission_id'));
check('drawer posts only listing fields',
  drawer.includes('name') && drawer.includes('category') && !drawer.includes('stripe_session_id'));

// --- deep-space video behind the mall ------------------------------------------------------
const bg = src('../components/store/StoreSpaceBackground.jsx');
check('page mounts the shared space background',
  page.includes("import StoreSpaceBackground from '@/components/store/StoreSpaceBackground'")
  && page.includes('<StoreSpaceBackground />'));
check('page root is transparent (no opaque bg-black hiding the video)',
  !/className="relative min-h-dvh w-full bg-black/.test(page));
check('cards echo the video: translucent + blurred',
  grid.includes('bg-black/45') && grid.includes('backdrop-blur'));
check('background is fixed full-viewport', bg.includes('fixed inset-0 z-0'));
check('background never intercepts taps', bg.includes('pointer-events-none'));
check('video is muted/autoplay/loop/inline',
  bg.includes('autoPlay') && bg.includes('muted') && bg.includes('loop') && bg.includes('playsInline'));
check('reduced-motion gets the static poster', bg.includes('prefers-reduced-motion') && bg.includes('STORE_SPACE_POSTER'));
check('background is aria-hidden', bg.includes('aria-hidden'));
check('video file referenced', bg.includes('/videos/store-space-background.mp4'));

if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log('All hermes-mall tests passed.');
