// lib/hermes/listings.js
// Pure business logic for the HERMES paid link directory.
// No I/O, no framework dependencies — fully headless-testable.

export const LISTING_FEE_CENTS = 200;
export const LISTING_FEE_USD = 2.0;
export const LISTING_TERM_MONTHS = 12;
export const MAX_NAME_LENGTH = 40;
export const MAX_URL_LENGTH = 2048;
export const PENDING_TTL_HOURS = 24;

// Category slugs with plain-English labels.
export const CATEGORIES = {
  home: 'Home',
  core: 'Multiverse Core',
  featured: 'Featured',
  real_estate: 'Real Estate & Property',
  investment: 'Investment',
  banking: 'Banking & Accounts',
  gaming: 'Gaming',
  tcg: 'Trading Card Games',
  tech: 'Technology',
  spatial_web: '3D & Game Engines',
  web3: 'Web3 & Decentralized',
  employment: 'Jobs & Careers',
  motor_pool: 'Garage & Mechanics',
  industrial: 'Industry & Blueprints',
  hardware: 'Hardware & Auctions',
  mobile: 'Mobile & Comms',
  apparel: 'Apparel',
  jewelry: 'Jewelry & Watches',
  beauty: 'Health & Beauty',
  home_goods: 'Home & Living',
  pets: 'Pets',
  leisure: 'Leisure & Attractions',
  food: 'Food & Drink',
  travel: 'Travel',
  finance: 'Crypto & Fintech',
  audio: 'Audio & Music',
  entertainment: 'Media & Entertainment',
  kids: 'Kids',
  archives: 'Archives & Learning',
  legal: 'Legal & Services',
  other: 'Other',
};

export const CATEGORY_SLUGS = Object.keys(CATEGORIES);

export const LISTING_TERMS = {
  feeCents: LISTING_FEE_CENTS,
  feeDisplay: `$${LISTING_FEE_USD.toFixed(2)} USD`,
  termMonths: LISTING_TERM_MONTHS,
  summary: `$${LISTING_FEE_USD.toFixed(2)} USD one-time fee. Your listing stays live for ${LISTING_TERM_MONTHS} months. One listing per domain. Full refund if you ask before your listing is approved; approved listings are non-refundable.`,
};

/** Normalize a raw URL string: trim, add https:// if missing, validate. */
export function normalizeUrl(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Enter a valid website address.' };
  let value = raw.trim().slice(0, MAX_URL_LENGTH);
  if (!value) return { ok: false, error: 'Enter a valid website address.' };
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) {
    value = `https://${value}`;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: 'That address is not valid. Include the full address, e.g. https://example.com.' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'Only web addresses (http/https) are accepted.' };
  }
  return { ok: true, url: parsed.toString() };
}

/** Extract the root domain (no www.) for the one-listing-per-domain rule. */
export function extractRootDomain(urlString) {
  const normalized = normalizeUrl(urlString);
  if (!normalized.ok) return null;
  try {
    return new URL(normalized.url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/** Validate and sanitize a listing submission. Returns { ok, data } or { ok:false, errors }. */
export function validateSubmission(input) {
  const errors = [];
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const urlRaw = typeof input?.url === 'string' ? input.url.trim() : '';
  const category = typeof input?.category === 'string' ? input.category.trim() : '';

  if (!name) {
    errors.push('Give your listing a name.');
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.push(`Keep the name under ${MAX_NAME_LENGTH} characters.`);
  }

  const urlCheck = normalizeUrl(urlRaw);
  if (!urlCheck.ok) errors.push(urlCheck.error);

  if (!CATEGORY_SLUGS.includes(category)) {
    errors.push('Pick a category from the list.');
  }

  if (errors.length > 0) return { ok: false, errors };

  const domain = extractRootDomain(urlCheck.url);
  if (!domain) return { ok: false, errors: ['Could not read the domain from that address.'] };

  return {
    ok: true,
    data: {
      name: name.slice(0, MAX_NAME_LENGTH),
      url: urlCheck.url,
      rootDomain: domain,
      category,
    },
  };
}

/** True when the domain already has a listing (anti-monopoly rule). */
export function isDuplicateDomain(rootDomain, existingDomains) {
  if (!rootDomain || !Array.isArray(existingDomains)) return false;
  const needle = rootDomain.toLowerCase();
  return existingDomains.some((d) => String(d).toLowerCase() === needle);
}

/** ISO cutoff: pending submissions older than this are scrubbed. */
export function scrubCutoffIso(nowMs = Date.now(), ttlHours = PENDING_TTL_HOURS) {
  return new Date(nowMs - ttlHours * 60 * 60 * 1000).toISOString();
}

/** True when a pending submission is old enough to scrub. */
export function isStalePending(createdAtIso, nowMs = Date.now(), ttlHours = PENDING_TTL_HOURS) {
  const created = Date.parse(createdAtIso);
  if (Number.isNaN(created)) return false;
  return created < nowMs - ttlHours * 60 * 60 * 1000;
}

/** Expiry date for a newly approved listing. */
export function listingExpiryIso(fromMs = Date.now()) {
  const d = new Date(fromMs);
  d.setMonth(d.getMonth() + LISTING_TERM_MONTHS);
  return d.toISOString();
}

/** Build the Stripe product name/description from validated data (server-side only). */
export function buildLineItem(validated) {
  return {
    name: `Hermes directory listing: ${validated.name}`,
    description: `One ${LISTING_TERM_MONTHS}-month directory listing for ${validated.rootDomain}.`,
    unit_amount: LISTING_FEE_CENTS,
    currency: 'usd',
    quantity: 1,
  };
}
