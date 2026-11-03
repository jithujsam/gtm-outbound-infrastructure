import type { MetadataRoute } from 'next';
import { RESOURCES } from '@/content/resources';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')).replace(/\/$/, '');
  const latest = RESOURCES.reduce((m, r) => (r.updated > m ? r.updated : m), RESOURCES[0]?.updated ?? '');
  return [
    { url: base, changeFrequency: 'monthly', priority: 1 },
    { url: `${base}/resources`, lastModified: latest, changeFrequency: 'monthly', priority: 0.8 },
    ...RESOURCES.map((r) => ({ url: `${base}/resources/${r.slug}`, lastModified: r.updated, changeFrequency: 'monthly' as const, priority: 0.7 })),
  ];
}
