import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Link2 } from 'lucide-react';
import { StateMessage } from '@/components/ui/StateMessage';
import { getSessionWorkspace } from '@/lib/data/workspace';
import { getClientBySlug } from '@/lib/data/clients';
import { getPortalToken, portalPath } from '@/lib/data/portal';

export const metadata: Metadata = {
  title: 'Outbound report',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}

/**
 * The old, slug-only portal link. A slug is guessable, so it no longer opens a
 * report. Signed-in members of the client's workspace (RLS decides) are taken
 * to the secure link; everyone else is asked for the new link.
 */
export default async function LegacyPortalLink({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { preview } = await searchParams;

  const session = await getSessionWorkspace();
  if (session) {
    const client = await getClientBySlug(slug);
    const token = client ? await getPortalToken(session.supabase, client.id) : null;
    if (client && token) redirect(`${portalPath(client.slug, token)}${preview === 'true' ? '?preview=true' : ''}`);
  }

  return (
    <div className="min-h-screen bg-background">
      <StateMessage icon={Link2} title="This report has a new link">
        For your security, reports now open with a private link. Please ask your agency for the current link to your report.
      </StateMessage>
    </div>
  );
}
