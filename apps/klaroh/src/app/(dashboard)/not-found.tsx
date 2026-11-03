import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { StateMessage } from '@/components/ui/StateMessage';

/** A dashboard record (campaign or client) that doesn't exist or was removed. */
export default function DashboardNotFound() {
  return (
    <StateMessage
      icon={SearchX}
      title="Page not found"
      actions={
        <>
          <Link href="/dashboard" className="btn btn-primary">
            Go to Overview
          </Link>
          <Link href="/clients" className="btn btn-secondary">
            Clients
          </Link>
        </>
      }
    >
      This page doesn&apos;t exist, or it was removed. Check the link, or pick up from the Overview.
    </StateMessage>
  );
}
