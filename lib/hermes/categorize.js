// lib/hermes/categorize.js
// Pure keyword ruleset for the HERMES directory categorizer.
// No I/O, no framework dependencies — fully headless-testable.
//
// suggestCategory({ name, url, rootDomain }) -> { slug, confidence }
//   confidence: 'high'   — exact known-domain match or multiple strong signals
//               'medium' — one solid keyword signal
//               'low'    — nothing matched; falls back to 'other'
//
// The hourly hermes-categorizer applies these rules to listings sitting in
// 'other' and only writes the category when confidence is high or medium.
// Low-confidence listings are left alone and reported for a human decision.
import { CATEGORY_SLUGS } from './listings.js';

// Merlin's own house links: exact root-domain -> category, always high confidence.
// Tracking URLs are never altered — only the category is assigned.
const HOUSE_DOMAINS = {
  'margovil.pxf.io': 'apparel',
  'globaloneclicktechnologycolimited.pxf.io': 'leisure',
  'openartai.pxf.io': 'tech',
  'gearup.sjv.io': 'gaming',
  'petscosset.pxf.io': 'pets',
  'missacccom.pxf.io': 'apparel',
  'helloprenupinc.sjv.io': 'legal',
  'stake.com': 'gaming',
  'betty.ca': 'gaming',
};

// Keyword signals per category slug. Checked against the lowercased
// name + url + root domain. Keep signals distinctive — generic words
// ('shop', 'online', 'best') are deliberately absent.
const KEYWORDS = {
  apparel: ['fashion', 'apparel', 'clothing', 'hoodie', 'streetwear', 'boutique', 'dress', 'sneaker', 'denim'],
  leisure: ['cycling', 'bike', 'bicycle', 'wheeltop', 'fitness', 'gym', 'sport', 'outdoor', 'hiking', 'golf', 'attraction', 'leisure'],
  tech: ['openart', 'artificial intelligence', ' ai ', 'ai-', '-ai', 'software', 'saas', 'cloud', 'devtool', 'api platform'],
  gaming: ['gaming', 'game', 'esports', 'casino', 'slots', 'betting', 'stake', 'betty', 'poker', 'xbox', 'playstation', 'steam'],
  pets: ['pet', 'petscosset', 'dog', 'cat', 'puppy', 'kitten', 'veterinary', 'vet clinic', 'aquarium'],
  legal: ['legal', 'law firm', 'lawyer', 'attorney', 'prenup', 'helloprenup', 'notary', 'counsel'],
  food: ['restaurant', 'recipe', 'coffee', 'pizza', 'burger', 'bakery', 'brewery', 'cocktail'],
  travel: ['travel', 'hotel', 'flight', 'vacation', 'airbnb', 'booking.com', 'expedia', 'cruise'],
  finance: ['fintech', 'invest', 'broker', 'trading', 'crypto', 'bitcoin', 'wallet', 'neobank'],
  banking: ['bank', 'credit union', 'mortgage', 'loan'],
  real_estate: ['realty', 'realtor', 'real estate', 'property listing', 'zillow', 'redfin'],
  employment: ['jobs', 'career', 'hiring', 'recruit', 'resume', 'job board'],
  motor_pool: ['mechanic', 'auto repair', 'garage', 'oil change', 'tire shop'],
  hardware: ['hardware store', 'power tools', 'equipment auction', 'machinery'],
  mobile: ['mobile plan', 'cellular', 'telecom', 'voip', 'esim'],
  jewelry: ['jewelry', 'jewellery', 'watch', 'watches', 'diamond', 'engagement ring'],
  beauty: ['beauty', 'skincare', 'makeup', 'cosmetic', 'salon', 'spa'],
  home: ['furniture', 'mattress', 'interior design', 'decor'],
  home_goods: ['kitchen', 'cookware', 'bedding', 'home goods'],
  audio: ['audio', 'headphones', 'speaker', 'podcast', 'music production', 'spotify'],
  entertainment: ['movie', 'film', 'streaming', 'netflix', 'media', 'entertainment'],
  tcg: ['tcg', 'trading card', 'pokemon card', 'magic: the gathering'],
  spatial_web: ['3d engine', 'unreal engine', 'unity3d', 'blender', 'game engine'],
  web3: ['web3', 'nft', 'defi', 'dapp', 'blockchain game'],
  kids: ['kids', 'children', 'toy', 'baby', 'toddler'],
  archives: ['course', 'learn', 'academy', 'library', 'textbook', 'education'],
  investment: ['hedge fund', 'venture capital', 'portfolio management', 'wealth management'],
  industrial: ['industrial supply', 'manufacturing', 'blueprint', 'cnc'],
};

function haystackOf({ name = '', url = '', rootDomain = '' }) {
  return ` ${String(name).toLowerCase()} ${String(url).toLowerCase()} ${String(rootDomain).toLowerCase()} `;
}

export function suggestCategory(input = {}) {
  const hay = haystackOf(input);
  const domain = String(input.rootDomain || '').toLowerCase().replace(/^www\./, '');

  // 1. Exact house-domain match — always high confidence.
  if (domain && HOUSE_DOMAINS[domain]) {
    return { slug: HOUSE_DOMAINS[domain], confidence: 'high' };
  }

  // 2. Keyword signals. Two or more distinct hits -> high; one hit -> medium.
  let best = null;
  let bestHits = 0;
  for (const [slug, words] of Object.entries(KEYWORDS)) {
    if (!CATEGORY_SLUGS.includes(slug)) continue;
    const hits = words.filter((w) => hay.includes(w)).length;
    if (hits > bestHits) {
      best = slug;
      bestHits = hits;
    }
  }
  if (best && bestHits >= 2) return { slug: best, confidence: 'high' };
  if (best && bestHits === 1) return { slug: best, confidence: 'medium' };

  // 3. Nothing matched.
  return { slug: 'other', confidence: 'low' };
}

export const CATEGORIZER_RULES_VERSION = 1;
