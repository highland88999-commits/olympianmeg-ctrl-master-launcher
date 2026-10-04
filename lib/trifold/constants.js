// lib/trifold/constants.js
// TRIFOLD — the weekly 3-part newsletter. Merlin renames everything;
// the program name lives in exactly one constant: TRIFOLD_NAME.

export const TRIFOLD_NAME = 'TRIFOLD';
export const TRIFOLD_TAGLINE = 'One week. Three papers. Real, ruin, radiant.';
export const TRIFOLD_PRICE_CENTS = 599;
export const TRIFOLD_PRICE_LABEL = '$5.99';
export const TRIFOLD_TRIAL_DAYS = 90;
export const TRIFOLD_TRIAL_LABEL = '3 months free';

// The three lenses. The two fictional ones MUST always render with a
// FICTION badge — never let a reader mistake them for real news.
export const TRIFOLD_LENSES = [
  {
    key: 'og',
    name: 'The OG',
    subtitle: 'Real',
    blurb: 'The actual top stories from a real newspaper, somewhere in the world.',
    fiction: false,
  },
  {
    key: 'negative',
    name: 'Ruin',
    subtitle: 'Fully negative · FICTION',
    blurb: 'The same week, reimagined at its absolute worst. Pure fiction.',
    fiction: true,
  },
  {
    key: 'positive',
    name: 'Radiant',
    subtitle: 'Fully positive · FICTION',
    blurb: 'The same week, reimagined at its absolute best. Pure fiction.',
    fiction: true,
  },
];

// Weekly newspaper rotation — a different place in the world each week.
// rss: best-effort feed URL (may 404; the fetcher falls back gracefully).
// The cron walks this list in order and logs each pick so it never repeats
// until the full rotation is done.
export const TRIFOLD_NEWSPAPERS = [
  { name: 'The Guardian', region: 'United Kingdom', url: 'https://www.theguardian.com', rss: 'https://www.theguardian.com/world/rss' },
  { name: 'Le Monde', region: 'France', url: 'https://www.lemonde.fr', rss: 'https://www.lemonde.fr/rss/une.xml' },
  { name: 'Al Jazeera', region: 'Qatar', url: 'https://www.aljazeera.com', rss: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'The Japan Times', region: 'Japan', url: 'https://www.japantimes.co.jp', rss: 'https://www.japantimes.co.jp/feed/topstories/' },
  { name: 'Folha de S.Paulo', region: 'Brazil', url: 'https://www.folha.uol.com.br', rss: 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml' },
  { name: 'The Hindu', region: 'India', url: 'https://www.thehindu.com', rss: 'https://www.thehindu.com/news/feeder/default.rss' },
  { name: 'Sydney Morning Herald', region: 'Australia', url: 'https://www.smh.com.au', rss: 'https://www.smh.com.au/rss/feed.xml' },
  { name: 'Mail & Guardian', region: 'South Africa', url: 'https://mg.co.za', rss: 'https://mg.co.za/feed/' },
  { name: 'The Globe and Mail', region: 'Canada', url: 'https://www.theglobeandmail.com', rss: 'https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/news/' },
  { name: 'El País', region: 'Spain', url: 'https://elpais.com', rss: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada' },
  { name: 'The Straits Times', region: 'Singapore', url: 'https://www.straitstimes.com', rss: 'https://www.straitstimes.com/news/singapore/rss.xml' },
  { name: 'La Nación', region: 'Argentina', url: 'https://www.lanacion.com.ar', rss: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/' },
];

export function nextNewspaper(rotationIndex) {
  const idx = ((rotationIndex || 0) % TRIFOLD_NEWSPAPERS.length + TRIFOLD_NEWSPAPERS.length) % TRIFOLD_NEWSPAPERS.length;
  return { paper: TRIFOLD_NEWSPAPERS[idx], nextIndex: idx + 1 };
}
