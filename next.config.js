/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Phase 1 uniformity audit: Next.js sends `x-powered-by: Next.js`
  // on every response by default. It names the framework (and, to a
  // prober, narrows the version hunt). Off: responses carry no
  // framework banner at all.
  poweredByHeader: false,

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
  // /settlers-of-olympus is gone (Merlin, Nov 20, 2026 — the Starforge
  // reskin): the game was renamed Starforge outright, route /starforge.
  // The redirect keeps every bookmark and old link landing on the game.
  // The settlers_rooms table and /api/settlers/rooms routes are untouched
  // (server-only; the table name is not a user-facing route).
  async redirects() {
    return [
      {
        source: '/settlers-of-olympus',
        destination: '/starforge',
        permanent: true,
      },
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
