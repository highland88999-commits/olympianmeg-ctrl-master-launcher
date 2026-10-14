// lib/store/custom-products.js
// Shared config for the Custom Product Designer (/store/custom).
//
// One entry per blank product template a user can design on. Every value is
// driven by the live Printful catalog API (pulled 2026-10-13):
//   - catalogId / variants: GET /products/{id} (variant ids + sizes)
//   - print {w,h,dpi,fill}: GET /mockup-generator/printfiles/{id}
//     (the printfile spec for the chosen variants' primary placement)
//   - priceCad: the Omega Store retail price for that product type.
//
// Pure data — safe to import from the client page and the server route.
// The route is the authority: it re-reads variants/prices from here, never
// from the client.
//
// Notes on individual entries:
//   - hoodie: the original designer base (All-Over Print Recycled Unisex
//     Hoodie, White). Its export stays 4500x5400 and its file attachment
//     stays type-less, exactly as the shipped designer has always done —
//     no regression. (The mockup-generator API currently reports a
//     6000x6000 front printfile for this product; Printful accepts the
//     4500x5400 file and scales it to the print area, as it has since the
//     designer launched.)
//   - drawstring-bag: Printful catalog 262. The store rollout labelled
//     this type "Crewneck Sweatshirt", but catalog 262 is actually the
//     All-Over Print Drawstring Bag — labelled truthfully here so nobody
//     designs a "sweatshirt" and receives a bag.
//   - knit-sweater (catalog 769) is intentionally ABSENT: its technique
//     is KNITWEAR and its printfiles are stitch grids (340x517 @ 1 dpi),
//     not raster print placements — a placed-PNG designer cannot drive
//     it honestly.
//   - Wall art / stickers / tote / tumbler / drawstring-bag pin ONE
//     default variant because Printful gives each size its own printfile
//     spec (a single exported print file can only match one spec), and a
//     single-variant sync product keeps checkout size handling exact.
//   - joggers: the design file is attached to BOTH leg placements
//     (leg_right + leg_left) so the graphic prints on both legs.
//   - Second batch (2026-10-14, once the rollout completed all 18
//     product types; specs pulled live the same way): puzzle and
//     beach-towel pin ONE default variant because each size carries
//     its own printfile spec (puzzle 252 pcs = 4200x3300, towel
//     30″×60″ = 9300x4800); water-bottle pins the Clear 25 oz variant
//     (its three colours share a single printfile spec and a single
//     size — one pinned colour, like the tumbler's); postcards and
//     the apron each have exactly one variant. The AOP apron's only
//     placement is 'front' (sublimation), so its file type is 'front',
//     not 'default'.
//
// Placements (Merlin's designer placement rules, 2026-10-13):
//   - Rule 1: a template with more than one placement lets the user
//     upload a DIFFERENT graphic per placement, or reuse the same
//     graphic — their choice per placement (joggers' two legs).
//   - Rule 2 (hoodie exception): on the AOP hoodie the graphic
//     overlays the pocket, so the user only ever handles the FRONT
//     upload; the backend attaches the pocket placement from the same
//     front file (pocketFromFront) — Sutton's composition law from
//     the store's hoodie listings: front and pocket share one file,
//     attached with Printful's default placement, so the pocket print
//     stays aligned with the front.
//   - Rule 3: print files are composed with an edge-mirrored fill by
//     default, so a graphic that doesn't cover the whole print area
//     reflects at its edges instead of leaving blank space (the
//     composition lives in the designer page's export; see
//     app/store/custom/page.jsx).
// Each template lists its user-facing placements below; `type` is the
// Printful file type (null = the type-less default attachment). The
// older `fileTypes` list is kept for reference/back-compat; the
// placements list is what the create route attaches from.

export const CUSTOM_PRODUCTS = [
  {
    key: 'hoodie',
    name: 'Unisex Hoodie',
    pickerLabel: 'Hoodie',
    emoji: '🧥',
    catalogId: 388,
    priceCad: '95.00',
    priceCents: 9500,
    variantNote: 'White · 2XS–6XL',
    stageHint: 'front print area',
    // Empty = attach with no explicit type (the product's default
    // placement) — the shipped designer's exact behaviour for this base.
    fileTypes: [],
    // Rule 2: the user handles the front only; the create route adds
    // the pocket attachment from the same uploaded front file.
    placements: [{ key: 'front', type: null, label: 'Front' }],
    pocketFromFront: true,
    print: { w: 4500, h: 5400, dpi: 150, fill: 'cover' },
    design: { x: 0.5, y: 0.38, scale: 0.55 },
    variants: [
      { id: 18730, size: '2XS' }, { id: 10869, size: 'XS' },
      { id: 10870, size: 'S' }, { id: 10871, size: 'M' },
      { id: 10872, size: 'L' }, { id: 10873, size: 'XL' },
      { id: 10874, size: '2XL' }, { id: 10875, size: '3XL' },
      { id: 18731, size: '4XL' }, { id: 18732, size: '5XL' },
      { id: 18733, size: '6XL' },
    ],
    defaultSize: 'L',
  },
  {
    key: 'tshirt',
    name: 'Classic T-Shirt',
    pickerLabel: 'T-Shirt',
    emoji: '👕',
    catalogId: 1589,
    priceCad: '95.00',
    priceCents: 9500,
    variantNote: 'Faded Black · S–3XL',
    stageHint: 'front print area',
    fileTypes: ['default'],
    placements: [{ key: 'front', type: 'default', label: 'Front' }],
    print: { w: 4200, h: 4800, dpi: 300, fill: 'fit' },
    design: { x: 0.5, y: 0.38, scale: 0.55 },
    variants: [
      { id: 50019, size: 'S' }, { id: 50014, size: 'M' },
      { id: 50022, size: 'L' }, { id: 50015, size: 'XL' },
      { id: 50028, size: '2XL' }, { id: 50032, size: '3XL' },
    ],
    defaultSize: 'L',
  },
  {
    key: 'zip-hoodie',
    name: 'Zip-Up Hoodie',
    pickerLabel: 'Zip-Up Hoodie',
    emoji: '🧥',
    catalogId: 717,
    priceCad: '95.00',
    priceCents: 9500,
    variantNote: 'White · 2XS–6XL',
    stageHint: 'front print area',
    fileTypes: ['default'],
    placements: [{ key: 'front', type: 'default', label: 'Front' }],
    print: { w: 5250, h: 6000, dpi: 150, fill: 'cover' },
    design: { x: 0.5, y: 0.38, scale: 0.55 },
    variants: [
      { id: 18522, size: '2XS' }, { id: 18523, size: 'XS' },
      { id: 18524, size: 'S' }, { id: 18525, size: 'M' },
      { id: 18526, size: 'L' }, { id: 18527, size: 'XL' },
      { id: 18528, size: '2XL' }, { id: 18529, size: '3XL' },
      { id: 18530, size: '4XL' }, { id: 18531, size: '5XL' },
      { id: 18532, size: '6XL' },
    ],
    defaultSize: 'L',
  },
  {
    key: 'drawstring-bag',
    name: 'Drawstring Bag',
    pickerLabel: 'Drawstring Bag',
    emoji: '🎒',
    catalogId: 262,
    priceCad: '95.00',
    priceCents: 9500,
    variantNote: '15″×17″',
    stageHint: 'full print area',
    fileTypes: ['default'],
    placements: [{ key: 'main', type: 'default', label: 'Design' }],
    print: { w: 2400, h: 2850, dpi: 150, fill: 'cover' },
    design: { x: 0.5, y: 0.42, scale: 0.6 },
    variants: [{ id: 8894, size: '15″×17″' }],
    defaultSize: null,
  },
  {
    key: 'joggers',
    name: 'Joggers',
    pickerLabel: 'Joggers',
    emoji: '👖',
    catalogId: 400,
    priceCad: '95.00',
    priceCents: 9500,
    variantNote: 'White · XS–3XL',
    stageHint: 'leg print area — prints on both legs',
    fileTypes: ['leg_right', 'leg_left'],
    // Rule 1: each leg is its own placement — the user may upload a
    // different graphic per leg or reuse the same one.
    placements: [
      { key: 'leg_right', type: 'leg_right', label: 'Right leg' },
      { key: 'leg_left', type: 'leg_left', label: 'Left leg' },
    ],
    print: { w: 4950, h: 7500, dpi: 150, fill: 'cover' },
    design: { x: 0.5, y: 0.3, scale: 0.6 },
    variants: [
      { id: 11033, size: 'XS' }, { id: 11034, size: 'S' },
      { id: 11035, size: 'M' }, { id: 11036, size: 'L' },
      { id: 11037, size: 'XL' }, { id: 11038, size: '2XL' },
      { id: 11039, size: '3XL' },
    ],
    defaultSize: 'L',
  },
  {
    key: 'tank-top',
    name: 'Tank Top',
    pickerLabel: 'Tank Top',
    emoji: '🎽',
    catalogId: 539,
    priceCad: '65.00',
    priceCents: 6500,
    variantNote: 'Black · XS–2XL',
    stageHint: 'front print area',
    fileTypes: ['default'],
    placements: [{ key: 'front', type: 'default', label: 'Front' }],
    print: { w: 1800, h: 2400, dpi: 150, fill: 'fit' },
    design: { x: 0.5, y: 0.38, scale: 0.5 },
    variants: [
      { id: 13483, size: 'XS' }, { id: 13484, size: 'S' },
      { id: 13485, size: 'M' }, { id: 13486, size: 'L' },
      { id: 13487, size: 'XL' }, { id: 13488, size: '2XL' },
    ],
    defaultSize: 'L',
  },
  {
    key: 'tote-bag',
    name: 'Tote Bag',
    pickerLabel: 'Tote Bag',
    emoji: '👜',
    catalogId: 84,
    priceCad: '35.00',
    priceCents: 3500,
    variantNote: 'Black · 15″×15″',
    stageHint: 'full print area',
    fileTypes: ['default'],
    placements: [{ key: 'main', type: 'default', label: 'Design' }],
    print: { w: 2550, h: 2475, dpi: 150, fill: 'cover' },
    design: { x: 0.5, y: 0.45, scale: 0.6 },
    variants: [{ id: 4533, size: '15″×15″' }],
    defaultSize: null,
  },
  {
    key: 'tumbler',
    name: 'Tumbler',
    pickerLabel: 'Tumbler',
    emoji: '🥤',
    catalogId: 751,
    priceCad: '45.00',
    priceCents: 4500,
    variantNote: 'Clear · 16 oz',
    stageHint: 'wrap-around print area',
    fileTypes: ['default'],
    placements: [{ key: 'main', type: 'default', label: 'Design' }],
    print: { w: 3106, h: 1417, dpi: 300, fill: 'cover' },
    design: { x: 0.5, y: 0.5, scale: 0.45 },
    variants: [{ id: 19192, size: '16 oz' }],
    defaultSize: null,
  },
  {
    key: 'poster',
    name: 'Poster',
    pickerLabel: 'Poster',
    emoji: '🖼️',
    catalogId: 1,
    priceCad: '35.00',
    priceCents: 3500,
    variantNote: 'Matte · 12″×18″',
    stageHint: 'full poster area',
    fileTypes: ['default'],
    placements: [{ key: 'main', type: 'default', label: 'Design' }],
    print: { w: 5400, h: 3600, dpi: 300, fill: 'cover' },
    design: { x: 0.5, y: 0.5, scale: 0.5 },
    variants: [{ id: 3876, size: '12″×18″' }],
    defaultSize: null,
  },
  {
    key: 'framed-poster',
    name: 'Framed Poster',
    pickerLabel: 'Framed Poster',
    emoji: '🖼️',
    catalogId: 2,
    priceCad: '75.00',
    priceCents: 7500,
    variantNote: 'Black frame · 12″×18″',
    stageHint: 'full poster area',
    fileTypes: ['default'],
    placements: [{ key: 'main', type: 'default', label: 'Design' }],
    print: { w: 5400, h: 3600, dpi: 300, fill: 'cover' },
    design: { x: 0.5, y: 0.5, scale: 0.5 },
    variants: [{ id: 4398, size: '12″×18″' }],
    defaultSize: null,
  },
  {
    key: 'canvas',
    name: 'Canvas',
    pickerLabel: 'Canvas',
    emoji: '🎨',
    catalogId: 3,
    priceCad: '85.00',
    priceCents: 8500,
    variantNote: '12″×18″',
    stageHint: 'full canvas area',
    fileTypes: ['default'],
    placements: [{ key: 'main', type: 'default', label: 'Design' }],
    print: { w: 6300, h: 4500, dpi: 300, fill: 'cover' },
    design: { x: 0.5, y: 0.5, scale: 0.5 },
    variants: [{ id: 19299, size: '12″×18″' }],
    defaultSize: null,
  },
  {
    key: 'stickers',
    name: 'Die-Cut Stickers',
    pickerLabel: 'Stickers',
    emoji: '✨',
    catalogId: 957,
    priceCad: '15.00',
    priceCents: 1500,
    variantNote: 'Satin · 4″×4″',
    stageHint: 'die-cut sticker area',
    fileTypes: ['default'],
    placements: [{ key: 'main', type: 'default', label: 'Design' }],
    print: { w: 1200, h: 1200, dpi: 300, fill: 'fit' },
    design: { x: 0.5, y: 0.5, scale: 0.8 },
    variants: [{ id: 24966, size: '4″×4″' }],
    defaultSize: null,
  },
  {
    key: 'puzzle',
    name: 'Puzzle',
    pickerLabel: 'Puzzle',
    emoji: '🧩',
    catalogId: 534,
    priceCad: '35.00',
    priceCents: 3500,
    variantNote: '252 pieces',
    stageHint: 'full puzzle area',
    fileTypes: ['default'],
    placements: [{ key: 'main', type: 'default', label: 'Design' }],
    print: { w: 4200, h: 3300, dpi: 300, fill: 'cover' },
    design: { x: 0.5, y: 0.5, scale: 0.5 },
    variants: [{ id: 13431, size: '252 pieces' }],
    defaultSize: null,
  },
  {
    key: 'postcards',
    name: 'Postcards',
    pickerLabel: 'Postcards',
    emoji: '✉️',
    catalogId: 433,
    priceCad: '15.00',
    priceCents: 1500,
    variantNote: '4″×6″',
    stageHint: 'full postcard area',
    fileTypes: ['default'],
    placements: [{ key: 'main', type: 'default', label: 'Design' }],
    print: { w: 1842, h: 1240, dpi: 300, fill: 'cover' },
    design: { x: 0.5, y: 0.5, scale: 0.5 },
    variants: [{ id: 11513, size: '4″×6″' }],
    defaultSize: null,
  },
  {
    key: 'apron',
    name: 'Apron',
    pickerLabel: 'Apron',
    emoji: '🧑‍🍳',
    catalogId: 894,
    priceCad: '35.00',
    priceCents: 3500,
    variantNote: 'White · One size',
    stageHint: 'front print area',
    fileTypes: ['front'],
    placements: [{ key: 'front', type: 'front', label: 'Front' }],
    print: { w: 4350, h: 4783, dpi: 150, fill: 'cover' },
    design: { x: 0.5, y: 0.42, scale: 0.6 },
    variants: [{ id: 22903, size: 'One size' }],
    defaultSize: null,
  },
  {
    key: 'water-bottle',
    name: 'Water Bottle',
    pickerLabel: 'Water Bottle',
    emoji: '💧',
    catalogId: 848,
    priceCad: '45.00',
    priceCents: 4500,
    variantNote: 'Clear · 25 oz',
    stageHint: 'wrap-around print area',
    fileTypes: ['default'],
    placements: [{ key: 'main', type: 'default', label: 'Design' }],
    print: { w: 2914, h: 1196, dpi: 300, fill: 'fit' },
    design: { x: 0.5, y: 0.5, scale: 0.45 },
    variants: [{ id: 22017, size: '25 oz' }],
    defaultSize: null,
  },
  {
    key: 'beach-towel',
    name: 'Beach Towel',
    pickerLabel: 'Beach Towel',
    emoji: '🏖️',
    catalogId: 259,
    priceCad: '55.00',
    priceCents: 5500,
    variantNote: '30″×60″',
    stageHint: 'full towel area',
    fileTypes: ['default'],
    placements: [{ key: 'main', type: 'default', label: 'Design' }],
    print: { w: 9300, h: 4800, dpi: 150, fill: 'cover' },
    design: { x: 0.5, y: 0.5, scale: 0.5 },
    variants: [{ id: 8874, size: '30″×60″' }],
    defaultSize: null,
  },
];

export const DEFAULT_PRODUCT_KEY = 'hoodie';

const BY_KEY = new Map(CUSTOM_PRODUCTS.map((p) => [p.key, p]));

export function getCustomProduct(key) {
  return BY_KEY.get(key) || null;
}

// The template's user-facing placements (see the placement rules in
// the header). Empty array for a malformed template.
export function placementsFor(product) {
  return (product && Array.isArray(product.placements)) ? product.placements : [];
}

// Pure planner for the create route: given a template and the client's
// per-placement submissions, decide which distinct files must be
// uploaded and which uploaded file each Printful placement receives.
//
// submissions is null for a legacy single-image request (one image
// fills every placement), otherwise a map of placement key ->
//   { image: true }       this placement carries its own graphic
//   { sameAs: '<key>' }   reuse another placement's graphic (Rule 1)
//
// Returns { ok:true, uploads:[placementKey...], files:[{type, source}] }
// — files is in attachment order and `source` is the placement key
// whose uploaded file that attachment uses — or { ok:false, error }
// with a user-facing message. When the template sets pocketFromFront
// (the AOP hoodie, Rule 2), the pocket attachment is appended, sourced
// from the front's file: same file, no explicit position — Printful's
// default full-area placement, exactly as the store's hoodie listings
// compose it, so the pocket stays aligned with the front.
export function planPlacementFiles(product, submissions) {
  const placements = placementsFor(product);
  if (!placements.length) {
    return { ok: false, error: 'This product template has no print placements.' };
  }
  const byKey = new Map(placements.map((p) => [p.key, p]));
  let subs = submissions;
  if (!subs) {
    subs = {};
    placements.forEach((p, i) => {
      subs[p.key] = i === 0 ? { image: true } : { sameAs: placements[0].key };
    });
  }
  for (const key of Object.keys(subs)) {
    if (!byKey.has(key)) {
      return { ok: false, error: 'Unknown placement in design.' };
    }
  }
  const sourceOf = new Map();
  const resolve = (key, seen) => {
    if (sourceOf.has(key)) return sourceOf.get(key);
    if (seen.has(key)) return null; // sameAs cycle
    seen.add(key);
    const sub = subs[key];
    if (!sub) return null;
    if (sub.sameAs) {
      if (!byKey.has(sub.sameAs)) return null;
      const src = resolve(sub.sameAs, seen);
      if (!src) return null;
      sourceOf.set(key, src);
      return src;
    }
    sourceOf.set(key, key);
    return key;
  };
  for (const p of placements) {
    if (!resolve(p.key, new Set())) {
      return {
        ok: false,
        error: `Missing graphic for the ${p.label.toLowerCase()} placement.`,
      };
    }
  }
  const uploads = [...new Set(placements.map((p) => sourceOf.get(p.key)))];
  const files = placements.map((p) => ({ type: p.type, source: sourceOf.get(p.key) }));
  if (product.pocketFromFront) {
    files.push({ type: 'pocket', source: sourceOf.get(placements[0].key) });
  }
  return { ok: true, uploads, files };
}

// ---- Creator markup (Merlin's creator marketplace, 2026-10-12/13) ----
//
// Before a user's creation goes into the store, the creator sets a
// markup over the template's baseline price; the markup is the
// creator's income per sale and the store price is baseline + markup.
// The math lives here so the designer page (display) and the create
// route (authority) can never drift apart. The server ALWAYS recomputes
// the final price from the baseline in this config — a client-supplied
// final price is never trusted (payment law).
//
// MAX_MARKUP_MULTIPLE is a fraud/typo guard (a stray extra zero at the
// keyboard), NOT a pricing policy: Merlin has set no maximum markup.
// It only stops a markup wildly out of proportion to the base product
// from being created by accident or abuse.
export const MAX_MARKUP_MULTIPLE = 4;

// Parse a client-supplied markup (CAD dollars: number, numeric string,
// or absent) into cents, validated against the template baseline.
// Absent/empty means 0 — older clients and the plain purchase path send
// no markup at all. Returns { ok:true, markupCents } or
// { ok:false, error } with a user-facing message.
export function parseMarkupToCents(input, baselineCents) {
  if (input === undefined || input === null || input === '') {
    return { ok: true, markupCents: 0 };
  }
  const dollars = typeof input === 'number' ? input : Number(String(input).trim());
  if (!Number.isFinite(dollars)) {
    return { ok: false, error: 'Please enter your markup as a dollar amount.' };
  }
  const markupCents = Math.round(dollars * 100);
  if (!Number.isFinite(markupCents) || markupCents < 0) {
    return { ok: false, error: "Your markup can't be negative." };
  }
  if (markupCents > MAX_MARKUP_MULTIPLE * baselineCents) {
    return {
      ok: false,
      error: `That markup is more than ${MAX_MARKUP_MULTIPLE}× the base price — please check the amount.`,
    };
  }
  return { ok: true, markupCents };
}

// The store price of a creation: baseline + creator markup (cents).
export function finalPriceCents(baselineCents, markupCents) {
  return baselineCents + markupCents;
}

// Cents -> '95.00' style CAD string (matches the priceCad fields above).
export function centsToCadString(cents) {
  return (cents / 100).toFixed(2);
}
