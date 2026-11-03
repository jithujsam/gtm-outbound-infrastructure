import type { MetadataRoute } from 'next';

const base = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);

export default function robots(): MetadataRoute.Robots {
  // Previews are never indexed; production indexes the landing page and /resources.
  const production = process.env.VERCEL_ENV ? process.env.VERCEL_ENV === 'production' : process.env.NODE_ENV === 'production';
  return {
    rules: production ? { userAgent: '*', allow: ['/$', '/resources'], disallow: ['/api/', '/c/', '/auth/', '/dashboard', '/clients', '/campaigns', '/inbox', '/infrastructure', '/settings'] } : { userAgent: '*', disallow: '/' },
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
