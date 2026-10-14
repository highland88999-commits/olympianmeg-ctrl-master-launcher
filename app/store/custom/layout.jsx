// app/store/custom/layout.jsx — route metadata for the Custom Product
// Designer (server component; the page itself is a client component and
// cannot export metadata). Renders children unchanged.

const SITE_URL = 'https://olympusverse.com';
const SITE_NAME = 'NEXUS VORTEX';
const TITLE = 'Custom Product Designer';
const FULL_TITLE = `${TITLE} | ${SITE_NAME}`;
const DESCRIPTION =
  'Design your own product: upload your art, place it your way, and create a real printed product — hoodies, tees, joggers, tote bags, posters, canvas and more.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/store/custom` },
  openGraph: {
    title: FULL_TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/store/custom`,
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

export default function CustomDesignerLayout({ children }) {
  return children;
}
