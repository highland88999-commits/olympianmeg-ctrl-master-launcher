/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // /weapons-forge is gone (Merlin, Nov 15, 2026): the page was
  // removed and replaced with the real forge's functions at
  // /world-engine/weapons. The redirect keeps every bookmark and
  // old link landing on the forge. It matches the page path only —
  // the kept commission API (/api/weapons-forge/commission) is
  // untouched.
  async redirects() {
    return [
      {
        source: '/weapons-forge',
        destination: '/world-engine/weapons',
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
