import type { Metadata } from 'next';
import { MotionRoot } from '@/components/landing/motion';
import Hero from '@/components/landing/Hero';
import { Capabilities, FAQ, Faq, Footer, Honesty, How, Join, Nav, Problem, TourSection } from '@/components/landing/Sections';

import { LANDING_DESCRIPTION, LANDING_SOCIAL_DESCRIPTION, LANDING_TITLE } from '@/components/landing/seo';

// Canonical and og:url belong to this page only, not the root layout, which every route inherits.
// openGraph replaces the layout's object rather than merging, so it repeats the shared fields.
export const metadata: Metadata = {
  title: { absolute: LANDING_TITLE },
  description: LANDING_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: { title: LANDING_TITLE, description: LANDING_SOCIAL_DESCRIPTION, type: 'website', siteName: 'Klaroh', url: '/' },
};

// Structured data for Google. FAQPage reuses the on-page FAQ so the markup always matches visible text.
function structuredData(siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${siteUrl}/#org`, name: 'Klaroh', url: siteUrl, logo: `${siteUrl}/logo.svg` },
      { '@type': 'WebSite', '@id': `${siteUrl}/#site`, url: siteUrl, name: 'Klaroh', publisher: { '@id': `${siteUrl}/#org` } },
      {
        '@type': 'SoftwareApplication',
        name: 'Klaroh',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: LANDING_DESCRIPTION,
        url: siteUrl,
        publisher: { '@id': `${siteUrl}/#org` },
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
      },
    ],
  };
}

// The public landing page. Static: it reads no cookies and calls no APIs.
export default function Home() {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')).replace(/\/$/, '');
  return (
    <MotionRoot>
      {/* "<" is escaped so FAQ text can never close the script tag. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(siteUrl)).replace(/</g, '\\u003c') }} />
      {/* Without JS the reveal animations never run, so show everything. */}
      <noscript>
        <style>{'[data-reveal]{opacity:1!important;transform:none!important}'}</style>
      </noscript>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-primary">
        Skip to main content
      </a>
      <div id="top" className="bg-[#F2F5EF] font-[family-name:var(--font-geist)]">
        <Nav />
        <main id="main">
          <Hero />
          <Problem />
          <TourSection />
          <How />
          <Capabilities />
          <Honesty />
          <Faq />
          <Join />
        </main>
        <Footer />
      </div>
    </MotionRoot>
  );
}
