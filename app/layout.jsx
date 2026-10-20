import { Inter } from "next/font/google";
import './globals.css';
import EconomyHeartbeat from '@/components/economy/EconomyHeartbeat';
import { RadioProvider } from '@/components/radio/RadioProvider';
import RadioBar from '@/components/radio/RadioBar';
import NativeBridge from '@/components/NativeBridge';
import BugReportButton from '@/components/BugReportButton';
import RealmCalloutGuard from '@/components/RealmCalloutGuard';
import DoomsdayBanner from '@/components/DoomsdayBanner';
import MusePortal from '@/components/MusePortal';
import Concourse from '@/components/Concourse';
import JsonLd from '@/components/JsonLd';

const inter = Inter({ subsets: ["latin"] });

const SITE_URL = 'https://olympusverse.com';
const SITE_DESCRIPTION = 'NEXUS VORTEX is the master hub for 135 pocket universes — explorable 3D worlds spanning battle arenas, music stages, shopping districts, forges, wisdom archives, deep-space expeditions, sanctuaries, arcades, markets, and living cities, all launching from one orbital menu.';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'NEXUS VORTEX | Master Hub',
    template: '%s | NEXUS VORTEX',
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'NEXUS VORTEX',
    'pocket universes',
    '3D worlds',
    'metaverse',
    'browser games',
    'virtual worlds',
    'Olympus',
    'online games',
    'virtual shopping',
    'digital art',
  ],
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'NEXUS VORTEX',
  },
  openGraph: {
    title: 'NEXUS VORTEX | Master Hub',
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: 'NEXUS VORTEX',
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 600,
        alt: 'NEXUS VORTEX — master hub for 135 pocket universes',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NEXUS VORTEX | Master Hub',
    description: SITE_DESCRIPTION,
    images: ['/og-image.png'],
  },
  // No global canonical here (SEO fix, 2026-10-13): a layout-level canonical
  // is inherited by EVERY route, so all subpages used to declare the
  // homepage as their canonical URL. Per-route canonicals are owned by
  // route layouts and lib/seo.js programMetadata().
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport = {
  themeColor: '#050505',
  width: "device-width",
  initialScale: 1,
  // NOTE (mobile program 2026-09-29): maximumScale/userScalable deliberately
  // absent — pinch zoom must stay available (WCAG). Do not re-add.
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#050505] antialiased text-white`}>
        <JsonLd />
        {/* iOS long-press callout + selection kill for realm/game views
            (auto-detects full-viewport game canvases; chat/forms/inputs
            keep working). Mounted once — every realm inherits it. */}
        <RealmCalloutGuard />
        <RadioProvider>
          <NativeBridge />
          <EconomyHeartbeat />
          {/* Doomsday banner: Christmas-unlock countdown. HUB-ONLY —
              the component gates itself to the main hub route "/" and
              renders nothing inside pocket universes or programs
              (Merlin, 2026-10-14). Removes itself on Dec 11. A banner,
              never a modal. */}
          <DoomsdayBanner />
          {children}
          <RadioBar />
          <BugReportButton concourse />
          <MusePortal concourse />
          {/* The Concourse: one glass holoframe housing every hub
              floater (Orb + tiles + pins). See components/Concourse.jsx. */}
          <Concourse />
        </RadioProvider>
      </body>
    </html>
  );
}



