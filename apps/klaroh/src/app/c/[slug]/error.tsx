'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { StateMessage } from '@/components/ui/StateMessage';

/** Public client dashboard failed to load. Written for the agency's client, not the agency. */
export default function PortalError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background">
      <StateMessage
        icon={AlertTriangle}
        title="This report couldn’t be loaded"
        detail={error.digest ? `Reference: ${error.digest}` : undefined}
        actions={
          <button type="button" onClick={() => unstable_retry()} className="btn btn-primary">
            Try again
          </button>
        }
      >
        Something went wrong on our side. Please try again in a moment — if it keeps happening, let your agency know.
      </StateMessage>
    </div>
  );
}
