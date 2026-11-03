import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { MotionRoot } from '@/components/landing/motion';
import { Footer, Join, Nav } from '@/components/landing/Sections';
import { RESOURCES, getResource } from '@/content/resources';
import { formatDate, siteUrl } from '@/content/resources/site';

export const dynamicParams = false;

export function generateStaticParams() {
  return RESOURCES.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = getResource(slug);
  if (!r) return {};
  const path = `/resources/${r.slug}`;
  return {
    title: r.title,
    description: r.description,
    alternates: { canonical: path },
    openGraph: {
      title: r.title,
      description: r.description,
      type: 'article',
      siteName: 'Klaroh',
      url: path,
      publishedTime: r.published,
      modifiedTime: r.updated,
    },
    twitter: { card: 'summary_large_image', title: r.title, description: r.description },
  };
}

export default async function ResourcePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = getResource(slug);
  if (!r) notFound();

  const url = `${siteUrl}/resources/${r.slug}`;
  const related = r.related.map(getResource).filter((x): x is NonNullable<typeof x> => !!x);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: r.title,
        description: r.description,
        datePublished: r.published,
        dateModified: r.updated,
        mainEntityOfPage: url,
        author: { '@type': 'Organization', name: 'Klaroh', url: siteUrl },
        publisher: { '@type': 'Organization', name: 'Klaroh', url: siteUrl, logo: { '@type': 'ImageObject', url: `${siteUrl}/logo.svg` } },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Klaroh', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'Resources', item: `${siteUrl}/resources` },
          { '@type': 'ListItem', position: 3, name: r.title, item: url },
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
        <main id="main" className="px-4 pb-24 pt-32 md:px-8 md:pb-28 md:pt-40">
          <div className="mx-auto max-w-7xl">
            <nav aria-label="Breadcrumb" className="text-sm text-on-surface-variant">
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <li><Link href="/" className="lp-link inline-flex min-h-11 items-center hover:text-primary">Klaroh</Link></li>
                <li aria-hidden="true">/</li>
                <li><Link href="/resources" className="lp-link inline-flex min-h-11 items-center hover:text-primary">Resources</Link></li>
              </ol>
            </nav>

            <article className="mt-2 grid gap-12 lg:grid-cols-12 lg:gap-16">
              <header className="min-w-0 lg:col-span-12">
                <p className="text-sm font-medium text-primary-container">{r.category}</p>
                <h1 className="mt-4 max-w-5xl font-[family-name:var(--font-instrument)] text-[clamp(2.25rem,5vw,4rem)] leading-[1.05] tracking-tight text-on-surface [text-wrap:balance]">
                  {r.title}
                </h1>
                <p className="mt-6 text-sm text-on-surface-variant">
                  By Klaroh · {r.readingMinutes} min read · Published{' '}
                  <time dateTime={r.published}>{formatDate(r.published)}</time>
                  {r.updated !== r.published && (
                    <>
                      {' '}· Updated <time dateTime={r.updated}>{formatDate(r.updated)}</time>
                    </>
                  )}
                </p>
              </header>

              <aside className="lg:col-span-3 lg:row-start-2" aria-label="Contents">
                <nav className="lg:sticky lg:top-28" aria-label="Table of contents">
                  <p className="text-sm font-medium text-on-surface">In this article</p>
                  <ol className="mt-3 border-l border-outline-variant text-sm">
                    {r.sections.map((s) => (
                      <li key={s.id}>
                        <a href={`#${s.id}`} className="lp-link -ml-px block border-l border-transparent py-1.5 pl-4 text-on-surface-variant hover:border-primary hover:text-primary">
                          {s.title}
                        </a>
                      </li>
                    ))}
                    <li>
                      <a href="#sources" className="lp-link -ml-px block border-l border-transparent py-1.5 pl-4 text-on-surface-variant hover:border-primary hover:text-primary">
                        Sources
                      </a>
                    </li>
                  </ol>
                </nav>
              </aside>

              <div className="min-w-0 max-w-[44rem] lg:col-span-9 lg:col-start-4 lg:row-start-2">
                <div className="rounded-2xl border border-outline-variant bg-white p-6 md:p-8">
                  <p className="text-sm font-medium text-primary-container">The short answer</p>
                  <div className="rp mt-2">{r.summary}</div>
                </div>

                {r.sections.map((s) => (
                  <section key={s.id} id={s.id} className="mt-14 scroll-mt-28" aria-labelledby={`${s.id}-h`}>
                    <h2 id={`${s.id}-h`} className="font-[family-name:var(--font-instrument)] text-[clamp(1.75rem,3.2vw,2.5rem)] leading-tight tracking-tight text-on-surface [text-wrap:balance]">
                      {s.title}
                    </h2>
                    <div className="rp mt-4">{s.body}</div>
                  </section>
                ))}

                <section id="sources" className="mt-16 scroll-mt-28 border-t border-on-surface/80 pt-8" aria-labelledby="sources-h">
                  <h2 id="sources-h" className="text-lg font-semibold text-on-surface">Sources and limits</h2>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Product statements about Klaroh were checked against its current code on {formatDate(r.updated)}. Vendor pages change, so check them
                    again before relying on a figure.
                  </p>
                  <ul className="mt-4 space-y-4 text-sm leading-relaxed">
                    {r.sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4 [overflow-wrap:anywhere]">
                          {s.label}
                        </a>
                        <span className="mt-1 block text-on-surface-variant">{s.note}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {related.length > 0 && (
                  <section className="mt-16" aria-labelledby="related-h">
                    <h2 id="related-h" className="text-lg font-semibold text-on-surface">Keep reading</h2>
                    <ul className="mt-4 border-t border-on-surface/80">
                      {related.map((x) => (
                        <li key={x.slug} className="border-b border-outline-variant">
                          <Link href={`/resources/${x.slug}`} className="group flex min-h-11 items-center justify-between gap-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                            <span>
                              <span className="block text-xs font-medium text-primary-container">{x.category}</span>
                              <span className="block text-base font-medium text-on-surface group-hover:text-primary">{x.title}</span>
                            </span>
                            <ArrowRight size={18} className="shrink-0 text-primary transition-transform group-hover:translate-x-1" aria-hidden="true" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <Link href="/resources" className="lp-link mt-10 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline">
                  <ArrowLeft size={16} aria-hidden="true" /> All resources
                </Link>
              </div>
            </article>
          </div>
        </main>
        <Join />
        <Footer home />
      </div>
    </MotionRoot>
  );
}
