import { Inter } from "next/font/google";
import './globals.css';
import EconomyHeartbeat from '@/components/economy/EconomyHeartbeat';
import { RadioProvider } from '@/components/radio/RadioProvider';
import RadioBar from '@/components/radio/RadioBar';

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: 'NEXUS VORTEX | Master Hub',
  description: 'Orbital Launcher for Pocket Universes',
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
        <RadioProvider>
          <EconomyHeartbeat />
          {children}
          <RadioBar />
        </RadioProvider>
      </body>
    </html>
  );
}


