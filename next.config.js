/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // /weapons-forge is gone (Merlin, Nov 15, 2026): the page was
  // removed and replaced with the real forge's functions at
  // /world-engine/weapons. The redirect keeps every bookmark and
  // old link landing on the forge. It matches the page path only —
  // the kept commission API (/api/weapons-forge/commission) is
  // untouched.
  //
  // /portal-room is gone (Merlin, Nov 16, 2026 — the portal menu
  // merge): the 2D Portal Room was deleted and the Concourse's
  // Portals 3D hall is the one portal menu. The redirect lands
  // every bookmark and old link on the hub with the hall open
  // (concourse=1 collapses the hub program menu so it cannot cover
  // the sheet; portals3d=1 opens the hall — see the deep link in
  // components/Concourse.jsx).
  async redirects() {
    return [
      {
        source: '/weapons-forge',
        destination: '/world-engine/weapons',
        permanent: true,
      },
      {
        source: '/portal-room',
        destination: '/?concourse=1&portals3d=1',
        permanent: true,
      },
    ];
  },

  images: {
    // Prerequisite for the <img> -> next/image migration (Phase 2b).
    // Local public/ assets need no config; these cover partner/remote art.
    remotePatterns: [
      { protocol: 'https', hostname: 'a.impactradius-go.com' },
      { protocol: 'https', hostname: '**.pxf.io' },
      { protocol: 'https', hostname: '**.sjv.io' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  experimental: {
    // Trim the three.js / icon / motion barrel imports that bloat every route.
    optimizePackageImports: [
      '@react-three/drei',
      '@react-three/fiber',
      '@react-three/postprocessing',
      'lucide-react',
      'framer-motion',
      'three',
    ],
  },

  compiler: {
    // Strip console.* in production builds; keep error/warn.
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },
};

module.exports = nextConfig;
