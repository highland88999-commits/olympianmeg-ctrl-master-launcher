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
    print: { w: 1200, h: 1200, dpi: 300, fill: 'fit' },
    design: { x: 0.5, y: 0.5, scale: 0.8 },
    variants: [{ id: 24966, size: '4″×4″' }],
    defaultSize: null,
  },
];

export const DEFAULT_PRODUCT_KEY = 'hoodie';

const BY_KEY = new Map(CUSTOM_PRODUCTS.map((p) => [p.key, p]));

export function getCustomProduct(key) {
  return BY_KEY.get(key) || null;
}
