import { Inter } from "next/font/google";
import './globals.css';
import EconomyHeartbeat from '@/components/economy/EconomyHeartbeat';
import LingeringDecayHeartbeat from '@/components/anti-life/LingeringDecay';
import { RadioProvider } from '@/components/radio/RadioProvider';
import RadioBar from '@/components/radio/RadioBar';
import BroadcastListener from '@/components/broadcast/BroadcastListener';
import NativeBridge from '@/components/NativeBridge';
import BugReportButton from '@/components/BugReportButton';
import RealmCalloutGuard from '@/components/RealmCalloutGuard';
import MusePortal from '@/components/MusePortal';
import Concourse from '@/components/Concourse';
import JsonLd from '@/components/JsonLd';
import { LanguageProvider } from '@/lib/i18n';

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
        {/* LanguageProvider lives at the ROOT (Merlin, 2026-10-21):
            layout-level components (the Concourse, the season pill)
            translate too — page.jsx keeps its nested instance; both
            initialize from the same localStorage language. */}
        <LanguageProvider>
        <RadioProvider>
          <NativeBridge />
          <EconomyHeartbeat />
          {/* Lingering decay (Merlin, 2026-11-15): a visit to
              Anti-Life leaves a 10-minute decay that follows the
              user everywhere — the heartbeat owns the timer, the
              drain overlay, the shared spots, and infection. */}
          <LingeringDecayHeartbeat />
          {/* The Doomsday countdown moved into the top of the
              Concourse, styled gold (Merlin, 2026-10-20) — see
              DoomsdayStrip in components/DoomsdayBanner.jsx, rendered
              by components/Concourse.jsx. Hub-only, removes itself
              when the lock lifts on Dec 11. */}
          {children}
          <RadioBar />
          <BroadcastListener />
          <BugReportButton concourse />
          <MusePortal concourse />
          {/* The Concourse: one glass holoframe housing every hub
              floater (Orb + tiles + pins). See components/Concourse.jsx. */}
          <Concourse />
        </RadioProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}



