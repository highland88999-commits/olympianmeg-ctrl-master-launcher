// Olympus product catalog — curated from the original Printful archive.
// Prices are the source of truth HERE (server-side). The client never decides
// what anything costs; the checkout API re-prices every order from this file.

export const CURRENCY = 'cad';
export const PRICE_CENTS = 9500; // CAD $95.00 per item, per the product archive

export const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];

export const PRODUCTS = [
  { id: 474601990, name: 'Glitch', image: 'https://files.cdn.printful.com/files/0c0/0c0ae57c5b6a7822f2ed3229c23b338a_preview.png', blurb: 'Digital distortion print on heavyweight cotton.', tag: 'Graphic tee' },
  { id: 474599857, name: 'Sandstone', image: 'https://files.cdn.printful.com/files/238/238bfeb83fea443999548d29ecfa185f_preview.png', blurb: 'Warm desert tones, soft washed finish.', tag: 'Graphic tee' },
  { id: 474599166, name: 'Bookworm', image: 'https://files.cdn.printful.com/files/96c/96cb177b9d0cf6a83545663a0bb67e08_preview.png', blurb: 'For readers. Loud about it.', tag: 'Graphic tee' },
  { id: 428063267, name: 'Grafitti Wear', image: 'https://files.cdn.printful.com/files/fba/fbaf9e6d1322c880fb12ba28831bac60_preview.png', blurb: 'Street-art inspired all-over energy.', tag: 'Graphic tee' },
  { id: 428063177, name: 'Mud Camo', image: 'https://files.cdn.printful.com/files/955/955cf5c110929cc21c284b9139bea775_preview.png', blurb: 'Earthy camouflage pattern.', tag: 'Graphic tee' },
  { id: 417465552, name: 'Break The Chains', image: 'https://files.cdn.printful.com/files/dce/dce7d1cb84bcc875bce00e261d8b1f82_preview.png', blurb: 'Bold statement print.', tag: 'Graphic tee' },
  { id: 417462843, name: 'Hey Zeus!!', image: 'https://files.cdn.printful.com/files/9ed/9ed473241238922eadd062297be5210f_preview.png', blurb: 'The house favorite. Thunder included.', tag: 'Graphic tee' },
  { id: 417461480, name: 'Date Night in Paris', image: 'https://files.cdn.printful.com/files/051/0511913c80ecf30d2bfaf2ff7cf389a4_preview.png', blurb: 'Romantic cityscape artwork.', tag: 'Graphic tee' },
  { id: 417460362, name: 'The Butterfly Effect', image: 'https://files.cdn.printful.com/files/f4d/f4dccca32188db3b99b586dc8492724a_preview.png', blurb: 'Small wings, big ripples.', tag: 'Graphic tee' },
  { id: 417459676, name: 'Jewel of The North', image: 'https://files.cdn.printful.com/files/723/723fd82d3ff0da85487d13dd55f2554c_preview.png', blurb: 'Aurora-inspired northern print.', tag: 'Graphic tee' },
  { id: 417459015, name: 'Lepidopterology', image: 'https://files.cdn.printful.com/files/685/6856b378e29f2d81d451d2e54c95717b_preview.png', blurb: 'You give me butterflies. Scientific.', tag: 'Graphic tee' },
  { id: 417458407, name: 'Rose Gold Hoodie', image: 'https://files.cdn.printful.com/files/a9d/a9da01443d1089103031c7a96761dd62_preview.png', blurb: 'Soft blush tones on a cozy hoodie.', tag: 'Hoodie' },
  { id: 417458260, name: 'Hummingbirds Hoodie', image: 'https://files.cdn.printful.com/files/a5e/a5e7aea91832e0d95c0d843f64f4426c_preview.png', blurb: 'Delicate hummingbird artwork.', tag: 'Hoodie' },
  { id: 417457935, name: 'Midnight in Paris Hoodie', image: 'https://files.cdn.printful.com/files/cab/cabf055883ee1aa2b7ff8a5228f3c849_preview.png', blurb: 'After-dark Parisian print.', tag: 'Hoodie' },
  { id: 417457330, name: 'Liquid Gold Hoodie', image: 'https://files.cdn.printful.com/files/4cb/4cb432641e6724ac052f2c6f9a3b88e0_preview.png', blurb: 'Molten gold flow design.', tag: 'Hoodie' },
  { id: 417457046, name: 'Emerald Green Hoodie', image: 'https://files.cdn.printful.com/files/a27/a27abbf176560257126614ca537be656_preview.png', blurb: 'Deep jewel-tone print.', tag: 'Hoodie' },
  { id: 417456842, name: 'River Rafting Hoodie', image: 'https://files.cdn.printful.com/files/19e/19e320aca946f0b9d353e01b6086b749_preview.png', blurb: 'Whitewater adventure artwork.', tag: 'Hoodie' },
  { id: 417456635, name: 'Safari Tours Hoodie', image: 'https://files.cdn.printful.com/files/baa/baade73fc7b39d8eb5a36eec11f635cd_preview.png', blurb: 'Savanna wildlife print.', tag: 'Hoodie' },
  { id: 417456200, name: 'The Frog Hoodie', image: 'https://files.cdn.printful.com/files/e31/e3123646998e8259be5892970367438d_preview.png', blurb: 'A very good frog.', tag: 'Hoodie' },
  { id: 417456134, name: 'Mon Amour Hoodie', image: 'https://files.cdn.printful.com/files/fd8/fd8006ffd385fa0ed6614d9d7af2f594_preview.png', blurb: 'Sweet French-inspired design.', tag: 'Hoodie' },
  { id: 417454563, name: 'Dawn Hoodie', image: 'https://files.cdn.printful.com/files/50b/50b8035073b012e6740d938ac93d60cf_preview.png', blurb: 'Sunrise gradient artwork.', tag: 'Hoodie' },
  { id: 417454234, name: 'The Leaf of Life Hoodie', image: 'https://files.cdn.printful.com/files/975/9755d684e3409d4bdc72fa91e9b6b8c9_preview.png', blurb: 'Botanical line-art print.', tag: 'Hoodie' },
  { id: 417454158, name: 'Veins in the Mountains Hoodie', image: 'https://files.cdn.printful.com/files/526/526b6b537741a444467e8942557b9e7c9_preview.png', blurb: 'Topographic mountain design.', tag: 'Hoodie' },
  { id: 417451932, name: 'Balance the Scales Hoodie', image: 'https://files.cdn.printful.com/files/83e/83e09e812493f1647a7316d7d3395b76_preview.png', blurb: 'Symmetry and equilibrium motif.', tag: 'Hoodie' },
];

const byId = new Map(PRODUCTS.map((p) => [p.id, p]));

/** Server-side product lookup. Returns undefined for unknown ids. */
export function getProduct(id) {
  return byId.get(Number(id));
}

/** Price formatting helper (cents -> "CAD $95.00"). */
export function formatPrice(cents) {
  return `CAD $${(cents / 100).toFixed(2)}`;
}
