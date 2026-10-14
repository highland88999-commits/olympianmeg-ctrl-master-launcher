// app/store/layout.jsx — route metadata for the Omega Store (server
// component; the store page itself is a client component and cannot
// export metadata). Same shape as lib/seo.js programMetadata().
// Renders children unchanged — metadata only, zero DOM/visual change.

const SITE_URL = 'https://olympusverse.com';
const SITE_NAME = 'NEXUS VORTEX';
const TITLE = 'Omega Store';
const FULL_TITLE = `${TITLE} | ${SITE_NAME}`;
const DESCRIPTION =
  'Shop the Omega Store — every design printed on demand: hoodies, tees, sweatshirts, joggers, mugs, tumblers, posters, canvas, stickers and more, from the NEXUS VORTEX master hub.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/store` },
  openGraph: {
    title: FULL_TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/store`,
    siteName: SITE_NAME,
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 600,
        alt: FULL_TITLE,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: FULL_TITLE,
    description: DESCRIPTION,
    images: [`${SITE_URL}/og-image.png`],
  },
};

export default function StoreLayout({ children }) {
  return children;
}
