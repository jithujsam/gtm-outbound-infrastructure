import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { StateMessage } from '@/components/ui/StateMessage';

/** Any URL that matches no route. */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-background">
      <StateMessage
        icon={SearchX}
        title="Page not found"
        actions={
          <Link href="/dashboard" className="btn btn-primary">
            Go to Overview
          </Link>
        }
      >
        This page doesn&apos;t exist, or it was removed.
      </StateMessage>
    </div>
  );
}
