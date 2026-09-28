// lib/tickets.js
// Real-event ticket data helpers for the Rogers Arena ticket booking section.
// Data source: Ticketmaster Discovery API v2 (free tier).
// Auth: the API key lives ONLY in the Vercel env var TICKETMASTER_API_KEY and
// is read inside Next.js server routes (app/rogers-arena/api/*). It is NEVER
// shipped to the browser — the client only talks to our own /api routes.
//
// Zero fake listings rule: every venue, event, and price shown in the UI must
// come from a live Ticketmaster response. When the env var is missing the
// server routes return { offline: true } (HTTP 503) and the UI shows an
// honest "offline" state instead of placeholder events.

export const TICKETMASTER_ENV_VAR = 'TICKETMASTER_API_KEY';
export const TICKETMASTER_BASE = 'https://app.ticketmaster.com/discovery/v2';

// Suggestion shortcuts for the venue search box. These are real stadium names
// used as search terms only — the listings themselves always come from the API.
export const POPULAR_VENUES = [
  'Rogers Arena',
  'Rogers Centre',
  'Scotiabank Arena',
  'Madison Square Garden',
  'Wembley Stadium',
  'Bell Centre',
];

// ---- Deep-link safety ------------------------------------------------------
// Purchases never happen in this app. The only outbound link is the official
// Ticketmaster checkout page supplied by the API. We allowlist it so a weird
// API response can never turn the button into an open redirect.
export function allowedTicketUrl(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  if (host === 'ticketmaster.com' || host.endsWith('.ticketmaster.com')) {
    return u.toString();
  }
  return null;
}

// ---- Request builders (server routes only — key never leaves the server) --
export function venueSearchUrl(key, query) {
  const q = encodeURIComponent(String(query || '').trim());
  return `${TICKETMASTER_BASE}/venues.json?keyword=${q}&apikey=${encodeURIComponent(key)}&size=20&locale=*`;
}

export function venueEventsUrl(key, venueId) {
  const id = encodeURIComponent(String(venueId || ''));
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return (
    `${TICKETMASTER_BASE}/events.json?venueId=${id}&apikey=${encodeURIComponent(key)}` +
    `&sort=date,asc&startDateTime=${encodeURIComponent(now)}&size=100&locale=*`
  );
}

export function eventDetailUrl(key, eventId) {
  const id = encodeURIComponent(String(eventId || ''));
  return `${TICKETMASTER_BASE}/events/${id}.json?apikey=${encodeURIComponent(key)}&locale=*`;
}

// ---- Normalizers: TM payload -> plain objects the UI consumes --------------
// Each returns null when the record is unusable, so the UI can skip it rather
// than invent data.
export function normalizeVenue(v) {
  if (!v || typeof v !== 'object' || !v.id || !v.name) return null;
  return {
    id: String(v.id),
    name: String(v.name),
    city: v.city?.name ? String(v.city.name) : '',
    region: v.state?.stateCode ? String(v.state.stateCode) : v.state?.name ? String(v.state.name) : '',
    country: v.country?.name ? String(v.country.name) : '',
    address: v.address?.line1 ? String(v.address.line1) : '',
    upcomingEvents: typeof v.upcomingEvents?._total === 'number' ? v.upcomingEvents._total : null,
    image: pickImage(v.images),
  };
}

export function normalizeEvent(e) {
  if (!e || typeof e !== 'object' || !e.id || !e.name) return null;
  const status = e.dates?.status?.code ? String(e.dates.status.code) : '';
  if (status === 'cancelled') return null; // cancelled shows are not bookable
  const cls = Array.isArray(e.classifications) && e.classifications[0] ? e.classifications[0] : {};
  const segment = cls.segment?.name ? String(cls.segment.name) : '';
  const genre = cls.genre?.name ? String(cls.genre.name) : '';
  const start = e.dates?.start || {};
  const venue = Array.isArray(e._embedded?.venues) && e._embedded.venues[0]
    ? normalizeVenue(e._embedded.venues[0])
    : null;
  return {
    id: String(e.id),
    name: String(e.name),
    segment,
    genre,
    category: categoryFor(segment, genre),
    localDate: start.localDate ? String(start.localDate) : '',
    localTime: start.localTime ? String(start.localTime) : '',
    dateTime: start.dateTime ? String(start.dateTime) : '',
    timezone: e.dates?.timezone ? String(e.dates.timezone) : '',
    status,
    price: normalizePrice(e.priceRanges),
    image: pickImage(e.images),
    ticketUrl: allowedTicketUrl(e.url),
    venue,
  };
}

export function normalizeEventDetail(e) {
  const base = normalizeEvent(e);
  if (!base) return null;
  return {
    ...base,
    seatmap: typeof e.seatmap?.staticUrl === 'string' && e.seatmap.staticUrl ? String(e.seatmap.staticUrl) : null,
    info: typeof e.info === 'string' ? e.info : '',
    pleaseNote: typeof e.pleaseNote === 'string' ? e.pleaseNote : '',
    ticketLimit: typeof e.ticketLimit?.info === 'string' ? e.ticketLimit.info : '',
    salesPublic: e.sales?.public?.startDateTime ? String(e.sales.public.startDateTime) : '',
  };
}

export function normalizePrice(ranges) {
  if (!Array.isArray(ranges) || ranges.length === 0) return null;
  const r = ranges[0];
  if (typeof r.min !== 'number') return null;
  return {
    currency: typeof r.currency === 'string' ? r.currency : '',
    min: r.min,
    max: typeof r.max === 'number' ? r.max : null,
  };
}

export function categoryFor(segment, genre) {
  const s = String(segment || '').toLowerCase();
  const g = String(genre || '').toLowerCase();
  if (s === 'sports' && g === 'hockey') return 'hockey';
  if (s === 'sports') return 'sports';
  if (s === 'music') return 'concerts';
  if (s === 'arts & theatre' || s === 'arts and theatre') return 'arts';
  if (s) return 'other';
  return 'other';
}

export const CATEGORY_LABELS = {
  all: 'All',
  hockey: 'Hockey',
  concerts: 'Concerts',
  sports: 'Sports',
  arts: 'Arts & Theatre',
  other: 'Other',
};

export function filterByCategory(events, category) {
  if (!Array.isArray(events)) return [];
  if (!category || category === 'all') return events;
  return events.filter((e) => e && e.category === category);
}

function pickImage(images) {
  if (!Array.isArray(images) || images.length === 0) return null;
  // Prefer a mid-size 16:9 image; fall back to the first usable URL.
  const wide = images.find(
    (im) => im && typeof im.url === 'string' && im.ratio === '16_9' && im.width >= 640
  );
  const any = images.find((im) => im && typeof im.url === 'string' && im.url.startsWith('https://'));
  const chosen = wide || any;
  return chosen ? String(chosen.url) : null;
}

// Human-friendly venue-local date/time, e.g. "Sat, Oct 10, 2026 · 7:00 PM".
// Uses the venue's wall clock (localDate/localTime) rather than converting to
// the viewer's timezone — a ticket buyer cares when doors open at the venue.
export function formatEventDate(ev) {
  if (!ev) return '';
  const local = ev.localDate ? `${ev.localDate}T${ev.localTime || '00:00:00'}` : '';
  const src = local || ev.dateTime || '';
  if (!src) return '';
  const d = new Date(src);
  if (Number.isNaN(d.getTime())) return [ev.localDate, ev.localTime].filter(Boolean).join(' ');
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const time = ev.localTime
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';
  return time ? `${date} · ${time}` : date;
}

export function formatPrice(price) {
  if (!price || typeof price.min !== 'number') return '';
  const cur = price.currency ? ` ${price.currency}` : '';
  const lo = price.min % 1 === 0 ? price.min.toFixed(0) : price.min.toFixed(2);
  if (price.max != null && price.max > price.min) {
    const hi = price.max % 1 === 0 ? price.max.toFixed(0) : price.max.toFixed(2);
    return `$${lo}–$${hi}${cur}`;
  }
  return `from $${lo}${cur}`;
}

export const OFFLINE_COPY = {
  title: 'Ticket listings are offline',
  body: 'The ticket provider key is not configured yet, so there are no real listings to show. No placeholder events are displayed.',
};
