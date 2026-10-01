// components/JsonLd.jsx — site-wide structured data (server component).
//
// Emits Organization + WebSite schema on every page via the root layout.
// Keep this dependency-free and static: crawlers read it, users never see it.

export default function JsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'NEXUS VORTEX',
        url: 'https://olympusverse.com',
      },
      {
        '@type': 'WebSite',
        name: 'NEXUS VORTEX',
        url: 'https://olympusverse.com',
        inLanguage: 'en',
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
