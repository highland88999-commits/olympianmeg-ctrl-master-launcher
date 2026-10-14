// tests/store-custom-placements.test.mjs
// Placement-rule tests for the Custom Product Designer (Merlin,
// 2026-10-13). Run: node tests/store-custom-placements.test.mjs
// (from the repo root). No browser, no network — the pure planner in
// lib/store/custom-products.js decides which files a create uploads
// and which Printful placement each file lands on.
//
//   Rule 1: a multi-placement template (joggers) takes a different
//           graphic per placement, or the same one reused — the
//           user's choice per placement.
//   Rule 2: the AOP hoodie exposes ONLY the front to the user; the
//           planner appends the pocket attachment sourced from the
//           front's file (Sutton's composition law — same file,
//           default placement, pocket stays aligned with the front).
import {
  CUSTOM_PRODUCTS,
  getCustomProduct,
  placementsFor,
  planPlacementFiles,
} from '../lib/store/custom-products.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- config shape ----------------------------------------------------
for (const p of CUSTOM_PRODUCTS) {
  const pls = placementsFor(p);
  t(`${p.key}: has at least one placement`, pls.length >= 1);
  t(`${p.key}: placement keys unique`,
    new Set(pls.map((x) => x.key)).size === pls.length);
  t(`${p.key}: placement labels present`,
    pls.every((x) => typeof x.label === 'string' && x.label.length > 0));
  t(`${p.key}: placement types are string-or-null`,
    pls.every((x) => x.type === null || typeof x.type === 'string'));
}

const hoodie = getCustomProduct('hoodie');
const joggers = getCustomProduct('joggers');
const tshirt = getCustomProduct('tshirt');

t('hoodie: exactly one user placement', placementsFor(hoodie).length === 1);
t('hoodie: front placement is type-less (legacy attachment)',
  placementsFor(hoodie)[0].type === null);
t('hoodie: pocketFromFront set', hoodie.pocketFromFront === true);
t('joggers: two placements', placementsFor(joggers).length === 2);
t('joggers: leg types', placementsFor(joggers).map((p) => p.type).join() === 'leg_right,leg_left');
t('only the hoodie has pocketFromFront',
  CUSTOM_PRODUCTS.filter((p) => p.pocketFromFront).map((p) => p.key).join() === 'hoodie');
t('joggers is the only multi-placement template',
  CUSTOM_PRODUCTS.filter((p) => placementsFor(p).length > 1).map((p) => p.key).join() === 'joggers');

// --- legacy single-image plans --------------------------------------
{
  const plan = planPlacementFiles(tshirt, null);
  t('legacy tshirt: ok', plan.ok === true);
  t('legacy tshirt: one upload', plan.uploads.length === 1);
  t('legacy tshirt: one default file',
    plan.files.length === 1 && plan.files[0].type === 'default' && plan.files[0].source === 'front');
}
{
  const plan = planPlacementFiles(joggers, null);
  t('legacy joggers: ok', plan.ok === true);
  t('legacy joggers: one upload fills both legs',
    plan.uploads.length === 1 && plan.files.length === 2 &&
    plan.files.every((f) => f.source === plan.uploads[0]));
  t('legacy joggers: leg types preserved',
    plan.files.map((f) => f.type).join() === 'leg_right,leg_left');
}
{
  const plan = planPlacementFiles(hoodie, null);
  t('legacy hoodie: ok', plan.ok === true);
  t('legacy hoodie: one upload', plan.uploads.length === 1);
  t('legacy hoodie: front type-less + pocket on same file',
    plan.files.length === 2 &&
    plan.files[0].type === null &&
    plan.files[1].type === 'pocket' &&
    plan.files[0].source === plan.files[1].source);
}

// --- Rule 1: per-placement graphics on the joggers -------------------
{
  const plan = planPlacementFiles(joggers, {
    leg_right: { image: true },
    leg_left: { image: true },
  });
  t('joggers different: ok', plan.ok === true);
  t('joggers different: two uploads', plan.uploads.length === 2);
  t('joggers different: each leg its own file',
    plan.files.length === 2 &&
    plan.files[0].source === 'leg_right' && plan.files[1].source === 'leg_left');
}
{
  const plan = planPlacementFiles(joggers, {
    leg_right: { image: true },
    leg_left: { sameAs: 'leg_right' },
  });
  t('joggers same: ok', plan.ok === true);
  t('joggers same: one upload', plan.uploads.length === 1 && plan.uploads[0] === 'leg_right');
  t('joggers same: left leg reuses right file',
    plan.files.length === 2 && plan.files.every((f) => f.source === 'leg_right'));
}
{
  const plan = planPlacementFiles(joggers, {
    leg_right: { image: true },
  });
  t('joggers missing left: rejected', plan.ok === false && /left leg/i.test(plan.error));
}
{
  const plan = planPlacementFiles(joggers, {
    leg_right: { image: true },
    leg_left: { sameAs: 'leg_left' },
  });
  t('joggers self-reuse cycle: rejected', plan.ok === false);
}
{
  const plan = planPlacementFiles(joggers, {
    leg_right: { image: true },
    leg_left: { sameAs: 'nope' },
  });
  t('joggers reuse of unknown placement: rejected', plan.ok === false);
}
{
  const plan = planPlacementFiles(joggers, {
    leg_right: { image: true },
    leg_left: { sameAs: 'leg_right' },
    sleeve: { image: true },
  });
  t('unknown placement key: rejected', plan.ok === false && /Unknown placement/.test(plan.error));
}
{
  // a reuse chain resolves to the placement that carries the image
  const plan = planPlacementFiles(joggers, {
    leg_right: { sameAs: 'leg_left' },
    leg_left: { image: true },
  });
  t('joggers reversed reuse: ok, one upload',
    plan.ok === true && plan.uploads.length === 1 && plan.uploads[0] === 'leg_left');
}

// --- Rule 2: hoodie pocket comes from the backend, never the client --
{
  const plan = planPlacementFiles(hoodie, { front: { image: true } });
  t('hoodie explicit front: ok', plan.ok === true);
  t('hoodie explicit front: pocket appended on same file',
    plan.files.length === 2 && plan.files[1].type === 'pocket' &&
    plan.files[1].source === 'front' && plan.uploads.length === 1);
}
{
  // a client trying to submit its own pocket gets rejected outright —
  // the pocket is not a user placement on the hoodie.
  const plan = planPlacementFiles(hoodie, {
    front: { image: true },
    pocket: { image: true },
  });
  t('hoodie client-supplied pocket: rejected', plan.ok === false);
}

// --- Second batch: the final five rollout types (2026-10-14) --------
// Specs are the live Printful values (GET /products/{id} +
// GET /mockup-generator/printfiles/{id}): puzzle 534 and beach towel
// 259 pin one variant because each size has its own printfile spec;
// water bottle 848 pins the Clear colour (one size, one shared spec);
// postcards 433 and apron 894 have a single variant each. The AOP
// apron's only placement is 'front', so its file type is 'front'.
const BATCH2 = [
  { key: 'puzzle', catalogId: 534, priceCents: 3500, type: 'default',
    print: { w: 4200, h: 3300, dpi: 300, fill: 'cover' }, variantId: 13431 },
  { key: 'postcards', catalogId: 433, priceCents: 1500, type: 'default',
    print: { w: 1842, h: 1240, dpi: 300, fill: 'cover' }, variantId: 11513 },
  { key: 'apron', catalogId: 894, priceCents: 3500, type: 'front',
    print: { w: 4350, h: 4783, dpi: 150, fill: 'cover' }, variantId: 22903 },
  { key: 'water-bottle', catalogId: 848, priceCents: 4500, type: 'default',
    print: { w: 2914, h: 1196, dpi: 300, fill: 'fit' }, variantId: 22017 },
  { key: 'beach-towel', catalogId: 259, priceCents: 5500, type: 'default',
    print: { w: 9300, h: 4800, dpi: 150, fill: 'cover' }, variantId: 8874 },
];

t('catalogue now holds 17 templates', CUSTOM_PRODUCTS.length === 17);
for (const spec of BATCH2) {
  const p = getCustomProduct(spec.key);
  t(`${spec.key}: resolves`, !!p);
  if (!p) continue;
  t(`${spec.key}: catalog id`, p.catalogId === spec.catalogId);
  t(`${spec.key}: baseline price matches the rollout price`,
    p.priceCents === spec.priceCents);
  const pls = placementsFor(p);
  t(`${spec.key}: exactly one user placement`, pls.length === 1);
  t(`${spec.key}: placement file type`, pls[0].type === spec.type);
  t(`${spec.key}: print spec`,
    p.print.w === spec.print.w && p.print.h === spec.print.h &&
    p.print.dpi === spec.print.dpi && p.print.fill === spec.print.fill);
  t(`${spec.key}: single pinned variant`,
    p.variants.length === 1 && p.variants[0].id === spec.variantId);
  t(`${spec.key}: no size preselect on a single-variant template`,
    p.defaultSize === null);
  const plan = planPlacementFiles(p, null);
  t(`${spec.key}: legacy plan ok`, plan.ok === true);
  t(`${spec.key}: legacy plan uploads once, one file of its type`,
    plan.uploads.length === 1 && plan.files.length === 1 &&
    plan.files[0].type === spec.type &&
    plan.files[0].source === pls[0].key);
  t(`${spec.key}: no pocket attachment`, !p.pocketFromFront);
}

console.log(`store-custom-placements: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
