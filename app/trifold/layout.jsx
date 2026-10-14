// app/trifold/layout.jsx — route metadata for Trifold, the weekly News
// newsletter (server component; the page itself is a client component
// and cannot export metadata). Renders children unchanged.

const SITE_URL = 'https://olympusverse.com';
const SITE_NAME = 'NEXUS VORTEX';
const TITLE = 'Trifold';
const FULL_TITLE = `${TITLE} | ${SITE_NAME}`;
const DESCRIPTION =
  'Trifold — the weekly News newsletter: the real story summarized and linked, plus a fully negative and a fully positive fictional edition. Free for 3 months.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/trifold` },
  openGraph: {
    title: FULL_TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/trifold`,
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

export default function TrifoldLayout({ children }) {
  return children;
}
