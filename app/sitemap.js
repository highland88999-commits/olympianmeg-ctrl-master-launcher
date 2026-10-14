// app/sitemap.js — generated sitemap for olympusverse.com.
//
// The 135 program routes are derived from lib/god-menus.js (the canonical
// navigation layer), so the sitemap can never drift from the menu. Key hub
// routes get higher priority; everything else is a standard program entry.

import { allGodMenuSatellites } from '@/lib/god-menus';
import { SEO_SITE } from '@/lib/seo';

const BASE = SEO_SITE.url;

// Key landing pages worth crawling first (all are also program routes,
// listed here only for their priority/frequency bump).
const KEY_ROUTES = new Set(['store', 'hermes', 'babel', 'agora', 'mega-city']);

export default function sitemap() {
  const now = new Date();
  const entries = [
    {
      url: BASE,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
  ];

  for (const key of allGodMenuSatellites()) {
    const keyRoute = KEY_ROUTES.has(key);
    entries.push({
      url: `${BASE}/${key}`,
      lastModified: now,
      changeFrequency: keyRoute ? 'weekly' : 'monthly',
      priority: keyRoute ? 0.8 : 0.6,
    });
  }

  // Nested routes that are not god-menu satellites (store family,
  // newsletter) — appended only if a satellite route didn't already
  // produce the same URL, so the sitemap never lists a page twice.
  const seen = new Set(entries.map((e) => e.url));
  const EXTRA_ROUTES = [
    { path: '/store/marketplace', changeFrequency: 'weekly', priority: 0.8 },
    { path: '/store/custom', changeFrequency: 'weekly', priority: 0.8 },
    { path: '/trifold', changeFrequency: 'weekly', priority: 0.7 },
  ];
  for (const r of EXTRA_ROUTES) {
    const url = `${BASE}${r.path}`;
    if (seen.has(url)) continue;
    entries.push({
      url,
      lastModified: now,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    });
  }

  return entries;
}
