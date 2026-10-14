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

console.log(`store-custom-placements: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
