import { Inter } from "next/font/google";
import './globals.css';

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: 'NEXUS VORTEX | Master Hub',
  description: 'Orbital Launcher for Pocket Universes',
};

export const viewport = {
  themeColor: '#050505',
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#050505] antialiased text-white`}>
        {children}
      </body>
    </html>
  );
}


