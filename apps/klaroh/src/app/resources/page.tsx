import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { MotionRoot } from '@/components/landing/motion';
import { Footer, Join, Nav } from '@/components/landing/Sections';
import { RESOURCES } from '@/content/resources';
import { formatDate, siteUrl } from '@/content/resources/site';

const TITLE = 'Resources for cold email agencies';
const DESCRIPTION =
  'Practical guides on client reporting, cold email metrics and choosing reporting tools, written for cold email agencies and GTM teams.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/resources' },
  openGraph: { title: `${TITLE} · Klaroh`, description: DESCRIPTION, type: 'website', siteName: 'Klaroh', url: '/resources' },
};

const CATEGORIES = ['Client reporting', 'Metrics', 'Choosing tools'] as const;

export default function ResourcesHub() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: TITLE,
        description: DESCRIPTION,
        url: `${siteUrl}/resources`,
        isPartOf: { '@type': 'WebSite', name: 'Klaroh', url: siteUrl },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Klaroh', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'Resources', item: `${siteUrl}/resources` },
        ],
      },
    ],
  };
  return (
    <MotionRoot>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-primary">
        Skip to main content
      </a>
      <div className="lp-paper font-[family-name:var(--font-geist)]">
        <Nav home />
        <main id="main" className="px-4 pb-24 pt-32 md:px-8 md:pb-32 md:pt-40">
          <div className="mx-auto max-w-7xl">
            <header className="max-w-4xl">
              <p className="text-sm font-medium text-primary-container">Resources</p>
              <h1 className="lp-h2 mt-4 text-on-surface">
                Reporting and metrics, <em className="text-primary-container">explained for agencies.</em>
              </h1>
              <p className="lp-lede mt-6 max-w-2xl text-on-surface-variant">
                Guides for cold email agency owners and GTM teams who report to clients: how to build the report, what
                the numbers mean, and how to choose a setup. Written to be useful whether or not you ever use Klaroh.
              </p>
              <ul className="mt-8 flex flex-wrap gap-2" aria-label="Topics">
                {CATEGORIES.map((c) => (
                  <li key={c} className="rounded-full border border-outline-variant bg-white px-4 py-1.5 text-sm text-on-surface-variant">
                    {c}
                  </li>
                ))}
              </ul>
            </header>

            <ol className="mt-16 border-t border-on-surface/80">
              {RESOURCES.map((r, i) => (
                <li key={r.slug} className="border-b border-outline-variant">
                  <Link
                    href={`/resources/${r.slug}`}
                    className="group grid gap-4 py-8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:grid-cols-12 md:gap-10 md:py-10"
                  >
                    <span className="text-sm font-medium text-primary-container md:col-span-2 md:pt-2">
                      <span className="tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                      <span className="mx-2 text-outline" aria-hidden="true">/</span>
                      {r.category}
                    </span>
                    <span className="md:col-span-8">
                      <span className="block font-[family-name:var(--font-instrument)] text-3xl leading-tight text-on-surface transition-colors group-hover:text-primary md:text-4xl">
                        {r.title}
                      </span>
                      <span className="mt-3 block max-w-2xl text-base leading-relaxed text-on-surface-variant">{r.description}</span>
                      <span className="mt-4 block text-sm text-on-surface-variant">
                        {r.readingMinutes} min read · Updated {formatDate(r.updated)}
                      </span>
                    </span>
                    <span className="hidden items-start justify-end pt-2 text-primary md:col-span-2 md:flex" aria-hidden="true">
                      <ArrowRight className="transition-transform group-hover:translate-x-1" size={22} />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </main>
        <Join />
        <Footer home />
      </div>
    </MotionRoot>
  );
}
