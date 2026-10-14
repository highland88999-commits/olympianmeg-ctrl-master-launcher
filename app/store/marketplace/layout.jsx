// app/store/marketplace/layout.jsx — route metadata for the Creator
// Marketplace (server component; the page itself is a client component
// and cannot export metadata). Renders children unchanged.

const SITE_URL = 'https://olympusverse.com';
const SITE_NAME = 'NEXUS VORTEX';
const TITLE = 'Creator Marketplace';
const FULL_TITLE = `${TITLE} | ${SITE_NAME}`;
const DESCRIPTION =
  'Designs made by the Olympus community — every creator sets their own markup and earns on every sale. Printed on demand at the Omega Store.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/store/marketplace` },
  openGraph: {
    title: FULL_TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/store/marketplace`,
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

export default function MarketplaceLayout({ children }) {
  return children;
}
