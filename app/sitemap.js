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

  return entries;
}
