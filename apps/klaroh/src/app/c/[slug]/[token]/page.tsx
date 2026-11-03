import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PauseCircle } from 'lucide-react';
import PortalView from '@/components/portal/PortalView';
import { StateMessage } from '@/components/ui/StateMessage';
import { getPortalConversations, getPortalReport, portalPath } from '@/lib/data/portal';

// A private report: never indexed, and the token-bearing URL is never sent as a referrer.
export const metadata: Metadata = {
  title: 'Outbound report',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

interface PageProps {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ preview?: string; view?: string }>;
}

/**
 * The client portal. The random token authorizes; the slug only makes the
 * link readable (a renamed client's old slug redirects to the current one).
 */
export default async function ClientPortalPage({ params, searchParams }: PageProps) {
  const { slug, token } = await params;
  const { preview, view } = await searchParams;

  const lookup = await getPortalReport(token);
  if (lookup.kind === 'missing') notFound();
  if (lookup.kind === 'inactive') {
    return (
      <div className="min-h-screen bg-background">
        <StateMessage icon={PauseCircle} title="This report is not available right now">
          Reporting for this account is currently paused. Please contact your agency if you have any questions.
        </StateMessage>
      </div>
    );
  }

  const { report } = lookup;
  const path = portalPath(report.slug, token);
  const qs = new URLSearchParams({ ...(view ? { view } : {}), ...(preview ? { preview } : {}) }).toString();
  if (decodeURIComponent(slug) !== report.slug) redirect(qs ? `${path}?${qs}` : path);

  const mode = view === 'simple' ? 'simple' : view === 'detailed' ? 'advanced' : report.settings.mode;
  const conversations = report.settings.showConversations ? await getPortalConversations(token) : null;
  return <PortalView report={report} conversations={conversations} view={mode} preview={preview === 'true'} basePath={path} />;
}
