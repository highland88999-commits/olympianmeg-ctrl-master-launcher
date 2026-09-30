import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Silver Glass Comms',
  description: 'P2P WebRTC Audio & Message Terminal',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SGC',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="antialiased w-screen h-dvh overflow-hidden bg-black text-slate-200">
      {children}
    </div>
  );
}


