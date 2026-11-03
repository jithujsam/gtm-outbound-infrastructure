import { SearchX } from 'lucide-react';
import { StateMessage } from '@/components/ui/StateMessage';

/** An unknown or revoked report link. Written for the agency's client. */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-background">
      <StateMessage icon={SearchX} title="This report link isn't valid">
        The link may have been replaced or is incomplete. Please ask your agency for the current link to your report.
      </StateMessage>
    </div>
  );
}
