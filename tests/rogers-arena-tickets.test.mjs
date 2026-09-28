// tests/rogers-arena-tickets.test.mjs
// Headless tests for the Rogers Arena ticket booking section.
// Run: node tests/rogers-arena-tickets.test.mjs (from the repo root).
// Pure logic in lib/tickets.js is tested behaviorally; the server routes and
// client components are tested structurally (key isolation, honest copy,
// no fake listings) because they need the Next.js runtime.
import { readFileSync } from 'fs';
import {
  TICKETMASTER_ENV_VAR,
  TICKETMASTER_BASE,
  POPULAR_VENUES,
  CATEGORY_LABELS,
  allowedTicketUrl,
  normalizeVenue,
  normalizeEvent,
  normalizeEventDetail,
  normalizePrice,
  categoryFor,
  filterByCategory,
  formatEventDate,
  formatPrice,
  venueSearchUrl,
  venueEventsUrl,
  eventDetailUrl,
  OFFLINE_COPY,
} from '../lib/tickets.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- env var contract: exactly one, server-side only ---
t('env var is TICKETMASTER_API_KEY', TICKETMASTER_ENV_VAR === 'TICKETMASTER_API_KEY');
t('base is the Ticketmaster Discovery API', TICKETMASTER_BASE === 'https://app.ticketmaster.com/discovery/v2');

// --- deep-link allowlist: only ticketmaster.com checkout links pass ---
t('allows www.ticketmaster.com https link',
  allowedTicketUrl('https://www.ticketmaster.com/event/123') === 'https://www.ticketmaster.com/event/123');
t('allows bare ticketmaster.com',
  allowedTicketUrl('https://ticketmaster.com/checkout') === 'https://ticketmaster.com/checkout');
t('rejects lookalike domain', allowedTicketUrl('https://ticketmaster.com.evil.com/x') === null);
t('rejects plain http', allowedTicketUrl('http://www.ticketmaster.com/x') === null);
t('rejects non-url junk', allowedTicketUrl('not a url') === null);
t('rejects empty', allowedTicketUrl('') === null);
t('rejects null', allowedTicketUrl(null) === null);

// --- URL builders: key travels as apikey query param, server-side ---
const built = venueSearchUrl('SECRET_KEY', 'Rogers Arena');
t('venue search hits /venues.json', built.includes('/venues.json'));
t('venue search encodes query', built.includes('keyword=Rogers%20Arena'));
t('venue search carries apikey param', built.includes('apikey=SECRET_KEY'));
const evBuilt = venueEventsUrl('SECRET_KEY', 'KovZpZA7AAEA');
t('events url scopes to venueId', evBuilt.includes('venueId=KovZpZA7AAEA'));
t('events url sorts soonest-first', evBuilt.includes('sort=date,asc'));
t('events url starts at now', evBuilt.includes('startDateTime='));
const detBuilt = eventDetailUrl('SECRET_KEY', 'vvG1HZabc');
t('detail url targets the event id', detBuilt.includes('/events/vvG1HZabc.json'));

// --- venue normalization ---
const venueRaw = {
  id: 'KovZpZA7AAEA', name: 'Rogers Arena',
  city: { name: 'Vancouver' }, state: { name: 'British Columbia', stateCode: 'BC' },
  country: { name: 'Canada' }, address: { line1: '800 Griffiths Way' },
  upcomingEvents: { _total: 42 },
  images: [{ url: 'https://example.com/a.jpg', ratio: '16_9', width: 1024 }],
};
const v = normalizeVenue(venueRaw);
t('venue keeps id/name', v && v.id === 'KovZpZA7AAEA' && v.name === 'Rogers Arena');
t('venue flattens location', v.city === 'Vancouver' && v.region === 'BC' && v.country === 'Canada');
t('venue keeps upcoming count', v.upcomingEvents === 42);
t('venue without id is null', normalizeVenue({ name: 'Nope' }) === null);
t('venue null input is null', normalizeVenue(null) === null);

// --- event normalization ---
const eventRaw = {
  id: 'vvG1HZabc', name: 'Canucks vs. Oilers',
  url: 'https://www.ticketmaster.com/event/abc',
  dates: { start: { localDate: '2026-10-10', localTime: '19:00:00', dateTime: '2026-10-11T02:00:00Z' }, status: { code: 'onsale' }, timezone: 'America/Vancouver' },
  classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Hockey' } }],
  priceRanges: [{ type: 'standard', currency: 'CAD', min: 45, max: 320 }],
  images: [{ url: 'https://example.com/e.jpg', ratio: '16_9', width: 800 }],
  _embedded: { venues: [venueRaw] },
};
const e = normalizeEvent(eventRaw);
t('event keeps id/name', e && e.id === 'vvG1HZabc' && e.name === 'Canucks vs. Oilers');
t('hockey detected as hockey category', e.category === 'hockey');
t('event keeps local date/time', e.localDate === '2026-10-10' && e.localTime === '19:00:00');
t('event keeps ticket url', e.ticketUrl === 'https://www.ticketmaster.com/event/abc');
t('event embeds venue', e.venue && e.venue.name === 'Rogers Arena');
t('event keeps price', e.price && e.price.min === 45 && e.price.max === 320 && e.price.currency === 'CAD');
t('cancelled events are dropped',
  normalizeEvent({ ...eventRaw, dates: { ...eventRaw.dates, status: { code: 'cancelled' } } }) === null);
t('event without id is null', normalizeEvent({ name: 'Nope' }) === null);

// --- categories ---
t('music -> concerts', categoryFor('Music', 'Rock') === 'concerts');
t('sports non-hockey -> sports', categoryFor('Sports', 'Basketball') === 'sports');
t('arts & theatre -> arts', categoryFor('Arts & Theatre', 'Theatre') === 'arts');
t('filter hockey only', filterByCategory([e], 'hockey').length === 1);
t('filter concerts excludes hockey', filterByCategory([e], 'concerts').length === 0);
t('filter all passes through', filterByCategory([e], 'all').length === 1);
t('category labels cover all keys', CATEGORIES_OK());

function CATEGORIES_OK() {
  return ['all', 'hockey', 'concerts', 'sports', 'arts', 'other'].every((c) => CATEGORY_LABELS[c]);
}

// --- price formatting ---
t('price range formats', formatPrice({ currency: 'CAD', min: 45, max: 320 }) === '$45–$320 CAD');
t('single price formats as from', formatPrice({ currency: 'USD', min: 60, max: null }) === 'from $60 USD');
t('no price is empty string', formatPrice(null) === '');

// --- date formatting ---
t('date formats readably', /^Sat, Oct 10, 2026 · /.test(formatEventDate(e)));
t('missing date is empty', formatEventDate({}) === '');

// --- detail normalization ---
const d = normalizeEventDetail({ ...eventRaw, seatmap: { staticUrl: 'https://example.com/seat.png' }, pleaseNote: 'No bags.', info: 'Doors at 6.' });
t('detail keeps seatmap', d.seatmap === 'https://example.com/seat.png');
t('detail keeps notes', d.pleaseNote === 'No bags.' && d.info === 'Doors at 6.');

// --- honest offline copy ---
t('offline title is honest', OFFLINE_COPY.title === 'Ticket listings are offline');
t('offline body admits no placeholder events', /no placeholder events/i.test(OFFLINE_COPY.body));

// --- popular venue suggestions are search terms, not listings ---
t('popular venues are real stadium names', POPULAR_VENUES.length >= 4 && POPULAR_VENUES.includes('Rogers Arena'));

// --- structural: key isolation -------------------------------------------
const routes = ['venues', 'events', 'event'].map(
  (r) => readFileSync(`app/rogers-arena/api/${r}/route.js`, 'utf8')
);
const serverLib = readFileSync('lib/tickets-server.js', 'utf8');
const clientUi = readFileSync('app/rogers-arena/tickets.jsx', 'utf8');
const sharedLib = readFileSync('lib/tickets.js', 'utf8');
const page = readFileSync('app/rogers-arena/page.jsx', 'utf8');

t('client UI never mentions the env var name', !clientUi.includes('TICKETMASTER_API_KEY'));
t('client UI never calls Ticketmaster directly', !clientUi.includes('app.ticketmaster.com'));
t('client UI never imports the server helper', !clientUi.includes('tickets-server'));
t('client UI only talks to our own api routes', /\/rogers-arena\/api\//.test(clientUi));
t('shared lib never reads process.env', !sharedLib.includes('process.env'));
t('key is read only in the server helper', serverLib.includes('process.env[TICKETMASTER_ENV_VAR]'));
t('routes read the key via the server helper', routes.every((r) => r.includes('ticketmasterKey()')));
t('routes serve honest offline state', routes.every((r) => r.includes('offlineResponse()')));
t('routes never log the key', routes.every((r) => !/console\.(log|info|debug|error)/.test(r)));
t('server helper never logs the key', !/console\.(log|info|debug|error)/.test(serverLib));
t('routes mark force-dynamic', routes.every((r) => r.includes("dynamic = 'force-dynamic'")));

// --- structural: honest purchase handoff -----------------------------------
t('handoff button is honestly labeled',
  clientUi.includes('Continue to Ticketmaster to complete purchase'));
t('handoff says it leaves the app', /leave this app/i.test(clientUi));
t('handoff opens in a new tab safely',
  clientUi.includes('target="_blank"') && clientUi.includes('rel="noopener noreferrer"'));
t('no card-details claim', /never take your card details/i.test(clientUi));

// --- structural: module wiring ---------------------------------------------
t('page keeps the 3D vignette', page.includes('createArenaScene'));
t('page adds the tickets tab', page.includes("setTab('tickets')") || page.includes('Tickets'));
t('page renders the Tickets section', page.includes('<Tickets'));
t('tickets UI shows the offline copy', clientUi.includes('OFFLINE_COPY'));
t('tickets UI has venue search', clientUi.includes('Search a stadium'));
t('tickets UI has 44px touch targets', /min-h-\[4[48]px\]/.test(clientUi));
t('zero external scripts in ticket UI', !/<script/.test(clientUi));

console.log(`\nrogers-arena-tickets: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
