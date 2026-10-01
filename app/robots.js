// app/robots.js — crawler rules for olympusverse.com.
import { SEO_SITE } from '@/lib/seo';

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    sitemap: `${SEO_SITE.url}/sitemap.xml`,
  };
}
