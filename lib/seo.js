// lib/seo.js — SEO helpers for the NEXUS VORTEX launcher.
//
// programMetadata(key) builds per-route metadata for any of the 135 program
// routes from the canonical sources:
//   - display title / subtitle: lib/i18n/locales/en.json  (sat.<key>.title …)
//   - god category:             lib/god-menus.js          (godMenuFor)
// Plain JS, no dependencies, no JSX — safe to import from sitemap.js,
// robots-adjacent routes, and any server component's generateMetadata.
//
// NOTE on titles: the root layout defines title.template = '%s | NEXUS VORTEX',
// so `title` below is the bare program title and the template composes the
// full <title>. openGraph.title / twitter.title do NOT go through the
// template, so they carry the composed string explicitly.

import { godMenuFor } from './god-menus.js';
import en from './i18n/locales/en.json';

const SITE_URL = 'https://olympusverse.com';
const SITE_NAME = 'NEXUS VORTEX';

function titleFor(key) {
  return en[`sat.${key}.title`] || key;
}

function subtitleFor(key) {
  return en[`sat.${key}.subtitle`] || '';
}

function descriptionFor(key) {
  const title = titleFor(key);
  const subtitle = subtitleFor(key);
  const menu = godMenuFor(key);
  const category = menu ? menu.category : '';
  const where = category ? ` in ${category}` : '';
  const what = subtitle ? `${title} — ${subtitle}` : title;
  return `${what}${where}, one of 135 pocket universes on the ${SITE_NAME} master hub.`;
}

/**
 * Per-program metadata for a program route (e.g. app/chess/page.jsx).
 * Usage in a SERVER component:
 *   import { programMetadata } from '@/lib/seo';
 *   export async function generateMetadata() { return programMetadata('chess'); }
 */
export function programMetadata(key) {
  const title = titleFor(key);
  const description = descriptionFor(key);
  const fullTitle = `${title} | ${SITE_NAME}`;
  const url = `${SITE_URL}/${key}`;
  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: SITE_NAME,
      type: 'website',
      locale: 'en_US',
      images: [
        {
          url: `${SITE_URL}/og-image.png`,
          width: 1200,
          height: 600,
          alt: `${fullTitle} — ${SITE_NAME}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [`${SITE_URL}/og-image.png`],
    },
  };
}

/** Site-wide constants, shared by layout / sitemap / robots. */
export const SEO_SITE = {
  url: SITE_URL,
  name: SITE_NAME,
  locale: 'en_US',
};
