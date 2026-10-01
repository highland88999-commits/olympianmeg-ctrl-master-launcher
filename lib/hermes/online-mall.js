// lib/hermes/online-mall.js
// Pure helpers for Merlin's Online Mall section on /hermes.
// No I/O, no framework dependencies — fully headless-testable.

import { CATEGORIES } from './listings.js';

// His ambient card-background videos, self-hosted (media/ from his Hermes-Landing repo).
export const MALL_VIDEOS = [
  '/hermes/mall-burst.mp4',
  '/hermes/mall-roses.mp4',
];

export const MALL_LOGO = '/hermes/online-mall-logo.jpeg';

/** Pretty category label for the mall page header. */
export function labelForCategory(slug) {
  if (!slug) return 'UNCATEGORIZED';
  if (CATEGORIES[slug]) return CATEGORIES[slug].toUpperCase();
  return slug.replace(/_/g, ' ').toUpperCase();
}

/** URL formatter to prevent relative Next.js routing errors (his, verbatim). */
export function formatMallUrl(url) {
  if (!url) return '#';
  return url.startsWith('http') ? url : `https://${url}`;
}

/** Group approved listings by category for the slidable mall pages (his grouping, verbatim). */
export function groupLinksByCategory(links) {
  const grouped = (links || []).reduce((acc, link) => {
    const cat = link.category || 'Uncategorized';
    if (!acc[cat]) {
      acc[cat] = [];
    }
    acc[cat].push(link);
    return acc;
  }, {});
  return { grouped, categories: Object.keys(grouped) };
}

/** Cycle index into the self-hosted background videos. */
export function mallVideoFor(index) {
  return MALL_VIDEOS[index % MALL_VIDEOS.length];
}
