'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { StateMessage } from '@/components/ui/StateMessage';

/** Any unexpected error in a dashboard page. The sidebar and navigation stay usable. */
export default function DashboardError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StateMessage
      icon={AlertTriangle}
      title="Something went wrong"
      detail={error.digest ? `Reference: ${error.digest}` : undefined}
      actions={
        <>
          <button type="button" onClick={() => unstable_retry()} className="btn btn-primary">
            Try again
          </button>
          <Link href="/dashboard" className="btn btn-secondary">
            Go to Overview
          </Link>
        </>
      }
    >
      We couldn&apos;t load this page. Your data is safe — try again, or head back to the Overview.
    </StateMessage>
  );
}
